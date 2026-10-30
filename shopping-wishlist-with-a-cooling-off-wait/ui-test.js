// Drives the real page in headless Chromium. Run from the repo root:
//   node shopping-wishlist-with-a-cooling-off-wait/ui-test.js [--base http://localhost:8765] [--shots] [--live]
// --base defaults to a local server you start yourself (python3 -m http.server 8765 in the repo root).
// --shots also saves screenshots/desktop.png and screenshots/phone.png. --live skips the screenshots and file-download checks' strictness for the live site.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const args = process.argv.slice(2);
const bi = args.indexOf('--base'), BASE = (bi >= 0 ? args[bi + 1] : 'http://localhost:8765').replace(/\/$/, '');
const URL = BASE + '/shopping-wishlist-with-a-cooling-off-wait/';
const KEY = 'shopping-wishlist-with-a-cooling-off-wait.state';
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
const clean = s => s.replace(/\s+/g, ' ').trim();

// realistic state: Ayesha on Fri 30 Oct 2026
const I = (id, name, x) => Object.assign({ id, name, prices: [], where: '', link: '', why: '', added: '2026-10-30', wait: 7, ends: '2026-11-06', needBy: null, st: 'wait', dd: null, paid: null, early: false }, x || {});
const SEED = { v: 1, cur: '', limit: 3000000, items: [
    I('i1', 'Air fryer, 5 litre', { prices: [{ d: '2026-10-23', c: 1850000 }, { d: '2026-10-28', c: 1690000 }], where: 'Daraz', link: 'https://www.daraz.pk/products/air-fryer', why: 'Saw it in an Instagram reel', added: '2026-10-23', ends: '2026-10-30' }),
    I('i2', 'Wireless headphones', { prices: [{ d: '2026-10-20', c: 1299900 }], where: 'Mall of Lahore', added: '2026-10-20', wait: 30, ends: '2026-11-19', why: 'The old ones crackle' }),
    I('i3', 'Running shoes', { prices: [{ d: '2026-10-28', c: 1450000 }], added: '2026-10-28', wait: 7, ends: '2026-11-04' }),
    I('i4', 'Smart watch', { prices: [{ d: '2026-09-01', c: 2500000 }], added: '2026-09-01', wait: 30, ends: '2026-10-01', st: 'skipped', dd: '2026-10-02' }),
    I('i5', 'Designer sunglasses', { prices: [{ d: '2026-08-10', c: 1200000 }], added: '2026-08-10', wait: 7, ends: '2026-08-17', st: 'skipped', dd: '2026-08-18' }),
    I('i6', 'Second phone case', { prices: [{ d: '2026-10-01', c: 270000 }], added: '2026-10-01', wait: 2, ends: '2026-10-03', st: 'skipped', dd: '2026-10-03' }),
    I('i7', 'Electric kettle', { prices: [{ d: '2026-10-01', c: 800000 }, { d: '2026-10-05', c: 650000 }], added: '2026-10-01', ends: '2026-10-08', st: 'bought', dd: '2026-10-09', paid: 650000 })] };

async function addItem(page, o) {
    await page.fill('#a-name', o.name);
    if (o.price != null) await page.fill('#a-price', o.price);
    if (o.wait) await page.click('#a-waits .chip[data-days="' + o.wait + '"]');
    if (o.days) await page.fill('#a-days', o.days);
    if (o.where || o.link || o.why) {
        if (await page.isVisible('#a-more-open')) await page.click('#a-more-open');
        if (o.where) await page.fill('#a-where', o.where);
        if (o.link) await page.fill('#a-link', o.link);
        if (o.why) await page.fill('#a-why', o.why);
    }
    if (o.need) { if (await page.isVisible('#a-need-open')) await page.click('#a-need-open'); await page.fill('#a-needby', o.need); }
    await page.click('#a-save');
}

async function overlapCheck(page, label) {
    const r = await page.evaluate(() => {
        const out = [], vis = e => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' ? r : null; };
        const ctrls = [...document.querySelectorAll('input:not([type=file]):not([hidden]), select, button, a.secondary, a.back')].map(e => [e, vis(e)]).filter(x => x[1]);
        for (let i = 0; i < ctrls.length; i++) for (let j = i + 1; j < ctrls.length; j++) {
            const a = ctrls[i][1], b = ctrls[j][1];
            if (ctrls[i][0].contains(ctrls[j][0]) || ctrls[j][0].contains(ctrls[i][0])) continue;
            if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) out.push((ctrls[i][0].id || ctrls[i][0].textContent.trim().slice(0, 20)) + ' x ' + (ctrls[j][0].id || ctrls[j][0].textContent.trim().slice(0, 20)));
        }
        const sw = document.documentElement.scrollWidth > window.innerWidth + 1;
        const ph = [...document.querySelectorAll('input[placeholder]')].filter(i => vis(i) && i.scrollWidth > i.clientWidth + 1 && !i.value).map(i => i.id);
        return { out, sw, ph };
    });
    ok(label + ': no overlapping controls', !r.out.length, r.out.slice(0, 4).join(', '));
    ok(label + ': no horizontal scroll', !r.sw);
    return r;
}

(async () => {
    const browser = await chromium.launch();

    // ---------- first use: the real situation, through the UI ----------
    {
        const page = await open(browser, 390);
        ok('first use: intro shown, totals hidden', await page.isVisible('#intro') && !(await page.isVisible('#sum')));
        ok('1 week picked by default', await page.getAttribute('#a-waits .chip[data-days="7"]', 'aria-pressed') === 'true');
        ok('ends preview', (await text(page, '#a-ends')) === 'Wait ends Fri 6 Nov (in 7 days)', await text(page, '#a-ends'));
        ok('optional fields hidden', !(await page.isVisible('#a-where')) && !(await page.isVisible('#a-needby')));
        await page.click('#a-save');
        ok('blank name refused', (await text(page, '#a-name-err')).startsWith('Type what you want to buy'));
        // only name and price: optional inputs never forced
        await addItem(page, { name: 'Air fryer', price: '18,500' });
        ok('added message', (await text(page, '#add-msg')).startsWith('Added Air fryer. Wait ends Fri 6 Nov (in 7 days).'), await text(page, '#add-msg'));
        ok('waiting card', clean(await card(page, 'Air fryer').innerText()).includes('18,500') && clean(await card(page, 'Air fryer').innerText()).includes('Wait ends Fri 6 Nov (in 7 days)'));
        ok('form cleared', await page.inputValue('#a-name') === '' && await page.inputValue('#a-price') === '');
        let s = await saved(page);
        ok('saved exact cents and dates', s.items[0].prices[0].c === 1850000 && s.items[0].ends === '2026-11-06' && s.items[0].wait === 7);
        ok('totals: on your wishlist', (await text(page, '#sum-list')).includes('On your wishlist 1 item, 18,500'));
        ok('totals: not spent 0', (await text(page, '#sum-big')) === '0');
        // undo the add
        await page.click('#add-msg .undo');
        ok('undo add', (await saved(page)).items.length === 0 && await page.isVisible('#intro'));
        // no price, custom wait, need-by date shorter, link and why
        await page.fill('#a-name', 'Air fryer');
        await page.click('#a-waits .chip[data-days="custom"]');
        ok('custom days box', await page.isVisible('#a-days'));
        await page.fill('#a-days', '0'); await page.click('#a-save');
        ok('0 days refused', (await text(page, '#a-days-err')) === 'Wait at least 1 day.');
        await page.fill('#a-days', '400'); await page.click('#a-save');
        ok('400 days refused', (await text(page, '#a-days-err')) === 'Wait at most 365 days.');
        await page.fill('#a-days', '14');
        ok('custom preview', (await text(page, '#a-ends')) === 'Wait ends Fri 13 Nov (in 14 days)');
        await page.fill('#a-price', '-5'); await page.click('#a-save');
        ok('minus price refused', (await text(page, '#a-price-err')).length > 0);
        await page.fill('#a-price', '0'); await page.click('#a-save');
        ok('0 price refused', (await text(page, '#a-price-err')) === 'Type an amount bigger than 0, or leave it blank.');
        await page.fill('#a-price', '');
        await page.click('#a-more-open');
        await page.fill('#a-link', 'javascript:alert(1)'); await page.click('#a-save');
        ok('bad link refused', (await text(page, '#a-link-err')).startsWith('That does not look like a web link'));
        await page.fill('#a-link', 'daraz.pk/products/x'); await page.fill('#a-why', 'The old one broke');
        await page.click('#a-need-open'); await page.fill('#a-needby', '2026-10-01'); await page.click('#a-save');
        ok('need-by in the past refused', (await text(page, '#a-needby-err')) === 'Pick today or a later day.');
        await page.fill('#a-needby', '2026-11-03');
        ok('need-by preview', (await text(page, '#a-ends')) === 'Wait ends Tue 3 Nov (in 4 days), the day you need it');
        await page.click('#a-save');
        s = await saved(page);
        ok('custom + need-by saved', s.items[0].ends === '2026-11-03' && s.items[0].wait === 14 && s.items[0].prices.length === 0 && s.items[0].link === 'https://daraz.pk/products/x');
        const c = clean(await card(page, 'Air fryer').innerText());
        ok('no price shown plainly', c.includes('No price yet') && c.includes('Why: The old one broke') && c.includes('Open the shop page (daraz.pk)') && c.includes('the day you need it'), c);
        ok('totals: no price note', (await text(page, '#sum-list')).includes('(1 with no price)'));
        // duplicate warning
        await page.fill('#a-name', 'air FRYER');
        ok('same item warning', (await text(page, '#a-rep')).startsWith('Already on your list: Air fryer'));
        await page.fill('#a-name', '');
        ok('warning hides', !(await page.isVisible('#a-rep')));
        // custom remembered for next time
        await page.reload();
        ok('reload keeps list and picked wait', (await saved(page)).items.length === 1 && await page.getAttribute('#a-waits .chip[data-days="custom"]', 'aria-pressed') === 'true');
        // very long pasted name
        await page.click('#a-waits .chip[data-days="1"]');
        await page.fill('#a-name', 'A '.repeat(100) + 'very long pasted name'); await page.fill('#a-price', '99,999,999.99');
        await page.click('#a-save');
        s = await saved(page);
        ok('long name cut to 80 and huge price ok', s.items.some(i => i.name.length <= 80 && i.name.length > 70 && i.prices[0].c === 9999999999 && i.ends === '2026-10-31'));
        await overlapCheck(page, '390 after adds');
        ok('no console errors (first use)', !page.errors.length && !page.bad.length, page.errors.concat(page.bad).join(' | '));
        await page.context().close();
    }

    // ---------- seeded: deciding ----------
    {
        const page = await open(browser, 390, { state: JSON.stringify(SEED) });
        ok('ready section first', (await text(page, '#ready-h')) === 'Ready to decide (1)');
        const fr = clean(await card(page, 'Air fryer, 5 litre').innerText());
        ok('ready card', fr.includes('Wait ended today') && fr.includes('Do you still want it?') && fr.includes('Why: Saw it in an Instagram reel'), fr);
        ok('price drop shown', fr.includes('Was 18,500 on Fri 23 Oct, now 16,900 (1,600 less)'), fr);
        ok('totals', (await text(page, '#sum-big')) === '39,700' && (await text(page, '#sum-sub')) === 'You skipped 3 items this year after the wait.');
        const L = await text(page, '#sum-list');
        ok('totals list', L.includes('Ready to decide 1 item') && L.includes('On your wishlist 3 items, 44,399') && L.includes('Bought this month 6,500 of 30,000 limit: 23,500 left') && L.includes('Saved on price drops 1,500'), L);
        // buy with limit preview
        await card(page, 'Air fryer, 5 litre').getByRole('button', { name: 'Buy Air fryer, 5 litre' }).click();
        ok('buy form prefilled', await page.inputValue('[id="b-i1"]') === '16900');
        ok('limit note', (await text(page, '.f-note')) === "This leaves 6,600 of this month's 30,000 limit.", await text(page, '.f-note'));
        await page.fill('[id="b-i1"]', '25000');
        ok('over limit note', (await text(page, '.f-note')) === "This is 1,500 over this month's 30,000 limit.");
        await page.keyboard.press('Escape');
        ok('escape closes form', !(await page.isVisible('.inline-form')));
        await card(page, 'Air fryer, 5 litre').getByRole('button', { name: 'Buy Air fryer, 5 litre' }).click();
        await page.fill('[id="b-i1"]', '16,900');
        await page.click('.inline-form .primary');
        ok('bought message', (await text(page, '#ready-msg')).startsWith('Bought Air fryer, 5 litre for 16,900.'), await text(page, '#ready-msg'));
        let s = await saved(page);
        const af = s.items.find(i => i.id === 'i1');
        ok('bought saved', af.st === 'bought' && af.paid === 1690000 && af.dd === '2026-10-30' && af.early === false);
        ok('month total updated', (await text(page, '#sum-list')).includes('Bought this month 23,400 of 30,000 limit: 6,600 left'));
        ok('saved on drops now 3,100', (await text(page, '#sum-list')).includes('Saved on price drops 3,100'));
        ok('bought tab shown', await page.getAttribute('#tab-bought', 'aria-pressed') === 'true' && clean(await card(page, 'Air fryer, 5 litre').innerText()).includes('Bought Fri 30 Oct for 16,900 (1,600 less than when you added it).'));
        await page.click('#ready-msg .undo');
        ok('undo buy', (await saved(page)).items.find(i => i.id === 'i1').st === 'wait' && (await text(page, '#ready-h')) === 'Ready to decide (1)');
        // skip
        await card(page, 'Air fryer, 5 litre').getByRole('button', { name: 'Skip Air fryer, 5 litre' }).click();
        ok('skip message', (await text(page, '#ready-msg')).startsWith('Skipped Air fryer, 5 litre. 16,900 added to Not spent this year.'));
        ok('not spent grows exactly', (await text(page, '#sum-big')) === '56,600');
        await page.click('#ready-msg .undo');
        ok('undo skip', (await text(page, '#sum-big')) === '39,700');
        // wait longer from ready: +1 week from today
        await card(page, 'Air fryer, 5 litre').getByRole('button', { name: 'Wait longer for Air fryer, 5 litre' }).click();
        await page.click('.inline-form .chip:has-text("1 more week")');
        s = await saved(page);
        ok('wait longer from today', s.items.find(i => i.id === 'i1').ends === '2026-11-06');
        ok('wait longer message', (await text(page, '#ready-msg')).includes('Wait ends Fri 6 Nov (in 7 days)'));
        await page.click('#ready-msg .undo');
        // wait longer custom with bad input
        await card(page, 'Air fryer, 5 litre').getByRole('button', { name: 'Wait longer for Air fryer, 5 litre' }).click();
        await page.fill('[id="l-i1"]', 'abc'); await page.click('.inline-form .primary');
        ok('custom wait longer refused', (await text(page, '[id="l-i1-err"]')).length > 0);
        await page.fill('[id="l-i1"]', '3'); await page.click('.inline-form .primary');
        ok('custom wait longer', (await saved(page)).items.find(i => i.id === 'i1').ends === '2026-11-02');
        await page.click('#ready-msg .undo');
        // edit: new price kept with old, wait days change, name change
        await card(page, 'Running shoes').getByRole('button', { name: 'Edit Running shoes' }).click();
        await page.fill('[id="e-i3p"]', '12000');
        await page.fill('[id="e-i3d"]', '2');
        await page.fill('[id="e-i3n"]', '');
        await page.click('.inline-form .primary');
        ok('edit blank name refused', (await text(page, '[id="e-i3n-err"]')).length > 0);
        await page.fill('[id="e-i3n"]', 'Running shoes (Nike)');
        await page.click('.inline-form .primary');
        s = await saved(page);
        const sh = s.items.find(i => i.id === 'i3');
        ok('edit saved', sh.name === 'Running shoes (Nike)' && sh.prices.map(x => x.c).join() === '1450000,1200000' && sh.wait === 2 && sh.ends === '2026-10-30');
        ok('edited item now ready, with drop', clean(await card(page, 'Running shoes (Nike)').innerText()).includes('Was 14,500 on Wed 28 Oct, now 12,000 (2,500 less)') && (await text(page, '#ready-h')) === 'Ready to decide (2)');
        // buy anyway early, blank price
        await card(page, 'Wireless headphones').getByRole('button', { name: 'Buy Wireless headphones before the wait ends' }).click();
        ok('early buy heading', (await text(page, '.inline-form .f-h')) === 'Buy before the wait ends?');
        await page.fill('[id="b-i2"]', '');
        await page.click('.inline-form .primary');
        s = await saved(page);
        ok('early buy, no price', s.items.find(i => i.id === 'i2').early === true && s.items.find(i => i.id === 'i2').paid === null);
        ok('early noted', clean(await card(page, 'Wireless headphones').innerText()).includes('Bought Fri 30 Oct, before the wait ended.'));
        // put back on the list
        await card(page, 'Wireless headphones').getByRole('button', { name: 'Put Wireless headphones back on the list' }).click();
        ok('back on the list', (await saved(page)).items.find(i => i.id === 'i2').st === 'wait' && (await text(page, '#wait-h')) === 'Waiting (1)');
        // skipped tab and old skipped warning
        await page.click('#tab-skipped');
        ok('skipped list', (await page.locator('#done-list .item').count()) === 3);
        await page.fill('#a-name', 'smart watch');
        ok('skipped before warning', (await text(page, '#a-rep')) === 'You skipped Smart watch on Fri 2 Oct. Still want it?');
        await page.fill('#a-name', '');
        // delete with undo
        await card(page, 'Second phone case').getByRole('button', { name: 'Delete Second phone case' }).click();
        ok('deleted', !(await saved(page)).items.some(i => i.id === 'i6'));
        await page.click('#done-msg .undo');
        ok('undo delete', (await saved(page)).items.some(i => i.id === 'i6'));
        // remind me: calendar file
        const [dl] = await Promise.all([page.waitForEvent('download'), card(page, 'Wireless headphones').getByRole('button', { name: /Remind me/ }).click()]);
        const ics = fs.readFileSync(await dl.path(), 'utf8');
        ok('ics file', dl.suggestedFilename() === 'wishlist-wireless-headphones.ics' && ics.includes('DTSTART;VALUE=DATE:20261119'), dl.suggestedFilename());
        // copy and email
        await page.click('#copy');
        await page.waitForFunction(() => document.getElementById('sum-msg').textContent.length > 0, null, { timeout: 3000 }).catch(() => {});
        ok('copied', (await text(page, '#sum-msg')).startsWith('Copied the list'), await text(page, '#sum-msg'));
        const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
        ok('copied text', clip.startsWith('My shopping wishlist (Fri 30 Oct)') && clip.includes('Ready to decide:'), clip.slice(0, 80));
        const mail = await page.getAttribute('#mail', 'href');
        ok('email works with no recipient', mail.startsWith('mailto:?subject=My%20shopping%20wishlist&body='));
        // currency symbol
        await page.selectOption('#cur', 'Rs');
        ok('currency shown', (await text(page, '#sum-big')).startsWith('Rs ') && await page.isVisible('#a-price-cur'));
        await page.reload();
        ok('currency remembered', (await page.inputValue('#cur')) === 'Rs');
        // monthly limit: remove and set
        await page.click('#lim-del');
        ok('no limit', (await saved(page)).limit === null && !(await text(page, '#sum-list')).includes(' of '));
        await page.click('#lim-open'); await page.fill('#lim', 'abc'); await page.click('#lim-save');
        ok('bad limit refused', (await text(page, '#lim-err')).length > 0);
        await page.fill('#lim', '20000'); await page.click('#lim-save');
        ok('limit set', (await saved(page)).limit === 2000000);
        // a new month and a new year: the next day
        await page.clock.setFixedTime(new Date('2027-01-02T09:00:00'));
        await page.reload();
        ok('new year resets not spent this year', (await text(page, '#sum-big')) === 'Rs 0' && (await text(page, '#sum-list')).includes('Not spent, all time Rs 39,700'), await text(page, '#sum-list'));
        ok('everything waiting is now ready', (await text(page, '#ready-h')) === 'Ready to decide (3)');
        ok('no console errors (seeded)', !page.errors.length && !page.bad.length, page.errors.concat(page.bad).join(' | '));
        await page.context().close();
    }

    // ---------- midnight while open ----------
    {
        const page = await open(browser, 390, { state: JSON.stringify(SEED), now: new Date('2026-11-03T23:59:30') });
        ok('before midnight running shoes waiting', (await text(page, '#ready-h')) === 'Ready to decide (1)');
        await page.clock.setFixedTime(new Date('2026-11-04T00:00:30'));
        await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
        ok('after midnight running shoes ready', (await text(page, '#ready-h')) === 'Ready to decide (2)');
        await page.context().close();
    }

    // ---------- corrupt saved data, blocked storage, backup and restore, delete everything ----------
    {
        const page = await open(browser, 390, { state: '{not json' });
        ok('corrupt: starts fresh with a message', (await text(page, '#top-msg')).startsWith('Your saved list could not be read') && await page.isVisible('#intro'));
        await page.context().close();
        const p2 = await open(browser, 390, { block: true });
        ok('blocked storage warning', await p2.isVisible('#store-warn'));
        await addItem(p2, { name: 'Lamp', price: '3000' });
        ok('blocked storage still works', clean(await card(p2, 'Lamp').innerText()).includes('3,000'));
        ok('no errors when blocked', !p2.errors.length, p2.errors.join(' | '));
        await p2.context().close();
        const p3 = await open(browser, 1280, { state: JSON.stringify(SEED) });
        const [dl] = await Promise.all([p3.waitForEvent('download'), p3.click('#backup')]);
        const file = await dl.path();
        ok('backup name', dl.suggestedFilename() === 'shopping-wishlist-backup-2026-10-30.json');
        await p3.click('#del-all');
        ok('delete everything', (await saved(p3)).items.length === 0 && await p3.isVisible('#intro'));
        await p3.click('#top-msg .undo');
        ok('undo delete everything', (await saved(p3)).items.length === 7);
        await p3.click('#del-all');
        const bad = path.join(path.dirname(file), 'bad.json'); fs.writeFileSync(bad, '{"items": 5}');
        await p3.setInputFiles('#restore-file', bad);
        await p3.waitForTimeout(300);
        ok('bad backup refused', (await text(p3, '#add-msg')).startsWith('That file is not a backup'));
        await p3.setInputFiles('#restore-file', file);
        await p3.waitForTimeout(200);
        ok('restore', (await saved(p3)).items.length === 7 && (await text(p3, '#top-msg')).startsWith('Restored 7 items'));
        ok('no console errors (backup)', !p3.errors.length, p3.errors.join(' | '));
        await p3.context().close();
    }

    // ---------- keyboard only ----------
    {
        const page = await open(browser, 390);
        await page.focus('#a-name'); await page.keyboard.type('Sofa');
        await page.keyboard.press('Tab'); await page.keyboard.type('85000');
        await page.keyboard.press('Enter');
        ok('keyboard add with Enter', (await saved(page)).items[0].name === 'Sofa');
        await page.context().close();
    }

    // ---------- layout at every width, filled and empty, both themes ----------
    for (const scheme of ['dark', 'light']) for (const w of [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920]) {
        const page = await open(browser, w, { state: JSON.stringify(SEED), scheme });
        await card(page, 'Air fryer, 5 litre').getByRole('button', { name: 'Edit Air fryer, 5 litre' }).click();
        await page.click('#a-more-open'); await page.click('#a-need-open'); await page.click('#a-waits .chip[data-days="custom"]'); if (await page.isVisible('#lim-open')) await page.click('#lim-open');
        const r = await overlapCheck(page, scheme + ' ' + w);
        if (w <= 390) ok(scheme + ' ' + w + ': placeholders fit', !r.ph.length, r.ph.join(','));
        if (w >= 900) for (const y of ['top', 'mid', 'bottom']) {
            await page.evaluate(y => window.scrollTo(0, y === 'top' ? 0 : y === 'mid' ? document.body.scrollHeight / 2 : document.body.scrollHeight), y);
            const o = await page.evaluate(() => {
                const bad = [];
                document.querySelectorAll('main, .col-a, .col-b').forEach(par => {
                    const k = [...par.children].filter(e => e.getBoundingClientRect().height > 0).map(e => [e, e.getBoundingClientRect()]);
                    for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { const a = k[i][1], b = k[j][1]; if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) bad.push((k[i][0].id || k[i][0].className) + ' x ' + (k[j][0].id || k[j][0].className)); }
                });
                return bad;
            });
            ok(scheme + ' ' + w + ' ' + y + ': no overlapping blocks', !o.length, o.join(', '));
        }
        // cleared state
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.click('#del-all');
        await overlapCheck(page, scheme + ' ' + w + ' cleared');
        if (w === 1280 && scheme === 'dark') {
            const cols = await page.evaluate(() => [document.querySelector('.col-a').getBoundingClientRect().width, document.querySelector('.col-b').getBoundingClientRect().width]);
            ok('desktop uses two columns', cols[0] > 350 && cols[1] > 450, cols.join(','));
        }
        // the light/dark switch
        if (w === 390) {
            const before = await page.evaluate(() => getComputedStyle(document.body).color);
            await page.click('.theme-toggle');
            const after = await page.evaluate(() => getComputedStyle(document.body).color);
            ok(scheme + ': theme switch changes colours', before !== after);
        }
        ok(scheme + ' ' + w + ': no console errors', !page.errors.length, page.errors.join(' | '));
        await page.context().close();
    }

    // ---------- help dialog ----------
    for (const w of [320, 390, 820, 1280]) {
        const page = await open(browser, w, { state: JSON.stringify(SEED) });
        await page.click('.help-btn');
        const d = await page.evaluate(() => { const e = document.querySelector('dialog.help'); const r = e.getBoundingClientRect(); return { open: e.open, inside: r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0, title: e.textContent.includes('How to use the Shopping Wishlist') }; });
        ok('help opens at ' + w, d.open && d.inside && d.title, JSON.stringify(d));
        await page.keyboard.press('Escape');
        ok('help escape at ' + w, !(await page.evaluate(() => document.querySelector('dialog.help').open)));
        await page.click('.help-btn');
        await page.click('dialog.help >> text=Got it');
        ok('help got it at ' + w, !(await page.evaluate(() => document.querySelector('dialog.help').open)));
        const bar = await page.evaluate(() => { const r = [...document.querySelectorAll('.topbar > *')].map(e => e.getBoundingClientRect()); return r.length >= 2 && r.every(x => Math.abs(x.top - r[0].top) < 4); });
        ok('top bar on one line at ' + w, bar);
        await page.context().close();
    }

    // ---------- screenshots ----------
    if (args.includes('--shots')) {
        const d = await open(browser, 1280, { state: JSON.stringify(SEED) });
        await d.fill('#a-name', 'Gaming chair'); await d.fill('#a-price', '42,000'); await d.click('#a-waits .chip[data-days="30"]');
        await d.click('#a-more-open'); await d.fill('#a-where', 'Daraz'); await d.fill('#a-why', 'My back hurts after long days');
        await d.setViewportSize({ width: 1280, height: 1300 });
        await d.screenshot({ path: path.join(DIR, 'screenshots/desktop.png') });
        await d.context().close();
        const ph = await open(browser, 390, { state: JSON.stringify(SEED), scale: 2 });
        await ph.setViewportSize({ width: 390, height: 1200 });
        await ph.screenshot({ path: path.join(DIR, 'screenshots/phone.png') });
        await ph.context().close();
    }
    await browser.close();
    console.log(pass + ' passed, ' + fail + ' failed');
    if (fail) process.exitCode = 1;
})();
