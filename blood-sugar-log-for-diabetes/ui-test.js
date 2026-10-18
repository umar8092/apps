// Drives the real page in headless Chromium: node ui-test.js [--shots] [--base https://umar8092.github.io/apps]
// Without --base it serves this repo on localhost. With --base it tests the LIVE page. The clock is Sun 18 Oct 2026, 9:45 p.m.
const pw = (() => { for (const m of ['playwright', 'playwright-core']) { try { return require(m); } catch (e) { /* next */ } } throw new Error('playwright not found'); })();
const path = require('path'), fs = require('fs'), http = require('http'), os = require('os');
const bi = process.argv.indexOf('--base');
const shots = process.argv.includes('--shots');
let fail = 0, url;
const ok = (name, cond, extra) => { if (!cond) fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond || extra == null ? '' : '  -> ' + JSON.stringify(extra))); };
const NOW = new Date(2026, 9, 18, 21, 45).getTime();
const KEY = 'blood-sugar-log-for-diabetes.state';

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

// Tariq's week from the README: fasting every morning, 2 hours after dinner every evening, one low before lunch on Friday
function week(extra) {
    const FAST = [142, 136, 131, 128, 125, 122, 118], AFTER = [210, 195, 188, 176, 169, 182, 160];
    const NOTES = { 2: 'biryani at a wedding', 9: 'walked 30 min after dinner' };
    const rs = []; let k = 0;
    FAST.forEach((v, i) => rs.push({ id: 'f' + i, t: '2026-10-' + (12 + i) + 'T07:15', tag: 'fasting', v, u: 'mg', hl: '', note: '' }));
    AFTER.forEach((v, i) => rs.push({ id: 'a' + i, t: '2026-10-' + (12 + i) + 'T21:30', tag: 'after2', v, u: 'mg', hl: '', note: i === 0 ? NOTES[2] : i === 4 ? NOTES[9] : '' }));
    rs.push({ id: 'b0', t: '2026-10-16T12:40', tag: 'before', v: 64, u: 'mg', hl: '', note: 'skipped breakfast, felt shaky' });
    k = rs.length;
    return Object.assign({ people: [{ id: 'p1', name: 'Tariq Ahmed', unit: 'mg', preset: 'ada', readings: rs }], current: 'p1', period: '14' }, extra || {});
}

async function load(b, vp, opt = {}) {
    const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: vp.width < 500 ? 2 : 1, colorScheme: opt.theme || 'dark', locale: opt.locale || 'en-GB',
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
const txt = async (p, sel) => ((await p.textContent(sel)) || '').replace(/\s+/g, ' ').trim();
const vis = (p, sel) => p.isVisible(sel);
const saved = p => p.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
async function add(p, v, tag) { await p.fill('#val', String(v)); if (tag) await p.click('#tags [data-tag="' + tag + '"]'); await p.click('#save'); }

(async () => {
    let srv;
    if (bi >= 0) url = process.argv[bi + 1].replace(/\/$/, '') + '/blood-sugar-log-for-diabetes/';
    else { srv = await serve(); url = 'http://localhost:' + srv.address().port + '/apps/blood-sugar-log-for-diabetes/'; }
    const b = await pw.chromium.launch();
    let p;

    // ---- first use: empty, nothing forced
    p = await load(b, { width: 390, height: 844 });
    ok('first use: empty state', (await txt(p, '#sum-empty')).includes('No readings yet') && !await vis(p, '#sum-body'));
    ok('first use: share buttons off', await p.isDisabled('#print') && await p.isDisabled('#copy') && (await p.getAttribute('#email', 'aria-disabled')) === 'true');
    ok('first use: note is optional and hidden', !await vis(p, '#note') && await vis(p, '#note-open'));
    ok('first use: low plan optional and hidden', !await vis(p, '#plan') && await vis(p, '#plan-open'));
    ok('first use: mg/dL for en-GB? no: GB uses mmol/L', (await txt(p, '#val-unit')) === '(mmol/L)' && (await p.getAttribute('#val', 'placeholder')) === 'e.g. 7.0');
    ok('first use: wipe disabled', await p.isDisabled('#wipe'));
    await p.click('#save');
    ok('blank: asks for the number and the time', (await txt(p, '#val-err')).startsWith('Type the number') && (await txt(p, '#tag-err')).startsWith('Choose when'));
    ok('blank: nothing saved', (await saved(p)) === null);
    await add(p, 'abc', 'fasting');
    ok('letters refused', (await txt(p, '#val-err')).includes('as a number'));
    await add(p, '-5');
    ok('negative refused', (await txt(p, '#val-err')).includes('as a number'));
    // mmol/L person types an mg/dL number: asked, and a button saves it as mg/dL
    await add(p, '130');
    ok('130 in mmol/L: asks', (await txt(p, '#val-err')).includes('looks like mg/dL') && (await txt(p, '#suggest')) === 'Save as 130 mg/dL');
    await p.click('#suggest');
    ok('suggest saves converted', (await txt(p, '#add-msg')).startsWith('Saved 7.2 mmol/L, fasting (on waking), at') && (await txt(p, '#add-msg')).includes('in target (4.4 to 7.2 mmol/L)') && (await txt(p, '#add-msg')).includes('You typed 130 mg/dL'));
    const s1 = await saved(p);
    ok('stored as typed', s1.people[0].readings[0].v === 130 && s1.people[0].readings[0].u === 'mg');
    ok('after save: box cleared and time choice reset', (await p.inputValue('#val')) === '' && (await p.locator('#tags [aria-pressed="true"]').count()) === 0);
    await p.click('#add-msg .undo');
    ok('undo removes it', (await saved(p)).people[0].readings.length === 0 && (await txt(p, '#sum-empty')).includes('No readings yet'));
    // typed unit wins; Enter saves
    await p.fill('#val', '126 mg/dL'); await p.click('#tags [data-tag="before"]'); await p.press('#val', 'Enter');
    ok('typed unit and Enter', (await txt(p, '#add-msg')).startsWith('Saved 7.0 mmol/L, before a meal'));
    await p.context().close();

    // ---- the main situation: Tariq's week, in mg/dL
    p = await load(b, { width: 1280, height: 900 }, { state: week() });
    ok('week: 47% in target', (await txt(p, '#pct')) === '47%');
    ok('week: meta', (await txt(p, '#pct-meta')) === '7 of 15 readings in your target ranges, over 7 days, Mon, 12 Oct to Sun, 18 Oct 2026.', await txt(p, '#pct-meta'));
    const tags = await p.$$eval('#bytag .bt', l => l.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
    ok('week: fasting line', tags[0] === 'Fasting (on waking)129 mg/dLTarget 80 to 130 mg/dL. 7 readings, 3 above target.', tags[0]);
    ok('week: before line', tags[1] === 'Before a meal64 mg/dLTarget 80 to 130 mg/dL. 1 reading, 1 below target or low.', tags[1]);
    ok('week: after line', tags[2] === '2 hours after a meal183 mg/dLTarget under 180 mg/dL. 7 readings, 4 above target.', tags[2]);
    ok('week: tiles', (await txt(p, '#t-avg')) === '150' && (await txt(p, '#t-hi')) === '210' && (await txt(p, '#t-lo')) === '64' && (await txt(p, '#t-lows')) === '1');
    ok('week: low warning', (await txt(p, '#sum-warn')).startsWith('1 low reading (under 70): 64 mg/dL on Fri, 16 Oct, 12:40.'), await txt(p, '#sum-warn'));
    ok('week: chart has 15 dots', (await p.locator('#chart circle').count()) === 15 && (await p.locator('#chart circle.lowd').count()) === 1);
    ok('week: list grouped in 7 days', (await p.locator('.day').count()) === 7 && (await txt(p, '#list-h')) === 'Readings (15)');
    ok('week: note shown', (await txt(p, '#days')).includes('skipped breakfast, felt shaky'));
    if (shots) await p.screenshot({ path: path.join(__dirname, 'screenshots/desktop.png') });
    // share
    const mail = decodeURIComponent(await p.getAttribute('#email', 'href'));
    ok('email: no address needed, summary inside', mail.startsWith('mailto:?subject=Blood sugar readings: Tariq Ahmed&body=') && mail.includes('Fasting (on waking): average 129 mg/dL from 7 readings, 3 above, 0 below (target 80 to 130 mg/dL)') && mail.includes('In target: 7 of 15 (47%)'));
    await p.click('#copy');
    const clip = await p.evaluate(() => navigator.clipboard.readText());
    ok('copy: text with readings', clip.includes('64 mg/dL  before a meal  LOW  (skipped breakfast, felt shaky)') && clip.includes('Made with Blood Sugar Log for Diabetes'), clip.slice(0, 300));
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#csv')]);
    const csvText = fs.readFileSync(await dl.path(), 'utf8');
    ok('csv download', dl.suggestedFilename() === 'blood-sugar-tariq-ahmed-2026-10-12-to-2026-10-18.csv' && csvText.includes('2026-10-16,12:40,64,Before a meal,Low,"skipped breakfast, felt shaky"'), dl.suggestedFilename());
    await p.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
    const rep = await txt(p, '#report');
    ok('print: log book table', (await p.locator('#report th').count()) === 5 && rep.includes('Fasting (mg/dL)') && rep.includes('64 L') && rep.includes('142 *'), rep.slice(0, 200));
    await p.emulateMedia({ media: 'print' });
    ok('print: only the report shows', await vis(p, '#report') && !await vis(p, '#add'));
    await p.emulateMedia({ media: 'screen' });
    // add, low and very high messages
    await add(p, 130, 'fasting');
    ok('add 130 fasting: in target', (await txt(p, '#add-msg')).includes('Saved 130 mg/dL, fasting (on waking), at 21:45: in target (80 to 130 mg/dL).'), await txt(p, '#add-msg'));
    ok('add: summary updates', (await txt(p, '#pct')) === '50%');
    await p.click('#add-msg .undo');
    ok('undo: back to 47%', (await txt(p, '#pct')) === '47%');
    await add(p, 65, 'bedtime');
    ok('low: advice', (await txt(p, '#add-msg')).includes(': low.') && (await txt(p, '#add-msg')).includes('15 g of fast sugar') && (await p.getAttribute('#add-msg', 'class')).includes('bad'));
    await add(p, 'HI', 'after1');
    ok('HI: very high with advice', (await txt(p, '#add-msg')).includes('Saved HI, 1 hour after a meal') && (await txt(p, '#add-msg')).includes('Very high: drink water'));
    ok('HI: highest is HI, not in average', (await txt(p, '#t-hi')) === 'HI' && (await txt(p, '#t-avg-n')).includes('HI and LO left out'));
    await add(p, 'lo', 'night');
    ok('LO: very low with emergency advice', (await txt(p, '#add-msg')).includes('very low') && (await txt(p, '#add-msg')).includes('call emergency services'));
    ok('LO: lowest tile', (await txt(p, '#t-lo')) === 'LO');
    await add(p, 'lo', 'night');
    ok('double tap: warned', (await txt(p, '#add-msg')).includes('You already had the same reading'));
    await add(p, '7.2');
    ok('7.2 in mg/dL: asks', (await txt(p, '#val-err')).includes('looks like mmol/L') && (await txt(p, '#suggest')) === 'Save as 7.2 mmol/L');
    await p.fill('#val', '7.3');
    ok('typing hides the old suggestion', !await vis(p, '#suggest'));
    await add(p, '9999');
    ok('too high', (await txt(p, '#val-err')).includes('higher than a meter can show'));
    await add(p, '130.5');
    ok('decimal in mg/dL', (await txt(p, '#val-err')).includes('whole numbers'));
    await add(p, '1'.repeat(24));
    ok('pasted junk', (await txt(p, '#val-err')).length > 10);
    await p.context().close();

    // ---- time: earlier time with its day, future refused, after midnight counts for the day before
    p = await load(b, { width: 390, height: 844 }, { state: week() });
    await p.click('#when-open');
    await p.fill('#when', '2026-10-19T08:00'); await add(p, 120, 'fasting');
    ok('future time refused', (await txt(p, '#when-err')).includes('in the future'));
    await p.fill('#when', '2026-10-17T02:30'); await p.click('#tags [data-tag="night"]'); await p.click('#save');
    ok('earlier time saved with its day', (await txt(p, '#add-msg')).includes('Sat, 17 Oct, 02:30'), await txt(p, '#add-msg'));
    ok('time box closes after save', !await vis(p, '#when-box') && (await txt(p, '#when-text')) === 'now');
    const fri = await p.locator('.day', { hasText: 'Fri, 16 Oct 2026' }).textContent();
    ok('02:30 on Saturday listed under Friday', fri.includes('Sat, 17 Oct, 02:30'));
    // note box opens, stays open after reload
    await p.click('#note-open'); await p.fill('#note', 'x'.repeat(250)); await add(p, 140, 'after2');
    ok('long note cut to 200', (await saved(p)).people[0].readings.some(r => r.note.length === 200));
    await p.reload({ waitUntil: 'networkidle' });
    ok('reload: readings kept, note box remembered', (await txt(p, '#list-h')) === 'Readings (17)' && await vis(p, '#note'));
    ok('320/390: no sideways scroll with a long note', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await p.context().close();

    // ---- edit, delete, undo
    p = await load(b, { width: 390, height: 844 }, { state: week() });
    await p.click('.rd >> nth=0 >> text=Edit');
    await p.fill('.rd-edit input >> nth=0', '155'); await p.keyboard.press('Escape');
    ok('edit: Escape cancels', !(await saved(p)).people[0].readings.some(r => r.v === 155) && !await p.locator('.rd-edit').count());
    await p.click('.rd >> nth=0 >> text=Edit');
    await p.fill('.rd-edit input >> nth=0', '155'); await p.selectOption('.rd-edit select', 'bedtime'); await p.click('.rd-edit >> text=Save');
    ok('edit: saved', (await txt(p, '#list-msg')).startsWith('Saved the change: 155 mg/dL, bedtime, Sun, 18 Oct, 07:15 (above target)'), await txt(p, '#list-msg'));
    await p.click('#list-msg .undo');
    ok('edit: undo', (await saved(p)).people[0].readings.find(r => r.id === 'f6').v === 118);
    await p.click('.rd >> nth=0 >> text=Edit');
    await p.fill('.rd-edit input >> nth=0', ''); await p.click('.rd-edit >> text=Save');
    ok('edit: blank refused', (await p.locator('.rd-edit .err >> nth=0').textContent()).startsWith('Type the number'));
    await p.click('.rd-edit >> text=Cancel');
    await p.click('.rd >> nth=0 >> text=Delete');
    ok('delete', (await txt(p, '#list-h')) === 'Readings (14)' && (await txt(p, '#list-msg')).startsWith('Deleted 118 mg/dL'));
    await p.click('#list-msg .undo');
    ok('delete: undo', (await txt(p, '#list-h')) === 'Readings (15)');
    await p.context().close();

    // ---- units and targets
    p = await load(b, { width: 390, height: 844 }, { state: week() });
    await p.selectOption('#unit', 'mmol');
    ok('mmol: averages converted', (await p.$$eval('#bytag .bt-avg', l => l.map(e => e.textContent))).join('|') === '7.2 mmol/L|3.6 mmol/L|10.1 mmol/L');
    ok('mmol: same result', (await txt(p, '#pct')) === '47%' && (await txt(p, '#set-msg')).includes('Nothing you typed was changed'));
    ok('mmol: input label', (await txt(p, '#val-unit')) === '(mmol/L)');
    ok('mmol: stored values unchanged', (await saved(p)).people[0].readings[0].v === 142);
    await p.selectOption('#unit', 'mg');
    await p.click('#targets-open');
    ok('targets: 7 rows', (await p.locator('.trow').count()) === 7);
    await p.fill('.trow[data-tag="fasting"] input >> nth=1', '140');
    ok('targets: own value switches to doctor targets', (await p.inputValue('#preset')) === 'custom' && (await p.$$eval('#bytag .bt-sub', l => l[0].textContent)).includes('Target 80 to 140 mg/dL. 7 readings, 1 above target.'));
    await p.fill('.trow[data-tag="fasting"] input >> nth=1', '60');
    ok('targets: wrong order refused', (await txt(p, '#targets-err')).includes('first number must be lower'));
    await p.fill('.trow[data-tag="fasting"] input >> nth=1', '140');
    await p.reload({ waitUntil: 'networkidle' });
    ok('targets: kept after reload', (await p.inputValue('#preset')) === 'custom' && (await p.$$eval('#bytag .bt-sub', l => l[0].textContent)).includes('80 to 140'));
    await p.selectOption('#preset', 'preg');
    ok('pregnancy targets', (await p.$$eval('#bytag .bt-sub', l => l[0].textContent)).includes('Target under 95 mg/dL. 7 readings, 7 above target.') && (await txt(p, '#set-msg')).includes('Pregnancy with diabetes'));
    await p.click('#set-msg .undo');
    ok('preset undo', (await p.inputValue('#preset')) === 'custom');
    await p.selectOption('#preset', 'ada');
    ok('back to ADA', (await p.$$eval('#bytag .bt-sub', l => l[0].textContent)).includes('Target 80 to 130'));
    await p.click('#plan-open'); await p.fill('#plan', 'Take 4 glucose tablets and call Dr Khan');
    await add(p, 60, 'fasting');
    ok('own low plan used', (await txt(p, '#add-msg')).includes('Your low-sugar plan: Take 4 glucose tablets and call Dr Khan'));
    await p.context().close();

    // ---- period and dates
    p = await load(b, { width: 390, height: 844 }, { state: week() });
    await p.selectOption('#period', '7');
    ok('last 7 days', (await txt(p, '#list-h')) === 'Readings (15)');
    await p.selectOption('#period', 'dates');
    await p.fill('#from', '2026-10-17');
    await p.fill('#to', '2026-10-13');
    ok('dates swapped', (await txt(p, '#dates-err')).includes('swapped') && (await txt(p, '#list-h')) === 'Readings (11)', await txt(p, '#list-h'));
    await p.fill('#to', '2026-11-05');
    await p.fill('#from', '2026-11-01');
    ok('no readings in these days', (await txt(p, '#sum-empty-text')).includes('No readings in these days') && await p.isDisabled('#print'));
    await p.context().close();

    // ---- people, backup and restore, delete all
    p = await load(b, { width: 390, height: 844 }, { state: week() });
    await p.click('#person-add');
    ok('second person: empty and own', (await txt(p, '#sum-empty')).includes('No readings yet') && await vis(p, '#people') && (await p.locator('.person').count()) === 2);
    await p.fill('#name', 'Amina'); await p.selectOption('#unit', 'mmol'); await p.selectOption('#preset', 'preg');
    await add(p, '5.1', 'fasting');
    ok('second person: own unit and targets', (await txt(p, '#add-msg')).includes('in target (under 5.3 mmol/L)'));
    await p.click('.person >> text=Tariq Ahmed');
    ok('switch back keeps Tariq', (await txt(p, '#pct')) === '47%' && (await p.inputValue('#unit')) === 'mg');
    const [bk] = await Promise.all([p.waitForEvent('download'), p.click('#backup')]);
    const bkPath = path.join(os.tmpdir(), 'sugar-backup-test.json'); await bk.saveAs(bkPath);
    ok('backup message', (await txt(p, '#set-msg')).includes('Backup saved with 16 readings'));
    await p.click('#wipe');
    ok('delete all of Tariq', (await txt(p, '#sum-empty')).includes('No readings yet') && (await txt(p, '#set-msg')).startsWith('Deleted 15 readings'));
    await p.click('#set-msg .undo');
    ok('delete all: undo', (await txt(p, '#pct')) === '47%');
    await p.click('#person-remove');
    ok('remove person', !await vis(p, '#people') && (await txt(p, '#set-msg')).includes('Removed Tariq Ahmed'));
    await p.setInputFiles('#restore-file', bkPath);
    await p.waitForFunction(() => document.getElementById('set-msg').textContent.includes('restored'));
    ok('restore backup', (await txt(p, '#set-msg')).includes('Backup restored: 2 people, 16 readings') && (await p.locator('.person').count()) === 2);
    const badPath = path.join(os.tmpdir(), 'sugar-bad.json'); fs.writeFileSync(badPath, '{"hello":1}');
    await p.setInputFiles('#restore-file', badPath);
    await p.waitForFunction(() => document.getElementById('set-msg').textContent.includes('not a backup'));
    ok('bad backup refused', (await p.locator('.person').count()) === 2);
    ok('no errors in the main run', !p.errors.length, p.errors);
    await p.context().close();

    // ---- US locale defaults to mg/dL; corrupt and blocked storage
    p = await load(b, { width: 390, height: 844 }, { locale: 'en-US' });
    ok('en-US: mg/dL', (await txt(p, '#val-unit')) === '(mg/dL)');
    await p.context().close();
    p = await load(b, { width: 390, height: 844 }, { state: '{bad json' });
    ok('corrupt saved data: starts fresh', (await txt(p, '#sum-empty')).includes('No readings yet') && !p.errors.length, p.errors);
    await add(p, '6.1', 'fasting');
    ok('corrupt: can save again', (await saved(p)).people[0].readings.length === 1);
    await p.context().close();
    p = await load(b, { width: 390, height: 844 }, { state: JSON.stringify({ people: [{ name: 'X', unit: 'mg', readings: [{ t: 'nope', v: 'a' }, { t: '2026-10-18T07:00', tag: 'fasting', v: 9000, u: 'mg' }, { id: 'ok', t: '2026-10-18T07:00', tag: 'fasting', v: 101, u: 'mg' }] }], period: 'zzz' }) });
    ok('bad values dropped, good kept', (await txt(p, '#t-avg')) === '101' && (await p.inputValue('#period')) === '14');
    await p.context().close();
    p = await load(b, { width: 390, height: 844 }, { block: true });
    ok('blocked storage: notice', (await txt(p, '#add-msg')).includes('not letting the app save'));
    await add(p, '6.4', 'fasting');
    ok('blocked storage: still works for now', (await txt(p, '#pct')) === '100%' && (await txt(p, '#add-msg')).includes('lost when the page is closed'));
    ok('blocked storage: no errors', !p.errors.length, p.errors);
    await p.context().close();

    // ---- huge log stays quick
    const big = week({ period: 'all' }); big.people[0].name = 'A very long name that goes on and on and on';
    for (let i = 0; i < 3000; i++) { const d = new Date(2022, 0, 1 + Math.floor(i / 3)); big.people[0].readings.push({ id: 'h' + i, t: d.toISOString().slice(0, 10) + ['T07:00', 'T13:00', 'T21:00'][i % 3], tag: ['fasting', 'after2', 'bedtime'][i % 3], v: 90 + (i % 120), u: 'mg', hl: '' }); }
    p = await load(b, { width: 320, height: 700 }, { state: big });
    ok('3015 readings: summary shown', (await txt(p, '#pct-meta')).includes('of 3015 readings'), await txt(p, '#pct-meta'));
    ok('320px: no sideways scroll with long text', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await p.context().close();

    // ---- screen sizes and themes with a filled-in log and with an empty one, scroll overlap, narrow-phone layout
    for (const theme of ['dark', 'light']) for (const st of [week(), null]) for (const w of [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920]) {
        p = await load(b, { width: w, height: 800 }, st ? { state: st, theme } : { theme });
        const tag = theme + ' ' + w + (st ? ' filled' : ' empty');
        if (w <= 390) {
            await p.click('#note-open'); await p.click('#when-open'); await p.click('#targets-open'); await p.click('#plan-open');
            await add(p, '7.2 x');   // shows errors under the box
            await p.click('.rd >> nth=0 >> text=Edit').catch(() => {});
        }
        const hs = await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
        if (!hs) ok(tag + ': no sideways scroll', false);
        if (w <= 390) {
            const o = await p.evaluate(() => { const k = [...document.querySelectorAll('input:not([type=checkbox]):not([type=file]), select, button, a.secondary, textarea')].filter(e => e.getBoundingClientRect().width > 0); const bad = [];
                for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { const a = k[i].getBoundingClientRect(), c = k[j].getBoundingClientRect(); if (Math.min(a.right, c.right) - Math.max(a.left, c.left) > 2 && Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top) > 2) bad.push((k[i].id || k[i].textContent) + '/' + (k[j].id || k[j].textContent)); } return bad; });
            if (o.length) ok(tag + ': controls do not overlap', false, o.slice(0, 3));
            const ph = await p.evaluate(() => [...document.querySelectorAll('input[placeholder], textarea[placeholder]')].filter(i => i.getBoundingClientRect().width > 0).filter(i => { const c = document.createElement('canvas').getContext('2d'); const cs = getComputedStyle(i); c.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily; return i.tagName === 'INPUT' && c.measureText(i.placeholder).width > i.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight); }).map(i => i.id));
            if (ph.length) ok(tag + ': placeholders fit', false, ph);
            const clip = await p.evaluate(() => [...document.querySelectorAll('.chip, .trow input, .tile, .bt')].filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.className + ':' + e.textContent));
            if (clip.length) ok(tag + ': nothing clipped', false, clip.slice(0, 3));
        }
        if (w >= 900) for (const pos of [0, 0.5, 1]) {
            await p.evaluate(x => scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * x), pos);
            const ov = await p.evaluate(() => { const bad = []; document.querySelectorAll('main, .col-main, .col-side').forEach(h => { const k = [...h.children].filter(c => c.getBoundingClientRect().height > 4 && getComputedStyle(c).display !== 'none');
                for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { const a = k[i].getBoundingClientRect(), c = k[j].getBoundingClientRect(); if (Math.min(a.right, c.right) - Math.max(a.left, c.left) > 4 && Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top) > 4) bad.push(k[i].className + '/' + k[j].className); } }); return bad; });
            if (ov.length) ok(tag + ' scroll ' + pos + ': no overlap', false, ov);
        }
        if (w === 1280 && st) { const r = await p.evaluate(() => [document.querySelector('.col-main').getBoundingClientRect().width, document.querySelector('.app').getBoundingClientRect().width]); if (!(r[1] > 1000 && r[0] > 400)) ok(tag + ': desktop uses its width', false, r); }
        if (p.errors.length) ok(tag + ': no errors', false, p.errors);
        await p.context().close();
    }
    ok('sizes 320-1920, dark and light, filled and empty: no sideways scroll, overlaps, clipping or cut placeholders', true);

    // ---- help dialog and top bar at 4 widths
    for (const w of [320, 390, 820, 1280]) {
        p = await load(b, { width: w, height: 800 });
        await p.click('.help-btn');
        const r = await p.locator('dialog.help').boundingBox();
        ok('help ' + w + ': open and on screen', r && r.x >= 0 && r.y >= 0 && r.x + r.width <= w && r.y + r.height <= 800 && (await txt(p, 'dialog.help h2')) === 'How to use Blood Sugar Log for Diabetes');
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

    // ---- phone screenshot and files
    p = await load(b, { width: 390, height: 844 }, { state: week() });
    if (shots) {
        await p.evaluate(() => document.getElementById('summary').scrollIntoView());
        await p.evaluate(() => scrollBy(0, -12));
        await p.screenshot({ path: path.join(__dirname, 'screenshots/phone.png') });
    }
    for (const f of ['favicon.svg', 'manifest.webmanifest', 'sw.js', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', '../help.js', '../theme.js', 'screenshots/desktop.png', 'screenshots/phone.png']) {
        const r = await p.request.get(new URL(f, url).href);
        ok('file ' + f + ' returns 200', r.status() === 200);
    }
    ok('every file the page asked for loaded', !p.bad.length, p.bad);
    await p.context().close();

    await b.close(); if (srv) srv.close();
    console.log(fail ? '\n' + fail + ' FAILED' : '\nALL UI TESTS PASSED');
    process.exitCode = fail ? 1 : 0;
})();
