// Full page test with Playwright. Run from the repo root or this folder: node ui-test.js
//   BASE=https://umar8092.github.io/apps node ui-test.js   tests the live site
//   node ui-test.js --shots                                 also saves screenshots/desktop.png and phone.png
// "Today" is fixed to Sat 24 Oct 2026 in Pakistan time so every answer can be checked exactly.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), SLUG = 'replacement-reminder-for-filters-and-toothbrushes', KEY = SLUG + '.state';
const SHOTS = process.argv.includes('--shots');
const NOW = new Date('2026-10-24T10:00:00+05:00');
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
    const boxOf = (page, name, who) => page.locator('li.box', { has: page.locator('.box-name', { hasText: new RegExp('^' + esc(name) + '$') }) })
        .filter(who ? { has: page.locator('.who', { hasText: new RegExp('^' + esc(who) + '$') }) } : {});
    const stOf = (page, name, who) => boxOf(page, name, who).first().locator('.st').innerText();
    const labels = (page, g) => page.locator('#l-' + g + ' li.box').evaluateAll(ls => ls.map(l => l.querySelector('.box-name').textContent + (l.querySelector('.who') ? ' (' + l.querySelector('.who').textContent + ')' : '')));
    const txt = (page, sel) => page.locator(sel).innerText();
    async function add(page, f) {
        if (!(await page.locator('#form').isVisible())) await page.click('#open-form');
        if (f.preset) await page.selectOption('#f-preset', { label: f.preset });
        if (f.name != null) await page.fill('#f-name', f.name);
        if (f.n != null) await page.fill('#f-n', String(f.n));
        if (f.unit) await page.selectOption('#f-unit', f.unit);
        if (f.chip) await page.click('#quick-last .chip:text-is("' + f.chip + '")'); else if (f.last != null) await page.fill('#f-last', f.last);
        if (f.who) { if (await page.locator('#o-who').isVisible()) await page.click('#o-who'); await page.fill('#f-who', f.who); }
        if (f.note) { if (await page.locator('#o-note').isVisible()) await page.click('#o-note'); await page.fill('#f-note', f.note); }
        if (f.check) await f.check();
        await page.click('#save');
    }
    const AYESHA = [
        { preset: 'Water filter jug cartridge (every 4 weeks)', last: '2026-09-15', note: 'Brita Maxtra, buy a 3-pack' },
        { preset: 'AC filter (wash or clean) (every month)', last: '2026-09-24' },
        { preset: 'Toothbrush (every 3 months)', last: '2026-08-02', who: 'Ali, Sara, Mum, Dad' },
        { preset: 'Contact lenses (monthly) (every month)', last: '2026-10-03', who: 'Mum' },
        { preset: 'Fridge water filter (every 6 months)', last: '2026-06-10' },
        { preset: 'Car wiper blades (every year)', last: '2026-01-15' }
    ];
    let ctx, page;

    // ---------- 1. first use ----------
    ({ ctx, page } = await newPage());
    ok('empty state message', (await txt(page, '#sum-body')).startsWith('Nothing added yet'));
    ok('form open on first use', await page.locator('#form').isVisible() && !(await page.locator('#cancel').isVisible()));
    ok('list hidden when empty', !(await page.locator('#list').isVisible()));
    ok('optional who hidden', !(await page.locator('#f-who').isVisible()) && await page.locator('#o-who').isVisible());
    ok('optional note hidden', !(await page.locator('#f-note').isVisible()));
    ok('last replaced defaults to today', (await page.inputValue('#f-last')) === '2026-10-24');
    // preset fills the name and time
    await page.selectOption('#f-preset', { label: 'Toothbrush (every 3 months)' });
    ok('preset fills', (await page.inputValue('#f-name')) === 'Toothbrush' && (await page.inputValue('#f-n')) === '3' && (await page.inputValue('#f-unit')) === 'month');
    await page.click('#quick-last .chip:text-is("3 months ago")');
    ok('chip 3 months ago', (await page.inputValue('#f-last')) === '2026-07-24');
    ok('preview overdue', (await txt(page, '#preview')) === 'Replace today, then every 3 months.');
    await page.click('#quick-last .chip:text-is("Not sure")');
    ok('not sure hint', (await txt(page, '#h-last')).startsWith('Not sure'));
    ok('preview not sure', (await txt(page, '#preview')).startsWith('Replace now (no date recorded yet)'));
    await page.click('#quick-last .chip:text-is("A month ago")');
    ok('chip a month ago', (await page.inputValue('#f-last')) === '2026-09-24');
    // errors
    await page.fill('#f-name', ''); await page.fill('#f-n', '0'); await page.fill('#f-last', '2026-10-30'); await page.click('#save');
    ok('blank name error', (await txt(page, '#e-name')).startsWith('Type what needs replacing'));
    ok('zero error', (await txt(page, '#e-n')) === 'Type a whole number from 1 to 36 months.');
    ok('future date error', (await txt(page, '#e-last')).startsWith('The last replacement cannot be in the future'));
    ok('nothing added on error', await page.locator('li.box').count() === 0);
    await page.fill('#f-n', '1.5'); await page.fill('#f-name', 'X'); await page.fill('#f-last', '2026-10-01'); await page.click('#save');
    ok('decimal error', (await txt(page, '#e-n')).startsWith('Type a whole number'));
    await page.selectOption('#f-unit', 'day'); await page.fill('#f-n', '99999'); await page.click('#save');
    ok('huge error', (await txt(page, '#e-n')) === 'Type a whole number from 1 to 730 days.');
    await page.fill('#f-name', ''); await page.selectOption('#f-unit', 'month'); await page.fill('#f-n', '3');

    // ---------- 2. Ayesha's house ----------
    for (const f of AYESHA) await add(page, f);
    ok('four toothbrush boxes from commas', await boxOf(page, 'Toothbrush').count() === 4);
    ok('added message', (await txt(page, '#form-msg')).length > 0);
    await page.click('#cancel');
    ok('form closes with Done', !(await page.locator('#form').isVisible()) && await page.locator('#open-form').isVisible());
    const sum = await txt(page, '#sum-body');
    ok('summary replace now', sum.includes('2 things to replace now') && sum.includes('Water filter jug cartridge (11 days late), AC filter (wash or clean)'), sum);
    ok('summary next', sum.includes('Next: Toothbrush (Ali), Mon 2 Nov (in 9 days).'), sum);
    ok('replace-now group', JSON.stringify(await labels(page, 'now')) === JSON.stringify(['Water filter jug cartridge', 'AC filter (wash or clean)']), await labels(page, 'now'));
    ok('coming up group', JSON.stringify(await labels(page, 'later')) === JSON.stringify(['Toothbrush (Ali)', 'Toothbrush (Dad)', 'Toothbrush (Mum)', 'Toothbrush (Sara)', 'Contact lenses (monthly) (Mum)', 'Fridge water filter', 'Car wiper blades']), await labels(page, 'later'));
    ok('jug line', (await stOf(page, 'Water filter jug cartridge')) === 'Replace now: 11 days late (was due Tue 13 Oct)');
    ok('ac line', (await stOf(page, 'AC filter (wash or clean)')) === 'Replace today');
    ok('fridge line', (await stOf(page, 'Fridge water filter')) === 'Due Thu 10 Dec (in 6 weeks)');
    ok('wipers line', (await stOf(page, 'Car wiper blades')) === 'Due Fri 15 Jan 2027 (in 2 months)');
    ok('lens line', (await stOf(page, 'Contact lenses (monthly)', 'Mum')) === 'Due Tue 3 Nov (in 10 days)');
    ok('note shown', (await boxOf(page, 'Water filter jug cartridge').locator('.box-note').innerText()) === 'Brita Maxtra, buy a 3-pack');
    // shopping list
    const shop = await txt(page, '#shop-text');
    ok('shopping list', shop.includes('- Toothbrush x 4 (Ali, Dad, Mum, Sara), first needed Mon 2 Nov') && shop.includes('- Water filter jug cartridge, needed now'), shop);
    await page.selectOption('#s-days', '7');
    ok('shopping 7 days', !(await txt(page, '#shop-text')).includes('Toothbrush'));
    await page.selectOption('#s-days', '30');
    await page.click('#shop-copy');
    ok('shopping copied', (await page.evaluate(() => navigator.clipboard.readText())).startsWith('To buy for the next 30 days'));
    ok('shopping mail link', (await page.getAttribute('#shop-mail', 'href')).startsWith('mailto:?subject=Shopping%20list'));
    ok('whole list mail link', (await page.getAttribute('#mail-all', 'href')).startsWith('mailto:?subject=Things%20to%20replace&body=Things%20to%20replace%2C%20Sat%2024%20Oct%202026'));
    await page.click('#copy-all');
    ok('whole list copied', (await page.evaluate(() => navigator.clipboard.readText())).includes('Replace now:\n- Water filter jug cartridge: replace now: 11 days late'));
    // calendar file
    let dl = page.waitForEvent('download'); await page.click('#cal'); let d = await dl;
    const cal = fs.readFileSync(await d.path(), 'utf8');
    ok('calendar file', d.suggestedFilename() === 'replacement-reminders.ics' && (cal.match(/BEGIN:VEVENT/g) || []).length === 9 && cal.includes('SUMMARY:Replace: Toothbrush (Ali)'));

    // ---------- 3. replace, undo, all ----------
    await boxOf(page, 'Water filter jug cartridge').locator('button:text-is("Replaced today")').click();
    ok('replaced message', (await txt(page, '#list-msg')).startsWith('Water filter jug cartridge replaced. Next: Sat 21 Nov (in 4 weeks).'));
    ok('moves to coming up', (await stOf(page, 'Water filter jug cartridge')) === 'Due Sat 21 Nov (in 4 weeks)');
    ok('history shown', (await boxOf(page, 'Water filter jug cartridge').locator('.hist').innerText()) === 'Earlier: Tue 15 Sep');
    await page.click('#list-msg .undo');
    ok('undo replaced', (await stOf(page, 'Water filter jug cartridge')).startsWith('Replace now: 11 days late'));
    await page.click('#replace-all');
    ok('replace all', (await page.locator('#l-now li').count()) === 0 && (await txt(page, '#sum-body')).includes('Nothing needs replacing today.'));
    await page.click('#list-msg .undo');
    ok('undo replace all', (await page.locator('#l-now li').count()) === 2);
    await boxOf(page, 'AC filter (wash or clean)').locator('button:text-is("Replaced today")').click();
    await boxOf(page, 'AC filter (wash or clean)').locator('button:text-is("Replaced today")').click();
    ok('replaced twice same day', (await txt(page, '#list-msg')).includes('already marked replaced today'));

    // ---------- 4. pause and resume ----------
    await boxOf(page, 'Car wiper blades').locator('button:text-is("Pause")').click();
    ok('paused group', JSON.stringify(await labels(page, 'paused')) === JSON.stringify(['Car wiper blades']) && (await stOf(page, 'Car wiper blades')) === 'Paused since Sat 24 Oct: not counting');
    await boxOf(page, 'Car wiper blades').locator('button:text-is("Resume")').click();
    ok('resumed', (await stOf(page, 'Car wiper blades')) === 'Due Fri 15 Jan 2027 (in 2 months)');

    // ---------- 5. edit a mistake, delete with undo ----------
    await boxOf(page, 'Toothbrush', 'Sara').locator('button:text-is("Edit")').click();
    ok('edit form', (await txt(page, '#form-h')) === 'Edit Toothbrush (Sara)' && (await page.inputValue('#f-who')) === 'Sara' && !(await page.locator('#h-who').isVisible()));
    await page.fill('#f-last', '2026-10-20'); await page.click('#save');
    ok('edit saved', (await stOf(page, 'Toothbrush', 'Sara')) === 'Due Wed 20 Jan 2027 (in 2 months)');
    await boxOf(page, 'Toothbrush', 'Dad').locator('button:text-is("Edit")').click();
    await page.click('#del');
    ok('deleted', await boxOf(page, 'Toothbrush', 'Dad').count() === 0 && (await txt(page, '#list-msg')).startsWith('Deleted Toothbrush (Dad).'));
    await page.click('#list-msg .undo');
    ok('undo delete', await boxOf(page, 'Toothbrush', 'Dad').count() === 1);
    // duplicate warning
    await add(page, { name: 'Toothbrush', who: 'Ali', chip: 'Today' });
    ok('duplicate warns, kept', (await txt(page, '#form-msg')).includes('You already had Toothbrush (Ali). Both are kept.') && await boxOf(page, 'Toothbrush', 'Ali').count() === 2);
    await page.click('#form-msg .undo');
    ok('undo add', await boxOf(page, 'Toothbrush', 'Ali').count() === 1);

    // ---------- 6. reload keeps everything; second day ----------
    await page.reload({ waitUntil: 'networkidle' });
    ok('saved after reload', await page.locator('li.box').count() === 9 && (await stOf(page, 'Toothbrush', 'Sara')).startsWith('Due Wed 20 Jan 2027'));
    const saved = await page.evaluate(k => localStorage.getItem(k), KEY);
    await ctx.close();
    ({ ctx, page } = await newPage(null, `localStorage.setItem('${KEY}', ${JSON.stringify(saved)})`));
    await page.clock.setFixedTime(new Date('2026-11-02T09:00:00+05:00'));
    await page.reload({ waitUntil: 'networkidle' });
    ok('next week the toothbrushes are due', (await txt(page, '#sum-body')).includes('Toothbrush (Ali)') && (await stOf(page, 'Toothbrush', 'Ali')) === 'Replace today');
    // backup and restore
    dl = page.waitForEvent('download'); await page.click('#backup'); d = await dl;
    const backupPath = await d.path();
    ok('backup name', d.suggestedFilename() === 'replacement-reminder-backup-2026-11-02.json');
    await page.click('#wipe');
    ok('wiped', (await txt(page, '#sum-body')).startsWith('Nothing added yet') && await page.locator('#form').isVisible());
    await page.click('#set-msg .undo');
    ok('undo wipe', await page.locator('li.box').count() === 9);
    await page.click('#wipe');
    await page.setInputFiles('#restore-file', backupPath);
    await page.waitForTimeout(300);
    ok('restored', await page.locator('li.box').count() === 9 && (await txt(page, '#set-msg')).startsWith('Restored 9 things'));
    await page.setInputFiles('#restore-file', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"nope":1}') });
    await page.waitForTimeout(300);
    ok('bad backup refused', (await txt(page, '#set-msg')).startsWith('That file is not a backup') && await page.locator('li.box').count() === 9);
    await ctx.close();

    // ---------- 7. corrupt, bad and blocked storage ----------
    ({ ctx, page } = await newPage(null, `localStorage.setItem('${KEY}', '{broken')`));
    ok('corrupt starts fresh', (await txt(page, '#sum-body')).startsWith('Nothing added yet') && (await txt(page, '#set-msg')).includes('could not be read'));
    await ctx.close();
    ({ ctx, page } = await newPage(null, `localStorage.setItem('${KEY}', JSON.stringify({items:[{id:1,name:'Ok',n:3,unit:'month',last:'2026-10-01'},{id:2,name:'<img src=x onerror=alert(1)>',n:999,unit:'month'}]}))`));
    ok('bad rows dropped', (await page.locator('li.box').count()) === 1);
    await ctx.close();
    ({ ctx, page } = await newPage(null, `Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } })`));
    ok('blocked storage warns', await page.locator('#storage-warn').isVisible());
    await add(page, { name: 'Razor', n: 2, unit: 'week', chip: 'Today' });
    ok('works without storage', await boxOf(page, 'Razor').count() === 1 && (await stOf(page, 'Razor')) === 'Due Sat 7 Nov (in 2 weeks)');
    await ctx.close();

    // ---------- 8. html as text, keyboard, theme ----------
    ({ ctx, page } = await newPage());
    await add(page, { name: '<b>Bold</b>', n: 2, unit: 'week', chip: 'Today', note: '<script>x</script>', who: '<i>me</i>' });
    ok('html as text', await boxOf(page, '<b>Bold</b>').count() === 1 && await page.locator('li.box b, li.box i').count() === 0);
    await page.fill('#f-name', 'Keyboard thing'); await page.press('#f-name', 'Enter');
    ok('enter adds', await boxOf(page, 'Keyboard thing').count() === 1);
    await add(page, { name: 'L'.repeat(60) + 'more', who: 'W'.repeat(40), n: 1, unit: 'day', chip: 'Today' });
    ok('very long name kept to 60', await boxOf(page, 'L'.repeat(60)).count() === 1);
    const btn = page.locator('.theme-toggle');
    if (await btn.count()) { const b0 = await page.evaluate(() => getComputedStyle(document.body).backgroundColor); await btn.click(); const b1 = await page.evaluate(() => getComputedStyle(document.body).backgroundColor); ok('theme switch changes colours', b0 !== b1); }
    else ok('theme switch present', false);
    await ctx.close();

    // filled state for layout and screenshots
    ({ ctx, page } = await newPage());
    for (const f of AYESHA) await add(page, f);
    await page.click('#cancel');
    await boxOf(page, 'Fridge water filter').locator('button:text-is("Replaced today")').click();   // so a history line shows
    const FILLED = JSON.parse(await page.evaluate(k => localStorage.getItem(k), KEY));
    FILLED.items.find(x => x.name === 'Fridge water filter').last = '2026-06-10';
    FILLED.items.find(x => x.name === 'Fridge water filter').history = ['2025-12-08', '2026-06-10'];
    await ctx.close();
    const init = `localStorage.setItem('${KEY}', ${JSON.stringify(JSON.stringify(FILLED))})`;

    if (SHOTS) {
        for (const [w, h, f, scale] of [[1280, 900, 'desktop.png', 1], [390, 844, 'phone.png', 2]]) {
            const c = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: scale, timezoneId: 'Asia/Karachi', colorScheme: 'dark' });
            await c.route(/goatcounter\.com|gc\.zgo\.at/, r => r.fulfill({ status: 200, body: '' }));
            await c.addInitScript(init);
            const pg = await c.newPage(); await pg.clock.setFixedTime(NOW);
            await pg.goto(URL, { waitUntil: 'networkidle' });
            await pg.screenshot({ path: path.join(__dirname, 'screenshots', f), fullPage: w > 900 });
            await c.close();
        }
    }

    // ---------- 9. layout at every width ----------
    for (const w of [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920]) {
        for (const scheme of ['dark', 'light']) {
            ({ ctx, page } = await newPage({ viewport: { width: w, height: 900 }, colorScheme: scheme }, init));
            if (w <= 390) { await page.click('#open-form'); await page.click('#o-who'); await page.click('#o-note'); await page.fill('#f-who', 'Ali, Sara'); }
            ok(w + scheme + ' no horizontal scroll', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
            const out = await page.evaluate(() => [...document.querySelectorAll('main *')].filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.right > innerWidth + 1 || r.left < -1); }).map(e => e.id || e.className).slice(0, 5));
            ok(w + scheme + ' nothing sticks out', !out.length, out);
            if (w <= 390) {
                const over = await page.evaluate(() => { const els = [...document.querySelectorAll('main input:not([type=radio]):not([type=checkbox]), main select, main button, main a.secondary')].filter(e => e.offsetParent); const bad = []; for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) { const a = els[i].getBoundingClientRect(), b = els[j].getBoundingClientRect(); if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) bad.push((els[i].id || els[i].textContent) + ' / ' + (els[j].id || els[j].textContent)); } return bad; });
                ok(w + scheme + ' controls do not overlap', !over.length, over);
                const clipped = await page.evaluate(() => [...document.querySelectorAll('main input[placeholder], main textarea[placeholder]')].filter(e => e.offsetParent).filter(e => { const c = document.createElement('canvas').getContext('2d'); const s = getComputedStyle(e); c.font = s.fontSize + ' ' + s.fontFamily; return c.measureText(e.placeholder).width > e.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight); }).map(e => e.id));
                ok(w + scheme + ' placeholders fit', !clipped.length, clipped);
                const selClip = await page.evaluate(() => [...document.querySelectorAll('main select')].filter(e => e.offsetParent && e.scrollWidth > e.clientWidth + 1).map(e => e.id));
                ok(w + scheme + ' selects fit', !selClip.length, selClip);
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
                ok(w + ' help opens inside', await d.evaluate(e => e.open) && r.x >= 0 && r.x + r.width <= w + 1 && (await d.innerText()).includes('How to use Replacement Reminder'));
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
    for (const f of ['favicon.svg', 'manifest.webmanifest', 'sw.js', 'core.js', 'script.js', 'style.css', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', '../help.js', '../theme.js']) {
        const r = await fetch(URL + f).catch(() => null);
        ok('file ' + f, r && r.ok, r && r.status);
    }
    ok('no console errors', errors.length === 0, errors);
    ok('no failed requests', failed.length === 0, failed);
    await browser.close(); if (srv) srv.close();
    console.log(pass + ' passed, ' + fail + ' failed' + (process.env.BASE ? ' (live: ' + base + ')' : ''));
    process.exit(fail ? 1 : 0);
})();
