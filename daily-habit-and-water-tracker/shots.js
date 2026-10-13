// Screenshots for the README: node shots.js  (run from this folder; serves the repo itself)
const { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const types = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml', png: 'image/png', webmanifest: 'application/manifest+json' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': types[f.split('.').pop()] || 'application/octet-stream' }); r.end(fs.readFileSync(f)); });
srv.listen(0, async () => {
    const base = 'http://localhost:' + srv.address().port + '/daily-habit-and-water-tracker/';
    const seed = require('./seed.js')(), out = process.argv[2] || path.join(__dirname, 'screenshots');
    const b = await chromium.launch();
    for (const [name, w, h, scale] of [['desktop', 1280, 1000, 1], ['phone', 390, 1400, 2]]) {
        const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: scale, colorScheme: 'dark' });
        await ctx.route(/goatcounter|gc\.zgo\.at/, r => r.fulfill({ status: 200, body: '' }));
        const p = await ctx.newPage();
        await p.clock.setFixedTime(new Date('2026-10-14T18:30:00'));
        await p.addInitScript(s => { try { if (!localStorage.getItem('daily-habit-and-water-tracker.state')) localStorage.setItem('daily-habit-and-water-tracker.state', s); } catch (e) {} }, JSON.stringify(seed));
        await p.goto(base);
        if (name === 'desktop') await p.click('[data-fk="det-water"]');
        await p.evaluate(() => document.activeElement && document.activeElement.blur());
        await p.waitForTimeout(400);
        fs.mkdirSync(out, { recursive: true });
        await p.screenshot({ path: path.join(out, name + '.png'), fullPage: name === 'desktop' ? false : false });
        await ctx.close();
    }
    await b.close(); srv.close();
});
