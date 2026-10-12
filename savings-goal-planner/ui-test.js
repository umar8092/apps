// Drives the real page in headless Chromium: node ui-test.js [--shots] [--base https://umar8092.github.io/apps]
// Without --base it serves this repo on localhost. With --base it tests the LIVE page. The clock is fixed at 12 Oct 2026, 10:00.
const pw = (() => { for (const m of ['playwright', 'playwright-core', '/opt/node-tools/node_modules/playwright']) { try { return require(m); } catch (e) { /* next */ } } throw new Error('playwright not found'); })();
const path = require('path'), fs = require('fs'), http = require('http'), os = require('os');
const bi = process.argv.indexOf('--base');
const shots = process.argv.includes('--shots');
let fail = 0, url;
const ok = (name, cond) => { if (!cond) fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name); };
const NOW = new Date(2026, 9, 12, 10, 0);

function serve() {
    const ROOT = path.resolve(__dirname, '..');
    const types = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml', png: 'image/png', webmanifest: 'application/manifest+json' };
    return new Promise(res => {
        const s = http.createServer((req, rs) => {
            let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
            const f = path.join(ROOT, p);
            if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rs.writeHead(404); return rs.end('nf'); }
            rs.writeHead(200, { 'content-type': types[f.split('.').pop()] || 'application/octet-stream' }); rs.end(fs.readFileSync(f));
        }).listen(0, () => res(s));
    });
}

async function load(b, vp, opt = {}) {
    const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: vp.width < 500 ? 2 : 1, colorScheme: opt.theme || 'dark',
        permissions: ['clipboard-read', 'clipboard-write'], storageState: opt.state, acceptDownloads: true });
    if (opt.init) await (Array.isArray(opt.init) ? ctx.addInitScript(opt.init[0], opt.init[1]) : ctx.addInitScript(opt.init));
    const p = await ctx.newPage();
    if (opt.install) await p.clock.install({ time: opt.install }); else await p.clock.setFixedTime(NOW);
    p.errors = []; p.on('console', m => m.type() === 'error' && p.errors.push(m.text())); p.on('pageerror', e => p.errors.push(String(e)));
    p.bad = []; p.on('response', r => { if (r.status() >= 400) p.bad.push(r.status() + ' ' + r.url()); });
    await p.goto(url, { waitUntil: 'networkidle' });
    return p;
}
const txt = (p, sel) => p.textContent(sel);
async function addGoal(p, o) {
    await p.fill('#f-name', o.name); await p.fill('#f-target', o.target); await p.fill('#f-start', o.start || '');
    if (o.pay) { await p.check('#m-amount'); await p.fill('#f-pay', o.pay); } else { await p.check('#m-date'); await p.fill('#f-date', o.date); }
    await p.selectOption('#f-freq', o.freq || 'month');
    if (o.rate) { if (await p.isVisible('#open-rate')) await p.click('#open-rate'); await p.fill('#f-rate', o.rate); }
    await p.click('#save');
}
const goal = (p, name) => p.locator('.goal:not(.gone)', { has: p.locator('h3', { hasText: new RegExp('^' + name + '$') }) });
const gt = async (p, name, sel) => (await goal(p, name).locator(sel).first().textContent()).trim();

// The README goals, typed through the form
async function situation(p) {
    await addGoal(p, { name: 'Trip to Japan', target: '3,000', start: '1200', date: '2027-06-01' });
    await addGoal(p, { name: 'Emergency fund', target: '5000', start: '750', pay: '300', rate: '4' });
    await addGoal(p, { name: 'New laptop', target: '1299.99', date: '2026-12-24', freq: 'week' });
}

async function layout(p) {
    return p.evaluate(() => {
        const W = document.documentElement.clientWidth, bad = [], inter = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
        if (document.documentElement.scrollWidth > W) bad.push('page scrolls sideways');
        document.querySelectorAll('main *').forEach(e => { const r = e.getBoundingClientRect(); if (r.width && (r.right > W + 1 || r.left < -1)) bad.push('sticks out: ' + e.tagName + '.' + e.className); });
        const vis = l => [...l].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
        [document.querySelector('main').children, document.querySelectorAll('.card'), document.querySelectorAll('.goal'), document.querySelectorAll('.log li')].forEach(g => {
            const v = vis(g); for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) if (!v[i].contains(v[j]) && !v[j].contains(v[i]) && inter(v[i].getBoundingClientRect(), v[j].getBoundingClientRect())) bad.push('overlap ' + (v[i].className || v[i].tagName) + ' x ' + (v[j].className || v[j].tagName));
        });
        const c = vis(document.querySelectorAll('main input:not([type=radio]), main select, main button, main a.secondary, .goal h3, .g-pct, .a-big'));
        for (let i = 0; i < c.length; i++) for (let j = i + 1; j < c.length; j++) if (!c[i].contains(c[j]) && !c[j].contains(c[i]) && inter(c[i].getBoundingClientRect(), c[j].getBoundingClientRect())) bad.push('controls overlap ' + (c[i].id || c[i].className || c[i].textContent) + ' / ' + (c[j].id || c[j].className || c[j].textContent));
        const cv = document.createElement('canvas').getContext('2d');
        vis(document.querySelectorAll('main input[placeholder]')).forEach(e => {
            const cs = getComputedStyle(e); cv.font = cs.fontSize + ' ' + cs.fontFamily;
            const room = e.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
            if (cv.measureText(e.placeholder).width > room + 1) bad.push('placeholder cut off: ' + e.id);
        });
        vis(document.querySelectorAll('.g-btns button, .kind span, .tool-grid > *, .a-big, .g-pct, .log li b, .money-panel button')).forEach(e => { if (e.scrollWidth > e.clientWidth + 1) bad.push('clipped: ' + (e.id || e.className || e.textContent)); });
        return bad.slice(0, 6);
    });
}

(async () => {
    let srv;
    if (bi >= 0) url = process.argv[bi + 1].replace(/\/$/, '') + '/savings-goal-planner/';
    else { srv = await serve(); url = 'http://localhost:' + srv.address().port + '/savings-goal-planner/'; }
    const b = await pw.chromium.launch();

    // ---- first use and wrong input
    let p = await load(b, { width: 390, height: 860 });
    ok('first use: intro and example button, no totals yet', await p.isVisible('#demo') && !(await p.isVisible('#summary')) && (await p.$$eval('.goal', e => e.length)) === 0);
    ok('optional interest hidden, set-amount box hidden', !(await p.isVisible('#f-rate')) && !(await p.isVisible('#f-pay')) && await p.isVisible('#f-date'));
    const err = async (msg) => { await p.click('#save'); return (await txt(p, '#form-err')).includes(msg); };
    ok('blank name refused', await err('Type what you are saving for'));
    await p.fill('#f-name', 'Car');
    ok('blank goal amount refused', await err('Type the goal amount'));
    await p.fill('#f-target', '0'); ok('goal amount 0 refused', await err('more than 0'));
    await p.fill('#f-target', 'lots'); ok('words refused', await err('as a number'));
    await p.fill('#f-target', '99999999999'); ok('huge refused', await err('too big'));
    await p.fill('#f-target', '5000'); await p.fill('#f-start', '-5'); ok('negative saved refused', await err('cannot be below 0'));
    await p.fill('#f-start', '');
    ok('no goal date refused', await err('Choose the goal date'));
    await p.fill('#f-date', '2026-10-12'); ok('goal date today refused', await err('after today'));
    await p.fill('#f-date', '2025-01-01'); ok('past goal date refused', await err('after today'));
    await p.check('#m-amount');
    ok('set amount: blank refused', await err('how much you can save'));
    await p.fill('#f-pay', '0'); ok('set amount 0 refused', await err('more than 0'));
    await p.fill('#f-pay', '100'); await p.click('#open-rate'); await p.fill('#f-rate', '45');
    ok('interest over 30% refused', await err('up to 30%'));
    await p.click('#close-rate');
    ok('nothing saved after the errors', (await p.$$eval('.goal', e => e.length)) === 0);
    await p.click('#save');
    ok('saved so far can stay empty: 5,000 at 100 a month = 50 payments, reached 12 Nov 2030', (await gt(p, 'Car', '.a-big')) === '12 Nov 2030' && (await gt(p, 'Car', '.a-text')) === '50 payments of 100.00 a month.' && (await gt(p, 'Car', '.g-saved')).startsWith('0.00 of 5,000.00'));
    ok('form cleared after adding, back to Reach it by a date', (await p.inputValue('#f-name')) === '' && await p.isChecked('#m-date') && (await txt(p, '#add-msg')).startsWith('Added Car. 12 Nov 2030: you reach it then.'));
    await p.click('#add-msg button');
    ok('undo the add', (await p.$$eval('.goal', e => e.length)) === 0);
    await p.close();

    // ---- the README goals on a laptop
    p = await load(b, { width: 1280, height: 900 });
    await situation(p);
    ok('Japan: Save 225.00 a month', (await gt(p, 'Trip to Japan', '.a-label')) === 'Save' && (await gt(p, 'Trip to Japan', '.a-big')) === '225.00 a month');
    ok('Japan: 8 payments from today to 12 May 2027', (await gt(p, 'Trip to Japan', '.a-text')) === '8 payments of 225.00, from today to 12 May 2027. That reaches 3,000.00 by 1 Jun 2027.' && (await gt(p, 'Trip to Japan', '.g-next')) === 'Next payment: 225.00 today.');
    ok('Japan: 1,200.00 of 3,000.00 saved, 40%', (await gt(p, 'Trip to Japan', '.g-saved')) === '1,200.00 of 3,000.00 saved, goal date 1 Jun 2027.' && (await gt(p, 'Trip to Japan', '.g-pct')) === '40%');
    ok('Fund: reached 12 Nov 2027 with 14 payments, last 224.60, interest 125.40', (await gt(p, 'Emergency fund', '.a-big')) === '12 Nov 2027' && (await gt(p, 'Emergency fund', '.a-text')) === '14 payments of 300.00 a month, the last one only 224.60. Interest adds 125.40.');
    ok('Laptop: 118.19 a week, 11 payments, last 118.09 on 21 Dec', (await gt(p, 'New laptop', '.a-big')) === '118.19 a week' && (await gt(p, 'New laptop', '.a-text')) === '11 payments of 118.19, the last one only 118.09, from today to 21 Dec 2026. That reaches 1,299.99 by 24 Dec 2026.');
    ok('All goals: 1,950.00 of 9,299.99 (20%), about 1,037.16 a month', (await txt(p, '#sum-saved')) === '1,950.00' && (await txt(p, '#sum-meta')) === 'saved of 9,299.99 for 3 goals (20%).' && (await txt(p, '#sum-month')) === 'To stay on plan you save about 1,037.16 a month in total.');
    ok('each goal in its own bordered box with its own colour', (await p.$$eval('.goal', e => new Set(e.map(x => getComputedStyle(x).borderLeftColor)).size)) === 3);
    ok('no horizontal scroll or overlap at 1280 with goals', (await layout(p)).length === 0);
    if (shots) {
        await p.evaluate(() => { document.getElementById('add-msg').textContent = ''; window.scrollTo(0, 0); }); await p.waitForTimeout(300);
        await p.screenshot({ path: path.join(__dirname, 'screenshots/desktop.png') });
    }

    // money in and out
    await goal(p, 'Trip to Japan').locator('button', { hasText: 'Add money' }).click();
    ok('Add money box opens with the payment as a hint and today\'s date', (await p.getAttribute('#pm-amt', 'placeholder')) === '225' && (await p.inputValue('#pm-date')) === '2026-10-12' && (await p.evaluate(() => document.activeElement.id)) === 'pm-amt');
    await p.fill('#pm-amt', '0'); await p.press('#pm-amt', 'Enter');
    ok('0 refused', (await goal(p, 'Trip to Japan').locator('.money-panel .err').textContent()).includes('more than 0'));
    await p.fill('#pm-amt', '225'); await p.fill('#pm-date', '2026-10-20'); await p.press('#pm-amt', 'Enter');
    ok('future date refused', (await goal(p, 'Trip to Japan').locator('.money-panel .err').textContent()).includes('future'));
    await p.fill('#pm-date', '2026-10-12'); await p.press('#pm-amt', 'Enter');
    ok('after adding 225 today: next payment 12 Nov, 7 payments of 225.00', (await gt(p, 'Trip to Japan', '.g-next')) === 'Next payment: 225.00 on 12 Nov 2026. You already saved this month.' && (await gt(p, 'Trip to Japan', '.a-text')).startsWith('7 payments of 225.00, from 12 Nov 2026 to 12 May 2027.'));
    ok('message with Undo in the goal, saved 1,425.00', (await gt(p, 'Trip to Japan', '.msg')).startsWith('Added 225.00. Next payment') && (await gt(p, 'Trip to Japan', '.g-saved')).startsWith('1,425.00'));
    ok('Money in and out list shows +225.00', (await gt(p, 'Trip to Japan', '.log summary')) === 'Money in and out (1)' && (await goal(p, 'Trip to Japan').locator('.log li b').textContent()) === '+225.00');
    await goal(p, 'Trip to Japan').locator('.msg button').click();
    ok('undo the money in', (await gt(p, 'Trip to Japan', '.g-saved')).startsWith('1,200.00') && (await goal(p, 'Trip to Japan').locator('.log').count()) === 0);
    await goal(p, 'Trip to Japan').locator('button', { hasText: 'Take money out' }).click();
    await p.fill('#pm-amt', '1500'); await p.press('#pm-amt', 'Enter');
    ok('cannot take out more than saved', (await goal(p, 'Trip to Japan').locator('.money-panel .err').textContent()).includes('at most 1,200.00'));
    await p.fill('#pm-amt', '200'); await p.press('#pm-amt', 'Enter');
    ok('took out 200: saved 1,000, now 250.00 a month (2,000 / 8)', (await gt(p, 'Trip to Japan', '.g-saved')).startsWith('1,000.00') && (await gt(p, 'Trip to Japan', '.a-big')) === '250.00 a month' && (await gt(p, 'Trip to Japan', '.g-next')) === 'Next payment: 250.00 today.');
    await goal(p, 'Trip to Japan').locator('button', { hasText: 'Add money' }).click();
    await p.fill('#pm-amt', '50'); await p.fill('#pm-date', '2026-10-01'); await p.click('.money-panel .primary');
    await goal(p, 'Trip to Japan').locator('.log summary').click();
    ok('list newest first: -200 (12 Oct) then +50 (1 Oct)', (await goal(p, 'Trip to Japan').locator('.log li b').allTextContents()).join() === '−200.00,+50.00');
    // Escape closes the panel
    await goal(p, 'Trip to Japan').locator('button', { hasText: 'Add money' }).click();
    await p.press('#pm-amt', 'Escape');
    ok('Escape closes the Add money box', (await p.locator('.money-panel').count()) === 0);
    await goal(p, 'Trip to Japan').locator('.log li', { hasText: '+50.00' }).locator('button').click();
    ok('delete a money-in entry: saved 1,000.00 again, Undo shown', (await gt(p, 'Trip to Japan', '.g-saved')).startsWith('1,000.00') && (await gt(p, 'Trip to Japan', '.msg')).includes('deleted.'));
    await goal(p, 'Trip to Japan').locator('.msg button').click();
    ok('undo that delete', (await gt(p, 'Trip to Japan', '.g-saved')).startsWith('1,050.00'));
    await goal(p, 'Trip to Japan').locator('.log summary').click().catch(() => {});
    if (!(await goal(p, 'Trip to Japan').locator('.log li').first().isVisible())) await goal(p, 'Trip to Japan').locator('.log summary').click();
    await goal(p, 'Trip to Japan').locator('.log li', { hasText: '−200.00' }).locator('button').click();
    await goal(p, 'Trip to Japan').locator('.msg button').click();

    // edit, cancel, escape, reached, too slow
    await goal(p, 'Trip to Japan').locator('button', { hasText: 'Edit' }).click();
    ok('Edit fills the form with the goal', (await txt(p, '#form-h')) === 'Edit Trip to Japan' && (await p.inputValue('#f-target')) === '3000' && (await p.inputValue('#f-start')) === '1050' && (await p.inputValue('#f-date')) === '2027-06-01' && await p.isVisible('#cancel-edit'));
    await p.fill('#f-start', '3200'); await p.click('#save');
    ok('saved more than the goal: Goal reached, 200.00 more than needed', (await gt(p, 'Trip to Japan', '.a-label')) === 'Goal reached' && (await gt(p, 'Trip to Japan', '.a-text')) === 'You have 200.00 more than you need.' && (await gt(p, 'Trip to Japan', '.g-pct')) === '100%');
    ok('the money-in list is kept after editing what is saved', (await gt(p, 'Trip to Japan', '.log summary')) === 'Money in and out (2)');
    await goal(p, 'Trip to Japan').locator('.msg button').click();
    ok('undo the edit', (await gt(p, 'Trip to Japan', '.g-saved')).startsWith('1,050.00'));
    await goal(p, 'Emergency fund').locator('button', { hasText: 'Edit' }).click();
    ok('editing a set-amount goal shows its amount and interest', await p.isChecked('#m-amount') && (await p.inputValue('#f-pay')) === '300' && (await p.inputValue('#f-rate')) === '4');
    await p.fill('#f-pay', '0.01'); await p.click('#close-rate'); await p.click('#save');
    ok('0.01 a month: over 100 years, says to save more', (await gt(p, 'Emergency fund', '.a-big')) === 'Over 100 years' && (await gt(p, 'Emergency fund', '.answer')).includes('save more'));
    await goal(p, 'Emergency fund').locator('.msg button').click();
    await goal(p, 'New laptop').locator('button', { hasText: 'Edit' }).click();
    await p.fill('#f-name', 'xx'); await p.click('#cancel-edit');
    ok('Cancel leaves it as it was', (await goal(p, 'New laptop').count()) === 1 && (await txt(p, '#form-h')) === 'Add a savings goal' && (await p.inputValue('#f-name')) === '');
    await goal(p, 'New laptop').locator('button', { hasText: 'Edit' }).click();
    await p.press('#f-name', 'Escape');
    ok('Escape cancels the edit', (await txt(p, '#form-h')) === 'Add a savings goal');

    // delete and undo
    await goal(p, 'New laptop').locator('button', { hasText: 'Delete' }).click();
    ok('delete a goal: undo row in place, totals change', (await txt(p, '.goal.gone span')) === 'New laptop deleted.' && (await txt(p, '#sum-meta')).includes('2 goals'));
    await p.click('.goal.gone button');
    ok('undo: laptop back', (await goal(p, 'New laptop').count()) === 1);

    // currency, copy, email, print
    await p.selectOption('#cur', '£');
    ok('currency £ everywhere', (await txt(p, '#sum-saved')) === '£1,800.00' && (await gt(p, 'New laptop', '.a-big')) === '£118.19 a week' && (await txt(p, '.money .sym')) === '£');
    await p.click('#copy');
    const clip = await p.evaluate(() => navigator.clipboard.readText());
    ok('copy plan', clip.startsWith('My savings goals (12 Oct 2026)') && clip.includes('New laptop: £0.00 of £1,299.99 saved, goal date 24 Dec 2026.\nSave: £118.19 a week. 11 payments of £118.19, the last one only £118.09'));
    const mail = await p.getAttribute('#mail', 'href');
    ok('email plan: mailto with no address', mail.startsWith('mailto:?subject=My%20savings%20plan&body=') && decodeURIComponent(mail).includes('Emergency fund'));
    await p.emulateMedia({ media: 'print' });
    ok('print hides the form and buttons', !(await p.isVisible('.add-card')) && !(await p.isVisible('.g-btns')));
    await p.emulateMedia({ media: 'screen' });

    const state = await p.context().storageState();
    ok('no console errors or failed requests on the laptop run', p.errors.length === 0 && p.bad.length === 0);
    if (p.errors.length || p.bad.length) console.log(p.errors, p.bad);
    await p.click('#wipe');
    ok('delete all goals, with undo', (await p.$$eval('.goal', e => e.length)) === 0 && await p.isVisible('#demo'));
    await p.click('#tools-msg button');
    ok('undo delete all', (await p.$$eval('.goal', e => e.length)) === 3);
    await p.close();

    p = await load(b, { width: 390, height: 860 }, { state });
    ok('reload: goals, money in and out and currency are back', (await p.$$eval('.goal', e => e.length)) === 3 && (await p.inputValue('#cur')) === '£' && (await gt(p, 'Trip to Japan', '.g-saved')).startsWith('£1,050.00'));
    const L = await layout(p); if (L.length) console.log(L);
    ok('phone: nothing overlaps, no sideways scroll, placeholders fit', L.length === 0);
    await goal(p, 'Trip to Japan').locator('button', { hasText: 'Add money' }).click();
    await goal(p, 'Trip to Japan').locator('.log summary').click();
    ok('phone with the Add money box and list open: fine', (await layout(p)).length === 0);
    await p.close();
    if (shots) {
        p = await load(b, { width: 390, height: 860 });
        await p.click('#demo'); await p.evaluate(() => { document.getElementById('goals-msg').textContent = ''; window.scrollTo(0, 0); }); await p.waitForTimeout(300);
        await p.screenshot({ path: path.join(__dirname, 'screenshots/phone.png') });
        await p.close();
    }

    // saved goal whose date has passed, too soon, corrupt data, storage blocked
    const saved = (goals) => [g => localStorage.setItem('savings-goal-planner.state', JSON.stringify({ goals: g })), goals];
    p = await load(b, { width: 390, height: 860 }, { init: saved([{ id: 'a', name: 'Old goal', target: 100000, start: 40000, mode: 'date', date: '2026-09-30', freq: 'month', log: [] },
        { id: 'b', name: 'Soon', target: 100000, start: 0, mode: 'date', date: '2026-10-30', freq: 'month', log: [{ id: 'x', date: '2026-10-05', cents: 1000 }] }]) });
    ok('date passed: 600.00 still needed, tells you what to do', (await gt(p, 'Old goal', '.a-label')) === 'Still needed' && (await gt(p, 'Old goal', '.a-big')) === '600.00' && (await gt(p, 'Old goal', '.a-text')).includes('has passed'));
    ok('paid this month and the date is before the next payment: says put the rest in before then', (await gt(p, 'Soon', '.a-big')) === '990.00' && (await gt(p, 'Soon', '.a-text')).includes('5 Nov 2026'));
    await p.close();
    p = await load(b, { width: 390, height: 860 }, { init: () => localStorage.setItem('savings-goal-planner.state', '{"goals": [5, {"name": "x"}, ') });
    ok('corrupt saved data: starts fresh without errors', (await p.$$eval('.goal', e => e.length)) === 0 && p.errors.length === 0);
    await p.close();
    p = await load(b, { width: 390, height: 860 }, { init: () => { Storage.prototype.setItem = () => { throw new Error('blocked'); }; } });
    await addGoal(p, { name: 'Bike', target: '600', date: '2027-04-01' });
    ok('storage blocked: still works and says it is not saving', (await goal(p, 'Bike').count()) === 1 && await p.isVisible('#save-warn'));
    await p.close();

    // pasted long name at 320px
    p = await load(b, { width: 320, height: 800 });
    await p.evaluate(() => document.getElementById('f-name').focus());
    await p.keyboard.insertText('A very long pasted goal name that goes on '.repeat(5));
    await p.fill('#f-target', '1.299,50 €'); await p.fill('#f-date', '2027-01-12'); await p.click('#save');
    ok('long name cut to 50 and wraps; 1.299,50 € read as 1,299.50', (await p.locator('.goal h3').textContent()).length <= 50 && (await p.locator('.goal .g-saved').textContent()).includes('of 1,299.50 saved'));
    await p.click('.g-btns .in'); await p.click('#open-rate');
    ok('320px with the Add money box and interest open: fine', (await layout(p)).length === 0);
    await p.close();

    // midnight while the page is open
    p = await load(b, { width: 390, height: 860 }, { install: new Date(2026, 9, 31, 23, 59, 0), init: saved([{ id: 'a', name: 'Rent', target: 80000, start: 0, mode: 'date', date: '2026-11-01', freq: 'month', log: [] }]) });
    ok('31 Oct 23:59: one payment of 800.00 today', (await gt(p, 'Rent', '.a-text')) === 'One payment of 800.00 today reaches 800.00.');
    await p.clock.runFor(120000);
    ok('after midnight the plan is worked out again: the date has passed', (await gt(p, 'Rent', '.a-label')) === 'Still needed');
    await p.close();

    // every width, both themes, filled in and empty, plus the theme switch
    for (const theme of ['dark', 'light']) {
        p = await load(b, { width: 1280, height: 900 }, { theme });
        await p.click('#demo');
        await goal(p, 'Trip to Japan').locator('button', { hasText: 'Add money' }).click();
        await goal(p, 'Emergency fund').locator('button', { hasText: 'Edit' }).click();
        const bad = [];
        for (const w of [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920]) {
            await p.setViewportSize({ width: w, height: 900 });
            for (const pos of [0, 0.5, 1]) {
                await p.evaluate(x => window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * x), pos);
                const l = await layout(p); if (l.length) bad.push(w + 'px ' + pos + ': ' + l.join(', '));
            }
        }
        ok(theme + ': 11 widths with three goals, an open box and an edit, no overlap or sideways scroll', bad.length === 0);
        if (bad.length) console.log(bad.slice(0, 5));
        await p.click('#cancel-edit'); await p.click('#wipe');
        const bad2 = [];
        for (const w of [320, 390, 900, 1280]) { await p.setViewportSize({ width: w, height: 900 }); const l = await layout(p); if (l.length) bad2.push(w + ': ' + l.join(', ')); }
        ok(theme + ': empty state at 4 widths fine', bad2.length === 0);
        if (bad2.length) console.log(bad2);
        const before = await p.evaluate(() => getComputedStyle(document.body).color);
        await p.click('.theme-toggle');
        ok(theme + ': light/dark switch changes the look', before !== await p.evaluate(() => getComputedStyle(document.body).color));
        ok(theme + ': no console errors', p.errors.length === 0);
        await p.close();
    }

    p = await load(b, { width: 390, height: 860 });
    const files = ['favicon.svg', 'manifest.webmanifest', 'sw.js', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', '../help.js', '../theme.js', 'core.js', 'script.js', 'style.css'];
    const st = await p.evaluate(async fs => Promise.all(fs.map(f => fetch(f).then(r => r.status))), files);
    ok('every file the page uses returns 200', st.every(s => s === 200));
    await p.close();

    await b.close(); if (srv) srv.close();
    console.log('\n' + (fail ? fail + ' FAILED' : 'ALL UI CHECKS PASSED'));
    process.exit(fail ? 1 : 0);
})();
