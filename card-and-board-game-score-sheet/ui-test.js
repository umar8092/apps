// Drives the real page through every situation in the use-case matrix. Run from the repo root:
//   node card-and-board-game-score-sheet/ui-test.js            (local)
//   node card-and-board-game-score-sheet/ui-test.js --live     (https://umar8092.github.io/apps)
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), LIVE = process.argv.includes('--live');
let pass = 0, failed = 0;
const ok = (c, name) => { if (c) pass++; else { failed++; console.log('FAIL ' + name); } };
const eq = (got, want, name) => { const g = JSON.stringify(got), w = JSON.stringify(want); if (g === w) pass++; else { failed++; console.log('FAIL ' + name + '\n  got  ' + g + '\n  want ' + w); } };

(async () => {
    let srv, base = 'https://umar8092.github.io/apps';
    if (!LIVE) {
        srv = http.createServer((q, r) => { let f = decodeURIComponent(q.url.split('?')[0]); if (f.endsWith('/')) f += 'index.html'; const fp = path.join(ROOT, f);
            if (!fp.startsWith(ROOT) || !fs.existsSync(fp)) { r.writeHead(404); return r.end(); }
            r.writeHead(200, { 'Content-Type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' }[path.extname(fp)] || 'application/octet-stream' });
            fs.createReadStream(fp).pipe(r); }).listen(0);
        base = 'http://localhost:' + srv.address().port;
    }
    const url = base + '/card-and-board-game-score-sheet/';
    const b = await chromium.launch();
    const errors = [], bad = [];
    async function newPage(width, opts = {}) {
        const ctx = await b.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block', ...opts });
        await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base }).catch(() => {});
        await ctx.route(/goatcounter|zgo\.at/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
        const p = await ctx.newPage();
        p.on('pageerror', e => errors.push(width + ' ' + e.message));
        p.on('console', m => { if (m.type() === 'error') errors.push(width + ' console ' + m.text()); });
        p.on('response', r => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()); });
        await p.goto(url, { waitUntil: 'networkidle' });
        return p;
    }
    const text = (p, sel) => p.locator(sel).innerText();
    const vis = (p, sel) => p.locator(sel).isVisible();
    const boxes = p => p.locator('#entry-list input[data-pid]');
    async function round(p, values) { const ins = boxes(p); for (let i = 0; i < values.length; i++) if (values[i] !== null) await ins.nth(i).fill(String(values[i])); await p.click('#save-round'); }
    const totals = p => p.locator('#table .srow').evaluateAll(rows => rows.map(r => r.querySelector('.nm').textContent + ' ' + r.querySelector('.tot').textContent));
    async function setup(p, presetId, names) {
        if (presetId) await p.selectOption('#preset', presetId);
        for (let i = 0; i < names.length; i++) { if (i >= 2) await p.click('#add-name'); await p.fill('#name-' + i, names[i]); }
        await p.click('#start');
    }

    for (const width of [390, 1280]) {
        const p = await newPage(width);
        const W = '[' + width + '] ';

        // ---- first use, empty state ----
        ok(await vis(p, '#setup'), W + 'setup shown on first use');
        ok(!(await vis(p, '#standings')), W + 'no standings before a game');
        ok(!(await vis(p, '#limit-box')), W + 'no score limit asked for a game with no end (optional not forced)');
        ok(!(await vis(p, '#history-card')), W + 'no past games yet');
        eq(await p.locator('#names .pbox').count(), 2, W + 'two player boxes to start');
        ok(await p.locator('#names .small').first().isDisabled(), W + 'cannot remove below 2 players');

        // ---- start with blank names: Player 1, Player 2 ----
        await p.click('#start');
        eq(await p.locator('#table .nm').allInnerTexts(), ['Player 1', 'Player 2'], W + 'blank names become Player 1 and 2');
        eq(await text(p, '#headline'), 'Round 1', W + 'empty game headline');
        ok(!(await vis(p, '#copy')), W + 'no copy before any round');
        // all blank round refused
        await p.click('#save-round');
        ok((await text(p, '#entry-err')).includes('Type at least one score'), W + 'empty round refused');
        // back to setup
        await p.click('#new-game');
        ok(await vis(p, '#setup'), W + 'new game returns to setup');
        ok(!(await vis(p, '#history-card')), W + 'a game with no rounds is not saved in past games');

        // ---- duplicate names ----
        await p.fill('#name-0', 'Ali'); await p.fill('#name-1', ' ali ');
        await p.click('#start');
        ok((await text(p, '#setup-err')).includes('Two players are called'), W + 'duplicate names refused');

        // ---- the main situation: Pool Rummy 101 ----
        await p.fill('#name-0', 'Ammi'); await p.fill('#name-1', 'Abbu');
        await p.selectOption('#preset', 'pool101');
        eq(await p.locator('#win-low').getAttribute('aria-pressed'), 'true', W + 'pool rummy: lowest wins');
        eq(await p.inputValue('#limit'), '101', W + 'pool rummy: out at 101');
        eq(await text(p, '#limit-label'), 'Out at (points)', W + 'limit label for knock-out');
        await p.click('#add-name'); await p.fill('#name-2', 'Sara');
        await p.click('#add-name'); await p.fill('#name-3', 'Ali');
        await p.click('#start');
        eq(await text(p, '#rules-line'), 'Pool Rummy 101 · lowest score wins · out at 101, last one left wins', W + 'rules line');
        eq(await p.locator('#entry-list .chip').count(), 16, W + 'four quick buttons per player');
        // chips fill the box, preview shows the new total
        await p.locator('#entry-list .pbox').nth(0).locator('.chip').nth(0).click();
        await p.locator('#entry-list .pbox').nth(1).locator('.chip').nth(1).click();
        await p.locator('#entry-list .pbox').nth(2).locator('.chip').nth(2).click();
        await p.locator('#entry-list .pbox').nth(3).locator('.chip').nth(3).click();
        eq(await boxes(p).evaluateAll(i => i.map(x => x.value)), ['0', '20', '40', '80'], W + 'quick buttons fill Won 0, Drop 20, Middle drop 40, Full count 80');
        eq(await p.locator('#entry-list .preview').nth(3).innerText(), 'Total 0 → 80', W + 'preview of the new total');
        await p.click('#save-round');
        eq(await text(p, '#headline'), 'Ammi leads', W + 'round 1 leader');
        eq(await text(p, '#subline'), 'With 0 (lowest wins), 20 ahead of Abbu. After 1 round.', W + 'round 1 subline');
        eq(await text(p, '#entry-title'), 'Round 2 scores', W + 'next round title');
        ok(await vis(p, '#toast-undo'), W + 'undo offered after saving a round');
        // undo the round, then save it again
        await p.click('#toast-undo');
        eq(await text(p, '#entry-title'), 'Round 1 scores', W + 'undo removes the round');
        await round(p, [0, 20, 40, 80]);
        // decimals, letters and huge numbers refused
        await boxes(p).nth(0).fill('2.5');
        eq(await p.locator('#entry-list .field-err').first().innerText(), 'Whole numbers only', W + 'decimal refused');
        await p.click('#save-round');
        ok((await text(p, '#entry-err')).includes('Fix the score for Ammi'), W + 'save blocked with a bad score');
        await boxes(p).nth(0).fill('1000000');
        ok((await p.locator('#entry-list .field-err').first().innerText()).startsWith('Too big'), W + 'huge refused');
        await boxes(p).nth(0).fill(' 20 ');
        // round 2: Ali goes out at 110 (blank Abbu counts as 0)
        await boxes(p).nth(2).fill('20'); await boxes(p).nth(3).fill('30');
        await p.click('#save-round');
        eq(await totals(p), ['Ammi 20', 'Abbu 20', 'Sara 60', 'Ali 110'], W + 'totals after round 2 (blank = 0)');
        eq(await p.locator('#table .who small').allInnerTexts(), ['Can take 80 more', 'Can take 80 more', 'Can take 40 more', 'Out (101 or more)'], W + 'pool notes');
        eq(await text(p, '#headline'), 'Ammi and Abbu are level', W + 'level headline');
        eq(await boxes(p).count(), 3, W + 'Ali has no box after going out');
        ok((await text(p, '#entry-list .inactive')).includes('Out with 110'), W + 'Ali shown as out');
        // edit round 1: Sara had 45 not 40, then cancel an edit
        await p.locator('#rounds tbody tr').nth(0).getByRole('button', { name: 'Edit round 1' }).click();
        eq(await text(p, '#entry-title'), 'Editing round 1', W + 'editing title');
        eq(await boxes(p).count(), 4, W + 'editing round 1 includes Ali');
        await boxes(p).nth(2).fill('45');
        eq(await p.locator('#entry-list .preview').nth(2).innerText(), 'Total 60 → 65', W + 'edit preview');
        await p.click('#save-round');
        eq(await totals(p), ['Ammi 20', 'Abbu 20', 'Sara 65', 'Ali 110'], W + 'edit saved');
        await p.locator('#rounds tbody tr').nth(1).getByRole('button', { name: 'Edit round 2' }).click();
        await p.click('#cancel-edit');
        eq(await text(p, '#entry-title'), 'Round 3 scores', W + 'cancel editing');
        await p.locator('#rounds tbody tr').nth(0).getByRole('button', { name: 'Edit round 1' }).click();
        await boxes(p).nth(2).fill('40'); await p.click('#save-round');
        // delete a round and undo
        await p.getByRole('button', { name: 'Delete round 2' }).click();
        eq(await p.locator('#rounds tbody tr').count(), 1, W + 'round deleted');
        await p.click('#toast-undo');
        eq(await p.locator('#rounds tbody tr').count(), 2, W + 'delete undone');
        // typed but unsaved round survives a reload (phone locks mid-round)
        await boxes(p).nth(0).fill('15');
        await p.reload({ waitUntil: 'networkidle' });
        eq(await boxes(p).nth(0).inputValue(), '15', W + 'unsaved typing kept after reload');
        eq(await totals(p), ['Ammi 20', 'Abbu 20', 'Sara 60', 'Ali 110'], W + 'game restored after reload');
        await boxes(p).nth(0).fill('');
        // Ali rejoins at the highest score still in
        await p.getByRole('button', { name: 'Ali rejoins with 60 points' }).click();
        eq(await boxes(p).count(), 4, W + 'Ali back with a box');
        eq(await totals(p), ['Ammi 20', 'Abbu 20', 'Sara 60', 'Ali 60'], W + 'Ali rejoined at 60');
        // round 3 ends the game: Abbu last one in
        await round(p, [90, 10, 50, 45]);
        eq(await text(p, '#headline'), 'Abbu wins!', W + 'winner');
        eq(await text(p, '#subline'), 'Last player in, with 30.', W + 'winner subline');
        ok(!(await vis(p, '#entry')), W + 'no entry when the game is over');
        ok(await vis(p, '#again'), W + 'play again offered');
        ok(!(await vis(p, '#keep-playing')), W + 'no keep playing when everyone else is out');
        // copy and email
        await p.click('#copy'); await p.waitForFunction(() => document.getElementById('toast-text').textContent.startsWith('Scores'), null, { timeout: 3000 }).catch(() => {});
        const tt = await text(p, '#toast-text'); ok(tt.startsWith('Scores copied'), W + 'copy confirmation: ' + tt);
        const mail = await p.getAttribute('#mail', 'href');
        ok(mail.startsWith('mailto:?subject=Pool%20Rummy%20101%20scores&body=') && decodeURIComponent(mail).includes('1. Abbu: 30'), W + 'email with no recipient, summary written');
        // play again, same players: history and wins tally
        await p.click('#again');
        eq(await p.locator('#rounds tbody tr').count(), 0, W + 'new game has no rounds');
        eq(await p.locator('#table .nm').allInnerTexts(), ['Ammi', 'Abbu', 'Sara', 'Ali'], W + 'same players');
        ok(await vis(p, '#history-card'), W + 'past games shown');
        eq(await text(p, '#tally'), 'Wins so far: Abbu 1.', W + 'wins tally');
        ok((await text(p, '#history')).includes('Winner: Abbu'), W + 'history entry');
        await p.click('#toast-undo');
        eq(await text(p, '#headline'), 'Abbu wins!', W + 'undo play again restores the finished game');
        ok(!(await vis(p, '#history-card')), W + 'and removes the history entry');
        await p.click('#again');

        // ---- late joiner, rename, left the table, remove with undo ----
        await round(p, [10, 20, 0, 40]);
        await p.click('#add-late');
        eq(await p.inputValue('#late-start'), 'high', W + 'pool rummy late joiner starts at the highest score');
        ok(!(await vis(p, '#late-custom-box')), W + 'custom start hidden until chosen');
        await p.click('#late-add');
        ok((await text(p, '#late-err')).includes('name'), W + 'late joiner needs a name');
        await p.fill('#late-name', 'Hamza'); await p.selectOption('#late-start', 'custom'); await p.fill('#late-custom', '150');
        await p.click('#late-add');
        ok((await text(p, '#late-err')).includes('already out'), W + 'cannot join already out');
        await p.selectOption('#late-start', 'high'); await p.click('#late-add');
        ok((await totals(p)).includes('Hamza 40'), W + 'Hamza joined at 40');
        eq(await p.locator('#rounds thead th').allInnerTexts().then(a => a.slice(1, 6)), ['Ammi', 'Abbu', 'Sara', 'Ali', 'Hamza'], W + 'table column for Hamza');
        eq(await p.locator('#rounds tbody tr').first().locator('td').nth(4).innerText(), '–', W + 'Hamza did not play round 1');
        await p.getByRole('button', { name: 'Edit player Sara' }).click();
        await p.fill('#entry-list .popts-panel:visible input', 'Sara Baji');
        await p.locator('#entry-list .popts-panel:visible').getByRole('button', { name: 'Save name' }).click();
        ok((await p.locator('#table .nm').allInnerTexts()).includes('Sara Baji'), W + 'renamed');
        await p.getByRole('button', { name: 'Edit player Ali' }).click();
        await p.locator('#entry-list .popts-panel:visible').getByRole('button', { name: 'Left the table' }).click();
        ok((await text(p, '#table')).includes('Left the table'), W + 'Ali left the table');
        eq(await boxes(p).count(), 4, W + 'no box for a player who left');
        await p.locator('#entry-list .inactive').getByRole('button', { name: 'Back at the table' }).first().click();
        eq(await boxes(p).count(), 5, W + 'back at the table');
        await p.getByRole('button', { name: 'Edit player Hamza' }).click();
        await p.locator('#entry-list .popts-panel:visible').getByRole('button', { name: 'Remove from game' }).click();
        ok(!(await p.locator('#table .nm').allInnerTexts()).includes('Hamza'), W + 'Hamza removed');
        await p.click('#toast-undo');
        ok((await p.locator('#table .nm').allInnerTexts()).includes('Hamza'), W + 'remove undone');

        // ---- change rules during a game: Pool Rummy 151 is house rules ----
        await p.click('#rules-toggle');
        ok(await vis(p, '#rules-done'), W + 'rules editable during a game');
        await p.fill('#limit', '0');
        await p.click('#rules-done');
        eq(await text(p, '#limit-err'), 'Must be 1 or more', W + 'bad limit refused');
        await p.fill('#limit', '151'); await p.click('#rules-done');
        eq(await text(p, '#rules-line'), 'Pool Rummy (house rules) · lowest score wins · out at 151, last one left wins', W + 'house rules');

        // ---- New game keeps the players, custom game with negatives, end now, tie, tie-break ----
        await p.click('#new-game');
        ok((await text(p, '#history')).includes('Not finished'), W + 'unfinished game saved as not finished');
        eq(await p.inputValue('#name-0'), 'Ammi', W + 'setup keeps the players');
        for (let i = 4; i >= 2; i--) await p.locator('#names .pbox').nth(i).getByRole('button', { name: 'Remove' }).click();
        await p.selectOption('#preset', 'custom');
        eq(await p.locator('#win-high').getAttribute('aria-pressed'), 'true', W + 'custom: highest wins');
        await p.click('#start');
        await boxes(p).nth(0).fill('30'); await p.locator('#entry-list .sign').nth(0).click();
        eq(await boxes(p).nth(0).inputValue(), '-30', W + 'minus button makes it negative');
        await boxes(p).nth(1).fill('-30'); await p.click('#save-round');
        eq(await totals(p), ['Ammi -30', 'Abbu -30'], W + 'negative totals');
        await p.click('#end-now');
        eq(await text(p, '#headline'), 'Tie: Ammi and Abbu', W + 'end now with a tie');
        eq(await text(p, '#keep-playing'), 'Play a tie-break round', W + 'tie-break offered');
        await p.click('#keep-playing');
        await round(p, [5, 0]); await p.click('#end-now');
        eq(await text(p, '#headline'), 'Ammi wins!', W + 'tie broken');

        // ---- Uno: first to 500 ends the game by itself ----
        await p.click('#new-game'); await p.selectOption('#preset', 'uno'); await p.click('#start');
        await round(p, [250, 0]); eq(await p.locator('#table .who small').first().innerText(), '250 to reach 500', W + 'uno note');
        await round(p, [260, 40]);
        eq(await text(p, '#headline'), 'Ammi wins!', W + 'uno ends at 510');
        eq(await text(p, '#subline'), 'Won with 510, 470 ahead of Abbu.', W + 'uno subline');
        await p.click('#keep-playing');
        ok(await vis(p, '#entry'), W + 'keep playing past the target');

        // ---- 12 players max, very long names ----
        await p.click('#new-game');
        for (let i = 2; i < 12; i++) { await p.click('#add-name'); await p.fill('#name-' + i, 'Player with a long name no. ' + String(i).padStart(2, '0')); }
        ok(!(await vis(p, '#add-name')), W + 'add hidden at 12 players');
        await p.click('#start');
        eq(await p.locator('#table .srow').count(), 12, W + '12 players');
        await round(p, Array(12).fill(7));
        eq(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, W + 'no horizontal scroll with 12 long names');

        // ---- clear past games with undo ----
        await p.click('#clear-history');
        ok(!(await vis(p, '#history-card')), W + 'past games cleared');
        await p.click('#toast-undo');
        ok(await vis(p, '#history-card'), W + 'clear undone');

        // ---- light / dark switch ----
        const before = await p.evaluate(() => getComputedStyle(document.body).backgroundImage);
        await p.click('.theme-toggle');
        ok(await p.evaluate(() => !!document.documentElement.dataset.theme), W + 'theme switch sets data-theme');
        ok(before !== await p.evaluate(() => getComputedStyle(document.body).backgroundImage), W + 'theme switch changes the look');
        await p.close();
    }

    // ---- corrupt saved state and blocked storage ----
    {
        const p = await newPage(390);
        await p.evaluate(() => { localStorage.setItem('card-and-board-game-score-sheet.state', '{"mode":"game","game":{"players":"x"}}'); localStorage.setItem('card-and-board-game-score-sheet.history', '[{"title":5}]'); });
        await p.reload({ waitUntil: 'networkidle' });
        ok(await vis(p, '#setup'), 'corrupt game: starts fresh at setup');
        await p.evaluate(() => localStorage.setItem('card-and-board-game-score-sheet.state', JSON.stringify({ mode: 'game', game: { presetId: 'uno', high: true, end: 'reach', limit: 500, players: [{ id: 'a', name: 'A' }, { id: 'b', name: '<img src=x onerror=alert(1)>' }], rounds: [{ scores: { a: 'x', b: 5 } }] } })));
        await p.reload({ waitUntil: 'networkidle' });
        eq(await totals(p), ['<img src=x onerror=alert(1)> 5', 'A 0'], 'restored game cleaned, names shown as text');
        await p.close();
        const ctx = await b.newContext({ viewport: { width: 390, height: 800 } });
        await ctx.route(/goatcounter|zgo\.at/, r => r.fulfill({ status: 200, body: '' }));
        await ctx.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
        const q = await ctx.newPage(); const errs = []; q.on('pageerror', e => errs.push(e.message));
        await q.goto(url); await q.click('#start'); await round(q, [3, 4]);
        eq(await totals(q), ['Player 2 4', 'Player 1 3'], 'works with storage blocked');
        ok(await q.locator('#storage-warn').isVisible(), 'storage blocked warning stays on screen');
        eq(errs, [], 'no errors with storage blocked');
        await ctx.close();
    }

    // ---- layout at every width with a filled-in game, the cleared state, and on phones every option open ----
    for (const scheme of ['dark', 'light']) {
        const p = await newPage(390, { colorScheme: scheme });
        await setup(p, 'pool101', ['Ammi', 'Abbu', 'Sara', 'Ali Hassan Raza Khan the Elder']);
        await round(p, [0, 20, 40, 80]); await round(p, [20, 0, 20, 30]);
        for (const w of [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920]) {
            await p.setViewportSize({ width: w, height: 900 });
            for (const state of ['game', 'options', 'over', 'setup']) {
                if (state === 'options') { await p.locator('#entry-list .popts .link').first().click(); await p.click('#add-late'); }
                if (state === 'over') { await p.click('#end-now'); }
                if (state === 'setup') { await p.click('#new-game'); }
                const T = '[' + scheme + ' ' + w + ' ' + state + '] ';
                ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), T + 'no horizontal scroll');
                const out = await p.evaluate(() => [...document.querySelectorAll('.app *')].filter(e => { const r = e.getBoundingClientRect(); return r.width && getComputedStyle(e).position !== 'fixed' && !e.closest('#rounds-scroll') && (r.right > innerWidth + 1 || r.left < -1); }).length);
                eq(out, 0, T + 'nothing sticks out');
                for (const pos of [0, 0.5, 1]) {
                    await p.evaluate(x => scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * x), pos);
                    const o = await p.evaluate(() => { const k = [...document.querySelector('.app').children].filter(c => { const r = c.getBoundingClientRect(), cs = getComputedStyle(c); return r.width > 4 && r.height > 4 && cs.position !== 'fixed'; }); let n = 0;
                        for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { const a = k[i].getBoundingClientRect(), c = k[j].getBoundingClientRect(); if (Math.min(a.right, c.right) - Math.max(a.left, c.left) > 4 && Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top) > 4) n++; } return n; });
                    eq(o, 0, T + 'no overlapping blocks at scroll ' + pos);
                }
                if (w <= 390) {
                    const c = await p.evaluate(() => { const k = [...document.querySelectorAll('.app input:not([type=checkbox]), .app select, .app button')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }); let n = [];
                        for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { if (k[i].contains(k[j]) || k[j].contains(k[i])) continue; const a = k[i].getBoundingClientRect(), c = k[j].getBoundingClientRect(); if (Math.min(a.right, c.right) - Math.max(a.left, c.left) > 2 && Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top) > 2) n.push(k[i].id || k[i].className); } return n; });
                    eq(c, [], T + 'no overlapping controls');
                    // every placeholder fits its box
                    const clipped = await p.evaluate(() => [...document.querySelectorAll('.app input[placeholder]')].filter(i => i.offsetWidth).filter(i => { const c = document.createElement('canvas').getContext('2d'); const cs = getComputedStyle(i); c.font = cs.fontSize + ' ' + cs.fontFamily; return c.measureText(i.placeholder).width > i.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight); }).map(i => i.id));
                    eq(clipped, [], T + 'placeholders fit');
                    // the chosen text of every dropdown fits, with room for the arrow
                    const cut = await p.evaluate(() => [...document.querySelectorAll('.app select')].filter(s => s.offsetWidth).flatMap(s => [...s.options].map(o => { const c = document.createElement('canvas').getContext('2d'); const cs = getComputedStyle(s); c.font = cs.fontSize + ' ' + cs.fontFamily; return c.measureText(o.text).width > s.clientWidth - parseFloat(cs.paddingLeft) - 28 ? o.text : null; })).filter(Boolean));
                    eq(cut, [], T + 'dropdown options fit');
                }
                if (state === 'over') { await p.click('#keep-playing'); }
                if (state === 'setup') { await p.click('#toast-undo'); }
                if (state === 'options') { await p.locator('#entry-list .popts .link').first().click(); await p.click('#late-cancel'); }
            }
        }
        // the toast must not hide the Save button for long: it closes by itself
        await p.close();
    }

    // ---- help dialog at 4 widths ----
    for (const w of [320, 390, 820, 1280]) {
        const p = await newPage(w);
        const hb = await p.locator('.help-btn').boundingBox(), bk = await p.locator('a.back').boundingBox(), th = await p.locator('.theme-toggle').boundingBox();
        ok(Math.abs(hb.y - bk.y) < 4 && Math.abs(th.y - bk.y) < 4, '[' + w + '] top bar on one line');
        await p.click('.help-btn');
        const d = await p.locator('dialog.help').boundingBox();
        ok(d.x >= 0 && d.y >= 0 && d.x + d.width <= w && d.y + d.height <= 900, '[' + w + '] help inside the screen');
        eq(await p.locator('dialog.help h2').innerText(), 'How to use Card and Board Game Score Sheet', '[' + w + '] help title');
        await p.keyboard.press('Escape'); ok(!(await p.locator('dialog.help').evaluate(e => e.open)), '[' + w + '] Escape closes help');
        await p.click('.help-btn'); await p.click('.help-close'); ok(!(await p.locator('dialog.help').evaluate(e => e.open)), '[' + w + '] Got it closes help');
        await p.close();
    }

    // ---- keyboard only: Enter moves to the next box and saves the round ----
    {
        const p = await newPage(390);
        await p.click('#start');
        await boxes(p).nth(0).focus(); await p.keyboard.type('12'); await p.keyboard.press('Enter'); await p.keyboard.type('7'); await p.keyboard.press('Enter');
        eq(await totals(p), ['Player 1 12', 'Player 2 7'], 'keyboard: Enter moves and saves');
        await p.close();
    }

    // ---- files the page needs ----
    for (const f of ['favicon.svg', 'manifest.webmanifest', 'sw.js', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'screenshots/desktop.png', 'screenshots/phone.png', '../help.js', '../theme.js']) {
        const r = await fetch(new URL(f, url)).catch(() => null);
        ok(r && r.status === 200, 'file ' + f + ' returns 200');
    }
    // the hub card opens the app
    {
        const p = await newPage(1280);
        await p.goto(base + '/', { waitUntil: 'networkidle' });
        const card = p.locator('a[href*="card-and-board-game-score-sheet"]').first();
        ok(await card.count() > 0, 'hub lists the app');
        if (await card.count()) { await card.click(); await p.waitForLoadState('networkidle'); ok(p.url().includes('/card-and-board-game-score-sheet/'), 'hub card opens the app'); }
        await p.close();
    }

    eq(errors, [], 'no console errors');
    eq(bad.filter(u => !/goatcounter|zgo/.test(u)), [], 'no failed requests');
    await b.close(); if (srv) srv.close();
    console.log((failed ? 'FAILED ' + failed + ', ' : '') + 'passed ' + pass + ' UI checks (' + (LIVE ? 'live' : 'local') + ')');
    process.exit(failed ? 1 : 0);
})();
