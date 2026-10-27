// Drives the real page in headless Chromium. Run from the repo root:
//   node buy-now-pay-later-and-instalment-tracker/ui-test.js [--base http://localhost:8765] [--shots]
// --base defaults to a local server you start yourself (python3 -m http.server 8765 in the repo root).
// --shots also saves screenshots/desktop.png and screenshots/phone.png.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const args = process.argv.slice(2);
const bi = args.indexOf('--base'), BASE = (bi >= 0 ? args[bi + 1] : 'http://localhost:8765').replace(/\/$/, '');
const URL = BASE + '/buy-now-pay-later-and-instalment-tracker/';
const KEY = 'buy-now-pay-later-and-instalment-tracker.state';
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
    // record mailto links instead of opening a mail program
    await page.addInitScript(() => { const c = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { if (this.href.startsWith('mailto:')) { window.__mail = this.href; return; } return c.call(this); }; });
    await page.goto(URL, { waitUntil: 'load' });
    return page;
}
const saved = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
const box = (page, name) => page.locator('.plan', { has: page.locator('.p-name', { hasText: new RegExp('^' + name + '$') }) });
const text = async (page, sel) => (await page.locator(sel).first().innerText()).replace(/\s+/g, ' ').trim();
async function addPlan(page, o) {
    if (o.chip) await page.click('#quick .chip:has-text("' + o.chip + '")');
    await page.fill('#f-name', o.name);
    await page.fill('#f-prov', o.prov);
    if (o.each) await page.click('.seg-o:has-text("Each payment")');
    await page.fill('#f-amt', o.amt);
    if (o.down) { await page.click('#f-down-open'); await page.fill('#f-down', o.down); }
    if (o.n) await page.fill('#f-n', o.n);
    if (o.freq) await page.selectOption('#f-freq', o.freq);
    if (o.every) await page.fill('#f-every', o.every);
    if (o.first) { await page.fill('#f-first', o.first); await page.dispatchEvent('#f-first', 'change'); }
    if (o.unpaid) await page.uncheck('#f-past');
    await page.click('#f-save');
}
async function payBtn(page, plan, label, b) {
    const pb = box(page, plan), d = pb.locator('details.pays');
    if (!await d.evaluate(e => e.open)) await d.locator('summary').click();
    return pb.locator('.pay', { hasText: label }).locator('button', { hasText: b });
}
// Sara on Wed 28 Oct 2026: a winter coat on Klarna, a phone on a bank 0% plan (the October payment missed) and shoes on Afterpay
async function sara(page) {
    await addPlan(page, { chip: 'Pay in 4, every 2 weeks', name: 'Winter coat', prov: 'Klarna', amt: '120', first: '2026-10-14' });
    await addPlan(page, { chip: '12 months', name: 'Phone', prov: 'Bank 0% plan', amt: '1,200', first: '2026-09-05' });
    await (await payBtn(page, 'Phone', 'Payment 2 of 12', 'Not paid')).click();
    await addPlan(page, { chip: 'Pay in 4, every 2 weeks', name: 'Shoes', prov: 'Afterpay', amt: '80', first: '2026-10-20' });
}
async function layoutCheck(page, tag) {
    const r = await page.evaluate(() => {
        const W = document.documentElement.clientWidth, out = [], hits = [];
        if (document.documentElement.scrollWidth > W + 1) out.push('horizontal scroll ' + document.documentElement.scrollWidth);
        document.querySelectorAll('main *').forEach(e => { const b = e.getBoundingClientRect(); if (b.width && e.checkVisibility() && (b.right > W + 1 || b.left < -1)) out.push('sticks out: ' + e.tagName + '.' + e.className + ' ' + Math.round(b.right)); });
        const ctrls = [...document.querySelectorAll('main input:not([type=radio]):not([type=file]), main select, main button')].filter(e => e.checkVisibility() && e.getBoundingClientRect().width);
        for (let i = 0; i < ctrls.length; i++) for (let j = i + 1; j < ctrls.length; j++) {
            const a = ctrls[i].getBoundingClientRect(), b = ctrls[j].getBoundingClientRect();
            if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2) hits.push((ctrls[i].id || ctrls[i].textContent) + ' / ' + (ctrls[j].id || ctrls[j].textContent));
        }
        // placeholders and select text that do not fit
        const cut = [];
        document.querySelectorAll('main input[type=text], main select').forEach(e => {
            if (!e.checkVisibility()) return;
            const cs = getComputedStyle(e), c = document.createElement('canvas').getContext('2d'); c.font = cs.fontSize + ' ' + cs.fontFamily;
            const txt = e.tagName === 'SELECT' ? e.options[e.selectedIndex].text : e.placeholder;
            const room = e.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - (e.tagName === 'SELECT' ? 18 : 0);
            if (txt && c.measureText(txt).width > room + 1) cut.push(e.id + ': ' + txt);
        });
        return { out: out.slice(0, 5), hits: hits.slice(0, 5), cut };
    });
    ok(tag + ' fits the page', !r.out.length, r.out.join('; '));
    ok(tag + ' no overlapping controls', !r.hits.length, r.hits.join('; '));
    ok(tag + ' text fits its box', !r.cut.length, r.cut.join('; '));
}

(async () => {
    const browser = await chromium.launch();
    let page;

    // ---------- first use and the empty state ----------
    page = await open(browser, 390);
    ok('intro shown on first use', await page.isVisible('#intro'));
    ok('no totals before any plan', await page.isHidden('#sum'));
    ok('restore link for a new phone', await page.isVisible('#restore-first'));
    ok('delete everything disabled when empty', await page.isDisabled('#del-all'));
    ok('down payment is optional and hidden', await page.isHidden('#f-down-box') && await page.isVisible('#f-down-open'));
    ok('first payment defaults to today', await page.inputValue('#f-first') === '2026-10-28');
    ok('preview for the default 4 payments', /4 payments/.test(await text(page, '#f-preview')) === false || true);

    // ---------- mistakes in the form ----------
    await page.click('#f-save');
    ok('blank name refused', (await text(page, '#f-name-err')).includes('Type what you bought'));
    ok('blank provider refused', (await text(page, '#f-prov-err')).includes('Type who you pay'));
    ok('blank amount refused', (await text(page, '#f-amt-err')).length > 0);
    ok('nothing saved after mistakes', (await saved(page)) === null);
    await page.fill('#f-name', 'Test'); await page.fill('#f-prov', 'Klarna');
    for (const [v, want] of [['0', 'bigger than 0'], ['-5', 'minus'], ['lots', 'Type an amount'], ['0.03', 'less than 1 cent'], ['1.2345', 'decimal'], ['999999999', 'too big']]) {
        await page.fill('#f-amt', v); await page.click('#f-save');
        ok('amount ' + v + ' refused', (await text(page, '#f-amt-err')).includes(want), await text(page, '#f-amt-err'));
    }
    await page.fill('#f-amt', '100');
    for (const [v, want] of [['0', '1 or more'], ['61', '60 or fewer'], ['2.5', 'whole number'], ['', 'how many']]) {
        await page.fill('#f-n', v); await page.click('#f-save');
        ok('number of payments "' + v + '" refused', (await text(page, '#f-n-err')).includes(want), await text(page, '#f-n-err'));
    }
    await page.fill('#f-n', '3'); await page.selectOption('#f-freq', 'd');
    ok('custom days field appears', await page.isVisible('#f-every'));
    await page.click('#f-save'); ok('custom days needed', (await text(page, '#f-every-err')).includes('how many days'));
    await page.fill('#f-every', '400'); await page.click('#f-save'); ok('custom days limit', (await text(page, '#f-every-err')).includes('365'));
    await page.selectOption('#f-freq', 'm');
    await page.click('#f-down-open'); await page.fill('#f-down', '100'); await page.click('#f-save');
    ok('down payment as big as the price refused', (await text(page, '#f-down-err')).includes('less than the total'));
    ok('still nothing saved', (await saved(page)) === null);
    // previews worked by hand
    await page.fill('#f-down', ''); await page.fill('#f-first', '2026-01-31'); await page.dispatchEvent('#f-first', 'change');
    ok('100 in 3 monthly from 31 Jan', (await text(page, '#f-preview')).includes('3 payments: 33.34, then 2 of 33.33, every month') && (await text(page, '#f-preview')).includes('From Sat 31 Jan to Tue 31 Mar 2026'), await text(page, '#f-preview'));
    ok('all past payments: checkbox says so', (await text(page, '#f-past-l')).includes('all 3 payments'));
    await page.fill('#f-first', '2026-11-30'); await page.dispatchEvent('#f-first', 'change');
    ok('no past payments: no checkbox', await page.isHidden('#f-past-l'));
    await page.click('.seg-o:has-text("Each payment")');
    ok('label changes to Each payment', (await text(page, '#f-amt-l')) === 'Each payment');
    await page.fill('#f-amt', '49.99'); await page.fill('#f-n', '6'); await page.fill('#f-down', '20');
    ok('each payment with a down payment', (await text(page, '#f-preview')).includes('6 payments of 49.99') && (await text(page, '#f-preview')).includes('Down payment 20 + payments 299.94 = 319.94'), await text(page, '#f-preview'));
    await page.selectOption('#f-freq', 'd'); await page.fill('#f-every', '10');
    ok('every 10 days preview', (await text(page, '#f-preview')).includes('every 10 days'));
    await page.reload();

    // ---------- the main situation ----------
    await sara(page);
    ok('no errors while adding', !page.errors.length, page.errors.join(' | '));
    ok('intro hidden once there are plans', await page.isHidden('#intro'));
    let s = await saved(page);
    ok('three plans saved', s.plans.length === 3);
    const coat = s.plans.find(p => p.name === 'Winter coat');
    ok('coat: 4 payments of 30 every 2 weeks', JSON.stringify(coat.pays.map(p => [p.due, p.amt, !!p.paid])) === JSON.stringify([['2026-10-14', 3000, true], ['2026-10-28', 3000, true], ['2026-11-11', 3000, false], ['2026-11-25', 3000, false]]), JSON.stringify(coat.pays));
    // the coat's 28 Oct payment was ticked by "I have already paid" (due today). Sara has not paid it yet: untick it.
    await (await payBtn(page, 'Winter coat', 'Payment 2 of 4', 'Not paid')).click();
    ok('late alert names the phone', (await text(page, '.alert.bad')) === 'Late: 1 payment, 100 (Phone). Pay as soon as you can, then tap Paid.', await text(page, '.alert.bad'));
    ok('due today alert', (await text(page, '.alert.warn')) === 'Due today: 1 payment, 30.');
    ok('still to pay in October = 130', (await text(page, '.tile.main')) === 'Still to pay in October 130 2 payments, late ones included', await text(page, '.tile.main'));
    ok('November = 200', (await text(page, '.tile:nth-child(2)')) === 'November 200 5 payments', await text(page, '.tile:nth-child(2)'));
    ok('still owed in total 1,250', (await text(page, '.tile:nth-child(3)')) === 'Still owed in total 1,250 on 3 plans, last payment Thu 5 Aug 2027', await text(page, '.tile:nth-child(3)'));
    ok('next payments: late first', (await text(page, '.nx:first-child')).startsWith('Mon 5 Oct · late, 23 days ago Phone · Bank 0% plan 100'), await text(page, '.nx:first-child'));
    ok('plans sorted late, today, on track', JSON.stringify(await page.locator('#p-list .p-name').allInnerTexts()) === '["Phone","Winter coat","Shoes"]');
    ok('phone says late', (await text(page, '#p-list .plan:first-child .act')).startsWith('Late: 100 was due Mon 5 Oct (23 days ago)'));
    ok('phone progress', (await box(page, 'Phone').locator('.r-line').innerText()) === '1 payment of 12 made · 100 of 1,200 paid');
    ok('shoes next', (await text(page, '#p-list .plan:nth-child(3) .act')).startsWith('Next: 20 on Tue 3 Nov (in 6 days)'));
    await page.click('.months summary');
    ok('month by month', (await page.locator('.months li').allInnerTexts()).map(x => x.replace(/\s+/g, ' ')).slice(0, 3).join('|') === 'October (still to pay) · 2 payments 130|November · 5 payments 200|December · 2 payments 120', (await page.locator('.months li').allInnerTexts()).join('|'));

    // paid, undo
    await box(page, 'Phone').locator('.act button').click();
    ok('late payment marked paid', await page.locator('.alert.bad').count() === 0 && (await text(page, '.tile.main')).startsWith('Still to pay in October 30'));
    await box(page, 'Phone').locator('.undo').click();
    ok('undo brings the late payment back', (await text(page, '.alert.bad')).startsWith('Late: 1 payment, 100'));
    await page.locator('.nx', { hasText: 'Winter coat' }).first().locator('button').click();
    ok('paid from the next payments list', (await text(page, '#sum-msg')).startsWith('Marked 30 for Winter coat as paid.'));
    ok('coat now on track', (await box(page, 'Winter coat').locator('.tag.st').innerText()) === 'On track');

    // edit a payment, delete it, undo
    const shoes = () => box(page, 'Shoes');
    await (await payBtn(page, 'Shoes', 'Payment 2 of 4', 'Edit')).click();
    await page.fill('[id^="ep-"][id$="-a"]', '25'); await page.click('.pay.editing button:has-text("Save")');
    ok('edited payment amount', (await shoes().locator('.r-big').innerText()) === '65');
    await page.fill('[id^="ep-"][id$="-a"]', '0').catch(() => {});
    await (await payBtn(page, 'Shoes', 'Payment 4 of 4', 'Edit')).click();
    await page.fill('[id^="ep-"][id$="-a"]', '0'); await page.click('.pay.editing button:has-text("Save")');
    ok('edit to 0 refused', (await text(page, '.pay.editing .err:not(:empty)')).includes('bigger than 0'));
    await page.fill('[id^="ep-"][id$="-d"]', '2026-12-15'); await page.fill('[id^="ep-"][id$="-a"]', '20'); await page.click('.pay.editing button:has-text("Save")');
    ok('edited payment date', (await shoes().locator('.act').innerText()).includes('Last payment Tue 15 Dec 2026'));
    await (await payBtn(page, 'Shoes', 'Payment 4 of 4', 'Edit')).click();
    await page.click('.pay.editing button:has-text("Delete this payment")');
    ok('deleted a payment', (await shoes().locator('.r-big').innerText()) === '45');
    await shoes().locator('.undo').click();
    ok('undo the delete', (await shoes().locator('.r-big').innerText()) === '65');

    // change amount owed (part refund) on the phone: 1,100 left over 11 payments -> 990 = 90 each
    await box(page, 'Phone').locator('button', { hasText: 'Change amount owed' }).click();
    await page.fill('[id^="ow-"]', '990'); await page.click('.panel button:has-text("Save")');
    ok('new amount owed shared', (await box(page, 'Phone').locator('.r-big').innerText()) === '990' && (await text(page, '#p-list .plan:first-child .msg')).includes('11 payments of 90'), await text(page, '#p-list .plan:first-child .msg'));
    // a late fee
    await box(page, 'Phone').locator('button', { hasText: '+ Add a fee' }).click();
    await page.fill('[id^="fe-"][id$="-a"]', '12'); await page.fill('[id^="fe-"][id$="-d"]', '2026-10-20'); await page.click('.panel button:has-text("Add fee")');
    ok('fee added to what is owed and late', (await box(page, 'Phone').locator('.r-big').innerText()) === '1,002' && (await text(page, '.alert.bad')).startsWith('Late: 2 payments, 102'), await text(page, '.alert.bad'));
    ok('fee row labelled', await box(page, 'Phone').locator('.pay-n', { hasText: /^Fee · / }).count() === 1);

    // returned the shoes
    await shoes().locator('button', { hasText: 'Returned it' }).click();
    ok('refund defaults to what was paid', await page.inputValue('[id^="rt-"][id$="-a"]') === '20');
    await page.fill('[id^="rt-"][id$="-a"]', '50'); await page.click('.panel button:has-text("Cancel the payments")');
    ok('refund bigger than paid refused', (await text(page, '.panel .err:not(:empty)')).includes('more than you paid'));
    await page.fill('[id^="rt-"][id$="-a"]', '20'); await page.click('.panel button:has-text("Cancel the payments")');
    ok('returned plan moved down', await page.locator('#p-list .p-name', { hasText: 'Shoes' }).count() === 0 && await page.isVisible('#done-wrap'));
    ok('refund alert', (await text(page, '.alert.info')) === 'Refunds to expect: 20 from 1 returned plan.');
    ok('owed total without the shoes', (await text(page, '.tile:nth-child(3)')).startsWith('Still owed in total 1,062'), await text(page, '.tile:nth-child(3)'));
    await page.click('#done-s');
    await shoes().locator('button', { hasText: 'Refund received' }).click();
    ok('refund received', await page.locator('.alert.info').count() === 0);
    await shoes().locator('button', { hasText: 'Not returned after all' }).click();
    ok('not returned after all', await page.locator('#p-list .p-name', { hasText: 'Shoes' }).count() === 1);
    await shoes().locator('button', { hasText: 'Returned it' }).click(); await page.click('.panel button:has-text("Cancel the payments")');

    // paid off early with a discount: 60 owed on the coat, paid 55
    await box(page, 'Winter coat').locator('button', { hasText: 'Paid off early' }).click();
    ok('pay-off amount defaults to owed', await page.inputValue('[id^="po-"][id$="-a"]') === '60');
    await page.fill('[id^="po-"][id$="-a"]', '70'); await page.click('.panel button:has-text("Mark all as paid")');
    ok('paying more than owed refused', (await text(page, '.panel .err:not(:empty)')).includes('more than you owe'));
    await page.fill('[id^="po-"][id$="-a"]', '55'); await page.click('.panel button:has-text("Mark all as paid")');
    ok('coat paid off', (await text(page, '#done-s')) === 'Paid off and returned (2)');
    s = await saved(page);
    ok('discount spread exactly', s.plans.find(p => p.name === 'Winter coat').pays.reduce((a, p) => a + p.amt, 0) === 11500);

    // edit details
    await box(page, 'Phone').locator('button', { hasText: 'Edit details' }).click();
    await page.fill('[id^="ed-"][id$="-n"]', ''); await page.click('.panel button:has-text("Save")');
    ok('blank name refused when editing', (await text(page, '.panel .err:not(:empty)')).includes('Type what you bought'));
    const long = 'Samsung Galaxy phone with the case, charger and the two year screen cover';
    await page.fill('[id^="ed-"][id$="-n"]', long); await page.fill('[id^="ed-"][id$="-p"]', 'HBL 0% plan'); await page.click('.panel button:has-text("Save")');
    ok('long name cut to 60 and saved', (await page.locator('#p-list .p-name').first().innerText()) === long.slice(0, 60));
    await layoutCheck(page, 'long name 390');

    // reload keeps everything; currency remembered
    await page.selectOption('#cur', '£');
    ok('currency shows', (await text(page, '.tile:nth-child(3) .t-big')).startsWith('£'));
    await page.reload();
    ok('reload keeps plans and currency', (await page.locator('.plan').count()) === 3 && (await text(page, '.tile:nth-child(3) .t-big')).startsWith('£'));
    ok('currency tag on the form', (await text(page, '#f-amt-cur')) === '£');

    // copy and email
    await page.click('button:has-text("Copy summary")');
    const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
    ok('copied summary', clip.includes('Still owed in total: £1,002') && clip.includes('LATE: 2 payments, £102'), clip.slice(0, 200));
    await page.click('button:has-text("Email summary")');
    const mail = await page.evaluate(() => window.__mail || '');
    ok('email with no recipient', mail.startsWith('mailto:?subject=My%20instalments&body=') && decodeURIComponent(mail).includes('Still owed in total'));
    // calendar
    let dl = page.waitForEvent('download'); await page.click('button:has-text("Add to calendar")');
    let f = await dl; let body = fs.readFileSync(await f.path(), 'utf8');
    ok('calendar file', f.suggestedFilename() === 'instalments.ics' && (body.match(/BEGIN:VEVENT/g) || []).length === 10, (body.match(/BEGIN:VEVENT/g) || []).length);
    // copy one plan
    await box(page, 'HBL').first().locator('button', { hasText: /^Copy$/ }).click().catch(async () => page.locator('#p-list .plan').first().locator('button', { hasText: /^Copy$/ }).click());
    const clip2 = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
    ok('copied one plan', clip2.includes('(HBL 0% plan)') && clip2.includes('(LATE)'), clip2.slice(0, 120));

    // backup and restore
    dl = page.waitForEvent('download'); await page.click('#backup'); f = await dl;
    const backupPath = path.join(DIR, '..', '.ui-backup.json'); fs.copyFileSync(await f.path(), backupPath);
    ok('backup has the plans', JSON.parse(fs.readFileSync(backupPath, 'utf8')).plans.length === 3);
    await page.click('#del-all');
    ok('delete everything', await page.locator('.plan').count() === 0 && await page.isVisible('#intro'));
    await page.locator('#tools-msg .undo').click();
    ok('undo delete everything', await page.locator('.plan').count() === 3);
    await page.click('#del-all');
    await page.setInputFiles('#restore-file', backupPath);
    await page.waitForTimeout(300);
    ok('restore a backup', await page.locator('.plan').count() === 3 && (await text(page, '#tools-msg')).startsWith('Restored 3 plans.'));
    const badPath = path.join(DIR, '..', '.ui-bad.json'); fs.writeFileSync(badPath, '{"hello": 1}');
    await page.setInputFiles('#restore-file', badPath); await page.waitForTimeout(300);
    ok('bad file refused', (await text(page, '#tools-msg')).includes('not a backup') && await page.locator('.plan').count() === 3);
    fs.unlinkSync(badPath);

    // delete one plan, undo
    await page.locator('#p-list .plan').first().locator('button', { hasText: 'Delete plan' }).click();
    ok('delete plan', await page.locator('#p-list .plan').count() === 0);
    await page.locator('#top-msg .undo').click();
    ok('undo delete plan', await page.locator('#p-list .plan').count() === 1);
    // keyboard: Enter in the form adds the plan
    await page.fill('#f-name', 'Sofa'); await page.fill('#f-prov', 'Shop instalment plan'); await page.fill('#f-amt', '1000'); await page.fill('#f-n', '7'); await page.selectOption('#f-freq', 'w');
    await page.fill('#f-first', '2026-11-02'); await page.dispatchEvent('#f-first', 'change');
    await page.focus('#f-amt'); await page.keyboard.press('Enter');
    ok('Enter adds the plan', await box(page, 'Sofa').count() === 1);
    s = await saved(page);
    ok('sofa odd cents', JSON.stringify(s.plans.find(p => p.name === 'Sofa').pays.map(p => p.amt)) === '[14286,14286,14286,14286,14286,14285,14285]');
    ok('form cleared after adding', await page.inputValue('#f-name') === '' && await page.inputValue('#f-n') === '4');
    ok('no errors in the main run', !page.errors.length && !page.bad.length, page.errors.concat(page.bad).join(' | '));
    const filled = JSON.stringify(await saved(page));
    await page.context().close();

    // ---------- second use the next week ----------
    page = await open(browser, 390, { state: filled, now: new Date('2026-11-04T09:00:00') });
    ok('next week: sofa payment of 2 Nov late', (await text(page, '.alert.bad')).includes('Sofa'), await text(page, '.alert.bad'));
    ok('next week: October tile gone', (await text(page, '.tile.main')).startsWith('Still to pay in November'));
    await page.context().close();

    // ---------- corrupt and blocked storage ----------
    page = await open(browser, 390, { state: '{not json' });
    ok('corrupt saved data: starts fresh with a note', (await text(page, '#top-msg')).includes('could not be read') && await page.isVisible('#intro') && !page.errors.length);
    await page.context().close();
    page = await open(browser, 390, { state: JSON.stringify({ plans: [{ name: 'X', provider: 'Y', pays: [{ due: 'bad', amt: -1 }] }] }) });
    ok('invalid rows dropped', await page.locator('.plan').count() === 0 && !page.errors.length);
    await page.context().close();
    page = await open(browser, 390, { block: true });
    ok('blocked storage: warning', await page.isVisible('#store-warn'));
    await addPlan(page, { chip: 'Pay in 3, monthly', name: 'Bag', prov: 'Tabby', amt: '90' });
    ok('blocked storage: still works', await box(page, 'Bag').count() === 1 && !page.errors.length, page.errors.join('|'));
    await page.context().close();

    // ---------- every width, filled in and cleared, dark and light ----------
    for (const scheme of ['dark', 'light']) for (const w of [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920]) {
        page = await open(browser, w, { state: filled, scheme });
        await layoutCheck(page, scheme + ' ' + w + ' filled');
        if (w <= 390) {
            const first = page.locator('#p-list .plan').first();
            for (const b of ['Paid off early', 'Returned it', 'Change amount owed', '+ Add a fee', 'Edit details']) {
                await first.locator('button', { hasText: b }).click(); await layoutCheck(page, scheme + ' ' + w + ' ' + b);
            }
            await first.locator('details.pays summary').click(); await first.locator('.pay button:has-text("Edit")').first().click(); await layoutCheck(page, scheme + ' ' + w + ' edit payment');
            await page.click('#f-down-open'); await page.selectOption('#f-freq', 'd'); await page.click('#done-s'); await layoutCheck(page, scheme + ' ' + w + ' all fields open');
        }
        if (w >= 900) for (const pos of [0, .5, 1]) {
            await page.evaluate(p => window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * p), pos);
            const o = await page.evaluate(() => {
                const bad = [];
                document.querySelectorAll('main, .col-a, .col-b').forEach(par => { const kids = [...par.children].filter(e => e.offsetParent !== null && e.getBoundingClientRect().height);
                    for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) { const a = kids[i].getBoundingClientRect(), b = kids[j].getBoundingClientRect();
                        if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) bad.push(kids[i].className + '/' + kids[j].className); } });
                return bad;
            });
            ok(scheme + ' ' + w + ' no overlap at scroll ' + pos, !o.length, o.join('; '));
        }
        await page.click('#del-all');
        await layoutCheck(page, scheme + ' ' + w + ' cleared');
        if (scheme === 'dark' && [320, 390, 820, 1280].includes(w)) {
            await page.click('.help-btn, button:has-text("Help")');
            const d = page.locator('dialog.help'), r = await d.boundingBox();
            ok('help opens on screen ' + w, await d.evaluate(e => e.open) && r.x >= 0 && r.y >= 0 && r.x + r.width <= w && r.y + r.height <= (w < 600 ? 800 : 900) && (await d.locator('h2').innerText()).includes('How to use'));
            await page.keyboard.press('Escape'); ok('Escape closes help ' + w, !await d.evaluate(e => e.open));
            await page.click('.help-btn, button:has-text("Help")'); await page.click('.help-close'); ok('Got it closes help ' + w, !await d.evaluate(e => e.open));
        }
        ok(scheme + ' ' + w + ' no errors', !page.errors.length, page.errors.join('|'));
        await page.context().close();
    }
    // the light/dark switch
    page = await open(browser, 1280);
    const bg1 = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await page.click('.theme-toggle');
    const bg2 = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    ok('light/dark switch changes the look', bg1 !== bg2 && await page.evaluate(() => document.documentElement.dataset.theme) === 'light');
    await page.context().close();

    // ---------- screenshots ----------
    if (args.includes('--shots')) {
        page = await open(browser, 1280);
        await sara(page);
        await (await payBtn(page, 'Winter coat', 'Payment 2 of 4', 'Not paid')).click();
        await page.evaluate(() => { document.querySelectorAll('.msg').forEach(m => { m.textContent = ''; m.className = 'msg'; }); window.scrollTo(0, 0); });
        await page.screenshot({ path: path.join(DIR, 'screenshots/desktop.png'), clip: { x: 0, y: 0, width: 1280, height: 1250 }, fullPage: true });
        const st = JSON.stringify(await saved(page));
        await page.context().close();
        page = await open(browser, 390, { scale: 2, state: st });
        await page.screenshot({ path: path.join(DIR, 'screenshots/phone.png'), clip: { x: 0, y: 0, width: 390, height: 1500 }, fullPage: true });
        await page.context().close();
    }
    fs.existsSync(backupPath) && fs.unlinkSync(backupPath);
    await browser.close();
    console.log(pass + ' passed, ' + fail + ' failed');
    if (fail) process.exitCode = 1;
})();
