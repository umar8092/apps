// Drives the real page in headless Chromium: node ui-test.js [--shots] [--base https://umar8092.github.io/apps]
// Without --base it opens the local file. With --base it tests the LIVE page.
const pw = (() => { for (const m of ['playwright', 'playwright-core', '/opt/node-tools/node_modules/playwright']) { try { return require(m); } catch (e) { /* next */ } } throw new Error('playwright not found'); })();
const path = require('path'), fs = require('fs');
const bi = process.argv.indexOf('--base');
const url = bi > 0 ? process.argv[bi + 1].replace(/\/$/, '') + '/subscription-tracker/' : 'file://' + path.join(__dirname, 'index.html');
const shots = process.argv.includes('--shots');
let fail = 0;
const ok = (name, cond) => { if (!cond) fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name); };
const NOW = new Date(2026, 9, 9, 10, 0);   // Friday 9 Oct 2026
// the README situation: [name, price, how often, date, status]
const LIST = [['Netflix', '15.49', '1-month', '2026-10-12', 'active'], ['Spotify', '11.99', '1-month', '2026-09-21', 'active'], ['iCloud+', '2.99', '1-month', '2026-10-28', 'active'],
    ['Amazon Prime', '139', '1-year', '2027-03-02', 'active'], ['Gym', '10.00', '1-week', '2026-10-05', 'active'], ['The Daily News', '4', '1-month', '2026-10-14', 'trial'],
    ['Disney+', '13.99', '1-month', '', 'cancelled'], ['Audible', '14.95', '1-month', '', 'paused']];

async function load(b, vp, opt = {}) {
    const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: vp.width < 500 ? 2 : 1, colorScheme: opt.theme || 'dark', acceptDownloads: true,
        permissions: url.startsWith('http') ? ['clipboard-read', 'clipboard-write'] : [], storageState: opt.state });
    const p = await ctx.newPage();
    await p.clock.install({ time: opt.time || NOW });
    p.errors = []; p.on('console', m => m.type() === 'error' && p.errors.push(m.text())); p.on('pageerror', e => p.errors.push(String(e)));
    p.bad = []; p.on('response', r => { if (r.status() >= 400) p.bad.push(r.status() + ' ' + r.url()); });
    await p.goto(url, { waitUntil: url.startsWith('http') ? 'networkidle' : 'load' });
    return p;
}
async function openForm(p) { if (await p.locator('#open-form').isVisible()) await p.click('#open-form'); }
async function add(p, [name, price, cyc, date, st], extra = {}) {
    await openForm(p);
    await p.fill('#f-name', name);
    await p.check('input[name=st][value=' + st + ']', { force: true });
    await p.fill('#f-price', price);
    await p.selectOption('#f-cycle', cyc);
    if (extra.every) { await p.fill('#f-every', extra.every); await p.selectOption('#f-unit', extra.unit); }
    if (await p.locator('#f-date').isVisible()) await p.fill('#f-date', date);
    if (extra.note) { await p.click('#add-note'); await p.fill('#f-note', extra.note); }
    await p.click('#save');
}
const txt = (p, sel) => p.textContent(sel);
const names = p => p.$$eval('.subs > li:not(.gone) .s-name', e => e.map(x => x.textContent));
async function layout(p) {
    return p.evaluate(() => {
        const W = document.documentElement.clientWidth, bad = [], inter = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
        if (document.documentElement.scrollWidth > W) bad.push('page scrolls sideways');
        document.querySelectorAll('main *').forEach(e => { const r = e.getBoundingClientRect(); if (r.width && (r.right > W + 1 || r.left < -1) && !e.closest('.seg') ) bad.push('sticks out: ' + e.tagName + '.' + e.className); });
        const vis = l => [...l].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
        [document.querySelector('main').children, document.querySelector('.col-main').children, document.querySelectorAll('.subs > li'), document.querySelectorAll('#result > *')].forEach(g => {
            const v = vis(g); for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) if (inter(v[i].getBoundingClientRect(), v[j].getBoundingClientRect())) bad.push('overlap ' + (v[i].className || v[i].tagName) + ' x ' + (v[j].className || v[j].tagName));
        });
        const c = vis(document.querySelectorAll('main input:not([type=radio]):not([type=file]), main select, main button, .seg span, main a.secondary'));
        for (let i = 0; i < c.length; i++) for (let j = i + 1; j < c.length; j++) if (!c[i].contains(c[j]) && !c[j].contains(c[i]) && inter(c[i].getBoundingClientRect(), c[j].getBoundingClientRect())) bad.push('controls overlap ' + (c[i].id || c[i].className || c[i].textContent) + ' / ' + (c[j].id || c[j].className || c[j].textContent));
        return bad.slice(0, 6);
    });
}

(async () => {
    const b = await pw.chromium.launch();

    // ---- the real situation, on a phone and on a laptop
    for (const [label, vp] of [['phone', { width: 390, height: 844 }], ['desktop', { width: 1280, height: 900 }]]) {
        const p = await load(b, vp), t = s => label + ': ' + s;
        ok(t('first use: form open, no totals, no list'), await p.locator('#form').isVisible() && await p.locator('#result').isHidden() && await p.locator('#list-card').isHidden());
        ok(t('first use: example button shown, share tools hidden'), await p.locator('#demo').isVisible() && await p.locator('#share-tools').isHidden());
        ok(t('note is optional and hidden behind a button'), await p.locator('#note-box').isHidden() && (await txt(p, '#add-note')).includes('(optional)'));
        ok(t('date label says Next payment date'), (await txt(p, '#date-label')) === 'Next payment date');

        // mistakes in the form
        await p.click('#save');
        ok(t('blank name is refused with a message'), (await txt(p, '#form-err')).includes('Type a name') && await p.locator('#result').isHidden());
        await p.fill('#f-name', 'Netflix'); await p.click('#save');
        ok(t('blank price is refused'), (await txt(p, '#form-err')).includes('Type the price'));
        for (const [v, m] of [['-5', 'negative'], ['abc', 'as a number'], ['99999999', 'too big']]) { await p.fill('#f-price', v); await p.click('#save'); ok(t('price "' + v + '" is refused'), (await txt(p, '#form-err')).includes(m)); }
        await p.fill('#f-price', '9.99'); await p.selectOption('#f-cycle', 'custom');
        ok(t('Other shows Every [n] [unit]'), await p.locator('#custom').isVisible());
        await p.fill('#f-every', '0'); await p.click('#save');
        ok(t('every 0 is refused'), (await txt(p, '#form-err')).includes('whole number from 1 to 24'));
        await p.fill('#f-every', '30'); await p.click('#save');
        ok(t('every 30 months is refused'), (await txt(p, '#form-err')).includes('1 to 24'));
        await p.selectOption('#f-cycle', '1-month');
        await p.check('input[name=st][value=trial]', { force: true });
        ok(t('trial changes the labels'), (await txt(p, '#date-label')) === 'Trial ends (first payment date)' && (await txt(p, '#price-label')) === 'Price after the trial');
        await p.click('#save');
        ok(t('trial with no end date is refused'), (await txt(p, '#form-err')).includes('free trial ends'));
        await p.fill('#f-date', '2026-10-01'); await p.click('#save');
        ok(t('trial end date in the past is refused'), (await txt(p, '#form-err')).includes('has passed'));
        await p.check('input[name=st][value=paused]', { force: true });
        ok(t('paused hides the date'), await p.locator('#date-box').isHidden());
        await p.check('input[name=st][value=active]', { force: true });
        await p.fill('#f-name', ''); await p.fill('#f-price', ''); await p.fill('#f-date', '');

        // enter the README list
        for (const s of LIST) await add(p, s, s[0] === 'Netflix' ? { note: 'Cancel in Account > Membership' } : {});
        ok(t('no error left in the form'), (await txt(p, '#form-err')) === '');
        ok(t('total 89.39 a month'), (await txt(p, '#r-month')) === '89.39');
        ok(t('1,072.64 a year, 6 subscriptions'), (await txt(p, '#r-year')) === '1,072.64 a year · 6 subscriptions');
        ok(t('next 7 days 29.49, next 30 days 74.47'), (await txt(p, '#r-7')) === '29.49' && (await txt(p, '#r-30')) === '74.47');
        ok(t('trial warning names the day and the price'), (await txt(p, '#alerts')).includes('The Daily News: free trial ends Wed 14 Oct (in 5 days). Cancel before then if you do not want to pay 4.00.'));
        ok(t('coming up starts with Netflix on Mon 12 Oct'), (await txt(p, '#upcoming li:first-child')).includes('Netflix') && (await txt(p, '#upcoming li:first-child')).includes('Mon 12 Oct, in 3 days'));
        ok(t('Spotify (date in the past) rolled to Wed 21 Oct'), (await p.locator('#upcoming li', { hasText: 'Spotify' }).textContent()).includes('Wed 21 Oct'));
        ok(t('gym 4 times in the next 30 days'), (await p.locator('#upcoming li', { hasText: 'Gym' }).count()) === 4);
        ok(t('biggest cost: Gym 43.33 (48%)'), (await txt(p, '#bars li:first-child')).includes('Gym') && (await txt(p, '#bars li:first-child')).includes('43.33 (48%)'));
        ok(t('paused and cancelled summary with savings'), (await txt(p, '#r-other')) === '1 paused (not counted) · 1 cancelled, saving you 167.88 a year.');
        ok(t('8 boxes in the list, sorted by next payment, paused and cancelled last'), JSON.stringify(await names(p)) === JSON.stringify(['Gym', 'Netflix', 'The Daily News', 'Spotify', 'iCloud+', 'Amazon Prime', 'Audible', 'Disney+']));
        ok(t('weekly gym shows its monthly average'), (await p.locator('.subs li', { hasText: 'Gym' }).textContent()).includes('every week · 43.33 a month on average'));
        ok(t('note is shown on its card'), (await p.locator('.subs li', { hasText: 'Netflix' }).textContent()).includes('Cancel in Account > Membership'));
        ok(t('each subscription sits in its own bordered box'), await p.$$eval('.subs > li', l => l.every(e => parseFloat(getComputedStyle(e).borderTopWidth) >= 1)));
        if (shots) {
            await p.click('#cancel'); await p.evaluate(() => window.scrollTo(0, 0));
            await p.screenshot({ path: path.join(__dirname, 'screenshots', label === 'phone' ? 'phone.png' : 'desktop.png'), fullPage: true, clip: label === 'phone' ? { x: 0, y: 0, width: 390, height: 1500 } : { x: 0, y: 0, width: 1280, height: 1360 } });
        }

        // edit, cancel edit
        await p.click('.subs li:has-text("Spotify") .edit');
        ok(t('Edit fills the form'), (await p.inputValue('#f-name')) === 'Spotify' && (await p.inputValue('#f-price')) === '11.99' && (await txt(p, '#save')) === 'Save changes' && (await txt(p, '#form-h')) === 'Edit Spotify');
        await p.fill('#f-price', '0'); await p.click('#cancel');
        ok(t('Cancel leaves it as it was'), (await txt(p, '#r-month')) === '89.39');
        await p.click('.subs li:has-text("Spotify") .edit'); await p.fill('#f-price', '12.99'); await p.click('#save');
        ok(t('price rise to 12.99 makes 90.39 a month'), (await txt(p, '#r-month')) === '90.39' && (await txt(p, '#r-year')).startsWith('1,084.64'));
        // cancel a subscription through Edit
        await p.click('.subs li:has-text("Netflix") .edit'); await p.check('input[name=st][value=cancelled]', { force: true }); await p.click('#save');
        ok(t('cancelling Netflix: not counted, saving shown'), (await txt(p, '#r-year')).startsWith('898.76') && (await txt(p, '#r-other')).includes('2 cancelled, saving you 353.76 a year'));
        await p.click('.subs li:has-text("Netflix") .edit');
        ok(t('a cancelled one keeps its date and note when edited'), (await p.inputValue('#f-date')) === '2026-10-12' && (await p.inputValue('#f-note')) === 'Cancel in Account > Membership');
        await p.check('input[name=st][value=active]', { force: true }); await p.click('#save');
        ok(t('back to paying'), (await txt(p, '#r-month')) === '90.39');

        // delete with undo
        await p.click('.subs li:has-text("Gym") .del');
        ok(t('delete shows Undo in place'), (await txt(p, '.subs li.gone')).includes('Deleted Gym.') && (await txt(p, '#r-month')) === '47.05');
        await p.click('#undo-del');
        ok(t('Undo brings it back'), (await txt(p, '#r-month')) === '90.39' && !(await p.locator('.subs li.gone').count()));

        // duplicate, missing date, free plan, custom cycle, long text, pasted price
        await add(p, ['netflix ', '15.49', '1-month', '', 'active']);
        ok(t('same name twice is flagged'), (await txt(p, '#alerts')).includes('more than once'));
        ok(t('missing date is flagged'), (await txt(p, '#alerts')).includes('No next payment date for netflix'));
        await p.click('.subs li:has-text("netflix"):not(:has-text("Membership")) .del');
        await add(p, ['Free plan', '0', '1-month', '2026-10-20', 'active']);
        ok(t('a 0.00 plan is accepted and not in biggest'), (await txt(p, '#r-year')).includes('8 subscriptions') === false && (await p.locator('#bars li', { hasText: 'Free plan' }).count()) === 0);
        await add(p, ['Domain name', '100', 'custom', '2027-05-01', 'active'], { every: '2', unit: 'year' });
        ok(t('every 2 years 100.00 shows 4.17 a month'), (await p.locator('.subs li', { hasText: 'Domain name' }).textContent()).includes('every 2 years · 4.17 a month on average'));
        const long = 'A very long subscription name that goes on and on and on and on';
        await add(p, [long, '$1,299.00', '1-year', '2027-01-15', 'active']);
        ok(t('long name is cut at 60 characters and pasted "$1,299.00" reads as 1,299.00'), (await p.locator('.subs li', { hasText: 'A very long' }).textContent()).includes('1,299.00') && (await p.locator('.s-name', { hasText: 'A very long' }).textContent()).length === 60);
        ok(t('no layout problems with long text'), (await layout(p)).length === 0);

        // sort
        await p.selectOption('#sort', 'cost');
        ok(t('sort by highest cost'), (await names(p))[0].startsWith('A very long') && (await names(p))[1] === 'Gym');
        await p.selectOption('#sort', 'name');
        ok(t('sort by name'), (await names(p))[0].startsWith('A very long') && (await names(p))[1] === 'Amazon Prime');

        // currency, remembered with everything else
        await p.selectOption('#cur', '£');
        ok(t('currency symbol on every amount'), (await txt(p, '#r-month')).startsWith('£') && (await txt(p, '.s-price')).startsWith('£') && (await txt(p, '#f-sym')) === '£');
        await p.reload();
        ok(t('reload keeps the list, currency and sort'), (await txt(p, '#r-month')).startsWith('£') && (await p.inputValue('#sort')) === 'name' && (await names(p)).length === 11);
        await p.selectOption('#cur', '');

        // copy, email, print, calendar, backup
        if (url.startsWith('http')) {
            await p.click('#copy'); const clip = await p.evaluate(() => navigator.clipboard.readText()).catch(() => '');
            ok(t('Copy list copies the summary'), clip.includes('Total: ') && clip.includes('- Netflix: 15.49 every month, next Mon 12 Oct'));
        } else { await p.click('#copy'); await p.waitForTimeout(300); ok(t('Copy list gives a message'), (await txt(p, '#msg')).length > 0); }
        const mail = await p.getAttribute('#mail', 'href');
                ok(t('Email list: no recipient needed, summary in the body'), mail.startsWith('mailto:?subject=') && decodeURIComponent(mail).includes('Saved by cancelling: 167.88 a year') && decodeURIComponent(mail).includes('- Gym: 10.00 every week, next Mon 12 Oct'));
        await p.evaluate(() => { window.printed = 0; window.print = () => { window.printed++; }; });
        await p.click('#print'); ok(t('Print opens printing'), await p.evaluate(() => window.printed === 1));
        let [dl] = await Promise.all([p.waitForEvent('download'), p.click('#cal')]);
        const ics = fs.readFileSync(await dl.path(), 'utf8');
                ok(t('calendar file: every paid subscription with a date, plus the trial warning, not the 0.00 plan'), dl.suggestedFilename() === 'subscription-payments.ics' && (ics.match(/BEGIN:VEVENT/g) || []).length === 9 && !ics.includes('Free plan') && ics.includes('SUMMARY:Gym payment: 10.00'));
        [dl] = await Promise.all([p.waitForEvent('download'), p.click('#backup')]);
        const backupPath = await dl.path(), backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
        ok(t('backup file holds the list'), backup.app === 'subscription-tracker' && backup.subs.length === 11);

        // delete everything, undo, restore
        await p.click('#clear');
        ok(t('Delete everything empties the list'), await p.locator('#result').isHidden() && await p.locator('#form').isVisible() && (await txt(p, '#msg')).includes('Everything deleted'));
        await p.click('#undo-all');
        ok(t('Undo brings everything back'), (await names(p)).length === 11);
        await p.click('#clear');
        const junk = path.join(require('os').tmpdir(), 'junk.json'); fs.writeFileSync(junk, '{"hello": 1}');
        await p.setInputFiles('#restore-file', junk);
        await p.waitForFunction(() => document.getElementById('msg').textContent.includes('not a Subscription'));
        ok(t('a wrong file changes nothing'), await p.locator('#result').isHidden());
        await p.setInputFiles('#restore-file', backupPath);
        await p.waitForFunction(() => document.getElementById('msg').textContent.includes('Restored'));
        ok(t('restore from backup brings the list back'), (await names(p)).length === 11 && (await txt(p, '#msg')).includes('Restored 11 subscriptions'));
        ok(t('no console errors, no failed requests'), p.errors.length === 0 && p.bad.length === 0);
        if (p.errors.length || p.bad.length) console.log(p.errors, p.bad);

        // the next visit, 6 days later: dates moved on, the trial is now paying
        const saved = await p.evaluate(() => localStorage.getItem('subscription-tracker.state'));
        const q = await load(b, vp, { time: new Date(2026, 9, 15, 9, 0) });
        await q.evaluate(v => localStorage.setItem('subscription-tracker.state', v), saved); await q.reload();
        ok(t('6 days later: Gym moved to Mon 19 Oct'), (await q.locator('.subs li', { hasText: 'Gym' }).textContent()).includes('Next payment Mon 19 Oct (in 4 days)'));
        ok(t('6 days later: trial ended, now counted as paying, warning gone'), !(await q.locator('.subs li.trial').count()) && !(await txt(q, '#alerts')).includes('free trial'));
        ok(t('6 days later: no errors'), q.errors.length === 0);
        await q.context().close();

        // keyboard only: add with Enter
        await p.click('#clear'); await p.focus('#f-name'); await p.keyboard.type('Phone plan'); await p.keyboard.press('Tab');
        await p.focus('#f-price'); await p.keyboard.type('25'); await p.keyboard.press('Enter');
        ok(t('keyboard: Enter adds the subscription'), (await names(p))[0] === 'Phone plan' && (await txt(p, '#r-month')) === '25.00');
        await p.context().close();
    }

    // ---- corrupt and odd saved data
    {
        const ctx = await b.newContext(); const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
        await p.goto(url);
        await p.evaluate(() => localStorage.setItem('subscription-tracker.state', '{bad json'));
        await p.reload(); ok('corrupt saved data: page starts fresh', errs.length === 0 && await p.locator('#form').isVisible());
        await p.evaluate(() => localStorage.setItem('subscription-tracker.state', JSON.stringify({ subs: [{ name: 'ok', price: 100, every: 1, unit: 'month' }, { name: '', price: 5 }, { name: 'x', price: -9, every: 1, unit: 'month' }, 'junk'], cur: '<b>', sort: 'zzz' })));
        await p.reload(); ok('odd saved data: only valid rows kept, bad currency and sort ignored', errs.length === 0 && (await names(p)).join() === 'ok' && (await p.inputValue('#cur')) === '' && (await p.inputValue('#sort')) === 'next');
        await ctx.close();
    }

    // ---- light/dark switch
    {
        const p = await load(b, { width: 1280, height: 900 }, { theme: 'light' });
        const bg = () => p.evaluate(() => getComputedStyle(document.body).backgroundColor);
        const before = await bg(); await p.click('.theme-toggle');
        ok('light/dark switch changes the look', (await p.getAttribute('html', 'data-theme')) === 'dark' && (await bg()) !== before);
        await p.context().close();
    }

    // ---- every width, both themes, filled and empty, all optional fields open
    for (const theme of ['dark', 'light']) for (const w of [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920]) {
        const p = await load(b, { width: w, height: 900 }, { theme });
        await p.selectOption('#f-cycle', 'custom'); await p.click('#add-note'); await p.check('input[name=st][value=trial]', { force: true });
        let bad = await layout(p); ok(theme + ' ' + w + 'px empty with every field open: no overflow or overlap' + (bad.length ? ' ' + bad.join('; ') : ''), !bad.length);
        await p.click('#demo'); await p.click('#open-form'); await p.selectOption('#f-cycle', 'custom'); await p.click('#add-note');
        for (const pos of [0, .5, 1]) {
            await p.evaluate(x => window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * x), pos);
            bad = await layout(p); ok(theme + ' ' + w + 'px filled, scrolled ' + pos * 100 + '%: no overflow or overlap' + (bad.length ? ' ' + bad.join('; ') : ''), !bad.length);
        }
        if (w >= 900) ok(theme + ' ' + w + 'px: totals sit beside the list', await p.evaluate(() => document.getElementById('result').getBoundingClientRect().left > document.querySelector('.col-main').getBoundingClientRect().right));
        if ([320, 390, 820, 1280].includes(w)) {
            await p.evaluate(() => window.scrollTo(0, 0)); await p.click('.help-btn');
            const r = await p.locator('dialog.help').boundingBox();
            ok(theme + ' ' + w + 'px: Help opens inside the screen', r && r.x >= 0 && r.y >= 0 && r.x + r.width <= w && r.y + r.height <= 900 && (await txt(p, '#help-title')) === 'How to use Subscription Tracker');
            await p.keyboard.press('Escape'); ok(theme + ' ' + w + 'px: Escape closes Help', !(await p.evaluate(() => document.querySelector('dialog.help').open)));
            await p.click('.help-btn'); await p.click('.help-close'); ok(theme + ' ' + w + 'px: Got it closes Help', !(await p.evaluate(() => document.querySelector('dialog.help').open)));
            const tb = await p.evaluate(() => { const k = [...document.querySelectorAll('.topbar > *')].map(e => e.getBoundingClientRect()); return k.every(r => Math.abs(r.top - k[0].top) < 4); });
            ok(theme + ' ' + w + 'px: top bar buttons on one line', tb);
        }
        if (p.errors.length) ok(theme + ' ' + w + 'px: console errors ' + p.errors.join(), false);
        await p.context().close();
    }
    await b.close();
    console.log(fail ? '\n' + fail + ' FAILED' : '\nALL UI CHECKS PASSED');
    process.exit(fail ? 1 : 0);
})();
