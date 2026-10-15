// Makes screenshots/desktop.png and screenshots/phone.png from the worked example (six periods, today 16 Oct 2026). Run: node shots.js
const fs = require('fs'), path = require('path'), http = require('http');
let pw; try { pw = require('playwright'); } catch (e) { pw = require('playwright-core'); }
const ROOT = path.join(__dirname, '..'), OUT = process.argv[2] || path.join(__dirname, 'screenshots');
const STATE = { v: 1, periods: [['2026-05-11', 5], ['2026-06-08', 5], ['2026-07-07', 6], ['2026-08-03', 5], ['2026-09-02', 4], ['2026-10-01', 5]].map(([start, len]) => ({ start, len, skipGap: false })),
    days: { '2026-10-01': { s: ['cramps', 'heavy'], n: 'Took a painkiller' }, '2026-10-02': { s: ['cramps'], n: '' }, '2026-10-14': { s: ['discharge'], n: '' } },
    settings: { cycle: 28, len: 5, paused: false, weekStart: 1, icsFertile: true } };
function serve() {
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
    return new Promise(res => {
        const s = http.createServer((q, r) => {
            let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
            const f = path.join(ROOT, p);
            if (!f.startsWith(ROOT) || !fs.existsSync(f)) { r.writeHead(404); return r.end('nf'); }
            r.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f));
        }).listen(0, '127.0.0.1', () => res(s));
    });
}
(async () => {
    const srv = await serve(), browser = await pw.chromium.launch();
    for (const [name, w, h, scale] of [['desktop', 1280, 1080, 1], ['phone', 390, 1480, 2]]) {
        const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: scale, timezoneId: 'Asia/Karachi', colorScheme: 'dark' });
        await ctx.route(/goatcounter\.com|gc\.zgo\.at/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
        await ctx.addInitScript(s => { try { localStorage.setItem('period-and-ovulation-calendar.state', s); } catch (e) {} }, JSON.stringify(STATE));
        const page = await ctx.newPage();
        await page.clock.setFixedTime(new Date(2026, 9, 16, 10, 0));
        await page.goto('http://127.0.0.1:' + srv.address().port + '/period-and-ovulation-calendar/', { waitUntil: 'networkidle' });
        await page.screenshot({ path: path.join(OUT, name + '.png') });
        await ctx.close();
    }
    await browser.close(); srv.close(); console.log('screenshots written to ' + OUT);
})();
