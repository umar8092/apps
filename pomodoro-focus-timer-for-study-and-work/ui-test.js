// Full page test with Playwright. Run from this folder: node ui-test.js            (serves the repo locally)
//                                                       node ui-test.js --base https://umar8092.github.io/apps   (live site)
// The clock is fixed to Sat 17 Oct 2026, 09:00 so every answer is exact.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const SLUG = 'pomodoro-focus-timer-for-study-and-work', KEY = SLUG + '.data';
const args = process.argv.slice(2), bi = args.indexOf('--base'), LIVE = bi >= 0 ? args[bi + 1].replace(/\/$/, '') : null;
const ROOT = path.resolve(__dirname, '..');
let pass = 0; const fails = [];
const ok = (cond, name) => { if (cond) pass++; else fails.push(name); };
const eq = (got, want, name) => ok(JSON.stringify(got) === JSON.stringify(want), name + ' (got ' + JSON.stringify(got) + ', want ' + JSON.stringify(want) + ')');

function serve() {
    const types = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml', png: 'image/png', webmanifest: 'application/manifest+json', woff2: 'font/woff2' };
    return new Promise(res => { const s = http.createServer((q, r) => {
        let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
        const f = path.join(ROOT, p);
        if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
        r.writeHead(200, { 'content-type': types[f.split('.').pop()] || 'application/octet-stream' }); r.end(fs.readFileSync(f));
    }).listen(0, () => res({ s, base: 'http://localhost:' + s.address().port })); });
}
const T0 = new Date(2026, 9, 17, 9, 0).getTime();

(async () => {
    const srv = LIVE ? null : await serve(), BASE = LIVE || srv.base, URL = BASE + '/' + SLUG + '/';
    const browser = await chromium.launch();
    const errors = [], failedReq = [];
    async function open(width, opts = {}) {
        const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: opts.scheme || 'dark', serviceWorkers: 'block', acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
        const page = await ctx.newPage();
        page.on('pageerror', e => errors.push(width + ': ' + e.message));
        page.on('console', m => { if (m.type() === 'error' && !/goatcounter|gc\.zgo|ERR_NAME_NOT_RESOLVED|ERR_TUNNEL|ERR_CONNECTION|net::ERR/.test(m.text())) errors.push(width + ': ' + m.text()); });
        page.on('response', r => { if (r.status() >= 400 && !/gc\.zgo|goatcounter/.test(r.url())) failedReq.push(r.status() + ' ' + r.url()); });
        page.on('dialog', d => d.accept());
        await page.clock.install({ time: opts.time || T0 });
        if (opts.seed !== undefined) await page.addInitScript(([k, v]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, v); sessionStorage.setItem('seeded', '1'); } }, [KEY, opts.seed]);
        await page.goto(URL);
        return { ctx, page };
    }
    const txt = (p, s) => p.locator(s).first().innerText();
    const saved = p => p.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), KEY);
    const addTask = async (p, name) => { await p.fill('#task-new', name); await p.press('#task-new', 'Enter'); };

    // ---------- 1. first use and empty states ----------
    let { ctx, page: p } = await open(390);
    eq(await txt(p, '#time'), '25:00', 'first use: 25:00');
    eq(await txt(p, '#go'), 'Start focus', 'first use: Start focus');
    ok((await txt(p, '#working')).includes('No task picked'), 'first use: task is optional');
    ok(await p.isVisible('#tasks-empty'), 'empty task list message');
    eq(await txt(p, '#day-total'), 'No focus time yet today.', 'empty today');
    ok((await txt(p, '#week-total')).includes('No focus time'), 'empty week');
    ok(await p.isDisabled('#copy'), 'copy disabled when nothing to copy');
    ok(await p.isDisabled('#reset'), 'reset disabled before starting');
    ok(!(await p.isVisible('#add-est-row')), 'blocks it needs is hidden (optional)');
    ok(!(await p.isVisible('#past-form')), 'add past time is hidden (optional)');

    // blank, whitespace, duplicate, paste, long names
    await p.click('#add-form button[type=submit]');
    ok((await txt(p, '#add-err')).includes('Type what you will work on'), 'blank task refused');
    await addTask(p, '    ');
    ok((await txt(p, '#add-err')).includes('Type what'), 'spaces-only task refused');
    await p.click('#add-est-btn');
    ok(await p.isVisible('#task-est'), '+ Add how many blocks reveals the box');
    await p.fill('#task-new', 'Thesis chapter 2'); await p.fill('#task-est', '0'); await p.press('#task-new', 'Enter');
    ok((await txt(p, '#add-err')).includes('1 to 50'), 'blocks 0 refused');
    await p.fill('#task-est', '4'); await p.press('#task-new', 'Enter');
    eq(await p.locator('#task-list .task').count(), 1, 'first task added');
    ok((await txt(p, '#working')).includes('Thesis chapter 2'), 'first task picked automatically');
    ok((await txt(p, '#task-list')).includes('0 of 4 blocks'), 'planned blocks shown');
    await addTask(p, 'thesis chapter 2');
    ok((await txt(p, '#tasks-msg')).includes('already on your list'), 'duplicate refused');
    await p.focus('#task-new');
    await p.evaluate(() => { const dt = new DataTransfer(); dt.setData('text/plain', '- Emails\n2. Read paper\n\n* emails\n'); document.getElementById('task-new').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); });
    eq(await p.locator('#task-list .task').count(), 3, 'pasted list adds 2 tasks (repeat dropped)');
    await addTask(p, 'x'.repeat(200));
    eq((await p.inputValue('#task-new')).length, 0, 'long name accepted');
    const longName = (await saved(p)).tasks.find(t => t.name.startsWith('xxx')).name;
    eq(longName.length, 120, 'long name kept to 120 characters');
    await p.click('#tasks-msg .link');  // undo the long one
    eq(await p.locator('#task-list .task').count(), 3, 'undo add');

    // ---------- 2. the worked example ----------
    const pick = async name => { await p.locator('.task', { hasText: name }).locator('.pick').click(); };
    await p.click('#go');
    eq(await txt(p, '#go'), 'Pause', 'running shows Pause');
    ok(await p.isDisabled('.mode[data-mode="long"]'), 'mode switch disabled while running');
    eq(await txt(p, '#ends'), 'Ends at 09:25', 'ends at 09:25');
    await p.clock.fastForward('10:00');
    eq(await txt(p, '#time'), '15:00', '10 min later: 15:00');
    ok((await p.title()).startsWith('15:00 Focus'), 'tab title shows time left');
    await p.clock.fastForward('15:01');
    ok((await txt(p, '#timer-msg')).includes('Focus block done'), 'block done message');
    eq(await p.getAttribute('#timer', 'data-mode'), 'short', 'short break next');
    eq(await txt(p, '#time'), '05:00', 'short break 5:00');
    eq(await txt(p, '#day-total'), '25 min of focus · 1 block', 'first block counted');
    eq(await txt(p, '#go'), 'Start break', 'break waits for a tap');
    // breaks and blocks 2 and 3 (start each phase at its exact minute)
    const runPhase = async (mins) => { await p.click('#go'); await p.clock.fastForward(mins * 60000 + 1000); };
    await p.clock.setSystemTime(new Date(2026, 9, 17, 9, 25)); await runPhase(5);
    await p.clock.setSystemTime(new Date(2026, 9, 17, 9, 30)); await runPhase(25);
    await p.clock.setSystemTime(new Date(2026, 9, 17, 9, 55)); await runPhase(5);
    // pause during block 3: 10:00 start, pause 10:10 for 3 min, the block then ends at 10:28
    await p.clock.setSystemTime(new Date(2026, 9, 17, 10, 0));
    await p.click('#go'); await p.clock.fastForward('10:00'); await p.click('#go');
    eq(await txt(p, '#go'), 'Resume', 'paused shows Resume');
    await p.clock.fastForward('03:00');
    eq(await txt(p, '#time'), '15:00', 'paused clock does not move');
    await p.click('#go');
    eq(await txt(p, '#ends'), 'Ends at 10:28', 'pause moves the end');
    await p.clock.fastForward('15:01');
    await p.clock.setSystemTime(new Date(2026, 9, 17, 10, 28, 1)); await runPhase(5);
    await pick('Emails');
    await p.clock.setSystemTime(new Date(2026, 9, 17, 10, 33, 1)); await runPhase(25);
    eq(await p.getAttribute('#timer', 'data-mode'), 'long', 'long break after block 4');
    eq(await txt(p, '#time'), '15:00', 'long break 15:00');
    ok((await txt(p, '#timer-msg')).includes('long break'), 'long break message');
    await runPhase(15);
    eq(await txt(p, '#phase'), 'Focus block 1 · long break after block 4', 'count starts again after long break');
    // block 5 on the thesis, stopped after 12 min and counted
    await pick('Thesis chapter 2');
    await p.click('#go'); await p.clock.fastForward('12:00');
    await p.click('#reset');
    ok(await p.isVisible('#ask'), 'stopping early asks');
    eq(await txt(p, '#ask-yes'), 'Count 12 min', 'ask offers 12 min');
    ok((await txt(p, '#ask-text')).includes('on Thesis chapter 2'), 'ask names the task');
    await p.click('#ask-yes');
    eq(await txt(p, '#time'), '25:00', 'clock back to 25:00');
    eq(await txt(p, '#day-total'), '1 h 52 min of focus · 4 blocks + 12 min', 'WORKED EXAMPLE: today total');
    const split = await p.locator('#day-tasks li').allInnerTexts();
    eq(split.map(s => s.replace(/\s+/g, ' ').trim()), ['Thesis chapter 2 1 h 27 min · 3 blocks + 12 min', 'Emails 25 min · 1 block'], 'WORKED EXAMPLE: per task');
    ok((await txt(p, '.task.current')).includes('3 of 4 blocks · 1 h 27 min in total'), 'task shows 3 of 4 blocks');
    eq(await p.locator('#day-log li').count(), 5, 'five rows in the log');
    ok((await p.locator('#day-log li').nth(2).innerText()).includes('10:00–10:28'), 'paused block shows real start and end');
    const href = await p.getAttribute('#email', 'href');
    ok(href.startsWith('mailto:?subject=') && decodeURIComponent(href).includes('- Thesis chapter 2: 1 h 27 min (3 blocks + 12 min)'), 'email link works with no recipient');
    await p.click('#copy');
    const clip = await p.evaluate(() => navigator.clipboard.readText()).catch(() => '');
    ok(clip.startsWith('Focus time, Sat 17 Oct 2026: 1 h 52 min (4 blocks + 12 min)'), 'copy summary text');

    // ---------- 3. stop early: not counted, keep going, under a minute ----------
    await p.click('#go'); await p.clock.fastForward('05:00'); await p.click('#skip');
    await p.click('#ask-back');
    eq(await txt(p, '#go'), 'Pause', 'keep going resumes');
    await p.click('#skip'); await p.click('#ask-no');
    eq(await p.getAttribute('#timer', 'data-mode'), 'short', 'skip goes to the short break');
    ok((await txt(p, '#timer-msg')).includes('Not counted'), 'not counted message');
    eq(await txt(p, '#day-total'), '1 h 52 min of focus · 4 blocks + 12 min', 'not counted leaves the total');
    await p.click('#skip');
    eq(await p.getAttribute('#timer', 'data-mode'), 'focus', 'skip break');
    await p.click('#go'); await p.clock.fastForward('00:30'); await p.click('#skip');
    ok(!(await p.isVisible('#ask')), 'under a minute: no question');
    await p.click('.mode[data-mode="focus"]');

    // ---------- 4. edit, delete, undo ----------
    await p.locator('#day-log li').first().getByRole('button', { name: /Edit/ }).click();
    await p.fill('#re-mins', '0'); await p.click('.rec-edit button[type=submit]');
    ok((await txt(p, '.rec-edit .err')).includes('1 to 600'), 'edit minutes 0 refused');
    await p.fill('#re-mins', '30'); await p.click('.rec-edit button[type=submit]');
    eq(await txt(p, '#day-total'), '1 h 57 min of focus · 4 blocks + 12 min', 'edit minutes');
    await p.click('#day-msg .link');
    eq(await txt(p, '#day-total'), '1 h 52 min of focus · 4 blocks + 12 min', 'undo edit');
    await p.locator('#day-log li').last().getByRole('button', { name: /Delete/ }).click();
    eq(await txt(p, '#day-total'), '1 h 40 min of focus · 4 blocks', 'delete a block');
    await p.click('#day-msg .link');
    eq(await txt(p, '#day-total'), '1 h 52 min of focus · 4 blocks + 12 min', 'undo delete block');
    await p.locator('.task', { hasText: 'Read paper' }).getByRole('button', { name: /Delete/ }).click();
    eq(await p.locator('#task-list .task').count(), 2, 'delete task');
    await p.click('#tasks-msg .link');
    eq(await p.locator('#task-list .task').count(), 3, 'undo delete task');
    await p.locator('.task', { hasText: 'Emails' }).getByRole('button', { name: /Delete/ }).click();
    ok((await txt(p, '#day-tasks')).includes('Emails'), 'deleted task keeps its time in the log');
    await p.click('#tasks-msg .link');
    await p.locator('.task', { hasText: 'Read paper' }).getByRole('button', { name: /Edit/ }).click();
    await p.fill('.task-edit input[type=text]', ''); await p.click('.task-edit button[type=submit]');
    ok((await txt(p, '.task-edit .err')).includes('needs a name'), 'blank rename refused');
    await p.fill('.task-edit input[type=text]', 'Read Smith 2024 paper'); await p.click('.task-edit button[type=submit]');
    ok((await txt(p, '#task-list')).includes('Read Smith 2024 paper'), 'rename');
    await p.locator('.task', { hasText: 'Read Smith' }).locator('input[type=checkbox]').check();
    ok(await p.isVisible('#clear-done'), 'finished task offers Remove finished');
    await p.click('#clear-done');
    eq(await p.locator('#task-list .task').count(), 2, 'remove finished');
    await p.click('#tasks-msg .link');
    eq(await p.locator('#task-list .task').count(), 3, 'undo remove finished');

    // ---------- 5. add past time ----------
    await p.click('#add-past');
    await p.fill('#past-date', '2026-10-16'); await p.fill('#past-time', '20:00'); await p.fill('#past-mins', '');
    await p.click('#past-form button[type=submit]');
    ok((await txt(p, '#past-err')).includes('1 to 600'), 'past minutes blank refused');
    await p.fill('#past-date', '2026-10-17'); await p.fill('#past-time', '23:00'); await p.fill('#past-mins', '25');
    await p.click('#past-form button[type=submit]');
    ok((await txt(p, '#past-err')).includes('future'), 'future time refused');
    await p.fill('#past-date', '2026-10-16'); await p.fill('#past-time', '20:00'); await p.fill('#past-mins', '50');
    await p.click('#past-form button[type=submit]');
    eq(await txt(p, '#day-h'), 'Yesterday, Fri 16 Oct', 'shows the day it was added to');
    ok((await txt(p, '#day-total')).startsWith('50 min of focus'), 'past time added');
    await p.click('#day-today');
    eq(await txt(p, '#day-h'), 'Today', 'back to today');
    ok((await txt(p, '#week-total')).includes('2 h 42 min of focus · 5 full blocks · 2 days in a row'), 'week total and streak');
    await p.locator('.day-bar').nth(5).click();
    eq(await txt(p, '#day-h'), 'Yesterday, Fri 16 Oct', 'tap a bar shows that day');
    await p.locator('.day-bar').nth(0).click();
    eq(await txt(p, '#day-total'), 'No focus time on this day.', 'empty earlier day');
    await p.click('#day-today');

    // ---------- 6. settings ----------
    await p.selectOption('#s-focus', 'other');
    const inp = p.locator('.field[data-key="focus"] input');
    await inp.fill('0'); await inp.press('Enter');
    ok((await txt(p, '#set-err')).includes('1 to 180'), 'custom focus 0 refused');
    await inp.fill('181'); await inp.press('Enter');
    ok((await txt(p, '#set-err')).includes('1 to 180'), 'custom focus 181 refused');
    await inp.fill('40'); await inp.press('Enter');
    eq(await txt(p, '#time'), '40:00', 'custom 40 min applies to the idle timer');
    await p.reload();
    eq(await p.inputValue('#s-focus'), 'other', 'custom length remembered after reload');
    eq(await p.inputValue('.field[data-key="focus"] input'), '40', 'custom value shown after reload');
    await p.click('.preset[data-preset="long"]');
    eq(await txt(p, '#time'), '50:00', 'preset 50 + 10');
    eq(await p.inputValue('#s-every'), '3', 'preset long break after 3');
    await p.click('#go');
    ok(await p.isVisible('#set-note'), 'note: running block keeps length');
    await p.click('.preset[data-preset="classic"]');
    eq(await txt(p, '#ends'), 'Ends at ' + (await p.evaluate(() => { const d = new Date(window.__focusApp.data.timer.endsAt); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); })), 'end time shown');
    eq(await p.evaluate(() => window.__focusApp.data.timer.length), 50 * 60000, 'running block keeps 50 min');
    // reload while running: still running with the same end
    const endBefore = await p.evaluate(() => window.__focusApp.data.timer.endsAt);
    await p.reload();
    eq(await txt(p, '#go'), 'Pause', 'reload: still running');
    eq(await p.evaluate(() => window.__focusApp.data.timer.endsAt), endBefore, 'reload: same end time');
    await p.click('#reset'); if (await p.isVisible('#ask')) await p.click('#ask-no');
    await p.selectOption('#s-every', '0');
    eq(await txt(p, '#phase'), 'Focus block 1', 'never long break');
    await p.selectOption('#s-every', '4');
    await p.selectOption('#s-goal', '6');
    ok((await txt(p, '#goal-text')).includes('Daily goal: 4 of 6 blocks, 2 to go.'), 'daily goal');
    await p.selectOption('#s-sound', 'off'); await p.click('#test-sound');
    ok((await txt(p, '#set-msg')).includes('No sound'), 'test with sound off explains');
    await p.selectOption('#s-sound', 'bell');
    // space bar
    await p.locator('h1').click();
    await p.keyboard.press('Space');
    eq(await txt(p, '#go'), 'Pause', 'space starts');
    await p.keyboard.press('Space');
    eq(await txt(p, '#go'), 'Resume', 'space pauses');
    await p.focus('#task-new'); await p.keyboard.press('Space');
    eq(await txt(p, '#go'), 'Resume', 'space while typing does nothing to the timer');
    await p.click('#reset');
    if (await p.isVisible('#ask')) await p.click('#ask-no');

    // ---------- 7. backup, restore, CSV, wipe ----------
    let dl = p.waitForEvent('download'); await p.click('#backup'); const bk = await (await dl).path();
    dl = p.waitForEvent('download'); await p.click('#csv'); const csvText = fs.readFileSync(await (await dl).path(), 'utf8');
    ok(csvText.startsWith('Date,Start,End,Minutes,Task,Full block\n2026-10-16,20:00,20:50,50,') && csvText.includes('2026-10-17,09:00,09:25,25,Thesis chapter 2,yes'), 'CSV download');
    await p.click('#wipe');
    eq(await txt(p, '#day-total'), 'No focus time yet today.', 'delete everything');
    eq(await p.locator('#task-list .task').count(), 0, 'tasks deleted');
    await p.click('#set-msg .link');
    eq(await txt(p, '#day-total'), '1 h 52 min of focus · 4 blocks + 12 min', 'undo delete everything');
    await p.click('#wipe');
    const bad = path.join(__dirname, '..', '.ui-test-bad.json'); fs.writeFileSync(bad, '{"hello":1}');
    await p.setInputFiles('#restore-file', bad); await p.waitForTimeout(200);
    ok((await txt(p, '#set-msg')).includes('not a backup'), 'wrong file refused');
    fs.writeFileSync(bad, 'not json'); await p.setInputFiles('#restore-file', bad); await p.waitForTimeout(200);
    ok((await txt(p, '#set-msg')).includes('not a backup'), 'broken file refused');
    fs.unlinkSync(bad);
    await p.setInputFiles('#restore-file', bk); await p.waitForTimeout(200);
    ok((await txt(p, '#set-msg')).includes('Restored 3 tasks and 6 focus blocks'), 'restore backup');
    eq(await txt(p, '#day-total'), '1 h 52 min of focus · 4 blocks + 12 min', 'restored data');

    // light/dark switch
    const sw = p.locator('.theme-toggle');
    if (await sw.count()) { await sw.click(); const th = await p.getAttribute('html', 'data-theme'); ok(th === 'light' || th === 'dark', 'theme switch sets data-theme'); await sw.click(); }
    else ok(false, 'theme switch exists');
    const state = JSON.stringify(await saved(p));
    await ctx.close();

    // ---------- 8. phone locked: block ends while away ----------
    ({ ctx, page: p } = await open(390, { seed: state }));
    await p.click('#go');
    const end = await p.evaluate(() => window.__focusApp.data.timer.endsAt);
    const st2 = JSON.stringify(await saved(p));
    await ctx.close();
    ({ ctx, page: p } = await open(390, { seed: st2, time: end + 40 * 60000 }));
    ok((await txt(p, '#timer-msg')).startsWith('Focus block done at 09:25'), 'reopened later: block counted with its end time');
    eq(await txt(p, '#go'), 'Start break', 'reopened later: break waits');
    eq(await txt(p, '#day-total'), '2 h 17 min of focus · 5 blocks + 12 min', 'reopened later: total');
    await ctx.close();
    // auto break and auto focus on, away for hours: one block and one break, no ghost blocks
    const s3 = JSON.parse(st2); s3.settings.autoBreak = true; s3.settings.autoFocus = true;
    ({ ctx, page: p } = await open(390, { seed: JSON.stringify(s3), time: end + 5 * 3600000 }));
    eq(await txt(p, '#day-total'), '2 h 17 min of focus · 5 blocks + 12 min', 'away with auto start: only the real block counted');
    eq([await p.getAttribute('#timer', 'data-mode'), await txt(p, '#go')], ['focus', 'Start focus'], 'away with auto start: focus waits');
    await ctx.close();

    // ---------- 9. corrupt and blocked storage ----------
    ({ ctx, page: p } = await open(390, { seed: '{broken' }));
    eq(await txt(p, '#time'), '25:00', 'corrupt saved data: fresh start');
    ok((await txt(p, '#timer-msg')).includes('could not be read'), 'corrupt saved data: says so');
    await ctx.close();
    ({ ctx, page: p } = await open(390, { seed: JSON.stringify({ tasks: 'x', records: [{ start: 'a' }], timer: { status: 'running', endsAt: -5 }, settings: { focus: 'abc' } }) }));
    eq(await txt(p, '#time'), '25:00', 'wrong-shaped saved data: fresh timer');
    await ctx.close();
    {
        const c2 = await browser.newContext({ viewport: { width: 390, height: 900 } });
        await c2.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
        const p2 = await c2.newPage(); p2.on('pageerror', e => errors.push('blocked: ' + e.message));
        await p2.goto(URL);
        ok(await p2.isVisible('#storage-warn'), 'blocked storage warning');
        await p2.fill('#task-new', 'Works anyway'); await p2.press('#task-new', 'Enter');
        eq(await p2.locator('#task-list .task').count(), 1, 'blocked storage: app still works');
        await c2.close();
    }

    // ---------- 10. every width: no horizontal scroll, help, overlaps, filled and empty ----------
    for (const scheme of ['dark', 'light']) for (const w of [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920]) {
        for (const filled of [true, false]) {
            ({ ctx, page: p } = await open(w, { scheme, seed: filled ? state : JSON.stringify({}) }));
            if (filled) {
                await p.click('#add-est-btn'); await p.click('#add-past');
                await p.locator('#day-log li').first().getByRole('button', { name: /Edit/ }).click();
                await p.selectOption('#s-focus', 'other'); await p.selectOption('#s-goal', 'other');
                await p.click('#go'); await p.clock.fastForward('03:00'); await p.click('#skip');
            }
            const r = await p.evaluate(() => {
                const out = [], W = document.documentElement.clientWidth;
                if (document.documentElement.scrollWidth > W + 1) out.push('horizontal scroll ' + document.documentElement.scrollWidth);
                document.querySelectorAll('main *').forEach(e => { const b = e.getBoundingClientRect(); if (b.width && e.offsetParent && (b.right > W + 1 || b.left < -1) && !e.closest('.vh')) out.push('sticks out: ' + e.tagName + '.' + e.className + ' ' + Math.round(b.right)); });
                const ctrls = [...document.querySelectorAll('main input:not([type=file]), main select, main button, main a.secondary')].filter(e => e.offsetParent && e.getBoundingClientRect().width);
                for (let i = 0; i < ctrls.length; i++) for (let j = i + 1; j < ctrls.length; j++) {
                    const a = ctrls[i].getBoundingClientRect(), b = ctrls[j].getBoundingClientRect();
                    if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1 && !ctrls[i].contains(ctrls[j]) && !ctrls[j].contains(ctrls[i]) && !ctrls[i].closest('label')?.contains(ctrls[j])) out.push('overlap: ' + (ctrls[i].id || ctrls[i].textContent.trim().slice(0, 20)) + ' / ' + (ctrls[j].id || ctrls[j].textContent.trim().slice(0, 20)));
                }
                // placeholders fit their boxes
                document.querySelectorAll('main input[placeholder]').forEach(i => { if (!i.offsetParent) return; const c = document.createElement('canvas').getContext('2d'); const cs = getComputedStyle(i); c.font = cs.fontSize + ' ' + cs.fontFamily; const tw = c.measureText(i.placeholder).width, room = i.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight); if (tw > room + 1) out.push('placeholder cut: ' + i.placeholder); });
                return out;
            });
            eq(r, [], scheme + ' ' + w + (filled ? ' filled' : ' empty') + ' layout');
            if (w >= 900 && filled) {
                for (const pos of [0, .5, 1]) {
                    await p.evaluate(pos => window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * pos), pos);
                    const o = await p.evaluate(() => { const kids = [...document.querySelectorAll('main > *, .col-main > *, .col-side > *')].filter(e => e.offsetParent); const out = [];
                        for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) { if (kids[i].contains(kids[j]) || kids[j].contains(kids[i])) continue; const a = kids[i].getBoundingClientRect(), b = kids[j].getBoundingClientRect(); if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) out.push(kids[i].className + '/' + kids[j].className); } return out; });
                    eq(o, [], scheme + ' ' + w + ' no overlap after scroll ' + pos);
                }
            }
            if (scheme === 'dark' && filled && [320, 390, 820, 1280].includes(w)) {
                await p.evaluate(() => window.scrollTo(0, 0));
                const hb = p.locator('.help-btn'); await hb.click();
                const d = await p.evaluate(() => { const d = document.querySelector('dialog.help'); const b = d.getBoundingClientRect(); return { open: d.open, inside: b.left >= 0 && b.top >= 0 && b.right <= innerWidth && b.bottom <= innerHeight, title: (d.querySelector('h2') || {}).textContent }; });
                ok(d.open && d.inside && /Pomodoro/.test(d.title), w + ' help opens inside the screen with its title');
                await p.keyboard.press('Escape'); ok(!(await p.evaluate(() => document.querySelector('dialog.help').open)), w + ' Escape closes help');
                await hb.click(); await p.getByRole('button', { name: 'Got it' }).click(); ok(!(await p.evaluate(() => document.querySelector('dialog.help').open)), w + ' Got it closes help');
                const bar = await p.evaluate(() => { const els = [...document.querySelectorAll('.topbar > *')].map(e => e.getBoundingClientRect()); let bad = false; for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) { const a = els[i], b = els[j]; if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) bad = true; } return { bad, h: document.querySelector('.topbar').getBoundingClientRect().height }; });
                ok(!bar.bad && bar.h < 100, w + ' top bar buttons do not overlap or wrap badly');
            }
            await ctx.close();
        }
    }

    // ---------- 11. files the page needs ----------
    ({ ctx, page: p } = await open(1280));
    for (const f of ['favicon.svg', 'manifest.webmanifest', 'sw.js', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'screenshots/desktop.png', 'screenshots/phone.png', '../help.js', '../theme.js', 'core.js', 'script.js', 'style.css']) {
        const r = await p.request.get(URL + f); eq(r.status(), 200, 'file ' + f);
    }
    await ctx.close();

    eq(errors, [], 'no page or console errors');
    eq(failedReq, [], 'no failed requests');
    await browser.close(); if (srv) srv.s.close();
    fails.forEach(f => console.log('FAIL ' + f));
    console.log((fails.length ? 'FAILED ' : 'ALL UI CHECKS PASSED ') + pass + ' passed, ' + fails.length + ' failed' + (LIVE ? ' (live: ' + LIVE + ')' : ''));
    process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('ui-test crashed:', e); process.exit(1); });
