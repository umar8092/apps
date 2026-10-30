// Drives the real page with Playwright. Run from the repo root while a server serves it:
//   node work-hours-limit-tracker-for-international-students/ui-test.js [base URL, default http://localhost:8765]
// The clock is fixed at Thursday 5 November 2026, 13:00 so every answer is exact.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const SLUG = 'work-hours-limit-tracker-for-international-students';
const KEY = SLUG + '.data';
const BASE = (process.argv[2] || 'http://localhost:8765').replace(/\/$/, '');
const URL = BASE + '/' + SLUG + '/';
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + (extra === undefined ? '' : JSON.stringify(extra)))); };
const FIX = () => {
    const D = Date, T = new D(2026, 10, 5, 13, 0).getTime();
    window.Date = class extends D { constructor(...a) { if (!a.length) super(T); else super(...a); } static now() { return T; } };
};
const SAMPLE = { v: 1, rule: { preset: 'uk-degree', limit: 1200, period: 7, weekStart: 1, holiday: null }, holidays: [], shifts: [
    { id: 'a', date: '2026-11-02', start: '09:00', end: '13:00', brk: 0, employer: 'Costa Coffee', note: '' },
    { id: 'b', date: '2026-11-03', start: '17:00', end: '22:00', brk: 30, employer: 'Tesco', note: '' },
    { id: 'c', date: '2026-11-05', start: '18:00', end: '22:00', brk: 0, employer: 'Costa Coffee', note: '' },
    { id: 'd', date: '2026-11-07', start: '22:00', end: '02:30', brk: 0, employer: 'Tesco', note: '' }] };

async function page(browser, opts) {
    opts = opts || {};
    const ctx = await browser.newContext({ viewport: { width: opts.w || 390, height: 900 }, colorScheme: opts.scheme || 'dark', acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
    await ctx.addInitScript(FIX);
    if (opts.blockStorage) await ctx.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
    const p = await ctx.newPage();
    p.errors = [];
    p.on('pageerror', e => p.errors.push(e.message));
    p.on('console', m => { if (m.type() === 'error' && !/ERR_NAME_NOT_RESOLVED|gc\.zgo\.at|goatcounter/i.test(m.text())) p.errors.push(m.text()); });
    p.on('requestfailed', r => { if (!/gc\.zgo\.at|goatcounter/.test(r.url())) p.errors.push('failed ' + r.url()); });
    await p.goto(URL);
    if (opts.data !== undefined) {
        await p.evaluate(([k, d]) => localStorage.setItem(k, typeof d === 'string' ? d : JSON.stringify(d)), [KEY, opts.data]);
        await p.reload();
    }
    await p.waitForSelector('#big');
    return p;
}
const txt = (p, sel) => p.$eval(sel, e => e.textContent.replace(/\s+/g, ' ').trim());
const vis = (p, sel) => p.$eval(sel, e => !!(e.offsetWidth || e.offsetHeight) && getComputedStyle(e).visibility !== 'hidden');
async function addShift(p, emp, date, start, end, brk) {
    await p.fill('#a-emp', emp); await p.fill('#a-date', date); await p.fill('#a-start', start); await p.fill('#a-end', end);
    if (brk !== undefined) { if (!(await vis(p, '#a-brk'))) await p.click('#a-brk-open'); await p.fill('#a-brk', String(brk)); }
    await p.click('#a-save');
}
const saved = p => p.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);

(async () => {
    const browser = await chromium.launch();

    // ---- first use and empty state ----
    let p = await page(browser);
    ok('first use: 20 h left', await txt(p, '#big') === '20 h left');
    ok('first use: UK degree rule', (await txt(p, '#rule-line')).includes('20 h a week in term time'));
    ok('first use: empty message', await vis(p, '#shift-none'));
    ok('first use: no week history yet', !(await vis(p, '#hist')));
    ok('first use: date is today', await p.inputValue('#a-date') === '2026-11-05');
    ok('optional break and note are hidden', !(await vis(p, '#a-brk')) && !(await vis(p, '#a-note')));
    ok('This week button disabled on this week', await p.$eval('#today', e => e.disabled));

    // ---- blank and bad input ----
    await p.fill('#a-date', ''); await p.click('#a-save');
    ok('blank: date, start, end errors', (await txt(p, '#a-date-err')).length > 0 && (await txt(p, '#a-start-err')).length > 0 && (await txt(p, '#a-end-err')).length > 0);
    ok('blank: nothing saved', (await saved(p)) === null || (await saved(p)).shifts.length === 0);
    await addShift(p, '', '2026-11-05', '09:00', '09:00');
    ok('same start and end refused', (await txt(p, '#a-end-err')).includes('same time'));
    await addShift(p, '', '2026-11-05', '09:00', '10:00', 60);
    ok('break as long as the shift refused', (await txt(p, '#a-brk-err')).includes('as long as'));
    await p.fill('#a-brk', '-5'); await p.click('#a-save');
    ok('negative break refused', (await txt(p, '#a-brk-err')).includes('whole minutes'));
    await p.fill('#a-brk', '');

    // ---- the main situation ----
    await addShift(p, 'Costa Coffee', '2026-11-02', '09:00', '13:00');
    ok('employer typed, no break or note forced: saved', (await saved(p)).shifts.length === 1);
    ok('after one shift: 16 h left', await txt(p, '#big') === '16 h left');
    await addShift(p, 'Tesco', '2026-11-03', '17:00', '22:00', 30);
    await addShift(p, 'Costa Coffee', '2026-11-05', '18:00', '22:00', '');
    await p.fill('#a-emp', 'Tesco'); await p.fill('#a-date', '2026-11-07'); await p.fill('#a-start', '22:00'); await p.fill('#a-end', '02:30');
    ok('night shift preview: ends the next day', (await txt(p, '#a-len')).includes('4 h 30 min, ends the next day'));
    ok('preview: hours left after it', (await txt(p, '#a-len')).includes('After it: 3 h left that week'));
    await p.press('#a-end', 'Enter');
    ok('Enter key saves', (await saved(p)).shifts.length === 4);
    ok('main answer: 3 h left', await txt(p, '#big') === '3 h left');
    ok('main answer: 17 h of 20 h this week', (await txt(p, '#big-sub')) === '17 h of 20 h this week.');
    const stats = await txt(p, '#stats');
    ok('worked 8 h 30, planned 8 h 30', stats.includes('Worked so far8 h 30 min') && stats.includes('Planned (not ended yet)8 h 30 min'), stats);
    ok('by employer: Tesco 9 h, Costa 8 h', stats.includes('Tesco9 h') && stats.includes('Costa Coffee8 h'), stats);
    ok('4 shift boxes', (await p.$$('#shift-list .item')).length === 4);
    ok('planned and worked tags', (await p.$$('#shift-list .t-plan')).length === 2 && (await p.$$('#shift-list .t-done')).length === 2);
    ok('employer chips offered', (await p.$$('#emp-chips .chip')).length === 2);

    // ---- would it go over? ----
    await p.fill('#a-date', '2026-11-08'); await p.fill('#a-start', '12:00'); await p.fill('#a-end', '16:00');
    ok('preview warns over by 1 h', (await txt(p, '#a-len')).includes('over the limit by 1 h that week'));
    await p.fill('#a-end', '15:00');
    ok('preview: exactly at the limit', (await txt(p, '#a-len')).includes('exactly at the limit'));
    await p.fill('#a-end', '16:00');
    await p.click('#a-save');
    ok('saved over: Over by 1 h', await txt(p, '#big') === 'Over by 1 h');
    ok('over box lists planned shifts', await vis(p, '#over-box') && (await p.$$('#over-list li')).length === 3);
    ok('history marks the week', (await txt(p, '#hist-note')).includes('planned over the limit'));

    // ---- delete with undo ----
    const sunBox = (await p.$$('#shift-list .item')).length;
    await p.click('#shift-list .item:last-child button:has-text("Delete")');
    ok('delete: back to 3 h left', await txt(p, '#big') === '3 h left' && (await p.$$('#shift-list .item')).length === sunBox - 1);
    await p.click('#week-msg button:has-text("Undo")');
    ok('undo brings it back', await txt(p, '#big') === 'Over by 1 h');
    await p.click('#shift-list .item:last-child button:has-text("Delete")');

    // ---- edit ----
    await p.click('#shift-list .item:nth-child(3) button:has-text("Edit")');
    ok('edit fills the form', await p.inputValue('#a-start') === '18:00' && await txt(p, '#a-save') === 'Save changes');
    await p.fill('#a-end', '21:00'); await p.click('#a-save');
    ok('edit saved: 4 h left', await txt(p, '#big') === '4 h left');
    ok('edit back to add mode', await txt(p, '#a-save') === 'Add shift' && !(await vis(p, '#a-cancel')));
    await p.click('#shift-list .item:nth-child(3) button:has-text("Edit")');
    await p.fill('#a-end', '23:59'); await p.click('#a-cancel');
    ok('cancel edit keeps the shift', await txt(p, '#big') === '4 h left');

    // ---- overlap warning (duplicate) ----
    await addShift(p, 'Costa Coffee', '2026-11-02', '10:00', '12:00');
    ok('overlap warned', (await txt(p, '#add-msg')).includes('overlaps'));
    await p.click('#add-msg button:has-text("Undo")');
    ok('undo add', (await saved(p)).shifts.length === 4);

    // ---- same time next week and week navigation ----
    await p.click('#shift-list .item:first-child button:has-text("Same time next week")');
    ok('repeat jumps to next week', await txt(p, '#week-name') === 'Next week' && (await txt(p, '#week-range')) === 'Mon 9 Nov to Sun 15 Nov 2026');
    ok('next week has the copy plus the Sunday night tail', (await p.$$('#shift-list .item')).length === 1 || (await p.$$('#shift-list .item')).length === 2);
    await p.click('#today');
    ok('This week returns', await txt(p, '#week-name') === 'This week');
    await p.click('#prev');
    ok('Previous goes to last week, empty', await txt(p, '#week-name') === 'Last week' && await vis(p, '#shift-none'));
    await p.click('#today');

    // ---- reload keeps everything ----
    await p.reload(); await p.waitForSelector('#big');
    ok('reload keeps the shifts', await txt(p, '#big') === '4 h left' && (await saved(p)).shifts.length === 5);

    // ---- copy and email ----
    await p.click('#copy');
    await p.waitForTimeout(200);
    const clip = await p.evaluate(() => navigator.clipboard.readText()).catch(() => '');
    ok('copy this week', clip.includes('Total this week: 16 h') && clip.includes('Tesco'), clip.slice(0, 120));
    const mail = await p.getAttribute('#mail', 'href');
    ok('email link works with no address', mail.startsWith('mailto:?subject=') && decodeURIComponent(mail).includes('Total this week: 16 h'));

    // ---- rule changes ----
    await p.selectOption('#r-preset', 'au');
    ok('Australia: fortnight lines shown', (await txt(p, '#stats')).includes('Fortnight Mon 26 Oct to Sun 8 Nov'));
    ok('Australia: 28 h left (fortnight 2 to 15 Nov holds 20 h with the copied Monday shift)', await txt(p, '#big') === '28 h left', await txt(p, '#big'));
    await p.click('#top-msg button:has-text("Undo")');
    ok('undo rule change', (await txt(p, '#rule-line')).includes('20 h a week'));
    await p.click('#r-more-open');
    await p.fill('#r-limit', 'abc'); await p.press('#r-limit', 'Tab');
    ok('custom limit: words refused', (await txt(p, '#r-limit-err')).length > 0);
    await p.fill('#r-limit', '0'); await p.press('#r-limit', 'Tab');
    ok('custom limit: 0 refused', (await txt(p, '#r-limit-err')).includes('more than 0'));
    await p.fill('#r-limit', '999'); await p.press('#r-limit', 'Tab');
    ok('custom limit: huge refused', (await txt(p, '#r-limit-err')).includes('more than 168'));
    await p.fill('#r-limit', '19.5'); await p.press('#r-limit', 'Tab');
    ok('custom 19.5 h: switches to My own limit', await p.inputValue('#r-preset') === 'custom' && await txt(p, '#big') === '3 h 30 min left');
    await p.selectOption('#r-start', '0');
    ok('week starting Sunday', (await txt(p, '#week-range')) === 'Sun 1 Nov to Sat 7 Nov 2026');
    await p.selectOption('#r-preset', 'uk-degree');
    await p.selectOption('#r-start', '1');
    ok('week start back to Monday stays on this week', await txt(p, '#week-name') === 'This week' && (await txt(p, '#week-range')) === 'Mon 2 Nov to Sun 8 Nov 2026', await txt(p, '#week-range'));
    await p.click('#next'); await p.selectOption('#r-start', '0');
    ok('week start change on next week stays on next week', (await txt(p, '#week-range')) === 'Sun 8 Nov to Sat 14 Nov 2026', await txt(p, '#week-range'));
    await p.selectOption('#r-start', '1'); await p.click('#today');

    // ---- holidays ----
    await p.click('#h-open');
    await p.fill('#h-from', '2026-11-10'); await p.fill('#h-to', '2026-11-01'); await p.click('#h-save');
    ok('holiday: last day before first refused', (await txt(p, '#h-to-err')).includes('before'));
    await p.fill('#h-from', '2026-11-02'); await p.fill('#h-to', '2026-11-08'); await p.fill('#h-name', 'Reading week'); await p.click('#h-save');
    ok('holiday week: no limit', await txt(p, '#big') === 'No limit this week', [await txt(p, '#big'), await txt(p, '#h-from-err'), await txt(p, '#h-to-err'), await txt(p,'#hol-list')]);
    ok('holiday box shown', (await txt(p, '#hol-list')).includes('Reading week'));
    await p.click('#hol-list button:has-text("Delete")');
    ok('holiday deleted: limit back', await txt(p, '#big') === '4 h left');
    await p.click('#top-msg button:has-text("Undo")');
    ok('holiday undo', await txt(p, '#big') === 'No limit this week');
    await p.click('#hol-list button:has-text("Delete")');

    // ---- very long text ----
    await addShift(p, 'A very long employer name that goes on and on and on for ever and ever more', '2026-11-04', '06:00', '07:00');
    ok('long employer cut to 60 characters', (await saved(p)).shifts.some(s => s.employer.length === 60));
    ok('long employer: no sideways scroll', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));

    // ---- CSV and backup ----
    const [csvDl] = await Promise.all([p.waitForEvent('download'), p.click('#csv')]);
    const csvText = fs.readFileSync(await csvDl.path(), 'utf8');
    ok('CSV has every shift', csvText.split('\r\n').filter(Boolean).length === 1 + (await saved(p)).shifts.length);
    const [bk] = await Promise.all([p.waitForEvent('download'), p.click('#backup')]);
    const bkPath = await bk.path();
    const count = (await saved(p)).shifts.length;
    await p.click('#wipe');
    ok('delete everything', (await saved(p)).shifts.length === 0 && await txt(p, '#big') === '20 h left');
    await p.click('#tools-msg button:has-text("Undo")');
    ok('undo delete everything', (await saved(p)).shifts.length === count);
    await p.click('#wipe');
    await p.setInputFiles('#restore-file', bkPath);
    await p.waitForTimeout(200);
    ok('restore a backup', (await saved(p)).shifts.length === count && (await txt(p, '#tools-msg')).includes('Restored'));
    const bad = path.join(path.dirname(bkPath), 'bad.json'); fs.writeFileSync(bad, '{"hello": 1');
    await p.setInputFiles('#restore-file', bad); await p.waitForTimeout(200);
    ok('bad backup refused, nothing changed', (await txt(p, '#tools-msg')).includes('not a backup') && (await saved(p)).shifts.length === count);
    ok('no console errors (main run)', p.errors.length === 0, p.errors);
    await p.context().close();

    // ---- saved state edge cases ----
    p = await page(browser, { data: '{not json' });
    ok('corrupt saved data: starts fresh', await txt(p, '#big') === '20 h left' && p.errors.length === 0, p.errors);
    await p.context().close();
    p = await page(browser, { data: { rule: { limit: 'x' }, shifts: [{ date: '2026-11-02', start: '09:00', end: '25:00' }, SAMPLE.shifts[0]] } });
    ok('bad rows dropped, good rows kept', await txt(p, '#big') === '16 h left' && p.errors.length === 0, p.errors);
    await p.context().close();
    p = await page(browser, { blockStorage: true });
    ok('storage blocked: warning and still works', await vis(p, '#store-warn') && p.errors.length === 0, p.errors);
    await addShift(p, 'Tesco', '2026-11-02', '09:00', '13:00');
    ok('storage blocked: shift still counted', await txt(p, '#big') === '16 h left');
    await p.context().close();

    // ---- help, layout, theme at every width ----
    for (const w of [320, 390, 820, 1280]) {
        p = await page(browser, { w, data: SAMPLE });
        await p.click('button.help-btn, .topbar button:has-text("Help"), .topbar button[aria-label*="Help"]');
        const d = await p.$eval('dialog', e => { const r = e.getBoundingClientRect(); return { open: e.open, l: r.left, r: r.right, t: r.top, title: e.textContent.includes('How to use') }; });
        ok('help opens inside the screen at ' + w, d.open && d.l >= 0 && d.r <= w && d.t >= 0 && d.title, d);
        await p.keyboard.press('Escape');
        ok('Escape closes help at ' + w, !(await p.$eval('dialog', e => e.open)));
        await p.click('button.help-btn, .topbar button:has-text("Help"), .topbar button[aria-label*="Help"]');
        await p.click('dialog button:has-text("Got it")');
        ok('Got it closes help at ' + w, !(await p.$eval('dialog', e => e.open)));
        const bar = await p.$$eval('.topbar > *', es => es.map(e => e.getBoundingClientRect()).map(r => [r.left, r.right, r.top, r.bottom]));
        let clash = false;
        for (let i = 0; i < bar.length; i++) for (let j = i + 1; j < bar.length; j++) { const a = bar[i], b = bar[j]; if (a[0] < b[1] - 1 && b[0] < a[1] - 1 && a[2] < b[3] - 1 && b[2] < a[3] - 1) clash = true; }
        ok('top bar buttons do not overlap at ' + w, !clash);
        await p.context().close();
    }
    for (const scheme of ['dark', 'light']) for (const w of [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920]) {
        p = await page(browser, { w, scheme, data: SAMPLE });
        // open every optional part
        for (const s of ['#a-brk-open', '#a-note-open', '#r-more-open', '#h-open']) if (await vis(p, s)) await p.click(s);
        await p.selectOption('#r-hol', 'limit');
        const noScroll = await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
        const out = await p.evaluate(() => [...document.querySelectorAll('main *')].filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.right > innerWidth + 1 || r.left < -1); }).map(e => e.id || e.className).slice(0, 3));
        ok(scheme + ' ' + w + ': no sideways scroll, nothing sticks out', noScroll && !out.length, out);
        if (w <= 390) {
            const boxes = await p.$$eval('main input:not([type=file]), main select, main button, main textarea, main a.secondary', es => es.filter(e => e.offsetWidth).map(e => { const r = e.getBoundingClientRect(); return [r.left, r.right, r.top + scrollY, r.bottom + scrollY, e.id || e.textContent.trim().slice(0, 20)]; }));
            const hits = [];
            for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) { const a = boxes[i], b = boxes[j]; if (a[0] < b[1] - 1 && b[0] < a[1] - 1 && a[2] < b[3] - 1 && b[2] < a[3] - 1) hits.push(a[4] + '/' + b[4]); }
            ok(scheme + ' ' + w + ': no controls overlap', !hits.length, hits.slice(0, 4));
            const clipped = await p.$$eval('main input[placeholder]', es => es.filter(e => e.offsetWidth).filter(e => { const c = document.createElement('canvas').getContext('2d'); const cs = getComputedStyle(e); c.font = cs.fontSize + ' ' + cs.fontFamily; return c.measureText(e.placeholder).width > e.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) + 1; }).map(e => e.id));
            ok(scheme + ' ' + w + ': placeholders fit', !clipped.length, clipped);
        }
        if (w >= 900) {
            let overlap = [];
            for (const y of [0, 0.5, 1]) {
                await p.evaluate(f => scrollTo(0, (document.body.scrollHeight - innerHeight) * f), y);
                overlap = overlap.concat(await p.evaluate(() => {
                    const hits = [];
                    for (const host of document.querySelectorAll('main, .col-a, .col-b')) {
                        const kids = [...host.children].filter(e => e.offsetWidth && getComputedStyle(e).display !== 'contents').map(e => [e, e.getBoundingClientRect()]);
                        for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) { const a = kids[i][1], b = kids[j][1]; if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) hits.push((kids[i][0].id || kids[i][0].className) + '/' + (kids[j][0].id || kids[j][0].className)); }
                    }
                    return hits;
                }));
            }
            ok(scheme + ' ' + w + ': no blocks overlap when scrolled', !overlap.length, overlap.slice(0, 3));
            if (w === 1280) {
                const cols = await p.evaluate(() => [document.querySelector('.col-a').getBoundingClientRect(), document.querySelector('.col-b').getBoundingClientRect()].map(r => Math.round(r.left)));
                ok('desktop: two columns side by side', cols[1] > cols[0] + 300, cols);
            }
        }
        ok(scheme + ' ' + w + ': no console errors', p.errors.length === 0, p.errors);
        await p.context().close();
    }
    // empty state at narrow and wide widths
    for (const w of [320, 1280]) {
        p = await page(browser, { w });
        ok('empty state ' + w + ': no sideways scroll', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await p.context().close();
    }
    // light / dark switch
    p = await page(browser, { w: 390, data: SAMPLE });
    const bg1 = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await p.click('.theme-toggle');
    const bg2 = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
    ok('light/dark switch changes the look', bg1 !== bg2 && await p.evaluate(() => document.documentElement.getAttribute('data-theme')) === 'light');
    await p.context().close();

    // files the page needs
    p = await page(browser);
    for (const f of ['favicon.svg', 'manifest.webmanifest', 'sw.js', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'screenshots/desktop.png', 'screenshots/phone.png', '../help.js', '../theme.js', 'core.js', 'script.js', 'style.css']) {
        const r = await p.request.get(URL + f);
        ok('file ' + f + ' returns 200', r.status() === 200, r.status());
    }
    await p.context().close();

    await browser.close();
    console.log(pass + ' passed, ' + fail + ' failed');
    if (fail) process.exitCode = 1;
})();
