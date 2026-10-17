// Makes screenshots/desktop.png (the plan before starting) and screenshots/phone.png (during the workout) from the README example. Run: node shots.js
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), SLUG = 'interval-workout-timer-for-hiit-and-circuits';
const at = (d, h, m, s = 0) => new Date(2026, 9, d, h, m, s).getTime();
const T0 = at(18, 19, 0);   // Sun 18 Oct 2026, 7:00 pm
const circuit = { name: 'Evening circuit', warm: 180, work: 40, rest: 20, rounds: 4, sets: 3, setRest: 60, cool: 120,
    moves: [{ name: 'Squats', secs: null }, { name: 'Push-ups', secs: null }, { name: 'Lunges', secs: null }, { name: 'Plank', secs: null }] };
const history = [
    { id: 'h1', at: at(12, 7, 10), name: 'Evening circuit', secs: 1080, planned: 1080, full: true },
    { id: 'h2', at: at(14, 19, 5), name: 'Tabata', secs: 230, planned: 230, full: true },
    { id: 'h3', at: at(16, 18, 40), name: 'Evening circuit', secs: 1080, planned: 1080, full: true },
    { id: 'h4', at: at(17, 8, 0), name: 'Stretching', secs: 230, planned: 230, full: true }];
const saved = [{ id: 's1', w: circuit }, { id: 's2', w: { name: 'Tabata', warm: 0, work: 20, rest: 10, rounds: 8, sets: 1, setRest: 60, cool: 0, moves: [] } }];
const base = { v: 1, nextId: 20, current: circuit, settings: { beeps: true, countdown: true, voice: false, vibrate: true, awake: true }, saved, history, run: null };
function blocks(w) { const b = []; let t = 0; const add = x => { if (x.secs > 0) { x.i = b.length; x.start = t; t += x.secs; b.push(x); } };
    add({ kind: 'warm', secs: w.warm, name: '' });
    for (let s = 1; s <= w.sets; s++) { for (let r = 1; r <= w.rounds; r++) { add({ kind: 'work', secs: w.work, name: w.moves[(r - 1) % 4].name, round: r, set: s }); if (r < w.rounds) add({ kind: 'rest', secs: w.rest, name: '', round: r, set: s }); }
        if (s < w.sets) add({ kind: 'setrest', secs: w.setRest, name: '', set: s }); }
    add({ kind: 'cool', secs: w.cool, name: '' }); return b; }
const running = Object.assign({}, base, { run: { startAt: T0, pausedAt: null, began: T0, pausedMs: 0, skippedMs: 0, blocks: blocks(circuit), total: 1080, name: 'Evening circuit', rounds: 4, sets: 3 } });
const srv = http.createServer((q, s) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p);
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); }
    s.writeHead(200, { 'content-type': { html: 'text/html', js: 'text/javascript', css: 'text/css', svg: 'image/svg+xml', png: 'image/png' }[f.split('.').pop()] || 'application/octet-stream' }); s.end(fs.readFileSync(f)); });
srv.listen(0, async () => {
    const b = await chromium.launch();
    const jobs = process.argv[2] === 'all'
        ? [[1280, 'desktop.png', 1, 1000, base, T0], [390, 'phone.png', 2, 1100, running, T0 + 310000], [1280, 'x-desktop-run.png', 1, 1000, running, T0 + 310000], [390, 'x-phone-plan.png', 2, 2400, base, T0]]
        : [[1280, 'desktop.png', 1, 1000, base, T0], [390, 'phone.png', 2, 1100, running, T0 + 310000]];
    for (const [w, file, scale, h, data, time] of jobs) {
        const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: scale, colorScheme: 'dark', locale: 'en-US' });
        await ctx.route(/goatcounter\.com|gc\.zgo\.at/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
        const p = await ctx.newPage();
        await p.clock.install({ time: time - 3000 });
        await p.addInitScript(([k, v]) => localStorage.setItem(k, v), [SLUG + '.data', JSON.stringify(data)]);
        await p.goto('http://localhost:' + srv.address().port + '/' + SLUG + '/');
        await p.clock.pauseAt(time);
        await p.clock.runFor(data.run ? 300 : 15000);   // the plan's "Ends at" line refreshes every 15 s
        await p.evaluate(() => { document.getElementById('sound-warn').hidden = true; });   // no tap happens in a screenshot
        const out = file.startsWith('x-') ? path.join(process.env.SP || __dirname, file) : path.join(__dirname, 'screenshots', file);
        await p.screenshot({ path: out });
        await ctx.close();
    }
    await b.close(); srv.close();
});
