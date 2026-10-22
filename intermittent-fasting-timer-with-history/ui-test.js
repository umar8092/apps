// Drives the real page in headless Chromium: node ui-test.js [--base https://umar8092.github.io/apps]
// Without --base it serves this repo on localhost. With --base it tests the LIVE page. Times are in Asia/Karachi, October 2026.
process.env.TZ = 'Asia/Karachi';
const pw = (() => { for (const m of ['playwright', 'playwright-core']) { try { return require(m); } catch (e) { /* next */ } } throw new Error('playwright not found'); })();
const path = require('path'), fs = require('fs'), http = require('http'), os = require('os');
const bi = process.argv.indexOf('--base');
let fail = 0, url;
const ok = (name, cond, extra) => { if (!cond) fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond || extra == null ? '' : '  -> ' + JSON.stringify(extra))); };
const at = (d, h, m) => new Date(2026, 9, d, h, m || 0).getTime();
const SLUG = 'intermittent-fasting-timer-with-history', KEY = SLUG + '.data';
const { data: SEED } = require('./shots.js');

function serve() {
    const ROOT = path.resolve(__dirname, '..');
    const types = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml', png: 'image/png', webmanifest: 'application/manifest+json', woff2: 'font/woff2' };
    return new Promise(res => {
        const s = http.createServer((req, rs) => {
            let p = decodeURIComponent(req.url.split('?')[0]).replace(/^\/apps/, ''); if (p.endsWith('/')) p += 'index.html';
            const f = path.join(ROOT, p);
            if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rs.writeHead(404); return rs.end('nf'); }
            rs.writeHead(200, { 'content-type': types[f.split('.').pop()] || 'application/octet-stream' }); rs.end(fs.readFileSync(f));
        }).listen(0, () => res(s));
    });
}

async function load(b, vp, opt = {}) {
    const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: vp.width < 500 ? 2 : 1, colorScheme: opt.theme || 'dark', locale: 'en-GB', timezoneId: 'Asia/Karachi',
        permissions: ['clipboard-read', 'clipboard-write'], acceptDownloads: true, serviceWorkers: 'block' });
    const p = await ctx.newPage();
    p.errors = []; p.bad = [];
    p.on('pageerror', e => p.errors.push(e.message));
    p.on('console', m => { if (m.type() === 'error') p.errors.push(m.text()); });
    p.on('response', r => { if (r.status() >= 400) p.bad.push(r.status() + ' ' + r.url()); });
    await p.route(/goatcounter|gc\.zgo\.at/, r => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
    const now = opt.now || at(22, 10, 30);
    await p.clock.install({ time: now - 5000 });
    if (opt.blockStorage) await p.addInitScript(() => { const d = Object.getOwnPropertyDescriptor(window, 'localStorage'); Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
    else if (opt.raw != null) await p.addInitScript(([k, v]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, v); sessionStorage.setItem('seeded', '1'); } }, [KEY, opt.raw]);
    await p.goto(url, { waitUntil: 'load' });
    await p.clock.pauseAt(now);   // every test starts at an exact minute
    return { ctx, p };
}
const text = (p, sel) => p.locator(sel).first().innerText();
const saved = p => p.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
async function jump(p, t) { await p.clock.setSystemTime(t); await p.clock.runFor(1100); }
async function noHScroll(p) { return p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1); }
async function controlsOverlap(p) {
    return p.evaluate(() => {
        const els = [...document.querySelectorAll('main input:not([type=file]):not([type=checkbox]), main select, main button, main a.secondary')].filter(e => e.offsetParent && e.getClientRects().length);
        const r = els.map(e => e.getBoundingClientRect()), out = [];
        for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) {
            if (els[i].contains(els[j]) || els[j].contains(els[i])) continue;
            const x = Math.min(r[i].right, r[j].right) - Math.max(r[i].left, r[j].left), y = Math.min(r[i].bottom, r[j].bottom) - Math.max(r[i].top, r[j].top);
            if (x > 1 && y > 1) out.push((els[i].id || els[i].textContent.trim().slice(0, 20)) + ' / ' + (els[j].id || els[j].textContent.trim().slice(0, 20)));
        }
        return out;
    });
}
async function placeholdersFit(p) {
    return p.evaluate(() => [...document.querySelectorAll('main input[placeholder]')].filter(i => i.offsetParent).filter(i => {
        const c = document.createElement('canvas').getContext('2d'), s = getComputedStyle(i);
        c.font = s.fontSize + ' ' + s.fontFamily;
        return c.measureText(i.placeholder).width > i.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight) + 1;
    }).map(i => i.id || i.placeholder));
}
async function blocksOverlap(p) {
    return p.evaluate(() => {
        const out = [];
        document.querySelectorAll('main, .col-main, .col-side').forEach(par => {
            const kids = [...par.children].filter(e => e.offsetParent && getComputedStyle(e).display !== 'contents');
            const r = kids.map(k => k.getBoundingClientRect());
            for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) {
                const x = Math.min(r[i].right, r[j].right) - Math.max(r[i].left, r[j].left), y = Math.min(r[i].bottom, r[j].bottom) - Math.max(r[i].top, r[j].top);
                if (x > 1 && y > 1) out.push((kids[i].id || kids[i].className) + ' / ' + (kids[j].id || kids[j].className));
            }
        });
        return out;
    });
}

(async () => {
    let server;
    if (bi > 0) url = process.argv[bi + 1].replace(/\/$/, '') + '/' + SLUG + '/';
    else { server = await serve(); url = 'http://localhost:' + server.address().port + '/apps/' + SLUG + '/'; }
    console.log('Testing ' + url);
    const b = await pw.chromium.launch();
    try {
        // ---- 1. first use, empty state, the main situation end to end ----
        let { ctx, p } = await load(b, { width: 390, height: 900 }, { now: at(21, 20, 0) });
        ok('first use: Not fasting', (await text(p, '#timer-h')) === 'Not fasting');
        ok('first use: says when you could eat', (await text(p, '#ends')) === 'If you start now you can eat at 12:00 tomorrow.', await text(p, '#ends'));
        ok('first use: history empty text', await p.locator('#hist-empty').isVisible());
        ok('first use: 16:8 picked by default', (await p.locator('.preset[aria-pressed="true"]').first().innerText()).startsWith('16:8'));
        ok('first use: 0 fasts in stats', (await text(p, '#stats .stat b')) === '0');
        ok('optional note is hidden behind a button', !(await p.locator('#add-form').isVisible()));
        await p.click('#go');
        ok('start: fasting', (await text(p, '#timer-h')) === 'Fasting');
        ok('start: eat at 12:00 tomorrow', (await text(p, '#big-line')) === 'Eat at 12:00 tomorrow, 16 h left.', await text(p, '#big-line'));
        ok('start: button is End fast', (await text(p, '#go')) === 'End fast');
        await p.click('#timer-msg .link');  // Undo
        ok('undo start: back to not fasting', (await text(p, '#timer-h')) === 'Not fasting');
        await p.click('#go');
        await jump(p, at(22, 10, 30));
        ok('10:30 next day: 14:30 fasted', (await text(p, '#time')).startsWith('14:30:0'), await text(p, '#time'));
        ok('10:30: eat at 12:00 today, 1 h 30 min left', (await text(p, '#big-line')) === 'Eat at 12:00 today, 1 h 30 min left.', await text(p, '#big-line'));
        ok('10:30: started 20:00 yesterday', (await text(p, '#ends')).startsWith('Started 20:00 yesterday. Goal: 16:8.'));
        const dash = await p.getAttribute('#ring-fg', 'stroke-dasharray');
        ok('ring about 90% full', dash === '906 1000', dash);
        ok('tab title shows time fasted', (await p.title()).startsWith('14 h 30 min fasted'));
        await p.reload(); await p.clock.runFor(1100);
        ok('reload keeps the fast', (await text(p, '#big-line')) === 'Eat at 12:00 today, 1 h 30 min left.');
        await jump(p, at(22, 12, 0));
        ok('12:00 goal reached', (await text(p, '#timer-h')) === 'Goal reached! You can eat', await text(p, '#timer-h'));
        await jump(p, at(22, 12, 10));
        ok('12:10 extra time counted', (await text(p, '#big-line')) === 'You reached your goal at 12:00 today and have fasted 10 min extra.', await text(p, '#big-line'));
        await p.click('#go');
        ok('end fast: saved message', (await text(p, '#timer-msg')).startsWith('Saved: 16 h 10 min, goal met.'), await text(p, '#timer-msg'));
        ok('eating window: next fast by 20:10', (await text(p, '#big-line')) === 'Start your next fast by 20:10 today, 8 h left to eat.', await text(p, '#big-line'));
        ok('eating window title', (await text(p, '#timer-h')) === 'Eating window open');
        ok('history has the fast', (await p.locator('#list .fast').count()) === 1 && (await text(p, '#list .fast-len')) === '16 h 10 min');
        ok('history shows Goal met', (await text(p, '#list .badge')) === 'Goal met');
        ok('history crosses midnight', (await text(p, '#list .fast-when')) === 'Wed 21 Oct, 20:00 to Thu 22 Oct, 12:10', await text(p, '#list .fast-when'));
        ok('stats: 1 fast, streak 1 day', (await p.locator('#stats .stat b').allInnerTexts()).join('|') === '1|1 of 1|16 h 10 min|16 h 10 min|1 day|16 h 10 min', await p.locator('#stats .stat b').allInnerTexts());
        await p.click('#timer-msg .link');  // undo end
        ok('undo end: fasting again', (await text(p, '#timer-h')).startsWith('Goal reached') && (await p.locator('#list .fast').count()) === 0);
        // I ate earlier
        await p.click('#l-ended');
        ok('set end form opens with its own wording', (await text(p, '#t-form-h')) === 'When did you start eating?' && (await text(p, '#t-save')) === 'End fast at this time');
        await p.fill('#t-date', '2026-10-22'); await p.fill('#t-time', '13:00');
        await p.click('#t-save');
        ok('end in the future refused', (await text(p, '#t-err')).startsWith('The end is in the future'), await text(p, '#t-err'));
        await p.fill('#t-time', '11:00'); await p.click('#t-save');
        ok('end at 11:00 saved as short', (await text(p, '#timer-msg')).startsWith('Saved: 15 h, 1 h short of your 16 h goal.'), await text(p, '#timer-msg'));
        ok('short badge', (await text(p, '#list .badge')) === '1 h short');
        ok('eating window from 11:00', (await text(p, '#big-line')) === 'Start your next fast by 19:00 today, 6 h 50 min left to eat.', await text(p, '#big-line'));
        await jump(p, at(22, 19, 30));
        ok('window over message', (await text(p, '#timer-h')) === 'Eating window over' && (await text(p, '#big-line')).includes('ended at 19:00 today'));
        // start earlier: errors and success
        await p.click('#l-earlier');
        await p.fill('#t-date', '2026-10-22'); await p.fill('#t-time', '10:00'); await p.click('#t-save');
        ok('start before last fast ended refused', (await text(p, '#t-err')).startsWith('Your last saved fast ended at 11:00'), await text(p, '#t-err'));
        await p.fill('#t-time', '23:00'); await p.click('#t-save');
        ok('start in the future refused', (await text(p, '#t-err')).startsWith('That time is in the future'));
        await p.fill('#t-time', ''); await p.click('#t-save');
        ok('blank time refused', (await text(p, '#t-err')) === 'Enter the date and time you finished eating.');
        await p.fill('#t-time', '19:15'); await p.click('#t-save');
        ok('started from 19:15', (await text(p, '#ends')).startsWith('Started 19:15 today.') && (await text(p, '#big-line')) === 'Eat at 11:15 tomorrow, 15 h 45 min left.', await text(p, '#big-line'));
        // change start
        await p.click('#l-start');
        ok('change start form prefilled', (await p.inputValue('#t-time')) === '19:15');
        await p.fill('#t-time', '19:05'); await p.click('#t-save');
        ok('start changed', (await text(p, '#ends')).startsWith('Started 19:05 today.'));
        // plan change during a fast
        await p.click('.preset[data-min="1080"]');
        ok('18:6 picked, plan text', (await text(p, '#plan-now')) === 'Goal: fast 18 h, then eat within 6 h.' && (await text(p, '#plan-msg')).includes("This fast's goal changed too."));
        ok('fast goal follows the plan', (await text(p, '#big-line')) === 'Eat at 13:05 tomorrow, 17 h 35 min left.', await text(p, '#big-line'));
        // custom
        await p.click('.preset[data-min="custom"]');
        ok('custom box opens prefilled', (await p.inputValue('#c-h')) === '18');
        await p.fill('#c-h', ''); await p.click('#c-save');
        ok('custom blank refused', (await text(p, '#c-err')).startsWith('Enter hours from 1 to 168'));
        await p.fill('#c-h', '169'); await p.click('#c-save');
        ok('custom 169 refused', (await text(p, '#c-err')).startsWith('Enter hours'));
        await p.fill('#c-h', '-3'); await p.click('#c-save');
        ok('custom negative refused', (await text(p, '#c-err')).startsWith('Enter hours'));
        await p.fill('#c-h', '36'); await p.fill('#c-m', ''); await p.click('#c-save');
        ok('custom 36 h', (await text(p, '#plan-now')) === 'Goal: fast 36 h. No eating window for fasts of 24 hours or more.' && (await text(p, '#ends')).includes('Goal: 36 h fast.'));
        ok('custom button shows 36 h', (await text(p, '.preset[data-min="custom"]')).includes('36 h'));
        // cancel fast + undo
        await p.click('#l-cancel');
        ok('cancel fast', (await text(p, '#timer-msg')).startsWith('Fast cancelled') && (await saved(p)).current === null);
        await p.click('#timer-msg .link');
        ok('undo cancel brings it back', (await saved(p)).current && (await saved(p)).current.start === at(22, 19, 5));
        await ctx.close();

        // ---- 2. history: edit, delete, add, overlaps, note, 12-hour clock ----
        ({ ctx, p } = await load(b, { width: 1280, height: 1000 }, { raw: JSON.stringify(SEED) }));
        ok('seeded: 6 fasts listed', (await p.locator('#list .fast').count()) === 6);
        ok('seeded: stats', (await p.locator('#stats .stat b').allInnerTexts()).join('|') === '6|5 of 6|16 h 16 min|18 h 15 min|3 days|18 h 15 min', await p.locator('#stats .stat b').allInnerTexts());
        ok('seeded: 7 bars, Thu today', (await p.locator('.day-bar').count()) === 7 && (await text(p, '.day-bar.today .lbl')) === 'Thu');
        const first = p.locator('#list .fast').first();
        await first.locator('button', { hasText: 'Edit' }).click();
        ok('edit form prefilled', (await p.inputValue('#f6-e-time')) === '12:05' && (await p.inputValue('#f6-note')) === 'Easy, busy morning');
        await p.fill('#f6-e-time', '18:00'); await p.fill('#f6-e-date', '2026-10-20');
        await p.click('#list .fast >> text=Save changes');
        ok('edit: end before start refused', (await text(p, '#list .err')).startsWith('The end must be after the start'), await text(p, '#list .err'));
        await p.fill('#f6-e-date', '2026-10-21'); await p.fill('#f6-s-date', '2026-10-20'); await p.fill('#f6-s-time', '11:00');
        await p.click('#list .fast >> text=Save changes');
        ok('edit: overlap refused', (await text(p, '#list .err')).startsWith('This overlaps the fast from 20:15 Mon 19 Oct'), await text(p, '#list .err'));
        await p.fill('#f6-s-time', '19:30'); await p.fill('#f6-e-time', '13:30'); await p.fill('#f6-goal', '18');
        await p.click('#list .fast >> text=Save changes');
        ok('edit saved: 18 h, goal met', (await text(p, '#list .fast-len')) === '18 h' && (await text(p, '#list .fast-goal')) === 'Goal 18 h (18:6)', await text(p, '#list .fast-goal'));
        // the edit form keeps typed text across the minute tick
        await first.locator('button', { hasText: 'Edit' }).click();
        await p.fill('#f6-note', 'typing...');
        await p.clock.runFor(61000);
        ok('open edit form survives the minute tick', (await p.locator('#f6-note').count()) === 1 && (await p.inputValue('#f6-note')) === 'typing...');
        await p.click('#list .fast >> text=Cancel');
        await p.clock.setSystemTime(at(22, 10, 30));   // back to 10:30 after the minute tick
        // delete + undo
        await p.locator('#list .fast').nth(1).locator('button', { hasText: 'Delete' }).click();
        ok('delete', (await p.locator('#list .fast').count()) === 5 && (await text(p, '#hist-msg')).startsWith('Fast of Tue 20 Oct deleted.'));
        await p.click('#hist-msg .link');
        ok('undo delete', (await p.locator('#list .fast').count()) === 6);
        // add a past fast without a note (optional is not forced)
        await p.click('#add-open');
        ok('add form: note hidden behind + Add a note', await p.locator('#add-form .link', { hasText: '+ Add a note (optional)' }).isVisible() && !(await p.locator('#new-note').isVisible()));
        await p.fill('#new-s-date', '2026-10-14'); await p.fill('#new-s-time', '20:00'); await p.fill('#new-e-date', '2026-10-15'); await p.fill('#new-e-time', '12:00');
        await p.click('#add-form >> text=Add fast');
        ok('past fast added without a note', (await p.locator('#list .fast').count()) === 7 && (await text(p, '#hist-msg')) .startsWith('Fast added: 16 h.'));
        // add with an HTML note that is very long
        await p.click('#add-open');
        await p.fill('#new-s-date', '2026-10-13'); await p.fill('#new-s-time', '20:00'); await p.fill('#new-e-date', '2026-10-14'); await p.fill('#new-e-time', '08:00');
        await p.click('#add-form >> text=+ Add a note (optional)');
        await p.fill('#new-note', '<b>bold</b> ' + 'x'.repeat(120));
        await p.click('#add-form >> text=Add fast');
        const note = await p.locator('.fast-note').last().innerText();
        ok('note shown as text and cut to 80', note.startsWith('<b>bold</b>') && note.length === 80, note.length);
        // future fast
        await p.click('#add-open');
        await p.fill('#new-s-date', '2026-10-22'); await p.fill('#new-s-time', '09:00'); await p.fill('#new-e-date', '2026-10-22'); await p.fill('#new-e-time', '10:00');
        await p.click('#add-form >> text=Add fast');
        ok('past fast overlapping the current fast refused', (await text(p, '#add-form .err')).startsWith('This overlaps the fast you are doing now'), await text(p, '#add-form .err'));
        await p.fill('#new-e-time', '23:00'); await p.click('#add-form >> text=Add fast');
        ok('end in the future refused', (await text(p, '#add-form .err')).startsWith('The end is in the future'));
        await p.fill('#new-goal', '0'); await p.fill('#new-e-time', '10:00'); await p.fill('#new-s-date', '2026-10-12'); await p.fill('#new-e-date', '2026-10-12'); await p.fill('#new-s-time', '01:00');
        await p.click('#add-form >> text=Add fast');
        ok('goal 0 refused', (await text(p, '#add-form .err')) === 'Enter a goal between 1 and 168 hours.', await text(p, '#add-form .err'));
        await p.click('#add-form >> text=Cancel');
        ok('add form closes', !(await p.locator('#add-form').isVisible()) && await p.locator('#add-open').isVisible());
        // 12-hour clock
        await p.selectOption('#s-clock', '12');
        ok('12-hour clock', (await text(p, '#big-line')) === 'Eat at 12:00 pm today, 1 h 30 min left.' && (await text(p, '#list .fast-when')).includes('7:30 pm'), await text(p, '#big-line'));
        await p.selectOption('#s-clock', '24');
        // copy and email
        await p.click('#copy');
        const clip = await p.evaluate(() => navigator.clipboard.readText());
        ok('copy summary', clip.startsWith('My fasting, last 7 days\nFasting now: 14 h 30 min since 20:00 yesterday, goal 16 h, can eat at 12:00 today') && (await text(p, '#week-msg')).startsWith('Summary copied'), clip.slice(0, 160));
        const href = await p.getAttribute('#email', 'href');
        ok('email link has no recipient and the summary', href.startsWith('mailto:?subject=My%20fasting') && decodeURIComponent(href).includes('Streak: 3 days'));
        // backup, CSV
        let dl = p.waitForEvent('download'); await p.click('#backup'); let file = await (await dl).path();
        const backup = JSON.parse(fs.readFileSync(file, 'utf8'));
        ok('backup file has all fasts', backup.fasts.length === 8 && backup.current.start === at(21, 20));
        dl = p.waitForEvent('download'); await p.click('#csv'); file = await (await dl).path();
        const csv = fs.readFileSync(file, 'utf8').split('\n');
        ok('CSV has a header and 8 rows', csv[0].startsWith('Start date,Start time') && csv.filter(Boolean).length === 9);
        // delete all: dismiss keeps, accept clears, undo restores
        p.once('dialog', d => d.dismiss()); await p.click('#wipe');
        ok('delete all dismissed keeps fasts', (await p.locator('#list .fast').count()) === 8);
        p.once('dialog', d => d.accept()); await p.click('#wipe');
        ok('delete all clears fasts and current', (await p.locator('#list .fast').count()) === 0 && (await text(p, '#timer-h')) === 'Not fasting');
        await p.click('#set-msg .link');
        ok('undo delete all', (await p.locator('#list .fast').count()) === 8 && (await text(p, '#timer-h')) === 'Fasting');
        // restore: bad file, file with bad entries, good file
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fast-'));
        fs.writeFileSync(path.join(tmp, 'bad.json'), 'not json');
        await p.setInputFiles('#restore-file', path.join(tmp, 'bad.json'));
        await p.waitForTimeout(200);
        ok('restore refuses a non-backup', (await text(p, '#set-msg')) === 'That file is not a backup from this app.');
        const mixed = JSON.parse(JSON.stringify(SEED)); mixed.fasts.push({ start: 'x' }, { start: 5, end: 1, goalMin: 960 }); mixed.current = null;
        fs.writeFileSync(path.join(tmp, 'mixed.json'), JSON.stringify(mixed));
        await p.setInputFiles('#restore-file', path.join(tmp, 'mixed.json'));
        await p.waitForTimeout(200);
        ok('restore leaves out bad entries and says so', (await text(p, '#set-msg')).startsWith('Restored 6 fasts. 2 entries could not be read') && (await p.locator('#list .fast').count()) === 6, await text(p, '#set-msg'));
        await p.reload(); await p.clock.runFor(1100);
        const rs = [await p.locator('#list .fast').count(), await text(p, '#timer-h')];
        ok('restored data survives reload', rs[0] === 6 && rs[1] === 'Eating window over', rs);   // last restored fast ended 13:30 yesterday with a 6 h window
        // theme switch
        const bg1 = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
        await p.click('.theme-toggle');
        const bg2 = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
        ok('light/dark switch changes the look', bg1 !== bg2 && (await p.evaluate(() => document.documentElement.dataset.theme)) === 'light');
        ok('no console errors (history run)', p.errors.length === 0, p.errors);
        await ctx.close();

        // ---- 3. corrupt and blocked storage, many fasts ----
        ({ ctx, p } = await load(b, { width: 390, height: 900 }, { raw: '{not json' }));
        ok('corrupt saved data starts fresh', (await text(p, '#timer-h')) === 'Not fasting' && p.errors.length === 0, p.errors);
        await ctx.close();
        ({ ctx, p } = await load(b, { width: 390, height: 900 }, { raw: JSON.stringify({ current: { start: 'yesterday' }, fasts: 'many', settings: { goalMin: -5 } }) }));
        const ws = [await text(p, '#timer-h'), await text(p, '#plan-now'), p.errors];
        ok('wrong-shaped saved data starts fresh', ws[0] === 'Not fasting' && ws[1].startsWith('Goal: fast 16 h') && !ws[2].length, ws);
        await ctx.close();
        ({ ctx, p } = await load(b, { width: 390, height: 900 }, { blockStorage: true }));
        ok('blocked storage shows a warning', await p.locator('#storage-warn').isVisible());
        await p.click('#go');
        ok('timer still works with storage blocked', (await text(p, '#timer-h')) === 'Fasting' && p.errors.length === 0, p.errors);
        await ctx.close();
        const many = JSON.parse(JSON.stringify(SEED)); many.current = null; many.fasts = [];
        for (let i = 0; i < 30; i++) many.fasts.push({ id: 'm' + i, start: at(21, 20) - (i + 1) * 86400000, end: at(21, 20) - (i + 1) * 86400000 + 16 * 3600000, goalMin: 960, note: '' });
        ({ ctx, p } = await load(b, { width: 390, height: 900 }, { raw: JSON.stringify(many) }));
        ok('long history shows 20 then Show all', (await p.locator('#list .fast').count()) === 20 && (await text(p, '#more')) === 'Show all 30 fasts');
        await p.click('#more');
        ok('Show all lists 30', (await p.locator('#list .fast').count()) === 30);
        ok('30 days in a row = streak 30', (await p.locator('#stats .stat b').nth(4).innerText()) === '30 days', await p.locator('#stats .stat b').nth(4).innerText());
        await ctx.close();

        // ---- 4. layout at every width, filled in and empty, both themes ----
        const widths = [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920];
        for (const theme of ['dark', 'light']) for (const w of widths) {
            for (const state of ['filled', 'empty']) {
                const r = await load(b, { width: w, height: 900 }, { theme, raw: state === 'filled' ? JSON.stringify(SEED) : null });
                p = r.p;
                const tag = theme + ' ' + w + ' ' + state + ': ';
                if (w <= 390) {
                    // open every optional form
                    await p.click(state === 'filled' ? '#l-ended' : '#l-earlier');
                    await p.click('.preset[data-min="custom"]');
                    await p.click('#add-open'); await p.click('#add-form >> text=+ Add a note (optional)');
                    if (state === 'filled') await p.locator('#list .fast').first().locator('button', { hasText: 'Edit' }).click();
                    const c = await controlsOverlap(p);
                    ok(tag + 'no overlapping controls with every form open', c.length === 0, c);
                    const ph = await placeholdersFit(p);
                    ok(tag + 'placeholders fit', ph.length === 0, ph);
                }
                ok(tag + 'no horizontal scroll', await noHScroll(p));
                if (w >= 900) {
                    for (const pos of [0, 0.5, 1]) {
                        await p.evaluate(f => scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * f), pos);
                        const o = await blocksOverlap(p);
                        ok(tag + 'no overlapping blocks at scroll ' + pos * 100 + '%', o.length === 0, o);
                    }
                    const cols = await p.evaluate(() => [document.querySelector('.col-main').getBoundingClientRect(), document.querySelector('.col-side').getBoundingClientRect()].map(r => Math.round(r.left)));
                    ok(tag + 'two columns side by side', cols[1] > cols[0] + 300, cols);
                }
                ok(tag + 'no console errors or failed requests', r.p.errors.length === 0 && r.p.bad.length === 0, r.p.errors.concat(r.p.bad));
                await r.ctx.close();
            }
        }
        // ---- 5. Help dialog ----
        for (const w of [320, 390, 820, 1280]) {
            const r = await load(b, { width: w, height: 800 }, { raw: JSON.stringify(SEED) });
            p = r.p;
            await p.click('.help-btn');
            const box = await p.locator('dialog.help').boundingBox();
            ok('help ' + w + ': opens inside the screen with its title', box && box.x >= 0 && box.x + box.width <= w + 1 && (await p.locator('dialog.help').innerText()).includes('How to use the Intermittent Fasting Timer'));
            await p.keyboard.press('Escape');
            ok('help ' + w + ': Escape closes', !(await p.evaluate(() => document.querySelector('dialog.help').open)));
            await p.click('.help-btn'); await p.click('.help-close');
            ok('help ' + w + ': Got it closes', !(await p.evaluate(() => document.querySelector('dialog.help').open)));
            const tb = await p.evaluate(() => [...document.querySelectorAll('.topbar > *')].map(e => e.getBoundingClientRect()).map(r => [r.left, r.right, r.top]));
            const tbr = await p.evaluate(() => [...document.querySelectorAll('.topbar > *')].map(e => { const r = e.getBoundingClientRect(); return [r.left, r.right, r.top, r.bottom]; }));
            const clash = tbr.some((a, i) => tbr.some((c, j) => j > i && Math.min(a[1], c[1]) - Math.max(a[0], c[0]) > 1 && Math.min(a[3], c[3]) - Math.max(a[2], c[2]) > 1));
            const inside = tbr.every(r => r[0] >= 0 && r[1] <= w + 1);
            ok('help ' + w + ': top bar buttons inside the screen, not overlapping', !clash && inside, tbr);
            await r.ctx.close();
        }
    } catch (e) { fail++; console.log('FAIL crashed: ' + e.stack); }
    await b.close();
    if (server) server.close();
    console.log(fail ? '\n' + fail + ' FAILED' : '\nALL UI TESTS PASSED');
    process.exit(fail ? 1 : 0);
})();
