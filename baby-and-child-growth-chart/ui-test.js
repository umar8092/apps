// Full page test with Playwright. Run from the repo root or this folder: node ui-test.js
//   BASE=https://umar8092.github.io/apps node ui-test.js   tests the live site
//   node ui-test.js --shots                                 also saves screenshots/desktop.png and phone.png
// "Today" is fixed to Wed 21 Oct 2026 in Pakistan time so every answer can be checked exactly.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.resolve(__dirname, '..'), SLUG = 'baby-and-child-growth-chart', KEY = SLUG + '.state';
const SHOTS = process.argv.includes('--shots');
const NOW = new Date('2026-10-21T15:00:00+05:00');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; if (!cond) console.log('FAIL ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra).slice(0, 400) : '')); };

function serve() {
    const types = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml', png: 'image/png', webmanifest: 'application/manifest+json' };
    return new Promise(res => { const s = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0].replace(/^\/apps/, '')); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': types[f.split('.').pop()] || 'application/octet-stream' }); r.end(fs.readFileSync(f)); }).listen(0, () => res(s)); });
}

// Ali from the README (boy, born 3 Apr 2026, four check-ups) and his sister Sara (born at 34 weeks).
const ALI = { id: 1, name: 'Ali', sex: 1, birth: '2026-04-03', weeks: 0, m: [
    { id: 2, d: '2026-04-03', weight: 3.4, length: 50.5, head: 34.5 }, { id: 3, d: '2026-05-01', weight: 4.6, length: 55 },
    { id: 4, d: '2026-07-03', weight: 6.6, length: 63.5, head: 41 }, { id: 5, d: '2026-10-05', weight: 7.4, length: 67.5, head: 43.5 }] };
const SARA = { id: 6, name: 'Sara', sex: 2, birth: '2024-06-12', weeks: 34, m: [{ id: 7, d: '2024-06-12', weight: 2.1, length: 44 }, { id: 8, d: '2025-06-12', weight: 8.4, length: 72 }, { id: 9, d: '2026-10-01', weight: 12.6, length: 91.5 }] };
const AHMED = { v: 1, units: 'metric', active: 1, nextId: 20, children: [ALI, SARA] };

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
    const resLines = page => page.$$eval('#res-body .res-line', l => l.map(e => e.innerText.replace(/\s+/g, ' ').trim()));
    async function addM(page, day, w, l, h) {
        await page.fill('#m-day', day);
        if (w != null) await page.fill('#m-kg', w); if (l != null) await page.fill('#m-len', l);
        if (h != null) { if (await vis(page, '#o-head')) await page.click('#o-head'); await page.fill('#m-head', h); }
        await page.click('#m-save');
    }

    // ---------- 1. first use: add a child ----------
    let { ctx, page } = await newPage();
    ok('first use: child form', await vis(page, '#k-form') && !(await vis(page, '#add')) && !(await vis(page, '#chart')) && (await txt(page, '#kids-h')) === 'Add your child');
    ok('first use: only restore', !(await vis(page, '#copy')) && !(await vis(page, '#backup')) && await vis(page, '#restore') && !(await vis(page, '#wipe')));
    ok('born early hidden', !(await vis(page, '#w-early')));
    await page.click('#k-save');
    ok('child errors', (await txt(page, '#e-kname')) === 'Type a name, or a nickname such as Baby.' && (await txt(page, '#e-sex')).startsWith('Pick Boy or Girl') && (await txt(page, '#e-birth')) === 'Pick the date of birth.');
    await page.fill('#k-name', '  Ali\n'); await page.click('label[for="k-boy"]'); await page.fill('#k-birth', '2026-10-22'); await page.click('#k-save');
    ok('future birth refused', (await txt(page, '#e-birth')) === 'The date of birth cannot be in the future.');
    await page.fill('#k-birth', '2026-04-03'); await page.click('#o-early'); await page.fill('#k-weeks', '50'); await page.click('#k-save');
    ok('weeks 50 refused', (await txt(page, '#e-weeks')).startsWith('Type the weeks as a number from 22 to 42'));
    await page.click('#o-early');
    ok('closing born early clears it', (await page.inputValue('#k-weeks')) === '');
    await page.click('#k-save');
    ok('child added', await vis(page, '#add') && (await txt(page, '#add-h')) === 'Add a measurement for Ali' && !(await vis(page, '#k-form')) && (await saved(page)).children[0].name === 'Ali');
    ok('child box', (await txt(page, '#k-list .box-sub')) === 'Boy, 6 months 2 weeks old today (born 3 Apr 2026)');
    ok('day is today', (await page.inputValue('#m-day')) === '2026-10-21');
    ok('no measurements yet', await vis(page, '#l-empty') && !(await vis(page, '#result')));
    ok('head size optional, hidden', !(await vis(page, '#w-head')));

    // ---------- 2. measurements ----------
    await page.fill('#m-day', '2026-10-21'); await page.click('#m-save');
    ok('nothing typed', (await txt(page, '#e-m')) === 'Type at least one of the weight, the length or the head size.');
    await addM(page, '2026-10-21', 'abc');
    ok('text refused', (await txt(page, '#e-weight')) === 'Type a number, such as 7.4.');
    await addM(page, '2026-10-21', '74');
    ok('74 kg refused', (await txt(page, '#e-weight')).startsWith('A weight of 74 kg is not possible'));
    await addM(page, '2026-10-21', '-3');
    ok('negative refused', (await txt(page, '#e-weight')) === 'Type a number, such as 7.4.');
    await page.fill('#m-kg', '');
    await addM(page, '2026-04-02', '3.4');
    ok('before birth refused', (await txt(page, '#e-day')) === 'That day is before Ali was born (3 Apr 2026).');
    await addM(page, '2026-10-25', '3.4');
    ok('future day refused', (await txt(page, '#e-day')) === 'The day cannot be in the future.');
    ok('nothing saved', (await saved(page)).children[0].m.length === 0);
    await addM(page, '2026-04-03', '3,4', '50.5', '34.5');
    let lines = await resLines(page);
    ok('birth result', lines[0] === 'Weight 3.4 kg the 54th percentile About 54 in 100 boys of the same age weigh less.', lines);
    ok('birth length and head', lines[1].startsWith('Length 50.5 cm the 63rd percentile') && lines[2].startsWith('Head size 43.5'.slice(0, 9)) && lines[2].includes('the 51st percentile'), lines);
    ok('form cleared after save', (await page.inputValue('#m-kg')) === '' && !(await vis(page, '#w-head')) && (await page.inputValue('#m-day')) === '2026-10-21');
    await addM(page, '2026-05-01', '4.6', '55');
    await addM(page, '2026-07-03', '6.6', '63.5', '41');
    await addM(page, '2026-10-05', '7.4', '67.5', '43.5');
    lines = await resLines(page);
    ok('6 months result', (await txt(page, '#res-body .res-when')) === 'Ali on 5 Oct 2026, 6 months' && lines[0] === 'Weight 7.4 kg the 25th percentile About 25 in 100 boys of the same age weigh less. Last time (3 Jul 2026): 6.6 kg, the 62nd percentile.', lines);
    ok('6 months length, head', lines[1] === 'Length 67.5 cm the 45th percentile About 45 in 100 boys of the same age are shorter. Last time (3 Jul 2026): 63.5 cm, the 85th percentile.' && lines[2] === 'Head size 43.5 cm the 54th percentile About 54 in 100 boys of the same age have a smaller head. Last time (3 Jul 2026): 41 cm, the 66th percentile.', lines);
    ok('no warnings for Ali', !(await page.locator('#res-body .res-flag').count()));
    ok('list of 4, newest first', (await page.locator('#m-list > li').count()) === 4 && (await txt(page, '#m-list > li:first-child h3')) === '5 Oct 2026' && (await txt(page, '#list-h')) === 'All measurements (4)');
    ok('list values', (await txts(page, '#m-list > li:first-child .vv')).join('|') === '7.4 kg · 25th|67.5 cm · 45th|43.5 cm · 54th');
    ok('chart dots', (await page.locator('#svg-wrap circle').count()) === 4 && (await page.getAttribute('#svg-wrap svg', 'aria-label')) === 'Weight chart for Ali: 4 measurements, the latest at the 25th percentile.');
    await page.click('#t-head');
    ok('head chart', (await page.locator('#svg-wrap circle').count()) === 3 && (await page.getAttribute('#t-head', 'aria-selected')) === 'true');
    await page.focus('#t-head'); await page.keyboard.press('ArrowRight');
    ok('arrow keys move tabs', (await page.getAttribute('#t-weight', 'aria-selected')) === 'true');
    // show an older result
    await page.click('#m-list > li:nth-child(3) button:has-text("Result")');
    ok('older result', (await txt(page, '#res-h')) === 'Result' && (await txt(page, '#res-body .res-when')) === 'Ali on 1 May 2026, 4 weeks');
    // edit with a drop across two lines, then undo
    await page.click('#m-list > li:first-child button:has-text("Edit")');
    ok('edit fills the form', (await page.inputValue('#m-kg')) === '7.4' && (await page.inputValue('#m-head')) === '43.5' && (await txt(page, '#add-h')) === 'Change the measurement of 5 Oct 2026' && await vis(page, '#m-cancel'));
    await page.fill('#m-kg', '6.9'); await page.click('#m-save');
    ok('crossing two lines warns', (await txt(page, '#res-body .res-flag')) === 'Weight has gone from the 62nd percentile to the 10th percentile since 3 Jul 2026, crossing 2 chart lines. Ask your doctor to check.', await txt(page, '#res-body .res-flag'));
    ok('edit kept one row', (await page.locator('#m-list > li').count()) === 4);
    await page.click('#r-msg .undo');
    ok('undo edit', (await resLines(page))[0].startsWith('Weight 7.4 kg the 25th'));
    await page.click('#m-list > li:first-child button:has-text("Edit")'); await page.click('#m-cancel');
    ok('cancel edit', (await txt(page, '#add-h')) === 'Add a measurement for Ali' && (await page.inputValue('#m-kg')) === '');
    // below the 3rd and far from usual
    await addM(page, '2026-10-21', '6.2');
    ok('below 3rd', (await txt(page, '#res-body .res-flag')) === 'Below the 3rd percentile. Ask your doctor or health visitor to check Ali\'s weight.' && (await page.locator('#svg-wrap circle.flag').count()) === 1);
    await page.click('#m-list > li:first-child button:has-text("Delete")');
    ok('deleted', (await page.locator('#m-list > li').count()) === 4);
    await page.click('#l-msg .undo');
    ok('undo delete', (await page.locator('#m-list > li').count()) === 5);
    await page.click('#m-list > li:first-child button:has-text("Delete")');
    await addM(page, '2026-10-21', '20');
    ok('far from usual', (await txt(page, '#res-body .res-flag')).startsWith('This is very far from usual for Ali\'s age. Check the number, the unit (kg or cm)'));
    await page.click('#m-list > li:first-child button:has-text("Delete")');

    // ---------- 3. pounds and inches ----------
    await page.click('label[for="u-imperial"]');
    ok('imperial fields', await vis(page, '#m-lb') && await vis(page, '#m-oz') && !(await vis(page, '#m-kg')) && (await txt(page, '#u-len')) === 'in');
    ok('imperial list', (await txts(page, '#m-list > li:first-child .vv')).join('|') === '16 lb 5 oz · 25th|26.6 in · 45th|17.1 in · 54th', await txts(page, '#m-list > li:first-child .vv'));
    await page.fill('#m-day', '2026-10-20'); await page.fill('#m-lb', '16'); await page.fill('#m-oz', '16'); await page.click('#m-save');
    ok('16 oz refused', (await txt(page, '#e-weight')) === 'Ounces go from 0 to 15.9; 16 oz is 1 lb.');
    await page.fill('#m-oz', '8'); await page.fill('#m-len', '26.75'); await page.click('#m-save');
    const sm = (await saved(page)).children[0].m.find(m => m.d === '2026-10-20');
    ok('imperial saved in kg and cm', sm && sm.weight === 7.484 && sm.length === 67.95, sm);
    await page.fill('#m-lb', '7'); await page.click('label[for="u-metric"]');
    ok('typed value converted on switch', (await page.inputValue('#m-kg')) === '3.175');
    await page.fill('#m-kg', '');
    await page.click('#m-list > li:first-child button:has-text("Delete")');

    // ---------- 4. more children: born early, over 5 ----------
    await page.click('#k-open');
    await page.fill('#k-name', 'Sara'); await page.click('label[for="k-girl"]'); await page.fill('#k-birth', '2026-08-10'); await page.click('#o-early'); await page.fill('#k-weeks', '34'); await page.click('#k-save');
    ok('second child open', (await txt(page, '#add-h')) === 'Add a measurement for Sara' && (await page.locator('#k-list > li').count()) === 2 && (await txt(page, '#k-list > li:nth-child(2) .badge')) === 'Open now');
    ok('Sara has her own list', await vis(page, '#l-empty'));
    await addM(page, '2026-09-01', '2.5');
    ok('before due date', (await resLines(page))[0] === 'Weight 2.5 kg Before the due date (born early): the WHO chart starts at the due date. Your doctor uses a chart for babies born early.', await resLines(page));
    await addM(page, '2026-10-20', '3.3');
    ok('corrected age result', (await txt(page, '#res-body .res-when')) === 'Sara on 20 Oct 2026, 2 months 1 week (corrected age 4 weeks 1 day)' && (await resLines(page))[0].startsWith('Weight 3.3 kg the 5th percentile About 5 in 100 girls'), [await txt(page, '#res-body .res-when'), await resLines(page)]);
    ok('chart skips before due date', (await page.locator('#svg-wrap circle').count()) === 1 && (await txt(page, '#chart-note')) === 'Measurements before the due date are not on this chart.');
    await page.click('#k-list > li:nth-child(2) button:has-text("Edit")');
    await page.fill('#k-birth', '2026-10-01'); await page.click('#k-save');
    ok('birth after measurements refused', (await txt(page, '#e-birth')).startsWith('There are measurements before that day'));
    await page.click('#k-cancel');
    await page.click('#k-open');
    await page.fill('#k-name', 'Omar'); await page.click('label[for="k-boy"]'); await page.fill('#k-birth', '2020-01-01'); await page.click('#k-save');
    await page.fill('#m-day', '2026-10-01');
    ok('height label over 2', (await txt(page, '#l-len')) === 'Height (standing)');
    await addM(page, '2026-10-01', '20', '115');
    ok('over 5', (await resLines(page))[0] === 'Weight 20 kg Over 5 years: the WHO chart for birth to 5 years stops here, so there is no percentile. Ask your doctor for the 5 to 19 years chart.' && (await txt(page, '#m-list .vv')) === '20 kg · over 5 years');
    await page.click('#k-list > li:nth-child(3) button:has-text("Remove")');
    ok('removed Omar', (await page.locator('#k-list > li').count()) === 2 && (await txt(page, '#k-msg')).startsWith('Removed Omar and 1 measurement.'));
    await page.click('#k-msg .undo');
    ok('undo remove child', (await page.locator('#k-list > li').count()) === 3);
    await page.click('#k-list > li:first-child button:has-text("Open")');
    ok('switch to Ali', (await txt(page, '#add-h')) === 'Add a measurement for Ali' && (await page.locator('#m-list > li').count()) === 4);

    // ---------- 5. share and backup ----------
    await page.click('#copy');
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    ok('copy table', clip.startsWith('Ali (boy, born 3 Apr 2026)\nWHO Child Growth Standards percentiles') && clip.includes('5 Oct 2026, 6 months: Weight 7.4 kg (25th percentile), Length 67.5 cm (45th percentile), Head size 43.5 cm (54th percentile)'), clip);
    ok('email with no address', (await page.getAttribute('#mail', 'href')).startsWith('mailto:?subject=Growth%20measurements%3A%20Ali&body=Ali%20(boy'));
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#backup')]);
    const file = path.join(os.tmpdir(), 'growth-backup.json'); await dl.saveAs(file);
    ok('backup name', dl.suggestedFilename() === 'growth-chart-backup-2026-10-21.json');
    await page.click('#wipe');
    ok('delete everything', await vis(page, '#k-form') && !(await vis(page, '#add')) && (await page.locator('#k-list > li').count()) === 0);
    await page.click('#set-msg .undo');
    ok('undo delete everything', (await page.locator('#k-list > li').count()) === 3);
    await page.click('#wipe');
    await page.setInputFiles('#restore-file', file); await page.waitForTimeout(300);
    ok('restore', (await page.locator('#k-list > li').count()) === 3 && (await txt(page, '#set-msg')).startsWith('Backup restored: 3 children.'));
    const badFile = path.join(os.tmpdir(), 'growth-bad.json'); fs.writeFileSync(badFile, '[1,2]');
    await page.setInputFiles('#restore-file', badFile); await page.waitForTimeout(300);
    ok('bad backup refused', (await txt(page, '#set-msg')) === 'That file is not a backup from this app. Nothing was changed.');
    await page.reload({ waitUntil: 'networkidle' });
    ok('reload keeps everything', (await page.locator('#k-list > li').count()) === 3 && (await resLines(page))[0].startsWith('Weight 7.4 kg the 25th'));
    await ctx.close();

    // seeded: Sara's height chart over 2 years, and the theme switch
    ({ ctx, page } = await newPage({ viewport: { width: 1280, height: 900 } }, Object.assign({}, AHMED, { active: 6 })));
    ok('Sara over 2: no correction', (await txt(page, '#res-body .res-when')) === 'Sara on 1 Oct 2026, 2 years 3 months');
    await page.click('#t-length');
    ok('length / height tab', (await txt(page, '#t-length')) === 'Length / height' && (await txt(page, '#chart-note')).includes('standing height is about 0.7 cm less'));
    const before = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await page.click('.theme-toggle');
    ok('theme switch', (await page.evaluate(() => document.documentElement.dataset.theme)) === 'light' && before !== await page.evaluate(() => getComputedStyle(document.body).backgroundColor));
    await page.click('.theme-toggle');
    await ctx.close();

    // corrupt saved state, and storage blocked
    ({ ctx, page } = await newPage({}, 'garbage{'));
    ok('corrupt state: fresh start', await vis(page, '#k-form') && (await txt(page, '#set-msg')) === 'The saved measurements could not be read, so the app started fresh.');
    await ctx.close();
    ({ ctx, page } = await newPage({}, { children: [{ id: 'x' }] }));
    ok('invalid state: fresh start', await vis(page, '#k-form'));
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
                await page.evaluate(() => { document.querySelectorAll('#w-early, #w-head, #k-form, #w-lb').forEach(e => { e.hidden = false; }); });
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
        ok('help opens inside ' + w, await d.evaluate(e => e.open) && r.x >= 0 && r.x + r.width <= w + 1 && r.y >= 0 && r.y + r.height <= 801 && (await d.textContent()).includes('How to use Baby and Child Growth Chart'));
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
        await page.screenshot({ path: path.join(__dirname, 'screenshots/desktop.png') });
        await ctx.close();
        ({ ctx, page } = await newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }, AHMED));
        await page.evaluate(() => document.getElementById('result').scrollIntoView());
        await page.screenshot({ path: path.join(__dirname, 'screenshots/phone.png') });
        await ctx.close();
    }

    // every file the app needs answers 200
    for (const f of ['favicon.svg', 'manifest.webmanifest', 'sw.js', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', '../help.js', '../theme.js', 'who-data.js', 'core.js', 'script.js', 'style.css', 'screenshots/desktop.png', 'screenshots/phone.png']) {
        const r = await (await browser.newContext()).request.get(URL + f); ok('200 for ' + f, r.status() === 200, r.status());
    }
    ok('page loaded its scripts', ['who-data.js', 'core.js', 'script.js', 'style.css'].every(f => [...requested].some(u => u.endsWith('/' + SLUG + '/' + f))));
    ok('no failed requests', !failed.length, failed);
    ok('no console errors', !errors.length, errors);
    await browser.close(); if (srv) srv.close();
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})();
