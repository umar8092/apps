// UI tests for the real situations: node ui-test.js  [--base https://umar8092.github.io/apps]
// Without --base it serves the repo locally. The clock is fixed to Wed 14 Oct 2026, 18:30.
const { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), SLUG = 'daily-habit-and-water-tracker', KEY = SLUG + '.state';
const args = process.argv.slice(2), bi = args.indexOf('--base'), LIVE = bi >= 0 ? args[bi + 1].replace(/\/$/, '') : null;
const seed = require('./seed.js')();
let pass = 0; const fails = [];
const ok = (c, name) => { if (c) pass++; else { fails.push(name); console.log('FAIL', name); } };
const eq = (got, want, name) => ok(JSON.stringify(got) === JSON.stringify(want), name + ' (got ' + JSON.stringify(got) + ')');
const types = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml', png: 'image/png', webmanifest: 'application/manifest+json' };
function serve() { return new Promise(res => { const s = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]).replace(/^\/apps/, ''); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': types[f.split('.').pop()] || 'application/octet-stream' }); r.end(fs.readFileSync(f)); }).listen(0, () => res(s)); }); }

(async () => {
    const srv = LIVE ? null : await serve();
    const base = LIVE || 'http://localhost:' + srv.address().port;
    const URL = base + '/' + SLUG + '/';
    const browser = await chromium.launch();
    const errors = [], bad = [];
    async function open(opts = {}) {
        const ctx = await browser.newContext({ locale: opts.locale || 'en-GB', viewport: { width: opts.w || 390, height: opts.h || 900 }, colorScheme: opts.scheme || 'dark', acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
        await ctx.route(/goatcounter\.com|gc\.zgo\.at/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
        const p = await ctx.newPage();
        p.on('pageerror', e => errors.push(e.message));
        p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
        p.on('response', r => { if (r.status() >= 400 && r.url().startsWith(base)) bad.push(r.status() + ' ' + r.url()); });
        await p.clock.install({ time: new Date(opts.time || '2026-10-14T18:30:00') });
        if (opts.state !== undefined) await p.addInitScript(([k, s]) => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem(k, s); } }, [KEY, opts.state]);
        if (opts.block) await p.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
        await p.goto(URL, { waitUntil: 'networkidle' });
        return { ctx, p };
    }
    const txt = (p, sel) => p.locator(sel).first().innerText();
    const status = (p, id) => p.locator('#h-' + id + ' .h-status').innerText();
    const ids = p => p.$$eval('.habit', l => l.map(e => e.id.slice(2)));

    // ---------- 1. first use: empty state, the form is open, optional fields hidden
    let { ctx, p } = await open();
    eq(await txt(p, '#sum-big'), 'Start with one habit', 'first use summary');
    ok(await p.isVisible('#empty'), 'empty box shown');
    ok(await p.isVisible('#form') && await p.isHidden('#add-open'), 'form open on first use');
    eq(await p.locator('.pick').count(), 12, 'quick picks');
    ok(await p.isHidden('#start-box') && await p.isVisible('#start-open'), 'started-on is optional and hidden');
    ok(await p.isHidden('#amount-box'), 'amounts hidden for a tick habit');
    ok(await p.isHidden('#edit-extra') && await p.isHidden('#f-delete'), 'edit-only controls hidden when adding');
    ok(await p.isHidden('#wk') && await p.isVisible('#week-empty'), 'week table empty state');
    ok(await p.isDisabled('#copy') && await p.isDisabled('#next'), 'copy disabled, no later day');
    // blank name
    await p.click('#f-save');
    eq(await txt(p, '#f-name-err'), 'Type a name for the habit, like Drink water.', 'blank name refused');
    ok(await p.evaluate(() => document.activeElement.id) === 'f-name', 'focus on the wrong field');

    // ---------- 2. the main situation: water, 8 glasses a day
    await p.click('.pick >> text=Drink water (8 glasses)');
    eq(await p.inputValue('#f-name'), 'Drink water', 'pick fills the name');
    ok(await p.isVisible('#amount-box'), 'pick shows the amount fields');
    eq([await p.inputValue('#f-target'), await p.inputValue('#f-unit'), await p.inputValue('#f-step')], ['8', 'glasses', '1'], 'pick fills goal');
    await p.click('#f-save');
    ok(await p.isHidden('#form') && await p.isVisible('#add-open'), 'form closes after saving');
    eq((await ids(p)).length, 1, 'one habit');
    let wid = (await ids(p))[0];
    eq(await status(p, wid), '0 of 8 glasses, 8 glasses to go', 'new water status');
    eq(await txt(p, '#sum-big'), '0 of 1 done today', 'summary 0 of 1');
    ok((await txt(p, '#list-msg')).startsWith('Added Drink water.'), 'added message with undo');
    for (let k = 0; k < 7; k++) await p.click('#h-' + wid + ' .step.plus');
    eq(await status(p, wid), '7 of 8 glasses, 1 glass to go', 'after 7 taps (singular glass)');
    eq(await txt(p, '#sum-meta'), 'Still to do: Drink water (1 glass to go).', 'still to do line');
    await p.click('#h-' + wid + ' .step.plus');
    eq(await status(p, wid), '8 glasses, goal reached', 'goal reached');
    eq(await txt(p, '#sum-big'), '1 of 1 done today', 'summary done');
    eq(await txt(p, '#sum-meta'), 'All done for today. Well done!', 'all done');
    eq(await txt(p, '#h-' + wid + ' .h-streak'), 'Streak: 1 day', 'streak 1 after first day');
    // undo the last tap
    await p.click('#h-' + wid + ' .undo');
    eq(await status(p, wid), '7 of 8 glasses, 1 glass to go', 'undo the last glass');
    await p.click('#h-' + wid + ' .step.minus');
    eq(await status(p, wid), '6 of 8 glasses, 2 glasses to go', 'minus one');
    // minus down to zero and disabled
    for (let k = 0; k < 6; k++) await p.click('#h-' + wid + ' .step.minus');
    ok(await p.isDisabled('#h-' + wid + ' .step.minus'), 'minus disabled at 0');
    // type an exact amount: words, decimal, negative, then 10,000 style and Enter
    await p.click('#h-' + wid + ' >> text=Type the amount');
    ok(await p.evaluate(id => document.activeElement.id === 'amt-' + id, wid), 'amount box focused');
    for (const [v, want] of [['abc', 'Type only the number, like 8.'], ['1.5', 'Use a whole number'], ['-2', 'The number cannot be below 0.'], ['', 'Type a number.'], ['99999999', 'The most is 1,000,000.']]) {
        await p.fill('#amt-' + wid, v); await p.press('#amt-' + wid, 'Enter');
        ok((await txt(p, '#amt-err-' + wid)).startsWith(want), 'amount refused: ' + JSON.stringify(v));
    }
    await p.fill('#amt-' + wid, '9'); await p.press('#amt-' + wid, 'Enter');
    eq(await status(p, wid), '9 glasses, goal reached', 'typed amount saved');
    await p.click('#h-' + wid + ' >> text=Type the amount'); await p.fill('#amt-' + wid, '3'); await p.press('#amt-' + wid, 'Escape');
    eq(await status(p, wid), '9 glasses, goal reached', 'Escape cancels typing');

    // ---------- 3. form checks for a counting habit
    await p.click('#add-open');
    ok(await p.evaluate(() => document.activeElement.id) === 'f-name', 'name focused when adding');
    await p.fill('#f-name', 'drink WATER');
    await p.click('#f-save');
    ok((await txt(p, '#f-name-err')).startsWith('You already have a habit called'), 'duplicate name refused');
    await p.fill('#f-name', 'Steps');
    await p.check('input[name=kind][value=count]');
    for (const [v, want] of [['', 'Goal each day: Type a number.'], ['0', 'Goal each day: The least is 1.'], ['1.5', 'Goal each day: Use a whole number'], ['-4', 'Goal each day: The number cannot be below 1.'], ['500000', 'Goal each day: The most is 100,000.'], ['8 glasses', 'Goal each day: Type only the number']]) {
        await p.fill('#f-target', v); await p.click('#f-save');
        ok((await txt(p, '#f-target-err')).startsWith(want), 'goal refused: ' + JSON.stringify(v));
    }
    await p.fill('#f-target', '10.000');
    await p.selectOption('#f-unit', 'other');
    ok(await p.isVisible('#unit-own-box'), 'own unit box shown');
    await p.click('#f-save');
    eq(await txt(p, '#f-unit-err'), 'Type what you count, like cigarettes.', 'own unit required');
    await p.selectOption('#f-unit', 'steps');
    await p.fill('#f-step', '0'); await p.click('#f-save');
    ok((await txt(p, '#f-step-err')).includes('The least is 1.'), 'step 0 refused');
    await p.fill('#f-step', '');
    await p.selectOption('#f-sched', 'days');
    eq(await p.$$eval('#f-days .dayb[aria-pressed=true]', l => l.map(b => b.textContent)), ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], 'some days starts with weekdays');
    for (const d of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']) await p.click('#f-days .dayb >> text=' + d);
    await p.click('#f-save');
    eq(await txt(p, '#f-days-err'), 'Tap at least one day.', 'no days refused');
    await p.click('#f-days .dayb >> text=Wed'); await p.click('#f-days .dayb >> text=Sat');
    await p.click('#start-open');
    await p.fill('#f-start', '2026-10-20'); await p.click('#f-save');
    eq(await txt(p, '#f-start-err'), 'Started on cannot be after today.', 'future start refused');
    await p.fill('#f-start', '2026-10-12');
    await p.click('#f-save');
    let sid = (await ids(p))[1];
    eq(await txt(p, '#h-' + sid + ' .h-plan'), '10,000 steps a day · Wed, Sat', 'steps saved: 10.000 read as ten thousand, empty step is 1');
    eq(await txt(p, '#h-' + sid + ' .step.plus'), '+ 1 step', 'step of 1, singular');

    // ---------- 4. tick habit, limit habit, times a week
    await p.click('#add-open'); await p.click('.pick >> text=Take vitamins'); await p.click('#f-save');
    let vid = (await ids(p))[2];
    eq(await status(p, vid), 'Not done yet', 'tick not done');
    await p.click('#h-' + vid + ' .tick');
    eq([await status(p, vid), await p.getAttribute('#h-' + vid + ' .tick', 'aria-pressed')], ['Done', 'true'], 'tick done');
    await p.click('#h-' + vid + ' .tick');
    eq(await status(p, vid), 'Not done yet', 'tick taken back');
    await p.click('#h-' + vid + ' .tick');
    await p.click('#add-open'); await p.click('.pick >> text=Coffee: no more than 2');
    ok(await p.isDisabled('#f-sched option[value=week]'), 'times a week not offered for a limit');
    eq(await txt(p, '#f-target-label'), 'Most each day', 'limit label');
    await p.click('#f-save');
    let cid = (await ids(p))[3];
    eq(await status(p, cid), '0 of 2 cups, 2 cups left', 'limit start');
    for (let k = 0; k < 3; k++) await p.click('#h-' + cid + ' .step.plus');
    eq(await status(p, cid), '3 cups, 1 cup over the limit', 'over the limit');
    ok(await p.locator('#h-' + cid + ' .h-status.bad').count() === 1 && await p.locator('#h-' + cid + ' .track.over').count() === 1, 'over the limit shown in red');
    await p.click('#h-' + cid + ' .step.minus'); await p.click('#h-' + cid + ' .step.minus');
    await p.click('#add-open'); await p.click('.pick >> text=Exercise 3 times a week');
    eq(await p.inputValue('#f-times'), '3', 'times a week pick');
    ok((await txt(p, '#sched-hint')).startsWith('Any days count. The week starts on Monday'), 'week hint');
    await p.click('#f-save');
    let eid = (await ids(p))[4];
    eq(await status(p, eid), 'Not done yet', 'exercise to do');
    eq(await txt(p, '#sum-big'), '3 of 5 done today', 'summary: water, vitamins and coffee (under the limit) done; steps and exercise to do');

    // ---------- 5. earlier day: yesterday. Habits added today are hidden there until Started on is set earlier.
    await p.click('#prev');
    eq(await txt(p, '#day-title'), 'Yesterday', 'yesterday title');
    ok(await p.isVisible('#past-note') && !(await p.isDisabled('#next')), 'past note and later-day button');
    eq(await status(p, sid), '0 of 10,000 steps', 'Tuesday is not planned for steps: no "to go"');
    ok(await p.locator('#h-' + sid + '.resting').count() === 1, 'rest day box dimmed');
    eq(await txt(p, '#hidden-note'), '4 habits started after Tue 13 Oct, so they are not shown. To fill in earlier days, tap Edit on the habit and set Started on earlier.', 'hidden habits explained');
    eq(await txt(p, '#sum-big'), 'Nothing planned', 'nothing planned yesterday');
    await p.click('#to-today');
    await p.click('#h-' + wid + ' >> text=Edit');
    eq(await p.inputValue('#f-start'), '2026-10-14', 'started on today');
    await p.fill('#f-start', '2026-10-12'); await p.click('#f-save');
    await p.click('#prev');
    await p.click('#h-' + wid + ' .step.plus');
    eq(await status(p, wid), '1 of 8 glasses, 7 glasses to go', 'yesterday logged separately');
    eq(await txt(p, '#sum-meta'), 'Not done: Drink water (7 glasses to go).', 'past day wording');
    await p.click('#prev'); await p.click('#prev'); // Sun 11 Oct, before the habits started
    eq(await txt(p, '#sum-big'), 'No habits on this day', 'before any habit');
    await p.click('#to-today');
    eq(await txt(p, '#day-title'), 'Today', 'back to today');
    ok(await p.isDisabled('#next'), 'no future days');
    // tap a day in the strip
    await p.click('#h-' + wid + ' .sd >> nth=1');
    eq(await txt(p, '#day-title'), 'Yesterday', 'strip jumps to that day');
    eq(await p.getAttribute('#h-' + wid + ' .sd >> nth=1', 'aria-current'), 'date', 'strip marks the day shown');
    ok(await p.isDisabled('#h-' + wid + ' .sd >> nth=3'), 'future day in strip disabled');
    await p.click('#to-today');

    // ---------- 6. skip a day
    await p.click('#h-' + eid + ' >> text=Skip this day');
    eq(await status(p, eid), 'Skipped today, does not break the streak', 'skip');
    eq(await txt(p, '#sum-big'), '3 of 4 done today', 'skipped habit not due');
    await p.click('#h-' + eid + ' >> text=Undo skip');
    eq(await status(p, eid), 'Not done yet', 'undo skip');

    // ---------- 7. edit: change the goal from today, then for earlier days too
    await p.click('#h-' + wid + ' >> text=Edit');
    eq(await txt(p, '#form-h'), 'Change Drink water', 'edit title');
    ok(await p.isVisible('#start-box') && await p.isVisible('#edit-extra') && await p.isVisible('#f-delete') && await p.isHidden('#picks-box'), 'edit shows start, extras and delete, no picks');
    await p.fill('#f-target', '10'); await p.click('#f-save');
    eq(await status(p, wid), '9 of 10 glasses, 1 glass to go', 'new goal today');
    await p.click('#prev');
    eq(await status(p, wid), '1 of 8 glasses, 7 glasses to go', 'yesterday keeps the old goal');
    await p.click('#to-today');
    await p.click('#h-' + wid + ' >> text=Edit');
    await p.fill('#f-target', '9'); await p.check('#f-all'); await p.click('#f-save');
    await p.click('#prev');
    eq(await status(p, wid), '1 of 9 glasses, 8 glasses to go', 'use for earlier days too');
    await p.click('#to-today');
    // rename to a long name with HTML in it: shown as text
    await p.click('#h-' + vid + ' >> text=Edit');
    const evil = '<img src=x onerror=alert(1)> Vitamin D and fish oil with breakfast every';
    await p.fill('#f-name', evil); await p.click('#f-save');
    eq(await txt(p, '#h-' + vid + ' .h-name'), evil.slice(0, 60).trim(), 'HTML shown as text, 60 characters at most');
    eq(await p.locator('#list img').count(), 0, 'no HTML injected');
    // Escape closes the form, Cancel keeps things
    await p.click('#h-' + vid + ' >> text=Edit'); await p.fill('#f-name', 'Changed'); await p.press('#f-name', 'Escape');
    ok(await p.isHidden('#form') && (await txt(p, '#h-' + vid + ' .h-name')).startsWith('<img'), 'Escape cancels edit');
    // move up / down
    await p.click('#h-' + eid + ' >> text=Edit');
    ok(await p.isDisabled('#f-down'), 'last habit cannot move down');
    await p.click('#f-up');
    eq((await ids(p))[3], eid, 'moved up');
    ok((await txt(p, '#form-msg')).startsWith('Moved up. It is number 4 of 5.'), 'move message');
    await p.click('#f-cancel');
    // delete with undo
    await p.click('#h-' + cid + ' >> text=Edit'); await p.click('#f-delete');
    eq((await ids(p)).includes(cid), false, 'deleted');
    ok((await txt(p, '#list-msg')).startsWith('Deleted Coffee and its history.'), 'delete message');
    await p.click('#list-msg .undo');
    eq((await ids(p)).includes(cid), true, 'delete undone');

    // ---------- 8. details, reminder, week table, share
    await p.click('#h-' + wid + ' >> text=Details');
    ok(await p.locator('#h-' + wid + ' .details .tile').count() === 4 && await p.locator('#h-' + wid + ' .gc').count() === 84, 'details tiles and 12-week grid');
    eq(await p.getAttribute('#h-' + wid + ' [data-fk^=det]', 'aria-expanded'), 'true', 'details expanded');
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#h-' + wid + ' >> text=Add reminder to my calendar')]);
    eq(dl.suggestedFilename(), 'drink-water-reminder.ics', 'reminder file name');
    const ics = fs.readFileSync(await dl.path(), 'utf8');
    ok(/DTSTART:20261014T090000/.test(ics) && /RRULE:FREQ=DAILY/.test(ics) && /BEGIN:VALARM/.test(ics), 'reminder content');
    eq(await p.locator('#wk-body tr').count(), 5, 'one row per habit');
    eq(await p.$$eval('#wk-head th', l => l.slice(1).map(t => t.innerText.replace(/\s+/g, ' '))), ['Mo 12', 'Tu 13', 'We 14', 'Th 15', 'Fr 16', 'Sa 17', 'Su 18'], 'week from Monday');
    await p.click('#copy');
    const clip = await p.evaluate(() => navigator.clipboard.readText());
    ok(clip.startsWith('My habits: week of Mon 12 Oct to Sun 18 Oct 2026') && clip.includes('Drink water (9 glasses a day, every day)') && clip.includes(URL_APP_CHECK()), 'copied text');
    function URL_APP_CHECK() { return 'https://umar8092.github.io/apps/daily-habit-and-water-tracker/'; }
    const href = await p.getAttribute('#email', 'href');
    ok(href.startsWith('mailto:?subject=') && decodeURIComponent(href).includes('Drink water') && href.length < 8000, 'email link with no address needed');
    await p.selectOption('#ws', '0');
    eq(await p.$$eval('#wk-head th', l => l[1].innerText.replace(/\s+/g, ' ')), 'Su 11', 'week from Sunday');
    await p.selectOption('#ws', '1');

    // ---------- 9. reload keeps everything, midnight moves to the new day
    const before = await ids(p);
    await p.reload({ waitUntil: 'networkidle' });
    eq(await ids(p), before, 'reload keeps the habits and order');
    eq(await status(p, wid), '9 glasses, goal reached', 'reload keeps today');
    await p.clock.runFor(6 * 3600 * 1000);
    eq(await txt(p, '#day-date'), 'Thu 15 Oct 2026', 'after midnight the app shows the new day');
    eq(await status(p, wid), '0 of 9 glasses, 9 glasses to go', 'new day starts empty');
    eq(await txt(p, '#h-' + wid + ' .h-streak'), 'Streak: 1 day', 'yesterday counted in the streak');

    // ---------- 10. backup, restore (bad and good file), delete all with undo
    const [bk] = await Promise.all([p.waitForEvent('download'), p.click('#backup')]);
    const backupText = fs.readFileSync(await bk.path(), 'utf8');
    ok(JSON.parse(backupText).app === SLUG && JSON.parse(backupText).habits.length === 5, 'backup file');
    const tmp = path.join(require('os').tmpdir(), 'habit-bad.json'), tmp2 = path.join(require('os').tmpdir(), 'habit-good.json');
    fs.writeFileSync(tmp, '{"hello": 1}'); fs.writeFileSync(tmp2, JSON.stringify(Object.assign({ app: SLUG }, seed)));
    const waitMsg = start => p.waitForFunction(t => document.querySelector('#set-msg').textContent.startsWith(t), start, { timeout: 5000 }).catch(() => {});
    await p.setInputFiles('#restore-file', tmp); await waitMsg('That file');
    ok((await txt(p, '#set-msg')).startsWith('That file is not a backup'), 'bad file refused');
    eq((await ids(p)).length, 5, 'nothing changed by a bad file');
    await p.setInputFiles('#restore-file', tmp2); await waitMsg('Restored');
    ok((await txt(p, '#set-msg')).startsWith('Restored 6 habits.'), 'good file restored');
    await p.click('#set-msg .undo');
    eq(await ids(p), before, 'restore undone');
    await p.click('#wipe');
    eq((await ids(p)).length, 0, 'delete all');
    ok(await p.isVisible('#form') && await p.isVisible('#empty'), 'back to first use');
    await p.click('#set-msg .undo');
    eq(await ids(p), before, 'delete all undone');
    await ctx.close();

    // US phones start the week on Sunday by default
    ({ ctx, p } = await open({ locale: 'en-US' }));
    await p.click('.pick >> text=Stretch'); await p.click('#f-save');
    eq([await p.inputValue('#ws'), await p.$$eval('#wk-head th', l => l[1].innerText.replace(/\s+/g, ' '))], ['0', 'Su 11'], 'en-US: weeks from Sunday');
    await ctx.close();

    // ---------- 11. saved data damaged, storage blocked
    ({ ctx, p } = await open({ state: '{not json' }));
    ok((await txt(p, '#storage-msg')).startsWith('Your saved habits could not be read'), 'corrupt data notice');
    eq(await p.evaluate(k => localStorage.getItem(k + '.broken'), KEY), '{not json', 'damaged copy kept');
    eq(await txt(p, '#sum-big'), 'Start with one habit', 'starts fresh');
    await ctx.close();
    ({ ctx, p } = await open({ block: true }));
    ok((await txt(p, '#storage-msg')).startsWith('This browser is not letting the app save'), 'blocked storage notice');
    await p.click('.pick >> text=Take vitamins'); await p.click('#f-save');
    eq(await p.locator('.habit').count(), 1, 'still works with storage blocked');
    await ctx.close();
    ({ ctx, p } = await open({ state: JSON.stringify({ habits: [{ id: 'x', name: 'Bad', versions: [{ from: 'never', kind: 'nope' }] }], log: 5 }) }));
    eq(await p.locator('.habit').count(), 0, 'invalid saved habit dropped');
    await ctx.close();

    // ---------- 12. realistic filled state: the seed
    ({ ctx, p } = await open({ state: JSON.stringify(seed), w: 1280 }));
    eq(await txt(p, '#sum-big'), '2 of 6 done today', 'seed summary');
    eq(await txt(p, '#h-water .h-streak'), 'Streak: 22 days', 'seed water streak');
    eq(await txt(p, '#h-cof .h-streak'), 'Streak: 5 days · Best: 7 days', 'seed coffee streak');
    eq(await txt(p, '#h-gym .h-streak'), 'Streak: 7 weeks', 'seed exercise weeks');
    eq(await p.$$eval('#wk-body .wk-s', l => l.map(e => e.textContent)), ['2 of 7 days', '2 of 7 days', '3 of 7 days', '1 of 3 times', '2 of 5 days', 'Kept 2 of 7 days'], 'week table totals');
    await p.click('#prev'); await p.click('#prev'); await p.click('#prev'); await p.click('#prev'); await p.click('#prev'); // Fri 9 Oct, ill
    eq(await status(p, 'water'), 'Skipped, does not break the streak', 'skipped day in the seed');
    eq(await txt(p, '#week-h'), 'Week of Mon 5 Oct', 'earlier week heading');
    await ctx.close();

    // ---------- 13. layout at every width, dark and light, filled, cleared, form with every optional field open
    const WIDTHS = [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920];
    for (const scheme of ['dark', 'light']) {
        ({ ctx, p } = await open({ state: JSON.stringify(seed), scheme }));
        for (const w of WIDTHS) {
            await p.setViewportSize({ width: w, height: 900 });
            for (const mode of ['filled', 'details', 'form', 'cleared']) {
                if (mode === 'details') { await p.click('#h-water [data-fk=det-water]'); await p.click('#h-walk >> text=Type the amount'); }
                if (mode === 'form') {
                    await p.click('#h-read >> text=Edit'); await p.selectOption('#f-unit', 'other'); await p.selectOption('#f-sched', 'days');
                }
                if (mode === 'cleared') { await p.click('#f-cancel'); await p.click('#wipe'); }
                const tag = scheme + ' ' + w + ' ' + mode;
                ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), tag + ': no horizontal scroll');
                const out = await p.evaluate(() => [...document.querySelectorAll('main *')].filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.right > innerWidth + 1 || r.left < -1) && getComputedStyle(e).position !== 'absolute'; }).map(e => e.className).slice(0, 3));
                eq(out, [], tag + ': nothing sticks out');
                if (w <= 390) {
                    const over = await p.evaluate(() => {
                        const els = [...document.querySelectorAll('main input:not([type=radio]):not([type=checkbox]):not([type=file]), main select, main button, main a.secondary')].filter(e => e.offsetParent && e.getBoundingClientRect().width);
                        const res = [];
                        for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
                            const a = els[i].getBoundingClientRect(), b = els[j].getBoundingClientRect();
                            if (els[i].contains(els[j]) || els[j].contains(els[i])) continue;
                            if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) res.push((els[i].id || els[i].className) + ' / ' + (els[j].id || els[j].className));
                        }
                        return res.slice(0, 3);
                    });
                    eq(over, [], tag + ': no controls overlap');
                    // placeholders and button labels fit
                    const clipped = await p.evaluate(() => {
                        const c = document.createElement('canvas').getContext('2d'), res = [];
                        document.querySelectorAll('main input[placeholder]').forEach(i => { if (!i.offsetParent) return; const cs = getComputedStyle(i); c.font = cs.fontSize + ' ' + cs.fontFamily; const room = i.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight); if (c.measureText(i.placeholder).width > room) res.push(i.id); });
                        document.querySelectorAll('main button').forEach(b => { if (b.offsetParent && b.scrollWidth > b.clientWidth + 1) res.push(b.className + ':' + b.textContent); });
                        return res;
                    });
                    eq(clipped, [], tag + ': placeholders and labels fit');
                }
                if (w >= 900) for (const pos of ['top', 'middle', 'bottom']) {
                    await p.evaluate(pos => scrollTo(0, pos === 'top' ? 0 : pos === 'middle' ? document.body.scrollHeight / 2 : document.body.scrollHeight), pos);
                    const ov = await p.evaluate(() => {
                        const res = [];
                        for (const host of [document.querySelector('main'), document.querySelector('.col-main'), document.querySelector('.col-side')]) {
                            const kids = [...host.children].filter(e => e.offsetParent && getComputedStyle(e).display !== 'contents');
                            for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
                                const a = kids[i].getBoundingClientRect(), b = kids[j].getBoundingClientRect();
                                if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) res.push(kids[i].className + ' / ' + kids[j].className);
                            }
                        }
                        return res;
                    });
                    eq(ov, [], tag + ' ' + pos + ': blocks do not overlap');
                }
            }
            await p.click('#set-msg .undo'); await p.evaluate(() => scrollTo(0, 0));
            if (await p.isVisible('#form')) await p.click('#f-cancel');
            if (await p.isVisible('#h-water .details')) await p.click('#h-water [data-fk=det-water]');
            if (await p.isVisible('#h-walk .type-row')) await p.click('#h-walk >> text=Close amount');
        }
        // help dialog at 4 widths, theme switch
        for (const w of [320, 390, 820, 1280]) {
            await p.setViewportSize({ width: w, height: 800 }); await p.evaluate(() => scrollTo(0, 0));
            await p.click('.help-btn');
            const box = await p.locator('dialog.help').boundingBox();
            ok(box && box.x >= 0 && box.x + box.width <= w + 1 && (await txt(p, 'dialog.help h2')).startsWith('How to use Daily Habit'), scheme + ' ' + w + ': help opens inside the screen');
            await p.keyboard.press('Escape');
            ok(!(await p.locator('dialog.help').evaluate(d => d.open)), scheme + ' ' + w + ': Escape closes help');
            await p.click('.help-btn'); await p.click('.help-close');
            ok(!(await p.locator('dialog.help').evaluate(d => d.open)), scheme + ' ' + w + ': Got it closes help');
            const tb = await p.evaluate(() => { const r = [...document.querySelectorAll('.topbar > *')].map(e => e.getBoundingClientRect()); return r.every((a, i) => r.every((b, j) => i >= j || !(a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1))) && r.every(a => a.top - r[0].top < 10); });
            ok(tb, scheme + ' ' + w + ': top bar buttons on one row, no overlap');
        }
        const t0 = await p.evaluate(() => document.documentElement.getAttribute('data-theme'));
        await p.click('.theme-toggle');
        const t1 = await p.evaluate(() => document.documentElement.getAttribute('data-theme'));
        ok(t1 && t1 !== t0, scheme + ': theme switch changes the look');
        await p.click('.theme-toggle');
        await ctx.close();
    }

    eq(errors, [], 'no console or page errors');
    eq(bad, [], 'no failed requests');
    if (srv) srv.close();
    await browser.close();
    console.log('\n' + pass + ' passed, ' + fails.length + ' failed' + (LIVE ? ' (against ' + LIVE + ')' : ''));
    if (fails.length) process.exitCode = 1;
})();
