// Full page test with Playwright. Run from the repo root or this folder: node ui-test.js
//   BASE=https://umar8092.github.io/apps node ui-test.js   tests the live site
//   node ui-test.js --shots                                 also saves screenshots/desktop.png and phone.png
// "Today" is fixed to Thu 22 Oct 2026 in Pakistan time so every answer can be checked exactly.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), SLUG = 'leave-balance-tracker-for-employees', KEY = SLUG + '.state';
const SHOTS = process.argv.includes('--shots');
const NOW = new Date('2026-10-22T10:00:00+05:00');
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
    const card = (page, name) => page.locator('#bal-list .tbal').filter({ has: page.locator('h3', { hasText: new RegExp('^' + name + '$') }) });
    const big = (page, name) => card(page, name).locator('.big').innerText();
    const facts = (page, name) => card(page, name).locator('.facts li').allInnerTexts();
    const tbox = (page, i) => page.locator('#types-list .tbox').nth(i);
    async function addLeave(page, type, from, to, opts) {
        opts = opts || {};
        await page.check('input[name=kind][value=leave]');
        await page.selectOption('#f-type', { label: type });
        await page.fill('#f-from', from); await page.locator('#f-from').dispatchEvent('change');
        if (to) { await page.fill('#f-to', to); await page.locator('#f-to').dispatchEvent('change'); }
        if (opts.half) await page.check('#f-half');
        if (opts.halfFirst) await page.check('#f-half-first');
        if (opts.halfLast) await page.check('#f-half-last');
        if (opts.custom) { await page.click('#o-custom'); await page.fill('#f-custom', opts.custom); }
        if (opts.note) { await page.click('#o-note'); await page.fill('#f-note', opts.note); }
        await page.click('#f-save');
    }
    async function addHoliday(page, d, name) { await page.fill('#h-date', d); if (name) await page.fill('#h-name', name); await page.click('#h-add'); }
    // Ayesha's year: 20 annual (3 carried in, use within 3 months, up to 5 carry over), 8 casual, 10 sick
    async function ayesha(page) {
        await addHoliday(page, '2026-02-05', 'Kashmir Day');
        await addHoliday(page, '2026-12-25', 'Christmas');
        const a = tbox(page, 0);
        await a.locator('button', { hasText: '+ Days carried over from last year' }).click();
        await a.locator('[id$="-opening"]').fill('3');
        await a.locator('button', { hasText: '+ Carried-over days must be used within' }).click();
        await addLeave(page, 'Annual leave', '2026-02-02', '2026-02-06');
        await addLeave(page, 'Annual leave', '2026-04-06', '2026-04-10');
        await addLeave(page, 'Annual leave', '2026-07-15', null, { half: true });
        await addLeave(page, 'Casual leave', '2026-03-10');
        await addLeave(page, 'Casual leave', '2026-06-18');
        await addLeave(page, 'Casual leave', '2026-09-14', null, { half: true });
        await addLeave(page, 'Sick leave', '2026-05-11', '2026-05-12');
        await addLeave(page, 'Annual leave', '2026-12-21', '2027-01-01', { note: 'Family wedding' });
        await page.check('input[name=kind][value=adj]');
        await page.selectOption('#a-type', { label: 'Annual leave' });
        await page.fill('#a-amount', '1'); await page.fill('#a-date', '2026-10-01'); await page.fill('#a-note', 'Day in lieu for working on Eid');
        await page.click('#a-save');
        await page.click('#y-now').catch(() => {});
        await page.check('input[name=kind][value=leave]');
    }

    // ---------- first use ----------
    {
        const { ctx, page } = await newPage();
        ok('first use: year', (await txt(page, '#y-name')) === 'Leave year 2026 (now)' && (await txt(page, '#y-dates')) === '1 Jan 2026 to 31 Dec 2026', await txt(page, '#y-name'));
        ok('first use: annual 20 left', (await big(page, 'Annual leave')) === '20 days left', await big(page, 'Annual leave'));
        ok('first use: annual words', JSON.stringify(await facts(page, 'Annual leave')) === JSON.stringify(['Allowance 20. Taken 0, booked 0.', 'Book 15 days more by 31 Dec 2026 or lose them (only 5 days can be carried over).']), await facts(page, 'Annual leave'));
        ok('first use: casual, sick, unpaid', (await big(page, 'Casual leave')) === '8 days left' && (await big(page, 'Sick leave')) === '10 days left' && (await big(page, 'Unpaid leave')) === '0 days this leave year');
        ok('first use: empty list', (await txt(page, '#list-body')) === 'No leave in this leave year yet.');
        ok('first use: optional fields hidden', !(await page.locator('#w-custom').isVisible()) && !(await page.locator('#w-note').isVisible()) && !(await page.locator('#w-joined').isVisible()) && await page.locator('#o-joined').isVisible());
        ok('first use: no preview yet', !(await page.locator('#preview').isVisible()));
        ok('first use: no holidays', (await txt(page, '#hols')) === 'No public holidays added.');
        ok('first use: unpaid not in correction list', !(await page.locator('#a-type option', { hasText: 'Unpaid' }).count()));
        // saving without a date
        await page.click('#f-save');
        ok('blank date error', (await txt(page, '#e-from')) === 'Choose the first day of the leave.' && (await page.locator('#f-from').getAttribute('aria-invalid')) === 'true');
        await ctx.close();
    }

    // ---------- Ayesha's year: the main situation ----------
    {
        const { ctx, page } = await newPage({ viewport: { width: 1280, height: 900 } });
        await ayesha(page);
        ok('Ayesha: annual 6.5 left', (await big(page, 'Annual leave')) === '6.5 days left', await big(page, 'Annual leave'));
        ok('Ayesha: annual lines', JSON.stringify(await facts(page, 'Annual leave')) === JSON.stringify(['Allowance 20, carried over 3, HR added 1. Taken 9.5, booked 8.', 'Book 1.5 days more by 31 Dec 2026 or lose them (only 5 days can be carried over).']), await facts(page, 'Annual leave'));
        ok('Ayesha: amber warning', (await card(page, 'Annual leave').getAttribute('class')).includes('lv-lose'));
        ok('Ayesha: sick leave is not nagged', JSON.stringify(await facts(page, 'Sick leave')) === JSON.stringify(['Allowance 10. Taken 2, booked 0.', 'Unused days are not carried over after 31 Dec 2026.']) && (await card(page, 'Sick leave').getAttribute('class')).includes('lv-ok'), await facts(page, 'Sick leave'));
        ok('Ayesha: casual 5.5, sick 8', (await big(page, 'Casual leave')) === '5.5 days left' && (await big(page, 'Sick leave')) === '8 days left');
        ok('Ayesha: list count', (await txt(page, '#list-h')) === 'Leave in this leave year (9)', await txt(page, '#list-h'));
        const first = page.locator('#list-body .item').first();
        ok('Ayesha: wedding leave first, split over the year end', (await first.innerText()).includes('Mon 21 Dec to Fri 1 Jan 2027') && (await first.innerText()).includes('9 days (8 in this leave year)') && (await first.innerText()).includes('Booked') && (await first.innerText()).includes('Family wedding'), await first.innerText());
        ok('Ayesha: correction listed', (await txt(page, '#list-body')).includes('+1 day') && (await txt(page, '#list-body')).includes('Day in lieu for working on Eid'));
        // the question: can I take 16 to 20 November?
        await page.fill('#f-from', '2026-11-16'); await page.locator('#f-from').dispatchEvent('change');
        await page.fill('#f-to', '2026-11-20'); await page.locator('#f-to').dispatchEvent('change');
        ok('preview: Nov week', (await txt(page, '#preview')) === 'Takes 5 days of annual leave. Left after this: 1.5 days.', await txt(page, '#preview'));
        await page.fill('#f-to', '2026-11-23'); await page.locator('#f-to').dispatchEvent('change');
        ok('preview: weekend not counted', (await txt(page, '#preview')) === 'Takes 6 days of annual leave. Not counted: 2 days off (not working days). Left after this: 0.5 days.', await txt(page, '#preview'));
        await page.fill('#f-to', '2026-12-04'); await page.locator('#f-to').dispatchEvent('change');
        ok('preview: over the allowance', (await txt(page, '#preview')).includes('Left after this: 8.5 days over your allowance.'), await txt(page, '#preview'));
        await page.fill('#f-to', '2026-11-20'); await page.locator('#f-to').dispatchEvent('change');
        if (SHOTS) await page.screenshot({ path: path.join(__dirname, 'screenshots', 'desktop.png'), fullPage: false });
        // next year
        await page.click('#y-next');
        ok('2027: carried 5, 1 Jan booked', (await txt(page, '#y-name')) === 'Leave year 2027 (next)' && (await big(page, 'Annual leave')) === '24 days left' && (await facts(page, 'Annual leave'))[0] === 'Allowance 20, carried over 5. Taken 0, booked 1.', await facts(page, 'Annual leave'));
        await page.click('#y-now');
        ok('back to this year', (await txt(page, '#y-name')) === 'Leave year 2026 (now)');
        // reload keeps everything
        await page.reload({ waitUntil: 'networkidle' });
        ok('reload: same balance', (await big(page, 'Annual leave')) === '6.5 days left' && (await txt(page, '#hols')).includes('Kashmir Day'));
        // copy, email, CSV, print, backup
        await page.click('#copy');
        const clip = await page.evaluate(() => navigator.clipboard.readText());
        ok('copy summary', clip.startsWith('Leave year 2026 (1 Jan 2026 to 31 Dec 2026), on 22 Oct 2026:') && clip.includes('Annual leave: 6.5 days left.') && clip.includes('- Annual leave: Mon 21 Dec to Fri 1 Jan 2027 (9 days) Family wedding'), clip);
        const href = await page.locator('#mail').getAttribute('href');
        ok('email link with no recipient', href.startsWith('mailto:?subject=My%20leave%20balance&body=Leave%20year%202026'), href.slice(0, 80));
        const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#csv')]);
        const csv = fs.readFileSync(await dl.path(), 'utf8');
        ok('CSV', dl.suggestedFilename() === 'leave-2026-10-22.csv' && csv.split('\r\n').length === 11 && csv.includes('HR correction,Annual leave,2026-10-01,2026-10-01,1,,2026,Day in lieu for working on Eid'), csv);
        const [bk] = await Promise.all([page.waitForEvent('download'), page.click('#backup')]);
        const backup = fs.readFileSync(await bk.path(), 'utf8');
        ok('backup file', JSON.parse(backup).entries.length === 8);
        // delete everything, undo
        await page.click('#wipe');
        ok('delete everything', (await big(page, 'Annual leave')) === '20 days left' && (await txt(page, '#list-body')) === 'No leave in this leave year yet.');
        await page.click('#set-msg .undo');
        ok('undo delete everything', (await big(page, 'Annual leave')) === '6.5 days left');
        // restore the backup into an empty app, and a bad file
        await page.click('#wipe');
        const bf = path.join(__dirname, '.tmp-backup.json'); fs.writeFileSync(bf, backup);
        await page.setInputFiles('#restore-file', bf);
        await page.waitForFunction(() => document.getElementById('set-msg').textContent.startsWith('Restored'));
        ok('restore', (await big(page, 'Annual leave')) === '6.5 days left' && (await txt(page, '#set-msg')).startsWith('Restored 4 leave types and 8 leaves.'), await txt(page, '#set-msg'));
        fs.writeFileSync(bf, '{"nope":'); await page.setInputFiles('#restore-file', bf);
        await page.waitForFunction(() => document.getElementById('set-msg').textContent.startsWith('That file'));
        ok('bad restore file changes nothing', (await big(page, 'Annual leave')) === '6.5 days left');
        fs.unlinkSync(bf);
        await ctx.close();
    }

    // ---------- editing, deleting, mistakes ----------
    {
        const { ctx, page } = await newPage();
        await ayesha(page);
        // edit the sick leave to one day
        const sick = page.locator('#list-body .item').filter({ hasText: 'Sick leave' });
        await sick.locator('button', { hasText: 'Edit' }).click();
        ok('edit: form loaded', (await txt(page, '#add-h')) === 'Change leave' && (await page.inputValue('#f-from')) === '2026-05-11' && (await txt(page, '#f-save')) === 'Save changes' && await page.locator('#f-cancel').isVisible());
        ok('edit: preview does not clash with itself', (await txt(page, '#preview')).startsWith('Takes 2 days of sick leave.'), await txt(page, '#preview'));
        await page.fill('#f-to', '2026-05-11'); await page.locator('#f-to').dispatchEvent('change');
        await page.click('#f-save');
        ok('edit: saved', (await big(page, 'Sick leave')) === '9 days left' && (await txt(page, '#add-msg')).startsWith('Saved: Sick leave, Mon 11 May') && (await txt(page, '#add-h')) === 'Add leave');
        await page.click('#add-msg .undo');
        ok('edit: undo', (await big(page, 'Sick leave')) === '8 days left');
        // cancel an edit
        await page.locator('#list-body .item').filter({ hasText: 'Sick leave' }).locator('button', { hasText: 'Edit' }).click();
        await page.click('#f-cancel');
        ok('edit: cancel clears the form', (await page.inputValue('#f-from')) === '' && (await txt(page, '#add-h')) === 'Add leave' && (await big(page, 'Sick leave')) === '8 days left');
        // delete with undo
        await page.locator('#list-body .item').filter({ hasText: 'Sick leave' }).locator('button', { hasText: 'Delete' }).click();
        ok('delete leave', (await big(page, 'Sick leave')) === '10 days left' && (await txt(page, '#list-msg')).startsWith('Deleted Sick leave, Mon 11 May to Tue 12 May.'), await txt(page, '#list-msg'));
        await page.click('#list-msg .undo');
        ok('delete leave undo', (await big(page, 'Sick leave')) === '8 days left');
        // edit the HR correction to take away 2
        await page.locator('#list-body .item').filter({ hasText: 'HR correction' }).locator('button', { hasText: 'Edit' }).click();
        ok('edit correction: loaded', (await page.inputValue('#a-amount')) === '1' && await page.locator('#adj-form').isVisible() && (await txt(page, '#a-save')) === 'Save changes');
        await page.check('input[name=sign][value="-1"]'); await page.fill('#a-amount', '2'); await page.click('#a-save');
        ok('edit correction: saved', (await big(page, 'Annual leave')) === '3.5 days left' && (await txt(page, '#list-body')).includes('-2 days'), await big(page, 'Annual leave'));
        // correction mistakes
        await page.fill('#a-amount', ''); await page.click('#a-save');
        ok('correction blank', (await txt(page, '#e-amount')) === 'Type a number of days, for example 1 or 0.5.');
        await page.fill('#a-amount', '0'); await page.click('#a-save');
        ok('correction zero', (await txt(page, '#e-amount')) === 'Type more than 0 days.');
        await page.fill('#a-amount', '-3'); await page.click('#a-save');
        ok('correction negative typed', (await txt(page, '#e-amount')) === 'Type a number of days, for example 1 or 0.5.');
        await page.check('input[name=kind][value=leave]');
        // a Saturday, a clash, a backwards range, a custom count
        await addLeave(page, 'Annual leave', '2026-10-24');
        ok('Saturday refused', (await txt(page, '#e-from')).startsWith('Sat 24 Oct is not one of your working days, so it takes no leave.'), await txt(page, '#e-from'));
        ok('Saturday preview says why', (await txt(page, '#preview')).startsWith('Sat 24 Oct is not one'));
        await page.click('#o-custom'); await page.fill('#f-custom', '1'); await page.click('#f-save');
        ok('Saturday with a custom count', (await txt(page, '#add-msg')).startsWith('Added: Annual leave, Sat 24 Oct (1 day).') && (await big(page, 'Annual leave')) === '2.5 days left', await txt(page, '#add-msg'));
        ok('custom field closes after adding', !(await page.locator('#w-custom').isVisible()) && await page.locator('#o-custom').isVisible());
        await addLeave(page, 'Sick leave', '2026-12-22', '2026-12-23');
        ok('clash refused', (await txt(page, '#e-from')) === 'You already have annual leave on Tue 22 Dec. Change or delete that leave first.', await txt(page, '#e-from'));
        await page.fill('#f-from', '2026-11-10'); await page.locator('#f-from').dispatchEvent('change');
        await page.fill('#f-to', '2026-11-09'); await page.locator('#f-to').dispatchEvent('change');
        await page.click('#f-save');
        ok('backwards range refused', (await txt(page, '#e-to')) === 'The last day is before the first day.');
        await page.fill('#f-from', '2026-11-12'); await page.locator('#f-from').dispatchEvent('change');
        ok('first day after last day moves the last day', (await page.inputValue('#f-to')) === '2026-11-12' && await page.locator('#half-one').isVisible() && !(await page.locator('#half-two').isVisible()));
        // half days on a range
        await addLeave(page, 'Casual leave', '2026-11-25', '2026-11-27', { halfFirst: true, halfLast: true });
        ok('first and last half', (await txt(page, '#add-msg')).startsWith('Added: Casual leave, Wed 25 Nov to Fri 27 Nov, first day half, last day half (2 days).'), await txt(page, '#add-msg'));
        // two half days on one day are fine
        await addLeave(page, 'Annual leave', '2026-07-15', null, { half: true });
        ok('two half days on one day', (await txt(page, '#add-msg')).startsWith('Added: Annual leave, Wed 15 Jul, half day (0.5 days).'), await txt(page, '#add-msg'));
        // public holiday added on a leave day lowers that leave
        await addHoliday(page, '2026-12-24', 'Office closed');
        ok('holiday inside leave', (await txt(page, '#pat-msg')).includes('It is no longer taken off your leave that day.') && (await txt(page, '#list-body')).includes('8 days (7 in this leave year)'), await txt(page, '#pat-msg'));
        await addHoliday(page, '2026-12-24');
        ok('duplicate holiday refused', (await txt(page, '#e-hol')) === 'Thu 24 Dec is already a public holiday.');
        await page.locator('#hols li').filter({ hasText: 'Office closed' }).locator('button').click();
        ok('remove holiday', !(await txt(page, '#hols')).includes('Office closed') && (await txt(page, '#list-body')).includes('9 days (8 in this leave year)'));
        await ctx.close();
    }

    // ---------- leave types, work pattern ----------
    {
        const { ctx, page } = await newPage();
        const a = tbox(page, 0);
        // allowance typing: decimals with a comma, nonsense, huge
        await a.locator('[id$="-allow"]').fill('22,5');
        ok('allowance 22,5', (await big(page, 'Annual leave')) === '22.5 days left');
        await a.locator('[id$="-allow"]').fill('abc');
        ok('allowance nonsense not saved', (await big(page, 'Annual leave')) === '22.5 days left' && (await a.locator('[id$="-allow-e"]').innerText()) === 'Type the days you get each leave year, for example 20.');
        await a.locator('[id$="-allow"]').fill('400');
        ok('allowance huge', (await a.locator('[id$="-allow-e"]').innerText()) === 'Type at most 366 days.');
        await a.locator('.chip', { hasText: '25' }).click();
        ok('allowance chip 25', (await big(page, 'Annual leave')) === '25 days left' && (await a.locator('[id$="-allow-e"]').innerText()) === '');
        // built up each month
        await a.locator('[id$="-mode"]').selectOption('month');
        ok('month mode', (await facts(page, 'Annual leave')).includes('Built up so far: 18.75 of 25 (9 of 12 months).') && (await facts(page, 'Annual leave')).includes('You can take 18.75 days now.'), await facts(page, 'Annual leave'));
        ok('month mode label', (await a.locator('label[id$="-allow-l"]').innerText()) === 'Days each leave year (built up over 12 months)');
        // carry all, nothing
        await a.locator('[id$="-carry"]').selectOption('all');
        ok('carry all: cap hidden', !(await a.locator('[id$="-cap"]').isVisible()) && (await facts(page, 'Annual leave')).includes('25 days will be carried over to the next leave year.'), await facts(page, 'Annual leave'));
        await a.locator('[id$="-carry"]').selectOption('none');
        ok('carry none: expiry hidden', !(await a.locator('button', { hasText: '+ Carried-over days must be used within' }).isVisible()));
        // no limit hides the numbers
        await a.locator('[id$="-mode"]').selectOption('none');
        ok('no limit', !(await a.locator('[id$="-allow"]').isVisible()) && (await big(page, 'Annual leave')) === '0 days this leave year');
        await a.locator('[id$="-mode"]').selectOption('year');
        // the warning about losing days can be switched on and off
        const cs = tbox(page, 1);
        ok('casual: warning off by default', !(await cs.locator('[id$="-warn"]').isChecked()) && (await facts(page, 'Casual leave'))[1] === 'Unused days are not carried over after 31 Dec 2026.');
        await cs.locator('[id$="-warn"]').check();
        ok('casual: warning on', (await facts(page, 'Casual leave'))[1] === 'Book 8 days more by 31 Dec 2026 or lose them (nothing is carried over).' && (await card(page, 'Casual leave').getAttribute('class')).includes('lv-lose'), await facts(page, 'Casual leave'));
        await page.reload({ waitUntil: 'networkidle' });
        ok('casual: warning kept after reload', await tbox(page, 1).locator('[id$="-warn"]').isChecked());
        await tbox(page, 1).locator('[id$="-warn"]').uncheck();
        // names
        await a.locator('[id$="-name"]').fill('casual leave');
        ok('duplicate name refused', (await a.locator('[id$="-name-e"]').innerText()) === 'You already have a leave called casual leave.');
        await a.locator('[id$="-name"]').fill('');
        ok('blank name refused', (await a.locator('[id$="-name-e"]').innerText()) === 'Give this leave a name, for example Annual leave.');
        await a.locator('[id$="-name"]').fill('Earned leave');
        ok('rename', (await page.locator('#bal-list .tbal h3').first().innerText()) === 'Earned leave' && (await page.locator('#f-type option').first().innerText()) === 'Earned leave');
        // add and delete a type
        await page.click('#type-add');
        ok('add type', (await page.locator('#types-list .tbox').count()) === 5 && (await big(page, 'Other leave')) === '0 days left');
        const nb = tbox(page, 4);
        await nb.locator('[id$="-name"]').fill('Hajj leave'); await nb.locator('[id$="-allow"]').fill('30');
        ok('new type set', (await big(page, 'Hajj leave')) === '30 days left');
        await addLeave(page, 'Hajj leave', '2026-11-02', '2026-11-06');
        await tbox(page, 4).locator('button', { hasText: 'Delete this leave type' }).click();
        ok('delete type with its leave', (await page.locator('#types-list .tbox').count()) === 4 && (await txt(page, '#types-msg')).startsWith('Deleted Hajj leave and its 1 leave.') && (await txt(page, '#list-body')) === 'No leave in this leave year yet.', await txt(page, '#types-msg'));
        await page.click('#types-msg .undo');
        ok('undo delete type', (await page.locator('#types-list .tbox').count()) === 5 && (await txt(page, '#list-body')).includes('Hajj leave'));
        // working days: Sun to Thu, and at least one
        const wd = d => page.locator('#wd label').filter({ hasText: d }).locator('input');
        await wd('Fri').uncheck(); await wd('Sun').check();
        ok('Sun to Thu', (await txt(page, '#pat-msg')).startsWith('Working days: Sun to Thu.') && (await txt(page, '#list-body')).includes('4 days'), await txt(page, '#list-body'));
        for (const d of ['Sun', 'Mon', 'Tue', 'Wed']) await wd(d).uncheck();
        await wd('Thu').click();
        ok('keep one working day', (await txt(page, '#e-wd')) === 'Keep at least one working day.' && await wd('Thu').isChecked());
        // leave year from July
        await page.selectOption('#p-sm', '7');
        ok('July leave year', (await txt(page, '#y-name')) === 'Leave year 2026/27 (now)' && (await txt(page, '#y-dates')) === '1 Jul 2026 to 30 Jun 2027' && (await txt(page, '#pat-msg')).startsWith('Your leave year now runs 1 Jul 2026 to 30 Jun 2027.'), await txt(page, '#y-name'));
        await page.selectOption('#p-sm', '1');
        // joining date: 1 Aug 2026
        await page.click('#o-joined'); await page.fill('#p-joined', '2026-08-01'); await page.locator('#p-joined').dispatchEvent('change');
        ok('joined 1 Aug', (await big(page, 'Casual leave')) === '3.5 days left' && (await facts(page, 'Casual leave'))[1] === 'Part year from joining on 1 Aug 2026: 8 x 153/365 days = 3.35, rounded to 3.5.', await facts(page, 'Casual leave'));
        await page.click('#joined-clear');
        ok('joining date removed', (await big(page, 'Casual leave')) === '8 days left' && await page.locator('#o-joined').isVisible());
        await ctx.close();
    }

    // ---------- corrupt saved data, blocked storage ----------
    {
        const { ctx, page } = await newPage({}, `try { if (!sessionStorage.getItem('x')) { localStorage.setItem('${KEY}', '{"types":[{"id":1}],'); sessionStorage.setItem('x', '1'); } } catch (e) {}`);
        ok('corrupt state starts fresh', (await big(page, 'Annual leave')) === '20 days left' && (await txt(page, '#set-msg')).startsWith('Your saved leave could not be read'), await txt(page, '#set-msg'));
        await ctx.close();
        const b = await newPage({}, `Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } });`);
        ok('blocked storage warns', await b.page.locator('#storage-warn').isVisible() && (await big(b.page, 'Annual leave')) === '20 days left');
        await b.ctx.close();
    }

    // ---------- light/dark switch ----------
    {
        const { ctx, page } = await newPage();
        const t = page.locator('.theme-toggle');
        ok('theme switch present', await t.count() === 1);
        const before = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
        await t.click();
        const after = await page.evaluate(() => [document.documentElement.dataset.theme, getComputedStyle(document.body).backgroundColor]);
        ok('theme switch changes the look', after[0] === 'light' && after[1] !== before, after);
        await ctx.close();
    }

    // ---------- every screen size, filled and empty; overlaps; placeholders ----------
    for (const scheme of ['dark', 'light']) {
        const { ctx, page } = await newPage({ colorScheme: scheme });
        await ayesha(page);
        await page.fill('#f-from', '2026-11-16'); await page.locator('#f-from').dispatchEvent('change');
        await page.click('#o-custom'); await page.click('#o-note'); await page.click('#o-joined');
        for (const b of await page.locator('#types-list button.link').all()) if (await b.isVisible()) await b.click();
        for (const w of [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920]) {
            await page.setViewportSize({ width: w, height: 900 });
            for (const mode of ['leave', 'adj']) {
                await page.check('input[name=kind][value=' + mode + ']');
                const r = await page.evaluate(() => {
                    const out = [], W = innerWidth;
                    if (document.documentElement.scrollWidth > W + 1) out.push('hscroll ' + document.documentElement.scrollWidth);
                    document.querySelectorAll('main *').forEach(e => { const b = e.getBoundingClientRect(); if (b.width && (b.right > W + 1 || b.left < -1) && getComputedStyle(e).position !== 'absolute') out.push('out ' + e.tagName + '.' + e.className + '#' + e.id); });
                    const k = [...document.querySelectorAll('main input:not([type=checkbox]):not([type=radio]), main select, main button')].filter(e => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0; });
                    for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { const a = k[i].getBoundingClientRect(), b = k[j].getBoundingClientRect(); if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2) out.push('overlap ' + (k[i].id || k[i].className) + ' / ' + (k[j].id || k[j].className)); }
                    // every placeholder fits its box
                    const cv = document.createElement('canvas').getContext('2d');
                    document.querySelectorAll('main input[placeholder]').forEach(i => { const b = i.getBoundingClientRect(); if (!b.width) return; const cs = getComputedStyle(i); cv.font = cs.fontSize + ' ' + cs.fontFamily; const need = cv.measureText(i.placeholder).width + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight); if (need > i.clientWidth + 1) out.push('placeholder cut ' + i.id + ' ' + Math.round(need) + '>' + i.clientWidth); });
                    document.querySelectorAll('main select').forEach(sl => { const b = sl.getBoundingClientRect(); if (!b.width || !sl.options.length) return; const cs = getComputedStyle(sl); cv.font = cs.fontSize + ' ' + cs.fontFamily; const longest = Math.max(...[...sl.options].map(o => cv.measureText(o.text).width)); if (longest + parseFloat(cs.paddingLeft) + 28 > sl.clientWidth) out.push('select text cut ' + sl.id + ' ' + Math.round(longest)); });
                    return out.slice(0, 6);
                });
                ok(scheme + ' ' + w + 'px ' + mode + ': fits, no overlaps', !r.length, r);
            }
            for (const pos of [0, 0.5, 1]) {
                await page.evaluate(p => scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * p), pos);
                const o = await page.evaluate(() => { const bad = []; document.querySelectorAll('main, .col-main, .col-side').forEach(h => { const k = [...h.children].filter(c => c.getBoundingClientRect().height > 4 && getComputedStyle(c).display !== 'none'); for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { const a = k[i].getBoundingClientRect(), b = k[j].getBoundingClientRect(); if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 4 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 4) bad.push(k[i].className + ' / ' + k[j].className); } }); return bad; });
                ok(scheme + ' ' + w + 'px scroll ' + pos + ': no block overlap', !o.length, o);
            }
            if (w >= 900) {
                const cols = await page.evaluate(() => [document.querySelector('.col-main').getBoundingClientRect(), document.querySelector('.col-side').getBoundingClientRect()].map(r => Math.round(r.left)));
                ok(scheme + ' ' + w + 'px: two columns on desktop', cols[1] > cols[0] + 300, cols);
            }
        }
        // cleared state too
        await page.click('#wipe');
        for (const w of [320, 390, 1280]) { await page.setViewportSize({ width: w, height: 900 }); ok(scheme + ' ' + w + 'px cleared: no scroll', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); }
        await ctx.close();
    }

    // ---------- Help ----------
    {
        const { ctx, page } = await newPage();
        for (const w of [320, 390, 820, 1280]) {
            await page.setViewportSize({ width: w, height: 800 });
            await page.click('.help-btn');
            const d = page.locator('dialog.help'), r = await d.boundingBox();
            ok('help ' + w + ': on screen with title', r.x >= 0 && r.x + r.width <= w && r.y >= 0 && (await d.locator('h2').innerText()) === 'How to use Leave Balance Tracker');
            await page.keyboard.press('Escape'); ok('help ' + w + ': Escape', !(await d.evaluate(e => e.open)));
            await page.click('.help-btn'); await page.click('.help-close'); ok('help ' + w + ': Got it', !(await d.evaluate(e => e.open)));
            const bar = await page.evaluate(() => [...document.querySelectorAll('.topbar > *')].map(e => e.getBoundingClientRect()).map(r => [r.top, r.left, r.right]));
            ok('help ' + w + ': top bar on one line', bar.every(b => Math.abs(b[0] - bar[0][0]) < 2) && bar.every((b, i) => !i || b[1] >= bar[i - 1][2] - 1), bar);
        }
        await ctx.close();
    }

    // ---------- phone screenshot ----------
    if (SHOTS) {
        const { ctx, page } = await newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
        await ayesha(page);
        await page.fill('#f-from', '2026-11-16'); await page.locator('#f-from').dispatchEvent('change');
        await page.fill('#f-to', '2026-11-20'); await page.locator('#f-to').dispatchEvent('change');
        await page.evaluate(() => scrollTo(0, 0));
        await page.screenshot({ path: path.join(__dirname, 'screenshots', 'phone.png'), fullPage: false });
        await ctx.close();
    }

    // every file the page asks for loaded
    ['style.css', 'core.js', 'script.js', '../help.js', '../theme.js'].forEach(f => ok('requested ' + f, [...requested].some(u => u.endsWith('/' + SLUG + '/' + f) || u.endsWith(f.replace('..', '')))));
    // every file the page and service worker use answers 200
    {
        const ctx = await browser.newContext();
        for (const f of ['', 'index.html', 'favicon.svg', 'manifest.webmanifest', 'sw.js', 'style.css', 'core.js', 'script.js', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'screenshots/desktop.png', 'screenshots/phone.png', '../help.js', '../theme.js']) {
            const r = await ctx.request.get(URL + f); ok('200 for ' + (f || './'), r.status() === 200, r.status());
        }
        await ctx.close();
    }
    ok('no console errors', !errors.length, errors);
    ok('no failed requests', !failed.length, failed);
    await browser.close(); if (srv) srv.close();
    console.log(pass + ' passed, ' + fail + ' failed');
    process.exitCode = fail ? 1 : 0;
})();
