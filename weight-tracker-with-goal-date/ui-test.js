// Drives the page in headless Chromium. Run from the repo root: node weight-tracker-with-goal-date/ui-test.js [--base URL] [--shots]
// Without --base it serves the repo locally. --shots also saves screenshots/desktop.png and phone.png.
const fs = require('fs'), path = require('path'), http = require('http');
let pw; try { pw = require('playwright'); } catch (e) { pw = require('playwright-core'); }
const ROOT = path.resolve(__dirname, '..'), SLUG = 'weight-tracker-with-goal-date', KEY = SLUG + '.state';
const args = process.argv.slice(2), bi = args.indexOf('--base'), BASE = bi >= 0 ? args[bi + 1].replace(/\/$/, '') : null, SHOTS = args.includes('--shots');
let pass = 0, fail = 0; const fails = [];
const ok = (name, cond, extra) => { if (cond) pass++; else { fail++; fails.push(name + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : '')); } };
const eq = (name, got, want) => ok(name, JSON.stringify(got) === JSON.stringify(want), { got, want });

function serve() {
    const types = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml', png: 'image/png', webmanifest: 'application/manifest+json' };
    return new Promise(res => { const s = http.createServer((req, rs) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p);
        if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rs.writeHead(404); return rs.end(); } rs.writeHead(200, { 'content-type': types[f.split('.').pop()] || 'application/octet-stream' }); rs.end(fs.readFileSync(f)); }).listen(0, () => res(s)); });
}
// Ayesha's log from the README: 85.8 kg on 1 Sep, about 0.55 kg a week down, water swings, skips every 5th day; "today" is 16 Oct 2026
const swing = [0.6, -0.4, 0.2, 0, -0.3, 0.5, -0.6];
function ayesha() {
    const e = []; for (let i = 0; i <= 45; i++) { if (i % 5 === 4) continue; const kg = Math.round((85.8 - 0.08 * i + (i ? swing[i % 7] : 0)) * 10) / 10;
        const d = new Date(Date.UTC(2026, 8, 1 + i)).toISOString().slice(0, 10); e.push({ id: 'a' + i, d, g: Math.round(kg * 1000), note: i === 0 ? 'Start' : i === 22 ? 'after a wedding' : '' }); }
    return { v: 1, current: 'p1', people: [{ id: 'p1', name: 'Ayesha', unit: 'kg', hUnit: 'cm', heightMm: 1640, goalG: 75000, target: '2027-03-01', noBmi: false, range: '90', entries: e }] };
}

(async () => {
    let srv, url;
    if (BASE) url = BASE + '/' + SLUG + '/'; else { srv = await serve(); url = 'http://localhost:' + srv.address().port + '/' + SLUG + '/'; }
    const browser = await pw.chromium.launch();
    const errors = [];
    async function open(opts) {
        opts = opts || {};
        const ctx = await browser.newContext({ viewport: { width: opts.w || 390, height: opts.h || 900 }, deviceScaleFactor: opts.scale || 1, colorScheme: opts.scheme || 'dark', locale: opts.locale || 'en-GB', timezoneId: 'Asia/Karachi' });
        await ctx.route(/goatcounter\.com|gc\.zgo\.at/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
        await ctx.addInitScript(() => { const T = new Date('2026-10-16T09:30:00+05:00').getTime(), D = Date; class FD extends D { constructor(...a) { super(...(a.length ? a : [T])); } static now() { return T; } } window.Date = FD; });
        if (opts.state !== undefined) await ctx.addInitScript(([k, v]) => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } }, [KEY, opts.state === null ? null : typeof opts.state === 'string' ? opts.state : JSON.stringify(opts.state)]);
        const page = await ctx.newPage();
        page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
        page.on('response', r => { if (r.status() >= 400 && r.url().startsWith(url.split('/' + SLUG)[0])) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
        await page.goto(url, { waitUntil: 'networkidle' });
        return { ctx, page };
    }
    const txt = (page, sel) => page.locator(sel).innerText();
    const saved = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);

    // 1. first use: empty state, nothing forced
    let { ctx, page } = await open({ state: null });
    ok('empty state shown', await page.locator('#sum-empty').isVisible());
    ok('note box hidden until asked', !(await page.locator('#note').isVisible()));
    ok('height hidden until asked', !(await page.locator('#h-cm').isVisible()));
    ok('target hidden until asked', !(await page.locator('#target').isVisible()));
    ok('one person: no person bar', !(await page.locator('#people').isVisible()));
    eq('en-GB defaults to stone', await page.locator('.unit-btn[aria-pressed=true]').innerText(), 'st and lb');
    await page.click('.unit-btn[data-unit=kg]');
    // blank, letters, zero, negative, typo, huge
    await page.click('#save'); eq('blank error', await txt(page, '#w-err'), 'Type your weight.');
    for (const [v, want] of [['abc', 'Type a number, for example 82.4.'], ['0', 'A weight must be more than 0.'], ['-3', 'A weight must be more than 0.'], ['824', 'Type a weight from 20 to 350 kg. Did you mean 82.4?'], ['1e9', 'Type a number, for example 82.4.']]) {
        await page.fill('#w', v); await page.click('#save'); eq('error for ' + v, await txt(page, '#w-err'), want);
    }
    eq('nothing saved after errors', (await saved(page)) === null || (await saved(page)).people[0].entries.length === 0, true);
    // first weigh-in: comma decimal, Enter saves
    await page.fill('#w', '85,8'); await page.press('#w', 'Enter');
    ok('first saved message', (await txt(page, '#add-msg')).includes('Saved 85.8 kg for today.'), await txt(page, '#add-msg'));
    eq('avg after one', await txt(page, '#avg'), '85.8 kg');
    ok('goal prompt without goal', (await txt(page, '#goalbox')).includes('Add a goal weight'));
    eq('field cleared', await page.inputValue('#w'), '');
    // undo the first weigh-in
    await page.click('#add-msg .undo'); ok('undo back to empty', await page.locator('#sum-empty').isVisible());
    await page.fill('#w', '85.8'); await page.click('#save');
    // set goal with Enter
    await page.fill('#goal', '75'); await page.press('#goal', 'Enter');
    eq('goal saved', (await saved(page)).people[0].goalG, 75000);
    ok('goal needs more weigh-ins', (await txt(page, '#goalbox')).includes('after a few more weigh-ins'), await txt(page, '#goalbox'));
    // bad goal
    await page.fill('#goal', '7'); await page.press('#goal', 'Enter'); eq('bad goal error', await txt(page, '#goal-err'), 'Type a weight from 20 to 350 kg.');
    eq('bad goal not saved', (await saved(page)).people[0].goalG, 75000);
    await page.fill('#goal', '75'); await page.press('#goal', 'Enter'); eq('goal error cleared', await txt(page, '#goal-err'), '');
    // backfill a past day with Change date; a future date is refused
    await page.click('#when-open'); await page.fill('#when', '2026-10-20'); await page.fill('#w', '85'); await page.click('#save');
    ok('future date refused', (await txt(page, '#when-err')).includes('future'));
    await page.fill('#when', '2026-10-09'); await page.dispatchEvent('#when', 'change'); await page.fill('#w', '86.6'); await page.click('#save');
    ok('past day saved', (await txt(page, '#add-msg')).includes('Saved 86.6 kg for'), await txt(page, '#add-msg'));
    // a big jump within a week asks to check
    await page.fill('#w', '95'); await page.click('#save');
    ok('typo warning', (await txt(page, '#add-msg')).includes('Please check it'), await txt(page, '#add-msg'));
    await page.click('#add-msg .undo');
    await page.click('#when-today'); eq('back to today', (await txt(page, '#when-text')).startsWith('Today'), true);
    // second weigh-in today is kept, the day averages
    await page.fill('#w', '85.4'); await page.click('#save');
    ok('second today message', (await txt(page, '#add-msg')).includes('Second weigh-in today'), await txt(page, '#add-msg'));
    eq('latest is the day average', await txt(page, '#t-last'), '85.6 kg');
    ok('latest says average of 2', (await txt(page, '#t-last-sub')).includes('average of 2'));
    // note
    await page.click('#note-open'); await page.fill('#note', '<b>not bold</b>'); await page.fill('#w', '85.5'); await page.press('#note', 'Enter');
    ok('note shown as text', (await page.locator('.e-note').first().innerText()) === '<b>not bold</b>');
    eq('3 kg log entries', (await saved(page)).people[0].entries.length, 4);
    // edit with Escape cancel, then save
    await page.locator('.entry').first().locator('button', { hasText: 'Edit' }).click();
    await page.fill('.editing input >> nth=0', '84.9'); await page.keyboard.press('Escape');
    ok('escape cancels edit', (await page.locator('.e-w').first().innerText()) === '85.5 kg');
    await page.locator('.entry').first().locator('button', { hasText: 'Edit' }).click();
    await page.fill('.editing input >> nth=0', 'x'); await page.click('.editing .primary'); ok('edit error', (await page.locator('.editing .err').innerText()).includes('Type a number'));
    await page.fill('.editing input >> nth=0', '84.9'); await page.click('.editing .primary');
    eq('edited', await page.locator('.e-w').first().innerText(), '84.9 kg');
    // delete with undo
    const before = (await saved(page)).people[0].entries.length;
    await page.locator('.entry').first().locator('button', { hasText: 'Delete' }).click();
    eq('deleted', (await saved(page)).people[0].entries.length, before - 1);
    await page.click('#list-msg .undo'); eq('delete undone', (await saved(page)).people[0].entries.length, before);
    // units: lb and stone show the same weight, nothing changes in storage
    await page.click('.unit-btn[data-unit=lb]'); eq('lb latest (day average of 85.8, 85.4 and 84.9)', await txt(page, '#t-last'), C_lb(85367));
    eq('goal shown in lb', await page.inputValue('#goal'), '165.3');
    await page.click('.unit-btn[data-unit=st]'); ok('stone boxes', await page.locator('#w-st').isVisible() && !(await page.locator('#w').isVisible()));
    eq('goal in stone', [await page.inputValue('#goal-st'), await page.inputValue('#goal-lb')], ['11', '11.3']);
    await page.fill('#w-st', '13'); await page.fill('#w-lb', '15'); await page.click('#save'); eq('pounds 15 refused', await txt(page, '#w-err'), 'Pounds must be under 14 (14 lb is 1 stone).');
    await page.fill('#w-st', '13'); await page.fill('#w-lb', '5.5'); await page.click('#save'); ok('stone saved', (await txt(page, '#add-msg')).includes('Saved 13 st 5.5 lb'), await txt(page, '#add-msg'));
    await page.click('#add-msg .undo');
    await page.click('.unit-btn[data-unit=kg]');
    // height and BMI
    await page.click('#height-open'); eq('en-GB height in ft and in', await page.locator('.h-btn[aria-pressed=true]').innerText(), 'ft and in'); await page.click('.h-btn[data-h=cm]'); await page.fill('#h-cm', '17'); await page.press('#h-cm', 'Enter'); ok('bad height', (await txt(page, '#h-err')).includes('50 to 250'));
    await page.fill('#h-cm', '164'); await page.press('#h-cm', 'Enter'); ok('bmi tile', await page.locator('#tile-bmi').isVisible());
    await page.check('#no-bmi'); ok('no bmi ranges', !(await txt(page, '#t-bmi-sub')).includes('range'));
    await page.uncheck('#no-bmi');
    await page.click('.h-btn[data-h=ftin]'); eq('ft in filled', [await page.inputValue('#h-ft'), await page.inputValue('#h-in')], ['5', '5']);
    await page.click('.h-btn[data-h=cm]');
    // reload keeps everything
    await page.reload({ waitUntil: 'networkidle' });
    eq('reload keeps goal', await page.inputValue('#goal'), '75');
    eq('reload keeps height', await page.inputValue('#h-cm'), '164');
    ok('reload keeps list', (await page.locator('.entry').count()) === 4);
    // second person with own unit and goal
    await page.click('#person-add'); ok('person bar shows', await page.locator('#people').isVisible());
    await page.fill('#name', 'Omar'); ok('new person empty', await page.locator('#sum-empty').isVisible());
    eq('new person no goal', await page.inputValue('#goal'), '');
    await page.click('.unit-btn[data-unit=lb]'); await page.fill('#w', '200'); await page.click('#save');
    await page.locator('.person', { hasText: 'Person 1' }).click(); eq('person 1 still kg', await page.locator('.unit-btn[aria-pressed=true]').innerText(), 'kg');
    await page.locator('.person', { hasText: 'Omar' }).click(); await page.click('#person-remove');
    eq('person removed', (await saved(page)).people.length, 1); await page.click('#set-msg .undo'); eq('person back', (await saved(page)).people.length, 2);
    // delete all with undo
    await page.locator('.person', { hasText: 'Person 1' }).click();
    await page.click('#wipe'); ok('wiped', await page.locator('#sum-empty').isVisible()); await page.click('#set-msg .undo'); ok('wipe undone', !(await page.locator('#sum-empty').isVisible()));
    await ctx.close();

    // 2. the README situation: exact answers
    ({ ctx, page } = await open({ state: ayesha(), w: 1280 }));
    eq('ayesha avg', await txt(page, '#avg'), '82.4 kg');
    eq('ayesha latest', await txt(page, '#t-last'), '82.2 kg');
    eq('ayesha since', await txt(page, '#t-since'), '−3.6 kg');
    eq('ayesha pace', await txt(page, '#t-pace'), '−0.5 kg'); ok('ayesha pace sub', (await txt(page, '#t-pace-sub')).startsWith('a week. Losing, from 22 days weighed'));
    eq('ayesha left', await txt(page, '#t-left'), '7.4 kg to lose');
    const gb = await txt(page, '#goalbox');
    ok('ayesha goal date', gb.includes('You reach 75.0 kg around Mon, 25 Jan 2027') || gb.includes('You reach 75.0 kg around Mon 25 Jan 2027'), gb);
    ok('ayesha weeks', gb.includes('in about 14 weeks'), gb);
    ok('ayesha target', gb.includes('To reach it by') && gb.includes('lose 0.4 kg a week') && gb.includes('On track: about 5 weeks early'), gb);
    eq('ayesha bmi', await txt(page, '#t-bmi'), '30.7');   // 82.44 / 1.64^2 = 30.65
    ok('ayesha bmi words', (await txt(page, '#t-bmi-sub')).includes('obese range'));
    ok('chart drawn', (await page.locator('#chart circle').count()) > 20 && (await page.locator('#chart polyline').count()) === 1);
    for (const r of ['30', '365', 'all']) { await page.click('.r-btn[data-r="' + r + '"]'); ok('range ' + r, (await page.locator('#chart circle').count()) > 5); }
    await page.click('.r-btn[data-r="30"]'); eq('30 days fewer dots', await page.locator('#chart circle').count(), 24);
    await page.click('.r-btn[data-r="90"]');
    ok('show more for long lists', await page.locator('#more').isVisible()); await page.click('#more'); eq('all listed', await page.locator('.entry').count(), 37);
    // copy and email text
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.click('#copy'); const clip = await page.evaluate(() => navigator.clipboard.readText());
    ok('copy text', clip.includes('Weight log: Ayesha') && clip.includes('7-day average: 82.4 kg') && clip.includes('Goal: 75.0 kg - around') && clip.includes('82.2 kg'), clip.slice(0, 300));
    await page.click('#email', { noWaitAfter: true, trial: true });
    await page.evaluate(() => document.getElementById('email').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
    const href = await page.getAttribute('#email', 'href');
    ok('mailto without recipient', href.startsWith('mailto:?subject=Weight%20log%3A%20Ayesha&body='), href.slice(0, 80));
    // csv download
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#csv')]);
    const csv = fs.readFileSync(await dl.path(), 'utf8');
    ok('csv rows', csv.split('\r\n').length === 38 && csv.includes('2026-10-16,82.2,181.2,'), csv.slice(0, 120));
    // print builds the report
    await page.evaluate(() => { window.print = () => {}; }); await page.click('#print'); ok('report table', (await page.locator('#report tr').count()) === 38);
    // backup and restore (bad file refused)
    const [bk] = await Promise.all([page.waitForEvent('download'), page.click('#backup')]);
    const bpath = await bk.path();
    const bad = path.join(require('os').tmpdir(), 'wt-bad.json'); fs.writeFileSync(bad, '{"people":"x"}');
    await page.setInputFiles('#restore-file', bad); await page.waitForTimeout(200); ok('bad backup refused', (await txt(page, '#set-msg')).includes('not a backup'));
    await page.click('#wipe'); await page.setInputFiles('#restore-file', bpath); await page.waitForTimeout(200);
    ok('backup restored', (await txt(page, '#set-msg')).includes('Restored 1 person and 37 weigh-ins'), await txt(page, '#set-msg'));
    if (SHOTS) {
        await page.click('#goal-msg', { trial: true }).catch(() => {});
        await page.evaluate(() => { document.querySelectorAll('.msg').forEach(m => { m.textContent = ''; m.className = 'msg'; }); window.scrollTo(0, 0); });
        await page.screenshot({ path: path.join(__dirname, 'screenshots/desktop.png'), fullPage: false, clip: { x: 0, y: 0, width: 1280, height: 1050 } });
    }
    await ctx.close();
    if (SHOTS) {
        ({ ctx, page } = await open({ state: ayesha(), w: 390, h: 844, scale: 2 }));
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: path.join(__dirname, 'screenshots/phone.png'), clip: { x: 0, y: 0, width: 390, height: 1240 }, fullPage: true });
        await ctx.close();
    }

    // 3. goal cases through the page
    const mk = (list, goal, extra) => ({ v: 1, current: 'p', people: [Object.assign({ id: 'p', name: '', unit: 'kg', hUnit: 'cm', heightMm: null, goalG: goal, target: null, noBmi: false, range: '90', entries: list.map(([d, kg], i) => ({ id: 'x' + i, d, g: kg * 1000, note: '' })) }, extra || {})] });
    const cases = [
        ['reached', mk([['2026-10-01', 80], ['2026-10-08', 76], ['2026-10-16', 74.8]], 75000), 'Goal reached'],
        ['away', mk([['2026-10-01', 80], ['2026-10-08', 80.5], ['2026-10-16', 81]], 75000), 'going up, away from 75.0 kg'],
        ['still', mk([['2026-10-01', 80], ['2026-10-08', 80.02], ['2026-10-16', 80]], 75000), 'hardly changed'],
        ['far', mk([['2026-10-01', 80], ['2026-10-08', 79.9], ['2026-10-16', 79.8]], 50000), 'more than 5 years away'],
        ['gain', mk([['2026-10-02', 50], ['2026-10-09', 50.5], ['2026-10-16', 51]], 55000), 'You reach 55.0 kg around'],
        ['target passed', mk([['2026-10-02', 84], ['2026-10-09', 83.5], ['2026-10-16', 83]], 75000, { target: '2026-10-10' }), 'has passed'],
        ['target late', mk([['2026-10-02', 84], ['2026-10-09', 83.5], ['2026-10-16', 83]], 75000, { target: '2026-12-01' }), 'late'],
        ['fast loss', mk([['2026-10-02', 90], ['2026-10-09', 88], ['2026-10-16', 86]], 75000), 'more than 1% of your weight']
    ];
    for (const [name, st, want] of cases) {
        ({ ctx, page } = await open({ state: st }));
        const t = (await txt(page, '#goalbox')) + ' ' + ((await page.locator('#fast').isVisible()) ? await txt(page, '#fast') : '');
        ok('case ' + name, t.includes(want), t); await ctx.close();
    }
    // 4. corrupt and odd saved data
    for (const bad of ['{bad', '[]', '{"people":[{"entries":[{"d":"2026-99-01","g":"x"}],"unit":"zz"}]}', 'null']) {
        ({ ctx, page } = await open({ state: bad })); ok('corrupt state ' + bad + ' opens', await page.locator('#save').isVisible()); await ctx.close();
    }
    // a very long note and name do not break the layout at 320
    const longS = mk([['2026-10-02', 84], ['2026-10-09', 83.5], ['2026-10-16', 83]], 75000, { name: 'W'.repeat(40) }); longS.people[0].entries[0].note = 'x'.repeat(200);
    longS.people.push(Object.assign(JSON.parse(JSON.stringify(longS.people[0])), { id: 'q', name: 'Second person with a long name' }));
    ({ ctx, page } = await open({ state: longS, w: 320 }));
    ok('no sideways scroll at 320 with long text', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await ctx.close();
    // 5. layout at phone widths with every optional field open, controls never overlap
    for (const w of [320, 360, 390]) for (const unit of ['kg', 'st']) {
        ({ ctx, page } = await open({ state: Object.assign(ayesha(), {}), w }));
        if (unit === 'st') await page.click('.unit-btn[data-unit=st]');
        await page.click('#when-open'); await page.click('#note-open');
        await page.locator('.entry').first().locator('button', { hasText: 'Edit' }).click();
        const bad = await page.evaluate(() => { const k = [...document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]), button, a.secondary')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.height; }); const out = [];
            for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { if (k[i].contains(k[j]) || k[j].contains(k[i])) continue; const a = k[i].getBoundingClientRect(), b = k[j].getBoundingClientRect(); if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2) out.push((k[i].id || k[i].textContent) + '/' + (k[j].id || k[j].textContent)); }
            const ph = [...document.querySelectorAll('input[placeholder]')].filter(e => e.offsetWidth).filter(e => { const c = document.createElement('canvas').getContext('2d'); const cs = getComputedStyle(e); c.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily; return c.measureText(e.placeholder).width > e.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) + 1; }).map(e => e.id);
            return { out, ph, scroll: document.documentElement.scrollWidth > innerWidth + 1 }; });
        eq('no overlaps ' + w + ' ' + unit, bad.out, []); eq('placeholders fit ' + w + ' ' + unit, bad.ph, []); eq('no sideways scroll ' + w + ' ' + unit, bad.scroll, false);
        await ctx.close();
    }
    // 6. light theme switch
    ({ ctx, page } = await open({ state: ayesha(), w: 1024, scheme: 'light' }));
    const bg1 = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await page.click('.theme-toggle'); const bg2 = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    ok('theme switch changes colours', bg1 !== bg2, [bg1, bg2]); await ctx.close();
    // 7. US English starts in lb
    ({ ctx, page } = await open({ state: null, locale: 'en-US' })); eq('en-US starts in lb', await page.locator('.unit-btn[aria-pressed=true]').innerText(), 'lb'); await ctx.close();

    // 8. every width, dark and light, with a filled log and with an empty one: no sideways scroll, nothing sticks out, no blocks overlap when scrolled
    for (const scheme of ['dark', 'light']) for (const filled of [true, false]) {
        ({ ctx, page } = await open({ state: filled ? ayesha() : null, scheme, w: 320 }));
        for (const w of [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920]) {
            await page.setViewportSize({ width: w, height: 900 }); await page.waitForTimeout(160);
            const r = [];
            for (const pos of [0, 0.5, 1]) {
                await page.evaluate(p => window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * p), pos);
                r.push(await page.evaluate(() => {
                    const out = [];
                    if (document.documentElement.scrollWidth > innerWidth + 1) out.push('scroll');
                    document.querySelectorAll('main *').forEach(e => { const b = e.getBoundingClientRect(); if (b.width && (b.right > innerWidth + 1 || b.left < -1) && getComputedStyle(e).display !== 'none') out.push('out:' + (e.id || e.className)); });
                    document.querySelectorAll('main, .col-main, .col-side').forEach(h => { const k = [...h.children].filter(c => { const b = c.getBoundingClientRect(); return b.width > 4 && b.height > 4 && getComputedStyle(c).display !== 'none'; });
                        for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { const a = k[i].getBoundingClientRect(), b = k[j].getBoundingClientRect(); if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 4 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 4) out.push('overlap:' + (k[i].id || k[i].className) + '/' + (k[j].id || k[j].className)); } });
                    return out.slice(0, 4);
                }));
            }
            eq('layout ' + scheme + ' ' + (filled ? 'filled' : 'empty') + ' ' + w, [...new Set(r.flat())], []);
        }
        await ctx.close();
    }

    eq('no console errors', errors, []);
    await browser.close(); if (srv) srv.close();
    console.log((fail ? fails.map(f => 'FAIL ' + f).join('\n') + '\n' : '') + pass + ' passed, ' + fail + ' failed' + (BASE ? ' (live: ' + url + ')' : ' (local)'));
    process.exitCode = fail ? 1 : 0;
})();
function C_lb(g) { return (Math.round(g / 453.59237 * 10) / 10).toFixed(1) + ' lb'; }
