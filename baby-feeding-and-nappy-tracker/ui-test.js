// Drives the real page in headless Chromium: node ui-test.js [--shots] [--base https://umar8092.github.io/apps]
// Without --base it serves this repo on localhost. With --base it tests the LIVE page. The clock starts at 13 Oct 2026, 1:00 a.m.
const pw = (() => { for (const m of ['playwright', 'playwright-core']) { try { return require(m); } catch (e) { /* next */ } } throw new Error('playwright not found'); })();
const path = require('path'), fs = require('fs'), http = require('http'), os = require('os');
const bi = process.argv.indexOf('--base');
const shots = process.argv.includes('--shots');
let fail = 0, url;
const ok = (name, cond, extra) => { if (!cond) fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond || extra == null ? '' : '  -> ' + JSON.stringify(extra))); };
const START = new Date(2026, 9, 13, 1, 0).getTime();
const MIN = 60000, HOUR = 60 * MIN;
const KEY = 'baby-feeding-and-nappy-tracker.state';

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

async function load(b, vp, opt = {}) {
    const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: vp.width < 500 ? 2 : 1, colorScheme: opt.theme || 'dark',
        permissions: ['clipboard-read', 'clipboard-write'], acceptDownloads: true, serviceWorkers: 'block' });
    if (opt.init) await ctx.addInitScript(opt.init[0], opt.init[1]);
    const p = await ctx.newPage();
    await p.clock.install({ time: opt.time || START });
    p.errors = []; p.on('console', m => m.type() === 'error' && p.errors.push(m.text())); p.on('pageerror', e => p.errors.push(String(e)));
    p.bad = []; p.on('response', r => { if (r.status() >= 400) p.bad.push(r.status() + ' ' + r.url()); });
    await p.goto(url, { waitUntil: 'networkidle' });
    return p;
}
const txt = async (p, sel) => (await p.textContent(sel)).replace(/\s+/g, ' ').trim();
const tiles = p => p.$$eval('.tile', ts => Object.fromEntries(ts.map(t => [t.querySelector('.t-label').textContent, t.querySelector('.t-val').textContent])));
const ff = (p, ms) => p.clock.fastForward(ms);
const entries = p => p.$$eval('#entries .entry', ls => ls.map(l => l.textContent.replace(/\s+/g, ' ').trim()));
async function editorAdd(p, o) {
    await p.click('#add-earlier');
    await p.check('input[name=etype][value=' + o.t + ']', { force: true });
    await p.fill('#e-start', o.start);
    if (o.left != null) await p.fill('#e-left', o.left);
    if (o.right != null) await p.fill('#e-right', o.right);
    if (o.first) await p.selectOption('#e-first', o.first);
    if (o.amount != null) await p.fill('#e-amount', o.amount);
    if (o.nappy) await p.check('input[name=enappy][value=' + o.nappy + ']', { force: true });
    if (o.end) await p.fill('#e-end', o.end);
    if (o.note != null) { await p.click('#open-note'); await p.fill('#e-note', o.note); }
    await p.click('#e-save');
}

(async () => {
    let srv;
    if (bi > 0) url = process.argv[bi + 1].replace(/\/$/, '') + '/baby-feeding-and-nappy-tracker/';
    else { srv = await serve(); url = 'http://localhost:' + srv.address().port + '/apps/baby-feeding-and-nappy-tracker/'; }
    const b = await pw.chromium.launch();
    let p = await load(b, { width: 390, height: 844 });

    // ---- first use: empty state
    ok('first use: no feeds yet', await txt(p, '#st-big') === 'No feeds yet');
    ok('first use: no side suggested', await p.isHidden('#st-next'));
    ok('first use: empty day message', await p.isVisible('#empty'));
    ok('first use: baby tabs hidden for one baby', await p.isHidden('#babies'));
    ok('first use: totals all zero', JSON.stringify(await tiles(p)) === JSON.stringify({ Feeds: '0', 'Breast time': '0 min', Bottles: '0 ml', 'Wet nappies': '0', 'Dirty nappies': '0', Sleep: '0 min' }), await tiles(p));
    ok('optional note not forced (hidden)', await p.isHidden('#note-box'));
    ok('editor hidden until asked', await p.isHidden('#editor'));
    ok('next day disabled on today', await p.isDisabled('#next'));

    // ---- the 1 a.m. feed: Left 12 min, switch, Right 8 min, stop
    await p.click('#start-L');
    ok('timer runs', await p.isVisible('#breast-run') && await p.isHidden('#breast-idle'));
    ok('status says feeding now', await txt(p, '#st-big') === 'Feeding now');
    await ff(p, 12 * MIN);
    ok('left clock 12:00', (await txt(p, '#clock-L b')) === '12:00', await txt(p, '#clock-L b'));
    ok('switch button names other side', await txt(p, '#switch') === 'Switch to right');
    await p.click('#switch');
    await ff(p, 3 * MIN);
    await p.click('#pause');
    ok('paused label', (await txt(p, '#run-state')).startsWith('Paused'));
    ok('resume names side', await txt(p, '#pause') === 'Resume right');
    await ff(p, 4 * MIN);
    await p.click('#pause');
    await ff(p, 5 * MIN);
    ok('pause time not counted', (await txt(p, '#run-clock')) === '20:00', await txt(p, '#run-clock'));
    await p.click('#stop');
    let list = await entries(p);
    ok('feed saved with both sides', list.length === 1 && list[0].includes('Left 12 min, then Right 8 min (20 min)'), list);
    ok('saved message with undo', (await txt(p, '#now-msg')).startsWith('Saved breast feed') && await p.isVisible('#now-msg button'));
    ok('offer next: Right (finished on it)', (await txt(p, '#st-next')).startsWith('Offer next: Right side'), await txt(p, '#st-next'));
    ok('Right button tagged Offer next', (await txt(p, '#tag-R')) === 'Offer next' && (await txt(p, '#tag-L')) === '');
    await ff(p, 2 * HOUR);
    ok('last feed 2 h 24 min ago (from the start)', (await txt(p, '#st-big')) === '2 h 24 min ago', await txt(p, '#st-big'));

    // ---- undo a stop brings the timer back; stop again
    await p.click('#start-R'); await ff(p, 30000);
    await p.click('#stop');
    await p.click('#now-msg button');
    ok('undo stop: timer running again', await p.isVisible('#breast-run'));
    await p.click('#discard');
    ok('discard: nothing saved', (await entries(p)).length === 1);
    await p.click('#now-msg button');
    ok('undo discard: timer back', await p.isVisible('#breast-run'));
    await p.click('#discard');

    // ---- running timer survives reload
    await p.click('#start-R'); await ff(p, 5 * MIN);
    await p.reload({ waitUntil: 'networkidle' }); await ff(p, 1000);
    ok('reload keeps the running timer', await p.isVisible('#breast-run') && (await txt(p, '#clock-R b')).startsWith('5:0'), await txt(p, '#clock-R b'));
    await p.click('#stop');
    ok('one side only: offer the other', (await txt(p, '#st-next')).startsWith('Offer next: Left side (only the right side'), await txt(p, '#st-next'));

    // ---- nappies one tap
    await p.click('#n-wet'); await p.click('#n-dirty'); await p.click('#n-both');
    let t = await tiles(p);
    ok('nappies counted', t['Wet nappies'] === '2' && t['Dirty nappies'] === '2', t);
    ok('last nappy line', (await txt(p, '#st-more')).startsWith('Last nappy: under 1 min ago, wet and dirty'), await txt(p, '#st-more'));
    await p.click('#now-msg button');
    t = await tiles(p);
    ok('undo nappy', t['Wet nappies'] === '1' && t['Dirty nappies'] === '1', t);

    // ---- bottle input checks
    for (const [v, why] of [['', 'blank'], ['abc', 'words'], ['0', 'zero'], ['-30', 'negative'], ['1200', 'huge'], ['1e3', 'exponent']]) {
        await p.fill('#b-amount', v); await p.click('#b-save');
        ok('bottle refused: ' + why, (await txt(p, '#b-err')).length > 5);
    }
    await p.fill('#b-amount', '90'); await p.press('#b-amount', 'Enter');
    ok('bottle saved with Enter', (await entries(p))[0].includes('90 ml, formula'), await entries(p));
    ok('bottle amount kept for next time', await p.inputValue('#b-amount') === '90');
    await p.selectOption('#b-milk', 'breast'); await p.fill('#b-amount', '60,5'); await p.click('#b-save');
    ok('comma decimal and breast milk', (await entries(p))[0].includes('60.5 ml, breast milk'));
    t = await tiles(p);
    ok('bottle total 150.5 ml (90 + 60.5)', t.Bottles === '150.5 ml', t);
    ok('feeds count 4', t.Feeds === '4', t);

    // ---- sleep timer
    await p.click('#sleep-start'); await ff(p, 2 * HOUR + 5 * MIN);
    ok('asleep line', (await txt(p, '#st-more')).includes('Asleep now for 2 h 5 min'), await txt(p, '#st-more'));
    ok('running sleep counts in totals', (await tiles(p)).Sleep === '2 h 5 min', await tiles(p));
    await p.click('#sleep-stop');
    ok('sleep saved', (await entries(p))[0].includes('Sleep') && (await entries(p))[0].includes('2 h 5 min'));
    ok('last woke up line', (await txt(p, '#st-more')).includes('Last woke up: under 1 min ago (slept 2 h 5 min)'));

    // ---- long-running feed warning
    await p.click('#start-L'); await ff(p, 95 * MIN);
    ok('forgot-to-stop warning', await p.isVisible('#run-warn'));
    await p.click('#discard');

    // ---- edit and delete
    const bottleRow = p.locator('#entries .entry.bottle').filter({ hasText: '90 ml' });
    await bottleRow.getByRole('button', { name: /Edit/ }).click();
    ok('editor opens on edit', await p.isVisible('#editor') && (await txt(p, '#ed-h')) === 'Edit bottle');
    ok('edit fills amount', await p.inputValue('#e-amount') === '90');
    await p.fill('#e-amount', '120'); await p.click('#e-save');
    ok('edit saved: 120 + 60.5 = 180.5 ml', (await entries(p)).some(e => e.includes('120 ml, formula')) && (await tiles(p)).Bottles === '180.5 ml', await tiles(p));
    await p.locator('#entries .entry.bottle').filter({ hasText: '120 ml' }).getByRole('button', { name: /Edit/ }).click();
    await p.fill('#e-start', '2026-10-14T09:00'); await p.click('#e-save');
    ok('future time refused', (await txt(p, '#e-err')).includes('future'));
    await p.press('#e-amount', 'Escape');
    ok('Escape closes editor', await p.isHidden('#editor'));
    const n0 = (await entries(p)).length;
    await p.locator('#entries .entry.nappy').first().getByRole('button', { name: /Delete/ }).click();
    ok('delete removes', (await entries(p)).length === n0 - 1);
    await p.click('#day-msg button');
    ok('undo delete', (await entries(p)).length === n0);

    // ---- add earlier entries, checks in the form
    await editorAdd(p, { t: 'breast', start: '2026-10-13T00:10', left: '', right: '' });
    ok('breast needs minutes', (await txt(p, '#e-err')).includes('at least one side'));
    await p.fill('#e-left', '1.5'); await p.click('#e-save');
    ok('minutes must be whole', (await txt(p, '#e-err')).includes('whole minutes'));
    await p.click('#e-cancel');
    await editorAdd(p, { t: 'sleep', start: '2026-10-13T05:00', end: '2026-10-13T04:00' });
    ok('sleep end before start refused', (await txt(p, '#e-err')).includes('after'));
    await p.click('#e-cancel');
    await editorAdd(p, { t: 'nappy', start: '2026-10-12T23:30', nappy: 'dirty', note: '<b>green</b> & runny' });
    ok('earlier entry goes to Yesterday', (await txt(p, '#day-h')) === 'Yesterday' && (await entries(p)).length === 1);
    ok('note shown as text, not HTML', (await p.textContent('.e-note')) === '<b>green</b> & runny' && !(await p.$('.e-note b')));
    await p.click('#next');
    ok('back to Today', (await txt(p, '#day-h')) === 'Today');
    ok('last 24 hours includes yesterday 23:30 nappy', (await txt(p, '#last24')).includes('2 dirty nappies'), await txt(p, '#last24'));
    await editorAdd(p, { t: 'sleep', start: '2026-10-12T22:00', end: '2026-10-13T00:30' });
    await p.click('#next');
    t = await tiles(p);
    ok('sleep across midnight: 30 min counts today (2 h 35 min)', t.Sleep === '2 h 35 min', t);
    await p.click('#prev');
    ok('and 2 h yesterday', (await tiles(p)).Sleep === '2 h');
    await p.click('#next');

    // ---- units
    await p.selectOption('#unit', 'oz');
    t = await tiles(p);
    ok('oz totals (180.5 ml = 6.1 oz)', t.Bottles === '6.1 oz', t);
    ok('bottle prefill converted', await p.inputValue('#b-amount') === '2.0', await p.inputValue('#b-amount'));
    ok('entry shows both units', (await entries(p)).some(e => e.includes('4.1 oz (120 ml)')));
    await p.selectOption('#unit', 'ml');

    // ---- copy and email
    await p.click('#copy');
    const clip = await p.evaluate(() => navigator.clipboard.readText());
    ok('copy has totals and list', clip.includes('Feeds: ') && clip.includes('Wet nappies: ') && clip.includes('Breast feed: Left 12 min, then Right 8 min'), clip);
    const mail = await p.getAttribute('#mail', 'href');
    ok('email works with no address', mail.startsWith('mailto:?subject=') && decodeURIComponent(mail).includes('Wet nappies'));

    // ---- name and twins
    await p.fill('#baby-name', 'Amina');
    await p.click('#add-baby');
    ok('twins: tabs shown', await p.isVisible('#babies') && (await p.$$('.baby-tab')).length === 2);
    ok('second baby starts empty', (await txt(p, '#st-big')) === 'No feeds yet' && (await entries(p)).length === 0);
    await p.fill('#baby-name', 'Zara');
    await p.click('#start-L');
    await p.click('.baby-tab >> nth=0');
    ok('first baby log kept', (await entries(p)).length > 3 && (await txt(p, '#st-h')) === 'Amina: last feed');
    ok('switching babies refills the last bottle', await p.inputValue('#b-amount') === '60.5', await p.inputValue('#b-amount'));
    await p.click('#start-R');
    await p.fill('#b-amount', '30'); await p.click('#b-save');
    ok('bottle during a feed is not the "feed before"', !(await txt(p, '#st-meta')).includes('under 1 min earlier'), await txt(p, '#st-meta'));
    await p.click('#now-msg button');
    ok('both babies can feed at once', (await p.$$eval('.bt-run', x => x.length)) === 2);
    await p.click('#discard');
    await p.click('.baby-tab >> nth=1'); await p.click('#discard');
    await p.click('#remove-baby');
    ok('remove baby', (await p.isHidden('#babies')));
    await p.click('#tools-msg button');
    ok('undo remove baby', (await p.$$('.baby-tab')).length === 2);
    await p.click('.baby-tab >> nth=0');

    // ---- backup, wipe, restore
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#backup')]);
    const file = path.join(os.tmpdir(), 'baby-backup-test.json'); await dl.saveAs(file);
    ok('backup file name', /^baby-tracker-backup-2026-10-13\.json$/.test(dl.suggestedFilename()));
    const before = (await entries(p)).length;
    await p.click('#wipe');
    ok('wipe empties', (await entries(p)).length === 0 && (await txt(p, '#st-big')) === 'No feeds yet');
    await p.setInputFiles('#restore-file', file);
    await p.waitForTimeout(300);
    ok('restore brings it back', (await entries(p)).length === before, await txt(p, '#tools-msg'));
    const bad = path.join(os.tmpdir(), 'not-a-backup.json'); fs.writeFileSync(bad, '{"hello":1}');
    await p.setInputFiles('#restore-file', bad); await p.waitForTimeout(300);
    ok('wrong file refused', (await txt(p, '#tools-msg')).includes('not a backup'));

    // ---- reload keeps everything
    await p.reload({ waitUntil: 'networkidle' });
    ok('reload keeps log, names and twins', (await entries(p)).length === before && (await p.$$('.baby-tab')).length === 2);
    ok('no console errors (main run)', p.errors.length === 0, p.errors);
    ok('no failed requests', p.bad.length === 0, p.bad);
    await p.context().close();

    // ---- midnight rollover
    p = await load(b, { width: 390, height: 844 }, { time: new Date(2026, 9, 13, 23, 58).getTime() });
    await p.click('#n-wet');
    await ff(p, 3 * MIN);
    ok('after midnight Today is empty', (await entries(p)).length === 0 && (await tiles(p))['Wet nappies'] === '0');
    ok('but last 24 hours still has it', (await txt(p, '#last24')).includes('1 wet nappy'));
    await p.click('#prev');
    ok('and it is under Yesterday', (await entries(p)).length === 1);
    await p.context().close();

    // ---- corrupt and blocked storage
    p = await load(b, { width: 390, height: 844 }, { init: [k => { try { localStorage.setItem(k, '{bad json'); } catch (e) { /* */ } }, KEY] });
    ok('corrupt storage starts fresh', (await txt(p, '#st-big')) === 'No feeds yet' && p.errors.length === 0, p.errors);
    await p.context().close();
    p = await load(b, { width: 390, height: 844 }, { init: [() => { Storage.prototype.setItem = () => { throw new Error('blocked'); }; }, null] });
    ok('blocked storage warns', await p.isVisible('#save-warn'));
    await p.click('#n-wet');
    ok('still works without storage', (await entries(p)).length === 1 && p.errors.length === 0, p.errors);
    await p.context().close();

    // ---- phones: no overlapping controls with everything open; placeholders fit
    for (const w of [320, 360, 390]) {
        p = await load(b, { width: w, height: 800 });
        await p.click('#add-baby'); await p.click('#start-L'); await p.click('#sleep-start');
        await p.click('#add-earlier'); await p.click('#open-note');
        for (const ty of ['breast', 'bottle', 'nappy', 'sleep']) {
            await p.check('input[name=etype][value=' + ty + ']', { force: true });
            const o = await p.evaluate(() => { const k = [...document.querySelectorAll('input:not([type=hidden]):not([type=radio]):not([type=file]), select, button')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }); const bad = [];
                for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { if (k[i].contains(k[j]) || k[j].contains(k[i])) continue; const a = k[i].getBoundingClientRect(), c = k[j].getBoundingClientRect(); if (Math.min(a.right, c.right) - Math.max(a.left, c.left) > 2 && Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top) > 2) bad.push((k[i].id || k[i].className) + '/' + (k[j].id || k[j].className)); }
                return bad; });
            ok(w + 'px ' + ty + ': no overlapping controls', o.length === 0, o);
            const ph = await p.evaluate(() => { const cv = document.createElement('canvas').getContext('2d'); return [...document.querySelectorAll('input[placeholder]')].filter(e => e.offsetWidth).filter(e => { const cs = getComputedStyle(e); cv.font = cs.fontSize + ' ' + cs.fontFamily; return cv.measureText(e.placeholder).width > e.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) + 1; }).map(e => e.id); });
            ok(w + 'px ' + ty + ': placeholders fit', ph.length === 0, ph);
            ok(w + 'px ' + ty + ': no horizontal scroll', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        }
        await p.context().close();
    }

    const demoAt = new Date(2026, 9, 13, 3, 10).getTime();
    const D = new Date(2026, 9, 13).getTime(), Y = new Date(2026, 9, 12).getTime();
    const e = [];
    let n = 0; const id = () => 'd' + (n++);
    const br = (t, l, r, first) => e.push({ id: id(), t: 'breast', start: t, end: t + (l + r) * 60000, left: l * 60, right: r * 60, first, last: l && r ? (first === 'L' ? 'R' : 'L') : first });
    br(Y + 13 * HOUR, 14, 9, 'L'); e.push({ id: id(), t: 'nappy', start: Y + 13 * HOUR + 30 * MIN, wet: true, dirty: false });
    br(Y + 16 * HOUR, 10, 12, 'R'); e.push({ id: id(), t: 'bottle', start: Y + 19 * HOUR, amount: 90, unit: 'ml', milk: 'breast' });
    e.push({ id: id(), t: 'nappy', start: Y + 20 * HOUR, wet: true, dirty: true });
    br(Y + 21 * HOUR + 40 * MIN, 15, 8, 'L'); e.push({ id: id(), t: 'sleep', start: Y + 22 * HOUR + 10 * MIN, end: D + 50 * MIN });
    e.push({ id: id(), t: 'nappy', start: D + 55 * MIN, wet: true, dirty: false });
    br(D + 60 * MIN, 12, 9, 'R');
    e.push({ id: id(), t: 'nappy', start: D + 2 * HOUR + 40 * MIN, wet: true, dirty: true, note: 'Woke up crying, back to sleep after the change' });
    const st = { v: 1, unit: 'ml', current: 'b1', babies: [{ id: 'b1', name: 'Amina', entries: e, feed: null, sleep: { start: D + 2 * HOUR + 50 * MIN } }] };

    // ---- every width, dark and light, with a filled-in night (and twins with running timers, editor open)
    const twin = JSON.parse(JSON.stringify(st)); twin.babies.push({ id: 'b2', name: 'Zara', entries: e.slice(0, 6).map(x => Object.assign({}, x, { id: x.id + 'z' })), feed: { start: demoAt - 7 * MIN, segs: [{ side: 'L', from: demoAt - 7 * MIN, to: null }] }, sleep: null });
    for (const theme of ['dark', 'light']) for (const w of [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920]) for (const [label, data, open] of [['night', st, false], ['twins+editor', twin, true], ['cleared', null, false]]) {
        p = await load(b, { width: w, height: 900 }, { theme, time: demoAt, init: [x => { if (x) localStorage.setItem('baby-feeding-and-nappy-tracker.state', x); }, data ? JSON.stringify(data) : ''] });
        if (label === 'cleared') { await p.click('#n-wet'); await p.click('#wipe'); }
        if (open) { await p.click('.baby-tab >> nth=1'); await p.click('#add-earlier'); await p.click('#open-note'); await p.check('input[name=etype][value=sleep]', { force: true }); }
        const tag = theme + ' ' + w + ' ' + label + ': ';
        ok(tag + 'no horizontal scroll', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        const out = await p.evaluate(() => [...document.querySelectorAll('main *')].filter(x => { const r = x.getBoundingClientRect(); return r.width && (r.right > innerWidth + 1 || r.left < -1); }).slice(0, 3).map(x => x.id || x.className));
        ok(tag + 'nothing sticks out', out.length === 0, out);
        for (const pos of [0, 0.5, 1]) {
            await p.evaluate(q => scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * q), pos);
            const o = await p.evaluate(() => { const bad = []; document.querySelectorAll('main, .app, .col-main, .col-side').forEach(h => { const k = [...h.children].filter(c => { const r = c.getBoundingClientRect(); return r.width > 4 && r.height > 4 && getComputedStyle(c).display !== 'none'; }); for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { const a = k[i].getBoundingClientRect(), c = k[j].getBoundingClientRect(); if (Math.min(a.right, c.right) - Math.max(a.left, c.left) > 4 && Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top) > 4) bad.push(k[i].className + '/' + k[j].className); } }); return bad; });
            if (w >= 900 || pos === 0) ok(tag + 'no overlap at scroll ' + pos, o.length === 0, o);
        }
        ok(tag + 'no console errors', p.errors.length === 0, p.errors);
        await p.context().close();
    }

    // ---- screenshots with a realistic night: Amina, 3:10 a.m., log since yesterday
    if (shots) {
        for (const [w, h, f] of [[1280, 900, 'desktop.png'], [390, 844, 'phone.png']]) {
            p = await load(b, { width: w, height: h }, { time: demoAt, init: [s => { localStorage.setItem('baby-feeding-and-nappy-tracker.state', s); }, JSON.stringify(st)] });
            await p.evaluate(() => document.fonts.ready);
            await p.screenshot({ path: path.join(__dirname, 'screenshots', f), fullPage: w > 500 ? false : false });
            if (w > 500) { ok('desktop: two columns side by side', await p.evaluate(() => { const a = document.querySelector('.col-main').getBoundingClientRect(), c = document.querySelector('.col-side').getBoundingClientRect(); return c.left > a.right - 1 && Math.abs(a.top - c.top) < 2; })); }
            ok('screenshot ' + f + ': answer shown', (await txt(p, '#st-big')) === '2 h 10 min ago' && (await txt(p, '#st-next')).startsWith('Offer next: Left'), [await txt(p, '#st-big'), await txt(p, '#st-next')]);
            await p.context().close();
        }
    }

    await b.close(); if (srv) srv.close();
    console.log(fail ? '\n' + fail + ' FAILED' : '\nALL UI TESTS PASSED');
    process.exitCode = fail ? 1 : 0;
})();
