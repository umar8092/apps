// Drives the real page in headless Chromium: node ui-test.js [--shots] [--base https://umar8092.github.io/apps]
// Without --base it serves this repo on localhost. With --base it tests the LIVE page.
const pw = (() => { for (const m of ['playwright', 'playwright-core', '/opt/node-tools/node_modules/playwright']) { try { return require(m); } catch (e) { /* next */ } } throw new Error('playwright not found'); })();
const path = require('path'), fs = require('fs'), http = require('http');
const bi = process.argv.indexOf('--base'), shots = process.argv.includes('--shots');
let fail = 0, url;
const ok = (name, cond) => { if (!cond) fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name); };

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
async function load(b, vp, opt = {}) {
    const ctx = opt.ctx || await b.newContext({ viewport: vp, deviceScaleFactor: vp.width < 500 ? 2 : 1, colorScheme: opt.theme || 'dark', permissions: ['clipboard-read', 'clipboard-write'] });
    if (opt.init) await ctx.addInitScript(opt.init);
    const p = await ctx.newPage();
    p.errors = []; p.on('console', m => m.type() === 'error' && p.errors.push(m.text())); p.on('pageerror', e => p.errors.push(String(e)));
    p.bad = []; p.on('response', r => { if (r.status() >= 400) p.bad.push(r.status() + ' ' + r.url()); });
    p.ok200 = []; p.on('response', r => p.ok200.push(r.status() + ' ' + r.url()));
    await p.goto(url, { waitUntil: 'networkidle' });
    return p;
}
const box = (p, i) => p.locator('#items > li').nth(i);
async function fill(p, i, price, size, unit, count) {
    const b = box(p, i);
    await b.locator('input[id^=price-]').fill(price);
    await b.locator('input[id^=size-]').fill(size);
    if (unit) await b.locator('select').selectOption(unit);
    if (count) { if (await b.locator('input[id^=count-]').count() === 0) await b.getByText('+ It is a multipack or multi-buy (optional)').click(); await box(p, i).locator('input[id^=count-]').fill(count); }
}
const T = (p, s) => p.textContent(s);

(async () => {
    let srv;
    if (bi >= 0) url = process.argv[bi + 1].replace(/\/$/, '') + '/unit-price-calculator-for-shopping/';
    else { srv = await serve(); url = 'http://localhost:' + srv.address().port + '/unit-price-calculator-for-shopping/'; }
    const b = await pw.chromium.launch();

    // --- first use, empty state ---
    let p = await load(b, { width: 390, height: 844 });
    ok('first use: two empty packs A and B, intro and example button shown', await p.locator('#items > li').count() === 2 && await p.isVisible('#demo') && (await T(p, '#items')).includes('Item A'));
    ok('empty: asks to fill in two packs; copy disabled; no "per" select', (await T(p, '#v-head')) === 'Fill in two packs to compare.' && await p.isDisabled('#copy') && await p.isHidden('#per-box'));
    ok('optional name and multipack fields are hidden behind buttons', await p.locator('input[id^=name-]').count() === 0 && await p.locator('input[id^=count-]').count() === 0);
    ok('blank boxes do not show errors', (await p.locator('.err').allTextContents()).join('') === '');

    // --- the real situation: rice ---
    await fill(p, 0, '2.49', '500', 'g');
    ok('one pack: shows its unit price and asks for another', (await T(p, '#v-head')) === 'Item A: 4.98 per kg' && (await T(p, '#v-sub')).includes('Add another'));
    ok('half-filled B is "Type the price and size."', (await box(p, 1).locator('.i-out').textContent()) === 'Type the price and size.');
    await fill(p, 1, '5.29', '1.2', 'kg');
    await p.click('#add-item');
    ok('new pack C takes the unit of the last one (kg) and gets focus', await box(p, 2).locator('select').inputValue() === 'kg' && await p.evaluate(() => document.activeElement.id.startsWith('price-')));
    await fill(p, 2, '4.60', '250', 'g', '4');
    ok('multipack label changes to "Size of one"', (await box(p, 2).textContent()).includes('Size of one'));
    ok('verdict: Item B is cheapest, 4.41 per kg, next 4% more', (await T(p, '#v-head')) === 'Item B is cheapest' && (await T(p, '#v-sub')) === '4.41 per kg. The next cheapest, Item C, costs 4% more per kg.');
    const rows = await p.locator('#ranked > li').allTextContents();
    ok('ranked list B, C, A with exact numbers', rows.length === 3 && rows[0].includes('4.41 per kg') && rows[0].includes('Cheapest') && rows[1].includes('4 × 250 g for 4.60') && rows[1].includes('4% more (0.19 more per kg)') && rows[1].includes('costs 5.52, 0.23 more') && rows[2].includes('13% more (0.57 more per kg)') && rows[2].includes('5.98, 0.69 more'));
    ok('each box shows its own price per kg, cheapest marked', (await box(p, 0).locator('.i-out').textContent()) === '= 4.98 per kg' && (await box(p, 1).locator('.i-out').textContent()) === '= 4.41 per kg · cheapest');
    // names
    await box(p, 1).getByText('+ Add a name (optional)').click();
    await box(p, 1).locator('input[id^=name-]').fill('Big bag');
    ok('name used in title and verdict', (await box(p, 1).locator('.i-title').textContent()) === 'Big bag' && (await T(p, '#v-head')) === 'Big bag is cheapest');
    // per
    await p.selectOption('#per', '100g');
    ok('per 100 g: 0.441', (await T(p, '#v-sub')).startsWith('0.441 per 100 g'));
    await p.selectOption('#per', 'lb');
    // currency
    await p.selectOption('#cur', '£');
    ok('currency £ shown in boxes and results', (await T(p, '#v-sub')).startsWith('£2.00 per lb') && await box(p, 0).locator('.sym').textContent() === '£');
    // copy / email
    await p.click('#copy');
    const clip = await p.evaluate(() => navigator.clipboard.readText());
    ok('copy result text', clip.startsWith('Which is cheaper? (price per lb)\nBig bag is cheapest.') && clip.includes('1. Big bag: 1.2 kg for £5.29 = £2.00 per lb (cheapest)') && clip.includes('umar8092.github.io/apps/unit-price-calculator-for-shopping/') && (await T(p, '#tools-msg')).startsWith('Copied'));
    const mail = await p.getAttribute('#mail', 'href');
    ok('email link has no recipient and the result in the body', mail.startsWith('mailto:?subject=') && decodeURIComponent(mail).includes('Big bag is cheapest'));
    // reload keeps everything
    await p.reload({ waitUntil: 'networkidle' });
    ok('reload: 3 packs, name, multipack, £, per lb kept', await p.locator('#items > li').count() === 3 && (await T(p, '#v-head')) === 'Big bag is cheapest' && await p.inputValue('#cur') === '£' && await p.inputValue('#per') === 'lb' && await box(p, 2).locator('input[id^=count-]').inputValue() === '4');
    ok('intro hidden once packs are filled', await p.isHidden('#intro'));
    // edit a mistake
    await box(p, 0).locator('input[id^=price-]').fill('1.99');
    ok('edit: A at 1.99 for 500 g becomes cheapest (£1.81 per lb)', (await T(p, '#v-head')) === 'Item A is cheapest' && (await T(p, '#v-sub')).startsWith('£1.81 per lb'));
    await box(p, 0).locator('input[id^=price-]').fill('2.49');
    // odd inputs
    await box(p, 0).locator('input[id^=price-]').fill('-3');
    ok('negative price: message in the box, pack left out, note shown', (await box(p, 0).locator('.err').first().textContent()) === 'The price cannot be below 0.' && (await T(p, '#notes')).includes('Not compared yet: Item A'));
    await box(p, 0).locator('input[id^=price-]').fill('0');
    ok('zero price refused', (await box(p, 0).textContent()).includes('The price must be more than 0.'));
    await box(p, 0).locator('input[id^=price-]').fill('abc');
    ok('words refused', (await box(p, 0).textContent()).includes('The price should be a number, like 2.49.'));
    await box(p, 0).locator('input[id^=price-]').fill('');
    ok('blank price after size typed: "Type the price."', (await box(p, 0).textContent()).includes('Type the price.'));
    await box(p, 0).locator('input[id^=price-]').fill('$2,49');
    ok('pasted "$2,49" read as 2.49', (await box(p, 0).locator('.i-out').textContent()) === '= £2.26 per lb');
    await box(p, 2).locator('input[id^=count-]').fill('1.5');
    ok('how many 1.5 refused', (await box(p, 2).textContent()).includes('How many should be a whole number, like 6.'));
    await box(p, 2).locator('input[id^=count-]').fill('4');
    await box(p, 0).locator('input[id^=size-]').fill('9999999');
    ok('huge size refused', (await box(p, 0).textContent()).includes('That size is too big.'));
    await box(p, 0).locator('input[id^=size-]').fill('500');
    // different kind
    await box(p, 2).locator('select').selectOption('l');
    ok('litres among kg: not compared, says which to change', (await box(p, 2).locator('.i-out').textContent()).startsWith('Not compared: this is liquid') && (await T(p, '#notes')).includes('Item C is not compared'));
    await box(p, 2).locator('select').selectOption('g');
    // tie
    await box(p, 0).locator('input[id^=price-]').fill('2.205'); await box(p, 0).locator('input[id^=size-]').fill('500');
    // remove with undo
    await box(p, 2).getByRole('button', { name: /Remove/ }).click();
    ok('remove C: 2 packs and Undo shown', await p.locator('#items > li').count() === 2 && (await T(p, '#items-msg')).startsWith('Item C removed.'));
    await p.locator('#items-msg button').click();
    ok('undo brings C back with its values', await p.locator('#items > li').count() === 3 && await box(p, 2).locator('input[id^=count-]').inputValue() === '4');
    // tie: A 2.21 for 500 g = 4.42/kg vs ... make exact tie A 2.645 -> 2.65? use exact: A 2.645 not cents. Use A = 2.645? Instead A 500 g at 2.20, B 1 kg at 4.40
    await box(p, 0).locator('input[id^=price-]').fill('2.20'); await box(p, 1).locator('input[id^=price-]').fill('4.40'); await box(p, 1).locator('input[id^=size-]').fill('1');
    await box(p, 2).getByRole('button', { name: /Remove/ }).click();
    ok('tie: "Both cost the same"', (await T(p, '#v-head')) === 'Both cost the same');
    // not a multipack
    await p.click('#add-item'); await fill(p, 2, '5', '300', 'g', '6');
    await box(p, 2).getByText('Not a multipack').click();
    ok('"Not a multipack" hides How many and clears it', await box(p, 2).locator('input[id^=count-]').count() === 0 && (await box(p, 2).locator('.i-out').textContent()).includes('per'));
    // up to 10
    for (let i = 0; i < 10; i++) if (await p.isVisible('#add-item')) await p.click('#add-item');
    ok('at most 10 packs, then the add button hides', await p.locator('#items > li').count() === 10 && await p.isHidden('#add-item'));
    // start over with undo
    await p.click('#restart');
    ok('start over: two empty packs, Undo offered', await p.locator('#items > li').count() === 2 && (await T(p, '#v-head')) === 'Fill in two packs to compare.' && (await T(p, '#tools-msg')).startsWith('Started over.'));
    await p.locator('#tools-msg button').click();
    ok('undo start over: 10 packs back', await p.locator('#items > li').count() === 10);
    await p.click('#restart');
    await p.reload({ waitUntil: 'networkidle' });
    ok('after start over and reload: empty, currency still remembered', await p.locator('#items > li').count() === 2 && await p.inputValue('#cur') === '£');
    // long name
    await p.click('#demo');
    await box(p, 0).locator('input[id^=name-]').fill('A very long product name with many words that goes on and on');
    ok('long name cut to 40 and wraps without horizontal scroll', (await box(p, 0).locator('input[id^=name-]').inputValue()).length === 40 && await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    ok('no console errors (main run)', p.errors.length === 0);
    await p.context().close();

    // --- mixed oz and g, drinks, rolls ---
    p = await load(b, { width: 1280, height: 900 });
    await fill(p, 0, '3.99', '16', 'oz'); await fill(p, 1, '4.20', '500', 'g');
    ok('16 oz vs 500 g: per oz, Item B cheapest, Item A 5% more', await p.inputValue('#per') === 'oz' && (await T(p, '#v-head')) === 'Item B is cheapest' && (await T(p, '#v-sub')).includes('Item A costs 5% more per oz'));
    await fill(p, 0, '4.50', '9', 'item'); await fill(p, 1, '11.00', '24', 'item');
    ok('toilet rolls: 24 for 11.00 cheapest at 0.458 per item', (await T(p, '#v-sub')).startsWith('0.458 per item'));
    await p.context().close();

    // --- corrupt and blocked storage ---
    p = await load(b, { width: 390, height: 844 }, { init: () => { try { localStorage.setItem('unit-price-calculator-for-shopping.state', '{"items":[{"price":{"x":1},"unit":"zz","id":"<b>"}],"cur":"<i>"}'); } catch (e) { /* */ } } });
    ok('corrupt saved state: starts with clean values, no errors', await p.locator('#items > li').count() === 1 && await box(p, 0).locator('select').inputValue() === 'g' && p.errors.length === 0);
    await p.context().close();
    p = await load(b, { width: 390, height: 844 }, { init: () => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); } });
    ok('storage blocked: app works and says it will not keep it', (await T(p, '#tools-msg')).includes('blocking storage') && await p.locator('#items > li').count() === 2);
    await fill(p, 0, '1', '1', 'kg'); await fill(p, 1, '2', '1', 'kg');
    ok('storage blocked: still compares', (await T(p, '#v-head')) === 'Item A is cheapest');
    await p.context().close();

    // --- keyboard only ---
    p = await load(b, { width: 1280, height: 900 });
    await p.focus('#demo'); await p.keyboard.press('Enter');
    ok('keyboard: Enter on "Try an example" loads it', (await T(p, '#v-head')) === 'Big bag is cheapest');
    await box(p, 0).locator('input[id^=price-]').focus(); await p.keyboard.press('Tab');
    ok('keyboard: Tab from price goes to size', await p.evaluate(() => document.activeElement.id.startsWith('size-')));
    ok('screen reader: verdict is a live region, unit select labelled', await p.getAttribute('#verdict', 'aria-live') === 'polite' && await box(p, 0).locator('select').getAttribute('aria-label') === 'Unit');
    // theme switch
    const before = await p.evaluate(() => getComputedStyle(document.body).color);
    await p.click('.theme-toggle');
    const after = await p.evaluate(() => getComputedStyle(document.body).color);
    ok('light/dark switch changes the colours', before !== after);
    ok('all requested files load (no 4xx)', p.bad.length === 0);
    await p.context().close();

    // --- widths with filled-in and cleared state, layout and overlaps ---
    const widths = [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920];
    for (const theme of ['dark', 'light']) {
        for (const w of widths) {
            p = await load(b, { width: w, height: 900 }, { theme });
            for (const st of ['filled', 'cleared']) {
                if (st === 'filled') { await p.click('#demo'); await box(p, 0).getByText('+ It is a multipack or multi-buy (optional)').click(); await box(p, 0).locator('input[id^=count-]').fill('1'); await box(p, 2).locator('select').selectOption('l'); }
                else await p.click('#restart');
                const r = await p.evaluate(() => {
                    const out = { scroll: document.documentElement.scrollWidth > innerWidth + 1, overlap: [], ctrl: [], place: [] };
                    for (const pos of [0, 0.5, 1]) {
                        window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * pos);
                        document.querySelectorAll('main, .app, .col-side, .col-main').forEach(h => { const k = [...h.children].filter(c => c.getBoundingClientRect().height > 4 && getComputedStyle(c).display !== 'none');
                            for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { const a = k[i].getBoundingClientRect(), b = k[j].getBoundingClientRect(); if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2) out.overlap.push(k[i].className + '/' + k[j].className); } });
                    }
                    const c = [...document.querySelectorAll('input, select, button')].filter(e => e.getBoundingClientRect().width > 0);
                    for (let i = 0; i < c.length; i++) for (let j = i + 1; j < c.length; j++) { const a = c[i].getBoundingClientRect(), b = c[j].getBoundingClientRect(); if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2) out.ctrl.push(c[i].id + '/' + c[j].id); }
                    // placeholders fit their boxes
                    document.querySelectorAll('input[placeholder]').forEach(i => { const s = getComputedStyle(i), cv = document.createElement('canvas').getContext('2d'); cv.font = s.fontSize + ' ' + s.fontFamily; const room = i.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight); if (cv.measureText(i.placeholder).width > room + 1) out.place.push(i.id + ' ' + i.placeholder); });
                    out.out = [...document.querySelectorAll('main *')].filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.right > innerWidth + 1 || r.left < -1); }).slice(0, 2).map(e => e.className || e.tagName);
                    return out;
                });
                ok(`${theme} ${w}px ${st}: no horizontal scroll, nothing sticks out, no overlaps, placeholders fit`, !r.scroll && !r.out.length && !r.overlap.length && !r.ctrl.length && !r.place.length || console.log(JSON.stringify(r)));
            }
            if ([320, 390, 820, 1280].includes(w) && theme === 'dark') {
                await p.evaluate(() => scrollTo(0, 0));
                await p.click('.help-btn');
                const d = await p.locator('dialog.help').boundingBox();
                ok(`${w}px Help opens fully on screen with its title`, d && d.x >= 0 && d.y >= 0 && d.x + d.width <= w && d.y + d.height <= 900 && (await p.locator('dialog.help h2').textContent()).includes('Unit Price Calculator'));
                await p.keyboard.press('Escape'); const closed1 = !await p.locator('dialog.help').evaluate(e => e.open);
                await p.click('.help-btn'); await p.click('.help-close'); const closed2 = !await p.locator('dialog.help').evaluate(e => e.open);
                const bk = await p.locator('a.back').boundingBox(), hb = await p.locator('.help-btn').boundingBox(), tt = await p.locator('.theme-toggle').boundingBox();
                ok(`${w}px Escape and Got it close Help; top bar on one line`, closed1 && closed2 && Math.abs(bk.y - hb.y) < 4 && Math.abs(hb.y - tt.y) < 4);
            }
            ok(`${theme} ${w}px no console errors`, p.errors.length === 0 || console.log(p.errors));
            await p.context().close();
        }
    }

    // --- desktop layout really uses its width ---
    p = await load(b, { width: 1280, height: 900 });
    await p.click('#demo');
    const a = await p.locator('.col-main').boundingBox(), s = await p.locator('.col-side').boundingBox();
    ok('desktop: packs on the left, answer on the right, side by side', a.x < s.x && Math.abs(a.y - s.y) < 4 && a.width + s.width > 1000);
    if (shots) {
        await p.evaluate(() => scrollTo(0, 0));
        await p.screenshot({ path: path.join(__dirname, 'screenshots/desktop.png') });
    }
    await p.context().close();
    if (shots) {
        p = await load(b, { width: 390, height: 844 });
        await p.click('#demo');
        const rb = await p.evaluate(() => { const r = document.getElementById('result').getBoundingClientRect(); return r.bottom + scrollY + 16; });
        await p.screenshot({ path: path.join(__dirname, 'screenshots/phone.png'), fullPage: true, clip: { x: 0, y: 0, width: 390, height: Math.ceil(rb) } });
        await p.context().close();
    }
    await b.close(); if (srv) srv.close();
    console.log(fail ? '\n' + fail + ' FAILED' : '\nALL UI TESTS PASSED');
    process.exit(fail ? 1 : 0);
})();
