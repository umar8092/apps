// Full page test with Playwright. Run from the repo root or this folder: node ui-test.js
//   BASE=https://umar8092.github.io/apps node ui-test.js   tests the live site
//   node ui-test.js --shots                                 also saves screenshots/desktop.png and phone.png
// "Today" is fixed to Sat 17 Oct 2026 in Pakistan time so every answer can be checked exactly.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), SLUG = 'food-and-medicine-expiry-tracker', KEY = SLUG + '.state';
const SHOTS = process.argv.includes('--shots');
const NOW = new Date('2026-10-17T10:00:00+05:00');
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
    async function add(page, f) {
        if (!(await page.locator('#form').isVisible())) await page.click('#open-form');
        await page.fill('#f-name', f.name);
        if (f.place) await page.selectOption('#f-place', f.place);
        if (f.kind) await page.selectOption('#f-kind', f.kind);
        if (f.month) { await page.check('#f-mode-month'); await page.selectOption('#f-month', String(f.month)); await page.selectOption('#f-year', String(f.year)); }
        else { if (await page.locator('#f-mode-month').isChecked()) await page.check('#f-mode-day'); if (f.chip) await page.click('#quick .chip:text-is("' + f.chip + '")'); else await page.fill('#f-date', f.date || ''); }
        if (f.opened) { await page.click('#o-open'); await page.fill('#f-opened', f.opened); await page.selectOption('#f-opensel', f.openSel || 'custom'); if (f.openDays != null) await page.fill('#f-opendays', String(f.openDays)); }
        if (f.qty || f.note) { if (await page.locator('#o-more').isVisible()) await page.click('#o-more'); if (f.qty) await page.fill('#f-qty', f.qty); if (f.note) await page.fill('#f-note', f.note); }
        if (f.check) await f.check();
        await page.click('#save');
    }
    const AYESHA = [
        { name: 'Milk', place: 'fridge', date: '2026-10-18', qty: '2 litres' },
        { name: 'Yoghurt', date: '2026-10-20' },
        { name: 'Chicken', place: 'freezer', date: '2027-01-15' },
        { name: 'Pasta sauce', place: 'fridge', kind: 'best', date: '2027-03-01', opened: '2026-10-15', openSel: '5' },
        { name: 'Bread', place: 'cupboard', kind: 'best', date: '2026-10-16' },
        { name: 'Paracetamol syrup', place: 'medicine', date: '2026-10-03', note: "For Ali's fever" },
        { name: 'Eye drops', place: 'medicine', month: 3, year: 2027 },
        { name: 'Cough syrup', place: 'medicine', date: '2026-11-10' },
    ];
    async function fill(page) { for (const f of AYESHA) await add(page, f); }

    // ---------- 1. first use ----------
    let { ctx, page } = await newPage();
    ok('title', (await page.title()).startsWith('Food and Medicine Expiry Tracker'));
    ok('h1', (await page.locator('h1').innerText()) === 'Food and Medicine Expiry Tracker');
    ok('back link first in main', await page.evaluate(() => document.querySelector('main').firstElementChild.matches('a.back') || document.querySelector('main a.back') !== null));
    ok('empty state', await page.locator('#empty').isVisible());
    ok('summary empty text', (await page.locator('#sum-body').innerText()).startsWith('Nothing added yet'));
    ok('form open on first use', await page.locator('#form').isVisible());
    ok('Done hidden while empty', !(await page.locator('#cancel').isVisible()));
    ok('optional parts hidden', !(await page.locator('#w-open').isVisible()) && !(await page.locator('#w-more').isVisible()));
    ok('place defaults to fridge', (await page.inputValue('#f-place')) === 'fridge');
    ok('use by hint on first use', (await page.locator('#h-kind').innerText()).startsWith('Food that is not safe'));
    ok('share buttons disabled', await page.locator('#copy-all').isDisabled() && await page.locator('#cal-all').isDisabled());
    ok('no place filter yet', !(await page.locator('#places').isVisible()));

    // ---------- 2. errors ----------
    await page.click('#save');
    ok('blank name error', (await page.locator('#e-name').innerText()).includes('Type what it is'));
    ok('no date error', (await page.locator('#e-date').innerText()).startsWith('Choose the date printed'));
    ok('nothing added', (await page.locator('li.box').count()) === 0);
    await page.fill('#f-name', 'Juice'); await page.fill('#f-date', '2015-01-01'); await page.click('#save');
    ok('too old error', (await page.locator('#e-date').innerText()).includes('more than 10 years ago'));
    await page.check('#f-mode-month'); await page.click('#save');
    ok('month mode needs month', (await page.locator('#e-date').innerText()) === 'Choose the month and the year printed on the pack.');
    await page.check('#f-mode-day');
    await page.click('#o-open'); await page.fill('#f-date', '2026-10-25'); await page.fill('#f-opened', '2026-10-18'); await page.selectOption('#f-opensel', 'custom'); await page.fill('#f-opendays', '0'); await page.click('#save');
    ok('opened in the future error', (await page.locator('#e-opened').innerText()) === 'The opening day cannot be in the future.');
    ok('open days 0 error', (await page.locator('#e-opendays').innerText()).startsWith('Type how many days'));
    await page.click('#x-open');
    ok('remove opened hides it', !(await page.locator('#w-open').isVisible()) && await page.locator('#o-open').isVisible());
    ok('preview with valid date', (await page.locator('#preview').innerText()) === 'Use by Sun 25 Oct (in 8 days).');
    await page.click('#quick .chip:text-is("In 1 week")');
    ok('In 1 week chip', (await page.inputValue('#f-date')) === '2026-10-24');
    await page.click('#quick .chip:text-is("In 1 month")');
    ok('In 1 month chip', (await page.inputValue('#f-date')) === '2026-11-17');
    await page.fill('#f-name', ''); await page.fill('#f-date', '');

    // ---------- 3. the main situation ----------
    await add(page, AYESHA[0]);
    ok('added message', (await page.locator('#form-msg').innerText()).includes('Added Milk: use by Sun 18 Oct (tomorrow).'));
    ok('form stays open for the next one', await page.locator('#form').isVisible() && (await page.inputValue('#f-name')) === '');
    ok('name focused for the next one', await page.evaluate(() => document.activeElement.id === 'f-name'));
    ok('Done shows now', await page.locator('#cancel').isVisible());
    for (const f of AYESHA.slice(1, 4)) await add(page, f);
    // medicine box chooses Expiry date by itself
    await page.fill('#f-name', 'x'); await page.selectOption('#f-place', 'medicine');
    ok('medicine box picks expiry date', (await page.inputValue('#f-kind')) === 'exp');
    ok('hint follows the kind', (await page.locator('#h-kind').innerText()).startsWith('Medicines, vitamins'));
    await page.selectOption('#f-place', 'cupboard');
    ok('back to use by for food', (await page.inputValue('#f-kind')) === 'use');
    await page.fill('#f-name', '');
    for (const f of AYESHA.slice(4)) await add(page, f);
    await page.click('#cancel');
    ok('Done closes the form', !(await page.locator('#form').isVisible()) && await page.locator('#open-form').isVisible());
    const sum = await page.locator('#sum-body').innerText();
    ok('use first: milk', sum.includes('Milk (2 litres), fridge') && sum.includes('Use by Sun 18 Oct (tomorrow)'), sum);
    ok('expired alert', sum.includes('2 items have passed the date on the pack'), sum);
    ok('counts', sum.includes('2 expired') && sum.includes('4 use soon') && sum.includes('2 later'), sum);
    ok('expired group', JSON.stringify(await names(page, 'expired')) === JSON.stringify(['Paracetamol syrup', 'Bread']), await names(page, 'expired'));
    ok('use soon group', JSON.stringify(await names(page, 'soon')) === JSON.stringify(['Milk', 'Pasta sauce', 'Yoghurt', 'Cough syrup']), await names(page, 'soon'));
    ok('later group', JSON.stringify(await names(page, 'later')) === JSON.stringify(['Chicken', 'Eye drops']), await names(page, 'later'));
    ok('paracetamol line', (await stOf(page, 'Paracetamol syrup')) === 'Expired on Sat 3 Oct (2 weeks ago): do not use');
    ok('bread line', (await stOf(page, 'Bread')) === 'Best before passed on Fri 16 Oct (yesterday): check it before eating');
    ok('sauce line', (await stOf(page, 'Pasta sauce')) === 'Use by Tue 20 Oct (in 3 days), 5 days after opening');
    ok('eye drops line', (await stOf(page, 'Eye drops')) === 'Expires end of Mar 2027 (in 5 months)');
    ok('cough line', (await stOf(page, 'Cough syrup')) === 'Expires Tue 10 Nov (in 3 weeks)');
    ok('chicken line', (await stOf(page, 'Chicken')) === 'Use by Fri 15 Jan 2027 (in 2 months)');
    ok('note shown', (await boxOf(page, 'Paracetamol syrup').locator('.box-note').innerText()) === "For Ali's fever");
    ok('sub line', (await boxOf(page, 'Pasta sauce').locator('.box-sub').innerText()) === 'Fridge · opened Thu 15 Oct · best before Mon 1 Mar 2027 on the pack');
    ok('opened item has no Opened button', (await boxOf(page, 'Pasta sauce').locator('button:text-is("Opened")').count()) === 0);
    ok('expired item has no Calendar button', (await boxOf(page, 'Bread').locator('button:text-is("Calendar")').count()) === 0);
    ok('expired item: Thrown away first, no Opened', JSON.stringify(await boxOf(page, 'Bread').locator('button').allInnerTexts()) === JSON.stringify(['Thrown away', 'Used up', 'Edit']), await boxOf(page, 'Bread').locator('button').allInnerTexts());
    ok('fresh item buttons', JSON.stringify(await boxOf(page, 'Milk').locator('button').allInnerTexts()) === JSON.stringify(['Used up', 'Thrown away', 'Opened', 'Edit', 'Calendar']), await boxOf(page, 'Milk').locator('button').allInnerTexts());
    ok('find appears at 8 items', await page.locator('#find').isVisible());

    // ---------- 4. place filter and find ----------
    ok('place filter shows', await page.locator('#places').isVisible());
    ok('place chips', JSON.stringify(await page.locator('#places .place').allInnerTexts()) === JSON.stringify(['All (8)', 'Fridge (3)', 'Freezer (1)', 'Cupboard (1)', 'Medicine box (3)']), await page.locator('#places .place').allInnerTexts());
    await page.click('#places .place[data-place="medicine"]');
    ok('medicine filter', (await page.locator('#list li.box').count()) === 3 && (await page.locator('#places .place[data-place="medicine"]').getAttribute('aria-pressed')) === 'true');
    await page.click('#places .place[data-place="all"]');
    ok('all again', (await page.locator('#list li.box').count()) === 8);
    await page.fill('#find', 'syrup');
    ok('find syrup', (await page.locator('#list li.box').count()) === 2);
    await page.fill('#find', 'zzzz');
    ok('find none message', await page.locator('#none-here').isVisible());
    await page.fill('#find', '');

    // ---------- 5. used up, thrown away, undo, put back, add again ----------
    await boxOf(page, 'Milk').locator('button:text-is("Used up")').click();
    ok('used up moves to archive', (await names(page, 'soon')).indexOf('Milk') < 0 && (await page.locator('#archive-sum').innerText()) === 'Used up or thrown away (1)');
    ok('next is pasta sauce', (await page.locator('#sum-body').innerText()).includes('Pasta sauce, fridge'));
    await page.click('#list-msg .undo');
    ok('undo used up', (await names(page, 'soon')).includes('Milk'));
    await boxOf(page, 'Bread').locator('button:text-is("Thrown away")').click();
    await boxOf(page, 'Milk').locator('button:text-is("Used up")').click();
    ok('stats line', (await page.locator('#sum-body').innerText()).includes('Last 30 days: 1 used up, 1 thrown away.'));
    await page.click('#archive-sum');
    ok('archive line', (await stOf(page, 'Bread')) === 'Thrown away on Sat 17 Oct');
    ok('shop button counts', (await page.locator('#shop').innerText()) === 'Copy a shopping list of what ran out (2)');
    await page.click('#shop');
    let clip = await page.evaluate(() => navigator.clipboard.readText());
    ok('shopping list copied', clip === 'Shopping list\n- Bread\n- Milk', clip);
    await boxOf(page, 'Bread').locator('button:text-is("Add again")').click();
    ok('add again prefill', (await page.inputValue('#f-name')) === 'Bread' && (await page.inputValue('#f-place')) === 'cupboard' && (await page.inputValue('#f-kind')) === 'best' && (await page.inputValue('#f-date')) === '');
    await page.click('#quick .chip:text-is("In 3 days")'); await page.click('#save');
    ok('new bread in use soon', (await names(page, 'soon')).includes('Bread'));
    ok('shopping list now only milk', (await page.locator('#shop').innerText()) === 'Copy a shopping list of what ran out (1)');
    await page.click('#cancel');
    await boxOf(page, 'Milk').locator('button:text-is("Put back")').click();
    ok('put back milk', (await names(page, 'soon')).includes('Milk'));
    // delete from archive with undo
    const archived = page.locator('#l-archive li.box');
    ok('one archived bread', (await archived.count()) === 1);
    await archived.first().locator('button:text-is("Delete")').click();
    ok('deleted from archive', (await archived.count()) === 0);
    await page.click('#list-msg .undo');
    ok('undo delete', (await page.locator('#l-archive li.box').count()) === 1);

    // ---------- 6. edit, opened, delete ----------
    await boxOf(page, 'Yoghurt').locator('button:text-is("Opened")').click();
    ok('opened button opens form with today', await page.locator('#w-open').isVisible() && (await page.inputValue('#f-opened')) === '2026-10-17' && (await page.locator('#save').innerText()) === 'Save changes');
    ok('preview after opened', (await page.locator('#preview').innerText()) === 'Use by Tue 20 Oct (in 3 days).');
    await page.selectOption('#f-opensel', '2');
    ok('preview 2 days after opening', (await page.locator('#preview').innerText()) === 'Use by Mon 19 Oct (in 2 days), 2 days after opening.');
    await page.click('#save');
    ok('yoghurt opened saved', (await stOf(page, 'Yoghurt')) === 'Use by Mon 19 Oct (in 2 days), 2 days after opening');
    await boxOf(page, 'Chicken').locator('button:text-is("Edit")').click();
    ok('edit heading', (await page.locator('#form-h').innerText()) === 'Change Chicken');
    await page.fill('#f-date', '2026-10-19'); await page.click('#save');
    ok('edit saved', (await stOf(page, 'Chicken')) === 'Use by Mon 19 Oct (in 2 days)' && (await names(page, 'soon')).includes('Chicken'));
    await page.click('#list-msg .undo');
    ok('undo edit', (await stOf(page, 'Chicken')) === 'Use by Fri 15 Jan 2027 (in 2 months)');
    await boxOf(page, 'Eye drops').locator('button:text-is("Edit")').click();
    ok('month mode restored in edit', await page.locator('#f-mode-month').isChecked() && (await page.inputValue('#f-month')) === '3' && (await page.inputValue('#f-year')) === '2027');
    await page.click('#cancel');
    ok('cancel edit keeps item', (await stOf(page, 'Eye drops')) === 'Expires end of Mar 2027 (in 5 months)');
    await boxOf(page, 'Cough syrup').locator('button:text-is("Edit")').click();
    await page.click('#del');
    ok('delete in edit', (await boxOf(page, 'Cough syrup').count()) === 0);
    await page.click('#list-msg .undo');
    ok('undo delete in edit', (await boxOf(page, 'Cough syrup').count()) === 1);

    // ---------- 7. sharing, calendar, backup ----------
    await page.click('#copy-all');
    clip = await page.evaluate(() => navigator.clipboard.readText());
    ok('copied list', clip.startsWith('Food and medicine expiry dates, Sat 17 Oct 2026\n\nExpired:\n- Paracetamol syrup, medicine box: expired on Sat 3 Oct (2 weeks ago): do not use'), clip.slice(0, 200));
    const mail = await page.getAttribute('#mail-all', 'href');
    ok('mailto with no recipient', mail.startsWith('mailto:?subject=Food%20and%20medicine%20expiry%20dates&body=') && decodeURIComponent(mail).includes('Milk (2 litres), fridge'));
    let [dl] = await Promise.all([page.waitForEvent('download'), page.click('#cal-all')]);
    let body = fs.readFileSync(await dl.path(), 'utf8');
    ok('calendar file', dl.suggestedFilename() === 'expiry-dates.ics' && body.includes('SUMMARY:Use by today: Milk (fridge)') && body.includes('SUMMARY:Expires: Eye drops (medicine box)') && !body.includes('Paracetamol'), body.slice(0, 300));
    [dl] = await Promise.all([page.waitForEvent('download'), boxOf(page, 'Milk').locator('button:text-is("Calendar")').click()]);
    ok('one item calendar', dl.suggestedFilename() === 'milk.ics');
    [dl] = await Promise.all([page.waitForEvent('download'), page.click('#backup')]);
    const backupPath = path.join(__dirname, 'screenshots', '.tmp-backup.json'); await dl.saveAs(backupPath);
    ok('backup file', dl.suggestedFilename() === 'food-and-medicine-expiry-backup-2026-10-17.json' && JSON.parse(fs.readFileSync(backupPath, 'utf8')).state.items.length === 9);
    // reload keeps everything
    await page.reload({ waitUntil: 'networkidle' });
    ok('reload keeps list', (await page.locator('#list li.box').count()) === 9 && (await page.locator('#form').isHidden()));
    // delete everything + undo
    await page.click('#wipe');
    ok('wiped', (await page.locator('#list li.box').count()) === 0 && await page.locator('#empty').isVisible());
    await page.click('#set-msg .undo');
    ok('undo wipe', (await page.locator('#list li.box').count()) === 9);
    await page.click('#wipe');
    await page.setInputFiles('#restore-file', backupPath);
    await page.waitForTimeout(300);
    ok('restore backup', (await page.locator('#list li.box').count()) === 9 && (await page.locator('#set-msg').innerText()).includes('Restored 9 items'));
    const junk = path.join(__dirname, 'screenshots', '.tmp-junk.json'); fs.writeFileSync(junk, '{"hello":1}');
    await page.setInputFiles('#restore-file', junk); await page.waitForTimeout(300);
    ok('bad backup refused', (await page.locator('#set-msg').innerText()).includes('not a backup') && (await page.locator('#list li.box').count()) === 9);
    fs.unlinkSync(junk);

    // ---------- 8. odd inputs ----------
    await page.click('#open-form');
    const long = 'Very long name pasted from a shopping app '.repeat(5);
    await page.fill('#f-name', long); await page.fill('#f-date', '2026-10-30'); await page.click('#save');
    ok('long name clipped to 80', (await page.locator('.box-name').allInnerTexts()).some(t => t.startsWith('Very long name') && t.length >= 78 && t.length <= 80));
    await page.fill('#f-name', '<img src=x onerror=alert(1)>'); await page.fill('#f-date', '2026-10-30'); await page.click('#save');
    ok('tags shown as text', (await boxOf(page, '<img src=x onerror=alert(1)>').count()) === 1 && (await page.locator('.box-name img').count()) === 0);
    await page.click('#o-open'); await page.fill('#f-name', 'Eye drops new'); await page.check('#f-mode-month'); await page.selectOption('#f-place', 'medicine');
    await page.selectOption('#f-month', '6'); await page.selectOption('#f-year', '2027'); await page.selectOption('#f-opensel', '28');
    ok('preview for opened eye drops', (await page.locator('#preview').innerText()) === 'Use by Sat 14 Nov (in 4 weeks), 28 days after opening.');
    await page.click('#save');
    ok('kept month mode for the next', await page.locator('#f-mode-month').isChecked());
    await page.click('#cancel');
    // the next day: the lines change by themselves
    await page.clock.setFixedTime(new Date('2026-10-18T10:00:00+05:00'));
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    ok('next day milk', (await stOf(page, 'Milk')) === 'Use by today, Sun 18 Oct', await stOf(page, 'Milk'));
    await page.clock.setFixedTime(new Date('2026-10-19T10:00:00+05:00'));
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    ok('two days on: milk expired', (await stOf(page, 'Milk')) === 'Use by date passed on Sun 18 Oct (yesterday): do not eat' && (await names(page, 'expired')).includes('Milk'));
    await ctx.close();

    // ---------- 9. corrupt and blocked storage ----------
    ({ ctx, page } = await newPage({}, `try { localStorage.setItem('${KEY}', '{bad json'); } catch (e) {}`));
    ok('corrupt start fresh', await page.locator('#empty').isVisible() && (await page.locator('#set-msg').innerText()).includes('could not be read'));
    await ctx.close();
    ({ ctx, page } = await newPage({}, `Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } });`));
    ok('blocked storage warning', await page.locator('#storage-warn').isVisible());
    await add(page, AYESHA[0]);
    ok('still works without storage', (await page.locator('#list li.box').count()) === 1);
    await ctx.close();
    const errsBefore = errors.length;

    // ---------- 10. help, theme and layout at many widths ----------
    for (const w of [320, 390, 820, 1280]) {
        ({ ctx, page } = await newPage({ viewport: { width: w, height: 800 } }));
        const help = page.locator('button', { hasText: /^Help$/ }).first();
        ok('help button at ' + w, await help.isVisible());
        await help.click();
        const dlg = page.locator('dialog[open]');
        await dlg.waitFor();
        const r = await dlg.boundingBox();
        ok('help inside screen at ' + w, r.x >= 0 && r.x + r.width <= w + 1 && r.y >= 0, r);
        ok('help title at ' + w, (await dlg.innerText()).includes('How to use Food and Medicine Expiry Tracker'));
        await page.keyboard.press('Escape');
        ok('escape closes help at ' + w, (await page.locator('dialog[open]').count()) === 0);
        await help.click(); await page.locator('dialog[open] button', { hasText: 'Got it' }).click();
        ok('Got it closes help at ' + w, (await page.locator('dialog[open]').count()) === 0);
        const tb = await page.evaluate(() => [...document.querySelectorAll('.topbar a, .topbar button')].map(e => { const b = e.getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom]; }));
        let lap = false; for (let i = 0; i < tb.length; i++) for (let j = i + 1; j < tb.length; j++) { const a = tb[i], b = tb[j]; if (a[0] < b[2] - 1 && b[0] < a[2] - 1 && a[1] < b[3] - 1 && b[1] < a[3] - 1) lap = true; }
        ok('top bar buttons do not overlap at ' + w, !lap, tb);
        await ctx.close();
    }
    // theme switch
    ({ ctx, page } = await newPage());
    const tgl = page.locator('.theme-toggle');
    ok('theme switch exists', await tgl.isVisible());
    const bg1 = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await tgl.click();
    const bg2 = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    ok('theme switch changes the look', bg1 !== bg2 && (await page.evaluate(() => document.documentElement.dataset.theme)) === 'light');
    await ctx.close();

    const overlapCheck = async (page, sel) => page.evaluate(sel => {
        const els = [...document.querySelectorAll(sel)].filter(e => e.offsetParent !== null && e.getClientRects().length);
        const bad = [];
        for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
            const a = els[i].getBoundingClientRect(), b = els[j].getBoundingClientRect();
            if (els[i].contains(els[j]) || els[j].contains(els[i])) continue;
            if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) bad.push((els[i].id || els[i].textContent.slice(0, 20)) + ' / ' + (els[j].id || els[j].textContent.slice(0, 20)));
        }
        return bad;
    }, sel);
    for (const w of [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920]) for (const scheme of ['dark', 'light']) {
        ({ ctx, page } = await newPage({ viewport: { width: w, height: 900 }, colorScheme: scheme }));
        await fill(page);
        await boxOf(page, 'Bread').locator('button:text-is("Thrown away")').click();
        await page.click('#archive-sum');
        // reveal every optional field
        await page.click('#o-open'); await page.selectOption('#f-opensel', 'custom'); await page.click('#o-more'); await page.check('#f-mode-month'); await page.check('#f-mode-day');
        await page.click('#save');   // shows every error message too
        const sw = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
        ok('no sideways scroll at ' + w + ' ' + scheme, sw[0] <= sw[1], sw);
        const stick = await page.evaluate(() => [...document.querySelectorAll('main *')].filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.right > document.documentElement.clientWidth + 1 || r.left < -1); }).map(e => e.id || e.className).slice(0, 5));
        ok('nothing sticks out at ' + w + ' ' + scheme, !stick.length, stick);
        if (w <= 390) {
            const bad = await overlapCheck(page, 'main input:not([type=radio]), main select, main button, main textarea, main a.secondary, .seg label');
            ok('no overlapping controls at ' + w + ' ' + scheme, !bad.length, bad);
            const ph = await page.evaluate(() => [...document.querySelectorAll('main input[placeholder], main textarea[placeholder]')].filter(e => e.offsetParent).map(e => { const c = document.createElement('canvas').getContext('2d'); const s = getComputedStyle(e); c.font = s.fontSize + ' ' + s.fontFamily; return [e.id, c.measureText(e.placeholder).width, e.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight)]; }).filter(x => x[1] > x[2]));
            ok('placeholders fit at ' + w + ' ' + scheme, !ph.length, ph);
        }
        if (w >= 900) {
            for (const pos of ['top', 'middle', 'bottom']) {
                await page.evaluate(p => window.scrollTo(0, p === 'top' ? 0 : p === 'middle' ? document.body.scrollHeight / 2 : document.body.scrollHeight), pos);
                const bad = await page.evaluate(() => {
                    const out = [];
                    const kids = [...document.querySelectorAll('main > *, .col-main > *, .col-side > *')].filter(e => e.offsetParent !== null);
                    for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
                        if (kids[i].contains(kids[j]) || kids[j].contains(kids[i])) continue;
                        const a = kids[i].getBoundingClientRect(), b = kids[j].getBoundingClientRect();
                        if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) out.push((kids[i].id || kids[i].className) + '/' + (kids[j].id || kids[j].className));
                    }
                    return out;
                });
                ok('no overlapping blocks at ' + w + ' ' + scheme + ' ' + pos, !bad.length, bad);
            }
            const cols = await page.evaluate(() => [document.querySelector('.col-main').getBoundingClientRect().left, document.querySelector('.col-side').getBoundingClientRect().left]);
            ok('two columns on desktop at ' + w, cols[1] > cols[0] + 300, cols);
        }
        // the cleared state too
        await page.click('#wipe');
        const sw2 = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
        ok('no sideways scroll when empty at ' + w + ' ' + scheme, sw2[0] <= sw2[1], sw2);
        await ctx.close();
    }

    // ---------- 11. files ----------
    ['favicon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'manifest.webmanifest', 'sw.js', 'screenshots/desktop.png', 'screenshots/phone.png'].forEach(f => {
        if (!SHOTS) ok('file ' + f, [...requested].some(u => u.endsWith('/' + SLUG + '/' + f)) || fs.existsSync(path.join(__dirname, f)));
    });
    ['help.js', 'theme.js'].forEach(f => ok('page loads ../' + f, [...requested].some(u => u.endsWith('/apps/' + f))));
    ok('no console errors', errors.length === 0, errors);
    ok('no failed requests', failed.length === 0, failed);

    // ---------- screenshots ----------
    if (SHOTS) {
        for (const [name, vp] of [['desktop', { width: 1280, height: 1240 }], ['phone', { width: 390, height: 844, deviceScaleFactor: 2 }]]) {
            ({ ctx, page } = await newPage({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.deviceScaleFactor || 1 }));
            await fill(page);
            await page.click('#cancel');
            await page.evaluate(() => { document.querySelectorAll('.msg').forEach(m => { m.textContent = ''; m.classList.remove('show'); }); window.scrollTo(0, 0); });
            await page.screenshot({ path: path.join(__dirname, 'screenshots', name + '.png'), fullPage: name === 'desktop' ? false : false });
            await ctx.close();
        }
        console.log('saved screenshots');
    }
    try { fs.unlinkSync(backupPath); } catch (e) {}
    await browser.close(); if (srv) srv.close();
    console.log(pass + ' passed, ' + fail + ' failed');
    process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
