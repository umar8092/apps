// Drives the real page in headless Chromium: node ui-test.js [--shots] [--base https://umar8092.github.io/apps]
// Without --base it serves the repo on localhost. With --base it tests the LIVE page.
const pw = (() => { for (const m of ['playwright', 'playwright-core', '/opt/node-tools/node_modules/playwright']) { try { return require(m); } catch (e) { /* next */ } } throw new Error('playwright not found'); })();
const path = require('path'), fs = require('fs'), http = require('http');
const SLUG = 'hourly-to-salary-converter', ROOT = path.resolve(__dirname, '..');
const bi = process.argv.indexOf('--base'), LIVE = bi > 0 ? process.argv[bi + 1].replace(/\/$/, '') : null;
const shots = process.argv.includes('--shots');
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
    const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: vp.width < 500 ? 2 : 1, colorScheme: opt.theme || 'dark', permissions: ['clipboard-read', 'clipboard-write'], storageState: opt.state });
    if (opt.init) await ctx.addInitScript(opt.init);
    const p = await ctx.newPage();
    p.errors = []; p.on('console', m => m.type() === 'error' && p.errors.push(m.text())); p.on('pageerror', e => p.errors.push(String(e)));
    p.bad = []; p.on('response', r => { if (r.status() >= 400) p.bad.push(r.status() + ' ' + r.url()); });
    await p.goto(url, { waitUntil: 'networkidle' });
    return p;
}
const txt = (p, sel) => p.locator(sel).first().innerText();
const rowVal = (p, job, label) => p.evaluate(([j, l]) => { const c = document.querySelectorAll('#tables .res-job')[j]; const d = c && [...c.querySelectorAll('.rows > div')].find(x => x.querySelector('dt').textContent.startsWith(l)); return d ? d.querySelector('dd').textContent : null; }, [job, label]);
async function layout(p) {
    return p.evaluate(() => {
        const W = document.documentElement.clientWidth, bad = [], inter = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
        if (document.documentElement.scrollWidth > W) bad.push('page scrolls sideways');
        document.querySelectorAll('main *').forEach(e => { const r = e.getBoundingClientRect(); if (r.width && (r.right > W + 1 || r.left < -1)) bad.push('sticks out: ' + e.tagName + '.' + e.className); });
        const vis = l => [...l].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
        [document.querySelector('main').children, document.querySelector('.col-main').children, document.querySelector('.col-side').children, document.querySelectorAll('.job'), document.querySelectorAll('.res-job')].forEach(g => {
            const v = vis(g); for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) if (inter(v[i].getBoundingClientRect(), v[j].getBoundingClientRect())) bad.push('overlap ' + (v[i].className || v[i].tagName) + ' x ' + (v[j].className || v[j].tagName));
        });
        const c = vis(document.querySelectorAll('main input, main select, main button, main a.secondary, main a.back'));
        for (let i = 0; i < c.length; i++) for (let j = i + 1; j < c.length; j++) if (!c[i].contains(c[j]) && !c[j].contains(c[i]) && inter(c[i].getBoundingClientRect(), c[j].getBoundingClientRect())) bad.push('controls overlap ' + (c[i].id || c[i].className || c[i].textContent) + ' / ' + (c[j].id || c[j].className || c[j].textContent));
        return [...new Set(bad)].slice(0, 5);
    });
}
// fill the README situation and open every optional part
async function fullState(p) {
    await p.click('#demo');
    await p.click('#add-job'); await p.click('#add-job');
    for (const i of [1, 2, 3, 4]) for (const t of ['name', 'holidays', 'overtime']) {
        const l = p.locator(`#jobs .job:nth-child(${i}) .link:has-text("${t}")`); if (await l.isVisible()) await l.click();
    }
    await p.fill('#j0-ot', '5'); await p.fill('#j1-ot', '3');
    await p.selectOption('#j1-mult', 'other'); await p.fill('#j1-mult-other', '1.75');
    await p.fill('#j2-pay', '3500'); await p.selectOption('#j2-per', 'month'); await p.fill('#j3-pay', '-1');
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
        ok(W + 'first use: one job, intro with the example button, results wait for the pay', await p.locator('.job').count() === 1 && await p.isVisible('#demo') && /Type your pay to see it/.test(await txt(p, '#tables')));
        ok(W + 'optional parts are hidden behind + buttons (name, holidays, overtime)', !(await p.isVisible('#j0-name')) && !(await p.isVisible('#j0-paid')) && !(await p.isVisible('#j0-ot')) && await p.locator('.job .link').count() === 3);
        ok(W + 'nothing to compare with one job', await p.isHidden('#compare'));
        ok(W + 'every input and select has a visible label', await p.evaluate(() => [...document.querySelectorAll('main input:not([type=hidden]), main select')].every(e => e.labels && e.labels.length && e.labels[0].textContent.trim())));

        // ---- the simplest question: 20 an hour, 40 hours
        await p.fill('#j0-pay', '20');
        ok(W + '20 an hour x 40 h: year 41,600.00, month 3,466.67, week 800.00, day (8 hours) 160.00',
            await rowVal(p, 0, 'Per year') === '41,600.00' && await rowVal(p, 0, 'Per month') === '3,466.67' && await rowVal(p, 0, 'Per week') === '800.00' && await rowVal(p, 0, 'Per day (8 hours)') === '160.00');
        ok(W + 'intro goes away once pay is typed', await p.isHidden('#intro'));
        // keyboard: hours preset buttons and typing
        await p.click('.chip[data-v="37.5"]');
        ok(W + 'hours button 37.5 fills the box and recalculates (39,000.00)', await p.inputValue('#j0-hours') === '37.5' && await rowVal(p, 0, 'Per year') === '39,000.00' && await p.getAttribute('.chip[data-v="37.5"]', 'aria-pressed') === 'true');
        await p.focus('#j0-hours'); await p.keyboard.press('Control+A'); await p.keyboard.type('40');
        ok(W + 'typing hours with the keyboard works', await rowVal(p, 0, 'Per year') === '41,600.00');

        // ---- salary to hourly, pasted with a symbol
        await p.selectOption('#j0-per', 'year'); await p.fill('#j0-pay', '$ 45,000.00');
        ok(W + 'pasted "$ 45,000.00" a year: hour 21.63, every 2 weeks 1,730.77, month 3,750.00', await rowVal(p, 0, 'Per hour') === '21.63' && await rowVal(p, 0, 'Every 2 weeks') === '1,730.77' && await rowVal(p, 0, 'Per month') === '3,750.00');

        // ---- odd inputs
        await p.fill('#j0-pay', '-20');
        ok(W + 'negative pay: message under the box, red border, result asks to fix it', /negative/.test(await txt(p, '#j0-pay-err')) && await p.getAttribute('#j0-pay', 'aria-invalid') === 'true' && /Check the box marked in red/.test(await txt(p, '#tables')));
        await p.fill('#j0-pay', 'abc');
        ok(W + 'words for pay are refused', /as a number/.test(await txt(p, '#j0-pay-err')));
        await p.fill('#j0-pay', '');
        ok(W + 'blank pay: no red message, just waiting', await p.locator('#j0-pay-err').innerText() === '' && /Type your pay/.test(await txt(p, '#tables')));
        await p.fill('#j0-pay', '0');
        ok(W + 'zero pay: all zeros', await rowVal(p, 0, 'Per year') === '0.00');
        await p.fill('#j0-pay', '100000000'); await p.fill('#j0-hours', '1');
        ok(W + 'huge pay 100,000,000 a year at 1 hour a week stays exact and fits', await rowVal(p, 0, 'Per hour') === '1,923,076.92' && (await layout(p)).length === 0);
        await p.fill('#j0-pay', '100000001');
        ok(W + 'more than 100,000,000 is refused', /100,000,000/.test(await txt(p, '#j0-pay-err')));
        await p.fill('#j0-pay', '45000'); await p.fill('#j0-hours', '0');
        ok(W + '0 hours is refused', /at least/.test(await txt(p, '#j0-hours-err')));
        await p.fill('#j0-hours', '200');
        ok(W + '200 hours is refused', /168/.test(await txt(p, '#j0-hours-err')));
        await p.fill('#j0-hours', '37,5');
        ok(W + '37,5 (comma) hours works: hour 23.08', await rowVal(p, 0, 'Per hour') === '23.08');
        await p.fill('#j0-hours', '40');

        // ---- holidays and days off
        await p.click('.link:has-text("holidays")');
        ok(W + 'holidays part opens and focuses Paid holiday days', await p.isVisible('#j0-paid') && await p.evaluate(() => document.activeElement.id) === 'j0-paid');
        await p.selectOption('#j0-per', 'hour'); await p.fill('#j0-pay', '20'); await p.fill('#j0-unpaid', '10');
        ok(W + '10 unpaid days: 41,600 minus 1,600 = 40,000.00 a year, week stays 800.00', await rowVal(p, 0, 'Per year') === '40,000.00' && await rowVal(p, 0, 'Per week') === '800.00' && /41,600.00 for a full 52 weeks, minus 1,600.00 for 10 unpaid days off/.test(await txt(p, '#tables')));
        await p.fill('#j0-unpaid', '1.25');
        ok(W + 'quarter days refused', /half days/.test(await txt(p, '#j0-unpaid-err')));
        await p.fill('#j0-unpaid', '300');
        ok(W + 'more days off than the year refused', /more than the 260 working days/.test(await txt(p, '#j0-unpaid-err')));
        await p.fill('#j0-unpaid', ''); await p.fill('#j0-paid', '10');
        ok(W + '10 paid holiday days: year stays 41,600.00, per hour actually worked 20.80', await rowVal(p, 0, 'Per year') === '41,600.00' && /Per hour you actually work: 20.80/.test(await txt(p, '#tables')));

        // ---- overtime
        await p.click('.link:has-text("overtime")');
        await p.fill('#j0-ot', '5');
        ok(W + 'overtime 5 h at 1.5x with 10 paid days: week 950.00, year 49,100.00', await rowVal(p, 0, 'Per week') === '950.00' && await rowVal(p, 0, 'Per year') === '49,100.00' && /Includes overtime: 7,500.00 a year/.test(await txt(p, '#tables')));
        await p.selectOption('#j0-mult', 'other');
        ok(W + 'Other rate shows its own box and focuses it', await p.isVisible('#j0-mult-other') && await p.evaluate(() => document.activeElement.id) === 'j0-mult-other');
        await p.fill('#j0-mult-other', '6');
        ok(W + 'rate 6x refused under the Other box', /between 1 and 5/.test(await txt(p, '#j0-mult-other-err')) && await p.locator('#j0-mult-err').innerText() === '');
        await p.fill('#j0-mult-other', '2');
        ok(W + 'custom rate 2x: week 1,000.00', await rowVal(p, 0, 'Per week') === '1,000.00');
        await p.fill('#j0-ot', '130');
        ok(W + 'overtime past 168 hours refused', /168/.test(await txt(p, '#j0-ot-err')));
        await p.fill('#j0-ot', '');
        ok(W + 'clearing overtime hours removes overtime', await rowVal(p, 0, 'Per week') === '800.00');

        // ---- the real situation: compare two offers (the README example). The example button only shows on an empty page.
        ok(W + 'example button hidden once something is typed (it never replaces your own numbers)', await p.isHidden('#demo'));
        await p.click('#clear'); await p.click('#demo');
        const cmp = await txt(p, '#compare');
        ok(W + 'example: Office job pays the most, 43,000.00 a year', /Office job pays the most: 43,000.00 a year/.test(cmp));
        ok(W + 'example: 2,500.00 more a year, 208.33 more a month', /Office job pays 2,500.00 more a year than Agency job \(208.33 more a month\)/.test(cmp));
        ok(W + 'example: but per hour actually worked Agency job pays more, 22.50 against 21.05, 243 more hours', /per hour you actually work, Agency job pays more: 22.50 against 21.05 at Office job\. At Office job you work 243 more hours a year \(2,043 against 1,800\)/.test(cmp));
        ok(W + 'example: agency job 40,500.00 a year, 3,375.00 a month', await rowVal(p, 0, 'Per year') === '40,500.00' && await rowVal(p, 0, 'Per month') === '3,375.00');
        ok(W + 'example: office job hour 18.38, week 826.92, 2 weeks 1,653.85, month 3,583.33', await rowVal(p, 1, 'Per hour') === '18.38' && await rowVal(p, 1, 'Per week') === '826.92' && await rowVal(p, 1, 'Every 2 weeks') === '1,653.85' && await rowVal(p, 1, 'Per month') === '3,583.33');
        ok(W + 'each job has its own box in its own colour, results use the same colour', await p.locator('.job.c0').count() === 1 && await p.locator('.job.c1').count() === 1 && await p.locator('.res-job.c1').count() === 1 && await p.evaluate(() => getComputedStyle(document.querySelector('.job.c1')).borderTopColor === getComputedStyle(document.querySelector('.res-job.c1')).borderLeftColor));
        ok(W + 'job names show in the box headings', (await p.locator('.job h2').allInnerTexts()).join('|') === 'Agency job|Office job');
        // undo the example
        await p.click('#undo');
        ok(W + 'Undo after the example goes back to the empty page', await p.locator('.job').count() === 1 && await p.inputValue('#j0-pay') === '' && await p.isVisible('#demo'));
        await p.click('#demo');

        // ---- edit a mistake
        await p.fill('#j0-pay', '25');
        ok(W + 'editing the agency pay to 25 changes the winner', /Agency job pays the most: 45,000.00 a year/.test(await txt(p, '#compare')));
        await p.fill('#j0-pay', '22.50');
        // ---- rename
        await p.fill('#j1-name', 'A very long employer name that goes on and on');
        ok(W + 'long name is cut at 40 letters and wraps without overflow', (await p.inputValue('#j1-name')).length === 40 && (await layout(p)).length === 0);
        await p.fill('#j1-name', '');
        ok(W + 'blank name falls back to "Job 2"', await txt(p, '#j1-title') === 'Job 2' && /Job 2 pays the most/.test(await txt(p, '#compare')));
        await p.fill('#j1-name', 'Office job');

        // ---- currency
        await p.selectOption('#cur', '$');
        ok(W + 'currency $ shows on amounts and in the pay box', /\$43,000.00/.test(await txt(p, '#compare')) && await txt(p, '#jobs .sym') === '$');

        // ---- copy and email
        await p.click('#copy');
        const clip = await p.evaluate(() => navigator.clipboard.readText()).catch(() => '');
        ok(W + 'Copy results copies the comparison and both tables', /Office job pays the most: \$43,000.00/.test(clip) && /Agency job: \$22.50 an hour/.test(clip) && /Per year: \$40,500.00/.test(clip) && /Copied/.test(await txt(p, '#msg')));
        const mail = await p.getAttribute('#mail', 'href');
        ok(W + 'Email results is a mailto with no address, a subject and the summary', mail.startsWith('mailto:?subject=') && decodeURIComponent(mail).includes('Per hour you actually work'));

        // ---- reload: saved state
        const state = await p.context().storageState();
        await p.context().close();
        p = await load(b, vp, { state });
        ok(W + 'reload keeps both jobs, names, holidays and the currency', await p.locator('.job').count() === 2 && await p.inputValue('#j1-name') === 'Office job' && await p.inputValue('#j1-paid') === '33' && await p.inputValue('#cur') === '$' && await p.isVisible('#j1-paid'));
        ok(W + 'reload shows the same answer', /\$2,500.00 more a year/.test(await txt(p, '#compare')));

        // ---- add up to 4 jobs, remove with undo
        await p.click('#add-job');
        ok(W + 'new job copies the last hours and days, and focuses its pay', await p.inputValue('#j2-hours') === '45' && await p.evaluate(() => document.activeElement.id) === 'j2-pay');
        ok(W + 'an unfinished third job waits and the other two still compare', /Type the pay for Job 3/.test(await txt(p, '#tables')) && /Office job pays the most/.test(await txt(p, '#compare')));
        await p.click('#add-job');
        ok(W + 'at 4 jobs the add button hides', await p.locator('.job').count() === 4 && await p.isHidden('#add-job'));
        await p.fill('#j2-pay', '43000'); await p.selectOption('#j2-per', 'year'); await p.fill('#j3-pay', '22.50');
        const c4 = await txt(p, '#compare');
        ok(W + '4 jobs: Job 4 (22.50 x 45 h) pays the most, 52,650.00; 9,650.00 more than Office job and Job 3; 12,150.00 more than Agency job', /Job 4 pays the most: \$52,650.00 a year/.test(c4) && /\$9,650.00 more a year than Office job/.test(c4) && /\$9,650.00 more a year than Job 3/.test(c4) && /\$12,150.00 more a year than Agency job/.test(c4) && (await layout(p)).length === 0);
        await p.click('#jobs .job:nth-child(1) .remove');
        ok(W + 'Remove takes the job out and offers Undo', await p.locator('.job').count() === 3 && /Removed Agency job/.test(await txt(p, '#msg')));
        await p.click('#undo');
        ok(W + 'Undo puts it back in its place', await p.locator('.job').count() === 4 && await txt(p, '#j0-title') === 'Agency job');
        // tie between two
        await p.click('#jobs .job:nth-child(4) .remove'); await p.click('#jobs .job:nth-child(3) .remove');
        ok(W + 'remove buttons disappear with one job left? (two left, still shown)', await p.locator('.job .remove').count() === 2);

        // ---- start over with undo
        await p.click('#clear');
        ok(W + 'Start over: one blank job, intro back, focus on pay', await p.locator('.job').count() === 1 && await p.inputValue('#j0-pay') === '' && await p.isVisible('#intro') && await p.evaluate(() => document.activeElement.id) === 'j0-pay' && await p.locator('.job .remove').count() === 0);
        await p.click('#undo');
        ok(W + 'Undo after Start over brings everything back', await p.locator('.job').count() === 2);
        ok(W + 'no console errors and no failed requests', !p.errors.length && !p.bad.length);
        if (p.errors.length || p.bad.length) console.log(p.errors, p.bad);
        await p.context().close();
    }

    // ---- corrupt, tampered and blocked storage
    for (const [name, val] of [['corrupt JSON', '{bad'], ['wrong types', JSON.stringify({ jobs: 'x', cur: 5 })],
        ['tampered values', JSON.stringify({ jobs: Array(9).fill({ pay: 5, per: 'fortnight', days: 99, hours: 7, name: '<b>x</b>'.repeat(20), mult: {} }), cur: '<script>' })]]) {
        const p = await load(b, PHONE, { init: `try{localStorage.setItem('${SLUG}.state', ${JSON.stringify(val)})}catch(e){}` });
        const n = await p.locator('.job').count();
        ok('saved state ' + name + ': page works and starts clean (' + n + ' job(s))', !p.errors.length && n >= 1 && n <= 4 && await p.inputValue('#cur') === '' && await p.evaluate(() => !document.querySelector('main b x')));
        if (name === 'tampered values') ok('tampered values: per falls back to hour, days to 5, name shown as plain text', await p.inputValue('#j0-per') === 'hour' && await p.inputValue('#j0-days') === '5' && (await p.inputValue('#j0-name')).startsWith('<b>x</b>'));
        await p.context().close();
    }
    {
        const p = await load(b, PHONE, { init: 'Object.defineProperty(window, "localStorage", { get() { throw new Error("blocked"); } })' });
        await p.fill('#j0-pay', '20');
        ok('storage blocked: the app still works', !p.errors.length && await rowVal(p, 0, 'Per year') === '41,600.00');
        await p.context().close();
    }

    // ---- layout at every width, dark and light, filled and cleared
    const WIDTHS = [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920];
    for (const theme of ['dark', 'light']) {
        const p = await load(b, { width: 390, height: 800 }, { theme });
        await fullState(p);
        for (const w of WIDTHS) {
            await p.setViewportSize({ width: w, height: 900 });
            for (const pos of [0, .5, 1]) {
                await p.evaluate(x => window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * x), pos);
                const l = await layout(p);
                if (l.length) { ok(`[${theme} ${w}px scroll ${pos * 100}%] filled layout`, false); console.log('   ', l); }
            }
        }
        await p.click('#clear');
        for (const w of WIDTHS) { await p.setViewportSize({ width: w, height: 900 }); const l = await layout(p); if (l.length) { ok(`[${theme} ${w}px] cleared layout`, false); console.log('   ', l); } }
        ok(`[${theme}] layout at 11 widths, filled (4 jobs, every optional part open) and cleared: no sideways scroll, nothing sticks out, nothing overlaps`, true);
        // desktop: inputs and results side by side
        await p.setViewportSize({ width: 1280, height: 900 }); await p.click('#undo');
        const side = await p.evaluate(() => { const a = document.querySelector('.col-main').getBoundingClientRect(), r = document.querySelector('.col-side').getBoundingClientRect(); return a.right <= r.left && Math.abs(a.top - r.top) < 2 && document.querySelector('.app').getBoundingClientRect().width > 1000; });
        ok(`[${theme} 1280] desktop puts jobs and results side by side, over 1000px wide`, side);
        await p.setViewportSize({ width: 390, height: 900 });
        ok(`[${theme} 390] phone keeps one column`, await p.evaluate(() => document.querySelector('.col-side').getBoundingClientRect().top > document.querySelector('.col-main').getBoundingClientRect().bottom - 1));
        // light/dark switch
        const before = await p.evaluate(() => getComputedStyle(document.body).color);
        await p.click('.theme-toggle');
        ok(`[${theme}] light/dark switch changes the colours`, before !== await p.evaluate(() => getComputedStyle(document.body).color));
        ok(`[${theme}] no console errors`, !p.errors.length);
        await p.context().close();
    }

    // ---- help at 4 widths
    for (const w of [320, 390, 820, 1280]) {
        const p = await load(b, { width: w, height: 800 });
        await p.click('.help-btn');
        const box = await p.locator('dialog.help').boundingBox();
        const top = await p.evaluate(() => { const r = [...document.querySelectorAll('.topbar > *')].map(e => e.getBoundingClientRect()); return r.every(x => Math.abs(x.top - r[0].top) < 4); });
        ok(`[${w}] Help opens fully on screen with its title; top bar on one line`, box.x >= 0 && box.y >= 0 && box.x + box.width <= w && box.y + box.height <= 800 && /How to use Hourly to Salary Converter/.test(await txt(p, 'dialog.help h2')) && top);
        await p.keyboard.press('Escape');
        const closed1 = !(await p.evaluate(() => document.querySelector('dialog.help').open));
        await p.click('.help-btn'); await p.click('.help-close');
        ok(`[${w}] Escape and "Got it" close Help`, closed1 && !(await p.evaluate(() => document.querySelector('dialog.help').open)));
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
        await p.fill('#j0-pay', '20').catch(() => {});
        ok('works offline after the first visit', await rowVal(p, 0, 'Per year').catch(() => null) === '41,600.00');
        await ctx.close();
    }

    // ---- every file the page uses answers 200
    {
        const p = await load(b, PHONE);
        const files = ['favicon.svg', 'manifest.webmanifest', 'sw.js', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', '../help.js', '../theme.js', 'core.js', 'script.js', 'style.css', 'screenshots/desktop.png', 'screenshots/phone.png'];
        const codes = await p.evaluate(fs => Promise.all(fs.map(f => fetch(f, { cache: 'no-store' }).then(r => r.status))), files);
        ok('all files return 200: ' + files.map((f, i) => f + ' ' + codes[i]).filter((x, i) => codes[i] !== 200).join(', '), codes.every(c => c === 200));
        await p.context().close();
    }

    // ---- screenshots of the real situation
    if (shots) {
        let p = await load(b, { width: 1280, height: 1240 });
        await p.click('#demo'); await p.evaluate(() => { document.getElementById('msg').textContent = ''; });
        await p.screenshot({ path: path.join(__dirname, 'screenshots/desktop.png') });
        await p.context().close();
        p = await load(b, { width: 390, height: 844 });
        await p.fill('#j0-pay', '22.50'); await p.click('.chip[data-v="37.5"]');
        const h = await p.evaluate(() => Math.ceil(document.querySelector('.col-side .result').getBoundingClientRect().bottom + scrollY + 16));
        await p.screenshot({ path: path.join(__dirname, 'screenshots/phone.png'), clip: { x: 0, y: 0, width: 390, height: h }, fullPage: true });
        await p.context().close();
        console.log('screenshots saved');
    }
    await b.close(); if (srv) srv.close();
    console.log(fail ? '\n' + fail + ' FAILED' : '\nALL UI CHECKS PASSED (' + (LIVE ? 'live' : 'local') + ')');
    process.exit(fail ? 1 : 0);
})();
