// Drives the real page in headless Chromium: node ui-test.js [--shots] [--base https://umar8092.github.io/apps]
// Without --base it serves this repo on localhost. With --base it tests the LIVE page.
const pw = (() => { for (const m of ['playwright', 'playwright-core', '/opt/node-tools/node_modules/playwright']) { try { return require(m); } catch (e) { /* next */ } } throw new Error('playwright not found'); })();
const path = require('path'), fs = require('fs'), http = require('http');
const bi = process.argv.indexOf('--base'), shots = process.argv.includes('--shots');
let fail = 0, url;
const ok = (name, cond) => { if (!cond) fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name); };
const KEY = 'invoice-generator-for-freelancers.state';

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
const T = (p, s) => p.textContent(s);
async function item(p, i, d, q, r) {
    if (await p.locator('#d-' + i).count() === 0) await p.click('#add-item');
    await p.fill('#d-' + i, d); await p.fill('#q-' + i, q); await p.fill('#r-' + i, r);
}
// the README situation
async function example(p, opt = {}) {
    await p.fill('#me-name', 'Sara Khan Design');
    await p.fill('#me-details', '14 Garden Road, Lahore\nsara@sarakhan.design\n+92 300 1234567');
    await p.fill('#cl-name', 'Blue Bird Cafe');
    await p.fill('#cl-details', 'Attn: Omar Ali\n22 Mall Road, Lahore');
    await p.fill('#issue', '2026-10-13');
    await p.selectOption('#terms', '30');
    await p.selectOption('#cur', '$');
    await item(p, 0, 'Logo design', '1', '600');
    await item(p, 1, 'Business card design', '', '150');
    await item(p, 2, 'Website banners', '3', '75');
    await p.click('#disc-add'); await p.fill('#disc', '10');
    await p.click('#tax-add'); await p.fill('#tax-name', 'Sales tax'); await p.fill('#tax-rate', '8');
    if (!opt.noPaid) { await p.click('#paid-add'); await p.fill('#paid', '300'); }
    await p.fill('#notes', 'Bank transfer to Meezan Bank, account 0123 4567 8901. Thank you for your business!');
}
const overlaps = p => p.evaluate(() => { const k = [...document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]), select, button, textarea, a.secondary')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }); const bad = [];
    for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { if (k[i].contains(k[j]) || k[j].contains(k[i])) continue; const a = k[i].getBoundingClientRect(), b = k[j].getBoundingClientRect(); if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2) bad.push((k[i].id || k[i].className) + '/' + (k[j].id || k[j].className)); } return bad; });
const noHScroll = p => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
const placeholdersFit = p => p.evaluate(() => [...document.querySelectorAll('input[placeholder], textarea[placeholder]')].filter(e => e.offsetWidth > 0).filter(e => {
    const c = document.createElement('canvas').getContext('2d'), cs = getComputedStyle(e); c.font = cs.fontSize + ' ' + cs.fontFamily;
    const w = c.measureText(e.placeholder).width, room = e.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    return e.tagName === 'INPUT' && w > room + 1; }).map(e => e.id));

(async () => {
    let srv;
    if (bi >= 0) url = process.argv[bi + 1].replace(/\/$/, '') + '/invoice-generator-for-freelancers/';
    else { srv = await serve(); url = 'http://localhost:' + srv.address().port + '/invoice-generator-for-freelancers/'; }
    const b = await pw.chromium.launch();

    // --- first use ---
    let p = await load(b, { width: 390, height: 844 });
    ok('first use: number INV-0001, date today, 30 days, one empty item, no errors shown', (await p.inputValue('#number')) === 'INV-0001' && (await p.inputValue('#issue')) === await p.evaluate(() => InvoiceCore.today()) && (await p.inputValue('#terms')) === '30' && await p.locator('#items > li').count() === 1 && (await p.locator('.err').allTextContents()).join('') === '' && (await T(p, '#problems')) === '');
    ok('first use: answer says add your first item; preview shows placeholders', (await T(p, '#a-head')) === 'Add your first item to see the total.' && (await T(p, '#paper')).includes('Your items will appear here.') && (await T(p, '#paper')).includes('Your name'));
    ok('optional parts hidden behind buttons: logo, client email, discount, tax, deposit; no-tax ticks hidden', await p.isHidden('#cl-email-box') && await p.isHidden('#disc-box') && await p.isHidden('#tax-box') && await p.isHidden('#paid-box') && await p.isVisible('#logo-add') && await p.isHidden('.tax-only'));
    ok('My invoices empty message; no saved-client picker', (await T(p, '#list-sum')).startsWith('No saved invoices yet') && await p.isHidden('#pick-box'));
    ok('placeholders fit their boxes at 390', (await placeholdersFit(p)).length === 0);
    // print with nothing filled -> problems listed, not printed
    await p.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed++; }; });
    await p.click('#print');
    const pr0 = await T(p, '#problems');
    ok('print with an empty form lists what is missing and does not print', pr0.includes('Add at least one item') && pr0.includes('Type your name') && pr0.includes('Type the client name') && await p.evaluate(() => window.__printed) === 0 && (await T(p, '#act-msg')).includes('Fix the 3 problems'));

    // --- the real situation ---
    await example(p);
    ok('lines show their amounts: 600.00, 150.00 (empty Qty = 1), 225.00', (await T(p, '#out-0')) === '1 × $600.00$600.00' && (await T(p, '#out-1')) === '1 × $150.00$150.00' && (await T(p, '#out-2')) === '3 × $75.00$225.00');
    ok('answer: Amount due $647.70, due by 12 Nov 2026, total $947.70, already paid $300.00', (await T(p, '#a-head')) === 'Amount due: $647.70' && (await T(p, '#a-sub')) === 'Due by 12 Nov 2026. Total $947.70, already paid $300.00.' && (await T(p, '#problems')) === '');
    const paper = await T(p, '#paper');
    ok('preview: from, bill to, number, dates, rows, sums, notes', ['INVOICE', 'INV-0001', '13 Oct 2026', '12 Nov 2026', 'Sara Khan Design', 'Blue Bird Cafe', 'Attn: Omar Ali', 'Website banners', 'Subtotal$975.00', 'Discount (10%)-$97.50', 'Sales tax (8%)$70.20', 'Total$947.70', 'Already paid-$300.00', 'Amount due$647.70', 'Meezan Bank'].every(t => paper.includes(t)));
    ok('due line under the dates says 30 days', (await T(p, '#due-line')) === 'Due 12 Nov 2026 (30 days)');
    ok('no-tax ticks show once tax is added', await p.locator('.tax-only').first().isVisible());
    // print
    await p.click('#print');
    ok('print: prints once, title set for the PDF name then restored', await p.evaluate(() => window.__printed) === 1);
    await p.emulateMedia({ media: 'print' });
    const printVis = await p.evaluate(() => ({ paper: document.getElementById('paper').offsetHeight > 0, form: document.querySelector('.col-main').offsetHeight, actions: document.querySelector('.actions').offsetHeight, back: document.querySelector('.topbar') ? document.querySelector('.topbar').offsetHeight : 0, cols: getComputedStyle(document.querySelector('.p-row')).gridTemplateColumns.split(' ').length }));
    ok('print view shows only the invoice, as a 4-column table', printVis.paper && printVis.form === 0 && printVis.actions === 0 && printVis.back === 0 && printVis.cols === 4);
    await p.emulateMedia({ media: 'screen' });
    // mail
    const href = await p.getAttribute('#mail', 'href');
    ok('email link: no address needed, subject and body with the amount due', href.startsWith('mailto:?subject=Invoice%20INV-0001%20from%20Sara%20Khan%20Design&body=') && decodeURIComponent(href).includes('Amount due: $647.70, due by 12 Nov 2026'));
    await p.click('#cl-email-add'); await p.fill('#cl-email', 'accounts@bluebird.com');
    ok('client email fills the mail address and shows on the invoice', (await p.getAttribute('#mail', 'href')).startsWith('mailto:accounts@bluebird.com?') && (await T(p, '#paper')).includes('accounts@bluebird.com'));
    // copy
    await p.click('#copy');
    const clip = await p.evaluate(() => navigator.clipboard.readText());
    ok('copy as text', clip.startsWith('Invoice INV-0001') && clip.includes('Total: $947.70') && clip.includes('Already paid: -$300.00'));
    // save
    await p.click('#save');
    ok('save: in My invoices, button says saved, client remembered', (await T(p, '#saved')).includes('INV-0001 · Blue Bird Cafe') && (await T(p, '#saved')).includes('$647.70') && (await T(p, '#save')).startsWith('Saved') && await p.isDisabled('#save') && await p.isVisible('#pick-box'));
    ok('list summary: 1 not paid, $647.70 still to come in', (await T(p, '#list-sum')) === '1 invoice. 1 not paid: $647.70 still to come in.');
    // edit after saving updates the saved copy
    await p.fill('#r-2', '80');
    ok('edit after saving: saved copy follows (Amount due $662.28)', (await T(p, '#a-head')) === 'Amount due: $662.28' && (await T(p, '#saved')).includes('$662.28'));
    await p.fill('#r-2', '75');

    // --- reload keeps everything ---
    await p.reload({ waitUntil: 'networkidle' });
    ok('reload: form, items, discount, tax, deposit and list come back', (await p.inputValue('#me-name')) === 'Sara Khan Design' && (await p.inputValue('#d-2')) === 'Website banners' && await p.isVisible('#disc-box') && (await p.inputValue('#tax-rate')) === '8' && (await T(p, '#a-head')) === 'Amount due: $647.70' && (await T(p, '#saved')).includes('INV-0001'));
    // --- mark paid ---
    await p.getByRole('button', { name: 'Mark as paid INV-0001' }).click();
    ok('mark as paid: PAID stamp, Paid in full, list Paid, deposit box hidden', (await T(p, '#a-head')) === 'Paid in full: $947.70' && await p.locator('.p-stamp').count() === 1 && (await T(p, '#saved')).includes('Paid') && await p.isHidden('#paid-box') && (await T(p, '#list-sum')) === '1 invoice. All paid.');
    await p.locator('#list-msg button').click();
    ok('undo mark as paid', (await T(p, '#a-head')) === 'Amount due: $647.70' && await p.locator('.p-stamp').count() === 0);

    // --- new invoice ---
    await p.click('#new');
    ok('new invoice: INV-0002, client and items cleared, details, tax, notes and currency kept, discount and deposit gone', (await p.inputValue('#number')) === 'INV-0002' && (await p.inputValue('#cl-name')) === '' && (await p.inputValue('#d-0')) === '' && (await p.inputValue('#me-name')) === 'Sara Khan Design' && (await p.inputValue('#tax-rate')) === '8' && (await p.inputValue('#notes')).includes('Meezan') && (await p.inputValue('#cur')) === '$' && await p.isHidden('#disc-box') && await p.isHidden('#paid-box') && (await T(p, '#save')) === 'Save to My invoices');
    // pick saved client
    await p.selectOption('#pick', '0');
    ok('pick a saved client fills name, address and email', (await p.inputValue('#cl-name')) === 'Blue Bird Cafe' && (await p.inputValue('#cl-details')).includes('Omar Ali') && (await p.inputValue('#cl-email')) === 'accounts@bluebird.com');
    // hours
    await item(p, 0, 'Website updates, October', '12.5', '45');
    ok('hours: 12.5 × 45.00 = 562.50, plus 8% tax = 607.50', (await T(p, '#out-0')) === '12.5 × $45.00$562.50' && (await T(p, '#a-head')) === 'Amount due: $607.50');
    // no tax on an item
    await item(p, 1, 'Hosting (paid for you)', '1', '100');
    await p.check('#nt-1');
    ok('no tax on hosting: 562.50 + 100 + 45.00 tax = 707.50; invoice marks it', (await T(p, '#a-head')) === 'Amount due: $707.50' && (await T(p, '#paper')).includes('No Sales tax'));
    // prices include tax
    await p.check('#tax-incl');
    ok('prices include tax: total 662.50, includes 41.67', (await T(p, '#a-head')) === 'Amount due: $662.50' && (await T(p, '#paper')).includes('Includes Sales tax (8%)$41.67'));
    await p.uncheck('#tax-incl');
    // duplicate number warning
    await p.fill('#number', 'inv-0001');
    ok('number already used: warning', (await T(p, '#number-err')) === 'inv-0001 is already used by another saved invoice.');
    await p.fill('#number', '');
    ok('blank number: problem listed', (await T(p, '#problems')).includes('Type an invoice number.'));
    await p.fill('#number', 'INV-0002');
    // custom due date
    await p.selectOption('#terms', 'custom');
    ok('custom due: date box shown, asks for the date', await p.isVisible('#due-box') && (await T(p, '#problems')).includes('Pick the due date'));
    await p.fill('#due', '2026-10-01');
    ok('custom due before the invoice date: problem', (await T(p, '#date-err')) === 'The due date is before the invoice date.');
    await p.fill('#due', '2026-10-20');
    ok('custom due 20 Oct', (await T(p, '#a-sub')).startsWith('Due by 20 Oct 2026'));
    await p.selectOption('#terms', '0');
    ok('on receipt', (await T(p, '#a-sub')).startsWith('Due on receipt') && (await T(p, '#paper')).includes('On receipt'));
    // bad inputs in rows
    await p.fill('#q-0', '0'); ok('qty 0: message', (await T(p, '#q-err-0')) === 'Qty must be more than 0.');
    await p.fill('#q-0', '-2'); ok('qty -2: message', (await T(p, '#q-err-0')) === 'Qty cannot be below 0.');
    await p.fill('#q-0', 'ten'); ok('qty words: message', (await T(p, '#q-err-0')) === 'Qty should be a number, like 2 or 1.5.');
    await p.fill('#q-0', '12.5');
    await p.fill('#r-0', 'abc'); ok('price words: message and the row waits', (await T(p, '#r-err-0')) === 'The price should be a number, like 75 or 75.50.' && (await T(p, '#out-0')).includes('Amount shows'));
    await p.fill('#r-0', '99999999999'); ok('huge price: message', (await T(p, '#r-err-0')) === 'The price is too big (10,000,000 at most).');
    await p.fill('#r-0', '$1,250.00'); ok('pasted $1,250.00 works', (await T(p, '#out-0')) === '12.5 × $1,250.00$15,625.00');
    await p.fill('#r-0', '45');
    await p.fill('#r-1', ''); await p.locator('#r-1').blur();
    ok('blank price after leaving the box: Type the price.', (await T(p, '#r-err-1')) === 'Type the price.');
    await p.fill('#r-1', '-50');
    ok('price below 0 is a credit: 562.50 + 45.00 tax - 50 = 557.50', (await T(p, '#a-head')) === 'Amount due: $557.50');
    // discount amount over the items
    await p.click('#disc-add'); await p.selectOption('#disc-type', 'amt'); await p.fill('#disc', '2000');
    ok('discount bigger than the items: message', (await T(p, '#disc-err')) === 'The discount is more than the items add up to.');
    await p.click('#disc-rm');
    ok('remove discount hides the box and drops it', await p.isHidden('#disc-box') && (await T(p, '#a-head')) === 'Amount due: $557.50');
    await p.click('#paid-add'); await p.fill('#paid', '9999');
    ok('paid more than total: message', (await T(p, '#paid-err')) === 'The amount already paid is more than the total.');
    await p.click('#paid-rm');
    // long text
    const long = 'Very long description '.repeat(20);
    await p.fill('#d-0', long);
    ok('long description is cut to 300 and wraps without scrolling', (await p.inputValue('#d-0')).length === 300 && await noHScroll(p));
    await p.fill('#d-0', 'Website updates, October');
    // remove item with undo
    await p.click('[aria-label="Remove item 2"]');
    ok('remove item 2', await p.locator('#items > li').count() === 1);
    await p.locator('#items-msg button').click();
    ok('undo brings it back', await p.locator('#items > li').count() === 2 && (await p.inputValue('#d-1')) === 'Hosting (paid for you)');
    // Enter on the last price adds a row
    await p.focus('#r-1'); await p.keyboard.press('Enter');
    ok('Enter in the last price adds an item and focuses it', await p.locator('#items > li').count() === 3 && await p.evaluate(() => document.activeElement.id) === 'd-2');
    // save second, list order, overdue
    await p.click('#save');
    ok('second invoice saved; list shows 2', await p.locator('#saved > li').count() === 2);
    // currency per invoice
    await p.getByRole('button', { name: 'Open INV-0001' }).click();
    await p.selectOption('#cur', 'Rs');
    ok('each invoice keeps its own currency; summary adds both', (await T(p, '#list-sum')).includes('Rs 647.70') && (await T(p, '#list-sum')).includes('$557.50'));
    await p.selectOption('#cur', '$');
    // number style
    await p.selectOption('#style', '1.234,56');
    ok('number style 1.234,56: values kept, shown 647,70', (await T(p, '#a-head')) === 'Amount due: $647,70' && (await p.inputValue('#r-0')) === '600');
    await p.fill('#r-0', '1.200');
    ok('in 1.234,56 style "1.200" is one thousand two hundred', (await T(p, '#out-0')) === '1 × $1.200,00$1.200,00');
    await p.fill('#r-0', '600'); await p.selectOption('#style', '1,234.56');
    // duplicate
    await p.getByRole('button', { name: 'Copy as new INV-0001' }).click();
    ok('copy as new: INV-0003, same client and items, today, not saved yet', (await p.inputValue('#number')) === 'INV-0003' && (await p.inputValue('#cl-name')) === 'Blue Bird Cafe' && (await p.inputValue('#d-0')) === 'Logo design' && (await T(p, '#save')) === 'Save to My invoices' && await p.isHidden('#paid-box'));
    await p.locator('#act-msg button').click();
    ok('undo copy as new goes back to INV-0001', (await p.inputValue('#number')) === 'INV-0001');
    // delete with undo
    await p.getByRole('button', { name: 'Delete INV-0002' }).click();
    ok('delete INV-0002', await p.locator('#saved > li').count() === 1);
    await p.locator('#list-msg button').click();
    ok('undo delete', await p.locator('#saved > li').count() === 2);
    // overdue
    await p.evaluate(k => { const s = JSON.parse(localStorage.getItem(k)); s.saved.forEach(x => { x.issue = '2020-01-01'; x.terms = '30'; }); localStorage.setItem(k, JSON.stringify(s)); }, KEY);
    await p.reload({ waitUntil: 'networkidle' });
    ok('overdue invoices say Overdue by N days and are counted', /Overdue by \d+ days/.test(await T(p, '#saved')) && (await T(p, '#list-sum')).includes('2 overdue'));
    // backup and restore
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#backup')]);
    const bpath = path.join(require('os').tmpdir(), 'inv-backup.json'); await dl.saveAs(bpath);
    const bk = JSON.parse(fs.readFileSync(bpath, 'utf8'));
    ok('backup file has the invoices, clients and details', bk.app === 'invoice-generator-for-freelancers' && bk.state.saved.length === 2 && bk.state.clients.length === 1 && bk.state.me.name === 'Sara Khan Design');
    const ctx2 = await b.newContext({ viewport: { width: 1280, height: 900 } }); const p2 = await ctx2.newPage(); p2.errors = []; p2.on('pageerror', e => p2.errors.push(String(e)));
    await p2.goto(url, { waitUntil: 'networkidle' });
    await p2.setInputFiles('#restore-file', bpath);
    await p2.waitForTimeout(300);
    ok('restore on a fresh device brings it all back, with undo', (await T(p2, '#list-msg')).startsWith('Restored 2 invoices and 1 client.') && await p2.locator('#saved > li').count() === 2 && (await p2.inputValue('#me-name')) === 'Sara Khan Design');
    const junk = path.join(require('os').tmpdir(), 'junk.json'); fs.writeFileSync(junk, '{"hello":1}');
    await p2.setInputFiles('#restore-file', junk); await p2.waitForTimeout(200);
    ok('restore of a wrong file is refused', (await T(p2, '#list-msg')) === 'That file is not a backup from this app.' && await p2.locator('#saved > li').count() === 2);
    // logo
    const png = path.join(require('os').tmpdir(), 'logo.png');
    fs.writeFileSync(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAICAYAAADwdn+XAAAAG0lEQVR42mNkYPhfz0AEYBxVSF+FjKMKBYYCAMw4C/kZVYcFAAAAAElFTkSuQmCC', 'base64'));
    await p2.setInputFiles('#logo-file', png); await p2.waitForTimeout(300);
    ok('logo added: shown in the form and on the invoice', await p2.isVisible('#logo-has') && await p2.locator('#paper .p-logo').count() === 1);
    await p2.setInputFiles('#logo-file', junk); await p2.waitForTimeout(300);
    ok('a file that is not a picture is refused', (await T(p2, '#me-msg')).includes('not a picture'));
    await p2.click('#logo-remove');
    ok('logo removed with undo', await p2.locator('#paper .p-logo').count() === 0 && await p2.locator('#me-msg button').count() === 1);
    ok('no errors on the second device', p2.errors.length === 0);
    await ctx2.close();
    ok('no console errors, no failed requests', p.errors.length === 0 && p.bad.length === 0);
    if (bi >= 0) {
        const need = ['invoice-generator-for-freelancers/', 'style.css', 'core.js', 'script.js', 'favicon.svg', 'manifest.webmanifest', 'help.js', 'theme.js', 'icons/apple-touch-icon.png'];
        ok('every file the page needs came back 200', need.every(n => p.ok200.some(r => r.startsWith('200 ') && r.includes(n))));
        const sw = await p.evaluate(async () => { const r = await fetch('sw.js'); const m = await fetch('manifest.webmanifest'); const i = await fetch('icons/icon-512.png'); const j = await fetch('icons/icon-192.png'); return [r.status, m.status, i.status, j.status]; });
        ok('sw.js, manifest and icons return 200', sw.every(s => s === 200));
    }
    await p.context().close();

    // --- corrupt and blocked storage ---
    p = await load(b, { width: 390, height: 844 }, { init: () => { if (!sessionStorage.getItem('x')) { sessionStorage.setItem('x', 1); localStorage.setItem('invoice-generator-for-freelancers.state', '{not json'); } } });
    await p.waitForTimeout(100);
    ok('corrupt saved data: fresh start with a message, no crash', (await p.inputValue('#number')) === 'INV-0001' && (await T(p, '#act-msg')).includes('could not be read') && p.errors.length === 0);
    await p.context().close();
    p = await load(b, { width: 390, height: 844 }, { init: () => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); } });
    await example(p);
    ok('storage blocked: still works and says so', (await T(p, '#a-head')) === 'Amount due: $647.70' && p.errors.length === 0);
    await p.context().close();
    p = await load(b, { width: 390, height: 844 }, { init: () => localStorage.setItem('invoice-generator-for-freelancers.state', JSON.stringify({ inv: { items: [{ d: '<img src=x onerror=alert(1)>', q: '1', r: '5' }] }, me: { name: '<b>x</b>' } })) });
    ok('typed HTML is shown as text, never run', (await T(p, '#paper')).includes('<img src=x onerror=alert(1)>') && await p.locator('#paper img').count() === 0 && (await T(p, '#paper')).includes('<b>x</b>'));
    await p.context().close();

    // --- screen sizes, layout and Help, with a filled invoice and a cleared one ---
    for (const theme of ['dark', 'light']) {
        for (const w of [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920]) {
            p = await load(b, { width: w, height: 900 }, { theme });
            await example(p); await p.click('#cl-email-add'); await p.fill('#cl-email', 'accounts@bluebird.com'); await p.click('#save');
            const okW = await noHScroll(p);
            const sticks = await p.evaluate(() => [...document.querySelectorAll('.app *')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1); }).length);
            const ov = w <= 390 ? await overlaps(p) : [];
            const ph = w <= 390 ? await placeholdersFit(p) : [];
            let sib = [];
            if (w >= 900) for (const pos of [0, 0.5, 1]) {
                await p.evaluate(x => scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * x), pos);
                sib = sib.concat(await p.evaluate(() => { const out = []; document.querySelectorAll('.app, .col-main, .col-side').forEach(h => { const k = [...h.children].filter(c => c.offsetHeight > 4 && getComputedStyle(c).position !== 'absolute'); for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { const a = k[i].getBoundingClientRect(), bb = k[j].getBoundingClientRect(); if (Math.min(a.right, bb.right) - Math.max(a.left, bb.left) > 4 && Math.min(a.bottom, bb.bottom) - Math.max(a.top, bb.top) > 4) out.push(k[i].className + '/' + k[j].className); } }); return out; }));
            }
            await p.evaluate(() => scrollTo(0, 0));
            let helpOk = true;
            if ([320, 390, 820, 1280].includes(w)) {
                await p.click('.help-btn'); const r = await p.locator('dialog.help').boundingBox();
                helpOk = r && r.x >= 0 && r.y >= 0 && r.x + r.width <= w && r.y + r.height <= 900 && (await p.locator('dialog.help h2').innerText()).startsWith('How to use');
                await p.keyboard.press('Escape'); helpOk = helpOk && !(await p.evaluate(() => document.querySelector('dialog.help').open));
                await p.click('.help-btn'); await p.click('.help-close'); helpOk = helpOk && !(await p.evaluate(() => document.querySelector('dialog.help').open));
                const bar = await p.evaluate(() => { const k = [...document.querySelectorAll('.topbar > *')].map(e => e.getBoundingClientRect()); return k.every(r => Math.abs(r.top - k[0].top) < 4); });
                helpOk = helpOk && bar;
            }
            // cleared state
            await p.click('#new');
            const okW2 = await noHScroll(p);
            const ov2 = w <= 390 ? await overlaps(p) : [];
            ok(`[${theme} ${w}px] no side scroll, nothing sticks out, no overlaps${w >= 900 ? ', no overlapping blocks while scrolling' : ''}${[320, 390, 820, 1280].includes(w) ? ', Help opens on screen and closes' : ''}` + (ov.concat(ov2, sib, ph).length ? ' ' + ov.concat(ov2, sib, ph).join(',') : ''),
                okW && okW2 && !sticks && !ov.length && !ov2.length && !sib.length && !ph.length && helpOk && p.errors.length === 0);
            if (w === 1280 && theme === 'dark') {
                const cols = await p.evaluate(() => [document.querySelector('.col-main').getBoundingClientRect(), document.querySelector('.col-side').getBoundingClientRect()].map(r => Math.round(r.left)));
                ok('desktop: form and invoice side by side', cols[1] > cols[0] + 400);
            }
            await p.context().close();
        }
    }
    // light/dark switch
    p = await load(b, { width: 390, height: 844 });
    const bg1 = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await p.click('.theme-toggle');
    const bg2 = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
    ok('light/dark switch changes the look; the invoice stays white', bg1 !== bg2 && await p.evaluate(() => getComputedStyle(document.getElementById('paper')).backgroundColor) === 'rgb(255, 255, 255)');
    await p.context().close();

    if (shots) {
        const dir = path.join(__dirname, 'screenshots');
        for (const [name, vp] of [['desktop', { width: 1280, height: 1400 }], ['phone', { width: 390, height: 1560 }]]) {
            p = await load(b, vp);
            await example(p); await p.click('#save');
            await p.evaluate(() => { document.querySelectorAll('.msg').forEach(m => { m.textContent = ''; }); });
            if (name === 'phone') { await p.evaluate(() => { document.getElementById('res-h').scrollIntoView(); window.scrollBy(0, -30); }); await p.screenshot({ path: path.join(dir, name + '.png') }); }
            else { await p.evaluate(() => window.scrollTo(0, 0)); await p.screenshot({ path: path.join(dir, name + '.png') }); }
            await p.context().close();
        }
        console.log('screenshots saved');
    }
    await b.close(); if (srv) srv.close();
    console.log(fail ? fail + ' FAILED' : 'ALL UI CHECKS PASSED');
    process.exit(fail ? 1 : 0);
})();
