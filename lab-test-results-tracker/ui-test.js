// Drives the real page in headless Chromium: node ui-test.js [--shots] [--base https://umar8092.github.io/apps]
// Without --base it serves this repo on localhost. With --base it tests the LIVE page. The clock is Wed 21 Oct 2026, 10:00 a.m.
const pw = (() => { for (const m of ['playwright', 'playwright-core']) { try { return require(m); } catch (e) { /* next */ } } throw new Error('playwright not found'); })();
const path = require('path'), fs = require('fs'), http = require('http');
const bi = process.argv.indexOf('--base');
const shots = process.argv.includes('--shots');
let fail = 0, url;
const ok = (name, cond, extra) => { if (!cond) fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond || extra == null ? '' : '  -> ' + JSON.stringify(extra))); };
const NOW = new Date(2026, 9, 21, 10, 0).getTime();
const KEY = 'lab-test-results-tracker.state';

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

// Sara's two reports from the README: April and October 2026
function sara(extra) {
    const R = (id, date, v, unit, range, lab, q) => ({ id, date, v, q: q || '', unit, range, lab: lab || '', note: '' });
    const T = (id, key, name, unit, results, ranges) => ({ id, key, name, unit, ranges: ranges || {}, results });
    return Object.assign({ people: [{ id: 'p1', name: 'Sara Khan', tests: [
        T('t1', 'hba1c', 'HbA1c (3-month sugar average)', '%', [R('a1', '2025-10-08', 7.8, '%', '4.0–5.6', 'City Lab'), R('a2', '2026-04-03', 7.1, '%', '4.0–5.6', 'City Lab'), R('a3', '2026-10-12', 6.4, '%', '4.0–5.6', 'City Lab')], { '%': '4.0–5.6' }),
        T('t2', 'fbs', 'Fasting blood sugar (glucose)', 'mg/dL', [R('b1', '2025-10-08', 151, 'mg/dL', '70–99', 'City Lab'), R('b2', '2026-04-03', 132, 'mg/dL', '70–99', 'City Lab'), R('b3', '2026-10-12', 112, 'mg/dL', '70–99', 'City Lab')]),
        T('t3', 'ldl', 'LDL cholesterol ("bad")', 'mg/dL', [R('c1', '2026-04-03', 152, 'mg/dL', '<100', 'City Lab'), R('c2', '2026-10-12', 118, 'mg/dL', '<100', 'City Lab')]),
        T('t4', 'hdl', 'HDL cholesterol ("good")', 'mg/dL', [R('d1', '2026-04-03', 38, 'mg/dL', '>40', 'City Lab'), R('d2', '2026-10-12', 44, 'mg/dL', '>40', 'City Lab')]),
        T('t5', 'vitd', 'Vitamin D (25-OH)', 'ng/mL', [R('e1', '2026-04-03', 14, 'ng/mL', '30–100', 'City Lab'), R('e2', '2026-10-12', 80, 'nmol/L', '75–250', 'Hospital lab')]),
        T('t6', 'tsh', 'TSH (thyroid)', 'mIU/L', [R('f1', '2026-04-03', 2.1, 'mIU/L', '0.4–4.0', 'City Lab'), R('f2', '2026-10-12', 2.4, 'mIU/L', '0.4–4.0', 'City Lab')])
    ] }], current: 'p1', labOpen: true, lab: 'City Lab' }, extra || {});
}

async function load(b, vp, opt = {}) {
    const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: vp.width < 500 ? 2 : 1, colorScheme: opt.theme || 'dark', locale: 'en-GB',
        permissions: ['clipboard-read', 'clipboard-write'], acceptDownloads: true, serviceWorkers: 'block' });
    await ctx.route(/goatcounter\.com|gc\.zgo\.at/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
    if (opt.state !== undefined) await ctx.addInitScript(([k, s]) => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem(k, s); } }, [KEY, typeof opt.state === 'string' ? opt.state : JSON.stringify(opt.state)]);
    if (opt.block) await ctx.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
    const p = await ctx.newPage();
    p.setDefaultTimeout(4000);
    await p.clock.install({ time: opt.time || NOW });
    p.errors = []; p.on('console', m => m.type() === 'error' && p.errors.push(m.text())); p.on('pageerror', e => p.errors.push(String(e)));
    p.bad = []; p.on('response', r => { if (r.status() >= 400) p.bad.push(r.status() + ' ' + r.url()); });
    await p.goto(url, { waitUntil: 'networkidle' });
    return p;
}
const txt = async (p, sel) => ((await p.textContent(sel)) || '').replace(/\s+/g, ' ').trim();
const vis = (p, sel) => p.isVisible(sel);
const saved = p => p.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
const row = (p, name) => p.locator('#rows .row', { hasText: name });
const box = (p, name) => p.locator('#tests .test', { hasText: name });
async function overlaps(p) {
    return p.evaluate(() => {
        const els = [...document.querySelectorAll('input, select, button, a.secondary')].filter(e => e.offsetParent && e.getBoundingClientRect().width > 0);
        const bad = [];
        for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
            const a = els[i].getBoundingClientRect(), c = els[j].getBoundingClientRect();
            if (Math.min(a.right, c.right) - Math.max(a.left, c.left) > 2 && Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top) > 2) bad.push((els[i].id || els[i].className) + ' / ' + (els[j].id || els[j].className));
        }
        return bad;
    });
}
async function noHScroll(p) { return p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1); }
async function placeholdersFit(p) {
    return p.evaluate(() => [...document.querySelectorAll('input[placeholder]')].filter(i => i.offsetParent).filter(i => {
        const c = document.createElement('canvas').getContext('2d'), s = getComputedStyle(i);
        c.font = s.fontWeight + ' ' + s.fontSize + ' ' + s.fontFamily;
        const room = i.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight);
        return c.measureText(i.placeholder).width > room + 1;
    }).map(i => i.id + ': ' + i.placeholder));
}

(async () => {
    let srv;
    if (bi >= 0) url = process.argv[bi + 1].replace(/\/$/, '') + '/lab-test-results-tracker/';
    else { srv = await serve(); url = 'http://localhost:' + srv.address().port + '/apps/lab-test-results-tracker/'; }
    const b = await pw.chromium.launch();

    // ---- first use: empty state, nothing forced
    let p = await load(b, { width: 390, height: 844 });
    ok('empty: asks which tests', (await txt(p, '#no-tests')).includes('Which tests are on your report?'));
    ok('empty: no results yet', (await txt(p, '#sum-empty')).includes('No results yet'));
    ok('empty: Save hidden until there is a test', !await vis(p, '#save'));
    ok('empty: share buttons off', await p.isDisabled('#print') && await p.isDisabled('#copy') && await p.isDisabled('#csv') && (await p.getAttribute('#email', 'aria-disabled')) === 'true');
    ok('empty: lab name is optional and hidden', !await vis(p, '#lab') && await vis(p, '#lab-open'));
    ok('empty: date is today', (await p.inputValue('#date')) === '2026-10-21');
    ok('empty: common test chips', (await p.locator('.chip').count()) === 12);
    ok('empty: one person, no switcher', !await vis(p, '#people'));
    // Add this test with nothing chosen
    await p.click('#pick-add');
    ok('add test: nothing chosen', (await txt(p, '#test-msg')).includes('Choose a test'));

    // ---- the real situation: the April report, then the October report
    for (const c of ['HbA1c', 'Fasting sugar', 'LDL', 'Vitamin D']) await p.click('.chip:has-text("' + c + '")');
    ok('chips add rows', (await p.locator('#rows .row').count()) === 4);
    ok('chips: added ones are gone', !(await p.locator('.chip:has-text("HbA1c")').count()));
    ok('rows show the typical range', (await txt(p, '#rows .row >> nth=0')).includes('Normal range: 4.0–5.6 %'));
    // Save with nothing typed
    await p.click('#save');
    ok('save with no results: says type one', (await txt(p, '#add-msg')).includes('Type at least one result'));
    ok('nothing saved', (await saved(p)).people[0].tests.every(t => !t.results.length));
    // future date
    await p.fill('#date', '2026-11-02'); await row(p, 'HbA1c').locator('input.val').fill('7.1'); await p.click('#save');
    ok('future date refused', (await txt(p, '#date-err')).includes('in the future'));
    await p.fill('#date', '2026-04-03');
    await row(p, 'Fasting').locator('input.val').fill('132');
    await row(p, 'LDL').locator('input.val').fill('152');
    // a letter typo
    await row(p, 'Vitamin D').locator('input.val').fill('1x4');
    await p.click('#save');
    ok('typo: row error', (await txt(p, '#rows .row:has-text("Vitamin D") .err')).includes('Type a number'));
    ok('typo: nothing saved', (await saved(p)).people[0].tests.every(t => !t.results.length));
    ok('typo: other values kept', (await row(p, 'HbA1c').locator('input.val').inputValue()) === '7.1');
    await row(p, 'Vitamin D').locator('input.val').fill('14');
    // lab name (optional)
    await p.click('#lab-open'); await p.fill('#lab', 'City Lab');
    await row(p, 'Vitamin D').locator('input.val').press('Enter');
    let m = await txt(p, '#add-msg');
    ok('April saved: 4 results', m.startsWith('Saved 4 results for 3 Apr 2026.'), m);
    ok('April message: HbA1c above', m.includes('HbA1c (3-month sugar average): 7.1 %, above the range (4.0–5.6 %).'), m);
    ok('April message: vitamin D below', m.includes('Vitamin D (25-OH): 14 ng/mL, below the range (30–100 ng/mL).'), m);
    ok('form cleared after save', (await row(p, 'HbA1c').locator('input.val').inputValue()) === '' && (await txt(p, '#rows .row:has-text("HbA1c")')).includes('Last: 7.1 % on 3 Apr 2026'));
    ok('date kept for the next report', (await p.inputValue('#date')) === '2026-04-03');
    // undo then redo
    await p.click('#add-msg .undo');
    ok('undo removes the results', (await saved(p)).people[0].tests.every(t => !t.results.length));
    await p.reload({ waitUntil: 'networkidle' });
    ok('after reload: tests kept, lab kept', (await p.locator('#rows .row').count()) === 4 && (await p.inputValue('#lab')) === 'City Lab');
    await p.fill('#date', '2026-04-03');
    for (const [n, v] of [['HbA1c', '7.1'], ['Fasting', '132'], ['LDL', '152'], ['Vitamin D', '14']]) await row(p, n).locator('input.val').fill(v);
    await p.click('#save');
    // the October report: HbA1c 6.4, fasting 112, LDL 118, vitamin D from another lab in nmol/L with its own range
    await p.fill('#date', '2026-10-12');
    await row(p, 'HbA1c').locator('input.val').fill('6,4');
    await row(p, 'Fasting').locator('input.val').fill('112');
    await row(p, 'LDL').locator('input.val').fill('118');
    await row(p, 'Vitamin D').locator('select.unit').selectOption('nmol/L');
    ok('unit change shows that unit\'s range', (await txt(p, '#rows .row:has-text("Vitamin D") .row-range')).includes('75–250 nmol/L'));
    await row(p, 'Vitamin D').locator('input.val').fill('80');
    await row(p, 'Vitamin D').locator('button:has-text("Change range")').click();
    await row(p, 'Vitamin D').locator('input[id$="-r"]').fill('75 - 200');
    await p.click('#save');
    m = await txt(p, '#add-msg');
    ok('October saved', m.startsWith('Saved 4 results for 12 Oct 2026.'), m);
    ok('vitamin D in its own range', m.includes('Vitamin D (25-OH): 80 nmol/L, in the range (75–200 nmol/L).'), m);
    ok('next time suggests the last range in that unit', (await txt(p, '#rows .row:has-text("Vitamin D") .row-range')).includes('30–100 ng/mL'));
    // the answers
    ok('headline', (await txt(p, '#headline')) === '3 of 4 latest results are outside the normal range: HbA1c (3-month sugar average), Fasting blood sugar (glucose), LDL cholesterol ("bad").', await txt(p, '#headline'));
    ok('latest list: out of range first', (await txt(p, '#latest li >> nth=3')).startsWith('Vitamin D'));
    const hb = await txt(p, '#tests .test:has-text("HbA1c") .test-line');
    ok('HbA1c sentence', hb === '6.4 % on 12 Oct 2026, down 0.7 from 7.1 % on 3 Apr 2026. Above the range (4.0–5.6).', hb);
    const vd = await txt(p, '#tests .test:has-text("Vitamin D") .test-line');
    ok('vitamin D converted to ng/mL (80 / 2.496 = 32)', vd === '32 ng/mL on 12 Oct 2026, up 18 from 14 ng/mL on 3 Apr 2026. In the range (75–200 nmol/L).', vd);
    ok('converted value shown in the row', (await txt(p, '#tests .test:has-text("Vitamin D") .r >> nth=0')).includes('= 32 ng/mL'));
    ok('chart drawn with a band and red dots', (await p.locator('#tests .test:has-text("HbA1c") svg circle.pt.out').count()) === 2 && (await p.locator('#tests .test:has-text("HbA1c") svg rect.band').count()) === 1);
    ok('result boxes coloured by status', (await p.getAttribute('#tests .test:has-text("HbA1c")', 'data-status')) === 'high' && (await p.getAttribute('#tests .test:has-text("Vitamin D")', 'data-status')) === 'ok');

    // ---- edit a mistake, delete with undo
    await box(p, 'LDL').locator('.r >> nth=0').locator('button:has-text("Edit")').click();
    await box(p, 'LDL').locator('.r-edit input >> nth=1').fill('98');
    await box(p, 'LDL').locator('.r-edit button:has-text("Save")').click();
    ok('edit: saved', (await txt(p, '#list-msg')).startsWith('Saved the change: LDL cholesterol ("bad") 98 mg/dL on 12 Oct 2026.'), await txt(p, '#list-msg'));
    ok('edit: now in range', (await p.getAttribute('#tests .test:has-text("LDL")', 'data-status')) === 'ok');
    await p.click('#list-msg .undo');
    ok('edit: undo', (await txt(p, '#tests .test:has-text("LDL") .test-line')).startsWith('118 mg/dL'));
    // edit with a blank value and a bad range
    await box(p, 'LDL').locator('.r >> nth=0').locator('button:has-text("Edit")').click();
    await box(p, 'LDL').locator('.r-edit input >> nth=1').fill('');
    await box(p, 'LDL').locator('.r-edit input >> nth=2').fill('abc');
    await box(p, 'LDL').locator('.r-edit button:has-text("Save")').click();
    ok('edit: blank and bad range errors', (await txt(p, '#tests .test:has-text("LDL") .r-edit')).includes('Type the result, or tap Delete') && (await txt(p, '#tests .test:has-text("LDL") .r-edit')).includes('Type the range as printed'));
    await p.keyboard.press('Escape');
    ok('edit: Escape cancels', !(await p.locator('.r-edit').count()));
    await box(p, 'Fasting').locator('.r >> nth=0').locator('button:has-text("Delete")').click();
    ok('delete: message', (await txt(p, '#list-msg')).startsWith('Deleted Fasting blood sugar (glucose) 112 mg/dL from 12 Oct 2026.'));
    ok('delete: latest goes back', (await txt(p, '#tests .test:has-text("Fasting") .test-big')).startsWith('132'));
    await p.click('#list-msg .undo');
    ok('delete: undo', (await txt(p, '#tests .test:has-text("Fasting") .test-big')).startsWith('112'));

    // ---- own test with <, negative-allowed, decimals; duplicate name refused
    await p.selectOption('#pick', '__other');
    ok('custom fields shown', await vis(p, '#c-name'));
    await p.click('#pick-add');
    ok('custom: name needed', (await txt(p, '#c-name-err')).includes('Type the test name'));
    await p.fill('#c-name', 'CRP'); await p.fill('#c-unit', 'mg/L'); await p.fill('#c-range', 'normal');
    await p.click('#pick-add');
    ok('custom: bad range', (await txt(p, '#c-range-err')).includes('Type the range as printed'));
    await p.fill('#c-range', '<5'); await p.click('#pick-add');
    ok('custom: added', (await txt(p, '#test-msg')).startsWith('Added CRP.') && (await txt(p, '#rows .row:has-text("CRP") .row-range')).includes('<5 mg/L'));
    await p.selectOption('#pick', '__other'); await p.fill('#c-name', 'crp'); await p.click('#pick-add');
    ok('custom: duplicate refused', (await txt(p, '#c-name-err')).includes('already on your list'));
    await p.selectOption('#pick', 'hba1c').catch(() => {});
    ok('preset already added is not offered', !(await p.locator('#pick option[value="hba1c"]').count()));
    await p.fill('#date', '2026-10-20');
    await row(p, 'CRP').locator('input.val').fill('< 3');
    await p.click('#save');
    ok('"<3" saved and in range', (await txt(p, '#add-msg')).includes('CRP: <3 mg/L, in the range (<5 mg/L).'), await txt(p, '#add-msg'));
    // huge and zero
    await row(p, 'CRP').locator('input.val').fill('99999999'); await p.click('#save');
    ok('huge refused', (await txt(p, '#rows .row:has-text("CRP") .err')).includes('too big'));
    await row(p, 'CRP').locator('input.val').fill('0'); await p.click('#save');
    ok('zero accepted', (await txt(p, '#add-msg')).includes('CRP: 0 mg/L, in the range'));
    ok('same day twice: latest is the one added last', (await txt(p, '#tests .test:has-text("CRP") .test-line')).startsWith('0 mg/L on 20 Oct 2026, was <3 mg/L on 20 Oct 2026'));
    // a negative for a list test
    await row(p, 'LDL').locator('input.val').fill('-5'); await p.click('#save');
    ok('negative refused for LDL', (await txt(p, '#rows .row:has-text("LDL") .err')).includes('cannot be below 0'));
    await row(p, 'LDL').locator('input.val').fill('');

    // ---- edit test: show in mmol/L, rename, remove with undo
    await box(p, 'Fasting').locator('button:has-text("Edit test")').click();
    await box(p, 'Fasting').locator('.test-edit select').selectOption('mmol/L');
    await box(p, 'Fasting').locator('.test-edit button:has-text("Save")').click();
    ok('shown in mmol/L (112 / 18 = 6.2)', (await txt(p, '#tests .test:has-text("Fasting") .test-line')).startsWith('6.2 mmol/L on 12 Oct 2026, down 1.1 from 7.3 mmol/L'), await txt(p, '#tests .test:has-text("Fasting") .test-line'));
    await box(p, 'CRP').locator('button:has-text("Edit test")').click();
    await box(p, 'CRP').locator('button.danger').click();
    ok('remove test: message and undo', (await txt(p, '#list-msg')).startsWith('Removed CRP and 2 results.'));
    await p.click('#list-msg .undo');
    ok('remove test: back', (await p.locator('#tests .test:has-text("CRP")').count()) === 1);

    // ---- share
    await p.click('#copy');
    const clip = await p.evaluate(() => navigator.clipboard.readText());
    ok('copy: title and HbA1c line', clip.startsWith('Lab test results\n\nLatest results\n') && clip.includes('HbA1c (3-month sugar average): 6.4 % on 12 Oct 2026, down 0.7 from 7.1 % on 3 Apr 2026. Above the range (4.0–5.6).'), clip.slice(0, 300));
    ok('copy: all results', clip.includes('All results') && clip.includes('  3 Apr 2026: 152 mg/dL, above the range (<100 mg/dL), City Lab'));
    const href = await p.getAttribute('#email', 'href');
    ok('email: mailto with no address', href.startsWith('mailto:?subject=Lab%20test%20results&body=') && href.length < 2200);
    const dl = p.waitForEvent('download'); await p.click('#csv'); const f = await dl;
    const csv = fs.readFileSync(await f.path(), 'utf8');
    ok('csv: header and rows', csv.includes('Person,Test,Date,Result,Unit,Normal range,Inside the range?,Lab,Note') && csv.includes('Person 1,"HbA1c (3-month sugar average)",2026-04-03,7.1,%,4.0–5.6,Above the range,City Lab,') === false && csv.includes('HbA1c (3-month sugar average),2026-04-03,7.1,%,4.0–5.6,Above the range,City Lab,'), csv.slice(0, 400));
    await p.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
    ok('print report: summary table', (await p.locator('#report table >> nth=0').locator('tbody tr').count()) === 5 && (await p.locator('#report tr.out').count()) >= 3);

    // ---- second person, each their own tests
    await p.click('#person-add');
    ok('person 2: empty', (await p.locator('#rows .row').count()) === 0 && await vis(p, '#people'));
    await p.fill('#name', 'Ali');
    await p.click('.chip:has-text("TSH")');
    ok('person 2: own tests', (await p.locator('#rows .row').count()) === 1);
    await p.click('.person:has-text("Person 1")');
    ok('switch back: own tests', (await p.locator('#rows .row').count()) === 5);
    // reload keeps everything
    await p.reload({ waitUntil: 'networkidle' });
    ok('reload: both people kept', (await p.locator('.person').count()) === 2 && (await p.locator('#tests .test').count()) === 5);
    ok('no console errors (main run)', !p.errors.length, p.errors);
    // backup and restore (corrupt and good)
    const dl2 = p.waitForEvent('download'); await p.click('#backup'); const bf = await dl2; const bpath = await bf.path();
    await p.setInputFiles('#restore-file', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"people":"no"}') });
    await p.waitForTimeout(200);
    ok('restore: junk refused', (await txt(p, '#set-msg')).includes('not a backup'));
    await p.click('#wipe');
    ok('delete all: with undo', (await txt(p, '#set-msg')).startsWith('Deleted 5 tests and') && (await p.locator('#rows .row').count()) === 0);
    await p.setInputFiles('#restore-file', bpath);
    await p.waitForTimeout(200);
    ok('restore: good backup', (await txt(p, '#set-msg')).startsWith('Backup restored: 2 people') && (await p.locator('#tests .test').count()) === 5);
    await p.context().close();

    // ---- corrupt and blocked storage
    p = await load(b, { width: 390, height: 844 }, { state: '{not json' });
    ok('corrupt state: starts fresh', (await txt(p, '#no-tests')).includes('Which tests') && !p.errors.length, p.errors);
    await p.context().close();
    p = await load(b, { width: 390, height: 844 }, { state: { people: [{ id: 'x', tests: [{ key: 'hba1c', results: [{ date: '2026-01-01', v: 'bad' }, { date: '2026-02-01', v: 6.1, unit: '%' }] }] }] } });
    ok('half-bad state: good result kept', (await txt(p, '#tests .test-line')).startsWith('6.1 % on 1 Feb 2026') && !p.errors.length, p.errors);
    await p.context().close();
    p = await load(b, { width: 390, height: 844 }, { block: true });
    ok('blocked storage: warns, still works', (await txt(p, '#add-msg')).includes('not letting the app save') && !p.errors.length, p.errors);
    await p.click('.chip:has-text("TSH")'); await row(p, 'TSH').locator('input.val').fill('2.4'); await p.click('#save');
    ok('blocked storage: saves for the session', (await txt(p, '#add-msg')).includes('Saved 1 result'));
    await p.context().close();

    // ---- layouts with a filled state: no sideways scroll, no overlapping controls, placeholders fit
    for (const theme of ['dark', 'light']) for (const w of [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920]) {
        p = await load(b, { width: w, height: 900 }, { state: sara(), theme });
        await p.click('#lab-open').catch(() => {});
        await row(p, 'Vitamin D').locator('button:has-text("Change range")').click();
        await p.selectOption('#pick', '__other');
        await box(p, 'LDL').locator('.r >> nth=0').locator('button:has-text("Edit")').click();
        await box(p, 'TSH').locator('button:has-text("Edit test")').click();
        ok(theme + ' ' + w + ': no sideways scroll', await noHScroll(p));
        if (w <= 390) {
            const o = await overlaps(p); ok(theme + ' ' + w + ': no overlapping controls', !o.length, o);
            const ph = await placeholdersFit(p); ok(theme + ' ' + w + ': placeholders fit', !ph.length, ph);
        }
        if (w >= 900) {
            for (const pos of [0, 0.5, 1]) {
                await p.evaluate(f => scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * f), pos);
                const bad = await p.evaluate(() => {
                    const out = [];
                    for (const parent of [document.querySelector('main'), document.querySelector('.col-main'), document.querySelector('.col-side')]) {
                        const kids = [...parent.children].filter(e => e.offsetParent && getComputedStyle(e).display !== 'contents').map(e => [e, e.getBoundingClientRect()]);
                        for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
                            const a = kids[i][1], c = kids[j][1];
                            if (Math.min(a.right, c.right) - Math.max(a.left, c.left) > 1 && Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top) > 1) out.push(kids[i][0].className + ' / ' + kids[j][0].className);
                        }
                    }
                    return out;
                });
                ok(theme + ' ' + w + ': no blocks overlap at scroll ' + pos, !bad.length, bad);
            }
        }
        ok(theme + ' ' + w + ': no errors', !p.errors.length, p.errors);
        await p.context().close();
        // cleared state at this width too
        p = await load(b, { width: w, height: 900 }, { theme });
        ok(theme + ' ' + w + ' empty: no sideways scroll', await noHScroll(p));
        if (w <= 390) { const o = await overlaps(p); ok(theme + ' ' + w + ' empty: no overlapping controls', !o.length, o); }
        await p.context().close();
    }

    // ---- Help dialog
    for (const w of [320, 390, 820, 1280]) {
        p = await load(b, { width: w, height: 800 });
        await p.click('.help-btn');
        const r = await p.locator('dialog.help').boundingBox();
        ok('help ' + w + ': open and on screen', r && r.x >= 0 && r.y >= 0 && r.x + r.width <= w && r.y + r.height <= 800 && (await txt(p, 'dialog.help h2')) === 'How to use Lab Test Results Tracker');
        await p.keyboard.press('Escape');
        ok('help ' + w + ': Escape closes', !await p.evaluate(() => document.querySelector('dialog.help').open));
        await p.click('.help-btn'); await p.click('.help-close');
        ok('help ' + w + ': Got it closes', !await p.evaluate(() => document.querySelector('dialog.help').open));
        const tb = await p.evaluate(() => { const r = [...document.querySelectorAll('.topbar > *')].map(e => e.getBoundingClientRect()); return r.every(a => Math.abs(a.top - r[0].top) < 4); });
        ok('help ' + w + ': top bar on one line', tb);
        await p.context().close();
    }

    // ---- light/dark switch
    p = await load(b, { width: 390, height: 844 }, { theme: 'dark' });
    const bg1 = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await p.click('.theme-toggle');
    const bg2 = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
    ok('light/dark switch changes the look', bg1 !== bg2 && (await p.getAttribute('html', 'data-theme')) === 'light');
    await p.context().close();

    // ---- screenshots and files
    p = await load(b, { width: 1280, height: 1000 }, { state: sara() });
    await p.evaluate(() => document.activeElement && document.activeElement.blur());
    if (shots) await p.screenshot({ path: path.join(__dirname, 'screenshots/desktop.png'), clip: { x: 0, y: 0, width: 1280, height: 1800 }, fullPage: true });
    await p.context().close();
    p = await load(b, { width: 390, height: 844 }, { state: sara() });
    if (shots) {
        await p.evaluate(() => document.getElementById('summary').scrollIntoView());
        await p.evaluate(() => scrollBy(0, -12));
        await p.screenshot({ path: path.join(__dirname, 'screenshots/phone.png') });
    }
    for (const f of ['favicon.svg', 'manifest.webmanifest', 'sw.js', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', '../help.js', '../theme.js', 'screenshots/desktop.png', 'screenshots/phone.png', 'core.js', 'script.js', 'style.css']) {
        const r = await p.request.get(new URL(f, url).href);
        ok('file ' + f + ' returns 200', r.status() === 200);
    }
    ok('every file the page asked for loaded', !p.bad.length, p.bad);
    await p.context().close();

    await b.close(); if (srv) srv.close();
    console.log(fail ? '\n' + fail + ' FAILED' : '\nALL UI TESTS PASSED');
    process.exitCode = fail ? 1 : 0;
})();
