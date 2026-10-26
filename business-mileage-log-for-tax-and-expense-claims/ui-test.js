// Full page test with Playwright. Run from the repo root or this folder: node ui-test.js
//   BASE=https://umar8092.github.io/apps node ui-test.js   tests the live site
//   node ui-test.js --shots                                 also saves screenshots/desktop.png and phone.png
// "Now" is fixed to Mon 26 Oct 2026, 10:00 am Pakistan time so every answer can be checked exactly.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), SLUG = 'business-mileage-log-for-tax-and-expense-claims', KEY = SLUG + '.state';
const SHOTS = process.argv.includes('--shots');
const NOW = new Date('2026-10-26T10:00:00+05:00');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; if (!cond) console.log('FAIL ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra).slice(0, 500) : '')); };

function serve() {
    const types = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml', png: 'image/png', webmanifest: 'application/manifest+json' };
    return new Promise(res => { const s = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0].replace(/^\/apps/, '')); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': types[f.split('.').pop()] || 'application/octet-stream' }); r.end(fs.readFileSync(f)); }).listen(0, () => res(s)); });
}

// Sarah, a self-employed plumber in the UK, HMRC car rate. April to September in short trips, then October in detail.
function demo() {
    const trips = []; let id = 10;
    const spots = [['Home', 'Patel family, Headingley', 'Boiler service', 6.4], ['Home', 'City Plumbing supplies', 'Parts for jobs', 4.2], ['Home', 'New build site, Wakefield', 'Bathroom fit-out', 11.8],
        ['Home', 'Mrs Green, Otley', 'Leaking radiator', 9.6], ['Home', 'Harrogate office block', 'Gas safety checks', 15.5]];
    for (let d = new Date(Date.UTC(2026, 3, 6)); d < Date.UTC(2026, 9, 1); d = new Date(d.getTime() + 864e5)) {
        const wd = d.getUTCDay(); if (wd === 0 || wd === 6) continue;
        const s = spots[(d.getUTCDate() + wd) % spots.length];
        trips.push({ id: id++, veh: 1, date: d.toISOString().slice(0, 10), from: s[0], to: s[1], purpose: s[2], t: Math.round(s[3] * 10), back: true, odo: null, pass: 0 });
    }
    const oct = [['2026-10-01', 'Home', 'Smith Ltd, Leeds', 'Boiler repair', 24, true, 0], ['2026-10-05', 'Home', 'City Plumbing supplies', 'Parts for the Smith job', 18.5, false, 0],
        ['2026-10-12', 'Home', 'Mrs Green, Otley', 'New radiator fitted', 31, true, 0], ['2026-10-20', 'Home', 'New build site, York', 'First fix, 3 flats', 107.5, false, 0],
        ['2026-10-23', 'Home', 'Training centre, Manchester', 'Gas safety course (apprentice came along)', 88, true, 1]];
    oct.forEach(o => trips.push({ id: id++, veh: 1, date: o[0], from: o[1], to: o[2], purpose: o[3], t: Math.round(o[4] * 10), back: o[5], odo: null, pass: o[6] }));
    return { v: 1, nextId: id, vehicles: [{ id: 1, name: 'My car', rule: 'uk-car', custom: null }], trips };
}
const DEMO = demo();

(async () => {
    let srv, base = process.env.BASE;
    if (!base) { srv = await serve(); base = 'http://localhost:' + srv.address().port + '/apps'; }
    const URL = base + '/' + SLUG + '/';
    const browser = await chromium.launch();
    const errors = [], failed = [], requested = new Set();
    async function newPage(opts, init) {
        const ctx = await browser.newContext(Object.assign({ viewport: { width: 390, height: 844 }, acceptDownloads: true, timezoneId: 'Asia/Karachi', colorScheme: 'dark', locale: 'en-GB' }, opts || {}));
        await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new globalThis.URL(base).origin });
        await ctx.route(/goatcounter\.com|gc\.zgo\.at/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
        const page = await ctx.newPage();
        await page.clock.setFixedTime(NOW);
        if (init) await page.addInitScript(init);
        page.on('pageerror', e => errors.push(e.message));
        page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
        page.on('request', r => { if (r.url().startsWith(base)) requested.add(r.url()); });
        page.on('response', r => { if (r.status() >= 400 && r.url().startsWith(base)) failed.push(r.status() + ' ' + r.url()); });
        await page.goto(URL, { waitUntil: 'networkidle' });
        return { ctx, page };
    }
    const seed = (st, cur) => `try { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(${JSON.stringify(KEY)}, ${JSON.stringify(JSON.stringify(st))}); ${cur ? `localStorage.setItem(${JSON.stringify(SLUG + '.cur')}, ${JSON.stringify(cur)});` : ''} sessionStorage.setItem('seeded', '1'); } } catch (e) {}`;
    const txt = async (page, sel) => (await page.locator(sel).innerText()).replace(/\s+/g, ' ').trim();
    const total = page => txt(page, '.total-amt');
    const msg = page => txt(page, '#trip-msg');
    const isOpen = (page, id) => page.locator('#' + id).evaluate(d => d.open);
    const tripBox = (page, to) => page.locator('#trip-list li.trip', { has: page.locator('.trip-route', { hasText: to }) });
    async function addTrip(page, o) {
        await page.click('#add-trip');
        if (o.veh) await page.selectOption('#t-veh', { label: o.veh });
        if (o.date) await page.fill('#t-date', o.date);
        if (o.from != null) await page.fill('#t-from', o.from);
        await page.fill('#t-to', o.to);
        if (o.purpose != null) await page.fill('#t-purpose', o.purpose);
        if (o.odo) { await page.click('#to-odo'); await page.fill('#t-odo-s', o.odo[0]); await page.fill('#t-odo-e', o.odo[1]); }
        else await page.fill('#t-dist', o.dist);
        if (o.back) await page.check('#t-back');
        if (o.pass) { await page.click('#to-pass'); await page.fill('#t-pass', o.pass); }
        const preview = await txt(page, '#t-preview');
        await page.click('#t-save');
        return preview;
    }

    // ---------- 1. first use: set up the vehicle and rate ----------
    let { ctx, page } = await newPage();
    ok('first use: Start here shown', await page.locator('#start').isVisible());
    ok('first use: no claim or trips yet', !(await page.locator('#claim').isVisible()) && !(await page.locator('#add-trip').isVisible()));
    await page.click('#start-btn');
    ok('setup window opens', await isOpen(page, 'd-veh'));
    ok('setup: name defaults to My car', (await page.inputValue('#v-name')) === 'My car');
    ok('setup: six rate choices', (await page.locator('input[name="v-rule"]').count()) === 6);
    ok('setup: own-rate fields hidden until chosen', !(await page.locator('#vw-own').isVisible()));
    await page.click('#v-save');
    ok('setup: no rate chosen -> error', (await txt(page, '#ve-rule')) === 'Choose which rate you claim.' && await isOpen(page, 'd-veh'));
    await page.check('input[name="v-rule"][value="uk-car"]');
    ok('setup: preview of the HMRC rate', (await txt(page, '#v-preview')).startsWith('UK: HMRC car or van: 45p a mile for the first 10,000 business miles'), await txt(page, '#v-preview'));
    ok('setup: error cleared after choosing', (await txt(page, '#ve-rule')) === '');
    await page.click('#v-save');
    ok('setup saved, window closed', !(await isOpen(page, 'd-veh')));
    ok('setup: ready message', (await msg(page)).startsWith('Ready. Tap "+ Add a trip"'), await msg(page));
    ok('setup: currency set to £ from the HMRC rate', (await page.inputValue('#s-cur')) === '£');
    ok('empty claim: £0.00 and a hint', (await total(page)) === '£0.00' && (await txt(page, '#claim-body')).includes('No trips yet. Tap "+ Add a trip"'), await txt(page, '#claim-body'));
    ok('empty claim: share buttons hidden', !(await page.locator('#copy-claim').isVisible()));
    ok('tax year box shows 10,000 miles left', (await txt(page, '#year-body')).includes('10,000.0 miles left at 45p before the rate drops to 25p'), await txt(page, '#year-body'));
    ok('tax year heading names the year', (await txt(page, '#year-h')) === 'Tax year 2026-27 so far');

    // ---------- 2. the main situation: log trips ----------
    await page.click('#add-trip');
    ok('trip window: one vehicle, so no vehicle choice', !(await page.locator('#tw-veh').isVisible()));
    ok('trip window: date is today', (await page.inputValue('#t-date')) === '2026-10-26');
    ok('trip window: label says miles', (await txt(page, '#tl-dist')) === 'Business miles');
    ok('trip window: passengers optional, hidden', !(await page.locator('#tw-pass').isVisible()) && await page.locator('#to-pass').isVisible());
    ok('trip window: no repeat chips on the first trip', !(await page.locator('#tw-repeat').isVisible()));
    await page.click('#t-save');
    ok('blank trip: To and miles errors', (await txt(page, '#te-to')).startsWith('Type where you went') && (await txt(page, '#te-dist')).startsWith('Type how far'), [await txt(page, '#te-to'), await txt(page, '#te-dist')]);
    await page.fill('#t-to', 'X'); await page.fill('#t-dist', '0'); await page.click('#t-save');
    ok('zero miles refused', (await txt(page, '#te-dist')) === 'The distance must be more than 0.');
    await page.fill('#t-dist', '-4'); await page.click('#t-save');
    ok('negative miles refused', (await txt(page, '#te-dist')) === 'The distance cannot be below zero.');
    await page.fill('#t-dist', '12abc'); await page.click('#t-save');
    ok('text miles refused', (await txt(page, '#te-dist')).startsWith('Type the distance as a number'));
    await page.fill('#t-dist', '5'); await page.fill('#t-date', '2026-10-27'); await page.click('#t-save');
    ok('future date refused', (await txt(page, '#te-date')).startsWith('That date is in the future'));
    await page.keyboard.press('Escape');
    ok('Escape closes the trip window without saving', !(await isOpen(page, 'd-trip')) && (await total(page)) === '£0.00');

    let pv = await addTrip(page, { date: '2026-10-01', from: 'Home', to: 'Smith Ltd, Leeds', purpose: 'Boiler repair', dist: '24', back: true });
    ok('preview before saving', pv === 'Adds £21.60 to your claim: 48.0 mi at 45p.', pv);
    ok('added message with Undo', (await msg(page)).startsWith('Added: Thu 1 Oct to Smith Ltd, Leeds, 48.0 mi, £21.60.') && await page.locator('#trip-msg .undo').isVisible(), await msg(page));
    ok('claim £21.60', (await total(page)) === '£21.60');
    let t = await txt(page, '#trip-list');
    ok('trip box: route, purpose, how', t.includes('Home ⇄ Smith Ltd, Leeds') && t.includes('Boiler repair') && t.includes('24.0 mi each way, there and back = 48.0 mi at 45p.'), t);
    await page.click('#trip-msg .undo');
    ok('undo removes the trip', (await total(page)) === '£0.00' && (await msg(page)) === 'Undone.');
    await addTrip(page, { date: '2026-10-01', from: 'Home', to: 'Smith Ltd, Leeds', purpose: 'Boiler repair', dist: '24', back: true });
    // a repeat in one tap
    await page.click('#add-trip');
    ok('repeat chips shown', await page.locator('#tw-repeat').isVisible() && (await txt(page, '#t-repeat')).includes('Home ⇄ Smith Ltd, Leeds · 48.0 mi'), await txt(page, '#t-repeat'));
    await page.locator('#t-repeat .chip').first().click();
    ok('repeat fills the trip', (await page.inputValue('#t-to')) === 'Smith Ltd, Leeds' && (await page.inputValue('#t-dist')) === '24' && await page.isChecked('#t-back') && (await page.inputValue('#t-purpose')) === 'Boiler repair');
    ok('repeat keeps today as the date', (await page.inputValue('#t-date')) === '2026-10-26');
    await page.locator('#t-quick-date .chip', { hasText: 'Yesterday' }).click();
    ok('Yesterday chip', (await page.inputValue('#t-date')) === '2026-10-25');
    await page.click('#t-save');
    ok('two trips: £43.20', (await total(page)) === '£43.20');
    // odometer and passengers
    pv = await addTrip(page, { date: '2026-10-20', from: 'Home', to: 'Site in York', purpose: 'First fix', odo: ['48213', '48261.5'] });
    ok('odometer trip preview: 48.5 mi = £21.83', pv === 'Adds £21.83 to your claim: 48.5 mi at 45p.', pv);
    t = await txt(page, '#trip-list');
    ok('odometer trip box', t.includes('Odometer 48,213.0 to 48,261.5 = 48.5 mi at 45p.'), t);
    pv = await addTrip(page, { date: '2026-10-23', from: 'Home', to: 'Training centre', purpose: 'Course', dist: '100', pass: '1' });
    ok('passenger trip preview', pv === 'Adds £50.00 to your claim: 100.0 mi at 45p, plus 1 passenger at 5p.', pv);
    ok('claim adds up: 43.20 + 21.83 + 50.00 = £115.03', (await total(page)) === '£115.03', await total(page));
    const cb = await txt(page, '#claim-body');
    ok('breakdown lines', cb.includes('244.5 miles at 45p = £110.03') && cb.includes('Passenger extra: 100.0 passenger miles at 5p = £5.00') && cb.includes('October 2026: 4 trips, 244.5 mi.'), cb);
    // no purpose: a tip, not a block
    await addTrip(page, { date: '2026-10-26', to: 'Merchant', dist: '3' });
    ok('trip without purpose saved', (await total(page)) === '£116.38', await total(page));
    ok('missing purpose flagged in the box and the claim', (await txt(page, '#trip-list')).includes('No purpose yet: tap Edit') && (await txt(page, '#claim-body')).includes('1 trip has no purpose'));
    // edit and delete
    await tripBox(page, 'Merchant').locator('button', { hasText: 'Edit' }).click();
    ok('edit window', (await txt(page, '#dt-h')) === 'Edit trip' && (await page.inputValue('#t-dist')) === '3' && !(await page.locator('#tw-repeat').isVisible()));
    await page.fill('#t-purpose', 'Copper pipe'); await page.fill('#t-dist', '4');
    ok('edit preview', (await txt(page, '#t-preview')) === 'This trip: £1.80 for 4.0 mi at 45p.', await txt(page, '#t-preview'));
    await page.click('#t-save');
    ok('edit saved', (await total(page)) === '£116.83' && (await msg(page)).startsWith('Saved: Mon 26 Oct to Merchant'), [await total(page), await msg(page)]);
    await tripBox(page, 'Merchant').locator('button', { hasText: 'Edit' }).click();
    await page.click('#t-del');
    ok('delete trip', (await total(page)) === '£115.03' && (await msg(page)).startsWith('Deleted the trip on Mon 26 Oct to Merchant.'));
    await page.click('#trip-msg .undo');
    ok('undo delete', (await total(page)) === '£116.83');
    // Repeat today from a trip box
    await tripBox(page, 'Merchant').locator('button', { hasText: 'Repeat today' }).click();
    ok('repeat today opens a new filled trip', (await txt(page, '#dt-h')) === 'Add a trip' && (await page.inputValue('#t-to')) === 'Merchant' && (await page.inputValue('#t-date')) === '2026-10-26');
    await page.keyboard.press('Escape');
    // a trip from last month
    await addTrip(page, { date: '2026-09-30', to: 'Old job', purpose: 'Quote', dist: '10' });
    ok('trip outside the shown month: message says where', (await msg(page)).includes('It is outside October 2026: tap "All trips" to see it.'), await msg(page));
    ok('October total unchanged', (await total(page)) === '£116.83');

    // ---------- 3. periods ----------
    await page.click('#periods .chip[data-p="last"]');
    ok('last month', (await total(page)) === '£4.50' && (await txt(page, '#trips-h')) === 'Trips: September 2026');
    await page.click('#periods .chip[data-p="year"]');
    ok('this tax year', (await total(page)) === '£121.33' && (await txt(page, '.total-sub')).startsWith('Tax year 2026-27 (6 Apr 2026 to 5 Apr 2027): 6 trips'), await txt(page, '.total-sub'));
    ok('months grouped with totals', (await page.locator('.month-h').count()) === 2 && (await txt(page, '.month-h >> nth=1')).includes('10.0 mi · £4.50'));
    await page.click('#periods .chip[data-p="lastyear"]');
    ok('last tax year empty', (await total(page)) === '£0.00' && (await txt(page, '#claim-body')).includes('No trips in these dates.'));
    await page.click('#periods .chip[data-p="custom"]');
    ok('pick dates shows two date fields', await page.locator('#r-from').isVisible() && (await page.inputValue('#r-from')) === '2026-10-01');
    await page.fill('#r-from', '2026-10-20'); await page.dispatchEvent('#r-from', 'change');
    ok('picked dates: 20 to 26 Oct = 21.825 + 50 + 21.60 + 1.80', (await total(page)) === '£95.23', await total(page));
    await page.click('#periods .chip[data-p="month"]');

    // ---------- 4. copy, email, spreadsheet ----------
    await page.click('#copy-claim');
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    ok('copy claim', clip.startsWith('Mileage claim: October 2026\n5 trips, 248.5 mi\nRate: UK: HMRC car or van\n248.5 miles at 45p = £111.83') && clip.includes('Total to claim: £116.83') && clip.includes('Thu 1 Oct 2026 · Home ⇄ Smith Ltd, Leeds · Boiler repair · 48.0 mi · £21.60'), clip);
    ok('copy message', (await msg(page)).startsWith('Copied the claim for October 2026.'));
    const href = await page.getAttribute('#email-claim', 'href');
    ok('email link with no recipient', href.startsWith('mailto:?subject=Mileage%20claim%3A%20October%202026&body=') && decodeURIComponent(href).includes('Total to claim: £116.83'), href.slice(0, 120));
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#csv')]);
    const csv = fs.readFileSync(await dl.path(), 'utf8');
    ok('CSV file name', dl.suggestedFilename() === 'mileage-october-2026.csv', dl.suggestedFilename());
    ok('CSV rows and total', csv.split('\r\n').length === 8 && csv.includes('2026-10-23,My car,Home,Training centre,Course,100.0,mi,no,,,1,0.45 + 0.05 per passenger,50.00') && csv.includes('Total,,,,,248.5,mi,,,,,,116.83'), csv);
    // optional name
    ok('name field hidden until asked', !(await page.locator('#s-name').isVisible()));
    await page.click('#so-name'); await page.fill('#s-name', 'Sarah Khan');
    ok('name added to the claim', decodeURIComponent(await page.getAttribute('#email-claim', 'href')).includes('Name: Sarah Khan'));
    // print does not crash
    await page.evaluate(() => { window.print = () => { window.__printed = true; }; });
    await page.click('#print');
    ok('print button prints', await page.evaluate(() => window.__printed === true));

    // ---------- 5. currency ----------
    await page.selectOption('#s-cur', '$');
    ok('currency changes everywhere', (await total(page)) === '$116.83' && (await txt(page, '#claim-body')).includes('248.5 miles at 45¢'), await txt(page, '#claim-body'));
    await page.selectOption('#s-cur', '');
    ok('no currency: plain numbers', (await total(page)) === '116.83' && (await txt(page, '#claim-body')).includes('248.5 miles at 0.45 = 111.83'), await txt(page, '#claim-body'));
    await page.selectOption('#s-cur', '£');

    // ---------- 6. second vehicle with its own rate in km ----------
    await page.click('#add-veh');
    ok('add vehicle: empty name, rate copied from the first', (await page.inputValue('#v-name')) === '' && await page.isChecked('input[name="v-rule"][value="uk-car"]'));
    await page.click('#v-save');
    ok('vehicle without name refused', (await txt(page, '#ve-name')).startsWith('Give the vehicle a name'));
    await page.locator('#v-names .chip', { hasText: 'My car' }).click(); await page.click('#v-save');
    ok('duplicate vehicle name refused', (await txt(page, '#ve-name')).startsWith('You already have a vehicle with this name'));
    await page.locator('#v-names .chip', { hasText: 'Motorbike' }).click();
    await page.check('input[name="v-rule"][value="custom"]');
    ok('own rate: fields shown', await page.locator('#vw-own').isVisible());
    ok('own rate: optional parts hidden behind buttons', !(await page.locator('#vw-limit').isVisible()) && !(await page.locator('#vw-pass').isVisible()));
    await page.selectOption('#v-unit', 'km');
    ok('own rate: labels follow km', (await txt(page, '#vl-rate')) === 'Rate per km' && (await txt(page, '#vo-limit')).includes('number of km a year'));
    await page.fill('#v-rate', 'abc'); await page.click('#v-save');
    ok('bad rate refused', (await txt(page, '#ve-rate')).startsWith('Type the rate as a number'));
    await page.fill('#v-rate', '45');
    ok('a rate that looks like pence is questioned', (await txt(page, '#v-preview')).includes('Check: that is £45.00 a km. For 45p or 45 cents type 0.45 or 45p.'), await txt(page, '#v-preview'));
    await page.fill('#v-rate', '24p');
    await page.selectOption('#v-ys', '01-01');
    ok('own rate preview', (await txt(page, '#v-preview')) === 'Your own rate: 24p a km. Year from 1 Jan.', await txt(page, '#v-preview'));
    await page.click('#v-save');
    ok('second vehicle added', (await page.locator('.veh').count()) === 2 && (await msg(page)).startsWith('Added Motorbike.'));
    ok('two tax year boxes', (await page.locator('.yr').count()) === 2 && (await txt(page, '#year-h')) === 'This tax year so far');
    await page.click('#add-trip');
    ok('vehicle choice now shown', await page.locator('#tw-veh').isVisible());
    await page.selectOption('#t-veh', { label: 'Motorbike' });
    ok('label switches to km and passengers are hidden', (await txt(page, '#tl-dist')) === 'Business km' && !(await page.locator('#to-pass').isVisible()));
    await page.keyboard.press('Escape');
    pv = await addTrip(page, { veh: 'Motorbike', date: '2026-10-10', to: 'Depot', purpose: 'Collect parts', dist: '20' });
    ok('km trip preview', pv === 'Adds £4.80 to your claim: 20.0 km at 24p.', pv);
    const cb2 = await txt(page, '#claim-body');
    ok('mixed units listed apart, per vehicle', cb2.includes('248.5 mi and 20.0 km') && cb2.includes('Motorbike: 20.0 km at 24p = £4.80') && (await total(page)) === '£121.63', cb2);
    ok('vehicle name shown in trip boxes', (await txt(page, '#trip-list')).includes('Motorbike'));
    // the rate changes from a date: older trips keep the old rate
    await page.locator('.veh', { hasText: 'Motorbike' }).locator('button').click();
    ok('edit own rate: when-choice shown because it has trips', await page.locator('#vw-when').isVisible() && (await page.inputValue('#v-rate')) === '0.24');
    await page.fill('#v-rate', '0.30');
    await page.check('input[name="v-when"][value="from"]');
    await page.fill('#v-when-date', '2026-10-15'); await page.dispatchEvent('#v-when-date', 'change');
    ok('preview says older trips keep the old rate', (await txt(page, '#v-preview')).includes('Trips before 15 Oct 2026 keep the old rate.'), await txt(page, '#v-preview'));
    await page.click('#v-save');
    ok('old trip keeps 24p', (await total(page)) === '£121.63');
    ok('vehicle box shows both rates', (await txt(page, '#veh-list')).includes('24p a km. From 15 Oct 2026: 30p a km. Year from 1 Jan.'), await txt(page, '#veh-list'));
    await addTrip(page, { veh: 'Motorbike', date: '2026-10-16', to: 'Depot', purpose: 'Collect parts', dist: '20' });
    ok('new trip at 30p', (await total(page)) === '£127.63', await total(page));
    // delete the vehicle and its trips, then undo
    await page.locator('.veh', { hasText: 'Motorbike' }).locator('button').click();
    await page.click('#v-del');
    ok('vehicle deleted with its trips', (await page.locator('.veh').count()) === 1 && (await total(page)) === '£116.83' && (await msg(page)).startsWith('Deleted Motorbike and its 2 trips.'));
    await page.click('#trip-msg .undo');
    ok('undo brings the vehicle back', (await page.locator('.veh').count()) === 2 && (await total(page)) === '£127.63');

    // ---------- 7. saved state ----------
    await page.reload({ waitUntil: 'networkidle' });
    ok('reload keeps trips, vehicles, currency and name', (await total(page)) === '£127.63' && (await page.inputValue('#s-cur')) === '£' && (await page.inputValue('#s-name')) === 'Sarah Khan' && await page.locator('#s-name').isVisible());
    await page.click('#periods .chip[data-p="year"]');
    await page.reload({ waitUntil: 'networkidle' });
    ok('chosen period remembered', (await page.getAttribute('#periods .chip[data-p="year"]', 'aria-pressed')) === 'true');
    // backup and restore
    const [bk] = await Promise.all([page.waitForEvent('download'), page.click('#backup')]);
    const backup = fs.readFileSync(await bk.path(), 'utf8');
    ok('backup file', bk.suggestedFilename() === 'mileage-log-backup-2026-10-26.json' && JSON.parse(backup).trips.length === 8);
    await page.click('#wipe');
    ok('delete everything: back to Start here', await page.locator('#start').isVisible() && (await txt(page, '#set-msg')).startsWith('Deleted everything.'));
    await page.click('#set-msg .undo');
    ok('undo delete everything', (await page.locator('.veh').count()) === 2);
    await page.setInputFiles('#restore-file', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"nope":1}') });
    await page.waitForTimeout(200);
    ok('wrong file refused', (await txt(page, '#set-msg')).startsWith('That file is not a backup from this app.'));
    await page.click('#wipe');
    await page.setInputFiles('#restore-file', { name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(backup) });
    await page.waitForTimeout(200);
    ok('backup restored', (await txt(page, '#set-msg')).startsWith('Restored 2 vehicles and 8 trips.'), await txt(page, '#set-msg'));
    await ctx.close();

    // corrupt saved data: start fresh with a message
    ({ ctx, page } = await newPage({}, `try { if (!sessionStorage.getItem('c')) { localStorage.setItem(${JSON.stringify(KEY)}, '{broken'); sessionStorage.setItem('c', '1'); } } catch (e) {}`));
    ok('corrupt state: fresh start', await page.locator('#start').isVisible());
    ok('corrupt state: message', (await txt(page, '#set-msg')).startsWith('The saved trips could not be read'));
    await ctx.close();
    // blocked storage: warning shown, the app still works
    ({ ctx, page } = await newPage({}, `Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } });`));
    ok('blocked storage: warning', await page.locator('#storage-warn').isVisible());
    await page.click('#start-btn'); await page.check('input[name="v-rule"][value="us-irs"]'); await page.click('#v-save');
    ok('blocked storage: still works ($ from the IRS rate)', (await total(page)) === '$0.00');
    await ctx.close();

    // ---------- 8. crossing the HMRC 10,000 miles through the page ----------
    const big = { v: 1, nextId: 10, vehicles: [{ id: 1, name: 'My car', rule: 'uk-car', custom: null }], trips: [
        { id: 2, veh: 1, date: '2026-05-01', from: '', to: 'A', purpose: 'x', t: 49850, back: false, odo: null, pass: 0 },
        { id: 3, veh: 1, date: '2026-06-01', from: '', to: 'B', purpose: 'x', t: 49850, back: false, odo: null, pass: 0 }] };
    ({ ctx, page } = await newPage({ viewport: { width: 1280, height: 900 } }, seed(big, '£')));
    ok('30 miles left before the limit', (await txt(page, '#year-body')).includes('30.0 miles left at 45p before the rate drops to 25p'), await txt(page, '#year-body'));
    pv = await addTrip(page, { date: '2026-10-21', to: 'Customer', purpose: 'Job', dist: '48' });
    ok('split preview', pv === 'Adds £18.00 to your claim for 48.0 mi: 30.0 mi at 45p and 18.0 mi at 25p, because this trip passes the 10,000-mile yearly limit.', pv);
    ok('split shown in the trip box', (await txt(page, '#trip-list')).includes('48.0 mi: 30.0 mi at 45p + 18.0 mi at 25p (this trip passed the 10,000-mile limit).'), await txt(page, '#trip-list'));
    ok('October breakdown by rate', (await txt(page, '#claim-body')).includes('30.0 miles at 45p = £13.50') && (await txt(page, '#claim-body')).includes('18.0 miles at 25p (after the yearly limit) = £4.50'));
    ok('tax year box: past the limit', (await txt(page, '#year-body')).includes('Past the 10,000-mile limit: the rest of this tax year is at 25p a mile (resets on 6 Apr 2027).'));
    await ctx.close();

    // ---------- 9. layout at every width, dark and light ----------
    for (const scheme of ['dark', 'light']) {
        ({ ctx, page } = await newPage({ colorScheme: scheme, viewport: { width: 1280, height: 900 } }, seed(DEMO, '£')));
        for (const w of [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920]) {
            await page.setViewportSize({ width: w, height: 900 });
            const tag = scheme + ' ' + w + ': ';
            for (const p of ['month', 'year']) {
                await page.click('#periods .chip[data-p="' + p + '"]');
                const out = await page.evaluate(() => { const W = document.documentElement.clientWidth; return { scroll: document.documentElement.scrollWidth > W, out: [...document.querySelectorAll('main *')].filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.right > W + 1 || r.left < -1); }).slice(0, 5).map(e => e.className || e.tagName) }; });
                ok(tag + p + ': no horizontal scroll', !out.scroll && !out.out.length, out);
            }
            await page.click('#periods .chip[data-p="month"]');
            if (w >= 900) for (const pos of [0, .5, 1]) {
                await page.evaluate(f => scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * f), pos);
                const ov = await page.evaluate(() => {
                    const bad = [];
                    document.querySelectorAll('main, .app, .col-main, .col-side').forEach(par => {
                        const kids = [...par.children].filter(k => k.offsetParent !== null && getComputedStyle(k).display !== 'contents');
                        for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
                            const a = kids[i].getBoundingClientRect(), b = kids[j].getBoundingClientRect();
                            if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2) bad.push(kids[i].className + ' / ' + kids[j].className);
                        }
                    });
                    return bad;
                });
                ok(tag + 'no overlapping blocks at ' + pos * 100 + '%', !ov.length, ov);
            }
            if (w >= 1280) {
                const cols = await page.evaluate(() => [document.querySelector('.col-main').getBoundingClientRect(), document.querySelector('.col-side').getBoundingClientRect()].map(r => Math.round(r.left)));
                ok(tag + 'two columns side by side', cols[1] > cols[0] + 300, cols);
            }
            if (w <= 390) {
                const overlap = sel => page.evaluate(s => {
                    const els = [...document.querySelectorAll(s)].filter(e => e.checkVisibility()).map(e => ({ e, r: e.getBoundingClientRect() }));
                    const bad = [];
                    for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
                        const a = els[i].r, b = els[j].r;
                        if (els[i].e.contains(els[j].e) || els[j].e.contains(els[i].e)) continue;
                        if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) bad.push((els[i].e.id || els[i].e.textContent.slice(0, 20)) + ' / ' + (els[j].e.id || els[j].e.textContent.slice(0, 20)));
                    }
                    return bad;
                }, sel);
                const fits = dlg => page.evaluate(d => [...document.querySelectorAll('#' + d + ' input[placeholder]')].filter(i => i.checkVisibility()).filter(i => {
                    const c = document.createElement('canvas').getContext('2d'), cs = getComputedStyle(i); c.font = cs.fontSize + ' ' + cs.fontFamily;
                    return c.measureText(i.placeholder).width > i.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
                }).map(i => i.id), dlg);
                await page.evaluate(() => scrollTo(0, 0));
                if (await page.locator('#so-name').isVisible()) await page.click('#so-name');
                let o = await overlap('main button, main input, main select, main a.secondary');
                ok(tag + 'page controls do not overlap', !o.length, o);
                await page.click('#periods .chip[data-p="custom"]');
                o = await overlap('main button, main input, main select, main a.secondary');
                ok(tag + 'page controls do not overlap with picked dates', !o.length, o);
                await page.click('#periods .chip[data-p="month"]');
                await page.click('#add-trip');
                await page.click('#to-pass');
                o = await overlap('#d-trip button, #d-trip input, #d-trip select');
                ok(tag + 'trip window controls do not overlap', !o.length, o);
                let fit = await fits('d-trip'); ok(tag + 'trip placeholders fit', !fit.length, fit);
                await page.click('#to-odo');
                o = await overlap('#d-trip button, #d-trip input, #d-trip select');
                ok(tag + 'trip window with odometer does not overlap', !o.length, o);
                fit = await fits('d-trip'); ok(tag + 'odometer placeholders fit', !fit.length, fit);
                ok(tag + 'trip window inside the screen', await page.locator('#d-trip').evaluate(d => { const r = d.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; }));
                await page.keyboard.press('Escape');
                await page.locator('.veh button').first().click();
                await page.check('input[name="v-rule"][value="custom"]');
                for (const b of ['#vo-limit', '#vo-pass']) if (await page.locator(b).isVisible()) await page.click(b);
                o = await overlap('#d-veh button, #d-veh input:not([type=radio]), #d-veh select, #d-veh label.radio');
                ok(tag + 'vehicle window controls do not overlap', !o.length, o);
                fit = await fits('d-veh'); ok(tag + 'vehicle placeholders fit', !fit.length, fit);
                await page.keyboard.press('Escape');
            }
        }
        if (scheme === 'dark') {
            const bg1 = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
            await page.locator('.theme-toggle').click();
            const bg2 = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
            ok('theme switch changes the colours', bg1 !== bg2, [bg1, bg2]);
            await page.locator('.theme-toggle').click();
        }
        await ctx.close();
    }

    // ---------- 10. the demo reads as in the README, Help at four widths ----------
    ({ ctx, page } = await newPage({ viewport: { width: 1280, height: 900 } }, seed(DEMO, '£')));
    ok('demo: October claim £185.40 + £8.80', (await total(page)) === '£194.20' && (await txt(page, '.total-sub')) === 'October 2026: 5 trips, 412.0 mi.', [await total(page), await txt(page, '.total-sub')]);
    ok('demo: passenger extra', (await txt(page, '#claim-body')).includes('Passenger extra: 176.0 passenger miles at 5p = £8.80'), await txt(page, '#claim-body'));
    ok('demo: tax year', (await txt(page, '#year-body')).includes('So far: 2,860.8 miles, £1,296.16. 7,139.2 miles left at 45p before the rate drops to 25p (limit 10,000 miles, resets on 6 Apr 2027).'), await txt(page, '#year-body'));
    console.log('demo year box: ' + (await txt(page, '#year-body')) + ' | ' + (await total(page)) + ' | ' + (await txt(page, '#claim-body')));
    for (const w of [320, 390, 820, 1280]) {
        await page.setViewportSize({ width: w, height: 800 });
        await page.evaluate(() => scrollTo(0, 0));
        await page.click('.help-btn');
        const d = page.locator('dialog.help');
        const r = await d.boundingBox();
        ok('help ' + w + ': opens inside the screen', await d.evaluate(e => e.open) && r.x >= 0 && r.x + r.width <= w && r.y >= 0 && r.y + r.height <= 800, r);
        ok('help ' + w + ': title', (await d.locator('h2').innerText()) === 'How to use Business Mileage Log for Tax and Expense Claims');
        await page.keyboard.press('Escape');
        ok('help ' + w + ': Escape closes', !(await d.evaluate(e => e.open)));
        await page.click('.help-btn'); await page.locator('.help-close').click();
        ok('help ' + w + ': Got it closes', !(await d.evaluate(e => e.open)));
        const bar = await page.evaluate(() => { const b = [...document.querySelectorAll('.topbar > *')].map(e => e.getBoundingClientRect()); return { rows: new Set(b.map(r => Math.round(r.top))).size, overlap: b.some((a, i) => b.some((c, j) => j > i && Math.min(a.right, c.right) - Math.max(a.left, c.left) > 1 && Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top) > 1)) }; });
        ok('help ' + w + ': top bar on one row, no overlap', bar.rows === 1 && !bar.overlap, bar);
    }
    // keyboard only: Tab reaches "+ Add a trip" and Enter opens it
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.evaluate(() => { scrollTo(0, 0); document.activeElement && document.activeElement.blur(); });
    let reached = false;
    for (let i = 0; i < 12 && !reached; i++) { await page.keyboard.press('Tab'); reached = await page.evaluate(() => document.activeElement && document.activeElement.id === 'add-trip'); }
    ok('keyboard: Tab reaches + Add a trip', reached);
    await page.keyboard.press('Enter');
    ok('keyboard: Enter opens the trip window with To focused', await isOpen(page, 'd-trip') && await page.evaluate(() => document.activeElement.id === 't-to'));
    await page.keyboard.press('Escape');

    // ---------- 11. screenshots ----------
    if (SHOTS) {
        await page.evaluate(() => { document.activeElement && document.activeElement.blur(); scrollTo(0, 0); });
        await page.screenshot({ path: path.join(__dirname, 'screenshots', 'desktop.png'), fullPage: false });
        await ctx.close();
        ({ ctx, page } = await newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }, seed(DEMO, '£')));
        await page.evaluate(() => scrollTo(0, 0));
        await page.screenshot({ path: path.join(__dirname, 'screenshots', 'phone.png') });
    }
    await ctx.close();

    for (const f of ['favicon.svg', 'manifest.webmanifest', 'sw.js', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'screenshots/desktop.png', 'screenshots/phone.png', 'test.html', '../help.js', '../theme.js']) {
        const res = await fetch(URL + f); ok('file answers 200: ' + f, res.status === 200, res.status);
    }
    ['style.css', 'core.js', 'script.js', 'help.js', 'theme.js'].forEach(f => ok('requested ' + f, [...requested].some(u => u.endsWith('/' + f))));
    ok('no failed requests', !failed.length, failed);
    ok('no console errors', !errors.length, errors);
    await browser.close(); if (srv) srv.close();
    console.log(pass + ' passed, ' + fail + ' failed' + (fail ? '' : '. ALL GOOD'));
    process.exitCode = fail ? 1 : 0;
})();
