// Makes screenshots/desktop.png and screenshots/phone.png from the worked example in the README. Run: node shots.js
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), SLUG = 'multiple-kitchen-timers-for-cooking';
const at = (h, m, s = 0) => new Date(2026, 9, 17, h, m, s).getTime(), M = 60000;
const T = at(18, 38, 20);
const run = (id, name, start, mins) => ({ id, name, status: 'running', length: mins * M, total: mins * M, endAt: start + mins * M, created: start });
const data = { v: 1, nextId: 30, settings: { sound: 'beeps', vibrate: true, awake: true, notify: false },
    favs: [{ id: 'f1', name: 'Soft-boiled egg', ms: 6 * M }, { id: 'f2', name: 'Hard-boiled egg', ms: 10 * M }, { id: 'f3', name: 'Pasta', ms: 10 * M },
        { id: 'f4', name: 'White rice', ms: 15 * M }, { id: 'f5', name: 'Tea', ms: 3 * M }, { id: 'f6', name: 'Roast chicken', ms: 80 * M }],
    timers: [run('t1', 'Rice', at(18, 30), 15), run('t2', 'Pasta', at(18, 31), 10),
        Object.assign(run('t3', 'Garlic bread', at(18, 30), 6.5), { status: 'done', endedAt: at(18, 36, 30), silenced: false }),
        run('t4', 'Roast chicken', at(18, 10), 80)] };
const srv = http.createServer((q, s) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p);
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); }
    s.writeHead(200, { 'content-type': { html: 'text/html', js: 'text/javascript', css: 'text/css', svg: 'image/svg+xml', png: 'image/png' }[f.split('.').pop()] || 'application/octet-stream' }); s.end(fs.readFileSync(f)); });
srv.listen(0, async () => {
    const b = await chromium.launch();
    for (const [w, file, scale, h] of [[1280, 'desktop.png', 1, 1080], [390, 'phone.png', 2, 1560]]) {
        const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: scale, colorScheme: 'dark', locale: 'en-US' });
        await ctx.route(/goatcounter\.com|gc\.zgo\.at/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
        const p = await ctx.newPage();
        await p.clock.install({ time: T - 5000 });
        await p.addInitScript(([k, v]) => localStorage.setItem(k, v), [SLUG + '.data', JSON.stringify(data)]);
        await p.goto('http://localhost:' + srv.address().port + '/' + SLUG + '/');
        await p.clock.pauseAt(T);
        await p.evaluate(() => { document.getElementById('sound-warn').hidden = true; });   // no tap happens in a screenshot
        if (w < 600) await p.evaluate(() => document.querySelectorAll('.tbox').forEach(e => e.style.animation = 'none'));
        await p.screenshot({ path: path.join(__dirname, 'screenshots', file) });
        await ctx.close();
    }
    await b.close(); srv.close();
});
