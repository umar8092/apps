// Drives the real page in headless Chromium. Run from the repo root: node tailor-orders-and-family-measurements/ui-test.js [baseUrl]
// Without a base URL it serves the repo itself. The clock is fixed at Tue 27 Oct 2026, 10 am in Karachi, so the answers are exact.
// SHOTS=1 also saves the README screenshots. QUICK=1 skips the slow width sweep.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), SLUG = 'tailor-orders-and-family-measurements';
const SHOTS = process.env.SHOTS === '1';
let pass = 0; const fails = [];
function eq(got, want, what) { const g = JSON.stringify(got), w = JSON.stringify(want); if (g === w) pass++; else fails.push(what + ': got ' + g + ', want ' + w); }
function ok(c, what) { eq(!!c, true, what); }
// innerText follows text-transform, so compare without case
function has(text, part, what) { if (String(text).toLowerCase().includes(String(part).toLowerCase())) pass++; else fails.push(what + ': "' + part + '" not in "' + String(text).slice(0, 500) + '"'); }
function hasNot(text, part, what) { if (!String(text).toLowerCase().includes(String(part).toLowerCase())) pass++; else fails.push(what + ': "' + part + '" should not be in "' + String(text).slice(0, 300) + '"'); }

function serve() {
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
    return new Promise(res => {
        const s = http.createServer((q, r) => {
            let p = decodeURIComponent(q.url.split('?')[0]).replace(/^\/apps/, ''); if (p.endsWith('/')) p += 'index.html';
            const f = path.join(ROOT, p);
            if (!f.startsWith(ROOT) || !fs.existsSync(f)) { r.writeHead(404); return r.end('no'); }
            r.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f));
        }).listen(0, '127.0.0.1', () => res({ s, base: 'http://127.0.0.1:' + s.address().port + '/apps' }));
    });
}

async function newPage(browser, base, width, opts = {}) {
    const ctx = await browser.newContext({ viewport: { width, height: opts.height || 900 }, deviceScaleFactor: opts.scale || 1, timezoneId: 'Asia/Karachi', colorScheme: opts.scheme || 'dark', permissions: ['clipboard-read', 'clipboard-write'], acceptDownloads: true });
    await ctx.route(/goatcounter\.com|gc\.zgo\.at/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
    const page = await ctx.newPage();
    page.setDefaultTimeout(6000);
    page.errors = [];
    page.on('pageerror', e => page.errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') page.errors.push(m.text()); });
    page.on('response', r => { if (r.status() >= 400) page.errors.push(r.status() + ' ' + r.url()); });
    await page.clock.install({ time: new Date(opts.time || '2026-10-27T10:00:00+05:00') });
    await page.goto(base + '/' + SLUG + '/', { waitUntil: 'load' });
    return { ctx, page };
}

// ---------- helpers that act like a person ----------
async function addPerson(page, { name, unit, date, values = {}, note, custom = [] }) {
    if (await page.locator('#add-person').isVisible()) await page.click('#add-person');
    const f = page.locator('#person-form-slot .p-form');
    await f.locator('#pn-new').fill(name);
    if (unit === 'cm') await f.locator('.seg label:has-text("cm")').click();
    if (date) await f.locator('#pd-new').fill(date);
    for (const [k, v] of Object.entries(values)) await f.locator('#m-' + k + '-new').fill(String(v));
    for (const [l, v] of custom) { await f.locator('button:text-is("+ Add another measurement (optional)")').click(); const r = f.locator('.c-row').last(); await r.locator('input').first().fill(l); await r.locator('input').nth(1).fill(v); }
    if (note) { await f.locator('button:text-is("+ Add a fit note (optional)")').click(); await f.locator('#pt-new').fill(note); }
    await f.locator('button[type=submit]').click();
}
const box = (page, name) => page.locator('#people .person', { has: page.locator('h3', { hasText: new RegExp('^' + name + '$') }) });
async function newMeasurements(page, name, date, values) {
    await page.click('button[aria-label="New measurements: ' + name + '"]');
    const f = box(page, name).locator('.p-form');
    const id = await f.locator('input[type=date]').getAttribute('id');
    await f.locator('#' + id).fill(date);
    const key = id.slice(3);
    for (const [k, v] of Object.entries(values)) await f.locator('#m-' + k + '-' + key).fill(String(v));
    await f.locator('button[type=submit]').click();
}
async function addOrder(page, { who, name, item, pieces, tailor, given, promised, promisedChip, price, advance, note }) {
    if (who) await page.click('#person-chips .chip-btn:text-is("' + who + '")');
    else if (name !== undefined) { if (await page.locator('#person-chips').isVisible()) await page.click('#person-chips .chip-btn:text-is("Someone else")'); await page.fill('#person-name', name); }
    if (item !== undefined) await page.fill('#item', item);
    if (pieces !== undefined) await page.fill('#pieces', String(pieces));
    if (tailor !== undefined) await page.fill('#tailor', tailor);
    if (given) await page.fill('#given', given);
    if (promised !== undefined) await page.fill('#promised', promised);
    if (promisedChip) await page.click('#promised-chips .chip-btn:text-is("' + promisedChip + '")');
    if (price !== undefined || advance !== undefined) { if (await page.locator('#money-open').isVisible()) await page.click('#money-open'); }
    if (price !== undefined) await page.fill('#price', String(price));
    if (advance !== undefined) await page.fill('#advance', String(advance));
    if (note !== undefined) { if (await page.locator('#note-open').isVisible()) await page.click('#note-open'); await page.fill('#note', note); }
    await page.click('#add-btn');
}
const order = (page, label) => page.locator('#order-list .order, #collected-list .order', { has: page.locator('button[aria-label="Edit: ' + label + '"]') });
async function collect(page, label, { price, paid, date } = {}) {
    await page.click('button[aria-label="Collected: ' + label + '"]');
    const p = order(page, label).locator('.o-panel');
    if (price !== undefined) await p.locator('input[id^=cp-]').fill(String(price));
    if (paid !== undefined) await p.locator('input[id^=ca-]').fill(String(paid));
    if (date) await p.locator('input[type=date]').fill(date);
    await p.locator('button:text-is("Mark collected")').click();
}
async function msgSays(page, id, text) { await page.waitForFunction(([i, t]) => document.getElementById(i).textContent.includes(t), [id, text], { timeout: 4000 }).catch(() => { }); return page.locator('#' + id).innerText(); }
async function clip(page) { return page.evaluate(() => navigator.clipboard.readText()); }

// The real family: Ayesha in Lahore, with Eid and a wedding coming, has clothes at two tailors.
async function fillRealistic(page) {
    await page.selectOption('#cur', 'Rs');
    await addPerson(page, { name: 'Ali', date: '2025-03-15', values: { length: 28, chest: '26 1/2', sleeve: 17, tlength: 29 } });
    await newMeasurements(page, 'Ali', '2026-03-12', { length: 30, shoulder: 13, chest: 28, waist: 26, sleeve: '18½', neck: '12.5', tlength: 31, bottom: '6 1/2' });
    await addPerson(page, { name: 'Ayesha', date: '2026-09-01', values: { length: 40, shoulder: 14.5, chest: 36, waist: 32, hip: 40, sleeve: 21, armhole: 8, tlength: 38, bottom: 7 }, note: 'Loose fit, round daman' });
    await addPerson(page, { name: 'Sara', date: '2026-08-10', values: { length: 24, chest: 24, sleeve: 14 } });
    await addPerson(page, { name: 'Imran', unit: 'cm', date: '2025-12-20', values: { length: 104, shoulder: 46, chest: 104, sleeve: 64, neck: 41, tlength: 104 } });
    await addOrder(page, { who: 'Ayesha', item: 'Suit (3 piece)', tailor: 'Style Boutique', given: '2026-10-10', promised: '2026-10-24', price: '4,500', advance: 2000, note: 'Maroon chiffon, embroidered neck, dupatta edging' });
    await addOrder(page, { who: 'Sara', item: 'Dress', tailor: 'Style Boutique', given: '2026-10-15', promised: '2026-10-26', price: 1500 });
    await addOrder(page, { who: 'Ali', item: 'Kurta shalwar', pieces: 2, tailor: 'Master Tailor', given: '2026-10-22', promised: '2026-10-29', price: 3000, advance: 1800 });
    await addOrder(page, { who: 'Imran', item: 'Shalwar kameez', pieces: 1, tailor: 'Master Tailor', given: '2026-10-26', promisedChip: 'Not set', price: 2000 });
    await addOrder(page, { who: 'Ali', item: 'School uniform', tailor: 'Master Tailor', given: '2026-10-05', promised: '2026-10-15', price: 1600 });
    await collect(page, "Ali's School uniform", { date: '2026-10-22' });
    await page.click('button[aria-label="Mark ready: Sara\'s Dress"]');
}
const glance = page => page.locator('#glance-body').innerText();

async function overlapCheck(page) {
    return page.evaluate(() => {
        const bad = [], vis = e => { if (e.closest('details:not([open])') && !e.closest('summary')) return false; const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden'; };
        const ctrls = [...document.querySelectorAll('input:not([type=radio]):not([type=checkbox]):not([type=file]), select, textarea, button, a.secondary, .seg span')].filter(vis);
        for (let i = 0; i < ctrls.length; i++) for (let j = i + 1; j < ctrls.length; j++) {
            const a = ctrls[i].getBoundingClientRect(), b = ctrls[j].getBoundingClientRect();
            if (ctrls[i].contains(ctrls[j]) || ctrls[j].contains(ctrls[i])) continue;
            if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) bad.push((ctrls[i].id || ctrls[i].textContent.slice(0, 20)) + ' / ' + (ctrls[j].id || ctrls[j].textContent.slice(0, 20)));
        }
        const out = [...document.querySelectorAll('main *')].filter(vis).filter(e => e.getBoundingClientRect().right > document.documentElement.clientWidth + 1).map(e => e.tagName + '.' + e.className).slice(0, 5);
        const ph = [...document.querySelectorAll('input[placeholder], textarea[placeholder]')].filter(vis).filter(e => {
            const c = document.createElement('canvas').getContext('2d'); const s = getComputedStyle(e); c.font = s.fontSize + ' ' + s.fontFamily;
            return c.measureText(e.placeholder).width > e.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight) + 1 && e.tagName === 'INPUT';
        }).map(e => e.id + ': ' + e.placeholder);
        // labels clipped inside their box
        const clipped = [...document.querySelectorAll('label:not(.sr-label), legend, button, dt, dd, h3')].filter(vis).filter(e => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflow !== 'visible').map(e => e.textContent.slice(0, 30));
        return { bad, out, ph, clipped, scroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 };
    });
}

process.on('unhandledRejection', e => { console.log('CRASH: ' + e.message.split('\n')[0] + '\n' + pass + ' passed so far, failures:\n - ' + fails.join('\n - ')); console.log(e.stack.split('\n').filter(l => l.includes('ui-test')).join('\n')); process.exit(1); });
(async () => {
    let srv = null, base = process.argv[2];
    if (!base) { srv = await serve(); base = srv.base; }
    const live = !srv;
    const browser = await chromium.launch();

    console.log('block 1: first use and the real situation');
    {
        const { ctx, page } = await newPage(browser, base, 390);
        // first use: empty state
        has(await glance(page), 'Nothing at the tailor yet', 'empty: glance says what to do');
        ok(await page.locator('#glance-tools').isHidden(), 'empty: no copy buttons with nothing to copy');
        has(await page.locator('#order-list').innerText(), 'Your orders will show here', 'empty: orders note');
        ok(await page.locator('#person-chips').isHidden(), 'no family yet: no person chips');
        ok(await page.locator('#person-name').isVisible(), 'no family yet: name box shown');
        has(await page.locator('#person-hint').innerText(), 'add people in "Family measurements"', 'no family yet: tip shown');
        ok(await page.locator('#money-row').isHidden(), 'price and advance hidden until asked (optional)');
        ok(await page.locator('#note-row').isHidden(), 'note hidden until asked (optional)');
        eq(await page.inputValue('#given'), '2026-10-27', 'given defaults to today');
        has(await page.locator('#promised-note').innerText(), 'No ready date yet', 'no ready date by default');
        // blank submit
        await page.click('#add-btn');
        const e1 = await page.locator('#add-err').innerText();
        has(e1, 'Choose who it is for', 'blank: who'); has(e1, 'what is being stitched', 'blank: what'); has(e1, 'tailor or shop name', 'blank: tailor');
        eq(await page.locator('#add-form [aria-invalid=true]').count(), 3, 'blank: three fields marked');
        eq(await page.evaluate(() => document.activeElement.id), 'person-name', 'blank: focus goes to the first problem');
        // an order with only the required fields: price is never forced
        await addOrder(page, { name: 'Hina', item: 'Alteration', tailor: 'Corner tailor' });
        has(await page.locator('#order-list').innerText(), 'Hina: Alteration', 'minimal order added');
        has(await page.locator('#order-list').innerText(), 'No ready date', 'minimal order: no date');
        has(await glance(page), 'Still to pay: 0', 'minimal: still to pay 0');
        has(await glance(page), '1 order with no price yet', 'minimal: no price counted');
        // tailor kept for the next order, person cleared
        eq(await page.inputValue('#tailor'), 'Corner tailor', 'tailor stays filled for the next order');
        eq(await page.inputValue('#person-name'), '', 'person cleared for the next order');
        await page.click('button[aria-label="Delete: Hina\'s Alteration"]');
        await page.fill('#tailor', '');
        has(await glance(page), 'Nothing at the tailor', 'deleted the minimal order');

        await fillRealistic(page);
        const g = await glance(page);
        has(g, '4 orders (5 pieces) at 2 tailors', 'glance headline');
        has(g, 'Still to pay: Rs 7,200', 'glance still to pay');
        has(g, '1 late', 'glance late'); has(g, '1 ready to collect', 'glance ready'); has(g, '1 due in the next 7 days', 'glance this week');
        has(g, 'Master Tailor\n2 orders · Rs 3,200 to pay', 'per tailor: Master Tailor');
        has(g, 'Style Boutique\n2 orders · 1 late · 1 ready · Rs 4,000 to pay', 'per tailor: Style Boutique');
        const firstOrders = await page.locator('#order-list > .order h3').allInnerTexts();
        eq(firstOrders, ['Ayesha: Suit (3 piece)', 'Sara: Dress', 'Ali: Kurta shalwar (2 pieces)', 'Imran: Shalwar kameez'], 'orders: late, ready, soon, no date');
        const late = await order(page, "Ayesha's Suit (3 piece)").innerText();
        has(late, '3 days late (promised Sat 24 Oct)', 'late order text');
        has(await order(page, "Sara's Dress").innerText(), 'Price Rs 1,500, nothing paid yet', 'nothing paid yet');
        ok(await page.locator('#person-name').isHidden(), 'with a family, the name box waits for Someone else');
        eq(await page.locator('#person-chips .chip-btn[aria-pressed=true]').count(), 0, 'nobody picked by default');
        await page.fill('#item', 'Kurta'); await page.fill('#tailor', 'X'); await page.click('#add-btn');
        has(await page.locator('#add-err').innerText(), 'Choose who it is for', 'nobody picked: asked who');
        eq(await page.evaluate(() => document.activeElement.textContent), 'Ali', 'nobody picked: focus on the first person');
        await page.fill('#item', ''); await page.fill('#tailor', ''); await page.click('#add-btn');  has(late, 'Price Rs 4,500, paid Rs 2,000, balance Rs 2,500', 'late order money'); has(late, 'Maroon chiffon', 'late order note');
        has(await order(page, "Ali's Kurta shalwar").innerText(), 'Ready Thu 29 Oct (in 2 days)', 'due order');
        has(await order(page, "Sara's Dress").innerText(), 'Ready to collect', 'ready order');
        eq(await page.locator('#collected-sum').innerText(), 'Collected (1)', 'one collected');
        await page.click('#collected-sum');
        has(await order(page, "Ali's School uniform").innerText(), 'Collected Thu 22 Oct', 'collected date');
        has(await order(page, "Ali's School uniform").innerText(), 'Price Rs 1,600, fully paid', 'collected and paid in full');

        // copy the list
        await page.click('#copy-glance');
        eq(await clip(page), ['At the tailor (Tue 27 Oct 2026)', '4 orders (5 pieces) at 2 tailors. Still to pay: Rs 7,200',
            '', 'LATE', '- Ayesha: Suit (3 piece) at Style Boutique, 3 days late (promised Sat 24 Oct), balance Rs 2,500',
            '', 'READY TO COLLECT', '- Sara: Dress at Style Boutique, ready to collect, balance Rs 1,500',
            '', 'COMING UP', '- Ali: Kurta shalwar (2 pieces) at Master Tailor, ready Thu 29 Oct (in 2 days), balance Rs 1,200',
            '', 'NO READY DATE', '- Imran: Shalwar kameez at Master Tailor, no ready date, balance Rs 2,000'].join('\n'), 'copied list is exact');
        has(await page.locator('#glance-msg').innerText(), 'The list copied', 'copy confirmed');
        const mail = await page.getAttribute('#email-glance', 'href');
        ok(mail.startsWith('mailto:?subject=At%20the%20tailor&body=At%20the%20tailor'), 'email works with no address');

        // measurements in each person's box
        const ali = await box(page, 'Ali').innerText();
        has(ali, 'Measured Thu 12 Mar 2026 (7 months ago)', 'Ali measured');
        has(ali, 'Measure again before the next order', 'Ali measured 7 months ago: check again');
        has(ali, 'Changed since Sat 15 Mar 2025: Shirt / kameez length 28 → 30, Chest 26½ → 28, Sleeve length 17 → 18½, Shalwar / trouser length 29 → 31', 'Ali growth shown');
        has(ali, 'Sleeve length\n18½', 'Ali fraction shown as tailors write it');
        has(ali, 'Bottom / paicha\n6½', 'Ali 6 1/2 read');
        has(ali, 'Neck / collar\n12½', 'Ali 12.5 shown as 12½');
        has(ali, '1 order at the tailor', 'Ali open orders counted');
        has(ali, 'Earlier measurements (1)', 'Ali earlier set kept');
        const imran = await box(page, 'Imran').innerText();
        has(imran, 'cm', 'Imran in cm'); has(imran, 'Measure again before the next order', 'Imran 10 months old: check again');
        has(await box(page, 'Ayesha').innerText(), 'Fit: Loose fit, round daman', 'fit note shown');
        await page.click('button[aria-label="Copy measurements: Ali"]');
        eq(await clip(page), 'Ali measurements (inches, taken Thu 12 Mar 2026)\n\nShirt / kameez\nLength: 30\nShoulder: 13\nChest: 28\nWaist: 26\nSleeve length: 18½\nNeck / collar: 12½\n\nShalwar / trousers\nLength: 31\nBottom / paicha: 6½', 'Ali measurement text exact');
        await page.click('button[aria-label="Copy for tailor: Ali\'s Kurta shalwar"]');
        const ot = await clip(page);
        has(ot, 'Order for Ali: Kurta shalwar (2 pieces)\nTailor: Master Tailor\nGiven Thu 22 Oct 2026, ready by Thu 29 Oct 2026\nPrice Rs 3,000, paid Rs 1,800, balance Rs 1,200\n\nAli measurements (inches', 'order text for the tailor');

        // second use the next day: reload keeps everything, currency remembered
        await page.reload({ waitUntil: 'load' });
        has(await glance(page), 'Still to pay: Rs 7,200', 'reload: state and currency kept');
        eq(await page.inputValue('#cur'), 'Rs', 'reload: currency remembered');
        eq(page.errors, [], 'block 1: no console errors');
        await ctx.close();
    }

    console.log('block 2: changes, mistakes and undo');
    {
        const { ctx, page } = await newPage(browser, base, 390);
        await fillRealistic(page);
        // pay something
        await page.click('button[aria-label="Add payment: Ayesha\'s Suit (3 piece)"]');
        const pp = order(page, "Ayesha's Suit (3 piece)").locator('.o-panel');
        eq(await pp.locator('input').first().getAttribute('placeholder'), '2500', 'payment hint shows the balance');
        await pp.locator('button:text-is("Save payment")').click();
        has(await pp.locator('.err').innerText(), 'Type the amount you paid', 'payment: blank refused');
        await pp.locator('input').first().fill('-50');
        await pp.locator('button:text-is("Save payment")').click();
        has(await pp.locator('.err').innerText(), 'cannot be below 0', 'payment: negative refused');
        await pp.locator('input').first().fill('1,000');
        has(await pp.locator('.hint').innerText(), 'Balance after this: Rs 1,500', 'payment preview');
        await pp.locator('input[type=date]').fill('2026-10-01');
        await pp.locator('button:text-is("Save payment")').click();
        has(await pp.locator('.err').innerText(), 'before the order was given', 'payment before order refused');
        await pp.locator('.chip-btn:text-is("Today")').click();
        await pp.locator('button:text-is("Save payment")').click();
        has(await page.locator('#orders-msg').innerText(), 'Added Rs 1,000 paid for Ayesha\'s Suit (3 piece). Balance Rs 1,500.', 'payment added');
        has(await glance(page), 'Still to pay: Rs 6,200', 'still to pay down by 1,000');
        // undo the payment
        await page.click('#orders-msg .undo');
        has(await glance(page), 'Still to pay: Rs 7,200', 'undo payment');
        // mark ready, then collect with a changed price and an overpayment
        await page.click('button[aria-label="Mark ready: Ayesha\'s Suit (3 piece)"]');
        has(await glance(page), '2 ready to collect', 'Ayesha now ready, no longer late');
        hasNot(await glance(page), 'late', 'nothing late');
        await collect(page, "Ayesha's Suit (3 piece)", { price: 5000, paid: 3200 });
        await page.evaluate(() => { document.getElementById('collected-box').open = true; });
        has(await page.locator('#orders-msg').innerText(), 'Collected Ayesha\'s Suit (3 piece). You paid Rs 200 more than the price.', 'overpaid said plainly');
        has(await order(page, "Ayesha's Suit (3 piece)").innerText(), 'Price Rs 5,000, paid Rs 5,200 (Rs 200 more than the price)', 'overpaid on the order');
        has(await glance(page), 'Still to pay: Rs 4,700', 'collected order leaves still to pay');
        eq(await page.locator('#collected-sum').innerText(), 'Collected (2)', 'two collected');
        // remove a payment to fix the mistake
        await order(page, "Ayesha's Suit (3 piece)").locator('details.pays summary').click();
        await page.click('button[aria-label="Remove payment of Rs 3,200 on Tue 27 Oct"]');
        has(await order(page, "Ayesha's Suit (3 piece)").innerText(), 'balance Rs 3,000', 'payment removed');
        await page.click('#orders-msg .undo');
        // back to the tailor for a fix
        await page.click('button[aria-label="Back to tailor for a fix: Ayesha\'s Suit (3 piece)"]');
        const fp = order(page, "Ayesha's Suit (3 piece)").locator('.o-panel');
        await fp.locator('input[type=text]').fill('Sleeves 1 inch shorter');
        await fp.locator('.chip-btn:text-is("In 2 days")').click();
        await fp.locator('button:text-is("Send back")').click();
        has(await page.locator('#orders-msg').innerText(), "Ayesha's Suit (3 piece) is back at Style Boutique, ready Thu 29 Oct.", 'sent back message');
        const back = await order(page, "Ayesha's Suit (3 piece)").innerText();
        has(back, 'Sent back for a fix Tue 27 Oct: Sleeves 1 inch shorter', 'fix history'); has(back, 'Ready Thu 29 Oct (in 2 days)', 'new ready date');
        eq(await page.locator('#collected-sum').innerText(), 'Collected (1)', 'back out of collected');

        // edit an order
        await page.click('button[aria-label="Edit: Imran\'s Shalwar kameez"]');
        eq(await page.locator('#add-h').innerText(), "Edit order: Imran's Shalwar kameez", 'edit heading');
        ok(await page.locator('#advance-wrap').isHidden(), 'edit: advance hidden (payments are on the order)');
        ok(await page.locator('#advance-hint').isVisible(), 'edit: says where to change payments');
        await page.click('#promised-chips .chip-btn:text-is("In 1 week")');
        has(await page.locator('#promised-note').innerText(), 'Mon 2 Nov', 'in 1 week counts from the day given (26 Oct)');
        await page.fill('#given', '2026-11-05');
        await page.click('#add-btn');
        has(await page.locator('#add-err').innerText(), 'The ready date is before the day you gave it.', 'edit: ready before given refused');
        await page.fill('#given', '2026-10-26');
        await page.fill('#price', '2,200');
        await page.click('#add-btn');
        has(await page.locator('#add-msg').innerText(), "Saved the changes to Imran's Shalwar kameez.", 'edit saved');
        has(await order(page, "Imran's Shalwar kameez").innerText(), 'Price Rs 2,200, nothing paid yet', 'edit: new price');
        eq(await page.locator('#add-h').innerText(), 'Give clothes to the tailor', 'form back to adding');
        // edit and cancel
        await page.click('button[aria-label="Edit: Imran\'s Shalwar kameez"]');
        await page.fill('#item', 'Changed my mind');
        await page.click('#add-cancel');
        eq(await page.inputValue('#item'), '', 'cancel edit clears the form');
        ok(await order(page, "Imran's Shalwar kameez").count(), 'cancel edit: order unchanged');
        // delete and undo
        await page.click('button[aria-label="Delete: Sara\'s Dress"]');
        eq(await order(page, "Sara's Dress").count(), 0, 'deleted');
        await page.click('#orders-msg .undo');
        eq(await order(page, "Sara's Dress").count(), 1, 'undo brings it back');

        // a person: rename carries to their orders
        await page.click('button[aria-label="Edit: Imran"]');
        await box(page, 'Imran').locator('input[id^=pn-]').fill('Abbu');
        await box(page, 'Imran').locator('button[type=submit]').click();
        has(await page.locator('#family-msg').innerText(), 'Saved Abbu. Their orders now say Abbu.', 'rename message');
        ok(await order(page, "Abbu's Shalwar kameez").count(), 'rename carried to the order');
        // duplicate name refused
        await page.click('#add-person');
        await page.fill('#pn-new', 'ali');
        await page.click('#person-form-slot button[type=submit]');
        has(await page.locator('#person-form-slot .err').innerText(), 'There is already a person called ali', 'duplicate name refused');
        // bad measurements
        await page.fill('#pn-new', 'Omar');
        ok(await page.locator('#person-form-slot .seg input[value=in]').isChecked(), 'new person starts in inches like most of the family');
        await page.fill('#m-chest-new', 'abc'); await page.fill('#m-waist-new', '0'); await page.fill('#m-hip-new', '300');
        await page.click('#person-form-slot button[type=submit]');
        const pe = await page.locator('#person-form-slot .err').innerText();
        has(pe, 'Chest: Type a number like 14, 14.5 or 14 1/2.', 'letters refused'); has(pe, 'Waist: A measurement must be more than 0.', 'zero refused'); has(pe, 'Hip: That is more than 200 inches', 'huge refused');
        eq(await page.locator('#person-form-slot [aria-invalid=true]').count(), 3, 'three bad boxes marked');
        // switching to cm converts the good numbers
        await page.fill('#m-chest-new', '14 1/2'); await page.fill('#m-waist-new', ''); await page.fill('#m-hip-new', '');
        await page.click('#person-form-slot .seg label:has-text("cm")');
        eq(await page.inputValue('#m-chest-new'), '37', '14 1/2 inches becomes 37 cm');
        has(await page.locator('#person-form-slot .p-form').innerText(), 'Changed 1 number to cm', 'conversion said');
        has(await page.locator('#person-form-slot .p-form').innerText(), 'Shirt / kameez (cm)', 'legend shows the unit');
        await page.click('#person-form-slot .seg label:has-text("inches")');
        eq(await page.inputValue('#m-chest-new'), '14½', 'and back to 14½ inches');
        // future date refused
        await page.fill('#pd-new', '2026-12-01');
        await page.click('#person-form-slot button[type=submit]');
        has(await page.locator('#person-form-slot .err').innerText(), 'cannot be in the future', 'future measuring date refused');
        await page.fill('#pd-new', '2026-10-27');
        // a custom measurement: text and number
        await page.click('#person-form-slot button:text-is("+ Add another measurement (optional)")');
        await page.locator('#person-form-slot .c-row input').nth(1).fill('Ban');
        await page.click('#person-form-slot button[type=submit]');
        has(await page.locator('#person-form-slot .err').innerText(), 'Give each extra measurement a name', 'custom needs a name');
        await page.locator('#person-form-slot .c-row input').nth(0).fill('Collar style');
        await page.click('#person-form-slot button[type=submit]');
        has(await page.locator('#family-msg').innerText(), 'Added Omar with 2 measurements.', 'Omar added');
        has(await box(page, 'Omar').innerText(), 'Collar style\nBan', 'custom text measurement shown');
        has(await box(page, 'Omar').innerText(), 'Measured Tue 27 Oct 2026 (today)', 'measured today');
        // a person with no measurements
        await addPerson(page, { name: 'Nani' });
        has(await box(page, 'Nani').innerText(), 'No measurements saved yet', 'person without measurements');
        ok(await page.locator('button[aria-label="Copy measurements: Nani"]').count() === 0, 'no copy button without measurements');
        // new measurements needs at least one
        await page.click('button[aria-label="New measurements: Nani"]');
        await box(page, 'Nani').locator('button[type=submit]').click();
        has(await box(page, 'Nani').locator('.err').innerText(), 'Fill in at least one measurement', 'empty new set refused');
        await box(page, 'Nani').locator('button:text-is("Cancel")').click();
        // fix a typo in place (no new set)
        await page.click('button[aria-label="Edit: Sara"]');
        const sk = await box(page, 'Sara').locator('input[type=date]').getAttribute('id');
        await box(page, 'Sara').locator('#m-sleeve-' + sk.slice(3)).fill('15');
        await box(page, 'Sara').locator('button[type=submit]').click();
        const sara = await box(page, 'Sara').innerText();
        has(sara, 'Sleeve length\n15', 'typo fixed'); hasNot(sara, 'Earlier measurements', 'edit did not add a set');
        // delete an earlier set, undo
        await box(page, 'Ali').locator('details.earlier summary').click();
        await page.click('button[aria-label="Delete the measurements from Sat 15 Mar 2025"]');
        hasNot(await box(page, 'Ali').innerText(), 'Changed since', 'earlier set deleted');
        await page.click('#family-msg .undo');
        has(await box(page, 'Ali').innerText(), 'Changed since', 'undo brings the set back');
        // order for a person from their box
        await page.click('#people button:text-is("Order for Sara")');
        eq(await page.getAttribute('#person-chips .chip-btn:text-is("Sara")', 'aria-pressed'), 'true', 'Order for Sara picks Sara');
        // delete a person: orders kept with the name
        await page.click('button[aria-label="Edit: Ali"]');
        await page.click('#people button:text-is("Delete Ali")');
        has(await page.locator('#family-msg').innerText(), 'Deleted Ali and their measurements. Their orders are kept.', 'person deleted');
        ok(await order(page, "Ali's Kurta shalwar").count(), 'order kept after deleting the person');
        await page.click('button[aria-label="Copy for tailor: Ali\'s Kurta shalwar"]');
        hasNot(await clip(page), 'measurements', 'order text without a person has no measurements');
        await page.click('#family-msg .undo');
        has(await box(page, 'Ali').innerText(), '1 order at the tailor', 'undo: person and the link back');

        // odd and extreme order inputs
        await page.click('#person-chips .chip-btn:text-is("Someone else")');
        await page.fill('#person-name', 'Neighbour aunty');
        await page.fill('#item', 'Curtains');
        await page.fill('#pieces', '0');
        await page.fill('#tailor', 'Master Tailor');
        if (await page.locator('#money-open').isVisible()) await page.click('#money-open');
        await page.fill('#price', '12.345');
        await page.click('#add-btn');
        const oe = await page.locator('#add-err').innerText();
        has(oe, 'Pieces: a whole number from 1 to 50.', 'zero pieces refused'); has(oe, 'Stitching price: type an amount', 'three decimals refused');
        await page.fill('#pieces', '4'); await page.fill('#price', '0'); await page.fill('#advance', '');
        await page.fill('#promised', '2026-10-20');
        has(await page.locator('#promised-note').innerText(), 'this date has passed', 'past ready date warned');
        await page.fill('#given', '2026-10-20');
        const long = 'Pleats on top, lining, ' + 'very long note '.repeat(120);
        await page.click('#note-open').catch(() => { });
        await page.fill('#note', long);
        await page.click('#add-btn');
        const cur = await order(page, "Neighbour aunty's Curtains").innerText();
        has(cur, 'No charge', 'free order'); has(cur, '7 days late', 'old order shows late');
        eq((await order(page, "Neighbour aunty's Curtains").locator('.o-note').innerText()).length, 1000, 'long note kept to 1000');
        eq(await page.getAttribute('#person-name', 'maxlength'), '60', 'name limited');

        // the day after tomorrow, at midnight the dates move on by themselves
        await page.clock.fastForward('40:00:00');
        has(await order(page, "Ali's Kurta shalwar").innerText(), 'Ready today, Thu 29 Oct', 'midnight: dates moved on');
        eq(page.errors, [], 'block 2: no console errors');
        await ctx.close();
    }

    console.log('block 3: storage, backup and restore');
    {
        const { ctx, page } = await newPage(browser, base, 390);
        await fillRealistic(page);
        // backup
        const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#backup')]);
        eq(dl.suggestedFilename(), 'tailor-orders-backup-2026-10-27.json', 'backup file name');
        const file = await dl.path();
        const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
        eq([saved.app, saved.currency, saved.data.people.length, saved.data.orders.length], [SLUG, 'Rs', 4, 5], 'backup content');
        // delete everything, undo
        await page.click('#wipe');
        has(await glance(page), 'Nothing at the tailor yet', 'wiped');
        await page.click('#set-msg .undo');
        has(await glance(page), 'Still to pay: Rs 7,200', 'wipe undone');
        await page.click('#wipe');
        // restore
        await page.setInputFiles('#restore-file', file);
        has(await msgSays(page, 'set-msg', 'Restored 4'), 'Restored 4 people and 5 orders.', 'restored');
        has(await glance(page), 'Still to pay: Rs 7,200', 'restored state');
        // bad files
        const bad = path.join(require('os').tmpdir(), 'tailor-bad.json');
        fs.writeFileSync(bad, '{not json'); await page.setInputFiles('#restore-file', bad);
        has(await msgSays(page, 'set-msg', 'could not be read'), 'could not be read', 'broken file refused');
        fs.writeFileSync(bad, '{"hello":1}'); await page.setInputFiles('#restore-file', bad);
        has(await msgSays(page, 'set-msg', 'is not a backup'), 'is not a backup', 'other file refused');
        has(await glance(page), 'Still to pay: Rs 7,200', 'bad file changed nothing');
        // a restored file with odd values is made safe
        fs.writeFileSync(bad, JSON.stringify({ people: [{ name: 'X', sets: [{ unit: 'in', date: '2026-01-01', values: { chest: -5, waist: 30 } }] }], orders: [{ personName: '<b>Y</b>', item: 'Kurta', tailor: 'T', given: '2026-10-01', price: 'lots', payments: [{ cents: 500, date: '2026-10-02' }] }] }));
        await page.setInputFiles('#restore-file', bad);
        has(await msgSays(page, 'set-msg', 'Restored 1'), 'Restored 1 person and 1 order.', 'odd file restored');
        has(await order(page, "<b>Y</b>'s Kurta").innerText(), '<b>Y</b>: Kurta', 'names shown as text, never as HTML');
        has(await order(page, "<b>Y</b>'s Kurta").innerText(), 'Paid Rs 5, price not set', 'bad price dropped');
        await page.click('#set-msg .undo');
        // corrupt saved data
        await page.evaluate(k => localStorage.setItem(k, '{broken'), SLUG + '.data');
        await page.reload({ waitUntil: 'load' });
        has(await page.locator('#storage-warn').innerText(), 'damaged', 'corrupt data: clear message');
        has(await glance(page), 'Nothing at the tailor yet', 'corrupt data: starts fresh');
        eq(await page.evaluate(k => localStorage.getItem(k), SLUG + '.data.damaged'), '{broken', 'corrupt data kept aside');
        // only this app's keys
        const keys = await page.evaluate(() => Object.keys(localStorage));
        ok(keys.every(k => k.startsWith(SLUG + '.') || k === 'apps.theme' || k.startsWith('apps.')), 'storage keys start with the slug: ' + keys.join(','));
        eq(page.errors, [], 'block 3: no console errors');
        await ctx.close();
    }
    {
        const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
        await ctx.route(/goatcounter\.com|gc\.zgo\.at/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
        await ctx.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
        const page = await ctx.newPage(); page.setDefaultTimeout(6000); const errs = []; page.on('pageerror', e => errs.push(e.message));
        await page.goto(base + '/' + SLUG + '/', { waitUntil: 'load' });
        ok(await page.locator('#storage-warn').isVisible(), 'storage blocked: warning shown');
        await addOrder(page, { name: 'Ali', item: 'Kurta', tailor: 'M' });
        has(await page.locator('#order-list').innerText(), 'Ali: Kurta', 'storage blocked: still works for this visit');
        eq(errs, [], 'storage blocked: no errors');
        await ctx.close();
    }
    // keyboard only: Enter in a box adds the order
    {
        const { ctx, page } = await newPage(browser, base, 1280);
        await page.fill('#person-name', 'Ali'); await page.fill('#item', 'Kurta'); await page.fill('#tailor', 'Master Tailor');
        await page.press('#tailor', 'Enter');
        has(await page.locator('#order-list').innerText(), 'Ali: Kurta', 'keyboard: Enter adds');
        const names = await page.evaluate(() => [...document.querySelectorAll('input, select, textarea')].filter(e => e.type !== 'file' && e.type !== 'radio' && e.offsetParent).filter(e => !(e.labels && e.labels.length) && !e.getAttribute('aria-label')).map(e => e.id));
        eq(names, [], 'every visible field has a label');
        await ctx.close();
    }

    console.log('block 4: every width, dark and light');
    for (const scheme of (process.env.QUICK ? ['dark'] : ['dark', 'light'])) {
        for (const w of (process.env.QUICK ? [320, 390, 1280] : [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920])) {
            const { ctx, page } = await newPage(browser, base, w, { scheme });
            const tag = scheme + ' ' + w + ': ';
            let r = await overlapCheck(page);
            eq([r.scroll, r.out, r.bad, r.clipped], [false, [], [], []], tag + 'empty state layout');
            if (w <= 390) eq(r.ph, [], tag + 'placeholders fit (empty state)');
            await fillRealistic(page);
            // open every optional thing
            await page.click('#money-open').catch(() => { }); await page.click('#note-open').catch(() => { });
            await page.click('button[aria-label="Add payment: Ayesha\'s Suit (3 piece)"]');
            await page.click('button[aria-label="Collected: Ali\'s Kurta shalwar"]');
            await page.click('button[aria-label="Back to tailor for a fix: Sara\'s Dress"]');
            for (const d of await page.locator('main details').all()) await d.evaluate(e => { e.open = true; });
            r = await overlapCheck(page);
            eq([r.scroll, r.out, r.bad, r.clipped], [false, [], [], []], tag + 'filled layout with every panel open');
            if (w <= 390) eq(r.ph, [], tag + 'placeholders fit (filled)');
            await page.click('button[aria-label="New measurements: Ayesha"]');
            await page.click('#add-person');
            await page.click('#person-form-slot button:text-is("+ Add another measurement (optional)")');
            await page.click('#person-form-slot button:text-is("+ Add a fit note (optional)")');
            r = await overlapCheck(page);
            eq([r.scroll, r.out, r.bad, r.clipped], [false, [], [], []], tag + 'person forms open');
            if (w <= 390) eq(r.ph, [], tag + 'placeholders fit (person forms)');
            if (w >= 900) {
                for (const pos of [0, 0.5, 1]) {
                    await page.evaluate(p => window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * p), pos);
                    const o = await page.evaluate(() => {
                        const out = [];
                        const groups = [document.querySelector('main'), document.querySelector('.col-main'), document.querySelector('.col-side')];
                        groups.forEach(g => {
                            const kids = [...g.children].filter(e => e.getBoundingClientRect().height > 0);
                            for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
                                const a = kids[i].getBoundingClientRect(), b = kids[j].getBoundingClientRect();
                                if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) out.push(kids[i].className + '/' + kids[j].className);
                            }
                        });
                        return out;
                    });
                    eq(o, [], tag + 'no blocks overlap at scroll ' + pos);
                }
                const cols = await page.evaluate(() => [document.querySelector('.col-main').getBoundingClientRect().left, document.querySelector('.col-side').getBoundingClientRect().left]);
                ok(cols[1] > cols[0] + 300, tag + 'desktop has two columns');
            }
            if ([320, 390, 820, 1280].includes(w)) {
                await page.evaluate(() => window.scrollTo(0, 0));
                const hb = page.locator('.topbar button:has-text("Help"), button.help-btn').first();
                await hb.click();
                const d = page.locator('dialog.help');
                const bb = await d.boundingBox();
                ok(bb && bb.x >= 0 && bb.x + bb.width <= w + 1 && bb.y >= 0 && bb.y + bb.height <= 900 + 1, tag + 'help dialog on screen');
                has(await d.locator('h2').innerText(), 'How to use Tailor Orders and Family Measurements', tag + 'help title');
                await page.keyboard.press('Escape');
                ok(!(await d.evaluate(e => e.open)), tag + 'Escape closes help');
                await hb.click(); await page.click('.help-close');
                ok(!(await d.evaluate(e => e.open)), tag + 'Got it closes help');
                const bar = await page.evaluate(() => [...document.querySelectorAll('.topbar > *, .topbar > * > *')].filter(e => e.tagName === 'A' || e.tagName === 'BUTTON').map(e => { const r = e.getBoundingClientRect(); return [r.top, r.bottom, r.left, r.right]; }));
                let clash = false; for (let i = 0; i < bar.length; i++) for (let j = i + 1; j < bar.length; j++) if (Math.min(bar[i][3], bar[j][3]) - Math.max(bar[i][2], bar[j][2]) > 1 && Math.min(bar[i][1], bar[j][1]) - Math.max(bar[i][0], bar[j][0]) > 1) clash = true;
                ok(!clash, tag + 'top bar buttons do not overlap');
            }
            if (w === 390) {
                const bg1 = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
                await page.click('.theme-toggle');
                const bg2 = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
                ok(bg1 !== bg2, tag + 'theme switch changes the look');
            }
            eq(page.errors, [], tag + 'no console errors');
            await ctx.close();
        }
    }
    if (SHOTS) {
        {
            const { ctx, page } = await newPage(browser, base, 1280, { height: 1000 });
            await fillRealistic(page);
            await page.reload({ waitUntil: 'load' });
            await page.evaluate(() => window.scrollTo(0, 0));
            await page.screenshot({ path: path.join(__dirname, 'screenshots/desktop.png') });
            if (process.env.PEEK) { await page.evaluate(() => document.querySelector('#family').scrollIntoView()); await page.screenshot({ path: process.env.PEEK }); }
            await ctx.close();
        }
        {
            const { ctx, page } = await newPage(browser, base, 390, { scale: 2 });
            await fillRealistic(page);
            await page.reload({ waitUntil: 'load' });
            // the phone shot shows the list at the tailor, then the orders
            await page.evaluate(() => window.scrollTo(0, 0));
            await page.screenshot({ path: path.join(__dirname, 'screenshots/phone.png'), fullPage: true, clip: { x: 0, y: 0, width: 390, height: 1700 } });
            await ctx.close();
        }
    }
    {
        const ctx = await browser.newContext(); const page = await ctx.newPage();
        await page.goto(base + '/' + SLUG + '/test.html');
        const r = await page.evaluate(() => window.TEST_RESULT);
        eq(r && r.fails, [], 'test.html logic checks pass in the browser (' + (r && r.pass) + ')');
        await ctx.close();
    }
    await browser.close();
    if (srv) srv.s.close();
    console.log((live ? 'LIVE ' : 'LOCAL ') + pass + ' UI checks passed' + (fails.length ? ', ' + fails.length + ' FAILED:\n - ' + fails.join('\n - ') : ''));
    process.exitCode = fails.length ? 1 : 0;
})();
