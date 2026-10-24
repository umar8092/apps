// Full page test with Playwright: the real situation from the README, every edge case, layouts and themes.
// Run from this folder: node ui-test.js   (add --base https://umar8092.github.io/apps to test the live site)
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), SLUG = 'parking-spot-saver-and-meter-timer';
const bi = process.argv.indexOf('--base'), LIVE = bi > 0 ? process.argv[bi + 1].replace(/\/$/, '') : null;
const at = (h, m, s = 0, day = 25) => Date.UTC(2026, 9, day, h - 5, m, s);   // Karachi time (UTC+5, no daylight saving)
const CAR = { latitude: 24.8607, longitude: 67.0011, accuracy: 12 };
let pass = 0, fail = 0;
function ok(c, name) { if (c) pass++; else { fail++; console.log('FAIL ' + name); } }
function eq(a, b, name) { ok(a === b, name + (a === b ? '' : ': got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b))); }

const srv = http.createServer((q, s) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.startsWith('/apps/')) p = p.slice(5); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); }
    s.writeHead(200, { 'content-type': { html: 'text/html', js: 'text/javascript', css: 'text/css', svg: 'image/svg+xml', png: 'image/png', webmanifest: 'application/manifest+json', json: 'application/json' }[f.split('.').pop()] || 'application/octet-stream' }); s.end(fs.readFileSync(f)); });

srv.listen(0, async () => {
    const BASE = LIVE || 'http://localhost:' + srv.address().port + '/apps';
    const URL_ = BASE + '/' + SLUG + '/';
    const browser = await chromium.launch();
    const errors = [];
    async function open(opts = {}) {
        const ctx = await browser.newContext(Object.assign({ viewport: { width: 390, height: 900 }, locale: 'en-US', timezoneId: 'Asia/Karachi', colorScheme: 'dark',
            permissions: ['geolocation', 'clipboard-read', 'clipboard-write'], geolocation: CAR, acceptDownloads: true }, opts.ctx || {}));
        await ctx.route(/goatcounter\.com|gc\.zgo\.at/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
        const page = await ctx.newPage();
        page.on('pageerror', e => errors.push(e.message));
        page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
        page.on('response', r => { if (r.status() >= 400 && r.url().startsWith(BASE)) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
        if (opts.init) await page.addInitScript(opts.init, SLUG);
        const t0 = opts.time || at(13, 40);
        await page.clock.install({ time: t0 - 20000 });
        await page.goto(URL_);
        await page.clock.pauseAt(t0);   // time now moves only when the test moves it
        return { ctx, page };
    }
    const txt = (page, sel) => page.locator(sel).first().innerText();
    const go = async (page, t) => { await page.clock.setSystemTime(t); await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); };   // the page refreshes when shown again

    // ---------- 1. first use, the worked example ----------
    let { ctx, page } = await open();
    eq(await page.locator('#cars').isVisible(), false, 'empty: car list hidden on a phone');
    eq(await txt(page, '#save-h'), 'Save my parking spot', 'empty: form title');
    eq(await page.locator('.preset[data-v="none"]').getAttribute('aria-pressed'), 'true', 'empty: No time limit chosen by default');
    eq(await txt(page, '#paid-text'), 'No time limit: the app shows how long you have been parked.', 'no-limit hint');
    eq(await page.locator('#car-wrap').isVisible(), false, 'car name is optional and hidden');
    eq(await page.locator('#photo-prev').isVisible(), false, 'photo is optional and hidden');
    await page.fill('#note', 'Level B2, row F, bay 34');
    await page.click('#loc-btn');
    await page.waitForFunction(() => document.getElementById('loc-status').textContent.startsWith('Location added'));
    eq(await txt(page, '#loc-status'), 'Location added (accurate to about 10 m).', 'location added with accuracy');
    eq(await page.locator('#loc-clear').isVisible(), true, 'Remove location button shown');
    await page.click('.preset[data-v="7200000"]');
    eq(await txt(page, '#paid-text'), 'Paid until 3:40 PM (2 h from now).', '2 hours: paid until 3:40 PM');
    eq(await page.inputValue('#warn'), '10', 'warn 10 min by default');
    await page.click('#save-btn');
    eq(await page.locator('#cars').isVisible(), true, 'car list appears after saving');
    eq(await page.locator('.spot').count(), 1, 'one car');
    eq(await txt(page, '.car-name'), 'My car', 'unnamed car is "My car"');
    eq(await txt(page, '.spot .big'), '2 h left', '2 h left at the start');
    eq(await txt(page, '.spot .line'), 'Paid until 3:40 PM', 'paid until 3:40 PM');
    eq(await txt(page, '.spot .parked'), 'Parked at 1:40 PM (less than 1 min ago)', 'parked at 1:40 PM');
    eq(await txt(page, '.spot .note'), 'Where: Level B2, row F, bay 34', 'note shown');
    eq(await txt(page, '.spot .locline'), 'Location saved (about 10 m).', 'location line');
    eq(await page.locator('.spot a.walk').getAttribute('href'), 'https://www.google.com/maps/dir/?api=1&destination=24.8607,67.0011&travelmode=walking', 'walk back link');
    eq(await page.locator('.spot a.walk').getAttribute('target'), '_blank', 'maps opens in a new tab');
    ok((await txt(page, '#save-msg')).startsWith('Saved My car. Paid until 3:40 PM.'), 'saved message');
    eq(await txt(page, '#save-h'), "Save another car's spot", 'form is ready for a second car');
    eq(await page.inputValue('#note'), '', 'form cleared after saving');

    await go(page, at(15, 18));
    eq(await txt(page, '.spot .big'), '22 min left', '15:18: 22 min left');
    eq(await txt(page, '.spot .parked'), 'Parked at 1:40 PM (1 h 38 min ago)', 'parked 1 h 38 min ago');
    eq(await page.locator('.spot').getAttribute('class'), 'spot st-ok', 'ok state');
    await go(page, at(15, 30));
    eq(await page.locator('.spot').getAttribute('class'), 'spot st-soon', '15:30: warning state');
    eq(await txt(page, '.spot .badge'), 'Ending soon', 'Ending soon badge');
    await page.clock.runFor(100);   // the announcement is set 50 ms later
    eq(await txt(page, '#announce'), 'Paid parking ends in 10 min: My car.', 'warning announced');
    eq(await page.title(), '10 min left: My car · Parking', 'tab title warns');

    // +30 min while running, then undo
    await page.click('.spot >> text=+30 min');
    eq(await txt(page, '.spot .line'), 'Paid until 4:10 PM', '+30 min: paid until 4:10 PM');
    eq(await page.locator('.spot').getAttribute('class'), 'spot st-ok', 'back to ok after adding time');
    ok((await txt(page, '#msg-s1')).startsWith('Added 30 min. Paid until 4:10 PM.'), 'added message');
    await page.click('#msg-s1 >> text=Undo');
    eq(await txt(page, '.spot .line'), 'Paid until 3:40 PM', 'undo added time');

    // time runs out
    await go(page, at(15, 41));
    eq(await page.locator('.spot').getAttribute('class'), 'spot st-over', '15:41: over');
    eq(await txt(page, '.spot .big'), 'Paid time ran out', 'ran out text');
    eq(await txt(page, '.spot .line'), 'Ran out 1 min ago, at 3:40 PM', 'ran out 1 min ago');
    eq(await txt(page, '.spot .badge'), 'Time is up', 'Time is up badge');
    eq(await page.title(), 'Time is up: My car · Parking', 'tab title time is up');
    await page.click('.spot >> text=+15 min');
    eq(await txt(page, '.spot .line'), 'Paid until 3:56 PM', '+15 after running out counts from now');
    ok((await txt(page, '#msg-s1')).startsWith('Added 15 min from now.'), 'from now message');
    eq(await page.title(), 'Parking Spot Saver and Meter Timer: Find Your Car, Never Overstay', 'title back to normal');

    // how far, from 200 m south
    await ctx.setGeolocation({ latitude: 24.8607 - 0.0018, longitude: 67.0011, accuracy: 10 });
    await page.click('.spot >> text=How far is my car?');
    await page.waitForFunction(() => document.querySelector('.far-out').textContent.startsWith('Your car'));
    eq(await txt(page, '.far-out'), 'Your car is about 200 m away, to the north.', 'how far: 200 m north');

    // reload keeps everything
    await page.reload(); await page.clock.runFor(1100);
    eq(await page.locator('.spot').count(), 1, 'reload: car still saved');
    eq(await txt(page, '.spot .line'), 'Paid until 3:56 PM', 'reload: paid time kept');
    eq(await txt(page, '.spot .note'), 'Where: Level B2, row F, bay 34', 'reload: note kept');

    // calendar
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('.spot >> text=Add reminder to calendar')]);
    eq(dl.suggestedFilename(), 'parking-ends-my-car.ics', 'calendar file name');
    const ics = fs.readFileSync(await dl.path(), 'utf8');
    ok(ics.includes('DTSTART:20261025T105600Z') && ics.includes('TRIGGER:-PT10M'), 'calendar event at 3:56 PM Karachi with 10 min alarm');
    ok((await txt(page, '#msg-s1')).includes('10 min before 3:56 PM'), 'calendar message');

    // copy (desktop pointer: copies)
    await page.click('.spot >> text=Copy or share');
    await page.waitForFunction(() => document.getElementById('msg-s1').textContent.includes('Copied'));
    eq(await page.evaluate(() => navigator.clipboard.readText()), 'My car is parked at: Level B2, row F, bay 34\nParked at 1:40 PM. Paid until 3:56 PM.\nMap: https://maps.google.com/?q=24.8607,67.0011', 'copied text');

    // change (edit): keep paid time, new note
    await page.click('.spot >> text=Change');
    eq(await txt(page, '#save-h'), 'Change: My car', 'edit title');
    eq(await page.locator('.preset[data-v="keep"]').getAttribute('aria-pressed'), 'true', 'edit keeps paid time by default');
    eq(await txt(page, '#paid-text'), 'Stays as it is: paid until 3:56 PM.', 'keep hint');
    eq(await page.inputValue('#note'), 'Level B2, row F, bay 34', 'edit fills the note');
    eq(await page.inputValue('#car'), 'My car', 'edit shows the name');
    await page.click('#cancel-edit');
    eq(await txt(page, '#save-msg'), 'Nothing changed.', 'cancel edit');
    await page.click('.spot >> text=Change');
    await page.fill('#note', 'Level B3, pillar C7');
    await page.fill('#car', '  Honda  ');
    await page.click('#save-btn');
    eq(await txt(page, '.spot .note'), 'Where: Level B3, pillar C7', 'edit saved note');
    eq(await txt(page, '.car-name'), 'Honda', 'edit renamed (spaces trimmed)');
    eq(await txt(page, '.spot .line'), 'Paid until 3:56 PM', 'edit kept paid time');
    // change paid time through edit: until a time earlier than now = tomorrow
    await page.click('.spot >> text=Change');
    await page.click('.preset[data-v="until"]');
    eq(await page.locator('#until').isVisible(), true, 'until: time field shown');
    eq(await txt(page, '#paid-text'), 'Pick the time on your ticket. A time earlier than now means tomorrow.', 'until hint');
    await page.click('#save-btn');
    eq(await txt(page, '#save-err'), 'Pick the time your parking is paid until.', 'until blank: error');
    await page.fill('#until', '01:30');
    eq(await txt(page, '#paid-text'), 'Paid until tomorrow at 1:30 AM (9 h 49 min from now).', 'until 01:30: tomorrow');
    await page.click('#save-btn');
    eq(await txt(page, '.spot .line'), 'Paid until tomorrow at 1:30 AM', 'midnight crossing saved');

    // second car: no location, other length checks, name defaulting
    await page.fill('#note', 'Street outside the bank, blue sign');
    await page.click('.preset[data-v="other"]');
    eq(await page.locator('#other-box').isVisible(), true, 'other: day/hour/minute fields');
    await page.click('#save-btn'); eq(await txt(page, '#save-err'), 'Type how long you paid for, at least 1 minute.', 'other blank: error');
    await page.fill('#len-h', '0'); await page.click('#save-btn'); eq(await txt(page, '#save-err'), 'Type how long you paid for, at least 1 minute.', 'other 0: error');
    await page.fill('#len-h', '-1'); eq(await txt(page, '#paid-text'), 'Type numbers only, for example 1 hour 30 minutes.', 'other negative: says so');
    await page.click('#save-btn'); eq(await txt(page, '#save-err'), 'Type numbers only, for example 1 hour 30 minutes.', 'other negative: error');
    await page.fill('#len-h', ''); await page.fill('#len-d', '31'); await page.click('#save-btn'); eq(await txt(page, '#save-err'), 'That is more than 30 days. Type a shorter time.', 'other huge: error');
    await page.fill('#len-d', ''); await page.fill('#len-h', '1.5');
    eq(await txt(page, '#paid-text'), 'Paid until 5:11 PM (1 h 30 min from now).', 'other 1.5 hours');
    eq(await page.locator('.spot').count(), 1, 'nothing saved while errors');
    await page.locator('#len-h').press('Enter');   // keyboard submit
    eq(await page.locator('.spot').count(), 2, 'second car saved with Enter');
    eq(await txt(page, '.spot >> nth=0 >> .car-name'), 'Car 2', 'second unnamed car is "Car 2"');
    eq(await txt(page, '#cars-h'), 'Where you parked (2 cars)', 'heading counts cars');
    eq(await page.locator('.spot >> nth=0 >> a.walk').count(), 0, 'no location: no Walk back button');
    eq(await txt(page, '.spot >> nth=0 >> .locline'), 'No location saved. Use the note to find it.', 'no location line');
    eq(await page.locator('.preset[data-v="7200000"]').getAttribute('aria-pressed'), 'true', 'last preset remembered (2 hours), not Other');

    // no time limit car, then "Set paid time"
    await page.click('.preset[data-v="none"]'); await page.click('#save-btn');
    eq(await txt(page, '.spot >> nth=0 >> .big'), 'No time limit', 'no-limit car');
    eq(await page.locator('.spot >> nth=0').getAttribute('class'), 'spot st-free', 'free state');
    await go(page, at(16, 51));   // Car 3 was saved at 15:41:03 (the reloads above each run the clock 1.1 s)
    eq(await txt(page, '.spot >> nth=0 >> .line'), 'Parked 1 h 09 min ago', 'no-limit: parked for');
    await page.click('.spot >> nth=0 >> text=Set paid time');
    eq(await txt(page, '#save-h'), 'Change: Car 3', 'set paid time opens edit');
    await page.click('.preset[data-v="3600000"]'); await page.click('#save-btn');
    eq(await txt(page, '.spot >> nth=0 >> .line'), 'Paid until 5:51 PM', 'paid time set from now');

    // clear with undo
    await page.click('.spot >> nth=0 >> text=I\'m back, clear this spot');
    eq(await page.locator('.spot').count(), 2, 'cleared one');
    eq(await txt(page, '#list-msg span'), 'Cleared Car 3. Welcome back!', 'cleared message');
    eq(await page.locator('#list-msg button').innerText(), 'Undo', 'cleared message has Undo');
    await page.click('#list-msg >> text=Undo');
    eq(await page.locator('.spot').count(), 3, 'undo clear');
    eq(await txt(page, '.spot >> nth=0 >> .car-name'), 'Car 3', 'undo puts it back in place');

    // up to 5 cars
    for (let i = 0; i < 2; i++) await page.click('#save-btn');
    eq(await page.locator('.spot').count(), 5, '5 cars');
    await page.click('#save-btn');
    eq(await txt(page, '#save-err'), 'You can keep up to 5 cars. Clear one you are back at first.', '6th car refused');

    // long pasted note
    await page.click('.spot >> nth=0 >> text=Change');
    await page.evaluate(() => { const n = document.getElementById('note'); n.value = 'x'.repeat(250) + '\u0007\n\n\n\n' + 'y'.repeat(200); });
    await page.click('#save-btn');
    const saved = await page.evaluate(k => JSON.parse(localStorage.getItem(k)), SLUG + '.data');
    eq(saved.spots[0].note.length, 300, 'long pasted note cut to 300');
    // settings remembered
    await page.uncheck('#s-sound'); await page.click('.spot >> nth=0 >> text=Change'); await page.selectOption('#warn', '15'); await page.click('#save-btn');
    await page.reload(); await page.clock.runFor(1100);
    eq(await page.isChecked('#s-sound'), false, 'sound setting remembered');
    eq(await page.inputValue('#warn'), '15', 'warn choice remembered');
    eq(await page.locator('.spot').count(), 5, 'all 5 cars after reload');
    await ctx.close();

    // ---------- 2. location refused, photo, storage problems ----------
    ({ ctx, page } = await open({ ctx: { permissions: [] } }));
    await page.click('#loc-btn');
    await page.waitForFunction(() => /blocked|not available|too long/.test(document.getElementById('loc-status').textContent), null, { timeout: 25000 });
    ok((await txt(page, '#loc-status')).startsWith('Location is blocked for this page.'), 'location refused: clear message');
    // photo: a real image, then a non-image
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==', 'base64');
    await page.click('#photo-add');
    await page.setInputFiles('#photo-in', { name: 'sign.png', mimeType: 'image/png', buffer: png });
    await page.waitForSelector('#photo-prev:not([hidden])');
    eq(await page.locator('#photo-add').isVisible(), false, 'photo preview replaces the add button');
    await page.setInputFiles('#photo-in', { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
    eq(await txt(page, '#photo-err'), 'That file is not a photo. Pick a photo or take a new one.', 'non-image refused');
    await page.setInputFiles('#photo-in', { name: 'broken.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('not really a jpeg') });
    await page.waitForFunction(() => document.getElementById('photo-err').textContent.includes('cannot open'));
    ok(true, 'broken image refused');
    eq(await page.locator('#photo-prev').isVisible(), true, 'earlier good photo kept after a bad one');
    await page.click('#save-btn');
    eq(await page.locator('.spot .photo-btn img').count(), 1, 'photo shown on the car');
    eq(await txt(page, '.spot .locline'), 'No location saved. Use the note and photo.', 'no location, with photo');
    await page.click('.spot .photo-btn'); eq(await page.locator('.spot .photo-btn').getAttribute('aria-expanded'), 'true', 'photo bigger on tap');
    await page.reload(); await page.clock.runFor(1100);
    eq(await page.locator('.spot .photo-btn img').count(), 1, 'photo kept after reload');
    // edit: remove photo
    await page.click('.spot >> text=Change'); await page.click('#photo-remove'); await page.click('#save-btn');
    eq(await page.locator('.spot .photo-btn').count(), 0, 'photo removed by Change');
    eq(await page.evaluate(k => localStorage.getItem(k), SLUG + '.photo.s1'), null, 'photo deleted from storage');
    // corrupt photo and data
    await page.evaluate(s => { localStorage.setItem(s + '.data', JSON.stringify({ spots: [{ id: 's1', parkedAt: Date.now(), hasPhoto: true, car: '<img src=x onerror=alert(1)>' }] })); localStorage.setItem(s + '.photo.s1', 'javascript:alert(1)'); localStorage.setItem(s + '.photo.s99', 'data:image/jpeg;base64,AAAA'); }, SLUG);
    await page.reload(); await page.clock.runFor(1100);
    eq(await page.locator('.spot .photo-btn').count(), 0, 'bad photo ignored');
    eq(await txt(page, '.car-name'), '<img src=x onerror=alert(1)>', 'typed text shown as text, never HTML');
    eq(await page.evaluate(k => localStorage.getItem(k), SLUG + '.photo.s99'), null, 'leftover photo cleaned up');
    await page.evaluate(s => localStorage.setItem(s + '.data', '{bad json'), SLUG);
    await page.reload(); await page.clock.runFor(1100);
    eq(await page.locator('.spot').count(), 0, 'corrupt data: starts fresh');
    await ctx.close();

    ({ ctx, page } = await open({ init: () => { const t = () => { throw new Error('blocked'); }; Object.defineProperty(window, 'localStorage', { get: t }); } }));
    eq(await page.locator('#storage-warn').isVisible(), true, 'storage blocked: warning shown');
    await page.click('.preset[data-v="1800000"]'); await page.click('#save-btn');
    eq(await txt(page, '.spot .big'), '30 min left', 'storage blocked: app still works');
    await ctx.close();

    // reopening after the time ran out long ago: quiet, red
    ({ ctx, page } = await open({ time: at(18, 0), init: s => { if (!sessionStorage.getItem('x')) { sessionStorage.setItem('x', 1); localStorage.setItem(s + '.data', JSON.stringify({ spots: [{ id: 's1', car: 'My car', parkedAt: Date.UTC(2026, 9, 25, 8, 40), endAt: Date.UTC(2026, 9, 25, 10, 40), paidFrom: Date.UTC(2026, 9, 25, 8, 40), warnMin: 10 }] })); } } }));
    await page.clock.runFor(1500);
    eq(await txt(page, '.spot .line'), 'Ran out 2 h 20 min ago, at 3:40 PM', 'reopened later: says how long ago');
    eq(await txt(page, '#announce'), '', 'reopened long after: no alarm');
    await ctx.close();

    // ---------- 3. layouts, themes, help ----------
    for (const scheme of ['dark', 'light']) {
        for (const w of [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920]) {
            ({ ctx, page } = await open({ ctx: { viewport: { width: w, height: 900 }, colorScheme: scheme } }));
            const tag = scheme + ' ' + w + ': ';
            const check = async (state) => {
                const sx = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
                ok(sx <= 0, tag + state + ' no horizontal scroll (' + sx + ')');
                const out = await page.evaluate(() => [...document.querySelectorAll('main *')].filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.right > innerWidth + 1 || r.left < -1) && !e.closest('.vh'); }).slice(0, 3).map(e => e.id || e.className || e.tagName));
                ok(!out.length, tag + state + ' nothing sticks out ' + out.join(','));
                if (w <= 390) {
                    const c = await page.evaluate(() => { const k = [...document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]), select, button, textarea, a.walk')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }); const bad = [];
                        for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { if (k[i].contains(k[j]) || k[j].contains(k[i])) continue; const a = k[i].getBoundingClientRect(), b = k[j].getBoundingClientRect(); if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2) bad.push((k[i].id || k[i].textContent) + '/' + (k[j].id || k[j].textContent)); } return bad.slice(0, 3); });
                    ok(!c.length, tag + state + ' controls do not overlap ' + c.join('; '));
                    const ph = await page.evaluate(() => [...document.querySelectorAll('input[placeholder], textarea[placeholder]')].filter(e => e.offsetWidth).filter(e => { const c = document.createElement('canvas').getContext('2d'); const cs = getComputedStyle(e); c.font = cs.fontSize + ' ' + cs.fontFamily; return c.measureText(e.placeholder).width > e.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight); }).map(e => e.id));
                    ok(!ph.length, tag + state + ' placeholders fit ' + ph.join(','));
                    const wrap = await page.evaluate(() => [...document.querySelectorAll('button, a.walk')].filter(e => e.offsetWidth && e.scrollWidth > e.clientWidth + 1).map(e => e.textContent));
                    ok(!wrap.length, tag + state + ' button text not cut ' + wrap.join(','));
                    const tall = await page.evaluate(() => [...document.querySelectorAll('.row-btns.three button')].filter(e => e.offsetHeight > 52).map(e => e.textContent));
                    ok(!tall.length, tag + state + ' +time buttons on one line ' + tall.join(','));
                }
                if (w >= 900) for (const pos of [0, 0.5, 1]) {
                    await page.evaluate(p => scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * p), pos);
                    const o = await page.evaluate(() => { const bad = []; document.querySelectorAll('main, .app, .col-add, .col-cars').forEach(h => { const k = [...h.children].filter(c => { const r = c.getBoundingClientRect(); return r.width > 4 && r.height > 4 && getComputedStyle(c).display !== 'none'; }); for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { const a = k[i].getBoundingClientRect(), b = k[j].getBoundingClientRect(); if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 4 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 4) bad.push(k[i].className + '/' + k[j].className); } }); return bad; });
                    ok(!o.length, tag + state + ' no overlap at scroll ' + pos + ' ' + o.join(';'));
                }
            };
            await check('empty');
            // filled: two cars, one with long text, and every optional field open
            await page.fill('#note', 'Level B2, row F, bay 34, next to the lifts on the blue side'); await page.click('#loc-btn');
            await page.waitForFunction(() => document.getElementById('loc-status').textContent.startsWith('Location added'));
            await page.click('.preset[data-v="7200000"]'); await page.click('#save-btn');
            await page.click('#car-add'); await page.fill('#car', 'Dad\'s very long named family car with roof box');
            await page.click('.preset[data-v="other"]'); await page.fill('#len-d', '3'); await page.click('#save-btn');
            await page.click('.spot >> nth=1 >> text=Copy or share');
            await page.clock.setSystemTime(at(15, 33)); await page.clock.runFor(1100);
            await page.click('.spot >> nth=0 >> text=Change'); await page.click('.preset[data-v="other"]');
            await check('filled + editing');
            if (w === 320 || w === 390 || w === 820 || w === 1280) {
                await page.evaluate(() => scrollTo(0, 0));
                await page.click('.help-btn');
                const box = await page.locator('dialog.help').boundingBox();
                ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= w && box.y + box.height <= 900, tag + 'help dialog fully on screen');
                eq(await page.locator('dialog.help h2').innerText(), 'How to use Parking Spot Saver', tag + 'help title');
                await page.keyboard.press('Escape'); eq(await page.locator('dialog.help').evaluate(d => d.open), false, tag + 'Escape closes help');
                await page.click('.help-btn'); await page.click('.help-close'); eq(await page.locator('dialog.help').evaluate(d => d.open), false, tag + 'Got it closes help');
                const tb = await page.evaluate(() => [...document.querySelectorAll('.topbar > *')].map(e => e.getBoundingClientRect()).map(r => [r.top, r.height]));
                ok(tb.every(([t, h]) => Math.abs(t - tb[0][0]) < 2 && h < 50), tag + 'top bar buttons on one row');
            }
            // start over: clear both
            await page.click('#cancel-edit');
            await page.click('.spot >> nth=0 >> text=I\'m back, clear this spot'); await page.click('.spot >> nth=0 >> text=I\'m back, clear this spot');
            await check('cleared');
            if (w === 1280 && scheme === 'dark') {
                const before = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
                await page.click('.theme-toggle');
                eq(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), before === 'light' ? 'dark' : 'light', 'theme switch works');
                const bg = await page.evaluate(() => getComputedStyle(document.body).color);
                ok(bg === 'rgb(11, 26, 51)', 'light ink after switch: ' + bg);
            }
            await ctx.close();
        }
    }

    eq(errors.filter(e => !/blocked/.test(e)).length, 0, 'no console errors: ' + errors.slice(0, 3).join(' | '));
    await browser.close(); srv.close();
    console.log(pass + ' passed, ' + fail + ' failed' + (LIVE ? ' (live: ' + LIVE + ')' : ''));
    if (fail) process.exitCode = 1;
});
