// Drives the real page in headless Chromium. Run from the repo root:
//   node event-budget-and-vendor-payments-planner/ui-test.js [--base http://localhost:8765] [--shots]
// --base defaults to a local server you start yourself (python3 -m http.server 8765 in the repo root).
// --shots also saves screenshots/desktop.png and screenshots/phone.png.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const args = process.argv.slice(2);
const bi = args.indexOf('--base'), BASE = (bi >= 0 ? args[bi + 1] : 'http://localhost:8765').replace(/\/$/, '');
const URL = BASE + '/event-budget-and-vendor-payments-planner/';
const KEY = 'event-budget-and-vendor-payments-planner.state';
const DIR = __dirname;
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; if (!cond) console.log('FAIL ' + name + (extra ? '  ' + extra : '')); };
const NOW = new Date('2026-10-29T10:00:00');

async function open(browser, width, opts) {
    opts = opts || {};
    const ctx = await browser.newContext({ viewport: { width, height: width < 600 ? 800 : 900 }, deviceScaleFactor: opts.scale || 1, colorScheme: opts.scheme || 'dark', locale: opts.locale || 'en-GB', acceptDownloads: true });
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
const clean = s => s.replace(/\s+/g, ' ').trim();
const text = async (loc) => clean(await loc.first().innerText());
const evBox = (page, name) => page.locator('.event', { has: page.locator('.e-name', { hasText: new RegExp('^' + name + '$') }) });
const vBox = (page, name) => page.locator('.vendor', { has: page.locator('.v-name', { hasText: new RegExp('^' + name + '$') }) });
const form = page => page.locator('.inline-form').first();
const fillIn = async (page, label, value) => { await form(page).getByLabel(label, { exact: true }).fill(value); };

// realistic filled-in state: Sara's family on Thu 29 Oct 2026, Mehndi on 12 Dec and Walima on 14 Dec
const V = (id, name, cat, price, pays, plan, extra) => Object.assign({ id, name, cat, catName: '', mode: 'fixed', price, rate: 0, guests: 0, history: [], pays, plan, status: 'booked', contact: '', note: '' }, extra || {});
const P = (id, d, amt, note, kind) => ({ id, d, amt, kind: kind || 'pay', note: note || '' });
const SEED = { v: 1, cur: 'Rs', group: 'lakh', events: [
    { id: 'e1', name: 'Mehndi', date: '2026-12-12', budget: 90000000, catBudgets: { food: 30000000 }, note: '250 guests at the Royal Marquee, Canal Road', vendors: [
        V('h', 'Royal Marquee', 'venue', 25000000, [P('p1', '2026-09-01', 10000000, 'Advance, bank transfer')], [{ id: 'd1', d: '2026-12-10', amt: 15000000 }], { contact: '0300 1234567, Imran' }),
        V('f', 'Al-Noor Caterers', 'food', 0, [P('p2', '2026-09-05', 15000000, 'Advance')], [{ id: 'd2', d: '2026-12-11', amt: 20000000 }], { mode: 'perhead', rate: 140000, guests: 250, history: [{ d: '2026-10-15', from: 32500000, to: 35000000 }] }),
        V('d', 'Gul Decor', 'decor', 12000000, [P('p3', '2026-10-01', 5000000, 'Advance, cash')], [{ id: 'd3', d: '2026-10-20', amt: 7000000 }]),
        V('p', 'Lens Studio', 'photo', 12000000, [P('p4', '2026-10-02', 5000000)], [])] },
    { id: 'e2', name: 'Walima', date: '2026-12-14', budget: 150000000, catBudgets: {}, note: '', vendors: [
        V('w1', 'Pearl Banquet Hall', 'venue', 0, [P('p5', '2026-10-10', 30000000)], [{ id: 'd4', d: '2026-11-15', amt: 40000000 }, { id: 'd5', d: '2026-12-14', amt: 40000000 }], { mode: 'perhead', rate: 220000, guests: 500 }),
        V('w2', 'DJ Sonic', 'music', 4000000, [P('p6', '2026-09-20', 1000000), P('p7', '2026-10-05', 600000, 'Refund on cancelling', 'refund')], [], { status: 'cancelled' })] }] };

async function main() {
    const browser = await chromium.launch();
    let page = await open(browser, 390, { locale: 'en-PK' });

    // ---------- first use ----------
    ok('first use: how it works shown, nothing else', await page.isVisible('#intro') && !(await page.isVisible('#due')) && !(await page.isVisible('#events')));
    ok('first use heading', (await text(page.locator('#add-h'))) === 'Add your first event');
    ok('budget is optional and hidden', !(await page.isVisible('#e-budget')));
    await page.click('#e-save');
    ok('blank event name refused', (await text(page.locator('#e-name-err'))).startsWith('Type a name'));
    await page.click('#quick .chip:has-text("Mehndi")');
    ok('quick pick fills the name', (await page.inputValue('#e-name')) === 'Mehndi');
    await page.fill('#e-date', '2026-12-12');
    await page.click('#e-budget-open');
    await page.fill('#e-budget', 'lots');
    await page.click('#e-save');
    ok('bad budget refused', (await text(page.locator('#e-budget-err'))).length > 0 && (await saved(page)) === null);
    await page.fill('#e-budget', '9 lakh');
    await page.click('#e-save');
    let s = await saved(page);
    ok('event saved with budget 9 lakh', s.events.length === 1 && s.events[0].budget === 90000000 && s.events[0].date === '2026-12-12');
    ok('vendor form opens straight away', await page.isVisible('.inline-form') && (await text(page.locator('.inline-form .f-h'))) === 'Add a vendor to Mehndi');

    // vendor 1: hall with advance and a due date for the rest (amount left blank)
    await fillIn(page, 'Vendor or what it is', 'Royal Marquee');
    await form(page).getByLabel('What is it for?').selectOption('venue');
    await page.click('.inline-form button:has-text("Add vendor")');
    ok('vendor price required', (await text(form(page).locator('.err:not(:empty)'))).startsWith('Type an amount'));
    await fillIn(page, 'Agreed price', '2,50,000');
    await page.click('.inline-form button:has-text("+ Advance already paid")');
    await fillIn(page, 'Advance paid', '1 lakh');
    await fillIn(page, 'Paid on', '2026-09-01');
    await page.click('.inline-form button:has-text("+ When the rest is due")');
    await fillIn(page, 'Due on', '2026-12-10');
    await page.click('.inline-form button:has-text("Add vendor")');
    let hall = vBox(page, 'Royal Marquee');
    ok('hall: paid 1,00,000, still to pay 1,50,000', (await text(hall)).includes('Paid1,00,000') || (await text(hall.locator('.stats'))) === 'Paid 1,00,000 Still to pay 1,50,000', await text(hall.locator('.stats')));
    ok('hall: blank due amount means all that is left', (await text(hall.locator('.due-row'))).startsWith('1,50,000 due Thu 10 Dec · in 42 days'));

    // vendor 2: caterer per guest
    await page.click('#ev-list .event button:has-text("+ Add a vendor")');
    await fillIn(page, 'Vendor or what it is', 'Al-Noor Caterers');
    await form(page).getByLabel('Price per guest × number of guests').check();
    await fillIn(page, 'Price per guest', '1400');
    await fillIn(page, 'Number of guests', '2.5');
    await page.click('.inline-form button:has-text("Add vendor")');
    ok('guests must be whole', (await text(form(page).locator('.err:not(:empty)'))).includes('whole number'));
    await fillIn(page, 'Number of guests', '250');
    ok('per guest total shown live', (await text(form(page).locator('.hint').first())) === 'Agreed price: 3,50,000');
    await page.click('.inline-form button:has-text("+ Advance already paid")');
    await fillIn(page, 'Advance paid', '400000');
    await page.click('.inline-form button:has-text("Add vendor")');
    ok('advance bigger than price refused', (await text(form(page).locator('.err:not(:empty)'))).includes('more than the agreed price of 3,50,000'));
    await fillIn(page, 'Advance paid', '150000');
    await fillIn(page, 'Paid on', '2026-09-05');
    await page.click('.inline-form button:has-text("+ When the rest is due")');
    await fillIn(page, 'Amount due then (optional)', '200000');
    await page.click('.inline-form button:has-text("Add vendor")');
    ok('due amount without a date refused', (await text(form(page).locator('.err:not(:empty)'))).startsWith('Pick the date'));
    await fillIn(page, 'Due on', '2026-12-11');
    await page.click('.inline-form button:has-text("Add vendor")');
    ok('caterer agreed per guest', (await text(vBox(page, 'Al-Noor Caterers').locator('.v-line'))) === 'Agreed 3,50,000 (250 guests × 1,400)');

    // vendors 3 and 4: only the required fields (optional ones not forced), then a late due date
    for (const [n, cat, price] of [['Gul Decor', 'decor', '120000'], ['Lens Studio', 'photo', '120000']]) {
        await page.click('#ev-list .event button:has-text("+ Add a vendor")');
        await fillIn(page, 'Vendor or what it is', n);
        await form(page).getByLabel('What is it for?').selectOption(cat);
        await fillIn(page, 'Agreed price', price);
        await page.click('.inline-form button:has-text("Add vendor")');
    }
    ok('vendor with only name and price is saved', (await saved(page)).events[0].vendors.length === 4);
    for (const n of ['Gul Decor', 'Lens Studio']) {
        await vBox(page, n).locator('button:has-text("Record a payment")').click();
        ok('payment amount suggests the balance for ' + n, (await form(page).getByLabel('Amount', { exact: true }).inputValue()) === '120000');
        await fillIn(page, 'Amount', '50000');
        await fillIn(page, 'Date', '2026-10-01');
        await page.click('.inline-form button:has-text("Save payment")');
    }
    ok('payment message says what is left', (await text(page.locator('#ev-list .event .msg'))).includes('Still to pay 70,000.'));
    await vBox(page, 'Gul Decor').locator('button:has-text("+ Due date")').click();
    ok('due date suggests what is left', (await form(page).getByLabel('Amount due', { exact: true }).inputValue()) === '70000');
    await page.click('.inline-form button:has-text("Save due date")');
    ok('due date required', (await text(form(page).locator('.err:not(:empty)'))) === 'Pick a date.');
    await fillIn(page, 'Due on', '2026-10-20');
    await page.click('.inline-form button:has-text("Save due date")');

    // ---------- the answer ----------
    const ev = evBox(page, 'Mehndi');
    ok('event: 8,40,000 agreed of 9,00,000 budget', (await text(ev.locator('.e-big'))) === '8,40,000 agreed of 9,00,000 budget');
    ok('event: 60,000 not promised yet', (await text(ev.locator('.e-left'))) === '60,000 of the budget not promised yet');
    ok('event: paid 3,50,000, still to pay 4,90,000, 4 vendors', (await text(ev.locator('.stats.three'))) === 'Paid 3,50,000 Still to pay 4,90,000 Vendors 4', await text(ev.locator('.stats.three')));
    ok('late due shown in red words', (await text(vBox(page, 'Gul Decor').locator('.due-row'))).includes('9 days late') && await vBox(page, 'Gul Decor').evaluate(e => e.classList.contains('k-late')));
    ok('payments due: late decor first', (await text(page.locator('#due-body .next'))) === 'LATE 70,000 to Gul Decor Tue 20 Oct · 9 days late · Mehndi', await text(page.locator('#due-body .next')));
    ok('payments due: after that in date order', (await text(page.locator('#due-body .u-list'))).replace(/ /g, '').startsWith('Thu10Dec:1,50,000toRoyalMarqueeMehndi,in42days'));
    ok('payments due: unplanned photographer', (await text(page.locator('#due-body'))).includes('Also 70,000 still to pay with no due date yet.'));
    ok('by category listed', (await text(ev.locator('.cat-list'))).includes('Food and catering 3,50,000'));

    // ---------- paid it, undo, part payment ----------
    await vBox(page, 'Gul Decor').locator('button:has-text("Paid it")').click();
    ok('paid it suggests the due amount', (await form(page).getByLabel('Amount', { exact: true }).inputValue()) === '70000');
    await page.click('.inline-form button:has-text("Save payment")');
    ok('paid it: decor fully paid, due gone', (await text(vBox(page, 'Gul Decor').locator('.v-top'))).includes('Fully paid') && await vBox(page, 'Gul Decor').locator('.due-row').count() === 0);
    ok('message says fully paid with undo', (await text(page.locator('#ev-list .event .msg'))).includes('Fully paid.') && await page.isVisible('#ev-list .event .msg button:has-text("Undo")'));
    await page.click('#ev-list .event .msg button:has-text("Undo")');
    ok('undo brings the due back', await vBox(page, 'Gul Decor').locator('.due-row').count() === 1);
    hall = vBox(page, 'Royal Marquee');
    await hall.locator('button:has-text("Record a payment")').click();
    ok('vendor buttons hidden while its form is open', await hall.locator('.v-btns').isHidden() && await hall.locator('button:has-text("Record a payment")').count() === 0);
    await fillIn(page, 'Amount', '50000');
    ok('take-off-due ticked by default', await form(page).locator('input[type=checkbox]').isChecked());
    await page.click('.inline-form button:has-text("Save payment")');
    ok('part payment lowers the due to 1,00,000', (await text(hall.locator('.due-row'))).startsWith('1,00,000 due Thu 10 Dec'));
    await hall.locator('button:has-text("Record a payment")').click();
    await fillIn(page, 'Amount', '10000');
    await form(page).locator('input[type=checkbox]').uncheck();
    await page.click('.inline-form button:has-text("Save payment")');
    ok('unticked: due stays, rest has no date', (await text(hall.locator('.due-row'))).startsWith('1,00,000 due') && (await text(hall.locator('.stats'))) === 'Paid 1,60,000 Still to pay 90,000');
    ok('over planned warning', (await text(hall)).includes('The due dates add up to 10,000 more than what is left to pay'));
    // refund too big, then edit and delete a payment
    await hall.locator('button:has-text("Record a payment")').click();
    await form(page).getByLabel('Royal Marquee gave money back (refund)').check();
    await fillIn(page, 'Amount', '200000');
    await page.click('.inline-form button:has-text("Save payment")');
    ok('refund more than paid refused', (await text(form(page).locator('.err:not(:empty)'))).includes('cannot be more than the 1,60,000 paid'));
    await page.click('.inline-form button:has-text("Cancel")');
    ok('payments list opens after a payment', await hall.locator('button:has-text("Hide payments (3)")').count() === 1);
    ok('payments list shown', await hall.locator('.pays li').count() === 3);
    await hall.locator('.pays li:has-text("10,000") button:has-text("Delete")').click();
    ok('delete payment', (await text(hall.locator('.stats'))) === 'Paid 1,50,000 Still to pay 1,00,000');
    await hall.locator('.pays li:has-text("50,000") button:has-text("Edit")').click();
    await fillIn(page, 'Amount', '-5');
    await page.click('.inline-form button:has-text("Save changes")');
    ok('negative amount refused', (await text(form(page).locator('.err:not(:empty)'))).includes('without a minus'));
    await fillIn(page, 'Amount', '0');
    await page.click('.inline-form button:has-text("Save changes")');
    ok('zero payment refused', (await text(form(page).locator('.err:not(:empty)'))).includes('bigger than 0'));
    await page.click('.inline-form button:has-text("Cancel")');

    // ---------- price change keeps history ----------
    await hall.locator('.v-btns button:has-text("Edit")').click();
    ok('edit form filled in', (await form(page).getByLabel('Agreed price', { exact: true }).inputValue()) === '250000');
    await fillIn(page, 'Agreed price', '260000');
    await page.click('.inline-form button:has-text("+ Phone number or note")');
    await fillIn(page, 'Phone or contact', '0300 1234567, Imran');
    await page.click('.inline-form button:has-text("Save changes")');
    ok('price change history shown', (await text(hall)).includes('Price changed on Thu 29 Oct from 2,50,000 to 2,60,000.'));
    ok('contact shown', (await text(hall)).includes('Contact: 0300 1234567, Imran'));

    // ---------- cancel and book again ----------
    const photo = vBox(page, 'Lens Studio');
    await photo.locator('button:has-text("Cancel booking")').click();
    await fillIn(page, 'Refund you got back (optional)', '60000');
    await page.click('.inline-form button:has-text("Cancel the booking")');
    ok('cancel refund more than paid refused', (await text(form(page).locator('.err:not(:empty)'))).includes('cannot be more than the 50,000'));
    await fillIn(page, 'Refund you got back (optional)', '20000');
    await page.click('.inline-form button:has-text("Cancel the booking")');
    ok('cancelled: money lost 30,000', (await text(photo.locator('.v-big'))) === 'Money lost: 30,000' && (await text(photo.locator('.v-top'))).includes('Cancelled'));
    ok('event counts the lost money', (await text(ev)).includes('Includes 30,000 lost on cancelled bookings.'));
    await photo.locator('button:has-text("Book again")').click();
    ok('book again', (await text(photo.locator('.stats'))) === 'Paid 30,000 Still to pay 90,000');

    // ---------- category budget ----------
    await ev.locator('button:has-text("+ Budget per category")').click();
    await fillIn(page, 'Food and catering', '3 lakh');
    await page.click('.inline-form button:has-text("Save budgets")');
    ok('food over budget by 50,000', (await text(ev.locator('.cat.over'))) === 'Food and catering 3,50,000 of 3,00,000 over by 50,000');

    // ---------- delete with undo, reload ----------
    await vBox(page, 'Gul Decor').locator('.v-btns button:has-text("Delete")').click();
    ok('delete vendor', await vBox(page, 'Gul Decor').count() === 0);
    await page.click('#ev-list .event .msg button:has-text("Undo")');
    ok('undo delete vendor', await vBox(page, 'Gul Decor').count() === 1);
    await page.reload({ waitUntil: 'load' });
    ok('reload keeps everything', await page.locator('.vendor').count() === 4 && (await text(evBox(page, 'Mehndi').locator('.e-big'))) === '8,50,000 agreed of 9,00,000 budget');
    ok('no errors in the main run', page.errors.length === 0 && page.bad.length === 0, page.errors.join(' | '));
    await page.context().close();

    // ---------- second event, copy, share, settings ----------
    page = await open(browser, 1280, { state: JSON.stringify(SEED) });
    ok('seed: totals across events', (await text(page.locator('#due-body .stats'))) === 'All agreed Rs 19,44,000 All paid Rs 6,54,000 All still to pay Rs 12,90,000', await text(page.locator('#due-body .stats')));
    ok('seed: cancelled DJ lost 4,000', (await text(vBox(page, 'DJ Sonic').locator('.v-big'))) === 'Money lost: Rs 4,000');
    await vBox(page, 'Royal Marquee').locator('button:has-text("Copy to event")').click();
    await form(page).getByLabel('Which event?').selectOption('e2');
    await page.click('.inline-form button:has-text("Copy vendor")');
    ok('copied to Walima without payments', (await text(evBox(page, 'Walima').locator('.vendor', { hasText: 'Royal Marquee' }).locator('.stats'))) === 'Paid Rs 0 Still to pay Rs 2,50,000');
    await evBox(page, 'Mehndi').locator('button:has-text("Copy summary")').click();
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    ok('copy summary text', clip.startsWith('Mehndi (Sat 12 Dec 2026)\nRs 8,40,000 agreed of Rs 9,00,000 budget: Rs 60,000 not promised yet. Paid Rs 3,50,000. Still to pay Rs 4,90,000.'), clip.slice(0, 200));
    const mail = await evBox(page, 'Mehndi').locator('a:has-text("Email summary")').getAttribute('href');
    ok('email summary works with no recipient', mail.startsWith('mailto:?subject=Mehndi%20budget&body=Mehndi'));
    ok('email everything link', (await page.getAttribute('#mail-all', 'href')).startsWith('mailto:?subject=Event%20budget&body='));
    let [dl] = await Promise.all([page.waitForEvent('download'), page.click('#csv')]);
    const csvText = fs.readFileSync(await dl.path(), 'utf8');
    ok('spreadsheet file', dl.suggestedFilename() === 'event-budget-2026-10-29.csv' && csvText.includes('Mehndi,2026-12-12,Gul Decor,Decor and flowers,Booked,120000.00,Still due,2026-10-20,70000.00,'));
    await page.selectOption('#cur', '$');
    await page.selectOption('#group', 'west');
    ok('currency and grouping change', (await text(evBox(page, 'Mehndi').locator('.e-big'))) === '$840,000 agreed of $900,000 budget');
    [dl] = await Promise.all([page.waitForEvent('download'), page.click('#backup')]);
    const backupPath = path.join(DIR, '..', '.ui-backup.json');
    fs.copyFileSync(await dl.path(), backupPath);
    await page.click('#del-all');
    ok('delete everything', !(await page.isVisible('#events')) && await page.isVisible('#intro'));
    await page.click('#tools-msg button:has-text("Undo")');
    ok('undo delete everything', await page.locator('.event').count() === 2);
    await page.click('#del-all');
    await page.setInputFiles('#restore-file', backupPath);
    await page.waitForTimeout(300);
    ok('restore backup', await page.locator('.event').count() === 2 && (await text(page.locator('#tools-msg'))).startsWith('Restored 2 events'));
    const junk = path.join(DIR, '..', '.ui-junk.json'); fs.writeFileSync(junk, '{"hello":1}');
    await page.setInputFiles('#restore-file', junk);
    await page.waitForTimeout(300);
    ok('junk file refused, nothing changed', (await text(page.locator('#tools-msg'))).startsWith('That file is not a backup') && await page.locator('.event').count() === 2);
    fs.unlinkSync(junk); fs.unlinkSync(backupPath);
    await evBox(page, 'Walima').locator('button:has-text("Delete event")').click();
    ok('delete event', await page.locator('.event').count() === 1);
    await page.click('#top-msg button:has-text("Undo")');
    ok('undo delete event', await page.locator('.event').count() === 2);
    // edit event: rename, remove budget
    await evBox(page, 'Walima').locator('button:has-text("Edit event")').click();
    await fillIn(page, 'Total budget (optional)', '');
    await fillIn(page, 'Event name', 'Walima reception');
    await page.click('.inline-form button:has-text("Save changes")');
    ok('edit event: no budget', (await text(evBox(page, 'Walima reception').locator('.e-left'))) === 'No budget set. Tap Edit event to add one.');
    // long text and pasted values
    await evBox(page, 'Mehndi').locator('button:has-text("+ Add a vendor")').click();
    await fillIn(page, 'Vendor or what it is', 'A'.repeat(70));
    await form(page).getByLabel('What is it for?').selectOption('other');
    await page.click('.inline-form button:has-text("Add vendor")');
    ok('other category needs a name', (await text(form(page).locator('.err:not(:empty)'))).includes('name for the category'));
    await fillIn(page, 'Name the category', 'Fireworks');
    await fillIn(page, 'Agreed price', '  $25,000.50 ');
    await page.click('.inline-form button:has-text("Add vendor")');
    const long = page.locator('.vendor', { hasText: 'Fireworks' });
    ok('long name cut to 60, pasted amount with cents', (await text(long.locator('.v-name'))).length === 60 && (await text(long.locator('.v-line'))) === 'Agreed $25,000.50');
    const lightBefore = await page.evaluate(() => getComputedStyle(document.body).color);
    await page.click('.theme-toggle');
    ok('light/dark switch changes the look', lightBefore !== await page.evaluate(() => getComputedStyle(document.body).color));
    ok('no errors in the seeded run', page.errors.length === 0 && page.bad.length === 0, page.errors.join(' | '));
    await page.context().close();

    // ---------- the next day, corrupt and blocked storage, lakh by language ----------
    page = await open(browser, 390, { state: JSON.stringify(SEED), now: new Date('2026-12-11T09:00:00') });
    ok('next day: hall 1 day late, caterer due today', (await text(vBox(page, 'Royal Marquee').locator('.due-row'))).includes('1 day late') && (await text(vBox(page, 'Al-Noor Caterers').locator('.due-row'))).includes('due today'));
    await page.context().close();
    page = await open(browser, 390, { state: '{not json' });
    ok('corrupt saved state: starts fresh with a message', (await text(page.locator('#top-msg'))).startsWith('Your saved events could not be read') && page.errors.length === 0);
    await page.context().close();
    page = await open(browser, 390, { block: true });
    await page.fill('#e-name', 'Test'); await page.click('#e-save');
    ok('blocked storage: warning and still works', await page.isVisible('#store-warn') && await page.locator('.event').count() === 1 && page.errors.length === 0, page.errors.join('|'));
    await page.context().close();
    page = await open(browser, 390, { locale: 'en-PK' });
    ok('lakh grouping for Pakistan', (await page.inputValue('#group')) === 'lakh');
    await page.context().close();
    page = await open(browser, 390, { locale: 'en-US' });
    ok('thousands grouping for the US', (await page.inputValue('#group')) === 'west');
    // keyboard: Enter in the name adds the event
    await page.fill('#e-name', 'Birthday party'); await page.press('#e-name', 'Enter');
    ok('Enter adds the event', await page.locator('.event').count() === 1);
    await page.context().close();

    // ---------- help, layout and sizes ----------
    for (const w of [320, 390, 820, 1280]) {
        page = await open(browser, w, { state: JSON.stringify(SEED) });
        await page.click('.help-btn, button:has-text("Help")');
        const d = page.locator('dialog[open]').first();
        await d.waitFor();
        const r = await d.boundingBox();
        ok('help fits at ' + w, r && r.x >= 0 && r.x + r.width <= w + 1 && (await d.innerText()).includes('How to use the Event Budget and Vendor Payments Planner'));
        await page.keyboard.press('Escape');
        ok('help closes with Escape at ' + w, !(await d.isVisible()));
        await page.click('.help-btn, button:has-text("Help")');
        await page.click('button:has-text("Got it")');
        ok('help closes with Got it at ' + w, !(await d.isVisible()));
        await page.context().close();
    }
    async function overlaps(page) {
        return page.evaluate(() => {
            const els = [...document.querySelectorAll('input:not([type=radio]):not([type=checkbox]):not([type=file]), select, button, textarea, a.secondary')].filter(e => e.offsetParent);
            const bad = [];
            for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
                const a = els[i].getBoundingClientRect(), b = els[j].getBoundingClientRect();
                if (a.width && b.width && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) bad.push((els[i].id || els[i].textContent.slice(0, 20)) + ' x ' + (els[j].id || els[j].textContent.slice(0, 20)));
            }
            return bad;
        });
    }
    const placeholders = page => page.evaluate(() => [...document.querySelectorAll('input[placeholder]')].filter(i => i.offsetParent).filter(i => { const c = document.createElement('canvas').getContext('2d'); const cs = getComputedStyle(i); c.font = cs.fontSize + ' ' + cs.fontFamily; return c.measureText(i.placeholder).width > i.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) + 1; }).map(i => i.id));
    for (const w of [320, 360, 390]) {
        page = await open(browser, w, { state: JSON.stringify(SEED) });
        await page.click('#e-budget-open');
        const checks = [
            ['add vendor', async () => { await evBox(page, 'Mehndi').locator('button:has-text("+ Add a vendor")').click(); for (const b of await form(page).locator('button.link').all()) await b.click(); }],
            ['per guest', async () => { await evBox(page, 'Mehndi').locator('button:has-text("+ Add a vendor")').click(); await form(page).getByLabel('Price per guest × number of guests').check(); await form(page).getByLabel('What is it for?').selectOption('other'); }],
            ['payment', async () => { await vBox(page, 'Royal Marquee').locator('button:has-text("Record a payment")').click(); }],
            ['paid it', async () => { await vBox(page, 'Royal Marquee').locator('button:has-text("Paid it")').click(); }],
            ['due date', async () => { await vBox(page, 'Lens Studio').locator('button:has-text("+ Due date")').click(); }],
            ['edit vendor', async () => { await vBox(page, 'Al-Noor Caterers').locator('.v-btns button:has-text("Edit")').click(); }],
            ['cancel', async () => { await vBox(page, 'Gul Decor').locator('button:has-text("Cancel booking")').click(); }],
            ['copy', async () => { await vBox(page, 'Gul Decor').locator('button:has-text("Copy to event")').click(); }],
            ['edit event', async () => { await evBox(page, 'Mehndi').locator('button:has-text("Edit event")').click(); }],
            ['category budgets', async () => { await evBox(page, 'Mehndi').locator('button:has-text("Change the category budgets")').click(); }],
            ['payments list', async () => { await vBox(page, 'DJ Sonic').locator('button:has-text("Show payments")').click(); await vBox(page, 'DJ Sonic').locator('.pays li >> nth=0').locator('button:has-text("Edit")').click(); }]];
        for (const [name, fn] of checks) {
            if (await page.locator('.inline-form').count()) await page.locator('.inline-form .row-btns button.secondary').first().click();
            await fn();
            const o = await overlaps(page);
            ok('no overlapping controls (' + name + ') at ' + w, o.length === 0, o.slice(0, 4).join(', '));
            const ph = await placeholders(page);
            ok('placeholders fit (' + name + ') at ' + w, ph.length === 0, ph.join(', '));
        }
        await page.context().close();
    }
    for (const scheme of ['dark', 'light']) for (const w of [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920]) {
        for (const st of [SEED, { v: 1, cur: '', group: 'west', events: [] }]) {
            page = await open(browser, w, { scheme, state: JSON.stringify(st) });
            if (st.events.length) await evBox(page, 'Mehndi').locator('button:has-text("+ Add a vendor")').click();
            const wide = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1 || [...document.querySelectorAll('main *')].some(e => { const r = e.getBoundingClientRect(); return r.width && r.right > innerWidth + 1 && getComputedStyle(e).position !== 'fixed'; }));
            ok('no sideways scroll ' + scheme + ' ' + w + (st.events.length ? ' filled' : ' empty'), !wide);
            if (w >= 900) {
                for (const pos of ['top', 'middle', 'bottom']) {
                    await page.evaluate(p => scrollTo(0, p === 'top' ? 0 : p === 'middle' ? document.body.scrollHeight / 2 : document.body.scrollHeight), pos);
                    const ov = await page.evaluate(() => {
                        const kids = [...document.querySelectorAll('main.app > *, .col-a > *, .col-b > *, .ev-list > *, .v-list > *')].filter(e => e.offsetParent && !e.classList.contains('col-a') && !e.classList.contains('col-b'));
                        const bad = [];
                        for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
                            if (kids[i].parentElement !== kids[j].parentElement) continue;
                            const a = kids[i].getBoundingClientRect(), b = kids[j].getBoundingClientRect();
                            if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) bad.push(kids[i].className + ' x ' + kids[j].className);
                        }
                        const ca = document.querySelector('.col-a').getBoundingClientRect(), cb = document.querySelector('.col-b').getBoundingClientRect();
                        if (ca.right > cb.left + 1) bad.push('columns');
                        return bad;
                    });
                    ok('no overlap at ' + w + ' ' + scheme + ' scrolled ' + pos, ov.length === 0, ov.join(', '));
                }
            }
            ok('no errors ' + scheme + ' ' + w, page.errors.length === 0 && page.bad.length === 0, page.errors.concat(page.bad).join(' | '));
            await page.context().close();
        }
    }

    // ---------- screenshots ----------
    if (args.includes('--shots')) {
        page = await open(browser, 1280, { state: JSON.stringify(SEED) });
        await page.setViewportSize({ width: 1280, height: 1640 });
        await page.screenshot({ path: path.join(DIR, 'screenshots', 'desktop.png') });
        await page.context().close();
        page = await open(browser, 390, { state: JSON.stringify(SEED), scale: 2 });
        await page.setViewportSize({ width: 390, height: 1600 });
        await page.screenshot({ path: path.join(DIR, 'screenshots', 'phone.png') });
        await page.context().close();
    }
    await browser.close();
    console.log(pass + ' passed, ' + fail + ' failed');
    if (fail) process.exitCode = 1;
}
main().catch(e => { console.error(e); process.exit(1); });
