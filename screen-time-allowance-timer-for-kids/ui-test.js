// Drives the real page in headless Chromium: node ui-test.js [--shots] [--base https://umar8092.github.io/apps]
// Without --base it serves this repo on localhost. With --base it tests the LIVE page. The clock starts on Fri 23 Oct 2026, 17:00.
const pw = (() => { for (const m of ['playwright', 'playwright-core']) { try { return require(m); } catch (e) { /* next */ } } throw new Error('playwright not found'); })();
const path = require('path'), fs = require('fs'), http = require('http'), os = require('os');
const bi = process.argv.indexOf('--base');
const shots = process.argv.includes('--shots');
let fail = 0, url;
const ok = (name, cond, extra) => { if (!cond) fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond || extra == null ? '' : '  -> ' + JSON.stringify(extra))); };
const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
const at = (d, h, m) => new Date(2026, 9, d, h, m).getTime();
const NOW = at(23, 17, 0);
const SLUG = 'screen-time-allowance-timer-for-kids', KEY = SLUG + '.state';
const MIN = 60000;

function serve() {
    const ROOT = path.resolve(__dirname, '..');
    const types = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml', png: 'image/png', webmanifest: 'application/manifest+json' };
    return new Promise(res => {
        const s = http.createServer((req, rs) => {
            let p = decodeURIComponent(req.url.split('?')[0]).replace(/^\/apps/, ''); if (p.endsWith('/')) p += 'index.html';
            const f = path.join(ROOT, p);
            if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rs.writeHead(404); return rs.end('nf'); }
            rs.writeHead(200, { 'content-type': types[f.split('.').pop()] || 'application/octet-stream' }); rs.end(fs.readFileSync(f));
        }).listen(0, () => res(s));
    });
}

// a realistic family on Friday evening: Ali (9) is on the tablet now, Sara (12) had a bonus for homework, Hamza (5) gets 30 min
function seed(running = true) {
    return { v: 1, seq: 100, kids: [{ id: 1, name: 'Ali', school: 60, weekend: 120 }, { id: 2, name: 'Sara', school: 90, weekend: 180 }, { id: 3, name: 'Hamza', school: 30, weekend: 60 }],
        sessions: [
            { id: 10, kid: 1, start: at(23, 16, 0), end: at(23, 16, 35) }, ...(running ? [{ id: 11, kid: 1, start: at(23, 17, 0), end: null }] : []),
            { id: 12, kid: 2, start: at(23, 15, 30), end: at(23, 16, 0) },
            { id: 13, kid: 3, start: at(23, 15, 0), end: at(23, 15, 40) },
            ...[17, 18, 19, 20, 21, 22].flatMap((d, i) => [
                { id: 20 + i, kid: 1, start: at(d, 17, 0), end: at(d, 17, 0) + [110, 125, 55, 60, 70, 45][i] * MIN },
                { id: 30 + i, kid: 2, start: at(d, 18, 0), end: at(d, 18, 0) + [150, 170, 80, 95, 60, 85][i] * MIN },
                { id: 40 + i, kid: 3, start: at(d, 16, 0), end: at(d, 16, 0) + [50, 60, 30, 25, 30, 20][i] * MIN }])],
        manual: [], bonus: [{ id: 50, kid: 2, date: '2026-10-23', min: 15, note: 'Finished homework early' }], days: {}, settings: { weekend: [0, 6], warn: 5, sound: true } };
}

async function load(b, vp, opt = {}) {
    const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: vp.width < 500 ? 2 : 1, colorScheme: opt.theme || 'dark', locale: 'en-GB', timezoneId: TZ,
        permissions: ['clipboard-read', 'clipboard-write'], acceptDownloads: true, serviceWorkers: 'block' });
    await ctx.route(/goatcounter\.com|gc\.zgo\.at/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
    if (opt.state !== undefined) await ctx.addInitScript(([k, s]) => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem(k, s); } }, [KEY, typeof opt.state === 'string' ? opt.state : JSON.stringify(opt.state)]);
    if (opt.block) await ctx.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
    await ctx.addInitScript(() => { window.__beeps = 0; const C = window.AudioContext; if (C) { const o = C.prototype.createOscillator; C.prototype.createOscillator = function () { window.__beeps++; return o.call(this); }; } navigator.vibrate = () => true; });
    const p = await ctx.newPage();
    await p.clock.install({ time: (opt.time || NOW) - 60000 });
    await p.clock.pauseAt(opt.time || NOW); // the clock only moves when a test moves it
    p.errors = []; p.on('console', m => m.type() === 'error' && p.errors.push(m.text())); p.on('pageerror', e => p.errors.push(String(e)));
    p.bad = []; p.on('response', r => { if (r.status() >= 400) p.bad.push(r.status() + ' ' + r.url()); });
    await p.goto(url, { waitUntil: 'networkidle' });
    return p;
}
const txt = async (p, sel) => ((await p.innerText(sel)) || '').replace(/\s+/g, ' ').trim();
const saved = p => p.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
const kid = name => `section.kid:has(h2:text-is("${name}"))`;
const big = async (p, name) => txt(p, kid(name) + ' .big');
const used = async (p, name) => txt(p, kid(name) + ' .used');
const cls = (p, name) => p.getAttribute(kid(name), 'class');
// show the page at exactly this time (the 1-second tick runs at that moment)
const showAt = async (p, ms) => { await p.clock.setSystemTime(ms - 1000); await p.clock.runFor(1000); };
const clickAt = async (p, ms, sel) => { await p.clock.setSystemTime(ms); await p.click(sel); };
const kbtn = (p, name, label) => p.click(kid(name) + ` .kid-btns button:text-is("${label}")`);
const pbtn = (p, name, label) => p.click(kid(name) + ` .panel button:text-is("${label}")`);

// no input, select or button overlapping another, nothing wider than the page, placeholders fit
async function layoutOK(p, label) {
    const r = await p.evaluate(() => {
        const vis = e => { const s = getComputedStyle(e); const b = e.getBoundingClientRect(); return s.visibility !== 'hidden' && s.display !== 'none' && b.width > 0 && b.height > 0; };
        const els = [...document.querySelectorAll('main input:not([type=file]), main select, main button, main a.secondary, main .day-chip')].filter(vis);
        const boxes = els.map(e => ({ e, b: e.getBoundingClientRect() }));
        const over = [];
        for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
            const a = boxes[i], c = boxes[j];
            if (a.e.contains(c.e) || c.e.contains(a.e)) continue;
            const x = Math.min(a.b.right, c.b.right) - Math.max(a.b.left, c.b.left), y = Math.min(a.b.bottom, c.b.bottom) - Math.max(a.b.top, c.b.top);
            if (x > 1 && y > 1) over.push((a.e.id || a.e.textContent.trim().slice(0, 20)) + ' / ' + (c.e.id || c.e.textContent.trim().slice(0, 20)));
        }
        const wide = document.documentElement.scrollWidth > window.innerWidth;
        const out = [...document.querySelectorAll('main *')].filter(vis).filter(e => e.getBoundingClientRect().right > window.innerWidth + 1).map(e => e.className || e.tagName).slice(0, 5);
        const cut = [...document.querySelectorAll('main input[placeholder]')].filter(vis).filter(i => {
            const c = document.createElement('canvas').getContext('2d'), s = getComputedStyle(i); c.font = s.fontSize + ' ' + s.fontFamily;
            return c.measureText(i.placeholder).width > i.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight) + 1;
        }).map(i => i.id);
        // text that is cut off inside its box (week labels, badges, buttons)
        const clip = [...document.querySelectorAll('main .dmin, main .dname, main button, main .badge, main .big-num')].filter(vis).filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.textContent.trim().slice(0, 20));
        return { over, wide, out, cut, clip };
    });
    ok(label + ': no overlapping controls, no sideways scroll, placeholders and labels fit', !r.over.length && !r.wide && !r.out.length && !r.cut.length && !r.clip.length, r);
}
async function blocksOK(p, label) {
    const over = await p.evaluate(() => {
        const kids = [...document.querySelectorAll('main > *, .col-main > *, .col-side > *, #kids > *')].filter(e => e.offsetParent !== null || getComputedStyle(e).display === 'contents');
        const bx = kids.filter(e => getComputedStyle(e).display !== 'contents').map(e => ({ e, b: e.getBoundingClientRect() })).filter(x => x.b.height > 0);
        const bad = [];
        for (let i = 0; i < bx.length; i++) for (let j = i + 1; j < bx.length; j++) {
            const a = bx[i], c = bx[j]; if (a.e.contains(c.e) || c.e.contains(a.e)) continue;
            if (Math.min(a.b.right, c.b.right) - Math.max(a.b.left, c.b.left) > 1 && Math.min(a.b.bottom, c.b.bottom) - Math.max(a.b.top, c.b.top) > 1) bad.push((a.e.id || a.e.className) + '/' + (c.e.id || c.e.className));
        }
        return bad;
    });
    ok(label + ': no blocks overlap', !over.length, over);
}

async function run() {
    let server;
    if (bi >= 0) url = process.argv[bi + 1].replace(/\/$/, '') + '/' + SLUG + '/';
    else { server = await serve(); url = 'http://localhost:' + server.address().port + '/' + SLUG + '/'; }
    const b = await pw.chromium.launch();
    const phone = { width: 390, height: 844 }, desk = { width: 1280, height: 900 };

    // ---- 1. first use ----
    let p = await load(b, phone);
    ok('first use: the add form is open', await p.isVisible('#add-form') && await txt(p, '#add-h') === 'Add a child');
    ok('first use: no Today bar yet', !(await p.isVisible('#today')));
    ok('first use: defaults 1 h and 2 h', await p.inputValue('#a-school') === '60' && await p.inputValue('#a-weekend') === '120');
    ok('first use: custom boxes hidden', !(await p.isVisible('#a-school-c')) && !(await p.isVisible('#a-weekend-c')));
    await p.fill('#a-name', 'Ali');
    ok('preview', await txt(p, '#a-preview') === 'Ali gets 1 h on school days and 2 h at weekends and on holidays.', await txt(p, '#a-preview'));
    await p.click('#a-save');
    ok('child added', await big(p, 'Ali') === '1 h left today', await big(p, 'Ali'));
    ok('added message', (await txt(p, '#top-msg')).startsWith('Added Ali: 1 h on school days, 2 h at weekends and on holidays.'), await txt(p, '#top-msg'));
    ok('badge says the day', await txt(p, kid('Ali') + ' .badge') === 'School day: 1 h');
    ok('today bar', await txt(p, '#today-h') === 'Friday 23 October' && (await txt(p, '#today-type')).startsWith('School day'), await txt(p, '#today'));
    ok('focus on Start after adding', await p.evaluate(() => document.activeElement.textContent) === 'Start');
    ok('add form closes to a button', await p.isVisible('#open-add') && !(await p.isVisible('#add-form')));
    // second child with custom times and errors
    await p.click('#open-add');
    await p.fill('#a-name', 'ali'); await p.click('#a-save');
    ok('same name refused', (await txt(p, '#e-a-name')).startsWith('There is already a child called ali'));
    await p.fill('#a-name', '   '); await p.click('#a-save');
    ok('blank name refused', await txt(p, '#e-a-name') === "Type the child's name.");
    await p.fill('#a-name', 'Sara');
    await p.selectOption('#a-school', 'custom');
    ok('custom box appears with focus', await p.isVisible('#a-school-c') && await p.evaluate(() => document.activeElement.id) === 'a-school-c');
    ok('preview hidden while custom is empty', await txt(p, '#a-preview') === '');
    await p.click('#a-save');
    ok('empty custom refused', (await txt(p, '#e-a-school')).startsWith('Type the minutes'));
    await p.fill('#a-school-c', 'lots'); await p.click('#a-save');
    ok('words refused', (await txt(p, '#e-a-school')).startsWith('Type the minutes'));
    await p.fill('#a-school-c', '-30'); await p.click('#a-save');
    ok('negative refused', await txt(p, '#e-a-school') === 'Time cannot be below zero.');
    await p.fill('#a-school-c', '30 h'); await p.click('#a-save');
    ok('too long refused', (await txt(p, '#e-a-school')).startsWith('That is more than 24 h'));
    await p.fill('#a-school-c', '1:30');
    ok('custom preview', await txt(p, '#a-preview') === 'Sara gets 1 h 30 min on school days and 2 h at weekends and on holidays.');
    await p.selectOption('#a-weekend', '180');
    await p.press('#a-name', 'Enter');
    ok('Enter adds the child', await big(p, 'Sara') === '1 h 30 min left today', await big(p, 'Sara'));
    // a child with no screen time on school days
    await p.click('#open-add'); await p.fill('#a-name', 'Hamza'); await p.selectOption('#a-school', '0'); await p.selectOption('#a-weekend', '30');
    ok('no screen time preview', await txt(p, '#a-preview') === 'Hamza gets no screen time on school days and 30 min at weekends and on holidays.');
    await p.click('#a-save');
    ok('no screen time today', await big(p, 'Hamza') === 'No screen time today' && (await cls(p, 'Hamza')).includes('none'));
    // Cancel the add form
    await p.click('#open-add'); await p.fill('#a-name', 'X'); await p.click('#a-cancel');
    ok('cancel add', !(await p.isVisible('#add-form')) && (await saved(p)).kids.length === 3);

    // ---- 2. the main situation: Start, Stop, minutes left ----
    await clickAt(p, at(23, 17, 0), kid('Ali') + ' .go');
    ok('Start', (await txt(p, kid('Ali') + ' .go')) === 'Stop' && (await txt(p, kid('Ali') + ' .msg')).startsWith('Started at 17:00. 1 h left today.'), await txt(p, kid('Ali') + ' .msg'));
    await showAt(p, at(23, 17, 20) + 1000);
    ok('counts down while running', await big(p, 'Ali') === '39:59 left today', await big(p, 'Ali'));
    ok('started at line', (await txt(p, kid('Ali') + ' .since')).startsWith('Started at 17:00 (20 min ago)'), await txt(p, kid('Ali') + ' .since'));
    ok('other children do not move', await big(p, 'Sara') === '1 h 30 min left today');
    await clickAt(p, at(23, 17, 35), kid('Ali') + ' .go');
    ok('Stop: 25 min left', await big(p, 'Ali') === '25 min left today', await big(p, 'Ali'));
    ok('Stop: used line', await used(p, 'Ali') === '35 min of 1 h used today.', await used(p, 'Ali'));
    ok('Stop message', (await txt(p, kid('Ali') + ' .msg')).startsWith('Stopped. Ali used 35 min this time. Now: 25 min left today (35 min of 1 h used).'), await txt(p, kid('Ali') + ' .msg'));
    ok('saved', (await saved(p)).sessions.length === 1 && (await saved(p)).sessions[0].start === at(23, 17, 0) && (await saved(p)).sessions[0].end === at(23, 17, 35));
    // two children at once
    await p.click(kid('Ali') + ' .go'); await p.click(kid('Sara') + ' .go');
    await showAt(p, at(23, 17, 45) + 1000);
    ok('two at once count separately', await big(p, 'Ali') === '14:59 left today' && await big(p, 'Sara') === '1:19:59 left today', [await big(p, 'Ali'), await big(p, 'Sara')]);
    await clickAt(p, at(23, 17, 46), kid('Sara') + ' .go');
    // warning, time up, over
    const beeps0 = await p.evaluate(() => window.__beeps);
    await showAt(p, at(23, 17, 55) + 30000);
    ok('warning at 5 min left', (await cls(p, 'Ali')).includes('warn') && (await txt(p, kid('Ali') + ' .alert')).startsWith('Nearly time: 5 min left for Ali.'), [await cls(p, 'Ali'), await txt(p, kid('Ali') + ' .alert')]);
    ok('warning beeps once', await p.evaluate(() => window.__beeps) - beeps0 === 1, await p.evaluate(() => window.__beeps) - beeps0);
    await showAt(p, at(23, 17, 55) + 40000);
    ok('no second beep for the same warning', await p.evaluate(() => window.__beeps) - beeps0 === 1);
    await showAt(p, at(23, 18, 0) + 30000);
    ok('time is up', (await cls(p, 'Ali')).includes('up') && (await txt(p, kid('Ali') + ' .alert')) === 'Time is up for Ali. Tap Stop when the screen is handed back.', await txt(p, kid('Ali') + ' .alert'));
    ok('time up beeps 3 times', await p.evaluate(() => window.__beeps) - beeps0 === 4, await p.evaluate(() => window.__beeps) - beeps0);
    ok('tab title says time is up', (await p.title()).startsWith('Time is up: Ali'));
    await showAt(p, at(23, 18, 12));
    ok('over by 12 min', await big(p, 'Ali') === 'Time is up over by 12 min', await big(p, 'Ali'));
    // reload while running: still counting from the saved start
    await p.reload({ waitUntil: 'networkidle' });
    ok('reload keeps the running session', (await txt(p, kid('Ali') + ' .go')) === 'Stop' && await big(p, 'Ali') === 'Time is up over by 12 min', await big(p, 'Ali'));
    ok('reload does not beep again', await p.evaluate(() => window.__beeps) === 0);
    await clickAt(p, at(23, 18, 12), kid('Ali') + ' .go');
    ok('stopped over', await used(p, 'Ali') === '1 h 12 min of 1 h used today.' && (await p.title()).startsWith('Screen Time'), await used(p, 'Ali'));

    // ---- 3. bonus time ----
    await kbtn(p, 'Sara', '+ Bonus time');
    ok('bonus panel, reason hidden (optional)', await p.isVisible(kid('Sara') + ' .panel') && !(await p.isVisible(kid('Sara') + ' input[id$="-note"]')));
    await pbtn(p, 'Sara', 'Give bonus');
    ok('blank bonus refused', (await txt(p, kid('Sara') + ' .panel .err')).startsWith('Type the minutes'));
    await p.fill(kid('Sara') + ' input[id$="-min"]', '0'); await pbtn(p, 'Sara', 'Give bonus');
    ok('zero bonus refused', (await txt(p, kid('Sara') + ' .panel .err')) === 'Type at least 1 minute.');
    await p.fill(kid('Sara') + ' input[id$="-min"]', '8 h'); await pbtn(p, 'Sara', 'Give bonus');
    ok('huge bonus refused', (await txt(p, kid('Sara') + ' .panel .err')).startsWith('That is more than 6 h'));
    await p.click(kid('Sara') + ' .chip:text-is("15 min")');
    await p.click(kid('Sara') + ' .panel button:text-is("+ Add a reason (optional)")');
    await p.fill(kid('Sara') + ' input[id$="-note"]', 'Finished homework');
    await pbtn(p, 'Sara', 'Give bonus');
    ok('bonus given', await big(p, 'Sara') === '1 h 34 min left today' && await used(p, 'Sara') === '11 min of 1 h 45 min used today (includes 15 min bonus).', [await big(p, 'Sara'), await used(p, 'Sara')]);
    ok('badge keeps the plain allowance', await txt(p, kid('Sara') + ' .badge') === 'School day: 1 h 30 min');
    await p.click(kid('Sara') + ' .msg .undo');
    ok('undo bonus', await big(p, 'Sara') === '1 h 19 min left today', await big(p, 'Sara'));
    await kbtn(p, 'Sara', '+ Bonus time'); await p.fill(kid('Sara') + ' input[id$="-min"]', '15'); await pbtn(p, 'Sara', 'Give bonus');
    ok('bonus without a reason works', (await saved(p)).bonus.length === 1 && (await saved(p)).bonus[0].note === '');
    // a bonus while time is up brings Ali back under
    await kbtn(p, 'Ali', '+ Bonus time'); await p.fill(kid('Ali') + ' input[id$="-min"]', '30'); await pbtn(p, 'Ali', 'Give bonus');
    ok('bonus after going over', await big(p, 'Ali') === '18 min left today' && (await cls(p, 'Ali')).includes('ok'), await big(p, 'Ali'));

    // ---- 4. time added by hand ----
    await kbtn(p, 'Hamza', 'Add time by hand');
    await p.fill(kid('Hamza') + ' input[id$="-min"]', '45'); await p.selectOption(kid('Hamza') + ' select', '2026-10-22');
    await pbtn(p, 'Hamza', 'Add time');
    ok('time added for yesterday', (await txt(p, kid('Hamza') + ' .msg')).startsWith('Added 45 min for yesterday.'), await txt(p, kid('Hamza') + ' .msg'));
    ok('week shows yesterday over', (await txt(p, kid('Hamza') + ' .week-t')) === '45 min of 0 min allowed, over on 1 day.' || (await txt(p, kid('Hamza') + ' .week-t')).includes('over on 1 day'), await txt(p, kid('Hamza') + ' .week-t'));
    ok('today still no screen time', await big(p, 'Hamza') === 'No screen time today');

    // ---- 5. today's sessions: edit, overlap, future, delete ----
    await kbtn(p, 'Ali', "Today's sessions");
    const list = async () => txt(p, kid('Ali') + ' .entries');
    ok('list shows sessions and bonus', (await list()).includes('17:00 to 17:35 35 min') && (await list()).includes('17:35 to 18:12') && (await list()).includes('Bonus: +30 min'), await list());
    ok('list total', (await txt(p, kid('Ali') + ' .panel .preview')) === 'Total: 1 h 12 min of 1 h 30 min (school day).', await txt(p, kid('Ali') + ' .panel .preview'));
    await p.click(kid('Ali') + ' .entries li:nth-child(1) button:text-is("Edit")');
    await p.fill(kid('Ali') + ' input[id$="-ee"]', '17:40'); await p.click(kid('Ali') + ' button:text-is("Save")');
    ok('overlap refused', (await txt(p, kid('Ali') + ' .panel .err:not(:empty)')).startsWith('That overlaps the session from 17:35 to 18:12'), await txt(p, kid('Ali') + ' .panel'));
    await p.fill(kid('Ali') + ' input[id$="-ee"]', '17:30'); await p.click(kid('Ali') + ' button:text-is("Save")');
    ok('session edited', (await list()).includes('17:00 to 17:30 30 min') && await big(p, 'Ali') === '23 min left today', [await list(), await big(p, 'Ali')]);
    ok('list stays open after edit', await p.isVisible(kid('Ali') + ' .entries'));
    await p.click(kid('Ali') + ' .entries li:nth-child(2) button:text-is("Edit")');
    await p.fill(kid('Ali') + ' input[id$="-ee"]', '18:30'); await p.click(kid('Ali') + ' button:text-is("Save")');
    ok('end in the future refused', (await txt(p, kid('Ali') + ' .panel .err:not(:empty)')) === 'The end cannot be later than now.', await txt(p, kid('Ali') + ' .panel'));
    await p.fill(kid('Ali') + ' input[id$="-es"]', '19:00'); await p.click(kid('Ali') + ' button:text-is("Save")');
    ok('start in the future refused', (await txt(p, kid('Ali') + ' .panel .err:not(:empty)')) === 'The start cannot be later than now.');
    await p.click(kid('Ali') + ' .entries button:text-is("Delete session")');
    ok('session deleted', !(await list()).includes('17:35') && await big(p, 'Ali') === '1 h left today', await big(p, 'Ali'));
    await p.click(kid('Ali') + ' .msg .undo');
    ok('undo delete', await big(p, 'Ali') === '23 min left today', await big(p, 'Ali'));
    await kbtn(p, 'Ali', "Today's sessions");
    await p.selectOption(kid('Ali') + ' select[id$="-lday"]', '2026-10-21');
    ok('empty day', (await txt(p, kid('Ali') + ' .panel')).includes('Nothing on this day yet.'));
    await p.click(kid('Ali') + ' .panel button:text-is("Close")');
    ok('panel closes', !(await p.isVisible(kid('Ali') + ' .panel')));

    // ---- 6. holidays and weekend days ----
    await p.click('#today-toggle');
    ok('holiday gives weekend time', await txt(p, kid('Ali') + ' .badge') === 'Weekend: 2 h' && await big(p, 'Ali') === '1 h 23 min left today' && await big(p, 'Hamza') === '30 min left today', [await big(p, 'Ali'), await big(p, 'Hamza')]);
    ok('toggle label flips', await txt(p, '#today-toggle') === 'Make today a weekend day again' || await txt(p, '#today-toggle') === 'Make today a school day again', await txt(p, '#today-toggle'));
    await p.click('#today-toggle');
    ok('back to school day', await txt(p, kid('Ali') + ' .badge') === 'School day: 1 h' && await txt(p, '#today-toggle') === 'Make today a holiday');
    await p.check('[data-f="wd-5"]');
    ok('Friday as a weekend day', await txt(p, kid('Ali') + ' .badge') === 'Weekend: 2 h' && await txt(p, '#today-toggle') === 'Make today a school day', await txt(p, '#today-toggle'));
    await p.click('#today-toggle');
    ok('a school day on a weekend day', await txt(p, kid('Ali') + ' .badge') === 'School day: 1 h');
    await p.click('#today-toggle'); await p.uncheck('[data-f="wd-5"]');
    ok('weekend days saved', JSON.stringify((await saved(p)).settings.weekend) === '[0,6]');

    // ---- 7. settings: warning time, sound ----
    await p.selectOption('#warn', '10');
    ok('warning setting saved', (await saved(p)).settings.warn === 10 && (await txt(p, '#set-msg')).startsWith('You will be warned 10 minutes'));
    await p.uncheck('#sound');
    ok('sound off saved', (await saved(p)).settings.sound === false);
    await p.check('#sound');

    // ---- 8. change and delete a child ----
    await kbtn(p, 'Sara', 'Change times');
    ok('edit form filled', await p.inputValue(kid('Sara') + ' input[id$="-name"]') === 'Sara' && await p.inputValue('#k2-school') === '90' && await p.inputValue('#k2-weekend') === '180');
    await p.selectOption('#k2-school', 'custom'); await p.fill('#k2-school-c', '45'); await p.fill(kid('Sara') + ' input[id$="-name"]', 'Sara K');
    await p.click(kid('Sara') + ' .panel button:text-is("Save")');
    ok('child changed', await txt(p, kid('Sara K') + ' .badge') === 'School day: 45 min' && (await big(p, 'Sara K')) === '49 min left today', await big(p, 'Sara K'));
    await kbtn(p, 'Sara K', 'Change times');
    ok('custom time shown back as 45', await p.inputValue('#k2-school') === 'custom' && await p.inputValue('#k2-school-c') === '45');
    await p.fill(kid('Sara K') + ' input[id$="-name"]', 'Ali'); await p.click(kid('Sara K') + ' .panel button:text-is("Save")');
    ok('rename to an existing name refused', (await txt(p, kid('Sara K') + ' .panel .err')).startsWith('There is already a child called Ali'));
    await p.click(kid('Sara K') + ' .panel button:text-is("Cancel")');
    await kbtn(p, 'Hamza', 'Change times'); await p.click(kid('Hamza') + ' button:text-is("Delete Hamza")');
    ok('child deleted', !(await p.$(kid('Hamza'))) && (await txt(p, '#top-msg')).startsWith('Deleted Hamza'));
    await p.click('#top-msg .undo');
    ok('undo delete child', !!(await p.$(kid('Hamza'))) && (await saved(p)).manual.length === 1);
    ok('no console errors (main run)', !p.errors.length && !p.bad.length, [p.errors, p.bad]);

    // ---- 9. copy, email, backup, restore, delete everything ----
    await p.click('#copy-all');
    const clip = await p.evaluate(() => navigator.clipboard.readText());
    ok('copy summary', clip.startsWith('Screen time, Friday 23 October (school day)\n\nAli: 23 min left today (1 h 7 min of 1 h 30 min used). Includes 30 min bonus.'), clip);
    ok('email link has the summary and no address', (await p.getAttribute('#mail-all', 'href')).startsWith('mailto:?subject=Screen%20time%20today&body=Screen%20time'));
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#backup')]);
    const file = path.join(os.tmpdir(), 'sta-backup.json'); await dl.saveAs(file);
    ok('backup file', dl.suggestedFilename() === 'screen-time-backup-2026-10-23.json' && JSON.parse(fs.readFileSync(file, 'utf8')).kids.length === 3);
    await p.click('#wipe');
    ok('delete everything', (await saved(p)).kids.length === 0 && await p.isVisible('#add-form') && !(await p.isVisible('#today')));
    await p.click('#top-msg .undo');
    ok('undo delete everything', (await saved(p)).kids.length === 3);
    await p.click('#wipe');
    await p.setInputFiles('#restore-file', file);
    await p.waitForTimeout(300);
    ok('restore backup', (await saved(p)).kids.length === 3 && (await txt(p, '#set-msg')).startsWith('Backup restored: 3 children.'), await txt(p, '#set-msg'));
    const junkFile = path.join(os.tmpdir(), 'sta-junk.json'); fs.writeFileSync(junkFile, '{"hello": 1}');
    await p.setInputFiles('#restore-file', junkFile); await p.waitForTimeout(300);
    ok('wrong file refused', (await txt(p, '#set-msg')).startsWith('That file is not a backup') && (await saved(p)).kids.length === 3);

    // ---- 10. midnight ----
    await clickAt(p, at(23, 23, 30), kid('Sara K') + ' .go');
    await showAt(p, at(24, 0, 30));
    ok('new day at midnight', await txt(p, '#today-h') === 'Saturday 24 October' && await txt(p, kid('Sara K') + ' .badge') === 'Weekend: 3 h', await txt(p, '#today-h'));
    ok('only the minutes after midnight count today', await big(p, 'Sara K') === '2:30:00 left today', await big(p, 'Sara K'));
    ok('started yesterday shown', (await txt(p, kid('Sara K') + ' .since')).startsWith('Started at 23:30 yesterday'), await txt(p, kid('Sara K') + ' .since'));
    ok('bonus does not carry over', await used(p, 'Sara K') === '30 min of 3 h used today.' && await big(p, 'Ali') === '2 h left today', [await used(p, 'Sara K'), await big(p, 'Ali')]);
    await clickAt(p, at(24, 0, 30), kid('Sara K') + ' .go');
    ok('week view: yesterday counted', (await p.getAttribute(kid('Sara K') + ' .days7 li:nth-child(6)', 'aria-label')) === 'Yesterday: 41 min of 1 h', await p.getAttribute(kid('Sara K') + ' .days7 li:nth-child(6)', 'aria-label'));
    // forgot to stop: running 4 hours
    await clickAt(p, at(24, 0, 30), kid('Ali') + ' .go'); await showAt(p, at(24, 4, 40));
    ok('forgot-to-stop hint', (await txt(p, kid('Ali') + ' .since')).includes('Forgot to stop?'), await txt(p, kid('Ali') + ' .since'));
    await clickAt(p, at(24, 4, 40), kid('Ali') + ' .go');
    await kbtn(p, 'Ali', "Today's sessions");
    await p.click(kid('Ali') + ' .entries li:last-child button:text-is("Edit")');
    await p.fill(kid('Ali') + ' input[id$="-ee"]', '01:00'); await p.click(kid('Ali') + ' button:text-is("Save")');
    ok('fixed end time', await big(p, 'Ali') === '1 h 30 min left today', await big(p, 'Ali'));
    ok('no console errors after midnight', !p.errors.length, p.errors);
    await p.context().close();

    // ---- 11. closed page: time from the saved start ----
    p = await load(b, phone, { state: seed(), time: at(23, 17, 40) });
    ok('opened later: right time left', await big(p, 'Ali') === 'Time is up over by 15 min', await big(p, 'Ali'));
    ok('opened later: no beep on open', await p.evaluate(() => window.__beeps) === 0);
    await p.context().close();

    // ---- 12. corrupt or blocked storage ----
    p = await load(b, phone, { state: '{not json' });
    ok('corrupt data: fresh start with a message', (await txt(p, '#top-msg')).startsWith('Your saved data could not be read') && await p.isVisible('#add-form') && !p.errors.length, p.errors);
    await p.context().close();
    p = await load(b, phone, { state: JSON.stringify({ kids: [{ id: 1, name: 'A', school: 'x' }], sessions: 5 }) });
    ok('bad values dropped', (await p.$$('section.kid')).length === 0 && !p.errors.length);
    await p.context().close();
    p = await load(b, phone, { block: true });
    ok('blocked storage: warning and still works', await p.isVisible('#storage-warn'));
    await p.fill('#a-name', 'Ali'); await p.click('#a-save');
    ok('blocked storage: child added', await big(p, 'Ali') === '1 h left today' && !p.errors.length, p.errors);
    await p.context().close();

    // ---- 13. long names and every panel at phone widths ----
    const long = seed(); long.kids[0].name = 'Muhammad Abdur-Rahman Siddiqui The Third';
    for (const w of [320, 360, 390]) {
        for (const theme of ['dark', 'light']) {
            p = await load(b, { width: w, height: 800 }, { state: long, theme });
            const n = long.kids[0].name;
            await layoutOK(p, `${w} ${theme} filled`);
            await kbtn(p, n, '+ Bonus time'); await p.click(kid(n) + ' .panel button:text-is("+ Add a reason (optional)")'); await layoutOK(p, `${w} ${theme} bonus`);
            await kbtn(p, n, 'Add time by hand'); await layoutOK(p, `${w} ${theme} by hand`);
            await kbtn(p, n, "Today's sessions"); await p.click(kid(n) + ' .entries li:nth-child(1) button:text-is("Edit")'); await layoutOK(p, `${w} ${theme} edit session`);
            await kbtn(p, n, 'Change times'); await p.selectOption('#k1-school', 'custom'); await p.selectOption('#k1-weekend', 'custom'); await layoutOK(p, `${w} ${theme} change times`);
            await p.click('#open-add'); await p.selectOption('#a-school', 'custom'); await p.selectOption('#a-weekend', 'custom'); await layoutOK(p, `${w} ${theme} add custom`);
            await p.context().close();
        }
    }

    // ---- 14. every width, dark and light, filled and cleared; scroll test on desktops ----
    for (const w of [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920]) {
        for (const theme of ['dark', 'light']) {
            p = await load(b, { width: w, height: 900 }, { state: seed(), theme });
            const r = await p.evaluate(() => ({ wide: document.documentElement.scrollWidth > innerWidth, out: [...document.querySelectorAll('main *')].filter(e => e.getBoundingClientRect().right > innerWidth + 1).length }));
            ok(`${w} ${theme}: filled, no sideways scroll`, !r.wide && !r.out, r);
            if (w >= 900) for (const pos of ['top', 'mid', 'bottom']) {
                await p.evaluate(x => scrollTo(0, x === 'top' ? 0 : x === 'mid' ? document.body.scrollHeight / 2 : document.body.scrollHeight), pos);
                await blocksOK(p, `scroll ${w} ${theme} ${pos}`);
            }
            await p.click('#wipe');
            const r2 = await p.evaluate(() => ({ wide: document.documentElement.scrollWidth > innerWidth }));
            ok(`${w} ${theme}: cleared, no sideways scroll`, !r2.wide);
            if (w >= 900) await blocksOK(p, `${w} ${theme} cleared`);
            ok(`${w} ${theme}: no errors`, !p.errors.length && !p.bad.length, [p.errors, p.bad]);
            await p.context().close();
        }
    }
    p = await load(b, desk, { state: seed() });
    ok('desktop uses two columns', await p.evaluate(() => { const a = document.querySelector('.col-main').getBoundingClientRect(), c = document.querySelector('.col-side').getBoundingClientRect(); return c.left > a.right && Math.abs(a.top - c.top) < 2 && a.width > 550; }));
    // light/dark switch
    const before = await p.evaluate(() => getComputedStyle(document.body).color);
    await p.click('.theme-toggle');
    ok('light/dark switch changes the colours', await p.evaluate(() => getComputedStyle(document.body).color) !== before);
    await p.context().close();

    // ---- 15. help dialog ----
    for (const w of [320, 390, 820, 1280]) {
        p = await load(b, { width: w, height: 800 }, { state: seed() });
        await p.click('.help-btn');
        const d = await p.evaluate(() => { const e = document.querySelector('dialog[open]'); if (!e) return null; const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, h: e.querySelector('h2') && e.querySelector('h2').textContent }; });
        ok(w + ' help opens inside the screen', d && d.l >= 0 && d.r <= w && d.t >= 0 && d.b <= 800 && d.h === 'How to use Screen Time Allowance Timer for Kids', d);
        await p.keyboard.press('Escape');
        ok(w + ' Escape closes help', !(await p.$('dialog[open]')));
        await p.click('.help-btn'); await p.click('dialog[open] button:text-is("Got it")');
        ok(w + ' Got it closes help', !(await p.$('dialog[open]')));
        const bar = await p.evaluate(() => { const bs = [...document.querySelectorAll('.topbar > *, .topbar button')].map(e => e.getBoundingClientRect()); let o = 0; for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) { const a = bs[i], c = bs[j]; if (Math.min(a.right, c.right) - Math.max(a.left, c.left) > 1 && Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top) > 1 && !(a.left <= c.left && a.right >= c.right && a.top <= c.top && a.bottom >= c.bottom)) o++; } return o; });
        ok(w + ' top bar buttons do not overlap', bar === 0, bar);
        await p.context().close();
    }

    // ---- screenshots ----
    if (shots) {
        const dir = path.join(__dirname, 'screenshots');
        p = await load(b, desk, { state: seed(), time: at(23, 17, 20) + 47000 });
        await p.clock.runFor(1000);
        await p.screenshot({ path: path.join(dir, 'desktop.png') });
        await p.context().close();
        p = await load(b, phone, { state: seed(), time: at(23, 17, 20) + 47000 });
        await p.clock.runFor(1000);
        await p.screenshot({ path: path.join(dir, 'phone.png') });
        await p.context().close();
    }

    await b.close();
    if (server) server.close();
    console.log(fail ? fail + ' FAILED' : 'ALL UI TESTS PASSED');
    process.exitCode = fail ? 1 : 0;
}
run().catch(e => { console.error(e); process.exit(1); });
