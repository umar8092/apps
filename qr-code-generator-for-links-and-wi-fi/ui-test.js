// Drives the real page in headless Chromium and scans the downloaded pictures with jsQR.
// Run from the repo root: node qr-code-generator-for-links-and-wi-fi/ui-test.js [--base URL]
// Needs: playwright, jsqr and pngjs (npm i playwright jsqr pngjs).
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
let pw; try { pw = require('playwright'); } catch (e) { pw = require('playwright-core'); }
const jsQR = require('jsqr'), { PNG } = require('pngjs');

const SLUG = 'qr-code-generator-for-links-and-wi-fi';
const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2), bi = args.indexOf('--base');
const results = [];
const ok = (name, cond, extra) => { results.push({ name, ok: !!cond }); if (!cond) console.log('FAIL', name, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : ''); };

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
    const srv = bi >= 0 ? null : await serve();
    const BASE = bi >= 0 ? args[bi + 1].replace(/\/$/, '') : srv.base;
    const URL = BASE + '/' + SLUG + '/';
    const browser = await pw.chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
    const page = await ctx.newPage();
    const errors = [], bad = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('response', r => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()); });
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qr-'));

    const fresh = async () => { await page.goto(URL, { waitUntil: 'networkidle' }); await page.evaluate(() => localStorage.clear()); await page.reload({ waitUntil: 'networkidle' }); };
    const chip = v => page.locator('input[name=type][value=' + v + ']').check({ force: true });
    const text = sel => page.locator(sel).innerText();
    const dl = async (btn) => { const [d] = await Promise.all([page.waitForEvent('download'), page.click(btn)]); const f = path.join(tmp, d.suggestedFilename()); await d.saveAs(f); return { file: f, name: d.suggestedFilename() }; };
    const scanPng = async () => { const { file, name } = await dl('#dl-png'); const png = PNG.sync.read(fs.readFileSync(file)); const r = jsQR(new Uint8ClampedArray(png.data), png.width, png.height); return { text: r ? r.data : null, w: png.width, h: png.height, name, alphaCorner: png.data[3] }; };
    const payload = () => page.locator('#payload').textContent();

    await fresh();
    // ---- first use / empty ----
    ok('empty: hint shown', (await text('#qr-empty')).includes('Type a link'));
    ok('empty: downloads disabled', await page.locator('#dl-png').isDisabled() && await page.locator('#save').isDisabled());
    ok('empty: no red errors on a new form', (await page.locator('.panel:not([hidden]) .err').allInnerTexts()).every(t => !t.trim()));
    ok('optional caption hidden behind a button', await page.locator('#cap-box').isHidden() && await page.locator('#cap-btn').isVisible());

    // ---- link: the main situation ----
    await page.fill('#link-url', 'example.com/menu');
    ok('link: says what it does', (await text('#does')) === 'Scanning it opens https://example.com/menu');
    let s = await scanPng();
    ok('link: downloaded PNG scans to the link', s.text === 'https://example.com/menu', s.text);
    ok('link: PNG is 1024 square by default', s.w === 1024 && s.h === 1024, [s.w, s.h]);
    ok('link: file name from the link', s.name === 'qr-link-example-com-menu.png', s.name);
    ok('link: print size advice', /at least 2 cm/.test(await text('#print-hint')));
    const svgDl = await dl('#dl-svg');
    const svg = fs.readFileSync(svgDl.file, 'utf8');
    ok('link: SVG file has the squares', svg.startsWith('<svg') && /<path fill="#000000" d="M/.test(svg) && svgDl.name.endsWith('.svg'));
    // the SVG scans too (rendered in the browser)
    const svgScan = await page.evaluate(async (svgText) => {
        const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgText); await img.decode();
        const c = document.createElement('canvas'); c.width = 600; c.height = 600 * img.naturalHeight / img.naturalWidth; const x = c.getContext('2d'); x.drawImage(img, 0, 0, c.width, c.height);
        return { w: c.width, h: c.height, data: Array.from(x.getImageData(0, 0, c.width, c.height).data) };
    }, svg);
    const sr = jsQR(new Uint8ClampedArray(svgScan.data), svgScan.w, svgScan.h);
    ok('link: SVG scans to the link', sr && sr.data === 'https://example.com/menu');
    await page.fill('#link-url', '   ');
    ok('link: cleared box goes back to the hint, no error', (await text('#qr-empty')).includes('Type a link') && !(await text('.panel:not([hidden]) [data-err=url]')).trim());
    await page.fill('#link-url', 'mycafe');
    ok('link: no-dot warning shown as a note', (await text('#notes')).includes('no ending like .com'));
    await page.fill('#link-url', 'https://shop.example.com/a b?x=1');
    ok('link: spaces become %20 and note', (await payload()) === 'https://shop.example.com/a%20b?x=1' && (await text('#notes')).includes('%20'));

    // ---- Wi-Fi: the café card ----
    await chip('wifi');
    ok('wifi: empty hint', (await text('#qr-empty')).includes('Wi-Fi name'));
    await page.fill('#wifi-ssid', 'Cafe Guest');
    ok('wifi: missing password error once name typed', (await text('.panel:not([hidden]) [data-err=password]')).includes('password'));
    await page.fill('#wifi-pw', 'beans;2024:"x"');
    s = await scanPng();
    ok('wifi: scans to the exact escaped Wi-Fi text', s.text === 'WIFI:T:WPA;S:Cafe Guest;P:beans\\;2024\\:\\"x\\";;', s.text);
    ok('wifi: PNG taller with network and password under it', s.h > s.w, [s.w, s.h]);
    ok('wifi: does line', (await text('#does')) === 'Scanning it joins the Wi-Fi network Cafe Guest');
    ok('wifi: password hidden until Show', (await page.getAttribute('#wifi-pw', 'type')) === 'password');
    await page.click('#pw-show');
    ok('wifi: Show reveals the password', (await page.getAttribute('#wifi-pw', 'type')) === 'text' && (await text('#pw-show')) === 'Hide');
    await page.uncheck('#wifi-text');
    s = await scanPng();
    ok('wifi: untick shows no words, square picture', s.w === s.h);
    await page.check('#wifi-text');
    await page.selectOption('#wifi-sec', 'nopass');
    ok('wifi: open network hides the password box', await page.locator('#wifi-pw-box').isHidden());
    ok('wifi: open network payload', (await payload()) === 'WIFI:T:nopass;S:Cafe Guest;;');
    await page.selectOption('#wifi-sec', 'WPA');
    await page.check('#wifi-hidden');
    ok('wifi: hidden network adds H:true', (await payload()).includes('H:true;'));
    await page.uncheck('#wifi-hidden');
    await page.fill('#wifi-pw', 'short');
    ok('wifi: short password warns, code still shows', (await text('#notes')).includes('8 characters') && await page.locator('#qr-img').isVisible());
    await page.fill('#wifi-pw', 'coffee2024');

    // ---- caption ----
    await page.click('#cap-btn');
    await page.fill('#caption', '<img src=x onerror=alert(1)> Scan to join');
    ok('caption: typed HTML stays text (alt and no new img)', (await page.locator('#preview img').count()) === 1 && (await page.getAttribute('#qr-img', 'alt')).includes('<img src=x'));
    s = await scanPng();
    ok('caption: still scans with words under it', s.text === 'WIFI:T:WPA;S:Cafe Guest;P:coffee2024;;');
    await page.fill('#caption', 'Scan to join our Wi-Fi');

    // ---- contact ----
    await chip('contact');
    ok('contact: extra details hidden behind a button', await page.locator('#c-more').isHidden());
    await page.fill('#c-first', 'Sara'); await page.fill('#c-last', 'Khan'); await page.fill('#c-mobile', '+92 300 1234567');
    await page.fill('#c-email', 'sara@');
    ok('contact: bad email shows a red line', (await text('.panel:not([hidden]) [data-err=email]')).includes('email') && (await page.getAttribute('#c-email', 'aria-invalid')) === 'true');
    await page.fill('#c-email', 'sara@example.com');
    await page.click('#c-more-btn'); await page.fill('#c-addr', '12 Mall Rd\nLahore');
    s = await scanPng();
    ok('contact: scans to a vCard with the details', s.text && s.text.startsWith('BEGIN:VCARD') && s.text.includes('FN:Sara Khan') && s.text.includes('TEL;TYPE=CELL:+923001234567') && s.text.includes('ADR:;;12 Mall Rd\\, Lahore;;;;'), s.text);

    // ---- phone, sms, email, text ----
    await chip('phone'); await page.fill('#p-num', '+44 20 7946 0958');
    s = await scanPng(); ok('phone: scans to tel:', s.text === 'tel:+442079460958', s.text);
    await page.fill('#p-num', '0800-FLOWERS');
    ok('phone: letters refused with a red line', (await text('.panel:not([hidden]) [data-err=number]')).includes('digits') && await page.locator('#dl-png').isDisabled());
    await page.fill('#p-num', '03001234567');
    ok('phone: country code tip', (await text('#notes')).includes('country code'));
    await chip('sms');
    ok('sms: its own number box, empty', (await page.inputValue('#s-num')) === '');
    await page.fill('#s-num', '+1 555 0100'); await page.fill('#s-msg', 'JOIN');
    s = await scanPng(); ok('sms: scans to SMSTO', s.text === 'SMSTO:+15550100:JOIN', s.text);
    await chip('email');
    ok('email: subject hidden behind a button', await page.locator('#e-more').isHidden());
    await page.fill('#e-to', 'help@shop.com'); await page.click('#e-more-btn'); await page.fill('#e-sub', 'Booking');
    s = await scanPng(); ok('email: scans to mailto with subject', s.text === 'mailto:help@shop.com?subject=Booking', s.text);
    await chip('text');
    await page.fill('#t-text', 'Locker 4471 ☕ گھر');
    s = await scanPng(); ok('text: emoji and Urdu scan back exactly', s.text === 'Locker 4471 ☕ گھر', s.text);
    await page.fill('#t-text', 'x'.repeat(2500));
    ok('text: too long explained, suggests Low', (await text('#qr-empty')).includes('too long') && (await text('#qr-empty')).includes('Low') && await page.locator('#dl-png').isDisabled());
    await page.selectOption('#ecl', 'L');
    ok('text: Low makes it fit', await page.locator('#qr-img').isVisible());
    await page.selectOption('#ecl', 'M');
    await page.fill('#t-text', 'Locker 4471');

    // ---- colours and size ----
    await page.locator('#fg').evaluate(e => { e.value = '#ffffff'; e.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.locator('#bg').evaluate(e => { e.value = '#000000'; e.dispatchEvent(new Event('input', { bubbles: true })); });
    ok('colour: inverted warned', (await text('#colour-warn')).includes('lighter'));
    await page.click('#colour-reset');
    ok('colour: back to black on white, warning gone', (await page.inputValue('#fg')) === '#000000' && !(await page.locator('#colour-warn').textContent()).trim());
    await page.check('#transparent');
    s = await scanPng(); ok('colour: see-through PNG has an empty corner', s.alphaCorner === 0);
    await page.uncheck('#transparent');
    await page.selectOption('#size', 'own');
    ok('size: own box appears with the current size', await page.locator('#own').isVisible() && (await page.inputValue('#own')) === '1024');
    await page.fill('#own', '300');
    s = await scanPng(); ok('size: own 300 px exact', s.w === 300 && s.text === 'Locker 4471', s);
    await page.fill('#own', 'abc');
    ok('size: words refused', (await text('#own-err')).includes('64 to 4096'));
    await page.fill('#own', '20');
    ok('size: too small refused', (await text('#own-err')).includes('64 to 4096'));
    s = await scanPng(); ok('size: last good size kept', s.w === 300);
    await page.selectOption('#size', '512');
    s = await scanPng(); ok('size: preset 512', s.w === 512);

    // ---- print ----
    await page.evaluate(() => { window.print = () => { window.__printed = (window.__printed || 0) + 1; }; });
    await page.selectOption('#copies', '6'); await page.click('#print'); await page.waitForTimeout(150);
    ok('print: 6 copies placed and print opened', (await page.locator('#print-area img').count()) === 6 && await page.evaluate(() => window.__printed === 1));
    await page.emulateMedia({ media: 'print' });
    ok('print: only the codes show when printing', await page.locator('main').isHidden() && await page.locator('#print-area').isVisible());
    await page.emulateMedia({ media: 'screen' });

    // ---- My QR codes: save, reload, open, change, delete, undo ----
    await chip('wifi');
    await page.fill('#save-name', 'Cafe Wi-Fi');
    await page.click('#save');
    ok('saved: listed', (await page.locator('.s-item').count()) === 1 && (await text('.s-item .s-name')) === 'Cafe Wi-Fi');
    ok('saved: button becomes Save changes', (await text('#save')) === 'Save changes' && await page.locator('#save-new').isVisible());
    await chip('link'); await page.fill('#link-url', 'example.com/review');
    await page.fill('#save-name', '');
    await page.click('#save-new');
    ok('saved: second code with a described name', (await page.locator('.s-item').count()) === 2 && (await page.locator('.s-name').first().innerText()) === 'Opens example.com/review');
    await page.reload({ waitUntil: 'networkidle' });
    ok('reload: type, link and saved list restored', (await page.inputValue('#link-url')) === 'example.com/review' && (await page.locator('.s-item').count()) === 2);
    ok('reload: caption and size restored', (await page.inputValue('#caption')) === 'Scan to join our Wi-Fi' && (await page.inputValue('#size')) === '512');
    await page.locator('.s-item', { hasText: 'Cafe Wi-Fi' }).getByRole('button', { name: /^Open/ }).click();
    ok('open: Wi-Fi restored', (await page.inputValue('#wifi-ssid')) === 'Cafe Guest' && (await page.locator('input[name=type][value=wifi]').isChecked()));
    await page.fill('#wifi-pw', 'newpass2025');
    await page.click('#save');
    ok('open: Save changes updates, no duplicate', (await page.locator('.s-item').count()) === 2 && await page.evaluate(() => JSON.parse(localStorage.getItem('qr-code-generator-for-links-and-wi-fi.saved')).some(x => x.fields.password === 'newpass2025')));
    await page.locator('.s-item', { hasText: 'Cafe Wi-Fi' }).getByRole('button', { name: /^Delete/ }).click();
    ok('delete: removed with Undo offered', (await page.locator('.s-item').count()) === 1 && (await text('#saved-msg')).includes('Undo'));
    await page.click('#saved-msg button');
    ok('delete: Undo brings it back', (await page.locator('.s-item').count()) === 2);

    // ---- start over + undo ----
    await page.click('#restart');
    ok('start over: typed things cleared, saved kept', (await page.inputValue('#wifi-ssid')) === '' && (await page.locator('.s-item').count()) === 2 && await page.locator('#dl-png').isDisabled());
    ok('start over: size kept', (await page.inputValue('#size')) === '512');
    await page.click('#saved-msg button');
    ok('start over: Undo restores', (await page.inputValue('#wifi-ssid')) === 'Cafe Guest');

    // ---- corrupt and blocked storage ----
    await page.evaluate(() => { localStorage.setItem('qr-code-generator-for-links-and-wi-fi.state', '{"type":"evil","fields":{"link":{"url":5}},"look":{"fg":"javascript:","size":-3}}'); localStorage.setItem('qr-code-generator-for-links-and-wi-fi.saved', '[{"id":"a","type":"link","fields":{"url":"x.com"}},{"bad":1},"x"]'); });
    await page.reload({ waitUntil: 'networkidle' });
    ok('corrupt state: starts fresh, keeps the one good saved code', (await page.locator('input[name=type][value=link]').isChecked()) && (await page.inputValue('#fg')) === '#000000' && (await page.locator('.s-item').count()) === 1);
    await page.evaluate(() => localStorage.setItem('qr-code-generator-for-links-and-wi-fi.state', '{not json'));
    await page.reload({ waitUntil: 'networkidle' });
    ok('broken JSON: page still works', (await text('#qr-empty')).length > 0);
    const blocked = await ctx.newPage();
    const berr = []; blocked.on('pageerror', e => berr.push(e.message));
    await blocked.addInitScript(() => { const thrower = () => { throw new Error('blocked'); }; Object.defineProperty(window, 'localStorage', { get: thrower }); });
    await blocked.goto(URL, { waitUntil: 'networkidle' });
    await blocked.fill('#link-url', 'example.com');
    await blocked.click('#save');
    ok('blocked storage: no crash, message shown', berr.length === 0 && (await blocked.locator('#saved-msg').innerText()).includes('not letting'), berr);
    await blocked.close();

    // ---- keyboard: type chips are a radio group ----
    await fresh();
    await page.locator('input[name=type][value=link]').focus();
    await page.keyboard.press('ArrowRight');
    ok('keyboard: arrow keys change the kind of code', await page.locator('input[name=type][value=wifi]').isChecked() && await page.locator('.panel[data-type=wifi]').isVisible());

    // ---- screen sizes with filled state, and placeholders that fit ----
    const fill = async () => {
        await fresh(); await chip('wifi'); await page.fill('#wifi-ssid', 'Cafe Guest'); await page.fill('#wifi-pw', 'coffee2024');
        await page.click('#cap-btn'); await page.fill('#caption', 'Scan to join'); await page.fill('#save-name', 'Cafe'); await page.click('#save');
    };
    await fill();
    for (const scheme of ['dark', 'light']) {
        await page.emulateMedia({ colorScheme: scheme });
        for (const w of [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920]) {
            await page.setViewportSize({ width: w, height: 900 });
            for (const t of ['wifi', 'contact', 'email', 'link', 'sms']) {
                await chip(t);
                if (t === 'contact' && await page.locator('#c-more-btn').isVisible()) await page.click('#c-more-btn');
                if (t === 'email' && await page.locator('#e-more-btn').isVisible()) await page.click('#e-more-btn');
                const sw = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
                ok(`[${scheme} ${w} ${t}] no horizontal scroll`, sw);
                if (w <= 390) {
                    const overlap = await page.evaluate(() => {
                        const els = [...document.querySelectorAll('main input:not([type=radio]), main select, main button, main textarea, main .chip span')].filter(e => e.offsetParent && e.getBoundingClientRect().width);
                        const out = [];
                        for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
                            const a = els[i].getBoundingClientRect(), b = els[j].getBoundingClientRect();
                            if (els[i].contains(els[j]) || els[j].contains(els[i])) continue;
                            if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) out.push((els[i].id || els[i].textContent.slice(0, 20)) + ' / ' + (els[j].id || els[j].textContent.slice(0, 20)));
                        }
                        return out;
                    });
                    ok(`[${scheme} ${w} ${t}] no overlapping controls`, overlap.length === 0, overlap);
                    const clipped = await page.evaluate(() => {
                        const c = document.createElement('canvas').getContext('2d');
                        return [...document.querySelectorAll('main input[placeholder], main textarea[placeholder]')].filter(e => e.offsetParent).filter(e => {
                            const cs = getComputedStyle(e); c.font = cs.fontSize + ' ' + cs.fontFamily;
                            const room = e.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
                            return c.measureText(e.placeholder).width > room + 1 && e.tagName === 'INPUT';
                        }).map(e => e.id);
                    });
                    ok(`[${scheme} ${w} ${t}] placeholders fit`, clipped.length === 0, clipped);
                }
            }
            if (w >= 900) {
                for (const pos of [0, 0.5, 1]) {
                    await page.evaluate(p => window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * p), pos);
                    const o = await page.evaluate(() => {
                        const out = [];
                        [document.querySelector('main'), ...document.querySelectorAll('.col-main, .col-side')].forEach(par => {
                            const kids = [...par.children].filter(k => k.offsetParent && getComputedStyle(k).position !== 'fixed');
                            for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
                                const a = kids[i].getBoundingClientRect(), b = kids[j].getBoundingClientRect();
                                if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) out.push(kids[i].className + ' / ' + kids[j].className);
                            }
                        });
                        return out;
                    });
                    ok(`[${scheme} ${w}] no overlapping blocks at scroll ${pos}`, o.length === 0, o);
                }
            }
        }
    }
    // cleared state at phone and desktop
    await page.click('#restart');
    for (const w of [320, 1280]) { await page.setViewportSize({ width: w, height: 900 }); ok(`[cleared ${w}] no horizontal scroll`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); }

    // ---- Help dialog ----
    for (const w of [320, 390, 820, 1280]) {
        await page.setViewportSize({ width: w, height: 800 });
        await page.locator('.help-btn, button:has-text("Help")').first().click();
        const d = page.locator('dialog.help');
        const box = await d.boundingBox();
        ok(`[help ${w}] opens fully on screen with title`, await d.evaluate(e => e.open) && box.x >= 0 && box.y >= 0 && box.x + box.width <= w + 1 && box.y + box.height <= 801 && (await d.locator('h2').innerText()).includes('QR Code Generator'));
        await page.keyboard.press('Escape');
        ok(`[help ${w}] Escape closes`, !(await d.evaluate(e => e.open)));
        await page.locator('.help-btn, button:has-text("Help")').first().click(); await page.locator('.help-close').click();
        ok(`[help ${w}] Got it closes`, !(await d.evaluate(e => e.open)));
        const bar = await page.evaluate(() => [...document.querySelectorAll('.topbar a, .topbar button')].map(e => e.getBoundingClientRect()).map(r => [r.top, r.height]));
        ok(`[help ${w}] top bar on one line`, bar.every(b => Math.abs(b[0] - bar[0][0]) < 4), bar);
    }

    // ---- light/dark switch ----
    await page.setViewportSize({ width: 1280, height: 900 });
    const before = await page.evaluate(() => getComputedStyle(document.body).color);
    await page.locator('.theme-toggle').click();
    const after = await page.evaluate(() => getComputedStyle(document.body).color);
    ok('theme switch changes the colours', before !== after);
    await page.locator('.theme-toggle').click();

    ok('no console errors', errors.length === 0, errors);
    ok('no failed requests', bad.length === 0, bad);
    await browser.close(); if (srv) srv.s.close();
    const passed = results.filter(r => r.ok).length;
    console.log(passed + ' of ' + results.length + ' UI checks passed');
    process.exit(passed === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
