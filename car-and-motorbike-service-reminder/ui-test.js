// Drives the real page in headless Chromium: node ui-test.js [--shots] [--base https://umar8092.github.io/apps]
// Without --base it serves this repo on localhost. With --base it tests the LIVE page. The clock is Fri 23 Oct 2026, 10:00.
const pw = (() => { for (const m of ['playwright', 'playwright-core']) { try { return require(m); } catch (e) { /* next */ } } throw new Error('playwright not found'); })();
const path = require('path'), fs = require('fs'), http = require('http');
const bi = process.argv.indexOf('--base');
const shots = process.argv.includes('--shots');
let fail = 0, url;
const ok = (name, cond, extra) => { if (!cond) fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond || extra == null ? '' : '  -> ' + JSON.stringify(extra))); };
const NOW = new Date(2026, 9, 23, 10, 0);
const SLUG = 'car-and-motorbike-service-reminder', KEY = SLUG + '.state', UIKEY = SLUG + '.ui';
const nb = s => String(s).replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim();

function serve() {
    const ROOT = path.resolve(__dirname, '..');
    const types = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml', png: 'image/png', webmanifest: 'application/manifest+json' };
    return new Promise(res => {
        const s = http.createServer((req, rs) => {
            let p = decodeURIComponent(req.url.split('?')[0]).replace(/^\/apps/, ''); if (p.endsWith('/')) p += 'index.html';
            const f = path.join(ROOT, p);
            if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rs.writeHead(404); return rs.end('nf'); }
            rs.writeHead(200, { 'content-type': types[f.split('.').pop()] || 'application/octet-stream' }); rs.end(fs.readFileSync(f));
        }).listen(0, () => res(s));
    });
}

async function newPage(browser, opts) {
    opts = opts || {};
    const ctx = await browser.newContext({ viewport: { width: opts.w || 390, height: opts.h || 900 }, deviceScaleFactor: opts.scale || 1, colorScheme: opts.scheme || 'dark', acceptDownloads: true });
    if (opts.perms) await ctx.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
    await ctx.route(/gc\.zgo\.at|goatcounter/, r => r.fulfill({ status: 200, body: '' }));
    const page = await ctx.newPage();
    await page.clock.setFixedTime(NOW);
    const errors = [], bad = [], reqs = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('response', r => { reqs.push(r.status() + ' ' + r.url()); if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()); });
    if (opts.state !== undefined) await page.addInitScript(([k, v]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, v); sessionStorage.setItem('seeded', '1'); } }, [KEY, opts.state]);
    if (opts.blocked) await page.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
    await page.goto(url, { waitUntil: 'load' });
    return { ctx, page, errors, bad, reqs };
}

const text = (page, sel) => page.locator(sel).first().innerText().then(nb);
const vbox = (page, name) => page.locator('.vehicle', { has: page.locator('.v-name', { hasText: name }) });
const jbox = (page, vname, job) => vbox(page, vname).locator('.box', { has: page.locator('.box-name', { hasText: job }) });
async function addService(page, o) {
    if (await page.locator('#open-form').isVisible()) await page.click('#open-form');
    if (o.vehicle) await page.selectOption('#f-vehicle', { label: o.vehicle });
    else {
        await page.selectOption('#f-vehicle', 'new');
        await page.fill('#f-vname', o.vName); await page.selectOption('#f-vkind', o.kind || 'car'); await page.selectOption('#f-vunit', o.unit || 'km'); await page.fill('#f-vodo', o.odo);
    }
    await page.selectOption('#f-type', o.type);
    if (o.name) await page.fill('#f-name', o.name);
    if (o.dist !== undefined) await page.fill('#f-dist', o.dist);
    if (o.months !== undefined) await page.fill('#f-timen', o.months);
    if (o.unitT) await page.selectOption('#f-timeu', o.unitT);
    await page.fill('#f-laston', o.lastOn);
    if (o.lastAt !== undefined && await page.locator('#f-lastat').isVisible()) await page.fill('#f-lastat', o.lastAt);
    const pv = nb(await page.locator('#preview').innerText());
    await page.click('#save');
    return pv;
}
// The real situation: a Honda City with three services and a motorbike.
async function garage(page) {
    await addService(page, { vName: 'Honda City', odo: '45,210', type: 'oil', lastOn: '2026-06-10', lastAt: '40850' });
    await addService(page, { vehicle: 'Honda City', type: 'airfilter', lastOn: '2025-12-01', lastAt: '31000' });
    await addService(page, { vehicle: 'Honda City', type: 'insurance', lastOn: '2025-11-01' });
    await addService(page, { vName: 'My bike', kind: 'bike', odo: '12000', type: 'oil', lastOn: '2026-08-20', lastAt: '11050' });
}
async function saveOdo(page, vname, val) { const b = vbox(page, vname); await b.locator('.odo input').fill(val); await b.getByRole('button', { name: 'Save reading' }).click(); }

(async () => {
    let srv;
    if (bi > 0) url = process.argv[bi + 1].replace(/\/$/, '') + '/' + SLUG + '/';
    else { srv = await serve(); url = 'http://localhost:' + srv.address().port + '/apps/' + SLUG + '/'; }
    const browser = await pw.chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
    let ctx, page, errors, bad, reqs;
    try {
        // ---- first use, empty state, optional inputs not forced ----
        ({ ctx, page, errors, bad, reqs } = await newPage(browser, { w: 390, perms: true }));
        ok('first use: form open, new vehicle chosen', await page.locator('#form').isVisible() && await page.inputValue('#f-vehicle') === 'new' && await page.locator('#w-new').isVisible());
        ok('first use: empty list message', await page.locator('#empty').isVisible());
        ok('first use: form comes before the list on a phone', (await page.locator('#add').boundingBox()).y < (await page.locator('#list').boundingBox()).y);
        ok('defaults for car engine oil: 5000 km or 6 months', await page.inputValue('#f-dist') === '5000' && await page.inputValue('#f-timen') === '6');
        ok('last done defaults to today', await page.inputValue('#f-laston') === '2026-10-23');
        ok('"What is it?" hidden until Something else', !(await page.locator('#w-name').isVisible()));
        await page.selectOption('#f-type', 'other'); ok('Something else shows "What is it?"', await page.locator('#w-name').isVisible()); await page.selectOption('#f-type', 'oil');
        // empty submit
        await page.click('#save');
        ok('blank name and odometer: errors shown', (await text(page, '#e-vname')).startsWith('Type a name') && (await text(page, '#e-vodo')).startsWith('Type the number'));
        ok('focus goes to the first problem', await page.evaluate(() => document.activeElement.id) === 'f-vname');
        await page.fill('#f-vname', 'Honda City'); await page.fill('#f-vodo', '99999999'); await page.click('#save');
        ok('huge odometer refused', (await text(page, '#e-vodo')).includes('whole number'));
        await page.fill('#f-vodo', '-5'); await page.click('#save'); ok('negative odometer refused', (await text(page, '#e-vodo')).includes('whole number'));
        await page.fill('#f-vodo', '45 210'); ok('pasted odometer with a space fills "At odometer"', await page.inputValue('#f-lastat') === '45 210');
        await page.fill('#f-dist', ''); await page.fill('#f-timen', ''); await page.click('#save');
        ok('both intervals empty refused', (await text(page, '#e-dist')).startsWith('Fill in at least one'));
        await page.fill('#f-dist', '0'); await page.click('#save'); ok('0 km refused', (await text(page, '#e-dist')).includes('whole number'));
        await page.fill('#f-dist', '5000'); await page.fill('#f-timen', '6'); await page.fill('#f-laston', '2026-11-01'); await page.click('#save');
        ok('future last-done day refused', (await text(page, '#e-laston')).includes('has not come yet'));
        await page.fill('#f-laston', '2026-10-23'); await page.fill('#f-lastat', '50000'); await page.click('#save');
        ok('last done above today\'s odometer refused', (await text(page, '#e-lastat')).includes('more than the odometer'));
        await page.fill('#f-dist', ''); ok('time-only: "At odometer" hidden', !(await page.locator('#w-lastat').isVisible()));
        await page.fill('#f-dist', '5000');
        await page.selectOption('#f-vunit', 'mi'); ok('miles: defaults change to 3000 and unit words say miles', await page.inputValue('#f-dist') === '3000' && (await text(page, '#form .every .u-word')) === 'miles');
        await page.selectOption('#f-vunit', 'km'); await page.selectOption('#f-vkind', 'bike');
        ok('motorbike: its own services and 1000 km / 3 months oil', await page.locator('#f-type option', { hasText: 'Chain clean' }).count() === 1 && await page.inputValue('#f-dist') === '1000' && await page.inputValue('#f-timen') === '3');
        await page.selectOption('#f-vkind', 'car');
        await page.reload(); await page.waitForLoadState('load');

        // ---- the main situation ----
        const pv = await addService(page, { vName: 'Honda City', odo: '45,210', type: 'oil', lastOn: '2026-06-10', lastAt: '40850' });
        ok('preview gives the exact answer', pv === 'OK: due in 640 km or by Thu 10 Dec 2026 (in 6 weeks), whichever comes first.', pv);
        ok('job box: 640 km or 10 Dec, whichever first', (await text(page, '.box .box-line')) === 'Due in 640 km or by Thu 10 Dec 2026 (in 6 weeks), whichever comes first.');
        ok('job box: watch for 45,850 km', (await text(page, '.box .box-adv')) === 'Watch for 45,850 km on the odometer.');
        ok('job box: every and last done', (await text(page, '.box .box-sub')) === 'Every 5,000 km or every 6 months. Last done 10 Jun 2026 at 40,850 km.');
        ok('form closes after the first add', !(await page.locator('#form').isVisible()) && await page.locator('#open-form').isVisible());
        ok('added message with Undo', (await text(page, '#form-msg')).includes('Added Engine oil and oil filter for Honda City') && await page.locator('#form-msg .undo').count() === 1);
        await page.locator('#form-msg .undo').click(); ok('Undo the first add empties the app', await page.locator('.vehicle').count() === 0);
        await garage(page);
        ok('two vehicles, each in its own box', await page.locator('.vehicle').count() === 2);
        ok('air filter due soon: 790 km', (await jbox(page, 'Honda City', 'Air filter').locator('.box-line').innerText()).startsWith('Due in 790 km'));
        ok('insurance due by 1 Nov (9 days)', nb(await jbox(page, 'Honda City', 'Insurance').locator('.box-line').innerText()) === 'Due by Sun 1 Nov 2026 (in 9 days).');
        ok('bike oil: 50 km left, due soon badge', nb(await jbox(page, 'My bike', 'Engine oil').locator('.badge').innerText()) === 'Due soon');
        ok('adding a service for an existing vehicle keeps the same box', await vbox(page, 'Honda City').locator('.box').count() === 3);
        // duplicate
        await page.click('#open-form'); await page.selectOption('#f-vehicle', { label: 'Honda City' }); await page.selectOption('#f-type', 'oil'); await page.click('#save');
        ok('same service twice refused', (await text(page, '#e-type')).includes('already has Engine oil'));
        await page.click('#cancel'); ok('Cancel closes the form', !(await page.locator('#form').isVisible()));

        // ---- odometer update -> overdue ----
        await saveOdo(page, 'Honda City', '45,900');
        ok('reading saved, oil overdue by 50 km', nb(await jbox(page, 'Honda City', 'Engine oil').locator('.box-line').innerText()) === 'Overdue by 50 km.');
        ok('overdue sorted to the top of the vehicle', nb(await vbox(page, 'Honda City').locator('.box-name').first().innerText()) === 'Engine oil and oil filter');
        const sum = await page.locator('#sum-body .sum-list li').allInnerTexts();
        ok('summary lists overdue first, across vehicles', nb(sum[0]) === 'Honda City: Engine oil and oil filter overdue by 50 km' && sum.length === 4, sum.map(nb));
        ok('summary headline', (await text(page, '#sum-body .next')) === '1 service to do now, 3 due soon');
        ok('last reading line', (await text(page, '#odo-h-1')).startsWith('Last reading 45,900 km on 23 Oct 2026 (today)'));
        // Enter key saves a reading
        await vbox(page, 'My bike').locator('.odo input').fill('12100'); await vbox(page, 'My bike').locator('.odo input').press('Enter');
        ok('Enter saves a reading (keyboard)', nb(await jbox(page, 'My bike', 'Engine oil').locator('.box-line').innerText()) === 'Overdue by 50 km.');
        await vbox(page, 'My bike').locator('.odo input').fill('12.5'); await vbox(page, 'My bike').getByRole('button', { name: 'Save reading' }).click();
        ok('decimal reading refused', (await vbox(page, 'My bike').locator('.odo .err').innerText()).includes('whole number'));
        // lower reading -> ask
        await saveOdo(page, 'My bike', '300');
        ok('lower reading asks if the meter was replaced', await vbox(page, 'My bike').locator('.ask').isVisible());
        await vbox(page, 'My bike').getByRole('button', { name: 'Let me fix the number' }).click();
        ok('"Let me fix" keeps the old reading', !(await vbox(page, 'My bike').locator('.ask').count()) && (await vbox(page, 'My bike').locator('.odo .hint').innerText()).startsWith('Last reading 12,100 km'));
        await saveOdo(page, 'My bike', '300'); await vbox(page, 'My bike').getByRole('button', { name: 'The meter was replaced or reset' }).click();
        ok('replaced meter: keeps counting (still 50 km over)', nb(await jbox(page, 'My bike', 'Engine oil').locator('.box-line').innerText()) === 'Overdue by 50 km.' && (await vbox(page, 'My bike').locator('.odo .hint').innerText()).startsWith('Last reading 300 km'));
        await page.locator('#list-msg .undo').click();
        ok('Undo the meter reset', (await vbox(page, 'My bike').locator('.odo .hint').innerText()).startsWith('Last reading 12,100 km'));

        // ---- Done ----
        await jbox(page, 'Honda City', 'Engine oil').getByRole('button', { name: 'Done' }).click();
        const jb = jbox(page, 'Honda City', 'Engine oil');
        ok('Done form: today and the odometer filled in', await jb.locator('input[type=date]').inputValue() === '2026-10-23' && await jb.locator('input[id^=d-at]').inputValue() === '45900');
        ok('cost hidden behind "+ Add cost"', !(await jb.locator('input[id^=d-cost]').isVisible()));
        await jb.getByRole('button', { name: '+ Add cost or workshop (optional)' }).click();
        await jb.locator('input[id^=d-cost]').fill('abc'); await jb.getByRole('button', { name: 'Save' }).click();
        ok('bad cost refused', (await jb.locator('.err').innerText()).includes('cost as a number'));
        await jb.locator('input[id^=d-cost]').fill('3,500'); await jb.locator('input[id^=d-note]').fill('Ali Motors, Shell 5W-30'); await jb.getByRole('button', { name: 'Save' }).click();
        ok('Done: next counts from today (5,000 km or 23 Apr)', nb(await jbox(page, 'Honda City', 'Engine oil').locator('.box-line').innerText()) === 'Due in 5,000 km or by Fri 23 Apr 2027 (in 6 months), whichever comes first.');
        ok('Done message tells the next one', (await text(page, '#list-msg')).startsWith('Engine oil and oil filter done. Next: due in 5,000 km'));
        ok('spent this year shows', (await vbox(page, 'Honda City').locator('.spent').innerText()) === 'Spent on services: 3,500 this year, 3,500 in all.');
        const hist = jbox(page, 'Honda City', 'Engine oil').locator('.hist');
        await hist.locator('summary').click();
        ok('past services lists both with cost and note', nb(await hist.innerText()).includes('23 Oct 2026, 45,900 km, 3,500, Ali Motors, Shell 5W-30') && nb(await hist.innerText()).includes('Past services (2)'));
        // currency
        await page.selectOption('#cur', 'Rs');
        ok('currency symbol shows on costs', (await vbox(page, 'Honda City').locator('.spent').innerText()).includes('Rs 3,500 this year'));
        // delete a history entry, undo
        await hist.locator('summary').click().catch(() => {});
        if (!(await hist.evaluate(d => d.open))) await hist.locator('summary').click();
        await hist.getByRole('button', { name: 'Delete the 23 Oct 2026 entry' }).click();
        ok('deleting the latest entry goes back to overdue', nb(await jbox(page, 'Honda City', 'Engine oil').locator('.box-line').innerText()) === 'Overdue by 50 km.');
        await page.locator('#list-msg .undo').click();
        ok('Undo brings the entry back', (await jbox(page, 'Honda City', 'Engine oil').locator('.badge').innerText()) === 'OK');

        // ---- edit and delete a service ----
        await jbox(page, 'Honda City', 'Air filter').getByRole('button', { name: 'Edit' }).click();
        ok('edit form loads the values', await page.inputValue('#f-dist') === '15000' && await page.inputValue('#f-lastat') === '31000' && (await text(page, '#form-h')) === 'Edit a service');
        await page.fill('#f-dist', '20000'); await page.click('#save');
        ok('edit saves (now 5,100 km left)', (await jbox(page, 'Honda City', 'Air filter').locator('.box-line').innerText()).startsWith('Due in 5,100 km'));
        await jbox(page, 'Honda City', 'Air filter').getByRole('button', { name: 'Edit' }).click();
        await page.click('#del');
        ok('delete a service', await jbox(page, 'Honda City', 'Air filter').count() === 0);
        await page.locator('#list-msg .undo').click(); ok('Undo the delete', await jbox(page, 'Honda City', 'Air filter').count() === 1);
        // something else with a long name
        await addService(page, { vehicle: 'Honda City', type: 'other', name: 'Clutch plate and pressure plate with release bearing x', dist: '60000', months: '', lastOn: '2026-01-01', lastAt: '40000' });
        ok('something else, long name clipped to 50 and wraps', (await jbox(page, 'Honda City', 'Clutch plate').locator('.box-name').innerText()).length <= 50);
        // edit vehicle
        await vbox(page, 'My bike').getByRole('button', { name: 'Edit My bike' }).click();
        await page.fill('#ve-name-' + (await vbox(page, 'My bike').getAttribute('data-id')), 'Honda CD 70'); await vbox(page, 'My bike').getByRole('button', { name: 'Save' }).click();
        ok('rename a vehicle', await vbox(page, 'Honda CD 70').count() === 1);
        // remove + undo
        await vbox(page, 'Honda CD 70').getByRole('button', { name: 'Remove Honda CD 70' }).click();
        ok('remove a vehicle', await page.locator('.vehicle').count() === 1);
        await page.locator('#list-msg .undo').click(); ok('Undo the remove', await page.locator('.vehicle').count() === 2);

        // ---- share, calendar, backup ----
        await vbox(page, 'Honda City').getByRole('button', { name: 'Copy the list for the mechanic for Honda City' }).click();
        await page.waitForTimeout(150);
        const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
        ok('copy for the mechanic', clip.includes('Honda City (odometer 45,900 km on 23 Oct 2026)') && clip.includes('- Insurance renewal: due by Sun 1 Nov 2026 (in 9 days)') && !clip.includes('Engine oil'), clip);
        await page.click('#copy-all'); await page.waitForTimeout(150);
        const all = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
        ok('copy the whole list with costs', all.includes('Spent on services: Rs 3,500 this year') && all.includes('Honda CD 70'), all);
        let dl = page.waitForEvent('download'); await page.click('#cal-all'); let d = await dl;
        const ics = fs.readFileSync(await d.path(), 'utf8');
        ok('calendar file with date-based due days', d.suggestedFilename() === 'vehicle-services.ics' && ics.includes('DTSTART;VALUE=DATE:20261101') && ics.includes('BEGIN:VALARM'));
        dl = page.waitForEvent('download'); await page.click('#backup'); d = await dl;
        const backup = fs.readFileSync(await d.path(), 'utf8');
        ok('backup file', d.suggestedFilename() === 'vehicle-services-2026-10-23.json' && JSON.parse(backup).data.vehicles.length === 2);
        // email: href built without a recipient
        await page.evaluate(() => { window.__mail = null; const orig = Object.getOwnPropertyDescriptor(Location.prototype, 'href'); });
        page.on('request', () => {});
        await page.click('#mail-all').catch(() => {});
        ok('email button works with no recipient (no errors)', errors.length === 0, errors);
        // reload keeps everything
        await page.reload(); await page.waitForLoadState('load');
        ok('reload keeps vehicles, readings and currency', await page.locator('.vehicle').count() === 2 && (await vbox(page, 'Honda City').locator('.spent').innerText()).includes('Rs 3,500') && await page.inputValue('#cur') === 'Rs');
        // delete everything, undo, restore
        await page.click('#wipe'); ok('delete everything', await page.locator('.vehicle').count() === 0 && await page.locator('#form').isVisible());
        await page.locator('#set-msg .undo').click(); ok('Undo delete everything', await page.locator('.vehicle').count() === 2);
        await page.click('#wipe');
        await page.setInputFiles('#restore-file', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"nope":1}') });
        await page.waitForTimeout(100);
        ok('bad backup refused, nothing changed', (await text(page, '#set-msg')).startsWith('That file is not a backup') && await page.locator('.vehicle').count() === 0);
        await page.setInputFiles('#restore-file', { name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(backup) });
        await page.waitForTimeout(100);
        ok('restore a backup', (await text(page, '#set-msg')).startsWith('Restored 2 vehicles') && await page.locator('.vehicle').count() === 2);
        // theme switch
        const before = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
        await page.locator('.theme-toggle').click();
        ok('light/dark switch changes the look', before !== await page.evaluate(() => getComputedStyle(document.body).backgroundColor));
        await page.locator('.theme-toggle').click();
        ok('no console errors in the main run', errors.length === 0, errors);
        ok('no failed requests', bad.length === 0, bad);
        const files = await page.evaluate(async () => { const out = {}; for (const f of ['favicon.svg', 'manifest.webmanifest', 'sw.js', '../help.js', '../theme.js', 'core.js', 'script.js', 'style.css', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'screenshots/desktop.png', 'screenshots/phone.png']) out[f] = (await fetch(f, { cache: 'no-store' })).status; return out; });
        ok('every file the app needs returns 200', Object.values(files).every(x => x === 200), files);
        const saved = await page.evaluate(k => localStorage.getItem(k), KEY);
        await ctx.close();

        // ---- corrupt and blocked storage ----
        ({ ctx, page, errors } = await newPage(browser, { state: '{bad json' }));
        ok('corrupt saved state: starts fresh with a message', await page.locator('.vehicle').count() === 0 && (await text(page, '#set-msg')).includes('could not be read') && errors.length === 0, errors);
        await ctx.close();
        ({ ctx, page, errors } = await newPage(browser, { state: JSON.stringify({ vehicles: [{ id: 1, name: 'X', readings: [{ on: '2026-10-01', r: 'oops' }], jobs: [{ id: 2, type: 'oil', dist: 5000, history: [{ on: '2026-10-01', r: 100 }] }] }] }) }));
        ok('damaged values: vehicle kept, asks for a reading', nb(await page.locator('.box-line').first().innerText()) === 'Due at 5,100 km.' && nb(await page.locator('.badge').first().innerText()) === 'Needs a reading' && errors.length === 0, errors);
        await ctx.close();
        ({ ctx, page, errors } = await newPage(browser, { blocked: true }));
        ok('storage blocked: warning shown, still usable', await page.locator('#storage-warn').isVisible() && errors.length === 0, errors);
        await addService(page, { vName: 'Car', odo: '100', type: 'oil', lastOn: '2026-10-23', lastAt: '100' });
        ok('storage blocked: can still add', await page.locator('.vehicle').count() === 1);
        await ctx.close();
        // second use the next day: the clock moves on
        ({ ctx, page, errors } = await newPage(browser, { state: saved }));
        await page.clock.setFixedTime(new Date(2026, 10, 2, 9, 0)); await page.reload(); await page.waitForLoadState('load');
        ok('next day(s): insurance now overdue by 1 day', nb(await jbox(page, 'Honda City', 'Insurance').locator('.box-line').innerText()) === 'Overdue by 1 day.');
        ok('odometer not updated warning after 10 days is not shown yet', !(await page.locator('.sum-stale').count()));
        await page.clock.setFixedTime(new Date(2026, 10, 12, 9, 0)); await page.reload(); await page.waitForLoadState('load');
        ok('stale odometer nudge after 2 weeks', await page.locator('.sum-stale').count() === 1);
        await ctx.close();

        // ---- layout: every width, dark and light, filled and cleared ----
        for (const scheme of ['dark', 'light']) {
            ({ ctx, page, errors } = await newPage(browser, { w: 1280, scheme, state: saved }));
            for (const w of [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920]) {
                await page.setViewportSize({ width: w, height: 900 });
                for (const mode of ['filled', 'open']) {
                    if (mode === 'open') {
                        // reveal every optional part: new vehicle, something else, done form with cost, the ask box, vehicle edit
                        await page.click('#open-form').catch(() => {});
                        await page.selectOption('#f-vehicle', 'new'); await page.selectOption('#f-type', 'other');
                        await jbox(page, 'Honda City', 'Insurance').getByRole('button', { name: 'Done' }).click();
                        await jbox(page, 'Honda City', 'Insurance').getByRole('button', { name: '+ Add cost or workshop (optional)' }).click();
                        await saveOdo(page, 'Honda CD 70', '5');
                        await page.evaluate(() => document.querySelectorAll('details').forEach(d => { d.open = true; }));
                    }
                    const r = await page.evaluate(() => {
                        const res = { scroll: document.documentElement.scrollWidth > innerWidth + 1, overlap: [], ctl: [], ph: [] };
                        for (const p of [0, .5, 1]) {
                            scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * p);
                            document.querySelectorAll('main, .app, .col-main, .col-side').forEach(h => { const k = [...h.children].filter(c => { const b = c.getBoundingClientRect(), cs = getComputedStyle(c); return b.width > 4 && b.height > 4 && cs.display !== 'none' && cs.position !== 'absolute'; });
                                for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { const a = k[i].getBoundingClientRect(), b = k[j].getBoundingClientRect(); if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 4 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 4) res.overlap.push(k[i].className + '/' + k[j].className); } });
                        }
                        const c = [...document.querySelectorAll('main input:not([type=file]), main select, main button')].filter(e => e.checkVisibility() && getComputedStyle(e).visibility !== 'hidden');
                        for (let i = 0; i < c.length; i++) for (let j = i + 1; j < c.length; j++) { if (c[i].contains(c[j]) || c[j].contains(c[i])) continue; const a = c[i].getBoundingClientRect(), b = c[j].getBoundingClientRect(); if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2) res.ctl.push((c[i].id || c[i].textContent) + '/' + (c[j].id || c[j].textContent)); }
                        const cv = document.createElement('canvas').getContext('2d');
                        c.filter(e => e.placeholder).forEach(e => { const cs = getComputedStyle(e); cv.font = cs.fontSize + ' ' + cs.fontFamily; const room = e.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight); if (cv.measureText(e.placeholder).width > room + 1) res.ph.push(e.id + ' ' + Math.round(cv.measureText(e.placeholder).width) + '>' + Math.round(room)); });
                        c.filter(e => e.tagName === 'BUTTON').forEach(e => { if (e.scrollWidth > e.clientWidth + 1) res.ph.push('button text cut: ' + e.textContent); });
                        return res;
                    });
                    ok(scheme + ' ' + w + 'px ' + mode + ': no sideways scroll, nothing overlaps, placeholders fit', !r.scroll && !r.overlap.length && !r.ctl.length && !r.ph.length, r);
                    if (mode === 'open') { await page.reload(); await page.waitForLoadState('load'); }
                }
            }
            // cleared state at phone and desktop
            await page.click('#wipe');
            for (const w of [320, 1280]) { await page.setViewportSize({ width: w, height: 900 }); ok(scheme + ' ' + w + 'px cleared: no sideways scroll', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); }
            ok(scheme + ': no console errors in the layout run', errors.length === 0, errors);
            await ctx.close();
        }

        // ---- Help at 4 widths ----
        ({ ctx, page } = await newPage(browser, { w: 320 }));
        for (const w of [320, 390, 820, 1280]) {
            await page.setViewportSize({ width: w, height: 800 });
            await page.click('.help-btn');
            const d = page.locator('dialog.help'), b = await d.boundingBox();
            ok(w + 'px: Help opens on screen with its title', b && b.x >= 0 && b.y >= 0 && b.x + b.width <= w + 1 && b.y + b.height <= 801 && (await d.locator('h2').innerText()).includes('Car and Motorbike Service Reminder'));
            await page.keyboard.press('Escape'); ok(w + 'px: Escape closes Help', !(await d.evaluate(e => e.open)));
            await page.click('.help-btn'); await page.click('.help-close'); ok(w + 'px: Got it closes Help', !(await d.evaluate(e => e.open)));
            const bb = await page.locator('.help-btn').boundingBox(), bk = await page.locator('a.back').boundingBox(), tt = await page.locator('.theme-toggle').boundingBox();
            const ov = (a, c) => Math.min(a.x + a.width, c.x + c.width) - Math.max(a.x, c.x) > 1 && Math.min(a.y + a.height, c.y + c.height) - Math.max(a.y, c.y) > 1;
            ok(w + 'px: top bar buttons do not overlap', !ov(bb, bk) && !ov(bb, tt) && !ov(bk, tt));
        }
        await ctx.close();

        // ---- screenshots: the real situation, default dark look ----
        if (shots) {
            for (const [w, h, scale, name] of [[1280, 1000, 1, 'desktop.png'], [390, 844, 2, 'phone.png']]) {
                ({ ctx, page } = await newPage(browser, { w, h, scale, scheme: 'dark' }));
                await garage(page);
                await page.evaluate(() => { const v = new Date(2026, 9, 1); });
                await saveOdo(page, 'Honda City', '45,900');
                await page.selectOption('#cur', 'Rs');
                await jbox(page, 'My bike', 'Engine oil').getByRole('button', { name: 'Done' }).click();
                await jbox(page, 'My bike', 'Engine oil').getByRole('button', { name: '+ Add cost or workshop (optional)' }).click();
                await jbox(page, 'My bike', 'Engine oil').locator('input[id^=d-cost]').fill('1,200');
                await jbox(page, 'My bike', 'Engine oil').getByRole('button', { name: 'Save' }).click();
                await page.evaluate(() => { document.querySelectorAll('.msg').forEach(m => { m.textContent = ''; m.classList.remove('show'); }); document.activeElement && document.activeElement.blur(); });
                if (w > 900) { await page.click('#open-form'); await page.selectOption('#f-vehicle', { label: 'Honda City' }); await page.selectOption('#f-type', 'brakes'); await page.fill('#f-lastat', '38000'); await page.fill('#f-laston', '2026-02-14'); await page.evaluate(() => document.activeElement.blur()); await page.evaluate(() => scrollTo(0, 0)); }
                else { await page.evaluate(() => document.getElementById('summary').scrollIntoView()); await page.evaluate(() => scrollBy(0, -12)); }
                await page.screenshot({ path: path.join(__dirname, 'screenshots', name) });
                await ctx.close();
            }
            ok('screenshots written', fs.existsSync(path.join(__dirname, 'screenshots', 'desktop.png')) && fs.existsSync(path.join(__dirname, 'screenshots', 'phone.png')));
        }
    } catch (e) { ok('test run crashed', false, e.message); }
    await browser.close();
    if (srv) srv.close();
    console.log(fail ? '\n' + fail + ' FAILED' : '\nALL UI TESTS PASSED');
    process.exit(fail ? 1 : 0);
})();
