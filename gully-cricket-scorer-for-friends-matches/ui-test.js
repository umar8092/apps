// Drives the real page in headless Chromium and checks every situation from the use-case list.
// Run from the repo root: node gully-cricket-scorer-for-friends-matches/ui-test.js [--base https://umar8092.github.io/apps]
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), SLUG = 'gully-cricket-scorer-for-friends-matches';
const BASE = (process.argv.indexOf('--base') > 0 ? process.argv[process.argv.indexOf('--base') + 1] : '').replace(/\/$/, '');
let pass = 0; const fails = [];
function ok(cond, name) { if (cond) pass++; else { fails.push(name); console.log('FAIL ' + name); } }
function eq(got, want, name) { ok(JSON.stringify(got) === JSON.stringify(want), name + (JSON.stringify(got) === JSON.stringify(want) ? '' : ' (got ' + JSON.stringify(got) + ', want ' + JSON.stringify(want) + ')')); }

function serve() {
    return new Promise(res => {
        const srv = http.createServer((q, r) => { let f = decodeURIComponent(q.url.split('?')[0]).replace(/^\/apps/, ''); if (f.endsWith('/')) f += 'index.html'; const fp = path.join(ROOT, f);
            if (!fs.existsSync(fp) || !fp.startsWith(ROOT)) { r.writeHead(404); return r.end(); }
            r.writeHead(200, { 'Content-Type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' }[path.extname(fp)] || 'application/octet-stream' }); fs.createReadStream(fp).pipe(r); }).listen(0, () => res(srv));
    });
}

(async () => {
    let srv = null, base = BASE;
    if (!base) { srv = await serve(); base = 'http://localhost:' + srv.address().port + '/apps'; }
    const url = base + '/' + SLUG + '/';
    const browser = await chromium.launch();
    const errors = [];
    async function fresh(opts) {
        const ctx = await browser.newContext(Object.assign({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' }, opts || {}));
        await ctx.route(/goatcounter|zgo/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
        const p = await ctx.newPage();
        p.on('pageerror', e => errors.push(e.message));
        p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
        p.on('dialog', d => d.accept());
        await p.goto(url, { waitUntil: 'networkidle' });
        return { ctx, p };
    }
    const txt = async (p, sel) => (await p.locator(sel).innerText()).trim();
    const vis = async (p, sel) => p.locator(sel).isVisible();
    async function play(p, list) {
        for (const x of list) {
            if (typeof x === 'number') { if (x === 5) await p.click('#five'); else await p.click(`#pad-main [data-run="${x}"]`); continue; }
            if (x[0] === 'wd' || x[0] === 'nb' || x[0] === 'bye') { await p.click(`#pad-main [data-extra="${x[0]}"]`); await p.click(`#extra-runs [data-extra-run="${x[1] || 0}"]`); continue; }
            if (x[0] === 'out') {
                await p.click('#out-open');
                if (x[1] === 'Run out') { await p.click('[data-how="Run out"]'); if (x[3] === 'n' && await p.locator('#ro-n').isVisible()) await p.click('#ro-n'); await p.locator('#ro-runs button').nth(x[2] || 0).click(); await p.click('#runout-save'); }
                else await p.click(`[data-how="${x[1] || 'Bowled'}"]`);
                continue;
            }
            if (x[0] === 'pick') { await p.locator('#pick-list .pick-btn', { hasText: x[1] }).first().click(); continue; }
            throw new Error('bad step ' + JSON.stringify(x));
        }
    }
    const openMore = async p => { if (!(await p.locator('#more').evaluate(e => e.open))) await p.click('#more summary'); };
    const store = p => p.evaluate(s => localStorage.getItem(s + '.match'), SLUG);

    // ---------- 1. first use: empty state and defaults ----------
    let { ctx, p } = await fresh();
    ok(await vis(p, '#setup'), 'setup shows on first use');
    ok(!(await vis(p, '#board')), 'no scoreboard before a match');
    ok(!(await vis(p, '#history-card')), 'no past matches yet');
    eq(await p.locator('#overs-chips [aria-pressed="true"]').innerText(), '6', '6 overs preset by default');
    eq([await txt(p, '#pl-val-0'), await txt(p, '#pl-val-1')], ['6', '6'], '6 players each by default');
    eq(await p.locator('#mode-team').getAttribute('aria-pressed'), 'true', 'team score only by default');
    ok(!(await p.locator('.pname-in').count()), 'no player name boxes in team mode');
    // optional names not forced: start with everything blank
    await p.click('#start');
    eq(await txt(p, '#board-team'), 'Team A', 'blank team names become Team A');
    eq(await txt(p, '#board-runs'), '0/0', 'starts 0/0');
    eq(await txt(p, '#board-overs'), 'Overs 0.0 of 6 · 36 balls left', 'overs line at start');
    ok(await p.locator('#undo').isDisabled(), 'nothing to undo at start');
    await ctx.close();

    // ---------- 2. setup inputs: custom overs, players, long names ----------
    ({ ctx, p } = await fresh());
    await p.click('#ov-custom');
    ok(await vis(p, '#overs-custom'), 'custom overs box opens');
    for (const bad of ['', '0', '51', 'abc', '2.5', '-3']) {
        await p.fill('#overs-custom', bad); await p.click('#start');
        ok(await vis(p, '#setup') && (await txt(p, '#overs-err')) === 'Type a whole number from 1 to 50.', 'custom overs "' + bad + '" refused');
    }
    await p.fill('#overs-custom', '12');
    for (let i = 0; i < 10; i++) if (!(await p.locator('#pl-minus-0').isDisabled())) await p.click('#pl-minus-0');
    eq(await txt(p, '#pl-val-0'), '2', 'players stop at 2');
    ok(await p.locator('#pl-minus-0').isDisabled(), 'minus disabled at 2');
    for (let i = 0; i < 20; i++) if (!(await p.locator('#pl-plus-1').isDisabled())) await p.click('#pl-plus-1');
    eq(await txt(p, '#pl-val-1'), '15', 'players stop at 15');
    ok((await p.locator('#team-boxes .tbox').nth(1).innerText()).includes('All out at 14 wickets'), 'all-out wickets shown per team');
    await p.click('#lm-1');
    ok((await p.locator('#team-boxes .tbox').nth(0).innerText()).includes('All out at 2 wickets'), 'last batter bats alone: all out at 2 of 2');
    await p.fill('#team-0', 'The Very Long Named Street Elevens Club Of Gulberg');
    eq((await p.inputValue('#team-0')).length, 30, 'team name capped at 30');
    await p.click('#first-1');
    await p.fill('#team-1', 'Block C');
    eq(await txt(p, '#first-1'), 'Block C', 'who-bats-first button follows the name');
    await p.reload();
    eq(await p.inputValue('#overs-custom'), '12', 'setup remembered after reload (custom overs)');
    eq(await txt(p, '#pl-val-1'), '15', 'setup remembered after reload (players)');
    await p.click('#start');
    eq(await txt(p, '#board-team'), 'Block C', 'chosen team bats first');
    eq(await txt(p, '#board-overs'), 'Overs 0.0 of 12 · 72 balls left', 'custom 12 overs used');
    await ctx.close();

    // ---------- 3. the main situation, team score only ----------
    ({ ctx, p } = await fresh());
    await p.fill('#team-0', 'Gali No. 7'); await p.fill('#team-1', 'Block C');
    await p.click('#start');
    await play(p, [1, 4, 0, ['wd'], 2, 1, 0]);
    eq(await txt(p, '#board-runs'), '9/0', 'first over: 1 4 0 Wd 2 1 0 = 9');
    eq(await txt(p, '#board-overs'), 'Overs 1.0 of 6 · 30 balls left', 'the wide was bowled again');
    eq(await p.locator('#this-over li').allInnerTexts(), ['No balls yet'], 'new over is empty');
    ok((await txt(p, '#sc-body')).includes('Over 1: 9 1 4 0 Wd 2 1 0'), 'over summary in the scorecard');
    await play(p, [6, 0, 1, ['out', 'Caught'], 4, 1, 0, 2, ['nb', 4], 1, 1, ['out', 'Bowled'], 0, 4, 1, 1, 6, 0, 2,
        1, ['out', 'Run out', 1, 'n'], 1, 4, ['bye', 1], 0, 1, 1, ['out', 'Caught'], 2, 0]);
    eq(await txt(p, '#board-runs'), '56/4', 'before the last ball');
    eq(await p.locator('#this-over li').allInnerTexts(), ['1', '1', 'W', '2', '0'], 'this over dots');
    await play(p, [1]);
    ok(await vis(p, '#break'), 'innings break after 6 overs');
    eq(await txt(p, '#break-title'), 'Block C need 58 to win', 'target 58');
    eq(await txt(p, '#break-sub'), 'Gali No. 7 made 57/4 in 6 overs. Block C have 6 overs.', 'break summary');
    ok(!(await vis(p, '#pad')), 'no scoring buttons during the break');
    await p.click('#start-next');
    eq(await txt(p, '#board-innings'), '2ND INNINGS', 'innings label');
    eq(await txt(p, '#board-chase'), 'Block C need 58 off 36 balls', 'chase line at start');
    await play(p, [1, 0, 4, 1, ['wd'], 0, 2, 6, 1, 0, ['out', 'Caught'], 1, 2, 4, 0, 1, 1, ['out', 'Stumped'], 0, 1, 4, 4, 1]);
    eq(await txt(p, '#board-runs'), '35/2', 'Block C 35/2');
    eq(await txt(p, '#board-overs'), 'Overs 3.4 of 6 · 14 balls left', '3.4 overs, 14 balls left');
    eq(await txt(p, '#board-chase'), 'Block C need 23 off 14 balls', 'THE ANSWER: need 23 off 14 balls');
    eq(await txt(p, '#board-rates'), 'Run rate 9.55 · Required rate 9.86', 'run rate and required rate');
    eq(await p.evaluate(() => document.getElementById('announce').textContent), 'Block C 35 for 2, 3.4 overs. Need 23 off 14', 'screen reader hears the score');
    // reload keeps everything
    await p.reload();
    eq([await txt(p, '#board-runs'), await txt(p, '#board-chase')], ['35/2', 'Block C need 23 off 14 balls'], 'reload keeps the match');
    await play(p, [6, 1, 4, ['out'], 1, 2, 0, 1]);
    eq(await txt(p, '#board-runs'), '50/3', '50/3 after 5 overs');
    await play(p, [1, 0, ['out'], 1, 0, 1]);
    ok(await vis(p, '#result'), 'result shows');
    eq(await txt(p, '#result-title'), 'Gali No. 7 won by 4 runs', 'THE RESULT: won by 4 runs');
    eq(await txt(p, '#result-sub'), 'Gali No. 7 57/4 (6 ov) · Block C 53/4 (6 ov)', 'result scores');
    ok(await vis(p, '#history-card') && (await txt(p, '#history')).includes('Gali No. 7 won by 4 runs'), 'result saved to past matches');
    // copy scorecard
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(url).origin });
    await p.click('#copy');
    const clip = await p.evaluate(() => navigator.clipboard.readText());
    ok(clip.startsWith('Gali No. 7 v Block C · 6 overs a side\nGali No. 7 won by 4 runs'), 'copied scorecard starts with the result');
    ok(clip.includes('Block C 53/4 (6 ov)') && clip.includes('Gali No. 7 57/4 (6 ov)'), 'copied scorecard has both totals');
    ok((await txt(p, '#toast-text')).includes('Scorecard copied'), 'copy confirmed');
    // undo from the result back into the chase, then win by wickets instead
    for (let i = 0; i < 6; i++) await p.click(i ? '#undo' : '#undo-result');
    eq(await txt(p, '#board-runs'), '50/3', 'undo six balls back to 50/3');
    ok(!(await txt(p, '#history')).includes('won by 4 runs') || !(await vis(p, '#history-card')), 'undone result removed from past matches');
    await play(p, [4, ['out'], 4]);
    eq(await txt(p, '#result-title'), 'Block C won by 1 wicket (3 balls left)', 'won by wickets with balls left (README example)');
    await ctx.close();

    // ---------- 4. extras and the panels ----------
    ({ ctx, p } = await fresh());
    await p.click('#ov-2'); await p.click('#start');
    await p.click('[data-extra="wd"]');
    eq(await txt(p, '#extra-q'), 'Wide: how many runs did they run as well?', 'wide question');
    await p.click('#extra-cancel');
    ok(!(await vis(p, '#extra-panel')), 'cancel closes the panel');
    eq(await txt(p, '#board-runs'), '0/0', 'cancel adds nothing');
    await play(p, [['wd', 0], ['wd', 2], ['nb', 6], ['bye', 4], 5]);
    eq(await txt(p, '#board-runs'), '20/0', 'extras: 1 + 3 + 7 + 4 + 5 = 20');
    eq(await p.locator('#this-over li').allInnerTexts(), ['Wd', 'Wd+2', 'Nb+6', 'B4', '5'], 'extras labels in this over');
    eq(await txt(p, '#board-overs'), 'Overs 0.2 of 2 · 10 balls left', 'only bye and 5 were legal balls');
    ok((await txt(p, '#sc-body')).includes('Extras 9 (wides 4, no balls 1, byes 4)'), 'extras in scorecard');
    // out panel: cancel, then run out in team mode has no "who"
    await p.click('#out-open'); await p.click('[data-how="Run out"]');
    ok(await vis(p, '#runout-box') && !(await vis(p, '#runout-who-box')), 'team mode: run out asks only for runs');
    await p.click('#out-cancel');
    eq(await txt(p, '#board-runs'), '20/0', 'cancelled out adds nothing');
    await play(p, [['out', 'Run out', 2]]);
    eq(await txt(p, '#board-runs'), '22/1', 'run out after 2 runs counts the runs');
    // undo labels and toast
    await p.click('#undo');
    ok((await txt(p, '#toast-text')) === 'Undone: wicket.', 'undo toast names what was undone');
    eq(await txt(p, '#board-runs'), '20/0', 'undo wicket');
    // keyboard: Enter on a focused button scores
    await p.focus('#pad-main [data-run="4"]'); await p.keyboard.press('Enter');
    eq(await txt(p, '#board-runs'), '24/0', 'keyboard Enter scores a 4');
    // change overs and target
    await openMore(p);
    await p.fill('#set-overs', '0'); await p.click('#set-overs-save');
    eq(await txt(p, '#set-overs-err'), 'Overs must be a whole number from 1 to 50.', 'bad overs refused');
    await p.fill('#set-overs', '1'); await p.click('#set-overs-save');
    eq(await txt(p, '#board-overs'), 'Overs 0.3 of 1 · 3 balls left', 'overs cut to 1 (rain)');
    ok(!(await vis(p, '#target-box')), 'no target box in the first innings');
    await play(p, [0, 0, 0]);
    eq(await txt(p, '#break-title'), 'Team B need 25 to win', 'shortened innings ends');
    await p.click('#start-next');
    await openMore(p);
    ok(await vis(p, '#target-box'), 'target box in the chase');
    eq(await p.inputValue('#set-overs'), '1', 'chase has the same overs');
    await p.fill('#set-target', '0'); await p.click('#set-target-save');
    eq(await txt(p, '#set-target-err'), 'Target must be a whole number from 1 to 9999.', 'target 0 refused');
    await p.fill('#set-target', '20'); await p.click('#set-target-save');
    eq(await txt(p, '#board-chase'), 'Team B need 20 off 6 balls', 'typed target used');
    await p.fill('#set-target', ''); await p.click('#set-target-save');
    eq(await txt(p, '#board-chase'), 'Team B need 25 off 6 balls', 'blank target goes back to normal');
    // end innings now
    await p.click('#end-innings');
    eq(await txt(p, '#result-title'), 'Team A won by 24 runs', 'ending the chase early gives the result');
    // undo across the innings start
    await p.click('#undo-result');
    ok(await vis(p, '#pad'), 'undo end innings');
    await p.click('#undo');
    ok(await vis(p, '#break'), 'undo start of innings goes back to the break');
    // new match with undo
    await p.click('#undo-break');
    await openMore(p);
    await p.click('#new-from-play');
    ok(await vis(p, '#setup'), 'new match shows setup');
    eq(await p.locator('#overs-chips [aria-pressed="true"]').innerText(), '2', 'new match keeps the overs');
    await p.click('#toast-undo');
    ok(await vis(p, '#board') && (await txt(p, '#board-runs')) === '24/0', 'undo new match brings the match back');
    await ctx.close();

    // ---------- 5. tie, super over, finish as a tie ----------
    ({ ctx, p } = await fresh());
    await p.fill('#team-0', 'Lions'); await p.fill('#team-1', 'Tigers');
    await p.click('#ov-custom'); await p.fill('#overs-custom', '1'); await p.click('#start');
    await play(p, [1, 1, 1, 1, 1, 1]); await p.click('#start-next'); await play(p, [1, 1, 1, 1, 1, 1]);
    eq(await txt(p, '#result-title'), 'Match tied: both teams scored 6', 'tie');
    ok(await vis(p, '#super-over') && await vis(p, '#finish-tie'), 'tie offers super over or finish');
    await p.click('#super-over');
    eq([await txt(p, '#board-team'), await txt(p, '#board-overs')], ['Tigers', 'Overs 0.0 of 1 · 6 balls left'], 'team batting second bats first in the super over');
    eq(await txt(p, '#board-innings'), 'SUPER OVER', 'super over label');
    await play(p, [['out'], 4, ['out']]);
    eq(await txt(p, '#break-title'), 'Lions need 5 to win', 'super over all out at 2 wickets');
    await p.click('#start-next'); await play(p, [4, 1]);
    eq(await txt(p, '#result-title'), 'Lions won the super over', 'super over winner');
    ok((await txt(p, '#result-sub')).includes('Match tied: both teams scored 6'), 'main tie still shown');
    for (let i = 0; i < 2; i++) await p.click(i ? '#undo' : '#undo-result');
    await p.click('#undo'); await p.click('#undo-break'); await p.click('#undo'); await p.click('#undo'); await p.click('#undo');
    eq(await txt(p, '#result-title'), 'Match tied: both teams scored 6', 'undo all the way back to the tie');
    await p.click('#finish-tie');
    ok(!(await vis(p, '#tie-box')), 'finished as a tie');
    ok((await txt(p, '#history')).includes('Match tied: both teams scored 6'), 'tie saved to past matches');
    // start a new match from the result, history kept; clear with undo
    await p.click('#rematch');
    eq(await p.inputValue('#overs-custom'), '1', 'rematch keeps custom overs');
    ok(await vis(p, '#history-card'), 'past matches on setup screen');
    await p.click('#clear-history');
    ok(!(await vis(p, '#history-card')), 'past matches cleared');
    await p.click('#toast-undo');
    ok(await vis(p, '#history-card'), 'undo clear');
    await ctx.close();

    // ---------- 6. each player too ----------
    ({ ctx, p } = await fresh());
    await p.click('#mode-players');
    eq(await p.locator('.pname-in').count(), 12, '6 name boxes per team');
    await p.click('#pl-minus-0'); await p.click('#pl-minus-0'); await p.click('#pl-minus-0');
    eq(await p.locator('#team-boxes .tbox').nth(0).locator('.pname-in').count(), 3, 'name boxes follow the player count');
    const n0 = p.locator('#team-boxes .tbox').nth(0).locator('.pname-in');
    await n0.nth(0).fill('Ali'); await n0.nth(1).fill('  Bilal\n Khan  '); await n0.nth(2).fill('');
    await p.fill('#team-0', 'Lions'); await p.fill('#team-1', 'Tigers');
    const n1 = p.locator('#team-boxes .tbox').nth(1).locator('.pname-in');
    await n1.nth(0).fill('Imran'); await n1.nth(1).fill('Zain');
    await p.click('#ov-2'); await p.click('#start');
    eq(await txt(p, '#pick-title'), 'Who faces the first ball?', 'asks for the opener');
    ok(!(await vis(p, '#pad')), 'buttons hidden until batters are chosen');
    eq(await p.locator('#pick-list .pk-name').allInnerTexts(), ['Ali', 'Bilal Khan', 'Player 3'], 'names tidied, blank is Player 3');
    await play(p, [['pick', 'Ali']]);
    eq(await txt(p, '#pick-title'), 'Who is the other opener?', 'second opener');
    await play(p, [['pick', 'Bilal Khan']]);
    eq(await txt(p, '#pick-title'), 'Who bowls the first over?', 'then the bowler');
    await play(p, [['pick', 'Imran']]);
    ok(await vis(p, '#pad'), 'buttons appear');
    eq(await p.locator('#crease li').allInnerTexts(), ['Ali *\n0 (0)', 'Bilal Khan\n0 (0)'], 'striker marked with *');
    await play(p, [1]);
    ok((await p.locator('#crease li').first().innerText()).startsWith('Bilal Khan *'), 'single changes the strike');
    await play(p, [4, 0, 2, 3]);
    ok((await p.locator('#crease li').first().innerText()).startsWith('Ali *'), 'three runs change the strike');
    await play(p, [1]);
    eq(await txt(p, '#pick-title'), 'Who bowls over 2?', 'new bowler each over');
    ok((await p.locator('#pick-list .pick-btn').last().innerText()).includes('bowled the last over'), 'last bowler marked and listed last');
    await play(p, [['pick', 'Zain']]);
    ok((await p.locator('#crease li').first().innerText()).startsWith('Ali *'), 'ends change after the over (Ali took a single off the last ball, then the ends swapped back)');
    // swap strike, retire, bats again
    await openMore(p);
    await p.click('#swap');
    ok((await p.locator('#crease li').first().innerText()).startsWith('Bilal Khan *'), 'swap strike');
    await play(p, [['out', 'Run out', 1, 'n']]);
    eq(await txt(p, '#pick-title'), 'Who bats next for Lions?', 'wicket asks for next batter');
    eq(await txt(p, '#pick-hint'), 'Wicket! 12/1.', 'wicket hint');
    ok(await vis(p, '#pick-again-box'), 'someone bats again is offered');
    await play(p, [['pick', 'Player 3']]);
    eq((await p.locator('#crease li').allInnerTexts()).map(s => s.split('\n')[0]), ['Player 3 *', 'Bilal Khan'], 'run out at the other end: new batter faces');
    await openMore(p);
    const rname = await txt(p, '#retire-s');
    await p.click('#retire-s');
    ok(rname.startsWith('Retire '), 'retire button names the batter');
    eq(await txt(p, '#pick-title'), 'Who bats next for Lions?', 'retired batter needs a replacement');
    // only out player left: picker shows bats again
    eq(await p.locator('#pick-list .pick-btn').allInnerTexts(), ['Player 3\nretired, 0 (0)'], 'retired batter can come back');
    await p.click('#pick-again-box summary');
    eq(await p.locator('#pick-again .pick-btn').allInnerTexts(), ['Ali\nout, 2'], 'out batter offered to bat again');
    await p.locator('#pick-again .pick-btn').first().click();
    ok(await vis(p, '#pad'), 'a player can bat again');
    // fix names mid-match
    await openMore(p);
    await p.click('#names-open');
    await p.fill('#fix-team-1', 'Tigers XI');
    await p.locator('#names-boxes .tbox').nth(1).locator('input').nth(3).fill('Danish');
    await p.click('#names-save');
    ok((await txt(p, '#board-bowler')).startsWith('Bowling: Zain'), 'bowler line');
    ok((await txt(p, '#sc-body')).includes('Imran'), 'scorecard has bowlers');
    await play(p, [['out', 'Caught']]);
    ok((await txt(p, '#sc-body')).includes('caught b Zain'), 'caught b bowler in scorecard');
    // reload in the middle of a choice
    await p.reload();
    ok(await vis(p, '#pick') || await vis(p, '#pad') || await vis(p, '#break'), 'reload keeps the players match');
    const before = await store(p);
    ok(before && before.includes('"mode":"players"'), 'saved under the app key');
    await ctx.close();

    // ---------- 7. corrupt and blocked storage ----------
    ({ ctx, p } = await fresh());
    await p.evaluate(s => { localStorage.setItem(s + '.match', '{"innings":[{"events":"x"}],"setup":5'); localStorage.setItem(s + '.setup', '[1,2'); localStorage.setItem(s + '.history', '{"a":1}'); }, SLUG);
    await p.reload();
    ok(await vis(p, '#setup'), 'corrupt saved match: starts fresh');
    await p.evaluate(s => localStorage.setItem(s + '.match', JSON.stringify({ setup: { overs: 3, teams: [{ name: '<img src=x onerror=alert(1)>' }] }, innings: [{ bat: 0, events: [{ k: 'ball', t: 'run', r: 4 }, { k: 'ball', t: 'zz' }] }] })), SLUG);
    await p.reload();
    eq([await txt(p, '#board-team'), await txt(p, '#board-runs')], ['<img src=x onerror=alert(1)>', '4/0'], 'odd saved values shown as plain text');
    await ctx.close();
    {
        const c2 = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
        await c2.route(/goatcounter|zgo/, r => r.fulfill({ status: 200, body: '' }));
        await c2.addInitScript(() => { const thr = () => { throw new Error('blocked'); }; Object.defineProperty(window, 'localStorage', { get: thr }); });
        const p2 = await c2.newPage(); const errs = []; p2.on('pageerror', e => errs.push(e.message));
        await p2.goto(url); await p2.click('#start'); await p2.click('#pad-main [data-run="4"]');
        ok(await p2.locator('#storage-warn').isVisible(), 'blocked storage warning');
        eq(await p2.locator('#board-runs').innerText(), '4/0', 'still scores without storage');
        eq(errs, [], 'no errors with blocked storage');
        await c2.close();
    }

    // ---------- 8. theme switch ----------
    ({ ctx, p } = await fresh({ colorScheme: 'dark' }));
    await p.click('.theme-toggle');
    eq(await p.evaluate(() => document.documentElement.getAttribute('data-theme')), 'light', 'theme switch to light');
    const bg = await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
    eq(bg, '#15803d', 'light accent');
    await ctx.close();

    // ---------- 9. layout with filled states at every width ----------
    const states = {
        setupPlayers: async p => { await p.click('#mode-players'); for (let i = 0; i < 9; i++) await p.click('#pl-plus-0'); },
        playing: async p => { await p.click('#mode-players'); await p.fill('#team-0', 'The Very Long Named Street XI'); await p.fill('#team-1', 'Block C'); await p.click('#start');
            await play(p, [['pick', 'Player 1'], ['pick', 'Player 2'], ['pick', 'Player 1'], 1, 4, ['wd', 1]]);
            await p.click('#out-open'); await p.click('[data-how="Run out"]'); await openMore(p); await p.click('#names-open'); },
        extras: async p => { await p.click('#start'); await play(p, [6, 4]); await p.click('[data-extra="nb"]'); await openMore(p); },
        result: async p => { await p.click('#ov-2'); await p.click('#start'); await play(p, [6, 6, 6, 6, 6, 6, 4, 4, 4, 4, 4, 4]); await p.click('#start-next'); await play(p, [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]); }
    };
    const widths = [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920];
    for (const scheme of ['dark', 'light']) for (const [name, fn] of Object.entries(states)) for (const w of widths) {
        const c = await browser.newContext({ viewport: { width: w, height: 900 }, colorScheme: scheme, serviceWorkers: 'block' });
        await c.route(/goatcounter|zgo/, r => r.fulfill({ status: 200, body: '' }));
        const pg = await c.newPage(); pg.on('pageerror', e => errors.push(e.message)); pg.on('dialog', d => d.accept());
        await pg.goto(url); await fn(pg);
        const tag = scheme + ' ' + name + ' @' + w + ': ';
        const scroll = await pg.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        ok(scroll <= 0, tag + 'no horizontal scroll (' + scroll + ')');
        const out = await pg.evaluate(() => [...document.querySelectorAll('main *')].filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.right > innerWidth + 1 || r.left < -1) && !e.closest('.scroll'); }).map(e => e.id || e.className || e.tagName).slice(0, 4));
        eq(out, [], tag + 'nothing sticks out');
        if (w <= 390) {
            const lap = await pg.evaluate(() => { const els = [...document.querySelectorAll('main input, main button, main select')].filter(e => e.offsetParent); const bad = [];
                for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) { const a = els[i].getBoundingClientRect(), b = els[j].getBoundingClientRect();
                    if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) bad.push((els[i].id || els[i].textContent.trim().slice(0, 12)) + ' / ' + (els[j].id || els[j].textContent.trim().slice(0, 12))); }
                return bad.slice(0, 3); });
            eq(lap, [], tag + 'no controls overlap');
            const clipped = await pg.evaluate(() => [...document.querySelectorAll('main input[placeholder]')].filter(e => e.offsetParent).filter(e => { const c = document.createElement('canvas').getContext('2d'); const st = getComputedStyle(e); c.font = st.fontSize + ' ' + st.fontFamily; return c.measureText(e.placeholder).width > e.clientWidth - parseFloat(st.paddingLeft) - parseFloat(st.paddingRight) + 1; }).map(e => e.placeholder));
            eq(clipped, [], tag + 'placeholders fit');
            const btnClip = await pg.evaluate(() => [...document.querySelectorAll('main button')].filter(e => e.offsetParent && (e.scrollWidth > e.clientWidth + 1)).map(e => e.textContent.trim().slice(0, 20)));
            eq(btnClip, [], tag + 'button text fits');
        }
        if (w >= 900) for (const pos of [0, 0.5, 1]) {
            await pg.evaluate(f => window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * f), pos);
            const o = await pg.evaluate(() => { const bad = []; document.querySelectorAll('main, .app, .play-grid, .col-main, .col-side').forEach(par => { const kids = [...par.children].filter(k => k.offsetParent && getComputedStyle(k).position !== 'fixed');
                for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) { const a = kids[i].getBoundingClientRect(), b = kids[j].getBoundingClientRect();
                    if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) bad.push((kids[i].id || kids[i].className) + ' / ' + (kids[j].id || kids[j].className)); } }); return bad; });
            eq(o, [], tag + 'no overlap after scrolling ' + pos * 100 + '%');
        }
        if (w === 1280 && name === 'playing') {
            const cols = await pg.evaluate(() => [document.querySelector('.col-main').getBoundingClientRect().width, document.querySelector('.col-side').getBoundingClientRect().width]);
            ok(cols[0] > 450 && cols[1] > 450, tag + 'two columns on a laptop');
        }
        await c.close();
    }

    // ---------- 10. help dialog ----------
    for (const w of [320, 390, 820, 1280]) {
        const c = await browser.newContext({ viewport: { width: w, height: w < 600 ? 800 : 900 }, serviceWorkers: 'block' });
        await c.route(/goatcounter|zgo/, r => r.fulfill({ status: 200, body: '' }));
        const pg = await c.newPage(); await pg.goto(url);
        const tag = 'help @' + w + ': ';
        const bar = await pg.evaluate(() => [...document.querySelectorAll('.topbar > *')].map(e => { const r = e.getBoundingClientRect(); return [r.top, r.bottom, r.left, r.right]; }));
        ok(new Set(bar.map(b => Math.round(b[0]))).size === 1, tag + 'top bar on one line');
        await pg.click('.help-btn');
        const box = await pg.locator('dialog.help').boundingBox();
        ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= w && box.y + box.height <= (w < 600 ? 800 : 900), tag + 'dialog inside the screen');
        ok((await pg.locator('dialog.help h2').innerText()).startsWith('How to use Gully Cricket Scorer'), tag + 'help title');
        await pg.keyboard.press('Escape');
        ok(!(await pg.locator('dialog.help').evaluate(e => e.open)), tag + 'Escape closes');
        await pg.click('.help-btn'); await pg.click('.help-close');
        ok(!(await pg.locator('dialog.help').evaluate(e => e.open)), tag + 'Got it closes');
        await c.close();
    }

    // ---------- 11. files ----------
    {
        const c = await browser.newContext(); const pg = await c.newPage();
        for (const f of ['favicon.svg', 'manifest.webmanifest', 'sw.js', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'screenshots/desktop.png', 'screenshots/phone.png', '../help.js', '../theme.js', 'core.js', 'script.js', 'style.css']) {
            const r = await pg.request.get(url + f); eq(r.status(), 200, 'file ' + f);
        }
        await c.close();
    }

    eq(errors, [], 'no page or console errors');
    await browser.close(); if (srv) srv.close();
    console.log(fails.length ? '\nUI TESTS FAILED ' + fails.length + ' of ' + (pass + fails.length) : '\nALL ' + pass + ' UI TESTS PASSED (' + (BASE ? 'live' : 'local') + ')');
    process.exitCode = fails.length ? 1 : 0;
})();
