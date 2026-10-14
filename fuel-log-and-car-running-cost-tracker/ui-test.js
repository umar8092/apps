// Drives the real page in headless Chromium: node ui-test.js [--shots] [--base https://umar8092.github.io/apps]
// Without --base it serves this repo on localhost. With --base it tests the LIVE page. The clock is Wed 14 Oct 2026, 10:00.
const pw = (() => { for (const m of ['playwright', 'playwright-core']) { try { return require(m); } catch (e) { /* next */ } } throw new Error('playwright not found'); })();
const path = require('path'), fs = require('fs'), http = require('http');
const bi = process.argv.indexOf('--base');
const shots = process.argv.includes('--shots');
let fail = 0, url;
const ok = (name, cond, extra) => { if (!cond) fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond || extra == null ? '' : '  -> ' + JSON.stringify(extra))); };
const NOW = new Date(2026, 9, 14, 10, 0).getTime();
const SLUG = 'fuel-log-and-car-running-cost-tracker', KEY = SLUG + '.state';

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

// a realistic log: Ahmed's Honda City over three months, plus his wife's motorbike
function seed() {
    let q = 0;
    const f = (date, odo, vol, total, full, extra) => Object.assign({ id: 'e' + (++q), t: 'fill', date, seq: q, du: 'km', odo: odo * 10, vol: Math.round(vol * 1000), vu: 'L', total: Math.round(total * 100), full: full !== false, missed: false, note: '' }, extra || {});
    const c = (date, cat, amount, note) => ({ id: 'e' + (++q), t: 'cost', date, seq: q, du: 'km', cat, amount: amount * 100, odo: null, note: note || '' });
    return { v: 1, cur: 'Rs', carId: 'c1', seq: 40, cars: [
        { id: 'c1', name: 'Honda City', du: 'km', vu: 'L', eco: 'kmL', read: 'odo', entries: [
            f('2026-07-28', 43610, 38, 10260), f('2026-08-09', 44085, 36.4, 9828), f('2026-08-22', 44540, 35.2, 9504), c('2026-08-25', 'Insurance', 18500, 'yearly'),
            f('2026-09-01', 45000, 30, 8400), f('2026-09-10', 45200, 15, 4200, false), f('2026-09-18', 45455, 20, 5600), c('2026-09-20', 'Car wash', 600),
            f('2026-10-01', 45935, 40, 11600), c('2026-10-05', 'Service', 6000, 'oil and filter change'), f('2026-10-12', 46340, 34.5, 10005, true, { note: 'city driving' })] },
        { id: 'c2', name: 'Motorbike', du: 'km', vu: 'L', eco: 'kmL', read: 'odo', entries: [f('2026-10-02', 12100, 8, 2320), f('2026-10-11', 12530, 9.2, 2668)] }] };
}

async function load(b, vp, opt = {}) {
    const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: vp.width < 500 ? 2 : 1, colorScheme: opt.theme || 'dark', locale: opt.locale || 'en-PK',
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
async function fill(p, o) {
    await p.check('input[name=mode][value=fill]');
    if (o.date) { if (await p.isVisible('#date-open')) await p.click('#date-open'); await p.fill('#date', o.date); }
    await p.fill('#odo', String(o.odo ?? ''));
    await p.fill('#vol', String(o.vol ?? '')); await p.fill('#price', String(o.price ?? '')); await p.fill('#total', String(o.total ?? ''));
    if (o.full === false) await p.uncheck('#full');
    if (o.missed || o.note) { if (await p.isVisible('#more-open')) await p.click('#more-open'); if (o.missed) await p.check('#missed'); if (o.note) await p.fill('#note', o.note); }
    await p.click('#save');
}
async function cost(p, o) {
    await p.check('input[name=mode][value=cost]');
    if (o.date) { if (await p.isVisible('#date-open')) await p.click('#date-open'); await p.fill('#date', o.date); }
    await p.selectOption('#cat', o.cat); await p.fill('#amount', String(o.amount));
    if (o.note) { await p.click('#cmore-open'); await p.fill('#cnote', o.note); }
    await p.click('#save');
}
const noScroll = p => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
const overlaps = p => p.evaluate(() => {
    const els = [...document.querySelectorAll('input:not([type=radio]):not([type=file]), select, button, .mode span, a.back')].filter(e => e.offsetParent && e.getClientRects().length && e.checkVisibility());
    const r = els.map(e => e.getBoundingClientRect()), bad = [];
    for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) {
        if (els[i].contains(els[j]) || els[j].contains(els[i])) continue;
        const x = Math.min(r[i].right, r[j].right) - Math.max(r[i].left, r[j].left), y = Math.min(r[i].bottom, r[j].bottom) - Math.max(r[i].top, r[j].top);
        if (x > 1 && y > 1) bad.push((els[i].id || els[i].textContent.trim().slice(0, 20)) + ' / ' + (els[j].id || els[j].textContent.trim().slice(0, 20)));
    }
    return bad;
});
const placeholdersFit = p => p.evaluate(() => [...document.querySelectorAll('input[placeholder]')].filter(i => i.offsetParent).filter(i => {
    const c = document.createElement('canvas').getContext('2d'), s = getComputedStyle(i); c.font = s.fontWeight + ' ' + s.fontSize + ' ' + s.fontFamily;
    return c.measureText(i.placeholder).width > i.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight) + 1;
}).map(i => i.id + ':' + i.placeholder));
const blocksOverlap = p => p.evaluate(() => {
    const bad = [];
    document.querySelectorAll('main, .col-main, .col-side').forEach(m => {
        const kids = [...m.children].filter(k => k.getClientRects().length && getComputedStyle(k).display !== 'contents' && getComputedStyle(k).position !== 'absolute'), r = kids.map(k => k.getBoundingClientRect());
        for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) {
            const x = Math.min(r[i].right, r[j].right) - Math.max(r[i].left, r[j].left), y = Math.min(r[i].bottom, r[j].bottom) - Math.max(r[i].top, r[j].top);
            if (x > 1 && y > 1) bad.push(kids[i].className + ' / ' + kids[j].className);
        }
    });
    return bad;
});

(async () => {
    let srv;
    if (bi > 0) url = process.argv[bi + 1].replace(/\/$/, '') + '/' + SLUG + '/';
    else { srv = await serve(); url = 'http://localhost:' + srv.address().port + '/apps/' + SLUG + '/'; }
    const b = await pw.chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});

    // 1. first use: empty states, units from the country, nothing forced
    let p = await load(b, { width: 390, height: 844 });
    ok('first use: one car called My car', await txt(p, '#car-name') === 'My car' && !(await p.isVisible('#car')));
    ok('first use: Pakistan defaults to km, litres, km/L', /kilometres, fuel in litres, fuel use shown as km\/L/.test(await txt(p, '#car-units')), await txt(p, '#car-units'));
    ok('first use: results explain what to do', /Log your first fill-up/.test(await txt(p, '#res-empty')) && !(await p.isVisible('#tiles')));
    ok('first use: log empty message', await p.isVisible('#log-empty'));
    ok('first use: optional fields hidden', !(await p.isVisible('#more-box')) && !(await p.isVisible('#date-box')) && !(await p.isVisible('#cmore-box')));
    ok('labels name the units', await txt(p, '#odo-label') === 'Odometer (km)' && await txt(p, '#vol-label') === 'Fuel (litres)' && await txt(p, '#price-label') === 'Price per litre');
    // blank save
    await p.click('#save');
    ok('blank: odometer and fuel errors', /odometer reading/.test(await txt(p, '#odo-err')) && /how much fuel/.test(await txt(p, '#vol-err')));
    ok('blank: nothing saved', (await saved(p)) === null);

    // 2. the README situation, typed through the form
    await fill(p, { date: '2026-09-01', odo: '45,000', vol: '30', price: '280' });
    ok('first full tank message', /First full tank/.test(await txt(p, '#add-msg')), await txt(p, '#add-msg'));
    ok('date box closes after save', !(await p.isVisible('#date-box')));
    await fill(p, { date: '2026-09-10', odo: '45200', vol: '15', total: '4200', full: false });
    ok('part fill message', /Part fill: counted in the next full tank/.test(await txt(p, '#add-msg')));
    // preview before saving: fuel worked out from price and total
    await p.click('#date-open'); await p.fill('#date', '2026-09-18');
    await p.fill('#odo', '45455'); await p.fill('#price', '280'); await p.fill('#total', '5600');
    ok('preview works out the fuel', /Fuel 20 L, Rs 5,600 at Rs 280 per litre \(fuel worked out\)/.test(await txt(p, '#preview')) || /Fuel 20 L, 5,600 at 280 per litre \(fuel worked out\)/.test(await txt(p, '#preview')), await txt(p, '#preview'));
    ok('preview shows the tank result', /This tank: 13.0 km\/L over 455 km/.test(await txt(p, '#preview')), await txt(p, '#preview'));
    ok('worked-out value shown in the empty box', (await p.getAttribute('#vol', 'placeholder')) === '= 20');
    await p.press('#total', 'Enter');
    ok('Enter saves, message gives the tank', /This tank: 13.0 km\/L over 455 km/.test(await txt(p, '#add-msg')), await txt(p, '#add-msg'));
    await fill(p, { date: '2026-10-01', odo: '45935', vol: '40', total: '11600' });
    ok('second tank 12.0 and average', /This tank: 12.0 km\/L over 480 km\. Your average is 12.5 km\/L/.test(await txt(p, '#add-msg')), await txt(p, '#add-msg'));
    await cost(p, { date: '2026-10-05', cat: 'Service', amount: '6,000', note: 'oil change' });
    ok('cost saved', /Saved: Service 6,000 \(5 Oct\)/.test(await txt(p, '#add-msg')), await txt(p, '#add-msg'));
    ok('last tank tile', await txt(p, '#r-last') === '12.0 km/L' && /over 480 km, to 1 Oct\. 4% worse than your average/.test(await txt(p, '#r-last-sub')), await txt(p, '#r-last-sub'));
    ok('average tile', await txt(p, '#r-avg') === '12.5 km/L' && /over 935 km, 2 tanks/.test(await txt(p, '#r-avg-sub')));
    ok('fuel cost per km 22.89', await txt(p, '#r-fuelkm') === '22.89');
    ok('all costs per km 29.30', await txt(p, '#r-allkm') === '29.30');
    ok('spent this month 17,600', /This month 17,600 fuel 11,600 · other 6,000/.test(await txt(p, '#spend')), await txt(p, '#spend'));
    ok('spent last month 18,200 and year 35,800', /Last month 18,200/.test(await txt(p, '#spend')) && /This year 35,800/.test(await txt(p, '#spend')));
    ok('trend has two bars, older one longer', (await p.locator('.bar-row').count()) === 2);
    ok('log newest first, each in its own box', (await p.locator('.entry').count()) === 5 && /^Service/.test(await txt(p, '.entry >> nth=0')));
    ok('log row result', /This tank: 12.0 km\/L over 480 km/.test(await txt(p, '.entry >> nth=1')));
    // currency
    await p.selectOption('#cur', 'Rs');
    ok('currency shown everywhere', await txt(p, '#r-fuelkm') === 'Rs 22.89' && /Rs 17,600/.test(await txt(p, '#spend')) && (await p.isVisible('#cur-tag2') || await p.isVisible('#cur-tag')), [await txt(p, '#r-fuelkm'), await txt(p, '#spend'), await p.isVisible('#cur-tag')]);
    // reload keeps everything
    await p.reload({ waitUntil: 'networkidle' });
    ok('reload keeps the log and currency', (await p.locator('.entry').count()) === 5 && await txt(p, '#r-fuelkm') === 'Rs 22.89');

    // 3. mistakes: lower odometer, mismatched fuel/price/total, future date, bad numbers
    await fill(p, { odo: '45000', vol: '30', total: '9000' });
    ok('lower odometer refused', /lower than the reading at your fill-up on 1 Oct \(45,935 km\)/.test(await txt(p, '#odo-err')), await txt(p, '#odo-err'));
    await fill(p, { odo: '46400', vol: '30', price: '280', total: '12000' });
    ok('three that do not match refused', /do not match/.test(await txt(p, '#vol-err')));
    await fill(p, { odo: '46400', vol: '-30', total: '' });
    ok('negative fuel refused', /minus/.test(await txt(p, '#vol-err')));
    await fill(p, { odo: '46400', vol: '', price: '', total: '9000' });
    ok('total alone asks for one more', /Also type/.test(await txt(p, '#vol-err')));
    await fill(p, { date: '2026-10-20', odo: '46400', vol: '30' });
    ok('future date refused', /future/.test(await txt(p, '#date-err')));
    await p.click('#date-today');
    await fill(p, { odo: 'abc', vol: '30' });
    ok('words refused', /Type a number/.test(await txt(p, '#odo-err')));
    ok('nothing extra saved', (await saved(p)).cars[0].entries.length === 5);
    // unusual result and big gap warnings
    await p.fill('#odo', '55935'); await p.fill('#vol', '5'); await p.fill('#total', '');
    ok('unusual result warned before saving', /looks unusual/.test(await txt(p, '#preview')) && /since your last logged fill-up/.test(await txt(p, '#preview')));
    // missed fill-up
    await p.click('#more-open'); await p.check('#missed');
    ok('missed: tank skipped in preview', /missed before this, so this tank is skipped/.test(await txt(p, '#preview')) && !/since your last logged/.test(await txt(p, '#preview')));
    await p.click('#save');
    ok('missed fill saved, average unchanged', await txt(p, '#r-avg') === '12.5 km/L');
    // undo
    await p.click('#add-msg .undo');
    ok('undo removes it', (await saved(p)).cars[0].entries.length === 5 && /Undone/.test(await txt(p, '#add-msg')));

    // 4. edit and delete
    await p.click('.entry >> nth=1 >> text=Edit');
    ok('edit loads the fill-up', await p.inputValue('#odo') === '45935' && await p.inputValue('#vol') === '40' && await p.inputValue('#total') === '11600' && /Editing the fill-up from 1 Oct/.test(await txt(p, '#editing')));
    ok('edit: Save changes and Cancel shown, mode tabs hidden', await txt(p, '#save') === 'Save changes' && await p.isVisible('#cancel-edit') && !(await p.isVisible('#modes')));
    await p.fill('#vol', '38.4'); await p.fill('#total', '11136');
    ok('edit preview recalculates', /This tank: 12.5 km\/L over 480 km/.test(await txt(p, '#preview')), await txt(p, '#preview'));
    await p.click('#save');
    ok('edit saved', /Changes saved/.test(await txt(p, '#add-msg')) && await txt(p, '#r-last') === '12.5 km/L' && (await saved(p)).cars[0].entries.length === 5);
    await p.click('.entry >> nth=1 >> text=Edit'); await p.keyboard.press('Escape');
    ok('Escape cancels editing', !(await p.isVisible('#editing')) && await txt(p, '#save') === 'Save fill-up');
    await p.click('.entry >> nth=0 >> text=Delete');
    ok('delete with undo', (await saved(p)).cars[0].entries.length === 4 && /Deleted the service cost/.test(await txt(p, '#log-msg')));
    await p.click('#log-msg .undo');
    ok('undo delete', (await saved(p)).cars[0].entries.length === 5);
    await p.selectOption('#show', 'cost');
    ok('show only costs', (await p.locator('.entry').count()) === 1);
    await p.selectOption('#show', 'all');

    // 5. car settings: units change the display only; second car with its own settings
    await p.click('#car-edit');
    ok('car settings open with the name', await p.inputValue('#cp-name') === 'My car');
    await p.fill('#cp-name', 'Honda City'); await p.selectOption('#cp-eco', 'L100'); await p.click('#cp-save');
    ok('L/100 km shown', await txt(p, '#r-last') === '8.0 L/100 km' && await txt(p, '#car-name') === 'Honda City', await txt(p, '#r-last'));
    await p.click('#car-edit'); await p.selectOption('#cp-du', 'mi'); await p.selectOption('#cp-vu', 'usgal'); await p.selectOption('#cp-eco', 'mpgus'); await p.click('#cp-save');
    ok('miles and mpg (US) shown', /mpg \(US\)/.test(await txt(p, '#r-last')) && /per mile/.test(await txt(p, '#r-fuelkm-label')) && await txt(p, '#odo-label') === 'Odometer (miles)');
    ok('saved data unchanged by units', (await saved(p)).cars[0].entries.filter(e => e.t === 'fill').every(e => e.du === 'km' && e.vu === 'L'));
    await p.click('#car-edit'); await p.selectOption('#cp-du', 'km'); await p.selectOption('#cp-vu', 'L'); await p.selectOption('#cp-eco', 'kmL'); await p.click('#cp-save');
    await p.click('#car-add'); await p.click('#cp-save');
    ok('new car needs a name', /Type a name/.test(await txt(p, '#cp-name-err')));
    await p.fill('#cp-name', 'Motorbike'); await p.click('#cp-save');
    ok('second car added and chosen, own empty log', await p.isVisible('#car') && (await p.locator('.entry').count()) === 0 && /How Motorbike is doing/.test(await txt(p, '#res-h')));
    await p.click('#read-switch');
    ok('trip meter mode', await txt(p, '#odo-label') === 'Trip meter since your last fill-up (km)');
    await fill(p, { odo: '0', vol: '8' });
    ok('trip 0 refused', /more than 0/.test(await txt(p, '#odo-err')));
    await fill(p, { odo: '380', vol: '8' }); await fill(p, { odo: '430', vol: '9.2' });
    ok('trip meter result 430 / 9.2 = 46.7 km/L', await txt(p, '#r-last') === '46.7 km/L', await txt(p, '#r-last'));
    ok('no prices: cost tiles explain', /type the total paid/.test(await txt(p, '#r-fuelkm-sub')));
    await p.selectOption('#car', { label: 'Honda City' });
    ok('switching back keeps each car apart', (await p.locator('.entry').count()) === 5 && await txt(p, '#odo-label') === 'Odometer (km)');
    await p.reload({ waitUntil: 'networkidle' });
    ok('chosen car remembered', /How Honda City is doing/.test(await txt(p, '#res-h')));

    // 6. share, backup, CSV
    await p.click('#copy');
    const clip = await p.evaluate(() => navigator.clipboard.readText());
    ok('copy summary', /^Fuel log for Honda City/.test(clip) && /Last full tank: 12.5 km\/L over 480 km/.test(clip) && /Log, newest first:/.test(clip), clip.slice(0, 200));
    let mail = null; await p.evaluate(() => { window.__mail = []; }); p.on('request', r => { if (r.url().startsWith('mailto:')) mail = r.url(); });
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#csv')]);
    const csv = fs.readFileSync(await dl.path(), 'utf8');
    ok('CSV download', /^﻿Car,Date,Type/.test(csv) && csv.split('\r\n').length === 7 && /fuel-log-honda-city-2026-10-14\.csv/.test(dl.suggestedFilename()));
    const [bk] = await Promise.all([p.waitForEvent('download'), p.click('#backup')]);
    const backup = fs.readFileSync(await bk.path(), 'utf8');
    ok('backup has both cars', JSON.parse(backup).cars.length === 2);
    await p.click('#wipe');
    ok('delete everything', (await p.locator('.entry').count()) === 0 && await txt(p, '#car-name') === 'My car');
    await p.click('#tools-msg .undo');
    ok('undo delete everything', (await saved(p)).cars.length === 2);
    await p.click('#wipe');
    await p.setInputFiles('#restore-file', { name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(backup) });
    await p.waitForTimeout(200);
    ok('restore backup', /Restored 2 cars with 7 entries/.test(await txt(p, '#tools-msg')) && (await p.locator('.entry').count()) === 5, await txt(p, '#tools-msg'));
    await p.setInputFiles('#restore-file', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"nope":1}') });
    await p.waitForTimeout(200);
    ok('bad backup refused', /not a backup/.test(await txt(p, '#tools-msg')) && (await p.locator('.entry').count()) === 5);
    // email (mailto opens with no recipient)
    await p.evaluate(() => { const real = Object.getOwnPropertyDescriptor(Location.prototype, 'href'); window.__href = ''; });
    const href = await p.evaluate(() => new Promise(res => { const a = HTMLAnchorElement.prototype.click; document.getElementById('email').addEventListener('click', () => {}, { once: true }); const orig = window.location; try { Object.defineProperty(window, 'location', { value: { set href(v) { res(v); } } }); } catch (e) { res('cannot-stub'); } document.getElementById('email').click(); setTimeout(() => res('none'), 500); }));
    ok('email: mailto with no recipient and the summary', href === 'cannot-stub' || /^mailto:\?subject=Fuel%20log%20for%20Honda%20City&body=/.test(href), href.slice(0, 80));
    // delete a car with undo
    await p.selectOption('#car', { label: 'Motorbike' }); await p.click('#car-edit'); await p.click('#cp-delete');
    ok('delete a car', !(await p.isVisible('#car')) && await txt(p, '#car-name') === 'Honda City' && /Deleted Motorbike and its 2 entries/.test(await txt(p, '#add-msg')));
    await p.click('#add-msg .undo');
    ok('undo delete car', await p.isVisible('#car'));
    ok('no console errors (main run)', p.errors.length === 0, p.errors);
    await p.context().close();

    // 7. saved state broken, storage blocked, very long names, US user
    p = await load(b, { width: 390, height: 844 }, { state: '{not json' });
    ok('corrupt state: starts fresh', await txt(p, '#car-name') === 'My car' && p.errors.length === 0);
    await p.context().close();
    p = await load(b, { width: 390, height: 844 }, { state: { cars: [{ id: 'x', name: 'Car', entries: [{ t: 'fill', date: 'bad' }, { t: 'fill', date: '2026-10-01', vol: 30000, vu: 'L', odo: 100000 }] }] } });
    ok('bad entries dropped', (await p.locator('.entry').count()) === 1 && p.errors.length === 0);
    await p.context().close();
    p = await load(b, { width: 390, height: 844 }, { block: true });
    ok('storage blocked: warning shown, app still works', await p.isVisible('#storage-warn'));
    await fill(p, { odo: '1000', vol: '30' });
    ok('storage blocked: still logs', (await p.locator('.entry').count()) === 1 && p.errors.length === 0, p.errors);
    await p.context().close();
    p = await load(b, { width: 320, height: 700 }, { locale: 'en-US' });
    ok('US defaults: miles, US gallons, mpg', await txt(p, '#odo-label') === 'Odometer (miles)' && await txt(p, '#price-label') === 'Price per gallon');
    await fill(p, { odo: '28,000', vol: '10.5', price: '3.499' }); await fill(p, { odo: '28315', vol: '10.5', price: '3.499' });
    ok('US: 315 miles on 10.5 gal = 30.0 mpg (US)', await txt(p, '#r-last') === '30.0 mpg (US)' && /^\$?0\.12$/.test(await txt(p, '#r-fuelkm')), [await txt(p, '#r-last'), await txt(p, '#r-fuelkm')]);
    await p.click('#car-edit'); await p.fill('#cp-name', 'A very long car name that goes on and on'); await p.click('#cp-save');
    ok('long name: no sideways scroll at 320', await noScroll(p));
    await p.context().close();

    // 8. every screen size with a full log, in dark and light; phones also with every optional field open
    for (const theme of ['dark', 'light']) {
        p = await load(b, { width: 1280, height: 900 }, { state: seed(), theme });
        for (const w of [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920]) {
            await p.setViewportSize({ width: w, height: 900 });
            ok(theme + ' ' + w + 'px: no sideways scroll', await noScroll(p));
            for (const pos of [0, .5, 1]) {
                await p.evaluate(f => window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * f), pos);
                const o = await blocksOverlap(p); if (o.length) ok(theme + ' ' + w + 'px blocks overlap at ' + pos, false, o);
            }
            if (w <= 390) {
                await p.click('#more-open').catch(() => {}); await p.click('#date-open').catch(() => {}); await p.click('#car-edit');
                let o = await overlaps(p); ok(theme + ' ' + w + 'px fill-up: no controls overlap', !o.length, o);
                ok(theme + ' ' + w + 'px placeholders fit', !(await placeholdersFit(p)).length, await placeholdersFit(p));
                await p.check('input[name=mode][value=cost]'); await p.click('#cmore-open').catch(() => {});
                o = await overlaps(p); ok(theme + ' ' + w + 'px cost: no controls overlap', !o.length, o);
                ok(theme + ' ' + w + 'px cost placeholders fit', !(await placeholdersFit(p)).length, await placeholdersFit(p));
                await p.click('.entry >> nth=0 >> text=Edit'); o = await overlaps(p); ok(theme + ' ' + w + 'px editing: no overlap', !o.length, o);
                await p.click('#cancel-edit');
                await p.reload({ waitUntil: 'networkidle' });
            }
        }
        // light/dark switch
        const before = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
        await p.click('.theme-toggle');
        ok(theme + ': theme switch changes the look', before !== await p.evaluate(() => getComputedStyle(document.body).backgroundColor));
        ok(theme + ': no console errors', p.errors.length === 0, p.errors);
        await p.context().close();
    }

    // 9. Help at four widths
    for (const w of [320, 390, 820, 1280]) {
        p = await load(b, { width: w, height: 800 }, { state: seed() });
        const hb = p.locator('.help-btn, button:has-text("Help")').first();
        await hb.click();
        const r = await p.locator('dialog.help').boundingBox();
        ok(w + 'px Help opens inside the screen', r && r.x >= 0 && r.y >= 0 && r.x + r.width <= w + 1 && r.y + r.height <= 801 && /How to use Fuel Log and Car Running Cost Tracker/.test(await txt(p, 'dialog.help')));
        await p.keyboard.press('Escape'); ok(w + 'px Escape closes Help', !(await p.evaluate(() => document.querySelector('dialog.help').open)));
        await hb.click(); await p.click('.help-close'); ok(w + 'px Got it closes Help', !(await p.evaluate(() => document.querySelector('dialog.help').open)));
        const tb = await p.evaluate(() => [...document.querySelectorAll('.topbar > *')].map(e => e.getBoundingClientRect()).map(r => [r.top, r.bottom, r.left, r.right]));
        let bad = false; for (let i = 0; i < tb.length; i++) for (let j = i + 1; j < tb.length; j++) if (Math.min(tb[i][1], tb[j][1]) - Math.max(tb[i][0], tb[j][0]) > 1 && Math.min(tb[i][3], tb[j][3]) - Math.max(tb[i][2], tb[j][2]) > 1) bad = true;
        ok(w + 'px top bar buttons do not overlap', !bad);
        await p.context().close();
    }

    // 10. all files the page uses load
    p = await load(b, { width: 390, height: 844 });
    for (const f of ['favicon.svg', 'manifest.webmanifest', 'sw.js', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', '../help.js', '../theme.js', 'core.js', 'script.js', 'style.css']) {
        const r = await p.request.get(new URL(f, url).href); ok('file ' + f + ' loads', r.status() === 200);
    }
    ok('no failed requests', p.bad.length === 0, p.bad);
    await p.context().close();

    // 11. screenshots of the real situation
    if (shots) {
        const dir = path.join(__dirname, 'screenshots');
        p = await load(b, { width: 1280, height: 900 }, { state: seed() });
        await p.evaluate(() => document.querySelectorAll('.topbar').forEach(t => t.scrollIntoView()));
        await p.fill('#odo', '46790'); await p.fill('#vol', '33'); await p.fill('#price', '290');
        await p.screenshot({ path: path.join(dir, 'desktop.png') });
        await p.context().close();
        p = await load(b, { width: 390, height: 844 }, { state: seed() });
        await p.evaluate(() => window.scrollTo(0, document.getElementById('results').offsetTop - 12));
        await p.screenshot({ path: path.join(dir, 'phone.png') });
        await p.context().close();
        console.log('screenshots saved');
    }
    await b.close(); if (srv) srv.close();
    console.log(fail ? '\n' + fail + ' UI check(s) FAILED' : '\nALL UI CHECKS PASSED');
    process.exit(fail ? 1 : 0);
})();
