// Drives the real page in headless Chromium. Run from the repo root:
//   node charity-and-donation-log-with-yearly-total/ui-test.js [--base http://localhost:8765] [--shots]
// --base defaults to a local server you start yourself (python3 -m http.server 8765 in the repo root).
// --shots also saves screenshots/desktop.png and screenshots/phone.png.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const args = process.argv.slice(2);
const bi = args.indexOf('--base'), BASE = (bi >= 0 ? args[bi + 1] : 'http://localhost:8765').replace(/\/$/, '');
const SLUG = 'charity-and-donation-log-with-yearly-total';
const URL = BASE + '/' + SLUG + '/';
const KEY = SLUG + '.state';
const DIR = __dirname;
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; if (!cond) console.log('FAIL ' + name + (extra ? '  ' + extra : '')); };
const NOW = new Date('2026-11-01T10:00:00');

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
const inner = async (page, sel) => (await page.innerText(sel)).replace(/ /g, ' ').replace(/[ \t]+/g, ' ');
const vis = (page, sel) => page.isVisible(sel);
async function addGift(page, o) {
    await page.fill('#f-to', o.to);
    await page.fill('#f-amt', o.amt);
    if (o.date) await page.fill('#f-date', o.date);
    if (o.kind) {
        const has = await page.$eval('#f-kind', (s, k) => [...s.options].some(x => x.value === k), o.kind);
        if (has) await page.selectOption('#f-kind', o.kind); else { await page.selectOption('#f-kind', '__own'); await page.fill('#f-kind-own', o.kind); }
    }
    if (o.how) await page.selectOption('#f-how', o.how);
    if (o.rc) await page.check('input[name="f-rc"][value="' + o.rc + '"]', { force: true });
    if (o.rep) await page.selectOption('#f-rep', o.rep);
    if (o.behalf) { await page.click('#f-behalf-open'); await page.fill('#f-behalf', o.behalf); }
    if (o.note) { await page.click('#f-note-open'); await page.fill('#f-note', o.note); }
    await page.click('#f-save');
}
const giftBox = (page, to, amt) => page.locator('.gift', { has: page.locator('.g-n', { hasText: new RegExp('^' + to + '$', 'i') }) }).filter({ hasText: amt });

(async () => {
    const browser = await chromium.launch();

    // ---------- first use ----------
    let page = await open(browser, 390);
    ok('intro on first use', await vis(page, '#intro'));
    ok('no summary on first use', !(await vis(page, '#sum')));
    ok('no due card', !(await vis(page, '#due')));
    ok('optional on behalf hidden', !(await vis(page, '#f-behalf')) && await vis(page, '#f-behalf-open'));
    ok('optional note hidden', !(await vis(page, '#f-note')) && await vis(page, '#f-note-open'));
    ok('goal is optional', !(await vis(page, '#goal')) && await vis(page, '#goal-open'));
    ok('repeat starts as once', await page.inputValue('#f-rep') === '');
    ok('receipt starts as not needed', await page.isChecked('input[name="f-rc"][value="none"]'));
    ok('date is today', await page.inputValue('#f-date') === '2026-11-01');
    ok('year guessed from Pakistan time zone', await page.inputValue('#yr') === '07-01');
    ok('currency starts as none', await page.inputValue('#cur') === '');
    ok('restore link on first use', await vis(page, '#restore-first'));
    ok('help button', await page.locator('.topbar button', { hasText: 'Help' }).count() === 1 || await page.locator('button', { hasText: /^Help$/ }).count() >= 1);

    // ---------- mistakes ----------
    await page.click('#f-save');
    ok('blank name error', (await page.textContent('#f-to-err')).includes('Type who you gave to'));
    ok('blank amount error', (await page.textContent('#f-amt-err')).includes('Type the amount'));
    ok('nothing saved on error', !(await saved(page)));
    await page.fill('#f-to', 'Test'); await page.fill('#f-amt', '-50'); await page.click('#f-save');
    ok('negative error', (await page.textContent('#f-amt-err')).includes('minus'));
    await page.fill('#f-amt', '0'); await page.click('#f-save');
    ok('zero error', (await page.textContent('#f-amt-err')).includes('bigger than 0'));
    await page.fill('#f-amt', '12abc'); await page.click('#f-save');
    ok('letters error', (await page.textContent('#f-amt-err')).includes('Type an amount'));
    await page.fill('#f-amt', '999999999999'); await page.click('#f-save');
    ok('huge error', (await page.textContent('#f-amt-err')).includes('too big'));
    await page.fill('#f-amt', '100'); await page.fill('#f-date', '2026-11-05'); await page.click('#f-save');
    ok('future one-off gift refused', (await page.textContent('#f-date-err')).includes('in the future'));
    await page.selectOption('#f-kind', '__own'); await page.fill('#f-date', '2026-11-01'); await page.click('#f-save');
    ok('own kind must be typed', (await page.textContent('#f-kind-own-err')).includes('Type the kind'));
    ok('still nothing saved', !(await saved(page)));
    await page.click('#f-cancel').catch(() => {});
    await page.reload();

    // ---------- settings ----------
    await page.selectOption('#cur', 'Rs');
    await page.click('#goal-open');
    await page.fill('#goal', 'abc'); await page.click('#goal-save');
    ok('bad goal error', (await page.textContent('#goal-err')).length > 0);
    await page.fill('#goal', '2,00,000'); await page.click('#goal-save');
    ok('goal saved', (await saved(page)).goal === 20000000);
    ok('goal text', (await inner(page, '#goal-now')).includes('Rs 200,000 each year'));

    // ---------- Ayesha's year through the page ----------
    await addGift(page, { to: 'Edhi Foundation', amt: '5,000', date: '2026-07-01', kind: 'Sadqa', how: 'bank', rc: 'kept', rep: 'month' });
    ok('regular gift added message', (await inner(page, '#add-msg')).includes('Next: Sat 1 Aug'), await inner(page, '#add-msg'));
    ok('due card shows', await vis(page, '#due'));
    ok('4 regular gifts due', (await inner(page, '#due-h')) === '4 regular gifts due', await inner(page, '#due-h'));
    ok('due says 3 more', (await inner(page, '#due-list')).includes('3 more are due after this'));
    ok('mark all button', (await inner(page, '#due-all')) === 'Mark all 4 as given');
    for (let i = 0; i < 3; i++) await page.locator('#due-list button', { hasText: 'Given' }).first().click();
    ok('one due left', (await inner(page, '#due-h')) === 'Regular gift due' && (await inner(page, '#due-list')).includes('due Sun 1 Nov'));
    ok('mark all hidden for one', !(await vis(page, '#due-all')));
    ok('plan listed', (await inner(page, '#plan-list')).includes('Every month on the 1st') && (await inner(page, '#plan-list')).includes('Due now: Sun 1 Nov'));
    // a name used before fills its usual kind, payment and receipt
    await page.fill('#f-to', 'edhi foundation');
    ok('defaults from last gift', await page.inputValue('#f-kind') === 'Sadqa' && await page.inputValue('#f-how') === 'bank' && await page.isChecked('input[name="f-rc"][value="kept"]'));
    ok('last amount as placeholder, not forced', await page.getAttribute('#f-amt', 'placeholder') === 'last time 5,000' && await page.inputValue('#f-amt') === '');
    await page.fill('#f-to', '');
    await addGift(page, { to: 'Ration drive at the office', amt: '8000', date: '2026-07-03', kind: 'Help to someone in need', how: 'goods', rc: 'none' });
    await addGift(page, { to: 'Masjid Al-Noor', amt: '10000', date: '2026-08-07', kind: 'General donation', how: 'bank', rc: 'todo', note: 'Building fund' });
    await addGift(page, { to: "Neighbour's family", amt: '25000', date: '2026-08-20', kind: 'Zakat', how: 'cash', rc: 'none' });
    await addGift(page, { to: 'Shaukat Khanum Hospital', amt: '50,000', date: '2026-09-12', kind: 'Zakat', how: 'cheque', rc: 'kept', note: 'Receipt no. 4471' });
    await addGift(page, { to: 'The Citizens Foundation', amt: '15000', date: '2026-09-28', kind: 'General donation', how: 'online', rc: 'todo' });
    await addGift(page, { to: 'Al-Khidmat Foundation', amt: '10000', date: '2026-10-05', kind: 'Zakat', how: 'bank', rc: 'todo', behalf: 'Ammi' });
    await addGift(page, { to: 'masjid al-noor', amt: '2500', date: '2026-10-16', kind: 'Sadqa', how: 'cash', rc: 'none' });
    await addGift(page, { to: 'Masjid Al-Noor', amt: '2400', date: '2026-03-19', kind: 'Fitrana', how: 'cash', rc: 'none' });
    ok('old gift moves view to its year', (await inner(page, '#sum-h')) === 'Year 2025-26');
    await page.click('#y-next');
    await page.fill('#pl-to', 'Masjid Al-Noor'); await page.fill('#pl-amt', '30000'); await page.fill('#pl-from', '2026-08-01'); await page.click('#pl-add');
    ok('promise added', (await inner(page, '#pl-msg')).includes('Added your promise of Rs 30,000'));

    const sum = await inner(page, '#sum');
    ok('year heading', (await inner(page, '#sum-h')) === 'Year 2026-27');
    ok('range', (await inner(page, '#y-range')) === '1 Jul 2026 to 30 Jun 2027 · this year');
    ok('total Rs 140,500', /Given this year\s+Rs 140,500/.test(sum), sum.slice(0, 200));
    ok('11 gifts to 7 causes', sum.includes('11 gifts to 7 causes'));
    ok('goal left', sum.includes('Rs 59,500 still to give'));
    ok('goal per month', sum.includes('70% of Rs 200,000 given. About Rs 7,437.50 a month for the 8 months left (Nov to Jun).'), sum);
    ok('own giving', sum.includes('Your own giving\tRs 130,500') || sum.includes('Your own giving\nRs 130,500') || /Your own giving\s+Rs 130,500/.test(sum));
    ok('on behalf of Ammi', /On behalf of Ammi\s+Rs 10,000/.test(sum));
    ok('receipts kept', /Receipt kept: 5 gifts\s+Rs 70,000/.test(sum));
    ok('receipts to get', /Receipt still to get: 3 gifts\s+Rs 35,000/.test(sum));
    ok('no receipt needed', /No receipt needed: 3 gifts\s+Rs 35,500/.test(sum));
    ok('ask for these', sum.includes('Masjid Al-Noor: Rs 10,000 on 7 Aug') && sum.includes('The Citizens Foundation: Rs 15,000 on 28 Sep') && sum.includes('Al-Khidmat Foundation: Rs 10,000 on 5 Oct'));
    ok('by kind zakat', /Zakat\s+Rs 85,000/.test(sum) && /Sadqa\s+Rs 22,500/.test(sum) && /General donation\s+Rs 25,000/.test(sum));
    ok('by cause top', /Shaukat Khanum Hospital\s+Rs 50,000/.test(sum) && /Edhi Foundation \(4 gifts\)\s+Rs 20,000/.test(sum));
    ok('masjid merged across spellings', /masjid al-noor \(2 gifts\)\s+Rs 12,500/i.test(sum));
    ok('how paid', /Goods or food\s+Rs 8,000/.test(sum));
    const pl = await inner(page, '#pl-list');
    ok('promise left', pl.includes('Rs 17,500 left') && pl.includes('Paid Rs 12,500 in 2 gifts, last on 16 Oct'), pl);
    ok('gifts heading', (await inner(page, '#gifts-h')) === 'Gifts in 2026-27 (11)');
    ok('behalf tag', (await inner(page, '#g-list')).includes('On behalf of Ammi'));
    ok('regular tag', (await giftBox(page, 'Edhi Foundation', 'Sat 1 Aug').innerText()).includes('Regular gift'));
    ok('find box shows with many gifts', await vis(page, '#find'));
    ok('no errors so far', !page.errors.length, page.errors.join(' | '));
    const STATE = JSON.stringify(await saved(page));
    fs.writeFileSync(path.join(DIR, '..', '.ui-state.json'), STATE);

    // ---------- reload keeps everything ----------
    await page.reload();
    ok('reload keeps total', (await inner(page, '#sum')).includes('Rs 140,500'));
    ok('reload keeps due', (await inner(page, '#due-h')) === 'Regular gift due');

    // ---------- receipts, edit, delete, undo ----------
    await giftBox(page, 'The Citizens Foundation', 'Rs 15,000').locator('button', { hasText: 'Got the receipt' }).click();
    ok('receipt kept now', /Receipt still to get: 2 gifts\s+Rs 20,000/.test(await inner(page, '#sum')));
    await page.click('#gifts-msg .undo');
    ok('undo receipt', /Receipt still to get: 3 gifts\s+Rs 35,000/.test(await inner(page, '#sum')));
    await giftBox(page, 'Shaukat Khanum Hospital', 'Rs 50,000').locator('button', { hasText: 'Edit' }).click();
    ok('edit fills form', await page.inputValue('#f-amt') === '50000' && await page.inputValue('#f-date') === '2026-09-12' && await page.inputValue('#f-note') === 'Receipt no. 4471');
    ok('edit hides repeat', !(await vis(page, '#f-rep')));
    ok('edit button label', (await inner(page, '#f-save')) === 'Save changes');
    await page.fill('#f-amt', '55000'); await page.click('#f-save');
    ok('edit changes total', (await inner(page, '#sum')).includes('Rs 145,500'));
    ok('edit ends', (await inner(page, '#f-save')) === 'Add gift' && await page.inputValue('#f-to') === '');
    await page.click('#add-msg .undo');
    ok('undo edit', (await inner(page, '#sum')).includes('Rs 140,500'));
    await giftBox(page, 'Ration drive at the office', 'Rs 8,000').locator('button', { hasText: 'Delete' }).click();
    ok('delete', (await inner(page, '#sum')).includes('Rs 132,500') && (await inner(page, '#gifts-h')) === 'Gifts in 2026-27 (10)');
    await page.click('#gifts-msg .undo');
    ok('undo delete', (await inner(page, '#sum')).includes('Rs 140,500'));
    await giftBox(page, 'Edhi Foundation', 'Sat 1 Aug').locator('button', { hasText: 'Edit' }).click();
    await page.click('#f-cancel');
    ok('cancel editing', (await inner(page, '#f-save')) === 'Add gift' && await page.inputValue('#f-amt') === '');

    // ---------- regular gift: skip, given, change amount, stop ----------
    await page.locator('#due-list button', { hasText: 'Skip' }).click();
    ok('skip adds nothing', !(await vis(page, '#due')) && (await inner(page, '#sum')).includes('Rs 140,500') && (await inner(page, '#plan-list')).includes('Next: Tue 1 Dec'));
    await page.click('#top-msg .undo');
    ok('undo skip', await vis(page, '#due'));
    await page.locator('#due-list button', { hasText: 'Given' }).click();
    ok('given adds 5,000', (await inner(page, '#sum')).includes('Rs 145,500'));
    await page.click('#top-msg .undo');
    await page.locator('#plan-list button', { hasText: 'Change amount' }).click();
    await page.fill('#plan-list input', '0'); await page.locator('#plan-list button', { hasText: 'Save amount' }).click();
    ok('plan amount zero refused', (await page.locator('#plan-list .err').innerText()).includes('bigger than 0'));
    await page.fill('#plan-list input', '6000'); await page.locator('#plan-list button', { hasText: 'Save amount' }).click();
    ok('plan amount changed for future only', (await inner(page, '#due-list')).includes('Rs 6,000') && (await inner(page, '#sum')).includes('Rs 140,500'));
    await page.locator('#plan-list button', { hasText: 'Stop' }).click();
    ok('stop hides plan and due', !(await vis(page, '#plans')) && !(await vis(page, '#due')) && (await inner(page, '#sum')).includes('Rs 140,500'));
    ok('stop message on top when card hides', (await inner(page, '#top-msg')).includes('Stopped the regular gift'));
    await page.click('#top-msg .undo');
    ok('undo stop', await vis(page, '#plans'));

    // ---------- years, find, copy, email, csv ----------
    await page.click('#y-prev');
    ok('previous year', (await inner(page, '#sum-h')) === 'Year 2025-26' && (await inner(page, '#sum')).includes('Rs 2,400') && await vis(page, '#y-now'));
    ok('goal short last year', (await inner(page, '#sum')).includes('Short by Rs 197,600'));
    ok('gifts follow the year', (await inner(page, '#gifts-h')) === 'Gifts in 2025-26 (1)');
    await page.click('#y-now');
    ok('back to this year', (await inner(page, '#sum-h')) === 'Year 2026-27' && await page.isDisabled('#y-next'));
    await page.fill('#find', 'MASJID');
    ok('find', (await page.locator('#g-list .gift').count()) === 2);
    await page.fill('#find', 'building');
    ok('find by note', (await page.locator('#g-list .gift').count()) === 1);
    await page.fill('#find', 'zzz');
    ok('find nothing', (await inner(page, '#g-list')).includes('No gift in 2026-27 matches "zzz".'));
    await page.fill('#find', '');
    await page.locator('#sum button', { hasText: 'Copy summary' }).click();
    const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
    ok('copy summary', clip.startsWith('My giving for 2026-27') && clip.includes('Given: Rs 140,500 in 11 gifts to 7 causes'), clip.slice(0, 80));
    await page.locator('#sum button', { hasText: 'Email summary' }).click();
    const mail = decodeURIComponent(await page.evaluate(() => window.__mail || ''));
    ok('email with no address', mail.startsWith('mailto:?subject=My giving for 2026-27') && mail.includes('Rs 140,500'));
    const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#sum button', { hasText: 'Save list for tax form' }).click()]);
    const csv = fs.readFileSync(await dl.path(), 'utf8').replace(/^﻿/, '').split('\r\n');
    ok('csv name', dl.suggestedFilename() === 'giving-2026-27.csv');
    ok('csv rows', csv[0] === 'Date,Given to,Amount (Rs),Kind,How paid,Receipt,On behalf of,Note' && csv.length === 13 && csv.includes('2026-10-05,Al-Khidmat Foundation,10000,Zakat,Bank transfer,Receipt still to get,Ammi,'), csv.join('|'));

    // ---------- backup and restore ----------
    const [bk] = await Promise.all([page.waitForEvent('download'), page.click('#backup')]);
    const bkPath = path.join(DIR, '..', '.ui-backup.json'); await bk.saveAs(bkPath);
    const junkPath = path.join(DIR, '..', '.ui-junk.json'); fs.writeFileSync(junkPath, '{"hello":1}');
    let p2 = await open(browser, 390);
    await p2.setInputFiles('#restore-file', junkPath);
    await p2.waitForTimeout(200);
    ok('junk restore refused', (await inner(p2, '#add-msg')).includes('not a backup'));
    await p2.setInputFiles('#restore-file', bkPath);
    await p2.waitForTimeout(300);
    ok('restore', (await inner(p2, '#sum')).includes('Rs 140,500') && (await inner(p2, '#tools-msg')).includes('Restored 12 gifts, 1 regular gift and 1 promise'), await inner(p2, '#tools-msg'));
    await p2.click('#del-all');
    ok('delete everything', await vis(p2, '#intro') && !(await vis(p2, '#sum')) && (await inner(p2, '#tools-msg')).includes('Deleted everything'));
    ok('delete keeps currency', await p2.inputValue('#cur') === 'Rs');
    await p2.click('#tools-msg .undo');
    ok('undo delete everything', (await inner(p2, '#sum')).includes('Rs 140,500'));
    await p2.context().close();

    // ---------- more situations ----------
    await page.selectOption('#cur', '');
    ok('plain numbers', /Given this year\s+140,500/.test(await inner(page, '#sum')));
    await page.selectOption('#yr', '01-01');
    ok('calendar year', (await inner(page, '#sum-h')) === 'Year 2026' && (await inner(page, '#sum')).includes('142,900'));
    await page.selectOption('#yr', '07-01');
    await addGift(page, { to: 'Qurbani at the madrassa', amt: '12,500.50', kind: 'Qurbani share', how: 'cash' });
    ok('own kind + decimals', /Qurbani share\s+12,500.50/.test(await inner(page, '#sum')));
    ok('own kind offered next time', await page.$eval('#f-kind', s => [...s.options].some(o => o.value === 'Qurbani share')));
    await addGift(page, { to: 'St Mary\'s Church', amt: '1000', date: '2026-12-06', kind: 'Tithe or church offering', rep: 'week' });
    ok('future regular gift adds nothing', (await inner(page, '#add-msg')).includes('Set up a regular gift of 1,000') && (await inner(page, '#plan-list')).includes('Next: Sun 6 Dec'));
    const long = 'A'.repeat(30) + ' ' + 'Very long foundation name'.slice(0, 29);
    await addGift(page, { to: long + 'xxxxxxxxxx', amt: '1', kind: 'General donation' });
    ok('long name cut to 60', (await saved(page)).gifts.some(g => g.to.length === 60));
    await page.fill('#f-to', '<img src=x onerror=alert(1)>'); await page.fill('#f-amt', '1'); await page.click('#f-save');
    ok('names shown as text', (await page.locator('#g-list img').count()) === 0 && (await inner(page, '#g-list')).includes('<img src=x'));
    await page.fill('#f-to', 'Pasted name'); await page.fill('#f-amt', '  Rs 1,250  '); await page.keyboard.press('Enter');
    ok('enter key saves, pasted amount', (await inner(page, '#add-msg')).includes('Added 1,250 to Pasted name'));
    ok('no errors in main run', !page.errors.length && !page.bad.length, page.errors.concat(page.bad).join(' | '));
    await page.context().close();

    // a second regular gift due + mark all
    const s2 = JSON.parse(STATE); s2.plans[0].n = 2;
    page = await open(browser, 390, { state: JSON.stringify(s2) });
    ok('3 due after missing two', (await inner(page, '#due-h')) === '3 regular gifts due');
    await page.click('#due-all');
    ok('mark all', (await inner(page, '#top-msg')).includes('Added 3 regular gifts, Rs 15,000 in all') && !(await vis(page, '#due')));
    ok('mark all total (adds Sep, Oct and Nov again on top of the logged ones)', (await inner(page, '#sum')).includes('Rs 155,500'));
    await page.click('#top-msg .undo');
    ok('undo mark all', (await inner(page, '#due-h')) === '3 regular gifts due');
    await page.context().close();

    // the next day: the new day is used
    page = await open(browser, 390, { state: STATE, now: new Date('2026-11-02T09:00:00') });
    ok('next day date', await page.inputValue('#f-date') === '2026-11-02');
    ok('next day still due', (await inner(page, '#due-list')).includes('due Sun 1 Nov'));
    await page.context().close();
    // a new year
    page = await open(browser, 390, { state: STATE, now: new Date('2027-07-02T09:00:00') });
    ok('new year starts at 0', (await inner(page, '#sum-h')) === 'Year 2027-28' && /Given this year\s+Rs 0/.test(await inner(page, '#sum')) && (await inner(page, '#sum')).includes('No gifts added for this year.'));
    await page.context().close();

    // corrupt and blocked storage
    page = await open(browser, 390, { state: '{not json' });
    ok('corrupt state starts fresh', (await inner(page, '#top-msg')).includes('could not be read') && await vis(page, '#intro'));
    ok('corrupt no errors', !page.errors.length, page.errors.join(' | '));
    await page.context().close();
    page = await open(browser, 390, { block: true });
    ok('blocked storage warning', await vis(page, '#store-warn'));
    await addGift(page, { to: 'Edhi', amt: '100' });
    ok('blocked storage still works', (await inner(page, '#sum')).includes('100'));
    await page.context().close();
    // other countries
    page = await open(browser, 390, { tz: 'Europe/London' });
    ok('UK year', await page.inputValue('#yr') === '04-06');
    await page.context().close();
    page = await open(browser, 390, { tz: 'America/New_York' });
    ok('US year', await page.inputValue('#yr') === '01-01');
    await page.context().close();

    // ---------- every width, dark and light, filled and empty ----------
    const WIDTHS = [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920];
    for (const scheme of ['dark', 'light']) {
        for (const w of WIDTHS) {
            for (const st of [STATE, null]) {
                page = await open(browser, w, { scheme, state: st == null ? undefined : st });
                if (w <= 390) { await page.click('#f-behalf-open'); await page.click('#f-note-open'); await page.selectOption('#f-kind', '__own'); await page.selectOption('#f-rep', 'month'); if (st) await page.click('#goal-open'); }
                const r = await page.evaluate(() => {
                    const de = document.documentElement, bad = [];
                    if (de.scrollWidth > de.clientWidth + 1) bad.push('h-scroll ' + de.scrollWidth);
                    document.querySelectorAll('main *').forEach(e => { const b = e.getBoundingClientRect(); if (b.width && (b.right > de.clientWidth + 1 || b.left < -1) && !e.closest('[hidden]') && getComputedStyle(e).position !== 'absolute') bad.push('sticks out ' + (e.id || e.className || e.tagName)); });
                    // controls must not overlap
                    const ctl = [...document.querySelectorAll('main input:not([type=radio]):not([type=file]), main select, main button, main .seg-o span')].filter(e => e.offsetParent && e.getBoundingClientRect().width).map(e => [e, e.getBoundingClientRect()]);
                    for (let i = 0; i < ctl.length; i++) for (let j = i + 1; j < ctl.length; j++) {
                        const a = ctl[i][1], b = ctl[j][1];
                        if (ctl[i][0].contains(ctl[j][0]) || ctl[j][0].contains(ctl[i][0])) continue;
                        if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) bad.push('overlap ' + (ctl[i][0].id || ctl[i][0].textContent.slice(0, 20)) + ' / ' + (ctl[j][0].id || ctl[j][0].textContent.slice(0, 20)));
                    }
                    // placeholders fit their boxes
                    const cv = document.createElement('canvas').getContext('2d');
                    document.querySelectorAll('main input[placeholder]').forEach(e => {
                        if (!e.offsetParent) return; const cs = getComputedStyle(e); cv.font = cs.fontSize + ' ' + cs.fontFamily;
                        const room = e.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
                        if (cv.measureText(e.placeholder).width > room + 1) bad.push('placeholder cut ' + e.id);
                    });
                    return bad.slice(0, 6);
                });
                ok(scheme + ' ' + w + (st ? ' filled' : ' empty') + ' layout', !r.length, r.join(', '));
                if (w >= 900 && st) {
                    for (const pos of ['top', 'middle', 'bottom']) {
                        await page.evaluate(p => window.scrollTo(0, p === 'top' ? 0 : p === 'middle' ? document.body.scrollHeight / 2 : document.body.scrollHeight), pos);
                        const o = await page.evaluate(() => {
                            const out = [];
                            const sib = [...document.querySelectorAll('main > *, .col-a > *, .col-b > *')].filter(e => e.offsetParent && getComputedStyle(e).display !== 'contents');
                            const groups = new Map(); sib.forEach(e => { const k = e.parentElement; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(e); });
                            groups.forEach(list => { for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) { const a = list[i].getBoundingClientRect(), b = list[j].getBoundingClientRect(); if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) out.push((list[i].id || list[i].className) + ' / ' + (list[j].id || list[j].className)); } });
                            return out;
                        });
                        ok(scheme + ' ' + w + ' scroll ' + pos + ' no overlap', !o.length, o.join(', '));
                    }
                    if (w === 1280) {
                        const cols = await page.evaluate(() => [document.querySelector('.col-a').getBoundingClientRect(), document.querySelector('.col-b').getBoundingClientRect(), document.querySelector('.app').getBoundingClientRect().width]);
                        ok('desktop two columns side by side', cols[1].left > cols[0].right && cols[2] > 1000, JSON.stringify(cols));
                    }
                }
                ok(scheme + ' ' + w + ' no errors', !page.errors.length && !page.bad.length, page.errors.concat(page.bad).join(' | '));
                await page.context().close();
            }
        }
    }

    // ---------- help and theme ----------
    for (const w of [320, 390, 820, 1280]) {
        page = await open(browser, w, { state: STATE });
        const help = page.locator('button', { hasText: /^Help$/ }).first();
        await help.click();
        const dlg = page.locator('dialog[open], [role=dialog]').first();
        await dlg.waitFor({ state: 'visible' });
        const box = await dlg.boundingBox();
        ok('help ' + w + ' inside screen', box && box.x >= 0 && box.y >= 0 && box.x + box.width <= w + 1, JSON.stringify(box));
        ok('help ' + w + ' title', (await dlg.innerText()).includes('How to use the Charity and Donation Log'));
        await page.keyboard.press('Escape');
        ok('help ' + w + ' escape closes', !(await dlg.isVisible()));
        await help.click(); await page.locator('button', { hasText: 'Got it' }).click();
        ok('help ' + w + ' got it closes', !(await page.locator('dialog[open], [role=dialog]').first().isVisible()));
        const tb = await page.evaluate(() => { const els = [...document.querySelectorAll('.topbar > *, .topbar button, .topbar a')].filter(e => e.offsetParent).map(e => e.getBoundingClientRect()); let bad = 0; for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) { const a = els[i], b = els[j]; if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1 && !(a.left <= b.left && a.right >= b.right && a.top <= b.top && a.bottom >= b.bottom) && !(b.left <= a.left && b.right >= a.right && b.top <= a.top && b.bottom >= a.bottom)) bad++; } const h = document.querySelector('.topbar') ? document.querySelector('.topbar').getBoundingClientRect().height : 0; return { bad, h }; });
        ok('top bar ' + w + ' no overlap', !tb.bad && tb.h < 110, JSON.stringify(tb));
        if (w === 390) {
            const before = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
            await page.locator('.theme-toggle').first().click();
            const after = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
            ok('theme switch changes look', after && after !== before, before + ' -> ' + after);
            const bg = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim());
            ok('light colours used', bg === '#fff5f8', bg);
        }
        await page.context().close();
    }

    // ---------- screenshots ----------
    if (args.includes('--shots')) {
        page = await open(browser, 1280, { state: STATE });
        await page.setViewportSize({ width: 1280, height: 1500 });
        await page.screenshot({ path: path.join(DIR, 'screenshots', 'desktop.png') });
        await page.context().close();
        page = await open(browser, 390, { state: STATE, scale: 2 });
        await page.evaluate(() => document.getElementById('due').scrollIntoView());
        await page.evaluate(() => window.scrollBy(0, -12));
        await page.screenshot({ path: path.join(DIR, 'screenshots', 'phone.png') });
        await page.context().close();
    }
    [path.join(DIR, '..', '.ui-state.json'), path.join(DIR, '..', '.ui-backup.json'), path.join(DIR, '..', '.ui-junk.json')].forEach(f => { try { fs.unlinkSync(f); } catch (e) { /* gone */ } });
    await browser.close();
    console.log(pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})();
