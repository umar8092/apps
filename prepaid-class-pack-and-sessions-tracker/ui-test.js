// Full page test with Playwright. Run from the repo root or this folder: node ui-test.js
//   BASE=https://umar8092.github.io/apps node ui-test.js   tests the live site
//   node ui-test.js --shots                                 also saves screenshots/desktop.png and phone.png
// "Now" is fixed to Sun 25 Oct 2026, 9:00 am Pakistan time so every answer can be checked exactly.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), SLUG = 'prepaid-class-pack-and-sessions-tracker', KEY = SLUG + '.state';
const SHOTS = process.argv.includes('--shots');
const NOW = new Date('2026-10-25T09:00:00+05:00');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; if (!cond) console.log('FAIL ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra).slice(0, 400) : '')); };

function serve() {
    const types = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml', png: 'image/png', webmanifest: 'application/manifest+json' };
    return new Promise(res => { const s = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0].replace(/^\/apps/, '')); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': types[f.split('.').pop()] || 'application/octet-stream' }); r.end(fs.readFileSync(f)); }).listen(0, () => res(s)); });
}

// the saved state of the main situation, for layout and screenshot runs
const DEMO = { v: 1, nextId: 40, packs: [
    { id: 1, name: 'Swimming lessons', people: ['Ali'], size: 10, start: '2026-10-01', expiry: '2026-11-30', cents: 600000, note: '', usedBefore: 0, carried: 0, archived: '', added: '2026-10-01' },
    { id: 2, name: 'Physio sessions', people: [], size: 8, start: '2026-09-26', expiry: '2026-11-13', cents: 1600000, note: 'Dr Hina, back pain. Book on 0300 1234567', usedBefore: 0, carried: 0, archived: '', added: '2026-09-26' },
    { id: 3, name: 'Tuition classes', people: ['Sara', 'Omar'], size: 12, start: '2026-10-05', expiry: '', cents: 960000, note: '', usedBefore: 0, carried: 0, archived: '', added: '2026-10-05' },
    { id: 4, name: 'Gym visits', people: [], size: 0, start: '2026-10-01', expiry: '2026-10-31', cents: 500000, note: '', usedBefore: 0, carried: 0, archived: '', added: '2026-10-01' }],
    uses: [
        ...['2026-10-01', '2026-10-04', '2026-10-08', '2026-10-11', '2026-10-15', '2026-10-18'].map((d, i) => ({ id: 10 + i, pack: 1, date: d, kind: 'went', who: 'Ali', note: '' })),
        { id: 16, pack: 2, date: '2026-10-01', kind: 'went', who: '', note: '' }, { id: 17, pack: 2, date: '2026-10-15', kind: 'missed', who: '', note: 'Forgot' },
        { id: 18, pack: 3, date: '2026-10-06', kind: 'went', who: 'Sara', note: '' }, { id: 19, pack: 3, date: '2026-10-06', kind: 'went', who: 'Omar', note: '' },
        { id: 20, pack: 3, date: '2026-10-13', kind: 'went', who: 'Sara', note: '' }, { id: 21, pack: 3, date: '2026-10-13', kind: 'off', who: '', note: 'Teacher ill' },
        { id: 22, pack: 3, date: '2026-10-20', kind: 'went', who: 'Sara', note: '' }, { id: 23, pack: 3, date: '2026-10-20', kind: 'went', who: 'Omar', note: '' },
        ...['2026-10-02', '2026-10-05', '2026-10-07', '2026-10-12', '2026-10-14', '2026-10-19', '2026-10-21', '2026-10-23', '2026-10-24'].map((d, i) => ({ id: 24 + i, pack: 4, date: d, kind: 'went', who: '', note: '' }))] };

(async () => {
    let srv, base = process.env.BASE;
    if (!base) { srv = await serve(); base = 'http://localhost:' + srv.address().port + '/apps'; }
    const URL = base + '/' + SLUG + '/';
    const browser = await chromium.launch();
    const errors = [], failed = [], requested = new Set();
    async function newPage(opts, init) {
        const ctx = await browser.newContext(Object.assign({ viewport: { width: 390, height: 844 }, acceptDownloads: true, timezoneId: 'Asia/Karachi', colorScheme: 'dark', locale: 'en-US' }, opts || {}));
        await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new globalThis.URL(base).origin });
        await ctx.route(/goatcounter\.com|gc\.zgo\.at/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
        const page = await ctx.newPage();
        await page.clock.setFixedTime(NOW);
        if (init) await page.addInitScript(init);
        page.on('pageerror', e => errors.push(e.message));
        page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
        page.on('request', r => { if (r.url().startsWith(base)) requested.add(r.url()); });
        page.on('response', r => { if (r.status() >= 400 && r.url().startsWith(base)) failed.push(r.status() + ' ' + r.url()); });
        await page.goto(URL, { waitUntil: 'networkidle' });
        return { ctx, page };
    }
    const seed = st => `try { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(${JSON.stringify(KEY)}, ${JSON.stringify(JSON.stringify(st))}); localStorage.setItem(${JSON.stringify(SLUG + '.cur')}, 'Rs'); sessionStorage.setItem('seeded', '1'); } } catch (e) {}`;
    const box = (page, name) => page.locator('#pack-list li.pack', { has: page.locator('.pack-name', { hasText: new RegExp('^' + name + '$') }) });
    const boxText = async (page, name) => (await box(page, name).innerText()).replace(/\s+/g, ' ');
    const msg = page => page.locator('#pack-msg').innerText();
    const isOpen = (page, id) => page.locator('#' + id).evaluate(d => d.open);
    async function logOn(page, name, date, kind, who, note) {
        await box(page, name).locator('button', { hasText: 'Other day or missed' }).click();
        await page.fill('#u-date', date);
        if (kind) await page.check('input[name="u-kind"][value="' + kind + '"]');
        if (who) await page.selectOption('#u-who', who);
        if (note) { await page.click('#uo-note'); await page.fill('#u-note', note); }
        await page.click('#u-save');
    }

    // ---------- 1. first use: the empty state ----------
    let { ctx, page } = await newPage();
    ok('empty: guidance shown', (await page.locator('#sum-body').innerText()).includes('Add your first pack below'));
    ok('empty: no pack boxes', await page.locator('#pack-list > li').count() === 0);
    ok('empty: finished packs hidden', await page.locator('#finished').isHidden());
    ok('empty: add button', (await page.locator('#add-pack').innerText()) === '+ Add a pack');

    // ---------- 2. the main situation, typed in through the form ----------
    await page.click('#add-pack');
    ok('form: opens', await isOpen(page, 'd-pack'));
    ok('form: optional fields hidden', await page.locator('#pw-people').isHidden() && await page.locator('#pw-price').isHidden() && await page.locator('#pw-before').isHidden() && await page.locator('#pw-note').isHidden());
    await page.click('#p-save');
    ok('form: blank name error', (await page.locator('#pe-name').innerText()).includes('Type what the pack is for'));
    ok('form: blank size error', (await page.locator('#pe-size').innerText()).includes('Type how many sessions'));
    await page.locator('#p-common .chip', { hasText: 'Swimming lessons' }).click();
    ok('form: name chip fills the name', await page.inputValue('#p-name') === 'Swimming lessons');
    await page.fill('#p-size', '0'); await page.click('#p-save');
    ok('form: zero sessions refused', (await page.locator('#pe-size').innerText()).includes('at least 1'));
    await page.locator('#p-quick-size .chip', { hasText: /^10$/ }).click();
    await page.fill('#p-start', '2026-10-01');
    await page.locator('#p-quick-exp .chip', { hasText: '2 months' }).click();
    ok('form: 2 months from 1 Oct = 30 Nov', await page.inputValue('#p-expiry') === '2026-11-30');
    ok('form: chip shows pressed', await page.locator('#p-quick-exp .chip', { hasText: '2 months' }).getAttribute('aria-pressed') === 'true');
    await page.click('#po-people'); await page.fill('#p-people', 'Ali');
    await page.click('#po-price'); await page.fill('#p-price', '6,000');
    ok('form: preview', (await page.locator('#p-preview').innerText()) === '10 sessions from Thu 1 Oct to Mon 30 Nov (2 months). 600 per session.', await page.locator('#p-preview').innerText());
    await page.click('#p-save');
    ok('form: closes after save', !(await isOpen(page, 'd-pack')));
    ok('add: message', (await msg(page)).includes('Added Swimming lessons (Ali)'));
    let t = await boxText(page, 'Swimming lessons');
    ok('add: 10 of 10 left', t.includes('10 of 10 left') && t.includes('for Ali'), t);
    ok('add: 10 dots', await box(page, 'Swimming lessons').locator('.dots i').count() === 10);

    // six past sessions through "Other day or missed"
    for (const d of ['2026-10-01', '2026-10-04', '2026-10-08', '2026-10-11', '2026-10-15', '2026-10-18']) await logOn(page, 'Swimming lessons', d);
    t = await boxText(page, 'Swimming lessons');
    ok('main: 4 of 10 left', t.includes('4 of 10 left'), t);
    ok('main: last day line', t.includes('Last day to use it: Mon 30 Nov (in 5 weeks).'), t);
    ok('main: pace', t.includes('To use them all, go about 1 every 9 days.'), t);
    ok('main: money', t.includes('6,000 for 10: 600 per session, 2,400 still unused.'), t);
    ok('main: 6 filled dots', await box(page, 'Swimming lessons').locator('.dots i.u').count() === 6);
    ok('glance: line', (await page.locator('#sum-body').innerText()).includes('4 of 10 left, ends in 5 weeks'));
    ok('glance: unused money', (await page.locator('#sum-body').innerText()).includes('Paid for and not used yet: 2,400.'));

    // Went today, then Undo
    await box(page, 'Swimming lessons').locator('button.go', { hasText: 'Went today' }).click();
    ok('went: message', (await msg(page)).includes('Logged session 7 of 10 today. 3 sessions left.'), await msg(page));
    ok('went: 3 left', (await boxText(page, 'Swimming lessons')).includes('3 of 10 left'));
    await page.locator('#pack-msg .undo').click();
    ok('undo: back to 4 left', (await boxText(page, 'Swimming lessons')).includes('4 of 10 left'));
    // a double tap the same day is allowed and named
    await box(page, 'Swimming lessons').locator('button.go').click();
    await box(page, 'Swimming lessons').locator('button.go').click();
    ok('went twice: 2nd today named', (await msg(page)).includes('(2nd today.)'), await msg(page));
    await page.locator('#pack-msg .undo').click();
    ok('undo second: 3 left', (await boxText(page, 'Swimming lessons')).includes('3 of 10 left'));

    // currency symbol is remembered and used
    await page.selectOption('#s-cur', 'Rs');
    ok('currency: shown', (await boxText(page, 'Swimming lessons')).includes('Rs 6,000 for 10: Rs 600 per session, Rs 1,800 still unused.'));

    // the log: edit an entry's date, then delete one with undo
    ok('log: opened by itself after logging a past session', await box(page, 'Swimming lessons').locator('details.log').evaluate(d => d.open));
    await box(page, 'Swimming lessons').locator('summary').click();
    ok('log: closes on tap', !(await box(page, 'Swimming lessons').locator('details.log').evaluate(d => d.open)));
    await box(page, 'Swimming lessons').locator('summary').click();
    ok('log: 7 entries', (await box(page, 'Swimming lessons').locator('summary').innerText()) === 'Log (7 entries)');
    ok('log: opens', await box(page, 'Swimming lessons').locator('details.log').evaluate(d => d.open));
    ok('log: newest first', (await box(page, 'Swimming lessons').locator('.log-list li span').first().innerText()) === '#7 Sun 25 Oct: went', await box(page, 'Swimming lessons').locator('.log-list li span').first().innerText());
    await box(page, 'Swimming lessons').locator('.log-list li', { hasText: 'Sun 18 Oct' }).locator('button').click();
    ok('edit entry: window title', (await page.locator('#du-h').innerText()) === 'Change this entry');
    await page.fill('#u-date', '2026-10-26'); await page.click('#u-save');
    ok('edit entry: future date refused', (await page.locator('#ue-date').innerText()).includes('on or before today'));
    await page.fill('#u-date', '2026-09-20'); await page.click('#u-save');
    ok('edit entry: before the start refused', (await page.locator('#ue-date').innerText()).includes('The pack starts on Thu 1 Oct'));
    await page.fill('#u-date', '2026-10-19'); await page.click('#u-save');
    ok('edit entry: saved', (await box(page, 'Swimming lessons').innerText()).includes('Mon 19 Oct: went'));
    await box(page, 'Swimming lessons').locator('.log-list li', { hasText: 'Mon 19 Oct' }).locator('button').click();
    await page.click('#u-del');
    ok('delete entry: 4 left', (await boxText(page, 'Swimming lessons')).includes('4 of 10 left'));
    await page.locator('#pack-msg .undo').click();
    ok('delete entry undo: 3 left', (await boxText(page, 'Swimming lessons')).includes('3 of 10 left'));
    ok('log stays open across redraws', await box(page, 'Swimming lessons').locator('details.log').evaluate(d => d.open));

    // missed and cancelled
    await logOn(page, 'Swimming lessons', '2026-10-22', 'missed', null, 'Was ill');
    ok('missed: counted', (await boxText(page, 'Swimming lessons')).includes('2 of 10 left'));
    await logOn(page, 'Swimming lessons', '2026-10-23', 'off', null, 'Pool closed');
    t = await boxText(page, 'Swimming lessons');
    ok('cancelled: not counted', t.includes('2 of 10 left') && t.includes('1 cancelled or excused class not counted.'), t);
    ok('low: renew hint', t.includes('Only 2 left: think about renewing.'));

    // copy and email the log
    await box(page, 'Swimming lessons').locator('button', { hasText: 'Copy log' }).click();
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    ok('copy log: text', clip.startsWith('Swimming lessons (Ali)\n10-session pack from Thu 1 Oct, last day Mon 30 Nov.\nPaid Rs 6,000.\nUsed 8 of 10, 2 left.') && clip.includes('7. Thu 22 Oct missed, still counted: Was ill') && clip.endsWith('8. Sun 25 Oct went') && clip.includes('-  Fri 23 Oct cancelled or excused, not counted: Pool closed'), clip);
    const href = await box(page, 'Swimming lessons').locator('a', { hasText: 'Email log' }).getAttribute('href');
    ok('email log: no recipient needed', href.startsWith('mailto:?subject=Swimming%20lessons%20(Ali)%3A%20sessions%20log&body='), href.slice(0, 80));

    // use up the pack, then a 3rd session is refused, then Renew with carry-over
    await box(page, 'Swimming lessons').locator('button.go').click();
    await box(page, 'Swimming lessons').locator('button.go').click();
    ok('used up: last one message', (await msg(page)).includes('That was the last one.'));
    t = await boxText(page, 'Swimming lessons');
    ok('used up: line and Renew', t.includes('All 10 used, the last on Sun 25 Oct. Time to renew?') && t.includes('Renew') && !t.includes('Went today') && !t.includes('Other day or missed'), t);

    // ---------- 3. a second pack with only what is required (optional inputs are not forced) ----------
    await page.click('#add-pack');
    await page.fill('#p-name', 'Physio sessions'); await page.fill('#p-size', '8');
    await page.locator('#p-quick-exp .chip', { hasText: 'No expiry' }).click();
    await page.click('#p-save');
    t = await boxText(page, 'Physio sessions');
    ok('minimal pack: saved with no price, people or expiry', t.includes('8 of 8 left') && t.includes('No expiry date.') && !t.includes('per session'), t);
    ok('add button says another', (await page.locator('#add-pack').innerText()) === '+ Add another pack');

    // edit: cannot shrink below what is logged
    await box(page, 'Swimming lessons').locator('button', { hasText: 'Edit' }).first().click();
    await page.fill('#p-size', '5'); await page.click('#p-save');
    ok('edit: shrink below logged refused', (await page.locator('#pe-size').innerText()).includes('needs at least 10'), await page.locator('#pe-size').innerText());
    await page.keyboard.press('Escape');
    ok('Escape closes the window', !(await isOpen(page, 'd-pack')));

    // renew with carry over: first make it expired with sessions left by editing
    await box(page, 'Swimming lessons').locator('button', { hasText: 'Edit' }).first().click();
    await page.fill('#p-size', '12'); await page.fill('#p-expiry', '2026-10-24'); await page.click('#p-save');
    t = await boxText(page, 'Swimming lessons');
    ok('expired: unused value', t.includes('Expired on Sat 24 Oct with 2 sessions not used (worth Rs 1,000).'), t);
    ok('expired: still can log a forgotten session', t.includes('Other day or missed'));
    await box(page, 'Swimming lessons').locator('button.go', { hasText: 'Renew' }).click();
    ok('renew: title', (await page.locator('#dp-h').innerText()) === 'Renew: Swimming lessons (Ali)');
    ok('renew: prefilled', await page.inputValue('#p-size') === '12' && await page.inputValue('#p-start') === '2026-10-25' && await page.inputValue('#p-price') === '6000');
    ok('renew: carry offered', await page.locator('#pw-carry').isVisible() && (await page.locator('#p-carry-text').innerText()).includes('2 sessions'));
    await page.fill('#p-size', '10'); await page.check('#p-carry');
    ok('renew: preview with carry', (await page.locator('#p-preview').innerText()).startsWith('12 sessions (10 new + 2 carried over) from Sun 25 Oct'), await page.locator('#p-preview').innerText());
    await page.click('#p-save');
    ok('renew: message', (await msg(page)).includes('Started the new pack. The old one is in Finished packs.'));
    ok('renew: new box', (await boxText(page, 'Swimming lessons')).includes('12 of 12 left'));
    ok('renew: finished list', await page.locator('#finished').isVisible() && (await page.locator('#fin-list').innerText()).includes('10 of 12 used'));
    await page.locator('#pack-msg .undo').click();
    ok('renew undo: no finished packs', await page.locator('#finished').isHidden());

    // two people sharing one pack
    await page.click('#add-pack');
    await page.fill('#p-name', 'Tuition classes'); await page.fill('#p-size', '12');
    await page.click('#po-people'); await page.fill('#p-people', 'Sara, Omar');
    await page.fill('#p-start', '2026-10-05');
    await page.click('#p-save');
    await box(page, 'Tuition classes').locator('button.go', { hasText: 'Sara went today' }).click();
    ok('two people: message names Sara', (await msg(page)).startsWith('Sara: Logged session 1 of 12 today.'));
    await box(page, 'Tuition classes').locator('button', { hasText: 'Other day or missed' }).click();
    ok('two people: who shown', await page.locator('#uw-who').isVisible());
    await page.fill('#u-date', '2026-10-20'); await page.click('#u-save');
    ok('two people: who required', (await page.locator('#ue-who').innerText()) === 'Choose who went.');
    await page.selectOption('#u-who', 'Omar'); await page.click('#u-save');
    ok('two people: per person counts', (await boxText(page, 'Tuition classes')).includes('Used so far: Sara 1, Omar 1.'));

    // a monthly pass
    await page.click('#add-pack');
    await page.fill('#p-name', 'Gym visits'); await page.selectOption('#p-type', 'pass');
    ok('pass: size and No expiry hidden', await page.locator('#pw-size').isHidden() && await page.locator('#p-noexp').isHidden());
    ok('pass: last day prefilled 1 month', await page.inputValue('#p-expiry') === '2026-11-24');
    await page.click('#po-price'); await page.fill('#p-price', '5000');
    await page.click('#p-save');
    await box(page, 'Gym visits').locator('button.go').click();
    await box(page, 'Gym visits').locator('button.go').click();
    t = await boxText(page, 'Gym visits');
    ok('pass: visits and cost per visit', t.includes('2 visits so far') && t.includes('Rs 5,000 paid: Rs 2,500 per visit so far.'), t);

    // move to finished, bring back, delete with undo
    await box(page, 'Physio sessions').locator('button', { hasText: 'Edit' }).first().click();
    await page.click('#p-archive');
    ok('finish: moved', await box(page, 'Physio sessions').count() === 0 && (await page.locator('#fin-list').innerText()).includes('Physio sessions'));
    await page.locator('#fin-list li', { hasText: 'Physio sessions' }).locator('button', { hasText: 'Bring back' }).click();
    ok('bring back', await box(page, 'Physio sessions').count() === 1);
    await box(page, 'Physio sessions').locator('button', { hasText: 'Edit' }).first().click();
    await page.click('#p-del');
    ok('delete pack', await box(page, 'Physio sessions').count() === 0 && (await msg(page)).includes('Deleted Physio sessions and its log.'));
    await page.locator('#pack-msg .undo').click();
    ok('delete pack undo', await box(page, 'Physio sessions').count() === 1);

    // very long pasted name, and a duplicate name warning
    await page.click('#add-pack');
    await page.fill('#p-name', 'Swimming lessons');
    ok('duplicate name: friendly warning', (await page.locator('#p-warn').innerText()).includes('already have an open pack with this name'));
    await page.fill('#p-name', 'A very long pasted name from a WhatsApp message about the Saturday morning swimming class at the club, '.repeat(3));
    await page.fill('#p-size', '5'); await page.click('#p-save');
    ok('long name: cut to 60 characters', await page.locator('#pack-list .pack-name').evaluateAll(n => n.some(x => x.textContent.length === 60)));
    ok('long name: no horizontal scroll', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));

    // calendar, backup, restore, wipe
    let [dl] = await Promise.all([page.waitForEvent('download'), page.click('#cal')]);
    let body = fs.readFileSync(await dl.path(), 'utf8');
    ok('calendar: file', dl.suggestedFilename() === 'class-pack-end-dates.ics' && body.includes('BEGIN:VEVENT') && body.includes('Gym visits: pack ends Tue 24 Nov 2026'), body.slice(0, 200));
    [dl] = await Promise.all([page.waitForEvent('download'), page.click('#backup')]);
    const backupPath = await dl.path(), backup = fs.readFileSync(backupPath, 'utf8');
    ok('backup: file', dl.suggestedFilename() === 'class-packs-backup-2026-10-25.json' && JSON.parse(backup).packs.length === 5);
    await page.click('#wipe');
    ok('wipe: empty', await page.locator('#pack-list > li').count() === 0);
    await page.locator('#set-msg .undo').click();
    ok('wipe undo', await page.locator('#pack-list > li').count() === 5);
    await page.click('#wipe');
    await page.setInputFiles('#restore-file', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"not":"ours"}') });
    ok('restore: wrong file refused', (await page.locator('#set-msg').innerText()).includes('not a backup from this app'));
    await page.setInputFiles('#restore-file', backupPath);
    ok('restore: back', await page.locator('#pack-list > li').count() === 5 && (await page.locator('#set-msg').innerText()).includes('Restored 5 packs'));

    // reload keeps everything
    await page.reload({ waitUntil: 'networkidle' });
    ok('reload: packs kept', await page.locator('#pack-list > li').count() === 5);
    ok('reload: currency kept', await page.inputValue('#s-cur') === 'Rs');
    await ctx.close();

    // ---------- 4. corrupt and blocked storage ----------
    ({ ctx, page } = await newPage({}, `try { localStorage.setItem(${JSON.stringify(KEY)}, '{broken'); } catch (e) {}`));
    ok('corrupt: starts fresh with a message', (await page.locator('#set-msg').innerText()).includes('could not be read'));
    await ctx.close();
    ({ ctx, page } = await newPage({}, `Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } });`));
    ok('blocked storage: warning', await page.locator('#storage-warn').isVisible());
    await page.click('#add-pack'); await page.fill('#p-name', 'Yoga'); await page.fill('#p-size', '5'); await page.click('#p-save');
    ok('blocked storage: still works for this visit', await box(page, 'Yoga').count() === 1);
    await ctx.close();

    // ---------- 5. layout with the realistic filled-in state, every width, dark and light ----------
    for (const scheme of ['dark', 'light']) {
        ({ ctx, page } = await newPage({ colorScheme: scheme }, seed(DEMO)));
        for (const w of [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920]) {
            await page.setViewportSize({ width: w, height: 900 });
            await page.waitForTimeout(50);
            const tag = scheme + ' ' + w + ': ';
            ok(tag + 'no horizontal scroll', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
            const out = await page.evaluate(() => [...document.querySelectorAll('main *')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1); }).length);
            ok(tag + 'nothing sticks out', out === 0, out);
            for (const pos of [0, .5, 1]) {
                await page.evaluate(p => scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * p), pos);
                const ov = await page.evaluate(() => {
                    const bad = [];
                    document.querySelectorAll('main, .app, .col-main, .col-side').forEach(par => {
                        const kids = [...par.children].filter(k => k.offsetParent !== null && getComputedStyle(k).display !== 'contents');
                        for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
                            const a = kids[i].getBoundingClientRect(), b = kids[j].getBoundingClientRect();
                            if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2) bad.push(kids[i].className + ' / ' + kids[j].className);
                        }
                    });
                    return bad;
                });
                ok(tag + 'no overlapping blocks at ' + pos * 100 + '%', !ov.length, ov);
            }
            if (w <= 390) {
                // controls in the pack boxes and in both windows with every optional field shown
                const overlap = sel => page.evaluate(s => {
                    const els = [...document.querySelectorAll(s)].filter(e => e.checkVisibility()).map(e => ({ e, r: e.getBoundingClientRect() }));
                    const bad = [];
                    for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
                        const a = els[i].r, b = els[j].r;
                        if (els[i].e.contains(els[j].e) || els[j].e.contains(els[i].e)) continue;
                        if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) bad.push((els[i].e.id || els[i].e.textContent.slice(0, 20)) + ' / ' + (els[j].e.id || els[j].e.textContent.slice(0, 20)));
                    }
                    return bad;
                }, sel);
                ok(tag + 'page controls do not overlap', !(await overlap('main button, main input, main select, main a.mini')).length, await overlap('main button, main input, main select, main a.mini'));
                await page.evaluate(() => scrollTo(0, 0));
                await box(page, 'Swimming lessons').locator('button', { hasText: 'Edit' }).first().click();
                for (const b of ['#po-people', '#po-price', '#po-before', '#po-note']) if (await page.locator(b).isVisible()) await page.click(b);
                ok(tag + 'pack window controls do not overlap', !(await overlap('#d-pack button:not([hidden]), #d-pack input, #d-pack select, #d-pack textarea')).length, await overlap('#d-pack button, #d-pack input, #d-pack select, #d-pack textarea'));
                const clipped = await page.evaluate(() => [...document.querySelectorAll('#d-pack input[placeholder], #d-pack textarea[placeholder]')].filter(i => i.offsetParent !== null).filter(i => {
                    const c = document.createElement('canvas').getContext('2d'), cs = getComputedStyle(i); c.font = cs.fontSize + ' ' + cs.fontFamily;
                    return c.measureText(i.placeholder).width > i.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
                }).map(i => i.id));
                ok(tag + 'placeholders fit', !clipped.length, clipped);
                ok(tag + 'pack window inside the screen', await page.locator('#d-pack').evaluate(d => { const r = d.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; }));
                await page.keyboard.press('Escape');
                await box(page, 'Tuition classes').locator('button', { hasText: 'Other day or missed' }).click();
                await page.click('#uo-note');
                ok(tag + 'session window controls do not overlap', !(await overlap('#d-use button, #d-use input:not([type=radio]), #d-use select, #d-use label.radio')).length, await overlap('#d-use button, #d-use input:not([type=radio]), #d-use select, #d-use label.radio'));
                await page.keyboard.press('Escape');
            }
        }
        // the theme switch flips the look
        if (scheme === 'dark') {
            const bg1 = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
            await page.locator('.theme-toggle').click();
            const bg2 = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
            ok('theme switch changes the colours', bg1 !== bg2, [bg1, bg2]);
        }
        await ctx.close();
    }

    // the demo state reads as expected (the situation in the README)
    ({ ctx, page } = await newPage({ viewport: { width: 1280, height: 900 } }, seed(DEMO)));
    const g = await page.locator('#sum-body').innerText();
    ok('demo: physio waste warning first', (await page.locator('.glance li').first().innerText()).startsWith('Physio sessions:'), g);
    t = await boxText(page, 'Physio sessions');
    ok('demo: physio warning', t.includes('You have used 2 in the last 30 days. At that pace about 1 more fit before it ends, so 5 sessions could go to waste. Go 2 to 3 a week to use them all.'), t);
    ok('demo: glance totals', g.includes('1 pack could have sessions going to waste.') && g.includes('Paid for and not used yet: Rs 20,000 across 3 packs.'), g);
    ok('demo: gym pass', (await boxText(page, 'Gym visits')).includes('Rs 5,000 paid: Rs 555.56 per visit so far.'));
    ok('demo: tuition per person', (await boxText(page, 'Tuition classes')).includes('Used so far: Sara 3, Omar 2.'));

    // ---------- 6. Help at four widths ----------
    for (const w of [320, 390, 820, 1280]) {
        await page.setViewportSize({ width: w, height: 800 });
        await page.evaluate(() => scrollTo(0, 0));
        await page.click('.help-btn');
        const d = page.locator('dialog.help');
        const r = await d.boundingBox();
        ok('help ' + w + ': opens inside the screen', await d.evaluate(e => e.open) && r.x >= 0 && r.x + r.width <= w && r.y >= 0 && r.y + r.height <= 800, r);
        ok('help ' + w + ': title', (await d.locator('h2').innerText()) === 'How to use Prepaid Class Pack and Sessions Tracker');
        await page.keyboard.press('Escape');
        ok('help ' + w + ': Escape closes', !(await d.evaluate(e => e.open)));
        await page.click('.help-btn'); await page.locator('.help-close').click();
        ok('help ' + w + ': Got it closes', !(await d.evaluate(e => e.open)));
        const bar = await page.evaluate(() => { const b = [...document.querySelectorAll('.topbar > *')].map(e => e.getBoundingClientRect()); return { rows: new Set(b.map(r => Math.round(r.top))).size, overlap: b.some((a, i) => b.some((c, j) => j > i && Math.min(a.right, c.right) - Math.max(a.left, c.left) > 1 && Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top) > 1)) }; });
        ok('help ' + w + ': top bar on one row, no overlap', bar.rows === 1 && !bar.overlap, bar);
    }

    // ---------- 7. screenshots ----------
    if (SHOTS) {
        await page.setViewportSize({ width: 1280, height: 900 });
        await page.evaluate(() => { document.activeElement && document.activeElement.blur(); scrollTo(0, 0); });
        await page.screenshot({ path: path.join(__dirname, 'screenshots', 'desktop.png'), fullPage: false });
        await ctx.close();
        ({ ctx, page } = await newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }, seed(DEMO)));
        await page.screenshot({ path: path.join(__dirname, 'screenshots', 'phone.png') });
    }
    await ctx.close();

    // every file the page asked for answered
    // the icon, manifest and icons are not always fetched by a headless browser, so ask for them directly
    for (const f of ['favicon.svg', 'manifest.webmanifest', 'sw.js', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'screenshots/desktop.png', 'screenshots/phone.png']) {
        const res = await fetch(URL + f); ok('file answers 200: ' + f, res.status === 200, res.status);
    }
    ['style.css', 'core.js', 'script.js', '../help.js', '../theme.js'].forEach(f => ok('requested ' + f, [...requested].some(u => u.endsWith('/' + f.replace('../', '')))));
    ok('no failed requests', !failed.length, failed);
    ok('no console errors', !errors.length, errors);
    await browser.close(); if (srv) srv.close();
    console.log(pass + ' passed, ' + fail + ' failed' + (fail ? '' : '. ALL GOOD'));
    process.exitCode = fail ? 1 : 0;
})();
