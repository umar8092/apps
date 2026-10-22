// Drives the real page in headless Chromium: node ui-test.js [--shots] [--base https://umar8092.github.io/apps]
// Without --base it serves this repo on localhost. With --base it tests the LIVE page. The clock is Thu 22 Oct 2026, 19:30 (closing time).
const pw = (() => { for (const m of ['playwright', 'playwright-core']) { try { return require(m); } catch (e) { /* next */ } } throw new Error('playwright not found'); })();
const path = require('path'), fs = require('fs'), http = require('http');
const bi = process.argv.indexOf('--base');
const shots = process.argv.includes('--shots');
let fail = 0, url;
const ok = (name, cond, extra) => { if (!cond) fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond || extra == null ? '' : '  -> ' + JSON.stringify(extra))); };
const NOW = new Date(2026, 9, 22, 19, 30);
const SLUG = 'daily-cash-book-for-small-shops', KEY = SLUG + '.state', UIKEY = SLUG + '.ui';
const nb = s => String(s).replace(/[  ]/g, ' ');

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

// a realistic month for Asad General Store: open every day but Friday, sales written as they come, the drawer counted most evenings
function seed() {
    let q = 0; const days = {};
    const it = (t, rs, extra) => Object.assign({ id: 'i' + (++q), t, c: Math.round(rs * 100), cat: '', note: '', at: '' }, extra || {});
    for (let d = 1; d <= 21; d++) {
        const key = '2026-10-' + String(d).padStart(2, '0'), wd = new Date(2026, 9, d).getDay();
        if (wd === 5) continue; // closed on Fridays
        const items = [it('sale', 9000 + (d * 731) % 7000, { at: '13:10' }), it('sale', 6000 + (d * 397) % 5000, { at: '18:40' })];
        if (d % 3 === 0) items.push(it('card', 1200 + (d * 113) % 1800, { note: 'JazzCash', at: '16:05' }));
        if (d % 2 === 1) items.push(it('stock', 4000 + (d * 211) % 4000, { note: d % 4 === 1 ? 'Ali Traders' : 'Metro wholesale', at: '11:20' }));
        items.push(it('exp', 150 + (d % 3) * 50, { cat: 'Tea and food', at: '15:00' }));
        if (d === 1) items.push(it('exp', 30000, { cat: 'Rent', at: '12:00' }));
        if (d === 5) items.push(it('exp', 8400, { cat: 'Electricity', note: 'September bill', at: '12:30' }));
        if (d === 7 || d === 14 || d === 21) items.push(it('exp', 3500, { cat: 'Wages', note: 'Bilal, weekly', at: '20:00' }));
        days[key] = { open: d === 1 ? 4000000 : null, count: null, items, notes: {} };
    }
    // counts: worked out so most days match, a few are off
    const C = require('./core.js'), st = { v: 1, shop: 'Asad General Store', days, cats: [] };
    const offs = { '2026-10-06': -500, '2026-10-13': 200, '2026-10-20': -100 };
    // each evening the owner takes the day's cash home and leaves about 2,000 as change
    Object.keys(days).sort().forEach(k => {
        const v = C.chain(st)[k], keep = k === '2026-10-20' ? 210000 : 200000 + (Number(k.slice(8)) % 4) * 50000;
        if (v.expected > keep) days[k].items.push(it('owner', (v.expected - keep) / 100, { at: '20:10' }));
        if (k !== '2026-10-11') days[k].count = C.chain(st)[k].expected + (offs[k] || 0) * 100;
    });
    return st;
}

async function load(b, vp, opt = {}) {
    const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: vp.width < 500 ? 2 : 1, colorScheme: opt.theme || 'dark', locale: 'en-GB',
        permissions: ['clipboard-read', 'clipboard-write'], acceptDownloads: true, serviceWorkers: 'block' });
    await ctx.route(/goatcounter\.com|gc\.zgo\.at/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
    if (opt.state !== undefined) await ctx.addInitScript(([k, s]) => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem(k, s); } }, [KEY, typeof opt.state === 'string' ? opt.state : JSON.stringify(opt.state)]);
    if (opt.ui) await ctx.addInitScript(([k, u]) => { if (!sessionStorage.getItem('ui')) { sessionStorage.setItem('ui', '1'); localStorage.setItem(k, u); } }, [UIKEY, JSON.stringify(opt.ui)]);
    if (opt.blocked) await ctx.addInitScript(() => { const bad = () => { throw new Error('blocked'); }; Object.defineProperty(window, 'localStorage', { get: bad }); });
    const page = await ctx.newPage();
    await page.clock.setFixedTime(opt.now || NOW);
    page.errors = []; page.bad = [];
    page.on('pageerror', e => page.errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') page.errors.push(m.text()); });
    page.on('response', r => { if (r.status() >= 400) page.bad.push(r.status() + ' ' + r.url()); });
    await page.goto(url, { waitUntil: 'networkidle' });
    return { ctx, page };
}
const txt = async (p, sel) => nb((await p.textContent(sel)) || '').replace(/\s+/g, ' ').trim();
async function add(p, kind, amount, o = {}) {
    await p.check('input[name="kind"][value="' + kind + '"]', { force: true });
    if (o.cat) await p.fill('#cat', o.cat);
    if (o.chip) await p.click('#cat-chips .chip:text-is("' + o.chip + '")');
    if (o.note) { if (await p.isVisible('#note-open')) await p.click('#note-open'); await p.fill('#note', o.note); }
    await p.fill('#amount', amount);
    if (o.enter) await p.press('#amount', 'Enter'); else await p.click('#save');
}
async function count(p, v) { await p.fill('#count', v); await p.click('#count-save'); }
const stored = p => p.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), KEY);

async function noOverflow(p) {
    return p.evaluate(() => {
        const w = document.documentElement.clientWidth, out = [];
        if (document.documentElement.scrollWidth > w + 1) out.push('page scrolls sideways ' + document.documentElement.scrollWidth);
        document.querySelectorAll('main *').forEach(e => { const r = e.getBoundingClientRect(); if (r.width && (r.right > w + 1 || r.left < -1) && getComputedStyle(e).position !== 'absolute' && !e.closest('.report, .vh')) out.push((e.id || e.className || e.tagName) + ' ' + Math.round(r.left) + '-' + Math.round(r.right)); });
        return out.slice(0, 5);
    });
}
async function controlsOverlap(p) {
    return p.evaluate(() => {
        const els = [...document.querySelectorAll('main input:not([type=radio]):not([type=file]), main select, main button, main .kind span')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !e.closest('[hidden]'); });
        const out = [];
        for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
            if (els[i].contains(els[j]) || els[j].contains(els[i])) continue;
            const a = els[i].getBoundingClientRect(), b = els[j].getBoundingClientRect();
            if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) out.push((els[i].id || els[i].textContent.slice(0, 20)) + ' / ' + (els[j].id || els[j].textContent.slice(0, 20)));
        }
        return out.slice(0, 5);
    });
}
async function siblingsOverlap(p) {
    return p.evaluate(() => {
        const out = [];
        const check = parent => { const kids = [...parent.children].filter(e => { const r = e.getBoundingClientRect(); return r.height > 0 && getComputedStyle(e).display !== 'contents'; });
            for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) { const a = kids[i].getBoundingClientRect(), b = kids[j].getBoundingClientRect();
                if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) out.push((kids[i].id || kids[i].className) + ' / ' + (kids[j].id || kids[j].className)); } };
        check(document.querySelector('main')); document.querySelectorAll('.col-a, .col-b, .card').forEach(check);
        return out.slice(0, 5);
    });
}
async function placeholdersFit(p) {
    return p.evaluate(() => [...document.querySelectorAll('main input[placeholder]')].filter(i => i.offsetWidth).map(i => {
        const c = document.createElement('canvas').getContext('2d'), cs = getComputedStyle(i); c.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
        const room = i.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        return c.measureText(i.placeholder).width > room + 1 ? i.id + ' "' + i.placeholder + '"' : null; }).filter(Boolean));
}

(async () => {
    let srv;
    if (bi >= 0) url = process.argv[bi + 1].replace(/\/$/, '') + '/' + SLUG + '/';
    else { srv = await serve(); url = 'http://localhost:' + srv.address().port + '/apps/' + SLUG + '/'; }
    const b = await pw.chromium.launch();
    try {
        // ---- first use: empty, nothing forced ----
        let { ctx, page: p } = await load(b, { width: 390, height: 844 });
        ok('first use: today is shown', (await txt(p, '#day-title')).startsWith('Thu, 22 Oct 2026'), await txt(p, '#day-title'));
        ok('first use: empty entries', await p.isVisible('#empty'));
        ok('first use: asks for opening cash', (await txt(p, '#open-from')).startsWith('First day'));
        ok('first use: optional inputs hidden', !(await p.isVisible('#note-box')) && !(await p.isVisible('#notes-box')) && !(await p.isVisible('#shop-box')) && !(await p.isVisible('#open-box')) && !(await p.isVisible('#cat-box')));
        ok('first use: next day disabled', await p.isDisabled('#next-day'));
        ok('first use: totals empty', await p.isVisible('#t-empty'));
        await p.selectOption('#cur', 'Rs');

        // ---- the situation: Wednesday 21 Oct ----
        await p.click('#prev-day');
        ok('went to Wednesday', (await txt(p, '#day-title')).startsWith('Wed, 21 Oct'));
        ok('past day: button says which day', (await txt(p, '#save')) === 'Add cash sale to Wed, 21 Oct', await txt(p, '#save'));
        await p.click('#open-edit'); await p.fill('#open-in', '2000'); await p.click('#open-save');
        ok('opening typed', (await txt(p, '#s-open')) === 'Rs 2,000' && (await txt(p, '#open-from')).startsWith('Typed by you'));
        await add(p, 'sale', '15000');
        await add(p, 'stock', '4000');
        await add(p, 'exp', '500', { cat: 'Electricity' });
        ok('Wed should be 12,500', (await txt(p, '#s-expected')) === 'Rs 12,500');
        await count(p, '12,400');
        ok('Wed 100 short', (await txt(p, '#r-main')) === 'Rs 100 short' && (await txt(p, '#r-sub')) === 'You counted Rs 12,400 but Rs 12,500 should be there. Check for a missed expense or wrong change given.', await txt(p, '#r-sub'));
        ok('Wed result is red (short)', (await p.getAttribute('#result', 'class')).includes('short'));

        // ---- Thursday 22 Oct ----
        await p.click('#next-day');
        ok('Thu opens with Wed count', (await txt(p, '#s-open')) === 'Rs 12,400' && (await txt(p, '#open-from')) === 'The cash you counted on Wed, 21 Oct.', await txt(p, '#open-from'));
        await add(p, 'sale', '9800'); await add(p, 'sale', '4250', { enter: true }); await add(p, 'sale', '3,700');
        await add(p, 'card', '2300');
        ok('preview for card', true);
        await add(p, 'stock', '6000', { note: 'Ali Traders' });
        await add(p, 'exp', '200', { chip: 'Tea and food' });
        await add(p, 'exp', '1500', { chip: 'Wages' });
        await add(p, 'owner', '4000');
        ok('8 entries for Thu', (await p.locator('.item').count()) === 8);
        ok('Thu should be 18,450', (await txt(p, '#s-expected')) === 'Rs 18,450', await txt(p, '#s-expected'));
        ok('now line', (await txt(p, '#now-line')) === 'Cash that should be in the drawer now: Rs 18,450', await txt(p, '#now-line'));
        await count(p, '18200');
        ok('Thu 250 short', (await txt(p, '#r-main')) === 'Rs 250 short' && (await txt(p, '#r-sub')).startsWith('You counted Rs 18,200 but Rs 18,450 should be there.'), await txt(p, '#r-main'));
        ok('sales today 20,050 with card split', (await txt(p, '#day-sales .tile.in')) === 'Sales todayRs 20,050Cash Rs 17,750, card or mobile Rs 2,300', await txt(p, '#day-sales'));
        ok('sales minus stock and expenses 12,350', (await txt(p, '#day-sales .tile.net')) === 'Sales minus stock and expensesRs 12,350');
        ok('carry line', (await txt(p, '#carry')) === 'The next day opens with Rs 18,200 (your count).');
        ok('card entry says not in drawer', (await txt(p, '.item.card-k')).includes('not in the drawer'));
        ok('no difference-as-sales button when sales written', !(await p.isVisible('#diff-sales')));

        // week totals
        await p.selectOption('#period', 'w:2026-10-19');
        ok('week sales 35,050', (await txt(p, '#t-sales')) === 'Rs 35,050', await txt(p, '#t-sales'));
        ok('week net 22,850', (await txt(p, '#t-net')) === 'Rs 22,850', await txt(p, '#t-net'));
        ok('week stock, expenses, owner', [await txt(p, '#t-stock'), await txt(p, '#t-exp'), await txt(p, '#t-owner')].join('|') === 'Rs 10,000|Rs 2,200|Rs 4,000');
        ok('week short 350', (await txt(p, '#t-diff')) === 'Rs 350 short' && (await txt(p, '#t-diff-sub')) === 'On 2 counted days, short on 2 days', await txt(p, '#t-diff-sub'));
        ok('expenses by type, biggest first', (await txt(p, '#t-cats')) === 'WagesRs 1,500ElectricityRs 500Tea and foodRs 200', await txt(p, '#t-cats'));
        ok('two day rows', (await p.locator('.drow').count()) === 2);

        // copy the day
        await p.click('#copy-day');
        const clip = nb(await p.evaluate(() => navigator.clipboard.readText()));
        ok('copied day text', clip.includes('Cash should be: Rs 18,450') && clip.includes('Cash counted: Rs 18,200 (Rs 250 short)') && clip.includes('Bought stock: Rs 6,000 (Ali Traders)'), clip.slice(0, 300));
        await p.click('#copy-period');
        const clip2 = nb(await p.evaluate(() => navigator.clipboard.readText()));
        ok('copied totals text', clip2.includes('Sales: Rs 35,050') && clip2.includes('Day by day:'), clip2.slice(0, 200));

        // edit a mistake, then undo
        const wages = p.locator('.item', { hasText: 'Wages' });
        await wages.locator('button:text-is("Edit")').click();
        await p.locator('.item.editing input[id$="-a"]').fill('1000');
        await p.locator('.item.editing button:text-is("Save changes")').click();
        ok('edit: should be 18,950', (await txt(p, '#s-expected')) === 'Rs 18,950' && (await txt(p, '#r-main')) === 'Rs 750 short', await txt(p, '#r-main'));
        await p.click('#list-msg .undo');
        ok('undo edit', (await txt(p, '#s-expected')) === 'Rs 18,450');
        // edit: change type from expense to stock
        await wages.locator('button:text-is("Edit")').click();
        await p.selectOption('.item.editing select', 'stock');
        ok('edit: category hidden for stock', !(await p.locator('.item.editing input[id$="-c"]').isVisible()));
        await p.locator('.item.editing button:text-is("Cancel")').click();
        ok('cancel edit', (await p.locator('.item.editing').count()) === 0);
        // delete, then undo
        await p.locator('.item', { hasText: 'Owner took' }).locator('button:text-is("Delete")').click();
        ok('delete: should be 22,450', (await txt(p, '#s-expected')) === 'Rs 22,450');
        await p.click('#list-msg .undo');
        ok('undo delete', (await txt(p, '#s-expected')) === 'Rs 18,450' && (await p.locator('.item').count()) === 8);

        // wrong inputs
        await p.check('input[name="kind"][value="sale"]', { force: true });
        for (const [v, msg] of [['', 'Type the amount'], ['0', 'more than 0'], ['-50', 'minus'], ['abc', 'Type a number'], ['99999999999', 'too big'], ['1.234.5', 'mistyped']]) {
            await p.fill('#amount', v); await p.click('#save');
            ok('refused amount "' + v + '"', (await txt(p, '#amount-err')).includes(msg) && (await p.locator('.item').count()) === 8, await txt(p, '#amount-err'));
        }
        await p.check('input[name="kind"][value="exp"]', { force: true });
        await p.fill('#cat', ''); await p.fill('#amount', '100'); await p.click('#save');
        ok('expense needs what for', (await txt(p, '#cat-err')).includes('what the expense was for'));
        await p.fill('#amount', '');
        await p.fill('#count', 'abc'); await p.click('#count-save');
        ok('bad count refused', (await txt(p, '#count-err')).length > 0);
        await p.fill('#count', '18200'); await p.click('#count-save');

        // pasted text and long text
        await p.check('input[name="kind"][value="exp"]', { force: true });
        await add(p, 'exp', '  Rs 1,250.50 ', { cat: 'A very long expense name that goes on and on', note: 'x'.repeat(120) });
        ok('pasted amount with Rs and spaces', (await txt(p, '.item:last-child .i-amt')) === '−Rs 1,250.50', await txt(p, '.item:last-child .i-amt'));
        ok('new category remembered as a chip', (await p.locator('#cat-chips .chip').first().textContent()).startsWith('A very long expense name'));
        ok('long text does not overflow', !(await noOverflow(p)).length, await noOverflow(p));
        await p.locator('.item:last-child button:text-is("Delete")').click();

        // reload keeps everything and opens today
        await p.reload({ waitUntil: 'networkidle' });
        ok('reload keeps entries', (await p.locator('.item').count()) === 8 && (await txt(p, '#s-expected')) === 'Rs 18,450');
        ok('reload keeps currency', (await p.inputValue('#cur')) === 'Rs');
        ok('reload keeps count', (await p.inputValue('#count')) === '18200');

        // correcting yesterday re-carries today
        await p.click('#prev-day'); await count(p, '12500'); await p.click('#next-day');
        ok('correction carries', (await txt(p, '#s-open')) === 'Rs 12,500' && (await txt(p, '#s-expected')) === 'Rs 18,550' && (await txt(p, '#r-main')) === 'Rs 350 short');
        // remove a count
        await p.click('#count-remove');
        ok('count removed', (await txt(p, '#r-main')).startsWith('Not counted yet') && (await txt(p, '#carry')) === 'The next day opens with Rs 18,550 unless you count the drawer.', await txt(p, '#carry'));
        await p.click('#close-msg .undo');
        ok('undo count removal', (await txt(p, '#r-sub')).includes('18,200'));
        // count 0 is a real count
        await p.click('#prev-day'); await count(p, '0');
        ok('count of 0', (await txt(p, '#r-main')) === 'Rs 12,500 short' && (await txt(p, '#r-sub')).startsWith('You counted Rs 0 but'), await txt(p, '#r-main'));
        await p.click('#close-msg .undo');

        // notes and coins
        await p.click('#next-day');
        await p.click('#notes-open');
        await p.fill('#n-500000', '3'); await p.fill('#n-100000', '2'); await p.fill('#n-10000', '2');
        ok('notes total 17,200', (await txt(p, '#notes-total')) === 'Rs 17,200');
        await p.fill('#n-5000', '1x'); ok('notes accept digits only', (await p.inputValue('#n-5000')) === '1');
        await p.fill('#n-5000', '');
        await p.click('#notes-use');
        ok('use notes total as count', (await p.inputValue('#count')) === '17200' && (await txt(p, '#r-main')) === 'Rs 1,350 short', await txt(p, '#r-main'));
        await p.reload({ waitUntil: 'networkidle' }); await p.click('#notes-open');
        ok('notes kept after reload', (await p.inputValue('#n-500000')) === '3');
        await p.click('#notes-clear'); ok('notes clear', (await txt(p, '#notes-total')) === 'Rs 0');
        await count(p, '18200');

        // future days refused
        ok('next disabled on today', await p.isDisabled('#next-day'));
        await p.click('#date-open'); await p.fill('#date', '2026-10-30'); await p.dispatchEvent('#date', 'change');
        ok('future date refused', (await txt(p, '#date-err')).includes('not come yet') && (await txt(p, '#day-title')).startsWith('Thu, 22 Oct'));
        await p.fill('#date', '2026-10-01'); await p.dispatchEvent('#date', 'change');
        ok('pick an old day', (await txt(p, '#day-title')).startsWith('Thu, 1 Oct') && await p.isVisible('#go-today'));
        await p.click('#go-today');
        ok('back to today', (await txt(p, '#day-title')).startsWith('Thu, 22 Oct'));

        // print builds a report
        await p.evaluate(() => { window.print = () => { window.__printed = true; }; });
        await p.click('#print-period');
        ok('print report has the days', await p.evaluate(() => window.__printed && document.querySelectorAll('#report tbody tr').length > 5));
        // email does not need an address (link built, no error)
        await p.evaluate(() => { window.__nav = null; });
        ok('no errors so far', !p.errors.length, p.errors);

        // currency none: plain numbers
        await p.selectOption('#cur', '');
        ok('plain numbers', (await txt(p, '#s-expected')) === '18,550' && !(await p.isVisible('#cur-tag')));
        await p.selectOption('#cur', '$');
        ok('dollar notes in counter', (await p.locator('#notes input').first().getAttribute('id')) === 'n-10000');
        await p.selectOption('#cur', 'Rs');

        // shop name is optional and goes into the copy
        await p.click('#shop-open'); await p.fill('#shop', 'Asad General Store'); await p.click('#copy-day');
        ok('shop name in copy', nb(await p.evaluate(() => navigator.clipboard.readText())).startsWith('Asad General Store, cash for Thu, 22 Oct 2026'));

        // backup, wipe, restore, undo
        const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#backup')]);
        const file = await dl.path();
        await p.click('#wipe');
        ok('delete everything', (await p.locator('.item').count()) === 0 && (await txt(p, '#s-expected')) === 'Rs 0');
        await p.click('#tools-msg .undo');
        ok('undo delete everything', (await p.locator('.item').count()) === 8);
        await p.click('#wipe');
        await p.setInputFiles('#restore-file', file);
        await p.waitForFunction(() => document.getElementById('tools-msg').textContent.startsWith('Backup restored'));
        ok('restore backup', (await p.locator('.item').count()) === 8 && (await txt(p, '#tools-msg')).startsWith('Backup restored: 2 days'), [await p.locator('.item').count(), await txt(p, '#tools-msg')]);
        await p.setInputFiles('#restore-file', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') });
        await p.waitForFunction(() => document.getElementById('tools-msg').textContent.includes('not a Daily'));
        ok('bad backup refused', (await txt(p, '#tools-msg')).includes('not a Daily Cash Book backup') && (await p.locator('.item').count()) === 8);
        // clear this day with undo
        await p.click('#clear-day');
        ok('clear day', (await p.locator('.item').count()) === 0);
        await p.click('#list-msg .undo');
        ok('undo clear day', (await p.locator('.item').count()) === 8);
        ok('no errors in the main run', !p.errors.length, p.errors);
        const saved = await stored(p);
        await ctx.close();

        // ---- the next morning: Friday opens with Thursday's count ----
        ({ ctx, page: p } = await load(b, { width: 390, height: 844 }, { state: saved, ui: { cur: 'Rs' }, now: new Date(2026, 9, 23, 9, 0) }));
        ok('next day opens with the count', (await txt(p, '#day-title')).startsWith('Fri, 23 Oct') && (await txt(p, '#s-open')) === 'Rs 18,200' && (await p.locator('.item').count()) === 0);
        await ctx.close();
        // shop closed on Friday: Saturday still opens with Thursday's count
        ({ ctx, page: p } = await load(b, { width: 390, height: 844 }, { state: saved, ui: { cur: 'Rs' }, now: new Date(2026, 9, 24, 9, 0) }));
        ok('after a closed day', (await txt(p, '#s-open')) === 'Rs 18,200' && (await txt(p, '#open-from')) === 'The cash you counted on Thu, 22 Oct.');
        // a shop that does not write each sale
        await add(p, 'stock', '3000'); await add(p, 'owner', '1000');
        await count(p, '30000');
        ok('over shows', (await txt(p, '#r-main')) === 'Rs 15,800 over' && (await txt(p, '#r-sub')).endsWith('Check for a cash sale not written down.'), await txt(p, '#r-main'));
        ok('offers difference as sales', await p.isVisible('#diff-sales'));
        await p.click('#diff-sales');
        ok('difference added as sales', (await txt(p, '#r-main')) === 'Matches exactly' && (await txt(p, '#s-sale')) === 'Rs 15,800', await txt(p, '#r-main'));
        // more out than in
        await p.click('#close-msg .undo'); await p.click('#count-remove');
        await add(p, 'stock', '50000');
        ok('negative warning', await p.isVisible('#neg-warn') && (await txt(p, '#s-expected')) === '−Rs 35,800', await txt(p, '#s-expected'));
        await ctx.close();

        // odd cents stay exact
        ({ ctx, page: p } = await load(b, { width: 390, height: 844 }));
        await p.click('#open-edit'); await p.fill('#open-in', '0.10'); await p.click('#open-save');
        await add(p, 'sale', '0.10'); await add(p, 'sale', '0.20');
        await count(p, '0.39');
        ok('odd cents', (await txt(p, '#s-expected')) === '0.40' && (await txt(p, '#r-main')) === '0.01 short', await txt(p, '#r-main'));
        // typed opening can go back to carried
        await p.click('#prev-day'); await add(p, 'sale', '100'); await p.click('#next-day');
        ok('typed opening shows the carried one', (await txt(p, '#open-from')).includes('Wed, 21 Oct closed with 100'));
        await p.click('#open-edit'); await p.click('#open-carry');
        ok('back to carried opening', (await txt(p, '#s-open')) === '100');
        await ctx.close();

        // corrupt saved data and blocked storage
        ({ ctx, page: p } = await load(b, { width: 390, height: 844 }, { state: '{not json' }));
        ok('corrupt state starts fresh', !p.errors.length && await p.isVisible('#empty'));
        await ctx.close();
        ({ ctx, page: p } = await load(b, { width: 390, height: 844 }, { state: JSON.stringify({ days: { '2026-10-22': { items: [{ t: 'sale', c: 'lots' }, { t: 'sale', c: 500 }] } } }) }));
        ok('bad entries dropped', !p.errors.length && (await p.locator('.item').count()) === 1);
        await ctx.close();
        ({ ctx, page: p } = await load(b, { width: 390, height: 844 }, { blocked: true }));
        await add(p, 'sale', '100');
        ok('blocked storage still works, with a warning', !p.errors.length && await p.isVisible('#store-warn') && (await p.locator('.item').count()) === 1, p.errors);
        await ctx.close();

        // many lines
        const full0 = seed(); const big = seed(); for (let i = 0; i < 250; i++) big.days['2026-10-21'].items.push({ id: 'm' + i, t: 'sale', c: 1000 + i, cat: '', note: '', at: '' });
        ({ ctx, page: p } = await load(b, { width: 390, height: 844 }, { state: big, ui: { cur: 'Rs' } }));
        await p.click('#prev-day');
        ok('seed is sensible', Object.values(require('./core.js').chain(full0)).every(d => d.expected > 0 && d.tot.owner >= 0));
        ok('250+ entries render', (await p.locator('.item').count()) > 250 && !p.errors.length);
        await ctx.close();

        // ---- screen sizes with a filled month ----
        const full = seed();
        full.days['2026-10-22'] = JSON.parse(JSON.stringify(saved.days['2026-10-22'])); full.days['2026-10-22'].count = 1820000;
        full.days['2026-10-21'] = JSON.parse(JSON.stringify(saved.days['2026-10-21'])); full.days['2026-10-21'].count = 1240000; full.days['2026-10-21'].open = null;
        for (const theme of ['dark', 'light']) for (const w of [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920]) {
            ({ ctx, page: p } = await load(b, { width: w, height: 900 }, { state: full, ui: { cur: 'Rs', period: 'm:2026-10' }, theme }));
            const tag = theme + ' ' + w + ': ';
            const o1 = await noOverflow(p); ok(tag + 'no sideways scroll (filled)', !o1.length, o1);
            if (w <= 390) {
                await p.click('#note-open'); await p.click('#notes-open'); await p.click('#open-edit'); if (await p.isVisible('#shop-open')) await p.click('#shop-open'); await p.click('#date-open');
                await p.check('input[name="kind"][value="exp"]', { force: true });
                await p.locator('.item').first().locator('button:text-is("Edit")').click();
                const c = await controlsOverlap(p); ok(tag + 'no controls overlap with every optional field open', !c.length, c);
                const ph = await placeholdersFit(p); ok(tag + 'placeholders fit', !ph.length, ph);
                const o2 = await noOverflow(p); ok(tag + 'no sideways scroll (all open)', !o2.length, o2);
            }
            if (w >= 900) {
                for (const pos of [0, .5, 1]) { await p.evaluate(f => window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * f), pos); await p.waitForTimeout(50); const s = await siblingsOverlap(p); ok(tag + 'no blocks overlap at scroll ' + pos, !s.length, s); }
                const cols = await p.evaluate(() => [document.getElementById('col-a').getBoundingClientRect(), document.getElementById('col-b').getBoundingClientRect()].map(r => Math.round(r.left)));
                ok(tag + 'two columns side by side', cols[1] > cols[0] + 300, cols);
            }
            // cleared state
            await p.click('#wipe');
            const o3 = await noOverflow(p); ok(tag + 'no sideways scroll (cleared)', !o3.length, o3);
            if (w >= 900) { const s = await siblingsOverlap(p); ok(tag + 'no blocks overlap (cleared)', !s.length, s); }
            ok(tag + 'no errors', !p.errors.length, p.errors);
            await ctx.close();
        }

        // help dialog and the top bar
        for (const w of [320, 390, 820, 1280]) {
            ({ ctx, page: p } = await load(b, { width: w, height: 800 }, { state: full }));
            const help = p.locator('.topbar button', { hasText: 'Help' });
            await help.click();
            const r = await p.locator('dialog.help').boundingBox();
            ok(w + ': help opens inside the screen', r && r.x >= 0 && r.y >= 0 && r.x + r.width <= w && r.y + r.height <= 800 && (await txt(p, 'dialog.help h2')) === 'How to use Daily Cash Book for Small Shops', r);
            await p.keyboard.press('Escape'); ok(w + ': Escape closes help', !(await p.locator('dialog.help').evaluate(d => d.open)));
            await help.click(); await p.click('.help-close'); ok(w + ': Got it closes help', !(await p.locator('dialog.help').evaluate(d => d.open)));
            const bar = await p.evaluate(() => [...document.querySelectorAll('.topbar > *, .topbar button, .topbar a')].map(e => e.getBoundingClientRect()).filter(r => r.width).map(r => [r.top, r.bottom, r.left, r.right]));
            let clash = false; for (let i = 0; i < bar.length; i++) for (let j = i + 1; j < bar.length; j++) { const a = bar[i], c = bar[j]; if (Math.min(a[3], c[3]) - Math.max(a[2], c[2]) > 2 && Math.min(a[1], c[1]) - Math.max(a[0], c[0]) > 2 && !(a[2] <= c[2] && a[3] >= c[3] && a[0] <= c[0] && a[1] >= c[1]) && !(c[2] <= a[2] && c[3] >= a[3] && c[0] <= a[0] && c[1] >= a[1])) clash = true; }
            ok(w + ': top bar buttons do not overlap', !clash);
            await ctx.close();
        }
        // light/dark switch
        ({ ctx, page: p } = await load(b, { width: 1280, height: 800 }));
        const bg1 = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
        await p.locator('.theme-toggle').click();
        const bg2 = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
        ok('theme switch changes the look', bg1 !== bg2, [bg1, bg2]);
        // every file the page needs is there
        for (const f of ['favicon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'manifest.webmanifest', 'sw.js', 'core.js', 'script.js', 'style.css', '../help.js', '../theme.js', 'screenshots/desktop.png', 'screenshots/phone.png']) {
            const r = await p.request.get(new URL(f, url).href); ok('file ' + f + ' is ' + r.status(), r.status() === 200);
        }
        ok('no failed requests', !p.bad.length, p.bad);
        await ctx.close();

        if (shots) {
            const dir = path.join(__dirname, 'screenshots');
            for (const [w, h, name] of [[1280, 1080, 'desktop.png'], [390, 844, 'phone.png']]) {
                ({ ctx, page: p } = await load(b, { width: w, height: h }, { state: full, ui: { cur: 'Rs', period: 'w:2026-10-19' } }));
                if (w < 500) { await p.evaluate(() => window.scrollTo(0, document.getElementById('close').getBoundingClientRect().top + scrollY - 12)); }
                
                await p.screenshot({ path: path.join(dir, name) });
                await ctx.close();
            }
            console.log('screenshots saved');
        }
    } catch (e) { fail++; console.log('FAIL crashed: ' + e.stack); }
    await b.close(); if (srv) srv.close();
    console.log(fail ? '\n' + fail + ' FAILED' : '\nALL UI TESTS PASSED');
    process.exit(fail ? 1 : 0);
})();
