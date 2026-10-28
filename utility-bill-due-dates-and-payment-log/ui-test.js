// Drives the real page in headless Chromium. Run from the repo root:
//   node utility-bill-due-dates-and-payment-log/ui-test.js [--base http://localhost:8765] [--shots]
// --base defaults to a local server you start yourself (python3 -m http.server 8765 in the repo root).
// --shots also saves screenshots/desktop.png and screenshots/phone.png.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const args = process.argv.slice(2);
const bi = args.indexOf('--base'), BASE = (bi >= 0 ? args[bi + 1] : 'http://localhost:8765').replace(/\/$/, '');
const URL = BASE + '/utility-bill-due-dates-and-payment-log/';
const KEY = 'utility-bill-due-dates-and-payment-log.state';
const DIR = __dirname;
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; if (!cond) console.log('FAIL ' + name + (extra ? '  ' + extra : '')); };
const NOW = new Date('2026-10-28T10:00:00');

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
    await page.addInitScript(() => { const c = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { if (this.href.startsWith('mailto:')) { window.__mail = this.href; return; } return c.call(this); }; });
    await page.goto(URL, { waitUntil: 'load' });
    return page;
}
const saved = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
const box = (page, name) => page.locator('.acct', { has: page.locator('.a-name', { hasText: new RegExp('^' + name + '$') }) });
const text = async (loc) => (await loc.first().innerText()).replace(/\s+/g, ' ').trim();
async function addBill(page, o) {
    if (o.chip) await page.click('#quick .chip:has-text("' + o.chip + '")');
    if (o.name != null) await page.fill('#f-name', o.name);
    if (o.day) await page.selectOption('#f-day', String(o.day));
    if (o.every) await page.selectOption('#f-every', String(o.every));
    if (o.auto) await page.check('#f-auto');
    if (o.acct) { await page.click('#f-acct-open'); await page.fill('#f-acct', o.acct); }
    if (o.payer) { await page.click('#f-payer-open'); await page.fill('#f-payer', o.payer); }
    await page.click('#f-save');
}
// fills the open "Type in the new bill" panel of a bill
async function typeBill(page, name, o) {
    const b = box(page, name), pn = b.locator('.panel');
    if (!await pn.count()) await b.locator('button', { hasText: 'Type in the new bill' }).click();
    await pn.locator('input[id$="-a"]').fill(o.amt);
    if (o.due) await pn.locator('input[type=date][id$="-d"]').fill(o.due);
    if (o.late) { await pn.locator('button', { hasText: '+ Add the amount after the due date' }).click(); await pn.locator('input[id$="-l"]').fill(o.late); }
    if (o.paidOn) {
        await pn.locator('input[type=checkbox]').check();
        await pn.locator('input[id$="-po"]').fill(o.paidOn);
        if (o.how) await pn.locator('input[id$="-ph"]').fill(o.how);
        if (o.ref) { await pn.locator('button', { hasText: '+ Add a reference' }).click(); await pn.locator('input[id$="-pr"]').fill(o.ref); }
    }
    await pn.locator('button', { hasText: /^Save bill$|^Save changes$/ }).click();
}
async function payBill(page, name, o) {
    const b = box(page, name);
    await b.locator('.act button', { hasText: /^Paid$|^Paid another way$/ }).click();
    const pn = b.locator('.panel');
    if (o.amt != null) await pn.locator('input[id$="-pa"]').fill(o.amt);
    if (o.on) await pn.locator('input[id$="-po"]').fill(o.on);
    if (o.how) await pn.locator('input[id$="-ph"]').fill(o.how);
    if (o.ref) { await pn.locator('button', { hasText: '+ Add a reference' }).click(); await pn.locator('input[id$="-pr"]').fill(o.ref); }
    await pn.locator('button', { hasText: 'Save payment' }).click();
}

// Ayesha's household in Karachi on Wed 28 Oct 2026
async function ayesha(page) {
    await addBill(page, { chip: 'Electricity', name: 'K-Electric', day: 24, acct: '0400012345678' });
    await typeBill(page, 'K-Electric', { amt: '13,000', due: '2026-09-24', paidOn: '2026-09-22', how: 'Bank app' });
    await typeBill(page, 'K-Electric', { amt: '14100', due: '2026-10-24', paidOn: '2026-10-23', how: 'Bank app', ref: 'TXN 48120931' });
    await addBill(page, { chip: 'Gas', name: 'Sui Gas', day: 26 });
    await typeBill(page, 'Sui Gas', { amt: '2180', due: '2026-10-26' });
    await addBill(page, { chip: 'Internet', name: 'Home internet', day: 30 });
    await typeBill(page, 'Home internet', { amt: '3499' });
    await addBill(page, { chip: 'Mobile phone', name: "Dad's phone", day: 2, auto: true, payer: 'Dad' });
    await typeBill(page, "Dad's phone", { amt: '1500', due: '2026-11-02' });
    await addBill(page, { chip: 'Water', name: 'Water', day: 3 });
    await typeBill(page, 'Water', { amt: '1200', due: '2026-10-03', paidOn: '2026-09-30', how: 'Cash at the bank' });
}

async function overlapCheck(page, tag) {
    const o = await page.evaluate(() => {
        const els = [...document.querySelectorAll('input:not([type=checkbox]):not([type=file]), select, button')].filter(e => e.offsetParent !== null && e.checkVisibility()).map(e => ({ e, r: e.getBoundingClientRect() }));
        const out = [];
        for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
            const a = els[i].r, b = els[j].r;
            if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1 && !els[i].e.contains(els[j].e) && !els[j].e.contains(els[i].e)) out.push((els[i].e.id || els[i].e.textContent.trim().slice(0, 20)) + ' / ' + (els[j].e.id || els[j].e.textContent.trim().slice(0, 20)));
        }
        const sx = document.documentElement.scrollWidth > window.innerWidth + 1;
        const clipped = [...document.querySelectorAll('input[placeholder]')].filter(e => e.offsetParent !== null).filter(e => {
            const c = document.createElement('canvas').getContext('2d'), st = getComputedStyle(e); c.font = st.fontSize + ' ' + st.fontFamily;
            return c.measureText(e.placeholder).width > e.clientWidth - parseFloat(st.paddingLeft) - parseFloat(st.paddingRight) + 1;
        }).map(e => e.id + ' "' + e.placeholder + '"');
        return { out, sx, clipped };
    });
    ok(tag + ' no overlapping controls', !o.out.length, o.out.slice(0, 4).join('; '));
    ok(tag + ' no horizontal scroll', !o.sx);
    ok(tag + ' placeholders fit', !o.clipped.length, o.clipped.join('; '));
}

(async () => {
    const browser = await chromium.launch();
    let page = await open(browser, 390);

    // first use: empty state
    ok('intro shows on first use', await page.locator('#intro').isVisible());
    ok('no summary on first use', !await page.locator('#sum').isVisible());
    ok('restore link offered on first use', await page.locator('#restore-first').isVisible());
    ok('optional account number hidden', !await page.locator('#f-acct').isVisible() && await page.locator('#f-acct-open').isVisible());
    ok('optional payer hidden', !await page.locator('#f-payer').isVisible());

    // blank name
    await page.click('#f-save');
    ok('blank name is refused', (await text(page.locator('#f-name-err'))).startsWith('Type a name'));
    await page.click('#quick .chip:has-text("Electricity")');
    ok('chip fills the name', await page.inputValue('#f-name') === 'Electricity');
    await page.click('#quick .chip:has-text("Gas")');
    ok('another chip replaces an untouched name', await page.inputValue('#f-name') === 'Gas');
    await page.fill('#f-name', '');

    await ayesha(page);
    ok('no page errors after adding bills', !page.errors.length, page.errors.join('; '));
    let st = await saved(page);
    ok('5 bills saved', st.accts.length === 5);
    ok('optional account number saved', st.accts[0].acct === '0400012345678');
    ok('only the name is required: Water has no account number or payer', st.accts[4].acct === '' && st.accts[4].payer === '');
    ok('K-Electric has 2 paid bills', st.accts[0].entries.length === 2 && st.accts[0].entries.every(e => e.pays.length === 1));
    ok('reference saved', st.accts[0].entries[1].pays[0].ref === 'TXN 48120931');
    ok('internet due date filled in from the usual day', st.accts[2].entries[0].due === '2026-10-30');

    // the answers
    const alerts = await page.locator('#sum-body .alert').allInnerTexts();
    ok('overdue alert for Sui Gas', alerts.some(a => a === 'Overdue: Sui Gas 2,180, was due Mon 26 Oct (2 days ago).'), JSON.stringify(alerts));
    ok('only one overdue alert', alerts.filter(a => a.startsWith('Overdue')).length === 1);
    const tiles = await page.locator('.tile').allInnerTexts();
    ok('still to pay by 31 Oct: 5,679', tiles[0].includes('Still to pay by 31 Oct') && tiles[0].includes('5,679') && tiles[0].includes('2 bills, overdue included'), tiles[0]);
    ok('next 7 days: 4,999 (internet + phone)', tiles[1].includes('4,999') && tiles[1].includes('2 bills'), tiles[1]);
    ok('paid in October: 14,100', tiles[2].includes('Paid in October') && tiles[2].includes('14,100') && tiles[2].includes('1 payment'), tiles[2]);
    const rows = await page.locator('#sum-body ul.next .nx').allInnerTexts();
    ok('to pay list in due order', rows.length === 3 && rows[0].startsWith('Sui Gas') && rows[1].startsWith('Home internet') && rows[2].startsWith("Dad's phone"), JSON.stringify(rows));
    ok('auto-pay marked in list', rows[2].includes('auto-pay') && rows[2].includes('Dad'));
    const nin = await page.locator('#sum-body ul.nin').innerText().catch(() => '');
    ok('Water not in yet, expected Tue 3 Nov', nin.includes('Water') && nin.includes('Expected around Tue 3 Nov (in 6 days)'), nin);
    ok('K-Electric compared with last bill', (await text(box(page, 'K-Electric').locator('.cmp'))) === '8% higher than the last bill (13,000)');
    ok('K-Electric shows paid with ref', (await text(box(page, 'K-Electric').locator('.act'))).includes('Bank app · ref TXN 48120931'));
    ok('K-Electric next bill expected 24 Nov', (await text(box(page, 'K-Electric').locator('.act'))).includes('Next bill expected around Tue 24 Nov (in 27 days)'));
    ok('first box is the overdue one', (await text(page.locator('#a-list .acct .a-name'))) === 'Sui Gas');
    ok('auto-pay bill says it will be taken', (await text(box(page, "Dad's phone").locator('.act'))).includes('Will be taken automatically on Mon 2 Nov'));

    // part payment then the rest
    await payBill(page, 'Sui Gas', { amt: '1000', how: 'Mobile wallet' });
    ok('part paid: 1,180 left', (await text(box(page, 'Sui Gas').locator('.r-big'))) === '1,180' && (await text(box(page, 'Sui Gas').locator('.msg'))).includes('1,180 is still to pay'));
    ok('part paid stays overdue', (await page.locator('#sum-body .alert.bad').allInnerTexts()).some(a => a.includes('Sui Gas 1,180')));
    // too much / future / blank
    await box(page, 'Sui Gas').locator('.act button', { hasText: 'Paid' }).click();
    let pn = box(page, 'Sui Gas').locator('.panel');
    ok('pay panel fills in what is left', await pn.locator('input[id$="-pa"]').inputValue() === '1180');
    await pn.locator('input[id$="-pa"]').fill('');
    await pn.locator('button', { hasText: 'Save payment' }).click();
    ok('blank payment refused', (await text(pn.locator('.err').first())).length > 0);
    await pn.locator('input[id$="-pa"]').fill('-5');
    await pn.locator('button', { hasText: 'Save payment' }).click();
    ok('negative payment refused', (await text(pn.locator('.err').first())) === 'Type it without a minus sign.');
    await pn.locator('input[id$="-pa"]').fill('1180');
    await pn.locator('input[id$="-po"]').fill('2026-11-05');
    await pn.locator('button', { hasText: 'Save payment' }).click();
    ok('future pay date refused', (await pn.locator('[id$="-po-err"]').innerText()).includes('in the future'));
    await pn.locator('input[id$="-po"]').fill('2026-10-28');
    await pn.locator('button', { hasText: 'Save payment' }).click();
    ok('gas now paid', (await text(box(page, 'Sui Gas').locator('.tag.st'))) === 'Paid');
    ok('no overdue alert left', !await page.locator('#sum-body .alert.bad').count());
    ok('paid in October now 16,280', (await page.locator('.tile').nth(2).innerText()).includes('16,280'));
    // undo
    await box(page, 'Sui Gas').locator('.msg .undo').click();
    ok('undo brings back 1,180 to pay', (await text(box(page, 'Sui Gas').locator('.r-big'))) === '1,180');
    await payBill(page, 'Sui Gas', {});
    ok('pay again after undo', (await text(box(page, 'Sui Gas').locator('.tag.st'))) === 'Paid');

    // a bill with a late amount, typed in after its due date
    await box(page, 'Water').locator('button', { hasText: 'Type in the new bill' }).click();
    pn = box(page, 'Water').locator('.panel');
    ok('next water due date filled in', await pn.locator('input[type=date][id$="-d"]').inputValue() === '2026-11-03');
    ok('same as last bill offered', await pn.locator('button', { hasText: 'Same as last bill: 1,200' }).count() === 1);
    await pn.locator('button', { hasText: 'Same as last bill' }).click();
    ok('same as last bill fills 1200', await pn.locator('input[id$="-a"]').inputValue() === '1200');
    await pn.locator('input[type=date][id$="-d"]').fill('2026-10-03');
    await pn.locator('button', { hasText: 'Save bill' }).click();
    ok('duplicate due date refused', (await text(pn.locator('[id$="-d-err"]'))).includes('already a Water bill due on'));
    await pn.locator('input[type=date][id$="-d"]').fill('2026-10-25');
    await pn.locator('button', { hasText: '+ Add the amount after the due date' }).click();
    await pn.locator('input[id$="-l"]').fill('1000');
    await pn.locator('button', { hasText: 'Save bill' }).click();
    ok('late amount below the bill refused', (await text(pn.locator('[id$="-l-err"]'))).includes('must be more than'));
    await pn.locator('input[id$="-l"]').fill('1,320');
    await pn.locator('input[id$="-a"]').fill('abc');
    await pn.locator('button', { hasText: 'Save bill' }).click();
    ok('mistyped amount refused', (await text(pn.locator('[id$="-a-err"]'))).length > 0);
    await pn.locator('input[id$="-a"]').fill('1200');
    await pn.locator('button', { hasText: 'Save bill' }).click();
    ok('late amount applies: 1,320 overdue', (await text(box(page, 'Water').locator('.r-big'))) === '1,320' && (await text(box(page, 'Water').locator('.act'))).includes('The late amount 1,320 applies (the bill was 1,200)'));

    // edit a mistake: Water amount was 1,100 not 1,200
    await box(page, 'Water').locator('details.pays summary').click();
    await box(page, 'Water').locator('.pay', { hasText: 'Due Sun 25 Oct 2026' }).locator('button', { hasText: 'Edit' }).click();
    pn = box(page, 'Water').locator('.panel');
    ok('edit panel shows amount and late amount', await pn.locator('input[id$="-a"]').inputValue() === '1200' && await pn.locator('input[id$="-l"]').inputValue() === '1320');
    await pn.locator('input[id$="-a"]').fill('1100');
    await pn.locator('button', { hasText: 'Save changes' }).click();
    st = await saved(page);
    ok('edit saved', st.accts.find(a => a.name === 'Water').entries.find(e => e.due === '2026-10-25').amt === 110000);
    // delete a bill entry with undo
    await box(page, 'Water').locator('.pay', { hasText: 'Due Sun 25 Oct 2026' }).locator('button', { hasText: 'Edit' }).click();
    await box(page, 'Water').locator('button', { hasText: 'Delete this bill' }).click();
    ok('bill entry deleted', (await saved(page)).accts.find(a => a.name === 'Water').entries.length === 1);
    await box(page, 'Water').locator('.msg .undo').click();
    ok('undo brings the entry back', (await saved(page)).accts.find(a => a.name === 'Water').entries.length === 2);
    // remove a payment in the edit panel
    await box(page, 'Sui Gas').locator('details.pays summary').click();
    await box(page, 'Sui Gas').locator('.pay', { hasText: 'Due Mon 26 Oct 2026' }).locator('button', { hasText: 'Edit' }).click();
    pn = box(page, 'Sui Gas').locator('.panel');
    ok('edit panel lists 2 payments', await pn.locator('.plist li').count() === 2);
    await pn.locator('.plist li').first().locator('button', { hasText: 'Remove' }).click();
    ok('payment removed: 1,000 left on gas', (await text(box(page, 'Sui Gas').locator('.r-big'))) === '1,000');
    await box(page, 'Sui Gas').locator('.msg .undo').click();
    ok('undo payment removal', (await text(box(page, 'Sui Gas').locator('.tag.st'))) === 'Paid');

    // a 0 bill (credit covers it)
    await typeBill(page, 'K-Electric', { amt: '0', due: '2026-11-24' });
    ok('0 bill: nothing to pay', (await text(box(page, 'K-Electric').locator('.act'))).includes('Nothing to pay on the bill due Tue 24 Nov'));
    await box(page, 'K-Electric').locator('.msg .undo').click();

    // edit details, stop and start again, delete with undo
    await box(page, 'Home internet').locator('button', { hasText: 'Edit details' }).click();
    pn = box(page, 'Home internet').locator('.panel');
    await pn.locator('input[id$="-n"]').fill('K-Electric');
    await pn.locator('button', { hasText: /^Save$/ }).click();
    ok('duplicate name refused in edit', (await text(pn.locator('[id$="-n-err"]'))).includes('already has that name'));
    await pn.locator('input[id$="-n"]').fill('Fibre internet');
    await pn.locator('input[id$="-py"]').fill('Me');
    await pn.locator('button', { hasText: /^Save$/ }).click();
    ok('details saved', (await text(box(page, 'Fibre internet').locator('.a-sub'))).includes('paid by Me'));
    await box(page, 'Fibre internet').locator('button', { hasText: 'Stop this bill' }).click();
    ok('stopped bill moves away', !await page.locator('#a-list .a-name', { hasText: 'Fibre internet' }).count() && await page.locator('#done-wrap').isVisible());
    ok('stopped bill left out of totals', !(await page.locator('#sum-body').innerText()).includes('Fibre internet'));
    await page.locator('#done-s').click();
    await box(page, 'Fibre internet').locator('button', { hasText: 'Start again' }).click();
    ok('started again', await page.locator('#a-list .a-name', { hasText: 'Fibre internet' }).count() === 1);
    await box(page, 'Water').locator('button', { hasText: 'Delete' }).last().click();
    ok('deleted Water', !await box(page, 'Water').count());
    await page.locator('#top-msg .undo').click();
    ok('undo delete', await box(page, 'Water').count() === 1);

    // adding a duplicate name
    await addBill(page, { name: 'water' });
    ok('duplicate bill name refused', (await text(page.locator('#f-name-err'))).includes('already have a bill called water'));
    await page.fill('#f-name', '');

    // auto-pay after its date: a week later
    const after = JSON.stringify(await saved(page));
    const p2 = await open(browser, 390, { state: after, now: new Date('2026-11-04T09:00:00') });
    const a2 = await p2.locator('#sum-body .alert').allInnerTexts();
    ok('auto-pay after its date asks to check, not overdue', a2.some(a => a.startsWith("Check that Dad's phone 1,500 was taken by auto-pay on Mon 2 Nov")) && !a2.some(a => a.startsWith("Overdue: Dad's phone")), JSON.stringify(a2));
    ok('internet overdue a week later', a2.some(a => a.startsWith('Overdue: Fibre internet 3,499')));
    await box(p2, "Dad's phone").locator('button', { hasText: 'It was taken' }).click();
    ok('it was taken: paid', (await text(box(p2, "Dad's phone").locator('.tag.st'))) === 'Paid' && (await text(box(p2, "Dad's phone").locator('.act'))).includes('Auto-pay'));
    ok('new month: paid in November', (await p2.locator('.tile').nth(2).innerText()).includes('Paid in November'));
    ok('no errors a week later', !p2.errors.length, p2.errors.join('; '));
    await p2.context().close();

    // copy, email, calendar
    await page.click('#sum-body button:has-text("Copy summary")');
    const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
    ok('copy summary', clip.includes('Bills on Wed 28 Oct 2026') && clip.includes('- Fibre internet: 3,499, due Fri 30 Oct'), clip.slice(0, 200));
    await page.click('#sum-body button:has-text("Email summary")');
    const mail = await page.evaluate(() => window.__mail || '');
    ok('email summary with no recipient', mail.startsWith('mailto:?subject=Our%20bills&body=') && decodeURIComponent(mail).includes('Paid this month:'));
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#sum-body button:has-text("Add due dates to calendar")')]);
    const ics = fs.readFileSync(await dl.path(), 'utf8');
    ok('calendar file', dl.suggestedFilename() === 'bill-due-dates.ics' && ics.startsWith('BEGIN:VCALENDAR') && ics.includes('SUMMARY:Pay Fibre internet 3\\,499') && ics.includes('TRIGGER:-P2D'));
    await box(page, 'K-Electric').locator('button', { hasText: /^Copy$/ }).click();
    const c2 = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
    ok('copy one bill with account number', c2.startsWith('K-Electric (account 0400012345678)') && c2.includes('ref TXN 48120931'), c2);

    // currency remembered
    await page.selectOption('#cur', 'Rs');
    ok('currency shown', (await text(page.locator('.tile .t-big'))).startsWith('Rs '));
    await page.reload();
    ok('currency and bills kept after reload', (await text(page.locator('.tile .t-big'))).startsWith('Rs ') && await page.locator('#a-list .acct').count() === 5);
    await page.selectOption('#cur', '');

    // keyboard: Enter in the add form adds
    await page.fill('#f-name', 'Building maintenance');
    await page.press('#f-name', 'Enter');
    ok('Enter adds a bill and opens its new bill panel', await box(page, 'Building maintenance').locator('.panel').count() === 1);
    await box(page, 'Building maintenance').locator('.panel input[id$="-a"]').fill('5000');
    await box(page, 'Building maintenance').locator('.panel input[type=date][id$="-d"]').fill('2026-11-10');
    await page.press('#' + await box(page, 'Building maintenance').locator('.panel input[id$="-a"]').getAttribute('id'), 'Enter');
    ok('Enter saves the bill', (await text(box(page, 'Building maintenance').locator('.r-big'))) === '5,000');

    // very long name at a narrow width
    await page.setViewportSize({ width: 320, height: 800 });
    await addBill(page, { name: 'W'.repeat(50) });
    await overlapCheck(page, '320 long name + new bill panel');
    await box(page, 'W'.repeat(50)).locator('.panel input[type=checkbox]').check();
    await box(page, 'W'.repeat(50)).locator('.panel button', { hasText: '+ Add the amount after' }).click();
    await box(page, 'W'.repeat(50)).locator('.panel button', { hasText: '+ Add a reference' }).click();
    for (const w of [320, 360, 390]) { await page.setViewportSize({ width: w, height: 800 }); await overlapCheck(page, w + ' all optional fields open'); }
    await page.click('#f-acct-open'); await page.click('#f-payer-open');
    for (const w of [320, 360, 390]) { await page.setViewportSize({ width: w, height: 800 }); await overlapCheck(page, w + ' add form open'); }
    await box(page, 'Fibre internet').locator('.act button', { hasText: 'Paid' }).click();
    await box(page, 'Fibre internet').locator('.panel button', { hasText: '+ Add a reference' }).click();
    for (const w of [320, 360, 390]) { await page.setViewportSize({ width: w, height: 800 }); await overlapCheck(page, w + ' pay panel open'); }
    await box(page, 'K-Electric').locator('button', { hasText: 'Edit details' }).click();
    for (const w of [320, 360, 390]) { await page.setViewportSize({ width: w, height: 800 }); await overlapCheck(page, w + ' details panel open'); }

    // backup, then delete everything, undo, restore
    await page.setViewportSize({ width: 390, height: 800 });
    const [bk] = await Promise.all([page.waitForEvent('download'), page.click('#backup')]);
    const bkPath = await bk.path();
    ok('backup file named', /^bills-backup-2026-10-28\.json$/.test(bk.suggestedFilename()));
    await page.click('#del-all');
    ok('delete everything', await page.locator('#intro').isVisible() && !await page.locator('#a-list .acct').count());
    await page.locator('#tools-msg .undo').click();
    ok('undo delete everything', await page.locator('#a-list .acct').count() === 7);
    await page.click('#del-all');
    await page.setInputFiles('#restore-file', bkPath);
    await page.waitForTimeout(200);
    ok('restore backup', await page.locator('#a-list .acct').count() === 7 && (await text(page.locator('#tools-msg'))).startsWith('Restored 7 bills'));
    const junk = path.join(DIR, '..', 'junk-test.json'); fs.writeFileSync(junk, '{"hello":1}');
    await page.setInputFiles('#restore-file', junk); fs.unlinkSync(junk);
    await page.waitForTimeout(200);
    ok('junk file refused', (await text(page.locator('#tools-msg'))).includes('not a backup from this app') && await page.locator('#a-list .acct').count() === 7);
    ok('no errors in the main run', !page.errors.length && !page.bad.length, page.errors.concat(page.bad).join('; '));
    await page.context().close();

    // corrupt saved state, blocked storage
    const pc = await open(browser, 390, { state: '{not json' });
    ok('corrupt state starts fresh with a note', (await text(pc.locator('#top-msg'))).includes('could not be read') && await pc.locator('#intro').isVisible() && !pc.errors.length);
    await pc.context().close();
    const pv = await open(browser, 390, { state: JSON.stringify({ accts: [{ name: 'Gas', entries: [{ due: 'x', amt: 'y' }, { due: '2026-10-26', amt: 218000, pays: [{ on: 'bad', amt: 5 }] }] }, 7] }) });
    ok('half-broken state keeps what is valid', await pv.locator('#a-list .acct').count() === 1 && (await text(pv.locator('.r-big'))) === '2,180' && !pv.errors.length, pv.errors.join(';'));
    await pv.context().close();
    const pb = await open(browser, 390, { block: true });
    ok('blocked storage warns', await pb.locator('#store-warn').isVisible());
    await addBill(pb, { name: 'Gas' });
    ok('blocked storage still works for the visit', await box(pb, 'Gas').count() === 1 && !pb.errors.length, pb.errors.join(';'));
    await pb.context().close();

    // light theme quick look
    const pl = await open(browser, 1280, { scheme: 'light' });
    ok('light theme accent', await pl.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()) === '#a65c00');
    await pl.context().close();

    // every width, both themes, with bills filled in and after deleting everything
    const sp = await open(browser, 1280);
    await ayesha(sp);
    await box(sp, 'K-Electric').locator('details.pays summary').click();
    const filled = JSON.stringify(await saved(sp));
    await sp.context().close();
    for (const scheme of ['dark', 'light']) {
        for (const w of [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920]) {
            for (const mode of ['filled', 'cleared']) {
                const q = await open(browser, w, { scheme, state: mode === 'filled' ? filled : JSON.stringify({ accts: [], cur: '' }) });
                const tag = scheme + ' ' + w + ' ' + mode;
                const r = await q.evaluate(() => {
                    const W = document.documentElement.clientWidth, out = [];
                    document.querySelectorAll('main *').forEach(e => { if (!e.checkVisibility()) return; const b = e.getBoundingClientRect(); if (b.width && (b.right > W + 1 || b.left < -1)) out.push(e.tagName + '.' + e.className); });
                    return { sx: document.documentElement.scrollWidth > window.innerWidth + 1, out: out.slice(0, 3) };
                });
                ok(tag + ' no horizontal scroll', !r.sx);
                ok(tag + ' nothing sticks out', !r.out.length, r.out.join(', '));
                if (w >= 900) for (const pos of [0, 0.5, 1]) {
                    await q.evaluate(f => window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * f), pos);
                    const o = await q.evaluate(() => {
                        const out = [];
                        [document.querySelector('main'), document.querySelector('.col-a'), document.querySelector('.col-b')].forEach(par => {
                            const kids = [...par.children].filter(e => e.checkVisibility() && getComputedStyle(e).display !== 'contents').map(e => ({ e, r: e.getBoundingClientRect() }));
                            for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
                                const a = kids[i].r, b = kids[j].r;
                                if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) out.push(kids[i].e.className + ' / ' + kids[j].e.className);
                            }
                        });
                        return out;
                    });
                    ok(tag + ' no overlapping blocks at scroll ' + pos, !o.length, o.join('; '));
                }
                if (mode === 'filled' && [320, 390, 820, 1280].includes(w)) {
                    await q.evaluate(() => window.scrollTo(0, 0));
                    await q.click('.help-btn');
                    const d = await q.locator('dialog.help').boundingBox();
                    ok(tag + ' Help opens inside the screen', d && d.x >= 0 && d.y >= 0 && d.x + d.width <= w && d.y + d.height <= (w < 600 ? 800 : 900) && (await q.locator('#help-title').innerText()).includes('Utility Bill'));
                    await q.keyboard.press('Escape');
                    ok(tag + ' Escape closes Help', !await q.locator('dialog.help').evaluate(e => e.open));
                    await q.click('.help-btn'); await q.click('.help-close');
                    ok(tag + ' Got it closes Help', !await q.locator('dialog.help').evaluate(e => e.open));
                    const tb = await q.evaluate(() => { const r = [...document.querySelectorAll('.topbar > *')].map(e => e.getBoundingClientRect()); return Math.max(...r.map(x => x.bottom)) - Math.min(...r.map(x => x.top)); });
                    ok(tag + ' top bar stays on one row', tb < 60, String(tb));
                }
                ok(tag + ' no errors', !q.errors.length && !q.bad.length, q.errors.concat(q.bad).join('; '));
                await q.context().close();
            }
        }
    }
    // theme switch
    const ts = await open(browser, 390);
    await ts.click('.theme-toggle');
    ok('theme switch to light', await ts.evaluate(() => document.documentElement.dataset.theme) === 'light' && await ts.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()) === '#a65c00');
    await ts.context().close();

    // screenshots
    if (args.includes('--shots')) {
        for (const [w, file, scale] of [[1280, 'desktop.png', 1], [390, 'phone.png', 2]]) {
            const s = await open(browser, w, { scale });
            await ayesha(s);
            await s.evaluate(() => window.scrollTo(0, 0));
            // show the overdue state and the comparison clearly
            await s.waitForTimeout(300);
            await s.screenshot({ path: path.join(DIR, 'screenshots', file), fullPage: w > 600 ? false : false });
            await s.context().close();
        }
    }
    await browser.close();
    console.log(pass + ' passed, ' + fail + ' failed');
    if (fail) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
