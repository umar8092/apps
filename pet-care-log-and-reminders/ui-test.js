// Full page test with Playwright. Run from the repo root or this folder: node ui-test.js
//   BASE=https://umar8092.github.io/apps node ui-test.js   tests the live site
//   node ui-test.js --shots                                 also saves screenshots/desktop.png and phone.png
// "Now" is fixed to Sun 25 Oct 2026, 9:00 am Pakistan time so every answer can be checked exactly.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.resolve(__dirname, '..'), SLUG = 'pet-care-log-and-reminders', KEY = SLUG + '.state';
const SHOTS = process.argv.includes('--shots');
const NOW = new Date('2026-10-25T09:00:00+05:00');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; if (!cond) console.log('FAIL ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra).slice(0, 400) : '')); };

function serve() {
    const types = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml', png: 'image/png', webmanifest: 'application/manifest+json' };
    return new Promise(res => { const s = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0].replace(/^\/apps/, '')); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': types[f.split('.').pop()] || 'application/octet-stream' }); r.end(fs.readFileSync(f)); }).listen(0, () => res(s)); });
}

(async () => {
    let srv, base = process.env.BASE;
    if (!base) { srv = await serve(); base = 'http://localhost:' + srv.address().port + '/apps'; }
    const URL = base + '/' + SLUG + '/';
    const browser = await chromium.launch();
    const errors = [], failed = [], requested = new Set();
    async function newPage(opts, init) {
        const ctx = await browser.newContext(Object.assign({ viewport: { width: 390, height: 844 }, acceptDownloads: true, timezoneId: 'Asia/Karachi', colorScheme: 'dark', locale: 'en-US' }, opts || {}));
        await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new globalThis.URL(base).origin });
        await ctx.route(/goatcounter\.com|gc\.zgo\.at/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
        const page = await ctx.newPage();
        await page.clock.setFixedTime(NOW);
        if (init) await page.addInitScript(init);
        page.on('pageerror', e => errors.push(e.message));
        page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
        page.on('request', r => { if (r.url().startsWith(base)) requested.add(r.url()); });
        page.on('response', r => { if (r.status() >= 400 && r.url().startsWith(base)) failed.push(r.status() + ' ' + r.url()); });
        await page.goto(URL, { waitUntil: 'networkidle' });
        return { ctx, page };
    }
    const txt = (page, sel) => page.locator(sel).first().innerText();
    const petBox = (page, name) => page.locator('#pet-list li.pet', { has: page.locator('.pet-name', { hasText: new RegExp('^' + name + '$') }) });
    const careBox = (page, pet, name) => petBox(page, pet).locator('li.care', { has: page.locator('.care-name', { hasText: new RegExp('^' + name + '$') }) });
    const isOpen = (page, id) => page.locator('#' + id).evaluate(d => d.open);
    async function addPet(page, f) {
        await page.click('#add-pet');
        await page.fill('#p-name', f.name);
        if (f.kind) await page.selectOption('#p-kind', f.kind);
        if (f.meals != null) await page.selectOption('#p-meals', String(f.meals));
        if (f.bday) { await page.click('#po-bday'); await page.fill('#p-bday', f.bday); }
        if (f.note) { await page.click('#po-note'); await page.fill('#p-note', f.note); }
        await page.click('#p-save');
    }
    async function addCare(page, pet, f) {
        if (f.chip) await petBox(page, pet).locator('.chip', { hasText: f.chip }).click();
        else await petBox(page, pet).locator('button.link', { hasText: '+ Add a care reminder' }).click();
        if (f.preset) await page.selectOption('#c-preset', { label: f.preset });
        if (f.name != null) await page.fill('#c-name', f.name);
        if (f.unit) await page.selectOption('#c-unit', f.unit);
        if (f.n != null) await page.fill('#c-n', String(f.n));
        if (f.last != null) await page.fill('#c-last', f.last);
        if (f.due != null) await page.fill('#c-due', f.due);
        if (f.check) await f.check();
        await page.click('#c-save');
    }
    async function addVisit(page, f) {
        if (f.pet && f.fromBox) await petBox(page, f.pet).locator('button', { hasText: 'Add vet visit' }).click(); else await page.click('#add-visit');
        if (f.pet && !f.fromBox) await page.selectOption('#v-pet', { label: f.pet });
        if (f.date) await page.fill('#v-date', f.date);
        await page.fill('#v-what', f.what);
        if (f.cost != null) { await page.click('#vo-cost'); await page.fill('#v-cost', f.cost); }
        if (f.note) { await page.click('#vo-note'); await page.fill('#v-note', f.note); }
        await page.click('#v-save');
    }
    async function addWeight(page, pet, date, w) {
        if (!(await isOpen(page, 'd-weight'))) await petBox(page, pet).locator('button', { hasText: 'Add weight' }).click();
        await page.fill('#w-date', date); await page.fill('#w-val', w); await page.click('#w-save');
    }
    // Ayesha's two pets, used for the screenshots and the layout checks
    async function ayesha(page) {
        await addPet(page, { name: 'Milo', kind: 'Cat', meals: 2, bday: '2023-08-20', note: 'Indoor cat. Whiskas dry food, no milk.' });
        await addCare(page, 'Milo', { chip: '+ Worming', last: '2026-07-19' });
        await addCare(page, 'Milo', { preset: 'Flea treatment (every month)', last: '2026-09-29' });
        await addCare(page, 'Milo', { preset: 'Vaccine booster (every year)', last: '2026-01-12' });
        await addPet(page, { name: 'Bruno', kind: 'Dog', meals: 2 });
        await addCare(page, 'Bruno', { chip: '+ Flea and tick treatment', last: '2026-10-10' });
        await addCare(page, 'Bruno', { name: 'Nail trim', n: 4, unit: 'week', last: '2026-09-27' });
        await addWeight(page, 'Milo', '2026-08-12', '4.3'); await addWeight(page, 'Milo', '2026-09-14', '4.45'); await addWeight(page, 'Milo', '2026-10-12', '4.6'); await page.click('#d-weight [data-close]');
        await addVisit(page, { pet: 'Milo', date: '2026-10-12', what: 'Vaccines and check-up', cost: '3,500' });
        await addVisit(page, { pet: 'Bruno', date: '2026-10-03', what: 'Ear infection', cost: '9000', note: 'Ear drops twice a day for 7 days' });
        await petBox(page, 'Milo').locator('button', { hasText: 'Fed now' }).click();
    }

    // ===== 1. first use: empty, then the real situation
    {
        const { ctx, page } = await newPage();
        ok('title', (await page.title()).startsWith('Pet Care Log and Reminders'));
        ok('empty summary says what to do', /Nothing added yet\. Tap "\+ Add a pet" below/.test(await txt(page, '#sum-body')));
        ok('add pet button', (await txt(page, '#add-pet')) === '+ Add a pet');
        ok('no share tools while empty', await page.locator('#share-tools').isHidden());
        ok('visits say add a pet first', /Add a pet first/.test(await txt(page, '#totals')) && await page.locator('#add-visit').isHidden());
        ok('theme switch present', await page.locator('.theme-toggle').count() === 1);
        ok('help button present', await page.locator('.help-btn').count() === 1);
        // pet form: optional parts hidden, name needed
        await page.click('#add-pet');
        ok('pet window opens', await isOpen(page, 'd-pet'));
        ok('birthday and notes are optional (hidden)', await page.locator('#pw-bday').isHidden() && await page.locator('#pw-note').isHidden());
        ok('meals default is no logging', (await page.inputValue('#p-meals')) === '0');
        await page.click('#p-save');
        ok('pet name needed', /Type your pet's name/.test(await txt(page, '#pe-name')));
        await page.click('#po-bday'); await page.fill('#p-name', 'Milo'); await page.fill('#p-bday', '2027-01-01'); await page.click('#p-save');
        ok('future birthday refused', /cannot be in the future/.test(await txt(page, '#pe-bday')));
        await page.keyboard.press('Escape');
        ok('Escape closes the window', !(await isOpen(page, 'd-pet')));
        ok('nothing saved after cancel', await page.locator('#pet-list li').count() === 0);
        // add Milo with only a name and kind (optional inputs not forced)
        await addPet(page, { name: 'Milo', kind: 'Cat', meals: 2, bday: '2023-08-20' });
        ok('pet box', await petBox(page, 'Milo').count() === 1);
        ok('age shown', /Cat · 3 years 2 months old/.test(await petBox(page, 'Milo').locator('.pet-kind').innerText()));
        ok('added message with undo', /Added Milo\. Now add the care/.test(await txt(page, '#pet-msg')) && await page.locator('#pet-msg .undo').count() === 1);
        ok('meals line', (await petBox(page, 'Milo').locator('.feed-line').innerText()) === 'Not fed yet today (2 meals a day)');
        ok('starter chips for a cat', JSON.stringify(await petBox(page, 'Milo').locator('.chip').allInnerTexts()) === JSON.stringify(['+ Flea treatment', '+ Worming', '+ Vaccine booster']));
        ok('summary with no reminders', /No care reminders yet/.test(await txt(page, '#sum-body')));
        // worming from the chip: pre-filled, preview shows the exact answer
        await petBox(page, 'Milo').locator('.chip', { hasText: '+ Worming' }).click();
        ok('chip pre-fills the form', (await page.inputValue('#c-name')) === 'Worming' && (await page.inputValue('#c-n')) === '3' && (await page.inputValue('#c-unit')) === 'month');
        ok('care title names the pet', (await txt(page, '#dc-h')) === 'Add a care reminder for Milo');
        await page.fill('#c-last', '2026-07-19');
        ok('preview late', (await txt(page, '#c-preview')) === 'Next due now (6 days late, was due Mon 19 Oct), then every 3 months.', await txt(page, '#c-preview'));
        await page.click('#c-quick-last .chip:text-is("Not sure")');
        ok('not sure hint', /Not sure: it will show as due now/.test(await txt(page, '#ch-last')));
        await page.click('#c-quick-last .chip:text-is("A month ago")');
        ok('a month ago chip', (await page.inputValue('#c-last')) === '2026-09-25');
        await page.fill('#c-last', '2026-07-19');
        await page.click('#c-save');
        ok('worming late in box', (await careBox(page, 'Milo', 'Worming').locator('.st').innerText()) === '6 days late (was due Mon 19 Oct)');
        ok('worming sub line', (await careBox(page, 'Milo', 'Worming').locator('.box-sub').first().innerText()) === 'Repeat every 3 months · last done Sun 19 Jul (3 months ago)');
        ok('chips gone after first reminder', await petBox(page, 'Milo').locator('.quick .chip').count() === 0);
        await addCare(page, 'Milo', { preset: 'Flea treatment (every month)', last: '2026-09-29' });
        await addCare(page, 'Milo', { preset: 'Vaccine booster (every year)', last: '2026-01-12' });
        ok('flea due', (await careBox(page, 'Milo', 'Flea treatment').locator('.st').innerText()) === 'Due Thu 29 Oct (in 4 days)');
        ok('vaccine due', (await careBox(page, 'Milo', 'Vaccine booster').locator('.st').innerText()) === 'Due Tue 12 Jan 2027 (in 2 months)');
        ok('care sorted most urgent first', JSON.stringify(await petBox(page, 'Milo').locator('.care-name').allInnerTexts()) === JSON.stringify(['Worming', 'Flea treatment', 'Vaccine booster']));
        // care form errors
        await petBox(page, 'Milo').locator('button.link', { hasText: '+ Add a care reminder' }).click();
        await page.fill('#c-n', '0'); await page.fill('#c-last', '2026-11-01'); await page.click('#c-save');
        ok('care errors', /Type what needs doing/.test(await txt(page, '#ce-name')) && /whole number from 1 to 36/.test(await txt(page, '#ce-n')) && /cannot be in the future/.test(await txt(page, '#ce-last')));
        await page.fill('#c-name', 'Ear cleaning'); await page.fill('#c-n', '2.5'); await page.click('#c-save');
        ok('decimal interval refused', /whole number/.test(await txt(page, '#ce-n')));
        await page.click('#d-care [data-close]');
        // a second pet with its own schedule (custom name, weeks)
        await addPet(page, { name: 'Bruno', kind: 'Dog', meals: 2 });
        ok('dog chips', (await petBox(page, 'Bruno').locator('.chip').first().innerText()) === '+ Flea and tick treatment');
        await addCare(page, 'Bruno', { name: 'Nail trim', n: 4, unit: 'week', last: '2026-09-27' });
        ok('nail trim due today', (await careBox(page, 'Bruno', 'Nail trim').locator('.st').innerText()) === 'Due today');
        // the answer: Today
        const sum = await txt(page, '#sum-body');
        ok('today: 2 things', /2 things need doing now/.test(sum), sum);
        ok('today: worming late', /Milo: Worming, 6 days late/.test(sum));
        ok('today: nails today', /Bruno: Nail trim, due today/.test(sum));
        ok('today: next', /Next: Milo, Flea treatment, Thu 29 Oct \(in 4 days\)\./.test(sum));
        ok('today: meals', /Meals so far today: Milo none of 2, Bruno none of 2\./.test(sum));
        // meals
        await petBox(page, 'Milo').locator('button', { hasText: 'Fed now' }).click();
        ok('fed line', (await petBox(page, 'Milo').locator('.feed-line').innerText()) === 'Fed today at 9:00 am (1 of 2)');
        ok('fed message', /Saved Milo's meal at 9:00 am \(1 of 2 today\)\./.test(await txt(page, '#pet-msg')));
        await petBox(page, 'Milo').locator('button', { hasText: 'Fed now' }).click();
        ok('double tap warned', /Already fed at 9:00 am, just now: tap Undo/.test(await txt(page, '#pet-msg')));
        await page.click('#pet-msg .undo');
        ok('undo double meal', (await petBox(page, 'Milo').locator('.feed-line').innerText()) === 'Fed today at 9:00 am (1 of 2)');
        ok('summary meals after feeding', /Milo 1 of 2, Bruno none of 2/.test(await txt(page, '#sum-body')));
        // done today, undo, done again
        await careBox(page, 'Milo', 'Worming').locator('button', { hasText: 'Done today' }).click();
        ok('done: next from today', (await careBox(page, 'Milo', 'Worming').locator('.st').innerText()) === 'Due Mon 25 Jan 2027 (in 3 months)');
        ok('done message', /Milo: Worming done\. Next: Mon 25 Jan 2027 \(in 3 months\)\./.test(await txt(page, '#pet-msg')));
        ok('history shown', (await careBox(page, 'Milo', 'Worming').locator('.box-sub').nth(1).innerText()) === 'Before: Sun 19 Jul');
        await careBox(page, 'Milo', 'Worming').locator('button', { hasText: 'Done today' }).click();
        ok('already done today', /already marked done today/.test(await txt(page, '#pet-msg')));
        await careBox(page, 'Milo', 'Worming').locator('button', { hasText: 'Done today' }).click();
        await page.waitForTimeout(50);
        // undo the first done (the message from the click before 'already' has no undo, so redo via Edit test below)
        await careBox(page, 'Milo', 'Worming').locator('button', { hasText: 'Edit' }).click();
        ok('edit form filled', (await page.inputValue('#c-last')) === '2026-10-25' && (await txt(page, '#c-save')) === 'Save changes' && await page.locator('#c-edit').isVisible());
        await page.fill('#c-last', '2026-07-19'); await page.click('#c-save');
        ok('edit last date back', (await careBox(page, 'Milo', 'Worming').locator('.st').innerText()) === '6 days late (was due Mon 19 Oct)');
        await careBox(page, 'Milo', 'Worming').locator('button', { hasText: 'Done today' }).click();
        await page.click('#pet-msg .undo');
        ok('undo done', (await careBox(page, 'Milo', 'Worming').locator('.st').innerText()) === '6 days late (was due Mon 19 Oct)');
        // a one-off appointment
        await addCare(page, 'Milo', { name: 'Dental check', unit: 'once', due: '2026-11-01', check: async () => {
            ok('once hides interval and last done', await page.locator('#c-n').isHidden() && await page.locator('#c-repeat').isHidden() && await page.locator('#c-due').isVisible());
            ok('once preview', (await txt(page, '#c-preview')) === 'Appointment Sun 1 Nov (in 7 days), not repeated.', await txt(page, '#c-preview'));
        } });
        ok('appointment box', (await careBox(page, 'Milo', 'Dental check').locator('.st').innerText()) === 'Appointment Sun 1 Nov (in 7 days)');
        ok('appointment button says Done', (await careBox(page, 'Milo', 'Dental check').locator('.mini.strong').innerText()) === 'Done');
        await careBox(page, 'Milo', 'Dental check').locator('button', { hasText: 'Done' }).click();
        ok('appointment removed', await careBox(page, 'Milo', 'Dental check').count() === 0);
        ok('offer to save as visit', await page.locator('#pet-msg .undo', { hasText: 'Save it as a vet visit' }).count() === 1);
        await page.click('#pet-msg .undo:text-is("Save it as a vet visit")');
        ok('visit window prefilled', await isOpen(page, 'd-visit') && (await page.inputValue('#v-what')) === 'Dental check' && (await page.inputValue('#v-date')) === '2026-10-25' && await page.locator('#v-cost').isVisible());
        await page.fill('#v-cost', '1500'); await page.click('#v-save');
        ok('visit saved from appointment', /Saved Milo's vet visit on Sun 25 Oct, 1,500\./.test(await txt(page, '#visit-msg')));
        // a past appointment date is refused
        await addCare(page, 'Milo', { name: 'Old', unit: 'once', due: '2026-10-20' });
        ok('past appointment refused', /That date has passed/.test(await txt(page, '#ce-due')));
        await page.click('#d-care [data-close]');
        // vet visits and costs
        await addVisit(page, { pet: 'Milo', date: '2026-10-12', what: 'Vaccines and check-up', cost: '3,500' });
        await addVisit(page, { pet: 'Bruno', fromBox: true, date: '2026-10-03', what: 'Ear infection', cost: '9000' });
        await addVisit(page, { pet: 'Bruno', date: '2026-03-02', what: 'Check-up' });
        ok('totals', (await txt(page, '#totals .big')) === 'This month: 14,000 · This year: 14,000', await txt(page, '#totals'));
        ok('per pet', (await txt(page, '#totals .per')) === 'This year per pet: Milo 5,000, Bruno 9,000');
        ok('visits newest first', JSON.stringify(await page.locator('.visit-top').allInnerTexts()) === JSON.stringify(['Milo · Sun 25 Oct', 'Milo · Mon 12 Oct', 'Bruno · Sat 3 Oct', 'Bruno · Mon 2 Mar']));
        ok('last vet visit in box', /Last vet visit: Sun 25 Oct \(today\), Dental check/.test(await petBox(page, 'Milo').locator('.fact').nth(1).innerText()));
        await page.selectOption('#s-cur', 'Rs');
        ok('currency symbol', (await txt(page, '#totals .big')) === 'This month: Rs 14,000 · This year: Rs 14,000');
        await page.click('#add-visit');
        ok('cost is optional (hidden)', await page.locator('#v-cost').isHidden());
        await page.fill('#v-date', '2026-10-30'); await page.fill('#v-what', '  '); await page.click('#vo-cost'); await page.fill('#v-cost', '12.345'); await page.click('#v-save');
        ok('visit errors', /still to come/.test(await txt(page, '#ve-date')) && /Type what the visit was for/.test(await txt(page, '#ve-what')) && /Type the cost as a number/.test(await txt(page, '#ve-cost')));
        ok('cost label shows currency', (await txt(page, '#vl-cost')) === 'Cost (Rs)');
        await page.click('#d-visit [data-close]');
        await page.locator('li.visit', { hasText: 'Bruno · Mon 2 Mar' }).locator('button', { hasText: 'Edit' }).click();
        await page.click('#v-del');
        ok('visit deleted', await page.locator('li.visit', { hasText: 'Mon 2 Mar' }).count() === 0);
        await page.click('#visit-msg .undo');
        ok('visit delete undone', await page.locator('li.visit', { hasText: 'Mon 2 Mar' }).count() === 1);
        // weight
        await addWeight(page, 'Milo', '2026-08-12', '4.3');
        await addWeight(page, 'Milo', '2026-10-25', '4,6');
        ok('weight message', /Saved Milo's weight: 4\.6 kg on Sun 25 Oct \(up 0\.3 kg since Wed 12 Aug\)\./.test(await txt(page, '#w-msg')), await txt(page, '#w-msg'));
        ok('weights listed newest first', JSON.stringify(await page.locator('#w-list span').allInnerTexts()) === JSON.stringify(['Sun 25 Oct: 4.6 kg', 'Wed 12 Aug: 4.3 kg']));
        await page.fill('#w-val', '0'); await page.click('#w-save');
        ok('zero weight refused', /more than 0/.test(await txt(page, '#we-val')));
        await page.fill('#w-val', '400'); await page.click('#w-save');
        ok('huge weight refused', /more than 150 kg/.test(await txt(page, '#we-val')));
        await page.locator('#w-list li', { hasText: 'Wed 12 Aug' }).locator('button').click();
        ok('weight removed', await page.locator('#w-list li').count() === 1 && await isOpen(page, 'd-weight'));
        await page.click('#w-msg .undo');
        ok('weight remove undone', await page.locator('#w-list li').count() === 2);
        await page.click('#d-weight [data-close]');
        ok('weight line in box', (await petBox(page, 'Milo').locator('.fact p').first().innerText()) === 'Weight: 4.6 kg on Sun 25 Oct (up 0.3 kg since Wed 12 Aug)');
        ok('weight chart', await petBox(page, 'Milo').locator('svg.spark polyline').count() === 1);
        await page.selectOption('#s-wunit', 'lb');
        ok('weight in lb', (await petBox(page, 'Milo').locator('.fact p').first().innerText()) === 'Weight: 10.1 lb on Sun 25 Oct (up 0.66 lb since Wed 12 Aug)', await petBox(page, 'Milo').locator('.fact p').first().innerText());
        await page.selectOption('#s-wunit', 'kg');
        // care sheet: copy and email
        await petBox(page, 'Milo').locator('button', { hasText: 'Copy care sheet' }).click();
        await page.waitForTimeout(100);
        const clip = await page.evaluate(() => navigator.clipboard.readText());
        ok('care sheet copied', clip.startsWith('Milo (Cat)\nBorn Sun 20 Aug 2023, 3 years 2 months old\nMeals: 2 meals a day\nWeight: 4.6 kg') && clip.includes('- Worming: 6 days late (was due Mon 19 Oct), every 3 months, last done Sun 19 Jul 2026') && clip.includes('Rs 3,500'), clip);
        const mail = await petBox(page, 'Milo').locator('a', { hasText: 'Email care sheet' }).getAttribute('href');
        ok('email link without recipient', mail.startsWith('mailto:?subject=Milo%3A%20pet%20care%20sheet&body=Milo%20(Cat)'));
        // calendar file
        const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#cal')]);
        const ics = fs.readFileSync(await dl.path(), 'utf8');
        ok('calendar file', dl.suggestedFilename() === 'pet-care-reminders.ics' && (ics.match(/BEGIN:VEVENT/g) || []).length === 4 && ics.includes('SUMMARY:Bruno: Nail trim'));
        ok('calendar message', /Saved a calendar file with 4 reminders/.test(await txt(page, '#set-msg')));
        // duplicate pet name, very long pasted text
        await page.click('#add-pet'); await page.fill('#p-name', 'milo');
        ok('duplicate name warned live', /already have a pet with this name/.test(await txt(page, '#p-warn')));
        await page.fill('#p-name', 'A'.repeat(60));
        ok('long name capped by the box', (await page.inputValue('#p-name')).length === 40);
        await page.click('#d-pet [data-close]');
        // edit pet: meals off, note
        await petBox(page, 'Bruno').locator('button', { hasText: 'Edit pet' }).click();
        ok('edit pet form', (await page.inputValue('#p-name')) === 'Bruno' && (await txt(page, '#p-save')) === 'Save changes' && await page.locator('#p-edit').isVisible());
        await page.selectOption('#p-meals', '0'); await page.click('#po-note'); await page.fill('#p-note', 'Vet: Dr Khan 0300 1234567\nAllergic to chicken'); await page.click('#p-save');
        ok('meals off hides feeding', await petBox(page, 'Bruno').locator('.feed').count() === 0);
        ok('note shown as text', (await petBox(page, 'Bruno').locator('.pet-note').innerText()).includes('Allergic to chicken'));
        // archive and bring back
        await petBox(page, 'Bruno').locator('button', { hasText: 'Edit pet' }).click(); await page.click('#p-archive');
        ok('archived', await petBox(page, 'Bruno').count() === 0 && (await txt(page, '#archived-sum')) === 'Archived pets (1)');
        ok('archived pet not in today', !/Bruno/.test(await txt(page, '#sum-body')));
        await page.click('#archived-sum');
        await page.locator('#arch-list button', { hasText: 'Bring back' }).click();
        ok('brought back', await petBox(page, 'Bruno').count() === 1 && await page.locator('#archived').isHidden());
        // delete a reminder and a pet, with undo
        await careBox(page, 'Milo', 'Vaccine booster').locator('button', { hasText: 'Edit' }).click(); await page.click('#c-del');
        ok('reminder deleted', await careBox(page, 'Milo', 'Vaccine booster').count() === 0);
        await page.click('#pet-msg .undo');
        ok('reminder delete undone', await careBox(page, 'Milo', 'Vaccine booster').count() === 1);
        await petBox(page, 'Bruno').locator('button', { hasText: 'Edit pet' }).click(); await page.click('#p-del');
        ok('pet deleted with its visits', await petBox(page, 'Bruno').count() === 0 && await page.locator('li.visit', { hasText: 'Bruno' }).count() === 0);
        await page.click('#pet-msg .undo');
        ok('pet delete undone', await petBox(page, 'Bruno').count() === 1 && await page.locator('li.visit', { hasText: 'Bruno' }).count() === 2);
        // reload keeps everything
        await page.reload({ waitUntil: 'networkidle' });
        ok('reload keeps pets and care', await petBox(page, 'Milo').count() === 1 && (await careBox(page, 'Milo', 'Worming').locator('.st').innerText()) === '6 days late (was due Mon 19 Oct)');
        ok('reload keeps meals and settings', (await petBox(page, 'Milo').locator('.feed-line').innerText()) === 'Fed today at 9:00 am (1 of 2)' && (await page.inputValue('#s-cur')) === 'Rs');
        // backup, delete everything, undo, restore
        const [bk] = await Promise.all([page.waitForEvent('download'), page.click('#backup')]);
        const bkPath = path.join(os.tmpdir(), 'pet-backup-test.json'); fs.copyFileSync(await bk.path(), bkPath);
        ok('backup file', bk.suggestedFilename() === 'pet-care-backup-2026-10-25.json' && JSON.parse(fs.readFileSync(bkPath, 'utf8')).pets.length === 2);
        await page.click('#wipe');
        ok('wiped', await page.locator('#pet-list li').count() === 0 && /Nothing added yet/.test(await txt(page, '#sum-body')));
        await page.click('#set-msg .undo');
        ok('wipe undone', await page.locator('#pet-list > li').count() === 2);
        await page.click('#wipe');
        await page.setInputFiles('#restore-file', bkPath);
        await page.waitForTimeout(200);
        ok('restored', await page.locator('#pet-list > li').count() === 2 && /Restored 2 pets/.test(await txt(page, '#set-msg')));
        const badPath = path.join(os.tmpdir(), 'pet-bad.json'); fs.writeFileSync(badPath, '{"hello":1}');
        await page.setInputFiles('#restore-file', badPath); await page.waitForTimeout(200);
        ok('bad backup refused', /not a backup from this app/.test(await txt(page, '#set-msg')) && await page.locator('#pet-list > li').count() === 2);
        // next day: meals reset, dates move on
        await page.clock.setFixedTime(new Date('2026-10-26T07:00:00+05:00'));
        await page.reload({ waitUntil: 'networkidle' });
        ok('next day: meals reset', (await petBox(page, 'Milo').locator('.feed-line').innerText()) === 'Not fed yet today (2 meals a day)');
        ok('next day: one more day late', (await careBox(page, 'Milo', 'Worming').locator('.st').innerText()) === '7 days late (was due Mon 19 Oct)');
        await ctx.close();
    }

    // ===== 2. corrupt and blocked storage
    {
        const { ctx, page } = await newPage({}, `try { localStorage.setItem('${KEY}', '{"pets":[{"id":1,"name":"Milo","kind":"Cat"}],"care":"bad","visits":[{"id":2,"pet":1,"date":"x"}]}'); } catch (e) {}`);
        ok('partly damaged data keeps what is good', await petBox(page, 'Milo').count() === 1 && await page.locator('li.visit').count() === 0);
        await ctx.close();
        const b = await newPage({}, `localStorage.setItem('${KEY}', '{not json');`);
        ok('corrupt data starts fresh with a message', await b.page.locator('#pet-list li').count() === 0 && /could not be read/.test(await txt(b.page, '#set-msg')));
        await b.ctx.close();
        const c = await newPage({}, `Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } });`);
        ok('blocked storage warns', await c.page.locator('#storage-warn').isVisible());
        await addPet(c.page, { name: 'Milo' });
        ok('still works without saving', await petBox(c.page, 'Milo').count() === 1);
        await c.ctx.close();
    }

    // ===== 3. layout with real data at every width, dark and light, plus windows on phones
    for (const scheme of ['dark', 'light']) {
        const { ctx, page } = await newPage({ colorScheme: scheme, viewport: { width: 1280, height: 900 } });
        await ayesha(page);
        for (const w of [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920]) {
            await page.setViewportSize({ width: w, height: 900 });
            await page.waitForTimeout(60);
            const tag = scheme + ' ' + w + ': ';
            ok(tag + 'no horizontal scroll', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
            const out = await page.evaluate(() => [...document.querySelectorAll('main *')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1); }).slice(0, 3).map(e => e.tagName + '.' + e.className));
            ok(tag + 'nothing sticks out', !out.length, out);
            for (const pos of [0, 0.5, 1]) {
                await page.evaluate(p => scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * p), pos);
                const bad = await page.evaluate(() => { const r = []; document.querySelectorAll('main, .app, .col-main, .col-side, .pet, .pet-list, .care-list').forEach(h => { const k = [...h.children].filter(c => c.getBoundingClientRect().height > 2 && getComputedStyle(c).display !== 'none'); for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { const a = k[i].getBoundingClientRect(), b = k[j].getBoundingClientRect(); if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2) r.push(k[i].className + '/' + k[j].className); } }); return r.slice(0, 3); });
                ok(tag + 'no overlap at ' + pos, !bad.length, bad);
            }
            if (w <= 390) {
                const ov = await page.evaluate(() => { const k = [...document.querySelectorAll('main input, main select, main button, main a.mini')].filter(e => e.getBoundingClientRect().width > 0); const r = []; for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { const a = k[i].getBoundingClientRect(), b = k[j].getBoundingClientRect(); if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2) r.push((k[i].textContent || k[i].id) + '/' + (k[j].textContent || k[j].id)); } return r.slice(0, 3); });
                ok(tag + 'controls do not overlap', !ov.length, ov);
                // every window with every optional field open
                for (const open of [
                    async () => { await page.click('#add-pet'); await page.click('#po-bday'); await page.click('#po-note'); return 'd-pet'; },
                    async () => { await petBox(page, 'Milo').locator('.care').first().locator('button', { hasText: 'Edit' }).click(); await page.click('#co-note'); return 'd-care'; },
                    async () => { await petBox(page, 'Milo').locator('.care').first().locator('button', { hasText: 'Edit' }).click(); await page.selectOption('#c-unit', 'once'); return 'd-care'; },
                    async () => { await page.click('#add-visit'); await page.click('#vo-cost'); await page.click('#vo-note'); return 'd-visit'; },
                    async () => { await petBox(page, 'Milo').locator('button', { hasText: 'Add weight' }).click(); return 'd-weight'; }]) {
                    await page.evaluate(() => scrollTo(0, 0));
                    const id = await open();
                    const r = await page.evaluate(id => { const d = document.getElementById(id), dr = d.getBoundingClientRect(); const k = [...d.querySelectorAll('input:not([type=hidden]), select, button, textarea')].filter(e => e.getBoundingClientRect().width > 0); const bad = []; for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { const a = k[i].getBoundingClientRect(), b = k[j].getBoundingClientRect(); if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2) bad.push(k[i].id + '/' + k[j].id); } const outside = k.filter(e => { const b = e.getBoundingClientRect(); return b.right > dr.right + 1 || b.left < dr.left - 1; }).map(e => e.id); const ph = [...d.querySelectorAll('input[placeholder]')].filter(e => e.getBoundingClientRect().width > 0).filter(e => { const c = document.createElement('canvas').getContext('2d'); const cs = getComputedStyle(e); c.font = cs.fontSize + ' ' + cs.fontFamily; return c.measureText(e.placeholder).width > e.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight); }).map(e => e.id); return { bad, outside, ph, fits: dr.left >= 0 && dr.right <= innerWidth }; }, id);
                    ok(tag + id + ' window fits', r.fits && !r.outside.length, r);
                    ok(tag + id + ' controls do not overlap', !r.bad.length, r.bad);
                    ok(tag + id + ' placeholders fit', !r.ph.length, r.ph);
                    await page.keyboard.press('Escape');
                }
            }
        }
        // desktop uses its width: two columns side by side
        await page.setViewportSize({ width: 1280, height: 900 });
        const cols = await page.evaluate(() => [document.querySelector('.col-main').getBoundingClientRect(), document.querySelector('.col-side').getBoundingClientRect()].map(r => [Math.round(r.left), Math.round(r.width)]));
        ok(scheme + ' desktop two columns', cols[1][0] > cols[0][0] + cols[0][1] - 1 && cols[0][1] > 500, cols);
        if (SHOTS && scheme === 'dark') {
            await page.evaluate(() => { document.querySelectorAll('.msg').forEach(m => { m.textContent = ''; m.classList.remove('show'); }); scrollTo(0, 0); });
            await page.screenshot({ path: path.join(__dirname, 'screenshots/desktop.png'), fullPage: false });
        }
        await ctx.close();
    }
    if (SHOTS) {
        const { ctx, page } = await newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
        await ayesha(page);
        await page.evaluate(() => { document.querySelectorAll('.msg').forEach(m => { m.textContent = ''; m.classList.remove('show'); }); scrollTo(0, 0); });
        await page.screenshot({ path: path.join(__dirname, 'screenshots/phone.png'), clip: { x: 0, y: 0, width: 390, height: 1300 }, fullPage: true });
        await ctx.close();
    }

    // ===== 4. light/dark switch
    {
        const { ctx, page } = await newPage({ colorScheme: 'dark' });
        const bg = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim());
        const before = await bg();
        await page.click('.theme-toggle');
        ok('theme switch changes colours', (await bg()) !== before);
        await ctx.close();
    }

    // ===== files the page uses
    {
        const { ctx, page } = await newPage();
        for (const f of ['sw.js', 'favicon.svg', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'screenshots/desktop.png', 'screenshots/phone.png', '../help.js', '../theme.js', 'test.html']) {
            const r = await page.request.get(URL + f); ok('file ' + f + ' is 200', r.status() === 200, r.status());
        }
        await page.goto(URL + 'test.html'); await page.waitForTimeout(300);
        ok('logic checks in the browser', / 0 failed/.test(await page.locator('pre').innerText()), await page.locator('pre').innerText());
        await ctx.close();
    }
    ok('no console errors', !errors.length, errors);
    ok('no failed requests', !failed.length, failed);
    await browser.close(); if (srv) srv.close();
    console.log((fail ? 'FAILED ' : 'ALL PASSED ') + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})();
