// Makes screenshots/desktop.png and phone.png with the example situation. Run from the repo root: node bus-and-train-timetable-for-my-stops/shots.js
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), DIR = __dirname;
(async () => {
    const srv = http.createServer((q, r) => { let f = decodeURIComponent(q.url.split('?')[0]); if (f.endsWith('/')) f += 'index.html'; const fp = path.join(ROOT, f);
        if (!fs.existsSync(fp)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }[path.extname(fp)] || 'application/octet-stream' }); fs.createReadStream(fp).pipe(r); }).listen(0);
    const url = 'http://localhost:' + srv.address().port + '/bus-and-train-timetable-for-my-stops/';
    const b = await chromium.launch();
    for (const [name, opts] of [['desktop', { viewport: { width: 1280, height: 900 } }], ['phone', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }]]) {
        const ctx = await b.newContext({ ...opts, colorScheme: 'dark', timezoneId: 'Asia/Karachi', serviceWorkers: 'block' });
        await ctx.route(/goatcounter|zgo/, r => r.fulfill({ status: 200, body: '' }));
        const p = await ctx.newPage();
        await p.clock.install({ time: new Date('2026-10-29T07:33:00+05:00') });
        await p.goto(url); await p.click('#example');
        await p.locator('#toast').evaluate(e => { e.hidden = true; });
        if (name === 'desktop') { await p.locator('#routes .route').nth(0).getByText('Full timetable').click(); await p.evaluate(() => window.scrollTo(0, 0)); await p.screenshot({ path: path.join(DIR, 'screenshots/desktop.png') }); }
        else { await p.evaluate(() => window.scrollTo(0, document.querySelector('#clock-bar').getBoundingClientRect().top + scrollY - 70)); await p.screenshot({ path: path.join(DIR, 'screenshots/phone.png') }); }
        await ctx.close();
    }
    await b.close(); srv.close();
})();
