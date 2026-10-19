// Drives the real page in headless Chromium. Run from the repo root:
//   node electricity-gas-and-water-meter-reading-log/ui-test.js [--base http://localhost:8765] [--shots]
// --base defaults to a local server you start yourself (python3 -m http.server 8765 in the repo root).
// --shots also saves screenshots/desktop.png and screenshots/phone.png.
const { chromium } = require('playwright');
const path = require('path');
const args = process.argv.slice(2);
const bi = args.indexOf('--base'), BASE = (bi >= 0 ? args[bi + 1] : 'http://localhost:8765').replace(/\/$/, '');
const URL = BASE + '/electricity-gas-and-water-meter-reading-log/';
const KEY = 'electricity-gas-and-water-meter-reading-log.state';
const DIR = __dirname;
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; if (!cond) console.log('FAIL ' + name + (extra ? '  ' + extra : '')); };
const NOW = new Date('2026-10-20T10:00:00');

async function open(browser, width, opts) {
    opts = opts || {};
    const ctx = await browser.newContext({ viewport: { width, height: width < 600 ? 800 : 900 }, deviceScaleFactor: opts.scale || 1, colorScheme: opts.scheme || 'dark', locale: opts.locale || 'en-GB' });
    const page = await ctx.newPage();
    await page.clock.setFixedTime(NOW);
    page.errors = [];
    page.on('pageerror', e => page.errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !/goatcounter|gc\.zgo|ERR_|Failed to load resource/.test(m.text())) page.errors.push(m.text()); });
    page.bad = [];
    page.on('response', r => { if (r.status() >= 400 && r.url().startsWith(BASE)) page.bad.push(r.status() + ' ' + r.url()); });
    if (opts.state !== undefined) await page.addInitScript(([k, v]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, v); sessionStorage.setItem('seeded', '1'); } }, [KEY, opts.state]);
    await page.goto(URL, { waitUntil: 'load' });
    return page;
}
const txt = (page, sel) => page.locator(sel).first().innerText();
const saved = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);

async function addBilal(page) {
    await page.click('#quick .chip[data-name="Electricity"]');
    await page.selectOption('#f-unit', 'units');
    await page.selectOption('#f-day', '5');
    await page.click('#f-price-open');
    await page.selectOption('#f-mode', 'steps');
    await page.click('#f-step-add');
    await page.fill('#st-u0', '100'); await page.fill('#st-p0', '10');
    await page.fill('#st-u1', '200'); await page.fill('#st-p1', '15');
    await page.fill('#st-p2', '22');
    await page.click('#f-fixed-open'); await page.fill('#f-fixed', '300');
    await page.click('#f-limit-open'); await page.fill('#f-limit', '200');
    await page.click('#f-save');
}
async function addReading(page, d, v, reset) {
    const box = page.locator('.meter').first();
    await box.locator('input[type=date]').first().fill(d);
    await box.locator('input[id^="rv-"]').fill(v);
    if (reset) { const x = box.locator('input[id^="rx-"]'); if (!await x.count()) await box.getByText('+ New meter, or the meter went back to 0?').click(); await box.locator('input[id^="rx-"]').check(); }
    await box.locator('.save-r').click();
}
async function bilalFull(page) {
    await addBilal(page);
    await addReading(page, '2026-09-05', '8,000');
    await addReading(page, '2026-10-05', '8186');
    await addReading(page, '2026-10-12', '8236');
    await addReading(page, '2026-10-19', '8334');
}

(async () => {
    const browser = await chromium.launch();

    // ---------- first use, the main situation ----------
    let page = await open(browser, 390);
    ok('first use: intro shown', await page.locator('#intro').isVisible());
    ok('first use: no meter boxes', !(await page.locator('#meters').isVisible()));
    ok('first use: title', (await page.title()).startsWith('Electricity, Gas and Water Meter Reading Log'));
    ok('optional price hidden', !(await page.locator('#f-price-box').isVisible()) && await page.locator('#f-price-open').isVisible());
    ok('optional limit hidden', !(await page.locator('#f-limit-box').isVisible()));
    // empty name
    await page.click('#f-save');
    ok('blank name refused', (await txt(page, '#f-name-err')).includes('Type a name'));
    // a meter with only a name works: price and limit are not forced
    await page.fill('#f-name', 'Water'); await page.selectOption('#f-unit', 'm³'); await page.click('#f-save');
    ok('meter with no price is added', (await page.locator('.meter').count()) === 1);
    ok('focus moves to the reading box', await page.evaluate(() => document.activeElement && document.activeElement.id.startsWith('rv-')));
    ok('start here message', (await txt(page, '.meter .res')).includes('Start here'));
    // blank, words, negative readings
    await page.locator('.meter .save-r').click();
    ok('blank reading refused', (await txt(page, '.meter .err')).includes('Type the number on the meter'));
    await page.locator('.meter input[id^="rv-"]').fill('abc'); await page.locator('.meter .save-r').click();
    ok('words refused', (await txt(page, '.meter .err')).includes('mistyped'));
    await page.locator('.meter input[id^="rv-"]').fill('-4'); await page.locator('.meter .save-r').click();
    ok('negative refused', (await txt(page, '.meter .err')).includes('never below 0'));
    await page.locator('.meter input[type=date]').fill('2026-10-21'); await page.locator('.meter input[id^="rv-"]').fill('5'); await page.locator('.meter .save-r').click();
    ok('future date refused', (await txt(page, '.meter .err')).includes('future'));
    await addReading(page, '2026-10-01', '0');
    ok('zero reading accepted, first reading saved', (await txt(page, '.meter .res')).includes('First reading saved'));
    await addReading(page, '2026-10-20', '12.5');
    ok('decimal reading: 12.5 m³ used', (await txt(page, '.meter .res')).includes('12.5 m³'));
    ok('no bill without a price', !/bill about|cost/.test(await txt(page, '.meter .res')));
    // delete the water meter with undo
    await page.locator('.meter').getByText('Delete meter').click();
    ok('meter deleted', (await page.locator('.meter').count()) === 0);
    await page.locator('#top-msg .undo').click();
    ok('undo brings it back with readings', (await page.locator('.meter').count()) === 1 && (await page.locator('.meter .r-row').count()) === 2);
    await page.locator('.meter').getByText('Delete meter').click();

    // Bilal's electricity
    await bilalFull(page);
    const res = await txt(page, '.meter .res');
    ok('used so far 148 units', res.includes('148 units'), res);
    ok('period words', res.includes('5 Oct to 19 Oct (14 days)'), res);
    ok('units so far cost 1,720', res.includes('Units so far cost 1,720'), res);
    ok('by 5 Nov about 328 units, bill 5,609.71', res.includes('By 5 Nov, at this rate') && res.includes('about 328 units, bill about 5,609.71'), res);
    ok('bill breakdown', res.includes('Units 5,309.71 + fixed charge 300'), res); ok('one rate shown', res.includes('10.6 units a day') && !res.includes('8.2'), res);
    ok('limit: 3.1 units a day', res.includes('To stay under 200 units: use at most 3.1 units a day'), res);
    ok('limit: pass around 24 Oct', res.includes('pass it around 24 Oct'), res);
    ok('limit box is a warning', await page.locator('.limit.is-warn').count() === 1);
    const hist = await txt(page, '.meter .hist');
    ok('history: 5 Sep to 5 Oct 186 units bill 2,590', /5 Sept? to 5 Oct 2026/.test(hist) && hist.includes('186 units') && hist.includes('2,590'), hist);
    ok('readings list: newest first with use', (await txt(page, '.meter .r-row')).includes('+98 units in 7 days'));
    ok('last reading hint says yesterday', (await txt(page, '.meter .add-r')).includes('19 Oct 2026 (yesterday)'));

    // reload keeps everything
    await page.reload({ waitUntil: 'load' });
    ok('reload keeps the result', (await txt(page, '.meter .res')).includes('148 units'));
    const st = await saved(page);
    ok('saved under the slug key', st && st.meters.length === 1 && st.meters[0].readings.length === 4);

    // currency
    await page.selectOption('#cur', 'Rs');
    ok('currency shown', (await txt(page, '.meter .res')).includes('Rs 5,609.71'));
    await page.reload({ waitUntil: 'load' });
    ok('currency remembered', (await page.inputValue('#cur')) === 'Rs' && (await txt(page, '.meter .res')).includes('Rs 1,720'));
    await page.selectOption('#cur', '');

    // a lower reading is refused and says why
    await addReading(page, '2026-10-20', '8300');
    ok('lower reading refused', (await txt(page, '.meter .err')).includes('lower than the reading on 19 Oct 2026 (8,334)'));
    // a typo is caught but can be kept
    await addReading(page, '2026-10-20', '9334');
    ok('typo warning', (await txt(page, '.meter .err')).includes('far more than your usual'));
    await page.locator('.meter .save-r').click();
    ok('saved on the second tap', (await page.locator('.meter .r-row').count()) === 5);
    await page.locator('.meter .msg .undo').click();
    ok('undo removes it', (await page.locator('.meter .r-row').count()) === 4);
    // same date replaces
    await addReading(page, '2026-10-19', '8330');
    ok('same date replaces', (await page.locator('.meter .r-row').count()) === 4 && (await txt(page, '.meter .msg')).includes('Replaced the reading for 19 Oct'));
    await page.locator('.meter .msg .undo').click();
    // edit a reading
    await page.locator('.meter .r-row').first().getByText('Edit').click();
    await page.locator('.meter .r-row.editing input[id^="ev-"]').fill('8344');
    await page.locator('.meter .r-row.editing').getByText('Save').click();
    ok('edit changes the result to 158', (await txt(page, '.meter .res')).includes('158 units'));
    await page.locator('.meter .msg .undo').click();
    ok('undo edit', (await txt(page, '.meter .res')).includes('148 units'));
    // edit cancel
    await page.locator('.meter .r-row').first().getByText('Edit').click();
    await page.locator('.meter .r-row.editing').getByText('Cancel').click();
    ok('cancel edit', (await page.locator('.meter .r-row.editing').count()) === 0);
    // delete a reading with undo
    await page.locator('.meter .r-row').first().getByText('Delete').click();
    ok('delete reading', (await page.locator('.meter .r-row').count()) === 3);
    await page.locator('.meter .msg .undo').click();
    ok('undo delete reading', (await page.locator('.meter .r-row').count()) === 4);
    // new meter / reset
    await addReading(page, '2026-10-20', '3', true);
    ok('reset accepted', (await txt(page, '.meter .r-row')).includes('New meter'));
    ok('reset: so far stays 148 plus 1 estimated day', (await txt(page, '.meter .res')).includes('partly estimated'));
    await page.locator('.meter .msg .undo').click();

    // edit the meter: switch to one flat price with tax, the whole-bill step rule
    await page.locator('.meter').getByText('Edit meter').click();
    ok('form says Edit Electricity', (await txt(page, '#add-h')) === 'Edit Electricity');
    ok('steps filled back in', (await page.inputValue('#st-u1')) === '200' && (await page.inputValue('#st-p2')) === '22');
    await page.check('#f-whole');
    await page.click('#f-save');
    ok('whole-bill rule: 148 units all at 15 = 2,220', (await txt(page, '.meter .res')).includes('Units so far cost 2,220'));
    await page.locator('.meter').getByText('Edit meter').click();
    await page.selectOption('#f-mode', 'flat'); await page.fill('#f-flat', '25'); await page.click('#f-tax-open'); await page.fill('#f-tax', '17');
    await page.click('#f-save');
    const r2 = await txt(page, '.meter .res');
    ok('flat 25: 148 units cost 3,700', r2.includes('Units so far cost 3,700'), r2);
    ok('tax line shows', r2.includes('tax 17%'), r2);
    // bad step input
    await page.locator('.meter').getByText('Edit meter').click();
    await page.selectOption('#f-mode', 'steps');
    await page.fill('#st-u0', '100'); await page.fill('#st-p0', '10'); await page.fill('#st-p1', '');
    await page.click('#f-save');
    ok('missing step price refused', (await txt(page, '#f-steps-err')).includes('Step 2'));
    await page.click('#f-step-add'); await page.fill('#st-u1', '50'); await page.fill('#st-p1', '12'); await page.fill('#st-p2', '20');
    await page.click('#f-save');
    ok('step ending below the last refused', (await txt(page, '#f-steps-err')).includes('must end above 100'));
    await page.click('#f-cancel');
    ok('cancel edit meter', (await txt(page, '#add-h')) === 'Add another meter');
    // limit removed shows no limit box; over the limit
    await page.locator('.meter').getByText('Edit meter').click();
    await page.fill('#f-limit', '100'); await page.click('#f-save');
    ok('over the limit by 48', (await txt(page, '.meter .limit')).includes('Over your 100 units limit by 48 units'));
    // copy and email
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.locator('.meter').getByText('Copy summary').click();
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    ok('copied summary', clip.includes('Used so far: 148 units') && clip.includes('19 Oct 2026: 8,334 (+98 units)'), clip.slice(0, 300));
    const href = await page.locator('.meter a', { hasText: 'Email' }).getAttribute('href');
    ok('email link with no recipient', href.startsWith('mailto:?subject=') && decodeURIComponent(href).includes('Used so far: 148 units'));
    // second meter in its own box
    await page.click('#quick .chip[data-name="Gas"]'); await page.click('#f-save');
    ok('two meters, two boxes', (await page.locator('.meter').count()) === 2);
    // custom unit
    await page.fill('#f-name', 'Solar'); await page.selectOption('#f-unit', 'other'); await page.click('#f-save');
    ok('other unit needs a name', (await txt(page, '#f-ounit-err')).includes('unit'));
    await page.fill('#f-ounit', 'MWh'); await page.click('#f-save');
    ok('custom unit tag', (await page.locator('.meter .tag').nth(2).innerText()) === 'MWh');
    // very long name
    await page.fill('#f-name', 'A'.repeat(60)); await page.click('#f-save');
    ok('long name capped at 40', (await page.locator('.meter .m-name').nth(3).innerText()).length === 40);
    ok('no horizontal scroll with long name', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    // delete everything and undo
    await page.click('#del-all');
    ok('delete everything', (await page.locator('.meter').count()) === 0 && await page.locator('#intro').isVisible());
    await page.locator('#tools-msg .undo').click();
    ok('undo delete everything', (await page.locator('.meter').count()) === 4);
    ok('no errors in the main run', !page.errors.length && !page.bad.length, page.errors.concat(page.bad).join('; '));
    // backup and restore
    const dl = page.waitForEvent('download');
    await page.click('#backup');
    const file = await (await dl).path();
    await page.click('#del-all');
    await page.setInputFiles('#restore-file', file);
    await page.waitForTimeout(300);
    ok('restore backup', (await page.locator('.meter').count()) === 4);
    await page.setInputFiles('#restore-file', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"nope":1}') });
    await page.waitForTimeout(300);
    ok('bad backup refused', (await txt(page, '#tools-msg')).includes('not a backup'));
    await page.context().close();

    // ---------- corrupt and odd saved data ----------
    page = await open(browser, 390, { state: '{not json' });
    ok('corrupt state starts fresh', await page.locator('#intro').isVisible() && !page.errors.length, page.errors.join(';'));
    await page.context().close();
    page = await open(browser, 390, { state: JSON.stringify({ meters: [{ id: 'm', name: 'X', unit: 'kWh', day: 99, readings: [{ d: '2026-10-01', v: 9000 }, { d: '2026-10-10', v: 1000 }, { d: 'x', v: 1 }] }] }) });
    ok('odd state cleaned: drop becomes a meter change', (await txt(page, '.meter .r-list')).includes('New meter') && !page.errors.length);
    await page.context().close();

    // ---------- keyboard: Enter saves a reading ----------
    page = await open(browser, 1280);
    await page.fill('#f-name', 'Electricity'); await page.keyboard.press('Enter');
    await page.locator('.meter input[id^="rv-"]').fill('100'); await page.keyboard.press('Enter');
    ok('Enter saves the reading', (await page.locator('.meter .r-row').count()) === 1);
    ok('desktop: two columns', await page.evaluate(() => { const a = document.querySelector('.col-a').getBoundingClientRect(), b = document.querySelector('.col-b').getBoundingClientRect(); return b.left > a.right - 1 && Math.abs(a.top - b.top) < 2; }));
    await page.context().close();

    // ---------- light theme and the switch ----------
    page = await open(browser, 390, { scheme: 'light' });
    const bg = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim());
    ok('light theme colours', bg === '#fff8ea', bg);
    const tog = page.locator('.theme-toggle');
    if (await tog.count()) { await tog.click(); ok('switch to dark', (await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim())) === '#22190a'); }
    else ok('theme switch exists', false);
    await page.context().close();

    // ---------- every width, filled in and empty ----------
    const full = await (async () => { const p = await open(browser, 1280); await bilalFull(p); await p.click('#quick .chip[data-name="Water"]'); await p.click('#f-save');
        const s = await p.evaluate(k => localStorage.getItem(k), KEY); await p.context().close(); return s; })();
    for (const w of (args.includes('--shots-only') ? [] : [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920])) {
        for (const scheme of ['dark', 'light']) {
            for (const st of [full, null]) {
                const p = await open(browser, w, { scheme, state: st || JSON.stringify({ meters: [] }) });
                if (st) { await p.locator('.meter').first().getByText('+ New meter, or the meter went back to 0?').click(); await p.click('#f-price-open'); await p.selectOption('#f-mode', 'steps'); await p.click('#f-fixed-open'); await p.click('#f-tax-open'); await p.click('#f-limit-open'); await p.locator('.meter .r-row').nth(1).getByText('Edit').click(); }
                const tag = w + ' ' + scheme + (st ? ' filled' : ' empty') + ': ';
                ok(tag + 'no horizontal scroll', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
                const sticks = await p.evaluate(() => [...document.querySelectorAll('main *')].filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.right > innerWidth + 1 || r.left < -1); }).map(e => e.className || e.tagName).slice(0, 3));
                ok(tag + 'nothing sticks out', !sticks.length, sticks.join(','));
                if (w <= 390) {
                    const clash = await p.evaluate(() => {
                        const els = [...document.querySelectorAll('main input:not([type=checkbox]):not([type=file]), main select, main button, main a.secondary')].filter(e => e.offsetParent).map(e => [e, e.getBoundingClientRect()]);
                        const out = [];
                        for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) { const a = els[i][1], b = els[j][1]; if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) out.push((els[i][0].id || els[i][0].textContent) + '/' + (els[j][0].id || els[j][0].textContent)); }
                        return out.slice(0, 3);
                    });
                    ok(tag + 'no controls overlap', !clash.length, clash.join('; '));
                    const cut = await p.evaluate(() => [...document.querySelectorAll('main input[placeholder]')].filter(e => e.offsetParent).filter(e => {
                        const c = document.createElement('canvas').getContext('2d'), cs = getComputedStyle(e); c.font = cs.fontSize + ' ' + cs.fontFamily;
                        return c.measureText(e.placeholder).width > e.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) + 1; }).map(e => e.id + ':' + e.placeholder));
                    ok(tag + 'placeholders fit', !cut.length, cut.join(', '));
                    const cutSel = await p.evaluate(() => [...document.querySelectorAll('main select')].filter(e => e.offsetParent).filter(e => {
                        const c = document.createElement('canvas').getContext('2d'), cs = getComputedStyle(e); c.font = cs.fontSize + ' ' + cs.fontFamily;
                        return c.measureText(e.options[e.selectedIndex].text).width > e.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 24; }).map(e => e.id + ':' + e.options[e.selectedIndex].text));
                    ok(tag + 'dropdown text fits', !cutSel.length, cutSel.join(', '));
                }
                if (w >= 900) {
                    for (const pos of [0, 0.5, 1]) {
                        await p.evaluate(f => scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * f), pos);
                        const o = await p.evaluate(() => { const kids = [...document.querySelector('main').children].filter(e => e.offsetParent && getComputedStyle(e).display !== 'contents'); const r = kids.map(e => e.getBoundingClientRect()), out = [];
                            for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) if (Math.min(r[i].right, r[j].right) - Math.max(r[i].left, r[j].left) > 1 && Math.min(r[i].bottom, r[j].bottom) - Math.max(r[i].top, r[j].top) > 1) out.push(kids[i].className + '/' + kids[j].className); return out; });
                        ok(tag + 'no overlap at scroll ' + pos, !o.length, o.join('; '));
                    }
                }
                if (st && [320, 390, 820, 1280].includes(w) && scheme === 'dark') {
                    await p.evaluate(() => scrollTo(0, 0));
                    await p.locator('.help-btn, button:has-text("Help")').first().click();
                    const d = p.locator('dialog.help');
                    const box = await d.boundingBox();
                    ok(tag + 'help opens inside the screen', box && box.x >= 0 && box.y >= 0 && box.x + box.width <= w + 1 && (await d.innerText()).includes('How to use the Meter Reading Log'));
                    await p.keyboard.press('Escape'); ok(tag + 'Escape closes help', !(await d.evaluate(e => e.open)));
                    await p.locator('.help-btn, button:has-text("Help")').first().click(); await p.locator('.help-close').click(); ok(tag + 'Got it closes help', !(await d.evaluate(e => e.open)));
                }
                ok(tag + 'no errors', !p.errors.length && !p.bad.length, p.errors.concat(p.bad).join('; '));
                await p.context().close();
            }
        }
    }

    // ---------- screenshots ----------
    if (args.includes('--shots') || args.includes('--shots-only')) {
        let p = await open(browser, 1280, { state: full });
        await p.evaluate(() => scrollTo(0, 0));
        await p.screenshot({ path: path.join(DIR, 'screenshots/desktop.png'), fullPage: false, clip: { x: 0, y: 0, width: 1280, height: 1180 } }).catch(async () => p.screenshot({ path: path.join(DIR, 'screenshots/desktop.png') }));
        await p.context().close();
        p = await open(browser, 390, { state: full, scale: 2 });
        const top = await p.locator('.meter').first().evaluate(e => e.getBoundingClientRect().top + scrollY);
        await p.evaluate(y => scrollTo(0, y - 12), top);
        await p.screenshot({ path: path.join(DIR, 'screenshots/phone.png') });
        await p.context().close();
    }
    await browser.close();
    console.log(pass + ' passed, ' + fail + ' failed');
    process.exitCode = fail ? 1 : 0;
})();
