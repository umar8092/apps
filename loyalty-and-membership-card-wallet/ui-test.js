// Drives the real page in headless Chromium. Run from the repo root:
//   node loyalty-and-membership-card-wallet/ui-test.js            (local copy)
//   node loyalty-and-membership-card-wallet/ui-test.js --base https://umar8092.github.io/apps   (live site)
// Needs playwright, @zxing/library and pngjs (set NODE_PATH to where they are installed).
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const { chromium } = require('playwright');
const Z = require('@zxing/library'), { PNG } = require('pngjs');
const SLUG = 'loyalty-and-membership-card-wallet', ROOT = path.join(__dirname, '..');
const bi = process.argv.indexOf('--base'), LIVE = bi > 0 ? process.argv[bi + 1].replace(/\/$/, '') : null;
let pass = 0; const fails = [];
const ok = (c, name) => { if (c) pass++; else { fails.push(name); console.log('FAIL ' + name); } };

function serve() {
    const T = { html: 'text/html', js: 'text/javascript', css: 'text/css', svg: 'image/svg+xml', png: 'image/png', webmanifest: 'application/manifest+json', json: 'application/json' };
    return new Promise(res => { const s = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p);
        if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': T[f.split('.').pop()] || 'application/octet-stream' }); r.end(fs.readFileSync(f)); })
        .listen(0, () => res({ s, base: 'http://localhost:' + s.address().port })); });
}
function decodePng(buf) {
    const png = PNG.sync.read(buf), { width: w, height: h, data } = png, lum = new Uint8ClampedArray(w * h);
    for (let i = 0; i < w * h; i++) lum[i] = (data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114) | 0;
    const r = new Z.MultiFormatReader(), hints = new Map(); hints.set(Z.DecodeHintType.TRY_HARDER, true); r.setHints(hints);
    try { const x = r.decode(new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.RGBLuminanceSource(lum, w, h)))); return { text: x.getText(), format: Z.BarcodeFormat[x.getBarcodeFormat()] }; } catch (e) { return { error: String(e) }; }
}
const DAY = d => { const t = new Date(); t.setDate(t.getDate() + d); return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0'); };
const FILLED = { version: 1, cards: [
    { id: 'k1', name: 'Imtiaz Super Market', number: '9501101530003', format: 'ean13', color: 'red', uses: 14, lastUsed: 5, created: 1 },
    { id: 'k2', name: 'Imtiaz Super Market', owner: 'Mum', number: '4006381333931', format: 'ean13', color: 'orange', uses: 3, lastUsed: 4, created: 2 },
    { id: 'k3', name: 'Boots Advantage Card', number: '633912345678901234', format: 'code128', color: 'blue', uses: 6, lastUsed: 3, created: 3, note: '2,350 points' },
    { id: 'k4', name: 'City Library', number: 'LIB-0451-K', format: 'code39', color: 'teal', uses: 1, lastUsed: 2, created: 4, expires: DAY(12) },
    { id: 'k5', name: 'Shell Go+', number: 'https://example.com/m/88231', format: 'qr', color: 'yellow', uses: 0, lastUsed: 0, created: 5 },
    { id: 'k6', name: 'FitZone Gym membership with a very long name to see that it wraps nicely', owner: 'Ali', number: 'M 7781', format: 'none', color: 'purple', uses: 0, lastUsed: 0, created: 6, expires: DAY(-3), note: 'Front desk PIN 4410\nRenew in January' }] };

(async () => {
    const srv = LIVE ? null : await serve();
    const BASE = LIVE || srv.base, URL = BASE + '/' + SLUG + '/';
    const browser = await chromium.launch();
    const errors = [];
    async function ctx(opts = {}) {
        const c = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', serviceWorkers: 'block', acceptDownloads: true, ...opts });
        await c.route(/goatcounter|gc\.zgo\.at/, r => r.fulfill({ status: 200, body: '' }));
        return c;
    }
    async function page(c, init) {
        const p = await c.newPage();
        p.on('pageerror', e => errors.push(String(e)));
        p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
        p.on('response', r => { if (r.status() >= 400 && !/goatcounter|zgo/.test(r.url())) errors.push(r.status() + ' ' + r.url()); });
        if (init) await p.addInitScript(init.fn, init.arg);
        await p.goto(URL);
        return p;
    }
    const seed = (data) => ({ fn: d => { if (!sessionStorage.getItem('seeded')) { localStorage.clear(); if (d) localStorage.setItem('loyalty-and-membership-card-wallet.cards', d); sessionStorage.setItem('seeded', '1'); } }, arg: data });
    const vis = (p, s) => p.locator(s).isVisible();
    const txt = (p, s) => p.locator(s).innerText();
    const names = p => p.locator('#list .cname').allInnerTexts();
    async function add(p, f) {
        await p.fill('#name', f.name); await p.fill('#number', f.number);
        if (f.format) await p.selectOption('#format', f.format);
        if (f.owner || f.note || f.expires) { if (!(await vis(p, '#more'))) await p.click('#more-btn'); if (f.owner) await p.fill('#owner', f.owner); if (f.note) await p.fill('#note', f.note); if (f.expires) await p.fill('#expires', f.expires); }
        await p.click('#save');
    }

    // ---------- the main situation, from an empty wallet ----------
    let c = await ctx({ permissions: ['clipboard-read', 'clipboard-write'] });
    let p = await page(c, seed(null));
    ok(await vis(p, '#empty'), 'first use: empty state shown');
    ok(await txt(p, '#empty'), 'empty state has text');
    ok(!(await vis(p, '#tools')), 'first use: no search or order with no cards');
    ok(!(await vis(p, '#more')), 'optional fields are hidden at first');
    ok(/Type the card number/.test(await txt(p, '#preview')), 'preview explains before typing');
    await p.click('#empty-add');
    ok(await p.evaluate(() => document.activeElement.id) === 'name', 'Add your first card focuses the name');

    await p.click('#save');
    ok(/Type the shop or card name/.test(await txt(p, '#name-err')), 'blank name refused');
    ok(/Type the card number/.test(await txt(p, '#number-err')), 'blank number refused');
    ok((await p.locator('#list li').count()) === 0, 'nothing saved when blank');

    await p.fill('#number', '9 501101 530003');
    ok((await txt(p, '#format-note')) === 'Shown as EAN-13.', 'auto picks EAN-13 for a 13 digit number');
    ok((await txt(p, '#preview-num')) === '9 501101 530003', 'preview number grouped like the card');
    ok(await p.locator('#preview-code svg').count() === 1, 'preview barcode drawn');
    await p.fill('#number', '9501101530004');
    ok(/does not match a EAN-13|does not match an EAN-13|does not match/.test(await txt(p, '#format-note')), 'wrong check digit warned');
    await p.selectOption('#format', 'ean13');
    ok(/should be 3/.test(await txt(p, '#preview')), 'chosen EAN-13 says the right last digit');
    await p.fill('#number', '950110153000');
    ok(/needs 13 digits. You typed 12/.test(await txt(p, '#preview')), 'chosen EAN-13 with 12 digits refused');
    await p.selectOption('#format', 'auto');
    await p.fill('#name', 'Imtiaz Super Market'); await p.fill('#number', '9 501101 530003'); await p.click('#save');
    ok((await names(p)).join() === 'Imtiaz Super Market', 'card added');
    ok(/Card added: Imtiaz Super Market/.test(await txt(p, '#toast')), 'added message');
    ok((await p.inputValue('#name')) === '' && (await p.inputValue('#number')) === '', 'form cleared after saving');
    ok((await txt(p, '#list .cnum')) === '9 501101 530003', 'list shows the number');
    ok(/EAN-13/.test(await txt(p, '#list .cmeta')), 'list shows the type');
    ok(!(await vis(p, '#empty')), 'empty state gone');
    ok(/1 card saved/.test(await txt(p, '#count')), 'count says 1 card');

    // the same shop for Mum, with the optional details, and a duplicate warning
    await p.fill('#number', '9501101530003');
    ok(/already have this card: Imtiaz Super Market/.test(await txt(p, '#dup')), 'duplicate warned');
    await add(p, { name: 'Imtiaz Super Market', number: '4006381333931', owner: 'Mum', note: 'Points 1,240', expires: DAY(1) });
    ok((await p.locator('#list li').count()) === 2, 'second card for Mum saved');
    ok(/Expires tomorrow/.test(await txt(p, '#list')), 'expiry tomorrow shown');
    ok(/Mum/.test(await txt(p, '#list')), 'whose card shown');
    ok(!(await vis(p, '#more')), 'optional fields close again after saving');
    await add(p, { name: 'City Library', number: 'lib-0451-k', format: 'code39' });
    ok(/LIB-0451-K/.test(await txt(p, '#list')), 'Code 39 in capitals');
    await add(p, { name: 'Shell Go+', number: 'https://example.com/m/88231', format: 'qr' });
    await add(p, { name: 'FitZone Gym', number: 'M 7781', format: 'none' });
    ok(await p.locator('#list .show-btn', { hasText: 'Show number' }).count() === 1, 'number only card says Show number');
    await add(p, { name: 'Boots Advantage Card', number: '6339 1234 5678 9012 34' });
    ok((await p.locator('#list li').count()) === 6, 'six cards');
    ok(/6339 1234 5678 9012 34/.test(await txt(p, '#list')), 'long number in fours');
    ok(await vis(p, '#find-box'), 'search shown with 4 or more cards');

    // at the till: show, decode the screen, close
    const imtiaz = p.locator('#list li', { hasText: 'Imtiaz Super Market' }).filter({ hasNotText: 'Mum' });
    await imtiaz.locator('.show-btn').click();
    ok(await vis(p, '#show'), 'barcode screen opens');
    ok((await txt(p, '#show-num')) === '9 501101 530003', 'big number shown');
    ok((await txt(p, '#show-fmt')) === 'EAN-13', 'type shown');
    let d = decodePng(await p.locator('#show-code').screenshot());
    ok(d.text === '9501101530003' && d.format === 'EAN_13', 'screen barcode scans as 9501101530003 EAN-13 (' + JSON.stringify(d) + ')');
    const box = await p.locator('.show-inner').boundingBox();
    ok(box.x >= 0 && box.x + box.width <= 390 && box.y >= 0 && box.y + box.height <= 844, 'barcode screen fits the phone');
    ok(await p.evaluate(() => document.activeElement.id) === 'show-close', 'focus on Close');
    await p.keyboard.press('Tab'); await p.keyboard.press('Tab'); await p.keyboard.press('Tab');
    ok(['show-copy', 'show-close'].includes(await p.evaluate(() => document.activeElement.id)), 'Tab stays inside the barcode screen');
    await p.click('#show-copy'); await p.waitForTimeout(200);
    ok(/Number copied: 9501101530003/.test(await txt(p, '#toast')), 'copy number');
    ok((await p.evaluate(() => navigator.clipboard.readText())) === '9501101530003', 'clipboard has the number');
    await p.keyboard.press('Escape');
    ok(!(await vis(p, '#show')), 'Escape closes');
    ok(await p.evaluate(() => document.activeElement.classList.contains('show-btn')), 'focus back on the card');
    ok((await names(p))[0] === 'Imtiaz Super Market', 'shown card moves to the top');
    for (const [name, want, fmt] of [['Boots Advantage Card', '633912345678901234', 'CODE_128'], ['City Library', 'LIB-0451-K', 'CODE_39'], ['Shell Go+', 'https://example.com/m/88231', 'QR_CODE']]) {
        await p.locator('#list li', { hasText: name }).locator('.show-btn').click();
        d = decodePng(await p.locator('#show-code').screenshot());
        ok(d.text === want && d.format === fmt, name + ' scans as ' + want + ' (' + JSON.stringify(d) + ')');
        await p.click('#show-close');
    }
    await p.locator('#list li', { hasText: 'FitZone' }).locator('.show-btn').click();
    ok(/No barcode on this card/.test(await txt(p, '#show-code')) && (await txt(p, '#show-num')) === 'M 7781', 'number only screen');
    await p.mouse.click(5, 5);
    ok(!(await vis(p, '#show')), 'tap outside closes');

    // search and order
    await p.fill('#find', 'mum');
    ok((await p.locator('#list li').count()) === 1, 'search by whose card');
    await p.fill('#find', '4006');
    ok((await p.locator('#list li').count()) === 1, 'search by number');
    await p.fill('#find', 'zzz');
    ok(await vis(p, '#no-match') && /No card matches "zzz"/.test(await txt(p, '#no-match')), 'no match message');
    await p.fill('#find', '');
    await p.selectOption('#sort', 'az');
    ok((await names(p))[0] === 'Boots Advantage Card', 'A to Z');

    // edit with undo
    await p.locator('#list li', { hasText: 'City Library' }).locator('button', { hasText: 'Edit' }).click();
    ok((await txt(p, '#form-title')) === 'Edit card' && (await txt(p, '#save')) === 'Save changes', 'edit mode labels');
    ok((await p.inputValue('#number')) === 'LIB-0451-K' && (await p.inputValue('#format')) === 'code39', 'edit fills the form');
    await p.fill('#name', 'Central Library');
    await p.click('#save');
    ok((await names(p)).includes('Central Library') && !(await names(p)).includes('City Library'), 'edit saved');
    ok((await txt(p, '#form-title')) === 'Add a card', 'back to add mode');
    await p.click('#toast-undo');
    ok((await names(p)).includes('City Library'), 'undo edit');
    // cancel edit
    await p.locator('#list li', { hasText: 'City Library' }).locator('button', { hasText: 'Edit' }).click();
    await p.fill('#name', 'Changed my mind'); await p.click('#cancel');
    ok((await names(p)).includes('City Library') && (await p.inputValue('#name')) === '', 'cancel keeps the card');
    // delete with undo
    await p.locator('#list li', { hasText: 'Shell Go+' }).locator('button', { hasText: 'Edit' }).click();
    await p.click('#delete');
    ok(!(await names(p)).includes('Shell Go+'), 'deleted');
    await p.click('#toast-undo');
    ok((await names(p)).includes('Shell Go+'), 'undo delete');

    // backup, delete all, restore
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#export')]);
    const file = path.join(os.tmpdir(), 'wallet-backup.json'); await dl.saveAs(file);
    const bk = JSON.parse(fs.readFileSync(file, 'utf8'));
    ok(bk.app === SLUG && bk.cards.length === 6 && /^loyalty-cards-backup-\d{4}-\d{2}-\d{2}\.json$/.test(dl.suggestedFilename()), 'backup file has 6 cards');
    await p.click('#copy-all');
    ok(/Imtiaz Super Market \(Mum\): 4 006381 333931/.test(await p.evaluate(() => navigator.clipboard.readText())), 'copy all card numbers');
    await p.click('#clear');
    ok((await p.locator('#list li').count()) === 0 && await vis(p, '#empty'), 'delete all');
    await p.click('#toast-undo');
    ok((await p.locator('#list li').count()) === 6, 'undo delete all');
    await p.click('#clear');
    await p.setInputFiles('#import', file);
    await p.waitForTimeout(200);
    ok((await p.locator('#list li').count()) === 6 && /Added 6 cards/.test(await txt(p, '#toast')), 'restore from backup');
    await p.setInputFiles('#import', file); await p.waitForTimeout(200);
    ok(/No new cards in this backup. 6 were already here/.test(await txt(p, '#toast')), 'restore twice adds nothing');
    const junk = path.join(os.tmpdir(), 'junk.json'); fs.writeFileSync(junk, '{"hello":1}');
    await p.setInputFiles('#import', junk); await p.waitForTimeout(200);
    ok(/not a card wallet backup/.test(await txt(p, '#toast')), 'wrong file refused');

    // a half-typed card and everything else survive a reload; the order is remembered
    await p.fill('#name', 'Half typed'); await p.fill('#number', '123');
    await p.reload();
    ok((await p.locator('#list li').count()) === 6, 'cards kept after reload');
    ok((await p.inputValue('#name')) === 'Half typed' && (await p.inputValue('#number')) === '123', 'half-typed card kept after reload');
    ok((await p.inputValue('#sort')) === 'az', 'order remembered');
    ok(/Mum/.test(await txt(p, '#list')), 'details kept');
    // long and pasted input
    await p.fill('#name', 'A'.repeat(80));
    ok((await p.inputValue('#name')).length === 60, 'name limited to 60');
    await p.fill('#number', '1'.repeat(90));
    ok(/up to 80/.test(await txt(p, '#preview')), 'too long number explained');
    await p.fill('#number', '  0000 1111\t2222  ');
    ok((await txt(p, '#preview-num')) === '0000 1111 2222', 'pasted number with tabs cleaned');
    await p.fill('#number', '0');
    ok(await p.locator('#preview-code svg').count() === 1, 'zero is a number');
    await p.close(); await c.close();

    // ---------- corrupt and blocked storage ----------
    c = await ctx(); p = await page(c, seed('{not json'));
    ok(await vis(p, '#storage-warn') && /could not be read/.test(await txt(p, '#storage-warn')), 'corrupt storage: warned, starts fresh');
    ok(await p.evaluate(() => localStorage.getItem('loyalty-and-membership-card-wallet.unreadable')) === '{not json', 'corrupt data kept aside');
    await add(p, { name: 'Test', number: '96385074' });
    ok((await p.locator('#list li').count()) === 1, 'works after corrupt storage');
    await c.close();
    c = await ctx(); p = await page(c, seed(JSON.stringify({ cards: [{ name: 'Good', number: '96385074' }, { name: '', number: 'x' }, 'junk', { name: '<img src=x onerror=alert(1)>', number: '1' }] })));
    ok((await p.locator('#list li').count()) === 2 && (await names(p)).includes('<img src=x onerror=alert(1)>'), 'bad rows dropped, text shown as text');
    await c.close();
    c = await ctx(); p = await c.newPage(); p.on('pageerror', e => errors.push(String(e)));
    await p.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
    await p.goto(URL);
    ok(await vis(p, '#storage-warn') && /not letting the app save/.test(await txt(p, '#storage-warn')), 'blocked storage warned');
    await add(p, { name: 'Still works', number: '96385074' });
    ok((await p.locator('#list li').count()) === 1, 'works with blocked storage');
    await c.close();

    // ---------- reading a barcode from a photo (browser support mocked) ----------
    c = await ctx(); p = await c.newPage(); p.on('pageerror', e => errors.push(String(e)));
    await p.route(/goatcounter|zgo/, r => r.fulfill({ status: 200, body: '' }));
    await p.addInitScript(() => { window.BarcodeDetector = class { async detect() { return window.__found || [{ rawValue: '4006381333931', format: 'ean_13' }]; } }; window.createImageBitmap = async () => ({}); });
    await p.goto(URL);
    ok(await vis(p, '#scan-box'), 'photo button shown where the browser can read barcodes');
    const img = path.join(ROOT, SLUG, 'icons/icon-192.png');
    await p.setInputFiles('#photo', img); await p.waitForTimeout(200);
    ok((await p.inputValue('#number')) === '4006381333931' && (await p.inputValue('#format')) === 'ean13' && /Read 4006381333931 \(EAN-13\)/.test(await txt(p, '#scan-msg')), 'photo read fills the number and type');
    await p.evaluate(() => { window.__found = []; });
    await p.setInputFiles('#photo', img); await p.waitForTimeout(200);
    ok(/No barcode found/.test(await txt(p, '#scan-msg')), 'photo with no barcode explained');
    await c.close();
    c = await ctx(); p = await page(c, seed(null));
    ok(!(await vis(p, '#scan-box')), 'photo button hidden where the browser cannot read barcodes');
    await c.close();

    // ---------- help, light/dark, every width with real data ----------
    const WIDTHS = [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920];
    for (const scheme of ['dark', 'light']) for (const w of WIDTHS) {
        c = await ctx({ viewport: { width: w, height: 900 }, colorScheme: scheme }); p = await page(c, seed(JSON.stringify(FILLED)));
        const tag = scheme + ' ' + w + ': ';
        for (const state of ['filled', 'editing', 'empty']) {
            if (state === 'editing') { await p.locator('#list li').nth(2).locator('button', { hasText: 'Edit' }).click(); if (!(await vis(p, '#more'))) await p.click('#more-btn'); await p.fill('#number', '9501101530004'); }
            if (state === 'empty') { await p.click('#cancel'); await p.click('#clear'); }
            const over = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
            ok(!over, tag + state + ': no sideways scroll');
            const out = await p.evaluate(() => [...document.querySelectorAll('main *')].filter(e => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width && cs.position !== 'fixed' && !e.closest('.show,.toast,.visually-hidden') && !e.classList.contains('visually-hidden') && (r.right > innerWidth + 1 || r.left < -1); }).map(e => e.id || e.className).slice(0, 3));
            ok(!out.length, tag + state + ': nothing sticks out ' + out.join());
            for (const pos of [0, 0.5, 1]) {
                await p.evaluate(f => window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * f), pos);
                const lap = await p.evaluate(() => { const k = [...document.querySelector('main').children].filter(e => e.getBoundingClientRect().height > 0 && getComputedStyle(e).position !== 'fixed'); const bad = [];
                    for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { const a = k[i].getBoundingClientRect(), b = k[j].getBoundingClientRect(); if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) bad.push((k[i].id || k[i].className) + '/' + (k[j].id || k[j].className)); } return bad; });
                ok(!lap.length, tag + state + ' scroll ' + pos + ': blocks do not overlap ' + lap.join());
            }
            if (w <= 390) {
                const cl = await p.evaluate(() => { const k = [...document.querySelectorAll('main input:not([type=radio]):not([type=file]), main select, main button, main textarea, main label.file-btn')].filter(e => { const r = e.getBoundingClientRect(); return r.width && !e.closest('.show,.toast'); }); const bad = [];
                    for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { if (k[i].contains(k[j]) || k[j].contains(k[i])) continue; const a = k[i].getBoundingClientRect(), b = k[j].getBoundingClientRect(); if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) bad.push((k[i].id || k[i].textContent) + '/' + (k[j].id || k[j].textContent)); } return bad; });
                ok(!cl.length, tag + state + ': controls do not overlap ' + cl.join());
                const clip = await p.evaluate(() => [...document.querySelectorAll('main input[placeholder], main textarea[placeholder]')].filter(e => e.getBoundingClientRect().width).filter(e => { const s = getComputedStyle(e); const c = document.createElement('canvas').getContext('2d'); c.font = s.fontSize + ' ' + s.fontFamily; return c.measureText(e.placeholder).width > e.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight) + 1; }).map(e => e.id));
                ok(!clip.length, tag + state + ': placeholders fit ' + clip.join());
            }
        }
        if (scheme === 'dark') {
            // the barcode screen fits at this width
            await p.click('#toast-undo');
            await p.locator('#list .show-btn').first().click();
            const b2 = await p.locator('.show-inner').boundingBox();
            ok(b2.x >= 0 && b2.x + b2.width <= w + 1 && b2.y >= 0 && b2.y + b2.height <= 901, tag + 'barcode screen fits');
            await p.keyboard.press('Escape');
        }
        if ([320, 390, 820, 1280].includes(w) && scheme === 'dark') {
            await p.evaluate(() => window.scrollTo(0, 0));
            const hb = p.locator('.help-btn'); ok(await hb.isVisible(), tag + 'Help button');
            const tb = await p.evaluate(() => { const r = ['.back', '.help-btn', '.theme-toggle'].map(s => document.querySelector(s)).filter(Boolean).map(e => e.getBoundingClientRect()); const bad = []; for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) if (Math.min(r[i].right, r[j].right) - Math.max(r[i].left, r[j].left) > 1 && Math.min(r[i].bottom, r[j].bottom) - Math.max(r[i].top, r[j].top) > 1) bad.push(i + '/' + j); return { bad, rows: new Set(r.map(x => Math.round(x.top))).size }; });
            ok(!tb.bad.length && tb.rows === 1, tag + 'top bar buttons on one row, no overlap');
            await hb.click();
            const dlg = p.locator('dialog.help'); const db = await dlg.boundingBox();
            ok(await dlg.isVisible() && db.x >= 0 && db.x + db.width <= w && db.y >= 0 && db.y + db.height <= 900, tag + 'help dialog inside the screen');
            ok(/How to use Loyalty and Membership Card Wallet/.test(await dlg.innerText()), tag + 'help title');
            await p.keyboard.press('Escape'); ok(!(await dlg.isVisible()), tag + 'Escape closes help');
            await hb.click(); await p.locator('dialog.help button', { hasText: 'Got it' }).click(); ok(!(await dlg.isVisible()), tag + 'Got it closes help');
            if (w === 390) {
                const before = await p.evaluate(() => getComputedStyle(document.body).color);
                await p.click('.theme-toggle');
                const after = await p.evaluate(() => [document.documentElement.dataset.theme, getComputedStyle(document.body).color]);
                ok(after[0] === 'light' && after[1] !== before, 'light/dark switch changes the look');
            }
        }
        await c.close();
    }

    // hub card opens the app
    c = await ctx({ viewport: { width: 1280, height: 900 } }); p = await c.newPage(); await p.route(/goatcounter|zgo/, r => r.fulfill({ status: 200, body: '' }));
    await p.goto(BASE + '/'); await p.waitForTimeout(1500);
    const hub = p.locator('a[href*="' + SLUG + '"]').first();
    ok(await hub.count() === 1, 'hub lists the app');
    if (await hub.count()) { await hub.click(); await p.waitForLoadState(); ok(p.url().includes(SLUG), 'hub card opens the app'); }
    await c.close();

    ok(!errors.length, 'no console errors or failed requests: ' + errors.slice(0, 5).join(' | '));
    await browser.close(); if (srv) srv.s.close();
    console.log((LIVE ? 'LIVE ' : '') + 'UI: ' + pass + ' passed, ' + fails.length + ' failed');
    process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
