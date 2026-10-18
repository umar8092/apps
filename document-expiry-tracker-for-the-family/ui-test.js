// Full page test with Playwright. Run from the repo root or this folder: node ui-test.js
//   BASE=https://umar8092.github.io/apps node ui-test.js   tests the live site
//   node ui-test.js --shots                                 also saves screenshots/desktop.png and phone.png
// "Today" is fixed to Sun 18 Oct 2026 in Pakistan time so every answer can be checked exactly.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), SLUG = 'document-expiry-tracker-for-the-family', KEY = SLUG + '.state';
const SHOTS = process.argv.includes('--shots');
const NOW = new Date('2026-10-18T10:00:00+05:00');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; if (!cond) console.log('FAIL ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra).slice(0, 400) : '')); };

function serve() {
    const types = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml', png: 'image/png', webmanifest: 'application/manifest+json' };
    return new Promise(res => { const s = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0].replace(/^\/apps/, '')); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': types[f.split('.').pop()] || 'application/octet-stream' }); r.end(fs.readFileSync(f)); }).listen(0, () => res(s)); });
}

// The family from the README, as saved state (used for screenshots and the screen size checks).
const FAMILY = { v: 1, nextId: 20, trip: { back: '2026-12-20', rule: 6 },
    people: [{ id: 1, name: 'Aisha' }, { id: 2, name: 'Ali' }, { id: 3, name: 'Me' }, { id: 4, name: 'Car' }],
    docs: [
        { id: 10, who: 1, type: 'passport', name: '', exp: { t: 'date', d: '2027-03-03' }, remind: { n: 9, u: 'm' }, number: 'AB1234567', country: 'Pakistan', note: '', applied: '', history: [] },
        { id: 11, who: 1, type: 'visa', name: '', exp: { t: 'date', d: '2027-08-20' }, remind: { n: 3, u: 'm' }, number: '', country: 'UAE', note: 'Renew through the sponsor.', applied: '', history: [] },
        { id: 12, who: 2, type: 'licence', name: '', exp: { t: 'month', y: 2026, m: 10 }, remind: { n: 2, u: 'm' }, number: '', country: '', note: '', applied: '2026-10-12', history: [] },
        { id: 13, who: 3, type: 'passport', name: '', exp: { t: 'date', d: '2031-05-12' }, remind: { n: 9, u: 'm' }, number: 'CD7654321', country: '', note: '', applied: '', history: [{ exp: { t: 'date', d: '2021-05-11' }, on: '2021-03-02', number: '' }] },
        { id: 14, who: 3, type: 'id', name: '', exp: { t: 'none' }, remind: { n: 2, u: 'm' }, number: '', country: '', note: '', applied: '', history: [] },
        { id: 15, who: 4, type: 'carins', name: '', exp: { t: 'date', d: '2026-10-10' }, remind: { n: 1, u: 'm' }, number: '', country: 'Aviva', note: '', applied: '', history: [] },
        { id: 16, who: 4, type: 'carcheck', name: '', exp: { t: 'date', d: '2027-06-30' }, remind: { n: 1, u: 'm' }, number: '', country: '', note: '', applied: '', history: [] }
    ] };

(async () => {
    let srv, base = process.env.BASE;
    if (!base) { srv = await serve(); base = 'http://localhost:' + srv.address().port + '/apps'; }
    const URL = base + '/' + SLUG + '/';
    const browser = await chromium.launch();
    const errors = [], failed = [], requested = new Set();
    async function newPage(opts, seed) {
        const ctx = await browser.newContext(Object.assign({ viewport: { width: 390, height: 844 }, acceptDownloads: true, timezoneId: 'Asia/Karachi', colorScheme: 'dark' }, opts || {}));
        await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new globalThis.URL(base).origin });
        await ctx.route(/goatcounter\.com|gc\.zgo\.at/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
        if (seed !== undefined) await ctx.addInitScript(([k, v]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, v); sessionStorage.setItem('seeded', '1'); } }, [KEY, typeof seed === 'string' ? seed : JSON.stringify(seed)]);
        const page = await ctx.newPage();
        await page.clock.setFixedTime(NOW);
        page.on('pageerror', e => errors.push(e.message));
        page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
        page.on('request', r => { if (r.url().startsWith(base)) requested.add(r.url()); });
        page.on('response', r => { if (r.status() >= 400 && r.url().startsWith(base)) failed.push(r.status() + ' ' + r.url()); });
        await page.goto(URL, { waitUntil: 'networkidle' });
        return { ctx, page };
    }
    const docBox = (page, person, title) => page.locator('#people > li', { has: page.locator('.person-name', { hasText: new RegExp('^' + person + '$') }) }).locator('li.box', { has: page.locator('.box-name', { hasText: new RegExp('^' + title.replace(/[()]/g, '\\$&') + '$') }) });
    const personBox = (page, person) => page.locator('#people > li', { has: page.locator('.person-name', { hasText: new RegExp('^' + person + '$') }) });
    const saved = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
    async function add(page, f) {
        if (!(await page.locator('#form').isVisible())) await page.click('#open-form');
        if (f.who) await page.selectOption('#f-who', { label: f.who });
        if (f.newName != null) { await page.selectOption('#f-who', 'new'); await page.fill('#f-newname', f.newName); }
        if (f.type) await page.selectOption('#f-type', f.type);
        if (f.name) await page.fill('#f-name', f.name);
        if (f.kind) await page.selectOption('#f-expkind', f.kind);
        if (f.date) await page.fill('#f-expdate', f.date);
        if (f.month) { await page.selectOption('#f-expmonth', String(f.month)); await page.fill('#f-expyear', String(f.year)); }
        if (f.rem) await page.selectOption('#f-rem', f.rem);
        if (f.number || f.country || f.note) {
            if (await page.locator('#o-more').isVisible()) await page.click('#o-more');
            if (f.number) await page.fill('#f-number', f.number);
            if (f.country) await page.fill('#f-country', f.country);
            if (f.note) await page.fill('#f-note', f.note);
        }
        if (f.check) await f.check();
        await page.click('#save');
    }

    // ---------- 1. first use, the real situation, step by step ----------
    {
        const { ctx, page } = await newPage();
        ok('first use: form open', await page.locator('#form').isVisible());
        ok('first use: name box shown for a new person', await page.locator('#f-newname').isVisible());
        ok('first use: optional details hidden', !(await page.locator('#w-more').isVisible()) && await page.locator('#o-more').isVisible());
        ok('first use: summary explains', (await page.innerText('#sum-body')).includes('Add a document'));
        ok('first use: empty message', await page.locator('#empty').isVisible());
        ok('first use: no Cancel', !(await page.locator('#cancel').isVisible()));
        ok('first use: passport preselected with 9 months', await page.inputValue('#f-type') === 'passport' && await page.inputValue('#f-rem') === '9m');
        ok('first use: copy disabled', await page.locator('#copy-all').isDisabled());
        // blank form
        await page.click('#save');
        ok('blank: who error', (await page.innerText('#e-who')).includes('Type whose document'));
        ok('blank: date error', (await page.innerText('#e-exp')).includes('Choose the date it expires'));
        ok('blank: nothing saved', (await saved(page)).docs.length === 0);
        // Aisha's passport, with number (optional fields are not forced)
        await add(page, { newName: 'Aisha', type: 'passport', date: '2027-03-03', number: 'AB1234567', country: 'Pakistan',
            check: async () => ok('preview: renew now', (await page.innerText('#preview')) === 'Expires Wed 3 Mar 2027 (4 months left). That is inside the reminder time, so it will show as "Renew now".', await page.innerText('#preview')) });
        let b = docBox(page, 'Aisha', 'Passport (Pakistan)');
        ok('Aisha passport shown', await b.count() === 1);
        ok('Aisha passport status', (await b.locator('.box-line').innerText()) === 'Valid until Wed 3 Mar 2027 (4 months left)');
        ok('Aisha passport badge', (await b.locator('.badge').innerText()) === 'Renew now');
        ok('Aisha passport 6 month warning', (await b.locator('.box-adv').innerText()).includes('under 6 months left'));
        ok('number hidden', !(await b.innerText()).includes('AB1234567'));
        await b.getByRole('button', { name: /Show the number/ }).click();
        ok('Show number reveals it', (await docBox(page, 'Aisha', 'Passport (Pakistan)').innerText()).includes('Number: AB1234567'));
        await docBox(page, 'Aisha', 'Passport (Pakistan)').getByRole('button', { name: /Hide the number/ }).click();
        ok('Hide number', !(await docBox(page, 'Aisha', 'Passport (Pakistan)').innerText()).includes('AB1234567'));
        ok('form closed after add', !(await page.locator('#form').isVisible()) && await page.locator('#open-form').isVisible());
        ok('summary lists it', (await page.innerText('#sum-body')).includes('Aisha: Passport (Pakistan) expires Wed 3 Mar 2027 (4 months left)'));
        // add for Aisha from her box: a visa
        await personBox(page, 'Aisha').getByRole('button', { name: '+ Add a document for Aisha' }).click();
        ok('person button picks Aisha', await page.inputValue('#f-who') === '1' && !(await page.locator('#f-newname').isVisible()));
        await page.selectOption('#f-type', 'visa');
        ok('type change sets 3 months', await page.inputValue('#f-rem') === '3m');
        await add(page, { date: '2027-08-20' });
        ok('visa added for Aisha', await docBox(page, 'Aisha', 'Visa or residence permit').count() === 1);
        ok('Aisha passport above visa', (await personBox(page, 'Aisha').locator('.box-name').allInnerTexts()).join('|') === 'Passport (Pakistan)|Visa or residence permit');
        // Ali: month-only licence
        await add(page, { newName: 'Ali', type: 'licence', kind: 'month', month: 10, year: 2026,
            check: async () => ok('licence reminder 2 months', await page.inputValue('#f-rem') === '2m') });
        b = docBox(page, 'Ali', 'Driving licence');
        ok('month-only status', (await b.locator('.box-line').innerText()) === 'Valid until the end of October 2026 (13 days left)');
        // duplicate person name
        await add(page, { newName: 'ali', type: 'id', kind: 'none' });
        ok('duplicate name refused', (await page.innerText('#e-who')).includes('already on the list'));
        // Me: passport and ID with no expiry
        await page.fill('#f-newname', 'Me');
        await page.selectOption('#f-type', 'passport'); await page.selectOption('#f-expkind', 'date'); await page.fill('#f-expdate', '2031-05-12');
        ok('no-expiry hides reminder', true);
        await page.click('#save');
        ok('my passport valid', (await docBox(page, 'Me', 'Passport').locator('.box-adv').innerText()) === 'Start renewing on 12 Aug 2030 (keeps 6 months for travel).');
        await add(page, { who: 'Me', type: 'id', kind: 'none', check: async () => ok('no expiry hides Start renewing', !(await page.locator('#f-rem').isVisible())) });
        ok('ID no expiry', (await docBox(page, 'Me', 'National ID card').locator('.badge').innerText()) === 'No expiry');
        // Something else needs a name; bad custom reminder
        await add(page, { who: 'Me', type: 'other', date: '2027-01-31', rem: 'custom' });
        ok('other needs a name', (await page.innerText('#e-name')).includes('Type what the document is'));
        await page.fill('#f-name', 'Gym card'); await page.fill('#f-remnum', '0'); await page.click('#save');
        ok('zero reminder refused', (await page.innerText('#e-rem')).includes('1 to 104 weeks'));
        await page.fill('#f-remnum', '6'); await page.selectOption('#f-remunit', 'w'); await page.click('#save');
        ok('gym card with 6 weeks', (await docBox(page, 'Me', 'Gym card').locator('.box-adv').innerText()) === 'Start renewing on 20 Dec 2026.');
        // Car insurance already expired
        await add(page, { newName: 'Car', type: 'carins', date: '2026-10-10' });
        ok('car insurance expired', (await docBox(page, 'Car', 'Car insurance').locator('.box-line').innerText()) === 'Expired on Sat 10 Oct 2026 (8 days ago)');
        const sum = await page.locator('#sum-body .sum-list li').allInnerTexts();
        ok('summary: exact to-renew list', sum.map(s => s.replace(/\s*Go to it$/, '')).join('|') === 'Car: Car insurance expired 8 days ago|Ali: Driving licence expires Sat 31 Oct 2026 (13 days left)|Aisha: Passport (Pakistan) expires Wed 3 Mar 2027 (4 months left)', sum);
        ok('summary headline', (await page.innerText('#sum-body .next')) === '3 documents to renew now');

        // applied, undo, renewed
        await docBox(page, 'Ali', 'Driving licence').getByRole('button', { name: /^Applied for renewal/ }).click();
        ok('applied: waiting list', (await page.innerText('#sum-body')).includes('Waiting for the new one') && (await page.innerText('#sum-body')).includes('Ali: Driving licence, applied for on 18 Oct 2026'));
        ok('applied badge', (await docBox(page, 'Ali', 'Driving licence').locator('.badge').innerText()) === 'Applied');
        await page.click('#list-msg .undo');
        ok('undo applied', (await docBox(page, 'Ali', 'Driving licence').locator('.badge').innerText()) === 'Renew now');
        await docBox(page, 'Ali', 'Driving licence').getByRole('button', { name: /^Applied for renewal/ }).click();
        await docBox(page, 'Ali', 'Driving licence').getByRole('button', { name: /^Renewed/ }).click();
        ok('renew form heading', (await page.innerText('#form-h')) === 'Renewed: Ali, Driving licence');
        ok('renew form keeps month kind and clears it', await page.inputValue('#f-expkind') === 'month' && await page.inputValue('#f-expyear') === '');
        await page.selectOption('#f-expmonth', '10'); await page.fill('#f-expyear', '2036'); await page.click('#save');
        b = docBox(page, 'Ali', 'Driving licence');
        ok('renewed: valid', (await b.locator('.badge').innerText()) === 'Valid' && (await b.locator('.box-line').innerText()).startsWith('Valid until the end of October 2036'));
        ok('renewed: history kept', (await b.locator('.hist summary').innerText()) === 'Earlier (1)');
        ok('renewed: applied cleared', (await saved(page)).docs.find(d => d.type === 'licence').applied === '');
        // edit a mistake, then delete with undo
        await docBox(page, 'Me', 'Gym card').getByRole('button', { name: /^Edit/ }).click();
        ok('edit form filled', await page.inputValue('#f-name') === 'Gym card' && await page.inputValue('#f-remnum') === '6' && await page.locator('#del').isVisible());
        await page.fill('#f-name', 'Gym membership'); await page.click('#save');
        ok('edit saved', await docBox(page, 'Me', 'Gym membership').count() === 1 && await docBox(page, 'Me', 'Gym card').count() === 0);
        await docBox(page, 'Me', 'Gym membership').getByRole('button', { name: /^Edit/ }).click();
        await page.click('#del');
        ok('deleted', await docBox(page, 'Me', 'Gym membership').count() === 0);
        await page.click('#list-msg .undo');
        ok('undo delete', await docBox(page, 'Me', 'Gym membership').count() === 1);
        // cancel an edit does not change anything
        await docBox(page, 'Me', 'Gym membership').getByRole('button', { name: /^Edit/ }).click();
        await page.fill('#f-name', 'XYZ'); await page.click('#cancel');
        ok('cancel keeps it', await docBox(page, 'Me', 'Gym membership').count() === 1);

        // travel check
        await page.fill('#t-back', '2026-12-20'); await page.locator('#t-back').dispatchEvent('change');
        const rows = await page.locator('#trip-out .trip-list li').allInnerTexts();
        ok('travel: Aisha passport fails', rows[0] === 'Renew first: Aisha, Passport (Pakistan) ends on 3 Mar 2027, only 2 months after you come back. Many countries want 6 months. Renew it first.', rows[0]);
        ok('travel: headline', (await page.innerText('#trip-out .trip-head')) === '1 document not good for this trip', await page.innerText('#trip-out .trip-head'));
        await page.selectOption('#t-rule', '0');
        ok('travel: until return all good', (await page.innerText('#trip-out .trip-head')).startsWith('All good for a trip until'));
        await page.selectOption('#t-rule', '6');
        await page.fill('#t-back', '2026-01-01'); await page.locator('#t-back').dispatchEvent('change');
        ok('travel: past date error', (await page.innerText('#e-trip')) === 'The day you come back cannot be before today.');
        await page.fill('#t-back', '2026-12-20'); await page.locator('#t-back').dispatchEvent('change');

        // rename, remove with undo
        await personBox(page, 'Car').getByRole('button', { name: 'Rename Car' }).click();
        await page.fill('.rename input', 'aisha'); await page.click('.rename button[type=submit]');
        ok('rename duplicate refused', (await page.innerText('.rename .err')).includes('already on the list'));
        await page.fill('.rename input', 'Family car'); await page.click('.rename button[type=submit]');
        ok('renamed', await personBox(page, 'Family car').count() === 1);
        await personBox(page, 'Family car').getByRole('button', { name: 'Remove Family car' }).click();
        ok('removed with message', (await page.innerText('#list-msg')).includes('Removed Family car and 1 document'));
        ok('removed person gone', await personBox(page, 'Family car').count() === 0);
        await page.click('#list-msg .undo');
        ok('undo remove', await docBox(page, 'Family car', 'Car insurance').count() === 1);

        // copy, email, calendar
        await page.click('#copy-all');
        const clip = await page.evaluate(() => navigator.clipboard.readText());
        ok('copy list: no numbers', clip.startsWith('Family documents and expiry dates (18 Oct 2026)') && !clip.includes('AB1234567'), clip.slice(0, 200));
        await docBox(page, 'Aisha', 'Passport (Pakistan)').getByRole('button', { name: /^Copy/ }).click();
        ok('copy one: has number', (await page.evaluate(() => navigator.clipboard.readText())).includes('Number: AB1234567'));
        const mail = await page.getAttribute('#mail-all', 'href');
        ok('email with no address', mail.startsWith('mailto:?subject=Family%20documents') && !decodeURIComponent(mail).includes('AB1234567'));
        let [dl] = await Promise.all([page.waitForEvent('download'), page.click('#cal-all')]);
        const ics = fs.readFileSync(await dl.path(), 'utf8');
        ok('calendar file', dl.suggestedFilename() === 'family-document-reminders.ics' && ics.includes('BEGIN:VEVENT') && ics.includes('SUMMARY:Me: Passport expires today'));
        [dl] = await Promise.all([page.waitForEvent('download'), docBox(page, 'Me', 'Passport').getByRole('button', { name: /to my calendar/ }).click()]);
        ok('one calendar file', dl.suggestedFilename() === 'me-passport.ics');
        ok('no calendar button on expired', await docBox(page, 'Family car', 'Car insurance').getByRole('button', { name: /to my calendar/ }).count() === 0);

        // reload keeps everything
        const before = await saved(page);
        await page.reload({ waitUntil: 'networkidle' });
        ok('reload: same people and docs', (await page.locator('#people > li').count()) === 4 && (await saved(page)).docs.length === before.docs.length);
        ok('reload: trip kept', await page.inputValue('#t-back') === '2026-12-20' && (await page.locator('#trip-out li').count()) > 0);
        ok('reload: form closed', !(await page.locator('#form').isVisible()));

        // backup, delete everything, undo, restore
        [dl] = await Promise.all([page.waitForEvent('download'), page.click('#backup')]);
        const backupPath = await dl.path();
        ok('backup name', /^family-documents-backup-2026-10-18\.json$/.test(dl.suggestedFilename()));
        await page.click('#wipe');
        ok('wiped', (await page.locator('#people > li').count()) === 0 && await page.locator('#form').isVisible());
        await page.click('#set-msg .undo');
        ok('undo wipe', (await page.locator('#people > li').count()) === 4);
        await page.click('#wipe');
        await page.setInputFiles('#restore-file', backupPath);
        await page.waitForFunction(() => document.querySelectorAll('#people > li').length === 4);
        ok('restored', (await page.innerText('#set-msg')).includes('Restored 7 documents'));
        const badFile = path.join(require('os').tmpdir(), 'bad-backup.json'); fs.writeFileSync(badFile, '{"app":"other"}');
        await page.setInputFiles('#restore-file', badFile);
        await page.waitForFunction(() => document.getElementById('set-msg').textContent.includes('not a backup'));
        ok('bad backup refused', (await page.locator('#people > li').count()) === 4);

        // theme switch
        const tbtn = page.locator('.theme-toggle');
        if (await tbtn.count()) {
            const bg1 = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
            await tbtn.click();
            const bg2 = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
            ok('theme switch changes look', bg1 !== bg2 && await page.evaluate(() => document.documentElement.dataset.theme) === 'light');
        } else ok('theme switch exists', false);
        await ctx.close();
    }

    // ---------- 2. damaged saved data, very long text ----------
    {
        const { ctx, page } = await newPage({}, '{not json');
        ok('corrupt: starts fresh with message', (await page.innerText('#set-msg')).includes('could not be read') && await page.locator('#form').isVisible());
        await ctx.close();
    }
    {
        const long = JSON.parse(JSON.stringify(FAMILY));
        long.people[0].name = 'Aishaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
        long.docs[1].note = 'W'.repeat(300);
        long.docs[0].number = 'X'.repeat(40);
        const { ctx, page } = await newPage({ viewport: { width: 320, height: 700 } }, long);
        await page.locator('#doc-10').getByRole('button', { name: /Show the number/ }).click();
        ok('long text: no horizontal scroll at 320', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await ctx.close();
    }

    // ---------- 3. screen sizes, filled and cleared, dark and light; controls never overlap on phones ----------
    const overlapCheck = () => {
        const sel = 'input:not([type=file]):not([hidden]), select, button, a.secondary, a.back, textarea';
        const els = [...document.querySelectorAll(sel)].filter(e => e.offsetParent && e.getClientRects().length);
        const bad = [];
        for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
            const a = els[i].getBoundingClientRect(), b = els[j].getBoundingClientRect();
            if (els[i].contains(els[j]) || els[j].contains(els[i])) continue;
            if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) bad.push((els[i].id || els[i].textContent.trim().slice(0, 20)) + ' / ' + (els[j].id || els[j].textContent.trim().slice(0, 20)));
        }
        return bad;
    };
    const sticksOut = () => [...document.querySelectorAll('main *')].filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.right > innerWidth + 1 || r.left < -1); }).map(e => e.id || e.className).slice(0, 5);
    const siblingsOverlap = () => {
        const bad = [];
        document.querySelectorAll('main, .col-main, .col-side').forEach(p => {
            const kids = [...p.children].filter(e => e.offsetParent && getComputedStyle(e).display !== 'contents');
            for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
                const a = kids[i].getBoundingClientRect(), b = kids[j].getBoundingClientRect();
                if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) bad.push((kids[i].id || kids[i].className) + ' / ' + (kids[j].id || kids[j].className));
            }
        });
        return bad;
    };
    const placeholdersFit = () => [...document.querySelectorAll('input[placeholder]')].filter(i => i.offsetParent).filter(i => {
        const c = document.createElement('canvas').getContext('2d'), s = getComputedStyle(i); c.font = s.fontSize + ' ' + s.fontFamily;
        return c.measureText(i.placeholder).width > i.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight) + 1;
    }).map(i => i.id);
    for (const scheme of ['dark', 'light']) {
        for (const w of [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920]) {
            const { ctx, page } = await newPage({ viewport: { width: w, height: 900 }, colorScheme: scheme }, FAMILY);
            const tag = scheme + ' ' + w + ': ';
            ok(tag + 'filled: no horizontal scroll', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
            ok(tag + 'filled: nothing sticks out', (await page.evaluate(sticksOut)).length === 0, await page.evaluate(sticksOut));
            ok(tag + 'travel result showing', (await page.locator('#trip-out li').count()) === 5);
            if (w >= 900) for (const pos of [0, .5, 1]) {
                await page.evaluate(p => scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * p), pos);
                const o = await page.evaluate(siblingsOverlap); ok(tag + 'no overlap at scroll ' + pos, o.length === 0, o);
            }
            if (w <= 390) {
                await page.click('#open-form');
                await page.selectOption('#f-who', 'new'); await page.selectOption('#f-type', 'other'); await page.selectOption('#f-rem', 'custom');
                await page.click('#o-more');
                let o = await page.evaluate(overlapCheck); ok(tag + 'form controls do not overlap', o.length === 0, o);
                ok(tag + 'placeholders fit', (await page.evaluate(placeholdersFit)).length === 0, await page.evaluate(placeholdersFit));
                await page.selectOption('#f-expkind', 'month');
                o = await page.evaluate(overlapCheck); ok(tag + 'month mode no overlap', o.length === 0, o);
                ok(tag + 'month mode placeholders fit', (await page.evaluate(placeholdersFit)).length === 0);
                await personBox(page, 'Ali').getByRole('button', { name: 'Rename Ali' }).click();
                o = await page.evaluate(overlapCheck); ok(tag + 'rename no overlap', o.length === 0, o);
                ok(tag + 'form open: no horizontal scroll', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
            }
            // help dialog
            if ([320, 390, 820, 1280].includes(w)) {
                await page.evaluate(() => scrollTo(0, 0));
                await page.locator('.help-btn, button:has-text("Help")').first().click();
                const d = page.locator('dialog.help');
                const r = await d.boundingBox();
                ok(tag + 'help inside screen', r && r.x >= 0 && r.y >= 0 && r.x + r.width <= w && (await d.innerText()).includes('How to use Document Expiry Tracker for the Family'));
                await page.keyboard.press('Escape');
                ok(tag + 'help Escape', !(await d.evaluate(e => e.open)));
            }
            // cleared state
            await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
            await page.click('#wipe');
            ok(tag + 'cleared: no horizontal scroll', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
            if (w >= 900) { const o = await page.evaluate(siblingsOverlap); ok(tag + 'cleared: no overlap', o.length === 0, o); }
            if (SHOTS && scheme === 'dark' && (w === 1280 || w === 390)) { /* screenshots taken below from fresh pages */ }
            await ctx.close();
        }
    }

    // ---------- 4. screenshots ----------
    if (SHOTS) {
        let { ctx, page } = await newPage({ viewport: { width: 1280, height: 1200 } }, FAMILY);
        await page.screenshot({ path: path.join(__dirname, 'screenshots/desktop.png') });
        await ctx.close();
        ({ ctx, page } = await newPage({ viewport: { width: 390, height: 1500 }, deviceScaleFactor: 2 }, FAMILY));
        await page.screenshot({ path: path.join(__dirname, 'screenshots/phone.png') });
        await ctx.close();
    }

    // ---------- files ----------
    ['icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'favicon.svg', 'manifest.webmanifest', 'sw.js', '../help.js', '../theme.js', 'screenshots/desktop.png', 'screenshots/phone.png'].forEach(f => {
        ok('file exists: ' + f, fs.existsSync(path.join(__dirname, f)));
    });
    const readme = fs.readFileSync(path.join(__dirname, 'README.md'), 'utf8');
    [...readme.matchAll(/(?:!\[[^\]]*\]\(|src=")([^)"]+)/g)].forEach(m => ok('README image ' + m[1], /^https?:/.test(m[1]) || fs.existsSync(path.join(__dirname, m[1]))));
    // every file the page uses answers 200 (the manifest and service worker are fetched outside the page, so ask for them directly)
    {
        const ctx = await browser.newContext();
        for (const f of ['', 'manifest.webmanifest', 'sw.js', '../help.js', '../theme.js', 'favicon.svg', 'style.css', 'core.js', 'script.js', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png']) {
            const r = await ctx.request.get(URL + f); ok('200 for ' + (f || 'index'), r.status() === 200, r.status());
        }
        ['style.css', 'core.js', 'script.js', 'help.js', 'theme.js'].forEach(f => ok('page requested ' + f, [...requested].some(u => u.endsWith('/' + f))));
        await ctx.close();
    }
    ok('no console errors', errors.length === 0, errors);
    ok('no failed requests', failed.length === 0, failed);
    await browser.close(); if (srv) srv.close();
    console.log(pass + ' passed, ' + fail + ' failed');
    process.exitCode = fail ? 1 : 0;
})();
