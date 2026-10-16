// Makes screenshots/desktop.png and screenshots/phone.png from the worked example (today Fri 16 Oct 2026, exam Fri 23 Oct). Run: node shots.js
const fs = require('fs'), path = require('path'), http = require('http');
let pw; try { pw = require('playwright'); } catch (e) { pw = require('playwright-core'); }
const { STATE } = require('./fixtures.js');
const ROOT = path.join(__dirname, '..'), OUT = process.argv[2] || path.join(__dirname, 'screenshots');
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
    for (const [name, w, h, scale] of [['desktop', 1280, 1180, 1], ['phone', 390, 1300, 2]]) {
        const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: scale, timezoneId: 'Asia/Karachi', colorScheme: 'dark' });
        await ctx.route(/goatcounter\.com|gc\.zgo\.at/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
        await ctx.addInitScript(s => { try { localStorage.setItem('spaced-repetition-flashcards-for-exams.state', s); } catch (e) {} }, JSON.stringify(STATE));
        const page = await ctx.newPage();
        await page.clock.setFixedTime(new Date(Date.UTC(2026, 9, 16, 14, 0)));
        await page.goto('http://127.0.0.1:' + srv.address().port + '/spaced-repetition-flashcards-for-exams/', { waitUntil: 'networkidle' });
        if (name === 'desktop') await page.click('#dlist .dbox:first-child .secondary');
        await page.click('#study-all');
        await page.keyboard.press('3'); await page.keyboard.press('Space'); await page.keyboard.press('3'); // answer the first card, then show the next answer
        await page.keyboard.press('Space');
        await page.evaluate(() => { window.scrollTo(0, 0); document.activeElement.blur(); });
        await page.waitForTimeout(300);
        await page.screenshot({ path: path.join(OUT, name + '.png') });
        await ctx.close();
    }
    await browser.close(); srv.close(); console.log('screenshots written to ' + OUT);
})();
