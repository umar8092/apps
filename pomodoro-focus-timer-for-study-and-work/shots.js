// Makes screenshots/desktop.png and screenshots/phone.png from the worked example in the README. Run: node shots.js
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), SLUG = 'pomodoro-focus-timer-for-study-and-work';
const at = (d, h, m) => new Date(2026, 9, d, h, m).getTime(), M = 60000;
const rec = (d, h, m, mins, task, name, full = true) => ({ id: 'r' + at(d, h, m), start: at(d, h, m), end: at(d, h, m) + mins * M, mins, task, name, full });
const tasks = [{ id: 'thesis', name: 'Thesis chapter 2', est: 24, done: false, created: 0 }, { id: 'mail', name: 'Emails', est: null, done: false, created: 0 },
    { id: 'stats', name: 'Statistics problem set', est: 8, done: false, created: 0 }, { id: 'slides', name: 'Seminar slides', est: 3, done: true, created: 0 }];
const records = [];
for (const [d, n] of [[11, 2], [12, 4], [13, 6], [14, 3], [15, 5], [16, 4]]) for (let i = 0; i < n; i++) records.push(rec(d, 9 + i, i % 2 ? 30 : 0, 25, i % 3 === 2 ? 'stats' : i === 0 && d < 14 ? 'slides' : 'thesis', ''));
records.push(rec(17, 9, 0, 25, 'thesis', ''), rec(17, 9, 30, 25, 'thesis', ''), rec(17, 10, 0, 25, 'thesis', ''), rec(17, 10, 33, 25, 'mail', ''), rec(17, 11, 13, 12, 'thesis', '', false));
const data = { v: 1, settings: { focus: 25, short: 5, long: 15, every: 4, autoBreak: false, autoFocus: false, sound: 'bell', vibrate: true, awake: false, notify: false, goal: 8 }, tasks, records,
    timer: { mode: 'focus', status: 'running', length: 25 * M, remaining: 25 * M, startedAt: at(17, 11, 30), endsAt: at(17, 11, 55), cycle: 0, cycleDay: '2026-10-17', taskId: 'thesis' } };
const srv = http.createServer((q, s) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p);
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); }
    s.writeHead(200, { 'content-type': { html: 'text/html', js: 'text/javascript', css: 'text/css', svg: 'image/svg+xml', png: 'image/png' }[f.split('.').pop()] || 'application/octet-stream' }); s.end(fs.readFileSync(f)); });
srv.listen(0, async () => {
    const b = await chromium.launch();
    for (const [w, file, scale, h] of [[1280, 'desktop.png', 1, 1240], [390, 'phone.png', 2, 1500]]) {
        const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: scale, colorScheme: 'dark' });
        const p = await ctx.newPage();
        await p.clock.install({ time: at(17, 11, 36) + 18000 });
        await p.addInitScript(([k, v]) => localStorage.setItem(k, v), [SLUG + '.data', JSON.stringify(data)]);
        await p.goto('http://localhost:' + srv.address().port + '/' + SLUG + '/');
        await p.clock.pauseAt(at(17, 11, 36) + 20000);
        await p.screenshot({ path: path.join(__dirname, 'screenshots', file) });
        await ctx.close();
    }
    await b.close(); srv.close();
});
