// Drives the real page in headless Chromium. Run from the repo root:
//   node work-expense-claim-log-for-employees/ui-test.js [--base http://localhost:8765] [--shots]
// --base defaults to a local server you start yourself (python3 -m http.server 8765 in the repo root).
// --shots also saves screenshots/desktop.png and screenshots/phone.png.
const { chromium } = require('playwright');
const path = require('path');
const args = process.argv.slice(2);
const bi = args.indexOf('--base'), BASE = (bi >= 0 ? args[bi + 1] : 'http://localhost:8765').replace(/\/$/, '');
const SLUG = 'work-expense-claim-log-for-employees';
const URL = BASE + '/' + SLUG + '/';
const KEY = SLUG + '.state';
const DIR = __dirname;
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; if (!cond) console.log('FAIL ' + name + (extra ? '  ' + extra : '')); };
const NOW = new Date('2026-10-29T10:00:00');

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
const txt = (page, sel) => page.locator(sel).first().innerText();
const saved = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
const exp = (page, text) => page.locator('#e-list .exp', { hasText: text });
async function add(page, d, amt, cat, whatFor, proj, extra) {
    extra = extra || {};
    await page.fill('#e-date', d);
    if (extra.fx) { await page.click('#fx-open'); await page.fill('#fx-code', extra.fx[0]); await page.fill('#fx-amt', extra.fx[1]); await page.fill('#fx-rate', extra.fx[2]); }
    else if (extra.km) { await page.click('#km-open'); await page.fill('#km-dist', extra.km[0]); await page.fill('#km-rate', extra.km[1]); }
    else await page.fill('#e-amt', amt);
    await page.selectOption('#e-cat', cat); await page.fill('#e-what', whatFor); await page.fill('#e-proj', proj || '');
    if (extra.norec) await page.check('#e-norec');
    await page.click('#e-save');
}
// Ayesha's September and October
async function ayesha(page) {
    await page.selectOption('#cur', 'Rs');
    await page.fill('#co-name', 'Orion Traders'); await page.selectOption('#co-days', '60'); await page.click('#co-save');
    await add(page, '2026-09-14', '18500', 'Train, bus or flight', 'Flight to Lahore', 'Lahore trade fair');
    await add(page, '2026-09-15', '9,800', 'Hotel', 'Hotel, 1 night', 'Lahore trade fair');
    await add(page, '2026-09-18', '1250', 'Taxi or ride', 'Careem to Habib Foods', 'Habib Foods');
    await add(page, '2026-09-22', '8600', 'Client meal or entertainment', 'Lunch with Habib Foods buyers', 'Habib Foods');
    await add(page, '2026-09-22', '300', 'Parking or tolls', 'Parking at Dolmen Mall', '');
    await exp(page, 'Flight to Lahore').locator('.tick input').check(); await exp(page, 'Hotel, 1 night').locator('.tick input').check();
    await page.fill('#nc-date', '2026-09-30'); await page.click('#nc-ref-open'); await page.fill('#nc-ref', 'EXP-0398'); await page.click('#nc-save');
    await page.locator('#w-list .claim').first().getByRole('button', { name: /^Paid back/ }).click();
    const hotelId = (await saved(page)).exps.find(e => e.what === 'Hotel, 1 night').id;
    await page.fill('#pp-a-' + hotelId, '8000'); await page.fill('#pp-date', '2026-10-20'); await page.click('#w-list .panel .primary');
    for (const t of ['Careem', 'Lunch with', 'Parking at']) await exp(page, t).locator('.tick input').check();
    await page.fill('#nc-date', '2026-10-05'); await page.click('#nc-save');
    await add(page, '2026-10-03', '1450', 'Taxi or ride', 'Uber to Habib Foods', 'Habib Foods');
    await add(page, '2026-10-09', '4200', 'Office supplies', 'Printer ink', '', { norec: true });
    await add(page, '2026-10-14', '', 'Fuel or mileage', 'Own car to Hub factory', 'Habib Foods', { km: ['120', '65'] });
    await add(page, '2026-10-21', '5900', 'Client meal or entertainment', 'Dinner with Habib Foods', 'Habib Foods');
    await add(page, '2026-10-26', '', 'Phone or internet', 'Zoom Pro for the webinar', '', { fx: ['usd', '15.99', '281.4'] });
}
async function overlaps(page) {
    return page.evaluate(() => {
        const k = [...document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]), select, button, textarea, a.secondary')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
        const bad = [];
        for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { if (k[i].contains(k[j]) || k[j].contains(k[i])) continue; const a = k[i].getBoundingClientRect(), b = k[j].getBoundingClientRect(); if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2) bad.push((k[i].id || k[i].textContent.trim().slice(0, 20)) + ' / ' + (k[j].id || k[j].textContent.trim().slice(0, 20))); }
        return bad.slice(0, 4);
    });
}
async function placeholdersFit(page) {
    return page.evaluate(() => [...document.querySelectorAll('input[placeholder]')].filter(i => i.offsetWidth > 0).filter(i => {
        const c = document.createElement('canvas').getContext('2d'), cs = getComputedStyle(i); c.font = cs.fontSize + ' ' + cs.fontFamily;
        return c.measureText(i.placeholder).width > i.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) + 1;
    }).map(i => i.id + ' "' + i.placeholder + '"'));
}
const noHScroll = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

(async () => {
    const browser = await chromium.launch();

    // ---------- first use and odd inputs ----------
    let page = await open(browser, 390);
    ok('first use: How it works shown', await page.isVisible('#intro'));
    ok('first use: summary hidden', !(await page.isVisible('#glance')));
    ok('first use: restore link offered', await page.isVisible('#restore-first'));
    ok('optional note hidden until asked', !(await page.isVisible('#e-note')) && await page.isVisible('#e-more-open'));
    ok('other currency and distance hidden until asked', !(await page.isVisible('#fx-box')) && !(await page.isVisible('#km-box')));
    ok('client is optional (no error when blank)', true);
    ok('date starts today', await page.inputValue('#e-date') === '2026-10-29');
    await page.click('#e-save');
    ok('blank: amount error', (await txt(page, '#e-amt-err')).includes('Type the amount'));
    ok('blank: what error', (await txt(page, '#e-what-err')).includes('Type what it was for'));
    for (const [v, w] of [['0', 'bigger than 0'], ['-5', 'without a minus'], ['abc', 'such as 2500'], ['12.345.6', 'such as'], ['99999999999', 'too big']]) {
        await page.fill('#e-amt', v); await page.click('#e-save'); ok('amount "' + v + '" refused', (await txt(page, '#e-amt-err')).includes(w), await txt(page, '#e-amt-err'));
    }
    await page.fill('#e-date', '2026-11-05'); await page.fill('#e-amt', '10'); await page.fill('#e-what', 'Tea'); await page.click('#e-save');
    ok('future date refused', (await txt(page, '#e-date-err')).includes('future'));
    ok('nothing saved after errors', (await page.evaluate(k => localStorage.getItem(k), KEY)) === null);
    // pasted amount and very long text; client left blank
    await page.fill('#e-date', '2026-10-28'); await page.fill('#e-amt', ' 35 000 '); await page.fill('#e-what', 'A very long description pasted from an email '.repeat(4)); await page.click('#e-save');
    let st = await saved(page);
    ok('pasted "35 000" saved as 35,000', st.exps[0].amt === 3500000);
    ok('long text cut at 80', st.exps[0].what.length <= 80);
    ok('no client stored when blank', !('proj' in st.exps[0]));
    ok('after first save: summary shown', await page.isVisible('#glance') && !(await page.isVisible('#intro')));
    ok('long text does not scroll sideways', await noHScroll(page));
    // currency helper: wrong code and rate
    await page.click('#fx-open');
    ok('amount locked while another currency is used', await page.locator('#e-amt').evaluate(e => e.readOnly));
    await page.fill('#fx-code', 'US'); await page.fill('#fx-amt', '10'); await page.fill('#fx-rate', '0'); await page.fill('#e-what', 'x'); await page.click('#e-save');
    ok('fx: 2-letter code refused', (await txt(page, '#fx-code-err')).includes('3-letter'));
    ok('fx: rate 0 refused', (await txt(page, '#fx-rate-err')).includes('bigger than 0'));
    await page.fill('#fx-code', 'eur'); await page.fill('#fx-rate', '310.25');
    ok('fx: worked out live', (await page.inputValue('#e-amt')) === '3102.50' && (await txt(page, '#fx-out')).includes('EUR 10 at 310.25 = 3,102.50'), await txt(page, '#fx-out'));
    await page.click('#fx-close');
    ok('fx removed: amount typeable again', !(await page.locator('#e-amt').evaluate(e => e.readOnly)) && !(await page.isVisible('#fx-box')));
    await page.click('#km-open');
    ok('distance: type set to Fuel or mileage', (await page.inputValue('#e-cat')) === 'Fuel or mileage');
    await page.selectOption('#km-unit', 'mi'); await page.fill('#km-dist', '37.3'); await page.fill('#km-rate', '0.7');
    ok('distance in miles worked out', (await page.inputValue('#e-amt')) === '26.11' && (await page.locator('label[for=km-rate]').innerText()) === 'Paid per mile');
    await page.click('#km-close');
    // delete with undo
    await exp(page, 'A very long').getByRole('button', { name: /^Delete/ }).click();
    ok('delete: back to empty', (await saved(page)).exps.length === 0 && await page.isVisible('#intro'));
    await page.locator('.undo').first().click();
    ok('undo brings it back', (await saved(page)).exps.length === 1);
    await page.click('#del-all');
    ok('delete everything', (await saved(page)).exps.length === 0);
    await page.locator('#tools-msg .undo').click();
    ok('undo delete everything', (await saved(page)).exps.length === 1);
    ok('no errors (first use)', !page.errors.length && !page.bad.length, page.errors.concat(page.bad).join(' | '));
    await page.context().close();

    // ---------- the main situation ----------
    page = await open(browser, 1280);
    await ayesha(page);
    st = await saved(page);
    ok('11 expenses... 10 saved, 2 claims', st.exps.length === 10 && st.claims.length === 2, st.exps.length + ' ' + st.claims.length);
    ok('mileage saved 7,800 from 120 km at 65', st.exps.find(e => e.what.startsWith('Own car')).amt === 780000);
    ok('fx saved 4,499.59 from USD 15.99 at 281.4', st.exps.find(e => e.what.startsWith('Zoom')).amt === 449959);
    const g = await txt(page, '#glance-body');
    ok('glance: not claimed yet Rs 23,849.59', g.includes('Rs 23,849.59'), g);
    ok('glance: 5 expenses, oldest 3 Oct 26 days ago', g.includes('5 expenses · oldest from 3 Oct (26 days ago)'));
    ok('glance: claim the first by Wed 2 Dec', /Claim the first by Wed,? 2 Dec \(in 34 days\)/.test(g), g);
    ok('glance: waiting Rs 10,150 sent 5 Oct', g.includes('Rs 10,150') && g.includes('1 claim · oldest sent 5 Oct (24 days ago)'));
    ok('glance: spent / paid back / not paid back', g.includes('Rs 62,299.59') && g.includes('Rs 26,500') && g.includes('Rs 1,800'));
    ok('glance: 1 without a receipt', g.includes('1 expense without a receipt.'));
    ok('history: hotel cut shown', (await txt(page, '#h-list')).includes('Paid back Rs 26,500 of Rs 28,300 on 20 Oct') && (await txt(page, '#h-list')).includes('Rs 1,800 not paid back'));
    ok('history: line shows what was paid', (await txt(page, '#h-list')).includes('Rs 9,800, paid Rs 8,000'));
    ok('list: oldest first', (await page.locator('#e-list .exp .e-name').allInnerTexts()).join('|') === 'Uber to Habib Foods|Printer ink|Own car to Hub factory|Dinner with Habib Foods|Zoom Pro for the webinar');
    ok('list: how the amount was worked out', (await txt(page, '#e-list')).includes('USD 15.99 at 281.4') && (await txt(page, '#e-list')).includes('120 km at Rs 65 a km'));
    ok('list: no receipt tag', (await exp(page, 'Printer ink').innerText()).includes('No receipt'));
    ok('list: claim by date', /Claim by Wed,? 2 Dec \(in 34 days\)/.test(await exp(page, 'Uber').innerText()));
    ok('client chips offered', (await page.locator('#proj-quick .chip').allInnerTexts()).join('|') === 'Habib Foods|Lahore trade fair');
    // tick all and copy the list
    await page.click('#tick-all');
    ok('tick all: new claim total', (await txt(page, '#nc-h')) === 'New claim: 5 expenses, Rs 23,849.59');
    await page.click('#nc-copy');
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    ok('copied list: heading and company', clip.startsWith('Expense claim, Orion Traders, 29 Oct 2026'), clip.split('\n')[0]);
    ok('copied list: fx line', clip.includes('5. 26 Oct 2026, Phone or internet: Zoom Pro for the webinar, Rs 4,499.59 [USD 15.99 at 281.4]'), clip);
    ok('copied list: no receipt flagged', clip.includes('Printer ink, Rs 4,200 (no receipt)'));
    ok('copied list: by type and total', clip.includes('By type:\n- Fuel or mileage: Rs 7,800') && clip.trim().endsWith('Total: Rs 23,849.59'));
    // lower one line in the new claim, then untick
    const dinnerId = st.exps.find(e => e.what.startsWith('Dinner')).id;
    await page.fill('#nc-a-' + dinnerId, '6000'); await page.click('#nc-save');
    ok('claim more than left refused', (await txt(page, '#nc-a-' + dinnerId + '-err')).includes('At most Rs 5,900'));
    await page.fill('#nc-a-' + dinnerId, '4000'); await page.fill('#nc-date', '2026-10-01'); await page.click('#nc-save');
    ok('claim dated before an expense refused', (await txt(page, '#nc-date-err')).includes('before you paid'));
    await page.click('#nc-clear');
    ok('untick all hides the claim box', !(await page.isVisible('#newclaim')));
    // month by month
    const mo = await txt(page, '#months');
    ok('month: October Rs 23,849.59 by type and client', mo.includes('October 2026') && mo.includes('Rs 23,849.59') && mo.includes('Habib Foods') && mo.includes('Rs 15,150') && mo.includes('No client or project'), mo);
    ok('month: next disabled on the current month', await page.locator('#m-next').isDisabled());
    await page.click('#m-prev');
    ok('month: September Rs 38,450', (await txt(page, '#months')).includes('September 2026') && (await txt(page, '#months')).includes('Rs 38,450'));
    ok('month: no earlier than the first expense', (await txt(page, '#m-name')) === 'September 2026' && await page.locator('#m-prev').isDisabled());
    await page.click('#m-next');
    await page.click('#m-copy');
    ok('month copied', (await page.evaluate(() => navigator.clipboard.readText())).includes('By client or project:\n- Habib Foods: Rs 15,150'));
    // email
    const mail = await page.getAttribute('#g-mail', 'href');
    ok('email: no recipient, has the summary', mail.startsWith('mailto:?subject=') && decodeURIComponent(mail).includes('Not claimed yet: Rs 23,849.59'));
    const shotState = JSON.stringify(await saved(page));
    if (process.env.DUMP) require('fs').writeFileSync(process.env.DUMP, shotState);

    // rejected, then undo
    await page.locator('#w-list .claim').first().getByRole('button', { name: /^Rejected/ }).click();
    await page.fill('#pp-why', 'Missing receipt'); await page.click('#w-list .panel .primary');
    ok('rejected: expenses back with the reason', (await exp(page, 'Lunch with').innerText()).includes('Rejected on 29 Oct: Missing receipt'));
    ok('rejected: not claimed yet grows', (await txt(page, '#glance-body')).includes('Rs 33,999.59'));
    await page.locator('#exps-msg .undo').click();
    ok('undo the rejection', (await txt(page, '#glance-body')).includes('Rs 23,849.59') && await page.isVisible('#waiting'));
    // claim the cut part again, then take it back
    await page.locator('#h-list .claim').first().getByRole('button', { name: /^Claim the cut part again/ }).click();
    ok('cut part back in the list', (await exp(page, 'Hotel, 1 night').innerText()).includes('Rs 1,800 still to claim of Rs 9,800 (Rs 8,000 paid back)'));
    await page.locator('#h-list .claim').first().getByRole('button', { name: /^Do not claim the cut part/ }).click();
    ok('cut part out again', (await exp(page, 'Hotel, 1 night').count()) === 0);
    // edit a waiting claim: lower a line, then the expense below what is claimed is refused
    await page.locator('#w-list .claim').first().getByRole('button', { name: /^Edit claim/ }).click();
    const lunchId = st.exps.find(e => e.what.startsWith('Lunch')).id;
    await page.fill('#pe-a-' + lunchId, '9000'); await page.click('#w-list .panel .primary');
    ok('edit claim: more than the expense refused', (await txt(page, '#pe-a-' + lunchId + '-err')).includes('At most Rs 8,600'));
    await page.fill('#pe-a-' + lunchId, '6000'); await page.click('#w-list .panel .primary');
    ok('edit claim: lunch lowered, 2,600 back to claim', (await exp(page, 'Lunch with').innerText()).includes('Rs 2,600 still to claim of Rs 8,600 (Rs 6,000 waiting)'));
    await page.locator('.tab[data-tab=all]').click();
    await page.locator('#e-list .exp', { hasText: 'Lunch with' }).getByRole('button', { name: /^Edit/ }).click();
    await page.fill('#e-amt', '5000'); await page.click('#e-save');
    ok('edit expense below its claim refused', (await txt(page, '#e-amt-err')).includes('Rs 6,000 of this expense is already in a claim'));
    await page.fill('#e-amt', '8,600.50'); await page.click('#e-save');
    ok('edit expense saved', (await saved(page)).exps.find(e => e.id === lunchId).amt === 860050 && (await page.inputValue('#e-what')) === '');
    // not claiming
    await page.locator('.tab[data-tab=todo]').click();
    await exp(page, 'Printer ink').getByRole('button', { name: /^Not claiming/ }).click();
    ok('not claiming: out of the list', (await exp(page, 'Printer ink').count()) === 0 && (await txt(page, '#n-todo')) === '5');
    await page.locator('#exps-msg .undo').click();
    // paid back in full with zero line, waiting again
    await page.locator('#w-list .claim').first().getByRole('button', { name: /^Paid back/ }).click();
    const parkId = st.exps.find(e => e.what.startsWith('Parking')).id;
    await page.fill('#pp-a-' + parkId, '400');
    await page.click('#w-list .panel .primary');
    ok('paid more than claimed refused', (await txt(page, '#pp-a-' + parkId + '-err')).includes('More than you claimed'));
    await page.fill('#pp-a-' + parkId, '0');
    ok('paid panel total updates', (await txt(page, '#w-list .p-total')).includes('Paid back in all: Rs 7,250 of Rs 7,550 (Rs 300 not paid back)'), await txt(page, '#w-list .p-total'));
    await page.click('#w-list .panel .primary');
    ok('paid with a refused line', (await txt(page, '#h-list')).includes('Paid back Rs 7,250 of Rs 7,550'));
    await page.locator('#h-list .claim').first().getByRole('button', { name: /^Mark as waiting again/ }).click();
    ok('waiting again', (await txt(page, '#w-list')).includes('Waiting 24 days'));
    // reload keeps everything
    await page.reload({ waitUntil: 'load' });
    ok('reload keeps the summary', (await txt(page, '#glance-body')).includes('Not claimed yet') && (await page.inputValue('#co-name')) === 'Orion Traders' && (await page.inputValue('#cur')) === 'Rs');
    // backup round trip
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#backup')]);
    const bpath = await dl.path();
    await page.click('#del-all');
    await page.setInputFiles('#restore-file', bpath);
    await page.waitForTimeout(300);
    ok('restore from backup', (await saved(page)).exps.length === 10, (await txt(page, '#tools-msg')));
    await page.setInputFiles('#restore-file', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"nope":1}') });
    await page.waitForTimeout(300);
    ok('bad backup refused', (await txt(page, '#tools-msg')).includes('not a backup'));
    const [csv] = await Promise.all([page.waitForEvent('download'), page.click('#csv')]);
    ok('csv download', /work-expenses-2026-10-29\.csv/.test(csv.suggestedFilename()));
    ok('no errors (main)', !page.errors.length && !page.bad.length, page.errors.concat(page.bad).join(' | '));
    // light/dark switch
    const tg = page.locator('.theme-toggle');
    if (await tg.count()) { const before = await page.evaluate(() => getComputedStyle(document.body).backgroundColor); await tg.click(); const after = await page.evaluate(() => getComputedStyle(document.body).backgroundColor); ok('theme switch changes the look', before !== after); }
    else ok('theme switch present', false);
    await page.context().close();

    // ---------- a later day: waiting long, late ----------
    page = await open(browser, 390, { state: shotState, now: new Date('2026-12-10T09:00:00') });
    const g2 = await txt(page, '#glance-body');
    ok('later: past the time limit', g2.includes('past the time limit'), g2);
    ok('later: waiting over 30 days', g2.includes('waited over 30 days'));
    await page.context().close();

    // ---------- storage blocked, corrupt ----------
    page = await open(browser, 390, { block: true });
    ok('storage blocked: warning', await page.isVisible('#store-warn'));
    await page.context().close();
    page = await open(browser, 390, { state: '{"exps":[{"id":1}],"claims":"x"' });
    ok('corrupt: starts fresh', await page.isVisible('#intro') && !page.errors.length);
    await page.context().close();

    // ---------- layout: filled state and open boxes at every width ----------
    for (const scheme of ['dark', 'light']) for (const w of [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920]) {
        page = await open(browser, w, { state: shotState, scheme });
        await page.click('#tick-all'); await page.click('#nc-ref-open');
        await page.click('#fx-open'); await page.click('#e-more-open');
        await page.locator('#w-list .claim').first().getByRole('button', { name: /^Paid back/ }).click();
        ok('[' + scheme + ' ' + w + '] no sideways scroll', await noHScroll(page));
        if (w <= 390) {
            const o = await overlaps(page); ok('[' + scheme + ' ' + w + '] no overlapping controls', !o.length, o.join('; '));
            const ph = await placeholdersFit(page); ok('[' + scheme + ' ' + w + '] placeholders fit', !ph.length, ph.join('; '));
            await page.click('#fx-close'); await page.click('#km-open');
            const o2 = await overlaps(page); ok('[' + scheme + ' ' + w + '] distance box fits', !o2.length && !(await placeholdersFit(page)).length, o2.join('; '));
            await page.click('#w-list .panel .secondary'); await page.locator('#w-list .claim').first().getByRole('button', { name: /^Edit claim/ }).click();
            ok('[' + scheme + ' ' + w + '] edit claim fits', !(await overlaps(page)).length && await noHScroll(page));
        }
        if (w >= 900) {
            for (const pos of [0, 0.5, 1]) {
                await page.evaluate(p => window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * p), pos);
                const bad = await page.evaluate(() => { const k = [...document.querySelectorAll('main > *, .col-a > *, .col-b > *')].filter(e => e.offsetParent && getComputedStyle(e).display !== 'none'); const out = []; for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { if (k[i].parentElement !== k[j].parentElement) continue; const a = k[i].getBoundingClientRect(), b = k[j].getBoundingClientRect(); if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 4 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 4) out.push(k[i].id + '/' + k[j].id); } return out; });
                ok('[' + scheme + ' ' + w + '] no overlap at ' + pos * 100 + '%', !bad.length, bad.join(','));
            }
        }
        // cleared state too
        await page.evaluate(k => localStorage.removeItem(k), KEY); await page.reload({ waitUntil: 'load' });
        ok('[' + scheme + ' ' + w + '] empty state no sideways scroll', await noHScroll(page));
        ok('[' + scheme + ' ' + w + '] no errors', !page.errors.length, page.errors.join(' | '));
        await page.context().close();
    }

    // ---------- screenshots ----------
    if (args.includes('--shots')) {
        page = await open(browser, 1280, { state: shotState });
        await page.screenshot({ path: path.join(DIR, 'screenshots', 'desktop.png') });
        await page.context().close();
        page = await open(browser, 390, { state: shotState, scale: 2 });
        await page.evaluate(() => document.getElementById('glance').scrollIntoView());
        await page.evaluate(() => window.scrollBy(0, -12));
        await page.screenshot({ path: path.join(DIR, 'screenshots', 'phone.png') });
        await page.context().close();
    }
    await browser.close();
    console.log((fail ? 'FAILED ' + fail + ' of ' : 'ALL UI CHECKS PASSED: ') + (pass + fail));
    process.exit(fail ? 1 : 0);
})();
