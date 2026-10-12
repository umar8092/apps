// Drives the real page in headless Chromium: node ui-test.js [--shots] [--base https://umar8092.github.io/apps]
// Without --base it serves this repo on localhost. With --base it tests the LIVE page. The clock is fixed at 12 Oct 2026, 10:00.
const pw = (() => { for (const m of ['playwright', 'playwright-core', '/opt/node-tools/node_modules/playwright']) { try { return require(m); } catch (e) { /* next */ } } throw new Error('playwright not found'); })();
const path = require('path'), fs = require('fs'), http = require('http'), os = require('os');
const bi = process.argv.indexOf('--base');
const shots = process.argv.includes('--shots');
let fail = 0, url;
const ok = (name, cond) => { if (!cond) fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name); };
const NOW = new Date(2026, 9, 12, 10, 0);

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
    const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: vp.width < 500 ? 2 : 1, colorScheme: opt.theme || 'dark',
        permissions: ['clipboard-read', 'clipboard-write'], storageState: opt.state, acceptDownloads: true });
    if (opt.init) await ctx.addInitScript(opt.init);
    const p = await ctx.newPage();
    if (opt.install) await p.clock.install({ time: opt.install }); else await p.clock.setFixedTime(NOW);
    p.errors = []; p.on('console', m => m.type() === 'error' && p.errors.push(m.text())); p.on('pageerror', e => p.errors.push(String(e)));
    p.bad = []; p.on('response', r => { if (r.status() >= 400) p.bad.push(r.status() + ' ' + r.url()); });
    await p.goto(url, { waitUntil: 'networkidle' });
    return p;
}
const txt = (p, sel) => p.textContent(sel);
const catInput = (p, name, kind) => p.locator('.cat-edit:not(.gone)', { has: p.locator('input[id^=cn-]', { hasText: '' }) }).filter({ has: p.locator(`input[id^=cn-][value="${name}"]`) }).locator(kind === 'name' ? 'input[id^=cn-]' : 'input[id^=cb-]');
async function setBudget(p, name, v) {
    const id = await p.evaluate(n => [...document.querySelectorAll('input[id^=cn-]')].find(i => i.value === n).id.slice(3), name);
    await p.fill('#cb-' + id, v);
}
async function add(p, amount, cat, date, note, refund) {
    if (refund) await p.check('#k-refund');
    await p.fill('#f-amount', amount);
    if (date) await p.fill('#f-date', date);
    if (cat) await p.selectOption('#f-cat', { label: cat });
    if (note) { if (await p.isVisible('#open-note')) await p.click('#open-note'); await p.fill('#f-note', note); }
    await p.press('#f-amount', 'Enter');
}
const entry = (p, note) => p.locator('.entry:not(.gone)', { has: p.locator('.what', { hasText: new RegExp('^' + note + '$') }) });

// The README month, typed through the form
async function situation(p) {
    for (const [n, v] of [['Groceries', '400'], ['Eating out', '150'], ['Transport', '120'], ['Home and bills', '900'], ['Shopping', '100'], ['Fun', '80']]) await setBudget(p, n, v);
    await add(p, '850', 'Home and bills', '2026-10-01', 'Rent');
    await add(p, '62.35', 'Groceries', '2026-10-02', 'Supermarket');
    await add(p, '45', 'Transport', '2026-10-03', 'Bus pass');
    await add(p, '38.50', 'Eating out', '2026-10-04', 'Pizza night');
    // a split receipt: 84.20, Home and bills 20.00, Groceries gets the rest
    await p.fill('#f-amount', '84.20'); await p.fill('#f-date', '2026-10-05'); await p.selectOption('#f-cat', { label: 'Groceries' });
    await p.click('#open-split');
    await p.selectOption('#p-cat-1', { label: 'Home and bills' }); await p.fill('#p-amt-1', '20');
    await p.click('#open-note'); await p.fill('#f-note', 'Big shop'); await p.click('#save');
    await add(p, '24', 'Fun', '2026-10-06', 'Cinema');
    await add(p, '56.80', 'Eating out', '2026-10-07', 'Birthday dinner');
    await add(p, '49.99', 'Shopping', '2026-10-08', 'Shoes');
    await add(p, '74.50', 'Shopping', '2026-10-09', 'Jacket');
    await add(p, '15', 'Shopping', '2026-10-09', 'Returned T-shirt', true);
    await add(p, '30', 'Transport', '2026-10-09', 'Fuel');
    await add(p, '71.15', 'Groceries', '2026-10-10', 'Supermarket');
    await add(p, '8.75', 'Health', '2026-10-10', 'Pharmacy');
    await add(p, '42.60', 'Eating out', '2026-10-11', 'Takeaway');
    await add(p, '12.99', 'Fun', '2026-10-11', 'Concert ticket');
    await add(p, '18.40', 'Groceries', '2026-10-12', 'Bakery and fruit');
}

async function layout(p) {
    return p.evaluate(() => {
        const W = document.documentElement.clientWidth, bad = [], inter = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
        if (document.documentElement.scrollWidth > W) bad.push('page scrolls sideways');
        document.querySelectorAll('main *').forEach(e => { const r = e.getBoundingClientRect(); if (r.width && (r.right > W + 1 || r.left < -1)) bad.push('sticks out: ' + e.tagName + '.' + e.className); });
        const vis = l => [...l].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
        [document.querySelector('main').children, document.querySelectorAll('.card'), document.querySelectorAll('.entry'), document.querySelectorAll('.cat-row'), document.querySelectorAll('.cat-edit'), document.querySelectorAll('.part'), document.querySelectorAll('#summary > *')].forEach(g => {
            const v = vis(g); for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) if (!v[i].contains(v[j]) && !v[j].contains(v[i]) && inter(v[i].getBoundingClientRect(), v[j].getBoundingClientRect())) bad.push('overlap ' + (v[i].className || v[i].tagName) + ' x ' + (v[j].className || v[j].tagName));
        });
        const c = vis(document.querySelectorAll('main input:not([type=radio]), main select, main button, main a.secondary, .entry .what, .entry .amt, .cat-row .name, .cat-row .amt'));
        for (let i = 0; i < c.length; i++) for (let j = i + 1; j < c.length; j++) if (!c[i].contains(c[j]) && !c[j].contains(c[i]) && inter(c[i].getBoundingClientRect(), c[j].getBoundingClientRect())) bad.push('controls overlap ' + (c[i].id || c[i].className || c[i].textContent) + ' / ' + (c[j].id || c[j].className || c[j].textContent));
        const cv = document.createElement('canvas').getContext('2d');
        vis(document.querySelectorAll('main input[placeholder]')).forEach(e => {
            const cs = getComputedStyle(e); cv.font = cs.fontSize + ' ' + cs.fontFamily;
            const room = e.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
            if (cv.measureText(e.placeholder).width > room + 1) bad.push('placeholder cut off: ' + e.id);
        });
        vis(document.querySelectorAll('.entry .what, .entry .amt, .cat-row .amt, .big, .kind span, .tool-grid > *, .day-h span, .month-nav h2')).forEach(e => { if (e.scrollWidth > e.clientWidth + 1) bad.push('clipped: ' + (e.id || e.className || e.textContent)); });
        return bad.slice(0, 6);
    });
}

(async () => {
    let srv;
    if (bi >= 0) url = process.argv[bi + 1].replace(/\/$/, '') + '/expense-and-budget-tracker/';
    else { srv = await serve(); url = 'http://localhost:' + srv.address().port + '/expense-and-budget-tracker/'; }
    const b = await pw.chromium.launch();

    // ---- first use and the empty state
    let p = await load(b, { width: 390, height: 860 });
    ok('first use: example button and intro shown', await p.isVisible('#demo'));
    ok('first use: Spent this month 0.00, no budget yet', (await txt(p, '#big-label')) === 'Spent this month' && (await txt(p, '#big')) === '0.00' && await p.isVisible('#go-budgets'));
    ok('first use: month is October 2026, date is today', (await txt(p, '#m-label')) === 'October 2026' && (await p.inputValue('#f-date')) === '2026-10-12');
    ok('first use: empty list and category messages', await p.isVisible('#list-empty') && await p.isVisible('#cat-empty'));
    ok('optional inputs hidden: note and split', !(await p.isVisible('#f-note')) && !(await p.isVisible('#split-box')));
    ok('8 starting categories, Other last and not deletable', (await p.$$eval('.cat-edit', e => e.length)) === 8 && (await p.locator('.cat-edit').last().locator('button').count()) === 0);

    // ---- wrong amounts
    const err = async (v, msg) => { await p.fill('#f-amount', v); await p.click('#save'); return (await txt(p, '#form-err')).includes(msg); };
    ok('blank amount refused', await err('', 'Type the amount'));
    ok('0 refused', await err('0', 'more than 0'));
    ok('negative refused and points to refund', await err('-5', 'Money back'));
    ok('words refused', await err('lunch', 'as a number'));
    ok('huge refused', await err('99999999999', 'too big'));
    await p.fill('#f-amount', '5'); await p.fill('#f-date', ''); await p.click('#save');
    ok('blank date refused', (await txt(p, '#form-err')).includes('Choose the date'));
    ok('nothing saved after the errors', (await p.$$eval('.entry', e => e.length)) === 0);

    // ---- optional not forced: amount only
    await p.fill('#f-date', '2026-10-12'); await p.fill('#f-amount', '3.20'); await p.press('#f-amount', 'Enter');
    ok('amount alone is enough (no note, no split): added to Groceries', (await txt(p, '#add-msg')).startsWith('Added 3.20 to Groceries.') && (await p.$$eval('.entry', e => e.length)) === 1);
    ok('form cleared, date kept, focus back in Amount', (await p.inputValue('#f-amount')) === '' && (await p.evaluate(() => document.activeElement.id)) === 'f-amount');
    await p.click('#add-msg button');
    ok('undo the add', (await p.$$eval('.entry', e => e.length)) === 0);
    await p.close();

    // ---- the README situation, typed in, on a laptop
    p = await load(b, { width: 1280, height: 900 });
    await situation(p);
    ok('README: 295.77 left to spend', (await txt(p, '#big-label')) === 'Left to spend' && (await txt(p, '#big')) === '295.77');
    ok('README: spent 1,454.23 of 1,750.00, 8.75 with no budget', (await txt(p, '#meta')) === 'Spent 1,454.23 of your 1,750.00 budget. Includes 8.75 in categories with no budget.');
    ok('README: 14.78 a day for 20 days', (await txt(p, '#per-day')) === 'That is 14.78 a day for the 20 days left, today included.');
    const alerts = await p.$$eval('#alerts li', e => e.map(x => x.textContent));
    ok('README alerts: Shopping over, Eating out and Home and bills nearly used', alerts.join('|') === 'Shopping is 9.49 over its 100.00 budget.|Eating out: 91% of its budget used, 12.10 left.|Home and bills: 96% of its budget used, 30.00 left.');
    const rows = await p.$$eval('.cat-row', e => e.map(x => x.querySelector('.name').textContent + '=' + x.querySelector('.amt').textContent + '=' + x.querySelector('.status b').textContent));
    ok('README by category', rows.join('|') === 'Groceries=216.10 of 400.00=183.90 left|Eating out=137.90 of 150.00=12.10 left|Transport=75.00 of 120.00=45.00 left|Home and bills=870.00 of 900.00=30.00 left|Shopping=109.49 of 100.00=9.49 over|Health=8.75=No budget|Fun=36.99 of 80.00=43.01 left');
    ok('README: 16 expenses, newest first, split shown', (await txt(p, '#list-n')) === '(16)' && (await p.locator('.entry .what').first().textContent()) === 'Bakery and fruit' && (await entry(p, 'Big shop').locator('.cats').textContent()) === 'Groceries 64.20 + Home and bills 20.00');
    ok('README: refund shown as +15.00 money back', (await entry(p, 'Returned T-shirt').locator('.amt').textContent()) === '+15.00' && (await entry(p, 'Returned T-shirt').locator('.cats').textContent()).includes('money back'));
    ok('README: day totals (Fri 9 Oct 89.50 with the refund)', (await p.$$eval('.day-h', e => e.map(x => x.textContent))).includes('Fri 9 Oct89.50'));
    ok('README: total budget line', (await txt(p, '#total-budget')) === 'Total budget: 1,750.00 a month');
    ok('no horizontal scroll or overlap at 1280 with the month filled in', (await layout(p)).length === 0);
    if (shots) {
        await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(300);
        await p.screenshot({ path: path.join(__dirname, 'screenshots/desktop.png') });
    }

    // add message warns before going over
    await add(p, '10', 'Fun', '2026-10-12', 'Bowling');
    ok('message when a category passes 80%? (Fun 46.99 of 80 is fine: no warning)', !(await txt(p, '#add-msg')).includes('left of its'));
    await add(p, '20', 'Fun', '2026-10-12', 'Escape room');
    ok('warning when a category passes 80%', (await txt(p, '#add-msg')).includes('Fun has 13.01 left of its 80.00 budget (83% used).'));
    await add(p, '20', 'Fun', '2026-10-12', 'Arcade');
    ok('warning when a category goes over', (await txt(p, '#add-msg')).includes('Fun is now 6.99 over its 80.00 budget.') && (await p.getAttribute('#add-msg', 'class')).includes('bad'));
    await p.click('#add-msg button');
    ok('undo the over-budget add', (await txt(p, '#list-n')) === '(18)');
    for (const n of ['Bowling', 'Escape room']) await entry(p, n).locator('button', { hasText: 'Delete' }).click();
    ok('back to the README month', (await txt(p, '#big')) === '295.77' && (await txt(p, '#list-n')) === '(16)');

    // filter
    await p.selectOption('#filter', { label: 'Groceries' });
    ok('filter Groceries: 4 expenses including the split, day total 64.20 for the split day', (await txt(p, '#list-n')) === '(4)' && (await p.$$eval('.day-h', e => e.map(x => x.textContent))).includes('Mon 5 Oct64.20'));
    await p.selectOption('#filter', { label: 'Health' });
    ok('filter Health: 1 expense', (await txt(p, '#list-n')) === '(1)');
    await p.selectOption('#filter', '');

    // edit, cancel, escape
    await entry(p, 'Takeaway').locator('button', { hasText: 'Edit' }).click();
    ok('edit fills the form', (await txt(p, '#form-h')) === 'Edit expense' && (await p.inputValue('#f-amount')) === '42.60' && (await p.inputValue('#f-date')) === '2026-10-11' && (await p.inputValue('#f-note')) === 'Takeaway' && await p.isVisible('#cancel-edit'));
    await p.fill('#f-amount', '40.60'); await p.click('#save');
    ok('edit saved: Eating out 135.90', (await txt(p, '#add-msg')).startsWith('Changes saved.') && (await p.$$eval('.cat-row', e => e.find(x => x.textContent.startsWith('Eating out')).querySelector('.amt').textContent)) === '135.90 of 150.00');
    ok('form back to Add an expense', (await txt(p, '#form-h')) === 'Add an expense' && (await txt(p, '#save')) === 'Add expense' && (await p.inputValue('#f-date')) === '2026-10-12');
    await p.click('#add-msg button');
    ok('undo the edit: 42.60 again', (await entry(p, 'Takeaway').locator('.amt').textContent()) === '42.60');
    await entry(p, 'Takeaway').locator('button', { hasText: 'Edit' }).click();
    await p.fill('#f-amount', '1'); await p.click('#cancel-edit');
    ok('Cancel leaves it as it was', (await entry(p, 'Takeaway').locator('.amt').textContent()) === '42.60' && (await txt(p, '#form-h')) === 'Add an expense' && (await p.inputValue('#f-amount')) === '');
    await entry(p, 'Big shop').locator('button', { hasText: 'Edit' }).click();
    ok('editing a split opens the split with its parts', await p.isVisible('#split-box') && (await p.inputValue('#p-amt-0')) === '64.20' && (await p.inputValue('#p-amt-1')) === '20.00');
    await p.press('#f-amount', 'Escape');
    ok('Escape cancels the edit', (await txt(p, '#form-h')) === 'Add an expense' && !(await p.isVisible('#split-box')));
    await entry(p, 'Returned T-shirt').locator('button', { hasText: 'Edit' }).click();
    ok('editing a refund selects Money back', await p.isChecked('#k-refund') && (await txt(p, '#amount-label')) === 'Amount back');
    await p.click('#cancel-edit');
    ok('after cancel the kind is back to Money spent', await p.isChecked('#k-spent'));

    // delete and undo
    await entry(p, 'Pharmacy').locator('button', { hasText: 'Delete' }).click();
    ok('delete: undo row in place, Health gone', (await p.isVisible('.entry.gone')) && (await txt(p, '.entry.gone span')).includes('Pharmacy, 8.75, deleted.') && !(await p.$$eval('.cat-row .name', e => e.map(x => x.textContent))).includes('Health'));
    await p.click('.entry.gone button');
    ok('undo delete: Pharmacy back', (await entry(p, 'Pharmacy').count()) === 1 && (await txt(p, '#big')) === '295.77');

    // months
    await p.click('#prev');
    ok('previous month: September 2026 is empty, back button shown', (await txt(p, '#m-label')) === 'September 2026' && await p.isVisible('#to-now') && (await txt(p, '#list-empty')) === 'No expenses in this month.');
    ok('past month: finished under budget', (await txt(p, '#per-day')) === 'This month is over. You finished 1,750.00 under budget.');
    await p.click('#to-now'); await p.click('#next');
    ok('next month: not started yet', (await txt(p, '#m-label')) === 'November 2026' && (await txt(p, '#per-day')) === 'This month has not started yet.');
    await p.click('#to-now');
    await add(p, '99.99', 'Groceries', '2026-09-28', 'Last month');
    ok('adding to another month says which month', (await txt(p, '#add-msg')).includes('It is in September 2026.') && (await txt(p, '#big')) === '295.77');

    // payday months
    await p.selectOption('#start-day', '25');
    ok('month from the 25th: 25 Sep – 24 Oct 2026', (await txt(p, '#m-label')) === '25 Sep – 24 Oct 2026' && (await txt(p, '#cat-msg')).includes('25 Sep – 24 Oct 2026'));
    ok('payday month: 13 days left, last month\'s 99.99 now counted', (await txt(p, '#per-day')).includes('13 days left') && (await txt(p, '#meta')).startsWith('Spent 1,554.22'));
    await p.selectOption('#start-day', '1');

    // split errors
    await p.fill('#f-amount', '80'); await p.click('#open-split');
    ok('split status before amounts', (await txt(p, '#split-status')).includes('Leave one part empty'));
    await p.fill('#p-amt-0', '60');
    ok('split: empty part gets the rest 20.00', (await txt(p, '#split-status')) === 'Part 2 gets the rest: 20.00.');
    await p.fill('#p-amt-1', '10');
    ok('split short: 10.00 still to assign', (await txt(p, '#split-status')).includes('10.00 still to assign'));
    await p.click('#save');
    ok('split short refused on save', (await txt(p, '#form-err')).includes('10.00 still to assign'));
    await p.fill('#p-amt-1', '30');
    ok('split over: 10.00 more than 80.00', (await txt(p, '#split-status')).includes('10.00 more than 80.00'));
    await p.click('#add-part'); await p.fill('#p-amt-1', '');
    ok('split two empty parts refused', (await txt(p, '#split-status')).includes('Leave only one part empty'));
    ok('third part has a Remove button', (await p.locator('.part button', { hasText: 'Remove' }).count()) === 3);
    await p.locator('.part button', { hasText: 'Remove' }).nth(2).click();
    await p.click('#close-split');
    ok('Do not split goes back to one category', await p.isVisible('#f-cat') && !(await p.isVisible('#split-box')));
    await p.fill('#f-amount', '');

    // categories: rename, duplicate, delete with undo, add
    const shopId = await p.evaluate(() => [...document.querySelectorAll('input[id^=cn-]')].find(i => i.value === 'Shopping').id.slice(3));
    await p.fill('#cn-' + shopId, 'Clothes');
    ok('rename: list and select update', (await p.$$eval('.cat-row .name', e => e.map(x => x.textContent))).includes('Clothes') && (await p.$$eval('#f-cat option', e => e.map(x => x.textContent))).includes('Clothes'));
    await p.fill('#cn-' + shopId, 'groceries');
    ok('duplicate name refused', (await p.locator('.cat-edit[data-id="' + shopId + '"] .err').textContent()).includes('already a category'));
    await p.fill('#cn-' + shopId, '');
    ok('blank name refused', (await p.locator('.cat-edit[data-id="' + shopId + '"] .err').textContent()).includes('Type a name'));
    await p.click('#f-amount');
    ok('leaving a bad name puts the old one back', (await p.inputValue('#cn-' + shopId)) === 'Clothes');
    await p.fill('#cb-' + shopId, 'abc');
    ok('bad budget refused, old budget kept', (await p.locator('.cat-edit[data-id="' + shopId + '"] .err').textContent()).includes('as a number') && (await p.$$eval('.cat-row', e => e.find(x => x.textContent.startsWith('Clothes')).querySelector('.amt').textContent)) === '109.49 of 100.00');
    await p.fill('#cb-' + shopId, '');
    ok('empty budget = no limit', (await p.$$eval('.cat-row', e => e.find(x => x.textContent.startsWith('Clothes')).querySelector('.status b').textContent)) === 'No budget');
    await p.fill('#cb-' + shopId, '100');
    await p.locator('.cat-edit[data-id="' + shopId + '"] button', { hasText: 'Delete' }).click();
    ok('delete category: 3 expenses moved to Other', (await txt(p, '.cat-edit.gone span')) === 'Clothes deleted. 3 expenses moved to Other.' && (await entry(p, 'Shoes').locator('.cats').textContent()) === 'Other');
    await p.click('.cat-edit.gone button');
    ok('undo category delete: back with its expenses and budget', (await entry(p, 'Shoes').locator('.cats').textContent()) === 'Clothes' && (await txt(p, '#big')) === '295.77');
    await p.click('#add-cat');
    ok('add a category: named New category, focused, before Other', (await p.evaluate(() => document.activeElement.value)) === 'New category' && (await p.$$eval('input[id^=cn-]', e => e.map(x => x.value))).slice(-2).join() === 'New category,Other');
    await p.keyboard.type('Kids');
    ok('new category usable in the form', (await p.$$eval('#f-cat option', e => e.map(x => x.textContent))).includes('Kids'));

    // currency, copy, email, print
    await p.selectOption('#cur', '$');
    ok('currency $ on every amount and money box', (await txt(p, '#big')) === '$295.77' && (await txt(p, '.money .sym')) === '$');
    await p.click('#copy');
    const clip = await p.evaluate(() => navigator.clipboard.readText());
    ok('copy: summary text', clip.startsWith('Spending for October 2026\nSpent $1,454.23 of a $1,750.00 budget. $295.77 left.') && (await txt(p, '#tools-msg')).includes('copied'));
    const mail = await p.getAttribute('#mail', 'href');
    ok('email: mailto with no address, subject and body', mail.startsWith('mailto:?subject=Spending%20for%20October%202026&body=') && decodeURIComponent(mail).includes('$295.77 left'));
    await p.emulateMedia({ media: 'print' });
    ok('print view hides the form and buttons', !(await p.isVisible('.add-card')) && !(await p.isVisible('.entry .btns')));
    await p.emulateMedia({ media: 'screen' });

    // backup and restore
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#backup')]);
    const file = path.join(os.tmpdir(), 'ebt-backup.json'); await dl.saveAs(file);
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    ok('backup file named with the date and holds 17 expenses', dl.suggestedFilename() === 'expense-and-budget-tracker-backup-2026-10-12.json' && saved.entries.length === 17 && saved.app === 'expense-and-budget-tracker');
    await p.click('#wipe');
    ok('delete everything: empty, currency kept', (await txt(p, '#big')) === '$0.00' && (await p.$$eval('.entry', e => e.length)) === 0 && (await p.$$eval('.cat-edit', e => e.length)) === 8);
    await p.click('#tools-msg button');
    ok('undo delete everything', (await txt(p, '#big')) === '$295.77');
    await p.click('#wipe');
    await p.setInputFiles('#restore-file', file);
    await p.waitForFunction(() => document.getElementById('tools-msg').textContent.includes('restored'));
    ok('restore from backup: all back', (await txt(p, '#big')) === '$295.77' && (await txt(p, '#tools-msg')).includes('17 expenses and 9 categories'));
    const badFile = path.join(os.tmpdir(), 'ebt-bad.json'); fs.writeFileSync(badFile, '{"hello": 1}');
    await p.setInputFiles('#restore-file', badFile);
    await p.waitForFunction(() => document.getElementById('tools-msg').textContent.includes('not a backup'));
    ok('a wrong file is refused and nothing changes', (await txt(p, '#big')) === '$295.77');
    const brokenFile = path.join(os.tmpdir(), 'ebt-broken.json'); fs.writeFileSync(brokenFile, JSON.stringify({ cur: '$', cats: saved.cats, entries: saved.entries.concat([{ date: 'nope', parts: [] }, { date: '2026-10-03', parts: [{ cat: 'other', cents: -4 }] }]) }));
    await p.setInputFiles('#restore-file', brokenFile);
    await p.waitForFunction(() => document.getElementById('tools-msg').textContent.includes('left out'));
    ok('damaged expenses in a backup are left out and counted', (await txt(p, '#tools-msg')).includes('2 damaged expenses were left out') && (await txt(p, '#big')) === '$295.77');

    // reload keeps everything
    const state = await p.context().storageState();
    ok('no console errors or failed requests on the laptop run', p.errors.length === 0 && p.bad.length === 0);
    if (p.errors.length || p.bad.length) console.log(p.errors, p.bad);
    await p.close();
    p = await load(b, { width: 390, height: 860 }, { state });
    ok('reload: saved month, budgets and currency are back', (await txt(p, '#big')) === '$295.77' && (await p.inputValue('#cur')) === '$' && (await txt(p, '#list-n')) === '(16)' && !(await p.isVisible('#demo')));
    ok('phone: nothing overlaps, no sideways scroll, placeholders fit', (await layout(p)).length === 0);
    await p.close();
    if (shots) {
        p = await load(b, { width: 390, height: 860 });
        await p.click('#demo'); await p.evaluate(() => { document.getElementById('add-msg').textContent = ''; window.scrollTo(0, 0); }); await p.waitForTimeout(300);
        await p.screenshot({ path: path.join(__dirname, 'screenshots/phone.png') });
        await p.close();
    }

    // corrupt saved data, storage blocked
    p = await load(b, { width: 390, height: 860 }, { init: () => localStorage.setItem('expense-and-budget-tracker.state', '{"cats": 5, "entries": [{"date":"2026-10-01","parts":[{"cat":"x","cents":500}]}, "junk"]') });
    ok('corrupt saved data: starts fresh without errors', (await txt(p, '#big')) === '0.00' && p.errors.length === 0);
    await p.close();
    p = await load(b, { width: 390, height: 860 }, { init: () => localStorage.setItem('expense-and-budget-tracker.state', JSON.stringify({ cats: 'x', entries: [{ id: 'a', date: '2026-10-01', parts: [{ cat: 'gone', cents: 500 }] }, { date: 'bad' }] })) });
    ok('half-broken saved data: good expense kept under Other', (await txt(p, '#big')) === '5.00' && (await p.locator('.entry .what').first().textContent()) === 'Other');
    await p.close();
    p = await load(b, { width: 390, height: 860 }, { init: () => { Storage.prototype.setItem = () => { throw new Error('blocked'); }; } });
    await add(p, '5', 'Groceries');
    ok('storage blocked: still works and says it is not saving', (await txt(p, '#big')) === '5.00' && await p.isVisible('#save-warn') && (await txt(p, '#save-warn')).includes('not saving'));
    await p.close();

    // pasted very long note, keyboard only
    p = await load(b, { width: 320, height: 800 });
    await p.click('#open-note');
    await p.evaluate(() => { const i = document.getElementById('f-note'); i.focus(); });
    await p.keyboard.insertText('A very long pasted note '.repeat(20));
    await p.fill('#f-amount', '1,299.00');
    await p.keyboard.press('Enter');
    ok('pasted long note cut to 80 characters and wraps in its box; 1,299.00 read right', (await p.locator('.entry .what').first().textContent()).length <= 80 && (await txt(p, '#big')) === '1,299.00');
    await p.click('#open-split'); await p.click('#add-part'); await p.click('#open-note').catch(() => {});
    ok('320px with split parts open: no overlap or sideways scroll', (await layout(p)).length === 0);
    await p.click('#demo').catch(() => {});
    await p.close();

    // midnight while the page is open
    p = await load(b, { width: 390, height: 860 }, { install: new Date(2026, 9, 31, 23, 59, 0) });
    ok('31 Oct 23:59: October, date 31', (await txt(p, '#m-label')) === 'October 2026' && (await p.inputValue('#f-date')) === '2026-10-31');
    await p.clock.runFor(120000);
    ok('after midnight: November and the date moves to 1 Nov', (await txt(p, '#m-label')) === 'November 2026' && (await p.inputValue('#f-date')) === '2026-11-01');
    await p.close();

    // every width, both themes, filled in and empty, plus the theme switch
    for (const theme of ['dark', 'light']) {
        p = await load(b, { width: 1280, height: 900 }, { theme });
        await p.click('#demo');
        await entry(p, 'Big shop').locator('button', { hasText: 'Edit' }).click();
        const bad = [];
        for (const w of [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920]) {
            await p.setViewportSize({ width: w, height: 900 });
            for (const pos of [0, 0.5, 1]) {
                await p.evaluate(x => window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * x), pos);
                const l = await layout(p); if (l.length) bad.push(w + 'px ' + pos + ': ' + l.join(', '));
            }
        }
        ok(theme + ': 11 widths with a full month and an open split edit, no overlap or sideways scroll', bad.length === 0);
        if (bad.length) console.log(bad.slice(0, 5));
        await p.click('#cancel-edit'); await p.click('#wipe');
        const bad2 = [];
        for (const w of [320, 390, 900, 1280]) { await p.setViewportSize({ width: w, height: 900 }); const l = await layout(p); if (l.length) bad2.push(w + ': ' + l.join(', ')); }
        ok(theme + ': empty state at 4 widths fine', bad2.length === 0);
        if (bad2.length) console.log(bad2);
        const before = await p.evaluate(() => getComputedStyle(document.body).color);
        await p.click('.theme-toggle');
        ok(theme + ': light/dark switch changes the look', before !== await p.evaluate(() => getComputedStyle(document.body).color));
        ok(theme + ': no console errors', p.errors.length === 0);
        await p.close();
    }

    // files the page needs
    p = await load(b, { width: 390, height: 860 });
    const files = ['favicon.svg', 'manifest.webmanifest', 'sw.js', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', '../help.js', '../theme.js', 'core.js', 'script.js', 'style.css'];
    const st = await p.evaluate(async fs => Promise.all(fs.map(f => fetch(f).then(r => r.status))), files);
    ok('every file the page uses returns 200', st.every(s => s === 200));
    await p.close();

    await b.close(); if (srv) srv.close();
    console.log('\n' + (fail ? fail + ' FAILED' : 'ALL UI CHECKS PASSED'));
    process.exit(fail ? 1 : 0);
})();
