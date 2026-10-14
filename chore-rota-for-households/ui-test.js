// Full page test with Playwright. Run from this folder: node ui-test.js   (or BASE=https://umar8092.github.io/apps node ui-test.js for the live site)
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), SLUG = 'chore-rota-for-households', KEY = SLUG + '.state';
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; if (!cond) console.log('FAIL ' + name + (extra ? '  ' + extra : '')); };

function serve() {
    const types = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml', png: 'image/png', webmanifest: 'application/manifest+json' };
    return new Promise(res => { const s = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0].replace(/^\/apps/, '')); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': types[f.split('.').pop()] || 'application/octet-stream' }); r.end(fs.readFileSync(f)); }).listen(0, () => res(s)); });
}

(async () => {
    let srv, base = process.env.BASE;
    if (!base) { srv = await serve(); base = 'http://localhost:' + srv.address().port + '/apps'; }
    const URL = base + '/' + SLUG + '/';
    const browser = await chromium.launch();
    const errors = [], failed = [];
    async function newPage(opts) {
        const ctx = await browser.newContext(Object.assign({ viewport: { width: 390, height: 844 }, acceptDownloads: true }, opts || {}));
        await ctx.route(/goatcounter\.com|gc\.zgo\.at/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
        const page = await ctx.newPage();
        page.on('pageerror', e => errors.push(e.message));
        page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
        page.on('response', r => { if (r.status() >= 400 && r.url().startsWith(base)) failed.push(r.status() + ' ' + r.url()); });
        await page.goto(URL, { waitUntil: 'networkidle' });
        return { ctx, page };
    }
    const txt = (page, sel) => page.locator(sel).innerText();
    const boxes = page => page.locator('#who-list > li');
    const jobsOf = async (page, name) => { const b = page.locator('#who-list > li', { has: page.locator('h3', { hasText: new RegExp('^' + name + '$') }) }); return b.locator('.j-name').allInnerTexts(); };

    // ---------- first use ----------
    let { ctx, page } = await newPage();
    ok('first use: two steps shown', await page.locator('#start-here').isVisible());
    ok('first use: people card comes before the week on a phone', (await page.locator('#people').boundingBox()).y < (await page.locator('#week').boundingBox()).y);
    ok('first use: no share buttons yet', !(await page.locator('#copy').isVisible()));
    ok('first use: no coming weeks yet', !(await page.locator('#coming').isVisible()));

    // ---------- people ----------
    await page.click('#p-add');
    ok('blank name refused', (await txt(page, '#p-name-err')).includes('Type a name'));
    await page.fill('#p-name', 'Ali, Sam, Zoe and Hira'); await page.press('#p-name', 'Enter');
    ok('4 people added with Enter', await page.locator('#people-list > li').count() === 4);
    ok('input cleared after adding', await page.inputValue('#p-name') === '');
    await page.fill('#p-name', 'ali'); await page.click('#p-add');
    ok('duplicate name refused', (await txt(page, '#p-name-err')).includes('already someone called ali'));
    ok('still 4 people', await page.locator('#people-list > li').count() === 4);
    ok('step 1 ticked, week not ready yet', await page.locator('#step-people.ok').count() === 1 && await page.locator('#start-here').isVisible());

    // ---------- chores ----------
    await page.click('#examples');
    ok('8 example chores', await page.locator('#chore-list > li').count() === 8);
    ok('examples can be undone', await page.locator('#chores-msg .undo').isVisible());
    ok('rota ready: summary', (await txt(page, '#week-sum')) === '4 people share 8 jobs · 0 done.', await txt(page, '#week-sum'));
    ok('rota ready: week now first on the phone', (await page.locator('#week').boundingBox()).y < (await page.locator('#people').boundingBox()).y);
    ok('4 person boxes', await boxes(page).count() === 4);
    const all = (await page.locator('#who-list .j-name').allInnerTexts()).sort();
    ok('all 8 chores given out once', all.length === 8 && new Set(all).size === 8);
    ok('heavy job first in a box', (await jobsOf(page, 'Ali'))[0] === 'Clean the bathroom', JSON.stringify(await jobsOf(page, 'Ali')));
    ok('effort and how often shown', (await page.locator('#who-list .j-meta').first().innerText()).includes('Heavy · every week'));
    ok('coming weeks shows 4 weeks', await page.locator('#coming-list > li').count() === 4);
    ok('coming week title', (await page.locator('.cw-h').first().innerText()).startsWith('Next week: Mon 19 Oct'));
    ok('coming week 2 says In 2 weeks', (await page.locator('.cw-h').nth(1).innerText()).startsWith('In 2 weeks'));

    // add chore: errors and the optional part
    await page.click('#c-open');
    ok('who-can-do-it is optional and hidden', !(await page.locator('#c-only').isVisible()) && await page.locator('#c-only-open').isVisible());
    await page.click('#c-save');
    ok('blank chore refused', (await txt(page, '#c-name-err')).includes('Type the chore'));
    await page.fill('#c-name', 'clean the KITCHEN'); await page.click('#c-save');
    ok('duplicate chore refused', (await txt(page, '#c-name-err')).includes('already a chore'));
    await page.fill('#c-name', 'Clean the oven'); await page.selectOption('#c-every', 'c');
    ok('custom weeks box shown', await page.locator('#c-weeks').isVisible());
    for (const bad of ['0', '13', 'ab', '']) { await page.fill('#c-weeks', bad); await page.click('#c-save'); ok('custom weeks "' + bad + '" refused', (await txt(page, '#c-weeks-err')).includes('1 to 12')); }
    await page.fill('#c-weeks', '6');
    await page.click('#c-effort .chip[data-e="3"]');
    await page.click('#c-only-open');
    ok('who-can-do-it lists the 4 people, all ticked', await page.locator('#c-only-list input:checked').count() === 4);
    for (const n of ['Ali', 'Sam', 'Zoe', 'Hira']) await page.locator('#c-only-list label', { hasText: n }).locator('input').uncheck();
    await page.click('#c-save');
    ok('nobody ticked refused', (await txt(page, '#c-only-err')).includes('at least one'));
    await page.locator('#c-only-list label', { hasText: 'Ali' }).locator('input').check();
    await page.locator('#c-only-list label', { hasText: 'Sam' }).locator('input').check();
    await page.click('#c-save');
    const oven = page.locator('#chore-list > li', { hasText: 'Clean the oven' });
    ok('custom chore saved with its settings', (await oven.innerText()).includes('Every 6 weeks · only Ali and Sam') && (await oven.innerText()).includes('Heavy · 3 points'), await oven.innerText());
    const ovenOwner = await page.locator('#who-list > li', { has: page.locator('.j-name', { hasText: 'Clean the oven' }) }).locator('h3').innerText();
    ok('oven goes to Ali or Sam only', ['Ali', 'Sam'].includes(ovenOwner), ovenOwner);
    // edit
    await oven.locator('button', { hasText: 'Edit' }).click();
    ok('edit form filled', await page.inputValue('#c-name') === 'Clean the oven' && await page.inputValue('#c-weeks') === '6' && await page.locator('#c-only').isVisible());
    await page.click('#c-effort .chip[data-e="2"]'); await page.click('#c-save');
    ok('edit saved', (await oven.innerText()).includes('Medium · 2 points'));
    // remove chore and undo
    await oven.locator('button', { hasText: 'Remove' }).click();
    ok('chore removed', await page.locator('#chore-list > li', { hasText: 'Clean the oven' }).count() === 0);
    await page.click('#chores-msg .undo');
    ok('chore back with Undo', await page.locator('#chore-list > li', { hasText: 'Clean the oven' }).count() === 1);
    await page.locator('#chore-list > li', { hasText: 'Clean the oven' }).locator('button', { hasText: 'Remove' }).click();

    // ---------- this week: tick, away, swap ----------
    await page.locator('#who-list .check').first().click();
    ok('tick: 1 done', (await txt(page, '#week-sum')).includes('1 done'));
    ok('tick: line through', await page.locator('#who-list .job.done').count() === 1);
    const hiraJobs = await jobsOf(page, 'Hira');
    await page.locator('#who-list > li', { hasText: 'Hira' }).locator('.away-btn').click();
    ok('away: Hira has no jobs', (await jobsOf(page, 'Hira')).length === 0);
    ok('away: her jobs went to others', (await page.locator('#who-list .j-name').count()) === 8);
    ok('away: message', (await txt(page, '#week-msg')).includes('Hira is away'));
    ok('away: summary counts 3 people', (await txt(page, '#week-sum')).startsWith('3 people share 8 jobs'));
    await page.locator('#who-list > li', { hasText: 'Hira' }).locator('.away-btn').click();
    ok('home again: same jobs back', JSON.stringify(await jobsOf(page, 'Hira')) === JSON.stringify(hiraJobs));
    // swap
    const zoeBox = page.locator('#who-list > li', { has: page.locator('h3', { hasText: /^Zoe$/ }) });
    const zoeFirst = await zoeBox.locator('.j-name').first().innerText();
    await zoeBox.locator('.change-btn').first().click();
    const sel = page.locator('.change-wrap select');
    ok('change list: only people at home', (await sel.locator('option').allInnerTexts()).join(',') === 'Ali,Sam,Zoe,Hira');
    await sel.selectOption({ label: 'Sam' });
    ok('swap: Sam has Zoe\'s job', (await jobsOf(page, 'Sam')).includes(zoeFirst));
    ok('swap: marked', (await page.locator('#who-list .sw').first().innerText()).includes('rota said Zoe'));
    await page.locator('#who-list .job', { hasText: zoeFirst }).locator('.change-btn').click();
    await page.locator('.change-wrap .link', { hasText: 'Back to the rota (Zoe)' }).click();
    ok('back to the rota', (await jobsOf(page, 'Zoe')).includes(zoeFirst) && await page.locator('#who-list .sw').count() === 0);

    // ---------- other weeks ----------
    await page.click('#next');
    ok('next week title', (await txt(page, '#week-h')) === 'Next week');
    ok('future: ticks disabled', await page.locator('#who-list input[type=checkbox]:not(:disabled)').count() === 0);
    ok('future: summary has no done count', !(await txt(page, '#week-sum')).includes('done'));
    ok('future: away button says that week', (await page.locator('.away-btn').first().innerText()) === 'Mark away');
    ok('Back to this week shown', await page.locator('#this-week').isVisible());
    await page.click('#this-week');
    ok('back to this week', (await txt(page, '#week-h')) === 'This week');
    ok('Before disabled at the start of the rota', await page.locator('#prev').isDisabled());
    await page.locator('.coming-week').nth(2).click();
    ok('coming week opens', (await txt(page, '#week-h')).startsWith('Week of'));
    await page.click('#this-week');

    // ---------- people: rename, remove, undo ----------
    const zoeP = page.locator('#people-list > li', { hasText: 'Zoe' });
    await zoeP.locator('button', { hasText: 'Rename' }).click();
    await page.fill('#rn-input', 'sam'); await page.press('#rn-input', 'Enter');
    ok('rename to an existing name refused', (await txt(page, '#rn-err')).includes('already someone'));
    await page.fill('#rn-input', 'Zoe K'); await page.press('#rn-input', 'Enter');
    ok('renamed in the week too', await page.locator('#who-list h3', { hasText: 'Zoe K' }).count() === 1);
    ok('stats line', (await page.locator('#people-list .box-sub').first().innerText()).startsWith('So far, with this week:'));
    await page.locator('#people-list > li', { hasText: 'Hira' }).locator('button', { hasText: 'Remove' }).click();
    ok('person removed', await boxes(page).count() === 3);
    await page.click('#people-msg .undo');
    ok('person back with Undo', await boxes(page).count() === 4);
    await page.fill('#p-name', 'B'.repeat(200)); await page.click('#p-add');
    ok('very long name cut to 30', (await page.locator('#people-list h3').last().innerText()).length === 30);
    await page.locator('#people-list > li').last().locator('button', { hasText: 'Remove' }).click();

    // ---------- copy, email, print ----------
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new globalThis.URL(URL).origin });
    await page.click('#copy');
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    ok('copied text', clip.startsWith('Chore rota, ') && clip.includes('Ali: ') && clip.includes('(done)'), clip);
    ok('copy message', (await txt(page, '#week-msg')).includes('Copied'));
    const href = await page.getAttribute('#email', 'href');
    ok('email works with no address', href.startsWith('mailto:?subject=Chore%20rota') && decodeURIComponent(href).includes('Hira: '));
    await page.evaluate(() => { window.print = () => { window.__printed = true; }; });
    await page.click('#print');
    ok('print: 4 weeks built', await page.locator('#print-area .pw').count() === 4 && await page.evaluate(() => window.__printed));
    ok('print: a tick box for every job (8 + 7 + 7 + 7, the fridge is every 4 weeks)', await page.locator('#print-area .tick').count() === 29 && await page.locator('#print-area .job').count() === 29);

    // ---------- saved state ----------
    await page.reload({ waitUntil: 'networkidle' });
    ok('reload keeps people, chores and ticks', await boxes(page).count() === 4 && (await txt(page, '#week-sum')).includes('1 done') && await page.locator('#who-list h3', { hasText: 'Zoe K' }).count() === 1);

    // backup and restore
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#backup')]);
    const file = path.join(require('os').tmpdir(), 'chore-backup-test.json'); await dl.saveAs(file);
    ok('backup file name', /^chore-rota-\d{4}-\d{2}-\d{2}\.json$/.test(dl.suggestedFilename()));
    await page.click('#wipe');
    ok('delete everything', await page.locator('#start-here').isVisible() && await page.locator('#people-list > li').count() === 0);
    await page.click('#set-msg .undo');
    ok('delete everything undone', await boxes(page).count() === 4);
    await page.click('#wipe');
    await page.setInputFiles('#restore-file', file);
    await page.waitForTimeout(300);
    ok('restore backup', (await txt(page, '#set-msg')).includes('4 people and 8 chores') && await boxes(page).count() === 4, await txt(page, '#set-msg'));
    const badFile = path.join(require('os').tmpdir(), 'chore-bad.json'); fs.writeFileSync(badFile, '{"hello":1}');
    await page.setInputFiles('#restore-file', badFile); await page.waitForTimeout(300);
    ok('bad backup refused', (await txt(page, '#set-msg')).includes('not a backup') && await boxes(page).count() === 4);

    // week start change and restart
    await page.selectOption('#wstart', '0');
    ok('Sunday week', (await txt(page, '#week-range')).startsWith('Sun 11 Oct') && (await txt(page, '#set-msg')).includes('Sunday'));
    await page.click('#set-msg .undo');
    ok('week start undone', (await txt(page, '#week-range')).startsWith('Mon 12 Oct') && await page.inputValue('#wstart') === '1');
    ok('the week start list starts on Monday', (await page.locator('#wstart option').first().innerText()) === 'Monday');
    await ctx.close();

    // ---------- last week not ticked, and all done ----------
    ({ ctx, page } = await newPage());
    await page.evaluate(k => {
        const s = { v: 1, weekStart: 1, start: '2026-09-28', nextId: 5, frozen: {}, overrides: {}, done: {},
            people: [{ id: 1, name: 'Ali', from: '2026-09-28', away: [] }, { id: 2, name: 'Sam', from: '2026-09-28', away: [] }],
            chores: [{ id: 3, name: 'Kitchen', every: 1, effort: 2, from: '2026-09-28' }, { id: 4, name: 'Bins', every: 1, effort: 1, from: '2026-09-28' }] };
        const now = new Date(), d = new Date(now.getFullYear(), now.getMonth(), now.getDate()); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - 7);
        const lw = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        s.start = lw; s.people.forEach(p => { p.from = lw; }); s.chores.forEach(c => { c.from = lw; });
        s.done[lw] = { 3: true };
        localStorage.setItem(k, JSON.stringify(s));
    }, KEY);
    await page.reload({ waitUntil: 'networkidle' });
    ok('note about last week', (await txt(page, '#last-note')).startsWith('Not ticked last week: Bins ('), await txt(page, '#last-note'));
    for (const c of await page.locator('#who-list input[type=checkbox]').all()) await c.check();
    ok('all done message', (await txt(page, '#week-sum')).startsWith('All 2 jobs done'));
    await page.click('#prev');
    ok('last week opens', (await txt(page, '#week-h')) === 'Last week' && await page.locator('#who-list input:not(:disabled)').count() === 2);

    // everyone away this week
    await page.click('#this-week');
    for (const b of await page.locator('.away-btn').all()) await b.click();
    ok('everyone away: nobody box', await page.locator('#nobody').isVisible() && (await txt(page, '#week-sum')).startsWith('Everyone is away'));
    await ctx.close();

    // corrupt saved state
    ({ ctx, page } = await newPage());
    await page.evaluate(k => localStorage.setItem(k, '{broken'), KEY);
    await page.reload({ waitUntil: 'networkidle' });
    ok('corrupt state: starts fresh with a message', await page.locator('#start-here').isVisible() && (await txt(page, '#set-msg')).includes('could not be read'));
    await page.evaluate(k => localStorage.setItem(k, JSON.stringify({ people: [{ id: 1, name: '<img src=x onerror=alert(1)>' }], chores: [{ id: 2, name: 'Kitchen' }] })), KEY);
    await page.reload({ waitUntil: 'networkidle' });
    ok('names shown as text, never HTML', await page.locator('#who-list img').count() === 0 && (await page.locator('#who-list h3').first().innerText()).startsWith('<img'));
    await ctx.close();

    // ---------- filled-in layout at every width, dark and light ----------
    const WIDTHS = [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920];
    for (const scheme of ['dark', 'light']) {
        ({ ctx, page } = await newPage({ colorScheme: scheme }));
        await page.fill('#p-name', 'Ali, Sam, Zoe, Hira'); await page.click('#p-add'); await page.click('#examples');
        await page.locator('#who-list .check').first().click();
        for (const w of WIDTHS) {
            await page.setViewportSize({ width: w, height: 900 });
            for (const state of ['plain', 'open']) {
                if (state === 'open') {
                    if (!(await page.locator('#c-form').isVisible())) await page.click('#c-open');
                    if (await page.locator('#c-only-open').isVisible()) await page.click('#c-only-open');
                    await page.selectOption('#c-every', 'c');
                    if (!(await page.locator('.change-wrap').count())) await page.locator('#who-list .change-btn').first().click();
                    if (!(await page.locator('#rn-input').count())) await page.locator('#people-list button', { hasText: 'Rename' }).first().click();
                }
                const tag = scheme + ' ' + w + ' ' + state;
                ok(tag + ': no horizontal scroll', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
                for (const pos of [0, 0.5, 1]) {
                    await page.evaluate(p => scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * p), pos);
                    const o = await page.evaluate(() => { const bad = []; document.querySelectorAll('main, .app, .col-main, .col-side').forEach(h => { const k = [...h.children].filter(c => { const r = c.getBoundingClientRect(); return r.width > 4 && r.height > 4 && getComputedStyle(c).display !== 'none'; }); for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { const a = k[i].getBoundingClientRect(), b = k[j].getBoundingClientRect(); if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 4 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 4) bad.push(k[i].className + '/' + k[j].className); } }); return bad; });
                    ok(tag + ' scroll ' + pos + ': no overlapping blocks', !o.length, o.join(';'));
                }
                if (w <= 390) {
                    const c = await page.evaluate(() => { const k = [...document.querySelectorAll('main input:not([type=checkbox]), main select, main button')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }); const bad = []; for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { const a = k[i].getBoundingClientRect(), b = k[j].getBoundingClientRect(); if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 3 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 3) bad.push((k[i].id || k[i].className) + '/' + (k[j].id || k[j].className)); } return bad; });
                    ok(tag + ': controls do not overlap', !c.length, c.join(';'));
                    // every placeholder fits in its box
                    const clip = await page.evaluate(() => [...document.querySelectorAll('main input[placeholder]')].filter(i => i.offsetWidth).filter(i => { const cs = getComputedStyle(i), cv = document.createElement('canvas').getContext('2d'); cv.font = cs.fontSize + ' ' + cs.fontFamily; return cv.measureText(i.placeholder).width > i.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) + 1; }).map(i => i.id));
                    ok(tag + ': placeholders fit', !clip.length, clip.join(','));
                    const cut = await page.evaluate(() => [...document.querySelectorAll('main button, main .j-name, main h3, main label')].filter(e => e.offsetWidth && e.scrollWidth > e.clientWidth + 1).map(e => e.id || e.className || e.tagName));
                    ok(tag + ': no cut-off text', !cut.length, cut.join(','));
                }
            }
            await page.click('#c-cancel'); await page.locator('.change-wrap').count() && await page.locator('#who-list .change-btn', { hasText: 'Close' }).click();
            if (await page.locator('#rn-input').count()) await page.press('#rn-input', 'Escape');
        }
        // theme switch
        const before = await page.evaluate(() => getComputedStyle(document.body).color);
        await page.click('.theme-toggle');
        ok(scheme + ': theme switch changes the look', before !== await page.evaluate(() => getComputedStyle(document.body).color));
        await ctx.close();
    }

    // ---------- Help ----------
    for (const w of [320, 390, 820, 1280]) {
        ({ ctx, page } = await newPage({ viewport: { width: w, height: 800 } }));
        const hb = await page.locator('.help-btn').boundingBox(), bk = await page.locator('a.back').boundingBox(), tt = await page.locator('.theme-toggle').boundingBox();
        ok(w + ': top bar on one row', Math.abs(hb.y - bk.y) < 4 && Math.abs(tt.y - bk.y) < 4);
        ok(w + ': top bar buttons apart', hb.x >= bk.x + bk.width && tt.x >= hb.x + hb.width - 1);
        await page.click('.help-btn');
        const d = await page.locator('dialog.help').boundingBox();
        ok(w + ': help inside the screen', d.x >= 0 && d.y >= 0 && d.x + d.width <= w && d.y + d.height <= 800);
        ok(w + ': help title', (await page.locator('dialog.help h2').innerText()) === 'How to use Chore Rota for Households');
        await page.keyboard.press('Escape');
        ok(w + ': Escape closes help', !(await page.locator('dialog.help').evaluate(e => e.open)));
        await page.click('.help-btn'); await page.click('.help-close');
        ok(w + ': Got it closes help', !(await page.locator('dialog.help').evaluate(e => e.open)));
        await ctx.close();
    }

    // ---------- files ----------
    ({ ctx, page } = await newPage());
    for (const f of ['favicon.svg', 'manifest.webmanifest', 'sw.js', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', '../help.js', '../theme.js', 'core.js', 'script.js', 'style.css']) {
        const r = await page.request.get(URL + f); ok('file ' + f + ' is there', r.status() === 200);
    }
    await page.waitForTimeout(500);
    ok('service worker registers', await page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())));
    await ctx.close();

    ok('no console errors', !errors.length, errors.slice(0, 3).join(' | '));
    ok('no failed requests', !failed.length, failed.slice(0, 3).join(' | '));
    await browser.close(); if (srv) srv.close();
    console.log(pass + ' passed, ' + fail + ' failed' + (process.env.BASE ? ' (live)' : ' (local)'));
    process.exitCode = fail ? 1 : 0;
})();
