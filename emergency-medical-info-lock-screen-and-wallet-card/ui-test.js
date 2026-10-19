// Page test for Emergency Medical Info Lock Screen and Wallet Card. Run from the repo root or this folder:
//   node ui-test.js                       (serves the repo locally)
//   node ui-test.js --base https://umar8092.github.io/apps   (tests the live site)
// "Today" is fixed to Mon 19 Oct 2026. Needs Playwright.
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const pw = require('playwright');
const SLUG = 'emergency-medical-info-lock-screen-and-wallet-card';
const ROOT = path.resolve(__dirname, '..');
const bi = process.argv.indexOf('--base'), LIVE = bi > 0 ? process.argv[bi + 1].replace(/\/$/, '') : null;
let pass = 0; const fails = [];
const ok = (cond, what) => { if (cond) pass++; else fails.push(what); };
const eq = (got, want, what) => ok(JSON.stringify(got) === JSON.stringify(want), what + '\n     got:  ' + JSON.stringify(got) + '\n     want: ' + JSON.stringify(want));

function serve() {
    const types = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml', png: 'image/png', webmanifest: 'application/manifest+json' };
    return new Promise(res => { const s = http.createServer((q, r) => {
        let p = decodeURIComponent(q.url.split('?')[0].replace(/^\/apps/, '')); if (p.endsWith('/')) p += 'index.html';
        const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
        r.writeHead(200, { 'content-type': types[f.split('.').pop()] || 'application/octet-stream' }); r.end(fs.readFileSync(f));
    }).listen(0, () => res({ s, base: 'http://localhost:' + s.address().port + '/apps' })); });
}

const FATIMA = ['IN CASE OF EMERGENCY', '', 'Name: Fatima Khan', 'Born: 3 Mar 1958 (age 68)', 'Blood group: O+',
    'Allergies:', '- Penicillin: life-threatening (anaphylaxis)', '- Peanuts: moderate',
    'Conditions:', '- Type 2 diabetes', '- Atrial fibrillation',
    'Medicines:', '- Warfarin (blood thinner), 5 mg every evening', '- Metformin, 500 mg twice a day',
    'Emergency contacts:', '- Bilal Khan (Son): +44 7700 900123', '- Sara Ahmed (Neighbour): +44 7700 900456', '', 'Updated 19 Oct 2026'].join('\n');

async function fill(p) {
    await p.fill('#f-name', 'Fatima Khan'); await p.fill('#f-dob', '1958-03-03'); await p.selectOption('#f-blood', 'O+');
    await p.click('[data-add=allergies]'); await p.fill('#allergies-0-t', 'Penicillin'); await p.selectOption('#allergies-0-sev', 'life');
    await p.click('[data-add=allergies]'); await p.fill('#allergies-1-t', 'Peanuts'); await p.selectOption('#allergies-1-sev', 'moderate');
    for (const [i, t] of ['Type 2 diabetes', 'Atrial fibrillation'].entries()) { await p.click('[data-add=conditions]'); await p.fill('#conditions-' + i + '-t', t); }
    for (const [i, [t, d]] of [['Warfarin (blood thinner)', '5 mg every evening'], ['Metformin', '500 mg twice a day']].entries()) { await p.click('[data-add=meds]'); await p.fill('#meds-' + i + '-t', t); await p.fill('#meds-' + i + '-dose', d); }
    for (const [i, [n, r, ph]] of [['Bilal Khan', 'Son', '+44 7700 900123'], ['Sara Ahmed', 'Neighbour', '+44 7700 900456']].entries()) { await p.click('[data-add=contacts]'); await p.fill('#contacts-' + i + '-name', n); await p.fill('#contacts-' + i + '-rel', r); await p.fill('#contacts-' + i + '-phone', ph); }
    await settle(p);
}
const settle = p => p.evaluate(() => window.__ice.renderOutputs());
const plain = p => p.textContent('#plain');

async function newPage(browser, base, opts) {
    const ctx = await browser.newContext(Object.assign({ viewport: { width: 1280, height: 900 }, colorScheme: 'dark', acceptDownloads: true }, opts || {}));
    await ctx.route(/goatcounter\.com|gc\.zgo\.at/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
    const p = await ctx.newPage();
    await p.clock.setFixedTime(new Date('2026-10-19T10:00:00'));
    p.errors = []; p.bad = [];
    p.on('pageerror', e => p.errors.push(e.message));
    p.on('console', m => { if (m.type() === 'error') p.errors.push(m.text()); });
    p.on('response', r => { if (r.status() >= 400 && r.url().startsWith(base)) p.bad.push(r.status() + ' ' + r.url()); });
    await p.goto(base + '/' + SLUG + '/', { waitUntil: 'networkidle' });
    return { ctx, p };
}

async function situation(browser, base, width) {
    const tag = '[' + width + 'px] ';
    const { ctx, p } = await newPage(browser, base, { viewport: { width, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
    // first use
    ok(await p.isVisible('#out-empty'), tag + 'first use: says to type a name');
    ok(await p.isHidden('#card-sec') && await p.isHidden('#text-sec'), tag + 'first use: card and text hidden until there is a name');
    ok(await p.isHidden('#w-doctor') && await p.isHidden('#w-notes') && await p.isHidden('#w-lang'), tag + 'optional fields are hidden behind + buttons');
    eq(await p.$$eval('input[required], select[required]', e => e.length), 0, tag + 'nothing is forced');
    eq(await p.textContent('#people'), '(no name yet)', tag + 'first person chip');
    // the situation
    await fill(p);
    eq(await plain(p), FATIMA, tag + 'Fatima: the Medical ID text');
    eq(await p.textContent('#wall-fit'), 'Everything fits on the lock screen.', tag + 'everything fits on the lock screen');
    eq(await p.textContent('#card-fit'), 'Everything fits on the card.', tag + 'everything fits on the card');
    eq(await p.$$eval('#todo li', l => l.length), 0, tag + 'nothing missing');
    eq(await p.evaluate(() => [window.__ice.wall.cv.width, window.__ice.wall.cv.height]), [1179, 2556], tag + 'picture at the iPhone size');
    eq(await p.textContent('#about-who'), 'Fatima Khan', tag + 'heading says whose card');
    ok((await p.getAttribute('#email-text', 'href')).startsWith('mailto:?subject=Emergency%20medical%20information%3A%20Fatima%20Khan&body='), tag + 'email link with no recipient');
    ok(await p.evaluate(() => document.getElementById('card-front').naturalWidth === 1011 && document.getElementById('card-back').naturalWidth === 1011), tag + 'card faces drawn at 300 dpi');
    // the wallpaper is dark at the top and the panel is drawn under the clock area
    const px = await p.evaluate(() => { const c = window.__ice.wall.cv.getContext('2d'); return [Array.from(c.getImageData(10, 10, 1, 1).data), Array.from(c.getImageData(150, 820, 1, 1).data)]; });
    ok(px[0][0] < 40 && px[1][0] > 150 && px[1][1] < 90, tag + 'dark background, red band below the clock ' + JSON.stringify(px));
    // edit a mistake
    await p.fill('#allergies-1-t', 'Peanuts and tree nuts'); await settle(p);
    ok((await plain(p)).includes('- Peanuts and tree nuts: moderate'), tag + 'editing an allergy updates the text');
    // remove a row, then undo
    await p.click('#rows-meds li:nth-child(2) .remove'); await settle(p);
    ok(!(await plain(p)).includes('Metformin'), tag + 'removed medicine is gone');
    ok((await p.textContent('#msg-meds')).includes('"Metformin" removed.'), tag + 'says what was removed');
    await p.click('#msg-meds .undo'); await settle(p);
    ok((await plain(p)).includes('Metformin, 500 mg twice a day'), tag + 'Undo brings the medicine back');
    // copy
    await p.click('#copy-text');
    ok((await p.evaluate(() => navigator.clipboard.readText())).startsWith('IN CASE OF EMERGENCY\n\nName: Fatima Khan'), tag + 'Copy the text');
    // downloads
    const [d1] = await Promise.all([p.waitForEvent('download'), p.click('#save-wall')]);
    eq(d1.suggestedFilename(), 'emergency-lock-screen-fatima-khan.png', tag + 'picture file name');
    const f1 = path.join(os.tmpdir(), 'ice-wall.png'); await d1.saveAs(f1);
    const head = fs.readFileSync(f1); eq([head.readUInt32BE(16), head.readUInt32BE(20)], [1179, 2556], tag + 'saved picture is 1179 × 2556');
    const [d2] = await Promise.all([p.waitForEvent('download'), p.click('#save-card')]);
    eq(d2.suggestedFilename(), 'emergency-wallet-card-fatima-khan.png', tag + 'card file name');
    // print
    await p.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed++; }; });
    await p.click('#print-card'); await p.waitForTimeout(150);
    eq(await p.evaluate(() => [window.__printed, document.querySelectorAll('#print-area .print-card img').length]), [1, 2], tag + 'Print puts front and back on the sheet');
    await p.emulateMedia({ media: 'print' });
    const pr = await p.evaluate(() => { const r = document.querySelector('.print-card img').getBoundingClientRect(); return [Math.round(r.width / 96 * 25.4), Math.round(r.height / 96 * 25.4), getComputedStyle(document.getElementById('app')).display]; });
    eq(pr, [86, 54, 'none'], tag + 'printed card half is 85.6 × 54 mm and the page itself is not printed');
    await p.emulateMedia({ media: 'screen' });

    // phone size, custom size, look, language
    await p.selectOption('#f-size', 'iphone-se'); await settle(p);
    eq(await p.evaluate(() => [window.__ice.wall.cv.width, window.__ice.wall.cv.height]), [750, 1334], tag + 'iPhone SE size');
    await p.selectOption('#f-size', 'custom');
    ok(await p.isVisible('#w-custom'), tag + 'custom size fields show');
    await p.fill('#f-w', '99'); ok((await p.textContent('#size-err')).includes('between 320 and 5000'), tag + 'too small a width is refused');
    await p.fill('#f-w', '1000'); await p.fill('#f-h', '2000'); await settle(p);
    eq(await p.evaluate(() => [window.__ice.wall.cv.width, window.__ice.wall.cv.height]), [1000, 2000], tag + 'custom size used');
    eq(await p.textContent('#size-err'), '', tag + 'error cleared');
    await p.check('input[name=look][value=light]'); await settle(p);
    ok(await p.evaluate(() => window.__ice.wall.cv.getContext('2d').getImageData(10, 10, 1, 1).data[0] > 220), tag + 'light look');
    await p.click('#o-lang'); await p.selectOption('#f-lang', 'es'); await settle(p);
    ok((await plain(p)).includes('Allergies · Alergias:') && (await plain(p)).startsWith('IN CASE OF EMERGENCY · EN CASO DE EMERGENCIA'), tag + 'Spanish labels');
    await p.selectOption('#f-lang', 'ar'); await settle(p);
    ok((await plain(p)).includes('الحساسية'), tag + 'Arabic labels');
    await p.selectOption('#f-lang', ''); await p.selectOption('#f-size', 'iphone'); await p.check('input[name=look][value=dark]'); await settle(p);

    // no known allergies: only shown when no allergy is typed
    ok(await p.isHidden('#no-al-wrap'), tag + 'No known allergies hidden while allergies are listed');
    // a second person with their own settings
    await p.click('#add-person');
    eq(await p.inputValue('#f-name'), '', tag + 'new person starts blank');
    ok(await p.isVisible('#no-al-wrap'), tag + 'No known allergies shown for a person with none');
    await p.fill('#f-name', 'Ali\nKhan'); await p.selectOption('#f-size', 'android'); await settle(p);
    eq(await p.$$eval('.chip', c => c.map(x => x.textContent)), ['Fatima Khan', 'Ali Khan'], tag + 'pasted line break becomes a space; both chips');
    eq(await p.$$eval('#todo li', l => l.length), 2, tag + 'Ali: says to add someone to call and allergies');
    await p.check('#f-noal'); await settle(p);
    ok((await plain(p)).includes('Allergies: None known'), tag + 'None known only when ticked');
    // checks on the second person
    await p.fill('#f-dob', '2030-01-01');
    eq(await p.textContent('#dob-err'), 'The date of birth is after today.', tag + 'future date of birth');
    await settle(p); ok(!(await plain(p)).includes('Born'), tag + 'wrong date left off');
    await p.fill('#f-dob', '2015-06-01'); await settle(p);
    ok((await plain(p)).includes('Born: 1 Jun 2015 (age 11)'), tag + 'child age');
    await p.click('[data-add=contacts]');
    ok(await p.evaluate(() => document.activeElement && document.activeElement.id === 'contacts-0-name'), tag + 'new row: cursor in its first field');
    await p.fill('#contacts-0-name', 'Mum'); await p.fill('#contacts-0-phone', '123');
    eq(await p.textContent('#rows-contacts .err'), 'This number looks too short.', tag + 'short number warned');
    await p.fill('#contacts-0-phone', '0300 1234567');
    ok((await p.textContent('#cc-hint')).includes('country code'), tag + 'country code tip');
    await p.fill('#contacts-0-phone', '+92 300 1234567');
    eq(await p.textContent('#cc-hint'), '', tag + 'tip goes with a country code');
    await p.click('#o-doctor'); await p.fill('#f-docname', 'Dr Ahmed'); await p.click('#o-notes'); await p.fill('#f-notes', 'Asthma inhaler in school bag'); await settle(p);
    ok((await plain(p)).includes('Doctor: Dr Ahmed') && (await plain(p)).includes('Notes: Asthma inhaler in school bag'), tag + 'doctor and notes');
    // long list: tells what was left off
    for (let i = 0; i < 18; i++) { await p.click('[data-add=meds]'); await p.fill('#meds-' + i + '-t', 'Medicine with a long name number ' + (i + 1)); await p.fill('#meds-' + i + '-dose', '250 mg three times a day after food'); }
    await settle(p);
    const wf = await p.textContent('#wall-fit');
    ok(/^Left off the lock screen because it did not fit: Notes; Doctor; Medicines: Medicine with a long name number 18/.test(wf), tag + 'long list: says what is left off: ' + wf);
    ok(await p.evaluate(() => window.__ice.wall.lay.fits), tag + 'long list still fits after trimming');
    ok((await p.textContent('#card-fit')).startsWith('Left off the back of the card'), tag + 'card back says what is left off');
    // switching back keeps each person's own settings
    await p.click('.chip >> text=Fatima Khan'); await settle(p);
    eq(await p.inputValue('#f-size'), 'iphone', tag + 'Fatima keeps her phone size');
    eq(await plain(p), FATIMA.replace('Peanuts', 'Peanuts and tree nuts'), tag + 'Fatima unchanged');
    // reload: saved
    await p.reload({ waitUntil: 'networkidle' }); await settle(p);
    eq(await p.$$eval('.chip', c => c.map(x => x.textContent)), ['Fatima Khan', 'Ali Khan'], tag + 'reload keeps both people');
    eq(await plain(p), FATIMA.replace('Peanuts', 'Peanuts and tree nuts'), tag + 'reload keeps Fatima');
    // backup and restore
    const [d3] = await Promise.all([p.waitForEvent('download'), p.click('#backup')]);
    const bf = path.join(os.tmpdir(), 'ice-backup.json'); await d3.saveAs(bf);
    eq(d3.suggestedFilename(), 'emergency-medical-info-backup-2026-10-19.json', tag + 'backup file name');
    // delete this person, undo
    await p.click('#del-person');
    eq(await p.$$eval('.chip', c => c.map(x => x.textContent)), ['Ali Khan'], tag + 'Fatima deleted');
    await p.click('#set-msg .undo');
    eq(await p.$$eval('.chip', c => c.length), 2, tag + 'Undo brings Fatima back');
    // delete everything, undo, then restore from the file
    await p.click('#del-all');
    eq(await p.$$eval('.chip', c => c.map(x => x.textContent)), ['(no name yet)'], tag + 'Delete everything');
    ok(await p.isVisible('#out-empty'), tag + 'start over shows the empty state');
    await p.click('#set-msg .undo'); eq(await p.$$eval('.chip', c => c.length), 2, tag + 'Undo after Delete everything');
    await p.click('#del-all');
    await p.setInputFiles('#restore-file', bf); await p.waitForTimeout(200);
    eq(await p.$$eval('.chip', c => c.map(x => x.textContent)), ['Fatima Khan', 'Ali Khan'], tag + 'backup restored');
    const junk = path.join(os.tmpdir(), 'ice-junk.json'); fs.writeFileSync(junk, '{"hello":1}');
    await p.setInputFiles('#restore-file', junk); await p.waitForTimeout(200);
    eq(await p.textContent('#set-msg span'), 'That file is not a backup from this app, so nothing was changed.', tag + 'wrong file refused');
    eq(await p.$$eval('.chip', c => c.length), 2, tag + 'wrong file changes nothing');
    eq(p.errors, [], tag + 'no console errors');
    eq(p.bad, [], tag + 'no failed requests');
    await ctx.close();
}

async function edgeCases(browser, base) {
    // corrupt saved state
    let { ctx, p } = await newPage(browser, base);
    await p.evaluate(s => localStorage.setItem(s + '.state', '{bad json'), SLUG);
    await p.reload({ waitUntil: 'networkidle' });
    eq(await p.textContent('#set-msg span'), 'The saved cards could not be read, so the app started fresh.', 'corrupt saved state: fresh start with a message');
    eq(p.errors, [], 'corrupt state: no errors');
    // wrong but parseable data
    await p.evaluate(s => localStorage.setItem(s + '.state', JSON.stringify({ people: [{ name: 'Zed', allergies: 'nope', out: { size: 'tv' } }] })), SLUG);
    await p.reload({ waitUntil: 'networkidle' });
    eq(await p.inputValue('#f-name'), 'Zed', 'odd saved data is cleaned, not lost');
    eq(await p.inputValue('#f-size'), 'iphone', 'unknown size falls back');
    // keyboard only: Tab to "+ Add an allergy" and press Enter
    await p.focus('#f-blood'); await p.keyboard.press('Tab'); await p.keyboard.press('Enter');
    ok(await p.evaluate(() => document.activeElement.id === 'allergies-0-t'), 'keyboard: Enter on + Add an allergy puts the cursor in the new row');
    // empty name again hides the outputs
    await p.fill('#f-name', '   '); await settle(p);
    ok(await p.isVisible('#out-empty'), 'a name of spaces counts as no name');
    // very long name wraps, nothing leaves the page
    await p.fill('#f-name', 'Wolfeschlegelsteinhausenbergerdorffwelchevoralternwarengewissenhaftschaferswessen Smith'); await settle(p);
    ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'very long name: no sideways scroll');
    ok(await p.evaluate(() => window.__ice.wall.lay.lines.every(l => l.role === 'band' || l.x + 0 >= 0)), 'very long name drawn');
    await ctx.close();
    // storage blocked
    ({ ctx, p } = await newPage(browser, base));
    await ctx.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
    await p.reload({ waitUntil: 'networkidle' });
    ok(await p.isVisible('#storage-warn'), 'storage blocked: warning shown');
    await p.fill('#f-name', 'Test'); await settle(p);
    ok(await p.isVisible('#out-ready'), 'storage blocked: still works');
    await ctx.close();
}

async function layout(browser, base) {
    for (const scheme of ['dark', 'light']) {
        const { ctx, p } = await newPage(browser, base, { colorScheme: scheme });
        await fill(p);
        await p.click('#o-doctor'); await p.click('#o-notes'); await p.click('#o-lang'); await p.selectOption('#f-size', 'custom');
        await p.fill('#f-docname', 'Dr Ahmed, Riverside Surgery'); await p.fill('#f-docphone', '+44 20 7946 0000'); await p.fill('#f-notes', 'Organ donor');
        await settle(p);
        for (const w of [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920]) {
            const tag = '[' + scheme + ' ' + w + '] ';
            await p.setViewportSize({ width: w, height: 900 }); await p.waitForTimeout(60);
            ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), tag + 'no sideways scroll');
            if (w <= 390) {
                const o = await p.evaluate(() => { const k = [...document.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=file]), select, button, textarea')].filter(e => e.getBoundingClientRect().width > 0); const bad = [];
                    for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { const a = k[i].getBoundingClientRect(), b = k[j].getBoundingClientRect(); if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2) bad.push(k[i].id + '/' + k[j].id); } return bad; });
                eq(o, [], tag + 'no controls overlap');
                // every placeholder fits inside its box
                const cut = await p.evaluate(() => { const c = document.createElement('canvas').getContext('2d'); return [...document.querySelectorAll('input[placeholder], textarea[placeholder]')].filter(e => e.offsetWidth).filter(e => { const cs = getComputedStyle(e); c.font = cs.fontSize + ' ' + cs.fontFamily; return c.measureText(e.placeholder).width > e.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) + 1; }).map(e => e.id); });
                eq(cut, [], tag + 'placeholders fit');
                // select text fits (no cut-off option)
                const sc = await p.evaluate(() => { const c = document.createElement('canvas').getContext('2d'); return [...document.querySelectorAll('select')].filter(e => e.offsetWidth).filter(e => { const cs = getComputedStyle(e); c.font = cs.fontSize + ' ' + cs.fontFamily; return c.measureText(e.options[e.selectedIndex].text).width > e.clientWidth - parseFloat(cs.paddingLeft) - 24; }).map(e => e.id); });
                eq(sc, [], tag + 'selected option text fits');
            }
            if (w >= 900) {
                for (const pos of [0, 0.5, 1]) {
                    await p.evaluate(x => scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * x), pos);
                    const o = await p.evaluate(() => { const k = [...document.querySelectorAll('main > *')].filter(e => e.getBoundingClientRect().height > 4 && getComputedStyle(e).display !== 'none'); const bad = [];
                        for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { const a = k[i].getBoundingClientRect(), b = k[j].getBoundingClientRect(); if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 4 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 4) bad.push(k[i].className + '/' + k[j].className); } return bad; });
                    eq(o, [], tag + 'no blocks overlap at scroll ' + pos);
                }
                const cols = await p.evaluate(() => [document.querySelector('.col-main').getBoundingClientRect().left, document.querySelector('.col-side').getBoundingClientRect().left]);
                ok(cols[1] > cols[0] + 300, tag + 'two columns on desktop');
            }
            if ([320, 390, 820, 1280].includes(w)) {
                await p.evaluate(() => scrollTo(0, 0));
                await p.click('.help-btn');
                const r = await p.locator('dialog.help').boundingBox();
                ok(r && r.x >= 0 && r.y >= 0 && r.x + r.width <= w + 1 && r.y + r.height <= 901, tag + 'Help fully on screen');
                eq(await p.textContent('dialog.help h2'), 'How to use Emergency Medical Info Lock Screen and Wallet Card', tag + 'Help title');
                await p.keyboard.press('Escape'); ok(!await p.evaluate(() => document.querySelector('dialog.help').open), tag + 'Escape closes Help');
                await p.click('.help-btn'); await p.click('.help-close'); ok(!await p.evaluate(() => document.querySelector('dialog.help').open), tag + 'Got it closes Help');
                const tb = await p.evaluate(() => [...document.querySelectorAll('.topbar > *')].map(e => e.getBoundingClientRect()).map(r => [r.top, r.bottom, r.left, r.right]));
                ok(tb.every((a, i) => tb.every((b, j) => i === j || Math.min(a[3], b[3]) - Math.max(a[2], b[2]) <= 1 || Math.min(a[1], b[1]) - Math.max(a[0], b[0]) <= 1)), tag + 'top bar buttons do not overlap');
                ok(new Set(tb.map(t => Math.round(t[0]))).size === 1, tag + 'top bar on one line');
            }
        }
        // the start-over state at a phone and a desktop width
        await p.click('#del-all');
        for (const w of [320, 1280]) { await p.setViewportSize({ width: w, height: 900 }); ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), '[' + scheme + ' ' + w + '] empty state: no sideways scroll'); }
        // the light/dark switch
        const before = await p.evaluate(() => getComputedStyle(document.body).color);
        await p.click('.theme-toggle');
        ok(before !== await p.evaluate(() => getComputedStyle(document.body).color), '[' + scheme + '] theme switch changes the look');
        eq(p.errors, [], '[' + scheme + '] no console errors');
        await ctx.close();
    }
}

async function offline(browser, base) {
    const { ctx, p } = await newPage(browser, base);
    await p.evaluate(() => navigator.serviceWorker.ready); await p.reload({ waitUntil: 'networkidle' });
    await ctx.setOffline(true);
    await p.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
    ok((await p.textContent('h1')) === 'Emergency Medical Info Lock Screen and Wallet Card', 'works offline after the first visit');
    await p.fill('#f-name', 'Offline Test'); await settle(p);
    ok(await p.isVisible('#out-ready'), 'offline: picture is still made');
    await ctx.close();
}

(async () => {
    let srv, base = LIVE;
    if (!base) { srv = await serve(); base = srv.base; }
    const browser = await pw.chromium.launch();
    try {
        await situation(browser, base, 1280);
        await situation(browser, base, 390);
        await edgeCases(browser, base);
        await layout(browser, base);
        await offline(browser, base);
    } catch (e) { fails.push('test crashed: ' + e.stack); }
    await browser.close(); if (srv) srv.s.close();
    fails.forEach(f => console.log('FAIL ' + f));
    console.log((LIVE ? 'LIVE ' : 'LOCAL ') + pass + ' passed, ' + fails.length + ' failed');
    process.exit(fails.length ? 1 : 0);
})();
