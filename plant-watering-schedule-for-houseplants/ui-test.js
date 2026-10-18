// Full page test with Playwright. Run from the repo root or this folder: node ui-test.js
//   BASE=https://umar8092.github.io/apps node ui-test.js   tests the live site
//   node ui-test.js --shots                                 also saves screenshots/desktop.png and phone.png
// "Today" is fixed to Sun 18 Oct 2026 in Pakistan time so every answer can be checked exactly.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), SLUG = 'plant-watering-schedule-for-houseplants', KEY = SLUG + '.state';
const SHOTS = process.argv.includes('--shots');
const NOW = new Date('2026-10-18T10:00:00+05:00');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; if (!cond) console.log('FAIL ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra).slice(0, 400) : '')); };

function serve() {
    const types = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml', png: 'image/png', webmanifest: 'application/manifest+json' };
    return new Promise(res => { const s = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0].replace(/^\/apps/, '')); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': types[f.split('.').pop()] || 'application/octet-stream' }); r.end(fs.readFileSync(f)); }).listen(0, () => res(s)); });
}

(async () => {
    let srv, base = process.env.BASE;
    if (!base) { srv = await serve(); base = 'http://localhost:' + srv.address().port + '/apps'; }
    const URL = base + '/' + SLUG + '/';
    const browser = await chromium.launch();
    const errors = [], failed = [], requested = new Set();
    async function newPage(opts, init) {
        const ctx = await browser.newContext(Object.assign({ viewport: { width: 390, height: 844 }, acceptDownloads: true, timezoneId: 'Asia/Karachi', colorScheme: 'dark' }, opts || {}));
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
    const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const boxOf = (page, name) => page.locator('li.box', { has: page.locator('.box-name', { hasText: new RegExp('^' + esc(name) + '$') }) });
    const stOf = (page, name) => boxOf(page, name).locator('.st').innerText();
    const names = (page, g) => page.locator('#l-' + g + ' .box-name').allInnerTexts();
    const txt = (page, sel) => page.locator(sel).innerText();
    async function add(page, f) {
        if (!(await page.locator('#form').isVisible())) await page.click('#open-form');
        await page.fill('#f-name', f.name);
        if (f.custom) { await page.selectOption('#f-every', 'custom'); await page.fill('#f-everydays', String(f.custom)); }
        else await page.selectOption('#f-every', String(f.every));
        if (f.chip) await page.click('#quick-last .chip:text-is("' + f.chip + '")'); else await page.fill('#f-last', f.last);
        if (f.winter) { await page.click('#o-winter'); await page.selectOption('#f-winter', String(f.winter)); }
        if (f.place || f.note) { if (await page.locator('#o-more').isVisible()) await page.click('#o-more'); await page.fill('#f-place', f.place || ''); await page.fill('#f-note', f.note || ''); }
        if (f.feed) { await page.click('#o-feed'); await page.selectOption('#f-feed', String(f.feed)); if (f.lastFed) await page.fill('#f-lastfed', f.lastFed); }
        if (f.check) await f.check();
        await page.click('#save');
    }
    const SARA = [
        { name: 'Monstera', every: 7, last: '2026-10-11', winter: 14, place: 'Living room', feed: 28, lastFed: '2026-09-20' },
        { name: 'Basil', every: 2, last: '2026-10-15', place: 'Kitchen window', note: 'Water from below' },
        { name: 'Fern', every: 3, last: '2026-10-17', place: 'Bathroom' },
        { name: 'Snake plant', every: 21, last: '2026-10-03', winter: 28, place: 'Living room' },
        { name: 'Peace lily', every: 5, last: '2026-10-14', place: 'Bedroom' },
        { name: 'Aloe vera', every: 14, last: '2026-10-09', place: 'Kitchen window' },
    ];
    const FILLED = JSON.stringify({ v: 1, season: 'summer', nextId: 7, trip: { from: '2026-10-24', to: '2026-11-01', beforeAll: true }, plants: SARA.map((f, i) => ({ id: i + 1, name: f.name, every: f.every, winterEvery: f.winter || 0, last: f.last, snooze: '', history: [f.last], place: f.place || '', note: f.note || '', feedEvery: f.feed || 0, lastFed: f.lastFed || '', feedPauseWinter: !!f.feed, status: 'active', added: '2026-10-18' })) });
    async function fill(page) { for (const f of SARA) await add(page, f); await page.click('#cancel'); }

    // ---------- 1. first use ----------
    let { ctx, page } = await newPage();
    ok('title', (await page.title()).startsWith('Plant Watering Schedule for Houseplants'));
    ok('h1', (await txt(page, 'h1')) === 'Plant Watering Schedule for Houseplants');
    ok('back link', await page.locator('main a.back[href="../"]').isVisible());
    ok('summary empty', (await txt(page, '#sum-body')).startsWith('No plants yet'));
    ok('form open first', await page.locator('#form').isVisible());
    ok('form above today on phone at first use', (await page.locator('#add').boundingBox()).y < (await page.locator('#summary').boundingBox()).y);
    ok('Done hidden while empty', !(await page.locator('#cancel').isVisible()));
    ok('list card hidden while empty', !(await page.locator('#list').isVisible()));
    ok('optional parts hidden', !(await page.locator('#w-winter').isVisible()) && !(await page.locator('#w-more').isVisible()) && !(await page.locator('#w-feed').isVisible()));
    ok('season hidden', !(await page.locator('#season').isVisible()));
    ok('trip inputs hidden while empty', !(await page.locator('#t-from').isVisible()) && await page.locator('#trip-empty').isVisible());
    ok('share hidden while empty', !(await page.locator('#copy-all').isVisible()));
    ok('last watered defaults to today', (await page.inputValue('#f-last')) === '2026-10-18');
    ok('preview on first use', (await txt(page, '#preview')) === 'Next water: Sun 25 Oct (in 7 days), then every week.');
    // blank name
    await page.click('#save');
    ok('blank name error', (await txt(page, '#e-name')).startsWith('Type the plant'));
    ok('nothing saved on error', (await page.evaluate(k => localStorage.getItem(k), KEY)) === null);
    // custom days errors
    await page.fill('#f-name', 'Test');
    await page.selectOption('#f-every', 'custom');
    for (const v of ['0', '-1', '2.5', '91', '', 'ab']) { await page.fill('#f-everydays', v); await page.click('#save'); ok('bad days ' + v, (await txt(page, '#e-every')).startsWith('Type a whole number'), v); }
    // future date
    await page.selectOption('#f-every', '7');
    await page.fill('#f-last', '2026-10-20'); await page.click('#save');
    ok('future last error', (await txt(page, '#e-last')).includes('cannot be in the future'));
    ok('preview hidden for future date', (await txt(page, '#preview')) === '');
    // not sure
    await page.click('#quick-last .chip:text-is("Not sure")');
    ok('not sure empties date', (await page.inputValue('#f-last')) === '');
    ok('not sure hint', (await txt(page, '#h-last')).startsWith('Not sure: the plant will show as needing water today'));
    ok('not sure preview', (await txt(page, '#preview')) === 'Next water: today, then every week.');
    await page.click('#quick-last .chip:text-is("Yesterday")');
    ok('yesterday chip', (await page.inputValue('#f-last')) === '2026-10-17');
    await page.fill('#f-name', '');

    // ---------- 2. Sara's plants ----------
    await fill(page);
    ok('no errors while adding', errors.length === 0, errors);
    ok('summary names', (await txt(page, '#sum-body .next')) === 'Basil (1 day late), Monstera', await txt(page, '#sum-body'));
    ok('summary label', (await txt(page, '#sum-body .next-label')) === '2 plants need water today');
    ok('summary next', (await txt(page, '#sum-body .next-left')) === 'Next: Peace lily, tomorrow, Mon 19 Oct.');
    ok('summary plant food', (await txt(page, '#sum-body .feed-due')) === 'Plant food today: Monstera');
    ok('water all button', (await txt(page, '#water-all')) === 'I watered all 2');
    ok('water now group', JSON.stringify(await names(page, 'now')) === '["Basil","Monstera"]');
    ok('coming up group', JSON.stringify(await names(page, 'later')) === '["Peace lily","Fern","Aloe vera","Snake plant"]', await names(page, 'later'));
    ok('basil late line', (await stOf(page, 'Basil')) === 'Water now: 1 day late (was due Sat 17 Oct)');
    ok('monstera today', (await stOf(page, 'Monstera')) === 'Water today');
    ok('fern line', (await stOf(page, 'Fern')) === 'Water Tue 20 Oct (in 2 days)');
    ok('snake line', (await stOf(page, 'Snake plant')) === 'Water Sat 24 Oct (in 6 days)');
    ok('monstera sub', (await boxOf(page, 'Monstera').locator('.box-sub').innerText()) === 'Living room · Water every week (winter: every 2 weeks) · last watered Sun 11 Oct (7 days ago)');
    ok('monstera feed', (await boxOf(page, 'Monstera').locator('.feed').innerText()) === 'Plant food: due today');
    ok('basil note shown', (await boxOf(page, 'Basil').locator('.box-note').innerText()) === 'Water from below');
    ok('still wet only on due plants', await boxOf(page, 'Basil').locator('button:text-is("Still wet")').count() === 1 && await boxOf(page, 'Fern').locator('button:text-is("Still wet")').count() === 0);
    ok('fed only with plant food', await boxOf(page, 'Monstera').locator('button:text-is("Fed")').count() === 1 && await boxOf(page, 'Basil').locator('button:text-is("Fed")').count() === 0);
    ok('season shown with winter numbers', await page.locator('#season').isVisible());
    ok('place filter shown', await page.locator('#places').isVisible());
    ok('place filter labels', JSON.stringify(await page.locator('#places .place').allInnerTexts()) === '["All (6)","Bathroom (1)","Bedroom (1)","Kitchen window (2)","Living room (2)"]', await page.locator('#places .place').allInnerTexts());
    ok('saved', JSON.parse(await page.evaluate(k => localStorage.getItem(k), KEY)).plants.length === 6);
    ok('summary first after setup', (await page.locator('#summary').boundingBox()).y < (await page.locator('#add').boundingBox()).y);

    // filter
    await page.click('#places .place:text-is("Kitchen window (2)")');
    ok('filter kitchen', JSON.stringify((await names(page, 'now')).concat(await names(page, 'later'))) === '["Basil","Aloe vera"]');
    await page.click('#open-form');
    ok('new plant takes filtered place', (await page.inputValue('#f-place')) === 'Kitchen window' && await page.locator('#w-more').isVisible());
    await page.click('#cancel');
    await page.click('#places .place:text-is("All (6)")');

    // ---------- 3. trip ----------
    ok('trip inputs shown', await page.locator('#t-from').isVisible());
    await page.fill('#t-from', '2026-10-24'); await page.fill('#t-to', '2026-11-01');
    const trip = await txt(page, '#trip-text');
    const want = ['Watering my plants while I am away: Sat 24 Oct to Sun 1 Nov (9 days)', 'I water all of them on Fri 23 Oct, the day before I leave.', '',
        'Sun 25 Oct: Basil (Kitchen window)', 'Mon 26 Oct: Fern (Bathroom)', 'Tue 27 Oct: Basil (Kitchen window)', 'Wed 28 Oct: Peace lily (Bedroom)',
        'Thu 29 Oct: Basil (Kitchen window), Fern (Bathroom)', 'Fri 30 Oct: Monstera (Living room)', 'Sat 31 Oct: Basil (Kitchen window)', 'Sun 1 Nov: Fern (Bathroom)', '',
        'No water needed while I am away: Aloe vera (Kitchen window), Snake plant (Living room).', '', 'Notes:', '- Basil: Water from below', '', 'Thank you!'].join('\n');
    ok('trip text exact', trip === want, trip);
    ok('trip mail link', (await page.getAttribute('#trip-mail', 'href')).startsWith('mailto:?subject=Watering%20my%20plants'));
    await page.click('#trip-copy');
    ok('trip copied', (await page.evaluate(() => navigator.clipboard.readText())) === want);
    await page.uncheck('#t-before');
    ok('own rhythm basil first day', (await txt(page, '#trip-text')).includes('Sat 24 Oct: Basil (Kitchen window), Peace lily (Bedroom), Snake plant (Living room)'), await txt(page, '#trip-text'));
    await page.check('#t-before');
    await page.fill('#t-to', '2026-10-20');
    ok('trip to before from', (await txt(page, '#e-trip')) === 'The last day away is before the first day.' && !(await page.locator('#trip-out').isVisible()));
    await page.fill('#t-from', '2026-10-10');
    ok('trip in past', (await txt(page, '#e-trip')) === 'The first day away cannot be in the past.');
    await page.fill('#t-from', '2026-10-24'); await page.fill('#t-to', '2026-11-01');
    ok('trip saved', JSON.parse(await page.evaluate(k => localStorage.getItem(k), KEY)).trip.to === '2026-11-01');

    // ---------- 4. daily actions ----------
    await boxOf(page, 'Basil').locator('button:text-is("Watered")').click();
    ok('watered message', (await txt(page, '#list-msg')).startsWith('Basil watered. Next: Tue 20 Oct (in 2 days).'));
    ok('basil moved', (await stOf(page, 'Basil')) === 'Water Tue 20 Oct (in 2 days)');
    ok('summary single', (await txt(page, '#sum-body .next')) === 'Monstera' && await page.locator('#water-all').count() === 0);
    await boxOf(page, 'Basil').locator('button:text-is("Watered")').click();
    ok('watered twice same day', (await txt(page, '#list-msg')).startsWith('Basil is already marked watered today'));
    // undo
    await boxOf(page, 'Monstera').locator('button:text-is("Watered")').click();
    ok('monstera watered', (await stOf(page, 'Monstera')) === 'Water Sun 25 Oct (in 7 days)');
    await page.click('#list-msg .undo');
    ok('undo watering', (await stOf(page, 'Monstera')) === 'Water today');
    // still wet
    await boxOf(page, 'Monstera').locator('button:text-is("Still wet")').click();
    ok('still wet line', (await stOf(page, 'Monstera')) === 'Soil was still wet: check again tomorrow');
    ok('nothing today after still wet', (await txt(page, '#sum-body .next')) === 'Nothing needs water today.');
    await page.click('#list-msg .undo');
    // fed
    await boxOf(page, 'Monstera').locator('button:text-is("Fed")').click();
    ok('fed line', (await boxOf(page, 'Monstera').locator('.feed').innerText()) === 'Plant food: Sun 15 Nov (in 4 weeks)');
    ok('plant food summary gone', await page.locator('#sum-body .feed-due').count() === 0);
    // water all (basil back to late via undo chain: re-create a two-plant due state)
    await page.click('#list-msg .undo');

    // ---------- 5. season ----------
    await page.check('#s-winter');
    ok('winter monstera', (await stOf(page, 'Monstera')) === 'Water Sun 25 Oct (in 7 days)');
    ok('winter plant food paused', (await boxOf(page, 'Monstera').locator('.feed').innerText()) === 'Plant food: paused for winter');
    ok('winter sub', (await boxOf(page, 'Monstera').locator('.box-sub').innerText()).includes('Water every 2 weeks (winter; summer every week)'));
    ok('winter trip changes', (await txt(page, '#trip-text')).includes('Snake plant') && !(await txt(page, '#trip-text')).includes('Fri 30 Oct: Monstera'));
    await page.check('#s-summer');
    ok('summer back', (await stOf(page, 'Monstera')) === 'Water today');

    // ---------- 6. edit, gone, delete ----------
    await boxOf(page, 'Fern').locator('button:text-is("Edit")').click();
    ok('edit form filled', (await page.inputValue('#f-name')) === 'Fern' && (await page.inputValue('#f-every')) === '3' && (await page.inputValue('#f-last')) === '2026-10-17');
    ok('edit heading', (await txt(page, '#form-h')) === 'Edit Fern' && (await txt(page, '#save')) === 'Save changes');
    ok('edit tools shown', await page.locator('#gone').isVisible() && await page.locator('#del').isVisible());
    await page.fill('#f-last', '2026-10-13');
    await page.click('#save');
    ok('edited last date', (await stOf(page, 'Fern')) === 'Water now: 2 days late (was due Fri 16 Oct)');
    await boxOf(page, 'Fern').locator('button:text-is("Edit")').click();
    await page.click('#gone');
    ok('gone moved', JSON.stringify(await page.locator('#l-gone .box-name').allTextContents()) === '["Fern"]' && (await txt(page, '#gone-sum')) === 'Gone plants (1)');
    ok('gone not in trip', !(await txt(page, '#trip-text')).includes('Fern'));
    await page.click('#g-gone summary');
    await boxOf(page, 'Fern').locator('button:text-is("Bring back")').click();
    ok('brought back', (await names(page, 'now')).includes('Fern'));
    await boxOf(page, 'Fern').locator('button:text-is("Edit")').click();
    await page.click('#del');
    ok('deleted', await boxOf(page, 'Fern').count() === 0);
    await page.click('#list-msg .undo');
    ok('delete undone', await boxOf(page, 'Fern').count() === 1);
    // water all
    ok('two due', (await txt(page, '#water-all')) === 'I watered all 2');
    await page.click('#water-all');
    ok('water all message', (await txt(page, '#list-msg')).startsWith('Watered Fern, Monstera.'), await txt(page, '#list-msg'));
    ok('nothing due after all', (await txt(page, '#sum-body .next')) === 'Nothing needs water today.');
    await page.click('#list-msg .undo');
    ok('water all undone', (await txt(page, '#water-all')) === 'I watered all 2');
    // duplicate name warning
    await add(page, { name: 'basil', every: 2, chip: 'Today', place: 'Kitchen window' });
    ok('duplicate warns, both kept', (await txt(page, '#form-msg')).includes('You already have a plant called basil in Kitchen window. Both are kept.') && await page.locator('li.box .box-name:text-is("basil")').count() === 1);
    ok('form kept place for next plant', (await page.inputValue('#f-place')) === 'Kitchen window');
    await page.click('#cancel');
    // very long name and note
    await add(page, { name: 'A'.repeat(80), every: 7, chip: 'Today', note: 'x'.repeat(320) });
    const long = JSON.parse(await page.evaluate(k => localStorage.getItem(k), KEY)).plants.slice(-1)[0];
    ok('long name capped', long.name.length === 60 && long.note.length === 300);
    ok('no horizontal scroll with long text', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.click('#cancel');
    // pasted text with odd spaces
    await add(page, { name: '  Spider\tplant  ', every: 4, chip: 'Today' });
    ok('pasted name tidied', await boxOf(page, 'Spider plant').count() === 1);
    await page.click('#cancel');

    // ---------- 7. copy list, calendar, backup, reload ----------
    await page.click('#copy-all');
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    ok('copied list', clip.startsWith('My plants, Sun 18 Oct 2026\n\nWater today:') && clip.includes('- Fern (Bathroom): water now: 2 days late (was due Fri 16 Oct), every 3 days\n- Monstera (Living room): water today, every week') && clip.includes('- Basil (Kitchen window): water Tue 20 Oct (in 2 days), every 2 days. Water from below'), clip.slice(0, 300));
    ok('mail list', (await page.getAttribute('#mail-all', 'href')).startsWith('mailto:?subject=My%20plant%20watering%20list&body='));
    await page.fill('#r-time', '08:30');
    let [dl] = await Promise.all([page.waitForEvent('download'), page.click('#cal')]);
    const ics = fs.readFileSync(await dl.path(), 'utf8');
    ok('calendar file', dl.suggestedFilename() === 'plant-check-reminder.ics' && ics.includes('DTSTART:20261018T083000') && ics.includes('RRULE:FREQ=DAILY'));
    [dl] = await Promise.all([page.waitForEvent('download'), page.click('#backup')]);
    const backupPath = path.join(require('os').tmpdir(), 'plant-backup-test.json'); fs.copyFileSync(await dl.path(), backupPath);
    ok('backup name', dl.suggestedFilename() === 'plant-watering-backup-2026-10-18.json');
    await page.reload({ waitUntil: 'networkidle' });
    ok('reload keeps plants', (await page.locator('li.box').count()) === 9 && (await page.inputValue('#t-from')) === '2026-10-24');
    ok('reload keeps answer', (await stOf(page, 'Fern')) === 'Water now: 2 days late (was due Fri 16 Oct)' && (await stOf(page, 'Basil')) === 'Water Tue 20 Oct (in 2 days)');
    // delete everything + undo
    await page.click('#wipe');
    ok('wiped', (await txt(page, '#sum-body')).startsWith('No plants yet') && (await page.inputValue('#t-from')) === '');
    await page.click('#set-msg .undo');
    ok('wipe undone', (await page.locator('li.box').count()) === 9);
    await page.click('#wipe');
    await page.setInputFiles('#restore-file', backupPath);
    await page.waitForTimeout(300);
    ok('restored', (await txt(page, '#set-msg')).startsWith('Restored 9 plants') && (await page.locator('li.box').count()) === 9);
    const badFile = path.join(require('os').tmpdir(), 'plant-bad.json'); fs.writeFileSync(badFile, '{"hello":1}');
    await page.setInputFiles('#restore-file', badFile); await page.waitForTimeout(300);
    ok('bad backup refused', (await txt(page, '#set-msg')).startsWith('That file is not a backup') && (await page.locator('li.box').count()) === 9);

    // screenshots in the real situation
    if (SHOTS) {
        for (const [w, h, f, scale] of [[1280, 900, 'desktop.png', 1], [390, 844, 'phone.png', 2]]) {
            const c = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: scale, timezoneId: 'Asia/Karachi', colorScheme: 'dark' });
            await c.route(/goatcounter\.com|gc\.zgo\.at/, r => r.fulfill({ status: 200, body: '' }));
            const s = JSON.parse(FILLED);
            await c.addInitScript(([k, v]) => { localStorage.setItem(k, v); }, [KEY, JSON.stringify(s)]);
            const pg = await c.newPage(); await pg.clock.setFixedTime(NOW);
            await pg.goto(URL, { waitUntil: 'networkidle' });
            await pg.screenshot({ path: path.join(__dirname, 'screenshots', f), fullPage: w > 900 });
            await c.close();
        }
    }
    await ctx.close();

    // ---------- 8. corrupt and blocked storage ----------
    ({ ctx, page } = await newPage(null, `localStorage.setItem('${KEY}', '{broken')`));
    ok('corrupt starts fresh', (await txt(page, '#sum-body')).startsWith('No plants yet') && (await txt(page, '#set-msg')).includes('could not be read'));
    await ctx.close();
    ({ ctx, page } = await newPage(null, `localStorage.setItem('${KEY}', JSON.stringify({plants:[{id:1,name:'Ok',every:3,last:'2026-10-17'},{id:2,name:'<img src=x onerror=alert(1)>',every:999}]}))`));
    ok('bad rows dropped', (await page.locator('li.box').count()) === 1);
    await ctx.close();
    ({ ctx, page } = await newPage(null, `Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } })`));
    ok('blocked storage warns', await page.locator('#storage-warn').isVisible());
    await add(page, { name: 'Cactus', every: 21, chip: 'Today' });
    ok('works without storage', await boxOf(page, 'Cactus').count() === 1);
    await ctx.close();

    // ---------- 9. html in names is shown as text ----------
    ({ ctx, page } = await newPage());
    await add(page, { name: '<b>Bold</b>', every: 2, chip: 'Today', note: '<script>x</script>' });
    ok('html as text', await boxOf(page, '<b>Bold</b>').count() === 1 && await page.locator('li.box b').count() === 0);
    // keyboard only: add a plant with Enter
    await page.fill('#f-name', 'Keyboard plant'); await page.press('#f-name', 'Enter');
    ok('enter adds', await boxOf(page, 'Keyboard plant').count() === 1);
    // light/dark switch
    const btn = page.locator('.theme-toggle');
    if (await btn.count()) { const b0 = await page.evaluate(() => getComputedStyle(document.body).backgroundColor); await btn.click(); const b1 = await page.evaluate(() => getComputedStyle(document.body).backgroundColor); ok('theme switch changes colours', b0 !== b1); }
    await ctx.close();

    // ---------- 10. layout at every width with filled state ----------
    for (const w of [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920]) {
        for (const scheme of ['dark', 'light']) {
            ({ ctx, page } = await newPage({ viewport: { width: w, height: 900 }, colorScheme: scheme }, `localStorage.setItem('${KEY}', ${JSON.stringify(FILLED)})`));
            if (w <= 390) { await page.click('#open-form'); await page.click('#o-winter'); await page.click('#o-more'); await page.click('#o-feed'); await page.selectOption('#f-every', 'custom'); await page.selectOption('#f-feed', 'custom'); }
            ok(w + scheme + ' no horizontal scroll', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
            const out = await page.evaluate(() => [...document.querySelectorAll('main *')].filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.right > innerWidth + 1 || r.left < -1); }).map(e => e.id || e.className).slice(0, 5));
            ok(w + scheme + ' nothing sticks out', !out.length, out);
            if (w <= 390) {
                const over = await page.evaluate(() => { const els = [...document.querySelectorAll('main input:not([type=radio]):not([type=checkbox]), main select, main button, main a.secondary')].filter(e => e.offsetParent); const bad = []; for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) { const a = els[i].getBoundingClientRect(), b = els[j].getBoundingClientRect(); if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) bad.push((els[i].id || els[i].textContent) + ' / ' + (els[j].id || els[j].textContent)); } return bad; });
                ok(w + scheme + ' controls do not overlap', !over.length, over);
                const clipped = await page.evaluate(() => [...document.querySelectorAll('main input[placeholder]')].filter(e => e.offsetParent).filter(e => { const c = document.createElement('canvas').getContext('2d'); const s = getComputedStyle(e); c.font = s.fontSize + ' ' + s.fontFamily; return c.measureText(e.placeholder).width > e.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight); }).map(e => e.id));
                ok(w + scheme + ' placeholders fit', !clipped.length, clipped);
            }
            if (w >= 900) {
                for (const pos of [0, 0.5, 1]) {
                    await page.evaluate(p => scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * p), pos);
                    const o = await page.evaluate(() => { const bad = []; document.querySelectorAll('main, .col-main, .col-side').forEach(par => { const k = [...par.children].filter(e => e.offsetParent); for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { const a = k[i].getBoundingClientRect(), b = k[j].getBoundingClientRect(); if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) bad.push((k[i].id || k[i].className) + '/' + (k[j].id || k[j].className)); } }); return bad; });
                    ok(w + scheme + ' no overlap at ' + pos, !o.length, o);
                }
                if (w === 1280) { const a = await page.locator('.col-main').boundingBox(), b = await page.locator('.col-side').boundingBox(); ok('desktop two columns', b.x > a.x + a.width - 1 && Math.abs(a.y - b.y) < 2); }
            }
            if ([320, 390, 820, 1280].includes(w) && scheme === 'dark') {
                await page.evaluate(() => scrollTo(0, 0));
                await page.click('.help-btn');
                const d = page.locator('dialog.help');
                const r = await d.boundingBox();
                ok(w + ' help opens inside', await d.evaluate(e => e.open) && r.x >= 0 && r.x + r.width <= w + 1 && (await d.innerText()).includes('How to use Plant Watering Schedule for Houseplants'));
                await page.keyboard.press('Escape');
                ok(w + ' escape closes help', !(await d.evaluate(e => e.open)));
                await page.click('.help-btn'); await page.locator('.help-close').click();
                ok(w + ' got it closes help', !(await d.evaluate(e => e.open)));
                const tb = await page.evaluate(() => [...document.querySelectorAll('.topbar > *, .topbar button, a.back')].map(e => e.getBoundingClientRect()).map(r => [r.top, r.bottom, r.left, r.right]));
                let clash = false; for (let i = 0; i < tb.length; i++) for (let j = i + 1; j < tb.length; j++) { const a = tb[i], b = tb[j]; const inside = (a[2] >= b[2] && a[3] <= b[3] && a[0] >= b[0] && a[1] <= b[1]) || (b[2] >= a[2] && b[3] <= a[3] && b[0] >= a[0] && b[1] <= a[1]); if (!inside && Math.min(a[3], b[3]) - Math.max(a[2], b[2]) > 1 && Math.min(a[1], b[1]) - Math.max(a[0], b[0]) > 1) clash = true; }
                ok(w + ' top bar does not overlap', !clash);
            }
            await ctx.close();
        }
    }
    // cleared state at phone and desktop
    for (const w of [320, 1280]) { ({ ctx, page } = await newPage({ viewport: { width: w, height: 900 } })); ok(w + ' empty no scroll', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); await ctx.close(); }

    // ---------- files ----------
    for (const f of ['favicon.svg', 'manifest.webmanifest', 'sw.js', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', '../help.js', '../theme.js']) {
        const r = await fetch(URL + f).catch(() => null);
        ok('file ' + f, r && r.ok, r && r.status);
    }
    ok('no console errors', errors.length === 0, errors);
    ok('no failed requests', failed.length === 0, failed);
    await browser.close(); if (srv) srv.close();
    console.log(pass + ' passed, ' + fail + ' failed' + (process.env.BASE ? ' (live: ' + base + ')' : ''));
    process.exit(fail ? 1 : 0);
})();
