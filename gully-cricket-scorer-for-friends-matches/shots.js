// Makes screenshots/desktop.png and phone.png with the example situation from the README.
// Run from the repo root: node gully-cricket-scorer-for-friends-matches/shots.js
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const C = require('./core.js');
const ROOT = path.join(__dirname, '..'), DIR = __dirname;

// Saturday evening: Gali No. 7 v Block C, 6 overs, 6 a side, each player scored.
function exampleMatch() {
    const m = C.newMatch({ mode: 'players', overs: 6, teams: [
        { name: 'Gali No. 7', players: 6, names: ['Ahmed', 'Bilal', 'Hamza', 'Usman', 'Saad', 'Faizan'] },
        { name: 'Block C', players: 6, names: ['Ali', 'Zain', 'Imran', 'Danish', 'Rehan', 'Taha'] }] });
    const play = list => list.forEach(x => {
        if (typeof x === 'number') return C.addBall(m, 'run', x);
        if (x[0] === 'bat' || x[0] === 'bowl') return C.choose(m, x[0], x[1]);
        const err = C.addBall(m, x[0], x[1] || 0, x[2]); if (err) throw new Error(err);
    });
    // Gali No. 7 bat: 57/4 in 6 overs
    play([['bat', 0], ['bat', 1], ['bowl', 0], 1, 4, 0, ['wd'], 2, 1, 0,
        ['bowl', 1], 6, 0, 1, ['out', 0, { how: 'Caught' }], ['bat', 2], 4, 1,
        ['bowl', 2], 0, 2, ['nb', 4], 1, 1, ['out', 0, { how: 'Bowled' }], ['bat', 3], 0,
        ['bowl', 0], 4, 1, 1, 6, 0, 2,
        ['bowl', 1], 1, ['out', 1, { how: 'Run out', who: 'n' }], ['bat', 4], 1, 4, ['bye', 1], 0,
        ['bowl', 3], 1, 1, ['out', 0, { how: 'Caught' }], ['bat', 5], 2, 0, 1]);
    C.startNext(m);
    // Block C chase 58: 35/2 after 3.4 overs, need 23 off 14 balls
    play([['bat', 0], ['bat', 1], ['bowl', 0], 1, 0, 4, 1, ['wd'], 0, 2,
        ['bowl', 1], 6, 1, 0, ['out', 0, { how: 'Caught' }], ['bat', 2], 1, 2,
        ['bowl', 2], 4, 0, 1, 1, ['out', 0, { how: 'Stumped' }], ['bat', 3], 0,
        ['bowl', 3], 1, 4, 4, 1]);
    return m;
}
if (require.main !== module) { module.exports = { exampleMatch }; return; }

(async () => {
    const m = exampleMatch(), d = C.summary(m).current;
    console.log('example:', d.runs + '/' + d.wkts, C.oversText(d.legal), 'need', d.need, 'off', d.ballsLeft, 'target', d.target);
    const srv = http.createServer((q, r) => { let f = decodeURIComponent(q.url.split('?')[0]); if (f.endsWith('/')) f += 'index.html'; const fp = path.join(ROOT, f);
        if (!fs.existsSync(fp)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }[path.extname(fp)] || 'application/octet-stream' }); fs.createReadStream(fp).pipe(r); }).listen(0);
    const url = 'http://localhost:' + srv.address().port + '/gully-cricket-scorer-for-friends-matches/';
    const b = await chromium.launch();
    for (const [name, opts] of [['desktop', { viewport: { width: 1280, height: 1000 } }], ['phone', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }]]) {
        const ctx = await b.newContext({ ...opts, colorScheme: 'dark', serviceWorkers: 'block' });
        await ctx.route(/goatcounter|zgo/, r => r.fulfill({ status: 200, body: '' }));
        await ctx.addInitScript(s => { if (!sessionStorage.getItem('x')) { localStorage.setItem('gully-cricket-scorer-for-friends-matches.match', s); sessionStorage.setItem('x', '1'); } }, JSON.stringify(m));
        const p = await ctx.newPage();
        await p.goto(url);
        await p.evaluate(() => window.scrollTo(0, 0));
        await p.screenshot({ path: path.join(DIR, 'screenshots/' + name + '.png') });
        await ctx.close();
    }
    await b.close(); srv.close();
})();
