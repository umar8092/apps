// Drives the real page in headless Chromium. Run from the repo root: node bus-and-train-timetable-for-my-stops/ui-test.js [baseUrl]
// The clock is fixed at Thu 29 Oct 2026 07:33 in Lahore (Asia/Karachi) so every answer is exact.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), http = require('http');
const SLUG = 'bus-and-train-timetable-for-my-stops';
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function ok(cond, name, extra) { if (cond) pass++; else { fail++; console.log('FAIL ' + name + (extra ? '\n   ' + extra : '')); } }
const has = (text, part, name) => ok(String(text).includes(part), name, 'missing "' + part + '" in: ' + String(text).slice(0, 500).replace(/\n/g, ' | '));
const T0 = new Date('2026-10-29T07:33:00+05:00');

function serve() {
    return new Promise(res => {
        const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
        const s = http.createServer((q, r) => {
            let f = decodeURIComponent(q.url.split('?')[0]).replace(/^\/apps/, '');
            if (f.endsWith('/')) f += 'index.html';
            const fp = path.join(ROOT, f);
            if (!fp.startsWith(ROOT) || !fs.existsSync(fp)) { r.writeHead(404); return r.end('no'); }
            r.writeHead(200, { 'Content-Type': types[path.extname(fp)] || 'application/octet-stream' }); fs.createReadStream(fp).pipe(r);
        }).listen(0, () => res({ s, base: 'http://localhost:' + s.address().port + '/apps' }));
    });
}

(async () => {
    let srv = null, base = process.argv[2];
    if (!base) { srv = await serve(); base = srv.base; }
    const url = base + '/' + SLUG + '/';
    const browser = await chromium.launch();
    const failed = [];
    async function newPage(w, opts, time) {
        const ctx = await browser.newContext({ viewport: { width: w || 390, height: 900 }, timezoneId: 'Asia/Karachi', acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'], serviceWorkers: 'block', ...(opts || {}) });
        await ctx.route(/goatcounter\.com|gc\.zgo\.at/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
        const page = await ctx.newPage();
        page.errors = [];
        page.on('pageerror', e => page.errors.push(e.message));
        page.on('console', m => { if (m.type() === 'error') page.errors.push(m.text()); });
        page.on('response', r => { if (r.status() >= 400 && r.url().startsWith(base)) failed.push(r.status() + ' ' + r.url()); });
        await page.clock.install({ time: time || T0 });
        return page;
    }
    const txt = (page, sel) => page.locator(sel).first().innerText();
    const ed = '#add-editor';
    const card = (page, i) => page.locator('#routes .route').nth(i || 0);

    // ---------- 1. first use and mistakes ----------
    let page = await newPage(390);
    await page.goto(url);
    ok(await page.locator('#add').isVisible(), 'first use: add card shows');
    ok(await page.locator('#clock-bar').isHidden(), 'first use: no clock bar yet');
    ok(await page.locator('#hols').isHidden() && await page.locator('#tools').isHidden(), 'first use: holidays and backup hidden');
    ok(await page.locator(ed + ' input[placeholder="e.g. Main Market stop"]').isHidden(), 'stop name is optional and hidden');
    ok(await page.locator(ed + ' .sub-box.every').isHidden() && await page.locator(ed + ' .sub-box.dates').isHidden(), 'every N and dates are optional and hidden');
    await page.click('text=Save this stop');
    has(await txt(page, ed), 'Give it a name', 'blank name refused');
    has(await txt(page, ed), 'Type at least one departure time', 'no times refused');
    ok(await page.locator('#routes .route').count() === 0, 'nothing saved with errors');
    // impossible time
    await page.fill(ed + ' textarea', '07:15 25:70');
    has(await txt(page, ed), 'Cannot be a time: 25:70', 'impossible time shown');
    await page.locator(ed + ' .chip', { hasText: 'To university' }).click();
    await page.click('text=Save this stop');
    ok(await page.locator('#routes .route').count() === 0, 'impossible time blocks save');
    // only words
    await page.fill(ed + ' textarea', 'Fridays only');
    has(await txt(page, ed), 'No times found yet', 'only words: no times found');
    // walk other: bad value
    await page.selectOption(ed + ' select', 'other');
    await page.fill(ed + ' input[placeholder="0 to 120"]', '500');
    await page.fill(ed + ' textarea', '07:15');
    await page.click('text=Save this stop');
    has(await txt(page, ed), 'whole minutes, from 0 to 120', 'walk 500 refused');
    await page.fill(ed + ' input[placeholder="0 to 120"]', '-3');
    await page.click('text=Save this stop');
    ok(await page.locator('#routes .route').count() === 0, 'walk -3 refused');
    await page.selectOption(ed + ' select', '5');

    // ---------- 2. the real situation ----------
    await page.fill(ed + ' input[placeholder="e.g. Bus 42 to City Centre"]', 'Shuttle to Campus');
    await page.click('text=+ Add the stop name (optional)');
    await page.fill(ed + ' input[placeholder="e.g. Main Market stop"]', 'Main Market stop');
    await page.click('text=Weekdays, Saturday, Sunday');
    ok(await page.locator(ed + ' .slot').count() === 3, 'preset makes three sets');
    const slot = i => page.locator(ed + ' .slot').nth(i);
    await slot(0).locator('textarea').fill('Shuttle (Mon-Fri)\n7:15\n7:40\n8:05\n8:30\n9:00');
    has(await slot(0).innerText(), '5 times, 07:15 to 09:00. Words were skipped.', 'pasted column read');
    await slot(1).locator('textarea').fill('8:00am, 10am');
    has(await slot(1).innerText(), '2 times, 08:00 to 10:00', 'am times read');
    has(await txt(page, ed), 'No departures on Sun.', 'Sunday left empty is explained');
    await page.click('text=Save this stop');
    ok(await page.locator('#routes .route').count() === 1, 'saved one stop');
    let c = await card(page).innerText();
    has(c, 'Shuttle to Campus', 'name shown');
    has(c, 'From Main Market stop · 5 min walk to the stop', 'stop and walk shown');
    has(c, 'Today (Thu): Mon–Fri times.', 'today label');
    has(c, '07:40', 'next time');
    has(c, 'in 7 min', 'in 7 min');
    has(c, 'Then 08:05 (in 32 min) and 08:30 (in 57 min)', 'then two more');
    has(c, 'Leave in 2 min to catch the 07:40.', 'leave in 2 min');
    has(c, 'Last one today: 09:00.', 'last one today');
    has(await txt(page, '#clock'), 'Now 07:33 · Thursday 29 October', 'clock bar');
    ok(await page.locator('#add').isHidden() && await page.locator('#add-more').isVisible(), 'add card folds into a button');

    // ---------- 3. time passes ----------
    await page.clock.fastForward('04:00');   // 07:37
    await page.waitForTimeout(50);
    c = await card(page).innerText();
    has(c, 'in 3 min', 'countdown moves on');
    has(c, 'The 07:40 is too soon to reach with your 5 min walk. Leave in 23 min to catch the 08:05.', 'too soon to walk');
    await page.clock.fastForward('01:30:00');   // 09:07
    await page.waitForTimeout(50);
    c = await card(page).innerText();
    has(c, 'NEXT · TOMORROW', 'after the last one: tomorrow (Friday)');
    has(c, '07:15', 'first one tomorrow');
    has(c, 'in 22 h 08 min', 'hours to wait');
    has(c, 'Then 07:40 and 08:05', 'then without far countdowns');
    has(c, 'That was the last one today.', 'last one gone');
    ok(!c.includes('Leave in 22'), 'no leave line hours ahead');
    // ---------- 4. full timetable ----------
    page = await newPage(390, null, new Date('2026-10-29T07:50:00+05:00'));
    await page.goto(url);
    ok(await page.locator('#routes .route').count() === 0, 'separate context starts empty');
    await page.close();

    // reload with saved state in the same context
    page = await newPage(390);
    await page.goto(url);
    await page.click('#example');
    ok(await page.locator('#routes .route').count() === 2, 'example adds two stops');
    c = await card(page, 0).innerText();
    has(c, 'Then 08:05', 'example shuttle');
    c = await card(page, 1).innerText();
    has(c, 'Bus 42 home', 'example bus');
    has(c, '07:40', 'every 20 min bus next 07:40');
    has(c, 'Last one today: 00:10 (after midnight).', 'last one after midnight');
    await card(page, 0).locator('text=Full timetable').click();
    const items = card(page, 0).locator('.times li');
    ok(await items.count() === 7, 'full timetable lists 7 times today');
    ok((await items.nth(0).getAttribute('class')) === 'gone', '07:15 faded as gone');
    ok((await items.nth(1).getAttribute('class')) === 'next', '07:40 marked next');
    await card(page, 0).locator('.full select').selectOption('2');   // Saturday
    ok(await card(page, 0).locator('.times li').count() === 3, 'Saturday has 3 times');
    await card(page, 0).locator('.full select').selectOption('3');   // Sunday
    has(await card(page, 0).innerText(), 'No departures on this day.', 'Sunday none');
    await card(page, 1).locator('text=Full timetable').click();
    ok(await card(page, 1).locator('.times li.late').count() === 1, 'after-midnight time marked +1');
    // reload keeps everything
    await page.reload();
    ok(await page.locator('#routes .route').count() === 2, 'reload keeps the stops');
    // move up
    await card(page, 1).locator('text=Move up').click();
    has(await card(page, 0).innerText(), 'Bus 42 home', 'move up');
    ok(await card(page, 0).locator('text=Move up').count() === 0, 'first card has no Move up');
    // copy
    await card(page, 1).locator('text=Copy times').click();
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    ok(clip.startsWith('Shuttle to Campus (from Main Market stop)\nMon–Fri: 07:15 07:40 08:05 08:30 09:00 10:30 12:00\nSat: 08:00 10:00 12:00\nNo service: Sun'), 'copy text', clip);
    has(await txt(page, '#toast'), 'Copied the times of Shuttle to Campus.', 'copy message');

    // ---------- 5. holiday ----------
    await page.check('#today-holiday');
    has(await card(page, 1).innerText(), 'Today is a public holiday: no departures (none on Sundays).', 'holiday: shuttle has no Sunday times');
    has(await card(page, 1).innerText(), 'NEXT · TOMORROW', 'holiday: next is tomorrow');
    has(await card(page, 0).innerText(), 'Today is a public holiday: Sunday times.', 'holiday: bus runs Sunday times');
    has(await card(page, 0).innerText(), '08:00\nin 27 min', 'holiday bus: Sunday every 30 from 06:30, next 08:00');
    has(await txt(page, '#hol-list'), 'Thu 29 Oct 2026 (today)', 'holiday listed');
    await page.uncheck('#today-holiday');
    has(await card(page, 1).innerText(), 'Today (Thu)', 'holiday off');
    await page.click('#hol-add');
    has(await txt(page, '#hol-err'), 'Pick a date first.', 'blank holiday refused');
    await page.fill('#hol-date', '2026-12-25');
    await page.click('#hol-add');
    has(await txt(page, '#hol-list'), 'Fri 25 Dec 2026', 'holiday added');
    await page.locator('#hol-list button', { hasText: 'Remove' }).click();
    has(await txt(page, '#hol-list'), 'No holidays added.', 'holiday removed');
    await page.click('#toast-undo');
    has(await txt(page, '#hol-list'), 'Fri 25 Dec 2026', 'holiday undo');

    // ---------- 6. edit ----------
    await card(page, 1).locator('button', { hasText: 'Edit' }).click();
    const edc = page.locator('.route.editing');
    ok(await edc.count() === 1, 'editor opens in place');
    ok(await edc.locator('textarea').first().inputValue() === '07:15 07:40 08:05 08:30 09:00 10:30 12:00', 'times shown for editing');
    await page.clock.fastForward('01:00');
    ok(await page.locator('.route.editing').count() === 1, 'editor survives a tick');
    await edc.locator('textarea').first().fill('07:15 07:45 08:05');
    await edc.locator('text=Cancel').click();
    has(await card(page, 1).innerText(), 'Then 08:05', 'cancel keeps old times');
    await card(page, 1).locator('button', { hasText: 'Edit' }).click();
    await page.locator('.route.editing textarea').first().fill('07:15 07:45 08:05');
    // every N minutes on the Saturday set
    const sat = page.locator('.route.editing .slot').nth(1);
    await sat.locator('text=+ Add times every N minutes').click();
    await sat.locator('input[type=time]').nth(0).fill('13:00');
    await sat.locator('input[type=time]').nth(1).fill('14:00');
    await sat.locator('.every input[inputmode=numeric]').fill('0');
    await sat.locator('text=Add these times').click();
    has(await sat.innerText(), 'whole number of minutes from 1 to 240', 'every 0 refused');
    await sat.locator('.every input[inputmode=numeric]').fill('20');
    await sat.locator('text=Add these times').click();
    ok(await sat.locator('textarea').inputValue() === '08:00 10:00 12:00 13:00 13:20 13:40 14:00', 'every 20 added and merged', await sat.locator('textarea').inputValue());
    // dated summer timetable
    await page.locator('.route.editing').getByText('+ Add times for other days').click();
    const g3 = page.locator('.route.editing .slot').nth(2);
    await g3.locator('.day span', { hasText: 'Thu' }).click();
    await g3.locator('textarea').fill('09:30');
    await g3.locator('text=+ Only between dates (optional)').click();
    await g3.locator('input[type=date]').nth(0).fill('2026-11-01');
    await g3.locator('input[type=date]').nth(1).fill('2026-10-01');
    await page.locator('.route.editing button', { hasText: 'Save changes' }).click();
    has(await page.locator('.route.editing').innerText(), 'Until must be on or after From.', 'dates the wrong way round');
    await g3.locator('input[type=date]').nth(0).fill('2026-10-26');
    await g3.locator('input[type=date]').nth(1).fill('2026-10-30');
    await page.locator('.route.editing button', { hasText: 'Save changes' }).click();
    c = await card(page, 1).innerText();
    has(c, 'Today (Thu): Thu dated times.', 'dated timetable replaces today');
    has(c, '09:30', 'dated time is next');
    has(await txt(page, '#toast'), 'Saved changes to Shuttle to Campus.', 'saved message');
    has(c, 'Then tomorrow 07:15 and 07:45', 'then with a day change');
    // ---------- 7. delete and undo ----------
    await card(page, 1).locator('button', { hasText: 'Delete' }).click();
    ok(await page.locator('#routes .route').count() === 1, 'deleted');
    await page.click('#toast-undo');
    ok(await page.locator('#routes .route').count() === 2, 'undo delete');

    // ---------- 8. backup and restore ----------
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#backup')]);
    const file = await dl.path(); const backup = JSON.parse(fs.readFileSync(file, 'utf8'));
    ok(backup.app === SLUG && backup.routes.length === 2, 'backup file');
    page.once('dialog', d => d.accept());
    await page.click('#del-all');
    ok(await page.locator('#routes .route').count() === 0 && await page.locator('#add').isVisible(), 'delete everything');
    await page.click('#toast-undo');
    ok(await page.locator('#routes .route').count() === 2, 'undo delete everything');
    const tmp = path.join(require('os').tmpdir(), 'bt-bad.json'); fs.writeFileSync(tmp, '{"hello":1}');
    await page.setInputFiles('#restore-file', tmp);
    await page.waitForTimeout(100);
    has(await txt(page, '#tools-msg'), 'not a backup from this app', 'bad backup refused');
    fs.writeFileSync(tmp, JSON.stringify({ routes: [backup.routes[0]] }));
    await page.setInputFiles('#restore-file', tmp);
    await page.waitForTimeout(100);
    ok(await page.locator('#routes .route').count() === 1, 'restore replaces');
    await page.click('#toast-undo');
    ok(await page.locator('#routes .route').count() === 2, 'undo restore');
    ok(!page.errors.length, 'no console errors in main run', page.errors.join(' | '));

    // ---------- 9. odd input: very long text, night bus, corrupt storage, Sunday ----------
    page = await newPage(320, null, new Date('2026-10-31T00:10:00+05:00'));   // Sat 00:10, Friday night
    await page.goto(url);
    await page.fill(ed + ' input[placeholder="e.g. Bus 42 to City Centre"]', 'N'.repeat(80));
    ok((await page.inputValue(ed + ' input[placeholder="e.g. Bus 42 to City Centre"]')).length === 60, 'name capped at 60');
    await page.fill(ed + ' input[placeholder="e.g. Bus 42 to City Centre"]', 'Night bus to Old Town with a really long name that wraps');
    await page.fill(ed + ' textarea', '21:30 22:30 23:30 00:30 01:30');
    has(await txt(page, ed), '5 times, 21:30 to 01:30 (2 after midnight, counted as the night before).', 'night bus parsed');
    await page.click('text=Save this stop');
    c = await card(page).innerText();
    has(c, '00:30', 'Friday night 00:30 is next on Saturday 00:10');
    has(c, 'in 20 min', 'in 20 min');
    has(c, 'Last one today: 01:30 (after midnight).', 'last one for Saturday service is 01:30 next night');
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal scroll at 320 with a long name');
    await page.evaluate(k => localStorage.setItem(k, '{broken'), SLUG + '.state');
    await page.reload();
    ok(await page.locator('#add').isVisible() && !page.errors.length, 'corrupt storage starts fresh', page.errors.join('|'));
    await page.evaluate(k => localStorage.setItem(k, JSON.stringify({ routes: [{ name: '<img src=x onerror=alert(1)>', groups: [{ days: [0, 1, 2, 3, 4, 5, 6], times: [600] }] }] })), SLUG + '.state');
    await page.reload();
    has(await card(page).innerText(), '<img src=x onerror=alert(1)>', 'typed HTML shown as text');
    ok(!page.errors.length, 'no errors on odd input');

    // blocked storage
    page = await newPage(390);
    await page.addInitScript(() => { Storage.prototype.setItem = function () { throw new Error('blocked'); }; });
    await page.goto(url);
    await page.click('#example');
    ok(await page.locator('#store-warn').isVisible() && await page.locator('#routes .route').count() === 2, 'blocked storage: warning and the app still works');
    await page.context().close();

    // ---------- 10. layout: controls do not overlap at phone widths with every field open ----------
    for (const w of [320, 360, 390]) {
        page = await newPage(w);
        await page.goto(url);
        await page.click('text=+ Add the stop name (optional)');
        await page.selectOption(ed + ' select', 'other');
        await page.click('text=Weekdays, Saturday, Sunday');
        for (let i = 0; i < 3; i++) { await page.locator(ed + ' .slot').nth(i).locator('text=+ Add times every N minutes').click(); await page.locator(ed + ' .slot').nth(i).locator('text=+ Only between dates (optional)').click(); }
        const bad = await page.evaluate(() => {
            const els = [...document.querySelectorAll('#add input:not([type=checkbox]), #add select, #add button, #add textarea, #add .day span')].filter(e => e.offsetParent);
            const out = [];
            for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
                const a = els[i].getBoundingClientRect(), b = els[j].getBoundingClientRect();
                if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1 && !els[i].contains(els[j]) && !els[j].contains(els[i]) && !els[i].closest('label')?.contains(els[j])) out.push(els[i].outerHTML.slice(0, 50) + ' / ' + els[j].outerHTML.slice(0, 50));
            }
            const ph = [...document.querySelectorAll('#add input[placeholder]')].filter(e => e.offsetParent).filter(e => { const c = document.createElement('canvas').getContext('2d'); const cs = getComputedStyle(e); c.font = cs.fontSize + ' ' + cs.fontFamily; return c.measureText(e.placeholder).width > e.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) + 1; }).map(e => e.placeholder);
            return { out, ph, scroll: document.documentElement.scrollWidth > innerWidth };
        });
        ok(!bad.out.length, w + 'px: no overlapping controls', bad.out.slice(0, 3).join(' || '));
        ok(!bad.ph.length, w + 'px: placeholders fit', bad.ph.join(', '));
        ok(!bad.scroll, w + 'px: no horizontal scroll with every field open');
        // filled state
        await page.click('#example');
        const bad2 = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth > innerWidth }));
        ok(!bad2.scroll, w + 'px filled: no horizontal scroll');
        await page.context().close();
    }

    // ---------- 11. widths, both themes, filled and empty, scroll overlap ----------
    for (const scheme of ['dark', 'light']) {
        page = await newPage(1280, { colorScheme: scheme });
        await page.goto(url);
        for (const filled of [false, true]) {
            if (filled) { await page.click('#example'); await page.locator('#routes .route').nth(0).locator('text=Full timetable').click(); }
            for (const w of [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920]) {
                await page.setViewportSize({ width: w, height: 900 });
                const r = await page.evaluate(() => {
                    const scroll = document.documentElement.scrollWidth > innerWidth + 1;
                    const out = [...document.querySelectorAll('main *')].filter(e => { const b = e.getBoundingClientRect(); return b.width && (b.right > innerWidth + 1 || b.left < -1) && !e.closest('.sr-only'); }).map(e => e.className).slice(0, 3);
                    return { scroll, out };
                });
                ok(!r.scroll && !r.out.length, scheme + ' ' + w + (filled ? ' filled' : ' empty') + ': fits', JSON.stringify(r));
                if (w >= 900) for (const pos of [0, .5, 1]) {
                    await page.evaluate(p => window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * p), pos);
                    const o = await page.evaluate(() => {
                        const res = [];
                        for (const parent of [document.querySelector('main'), ...document.querySelectorAll('.col-a, .col-b')]) {
                            const kids = [...parent.children].filter(e => e.offsetParent && getComputedStyle(e).display !== 'contents');
                            for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
                                const a = kids[i].getBoundingClientRect(), b = kids[j].getBoundingClientRect();
                                if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) res.push(kids[i].className + '/' + kids[j].className);
                            }
                        }
                        return res;
                    });
                    ok(!o.length, scheme + ' ' + w + ' scroll ' + pos + ': no overlap', o.join(', '));
                }
            }
        }
        // theme switch
        const before = await page.evaluate(() => getComputedStyle(document.body).color);
        await page.locator('.theme-toggle').click();
        const after = await page.evaluate(() => getComputedStyle(document.body).color);
        ok(before !== after, scheme + ': theme switch changes colours');
        ok(!page.errors.length, scheme + ': no console errors', page.errors.join(' | '));
        await page.context().close();
    }

    // ---------- 12. help dialog ----------
    for (const w of [320, 390, 820, 1280]) {
        page = await newPage(w);
        await page.goto(url);
        await page.locator('.help-btn, button:has-text("Help")').first().click();
        const d = page.locator('dialog.help');
        const r = await d.boundingBox();
        ok(await d.evaluate(e => e.open) && r.x >= 0 && r.y >= 0 && r.x + r.width <= w + 1 && r.y + r.height <= 901, w + ': help fits');
        has(await d.locator('h2').innerText(), 'How to use the Bus and Train Timetable for My Stops', w + ': help title');
        await page.keyboard.press('Escape');
        ok(!(await d.evaluate(e => e.open)), w + ': Escape closes help');
        await page.locator('.help-btn, button:has-text("Help")').first().click();
        await page.click('.help-close');
        ok(!(await d.evaluate(e => e.open)), w + ': Got it closes help');
        await page.context().close();
    }

    ok(!failed.length, 'every request succeeded', failed.join(', '));
    await browser.close(); if (srv) srv.s.close();
    console.log((fail ? 'FAILED ' + fail + ', ' : '') + 'passed ' + pass + ' UI checks');
    process.exitCode = fail ? 1 : 0;
})();
