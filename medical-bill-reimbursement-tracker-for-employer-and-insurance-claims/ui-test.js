// Drives the real page in headless Chromium. Run from the repo root:
//   node medical-bill-reimbursement-tracker-for-employer-and-insurance-claims/ui-test.js [--base http://localhost:8765] [--shots]
// --base defaults to a local server you start yourself (python3 -m http.server 8765 in the repo root).
// --shots also saves screenshots/desktop.png and screenshots/phone.png.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const args = process.argv.slice(2);
const bi = args.indexOf('--base'), BASE = (bi >= 0 ? args[bi + 1] : 'http://localhost:8765').replace(/\/$/, '');
const SLUG = 'medical-bill-reimbursement-tracker-for-employer-and-insurance-claims';
const URL = BASE + '/' + SLUG + '/';
const KEY = SLUG + '.state';
const DIR = __dirname;
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; if (!cond) console.log('FAIL ' + name + (extra ? '  ' + extra : '')); };
const NOW = new Date('2026-10-27T10:00:00');

async function open(browser, width, opts) {
    opts = opts || {};
    const ctx = await browser.newContext({ viewport: { width, height: width < 600 ? 800 : 900 }, deviceScaleFactor: opts.scale || 1, colorScheme: opts.scheme || 'dark', locale: 'en-GB', acceptDownloads: true });
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE }).catch(() => {});
    const page = await ctx.newPage();
    await page.clock.setFixedTime(opts.now || NOW);
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
const bill = (page, text) => page.locator('#b-list .bill', { hasText: text });
async function addBill(page, d, amt, who, kind, more) {
    await page.fill('#b-date', d); await page.fill('#b-amt', amt); await page.fill('#b-who', who); await page.selectOption('#b-kind', kind);
    if (more) { if (await page.locator('#b-more-open').isVisible()) await page.click('#b-more-open'); await page.fill('#b-place', more); }
    await page.click('#b-save');
}
async function setEmployer(page) {
    await page.locator('#p-list .payer').first().getByRole('button', { name: /^Edit/ }).click();
    await page.fill('#pf-name', 'Employer'); await page.selectOption('#pf-days', '90');
    await page.click('#pf-limit-open'); await page.fill('#pf-limit', '60,000'); await page.selectOption('#pf-start', '7');
    await page.click('.pf .primary');
}
// Usman's family: the bills of the last months, two claims sent
async function usman(page) {
    await setEmployer(page);
    await addBill(page, '2026-08-02', '4800', 'Mother', 'Lab test', 'City Lab');
    await addBill(page, '2026-08-20', '1,800', 'Ali', 'Doctor');
    await addBill(page, '2026-09-12', '35 000', 'Mother', 'Hospital', 'General Hospital');
    await addBill(page, '2026-10-05', '860', 'Sara', 'Medicine');
    await addBill(page, '2026-10-20', 'Rs 3200', 'Mother', 'Lab test', 'City Lab');
    await bill(page, '2 Aug').locator('.tick input').check(); await bill(page, '20 Aug').locator('.tick input').check();
    await page.fill('#nc-date', '2026-08-25'); await page.click('#nc-save');
    await page.locator('#w-list .claim').first().getByRole('button', { name: /^Refund received/ }).click();
    await page.fill('#pp-got', '5400'); await page.fill('#pp-date', '2026-09-15'); await page.click('#w-list .panel .primary');
    await bill(page, 'Hospital').locator('.tick input').check(); await page.fill('#nc-date', '2026-09-30');
    await page.click('#nc-ref-open'); await page.fill('#nc-ref', 'HR-2231'); await page.click('#nc-save');
}

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
            document.querySelectorAll('main, .app, .col-a, .col-b, .b-list, .cl-list').forEach(par => {
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

(async () => {
    const browser = await chromium.launch();

    // ---------- first use ----------
    let page = await open(browser, 390);
    ok('first use: How it works shows, no summary or bill list', await page.isVisible('#intro') && !(await page.isVisible('#glance')) && !(await page.isVisible('#bills')));
    ok('first use: restore link offered', await page.isVisible('#restore-first'));
    ok('first use: one place, Claim it from hidden', !(await page.isVisible('#b-payer-box')) && (await txt(page, '#p-list')).includes('No time limit to claim'));
    ok('optional fields hidden behind a button', !(await page.isVisible('#b-place')) && await page.isVisible('#b-more-open'));
    ok('date starts at today', (await page.inputValue('#b-date')) === '2026-10-27');

    // ---------- typed mistakes ----------
    await page.click('#b-save');
    ok('blank amount and person explained', (await txt(page, '#b-amt-err')).includes('Type the amount') && (await txt(page, '#b-who-err')).includes('who the bill was for'));
    for (const [v, want] of [['0', 'bigger than 0'], ['-50', 'without a minus'], ['abc', 'such as 2500'], ['12.3456', '2 decimal'], ['99999999999', 'too big']]) {
        await page.fill('#b-amt', v); await page.click('#b-save');
        ok('amount "' + v + '" refused', (await txt(page, '#b-amt-err')).includes(want), await txt(page, '#b-amt-err'));
    }
    await page.fill('#b-date', '2026-11-02'); await page.click('#b-save');
    ok('future date refused', (await txt(page, '#b-date-err')).includes('future'));
    ok('nothing saved after mistakes', (await page.evaluate(k => localStorage.getItem(k), KEY)) === null);

    // ---------- a bill with only the needed fields; Enter saves ----------
    await page.fill('#b-date', '2026-10-26'); await page.fill('#b-amt', '2500'); await page.fill('#b-who', 'Me');
    await page.press('#b-who', 'Enter');
    let s = await saved(page);
    ok('saved without the optional fields', s.bills.length === 1 && s.bills[0].amt === 250000 && !('place' in s.bills[0]) && !('note' in s.bills[0]));
    ok('after saving: date and person kept, amount cleared', (await page.inputValue('#b-date')) === '2026-10-26' && (await page.inputValue('#b-who')) === 'Me' && (await page.inputValue('#b-amt')) === '');
    ok('saved message with Undo', (await txt(page, '#add-msg')).includes('Saved: Me · Doctor, 2,500.') && await page.isVisible('#add-msg .undo'));
    ok('no time limit set: bill says so', (await txt(page, '#b-list')).includes('No time limit to claim'));
    ok('a chip for the person appears', await page.isVisible('#who-quick .chip:has-text("Me")'));
    await page.click('#add-msg .undo');
    ok('undo removes the bill', (await saved(page)).bills.length === 0 && await page.isVisible('#intro'));
    await page.context().close();

    // ---------- the main situation ----------
    page = await open(browser, 390);
    await usman(page);
    ok('limit typed as 60,000 saved exactly', (await saved(page)).payers[0].limit === 6000000);
    const g = await txt(page, '#glance');
    ok('still to claim 4,060 in 2 bills', /Still to claim\s+4,060/.test(g) && g.includes('2 bills · claim the first by Sun, 3 Jan 2027 (in 68 days)'), g);
    ok('waiting 35,000 for 27 days', g.includes('35,000') && g.includes('1 claim · oldest sent 30 Sept (27 days ago)'), g);
    ok('tiles: spent 45,660, refunded 5,400, not refunded 1,200', /Spent on bills\s*45,660/.test(g) && /Refunded so far\s*5,400/.test(g) && /Not refunded\s*1,200/.test(g), g);
    ok('limit: 19,600 of 60,000 left, used 40,400', g.includes('Employer · claim year 1 Jul 2026 to 30 Jun 2027') && g.includes('19,600 of 60,000 left') && g.includes('Used 40,400: refunded 5,400, waiting 35,000.'), g);
    ok('not claimed yet: Sara first, then Mother', (await page.locator('#b-list .b-name').allInnerTexts()).join('|') === 'Sara · Medicine|Mother · Lab test');
    ok('claim-by shown on each bill', (await txt(page, '#b-list')).includes('Claim by Sun, 3 Jan 2027 (in 68 days)'));
    const h = await txt(page, '#h-list');
    ok('part refund: 5,400 of 6,600, 1,200 not refunded, shared to the cent', h.includes('Refunded 5,400 of 6,600 on 15 Sept') && h.includes('1,200 not refunded') && h.includes('4,800, refunded 3,927.27') && h.includes('1,800, refunded 1,472.73'), h);
    ok('waiting claim with its number', (await txt(page, '#w-list')).includes('No. HR-2231') && (await txt(page, '#w-list')).includes('27 days ago'));
    const pp = await txt(page, '#pp-list');
    ok('each person: Mother 43,000 with 35,000 waiting and 3,200 to claim', pp.includes('Mother') && pp.includes('43,000') && pp.includes('3,927.27'), pp);
    ok('people chips', (await page.locator('#who-quick .chip').allInnerTexts()).join('|') === 'Mother|Sara|Ali');

    // copy summary and the email link
    await page.click('#g-copy');
    const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
    ok('summary copied', clip.includes('Still to claim: 4,060 (2 bills). Claim the first by 3 Jan 2027.') && clip.includes('- 5 Oct 2026, Sara, Medicine: 860, claim by 3 Jan 2027'), clip);
    const mail = await page.getAttribute('#g-mail', 'href');
    ok('email link works with no recipient', mail.startsWith('mailto:?subject=') && decodeURIComponent(mail).includes('Still to claim: 4,060'));
    // calendar file
    let [dl] = await Promise.all([page.waitForEvent('download'), page.click('#g-cal')]);
    let body = fs.readFileSync(await dl.path(), 'utf8');
    ok('calendar file for 3 Jan 2027', dl.suggestedFilename() === 'claim-medical-bills-by-2027-01-03.ics' && body.includes('DTSTART;VALUE=DATE:20270103') && body.includes('Sara'));

    // ---------- new claim: amounts, copy list, partial ----------
    await bill(page, 'Sara').locator('.tick input').check(); await bill(page, 'Mother · Lab test').locator('.tick input').check();
    ok('new claim box shows the total', (await txt(page, '#nc-h')) === 'New claim: 2 bills, 4,060');
    const mid = (await page.locator('#nc-list input').nth(1).getAttribute('id'));
    await page.fill('#' + mid, '5000'); await page.click('#nc-save');
    ok('claiming more than the bill refused', (await txt(page, '#' + mid + '-err')).includes('At most 3,200'));
    await page.fill('#' + mid, '2000');
    ok('total follows typing', (await txt(page, '#nc-h')) === 'New claim: 2 bills, 2,860');
    await page.fill('#nc-date', '2026-10-10'); await page.click('#nc-save');
    ok('claim before a bill date refused', (await txt(page, '#nc-date-err')).includes('before the bill date (20 Oct 2026)'));
    await page.fill('#nc-date', '2026-10-27');
    await page.click('#nc-copy');
    const list = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
    ok('copy list for the claim form', list.includes('Medical claim for Employer, 27 Oct 2026') && list.includes('2. 20 Oct 2026, Mother, Lab test, City Lab: 2,000') && list.includes('Total: 2,860'), list);
    await page.click('#nc-save');
    ok('partly claimed bill stays with 1,200 to claim', (await txt(page, '#b-list')).includes('1,200 still to claim of 3,200 (2,000 waiting)'));
    ok('two claims waiting', (await page.locator('#w-list .claim').count()) === 2);

    // ---------- rejected, then sent again ----------
    const newest = page.locator('#w-list .claim', { hasText: '27 Oct' });
    await newest.getByRole('button', { name: /^Rejected/ }).click();
    await page.fill('#pp-why', 'Receipt not stamped'); await page.click('#w-list .panel .primary');
    ok('rejected: bills back with the reason', (await txt(page, '#b-list')).includes('Rejected on 27 Oct: Receipt not stamped. Fix it and claim again.') && (await txt(page, '#glance')).includes('4,060'));
    ok('rejected claim in history', (await txt(page, '#h-list')).includes('Reason: Receipt not stamped.'));
    // send Sara again, then try to put the rejected claim back to waiting: would claim twice
    await bill(page, 'Sara').locator('.tick input').check(); await page.click('#nc-save');
    await page.locator('#h-list .claim', { hasText: 'Rejected' }).getByRole('button', { name: /^Mark as waiting again/ }).click();
    ok('claiming a bill twice is refused', (await txt(page, '#top-msg, #waiting-msg')).includes('for more than it cost') || (await page.locator('.msg.bad').allInnerTexts()).join(' ').includes('for more than it cost'));

    // ---------- edit a claim, take a bill out, delete with undo ----------
    const sara = page.locator('#w-list .claim', { hasText: 'Sara' });
    await sara.getByRole('button', { name: /^Edit claim/ }).click();
    await page.fill('#w-list .panel input[id^="pe-a-"]', '900'); await page.click('#w-list .panel .primary');
    ok('edit claim: more than the bill refused', (await page.locator('#w-list .panel .err').first().innerText()).includes('At most 860'));
    await page.fill('#w-list .panel input[id^="pe-a-"]', '800'); await page.fill('#pe-ref', 'HR-2290'); await page.click('#w-list .panel .primary');
    ok('edit claim saved', (await txt(page, '#w-list')).includes('No. HR-2290') && (await txt(page, '#b-list')).includes('60 still to claim of 860'));
    await page.locator('#w-list .claim', { hasText: 'HR-2290' }).getByRole('button', { name: /^Delete claim/ }).click();
    ok('delete claim: bill back in full', (await txt(page, '#b-list')).includes('Sara · Medicine') && !(await txt(page, '#b-list')).includes('60 still to claim'));
    await page.click('#waiting-msg .undo');
    ok('undo brings the claim back', (await txt(page, '#w-list')).includes('HR-2290'));

    // ---------- refund: too much, part, claim the rest ----------
    const hosp = page.locator('#w-list .claim', { hasText: 'HR-2231' });
    await hosp.getByRole('button', { name: /^Refund received/ }).click();
    ok('refund amount starts at the claim total', (await page.inputValue('#pp-got')) === '35000');
    await page.fill('#pp-got', '36000'); await page.click('#w-list .panel .primary');
    ok('refund above the claim refused', (await txt(page, '#pp-got-err')).includes('at most 35,000'));
    await page.fill('#pp-got', '30000'); await page.click('#w-list .panel .primary');
    ok('part refund saved', (await txt(page, '#h-list')).includes('Refunded 30,000 of 35,000') && (await txt(page, '#h-list')).includes('5,000 not refunded'));
    await page.locator('#h-list .claim', { hasText: '30,000' }).getByRole('button', { name: 'Claim the rest somewhere else' }).click();
    ok('the rest is back in Not claimed yet', (await txt(page, '#b-list')).includes('5,000 still to claim of 35,000 (30,000 refunded)'));
    await page.locator('#h-list .claim', { hasText: '30,000' }).getByRole('button', { name: 'Do not claim the rest' }).click();
    ok('and off again', !(await txt(page, '#b-list')).includes('5,000 still to claim'));

    // ---------- bills: edit, below the claimed amount, not claiming, delete ----------
    await page.click('.tab[data-tab="all"]');
    ok('all bills tab lists every bill', (await page.locator('#b-list .bill').count()) === 5);
    await bill(page, 'Hospital').getByRole('button', { name: /^Edit/ }).click();
    ok('edit fills the form', (await page.inputValue('#b-amt')) === '35000' && (await txt(page, '#add-h')) === 'Edit bill' && (await page.inputValue('#b-place')) === 'General Hospital');
    await page.fill('#b-amt', '20000'); await page.click('#b-save');
    ok('lowering below the claimed amount refused', (await txt(page, '#b-amt-err')).includes('already in a claim'));
    await page.fill('#b-amt', '35000'); await page.fill('#b-note', 'Receipt in the blue file'); await page.click('#b-save');
    ok('edit saved and form back to adding', (await txt(page, '#add-h')) === 'Add a medical bill' && (await txt(page, '#b-list')).includes('Receipt in the blue file'));
    await page.click('.tab[data-tab="todo"]');
    await bill(page, 'Mother · Lab test').getByRole('button', { name: /^Not claiming/ }).click();
    ok('not claiming hides it from the list', !(await txt(page, '#b-list')).includes('Mother · Lab test'));
    await page.click('.tab[data-tab="all"]');
    await bill(page, '20 Oct').getByRole('button', { name: /^Claim after all/ }).click();
    await page.click('.tab[data-tab="todo"]');
    ok('claim after all brings it back', (await txt(page, '#b-list')).includes('Mother · Lab test'));
    await page.click('.tab[data-tab="all"]');
    await bill(page, 'Ali').getByRole('button', { name: /^Delete/ }).click();
    s = await saved(page);
    ok('deleting a refunded bill takes it out of its claim and its refund share', s.bills.length === 4 && s.claims.find(c => c.items.some(i => i.b === s.bills.find(b => b.who === 'Mother' && b.d === '2026-08-02').id)).got === 392727);
    await page.click('#bills-msg .undo');
    ok('undo brings the bill back', (await saved(page)).bills.length === 5);

    // ---------- reload keeps everything; next day counts down ----------
    const before = JSON.stringify(await saved(page));
    await page.reload();
    ok('reload keeps everything', JSON.stringify(await saved(page)) === before && (await txt(page, '#glance')).includes('Still to claim'));
    await page.context().close();
    page = await open(browser, 390, { state: before, now: new Date('2026-10-28T09:00:00') });
    ok('next day: one day less', (await txt(page, '#b-list')).includes('(in 67 days)'));

    // ---------- second place, per-person limit, currency ----------
    await page.click('#p-add');
    await page.click('.pf .chip:has-text("Health insurance")'); await page.selectOption('#pf-days', 'other'); await page.fill('#pf-odays', '45');
    await page.click('#pf-limit-open'); await page.fill('#pf-limit', '25000'); await page.selectOption('#pf-per', 'person');
    await page.click('.pf .primary');
    ok('second place added: Claim it from appears', await page.isVisible('#b-payer-box') && (await page.locator('#b-payer option').count()) === 2);
    await page.click('#p-add'); await page.fill('#pf-name', 'employer'); await page.click('.pf .primary');
    ok('duplicate name refused', (await txt(page, '#pf-name-err')).includes('already have'));
    await page.locator('.pf').getByRole('button', { name: 'Cancel' }).click();
    await page.selectOption('#b-payer', { label: 'Health insurance' });
    await addBill(page, '2026-10-27', '1500', 'Ali', 'Eyes');
    { const t = await txt(page, '#b-list'); ok('insurance bill: claim by in 45 days', (await txt(page, '#b-list')).includes('Claim by Fri 11 Dec (in 44 days)') && (await txt(page, '#b-list')).includes('from Health insurance'), t.slice(0, 400)); }
    await bill(page, 'Eyes').locator('.tick input').check(); await page.selectOption('#nc-payer', { label: 'Health insurance' }); await page.click('#nc-save');
    ok('per-person limit shows each person', (await txt(page, '#glance')).includes('Yearly limit 25,000 for each person.') && (await txt(page, '#glance')).includes('Ali: 1,500 used, 23,500 left'));
    await page.selectOption('#cur', 'Rs');
    ok('currency symbol shown', (await txt(page, '#glance')).includes('Rs 4,060') || (await txt(page, '#glance')).includes('Rs '));
    await page.reload();
    ok('currency remembered', (await page.inputValue('#cur')) === 'Rs' && (await txt(page, '.cur-tag')) === 'Rs');
    await page.locator('#p-list .payer', { hasText: 'Health insurance' }).getByRole('button', { name: /^Delete/ }).click();
    ok('deleting a place moves its bills', (await saved(page)).bills.every(b => b.payer === (s = null, 'p1')) && (await txt(page, '#payers-msg')).includes('now say Employer'));
    await page.click('#payers-msg .undo');

    // ---------- backup, spreadsheet, restore, delete everything ----------
    [dl] = await Promise.all([page.waitForEvent('download'), page.click('#backup')]);
    const bk = await dl.path();
    ok('backup file is the saved data', JSON.parse(fs.readFileSync(bk, 'utf8')).bills.length === 6);
    [dl] = await Promise.all([page.waitForEvent('download'), page.click('#csv')]);
    body = fs.readFileSync(await dl.path(), 'utf8');
    ok('spreadsheet has every bill', body.split('\r\n').filter(Boolean).length === 7 && body.includes('"Bill date"') && body.includes('"Receipt in the blue file"'));
    await page.click('#del-all');
    ok('delete everything empties the app', await page.isVisible('#intro') && (await saved(page)).bills.length === 0 && (await page.inputValue('#cur')) === 'Rs');
    await page.click('#tools-msg .undo');
    ok('undo brings it all back', (await saved(page)).bills.length === 6);
    await page.click('#del-all');
    const junk = path.join(DIR, '..', 'not-a-backup.json'); fs.writeFileSync(junk, '{"hello":1}');
    await page.setInputFiles('#restore-file', junk); await page.waitForTimeout(200);
    ok('a wrong file is refused', (await page.locator('.msg.bad').allInnerTexts()).join(' ').includes('not a backup'));
    fs.unlinkSync(junk);
    await page.setInputFiles('#restore-file', bk); await page.waitForTimeout(200);
    ok('restore brings the backup back', (await saved(page)).bills.length === 6 && (await txt(page, '#glance')).includes('Still to claim'));
    ok('no errors in the main run', !page.errors.length && !page.bad.length, page.errors.concat(page.bad).join(' | '));
    const full = JSON.stringify(await saved(page));
    await page.context().close();

    // ---------- corrupt or blocked storage ----------
    page = await open(browser, 390, { state: '{not json' });
    ok('corrupt saved data: starts fresh', await page.isVisible('#intro') && !page.errors.length);
    await page.context().close();
    page = await open(browser, 390, { state: JSON.stringify({ payers: 'x', bills: [{ d: 'nope' }], claims: 3 }) });
    ok('tampered saved data: starts fresh', await page.isVisible('#intro') && !page.errors.length);
    await page.context().close();
    page = await open(browser, 390, { block: true });
    ok('blocked storage: warning shown, app still works', await page.isVisible('#store-warn'));
    await addBill(page, '2026-10-20', '500', 'Me', 'Medicine');
    ok('blocked storage: bill still listed', (await txt(page, '#b-list')).includes('Me · Medicine') && !page.errors.length, page.errors.join('|'));
    await page.context().close();

    // ---------- very long text ----------
    page = await open(browser, 320);
    await addBill(page, '2026-10-20', '123456789.99', 'Muhammad Abdul Rahman Siddiqui Khan Jr', 'Hospital', 'Shaukat Khanum Memorial Cancer Hospital and Research Centre');
    const l0 = await layout(page);
    ok('long names and a huge amount fit at 320', !l0.length, l0.join(' | '));
    await page.context().close();

    // ---------- the light/dark switch ----------
    page = await open(browser, 390, { state: full });
    const bg1 = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await page.locator('.theme-toggle').click();
    const bg2 = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    ok('theme switch changes the look', bg1 !== bg2);
    await page.reload();
    ok('theme choice remembered', (await page.evaluate(() => getComputedStyle(document.body).backgroundColor)) === bg2);
    await page.context().close();

    // ---------- Help at 4 widths ----------
    for (const w of [320, 390, 820, 1280]) {
        page = await open(browser, w, { state: full });
        await page.getByRole('button', { name: /help/i }).first().click();
        const dlg = page.locator('dialog[open], [role=dialog]').first();
        await dlg.waitFor();
        const r = await dlg.boundingBox();
        ok('help opens inside the screen at ' + w, r && r.x >= 0 && r.x + r.width <= w + 1 && (await dlg.innerText()).includes('How to use the Medical Bill Reimbursement Tracker'));
        await page.keyboard.press('Escape');
        ok('Escape closes help at ' + w, !(await dlg.isVisible()));
        await page.getByRole('button', { name: /help/i }).first().click();
        await page.getByRole('button', { name: 'Got it' }).click();
        ok('Got it closes help at ' + w, !(await page.locator('dialog[open], [role=dialog]').first().isVisible()));
        const top = await page.evaluate(() => [...document.querySelectorAll('.topbar a, .topbar button, main > .back')].map(e => e.getBoundingClientRect()).map(r => [r.top, r.bottom, r.left, r.right]));
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
            // every optional field and panel open
            await page.click('#b-more-open');
            await page.locator('#b-list .tick input').first().check(); await page.click('#nc-ref-open');
            await page.locator('#w-list .claim').first().getByRole('button', { name: /^Refund received/ }).click();
            await page.click('#p-add'); await page.selectOption('#pf-days', 'other'); await page.click('#pf-limit-open');
            l = await layout(page);
            ok(scheme + ' ' + w + ' all fields open: no overflow', !l.length, l.join(' | '));
            let c = await controlsOverlap(page);
            ok(scheme + ' ' + w + ' no controls overlap', !c.length, c.join(' | '));
            await page.locator('#w-list .panel').getByRole('button', { name: 'Cancel' }).click();
            await page.locator('#w-list .claim').first().getByRole('button', { name: /^Edit claim/ }).click();
            c = await controlsOverlap(page); l = await layout(page);
            ok(scheme + ' ' + w + ' edit claim open: no overlap or overflow', !c.length && !l.length, c.concat(l).join(' | '));
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
        page = await open(browser, 1280);
        await usman(page);
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.setViewportSize({ width: 1280, height: 1250 });
        await page.screenshot({ path: path.join(DIR, 'screenshots/desktop.png') });
        const st = JSON.stringify(await saved(page));
        await page.context().close();
        page = await open(browser, 390, { state: st, scale: 2 });
        await page.setViewportSize({ width: 390, height: 1150 });
        await page.screenshot({ path: path.join(DIR, 'screenshots/phone.png') });
        await page.context().close();
    }
    await browser.close();
    console.log(pass + ' passed, ' + fail + ' failed');
    if (fail) process.exitCode = 1;
})();
