// Full page test with Playwright. Run from this folder: node ui-test.js            (serves the repo locally)
//                                                       node ui-test.js --base https://umar8092.github.io/apps   (live site)
// The clock is fixed to Sat 17 Oct 2026, 6:30 pm so every answer is exact.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const SLUG = 'multiple-kitchen-timers-for-cooking', KEY = SLUG + '.data';
const args = process.argv.slice(2), bi = args.indexOf('--base'), LIVE = bi >= 0 ? args[bi + 1].replace(/\/$/, '') : null;
const ROOT = path.resolve(__dirname, '..');
let pass = 0; const fails = [];
const ok = (cond, name) => { if (cond) pass++; else fails.push(name); };
const eq = (got, want, name) => ok(JSON.stringify(got) === JSON.stringify(want), name + ' (got ' + JSON.stringify(got) + ', want ' + JSON.stringify(want) + ')');

function serve() {
    const types = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml', png: 'image/png', webmanifest: 'application/manifest+json', woff2: 'font/woff2' };
    return new Promise(res => { const s = http.createServer((q, r) => {
        let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
        const f = path.join(ROOT, p);
        if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
        r.writeHead(200, { 'content-type': types[f.split('.').pop()] || 'application/octet-stream' }); r.end(fs.readFileSync(f));
    }).listen(0, () => res({ s, base: 'http://localhost:' + s.address().port })); });
}
const T0 = new Date(2026, 9, 17, 18, 30).getTime(), MIN = 60000;

(async () => {
    const srv = LIVE ? null : await serve(), BASE = LIVE || srv.base, URL = BASE + '/' + SLUG + '/';
    const browser = await chromium.launch();
    const errors = [], failedReq = [], requested = new Set();
    async function open(width, opts = {}) {
        const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: opts.scheme || 'dark', serviceWorkers: 'block', locale: 'en-US' });
        await ctx.route(/goatcounter\.com|gc\.zgo\.at/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
        const page = await ctx.newPage();
        page.on('pageerror', e => errors.push(width + ': ' + e.message));
        page.on('console', m => { if (m.type() === 'error') errors.push(width + ': ' + m.text()); });
        page.on('response', r => { requested.add(r.url()); if (r.status() >= 400) failedReq.push(r.status() + ' ' + r.url()); });
        await page.clock.install({ time: (opts.time || T0) - 30000 });   // paused at the exact time once loaded
        if (opts.seed !== undefined) await page.addInitScript(([k, v]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, v); sessionStorage.setItem('seeded', '1'); } }, [KEY, opts.seed]);
        await page.goto(URL);
        await page.clock.pauseAt(opts.time || T0);   // time moves only with runFor, so answers are exact
        return { ctx, page };
    }
    const txt = (p, s) => p.locator(s).first().innerText();
    const names = p => p.locator('#list .tname').allInnerTexts();
    async function add(p, name, h, m, s) { await p.fill('#name', name); await p.fill('#len-h-in', h); await p.fill('#len-m-in', m); await p.fill('#len-s-in', s); await p.click('#start'); }
    const box = (p, name) => p.locator('#list .tbox', { has: p.locator('.tname', { hasText: new RegExp('^' + name + '$') }) });
    const saved = p => p.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);

    // ---------- first use (phone) ----------
    let { ctx, page } = await open(390);
    ok(!(await page.locator('#timers').isVisible()), 'phone: empty timers card hidden on first use');
    eq(await page.locator('#favs .fav-go b').allInnerTexts(), ['Soft-boiled egg', 'Hard-boiled egg', 'Pasta', 'White rice', 'Tea'], 'starter saved timers');
    eq(await txt(page, '#len-text'), 'Tap a length above, or type your own (up to 24 hours).', 'length hint');
    // nothing chosen
    await page.click('#start');
    eq(await txt(page, '#add-err'), 'Choose how long, for example tap 10 min.', 'blank length refused');
    eq(await page.locator('#list .tbox').count(), 0, 'no timer from blank');
    // the main situation: rice 15 min, pasta 10 min, garlic bread 6 min 30 s at 6:30 pm
    await page.fill('#name', 'Rice'); await page.click('.preset[data-ms="900000"]');
    eq(await page.locator('.preset[data-ms="900000"]').getAttribute('aria-pressed'), 'true', 'preset marked');
    eq(await txt(page, '#len-text'), 'Rings at 6:45 PM, 15 min from when you press Start.', 'rings-at preview');
    await page.click('#start');
    ok(/“Rice” started\. Rings at 6:45 PM\./.test(await txt(page, '#add-msg')), 'started message');
    eq(await page.inputValue('#name'), '', 'name cleared after start');
    eq(await page.inputValue('#len-m-in'), '15', 'length kept after start');
    ok(await page.locator('#timers').isVisible(), 'timers card shows once a timer runs');
    await page.fill('#name', 'Pasta'); await page.click('.preset[data-ms="600000"]'); await page.press('#name', 'Enter');
    await add(page, 'Garlic bread', '', '6', '30');
    eq(await names(page), ['Garlic bread', 'Pasta', 'Rice'], 'ends first on top');
    eq(await txt(page, '#summary'), '3 running. Next: Garlic bread in 6:30.', 'summary');
    eq(await box(page, 'Rice').locator('.tends').innerText(), 'Ends at 6:45 PM', 'rice ends 6:45 PM');
    eq(await box(page, 'Garlic bread').locator('[data-act="restart"]').innerText(), 'Restart 6:30', 'restart shows length');
    await page.clock.runFor(2 * MIN);
    eq(await box(page, 'Pasta').locator('.ttime').innerText(), '8:00', 'pasta counts down');
    ok(/^4:30 Garlic bread/.test(await page.title()), 'tab title shows next timer');
    // garlic bread finishes
    await page.clock.runFor(4 * MIN + 30000);
    ok(await box(page, 'Garlic bread').evaluate(e => e.classList.contains('ringing')), 'bread ringing');
    eq(await box(page, 'Garlic bread').locator('.tends').innerText(), 'Done at 6:36 PM. Press Stop alarm.', 'ringing text');
    eq(await page.locator('#announce').textContent(), 'Garlic bread is done.', 'screen reader told');
    ok(/Garlic bread is done!/.test(await txt(page, '#summary')), 'summary says done');
    await page.clock.runFor(1000);
    const t1 = await page.title(); await page.clock.runFor(1000); const t2 = await page.title();
    ok([t1, t2].some(t => t.includes('⏰ Garlic bread done!')), 'title flashes');
    await box(page, 'Garlic bread').locator('[data-act="stop"]').click();
    eq(await names(page), ['Pasta', 'Rice', 'Garlic bread'], 'stopped timer goes to the bottom');
    eq(await box(page, 'Garlic bread').locator('.tbtns button').allInnerTexts(), ['Restart 6:30', '+1 min', 'Remove'], 'done buttons');
    // +1 min on a finished timer
    await box(page, 'Garlic bread').locator('[data-act="plus"]').click();
    eq(await box(page, 'Garlic bread').locator('.ttime').innerText(), '1:00', '+1 min on done runs 1 more minute');
    eq(await names(page), ['Garlic bread', 'Pasta', 'Rice'], 'resorted');
    // pause / resume
    await box(page, 'Pasta').locator('[data-act="pause"]').click();
    const pLeft = await box(page, 'Pasta').locator('.ttime').innerText();
    await page.clock.runFor(3 * MIN);
    eq(await box(page, 'Pasta').locator('.ttime').innerText(), pLeft, 'paused time does not move');
    eq(await box(page, 'Pasta').locator('.tends').innerText(), 'Paused. Press Resume to carry on.', 'paused text');
    await box(page, 'Pasta').locator('[data-act="resume"]').click();
    await box(page, 'Pasta').locator('[data-act="plus"]').click();
    eq(await box(page, 'Pasta').locator('.ttime').innerText(), '4:28', 'resume + 1 min (3:28 left when paused + 1)');
    // change: name and time, Escape cancels, invalid refused
    await box(page, 'Rice').locator('[data-act="edit"]').click();
    await page.keyboard.press('Escape');
    eq(await page.locator('.tedit').count(), 0, 'Escape closes Change');
    await box(page, 'Rice').locator('[data-act="edit"]').click();
    const ed = page.locator('.tedit');
    await ed.locator('input').nth(0).fill('Basmati rice');
    await ed.locator('input').nth(2).fill('-3'); await ed.locator('button[type=submit]').click();
    eq(await ed.locator('.err').innerText(), 'Time cannot be below 0.', 'change refuses negative');
    await ed.locator('input').nth(1).fill(''); await ed.locator('input').nth(2).fill('12'); await ed.locator('input').nth(3).fill('');
    await page.clock.runFor(1000);   // another tick must not wipe what is typed
    eq(await ed.locator('input').nth(2).inputValue(), '12', 'typing kept across ticks');
    await ed.locator('button[type=submit]').click();
    eq(await box(page, 'Basmati rice').locator('.ttime').innerText(), '12:00', 'changed time');
    eq(await box(page, 'Basmati rice').locator('[data-act="restart"]').innerText(), 'Restart 12:00', 'restart uses changed length');
    // restart
    await page.clock.runFor(MIN);
    await box(page, 'Basmati rice').locator('[data-act="restart"]').click();
    eq(await box(page, 'Basmati rice').locator('.ttime').innerText(), '12:00', 'restart');
    // remove with undo
    await box(page, 'Pasta').locator('[data-act="remove"]').click();
    eq((await names(page)).includes('Pasta'), false, 'removed');
    await page.locator('#list-msg button', { hasText: 'Undo' }).click();
    eq((await names(page)).includes('Pasta'), true, 'undo remove');
    // save to saved timers, duplicates
    await box(page, 'Basmati rice').locator('[data-act="fav"]').click();
    ok((await page.locator('#favs .fav-go b').allInnerTexts()).includes('Basmati rice'), 'saved from timer box');
    await box(page, 'Basmati rice').locator('[data-act="fav"]').click();
    ok(/already in Saved timers/.test(await txt(page, '#list-msg')), 'duplicate saved refused');
    // reload keeps everything
    await page.reload();
    eq((await names(page)).sort(), ['Basmati rice', 'Garlic bread', 'Pasta'], 'reload keeps timers');
    ok(await page.locator('#sound-warn').isVisible(), 'sound warning after reload with running timers');
    await page.click('#sound-on');
    await page.waitForTimeout(400);
    ok(!(await page.locator('#sound-warn').isVisible()), 'sound turned on');
    // away for 30 minutes: all finished; shown as done, rings only for 10 min
    await page.clock.runFor(30 * MIN);
    ok((await page.locator('#list .tbox.done').count()) === 3, 'all finished while away');
    ok(await page.locator('#list .tbox.ringing').count() === 0, 'old alarms stopped by themselves after 10 min');
    ok(/^Done \d+ min ago, at /.test(await page.locator('#list .tends').first().innerText()), 'done N min ago');
    // remove finished, then remove all with undo
    await page.click('#clear-done');
    eq(await page.locator('#list .tbox').count(), 0, 'finished removed');
    ok(/Removed 3 finished timers\./.test(await txt(page, '#add-msg')), 'message moves under Add a timer when the list hides');
    await page.locator('#add-msg button', { hasText: 'Undo' }).click();
    eq(await page.locator('#list .tbox').count(), 3, 'undo remove finished');
    await page.click('#clear-all');
    eq(await page.locator('#list .tbox').count(), 0, 'remove all');
    await page.locator('#add-msg button', { hasText: 'Undo' }).click();
    eq(await page.locator('#list .tbox').count(), 3, 'undo remove all');
    await page.click('#clear-all');

    // ---------- odd inputs ----------
    await add(page, '', '', '1,5', '');
    eq(await names(page), ['Timer 1'], 'blank name -> Timer 1, name never forced');
    eq(await page.locator('#list .ttime').first().innerText(), '1:30', '1,5 minutes = 1:30');
    await add(page, '  Oven\n  tray  ', '', '90', '');
    eq(await box(page, 'Oven tray').locator('.ttime').innerText(), '1:30:00', '90 min = 1:30:00, pasted name cleaned');
    for (const [h, m, s, want] of [['', 'ten', '', 'Type the minutes as a number, for example 5.'], ['', '', '-1', 'Time cannot be below 0.'], ['25', '', '', 'The longest timer is 24 hours.'], ['0', '0', '0', 'Choose how long, for example tap 10 min.']]) {
        await add(page, 'x', h, m, s);
        eq(await txt(page, '#add-err'), want, 'refused ' + [h, m, s].join('/'));
    }
    eq(await page.locator('#list .tbox').count(), 2, 'no timers from bad input');
    await add(page, '<img src=x onerror=alert(1)>', '', '5', '');
    eq(await box(page, '<img src=x onerror=alert\\(1\\)>').count(), 1, 'typed HTML shown as text');
    await add(page, 'x'.repeat(80), '', '5', '');
    eq((await names(page)).some(n => n === 'x'.repeat(60)), true, 'long name cut to 60');
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'long name no scroll');
    // limit of 20
    await page.click('#clear-all');
    for (let i = 0; i < 20; i++) await page.evaluate(() => document.querySelector('.fav-go').click());
    await page.locator('.fav-go').first().click();
    ok(/You have 20 timers/.test(await txt(page, '#fav-msg')), '20 timers max');
    // controls on a phone with the Change form open
    await page.locator('#list [data-act="edit"]').first().click();
    const overlap = await page.evaluate(() => { const k = [...document.querySelectorAll('input:not([type=checkbox]), select, button')].filter(e => e.getBoundingClientRect().width > 0); let n = 0;
        for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { if (k[i].contains(k[j]) || k[j].contains(k[i])) continue; const a = k[i].getBoundingClientRect(), b = k[j].getBoundingClientRect(); if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 3 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 3) n++; } return n; });
    eq(overlap, 0, 'no overlapping controls with Change open (390)');
    await page.click('#clear-all');

    // ---------- saved timers ----------
    await page.locator('.fav-go', { hasText: 'Tea' }).click();
    eq(await names(page), ['Tea'], 'saved timer starts in one tap');
    ok(/“Tea” started\. Rings at /.test(await txt(page, '#fav-msg')), 'saved timer message');
    await page.locator('#fav-msg button', { hasText: 'Undo' }).click();
    eq(await page.locator('#list .tbox').count(), 0, 'undo a mistaken tap');
    await page.locator('.fav', { hasText: 'Tea' }).locator('.fav-del').click();
    eq((await page.locator('#favs .fav-go b').allInnerTexts()).includes('Tea'), false, 'saved timer removed');
    await page.locator('#fav-msg button', { hasText: 'Undo' }).click();
    eq((await page.locator('#favs .fav-go b').allInnerTexts()).includes('Tea'), true, 'undo saved removal');
    while (await page.locator('.fav-del').count()) await page.locator('.fav-del').first().click();
    ok(await page.locator('#favs-empty').isVisible() && await page.locator('#starters').isVisible(), 'empty saved list explains and offers examples');
    await page.click('#starters');
    eq(await page.locator('.fav').count(), 5, 'examples back');
    await page.fill('#name', 'Lasagne'); await page.click('.preset[data-ms="2700000"]'); await page.check('#add-save'); await page.click('#start');
    ok((await page.locator('#favs .fav-go b').allInnerTexts()).includes('Lasagne'), 'Also keep it in Saved timers');
    ok(!(await page.isChecked('#add-save')), 'save box unticks after use');
    // settings remembered
    await page.selectOption('#s-sound', 'bell');
    await page.reload();
    eq(await page.inputValue('#s-sound'), 'bell', 'sound choice remembered');
    eq((await saved(page)).favs.some(f => f.name === 'Lasagne'), true, 'saved timers kept');
    await page.selectOption('#s-sound', 'off');
    ok(!(await page.locator('#sound-warn').isVisible()), 'no sound warning when sound is off');
    await page.click('#test-sound');
    ok(/No sound/.test(await txt(page, '#set-msg')), 'Play explains when sound is off');
    await ctx.close();

    // ---------- the alarm is planned on the audio clock at the end time, and Stop cancels it ----------
    ({ ctx, page } = await open(390));
    await page.evaluate(() => {
        window.__starts = []; window.__stops = 0;
        const P = AudioBufferSourceNode.prototype, st = P.start, sp = P.stop;
        P.start = function (when) { if (this.buffer && this.buffer.length > 1) window.__starts.push(when - this.context.currentTime); return st.apply(this, arguments); };
        P.stop = function () { window.__stops++; return sp.apply(this, arguments); };
    });
    await add(page, 'Toast', '', '2', '');
    await page.waitForTimeout(300);
    const starts = await page.evaluate(() => window.__starts.slice());
    ok(starts.length > 30 && Math.abs(Math.min(...starts) - 120) < 2, 'first alarm planned 2 min ahead (got ' + Math.min(...starts).toFixed(1) + ' s, ' + starts.length + ' sounds)');
    ok(Math.abs(Math.max(...starts) - (120 + 585)) < 2, 'last reminder planned just under 10 min after the end');
    await box(page, 'Toast').locator('[data-act="pause"]').click();
    ok(await page.evaluate(() => window.__stops) >= starts.length, 'pause cancels the planned alarm');
    await page.selectOption('#s-sound', 'off');
    await page.evaluate(() => { window.__starts = []; });
    await box(page, 'Toast').locator('[data-act="resume"]').click();
    eq(await page.evaluate(() => window.__starts.length), 0, 'No sound plans nothing');
    await ctx.close();

    // ---------- corrupt saved data ----------
    ({ ctx, page } = await open(390, { seed: '{broken' }));
    eq(await page.locator('.fav').count(), 5, 'corrupt data -> fresh start');
    await ctx.close();
    ({ ctx, page } = await open(390, { seed: JSON.stringify({ timers: [{ id: 'a', name: 'Eggs', status: 'running', length: 360000, total: 360000, endAt: T0 + 120000, created: 1 }, { id: 'b', status: 'boiling' }], favs: 'x', settings: { sound: 'siren' } }) }));
    eq(await names(page), ['Eggs'], 'valid timer kept, broken dropped');
    eq(await page.locator('#list .ttime').innerText(), '2:00', 'restored time left');
    await ctx.close();
    // a timer that finished 4 minutes before the page opened still rings
    ({ ctx, page } = await open(390, { seed: JSON.stringify({ timers: [{ id: 'a', name: 'Cake', status: 'running', length: 1800000, total: 1800000, endAt: T0 - 4 * MIN, created: 1 }] }) }));
    ok(await box(page, 'Cake').evaluate(e => e.classList.contains('ringing')), 'finished while closed: rings on return');
    eq(await box(page, 'Cake').locator('.tends').innerText(), 'Done at 6:26 PM. Press Stop alarm.', 'done time is the real end');
    await ctx.close();

    // ---------- midnight ----------
    ({ ctx, page } = await open(1280, { time: new Date(2026, 9, 17, 23, 50).getTime() }));
    await add(page, 'Bread dough', '', '30', '');
    eq(await page.locator('#list .tends').innerText(), 'Ends tomorrow at 12:20 AM', 'over midnight says tomorrow');
    await page.clock.runFor(15 * MIN);
    eq(await page.locator('#list .tends').innerText(), 'Ends at 12:20 AM', 'after midnight it is today');
    ok(await page.locator('#timers').isVisible(), 'desktop shows the timers card');
    // light/dark switch
    const before = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const sw = page.locator('button', { hasText: /mode/i }).first();
    ok(await sw.count() > 0, 'theme switch present');
    await sw.click();
    ok(before !== await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'theme switch changes colours');
    await ctx.close();

    // ---------- screen sizes with real state, both themes ----------
    const state = JSON.stringify({ v: 1, nextId: 20, favs: [{ id: 'f1', name: 'Soft-boiled egg with a very long name for testing wrapping', ms: 360000 }],
        timers: [{ id: 'a', name: 'Rice', status: 'running', length: 900000, total: 900000, endAt: T0 + 500000, created: 1 },
            { id: 'b', name: 'Garlic bread', status: 'done', length: 390000, total: 390000, endedAt: T0 - 5000, created: 2 },
            { id: 'c', name: 'Pasta', status: 'paused', length: 600000, total: 600000, left: 200000, created: 3 },
            { id: 'd', name: 'Roast chicken', status: 'running', length: 5400000, total: 5400000, endAt: T0 + 5000000, created: 4 },
            { id: 'e', name: 'Eggs', status: 'done', silenced: true, length: 360000, total: 360000, endedAt: T0 - 900000, created: 5 }] });
    for (const scheme of ['dark', 'light']) for (const w of [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920]) {
        ({ ctx, page } = await open(w, { scheme, seed: state }));
        const tag = scheme + ' ' + w + ': ';
        ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), tag + 'no horizontal scroll (filled)');
        if (w >= 900) for (const pos of [0, 0.5, 1]) {
            await page.evaluate(p => scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * p), pos);
            const bad = await page.evaluate(() => { const k = [...document.querySelectorAll('main > *, .col-add > *, .col-run > *')].filter(e => e.getBoundingClientRect().height > 4 && getComputedStyle(e).display !== 'none'); let n = 0;
                const sib = (a, b) => a.parentElement === b.parentElement;
                for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { if (!sib(k[i], k[j])) continue; const a = k[i].getBoundingClientRect(), b = k[j].getBoundingClientRect(); if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 4 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 4) n++; } return n; });
            eq(bad, 0, tag + 'no overlapping blocks at ' + pos * 100 + '%');
        }
        if (w <= 390) {
            const c = await page.evaluate(() => { const k = [...document.querySelectorAll('input:not([type=checkbox]), select, button')].filter(e => e.getBoundingClientRect().width > 0); let n = 0;
                for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { if (k[i].contains(k[j]) || k[j].contains(k[i])) continue; const a = k[i].getBoundingClientRect(), b = k[j].getBoundingClientRect(); if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 3 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 3) n++; } return n; });
            eq(c, 0, tag + 'no overlapping controls');
            // placeholders fit
            const clip = await page.evaluate(() => [...document.querySelectorAll('input[placeholder]')].filter(i => i.offsetWidth && i.scrollWidth > i.clientWidth + 1).map(i => i.id));
            eq(clip, [], tag + 'placeholders fit');
            // button text not clipped
            const cut = await page.evaluate(() => [...document.querySelectorAll('button')].filter(b => b.offsetWidth && b.scrollWidth > b.clientWidth + 1).map(b => b.textContent));
            eq(cut, [], tag + 'button text fits');
        }
        // cleared state
        await page.click('#clear-all');
        ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), tag + 'no horizontal scroll (cleared)');
        if ([320, 390, 820, 1280].includes(w) && scheme === 'dark') {
            await page.evaluate(() => scrollTo(0, 0));
            await page.locator('button.help-btn, button', { hasText: /help/i }).first().click();
            const d = page.locator('dialog.help');
            const r = await d.boundingBox();
            ok(r && r.x >= -1 && r.y >= -1 && r.x + r.width <= w + 1 && r.y + r.height <= 901, tag + 'help fully on screen');
            eq(await d.locator('h2').innerText(), 'How to use Multiple Kitchen Timers', tag + 'help title');
            await page.keyboard.press('Escape');
            ok(!(await d.evaluate(e => e.open)), tag + 'Escape closes help');
            await page.locator('button', { hasText: /help/i }).first().click();
            await page.locator('.help-close').click();
            ok(!(await d.evaluate(e => e.open)), tag + 'Got it closes help');
            const tb = await page.evaluate(() => { const b = [...document.querySelectorAll('.back, button')].filter(e => /All apps|Help|mode/i.test(e.textContent) && e.offsetWidth).map(e => e.getBoundingClientRect()); let n = 0;
                for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) if (Math.min(b[i].right, b[j].right) - Math.max(b[i].left, b[j].left) > 2 && Math.min(b[i].bottom, b[j].bottom) - Math.max(b[i].top, b[j].top) > 2) n++; return n; });
            eq(tb, 0, tag + 'top bar buttons do not overlap');
        }
        await ctx.close();
    }

    // every file the page asked for came back
    for (const f of ['style.css', 'core.js', 'script.js'].map(f => URL + f).concat([BASE + '/help.js', BASE + '/theme.js']))
        ok([...requested].some(u => u.split('?')[0] === f), 'requested ' + f.replace(BASE, ''));
    for (const f of ['favicon.svg', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'sw.js', 'screenshots/desktop.png', 'screenshots/phone.png']) {
        const r = await fetch(URL + f).catch(() => null); ok(r && r.status === 200, f + ' returns 200');
    }
    eq(failedReq, [], 'no failed requests');
    eq(errors, [], 'no console errors');
    await browser.close(); if (srv) srv.s.close();
    console.log((LIVE ? 'LIVE ' : '') + pass + ' passed, ' + fails.length + ' failed');
    fails.forEach(f => console.log('FAIL ' + f));
    process.exit(fails.length ? 1 : 0);
})();
