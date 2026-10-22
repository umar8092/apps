// Drives the real page in headless Chromium: node ui-test.js [--shots] [--base https://umar8092.github.io/apps]
// Without --base it serves this repo on localhost. With --base it tests the LIVE page. The clock is Fri 23 Oct 2026, 10:00.
const pw = (() => { for (const m of ['playwright', 'playwright-core']) { try { return require(m); } catch (e) { /* next */ } } throw new Error('playwright not found'); })();
const path = require('path'), fs = require('fs'), http = require('http'), os = require('os');
const bi = process.argv.indexOf('--base');
const shots = process.argv.includes('--shots');
let fail = 0, url;
const ok = (name, cond, extra) => { if (!cond) fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond || extra == null ? '' : '  -> ' + JSON.stringify(extra))); };
const NOW = new Date(2026, 9, 23, 10, 0);
const SLUG = 'shared-house-expenses-for-roommates', KEY = SLUG + '.state', UIKEY = SLUG + '.ui';
const nb = s => String(s).replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim();

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

async function newPage(browser, opts) {
    opts = opts || {};
    const ctx = await browser.newContext({ viewport: { width: opts.w || 390, height: opts.h || 900 }, deviceScaleFactor: opts.scale || 1, colorScheme: opts.scheme || 'dark' });
    if (opts.perms) await ctx.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
    await ctx.route(/gc\.zgo\.at|goatcounter/, r => r.fulfill({ status: 200, body: '' }));
    const page = await ctx.newPage();
    await page.clock.setFixedTime(NOW);
    const errors = [], bad = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('response', r => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()); });
    if (opts.state !== undefined) await page.addInitScript(([k, v]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, v); sessionStorage.setItem('seeded', '1'); } }, [KEY, opts.state]);
    if (opts.ui) await page.addInitScript(([k, v]) => localStorage.setItem(k, v), [UIKEY, opts.ui]);
    if (opts.blocked) await page.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
    await page.goto(url, { waitUntil: 'load' });
    return { ctx, page, errors, bad };
}

const PEOPLE = ['Ali', 'Sara', 'Omar', 'Hina'];
async function addPeople(page, names) { for (const n of names) { await page.fill('#new-name', n); await page.press('#new-name', 'Enter'); } }
async function tick(page, nm, on) {
    const cb = page.locator('#sel .srow', { hasText: nm }).locator('input[type=checkbox]');
    if ((await cb.isChecked()) !== on) await cb.click();
}
async function addExp(page, what, amount, by, opts) {
    opts = opts || {};
    await page.fill('#what', what); await page.fill('#amount', amount);
    await page.selectOption('#by', { label: by });
    await page.locator('.split', { hasText: opts.split === 'shares' ? 'By shares' : opts.split === 'exact' ? 'Exact amounts' : 'Equally' }).click();
    for (const n of PEOPLE) if (await page.locator('#sel .srow', { hasText: n }).count()) await tick(page, n, !(opts.untick || []).includes(n));
    for (const [n, v] of Object.entries(opts.vals || {})) await page.fill('#sel input.val[aria-label$=" ' + n + '"]', v);
    if (opts.date) await page.fill('#date', opts.date);
    await page.click('#save');
}
const text = (page, sel) => page.locator(sel).innerText().then(nb);
const trs = page => page.locator('#tlist .tr-txt').allInnerTexts().then(a => a.map(nb));
const bals = page => page.locator('#blist .brow').allInnerTexts().then(a => a.map(nb));

async function october(page) {
    await addPeople(page, PEOPLE);
    await addExp(page, 'Rent', '60,000', 'Ali', { split: 'shares', vals: { Ali: '2' }, date: '2026-10-01' });
    await addExp(page, 'Electricity', '8400', 'Sara', { date: '2026-10-05' });
    await addExp(page, 'Internet', '2000', 'Hina', { date: '2026-10-08' });
    await addExp(page, 'Groceries', '3000', 'Omar', { untick: ['Hina'], date: '2026-10-12' });
}

(async () => {
    let srv;
    if (bi > 0) url = process.argv[bi + 1].replace(/\/$/, '') + '/' + SLUG + '/';
    else { srv = await serve(); url = 'http://localhost:' + srv.address().port + '/apps/' + SLUG + '/'; }
    const browser = await pw.chromium.launch();
    try {
        // ---- first use: empty state ----
        let { ctx, page, errors, bad } = await newPage(browser, { perms: true });
        ok('empty: people hint shown', await page.locator('#people-empty').isVisible());
        ok('empty: form asks for two people', await page.locator('#need-people').isVisible() && !(await page.locator('#add-body').isVisible()));
        ok('empty: who owes whom explains', await page.locator('#owe-empty').isVisible());
        ok('empty: month list explains', await page.locator('#list-empty').isVisible());

        // ---- people ----
        await page.click('#add-person');
        ok('blank name refused', (await text(page, '#name-err')) === 'Type a name, such as Ali.');
        await addPeople(page, ['Ali']);
        ok('one person: form still waits', await page.locator('#need-people').isVisible());
        await addPeople(page, ['  ali ']);
        ok('same name refused (any case)', (await text(page, '#name-err')).startsWith('ali is already in the list'));
        await page.fill('#new-name', '');
        await addPeople(page, ['Sara', 'Omar', 'Hina']);
        ok('4 people, each in a box', (await page.locator('#plist .person').count()) === 4);
        ok('form shows with 2+ people', await page.locator('#add-body').isVisible());
        ok('everyone ticked by default', (await page.locator('#sel input[type=checkbox]:checked').count()) === 4);
        ok('optional: no currency forced, plain numbers by default', (await page.locator('#cur').inputValue()) === '' && await page.locator('#cur-tag').isHidden());

        // ---- the October situation ----
        await addExp(page, 'Rent', '60,000', 'Ali', { split: 'shares', vals: { Ali: '2' }, date: '2026-10-01' });
        ok('rent added', (await text(page, '#add-msg')).startsWith('Added: Rent: 60,000, paid by Ali.'));
        ok('split goes back to Equally after adding', await page.locator('input[name=split][value=equal]').isChecked());
        await page.fill('#what', 'Electricity'); await page.fill('#amount', '8400'); await page.selectOption('#by', { label: 'Sara' });
        ok('preview says who owes the payer', (await text(page, '#preview')) === 'Sara paid 8,400. Ali owes Sara 2,100, Omar owes Sara 2,100, Hina owes Sara 2,100.');
        ok('each row shows the share', nb(await page.locator('#sel .srow', { hasText: 'Omar' }).locator('.each').innerText()) === '2,100');
        await page.fill('#what', ''); await page.fill('#amount', '');
        await addExp(page, 'Electricity', '8400', 'Sara', { date: '2026-10-05' });
        await addExp(page, 'Internet', '2000', 'Hina', { date: '2026-10-08' });
        await addExp(page, 'Groceries', '3000', 'Omar', { untick: ['Hina'], date: '2026-10-12' });
        ok('who pays whom', JSON.stringify(await trs(page)) === JSON.stringify(['Omar pays Ali 12,600', 'Hina pays Ali 12,600', 'Sara pays Ali 7,200']), await trs(page));
        ok('balances', JSON.stringify(await bals(page)) === JSON.stringify(['Ali gets back 32,400', 'Sara owes 7,200', 'Omar owes 12,600', 'Hina owes 12,600']), await bals(page));
        ok('month total', (await text(page, '#t-total')) === '73,400' && (await text(page, '#t-count')) === '4 expenses');
        ok('by what it was for', JSON.stringify((await page.locator('#cats li').allInnerTexts()).map(nb)) === JSON.stringify(['Rent 60,000', 'Electricity 8,400', 'Groceries 3,000', 'Internet 2,000']));
        ok('each person this month', (await page.locator('#pm .pmrow').allInnerTexts()).map(nb)[0] === 'Ali share 27,600 · paid 60,000');
        ok('entries newest first, own boxes', (await page.locator('#items .item').count()) === 4 && nb(await page.locator('#items .item .i-what').first().innerText()) === 'Groceries');
        ok('groceries split words', (await page.locator('#items .item').first().innerText()).includes('Split equally between Ali, Sara, Omar: 1,000 each'));

        // ---- mistakes and odd input ----
        await page.click('#save');
        ok('blank what refused', (await text(page, '#what-err')) === 'Type or tap what it was for, such as Rent.');
        await page.click('.chip >> text=Water');
        ok('chip fills what', (await page.inputValue('#what')) === 'Water');
        for (const [v, msg] of [['', 'Type the amount, such as 2500.'], ['0', 'Type an amount more than 0.'], ['-50', 'Type the amount without a minus sign.'], ['abc', 'Type a number, such as 2500 or 12.50.'], ['99999999999', 'That amount is too big. The most is 9,999,999,999.99.']]) {
            await page.fill('#amount', v); await page.click('#save');
            ok('amount "' + v + '" refused', (await text(page, '#amount-err')) === msg, await text(page, '#amount-err'));
        }
        await page.fill('#amount', '1000');
        await page.click('#sel-none'); await page.click('#save');
        ok('nobody ticked refused', (await text(page, '#sel-err')) === 'Tick at least one person who shares this.');
        await page.click('#sel-all');
        await page.locator('.split', { hasText: 'Exact amounts' }).click();
        await page.fill('#sel input.val[aria-label="Part for Ali"]', '400');
        ok('exact: left to give out', (await text(page, '#exact-left')) === '600 left to give out.');
        await page.click('#save');
        ok('exact: blank part refused', (await text(page, '#sel-err')) === "Type Sara's part, or untick Sara.");
        await page.fill('#sel input.val[aria-label="Part for Sara"]', '300'); await page.fill('#sel input.val[aria-label="Part for Omar"]', '200'); await page.fill('#sel input.val[aria-label="Part for Hina"]', '0');
        await page.click('#save');
        ok('exact: zero part refused', (await text(page, '#sel-err')) === "Hina's part is 0. Untick Hina instead.");
        await page.fill('#sel input.val[aria-label="Part for Hina"]', '200');
        ok('exact: too much', (await text(page, '#exact-left')) === '100 too much: the parts add up to more than 1,000.');
        await page.click('#save');
        ok('exact: wrong total refused', (await text(page, '#sel-err')) === 'The parts add up to 1,100 but the amount is 1,000: 100 too much.');
        await page.fill('#sel input.val[aria-label="Part for Hina"]', '100');
        await page.selectOption('#by', { label: 'Ali' });
        await page.click('#save');
        ok('exact: saved when it adds up', (await text(page, '#add-msg')).startsWith('Added: Water: 1,000, paid by Ali.'), await text(page, '#add-msg'));
        await page.click('#add-msg .undo');
        ok('undo the add', (await page.locator('#items .item').count()) === 4 && (await text(page, '#add-msg')) === 'Undone.');

        // odd cents and only the payer
        await addExp(page, 'Cleaning', '100', 'Ali', { untick: ['Hina'], date: '2026-10-15' });
        ok('odd cents shown exactly', (await page.locator('#items .item', { hasText: 'Cleaning' }).innerText()).includes('33.34 or 33.33 each'));
        await page.click('#add-msg .undo');
        await page.fill('#what', 'Gym'); await page.fill('#amount', '500'); await page.selectOption('#by', { label: 'Sara' });
        await page.click('#sel-none'); await tick(page, 'Sara', true);
        ok('only the payer: nobody owes', (await text(page, '#preview')) === 'Only Sara shares this, so nobody owes anything for it.');
        await page.click('#sel-all'); await page.fill('#what', ''); await page.fill('#amount', '');

        // ---- edit and cancel ----
        await page.locator('#items .item', { hasText: 'Groceries' }).getByRole('button', { name: /^Edit/ }).click();
        ok('edit fills the form', (await page.inputValue('#what')) === 'Groceries' && (await page.inputValue('#amount')) === '3000' && !(await page.locator('#sel .srow', { hasText: 'Hina' }).locator('input').isChecked()));
        ok('edit buttons', (await text(page, '#save')) === 'Save changes' && await page.locator('#cancel-edit').isVisible());
        await page.fill('#amount', '9999'); await page.click('#cancel-edit');
        ok('cancel changes nothing', (await trs(page))[0] === 'Omar pays Ali 12,600');
        await page.locator('#items .item', { hasText: 'Groceries' }).getByRole('button', { name: /^Edit/ }).click();
        await page.fill('#amount', '3600'); await page.click('#save');
        ok('edit saved and balances redone', (await bals(page))[2] === 'Omar owes 12,200', await bals(page));
        await page.click('#add-msg .undo');
        ok('undo the edit', (await bals(page))[2] === 'Omar owes 12,600');

        // ---- delete and undo ----
        await page.locator('#items .item', { hasText: 'Internet' }).getByRole('button', { name: /^Delete/ }).click();
        ok('deleted', (await page.locator('#items .item').count()) === 3);
        await page.click('#list-msg .undo');
        ok('undo the delete', (await page.locator('#items .item').count()) === 4);

        // ---- people again: used person, moved out ----
        await page.getByRole('button', { name: 'Delete Hina' }).click();
        ok('used person cannot be deleted', (await text(page, '#people-msg')).startsWith('Hina is in 3 entries'), await text(page, '#people-msg'));
        await page.locator('#plist .person', { hasText: 'Hina' }).getByRole('button', { name: 'Moved out' }).click();
        ok('moved out: unticked on new costs', !(await page.locator('#sel .srow', { hasText: 'Hina' }).locator('input').isChecked()));
        ok('moved out: balance stays', (await bals(page))[3] === 'Hina (moved out) owes 12,600');
        await page.locator('#plist .person', { hasText: 'Hina' }).getByRole('button', { name: 'Moved back in' }).click();
        await page.getByRole('button', { name: 'Rename Omar' }).click();
        await page.fill('#rename-in', 'Sara'); await page.press('#rename-in', 'Enter');
        ok('rename to an existing name refused', (await page.locator('#plist .err').innerText()).includes('already in the list'));
        await page.fill('#rename-in', 'Omar Khan'); await page.press('#rename-in', 'Enter');
        ok('rename shows everywhere', (await trs(page))[0] === 'Omar Khan pays Ali 12,600');
        await page.click('#people-msg .undo');
        await addPeople(page, ['Zed']);
        await page.getByRole('button', { name: 'Delete Zed' }).click();
        ok('unused person deleted', (await page.locator('#plist .person').count()) === 4);

        // ---- payments ----
        await page.locator('.mode', { hasText: 'Money paid back' }).click();
        ok('payment mode fields', await page.locator('#from').isVisible() && await page.locator('#what').isHidden() && (await text(page, '#save')) === 'Add money paid back');
        await page.selectOption('#from', { label: 'Sara' }); await page.selectOption('#to', { label: 'Sara' }); await page.fill('#amount', '100'); await page.click('#save');
        ok('pay to yourself refused', (await text(page, '#to-err')) === 'Choose two different people.');
        await page.selectOption('#to', { label: 'Ali' }); await page.fill('#amount', '5000'); await page.click('#save');
        ok('part payment', (await bals(page))[1] === 'Sara owes 2,200');
        await page.locator('.mode', { hasText: 'Something we share' }).click();
        await page.locator('#tlist .trow', { hasText: 'Sara pays Ali 2,200' }).getByRole('button').click();
        ok('mark as paid', (await bals(page))[1] === 'Sara settled up' && (await text(page, '#owe-msg')).startsWith('Recorded: Sara paid Ali 2,200.'), [await bals(page), await text(page, '#owe-msg')]);

        // ---- share: copy ----
        await page.click('#copy');
        const clip = nb(await page.evaluate(() => navigator.clipboard.readText()).catch(() => ''));
        ok('copy summary', clip.includes('To settle up: - Omar pays Ali 12,600') && clip.includes('October 2026: spent 73,400'), clip.slice(0, 160));
        ok('email button there', await page.locator('#email').isVisible());

        // ---- reload: saved ----
        await page.reload({ waitUntil: 'load' });
        ok('reload keeps everything', (await page.locator('#plist .person').count()) === 4 && (await trs(page)).length === 2);

        // ---- currency ----
        await page.selectOption('#cur', 'Rs');
        ok('currency on amounts', (await trs(page))[0] === 'Omar pays Ali Rs 12,600');
        await page.reload({ waitUntil: 'load' });
        ok('currency remembered', (await page.inputValue('#cur')) === 'Rs');
        await page.selectOption('#cur', '');

        // ---- settle all ----
        await page.click('#pay-all');
        ok('mark all as paid', await page.locator('#settled').isVisible() && (await text(page, '#owe-msg')) === 'Recorded 2 payments. Everyone is settled up. Undo');

        // ---- months ----
        await page.click('#owe-msg .undo');
        await addExp(page, 'Rent', '60000', 'Ali', { split: 'shares', vals: { Ali: '2' }, date: '2026-11-01' });
        ok('new month opens on save', (await page.inputValue('#month')) === '2026-11' && (await text(page, '#t-total')) === '60,000');
        await page.selectOption('#month', '');
        ok('all months together', (await text(page, '#t-total')) === '1,33,400' || (await text(page, '#t-total')) === '133,400');
        await page.selectOption('#month', '2026-10');

        // ---- backup and restore ----
        const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#backup')]);
        const file = path.join(os.tmpdir(), 'house-backup.json'); await dl.saveAs(file);
        const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
        ok('backup file', saved.app === SLUG && saved.data.people.length === 4);
        await page.click('#wipe');
        ok('start over', (await page.locator('#plist .person').count()) === 0 && await page.locator('#people-empty').isVisible());
        await page.click('#tools-msg .undo');
        ok('undo start over', (await page.locator('#plist .person').count()) === 4);
        await page.click('#wipe');
        await page.setInputFiles('#restore-file', file);
        ok('restore', (await text(page, '#tools-msg')).startsWith('Backup restored: 4 people'));
        const junk = path.join(os.tmpdir(), 'junk.json'); fs.writeFileSync(junk, '{"hello":1}');
        await page.setInputFiles('#restore-file', junk);
        ok('bad backup refused', (await text(page, '#tools-msg')) === 'That file is not a Shared House Expenses backup. Nothing was changed.' && (await page.locator('#plist .person').count()) === 4);

        // ---- keyboard ----
        await page.focus('#what'); await page.keyboard.type('Gas'); await page.keyboard.press('Tab'); await page.keyboard.type('900'); await page.keyboard.press('Enter');
        ok('keyboard only: Enter adds', (await text(page, '#add-msg')).startsWith('Added: Gas: 900'), [await text(page, '#add-msg'), await text(page,'#what-err')]);
        ok('no console errors (main run)', errors.length === 0, errors);
        ok('no failed requests', bad.length === 0, bad);
        await ctx.close();

        // ---- corrupt and blocked storage ----
        ({ ctx, page, errors } = await newPage(browser, { state: '{not json' }));
        ok('corrupt saved data: starts fresh', await page.locator('#people-empty').isVisible() && errors.length === 0, errors);
        await ctx.close();
        ({ ctx, page, errors } = await newPage(browser, { state: JSON.stringify({ people: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], items: [{ id: 'x', k: 'exp', d: '2026-10-01', what: 'Rent', c: 1000, by: 'zz', split: 'equal', parts: { a: 1 } }, { id: 'y', k: 'exp', d: '2026-10-02', what: 'Gas', c: 1000, by: 'a', split: 'equal', parts: { a: 1, b: 1 } }] }) }));
        ok('half-bad saved data: keeps the good part', (await page.locator('#items .item').count()) === 1 && (await trs(page))[0] === 'B pays A 5');
        await ctx.close();
        ({ ctx, page, errors } = await newPage(browser, { blocked: true }));
        ok('storage blocked: warns, still works', await page.locator('#store-warn').isVisible() && errors.length === 0, errors);
        await addPeople(page, ['A', 'B']); await addExp(page, 'Rent', '10', 'A', {});
        ok('storage blocked: maths still right', (await trs(page))[0] === 'B pays A 5');
        await ctx.close();

        // huge amount and long names
        ({ ctx, page, errors } = await newPage(browser));
        const long = 'Muhammad Abdullah Rahman Khans';  // 30 letters, the most a name can have
        await page.fill('#new-name', long + 'XYZ'); await page.press('#new-name', 'Enter');
        await addPeople(page, ['B', 'C']);
        await page.fill('#what', 'Deposit'); await page.fill('#amount', '9999999999.99'); await page.selectOption('#by', { label: 'B' }); await page.click('#save');
        const t = await trs(page);
        ok('huge amount split exactly', JSON.stringify(t) === JSON.stringify([long + ' pays B 3,333,333,333.33', 'C pays B 3,333,333,333.33']), t);
        await ctx.close();

        // ---- layout at every width, dark and light, filled and cleared ----
        const widths = [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920];
        for (const scheme of ['dark', 'light']) {
            ({ ctx, page, errors } = await newPage(browser, { w: 390, scheme }));
            await october(page);
            await page.locator('.split', { hasText: 'Exact amounts' }).click();
            await page.fill('#amount', '1000');
            const st = await page.evaluate(k => localStorage.getItem(k), KEY);
            for (const w of widths) {
                for (const filled of [true, false]) {
                    if (!filled) { await page.click('#wipe'); }
                    await page.setViewportSize({ width: w, height: 900 });
                    const hs = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
                    ok(scheme + ' ' + w + (filled ? ' filled' : ' cleared') + ': no sideways scroll', hs <= 0, hs);
                    const out = await page.evaluate(() => [...document.querySelectorAll('main *')].filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.right > innerWidth + 1 || r.left < -1) && getComputedStyle(e).position !== 'absolute'; }).slice(0, 3).map(e => e.className || e.tagName));
                    ok(scheme + ' ' + w + (filled ? ' filled' : ' cleared') + ': nothing sticks out', !out.length, out);
                    if (w <= 390 && filled) {
                        const c = await page.evaluate(() => { const k = [...document.querySelectorAll('input:not([type=hidden]):not([type=file]), select, button')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).opacity !== '0'; }); const bad = [];
                            for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { if (k[i].contains(k[j]) || k[j].contains(k[i])) continue; const a = k[i].getBoundingClientRect(), b = k[j].getBoundingClientRect(); if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2) bad.push((k[i].id || k[i].className) + '/' + (k[j].id || k[j].className)); }
                            return bad.slice(0, 3); });
                        ok(scheme + ' ' + w + ': no controls overlap (exact split shown)', !c.length, c);
                        const ph = await page.evaluate(() => [...document.querySelectorAll('input[placeholder]')].filter(i => i.offsetParent && !i.value).map(i => { const cs = getComputedStyle(i), cv = document.createElement('canvas').getContext('2d'); cv.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily; return [i.id || i.getAttribute('aria-label'), cv.measureText(i.placeholder).width <= i.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) + 1]; }).filter(x => !x[1]).map(x => x[0]));
                        ok(scheme + ' ' + w + ': placeholders fit', !ph.length, ph);
                    }
                    if (w >= 900) {
                        for (const pos of [0, 0.5, 1]) {
                            await page.evaluate(p => scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * p), pos);
                            const o = await page.evaluate(() => { const k = [...document.querySelector('main').children].filter(c => { const r = c.getBoundingClientRect(); return r.width > 4 && r.height > 4 && getComputedStyle(c).display !== 'none'; }); const bad = [];
                                for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { const a = k[i].getBoundingClientRect(), b = k[j].getBoundingClientRect(); if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 4 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 4) bad.push(k[i].className + '/' + k[j].className); } return bad; });
                            if (o.length) ok(scheme + ' ' + w + ' scroll ' + pos + ': blocks do not overlap', false, o);
                        }
                        const two = await page.evaluate(() => { const a = document.getElementById('col-a').getBoundingClientRect(), b = document.getElementById('col-b').getBoundingClientRect(); return b.left >= a.right && Math.abs(a.top - b.top) < 2; });
                        ok(scheme + ' ' + w + ': two columns side by side', two);
                    }
                    if (!filled) { await page.evaluate(([k, v]) => localStorage.setItem(k, v), [KEY, st]); await page.reload({ waitUntil: 'load' }); await page.locator('.split', { hasText: 'Exact amounts' }).click(); await page.fill('#amount', '1000'); }
                }
            }
            // help dialog
            for (const w of [320, 390, 820, 1280]) {
                await page.setViewportSize({ width: w, height: 800 });
                await page.evaluate(() => scrollTo(0, 0));
                await page.locator('.help-btn, button[aria-label*="Help" i], button:has-text("Help")').first().click();
                const d = page.locator('dialog.help');
                const r = await d.boundingBox();
                ok(scheme + ' ' + w + ': help opens on screen', await d.evaluate(e => e.open) && r.x >= -1 && r.x + r.width <= w + 1 && r.y >= -1 && r.y + r.height <= 801);
                await page.keyboard.press('Escape');
                ok(scheme + ' ' + w + ': Escape closes help', !(await d.evaluate(e => e.open)));
            }
            // theme switch
            const before = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
            await page.locator('.theme-toggle').click();
            const after = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
            ok(scheme + ': light/dark switch changes the look', before !== after);
            await page.locator('.theme-toggle').click();
            ok(scheme + ': no console errors in layout run', errors.length === 0, errors);
            await ctx.close();
        }

        // ---- screenshots: the real situation, default dark look ----
        if (shots) {
            for (const [w, h, scale, name] of [[1280, 1000, 1, 'desktop.png'], [390, 844, 2, 'phone.png']]) {
                ({ ctx, page } = await newPage(browser, { w, h, scale, scheme: 'dark' }));
                await october(page);
                await page.locator('#tlist .trow', { hasText: 'Sara pays Ali 7,200' }).getByRole('button').click();
                await page.evaluate(() => { document.querySelectorAll('.msg').forEach(m => { m.textContent = ''; m.classList.remove('show'); }); });
                await page.fill('#what', 'Gas'); await page.fill('#amount', '1800'); await page.selectOption('#by', { label: 'Hina' });
                await page.evaluate(() => document.activeElement && document.activeElement.blur());
                if (w > 900) { await page.evaluate(() => scrollTo(0, 0)); await page.screenshot({ path: path.join(__dirname, 'screenshots', name) }); }
                else { await page.evaluate(() => document.getElementById('owe').scrollIntoView()); await page.evaluate(() => scrollBy(0, -12)); await page.screenshot({ path: path.join(__dirname, 'screenshots', name) }); }
                await ctx.close();
            }
            ok('screenshots written', fs.existsSync(path.join(__dirname, 'screenshots', 'desktop.png')) && fs.existsSync(path.join(__dirname, 'screenshots', 'phone.png')));
        }
    } catch (e) { ok('test run crashed', false, e.message); }
    await browser.close();
    if (srv) srv.close();
    console.log(fail ? '\n' + fail + ' FAILED' : '\nALL UI TESTS PASSED');
    process.exit(fail ? 1 : 0);
})();
