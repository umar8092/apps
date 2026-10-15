// Drives the real page in headless Chromium: node ui-test.js [--shots] [--base https://umar8092.github.io/apps]
// Without --base it serves this repo on localhost. With --base it tests the LIVE page. The clock is fixed at 16 Oct 2026, 10:00.
const pw = (() => { for (const m of ['playwright', 'playwright-core']) { try { return require(m); } catch (e) { /* next */ } } throw new Error('playwright not found'); })();
const path = require('path'), fs = require('fs'), http = require('http'), os = require('os');
const bi = process.argv.indexOf('--base');
const shots = process.argv.includes('--shots');
let fail = 0, url;
const ok = (name, cond) => { if (!cond) fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name); };
const NOW = new Date(2026, 9, 16, 10, 0);

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

// the visit counter is a third-party script; the sandbox may not reach it, and it is not part of the app
const outside = u => /gc\.zgo\.at|goatcounter/.test(u);
async function load(b, vp, opt = {}) {
    const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: vp.width < 500 ? 2 : 1, colorScheme: opt.theme || 'dark',
        permissions: ['clipboard-read', 'clipboard-write'], storageState: opt.state, acceptDownloads: true });
    if (opt.init) await (Array.isArray(opt.init) ? ctx.addInitScript(opt.init[0], opt.init[1]) : ctx.addInitScript(opt.init));
    const p = await ctx.newPage();
    if (opt.install) await p.clock.install({ time: opt.install }); else await p.clock.setFixedTime(opt.now || NOW);
    p.errors = []; p.on('console', m => m.type() === 'error' && !outside(m.location().url || '') && !/ERR_NAME_NOT_RESOLVED|ERR_TUNNEL|ERR_CONNECTION/.test(m.text()) && p.errors.push(m.text()));
    p.on('pageerror', e => p.errors.push(String(e)));
    p.bad = []; p.on('response', r => { if (r.status() >= 400 && !outside(r.url())) p.bad.push(r.status() + ' ' + r.url()); });
    p.on('requestfailed', r => { if (!outside(r.url())) p.bad.push('failed ' + r.url()); });
    await p.goto(url, { waitUntil: 'networkidle' });
    return p;
}
const txt = async (p, sel) => (await p.textContent(sel)).trim();
async function addAcc(p, name, kind, amount) {
    await p.fill('#f-name', name); await p.selectOption('#f-kind', kind); await p.fill('#f-amount', amount == null ? '' : amount); await p.click('#save');
}
const box = (p, name) => p.locator('.acct', { has: p.locator('h4', { hasText: new RegExp('^' + name.replace(/[()]/g, '\\$&') + '$') }) });
const val = (p, name) => box(p, name).locator('input').inputValue();
async function typeIn(p, name, v) { const i = box(p, name).locator('input'); await i.fill(v); await i.press('Enter'); }
const histDates = p => p.$$eval('#hist-list .h-date', e => e.map(x => x.textContent));
async function noHScroll(p) { return p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1); }
async function overlaps(p) {
    return p.evaluate(() => {
        const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
        const els = [...document.querySelectorAll('input:not([type=file]):not([type=radio]), select, button, a.secondary, .back')].filter(vis);
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
        document.querySelectorAll('main, .app, .col-main, .col-side').forEach(parent => {
            const kids = [...parent.children].filter(e => { const r = e.getBoundingClientRect(); return r.height > 0 && getComputedStyle(e).display !== 'contents'; });
            for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
                const a = kids[i].getBoundingClientRect(), b = kids[j].getBoundingClientRect();
                if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) bad.push((kids[i].className || kids[i].tagName) + ' / ' + (kids[j].className || kids[j].tagName));
            }
        });
        return bad;
    });
}
// a placeholder that does not fit its box is cut off on a phone
async function placeholdersFit(p) {
    return p.evaluate(() => {
        const c = document.createElement('canvas').getContext('2d'), bad = [];
        document.querySelectorAll('input[placeholder]').forEach(i => {
            const r = i.getBoundingClientRect(); if (!r.width) return;
            const cs = getComputedStyle(i); c.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
            const room = i.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
            if (c.measureText(i.placeholder).width > room + 1) bad.push(i.id);
        });
        return bad;
    });
}

(async () => {
    let server = null;
    if (bi >= 0) url = process.argv[bi + 1].replace(/\/$/, '') + '/net-worth-tracker/';
    else { server = await serve(); url = 'http://localhost:' + server.address().port + '/net-worth-tracker/'; }
    const b = await pw.chromium.launch();
    const vp = { width: 390, height: 860 }, desk = { width: 1280, height: 900 };

    // ---- first use: empty state
    let p = await load(b, vp);
    ok('first use: intro shown, balances, result and history hidden', await p.isVisible('#intro') && !(await p.isVisible('#bal-body')) && !(await p.isVisible('#result')) && !(await p.isVisible('#history')));
    ok('first use: Add account form ready, amount label Balance', await p.isVisible('#f-name') && (await txt(p, '#f-amount-label')) === 'Balance');

    // ---- form checks
    await p.click('#save');
    ok('blank name refused', (await txt(p, '#form-err')).startsWith('Type a name'));
    await addAcc(p, 'Main bank', 'cash', 'abc');
    ok('words as amount refused', (await txt(p, '#form-err')).startsWith('Type a number'));
    await addAcc(p, 'Main bank', 'cash', '123456789012345');
    ok('huge amount refused', (await txt(p, '#form-err')).includes('too big'));
    await addAcc(p, 'Card', 'card', '-50');
    ok('debt with a minus refused', (await txt(p, '#form-err')).includes('without a minus'));
    ok('nothing added by refused forms', (await p.$$('.acct')).length === 0);
    await p.selectOption('#f-kind', 'mortgage');
    ok('amount label follows the type (Still owed)', (await txt(p, '#f-amount-label')) === 'Still owed');
    await p.selectOption('#f-kind', 'home');
    ok('amount label for a home is Worth about', (await txt(p, '#f-amount-label')) === 'Worth about');

    // ---- the real situation, month one (16 Oct 2026)
    await addAcc(p, 'Main bank', 'cash', '1,240');
    ok('first account added: net worth 1,240.00', (await txt(p, '#net')) === '1,240.00');
    ok('first update message', (await txt(p, '#change')).startsWith('This is your first update'));
    ok('result title has the date', (await txt(p, '#res-h')) === 'Net worth on 16 Oct 2026');
    ok('form cleared and focused for the next account', (await p.inputValue('#f-name')) === '' && await p.evaluate(() => document.activeElement.id === 'f-name'));
    await addAcc(p, 'main BANK', 'savings', '5');
    ok('same name twice refused', (await txt(p, '#form-err')).includes('already have an account'));
    await addAcc(p, 'Credit card', 'card', '640');
    ok('debt goes under What I owe', (await p.$$('#owe-list .acct')).length === 1 && (await p.$$('#own-list .acct')).length === 1);
    ok('net worth 600.00 (1,240.00 - 640.00)', (await txt(p, '#net')) === '600.00' && (await txt(p, '#own-total')) === '1,240.00' && (await txt(p, '#owe-total')) === '640.00');
    await addAcc(p, 'Old car', 'vehicle', '');
    ok('balance is optional: blank counts as 0', (await val(p, 'Old car')) === '0' && (await txt(p, '#net')) === '600.00');
    ok('date note says it is saved for today', (await txt(p, '#date-note')).startsWith('Saved as your update for 16 Oct 2026'));
    ok('history: one update', (await histDates(p)).join() === '16 Oct 2026');
    const long = 'A very long account name that goes on and on and on forever';
    await addAcc(p, long, 'invest', '10');
    ok('long name cut to 40 characters', (await p.$$eval('.acct h4', e => e.map(x => x.textContent))).includes(long.slice(0, 40).trim()));
    ok('no horizontal scroll with a long name', await noHScroll(p));
    await box(p, long.slice(0, 40).trim()).locator('.del').click();
    ok('delete account shows Undo', (await txt(p, '#bal-msg')).startsWith('Deleted') && await p.isVisible('#bal-msg button'));
    await p.click('#bal-msg button');
    ok('Undo brings the account back', (await p.$$('.acct')).length === 4);
    await box(p, long.slice(0, 40).trim()).locator('.del').click();
    ok('account deleted again', (await p.$$('.acct')).length === 3 && (await txt(p, '#net')) === '600.00');

    // ---- typing in a box
    await box(p, 'Main bank').locator('input').fill('12-05');
    ok('bad number in a box shows an error and is not saved', (await box(p, 'Main bank').locator('.a-err').textContent()).startsWith('Type a number') && (await txt(p, '#net')) === '600.00');
    await box(p, 'Credit card').locator('input').fill('-5');
    ok('minus in a debt box refused', (await box(p, 'Credit card').locator('.a-err').textContent()).includes('without a minus'));
    await typeIn(p, 'Credit card', '640');
    await typeIn(p, 'Main bank', '1240');
    ok('fixed: errors gone', (await p.$$eval('.a-err', e => e.map(x => x.textContent).join(''))) === '');
    await typeIn(p, 'Old car', '');
    ok('emptied box shows 0 after leaving it', (await val(p, 'Old car')) === '0');
    await typeIn(p, 'Old car', '2.500,50');
    ok('European number pasted: 2,500.50', (await txt(p, '#own-total')) === '3,740.50');
    await typeIn(p, 'Old car', '2500');
    const state1 = await p.context().storageState();
    ok('no console errors (month one)', p.errors.length === 0);
    if (p.errors.length) console.log(p.errors);
    await p.context().close();

    // ---- reload: saved state comes back
    p = await load(b, vp, { state: state1 });
    ok('reload: accounts and balances back', (await val(p, 'Main bank')) === '1240' && (await val(p, 'Old car')) === '2500' && (await txt(p, '#net')) === '3,100.00');
    await p.context().close();

    // ---- second use a month later (16 Nov 2026)
    p = await load(b, vp, { state: state1, now: new Date(2026, 10, 16, 9, 0) });
    ok('next month: date is today', (await p.inputValue('#date')) === '2026-11-16');
    ok('next month: balances carried from last time', (await val(p, 'Main bank')) === '1240' && (await txt(p, '#date-note')).startsWith('These are your balances from 16 Oct 2026'));
    ok('next month: nothing saved just by opening', (await histDates(p)).length === 1);
    await typeIn(p, 'Main bank', '1500');
    ok('changing one balance saves the update for today', (await histDates(p)).join() === '16 Nov 2026,16 Oct 2026');
    ok('change: Up 260.00 since 16 Oct 2026', (await txt(p, '#change')) === 'Up 260.00 since 16 Oct 2026.' && await p.$eval('#change', e => e.classList.contains('good')));
    ok('box: Main bank up 260.00, green', (await box(p, 'Main bank').locator('.a-change').textContent()) === 'Up 260.00 since 16 Oct 2026' && await box(p, 'Main bank').locator('.a-change').evaluate(e => e.classList.contains('good')));
    ok('box: unchanged card says Same as', (await box(p, 'Credit card').locator('.a-change').textContent()) === 'Same as on 16 Oct 2026');
    await typeIn(p, 'Credit card', '400');
    ok('debt down is green: Down 240.00', (await box(p, 'Credit card').locator('.a-change').textContent()) === 'Down 240.00 since 16 Oct 2026' && await box(p, 'Credit card').locator('.a-change').evaluate(e => e.classList.contains('good')));
    ok('net 3,600.00, up 500.00', (await txt(p, '#net')) === '3,600.00' && (await txt(p, '#change')) === 'Up 500.00 since 16 Oct 2026.');
    await typeIn(p, 'Old car', '2400');
    ok('car worth less is red', await box(p, 'Old car').locator('.a-change').evaluate(e => e.classList.contains('bad')));
    await addAcc(p, 'Flat', 'home', '300000');
    ok('new account counted separately', (await txt(p, '#added-note')).startsWith('This includes +300,000.00 from Flat, added since 16 Oct 2026. Without it the change is up 400.00.'));
    ok('new account box says New since', (await box(p, 'Flat').locator('.a-change').textContent()) === 'New since 16 Oct 2026');
    await box(p, 'Flat').locator('.del').click();
    ok('Flat deleted', (await txt(p, '#net')) === '3,500.00' && !(await p.isVisible('#added-note')));

    // ---- a missed month added later, and a future date
    await p.fill('#date', '2026-11-01'); await p.dispatchEvent('#date', 'change');
    ok('past date: shows balances from 16 Oct', (await val(p, 'Main bank')) === '1240' && (await txt(p, '#date-note')).startsWith('These are your balances from 16 Oct 2026'));
    await typeIn(p, 'Main bank', '1300');
    ok('missed month slots in between', (await histDates(p)).join() === '16 Nov 2026,1 Nov 2026,16 Oct 2026');
    ok('1 Nov change compared with 16 Oct', (await txt(p, '#change')) === 'Up 60.00 since 16 Oct 2026.');
    await p.fill('#date', '2026-12-01'); await p.dispatchEvent('#date', 'change');
    ok('future date refused', (await txt(p, '#date-note')).startsWith('Pick a date up to today') && await p.$eval('#date-note', e => e.classList.contains('bad')));
    await p.fill('#date', '2026-11-16'); await p.dispatchEvent('#date', 'change');
    ok('back to today: 16 Nov compared with 1 Nov', (await txt(p, '#change')) === 'Up 340.00 since 1 Nov 2026.' && (await txt(p, '#start-note')) === 'Since your first update (16 Oct 2026): up 400.00.');
    ok('line drawn with 3 points', await p.isVisible('#chart-box') && (await p.$$('#chart circle')).length === 3);

    // ---- past updates: show and delete with undo
    await p.locator('.h-row', { hasText: '16 Oct 2026' }).locator('button', { hasText: 'Show' }).click();
    ok('Show opens that update', (await p.inputValue('#date')) === '2026-10-16' && (await val(p, 'Main bank')) === '1240' && (await txt(p, '#res-h')) === 'Net worth on 16 Oct 2026');
    await p.locator('.h-row', { hasText: '1 Nov 2026' }).locator('.del').click();
    ok('update deleted, Undo shown', (await histDates(p)).length === 2 && await p.isVisible('#hist-msg button'));
    await p.click('#hist-msg button');
    ok('Undo brings the update back', (await histDates(p)).length === 3);

    // ---- edit an account
    await box(p, 'Old car').locator('button', { hasText: 'Edit' }).click();
    ok('edit mode: name filled, amount hidden, Save changes', (await p.inputValue('#f-name')) === 'Old car' && !(await p.isVisible('#amount-box')) && (await txt(p, '#save')) === 'Save changes');
    await p.press('#f-name', 'Escape');
    ok('Escape cancels edit', (await txt(p, '#save')) === 'Add account' && await p.isVisible('#amount-box'));
    await box(p, 'Old car').locator('button', { hasText: 'Edit' }).click();
    await p.fill('#f-name', 'Toyota Corolla'); await p.click('#save');
    ok('renamed account keeps its history', (await val(p, 'Toyota Corolla')) === '2500');

    // ---- currency
    await p.selectOption('#cur', '£');
    ok('currency symbol on totals and boxes', (await txt(p, '#own-total')).startsWith('£') && (await box(p, 'Main bank').locator('.sym').textContent()) === '£');

    // ---- share
    await p.fill('#date', '2026-11-16'); await p.dispatchEvent('#date', 'change');
    await p.click('#copy');
    const clip = await p.evaluate(() => navigator.clipboard.readText());
    ok('Copy summary', clip.startsWith('My net worth on 16 Nov 2026: £3,500.00\nUp £340.00 since 1 Nov 2026.') && clip.includes('- Credit card (Credit card): £400.00'));
    const mail = await p.getAttribute('#mail', 'href');
    ok('Email summary: mailto with no address', mail.startsWith('mailto:?subject=My%20net%20worth&body=My%20net%20worth%20on%2016%20Nov%202026'));
    let [dl] = await Promise.all([p.waitForEvent('download'), p.click('#csv')]);
    const csv = fs.readFileSync(await dl.path(), 'utf8');
    ok('CSV: header and rows', csv.includes('Date,Main bank,Credit card (owed),Toyota Corolla,Total I own,Total I owe,Net worth') && csv.includes('2026-11-16,1500.00,400.00,2400.00,3900.00,400.00,3500.00'));
    [dl] = await Promise.all([p.waitForEvent('download'), p.click('#export')]);
    const backup = path.join(os.tmpdir(), 'nwt-backup.json');
    fs.copyFileSync(await dl.path(), backup);
    const state2 = await p.context().storageState();
    ok('no console errors (month two)', p.errors.length === 0);
    if (p.errors.length) console.log(p.errors);

    // ---- delete everything, undo
    await p.click('#wipe');
    ok('Delete everything empties the app', await p.isVisible('#intro') && !(await p.isVisible('#result')));
    await p.click('#tools-msg button');
    ok('Undo restores everything', (await histDates(p)).length === 3 && (await txt(p, '#net')) === '£3,500.00');
    await p.context().close();

    // ---- backup on another device
    p = await load(b, desk);
    const bad = path.join(os.tmpdir(), 'nwt-bad.json'); fs.writeFileSync(bad, '{"hello": 1}');
    await p.setInputFiles('#import-file', bad);
    await p.waitForFunction(() => document.getElementById('tools-msg').textContent.length > 0);
    ok('wrong file refused, nothing changed', (await txt(p, '#tools-msg')).startsWith('This file is not a Net Worth Tracker backup') && await p.isVisible('#intro'));
    await p.setInputFiles('#import-file', backup);
    await p.waitForFunction(() => document.getElementById('tools-msg').textContent.startsWith('Backup loaded'));
    ok('backup loaded on a fresh device', (await txt(p, '#tools-msg')).startsWith('Backup loaded: 3 accounts, 3 updates.') && (await txt(p, '#net')) === '£3,100.00' && (await p.inputValue('#cur')) === '£');
    await p.click('#tools-msg button');
    ok('Undo of a loaded backup', await p.isVisible('#intro'));
    await p.context().close();

    // ---- stale reminder (no update for 2 months)
    p = await load(b, vp, { state: state2, now: new Date(2027, 0, 20, 9, 0) });
    ok('reminder after more than a month', (await txt(p, '#stale')) === 'Your last update was 16 Nov 2026, 65 days ago. Time to update your balances.');
    await p.context().close();

    // ---- the README example and negative net worth
    p = await load(b, desk);
    await p.click('#demo');
    ok('example: net worth 15,924.60', (await txt(p, '#net')) === '15,924.60' && (await txt(p, '#own-total')) === '23,280.20' && (await txt(p, '#owe-total')) === '7,355.60');
    ok('example: up 633.85 since 16 Sep 2026', (await txt(p, '#change')) === 'Up 633.85 since 16 Sep 2026.');
    ok('example: since 16 Jul up 2,224.60', (await txt(p, '#start-note')) === 'Since your first update (16 Jul 2026): up 2,224.60.');
    ok('example: four updates', (await histDates(p)).join() === '16 Oct 2026,16 Sep 2026,16 Aug 2026,16 Jul 2026');
    await p.click('#bal-msg button');
    ok('example Undo empties the app', await p.isVisible('#intro'));
    await addAcc(p, 'Student loan', 'loan', '24000');
    await addAcc(p, 'Bank', 'cash', '-45.50');
    ok('negative net worth shown plainly', (await txt(p, '#net')) === '-24,045.50' && (await txt(p, '#neg-note')) === 'You owe 24,045.50 more than you own.');
    await addAcc(p, 'Big', 'invest', '100000000000');
    ok('largest amount exact', (await txt(p, '#own-total')) === '99,999,999,954.50');
    ok('no horizontal scroll with huge numbers', await noHScroll(p));
    await p.context().close();

    // ---- corrupt and blocked storage
    p = await load(b, vp, { init: () => { try { localStorage.setItem('net-worth-tracker.state', '{not json'); } catch (e) { /* */ } } });
    ok('corrupt saved data: starts fresh with no errors', await p.isVisible('#intro') && p.errors.length === 0);
    await p.context().close();
    p = await load(b, vp, { init: () => { Storage.prototype.setItem = function () { throw new Error('blocked'); }; } });
    await addAcc(p, 'Bank', 'cash', '10');
    ok('blocked storage: warning and the app still works', await p.isVisible('#save-warn') && (await txt(p, '#net')) === '10.00');
    await p.context().close();

    // ---- midnight while the page is open
    p = await load(b, vp, { state: state2, install: new Date(2026, 10, 16, 23, 59, 40) });
    await p.clock.runFor(60000);
    ok('after midnight the date moves to the new day', (await p.inputValue('#date')) === '2026-11-17');
    await p.context().close();

    // ---- layout: every width, dark and light, filled and empty; scrolling; controls on phones; Help
    for (const theme of ['dark', 'light']) {
        for (const w of [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920]) {
            p = await load(b, { width: w, height: 900 }, { theme });
            await p.click('#demo');
            const filled = await noHScroll(p);
            let ov = [];
            if (w >= 900) for (const y of [0, 0.5, 1]) { await p.evaluate(f => window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * f), y); ov = ov.concat(await blockOverlap(p)); }
            let ctl = [], ph = [];
            if (w <= 390) {
                ctl = await overlaps(p); ph = await placeholdersFit(p);
                await p.locator('.acct').first().locator('button', { hasText: 'Edit' }).click();
                ctl = ctl.concat(await overlaps(p));
                await p.press('#f-name', 'Escape');
            }
            await p.click('#wipe');
            const empty = await noHScroll(p) && (await placeholdersFit(p)).length === 0;
            ok(theme + ' ' + w + 'px: no horizontal scroll (filled and empty), no overlaps', filled && empty && !ov.length && !ctl.length && !ph.length);
            if (ov.length || ctl.length || ph.length) console.log(ov, ctl, ph);
            await p.context().close();
        }
    }
    for (const w of [320, 390, 820, 1280]) {
        p = await load(b, { width: w, height: 800 });
        const help = p.locator('button', { hasText: 'Help' }).first();
        await help.click();
        const dlg = p.locator('dialog[open], [role=dialog]').first();
        await dlg.waitFor();
        const r = await dlg.boundingBox();
        ok(w + 'px: Help opens inside the screen with its title', r.x >= 0 && r.x + r.width <= w + 1 && (await dlg.textContent()).includes('How to use Net Worth Tracker'));
        await p.keyboard.press('Escape');
        ok(w + 'px: Escape closes Help', !(await dlg.isVisible()));
        await help.click();
        await p.locator('button', { hasText: 'Got it' }).click();
        ok(w + 'px: Got it closes Help', !(await p.locator('dialog[open], [role=dialog]').first().isVisible()));
        const tb = await p.evaluate(() => { const bs = [...document.querySelectorAll('.topbar a, .topbar button')].map(e => e.getBoundingClientRect()); return bs.every(r => Math.abs(r.top - bs[0].top) < 4) && bs.every((r, i) => i === 0 || r.left >= bs[i - 1].right - 1); });
        ok(w + 'px: top bar on one line, no overlap', tb);
        ok(w + 'px: no failed requests', p.bad.length === 0);
        if (p.bad.length) console.log(p.bad);
        await p.context().close();
    }
    // light/dark switch
    p = await load(b, vp);
    const bg1 = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await p.locator('.theme-toggle').click();
    const bg2 = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
    ok('light/dark switch changes the look', bg1 !== bg2 && (await p.getAttribute('html', 'data-theme')) === 'light');
    await p.context().close();

    // ---- screenshots for the README
    if (shots) {
        for (const [v, f] of [[{ width: 1280, height: 900 }, 'desktop.png'], [{ width: 390, height: 844 }, 'phone.png']]) {
            p = await load(b, v);
            await p.click('#demo');
            await p.evaluate(() => { document.getElementById('bal-msg').textContent = ''; });
            await p.screenshot({ path: path.join(__dirname, 'screenshots', f), fullPage: v.width > 500 });
            await p.context().close();
        }
        console.log('screenshots saved');
    }

    await b.close();
    if (server) server.close();
    console.log(fail ? fail + ' FAILED' : 'ALL UI CHECKS PASSED');
    process.exit(fail ? 1 : 0);
})();
