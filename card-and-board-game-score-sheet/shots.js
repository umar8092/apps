// Makes screenshots/desktop.png and phone.png with the example situation. Run from the repo root: node card-and-board-game-score-sheet/shots.js
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), DIR = __dirname;
(async () => {
    const srv = http.createServer((q, r) => { let f = decodeURIComponent(q.url.split('?')[0]); if (f.endsWith('/')) f += 'index.html'; const fp = path.join(ROOT, f);
        if (!fs.existsSync(fp)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }[path.extname(fp)] || 'application/octet-stream' }); fs.createReadStream(fp).pipe(r); }).listen(0);
    const url = 'http://localhost:' + srv.address().port + '/card-and-board-game-score-sheet/';
    const b = await chromium.launch();
    for (const [name, opts] of [['desktop', { viewport: { width: 1280, height: 900 } }], ['phone', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }]]) {
        const ctx = await b.newContext({ ...opts, colorScheme: 'dark', serviceWorkers: 'block' });
        await ctx.route(/goatcounter|zgo/, r => r.fulfill({ status: 200, body: '' }));
        const p = await ctx.newPage();
        await p.goto(url);
        await p.selectOption('#preset', 'pool101');
        const names = ['Ammi', 'Abbu', 'Sara', 'Ali'];
        for (let i = 0; i < names.length; i++) { if (i >= 2) await p.click('#add-name'); await p.fill('#name-' + i, names[i]); }
        await p.click('#start');
        const round = async v => { const ins = p.locator('#entry-list input[data-pid]'); for (let i = 0; i < v.length; i++) await ins.nth(i).fill(String(v[i])); await p.click('#save-round'); };
        await round([0, 20, 40, 80]); await round([20, 0, 20, 30]); await round([25, 40, 0]);
        await p.locator('#entry-list input[data-pid]').nth(0).fill('0');
        await p.locator('#entry-list input[data-pid]').nth(2).fill('20');
        await p.locator('#toast').evaluate(e => { e.hidden = true; });
        await p.evaluate(() => window.scrollTo(0, 0));
        await p.screenshot({ path: path.join(DIR, 'screenshots/' + name + '.png') });
        await ctx.close();
    }
    await b.close(); srv.close();
})();
