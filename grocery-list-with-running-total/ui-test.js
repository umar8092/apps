// Drives the real page in headless Chromium: node ui-test.js [--shots] [--base https://umar8092.github.io/apps]
// Without --base it serves this repo on localhost. With --base it tests the LIVE page.
const pw = (() => { for (const m of ['playwright', 'playwright-core', '/opt/node-tools/node_modules/playwright']) { try { return require(m); } catch (e) { /* next */ } } throw new Error('playwright not found'); })();
const path = require('path'), fs = require('fs'), http = require('http');
const bi = process.argv.indexOf('--base');
const shots = process.argv.includes('--shots');
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

// The README situation: a 50.00 budget and a 12-item list, typed in the app
const LIST = [['Milk', '2', '1.29'], ['Bread', '', '1.45'], ['Eggs (12)', '', '3.20'], ['Chicken breast', '', '6.50'], ['Bananas', '1.2', '1.10'], ['Rice 5 kg', '', '8.99'],
    ['Tomatoes', '0.5', '2.80'], ['Cheddar', '', '3.75'], ['Washing-up liquid', '', '1.99'], ['Coffee', '', '5.49'], ['Apples', '6', '0.35'], ['Pasta', '3', '0.89']];
const GOT = ['Milk', 'Bread', 'Eggs (12)', 'Chicken breast', 'Bananas', 'Rice 5 kg'];

async function load(b, vp, opt = {}) {
    const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: vp.width < 500 ? 2 : 1, colorScheme: opt.theme || 'dark',
        permissions: ['clipboard-read', 'clipboard-write'], storageState: opt.state });
    if (opt.init) await ctx.addInitScript(opt.init);
    const p = await ctx.newPage();
    p.errors = []; p.on('console', m => m.type() === 'error' && p.errors.push(m.text())); p.on('pageerror', e => p.errors.push(String(e)));
    p.bad = []; p.on('response', r => { if (r.status() >= 400) p.bad.push(r.status() + ' ' + r.url()); });
    await p.goto(url, { waitUntil: 'networkidle' });
    return p;
}
const txt = (p, sel) => p.textContent(sel);
async function add(p, name, qty = '', price = '') {
    await p.fill('#f-name', name); await p.fill('#f-qty', qty); await p.fill('#f-price', price);
    await p.press('#f-price', 'Enter');
}
const row = (p, name) => p.locator('.item:not(.gone)', { has: p.locator('.i-name', { hasText: new RegExp('^' + name.replace(/[()]/g, '\\$&') + '$') }) });
const tick = (p, name) => row(p, name).locator('input[type=checkbox]').check();
const names = (p, list) => p.$$eval('#' + list + ' .i-name', e => e.map(x => x.textContent));
async function situation(p) {
    await p.click('#add-budget'); await p.fill('#budget', '50');
    for (const [n, q, pr] of LIST) await add(p, n, q, pr);
}
async function shop(p) {
    for (const n of GOT) await tick(p, n);
    await row(p, 'Chicken breast').locator('button', { hasText: 'Edit' }).click();
    await p.fill('.item.editing input[data-f=price]', '7.25'); await p.click('.item.editing button.primary');
    await add(p, 'Chocolate', '2', '2.49'); await tick(p, 'Chocolate');
}
async function layout(p) {
    return p.evaluate(() => {
        const W = document.documentElement.clientWidth, bad = [], inter = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
        if (document.documentElement.scrollWidth > W) bad.push('page scrolls sideways');
        document.querySelectorAll('main *').forEach(e => { const r = e.getBoundingClientRect(); if (r.width && (r.right > W + 1 || r.left < -1)) bad.push('sticks out: ' + e.tagName + '.' + e.className); });
        const vis = l => [...l].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
        [document.querySelector('main').children, document.querySelector('.col-main').children, document.querySelector('.col-side').children, document.querySelectorAll('.item'), document.querySelectorAll('#result > *')].forEach(g => {
            const v = vis(g); for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) if (inter(v[i].getBoundingClientRect(), v[j].getBoundingClientRect())) bad.push('overlap ' + (v[i].className || v[i].tagName) + ' x ' + (v[j].className || v[j].tagName));
        });
        const c = vis(document.querySelectorAll('main input:not([type=file]), main select, main button, main textarea, main a.secondary, .i-name, .i-total'));
        for (let i = 0; i < c.length; i++) for (let j = i + 1; j < c.length; j++) if (!c[i].contains(c[j]) && !c[j].contains(c[i]) && !(c[i].closest('label') && c[i].closest('label') === c[j].closest('label')) && inter(c[i].getBoundingClientRect(), c[j].getBoundingClientRect())) bad.push('controls overlap ' + (c[i].id || c[i].className || c[i].textContent) + ' / ' + (c[j].id || c[j].className || c[j].textContent));
        // every placeholder fits inside its box
        const cv = document.createElement('canvas').getContext('2d');
        vis(document.querySelectorAll('main input[placeholder], main textarea[placeholder]')).forEach(e => {
            const cs = getComputedStyle(e); cv.font = cs.fontSize + ' ' + cs.fontFamily;
            const room = e.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
            const widest = Math.max(...e.placeholder.split('\n').map(l => cv.measureText(l).width));
            if (widest > room + 1) bad.push('placeholder cut off: ' + e.id + ' (' + Math.round(widest) + ' > ' + Math.round(room) + ')');
        });
        // text in the item boxes and totals is not clipped
        vis(document.querySelectorAll('.i-name, .i-total, .i-line, .tiles b, .big, .budget-line, .h-sum, .item button, .tool-grid > *, .list-actions button')).forEach(e => { if (e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflow !== 'visible') bad.push('clipped: ' + (e.id || e.className)); });
        return bad.slice(0, 6);
    });
}

(async () => {
    let srv;
    if (bi > 0) url = process.argv[bi + 1].replace(/\/$/, '') + '/grocery-list-with-running-total/';
    else { srv = await serve(); url = 'http://localhost:' + srv.address().port + '/grocery-list-with-running-total/'; }
    const b = await pw.chromium.launch();

    // ---- first use: empty state
    {
        const p = await load(b, { width: 390, height: 844 });
        ok('empty: intro and "Try an example list" shown, list hidden', await p.isVisible('#demo') && await p.isHidden('#list-card'));
        ok('empty: totals 0.00 and a plain message', (await txt(p, '#r-trolley')) === '0.00' && (await txt(p, '#r-count')).includes('Your list is empty') && (await txt(p, '#alerts')).includes('Add items to see your totals'));
        ok('optional budget, tax and paste are hidden behind "+" buttons', await p.isHidden('#budget-box') && await p.isHidden('#tax-box') && await p.isHidden('#paste-box') && await p.isVisible('#add-budget') && await p.isVisible('#add-tax') && await p.isVisible('#open-paste'));
        await p.click('#save');
        ok('blank item: plain error, nothing added', (await txt(p, '#form-err')).includes('Type the item') && await p.isHidden('#list-card'));
        await add(p, 'Milk');
        ok('an item with only a name is added (budget, quantity and price not forced)', (await names(p, 'todo')).join() === 'Milk' && (await txt(p, '#form-err')) === '');
        ok('no price: shown as "no price" and a warning that the total will be higher', (await row(p, 'Milk').locator('.i-total').textContent()) === 'no price' && (await txt(p, '#alerts')).includes('1 item has no price yet'));
        ok('Enter adds and the cursor goes back to Item for the next one', await p.evaluate(() => document.activeElement.id === 'f-name' && document.getElementById('f-name').value === ''));
        ok('example button gone once the list has items', await p.isHidden('#demo'));
        console.log(p.errors.length ? 'console: ' + p.errors.join(' | ') : '');
        ok('empty state: no console errors', !p.errors.length);
        await p.context().close();
    }

    // ---- the real situation, on a phone and on a laptop
    for (const [label, vp] of [['phone', { width: 390, height: 844 }], ['desktop', { width: 1280, height: 900 }]]) {
        const p = await load(b, vp), t = s => label + ': ' + s;
        await situation(p);
        ok(t('12 items, whole list 41.44, nothing ticked'), (await txt(p, '#r-whole')) === '41.44' && (await txt(p, '#r-trolley')) === '0.00' && (await txt(p, '#r-whole-n')) === '12 items');
        ok(t('fits the 50.00 budget with 8.56 to spare'), (await txt(p, '#alerts')).includes('The whole list fits your budget, with 8.56 to spare.') && (await txt(p, '#r-budget-left')) === '50.00 left to spend of your 50.00 budget');
        ok(t('lines: 2 × 1.29 = 2.58, 1.2 × 1.10 = 1.32, 0.5 × 2.80 = 1.40'), (await row(p, 'Milk').locator('.i-total').textContent()) === '2.58' && (await row(p, 'Milk').locator('.i-line').textContent()) === '2 × 1.29'
            && (await row(p, 'Bananas').locator('.i-total').textContent()) === '1.32' && (await row(p, 'Tomatoes').locator('.i-total').textContent()) === '1.40');
        await shop(p);
        ok(t('in the trolley 29.77, still to get 17.40, whole list 47.17'), (await txt(p, '#r-trolley')) === '29.77' && (await txt(p, '#r-left')) === '17.40' && (await txt(p, '#r-whole')) === '47.17');
        ok(t('20.23 left to spend, 2.83 to spare at the end'), (await txt(p, '#r-budget-left')) === '20.23 left to spend of your 50.00 budget' && (await txt(p, '#alerts')).includes('with 2.83 to spare'));
        ok(t('7 of 13 ticked; section totals match'), (await txt(p, '#r-count')) === '7 of 13 items ticked.' && (await txt(p, '#got-sum')) === '29.77' && (await txt(p, '#todo-sum')) === '17.40' && (await txt(p, '#got-n')) === '(7)');
        ok(t('ticked items moved to In the trolley, in list order'), (await names(p, 'got')).join() === 'Milk,Bread,Eggs (12),Chicken breast,Bananas,Rice 5 kg,Chocolate');
        ok(t('edited chicken shows 7.25'), (await row(p, 'Chicken breast').locator('.i-total').textContent()) === '7.25');
        const w = await p.evaluate(() => document.getElementById('r-bar').style.width);
        ok(t('budget bar at 59.5%'), w === '59.5%');
        if (shots) {
            await p.evaluate(() => { window.scrollTo(0, 0); document.getElementById('add-msg').textContent = ''; });
            await p.screenshot({ path: path.join(__dirname, 'screenshots', label + '.png'), fullPage: true, clip: label === 'phone' ? { x: 0, y: 0, width: 390, height: 1720 } : { x: 0, y: 0, width: 1280, height: 1330 } });
        }
        await add(p, 'Wine', '', '8.99');
        ok(t('add wine 8.99: whole list 6.16 over budget, says what to leave out'), (await txt(p, '#alerts')).includes('The whole list is 6.16 over your budget. Leave out items worth 6.16 or more.'));
        for (const n of ['Tomatoes', 'Cheddar', 'Washing-up liquid', 'Coffee', 'Apples', 'Pasta', 'Wine']) await tick(p, n);
        ok(t('everything in the trolley: 6.16 over, shown in red, Still to get says so'), (await txt(p, '#r-budget-left')) === '6.16 over your 50.00 budget' && await p.$eval('#budget-view', e => e.classList.contains('over')) && await p.isVisible('#todo-empty') && (await txt(p, '#r-count')) === 'All 14 items ticked.');
        ok(t('no console errors, no failed requests'), !p.errors.length && !p.bad.length);
        if (p.errors.length || p.bad.length) console.log(p.errors, p.bad);
        await p.context().close();
    }

    // ---- every row of the use-case matrix
    {
        const p = await load(b, { width: 390, height: 844 });
        await situation(p);
        // odd inputs
        await add(p, 'Juice', '0', '1'); ok('quantity 0 refused', (await txt(p, '#form-err')) === 'How many must be more than 0.');
        await add(p, 'Juice', '-2', '1'); ok('negative quantity refused', (await txt(p, '#form-err')) === 'How many must be more than 0.');
        await add(p, 'Juice', '1000', '1'); ok('quantity over 999 refused', (await txt(p, '#form-err')) === 'How many can be up to 999.');
        await add(p, 'Juice', 'two', '1'); ok('words as quantity refused', (await txt(p, '#form-err')).includes('as a number'));
        await add(p, 'Juice', '1', '-1'); ok('negative price refused', (await txt(p, '#form-err')) === 'The price cannot be below 0.');
        await add(p, 'Juice', '1', '9999999'); ok('huge price refused', (await txt(p, '#form-err')).includes('too big'));
        await add(p, 'Juice', '1', 'abc'); ok('words as price refused', (await txt(p, '#form-err')).includes('for example 1.29'));
        ok('after errors nothing was added and the typed text is kept', (await p.$$('.item')).length === 12 && (await p.inputValue('#f-name')) === 'Juice');
        await add(p, 'Juice', '', '$1,299.00');
        ok('pasted "$1,299.00" price = 1,299.00', (await row(p, 'Juice').locator('.i-total').textContent()) === '1,299.00');
        await row(p, 'Juice').locator('button', { hasText: 'Delete' }).click();
        await add(p, 'Free sample', '', '0');
        ok('a 0 price is allowed and costs 0.00', (await row(p, 'Free sample').locator('.i-total').textContent()) === '0.00');
        await row(p, 'Free sample').locator('button', { hasText: 'Delete' }).click();
        const long = 'Organic free-range extra large brown eggs from the farm shop on the corner of the high street';
        await add(p, long, '', '4.10');
        ok('very long name is kept to 80 characters and wraps inside its box', (await row(p, long.slice(0, 80)).count()) === 1 && !(await layout(p)).length);
        await row(p, long.slice(0, 80)).locator('button', { hasText: 'Delete' }).click();
        // same item again
        await add(p, 'milk', '1', '1.29');
        ok('same item, same price: quantity added (now 3), no second line', (await row(p, 'Milk').locator('.i-line').textContent()) === '3 × 1.29' && (await p.$$('.item')).length === 12 && (await txt(p, '#add-msg')).includes('Milk was already on the list, so it is now 3.'));
        await p.click('#add-msg button');
        ok('Undo puts it back to 2', (await row(p, 'Milk').locator('.i-line').textContent()) === '2 × 1.29');
        await add(p, 'Milk', '1', '1.49');
        ok('same item, different price: its own line', (await p.locator('#todo .i-name', { hasText: /^Milk$/ }).count()) === 2);
        await p.locator('.item', { has: p.locator('.i-total', { hasText: '1.49' }) }).locator('button', { hasText: 'Delete' }).click();
        // edit, cancel, invalid edit
        await row(p, 'Bread').locator('button', { hasText: 'Edit' }).click();
        ok('Edit opens the item in place with its values', (await p.inputValue('.item.editing input[data-f=price]')) === '1.45' && (await p.inputValue('.item.editing input[data-f=qty]')) === '1');
        ok('Edit puts the cursor on the price', await p.evaluate(() => document.activeElement.dataset.f === 'price'));
        await p.fill('.item.editing input[data-f=price]', '-3'); await p.click('.item.editing button.primary');
        ok('invalid edit: plain error, still editing', (await p.textContent('.item.editing .err')) === 'The price cannot be below 0.');
        await p.click('.item.editing button.secondary');
        ok('Cancel leaves it as it was', (await row(p, 'Bread').locator('.i-total').textContent()) === '1.45' && !(await p.$('.item.editing')));
        await row(p, 'Bread').locator('button', { hasText: 'Edit' }).click();
        await p.fill('.item.editing input[data-f=qty]', '2'); await p.fill('.item.editing input[data-f=price]', ''); await p.press('.item.editing input[data-f=price]', 'Enter');
        ok('Enter saves; emptying the price makes it "no price"', (await row(p, 'Bread').locator('.i-total').textContent()) === 'no price' && (await row(p, 'Bread').locator('.i-line').textContent()) === 'How many: 2');
        await row(p, 'Bread').locator('button', { hasText: 'Edit' }).click();
        await p.fill('.item.editing input[data-f=qty]', '1'); await p.fill('.item.editing input[data-f=price]', '1.45'); await p.press('.item.editing input[data-f=price]', 'Escape');
        ok('Escape cancels the edit', (await row(p, 'Bread').locator('.i-total').textContent()) === 'no price');
        await row(p, 'Bread').locator('button', { hasText: 'Edit' }).click();
        await p.fill('.item.editing input[data-f=qty]', '1'); await p.fill('.item.editing input[data-f=price]', '1.45'); await p.click('.item.editing button.primary');
        // delete and undo
        await row(p, 'Coffee').locator('button', { hasText: 'Delete' }).click();
        ok('Delete removes it, totals drop, Undo shown where it was', (await txt(p, '#r-whole')) === '35.95' && (await p.textContent('.item.gone')).includes('Coffee deleted.'));
        await p.click('.item.gone button');
        ok('Undo brings it back in the same place', (await txt(p, '#r-whole')) === '41.44' && (await names(p, 'todo')).indexOf('Coffee') === 9);
        // tick and untick
        await tick(p, 'Milk'); await row(p, 'Milk').locator('input[type=checkbox]').uncheck();
        ok('untick moves it back to Still to get', (await names(p, 'todo'))[0] === 'Milk' && (await txt(p, '#r-trolley')) === '0.00');
        await p.focus('#todo .item input[type=checkbox]'); await p.keyboard.press('Space');
        ok('keyboard: Space ticks the item', (await names(p, 'got')).join() === 'Milk');
        // budget
        await p.fill('#budget', '0'); ok('budget 0 refused, budget view hidden', (await txt(p, '#budget-err')).includes('more than 0') && await p.isHidden('#budget-view'));
        await p.fill('#budget', 'lots'); ok('budget in words refused', (await txt(p, '#budget-err')).includes('as a number'));
        await p.fill('#budget', ''); ok('blank budget = no budget, no error', (await txt(p, '#budget-err')) === '' && await p.isHidden('#budget-view'));
        await p.fill('#budget', '40'); ok('budget 40: whole list 1.44 over', (await txt(p, '#alerts')).includes('1.44 over your budget'));
        await p.click('#remove-budget'); ok('Remove budget hides it and the "+ Set a budget" button is back', await p.isHidden('#budget-box') && await p.isVisible('#add-budget') && !(await txt(p, '#alerts')).includes('budget'));
        await p.click('#add-budget'); await p.fill('#budget', '50');
        // tax
        await p.click('#add-tax'); await p.fill('#tax', '31'); ok('tax over 30% refused', (await txt(p, '#tax-err')).includes('up to 30%'));
        await p.fill('#tax', '8.875');
        ok('8.875% tax: whole list 45.12, 4.88 to spare, says tax is included', (await txt(p, '#r-whole')) === '45.12' && (await txt(p, '#alerts')).includes('4.88 to spare') && (await txt(p, '#r-count')).includes('Includes 8.875% tax'));
        // currency
        await p.selectOption('#cur', '€');
        ok('currency € on every amount', (await txt(p, '#r-whole')) === '€45.12' && (await row(p, 'Milk').locator('.i-total').textContent()) === '€2.58' && (await p.textContent('#f-price + *, .add-card .sym')) === '€');
        // reload keeps everything
        await p.reload({ waitUntil: 'networkidle' });
        ok('reload: list, ticks, budget, tax and currency kept', (await p.$$('.item')).length === 12 && (await names(p, 'got')).join() === 'Milk' && (await p.inputValue('#budget')) === '50' && (await p.inputValue('#tax')) === '8.875' && (await p.inputValue('#cur')) === '€' && (await txt(p, '#r-whole')) === '€45.12');
        await p.click('#remove-tax'); ok('Remove tax: back to €41.44', (await txt(p, '#r-whole')) === '€41.44' && await p.isVisible('#add-tax'));
        // copy, email, print
        await p.click('#copy');
        const clip = await p.evaluate(() => navigator.clipboard.readText()).catch(() => '');
        ok('Copy list copies the list with totals', clip.startsWith('Grocery list: 12 items, €41.44 in total') && clip.includes('[x] Milk: 2 x €1.29 = €2.58') && clip.includes('Budget €50.00: €8.56 to spare') && (await txt(p, '#tools-msg')).includes('copied'));
        const href = await p.getAttribute('#mail', 'href');
        ok('Email list: mailto with no address, subject and the list', href.startsWith('mailto:?subject=Grocery%20list&body=') && decodeURIComponent(href).includes('[ ] Bread: €1.45'));
        await p.evaluate(() => { window.printed = 0; window.print = () => window.printed++; });
        await p.click('#print'); ok('Print opens the print dialog', await p.evaluate(() => window.printed === 1));
        // after the shop
        await tick(p, 'Bread');
        await p.click('#restart');
        ok('New shop with the same list: all unticked, items and prices kept', (await names(p, 'got')).length === 0 && (await p.$$('.item')).length === 12 && (await txt(p, '#r-whole')) === '€41.44' && (await txt(p, '#list-msg')).includes('kept'));
        ok('"New shop" is greyed out when nothing is ticked', await p.isDisabled('#restart'));
        await p.click('#list-msg button'); ok('Undo brings the ticks back', (await names(p, 'got')).join() === 'Milk,Bread');
        await p.click('#clear');
        ok('Delete all items empties the list, budget stays', await p.isHidden('#list-card') && (await txt(p, '#r-whole')) === '€0.00' && await p.isVisible('#budget-view') && await p.isVisible('#demo'));
        await p.click('#add-msg button'); ok('Undo brings all 12 back', (await p.$$('.item')).length === 12);
        // paste a whole list
        await p.click('#clear');
        await p.click('#open-paste');
        await p.fill('#paste', '- 2 x Milk 1.29\n[ ] Bread 1,45\n\n3) Eggs\nApples x6 - 0.35\n7 Up 1.50');
        await p.click('#paste-add');
        ok('Paste a whole list: 5 items with quantities and prices', (await names(p, 'todo')).join() === 'Milk,Bread,Eggs,Apples,7 Up' && (await txt(p, '#r-whole')) === '€7.63' && (await txt(p, '#add-msg')).startsWith('Added 5 items'));
        ok('paste box closes after adding', await p.isHidden('#paste-box') && await p.isVisible('#open-paste'));
        await p.click('#open-paste'); await p.fill('#paste', '2 x Milk 1.29\nTea'); await p.click('#paste-add');
        ok('pasting a list with something already on it adds to the quantity', (await row(p, 'Milk').locator('.i-line').textContent()) === '4 × €1.29' && (await txt(p, '#add-msg')).includes('1 already on the list'));
        await p.click('#add-msg button'); ok('Undo a paste', (await p.$$('.item')).length === 5);
        await p.click('#open-paste'); await p.fill('#paste', '  \n\n'); await p.click('#paste-add');
        ok('empty paste: plain message, nothing added', (await txt(p, '#add-msg')).includes('Nothing to add') && (await p.$$('.item')).length === 5);
        await p.click('#paste-cancel'); ok('Cancel closes the paste box', await p.isHidden('#paste-box'));
        await p.focus('#f-name');
        await p.evaluate(() => { const dt = new DataTransfer(); dt.setData('text/plain', 'Butter\nJam 2.10'); document.getElementById('f-name').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); });
        ok('pasting several lines into Item opens the paste box with them', await p.isVisible('#paste-box') && (await p.inputValue('#paste')) === 'Butter\nJam 2.10' && (await p.inputValue('#f-name')) === '');
        ok('matrix: no console errors', !p.errors.length);
        if (p.errors.length) console.log(p.errors);
        await p.context().close();
    }

    // ---- corrupt and hand-edited saved data, storage blocked
    {
        const p = await load(b, { width: 390, height: 844 }, { init: () => { try { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', 1); localStorage.setItem('grocery-list-with-running-total.state', '{"items":[{"name":"<img src=x onerror=alert(1)>","qty":2000,"price":150},{"name":""},{"name":"Bad","qty":-5,"price":"x","got":"yes"}],"budget":-9,"tax":"x","cur":"<b>"}'); } } catch (e) {} } });
        ok('edited saved data: good rows kept, bad values fixed, text shown as plain text', (await names(p, 'todo')).join() === '<img src=x onerror=alert(1)>,Bad' && (await txt(p, '#r-whole')) === '3.00' && await p.isHidden('#budget-view') && !p.errors.length);
        await p.evaluate(() => localStorage.setItem('grocery-list-with-running-total.state', '{bad json'));
        await p.reload({ waitUntil: 'networkidle' });
        ok('corrupt saved data: starts fresh with no error', await p.isHidden('#list-card') && !p.errors.length);
        await p.context().close();
        const q = await load(b, { width: 390, height: 844 }, { init: () => { Storage.prototype.setItem = function () { throw new Error('blocked'); }; } });
        await add(q, 'Milk', '', '1.29');
        ok('storage blocked: app still works and says the list is not saved', (await txt(q, '#r-whole')) === '1.29' && (await txt(q, '#tools-msg')).includes('not saving'));
        await q.context().close();
    }

    // ---- offline: after one visit the page opens with no connection
    {
        const ctx = await b.newContext(); const p = await ctx.newPage();
        await p.goto(url, { waitUntil: 'networkidle' });
        await p.evaluate(() => navigator.serviceWorker.ready);
        await p.reload({ waitUntil: 'networkidle' });
        await ctx.setOffline(true);
        await p.reload({ waitUntil: 'load' }).catch(() => {});
        ok('offline: the page still opens from the saved copy', (await p.textContent('h1').catch(() => '')) === 'Grocery List with Running Total' && await p.evaluate(() => !!window.GroceryCore));
        await ctx.close();
    }

    // ---- light/dark switch
    {
        const p = await load(b, { width: 390, height: 844 });
        const bg = () => p.evaluate(() => getComputedStyle(document.body).backgroundColor);
        const before = await bg(); await p.click('.theme-toggle');
        ok('light/dark switch changes the look and is remembered', before !== await bg() && await p.evaluate(() => localStorage.getItem('apps.theme') === 'light'));
        await p.context().close();
    }

    // ---- help at 4 widths
    for (const w of [320, 390, 820, 1280]) {
        const p = await load(b, { width: w, height: 800 });
        await p.click('.help-btn');
        const r = await p.locator('dialog.help').boundingBox();
        ok('help ' + w + 'px: opens fully on screen with its title', r && r.x >= 0 && r.y >= 0 && r.x + r.width <= w && r.y + r.height <= 800 && (await p.textContent('dialog.help h2')) === 'How to use Grocery List with Running Total');
        await p.keyboard.press('Escape'); const esc = !(await p.evaluate(() => document.querySelector('dialog.help').open));
        await p.click('.help-btn'); await p.click('.help-close'); const got = !(await p.evaluate(() => document.querySelector('dialog.help').open));
        const bar = await p.evaluate(() => { const r = [...document.querySelectorAll('.topbar > *')].map(e => e.getBoundingClientRect()); return r.every(a => Math.abs(a.top - r[0].top) < 2) && r.every((a, i) => r.every((c, j) => i === j || a.right <= c.left + 1 || c.right <= a.left + 1)); });
        ok('help ' + w + 'px: Escape and Got it close it; top bar on one line, no overlap', esc && got && bar);
        await p.context().close();
    }

    // ---- every screen size, dark and light, filled in and cleared, every optional field open
    for (const theme of ['dark', 'light']) {
        const p = await load(b, { width: 390, height: 844 }, { theme });
        await situation(p); await shop(p); await add(p, 'Birthday card');
        await p.click('#add-tax'); await p.fill('#tax', '8.25');
        await p.click('#open-paste'); await p.fill('#paste', 'Butter');
        await p.selectOption('#cur', 'CHF');
        await row(p, 'Cheddar').locator('button', { hasText: 'Edit' }).click();
        for (const state of ['filled', 'cleared']) {
            if (state === 'cleared') { await p.click('.item.editing button.secondary'); await p.click('#clear'); }
            for (const w of [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920]) {
                await p.setViewportSize({ width: w, height: 900 });
                let bad = [];
                for (const pos of w >= 900 ? [0, 0.5, 1] : [0]) {
                    await p.evaluate(x => window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * x), pos);
                    bad = bad.concat(await layout(p));
                }
                ok(theme + ' ' + state + ' ' + w + 'px: no sideways scroll, nothing sticks out, nothing overlaps, placeholders fit', !bad.length);
                if (bad.length) console.log('   ', [...new Set(bad)].join(' | '));
            }
        }
        ok(theme + ': no console errors', !p.errors.length);
        await p.context().close();
    }
    // desktop uses its width: list and totals side by side
    {
        const p = await load(b, { width: 1280, height: 900 }); await situation(p);
        const [a, c] = await p.evaluate(() => [document.querySelector('.col-main').getBoundingClientRect(), document.getElementById('result').getBoundingClientRect()].map(r => ({ l: r.left, r: r.right, t: r.top })));
        ok('desktop: list on the left and totals on the right, side by side', c.l > a.r && Math.abs(a.t - c.t) < 2 && (c.r - a.l) > 1000);
        await p.context().close();
    }

    // ---- every file the page asks for
    {
        const p = await load(b, { width: 390, height: 844 });
        const files = ['favicon.svg', 'manifest.webmanifest', 'sw.js', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', '../help.js', '../theme.js', 'core.js', 'script.js', 'style.css', 'screenshots/desktop.png', 'screenshots/phone.png'];
        const st = await p.evaluate(async fs => Promise.all(fs.map(f => fetch(f, { cache: 'no-store' }).then(r => r.status))), files);
        ok('all files load (' + files.length + ')', st.every(s => s === 200));
        if (!st.every(s => s === 200)) console.log(files.map((f, i) => f + ' ' + st[i]).join(', '));
        ok('no failed requests', !p.bad.length);
        await p.context().close();
    }

    await b.close();
    if (srv) srv.close();
    console.log(fail ? '\n' + fail + ' FAILED' : '\nALL UI CHECKS PASSED');
    process.exit(fail ? 1 : 0);
})();
