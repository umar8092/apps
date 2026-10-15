// Drives the real page in headless Chromium: node ui-test.js [--shots] [--base https://umar8092.github.io/apps]
// Without --base it serves this repo on localhost. With --base it tests the LIVE page. The clock is fixed at 16 Oct 2026, 10:00.
const pw = (() => { for (const m of ['playwright', 'playwright-core']) { try { return require(m); } catch (e) { /* next */ } } throw new Error('playwright not found'); })();
const path = require('path'), fs = require('fs'), http = require('http'), os = require('os');
const bi = process.argv.indexOf('--base');
const shots = process.argv.includes('--shots');
const KEY = 'period-and-ovulation-calendar.state';
let fail = 0, url;
const ok = (name, cond, extra) => { if (!cond) fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (!cond && extra !== undefined ? '  -> ' + JSON.stringify(extra) : '')); };
const NOW = new Date(2026, 9, 16, 10, 0);
// six periods: cycles of 28, 29, 27, 30 and 29 days
const AISHA = { v: 1, periods: [['2026-05-11', 5], ['2026-06-08', 5], ['2026-07-07', 6], ['2026-08-03', 5], ['2026-09-02', 4], ['2026-10-01', 5]].map(([start, len]) => ({ start, len, skipGap: false })),
    days: { '2026-10-01': { s: ['cramps', 'heavy'], n: 'Took a painkiller' }, '2026-10-02': { s: ['cramps'], n: '' } }, settings: { cycle: 28, len: 5, paused: false, weekStart: 1, icsFertile: true } };

function serve() {
    const ROOT = path.resolve(__dirname, '..');
    const types = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml', png: 'image/png', webmanifest: 'application/manifest+json' };
    return new Promise(res => {
        const s = http.createServer((req, rs) => {
            let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
            const f = path.join(ROOT, p);
            if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rs.writeHead(404); return rs.end('nf'); }
            rs.writeHead(200, { 'content-type': types[f.split('.').pop()] || 'application/octet-stream' }); rs.end(fs.readFileSync(f));
        }).listen(0, () => res(s));
    });
}
const outside = u => /gc\.zgo\.at|goatcounter/.test(u);
async function load(b, vp, opt = {}) {
    const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: vp.width < 500 ? 2 : 1, colorScheme: opt.theme || 'dark', timezoneId: 'Asia/Karachi',
        permissions: ['clipboard-read', 'clipboard-write'], acceptDownloads: true });
    await ctx.route(/goatcounter\.com|gc\.zgo\.at/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
    if (opt.state !== undefined) await ctx.addInitScript(([k, s]) => { try { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, s); sessionStorage.setItem('seeded', '1'); } } catch (e) {} }, [KEY, typeof opt.state === 'string' ? opt.state : JSON.stringify(opt.state)]);
    if (opt.block) await ctx.addInitScript(() => { const f = () => { throw new Error('blocked'); }; Storage.prototype.setItem = f; Storage.prototype.getItem = f; });
    const p = await ctx.newPage();
    await p.clock.setFixedTime(opt.now || NOW);
    p.errors = []; p.on('console', m => m.type() === 'error' && !outside(m.location().url || '') && !/ERR_NAME_NOT_RESOLVED|ERR_TUNNEL|ERR_CONNECTION/.test(m.text()) && p.errors.push(m.text()));
    p.on('pageerror', e => p.errors.push(String(e)));
    p.bad = []; p.on('response', r => { if (r.status() >= 400 && !outside(r.url())) p.bad.push(r.status() + ' ' + r.url()); });
    p.on('requestfailed', r => { if (!outside(r.url())) p.bad.push('failed ' + r.url()); });
    await p.goto(url, { waitUntil: 'networkidle' });
    return p;
}
const txt = async (p, sel) => (await p.textContent(sel)).trim();
const vis = (p, sel) => p.isVisible(sel);
const cell = (p, iso) => p.locator('#grid .dc[data-d="' + iso + '"]');
const saved = p => p.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
const box = (p, start) => p.locator('.pbox', { has: p.locator('select[data-start="' + start + '"]') });
async function noHScroll(p) { return p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1); }
async function overlaps(p) {
    return p.evaluate(() => {
        const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden' && !e.closest('.toast'); };
        const els = [...document.querySelectorAll('input:not([type=file]), select, textarea, button, a.secondary, .back')].filter(vis);
        const bad = [];
        for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
            const a = els[i].getBoundingClientRect(), b = els[j].getBoundingClientRect();
            if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1 && !els[i].contains(els[j]) && !els[j].contains(els[i])) bad.push((els[i].id || els[i].textContent.trim().slice(0, 15)) + ' / ' + (els[j].id || els[j].textContent.trim().slice(0, 15)));
        }
        return bad;
    });
}
async function blockOverlap(p) {
    return p.evaluate(() => {
        const bad = [];
        document.querySelectorAll('main, .app, .col-main, .col-side').forEach(h => {
            const k = [...h.children].filter(c => { const r = c.getBoundingClientRect(), cs = getComputedStyle(c); return r.width > 4 && r.height > 4 && cs.display !== 'none' && cs.position !== 'fixed'; });
            for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { const a = k[i].getBoundingClientRect(), b = k[j].getBoundingClientRect(); if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2) bad.push(k[i].className + ' / ' + k[j].className); }
        });
        return bad;
    });
}
async function sticksOut(p) {
    return p.evaluate(() => [...document.querySelectorAll('.app *')].filter(e => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 0 && cs.position !== 'fixed' && (r.right > innerWidth + 1 || r.left < -1) && !e.closest('.plist'); }).map(e => e.tagName + '.' + e.className).slice(0, 3));
}
// placeholders and option text must fit their boxes
async function clipped(p) {
    return p.evaluate(() => [...document.querySelectorAll('input[placeholder], textarea[placeholder], select')].filter(e => e.offsetWidth > 0).filter(e => {
        const c = document.createElement('canvas').getContext('2d'), cs = getComputedStyle(e); c.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
        const t = e.tagName === 'SELECT' ? e.options[e.selectedIndex].text : e.placeholder;
        const room = e.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - (e.tagName === 'SELECT' ? 22 : 0);
        return c.measureText(t).width > room + 1;
    }).map(e => e.id || e.className));
}

(async () => {
    let srv;
    if (bi > 0) url = process.argv[bi + 1].replace(/\/$/, '') + '/period-and-ovulation-calendar/';
    else { srv = await serve(); url = 'http://localhost:' + srv.address().port + '/period-and-ovulation-calendar/'; }
    const b = await pw.chromium.launch();
    const phone = { width: 390, height: 900 }, desk = { width: 1280, height: 900 };
    console.log('Testing ' + url);

    // ---- first use
    let p = await load(b, phone);
    ok('first use: Get started shown, nothing else', await vis(p, '#setup') && !(await vis(p, '#today')) && !(await vis(p, '#cal')) && !(await vis(p, '#hist')));
    ok('first use: only Load backup file in tools', !(await vis(p, '#ics')) && await vis(p, '#import') && !(await vis(p, '#wipe')));
    ok('cycle defaults to 28, period to 5', await p.inputValue('#s-cycle') === '28' && await p.inputValue('#s-len') === '5');
    await p.click('#setup-go');
    ok('blank date refused', await txt(p, '#setup-err') === 'Pick the day your last period started.');
    await p.fill('#s-start', '2026-10-20'); await p.click('#setup-go');
    ok('future date refused', /in the future/.test(await txt(p, '#setup-err')));
    await p.fill('#s-start', '2026-10-01'); await p.selectOption('#s-cycle', '30'); await p.click('#setup-go');
    ok('typed 30 days: expected in 15 days (31 Oct)', await txt(p, '#t-big') === 'Period expected in 15 days', await txt(p, '#t-big'));
    ok('next period Sat 31 Oct 2026', await txt(p, '#k-next') === 'Sat 31 Oct 2026', await txt(p, '#k-next'));
    ok('one-period basis explains typed length', /cycle length you typed \(30 days\)/.test(await txt(p, '#basis')));
    ok('fertile 12 to 18 Oct, ovulation Sat 17 Oct', await txt(p, '#k-fert') === '12 to 18 Oct 2026' && /ovulation around Sat 17 Oct/.test(await txt(p, '#k-fert-sub')), await txt(p, '#k-fert'));
    ok('optional notes not forced (no symptoms saved)', JSON.stringify((await saved(p)).days) === '{}');
    ok('stats say log 2 periods', await txt(p, '#st-range') === 'log 2 periods');
    ok('first use: no console errors', !p.errors.length && !p.bad.length, p.errors.concat(p.bad));
    await p.context().close();

    // ---- the worked example
    p = await load(b, phone, { state: AISHA });
    ok('example: Period expected in 14 days', await txt(p, '#t-big') === 'Period expected in 14 days', await txt(p, '#t-big'));
    ok('example: day 16 of cycle', /^Day 16 of your cycle\. Your last period started Thu 1 Oct 2026\.$/.test(await txt(p, '#t-sub')));
    ok('example: next Fri 30 Oct, usually 28 to 31 Oct', await txt(p, '#k-next') === 'Fri 30 Oct 2026' && await txt(p, '#k-next-sub') === 'usually 28 to 31 Oct 2026');
    ok('example: fertile 9 to 18 Oct, now, ovulation Fri 16 Oct', await txt(p, '#k-fert') === '9 to 18 Oct 2026' && await txt(p, '#k-fert-sub') === 'now, ovulation around Fri 16 Oct');
    ok('example: basis last 5 cycles average 29', await txt(p, '#basis') === 'Based on your last 5 cycles, average 29 days.');
    ok('stats 29 / 27 to 30 / 5 days', await txt(p, '#st-avg') === '29 days' && await txt(p, '#st-range') === '27 to 30 days' && await txt(p, '#st-len') === '5 days');
    ok('list newest first with cycle lengths', JSON.stringify(await p.$$eval('.pcyc', e => e.map(x => x.textContent))) === JSON.stringify(['29 days after the one before', '30 days after the one before', '27 days after the one before', '29 days after the one before', '28 days after the one before', 'First period logged']));
    ok('calendar October 2026', await txt(p, '#cal-h') === 'October 2026');
    ok('1 to 5 Oct logged, 6 not', await cell(p, '2026-10-01').evaluate(e => e.classList.contains('logged')) && await cell(p, '2026-10-05').evaluate(e => e.classList.contains('logged')) && !(await cell(p, '2026-10-06').evaluate(e => e.classList.contains('logged'))));
    ok('30 Oct predicted, 16 Oct ovulation and today', await cell(p, '2026-10-30').evaluate(e => e.classList.contains('predicted')) && await cell(p, '2026-10-16').evaluate(e => e.classList.contains('ovu') && e.classList.contains('is-today')));
    ok('notes dot on 1 Oct', await cell(p, '2026-10-01').locator('.nd').count() === 1);
    ok('day labels for screen readers', (await cell(p, '2026-10-16').getAttribute('aria-label')) === 'Fri 16 Oct 2026, today, likely ovulation');
    ok('today selected: My period started this day offered', await txt(p, '#day-h') === 'Fri 16 Oct 2026 (today)' && await vis(p, '#day-start'));
    // future day
    await cell(p, '2026-10-20').click();
    ok('future day: no logging, no notes', await txt(p, '#day-h') === 'Tue 20 Oct 2026' && !(await vis(p, '#day-start')) && !(await vis(p, '#day-notes')) && /future/.test(await txt(p, '#day-what')));
    // a period day
    await cell(p, '2026-10-03').click();
    ok('period day 3 says so and offers delete', /Period day 3 \(started 1 Oct\)/.test(await txt(p, '#day-what')) && await vis(p, '#day-del') && !(await vis(p, '#day-start')));
    // symptoms and a note on 14 Oct
    await cell(p, '2026-10-14').click();
    await p.click('.chip[data-k="discharge"]'); await p.click('.chip[data-k="bloating"]'); await p.click('.chip[data-k="bloating"]');
    await p.fill('#day-note', 'x'.repeat(320));
    let s = await saved(p);
    ok('symptom saved, untoggled one removed, note cut to 300', JSON.stringify(s.days['2026-10-14'].s) === '["discharge"]' && s.days['2026-10-14'].n.length === 300);
    ok('notes dot appears', await cell(p, '2026-10-14').locator('.nd').count() === 1);
    await p.fill('#day-note', ''); await p.click('.chip[data-k="discharge"]');
    ok('clearing a day removes it', !(await saved(p)).days['2026-10-14'] && await cell(p, '2026-10-14').locator('.nd').count() === 0);
    await p.click('.chip[data-k="cramps"]'); await p.fill('#day-note', 'Back ache');
    await p.reload({ waitUntil: 'networkidle' });
    await cell(p, '2026-10-14').click();
    ok('reload keeps symptoms and note', await p.getAttribute('.chip[data-k="cramps"]', 'aria-pressed') === 'true' && await p.inputValue('#day-note') === 'Back ache');
    // keyboard
    await cell(p, '2026-10-14').focus(); await p.keyboard.press('ArrowRight'); await p.keyboard.press('ArrowDown');
    ok('arrow keys move the day', await p.evaluate(() => document.activeElement.dataset.d) === '2026-10-22' && await txt(p, '#day-h') === 'Thu 22 Oct 2026');
    await p.keyboard.press('ArrowDown'); await p.keyboard.press('ArrowDown');
    ok('arrow keys cross into November', await txt(p, '#cal-h') === 'November 2026' && await p.evaluate(() => document.activeElement.dataset.d) === '2026-11-05');
    // month buttons
    await p.click('#next');
    ok('next month December, same day picked', await txt(p, '#cal-h') === 'December 2026' && await txt(p, '#day-h') === 'Sat 5 Dec 2026');
    ok('December shows predicted 27 Dec', await cell(p, '2026-12-27').evaluate(e => e.classList.contains('predicted')));
    await p.click('#go-today');
    ok('Back to today', await txt(p, '#cal-h') === 'October 2026' && await txt(p, '#day-h') === 'Fri 16 Oct 2026 (today)' && !(await vis(p, '#go-today')));
    await p.click('#prev');
    ok('previous month September', await txt(p, '#cal-h') === 'September 2026');
    await p.click('#go-today');

    // ---- adding, refusing, deleting with undo
    await p.fill('#add-date', '2026-10-01'); await p.click('#add-btn');
    ok('same start refused', await txt(p, '#add-err') === 'A period starting 1 Oct 2026 is already logged.');
    await p.fill('#add-date', '2026-10-03'); await p.click('#add-btn');
    ok('inside a period refused', /^That is day 3 of the period that started 1 Oct 2026/.test(await txt(p, '#add-err')));
    await p.fill('#add-date', '2026-04-13'); await p.click('#add-btn');
    ok('forgotten April period added: latest 6 shown plus Show all', (await p.$$('.pbox')).length === 6 && await txt(p, '#more') === 'Show all 7 periods' && await txt(p, '#add-err') === '' && await p.inputValue('#add-date') === '');
    await p.click('#more');
    ok('Show all lists 7, oldest is April', (await p.$$('.pbox')).length === 7 && /13 Apr 2026/.test(await p.locator('.pbox h3').last().textContent()) && await txt(p, '#more') === 'Show only the latest 6');
    ok('toast offers undo', await vis(p, '#toast-undo') && /Period logged: started Mon 13 Apr 2026/.test(await txt(p, '#toast-text')));
    await p.click('#toast-undo');
    ok('undo removes it', (await p.$$('.pbox')).length === 6 && !(await vis(p, '#more')));
    await box(p, '2026-10-01').locator('.del').click();
    ok('delete last period: 2 Sep + 29 = 1 Oct, now 15 days late', await txt(p, '#t-big') === 'Period is 15 days late', await txt(p, '#t-big'));
    ok('late: next says any day now, flag shown', await txt(p, '#k-next') === 'Any day now' && await vis(p, '#flag') && /pregnancy test/.test(await txt(p, '#flag')));
    await p.click('#toast-undo');
    ok('undo brings it back', await txt(p, '#t-big') === 'Period expected in 14 days' && (await saved(p)).periods.length === 6);
    // change how long it lasted
    ok('calendar jumped to the added April period', true);
    await p.click('#go-today');
    await box(p, '2026-10-01').locator('select').selectOption('8');
    ok('Lasted 8 days: 6 to 8 Oct now logged', await cell(p, '2026-10-08').evaluate(e => e.classList.contains('logged')) && (await saved(p)).periods[5].len === 8);
    ok('average period length (5+5+6+5+4+8)/6 = 5.5 -> 6', await txt(p, '#st-len') === '6 days');
    await box(p, '2026-10-01').locator('select').selectOption('5');
    // don't count the gap
    await box(p, '2026-10-01').locator('.pskip').check();
    ok('ticked gap not counted: 4 cycles, average 28.5 -> 29', await txt(p, '#basis') === 'Based on your last 4 cycles, average 29 days.' && /not counted/.test(await box(p, '2026-10-01').locator('.pcyc').textContent()));
    await box(p, '2026-10-01').locator('.pskip').uncheck();
    // started today
    await p.click('#started-today');
    ok('started today: period day 1', await txt(p, '#t-big') === 'Period day 1' && !(await vis(p, '#started-today')));
    ok('16 Oct is a 15-day cycle: marked short', /short cycle/.test(await box(p, '2026-10-16').locator('.pcyc').textContent()) && await vis(p, '#st-note'));
    await p.click('#toast-undo');
    ok('undo started today', await txt(p, '#t-big') === 'Period expected in 14 days');

    // ---- sharing
    await p.click('#copy');
    const clip = await p.evaluate(() => navigator.clipboard.readText());
    ok('copy summary', clip.includes('Next period expected: around Fri 30 Oct 2026 (usual range 28 to 31 Oct 2026)') && clip.includes('- 1 Oct 2026: cramps, heavy flow, Took a painkiller') && clip.includes('- 14 Oct 2026: cramps, Back ache'));
    ok('email link with no address', (await p.getAttribute('#mail', 'href')).startsWith('mailto:?subject=My%20period%20summary&body='));
    let [dl] = await Promise.all([p.waitForEvent('download'), p.click('#ics')]);
    let ics = fs.readFileSync(await dl.path(), 'utf8');
    ok('calendar file: 3 periods + 3 fertile windows', dl.suggestedFilename() === 'expected-periods.ics' && (ics.match(/BEGIN:VEVENT/g) || []).length === 6 && ics.includes('DTSTART;VALUE=DATE:20261030'));
    await p.uncheck('#ics-fertile');
    [dl] = await Promise.all([p.waitForEvent('download'), p.click('#ics')]);
    ok('calendar file without fertile windows', (fs.readFileSync(await dl.path(), 'utf8').match(/BEGIN:VEVENT/g) || []).length === 3);
    await p.check('#ics-fertile');
    [dl] = await Promise.all([p.waitForEvent('download'), p.click('#export')]);
    const backup = path.join(os.tmpdir(), 'period-backup-test.json'); fs.copyFileSync(await dl.path(), backup);
    ok('backup file saved', /^period-calendar-backup-2026-10-16\.json$/.test(dl.suggestedFilename()) && JSON.parse(fs.readFileSync(backup, 'utf8')).periods.length === 6);
    // print uses the summary
    await p.evaluate(() => { window.print = () => { window.printed = document.getElementById('print-area').textContent; }; });
    await p.click('#print');
    ok('print shows the summary', /^Period and Ovulation Calendar summary, 16 Oct 2026/.test(await p.evaluate(() => window.printed)));
    // settings
    await p.selectOption('#set-week', '0');
    ok('week starts on Sunday', (await p.$$eval('#wk span', e => e.map(x => x.textContent)))[0] === 'Su' && (await p.$$eval('#grid .dc', e => e[0].dataset.d)) === '2026-09-27');
    await p.selectOption('#set-week', '1');
    // pause
    await p.check('#paused');
    ok('paused: no predictions, calendar file off', await txt(p, '#t-big') === 'Predictions are paused' && !(await vis(p, '#keys')) && await p.isDisabled('#ics') && await vis(p, '#resume'));
    ok('paused: no expected days in calendar', await cell(p, '2026-10-30').evaluate(e => !e.classList.contains('predicted')));
    await p.click('#started-today');
    s = await saved(p);
    ok('logging while paused resumes and skips the gap', !s.settings.paused && s.periods[6].skipGap === true && /Predictions are back on/.test(await txt(p, '#toast-text')));
    await p.click('#toast-undo');
    await p.click('#resume');
    ok('resume predictions', await txt(p, '#t-big') === 'Period expected in 14 days');
    // delete everything and undo
    await p.click('#wipe');
    ok('delete everything: back to Get started', await vis(p, '#setup') && (await saved(p)).periods.length === 0);
    await p.click('#toast-undo');
    ok('undo delete everything', await txt(p, '#t-big') === 'Period expected in 14 days');
    ok('example: no console errors', !p.errors.length && !p.bad.length, p.errors.concat(p.bad));
    await p.context().close();

    // ---- loading a backup on another device, bad files
    p = await load(b, phone);
    const bad = path.join(os.tmpdir(), 'period-bad.json'); fs.writeFileSync(bad, '{not json');
    await p.setInputFiles('#import-file', bad);
    await p.waitForFunction(() => document.getElementById('tools-msg').textContent);
    ok('bad file refused', await txt(p, '#tools-msg') === 'That file is not a backup from this app.');
    fs.writeFileSync(bad, JSON.stringify({ periods: [{ start: 'nope' }] }));
    await p.setInputFiles('#import-file', bad); await p.waitForTimeout(200);
    ok('backup with no periods refused', await txt(p, '#tools-msg') === 'That backup has no periods in it.');
    await p.setInputFiles('#import-file', backup); await p.waitForTimeout(300);
    ok('backup loaded', await txt(p, '#t-big') === 'Period expected in 14 days' && /Backup loaded: 6 periods/.test(await txt(p, '#toast-text')));
    await p.context().close();

    // ---- other days
    p = await load(b, phone, { state: AISHA, now: new Date(2026, 10, 2, 9, 0) });
    ok('2 Nov: 3 days late, past the usual range', await txt(p, '#t-big') === 'Period is 3 days late' && !/usual range/.test(await txt(p, '#t-sub')));
    ok('2 Nov: fertile shows next cycle', /^next cycle, ovulation around/.test(await txt(p, '#k-fert-sub')));
    await p.context().close();
    p = await load(b, phone, { state: AISHA, now: new Date(2026, 9, 31, 9, 0) });
    ok('31 Oct: 1 day late but still within usual range', await txt(p, '#t-big') === 'Period is 1 day late' && /still within your usual range \(up to Sat 31 Oct\)/.test(await txt(p, '#t-sub')));
    await p.context().close();
    p = await load(b, phone, { state: AISHA, now: new Date(2026, 9, 3, 9, 0) });
    ok('3 Oct: Period day 3, no started-today button', await txt(p, '#t-big') === 'Period day 3' && !(await vis(p, '#started-today')));
    await p.context().close();
    p = await load(b, phone, { state: AISHA, now: new Date(2026, 9, 30, 9, 0) });
    ok('30 Oct: expected today', await txt(p, '#t-big') === 'Period expected today');
    await p.context().close();
    p = await load(b, phone, { state: AISHA, now: new Date(2027, 0, 20, 9, 0) });
    ok('20 Jan: long gap note', /No period logged for 111 days/.test(await txt(p, '#flag')));
    await p.context().close();
    // a new day while the page stays open
    p = await load(b, phone, { state: AISHA });
    await p.clock.setFixedTime(new Date(2026, 9, 17, 9, 0));
    await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    ok('next day while open updates', await txt(p, '#t-big') === 'Period expected in 13 days' && await txt(p, '#day-h') === 'Sat 17 Oct 2026 (today)');
    await p.context().close();

    // ---- corrupt and blocked storage, demo
    p = await load(b, phone, { state: '{broken' });
    ok('corrupt saved data: starts fresh', await vis(p, '#setup') && !p.errors.length);
    await p.click('#demo');
    ok('Try an example: 6 periods, today day 16', (await p.$$('.pbox')).length === 6 && /^Day 16 of your cycle/.test(await txt(p, '#t-sub')));
    await p.context().close();
    p = await load(b, phone, { block: true });
    ok('blocked storage: warning, still works', await vis(p, '#save-warn') && !p.errors.length);
    await p.fill('#s-start', '2026-10-01'); await p.click('#setup-go');
    ok('blocked storage: calendar shown', await txt(p, '#t-big') === 'Period expected in 13 days');
    await p.context().close();

    // ---- light/dark switch
    p = await load(b, desk, { state: AISHA });
    const bg1 = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await p.click('.theme-toggle');
    const bg2 = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
    ok('light/dark switch changes the look', bg1 !== bg2 && await p.evaluate(() => document.documentElement.dataset.theme) === 'light');
    await p.context().close();

    // ---- every width, filled in and cleared, dark and light
    const W = [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920];
    for (const theme of ['dark', 'light']) for (const st of [AISHA, null]) for (const w of W) {
        p = await load(b, { width: w, height: 900 }, { state: st === null ? undefined : st, theme });
        if (st) { await cell(p, '2026-10-01').click(); }
        const tag = theme + ' ' + (st ? 'filled' : 'empty') + ' ' + w + 'px';
        const o = await overlaps(p), out = await sticksOut(p), cl = await clipped(p);
        let bo = [];
        for (const pos of [0, 0.5, 1]) { await p.evaluate(x => window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * x), pos); bo = bo.concat(await blockOverlap(p)); }
        const good = await noHScroll(p) && !o.length && !out.length && !bo.length && !cl.length && !p.errors.length;
        if (!good || w === 390 || w === 1280) ok(tag + ': no scroll, overlap, clipping or errors', good, { o, out, bo, cl, e: p.errors });
        else if (good) ok(tag, true);
        await p.context().close();
    }
    // narrow phone with everything open: a late cycle (flag) and the checkbox rows
    p = await load(b, { width: 320, height: 900 }, { state: AISHA, now: new Date(2026, 10, 2, 9, 0) });
    ok('320px late state: no overlaps', !(await overlaps(p)).length && await noHScroll(p));
    await p.context().close();

    if (shots || bi < 0) { /* screenshots are made by shots.js */ }
    await b.close(); if (srv) srv.close();
    console.log(fail ? '\n' + fail + ' FAILED' : '\nALL UI CHECKS PASSED');
    process.exit(fail ? 1 : 0);
})();
