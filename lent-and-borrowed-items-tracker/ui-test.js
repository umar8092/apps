// Full page test with Playwright. Run from the repo root or this folder: node ui-test.js
//   BASE=https://umar8092.github.io/apps node ui-test.js   tests the live site
//   node ui-test.js --shots                                 also saves screenshots/desktop.png and phone.png
// "Today" is fixed to Sun 25 Oct 2026 in Pakistan time so every answer can be checked exactly.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), SLUG = 'lent-and-borrowed-items-tracker', KEY = SLUG + '.data';
const SHOTS = process.argv.includes('--shots');
const NOW = new Date('2026-10-25T10:00:00+05:00');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; if (!cond) console.log('FAIL ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra).slice(0, 600) : '')); };

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
    const txt = (page, sel) => page.locator(sel).innerText();
    const item = (page, what) => page.locator('#list-body .item').filter({ has: page.locator('.item-what', { hasText: new RegExp('^' + what) }) });
    const whats = page => page.locator('#list-body .item-what').evaluateAll(e => e.map(x => x.firstChild.textContent));
    async function add(page, o) {
        await page.check('input[name=kind][value="' + (o.kind || 'lent') + '"]');
        await page.fill('#f-what', o.what); await page.fill('#f-who', o.who);
        if (o.date) await page.fill('#f-date', o.date);
        await page.check('input[name=due][value="' + (o.due || 'none') + '"]');
        if (o.dueDate) await page.fill('#f-due', o.dueDate);
        if (o.note) { await page.click('#o-note'); await page.fill('#f-note', o.note); }
        await page.click('#f-save');
    }
    async function tab(page, t) { await page.locator('.tabs label').filter({ has: page.locator('input[value="' + t + '"]') }).click(); }
    async function fill(page) {
        await add(page, { what: 'Drill', who: 'Bilal', date: '2026-09-12', note: 'Comes with 2 drill bits' });
        await add(page, { what: 'Novel', who: 'Hina', date: '2026-09-26', due: 'w2' });
        await add(page, { what: 'Phone charger', who: 'Ali', date: '2026-10-18', due: 'w1' });
        await add(page, { what: 'Camping tent', who: 'Bilal', date: '2026-10-21', due: 'custom', dueDate: '2026-11-08' });
        await add(page, { kind: 'borrowed', what: 'Cake tin', who: 'Aunt Sara', date: '2026-10-20', due: 'custom', dueDate: '2026-10-30' });
        await add(page, { kind: 'borrowed', what: 'Ladder', who: 'Omar', date: '2026-10-24', due: 'w1' });
        await tab(page, 'lent');
    }

    // ---------- 1. first use ----------
    let { ctx, page } = await newPage();
    ok('empty state explains what to do', (await txt(page, '#list-body')).startsWith('Nothing yet. Lent a book, a tool or a dish'));
    ok('tiles start at 0', (await txt(page, '#tiles')).replace(/\s+/g, ' ') === 'You lent out 0 Nothing out You borrowed 0 Nothing to give back', await txt(page, '#tiles'));
    ok('people and search hidden when empty', await page.locator('#people').isHidden() && await page.locator('#search-wrap').isHidden());
    ok('photo and note are optional (hidden behind buttons)', await page.locator('#w-photo').isHidden() && await page.locator('#w-note').isHidden() && await page.locator('#o-photo').isVisible());
    ok('date starts as today', await page.inputValue('#f-date') === '2026-10-25');
    ok('preview with no date', (await txt(page, '#preview')).startsWith('No give-back date'));

    // blank and wrong input
    await page.click('#f-save');
    ok('blank what and who give errors', await txt(page, '#e-what') === 'Type what you lent, such as Drill or Harry Potter book.' && await txt(page, '#e-who') === 'Type who has it, such as Bilal.');
    ok('nothing added on error', (await txt(page, '#cnt-lent')) === '0');
    await page.fill('#f-what', 'Drill'); await page.fill('#f-who', 'Bilal'); await page.fill('#f-date', '2026-10-27'); await page.click('#f-save');
    ok('future date refused', await txt(page, '#e-date') === 'This date is after today. Pick today or an earlier day.');
    await page.fill('#f-date', '2026-09-12'); await page.check('input[name=due][value=custom]');
    ok('Pick a date shows the date box filled one week on', await page.locator('#f-due').isVisible() && await page.inputValue('#f-due') === '2026-09-19');
    await page.fill('#f-due', '2026-09-01'); await page.click('#f-save');
    ok('give-back before lent refused', (await txt(page, '#e-due')).startsWith('The give-back date is before the day it was lent'));
    await page.fill('#f-due', ''); await page.click('#f-save');
    ok('empty custom date refused', await txt(page, '#e-due') === 'Pick the give-back date, or choose "No date".');
    await page.check('input[name=due][value=none]');
    ok('date box hides with No date', await page.locator('#w-due').isHidden());
    // Enter key submits (keyboard only)
    await page.focus('#f-who'); await page.keyboard.press('Enter');
    ok('added with the Enter key', (await txt(page, '#cnt-lent')) === '1');
    ok('added message with undo', (await txt(page, '#add-msg')).startsWith('Added Drill (with Bilal).') && await page.locator('#add-msg .undo').isVisible());
    ok('form cleared after adding', await page.inputValue('#f-what') === '' && await page.inputValue('#f-date') === '2026-10-25');
    ok('drill line exact', await item(page, 'Drill').locator('.item-line').innerText() === 'With Bilal · lent Sat 12 Sep (43 days ago)');
    ok('drill tag', await item(page, 'Drill').locator('.tag').innerText() === 'No give-back date');
    await page.click('#add-msg .undo');
    ok('undo add', (await txt(page, '#cnt-lent')) === '0');

    // ---------- 2. the real situation ----------
    await fill(page);
    ok('errors cleared after good adds', await txt(page, '#e-due') === '' && await txt(page, '#e-date') === '');
    ok('tab counts', [await txt(page, '#cnt-lent'), await txt(page, '#cnt-borrowed'), await txt(page, '#cnt-back')].join('|') === '4|2|0');
    ok('tiles: 4 lent, 1 late, 1 due today', (await txt(page, '#tiles')).replace(/\s+/g, ' ') === 'You lent out 4 1 late · 1 due today You borrowed 2 things, none late', await txt(page, '#tiles'));
    ok('lent list, most urgent first', JSON.stringify(await whats(page)) === JSON.stringify(['Novel', 'Phone charger', 'Camping tent', 'Drill']), await whats(page));
    ok('novel 15 days late', await item(page, 'Novel').locator('.tag').innerText() === '15 days late · was due Sat 10 Oct');
    ok('charger due back today', await item(page, 'Phone charger').locator('.tag').innerText() === 'Due back today');
    ok('tent due later', await item(page, 'Camping tent').locator('.tag').innerText() === 'Due back Sun 8 Nov · in 14 days');
    ok('note shown', await item(page, 'Drill').locator('.item-note').innerText() === 'Comes with 2 drill bits');
    await tab(page, 'borrowed');
    ok('borrowed list', JSON.stringify(await whats(page)) === JSON.stringify(['Cake tin', 'Ladder']), await whats(page));
    ok('cake tin words', await item(page, 'Cake tin').locator('.item-line').innerText() === 'From Aunt Sara · borrowed Tue 20 Oct (5 days ago)' && await item(page, 'Cake tin').locator('.tag').innerText() === 'Give back by Fri 30 Oct · in 5 days');
    ok('borrowed has Gave it back and no Remind', await item(page, 'Cake tin').getByRole('button', { name: 'Gave it back' }).count() === 1 && await item(page, 'Cake tin').getByRole('button', { name: 'Remind' }).count() === 0);
        await page.check('input[name=kind][value=borrowed]');
    ok('labels change for borrowing', await txt(page, '#l-who') === 'Who lent it to you' && await txt(page, '#l-date') === 'Day you borrowed it');
    await page.check('input[name=kind][value=lent]');
    await tab(page, 'lent');

    // preview and duplicate warning
    await page.fill('#f-what', ' drill '); await page.fill('#f-date', '2026-10-20'); await page.check('input[name=due][value=w1]');
    ok('preview works out the date and warns about a duplicate', await txt(page, '#preview') === 'Due back Tue 27 Oct, in 2 days. Note: Drill is already on your list as with Bilal.', await txt(page, '#preview'));
    await page.fill('#f-date', '2026-10-01');
    ok('preview says already late', (await txt(page, '#preview')).startsWith('Due back Thu 8 Oct, already 17 days late.'));
    await page.fill('#f-what', ''); await page.fill('#f-date', '2026-10-25'); await page.check('input[name=due][value=none]');

    // reminder
    await item(page, 'Novel').getByRole('button', { name: 'Remind' }).click();
    const rem = await page.inputValue('#list-body .panel textarea');
    ok('reminder words', rem === 'Hi Hina, hope you are well! Just a friendly reminder that you still have my Novel (since Sat 26 Sep). We said Sat 10 Oct, so could I have it back soon? Thank you!', rem);
    await page.fill('#list-body .panel textarea', rem + ' :)');
    await page.locator('#list-body .panel').getByRole('button', { name: 'Copy' }).click();
    ok('copy the reminder (edited)', await page.evaluate(() => navigator.clipboard.readText()) === rem + ' :)');
    const mhref = await page.locator('#list-body .panel a', { hasText: 'Email' }).getAttribute('href');
    ok('email reminder works with no address', mhref.startsWith('mailto:?subject=About%20my%20Novel&body=Hi%20Hina'));
    await page.locator('#list-body .panel').getByRole('button', { name: 'Close' }).click();
    ok('reminder closes', await page.locator('#list-body .panel').count() === 0);

    // got it back + undo
    await item(page, 'Phone charger').getByRole('button', { name: 'Got it back' }).click();
    ok('got it back message', (await txt(page, '#list-msg')).startsWith('Got back Phone charger from Ali after 7 days. It is now under Returned.'));
    ok('charger left the lent list', !(await whats(page)).includes('Phone charger') && await txt(page, '#cnt-back') === '1');
    await page.click('#list-msg .undo');
    ok('undo got it back', (await whats(page)).includes('Phone charger') && await txt(page, '#cnt-back') === '0');
    await item(page, 'Phone charger').getByRole('button', { name: 'Got it back' }).click();
    await tab(page, 'back');
    ok('returned box', await item(page, 'Phone charger').locator('.tag').innerText() === 'Got it back Sun 25 Oct, after 7 days' && await item(page, 'Phone charger').locator('.item-line').innerText() === 'Lent to Ali · Sun 18 Oct');
    // edit a returned item: clearing the day asks for it
    await item(page, 'Phone charger').getByRole('button', { name: 'Edit' }).click();
    ok('edit returned shows the came-back date', await page.locator('#f-returned').isVisible() && await page.inputValue('#f-returned') === '2026-10-25' && await txt(page, '#add-h') === 'Edit Phone charger');
    await page.fill('#f-returned', ''); await page.click('#f-save');
    ok('cleared came-back date asks for it', await txt(page, '#e-returned') === 'Pick the day it came back.');
    await page.fill('#f-returned', '2026-10-24'); await page.click('#f-save');
    ok('edited return day', await item(page, 'Phone charger').locator('.tag').innerText() === 'Got it back Sat 24 Oct, after 6 days');
    // not back yet, lend again
    await item(page, 'Phone charger').getByRole('button', { name: 'Not back yet' }).click();
    ok('not back yet reopens', await txt(page, '#cnt-back') === '0' && await txt(page, '#cnt-lent') === '4');
    await tab(page, 'lent');
    await item(page, 'Phone charger').getByRole('button', { name: 'Got it back' }).click();
    await tab(page, 'back');
    await item(page, 'Phone charger').getByRole('button', { name: 'Lend again' }).click();
    ok('lend again fills the form', await page.inputValue('#f-what') === 'Phone charger' && await page.inputValue('#f-who') === 'Ali' && await page.inputValue('#f-date') === '2026-10-25');
    await page.click('#f-cancel').catch(() => {});
    await page.fill('#f-what', ''); await page.fill('#f-who', '');

    // edit and delete with undo
    await tab(page, 'lent');
    await item(page, 'Drill').getByRole('button', { name: 'Edit' }).click();
    ok('edit fills the form and shows the note', await page.inputValue('#f-what') === 'Drill' && await page.locator('#w-note').isVisible() && await page.inputValue('#f-note') === 'Comes with 2 drill bits');
    await page.fill('#f-who', 'Bilal Khan'); await page.click('#f-save');
    ok('edit saved', await item(page, 'Drill').locator('.item-line').innerText() === 'With Bilal Khan · lent Sat 12 Sep (43 days ago)' && (await txt(page, '#add-msg')).startsWith('Saved changes to Drill'));
    ok('edit form resets to Add', await txt(page, '#f-save') === 'Add to my list' && await page.locator('#f-cancel').isHidden());
    await item(page, 'Drill').getByRole('button', { name: 'Edit' }).click(); await page.fill('#f-who', 'Bilal'); await page.click('#f-save');
    await item(page, 'Drill').getByRole('button', { name: 'Edit' }).click(); await page.click('#f-cancel');
    ok('cancel edit', await txt(page, '#f-save') === 'Add to my list' && await page.inputValue('#f-what') === '');
    await item(page, 'Camping tent').getByRole('button', { name: 'Delete' }).click();
    ok('delete', !(await whats(page)).includes('Camping tent') && (await txt(page, '#list-msg')).startsWith('Deleted Camping tent.'));
    await page.click('#list-msg .undo');
    ok('undo delete', (await whats(page)).includes('Camping tent'));

    // pasted and very long text
    await page.fill('#f-what', '  Box\tof   board\n games '); await page.fill('#f-who', '​Hina  '); await page.click('#f-save');
    const items = await page.evaluate(k => JSON.parse(localStorage.getItem(k)).items, KEY);
    ok('pasted text tidied', items.some(i => i.what === 'Box of board games' && i.who === 'Hina'), items.map(i => i.what));
    await page.fill('#f-what', 'x'.repeat(200)); await page.fill('#f-who', 'Y'.repeat(200)); await page.click('#f-save');
    const long = (await page.evaluate(k => JSON.parse(localStorage.getItem(k)).items, KEY)).find(i => i.what.startsWith('xxx'));
    ok('very long text kept to the limit', long && long.what.length <= 80 && long.who.length <= 60);
    ok('long text does not widen the page', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await item(page, 'xxx').getByRole('button', { name: 'Delete' }).click();

    // photo
    await page.click('#o-photo');
    await page.setInputFiles('#f-photo', path.join(__dirname, 'icons', 'icon-192.png'));
    await page.waitForSelector('#photo-prev:not([hidden])');
    await page.fill('#f-what', 'Blue jacket'); await page.fill('#f-who', 'Omar'); await page.click('#f-save');
    ok('photo shows in the box', await item(page, 'Blue jacket').locator('.thumb img').count() === 1);
    await item(page, 'Blue jacket').locator('.thumb').click();
    ok('photo opens bigger', await item(page, 'Blue jacket').evaluate(e => e.classList.contains('big-photo')));
    await page.click('#o-photo');
    await page.setInputFiles('#f-photo', { name: 'x.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
    ok('a file that is not a photo is refused', await txt(page, '#e-photo') === 'That file is not a photo. Pick a photo or take a new one.');
    await page.click('#f-cancel').catch(() => {}); await page.evaluate(() => { document.getElementById('f-what').value = ''; });

    // search and people
    ok('search shows with many items', await page.locator('#search-wrap').isVisible());
    await page.fill('#search', 'bil');
    ok('search filters', JSON.stringify(await whats(page)) === JSON.stringify(['Camping tent', 'Drill']), await whats(page));
    await page.fill('#search', 'zzz');
    ok('search with no match says so', await txt(page, '#list-body') === 'Nothing here matches "zzz".');
    await page.fill('#search', '');
    const bil = page.locator('.person').filter({ has: page.locator('.person-name', { hasText: /^Bilal$/ }) });
    ok('people box per person', await bil.locator('.person-line').innerText() === 'Bilal has 2 things of yours.');
    await bil.getByRole('button', { name: 'Show only Bilal' }).click();
    ok('show only one person', JSON.stringify(await whats(page)) === JSON.stringify(['Camping tent', 'Drill']) && await txt(page, '#filter-text') === 'Showing only Bilal.');
    await page.click('#filter-clear');
    ok('show everyone', (await whats(page)).length === 5 && await page.locator('#filter').isHidden());
    ok('names suggested as you type', (await page.locator('#people-list option').evaluateAll(o => o.map(x => x.value))).includes('Aunt Sara'));

    // copy list, email list
    await page.click('#copy');
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    ok('copy my list', clip.startsWith('THINGS I LENT (5)\n- Novel: With Hina · lent Sat 26 Sep (29 days ago). 15 days late · was due Sat 10 Oct.') && clip.includes('THINGS I BORROWED (2)'), clip);
    await page.locator('#mail').dispatchEvent('pointerdown');
    ok('email my list', (await page.getAttribute('#mail', 'href')).startsWith('mailto:?subject=Things%20I%20lent%20and%20borrowed&body=THINGS%20I%20LENT'));
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#csv')]);
    const csv = fs.readFileSync(await dl.path(), 'utf8');
    ok('csv download', dl.suggestedFilename() === 'lent-and-borrowed-2026-10-25.csv' && csv.includes('Lent,Novel,Hina,2026-09-26,2026-10-10,,29,15 days late · was due Sat 10 Oct,'), csv.slice(0, 300));

    // reload keeps everything, including the photo
    await page.reload({ waitUntil: 'networkidle' });
    ok('reload keeps the list', await txt(page, '#cnt-lent') === '5' && await txt(page, '#cnt-borrowed') === '2' && await txt(page, '#cnt-back') === '1');
    ok('reload keeps the photo', await item(page, 'Blue jacket').locator('.thumb img').count() === 1);

    // backup, delete everything, undo, restore
    const [bk] = await Promise.all([page.waitForEvent('download'), page.click('#backup')]);
    const bkPath = path.join(require('os').tmpdir(), 'lent-backup.json'); fs.copyFileSync(await bk.path(), bkPath);
    ok('backup file has the photo', Object.keys(JSON.parse(fs.readFileSync(bkPath, 'utf8')).photos).length === 1);
    await page.click('#wipe');
    ok('delete everything', await txt(page, '#cnt-lent') === '0' && (await txt(page, '#list-body')).startsWith('Nothing yet'));
    await page.click('#set-msg .undo');
    ok('undo delete everything', await txt(page, '#cnt-lent') === '5' && await item(page, 'Blue jacket').locator('.thumb img').count() === 1);
    await page.click('#wipe');
    await page.setInputFiles('#restore-file', bkPath);
    await page.waitForFunction(() => document.getElementById('set-msg').textContent.startsWith('Restored'));
    ok('restore backup', await txt(page, '#cnt-lent') === '5' && await item(page, 'Blue jacket').locator('.thumb img').count() === 1);
    await page.setInputFiles('#restore-file', { name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"items":[1,2]}') });
    await page.waitForFunction(() => document.getElementById('set-msg').textContent.startsWith('That file'));
    ok('bad backup refused, nothing changed', await txt(page, '#cnt-lent') === '5');

    // the next day: counts move on by themselves
    await page.clock.setFixedTime(new Date('2026-10-26T09:00:00+05:00'));
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    ok('next day counts move on', await item(page, 'Drill').locator('.item-line').innerText() === 'With Bilal · lent Sat 12 Sep (44 days ago)' && await item(page, 'Novel').locator('.tag').innerText() === '16 days late · was due Sat 10 Oct');
    ok('yesterday due today is now late', await item(page, 'Camping tent').count() === 1);
    await page.clock.setFixedTime(NOW);
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));

    // light / dark switch
    const before = await page.evaluate(() => getComputedStyle(document.body).color);
    await page.click('.theme-toggle');
    ok('theme switch changes the look', await page.evaluate(() => getComputedStyle(document.body).color) !== before);
    await page.click('.theme-toggle');

    // ---------- 3. layout with filled-in state at every width ----------
    await tab(page, 'lent');
    await item(page, 'Novel').getByRole('button', { name: 'Remind' }).click();
    await page.click('#o-note'); await page.click('#o-photo'); await page.check('input[name=due][value=custom]');
    for (const scheme of ['dark', 'light']) {
        await page.emulateMedia({ colorScheme: scheme });
        for (const w of [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920]) {
            await page.setViewportSize({ width: w, height: 900 });
            const scroll = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
            ok(scheme + ' ' + w + ' no horizontal scroll', scroll);
            const out = await page.evaluate(() => [...document.querySelectorAll('main *')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && getComputedStyle(e).display !== 'none' && (r.right > innerWidth + 1 || r.left < -1) && !e.classList.contains('sr') && !e.closest('.sr'); }).map(e => e.tagName + '.' + e.className + '#' + e.id).slice(0, 3));
            ok(scheme + ' ' + w + ' nothing sticks out', !out.length, out);
            if (w <= 390) {
                const lap = await page.evaluate(() => { const k = [...document.querySelectorAll('main input:not([type=radio]):not([type=checkbox]):not(.sr), main select, main button, main textarea, main a.secondary, main .seg label')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }); const bad = [];
                    for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { if (k[i].contains(k[j]) || k[j].contains(k[i])) continue; const a = k[i].getBoundingClientRect(), b = k[j].getBoundingClientRect(); if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2) bad.push((k[i].id || k[i].textContent.slice(0, 20)) + ' / ' + (k[j].id || k[j].textContent.slice(0, 20))); } return bad.slice(0, 3); });
                ok(scheme + ' ' + w + ' controls do not overlap', !lap.length, lap);
                const ph = await page.evaluate(() => { const c = document.createElement('canvas').getContext('2d'); return [...document.querySelectorAll('main input[placeholder], main textarea[placeholder]')].filter(e => e.offsetWidth).filter(e => { const cs = getComputedStyle(e); c.font = cs.fontSize + ' ' + cs.fontFamily; return c.measureText(e.placeholder).width > e.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) + 1; }).map(e => e.id); });
                ok(scheme + ' ' + w + ' placeholders fit', !ph.length, ph);
                const tabs = await page.evaluate(() => [...document.querySelectorAll('.tabs label, .seg label')].filter(l => l.offsetWidth && l.scrollWidth > l.clientWidth + 1).map(l => l.textContent.trim()));
                ok(scheme + ' ' + w + ' option labels fit', !tabs.length, tabs);
                const wrap = await page.evaluate(() => [...document.querySelectorAll('.tab-n, .seg:not(.three) label')].filter(e => e.offsetWidth && (e.tagName === 'LABEL' ? e.getBoundingClientRect().height > 50 : e.getBoundingClientRect().height > parseFloat(getComputedStyle(e).lineHeight) * 1.5)).map(e => e.textContent.trim()));
                ok(scheme + ' ' + w + ' tab and option names stay on one line', !wrap.length, wrap);
            }
            if (w >= 900) for (const pos of [0, 0.5, 1]) {
                await page.evaluate(p => scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * p), pos);
                const o = await page.evaluate(() => { const bad = []; document.querySelectorAll('main, .col-main, .col-side').forEach(h => { const k = [...h.children].filter(c => c.getBoundingClientRect().height > 4 && getComputedStyle(c).display !== 'none'); for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { const a = k[i].getBoundingClientRect(), b = k[j].getBoundingClientRect(); if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 4 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 4) bad.push(k[i].className + '/' + k[j].className); } }); return bad; });
                ok(scheme + ' ' + w + ' no overlap at scroll ' + pos, !o.length, o);
            }
            if (w === 1280) ok('desktop uses two columns', await page.evaluate(() => { const a = document.querySelector('.col-main').getBoundingClientRect(), b = document.querySelector('.col-side').getBoundingClientRect(); return b.left > a.right && a.width > 450; }));
            if ([320, 390, 820, 1280].includes(w)) {
                await page.evaluate(() => scrollTo(0, 0));
                await page.click('.help-btn');
                const d = page.locator('dialog.help'); const r = await d.boundingBox();
                ok(scheme + ' ' + w + ' help opens on screen', await d.evaluate(e => e.open) && r.x >= 0 && r.x + r.width <= w + 1 && r.y + r.height <= 901 && (await d.locator('h2').innerText()) === 'How to use Lent and Borrowed Items Tracker');
                await page.keyboard.press('Escape'); ok(scheme + ' ' + w + ' Escape closes help', !(await d.evaluate(e => e.open)));
                await page.click('.help-btn'); await page.click('.help-close'); ok(scheme + ' ' + w + ' Got it closes help', !(await d.evaluate(e => e.open)));
                const bar = await page.evaluate(() => { const b = [...document.querySelectorAll('.topbar > *')].map(e => e.getBoundingClientRect()); return b.every(r => r.top === b[0].top) && b.every((r, i) => i === 0 || r.left >= b[i - 1].right); });
                ok(scheme + ' ' + w + ' top bar on one line, no overlap', bar);
            }
        }
    }
    // cleared state at every width
    await page.click('#wipe');
    for (const w of [320, 390, 900, 1280, 1920]) { await page.setViewportSize({ width: w, height: 900 }); ok('cleared ' + w + ' no horizontal scroll', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); }
    await ctx.close();

    // ---------- 4. corrupt and blocked storage ----------
    ({ ctx, page } = await newPage({}, k => { try { if (!sessionStorage.getItem('x')) { localStorage.setItem(k, '{broken'); sessionStorage.setItem('x', '1'); } } catch (e) {} }));
    await page.evaluate(k => localStorage.setItem(k, '{broken'), KEY); await page.reload({ waitUntil: 'networkidle' });
    ok('corrupt saved data starts fresh', await txt(page, '#cnt-lent') === '0');
    await page.evaluate(k => localStorage.setItem(k, JSON.stringify({ items: [{ kind: 'lent', what: '<img src=x onerror=alert(1)>', who: 'Bilal', date: '2026-10-01' }, { kind: 'x' }] })), KEY);
    await page.reload({ waitUntil: 'networkidle' });
    ok('saved text shown as text, bad rows dropped', await txt(page, '#cnt-lent') === '1' && await page.locator('#list-body img').count() === 0 && (await txt(page, '#list-body')).includes('<img src=x'));
    await ctx.close();
    ({ ctx, page } = await newPage({}, () => { Storage.prototype.setItem = function () { throw new Error('blocked'); }; }));
    ok('blocked storage shows a warning', await page.locator('#storage-warn').isVisible());
    await add(page, { what: 'Drill', who: 'Bilal' });
    ok('still works with blocked storage', await txt(page, '#cnt-lent') === '1');
    await ctx.close();

    // ---------- 5. every requested file loads ----------
    ok('no console errors', !errors.length, errors);
    ok('no failed requests', !failed.length, failed);
    ['style.css', 'core.js', 'script.js'].forEach(f => ok('requested ' + f, [...requested].some(u => u.endsWith(SLUG + '/' + f))));
    for (const f of ['favicon.svg', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'sw.js', '../help.js', '../theme.js', 'screenshots/desktop.png', 'screenshots/phone.png']) {
        const r = await fetch(URL + f).catch(() => null); ok(f + ' returns 200', r && r.status === 200);
    }

    // ---------- screenshots ----------
    if (SHOTS) {
        for (const [name, vp, scale] of [['desktop', { width: 1280, height: 1000 }, 1], ['phone', { width: 390, height: 1500 }, 2]]) {
            const c = await browser.newContext({ viewport: vp, deviceScaleFactor: scale, timezoneId: 'Asia/Karachi', colorScheme: 'dark' });
            await c.route(/goatcounter\.com|gc\.zgo\.at/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
            const p = await c.newPage(); await p.clock.setFixedTime(NOW); await p.goto(URL, { waitUntil: 'networkidle' });
            await fill(p);
            await p.fill('#f-what', ''); await p.fill('#f-who', '');
            await p.evaluate(() => { document.activeElement && document.activeElement.blur(); document.querySelectorAll('.msg').forEach(m => { m.textContent = ''; m.classList.remove('show'); }); scrollTo(0, 0); });
            await p.screenshot({ path: path.join(__dirname, 'screenshots', name + '.png') });
            await c.close();
        }
        console.log('screenshots saved');
    }

    await browser.close(); if (srv) srv.close();
    console.log(fail ? 'FAILED ' + fail + ' of ' + (pass + fail) : 'ALL ' + pass + ' UI CHECKS PASSED (' + URL + ')');
    process.exit(fail ? 1 : 0);
})();
