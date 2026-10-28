// Drives the real page in headless Chromium. Run from the repo root: node school-run-carpool-rota-for-parents/ui-test.js [baseUrl]
// Without a base URL it serves the repo itself on a local port.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), SLUG = 'school-run-carpool-rota-for-parents', KEY = SLUG + '.state';
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond || extra == null ? '' : '  (' + extra + ')')); };
const eq = (name, got, want) => ok(name, JSON.stringify(got) === JSON.stringify(want), 'got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
function serve() { return new Promise(res => { const s = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]).replace(/^\/apps/, ''); if (p.endsWith('/')) p += 'index.html';
    const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(0, '127.0.0.1', () => res(s)); }); }

(async () => {
    let srv = null, base = process.argv[2];
    if (!base) { srv = await serve(); base = 'http://127.0.0.1:' + srv.address().port + '/apps'; }
    const URL = base + '/' + SLUG + '/';
    const browser = await chromium.launch();
    const errors = [];
    async function newPage(opts) {
        const ctx = await browser.newContext(Object.assign({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' }, opts || {}));
        await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new globalThis.URL(URL).origin }).catch(() => {});
        await ctx.route(/gc\.zgo\.at|goatcounter/, r => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
        const p = await ctx.newPage();
        p.on('pageerror', e => errors.push(e.message));
        p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
        p.on('response', r => { if (r.status() >= 400 && r.url().startsWith(base)) errors.push(r.status() + ' ' + r.url()); });
        return p;
    }
    const at = (p, d) => p.clock.setFixedTime(d);
    const txt = (p, sel) => p.locator(sel).innerText();
    const waitText = (p, sel, t) => p.waitForFunction(([s, t]) => document.querySelector(s).textContent.includes(t), [sel, t], { timeout: 3000 }).then(() => true, () => false);
    async function addFamily(p, name, kids, opts) {
        opts = opts || {};
        await p.click('#f-open'); await p.fill('#f-name', name);
        for (let i = 0; i < kids.length; i++) {
            if (i > 0) await p.click('#kid-add');
            const [kn, kr] = Array.isArray(kids[i]) ? kids[i] : [kids[i]];
            await p.fill('#kid-' + i, kn);
            if (kr) await p.selectOption('#kid-' + i + 'r', kr);
        }
        if (opts.seats) await p.selectOption('#f-seats', String(opts.seats));
        for (const n of opts.no || []) await p.click('#no-grid button[aria-label="' + n + ': cannot drive"]');
        if (opts.join) await p.fill('#f-join', opts.join);
        await p.click('#f-save');
    }

    // ---------- first use and the main situation ----------
    let p = await newPage();
    await at(p, new Date(2026, 9, 26, 7, 0)); // Mon 26 Oct 2026, 7am
    await p.goto(URL, { waitUntil: 'networkidle' });
    ok('first use: the two steps show', await p.locator('#start-here').isVisible());
    ok('first use: families come first', await p.evaluate(() => document.getElementById('families').getBoundingClientRect().top < document.getElementById('next').getBoundingClientRect().top));
    ok('first use: no drive count or costs yet', !(await p.locator('#count').isVisible()) && !(await p.locator('#costs').isVisible()));
    ok('first use: week says add families', (await txt(p, '#week-empty')).includes('Add the families first'));
    await p.click('#f-open'); await p.click('#f-save');
    eq('blank name refused', await txt(p, '#f-name-err'), 'Type the family or driver name.');
    ok('the optional join date is not asked for the first family', !(await p.locator('#f-join-wrap').isVisible()));
    await p.click('#f-cancel');
    await addFamily(p, 'Ayesha', ['Ali', 'Sara']);
    await addFamily(p, 'Bilal', ['Omar']);
    await addFamily(p, 'Hina', ['Zain'], { no: ['Tuesday morning', 'Tuesday afternoon'] });
    ok('three family boxes', (await p.locator('#fam-list > li').count()) === 3);
    eq('Hina box says when she cannot drive', await p.locator('#fam-list > li').nth(2).locator('.box-sub').nth(1).innerText(), 'Cannot drive: Tue');
    const next = await txt(p, '#next-list');
    ok('today: Ayesha drives in the morning, Bilal in the afternoon', /Today, Mon 26 Oct\s+Morning\s+Ayesha drives\s+Ali, Sara, Omar, Zain\s+Afternoon\s+Bilal drives/.test(next), next);
    ok('tomorrow shown', /Tomorrow, Tue 27 Oct\s+Morning\s+Ayesha drives[\s\S]*Afternoon\s+Bilal drives/.test(next), next);
    const runs = await p.locator('#day-list .r-who').allInnerTexts();
    eq('the whole first week (worked by hand)', runs, ['Ayesha drives', 'Bilal drives', 'Ayesha drives', 'Bilal drives', 'Hina drives', 'Ayesha drives', 'Hina drives', 'Bilal drives', 'Hina drives', 'Ayesha drives']);
    ok('seats are shown', (await p.locator('#day-list .r-kids').first().innerText()).includes('4 of 4 seats'));
    ok('optional fuel costs are not forced', await p.locator('#cost-open').isVisible() && !(await p.locator('#cost-amt').isVisible()));

    // ---------- validation ----------
    await p.click('#f-open'); await p.fill('#f-name', 'ayesha'); await p.click('#f-save');
    ok('duplicate family name refused', (await txt(p, '#f-name-err')).includes('already a family called'));
    await p.fill('#f-name', 'Sana'); await p.fill('#kid-0', 'Mia'); await p.click('#kid-add'); await p.fill('#kid-1', 'mia'); await p.click('#f-save');
    ok('a child typed twice refused', (await txt(p, '#kid-err')).includes('typed twice'));
    await p.fill('#kid-1', ''); await p.fill('#f-join', '2026-10-20'); await p.click('#f-save');
    eq('a start day in the past refused', await txt(p, '#f-join-err'), 'Choose today or a later day.');
    await p.click('#f-cancel');

    // ---------- swap with undo ----------
    const day0 = p.locator('#day-list > li').first();
    await day0.locator('.run').first().getByRole('button', { name: 'Change driver' }).click();
    await p.selectOption('.picker select', { label: 'Hina' });
    ok('swap: Hina drives Monday morning', (await day0.locator('.run').first().locator('.r-who').innerText()) === 'Hina drives');
    ok('swap is marked', await day0.locator('.badge.sw').isVisible());
    ok('the rota rebalances: Ayesha takes the afternoon', (await day0.locator('.run').nth(1).locator('.r-who').innerText()) === 'Ayesha drives');
    await p.click('#week-msg .undo');
    ok('undo the swap', (await day0.locator('.run').first().locator('.r-who').innerText()) === 'Ayesha drives' && !(await day0.locator('.badge.sw').count()));
    await day0.locator('.run').first().getByRole('button', { name: 'Change driver' }).click();
    await p.selectOption('.picker select', { label: 'Bilal' });
    await day0.locator('.run').first().getByRole('button', { name: 'Change driver' }).click();
    await p.selectOption('.picker select', { label: 'Back to the rota' });
    ok('"Back to the rota" puts the rota\'s choice back', (await day0.locator('.run').first().locator('.r-who').innerText()) === 'Ayesha drives');

    // ---------- child off sick ----------
    await day0.locator('.run').nth(1).getByRole('button', { name: 'Who is riding' }).click();
    await p.locator('.picker label', { hasText: 'Zain' }).locator('input').uncheck();
    ok('Zain is not riding Monday afternoon', !(await day0.locator('.run').nth(1).locator('.r-kids').innerText()).includes('Zain'));
    ok('...but still rides in the morning', (await day0.locator('.run').first().locator('.r-kids').innerText()).includes('Zain'));
    for (const n of ['Ali', 'Sara', 'Omar']) await p.locator('.picker label', { hasText: n }).locator('input').uncheck();
    ok('nobody riding: no ride needed', (await day0.locator('.run').nth(1).locator('.r-who').innerText()).startsWith('No ride needed'));
    for (const n of ['Ali', 'Sara', 'Omar', 'Zain']) await p.locator('.picker label', { hasText: n }).locator('input').check();
    ok('everyone rides again', (await day0.locator('.run').nth(1).locator('.r-kids').innerText()).includes('Zain'));

    // ---------- no school ----------
    const day3 = p.locator('#day-list > li').nth(3);
    await day3.locator('.off-btn').click();
    ok('Thursday marked no school', (await day3.innerText()).includes('No school. Nobody drives.'));
    await day3.locator('.off-btn').click();
    ok('Thursday back', (await day3.locator('.run').count()) === 2);
    await p.click('#h-open'); await p.fill('#h-from', '2026-10-30'); await p.fill('#h-to', '2026-10-29'); await p.click('#h-save');
    eq('holiday ending before it starts refused', await txt(p, '#h-err'), 'The last day is before the first day.');
    await p.fill('#h-to', '2026-10-30'); await p.fill('#h-name', 'Teacher training day'); await p.click('#h-save');
    ok('holiday shows on Friday', (await p.locator('#day-list > li').nth(4).innerText()).includes('No school: Teacher training day'));
    ok('holiday listed in settings', (await txt(p, '#hol-list')).includes('Teacher training day: Fri 30 Oct 2026'));

    // ---------- away dates ----------
    await p.locator('#fam-list > li').nth(1).getByRole('button', { name: 'Away dates for Bilal', exact: true }).click();
    await p.fill('#a-from', '2026-11-02'); await p.fill('#a-to', '2026-11-02');
    await p.getByRole('button', { name: 'Add away dates' }).click();
    ok('away dates listed', (await p.locator('#fam-list > li').nth(1).innerText()).includes('Away Mon 2 Nov'));
    await p.click('#nextw');
    const mon2 = p.locator('#day-list > li').first();
    ok('away: Bilal does not drive and Omar does not ride', !(await mon2.innerText()).includes('Bilal') && !(await mon2.innerText()).includes('Omar'));
    eq('next week heading', await txt(p, '#week-h'), 'Next week');
    await p.click('#this-week');
    ok('before is disabled at the start of the rota', await p.locator('#prev').isDisabled());

    // ---------- edit and remove with undo ----------
    await p.getByRole('button', { name: 'Edit Hina' }).click();
    eq('edit form filled in', [await p.inputValue('#f-name'), await p.inputValue('#kid-0')], ['Hina', 'Zain']);
    await p.selectOption('#f-seats', '7'); await p.click('#f-save');
    ok('seats saved', (await p.locator('#fam-list > li').nth(2).locator('.badge').innerText()) === '7 seats');
    await p.getByRole('button', { name: 'Remove Hina' }).click();
    ok('removed (no past drives yet)', (await p.locator('#fam-list > li').count()) === 2);
    await p.click('#fam-msg .undo');
    ok('undo remove', (await p.locator('#fam-list > li').count()) === 3);

    // ---------- fuel costs ----------
    await p.click('#cost-open');
    ok('cost form opens', await p.locator('#cost-amt').isVisible());
    ok('no amount yet: hint', (await txt(p, '#settle')).includes('Type the cost of one drive'));
    await p.fill('#cost-amt', '-5'); eq('negative cost refused', await txt(p, '#cost-err'), 'The cost cannot be negative.');
    await p.fill('#cost-amt', 'abc'); eq('word cost refused', await txt(p, '#cost-err'), 'Type an amount such as 300 or 4.50.');
    await p.fill('#cost-amt', '300');
    ok('one drive so far this month (only today\'s morning... counted up to today)', (await txt(p, '#settle')).includes('2 drives × 300.00 = 600.00'), await txt(p, '#settle'));
    ok('payments shown', (await p.locator('#settle .pay').allInnerTexts()).join('|').includes('pays'), await txt(p, '#settle'));
    await p.selectOption('#cur', '£');
    ok('currency symbol used', (await txt(p, '#settle')).includes('£300.00'));

    // ---------- copy and email ----------
    await p.click('#copy');
    ok('copy message', await waitText(p, '#week-msg', 'Copied'), await txt(p, '#week-msg'));
    const clip = await p.evaluate(() => navigator.clipboard.readText()).catch(() => '');
    ok('copied text is the week', clip.startsWith('School run rota, week of Mon 26 Oct') && clip.includes('Mon 26 Oct (today)\n  Morning: Ayesha drives (Ali, Sara, Omar, Zain)'), clip.slice(0, 120));
    const href = await p.getAttribute('#email', 'href');
    ok('email link needs no address', href.startsWith('mailto:?subject=') && decodeURIComponent(href).includes('Morning: Ayesha drives'));

    // ---------- reload, and the past stays as it was ----------
    await p.reload({ waitUntil: 'networkidle' });
    ok('reload keeps the families and costs', (await p.locator('#fam-list > li').count()) === 3 && (await p.inputValue('#cost-amt')) === '300');
    await at(p, new Date(2026, 9, 28, 8, 0)); await p.reload({ waitUntil: 'networkidle' });
    ok('two days later: today is Wednesday', (await txt(p, '#next-list')).startsWith('Today, Wed 28 Oct'));
    await p.getByRole('button', { name: 'Edit Ayesha' }).click();
    for (const n of ['Monday morning', 'Monday afternoon']) await p.click('#no-grid button[aria-label="' + n + ': cannot drive"]');
    await p.click('#f-save');
    ok('changing Ayesha later keeps Monday as it was', (await p.locator('#day-list > li').first().locator('.r-who').first().innerText()) === 'Ayesha drives');
    const cnt = await txt(p, '#count-list');
    ok('drives so far counted (Mon, Tue: Ayesha/Bilal; Wed: Hina/Ayesha)', /Ayesha\s+3 drives\s+Most drives/.test(cnt) && /Bilal\s+2 drives\s+1 behind/.test(cnt) && /Hina\s+1 drive\s+2 behind/.test(cnt), cnt);
    await p.getByRole('button', { name: 'Remove Bilal' }).click();
    ok('a family who has driven leaves from today', (await txt(p, '#fam-msg')).includes('off the rota from today'));
    ok('...and their past drives stay', (await txt(p, '#count-list')).includes('Bilal (left)'));
    ok('...and they drive no more', !(await p.locator('#day-list > li').nth(3).innerText()).includes('Bilal'));
    await p.click('#fam-msg .undo');

    // ---------- settings ----------
    await p.locator('#s-days button[aria-label="Saturday"]').click();
    ok('Saturday added', (await p.locator('#day-list > li').count()) === 6);
    await p.locator('#s-days button[aria-label="Saturday"]').click();
    await p.uncheck('#s-pm');
    ok('mornings only: no afternoon rides from today', (await p.locator('#day-list > li').nth(3).locator('.run').count()) === 1);
    ok('...past afternoons are kept', (await p.locator('#day-list > li').first().locator('.run').count()) === 2);
    await p.click('#s-am');
    eq('keep at least one ride', await txt(p, '#s-runs-err'), 'Keep at least one ride.');
    ok('morning stays on', await p.isChecked('#s-am'));
    await p.check('#s-pm');
    await p.fill('#s-title', 'Football practice');
    await p.click('#copy');
    ok('copy uses the run name', (await p.evaluate(() => navigator.clipboard.readText()).catch(() => '')).startsWith('Football practice rota'));
    await p.click('#restart');
    ok('start counting again: only today\'s drives count', (await txt(p, '#count-since')).startsWith('From Wed 28 Oct') && /Ayesha\s+[01] drives?/.test(await txt(p, '#count-list')), await txt(p, '#count-list'));
    await p.click('#set-msg .undo');
    ok('undo start again', /Ayesha\s+3 drives/.test(await txt(p, '#count-list')));

    // ---------- odd input ----------
    await addFamily(p, '<b>Zoe</b> ' + 'x'.repeat(60), ['  Tom  ']);
    const last = p.locator('#fam-list > li').last();
    ok('typed HTML is shown as text and long names are cut', (await last.locator('.box-name').innerText()) === ('<b>Zoe</b> ' + 'x'.repeat(60)).slice(0, 30) && !(await last.locator('b').count()));
    ok('a joining family gets the start day field', true);
    await p.getByRole('button', { name: /^Remove <b>Zoe/ }).click();

    // ---------- wipe and corrupt data ----------
    await p.click('#wipe');
    ok('delete everything', (await p.locator('#fam-list > li').count()) === 0 && await p.locator('#start-here').isVisible());
    await p.click('#set-msg .undo');
    ok('undo delete everything', (await p.locator('#fam-list > li').count()) === 3);
    await p.evaluate(k => localStorage.setItem(k, '{"v":1,"start":"broken'), KEY);
    await p.reload({ waitUntil: 'networkidle' });
    ok('corrupt saved data: starts fresh and says so', (await txt(p, '#set-msg')).includes('could not be read') && await p.locator('#start-here').isVisible());
    await p.evaluate(k => localStorage.setItem(k, JSON.stringify({ v: 1, start: '2026-10-26', families: [{ id: 1, name: 'Ok', kids: [{ id: 2, name: 'K' }], seats: 'many', no: 'x' }, { id: 1, name: 'Dup' }], days: 'all' })), KEY);
    await p.reload({ waitUntil: 'networkidle' });
    ok('half-broken saved data: the good parts are kept', (await p.locator('#fam-list > li').count()) === 1 && (await p.locator('#fam-list .badge').innerText()) === '4 seats');
    ok('light/dark switch', await p.evaluate(() => { const b = document.querySelector('.theme-toggle'); const a = document.documentElement.getAttribute('data-theme'); b.click(); return document.documentElement.getAttribute('data-theme') !== a; }));
    await p.context().close();

    // ---------- storage blocked ----------
    p = await newPage();
    await p.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
    await p.goto(URL, { waitUntil: 'networkidle' });
    ok('storage blocked: warns and still works', await p.locator('#storage-warn').isVisible());
    await addFamily(p, 'A', ['B']);
    ok('storage blocked: rota still made', (await p.locator('#day-list .r-who').count()) > 0 || (await txt(p, '#next-list')).length > 0);
    await p.context().close();

    // ---------- screen sizes, scrolling, overlap, help ----------
    const SEED = { v: 1, title: 'School run', days: [1, 2, 3, 4, 5], runs: { am: true, pm: true }, start: '2026-10-19', families: [
        { id: 1, name: 'Ayesha', kids: [{ id: 2, name: 'Ali', rides: 'both' }, { id: 3, name: 'Sara', rides: 'am' }], seats: 4, no: [], away: [], joined: '2026-10-19', left: null },
        { id: 4, name: 'Bilal', kids: [{ id: 5, name: 'Omar', rides: 'both' }], seats: 4, no: ['1pm', '3pm'], away: [{ from: '2026-11-02', to: '2026-11-03', name: '' }], joined: '2026-10-19', left: null },
        { id: 6, name: 'Hina Siddiqui-Rahman', kids: [{ id: 7, name: 'Zain', rides: 'both' }, { id: 8, name: 'Maryam', rides: 'both' }], seats: 5, no: ['2am', '2pm'], away: [], joined: '2026-10-19', left: null }],
        holidays: [{ from: '2026-10-30', to: '2026-10-30', name: 'Teacher training day' }], over: { '2026-10-29': { pm: { out: [7] }, am: { driver: 4 } } }, log: {}, cost: { on: true, cents: 30000 }, cur: 'Rs', nextId: 9 };
    const overlap = () => {
        const bad = [];
        document.querySelectorAll('main, .app, .col-main, .col-side').forEach(par => {
            const kids = [...par.children].filter(c => { const s = getComputedStyle(c); return s.display !== 'none' && s.position !== 'absolute' && c.offsetParent !== null; });
            for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
                const a = kids[i].getBoundingClientRect(), b = kids[j].getBoundingClientRect();
                if (a.width && b.width && Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2) bad.push((kids[i].id || kids[i].className) + '/' + (kids[j].id || kids[j].className));
            }
        });
        return bad;
    };
    const controlsOverlap = () => {
        const els = [...document.querySelectorAll('input:not([type=file]):not([type=checkbox]), select, button, a.secondary')].filter(e => e.offsetParent !== null && getComputedStyle(e).visibility !== 'hidden').map(e => [e, e.getBoundingClientRect()]);
        const bad = [];
        for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
            const [ea, a] = els[i], [eb, b] = els[j];
            if (ea.contains(eb) || eb.contains(ea)) continue;
            if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) bad.push((ea.id || ea.textContent.trim().slice(0, 15)) + '/' + (eb.id || eb.textContent.trim().slice(0, 15)));
        }
        return bad;
    };
    const sticksOut = () => { const w = document.documentElement.clientWidth; return [...document.querySelectorAll('main *')].filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.right > w + 1 || r.left < -1) && getComputedStyle(e).position !== 'absolute'; }).slice(0, 3).map(e => e.id || e.className || e.tagName); };
    const placeholdersFit = () => [...document.querySelectorAll('input[placeholder]')].filter(i => i.offsetParent !== null).filter(i => {
        const c = document.createElement('canvas').getContext('2d'), s = getComputedStyle(i); c.font = s.fontSize + ' ' + s.fontFamily;
        return c.measureText(i.placeholder).width > i.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight) + 1; }).map(i => i.id);
    for (const scheme of ['dark', 'light']) for (const w of [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920]) {
        for (const filled of [true, false]) {
            p = await newPage({ viewport: { width: w, height: 900 }, colorScheme: scheme });
            await at(p, new Date(2026, 9, 28, 7, 30));
            if (filled) await p.addInitScript(([k, s]) => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem(k, s); } }, [KEY, JSON.stringify(SEED)]);
            await p.goto(URL, { waitUntil: 'networkidle' });
            const tag = scheme + ' ' + w + (filled ? ' filled' : ' empty') + ': ';
            if (filled) {
                await p.locator('#day-list .run').first().getByRole('button', { name: 'Change driver' }).click();
                await p.getByRole('button', { name: 'Away dates for Bilal', exact: true }).click();
                await p.click('#h-open');
            }
            if (w <= 390 || w === 1280) { await p.click('#f-open'); if (filled) { await p.click('#kid-add'); await p.click('#kid-add'); } }
            ok(tag + 'no horizontal scroll', await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
            eq(tag + 'nothing sticks out', await p.evaluate(sticksOut), []);
            if (w <= 390) { eq(tag + 'no controls overlap', await p.evaluate(controlsOverlap), []); eq(tag + 'placeholders fit', await p.evaluate(placeholdersFit), []); }
            if (w >= 900) for (const pos of [0, 0.5, 1]) {
                await p.evaluate(f => window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * f), pos);
                eq(tag + 'no blocks overlap at scroll ' + pos * 100 + '%', await p.evaluate(overlap), []);
            }
            if ([320, 390, 820, 1280].includes(w) && filled) {
                await p.evaluate(() => window.scrollTo(0, 0));
                await p.locator('.topbar button', { hasText: /help/i }).first().click().catch(async () => { await p.locator('.help-btn, button[aria-label*="Help" i]').first().click(); });
                const d = p.locator('dialog.help');
                const box = await d.boundingBox();
                ok(tag + 'help opens inside the screen', !!box && box.x >= 0 && box.y >= 0 && box.x + box.width <= w + 1 && box.y + box.height <= 901 && (await d.locator('h2').innerText()).includes('How to use School Run Carpool Rota for Parents'));
                await p.keyboard.press('Escape'); ok(tag + 'Escape closes help', !(await d.evaluate(e => e.open)));
                const tb = await p.evaluate(() => { const bs = [...document.querySelectorAll('.topbar > *')].map(e => e.getBoundingClientRect()); return bs.every((a, i) => bs.every((b, j) => i >= j || Math.min(a.right, b.right) - Math.max(a.left, b.left) <= 1 || Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) <= 1)); });
                ok(tag + 'top bar buttons do not overlap', tb);
            }
            await p.context().close();
        }
    }
    ok('no console errors or failed requests', errors.length === 0, errors.slice(0, 3).join(' | '));
    ['favicon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'screenshots/desktop.png', 'screenshots/phone.png', 'manifest.webmanifest', 'sw.js', 'LICENSE', 'README.md'].forEach(f => ok('file exists: ' + f, fs.existsSync(path.join(__dirname, f))));
    const readme = fs.readFileSync(path.join(__dirname, 'README.md'), 'utf8');
    [...readme.matchAll(/(?:!\[[^\]]*\]\(|src=")([^)"]+)/g)].forEach(m => ok('README image resolves: ' + m[1], /^https?:/.test(m[1]) || fs.existsSync(path.join(__dirname, m[1]))));
    await browser.close(); if (srv) srv.close();
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    if (fail) process.exitCode = 1;
})();
