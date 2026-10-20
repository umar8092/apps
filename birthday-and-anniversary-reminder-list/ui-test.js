// Full page test with Playwright. Run from the repo root or this folder: node ui-test.js
//   BASE=https://umar8092.github.io/apps node ui-test.js   tests the live site
//   node ui-test.js --shots                                 also saves screenshots/desktop.png and phone.png
// "Today" is fixed to Tue 20 Oct 2026 in Pakistan time so every answer can be checked exactly.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), SLUG = 'birthday-and-anniversary-reminder-list', KEY = SLUG + '.state';
const SHOTS = process.argv.includes('--shots');
const NOW = new Date('2026-10-20T10:00:00+05:00');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; if (!cond) console.log('FAIL ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra).slice(0, 400) : '')); };

function serve() {
    const types = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml', png: 'image/png', webmanifest: 'application/manifest+json' };
    return new Promise(res => { const s = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0].replace(/^\/apps/, '')); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': types[f.split('.').pop()] || 'application/octet-stream' }); r.end(fs.readFileSync(f)); }).listen(0, () => res(s)); });
}

// The family from the README, as saved state (used for screenshots and the screen size checks).
const E = (id, name, kind, d, m, y, x) => Object.assign({ id, name, kind, label: '', d, m, y, feb29: '28', group: '', note: '', wished: '' }, x || {});
const FAMILY = { v: 1, nextId: 20, order: 'dm', before: 1, entries: [
    E(1, 'Mum', 'birthday', 20, 10, 1960, { group: 'family', note: 'Loves white roses. Call before 9 pm.' }),
    E(2, 'Dad', 'birthday', 21, 10, 0, { group: 'family' }),
    E(3, 'Sara', 'birthday', 24, 10, 1995, { group: 'friends', note: 'Gift idea: the new Elif Shafak novel' }),
    E(4, 'Ahmed', 'other', 2, 11, 2021, { label: 'Work anniversary', group: 'work' }),
    E(5, 'Uncle Tariq', 'birthday', 5, 11, 1958, { group: 'family' }),
    E(6, 'Nani', 'birthday', 8, 12, 1945, { group: 'family' }),
    E(7, 'Bilal', 'birthday', 14, 1, 2019, { group: 'family', note: 'Lego, age 8+' }),
    E(8, 'Zain', 'birthday', 29, 2, 2000, { group: 'friends', feb29: '1' }),
    E(9, 'Ali and Sara', 'anniversary', 12, 6, 2015, { group: 'family' }),
    E(10, 'Hina', 'birthday', 17, 10, 1990, { group: 'friends' })
] };

(async () => {
    let srv, base = process.env.BASE;
    if (!base) { srv = await serve(); base = 'http://localhost:' + srv.address().port + '/apps'; }
    const URL = base + '/' + SLUG + '/';
    const browser = await chromium.launch();
    const errors = [], failed = [], requested = new Set();
    async function newPage(opts, seed, extraInit) {
        const ctx = await browser.newContext(Object.assign({ viewport: { width: 390, height: 844 }, acceptDownloads: true, timezoneId: 'Asia/Karachi', colorScheme: 'dark', locale: 'en-GB' }, opts || {}));
        await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new globalThis.URL(base).origin });
        await ctx.route(/goatcounter\.com|gc\.zgo\.at/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
        if (seed !== undefined) await ctx.addInitScript(([k, v]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, v); sessionStorage.setItem('seeded', '1'); } }, [KEY, typeof seed === 'string' ? seed : JSON.stringify(seed)]);
        if (extraInit) await ctx.addInitScript(extraInit);
        const page = await ctx.newPage();
        await page.clock.setFixedTime(NOW);
        page.on('pageerror', e => errors.push(e.message));
        page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
        page.on('request', r => { if (r.url().startsWith(base)) requested.add(r.url()); });
        page.on('response', r => { if (r.status() >= 400 && r.url().startsWith(base)) failed.push(r.status() + ' ' + r.url()); });
        await page.goto(URL, { waitUntil: 'networkidle' });
        return { ctx, page };
    }
    const txt = (page, sel) => page.$eval(sel, e => e.textContent.trim()).catch(() => null);
    const vis = (page, sel) => page.isVisible(sel);
    const saved = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
    async function readDownload(page, click) {
        const [dl] = await Promise.all([page.waitForEvent('download'), click()]);
        return { name: dl.suggestedFilename(), body: fs.readFileSync(await dl.path(), 'utf8') };
    }

    // ---------- 1. first use, adding Sara by hand ----------
    {
        const { ctx, page } = await newPage();
        ok('first use: setup layout', await page.$eval('#app', e => e.classList.contains('setup')));
        ok('first use: form open', await vis(page, '#form'));
        ok('first use: no cancel button on an empty list', !(await vis(page, '#cancel')));
        ok('first use: empty message', (await txt(page, '#empty')).startsWith('Nobody here yet'));
        ok('first use: summary explains', (await txt(page, '#sum-body')).startsWith('Add a birthday'));
        ok('first use: find hidden', !(await vis(page, '#find')));
        ok('note is optional and hidden', !(await vis(page, '#w-note')) && await vis(page, '#o-note'));
        ok('feb 29 choice hidden', !(await vis(page, '#w-feb29')));
        ok('order guessed from language (en-GB: day first)', await page.$eval('#order', e => e.value) === 'dm');

        // empty submit
        await page.click('#save');
        ok('blank: name error', await txt(page, '#e-name') === 'Type a name.');
        ok('blank: date error', await txt(page, '#e-date') === 'Pick the day and the month.');
        ok('blank: focus on name', await page.evaluate(() => document.activeElement.id) === 'f-name');
        ok('blank: nothing saved', (await saved(page)).entries.length === 0);

        await page.fill('#f-name', 'Sara');
        await page.selectOption('#f-day', '31'); await page.selectOption('#f-month', '4');
        await page.click('#save');
        ok('31 April refused', await txt(page, '#e-date') === 'April has only 30 days.');
        await page.selectOption('#f-day', '1'); await page.selectOption('#f-month', '12'); await page.fill('#f-year', '2026');
        await page.click('#save');
        ok('future date refused', (await txt(page, '#e-date')).startsWith('That date has not happened yet'));
        await page.fill('#f-year', '95'); await page.click('#save');
        ok('2 digit year refused', (await txt(page, '#e-date')).startsWith('Type the year as 4 digits'));
        ok('year field marked invalid', await page.$eval('#f-year', e => e.getAttribute('aria-invalid')) === 'true');

        await page.selectOption('#f-day', '24'); await page.selectOption('#f-month', '10'); await page.fill('#f-year', '1995');
        ok('preview', await txt(page, '#preview') === 'Sara turns 31 on Sat 24 Oct (in 4 days).', await txt(page, '#preview'));
        await page.selectOption('#f-group', 'friends');
        await page.click('#save');
        ok('added: message', (await txt(page, '#list-msg')).startsWith('Added: Sara turns 31 on Sat 24 Oct (in 4 days).'));
        ok('added: errors cleared', await txt(page, '#e-date') === '');
        ok('added: box', await txt(page, '#e-1 .box-line') === 'In 4 days Turns 31 on Sat 24 Oct', await txt(page, '#e-1 .box-line'));
        ok('added: born line with group', await txt(page, '#e-1 .box-sub') === 'Born 24 Oct 1995 · Friends');
        ok('added: summary next 30 days', (await txt(page, '#sum-body')).includes('Next 30 days') && (await txt(page, '#sum-body')).includes('Sara turns 31 on Sat 24 Oct (in 4 days)'));
        ok('added: nothing today line', (await txt(page, '.sum-none')) === 'Nothing today or tomorrow.');
        ok('added: form folds away', !(await vis(page, '#form')) && await vis(page, '#open-form'));
        ok('added: month heading', await txt(page, '.m-h') === 'October');
        ok('added: saved', (await saved(page)).entries[0].name === 'Sara');

        // duplicate
        await page.click('#open-form');
        await page.fill('#f-name', 'sara'); await page.selectOption('#f-day', '24'); await page.selectOption('#f-month', '10');
        await page.click('#save');
        ok('duplicate refused', await txt(page, '#e-name') === "sara's birthday on 24 Oct is already on the list.");

        // anniversary and other wording
        await page.click('label[for=k-anniversary]');
        ok('anniversary: name label', await txt(page, '#l-name') === 'Whose anniversary?');
        ok('anniversary: year hint', (await txt(page, '#h-year')).includes('how many years'));
        await page.fill('#f-name', 'Ali and Sara'); await page.selectOption('#f-day', '12'); await page.selectOption('#f-month', '6'); await page.fill('#f-year', '2015');
        ok('anniversary preview', await txt(page, '#preview') === 'Ali and Sara: 12th wedding anniversary on Sat 12 Jun 2027 (in 235 days).');
        await page.click('label[for=k-other]');
        ok('other: label field shows', await vis(page, '#w-label'));
        await page.click('#save');
        ok('other: needs a label', (await txt(page, '#e-label')).startsWith('Type what the day is'));
        await page.fill('#f-label', 'Engagement');
        await page.click('#o-note'); await page.fill('#f-note', 'Book the restaurant');
        await page.click('#save');
        ok('other: added with note', (await txt(page, '#e-2 .box-note')) === 'Book the restaurant' && (await txt(page, '#e-2 .badge')) === 'Engagement');

        // 29 Feb
        await page.click('#open-form');
        await page.selectOption('#f-day', '29'); await page.selectOption('#f-month', '2');
        ok('29 Feb: choice shows', await vis(page, '#w-feb29'));
        await page.fill('#f-name', 'Zain'); await page.fill('#f-year', '2001');
        await page.click('#save');
        ok('29 Feb 2001 refused', (await txt(page, '#e-date')).startsWith('2001 had no 29 February'));
        await page.fill('#f-year', '2000'); await page.selectOption('#f-feb29', '1');
        ok('29 Feb preview with 1 Mar', await txt(page, '#preview') === 'Zain turns 27 on Mon 1 Mar 2027 (in 132 days).', await txt(page, '#preview'));
        await page.click('#save');
        ok('29 Feb: sub line', (await txt(page, '#e-3 .box-sub')) === 'Born 29 Feb 2000 (kept on 1 Mar in other years)');

        // edit with undo
        await page.click('#e-1 .mini:has-text("Edit")');
        ok('edit: form filled', await page.$eval('#f-year', e => e.value) === '1995' && await txt(page, '#save') === 'Save changes' && await vis(page, '#del'));
        ok('edit: title', await txt(page, '#form-h') === 'Edit Sara');
        await page.fill('#f-year', '1996'); await page.click('#save');
        ok('edit: saved', (await txt(page, '#e-1 .box-line')).includes('Turns 30'));
        await page.click('#list-msg .undo');
        ok('edit: undo', (await txt(page, '#e-1 .box-line')).includes('Turns 31'));

        // cancel edit keeps it
        await page.click('#e-1 .mini:has-text("Edit")'); await page.fill('#f-name', 'Changed'); await page.click('#cancel');
        ok('cancel: unchanged', await txt(page, '#e-1 .box-name') === 'Sara' && !(await vis(page, '#form')));

        // delete with undo
        await page.click('#e-2 .mini:has-text("Edit")'); await page.click('#del');
        ok('delete: gone', !(await page.$('#e-2')) && (await txt(page, '#list-msg')).startsWith('Deleted Ali and Sara (engagement).'));
        await page.click('#list-msg .undo');
        ok('delete: undo', !!(await page.$('#e-2')));

        // reload keeps everything
        await page.reload({ waitUntil: 'networkidle' });
        ok('reload: kept', (await page.$$('.box')).length === 3 && !(await page.$eval('#app', e => e.classList.contains('setup'))));

        // calendar for one person
        const one = await readDownload(page, () => page.click('#e-1 .mini:has-text("Calendar")'));
        ok('calendar: file name', one.name === 'sara-birthday.ics', one.name);
        ok('calendar: yearly event', one.body.includes('RRULE:FREQ=YEARLY') && one.body.includes('DTSTART;VALUE=DATE:20261024') && one.body.includes("SUMMARY:Sara's birthday (born 1995)"));
        ok('calendar: message', (await txt(page, '#list-msg')).startsWith('Saved a calendar file with 1 yearly reminder.'));
        await page.selectOption('#before', '7');
        const all = await readDownload(page, () => page.click('#cal-all'));
        ok('calendar all: 3 people, a week before', all.name === 'birthdays-and-anniversaries.ics' && all.body.includes('-P6DT15H') && (all.body.match(/RRULE/g) || []).length === 2 && (all.body.match(/BEGIN:VEVENT/g) || []).length === 32);
        ok('calendar setting saved', (await saved(page)).before === 7);

        // copy and email
        await page.click('#copy-all');
        const clip = await page.evaluate(() => navigator.clipboard.readText());
        ok('copy: list', clip.startsWith('Birthdays and anniversaries, the next 12 months from Tue 20 Oct 2026:') && clip.includes('Sat 24 Oct 2026: Sara turns 31'), clip);
        const href = await page.$eval('#mail-all', e => e.getAttribute('href'));
        ok('email: works with no address', href.startsWith('mailto:?subject=Birthdays%20and%20anniversaries&body=') && decodeURIComponent(href).includes('Sara turns 31'));

        // backup, wipe, undo, restore
        const bk = await readDownload(page, () => page.click('#backup'));
        ok('backup: file', bk.name === 'birthdays-backup-2026-10-20.json' && JSON.parse(bk.body).entries.length === 3);
        await page.click('#wipe');
        ok('wipe: empty', (await page.$$('.box')).length === 0 && await page.$eval('#app', e => e.classList.contains('setup')));
        await page.click('#set-msg .undo');
        ok('wipe: undo', (await page.$$('.box')).length === 3);
        await page.click('#wipe');
        await page.setInputFiles('#restore-file', { name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(bk.body) });
        await page.waitForTimeout(200);
        ok('restore: back', (await page.$$('.box')).length === 3 && (await txt(page, '#set-msg')).startsWith('Restored 3 dates'));
        await page.setInputFiles('#restore-file', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"nope":1}') });
        await page.waitForTimeout(200);
        ok('restore: wrong file refused', (await txt(page, '#set-msg')).startsWith('That file is not a backup') && (await page.$$('.box')).length === 3);
        await ctx.close();
    }

    // ---------- 2. adding many at once ----------
    {
        const { ctx, page } = await newPage();
        await page.click('#read-paste');
        ok('paste: empty explains', (await txt(page, '#import-out')).startsWith('Type or paste at least one line'));
        await page.fill('#paste', 'Sara 24/10/1995\nMum - 3 March\nMum 3 March\nAli and Sara anniversary 12/06/2015\nRandom words\nBob 10/24');
        await page.click('#read-paste');
        const o = await txt(page, '#import-out');
        ok('paste: 4 to add', o.includes('4 to add:') && o.includes('Ali and Sara — Wedding anniversary, 12 Jun 2015') && o.includes('Bob — Birthday, 24 Oct, year not known'), o);
        ok('paste: duplicate noted', o.includes('1 is already on the list'));
        ok('paste: bad line shown', o.includes('"Random words": no date found.'));
        await page.selectOption('#order', 'md');
        ok('paste: order change re-checks', (await txt(page, '#import-out')).includes('Ali and Sara — Wedding anniversary, 6 Dec 2015'));
        await page.selectOption('#order', 'dm');
        await page.click('#import-out .primary');
        ok('paste: added', (await page.$$('.box')).length === 4 && (await txt(page, '#list-msg')).startsWith('Added 4 dates') && await page.$eval('#paste', e => e.value) === '');
        await page.click('#list-msg .undo');
        ok('paste: undo', (await page.$$('.box')).length === 0);
        await page.fill('#paste', 'Sara 24/10/1995'); await page.click('#read-paste'); await page.click('#import-out .secondary');
        ok('paste: cancel', (await txt(page, '#import-out')) === '' && (await page.$$('.box')).length === 0);

        const vcf = 'BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Sara Khan\r\nBDAY:19951024\r\nEND:VCARD\r\nBEGIN:VCARD\r\nVERSION:3.0\r\nFN:Mum\r\nBDAY:--0303\r\nX-ANNIVERSARY:1985-04-12\r\nEND:VCARD\r\nBEGIN:VCARD\r\nFN:Plumber\r\nTEL:1\r\nEND:VCARD\r\n';
        await page.setInputFiles('#vcf-file', { name: 'contacts.vcf', mimeType: 'text/vcard', buffer: Buffer.from(vcf) });
        await page.waitForTimeout(200);
        ok('vcf: 3 found', (await txt(page, '#import-out')).includes('3 to add:'));
        await page.click('#import-out .primary');
        ok('vcf: added', (await page.$$('.box')).length === 3);
        await page.setInputFiles('#vcf-file', { name: 'x.vcf', mimeType: 'text/vcard', buffer: Buffer.from('nothing') });
        await page.waitForTimeout(200);
        ok('vcf: nothing found', (await txt(page, '#import-out')).startsWith('No birthdays or anniversaries were found'));
        await ctx.close();
    }

    // ---------- 3. the family: today, wished, find, midnight ----------
    {
        const { ctx, page } = await newPage({}, FAMILY);
        const sum = await txt(page, '#sum-body');
        ok('family: today', sum.includes('TodayMum turns 66 today'), sum);
        ok('family: tomorrow', sum.includes("TomorrowDad's birthday tomorrow (Wed 21 Oct)"));
        ok('family: soon', sum.includes('Sara turns 31 on Sat 24 Oct (in 4 days)') && sum.includes('Ahmed: Work anniversary, 5 years on Mon 2 Nov (in 13 days)') && sum.includes('Uncle Tariq turns 68 on Thu 5 Nov (in 16 days)'));
        ok('family: just passed', sum.includes('Just passedHina turned 36 on Sat 17 Oct (3 days ago)'));
        ok('family: count', sum.includes('10 dates on your list.'));
        ok('family: note in today', sum.includes('Loves white roses'));
        ok('family: find shows with 8+', await vis(page, '#find'));
        const months = await page.$$eval('.m-h', a => a.map(e => e.textContent));
        ok('family: months in order', JSON.stringify(months) === JSON.stringify(['October', 'November', 'December', 'January 2027', 'March 2027', 'June 2027', 'October 2027']), months);
        ok('family: today box', await page.$eval('#e-1', e => e.classList.contains('today')) && await txt(page, '#e-1 .chip') === 'Today');
        await page.click('.sum-list li.today .wish');
        ok('wished: ticked', (await txt(page, '.sum-list li.today .wish')) === 'Wished ✓' && (await saved(page)).entries[0].wished === '2026-10-20');
        ok('wished: focus kept', await page.evaluate(() => document.activeElement && document.activeElement.classList.contains('wish')));
        await page.reload({ waitUntil: 'networkidle' });
        ok('wished: kept after reload', (await txt(page, '.sum-list li.today .wish')) === 'Wished ✓');
        await page.click('.sum-list li.today .wish');
        ok('wished: undo', (await txt(page, '.sum-list li.today .wish')) === 'Mark as wished');
        await page.click('.sum-list li.passed .wish');
        ok('wished: belated', (await saved(page)).entries.find(e => e.name === 'Hina').wished === '2026-10-17');

        await page.fill('#q', 'sar');
        ok('find: name', JSON.stringify(await page.$$eval('.box-name', a => a.map(e => e.textContent))) === JSON.stringify(['Sara', 'Ali and Sara']));
        await page.fill('#q', ''); await page.selectOption('#g-filter', 'work');
        ok('find: group', JSON.stringify(await page.$$eval('.box-name', a => a.map(e => e.textContent))) === JSON.stringify(['Ahmed']));
        await page.fill('#q', 'zzz');
        ok('find: no match', await vis(page, '#no-match'));
        await page.fill('#q', ''); await page.selectOption('#g-filter', 'all');

        // the next day
        await page.clock.setFixedTime(new Date('2026-10-21T00:05:00+05:00'));
        await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
        const s2 = await txt(page, '#sum-body');
        ok('next day: Dad today, Mum just passed', s2.includes("TodayDad's birthday today") && s2.includes('Mum turned 66 on Tue 20 Oct (yesterday)'), s2);
        await ctx.close();
    }

    // ---------- 4. damaged or blocked storage ----------
    {
        const { ctx, page } = await newPage({}, '{broken');
        ok('corrupt: fresh start', (await page.$$('.box')).length === 0);
        ok('corrupt: told', (await txt(page, '#set-msg')).startsWith('The saved list could not be read'));
        await ctx.close();
        const b = await newPage({}, undefined, () => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
        ok('blocked: warning', await vis(b.page, '#storage-warn'));
        await b.page.fill('#f-name', 'Sara'); await b.page.selectOption('#f-day', '24'); await b.page.selectOption('#f-month', '10'); await b.page.click('#save');
        ok('blocked: still works this visit', (await b.page.$$('.box')).length === 1);
        await b.ctx.close();
        const us = await newPage({ locale: 'en-US' });
        ok('en-US: month first', await us.page.$eval('#order', e => e.value) === 'md');
        await us.ctx.close();
    }

    // ---------- 5. screen sizes, overlaps, placeholders, help, theme ----------
    const WIDTHS = [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920];
    for (const scheme of ['dark', 'light']) {
        for (const state of ['family', 'empty']) {
            const { ctx, page } = await newPage({ colorScheme: scheme }, state === 'family' ? FAMILY : undefined);
            for (const w of WIDTHS) {
                await page.setViewportSize({ width: w, height: 900 });
                await page.waitForTimeout(50);
                const sw = await page.evaluate(() => document.documentElement.scrollWidth);
                ok(`${scheme} ${state} ${w}: no sideways scroll`, sw <= w, sw);
                const out = await page.evaluate(() => [...document.querySelectorAll('main *')].filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.right > innerWidth + 1 || r.left < -1); }).map(e => e.tagName + '.' + e.className).slice(0, 3));
                ok(`${scheme} ${state} ${w}: nothing sticks out`, !out.length, out);
                if (w >= 900) for (const pos of ['top', 'middle', 'bottom']) {
                    await page.evaluate(p => window.scrollTo(0, p === 'top' ? 0 : p === 'middle' ? document.body.scrollHeight / 2 : document.body.scrollHeight), pos);
                    const ov = await page.evaluate(() => {
                        const bad = [];
                        ['main', '.col-main', '.col-side'].forEach(sel => { const kids = [...document.querySelector(sel).children].filter(e => e.offsetParent && getComputedStyle(e).display !== 'contents');
                            for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) { const a = kids[i].getBoundingClientRect(), b = kids[j].getBoundingClientRect();
                                if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) bad.push(kids[i].className + ' / ' + kids[j].className); } });
                        return bad;
                    });
                    ok(`${scheme} ${state} ${w} ${pos}: no overlapping blocks`, !ov.length, ov);
                }
            }
            await ctx.close();
        }
    }
    // narrow phones with every optional field open: controls must not overlap, placeholders must fit
    for (const w of [320, 360, 390]) {
        const { ctx, page } = await newPage({ viewport: { width: w, height: 800 } }, FAMILY);
        await page.click('#open-form');
        await page.click('label[for=k-other]'); await page.selectOption('#f-day', '29'); await page.selectOption('#f-month', '2'); await page.click('#o-note');
        await page.fill('#paste', 'x'); await page.click('#read-paste');
        const bad = await page.evaluate(() => {
            const els = [...document.querySelectorAll('main input:not([type=radio]):not([type=file]), main select, main button, main textarea, main a.secondary, .seg label')].filter(e => e.offsetParent);
            const out = [];
            for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) { const a = els[i].getBoundingClientRect(), b = els[j].getBoundingClientRect();
                if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1 && !els[i].contains(els[j]) && !els[j].contains(els[i])) out.push((els[i].id || els[i].textContent) + ' / ' + (els[j].id || els[j].textContent)); }
            return out;
        });
        ok(`${w}: no overlapping controls`, !bad.length, bad);
        const clipped = await page.evaluate(() => {
            const c = document.createElement('canvas').getContext('2d');
            return [...document.querySelectorAll('main input[placeholder], main textarea[placeholder]')].filter(e => e.offsetParent).filter(e => {
                const s = getComputedStyle(e); c.font = s.fontSize + ' ' + s.fontFamily;
                const room = e.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight);
                return e.placeholder.split('\n').some(l => c.measureText(l).width > room);
            }).map(e => e.id);
        });
        ok(`${w}: placeholders fit`, !clipped.length, clipped);
        const labels = await page.evaluate(() => [...document.querySelectorAll('.seg label, .tool-grid > *, .box-btns .mini')].filter(e => e.offsetParent && e.scrollWidth > e.clientWidth + 1).map(e => e.textContent));
        ok(`${w}: button text fits`, !labels.length, labels);
        await ctx.close();
    }
    // Help dialog and top bar
    for (const w of [320, 390, 820, 1280]) {
        const { ctx, page } = await newPage({ viewport: { width: w, height: 800 } }, FAMILY);
        const helpBtn = await page.$('button:has-text("Help")');
        ok(`${w}: help button`, !!helpBtn);
        await helpBtn.click();
        const d = await page.$('dialog[open]');
        const r = d && await d.boundingBox();
        ok(`${w}: help inside screen`, r && r.x >= 0 && r.x + r.width <= w + 1 && r.y >= 0, r);
        ok(`${w}: help title`, d && (await d.textContent()).includes('How to use Birthday and Anniversary Reminder List'));
        await page.keyboard.press('Escape');
        ok(`${w}: escape closes`, !(await page.$('dialog[open]')));
        await helpBtn.click(); await page.click('dialog[open] button:has-text("Got it")');
        ok(`${w}: got it closes`, !(await page.$('dialog[open]')));
        const bar = await page.evaluate(() => { const b = [...document.querySelectorAll('.topbar > *, .back')].filter(e => e.offsetParent).map(e => e.getBoundingClientRect()); return b.some((a, i) => b.some((c, j) => i < j && a.left < c.right - 1 && c.left < a.right - 1 && a.top < c.bottom - 1 && c.top < a.bottom - 1)); });
        ok(`${w}: top bar does not overlap`, !bar);
        if (w === 390) {
            const before = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
            await page.click('.theme-toggle');
            const after = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
            ok('theme switch changes the look', before !== after && ['light', 'dark'].includes(after), [before, after]);
            const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
            ok('theme switch: light background', after !== 'light' || bg.match(/\d+/g).slice(0, 3).reduce((a, b) => a + +b, 0) > 650, bg);
        }
        await ctx.close();
    }

    // ---------- screenshots ----------
    if (SHOTS) {
        const d = await newPage({ viewport: { width: 1280, height: 900 } }, FAMILY);
        await d.page.screenshot({ path: path.join(__dirname, 'screenshots/desktop.png'), fullPage: false });
        await d.ctx.close();
        const p = await newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }, FAMILY);
        await p.page.screenshot({ path: path.join(__dirname, 'screenshots/phone.png'), fullPage: false });
        await p.ctx.close();
    }

    // every file the page asked for answered, no console errors
    ['style.css', 'core.js', 'script.js'].forEach(f => ok('requested ' + f, [...requested].some(u => u.endsWith(SLUG + '/' + f))));
    {   // files the browser only asks for when installing: fetch them to be sure they answer
        const { ctx, page } = await newPage();
        for (const f of ['favicon.svg', 'manifest.webmanifest', 'sw.js', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'screenshots/desktop.png', 'screenshots/phone.png', '../theme.js', '../help.js']) {
            const st = await page.evaluate(u => fetch(u, { cache: 'no-store' }).then(r => r.status, () => 0), f);
            ok(f + ' answers 200', st === 200, st);
        }
        await ctx.close();
    }
    ok('theme.js and help.js loaded', [...requested].some(u => u.endsWith('/theme.js')) && [...requested].some(u => u.endsWith('/help.js')));
    ok('no failed requests', !failed.length, failed);
    ok('no console errors', !errors.length, errors);
    await browser.close(); if (srv) srv.close();
    console.log(pass + ' passed, ' + fail + ' failed');
    process.exitCode = fail ? 1 : 0;
})();
