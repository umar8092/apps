// Drives the real page in headless Chromium. Run from the repo root:
//   node gold-and-jewellery-record-for-the-family/ui-test.js [--base https://umar8092.github.io/apps] [--shots]
// Without --base it serves the repo itself. --shots also saves the README screenshots.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), http = require('http');
const SLUG = 'gold-and-jewellery-record-for-the-family', ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2), bi = args.indexOf('--base'), SHOTS = args.includes('--shots');
let pass = 0; const fails = [];
const ok = (c, name) => { if (c) pass++; else fails.push(name); };
const eq = (a, b, name) => ok(a === b, name + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')');
const has = (a, b, name) => ok(String(a).includes(b), name + ' (got ' + JSON.stringify(String(a).slice(0, 300)) + ')');

function serve() {
    const types = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml', png: 'image/png', webmanifest: 'application/manifest+json', woff2: 'font/woff2' };
    return new Promise(res => {
        const s = http.createServer((q, r) => {
            let p = decodeURIComponent(q.url.split('?')[0].replace(/^\/apps/, '')); if (p.endsWith('/')) p += 'index.html';
            const f = path.join(ROOT, p);
            if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
            r.writeHead(200, { 'content-type': types[f.split('.').pop()] || 'application/octet-stream' }); r.end(fs.readFileSync(f));
        }).listen(0, () => res({ s, base: 'http://localhost:' + s.address().port + '/apps' }));
    });
}

(async () => {
    let srv = null, BASE = bi >= 0 ? args[bi + 1].replace(/\/$/, '') : null;
    if (!BASE) { srv = await serve(); BASE = srv.base; }
    const URL_ = BASE + '/' + SLUG + '/';
    const browser = await chromium.launch();
    const errors = [], bad = [];
    async function ctxPage(o) {
        const ctx = await browser.newContext(Object.assign({ viewport: { width: 390, height: 800 }, acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] }, o || {}));
        await ctx.route(/goatcounter\.com|gc\.zgo\.at/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
        const page = await ctx.newPage();
        page.on('pageerror', e => errors.push(e.message));
        page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
        page.on('response', r => { if (r.status() >= 400 && r.url().startsWith(BASE)) bad.push(r.status() + ' ' + r.url()); });
        await page.goto(URL_, { waitUntil: 'networkidle' });
        return { ctx, page };
    }
    const txt = (page, sel) => page.locator(sel).first().innerText();
    const vis = (page, sel) => page.locator(sel).first().isVisible();
    async function add(page, o) {
        await page.fill('#p-owner', o.owner); await page.fill('#p-name', o.name);
        await page.selectOption('#p-pur', o.pur || 'g22');
        if (o.purx) await page.fill('#p-purx', o.purx);
        await page.selectOption('#p-unit', o.unit || 'tola');
        if (o.unit === 'tmr') { await page.fill('#p-wt', o.t || ''); await page.fill('#p-wm', o.m || ''); await page.fill('#p-wr', o.r || ''); }
        else await page.fill('#p-w', o.w);
        if (o.stone) { if (await vis(page, '#stone-open')) await page.click('#stone-open'); await page.fill('#p-s', o.stone); }
        if (o.place) await page.fill('#p-place', o.place);
        if (o.paid || o.got || o.note) {
            if (await vis(page, '#more-open')) await page.click('#more-open');
            if (o.got) await page.fill('#p-got', o.got);
            if (o.paid) await page.fill('#p-paid', o.paid);
            if (o.note) await page.fill('#p-note', o.note);
        }
        await page.click('#p-save');
    }
    async function setRate(page, gold, extra) {
        await page.fill('#r-gold', gold);
        if (extra && extra.k22 != null) { if (await vis(page, '#rk-open')) await page.click('#rk-open'); await page.fill('#r-k22', extra.k22); }
        if (extra && extra.silver != null) { if (await vis(page, '#rs-open')) await page.click('#rs-open'); await page.fill('#r-silver', extra.silver); }
        await page.click('#r-save');
    }
    const personBox = (page, name) => page.locator('.person', { has: page.locator('h3.ps-name', { hasText: name }) });
    const pieceBox = (page, name) => page.locator('#people .piece', { has: page.locator('h4', { hasText: name }) });

    // ---------- 1. first use, empty state, optional fields hidden ----------
    let { ctx, page } = await ctxPage();
    ok(await vis(page, '#intro'), 'first use shows How it works');
    ok(!(await vis(page, '#glance')) && !(await vis(page, '#family')) && !(await vis(page, '#history')), 'first use hides the summary, people and history');
    for (const id of ['#stone-box', '#more-box', '#pur-x-box', '#rk-box', '#rs-box', '#w-tmr']) ok(!(await vis(page, id)), 'optional ' + id + ' hidden at first');
    eq(await page.inputValue('#p-pur'), 'g22', '22k is picked first');
    has(await txt(page, '#r-when'), 'No rate saved yet', 'no rate yet');

    // ---------- 2. mistakes are caught ----------
    await page.click('#p-save');
    has(await txt(page, '#p-owner-err'), 'whose it is', 'blank owner');
    has(await txt(page, '#p-name-err'), 'what it is', 'blank name');
    has(await txt(page, '#p-w-err'), 'Type the weight', 'blank weight');
    await page.fill('#p-owner', 'Ayesha'); await page.fill('#p-name', 'Test');
    for (const [w, msg] of [['0', 'bigger than 0'], ['-2', 'minus'], ['abc', 'as a number'], ['1.23456', 'decimal'], ['99999', 'too heavy']]) {
        await page.fill('#p-w', w); await page.click('#p-save'); has(await txt(page, '#p-w-err'), msg, 'weight "' + w + '"');
    }
    await page.fill('#p-w', '1'); await page.click('#stone-open'); await page.fill('#p-s', '1'); await page.click('#p-save');
    has(await txt(page, '#p-s-err'), 'cannot weigh as much', 'stones as heavy as the piece');
    await page.click('#stone-close');
    await page.selectOption('#p-unit', 'tmr'); await page.fill('#p-wt', '1'); await page.fill('#p-wm', '12'); await page.click('#p-save');
    has(await txt(page, '#p-w-err'), '0 to 11', '12 masha');
    await page.fill('#p-wm', ''); await page.fill('#p-wr', '8'); await page.click('#p-save');
    has(await txt(page, '#p-w-err'), '0 to 7.9', '8 ratti');
    await page.selectOption('#p-unit', 'tola');
    await page.selectOption('#p-pur', 'gx'); ok(await vis(page, '#p-purx'), 'another karat asks for it');
    await page.fill('#p-purx', '30'); await page.fill('#p-w', '1'); await page.click('#p-save'); has(await txt(page, '#p-purx-err'), '1 to 24', 'karat 30');
    await page.selectOption('#p-pur', 'g22'); ok(!(await vis(page, '#p-purx')), 'karat box hides again');
    await page.click('#more-open'); await page.fill('#p-got', '2099-01-01'); await page.fill('#p-paid', '-5'); await page.click('#p-save');
    has(await txt(page, '#p-got-err'), 'future', 'future date'); has(await txt(page, '#p-paid-err'), 'minus', 'negative price');
    eq(await page.locator('.piece').count(), 0, 'nothing saved while there are mistakes');
    await page.fill('#p-got', ''); await page.fill('#p-paid', '');
    await page.reload(); // start the form fresh

    // ---------- 3. the main situation: Ayesha's 7.5 tola of 22k at 3,50,000 per tola ----------
    await page.selectOption('#group', 'lakh'); await page.selectOption('#cur', 'Rs');
    await add(page, { owner: 'Ayesha', name: 'Wedding set', w: '5', place: 'Bank locker' });
    has(await txt(page, '#add-msg'), 'Saved Wedding set for Ayesha: 5.000 tola', 'saved message');
    eq(await page.inputValue('#p-owner'), 'Ayesha', 'person stays filled in for the next piece');
    eq(await page.inputValue('#p-name'), '', 'name cleared for the next piece');
    // tola, masha, ratti, with the live preview
    await page.fill('#p-name', 'Bangles'); await page.selectOption('#p-unit', 'tmr'); await page.fill('#p-wt', '2'); await page.fill('#p-wm', '6');
    has(await txt(page, '#p-w-out'), '2.500 tola = 2 tola 6 masha = 29.16 g', 'live preview of 2 tola 6 masha');
    await page.keyboard.press('Enter'); // Enter saves
    eq(await page.locator('#people .piece').count(), 2, 'two pieces saved (Enter key saves)');
    ok(await vis(page, '#glance') && !(await vis(page, '#intro')), 'summary replaces How it works');
    has(await txt(page, '#glance'), 'Type today\'s gold rate', 'asks for the rate before it has one');
    await setRate(page, '3,50,000');
    has(await txt(page, '#rates-msg'), 'worth Rs 24,06,250', 'rate saved message gives the value');
    const g1 = await txt(page, '#glance');
    has(g1, '7.500 tola', 'family total 7.500 tola'); has(g1, '87.48 g', 'in grams'); has(g1, '7 tola 6 masha', 'in tola masha');
    has(g1, 'Pure gold in it: 6.875 tola', 'pure gold'); has(g1, 'Rs 24,06,250', 'worth Rs 24,06,250');
    has(g1, '24k gold Rs 3,50,000 per tola', 'the rate is shown'); has(g1, 'Before any shop deduction', 'honest about deductions');
    const ay = await personBox(page, 'Ayesha').innerText();
    has(ay, 'Worth Rs 24,06,250', 'Ayesha\'s box total'); has(ay, '2 pieces', 'Ayesha\'s count');
    has(await pieceBox(page, 'Wedding set').innerText(), 'Rs 16,04,167', '5 tola of 22k = 16,04,167');
    has(await pieceBox(page, 'Bangles').innerText(), 'Rs 8,02,083', '2.5 tola = 8,02,083');
    has(await pieceBox(page, 'Wedding set').innerText(), 'Kept: Bank locker', 'place shown');

    // ---------- 4. more people, stones, silver, a separate 22k rate ----------
    await page.fill('#p-owner', '');
    await add(page, { owner: 'Ammi', name: 'Necklace with stones', w: '3', stone: '0.5', paid: '1,20,000', got: '2015-03-10', note: 'From Nani' });
    const nk = await pieceBox(page, 'Necklace with stones').innerText();
    has(nk, '2.500 tola', 'stones taken off'); has(nk, 'stones 0.500 tola taken off', 'stones shown'); has(nk, 'Paid Rs 1,20,000 on 10 Mar 2015', 'paid shown');
    has(nk, 'Up Rs 6,82,083 on what was paid', 'gain on what was paid'); has(nk, 'From Nani', 'note shown');
    await add(page, { owner: 'Ammi', name: 'Silver anklets', pur: 's925', unit: 'g', w: '116.638' });
    has(await txt(page, '#glance'), '1 piece not counted', 'silver with no silver rate is not counted');
    has(await pieceBox(page, 'Silver anklets').innerText(), 'Type the silver rate', 'piece says what is missing');
    ok(await vis(page, '#rs-box') || await vis(page, '#rs-open'), 'silver rate offered');
    await setRate(page, '3,50,000', { silver: '4500' });
    has(await pieceBox(page, 'Silver anklets').innerText(), 'Rs 41,625', '10 tola of 925 silver at 4,500 = 41,625');
    has(await txt(page, '#glance'), 'Whole family: silver', 'silver total');
    await setRate(page, '3,50,000', { k22: '3,20,000' });
    has(await pieceBox(page, 'Bangles').innerText(), 'Rs 8,00,000', 'jeweller\'s 22k rate used as it is');
    has(await txt(page, '#glance'), 'Down Rs', 'value went down with the lower 22k rate');
    await page.fill('#r-k22', ''); await page.click('#r-save');
    has(await pieceBox(page, 'Bangles').innerText(), 'Rs 8,02,083', '22k back to 22/24 of 24k when the box is emptied');
    has(await txt(page, '#r-when'), 'today', 'rate dated today');

    // ---------- 5. edit, cancel, delete with undo ----------
    await pieceBox(page, 'Bangles').locator('button', { hasText: 'Edit' }).click();
    eq(await page.inputValue('#p-unit'), 'tmr', 'edit opens in the unit it was typed in');
    eq(await page.inputValue('#p-wm'), '6', 'edit brings back the masha');
    has(await txt(page, '#add-h'), 'Edit: Bangles', 'form says what is being edited');
    await page.fill('#p-wt', '3'); await page.fill('#p-wm', ''); await page.click('#p-save');
    has(await pieceBox(page, 'Bangles').innerText(), '3.000 tola', 'edit saved');
    eq(await page.locator('#people .piece').count(), 4, 'edit did not add a piece');
    await pieceBox(page, 'Bangles').locator('button', { hasText: 'Edit' }).click(); await page.click('#p-cancel');
    has(await txt(page, '#add-h'), 'Add a piece', 'cancel leaves edit mode');
    await pieceBox(page, 'Bangles').locator('button', { hasText: 'Delete' }).click();
    eq(await pieceBox(page, 'Bangles').count(), 0, 'deleted');
    await page.locator('#family-msg .undo').click();
    eq(await pieceBox(page, 'Bangles').count(), 1, 'undo brings it back');

    // ---------- 6. sold, given in the family, given outside, back again ----------
    await pieceBox(page, 'Bangles').locator('button', { hasText: 'Sold' }).click();
    eq(await page.inputValue('#sp-amt'), '962500', 'sold amount starts at today\'s value');
    await page.fill('#sp-amt', '9,10,000'); await page.click('.panel .primary');
    ok(await vis(page, '#history'), 'history shows');
    has(await txt(page, '#history'), 'Sold on', 'sold line'); has(await txt(page, '#history'), 'Rs 9,10,000', 'sold amount');
    ok(!(await txt(page, '#glance')).includes('10.500'), 'sold piece left out of the totals');
    await page.locator('#history .piece button', { hasText: 'I still have it' }).click();
    eq(await pieceBox(page, 'Bangles').count(), 1, 'I still have it brings it back');
    await pieceBox(page, 'Wedding set').locator('button', { hasText: 'Given' }).click();
    await page.selectOption('#gp-who', 'new'); await page.click('.panel .primary');
    has(await txt(page, '#gp-name-err'), 'Type their name', 'new person needs a name');
    await page.fill('#gp-name', 'Sara'); await page.click('.panel .primary');
    has(await personBox(page, 'Sara').innerText(), 'Wedding set', 'moved to Sara\'s box');
    has(await personBox(page, 'Sara').innerText(), 'Given by Ayesha to Sara on', 'given line kept');
    await pieceBox(page, 'Silver anklets').locator('button', { hasText: 'Given' }).click();
    await page.selectOption('#gp-who', 'out'); await page.fill('#gp-name', 'Cousin Hina'); await page.click('.panel .primary');
    has(await txt(page, '#history'), 'Given to Cousin Hina on', 'given outside goes to history');
    ok(!(await txt(page, '#glance')).includes('Whole family: silver'), 'silver total gone');

    // ---------- 7. rename ----------
    await personBox(page, 'Sara').locator('button', { hasText: 'Rename' }).click();
    await page.fill('#rn-name', 'ammi'); await page.click('.panel .primary');
    has(await txt(page, '#rn-name-err'), 'already in the list', 'cannot rename to an existing person');
    await page.fill('#rn-name', 'Sara Khan'); await page.click('.panel .primary');
    eq(await personBox(page, 'Sara Khan').count(), 1, 'renamed');

    // ---------- 8. places, copy, email ----------
    has(await txt(page, '#places'), 'Bank locker', 'place group');
    await page.locator('#places button', { hasText: 'Copy the checklist' }).first().click();
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    has(clip, '[ ] ', 'checklist copied with tick boxes');
    await page.click('#g-copy');
    const all = await page.evaluate(() => navigator.clipboard.readText());
    has(all, 'Family gold and jewellery', 'full list copied'); has(all, 'Ayesha', 'list has people');
    const mail = await page.getAttribute('#g-mail', 'href');
    ok(mail.startsWith('mailto:?subject=') && mail.includes('body='), 'email link with no recipient');

    // ---------- 9. settings ----------
    await page.selectOption('#wunit', 'g');
    has(await pieceBox(page, 'Bangles').innerText(), '34.99 g (3.000 tola)', 'grams first');
    await page.selectOption('#wunit', 'tola');
    await page.selectOption('#group', 'west');
    has(await txt(page, '#glance'), 'Rs 3,368,750', 'west grouping');
    await page.selectOption('#group', 'lakh');
    await page.selectOption('#unit-check', 'x').catch(() => {});
    // switching units keeps the weight
    await page.selectOption('#p-unit', 'tola'); await page.fill('#p-w', '2.5'); await page.selectOption('#p-unit', 'g');
    eq(await page.inputValue('#p-w'), '29.16', 'switching tola to grams converts the weight');
    await page.selectOption('#p-unit', 'tmr'); eq(await page.inputValue('#p-wm'), '6', 'and on to tola masha ratti');
    await page.fill('#p-wt', ''); await page.fill('#p-wm', ''); await page.selectOption('#p-unit', 'tola');

    // ---------- 10. saved state, reload, CSV, backup and restore ----------
    const before = await txt(page, '#glance');
    await page.reload({ waitUntil: 'networkidle' });
    eq(await txt(page, '#glance'), before, 'reload keeps everything');
    eq(await page.inputValue('#r-gold'), '350000', 'rate kept');
    let [dl] = await Promise.all([page.waitForEvent('download'), page.click('#csv')]);
    const csvText = fs.readFileSync(await dl.path(), 'utf8');
    has(csvText, 'Person,Piece,Metal', 'CSV header'); has(csvText, 'Cousin Hina', 'CSV has given pieces');
    [dl] = await Promise.all([page.waitForEvent('download'), page.click('#backup')]);
    const backupPath = await dl.path();
    const bj = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
    eq(bj.app, SLUG, 'backup is marked'); eq(bj.state.pieces.length, 4, 'backup has every piece');
    await page.click('#del-all');
    ok(!(await vis(page, '#glance')) && await vis(page, '#intro'), 'delete everything empties the app');
    await page.locator('#tools-msg .undo').click();
    has(await txt(page, '#glance'), '10.500 tola', 'undo of delete everything');
    await page.click('#del-all');
    await page.setInputFiles('#restore-file', backupPath);
    await page.waitForSelector('#glance:not([hidden])');
    has(await txt(page, '#tools-msg'), 'Restored 4 pieces for 3 people', 'restore from the backup');
    const badFile = path.join(require('os').tmpdir(), 'gold-bad.json'); fs.writeFileSync(badFile, '{"hello":1}');
    await page.setInputFiles('#restore-file', badFile);
    await page.waitForFunction(() => /not a backup/.test(document.getElementById('tools-msg').textContent));
    eq(await page.locator('#people .piece').count(), 3, 'a wrong file changes nothing');

    // ---------- 11. a photo, kept on the device ----------
    await page.fill('#p-owner', 'Ammi'); await page.fill('#p-name', 'Gold coin'); await page.selectOption('#p-pur', 'g24'); await page.fill('#p-w', '1');
    await page.click('#more-open');
    const png = Buffer.from(fs.readFileSync(path.join(__dirname, 'icons', 'icon-192.png')));
    await page.setInputFiles('#p-photo', { name: 'coin.png', mimeType: 'image/png', buffer: png });
    await page.waitForSelector('#p-photo-img:not([hidden])');
    await page.click('#p-save');
    await page.waitForSelector('.piece .thumb');
    has(await pieceBox(page, 'Gold coin').innerText(), 'Rs 3,50,000', '1 tola of 24k = the rate');
    await page.reload({ waitUntil: 'networkidle' }); await page.waitForSelector('.piece .thumb');
    ok(true, 'photo still there after reload');
    [dl] = await Promise.all([page.waitForEvent('download'), page.click('#backup')]);
    const bj2 = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
    eq(Object.keys(bj2.photos).length, 1, 'backup includes the photo');
    await pieceBox(page, 'Gold coin').locator('.thumb-btn').click();
    ok(await pieceBox(page, 'Gold coin').evaluate(e => e.classList.contains('big-photo')), 'tap the photo to see it bigger');

    // ---------- 12. an old rate, corrupt and blocked storage ----------
    await page.evaluate(k => { const s = JSON.parse(localStorage.getItem(k)); s.rates.d = '2026-01-01'; localStorage.setItem(k, JSON.stringify(s)); }, SLUG + '.state');
    await page.reload({ waitUntil: 'networkidle' });
    has(await txt(page, '#glance'), 'days old', 'old rate warned');
    await page.evaluate(k => localStorage.setItem(k, '{not json'), SLUG + '.state');
    await page.reload({ waitUntil: 'networkidle' });
    ok(await vis(page, '#intro'), 'corrupt storage starts fresh'); has(await txt(page, '#top-msg'), 'could not be read', 'and says so');
    await page.evaluate(k => localStorage.setItem(k, JSON.stringify({ people: [{ id: 'a', name: 'A' }], pieces: [{ id: 'x', owner: 'a', name: 'Bad', ug: -1 }, { id: 'y', owner: 'a', name: 'Good', metal: 'gold', k: 22, ug: 11663804 }] })), SLUG + '.state');
    await page.reload({ waitUntil: 'networkidle' });
    eq(await page.locator('#people .piece').count(), 1, 'bad saved pieces are dropped, good ones kept');
    await ctx.close();
    ({ ctx, page } = await ctxPage());
    await ctx.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
    await page.reload({ waitUntil: 'networkidle' });
    await add(page, { owner: 'A', name: 'Ring', w: '1' });
    ok(await vis(page, '#store-warn'), 'blocked storage is warned about');
    eq(await page.locator('#people .piece').count(), 1, 'still works for this visit');
    await ctx.close();

    // ---------- 13. a realistic family, at every width, both themes ----------
    async function family(page) {
        await page.selectOption('#group', 'lakh'); await page.selectOption('#cur', 'Rs');
        const L = [
            { owner: 'Ammi', name: 'Wedding necklace set (rani haar)', w: '6', stone: '0.5', place: 'Bank locker', paid: '1,85,000', got: '2001-03-15', note: 'Bari from Dadi' },
            { owner: 'Ammi', name: '6 bangles (churiyan)', unit: 'tmr', t: '4', m: '2', place: 'Home' },
            { owner: 'Ammi', name: 'Gold coin', pur: 'g24', w: '1', place: 'Bank locker', paid: '2,20,000', got: '2024-05-10' },
            { owner: 'Ayesha', name: 'Wedding set', w: '5', place: 'Bank locker' },
            { owner: 'Ayesha', name: 'Bangles', unit: 'tmr', t: '2', m: '6', place: 'Bank locker' },
            { owner: 'Ayesha', name: 'Engagement ring', pur: 'g21', unit: 'g', w: '3.2', place: 'With Ayesha' },
            { owner: 'Sara', name: 'Earrings (jhumkay)', pur: 'g18', unit: 'g', w: '4.5', place: 'Home', note: 'Gift from Nani' },
            { owner: 'Abba', name: 'Silver ring (chandi)', pur: 's925', unit: 'tola', w: '1.2', place: 'With Abba' }];
        for (const o of L) { await page.fill('#p-owner', ''); await add(page, o); }
        await setRate(page, '3,50,000', { silver: '4,500' });
    }
    ({ ctx, page } = await ctxPage({ viewport: { width: 1280, height: 900 } }));
    await family(page);
    const fam = await txt(page, '#glance');
    has(fam, '18.827 tola', 'family gold total (hand-worked)'); has(fam, 'Rs 60,47,930', 'family worth, sum of each piece at the exact rate'); has(fam, '17.266 tola', 'family pure gold'); has(fam, '2 pieces with the price written: paid Rs 4,05,000', 'what was paid');
    has(await personBox(page, 'Ayesha').innerText(), 'Worth Rs 24,90,271', 'Ayesha: 16,04,167 + 8,02,083 + 84,021');
    eq(errors.length, 0, 'no console errors so far: ' + errors.slice(0, 3).join(' | '));
    if (SHOTS) {
        await page.reload({ waitUntil: 'networkidle' });
        await page.screenshot({ path: path.join(__dirname, 'screenshots', 'desktop.png'), fullPage: true, clip: { x: 0, y: 0, width: 1280, height: 1700 } });
    }
    const state = await page.evaluate(k => localStorage.getItem(k), SLUG + '.state');
    await ctx.close();
    const WIDTHS = [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920];
    for (const scheme of ['dark', 'light']) {
        ({ ctx, page } = await ctxPage({ colorScheme: scheme, viewport: { width: 1280, height: 900 } }));
        await page.evaluate(([k, v]) => localStorage.setItem(k, v), [SLUG + '.state', state]);
        for (const filled of [true, false]) {
            if (!filled) { await page.click('#del-all'); }
            for (const w of WIDTHS) {
                const tag = scheme + ' ' + w + (filled ? ' filled' : ' cleared') + ': ';
                await page.setViewportSize({ width: w, height: 900 });
                if (filled) await page.reload({ waitUntil: 'networkidle' });
                if (filled && w <= 390) {
                    // reveal every optional field and open a panel
                    for (const id of ['#stone-open', '#more-open', '#rk-open', '#rs-open']) if (await vis(page, id)) await page.click(id);
                    await page.selectOption('#p-pur', 'gx'); await page.selectOption('#p-unit', 'tmr');
                    await page.locator('#people .piece button', { hasText: 'Given' }).first().click();
                    await page.selectOption('#gp-who', 'new');
                }
                eq(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, tag + 'no horizontal scroll');
                const out = await page.evaluate(() => [...document.querySelectorAll('main *')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1); }).slice(0, 3).map(e => e.tagName + '.' + e.className));
                eq(out.join(','), '', tag + 'nothing sticks out');
                if (w <= 390) {
                    const o = await page.evaluate(() => {
                        const els = [...document.querySelectorAll('main input:not([type=file]):not([type=checkbox]), main select, main button, main a.secondary')].filter(e => e.offsetParent && e.getBoundingClientRect().width > 0);
                        const res = [];
                        for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
                            const a = els[i].getBoundingClientRect(), b = els[j].getBoundingClientRect();
                            if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1 && !els[i].contains(els[j]) && !els[j].contains(els[i])) res.push((els[i].id || els[i].textContent.slice(0, 20)) + ' / ' + (els[j].id || els[j].textContent.slice(0, 20)));
                        }
                        // placeholders must fit their box
                        document.querySelectorAll('main input[placeholder]').forEach(i => { if (!i.offsetParent) return; const c = document.createElement('canvas').getContext('2d'); const cs = getComputedStyle(i); c.font = cs.fontSize + ' ' + cs.fontFamily; const room = i.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight); if (c.measureText(i.placeholder).width > room + 1) res.push('placeholder cut: ' + i.id); });
                        return res.slice(0, 4);
                    });
                    eq(o.join('; '), '', tag + 'no controls overlap, placeholders fit');
                }
                if (w >= 900) {
                    for (const pos of [0, 0.5, 1]) {
                        await page.evaluate(p => window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * p), pos);
                        const o = await page.evaluate(() => { const res = []; document.querySelectorAll('main, .col-a, .col-b').forEach(par => { const k = [...par.children].filter(e => e.offsetParent && getComputedStyle(e).display !== 'contents'); for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { const a = k[i].getBoundingClientRect(), b = k[j].getBoundingClientRect(); if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) res.push((k[i].id || k[i].className) + '/' + (k[j].id || k[j].className)); } }); return res; });
                        eq(o.join(';'), '', tag + 'no blocks overlap at scroll ' + pos);
                    }
                    if (filled && w === 1280) {
                        const cols = await page.evaluate(() => [document.querySelector('.col-a').getBoundingClientRect().left, document.querySelector('.col-b').getBoundingClientRect().left]);
                        ok(cols[1] - cols[0] > 300, tag + 'two columns on desktop');
                    }
                }
                if (filled && w <= 390) await page.reload({ waitUntil: 'networkidle' });
            }
        }
        await ctx.close();
    }

    // ---------- 14. help dialog and theme switch ----------
    for (const w of [320, 390, 820, 1280]) {
        ({ ctx, page } = await ctxPage({ viewport: { width: w, height: 800 } }));
        await page.click('.help-btn');
        const d = page.locator('dialog.help');
        const r = await d.boundingBox();
        ok(r && r.x >= 0 && r.y >= 0 && r.x + r.width <= w + 1 && r.y + r.height <= 801, 'help fits at ' + w);
        has(await d.innerText(), 'How to use the Gold and Jewellery Record', 'help title at ' + w);
        await page.keyboard.press('Escape'); ok(!(await d.evaluate(e => e.open)), 'Escape closes help at ' + w);
        await page.click('.help-btn'); await page.locator('.help-close').click(); ok(!(await d.evaluate(e => e.open)), 'Got it closes help at ' + w);
        const bb = await page.locator('.help-btn').boundingBox(), tb = await page.locator('.theme-toggle').boundingBox(), bk = await page.locator('.back').boundingBox();
        ok(bb && tb && bk && bb.y < 80 && Math.abs(bb.y - bk.y) < 30, 'top bar buttons sit in one row at ' + w);
        if (w === 390) {
            const before = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
            await page.click('.theme-toggle');
            const after = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
            ok(before !== after, 'light/dark switch changes the look');
        }
        await ctx.close();
    }

    // ---------- 15. phone screenshot ----------
    if (SHOTS) {
        ({ ctx, page } = await ctxPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }));
        await page.evaluate(([k, v]) => localStorage.setItem(k, v), [SLUG + '.state', state]);
        await page.reload({ waitUntil: 'networkidle' });
        await page.screenshot({ path: path.join(__dirname, 'screenshots', 'phone.png'), clip: { x: 0, y: 0, width: 390, height: 1400 }, fullPage: true });
        await ctx.close();
    }
    eq(errors.length, 0, 'no console errors: ' + errors.slice(0, 3).join(' | '));
    eq(bad.length, 0, 'no failed requests: ' + bad.slice(0, 3).join(' | '));
    await browser.close(); if (srv) srv.s.close();
    console.log(pass + ' UI checks passed, ' + fails.length + ' failed' + (fails.length ? '\n' + fails.map(f => 'FAIL ' + f).join('\n') : ''));
    process.exit(fails.length ? 1 : 0);
})();
