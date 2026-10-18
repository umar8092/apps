// Drives the real page in headless Chromium: node ui-test.js [--shots] [--base https://umar8092.github.io/apps]
// Without --base it serves this repo on localhost. With --base it tests the LIVE page. The clock is Sun 18 Oct 2026, 9:00 p.m.
const pw = (() => { for (const m of ['playwright', 'playwright-core']) { try { return require(m); } catch (e) { /* next */ } } throw new Error('playwright not found'); })();
const path = require('path'), fs = require('fs'), http = require('http'), os = require('os');
const bi = process.argv.indexOf('--base');
const shots = process.argv.includes('--shots');
let fail = 0, url;
const ok = (name, cond, extra) => { if (!cond) fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond || extra == null ? '' : '  -> ' + JSON.stringify(extra))); };
const NOW = new Date(2026, 9, 18, 21, 0).getTime();
const KEY = 'mood-and-sleep-journal.state';

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

// Hina's two weeks from the README: 5 to 18 Oct 2026, 11 Oct missed
function weeks(extra) {
    const DAYS = [
        ['05', 3, 420, ['t2']], ['06', 2, 330, ['t2', 't3'], 'Deadline, coffee at 5 pm'], ['07', 4, 450, ['t0', 't1']], ['08', 3, 400, ['t2']], ['09', 4, 480, ['t0']],
        ['10', 5, 510, ['t0', 't1'], 'Long walk in the park with Sara'], ['12', 2, 300, ['t2', 't3']], ['13', 3, 390, []], ['14', 4, 460, ['t0']], ['15', 2, 340, ['t2', 't3']],
        ['16', 4, 440, ['t0', 't1'], 'Gym, then dinner with Ali'], ['17', 5, 500, ['t1']], ['18', 3, null, ['t2']]];
    const entries = {}; DAYS.forEach(([d, m, s, tags, note]) => { entries['2026-10-' + d] = { m, s, tags, note: note || '' }; });
    return Object.assign({ entries, period: '30' }, extra || {});
}

async function load(b, vp, opt = {}) {
    const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: vp.width < 500 ? 2 : 1, colorScheme: opt.theme || 'light', locale: 'en-GB',
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
const mood = (p, m) => p.click('#moods [data-mood="' + m + '"]');
const tag = (p, name) => p.click('#tags .chip >> text="' + name + '"');

(async () => {
    let srv;
    if (bi >= 0) url = process.argv[bi + 1].replace(/\/$/, '') + '/mood-and-sleep-journal/';
    else { srv = await serve(); url = 'http://localhost:' + srv.address().port + '/apps/mood-and-sleep-journal/'; }
    const b = await pw.chromium.launch();
    let p;

    // ---- first use
    p = await load(b, { width: 390, height: 844 });
    ok('first use: empty', (await txt(p, '#sum-empty')).includes('No days yet') && (await txt(p, '#entry-h')) === 'How was today?' && (await txt(p, '#save')) === 'Save today');
    ok('first use: note, own tag, times and help line are optional and hidden', !await vis(p, '#note') && !await vis(p, '#tag-name') && !await vis(p, '#bed') && !await vis(p, '#helpline'));
    ok('first use: 8 starter tags', (await p.locator('#tags .chip').count()) === 8);
    ok('first use: sharing off, wipe off', await p.isDisabled('#copy') && (await p.getAttribute('#email', 'aria-disabled')) === 'true' && await p.isDisabled('#wipe'));
    await p.click('#save');
    ok('no mood: asks for it', (await txt(p, '#mood-err')) === 'Tap a face to choose your mood.' && (await saved(p)) === null);
    await mood(p, 4);
    await p.click('#save');
    ok('mood only (sleep optional)', (await txt(p, '#entry-msg')).startsWith('Saved today: Good.'), await txt(p, '#entry-msg'));
    ok('after the first day: 1 of 1 days', (await txt(p, '#t-days')) === '1 of 1' && (await txt(p, '#t-days-sub')) === 'none missed');
    ok('save turns into update', (await txt(p, '#save')) === 'Update today' && (await txt(p, '#for-text')).includes('already filled in'));
    await p.fill('#sleep', 'lots'); await p.click('#save');
    ok('bad sleep refused', (await txt(p, '#sleep-err')).includes('for example 7.5'));
    await p.fill('#sleep', '25'); await p.click('#save');
    ok('over 24 h refused', (await txt(p, '#sleep-err')).includes('more than 24 hours'));
    await p.click('#times-open'); await p.fill('#bed', '23:30'); await p.fill('#wake', '07:00');
    ok('bedtime to wake-up across midnight', (await p.inputValue('#sleep')) === '7:30' && (await txt(p, '#sleep-err')) === '');
    await p.fill('#bed', '07:00'); await p.fill('#wake', '07:00');
    ok('same times refused', (await txt(p, '#sleep-err')).includes('the same'));
    await p.fill('#sleep', '7,5'); await tag(p, 'Exercise'); await p.press('#sleep', 'Enter');
    ok('update replaces with message and undo', (await txt(p, '#entry-msg')).startsWith('Updated today: Good; slept 7 h 30 min; Exercise. The earlier entry for this day was replaced.'), await txt(p, '#entry-msg'));
    await p.click('#entry-msg .undo');
    ok('undo brings back the earlier entry', JSON.stringify((await saved(p)).entries['2026-10-18']) === JSON.stringify({ m: 4, s: null, tags: [], note: '' }));
    // own tag
    await p.click('#tag-open'); await p.fill('#tag-name', '  exercise '); await p.click('#tag-add');
    ok('repeat tag refused', (await txt(p, '#tag-err')).includes('already in the list'));
    await p.fill('#tag-name', ''); await p.press('#tag-name', 'Enter');
    ok('blank tag refused', (await txt(p, '#tag-err')).startsWith('Type a name'));
    await p.fill('#tag-name', 'Prayed on time'); await p.press('#tag-name', 'Enter');
    ok('own tag added and ticked', (await p.locator('#tags .chip[aria-pressed="true"]').textContent()) === 'Prayed on time' && (await p.locator('#tag-list .tl').count()) === 9);
    // low day: kind words and help line
    await p.click('#help-open'); await p.fill('#helpline', 'Umang 0311 7786264');
    await p.click('#day-prev');
    ok('day before: heading and button', (await txt(p, '#entry-h')) === 'How was yesterday?' && (await txt(p, '#save')) === 'Save Sat, 17 Oct');
    await mood(p, 1); await p.click('#note-open'); await p.fill('#note', 'Could not get out of bed\nCried a lot'); await p.click('#save');
    ok('low day: help line and support shown', (await txt(p, '#entry-msg')).includes('Sorry it was a hard day. Your help line: Umang 0311 7786264.') && (await txt(p, '#entry-msg')).includes('crisis line'));
    ok('low day: calendar coloured', (await p.getAttribute('.cal-d >> text="17"', 'class')).includes('m1'));
    ok('note keeps its lines', (await saved(p)).entries['2026-10-17'].note === 'Could not get out of bed\nCried a lot');
    // future day refused
    await p.fill('#day', '2026-10-20');
    ok('future day refused', (await txt(p, '#entry-msg')).includes('has not happened yet') && (await p.inputValue('#day')) === '2026-10-17');
    ok('future days in calendar disabled', await p.isDisabled('.cal-d >> text="25"') && await p.isDisabled('#cal-next'));
    // reload keeps everything
    await p.reload({ waitUntil: 'networkidle' });
    const s1 = await saved(p);
    ok('reload: kept', Object.keys(s1.entries).length === 2 && s1.helpline === 'Umang 0311 7786264' && await vis(p, '#helpline') && await vis(p, '#note') && (await txt(p, '#entry-h')) === 'How was today?');
    ok('no errors so far', !p.errors.length, p.errors);
    await p.context().close();

    // ---- the main situation: Hina's two weeks
    p = await load(b, { width: 1280, height: 900 }, { state: weeks() });
    ok('weeks: tiles', (await txt(p, '#t-mood')) === '3.4 / 5' && (await txt(p, '#t-mood-word')) === 'Okay' && (await txt(p, '#t-sleep')) === '6 h 58 min' && (await txt(p, '#t-days')) === '13 of 14' && (await txt(p, '#t-days-sub')) === '1 day left blank' && (await txt(p, '#t-low')) === '3');
    const effs = await p.$$eval('#effects .eff', l => l.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
    ok('weeks: caffeine first', effs[0] === 'Caffeine after 2 pm−1.82.0 with (3 days), 3.8 without (10 days)Days with it were worse on average.', effs[0]);
    ok('weeks: exercise', effs.includes('Exercise+1.34.2 with (5 days), 2.9 without (8 days)Days with it were better on average.'), effs);
    ok('weeks: time outside few days', effs.some(e => e.startsWith('Time outside+1.6')));
    const bands = await p.$$eval('#bands .eff', l => l.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
    ok('weeks: sleep bands', bands.join('|') === 'Under 6 hours2.0 / 5Average mood after 3 nights like this.|6 to 7 hours3.0 / 5Average mood after 2 nights like this.|7 hours or more4.1 / 5Average mood after 7 nights like this.', bands);
    ok('weeks: calendar colours', (await p.locator('.cal-d.m5').count()) === 2 && (await p.locator('.cal-d.m2').count()) === 3 && !(await p.getAttribute('.cal-d >> text="11"', 'class')).includes(' m'));
    ok('weeks: list', (await txt(p, '#list-h')) === 'Your days (13)' && (await txt(p, '#days')).includes('Long walk in the park with Sara'));
    if (shots) { await p.evaluate(() => { document.getElementById('summary').scrollIntoView(); scrollBy(0, -16); }); await p.screenshot({ path: path.join(__dirname, 'screenshots/desktop.png') }); await p.evaluate(() => scrollTo(0, 0)); }
    // missed day filled in later from the calendar
    await p.click('.cal-d >> text="11"');
    ok('calendar day opens the form', (await txt(p, '#entry-h')) === 'How was Sun, 11 Oct?' && (await p.locator('#moods [aria-pressed="true"]').count()) === 0);
    await mood(p, 3); await p.fill('#sleep', '6:45'); await p.click('#save');
    ok('missed day filled', (await txt(p, '#t-days')) === '14 of 14' && (await txt(p, '#entry-msg')).startsWith('Saved Sun, 11 Oct: Okay; slept 6 h 45 min.'));
    await p.click('.cal-d >> text="10"');
    ok('existing day loads its values', (await p.getAttribute('#moods [data-mood="5"]', 'aria-pressed')) === 'true' && (await p.inputValue('#sleep')) === '8:30' && (await p.inputValue('#note')) === 'Long walk in the park with Sara' && (await txt(p, '#save')) === 'Update Sat, 10 Oct');
    // sharing: notes left out unless ticked
    let mail = decodeURIComponent(await p.getAttribute('#email', 'href'));
    ok('email: summary, no address, no notes', mail.startsWith('mailto:?subject=Mood and sleep journal&body=') && mail.includes('Average mood: 3.4 out of 5') && mail.includes('Exercise: 4.2 with') && !mail.includes('Long walk'), mail.slice(0, 300));
    await p.check('#with-notes');
    mail = decodeURIComponent(await p.getAttribute('#email', 'href'));
    ok('email with notes', mail.includes('Gym, then dinner with Ali') && mail.includes('(Only the newest days fit in an email.'));
    await p.click('#copy');
    const clip = await p.evaluate(() => navigator.clipboard.readText());
    ok('copy', clip.includes('Sat, 10 Oct 2026: 5 Very good, slept 8 h 30 min, Exercise, Time outside - Long walk in the park with Sara'), clip.slice(0, 400));
    await p.uncheck('#with-notes');
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#csv')]);
    const csvText = fs.readFileSync(await dl.path(), 'utf8');
    ok('csv without notes', dl.suggestedFilename() === 'mood-and-sleep-2026-10-05-to-2026-10-18.csv' && csvText.includes('2026-10-06,2,Low,5.5,Work or study stress; Caffeine after 2 pm,') && !csvText.includes('Deadline'), csvText.slice(0, 300));
    await p.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
    ok('print table', (await p.locator('#report tbody tr').count()) === 14 && (await p.locator('#report th').count()) === 4);
    await p.emulateMedia({ media: 'print' });
    ok('print shows only the report', await vis(p, '#report') && !await vis(p, '#entry'));
    await p.emulateMedia({ media: 'screen' });
    // period
    await p.selectOption('#period', '7');
    ok('last 7 days', (await txt(p, '#t-days')) === '7 of 7' && (await txt(p, '#list-h')) === 'Your days (7)');
    await p.context().close();

    // ---- edit and delete from the list, remove a tag, wipe, backup and restore
    p = await load(b, { width: 390, height: 844 }, { state: weeks() });
    await p.click('.dy >> nth=0 >> text=Edit');
    ok('edit loads the day', (await txt(p, '#entry-h')) === 'How was today?' && (await p.getAttribute('#moods [data-mood="3"]', 'aria-pressed')) === 'true');
    await p.click('.dy >> nth=1 >> text=Delete');
    ok('delete', (await txt(p, '#list-h')) === 'Your days (12)' && (await txt(p, '#list-msg')).startsWith('Deleted Sat, 17 Oct 2026'));
    await p.click('#list-msg .undo');
    ok('delete undo', (await txt(p, '#list-h')) === 'Your days (13)');
    await p.click('#tag-list .tl >> nth=3 >> text=Remove');
    ok('remove tag from days', (await txt(p, '#set-msg')).startsWith('Removed the tag "Caffeine after 2 pm" from 3 days') && !(await saved(p)).entries['2026-10-06'].tags.includes('t3') && (await p.locator('#tags .chip').count()) === 7);
    await p.click('#set-msg .undo');
    ok('remove tag undo', (await saved(p)).entries['2026-10-06'].tags.includes('t3') && (await p.locator('#tags .chip').count()) === 8);
    const [bk] = await Promise.all([p.waitForEvent('download'), p.click('#backup')]);
    const bkPath = path.join(os.tmpdir(), 'mood-backup-test.json'); await bk.saveAs(bkPath);
    ok('backup', (await txt(p, '#set-msg')).includes('Backup saved with 13 days'));
    await p.click('#wipe');
    ok('wipe', (await txt(p, '#sum-empty')).includes('No days yet') && (await txt(p, '#set-msg')).startsWith('Deleted 13 days'));
    await p.click('#set-msg .undo');
    ok('wipe undo', (await txt(p, '#t-days')) === '13 of 14');
    await p.click('#wipe');
    await p.setInputFiles('#restore-file', bkPath);
    await p.waitForFunction(() => document.getElementById('set-msg').textContent.includes('restored'));
    ok('restore', (await txt(p, '#set-msg')).includes('Backup restored: 13 days, 8 tags') && (await txt(p, '#t-days')) === '13 of 14');
    const badPath = path.join(os.tmpdir(), 'mood-bad.json'); fs.writeFileSync(badPath, '[1,2]');
    await p.setInputFiles('#restore-file', badPath);
    await p.waitForFunction(() => document.getElementById('set-msg').textContent.includes('not a backup'));
    ok('bad backup refused', (await txt(p, '#t-days')) === '13 of 14');
    ok('no errors in the main run', !p.errors.length, p.errors);
    await p.context().close();

    // ---- corrupt and blocked storage, huge journal
    p = await load(b, { width: 390, height: 844 }, { state: '{nope' });
    ok('corrupt: starts fresh', (await txt(p, '#sum-empty')).includes('No days yet') && !p.errors.length);
    await p.context().close();
    p = await load(b, { width: 390, height: 844 }, { state: JSON.stringify({ entries: { '2026-10-18': { m: 4, tags: ['t0', 'x'] }, '2026-10-17': { m: 7 }, 'bad': { m: 3 } }, period: 'zz' }) });
    ok('bad values dropped', (await txt(p, '#list-h')) === 'Your days (1)' && (await p.inputValue('#period')) === '30');
    await p.context().close();
    p = await load(b, { width: 390, height: 844 }, { block: true });
    ok('blocked storage notice', (await txt(p, '#entry-msg')).includes('not letting the app save'));
    await mood(p, 5); await p.click('#save');
    ok('blocked storage still works', (await txt(p, '#t-mood')) === '5.0 / 5' && !p.errors.length, p.errors);
    await p.context().close();
    const big = weeks({ period: 'all' }); big.tags = Array.from({ length: 24 }, (_, i) => ({ id: 't' + i, name: i === 5 ? 'A very long tag name xyz' : 'Tag number ' + i }));
    for (let i = 0; i < 1500; i++) { const d = new Date(Date.UTC(2022, 0, 1 + i)); big.entries[d.toISOString().slice(0, 10)] = { m: 1 + (i % 5), s: 300 + (i % 200), tags: ['t' + (i % 24)], note: i === 3 ? 'x'.repeat(1000) : '' }; }
    p = await load(b, { width: 320, height: 700 }, { state: big });
    ok('1500+ days: summary', (await txt(p, '#t-days')).includes(' of '));
    ok('320: no sideways scroll with 24 tags and long text', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await p.context().close();

    // ---- screen sizes and themes, filled and empty
    for (const theme of ['dark', 'light']) for (const st of [weeks(), null]) for (const w of [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920]) {
        p = await load(b, { width: w, height: 800 }, st ? { state: st, theme } : { theme });
        const tg = theme + ' ' + w + (st ? ' filled' : ' empty');
        if (w <= 390) { await p.click('#times-open'); await p.click('#tag-open'); await p.click('#note-open').catch(() => {}); await p.click('#help-open'); await p.fill('#sleep', 'x'); await p.click('#save'); }
        if (!await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)) ok(tg + ': no sideways scroll', false);
        if (w <= 390) {
            const o = await p.evaluate(() => { const k = [...document.querySelectorAll('input:not([type=checkbox]):not([type=file]), select, button, a.secondary, textarea')].filter(e => e.getBoundingClientRect().width > 0); const bad = [];
                for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { if (k[i].contains(k[j]) || k[j].contains(k[i])) continue; const a = k[i].getBoundingClientRect(), c = k[j].getBoundingClientRect(); if (Math.min(a.right, c.right) - Math.max(a.left, c.left) > 2 && Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top) > 2) bad.push((k[i].id || k[i].textContent) + '/' + (k[j].id || k[j].textContent)); } return bad; });
            if (o.length) ok(tg + ': controls do not overlap', false, o.slice(0, 3));
            const ph = await p.evaluate(() => [...document.querySelectorAll('input[placeholder]')].filter(i => i.getBoundingClientRect().width > 0).filter(i => { const c = document.createElement('canvas').getContext('2d'); const cs = getComputedStyle(i); c.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily; return c.measureText(i.placeholder).width > i.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight); }).map(i => i.id));
            if (ph.length) ok(tg + ': placeholders fit', false, ph);
            const clip = await p.evaluate(() => [...document.querySelectorAll('.mood, .chip, .cal-d, .tile, .day-btns button')].filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.className + ':' + e.textContent));
            if (clip.length) ok(tg + ': nothing clipped', false, clip.slice(0, 3));
        }
        if (w >= 900) for (const pos of [0, 0.5, 1]) {
            await p.evaluate(x => scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * x), pos);
            const ov = await p.evaluate(() => { const bad = []; document.querySelectorAll('main, .col-main, .col-side').forEach(h => { const k = [...h.children].filter(c => c.getBoundingClientRect().height > 4 && getComputedStyle(c).display !== 'none');
                for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { const a = k[i].getBoundingClientRect(), c = k[j].getBoundingClientRect(); if (Math.min(a.right, c.right) - Math.max(a.left, c.left) > 4 && Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top) > 4) bad.push(k[i].className + '/' + k[j].className); } }); return bad; });
            if (ov.length) ok(tg + ' scroll ' + pos + ': no overlap', false, ov);
        }
        if (w === 1280 && st) { const r = await p.evaluate(() => [document.querySelector('.col-main').getBoundingClientRect().width, document.querySelector('.app').getBoundingClientRect().width]); if (!(r[1] > 1000 && r[0] > 400)) ok(tg + ': desktop uses its width', false, r); }
        if (p.errors.length) ok(tg + ': no errors', false, p.errors);
        await p.context().close();
    }
    ok('sizes 320-1920, dark and light, filled and empty: no sideways scroll, overlaps, clipping or cut placeholders', true);

    // ---- help dialog at 4 widths
    for (const w of [320, 390, 820, 1280]) {
        p = await load(b, { width: w, height: 800 });
        await p.click('.help-btn');
        const r = await p.locator('dialog.help').boundingBox();
        ok('help ' + w + ': open and on screen', r && r.x >= 0 && r.y >= 0 && r.x + r.width <= w && r.y + r.height <= 800 && (await txt(p, 'dialog.help h2')) === 'How to use Mood and Sleep Journal');
        await p.keyboard.press('Escape');
        ok('help ' + w + ': Escape closes', !await p.evaluate(() => document.querySelector('dialog.help').open));
        await p.click('.help-btn'); await p.click('.help-close');
        ok('help ' + w + ': Got it closes', !await p.evaluate(() => document.querySelector('dialog.help').open));
        ok('help ' + w + ': top bar on one line', await p.evaluate(() => { const r = [...document.querySelectorAll('.topbar > *')].map(e => e.getBoundingClientRect()); return r.every(a => Math.abs(a.top - r[0].top) < 4); }));
        await p.context().close();
    }

    // ---- light/dark switch
    p = await load(b, { width: 390, height: 844 }, { theme: 'light' });
    const bg1 = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await p.click('.theme-toggle');
    ok('light/dark switch changes the look', bg1 !== await p.evaluate(() => getComputedStyle(document.body).backgroundColor) && (await p.getAttribute('html', 'data-theme')) === 'dark');
    await p.context().close();

    // ---- phone screenshot and files
    p = await load(b, { width: 390, height: 844 }, { state: weeks() });
    if (shots) {
        await p.evaluate(() => document.getElementById('sum-body').scrollIntoView());
        await p.evaluate(() => scrollBy(0, -16));
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
