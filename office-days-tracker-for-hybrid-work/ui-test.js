// Full page test with Playwright. Run from the repo root or this folder: node ui-test.js
//   BASE=https://umar8092.github.io/apps node ui-test.js   tests the live site
//   node ui-test.js --shots                                 also saves screenshots/desktop.png and phone.png
// "Today" is fixed to Wed 21 Oct 2026 in Pakistan time so every answer can be checked exactly.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), SLUG = 'office-days-tracker-for-hybrid-work', KEY = SLUG + '.state';
const SHOTS = process.argv.includes('--shots');
const NOW = new Date('2026-10-21T10:00:00+05:00');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; if (!cond) console.log('FAIL ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra).slice(0, 500) : '')); };

function serve() {
    const types = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml', png: 'image/png', webmanifest: 'application/manifest+json' };
    return new Promise(res => { const s = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0].replace(/^\/apps/, '')); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': types[f.split('.').pop()] || 'application/octet-stream' }); r.end(fs.readFileSync(f)); }).listen(0, () => res(s)); });
}

(async () => {
    let srv, base = process.env.BASE;
    if (!base) { srv = await serve(); base = 'http://localhost:' + srv.address().port + '/apps'; }
    const URL = base + '/' + SLUG + '/';
    const browser = await chromium.launch();
    const errors = [], failed = [], requested = new Set();
    async function newPage(opts, init) {
        const ctx = await browser.newContext(Object.assign({ viewport: { width: 390, height: 844 }, acceptDownloads: true, timezoneId: 'Asia/Karachi', colorScheme: 'dark' }, opts || {}));
        await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new globalThis.URL(base).origin });
        await ctx.route(/goatcounter\.com|gc\.zgo\.at/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
        const page = await ctx.newPage();
        await page.clock.setFixedTime(NOW);
        if (init) await page.addInitScript(init);
        page.on('pageerror', e => errors.push(e.message));
        page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
        page.on('request', r => { if (r.url().startsWith(base)) requested.add(r.url()); });
        page.on('response', r => { if (r.status() >= 400 && r.url().startsWith(base)) failed.push(r.status() + ' ' + r.url()); });
        await page.goto(URL, { waitUntil: 'networkidle' });
        return { ctx, page };
    }
    const txt = (page, sel) => page.locator(sel).innerText();
    const head = page => txt(page, '#sum-body .next');
    const facts = page => page.locator('#sum-body .facts li').allInnerTexts();
    const cell = (page, d) => page.locator('#cal button.cell[data-d="' + d + '"]');
    async function markDay(page, d, label) { await cell(page, d).click(); await page.click('#marks .mk:text-is("' + label + '")'); }
    // Sana's October: 3 office days a week, Mon to Fri
    async function sana(page) {
        const plan = [['2026-10-01', 'Office'], ['2026-10-02', 'Home'], ['2026-10-05', 'Office'], ['2026-10-06', 'Office'], ['2026-10-07', 'Home'], ['2026-10-08', 'Office'], ['2026-10-09', 'Home'],
            ['2026-10-12', 'Office'], ['2026-10-13', 'Home'], ['2026-10-14', 'Leave'], ['2026-10-15', 'Office'], ['2026-10-16', 'Home'],
            ['2026-10-19', 'Office'], ['2026-10-20', 'Home'], ['2026-10-30', 'Leave']];
        for (const [d, l] of plan) await markDay(page, d, l);
        await page.click('#to-today');
        await page.click('#marks .mk:text-is("Office")');
    }

    // ---------- first use ----------
    {
        const { ctx, page } = await newPage();
        ok('first use: today chosen', (await txt(page, '#sel-day')) === 'Wed 21 Oct (today)', await txt(page, '#sel-day'));
        ok('first use: default rule', (await txt(page, '#rule-text')) === 'Rule: 3 office days a week (Mon to Fri).', await txt(page, '#rule-text'));
        ok('first use: headline', (await head(page)) === '3 more office days needed this week', await head(page));
        ok('first use: Clear disabled', await page.locator('#marks .mk[data-m=""]').isDisabled());
        ok('first use: start date hidden (optional)', !(await page.locator('#w-start').isVisible()) && await page.locator('#o-start').isVisible());
        ok('first use: no start date needed to work', (await facts(page)).some(f => f.startsWith('2 past working days not marked yet: Mon 19 Oct, Tue 20 Oct')), await facts(page));
        ok('first use: calendar shows October', (await txt(page, '#m-name')) === 'October 2026');

        // ---------- Sana's week ----------
        await sana(page);
        ok('sana: headline', (await head(page)) === '1 more office day needed this week', await head(page));
        const f = await facts(page);
        ok('sana: done', f[0] === '2 of 3 office days done.', f);
        ok('sana: days left', f.includes('2 working days left: Thu 22 Oct, Fri 23 Oct.'), f);
        const more = await page.locator('#sum-body .facts.more li').allInnerTexts();
        ok('sana: quarter weeks', more[0] === 'Q4 (Oct to Dec 2026): 2 of 2 finished weeks met.', more);
        ok('sana: last week lowered for leave', more[1] === 'Last week: 2 of 2 office days, target met.', more);
        ok('sana: today pressed', (await page.locator('#marks .mk[aria-pressed=true]').innerText()).startsWith('Office'));
        ok('sana: cell letter', (await cell(page, '2026-10-21').innerText()).replace(/\s+/g, ' ').trim() === '21 O', await cell(page, '2026-10-21').innerText());
        ok('sana: month counts', (await txt(page, '#m-counts')) === 'October: 8 office, 6 home, 2 leave.', await txt(page, '#m-counts'));
        ok('sana: undo message', (await txt(page, '#mark-msg')).includes('Undo'));

        // undo the last mark
        await page.click('#mark-msg .undo');
        ok('undo: back to 2 needed', (await head(page)) === '2 more office days needed this week', await head(page));
        await page.click('#marks .mk:text-is("Office")');
        // already marked
        await page.click('#marks .mk:text-is("Office")');
        ok('same mark again: message', (await txt(page, '#mark-msg')).includes('already marked Office'));

        // plan Thursday: planned
        await markDay(page, '2026-10-22', 'Office');
        ok('planned: headline', (await head(page)) === 'On track: your planned days meet the target', await head(page));
        ok('planned: listed', (await facts(page)).includes('Planned: Thu 22 Oct.'), await facts(page));
        // half day on Friday instead of Thursday
        await page.click('#marks .mk:text-is("Clear")');
        ok('clear: back', (await head(page)) === '1 more office day needed this week');
        await markDay(page, '2026-10-23', 'Half day in office');
        ok('half day: still half needed', (await facts(page))[0] === '2 of 3 office days done, 0.5 planned.', await facts(page));
        ok('half day: headline 0.5', (await head(page)) === '0.5 more office days needed this week', await head(page));
        await page.click('#marks .mk:text-is("Clear")');
        // work trip counts
        await markDay(page, '2026-10-22', 'Work trip (counts as office)');
        ok('trip counts as office (planned)', (await head(page)) === 'On track: your planned days meet the target');
        await page.click('#marks .mk:text-is("Clear")');
        // a Saturday office day counts
        await markDay(page, '2026-10-24', 'Office');
        ok('Saturday office day counts', (await head(page)) === 'On track: your planned days meet the target', await head(page));
        ok('Saturday shown as not a working day', (await txt(page, '#sel-day')) === 'Sat 24 Oct, not a working day');
        await page.click('#marks .mk:text-is("Clear")');
        // public holiday Thursday and leave Friday -> not reachable? lower rule: 3-2=1 -> met
        await markDay(page, '2026-10-22', 'Public holiday');
        ok('holiday lowers target', (await facts(page)).includes('Target lowered from 3 to 2 for 1 day off.'), await facts(page));
        ok('holiday: target met', (await head(page)) === 'Target met for this week', await head(page));
        await page.click('#marks .mk:text-is("Clear")');

        // keyboard: arrows for days
        await page.click('#to-today');
        await page.click('#day-next');
        ok('day after', (await txt(page, '#sel-day')) === 'Thu 22 Oct');
        await page.click('#day-prev'); await page.click('#day-prev');
        ok('day before', (await txt(page, '#sel-day')) === 'Tue 20 Oct');
        await page.click('#to-today');
        await page.click('#m-next');
        ok('month next', (await txt(page, '#m-name')) === 'November 2026');
        await page.click('#m-prev'); await page.click('#m-prev');
        ok('month prev', (await txt(page, '#m-name')) === 'September 2026');
        ok('back to today hidden on today', !(await page.locator('#to-today').isVisible()));
        await page.click('#m-next');

        // reload keeps state
        await page.reload({ waitUntil: 'networkidle' });
        ok('reload: same answer', (await head(page)) === '1 more office day needed this week', await head(page));

        // ---------- rule: keep my target ----------
        await markDay(page, '2026-10-22', 'Leave');
        await page.check('input[name=offRule][value=keep]');
        ok('keep target: 1 more, Fri left', (await head(page)) === '1 more office day needed this week', await head(page));
        await markDay(page, '2026-10-23', 'Leave');
        ok('keep target: Tue was home, so not reachable', (await head(page)) === 'Not reachable this week: 1 office day still needed, 0 working days left', await head(page));
        await markDay(page, '2026-10-20', 'Leave');
        ok('keep target: lowered when not enough days', (await head(page)) === 'Target met for this week', await head(page));
        await markDay(page, '2026-10-20', 'Home');
        await page.check('input[name=offRule][value=lower]');
        await markDay(page, '2026-10-22', 'Clear'); await markDay(page, '2026-10-23', 'Clear');

        // ---------- rule: number per week edits ----------
        await page.fill('#r-n', '');
        ok('blank number: error', (await txt(page, '#e-n')).includes('Type how many'));
        await page.fill('#r-n', '9');
        ok('9 a week: error', (await txt(page, '#e-n')) === 'A week has 1 to 7 days.');
        await page.fill('#r-n', '-1');
        ok('negative: error', (await txt(page, '#e-n')) === 'Type a whole number of days.');
        await page.fill('#r-n', '2.5');
        ok('decimal: error', (await txt(page, '#e-n')) === 'Type a whole number of days.');
        await page.fill('#r-n', ' 4 ');
        ok('pasted spaces ok', (await txt(page, '#e-n')) === '' && (await txt(page, '#rule-text')).startsWith('Rule: 4 office days a week'));
        ok('4 a week: 2 more', (await head(page)) === '2 more office days needed this week', await head(page));
        await page.click('#quick-n .chip:text-is("3")');
        ok('chip 3', (await txt(page, '#rule-text')).startsWith('Rule: 3 office days a week'));
        ok('rule saved message with undo', (await txt(page, '#rule-msg')).includes('Undo'));

        // ---------- percentage per quarter ----------
        await page.check('input[name=type][value=pct]');
        ok('pct: number box hidden, pct shown', !(await page.locator('#w-n').isVisible()) && await page.locator('#w-pct').isVisible());
        ok('pct: off rule hidden', !(await page.locator('#w-off').isVisible()));
        ok('pct: rule text', (await txt(page, '#rule-text')) === 'Rule: 60% of working days in the office, counted each quarter (Mon to Fri).', await txt(page, '#rule-text'));
        // Q4 2026: 66 weekdays, 2 leave (14 Oct, 30 Oct) -> 64 counted -> 60% = 38.4 -> 39
        let pf = await facts(page);
        ok('pct: done line', pf[0] === '8 of 39 office days done.', pf);
        ok('pct: rule line', pf[1].startsWith('60% of 64 working days counted = 39 (rounded up). So far 57% (8 of 14 days up to today).'), pf);
        ok('pct: headline', (await head(page)) === '31 more office days needed this quarter', await head(page));
        await page.fill('#r-pct', '101');
        ok('pct 101: error', (await txt(page, '#e-pct')) === 'Use a number from 1 to 100.');
        await page.fill('#r-pct', '50%');
        ok('pct 50% typed with sign', (await txt(page, '#e-pct')) === '' && (await txt(page, '#rule-text')).startsWith('Rule: 50%'));
        await page.selectOption('#r-period', 'month');
        // October: 22 weekdays - 2 leave = 20 -> 10
        ok('pct month: headline', (await head(page)) === '2 more office days needed this month', await head(page));
        ok('pct month: period name', (await txt(page, '#sum-body .period')) === 'October 2026');

        // ---------- per month ----------
        await page.check('input[name=type][value=month]');
        ok('month: label', (await txt(page, '#l-n')) === 'Office days each month');
        ok('month: 3 kept from before', (await page.inputValue('#r-n')) === '3');
        await page.click('#quick-n .chip:text-is("8")');
        ok('month 8: target lowered by 2 leave', (await facts(page)).includes('Target lowered from 8 to 6 for 2 days off.'), await facts(page));
        ok('month 8: met', (await head(page)) === 'Target met for this month', await head(page));
        await page.check('input[name=type][value=week]');
        ok('back to week: 8 is too many', (await txt(page, '#e-n')) === 'A week has 1 to 7 days.');
        await page.click('#quick-n .chip:text-is("3")');

        // ---------- working days ----------
        await page.uncheck('#wd input[value="1"]');
        await page.uncheck('#wd input[value="2"]');
        await page.uncheck('#wd input[value="3"]'); await page.uncheck('#wd input[value="4"]'); await page.uncheck('#wd input[value="5"]');
        ok('no working days: error', (await txt(page, '#e-wd')) === 'Tick at least one working day.');
        for (const d of ['0', '1', '2', '3', '4']) await page.check('#wd input[value="' + d + '"]');
        ok('Sun to Thu', (await txt(page, '#rule-text')) === 'Rule: 3 office days a week (Sun to Thu).', await txt(page, '#rule-text'));
        await page.selectOption('#r-ws', '0');
        ok('week from Sunday', (await txt(page, '#sum-body .period')) === 'Sun 18 Oct to Sat 24 Oct', await txt(page, '#sum-body .period'));
        ok('calendar starts Sunday', (await page.locator('#cal .heads .h').first().innerText()) === 'Sun');
        await page.check('#wd input[value="5"]'); await page.uncheck('#wd input[value="0"]'); await page.selectOption('#r-ws', '1');
        ok('back to Mon to Fri', (await txt(page, '#rule-text')) === 'Rule: 3 office days a week (Mon to Fri).');

        // ---------- start date ----------
        await page.click('#o-start');
        await page.fill('#r-start', '2026-10-21');
        await page.locator('#r-start').dispatchEvent('change');
        ok('start Wed: lowered for 2 days before', (await facts(page)).some(x => x.startsWith('Target lowered from 3 to 1 for 2 days off or before your start date')), await facts(page));
        ok('start: cells before dimmed', await cell(page, '2026-10-20').evaluate(e => e.classList.contains('before')));
        await page.click('#clear-start');
        ok('start removed', (await head(page)) === '1 more office day needed this week' && !(await page.locator('#w-start').isVisible()));

        // ---------- several days ----------
        await page.fill('#g-from', '2026-11-02'); await page.locator('#g-from').dispatchEvent('change');
        ok('to filled with Friday', (await page.inputValue('#g-to')) === '2026-11-06');
        await page.selectOption('#g-mark', 'L');
        await page.click('#g-go');
        ok('range: 5 marked', (await txt(page, '#range-msg')).startsWith('Marked 5 working days as Leave, Mon 2 Nov to Fri 6 Nov.'), await txt(page, '#range-msg'));
        await page.click('#m-next');
        ok('range: November shows leave', (await txt(page, '#m-counts')) === 'November: 5 leave.', await txt(page, '#m-counts'));
        await page.click('#range-msg .undo');
        ok('range undo', (await txt(page, '#m-counts')) === '');
        await page.fill('#g-from', '2026-11-07'); await page.fill('#g-to', '2026-11-08'); await page.click('#g-go');
        ok('range: weekend only', (await txt(page, '#e-range')) === 'There are no working days between those dates.');
        await page.fill('#g-from', '2026-11-08'); await page.fill('#g-to', '2026-11-02'); await page.click('#g-go');
        ok('range: backwards', (await txt(page, '#e-range')) === '"To" is before "From".');
        await page.fill('#g-from', ''); await page.click('#g-go');
        ok('range: blank', (await txt(page, '#e-range')) === 'Choose both dates.');
        await page.fill('#g-from', '2025-01-01'); await page.fill('#g-to', '2026-11-02'); await page.click('#g-go');
        ok('range: too long', (await txt(page, '#e-range')) === 'Choose up to one year at a time.');

        // ---------- sharing ----------
        await page.click('#copy');
        const clip = await page.evaluate(() => navigator.clipboard.readText());
        ok('copy summary', clip.startsWith('Office days, Wed 21 Oct 2026\nRule: 3 office days a week (Mon to Fri)') && clip.includes('1 more office day needed this week'), clip);
        const mail = await page.getAttribute('#mail', 'href');
        ok('mailto with no recipient', mail.startsWith('mailto:?subject=My%20office%20days&body='), mail);
        const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#csv')]);
        const csv = fs.readFileSync(await dl.path(), 'utf8');
        ok('csv', csv.startsWith('Date,Day,Where,Office days\r\n2026-10-01,Thursday,Office,1\r\n') && csv.includes('2026-10-30,Friday,Leave,0'), csv.slice(0, 200));
        const [bk] = await Promise.all([page.waitForEvent('download'), page.click('#backup')]);
        const backupPath = path.join(__dirname, '..', '.tmp-office-backup.json'); fs.copyFileSync(await bk.path(), backupPath);

        // delete everything + undo
        await page.click('#wipe');
        ok('wipe: empty', (await head(page)) === '3 more office days needed this week' && (await txt(page, '#m-counts')) === '');
        await page.click('#set-msg .undo');
        ok('wipe undo', (await head(page)) === '1 more office day needed this week');
        await page.click('#wipe');
        // restore the backup
        await page.setInputFiles('#restore-file', backupPath);
        await page.waitForTimeout(300);
        ok('restore', (await txt(page, '#set-msg')).startsWith('Restored 16 marked days') && (await head(page)) === '1 more office day needed this week', await txt(page, '#set-msg'));
        fs.writeFileSync(backupPath, '{"hello":1}');
        await page.setInputFiles('#restore-file', backupPath); await page.waitForTimeout(300);
        ok('restore: wrong file', (await txt(page, '#set-msg')).startsWith('That file is not a backup'));
        fs.unlinkSync(backupPath);
        await ctx.close();
    }

    // ---------- corrupt and odd saved state ----------
    {
        const { ctx, page } = await newPage({}, `localStorage.setItem(${JSON.stringify(KEY)}, '{not json')`);
        ok('corrupt: starts fresh', (await head(page)) === '3 more office days needed this week');
        ok('corrupt: message', (await txt(page, '#set-msg')).includes('could not be read'));
        await ctx.close();
    }
    {
        const bad = JSON.stringify({ v: 1, rule: { type: 'zzz', n: 99, pct: -5 }, workdays: [9, 'x'], weekStart: 3, start: '2026-02-31', days: { '2026-10-19': 'O', 'bad': 'O', '2026-10-20': 'Q' } });
        const { ctx, page } = await newPage({}, `localStorage.setItem(${JSON.stringify(KEY)}, ${JSON.stringify(bad)})`);
        ok('odd values cleaned', (await txt(page, '#rule-text')) === 'Rule: 3 office days a week (Mon to Fri).' && (await facts(page))[0] === '1 of 3 office days done.', await facts(page));
        await ctx.close();
    }
    // storage blocked
    {
        const { ctx, page } = await newPage({}, `Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } })`);
        ok('storage blocked: warning', await page.locator('#storage-warn').isVisible());
        await page.click('#marks .mk:text-is("Office")');
        ok('storage blocked: still works', (await head(page)) === '2 more office days needed this week');
        await ctx.close();
    }
    // midnight: page left open
    {
        const { ctx, page } = await newPage();
        await page.click('#marks .mk:text-is("Office")');
        await page.clock.setFixedTime(new Date('2026-10-22T00:00:30+05:00'));
        await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
        ok('midnight: new today', (await txt(page, '#sel-day')) === 'Thu 22 Oct (today)', await txt(page, '#sel-day'));
        await ctx.close();
    }

    // ---------- keyboard only ----------
    {
        const { ctx, page } = await newPage({ viewport: { width: 1280, height: 900 } });
        await page.focus('#marks .mk[data-m=O]'); await page.keyboard.press('Enter');
        ok('keyboard: mark with Enter', (await head(page)) === '2 more office days needed this week');
        const label = await cell(page, '2026-10-21').getAttribute('aria-label');
        ok('screen reader label', label === 'Wed 21 Oct, today: Office', label);
        await ctx.close();
    }

    // ---------- light/dark switch ----------
    {
        const { ctx, page } = await newPage({ colorScheme: 'light' });
        const bg1 = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
        await page.click('.theme-toggle');
        const bg2 = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
        ok('theme switch changes look', bg1 !== bg2);
        await ctx.close();
    }

    // ---------- help ----------
    for (const w of [320, 390, 820, 1280]) {
        const { ctx, page } = await newPage({ viewport: { width: w, height: 800 } });
        await page.click('.help-btn');
        const d = page.locator('dialog.help'), r = await d.boundingBox();
        ok('help opens inside ' + w, r && r.x >= 0 && r.x + r.width <= w + 1 && r.y >= 0 && r.y + r.height <= 801);
        ok('help title ' + w, (await d.locator('h2').innerText()) === 'How to use Office Days Tracker');
        await page.keyboard.press('Escape'); ok('help escape ' + w, !(await d.evaluate(e => e.open)));
        await page.click('.help-btn'); await page.locator('.help-close').click(); ok('help got it ' + w, !(await d.evaluate(e => e.open)));
        const bar = await page.evaluate(() => { const b = [...document.querySelectorAll('.topbar > *')].map(e => e.getBoundingClientRect()); return b.every(x => Math.abs(x.top - b[0].top) < 4); });
        ok('topbar on one line ' + w, bar);
        await ctx.close();
    }

    // ---------- every width, filled and empty, dark and light ----------
    for (const scheme of ['dark', 'light']) for (const w of [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920]) {
        for (const filled of [true, false]) {
            const { ctx, page } = await newPage({ viewport: { width: w, height: 900 }, colorScheme: scheme });
            if (filled) { await sana(page); await page.click('#o-start'); await page.check('input[name=type][value=pct]'); await page.check('input[name=type][value=week]'); }
            const tag = scheme + ' ' + w + (filled ? ' filled' : ' empty') + ': ';
            ok(tag + 'no horizontal scroll', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
            const out = await page.evaluate(() => [...document.querySelectorAll('main *')].filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.right > innerWidth + 1 || r.left < -1); }).slice(0, 3).map(e => e.id || e.className));
            ok(tag + 'nothing sticks out', !out.length, out);
            if (w >= 900) for (const pos of [0, .5, 1]) {
                await page.evaluate(p => scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * p), pos);
                const o = await page.evaluate(() => { const bad = []; document.querySelectorAll('main, .col-main, .col-side').forEach(h => { const k = [...h.children].filter(c => c.getBoundingClientRect().height > 4 && getComputedStyle(c).display !== 'none'); for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { const a = k[i].getBoundingClientRect(), b = k[j].getBoundingClientRect(); if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 4 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 4) bad.push(k[i].className + '/' + k[j].className); } }); return bad; });
                ok(tag + 'no overlap at ' + pos, !o.length, o);
            }
            if (w <= 390) {
                const c = await page.evaluate(() => { const k = [...document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, button, textarea')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }); const bad = []; for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { if (k[i].contains(k[j]) || k[j].contains(k[i])) continue; const a = k[i].getBoundingClientRect(), b = k[j].getBoundingClientRect(); if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2) bad.push((k[i].id || k[i].className) + '/' + (k[j].id || k[j].className)); } return bad; });
                ok(tag + 'controls do not overlap', !c.length, c);
                // placeholders and labels fit
                const clip = await page.evaluate(() => [...document.querySelectorAll('.mk, .wd-day, .cell, .chip, #sel-day')].filter(e => e.offsetParent && e.scrollWidth > e.clientWidth + 1).map(e => e.className + ' ' + e.textContent).slice(0, 3));
                ok(tag + 'no clipped text', !clip.length, clip);
                const selClip = await page.evaluate(() => { const cv = document.createElement('canvas').getContext('2d'); return [...document.querySelectorAll('select')].filter(e => e.offsetParent).flatMap(e => [...e.options].filter(o => { const cs = getComputedStyle(e); cv.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily; return cv.measureText(o.text).width > e.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 20; }).map(o => e.id + ': ' + o.text)); });
                ok(tag + 'select options fit', !selClip.length, selClip);
            }
            await ctx.close();
        }
    }
    if (SHOTS) {
        const { ctx, page } = await newPage({ viewport: { width: 1280, height: 1160 } });
        await sana(page); await page.evaluate(() => scrollTo(0, 0));
        await page.screenshot({ path: path.join(__dirname, 'screenshots/desktop.png') });
        await ctx.close();
        const p2 = await newPage({ viewport: { width: 390, height: 1400 }, deviceScaleFactor: 2 });
        await sana(p2.page); await p2.page.evaluate(() => scrollTo(0, 0));
        await p2.page.screenshot({ path: path.join(__dirname, 'screenshots/phone.png') });
        await p2.ctx.close();
    }

    // files requested all loaded
    {
        const ctx = await browser.newContext();
        for (const f of ['', 'index.html', 'favicon.svg', 'manifest.webmanifest', 'style.css', 'core.js', 'script.js', 'sw.js', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'screenshots/desktop.png', 'screenshots/phone.png', '../theme.js', '../help.js', '../']) {
            const r = await ctx.request.get(URL + f); ok('200 for ' + (f || './'), r.status() === 200, r.status());
        }
        ok('theme.js and help.js requested by the page', [...requested].some(u => u.endsWith('/theme.js')) && [...requested].some(u => u.endsWith('/help.js')));
        await ctx.close();
    }
    ['icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'screenshots/desktop.png', 'screenshots/phone.png'].forEach(f => ok('file ' + f, fs.existsSync(path.join(__dirname, f))));
    ok('no failed requests', !failed.length, failed);
    ok('no console errors', !errors.length, errors);
    await browser.close(); if (srv) srv.close();
    console.log((fail ? 'FAILED ' + fail : 'ALL PASSED') + ' (' + pass + ' passed) ' + (process.env.BASE ? 'live' : 'local'));
    process.exit(fail ? 1 : 0);
})();
