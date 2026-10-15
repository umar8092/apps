// Drives the real page with Playwright. Run from the repo root:
//   node time-tracker-for-freelancers/ui-test.js            (starts its own local server)
//   node time-tracker-for-freelancers/ui-test.js --base https://umar8092.github.io/apps
process.env.TZ = 'Asia/Karachi';  // same zone as the browser below
const fs = require('fs'), path = require('path'), http = require('http');
let pw; try { pw = require('playwright'); } catch (e) { pw = require('playwright-core'); }
const ROOT = path.join(__dirname, '..');
const argBase = process.argv.indexOf('--base') > 0 ? process.argv[process.argv.indexOf('--base') + 1] : null;
let pass = 0; const fails = [];
function ok(cond, what) { if (cond) pass++; else { fails.push(what); console.log('FAIL: ' + what); } }
function eq(got, want, what) { ok(got === want, what + (got === want ? '' : ' (got ' + JSON.stringify(got) + ', want ' + JSON.stringify(want) + ')')); }

function serve() {
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' };
    return new Promise(res => {
        const s = http.createServer((q, r) => {
            let p = decodeURIComponent(q.url.split('?')[0]).replace(/^\/apps/, '');
            if (p.endsWith('/')) p += 'index.html';
            const f = path.join(ROOT, p);
            if (!f.startsWith(ROOT) || !fs.existsSync(f)) { r.writeHead(404); return r.end('nf'); }
            r.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f));
        }).listen(0, '127.0.0.1', () => res({ s, base: 'http://127.0.0.1:' + s.address().port + '/apps' }));
    });
}

(async () => {
    let srv = null, base = argBase;
    if (!base) { srv = await serve(); base = srv.base; }
    const url = base + '/time-tracker-for-freelancers/';
    const browser = await pw.chromium.launch();
    const START = new Date(2026, 9, 15, 9, 0, 0);   // Thursday 15 Oct 2026, 9:00
    async function fresh(width, opts) {
        const ctx = await browser.newContext(Object.assign({ viewport: { width: width || 390, height: 900 }, locale: 'en-US', timezoneId: 'Asia/Karachi', acceptDownloads: true }, opts || {}));
        await ctx.route(/goatcounter\.com|gc\.zgo\.at/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
        const page = await ctx.newPage();
        page.errs = [];
        page.on('pageerror', e => page.errs.push(e.message));
        page.on('console', m => { if (m.type() === 'error') page.errs.push(m.text()); });
        page.on('response', r => { if (r.status() >= 400 && r.url().startsWith(base)) page.errs.push('HTTP ' + r.status() + ' ' + r.url()); });
        await page.clock.install({ time: START });
        await page.goto(url, { waitUntil: 'load' });
        return { ctx, page };
    }
    const norm = s => s.replace(/[\u202f\u00a0]/g, ' ');  // Chrome puts a narrow space before AM/PM
    const txt = async (p, sel) => norm(await p.locator(sel).first().innerText());
    const vis = (p, sel) => p.locator(sel).first().isVisible();

    // ===== the main situation =====
    const { ctx, page } = await fresh(390, { permissions: ['clipboard-read', 'clipboard-write'] });
    const p = page;
    // first use
    ok(await vis(p, '#entries-empty'), 'first use: empty message');
    eq(await p.locator('#t-client').inputValue(), '__new', 'first use: + New client chosen');
    ok(await vis(p, '#t-new [data-f="name"]'), 'first use: new client form shown');
    ok(!(await vis(p, '#running')), 'no timer at first');
    await p.click('#start');
    eq(await txt(p, '#t-new [data-f="err"]'), 'Type the client name.', 'start with no client name refused');
    ok(!(await vis(p, '#running')), 'still no timer');
    await p.fill('#t-new [data-f="name"]', 'Acme Ltd');
    await p.fill('#t-new [data-f="rate"]', 'abc');
    await p.click('#start');
    ok(/number/.test(await txt(p, '#t-new [data-f="err"]')), 'bad rate refused');
    await p.fill('#t-new [data-f="rate"]', '40');
    eq(await txt(p, '#t-new [data-f="rate-read"]'), 'Rate: 40.00 an hour', 'rate read back with no currency');
    await p.selectOption('#t-new [data-f="sym"]', '$');
    eq(await txt(p, '#t-new [data-f="rate-read"]'), 'Rate: $40.00 an hour', 'rate read back with $');
    await p.selectOption('#t-new [data-f="round"]', '15');
    await p.fill('#t-task', 'Logo redesign');
    await p.press('#t-task', 'Enter');
    ok(await vis(p, '#running'), 'Enter starts the timer');
    eq(await txt(p, '#run-what'), 'Acme Ltd · Logo redesign', 'running: client and work');
    ok(/Started today at 9:00/.test(await txt(p, '#run-since')), 'running: start time');
    eq(await txt(p, '#start'), 'Stop and switch', 'start button becomes Stop and switch');
    ok(!(await vis(p, '#t-new')), 'new client form closes once saved');
    await p.clock.runFor(67 * 60 * 1000);
    eq(await txt(p, '#clock'), '1:07:00', 'clock counts 1:07:00');
    ok((await p.title()).includes('1:07:00'), 'tab title shows the clock');
    await p.click('#stop');
    ok(/Saved 1 h 07 min for Acme Ltd/.test(await txt(p, '#timer-msg')), 'stop saves 1 h 07 min');
    ok(!(await vis(p, '#running')), 'timer gone after stop');
    let entry = p.locator('#days .entry').first();
    ok(/Charged 1 h 15 min = \$50\.00/.test(norm(await entry.innerText())), 'entry charged 1 h 15 min = $50.00 (rounded up to 15)');
    ok(/9:00 AM – 10:07 AM/.test(norm(await entry.innerText())), 'entry shows 9:00 AM – 10:07 AM');
    // undo the stop brings the timer back
    await p.click('#timer-msg .undo');
    ok(await vis(p, '#running'), 'undo stop: timer running again');
    eq(await p.locator('#days .entry').count(), 0, 'undo stop: entry removed');
    await p.click('#stop');
    eq(await p.locator('#days .entry').count(), 1, 'stop again saves');

    // a mistaken tap: under 30 seconds is not saved; blank work is allowed (optional input not forced)
    await p.click('#start');
    ok(await vis(p, '#running'), 'start with blank work is allowed');
    await p.clock.runFor(10 * 1000);
    await p.click('#stop');
    ok(/nothing was saved/.test(await txt(p, '#timer-msg')), 'under 30 seconds not saved');
    eq(await p.locator('#days .entry').count(), 1, 'still one entry');

    // switch client while running: the first timer is saved, the new one starts
    await p.fill('#t-task', 'Logo redesign');
    await p.click('#start');
    await p.clock.runFor(30 * 60 * 1000);   // 10:07 -> 10:37
    await p.selectOption('#t-client', '__new');
    ok(await vis(p, '#t-new [data-f="name"]'), 'new client form while running');
    await p.fill('#t-new [data-f="name"]', 'acme ltd');
    await p.click('#start');
    ok(/already have a client/.test(await txt(p, '#t-new [data-f="err"]')), 'duplicate client name refused');
    await p.fill('#t-new [data-f="name"]', 'Beta Books');
    await p.fill('#t-new [data-f="rate"]', '25,50');
    await p.selectOption('#t-new [data-f="sym"]', '£');
    await p.fill('#t-task', 'Copywriting');
    await p.click('#start');
    ok(/Saved 30 min for Acme Ltd\. Timer started for Beta Books/.test(await txt(p, '#timer-msg')), 'switch saves the first and starts the second');
    eq(await txt(p, '#run-what'), 'Beta Books · Copywriting', 'now running for Beta');

    // forgot to stop: after 8 hours it asks
    await p.clock.runFor(9 * 3600 * 1000);
    ok(await vis(p, '#run-long'), 'after 9 h: forgot-to-stop warning');
    ok(/forget to stop/.test(await txt(p, '#run-long')), 'warning wording');
    await p.click('#forgot');
    ok(await vis(p, '#forgot-box'), 'forgot box opens');
    await p.fill('#stop-time', '09:00');
    await p.click('#stop-at');
    ok(/before the timer started/.test(await txt(p, '#stop-err')), 'stop time before start refused');
    await p.fill('#stop-time', '23:59');
    await p.click('#stop-at');
    ok(/not come yet/.test(await txt(p, '#stop-err')), 'stop time in the future refused');
    await p.fill('#stop-time', '12:17');   // 10:37 + 1 h 40 min
    await p.click('#stop-at');
    ok(/Saved 1 h 40 min for Beta Books/.test(await txt(p, '#timer-msg')), 'saved with the chosen stop time');

    // add time afterwards
    await p.click('#show-add');
    ok(await vis(p, '#add-form'), 'add form opens');
    await p.selectOption('#a-client', { label: 'Acme Ltd ($40.00/h)' });
    await p.fill('#a-task', 'Website fixes');
    await p.check('input[name="a-mode"][value="length"]');
    ok(await vis(p, '#a-length'), 'just how long box shows');
    await p.fill('#a-length', '90');
    await p.click('#add-form button[type=submit]');
    ok(/90m/.test(await txt(p, '#a-err')), '"90" alone asks for 90m');
    await p.fill('#a-length', '50m');
    eq(await txt(p, '#a-preview'), '= 50 min', 'preview 50 min');
    await p.click('#add-form button[type=submit]');
    ok(/Added 50 min for Acme Ltd/.test(await txt(p, '#timer-msg')), 'added 50 min');
    await p.check('input[name="a-mode"][value="times"]');
    await p.fill('#a-date', '2026-10-16');
    await p.fill('#a-start', '09:00'); await p.fill('#a-finish', '10:00');
    await p.click('#add-form button[type=submit]');
    ok(/future/.test(await txt(p, '#a-err')), 'future day refused');
    await p.fill('#a-date', '2026-10-15');
    await p.fill('#a-start', '09:00'); await p.fill('#a-finish', '09:00');
    await p.click('#add-form button[type=submit]');
    ok(/same time/.test(await txt(p, '#a-err')), 'same start and finish refused');
    await p.fill('#a-finish', '');
    await p.click('#add-form button[type=submit]');
    ok(/finish time/.test(await txt(p, '#a-err')), 'blank finish refused');
    await p.fill('#a-start', '09:30'); await p.fill('#a-finish', '10:00');
    ok(/overlaps 9:00 AM–10:07 AM for Acme Ltd/.test(await txt(p, '#a-preview')), 'overlap warning');
    await p.fill('#a-date', '2026-10-14');
    await p.fill('#a-start', '22:30'); await p.fill('#a-finish', '01:15');
    ok(/2 h 45 min \(finishes the next day/.test(await txt(p, '#a-preview')), 'past midnight preview');
    await p.click('#add-form button[type=submit]');
    ok(/Added 2 h 45 min for Acme Ltd on Yesterday/.test(await txt(p, '#timer-msg')), 'past midnight added to yesterday');
    ok(/10:30 PM – 1:15 AM \(next day\)/.test(norm(await p.locator('#days').innerText())), 'entry shows next day');
    await p.click('#a-cancel');
    ok(!(await vis(p, '#add-form')), 'Close hides the add form');

    // what to bill this week
    // Acme: 67->75, 30->30, 50->60, 165->165 = 330 min charged = 5 h 30 min x 40 = 220.00; worked 312 min
    let totals = norm(await p.locator('#client-totals').innerText());
    ok(/Acme Ltd\s*\$220\.00/.test(totals), 'Acme $220.00 this week');
    ok(/Worked 5 h 12 min · Charged 5 h 30 min \(5\.50 h\)/.test(totals), 'Acme worked and charged hours');
    ok(/Beta Books\s*£42\.50/.test(totals), 'Beta £42.50');
    ok(/\$220\.00 \+ £42\.50/.test(await txt(p, '#grand')), 'grand total per currency');
    eq(await txt(p, '#range'), 'Oct 12 – Oct 18, 2026', 'week range Monday to Sunday');
    await p.locator('#client-totals .total').first().getByText('Copy invoice lines').click();
    const clip = await p.evaluate(() => navigator.clipboard.readText());
    eq(clip, ['Acme Ltd - Oct 12 – Oct 18, 2026', 'Work: 2 h 45 min (2.75 h) x $40.00/h = $110.00',
        'Logo redesign: 1 h 45 min (1.75 h) x $40.00/h = $70.00', 'Website fixes: 1 h (1.00 h) x $40.00/h = $40.00', 'Total: 5 h 30 min (5.50 h) = $220.00', 'Each entry rounded up to the next 15 minutes.'].join('\n'), 'invoice lines copied exactly');
    ok(/Copied the invoice lines/.test(await txt(p, '#totals-msg')), 'copy message');
    const mail = await p.locator('#client-totals .total').first().locator('a', { hasText: 'Email' }).getAttribute('href');
    ok(mail.startsWith('mailto:?subject=') && mail.includes(encodeURIComponent('$220.00')), 'email link with no recipient and the total');
    // week start Sunday
    await p.selectOption('#week-start', '0');
    eq(await txt(p, '#range'), 'Oct 11 – Oct 17, 2026', 'week from Sunday');
    await p.selectOption('#week-start', '1');
    // mark as billed, then not billed yet is empty for Acme
    await p.locator('#client-totals .total').first().getByText('Mark as billed').click();
    ok(/Marked 4 entries for Acme Ltd as billed/.test(await txt(p, '#totals-msg')), 'marked 4 entries billed');
    ok(/All of this is marked as billed/.test(await p.locator('#client-totals').innerText()), 'Acme shows all billed');
    eq(await p.locator('#days .tag.billed').count(), 4, 'entries tagged Billed');
    await p.selectOption('#period', 'unbilled');
    totals = norm(await p.locator('#client-totals').innerText());
    ok(!/Acme/.test(totals) && /Beta Books/.test(totals), 'not billed yet shows only Beta');
    await p.click('#totals-msg .undo').catch(() => {});
    await p.selectOption('#period', 'unbilled');
    ok(/Acme/.test(await p.locator('#client-totals').innerText()), 'undo mark-as-billed');
    await p.locator('#client-totals .total').filter({ hasText: 'Acme' }).getByText('Mark as billed').click();
    // rate change keeps billed time; applies to unbilled
    await p.selectOption('#period', 'week');
    await p.locator('#client-list .client').filter({ hasText: 'Beta Books' }).getByText('Edit').click();
    await p.fill('#client-list [data-f="rate"]', '30');
    ok(await vis(p, '#client-list [data-f="apply-wrap"]'), 'apply new rate option shows');
    await p.click('#client-list [data-f="save"]');
    ok(/Beta Books\s*£50\.00/.test(norm(await p.locator('#client-totals').innerText())), 'new rate applied to unbilled Beta time (1 h 40 x 30 = 50.00)');
    await p.locator('#client-list .client').filter({ hasText: 'Acme Ltd' }).getByText('Edit').click();
    await p.fill('#client-list [data-f="rate"]', '60');
    await p.click('#client-list [data-f="save"]');
    ok(/Acme Ltd\s*\$220\.00/.test(norm(await p.locator('#client-totals').innerText())), 'billed Acme time keeps its old rate');

    // a client with no rate: hours only
    await p.click('#add-client');
    await p.fill('#c-new [data-f="name"]', 'Charity Shop');
    await p.click('#c-new [data-f="save"]');
    ok(/Added Charity Shop/.test(await txt(p, '#clients-msg')), 'client added from Clients');
    await p.click('#show-add');
    await p.selectOption('#a-client', { label: 'Charity Shop' });
    await p.check('input[name="a-mode"][value="length"]');
    await p.fill('#a-length', '1:00');
    await p.click('#add-form button[type=submit]');
    totals = norm(await p.locator('#client-totals .total').filter({ hasText: 'Charity Shop' }).innerText());
    ok(/No rate for this client, so hours only/.test(totals) && !/\$|£/.test(totals), 'no-rate client shows hours only');

    // edit an entry, cancel, then change it; delete with undo
    const firstBox = p.locator('#days .entry').first();
    await firstBox.getByText('Edit').click();
    ok(await vis(p, '.edit-form'), 'edit form opens');
    await p.keyboard.press('Escape');
    ok(!(await vis(p, '.edit-form')), 'Escape cancels edit');
    await p.locator('#days .entry').filter({ hasText: 'Charity Shop' }).getByText('Edit').click();
    await p.locator('.edit-form input[type=text]').first().fill('Poster design');
    await p.locator('.edit-form input[type=text]').nth(1).fill('2h');
    await p.locator('.edit-form label.check').first().locator('input').uncheck();
    await p.locator('.edit-form').getByText('Save', { exact: true }).click();
    let ch = await p.locator('#days .entry').filter({ hasText: 'Charity Shop' }).innerText();
    ok(/Poster design/.test(ch) && /2 h/.test(ch) && /Not charged/.test(ch), 'edit saved: work, length and not charged');
    const before = await p.locator('#days .entry').count();
    await p.locator('#days .entry').filter({ hasText: 'Charity Shop' }).getByText('Delete').click();
    eq(await p.locator('#days .entry').count(), before - 1, 'delete removes the entry');
    await p.click('#entries-msg .undo');
    eq(await p.locator('#days .entry').count(), before, 'undo delete');
    // continue starts the same work again
    await p.locator('#days .entry').filter({ hasText: 'Copywriting' }).getByText('Continue').click();
    eq(await txt(p, '#run-what'), 'Beta Books · Copywriting', 'Continue starts the same client and work');

    // reload keeps everything, including the running timer
    await p.clock.runFor(5 * 60 * 1000);
    await p.reload({ waitUntil: 'load' });
    ok(await vis(p, '#running'), 'reload: timer still running');
    { const ck = await txt(p, '#clock'); ok(/^0:0[5-9]:\d\d$/.test(ck), 'reload: timer kept counting ' + ck); }
    ok(/Acme Ltd/.test(await p.locator('#client-totals').innerText()), 'reload: totals kept');
    // throw the timer away with undo
    await p.click('#forgot');
    await p.click('#discard');
    ok(!(await vis(p, '#running')) && /Threw the timer away/.test(await txt(p, '#timer-msg')), 'throw the timer away');
    await p.click('#timer-msg .undo');
    ok(await vis(p, '#running'), 'undo throw away');
    await p.click('#stop');

    // spreadsheet and backup
    const [csvDl] = await Promise.all([p.waitForEvent('download'), p.click('#csv')]);
    const csv = fs.readFileSync(await csvDl.path(), 'utf8');
    ok(csv.includes('Date,Start,Finish,Client') && csv.includes('Acme Ltd,Logo redesign,67,75,1.25,40.00,50.00,$,Billed 2026-10-15'), 'spreadsheet rows');
    const [bk] = await Promise.all([p.waitForEvent('download'), p.click('#backup')]);
    const bkPath = await bk.path();
    const saved = JSON.parse(fs.readFileSync(bkPath, 'utf8'));
    eq(saved.clients.length, 3, 'backup has 3 clients');
    await p.click('#wipe');
    ok(await vis(p, '#entries-empty'), 'delete everything empties');
    await p.click('#settings-msg .undo');
    eq(await p.locator('#client-list .client').count(), 3, 'undo delete everything');
    await p.click('#wipe');
    await p.setInputFiles('#restore-file', bkPath);
    await p.waitForTimeout(300);
    ok(/Restored 3 clients/.test(await txt(p, '#settings-msg')), 'restore backup');
    const junk = path.join(__dirname, '..', '.ui-junk.json'); fs.writeFileSync(junk, '{"nope":1}');
    await p.setInputFiles('#restore-file', junk); await p.waitForTimeout(300); fs.unlinkSync(junk);
    ok(/no clients or hours/.test(await txt(p, '#settings-msg')), 'wrong backup refused');
    // delete a client with undo
    await p.locator('#client-list .client').filter({ hasText: 'Charity Shop' }).getByText('Delete').click();
    ok(/Deleted Charity Shop and 1 entry/.test(await txt(p, '#clients-msg')), 'delete client and its entry');
    await p.click('#clients-msg .undo');
    eq(await p.locator('#client-list .client').count(), 3, 'undo delete client');
    // very long names wrap, never overflow
    await p.locator('#client-list .client').filter({ hasText: 'Charity Shop' }).getByText('Edit').click();
    await p.fill('#client-list [data-f="name"]', 'W'.repeat(40));
    await p.click('#client-list [data-f="save"]');
    ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'long client name: no sideways scroll');
    // custom dates the other way round
    await p.selectOption('#period', 'custom');
    await p.fill('#from', '2026-10-20'); await p.dispatchEvent('#from', 'change');
    await p.fill('#to', '2026-10-01'); await p.dispatchEvent('#to', 'change');
    eq(await txt(p, '#range'), 'Oct 1 – Oct 20, 2026', 'custom dates swapped');
    await p.selectOption('#period', 'lastmonth');
    ok(await vis(p, '#totals-empty'), 'last month empty message');
    await p.selectOption('#period', 'week');
    ok(p.errs.length === 0, 'no console errors in the main run: ' + p.errs.join(' | '));

    // ===== screen sizes with this filled-in state =====
    const state = await p.evaluate(() => localStorage.getItem('time-tracker-for-freelancers.state'));
    await ctx.close();
    for (const scheme of ['dark', 'light']) for (const w of [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920]) {
        const { ctx: c2, page: q } = await fresh(w, { colorScheme: scheme });
        await q.evaluate(s => localStorage.setItem('time-tracker-for-freelancers.state', s), state);
        await q.reload({ waitUntil: 'load' });
        await q.fill('#t-task', 'Logo redesign'); await q.click('#start');
        await q.click('#show-add');
        const tag = scheme + ' ' + w + ': ';
        const check = async (what) => {
            ok(await q.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), tag + what + ' no sideways scroll');
            const bad = await q.evaluate(() => [...document.querySelectorAll('main *')].filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.right > innerWidth + 1 || r.left < -1); }).map(e => e.tagName + '.' + e.className).slice(0, 3));
            ok(!bad.length, tag + what + ' nothing sticks out ' + bad.join(','));
            if (w <= 390) {
                const o = await q.evaluate(() => {
                    const els = [...document.querySelectorAll('input:not([type=hidden]):not([type=file]), select, button, a.secondary')].filter(e => e.offsetParent && e.getBoundingClientRect().width);
                    const out = [];
                    for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
                        const a = els[i].getBoundingClientRect(), b = els[j].getBoundingClientRect();
                        if (els[i].contains(els[j]) || els[j].contains(els[i])) continue;
                        if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) out.push((els[i].id || els[i].textContent.trim().slice(0, 15)) + ' / ' + (els[j].id || els[j].textContent.trim().slice(0, 15)));
                    }
                    return out;
                });
                ok(!o.length, tag + what + ' controls do not overlap ' + o.slice(0, 3).join('; '));
                // placeholders fit their boxes
                const clip = await q.evaluate(() => [...document.querySelectorAll('input[placeholder]')].filter(e => e.offsetParent).filter(e => {
                    const c = document.createElement('canvas').getContext('2d'); const cs = getComputedStyle(e); c.font = cs.fontSize + ' ' + cs.fontFamily;
                    return c.measureText(e.placeholder).width > e.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) + 1;
                }).map(e => e.id || e.dataset.f));
                ok(!clip.length, tag + what + ' placeholders fit ' + clip.join(','));
            }
            if (w >= 900) for (const pos of [0, 0.5, 1]) {
                await q.evaluate(f => scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * f), pos);
                const ov = await q.evaluate(() => {
                    const out = [];
                    document.querySelectorAll('main, .col-main, .col-side').forEach(par => {
                        const kids = [...par.children].filter(k => k.offsetParent && getComputedStyle(k).display !== 'contents');
                        for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
                            const a = kids[i].getBoundingClientRect(), b = kids[j].getBoundingClientRect();
                            if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) out.push(kids[i].className + '/' + kids[j].className);
                        }
                    });
                    return out;
                });
                ok(!ov.length, tag + 'blocks do not overlap at scroll ' + pos + ' ' + ov.join(';'));
            }
        };
        await check('filled');
        await q.check('input[name="a-mode"][value="length"]');
        await q.selectOption('#a-client', '__new');
        await q.selectOption('#t-client', '__new');
        await q.click('#forgot');
        await q.locator('#days .entry').first().getByText('Edit').click();
        await q.click('#add-client');
        await check('all optional fields open');
        await q.locator('.edit-form input[type=radio][value="length"]').check();
        await check('edit in length mode');
        // start over state
        await q.locator('.edit-form').getByText('Cancel').click();
        await q.click('#discard');
        await q.click('#wipe');
        await check('after delete everything');
        // help
        if ([320, 390, 820, 1280].includes(w)) {
            await q.evaluate(() => scrollTo(0, 0));
            await q.click('.help-btn');
            const box = await q.locator('dialog.help').boundingBox();
            ok(box && box.x >= -1 && box.x + box.width <= w + 1 && box.y >= -1 && box.y + box.height <= 901, tag + 'help dialog inside the screen');
            ok(/How to use Time Tracker for Freelancers/.test(await q.locator('dialog.help').innerText()), tag + 'help title');
            await q.keyboard.press('Escape');
            ok(!(await q.locator('dialog.help').evaluate(d => d.open)), tag + 'Escape closes help');
            await q.click('.help-btn'); await q.click('.help-close');
            ok(!(await q.locator('dialog.help').evaluate(d => d.open)), tag + 'Got it closes help');
            const bar = await q.evaluate(() => [...document.querySelectorAll('.topbar > *')].map(e => e.getBoundingClientRect()).map(r => [r.top, r.bottom, r.left, r.right]));
            let clash = false; for (let i = 0; i < bar.length; i++) for (let j = i + 1; j < bar.length; j++) if (Math.min(bar[i][3], bar[j][3]) - Math.max(bar[i][2], bar[j][2]) > 1 && Math.min(bar[i][1], bar[j][1]) - Math.max(bar[i][0], bar[j][0]) > 1) clash = true;
            ok(!clash, tag + 'top bar buttons do not overlap');
        }
        ok(!q.errs.length, tag + 'no console errors ' + q.errs.join(' | '));
        await c2.close();
    }

    // ===== light/dark switch =====
    {
        const { ctx: c3, page: q } = await fresh(390, { colorScheme: 'dark' });
        await q.click('.theme-toggle');
        eq(await q.evaluate(() => document.documentElement.dataset.theme), 'light', 'theme switch to light');
        const bg = await q.evaluate(() => getComputedStyle(document.body).backgroundColor);
        ok(bg !== 'rgb(8, 18, 31)', 'light background applied');
        await c3.close();
    }
    // ===== corrupt and blocked storage =====
    for (const bad of ['{bad', '[]', 'null', '{"clients":"x","entries":[{"id":1}],"timer":{"client":"c1","startMs":"x"}}']) {
        const { ctx: c4, page: q } = await fresh(390);
        await q.evaluate(s => localStorage.setItem('time-tracker-for-freelancers.state', s), bad);
        await q.reload({ waitUntil: 'load' });
        ok(await vis(q, '#entries-empty') && !q.errs.length, 'corrupt saved state starts fresh: ' + bad);
        await c4.close();
    }
    {
        const { ctx: c5, page: q } = await fresh(390);
        await q.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
        await q.reload({ waitUntil: 'load' });
        ok(await vis(q, '#storage-warn'), 'blocked storage: warning shown');
        await q.fill('#t-new [data-f="name"]', 'Solo'); await q.click('#start');
        ok(await vis(q, '#running') && !q.errs.length, 'blocked storage: still works');
        await c5.close();
    }
    // ===== files the page needs =====
    {
        const { ctx: c6, page: q } = await fresh(1280);
        for (const f of ['favicon.svg', 'manifest.webmanifest', 'sw.js', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', '../help.js', '../theme.js', 'core.js', 'script.js', 'style.css', 'screenshots/desktop.png', 'screenshots/phone.png']) {
            const r = await q.request.get(new URL(f, url).href); eq(r.status(), 200, 'file ' + f);
        }
        await q.goto(base + '/', { waitUntil: 'load' }).catch(() => {});
        const card = q.locator('a[href*="time-tracker-for-freelancers"]').first();
        if (await card.count()) { await card.click(); await q.waitForLoadState('load'); ok(q.url().includes('/time-tracker-for-freelancers/'), 'hub card opens the app'); }
        else ok(false, 'hub lists the app');
        await c6.close();
    }

    await browser.close();
    if (srv) srv.s.close();
    console.log(pass + ' UI checks passed' + (fails.length ? ', ' + fails.length + ' FAILED' : ''));
    process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
