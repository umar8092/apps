// Drives the real page through every row of the use-case matrix. Run from the repo root:
//   node learner-driver-practice-log/ui-test.js            (local)
//   node learner-driver-practice-log/ui-test.js --live     (https://umar8092.github.io/apps)
//   node learner-driver-practice-log/ui-test.js --shots    (also makes screenshots/desktop.png and phone.png; --only-shots skips the checks)
// The clock is fixed at Sat 31 Oct 2026, 21:00 in Sydney so every answer is exact.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), LIVE = process.argv.includes('--live'), ONLY_SHOTS = process.argv.includes('--only-shots'), SHOTS = ONLY_SHOTS || process.argv.includes('--shots');
let pass = 0, failed = 0;
const ok = (c, name) => { if (c) pass++; else { failed++; console.log('FAIL ' + name); } };
const eq = (got, want, name) => { const g = JSON.stringify(got), w = JSON.stringify(want); if (g === w) pass++; else { failed++; console.log('FAIL ' + name + '\n  got  ' + g + '\n  want ' + w); } };
const NOW = new Date('2026-10-31T21:00:00+11:00');

(async () => {
    let srv, base = 'https://umar8092.github.io/apps';
    if (!LIVE) {
        srv = http.createServer((q, r) => { let f = decodeURIComponent(q.url.split('?')[0]); if (f.endsWith('/')) f += 'index.html'; const fp = path.join(ROOT, f);
            if (!fp.startsWith(ROOT) || !fs.existsSync(fp)) { r.writeHead(404); return r.end(); }
            r.writeHead(200, { 'Content-Type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' }[path.extname(fp)] || 'application/octet-stream' });
            fs.createReadStream(fp).pipe(r); }).listen(0);
        base = 'http://localhost:' + srv.address().port;
    }
    const url = base + '/learner-driver-practice-log/';
    const b = await chromium.launch();
    const errors = [], bad = [];
    async function newPage(width, opts = {}) {
        const { init, scheme, ...rest } = opts;
        const ctx = await b.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block', timezoneId: 'Australia/Sydney', colorScheme: scheme || 'dark', acceptDownloads: true, ...rest });
        await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base }).catch(() => {});
        await ctx.route(/goatcounter|zgo\.at/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
        const p = await ctx.newPage();
        await p.clock.install({ time: NOW });
        if (init) await p.addInitScript(init);
        p.on('pageerror', e => errors.push(width + ' ' + e.message));
        p.on('console', m => { if (m.type() === 'error') errors.push(width + ' console ' + m.text()); });
        p.on('response', r => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()); });
        p.on('dialog', d => d.accept());
        await p.goto(url, { waitUntil: 'networkidle' });
        return p;
    }
    const text = (p, sel) => p.locator(sel).innerText();
    const vis = (p, sel) => p.locator(sel).isVisible();
    async function setup(p, o) {
        await p.click(await vis(p, '#start-btn') ? '#start-btn' : (await vis(p, '#add-learner') ? '#add-learner' : '#add-learner2'));
        await p.fill('#l-name', o.name);
        await p.selectOption('#l-rule', o.rule);
        if (o.city) await p.selectOption('#l-city', o.city);
        if (o.custom) { await p.fill('#l-total', o.custom[0]); await p.fill('#l-nightreq', o.custom[1]); }
        if (o.fixed) { await p.check('input[name="l-nmode"][value="fixed"]'); await p.fill('#l-from', o.fixed[0]); await p.fill('#l-to', o.fixed[1]); }
        if (o.prior) { await p.click('#lo-prior'); await p.fill('#l-ptotal', o.prior[0]); await p.fill('#l-pnight', o.prior[1]); }
        await p.click('#l-save');
    }
    async function drive(p, o) {
        await p.click('#add-drive');
        await p.fill('#t-date', o.date); await p.fill('#t-start', o.start); await p.fill('#t-end', o.end);
        if (o.sup != null) await p.fill('#t-sup', o.sup);
        if (o.lesson) await p.check('#t-lesson');
        for (const r of o.roads || []) await p.click('#t-roads .chip[data-id="' + r + '"]');
        for (const s of o.skills || []) await p.click('#t-skills .chip[data-id="' + s + '"]');
        if (o.car) { if (await vis(p, '#to-car')) await p.click('#to-car'); await p.fill('#t-car', o.car); }
        if (o.night != null) { await p.click('#to-night'); await p.fill('#t-night', o.night); }
        if (o.notes) { await p.click('#to-notes'); await p.fill('#t-notes', o.notes); }
        const pv = await text(p, '#t-preview');
        await p.click('#t-save');
        return pv;
    }
    const AISHA = [
        { date: '2026-10-04', start: '10:00', end: '11:30', sup: 'Dad', roads: ['local', 'main'], skills: ['start', 'turns', 'roundabout'] },
        { date: '2026-10-08', start: '19:30', end: '21:00', sup: 'Mum', roads: ['main'], skills: ['nightdrive', 'lanes'] },
        { date: '2026-10-11', start: '09:00', end: '10:00', sup: 'Instructor', lesson: true, skills: ['parallel', 'reversepark', 'hill'] },
        { date: '2026-10-19', start: '14:00', end: '16:30', sup: 'Dad', roads: ['highway', 'rain'], skills: ['highway', 'lanes'], car: 'Corolla' },
        { date: '2026-10-23', start: '20:00', end: '21:15', sup: 'Mum', roads: ['local'], skills: ['parallel', 'nightdrive'] },
        { date: '2026-10-25', start: '10:00', end: '11:00', sup: 'Instructor', lesson: true, skills: ['roundabout', 'threepoint'] },
        { date: '2026-10-31', start: '18:45', end: '20:00', sup: 'Mum', roads: ['main'], skills: ['turns', 'nightdrive'], notes: 'Smooth merging, nervous at the roundabout in the dark' }
    ];
    async function fillAisha(p) {
        await setup(p, { name: 'Aisha', rule: 'au-nsw', city: 'sydney', prior: ['60', '8'] });
        for (const d of AISHA) await drive(p, d);
        for (const s of ['start', 'turns', 'roundabout', 'lanes']) await p.check('#skill-list input[aria-label="Confident at ' + ({ start: 'Moving off and stopping smoothly', turns: 'Turns and intersections', roundabout: 'Roundabouts', lanes: 'Changing lanes and merging' })[s] + '"]');
        await p.evaluate(() => { const m = document.getElementById('msg'); m.textContent = ''; m.classList.remove('show'); window.scrollTo(0, 0); });
    }

    let p;
    if (!ONLY_SHOTS) {
    // ===== 1. first use, the main situation =====
    p = await newPage(390);
    ok(await vis(p, '#start'), 'first use: Start here card shows');
    ok(!(await vis(p, '#progress')), 'first use: no empty results');
    // setup errors
    await p.click('#start-btn');
    ok(await p.locator('#d-learner').evaluate(d => d.open), 'setup dialog opens');
    eq(await p.inputValue('#l-city'), 'sydney', 'NSW preset picks Sydney');
    ok((await text(p, '#l-rule-hint')).startsWith('Needs 120 hours of supervised driving, 20 of them at night.'), 'rule hint');
    ok((await text(p, '#l-sun-hint')).includes('sunset'), 'sun hint shows sunset today');
    ok(!(await vis(p, '#lw-prior')), 'prior hours hidden behind + button (optional)');
    await p.click('#l-save');
    eq(await text(p, '#le-name'), "Type the learner's name.", 'blank name refused');
    await p.selectOption('#l-rule', 'custom');
    ok(await vis(p, '#lw-custom'), 'custom fields show');
    await p.fill('#l-name', 'Test'); await p.fill('#l-total', ''); await p.fill('#l-nightreq', '12'); await p.click('#l-save');
    ok((await text(p, '#le-total')).startsWith('Type the total hours'), 'blank total refused');
    await p.fill('#l-total', '10'); await p.click('#l-save');
    ok((await text(p, '#le-nightreq')).includes('cannot be more than 10'), 'night more than total refused');
    await p.fill('#l-total', '-5'); await p.click('#l-save');
    ok((await text(p, '#le-total')).length > 0, 'negative total refused');
    await p.selectOption('#l-mult', '3'); eq(await p.inputValue('#l-cap'), '30', 'triple lessons suggests 30 h cap');
    await p.click('#lo-prior'); await p.fill('#l-ptotal', 'abc'); await p.click('#l-save');
    ok((await text(p, '#le-ptotal')).length > 0, 'bad prior hours refused');
    await p.click('#d-learner [data-close]');
    await fillAisha(p);
    await p.click('#add-drive');
    const chipH = await p.locator('#t-quick-date .chip').first().evaluate(e => [e.getBoundingClientRect().height, getComputedStyle(e).borderRadius]);
    ok(chipH[0] >= 40 && chipH[1] === '999px', 'chips are styled, big enough to tap');
    await p.click('#d-drive [data-close]');
    eq(await text(p, '#prog-h'), "Aisha's hours", 'progress title');
    eq(await text(p, '.total'), '74 h of 120 hours', 'MAIN: 74 h of 120');
    eq(await text(p, '.total-sub'), 'NSW, under 25, Australia', 'rule named under the total');
    eq((await p.locator('.meter-num').allInnerTexts()), ['74 h of 120 h', '11 h 24 min of 20 h'], 'MAIN: bars');
    eq(await text(p, '.togo'), '46 h of driving to go (8 h 36 min of it at night): about 19 weeks at your pace of 2 h 30 min a week (around Sat 13 Mar 2027).', 'MAIN: to go and finish date');
    const br = await p.locator('.breakdown li').allInnerTexts();
    eq(br, ['7 drives, 10 h behind the wheel, 3 h 24 min of it at night', '+ 4 h bonus for 2 h of lessons with an instructor (1 hour counts as 3, up to 30 h)', '+ 60 h logged before (8 h at night)'], 'MAIN: breakdown');
    eq(await p.locator('.drive').count(), 7, '7 drive boxes');
    eq(await text(p, '.drive >> nth=0 >> .drive-time'), '18:45 to 20:00 · 39 min at night', 'drive across sunset: 39 min at night');
    eq(await text(p, '.month-h'), 'October 2026\n7 drives, 10 h (3 h 24 min night)', 'month total');
    eq(await text(p, '#ready'), '4 of 12 skills ticked confident.', 'readiness line');
    ok((await text(p, '#skill-list')).includes('Parallel parking\nPractised on 2 drives, last Fri 23 Oct'), 'skill count and last');
    ok((await text(p, '#skill-list')).includes('Emergency stop\nNot practised yet'), 'not practised flagged');
    ok((await text(p, '#rules-body')).includes('Night is sunset to sunrise in Sydney (today 19:21 to 05:56)'), 'rules show night');
    // optional inputs not forced: a drive with no supervisor, car or notes saves
    const pv = await drive(p, { date: '2026-10-30', start: '07:00', end: '07:20', sup: '' });
    eq(pv, '20 min drive, all in daylight (sunset 19:20, sunrise 05:57)', 'preview line');
    eq(await p.locator('.drive').count(), 8, 'drive with only date and times saves');
    ok((await text(p, '#msg')).startsWith('Added 20 min.'), 'added message');
    // undo
    await p.click('#msg .undo');
    eq(await p.locator('.drive').count(), 7, 'undo removes it');
    // email and copy
    const href = await p.getAttribute('#email', 'href');
    ok(href.startsWith('mailto:?subject=Learner%20driver%20log%3A%20Aisha&body='), 'email link works with no recipient');
    ok(decodeURIComponent(href).includes('74 h of 120 hours, 11 h 24 min of 20 at night'), 'email body has the answer');
    await p.click('#copy');
    if (!LIVE) { const clip = await p.evaluate(() => navigator.clipboard.readText()); ok(clip.includes('Drives:\nSat 31 Oct 2026 · 18:45 to 20:00 · 1 h 15 min, 39 min at night · with Mum'), 'copy summary text'); }
    // CSV
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#csv')]);
    const csv = fs.readFileSync(await dl.path(), 'utf8');
    ok(csv.includes('2026-10-04,10:00,11:30,90,0,1.50,,Dad,,Quiet local streets; Busy main roads'), 'CSV row');
    eq(dl.suggestedFilename(), 'learner-log-aisha-2026-10-31.csv', 'CSV name');
    // reload keeps everything
    await p.reload({ waitUntil: 'networkidle' });
    eq(await text(p, '.total'), '74 h of 120 hours', 'reload keeps state');
    ok(await p.locator('#skill-list input[aria-label="Confident at Roundabouts"]').isChecked(), 'reload keeps confident ticks');

    // ===== 2. edit, delete, odd inputs =====
    await p.click('.drive >> nth=0 >> button:has-text("Edit")');
    eq(await text(p, '#dd-h'), 'Edit drive', 'edit dialog');
    eq(await p.inputValue('#t-end'), '20:00', 'edit prefilled');
    ok(await vis(p, '#tw-notes'), 'notes shown when the drive has notes');
    await p.fill('#t-end', '20:30'); await p.click('#t-save');
    eq(await text(p, '.drive >> nth=0 >> .drive-time'), '18:45 to 20:30 · 1 h 9 min at night', 'edited end time recomputes night');
    await p.click('#msg .undo');
    eq(await text(p, '.drive >> nth=0 >> .drive-time'), '18:45 to 20:00 · 39 min at night', 'undo edit');
    await p.click('.drive >> nth=0 >> button:has-text("Delete")');
    eq(await p.locator('.drive').count(), 6, 'delete');
    ok((await text(p, '#msg')).startsWith('Deleted the drive on Sat 31 Oct'), 'delete message');
    await p.click('#msg .undo'); eq(await p.locator('.drive').count(), 7, 'undo delete');
    // blank, future, same, too long, overlap
    await p.click('#add-drive');
    await p.fill('#t-start', ''); await p.fill('#t-end', ''); await p.click('#t-save');
    eq([await text(p, '#te-start'), await text(p, '#te-end')], ['Type the time you started.', 'Type the time you finished.'], 'blank times refused');
    await p.fill('#t-date', '2026-11-02'); await p.fill('#t-start', '10:00'); await p.fill('#t-end', '11:00'); await p.click('#t-save');
    ok((await text(p, '#te-date')).includes('future'), 'future date refused');
    await p.fill('#t-date', '2026-10-30'); await p.fill('#t-start', '10:00'); await p.fill('#t-end', '10:00'); await p.click('#t-save');
    ok((await text(p, '#te-end')).includes('same as the start'), 'same start and end refused');
    await p.fill('#t-start', '08:00'); await p.fill('#t-end', '21:30'); await p.click('#t-save');
    ok((await text(p, '#te-end')).includes('13 h 30 min drive'), 'over 12 hours refused');
    await p.fill('#t-date', '2026-10-31'); await p.fill('#t-start', '19:00'); await p.fill('#t-end', '19:30'); await p.click('#t-save');
    ok((await text(p, '#te-start')).includes('overlaps another drive'), 'overlap refused');
    // past midnight, typed night, huge notes
    await p.fill('#t-date', '2026-10-29'); await p.fill('#t-start', '23:15'); await p.fill('#t-end', '00:40');
    ok((await text(p, '#t-warn')).includes('Finished after midnight, on Fri 30 Oct.'), 'past midnight warning');
    eq(await text(p, '#t-preview'), '1 h 25 min drive, 1 h 25 min of it at night (sunset 19:19, sunrise 05:58)', 'past midnight all night');
    await p.click('#to-night'); await p.fill('#t-night', '999'); await p.click('#t-save');
    ok((await text(p, '#te-night')).includes('cannot be more than the whole drive'), 'typed night too long');
    await p.fill('#t-night', '60');
    await p.click('#to-notes'); await p.fill('#t-notes', 'Long note '.repeat(60));
    await p.click('#t-save');
    eq(await text(p, '.drive[data-id] >> nth=1 >> .drive-time'), '23:15 to 00:40 (next day) · 1 h at night (typed)', 'typed night saved');
    eq((await p.inputValue('#t-notes').catch(() => '')).length <= 500, true, 'notes capped');
    // live drive timer
    await p.click('#live-start');
    ok(await vis(p, '#live'), 'live box shows');
    ok((await text(p, '#live-text')).startsWith('Aisha is driving since 21:00'), 'live since');
    await p.reload({ waitUntil: 'networkidle' });
    ok(await vis(p, '#live'), 'live drive survives a reload');
    await p.clock.fastForward('45:00');
    await p.click('#live-stop');
    eq([await p.inputValue('#t-date'), await p.inputValue('#t-start'), await p.inputValue('#t-end')], ['2026-10-31', '21:00', '21:45'], 'finish fills times');
    await p.click('#t-save');
    ok(!(await vis(p, '#live')), 'live box gone after saving');
    ok((await text(p, '#msg')).startsWith('Added 45 min (45 min at night).'), 'live drive saved');
    await p.click('#live-start'); await p.click('#live-cancel');
    ok(!(await vis(p, '#live')) && (await text(p, '#msg')).startsWith('Stopped timing'), 'cancel live drive');

    // ===== 3. second learner with own settings, fixed night hours =====
    await setup(p, { name: 'aisha', rule: 'us-ca' });
    ok((await text(p, '#le-name')).includes('already a learner'), 'duplicate name refused');
    await p.fill('#l-name', 'Ben'); await p.selectOption('#l-rule', 'custom'); await p.fill('#l-total', '40'); await p.fill('#l-nightreq', '5');
    await p.check('input[name="l-nmode"][value="fixed"]'); await p.fill('#l-from', '21:00'); await p.fill('#l-to', '05:00');
    await p.click('#l-save');
    ok(await vis(p, '#who-sel'), 'learner switcher shows with two learners');
    eq(await text(p, '.total'), '0 min of 40 hours', 'Ben starts at 0');
    ok((await text(p, '.togo')).startsWith('40 h of driving to go (5 h of it at night).'), 'Ben to go');
    await drive(p, { date: '2026-10-30', start: '20:00', end: '22:00', sup: 'Uncle' });
    eq(await text(p, '.drive-time'), '20:00 to 22:00 · 1 h at night', 'fixed 21:00 night counts 1 h');
    await p.selectOption('#who-sel', { label: 'Aisha' });
    ok((await text(p, '.total')).startsWith('76 h'), 'Aisha kept her own totals');
    await p.selectOption('#who-sel', { label: 'Ben' });
    await p.click('#edit-learner'); await p.click('#l-del');
    ok(!(await vis(p, '#who-sel')), 'deleted Ben');
    await p.click('#msg .undo'); ok(await vis(p, '#who-sel'), 'undo delete learner');

    // ===== 4. backup, restore, delete everything =====
    const [bk] = await Promise.all([p.waitForEvent('download'), p.click('#backup')]);
    const bkPath = await bk.path();
    await p.click('#wipe');
    ok(await vis(p, '#start'), 'delete everything empties the app');
    await p.click('#set-msg .undo'); ok((await p.locator('#who-sel option').count()) === 2, 'undo delete everything');
    await p.click('#wipe');
    await p.setInputFiles('#restore-file', bkPath);
    await p.waitForFunction(() => document.getElementById('set-msg').textContent.startsWith('Restored'), null, { timeout: 5000 }).catch(() => {});
    ok((await text(p, '#set-msg')).startsWith('Restored 2 learners and 10 drives.'), 'restore backup');
    fs.writeFileSync('/tmp/not-backup.json', '{"hello":1}');
    await p.setInputFiles('#restore-file', '/tmp/not-backup.json');
    await p.waitForFunction(() => document.getElementById('set-msg').textContent.startsWith('That file'), null, { timeout: 5000 }).catch(() => {});
    ok((await text(p, '#set-msg')).startsWith('That file is not a backup'), 'bad backup refused');
    eq(await p.locator('#who-sel option').count(), 2, 'bad backup changes nothing');
    await p.context().close();

    // ===== 5. corrupt and blocked storage, very long name =====
    p = await newPage(390, { init: () => { if (!sessionStorage.getItem('x')) { localStorage.setItem('learner-driver-practice-log.state', '{broken'); sessionStorage.setItem('x', '1'); } } });
    ok((await text(p, '#set-msg')).includes('could not be read'), 'corrupt state message');
    ok(await vis(p, '#start'), 'corrupt state starts fresh');
    await p.context().close();
    p = await newPage(390, { init: () => { Storage.prototype.setItem = function () { throw new Error('blocked'); }; } });
    ok(await vis(p, '#storage-warn'), 'blocked storage warning');
    await setup(p, { name: 'W'.repeat(40), rule: 'us-tx', city: 'houston' });
    await drive(p, { date: '2026-10-31', start: '17:00', end: '18:00', sup: 'M'.repeat(60) });
    ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'very long names do not cause sideways scroll');
    await p.context().close();

    // ===== 6. every width, filled and empty, dark and light =====
    const WIDTHS = [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920];
    const overlap = () => [...document.querySelectorAll('main, .app, .col-main, .col-side')].flatMap(par => {
        const kids = [...par.children].filter(k => k.offsetParent !== null && getComputedStyle(k).display !== 'contents').map(k => [k, k.getBoundingClientRect()]);
        const o = []; for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) { const [a, r] = kids[i], [c, s] = kids[j];
            if (Math.min(r.right, s.right) - Math.max(r.left, s.left) > 2 && Math.min(r.bottom, s.bottom) - Math.max(r.top, s.top) > 2) o.push((a.id || a.className) + ' x ' + (c.id || c.className)); }
        return o; });
    const ctrlOverlap = (root) => { const els = [...(root ? document.querySelector(root) : document).querySelectorAll('input, select, button, textarea, a.secondary')].filter(e => root || !e.closest('dialog')).filter(e => e.offsetParent !== null && e.type !== 'hidden' && e.type !== 'file').map(e => [e, e.getBoundingClientRect()]).filter(([, r]) => r.width && r.height);
        const o = []; for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) { const [a, r] = els[i], [c, s] = els[j]; if (a.contains(c) || c.contains(a) || a.closest('label') && a.closest('label') === c.closest('label')) continue;
            if (Math.min(r.right, s.right) - Math.max(r.left, s.left) > 1 && Math.min(r.bottom, s.bottom) - Math.max(r.top, s.top) > 1) o.push((a.id || a.textContent.trim().slice(0, 20)) + ' x ' + (c.id || c.textContent.trim().slice(0, 20))); }
        return o; };
    const sticksOut = () => [...document.querySelectorAll('main *')].filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.right > innerWidth + 1 || r.left < -1) && e.offsetParent !== null; }).map(e => e.id || e.className).slice(0, 3);
    for (const scheme of ['dark', 'light']) {
        for (const w of WIDTHS) {
            p = await newPage(w, { scheme });
            const tag = scheme + ' ' + w + ': ';
            ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), tag + 'empty no sideways scroll');
            await fillAisha(p);
            ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), tag + 'filled no sideways scroll');
            eq(await p.evaluate(sticksOut), [], tag + 'nothing sticks out');
            for (const pos of [0, .5, 1]) {
                await p.evaluate(f => window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * f), pos);
                eq(await p.evaluate(overlap), [], tag + 'no overlapping blocks at scroll ' + pos);
            }
            if (w >= 900) {
                const [m, s] = await p.evaluate(() => ['.col-main', '.col-side'].map(q => document.querySelector(q).getBoundingClientRect()));
                ok(s.left > m.right - 1 && m.width > 450, tag + 'two columns on desktop');
            }
            if (w <= 390) {
                eq(await p.evaluate(ctrlOverlap), [], tag + 'page controls do not overlap');
                await p.click('#add-drive'); for (const b of ['#to-car', '#to-night', '#to-notes']) if (await vis(p, b)) await p.click(b);
                await p.fill('#t-date', '2026-10-30'); await p.fill('#t-start', '23:15'); await p.fill('#t-end', '00:40');
                eq(await p.evaluate(ctrlOverlap, '#d-drive'), [], tag + 'drive form controls do not overlap');
                ok(await p.evaluate(() => { const d = document.getElementById('d-drive'); return d.scrollWidth <= d.clientWidth + 1; }), tag + 'drive form fits');
                // placeholders fit their boxes
                const clipped = await p.evaluate(() => [...document.querySelectorAll('#d-drive input[placeholder], #d-drive textarea[placeholder]')].filter(i => i.offsetParent).filter(i => { const c = document.createElement('canvas').getContext('2d'); const cs = getComputedStyle(i); c.font = cs.fontSize + ' ' + cs.fontFamily; return c.measureText(i.placeholder).width > i.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) + 1; }).map(i => i.id));
                eq(clipped, [], tag + 'drive form placeholders fit');
                await p.click('#d-drive [data-close]');
                await p.click('#edit-learner'); await p.selectOption('#l-rule', 'custom'); await p.click('#lo-weather'); await p.selectOption('#l-mult', '2');
                eq(await p.evaluate(ctrlOverlap, '#d-learner'), [], tag + 'learner form (custom) controls do not overlap');
                await p.check('input[name="l-nmode"][value="fixed"]');
                eq(await p.evaluate(ctrlOverlap, '#d-learner'), [], tag + 'learner form (fixed hours) controls do not overlap');
                const clipped2 = await p.evaluate(() => [...document.querySelectorAll('#d-learner input[placeholder]')].filter(i => i.offsetParent).filter(i => { const c = document.createElement('canvas').getContext('2d'); const cs = getComputedStyle(i); c.font = cs.fontSize + ' ' + cs.fontFamily; return c.measureText(i.placeholder).width > i.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) + 1; }).map(i => i.id));
                eq(clipped2, [], tag + 'learner form placeholders fit');
                const selCut = await p.evaluate(() => [...document.querySelectorAll('#d-learner select')].filter(i => i.offsetParent).flatMap(i => [...i.options].filter(o => !o.hidden).map(o => { const c = document.createElement('canvas').getContext('2d'); const cs = getComputedStyle(i); c.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily; return c.measureText(o.text).width > i.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 22 ? o.text : null; }).filter(Boolean)));
                eq(selCut, [], tag + 'dropdown choices fit their box');
                ok(await p.evaluate(() => { const d = document.getElementById('d-learner'); return d.scrollWidth <= d.clientWidth + 1; }), tag + 'learner form fits');
                await p.click('#d-learner [data-close]');
                // second learner: switcher row
                await setup(p, { name: 'Ben', rule: 'us-ca', city: 'losangeles' });
                eq(await p.evaluate(ctrlOverlap), [], tag + 'two learners: controls do not overlap');
            }
            // cleared state after Delete everything
            await p.click('#wipe');
            ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), tag + 'cleared no sideways scroll');
            eq(await p.evaluate(overlap), [], tag + 'cleared no overlap');
            if (SHOTS && scheme === 'dark' && (w === 1280 || w === 390)) { /* screenshots made below */ }
            await p.context().close();
        }
    }

    // ===== 7. help and theme switch =====
    for (const w of [320, 390, 820, 1280]) {
        p = await newPage(w);
        const hb = p.locator('.help-btn'); await hb.click();
        const d = p.locator('dialog.help');
        ok(await d.evaluate(e => e.open), w + ' help opens');
        const r = await d.boundingBox(); ok(r.x >= 0 && r.x + r.width <= w + 1 && r.y >= 0, w + ' help on screen');
        eq(await d.locator('h2').innerText(), 'How to use Learner Driver Practice Log', w + ' help title');
        await p.keyboard.press('Escape'); ok(!(await d.evaluate(e => e.open)), w + ' Escape closes help');
        await hb.click(); await p.locator('.help-close').click(); ok(!(await d.evaluate(e => e.open)), w + ' Got it closes help');
        const tb = await p.evaluate(() => [...document.querySelectorAll('.topbar > *')].map(e => e.getBoundingClientRect()).map(r => [r.top, r.height]));
        ok(tb.every(([t, h]) => Math.abs(t - tb[0][0]) < 2 && h < 60), w + ' top bar on one row');
        const before = await p.evaluate(() => getComputedStyle(document.body).color);
        await p.click('.theme-toggle');
        ok(before !== await p.evaluate(() => getComputedStyle(document.body).color), w + ' theme switch changes colours');
        await p.context().close();
    }

    }
    // ===== screenshots =====
    if (SHOTS && !LIVE) {
        for (const [name, w, scale] of [['desktop', 1280, 1], ['phone', 390, 2]]) {
            p = await newPage(w, { deviceScaleFactor: scale, viewport: { width: w, height: name === 'phone' ? 844 : 900 } });
            await fillAisha(p);
            await p.evaluate(() => window.scrollTo(0, 0));
            await p.screenshot({ path: path.join(__dirname, 'screenshots', name + '.png') });
            await p.context().close();
        }
        console.log('screenshots saved');
    }

    eq(errors, [], 'no console or page errors');
    eq(bad.filter(u => !/favicon\.ico/.test(u)), [], 'no failed requests');
    await b.close(); if (srv) srv.close();
    console.log((failed ? 'FAILED ' + failed + ', ' : '') + pass + ' checks passed');
    process.exitCode = failed ? 1 : 0;
})();
