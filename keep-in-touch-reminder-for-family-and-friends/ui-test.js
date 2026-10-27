// Drives the real page in headless Chromium. Run from the repo root:
//   node keep-in-touch-reminder-for-family-and-friends/ui-test.js [--base http://localhost:8765] [--shots]
// --base defaults to a local server you start yourself (python3 -m http.server 8765 in the repo root).
// --shots also saves screenshots/desktop.png and screenshots/phone.png.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const args = process.argv.slice(2);
const bi = args.indexOf('--base'), BASE = (bi >= 0 ? args[bi + 1] : 'http://localhost:8765').replace(/\/$/, '');
const URL = BASE + '/keep-in-touch-reminder-for-family-and-friends/';
const KEY = 'keep-in-touch-reminder-for-family-and-friends.state';
const DIR = __dirname, TMP = fs.mkdtempSync(path.join(require('os').tmpdir(), 'kit-'));
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; if (!cond) console.log('FAIL ' + name + (extra ? '  ' + extra : '')); };
const NOW = new Date('2026-10-27T10:13:00Z');   // Tue 27 Oct, 14:13 in Dubai

async function open(browser, width, opts) {
    opts = opts || {};
    const ctx = await browser.newContext({ viewport: { width, height: width < 600 ? 800 : 900 }, deviceScaleFactor: opts.scale || 1, colorScheme: opts.scheme || 'dark', locale: 'en-GB', timezoneId: 'Asia/Dubai', acceptDownloads: true });
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE }).catch(() => {});
    const page = await ctx.newPage();
    await page.clock.setFixedTime(opts.now || NOW);
    page.errors = [];
    page.on('pageerror', e => page.errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !/goatcounter|gc\.zgo|ERR_NAME|ERR_INTERNET|ERR_TUNNEL|ERR_CONNECTION|Failed to load resource/.test(m.text())) page.errors.push(m.text()); });
    page.bad = [];
    page.on('response', r => { if (r.status() >= 400 && r.url().startsWith(BASE)) page.bad.push(r.status() + ' ' + r.url()); });
    if (opts.block) await page.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
    if (opts.state !== undefined) await page.addInitScript(([k, v]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, v); sessionStorage.setItem('seeded', '1'); } }, [KEY, opts.state]);
    await page.goto(URL, { waitUntil: 'load' });
    return page;
}
const txt = (page, sel) => page.locator(sel).first().innerText();
const saved = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
const box = (page, name) => page.locator('.person', { has: page.locator('.c-name', { hasText: new RegExp('^' + name.replace(/[()]/g, '\\$&') + '$') }) });
const names = page => page.locator('.person .c-name').allInnerTexts();
async function addPerson(page, name, o) {
    o = o || {};
    if (o.chip) await page.click('#quick .chip[data-name="' + o.chip + '"]');
    await page.fill('#f-name', name);
    if (o.every) await page.selectOption('#f-every', o.every);
    if (o.other) await page.fill('#f-oevery', o.other);
    if (o.last) { if (/^\d{4}/.test(o.last)) { await page.selectOption('#f-last', 'pick'); await page.fill('#f-lastd', o.last); } else await page.selectOption('#f-last', o.last); }
    if (o.tz || o.win) {
        if (await page.locator('#f-tz-open').isVisible()) await page.click('#f-tz-open');
        if (o.tz) await page.selectOption('#f-tz', o.tz);
        if (o.win) { await page.selectOption('#f-win', Array.isArray(o.win) ? 'custom' : o.win); if (Array.isArray(o.win)) { await page.selectOption('#f-from', o.win[0]); await page.selectOption('#f-to', o.win[1]); } }
    }
    if (o.note) { await page.click('#f-note-open'); await page.fill('#f-note', o.note); }
    await page.click('#f-save');
}
// log a contact; d = another day, n = note
async function log(page, name, kind, d, n) {
    const b = box(page, name);
    if (d || n) {
        await b.getByRole('button', { name: '+ Another day or a note about it (optional)' }).click();
        if (d) await b.locator('input[id^="lg-d-"]').fill(d);
        if (n) await b.locator('input[id^="lg-n-"]').fill(n);
    }
    await b.getByRole('button', { name: new RegExp('^' + kind.split(',')[0]) }).click();
}
// Sara in Dubai and her people, entered through the form like a real user would
async function sara(page) {
    await addPerson(page, 'Nani', { chip: 'Grandparents', last: '2026-10-11', tz: 'Asia/Karachi', win: '540-1260', note: 'Birthday in March.\nAsk about her knee.' });
    await log(page, 'Nani', 'Called', '2026-10-18', 'Her knee is better');
    await addPerson(page, 'Ammi and Abbu', { chip: 'Parents', tz: 'Asia/Karachi' });
    await log(page, 'Ammi and Abbu', 'Called', '2026-10-21');
    await log(page, 'Ammi and Abbu', 'Messaged', '2026-10-24');
    await addPerson(page, 'Ahmed (uni friend)', { chip: 'Old friend', last: '2026-10-01', tz: 'Europe/London', win: '1080-1320' });
    await addPerson(page, 'Bilal bhai', { every: '7', tz: 'America/Toronto', win: '540-1260' });
    await log(page, 'Bilal bhai', 'Called', '2026-10-22');
    await log(page, 'Bilal bhai', 'Tried, no answer', '2026-10-26');
    await addPerson(page, 'Zara', { chip: 'Close friend' });
    await addPerson(page, 'Khala', { every: '14', last: '2026-09-01' });
    await box(page, 'Khala').getByRole('button', { name: 'Pause reminders' }).click();
}

// layout checks used at every width
async function layout(page) {
    return page.evaluate(() => {
        const W = document.documentElement.clientWidth, out = [];
        if (document.documentElement.scrollWidth > W + 1) out.push('horizontal scroll ' + document.documentElement.scrollWidth);
        document.querySelectorAll('main *').forEach(e => {
            const r = e.getBoundingClientRect();
            if (r.width && (r.right > W + 1 || r.left < -1) && getComputedStyle(e).position !== 'absolute' && !e.closest('[hidden]')) out.push('sticks out: ' + (e.id || e.className || e.tagName));
        });
        const cv = document.createElement('canvas').getContext('2d');
        document.querySelectorAll('input[placeholder], textarea[placeholder]').forEach(i => {
            if (!i.offsetParent || i.value) return;
            const cs = getComputedStyle(i); cv.font = cs.fontSize + ' ' + cs.fontFamily;
            const room = i.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
            if (i.tagName === 'INPUT' && cv.measureText(i.placeholder).width > room + 1) out.push('placeholder cut: ' + i.id);
        });
        return out.slice(0, 5);
    });
}
async function controlsOverlap(page) {
    return page.evaluate(() => {
        const els = [...document.querySelectorAll('main input:not([type=file]), main select, main textarea, main button, main a.secondary, main .back')].filter(e => e.offsetParent).map(e => [e, e.getBoundingClientRect()]);
        const out = [];
        for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
            const a = els[i][1], b = els[j][1];
            if (els[i][0].contains(els[j][0]) || els[j][0].contains(els[i][0])) continue;
            if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) out.push((els[i][0].id || els[i][0].textContent.trim().slice(0, 20)) + ' / ' + (els[j][0].id || els[j][0].textContent.trim().slice(0, 20)));
        }
        return out.slice(0, 5);
    });
}
async function siblingsOverlap(page) {
    const out = [];
    for (const pos of [0, 0.5, 1]) {
        await page.evaluate(p => window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * p), pos);
        await page.waitForTimeout(50);
        out.push(...await page.evaluate(() => {
            const o = [];
            document.querySelectorAll('main, .app, .col-a, .col-b, .p-list, .person').forEach(par => {
                const k = [...par.children].filter(e => e.offsetParent || getComputedStyle(e).display !== 'none').map(e => [e, e.getBoundingClientRect()]).filter(x => x[1].height);
                for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) {
                    const a = k[i][1], b = k[j][1];
                    if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) o.push((k[i][0].id || k[i][0].className) + ' / ' + (k[j][0].id || k[j][0].className));
                }
            });
            return o;
        }));
    }
    return [...new Set(out)];
}

(async () => {
    const browser = await chromium.launch();

    // ---------- first use ----------
    let page = await open(browser, 390);
    ok('first use: intro shown', await page.locator('#intro').isVisible());
    ok('first use: no Today card or boxes', !(await page.locator('#today').isVisible()) && !(await page.locator('#people').isVisible()));
    ok('title', (await page.title()).startsWith('Keep in Touch Reminder for Family and Friends'));
    ok('h1', (await txt(page, 'h1')) === 'Keep in Touch Reminder for Family and Friends');
    ok('optional time zone and note hidden', !(await page.locator('#f-tz-box').isVisible()) && !(await page.locator('#f-note-box').isVisible()) && await page.locator('#f-tz-open').isVisible() && await page.locator('#f-note-open').isVisible());
    ok('other days and pick a day hidden', !(await page.locator('#f-oevery-box').isVisible()) && !(await page.locator('#f-lastd-box').isVisible()));
    ok('first use: Delete everything and backup disabled', await page.locator('#del-all').isDisabled() && await page.locator('#backup').isDisabled());

    // ---------- the form: wrong and odd inputs ----------
    await page.click('#f-save');
    ok('blank name refused', (await txt(page, '#f-name-err')).includes('Type a name'));
    await page.fill('#f-name', '    '); await page.click('#f-save');
    ok('spaces-only name refused', (await page.locator('.person').count()) === 0);
    await page.fill('#f-name', 'Test');
    await page.selectOption('#f-every', 'other');
    for (const bad of ['', '0', '-3', '2.5', '366', 'often', '99999']) {
        await page.fill('#f-oevery', bad); await page.click('#f-save');
        ok('other days "' + bad + '" refused', (await page.locator('.person').count()) === 0 && (await txt(page, '#f-oevery-err')).length > 5);
    }
    await page.selectOption('#f-every', '7');
    await page.selectOption('#f-last', 'pick'); await page.click('#f-save');
    ok('pick a day blank refused', (await txt(page, '#f-lastd-err')).includes('Pick the day'));
    await page.fill('#f-lastd', '2026-10-30'); await page.click('#f-save');
    ok('future last day refused', (await txt(page, '#f-lastd-err')).includes('future'));
    await page.selectOption('#f-last', '');
    await page.click('#f-tz-open'); await page.selectOption('#f-win', 'custom'); await page.selectOption('#f-from', '600'); await page.selectOption('#f-to', '600'); await page.click('#f-save');
    ok('same From and To refused', (await txt(page, '#f-from-err')).includes('same'));
    await page.selectOption('#f-win', ''); await page.fill('#f-name', '');
    await page.reload();

    // ---------- only a name: nothing optional is forced ----------
    await page.fill('#f-name', '  Zara \n  Khan '); await page.press('#f-name', 'Enter');
    ok('Enter adds a person with only a name', (await names(page)).join() === 'Zara Khan');
    ok('only a name: on today\'s list', (await txt(page, '#add-msg')).includes('Added Zara Khan: on today’s list') && (await box(page, 'Zara Khan').locator('.a-big').innerText()) === 'Get in touch today');
    ok('pasted spaces cleaned', (await saved(page)).people[0].name === 'Zara Khan');
    ok('defaults to every week', (await saved(page)).people[0].every === 7 && !(await saved(page)).people[0].tz);
    await page.fill('#f-name', 'zara khan'); await page.click('#f-save');
    ok('same name twice refused', (await txt(page, '#f-name-err')).includes('already have someone called zara khan'));
    await page.fill('#f-name', 'Cousin'); await page.selectOption('#f-every', 'other'); await page.fill('#f-oevery', '10 days'); await page.click('#f-save');
    ok('"10 days" accepted', (await saved(page)).people[1].every === 10 && (await box(page, 'Cousin').locator('.tag').first().innerText()) === 'Every 10 days');
    await page.fill('#f-name', 'Night nurse'); await page.click('#f-tz-open'); await page.selectOption('#f-win', 'custom'); await page.selectOption('#f-from', '1320'); await page.selectOption('#f-to', '360'); await page.click('#f-save');
    ok('night-shift window 22:00 to 06:00 saved', JSON.stringify((await saved(page)).people[2].win) === '{"from":1320,"to":360}');
    ok('night window: 14:13 is not a good time, good from 22:00 in 7 h 47 min', (await box(page, 'Night nurse').locator('.tz-box').innerText()).includes('Not a good time to call. Good from 22:00 (in 7 h 47 min).'));
    ok('no time zone: no "their time" line', !(await box(page, 'Night nurse').locator('.tz-box').innerText()).includes('Their time'));
    ok('form resets after adding', (await page.inputValue('#f-name')) === '' && !(await page.locator('#f-tz-box').isVisible()));
    ok('no errors so far', !page.errors.length, page.errors.join());
    await page.context().close();

    // ---------- the main situation ----------
    page = await open(browser, 390);
    await sara(page);
    ok('order: most overdue first, paused last', (await names(page)).join('|') === 'Nani|Ammi and Abbu|Zara|Bilal bhai|Ahmed (uni friend)|Khala', (await names(page)).join('|'));
    const nani = box(page, 'Nani');
    ok('Nani: 2 days overdue', (await nani.locator('.a-big').innerText()) === '2 days overdue');
    ok('Nani: last called 9 days ago, was due Sun 25 Oct', (await nani.locator('.a-note').innerText()) === 'Last called 9 days ago (Sun 18 Oct). You aim to be in touch every week, so they were due Sun 25 Oct.');
    ok('Nani: their time 15:13, 1 hour ahead, good time', (await nani.locator('.tz-box').innerText()).replace(/\n+/g, ' ') === 'Their time now: 15:13 (1 hour ahead of you) A good time to call now (until 21:00 their time).');
    ok('Nani: tags', (await nani.locator('.tag').allInnerTexts()).join() === 'Every week,Pakistan');
    ok('Nani: note with its line break', (await nani.locator('.p-note').innerText()) === 'Birthday in March.\nAsk about her knee.');
    ok('Nani: history with the note, newest first', (await nani.locator('.h-row').first().innerText()).includes('Called') && (await nani.locator('.h-row').first().innerText()).includes('Her knee is better') && (await nani.locator('.h-row').nth(1).innerText()).includes('In touch'));
    ok('Nani: last 30 days', (await nani.locator('.stats').innerText()) === 'Last 30 days: 1 call, 1 other contact');
    const ammi = box(page, 'Ammi and Abbu');
    ok('Ammi and Abbu: due today, last messaged 3 days ago', (await ammi.locator('.a-big').innerText()) === 'Due today' && (await ammi.locator('.a-note').innerText()).startsWith('Last messaged 3 days ago (Sat 24 Oct)'));
    ok('Ammi and Abbu: any time, only the clock line', (await ammi.locator('.tz-box').innerText()).trim() === 'Their time now: 15:13 (1 hour ahead of you)');
    const bilal = box(page, 'Bilal bhai');
    ok('Bilal: due in 2 days, Thu 29 Oct', (await bilal.locator('.a-big').innerText()) === 'Due in 2 days' && (await bilal.locator('.a-note').innerText()).includes('Next due Thu 29 Oct'));
    ok('Bilal: tried yesterday shown', (await bilal.locator('.a-try').innerText()) === 'You tried yesterday, no answer.');
    ok('Bilal: Toronto 06:13, good from 09:00 = 17:00 your time', (await bilal.locator('.tz-box').innerText()).replace(/\n+/g, ' ') === 'Their time now: 06:13 (8 hours behind you) Not a good time to call. Good from 09:00 their time, 17:00 your time (in 2 h 47 min).');
    const ahmed = box(page, 'Ahmed (uni friend)');
    ok('Ahmed: due in 4 days', (await ahmed.locator('.a-big').innerText()) === 'Due in 4 days' && (await ahmed.locator('.a-note').innerText()).includes('Next due Sat 31 Oct'));
    ok('Ahmed: London after the clocks change, 4 hours behind', (await ahmed.locator('.tz-box').innerText()).replace(/\n+/g, ' ') === 'Their time now: 10:13 (4 hours behind you) Not a good time to call. Good from 18:00 their time, 22:00 your time (in 7 h 47 min).');
    ok('Zara: get in touch today', (await box(page, 'Zara').locator('.a-big').innerText()) === 'Get in touch today');
    ok('Khala: paused', (await box(page, 'Khala').locator('.a-big').innerText()) === 'Paused' && (await box(page, 'Khala').locator('.a-note').innerText()).startsWith('Paused since Tue 27 Oct'));
    const today = (await txt(page, '#today')).replace(/\n+/g, ' ');
    ok('Today card', today.includes('Today, Tue 27 Oct 3 people to get in touch with today Nani: 2 days overdue Ammi and Abbu: due today Zara: no contact logged yet Next: Bilal bhai, due in 2 days (Thu 29 Oct). 1 overdue · 1 due today · 1 not logged yet · 2 up to date · 1 paused'), today);
    await page.click('#copy');
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    ok('Copy the list', clip.startsWith('Keep in touch: Tue 27 Oct\n\nGet in touch today:\n- Nani: 2 days overdue (last called 9 days ago (Sun 18 Oct), aim every week)') && clip.includes('Paused: Khala') && (await txt(page, '#today-msg')).includes('Copied'), clip);
    const mail = await page.getAttribute('#mail', 'href');
    ok('Email the list: no recipient needed, body has the list', mail.startsWith('mailto:?subject=') && decodeURIComponent(mail).includes('- Zara: no contact logged yet'));
    ok('name links jump to the box', (await page.locator('.t-list a').first().getAttribute('href')) === '#p-' + (await saved(page)).people[0].id);
    ok('find box shows with 6 people', await page.locator('#find-box').isVisible());
    await page.fill('#find', 'bil');
    ok('find filters the boxes', (await page.locator('.person:visible').count()) === 1);
    await page.fill('#find', 'nobody');
    ok('find: no match message', await page.locator('#find-none').isVisible());
    await page.fill('#find', '');

    // ---------- logging, undo, tries ----------
    await log(page, 'Nani', 'Called');
    ok('Called Nani: message with next due', (await box(page, 'Nani').locator('.msg').innerText()).startsWith('Called Nani today. Next due Tue 3 Nov.'));
    ok('Called Nani: she moves down', (await names(page))[0] === 'Ammi and Abbu' && (await box(page, 'Nani').locator('.a-big').innerText()) === 'Due in 7 days');
    await box(page, 'Nani').getByRole('button', { name: 'Undo' }).click();
    ok('Undo: Nani overdue again and first', (await names(page))[0] === 'Nani' && (await box(page, 'Nani').locator('.a-big').innerText()) === '2 days overdue');
    await log(page, 'Zara', 'Tried, no answer');
    ok('a try keeps Zara due', (await box(page, 'Zara').locator('.a-big').innerText()) === 'Get in touch today' && (await box(page, 'Zara').locator('.a-try').innerText()) === 'You tried today, no answer.');
    await log(page, 'Zara', 'Messaged');
    ok('then Messaged: due in 14 days and the try line goes', (await box(page, 'Zara').locator('.a-big').innerText()) === 'Due in 14 days' && (await box(page, 'Zara').locator('.a-try').count()) === 0);
    await box(page, 'Bilal bhai').getByRole('button', { name: '+ Another day or a note about it (optional)' }).click();
    await box(page, 'Bilal bhai').locator('input[id^="lg-d-"]').fill('2026-10-29');
    await box(page, 'Bilal bhai').getByRole('button', { name: 'Called Bilal bhai' }).click();
    ok('future day refused when logging', (await box(page, 'Bilal bhai').locator('.msg').innerText()).includes('future') && (await saved(page)).people.find(x => x.name === 'Bilal bhai').log.length === 2);
    await box(page, 'Bilal bhai').getByRole('button', { name: 'Close' }).click();
    ok('the panel closes', (await box(page, 'Bilal bhai').locator('.more').count()) === 0);

    // edit and delete history
    await box(page, 'Nani').getByRole('button', { name: /^Edit Called on 18 Oct/ }).click();
    await page.fill('#ed-d', '2026-10-28'); await box(page, 'Nani').getByRole('button', { name: 'Save', exact: true }).click();
    ok('editing to a future day refused', (await txt(page, '#ed-err')).includes('future'));
    await page.fill('#ed-d', '2026-10-24'); await page.selectOption('#ed-k', 'msg'); await page.fill('#ed-n', ''); await box(page, 'Nani').getByRole('button', { name: 'Save', exact: true }).click();
    ok('edited entry: now messaged on 24 Oct, due in 4 days', (await box(page, 'Nani').locator('.a-note').innerText()).startsWith('Last messaged 3 days ago') && (await box(page, 'Nani').locator('.a-big').innerText()) === 'Due in 4 days');
    await box(page, 'Nani').getByRole('button', { name: 'Undo' }).click();
    ok('undo the edit', (await box(page, 'Nani').locator('.a-big').innerText()) === '2 days overdue');
    await box(page, 'Nani').getByRole('button', { name: /^Delete Called on 18 Oct/ }).click();
    ok('delete an entry: last in touch 11 Oct now', (await box(page, 'Nani').locator('.a-note').innerText()).startsWith('Last in touch 16 days ago') && (await box(page, 'Nani').locator('.a-big').innerText()) === '9 days overdue');
    await box(page, 'Nani').getByRole('button', { name: 'Undo' }).click();
    ok('undo the delete', (await box(page, 'Nani').locator('.h-row').count()) === 2);
    for (const d of ['2026-09-01', '2026-09-08', '2026-09-15', '2026-09-22']) await log(page, 'Ahmed (uni friend)', 'Messaged', d);
    ok('history shows 5, then Show all 5+', (await box(page, 'Ahmed (uni friend)').locator('.h-row').count()) === 5 && (await box(page, 'Ahmed (uni friend)').getByRole('button', { name: 'Show all 5' }).count()) === 0);
    await log(page, 'Ahmed (uni friend)', 'Met up', '2026-08-20');
    await box(page, 'Ahmed (uni friend)').getByRole('button', { name: 'Show all 6' }).click();
    ok('Show all 6', (await box(page, 'Ahmed (uni friend)').locator('.h-row').count()) === 6);
    ok('an older entry does not change the last contact', (await box(page, 'Ahmed (uni friend)').locator('.a-big').innerText()) === 'Due in 4 days');

    // edit a person
    await box(page, 'Nani').getByRole('button', { name: 'Edit person' }).click();
    ok('edit form filled', (await txt(page, '#add-h')) === 'Edit Nani' && (await page.inputValue('#f-every')) === '7' && (await page.inputValue('#f-tz')) === 'Asia/Karachi' && await page.locator('#f-cancel').isVisible() && !(await page.locator('#f-last-box').isVisible()));
    await page.selectOption('#f-every', '14'); await page.click('#f-save');
    ok('every 2 weeks: Nani due in 5 days', (await box(page, 'Nani').locator('.a-big').innerText()) === 'Due in 5 days' && (await box(page, 'Nani').locator('.msg').innerText()).includes('Saved the changes'));
    await box(page, 'Nani').getByRole('button', { name: 'Undo' }).click();
    await box(page, 'Nani').getByRole('button', { name: 'Edit person' }).click();
    await page.click('#f-cancel');
    ok('Cancel leaves the person as it was', (await txt(page, '#add-h')) === 'Add another person' && (await box(page, 'Nani').locator('.a-big').innerText()) === '2 days overdue');

    // pause and resume
    await box(page, 'Khala').getByRole('button', { name: 'Resume' }).click();
    ok('Resume: Khala due today, not weeks late', (await box(page, 'Khala').locator('.a-big').innerText()) === 'Due today');
    await box(page, 'Khala').getByRole('button', { name: 'Undo' }).click();

    // the calendar file
    const [dl] = await Promise.all([page.waitForEvent('download'), box(page, 'Ahmed (uni friend)').getByRole('button', { name: 'Add next due day to calendar' }).click()]);
    const ics = fs.readFileSync(await dl.path(), 'utf8');
    ok('calendar file for Sat 31 Oct', dl.suggestedFilename() === 'keep-in-touch-ahmed-uni-friend.ics' && ics.includes('DTSTART;VALUE=DATE:20261031') && ics.includes('SUMMARY:Get in touch with Ahmed (uni friend)'));
    const [dl2] = await Promise.all([page.waitForEvent('download'), box(page, 'Nani').getByRole('button', { name: 'Add next due day to calendar' }).click()]);
    ok('overdue: calendar file for today', fs.readFileSync(await dl2.path(), 'utf8').includes('DTSTART;VALUE=DATE:20261027'));

    // delete a person
    await box(page, 'Zara').getByRole('button', { name: 'Delete person' }).click();
    ok('delete person', (await names(page)).length === 5 && (await txt(page, '#top-msg')).includes('Deleted Zara'));
    await page.locator('#top-msg').getByRole('button', { name: 'Undo' }).click();
    ok('undo delete person', (await names(page)).length === 6);

    // reload: everything saved
    const before = await names(page);
    await page.reload();
    ok('reload keeps everything', (await names(page)).join() === before.join() && (await box(page, 'Nani').locator('.a-big').innerText()) === '2 days overdue');
    const full = JSON.stringify(await saved(page));
    fs.writeFileSync(path.join(TMP, 'state.json'), full);

    // backup and restore
    const [bk] = await Promise.all([page.waitForEvent('download'), page.click('#backup')]);
    const bkPath = path.join(TMP, 'backup.json'); fs.copyFileSync(await bk.path(), bkPath);
    ok('backup file name', bk.suggestedFilename() === 'keep-in-touch-reminder-for-family-and-friends-2026-10-27.json');
    await page.click('#del-all');
    ok('delete everything', (await page.locator('.person').count()) === 0 && await page.locator('#intro').isVisible());
    await page.locator('#tools-msg').getByRole('button', { name: 'Undo' }).click();
    ok('undo delete everything', (await page.locator('.person').count()) === 6);
    await page.context().close();
    page = await open(browser, 390);
    fs.writeFileSync(path.join(TMP, 'junk.json'), '{"hello": 1}');
    await page.setInputFiles('#restore-file', path.join(TMP, 'junk.json'));
    await page.waitForTimeout(150);
    ok('a wrong file is refused', (await txt(page, '#add-msg')).includes('not a backup') && (await page.locator('.person').count()) === 0);
    await page.setInputFiles('#restore-file', bkPath);
    await page.waitForTimeout(150);
    ok('restore on another phone', (await page.locator('.person').count()) === 6 && (await names(page))[0] === 'Nani');
    await page.context().close();

    // ---------- the next day, and midnight while open ----------
    page = await open(browser, 390, { state: full, now: new Date('2026-10-28T06:00:00Z') });
    ok('next day: Nani 3 days overdue, Ammi 1 day overdue', (await box(page, 'Nani').locator('.a-big').innerText()) === '3 days overdue' && (await box(page, 'Ammi and Abbu').locator('.a-big').innerText()) === '1 day overdue');
    await page.context().close();
    page = await open(browser, 390, { state: full, now: new Date('2026-10-27T19:59:00Z') });
    ok('23:59: still Tuesday', (await txt(page, '#today-h')) === 'Today, Tue 27 Oct');
    await page.clock.setFixedTime(new Date('2026-10-27T20:01:00Z'));
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    ok('after midnight the page moves on to Wednesday', (await txt(page, '#today-h')) === 'Today, Wed 28 Oct' && (await box(page, 'Nani').locator('.a-big').innerText()) === '3 days overdue');
    await page.context().close();

    // ---------- broken or blocked storage, odd text ----------
    page = await open(browser, 390, { state: '{bad json' });
    ok('corrupt state: starts fresh', await page.locator('#intro').isVisible() && !page.errors.length);
    await page.context().close();
    page = await open(browser, 390, { state: JSON.stringify({ v: 1, people: [{ name: 'Good', every: 7, log: [{ d: 'bad', k: 'call' }, { d: '2026-10-20', k: 'call' }] }, { name: '', every: 0 }, { name: 'Bad tz', every: 3, tz: 'Nowhere/City' }] }) });
    ok('half-bad state: keeps the good parts', (await page.locator('.person').count()) === 2 && (await box(page, 'Good').locator('.h-row').count()) === 1 && !page.errors.length);
    await page.context().close();
    page = await open(browser, 390, { block: true });
    ok('blocked storage: warning shown', await page.locator('#store-warn').isVisible());
    await page.fill('#f-name', 'Ammi'); await page.click('#f-save');
    ok('blocked storage: still works', (await page.locator('.person').count()) === 1 && !page.errors.length, page.errors.join());
    await page.context().close();
    page = await open(browser, 320);
    await page.evaluate(() => { window.hacked = false; });
    await page.fill('#f-name', '<img src=x onerror="window.hacked=true">'); await page.click('#f-note-open');
    await page.fill('#f-note', 'W'.repeat(500)); await page.click('#f-save');
    await page.fill('#f-name', 'Abcdefghijklmnopqrstuvwxyzabcdefghijklmn'); await page.click('#f-save');
    await log(page, 'Abcdefghijklmnopqrstuvwxyzabcdefghijklmn', 'Called', null, 'N'.repeat(200));
    ok('typed HTML is shown as text', (await page.locator('.c-name').allInnerTexts()).includes('<img src=x onerror="window.hacked=true">'.slice(0, 40)) && !(await page.evaluate(() => window.hacked)));
    const l = await layout(page);
    ok('very long name and notes: no overflow at 320', !l.length, l.join(' | '));
    await page.context().close();

    // ---------- keyboard and screen readers ----------
    page = await open(browser, 390, { state: full });
    ok('every box is labelled with the name', (await page.locator('article.person[aria-label="Nani"]').count()) === 1);
    ok('log buttons say who', (await page.getByRole('button', { name: 'Messaged Ammi and Abbu' }).count()) === 1);
    ok('every field has a label', await page.evaluate(() => [...document.querySelectorAll('main input:not([type=file]), main select, main textarea')].every(i => document.querySelector('label[for="' + i.id + '"]'))));
    await page.context().close();

    // ---------- the light/dark switch ----------
    page = await open(browser, 390, { state: full });
    const bg1 = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await page.locator('.theme-toggle').click();
    const bg2 = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    ok('theme switch changes the look', bg1 !== bg2);
    await page.reload();
    ok('theme choice remembered', (await page.evaluate(() => getComputedStyle(document.body).backgroundColor)) === bg2);
    await page.context().close();

    // ---------- Help at 4 widths ----------
    for (const w of [320, 390, 820, 1280]) {
        page = await open(browser, w, { state: full });
        await page.getByRole('button', { name: /help/i }).first().click();
        const dlg = page.locator('dialog[open], [role=dialog]').first();
        await dlg.waitFor();
        const r = await dlg.boundingBox();
        ok('help opens inside the screen at ' + w, r && r.x >= 0 && r.x + r.width <= w + 1 && (await dlg.innerText()).includes('How to use the Keep in Touch Reminder'));
        await page.keyboard.press('Escape');
        ok('Escape closes help at ' + w, !(await dlg.isVisible()));
        await page.getByRole('button', { name: /help/i }).first().click();
        await page.getByRole('button', { name: 'Got it' }).click();
        ok('Got it closes help at ' + w, !(await page.locator('dialog[open], [role=dialog]').first().isVisible()));
        const top = await page.evaluate(() => [...document.querySelectorAll('.topbar a, .topbar button, main > .back')].map(e => e.getBoundingClientRect()).map(r => [r.top, r.bottom, r.left, r.right]));
        let clash = false;
        for (let i = 0; i < top.length; i++) for (let j = i + 1; j < top.length; j++) { const a = top[i], b = top[j]; if (a[2] < b[3] - 1 && b[2] < a[3] - 1 && a[0] < b[1] - 1 && b[0] < a[1] - 1) clash = true; }
        const rows = new Set(top.map(t => Math.round(t[0])));
        ok('top bar buttons do not overlap or wrap at ' + w, !clash && rows.size === 1);
        await page.context().close();
    }

    // ---------- every width, filled and cleared, dark and light ----------
    for (const scheme of ['dark', 'light']) for (const w of [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920]) {
        page = await open(browser, w, { state: full, scheme });
        let lo = await layout(page);
        ok(scheme + ' ' + w + ' filled: no scroll or overflow', !lo.length, lo.join(' | '));
        if (w >= 900) { const o = await siblingsOverlap(page); ok(scheme + ' ' + w + ' no blocks overlap while scrolling', !o.length, o.join(' | ')); }
        if (w <= 390) {
            // every optional field open, a contact panel open and a history entry being edited
            await page.click('#f-tz-open'); await page.selectOption('#f-win', 'custom'); await page.click('#f-note-open');
            await page.selectOption('#f-every', 'other'); await page.selectOption('#f-last', 'pick');
            await box(page, 'Nani').getByRole('button', { name: '+ Another day or a note about it (optional)' }).click();
            await box(page, 'Bilal bhai').getByRole('button', { name: /^Edit Called on 22 Oct/ }).click();
            lo = await layout(page);
            ok(scheme + ' ' + w + ' all fields open: no overflow', !lo.length, lo.join(' | '));
            const c = await controlsOverlap(page);
            ok(scheme + ' ' + w + ' no controls overlap', !c.length, c.join(' | '));
        }
        await page.evaluate(k => localStorage.removeItem(k), KEY); await page.reload();
        lo = await layout(page);
        ok(scheme + ' ' + w + ' cleared: no overflow', !lo.length, lo.join(' | '));
        if (w >= 900) { const o = await siblingsOverlap(page); ok(scheme + ' ' + w + ' cleared: no blocks overlap', !o.length, o.join(' | ')); }
        ok(scheme + ' ' + w + ' no errors', !page.errors.length && !page.bad.length, page.errors.concat(page.bad).join(' | '));
        await page.context().close();
    }

    // ---------- screenshots ----------
    if (args.includes('--shots')) {
        page = await open(browser, 1280, { state: full });
        await page.screenshot({ path: path.join(DIR, 'screenshots/desktop.png') });
        await page.context().close();
        page = await open(browser, 390, { state: full, scale: 2 });
        await page.setViewportSize({ width: 390, height: 1500 });
        await page.screenshot({ path: path.join(DIR, 'screenshots/phone.png') });
        await page.context().close();
    }
    await browser.close();
    console.log(pass + ' passed, ' + fail + ' failed');
    if (fail) process.exitCode = 1;
})();
