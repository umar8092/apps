// Drives the real page in headless Chromium: node ui-test.js [--shots] [--base https://umar8092.github.io/apps]
// Without --base it serves the repo on localhost. With --base it tests the LIVE page.
// The clock is fixed to 10 October 2026, so payment 1 is November 2026.
const pw = (() => { for (const m of ['playwright', 'playwright-core', '/opt/node-tools/node_modules/playwright']) { try { return require(m); } catch (e) { /* next */ } } throw new Error('playwright not found'); })();
const path = require('path'), fs = require('fs'), http = require('http');
const SLUG = 'loan-and-credit-card-payoff-planner', ROOT = path.resolve(__dirname, '..'), KEY = SLUG + '.state';
const bi = process.argv.indexOf('--base'), LIVE = bi > 0 ? process.argv[bi + 1].replace(/\/$/, '') : null;
const shots = process.argv.includes('--shots');
const NOW = new Date(2026, 9, 10, 12, 0, 0);
let fail = 0, url;
const ok = (name, cond) => { if (!cond) fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name); };

function serve() {
    const types = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml', png: 'image/png', webmanifest: 'application/manifest+json', woff2: 'font/woff2' };
    return new Promise(res => {
        const s = http.createServer((req, rs) => {
            let p = decodeURIComponent(req.url.split('?')[0].replace(/^\/apps/, '')); if (p.endsWith('/')) p += 'index.html';
            const f = path.join(ROOT, p);
            if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rs.writeHead(404); return rs.end('nf'); }
            rs.writeHead(200, { 'content-type': types[f.split('.').pop()] || 'application/octet-stream' }); rs.end(fs.readFileSync(f));
        }).listen(0, () => res(s));
    });
}

async function load(b, vp, opt = {}) {
    const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: vp.width < 500 ? 2 : 1, colorScheme: opt.theme || 'dark', permissions: ['clipboard-read', 'clipboard-write'] });
    if (opt.init) await ctx.addInitScript(opt.init);
    const p = await ctx.newPage();
    await p.clock.setFixedTime(NOW);
    p.errors = []; p.on('console', m => m.type() === 'error' && p.errors.push(m.text())); p.on('pageerror', e => p.errors.push(String(e)));
    p.bad = []; p.on('response', r => { if (r.status() >= 400) p.bad.push(r.status() + ' ' + r.url()); });
    await p.goto(url, { waitUntil: 'networkidle' });
    return p;
}
const out = p => p.locator('#out').innerText();
const when = p => p.locator('#out .when').innerText().catch(() => '');
const stat = (p, k) => p.evaluate(k => { const d = [...document.querySelectorAll('#out .stats > div')].find(x => x.querySelector('dt').textContent === k); return d ? d.querySelector('dd').textContent : null; }, k);
const payList = p => p.evaluate(() => [...document.querySelectorAll('#out .pay-list li')].map(li => li.querySelector('.nm').firstChild.textContent + '=' + li.querySelector('.amt').textContent));
async function demo(p) { if (!await p.isVisible('#demo')) await p.click('#clear'); await p.click('#demo'); }
async function fillDebt(p, i, bal, rate, pay, name) {
    if (name != null) { const b = p.locator(`#debts .debt:nth-child(${i + 1}) .link`); if (await b.isVisible()) await b.click(); await p.fill(`#d${i}-name`, name); }
    await p.fill(`#d${i}-bal`, bal); await p.fill(`#d${i}-rate`, rate); await p.fill(`#d${i}-pay`, pay);
}
async function layout(p) {
    return p.evaluate(() => {
        const W = document.documentElement.clientWidth, bad = [], inter = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
        if (document.documentElement.scrollWidth > W) bad.push('page scrolls sideways');
        document.querySelectorAll('main *').forEach(e => { const r = e.getBoundingClientRect(); if (r.width && (r.right > W + 1 || r.left < -1) && !e.closest('.scroll')) bad.push('sticks out: ' + e.tagName + '.' + e.className); });
        const vis = l => [...l].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
        [document.querySelector('main').children, document.querySelector('.col-main').children, document.querySelector('.col-side').children, document.querySelectorAll('.debt'), document.querySelector('#out').children].forEach(g => {
            const v = vis(g); for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) if (inter(v[i].getBoundingClientRect(), v[j].getBoundingClientRect())) bad.push('overlap ' + (v[i].className || v[i].tagName) + ' x ' + (v[j].className || v[j].tagName));
        });
        const c = vis(document.querySelectorAll('main input:not([type=radio]), main select, main button, main a.secondary, main a.back, .topbar button'));
        for (let i = 0; i < c.length; i++) for (let j = i + 1; j < c.length; j++) if (!c[i].contains(c[j]) && !c[j].contains(c[i]) && inter(c[i].getBoundingClientRect(), c[j].getBoundingClientRect())) bad.push('controls overlap ' + (c[i].id || c[i].className || c[i].textContent) + ' / ' + (c[j].id || c[j].className || c[j].textContent));
        return [...new Set(bad)].slice(0, 5);
    });
}
// the README situation, with every optional part opened
async function fullState(p) {
    await demo(p);
    await p.click('#add-oneoff'); await p.fill('#o0-amt', '1,000'); await p.selectOption('#o0-month', '2027-02');
    await p.click('#add-oneoff'); await p.fill('#o1-amt', '500');
    await p.click('#add-debt'); await fillDebt(p, 3, '1,200', '0', '100', 'Loan from my brother, paid back slowly');
    await p.click('#out details summary');
}

(async () => {
    let srv;
    if (LIVE) url = LIVE + '/' + SLUG + '/';
    else { srv = await serve(); url = 'http://localhost:' + srv.address().port + '/apps/' + SLUG + '/'; }
    const b = await pw.chromium.launch();
    const PHONE = { width: 390, height: 844 }, DESK = { width: 1280, height: 900 };

    for (const vp of [PHONE, DESK]) {
        const W = '[' + vp.width + '] ';
        let p = await load(b, vp);
        // ---- first use and empty state
        ok(W + 'first use: one debt box, intro with the example button, result waits for a debt', await p.locator('.debt').count() === 1 && await p.isVisible('#demo') && /Type the balance, interest rate and monthly payment/.test(await out(p)));
        ok(W + 'optional inputs hidden: name behind "+ Add a name (optional)", one-off behind its + button, order choice hidden for one debt', !(await p.isVisible('#d0-name')) && await p.isVisible('text=+ Add a name (optional)') && await p.locator('.oneoff').count() === 0 && await p.isHidden('#order-box'));
        ok(W + 'every input and select has a visible label', await p.evaluate(() => [...document.querySelectorAll('main input:not([type=hidden]), main select')].every(e => (e.labels && e.labels.length && e.labels[0].textContent.trim()))));
        ok(W + 'no Remove button when there is only one debt', await p.locator('.debt .remove').count() === 0);

        // ---- one loan, worked by hand: 1,000 at 12% paying 100 -> 11 payments, last in September 2027, interest 58.98
        await fillDebt(p, 0, '1000', '12', '100');
        ok(W + '1,000 at 12% paying 100 (extra left blank): debt-free September 2027, 11 payments, interest 58.98, total 1,058.98',
            await when(p) === 'September 2027' && /11 payments\), starting with your November 2026 payment/.test(await out(p)) && await stat(p, 'Total interest') === '58.98' && await stat(p, 'Total you pay') === '1,058.98');
        ok(W + 'intro goes away once a debt is typed; this month pay 100.00', await p.isHidden('#intro') && (await payList(p)).join() === 'Debt 1=100.00');
        ok(W + 'one debt: no "which order" or "without the plan" section, "Finish sooner" shows', !/Which order is best/.test(await out(p)) && !/Without the plan/.test(await out(p)) && /Finish sooner/.test(await out(p)));
        ok(W + 'debt-free within a year: says well done instead of goals', /You are debt-free within a year/.test(await out(p)));

        // ---- typing odd values
        await p.fill('#d0-bal', '$ 1,000.00'); await p.fill('#d0-rate', '12 %');
        ok(W + 'pasted "$ 1,000.00" and "12 %" work the same', await when(p) === 'September 2027');
        await p.fill('#d0-rate', '12,0');
        ok(W + 'comma decimal "12,0" works', await when(p) === 'September 2027');
        await p.fill('#d0-bal', 'abc');
        ok(W + 'words in Balance: red message under the box, result asks to check it', /Type a number/.test(await p.locator('#d0-bal-err').innerText()) && await p.getAttribute('#d0-bal', 'aria-invalid') === 'true' && /Check the box marked in red in Debt 1/.test(await out(p)));
        await p.fill('#d0-bal', '-5');
        ok(W + 'negative balance is refused', /cannot be negative/.test(await p.locator('#d0-bal-err').innerText()));
        await p.fill('#d0-bal', '100000000.01');
        ok(W + 'over 100,000,000 is refused', /too big/.test(await p.locator('#d0-bal-err').innerText()));
        await p.fill('#d0-bal', '1000'); await p.fill('#d0-rate', '1001');
        ok(W + 'rate over 1000% is refused', /too high/.test(await p.locator('#d0-rate-err').innerText()));
        await p.fill('#d0-rate', '');
        ok(W + 'blank rate: no red message, result waits', await p.locator('#d0-rate-err').innerText() === '' && /Type the balance/.test(await out(p)));
        await p.fill('#d0-rate', '0'); await p.fill('#d0-pay', '0');
        ok(W + '0% and a 0 payment: "never paid off", and what to pay for 1, 2, 3, 5 years (1,000 in 1 year = 83.34 a month)', /never paid off/.test(await out(p)) && /To be debt-free in 1 year \(by October 2027\): pay 83\.34 a month/.test(await out(p)));
        await p.fill('#d0-bal', '0');
        ok(W + 'balance 0: says it is already paid off, nothing to pay', /already paid off/.test(await p.locator('#d0-warn').innerText()) && /Every balance is 0/.test(await out(p)));

        // ---- payment smaller than the interest
        await fillDebt(p, 0, '5000', '24', '50');
        ok(W + '5,000 at 24% paying 50: warning in the box (interest 100.00) and "never paid off" with the reason',
            /less than the 100\.00 interest/.test(await p.locator('#d0-warn').innerText()) && /never paid off/.test(await out(p)) && /You pay 50\.00 a month, but 100\.00 of interest/.test(await out(p)));
        ok(W + '... and it says what to pay: 1, 2, 3 and 5 year goals', (await out(p)).match(/To be debt-free in/g).length === 4);
        await p.fill('#d0-pay', '100');
        ok(W + 'payment exactly equal to the interest: "only covers" warning, never paid off', /only covers the 100\.00/.test(await p.locator('#d0-warn').innerText()) && /never paid off/.test(await out(p)));
        await fillDebt(p, 0, '100000000', '1000', '1');
        ok(W + 'huge: 100,000,000 at 1000% paying 1 does not crash, says never', /never paid off/.test(await out(p)) && p.errors.length === 0);

        // ---- the README example
        await demo(p);
        ok(W + 'example: debt-free February 2029, 28 payments, interest 1,628.84, total 13,978.84, 500.00 a month, owe 12,350.00',
            await when(p) === 'February 2029' && /28 payments/.test(await out(p)) && await stat(p, 'Total interest') === '1,628.84' && await stat(p, 'Total you pay') === '13,978.84' && await stat(p, 'You pay each month') === '500.00' && await stat(p, 'You owe now') === '12,350.00');
        ok(W + 'example: this month pay credit card 225.00 (96.00 payment + 129.00 extra), store card 25.00, car loan 250.00',
            (await payList(p)).join() === 'Credit card=225.00,Store card=25.00,Car loan=250.00' && /96\.00 payment \+ 129\.00 extra/.test(await out(p)));
        ok(W + 'example: payoff order credit card April 2028, store card May 2028, car loan February 2029',
            /1\. Credit card\s*Paid off April 2028/.test(await out(p)) && /2\. Store card\s*Paid off May 2028/.test(await out(p)) && /3\. Car loan\s*Paid off February 2029/.test(await out(p)));
        ok(W + 'example: highest interest first saves 48.02 over smallest balance first, which clears the store card in March 2027',
            /Highest interest first saves 48\.02\. Smallest balance first clears Store card sooner \(March 2027 instead of May 2028\)/.test(await out(p)));
        ok(W + 'example: without the plan August 2031, interest 3,477.89; the plan saves 1,849.05 and is 2 years 6 months sooner',
            /debt-free August 2031 \(4 years 10 months\), interest 3,477\.89/.test(await out(p)) && /saves 1,849\.05 in interest and gets you debt-free 2 years 6 months sooner/.test(await out(p)));
        ok(W + 'example: order choice shows for 2+ debts; Remove buttons appear', await p.isVisible('#order-box') && await p.locator('.debt .remove').count() === 3);
        ok(W + 'finish sooner table starts with your plan and every faster row is sooner', await p.evaluate(() => { const r = [...document.querySelectorAll('#out .tbl tbody tr')]; return r.length >= 3 && /your plan/.test(r[0].textContent); }));
        ok(W + 'goal: to be debt-free in 2 years pay 570.18 a month (70.18 more)', /To be debt-free in 2 years \(by October 2028\): pay 570\.18 a month, 70\.18 more than now/.test(await out(p)));

        // ---- order choice
        await p.check('input[value=snowball]');
        ok(W + 'smallest balance first: March 2029, interest 1,676.86, store card first', await when(p) === 'March 2029' && await stat(p, 'Total interest') === '1,676.86' && /1\. Store card\s*Paid off March 2027/.test(await out(p)) && (await payList(p)).join() === 'Credit card=96.00,Store card=154.00,Car loan=250.00');
        await p.check('input[value=listed]');
        ok(W + 'in the order listed: shown as its own line', /In the order you listed \(your plan\): debt-free February 2029/.test(await out(p)));
        await p.check('input[value=avalanche]');

        // ---- extra: chips, blank, errors
        const chip = p.locator('#extra-chips .chip').first(); const chipTxt = await chip.innerText();
        await chip.click();
        ok(W + 'extra chip ' + chipTxt + ' fills Extra each month and is marked pressed', await p.inputValue('#extra') === chipTxt.slice(1) && await chip.getAttribute('aria-pressed') === 'true');
        await p.fill('#extra', '');
        ok(W + 'blank extra = none: 371.00 a month, debt-free April 2030', await stat(p, 'You pay each month') === '371.00' && await when(p) === 'April 2030');
        await p.fill('#extra', 'lots');
        ok(W + 'extra as words: red message and result asks to check it', /Type a number/.test(await p.locator('#extra-err').innerText()) && /Check Extra each month/.test(await out(p)));
        await p.fill('#extra', '129');

        // ---- one-off payment
        await p.click('#add-oneoff');
        ok(W + 'one-off: amount and month appear, first month is November 2026', await p.isVisible('#o0-amt') && (await p.locator('#o0-month option:checked').innerText()) === 'November 2026' && await p.locator('#o0-month option').count() === 120);
        ok(W + 'blank one-off amount changes nothing', await when(p) === 'February 2029');
        await p.fill('#o0-amt', '1,000'); await p.selectOption('#o0-month', '2027-02');
        ok(W + 'a 1,000 one-off in February 2027 finishes sooner and saves interest', await when(p) !== 'February 2029' && /2028/.test(await when(p)) && Number((await stat(p, 'Total interest')).replace(/,/g, '')) < 1628.84);
        await p.fill('#o0-amt', '-1');
        ok(W + 'negative one-off: red message', /cannot be negative/.test(await p.locator('#o0-amt-err').innerText()) && /Check the one-off payment/.test(await out(p)));
        await p.fill('#o0-amt', '1000');
        await p.click('.oneoff .remove');
        ok(W + 'remove the one-off: back to February 2029, with Undo', await when(p) === 'February 2029' && await p.isVisible('#undo'));
        await p.click('#undo');
        ok(W + 'undo brings the one-off back', await p.inputValue('#o0-amt') === '1000');
        await p.click('.oneoff .remove');

        // ---- a half-filled debt
        await p.click('#add-debt');
        ok(W + 'new blank debt: no red messages, plan unchanged, focus in its balance', await when(p) === 'February 2029' && await p.locator('.ferr:visible').count() === 0 && await p.evaluate(() => document.activeElement.id === 'd3-bal'));
        await p.fill('#d3-bal', '400');
        ok(W + 'half-filled debt: plan says it is left out until filled in', /Debt 4 is left out until its balance, interest rate and monthly payment are filled in/.test(await out(p)));
        // text is shown as text
        await p.locator('#debts .debt:nth-child(4) .link').click(); await p.fill('#d3-name', '<b>Mum</b> & "Dad" — a really long name for a loan');
        ok(W + 'names are shown as plain text, never HTML; max 40 characters', (await p.locator('#d3-title').innerText()).startsWith('<b>Mum</b>') && (await p.inputValue('#d3-name')).length === 40 && await p.locator('#debts b').count() === 0);
        // remove with undo
        await p.click('#debts .debt:nth-child(4) .remove');
        ok(W + 'remove a debt: gone, with Undo', await p.locator('.debt').count() === 3 && /Removed <b>Mum<\/b>/.test(await p.locator('#msg').innerText()));
        await p.click('#undo');
        ok(W + 'undo brings the debt back with its name', await p.locator('.debt').count() === 4 && (await p.inputValue('#d3-name')).startsWith('<b>Mum'));
        await p.click('#debts .debt:nth-child(4) .remove');

        // ---- month by month
        await p.click('#out details summary'); await p.waitForSelector('#out .scroll tbody tr');
        ok(W + 'month by month: 28 rows, first November 2026, last February 2029 with 0.00 owed, payoff markers',
            await p.evaluate(() => { const r = [...document.querySelectorAll('#out .scroll tbody tr')]; return r.length === 28 && /^Nov 2026/.test(r[0].cells[0].textContent) && /^Feb 2029/.test(r[27].cells[0].textContent) && r[27].cells[3].textContent === '0.00' && document.querySelectorAll('#out .scroll tr.done').length === 3; }));

        // ---- currency, copy, email, print
        await p.selectOption('#cur', '$');
        ok(W + 'month by month stays open after a change', await p.evaluate(() => document.querySelector('#out details').open && document.querySelectorAll('#out .scroll tbody tr').length === 28));
        ok(W + 'currency $: every amount and the boxes show $', await stat(p, 'Total interest') === '$1,628.84' && await p.locator('#d0-bal').locator('xpath=..').locator('.sym').innerText() === '$');
        await p.click('#copy');
        const clip = await p.evaluate(() => navigator.clipboard.readText()).catch(() => '');
        ok(W + 'Copy plan copies the summary', /Debt-free in February 2029/.test(clip) && /Credit card: \$225\.00/.test(clip) && /Highest interest first saves \$48\.02/.test(clip));
        const href = await p.getAttribute('#mail', 'href');
        ok(W + 'Email plan: mailto with no address, subject and body', href.startsWith('mailto:?subject=') && decodeURIComponent(href).includes('Debt-free in February 2029'));
        await p.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed++; }; });
        await p.click('#print');
        ok(W + 'Print calls the browser print', await p.evaluate(() => window.__printed === 1));

        // ---- saved state
        await p.reload({ waitUntil: 'networkidle' });
        ok(W + 'reload: debts, extra, order and currency are back', await p.locator('.debt').count() === 3 && await p.inputValue('#extra') === '129' && await p.isChecked('input[value=avalanche]') && await p.inputValue('#cur') === '$' && await stat(p, 'Total interest') === '$1,628.84');
        await p.selectOption('#cur', '');

        // ---- start over with undo
        await p.click('#clear');
        ok(W + 'Start over: one blank debt, intro back, extra cleared', await p.locator('.debt').count() === 1 && await p.isVisible('#intro') && await p.inputValue('#extra') === '' && await p.inputValue('#d0-bal') === '');
        await p.click('#undo');
        ok(W + 'Undo after Start over brings everything back', await p.locator('.debt').count() === 3 && await when(p) === 'February 2029');

        // ---- max debts
        for (let k = 0; k < 7; k++) await p.click('#add-debt');
        ok(W + '10 debts at most: the add button hides', await p.locator('.debt').count() === 10 && await p.isHidden('#add-debt'));

        // ---- keyboard only
        await p.click('#clear'); await p.focus('#d0-bal');
        await p.keyboard.type('1000'); await p.keyboard.press('Tab'); await p.keyboard.type('12'); await p.keyboard.press('Tab'); await p.keyboard.type('100');
        ok(W + 'keyboard only: Tab moves balance -> rate -> payment and the result appears', await when(p) === 'September 2027');
        ok(W + 'result is announced (aria-live) and fields describe their errors', await p.getAttribute('#out', 'aria-live') === 'polite' && /d0-bal-err/.test(await p.getAttribute('#d0-bal', 'aria-describedby')));

        // ---- light / dark switch
        const before = await p.evaluate(() => getComputedStyle(document.body).color);
        await p.click('.theme-toggle');
        ok(W + 'light/dark switch changes the look', await p.evaluate(() => document.documentElement.dataset.theme) === 'light' && await p.evaluate(() => getComputedStyle(document.body).color) !== before);
        await p.click('.theme-toggle');

        ok(W + 'no console errors or failed requests', p.errors.length === 0 && p.bad.length === 0);
        if (p.errors.length || p.bad.length) console.log(p.errors, p.bad);
        await p.context().close();
    }

    // ---- corrupt and edited saved data
    {
        let p = await load(b, PHONE, { init: `localStorage.setItem('${KEY}', '{not json')` });
        ok('corrupt saved data: starts fresh with no errors', await p.locator('.debt').count() === 1 && p.errors.length === 0);
        await p.context().close();
        const bad = JSON.stringify({ debts: [{ name: 5, bal: '1000', rate: '12', pay: '100' }, null, 'x', { bal: { a: 1 } }], extra: 7, order: 'random', cur: '<script>', oneoffs: [{ amt: '100', month: '2026-08' }, { amt: '1', month: 'soon' }, 3] });
        p = await load(b, PHONE, { init: `localStorage.setItem('${KEY}', ${JSON.stringify(bad)})` });
        ok('edited saved data: bad values dropped, good debt kept, order back to highest interest first, past one-off kept and marked',
            await p.locator('.debt').count() === 2 && await p.inputValue('#d0-bal') === '1000' && await p.isChecked('input[value=avalanche]') && await p.inputValue('#cur') === '' && await p.locator('.oneoff').count() === 1 &&
            /August 2026 \(in the past\)/.test(await p.locator('#o0-month option:checked').innerText()) && /The one-off payment in August 2026 is in the past, so it is left out/.test(await out(p)) && p.errors.length === 0);
        await p.context().close();
        p = await load(b, PHONE, { init: `Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } })` });
        await fillDebt(p, 0, '1000', '12', '100');
        ok('storage blocked: the app still works for the visit', await when(p) === 'September 2027' && p.errors.length === 0);
        await p.context().close();
    }

    // ---- every width, dark and light, filled in (every optional part open) and cleared
    for (const theme of ['dark', 'light']) {
        const p = await load(b, { width: 1280, height: 900 }, { theme });
        for (const state of ['filled', 'cleared']) {
            if (state === 'filled') await fullState(p); else { await p.click('#clear'); }
            for (const w of [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920]) {
                await p.setViewportSize({ width: w, height: 900 });
                const probs = [];
                for (const pos of [0, 0.5, 1]) { await p.evaluate(x => scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * x), pos); probs.push(...await layout(p)); }
                ok(`[${theme} ${state} ${w}] no sideways scroll, nothing sticks out, nothing overlaps (top, middle, bottom)` + (probs.length ? ': ' + [...new Set(probs)].join('; ') : ''), !probs.length);
            }
            await p.setViewportSize({ width: 1280, height: 900 });
        }
        ok(`[${theme}] no console errors`, p.errors.length === 0);
        await p.context().close();
    }
    // desktop really uses two columns, phones one
    {
        const p = await load(b, DESK); await demo(p);
        const r = await p.evaluate(() => { const a = document.querySelector('.col-main').getBoundingClientRect(), c = document.querySelector('.col-side').getBoundingClientRect(), m = document.querySelector('main').getBoundingClientRect(); return { side: c.left >= a.right, w: m.width }; });
        ok('1280: debts on the left, result on the right, app ' + Math.round(r.w) + 'px wide', r.side && r.w >= 1000);
        await p.setViewportSize({ width: 390, height: 844 });
        ok('390: one column (result under the plan)', await p.evaluate(() => document.querySelector('.col-side').getBoundingClientRect().top >= document.querySelector('.col-main').getBoundingClientRect().bottom));
        await p.context().close();
    }

    // ---- offline: after the first visit the page opens with no network
    {
        const ctx = await b.newContext({ viewport: PHONE }); const p = await ctx.newPage();
        await p.goto(url, { waitUntil: 'networkidle' });
        await p.evaluate(() => navigator.serviceWorker.ready);
        await p.reload({ waitUntil: 'networkidle' });
        await ctx.setOffline(true);
        await p.reload({ waitUntil: 'load' }).catch(() => {});
        await fillDebt(p, 0, '1000', '12', '100').catch(() => {});
        ok('works offline after the first visit', /11 payments/.test(await out(p).catch(() => '')));
        await ctx.close();
    }

    // ---- every file the page uses answers 200; the hub lists the app
    {
        const p = await load(b, PHONE);
        const files = ['favicon.svg', 'manifest.webmanifest', 'sw.js', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', '../help.js', '../theme.js', 'core.js', 'script.js', 'style.css', 'screenshots/desktop.png', 'screenshots/phone.png', 'test.html', 'tests.js'];
        const codes = await p.evaluate(fs => Promise.all(fs.map(f => fetch(f, { cache: 'no-store' }).then(r => r.status))), files);
        ok('all files return 200' + files.map((f, i) => codes[i] !== 200 ? ' ' + f + ' ' + codes[i] : '').join(''), codes.every(c => c === 200));
        await p.goto(url + 'test.html', { waitUntil: 'networkidle' });
        ok('test.html in the browser: all maths checks pass', /^(\d+) of \1 checks passed$/.test(await p.locator('#sum').innerText()));
        await p.goto(url.replace(SLUG + '/', ''), { waitUntil: 'networkidle' });
        const card = p.locator(`a[href*="${SLUG}"]`).first();
        await card.waitFor({ timeout: 8000 }).catch(() => {});
        ok('the hub lists the app', await card.count() > 0 && /Loan and Credit Card Payoff Planner/.test(await p.locator('body').innerText()));
        if (await card.count()) { await card.click(); await p.waitForLoadState('networkidle'); ok('the hub card opens the app', p.url().includes(SLUG) && await p.locator('h1').innerText() === 'Loan and Credit Card Payoff Planner'); }
        await p.context().close();
    }

    // ---- screenshots of the real situation
    if (shots) {
        let p = await load(b, { width: 1280, height: 1600 });
        await demo(p); await p.evaluate(() => { document.getElementById('msg').textContent = ''; });
        const h = await p.evaluate(() => Math.ceil(document.querySelector('.col-side .result').getBoundingClientRect().bottom + scrollY + 24));
        await p.screenshot({ path: path.join(__dirname, 'screenshots/desktop.png'), clip: { x: 0, y: 0, width: 1280, height: Math.min(h, 1700) }, fullPage: true });
        await p.context().close();
        p = await load(b, { width: 390, height: 844 });
        await p.locator('.debt .link').click(); await fillDebt(p, 0, '5,000', '19.99', '150', 'Credit card'); await p.fill('#extra', '100');
        const top = await p.evaluate(() => Math.floor(document.querySelector('.col-main').getBoundingClientRect().top + scrollY));
        const bot = await p.evaluate(() => { const e = [...document.querySelectorAll('#out h3')].find(x => x.textContent === 'Finish sooner'); return Math.ceil(e.getBoundingClientRect().top + scrollY - 6); });
        await p.screenshot({ path: path.join(__dirname, 'screenshots/phone.png'), clip: { x: 0, y: 0, width: 390, height: bot }, fullPage: true });
        console.log('phone shot from 0 to', bot, 'top of form', top);
        await p.context().close();
        console.log('screenshots saved');
    }
    await b.close(); if (srv) srv.close();
    console.log(fail ? '\n' + fail + ' FAILED' : '\nALL UI CHECKS PASSED (' + (LIVE ? 'live' : 'local') + ')');
    process.exit(fail ? 1 : 0);
})();
