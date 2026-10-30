// Drives the real page in headless Chromium. Run from the repo root:
//   node declutter-and-sell-tracker-for-second-hand-items/ui-test.js [--base http://localhost:8765] [--shots]
// --base defaults to a local server you start yourself (python3 -m http.server 8765 in the repo root).
// --shots also saves screenshots/desktop.png and screenshots/phone.png.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const args = process.argv.slice(2);
const bi = args.indexOf('--base'), BASE = (bi >= 0 ? args[bi + 1] : 'http://localhost:8765').replace(/\/$/, '');
const URL = BASE + '/declutter-and-sell-tracker-for-second-hand-items/';
const KEY = 'declutter-and-sell-tracker-for-second-hand-items.state';
const DIR = __dirname;
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; if (!cond) console.log('FAIL ' + name + (extra ? '  ' + extra : '')); };
const NOW = new Date('2026-10-30T10:00:00');

async function open(browser, width, opts) {
    opts = opts || {};
    const ctx = await browser.newContext({ viewport: { width, height: width < 600 ? 800 : 900 }, deviceScaleFactor: opts.scale || 1, colorScheme: opts.scheme || 'dark', locale: 'en-GB', acceptDownloads: true });
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE }).catch(() => {});
    await ctx.route(/goatcounter\.com|gc\.zgo\.at/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
    const page = await ctx.newPage();
    await page.clock.setFixedTime(opts.now || NOW);
    page.errors = [];
    page.on('pageerror', e => page.errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') page.errors.push(m.text()); });
    page.bad = [];
    page.on('response', r => { if (r.status() >= 400 && r.url().startsWith(BASE)) page.bad.push(r.status() + ' ' + r.url()); });
    if (opts.block) await page.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
    if (opts.state !== undefined) await page.addInitScript(([k, v]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, v); sessionStorage.setItem('seeded', '1'); } }, [KEY, opts.state]);
    await page.goto(URL, { waitUntil: 'load' });
    return page;
}
const saved = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
const card = (page, name) => page.locator('.item', { has: page.locator('.it-name', { hasText: new RegExp('^' + name.replace(/[()+]/g, '\\$&') + '$') }) });
const text = async (page, sel) => (await page.locator(sel).first().innerText()).replace(/\s+/g, ' ').trim();
const ctext = async loc => (await loc.innerText()).replace(/\s+/g, ' ').trim();

// realistic state: Ayesha clearing out the flat before a move, on Fri 30 Oct 2026
const T = '2026-10-30';
const I = (id, name, x) => Object.assign({ id, name, st: 'sale', listed: '2026-10-12', sites: [], note: '', prices: [], min: null, photo: '', dep: 0, offers: [], log: [], deal: null, done: null }, x || {});
const DONE = (d, who, c, x) => Object.assign({ d, who, c, swap: '', bundle: null }, x || {});
const REAL = { v: 1, cur: '', items: [
    I('cot', 'Baby cot with mattress', { listed: '2026-10-10', sites: ['OLX', 'Facebook Marketplace'], prices: [{ d: '2026-10-10', c: 900000 }], st: 'reserved', note: 'Wooden cot, mattress included. Collect from Gulberg.',
        offers: [{ id: 'o1', who: 'Ali', c: 750000, d: '2026-10-27', st: 'accepted' }], deal: { who: 'Ali', c: 800000, pick: '2026-10-31', paid: 200000, d: '2026-10-28' } }),
    I('sofa', 'Sofa set (3 seater)', { listed: '2026-10-12', sites: ['OLX'], prices: [{ d: '2026-10-12', c: 2800000 }, { d: '2026-10-24', c: 2500000 }], min: 2200000,
        offers: [{ id: 'o2', who: 'Hamza', c: 2000000, d: '2026-10-28', st: 'open' }, { id: 'o3', who: 'Sara', c: 2300000, d: '2026-10-29', st: 'open' }] }),
    I('tread', 'Treadmill', { listed: '2026-10-08', sites: ['Facebook Marketplace'], prices: [{ d: '2026-10-08', c: 3500000 }] }),
    I('bike', 'Kids bicycle', { listed: '2026-10-20', sites: ['OLX', 'WhatsApp group'], prices: [{ d: '2026-10-20', c: 600000 }] }),
    I('micro', 'Microwave', { listed: '2026-10-09', sites: ['OLX'], prices: [{ d: '2026-10-09', c: 600000 }], st: 'sold', done: DONE('2026-10-18', 'Usman', 550000) }),
    I('table', 'Study table', { listed: '2026-10-11', sites: ['Facebook Marketplace'], prices: [{ d: '2026-10-11', c: 500000 }], st: 'sold', done: DONE('2026-10-22', 'Nadia', 437500, { bundle: 'b1' }) }),
    I('chair', 'Study chair', { listed: '2026-10-11', sites: ['Facebook Marketplace'], prices: [{ d: '2026-10-11', c: 300000 }], st: 'sold', done: DONE('2026-10-22', 'Nadia', 262500, { bundle: 'b1' }) }),
    I('dining', 'Dining table (6 chairs)', { listed: '2026-10-05', sites: ['OLX', 'Facebook Marketplace'], prices: [{ d: '2026-10-05', c: 1500000 }, { d: '2026-10-19', c: 1300000 }], st: 'sold', done: DONE('2026-10-26', 'Kamran', 1200000) }),
    I('clothes', 'Winter clothes (2 bags)', { listed: '2026-10-15', st: 'given', done: DONE('2026-10-25', 'Edhi centre', 0) })] };
// money made 5,500 + 4,375 + 2,625 + 12,000 = 24,500; first asked 6,000 + 5,000 + 3,000 + 15,000 = 29,000, 84%

async function overlaps(page, sel) {
    return page.evaluate(sel => {
        const els = [...document.querySelectorAll(sel)].filter(e => e.offsetParent !== null), bad = [];
        for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
            if (els[i].contains(els[j]) || els[j].contains(els[i])) continue;
            const a = els[i].getBoundingClientRect(), b = els[j].getBoundingClientRect();
            if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) bad.push((els[i].id || els[i].textContent.slice(0, 20)) + ' / ' + (els[j].id || els[j].textContent.slice(0, 20)));
        }
        return bad;
    }, sel);
}
const noHScroll = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

(async () => {
    const browser = await chromium.launch();

    // ---------- first use: Ayesha starts from nothing ----------
    let page = await open(browser, 390);
    ok('intro shown on first use', await page.locator('#intro').isVisible());
    ok('totals hidden on first use', !(await page.locator('#sum').isVisible()));
    ok('optional details are hidden, not forced', !(await page.locator('#a-more').isVisible()) && !(await page.locator('#a-min').isVisible()));
    ok('restore link offered on first use', await page.locator('#restore-first').isVisible());
    await page.click('#a-save');
    ok('blank name refused', (await text(page, '#a-name-err')).startsWith('Type what you are selling'));
    await page.fill('#a-name', 'Baby cot'); await page.fill('#a-price', '-9000'); await page.click('#a-save');
    ok('negative price refused', (await text(page, '#a-price-err')).includes('minus'));
    await page.fill('#a-price', '9,000');
    await page.click('#a-sites >> text=OLX'); await page.click('#a-sites >> text=Facebook Marketplace');
    await page.fill('#a-other', 'Shpock');
    await page.click('#a-save');
    let cot = card(page, 'Baby cot');
    ok('cot added in its own box', await cot.count() === 1);
    ok('cot shows price and places', (await ctext(cot)).includes('9,000') && (await ctext(cot)).includes('OLX, Facebook Marketplace, Shpock'));
    ok('form cleared after adding', await page.inputValue('#a-name') === '' && await page.inputValue('#a-other') === '');
    ok('chosen sites remembered for the next item', await page.locator('#a-sites .chip.on').count() === 2);
    ok('totals appear', await page.locator('#sum').isVisible() && (await text(page, '#sum-list')).includes('For sale 1 item, asking 9,000'));

    // an offer
    await cot.locator('button', { hasText: '+ Offer' }).click();
    await page.fill('[id^="o-"][id$="w"]', 'Ali'); await page.fill('[id^="o-"][id$="c"]', '');
    await cot.locator('button', { hasText: 'Save offer' }).click();
    ok('offer with no amount refused', (await ctext(cot)).includes('Type the amount they offered'));
    await page.fill('[id^="o-"][id$="c"]', '7000');
    ok('offer note shows the gap', (await ctext(cot)).includes('2,000 less than you are asking'));
    await page.keyboard.press('Enter');
    ok('offer listed', (await ctext(cot)).includes('Ali offered 7,000'));
    ok('offers to answer counted', (await text(page, '#sum-list')).includes('Offers to answer 1'));

    // accept: reserve with deposit and collection day
    await cot.locator('button', { hasText: 'Accept' }).click();
    ok('reserve form prefilled from the offer', await page.inputValue('[id^="r-"][id$="w"]') === 'Ali' && await page.inputValue('[id^="r-"][id$="c"]') === '7000');
    await page.fill('[id^="r-"][id$="c"]', '8000'); await page.fill('[id^="r-"][id$="p"]', '2026-10-31'); await page.fill('[id^="r-"][id$="d"]', '9000');
    await cot.locator('button', { hasText: 'Reserve it' }).click();
    ok('deposit above the price refused', (await ctext(cot)).includes('The deposit is more than the price agreed'));
    await page.fill('[id^="r-"][id$="d"]', '2000');
    await cot.locator('button', { hasText: 'Reserve it' }).click();
    cot = card(page, 'Baby cot');
    ok('cot moved to Waiting to be collected', await page.locator('#res-list .item').count() === 1);
    ok('reserved card answer', (await ctext(cot)).includes('Reserved for Ali at 8,000 (you asked 9,000)') && (await ctext(cot)).includes('Collecting tomorrow (Sat 31 Oct)') && (await ctext(cot)).includes('2,000 deposit paid, 6,000 to collect'));
    ok('to collect in the totals', (await text(page, '#sum-list')).includes('Waiting to be collected 1 item, 6,000 to collect'));
    ok('offer marked accepted', (await ctext(cot)).length > 0 && (await saved(page)).items[0].offers[0].st === 'accepted');

    // collected and paid
    await cot.locator('button', { hasText: 'Collected and paid' }).click();
    ok('sold form prefilled with the deal', await page.inputValue('[id^="s-"][id$="c"]') === '8000' && await page.inputValue('[id^="s-"][id$="w"]') === 'Ali');
    await cot.locator('button', { hasText: 'Save as sold' }).click();
    ok('money made 8,000', await text(page, '#sum-big') === '8,000');
    ok('% of asking 89', (await text(page, '#sum-sub')).includes('From 1 item sold, 89% of what you first asked.'));
    ok('reminder to take ads down', (await text(page, '#res-msg')).includes('Remember to take the ad down on OLX, Facebook Marketplace, Shpock'));
    ok('sold card wording', (await text(page, '#done-list .item')).includes('Sold to Ali today for 8,000 (first asked 9,000)'));
    // undo and redo
    await page.click('#res-msg .undo');
    ok('undo puts it back to reserved', await page.locator('#res-list .item').count() === 1 && await text(page, '#sum-big') === '0');
    await card(page, 'Baby cot').locator('button', { hasText: 'Collected and paid' }).click();
    await card(page, 'Baby cot').locator('button', { hasText: 'Save as sold' }).click();
    ok('sold again', await text(page, '#sum-big') === '8,000');

    // a bundle: high chair (3,000) + baby bath (no price) for 4,000 -> equal shares
    for (const [n, pr] of [['High chair', '3000'], ['Baby bath', '']]) { await page.fill('#a-name', n); await page.fill('#a-price', pr); await page.click('#a-save'); }
    ok('no price shows Offers wanted', (await ctext(card(page, 'Baby bath'))).includes('Offers wanted'));
    const hc = card(page, 'High chair');
    await hc.locator('button', { hasText: 'Mark as sold' }).click();
    await hc.locator('button', { hasText: '+ Sold together with other items' }).click();
    await hc.locator('label.check', { hasText: 'Baby bath' }).locator('input').check();
    await page.fill('[id^="s-"][id$="c"]', '4000');
    ok('split preview', (await ctext(hc)).includes('Split: High chair 2,000, Baby bath 2,000.'));
    await hc.locator('button', { hasText: 'Save as sold' }).click();
    let st = await saved(page);
    ok('bundle saved to the cent', st.items.filter(i => i.done && i.done.bundle).map(i => i.done.c).join() === '200000,200000');
    ok('money made 12,000', await text(page, '#sum-big') === '12,000');
    ok('bundle partner named', (await ctext(card(page, 'High chair'))).includes('Sold together with Baby bath'));

    // price drop due, then lower by 10%
    await page.click('#a-more-open');
    await page.fill('#a-name', 'Treadmill'); await page.fill('#a-price', '35000'); await page.fill('#a-listed', '2026-11-05');
    await page.click('#a-save');
    ok('future listed date refused', (await text(page, '#a-listed-err')).includes('today or an earlier day'));
    await page.fill('#a-listed', '2026-10-01'); await page.fill('#a-min', '40000'); await page.click('#a-save');
    ok('lowest above asking refused', (await text(page, '#a-min-err')).includes('more than the asking price'));
    await page.fill('#a-min', '30000'); await page.click('#a-save');
    let tr = card(page, 'Treadmill');
    ok('price drop due shown', (await ctext(tr)).includes('Price drop due: same price for 29 days and no offers.'));
    ok('price drop counted', (await text(page, '#sum-list')).includes('Price drop due 1 item'));
    await tr.locator('button', { hasText: 'Change price' }).click();
    await tr.locator('button', { hasText: '10% less: 31,500' }).click();
    await tr.locator('button', { hasText: 'Save price' }).click();
    tr = card(page, 'Treadmill');
    ok('price trail and note gone', (await ctext(tr)).includes('Was 35,000, now 31,500') && !(await ctext(tr)).includes('Price drop due'));
    await tr.locator('button', { hasText: 'Change price' }).click();
    await page.fill('[id^="p-"]', '25000');
    ok('below lowest warned', (await ctext(tr)).includes('Below the lowest you said you would take (30,000)'));
    await tr.locator('button', { hasText: 'Cancel' }).click();
    // offer below the lowest price is marked
    await tr.locator('button', { hasText: '+ Offer' }).click();
    await page.fill('[id^="o-"][id$="c"]', '20000'); await tr.locator('button', { hasText: 'Save offer' }).click();
    ok('offer below lowest marked, no name is fine', (await ctext(card(page, 'Treadmill'))).includes('Someone offered 20,000') && (await ctext(card(page, 'Treadmill'))).includes('Below your lowest price (30,000)'));
    await card(page, 'Treadmill').locator('button', { hasText: 'Decline' }).click();
    ok('declined offer shown muted', (await ctext(card(page, 'Treadmill'))).includes('declined'));

    // a buyer who does not come, without and with a deposit
    await page.fill('#a-name', 'Lamp'); await page.fill('#a-price', '1000'); await page.click('#a-save');
    let lamp = card(page, 'Lamp');
    await lamp.locator('button', { hasText: 'Reserve for a buyer' }).click();
    await lamp.locator('button', { hasText: 'Reserve it' }).click();
    ok('reserve needs a buyer name', (await ctext(lamp)).includes('Type the buyer\'s name'));
    await page.fill('[id^="r-"][id$="w"]', 'Zara'); await lamp.locator('button', { hasText: 'Reserve it' }).click();
    await card(page, 'Lamp').locator('button', { hasText: 'Buyer did not come' }).click();
    lamp = card(page, 'Lamp');
    ok('no-show: back on sale with a note', await page.locator('#sale-list .item', { hasText: 'Lamp' }).count() === 1 && (await ctext(lamp)).includes('Zara did not come (Fri 30 Oct).'));
    await lamp.locator('button', { hasText: 'Reserve for a buyer' }).click();
    await page.fill('[id^="r-"][id$="w"]', 'Omar'); await page.fill('[id^="r-"][id$="d"]', '200'); await lamp.locator('button', { hasText: 'Reserve it' }).click();
    await card(page, 'Lamp').locator('button', { hasText: 'Buyer did not come' }).click();
    await card(page, 'Lamp').locator('button', { hasText: 'Kept the deposit' }).click();
    ok('kept deposit added to money made', await text(page, '#sum-big') === '12,200' && (await text(page, '#sum-sub')).includes('Includes 200 in kept deposits'));

    // a swap; 0 without a swap is refused
    await page.fill('#a-name', 'Toys box'); await page.fill('#a-price', '2000'); await page.click('#a-save');
    const toys = card(page, 'Toys box');
    await toys.locator('button', { hasText: 'Mark as sold' }).click();
    await page.fill('[id^="s-"][id$="c"]', '0'); await toys.locator('button', { hasText: 'Save as sold' }).click();
    ok('0 without a swap refused', (await ctext(toys)).includes('use Given away instead'));
    await toys.locator('button', { hasText: '+ Swapped it for something' }).click();
    await page.fill('[id^="s-"][id$="s"]', 'Child car seat'); await toys.locator('button', { hasText: 'Save as sold' }).click();
    ok('swap saved, % unchanged', (await ctext(card(page, 'Toys box'))).includes('swapped for Child car seat') && (await text(page, '#sum-sub')).includes('89%') === false);
    // 8,000 + 4,000 of 9,000 + 3,000 (bath has no price, its 2,000 is left out of the %): priced sold 8,000 + 2,000 = 10,000 of 12,000 = 83%
    ok('% leaves out swaps and unpriced items', (await text(page, '#sum-sub')).includes('83% of what you first asked'));

    // give away and keep (under More)
    await page.fill('#a-name', 'Old clothes'); await page.click('#a-save');
    await card(page, 'Old clothes').locator('button', { hasText: 'More' }).click();
    await card(page, 'Old clothes').locator('button', { hasText: 'Given away' }).click();
    await page.fill('[id^="g-"]', 'Charity shop'); await page.keyboard.press('Enter');
    ok('given away tab', (await text(page, '#done-list')).includes('Given away to Charity shop today') && await page.locator('#tab-given.on').count() === 1);
    await card(page, 'Lamp').locator('button', { hasText: 'More' }).click();
    await card(page, 'Lamp').locator('button', { hasText: 'I will keep it' }).click();
    ok('kept tab', (await text(page, '#done-list')).includes('Kept, taken off sale today') && (await text(page, '#sum-list')).includes('Kept 1 item'));
    await card(page, 'Lamp').locator('button', { hasText: 'Put back on sale' }).click();
    ok('put back on sale', await page.locator('#sale-list .item', { hasText: 'Lamp' }).count() === 1);

    // edit: bad values, then a fix; very long name
    const tr2 = card(page, 'Treadmill');
    await tr2.locator('button', { hasText: 'More' }).click(); await tr2.locator('button', { hasText: 'Edit' }).click();
    await page.fill('[id^="e-"][id$="n"]', ''); await page.fill('[id^="e-"][id$="m"]', '99999'); await tr2.locator('button', { hasText: 'Save changes' }).click();
    ok('edit refuses blank name and lowest above asking', (await ctext(tr2)).includes('Type what you are selling') && (await ctext(tr2)).includes('more than the asking price'));
    const LONG = 'Treadmill ' + 'with a very long description of the model '.repeat(3);
    await page.fill('[id^="e-"][id$="n"]', LONG); await page.fill('[id^="e-"][id$="m"]', '');
    await tr2.locator('.chip', { hasText: 'eBay' }).click();
    await tr2.locator('button', { hasText: 'Save changes' }).click();
    st = await saved(page);
    const trs = st.items.find(i => i.name.startsWith('Treadmill'));
    ok('edit saved, name cut to 80, site added, lowest cleared', trs.name.length === 80 && trs.sites.join() === 'OLX,Facebook Marketplace,eBay' && trs.min === null, JSON.stringify([trs.name.length, trs.sites, trs.min]));
    ok('long name: no sideways scroll', await noHScroll(page));

    // copy ad text, copy the list, email link
    await card(page, 'Lamp').locator('button', { hasText: 'Copy ad text' }).click();
    ok('ad text copied', (await page.evaluate(() => navigator.clipboard.readText())) === 'For sale: Lamp, 1,000');
    await page.click('#copy');
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    ok('list copied with the answer', clip.includes('Money made: 12,200 from 4 items sold (83% of what I first asked)'), clip.split('\n').slice(-3).join(' | '));
    const mail = await page.getAttribute('#mail', 'href');
    ok('email link works with no recipient', mail.startsWith('mailto:?subject=My%20things%20for%20sale&body=') && decodeURIComponent(mail).includes('Money made'));

    // currency symbol, remembered
    await page.selectOption('#cur', 'Rs');
    ok('currency shown', (await text(page, '#sum-big')) === 'Rs 12,200' && await page.locator('#a-price-cur').isVisible());

    // a photo, kept small on the device
    await page.click('#a-more-open').catch(() => {});
    await page.setInputFiles('#a-photo', path.join(DIR, 'icons', 'icon-512.png'));
    await page.waitForSelector('#a-photo-img:not([hidden])');
    await page.fill('#a-name', 'Rug'); await page.click('#a-save');
    st = await saved(page);
    const rug = st.items.find(i => i.name === 'Rug');
    ok('photo saved small as JPEG', rug.photo.startsWith('data:image/jpeg;base64,') && rug.photo.length < 150000);
    ok('photo shown on the card', await card(page, 'Rug').locator('img.thumb').count() === 1);
    ok('photo form cleared', await page.locator('#a-photo-img').isHidden());
    await page.setInputFiles('#a-photo', { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
    ok('not a photo refused', (await text(page, '#add-msg')).includes('not a photo'));

    // delete with undo
    await card(page, 'Rug').locator('button', { hasText: 'More' }).click();
    await card(page, 'Rug').locator('button', { hasText: 'Delete' }).click();
    ok('deleted', await card(page, 'Rug').count() === 0);
    await page.click('#sale-msg .undo');
    ok('undo delete', await card(page, 'Rug').count() === 1);

    // reload keeps everything
    const before = JSON.stringify(await saved(page));
    await page.reload({ waitUntil: 'load' });
    ok('reload keeps the list and currency', JSON.stringify(await saved(page)) === before && (await text(page, '#sum-big')) === 'Rs 12,200');

    // backup and restore
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#backup')]);
    const file = await dl.path();
    const backup = JSON.parse(fs.readFileSync(file, 'utf8'));
    ok('backup has the items', backup.items.length === st.items.length && dl.suggestedFilename() === 'declutter-and-sell-backup-2026-10-30.json');
    await page.click('#del-all');
    ok('delete everything', await page.locator('#intro').isVisible() && await page.locator('.item').count() === 0);
    await page.click('#top-msg .undo');
    ok('undo delete everything', await page.locator('.item').count() > 5);
    await page.click('#del-all');
    await page.setInputFiles('#restore-file', file);
    await page.waitForFunction(() => document.querySelectorAll('.item').length > 5);
    ok('restore brings it all back', (await text(page, '#top-msg')).startsWith('Restored ' + st.items.length + ' items'));
    await page.setInputFiles('#restore-file', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"items":[{"bad":1}]}') });
    await page.waitForTimeout(200);
    ok('bad backup refused', (await text(page, '#tools-msg')).includes('not a backup from this app'));
    ok('no console errors in the long run', page.errors.length === 0, page.errors.join(' | '));
    await page.context().close();

    // corrupt saved state and blocked storage
    page = await open(browser, 390, { state: '{"items":[{"id":1' });
    ok('corrupt state: fresh start with a message', (await text(page, '#top-msg')).includes('could not be read') && await page.locator('#intro').isVisible());
    ok('corrupt state: no errors', page.errors.length === 0, page.errors.join(' | '));
    await page.context().close();
    page = await open(browser, 390, { block: true });
    ok('blocked storage warns', await page.locator('#store-warn').isVisible());
    await page.fill('#a-name', 'Chair'); await page.click('#a-save');
    ok('blocked storage still works for this visit', await card(page, 'Chair').count() === 1);
    await page.context().close();

    // realistic state: the totals answer
    page = await open(browser, 1280, { state: JSON.stringify(REAL) });
    ok('money made 24,500, 84%', await text(page, '#sum-big') === '24,500' && (await text(page, '#sum-sub')) === 'From 4 items sold, 84% of what you first asked.');
    ok('stats', (await text(page, '#sum-list')).includes('Waiting to be collected 1 item, 6,000 to collect') && (await text(page, '#sum-list')).includes('For sale 3 items, asking 66,000') && (await text(page, '#sum-list')).includes('Offers to answer 2'));
    ok('drop due on top of For sale', (await text(page, '#sale-list .item')).startsWith('Treadmill'));
    ok('by place', (await text(page, '#sum-list')).includes('OLX 3 listed, 2 sold'));
    ok('offer below lowest marked on sofa', (await ctext(card(page, 'Sofa set (3 seater)'))).includes('Hamza offered 20,000 · Wed 28 Oct') && (await ctext(card(page, 'Sofa set (3 seater)'))).includes('Below your lowest price (22,000)'));
    // the next day the collection day has passed
    await page.context().close();
    page = await open(browser, 390, { state: JSON.stringify(REAL), now: new Date('2026-11-01T10:00:00') });
    ok('late collection flagged', (await ctext(card(page, 'Baby cot with mattress'))).includes('Collection day was yesterday. Did they come?'));
    await page.context().close();

    // theme switch
    page = await open(browser, 390, { state: JSON.stringify(REAL) });
    const tb = page.locator('.theme-toggle');
    ok('theme switch present', await tb.count() === 1);
    const bg1 = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await tb.click();
    const bg2 = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    ok('theme switch changes the look', bg1 !== bg2 && await page.evaluate(() => document.documentElement.dataset.theme) === 'light');
    await page.context().close();

    // phones: every form open, nothing overlaps, placeholders fit
    for (const w of [320, 360, 390]) {
        page = await open(browser, w, { state: JSON.stringify(REAL), scheme: 'light' });
        await page.click('#a-more-open');
        const sofa = card(page, 'Sofa set (3 seater)');
        let o = await overlaps(page, '#add input:not([type=file]), #add textarea, #add button, #add .chip');
        ok(w + 'px add form controls do not overlap', !o.length, o.join('; '));
        const ph = await page.evaluate(() => [...document.querySelectorAll('input[placeholder], textarea[placeholder]')].filter(i => i.offsetParent).filter(i => {
            const c = document.createElement('canvas').getContext('2d'), cs = getComputedStyle(i); c.font = cs.fontSize + ' ' + cs.fontFamily;
            return c.measureText(i.placeholder).width > i.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) + 1 && i.tagName === 'INPUT';
        }).map(i => i.id));
        ok(w + 'px placeholders fit', !ph.length, ph.join(', '));
        for (const b of ['+ Offer', 'Reserve for a buyer', 'Mark as sold', 'Change price', 'More']) {
            await sofa.locator('.it-btns button', { hasText: b }).first().click();
            if (b === 'Mark as sold') { await sofa.locator('button', { hasText: '+ Swapped' }).click(); await sofa.locator('button', { hasText: '+ Sold together' }).click(); }
            if (b === 'More') await sofa.locator('button', { hasText: 'Edit' }).click();
            o = await overlaps(page, '.item[data-id="sofa"] input:not([type=file]):not([type=checkbox]), .item[data-id="sofa"] textarea, .item[data-id="sofa"] button, .item[data-id="sofa"] .chip');
            ok(w + 'px ' + b + ' form: controls do not overlap', !o.length, o.join('; '));
            ok(w + 'px ' + b + ' form: no sideways scroll', await noHScroll(page));
            await sofa.locator('.inline-form button', { hasText: 'Cancel' }).click();
        }
        const cot2 = card(page, 'Baby cot with mattress');
        await cot2.locator('button', { hasText: 'Buyer did not come' }).click();
        o = await overlaps(page, '.item[data-id="cot"] button');
        ok(w + 'px deposit question: buttons do not overlap', !o.length, o.join('; '));
        ok(w + 'px no errors', page.errors.length === 0, page.errors.join(' | '));
        await page.context().close();
    }

    // every width, filled in and cleared, dark and light: no sideways scroll, no overlapping blocks after scrolling
    for (const scheme of ['dark', 'light']) for (const w of [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920]) {
        for (const filled of [true, false]) {
            page = await open(browser, w, { scheme, state: filled ? JSON.stringify(REAL) : JSON.stringify({ v: 1, cur: '', items: [] }) });
            ok(scheme + ' ' + w + (filled ? ' filled' : ' cleared') + ': no sideways scroll', await noHScroll(page));
            const out = await page.evaluate(() => [...document.querySelectorAll('.app *')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1); }).map(e => e.className || e.tagName).slice(0, 5));
            ok(scheme + ' ' + w + ': nothing sticks out', !out.length, out.join(', '));
            if (w >= 900) for (const pos of [0, 0.5, 1]) {
                await page.evaluate(p => window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * p), pos);
                const o = await overlaps(page, '.app > *:not(.col-a):not(.col-b), .col-a > *, .col-b > *');
                ok(scheme + ' ' + w + ' scroll ' + pos + ': blocks do not overlap', !o.length, o.join('; '));
            }
            ok(scheme + ' ' + w + ': no errors', page.errors.length === 0 && page.bad.length === 0, page.errors.concat(page.bad).join(' | '));
            await page.context().close();
        }
    }

    // screenshots
    if (args.includes('--shots')) {
        page = await open(browser, 1280, { state: JSON.stringify(REAL) });
        await page.setViewportSize({ width: 1280, height: 1500 });
        await page.screenshot({ path: path.join(DIR, 'screenshots', 'desktop.png') });
        await page.context().close();
        page = await open(browser, 390, { state: JSON.stringify(REAL), scale: 2 });
        await page.setViewportSize({ width: 390, height: 1400 });
        await page.screenshot({ path: path.join(DIR, 'screenshots', 'phone.png') });
        await page.context().close();
        console.log('screenshots saved');
    }

    await browser.close();
    console.log(pass + ' passed, ' + fail + ' failed');
    if (fail) process.exitCode = 1;
})();
