// Drives the real page in headless Chromium: node ui-test.js [--shots] [--base https://umar8092.github.io/apps]
// Without --base it serves this repo on localhost. With --base it tests the LIVE page. The clock is Tue 20 Oct 2026, 08:30.
const pw = (() => { for (const m of ['playwright', 'playwright-core']) { try { return require(m); } catch (e) { /* next */ } } throw new Error('playwright not found'); })();
const path = require('path'), fs = require('fs'), http = require('http');
const bi = process.argv.indexOf('--base');
const shots = process.argv.includes('--shots');
let fail = 0, url;
const ok = (name, cond, extra) => { if (!cond) fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond || extra == null ? '' : '  -> ' + JSON.stringify(extra))); };
const NOW = new Date(2026, 9, 20, 8, 30).getTime();
const SLUG = 'milk-and-daily-delivery-log-with-monthly-bill', KEY = SLUG + '.state';

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

// the README situation: milk (price up on 16 Oct, not delivered 5 and 12 Oct, 3 litres on 17 Oct), the newspaper and water cans on Mon and Thu
function seed() {
    const all = [0, 1, 2, 3, 4, 5, 6];
    const base = (id, name, unit, start, q, p) => ({ id, name, unit, mode: 'daily', wd: all, start, stop: '', seller: '', phone: '', open: 0, plans: [{ from: start, q, p }], ch: {}, pauses: [], pay: {} });
    const milk = base('milk', 'Milk', 'litre', '2026-09-01', 2000, 22000);
    milk.seller = 'Ahmed'; milk.phone = '+92 300 1234567';
    milk.plans.push({ from: '2026-10-16', q: 2000, p: 23000 });
    milk.ch = { '2026-10-05': 0, '2026-10-12': 0, '2026-10-17': 3000 };
    milk.pay = { '2026-09': [{ id: 'p1', d: '2026-10-02', c: 1320000 }] };
    const news = base('news', 'Newspaper', 'copy', '2026-09-01', 1000, 4000);
    news.ch = { '2026-10-09': 0 }; news.pay = { '2026-09': [{ id: 'p2', d: '2026-10-02', c: 120000 }] };
    const water = base('water', 'Water cans', 'can', '2026-10-01', 1000, 12000);
    water.mode = 'week'; water.wd = [1, 4]; water.ch = { '2026-10-10': 2000 }; water.pay = { '2026-10': [{ id: 'p3', d: '2026-10-10', c: 48000 }] };
    return { v: 1, cur: '', items: [milk, news, water] };
}

async function load(b, vp, opt = {}) {
    const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: vp.width < 500 ? 2 : 1, colorScheme: opt.theme || 'dark', locale: 'en-GB',
        permissions: ['clipboard-read', 'clipboard-write'], acceptDownloads: true, serviceWorkers: 'block' });
    await ctx.route(/goatcounter\.com|gc\.zgo\.at/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
    if (opt.state !== undefined) await ctx.addInitScript(([k, s]) => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem(k, s); } }, [KEY, typeof opt.state === 'string' ? opt.state : JSON.stringify(opt.state)]);
    if (opt.block) await ctx.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
    const p = await ctx.newPage();
    await p.clock.install({ time: opt.time || NOW });
    p.errors = []; p.on('console', m => m.type() === 'error' && p.errors.push(m.text())); p.on('pageerror', e => p.errors.push(String(e)));
    p.bad = []; p.on('response', r => { if (r.status() >= 400) p.bad.push(r.status() + ' ' + r.url()); });
    await p.goto(url, { waitUntil: 'networkidle' });
    return p;
}
const txt = async (p, sel) => ((await p.innerText(sel)) || '').replace(/\s+/g, ' ').trim();
const saved = p => p.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
const box = (p, id) => p.locator('#item-' + id);
const day = (p, id, n) => box(p, id).locator('button.day').filter({ has: p.locator('.dn', { hasText: new RegExp('^' + n + '$') }) });

async function main() {
    let server;
    if (bi >= 0) url = process.argv[bi + 1].replace(/\/$/, '') + '/' + SLUG + '/';
    else { server = await serve(); url = 'http://localhost:' + server.address().port + '/' + SLUG + '/'; }
    const b = await pw.chromium.launch();
    try {
        if (shots) {
            let p = await load(b, { width: 1280, height: 900 }, { state: seed() });
            await p.screenshot({ path: path.join(__dirname, 'screenshots/desktop.png') });
            p = await load(b, { width: 390, height: 844 }, { state: seed() });
            await p.evaluate(() => window.scrollTo(0, document.getElementById('item-milk').getBoundingClientRect().top + scrollY - 12));
            await p.screenshot({ path: path.join(__dirname, 'screenshots/phone.png') });
        }
        if (process.argv.includes('--look')) return await look(b);
        await tests(b);
    } finally { await b.close(); if (server) server.close(); }
    console.log(fail ? '\n' + fail + ' FAILED' : '\nALL UI TESTS PASSED');
    process.exitCode = fail ? 1 : 0;
}

// review pictures for a person to look at (not used by the tests)
async function look(b) {
    const out = process.argv[process.argv.indexOf('--look') + 1];
    let p = await load(b, { width: 320, height: 1400 }, { state: seed() });
    await day(p, 'milk', 17).click();
    await p.evaluate(() => window.scrollTo(0, document.getElementById('item-milk').getBoundingClientRect().top + scrollY));
    await p.screenshot({ path: out + '/p320.png' });
    p = await load(b, { width: 1280, height: 900 }, { state: seed(), theme: 'light' });
    await box(p, 'milk').locator('button:has-text("Record a payment")').click();
    await p.screenshot({ path: out + '/light.png', fullPage: true });
    p = await load(b, { width: 390, height: 1500 });
    await p.screenshot({ path: out + '/empty.png' });
}
async function tests(b) {
    // ---- first use: empty state, add milk with the quick pick, optional fields not forced
    let p = await load(b, { width: 390, height: 844 });
    ok('empty: month box hidden', await p.locator('#month').isHidden());
    ok('empty: no delivery boxes', await p.locator('#items').isHidden());
    ok('empty: intro and restore link shown', await p.locator('#add-intro').isVisible() && await p.locator('#restore-first').isVisible());
    ok('empty: seller and balance fields hidden (optional)', await p.locator('#f-seller-box').isHidden() && await p.locator('#f-open-box').isHidden());
    ok('start date defaults to the 1st of this month', await p.inputValue('#f-start') === '2026-10-01');
    await p.click('#f-save');
    ok('blank form: name error', (await txt(p, '#f-name-err')).includes('Type what is delivered'));
    ok('blank form: amount error', (await txt(p, '#f-qty-err')).length > 0);
    ok('blank form: price error', (await txt(p, '#f-price-err')).includes('Type the price'));
    await p.click('#quick .chip:has-text("Milk")');
    ok('quick pick fills the name', await p.inputValue('#f-name') === 'Milk');
    ok('price label follows the unit', await txt(p, '#f-price-l') === 'Price per litre');
    for (const [v, want] of [['0', 'more than 0'], ['-2', 'minus'], ['two', 'number'], ['1001', 'too much'], ['0.1255', '3 numbers']]) {
        await p.fill('#f-qty', v); await p.fill('#f-price', '220'); await p.click('#f-save');
        ok('amount "' + v + '" rejected', (await txt(p, '#f-qty-err')).includes(want), await txt(p, '#f-qty-err'));
    }
    await p.fill('#f-qty', '2');
    for (const [v, want] of [['0', 'more than 0'], ['1000001', 'too big'], ['abc', 'number'], ['-220', 'minus']]) {
        await p.fill('#f-price', v); await p.click('#f-save');
        ok('price "' + v + '" rejected', (await txt(p, '#f-price-err')).includes(want), await txt(p, '#f-price-err'));
    }
    await p.selectOption('#f-mode', 'week');
    await p.evaluate(() => document.querySelectorAll('#f-wd-row input').forEach(c => { c.checked = false; }));
    await p.fill('#f-price', '220'); await p.click('#f-save');
    ok('weekdays: none ticked is an error', (await txt(p, '#f-wd-err')).includes('Tick at least one day'));
    await p.selectOption('#f-mode', 'daily');
    ok('daily hides the weekdays', await p.locator('#f-wd').isHidden());
    await p.fill('#f-price', '2 500'); await p.click('#f-save');
    ok('pasted "2 500" price accepted', await p.locator('#item-' + (await saved(p)).items[0].id).count() === 1);
    let st = await saved(p);
    ok('saved price 2,500 in cents', st.items[0].plans[0].p === 250000 && st.items[0].plans[0].q === 2000);
    ok('seller left blank (optional)', st.items[0].seller === '' && st.items[0].open === 0);
    let id = st.items[0].id;
    ok('month box shows so far', (await txt(p, '#mo-sub')) === 'So far: 1 to 20 Oct (today).');
    ok('20 days x 2 litres', (await txt(p, '#mo-rows')).includes('40 litres, bill 100,000'));
    ok('after adding the form is cleared', await p.inputValue('#f-name') === '' && (await txt(p, '#add-h')) === 'Add a delivery');
    ok('added message with undo', (await txt(p, '#item-' + id + '-msg')).includes('Milk added') && await p.locator('#item-' + id + '-msg .undo').count() === 1);
    // edit the price back to 220 (a mistake)
    await box(p, id).locator('button:has-text("Edit")').click();
    ok('edit fills the form', await p.inputValue('#f-name') === 'Milk' && await p.inputValue('#f-price') === '2500' && (await txt(p, '#f-save')) === 'Save changes');
    await p.fill('#f-price', '220'); await p.click('#f-save');
    ok('edit saved: 40 litres x 220 = 8,800', (await txt(p, '#item-' + id + ' .bill')).includes('40 litres × 220 = 8,800'));
    // today not delivered, then it came after all
    await box(p, id).locator('button:has-text("Not delivered today")').click();
    ok('today not delivered', (await txt(p, '#item-' + id + ' .tb-t')).includes('not delivered') && (await txt(p, '#item-' + id + ' .bill')).includes('Not delivered: 20 Oct'));
    ok('bill 38 litres', (await txt(p, '#item-' + id + ' .bill')).includes('38 litres × 220 = 8,360'));
    await box(p, id).locator('button:has-text("It came after all")').click();
    ok('it came after all', (await txt(p, '#item-' + id + ' .bill')).includes('40 litres'));
    // tap 17 Oct, wrong amount, then 3 litres
    await day(p, id, 17).click();
    ok('day panel opens for Sat 17 Oct', (await txt(p, '#item-' + id + ' .dp-h')).includes('17 Oct'));
    await p.fill('#dp-q-' + id, 'abc'); await box(p, id).locator('button:has-text("Save amount")').click();
    ok('bad day amount rejected', (await txt(p, '#dp-q-' + id + '-err')).includes('number'));
    await p.fill('#dp-q-' + id, '3'); await p.press('#dp-q-' + id, 'Enter');
    ok('17 Oct is 3 litres', (await txt(p, '#item-' + id + ' .bill')).includes('Changed: 17 Oct, 3 litres (usual 2)') && (await txt(p, '#item-' + id + ' .bill')).includes('41 litres'));
    ok('changed day has a gold class', await day(p, id, 17).evaluate(e => e.classList.contains('changed')));
    // 5 Oct not delivered via the day panel, then undo, then again
    await day(p, id, 5).click(); await box(p, id).locator('.day-panel button:has-text("Not delivered")').click();
    ok('5 Oct not delivered', (await txt(p, '#item-' + id + ' .bill')).includes('Not delivered: 5 Oct'));
    await box(p, id).locator('.undo').click();
    ok('undo brings 5 Oct back', !(await txt(p, '#item-' + id + ' .bill')).includes('Not delivered'));
    await day(p, id, 5).click(); await box(p, id).locator('.day-panel button:has-text("Not delivered")').click();
    await day(p, id, 12).click(); await p.fill('#dp-q-' + id, '0'); await box(p, id).locator('button:has-text("Save amount")').click();
    ok('typing 0 means not delivered', (await txt(p, '#item-' + id + ' .bill')).includes('Not delivered: 5 Oct and 12 Oct'));
    await day(p, id, 12).click(); await box(p, id).locator('.day-panel button:has-text("As usual")').click();
    ok('As usual clears the day', (await txt(p, '#item-' + id + ' .bill')).includes('Not delivered: 5 Oct') && !(await txt(p, '#item-' + id + ' .bill')).includes('12 Oct'));
    await day(p, id, 12).click(); await box(p, id).locator('.day-panel button:has-text("Not delivered")').click();
    await day(p, id, 3).click(); await p.keyboard.press('Escape');
    ok('Escape closes the day panel', await box(p, id).locator('.day-panel').count() === 0);
    await day(p, id, 3).click(); await p.press('#dp-q-' + id, 'Escape');
    ok('day panel closed by Escape', await box(p, id).locator('.day-panel').count() === 0);
    // the price went up from 16 Oct
    await box(p, id).locator('button:has-text("Price or amount changed")').click();
    await p.fill('#pl-d-' + id, '2026-10-01');
    await box(p, id).locator('button:has-text("Save change")').click();
    ok('change on the start day is refused', (await txt(p, '#item-' + id + ' .panel')).includes('Pick a day after the start'));
    await p.fill('#pl-d-' + id, '2026-10-16'); await p.fill('#pl-p-' + id, '230');
    await box(p, id).locator('button:has-text("Save change")').click();
    let bill = await txt(p, '#item-' + id + ' .bill');
    ok('two price lines: 26 x 220 and 11 x 230', bill.includes('26 litres × 220 = 5,720 (1 Oct to 15 Oct)') && bill.includes('11 litres × 230 = 2,530 (16 Oct to 20 Oct)'), bill);
    ok('README answer: bill so far 8,250', bill.includes('Bill so far 8,250') && bill.includes('To pay: 8,250'), bill);
    ok('by month end 59 litres, 13,310', bill.includes('By 31 Oct, if nothing changes: 59 litres, bill 13,310.'), bill);
    ok('usual line shows the new price', (await txt(p, '#item-' + id + ' .i-usual')) === '2 litres every day at 230 per litre');
    ok('change listed', (await txt(p, '#item-' + id + ' .changes')).includes('From 16 Oct 2026: 2 litres at 230'));
    // payment
    await box(p, id).locator('button:has-text("Record a payment")').click();
    ok('payment prefilled with what is owed', await p.inputValue('#pp-a-' + id) === '8250');
    await p.fill('#pp-a-' + id, '-5'); await box(p, id).locator('button:has-text("Save payment")').click();
    ok('negative payment refused', (await txt(p, '#item-' + id + ' .panel')).includes('minus'));
    await p.fill('#pp-a-' + id, '8250'); await box(p, id).locator('button:has-text("Save payment")').click();
    ok('paid: nothing to pay', (await txt(p, '#item-' + id + ' .b-pay')) === 'Nothing to pay: all paid');
    ok('month box: nothing to pay', (await txt(p, '#mo-pay')) === 'Nothing to pay.');
    await box(p, id).locator('.pay-line button:has-text("Delete")').click();
    ok('payment deleted', (await txt(p, '#item-' + id + ' .b-pay')) === 'To pay: 8,250');
    await box(p, id).locator('.undo').click();
    ok('undo brings the payment back', (await txt(p, '#item-' + id + ' .b-pay')) === 'Nothing to pay: all paid');
    // next month: nothing carried, November expected
    await p.click('#mo-next');
    ok('November is expected', (await txt(p, '#mo-sub')) === 'Expected, if nothing changes.' && await p.locator('#mo-today').isVisible());
    bill = await txt(p, '#item-' + id + ' .bill');
    ok('Nov owed from before = rest of October (5,060)', bill.includes('Owed from before + 5,060'), bill);
    ok('no Today box in another month', await box(p, id).locator('.today-box').count() === 0);
    await p.click('#mo-today');
    ok('back to October', (await txt(p, '#month-h')) === 'October 2026');
    ok('Previous disabled before the first month', await p.locator('#mo-prev').isDisabled());
    // currency
    await p.selectOption('#cur', 'Rs');
    ok('currency shows Rs everywhere', (await txt(p, '#item-' + id + ' .bill')).includes('× Rs 220 = Rs 5,720') && (await txt(p, '#cur-tag')) === 'Rs');
    // reload keeps everything
    await p.reload({ waitUntil: 'networkidle' });
    ok('reload keeps the bill and currency', (await txt(p, '#item-' + id + ' .bill')).includes('Rs 5,720') && (await txt(p, '#item-' + id + ' .b-pay')) === 'Nothing to pay: all paid');
    // second delivery with weekdays, a custom unit, seller and owed from before
    await p.fill('#f-name', 'Water');
    await p.selectOption('#f-unit', 'other');
    await p.fill('#f-qty', '1'); await p.fill('#f-price', '120'); await p.click('#f-save');
    ok('custom unit needs a name', (await txt(p, '#f-ounit-err')).includes('Type the unit'));
    await p.fill('#f-ounit', 'jars');
    ok('price label uses the custom unit', (await txt(p, '#f-price-l')) === 'Price per jars');
    await p.selectOption('#f-mode', 'week');
    await p.evaluate(() => document.querySelectorAll('#f-wd-row input').forEach(c => { c.checked = c.value === '1' || c.value === '4'; }));
    await p.click('#f-seller-open'); await p.fill('#f-seller', 'Pure Water Co'); await p.fill('#f-phone', 'call me');
    await p.click('#f-open-open'); await p.selectOption('#f-open-kind', 'owe'); await p.fill('#f-open', '240');
    await p.click('#f-save');
    ok('bad phone refused', (await txt(p, '#f-phone-err')).includes('only the number'));
    await p.fill('#f-phone', '+44 7700 900123'); await p.click('#f-save');
    st = await saved(p);
    const w = st.items[1];
    ok('water saved with Mon and Thu', w && w.mode === 'week' && JSON.stringify(w.wd.sort()) === '[1,4]' && w.unit === 'jars' && w.open === 24000, w);
    bill = await txt(p, '#item-' + w.id + ' .bill');
    ok('water: Mon+Thu to 20 Oct = 6 jars, 720, plus 240 owed from before', bill.includes('6 jars × Rs 120 = Rs 720') && bill.includes('Owed from before + Rs 240') && bill.includes('To pay: Rs 960'), bill);
    ok('today (Tue) no water delivery', (await txt(p, '#item-' + w.id + ' .tb-t')).includes('no delivery today'));
    ok('seller tag shown', (await txt(p, '#item-' + w.id + ' .tag')) === 'Pure Water Co');
    const wa = await box(p, w.id).locator('a:has-text("Send on WhatsApp")').getAttribute('href');
    ok('WhatsApp goes to the seller with the bill', wa.startsWith('https://wa.me/447700900123?text=') && decodeURIComponent(wa).includes('To pay: Rs 960'));
    const mail = await box(p, w.id).locator('a:has-text("Email")').getAttribute('href');
    ok('email works with no address', mail.startsWith('mailto:?subject=') && decodeURIComponent(mail).includes('Water: October 2026'));
    // extra on a Saturday
    await day(p, w.id, 10).click(); await p.fill('#dp-q-' + w.id, '2'); await box(p, w.id).locator('button:has-text("Save amount")').click();
    ok('extra day on Sat 10 Oct', (await txt(p, '#item-' + w.id + ' .bill')).includes('Extra: 10 Oct, 2 jars'));
    // pause all deliveries 8 to 10 Oct, the water still came on the 10th
    await box(p, id).locator('button:has-text("Away? Pause deliveries")').click();
    ok('pause offers All deliveries', await p.locator('#pa-all-' + id).isChecked());
    await p.fill('#pa-f-' + id, '2026-10-10'); await p.fill('#pa-t-' + id, '2026-10-08');
    await box(p, id).locator('button:has-text("Save pause")').click();
    ok('pause backwards refused', (await txt(p, '#item-' + id + ' .panel')).includes('cannot be before'));
    await p.fill('#pa-f-' + id, '2026-10-08'); await p.fill('#pa-t-' + id, '2026-10-10');
    await box(p, id).locator('button:has-text("Save pause")').click();
    bill = await txt(p, '#item-' + id + ' .bill');
    ok('milk paused 8 to 10 Oct: 6 litres less', bill.includes('Paused (away): 8 to 10 Oct') && bill.includes('20 litres × Rs 220 = Rs 4,400'), bill);
    ok('water pause listed and the extra 10 Oct still counts', (await txt(p, '#item-' + w.id + ' .changes')).includes('Paused 8 Oct to 10 Oct 2026') && (await txt(p, '#item-' + w.id + ' .bill')).includes('Extra: 10 Oct'));
    await box(p, w.id).locator('.changes button:has-text("Delete")').click();
    ok('pause deleted for water only', await box(p, w.id).locator('.changes').count() === 0 && (await txt(p, '#item-' + id + ' .changes')).includes('Paused'));
    // copy the bill
    await box(p, id).locator('button:has-text("Copy the bill")').click();
    const clip = await p.evaluate(() => navigator.clipboard.readText());
    ok('copied bill text', clip.startsWith('Milk: October 2026\nSo far, 1 to 20 Oct:') && clip.includes('Paused (away): 8 to 10 Oct') && clip.includes('Paid: Rs 8,250'), clip);
    await p.click('#mo-copy');
    const clip2 = await p.evaluate(() => navigator.clipboard.readText());
    ok('copy all bills has both deliveries', clip2.includes('Milk: October 2026') && clip2.includes('Water: October 2026 (Pure Water Co)'));
    // print sheet
    await p.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
    ok('print sheet has a day table per delivery', await p.locator('#report table').count() === 2 && (await p.locator('#report').textContent()).includes('Deliveries: October 2026'));
    // edit: stop the water on 15 Oct, then Cancel and Escape paths
    await box(p, w.id).locator('button:has-text("Edit")').click();
    ok('edit shows the optional stop link', await p.locator('#f-stop-open').isVisible());
    await p.click('#f-stop-open'); await p.fill('#f-stop', '2026-09-01'); await p.click('#f-save');
    ok('stop before start refused', (await txt(p, '#f-stop-err')).includes('cannot be before'));
    await p.fill('#f-stop', '2026-10-15'); await p.click('#f-save');
    bill = await txt(p, '#item-' + w.id + ' .bill');
    ok('stopped after 15 Oct: 5 jars + 2 extra', (await txt(p, '#item-' + w.id + ' .i-note')).includes('Stopped after 15 Oct 2026') && bill.includes('7 jars'), bill);
    ok('no Today box after it stopped', await box(p, w.id).locator('.today-box').count() === 0);
    await box(p, w.id).locator('button:has-text("Edit")').click(); await p.press('#f-name', 'Escape');
    ok('Escape cancels editing', (await txt(p, '#add-h')) === 'Add a delivery');
    // delete with undo
    await box(p, w.id).locator('button[aria-label="Delete Water"]').click();
    ok('deleted', await p.locator('#item-' + w.id).count() === 0 && (await txt(p, '#add-msg')).includes('Water deleted'));
    await p.click('#add-msg .undo');
    ok('undo delete', await p.locator('#item-' + w.id).count() === 1);
    // backup and restore
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#backup')]);
    const file = path.join(require('os').tmpdir(), 'mdl-backup.json'); await dl.saveAs(file);
    const back = JSON.parse(fs.readFileSync(file, 'utf8'));
    ok('backup file has both deliveries', back.app === SLUG && back.data.items.length === 2);
    await p.click('#del-all');
    ok('delete everything', await p.locator('#items').isHidden() && (await txt(p, '#add-msg')).includes('Everything deleted'));
    const bad = path.join(require('os').tmpdir(), 'mdl-bad.json'); fs.writeFileSync(bad, '{"hello": 1}');
    await p.setInputFiles('#restore-file', bad);
    await p.waitForTimeout(200);
    ok('wrong file refused', (await txt(p, '#add-msg')).includes('not a backup'));
    await p.setInputFiles('#restore-file', file);
    await p.waitForTimeout(200);
    ok('restore brings both back', await p.locator('.item').count() === 2 && (await txt(p, '#add-msg')).includes('Backup restored: 2 deliveries'));
    ok('no console errors (main flow)', !p.errors.length && !p.bad.length, p.errors.concat(p.bad));
    await p.context().close();

    // ---- the README situation from saved data
    p = await load(b, { width: 1280, height: 900 }, { state: seed() });
    ok('README: to pay now 9,490', (await txt(p, '#mo-pay')) === 'To pay now: 9,490');
    ok('README: by month end 15,350', (await txt(p, '#mo-full')) === 'By 31 Oct, if nothing changes: 15,350 to pay.');
    ok('README: milk row', (await txt(p, '#mo-rows')).includes('Milk 37 litres, bill 8,250 8,250 to pay'));
    ok('README: newspaper 19 copies 760', (await txt(p, '#mo-rows')).includes('19 copies, bill 760'));
    ok('README: water 8 cans, 960, 480 to pay', (await txt(p, '#mo-rows')).includes('8 cans, bill 960 480 to pay'));
    await p.click('#mo-prev');
    ok('September: whole month, all paid', (await txt(p, '#mo-sub')) === 'The whole month.' && (await txt(p, '#mo-pay')) === 'Nothing to pay.');
    ok('September milk 60 litres x 220', (await txt(p, '#item-milk .bill')).includes('60 litres × 220 = 13,200'));
    ok('water not started in September', (await txt(p, '#item-water .i-note')).includes('Starts on 1 Oct 2026'));
    ok('September row hides water', !(await txt(p, '#mo-rows')).includes('Water'));
    ok('Previous stops at September', await p.locator('#mo-prev').isDisabled());
    for (let i = 0; i < 6; i++) if (!(await p.locator('#mo-next').isDisabled())) await p.click('#mo-next');
    ok('Next stops 3 months ahead (January 2027)', (await txt(p, '#month-h')) === 'January 2027');
    ok('no errors (README)', !p.errors.length, p.errors);
    await p.context().close();

    // ---- midnight: the page moves to the next day by itself; last day of month says whole month
    p = await load(b, { width: 390, height: 844 }, { state: seed(), time: new Date(2026, 9, 31, 23, 59, 30).getTime() });
    ok('31 Oct: whole month', (await txt(p, '#mo-sub')) === 'The whole month (today is the last day).' && (await txt(p, '#mo-full')) === '');
    await p.clock.runFor(120000);
    ok('after midnight it shows November', (await txt(p, '#month-h')) === 'November 2026' && (await txt(p, '#item-milk .tb-t')).includes('1 Nov'));
    await p.context().close();

    // ---- corrupt and blocked storage
    p = await load(b, { width: 390, height: 844 }, { state: '{not json' });
    ok('corrupt saved data: starts fresh', await p.locator('#items').isHidden() && !p.errors.length, p.errors);
    await p.context().close();
    p = await load(b, { width: 390, height: 844 }, { state: JSON.stringify({ v: 1, cur: '<img>', items: [{ start: '2026-10-01', plans: [{ from: '2026-10-01', q: 1000, p: 100 }], name: '<b>x</b>', ch: { 'x': 5 } }, { junk: true }] }) });
    ok('odd saved data cleaned; names shown as text', (await p.locator('.i-name').textContent()) === '<b>x</b>' && await p.locator('.item').count() === 1);
    await p.context().close();
    p = await load(b, { width: 390, height: 844 }, { block: true });
    ok('blocked storage: warning shown', await p.locator('#store-warn').isVisible());
    await p.click('#quick .chip:has-text("Newspaper")'); await p.fill('#f-price', '40'); await p.click('#f-save');
    ok('blocked storage: app still works', (await txt(p, '.item .bill')).includes('20 copies × 40 = 800') && !p.errors.length, p.errors);
    await p.context().close();

    // ---- extreme values and long text at 320px, every panel open
    const big = seed();
    big.items[0].name = 'Morning buffalo milk from the farm shop'; big.items[0].seller = 'Muhammad Abdullah Rehman and Sons Dairy Farm';
    big.items[1].plans[0] = { from: '2026-09-01', q: 1000000, p: 100000000 };
    for (const w of [320, 360, 390]) {
        for (const what of ['day', 'pay', 'plan', 'pause', 'form']) {
            p = await load(b, { width: w, height: 800 }, { state: big, theme: w === 360 ? 'light' : 'dark' });
            if (what === 'day') await day(p, 'milk', 17).click();
            if (what === 'pay') await box(p, 'news').locator('button:has-text("Record a payment")').click();
            if (what === 'plan') await box(p, 'milk').locator('button:has-text("Price or amount changed")').click();
            if (what === 'pause') await box(p, 'milk').locator('button:has-text("Away? Pause deliveries")').click();
            if (what === 'form') { await p.click('#f-seller-open'); await p.click('#f-open-open'); await p.selectOption('#f-mode', 'week'); await p.selectOption('#f-unit', 'other'); }
            const r = await p.evaluate(() => {
                const out = [];
                if (document.documentElement.scrollWidth > innerWidth) out.push('horizontal scroll ' + document.documentElement.scrollWidth);
                const els = [...document.querySelectorAll('main input:not([type=file]):not([type=checkbox]), main select, main button, main a.secondary, main .wd-chip')].filter(e => e.offsetParent && !e.closest('.report'));
                els.forEach(e => { const r = e.getBoundingClientRect(); if (r.right > innerWidth + 1 || r.left < -1) out.push('sticks out: ' + (e.id || e.textContent.trim().slice(0, 20))); });
                for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
                    if (els[i].contains(els[j]) || els[j].contains(els[i])) continue;
                    const a = els[i].getBoundingClientRect(), c = els[j].getBoundingClientRect();
                    if (Math.min(a.right, c.right) - Math.max(a.left, c.left) > 1 && Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top) > 1) out.push('overlap: ' + (els[i].id || els[i].textContent.trim().slice(0, 15)) + ' / ' + (els[j].id || els[j].textContent.trim().slice(0, 15)));
                }
                // placeholders must fit
                document.querySelectorAll('main input[placeholder]').forEach(e => { if (!e.offsetParent) return; const c = document.createElement('canvas').getContext('2d'); const cs = getComputedStyle(e); c.font = cs.fontSize + ' ' + cs.fontFamily; const need = c.measureText(e.placeholder).width + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight); if (need > e.clientWidth + 1) out.push('placeholder cut: ' + e.id); });
                return out;
            });
            ok('layout ' + w + 'px with ' + what + ' open: no overlap, nothing sticks out', !r.length, r.slice(0, 5));
            ok('no errors ' + w + ' ' + what, !p.errors.length, p.errors);
            await p.context().close();
        }
    }
    p = await load(b, { width: 390, height: 844 }, { state: big });
    ok('huge amounts shown in full', (await txt(p, '#item-news .bill')).includes('19,000 copies × 1,000,000 = 19,000,000,000'));
    await p.context().close();

    // ---- light/dark switch
    p = await load(b, { width: 1280, height: 900 }, { state: seed(), theme: 'dark' });
    const bg1 = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await p.locator('.theme-toggle').click();
    const bg2 = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
    ok('theme switch changes the look', bg1 !== bg2 && await p.evaluate(() => document.documentElement.dataset.theme) === 'light');
    // desktop: two columns side by side
    const cols = await p.evaluate(() => { const a = document.querySelector('.col-a').getBoundingClientRect(), c = document.querySelector('.col-b').getBoundingClientRect(); return { a: [a.left, a.top], c: [c.left, c.top], w: document.querySelector('.app').getBoundingClientRect().width }; });
    ok('desktop: month and form left, deliveries right', cols.c[0] > cols.a[0] + 300 && Math.abs(cols.c[1] - cols.a[1]) < 2 && cols.w > 1000, cols);
    // all files the page asks for exist
    for (const f of ['favicon.svg', 'manifest.webmanifest', 'sw.js', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', '../help.js', '../theme.js', 'screenshots/desktop.png', 'screenshots/phone.png']) {
        const r = await p.request.get(url + f); ok('file ' + f + ' is 200', r.status() === 200, r.status());
    }
    await p.context().close();
}
main();
