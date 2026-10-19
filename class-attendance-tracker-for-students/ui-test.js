// Full page test with Playwright. Run from the repo root or this folder: node ui-test.js
//   BASE=https://umar8092.github.io/apps node ui-test.js   tests the live site
//   node ui-test.js --shots                                 also saves screenshots/desktop.png and phone.png
// "Today" is fixed to Mon 19 Oct 2026 in Pakistan time so every answer can be checked exactly.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), SLUG = 'class-attendance-tracker-for-students', KEY = SLUG + '.state';
const SHOTS = process.argv.includes('--shots');
const NOW = new Date('2026-10-19T10:00:00+05:00');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; if (!cond) console.log('FAIL ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra).slice(0, 400) : '')); };

function serve() {
    const types = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml', png: 'image/png', webmanifest: 'application/manifest+json' };
    return new Promise(res => { const s = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0].replace(/^\/apps/, '')); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': types[f.split('.').pop()] || 'application/octet-stream' }); r.end(fs.readFileSync(f)); }).listen(0, () => res(s)); });
}

// A second-year student's term (used for screenshots and the screen size checks).
const L = (arr) => arr.map(([d, k]) => ({ d, k }));
const TERM = { v: 1, nextId: 10, rule: 7500, term: '', last: null, subjects: [
    { id: 1, name: 'Physics', held: 24, att: 18, bp: 7500, w: 1, left: 12, log: L([['2026-10-13', 'p'], ['2026-10-14', 'a'], ['2026-10-15', 'p'], ['2026-10-16', 'a']]) },
    { id: 2, name: 'Maths', held: 34, att: 30, bp: 7500, w: 1, left: null, log: L([['2026-10-15', 'p'], ['2026-10-16', 'p']]) },
    { id: 3, name: 'Chemistry', held: 30, att: 20, bp: 7500, w: 1, left: 8, log: L([['2026-10-14', 'a'], ['2026-10-15', 'c'], ['2026-10-16', 'a']]) },
    { id: 4, name: 'Computer Science Lab', held: 24, att: 20, bp: 8000, w: 2, left: 5, log: L([['2026-10-12', 'p']]) },
    { id: 5, name: 'English', held: 26, att: 22, bp: 7500, w: 1, left: null, log: [] }] };

(async () => {
    let srv, base = process.env.BASE;
    if (!base) { srv = await serve(); base = 'http://localhost:' + srv.address().port + '/apps'; }
    const URL = base + '/' + SLUG + '/';
    const browser = await chromium.launch();
    const errors = [], failed = [], requested = new Set();
    async function newPage(opts, seed, init) {
        const ctx = await browser.newContext(Object.assign({ viewport: { width: 390, height: 844 }, acceptDownloads: true, timezoneId: 'Asia/Karachi', colorScheme: 'dark' }, opts || {}));
        await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new globalThis.URL(base).origin });
        await ctx.route(/goatcounter\.com|gc\.zgo\.at/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
        if (seed !== undefined) await ctx.addInitScript(([k, v]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, v); sessionStorage.setItem('seeded', '1'); } }, [KEY, typeof seed === 'string' ? seed : JSON.stringify(seed)]);
        if (init) await ctx.addInitScript(init);
        const page = await ctx.newPage();
        await page.clock.setFixedTime(NOW);
        page.on('pageerror', e => errors.push(e.message));
        page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
        page.on('request', r => { if (r.url().startsWith(base)) requested.add(r.url()); });
        page.on('response', r => { if (r.status() >= 400 && r.url().startsWith(base)) failed.push(r.status() + ' ' + r.url()); });
        await page.goto(URL, { waitUntil: 'networkidle' });
        return { ctx, page };
    }
    const txt = (page, sel) => page.locator(sel).first().innerText();
    const box = (page, name) => page.locator('#subjects > li', { has: page.locator('.box-name', { hasText: new RegExp('^' + name + '$') }) });
    async function add(page, o) {
        if (await page.locator('#open-form').isVisible()) await page.click('#open-form');
        await page.fill('#f-name', o.name);
        if (o.rule) await page.selectOption('#f-rule', o.rule);
        if (o.pct != null) await page.fill('#f-pct', o.pct);
        await page.fill('#f-held', o.held == null ? '' : String(o.held));
        await page.fill('#f-att', o.att == null ? '' : String(o.att));
        if (o.w || o.left != null) { if (await page.locator('#w-more').isHidden()) await page.click('#o-more'); if (o.w) await page.selectOption('#f-w', String(o.w)); if (o.left != null) await page.fill('#f-left', String(o.left)); }
        await page.click('#save');
    }

    // ---------- 1. first use ----------
    let { ctx, page } = await newPage();
    ok('first use: form comes first', await page.evaluate(() => document.getElementById('app').classList.contains('setup')));
    ok('first use: form open', await page.locator('#form').isVisible());
    ok('first use: subjects list hidden on a phone (nothing to show)', await page.locator('#list').isHidden());
    ok('first use: summary explains what to do', (await txt(page, '#sum-body')).includes('how many classes you can still miss'));
    ok('optional fields hidden at first', await page.locator('#w-more').isHidden() && await page.locator('#w-pct').isHidden());
    ok('share buttons disabled with no subjects', await page.locator('#copy-all').isDisabled() && await page.locator('#new-term').isDisabled());

    // ---------- 2. the main situation ----------
    await page.fill('#f-name', 'Physics'); await page.fill('#f-held', '24'); await page.fill('#f-att', '18');
    ok('preview before saving', (await txt(page, '#preview')) === '18 of 24 (75.0%). Do not miss the next class: it would drop you to 72.0%.', await txt(page, '#preview'));
    await page.click('#save');
    ok('added message', (await txt(page, '#form-msg')).startsWith('Added Physics.'));
    ok('form stays open for the next subject and is cleared', await page.locator('#form').isVisible() && (await page.inputValue('#f-name')) === '' && (await page.inputValue('#f-held')) === '');
    ok('list shows after the first subject', await page.locator('#list').isVisible());
    let b = box(page, 'Physics');
    ok('Physics percent', (await b.locator('.big').innerText()) === '75.0% 18 of 24 classes attended', await b.locator('.big').innerText());
    ok('Physics badge', (await b.locator('.badge').innerText()) === 'On the line');
    ok('Physics answer', (await b.locator('.adv').innerText()) === 'Do not miss the next class: it would drop you to 72.0%.');
    ok('Physics spare', (await b.locator('.adv2').innerText()) === 'Attend the next 3 classes to be able to miss 1.');
    ok('Physics next class', (await b.locator('.whatif').innerText()) === 'Next class: attend and you are at 76.0%, miss it and you are at 72.0%.');
    ok('optional not forced: no plan line without classes left', await b.locator('.plan').count() === 0);

    await add(page, { name: 'Maths', held: 34, att: 30 });
    ok('Maths can miss 6', (await box(page, 'Maths').locator('.adv').innerText()) === 'You can miss 6 classes and stay at 75% or above.');
    await add(page, { name: 'Chemistry', held: 30, att: 20, left: 8 });
    b = box(page, 'Chemistry');
    ok('Chemistry below', (await b.locator('.adv').innerText()) === 'Attend the next 10 classes in a row to get back to 75%.' && (await b.locator('.badge').innerText()) === 'Below 75%');
    ok('Chemistry term impossible', (await b.locator('.plan').innerText()).startsWith('Even if you attend all 8 classes left, you end the term at 73.6%'));
    await add(page, { name: 'English' });
    ok('blank totals mean a new term', (await box(page, 'English').locator('.adv').innerText()) === 'No classes yet. Tap Present or Absent after each class.');
    await page.click('#cancel');
    ok('Close hides the form', await page.locator('#form').isHidden() && await page.locator('#open-form').isVisible());

    // summary
    ok('summary headline', (await txt(page, '#sum-body .next')) === 'Chemistry is below 75%', await txt(page, '#sum-body .next'));
    const items = await page.locator('.sum-list li').allInnerTexts();
    ok('summary items', JSON.stringify(items) === JSON.stringify(['Chemistry 66.6%: attend the next 10 classes', 'Physics 75.0%: do not miss the next class']), items);
    ok('summary safe', (await txt(page, '.sum-safe')) === 'You can still miss: Maths 6');
    const sumText = await txt(page, '#sum-body');
    ok('summary overall', sumText.includes('All subjects together: 68 of 88 (77.2%), above 75%.'), sumText);
    ok('summary empty subject', sumText.includes('No classes marked yet: English'));
    await page.click('.sum-list li.below .jump');
    await page.waitForTimeout(400);
    ok('tapping a summary item jumps to the subject', await box(page, 'Chemistry').evaluate(e => { const r = e.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; }));

    // ---------- 3. marking classes ----------
    b = box(page, 'Physics');
    await b.locator('.present').click();
    ok('Present: 19 of 25', (await box(page, 'Physics').locator('.big').innerText()) === '76.0% 19 of 25 classes attended');
    ok('Present message', (await txt(page, '#list-msg')).includes('Physics: Present marked. 19 of 25 (76.0%).'));
    await page.click('#list-msg .undo');
    ok('Undo a wrong tap', (await box(page, 'Physics').locator('.big').innerText()) === '75.0% 18 of 24 classes attended');
    await box(page, 'Physics').locator('.absent').click();
    b = box(page, 'Physics');
    ok('Absent: 18 of 25 below, attend 3', (await b.locator('.big').innerText()) === '72.0% 18 of 25 classes attended' && (await b.locator('.adv').innerText()) === 'Attend the next 3 classes in a row to get back to 75%.');
    await b.locator('.cancelled').click();
    b = box(page, 'Physics');
    ok('Cancelled does not count', (await b.locator('.big').innerText()) === '72.0% 18 of 25 classes attended');
    ok('Cancelled noted', (await b.locator('.box-sub').innerText()).includes('1 cancelled (not counted)'));
    ok('Last marked shows taps, newest first', (await b.locator('.recent').innerText()).replace(/\s+/g, ' ') === 'Last marked: Cancelled Mon 19 Oct Absent Mon 19 Oct', await b.locator('.recent').innerText());
    // classes left goes down with each tap
    await box(page, 'Chemistry').locator('.present').click();
    ok('classes left goes down by one', (await box(page, 'Chemistry').locator('.plan').innerText()).startsWith('Even if you attend all 7 classes left, you end the term at 73.6%'), await box(page, 'Chemistry').locator('.plan').innerText());
    // keyboard
    await box(page, 'English').locator('.present').focus(); await page.keyboard.press('Enter');
    ok('keyboard: Enter on Present works', (await box(page, 'English').locator('.big').innerText()) === '100.0% 1 of 1 classes attended');
    ok('buttons have spoken labels', (await box(page, 'English').locator('.present').getAttribute('aria-label')) === 'English: mark Present');

    // ---------- 4. form mistakes ----------
    await page.click('#open-form');
    await page.click('#save');
    ok('blank name error', (await txt(page, '#e-name')) === 'Type the subject name, like Physics.');
    await page.fill('#f-name', 'maths'); await page.click('#save');
    ok('same name error', (await txt(page, '#e-name')).startsWith('You already have maths.'));
    await page.fill('#f-name', 'Urdu'); await page.fill('#f-held', '10'); await page.fill('#f-att', '12'); await page.click('#save');
    ok('attended over held', (await txt(page, '#e-att')) === 'Attended (12) cannot be more than held (10).');
    ok('no preview while the form has a mistake', (await page.locator('#preview').innerText()) === '');
    await page.fill('#f-held', '-4'); await page.fill('#f-att', '2'); await page.click('#save');
    ok('negative', (await txt(page, '#e-held')) === 'Classes held cannot be below 0.');
    await page.fill('#f-held', '10.5'); await page.click('#save');
    ok('decimal', (await txt(page, '#e-held')) === 'Use a whole number of classes for classes held.');
    await page.fill('#f-held', '9999999'); await page.click('#save');
    ok('huge', (await txt(page, '#e-held')) === 'Use a number up to 5000.');
    await page.selectOption('#f-rule', 'other');
    ok('Another percent shows its box', await page.locator('#w-pct').isVisible());
    await page.fill('#f-held', '3'); await page.fill('#f-att', '2'); await page.fill('#f-pct', ''); await page.click('#save');
    ok('own percent blank', (await txt(page, '#e-pct')) === 'Type a percent from 1 to 100, like 75.');
    await page.click('#o-more'); await page.fill('#f-left', 'lots'); await page.fill('#f-pct', '66.67'); await page.click('#save');
    ok('classes left error', (await txt(page, '#e-left')).startsWith('Type a whole number of classes'));
    await page.fill('#f-left', ''); await page.fill('#f-held', ' 3 '); await page.click('#save');
    b = box(page, 'Urdu');
    ok('own percent 66.67 and pasted spaces', (await b.locator('.badge').innerText()) === 'Below 66.67%' && (await b.locator('.box-sub').innerText()).startsWith('Needs 66.67%'));
    ok('the next form remembers the last rule', (await page.inputValue('#f-rule')) === 'other' && (await page.inputValue('#f-pct')) === '66.67');
    // lab counted as 2
    await page.selectOption('#f-rule', '80');
    await add(page, { name: 'Physics Lab', held: 16, att: 14, w: 2, left: 4 });
    b = box(page, 'Physics Lab');
    ok('lab rule and weight shown', (await b.locator('.box-sub').innerText()) === 'Needs 80% · each class counts as 2');
    await b.locator('.present').click();
    ok('lab Present adds 2', (await box(page, 'Physics Lab').locator('.big').innerText()) === '88.8% 16 of 18 classes attended');
    ok('long name stays inside its box', await page.evaluate(() => [...document.querySelectorAll('.box')].every(b => b.scrollWidth <= b.clientWidth + 1)));
    await page.click('#cancel');

    // ---------- 5. edit, delete ----------
    await box(page, 'Maths').locator('button', { hasText: 'Edit or fix totals' }).click();
    ok('edit form filled', (await page.inputValue('#f-held')) === '34' && (await txt(page, '#form-h')) === 'Edit Maths' && await page.locator('#del').isVisible());
    await page.fill('#f-held', '40'); await page.click('#save');
    ok('edit saved', (await box(page, 'Maths').locator('.adv').innerText()) === 'Do not miss the next class: it would drop you to 73.1%.');
    await page.click('#list-msg .undo');
    ok('undo edit', (await box(page, 'Maths').locator('.adv').innerText()) === 'You can miss 6 classes and stay at 75% or above.');
    await box(page, 'Urdu').locator('button', { hasText: 'Edit or fix totals' }).click();
    await page.click('#del');
    ok('deleted', await box(page, 'Urdu').count() === 0 && (await txt(page, '#list-msg')).startsWith('Deleted Urdu.'));
    await page.click('#list-msg .undo');
    ok('undo delete', await box(page, 'Urdu').count() === 1);

    // ---------- 6. saved state ----------
    const before = await page.locator('#subjects > li').count();
    await page.reload({ waitUntil: 'networkidle' });
    ok('reload keeps everything', await page.locator('#subjects > li').count() === before && (await box(page, 'Physics').locator('.big').innerText()) === '72.0% 18 of 25 classes attended');
    ok('reload: form closed when there are subjects', await page.locator('#form').isHidden());

    // ---------- 7. copy, email ----------
    await page.click('#copy-all');
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    ok('copy all', clip.startsWith('Class attendance on 19 Oct 2026\n\nPhysics: 18 of 25 (72.0%), needs 75%. Attend the next 3 classes in a row to get back to 75%.'), clip.slice(0, 200));
    const href = await page.getAttribute('#mail-all', 'href');
    ok('email link with no address', href.startsWith('mailto:?subject=My%20class%20attendance&body=Class%20attendance%20on%2019%20Oct%202026'));
    await box(page, 'Maths').locator('button', { hasText: 'Copy' }).click();
    ok('copy one subject', (await page.evaluate(() => navigator.clipboard.readText())) === 'Maths: 30 of 34 (88.2%), needs 75%. You can miss 6 classes and stay at 75% or above.');

    // ---------- 8. backup and restore ----------
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#backup')]);
    const bpath = path.join(__dirname, '.backup-test.json'); await dl.saveAs(bpath);
    ok('backup file name', /^class-attendance-backup-2026-10-19\.json$/.test(dl.suggestedFilename()));
    // ---------- 9. new term ----------
    await page.click('#new-term');
    ok('new term clears subjects', await page.locator('#subjects > li').count() === 0 && await page.locator('#form').isVisible());
    ok('last term kept', await page.locator('#last').isVisible() && (await txt(page, '#last-h')) === 'Last term (ended 19 Oct 2026)' && (await page.locator('#last-list li').count()) === before);
    await page.click('#set-msg .undo');
    ok('undo new term', await page.locator('#subjects > li').count() === before);
    await page.click('#wipe');
    ok('delete everything', await page.locator('#subjects > li').count() === 0 && await page.locator('#last').isHidden());
    await page.setInputFiles('#restore-file', bpath);
    await page.waitForTimeout(300);
    ok('restore backup', await page.locator('#subjects > li').count() === before && (await txt(page, '#set-msg')).startsWith('Restored ' + before + ' subjects'));
    const badFile = path.join(__dirname, '.bad-test.json'); fs.writeFileSync(badFile, '{"hello": 1}');
    await page.setInputFiles('#restore-file', badFile); await page.waitForTimeout(300);
    ok('bad backup refused, nothing changed', (await txt(page, '#set-msg')).startsWith('That file is not a backup') && await page.locator('#subjects > li').count() === before);
    fs.unlinkSync(bpath); fs.unlinkSync(badFile);
    await ctx.close();

    // ---------- 10. corrupt and blocked storage ----------
    ({ ctx, page } = await newPage({}, '{not json'));
    ok('corrupt saved state: starts fresh with a message', (await txt(page, '#set-msg')).includes('could not be read') && await page.locator('#form').isVisible());
    await ctx.close();
    ({ ctx, page } = await newPage({}, JSON.stringify({ subjects: [{ id: 1, name: 'X', held: 2, att: 9 }, { id: 2, name: 'Good', held: 4, att: 3 }] })));
    ok('impossible saved row dropped, good row kept', await page.locator('#subjects > li').count() === 1);
    await ctx.close();
    ({ ctx, page } = await newPage({}, undefined, () => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); }));
    ok('blocked storage: warning shown and the app still works', await page.locator('#storage-warn').isVisible());
    await add(page, { name: 'Physics', held: 4, att: 4 });
    ok('blocked storage: adding still works', await box(page, 'Physics').count() === 1);
    await ctx.close();

    // ---------- 11. help, theme ----------
    for (const w of [320, 390, 820, 1280]) {
        ({ ctx, page } = await newPage({ viewport: { width: w, height: 800 } }, TERM));
        const hb = page.locator('.help-btn, button:has-text("Help")').first();
        await hb.click();
        const d = page.locator('dialog.help');
        const r = await d.boundingBox();
        ok('help opens inside the screen at ' + w, await d.evaluate(e => e.open) && r.x >= 0 && r.x + r.width <= w + 1 && r.y >= 0 && r.y + r.height <= 801);
        ok('help title at ' + w, (await d.locator('h2').innerText()) === 'How to use Class Attendance Tracker for Students');
        await page.keyboard.press('Escape');
        ok('Escape closes help at ' + w, !(await d.evaluate(e => e.open)));
        await hb.click(); await page.locator('.help-close').click();
        ok('Got it closes help at ' + w, !(await d.evaluate(e => e.open)));
        const tops = await page.evaluate(() => [...document.querySelectorAll('.topbar a, .topbar button')].map(e => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; }));
        let clash = false; for (let i = 0; i < tops.length; i++) for (let j = i + 1; j < tops.length; j++) { const a = tops[i], c = tops[j]; if (Math.min(a[2], c[2]) - Math.max(a[0], c[0]) > 1 && Math.min(a[3], c[3]) - Math.max(a[1], c[1]) > 1) clash = true; }
        ok('top bar buttons do not overlap at ' + w, !clash);
        await ctx.close();
    }
    ({ ctx, page } = await newPage({}, TERM));
    const tbtn = page.locator('.theme-toggle');
    if (await tbtn.count()) {
        const bg1 = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
        await tbtn.click();
        const bg2 = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
        ok('light/dark switch changes the look', bg1 !== bg2 && (await page.evaluate(() => document.documentElement.dataset.theme)) === 'light');
    } else ok('light/dark switch present', false);
    await ctx.close();

    // ---------- 12. screen sizes, filled and cleared, dark and light ----------
    const WIDTHS = [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920];
    for (const scheme of ['dark', 'light']) for (const w of WIDTHS) for (const st of ['filled', 'cleared']) {
        ({ ctx, page } = await newPage({ viewport: { width: w, height: 900 }, colorScheme: scheme }, st === 'filled' ? TERM : undefined));
        const tag = scheme + ' ' + w + ' ' + st + ': ';
        if (st === 'filled') { await page.click('#open-form'); await page.click('#o-more'); await page.selectOption('#f-rule', 'other'); }
        ok(tag + 'no horizontal scroll', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        const out = await page.evaluate(() => [...document.querySelectorAll('main *')].filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.right > innerWidth + 1 || r.left < -1); }).map(e => e.id || e.className).slice(0, 5));
        ok(tag + 'nothing sticks out', !out.length, out);
        if (w >= 900) for (const pos of [0, .5, 1]) {
            await page.evaluate(p => scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * p), pos);
            const ov = await page.evaluate(() => { const bad = []; document.querySelectorAll('main, .col-main, .col-side').forEach(par => { const kids = [...par.children].filter(k => k.offsetParent !== null && getComputedStyle(k).display !== 'contents'); for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) { const a = kids[i].getBoundingClientRect(), c = kids[j].getBoundingClientRect(); if (Math.min(a.right, c.right) - Math.max(a.left, c.left) > 2 && Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top) > 2) bad.push((kids[i].id || kids[i].className) + '/' + (kids[j].id || kids[j].className)); } }); return bad; });
            ok(tag + 'no overlap after scrolling ' + pos * 100 + '%', !ov.length, ov);
        }
        if (w <= 390) {
            const ctl = await page.evaluate(() => { const els = [...document.querySelectorAll('main input:not([type=file]), main select, main button, main a.secondary')].filter(e => e.offsetParent !== null).map(e => [e.id || e.className, e.getBoundingClientRect()]); const bad = []; for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) { const a = els[i][1], c = els[j][1]; if (Math.min(a.right, c.right) - Math.max(a.left, c.left) > 1 && Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top) > 1) bad.push(els[i][0] + '/' + els[j][0]); } return bad; });
            ok(tag + 'no controls overlap', !ctl.length, ctl);
            const ph = await page.evaluate(() => { const c = document.createElement('canvas').getContext('2d'); return [...document.querySelectorAll('input[placeholder]')].filter(e => e.offsetParent !== null).filter(e => { const cs = getComputedStyle(e); c.font = cs.fontSize + ' ' + cs.fontFamily; return c.measureText(e.placeholder).width > e.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) + 1; }).map(e => e.id); });
            ok(tag + 'placeholders fit their boxes', !ph.length, ph);
        }
        if (SHOTS && scheme === 'dark' && st === 'filled' && (w === 1280 || w === 390)) { /* screenshots are taken below */ }
        await ctx.close();
    }

    // ---------- 13. screenshots ----------
    if (SHOTS) {
        ({ ctx, page } = await newPage({ viewport: { width: 1280, height: 900 } }, TERM));
        await page.screenshot({ path: path.join(__dirname, 'screenshots/desktop.png'), fullPage: false });
        await ctx.close();
        ({ ctx, page } = await newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }, TERM));
        await page.screenshot({ path: path.join(__dirname, 'screenshots/phone.png'), fullPage: false });
        await ctx.close();
    }

    // ---------- files ----------
    ok('no console errors', !errors.length, errors.slice(0, 5));
    ok('no failed requests', !failed.length, failed.slice(0, 5));
    ['favicon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'manifest.webmanifest', 'screenshots/desktop.png', 'screenshots/phone.png'].forEach(f => ok('file ' + f, fs.existsSync(path.join(__dirname, f))));
    ok('help.js and theme.js requested', [...requested].some(u => u.endsWith('/help.js')) && [...requested].some(u => u.endsWith('/theme.js')));
    await browser.close(); if (srv) srv.close();
    console.log('UI checks: ' + pass + ' passed, ' + fail + ' failed' + (process.env.BASE ? ' (live: ' + base + ')' : ' (local)'));
    process.exitCode = fail ? 1 : 0;
})();
