// Drives the real page in headless Chromium. Run from the repo root:
//   node lpg-gas-cylinder-refill-log/ui-test.js [--base http://localhost:8765] [--shots]
// --base defaults to a local server you start yourself (python3 -m http.server 8765 in the repo root).
// --shots also saves screenshots/desktop.png and screenshots/phone.png.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const args = process.argv.slice(2);
const bi = args.indexOf('--base'), BASE = (bi >= 0 ? args[bi + 1] : 'http://localhost:8765').replace(/\/$/, '');
const URL = BASE + '/lpg-gas-cylinder-refill-log/';
const KEY = 'lpg-gas-cylinder-refill-log.state';
const DIR = __dirname;
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; if (!cond) console.log('FAIL ' + name + (extra ? '  ' + extra : '')); };
const NOW = new Date('2026-10-27T10:00:00');
const AYESHA = [['2026-05-15', '2832'], ['2026-06-10', '2,832'], ['2026-07-06', '2832'], ['2026-07-24', '2950'], ['2026-08-19', '3068'], ['2026-09-14', '3162.40'], ['2026-10-10', '3 162.40']];

async function open(browser, width, opts) {
    opts = opts || {};
    const ctx = await browser.newContext({ viewport: { width, height: width < 600 ? 800 : 900 }, deviceScaleFactor: opts.scale || 1, colorScheme: opts.scheme || 'dark', locale: 'en-GB', acceptDownloads: true });
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE }).catch(() => {});
    const page = await ctx.newPage();
    await page.clock.setFixedTime(NOW);
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
const box = (page, name) => page.locator('.cyl', { has: page.locator('.c-name', { hasText: name }) });
async function addCyl(page, name, o) {
    o = o || {};
    await page.fill('#f-name', name);
    if (o.size) await page.selectOption('#f-size', o.size);
    if (o.other) { await page.fill('#f-osize', o.other); if (o.unit) await page.selectOption('#f-ounit', o.unit); }
    if (o.lead != null) await page.selectOption('#f-lead', String(o.lead));
    if (o.spare) await page.check('#f-spare');
    if (o.usual) { await page.click('#f-usual-open'); await page.fill('#f-usual', o.usual); }
    await page.click('#f-save');
}
async function logRefill(page, name, d, price, g) {
    const b = box(page, name);
    await b.locator('input[id^="rd-"]').fill(d);
    if (g != null) await b.locator('input[id^="rg-"]').fill(g);
    if (price != null) await b.locator('input[id^="rc-"]').fill(price);
    await b.locator('.save-r').click();
}
async function ayesha(page) {
    await page.click('#quick .chip[data-name="Kitchen"]');
    await page.click('#f-save');
    for (const [d, c] of AYESHA) await logRefill(page, 'Kitchen', d, c);
}
async function heater(page) {
    await addCyl(page, 'Heater', { usual: '14' });
    await logRefill(page, 'Heater', '2026-10-20', '1608', '6');
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
            document.querySelectorAll('main, .app, .col-a, .col-b, .c-list').forEach(par => {
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

    // ---------- first use and the main situation ----------
    let page = await open(browser, 390);
    ok('first use: intro shown', await page.locator('#intro').isVisible());
    ok('first use: no cylinder boxes', !(await page.locator('#cyls').isVisible()));
    ok('title', (await page.title()).startsWith('LPG Gas Cylinder Refill Log'));
    ok('h1', (await txt(page, 'h1')) === 'LPG Gas Cylinder Refill Log');
    ok('optional usual days hidden', !(await page.locator('#f-usual-box').isVisible()) && await page.locator('#f-usual-open').isVisible());
    ok('other size hidden', !(await page.locator('#f-osize-box').isVisible()));
    await page.click('#f-save');
    ok('blank name refused', (await txt(page, '#f-name-err')).includes('Type a name'));
    await page.fill('#f-name', '   '); await page.click('#f-save');
    ok('spaces-only name refused', (await page.locator('.cyl').count()) === 0);
    // other size: blank and bad amounts
    await page.selectOption('#f-size', 'other');
    ok('other size shows its box', await page.locator('#f-osize').isVisible());
    await page.fill('#f-name', 'Camping'); await page.click('#f-save');
    ok('other size blank refused', (await txt(page, '#f-osize-err')).length > 0);
    await page.fill('#f-osize', '-3'); await page.click('#f-save');
    ok('other size negative refused', (await txt(page, '#f-osize-err')).includes('minus'));
    await page.fill('#f-osize', '0'); await page.click('#f-save');
    ok('other size zero refused', (await txt(page, '#f-osize-err')).includes('bigger than 0'));
    await page.click('#f-usual-open'); await page.fill('#f-usual', '0'); await page.fill('#f-osize', '3'); await page.click('#f-save');
    ok('usual 0 days refused', (await txt(page, '#f-usual-err')).includes('at least 1'));
    await page.fill('#f-usual', '2.5'); await page.click('#f-save');
    ok('usual 2.5 days refused', (await txt(page, '#f-usual-err')).includes('whole number'));
    await page.fill('#f-usual', ''); await page.selectOption('#f-size', '11800|kg'); await page.fill('#f-name', '');
    ok('form resets cleanly', (await page.locator('.cyl').count()) === 0);

    await page.click('#quick .chip[data-name="Kitchen"]');
    ok('quick pick fills the name', (await page.inputValue('#f-name')) === 'Kitchen');
    await page.click('#f-save');
    ok('cylinder added with nothing optional', (await page.locator('.cyl').count()) === 1);
    ok('focus moves to the refill date', await page.evaluate(() => document.activeElement && document.activeElement.id.startsWith('rd-')));
    ok('start here', (await txt(page, '.cyl .res')).includes('Start here'));
    ok('heading: log the cylinder in use now', (await txt(page, '.cyl .log h3')).includes('in use now'));
    ok('date defaults to today', (await box(page, 'Kitchen').locator('input[id^="rd-"]').inputValue()) === '2026-10-27');
    // bad refills
    const K = box(page, 'Kitchen');
    await K.locator('input[id^="rd-"]').fill('2026-10-28'); await K.locator('.save-r').click();
    ok('future date refused', (await K.locator('[id^="rd-"][id$="-err"]').innerText()).includes('future'));
    await K.locator('input[id^="rd-"]').fill('2026-05-15');
    await K.locator('input[id^="rg-"]').fill('abc'); await K.locator('.save-r').click();
    ok('words as gas refused', (await K.locator('[id^="rg-"][id$="-err"]').innerText()).includes('11.8'));
    await K.locator('input[id^="rg-"]').fill('20'); await K.locator('.save-r').click();
    ok('more than the cylinder holds refused', (await K.locator('[id^="rg-"][id$="-err"]').innerText()).includes('more than this cylinder'));
    await K.locator('input[id^="rg-"]').fill('');
    await K.locator('input[id^="rc-"]').fill('-5'); await K.locator('.save-r').click();
    ok('negative price refused', (await K.locator('[id^="rc-"][id$="-err"]').innerText()).includes('minus'));
    await K.locator('input[id^="rc-"]').fill('9999999999999'); await K.locator('.save-r').click();
    ok('huge price refused', (await K.locator('[id^="rc-"][id$="-err"]').innerText()).includes('too big'));
    await K.locator('input[id^="rc-"]').fill('');
    ok('nothing saved after errors', (await saved(page)).cyls[0].refills.length === 0);
    // the first refill with Enter in the price box
    await K.locator('input[id^="rc-"]').fill('2832'); await K.locator('input[id^="rc-"]').press('Enter');
    ok('Enter saves the refill', (await saved(page)).cyls[0].refills.length === 1);
    ok('learning after one refill', (await txt(page, '.cyl .res')).includes('In use since 15 May') && (await txt(page, '.cyl .res')).includes('165 days'));
    for (const [d, c] of AYESHA.slice(1)) await logRefill(page, 'Kitchen', d, c);
    await logRefill(page, 'Kitchen', '2026-10-10', '1');
    ok('same day twice refused', (await K.locator('[id^="rd-"][id$="-err"]').innerText()).includes('already a refill'));
    await K.locator('input[id^="rc-"]').fill('');
    let res = await txt(page, '.cyl .res');
    ok('likely empty Thu 5 Nov', res.includes('Thu 5 Nov'), res);
    ok('in 9 days', res.includes('In 9 days, put on 10 Oct (17 days ago)'), res);
    ok('get a refill by Tue 3 Nov', res.includes('Get a refill by Tue 3 Nov'), res);
    ok('in 7 days, 2 days before', res.includes('In 7 days, 2 days before it should run out.'), res);
    ok('about 4.1 kg left (35%)', res.includes('About 4.1 kg left (35%)'), res);
    ok('usually lasts 26 days', res.includes('usually lasts 26 days (0.45 kg a day, from your last 3 cylinders)'), res);
    let money = await txt(page, '.cyl .money');
    ok('price 268 a kg up 12% since 15 May', money.includes('268 a kg (10 Oct), up 12% since 15 May (240 a kg)'), money);
    ok('3,649 a month', money.includes('about 3,649 a month'), money);
    ok('spent this month and year', money.includes('3,162.40 this month (1 refill), 20,838.80 in 2026 (7 refills)'), money);
    ok('6 Jul refill flagged, only that one', (await page.locator('.cyl .r-flag').count()) === 1);
    ok('flag text names the refill', (await page.locator('.cyl .r-flag').innerText()).includes('8 days sooner than usual (usual 26 days)'));
    ok('six rows then Show all', (await page.locator('.cyl .r-row').count()) === 6 && await page.getByText('Show all 7 refills').isVisible());
    await page.getByText('Show all 7 refills').click();
    ok('show all', (await page.locator('.cyl .r-row').count()) === 7);
    ok('no box-level flag (the newest are normal)', (await page.locator('.cyl > .flag').count()) === 0);
    ok('rows: full and lasted', (await txt(page, '.cyl .r-row:nth-child(2)')).includes('11.8 kg (full), 3,162.40') && (await txt(page, '.cyl .r-row:nth-child(2)')).includes('Lasted 26 days'));

    // currency symbol
    await page.selectOption('#cur', 'Rs');
    ok('currency Rs', (await txt(page, '.cyl .money')).includes('Rs 3,649 a month'));
    ok('currency tag beside the price', (await K.locator('.cur-tag').first().innerText()) === 'Rs');
    // copy, email, calendar
    await K.getByRole('button', { name: 'Copy summary' }).click();
    await page.waitForTimeout(300);
    ok('copied message', (await K.locator('.msg').innerText()).includes('Copied'));
    const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
    ok('copied text has the answer', clip.includes('Likely empty around Thu 5 Nov (in 9 days).') && clip.includes('Get a refill by Tue 3 Nov.'), clip.slice(0, 200));
    const href = await K.getByRole('link', { name: 'Email' }).getAttribute('href');
    ok('email link with no address', href.startsWith('mailto:?subject=') && decodeURIComponent(href).includes('Rs 3,649 a month'));
    const [dl] = await Promise.all([page.waitForEvent('download'), K.getByRole('button', { name: 'Add reminder to calendar' }).click()]);
    const ics = fs.readFileSync(await dl.path(), 'utf8');
    ok('calendar file for 3 Nov', dl.suggestedFilename() === 'lpg-refill-kitchen.ics' && ics.includes('DTSTART;VALUE=DATE:20261103') && ics.includes('SUMMARY:Get an LPG refill: Kitchen'), ics.slice(0, 300));

    // ran out today, then undo
    await K.getByRole('button', { name: 'It ran out today' }).click();
    ok('empty since today', (await txt(page, '.cyl .res')).includes('Empty since Tue 27 Oct'));
    ok('no ran-out button when empty', (await K.getByRole('button', { name: 'It ran out today' }).count()) === 0);
    await page.locator('.cyl .undo').click();
    ok('undo ran out', (await txt(page, '.cyl .res')).includes('Thu 5 Nov'));

    // edit a refill: the price, then the day it ran out
    await K.getByRole('button', { name: 'Edit the refill of 10 Oct 2026' }).click();
    ok('edit focuses the date', await page.evaluate(() => document.activeElement.id.startsWith('ed-')));
    await page.locator('input[id^="ec-"]').fill('3300');
    await page.locator('input[id^="ec-"]').press('Enter');
    ok('edited price shows', (await txt(page, '.cyl .money')).includes('Rs 279.66 a kg (10 Oct), up 17% since 15 May'), await txt(page, '.cyl .money'));
    await K.getByRole('button', { name: 'Edit the refill of 14 Sept 2026' }).click();
    await page.locator('input[id^="eo-"]').fill('2026-10-12');
    await page.getByRole('button', { name: 'Save changes' }).click();
    ok('ran out after the next refill refused', (await page.locator('[id^="eo-"][id$="-err"]').innerText()).includes('next refill'));
    await page.locator('input[id^="eo-"]').fill('2026-10-08');
    await page.getByRole('button', { name: 'Save changes' }).click();
    ok('ran out 8 Oct, 2 days without gas', (await txt(page, '.cyl .r-list')).includes('Ran out 8 Oct after 24 days; 2 days without gas'));
    await K.getByRole('button', { name: 'Edit the refill of 24 Jul 2026' }).click();
    await page.keyboard.press('Escape');
    ok('Escape cancels the edit', (await page.locator('.r-row.editing').count()) === 0);
    // delete a refill and undo
    await K.getByRole('button', { name: 'Delete the refill of 10 Oct 2026' }).click();
    ok('deleted: the 14 Sep one is the newest', (await saved(page)).cyls[0].refills.length === 6 && (await txt(page, '.cyl .res')).includes('Empty since'));
    await page.locator('.cyl .undo').click();
    ok('undo delete', (await saved(page)).cyls[0].refills.length === 7);

    // a heater with a typed usual and a partial refill
    await heater(page);
    const H = box(page, 'Heater');
    ok('heater added as its own box', (await page.locator('.cyl').count()) === 2);
    res = await H.locator('.res').innerText();
    ok('heater: 6 kg at 14 days a cylinder: empty today', res.includes('Tue 27 Oct') && res.includes('Get a refill today'), res);
    ok('heater: from the days you typed', res.includes('from the days you typed'));
    ok('heater: partial shown as 6 kg', (await H.locator('.r-row').innerText()).includes('6 kg, Rs 1,608'));
    ok('heater: month and year said once', (await H.locator('.money').innerText()).includes('this month and this year'));

    // spare cylinder via Edit cylinder
    await H.getByRole('button', { name: 'Edit cylinder' }).click();
    ok('edit fills the form', (await page.inputValue('#f-name')) === 'Heater' && (await page.inputValue('#f-usual')) === '14' && (await txt(page, '#add-h')) === 'Edit Heater');
    await page.check('#f-spare'); await page.click('#f-save');
    ok('spare: swap message', (await H.locator('.res').innerText()).includes('Swap to the spare'));
    ok('spare tag', (await H.locator('.c-top').innerText()).includes('with a spare'));
    // edit to a size too small for a typed refill
    await H.getByRole('button', { name: 'Edit cylinder' }).click();
    await page.selectOption('#f-size', 'other'); await page.fill('#f-osize', '4'); await page.click('#f-save');
    ok('too small size refused', (await txt(page, '#add-msg')).includes('more gas than this size holds'));
    await page.click('#f-cancel');

    // reload keeps everything
    await page.reload();
    ok('reload keeps both cylinders', (await page.locator('.cyl').count()) === 2 && (await txt(page, '.cyl .res')).includes('Wed 4 Nov'));
    ok('reload keeps the currency', (await page.inputValue('#cur')) === 'Rs');

    // delete a cylinder, undo; delete everything, undo
    await H.getByRole('button', { name: 'Delete cylinder' }).click();
    ok('cylinder deleted', (await page.locator('.cyl').count()) === 1 && (await txt(page, '#top-msg')).includes('Deleted Heater'));
    await page.locator('#top-msg .undo').click();
    ok('undo cylinder delete', (await page.locator('.cyl').count()) === 2);
    // backup, then delete everything, then restore
    const [bk] = await Promise.all([page.waitForEvent('download'), page.click('#backup')]);
    const bkPath = path.join(require('os').tmpdir(), 'lpg-backup.json'); await bk.saveAs(bkPath);
    await page.click('#del-all');
    ok('delete everything', (await page.locator('.cyl').count()) === 0 && await page.locator('#intro').isVisible());
    await page.locator('#tools-msg .undo').click();
    ok('undo delete everything', (await page.locator('.cyl').count()) === 2);
    await page.click('#del-all');
    const bad = path.join(require('os').tmpdir(), 'lpg-bad.json'); fs.writeFileSync(bad, '{"hello":1}');
    await page.setInputFiles('#restore-file', bad); await page.waitForTimeout(300);
    ok('bad backup refused', (await txt(page, '#add-msg')).includes('not a backup'));
    await page.setInputFiles('#restore-file', bkPath);
    await page.waitForTimeout(200);
    ok('restore brings both back', (await page.locator('.cyl').count()) === 2 && (await txt(page, '.cyl .res')).includes('Wed 4 Nov'));
    // very long name
    await page.fill('#f-name', 'x'.repeat(60)); await page.click('#f-save');
    ok('long name kept to 40', (await saved(page)).cyls[2].name.length === 40);
    ok('long name wraps inside its box', (await layout(page)).length === 0, (await layout(page)).join());
    ok('no console errors (main run)', !page.errors.length, page.errors.join(' | '));
    ok('no failed requests (main run)', !page.bad.length, page.bad.join(' | '));
    const full = JSON.stringify(await saved(page));
    await page.context().close();

    // ---------- corrupt and blocked storage ----------
    page = await open(browser, 390, { state: '{not json' });
    ok('corrupt state: starts fresh', await page.locator('#intro').isVisible() && !page.errors.length);
    await page.context().close();
    page = await open(browser, 390, { state: JSON.stringify({ v: 1, cur: 'Rs', cyls: [{ name: 'K', size: 11800, unit: 'kg', refills: [{ d: 'bad' }, { d: '2026-10-01', g: -5 }, { d: '2026-10-02', c: 100000 }] }, { name: 5 }] }) });
    ok('half-bad state: keeps the good parts', (await page.locator('.cyl').count()) === 1 && (await page.locator('.cyl .r-row').count()) === 1 && !page.errors.length);
    await page.context().close();
    page = await open(browser, 390, { block: true });
    ok('blocked storage: warning shown', await page.locator('#store-warn').isVisible());
    await page.click('#quick .chip[data-name="Kitchen"]'); await page.click('#f-save');
    ok('blocked storage: still works', (await page.locator('.cyl').count()) === 1 && !page.errors.length, page.errors.join());
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
        ok('help opens inside the screen at ' + w, r && r.x >= 0 && r.x + r.width <= w + 1 && (await dlg.innerText()).includes('How to use the LPG Gas Cylinder Refill Log'));
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
            // every optional field open and a refill being edited
            await page.selectOption('#f-size', 'other'); await page.click('#f-usual-open');
            await box(page, 'Kitchen').getByRole('button', { name: 'Edit the refill of 10 Oct 2026' }).click();
            l = await layout(page);
            ok(scheme + ' ' + w + ' all fields open: no overflow', !l.length, l.join(' | '));
            const c = await controlsOverlap(page);
            ok(scheme + ' ' + w + ' no controls overlap', !c.length, c.join(' | '));
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
        const demo = { v: 1, cur: 'Rs', cyls: [{ id: 'k', name: 'Kitchen', size: 11800, unit: 'kg', lead: 2, spare: false,
            refills: AYESHA.map(([d, c], i) => ({ id: 'r' + i, d, c: Math.round(Number(c.replace(/[ ,]/g, '')) * 100) })) },
            { id: 'h', name: 'Heater', size: 11800, unit: 'kg', lead: 2, spare: false, usual: 14, refills: [{ id: 'p', d: '2026-10-20', g: 6000, c: 160800 }] }] };
        page = await open(browser, 1280, { state: JSON.stringify(demo) });
        await page.screenshot({ path: path.join(DIR, 'screenshots/desktop.png') });
        await page.context().close();
        page = await open(browser, 390, { state: JSON.stringify(demo), scale: 2 });
        await page.setViewportSize({ width: 390, height: 1150 });
        await page.screenshot({ path: path.join(DIR, 'screenshots/phone.png') });
        await page.context().close();
    }
    await browser.close();
    console.log(pass + ' passed, ' + fail + ' failed');
    if (fail) process.exitCode = 1;
})();
