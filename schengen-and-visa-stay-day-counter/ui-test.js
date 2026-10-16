// Full page test with Playwright. Run from the repo root or this folder: node ui-test.js
//   BASE=https://umar8092.github.io/apps node ui-test.js   tests the live site
//   node ui-test.js --shots                                 also saves screenshots/desktop.png and phone.png
// "Today" is fixed to Fri 16 Oct 2026 in Pakistan time so every answer can be checked exactly.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), SLUG = 'schengen-and-visa-stay-day-counter', KEY = SLUG + '.state';
const SHOTS = process.argv.includes('--shots');
const NOW = new Date('2026-10-16T10:00:00+05:00');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; if (!cond) console.log('FAIL ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra).slice(0, 300) : '')); };

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
    async function newPage(opts, now) {
        const ctx = await browser.newContext(Object.assign({ viewport: { width: 390, height: 844 }, acceptDownloads: true, timezoneId: 'Asia/Karachi', colorScheme: 'dark' }, opts || {}));
        await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new globalThis.URL(base).origin });
        await ctx.route(/goatcounter\.com|gc\.zgo\.at/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
        const page = await ctx.newPage();
        await page.clock.setFixedTime(now || NOW);
        page.on('pageerror', e => errors.push(e.message));
        page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
        page.on('request', r => { if (r.url().startsWith(base)) requested.add(r.url()); });
        page.on('response', r => { if (r.status() >= 400 && r.url().startsWith(base)) failed.push(r.status() + ' ' + r.url()); });
        await page.goto(URL, { waitUntil: 'networkidle' });
        return { ctx, page };
    }
    const txt = (page, sel) => page.locator(sel).innerText();
    async function addTrip(page, entry, exit, note) {
        await page.fill('#f-entry', entry);
        if (exit === null) { if (!(await page.isChecked('#f-still'))) await page.check('#f-still'); }
        else await page.fill('#f-exit', exit);
        if (note) { if (await page.locator('#o-note').isVisible()) await page.click('#o-note'); await page.fill('#f-note', note); }
        await page.click('#save');
    }
    const AYESHA = [['2026-03-01', '2026-04-15', 'Spain'], ['2026-06-01', '2026-06-20', 'Paris and Rome'], ['2026-08-10', '2026-09-05', 'Berlin and Prague']];

    // ---------- first use and the main situation ----------
    let { ctx, page } = await newPage();
    ok('title', (await page.title()).startsWith('Schengen and Visa Stay Day Counter'));
    ok('first use: form right under today', await page.evaluate(() => document.getElementById('app').classList.contains('setup')));
    let st = await txt(page, '#st-body');
    ok('empty: 0 of 90', st.includes('0') && st.includes('of 90 days used'), st);
    ok('empty: full stay', st.includes('Enter today and you can stay until Wed 13 Jan 2027') && st.includes('90 days'), st);
    ok('empty: hint to add trips', st.includes('Add your trips'), st);
    ok('empty list message', await page.locator('#empty').isVisible());
    ok('note optional is hidden', !(await page.locator('#f-note').isVisible()));
    ok('plan leave day optional is hidden', !(await page.locator('#p-exit').isVisible()));
    ok('only one traveller: no switcher', !(await page.locator('#who').isVisible()));
    // blank submit
    await page.click('#save');
    ok('blank entry error', (await txt(page, '#e-entry')).length > 0);
    ok('blank exit error', (await txt(page, '#e-exit')).length > 0);
    // exit before entry
    await page.fill('#f-entry', '2026-06-20'); await page.fill('#f-exit', '2026-06-01'); await page.click('#save');
    ok('exit before entry error', (await txt(page, '#e-exit')).includes('before'));
    await page.fill('#f-entry', ''); await page.fill('#f-exit', '');
    // preview
    await page.fill('#f-entry', '2026-06-01'); await page.fill('#f-exit', '2026-06-20');
    ok('preview counts both days', (await txt(page, '#preview')).startsWith('20 days'), await txt(page, '#preview'));
    await page.fill('#f-entry', ''); await page.fill('#f-exit', '');
    for (const t of AYESHA) await addTrip(page, ...t);
    st = await txt(page, '#st-body');
    ok('ayesha 47 of 90', st.startsWith('47') && st.includes('43 days left today'), st);
    ok('ayesha stay until 17 Dec', st.includes('Enter today and you can stay until Thu 17 Dec 2026') && st.includes('63 days'), st);
    ok('ayesha days back 28 Nov', st.includes('Days start coming back on Sat 28 Nov 2026'), st);
    ok('ayesha full again 5 Dec', st.includes('Full 90 days again from Sat 5 Dec 2026'), st);
    ok('no longer setup', !(await page.evaluate(() => document.getElementById('app').classList.contains('setup'))));
    ok('three trip boxes', await page.locator('li.box:not(.cbox)').count() === 3);
    const boxes = await page.locator('#list li.box').allInnerTexts();
    ok('newest first', boxes[0].includes('10 Aug to 5 Sep 2026') && boxes[2].includes('1 Mar to 15 Apr 2026'), boxes);
    ok('paris counts and stops 17 Dec', boxes[1].includes('Counts') && boxes[1].includes('Stops counting on Thu 17 Dec 2026'), boxes[1]);
    ok('spain no longer counts', boxes[2].includes('No longer counts'), boxes[2]);
    ok('trip note shown', boxes[1].includes('Paris and Rome'));

    // planning
    await page.fill('#p-entry', '2026-11-01');
    let po = await txt(page, '#p-out');
    ok('plan 1 Nov until 2 Jan', po.includes('Enter on Sun 1 Nov 2026 and you can stay until Sat 2 Jan 2027') && po.includes('63 days') && po.includes('47 of 90'), po);
    ok('plan offers last day', (await txt(page, '#p-save')).includes('2 Jan 2027'));
    await page.click('#p-save');
    ok('last day filled in', (await page.inputValue('#p-exit')) === '2027-01-02');
    ok('last day fits with 90', (await txt(page, '#p-out')).includes('used 90 of 90'), await txt(page, '#p-out'));
    await page.fill('#p-exit', '2027-01-20');
    po = await txt(page, '#p-out');
    ok('plan too long', po.includes('too long') && po.includes('Sun 3 Jan 2027') && po.includes('Leave by Sat 2 Jan 2027'), po);
    await page.fill('#p-exit', '2026-12-20');
    po = await txt(page, '#p-out');
    ok('plan fits', po.includes('fits: 50 days') && po.includes('77 of 90'), po);
    await page.fill('#p-entry', '2026-10-01');
    ok('plan in the past refused', (await txt(page, '#p-err')).includes('today or a later day'));
    await page.fill('#p-entry', '2026-11-01'); await page.fill('#p-exit', '2026-10-25');
    ok('plan leave before enter', (await txt(page, '#p-err')).includes('before'));
    await page.fill('#p-exit', '2026-12-20');
    await page.click('#p-save');
    ok('planned trip saved', (await page.locator('#list li.box.planned').count()) === 1);
    ok('plan form cleared', (await page.inputValue('#p-entry')) === '' && !(await page.locator('#p-exit').isVisible()));
    st = await txt(page, '#st-body');
    ok('planned trip limits today: Berlin 27 + planned 50 + 13 new = 90 on 20 Dec', st.includes('stay until Wed 28 Oct 2026') && st.includes('13 days'), st);
    // undo the planned trip
    await page.click('#list-msg .undo');
    ok('undo planned trip', (await page.locator('#list li.box.planned').count()) === 0);
    ok('undo restored answer', (await txt(page, '#st-body')).includes('Thu 17 Dec 2026'));

    // edit a mistake: Berlin should end 4 Sep
    await page.locator('#list li.box', { hasText: 'Berlin' }).getByRole('button', { name: /^Edit/ }).click();
    ok('edit mode', (await txt(page, '#form-h')) === 'Edit trip' && (await page.inputValue('#f-exit')) === '2026-09-05');
    await page.fill('#f-exit', '2026-09-04'); await page.click('#save');
    ok('edited count 46', (await txt(page, '#st-body')).startsWith('46'));
    await page.click('#form-msg .undo');
    ok('undo edit', (await txt(page, '#st-body')).startsWith('47'));
    // cancel edit
    await page.locator('#list li.box', { hasText: 'Spain' }).getByRole('button', { name: /^Edit/ }).click();
    await page.click('#cancel');
    ok('cancel edit', (await txt(page, '#form-h')) === 'Add a trip' && (await page.inputValue('#f-entry')) === '');
    // delete with undo
    await page.locator('#list li.box', { hasText: 'Paris' }).getByRole('button', { name: /^Delete/ }).click();
    ok('deleted', (await txt(page, '#st-body')).startsWith('27'));
    await page.click('#list-msg .undo');
    ok('undo delete', (await txt(page, '#st-body')).startsWith('47'));

    // reload keeps state
    await page.reload({ waitUntil: 'networkidle' });
    ok('reload keeps trips', (await txt(page, '#st-body')).startsWith('47') && await page.locator('#list li.box').count() === 3);

    // copy and email
    await page.click('#copy');
    const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
    ok('copy summary', clip.includes('47 of 90 days used, 43 left') && clip.includes('Thu 17 Dec 2026'), clip);
    const mail = await page.getAttribute('#mail', 'href');
    ok('email without recipient', mail.startsWith('mailto:?subject=') && decodeURIComponent(mail).includes('47 of 90 days used'));

    // backup and restore
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#backup')]);
    const bfile = await dl.path(); const backup = fs.readFileSync(bfile, 'utf8');
    ok('backup has trips', JSON.parse(backup).state.counters[0].trips.length === 3);
    await page.click('#wipe');
    ok('wipe empties', (await txt(page, '#st-body')).startsWith('0') && (await page.locator('#list li.box').count()) === 0);
    await page.click('#set-msg .undo');
    ok('undo wipe', (await page.locator('#list li.box').count()) === 3);
    await page.click('#wipe');
    await page.setInputFiles('#restore-file', bfile);
    await page.waitForTimeout(200);
    ok('restore backup', (await page.locator('#list li.box').count()) === 3 && (await txt(page, '#set-msg')).includes('3 trips'));
    await page.setInputFiles('#restore-file', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"nope":1}') });
    await page.waitForTimeout(200);
    ok('bad backup refused', (await txt(page, '#set-msg')).includes('not a backup') && (await page.locator('#list li.box').count()) === 3);

    // still there now
    await addTrip(page, '2026-10-01', null, 'Vienna');
    st = await txt(page, '#st-body');
    ok('inside now', st.includes('You are there now, since Thu 1 Oct 2026') && st.includes('Last day you can stay: Thu 12 Nov 2026') && st.includes('27 more days after today'), st);
    ok('inside used 63', st.startsWith('63'), st);
    ok('ongoing badge', (await txt(page, '#list li.box.ongoing')).includes('There now'));
    const [ics] = await Promise.all([page.waitForEvent('download'), page.click('#cal')]);
    const icsText = fs.readFileSync(await ics.path(), 'utf8');
    ok('calendar file', icsText.includes('DTSTART;VALUE=DATE:20261112') && ics.suggestedFilename().endsWith('.ics'));
    await page.fill('#p-entry', '2026-12-01');
    ok('plan notes open trip', (await txt(page, '#p-out')).includes('counted up to today only'));
    await page.fill('#p-entry', '');
    // second open trip refused
    await page.fill('#f-entry', '2026-10-10'); await page.check('#f-still'); await page.click('#save');
    ok('second open trip refused', (await txt(page, '#e-still')).includes('Another trip'));
    ok('exit field hidden while still there', !(await page.locator('#f-exit').isVisible()));
    await page.uncheck('#f-still'); await page.fill('#f-entry', '');

    // another traveller with another rule
    await page.click('#c-new');
    await page.click('#c-save');
    ok('traveller name required', (await txt(page, '#e-cname')).length > 0);
    await page.fill('#c-name', 'Ali, tax days'); await page.selectOption('#c-rule', 'custom');
    await page.fill('#c-n', '200'); await page.fill('#c-m', '100'); await page.click('#c-save');
    ok('bad rule refused', (await txt(page, '#e-crule')).includes('fewer'));
    await page.selectOption('#c-rule', '183/365'); await page.click('#c-save');
    ok('switched to new traveller', (await txt(page, '#rule-line')).includes('Ali, tax days: 183 days in any 365 days'));
    ok('switcher shows', await page.locator('#who').isVisible());
    ok('new traveller empty', (await txt(page, '#st-body')).startsWith('0') && (await txt(page, '#st-body')).includes('183 days'));
    await page.selectOption('#who', { label: 'Schengen area (90/180)' });
    ok('switch back', (await txt(page, '#st-body')).startsWith('63'));
    // delete traveller with undo
    await page.locator('#counters li', { hasText: 'Ali' }).getByRole('button', { name: /^Delete/ }).click();
    ok('traveller deleted', await page.locator('#counters li').count() === 1);
    await page.click('#c-msg .undo');
    ok('traveller undo', await page.locator('#counters li').count() === 2);
    // edit the rule of the current traveller
    await page.locator('#counters li', { hasText: 'Schengen' }).getByRole('button', { name: /^Edit/ }).click();
    ok('edit rule prefilled', (await page.inputValue('#c-rule')) === '90/180' && (await page.inputValue('#c-name')) === 'Schengen area');
    await page.click('#c-cancel');
    await ctx.close();

    // ---------- odd inputs and saved data ----------
    ({ ctx, page } = await newPage());
    // overstay in the past
    await addTrip(page, '2026-05-01', '2026-08-10');
    st = await txt(page, '#st-body');
    ok('overstay shown', st.includes('The rule was broken on Thu 30 Jul 2026') && st.includes('91 days'), st);
    ok('overstay trip red', (await page.locator('#list li.box.over').count()) === 1 && (await txt(page, '#list li.box.over')).includes('Over the limit from Thu 30 Jul 2026'));
    // a same-day trip counts 1
    await page.click('#wipe');
    await addTrip(page, '2026-10-16', '2026-10-16');
    ok('same day = 1 day', (await txt(page, '#list li.box')).includes('1 day'));
    // all 90 used
    await page.click('#wipe');
    await addTrip(page, '2026-07-01', '2026-09-28');
    st = await txt(page, '#st-body');
    ok('cannot enter today', st.includes('You cannot enter today. Earliest day to enter: Mon 28 Dec 2026') && st.includes('0 days left'), st);
    await page.fill('#p-entry', '2026-12-01');
    ok('plan blocked', (await txt(page, '#p-out')).includes('Earliest day to enter: Mon 28 Dec 2026'));
    // very long note pasted
    await page.fill('#p-entry', '');
    await page.click('#wipe');
    await page.click('#o-note');
    await page.fill('#f-note', 'Paris, Rome, Vienna, Prague, Berlin, Amsterdam, Brussels, Lisbon, Madrid, Barcelona and more places');
    await page.fill('#f-entry', '2026-09-01'); await page.fill('#f-exit', '2026-09-03'); await page.click('#save');
    ok('long note kept to 80', (await page.evaluate(k => JSON.parse(localStorage.getItem(k)).counters[0].trips[0].note.length, KEY)) <= 80);
    // overlapping trips
    await addTrip(page, '2026-09-02', '2026-09-06');
    ok('overlap counted once', (await txt(page, '#st-body')).startsWith('6'));
    ok('overlap noted', (await txt(page, '#list')).includes('Shared days are counted once'));
    // a trip longer than 3 years
    await page.fill('#f-entry', '2020-01-01'); await page.fill('#f-exit', '2026-01-01'); await page.click('#save');
    ok('too long trip refused', (await txt(page, '#e-exit')).includes('3 years'));
    // corrupt saved state
    await page.evaluate(k => localStorage.setItem(k, '{broken'), KEY);
    await page.reload({ waitUntil: 'networkidle' });
    ok('corrupt state: fresh start', (await txt(page, '#st-body')).startsWith('0') && (await txt(page, '#set-msg')).includes('started fresh'));
    // half-bad saved state keeps the good trips
    await page.evaluate(k => localStorage.setItem(k, JSON.stringify({ counters: [{ id: 'a', name: 'Me', n: 90, m: 180, trips: [{ id: 'x', entry: '2026-10-01', exit: '2026-10-05' }, { id: 'y', entry: 'bad' }] }], cur: 'a' })), KEY);
    await page.reload({ waitUntil: 'networkidle' });
    ok('half-bad state', (await txt(page, '#st-body')).startsWith('5') && await page.locator('#list li.box').count() === 1);
    // a new day moves the count on: 6 Apr 2027, 180 days later, Oct days dropped out
    await ctx.close();
    ({ ctx, page } = await newPage({}, new Date('2027-04-06T10:00:00+05:00')));
    await page.evaluate(k => localStorage.setItem(k, JSON.stringify({ counters: [{ id: 'a', name: 'Me', n: 90, m: 180, trips: [{ id: 'x', entry: '2026-10-01', exit: '2026-10-05' }] }], cur: 'a' })), KEY);
    await page.reload({ waitUntil: 'networkidle' });
    ok('second use months later', (await txt(page, '#st-body')).startsWith('0') && (await txt(page, '#list li.box')).includes('No longer counts'));
    await ctx.close();

    // storage blocked
    ({ ctx, page } = await newPage());
    await page.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
    await page.reload({ waitUntil: 'networkidle' });
    ok('storage blocked warning', await page.locator('#storage-warn').isVisible());
    await addTrip(page, '2026-06-01', '2026-06-20');
    ok('works without storage', (await txt(page, '#st-body')).startsWith('20'));
    await ctx.close();

    // ---------- keyboard only ----------
    ({ ctx, page } = await newPage());
    await page.focus('#f-entry'); await page.keyboard.type('06012026');
    await page.focus('#f-exit'); await page.keyboard.type('06202026');
    await page.focus('#save'); await page.keyboard.press('Enter');
    ok('keyboard add', (await txt(page, '#st-body')).startsWith('20'), await txt(page, '#st-body'));
    ok('buttons have names', await page.evaluate(() => [...document.querySelectorAll('button')].every(b => (b.getAttribute('aria-label') || b.textContent).trim().length > 0)));
    ok('inputs have labels', await page.evaluate(() => [...document.querySelectorAll('input:not([type=file]), select')].every(i => i.labels && i.labels.length || i.getAttribute('aria-label'))));
    await ctx.close();

    // ---------- layout with filled state: no overlap, no sideways scroll ----------
    for (const scheme of ['dark', 'light']) {
        for (const w of [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920]) {
            ({ ctx, page } = await newPage({ viewport: { width: w, height: 900 }, colorScheme: scheme }));
            await page.evaluate(([k, s]) => localStorage.setItem(k, s), [KEY, JSON.stringify({ counters: [
                { id: 'a', name: 'Schengen area', n: 90, m: 180, trips: [{ id: '1', entry: '2026-03-01', exit: '2026-04-15', note: 'Spain' }, { id: '2', entry: '2026-06-01', exit: '2026-06-20', note: 'Paris and Rome' }, { id: '3', entry: '2026-08-10', exit: '2026-09-05', note: 'Berlin and Prague' }, { id: '4', entry: '2026-10-10', exit: null, note: 'A very long note about many places visited in one trip across Europe' }] },
                { id: 'b', name: 'Ali, a rather long traveller name here', n: 183, m: 365, trips: [] }], cur: 'a' })]);
            await page.reload({ waitUntil: 'networkidle' });
            await page.click('#o-note'); await page.click('#o-pexit'); await page.fill('#p-entry', '2026-12-01'); await page.fill('#p-exit', '2027-03-20');
            await page.click('#c-new'); await page.selectOption('#c-rule', 'custom');
            const tag = scheme + ' ' + w;
            ok('no sideways scroll ' + tag, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
            if (w <= 390) {
                const bad = await page.evaluate(() => { const k = [...document.querySelectorAll('input:not([type=hidden]):not([type=file]), select, button')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.height; }); const out = [];
                    for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { const a = k[i].getBoundingClientRect(), b = k[j].getBoundingClientRect(); if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2) out.push(k[i].id + '/' + k[j].id); } return out; });
                ok('no overlapping controls ' + tag, bad.length === 0, bad);
                const clipped = await page.evaluate(() => [...document.querySelectorAll('input[placeholder]')].filter(i => i.offsetWidth && i.scrollWidth > i.clientWidth + 1).map(i => i.id));
                ok('placeholders fit ' + tag, clipped.length === 0, clipped);
            }
            if (w >= 900) for (const pos of [0, 0.5, 1]) {
                await page.evaluate(p => scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * p), pos);
                const o = await page.evaluate(() => { const k = [...document.querySelectorAll('.app > *, .col-main > *, .col-side > *')].filter(c => getComputedStyle(c).display !== 'none' && c.getBoundingClientRect().height > 4); const out = [];
                    for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { if (k[i].contains(k[j]) || k[j].contains(k[i]) || k[i].parentElement !== k[j].parentElement) continue; const a = k[i].getBoundingClientRect(), b = k[j].getBoundingClientRect(); if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 4 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 4) out.push(k[i].className + '/' + k[j].className); } return out; });
                ok('no overlap at scroll ' + pos + ' ' + tag, o.length === 0, o);
            }
            if (w >= 900) ok('desktop two columns ' + tag, await page.evaluate(() => document.querySelector('.col-side').getBoundingClientRect().left > document.querySelector('.col-main').getBoundingClientRect().right));
            await ctx.close();
        }
    }

    // ---------- help dialog and theme switch ----------
    for (const w of [320, 390, 820, 1280]) {
        ({ ctx, page } = await newPage({ viewport: { width: w, height: 800 } }));
        await page.click('.help-btn');
        const box = await page.locator('dialog.help').boundingBox();
        ok('help inside screen ' + w, box && box.x >= 0 && box.y >= 0 && box.x + box.width <= w && box.y + box.height <= 800);
        ok('help title ' + w, (await page.locator('dialog.help h2').innerText()).includes('Schengen and Visa Stay Day Counter'));
        await page.keyboard.press('Escape');
        ok('help escape ' + w, !(await page.locator('dialog.help').evaluate(d => d.open)));
        await page.click('.help-btn'); await page.click('.help-close');
        ok('help got it ' + w, !(await page.locator('dialog.help').evaluate(d => d.open)));
        const [a, b, c] = await Promise.all(['a.back', '.help-btn', '.theme-toggle'].map(s => page.locator(s).first().boundingBox()));
        const over = (p, q) => p && q && Math.min(p.x + p.width, q.x + q.width) - Math.max(p.x, q.x) > 1 && Math.min(p.y + p.height, q.y + q.height) - Math.max(p.y, q.y) > 1;
        ok('top bar no overlap ' + w, !over(a, b) && !over(b, c) && !over(a, c) && Math.abs(a.y - b.y) < 10);
        if (w === 390) {
            const before = await page.evaluate(() => getComputedStyle(document.body).color);
            await page.click('.theme-toggle');
            ok('theme switch changes look', before !== await page.evaluate(() => getComputedStyle(document.body).color));
        }
        await ctx.close();
    }

    // ---------- files ----------
    for (const f of ['favicon.svg', 'manifest.webmanifest', 'sw.js', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'core.js', 'script.js', 'style.css', '../help.js', '../theme.js']) {
        const r = await fetch(new globalThis.URL(f, URL)).catch(() => null);
        ok('file ' + f, r && r.status === 200);
    }
    if (!process.env.BASE) for (const f of ['screenshots/desktop.png', 'screenshots/phone.png']) ok('exists ' + f, fs.existsSync(path.join(__dirname, f)) || SHOTS);

    // ---------- screenshots ----------
    if (SHOTS) {
        for (const [name, vp, scale] of [['desktop', { width: 1280, height: 1180 }, 1], ['phone', { width: 390, height: 844 }, 2]]) {
            ({ ctx, page } = await newPage({ viewport: vp, deviceScaleFactor: scale }));
            for (const t of AYESHA) await addTrip(page, ...t);
            await page.evaluate(() => document.querySelectorAll('.msg').forEach(m => { m.textContent = ''; m.classList.remove('show'); }));
            await page.fill('#p-entry', '2026-11-01'); await page.click('#o-pexit'); await page.fill('#p-exit', '2026-12-20');
            await page.locator('#p-exit').blur(); await page.evaluate(() => scrollTo(0, 0));
            await page.screenshot({ path: path.join(__dirname, 'screenshots', name + '.png'), fullPage: name === 'desktop' ? false : false });
            await ctx.close();
        }
    }

    ok('no console errors', errors.length === 0, errors);
    ok('no failed requests', failed.length === 0, failed);
    await browser.close(); if (srv) srv.close();
    console.log(pass + ' passed, ' + fail + ' failed' + (process.env.BASE ? ' (live: ' + base + ')' : ''));
    process.exit(fail ? 1 : 0);
})();
