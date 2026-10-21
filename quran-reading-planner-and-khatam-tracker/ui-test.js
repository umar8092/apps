// Full page test with Playwright. Run from the repo root or this folder: node ui-test.js
//   BASE=https://umar8092.github.io/apps node ui-test.js   tests the live site
//   node ui-test.js --shots                                 also saves screenshots/desktop.png and phone.png
// "Today" is fixed to Wed 21 Oct 2026 in Pakistan time so every answer can be checked exactly.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), SLUG = 'quran-reading-planner-and-khatam-tracker', KEY = SLUG + '.state';
const SHOTS = process.argv.includes('--shots');
const NOW = new Date('2026-10-21T15:00:00+05:00');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; if (!cond) console.log('FAIL ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra).slice(0, 400) : '')); };

function serve() {
    const types = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml', png: 'image/png', webmanifest: 'application/manifest+json' };
    return new Promise(res => { const s = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0].replace(/^\/apps/, '')); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': types[f.split('.').pop()] || 'application/octet-stream' }); r.end(fs.readFileSync(f)); }).listen(0, () => res(s)); });
}

// Fatima's month from the README: 604 pages from Mon 12 Oct to Tue 10 Nov (30 days), she missed Mon 19 Oct,
// two khatams already, and the family khatam for Dada Abbu shared between 7 people.
const LOG = [['2026-10-12', 21], ['2026-10-13', 42], ['2026-10-14', 61], ['2026-10-15', 81], ['2026-10-16', 101], ['2026-10-17', 121], ['2026-10-18', 141], ['2026-10-20', 161]].map(([d, at]) => ({ d, at }));
const GROUP = { title: "Dada Abbu's khatam", by: '2026-10-24', people: ['Fatima', 'Ali', 'Ammi', 'Abbu', 'Sara', 'Omar', 'Hina'].map((name, i) => ({ id: i + 1, name })), who: [], done: [] };
[5, 5, 4, 4, 4, 4, 4].forEach((n, i) => { for (let c = 0; c < n; c++) GROUP.who.push(i + 1); });
GROUP.done = GROUP.who.map((w, j) => [0, 1, 2, 5, 6, 10, 11, 12, 14, 18, 22, 23].includes(j));
const MONTH = { v: 1, copy: '604', total: 604, plan: { start: '2026-10-12', from: 1, mode: 'date', by: '2026-11-10', perDay: 0 }, log: LOG,
    khatams: [{ start: '2025-03-01', end: '2025-03-30', total: 604, days: [] }, { start: '2026-02-18', end: '2026-03-19', total: 604, days: [] }], group: GROUP, nextId: 8 };

(async () => {
    let srv, base = process.env.BASE;
    if (!base) { srv = await serve(); base = 'http://localhost:' + srv.address().port + '/apps'; }
    const URL = base + '/' + SLUG + '/';
    const browser = await chromium.launch();
    const errors = [], failed = [], requested = new Set();
    async function newPage(opts, seed) {
        const ctx = await browser.newContext(Object.assign({ viewport: { width: 390, height: 844 }, acceptDownloads: true, timezoneId: 'Asia/Karachi', colorScheme: 'dark', locale: 'en-GB' }, opts || {}));
        await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new globalThis.URL(base).origin });
        await ctx.route(/goatcounter\.com|gc\.zgo\.at/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
        if (seed !== undefined) await ctx.addInitScript(([k, v]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, v); sessionStorage.setItem('seeded', '1'); } }, [KEY, typeof seed === 'string' ? seed : JSON.stringify(seed)]);
        const page = await ctx.newPage();
        await page.clock.setFixedTime(NOW);
        page.on('pageerror', e => errors.push(e.message));
        page.on('console', m => { if (m.type() === 'error' && page.url().includes(SLUG)) errors.push(m.text()); }); // the hub's own GitHub API calls are not this app's
        page.on('request', r => { if (r.url().startsWith(base)) requested.add(r.url()); });
        page.on('response', r => { if (r.status() >= 400 && r.url().startsWith(base)) failed.push(r.status() + ' ' + r.url()); });
        await page.goto(URL, { waitUntil: 'networkidle' });
        return { ctx, page };
    }
    const txt = (page, sel) => page.$eval(sel, e => e.textContent.replace(/\s+/g, ' ').trim()).catch(() => null);
    const txts = (page, sel) => page.$$eval(sel, l => l.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
    const vis = (page, sel) => page.isVisible(sel);
    const saved = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
    async function logPage(page, value, day) {
        if (day) { if (!(await vis(page, '#l-day'))) await page.click('#l-day-open'); await page.fill('#l-day', day); }
        await page.fill('#l-page', String(value)); await page.click('#l-save');
    }
    const person = (page, name) => page.locator('#g-people > li', { has: page.locator('h3', { hasText: new RegExp('^' + name + '$') }) });

    // ---------- 1. first use ----------
    let { ctx, page } = await newPage();
    ok('first use: plan form open', await vis(page, '#plan') && !(await vis(page, '#today')) && !(await vis(page, '#juz')));
    ok('first use: title', (await txt(page, '#plan-h')) === 'Set up your plan');
    ok('first use: Madani copy picked', await page.inputValue('#p-copy') === '604');
    ok('first use: starts today', await page.inputValue('#p-start') === '2026-10-21');
    ok('optional start page hidden behind a button', !(await vis(page, '#p-from')) && await vis(page, '#o-from'));
    ok('custom pages hidden', !(await vis(page, '#p-pages')));
    ok('no cancel button on the first plan', !(await vis(page, '#plan-cancel')));
    ok('khatams card hidden on first use', !(await vis(page, '#khatams')));
    ok('group not started', await vis(page, '#g-start') && !(await vis(page, '#g-on')));

    // ---------- 2. plan errors ----------
    await page.click('#plan-save');
    ok('no finish date error', (await txt(page, '#e-by')) === 'Pick the day you want to finish by.', await txt(page, '#e-by'));
    ok('nothing saved', (await saved(page)).plan === null);
    await page.fill('#p-by', '2026-10-01'); await page.click('#plan-save');
    ok('finish before start error', (await txt(page, '#e-by')) === 'The finish day is before the start day.', await txt(page, '#e-by'));
    await page.selectOption('#p-copy', 'custom');
    ok('custom pages shown', await vis(page, '#p-pages'));
    for (const bad of ['', '20', '5000', 'abc', '12.5']) { await page.fill('#p-pages', bad); await page.click('#plan-save'); ok('bad page count "' + bad + '" refused', (await txt(page, '#e-pages')) === 'Type the number of pages in your copy, from 30 to 2000.', await txt(page, '#e-pages')); }
    await page.selectOption('#p-copy', '604');

    // ---------- 3. the real situation: 30 days from today ----------
    await page.click('.chip[data-days="30"]');
    ok('In 30 days fills 19 Nov', await page.inputValue('#p-by') === '2026-11-19');
    ok('preview 21 a day', (await txt(page, '#preview')) === '21 pages a day (about 1 juz): 604 pages in 30 days, Wed 21 Oct to 19 Nov 2026.', await txt(page, '#preview'));
    await page.click('.chip[data-days="365"]');
    ok('In a year: 2 pages a day', (await txt(page, '#preview')) === '2 pages a day: 604 pages in 365 days, Wed 21 Oct to 20 Oct 2027.', await txt(page, '#preview'));
    await page.click('.chip[data-days="30"]');
    await page.click('#plan-save');
    ok('plan saved, form closes', !(await vis(page, '#plan')) && await vis(page, '#today') && await vis(page, '#juz'));
    ok('ready message', (await txt(page, '#today-msg')).startsWith('Your plan is ready.'));
    ok('not started line', (await txt(page, '#today-body .box-line')) === 'Not started yet: 604 pages.');
    ok('THE ANSWER today', (await txt(page, '#today-body .big')) === 'Read 21 pages today: up to page 21.', await txt(page, '#today-body .big'));
    ok('on plan', (await txt(page, '#today-body .state')) === 'On plan.');
    ok('days left line', (await txt(page, '#today-body .sub-line')) === 'To finish by Thu 19 Nov: 21 pages a day (about 1 juz), 30 days left counting today.', await txt(page, '#today-body .sub-line'));
    ok('juz grid 30 boxes', await page.locator('#juz-grid li').count() === 30);
    ok('juz line', (await txt(page, '#juz-line')) === '0 of 30 juz done, reading Juz 1 now.');
    ok('placeholder shows the goal page', await page.getAttribute('#l-page', 'placeholder') === 'e.g. 21');

    // ---------- 4. logging mistakes ----------
    await page.click('#l-save');
    ok('blank page error', (await txt(page, '#e-log')) === 'Type the page number where you stopped, such as 221.');
    for (const bad of ['abc', '-3', '4.5']) { await logPage(page, bad); ok('bad page "' + bad + '"', (await txt(page, '#e-log')) === 'Type the page number where you stopped, such as 221.'); }
    await logPage(page, 0); ok('page 0 error', (await txt(page, '#e-log')) === 'Your copy has 604 pages. Type a page from 1 to 604.');
    await logPage(page, 700); ok('page 700 error', (await txt(page, '#e-log')) === 'Your copy has 604 pages. Type a page from 1 to 604.');
    await logPage(page, 10, '2026-10-20'); ok('day before the plan refused', (await txt(page, '#e-log')).startsWith('That is before your plan started on Wed 21 Oct.'), await txt(page, '#e-log'));
    ok('nothing logged', (await saved(page)).log.length === 0);
    await page.click('#l-day-open');
    ok('back to today', (await txt(page, '#l-day-text')) === 'Reading for today.');

    // ---------- 5. log today's reading ----------
    await logPage(page, ' 21 ');
    ok('saved message', (await txt(page, '#today-msg')).startsWith('Saved: 21 pages today, up to page 21.'), await txt(page, '#today-msg'));
    ok('today done', (await txt(page, '#today-body .big')) === "Today's reading is done. 21 pages read today.", await txt(page, '#today-body .big'));
    ok('from tomorrow 21 a day', (await txt(page, '#today-body .sub-line')) === 'From tomorrow: 21 pages a day (about 1 juz) to finish by Thu 19 Nov (29 days).', await txt(page, '#today-body .sub-line'));
    ok('juz 1 done', (await txt(page, '#juz-line')) === '1 of 30 juz done, reading Juz 2 now.' && await page.$eval('#juz-grid li:first-child', e => e.classList.contains('done')));
    ok('where line', (await txt(page, '#today-body .box-line')) === 'Page 21 of 604, 3%, in Juz 2, Surah Al‑Baqarah.', await txt(page, '#today-body .box-line'));
    ok('streak 1', (await txt(page, '#k-body .sub-line')) === 'Reading streak: 1 day in a row.');
    await logPage(page, 10);
    ok('going back refused', (await txt(page, '#e-log')) === 'Page 10 is before page 21, where you had already reached. If that was a mistake, delete it under "History".');
    // pick the end of a juz from the list
    await page.selectOption('#l-juz', '41');
    ok('juz list fills the page', await page.inputValue('#l-page') === '41');
    ok('juz list starts after what is done', (await page.$$eval('#l-juz option', l => l.map(o => o.textContent)))[1] === 'End of Juz 2 (page 41)');
    await page.click('#l-save');
    ok('ahead after reading more', (await txt(page, '#today-body .state')) === '20 pages ahead of your plan.', await txt(page, '#today-body .state'));
    ok('two entries', (await saved(page)).log.length === 2);
    // undo the last save
    await page.click('#today-msg .undo');
    ok('undo save', (await saved(page)).log.length === 1);
    // history and delete with undo
    await page.click('#hist-btn');
    ok('history open', await vis(page, '#history') && (await txts(page, '#hist-list li span'))[0] === 'Wed 21 Oct: up to page 21 (+21 pages)', await txts(page, '#hist-list li span'));
    await page.click('#hist-list .del');
    ok('deleted', (await saved(page)).log.length === 0 && (await txt(page, '#today-body .box-line')) === 'Not started yet: 604 pages.');
    await page.click('#today-msg .undo');
    ok('delete undone', (await saved(page)).log.length === 1);

    // ---------- 6. reload keeps everything ----------
    await page.reload({ waitUntil: 'networkidle' });
    ok('reload keeps the plan and reading', (await txt(page, '#today-body .box-line')) === 'Page 21 of 604, 3%, in Juz 2, Surah Al‑Baqarah.');

    // ---------- 7. change plan: same pages every day ----------
    await page.click('#change-plan');
    ok('change plan form', await vis(page, '#plan') && (await txt(page, '#plan-h')) === 'Change your plan' && await vis(page, '#plan-cancel') && await vis(page, '#restart'));
    await page.click('label[for=m-pace]');
    ok('pages a day shown, date hidden', await vis(page, '#p-per') && !(await vis(page, '#p-by')));
    await page.click('#plan-save');
    ok('pages a day required', (await txt(page, '#e-per')) === 'Type how many pages a day, 1 or more.', await txt(page, '#e-per'));
    await page.click('.chip[data-per="20"]');
    ok('1 juz chip is 20 pages', await page.inputValue('#p-per') === '20');
    ok('pace preview', (await txt(page, '#preview')) === 'You finish on 20 Nov 2026: 604 pages in 31 days, from Wed 21 Oct.', await txt(page, '#preview'));
    await page.fill('#p-start', '2026-10-22'); await page.click('#plan-save');
    ok('start after a logged day refused', (await txt(page, '#e-start')) === 'You logged reading on Wed 21 Oct. Start on that day or earlier.', await txt(page, '#e-start'));
    await page.fill('#p-start', '2026-10-21');
    await page.selectOption('#p-copy', 'custom'); await page.fill('#p-pages', '30');
    await page.click('#plan-save');
    ok('pace plan saved', !(await vis(page, '#plan')));
    ok('pace answer', (await txt(page, '#today-body .sub-line')) === 'At 20 pages a day you finish tomorrow, Thu 22 Oct.', await txt(page, '#today-body .sub-line'));
    ok('custom copy juz say about', (await txt(page, '#juz-hint')).includes('about right') && (await page.$$eval('#l-juz option', l => l.map(o => o.textContent)))[1].includes('about page'));
    // undo the plan change
    await page.click('#today-msg .undo');
    ok('plan change undone', (await saved(page)).plan.mode === 'date' && (await saved(page)).total === 604);
    await page.click('#change-plan'); await page.click('#plan-cancel');
    ok('cancel closes the form', !(await vis(page, '#plan')));
    // a copy smaller than what was read
    await logPage(page, 41);
    await page.click('#change-plan'); await page.selectOption('#p-copy', 'custom'); await page.fill('#p-pages', '30'); await page.click('#plan-save');
    ok('copy smaller than the page reached refused', (await txt(page, '#e-pages')) === 'You have already logged page 41. Pick a copy with at least that many pages, or delete readings under History first.', await txt(page, '#e-pages'));
    await page.click('#plan-cancel');
    await page.click('#hist-btn'); await page.click('#hist-list .del');
    // start again with undo
    await page.click('#change-plan'); await page.click('#restart');
    ok('restart clears the reading', (await saved(page)).log.length === 0 && (await saved(page)).plan !== null);
    await page.click('#today-msg .undo');
    ok('restart undone', (await saved(page)).log.length === 1);
    await ctx.close();

    // ---------- 8. Fatima's month: missed a day ----------
    ({ ctx, page } = await newPage({}, MONTH));
    ok('month: where', (await txt(page, '#today-body .box-line')) === 'Page 161 of 604, 26%, in Juz 9, Surah Al‑Araf.', await txt(page, '#today-body .box-line'));
    ok('month: THE ANSWER', (await txt(page, '#today-body .big')) === 'Read 22 pages today: up to page 183.', await txt(page, '#today-body .big'));
    ok('month: behind', (await txt(page, '#today-body .state')) === '21 pages behind your plan. The missed pages are spread over the days left.', await txt(page, '#today-body .state'));
    ok('month: days left', (await txt(page, '#today-body .sub-line')) === 'To finish by Tue 10 Nov: 22 pages a day (about 1 juz), 21 days left counting today.', await txt(page, '#today-body .sub-line'));
    ok('month: juz', (await txt(page, '#juz-line')) === '8 of 30 juz done, reading Juz 9 now.');
    ok('month: khatams 2', (await txt(page, '#k-body .big')) === '2 khatams finished');
    ok('month: streak 2 (19 Oct missed)', (await txt(page, '#k-body .sub-line')) === 'Reading streak: 1 day in a row.', await txt(page, '#k-body .sub-line'));
    ok('month: khatam list newest first', (await txts(page, '#k-list .k-sub'))[0] === '18 Feb 2026 to 19 Mar 2026 (30 days)');
    // log yesterday's missed day afterwards: 19 Oct between 141 and 161
    await logPage(page, 170, '2026-10-19');
    ok('missed day past a later reading refused', (await txt(page, '#e-log')) === 'On Tue 20 Oct you had only reached page 161. Type a page up to 161 for this day.', await txt(page, '#e-log'));
    await logPage(page, 150, '2026-10-19');
    ok('missed day filled in', (await txt(page, '#today-msg')).startsWith('Saved: 9 pages Mon 19 Oct, up to page 150.'), await txt(page, '#today-msg'));
    ok('streak now 9 (12 to 20 Oct)', (await txt(page, '#k-body .sub-line')) === 'Reading streak: 9 days in a row.', await txt(page, '#k-body .sub-line'));
    // khatam delete with undo
    await page.locator('#k-list .del').first().click();
    ok('khatam deleted', (await txt(page, '#k-body .big')) === '1 khatam finished');
    await page.click('#k-msg .undo');
    ok('khatam delete undone', (await txt(page, '#k-body .big')) === '2 khatams finished');

    // ---------- 9. group khatam ----------
    ok('group: sum', (await txt(page, '#g-sum .big')) === '12 of 30 juz read');
    ok('group: days left', (await txt(page, '#g-sum .sub-line')) === 'Finish by Sat 24 Oct (4 days left counting today). 18 juz to go.', await txt(page, '#g-sum .sub-line'));
    ok('group: 7 boxes', await page.locator('#g-people > li').count() === 7);
    ok('group: Fatima reads 1-5', (await person(page, 'Fatima').locator('.box-sub').textContent()).startsWith('Juz 1-5.'));
    ok('group: Hina badge', (await person(page, 'Hina').locator('.badge').textContent()) === '0 of 4 read');
    await person(page, 'Hina').getByRole('button', { name: /^Juz 27 / }).click();
    ok('group: tick a juz', (await person(page, 'Hina').locator('.badge').textContent()) === '1 of 4 read' && (await saved(page)).group.done[26] === true);
    ok('group: aria-pressed', await person(page, 'Hina').locator('[data-juz="27"]').getAttribute('aria-pressed') === 'true');
    await person(page, 'Hina').locator('[data-juz="27"]').click();
    ok('group: untick', (await saved(page)).group.done[26] === false);
    // copy for WhatsApp
    await page.click('#g-copy');
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    ok('group: copied list', clip.startsWith("Khatam: Dada Abbu's khatam\nFinish by 24 Oct 2026\n12 of 30 juz read\n\nFatima: Juz 1 ✓, 2 ✓, 3 ✓, 4, 5\n"), clip);
    ok('group: copied list ends with what is left', clip.endsWith('Still to read: Juz 4, 5, 8-10, 14, 16-18, 20-22, 25-30'), clip);
    // reassign a juz to nobody
    await page.click('#g-assign-open');
    await page.selectOption('#as-30', '0');
    ok('group: not taken box', (await txt(page, '#g-people .free .box-sub')) === 'Juz 30');
    ok('group: not taken warning', (await txt(page, '#g-sum .state')) === '1 juz is not taken yet.', await txt(page, '#g-sum .state'));
    await page.selectOption('#as-30', '7');
    // add errors
    await page.click('#g-add-btn'); ok('group: blank name', (await txt(page, '#e-name')) === 'Type a name.');
    await page.fill('#g-name', 'sara'); await page.click('#g-add-btn'); ok('group: same name', (await txt(page, '#e-name')) === 'sara is already in the list. Add a surname or an initial.');
    await page.fill('#g-name', 'Zainab Khan'); await page.click('#g-add-btn');
    ok('group: added a person', await page.locator('#g-people > li').count() === 8 && (await person(page, 'Zainab Khan').locator('.badge').textContent()) === 'no juz yet');
    // share out again: 8 people -> 6 read 4, 2 read 3
    await page.click('#g-share');
    ok('group: shared message', (await txt(page, '#g-msg')).startsWith('Shared out: 6 people read 4 juz, the others 3.'), await txt(page, '#g-msg'));
    ok('group: Zainab reads 28-30', (await person(page, 'Zainab Khan').locator('.box-sub').textContent()).startsWith('Juz 28-30.'));
    await page.click('#g-msg .undo');
    ok('group: share undone', (await saved(page)).group.who[29] === 7);
    // rename and remove
    await person(page, 'Omar').getByRole('button', { name: 'Rename Omar' }).click();
    await page.fill('#rn-6', 'Omar Farooq'); await page.locator('#g-people form.rename button[type=submit]').click();
    ok('group: renamed', await person(page, 'Omar Farooq').count() === 1);
    await person(page, 'Ali').getByRole('button', { name: 'Remove Ali' }).click();
    ok('group: removed, juz free', (await txt(page, '#g-people .free .box-sub')) === 'Juz 6-10');
    await page.click('#g-msg .undo');
    ok('group: remove undone', await person(page, 'Ali').count() === 1);
    // start again and delete
    await page.click('#g-again');
    ok('group: start again keeps people', (await saved(page)).group.people.length === 8 && (await saved(page)).group.done.every(d => !d) && (await txt(page, '#g-sum .big')) === '0 of 30 juz read');
    await page.click('#g-msg .undo');
    await page.click('#g-del');
    ok('group: deleted', await vis(page, '#g-start'));
    await page.click('#g-msg .undo');
    ok('group: delete undone', await vis(page, '#g-on'));
    // title and finish date are optional and saved
    await page.fill('#g-title', 'For Nani');
    ok('group: title saved', (await saved(page)).group.title === 'For Nani');
    await page.fill('#g-by', ''); await page.dispatchEvent('#g-by', 'change');
    ok('group: finish date cleared', (await saved(page)).group.by === '');

    // ---------- 10. share and backup ----------
    ok('mail link', decodeURIComponent(await page.getAttribute('#mail', 'href')).startsWith('mailto:?subject=My Quran reading&body=My Quran reading\nPage 161 of 604 (8 of 30 juz done)\nFinishing by 10 Nov 2026: 22 pages a day\nKhatams finished: 2'));
    await page.click('#copy');
    ok('copy progress', (await page.evaluate(() => navigator.clipboard.readText())).includes('Khatams finished: 2'));
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#backup')]);
    const backup = fs.readFileSync(await dl.path(), 'utf8');
    ok('backup file', dl.suggestedFilename() === 'quran-reading-backup-2026-10-21.json' && JSON.parse(backup).log.length === 9);
    await page.click('#wipe');
    ok('delete everything opens the plan form', await vis(page, '#plan') && !(await vis(page, '#today')) && !(await vis(page, '#khatams')));
    await page.click('#set-msg .undo');
    ok('delete everything undone', (await txt(page, '#k-body .big')) === '2 khatams finished');
    await page.click('#wipe');
    await page.setInputFiles('#restore-file', { name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"v":1,"total":-5}') });
    ok('bad backup refused', (await txt(page, '#set-msg')) === 'That file is not a backup from this app, so nothing was changed.');
    await page.setInputFiles('#restore-file', { name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(backup) });
    ok('backup restored', (await txt(page, '#set-msg')).startsWith('Backup restored.') && (await txt(page, '#today-body .big')) === 'Read 22 pages today: up to page 183.', await txt(page, '#today-body .big'));
    // theme switch
    const before = await page.evaluate(() => document.documentElement.getAttribute('data-theme') || 'system');
    await page.click('.theme-toggle');
    const after = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    ok('theme switch', after && after !== before, [before, after]);
    await ctx.close();

    // ---------- 11. finishing a khatam ----------
    ({ ctx, page } = await newPage({}, Object.assign({}, MONTH, { log: LOG.concat([{ d: '2026-10-21', at: 603 }]) })));
    ok('one page left', (await txt(page, '#today-body .big')) === "Today's reading is done. 442 pages read today.", await txt(page, '#today-body .big'));
    await logPage(page, 604);
    ok('reached the last page', (await txt(page, '#today-msg')).startsWith('Saved: you reached the last page.'));
    ok('khatam complete', (await txt(page, '#today-body .big')) === 'Khatam complete, Mashallah!' && (await txt(page, '#today-body .state')) === 'You read all 604 pages in 10 days.', await txt(page, '#today-body .state'));
    ok('log form hidden when complete', !(await vis(page, '#log-form')));
    ok('counts the finished khatam', (await txt(page, '#k-body .big')) === '3 khatams finished');
    ok('all 30 juz done', (await txt(page, '#juz-line')) === '30 of 30 juz done.');
    await page.click('text=Save this khatam and start the next');
    ok('khatam saved', (await saved(page)).khatams.length === 3 && (await saved(page)).plan === null);
    ok('next plan prefilled: 30 days from today', await vis(page, '#plan') && await page.inputValue('#p-by') === '2026-11-19' && await page.inputValue('#p-start') === '2026-10-21', await page.inputValue('#p-by'));
    ok('khatam 3 listed', (await txts(page, '#k-list .k-sub'))[0] === '12 Oct 2026 to 21 Oct 2026 (10 days)');
    await page.click('#plan-save');
    ok('next khatam started', (await txt(page, '#today-body .big')) === 'Read 21 pages today: up to page 21.');
    await ctx.close();

    // ---------- 12. plan in the future, passed, already started ----------
    ({ ctx, page } = await newPage({}, { v: 1, copy: '604', total: 604, plan: { start: '2027-02-08', from: 1, mode: 'date', by: '2027-03-09', perDay: 0 }, log: [], khatams: [], group: null, nextId: 1 }));
    ok('Ramadan plan not started', (await txt(page, '#today-body .big')) === 'Your plan starts Mon 8 Feb 2027.', await txt(page, '#today-body .big'));
    ok('Ramadan plan pages', (await txt(page, '#today-body .sub-line')) === 'Then read 21 pages a day (about 1 juz) to finish by Tue 9 Mar.', await txt(page, '#today-body .sub-line'));
    await ctx.close();
    ({ ctx, page } = await newPage({}, { v: 1, copy: '604', total: 604, plan: { start: '2026-09-01', from: 1, mode: 'date', by: '2026-10-01', perDay: 0 }, log: [{ d: '2026-09-02', at: 300 }], khatams: [], group: null, nextId: 1 }));
    ok('passed date', (await txt(page, '#today-body .big')) === 'Your finish date, Thu 1 Oct, has passed.' && (await txt(page, '#today-body .state')) === '304 pages left. Tap "Change plan" to pick a new date.');
    await ctx.close();
    ({ ctx, page } = await newPage());
    await page.click('#o-from'); await page.fill('#p-from', '222'); await page.fill('#p-by', '2026-10-30');
    ok('already started preview', (await txt(page, '#preview')) === '39 pages a day (about 2 juz): 383 pages in 10 days, Wed 21 Oct to 30 Oct 2026.', await txt(page, '#preview'));
    await page.fill('#p-from', '900'); await page.click('#plan-save');
    ok('start page past the end', (await txt(page, '#e-from')) === 'Type the page you start from: 1 to 604.');
    await page.fill('#p-from', '222'); await page.click('#plan-save');
    ok('already started: where', (await txt(page, '#today-body .box-line')) === 'Page 221 of 604, 36%, in Juz 12, Surah Hud.', await txt(page, '#today-body .box-line'));
    ok('already started: today', (await txt(page, '#today-body .big')) === 'Read 39 pages today: up to page 260.');
    // the group khatam from scratch: one person reads everything
    await page.click('#g-start');
    ok('group started, name focused', await page.evaluate(() => document.activeElement.id) === 'g-name');
    ok('group asks for people', (await txt(page, '#g-sum .sub-line')) === 'Add the people who will read, then tap "Share the juz out evenly".');
    ok('share hidden with nobody', !(await vis(page, '#g-share')));
    await page.fill('#g-name', '  Me\n'); await page.click('#g-add-btn');
    await page.click('#g-share');
    ok('one person reads all 30', (await txt(page, '#g-msg')).startsWith('Shared out: all 30 juz.') && (await person(page, 'Me').locator('.badge').textContent()) === '0 of 30 read');
    await ctx.close();

    // ---------- 13. corrupt and damaged storage ----------
    ({ ctx, page } = await newPage({}, '{broken'));
    ok('corrupt state starts fresh with a note', (await txt(page, '#set-msg')).startsWith('The saved reading could not be read') && await vis(page, '#plan'));
    await ctx.close();
    ({ ctx, page } = await newPage({}, JSON.stringify({ v: 1, total: 604, plan: { start: 'x' } })));
    ok('invalid state starts fresh', await vis(page, '#plan') && !(await vis(page, '#today')));
    await ctx.close();

    // ---------- 14. layout at every width, dark and light ----------
    const WIDTHS = [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920];
    for (const scheme of ['dark', 'light']) {
        for (const seed of [MONTH, undefined]) {
            ({ ctx, page } = await newPage({ colorScheme: scheme, viewport: { width: 1280, height: 900 } }, seed));
            if (seed) { await page.click('#hist-btn'); await page.click('#g-assign-open'); }
            for (const w of WIDTHS) {
                await page.setViewportSize({ width: w, height: w < 600 ? 844 : 900 });
                const tag = scheme + (seed ? ' filled ' : ' empty ') + w + ': ';
                ok(tag + 'no horizontal scroll', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
                const out = await page.evaluate(() => [...document.querySelectorAll('main *')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1); }).map(e => e.id || e.className).slice(0, 5));
                ok(tag + 'nothing sticks out', !out.length, out);
                for (const pos of [0, 0.5, 1]) {
                    await page.evaluate(p => scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * p), pos);
                    const o = await page.evaluate(() => { const bad = []; document.querySelectorAll('main, .col-main, .col-side').forEach(h => { const k = [...h.children].filter(c => c.getBoundingClientRect().height > 4 && getComputedStyle(c).display !== 'none'); for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { const a = k[i].getBoundingClientRect(), b = k[j].getBoundingClientRect(); if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 4 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 4) bad.push(k[i].className + '/' + k[j].className); } }); return bad; });
                    ok(tag + 'no overlap at ' + pos, !o.length, o);
                }
                if (w >= 900 && seed) ok(tag + 'two columns', await page.evaluate(() => document.querySelector('.col-side').getBoundingClientRect().left > document.querySelector('.col-main').getBoundingClientRect().right - 1));
            }
            await ctx.close();
        }
    }
    // phones with every optional part open: nothing overlaps, placeholders and button text fit
    for (const w of [320, 360, 390]) {
        ({ ctx, page } = await newPage({ viewport: { width: w, height: 844 } }, MONTH));
        await page.click('#hist-btn'); await page.click('#l-day-open'); await page.click('#g-assign-open');
        await person(page, 'Omar').getByRole('button', { name: 'Rename Omar' }).click();
        await page.click('#change-plan'); await page.click('#o-from'); await page.selectOption('#p-copy', 'custom');
        for (const name of ['date', 'pace']) {
            if (name === 'pace') await page.click('label[for=m-pace]');
            const c = await page.evaluate(() => { const k = [...document.querySelectorAll('input:not([type=hidden]):not([type=radio]):not([type=file]), select, button, textarea, .seg label')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }); const bad = [];
                for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { if (k[i].contains(k[j]) || k[j].contains(k[i]) || (k[i].htmlFor && k[i].htmlFor === k[j].id) || (k[j].htmlFor && k[j].htmlFor === k[i].id)) continue; const a = k[i].getBoundingClientRect(), b = k[j].getBoundingClientRect(); if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2) bad.push((k[i].id || k[i].className || k[i].textContent) + ' / ' + (k[j].id || k[j].className || k[j].textContent)); }
                return bad; });
            ok(w + ' ' + name + ': no controls overlap', !c.length, c);
            ok(w + ' ' + name + ': no horizontal scroll', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
            const cut = await page.evaluate(() => [...document.querySelectorAll('input[placeholder]')].filter(e => e.offsetWidth > 0).filter(e => { const c = document.createElement('canvas').getContext('2d'); const cs = getComputedStyle(e); c.font = cs.fontSize + ' ' + cs.fontFamily; return c.measureText(e.placeholder).width > e.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) + 1; }).map(e => e.id + ':' + e.placeholder));
            ok(w + ' ' + name + ': placeholders fit', !cut.length, cut);
            const clip = await page.evaluate(() => [...document.querySelectorAll('.seg label, .mini, .primary, .secondary, .chip, .jchip, select')].filter(e => e.offsetWidth > 0 && e.scrollWidth > e.clientWidth + 1).map(e => e.id || e.textContent));
            ok(w + ' ' + name + ': no clipped text', !clip.length, clip);
            const opts = await page.evaluate(() => { const e = document.querySelector('#p-copy'), c = document.createElement('canvas').getContext('2d'), cs = getComputedStyle(e); c.font = cs.fontSize + ' ' + cs.fontFamily; return [...e.options].filter(o => c.measureText(o.text).width > e.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 24).map(o => o.text); });
            ok(w + ' ' + name + ': copy choices fit the box', !opts.length, opts);
        }
        await ctx.close();
    }

    // ---------- 15. screenshots ----------
    if (SHOTS) {
        ({ ctx, page } = await newPage({ viewport: { width: 1280, height: 900 } }, MONTH));
        await page.screenshot({ path: path.join(__dirname, 'screenshots/desktop.png'), fullPage: false });
        await ctx.close();
        ({ ctx, page } = await newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }, MONTH));
        await page.screenshot({ path: path.join(__dirname, 'screenshots/phone.png'), fullPage: false });
        await ctx.close();
    }

    // every file the page asked for came back
    ['style.css', 'core.js', 'script.js'].forEach(f => ok('requested ' + f, [...requested].some(u => u.endsWith('/' + SLUG + '/' + f))));
    ({ ctx, page } = await newPage());
    for (const f of ['manifest.webmanifest', 'favicon.svg', 'sw.js', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'screenshots/desktop.png', 'screenshots/phone.png', '../help.js', '../theme.js'])
        ok('file returns 200: ' + f, await page.evaluate(u => fetch(u, { cache: 'no-store' }).then(r => r.status), f) === 200);
    const man = await page.evaluate(() => fetch('manifest.webmanifest').then(r => r.json()));
    ok('manifest icons', man.icons.length === 2 && man.theme_color === '#087f5b');
    // the hub card opens the app
    await page.goto(base + '/', { waitUntil: 'networkidle' });
    const card = page.locator('a[href*="' + SLUG + '"]').first();
    ok('hub lists the app', await card.count() === 1);
    if (await card.count()) { await card.click(); await page.waitForLoadState('networkidle'); ok('hub card opens the app', page.url().includes(SLUG)); }
    await ctx.close();
    ok('help.js and theme.js requested', [...requested].some(u => u.endsWith('/help.js')) && [...requested].some(u => u.endsWith('/theme.js')));
    ok('no console errors', !errors.length, errors);
    ok('no failed requests', !failed.length, failed);
    await browser.close(); if (srv) srv.close();
    console.log(pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})();
