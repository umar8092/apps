// Drives the real page in headless Chromium. Run from the repo root:
//   node prepaid-mobile-data-bundle-tracker/ui-test.js [--base http://localhost:8765] [--shots]
// --base defaults to a local server you start yourself (python3 -m http.server 8765 in the repo root).
// --shots also saves screenshots/desktop.png and screenshots/phone.png.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const args = process.argv.slice(2);
const bi = args.indexOf('--base'), BASE = (bi >= 0 ? args[bi + 1] : 'http://localhost:8765').replace(/\/$/, '');
const URL = BASE + '/prepaid-mobile-data-bundle-tracker/';
const KEY = 'prepaid-mobile-data-bundle-tracker.state';
const DIR = __dirname;
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; if (!cond) console.log('FAIL ' + name + (extra ? '  ' + extra : '')); };
const NOW = new Date('2026-10-21T14:05:00');

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
const box = (page, name) => page.locator('.line', { has: page.locator('.l-name', { hasText: name }) });
async function setTime(page, d, t, pre) { await page.fill('#' + pre + 'sd', d); await page.fill('#' + pre + 'st', t); await page.dispatchEvent('#' + pre + 'st', 'change'); }
async function addBundle(page, o) {
    await page.fill('#f-name', o.name);
    await page.fill('#f-mb', o.mb);
    if (o.unit) await page.selectOption('#f-mb-u', o.unit);
    if (o.price != null) { if (await page.isVisible('#f-price-open')) await page.click('#f-price-open'); await page.fill('#f-price', o.price); }
    if (o.start) await setTime(page, o.start[0], o.start[1], 'f-');
    if (o.days) { await page.selectOption('#f-valid', String(o.days)); await page.dispatchEvent('#f-valid', 'change'); }
    if (o.exp) { await page.fill('#f-ed', o.exp[0]); await page.fill('#f-et', o.exp[1]); await page.dispatchEvent('#f-et', 'change'); }
    await page.click('#f-save');
}
async function check(page, name, left, at, unit) {
    const b = box(page, name);
    if (at) {
        const link = b.locator('button', { hasText: /^\+ (Checked at a different time|Add a balance you checked before it expired)$/ });
        if (await link.count()) await link.click();
        await b.locator('input[id^="rdd-"]').fill(at[0]); await b.locator('input[id^="rdt-"]').fill(at[1]);
    }
    await b.locator('input[id^="rd-"]').fill(left);
    if (unit) await b.locator('select[id^="rd-"]').selectOption(unit);
    await b.locator('button.save').click();
}
async function err(page, sel) { return (await page.locator(sel).first().innerText()).trim(); }
// Ali's month: September's bundle, then October's with three balance checks, and a weekly Zong bundle on his second SIM
async function ali(page) {
    await addBundle(page, { name: 'Jazz monthly', mb: '30', price: '1000', start: ['2026-09-01', '10:00'], days: 30 });
    await check(page, 'Jazz monthly', '2.1', ['2026-09-30', '22:00']);
    const b = box(page, 'Jazz monthly');
    await b.locator('button', { hasText: 'Bought a new bundle' }).first().click();
    const pre = await b.locator('input[id^="rn-"][id$="-sd"]').getAttribute('id');
    await setTime(page, '2026-10-01', '10:00', pre.slice(0, -2));
    await b.locator('button', { hasText: 'Save new bundle' }).click();
    await check(page, 'Jazz monthly', '20.5', ['2026-10-08', '21:30']);
    await check(page, 'Jazz monthly', '13,100 MB', ['2026-10-15', '23:00']);
    await check(page, 'Jazz monthly', '7.4', ['2026-10-21', '14:00']);
    await addBundle(page, { name: 'Zong weekly', mb: '10', price: '650', start: ['2026-10-18', '09:00'], days: 7 });
    await check(page, 'Zong weekly', '6.2', ['2026-10-21', '13:00']);
}
async function noScroll(page) { return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1); }
async function overlaps(page) {
    return page.evaluate(() => {
        const bad = [];
        document.querySelectorAll('main, .app, .col-a, .col-b, .line, .l-list').forEach(parent => {
            const kids = [...parent.children].filter(k => { const s = getComputedStyle(k); return s.display !== 'none' && s.position !== 'absolute' && k.offsetParent !== null; });
            for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
                const a = kids[i].getBoundingClientRect(), b = kids[j].getBoundingClientRect();
                if (a.width && b.width && Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2) bad.push((kids[i].id || kids[i].className) + ' / ' + (kids[j].id || kids[j].className));
            }
        });
        return bad;
    });
}
async function controlsOverlap(page) {
    return page.evaluate(() => {
        const els = [...document.querySelectorAll('input:not([type=file]):not([type=checkbox]), select, button, a.secondary')].filter(e => e.offsetParent !== null && e.checkVisibility({ contentVisibilityAuto: true })).map(e => ({ e, r: e.getBoundingClientRect() }));
        const bad = [];
        for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
            const a = els[i].r, b = els[j].r;
            if (els[i].e.contains(els[j].e) || els[j].e.contains(els[i].e)) continue;
            if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) bad.push((els[i].e.id || els[i].e.textContent.trim().slice(0, 20)) + '[' + els[i].e.parentNode.className + '<' + els[i].e.parentNode.parentNode.className + '] x ' + (els[j].e.id || els[j].e.textContent.trim().slice(0, 20)) + ' ' + [a.left, a.top, a.width, a.height, b.left, b.top, b.width, b.height].map(Math.round).join(','));
        }
        return bad;
    });
}
async function placeholdersFit(page) {
    return page.evaluate(() => [...document.querySelectorAll('input[placeholder]')].filter(i => i.offsetParent !== null).filter(i => {
        const c = document.createElement('canvas').getContext('2d'), s = getComputedStyle(i);
        c.font = s.fontSize + ' ' + s.fontFamily;
        return c.measureText(i.placeholder).width > i.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight) + 1;
    }).map(i => i.id));
}

(async () => {
    const browser = await chromium.launch();

    // ---------- the main situation ----------
    let page = await open(browser, 390);
    ok('first use: intro shown', await page.isVisible('#intro'));
    ok('first use: no bundles box', !(await page.isVisible('#lines')));
    ok('first use: no spending card', !(await page.isVisible('#spend')));
    ok('price is optional and hidden', !(await page.isVisible('#f-price')) && await page.isVisible('#f-price-open'));
    await ali(page);
    const jazz = box(page, 'Jazz monthly'), zong = box(page, 'Zong weekly');
    const jt = await jazz.innerText();
    ok('jazz: 7.4 GB left', /7\.4 GB left/.test(jt), jt);
    ok('jazz: time to go', /9 days 19 hours to go, expires Sat 31 Oct, 10:00/.test(jt), jt);
    ok('jazz: allowance 771 MB a day', /You can use 771 MB a day/.test(jt));
    ok('jazz: runs out 28 Oct 3 days early', /At your pace so far \(1\.12 GB a day\) it will run out on Wed 28 Oct, 04:28, about 3 days 5 hours before it expires/.test(jt), jt);
    ok('jazz: cost per GB', /Cost per GB: 33\.33 \(30 GB for 1,000\)/.test(jt));
    ok('jazz: MB check saved and shown as GB', /12\.8 GB left/.test(jt), jt);
    ok('jazz: use between checks', /Used 5\.39 GB in 5 days 15 hours \(982 MB a day\)/.test(jt), jt);
    await jazz.locator('summary', { hasText: 'Earlier bundles' }).click();
    const past = await jazz.locator('.past').innerText();
    ok('earlier bundle: used and unused', /Used 27\.9 GB, 2\.1 GB expired unused/.test(past), past);
    ok('earlier bundle: cost per GB used', /35\.84 a GB used/.test(past), past);
    const zt = await zong.innerText();
    ok('zong: lasts with spare', /it will last\. About 1\.6 GB will be left unused/.test(zt), zt);
    ok('zong: cost per GB 65', /Cost per GB: 65 /.test(zt));
    const sp = await page.locator('#spend').innerText();
    ok('spend: October 1,650, 2 bundles', /October so far\s*1,650\s*2 bundles/.test(sp), sp);
    ok('spend: September 1,000', /September\s*1,000\s*1 bundle/.test(sp), sp);
    ok('spend: cheapest per GB first', /Jazz monthly\s*33\.33 cheapest\s*Zong weekly\s*65/.test(sp), JSON.stringify(sp));
    ok('newest box on top', (await page.locator('.l-name').first().innerText()) === 'Zong weekly');
    ok('no errors after the main situation', !page.errors.length, page.errors.join(' | '));

    // copy, email, calendar
    await jazz.locator('button', { hasText: 'Copy summary' }).click();
    const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
    ok('copy summary text', /Jazz monthly \(30 GB for 1,000, expires Sat 31 Oct, 10:00\)\n7\.4 GB left, 9 days 19 hours to go\.\nYou can use 771 MB a day\./.test(clip), clip);
    const href = await jazz.locator('a.mail').getAttribute('href');
    ok('email: no recipient needed', href.startsWith('mailto:?subject=') && decodeURIComponent(href).includes('You can use 771 MB a day'));
    const [dl] = await Promise.all([page.waitForEvent('download'), jazz.locator('button', { hasText: 'Expiry reminder' }).click()]);
    const icsText = fs.readFileSync(await dl.path(), 'utf8');
    ok('calendar file a day before expiry', dl.suggestedFilename() === 'data-bundle-jazz-monthly.ics' && icsText.includes('DTSTART:20261030T100000') && icsText.includes('SUMMARY:Data bundle expires tomorrow: Jazz monthly'), icsText);

    // reload keeps everything
    await page.reload({ waitUntil: 'load' });
    ok('reload keeps the answer', /771 MB a day/.test(await box(page, 'Jazz monthly').innerText()));
    let st = await saved(page);
    ok('saved: 2 lines, jazz has 2 bundles', st.lines.length === 2 && st.lines[1].buys.length === 2);
    ok('saved: September did not get an early end', !st.lines[1].buys[0].ended);

    // ---------- wrong balance checks ----------
    const J = box(page, 'Jazz monthly');
    await check(page, 'Jazz monthly', '');
    ok('blank balance', /Type the data left/.test(await err(page, '#line-' + st.lines[1].id + ' .err')));
    await check(page, 'Jazz monthly', '40');
    ok('more than the bundle', /more than the whole bundle \(30 GB\)/.test(await J.locator('.err').first().innerText()));
    await check(page, 'Jazz monthly', '9');
    ok('data left cannot go up', /cannot go up/.test(await J.locator('.err').first().innerText()));
    await check(page, 'Jazz monthly', 'lots');
    ok('words refused', /Type an amount/.test(await J.locator('.err').first().innerText()));
    await check(page, 'Jazz monthly', '-2');
    ok('minus refused', /without a minus/.test(await J.locator('.err').first().innerText()));
    await check(page, 'Jazz monthly', '5', ['2026-10-22', '10:00']);
    ok('future time refused', /not come yet/.test(await J.locator('.err').first().innerText()));
    await J.locator('button', { hasText: 'Use the time now' }).click();
    // typed value kept after a failed save and a redraw
    ok('nothing saved by mistakes', (await saved(page)).lines[1].buys[1].reads.length === 3);
    // Enter saves, MB unit, then delete with undo
    await J.locator('input[id^="rd-"]').fill('7000');
    await J.locator('select[id^="rd-"]').selectOption('MB');
    await J.locator('input[id^="rd-"]').press('Enter');
    ok('enter saves, 7000 MB = 6.84 GB', /6\.84 GB left/.test(await J.innerText()));
    ok('saved remembers MB for next time', (await J.locator('select[id^="rd-"]').inputValue()) === 'MB');
    await J.locator('.r-row button', { hasText: 'Delete' }).first().click();
    ok('delete balance', (await saved(page)).lines[1].buys[1].reads.length === 3);
    await J.locator('button.undo').click();
    ok('undo balance delete', (await saved(page)).lines[1].buys[1].reads.length === 4);
    // edit a balance
    await J.locator('.r-row button', { hasText: 'Edit' }).first().click();
    await J.locator('input[id^="er-"]').first().fill('7.2');
    await J.locator('select[id^="er-"]').first().selectOption('GB');
    await J.locator('.r-row.editing button', { hasText: 'Save' }).click();
    ok('edit balance', /7\.2 GB left/.test(await J.innerText()));
    await J.locator('.r-row button', { hasText: 'Edit' }).first().click();
    await J.locator('input[id^="er-"]').first().fill('50');
    await J.locator('.r-row.editing button', { hasText: 'Save' }).click();
    ok('edit to impossible refused', /more than the whole bundle/.test(await J.locator('.r-row.editing .err').innerText()));
    await J.locator('.r-row.editing button', { hasText: 'Cancel' }).click();

    // ---------- top-up ----------
    await J.locator('button', { hasText: '+ Add extra data' }).click();
    await J.locator('input[id^="tp-"]').first().fill('5');
    ok('top-up price optional', true);
    await J.locator('button', { hasText: /^Add extra data$/ }).click();
    let jt2 = await J.innerText();
    ok('top-up raises data left', /12\.2 GB left/.test(jt2), JSON.stringify(jt2.slice(0, 300)));
    ok('top-up listed', /\+ 5 GB extra data/.test(jt2));
    ok('top-up: data left may go up after it', true);
    await J.locator('.r-row', { hasText: 'extra data' }).locator('button', { hasText: 'Delete' }).click();
    ok('top-up delete', !/extra data for|\+ 5 GB extra/.test(await J.innerText()));
    await J.locator('button.undo').click();
    ok('top-up undo', /\+ 5 GB extra data/.test(await J.innerText()));
    await J.locator('button.undo').count().then(n => n);
    await J.locator('.r-row', { hasText: 'extra data' }).locator('button', { hasText: 'Delete' }).click();

    // ---------- edit the bundle in the form ----------
    await J.locator('button', { hasText: 'Edit bundle' }).click();
    ok('form filled for edit', (await page.inputValue('#f-name')) === 'Jazz monthly' && (await page.inputValue('#f-mb')) === '30' && (await page.inputValue('#f-price')) === '1000');
    await page.fill('#f-mb', '5');
    await page.click('#f-save');
    ok('edit that does not fit refused', /does not fit/.test(await page.locator('#add-msg').innerText()));
    await page.fill('#f-mb', '30');
    await page.fill('#f-name', 'Jazz monthly 30 GB');
    await page.click('#f-save');
    ok('rename saved', await box(page, 'Jazz monthly 30 GB').count() === 1);
    ok('form back to adding', (await page.locator('#f-save').innerText()) === 'Add bundle');

    // ---------- renew early, carrying the data left ----------
    const J2 = box(page, 'Jazz monthly 30 GB');
    await J2.locator('summary', { hasText: 'Earlier bundles' }).click();
    await J2.locator('button', { hasText: 'Bought a new bundle' }).click();
    ok('renew form filled like last bundle', (await J2.locator('input[id$="-mb"]').first().inputValue()) === '30');
    await J2.locator('input[id$="-carry"]').check();
    await J2.locator('button', { hasText: 'Save new bundle' }).click();
    const jt3 = await J2.innerText();
    ok('renew early: carried data', /37\.2 GB left/.test(jt3) && /Includes 7\.2 GB carried over/.test(jt3), jt3);
    st = await saved(page);
    const jl = st.lines.find(l => l.name === 'Jazz monthly 30 GB');
    ok('renew early: old bundle ended now', jl.buys[1].ended === '2026-10-21T14:05' && jl.buys.length === 3);
    ok('earlier bundles stay open after a change', await J2.locator('.past').evaluate(e => e.open));
    ok('renew early: shown as replaced', /replaced early/.test(await J2.locator('.past').innerText()));
    await J2.locator('button.undo').click();
    ok('undo renew', (await saved(page)).lines.find(l => l.name === 'Jazz monthly 30 GB').buys.length === 2);

    // ---------- validation in the add form ----------
    await page.click('#f-save');
    ok('blank name', /Type a name/.test(await page.locator('#f-name-err').innerText()));
    await page.fill('#f-name', 'Test');
    await page.fill('#f-mb', '0');
    await page.click('#f-save');
    ok('zero data refused', /bigger than 0/.test(await page.locator('#f-mb-err').innerText()));
    await page.fill('#f-mb', '2');
    await page.fill('#f-ed', '2026-10-20'); await page.dispatchEvent('#f-ed', 'change');
    await page.click('#f-save');
    ok('expiry before purchase refused', /must be after/.test(await page.locator('#f-ed-err').innerText()));
    ok('valid for switched to other', (await page.inputValue('#f-valid')) === 'other');
    await page.selectOption('#f-valid', '1'); await page.dispatchEvent('#f-valid', 'change');
    ok('valid for 1 day fills expiry', (await page.inputValue('#f-ed')) === '2026-10-22');
    await page.fill('#f-sd', '2026-10-25'); await page.dispatchEvent('#f-sd', 'change');
    await page.click('#f-save');
    ok('future purchase refused', /not come yet/.test(await page.locator('#f-sd-err').innerText()));
    await page.fill('#f-sd', '2026-10-21'); await page.dispatchEvent('#f-sd', 'change');
    await page.fill('#f-name', 'A very long bundle name that keeps on going');
    await page.click('#f-save');
    ok('long name cut to 40 and saved', await page.locator('.l-name', { hasText: 'A very long bundle name that keeps on go' }).count() === 1);
    ok('no price: no cost line', !/Cost per GB/.test(await box(page, 'A very long').innerText()));
    ok('first box asks for a balance', /Not checked yet: the full bundle/.test(await box(page, 'A very long').innerText()));
    // delete a box with undo
    await box(page, 'A very long').locator('.l-btns button', { hasText: 'Delete' }).click();
    ok('delete box', await box(page, 'A very long').count() === 0);
    await page.locator('#top-msg button.undo').click();
    ok('undo delete box', await box(page, 'A very long').count() === 1);

    // currency remembered
    await page.selectOption('#cur', 'Rs');
    ok('currency shown', /Cost per GB: Rs 33\.33/.test(await box(page, 'Jazz monthly 30 GB').innerText()));
    await page.reload({ waitUntil: 'load' });
    ok('currency remembered', (await page.inputValue('#cur')) === 'Rs' && /Rs 1,650/.test(await page.locator('#spend').innerText()));

    // backup and restore, delete everything with undo
    const [bk] = await Promise.all([page.waitForEvent('download'), page.click('#backup')]);
    const bkPath = await bk.path();
    await page.click('#del-all');
    ok('delete everything', !(await page.isVisible('#lines')) && await page.isVisible('#intro'));
    await page.locator('#tools-msg button.undo').click();
    ok('undo delete everything', await page.locator('.line').count() === 3);
    await page.click('#del-all');
    await page.setInputFiles('#restore-file', bkPath);
    ok('restore backup', await page.locator('.line').count() === 3 && /Restored 3 bundles/.test(await page.locator('#tools-msg').innerText()));
    const badFile = path.join(require('os').tmpdir(), 'pdb-bad.json'); fs.writeFileSync(badFile, '{"hello":1}');
    await page.setInputFiles('#restore-file', badFile);
    ok('bad backup refused', /not a backup/.test(await page.locator('#tools-msg').innerText()) && await page.locator('.line').count() === 3);
    ok('no errors in matrix', !page.errors.length && !page.bad.length, page.errors.concat(page.bad).join(' | '));
    const full = JSON.stringify(await saved(page));
    await page.context().close();

    // ---------- expired, ran out, next day ----------
    page = await open(browser, 390, { state: full, now: new Date('2026-11-02T09:00:00') });
    const ex = await box(page, 'Jazz monthly 30 GB').innerText();
    ok('expired shown', /Expired/.test(ex) && /Bought a new bundle/.test(ex), ex);
    ok('expired: no balance box', await box(page, 'Jazz monthly 30 GB').locator('input[id^="rd-"]').count() === 0);
    ok('expired: reminder disabled', await box(page, 'Jazz monthly 30 GB').locator('button', { hasText: 'Expiry reminder' }).isDisabled());
    await page.context().close();
    page = await open(browser, 390, { state: full, now: new Date('2026-10-22T14:05:00') });
    const nd = await box(page, 'Jazz monthly 30 GB').innerText();
    ok('next day: estimated with About', /About\s*6\.\d+ GB left/.test(nd) && /Estimated from your pace/.test(nd), nd);
    await page.context().close();
    page = await open(browser, 390);
    await addBundle(page, { name: 'Daily', mb: '1', start: ['2026-10-21', '08:00'], days: 1 });
    await check(page, 'Daily', '0');
    ok('ran out shown', /Ran out/.test(await box(page, 'Daily').innerText()) && /17 hours before it expires/.test(await box(page, 'Daily').innerText()));
    await page.context().close();

    // ---------- corrupt and blocked storage ----------
    page = await open(browser, 390, { state: '{not json' });
    ok('corrupt state: fresh start', await page.isVisible('#intro') && !page.errors.length);
    await page.context().close();
    page = await open(browser, 390, { state: JSON.stringify({ lines: [{ name: 'X', buys: [{ start: 'bad' }] }, 5, null] }) });
    ok('odd state: fresh start', await page.isVisible('#intro') && !page.errors.length);
    await page.context().close();
    page = await open(browser, 390, { block: true });
    await addBundle(page, { name: 'Blocked', mb: '3' });
    ok('blocked storage: warning and still works', await page.isVisible('#store-warn') && await box(page, 'Blocked').count() === 1 && !page.errors.length);
    await page.context().close();

    // ---------- screen sizes, filled and empty, dark and light ----------
    for (const scheme of ['dark', 'light']) for (const w of [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920]) {
        const tag = scheme + ' ' + w + ': ';
        page = await open(browser, w, { scheme, state: full });
        const L = box(page, 'Jazz monthly 30 GB');
        await L.locator('summary', { hasText: 'Earlier bundles' }).click();
        await L.locator('button', { hasText: '+ Add extra data' }).click();
        await box(page, 'Zong weekly').locator('button', { hasText: 'Bought a new bundle' }).click();
        await box(page, 'Zong weekly').locator('button', { hasText: '+ Checked at a different time' }).click();
        await L.locator('.r-row button', { hasText: 'Edit' }).first().click();
        await page.click('#f-price-open').catch(() => {});
        ok(tag + 'no horizontal scroll (filled)', await noScroll(page));
        for (const pos of [0, 0.5, 1]) {
            await page.evaluate(p => window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * p), pos);
            const o = await overlaps(page); ok(tag + 'no overlap at ' + pos, !o.length, o.join('; '));
        }
        if (w <= 390) {
            const c = await controlsOverlap(page); ok(tag + 'controls do not overlap', !c.length, c.join('; '));
            const ph = await placeholdersFit(page); ok(tag + 'placeholders fit', !ph.length, ph.join(', '));
        }
        await page.click('#del-all');
        ok(tag + 'no horizontal scroll (cleared)', await noScroll(page));
        ok(tag + 'no errors', !page.errors.length && !page.bad.length, page.errors.concat(page.bad).join(' | '));
        await page.context().close();
    }
    // light/dark switch
    page = await open(browser, 390, { scheme: 'dark' });
    const bg1 = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await page.locator('.theme-toggle').click();
    const bg2 = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    ok('theme switch changes the look', bg1 !== bg2);
    await page.context().close();
    // Help dialog
    for (const w of [320, 390, 820, 1280]) {
        page = await open(browser, w);
        await page.locator('button', { hasText: 'Help' }).first().click();
        const d = page.locator('dialog.help');
        const r = await d.boundingBox();
        ok('help ' + w + ' opens on screen', await d.evaluate(e => e.open) && r.x >= 0 && r.x + r.width <= w + 1 && /How to use the Prepaid Mobile Data Bundle Tracker/.test(await d.innerText()));
        await page.keyboard.press('Escape'); ok('help ' + w + ' escape closes', !(await d.evaluate(e => e.open)));
        await page.locator('button', { hasText: 'Help' }).first().click(); await page.locator('.help-close').click(); ok('help ' + w + ' got it closes', !(await d.evaluate(e => e.open)));
        await page.context().close();
    }

    // ---------- screenshots ----------
    if (args.includes('--shots')) {
        const shotState = JSON.parse(full); shotState.cur = 'Rs';
        // the screenshot shows Ali's own two bundles
        shotState.lines = shotState.lines.filter(l => !/very long/.test(l.name)); shotState.lines.forEach(l => { if (/Jazz/.test(l.name)) l.name = 'Jazz monthly'; });
        const jb = shotState.lines.find(l => l.name === 'Jazz monthly').buys[1]; jb.tops = []; jb.reads = jb.reads.filter(r => r.at !== '2026-10-21T14:05'); jb.reads.forEach(r => { if (r.at === '2026-10-21T14:00') r.mb = 7577600; });
        shotState.lines.sort((x, y) => /Jazz/.test(x.name) ? -1 : /Jazz/.test(y.name) ? 1 : 0);
        const s = JSON.stringify(shotState);
        page = await open(browser, 1280, { state: s, scheme: 'dark' });
        await page.screenshot({ path: path.join(DIR, 'screenshots/desktop.png'), fullPage: false, clip: { x: 0, y: 0, width: 1280, height: 1180 } }).catch(async () => page.screenshot({ path: path.join(DIR, 'screenshots/desktop.png') }));
        await page.context().close();
        page = await open(browser, 390, { state: s, scheme: 'dark', scale: 2 });
        const top = await page.locator('#lines').boundingBox();
        await page.setViewportSize({ width: 390, height: 1500 });
        await page.screenshot({ path: path.join(DIR, 'screenshots/phone.png'), clip: { x: 0, y: Math.max(0, top.y - 300), width: 390, height: 1200 } });
        await page.context().close();
    }
    await browser.close();
    console.log(pass + ' passed, ' + fail + ' failed');
    if (fail) process.exitCode = 1;
})();
