// Drives the real page with Playwright. Run from the repo root:
//   node contraction-timer-for-labour/ui-test.js            (starts its own local server)
//   node contraction-timer-for-labour/ui-test.js --base https://umar8092.github.io/apps
process.env.TZ = 'Asia/Karachi';  // same zone as the browser below
const fs = require('fs'), path = require('path'), http = require('http');
let pw; try { pw = require('playwright'); } catch (e) { pw = require('playwright-core'); }
const ROOT = path.join(__dirname, '..'), KEY = 'contraction-timer-for-labour.state';
const argBase = process.argv.indexOf('--base') > 0 ? process.argv[process.argv.indexOf('--base') + 1] : null;
let pass = 0; const fails = [];
function ok(cond, what) { if (cond) pass++; else { fails.push(what); console.log('FAIL: ' + what); } }
function eq(got, want, what) { const g = JSON.stringify(got), w = JSON.stringify(want); ok(g === w, what + (g === w ? '' : ' (got ' + g + ', want ' + w + ')')); }
function has(got, part, what) { ok(String(got).includes(part), what + (String(got).includes(part) ? '' : ' (got ' + JSON.stringify(got) + ', want it to include ' + JSON.stringify(part) + ')')); }

function serve() {
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
    return new Promise(res => {
        const s = http.createServer((q, r) => {
            let p = decodeURIComponent(q.url.split('?')[0]).replace(/^\/apps/, ''); if (p.endsWith('/')) p += 'index.html';
            const f = path.join(ROOT, p);
            if (!f.startsWith(ROOT) || !fs.existsSync(f)) { r.writeHead(404); return r.end('nf'); }
            r.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f));
        }).listen(0, '127.0.0.1', () => res({ s, base: 'http://127.0.0.1:' + s.address().port + '/apps' }));
    });
}
const D = (h, m, s) => new Date(2026, 9, 15, h, m, s || 0).getTime();

(async () => {
    let srv = null, base = argBase;
    if (!base) { srv = await serve(); base = srv.base; }
    const url = base + '/contraction-timer-for-labour/';
    const browser = await pw.chromium.launch();
    const files = new Set();
    async function fresh(width, opts, init) {
        const ctx = await browser.newContext(Object.assign({ viewport: { width: width || 390, height: 900 }, locale: 'en-GB', timezoneId: 'Asia/Karachi', colorScheme: 'dark' }, opts || {}));
        await ctx.route(/goatcounter\.com|gc\.zgo\.at/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
        if (init) await ctx.addInitScript(init.fn, init.arg);
        const page = await ctx.newPage();
        page.errs = [];
        page.on('pageerror', e => page.errs.push(e.message));
        page.on('console', m => { if (m.type() === 'error') page.errs.push(m.text()); });
        page.on('response', r => { if (r.url().startsWith(base)) { files.add(r.url().replace(base, '') + ' ' + r.status()); if (r.status() >= 400) page.errs.push('HTTP ' + r.status() + ' ' + r.url()); } });
        await page.clock.install({ time: D(2, 0, 0) });
        await page.goto(url, { waitUntil: 'load' });
        await page.clock.pauseAt(D(2, 0, 0) + 500);   // time only moves when the test moves it
        return { ctx, page };
    }
    const txt = async (p, sel) => (await p.locator(sel).first().innerText()).replace(/\s+/g, ' ').trim();
    const vis = (p, sel) => p.locator(sel).first().isVisible();
    const saved = p => p.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
    const at = async (p, ms) => { await p.clock.setSystemTime(ms - 1000); await p.clock.runFor(1000); };   // lands exactly on ms, with the page's 1-second tick run
    // time one contraction through the big button
    async function contraction(p, start, lenSec) { await at(p, start); await p.click('#tap'); await at(p, start + lenSec * 1000); await p.click('#tap'); }

    // ===== first use =====
    const { ctx, page: p } = await fresh(390, { permissions: ['clipboard-read', 'clipboard-write'] });
    eq(await txt(p, '#state-label'), 'READY', 'first use: Ready');
    eq(await txt(p, '#clock'), '0:00', 'first use: clock 0:00');
    eq(await txt(p, '#tap'), 'Contraction started', 'first use: start button');
    ok(await vis(p, '#log-empty'), 'first use: empty log message');
    ok(!(await vis(p, '#last-box')), 'first use: no last contraction box');
    ok(!(await vis(p, '#v-checks')), 'first use: no checks');
    eq(await txt(p, '#v-head'), 'Time a few contractions to find out.', 'first use: verdict');
    ok(!(await vis(p, '#forgot-wrap')), 'first use: no forgot link');
    eq(await p.locator('#rule-preset').inputValue(), '511', 'first use: 5-1-1 chosen');
    ok(!(await vis(p, '#custom')), 'custom rule fields hidden');

    // ===== running =====
    await at(p, D(2, 0, 0)); await p.click('#tap');
    eq(await txt(p, '#state-label'), 'CONTRACTION NOW', 'running label');
    eq(await txt(p, '#tap'), 'Contraction ended', 'button becomes ended');
    ok(await vis(p, '#forgot-wrap'), 'forgot link while running');
    await p.clock.runFor(42000);
    eq(await txt(p, '#clock'), '0:42', 'clock counts the contraction');
    // reload while running keeps it
    await p.reload({ waitUntil: 'load' }); await p.clock.runFor(1000);
    eq(await txt(p, '#tap'), 'Contraction ended', 'reload: still running');
    has(await txt(p, '#clock'), '0:4', 'reload: clock continues from the right time');
    await at(p, D(2, 1, 0)); await p.click('#tap');
    eq((await saved(p)).items.length, 1, 'first contraction saved');
    has(await txt(p, '#last-line'), 'Last one: lasted 1:00 (your first one).', 'last line for the first one');
    eq(await txt(p, '#state-label'), 'SINCE THE LAST ONE STARTED', 'between contractions label');
    await at(p, D(2, 3, 0));
    eq(await txt(p, '#clock'), '3:00', 'time since the last one started');
    eq(await txt(p, '#v-head'), 'Not yet. Keep timing.', 'one contraction: not yet');

    // ===== too short tap and undo =====
    await at(p, D(2, 4, 0)); await p.click('#tap'); await at(p, D(2, 4, 2)); await p.click('#tap');
    eq((await saved(p)).items.length, 1, 'tap under 5 s not saved');
    has(await txt(p, '#toast-text'), 'Under 5 seconds', 'short tap message');
    await p.click('#toast-undo');
    eq(await txt(p, '#tap'), 'Contraction ended', 'undo short tap: timing again');
    await at(p, D(2, 5, 0)); await p.click('#tap');
    eq((await saved(p)).items.length, 2, 'second contraction saved');
    await p.clock.runFor(2000);
    has(await txt(p, '#last-line'), '4:00 after the one before', 'apart is start to start (2:00 -> 2:04)');

    // strength
    await p.click('.chip[data-strength="strong"]');
    eq((await saved(p)).items[1].strength, 'strong', 'strength saved');
    eq(await p.getAttribute('.chip[data-strength="strong"]', 'aria-pressed'), 'true', 'strength chip pressed');
    await p.click('.chip[data-strength="strong"]');
    eq((await saved(p)).items[1].strength, '', 'strength cleared by second tap');
    await p.click('.chip[data-strength="medium"]');

    // ===== forgot to stop =====
    await at(p, D(2, 9, 0)); await p.click('#tap');
    await at(p, D(2, 12, 30));
    ok(await vis(p, '#run-long'), 'long-running warning after 3 minutes');
    await p.click('#forgot');
    await p.fill('#forgot-len', 'abc'); await p.click('#forgot-save');
    has(await txt(p, '#forgot-err'), 'Type how long it lasted', 'forgot: bad length refused');
    await p.fill('#forgot-len', '1:05');
    eq(await txt(p, '#forgot-read'), '= 1 min 5 sec', 'forgot: read back');
    await p.click('#forgot-save');
    let st = await saved(p);
    eq([st.items.length, (st.items[2].end - st.items[2].start) / 1000, st.running], [3, 65, null], 'forgot: saved with typed length');
    // ran over 10 minutes then tapped: asks for the length
    await at(p, D(2, 14, 0)); await p.click('#tap'); await at(p, D(2, 26, 0)); await p.click('#tap');
    ok(await vis(p, '#forgot-box'), 'over 10 minutes: asks for the length');
    has(await txt(p, '#forgot-err'), 'over 10 minutes', 'over 10 minutes message');
    await p.click('#forgot-drop');
    eq((await saved(p)).running, null, 'not a contraction: thrown away');
    await p.click('#toast-undo');
    eq((await saved(p)).running, D(2, 14, 0), 'undo brings the timing back');
    await p.click('#forgot'); await p.fill('#forgot-len', '50'); await p.press('#forgot-len', 'Enter');
    st = await saved(p);
    eq([st.items.length, (st.items[3].end - st.items[3].start) / 1000], [4, 50, ], 'plain number = seconds, Enter saves');

    // ===== edit, overlap, delete with undo =====
    await p.locator('#items .item:not(.note) button').last().click();   // the first contraction (02:00)
    ok(await vis(p, '#items .item:last-child #edit-form'), 'edit form opens inside its box');
    await p.fill('#e-len', ''); await p.click('#e-save');
    has(await txt(p, '#e-err'), 'Type how long it lasted', 'edit: blank length refused');
    await p.fill('#e-len', '6:00'); await p.click('#e-save');
    has(await txt(p, '#e-err'), 'overlaps', 'edit: overlap refused');
    await p.fill('#e-len', '1:10'); await p.selectOption('#e-strength', 'mild'); await p.click('#e-save');
    st = await saved(p);
    eq([(st.items[0].end - st.items[0].start) / 1000, st.items[0].strength], [70, 'mild'], 'edit saved');
    await p.locator('#items .item:not(.note) button').last().click();
    await p.fill('#e-start', '23:59:00'); await p.click('#e-save');
    eq((await saved(p)).items[0].start, new Date(2026, 9, 14, 23, 59).getTime(), 'edit start across midnight -> yesterday');
    has(await txt(p, '#items .item:last-child .item-time'), 'Wed', 'yesterday shows the weekday');
    await p.locator('#items .item:not(.note) button').last().click();
    await p.fill('#e-start', '02:00:00'); await p.click('#e-save');
    await p.locator('#items .item:not(.note) button').first().click();   // newest (02:14)
    await p.click('#e-delete');
    eq((await saved(p)).items.length, 3, 'delete');
    await p.click('#toast-undo');
    eq((await saved(p)).items.length, 4, 'undo delete');
    await p.locator('#items .item:not(.note) button').first().click();
    await p.click('#e-cancel');
    ok(!(await vis(p, '#edit-form')), 'cancel closes the form');

    // ===== add one I missed =====
    await p.click('#add-missed');
    await p.fill('#e-start', '02:25:30'); await p.fill('#e-len', '1:00'); await p.click('#e-save');
    has(await txt(p, '#e-err'), 'not happened yet', 'add missed: future end refused (now 02:26)');
    await p.fill('#e-start', '02:19:00'); await p.fill('#e-len', '0:58'); await p.click('#e-save');
    st = await saved(p);
    eq([st.items.length, st.items[4].start], [5, D(2, 19, 0)], 'add missed saved in order');

    // ===== notes =====
    await p.click('#add-note');
    eq(await p.locator('#n-kind').inputValue(), 'waters', 'note: waters broke first');
    eq(await p.locator('#n-at').inputValue(), '02:26', 'note: time defaults to now');
    await p.fill('#n-text', '<b>clear</b> fluid'); await p.click('#n-save');
    eq(await txt(p, '#items .note .note-text'), '<b>clear</b> fluid', 'note text shown as typed, not as HTML');
    ok(await vis(p, '#v-waters'), 'waters warning shown');
    has(await txt(p, '#v-waters'), 'waters broke at 02:26', 'waters warning time');
    await p.click('#items .note button');
    await p.fill('#n-at', '02:10'); await p.click('#n-save');
    eq((await saved(p)).notes[0].at, D(2, 10, 0), 'note time changed');
    await p.click('#items .note button'); await p.click('#n-delete');
    ok(!(await vis(p, '#v-waters')), 'note deleted: warning gone');
    await p.click('#toast-undo');
    ok(await vis(p, '#v-waters'), 'undo note delete');
    await p.evaluate(() => document.querySelector('#add-note').click());
    await p.selectOption('#n-kind', 'other'); await p.fill('#n-text', 'x'.repeat(250)); await p.click('#n-save');
    eq((await saved(p)).notes[1].text.length, 200, 'long note cut to 200 characters');

    // ===== the main situation: 5-1-1 reached =====
    await p.click('#reset');
    eq((await saved(p)).items.length, 0, 'start again clears');
    await p.click('#toast-undo');
    eq((await saved(p)).items.length, 5, 'undo start again');
    await p.click('#reset');
    await p.waitForTimeout(50);
    const T = D(3, 0, 0);
    for (let i = 0; i < 13; i++) await contraction(p, T + i * 300000, 62);
    await at(p, T + 12 * 300000 + 63000);
    eq(await txt(p, '#v-head'), 'Your 5-1-1 rule is reached. Call your midwife or hospital now.', 'main: 5-1-1 reached');
    has(await txt(p, '#v-text'), 'came every 5:00 on average and lasted 1:02', 'main: averages');
    eq(await p.locator('#v-checks li.ok').count(), 3, 'main: three ticks');
    eq(await txt(p, '#v-first'), 'Rule first reached at 04:01.', 'main: first reached at 04:01');
    eq(await txt(p, '#log-count'), '(13)', 'main: count');
    // one contraction earlier it was not reached
    await p.evaluate(k => { const s = JSON.parse(localStorage.getItem(k)); s.items.pop(); localStorage.setItem(k, JSON.stringify(s)); }, KEY);
    await p.reload(); await at(p, T + 11 * 300000 + 63000);
    eq(await txt(p, '#v-head'), 'Not yet. Keep timing.', '56 minutes: not yet');
    has(await txt(p, '#v-text'), 'you have timed 56 min of the 1 hour needed', '56 minutes: says what is missing');
    eq(await p.locator('#v-checks li.no').count(), 1, '56 minutes: one cross');
    await contraction(p, T + 12 * 300000, 62); await at(p, T + 12 * 300000 + 63000);
    has(await txt(p, '#v-head'), 'is reached', 'reached again');

    // 4-1-1 on the same log is not reached; my own rule
    await p.selectOption('#rule-preset', '411');
    has(await txt(p, '#v-text'), 'further apart than 4:00', '4-1-1: says why not');
    await p.selectOption('#rule-preset', 'custom');
    ok(await vis(p, '#custom'), 'custom fields shown');
    await p.fill('#r-apart', '0');
    has(await txt(p, '#rule-err'), 'Apart: type 1 to 15 minutes', 'custom: bad apart refused');
    await p.fill('#r-apart', '6'); await p.fill('#r-last', '45'); await p.fill('#r-hold', '30');
    eq(await txt(p, '#rule-words'), 'Call when: contractions 6 min apart or closer, each lasting 45 sec or more, for 30 min.', 'custom rule words');
    has(await txt(p, '#v-head'), '6-0:45-30 min rule is reached', 'custom rule reached');
    await p.reload(); await p.clock.runFor(1100);
    eq(await p.locator('#rule-preset').inputValue(), 'custom', 'custom rule remembered');
    eq(await p.locator('#r-apart').inputValue(), '6', 'custom value remembered');
    await p.selectOption('#rule-preset', '511');

    // paused
    await at(p, T + 12 * 300000 + 11 * 60000);
    eq(await txt(p, '#v-head'), 'Your contractions have slowed down or stopped.', 'paused after 11 minutes');
    has(await txt(p, '#v-first'), 'Rule first reached at 04:01', 'first reached kept after a pause');
    // a contraction happening now is never "stopped"
    await p.click('#tap'); await p.clock.runFor(1100);
    eq(await txt(p, '#v-head'), 'Not yet. Keep timing.', 'running: not paused');
    await p.clock.runFor(60000); await p.click('#tap');

    // copy and email
    await p.click('#copy');
    const clip = await p.evaluate(() => navigator.clipboard.readText());
    has(clip, 'My rule: 5-1-1', 'copy: rule');
    has(clip, '04:00:00  lasted 1:02  apart 5:00', 'copy: rows');
    has(clip, 'Rule first reached at 04:01', 'copy: first reached');
    has(await txt(p, '#share-msg'), 'Copied', 'copy message');
    await p.focus('#email');
    const mail = await p.getAttribute('#email', 'href');
    ok(mail.startsWith('mailto:?subject=Contraction%20log&body='), 'email link with no recipient');
    has(decodeURIComponent(mail), 'lasted 1:02', 'email has the log');

    // keyboard only
    await p.click('#reset');
    await p.focus('#tap'); await p.keyboard.press('Space');
    eq(await txt(p, '#tap'), 'Contraction ended', 'keyboard: space starts');
    await p.clock.runFor(30000); await p.keyboard.press('Enter');
    eq((await saved(p)).items.length, 1, 'keyboard: enter ends and saves');
    await p.click('#reset'); await p.click('#reset');
    has(await txt(p, '#share-msg'), 'already empty', 'start again on an empty log');
    ok(!p.errs.length, 'no console errors in the main run ' + p.errs.join(' | '));
    await ctx.close();

    // ===== saved state from yesterday + new stretch =====
    {
        const items = [0, 1, 2].map(i => ({ id: 'y' + i, start: D(2, 0) - 20 * 3600000 + i * 300000, end: D(2, 0) - 20 * 3600000 + i * 300000 + 60000 })).concat([{ id: 't0', start: D(1, 50), end: D(1, 51) }]);
        const { ctx, page } = await fresh(390, null, { fn: (s) => localStorage.setItem('contraction-timer-for-labour.state', s), arg: JSON.stringify({ items, notes: [], rule: { preset: '511' } }) });
        await page.clock.runFor(1100);
        has(await txt(page, '#items .item:first-child .item-facts'), 'new stretch', 'long gap marked as a new stretch');
        eq(await page.locator('#items .item').count(), 4, 'saved items restored');
        ok(!page.errs.length, 'no errors with saved state');
        await ctx.close();
    }
    // ===== corrupt and blocked storage =====
    {
        const { ctx, page } = await fresh(390, null, { fn: () => localStorage.setItem('contraction-timer-for-labour.state', '{bad json'), arg: null });
        eq(await txt(page, '#state-label'), 'READY', 'corrupt saved state: starts fresh');
        ok(!page.errs.length, 'corrupt: no errors');
        await ctx.close();
    }
    {
        const { ctx, page } = await fresh(390, null, { fn: () => { Storage.prototype.setItem = function () { throw new Error('blocked'); }; }, arg: null });
        ok(await vis(page, '#storage-warn'), 'blocked storage: warning shown');
        await page.click('#tap'); await page.clock.runFor(30000); await page.click('#tap');
        eq(await page.locator('#items .item').count(), 1, 'blocked storage: still works for this visit');
        ok(!page.errs.length, 'blocked: no errors');
        await ctx.close();
    }

    // ===== layout: forms open on narrow phones, filled state at all widths =====
    const night = require('./shots.js').night();
    for (const w of [320, 360, 390]) {
        const { ctx, page } = await fresh(w, null, { fn: s => { if (!localStorage.getItem('contraction-timer-for-labour.state')) localStorage.setItem('contraction-timer-for-labour.state', s); }, arg: JSON.stringify(night.state) });
        await page.clock.setSystemTime(night.now); await page.clock.runFor(1100);
        const overlaps = () => page.evaluate(() => {
            const k = [...document.querySelectorAll('input:not([type=hidden]), select, button, a.secondary')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).position !== 'fixed' && !e.closest('.toast'); });
            const bad = [];
            for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { if (k[i].contains(k[j]) || k[j].contains(k[i]) || k[i].closest('label.check') ) continue; const a = k[i].getBoundingClientRect(), b = k[j].getBoundingClientRect();
                if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) bad.push((k[i].id || k[i].textContent.trim()) + ' / ' + (k[j].id || k[j].textContent.trim())); }
            return bad;
        });
        const placeholdersFit = () => page.evaluate(() => [...document.querySelectorAll('input[placeholder]')].filter(e => e.offsetWidth > 0).filter(e => {
            const c = document.createElement('canvas').getContext('2d'), cs = getComputedStyle(e); c.font = cs.fontSize + ' ' + cs.fontFamily;
            return c.measureText(e.placeholder).width > e.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight); }).map(e => e.id));
        const noScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
        await page.selectOption('#rule-preset', 'custom');
        await page.locator('#items .item:not(.note) button').first().click();
        eq((await overlaps()).join(), '', w + 'px: no overlapping controls with edit form and custom rule');
        eq((await placeholdersFit()).join(), '', w + 'px: placeholders fit (edit)');
        await page.click('#add-note');
        eq((await overlaps()).join(), '', w + 'px: no overlapping controls with note form');
        eq((await placeholdersFit()).join(), '', w + 'px: placeholders fit (note)');
        await page.click('#n-cancel');
        await page.click('#tap'); await page.clock.runFor(200000); await page.click('#forgot');
        ok(await vis(page, '#run-long'), w + 'px: long warning');
        eq((await overlaps()).join(), '', w + 'px: no overlapping controls with forgot box');
        eq((await placeholdersFit()).join(), '', w + 'px: placeholders fit (forgot)');
        ok(await noScroll(), w + 'px: no horizontal scroll with everything open');
        ok(!page.errs.length, w + 'px: no errors');
        await ctx.close();
    }
    for (const scheme of ['dark', 'light']) for (const w of [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920]) {
        const { ctx, page } = await fresh(w, { colorScheme: scheme }, { fn: s => { if (!localStorage.getItem('contraction-timer-for-labour.state')) localStorage.setItem('contraction-timer-for-labour.state', s); }, arg: JSON.stringify(night.state) });
        await page.clock.setSystemTime(night.now); await page.clock.runFor(1100);
        const check = async (tag) => {
            ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), tag + ': no horizontal scroll');
            const out = await page.evaluate(() => [...document.querySelectorAll('main *')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1) && !e.closest('.sr-only'); }).map(e => e.id || e.className).slice(0, 3));
            eq(out.join(), '', tag + ': nothing sticks out');
            for (const pos of [0, .5, 1]) {
                await page.evaluate(q => scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * q), pos);
                const o = await page.evaluate(() => { const bad = []; document.querySelectorAll('main, .col-main, .col-side').forEach(h => { const k = [...h.children].filter(c => { const r = c.getBoundingClientRect(); return r.height > 4 && getComputedStyle(c).display !== 'none' && getComputedStyle(c).position === 'static'; });
                    for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { const a = k[i].getBoundingClientRect(), b = k[j].getBoundingClientRect(); if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2) bad.push(k[i].className + '/' + k[j].className); } }); return bad; });
                eq(o.join(), '', tag + ': no overlapping blocks at scroll ' + pos);
            }
        };
        await check(scheme + ' ' + w + ' filled');
        if (w >= 900) ok(await page.evaluate(() => { const a = document.querySelector('.col-main').getBoundingClientRect(), b = document.querySelector('.col-side').getBoundingClientRect(); return b.left >= a.right && Math.abs(a.top - b.top) < 2; }), scheme + ' ' + w + ': two columns side by side');
        await page.click('#reset'); await page.waitForTimeout(30);
        await check(scheme + ' ' + w + ' cleared');
        if (w === 1280 && scheme === 'dark') {
            await page.click('.theme-toggle');
            eq(await page.evaluate(() => document.documentElement.dataset.theme), 'light', 'theme switch to light');
            const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
            ok(bg !== 'rgb(20, 6, 13)', 'light background applied');
        }
        if ([320, 390, 820, 1280].includes(w)) {
            await page.evaluate(() => scrollTo(0, 0));
            await page.click('.help-btn');
            const d = page.locator('dialog.help');
            const r = await d.boundingBox();
            ok(r && r.x >= -1 && r.y >= -1 && r.x + r.width <= w + 1 && r.y + r.height <= 901, scheme + ' ' + w + ': help on screen');
            has(await d.locator('h2').innerText(), 'How to use Contraction Timer for Labour', 'help title');
            await page.keyboard.press('Escape'); ok(!(await d.evaluate(e => e.open)), 'Escape closes help');
            await page.click('.help-btn'); await page.click('.help-close'); ok(!(await d.evaluate(e => e.open)), 'Got it closes help');
            const tb = await page.evaluate(() => { const k = [...document.querySelectorAll('.topbar > *')].map(e => e.getBoundingClientRect()); const t = k.map(r => r.top); return Math.max(...t) - Math.min(...t); });
            ok(tb < 8, scheme + ' ' + w + ': top bar on one row');
        }
        ok(!page.errs.length, scheme + ' ' + w + ': no errors ' + page.errs.join(' | '));
        await ctx.close();
    }

    // every file the page asked for answered 200
    const bad = [...files].filter(f => !/ (200|304)$/.test(f));
    eq(bad.join(), '', 'all requested files return 200');
    ['/help.js', '/theme.js', 'style.css', 'core.js', 'script.js'].forEach(f => ok([...files].some(x => x.includes(f)), 'requested ' + f));
    const ctx2 = await browser.newContext(); const pg = await ctx2.newPage();
    for (const f of ['favicon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'manifest.webmanifest', 'sw.js', '../theme.js', '../help.js', 'screenshots/desktop.png', 'screenshots/phone.png']) {
        const r = await pg.request.get(url + f); eq(r.status(), 200, 'file ' + f);
    }
    await ctx2.close();

    await browser.close(); if (srv) srv.s.close();
    console.log('\n' + pass + ' passed, ' + fails.length + ' failed');
    process.exit(fails.length ? 1 : 0);
})();
