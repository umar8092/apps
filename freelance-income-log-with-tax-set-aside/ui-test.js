// Drives the real page in headless Chromium. Run from the repo root:
//   node freelance-income-log-with-tax-set-aside/ui-test.js [--base http://localhost:8765] [--shots]
// --base defaults to a local server you start yourself (python3 -m http.server 8765 in the repo root).
// --shots also saves screenshots/desktop.png and screenshots/phone.png.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const args = process.argv.slice(2);
const bi = args.indexOf('--base'), BASE = (bi >= 0 ? args[bi + 1] : 'http://localhost:8765').replace(/\/$/, '');
const URL = BASE + '/freelance-income-log-with-tax-set-aside/';
const KEY = 'freelance-income-log-with-tax-set-aside.state';
const DIR = __dirname;
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; if (!cond) console.log('FAIL ' + name + (extra ? '  ' + extra : '')); };
const NOW = new Date('2026-10-28T10:00:00');

async function open(browser, width, opts) {
    opts = opts || {};
    const ctx = await browser.newContext({ viewport: { width, height: width < 600 ? 800 : 900 }, deviceScaleFactor: opts.scale || 1, colorScheme: opts.scheme || 'dark', locale: 'en-GB', timezoneId: opts.tz || 'Asia/Karachi', acceptDownloads: true });
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
const text = async (loc) => (await loc.first().innerText()).replace(/\s+/g, ' ').trim();
const inner = async (page, sel) => (await page.innerText(sel)).replace(/\u00a0/g, ' ');
const cbox = (page, name) => page.locator('.client', { has: page.locator('.c-name', { hasText: new RegExp('^' + name + '$') }) });
async function addPay(page, o) {
    if (o.client) {
        const has = await page.locator('#f-client option', { hasText: new RegExp('^' + o.client + '$') }).count();
        if (has && await page.isVisible('#f-client')) await page.selectOption('#f-client', { label: o.client });
        else { if (await page.isVisible('#f-client')) await page.selectOption('#f-client', '__new'); await page.fill('#f-new', o.client); }
    }
    if (o.date) await page.fill('#f-date', o.date);
    if (o.cur != null) await page.selectOption('#f-cur', o.cur);
    if (o.gross != null) await page.fill('#f-gross', o.gross);
    if (o.fee != null) await page.fill('#f-fee', o.fee);
    if (o.conv) await page.check('input[name="f-conv"][value="' + o.conv + '"]', { force: true });
    if (o.home != null) await page.fill('#f-home', o.home);
    if (o.rate != null) await page.fill('#f-rate', o.rate);
    if (o.refund) await page.check('#f-refund');
    if (o.note) { if (await page.isVisible('#f-note-open')) await page.click('#f-note-open'); await page.fill('#f-note', o.note); }
    await page.click('#f-save');
}
// the worked example from the README
async function example(page) {
    await page.selectOption('#cur', 'Rs');
    await page.selectOption('#t-pct', '1500');
    await page.selectOption('#t-year', '07-01');
    await addPay(page, { client: 'Maple and Co', date: '2026-06-15', cur: 'GBP', gross: '200', conv: 'home', home: '70,000' });
    await addPay(page, { client: 'Northwind Studio', date: '2026-09-12', cur: 'USD', gross: '500', fee: '10%', conv: 'rate', rate: '280' });
    await addPay(page, { client: 'Northwind Studio', date: '2026-09-20', cur: 'USD', gross: '100', fee: '', conv: 'rate', rate: '280', refund: true, note: 'Refund for cancelled banner' });
    await addPay(page, { client: 'Northwind Studio', date: '2026-10-02', gross: '600', conv: 'rate', rate: '279.20', note: 'Upwork, website redesign' });
    await addPay(page, { client: 'Brightline Media', date: '2026-10-14', cur: 'USD', gross: '800', fee: '24', conv: 'home', home: '216,040' });
    await addPay(page, { client: 'Maple and Co', date: '2026-10-20', gross: '250', fee: '1.85', conv: 'rate', rate: '371.60' });
    await addPay(page, { client: 'Local school', date: '2026-10-25', cur: '', gross: '35,000', fee: '' });
    await addPay(page, { client: 'Brightline Media', date: '2026-10-27', gross: '300', fee: '9', conv: 'none' });
    await page.fill('#s-amt', '30,000'); await page.fill('#s-date', '2026-09-30'); await page.click('#s-add');
}

(async () => {
    const browser = await chromium.launch();

    // ---- first use, empty state ----
    let page = await open(browser, 390);
    ok('intro shown on first use', await page.isVisible('#intro'));
    ok('summary hidden on first use', !(await page.isVisible('#sum')));
    ok('no client picker before any client', !(await page.isVisible('#f-client')) && await page.isVisible('#f-new'));
    ok('date defaults to today', await page.inputValue('#f-date') === '2026-10-28');
    ok('tax year guessed from Pakistan time zone', await page.inputValue('#t-year') === '07-01');
    ok('note is optional and hidden', !(await page.isVisible('#f-note')) && await page.isVisible('#f-note-open'));
    ok('conversion question hidden for own currency', !(await page.isVisible('#f-conv-box')));
    // errors: blank, zero, minus, words, huge, fee too big
    await page.click('#f-save');
    ok('blank name error', (await page.innerText('#f-new-err')).includes('name'));
    ok('blank amount error', (await page.innerText('#f-gross-err')).includes('Type an amount'));
    await page.fill('#f-new', 'Test'); await page.fill('#f-gross', '0'); await page.click('#f-save');
    ok('zero error', (await page.innerText('#f-gross-err')).includes('bigger than 0'));
    await page.fill('#f-gross', '-50'); await page.click('#f-save');
    ok('minus error points to refund tick', (await page.innerText('#f-gross-err')).includes('Money taken back'));
    await page.fill('#f-gross', 'abc'); await page.click('#f-save'); ok('words error', (await page.innerText('#f-gross-err')).length > 5);
    await page.fill('#f-gross', '9999999999'); await page.click('#f-save'); ok('huge error', (await page.innerText('#f-gross-err')).includes('too big'));
    await page.fill('#f-gross', '100'); await page.fill('#f-fee', '100'); await page.click('#f-save'); ok('fee as big as amount error', (await page.innerText('#f-fee-err')).includes('less than'));
    await page.fill('#f-fee', '120%'); await page.click('#f-save'); ok('fee over 100% error', (await page.innerText('#f-fee-err')).includes('less than 100%'));
    await page.fill('#f-date', '2026-11-15'); await page.fill('#f-fee', ''); await page.click('#f-save'); ok('future date error', (await page.innerText('#f-date-err')).includes('earlier'));
    await page.fill('#f-date', '2026-10-28');
    await page.selectOption('#f-cur', 'USD'); await page.click('#f-save');
    ok('foreign without bank amount error', (await page.innerText('#f-home-err')).includes('Not in my bank yet'));
    await page.check('input[name="f-conv"][value="rate"]', { force: true }); await page.fill('#f-rate', '0'); await page.click('#f-save');
    ok('rate 0 error', (await page.innerText('#f-rate-err')).includes('more than 0'));
    ok('nothing saved after errors', (await saved(page)) === null);
    ok('no console errors (errors)', !page.errors.length, page.errors.join(' | '));
    await page.context().close();

    // ---- the real situation ----
    page = await open(browser, 1280);
    await example(page);
    let s = await saved(page);
    ok('8 payments saved', s.pays.length === 8, s.pays.length);
    ok('4 clients saved', s.clients.length === 4);
    ok('Maple and Co reused, not duplicated', s.clients.filter(c => c.name === 'Maple and Co').length === 1);
    ok('client remembers currency and fee', s.clients.find(c => c.name === 'Brightline Media').cur === 'USD' && s.clients.find(c => c.name === 'Brightline Media').fee === '9');
    ok('summary shows October', (await page.innerText('#sum-h')) === 'October 2026');
    const main = await text(page.locator('.tile.main'));
    ok('Oct reached bank Rs 494,020.54', main.includes('Rs 494,020.54') && main.includes('5 payments'), main);
    const taxt = await text(page.locator('.tile.taxt'));
    ok('keep 15% aside Rs 74,103.08', taxt.includes('Keep 15% aside for tax') && taxt.includes('Rs 74,103.08'), taxt);
    const paid = await text(page.locator('.tile').nth(2));
    ok('paid by clients per currency', paid.includes('Rs 35,000 + 250 GBP + 1,700 USD') && paid.includes('93 USD (5.5%)') && paid.includes('1.85 GBP (0.7%)'), paid);
    ok('pending alert 291 USD', (await text(page.locator('#sum-body .alert'))).includes('Not in your bank yet: 291 USD (1 payment)'));
    const blocks = (await page.locator('#sum-body .block').allInnerTexts()).map(x => x.replace(/\s+/g, ' '));
    ok('average since June over 5 months 132,404.11', blocks[0].includes('Last 5 months (Jun 2026 to Oct 2026)') && blocks[0].includes('Rs 132,404.11'), blocks[0]);
    ok('Oct vs average', blocks[0].includes('October is 273% above your 5-month average'), blocks[0]);
    ok('tax year block', blocks[1].includes('Tax year 2026-27 (1 Jul 2026 to 30 Jun 2027)') && blocks[1].includes('Rs 592,020.54') && blocks[1].includes('Rs 88,803.08') && blocks[1].includes('Rs 30,000') && blocks[1].includes('Still to put aside') && blocks[1].includes('Rs 58,803.08'), blocks[1]);
    ok('best client named', blocks[1].includes('Best client: Northwind Studio, 42%'), blocks[1]);
    ok('clients best first', (await page.locator('.c-name').allInnerTexts()).join('|') === 'Northwind Studio|Brightline Media|Maple and Co|Local school');
    ok('best client tag', (await text(cbox(page, 'Northwind Studio'))).includes('Best client'));
    ok('Northwind box total', (await text(cbox(page, 'Northwind Studio'))).includes('Rs 248,768'));
    ok('Brightline pending note', (await text(cbox(page, 'Brightline Media'))).includes('1 payment not in your bank yet'));
    ok('payments list Oct 5', (await page.innerText('#pays-h')) === 'Payments in October (5)');
    ok('pending payment row explains', (await text(page.locator('.pay.is-pending'))).includes('Not in your bank yet: 291 USD after the fee'));
    ok('rate shown for typed bank amount', (await text(page.locator('.pay', { hasText: 'Brightline Media · Wed 14 Oct' }))).includes('rate 278.40'));
    ok('note shown', (await text(page.locator('.pay', { hasText: 'Northwind Studio · Fri 2 Oct' }))).includes('Upwork, website redesign'));
    // the last 12 months
    await page.click('.months summary');
    ok('12 month bars', await page.locator('.bars li').count() === 12);
    ok('June bar 70,000', (await text(page.locator('.bars li', { hasText: 'Jun 2026' }))).includes('Rs 70,000'));

    // edit the pending payment once withdrawn
    await page.click('.pay.is-pending button:has-text("Edit")');
    ok('form in edit mode', (await page.innerText('#add-h')) === 'Edit payment' && await page.isVisible('#f-cancel'));
    ok('edit form filled', await page.inputValue('#f-gross') === '300' && await page.inputValue('#f-fee') === '9' && await page.inputValue('#f-cur') === 'USD');
    await page.check('input[name="f-conv"][value="home"]', { force: true }); await page.fill('#f-home', '81,000');
    ok('edit preview rate', (await inner(page, '#f-preview')).includes('Rs 81,000') && (await inner(page, '#f-preview')).includes('278.35'), await inner(page, '#f-preview'));
    await page.click('#f-save');
    ok('edited, pending gone', !(await page.isVisible('#sum-body .alert')));
    ok('Oct now 575,020.54', (await text(page.locator('.tile.main'))).includes('Rs 575,020.54'));
    ok('edit kept 8 payments', (await saved(page)).pays.length === 8);
    // undo the edit
    await page.click('#add-msg .undo');
    ok('undo edit brings pending back', (await text(page.locator('.tile.main'))).includes('Rs 494,020.54') && await page.isVisible('#sum-body .alert'));
    // cancel editing
    await page.click('.pay.is-pending button:has-text("Edit")'); await page.click('#f-cancel');
    ok('cancel editing resets form', (await page.innerText('#add-h')) === 'Add a payment' && await page.inputValue('#f-gross') === '');

    // client defaults on picking a client
    await page.selectOption('#f-client', { label: 'Northwind Studio' });
    ok('Northwind defaults USD and 10%', await page.inputValue('#f-cur') === 'USD' && await page.inputValue('#f-fee') === '10%');
    await page.selectOption('#f-client', { label: 'Local school' });
    ok('Local school defaults own currency', await page.inputValue('#f-cur') === '' && await page.inputValue('#f-fee') === '');

    // month navigation
    await page.click('#m-prev');
    ok('September view', (await page.innerText('#sum-h')) === 'September 2026' && (await text(page.locator('.tile.main'))).includes('Rs 98,000') && (await text(page.locator('.tile.main'))).includes('1 refund taken off'));
    ok('refund row marked', (await text(page.locator('.pay.is-refund'))).includes('Money taken back'));
    ok('back to this month shown', await page.isVisible('#m-now'));
    await page.click('#m-now');
    ok('next disabled on this month', await page.isDisabled('#m-next'));

    // delete a payment with undo
    await page.locator('.pay', { hasText: 'Local school' }).locator('button:has-text("Delete")').click();
    ok('payment deleted', (await saved(page)).pays.length === 7 && (await page.innerText('#pays-h')).includes('(4)'));
    await page.click('#pays-msg .undo');
    ok('payment undo', (await saved(page)).pays.length === 8);

    // rename: duplicate refused, then rename
    await cbox(page, 'Local school').locator('button:has-text("Rename")').click();
    await page.fill('[id^="rn-"]', 'maple and co'); await page.click('.panel button:has-text("Save name")');
    ok('duplicate rename refused', (await page.innerText('.panel .err')).includes('already'));
    await page.fill('[id^="rn-"]', 'City School tuition'); await page.press('[id^="rn-"]', 'Enter');
    ok('renamed', await cbox(page, 'City School tuition').count() === 1);

    // delete client with undo
    await cbox(page, 'Maple and Co').locator('button:has-text("Delete client")').click();
    ok('client and payments deleted', (await saved(page)).pays.length === 6 && (await inner(page, '#clients-msg')).includes('Deleted Maple and Co and 2 payments'));
    await page.click('#clients-msg .undo');
    ok('client undo', (await saved(page)).pays.length === 8 && await cbox(page, 'Maple and Co').count() === 1);

    // tax settings
    await page.selectOption('#t-pct', 'custom'); await page.fill('#t-custom', '70'); await page.click('#t-custom-save');
    ok('custom over 60% refused', (await page.innerText('#t-custom-err')).includes('60%'));
    await page.fill('#t-custom', '12.5'); await page.press('#t-custom', 'Enter');
    ok('custom 12.5% used', (await text(page.locator('.tile.taxt'))).includes('Keep 12.5% aside') && (await text(page.locator('.tile.taxt'))).includes('Rs 61,752.57'));
    ok('12.5% typed matches the 12.5% preset', await page.inputValue('#t-pct') === '1250' && !(await page.isVisible('#t-custom')));
    await page.selectOption('#t-pct', 'custom'); await page.fill('#t-custom', '7.25'); await page.click('#t-custom-save');
    ok('custom 7.25% kept after save', await page.inputValue('#t-pct') === 'custom' && await page.inputValue('#t-custom') === '7.25' && (await text(page.locator('.tile.taxt'))).includes('Rs 35,816.49'));
    await page.selectOption('#t-pct', '0');
    ok('0% shows off', (await text(page.locator('.tile.taxt'))).includes('Off'));
    await page.selectOption('#t-pct', '1500');
    await page.selectOption('#t-year', '01-01');
    ok('calendar tax year', (await text(page.locator('#sum-body .block').nth(1))).includes('Tax year 2026 (1 Jan 2026 to 31 Dec 2026)'));
    await page.selectOption('#t-year', '07-01');
    await page.fill('#s-amt', '0'); await page.click('#s-add'); ok('put aside zero refused', (await page.innerText('#s-amt-err')).length > 0);
    await page.fill('#s-amt', '60,000'); await page.click('#s-add');
    ok('put aside more than needed', (await text(page.locator('#sum-body .block').nth(1))).includes('Put aside more than needed'));
    await page.locator('#s-list li', { hasText: '60,000' }).locator('button').click();
    ok('put aside removed', await page.locator('#s-list li').count() === 1);

    // copy, email and accountant list
    await page.click('#sum-body button:has-text("Copy summary")');
    const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
    ok('copied summary', clip.includes('Reached my bank: Rs 494,020.54 from 5 payments') && clip.includes('Keep 15% aside for tax: Rs 74,103.08'), clip.slice(0, 200));
    await page.click('#sum-body button:has-text("Email summary")');
    const mail = await page.evaluate(() => window.__mail || '');
    ok('email with no recipient', mail.startsWith('mailto:?subject=') && decodeURIComponent(mail).includes('Rs 494,020.54'));
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#sum-body button:has-text("Save list for accountant")')]);
    const csv = fs.readFileSync(await dl.path(), 'utf8');
    ok('CSV name and rows', dl.suggestedFilename() === 'freelance-income-2026-27.csv' && csv.split('\r\n').length === 9 && csv.includes('2026-10-02,Northwind Studio,600,USD,60,540,279.2,150768,,'), csv.split('\r\n')[3]);

    // reload keeps everything
    await page.reload();
    ok('reload keeps payments and settings', (await text(page.locator('.tile.main'))).includes('Rs 494,020.54') && await page.inputValue('#cur') === 'Rs' && await page.inputValue('#t-year') === '07-01');

    // backup and restore
    const [bk] = await Promise.all([page.waitForEvent('download'), page.click('#backup')]);
    const backupPath = path.join(require('os').tmpdir(), 'fil-backup.json'); fs.copyFileSync(await bk.path(), backupPath);
    ok('backup has app tag', JSON.parse(fs.readFileSync(backupPath, 'utf8')).app === 'freelance-income-log-with-tax-set-aside');
    await page.click('#del-all');
    ok('delete everything', (await saved(page)).pays.length === 0 && await page.isVisible('#intro'));
    ok('delete keeps settings', (await saved(page)).cur === 'Rs' && (await saved(page)).pct === 1500);
    await page.click('#tools-msg .undo');
    ok('delete everything undo', (await saved(page)).pays.length === 8);
    await page.click('#del-all');
    await page.setInputFiles('#restore-file', backupPath);
    await page.waitForTimeout(200);
    ok('restore backup', (await saved(page)).pays.length === 8 && (await inner(page, '#tools-msg')).includes('Restored 4 clients and 8 payments'));
    const badPath = path.join(require('os').tmpdir(), 'fil-bad.json'); fs.writeFileSync(badPath, '{"hello":1}');
    await page.setInputFiles('#restore-file', badPath); await page.waitForTimeout(200);
    ok('bad backup refused', (await inner(page, '#tools-msg')).includes('not a backup') && (await saved(page)).pays.length === 8);
    // currency symbol switch
    await page.selectOption('#cur', '');
    ok('plain numbers', (await text(page.locator('.tile.main'))).includes('494,020.54') && !(await text(page.locator('.tile.main'))).includes('Rs'));
    await page.selectOption('#cur', 'Rs');
    ok('no console errors (main)', !page.errors.length, page.errors.join(' | '));
    const exampleState = JSON.stringify(await saved(page));
    await page.context().close();

    // ---- own currency, pasted text, Enter key, rate preview ----
    page = await open(browser, 390, { tz: 'America/New_York' });
    ok('tax year guessed January in New York', await page.inputValue('#t-year') === '01-01');
    await page.fill('#f-new', '  Acme   Corp  '); await page.fill('#f-gross', ' $ 1,850.50 '); await page.fill('#f-fee', '2.5%');
    ok('preview own currency', (await inner(page, '#f-preview')).includes('Reaches your bank: 1,804.24'), await inner(page, '#f-preview'));
    await page.press('#f-fee', 'Enter');
    s = await saved(page);
    ok('Enter saves; name tidied; pasted amount read', s.clients[0].name === 'Acme Corp' && s.pays[0].gross === 185050 && s.pays[0].fee === 4626);
    ok('second payment keeps client selected', await page.isVisible('#f-client') && await page.inputValue('#f-client') === s.clients[0].id);
    // very long name
    await page.selectOption('#f-client', '__new');
    await page.fill('#f-new', 'A very long client name that goes on and on Ltd International'); await page.fill('#f-gross', '10'); await page.click('#f-save');
    ok('long name fits 390', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    ok('no console errors (pasted)', !page.errors.length, page.errors.join(' | '));
    await page.context().close();

    // ---- corrupt and blocked storage ----
    page = await open(browser, 390, { state: '{not json' });
    ok('corrupt state starts fresh with note', (await page.innerText('#top-msg')).includes('could not be read') && await page.isVisible('#intro'));
    await page.context().close();
    page = await open(browser, 390, { state: JSON.stringify({ clients: [{ id: 'a', name: 'X' }], pays: [{ id: 'p', client: 'a', date: '2026-10-01', cur: 'USD', gross: 'lots', fee: 0 }, { id: 'q', client: 'a', date: '2026-10-02', cur: '', gross: 1000, fee: 0 }] }) });
    ok('bad rows dropped, good kept', (await text(page.locator('.tile.main'))).includes('10') && (await page.innerText('#pays-h')).includes('(1)'));
    await page.context().close();
    page = await open(browser, 390, { block: true });
    ok('blocked storage warning', await page.isVisible('#store-warn'));
    await page.fill('#f-new', 'X'); await page.fill('#f-gross', '5'); await page.click('#f-save');
    ok('still works without storage', (await page.innerText('#pays-h')).includes('(1)'));
    await page.context().close();

    // ---- help, layout and theme at every width ----
    for (const scheme of ['dark', 'light']) {
        for (const w of [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920]) {
            for (const st of [exampleState, null]) {
                page = await open(browser, w, { scheme, state: st == null ? undefined : st });
                const tag = scheme + ' ' + w + (st ? ' filled' : ' empty');
                if (st) { await page.click('.months summary'); await page.click('.pay.is-pending button:has-text("Edit")'); await page.check('input[name="f-conv"][value="rate"]', { force: true }); await page.click('#f-note-open').catch(() => {}); await cbox(page, 'Maple and Co').locator('button:has-text("Rename")').click(); await page.selectOption('#t-pct', 'custom'); }
                ok('no horizontal scroll ' + tag, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
                const out = await page.evaluate(() => [...document.querySelectorAll('main *')].filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.right > innerWidth + 1 || r.left < -1); }).map(e => e.tagName + '#' + e.id + '.' + e.className).slice(0, 3));
                ok('nothing sticks out ' + tag, !out.length, out.join(', '));
                if (w <= 390) {
                    const clash = await page.evaluate(() => {
                        const els = [...document.querySelectorAll('main input:not([type=radio]):not([type=file]), main select, main button, .seg-o span')].filter(e => e.offsetParent && e.getBoundingClientRect().width);
                        const res = [];
                        for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
                            if (els[i].contains(els[j]) || els[j].contains(els[i])) continue;
                            const a = els[i].getBoundingClientRect(), b = els[j].getBoundingClientRect();
                            if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) res.push((els[i].id || els[i].textContent.slice(0, 15)) + ' / ' + (els[j].id || els[j].textContent.slice(0, 15)));
                        }
                        return res.slice(0, 3);
                    });
                    ok('controls do not overlap ' + tag, !clash.length, clash.join('; '));
                    const cut = await page.evaluate(() => [...document.querySelectorAll('main input[placeholder]')].filter(i => i.offsetParent).filter(i => { const c = document.createElement('canvas').getContext('2d'); const cs = getComputedStyle(i); c.font = cs.fontSize + ' ' + cs.fontFamily; return c.measureText(i.placeholder).width > i.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) + 1; }).map(i => i.id));
                    ok('placeholders fit ' + tag, !cut.length, cut.join(', '));
                }
                if (w >= 900) {
                    for (const pos of [0, 0.5, 1]) {
                        await page.evaluate(p => scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * p), pos);
                        const ov = await page.evaluate(() => { const r = []; for (const par of document.querySelectorAll('main, .col-a, .col-b')) { const k = [...par.children].filter(e => e.offsetParent && e.getBoundingClientRect().height); for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { const a = k[i].getBoundingClientRect(), b = k[j].getBoundingClientRect(); if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) r.push(k[i].className + ' / ' + k[j].className); } } return r; });
                        ok('no overlap after scroll ' + pos + ' ' + tag, !ov.length, ov.join('; '));
                    }
                    ok('two columns on desktop ' + tag, await page.evaluate(() => document.querySelector('.col-a').getBoundingClientRect().right <= document.querySelector('.col-b').getBoundingClientRect().left));
                }
                if ([320, 390, 820, 1280].includes(w) && !st) {
                    const hb = page.locator('.help-btn, button:has-text("Help")').first();
                    await hb.click();
                    const d = page.locator('dialog.help');
                    const r = await d.boundingBox();
                    ok('help opens on screen ' + tag, await d.evaluate(e => e.open) && r.x >= 0 && r.y >= 0 && r.x + r.width <= w + 1 && r.y + r.height <= (w < 600 ? 800 : 900) + 1);
                    ok('help title ' + tag, (await d.locator('h2').innerText()).includes('Freelance Income Log'));
                    await page.keyboard.press('Escape'); ok('Escape closes help ' + tag, !(await d.evaluate(e => e.open)));
                    await hb.click(); await page.click('.help-close'); ok('Got it closes help ' + tag, !(await d.evaluate(e => e.open)));
                    const tb = await page.evaluate(() => { const b = [...document.querySelectorAll('.topbar a, .topbar button')].map(e => e.getBoundingClientRect()); return b.every((x, i) => b.every((y, j) => i === j || Math.min(x.right, y.right) - Math.max(x.left, y.left) <= 1 || Math.min(x.bottom, y.bottom) - Math.max(x.top, y.top) <= 1)) && b.every(x => x.height < 60); });
                    ok('top bar buttons fine ' + tag, tb);
                }
                ok('no errors ' + tag, !page.errors.length && !page.bad.length, page.errors.concat(page.bad).join(' | '));
                await page.context().close();
            }
        }
    }
    // theme switch
    page = await open(browser, 390, { scheme: 'dark' });
    const bg1 = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await page.click('.theme-toggle');
    const bg2 = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    ok('theme switch changes the look', bg1 !== bg2 && await page.evaluate(() => document.documentElement.dataset.theme) === 'light');
    await page.context().close();

    // files the page needs
    page = await open(browser, 390);
    for (const f of ['favicon.svg', 'manifest.webmanifest', 'sw.js', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'screenshots/desktop.png', 'screenshots/phone.png', '../help.js', '../theme.js', 'core.js', 'script.js', 'style.css']) {
        const r = await page.request.get(URL + f); ok('file ' + f + ' 200', r.status() === 200, r.status());
    }
    await page.context().close();

    if (args.includes('--shots')) {
        page = await open(browser, 1280, { state: exampleState, scheme: 'dark' });
        await page.click('.months summary');
        await page.screenshot({ path: path.join(DIR, 'screenshots/desktop.png'), fullPage: true, clip: { x: 0, y: 0, width: 1280, height: 1180 } });
        await page.context().close();
        page = await open(browser, 390, { state: exampleState, scale: 2, scheme: 'dark' });
        await page.screenshot({ path: path.join(DIR, 'screenshots/phone.png'), fullPage: true, clip: { x: 0, y: 0, width: 390, height: 1100 } });
        await page.context().close();
    }
    await browser.close();
    console.log('UI CHECKS: ' + pass + ' passed, ' + fail + ' failed');
    if (fail) process.exitCode = 1;
})();
