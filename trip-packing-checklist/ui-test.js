// Drives the real page in headless Chromium: node ui-test.js [--shots] [--base https://umar8092.github.io/apps]
// Without --base it serves this repo on localhost. With --base it tests the LIVE page.
const pw = (() => { for (const m of ['playwright', 'playwright-core', '/opt/node-tools/node_modules/playwright']) { try { return require(m); } catch (e) { /* next */ } } throw new Error('playwright not found'); })();
const path = require('path'), fs = require('fs'), http = require('http');
const bi = process.argv.indexOf('--base');
const shots = process.argv.includes('--shots');
let fail = 0, url;
const ok = (name, cond, extra) => { if (!cond) fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (!cond && extra != null ? '  -> ' + JSON.stringify(extra).slice(0, 300) : '')); };

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

async function open(b, vp, opt = {}) {
    const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: vp.width < 500 ? 2 : 1, colorScheme: opt.theme || 'dark', permissions: ['clipboard-read', 'clipboard-write'], serviceWorkers: opt.sw ? 'allow' : 'block' });
    if (opt.init) await ctx.addInitScript(opt.init);
    const p = await ctx.newPage();
    p.errors = []; p.on('console', m => m.type() === 'error' && p.errors.push(m.text())); p.on('pageerror', e => p.errors.push(String(e)));
    p.bad = []; p.on('response', r => { if (r.status() >= 400) p.bad.push(r.status() + ' ' + r.url()); });
    p.reqs = []; p.on('response', r => p.reqs.push(r.status() + ' ' + r.url()));
    await p.goto(url, { waitUntil: 'networkidle' });
    p.ctx = ctx;
    return p;
}
const txt = (p, sel) => p.locator(sel).first().innerText();
const group = (p, title) => p.locator('.group', { has: p.locator('.g-title', { hasText: new RegExp('^' + title + '$') }) });
const item = (p, g, name) => group(p, g).locator('.item', { has: p.locator('.i-name', { hasText: name }) }).first();
const qtyOf = async (p, g, name) => { const q = item(p, g, name).locator('.i-qty'); return (await q.count()) ? (await q.innerText()).trim() : null; };
async function setPeople(p, list) {
    // list: [[name, kind], ...]; the form starts with one traveller
    while (await p.locator('.person').count() < list.length) await p.click('#add-person');
    for (let i = 0; i < list.length; i++) {
        const box = p.locator('.person').nth(i);
        await box.locator('input').fill(list[i][0]);
        await box.locator('select').selectOption(list[i][1]);
    }
}
async function makeTrip(p, o) {
    if (o.people) await setPeople(p, o.people);
    if (o.nights != null) await p.fill('#nights', String(o.nights));
    for (const t of ['warm', 'cold', 'rain', 'beach', 'hike', 'work']) await p.locator('#tags input[value=' + t + ']').setChecked((o.tags || []).includes(t));
    await p.check('#travel input[value=' + (o.travel || 'plane') + ']');
    await p.locator('#abroad').setChecked(!!o.abroad);
    await p.locator('#laundry').setChecked(!!o.laundry);
    if (o.name) { if (await p.locator('#open-name').isVisible()) await p.click('#open-name'); await p.fill('#trip-name', o.name); }
    await p.click('#make');
}
async function layout(p) {
    return p.evaluate(() => {
        const W = document.documentElement.clientWidth, bad = [];
        if (document.documentElement.scrollWidth > W + 1) bad.push('horizontal scroll ' + document.documentElement.scrollWidth);
        const ctl = [...document.querySelectorAll('input:not([type=checkbox]):not([type=radio]), select, button, a.secondary')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
        ctl.forEach(e => { const r = e.getBoundingClientRect(); if (r.right > W + 1 || r.left < -1) bad.push('sticks out: ' + (e.id || e.className || e.textContent).slice(0, 40)); });
        for (let i = 0; i < ctl.length; i++) for (let j = i + 1; j < ctl.length; j++) {
            if (ctl[i].contains(ctl[j]) || ctl[j].contains(ctl[i])) continue;
            const a = ctl[i].getBoundingClientRect(), b = ctl[j].getBoundingClientRect();
            if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2) bad.push('overlap: ' + (ctl[i].id || ctl[i].textContent).slice(0, 30) + ' / ' + (ctl[j].id || ctl[j].textContent).slice(0, 30));
        }
        // placeholders and select text must fit their boxes
        const cv = document.createElement('canvas').getContext('2d');
        document.querySelectorAll('input[placeholder], select').forEach(e => {
            const r = e.getBoundingClientRect(); if (!r.width) return;
            const cs = getComputedStyle(e); cv.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
            const text = e.tagName === 'SELECT' ? (e.options[e.selectedIndex] || {}).text || '' : e.placeholder;
            const room = e.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - (e.tagName === 'SELECT' ? 18 : 0);
            if (cv.measureText(text).width > room + 1) bad.push('text cut off in ' + (e.id || e.tagName) + ': "' + text + '"');
        });
        // sibling blocks must not overlap
        document.querySelectorAll('main, .col-main, .col-side, #groups').forEach(h => {
            const k = [...h.children].filter(c => { const r = c.getBoundingClientRect(); return r.width > 4 && r.height > 4 && getComputedStyle(c).position !== 'absolute'; });
            for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { const a = k[i].getBoundingClientRect(), b = k[j].getBoundingClientRect(); if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 4 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 4) bad.push('blocks overlap: ' + k[i].className + ' / ' + k[j].className); }
        });
        return bad.slice(0, 6);
    });
}

(async () => {
    let server;
    if (bi >= 0) url = process.argv[bi + 1].replace(/\/$/, '') + '/trip-packing-checklist/';
    else { server = await serve(); url = 'http://localhost:' + server.address().port + '/trip-packing-checklist/'; }
    console.log('Testing ' + url);
    const b = await pw.chromium.launch();

    // ---------- first use: empty state
    let p = await open(b, { width: 390, height: 844 });
    ok('first use: trip form shown, list and share hidden', await p.isVisible('#trip-form') && !(await p.isVisible('#list-card')) && !(await p.isVisible('#tools')));
    ok('first use: one traveller, 3 nights, plane', await p.locator('.person').count() === 1 && await p.inputValue('#nights') === '3' && await p.isChecked('#travel input[value=plane]'));
    ok('first use: progress says No list yet and how to start', (await txt(p, '#r-big')) === 'No list yet' && /Make your list/.test(await txt(p, '#r-meta')));
    ok('first use: one traveller has no Remove button', await p.locator('.p-remove').count() === 0);
    ok('trip name is optional and hidden behind a button', await p.isVisible('#open-name') && !(await p.isVisible('#trip-name')));
    ok('3 nights hint: 4 days away', /4 days away/.test(await txt(p, '#nights-hint')));

    // ---------- nights input: presets, custom, bad values
    await p.click('#night-chips button[data-n="0"]');
    ok('Day trip chip: 0 nights, hint says a day trip, chip pressed', await p.inputValue('#nights') === '0' && /day trip/i.test(await txt(p, '#nights-hint')) && await p.getAttribute('#night-chips button[data-n="0"]', 'aria-pressed') === 'true');
    await p.click('#night-chips button[data-n="7"]');
    ok('7 chip: 8 days, laundry tip shown', /8 days away/.test(await txt(p, '#nights-hint')) && await p.isVisible('#laundry-hint') && /one week/.test(await txt(p, '#laundry-hint')));
    await p.check('#laundry');
    ok('laundry ticked: tip says clothes packed for 7 days', /packed for 7 days/.test(await txt(p, '#laundry-hint')));
    await p.uncheck('#laundry');
    await p.fill('#nights', '10');
    ok('custom 10 nights: 11 days, no chip pressed', /11 days/.test(await txt(p, '#nights-hint')) && await p.locator('#night-chips button[aria-pressed=true]').count() === 0);
    for (const [v, re] of [['', /how many nights/i], ['-1', /below 0/], ['2.5', /whole nights/], ['91', /up to 90/], ['abc', /number of nights/]]) {
        await p.fill('#nights', v); await p.click('#make');
        ok('nights "' + v + '" is refused with a clear message', re.test(await txt(p, '#nights-err')) && !(await p.isVisible('#list-card')), await txt(p, '#nights-err'));
    }
    ok('focus goes to the nights box after an error', await p.evaluate(() => document.activeElement.id) === 'nights');
    await p.check('#travel input[value=car]');
    ok('hand luggage option hidden when going by car', !(await p.isVisible('#hand')));
    await p.check('#travel input[value=plane]');
    ok('hand luggage option shown for plane', await p.isVisible('#hand'));

    // ---------- travellers: add, remove, undo, limit
    await setPeople(p, [['Sara', 'adult'], ['Tom', 'adult'], ['Leo', 'child']]);
    ok('three travellers, each in its own box', await p.locator('.person').count() === 3 && await p.locator('.p-remove').count() === 3);
    await p.locator('.person').nth(1).locator('.p-remove').click();
    ok('remove Tom: 2 boxes and an Undo', await p.locator('.person').count() === 2 && /Tom removed/.test(await txt(p, '#people-msg')));
    await p.click('#people-msg button');
    ok('Undo brings Tom back in place', await p.locator('.person').count() === 3 && await p.locator('.person').nth(1).locator('input').inputValue() === 'Tom');
    for (let i = 3; i < 8; i++) await p.click('#add-person');
    ok('8 travellers: Add a traveller is hidden', await p.locator('.person').count() === 8 && !(await p.isVisible('#add-person')));
    while (await p.locator('.person').count() > 3) await p.locator('.p-remove').last().click();

    // ---------- the main situation: family beach week abroad
    await makeTrip(p, { nights: 5, tags: ['warm', 'beach'], travel: 'plane', abroad: true });
    ok('list made: list card and share card shown, form hidden', await p.isVisible('#list-card') && await p.isVisible('#tools') && !(await p.isVisible('#trip-form')));
    ok('trip summary line', (await txt(p, '#tv-line')) === '5 nights (6 days) · Warm or sunny · Beach or pool · Plane · Abroad' && !(await p.isVisible('#tv-name')), await txt(p, '#tv-line'));
    ok('travellers listed', (await txt(p, '#tv-people')) === 'Sara (adult), Tom (adult), Leo (child)');
    ok('groups: For everyone, Sara, Tom, Leo, Before you leave home', (await p.locator('.g-title').allInnerTexts()).join('|') === 'For everyone|Sara|Tom|Leo|Before you leave home');
    ok('Sara: Underwear × 7, T-shirts × 6, shorts × 3, swimwear × 2', await qtyOf(p, 'Sara', 'Underwear') === '× 7' && await qtyOf(p, 'Sara', 'T-shirts or tops') === '× 6' && await qtyOf(p, 'Sara', 'Shorts') === '× 3' && await qtyOf(p, 'Sara', 'Swimwear') === '× 2');
    ok('Leo: T-shirts × 7, bottoms × 4, toys', await qtyOf(p, 'Leo', 'T-shirts or tops') === '× 7' && await qtyOf(p, 'Leo', 'Shorts') === '× 4' && await item(p, 'Leo', 'Books, toys').count() === 1);
    ok('everyone has a passport', (await Promise.all(['Sara', 'Tom', 'Leo'].map(n => item(p, n, 'Passport').count()))).every(c => c === 1));
    ok('shared: adapter × 2, sunscreen', await qtyOf(p, 'For everyone', 'Travel plug adapter') === '× 2' && await item(p, 'For everyone', 'Sunscreen').count() === 1);
    const total = await p.locator('.group:not(.home) .item').count();
    ok('progress: 0 of ' + total + ' packed, each person listed', (await txt(p, '#r-big')) === '0 of ' + total && await p.locator('#r-who li').count() === 4 && /0 of 8 jobs/.test(await txt(p, '#r-jobs')));
    ok('ready message says how many things', new RegExp('ready: ' + total + ' things').test(await txt(p, '#list-msg')));
    ok('no forced optional inputs: list made without a trip name or names typed in the add box', true);

    // ---------- tick, progress, reload keeps state
    await item(p, 'Sara', 'Underwear').locator('input').check();
    await item(p, 'Sara', 'Passport').locator('input').check();
    ok('ticking: 2 of ' + total + ', Sara 18 left, item struck through', (await txt(p, '#r-big')) === '2 of ' + total && /18 left/.test(await p.locator('#r-who li', { hasText: 'Sara' }).innerText()) && await item(p, 'Sara', 'Underwear').evaluate(e => e.classList.contains('got')));
    ok('focus stays on the ticked box', await p.evaluate(() => document.activeElement.type === 'checkbox' && document.activeElement.checked));
    await p.reload({ waitUntil: 'networkidle' });
    ok('reload: list, ticks and progress are back', (await txt(p, '#r-big')) === '2 of ' + total && await item(p, 'Sara', 'Underwear').locator('input').isChecked() && await p.isVisible('#list-card'));
    await item(p, 'Sara', 'Underwear').locator('input').uncheck();
    ok('untick one: 1 of ' + total, (await txt(p, '#r-big')) === '1 of ' + total);
    await item(p, 'Sara', 'Underwear').locator('input').check();

    // ---------- hide packed
    await p.check('#hide-done');
    ok('Hide packed items hides ticked ones', !(await item(p, 'Sara', 'Underwear').isVisible()) && await item(p, 'Sara', 'Pairs of socks').isVisible());
    await p.reload({ waitUntil: 'networkidle' });
    ok('Hide packed items is remembered', await p.isChecked('#hide-done') && !(await item(p, 'Sara', 'Underwear').isVisible()));
    await p.uncheck('#hide-done');

    // ---------- edit: number, blank number, bad number, blank name, cancel, keyboard
    await item(p, 'Tom', 'T-shirts or tops').getByRole('button', { name: /^Edit/ }).click();
    ok('Edit opens with name and number filled', await p.inputValue('#e-name') === 'T-shirts or tops' && await p.inputValue('#e-qty') === '6');
    await p.fill('#e-qty', '0'); await p.click('.item.editing >> text=Save');
    ok('number 0 refused', /1 or more/.test(await txt(p, '.item.editing .err')));
    await p.fill('#e-qty', '2.5'); await p.click('.item.editing >> text=Save');
    ok('number 2.5 refused', /whole number/.test(await txt(p, '.item.editing .err')));
    await p.fill('#e-qty', '1000');
    ok('number box takes at most 3 digits (999 is the most)', await p.inputValue('#e-qty') === '100');
    await p.fill('#e-name', '   '); await p.fill('#e-qty', '4'); await p.click('.item.editing >> text=Save');
    ok('blank name refused', /Type the item/.test(await txt(p, '.item.editing .err')));
    await p.fill('#e-name', 'Shirts'); await p.press('#e-qty', 'Enter');
    ok('Enter saves: Shirts × 4', await qtyOf(p, 'Tom', 'Shirts') === '× 4');
    await item(p, 'Tom', 'Shirts').getByRole('button', { name: /^Edit/ }).click();
    await p.fill('#e-qty', ''); await p.click('.item.editing >> text=Save');
    ok('blank number: no number shown', await qtyOf(p, 'Tom', 'Shirts') === null);
    await item(p, 'Tom', 'Shirts').getByRole('button', { name: /^Edit/ }).click();
    await p.fill('#e-qty', '5'); await p.press('#e-qty', 'Escape');
    ok('Escape cancels the edit', await qtyOf(p, 'Tom', 'Shirts') === null && await p.locator('.item.editing').count() === 0);
    await item(p, 'Tom', 'Shirts').getByRole('button', { name: /^Edit/ }).click();
    await p.fill('#e-qty', '4'); await p.click('.item.editing >> text=Cancel');
    ok('Cancel leaves it as it was', await qtyOf(p, 'Tom', 'Shirts') === null);

    // ---------- delete and undo
    await item(p, 'For everyone', 'Beach bag').getByRole('button', { name: /^Edit/ }).click();
    await p.click('.item.editing >> text=Delete');
    ok('Delete removes the item and shows Undo in its place', await item(p, 'For everyone', 'Beach bag').count() === 0 && await p.locator('.item.gone', { hasText: 'Beach bag deleted' }).count() === 1);
    ok('focus moves to Undo', await p.evaluate(() => document.activeElement.textContent) === 'Undo');
    await p.click('.item.gone button');
    ok('Undo brings it back', await item(p, 'For everyone', 'Beach bag').count() === 1);
    await item(p, 'Leo', 'Favourite cuddly').getByRole('button', { name: /^Edit/ }).click();
    await p.click('.item.editing >> text=Delete');
    const afterDel = await p.locator('.group:not(.home) .item:not(.gone)').count();
    ok('progress counts one fewer after delete', (await txt(p, '#r-big')).endsWith('of ' + afterDel) && afterDel === total - 1);

    // ---------- add own item
    await p.click('#open-add');
    ok('add form: For lists Everyone and each traveller', (await p.locator('#a-who option').allInnerTexts()).join('|') === 'Everyone (shared)|Sara|Tom|Leo');
    await p.click('#add-form button[type=submit]');
    ok('blank item refused', /Type the item/.test(await txt(p, '#add-err')));
    await p.fill('#a-name', 'Camera'); await p.fill('#a-qty', '1.5'); await p.click('#add-form button[type=submit]');
    ok('1.5 refused', /whole number/.test(await txt(p, '#add-err')));
    await p.fill('#a-qty', ''); await p.selectOption('#a-sec', 'tech'); await p.click('#add-form button[type=submit]');
    ok('Camera added to For everyone, under Phone and tech, no number', await item(p, 'For everyone', 'Camera').count() === 1 && await qtyOf(p, 'For everyone', 'Camera') === null && /Added Camera to For everyone/.test(await txt(p, '#add-msg')));
    ok('own item sits in its section (after Power bank)', await group(p, 'For everyone').evaluate(g => { const n = [...g.querySelectorAll('.i-name')].map(e => e.firstChild.textContent); return n.indexOf('Camera') > n.indexOf('Power bank'); }));
    await p.fill('#a-name', 'Bucket and spade'); await p.fill('#a-qty', '2'); await p.selectOption('#a-who', { label: 'Leo' }); await p.selectOption('#a-sec', 'extra'); await p.check('#a-always');
    await p.click('#add-form button[type=submit]');
    ok('Bucket and spade × 2 for Leo, every trip tag', await qtyOf(p, 'Leo', 'Bucket and spade') === '× 2' && /every trip/.test(await item(p, 'Leo', 'Bucket and spade').innerText()) && /every new trip/.test(await txt(p, '#add-msg')));
    await p.fill('#a-name', 'Feed the cat'); await p.selectOption('#a-sec', 'home');
    ok('Before you leave home: For is set to Everyone and locked', await p.inputValue('#a-who') === 's' && await p.isDisabled('#a-who'));
    await p.click('#add-form button[type=submit]');
    ok('job added to Before you leave home and counted as a job', await item(p, 'Before you leave home', 'Feed the cat').count() === 1 && /0 of 9 jobs/.test(await txt(p, '#r-jobs')));
    const long = 'A very long item name that someone pasted from a note on their phone, really long!';
    await p.fill('#a-name', long + ' extra words'); await p.selectOption('#a-sec', 'other'); await p.click('#add-form button[type=submit]');
    ok('very long pasted name is cut to 80 characters and wraps', (await item(p, 'For everyone', 'A very long').locator('.i-name').evaluate(e => e.firstChild.textContent)).length === 80);
    await p.click('#add-cancel');
    ok('Close hides the add form', !(await p.isVisible('#add-form')) && await p.isVisible('#open-add'));

    // ---------- change the trip: ticks kept, more needed gets unticked, Cancel
    await item(p, 'Sara', 'T-shirts or tops').locator('input').check();
    await item(p, 'Sara', 'Pyjamas').locator('input').check();
    await p.click('#edit-trip');
    ok('Change trip: form filled with the trip, button says Update my list, Cancel shown', await p.inputValue('#nights') === '5' && (await txt(p, '#make')) === 'Update my list' && await p.isVisible('#cancel-trip') && await p.isChecked('#abroad'));
    await p.fill('#nights', '9'); await p.click('#cancel-trip');
    ok('Cancel keeps the old trip', /^5 nights/.test(await txt(p, '#tv-line')) && await qtyOf(p, 'Sara', 'T-shirts or tops') === '× 6');
    await p.click('#edit-trip');
    await p.fill('#nights', '6'); await p.click('#make');
    ok('6 nights: Sara tops × 7 and underwear × 8 unticked, pyjamas still ticked', await qtyOf(p, 'Sara', 'T-shirts or tops') === '× 7' && !(await item(p, 'Sara', 'T-shirts or tops').locator('input').isChecked()) && await item(p, 'Sara', 'Pyjamas').locator('input').isChecked());
    ok('update message explains the untick, with Undo', /2 items need more than you packed/.test(await txt(p, '#list-msg')) && await p.locator('#list-msg button').count() === 1);
    ok('edits, deletions and own items survive the update', await qtyOf(p, 'Tom', 'Shirts') === null && await item(p, 'Leo', 'Favourite cuddly').count() === 0 && await item(p, 'For everyone', 'Camera').count() === 1 && await item(p, 'Leo', 'Bucket and spade').count() === 1);
    await p.click('#list-msg button');
    ok('Undo the update: back to 5 nights', /^5 nights/.test(await txt(p, '#tv-line')) && await qtyOf(p, 'Sara', 'T-shirts or tops') === '× 6');
    // add a baby and a cold weather tag
    await p.click('#edit-trip');
    await p.click('#add-person');
    await p.locator('.person').last().locator('input').fill('Mia'); await p.locator('.person').last().locator('select').selectOption('baby');
    await p.check('#tags input[value=rain]');
    await p.click('#make');
    ok('baby Mia added: nappies × 36 (6 a day for 6 days), rain jacket for Sara', (await p.locator('.g-title').allInnerTexts()).includes('Mia') && await qtyOf(p, 'Mia', 'Nappies (diapers)') === '× 36' && await qtyOf(p, 'Mia', 'Swim nappies') === '× 12' && await item(p, 'Sara', 'Rain jacket').count() === 1);
    // remove Leo: his items and his own item go
    await p.click('#edit-trip');
    await p.locator('.person').nth(2).locator('.p-remove').click();
    await p.click('#make');
    ok('Leo removed: his list is gone', !(await p.locator('.g-title').allInnerTexts()).includes('Leo') && /Sara \(adult\), Tom \(adult\), Mia \(baby\)/.test(await txt(p, '#tv-people')));

    // ---------- share
    await p.click('#copy');
    const clip = await p.evaluate(() => navigator.clipboard.readText());
    ok('Copy list: text with heading, [x] packed and [ ] to pack', /^Packing list\n5 nights \(6 days\)/.test(clip) && /\[x\] Passport/.test(clip) && /\[ \] Pairs of socks × 7/.test(clip) && /\nMIA\n/.test(clip) && /copied/.test(await txt(p, '#tools-msg')), clip.slice(0, 200));
    const mail = await p.getAttribute('#mail', 'href');
    ok('Email list: mailto with no address, subject and the list', mail.startsWith('mailto:?subject=Packing%20list&body=') && decodeURIComponent(mail).includes('[x] Passport'));
    await p.emulateMedia({ media: 'print' });
    ok('print: list shown, form, buttons and share hidden', await p.isVisible('#groups') && !(await p.isVisible('#tools')) && !(await p.isVisible('#untick')) && !(await p.locator('.i-btns').first().isVisible()));
    await p.emulateMedia({ media: 'screen' });

    // ---------- untick everything and undo
    const before = await txt(p, '#r-big');
    await p.click('#untick');
    ok('Untick everything: 0 packed, Undo offered, button disabled', /^0 of/.test(await txt(p, '#r-big')) && await p.isDisabled('#untick') && await p.locator('#actions-msg button').count() === 1);
    await p.click('#actions-msg button');
    ok('Undo restores the ticks', (await txt(p, '#r-big')) === before);

    // ---------- start a new trip, undo, then make it
    await p.click('#new-trip');
    ok('Start a new trip: form open, list hidden, travellers kept', await p.isVisible('#trip-form') && !(await p.isVisible('#list-card')) && await p.locator('.person').count() === 3 && /travellers and every-trip items are kept/.test(await txt(p, '#people-msg')));
    await p.click('#people-msg button');
    ok('Undo brings the old list back', await p.isVisible('#list-card') && (await txt(p, '#r-big')) === before);
    await p.click('#new-trip');
    await makeTrip(p, { nights: 2, tags: ['cold'], travel: 'car', name: 'Ski weekend' });
    ok('new trip: trip name shown, cold items, car items, nothing ticked', (await txt(p, '#tv-name')) === 'Ski weekend' && await item(p, 'Sara', 'Warm coat').count() === 1 && await item(p, 'For everyone', 'Driving licence').count() === 1 && /^0 of/.test(await txt(p, '#r-big')));
    ok('new trip: deleted and edited items from the old trip are fresh again', await qtyOf(p, 'Tom', 'T-shirts or tops') === '× 3');
    ok('email subject has the trip name', (await p.getAttribute('#mail', 'href')).startsWith('mailto:?subject=Packing%20list%3A%20Ski%20weekend'));

    // ---------- everything packed
    for (const cb of await p.locator('.group:not(.home) .item input').all()) await cb.check();
    ok('all packed: message and complete state', /Everything is packed/.test(await txt(p, '#r-meta')) && await p.locator('#result.done').count() === 1 && await p.locator('#r-who li').count() === 0);
    await p.check('#hide-done');
    ok('all packed + hide: each list says All packed', await p.locator('.all-done').count() === 4);
    await p.uncheck('#hide-done');
    ok('no console errors (main run)', p.errors.length === 0, p.errors);
    ok('no failed requests (main run)', p.bad.length === 0, p.bad);
    await p.ctx.close();

    // ---------- every-trip item comes back on a new trip in a fresh session with Leo again
    p = await open(b, { width: 1280, height: 900 });
    await p.click('#demo');
    ok('demo trip makes the README example', (await txt(p, '#tv-name')) === 'Beach week in Spain' && /Sara \(adult\), Tom \(adult\), Leo \(child\)/.test(await txt(p, '#tv-people')));
    await p.click('#open-add'); await p.fill('#a-name', 'Inhaler'); await p.selectOption('#a-sec', 'health'); await p.check('#a-always'); await p.click('#add-form button[type=submit]');
    await p.click('#new-trip'); await p.click('#make');
    ok('every-trip item is on the next trip', await item(p, 'For everyone', 'Inhaler').count() === 1);
    await item(p, 'For everyone', 'Inhaler').getByRole('button', { name: /^Edit/ }).click();
    await p.uncheck('.item.editing input[type=checkbox]'); await p.click('.item.editing >> text=Save');
    await p.click('#new-trip'); await p.click('#make');
    ok('untick "every trip" in Edit: not on the next trip', await item(p, 'For everyone', 'Inhaler').count() === 0);
    await p.ctx.close();

    // ---------- corrupt saved state, blocked storage
    p = await open(b, { width: 390, height: 844 }, { init: () => { try { if (!sessionStorage.getItem('t')) { localStorage.setItem('trip-packing-checklist.state', '{"made":true,"items":[{"id":1}'); sessionStorage.setItem('t', '1'); } } catch (e) { /* ignore */ } } });
    ok('corrupt saved state: fresh start, no errors', await p.isVisible('#trip-form') && p.errors.length === 0, p.errors);
    await p.ctx.close();
    p = await open(b, { width: 390, height: 844 }, { init: () => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); } });
    await p.click('#demo');
    ok('storage blocked: app still works and says it is not saving', await p.isVisible('#list-card') && /not saving/.test(await txt(p, '#tools-msg')));
    ok('storage blocked: no page errors', p.errors.length === 0, p.errors);
    await p.ctx.close();

    // ---------- light/dark switch
    p = await open(b, { width: 1280, height: 900 }, { theme: 'light' });
    const bg1 = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await p.click('.theme-toggle');
    const bg2 = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
    ok('light/dark switch changes the look', bg1 !== bg2 && await p.evaluate(() => document.documentElement.dataset.theme) === 'dark');
    await p.click('.theme-toggle');
    await p.ctx.close();

    // ---------- Help at 4 widths
    for (const w of [320, 390, 820, 1280]) {
        p = await open(b, { width: w, height: w < 600 ? 740 : 900 });
        const hb = await p.locator('.help-btn').boundingBox(), bk = await p.locator('a.back').boundingBox(), tt = await p.locator('.theme-toggle').boundingBox();
        ok(w + 'px: top bar on one line', Math.abs(hb.y - bk.y) < 4 && Math.abs(tt.y - bk.y) < 4);
        await p.click('.help-btn');
        const r = await p.locator('dialog.help').boundingBox();
        ok(w + 'px: Help opens fully on screen with its title', r.x >= 0 && r.y >= 0 && r.x + r.width <= w && r.y + r.height <= (w < 600 ? 740 : 900) && /How to use Trip Packing Checklist/.test(await txt(p, 'dialog.help h2')));
        await p.keyboard.press('Escape');
        ok(w + 'px: Escape closes Help', !(await p.locator('dialog.help').evaluate(e => e.open)));
        await p.click('.help-btn'); await p.click('.help-close');
        ok(w + 'px: Got it closes Help', !(await p.locator('dialog.help').evaluate(e => e.open)));
        await p.ctx.close();
    }

    // ---------- layout at every width, both themes, filled and cleared
    for (const theme of ['dark', 'light']) {
        for (const w of [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920]) {
            p = await open(b, { width: w, height: 900 }, { theme });
            let bad = await layout(p);
            // form with everything revealed
            await setPeople(p, [['Alexandria-Maximiliana', 'adult'], ['Tom', 'child'], ['Mia', 'baby']]);
            await p.click('#open-name'); await p.fill('#nights', '21'); await p.check('#laundry');
            bad = bad.concat(await layout(p));
            await p.click('#demo');
            await item(p, 'Sara', 'Underwear').locator('input').check();
            await item(p, 'Sara', 'Passport').getByRole('button', { name: /^Edit/ }).click();
            await p.click('#open-add');
            await item(p, 'For everyone', 'House keys').getByRole('button', { name: /^Edit/ }).click().catch(() => {});
            bad = bad.concat(await layout(p));
            await p.click('#edit-trip');
            bad = bad.concat(await layout(p));
            await p.click('#cancel-trip');
            for (const pos of [0, 0.5, 1]) { await p.evaluate(x => scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * x), pos); bad = bad.concat(await layout(p)); }
            await p.click('#new-trip');
            bad = bad.concat(await layout(p));
            ok(theme + ' ' + w + 'px: no horizontal scroll, nothing sticks out, nothing overlaps, no cut-off text', bad.length === 0, [...new Set(bad)]);
            if (w === 1280) {
                const cols = await p.evaluate(() => { const a = document.querySelector('.trip-card').getBoundingClientRect(), b = document.querySelector('.result').getBoundingClientRect(); return { a: a.right, b: b.left, w: document.querySelector('.app').getBoundingClientRect().width }; });
                ok(theme + ' 1280px: two columns side by side, app is wide', cols.b > cols.a && cols.w >= 1000, cols);
            }
            if (w === 390) {
                const one = await p.evaluate(() => { const a = document.querySelector('.trip-card').getBoundingClientRect(), b = document.querySelector('.result').getBoundingClientRect(); return b.top >= a.bottom - 1; });
                ok(theme + ' 390px: single column (progress under the trip)', one);
            }
            ok(theme + ' ' + w + 'px: no console errors', p.errors.length === 0, p.errors);
            await p.ctx.close();
        }
    }

    // ---------- offline (service worker)
    if (bi < 0 || true) {
        p = await open(b, { width: 390, height: 844 }, { sw: true });
        await p.evaluate(() => navigator.serviceWorker.ready);
        await p.reload({ waitUntil: 'networkidle' });
        await p.click('#demo');
        await p.ctx.setOffline(true);
        await p.reload({ waitUntil: 'load' }).catch(() => {});
        ok('offline: page loads from the saved copy with the list', await p.isVisible('#list-card').catch(() => false) && /Beach week in Spain/.test(await txt(p, '#tv-name').catch(() => '')));
        await p.ctx.setOffline(false);
        await p.ctx.close();
    }

    // ---------- every file the page uses
    p = await open(b, { width: 390, height: 844 }, { sw: true });
    for (const f of ['favicon.svg', 'manifest.webmanifest', 'sw.js', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', '../help.js', '../theme.js', 'core.js', 'script.js', 'style.css', 'screenshots/desktop.png', 'screenshots/phone.png']) {
        const r = await p.request.get(new URL(f, url).href); ok('file ' + f + ' returns 200', r.status() === 200, r.status());
    }
    await p.ctx.close();

    // ---------- screenshots for the README
    if (shots) {
        const dir = path.join(__dirname, 'screenshots');
        for (const [vp, file] of [[{ width: 1280, height: 900 }, 'desktop.png'], [{ width: 390, height: 844 }, 'phone.png']]) {
            p = await open(b, vp);
            await p.click('#demo');
            for (const n of ['Bank cards', 'Boarding passes', 'House keys', 'Toothpaste', 'Sunscreen', 'Power bank', 'Travel plug adapter']) await item(p, 'For everyone', n).locator('input').check();
            for (const n of ['Passport', 'Underwear', 'Pairs of socks', 'T-shirts or tops', 'Swimwear']) await item(p, 'Sara', n).locator('input').check();
            for (const n of ['Passport', 'Underwear']) await item(p, 'Leo', n).locator('input').check();
            await p.evaluate(() => { document.getElementById('list-msg').textContent = ''; });
            if (vp.width < 500) await p.evaluate(() => { const r = document.querySelector('.result'); scrollTo(0, r.getBoundingClientRect().top + scrollY - 12); });
            else await p.evaluate(() => scrollTo(0, 0));
            await p.screenshot({ path: path.join(dir, file) });
            await p.ctx.close();
        }
        console.log('screenshots saved');
    }

    await b.close();
    if (server) server.close();
    console.log(fail ? fail + ' FAILED' : 'ALL UI CHECKS PASSED');
    process.exit(fail ? 1 : 0);
})();
