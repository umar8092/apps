// Full page test with Playwright: drives the README situation and every row of the use-case matrix.
// Run: node ui-test.js            (local copy)    node ui-test.js https://umar8092.github.io/apps   (live site)
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), SLUG = 'interval-workout-timer-for-hiit-and-circuits', KEY = SLUG + '.data';
const LIVE = process.argv[2];
const T0 = new Date(2026, 9, 18, 19, 0, 0).getTime();   // Sun 18 Oct 2026, 7:00 pm
let pass = 0; const fails = [];
const ok = (c, name) => { if (c) pass++; else fails.push(name); };
const eq = (got, want, name) => ok(JSON.stringify(got) === JSON.stringify(want), name + ': got ' + JSON.stringify(got) + ', want ' + JSON.stringify(want));

function serve() {
    return new Promise(res => { const s = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]).replace(/^\/apps/, ''); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p);
        if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
        r.writeHead(200, { 'content-type': { html: 'text/html', js: 'text/javascript', css: 'text/css', svg: 'image/svg+xml', png: 'image/png', webmanifest: 'application/manifest+json' }[f.split('.').pop()] || 'application/octet-stream' }); r.end(fs.readFileSync(f)); })
        .listen(0, () => res(s)); });
}

(async () => {
    const srv = LIVE ? null : await serve();
    const URL = (LIVE ? LIVE.replace(/\/$/, '') : 'http://localhost:' + srv.address().port + '/apps') + '/' + SLUG + '/';
    const browser = await chromium.launch();
    const errors = [], bad = [];
    async function open(opts = {}) {
        const ctx = await browser.newContext({ viewport: { width: opts.w || 390, height: 900 }, colorScheme: opts.scheme || 'dark', locale: 'en-US', permissions: ['clipboard-read', 'clipboard-write'] });
        await ctx.route(/goatcounter\.com|gc\.zgo\.at/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
        const p = await ctx.newPage();
        p.on('pageerror', e => errors.push(e.message));
        p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
        p.on('response', r => { if (r.status() >= 400 && r.url().startsWith(URL.replace(SLUG + '/', ''))) bad.push(r.status() + ' ' + r.url()); });
        await p.clock.install({ time: opts.time || T0 });
        if (opts.data !== undefined) await p.addInitScript(([k, v]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, v); sessionStorage.setItem('seeded', '1'); } }, [KEY, opts.data]);
        if (opts.block) await p.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
        await p.goto(URL);
        await p.waitForSelector('#p-total', { state: 'attached' });
        await p.clock.pauseAt((opts.time || T0) + 2000);   // a fixed clock: 7:00:02 pm
        return { p, ctx };
    }
    const txt = (p, sel) => p.locator(sel).first().textContent().then(s => s.trim());
    const vis = (p, sel) => p.locator(sel).first().isVisible();
    const fill = async (p, sel, v) => { await p.fill(sel, v); await p.locator(sel).dispatchEvent('change'); };
    const tick = (p, ms) => p.clock.runFor(ms);
    const saved = p => p.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);

    // ---------- first use ----------
    let { p, ctx } = await open();
    eq(await txt(p, '#p-total'), '18:00', 'first use: Circuit loaded, total 18:00');
    eq(await txt(p, '#p-ends'), 'Ends at 7:18 PM if you start now (18 min).', 'first use: ends at');
    ok(await vis(p, '#h-empty'), 'first use: history empty hint');
    ok(await vis(p, '#saved-empty'), 'first use: no saved workouts hint');
    ok(await vis(p, '#moves-box'), 'first use: moves shown for Circuit');
    ok(!(await vis(p, '#run')), 'first use: no run card');
    eq(await p.locator('.move').count(), 4, 'first use: 4 moves');
    // presets and undo
    await p.click('.preset[data-id="tabata"]');
    eq(await txt(p, '#p-total'), '3:50', 'Tabata 3:50');
    ok((await txt(p, '#p-note')).includes('rest after the last round'), 'Tabata explains 3:50');
    ok(!(await vis(p, '#moves-box')) && await vis(p, '#show-moves'), 'Tabata: moves hidden behind + Add move names (optional)');
    ok(!(await vis(p, '#setrest-field')), 'one set: Rest between sets hidden');
    await p.click('#pick-msg .link');
    eq(await txt(p, '#p-total'), '18:00', 'Undo preset');
    await p.click('.preset[data-id="emom"]');
    eq([await txt(p, '#p-total'), await txt(p, '#p-note')], ['10:00', ''], 'EMOM 10:00, no rest note');
    await p.click('.preset[data-id="circuit"]');

    // ---------- editing ----------
    await fill(p, '#f-work', '45');
    eq([await p.inputValue('#f-work'), await txt(p, '#p-total')], ['0:45', '19:00'], '45 typed -> 0:45, total 19:00');
    await p.click('[data-for="f-work"][data-d="-1"]');
    eq([await p.inputValue('#f-work'), await txt(p, '#p-total')], ['0:40', '18:00'], '− on work');
    await p.click('[data-for="f-work"][data-d="1"]'); await p.click('[data-for="f-work"][data-d="-1"]');
    await fill(p, '#f-work', '');
    ok((await txt(p, '#e-work')).includes('Type the work time'), 'blank work: error');
    ok(await p.locator('#start').isDisabled(), 'blank work: Start disabled');
    eq(await txt(p, '#p-total'), '18:00', 'blank work: total keeps the last good one');
    await fill(p, '#f-work', '0');
    ok((await txt(p, '#e-work')).includes('at least 1 second'), 'zero work: error');
    await fill(p, '#f-rest', '-5');
    ok((await txt(p, '#e-rest')).includes('below 0'), 'negative rest: error');
    await fill(p, '#f-rounds', '2.5');
    ok((await txt(p, '#e-rounds')).includes('whole number'), 'decimal rounds: error');
    await fill(p, '#f-work', '1:30'); await fill(p, '#f-rest', '0'); await fill(p, '#f-rounds', '4');
    ok(!(await p.locator('#start').isDisabled()) && (await txt(p, '#e-work')) === '', 'fixed: Start enabled again');
    eq(await txt(p, '#p-total'), '25:00', '1:30 work, 0 rest: 180 + 3x(4x90) + 2x60 + 120 = 25:00');
    await fill(p, '#f-work', '60:00'); await fill(p, '#f-rounds', '100');
    ok((await txt(p, '#p-err')).includes('longest is 3 hours'), 'over 3 hours: error');
    await p.click('.preset[data-id="circuit"]');
    await p.click('[data-for="f-sets"][data-d="-1"]'); await p.click('[data-for="f-sets"][data-d="-1"]');
    eq([await p.inputValue('#f-sets'), await vis(p, '#setrest-field')], ['1', false], 'sets down to 1 hides set rest');
    await p.click('[data-for="f-sets"][data-d="-1"]');
    eq(await p.inputValue('#f-sets'), '1', 'sets never below 1');
    await p.click('.preset[data-id="circuit"]');
    // long and unsafe name
    await fill(p, '#f-name', '<img src=x onerror=alert(1)> ' + 'x'.repeat(80));
    eq((await txt(p, '#p-name')).length, 50, 'long name cut to 50');
    eq(await p.locator('#p-name img').count(), 0, 'name shown as text');
    await fill(p, '#f-name', '');
    ok(!(await vis(p, '#p-name')), 'no name: name line hidden');

    // ---------- moves ----------
    await p.fill('.move >> nth=3 >> .m-secs', '1:00'); await p.locator('.move >> nth=3 >> .m-secs').dispatchEvent('change');
    eq(await txt(p, '#p-total'), '19:00', 'Plank own time 1:00 adds 3 x 20 s');
    await p.fill('.move >> nth=3 >> .m-secs', 'abc');
    ok((await p.locator('.move >> nth=3 >> .err').innerText()).includes('seconds'), 'bad own time: error on that move');
    await p.fill('.move >> nth=3 >> .m-secs', '');
    await p.click('.move >> nth=1 >> .m-rm');
    eq(await p.locator('.move').count(), 3, 'remove a move');
    await p.click('#edit-msg .link');
    eq(await p.locator('.move .m-name').evaluateAll(a => a.map(i => i.value)), ['Squats', 'Push-ups', 'Lunges', 'Plank'], 'undo remove move');
    await p.click('#paste-open');
    await p.fill('#paste-text', '1. Burpees\n- Mountain climbers 30s\n\nJumping jacks');
    await p.click('#paste-add');
    eq(await p.locator('.move').count(), 7, 'paste adds 3 moves');
    eq(await p.inputValue('.move >> nth=5 >> .m-secs'), '0:30', 'pasted own time');
    ok((await txt(p, '#moves-note')).includes('7 moves but 4 rounds'), 'more moves than rounds: note');
    await p.click('#moves-note .link');
    eq([await p.inputValue('#f-rounds'), await vis(p, '#moves-note')], ['7', false], 'Make it 7 rounds');
    await p.click('#paste-open'); await p.click('#paste-add');
    eq(await txt(p, '#e-paste'), 'Type or paste at least one move, one per line.', 'empty paste: error');
    await p.click('#paste-cancel');
    await p.click('#clear-moves');
    ok(!(await vis(p, '#moves-box')) && (await txt(p, '#p-desc')).indexOf('named') < 0, 'remove all moves');
    await p.click('#edit-msg .link');
    eq(await p.locator('.move').count(), 7, 'undo remove all moves');
    await p.click('.preset[data-id="circuit"]');
    await p.click('[data-for="f-rounds"][data-d="1"]');   // 5 rounds, 4 moves: they repeat
    eq((await p.locator('#p-steps li').evaluateAll(a => a.map(li => [...li.children].map(c => c.textContent).join('|')))).find(x => x.includes('round 5')), '7:00|Squats · set 1, round 5|0:40', 'moves repeat: round 5 is Squats');
    await p.click('.preset[data-id="circuit"]');
    // Enter in a move name adds the next row
    await p.focus('.move >> nth=3 >> .m-name'); await p.keyboard.press('Enter');
    eq(await p.locator('.move').count(), 5, 'Enter on the last move adds one');
    ok(await p.evaluate(() => document.activeElement.id === 'm-name-4'), 'new move focused');
    await p.click('.preset[data-id="circuit"]');

    // ---------- My workouts ----------
    await p.click('#save');
    eq(await p.locator('.sbox b').allInnerTexts(), ['Full body circuit'], 'saved by its name');
    await fill(p, '#f-name', ''); await p.click('#save');
    eq((await p.locator('.sbox b').allInnerTexts())[0], 'My workout 1', 'no name: My workout 1');
    eq(await p.inputValue('#f-name'), 'My workout 1', 'name filled in');
    await fill(p, '#f-rounds', '5'); await p.click('#save');
    ok((await txt(p, '#plan-msg')).startsWith('Updated'), 'same name updates');
    eq(await p.locator('.sbox').count(), 2, 'no duplicate');
    await p.click('.preset[data-id="tabata"]');
    await p.click('.sbox >> nth=0 >> text=Load');
    eq([await p.inputValue('#f-rounds'), await txt(p, '#p-total')], ['5', '21:00'], 'Load a saved workout (180 + 3x(5x40 + 4x20) + 120 + 120)');
    await p.click('.sbox >> nth=0 >> text=Delete');
    eq(await p.locator('.sbox').count(), 1, 'Delete saved');
    await p.click('#pick-msg .link');
    eq(await p.locator('.sbox').count(), 2, 'undo Delete');
    await ctx.close();

    // ---------- the workout: README situation ----------
    ({ p, ctx } = await open());
    await fill(p, '#f-name', 'Evening circuit');
    await p.click('#start');
    ok(await vis(p, '#run') && !(await vis(p, '#pick')) && !(await vis(p, '#plan')), 'start: run shown, setup hidden');
    eq([await txt(p, '#r-phase'), await txt(p, '#r-time'), await txt(p, '#r-next')], ['Warm-up', '3:00', 'Next: Squats 0:40'], 'start: warm-up');
    eq(await txt(p, '#r-total'), '18:00 left of 18:00 · ends at 7:18 PM', 'start: total line');
    ok((await p.title()).startsWith('3:00 Warm-up'), 'tab title shows time');
    ok(await p.locator('#r-back').isDisabled(), 'back disabled at the very start');
    await tick(p, 180000);
    eq([await txt(p, '#r-phase'), await txt(p, '#r-name'), await txt(p, '#r-time'), await txt(p, '#r-where')], ['Work', 'Squats', '0:40', 'Round 1 of 4 · Set 1 of 3'], '3:00: Squats');
    await tick(p, 130000);   // 5:10 in
    eq([await txt(p, '#r-name'), await txt(p, '#r-time'), await txt(p, '#r-where'), await txt(p, '#r-next')], ['Lunges', '0:30', 'Round 3 of 4 · Set 1 of 3', 'Next: Rest 0:20'], '5:10: Lunges 0:30');
    eq(await txt(p, '#r-total'), '12:50 left of 18:00 · ends at 7:18 PM', '5:10: 12:50 left');
    // pause
    await p.click('#r-pause');
    eq([await txt(p, '#r-pause'), await txt(p, '#r-phase')], ['Resume', 'Work · paused'], 'paused');
    await tick(p, 60000);
    eq(await txt(p, '#r-time'), '0:30', 'paused: clock stands still');
    eq((await saved(p)).run.pausedAt != null, true, 'pause saved');
    await p.click('#r-pause');
    await tick(p, 10000);
    eq([await txt(p, '#r-time'), await txt(p, '#r-total')], ['0:20', '12:40 left of 18:00 · ends at 7:19 PM'], 'resumed, end moved by the pause');
    // reload mid-workout
    await p.reload(); await p.waitForSelector('#r-time');
    eq([await vis(p, '#run'), await txt(p, '#r-name'), await txt(p, '#r-time')], [true, 'Lunges', '0:20'], 'reload keeps the step');
    // skip, back, keyboard
    await p.click('#r-skip');
    eq([await txt(p, '#r-phase'), await txt(p, '#r-time')], ['Rest', '0:20'], 'skip to rest');
    await p.click('#r-back');
    eq([await txt(p, '#r-name'), await txt(p, '#r-time')], ['Lunges', '0:40'], 'back within 3 s: step before, full length');
    await tick(p, 5000);
    await p.click('#r-back');
    eq(await txt(p, '#r-time'), '0:40', 'back after 3 s: same step again');
    await p.evaluate(() => document.activeElement.blur());
    await p.keyboard.press('ArrowRight');
    eq(await txt(p, '#r-phase'), 'Rest', 'right arrow skips');
    await p.keyboard.press('Space');
    eq(await txt(p, '#r-pause'), 'Resume', 'Space pauses');
    await p.keyboard.press('Space');
    await p.keyboard.press('ArrowLeft');
    eq(await txt(p, '#r-name'), 'Lunges', 'left arrow goes back');
    // end early: keep going, then end
    await p.click('#r-end');
    ok((await txt(p, '#r-confirm-text')).includes('added to Workouts done'), 'end asks first');
    await p.click('#r-end-no');
    ok(await vis(p, '#r-end') && !(await vis(p, '#r-confirm')), 'Keep going');
    await p.click('#r-end'); await p.click('#r-end-yes');
    eq(await txt(p, '#d-title'), 'Workout ended', 'ended screen');
    ok((await txt(p, '#d-big')).endsWith('of 18:00'), 'ended: time of 18:00');
    eq(await p.locator('.hbox').count(), 1, 'ended after a minute: logged');
    ok((await txt(p, '.hbox .h-time')).includes('ended early'), 'logged as ended early');
    await p.click('#d-close');
    ok(await vis(p, '#plan') && !(await vis(p, '#run')), 'Back to my workout');
    eq((await saved(p)).run, null, 'run cleared');
    // under a minute is not logged
    await p.click('#start'); await tick(p, 20000);
    await p.click('#r-end'); ok((await txt(p, '#r-confirm-text')).includes('not added'), 'under a minute warning'); await p.click('#r-end-yes');
    eq(await p.locator('.hbox').count(), 1, 'under a minute: not logged');
    // run to the end
    await p.click('#d-again');
    ok(await vis(p, '#run-main'), 'Do it again starts');
    await tick(p, 1080000 + 500);
    eq([await txt(p, '#d-title'), await txt(p, '#d-big')], ['Workout done!', '18:00'], 'done at 18:00');
    ok((await txt(p, '#d-text')).includes('25 steps done'), 'done text');
    eq(await p.locator('.hbox').count(), 2, 'finished workout logged');
    eq(await txt(p, '#h-sum'), 'This week: 2 workouts, 23 min 25 s. Last 30 days: 2 workouts, 23 min 25 s.', 'history summary (5:25 ended early: 310 s + 10 s + 5 s, the 60 s pause not counted; plus 18:00)');
    await p.click('#d-msg .link');
    eq(await p.locator('.hbox').count(), 1, '"Do not add it" removes it');
    await p.click('#d-close');
    // history remove and undo, copy
    await p.click('.hbox .m-rm');
    ok(await vis(p, '#h-empty'), 'history remove');
    await p.click('#h-msg .link');
    eq(await p.locator('.hbox').count(), 1, 'history undo');
    await p.click('#h-copy');
    const clip = await p.evaluate(() => navigator.clipboard.readText()).catch(() => '');
    ok(clip.startsWith('Workouts done') && clip.includes('Evening circuit, 5:') && clip.includes('ended early'), 'copy the list: ' + clip.slice(0, 80));
    // settings remembered
    await p.uncheck('#s-countdown'); await p.check('#s-voice');
    await p.reload(); await p.waitForSelector('#p-total');
    eq([await p.isChecked('#s-countdown'), await p.isChecked('#s-voice'), await p.inputValue('#f-name')], [false, true, 'Evening circuit'], 'settings and workout remembered');
    await p.click('#test-sound');
    ok((await txt(p, '#sound-msg')).startsWith('Playing'), 'test sound');
    await ctx.close();

    // a run that finished while the page was closed is logged on return
    const blocks = [{ kind: 'work', secs: 120, name: 'Plank', round: 1, set: 1 }];
    ({ p, ctx } = await open({ data: JSON.stringify({ run: { startAt: T0 - 600000, pausedAt: null, began: T0 - 600000, pausedMs: 0, skippedMs: 0, blocks, total: 120, name: 'Core', rounds: 1, sets: 1 } }) }));
    eq([await txt(p, '#d-title'), await p.locator('.hbox').count()], ['Workout done!', 1], 'finished while away: done and logged');
    await ctx.close();
    // corrupt and blocked storage
    ({ p, ctx } = await open({ data: '{bad json' }));
    ok(await vis(p, '#damaged-warn') && (await txt(p, '#p-total')) === '18:00', 'corrupt data: warning and fresh start');
    await ctx.close();
    ({ p, ctx } = await open({ block: true }));
    ok(await vis(p, '#storage-warn'), 'blocked storage: warning');
    await p.click('#start'); await tick(p, 2000);
    eq(await txt(p, '#r-time'), '2:58', 'blocked storage: timer still works');
    await ctx.close();

    // ---------- layout: every width, filled and running, dark and light ----------
    const W = [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920];
    const hist = Array.from({ length: 10 }, (_, i) => ({ id: 'h' + i, at: T0 - (i + 1) * 86400000, name: i % 2 ? 'Tabata' : 'A rather long workout name for the morning', secs: 900, planned: 1080, full: i % 3 > 0 }));
    const filled = JSON.stringify({ v: 1, nextId: 50, current: { name: 'Evening circuit', warm: 180, work: 40, rest: 20, rounds: 4, sets: 3, setRest: 60, cool: 120, moves: [{ name: 'Squats', secs: null }, { name: 'Bulgarian split squats, left leg', secs: 45 }] },
        saved: [{ id: 's1', w: { name: 'Evening circuit', warm: 180, work: 40, rest: 20, rounds: 4, sets: 3, setRest: 60, cool: 120, moves: [] } }], history: hist });
    for (const scheme of ['dark', 'light']) {
        ({ p, ctx } = await open({ w: 320, scheme, data: filled }));
        for (const w of W) {
            for (const mode of ['setup', 'running']) {
                await p.setViewportSize({ width: w, height: 900 });
                if (mode === 'setup') { await p.click('#paste-open'); await p.fill('#paste-text', 'x'); } else { await p.click('#start'); await tick(p, 200000); }
                const tag = scheme + ' ' + w + ' ' + mode + ': ';
                ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), tag + 'no horizontal scroll');
                const out = await p.evaluate(() => [...document.querySelectorAll('main *')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1); }).map(e => e.id || e.className).slice(0, 3));
                eq(out, [], tag + 'nothing sticks out');
                for (const pos of [0, 0.5, 1]) {
                    await p.evaluate(x => scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * x), pos);
                    const o = await p.evaluate(() => { const r = []; document.querySelectorAll('main, .col-set, .col-plan, .run').forEach(h => { const k = [...h.children].filter(c => { const b = c.getBoundingClientRect(); return b.width > 4 && b.height > 4 && getComputedStyle(c).position !== 'absolute'; });
                        for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { const a = k[i].getBoundingClientRect(), b = k[j].getBoundingClientRect(); if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2) r.push((k[i].id || k[i].className) + '/' + (k[j].id || k[j].className)); } }); return r; });
                    eq(o, [], tag + 'no overlapping blocks at ' + pos * 100 + '%');
                }
                if (w <= 390) {
                    const c = await p.evaluate(() => { const k = [...document.querySelectorAll('main input, main button, main textarea')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }); const r = [];
                        for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { const a = k[i].getBoundingClientRect(), b = k[j].getBoundingClientRect(); if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2) r.push((k[i].id || k[i].className) + '/' + (k[j].id || k[j].className)); } return r; });
                    eq(c, [], tag + 'no overlapping controls');
                    // placeholders fit their boxes
                    const ph = await p.evaluate(() => [...document.querySelectorAll('main input[placeholder]')].filter(i => i.offsetWidth).filter(i => { const c = document.createElement('canvas').getContext('2d'); const cs = getComputedStyle(i); c.font = cs.fontSize + ' ' + cs.fontFamily; return c.measureText(i.placeholder).width > i.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) + 1; }).map(i => i.id || i.className));
                    eq(ph, [], tag + 'placeholders fit');
                }
                if (mode === 'running') { await p.click('#r-end'); await p.click('#r-end-yes'); await p.click('#d-close'); }
                else { await p.click('#paste-cancel'); }
            }
        }
        // theme switch
        const before = await p.evaluate(() => getComputedStyle(document.body).color);
        await p.locator('.theme-btn, [class*=theme]').first().click().catch(() => {});
        const after = await p.evaluate(() => getComputedStyle(document.body).color);
        ok(before !== after, scheme + ': light/dark switch changes the look');
        await ctx.close();
    }

    eq(errors, [], 'no console or page errors');
    eq(bad, [], 'no failed requests');
    await browser.close(); if (srv) srv.close();
    console.log(fails.length ? 'FAILED ' + fails.length + ' of ' + (pass + fails.length) + ':\n - ' + fails.join('\n - ') : 'All ' + pass + ' page checks passed (' + (LIVE ? 'live' : 'local') + ').');
    process.exit(fails.length ? 1 : 0);
})();
