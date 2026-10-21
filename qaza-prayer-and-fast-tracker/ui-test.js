// Full page test with Playwright. Run from the repo root or this folder: node ui-test.js
//   BASE=https://umar8092.github.io/apps node ui-test.js   tests the live site
//   node ui-test.js --shots                                 also saves screenshots/desktop.png and phone.png
// "Today" is fixed to Wed 21 Oct 2026 in Pakistan time so every answer can be checked exactly.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.resolve(__dirname, '..'), SLUG = 'qaza-prayer-and-fast-tracker', KEY = SLUG + '.state';
const SHOTS = process.argv.includes('--shots');
const NOW = new Date('2026-10-21T15:00:00+05:00');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; if (!cond) console.log('FAIL ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra).slice(0, 400) : '')); };

function serve() {
    const types = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml', png: 'image/png', webmanifest: 'application/manifest+json' };
    return new Promise(res => { const s = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0].replace(/^\/apps/, '')); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': types[f.split('.').pop()] || 'application/octet-stream' }); r.end(fs.readFileSync(f)); }).listen(0, () => res(s)); });
}

// Ahmed from the README: 15 Mar 2008 to 31 Dec 2019 (4,309 days), 2 days of prayers a day since 1 Oct (missed the 7th and the 14th),
// 1 of each so far today, Ramadan 2017 (6 days) and 2018 (7 days) with 3 fasts made up, and Ammi on the same phone.
const all = n => ({ fajr: n, dhuhr: n, asr: n, maghrib: n, isha: n, witr: n });
const LOG = {};
for (let i = 1; i <= 20; i++) { const d = '2026-10-' + String(i).padStart(2, '0'); if (i !== 7 && i !== 14) LOG[d] = all(2); }
LOG['2026-10-21'] = all(1); LOG['2026-10-19'].fast = 2; LOG['2026-10-20'].fast = 1;
const person = (id, name, extra) => Object.assign({ id, name, witr: true, setup: null, owed: {}, ramadans: [], fastsExtra: 0, perDay: 1, fastsPerWeek: 2, log: {} }, extra);
const AHMED = { v: 1, active: 1, nextId: 3, rid: 3, people: [
    person(1, 'Ahmed', { setup: { mode: 'dates', from: '2008-03-15', to: '2019-12-31', leaveOut: 0 }, owed: all(4309), perDay: 2, log: LOG, ramadans: [{ id: 1, year: '2017', days: 6 }, { id: 2, year: '2018', days: 7 }] }),
    person(2, 'Ammi', { setup: { mode: 'numbers' }, witr: false, owed: Object.assign(all(300), { witr: 0 }), log: { '2026-10-20': { fajr: 3, dhuhr: 3 } } })] };

(async () => {
    let srv, base = process.env.BASE;
    if (!base) { srv = await serve(); base = 'http://localhost:' + srv.address().port + '/apps'; }
    const URL = base + '/' + SLUG + '/';
    const browser = await chromium.launch();
    const errors = [], failed = [], requested = new Set();
    async function newPage(opts, seed, init) {
        const ctx = await browser.newContext(Object.assign({ viewport: { width: 390, height: 844 }, acceptDownloads: true, timezoneId: 'Asia/Karachi', colorScheme: 'dark', locale: 'en-GB' }, opts || {}));
        await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new globalThis.URL(base).origin });
        await ctx.route(/goatcounter\.com|gc\.zgo\.at/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
        if (seed !== undefined) await ctx.addInitScript(([k, v]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, v); sessionStorage.setItem('seeded', '1'); } }, [KEY, typeof seed === 'string' ? seed : JSON.stringify(seed)]);
        if (init) await ctx.addInitScript(init);
        const page = await ctx.newPage();
        await page.clock.setFixedTime(NOW);
        page.on('pageerror', e => errors.push(e.message));
        page.on('console', m => { if (m.type() === 'error' && page.url().includes(SLUG)) errors.push(m.text()); });
        page.on('request', r => { if (r.url().startsWith(base)) requested.add(r.url()); });
        page.on('response', r => { if (r.status() >= 400 && r.url().startsWith(base)) failed.push(r.status() + ' ' + r.url()); });
        await page.goto(URL, { waitUntil: 'networkidle' });
        return { ctx, page };
    }
    const txt = (page, sel) => page.$eval(sel, e => e.textContent.replace(/\s+/g, ' ').trim()).catch(() => null);
    const txts = (page, sel) => page.$$eval(sel, l => l.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
    const vis = (page, sel) => page.isVisible(sel);
    const saved = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
    const counter = (page, name) => page.locator('#counters > li', { has: page.locator('h3', { hasText: new RegExp('^' + name + '$') }) });
    const fmtJs = d => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()] + ' ' + d.getUTCFullYear();
    const plusDays = n => fmtJs(new Date(Date.UTC(2026, 9, 21 + n)));

    // ---------- 1. first use, worked out from dates ----------
    let { ctx, page } = await newPage();
    ok('first use: setup open', await vis(page, '#setup') && !(await vis(page, '#today')) && !(await vis(page, '#left')));
    ok('first use: heading', (await txt(page, '#setup-h')) === 'How many prayers do you owe?');
    ok('first use: name is Me, Witr ticked', (await page.inputValue('#s-name')) === 'Me' && await page.isChecked('#s-witr'));
    ok('optional fields hidden', !(await vis(page, '#w-age')) && !(await vis(page, '#w-leave')) && !(await vis(page, '#w-numbers')));
    ok('first use: history empty', await vis(page, '#hist-empty') && await vis(page, '#f-empty'));
    // blank submit
    await page.click('#setup-save');
    ok('blank first day error', (await txt(page, '#e-from')) === 'Pick the first day you missed.', await txt(page, '#e-from'));
    ok('nothing saved on error', !(await vis(page, '#today')));
    // age helper
    await page.click('#o-age');
    await page.fill('#s-birth', '1996-03-15'); await page.fill('#s-age', '12');
    ok('age sets the first day', (await page.inputValue('#s-from')) === '2008-03-15', await page.inputValue('#s-from'));
    ok('age hint', (await txt(page, '#h-age')) === 'First day missed set to Sat 15 Mar 2008.', await txt(page, '#h-age'));
    await page.fill('#s-age', 'abc');
    ok('bad age error', (await txt(page, '#e-age')).startsWith('Type the age'));
    await page.fill('#s-age', '40');
    ok('future birthday error', (await txt(page, '#e-age')) === 'That birthday has not come yet.');
    await page.fill('#s-age', '12');
    // future last day
    await page.fill('#s-to', '2026-10-25'); await page.click('#setup-save');
    ok('future last day error', (await txt(page, '#e-to')) === 'The last day cannot be in the future.');
    await page.fill('#s-to', '2007-01-01'); await page.click('#setup-save');
    ok('last before first error', (await txt(page, '#e-to')) === 'The last day must be on or after the first day.');
    await page.click('[data-to="-1"]');
    ok('Yesterday chip', (await page.inputValue('#s-to')) === '2026-10-20');
    await page.fill('#s-to', '2019-12-31');
    ok('preview 4,309 days', (await txt(page, '#preview')) === '4,309 days: 4,309 of each prayer, 25,854 prayers in all with Witr.', await txt(page, '#preview'));
    await page.click('#o-leave'); await page.fill('#s-leave', '700');
    ok('preview leave out', (await txt(page, '#preview')) === '3,609 days (4,309 less 700 left out): 3,609 of each prayer, 21,654 prayers in all with Witr.', await txt(page, '#preview'));
    await page.fill('#s-leave', '5000'); await page.click('#setup-save');
    ok('leave out too many', (await txt(page, '#e-leave')).startsWith('You are leaving out 5,000 days, but there are only 4,309'), await txt(page, '#e-leave'));
    await page.fill('#s-leave', '1.5'); await page.click('#setup-save');
    ok('leave out decimal', (await txt(page, '#e-leave')).startsWith('Type the days'));
    await page.click('#o-leave');
    ok('closing leave out clears it', (await page.inputValue('#s-leave')) === '' && (await txt(page, '#preview')).startsWith('4,309 days:'));
    await page.uncheck('#s-witr');
    ok('preview without Witr', (await txt(page, '#preview')) === '4,309 days: 4,309 of each prayer, 21,545 prayers in all.');
    await page.check('#s-witr');
    await page.fill('#s-name', '  Ahmed\n\t ' + 'x'.repeat(60));
    await page.click('#setup-save');
    ok('saved: today and left shown', await vis(page, '#today') && await vis(page, '#left') && !(await vis(page, '#setup')));
    ok('long pasted name cut to 30', (await saved(page)).people[0].name.length <= 30 && (await saved(page)).people[0].name.startsWith('Ahmed x'), (await saved(page)).people[0].name);
    await page.click('#p-list .person button:has-text("Rename")');
    await page.fill('#p-list input', 'Ahmed'); await page.click('#p-list button:has-text("Save")');
    ok('renamed', (await saved(page)).people[0].name === 'Ahmed');
    ok('left 25,854', (await txt(page, '#left-body .big')) === '25,854 prayers left', await txt(page, '#left-body .big'));
    ok('six counters', (await page.locator('#counters > li').count()) === 6);
    ok('finish 1 a day: 4,309 days', (await txt(page, '#left-body .state')) === 'At 1 day of prayers a day you finish around ' + plusDays(4308) + ' (in about 11 years 10 months).', await txt(page, '#left-body .state'));
    ok('today line at start', (await txt(page, '#today-line')) === 'Today: 0 of 6 made up. 6 more reach your goal.', await txt(page, '#today-line'));

    // ---------- 2. counting, undo, goals ----------
    await counter(page, 'Fajr').locator('button:has-text("+1")').click();
    ok('Fajr +1', (await txt(page, '#counters > li:first-child .c-left')) === '4,308 left' && (await txt(page, '#counters > li:first-child .c-sub')) === 'Made up today: 1');
    ok('today 1 of 6', (await txt(page, '#today-line')).startsWith('Today: 1 of 6 made up. 5 more reach'));
    await page.click('#full');
    ok('full day adds 6', (await txt(page, '#today-msg')).startsWith('Added one of each: 6 prayers.') && (await txt(page, '#left-body .big')) === '25,847 prayers left');
    ok('goal reached', (await txt(page, '#today-line')) === 'Goal reached for today: 7 prayers made up.', await txt(page, '#today-line'));
    await page.click('#today-msg .undo');
    ok('undo full day', (await txt(page, '#left-body .big')) === '25,853 prayers left');
    await counter(page, 'Fajr').locator('button:has-text("−1")').click();
    ok('−1 takes back', (await txt(page, '#left-body .big')) === '25,854 prayers left' && (await txt(page, '#today-msg')).startsWith('Took back one Fajr.'));
    ok('−1 disabled at zero', await counter(page, 'Fajr').locator('button:has-text("−1")').isDisabled());
    await page.selectOption('#g-per', '2');
    ok('goal 2: of 12', (await txt(page, '#today-line')).startsWith('Today: 0 of 12'));
    ok('finish 2 a day: 2,155 days', (await txt(page, '#left-body .state')) === 'At 2 days of prayers a day you finish around ' + plusDays(2154) + ' (in about 5 years 11 months).', await txt(page, '#left-body .state'));
    await page.selectOption('#g-per', 'custom');
    ok('custom field shown', await vis(page, '#g-custom'));
    await page.fill('#g-custom', '0'); await page.click('#g-custom-btn');
    ok('custom 0 refused', (await txt(page, '#e-per')) === 'Type a number from 1 to 50.');
    await page.fill('#g-custom', '99'); await page.click('#g-custom-btn');
    ok('custom 99 refused', (await txt(page, '#e-per')) === 'Type a number from 1 to 50.');
    await page.fill('#g-custom', '4'); await page.click('#g-custom-btn');
    ok('custom 4 set', (await saved(page)).people[0].perDay === 4 && (await txt(page, '#today-line')).includes('of 24'));
    await page.reload({ waitUntil: 'networkidle' });
    ok('custom goal kept after reload', (await page.inputValue('#g-per')) === 'custom' && (await page.inputValue('#g-custom')) === '4');
    await page.selectOption('#g-per', '1');
    // another day
    await page.click('#day-open');
    ok('another day: yesterday', (await page.inputValue('#day')) === '2026-10-20' && (await txt(page, '#day-text')) === 'Counting for Tue 20 Oct 2026.');
    await counter(page, 'Asr').locator('button:has-text("+1")').click();
    ok('yesterday counted', (await txts(page, '#hist-list li:first-child span')).join('|') === 'Tue 20 Oct 2026|1 prayer|Asr 1', await txts(page, '#hist-list li:first-child span'));
    await page.fill('#day', '2026-10-30'); await page.dispatchEvent('#day', 'change');
    ok('future day refused, back to today', (await txt(page, '#day-text')) === 'Counting for today.');
    ok('streak 0 today', (await txt(page, '#today-line')) === 'Today: 0 of 6 made up. 6 more reach your goal.', await txt(page, '#today-line'));
    // keyboard: Tab to a +1 and press Enter
    await counter(page, 'Isha').locator('button:has-text("+1")').focus(); await page.keyboard.press('Enter');
    ok('keyboard +1', (await saved(page)).people[0].log['2026-10-21'].isha === 1);
    ok('focus stays on +1', await page.evaluate(() => document.activeElement.getAttribute('aria-label')) === 'Made up one Isha');

    // ---------- 3. change the totals ----------
    await page.click('#edit-totals');
    ok('edit: heading', (await txt(page, '#setup-h')) === 'Change the totals' && await vis(page, '#setup-cancel'));
    ok('edit: dates kept', (await page.inputValue('#s-from')) === '2008-03-15');
    await page.check('#m-numbers');
    ok('numbers prefilled', (await page.inputValue('#n-fajr')) === '4,309' && await vis(page, '#n-witr'));
    await page.fill('#n-isha', '0'); await page.click('#setup-save');
    ok('cannot go below made up', (await txt(page, '#e-num')).startsWith('You have already made up 1 Isha'), await txt(page, '#e-num'));
    await page.fill('#n-isha', 'lots'); await page.click('#setup-save');
    ok('text refused', (await txt(page, '#e-num')) === 'Type a whole number for Isha, such as 0 or 1,204.');
    await page.fill('#n-all', '1,500'); await page.click('#n-all-btn');
    ok('use for all', (await page.inputValue('#n-maghrib')) === '1,500');
    await page.fill('#n-fajr', '1200'); await page.click('#setup-save');
    ok('totals saved, made up kept', (await txts(page, '#left-body .left-list li:first-child span')).join('|') === 'Fajr|1,200 left of 1,200' && (await txt(page, '#left-body .big')) === '8,698 prayers left', [await txt(page, '#left-body .left-list li:first-child'), await txt(page, '#left-body .big')]);
    await page.click('#today-msg .undo');
    ok('undo totals', (await txt(page, '#left-body .big')) === '25,852 prayers left', await txt(page, '#left-body .big'));
    await page.click('#edit-totals'); await page.click('#setup-cancel');
    ok('cancel closes', !(await vis(page, '#setup')) && await vis(page, '#today'));
    await page.click('#edit-totals'); await page.uncheck('#s-witr'); await page.click('#setup-save');
    ok('Witr off: five counters', (await page.locator('#counters > li').count()) === 5 && !(await txt(page, '#full')).includes('Witr'));
    await page.click('#edit-totals'); await page.check('#s-witr'); await page.click('#setup-save');
    ok('Witr back', (await page.locator('#counters > li').count()) === 6 && (await txt(page, '#left-body .big')) === '25,852 prayers left');
    await page.click('#edit-totals'); await page.click('#clear-made');
    ok('clear made up, totals kept', (await txt(page, '#left-body .big')) === '25,854 prayers left' && await vis(page, '#hist-empty'));
    await page.click('#today-msg .undo');
    ok('undo clear', (await txt(page, '#left-body .big')) === '25,852 prayers left');

    // ---------- 4. fasts ----------
    await page.click('#ram-add');
    ok('Ramadan added with this year', (await page.inputValue('#ry-1')) === '2026' && (await page.inputValue('#rd-1')) === '1');
    await page.fill('#ry-1', '2017'); await page.dispatchEvent('#ry-1', 'change');
    await page.fill('#rd-1', '40'); await page.dispatchEvent('#rd-1', 'change');
    ok('40 days refused', (await txt(page, '#er-1')) === 'Type the days missed as a number from 1 to 30.');
    await page.fill('#rd-1', '6'); await page.dispatchEvent('#rd-1', 'change');
    ok('fasts 6 left', (await txt(page, '#f-left')) === '6 left of 6' && (await txt(page, '#ram-list h3')) === 'Ramadan 2017');
    await page.fill('#ry-1', '17'); await page.dispatchEvent('#ry-1', 'change');
    ok('2-digit year refused', (await txt(page, '#er-1')).startsWith('Type the year as 4 digits'));
    await page.fill('#ry-1', ''); await page.dispatchEvent('#ry-1', 'change');
    ok('year optional', (await txt(page, '#ram-list h3')) === 'Ramadan');
    await page.click('#f-plus'); await page.click('#f-plus');
    ok('two fasts made up', (await txt(page, '#f-left')) === '4 left of 6' && (await txt(page, '#f-finish')) === 'At 2 a week you finish around ' + plusDays(13) + ' (in 14 days).', await txt(page, '#f-finish'));
    await page.selectOption('#f-week', '7');
    ok('every day', (await txt(page, '#f-finish')) === 'At one fast every day you finish around ' + plusDays(3) + ' (in 4 days).', await txt(page, '#f-finish'));
    await page.fill('#rd-1', '1'); await page.dispatchEvent('#rd-1', 'change');
    ok('days below made up refused', (await txt(page, '#er-1')).startsWith('You have already made up 2 fasts'));
    await page.click('#ram-list button:has-text("Remove")');
    ok('remove refused with fasts made up', (await txt(page, '#f-msg')).startsWith('You have already made up 2 fasts'));
    await page.click('#f-minus'); await page.click('#f-minus');
    ok('−1 fast disabled at zero', await page.isDisabled('#f-minus'));
    await page.click('#ram-list button:has-text("Remove")');
    ok('removed Ramadan', (await page.locator('#ram-list > li').count()) === 0 && !(await vis(page, '#fast-count')));
    await page.click('#f-msg .undo');
    ok('undo remove', (await page.locator('#ram-list > li').count()) === 1);

    // ---------- 5. share, backup ----------
    await page.click('#copy');
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    ok('copy summary', clip.startsWith('Qaza made up: Ahmed (Wed 21 Oct 2026)') && clip.includes('Prayers: 2 of 25,854 made up, 25,852 left') && clip.includes('Fasts: 0 of 6 made up, 6 left'), clip);
    const mail = await page.getAttribute('#mail', 'href');
    ok('email link with no address', mail.startsWith('mailto:?subject=Qaza%20made%20up%3A%20Ahmed&body=Qaza%20made%20up'));
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#backup')]);
    const file = path.join(os.tmpdir(), 'qaza-backup.json'); await dl.saveAs(file);
    ok('backup file name', dl.suggestedFilename() === 'qaza-tracker-backup-2026-10-21.json');
    await page.click('#wipe');
    ok('delete everything', await vis(page, '#setup') && (await txt(page, '#setup-h')) === 'How many prayers do you owe?' && (await page.locator('#ram-list > li').count()) === 0);
    await page.click('#set-msg .undo');
    ok('undo delete everything', (await txt(page, '#left-body .big')) === '25,852 prayers left');
    await page.click('#wipe');
    await page.setInputFiles('#restore-file', file);
    await page.waitForTimeout(300);
    ok('restore backup', (await txt(page, '#left-body .big')) === '25,852 prayers left' && (await txt(page, '#set-msg')).startsWith('Backup restored: 1 person.'));
    const badFile = path.join(os.tmpdir(), 'qaza-bad.json'); fs.writeFileSync(badFile, '{"hello":1}');
    await page.setInputFiles('#restore-file', badFile); await page.waitForTimeout(300);
    ok('bad backup refused', (await txt(page, '#set-msg')) === 'That file is not a backup from this app. Nothing was changed.' && (await txt(page, '#left-body .big')) === '25,852 prayers left');

    // ---------- 6. people ----------
    ok('one person: only Rename', (await txts(page, '#p-list .box-btns button')).join() === 'Rename');
    await page.click('#p-open'); await page.click('#p-add-btn');
    ok('blank name refused', (await txt(page, '#e-pname')) === 'Type their name.');
    await page.fill('#p-name', 'ahmed'); await page.click('#p-add-btn');
    ok('duplicate name refused', (await txt(page, '#e-pname')).startsWith('ahmed is already on the list'));
    await page.fill('#p-name', 'Ammi'); await page.click('#p-add-btn');
    ok('new person opens setup', await vis(page, '#setup') && (await page.inputValue('#s-name')) === 'Ammi' && (await txt(page, '#setup-h')) === 'How many prayers do you owe?');
    await page.check('#m-numbers'); await page.uncheck('#s-witr');
    ok('Witr box hidden when off', !(await vis(page, '#n-witr')));
    await page.fill('#n-all', '300'); await page.click('#n-all-btn'); await page.click('#setup-save');
    ok('Ammi saved', (await txt(page, '#left-h')) === 'Still to make up: Ammi' && (await txt(page, '#left-body .big')) === '1,500 prayers left');
    ok('Ammi has her own fasts', (await page.locator('#ram-list > li').count()) === 0);
    ok('two boxes', (await page.locator('#p-list > li').count()) === 2 && (await txt(page, '#p-list > li:first-child .box-sub')) === '25,852 prayers left, 6 fasts left');
    await page.click('#p-list > li:first-child button:has-text("Open")');
    ok('switch back to Ahmed', (await txt(page, '#left-h')) === 'Still to make up: Ahmed' && (await page.locator('#ram-list > li').count()) === 1);
    await page.click('#p-list > li:nth-child(2) button:has-text("Remove")');
    ok('removed Ammi', (await page.locator('#p-list > li').count()) === 1);
    await page.click('#p-msg .undo');
    ok('undo remove person', (await page.locator('#p-list > li').count()) === 2);
    await page.reload({ waitUntil: 'networkidle' });
    ok('reload keeps everything', (await page.locator('#p-list > li').count()) === 2 && (await txt(page, '#left-body .big')) === '25,852 prayers left');
    await ctx.close();

    // ---------- 7. Ahmed's month, seeded: the exact answers in the README ----------
    ({ ctx, page } = await newPage({ viewport: { width: 1280, height: 900 } }, AHMED));
    ok('Ahmed left', (await txt(page, '#left-body .big')) === '25,632 prayers left' && (await txt(page, '#left-body .sub-line')) === 'of 25,854 · 222 made up (0.8%)', await txt(page, '#left-body .sub-line'));
    ok('Ahmed finish', (await txt(page, '#left-body .state')) === 'At 2 days of prayers a day you finish around Thu 26 Aug 2032 (in about 5 years 10 months).', await txt(page, '#left-body .state'));
    ok('Ahmed pace', (await txts(page, '#left-body .sub-line'))[1] === 'Your pace since you started (21 days): 222 prayers, about 1.8 days of prayers a day. At that pace: around June 2033.', (await txts(page, '#left-body .sub-line'))[1]);
    ok('Ahmed today', (await txt(page, '#today-line')) === 'Today: 6 of 12 made up. 6 more reach your goal. Streak: 6 days.', await txt(page, '#today-line'));
    ok('Ahmed fasts', (await txt(page, '#f-left')) === '10 left of 13' && (await txt(page, '#f-finish')) === 'At 2 a week you finish around Tue 24 Nov 2026 (in 35 days).');
    ok('history 10 shown, more', (await page.locator('#hist-list > li').count()) === 10 && (await txt(page, '#hist-more')) === 'Show all 19 days');
    await page.click('#hist-more');
    ok('history all', (await page.locator('#hist-list > li').count()) === 19);
    await page.click('#full');
    ok('goal reached, streak 7', (await txt(page, '#today-line')) === 'Goal reached for today: 12 prayers made up. 7 days in a row.', await txt(page, '#today-line'));
    // the theme switch
    const before = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await page.click('.theme-toggle');
    ok('theme switch', (await page.evaluate(() => document.documentElement.dataset.theme)) === 'light' && before !== await page.evaluate(() => getComputedStyle(document.body).backgroundColor));
    await page.click('.theme-toggle');
    await ctx.close();

    // all made up
    ({ ctx, page } = await newPage({}, { v: 1, active: 1, nextId: 2, rid: 1, people: [person(1, 'Me', { setup: { mode: 'numbers' }, owed: Object.assign(all(0), { fajr: 1 }) })] }));
    await counter(page, 'Fajr').locator('button:has-text("+1")').click();
    ok('all done message', (await txt(page, '#today-line')) === 'All your qaza prayers are made up. Alhamdulillah!' && !(await vis(page, '#full')) && await counter(page, 'Fajr').locator('button:has-text("+1")').isDisabled());
    ok('done shown', (await txt(page, '#counters > li:first-child .c-left')) === 'Done ✓');
    await ctx.close();

    // corrupt saved state, and storage blocked
    ({ ctx, page } = await newPage({}, 'garbage{'));
    ok('corrupt state: fresh start', await vis(page, '#setup') && (await txt(page, '#set-msg')) === 'The saved counts could not be read, so the app started fresh.');
    await ctx.close();
    ({ ctx, page } = await newPage({}, { people: [{ id: 'x' }] }));
    ok('invalid state: fresh start', await vis(page, '#setup'));
    await ctx.close();
    ({ ctx, page } = await newPage({}, undefined, () => { const t = () => { throw new Error('blocked'); }; Object.defineProperty(window, 'localStorage', { get: t }); }));
    ok('storage blocked warning', await vis(page, '#storage-warn'));
    await ctx.close();

    // ---------- 8. layout at every width, filled and cleared ----------
    for (const scheme of ['dark', 'light']) for (const st of [AHMED, null]) {
        ({ ctx, page } = await newPage({ colorScheme: scheme }, st || undefined));
        for (const w of [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920]) {
            await page.setViewportSize({ width: w, height: 900 });
            const tag = scheme + ' ' + w + (st ? ' filled' : ' empty');
            ok('no side scroll ' + tag, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
            if (w >= 900) for (const pos of [0, 0.5, 1]) {
                await page.evaluate(p => scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * p), pos);
                const o = await page.evaluate(() => { const r = []; document.querySelectorAll('main, .app, .col-main, .col-side').forEach(par => { const k = [...par.children].filter(e => e.offsetParent && getComputedStyle(e).display !== 'contents').map(e => e.getBoundingClientRect()); for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { const a = k[i], b = k[j]; if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2) r.push(par.className + ' ' + i + '/' + j); } }); return r; });
                ok('no overlap ' + tag + ' at ' + pos, !o.length, o);
            }
            if (w <= 390) {
                // every optional field open, then no control may overlap another and every placeholder must fit
                await page.evaluate(() => { document.querySelectorAll('#w-age, #w-leave, #w-per, #w-day, #p-add, #w-numbers, #setup').forEach(e => { e.hidden = false; }); });
                const c = await page.evaluate(() => { const els = [...document.querySelectorAll('main input:not([type=radio]):not([type=checkbox]):not([type=file]), main select, main button, main a.secondary')].filter(e => e.offsetParent).map(e => [e.id || e.textContent.trim().slice(0, 15), e.getBoundingClientRect()]); const r = []; for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) { const a = els[i][1], b = els[j][1]; if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) r.push(els[i][0] + ' x ' + els[j][0]); } return r; });
                ok('controls apart ' + tag, !c.length, c);
                const ph = await page.evaluate(() => { const cv = document.createElement('canvas').getContext('2d'); return [...document.querySelectorAll('main input[placeholder]')].filter(e => e.offsetParent).filter(e => { const cs = getComputedStyle(e); cv.font = cs.fontSize + ' ' + cs.fontFamily; return cv.measureText(e.placeholder).width > e.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) + 1; }).map(e => e.id + ':' + e.placeholder); });
                ok('placeholders fit ' + tag, !ph.length, ph);
                const sel = await page.evaluate(() => { const cv = document.createElement('canvas').getContext('2d'); return [...document.querySelectorAll('main select')].filter(e => e.offsetParent).filter(e => { const cs = getComputedStyle(e); cv.font = cs.fontSize + ' ' + cs.fontFamily; return cv.measureText(e.options[e.selectedIndex].text).width > e.clientWidth - parseFloat(cs.paddingLeft) - 24; }).map(e => e.id); });
                ok('select text fits ' + tag, !sel.length, sel);
                await page.reload({ waitUntil: 'networkidle' });
            }
        }
        await ctx.close();
    }

    // ---------- 9. help ----------
    ({ ctx, page } = await newPage({}, AHMED));
    for (const w of [320, 390, 820, 1280]) {
        await page.setViewportSize({ width: w, height: 800 });
        await page.click('.help-btn');
        const d = page.locator('dialog.help'), r = await d.boundingBox();
        ok('help opens inside ' + w, await d.evaluate(e => e.open) && r.x >= 0 && r.x + r.width <= w + 1 && r.y >= 0 && r.y + r.height <= 801 && (await d.textContent()).includes('How to use Qaza Prayer and Fast Tracker'));
        await page.keyboard.press('Escape'); ok('Escape closes ' + w, !(await d.evaluate(e => e.open)));
        await page.click('.help-btn'); await page.click('.help-close'); ok('Got it closes ' + w, !(await d.evaluate(e => e.open)));
        const tb = await page.evaluate(() => [...document.querySelectorAll('.topbar a, .topbar button')].map(e => e.getBoundingClientRect()).map(r => [r.top, r.bottom, r.left, r.right]));
        let bad = false; for (let i = 0; i < tb.length; i++) for (let j = i + 1; j < tb.length; j++) if (Math.min(tb[i][3], tb[j][3]) - Math.max(tb[i][2], tb[j][2]) > 1 && Math.min(tb[i][1], tb[j][1]) - Math.max(tb[i][0], tb[j][0]) > 1) bad = true;
        ok('top bar apart ' + w, !bad);
    }
    await ctx.close();

    // ---------- 10. screenshots ----------
    if (SHOTS) {
        ({ ctx, page } = await newPage({ viewport: { width: 1280, height: 900 } }, AHMED));
        await page.screenshot({ path: path.join(__dirname, 'screenshots/desktop.png'), fullPage: false, clip: { x: 0, y: 0, width: 1280, height: 1180 } }).catch(async () => page.screenshot({ path: path.join(__dirname, 'screenshots/desktop.png') }));
        await ctx.close();
        ({ ctx, page } = await newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }, AHMED));
        await page.screenshot({ path: path.join(__dirname, 'screenshots/phone.png'), clip: { x: 0, y: 0, width: 390, height: 1500 } });
        await ctx.close();
    }

    // every file the app needs answers 200
    for (const f of ['favicon.svg', 'manifest.webmanifest', 'sw.js', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', '../help.js', '../theme.js', 'core.js', 'script.js', 'style.css', 'screenshots/desktop.png', 'screenshots/phone.png']) {
        const r = await (await browser.newContext()).request.get(URL + f); ok('200 for ' + f, r.status() === 200, r.status());
    }
    ok('page loaded its scripts', ['core.js', 'script.js', 'style.css'].every(f => [...requested].some(u => u.endsWith('/' + SLUG + '/' + f))));
    ok('no failed requests', !failed.length, failed);
    ok('no console errors', !errors.length, errors);
    await browser.close(); if (srv) srv.close();
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})();
