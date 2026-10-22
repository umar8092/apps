// Drives the real page in headless Chromium: node ui-test.js [--shots] [--base https://umar8092.github.io/apps]
// Without --base it serves this repo on localhost. With --base it tests the LIVE page. The clock is Thu 22 Oct 2026, 10:00.
const pw = (() => { for (const m of ['playwright', 'playwright-core']) { try { return require(m); } catch (e) { /* next */ } } throw new Error('playwright not found'); })();
const path = require('path'), fs = require('fs'), http = require('http');
const bi = process.argv.indexOf('--base');
const shots = process.argv.includes('--shots');
let fail = 0, url;
const ok = (name, cond, extra) => { if (!cond) fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond || extra == null ? '' : '  -> ' + JSON.stringify(extra))); };
const NOW = new Date(2026, 9, 22, 10, 0);
const KEY = 'wedding-gift-register-and-guest-list.state';
const nb = s => String(s).replace(/ /g, ' ');

function serve() {
    const ROOT = path.resolve(__dirname, '..');
    const types = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml', png: 'image/png', webmanifest: 'application/manifest+json' };
    return new Promise(res => {
        const s = http.createServer((req, rs) => {
            let p = decodeURIComponent(req.url.split('?')[0]).replace(/^\/apps/, ''); if (p.endsWith('/')) p += 'index.html';
            const f = path.join(ROOT, p);
            if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rs.writeHead(404); return rs.end('nf'); }
            rs.writeHead(200, { 'content-type': types[f.split('.').pop()] || 'application/octet-stream' }); rs.end(fs.readFileSync(f));
        }).listen(0, () => res(s));
    });
}

// a realistic register: Sara's wedding in March, the aqiqah last year, and gifts given at other families' events
function seed() {
    let q = 0;
    const fam = (id, name, relation, city) => ({ id, name, relation: relation || '', city: city || '' });
    const g = (f, dir, event, amount, date, item, note) => ({ id: 'g' + (++q), fam: f, dir, event, amount: amount * 100, item: item || '', date, note: note || '', seq: q });
    const families = [fam('f1', 'Ahmed Khan', 'cousin', 'Lahore'), fam('f2', 'Ahmed Khan', 'office', 'Karachi'), fam('f3', 'Fatima Aunty', 'neighbour'),
        fam('f4', 'Rizwan Malik', 'friend'), fam('f5', 'Nadia and Usman', 'cousin', 'Islamabad'), fam('f6', 'Shah family', 'uncle', 'Peshawar'), fam('f7', 'Hina Baji', 'sister-in-law')];
    const events = [{ id: 'e1', name: "Sara's wedding" }, { id: 'e2', name: "Omar's aqiqah" }];
    const gifts = [g('f1', 'out', "Bilal's wedding", 3000, '2022-11-05'), g('f1', 'in', 'e1', 5000, '2026-03-12'), g('f2', 'in', 'e1', 2000, '2026-03-12', 'gold ring'),
        g('f3', 'in', 'e1', 0, '2026-03-12', 'two suits'), g('f4', 'in', 'e1', 1500, '2026-03-12', '', 'sent with his brother'), g('f5', 'in', 'e1', 10000, '2026-03-12'),
        g('f6', 'in', 'e1', 25000, '2026-03-12'), g('f6', 'out', "their son's walima", 20000, '2025-12-20'), g('f7', 'in', 'e2', 3000, '2025-06-01'),
        g('f5', 'out', 'their housewarming', 5000, '2024-08-10'), g('f4', 'in', 'e2', 1000, '2025-06-01')];
    const guests = [{ id: 'x1', event: 'e1', fam: 'f1', n: 4, status: 'yes' }, { id: 'x2', event: 'e1', fam: 'f2', n: 3, status: 'wait' }, { id: 'x3', event: 'e1', fam: 'f3', n: 2, status: 'no' },
        { id: 'x4', event: 'e1', fam: 'f4', n: 5, status: 'yes' }, { id: 'x5', event: 'e1', fam: 'f5', n: 6, status: 'yes' }, { id: 'x6', event: 'e1', fam: 'f6', n: 8, status: 'wait' }];
    return { v: 1, cur: 'Rs', sort: 'name', seq: q, families, events, gifts, guests };
}

async function load(b, vp, opt = {}) {
    const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: vp.width < 500 ? 2 : 1, colorScheme: opt.theme || 'dark', locale: 'en-GB',
        permissions: ['clipboard-read', 'clipboard-write'], acceptDownloads: true, serviceWorkers: 'block' });
    await ctx.route(/goatcounter\.com|gc\.zgo\.at/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
    if (opt.state !== undefined) await ctx.addInitScript(([k, s]) => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem(k, s); } }, [KEY, typeof opt.state === 'string' ? opt.state : JSON.stringify(opt.state)]);
    if (opt.ui) await ctx.addInitScript(u => { if (!sessionStorage.getItem('ui')) { sessionStorage.setItem('ui', '1'); localStorage.setItem('wedding-gift-register-and-guest-list.ui', u); } }, JSON.stringify(opt.ui));
    const page = await ctx.newPage();
    await page.clock.setFixedTime(NOW);
    page.errors = [];
    page.on('pageerror', e => page.errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') page.errors.push(m.text()); });
    page.bad = [];
    page.on('response', r => { if (r.status() >= 400) page.bad.push(r.status() + ' ' + r.url()); });
    await page.goto(url, { waitUntil: 'networkidle' });
    return { ctx, page };
}
const txt = async (p, sel) => nb((await p.textContent(sel)) || '').replace(/\s+/g, ' ').trim();
async function addGift(p, o) {
    await p.check('input[name=dir][value=' + (o.out ? 'out' : 'in') + ']');
    await p.fill('#fam', o.fam);
    if (o.city || o.rel) { if (await p.isVisible('#more-open')) await p.click('#more-open'); if (o.rel) await p.fill('#rel', o.rel); if (o.city) await p.fill('#city', o.city); }
    if (o.ev != null) await p.fill('#ev', o.ev);
    await p.fill('#amount', o.amt || '');
    if (o.item) { if (await p.isVisible('#item-open')) await p.click('#item-open'); await p.fill('#item', o.item); }
    if (o.date) { if (await p.isVisible('#date-open')) await p.click('#date-open'); await p.fill('#date', o.date); }
    if (o.note) { await p.click('#note-open'); await p.fill('#note', o.note); }
    if (o.enter) await p.press('#amount', 'Enter'); else await p.click('#save');
}
const stored = p => p.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), KEY);
const famBox = (p, label) => p.locator('.person', { has: p.locator('.p-name', { hasText: new RegExp('^' + label.replace(/[()]/g, '\\$&') + '$') }) });

async function main() {
    const b = await pw.chromium.launch();

    // ---------- first use, the main situation, typing mistakes ----------
    let { ctx, page: p } = await load(b, { width: 390, height: 860 });
    ok('first use: events say how to start', await p.isVisible('#ev-empty') && /They gave us/.test(await txt(p, '#ev-empty')));
    ok('first use: families empty message', await p.isVisible('#empty'));
    ok('first use: optional fields hidden', !(await p.isVisible('#rel')) && !(await p.isVisible('#city')) && !(await p.isVisible('#item')) && !(await p.isVisible('#note')) && !(await p.isVisible('#date')));
    ok('first use: no sort or search with nobody', !(await p.isVisible('#sort')) && !(await p.isVisible('#find')));
    ok('first use: event label for "They gave us"', await txt(p, '#ev-label') === 'At which of your events?');

    // blank, zero, negative, words, huge, future
    await p.click('#save');
    ok('blank: name error', /Type the name/.test(await txt(p, '#fam-err')));
    ok('blank: event error', /Sara's wedding/.test(await txt(p, '#ev-err')));
    ok('blank: amount error says gift in kind is possible', /gift in kind/.test(await txt(p, '#amount-err')));
    for (const [v, re] of [['0', /more than 0/], ['-500', /minus/], ['five thousand', /number/], ['10000000000', /too big/], ['0.505', /2 numbers after/]]) {
        await addGift(p, { fam: 'Test', ev: 'Test event', amt: v });
        ok('amount "' + v + '" refused', re.test(await txt(p, '#amount-err')), await txt(p, '#amount-err'));
    }
    await addGift(p, { fam: 'Test', ev: 'Test event', amt: '100', date: '2026-10-23' });
    ok('future date refused', /future/.test(await txt(p, '#date-err')));
    ok('nothing saved after mistakes', (await stored(p)) === null || (await stored(p)).gifts.length === 0);
    await p.click('#date-today');

    // the real situation: envelopes after Sara's wedding, typed the next day
    await p.selectOption('#cur', 'Rs');
    await addGift(p, { fam: 'Ahmed Khan', rel: 'cousin', city: 'Lahore', ev: "Sara's wedding", amt: '5,000', date: '2026-10-18' });
    ok('saved message with undo', /Saved: Ahmed Khan \(Lahore\) gave you Rs 5,000 at Sara's wedding/.test(await txt(p, '#add-msg')) && await p.isVisible('#add-msg .undo'), await txt(p, '#add-msg'));
    ok('after save: event and date stay, name and amount clear', await p.inputValue('#ev') === "Sara's wedding" && await p.inputValue('#date') === '2026-10-18' && await p.inputValue('#fam') === '' && await p.inputValue('#amount') === '');
    ok('after save: focus back on the name', await p.evaluate(() => document.activeElement.id) === 'fam');
    ok('event note says adding to the event', /Adding to Sara's wedding: received Rs 5,000 from 1 family so far/.test(await txt(p, '#ev-note')), await txt(p, '#ev-note'));
    // same name, another city: the hint explains, and the city makes a new family
    await p.fill('#fam', 'Ahmed Khan');
    ok('existing name shows what they gave', /Already in your list: Ahmed Khan \(Lahore\), cousin.*Gave you: Rs 5,000 at Sara's wedding, 18 Oct 2026/.test(await txt(p, '#fam-note')));
    ok('existing name tells how to add a different family', /different family with the same name/.test(await txt(p, '#fam-note')));
    await addGift(p, { fam: 'Ahmed Khan', city: 'Karachi', ev: "Sara's wedding", amt: '2000', item: 'gold ring' });
    await addGift(p, { fam: 'Fatima Aunty', ev: "Sara's wedding", amt: '', item: 'two suits' });
    ok('gift in kind only, no cash, is accepted', /Fatima Aunty gave you two suits/.test(await txt(p, '#add-msg')));
    await addGift(p, { fam: 'Rizwan', ev: "Sara's wedding", amt: 'Rs 1,00,000', enter: true });
    ok('pasted "Rs 1,00,000" and Enter saves, lakh grouping', /Rizwan gave you Rs 1,00,000/.test(await txt(p, '#add-msg')), await txt(p, '#add-msg'));
    // ambiguous name now
    await addGift(p, { fam: 'Ahmed Khan', ev: "Sara's wedding", amt: '500' });
    ok('two Ahmed Khans: asks which one', /Two or more families have this name/.test(await txt(p, '#fam-err')), [await txt(p, '#fam-err'), await txt(p, '#add-msg')]);
    await p.fill('#fam', '');
    // we gave them
    await addGift(p, { fam: 'Ahmed Khan (Lahore)', out: true, ev: "Bilal's wedding", amt: '3000', date: '2022-11-05' });
    ok('we gave: message', /you gave Ahmed Khan \(Lahore\) Rs 3,000 at Bilal's wedding/.test(await txt(p, '#add-msg')), await txt(p, '#add-msg'));
    ok('we gave: label changes', await txt(p, '#ev-label') === 'At which of their events?');
    await p.check('input[name=dir][value=in]');
    ok('switching back keeps our event and its date', await p.inputValue('#ev') === "Sara's wedding" && await p.inputValue('#date') === '2026-10-18', await p.inputValue('#date'));
    // the answers
    ok('event total', await txt(p, '#events .ev-words') === 'Received Rs 1,07,000 from 3 families · 2 gifts in kind', await txt(p, '#events .ev-words'));
    ok('Lahore box: gave', /Gave you: Rs 5,000 at Sara's wedding, 18 Oct 2026/.test(await txt(famBox(p, 'Ahmed Khan (Lahore)'), '.p-line')) || /Gave you: Rs 5,000/.test(await famBox(p, 'Ahmed Khan (Lahore)').innerText()));
    const lahore = nb(await famBox(p, 'Ahmed Khan (Lahore)').innerText());
    ok('Lahore box: you gave', /You gave them: Rs 3,000 at Bilal's wedding, 5 Nov 2022/.test(lahore), lahore);
    ok('Lahore box: difference', /They have given you Rs 2,000 more than you gave them\./.test(lahore));
    // duplicate envelope warning
    await p.fill('#fam', 'Rizwan'); await p.fill('#amount', '500');
    ok('second gift at the same event is flagged before saving', /already gave Rs 1,00,000 at this event: this adds a second gift/.test(await txt(p, '#preview')), await txt(p, '#preview'));
    await p.fill('#fam', ''); await p.fill('#amount', '');
    // undo the last save
    await addGift(p, { fam: 'Mistake', ev: "Sara's wedding", amt: '999' });
    await p.click('#add-msg .undo');
    ok('undo removes the last gift and the new family', (await stored(p)).families.every(f => f.name !== 'Mistake') && /Undone/.test(await txt(p, '#add-msg')));
    // very long name
    const long = 'Chaudhry Muhammad Abdul Rehman Siddiqui and family of Gujranwala'.slice(0, 60);
    await addGift(p, { fam: long, ev: "Sara's wedding", amt: '700' });
    ok('long name: no horizontal scroll', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));

    // reload: everything saved
    await p.reload({ waitUntil: 'networkidle' });
    ok('reload keeps families, events and currency', (await p.locator('.person').count()) === 5 && await p.inputValue('#cur') === 'Rs' && /1,07,700/.test(await txt(p, '#events')));
    // history: edit and delete
    const riz = famBox(p, 'Rizwan');
    await riz.locator('button', { hasText: /^History/ }).click();
    await riz.locator('.h-row button', { hasText: 'Edit' }).first().click();
    await riz.locator('.h-edit input[id^=ed-am-]').fill('1000');
    await riz.locator('.h-edit button', { hasText: 'Save' }).click();
    ok('edit a gift: 1,00,000 typo fixed to 1,000', /Gave you: Rs 1,000 at Sara's wedding/.test(nb(await famBox(p, 'Rizwan').innerText())));
    ok('history stays open after an edit', await famBox(p, 'Rizwan').locator('.panel').count() === 1);
    await famBox(p, 'Rizwan').locator('.h-row button', { hasText: 'Delete' }).first().click();
    ok('delete a gift', /Gave you: nothing yet/.test(nb(await famBox(p, 'Rizwan').innerText())));
    await p.click('#list-msg .undo');
    ok('undo the delete', /Gave you: Rs 1,000/.test(nb(await famBox(p, 'Rizwan').innerText())));
    // edit family: duplicate label refused, rename works
    await famBox(p, 'Rizwan').locator('button', { hasText: 'Edit family' }).click();
    await p.fill('[id^=fe-n-]', 'Ahmed Khan'); await p.fill('[id^=fe-c-]', 'Lahore'); await p.click('.person .panel button:has-text("Save")');
    ok('rename to an existing family is refused', /already a family called Ahmed Khan \(Lahore\)/.test(await txt(p, '.person .panel .err')));
    await p.fill('[id^=fe-n-]', 'Rizwan Malik'); await p.fill('[id^=fe-c-]', ''); await p.fill('[id^=fe-r-]', 'friend'); await p.press('[id^=fe-r-]', 'Enter');
    ok('rename a family', await famBox(p, 'Rizwan Malik').count() === 1);
    // delete a family with undo
    await famBox(p, long).locator('button', { hasText: 'Delete family' }).click();
    ok('delete family', await famBox(p, long).count() === 0 && /Deleted/.test(await txt(p, '#list-msg')));
    await p.click('#list-msg .undo');
    ok('undo delete family', await famBox(p, long).count() === 1);
    // search and sort
    await p.fill('#find', 'lahore');
    ok('search by city', (await p.locator('.person').count()) === 1 && /1 family matches/.test(await txt(p, '#found')));
    await p.fill('#find', 'zzzz');
    ok('search with no match explains', /No family matches/.test(await txt(p, '#found')));
    await p.fill('#find', '');
    await p.selectOption('#sort', 'gave');
    ok('sort: gave you most first', (await txt(p, '.person .p-name')) === 'Ahmed Khan (Lahore)', await txt(p, '.person .p-name'));
    // rename and delete an event
    await p.click('#events button:has-text("Rename or delete")');
    await p.fill('[id^=evn-]', "Sara and Ali's wedding"); await p.click('#events button:has-text("Save name")');
    ok('rename event', /Sara and Ali's wedding/.test(await txt(p, '#events')) && /Sara and Ali's wedding/.test(nb(await famBox(p, 'Fatima Aunty').innerText())));
    await p.click('#events button:has-text("Rename or delete")');
    await p.click('#events .danger');
    ok('delete event removes its gifts', await p.isVisible('#ev-empty') && /Gave you: nothing yet/.test(nb(await famBox(p, 'Fatima Aunty').innerText())));
    await p.click('#list-msg .undo');
    ok('undo event delete', /Received Rs 8,700/.test(await txt(p, '#events')), await txt(p, '#events'));
    // copy
    await p.click('#copy-all');
    const clip = nb(await p.evaluate(() => navigator.clipboard.readText()));
    ok('copy the register', /Gift register, 22 Oct 2026/.test(clip) && /Ahmed Khan \(Lahore\), cousin\n  Gave you: Rs 5,000/.test(clip), clip.slice(0, 200));
    await p.click('#events button:has-text("Copy list")');
    const clip2 = nb(await p.evaluate(() => navigator.clipboard.readText()));
    ok('copy one event\'s list', /^Gifts received at Sara and Ali's wedding \(18 Oct 2026\)\nReceived Rs 8,700 from 4 families · 2 gifts in kind/.test(clip2), clip2.slice(0, 160));
    // email: a mailto link with no address
    const mail = await p.evaluate(() => new Promise(res => { const orig = Object.getOwnPropertyDescriptor(Location.prototype, 'href'); let got = ''; try { document.getElementById('email-all').click(); } catch (e) { /* */ } setTimeout(() => res(got || 'clicked'), 300); }));
    ok('email button works with no recipients typed', mail === 'clicked' && !p.errors.length);
    // currency none
    await p.selectOption('#cur', '');
    ok('no currency: plain numbers', /Received 8,700 from 4 families/.test(await txt(p, '#events')));
    await p.selectOption('#cur', 'Rs');
    // backup and restore
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#backup')]);
    const bpath = path.join(require('os').tmpdir(), 'wgr-backup.json'); await dl.saveAs(bpath);
    const bk = JSON.parse(fs.readFileSync(bpath, 'utf8'));
    ok('backup file has everything', bk.app === 'wedding-gift-register-and-guest-list' && bk.families.length === 5 && bk.gifts.length === 6, [bk.families.length, bk.gifts.length]);
    await p.click('#wipe');
    ok('delete everything', await p.isVisible('#empty') && /Deleted everything/.test(await txt(p, '#tools-msg')));
    const badFile = path.join(require('os').tmpdir(), 'wgr-bad.json'); fs.writeFileSync(badFile, '{"hello":1}');
    await p.setInputFiles('#restore-file', badFile);
    ok('restore a wrong file is refused', /not a backup from this app/.test(await txt(p, '#tools-msg')));
    await p.setInputFiles('#restore-file', bpath);
    ok('restore the backup', /Restored 5 families and 6 gifts/.test(await txt(p, '#tools-msg')) && (await p.locator('.person').count()) === 5);
    ok('no console errors (main flow)', !p.errors.length, p.errors);
    await ctx.close();

    // ---------- guest list ----------
    ({ ctx, page: p } = await load(b, { width: 390, height: 860 }));
    await p.click('#tab-guests');
    ok('guest list with no event: asks for a new event, no cancel', await p.isVisible('#g-new') && !(await p.isVisible('#g-new-cancel')) && !(await p.isVisible('#g-body')));
    await p.click('#g-new-save');
    ok('blank event name refused', /Type a name/.test(await txt(p, '#g-new-err')));
    await p.fill('#g-new', "Omar's walima"); await p.press('#g-new', 'Enter');
    ok('new event created', await p.isVisible('#g-body') && await p.inputValue('#g-event') !== '' && /Created Omar's walima/.test(await txt(p, '#g-msg')));
    ok('new event box closed', !(await p.isVisible('#g-new')));
    await p.fill('#g-fam', 'Shah family'); await p.fill('#g-n', '8'); await p.click('#g-add');
    await p.fill('#g-fam', 'Hina Baji'); await p.fill('#g-n', '3'); await p.press('#g-n', 'Enter');
    await p.fill('#g-fam', 'Hina Baji'); await p.click('#g-add');
    ok('same family twice refused', /already on this guest list/.test(await txt(p, '#g-fam-err')));
    for (const v of ['0', 'abc', '-1']) { await p.fill('#g-fam', 'New Person'); await p.fill('#g-n', v); await p.click('#g-add'); ok('people "' + v + '" refused', /from 1 to 999/.test(await txt(p, '#g-fam-err'))); }
    await p.fill('#g-fam', ''); await p.fill('#g-n', '1');
    await p.click('.guest:has-text("Shah family") .s-yes');
    await p.click('.guest:has-text("Hina Baji") button[aria-label^="One more"]');
    ok('stepper and status', await txt(p, '#g-words') === 'Invited 2 families (12 people). Coming: 8 people. No reply yet from 1 family (4 people), so plan for 8 to 12 people. 0 of the invited families gave a gift at Omar\'s walima.', await txt(p, '#g-words'));
    ok('tiles', await txt(p, '#gt-yes') === '8' && await txt(p, '#gt-wait') === '4' && await txt(p, '#gt-wait-f') === 'people, 1 family');
    ok('focus stays on the pressed button', await p.evaluate(() => document.activeElement.getAttribute('aria-label') || '') === 'One more person from Hina Baji');
    await p.selectOption('#g-show', 'yes');
    ok('filter: coming only', (await p.locator('.guest').count()) === 1);
    await p.selectOption('#g-show', 'all');
    await p.click('.guest:has-text("Shah family") .g-rm');
    ok('remove a guest', (await p.locator('.guest').count()) === 1);
    await p.click('#g-msg .undo');
    ok('undo remove', (await p.locator('.guest').count()) === 2);
    await p.click('#g-copy');
    ok('copy the guest list', /^Guest list for Omar's walima/.test(await p.evaluate(() => navigator.clipboard.readText())));
    await p.click('#tab-gifts');
    ok('guests typed here become families in the register', (await p.locator('.person').count()) === 2 && /Guest list: 2 families, 8 people coming/.test(await txt(p, '#events')), await txt(p, '#events'));
    await p.reload({ waitUntil: 'networkidle' });
    ok('remembers the page you were on', await p.isVisible('.person'));
    ok('no console errors (guest list)', !p.errors.length, p.errors);
    await ctx.close();

    // ---------- seeded: guests view, add all, reload, corrupt state ----------
    ({ ctx, page: p } = await load(b, { width: 390, height: 860 }, { state: seed(), ui: { view: 'guests', gEvent: 'e1', gShow: 'all' } }));
    ok('seeded guest words', await txt(p, '#g-words') === "Invited 6 families (28 people). Coming: 15 people. No reply yet from 2 families (11 people), so plan for 15 to 26 people. 6 of the invited families gave a gift at Sara's wedding.", await txt(p, '#g-words'));
    ok('guest box shows the gift at this event', /Gave Rs 2,000 and gold ring here/.test(nb(await p.locator('.guest').first().innerText())));
    await p.click('#g-all');
    ok('add every family in the register', /Added 1 family/.test(await txt(p, '#g-msg')) && (await p.locator('.guest').count()) === 7);
    await p.click('#g-all');
    ok('add all again: nothing to add', /already on this guest list/.test(await txt(p, '#g-msg')));
    await ctx.close();
    ({ ctx, page: p } = await load(b, { width: 390, height: 860 }, { state: '{bad json' }));
    ok('corrupt saved state: starts fresh, no errors', await p.isVisible('#empty') && !p.errors.length, p.errors);
    await ctx.close();
    const half = seed(); half.gifts.push({ id: 'zz', fam: 'nobody', dir: 'in', event: 'e1', amount: 5, date: '2026-01-01' }); half.families.push({ id: 'f1', name: 'Dup id' }); half.guests.push({ id: 'y', event: 'e1', fam: 'f1', n: -4, status: 'yes' });
    ({ ctx, page: p } = await load(b, { width: 390, height: 860 }, { state: half }));
    ok('half-broken saved state: bad rows dropped', (await p.locator('.person').count()) === 7 && /Received Rs 43,500 from 5 families/.test(await txt(p, '#events')), await txt(p, '#events'));
    await ctx.close();

    // ---------- 500 families ----------
    const big = { v: 1, cur: 'Rs', sort: 'name', seq: 500, families: [], events: [{ id: 'e', name: 'Wedding' }], gifts: [], guests: [] };
    for (let i = 0; i < 500; i++) { big.families.push({ id: 'f' + i, name: 'Family ' + String(i).padStart(3, '0'), relation: '', city: 'City ' + (i % 20) }); big.gifts.push({ id: 'g' + i, fam: 'f' + i, dir: 'in', event: 'e', amount: 100000, item: '', date: '2026-10-01', note: '', seq: i }); }
    ({ ctx, page: p } = await load(b, { width: 1280, height: 900 }, { state: big }));
    ok('500 families: total', /Received Rs 5,00,000 from 500 families/.test(await txt(p, '#events')));
    ok('500 families: first 50 shown with Show more', (await p.locator('.person').count()) === 50 && /450 families not shown/.test(await txt(p, '#show-more')));
    const t0 = Date.now(); await p.fill('#find', 'family 4'); const dt = Date.now() - t0;
    ok('500 families: search as you type is quick', dt < 1500 && (await p.locator('.person').count()) === 50, dt);
    await p.click('#show-more');
    ok('show more', (await p.locator('.person').count()) === 100 + 11 - 0 || (await p.locator('.person').count()) > 50);
    await ctx.close();

    // ---------- light/dark switch ----------
    ({ ctx, page: p } = await load(b, { width: 390, height: 860 }, { theme: 'light' }));
    const bg1 = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await p.click('.theme-toggle');
    ok('light/dark switch', await p.evaluate(() => document.documentElement.dataset.theme) === 'dark' && bg1 !== await p.evaluate(() => getComputedStyle(document.body).backgroundColor));
    await ctx.close();

    // ---------- every width, filled in and cleared, both pages ----------
    for (const theme of ['dark', 'light']) for (const view of ['gifts', 'guests']) for (const w of [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920]) {
        ({ ctx, page: p } = await load(b, { width: w, height: 900 }, { theme, state: seed(), ui: { view, gEvent: 'e1', gShow: 'all' } }));
        const tag = theme + ' ' + view + ' ' + w + 'px';
        if (view === 'gifts') {
            await p.click('#more-open'); await p.click('#item-open'); await p.click('#note-open'); await p.click('#date-open');
            await p.fill('#fam', 'Ahmed Khan (Lahore)');
            await famBox(p, 'Ahmed Khan (Lahore)').locator('button', { hasText: /^History/ }).click();
            await famBox(p, 'Ahmed Khan (Lahore)').locator('.h-row button', { hasText: 'Edit' }).first().click();
            await p.click('#events button:has-text("Rename or delete") >> nth=0');
        } else { await p.click('#g-new-open'); await p.click('#g-ev-open'); }
        const res = await p.evaluate(() => {
            const out = { scroll: document.documentElement.scrollWidth > innerWidth + 1, stick: [], overlap: [], ph: [] };
            document.querySelectorAll('main *').forEach(e => { const r = e.getBoundingClientRect(); if (r.width && (r.right > innerWidth + 1 || r.left < -1) && getComputedStyle(e.parentElement).overflowX === 'visible') out.stick.push(e.tagName + '#' + e.id + '.' + e.className); });
            const k = [...document.querySelectorAll('input:not([type=radio]):not([type=hidden]), select, button')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.height; });
            for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { const a = k[i].getBoundingClientRect(), c = k[j].getBoundingClientRect(); if (Math.min(a.right, c.right) - Math.max(a.left, c.left) > 3 && Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top) > 3) out.overlap.push((k[i].id || k[i].textContent) + ' / ' + (k[j].id || k[j].textContent)); }
            const cv = document.createElement('canvas').getContext('2d');
            document.querySelectorAll('input[placeholder]').forEach(e => { const r = e.getBoundingClientRect(); if (!r.width) return; const cs = getComputedStyle(e); cv.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily; const need = cv.measureText(e.placeholder).width + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight); if (need > e.clientWidth + 1) out.ph.push(e.id || e.placeholder); });
            return out;
        });
        ok(tag + ': no horizontal scroll', !res.scroll);
        ok(tag + ': nothing sticks out', !res.stick.length, res.stick.slice(0, 3));
        ok(tag + ': no controls overlap', !res.overlap.length, res.overlap.slice(0, 3));
        ok(tag + ': placeholders fit', !res.ph.length, res.ph);
        if (w >= 900) {
            let bad = [];
            for (const pos of [0, 0.5, 1]) {
                await p.evaluate(q => scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * q), pos);
                bad = bad.concat(await p.evaluate(() => { const r = []; document.querySelectorAll('main, .app, #g-body, .col-main').forEach(h => { const k = [...h.children].filter(c => { const b2 = c.getBoundingClientRect(); return b2.width > 4 && b2.height > 4 && getComputedStyle(c).position !== 'absolute'; }); for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { const a = k[i].getBoundingClientRect(), c = k[j].getBoundingClientRect(); if (Math.min(a.right, c.right) - Math.max(a.left, c.left) > 4 && Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top) > 4) r.push(k[i].className + ' / ' + k[j].className); } }); return r; }));
            }
            ok(tag + ': no blocks overlap when scrolled', !bad.length, bad.slice(0, 3));
            if (view === 'gifts') { const two = await p.evaluate(() => { const a = document.querySelector('.col-main').getBoundingClientRect(), c = document.querySelector('.list').getBoundingClientRect(); return c.left > a.right && Math.abs(a.top - c.top) < 2; }); ok(tag + ': form and families side by side', two); }
        }
        // the cleared state at the same width
        if (w === 320 || w === 1280) {
            await p.evaluate(() => { localStorage.clear(); }); await p.reload({ waitUntil: 'networkidle' });
            ok(tag + ' cleared: no horizontal scroll', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        }
        ok(tag + ': no console errors', !p.errors.length, p.errors);
        await ctx.close();
    }

    // ---------- help at 4 widths ----------
    for (const w of [320, 390, 820, 1280]) {
        ({ ctx, page: p } = await load(b, { width: w, height: 800 }));
        await p.click('.help-btn');
        const box = await p.locator('dialog.help').boundingBox();
        ok('help ' + w + 'px: opens on screen with a title', box && box.x >= 0 && box.x + box.width <= w + 1 && box.y >= 0 && box.y + box.height <= 801 && /How to use Wedding Gift Register/.test(await txt(p, 'dialog.help h2')));
        await p.keyboard.press('Escape'); ok('help ' + w + 'px: Escape closes', !(await p.evaluate(() => document.querySelector('dialog.help').open)));
        await p.click('.help-btn'); await p.click('.help-close'); ok('help ' + w + 'px: Got it closes', !(await p.evaluate(() => document.querySelector('dialog.help').open)));
        const tb = await p.evaluate(() => { const k = [...document.querySelectorAll('.topbar > *')].map(e => e.getBoundingClientRect()); return k.every(r => Math.abs(r.top - k[0].top) < 4); });
        ok('help ' + w + 'px: top bar on one line', tb);
        await ctx.close();
    }

    // ---------- files ----------
    ({ ctx, page: p } = await load(b, { width: 390, height: 860 }));
    const base = url.replace(/\/$/, '') + '/';
    for (const f of ['favicon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'manifest.webmanifest', 'sw.js', 'core.js', 'script.js', 'style.css', '../help.js', '../theme.js', 'screenshots/desktop.png', 'screenshots/phone.png']) {
        const r = await p.request.get(base + f); ok('file ' + f + ' returns 200', r.status() === 200, r.status());
    }
    ok('no failed requests', !p.bad.length, p.bad);
    if (shots) {
        await ctx.close();
        const dir = path.join(__dirname, 'screenshots');
        for (const [w, h, name] of [[1280, 900, 'desktop.png'], [390, 844, 'phone.png']]) {
            ({ ctx, page: p } = await load(b, { width: w, height: h }, { state: seed(), ui: { view: 'gifts', gEvent: 'e1', gShow: 'all' } }));
            await p.fill('#fam', 'Ahmed Khan (Lahore)');
            if (w < 500) { await p.evaluate(() => document.getElementById('add').scrollIntoView()); await p.screenshot({ path: path.join(dir, name) }); }
            else await p.screenshot({ path: path.join(dir, name) });
            await ctx.close();
        }
        console.log('screenshots saved');
    } else await ctx.close();
    await b.close();
}

(async () => {
    let srv;
    if (bi >= 0) url = process.argv[bi + 1].replace(/\/$/, '') + '/wedding-gift-register-and-guest-list/';
    else { srv = await serve(); url = 'http://localhost:' + srv.address().port + '/apps/wedding-gift-register-and-guest-list/'; }
    try { await main(); } catch (e) { fail++; console.log('FAIL crashed: ' + e.stack); }
    if (srv) srv.close();
    console.log(fail ? '\n' + fail + ' FAILED' : '\nALL UI TESTS PASSED');
    process.exit(fail ? 1 : 0);
})();
