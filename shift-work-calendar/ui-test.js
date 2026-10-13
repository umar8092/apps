// Drives the real page through every row of the use-case matrix. Run from the repo root:
//   node shift-work-calendar/ui-test.js            (serves the repo locally)
//   node shift-work-calendar/ui-test.js --base https://umar8092.github.io/apps   (tests the live site)
// The phone's clock is fixed to Tue 13 Oct 2026 so every answer is known in advance.
const fs = require('fs'), path = require('path'), http = require('http');
let pw; try { pw = require('playwright'); } catch (e) { pw = require('playwright-core'); }
const args = process.argv.slice(2), bi = args.indexOf('--base'), BASE = bi >= 0 ? args[bi + 1].replace(/\/$/, '') : null;
const ROOT = path.resolve(__dirname, '..');
let pass = 0; const fails = [];
const ok = (name, cond, extra) => { if (cond) pass++; else fails.push(name + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : '')); };

function serve() {
    const types = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml', png: 'image/png', webmanifest: 'application/manifest+json' };
    return new Promise(res => { const s = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0].replace(/^\/apps/, '')); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p);
        if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': types[f.split('.').pop()] || 'application/octet-stream' }); r.end(fs.readFileSync(f)); }).listen(0, () => res(s)); });
}

(async () => {
    let srv, base = BASE; if (!base) { srv = await serve(); base = 'http://localhost:' + srv.address().port + '/apps'; }
    const url = base + '/shift-work-calendar/';
    const browser = await pw.chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
    const errors = [], bad = [];
    async function open(w, opts) {
        const ctx = await browser.newContext(Object.assign({ viewport: { width: w, height: 900 }, locale: 'en-US', timezoneId: 'Europe/London', acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] }, opts || {}));
        const page = await ctx.newPage();
        await page.clock.install({ time: new Date('2026-10-13T10:00:00+01:00') });
        page.on('pageerror', e => errors.push(w + ': ' + e.message));
        page.on('console', m => { if (m.type() === 'error') errors.push(w + ': ' + m.text()); });
        page.on('response', r => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()); });
        await page.goto(url, { waitUntil: 'networkidle' });
        return { ctx, page };
    }
    const txt = (page, sel) => page.locator(sel).innerText();
    const setDate = async (page, sel, v) => { await page.fill(sel, v); await page.dispatchEvent(sel, 'change'); };

    for (const w of [390, 1280]) {
        const { ctx, page } = await open(w);
        const T = '[' + w + '] ';
        // first use: empty state, setup first, nothing forced
        ok(T + 'first run puts setup first', await page.evaluate(() => document.getElementById('app').classList.contains('first-run')));
        ok(T + 'empty today', (await txt(page, '#today')).includes('No pattern yet'));
        ok(T + 'share buttons off until a pattern', await page.locator('#copy').isDisabled() && await page.locator('#ics').isDisabled());
        ok(T + 'second person is optional', await page.locator('#people').isHidden() && await page.locator('#ics-who-wrap').isHidden());
        ok(T + 'day 1 defaults to today', await page.inputValue('#p-start') === '2026-10-13');

        // the main situation: Sara, 2 days 2 nights 4 off from Tue 13 Oct
        await page.fill('#p-name', 'Sara');
        await page.selectOption('#p-preset', '2d2n4off');
        let t = await txt(page, '#today');
        ok(T + 'day shift today', t.includes('Day shift today') && t.includes('7:00 AM – 7:00 PM (12 h)'), t);
        ok(T + 'at work now', t.includes('At work now, until 7:00 PM.'), t);
        ok(T + 'next day off', t.includes('Next day off: Sat, Oct 17 (in 4 days), 4 days off in a row.'), t);
        ok(T + 'check line', (await txt(page, '#p-check')).includes('is day 1 of 8, day shift'));
        ok(T + 'setup moves below after first pattern', !await page.evaluate(() => document.getElementById('app').classList.contains('first-run')));
        ok(T + 'October totals', (await txt(page, '#totals')).includes('15 shifts (8 day, 7 night), 16 days off.') && (await txt(page, '#totals')).includes('180 h of shifts.'));
        const cells = page.locator('#grid-body .cell');
        ok(T + '31 days in October', await cells.count() === 31);
        ok(T + '15 Oct is a night', (await cells.nth(14).getAttribute('aria-label')).includes('Night shift 7:00 PM – 7:00 AM next day'));
        ok(T + 'today is marked', (await cells.nth(12).getAttribute('class')).includes('is-today'));

        // day 1 changed: Sara is really on day 3 today -> nights today
        await setDate(page, '#p-start', '2026-10-11');
        ok(T + 'day 1 moved', (await txt(page, '#today')).includes('Night shift today'));
        await setDate(page, '#p-start', '');
        ok(T + 'blank date refused and kept', await page.inputValue('#p-start') === '2026-10-11' && (await txt(page, '#msg')).includes('Pick a full date'));
        await setDate(page, '#p-start', '2026-10-13');

        // a night shift still running after midnight (Fri 16 Oct 05:00)
        await page.clock.setFixedTime(new Date('2026-10-16T05:00:00+01:00'));
        await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
        t = await txt(page, '#today');
        ok(T + 'midnight rollover', t.includes('Friday, October 16'), t);
        ok(T + 'still on last night', t.includes('At work now: night shift from last night, until 7:00 AM.'), t);
        await page.clock.setFixedTime(new Date('2026-10-13T10:00:00+01:00'));
        await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
        ok(T + 'back to 13 Oct', (await txt(page, '#today')).includes('Tuesday, October 13'));

        // tap a day, book a holiday, undo, back to pattern
        await cells.nth(13).click();
        ok(T + 'day panel', (await txt(page, '#day')).includes('Wednesday, October 14, 2026 (tomorrow)') && (await txt(page, '#day')).includes('Day 2 of your 8-day pattern.'));
        await page.selectOption('#chg-' + await page.evaluate(() => window.__shift.state.people[0].id), 'hol');
        ok(T + 'holiday set', (await cells.nth(13).getAttribute('aria-label')).includes('Holiday or leave (changed)') && await cells.nth(13).locator('.mark').count() === 1);
        ok(T + 'holiday counted', (await txt(page, '#totals')).includes('1 holiday'));
        await page.click('#msg-undo');
        ok(T + 'undo change', !(await cells.nth(13).getAttribute('aria-label')).includes('changed'));
        await cells.nth(13).click(); if (await page.locator('#day').isHidden()) await cells.nth(13).click();
        await page.selectOption('#day select', 'N');
        await page.getByRole('button', { name: 'Back to pattern' }).click();
        ok(T + 'back to pattern', (await cells.nth(13).getAttribute('aria-label')).includes('Day shift') && !(await cells.nth(13).getAttribute('aria-label')).includes('changed'));
        await page.click('#day-close');
        ok(T + 'day panel closes', await page.locator('#day').isHidden());

        // months, today, go to a date (backwards and far ahead)
        await page.click('#next'); ok(T + 'next month', (await txt(page, '#month-title')) === 'November 2026');
        await page.click('#prev'); await page.click('#prev'); ok(T + 'previous month', (await txt(page, '#month-title')) === 'September 2026');
        await page.click('#to-today'); ok(T + 'today button', (await txt(page, '#month-title')) === 'October 2026' && await page.locator('#day').isVisible());
        await setDate(page, '#goto', '2027-03-14');
        const want = await page.evaluate(() => { const C = window.ShiftCore; return C.typeOf(window.__shift.state.people[0], C.shiftOn(window.__shift.state.people[0], C.dayNum('2027-03-14')).id).name; });
        ok(T + 'go to a date', (await txt(page, '#month-title')) === 'March 2027' && (await txt(page, '#day')).includes('Sunday, March 14, 2027') && (await txt(page, '#day')).includes(want === 'Off' ? 'Day off' : want));
        await page.click('#to-today'); await page.click('#day-close');

        // week start
        await page.selectOption('#week-start', '1');
        ok(T + 'weeks start Monday', (await page.locator('#grid-head th').first().getAttribute('abbr')) === 'Monday');
        await page.selectOption('#week-start', '0');

        // own pattern: build, edit a day, delete a day, remove last, clear + undo
        await page.click('#add-person');
        ok(T + 'second person tab', await page.locator('.person-tab').count() === 2);
        await page.fill('#p-name', '<b>Ali</b> & co');
        await page.selectOption('#p-preset', 'own');
        await page.selectOption('#p-addtype', 'D');
        await page.selectOption('#p-addtype', 'N');
        for (const b of ['+ Day', '+ Day', '+ Night', '+ Off', '+ Off']) await page.locator('#p-add button', { hasText: b }).first().click();
        ok(T + 'own pattern built', (await txt(page, '#seq-info')).startsWith('5 days, then it repeats: 3 worked, 2 off.'));
        ok(T + 'pattern select says own', await page.inputValue('#p-preset') === 'own');
        await page.locator('#p-seq .chip').nth(1).click();
        ok(T + 'edit mode label', (await txt(page, '#add-label')) === 'Change day 2 to:');
        await page.locator('#p-add button', { hasText: 'Night' }).click();
        ok(T + 'day 2 changed', await page.evaluate(() => window.__shift.state.people[1].seq.join(',')) === 'D,N,N,off,off');
        await page.locator('#p-seq .chip').nth(2).click(); await page.click('#p-undo-last');
        ok(T + 'day 3 deleted', await page.evaluate(() => window.__shift.state.people[1].seq.join(',')) === 'D,N,off,off');
        await page.click('#p-undo-last');
        ok(T + 'remove last', await page.evaluate(() => window.__shift.state.people[1].seq.join(',')) === 'D,N,off');
        await page.click('#p-clear'); ok(T + 'clear', await page.locator('#p-seq .chip').count() === 0);
        await page.click('#msg-undo'); ok(T + 'clear undone', await page.locator('#p-seq .chip').count() === 3);
        await page.selectOption('#p-preset', '4on4off'); await setDate(page, '#p-start', '2026-10-15');
        ok(T + 'name shown as text', (await txt(page, '.person-tab >> nth=1')) === '<b>Ali</b> & co' && await page.locator('.person-tab b').count() === 0);
        t = await txt(page, '#today');
        ok(T + 'both off', t.includes('Next day Sara and <b>Ali</b> & co are both off: Mon, Oct 19 (in 6 days).') && t.includes('Then: Tue, Oct 20 · Tue, Oct 27 · Wed, Oct 28 · Wed, Nov 4'), t);
        ok(T + 'everyone-off squares', await page.locator('#grid-body .cell.all-off').count() > 0 && (await cells.nth(18).getAttribute('class')).includes('all-off'));

        // own shift type with its own name, night times, cannot remove while used
        await page.selectOption('#p-addtype', 'own');
        const nm = page.locator('#p-types input[type=text]').last();
        await nm.fill('Twilight');
        const times = page.locator('#p-types li').last().locator('input[type=time]');
        await times.nth(0).fill('17:00'); await times.nth(0).dispatchEvent('change');
        await times.nth(1).fill('01:00'); await times.nth(1).dispatchEvent('change');
        ok(T + 'own type hours over midnight', (await page.locator('#p-types li').last().locator('.hrs').innerText()) === '8 h, ends next day');
        ok(T + 'own type button', await page.locator('#p-add button', { hasText: 'Twilight' }).count() === 1);
        await page.locator('#p-types li').first().getByRole('button', { name: 'Remove' }).click();
        ok(T + 'type in pattern not removed', (await txt(page, '#msg')).includes('Remove it from the pattern first'));

        // share: copy, email, calendar file
        await page.locator('.person-tab').first().click();
        await page.click('#copy');
        const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
        ok(T + 'copy month', clip.startsWith('Shifts for October 2026') && clip.includes('Tue 13  Sara: Day 7:00 AM–7:00 PM · <b>Ali</b> & co: Off') && clip.includes('(all off)'), clip.slice(0, 200));
        ok(T + 'email link', (await page.getAttribute('#email', 'href')).startsWith('mailto:?subject=Shifts%20for%20October%202026&body='));
        ok(T + 'whose shifts appears', await page.locator('#ics-who-wrap').isVisible());
        const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#ics')]);
        const ics = fs.readFileSync(await dl.path(), 'utf8');
        ok(T + 'ics file', dl.suggestedFilename() === 'sara-shifts.ics' && ics.includes('DTSTART:20261015T190000') && ics.includes('DTEND:20261016T070000') && ics.includes('SUMMARY:Sara: Night shift') && !ics.includes('Ali'), dl.suggestedFilename());
        ok(T + 'ics count message', /\d+ shifts from Tue, Oct 13 to Tue, Jan 12/.test(await txt(page, '#msg')), await txt(page, '#msg'));

        // backup and restore
        const [bk] = await Promise.all([page.waitForEvent('download'), page.click('#backup')]);
        const backup = fs.readFileSync(await bk.path(), 'utf8');
        ok(T + 'backup has both', JSON.parse(backup).people.length === 2);
        await page.setInputFiles('#restore-file', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"nope":1}') });
        await page.waitForFunction(() => document.getElementById('msg-text').textContent.includes('not a backup'), null, { timeout: 5000 }).catch(() => {});
        ok(T + 'bad backup refused', (await txt(page, '#msg')).includes('not a backup'));

        // remove a person, undo
        await page.locator('.person-tab').nth(1).click(); await page.click('#p-remove');
        ok(T + 'person removed', await page.locator('#people').isHidden() && await page.locator('#together').isHidden());
        await page.click('#msg-undo'); ok(T + 'person back', await page.locator('.person-tab').count() === 2);

        // reload keeps everything
        await page.reload({ waitUntil: 'networkidle' });
        ok(T + 'reload keeps state', await page.locator('.person-tab').count() === 2 && (await txt(page, '#today')).includes('Day shift today') && await page.evaluate(() => window.__shift.state.people[1].types.some(t => t.name === 'Twilight')));

        // phones: nothing overlaps with everything open
        if (w === 390) {
            await cells.nth(13).click();
            for (const vw of [320, 360, 390]) {
                await page.setViewportSize({ width: vw, height: 800 });
                const o = await page.evaluate(() => { const k = [...document.querySelectorAll('input:not([type=hidden]), select, button')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.height && !e.closest('#msg'); }), out = [];
                    for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { if (k[i].contains(k[j]) || k[j].contains(k[i])) continue; const a = k[i].getBoundingClientRect(), b = k[j].getBoundingClientRect(); if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2) out.push((k[i].id || k[i].className) + '/' + (k[j].id || k[j].className)); }
                    return out.slice(0, 3); });
                ok('[' + vw + '] no overlapping controls with two people and a day open', !o.length, o);
                ok('[' + vw + '] no sideways scroll', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
                const clipped = await page.evaluate(() => [...document.querySelectorAll('.pill, .chip-s, .adder, .person-tab, input[type=text], select')].filter(e => e.offsetWidth && e.scrollWidth > e.clientWidth + 1 && e.tagName !== 'SELECT').map(e => e.className + ':' + (e.value || e.textContent)).slice(0, 3));
                ok('[' + vw + '] no clipped labels', !clipped.length, clipped);
                const narrow = await page.evaluate(() => [...document.querySelectorAll('input[type=time], #p-types input[type=text], #day select')].filter(e => e.offsetWidth && e.offsetWidth < 150).map(e => e.tagName + ' ' + e.offsetWidth));
                ok('[' + vw + '] time, shift name and change-day boxes wide enough (150px+)', !narrow.length, narrow);
            }
        }

        // start over, undo
        await page.click('#reset');
        ok(T + 'start over', await page.evaluate(() => document.getElementById('app').classList.contains('first-run')) && (await txt(page, '#today')).includes('No pattern yet'));
        await page.click('#msg-undo'); ok(T + 'start over undone', await page.locator('.person-tab').count() === 2);

        // restore the backup file
        await page.click('#reset');
        await page.setInputFiles('#restore-file', { name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(backup) });
        await page.waitForFunction(() => document.getElementById('msg-text').textContent.includes('Backup restored'), null, { timeout: 5000 }).catch(() => {});
        ok(T + 'backup restored', (await txt(page, '#msg')).includes('Backup restored') && await page.locator('.person-tab').count() === 2);

        // the longest pattern
        await page.locator('.person-tab').first().click();
        await page.evaluate(() => { const p = window.__shift.state.people[0]; p.seq = Array(98).fill('D'); window.__shift.setToday(window.ShiftCore.todayNum()); });
        ok(T + 'add stops at 14 weeks', await page.locator('#p-add button').first().isDisabled() && (await txt(page, '#seq-info')).includes('longest pattern'));
        await ctx.close();
    }

    // presets that need care
    {
        const { ctx, page } = await open(390);
        await page.selectOption('#p-preset', 'mon-fri');
        ok('Monday to Friday sets day 1 to Monday', await page.inputValue('#p-start') === '2026-10-12');
        await page.selectOption('#p-preset', '24-48');
        const t24 = await txt(page, '#today');
        ok('24 on 48 off keeps day 1 (Mon 12 Oct): off today, next 15 Oct', t24.includes('Day off today') && t24.includes('Next shift: Thu, Oct 15 (in 2 days), 24-hour shift at 7:00 AM.'), t24);
        await page.fill('#p-start', '2026-10-13'); await page.dispatchEvent('#p-start', 'change');
        const t24b = await txt(page, '#today');
        ok('24 on 48 off from today', t24b.includes('24-hour shift today') && t24b.includes('7:00 AM – 7:00 AM next day (24 h)') && t24b.includes('At work now, until 7:00 AM tomorrow.'), t24b);
        await page.selectOption('#p-preset', 'dupont');
        ok('DuPont 28 days', (await txt(page, '#seq-info')).startsWith('28 days'));
        await ctx.close();
    }
    // corrupt and blocked storage
    {
        const { ctx, page } = await open(390);
        await page.evaluate(() => localStorage.setItem('shift-work-calendar.state', '{"people":[{"start":"bad"}]'));
        await page.reload({ waitUntil: 'networkidle' });
        ok('corrupt storage starts fresh', (await txt(page, '#today')).includes('No pattern yet'));
        await page.evaluate(() => localStorage.setItem('shift-work-calendar.state', JSON.stringify({ people: [{ id: 'a', name: 'Z', start: '2026-10-13', seq: ['D', 'X', 'off'], types: [{ id: 'D', name: 'Day', start: '07:00', end: '19:00', color: '#f59e0b' }], changes: { bad: 'D' } }] })));
        await page.reload({ waitUntil: 'networkidle' });
        ok('odd saved values cleaned', (await txt(page, '#seq-info')).startsWith('2 days'));
        await page.addInitScript(() => { Storage.prototype.setItem = function () { throw new Error('blocked'); }; });
        await page.reload({ waitUntil: 'networkidle' });
        await page.selectOption('#p-preset', '4on4off');
        ok('blocked storage message', (await txt(page, '#msg')).includes('blocking storage') || errors.length === 0);
        await ctx.close();
    }

    // every screen size, dark and light, with a filled-in rota (two people, a day open) and after Start over
    {
        const seed = JSON.stringify({ v: 1, active: 0, weekStart: 1, set: true, people: [
            { id: 'a1', name: 'Sara Margaret Elizabeth Johnson', start: '2026-10-13', seq: ['D', 'D', 'N', 'N', 'off', 'off', 'off', 'off'], types: [{ id: 'D', name: 'Day', start: '07:00', end: '19:00', color: '#f59e0b' }, { id: 'N', name: 'Night', start: '19:00', end: '07:00', color: '#6366f1' }, { id: 'c1', name: 'Twilight overtime', start: '17:00', end: '01:00', color: '#14b8a6' }], changes: { '2026-10-29': 'hol', '2026-10-30': 'sick' } },
            { id: 'b2', name: 'Ali', start: '2026-10-15', seq: ['D', 'D', 'D', 'D', 'off', 'off', 'off', 'off'], types: [{ id: 'D', name: 'Day', start: '07:00', end: '19:00', color: '#f59e0b' }], changes: {} },
            { id: 'c3', name: 'Flatmate', start: '2026-10-01', seq: ['T', 'off', 'off'], types: [{ id: 'T', name: '24-hour', start: '07:00', end: '07:00', color: '#e11d48' }], changes: {} }] });
        for (const scheme of ['dark', 'light']) for (const filled of [true, false]) {
            const { ctx, page } = await open(1280, { colorScheme: scheme });
            await page.evaluate(v => localStorage.setItem('shift-work-calendar.state', v), filled ? seed : '');
            await page.reload({ waitUntil: 'networkidle' });
            if (filled) await page.locator('#grid-body .cell').nth(13).click();
            for (const w of [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920]) {
                const T = '[' + scheme + (filled ? ' filled ' : ' empty ') + w + '] ';
                await page.setViewportSize({ width: w, height: 900 });
                ok(T + 'no sideways scroll', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
                const out = await page.evaluate(() => [...document.querySelectorAll('main *')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && getComputedStyle(e).position !== 'fixed' && (r.right > innerWidth + 1 || r.left < -1); }).slice(0, 3).map(e => e.tagName + '.' + e.className));
                ok(T + 'nothing sticks out', !out.length, out);
                if (w >= 900) for (const pos of [0, 0.5, 1]) {
                    await page.evaluate(q => scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * q), pos);
                    const o = await page.evaluate(() => { const bad = []; document.querySelectorAll('main, .col-a, .col-b').forEach(h => { const k = [...h.children].filter(c => { const r = c.getBoundingClientRect(), cs = getComputedStyle(c); return r.width > 4 && r.height > 4 && cs.position !== 'fixed'; });
                        for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { const a = k[i].getBoundingClientRect(), b = k[j].getBoundingClientRect(); if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 4 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 4) bad.push(k[i].className + '/' + k[j].className); } }); return bad; });
                    ok(T + 'no overlap at ' + pos * 100 + '%', !o.length, o);
                }
                if (filled && w === 1280) ok(T + 'desktop uses two columns', await page.evaluate(() => document.querySelector('.col-b').getBoundingClientRect().left > document.querySelector('.col-a').getBoundingClientRect().right));
            }
            await ctx.close();
        }
    }
    ok('no console errors', !errors.length, errors.slice(0, 3));
    ok('no failed requests', !bad.filter(u => !u.includes('favicon.ico')).length, bad.slice(0, 3));
    await browser.close(); if (srv) srv.close();
    console.log(pass + ' passed, ' + fails.length + ' failed' + (fails.length ? '\n - ' + fails.join('\n - ') : ''));
    process.exit(fails.length ? 1 : 0);
})();
