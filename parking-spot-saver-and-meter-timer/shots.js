// Makes screenshots/desktop.png and screenshots/phone.png from the worked example in the README. Run: node shots.js
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), SLUG = 'parking-spot-saver-and-meter-timer';
const at = (h, m, day = 25) => Date.UTC(2026, 9, day, h - 5, m);   // Karachi time
const T = at(15, 18);
const data = { v: 1, nextId: 3, settings: { sound: true, vibrate: true, notify: false, warnMin: 10, lastChoice: '7200000' }, spots: [
    { id: 's2', car: 'My car', note: 'Level B2, row F, bay 34 (blue zone, near the lifts)', loc: { lat: 24.8607, lon: 67.0011, acc: 12, at: at(13, 40) }, hasPhoto: false,
        parkedAt: at(13, 40), endAt: at(15, 40), paidFrom: at(13, 40), warnMin: 10, warned: false, ended: false },
    { id: 's1', car: 'Honda', note: 'Airport long-stay P2, zone C, row 14', loc: { lat: 24.9008, lon: 67.1681, acc: 18, at: at(6, 0, 23) }, hasPhoto: false,
        parkedAt: at(6, 0, 23), endAt: at(6, 0, 26), paidFrom: at(6, 0, 23), warnMin: 30, warned: false, ended: false }] };
const srv = http.createServer((q, s) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p);
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); }
    s.writeHead(200, { 'content-type': { html: 'text/html', js: 'text/javascript', css: 'text/css', svg: 'image/svg+xml', png: 'image/png' }[f.split('.').pop()] || 'application/octet-stream' }); s.end(fs.readFileSync(f)); });
srv.listen(0, async () => {
    const b = await chromium.launch();
    for (const [w, file, scale, h] of [[1280, 'desktop.png', 1, 1180], [390, 'phone.png', 2, 1500]]) {
        const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: scale, colorScheme: 'dark', locale: 'en-US', timezoneId: 'Asia/Karachi',
            permissions: ['geolocation'], geolocation: { latitude: 24.8607 - 0.0018, longitude: 67.0011, accuracy: 10 } });
        await ctx.route(/goatcounter\.com|gc\.zgo\.at/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
        const p = await ctx.newPage();
        await p.clock.install({ time: T - 5000 });
        await p.addInitScript(([k, v]) => localStorage.setItem(k, v), [SLUG + '.data', JSON.stringify(data)]);
        await p.goto('http://localhost:' + srv.address().port + '/' + SLUG + '/');
        await p.clock.pauseAt(T);
        await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
        await p.click('.spot >> nth=0 >> text=How far is my car?');
        await p.waitForFunction(() => document.querySelector('.far-out').textContent.length > 0);
        if (w >= 900) { await p.fill('#note', 'Street outside the bank, blue sign'); await p.evaluate(() => { document.activeElement.blur(); scrollTo(0, 0); }); }
        await p.screenshot({ path: path.join(__dirname, 'screenshots', file) });
        await ctx.close();
    }
    await b.close(); srv.close();
});
