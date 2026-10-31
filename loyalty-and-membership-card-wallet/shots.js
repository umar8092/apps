// Makes screenshots/desktop.png and phone.png with the example situation. Run from the repo root: node loyalty-and-membership-card-wallet/shots.js
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), DIR = __dirname;
const DAY = d => { const t = new Date(); t.setDate(t.getDate() + d); return t.toISOString().slice(0, 10); };
const CARDS = { version: 1, cards: [
    { id: 'k1', name: 'Imtiaz Super Market', number: '9501101530003', format: 'ean13', color: 'red', uses: 14, lastUsed: 9, created: 1 },
    { id: 'k3', name: 'Boots Advantage Card', number: '633912345678901234', format: 'code128', color: 'blue', uses: 6, lastUsed: 8, created: 3, note: '2,350 points' },
    { id: 'k2', name: 'Imtiaz Super Market', owner: 'Mum', number: '4006381333931', format: 'ean13', color: 'orange', uses: 3, lastUsed: 7, created: 2 },
    { id: 'k4', name: 'City Library', number: 'LIB-0451-K', format: 'code39', color: 'teal', uses: 2, lastUsed: 6, created: 4, expires: DAY(12) },
    { id: 'k5', name: 'Shell Go+', number: '7077 1234 5678 0042', format: 'code128', color: 'yellow', uses: 1, lastUsed: 5, created: 5 },
    { id: 'k6', name: 'FitZone Gym', owner: 'Ali', number: 'M 7781', format: 'none', color: 'purple', uses: 1, lastUsed: 4, created: 6, note: 'Front desk PIN 4410' }] };
(async () => {
    const srv = http.createServer((q, r) => { let f = decodeURIComponent(q.url.split('?')[0]); if (f.endsWith('/')) f += 'index.html'; const fp = path.join(ROOT, f);
        if (!fs.existsSync(fp)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }[path.extname(fp)] || 'application/octet-stream' }); fs.createReadStream(fp).pipe(r); }).listen(0);
    const url = 'http://localhost:' + srv.address().port + '/loyalty-and-membership-card-wallet/';
    const b = await chromium.launch();
    for (const [name, opts] of [['desktop', { viewport: { width: 1280, height: 900 } }], ['phone', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }]]) {
        const ctx = await b.newContext({ ...opts, colorScheme: 'dark', serviceWorkers: 'block' });
        await ctx.route(/goatcounter|zgo/, r => r.fulfill({ status: 200, body: '' }));
        await ctx.addInitScript(d => localStorage.setItem('loyalty-and-membership-card-wallet.cards', d), JSON.stringify(CARDS));
        const p = await ctx.newPage();
        await p.goto(url);
        if (name === 'desktop') {
            await p.fill('#name', 'Daraz Mall Gift Card'); await p.fill('#number', '8 901030 012341'); await p.evaluate(() => { document.activeElement.blur(); window.scrollTo(0, 0); });
            await p.screenshot({ path: path.join(DIR, 'screenshots/desktop.png') });
        } else {
            await p.locator('#list .show-btn').first().click();
            await p.screenshot({ path: path.join(DIR, 'screenshots/phone.png') });
        }
        await ctx.close();
    }
    await b.close(); srv.close();
})();
