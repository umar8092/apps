// Page test for Food Allergy Card for Eating Out and School. Run from the repo root or this folder:
//   node ui-test.js                                          (serves the repo locally)
//   node ui-test.js --base https://umar8092.github.io/apps   (tests the live site)
// Needs Playwright.
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const pw = require('playwright');
const SLUG = 'food-allergy-card-for-eating-out-and-school';
const ROOT = path.resolve(__dirname, '..');
const bi = process.argv.indexOf('--base'), LIVE = bi > 0 ? process.argv[bi + 1].replace(/\/$/, '') : null;
let pass = 0; const fails = [];
const ok = (cond, what) => { if (cond) pass++; else fails.push(what); };
const eq = (got, want, what) => ok(JSON.stringify(got) === JSON.stringify(want), what + '\n     got:  ' + JSON.stringify(got) + '\n     want: ' + JSON.stringify(want));

function serve() {
    const types = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml', png: 'image/png', webmanifest: 'application/manifest+json' };
    return new Promise(res => { const s = http.createServer((q, r) => {
        let p = decodeURIComponent(q.url.split('?')[0].replace(/^\/apps/, '')); if (p.endsWith('/')) p += 'index.html';
        const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
        r.writeHead(200, { 'content-type': types[f.split('.').pop()] || 'application/octet-stream' }); r.end(fs.readFileSync(f));
    }).listen(0, () => res({ s, base: 'http://localhost:' + s.address().port + '/apps' })); });
}

const pick = (p, name) => p.click(`#picks .pick:text-is("${name}")`);
const pressed = p => p.$$eval('#picks .pick[aria-pressed=true]', b => b.map(x => x.textContent));
const items = (p, i) => p.$$eval('#previews .acard', (c, i) => [...c[i].querySelectorAll('.al, li')].map(e => e.textContent), i);
async function fillAyaan(p) {
    await p.fill('#f-name', 'Ayaan');
    for (const f of ['Peanuts', 'Tree nuts', 'Eggs']) await pick(p, f);
    await p.fill('#f-other', 'kiwi'); await p.click('#add-other');
    await p.locator('#foods li').nth(2).locator('input[value=avoid]').check();
    await p.click('#o-emerg'); await p.check('#f-pen'); await p.fill('#f-penwhere', 'Front pocket of the red school bag');
    await p.fill('#f-cname', 'Mum (Sara)'); await p.fill('#f-cphone', '+92 300 1234567');
}

(async () => {
    let srv, base = LIVE;
    if (!LIVE) { srv = await serve(); base = srv.base; }
    const URL = base + '/' + SLUG + '/';
    const browser = await pw.chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
    const p = await ctx.newPage();
    const errs = [], bad = [];
    p.on('pageerror', e => errs.push(e.message));
    p.on('console', m => { if (m.type() === 'error' && !/gc\.zgo\.at|goatcounter|ERR_FAILED/.test(m.text())) errs.push(m.text()); });
    p.on('response', r => { if (r.status() >= 400 && r.url().startsWith(base)) bad.push(r.status() + ' ' + r.url()); });
    if (!LIVE) await p.route(/gc\.zgo\.at/, r => r.abort());
    await p.goto(URL, { waitUntil: 'networkidle' });

    // first use: empty state, optional parts closed
    ok(await p.isVisible('#card-empty') && !(await p.isVisible('#card-ready')), 'empty: card waits for a food');
    ok(await p.isVisible('#foods-empty'), 'empty: nothing picked yet');
    ok(await p.isHidden('#w-emerg') && await p.isHidden('#w-school'), 'optional parts hidden behind + buttons');
    eq(await p.inputValue('#f-lang'), '', 'English only by default');
    ok((await p.textContent('#note')).includes('No foods listed yet.'), 'empty note');

    // the main situation
    await fillAyaan(p);
    eq(await pressed(p), ['Peanuts', 'Tree nuts', 'Eggs'], 'picked foods pressed');
    eq(await items(p, 0), ['Ayaan must not eat even a trace of:', 'Peanuts', 'Tree nuts (almonds, cashews, walnuts, hazelnuts, pistachios)', 'Kiwi', 'Ayaan must not eat:', 'Eggs'], 'English card');
    ok((await p.textContent('#previews .acard .ae')).includes('Call: Mum (Sara) +92 300 1234567'), 'emergency box');
    eq(await p.$$eval('#previews .acard', c => c.length), 1, 'one card when English only');
    await p.selectOption('#f-lang', 'es');
    eq(await p.$$eval('#previews .acard', c => c.length), 2, 'two cards with Spanish');
    ok((await p.textContent('#todo')).includes('Kiwi'), 'asks for the Spanish for Kiwi');
    await p.fill('#tr-' + await p.locator('#foods li').nth(3).locator('input[type=text]').getAttribute('id').then(s => s.slice(3)), 'Kiwi');
    eq(await p.textContent('#todo'), '', 'reminder gone once translated');
    eq((await items(p, 1)).slice(0, 2), ['Ayaan no puede comer ni siquiera trazas de:', 'Cacahuetes (maní)'], 'Spanish card');
    await p.selectOption('#f-lang', 'ar');
    eq(await p.getAttribute('#previews .acard:nth-child(2)', 'dir'), 'rtl', 'Arabic card right to left');
    await p.selectOption('#f-lang', 'es');

    // copy and email
    await p.click('#copy-card');
    const clip = await p.evaluate(() => navigator.clipboard.readText()).catch(() => '');
    ok(clip.startsWith('Please read: food allergy') && clip.includes('— Spanish (Español) —'), 'copy card text');
    ok((await p.textContent('#card-msg')).includes('copied'), 'copy message');
    const mail = await p.getAttribute('#email-card', 'href');
    ok(mail.startsWith('mailto:?subject=') && decodeURIComponent(mail).includes('Cacahuetes'), 'email card works with no recipient');
    ok(decodeURIComponent(await p.getAttribute('#email-note', 'href')).includes('Where it is: Front pocket'), 'email note');

    // full screen
    await p.click('#show-full');
    ok(await p.evaluate(() => document.getElementById('full').open), 'full screen opens');
    eq(await p.$$eval('#full-langs button', b => b.map(x => x.getAttribute('aria-pressed'))), ['false', 'true'], 'full screen opens on Spanish');
    await p.click('#full-langs button:first-child');
    ok((await p.textContent('#full-card')).includes('Ayaan must not eat'), 'switch to English');
    await p.keyboard.press('Escape');
    ok(!(await p.evaluate(() => document.getElementById('full').open)), 'Escape closes full screen');

    // print: cards fit and the app comes back
    await p.evaluate(() => { window.print = () => {}; });
    await p.click('#print-cards');
    eq(await p.$$eval('#print-area .pc', b => b.length), 2, 'two big cards');
    eq(await p.$$eval('#print-area .wc', b => b.length), 2, 'wallet front and back');
    ok(await p.$$eval('#print-area .pc, #print-area .wc', b => b.every(x => x.scrollHeight <= x.clientHeight + 1)), 'all printed cards fit');
    ok(!(await p.isVisible('#app')), 'print view replaces the app');
    await p.click('#print-area .no-print');
    ok(await p.isVisible('#app') && (await p.$$eval('#print-area *', x => x.length)) === 0, 'Back to the app');
    await p.click('#print-note');
    ok((await p.textContent('#print-area .print-note')).includes('Food allergy note: Ayaan'), 'print note');
    await p.click('#print-area .no-print');

    // remove with undo, toggle off with undo, duplicates, blank, paste
    await pick(p, 'Eggs');
    eq(await pressed(p), ['Peanuts', 'Tree nuts'], 'tap again takes it off');
    await p.click('#food-msg .undo');
    eq(await pressed(p), ['Peanuts', 'Tree nuts', 'Eggs'], 'undo puts it back');
    await p.locator('#foods li').nth(0).locator('.remove').click();
    eq(await p.$$eval('#foods li', l => l.length), 3, 'Remove');
    await p.click('#food-msg .undo');
    eq(await p.$$eval('#foods .food-name', l => l.map(x => x.textContent)), ['Peanuts', 'Tree nuts', 'Eggs', 'Kiwi'], 'undo remove keeps order');
    await p.click('#add-other');
    ok((await p.textContent('#food-msg')).includes('Type a food first'), 'blank add');
    await p.focus('#f-other');
    await p.evaluate(() => { const dt = new DataTransfer(); dt.setData('text/plain', 'KIWI\nsesame\r\nbanana (raw, not cooked)\n'); document.getElementById('f-other').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); });
    eq(await p.inputValue('#f-other'), 'KIWI, sesame, banana (raw, not cooked)', 'pasted lines become commas');
    await p.press('#f-other', 'Enter');
    ok((await p.textContent('#food-msg')).includes('Added: Sesame, Banana (raw, not cooked). Already on the card: KIWI.'), 'pasted list with Enter: ' + await p.textContent('#food-msg'));
    eq(await p.inputValue('#f-other'), '', 'box cleared after adding');
    // wrong phone
    await p.fill('#f-cphone', 'call mum');
    ok((await p.textContent('#cphone-err')).includes('does not look like a phone'), 'bad phone warned');
    await p.fill('#f-cphone', '+92 300 1234567');
    eq(await p.textContent('#cphone-err'), '', 'good phone ok');
    // school notes
    await p.click('#o-school');
    await p.fill('#f-act', 'Give the pen in the outer thigh\nCall 1122');
    await p.fill('#f-med', 'Cetirizine 5 ml for mild itching');
    await p.fill('#f-safe', 'Oat milk, fruit');
    const note = await p.textContent('#note');
    ok(note.includes('If Ayaan has a reaction:\n- Give the pen in the outer thigh\n- Call 1122') && note.includes('Other medicine: Cetirizine') && note.includes('Safe foods and swaps: Oat milk, fruit'), 'note has school details');
    ok(!(await p.textContent('#previews')).includes('Oat milk'), 'school details stay off the restaurant card');

    // second person, reload keeps everything
    await p.click('#add-person');
    eq(await p.inputValue('#f-name'), '', 'new person empty');
    ok(await p.isVisible('#card-empty'), 'new person has no card yet');
    await pick(p, 'Gluten');
    eq((await items(p, 0))[0], 'This person must not eat even a trace of:', 'no name says this person');
    await p.fill('#f-name', 'Sara');
    await p.reload({ waitUntil: 'networkidle' });
    eq(await p.$$eval('#people .chip', c => c.map(x => x.textContent)), ['Ayaan', 'Sara'], 'people saved');
    eq(await p.inputValue('#f-lang'), 'es', 'language saved');
    await p.click('#people .chip:text-is("Ayaan")');
    eq(await p.$$eval('#foods .food-name', l => l.length), 6, 'foods saved');
    ok(await p.isVisible('#w-emerg') && await p.isVisible('#w-school'), 'filled optional parts open after reload');

    // backup, delete with undo, restore
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#backup')]);
    const file = path.join(os.tmpdir(), 'allergy-backup.json'); await dl.saveAs(file);
    await p.click('#del-person');
    eq(await p.$$eval('#people .chip', c => c.map(x => x.textContent)), ['Sara'], 'delete one person');
    await p.click('#set-msg .undo');
    eq(await p.$$eval('#people .chip', c => c.length), 2, 'undo delete person');
    await p.click('#del-all');
    eq(await p.$$eval('#people .chip', c => c.map(x => x.textContent)), ['(no name yet)'], 'delete everything starts fresh');
    await p.setInputFiles('#restore-file', file);
    await p.waitForFunction(() => document.querySelectorAll('#people .chip').length === 2);
    ok((await p.textContent('#set-msg')).includes('Restored 2 cards'), 'restore backup');
    const junk = path.join(os.tmpdir(), 'junk.json'); fs.writeFileSync(junk, '{"hello": 1}');
    await p.setInputFiles('#restore-file', junk);
    await p.waitForFunction(() => document.getElementById('set-msg').textContent.includes('not a backup'));
    eq(await p.$$eval('#people .chip', c => c.length), 2, 'wrong file changes nothing');

    // corrupt saved data starts fresh with a message
    await p.evaluate(s => localStorage.setItem(s + '.state', '{broken'), SLUG);
    await p.reload({ waitUntil: 'networkidle' });
    ok((await p.textContent('#set-msg')).includes('could not be read'), 'corrupt save message');
    ok(await p.isVisible('#card-empty'), 'corrupt save starts fresh');

    // keyboard: picks are buttons with aria-pressed
    await p.focus('#picks .pick:first-child'); await p.keyboard.press('Enter');
    eq(await pressed(p), ['Peanuts'], 'keyboard Enter picks a food');

    // layout on small phones with everything open and a long list
    const ph = await ctx.newPage(); if (!LIVE) await ph.route(/gc\.zgo\.at/, r => r.abort());
    for (const w of [320, 360, 390]) {
        await ph.setViewportSize({ width: w, height: 800 });
        await ph.goto(URL, { waitUntil: 'networkidle' });
        await ph.evaluate(() => localStorage.clear()); await ph.reload({ waitUntil: 'networkidle' });
        await fillAyaan(ph); await ph.click('#o-school');
        await ph.fill('#f-other', 'a very long food name that someone pasted from a menu with no spaces at allllllllllllll'); await ph.click('#add-other');
        await ph.selectOption('#f-lang', 'ur');
        const o = await ph.evaluate(() => {
            const els = [...document.querySelectorAll('main input:not([type=radio]):not([type=checkbox]), main select, main button, main textarea, main a.secondary')].filter(e => e.offsetParent);
            const r = els.map(e => [e, e.getBoundingClientRect()]), out = [];
            for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) {
                const a = r[i][1], b = r[j][1];
                if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) out.push((r[i][0].id || r[i][0].textContent) + ' / ' + (r[j][0].id || r[j][0].textContent));
            }
            const wide = document.documentElement.scrollWidth > innerWidth;
            const clipped = [...document.querySelectorAll('main input[placeholder]')].filter(e => e.offsetParent).filter(e => {
                const c = document.createElement('canvas').getContext('2d'); const s = getComputedStyle(e); c.font = s.fontSize + ' ' + s.fontFamily;
                return c.measureText(e.placeholder).width > e.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight);
            }).map(e => e.id || e.placeholder);
            return { out, wide, clipped };
        });
        eq(o.out, [], w + 'px: no controls overlap');
        ok(!o.wide, w + 'px: no horizontal scroll');
        eq(o.clipped, [], w + 'px: placeholders fit');
    }

    eq(errs, [], 'no console errors');
    eq(bad, [], 'no failed requests');
    for (const f of ['favicon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'manifest.webmanifest', 'sw.js', '../help.js', '../theme.js', 'screenshots/desktop.png', 'screenshots/phone.png']) {
        const r = await p.request.get(URL + f); eq(r.status(), 200, f + ' loads');
    }
    if (!LIVE) {
        const readme = fs.readFileSync(path.join(__dirname, 'README.md'), 'utf8');
        [...readme.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].forEach(m => ok(fs.existsSync(path.join(__dirname, m[1])), 'README image ' + m[1]));
    }
    await browser.close(); if (srv) srv.s.close();
    if (fails.length) { console.log('FAILED ' + fails.length + ':\n - ' + fails.join('\n - ')); process.exit(1); }
    console.log('All ' + pass + ' page checks passed' + (LIVE ? ' on ' + LIVE : ''));
})().catch(e => { console.error(e); process.exit(1); });
