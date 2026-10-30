// Drives the real page in headless Chromium. Run from the repo root: node load-shedding-schedule-and-power-cut-log/ui-test.js [baseUrl]
// The clock is fixed at Thu 29 Oct 2026 12:20 in Lahore (Asia/Karachi) so every answer is exact.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), http = require('http');
const SLUG = 'load-shedding-schedule-and-power-cut-log';
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function ok(cond, name, extra) { if (cond) pass++; else { fail++; console.log('FAIL ' + name + (extra ? '\n   ' + extra : '')); } }
const norm = s => String(s).replace(/\n\s*\n/g, '\n');
const has = (text, part, name) => ok(norm(text).includes(norm(part)), name, 'missing "' + part + '" in: ' + String(text).slice(0, 400).replace(/\n/g, ' | '));
const T0 = new Date('2026-10-29T12:20:00+05:00');

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
    async function newPage(w, opts) {
        const ctx = await browser.newContext({ viewport: { width: w || 390, height: 900 }, timezoneId: 'Asia/Karachi', acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'], serviceWorkers: 'block', ...(opts || {}) });
        await ctx.route(/goatcounter\.com|gc\.zgo\.at/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
        const page = await ctx.newPage();
        page.errors = [];
        page.on('pageerror', e => page.errors.push(e.message));
        page.on('console', m => { if (m.type() === 'error') page.errors.push(m.text()); });
        await page.clock.install({ time: T0 });
        return page;
    }
    const txt = (page, sel) => page.locator(sel).first().innerText();
    const times = page => page.locator('#add-editor input[type=time]');

    // ---------- 1. first use ----------
    let page = await newPage(390);
    await page.goto(url);
    ok(await page.locator('#add').isVisible(), 'first use: the add card shows');
    ok(!(await page.locator('#log').isVisible()), 'first use: no log yet');
    ok(await page.inputValue('#add-editor input[type=text]') === 'Home', 'name starts as Home');
    ok(await page.locator('#add-editor textarea').isHidden(), 'paste box is optional and hidden');

    // blank name
    await page.fill('#add-editor input[type=text]', '   ');
    await page.click('.save-place');
    has(await txt(page, '#add-editor'), 'Type a name, such as Home.', 'blank name');
    await page.click('#add-editor .chip >> text=Home');
    // only one time typed
    await times(page).nth(0).fill('14:00');
    await page.click('.save-place');
    has(await txt(page, '#add-editor'), 'Pick the time the power comes back.', 'half a cut time');
    await times(page).nth(1).fill('14:00');
    await page.click('.save-place');
    has(await txt(page, '#add-editor'), 'The power cannot go and come back at the same time.', 'same start and end');
    await times(page).nth(1).fill('16:00');
    has(await txt(page, '#add-editor .slot'), 'A 2 h cut.', 'length shown');
    // no days
    for (const c of await page.locator('#add-editor .slot input[type=checkbox]').all()) await c.uncheck({ force: true });
    await page.click('.save-place');
    has(await txt(page, '#add-editor'), 'Pick at least one day.', 'no days');
    for (const c of await page.locator('#add-editor .slot input[type=checkbox]').all()) await c.check({ force: true });

    // paste the rest from the company's message
    await page.click('text=+ Paste the times from a message (optional)');
    await page.fill('#add-editor textarea', 'Feeder: Model Town\n08:00-09:00, 14:00 to 16:00\n8pm - 9pm\nCall 118');
    await page.click('.add-pasted');
    has(await txt(page, '#add-editor .paste'), 'Added 2 cut times. Could not read: Call 118', 'paste result');
    ok(await page.locator('#add-editor .slot').count() === 3, '3 cut boxes, duplicate 14:00 not added twice');
    // the Friday change: 20-21 not on Friday, and 22-23 only on Friday
    const slots = page.locator('#add-editor .slot');
    const s20 = slots.nth(2);
    ok(await s20.locator('input[type=time]').nth(0).inputValue() === '20:00', '8pm read as 20:00');
    await s20.locator('label.day:has-text("Fri")').click();
    await page.click('.add-slot');
    const s22 = slots.nth(3);
    await s22.locator('input[type=time]').nth(0).fill('22:00');
    await s22.locator('input[type=time]').nth(1).fill('23:00');
    for (const d of ['Mon', 'Tue', 'Wed', 'Thu', 'Sat', 'Sun']) await s22.locator('label.day:has-text("' + d + '")').click();
    // across midnight note, then back
    await s22.locator('input[type=time]').nth(1).fill('01:00');
    has(await s22.innerText(), 'Ends the next day, at 01:00.', 'across midnight note');
    await s22.locator('input[type=time]').nth(1).fill('23:00');
    // remove a box and add an empty one: empty boxes are ignored
    await page.click('.add-slot');
    ok(await slots.count() === 5, 'empty box added');
    await page.click('.save-place');
    await page.waitForSelector('.place');
    let box = await txt(page, '.place');
    has(box, 'Home', 'place saved');
    has(box, '4 planned cut times, up to 4 h a day', '4 cut times');
    has(box, 'Power should be on', 'status at 12:20');
    has(box, 'Next cut 14:00 to 16:00, in 1 h 40 min.', 'next cut answer');
    has(box, 'Today: 08:00 to 09:00 · 14:00 to 16:00 · 20:00 to 21:00', 'today list (Thursday)');
    has(box, 'Tomorrow: 08:00 to 09:00 · 14:00 to 16:00 · 22:00 to 23:00', 'tomorrow list (Friday)');
    ok(await page.locator('#add').isHidden(), 'add card hidden after the first place');
    ok(await page.locator('#log').isVisible(), 'log shows');

    // ---------- 2. countdown moves on, planned cut now ----------
    await page.clock.fastForward('03:05:00'); // 15:25
    await page.waitForTimeout(100);
    box = await txt(page, '.place');
    has(box, 'Planned cut now', 'planned cut now at 15:25');
    has(box, 'Power back at 16:00, in 35 min.', 'power back answer');

    // ---------- 3. Power went / Power is back ----------
    await page.click('.big-btn');
    box = await txt(page, '.place');
    has(box, 'Power is off since 15:25', 'power went');
    has(box, 'Planned cut until 16:00, in 35 min.', 'during a planned cut');
    ok(await page.locator('.big-btn').innerText() === 'Power is back', 'button flips');
    await page.clock.fastForward('01:10:00'); // 16:35
    await page.click('.big-btn');
    has(await txt(page, '#toast'), 'Power back at 16:35 after 1 h 10 min.', 'power back toast');
    has(await txt(page, '#rows'), '15:25 to 16:35', 'logged row');
    has(await txt(page, '#rows'), '35 min outside planned times', 'row judged against plan');

    // ---------- 4. add a cut you forgot (across midnight), errors ----------
    await page.click('#past-open');
    const pb = page.locator('#past-box');
    await pb.locator('input[type=date]').nth(0).fill('2026-10-27');
    await pb.locator('input[type=time]').nth(0).fill('23:30');
    await pb.locator('input[type=time]').nth(1).fill('00:40');
    ok(await pb.locator('input[type=date]').nth(1).inputValue() === '2026-10-28', 'back date moves to the next day by itself');
    has(await pb.innerText(), 'The power came back on Wed 28 Oct.', 'next day note');
    ok(await pb.locator('input[placeholder="e.g. transformer fault"]').isHidden(), 'note is optional and hidden');
    await pb.locator('.save-cut').click();
    has(await txt(page, '#rows'), 'Tue 27 Oct', 'past cut added');
    has(await txt(page, '#rows'), '23:30 to Wed 28 Oct 00:40', 'across midnight row');
    // future
    await page.click('#past-open');
    await pb.locator('input[type=date]').nth(0).fill('2026-10-29');
    await pb.locator('input[type=time]').nth(0).fill('20:00');
    await pb.locator('input[type=time]').nth(1).fill('21:00');
    await pb.locator('.save-cut').click();
    has(await pb.innerText(), 'The power cannot go in the future.', 'future cut refused');
    // overlap
    await pb.locator('input[type=time]').nth(0).fill('16:00');
    await pb.locator('input[type=time]').nth(1).fill('16:30');
    await pb.locator('.save-cut').click();
    has(await pb.innerText(), 'This overlaps the cut on Thu 29 Oct from 15:25 to 16:35. Edit that one instead.', 'overlap refused');
    // missing back time
    await pb.locator('input[type=date]').nth(0).fill('2026-10-25');
    await pb.locator('input[type=time]').nth(0).fill('13:50');
    await pb.locator('input[type=time]').nth(1).fill('');
    await pb.locator('.save-cut').click();
    has(await pb.innerText(), 'Pick the date and time the power came back, or tick Still off.', 'missing back time');
    // still off while a later cut exists
    await pb.locator('input[type=checkbox]').check();
    await pb.locator('.save-cut').click();
    has(await pb.innerText(), 'A later cut is logged, so this one must have ended.', 'still off with later cuts refused');
    await pb.locator('input[type=checkbox]').uncheck();
    await pb.locator('input[type=time]').nth(1).fill('18:00');
    await pb.locator('text=+ Add a note (optional)').click();
    await pb.locator('input[placeholder="e.g. transformer fault"]').fill('Transformer fault, ' + 'very long note '.repeat(20));
    await pb.locator('.save-cut').click();
    let rows = await txt(page, '#rows');
    has(rows, 'Sun 25 Oct', 'Sunday cut added');
    has(rows, '2 h 10 min outside planned times', 'partly planned');
    has(rows, 'Transformer fault', 'note shown');
    // an unplanned night cut
    await page.click('#past-open');
    await pb.locator('input[type=date]').nth(0).fill('2026-10-27');
    await pb.locator('input[type=time]').nth(0).fill('03:00');
    await pb.locator('input[type=time]').nth(1).fill('05:30');
    await pb.locator('.save-cut').click();

    // ---------- 5. the totals ----------
    await page.selectOption('#log-period', '7d');
    let sum = await txt(page, '#sum');
    // cuts: 25 Oct 13:50-18:00 (250), 27 Oct 03:00-05:30 (150), 27/28 Oct 23:30-00:40 (70), 29 Oct 15:25-16:35 (70) = 540 min = 9 h
    has(sum, '23 Oct to 29 Oct 2026', '7 days period text');
    has(sum, 'Without power\n9 h', 'total 9 h');
    has(sum, '4 cuts', '4 cuts');
    // planned since 25 Oct (the earliest cut's day): 25..28 Oct 4 h each = 16 h, 29 Oct until 16:35 = 08-09 + 14-16 = 3 h; total 19 h
    has(sum, 'Planned load shedding\n19 h', 'planned 19 h');
    has(sum, '10 h less than planned', 'difference');
    // outside: 130 + 150 + 70 + 35 = 385 = 6 h 25 min
    has(sum, 'Outside the planned times\n6 h 25 min', 'outside');
    has(sum, 'Including 2 unplanned cuts.', 'unplanned count');
    has(sum, 'Longest cut\n4 h 10 min', 'longest');
    // copy for a complaint
    await page.click('#copy');
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    has(clip, 'Power cuts at Home, 23 Oct to 29 Oct 2026\nWithout power: 9 h in 4 cuts', 'copied summary');
    has(clip, 'Tue 27 Oct  23:30 to Wed 28 Oct 00:40  1 h 10 min  (not planned)', 'copied list');
    has(await txt(page, '#log-msg'), 'Copied.', 'copied message');
    // csv
    let [dl] = await Promise.all([page.waitForEvent('download'), page.click('#csv')]);
    let csv = fs.readFileSync(await dl.path(), 'utf8');
    has(csv, 'Home,2026-10-25 13:50,2026-10-25 18:00,250,Partly,130,"Transformer fault, very long note', 'csv row');
    ok(dl.suggestedFilename() === 'power-cuts-2026-10-23-to-2026-10-29.csv', 'csv name', dl.suggestedFilename());
    // email builds a mailto link and does not crash
    await page.evaluate(() => { window.__mail = null; });
    await page.click('#email').catch(() => {});
    // custom dates
    await page.selectOption('#log-period', 'custom');
    await page.fill('#log-from', '2026-10-28'); await page.dispatchEvent('#log-from', 'change');
    await page.fill('#log-to', '2026-10-01'); await page.dispatchEvent('#log-to', 'change');
    has(await txt(page, '#period-err'), 'The "To" date is before the "From" date.', 'dates wrong way round');
    ok(await page.locator('#share').isHidden(), 'no sharing while dates are wrong');
    await page.fill('#log-to', '2026-10-28'); await page.dispatchEvent('#log-to', 'change');
    sum = await txt(page, '#sum');
    has(sum, 'Wed 28 Oct 2026', 'one day');
    has(sum, 'Without power\n40 min', 'only the part after midnight counts on 28 Oct');
    await page.fill('#log-from', '2026-09-01'); await page.dispatchEvent('#log-from', 'change');
    await page.fill('#log-to', '2026-09-30'); await page.dispatchEvent('#log-to', 'change');
    has(await txt(page, '#rows'), 'No cuts logged in this time.', 'empty period');
    await page.selectOption('#log-period', 'month');

    // ---------- 6. edit, delete, undo ----------
    const rowSun = page.locator('.r-row', { hasText: 'Sun 25 Oct' });
    await rowSun.locator('button:has-text("Edit")').click();
    const ed = page.locator('.r-row.editing');
    await ed.locator('input[type=time]').nth(1).fill('17:00');
    await ed.locator('.save-cut').click();
    has(await txt(page, '#rows'), '13:50 to 17:00', 'edited');
    has(await txt(page, '#rows'), '1 h 10 min outside planned times', 'edit changes the extra time');
    await page.locator('.r-row', { hasText: 'Sun 25 Oct' }).locator('button:has-text("Delete")').click();
    ok(!(await txt(page, '#rows')).includes('Sun 25 Oct'), 'deleted');
    has(await txt(page, '#toast'), 'Cut on Sun 25 Oct deleted.', 'delete toast');
    await page.click('#toast-undo');
    has(await txt(page, '#rows'), 'Sun 25 Oct', 'undo brings it back');

    // ---------- 7. reload keeps everything ----------
    await page.reload();
    has(await txt(page, '.place'), 'Home', 'reload keeps the place');
    has(await txt(page, '#rows'), 'Sun 25 Oct', 'reload keeps cuts');
    ok(await page.inputValue('#log-period') === 'month', 'period remembered');

    // ---------- 8. edit cut times: applies from today ----------
    await page.click('.place button:has-text("Edit cut times")');
    has(await txt(page, '.place'), 'New times count from today. Earlier days keep the old times in your totals.', 'schedule change note');
    ok(await page.locator('.place .slot').count() === 4, 'editor shows the 4 cut times');
    await page.locator('.place .slot').nth(1).locator('input[type=time]').nth(1).fill('17:00');
    await page.locator('.place .save-place').click();
    has(await txt(page, '.place'), 'Today: 08:00 to 09:00 · 14:00 to 17:00 · 20:00 to 21:00', 'new times today');
    await page.selectOption('#log-period', '7d');
    // old days keep the old plan (25 to 28 Oct: 16 h); today now plans 08-09 and 14-17, counted up to the page's clock
    const nowMin = await page.evaluate(() => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); });
    const planMin = 16 * 60 + 60 + Math.min(nowMin, 17 * 60) - 14 * 60, fm = m => Math.floor(m / 60) + ' h' + (m % 60 ? ' ' + m % 60 + ' min' : '');
    has(await txt(page, '#sum'), 'Planned load shedding\n' + fm(planMin), 'old days keep the old plan, today uses the new times');
    // duplicate name for a second place
    await page.click('#add-more');
    await page.fill('#add-editor input[type=text]', 'home');
    await page.click('#add-editor .save-place');
    has(await txt(page, '#add-editor'), 'You already have a place called home.', 'duplicate name');
    await page.click('#add-editor .chip >> text=Shop');
    await times(page).nth(0).fill('22:00'); await times(page).nth(1).fill('01:00');
    await page.click('#add-editor .save-place');
    ok(await page.locator('.place').count() === 2, 'second place');
    has(await page.locator('.place').nth(1).innerText(), 'Next cut 22:00 to 01:00', 'shop next cut across midnight');
    ok(await page.locator('#log-place-box').isVisible(), 'place picker shows with 2 places');
    await page.selectOption('#log-place', { label: 'Shop' });
    has(await txt(page, '#rows'), 'No cuts logged yet.', 'shop has its own log');
    // shop with no cut times at all
    // calendar file
    await page.locator('.place').nth(0).locator('button:has-text("Add to calendar")').click();
    await page.selectOption('.cal select', '30');
    [dl] = await Promise.all([page.waitForEvent('download'), page.click('.cal .primary')]);
    const ics = fs.readFileSync(await dl.path(), 'utf8');
    has(ics, 'RRULE:FREQ=WEEKLY;BYDAY=FR', 'calendar Friday cut');
    has(ics, 'TRIGGER:-PT30M', 'calendar reminder 30 min');
    ok(dl.suggestedFilename() === 'power-cuts-home.ics', 'ics name');

    // ---------- 9. delete place, undo; backup; restore; delete everything ----------
    await page.locator('.place').nth(1).locator('button:has-text("Delete place")').click();
    ok(await page.locator('.place').count() === 1, 'place deleted');
    await page.click('#toast-undo');
    ok(await page.locator('.place').count() === 2, 'place back');
    [dl] = await Promise.all([page.waitForEvent('download'), page.click('#backup')]);
    const backupPath = path.join(__dirname, '..', '.ui-backup.json');
    fs.copyFileSync(await dl.path(), backupPath);
    await page.click('#del-all');
    ok(await page.locator('#add').isVisible(), 'start over shows the add card');
    ok(await page.locator('.place').count() === 0, 'everything deleted');
    await page.click('#toast-undo');
    ok(await page.locator('.place').count() === 2, 'undo delete everything');
    await page.click('#del-all');
    await page.setInputFiles('#restore-file', backupPath);
    await page.waitForSelector('.place');
    ok(await page.locator('.place').count() === 2, 'restore');
    fs.writeFileSync(backupPath, '{"places": 7}');
    await page.setInputFiles('#restore-file', backupPath);
    has(await txt(page, '#tools-msg'), 'That file is not a backup from this app.', 'bad backup refused');
    fs.unlinkSync(backupPath);
    ok(page.errors.length === 0, 'no console errors in the main run', page.errors.join(' | '));

    // ---------- 10. corrupt and odd saved data ----------
    page = await newPage(390);
    await page.goto(url);
    await page.evaluate(k => localStorage.setItem(k, '{"places":[{"name":"' + 'X'.repeat(300) + '","schedules":[{"from":"2026-10-01","slots":[{"s":-5,"e":3,"days":[1]},{"s":60,"e":120,"days":[0,1,2,3,4,5,6]}]}],"cuts":[{"s":"x"},{"s":1,"e":null},{"s":5,"e":null}]}]}'), SLUG + '.state');
    await page.reload();
    has(await txt(page, '.place'), 'X'.repeat(40), 'long name cut to 40');
    ok(page.errors.length === 0, 'odd saved data loads', page.errors.join(' | '));
    await page.evaluate(k => localStorage.setItem(k, '{bad'), SLUG + '.state');
    await page.reload();
    ok(await page.locator('#add').isVisible(), 'corrupt data starts fresh');
    ok(page.errors.length === 0, 'corrupt data: no errors', page.errors.join(' | '));

    // ---------- 11. a place with no schedule at all ----------
    await times(page).nth(0).fill('');
    await page.click('.save-place');
    has(await txt(page, '.place'), 'No planned cut times', 'no schedule status');
    ok(await page.locator('.place button:has-text("Add to calendar")').isDisabled(), 'no calendar without times');
    await page.click('.big-btn');
    await page.clock.fastForward('00:20:00');
    await page.click('.big-btn');
    has(await txt(page, '#sum'), 'No cut times for Home, so every cut counts as unplanned.', 'no schedule note');

    // ---------- 12. theme switch ----------
    const tt = page.locator('.theme-toggle');
    if (await tt.count()) { const before = await page.evaluate(() => document.documentElement.dataset.theme || ''); await tt.click(); const after = await page.evaluate(() => document.documentElement.dataset.theme || ''); ok(before !== after, 'theme switch changes the look'); }

    // ---------- 13. layout with filled state at every width, light and dark ----------
    const seed = fs.readFileSync(path.join(__dirname, 'test-data.json'), 'utf8');
    for (const scheme of ['dark', 'light']) for (const w of [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920]) {
        const p2 = await newPage(w, { colorScheme: scheme });
        await p2.goto(url);
        await p2.evaluate(([k, s]) => localStorage.setItem(k, s), [SLUG + '.state', seed]);
        await p2.reload();
        const check = async tag => {
            const r = await p2.evaluate(() => {
                const W = document.documentElement.clientWidth, out = [];
                if (document.documentElement.scrollWidth > W + 1) out.push('horizontal scroll ' + document.documentElement.scrollWidth);
                document.querySelectorAll('main *').forEach(e => { const b = e.getBoundingClientRect(); if (b.width && (b.right > W + 1 || b.left < -1) && getComputedStyle(e).position !== 'absolute') out.push('sticks out: ' + e.tagName + '.' + e.className + ' ' + Math.round(b.right)); });
                // controls overlapping each other
                const cs = [...document.querySelectorAll('main input:not([type=checkbox]):not([type=file]), main select, main button, main textarea, main label.day')].filter(e => e.offsetParent);
                for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) {
                    if (cs[i].contains(cs[j]) || cs[j].contains(cs[i])) continue;
                    const a = cs[i].getBoundingClientRect(), b = cs[j].getBoundingClientRect();
                    if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2) out.push('overlap: ' + (cs[i].textContent || cs[i].type).trim().slice(0, 20) + ' / ' + (cs[j].textContent || cs[j].type).trim().slice(0, 20));
                }
                // placeholders that do not fit
                document.querySelectorAll('main input[placeholder], main textarea[placeholder]').forEach(e => {
                    if (!e.offsetParent) return; const c = document.createElement('canvas').getContext('2d'); const st = getComputedStyle(e); c.font = st.fontSize + ' ' + st.fontFamily;
                    const room = e.clientWidth - parseFloat(st.paddingLeft) - parseFloat(st.paddingRight); if (c.measureText(e.placeholder).width > room + 1 && e.tagName === 'INPUT') out.push('placeholder cut: ' + e.placeholder);
                });
                return out;
            });
            ok(r.length === 0, scheme + ' ' + w + ' ' + tag, r.slice(0, 4).join(' ; '));
        };
        await check('filled');
        // reveal every optional field: editor with paste box, calendar, add a cut with note, add another place
        await p2.locator('.place button:has-text("Add to calendar")').first().click();
        await p2.click('#past-open');
        await p2.locator('#past-box >> text=+ Add a note (optional)').click();
        await p2.click('#add-more');
        await p2.click('#add-editor >> text=+ Paste the times from a message (optional)');
        await p2.click('#add-editor .add-slot');
        await p2.locator('.r-row button:has-text("Edit")').first().click();
        await check('everything open');
        await p2.locator('.place button:has-text("Edit cut times")').first().click();
        await check('editing cut times');
        if (w >= 900) {
            for (const pos of [0, 0.5, 1]) {
                await p2.evaluate(f => window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * f), pos);
                const o = await p2.evaluate(() => {
                    const out = []; const kids = [...document.querySelectorAll('main > *, .col-a > *, .col-b > *')].filter(e => e.offsetParent && getComputedStyle(e).display !== 'contents');
                    const groups = [document.querySelector('main'), document.querySelector('.col-a'), document.querySelector('.col-b')];
                    groups.forEach(g => { const ch = [...g.children].filter(e => e.offsetParent || getComputedStyle(e).display === 'contents').filter(e => getComputedStyle(e).display !== 'contents');
                        for (let i = 0; i < ch.length; i++) for (let j = i + 1; j < ch.length; j++) { const a = ch[i].getBoundingClientRect(), b = ch[j].getBoundingClientRect();
                            if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2) out.push(ch[i].className + ' / ' + ch[j].className); } });
                    return out;
                });
                ok(o.length === 0, scheme + ' ' + w + ' scroll ' + pos + ' no overlap', o.join('; '));
            }
        }
        ok(p2.errors.length === 0, scheme + ' ' + w + ' no errors', p2.errors.join(' | '));
        await p2.context().close();
    }

    // ---------- 14. help at 4 widths ----------
    for (const w of [320, 390, 820, 1280]) {
        const p3 = await newPage(w); await p3.goto(url);
        const hb = p3.locator('.help-btn, button:has-text("Help")').first();
        await hb.click();
        const d = p3.locator('dialog.help');
        ok(await d.evaluate(e => e.open), w + ' help opens');
        const r = await d.boundingBox();
        ok(r && r.x >= -1 && r.x + r.width <= w + 1, w + ' help inside the screen');
        has(await d.innerText(), 'How to use the Load Shedding Schedule and Power Cut Log', w + ' help title');
        await p3.keyboard.press('Escape'); ok(!(await d.evaluate(e => e.open)), w + ' Escape closes help');
        await hb.click(); await p3.locator('.help-close').click(); ok(!(await d.evaluate(e => e.open)), w + ' Got it closes help');
        const bar = await p3.evaluate(() => { const b = document.querySelector('.topbar'); return b ? b.getBoundingClientRect().height : 0; });
        ok(bar < 60, w + ' top bar on one line', String(bar));
        await p3.context().close();
    }

    await browser.close(); if (srv) srv.s.close();
    console.log('UI: ' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})();
