// Makes screenshots/desktop.png and screenshots/phone.png from a realistic night. Run from the repo root:
//   node contraction-timer-for-labour/shots.js
const fs = require('fs'), path = require('path'), http = require('http');
let pw; try { pw = require('playwright'); } catch (e) { pw = require('playwright-core'); }
const ROOT = path.join(__dirname, '..'), OUT = process.argv[2] || path.join(__dirname, 'screenshots');
// 14 contractions from 02:04, about 5 minutes apart, lasting about a minute, waters broke at 02:41
function night() {
    const d = (h, m, s) => new Date(2026, 9, 15, h, m, s).getTime();
    const gaps = [0, 312, 295, 301, 288, 305, 279, 296, 284, 290, 276, 293, 281, 287];
    const lens = [52, 58, 61, 63, 57, 66, 64, 62, 68, 65, 70, 67, 72, 69];
    const str = ['mild', 'mild', 'mild', 'medium', 'medium', 'medium', '', 'medium', 'strong', 'medium', 'strong', 'strong', 'strong', 'strong'];
    let t = d(2, 4, 10); const items = [];
    gaps.forEach((g, i) => { t += g * 1000; items.push({ id: 'n' + i, start: t, end: t + lens[i] * 1000, strength: str[i] }); });
    return { now: items[13].end + 95 * 1000, state: { v: 1, items, notes: [{ id: 'w1', at: d(2, 41, 0), kind: 'waters', text: 'Clear fluid, a small trickle' }], running: null, rule: { preset: '511' }, wake: false } };
}
function serve() {
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
    return new Promise(res => {
        const s = http.createServer((q, r) => {
            let p = decodeURIComponent(q.url.split('?')[0]).replace(/^\/apps/, ''); if (p.endsWith('/')) p += 'index.html';
            const f = path.join(ROOT, p);
            if (!f.startsWith(ROOT) || !fs.existsSync(f)) { r.writeHead(404); return r.end('nf'); }
            r.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f));
        }).listen(0, '127.0.0.1', () => res({ s, base: 'http://127.0.0.1:' + s.address().port + '/apps' }));
    });
}
module.exports = { night };
if (require.main === module) (async () => {
    const srv = await serve(), browser = await pw.chromium.launch(), n = night();
    for (const [name, w, h, scale] of [['desktop', 1280, 1180, 1], ['phone', 390, 1500, 2]]) {
        const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: scale, locale: 'en-GB', timezoneId: 'Asia/Karachi', colorScheme: 'dark' });
        await ctx.route(/goatcounter\.com|gc\.zgo\.at/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
        await ctx.addInitScript(s => { try { if (!localStorage.getItem('contraction-timer-for-labour.state')) localStorage.setItem('contraction-timer-for-labour.state', s); } catch (e) {} }, JSON.stringify(n.state));
        const page = await ctx.newPage();
        await page.clock.install({ time: n.now });
        await page.goto(srv.base + '/contraction-timer-for-labour/', { waitUntil: 'networkidle' });
        await page.clock.runFor(1500);
        await page.screenshot({ path: path.join(OUT, name + '.png') });
        await ctx.close();
    }
    await browser.close(); srv.s.close(); console.log('screenshots written to ' + OUT);
})();
