// Makes screenshots/desktop.png and screenshots/phone.png from the worked example in the README. Run: node shots.js
// 16:8 plan, last meal at 20:00 yesterday, it is now 10:30 on Thu 22 Oct 2026, with a week of fasts behind it.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), SLUG = 'intermittent-fasting-timer-with-history';
const at = (d, h, m) => new Date(2026, 9, d, h, m || 0).getTime();
const fast = (id, s, e, goalH, note) => ({ id, start: s, end: e, goalMin: goalH * 60, note: note || '' });
const data = { v: 1, settings: { goalMin: 960, h12: false, notify: false, vibrate: true }, current: { start: at(21, 20), goalMin: 960, notified: false },
    fasts: [fast('f6', at(20, 19, 30), at(21, 12, 5), 16, 'Easy, busy morning'), fast('f5', at(19, 20, 15), at(20, 12, 20), 16), fast('f4', at(18, 21), at(19, 13, 10), 16),
        fast('f3', at(17, 20), at(18, 10, 15), 16, 'Breakfast meeting'), fast('f2', at(16, 19, 45), at(17, 14, 0), 18), fast('f1', at(15, 20, 30), at(16, 12, 45), 16)] };
module.exports = { data, at, SLUG };
if (require.main === module) {
    const srv = http.createServer((q, s) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p);
        if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); }
        s.writeHead(200, { 'content-type': { html: 'text/html', js: 'text/javascript', css: 'text/css', svg: 'image/svg+xml', png: 'image/png', webmanifest: 'application/manifest+json' }[f.split('.').pop()] || 'application/octet-stream' }); s.end(fs.readFileSync(f)); });
    srv.listen(0, async () => {
        const b = await chromium.launch();
        for (const [w, file, scale, h] of [[1280, 'desktop.png', 1, 1180], [390, 'phone.png', 2, 1560]]) {
            const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: scale, colorScheme: 'dark', timezoneId: 'Asia/Karachi' });
            const p = await ctx.newPage();
            await p.clock.install({ time: at(22, 10, 30) + 5000 });
            await p.route(/goatcounter|gc\.zgo\.at/, r => r.abort());
            await p.addInitScript(([k, v]) => localStorage.setItem(k, v), [SLUG + '.data', JSON.stringify(data)]);
            await p.goto('http://localhost:' + srv.address().port + '/' + SLUG + '/');
            await p.clock.pauseAt(at(22, 10, 30) + 7000);
            await p.waitForTimeout(800);
            await p.screenshot({ path: path.join(__dirname, 'screenshots', file) });
            await ctx.close();
        }
        await b.close(); srv.close();
    });
}
