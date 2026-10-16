// Full page test with Playwright. Run from the repo root or this folder: node ui-test.js
//   BASE=https://umar8092.github.io/apps node ui-test.js   tests the live site
//   node ui-test.js --shots                                 also saves screenshots/desktop.png and phone.png
// The clock is fixed to Fri 16 Oct 2026, 18:05 in Pakistan time so every answer can be checked exactly.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const C = require('./core.js');
const ROOT = path.resolve(__dirname, '..'), SLUG = 'workout-log-for-the-gym', KEY = SLUG + '.data', SKEY = SLUG + '.settings';
const SHOTS = process.argv.includes('--shots');
const T = s => new Date(s + '+05:00').getTime();
const NOW = T('2026-10-16T18:05:00');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; if (!cond) console.log('FAIL ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra).slice(0, 400) : '')); };

function serve() {
    const types = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml', png: 'image/png', webmanifest: 'application/manifest+json' };
    return new Promise(res => { const s = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0].replace(/^\/apps/, '')); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': types[f.split('.').pop()] || 'application/octet-stream' }); r.end(fs.readFileSync(f)); }).listen(0, () => res(s)); });
}

// Ali's history: Push on Mon 5 Oct and Mon 12 Oct, Pull on Wed 14 Oct, Legs on Thu 15 Oct
function seed() {
    const d = C.emptyData();
    C.addPreset(d, 'ppl');
    const id = n => C.findExByName(d, n).id;
    const kg = (w, r, at, x) => Object.assign({ w: Math.round(w * 100), u: 'kg', r, at }, x || {});
    const sess = (name, plan, start, end, entries) => d.sessions.push({ id: C.newId(d), name, plan: d.plans.find(p => p.name === plan).id, start: T(start), end: T(end), entries });
    const a = T('2026-10-05T18:10:00');
    sess('Push', 'Push', '2026-10-05T18:00:00', '2026-10-05T18:55:00', [
        { ex: id('Bench press'), sets: [kg(65, 5, a), kg(60, 6, a)], note: '' },
        { ex: id('Overhead press'), sets: [kg(35, 8, a), kg(35, 7, a)], note: '' },
        { ex: id('Dips'), sets: [{ r: 8, u: 'kg', at: a }], note: '' }]);
    const b = T('2026-10-12T18:20:00');
    sess('Push', 'Push', '2026-10-12T18:00:00', '2026-10-12T18:50:00', [
        { ex: id('Bench press'), sets: [kg(20, 10, b, { wu: true }), kg(60, 8, b), kg(60, 8, b), kg(60, 7, b)], note: 'Felt easy' },
        { ex: id('Overhead press'), sets: [kg(37.5, 6, b), kg(35, 8, b)], note: '' },
        { ex: id('Incline dumbbell press'), sets: [kg(22, 10, b), kg(22, 9, b)], note: '' },
        { ex: id('Lateral raise'), sets: [kg(8, 12, b), kg(8, 12, b)], note: '' },
        { ex: id('Dips'), sets: [{ r: 10, u: 'kg', at: b }, { r: 8, u: 'kg', at: b }], note: '' }]);
    const c = T('2026-10-14T07:20:00');
    sess('Pull', 'Pull', '2026-10-14T07:00:00', '2026-10-14T07:48:00', [
        { ex: id('Deadlift'), sets: [kg(100, 5, c), kg(100, 5, c)], note: '' },
        { ex: id('Pull-up'), sets: [{ r: 8, u: 'kg', at: c }, { r: 7, u: 'kg', at: c }], note: '' }]);
    const e = T('2026-10-15T19:20:00');
    sess('Legs', 'Legs', '2026-10-15T19:00:00', '2026-10-15T19:55:00', [
        { ex: id('Squat'), sets: [kg(80, 5, e), kg(80, 5, e), kg(80, 5, e)], note: '' },
        { ex: id('Plank'), sets: [{ t: 60, u: 'kg', at: e }], note: '' }]);
    return d;
}

(async () => {
    let srv, base = process.env.BASE;
    if (!base) { srv = await serve(); base = 'http://localhost:' + srv.address().port + '/apps'; }
    const URL = base + '/' + SLUG + '/';
    const browser = await chromium.launch();
    const errors = [], failed = [], requested = new Set();
    async function newPage(opts, now, init) {
        const ctx = await browser.newContext(Object.assign({ viewport: { width: 390, height: 844 }, acceptDownloads: true, timezoneId: 'Asia/Karachi', locale: 'en-GB', colorScheme: 'dark' }, opts || {}));
        await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new globalThis.URL(base).origin });
        await ctx.route(/goatcounter\.com|gc\.zgo\.at/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
        if (init) await ctx.addInitScript(init);
        const page = await ctx.newPage();
        await page.clock.install({ time: now || NOW });
        await page.clock.pauseAt(now || NOW);
        page.on('pageerror', e => errors.push(e.message));
        page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
        page.on('request', r => { if (r.url().startsWith(base)) requested.add(r.url().split('?')[0]); });
        page.on('response', r => { if (r.status() >= 400 && r.url().startsWith(base)) failed.push(r.status() + ' ' + r.url()); });
        await page.goto(URL, { waitUntil: 'load' });
        return { ctx, page };
    }
    async function seeded(opts, now, data, settings) {
        const r = await newPage(opts, now);
        await r.page.evaluate(([k, v, sk, sv]) => { localStorage.setItem(k, v); if (sv) localStorage.setItem(sk, sv); }, [KEY, JSON.stringify(data || seed()), SKEY, settings ? JSON.stringify(settings) : null]);
        await r.page.reload({ waitUntil: 'load' });
        return r;
    }
    const txt = (page, sel) => page.locator(sel).innerText();
    const exBox = (page, name) => page.locator('#s-ex > li.box', { has: page.locator('h3.box-name', { hasText: new RegExp('^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') }) });
    const stored = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
    async function log(page, name, f) {
        const b = exBox(page, name);
        if (f.w != null) await b.locator('input[id$="-w"]').first().fill(String(f.w));
        if (f.r != null) await b.locator('.log input[id$="-r"]').fill(String(f.r));
        if (f.t != null) await b.locator('.log input[id$="-t"]').fill(String(f.t));
        if (f.x != null) await b.locator('.log input[id$="-x"]').fill(String(f.x));
        if (f.wu) await b.locator('.log input[id$="-wu"]').check();
        await b.locator('.log-btn').click();
    }

    // ===== 1. first use: empty states and ready-made plans
    {
        const { ctx, page } = await newPage();
        ok('first use: ready-made plans offered', await page.locator('#first-use').isVisible());
        ok('first use: heading', (await txt(page, '#today-h')) === 'Start a workout');
        ok('first use: no week line', await page.locator('#week').isHidden());
        ok('first use: history empty text', await page.locator('#hist-empty').isVisible());
        ok('first use: progress empty text', await page.locator('#prog-empty').isVisible());
        ok('first use: own plan button says so', (await txt(page, '#new-plan')) === '+ Make my own plan');
        await page.click('[data-preset=ppl]');
        ok('preset: 3 plans', (await page.locator('#plans > li').count()) === 3);
        ok('preset: message', (await txt(page, '#today-msg')).includes('Added Push, Pull, Legs'));
        ok('preset: first-use hidden after', await page.locator('#first-use').isHidden());
        ok('preset: no Up next before any workout', (await page.locator('#plans .badge').count()) === 0);
        ok('preset: exercises listed in a plan', (await page.locator('#plans > li').first().innerText()).includes('Bench press · Overhead press'));
        ok('preset: not done yet group', (await txt(page, '#prog-later-btn')) === 'Show exercises not done yet (17)');
        await page.click('#prog-later-btn');
        ok('not done yet: list opens', (await page.locator('#prog-later-list > li').count()) === 17 && (await txt(page, '#prog-later-btn')).startsWith('Hide'));
        const pl = page.locator('#prog-later-list > li', { has: page.locator('h3', { hasText: /^Plank$/ }) });
        await pl.locator('button.tg').click();
        ok('not done yet: kind can still change', await pl.locator('select[id^="kd-"]').isEnabled() && (await pl.locator('.hint').count()) === 1);
        await pl.locator('select[id^="kd-"]').selectOption('body');
        ok('kind changed', (await stored(page)).exercises.find(e => e.name === 'Plank').kind === 'body');
        await page.click('#prog-msg .undo');
        ok('kind change undone', (await stored(page)).exercises.find(e => e.name === 'Plank').kind === 'time');
        await page.click('#today-msg .undo').catch(() => {});
        if (await page.locator('#plans > li').count()) { await page.click('#wipe'); }
        ok('preset: undo', (await page.locator('#plans > li').count()) === 0 && await page.locator('#first-use').isVisible());
        // empty workout: finish with nothing is not saved
        await page.click('#start-empty');
        ok('empty workout: add exercise opens', await page.locator('#s-add').isVisible());
        ok('empty workout: name', (await txt(page, '#today-h')) === 'Today’s workout: Workout');
        await page.click('#s-add-btn');
        ok('add exercise: blank refused', (await txt(page, '#s-new-err')).includes('Type the name'));
        await page.fill('#s-new', 'Goblet squat'); await page.click('#s-add-btn');
        ok('add exercise: added', (await exBox(page, 'Goblet squat').count()) === 1);
        await page.click('#s-finish');
        ok('finish with no sets: not saved', (await txt(page, '#today-msg')).includes('Nothing was logged'));
        ok('finish with no sets: history still empty', await page.locator('#hist-empty').isVisible());
        await ctx.close();
    }

    // ===== 2. plan editor: own plan, mistakes, order, delete
    {
        const { ctx, page } = await newPage();
        await page.click('#new-plan');
        await page.click('#p-save');
        ok('plan: name needed', (await txt(page, '#p-name-err')).includes('Give the plan a name'));
        await page.fill('#p-name', 'Arms');
        await page.click('#p-save');
        ok('plan: an exercise needed', (await txt(page, '#p-new-err')).includes('at least one exercise'));
        await page.fill('#p-new', 'Biceps curl'); await page.press('#p-new', 'Enter');
        await page.fill('#p-new', 'Chin-up'); await page.selectOption('#p-kind', 'body'); await page.click('#p-add-btn');
        await page.fill('#p-new', 'biceps CURL'); await page.click('#p-add-btn');
        ok('plan: same exercise twice refused', (await txt(page, '#p-new-err')).includes('already in this plan'));
        await page.fill('#p-new', 'Dead hang'); await page.selectOption('#p-kind', 'time'); await page.click('#p-add-btn');
        ok('plan: 3 exercises', (await page.locator('#p-ex > li').count()) === 3);
        await page.click('#p-ex > li:nth-child(3) .mv-up');
        ok('plan: move up', (await page.locator('#p-ex h4').allInnerTexts()).join('|') === '1. Biceps curl|2. Dead hang|3. Chin-up');
        ok('plan: first cannot move up', await page.locator('#p-ex > li:nth-child(1) .mv-up').isDisabled());
        await page.click('#p-ex > li:nth-child(2) button:has-text("Remove")');
        ok('plan: remove', (await page.locator('#p-ex > li').count()) === 2);
        // own rest for one exercise: Other, 75 s
        await page.selectOption('#pr-1', 'other'); await page.fill('#pr-1-s', '3'); await page.press('#pr-1-s', 'Tab');
        ok('plan: rest under 5 s refused', (await page.locator('#p-ex > li:nth-child(2) .err').innerText()).includes('5 to 900'));
        await page.fill('#pr-1-s', '75'); await page.press('#pr-1-s', 'Tab');
        await page.click('#p-save');
        ok('plan: saved', (await page.locator('#plans > li').count()) === 1 && (await txt(page, '#plans')).includes('Biceps curl · Chin-up'));
        const d = await stored(page);
        ok('plan: rest saved on the exercise', d.exercises.find(e => e.name === 'Chin-up').rest === 75 && d.exercises.find(e => e.name === 'Chin-up').kind === 'body');
        // second plan with the same name refused
        await page.click('#new-plan'); await page.fill('#p-name', 'arms'); await page.fill('#p-new', 'Dips'); await page.click('#p-save');
        ok('plan: same name refused', (await txt(page, '#p-name-err')).includes('already have a plan called'));
        await page.click('#p-cancel');
        ok('plan: cancel keeps one plan', (await page.locator('#plans > li').count()) === 1);
        await page.click('#plans button:has-text("Change")');
        ok('plan: change shows delete', await page.locator('#p-delete').isVisible());
        await page.fill('#p-name', 'Arm day'); await page.click('#p-save');
        ok('plan: renamed', (await txt(page, '#plans h3')) === 'Arm day');
        await page.click('#plans button:has-text("Change")'); await page.click('#p-delete');
        ok('plan: deleted', (await page.locator('#plans > li').count()) === 0);
        await page.click('#today-msg .undo');
        ok('plan: delete undone', (await txt(page, '#plans h3')) === 'Arm day');
        // a long pasted name stays inside the box
        await page.click('#new-plan'); await page.fill('#p-name', 'X'.repeat(80)); await page.fill('#p-new', 'Y'.repeat(90)); await page.click('#p-add-btn'); await page.click('#p-save');
        ok('plan: long names cut to the limit', (await stored(page)).plans.some(p => p.name.length === 40) && (await stored(page)).exercises.some(e => e.name.length === 60));
        await page.setViewportSize({ width: 320, height: 700 });
        ok('plan: long names no side scroll at 320', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await ctx.close();
    }

    // ===== 3. the main situation: Push on Friday 16 Oct
    {
        const { ctx, page } = await seeded();
        ok('week line', (await txt(page, '#week')) === 'This week: 3 workouts, 19 sets. Last workout: Legs, yesterday.');
        ok('Up next is Push (done longest ago)', (await page.locator('#plans > li', { has: page.locator('.badge', { hasText: 'Up next' }) }).locator('h3').innerText()) === 'Push');
        ok('plan last done', (await page.locator('#plans > li').first().innerText()).includes('Last done 4 days ago'));
        await page.click('text=Start Push');
        ok('workout heading', (await txt(page, '#today-h')) === 'Today’s workout: Push');
        ok('started line', (await txt(page, '#s-meta')).startsWith('Started 18:05 · 0 min · 0 sets'));
        const bench = exBox(page, 'Bench press');
        ok('last time for bench', (await bench.locator('.last').innerText()) === 'Last time, Mon 12 Oct: 60 kg: 8, 8, 7 reps', await bench.locator('.last').innerText());
        ok('last time note', (await bench.innerText()).includes('Your note: Felt easy'));
        ok('best for bench', (await bench.innerText()).includes('Your best: 60 kg × 8 (est. 1-rep max 76 kg)'));
        ok('boxes filled from last time', (await bench.locator('input[id$="-w"]').inputValue()) === '60' && (await bench.locator('.log input[id$="-r"]').inputValue()) === '8');
        ok('dips: bodyweight shows reps only', (await exBox(page, 'Dips').locator('.last').innerText()) === 'Last time, Mon 12 Oct: 10, 8 reps');
        ok('triceps: first time', (await exBox(page, 'Triceps pushdown').locator('.last').innerText()).startsWith('First time'));
        // warm-up
        await bench.locator('input[id$="-w"]').fill('20'); await bench.locator('.log input[id$="-r"]').fill('10');
        await bench.locator('input[id$="-wu"]').check();
        ok('warm-up: button says so', (await bench.locator('.log-btn').innerText()) === 'Log warm-up');
        await bench.locator('.log-btn').click();
        ok('warm-up logged as W', (await bench.locator('.set-n').first().innerText()) === 'W' && (await bench.locator('.set').first().innerText()).includes('warm-up'));
        ok('warm-up: next button is set 1', (await bench.locator('.log-btn').innerText()) === 'Log set 1');
        ok('rest timer after warm-up (the usual 1:30)', (await txt(page, '#rest-clock')) === '1:30');
        // first work set: 60 then + once = 62.5
        await bench.locator('input[id$="-w"]').fill('60');
        await bench.locator('.log button[aria-label^="More weight"]').click();
        ok('+ adds 2.5 kg', (await bench.locator('input[id$="-w"]').inputValue()) === '62.5');
        await bench.locator('.log input[id$="-r"]').fill('8');
        await page.clock.runFor(60000);
        await bench.locator('.log-btn').click();
        ok('new best: most reps at this weight', (await bench.locator('.set').nth(1).innerText()).includes('New best: most reps at this weight'), await bench.locator('.set').nth(1).innerText());
        ok('next set suggested from the last one', (await bench.locator('input[id$="-w"]').inputValue()) === '62.5');
        ok('meta counts sets', (await txt(page, '#s-meta')).includes('2 sets'));
        await page.clock.runFor(45000);
        ok('rest counts down', (await txt(page, '#rest-clock')) === '0:45', await txt(page, '#rest-clock'));
        ok('title shows rest', (await page.title()).startsWith('Rest 0:45'));
        await page.click('#rest-box button:has-text("+30 s")');
        ok('+30 s', (await txt(page, '#rest-clock')) === '1:15');
        // reload keeps the workout and the rest
        await page.reload({ waitUntil: 'load' });
        ok('reload: workout still open', (await txt(page, '#today-h')) === 'Today’s workout: Push');
        ok('reload: rest still running', (await txt(page, '#rest-clock')) === '1:15');
        await page.clock.runFor(76000);
        ok('rest over: timer gone', (await page.locator('#rest-box').count()) === 0);
        ok('rest over: message', (await exBox(page, 'Bench press').locator('.msg').innerText()).includes('Rest over'));
        // heavier single, then the bad inputs
        await log(page, 'Bench press', { w: '67,5', r: 3 });
        ok('comma decimal + heaviest ever', (await bench.locator('.set').nth(2).innerText()).includes('67.5 kg × 3') && (await bench.locator('.set').nth(2).innerText()).includes('New best: heaviest ever'));
        await page.click('#rest-box button:has-text("Skip rest")');
        ok('skip rest', (await page.locator('#rest-box').count()) === 0);
        for (const [w, r, msg] of [['', '8', 'Type the weight'], ['abc', '8', 'as a number'], ['-5', '8', 'below 0'], ['1001', '8', 'more than 1000 kg'], ['60', '', 'how many reps'], ['60', '0', '0 reps'], ['60', '8.5', 'whole number'], ['60', '1000', 'more than 999']]) {
            await log(page, 'Bench press', { w, r });
            ok('bad input ' + JSON.stringify([w, r]), (await bench.locator('.log .err').innerText()).includes(msg), await bench.locator('.log .err').innerText());
        }
        ok('bad inputs logged nothing', (await bench.locator('.set').count()) === 3);
        ok('bad input marked', (await bench.locator('.log input[aria-invalid="true"]').count()) === 1);
        // Enter key logs
        await bench.locator('input[id$="-w"]').fill('60'); await bench.locator('.log input[id$="-r"]').fill('8');
        await bench.locator('.log input[id$="-r"]').press('Enter');
        ok('Enter logs a set', (await bench.locator('.set').count()) === 4);
        // edit a set: 60 x 8 -> 60 x 7
        await bench.locator('.set').nth(3).locator('button:has-text("Edit")').click();
        await bench.locator('.set-edit input[id$="-r"]').fill('7');
        await bench.locator('.set-edit button:has-text("Save")').click();
        ok('edit a set', (await bench.locator('.set').nth(3).innerText()).includes('60 kg × 7'));
        await bench.locator('.msg .undo').click();
        ok('edit undone', (await exBox(page, 'Bench press').locator('.set').nth(3).innerText()).includes('60 kg × 8'));
        await exBox(page, 'Bench press').locator('.set').nth(3).locator('button:has-text("Edit")').click();
        await exBox(page, 'Bench press').locator('.set-edit button:has-text("Delete set")').click();
        ok('delete a set', (await exBox(page, 'Bench press').locator('.set').count()) === 3);
        await exBox(page, 'Bench press').locator('.msg .undo').click();
        ok('delete undone', (await exBox(page, 'Bench press').locator('.set').count()) === 4);
        await exBox(page, 'Bench press').locator('.set').nth(3).locator('button:has-text("Edit")').click();
        await exBox(page, 'Bench press').locator('.set-edit input[id$="-r"]').fill('0');
        await exBox(page, 'Bench press').locator('.set-edit button:has-text("Save")').click();
        ok('edit: 0 reps refused', (await exBox(page, 'Bench press').locator('.set-edit .err').innerText()).includes('0 reps'));
        await exBox(page, 'Bench press').locator('.set-edit').press('Escape');
        ok('edit: Escape cancels', (await exBox(page, 'Bench press').locator('.set-edit').count()) === 0);
        // note
        await exBox(page, 'Bench press').locator('button:has-text("+ Add a note")').click();
        await page.fill('#note-' + (await stored(page)).exercises.find(e => e.name === 'Bench press').id, 'Paused reps, seat 4');
        await page.press('textarea', 'Tab');
        // dips: bodyweight, then with extra weight
        await log(page, 'Dips', { r: 11 });
        ok('dips: new best most reps', (await exBox(page, 'Dips').locator('.set').first().innerText()).includes('11 reps') && (await exBox(page, 'Dips').locator('.set').first().innerText()).includes('New best: most reps'));
        await exBox(page, 'Dips').locator('button:has-text("+ Add extra weight")').click();
        ok('extra weight box opens (optional)', await exBox(page, 'Dips').locator('input[id$="-x"]').isVisible());
        await log(page, 'Dips', { r: 6, x: 10 });
        ok('dips with extra weight', (await exBox(page, 'Dips').locator('.set').nth(1).innerText()).includes('+10 kg × 6') && (await exBox(page, 'Dips').locator('.set').nth(1).innerText()).includes('most extra weight'));
        await log(page, 'Dips', { r: 5, x: '' });
        ok('extra weight left blank = bodyweight', (await exBox(page, 'Dips').locator('.set').nth(2).innerText()).includes('5 reps'));
        // overhead press: 37.5 x 6 again is not a best
        await log(page, 'Overhead press', { w: 37.5, r: 6 });
        ok('equal to before: no best', !(await exBox(page, 'Overhead press').locator('.set').first().innerText()).includes('New best'));
        // remove an exercise with no sets, undo
        await exBox(page, 'Lateral raise').locator('button:has-text("Remove from this workout")').click();
        ok('remove an exercise', (await exBox(page, 'Lateral raise').count()) === 0);
        await page.click('#today-msg .undo');
        ok('remove undone', (await exBox(page, 'Lateral raise').count()) === 1);
        // add an exercise for today and also to the plan
        await page.click('#s-add-open');
        await page.fill('#s-new', 'bench press'); await page.click('#s-add-btn');
        ok('add: already in workout refused', (await txt(page, '#s-new-err')).includes('already in this workout'));
        await page.fill('#s-new', 'Plank');
        ok('add: known exercise fixes its kind', await page.locator('#s-kind').isDisabled() && (await page.locator('#s-kind').inputValue()) === 'time');
        await page.fill('#s-new', 'Cable fly'); await page.check('#s-also'); await page.click('#s-add-btn');
        ok('add: new exercise in workout', (await exBox(page, 'Cable fly').count()) === 1);
        ok('add: also in Push plan', (await stored(page)).plans.find(p => p.name === 'Push').ex.includes((await stored(page)).exercises.find(e => e.name === 'Cable fly').id));
        await page.click('#s-add-open'); await page.fill('#s-new', 'Plank'); await page.click('#s-add-btn');
        await log(page, 'Plank', { t: '1:15' });
        ok('plank 1:15 longest hold', (await exBox(page, 'Plank').locator('.set').first().innerText()).includes('1:15') && (await exBox(page, 'Plank').locator('.set').first().innerText()).includes('New best: longest hold'));
        await log(page, 'Plank', { t: '0' });
        ok('plank 0 refused', (await exBox(page, 'Plank').locator('.log .err').innerText()).includes('0 seconds'));
        await log(page, 'Plank', { t: 'abc' });
        ok('plank text refused', (await exBox(page, 'Plank').locator('.log .err').innerText()).includes('like 45 or 1:30'));
        // finish 52 minutes after the start
        await page.clock.setSystemTime(T('2026-10-16T18:57:00'));
        await page.click('#s-finish');
        ok('done: heading', (await txt(page, '#today-h')) === 'Well done!');
        ok('done: length', (await txt(page, '#d-big')) === 'Push finished: 52 min.');
        const stats = await txt(page, '#d-stats');
        // work sets: bench 62.5x8, 67.5x3, 60x8 = 3; dips 3; OHP 1; plank 1 = 8. Lifted: 500 + 202.5 + 480 + 10x6 + 37.5x6 = 1467.5
        ok('done: stats', stats.replace(/\s+/g, ' ') === '4 exercises 8 sets 1,467.5 kg lifted in total', stats);
        const bests = await txt(page, '#d-bests');
        ok('done: bests', bests.includes('3 new bests') && bests.includes('Bench press: 67.5 kg × 3 (heaviest ever)') && bests.includes('Dips: +10 kg × 6 (most extra weight)') && bests.includes('Plank: 1:15 (longest hold, 1:15)'), bests);
        ok('done: skipped', (await txt(page, '#d-skipped')) === 'Skipped: Incline dumbbell press, Lateral raise, Triceps pushdown, Cable fly.');
        await page.click('#d-copy');
        const clip = await page.evaluate(() => navigator.clipboard.readText());
        ok('copy: text', clip.startsWith('Push, Fri 16 Oct 18:05 (52 min)\n8 sets, 1,467.5 kg lifted\n\nBench press\n  Warm-up: 20 kg × 10\n  Set 1: 62.5 kg × 8  (New best: most reps at this weight)') && clip.includes('Note: Paused reps, seat 4') && clip.includes('Skipped: Incline'), clip.slice(0, 300));
        await page.click('#d-undo');
        ok('not finished yet: back to the workout', (await txt(page, '#today-h')) === 'Today’s workout: Push' && (await exBox(page, 'Bench press').locator('.set').count()) === 4);
        await page.click('#s-finish'); await page.click('#d-close');
        ok('after finishing: start view', (await txt(page, '#today-h')) === 'Start a workout');
        ok('week line updated', (await txt(page, '#week')) === 'This week: 4 workouts, 27 sets. Last workout: Push, today.');
        ok('Up next moves to Pull', (await page.locator('#plans > li', { has: page.locator('.badge') }).locator('h3').innerText()) === 'Pull');
        // history
        const h0 = page.locator('#hist-list > li').first();
        ok('history: newest first', (await h0.locator('h3').innerText()) === 'Push' && (await h0.locator('.badge').innerText()) === 'Fri 16 Oct');
        ok('history: line', (await h0.locator('.box-sub').first().innerText()) === '18:05, 52 min · 8 sets · 1,467.5 kg lifted');
        ok('history: bests line', (await h0.locator('.best-line').innerText()) === '3 new bests: Bench press, Dips, Plank');
        ok('history: 5 workouts', (await page.locator('#hist-list > li').count()) === 5);
        // progress
        ok('progress: done today first', ['Bench press', 'Overhead press', 'Dips', 'Plank'].includes(await page.locator('#prog-list > li h3').first().innerText()));
        ok('progress: not done yet group', (await txt(page, '#prog-later-btn')) === 'Show exercises not done yet (9)');
        const benchP = page.locator('#prog-list > li', { has: page.locator('h3', { hasText: /^Bench press$/ }) });
        ok('progress: bench best', (await benchP.locator('.best-set').innerText()) === 'Best: 62.5 kg × 8 (est. 1-rep max 79.2 kg), Fri 16 Oct', await benchP.locator('.best-set').innerText());
        ok('progress: bench stats', (await benchP.locator('.box-sub').innerText()) === 'Last done today · 3 workouts · 8 sets');
        await benchP.locator('button.tg').click();
        ok('progress: chart', (await benchP.locator('svg.chart circle').count()) === 3 && (await benchP.locator('svg.chart').getAttribute('aria-label')).startsWith('Heaviest set per workout (kg): 65 on Mon 5 Oct, 67.5 on Fri 16 Oct'));
        ok('progress: per workout list', (await benchP.locator('.dl li').first().innerText()) === 'Fri 16 Oct: 62.5 kg × 8, 67.5 kg × 3, 60 kg × 8');
        ok('progress: kind locked once logged', await benchP.locator('select[id^="kd-"]').isDisabled());
        await benchP.locator('input[id^="rn-"]').fill('Overhead press'); await benchP.locator('button:has-text("Rename")').click();
        ok('rename: name taken refused', (await benchP.locator('.detail .err').first().innerText()).includes('already have an exercise'));
        await benchP.locator('input[id^="rn-"]').fill('Flat bench press'); await benchP.locator('button:has-text("Rename")').click();
        ok('rename: done, history kept', (await txt(page, '#prog-msg')).includes('Bench press is now called Flat bench press') && (await txt(page, '#hist-list')).includes('Flat bench press: 62.5 kg × 8'));
        await page.click('#prog-msg .undo');
        ok('rename undone', (await txt(page, '#hist-list')).includes('Bench press: 62.5 kg × 8'));
        // history copy, edit, delete
        await page.locator('#hist-list > li').first().locator('button:has-text("Copy")').click();
        ok('history copy', (await page.evaluate(() => navigator.clipboard.readText())).startsWith('Push, Fri 16 Oct 18:05 (52 min)'));
        await page.locator('#hist-list > li').first().locator('button:has-text("Edit")').click();
        ok('edit past: heading', (await txt(page, '#today-h')) === 'Change workout: Push, Fri 16 Oct');
        ok('edit past: fields', (await page.inputValue('#s-day')) === '2026-10-16' && (await page.inputValue('#s-from')) === '18:05' && (await page.inputValue('#s-to')) === '18:57');
        ok('edit past: no rest timer or meta', await page.locator('#s-meta').isHidden());
        await page.fill('#s-to', '19:10');
        await page.click('#s-finish');
        ok('edit past: saved', (await page.locator('#hist-list > li').first().locator('.box-sub').first().innerText()).startsWith('18:05, 1 h 5 min'));
        await page.click('#hist-msg .undo');
        ok('edit past: undo', (await page.locator('#hist-list > li').first().locator('.box-sub').first().innerText()).startsWith('18:05, 52 min'));
        // cancel throws changes away
        await page.locator('#hist-list > li').first().locator('button:has-text("Edit")').click();
        await exBox(page, 'Bench press').locator('.set').first().locator('button:has-text("Edit")').click();
        await exBox(page, 'Bench press').locator('.set-edit button:has-text("Delete set")').click();
        await page.click('#s-discard');
        ok('edit past: cancel restores', (await page.locator('#hist-list > li').first().locator('.box-sub').first().innerText()).includes('8 sets'));
        await page.locator('#hist-list > li').first().locator('button:has-text("Delete")').click();
        ok('history delete', (await page.locator('#hist-list > li').count()) === 4);
        await page.click('#hist-msg .undo');
        ok('history delete undone', (await page.locator('#hist-list > li').count()) === 5);
        // kg -> lb
        await page.selectOption('#unit', 'lb');
        ok('lb: history converted', (await page.locator('#hist-list > li').first().innerText()).includes('137.8 lb × 8'), await page.locator('#hist-list > li').first().innerText());
        await page.selectOption('#unit', 'kg');
        // second visit next day: Fri was today, now Sat
        await page.clock.setSystemTime(T('2026-10-17T09:00:00'));
        await page.reload({ waitUntil: 'load' });
        ok('next day: week line says yesterday', (await txt(page, '#week')).endsWith('Last workout: Push, yesterday.'));
        await page.click('text=Start Push');
        ok('next day: last time is Friday', (await exBox(page, 'Bench press').locator('.last').innerText()) === 'Last time, Fri 16 Oct: 62.5 kg × 8, 67.5 kg × 3, 60 kg × 8');
        ok('next day: plank (added to plan) kept? no, Cable fly is in the plan', (await exBox(page, 'Cable fly').count()) === 1);
        await page.click('#s-discard');
        ok('discard', (await txt(page, '#today-msg')).includes('Workout discarded'));
        await page.click('#today-msg .undo');
        ok('discard undone', (await txt(page, '#today-h')) === 'Today’s workout: Push');
        await page.click('#s-discard');
        await ctx.close();
    }

    // ===== 4. forgot to finish: the workout from last night
    {
        const d = seed();
        const sq = C.findExByName(d, 'Squat').id;
        d.sessions.push({ id: 900, name: 'Legs', plan: d.plans[2].id, start: T('2026-10-16T18:05:00'), end: null, entries: [{ ex: sq, sets: [{ w: 8250, u: 'kg', r: 5, at: T('2026-10-16T19:02:00') }], note: '' }] });
        d.live = { id: 900, rest: null }; d.nextId = 901;
        const { ctx, page } = await seeded(null, T('2026-10-17T08:00:00'), d);
        ok('overnight: asks', await page.locator('#s-overnight').isVisible() && (await txt(page, '#s-overnight-text')) === 'This workout started Fri 16 Oct at 18:05 and your last set was at 19:02. Did you forget to finish it?');
        ok('overnight: button', (await txt(page, '#s-overnight-finish')) === 'Finish it at 19:02');
        await page.click('#s-overnight-keep');
        ok('overnight: still training hides it', await page.locator('#s-overnight').isHidden());
        await page.reload({ waitUntil: 'load' });
        await page.click('#s-overnight-finish');
        ok('overnight: finished at the last set', (await txt(page, '#d-big')) === 'Legs finished: 57 min.');
        await ctx.close();
    }

    // ===== 5. a workout done without the app, and a future one refused
    {
        const { ctx, page } = await seeded();
        await page.click('#add-past');
        ok('past: heading', (await txt(page, '#today-h')) === 'Add a workout I did earlier');
        ok('past: yesterday 18:00-19:00', (await page.inputValue('#s-day')) === '2026-10-15' && (await page.inputValue('#s-from')) === '18:00' && (await page.inputValue('#s-to')) === '19:00');
        await page.click('#s-finish');
        ok('past: needs a set', (await txt(page, '#s-past-err')).includes('Log at least one set'));
        await page.selectOption('#s-plan', { label: 'Pull' });
        ok('past: plan fills exercises and name', (await exBox(page, 'Deadlift').count()) === 1 && (await page.inputValue('#s-name')) === 'Pull');
        await log(page, 'Deadlift', { w: 105, r: 5 });
        ok('past: no rest timer', (await page.locator('#rest-box').count()) === 0);
        ok('past: best compared with earlier workouts', (await exBox(page, 'Deadlift').locator('.set').first().innerText()).includes('heaviest ever'));
        await page.fill('#s-day', '2026-10-17');
        await page.click('#s-finish');
        ok('past: future refused', (await txt(page, '#s-past-err')).includes('in the future'));
        await page.fill('#s-day', '2026-10-13'); await page.fill('#s-from', '23:30'); await page.fill('#s-to', '00:20');
        await page.click('#s-finish');
        ok('past: after midnight', (await txt(page, '#hist-msg')).includes('Workout added: Pull, Tue 13 Oct') && (await txt(page, '#hist-list')).includes('23:30, 50 min'));
        await page.click('#add-past'); await page.click('#s-discard');
        ok('past: cancel adds nothing', (await page.locator('#hist-list > li').count()) === 5);
        // a past workout cannot be edited while one is in progress
        await page.click('text=Start Pull');
        await page.locator('#hist-list > li').first().locator('button:has-text("Edit")').click();
        ok('edit refused during a workout', (await txt(page, '#hist-msg')).includes('Finish today’s workout first'));
        await ctx.close();
    }

    // ===== 6. settings, backup, CSV, delete everything
    {
        const { ctx, page } = await seeded();
        await page.selectOption('#rest', 'other'); await page.fill('#rest-custom', '999'); await page.press('#rest-custom', 'Tab');
        ok('rest: 999 refused', (await txt(page, '#rest-err')).includes('5 to 900'));
        await page.fill('#rest-custom', '75'); await page.press('#rest-custom', 'Tab');
        ok('rest: 75 s saved', (await page.evaluate(k => JSON.parse(localStorage.getItem(k)).rest, SKEY)) === 75);
        await page.selectOption('#rest', '0');
        await page.selectOption('#unit', 'lb');
        await page.reload({ waitUntil: 'load' });
        ok('settings remembered', (await page.inputValue('#unit')) === 'lb' && (await page.inputValue('#rest')) === '0');
        await page.click('text=Start Push');
        const bench = exBox(page, 'Bench press');
        ok('lb: last time converted', (await bench.locator('.last').innerText()) === 'Last time, Mon 12 Oct: 132.3 lb: 8, 8, 7 reps');
        await bench.locator('input[id$="-w"]').fill('135'); await bench.locator('.log button[aria-label^="More weight"]').click();
        ok('lb: + adds 5', (await bench.locator('input[id$="-w"]').inputValue()) === '140');
        await bench.locator('.log-btn').click();
        ok('lb: logged in lb', (await stored(page)).sessions.slice(-1)[0].entries[0].sets[0].u === 'lb');
        ok('rest Off: no timer', (await page.locator('#rest-box').count()) === 0);
        const dipsP = page.locator('#prog-list > li', { has: page.locator('h3', { hasText: /^Dips$/ }) });
        await dipsP.locator('button.tg').click(); await dipsP.locator('select[id^="rs-"]').selectOption('45');
        ok('own rest saved', (await txt(page, '#prog-msg')).includes('Rest after each set of Dips: 45 s'));
        await log(page, 'Dips', { r: 9 });
        ok('own rest wins over the usual Off', (await txt(page, '#rest-clock')) === '0:45');
        await page.click('#s-finish'); await page.click('#d-close');
        await page.selectOption('#unit', 'kg');
        // CSV
        const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#csv')]);
        const csv = fs.readFileSync(await dl.path(), 'utf8');
        ok('csv: header', csv.startsWith('Date,Start,Workout,Exercise,Set,Warm-up,Weight (kg),Reps,Seconds,Note\r\n2026-10-05,18:00,Push,Bench press,1,,65,5,,'));
        ok('csv: lb set converted', csv.includes('2026-10-16,18:05,Push,Bench press,1,,63.5,8,,'), csv.split('\r\n').slice(-3));
        // backup and restore
        const [bk] = await Promise.all([page.waitForEvent('download'), page.click('#backup')]);
        const bkPath = await bk.path();
        ok('backup name', bk.suggestedFilename() === 'workout-log-backup-2026-10-16.json');
        await page.click('#wipe');
        ok('delete everything', (await page.locator('#hist-list > li').count()) === 0 && await page.locator('#first-use').isVisible());
        await page.click('#set-msg .undo');
        ok('delete everything undone', (await page.locator('#hist-list > li').count()) === 5);
        await page.click('#wipe');
        await page.setInputFiles('#restore-file', bkPath);
        await page.waitForFunction(() => document.getElementById('set-msg').textContent.startsWith('Restored'));
        ok('restore', (await txt(page, '#set-msg')).startsWith('Restored 5 workouts and 3 plans.') && (await page.locator('#hist-list > li').count()) === 5, [await txt(page, '#set-msg'), await page.locator('#hist-list > li').count()]);
        const badFile = path.join(require('os').tmpdir(), 'wl-bad.json'); fs.writeFileSync(badFile, '{"app":"other","data":{}}');
        await page.setInputFiles('#restore-file', badFile);
        await page.waitForFunction(() => document.getElementById('set-msg').textContent.includes('not a Workout Log'));
        ok('restore: wrong file refused', (await txt(page, '#set-msg')).includes('not a Workout Log backup') && (await page.locator('#hist-list > li').count()) === 5);
        await page.evaluate(() => { document.getElementById('set-msg').textContent = ''; });
        fs.writeFileSync(badFile, 'not json at all');
        await page.setInputFiles('#restore-file', badFile);
        await page.waitForFunction(() => document.getElementById('set-msg').textContent.includes('not a Workout Log'));
        ok('restore: broken file refused', (await txt(page, '#set-msg')).includes('not a Workout Log backup'));
        // theme switch
        const tg = page.locator('.theme-toggle');
        ok('theme switch present', await tg.count() === 1);
        await tg.click();
        const th = await page.evaluate(() => document.documentElement.dataset.theme);
        ok('theme switch changes the look', th === 'light' || th === 'dark');
        await ctx.close();
    }

    // ===== 7. damaged or blocked storage
    {
        const { ctx, page } = await newPage();
        await page.evaluate(k => localStorage.setItem(k, '{"exercises":5'), KEY);
        await page.reload({ waitUntil: 'load' });
        ok('damaged data: starts fresh with a message', (await txt(page, '#today-msg')).includes('could not be read') && await page.locator('#first-use').isVisible());
        await page.evaluate(k => localStorage.setItem(k, '{bad'), SKEY);
        await page.reload({ waitUntil: 'load' });
        ok('damaged settings: defaults', (await page.inputValue('#unit')) === 'kg');
        await ctx.close();
        const b = await newPage(null, null, () => { Storage.prototype.setItem = function () { throw new Error('blocked'); }; });
        await b.page.click('[data-preset=full]');
        ok('blocked storage: warning shown', await b.page.locator('#storage-warn').isVisible());
        ok('blocked storage: still works', (await b.page.locator('#plans > li').count()) === 1);
        await b.ctx.close();
    }

    // ===== 8. every screen size with real content, in dark and light
    for (const scheme of ['dark', 'light']) {
        for (const w of [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920]) {
            const { ctx, page } = await seeded({ viewport: { width: w, height: 900 }, colorScheme: scheme });
            const check = async (what) => {
                const r = await page.evaluate(() => {
                    const out = [], W = document.documentElement.clientWidth;
                    if (document.documentElement.scrollWidth > W + 1) out.push('scroll ' + document.documentElement.scrollWidth);
                    document.querySelectorAll('main *').forEach(e => { const b = e.getBoundingClientRect(); if (b.width && (b.right > W + 1 || b.left < -1) && !e.closest('.sr-only')) out.push((e.id || e.className || e.tagName) + ' ' + Math.round(b.left) + '-' + Math.round(b.right)); });
                    const hosts = [document.querySelector('main')];
                    hosts.forEach(h => { const k = [...h.children].filter(c => { const r = c.getBoundingClientRect(); return r.width > 4 && r.height > 4 && getComputedStyle(c).display !== 'none'; });
                        for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { const a = k[i].getBoundingClientRect(), b = k[j].getBoundingClientRect(); if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 4 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 4) out.push('overlap ' + (k[i].className || k[i].tagName) + '/' + (k[j].className || k[j].tagName)); } });
                    if (innerWidth <= 390) {
                        const c = [...document.querySelectorAll('main input:not([type=checkbox]), main select, main button, main textarea')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
                        for (let i = 0; i < c.length; i++) for (let j = i + 1; j < c.length; j++) { if (c[i].contains(c[j]) || c[j].contains(c[i])) continue; const a = c[i].getBoundingClientRect(), b = c[j].getBoundingClientRect(); if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2) out.push('controls ' + (c[i].id || c[i].className) + '/' + (c[j].id || c[j].className)); }
                        // placeholders and values fit their boxes
                        document.querySelectorAll('main input[type=text]').forEach(e => { const r = e.getBoundingClientRect(); if (!r.width) return; const s = getComputedStyle(e); const cv = document.createElement('canvas').getContext('2d'); cv.font = s.fontSize + ' ' + s.fontFamily; const tw = cv.measureText(e.value || e.placeholder).width; if (tw > r.width - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight) + 1) out.push('text cut ' + e.id + ' "' + (e.value || e.placeholder) + '"'); });
                    }
                    return out.slice(0, 5);
                });
                ok(scheme + ' ' + w + ' ' + what, !r.length, r);
            };
            await check('start');
            await page.click('text=Start Push');
            const bench = exBox(page, 'Bench press');
            await bench.locator('.log-btn').click();
            await exBox(page, 'Dips').locator('button:has-text("+ Add extra weight")').click();
            await exBox(page, 'Bench press').locator('.set').first().locator('button:has-text("Edit")').click();
            await page.click('#s-add-open');
            await page.locator('#prog-list > li').first().locator('button.tg').click();
            await page.click('#prog-later-btn'); await page.locator('#prog-later-list > li').first().locator('button.tg').click();
            for (const pos of [0, 0.5, 1]) { await page.evaluate(p => scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * p), pos); await check('workout scrolled ' + pos * 100 + '%'); }
            await page.click('#s-add-cancel');
            await page.click('#s-finish');
            await check('done');
            await page.click('#d-close');
            await page.click('#new-plan'); await page.fill('#p-new', 'Cable fly'); await page.click('#p-add-btn');
            await page.selectOption('#pr-0', 'other');
            await check('plan form');
            await page.click('#p-cancel');
            await page.click('#add-past'); await page.selectOption('#s-plan', { label: 'Legs' });
            await check('past workout form');
            await page.click('#s-discard');
            await page.click('#wipe');
            await check('after delete everything');
            await ctx.close();
        }
    }

    // ===== 9. Help
    for (const w of [320, 390, 820, 1280]) {
        const { ctx, page } = await newPage({ viewport: { width: w, height: 800 } });
        await page.click('.help-btn');
        const d = page.locator('dialog.help');
        const box = await d.boundingBox();
        ok('help ' + w + ': opens on screen', await d.evaluate(e => e.open) && box.x >= 0 && box.x + box.width <= w + 1 && (await d.locator('h2').innerText()) === 'How to use Workout Log for the Gym');
        await page.keyboard.press('Escape');
        ok('help ' + w + ': Escape closes', !(await d.evaluate(e => e.open)));
        await page.click('.help-btn'); await page.click('.help-close');
        ok('help ' + w + ': Got it closes', !(await d.evaluate(e => e.open)));
        const bb = await page.locator('.help-btn').boundingBox(), tb = await page.locator('.theme-toggle').boundingBox(), bk = await page.locator('a.back').boundingBox();
        const ov = (a, b) => Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 1 && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 1;
        ok('help ' + w + ': top bar buttons do not overlap', !ov(bb, tb) && !ov(bb, bk) && !ov(tb, bk) && bb.y < 120);
        await ctx.close();
    }

    // ===== screenshots
    if (SHOTS) {
        for (const [w, file, scale] of [[1280, 'desktop.png', 1], [390, 'phone.png', 2]]) {
            // two earlier leg days so the squat chart has a few weeks to show
            const d = seed(), sq = C.findExByName(d, 'Squat').id, legs = d.plans.find(p => p.name === 'Legs').id;
            [['2026-10-01T19:00:00', 7000], ['2026-10-08T19:00:00', 7500]].forEach(([st, w2]) => d.sessions.unshift({ id: C.newId(d), name: 'Legs', plan: legs, start: T(st), end: T(st) + 3000000, entries: [{ ex: sq, sets: [1, 2, 3].map(() => ({ w: w2, u: 'kg', r: 5, at: T(st) })), note: '' }] }));
            const { ctx, page } = await seeded({ viewport: { width: w, height: w > 600 ? 1000 : 1300 }, deviceScaleFactor: scale, colorScheme: 'dark' }, null, d);
            await page.click('text=Start Push');
            await log(page, 'Bench press', { w: 20, r: 10, wu: true });
            await log(page, 'Bench press', { w: 62.5, r: 8 });
            await page.clock.runFor(34000);
            const bench = exBox(page, 'Bench press');
            await bench.locator('.log input[id$="-r"]').fill('8');
            if (w > 600) {
                await page.locator('#prog-list > li', { has: page.locator('h3', { hasText: /^Squat$/ }) }).locator('button.tg').click().catch(() => {});
            }
            await page.evaluate(() => { document.activeElement && document.activeElement.blur(); window.scrollTo(0, 0); });
            await page.screenshot({ path: path.join(__dirname, 'screenshots', file) });
            await ctx.close();
        }
    }

    // ===== files
    const must = ['', 'style.css', 'core.js', 'script.js', '../help.js', '../theme.js'].map(f => new globalThis.URL(f, URL).href);
    must.forEach(u => ok('requested and served: ' + u.replace(base, ''), requested.has(u)));
    for (const f of ['sw.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'favicon.svg', '../help.js', '../theme.js', 'screenshots/desktop.png', 'screenshots/phone.png']) {
        const r = await fetch(new globalThis.URL(f, URL).href); ok('200 ' + f, r.status === 200, r.status);
    }
    ['icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'screenshots/desktop.png', 'screenshots/phone.png', 'LICENSE', 'README.md'].forEach(f => ok('file exists ' + f, fs.existsSync(path.join(__dirname, f))));
    ok('no page errors', !errors.length, errors.slice(0, 5));
    ok('no failed requests', !failed.length, failed.slice(0, 5));
    await browser.close();
    if (srv) srv.close();
    console.log(pass + ' passed, ' + fail + ' failed');
    process.exitCode = fail ? 1 : 0;
})();
