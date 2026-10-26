// Full page test with Playwright. Run from the repo root or this folder: node ui-test.js
//   BASE=https://umar8092.github.io/apps node ui-test.js   tests the live site
//   node ui-test.js --shots                                 also saves screenshots/desktop.png and phone.png
// "Now" is fixed to Mon 26 Oct 2026, 3:30 pm Pakistan time so every answer can be checked exactly.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), SLUG = 'doctor-visit-notes-and-questions-for-the-family', KEY = SLUG + '.state';
const SHOTS = process.argv.includes('--shots');
const NOW = new Date('2026-10-26T15:30:00+05:00');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; if (!cond) console.log('FAIL ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra).slice(0, 500) : '')); };

function serve() {
    const types = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml', png: 'image/png', webmanifest: 'application/manifest+json' };
    return new Promise(res => { const s = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0].replace(/^\/apps/, '')); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': types[f.split('.').pop()] || 'application/octet-stream' }); r.end(fs.readFileSync(f)); }).listen(0, () => res(s)); });
}

// the saved state of the main situation, for layout and screenshot runs
const DEMO = { v: 1, nextId: 60,
    people: [{ id: 1, name: 'Abbu', note: 'Diabetic. Allergic to penicillin.' }, { id: 2, name: 'Ammi', note: '' }, { id: 3, name: 'Ali (son, 6)', note: '' }],
    visits: [
        { id: 10, person: 1, date: '2026-09-15', doctor: 'Dr Khan (heart)', reason: 'Chest tightness on stairs', said: 'BP is high. Start two tablets. Less salt.', tests: '', meds: [{ act: 'start', name: 'Amlodipine', dose: '5 mg once a day' }, { act: 'start', name: 'Aspirin', dose: '75 mg after lunch' }] },
        { id: 11, person: 1, date: '2026-10-02', doctor: 'Dr Sana (eyes)', reason: 'Blurry left eye', said: 'Cataract starting in the left eye. Not ready for surgery. Check again in 6 months.', tests: '', meds: [] },
        { id: 12, person: 1, date: '2026-10-21', doctor: 'Dr Khan (heart)', reason: '', said: 'Swelling in the feet is from amlodipine. Lower the dose. Stop aspirin, start a cholesterol tablet.', tests: 'ECG and kidney test, fasting', meds: [{ act: 'change', name: 'Amlodipine', dose: '2.5 mg once a day' }, { act: 'stop', name: 'Aspirin', dose: '' }, { act: 'start', name: 'Atorvastatin', dose: '10 mg at night' }] },
        { id: 13, person: 2, date: '2026-07-10', doctor: 'Dr Farah (thyroid)', reason: '', said: 'Thyroid low. Take the tablet before breakfast on an empty stomach.', tests: 'TSH in 3 months', meds: [{ act: 'start', name: 'Levothyroxine', dose: '50 mcg before breakfast' }] },
        { id: 14, person: 3, date: '2026-10-20', doctor: 'Dr Rubina (children)', reason: 'Ear pain and fever', said: 'Ear infection. Finish the full course. Come back if the fever lasts more than 3 days.', tests: '', meds: [{ act: 'start', name: 'Amoxicillin syrup', dose: '5 ml three times a day for 7 days' }] }],
    appts: [
        { id: 20, person: 1, date: '2026-11-04', time: '10:30', doctor: 'Dr Khan (heart)', note: '', fromVisit: 12, done: 0 },
        { id: 21, person: 2, date: '2026-10-23', time: '', doctor: 'Dr Farah (thyroid)', note: 'Take the TSH report', fromVisit: 0, done: 0 },
        { id: 22, person: 3, date: '2026-10-28', time: '17:00', doctor: 'Dr Rubina (children)', note: '', fromVisit: 14, done: 0 }],
    questions: [
        { id: 30, person: 1, text: 'Is the swelling in his feet from the new tablet?', added: '2026-10-15', asked: '2026-10-21', visit: 12 },
        { id: 31, person: 1, text: 'Can he fast in Ramadan with these tablets?', added: '2026-10-22', asked: '', visit: 0 },
        { id: 32, person: 1, text: 'Is it safe to walk 30 minutes a day?', added: '2026-10-22', asked: '', visit: 0 },
        { id: 33, person: 1, text: 'Should the ECG be repeated?', added: '2026-10-24', asked: '', visit: 0 },
        { id: 34, person: 2, text: 'Should the thyroid dose change?', added: '2026-10-01', asked: '', visit: 0 }] };

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
    const seed = st => `try { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(${JSON.stringify(KEY)}, ${JSON.stringify(typeof st === 'string' ? st : JSON.stringify(st))}); sessionStorage.setItem('seeded', '1'); } } catch (e) {}`;
    const box = (page, name) => page.locator('#person-list li.person', { has: page.locator('.p-name', { hasText: new RegExp('^' + name.replace(/[()]/g, '\\$&') + '$') }) });
    const boxText = async (page, name) => (await box(page, name).innerText()).replace(/\s+/g, ' ');
    const msg = page => page.locator('#person-msg').innerText();
    const isOpen = (page, id) => page.locator('#' + id).evaluate(d => d.open);
    const saved = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
    const undo = page => page.locator('#person-msg .undo').click();
    let ctx, page, t, s;

    // ---------- 1. first use, adding people ----------
    ({ ctx, page } = await newPage());
    ok('empty: coming up explains what to do', (await page.locator('#up-body').innerText()).startsWith('Add the first person below'));
    ok('empty: no person boxes', await page.locator('#person-list li').count() === 0);
    await page.click('#add-person');
    ok('person window opens', await isOpen(page, 'd-person'));
    ok('person: health notes hidden behind a button', await page.locator('#pw-note').isHidden() && await page.locator('#po-note').isVisible());
    await page.click('#p-save');
    ok('person: blank name refused', (await page.locator('#pe-name').innerText()).startsWith('Type a name'));
    await page.fill('#p-name', 'Abbu'); await page.click('#po-note'); await page.fill('#p-note', 'Diabetic.\nAllergic to penicillin.');
    await page.click('#p-save');
    ok('person added', await box(page, 'Abbu').count() === 1 && !(await isOpen(page, 'd-person')));
    t = await boxText(page, 'Abbu');
    ok('person box: note and empty parts', t.includes('Diabetic. Allergic to penicillin.') && t.includes('None booked.') && t.includes('No visits written down yet.') && t.includes('None written down yet.'), t);
    ok('coming up: none booked line', (await page.locator('#up-body').innerText()).startsWith('No appointments booked.'));
    ok('add button says another', (await page.locator('#add-person').innerText()) === '+ Add another person');
    await page.click('#add-person'); await page.fill('#p-name', ' abbu '); await page.click('#p-save');
    ok('person: same name refused', (await page.locator('#pe-name').innerText()).includes('already in your list'));
    await page.fill('#p-name', 'Ali'); await page.click('#p-save');
    ok('second person, own box', await page.locator('#person-list li.person').count() === 2);

    // ---------- 2. questions ----------
    const qIn = box(page, 'Abbu').locator('.q-input');
    await qIn.fill('   '); await box(page, 'Abbu').locator('.q-form button').click();
    ok('blank question: a message, nothing added', (await msg(page)).startsWith('Type a question first') && (await saved(page)).questions.length === 0);
    await qIn.fill('Is the swelling from the new tablet?\n- Can he fast in Ramadan?\n2) Is walking safe?');
    await box(page, 'Abbu').locator('.q-form button').click();
    ok('pasted list: 3 questions', (await msg(page)).startsWith('Added 3 questions for Abbu.') && await box(page, 'Abbu').locator('.q-list li').count() === 3, await msg(page));
    ok('question input keeps the focus after adding', await page.evaluate(() => document.activeElement && document.activeElement.classList.contains('q-input')));
    await page.keyboard.type('can he fast in ramadan?'); await page.keyboard.press('Enter');
    ok('Enter adds; duplicate question skipped', (await msg(page)).includes('already in Abbu') && await box(page, 'Abbu').locator('.q-list li').count() === 3, await msg(page));
    ok('questions heading has the count', (await boxText(page, 'Abbu')).includes('Questions for next time (3)'));
    ok('Ali has no questions (each person their own)', !(await boxText(page, 'Ali')).includes('Questions for next time ('));

    // ---------- 3. an appointment ----------
    await box(page, 'Abbu').locator('button', { hasText: '+ Add an appointment' }).click();
    ok('appointment window, person preset', await isOpen(page, 'd-appt') && (await page.locator('#a-person option:checked').innerText()) === 'Abbu');
    ok('appointment: note optional, hidden', await page.locator('#aw-note').isHidden());
    await page.click('#a-save');
    ok('appointment: doctor and date needed', (await page.locator('#ae-doctor').innerText()) !== '' && (await page.locator('#ae-date').innerText()) !== '' && (await page.locator('#ae-time').innerText()) === '');
    await page.fill('#a-doctor', 'Dr Khan (heart)');
    await page.click('#a-quick .chip[data-d="7"]');
    ok('In 1 week chip', (await page.inputValue('#a-date')) === '2026-11-02');
    await page.fill('#a-date', '2026-11-04'); await page.fill('#a-time', '10:30');
    await page.click('#a-save');
    t = await page.locator('#up-body').innerText();
    ok('coming up: the exact answer', t.includes('Abbu: Dr Khan (heart), Wed 4 Nov at 10:30 am (in 9 days). 3 questions to ask.'), t);
    ok('message confirms the appointment', (await msg(page)).startsWith('Added Abbu\'s appointment: Dr Khan (heart), Wed 4 Nov at 10:30 am (in 9 days).'), await msg(page));
    ok('box shows the next visit', (await boxText(page, 'Abbu')).includes('Next visit Dr Khan (heart), Wed 4 Nov at 10:30 am (in 9 days).'));
    // calendar file
    let [dl] = await Promise.all([page.waitForEvent('download'), box(page, 'Abbu').locator('.appt button', { hasText: 'Calendar' }).click()]);
    let ics = fs.readFileSync(await dl.path(), 'utf8');
    ok('calendar file for the appointment', dl.suggestedFilename() === 'abbu-dr-khan-heart-2026-11-04.ics' && ics.includes('DTSTART:20261104T103000') && ics.includes('SUMMARY:Abbu: Dr Khan (heart)') && ics.replace(/\r\n /g, '').includes('Can he fast in Ramadan?'), dl.suggestedFilename());
    ok('no notes button for a future appointment', await box(page, 'Abbu').locator('.appt button', { hasText: 'Add notes from this visit' }).count() === 0);

    // ---------- 4. visit notes for an earlier visit, medicines ----------
    await box(page, 'Abbu').locator('button', { hasText: '+ Add visit notes' }).click();
    ok('visit window: today by default, person preset', await isOpen(page, 'd-visit') && (await page.inputValue('#v-date')) === '2026-10-26' && (await page.locator('#v-person option:checked').innerText()) === 'Abbu');
    ok('visit: optional parts hidden', await page.locator('#vw-reason').isHidden() && await page.locator('#vw-tests').isHidden() && await page.locator('#vw-next').isHidden() && await page.locator('#v-meds li').count() === 0);
    ok('visit: open questions to tick', await page.locator('#v-asked input').count() === 3);
    await page.fill('#v-date', '2026-10-27'); await page.fill('#v-doctor', ''); await page.click('#v-save');
    ok('visit: future date refused, points to appointments', (await page.locator('#ve-date').innerText()).includes('Add an appointment') && (await page.locator('#ve-doctor').innerText()) !== '');
    await page.fill('#v-date', '2026-09-15'); await page.fill('#v-doctor', 'Dr Khan (heart)');
    await page.fill('#v-said', 'BP is high.\r\nLess salt.');
    await page.click('#v-add-med');
    ok('medicine row has its own box and the focus', await page.locator('#v-meds li.med-row').count() === 1 && await page.evaluate(() => document.activeElement.classList.contains('m-name')));
    await page.locator('#v-meds .m-name').nth(0).fill('Amlodipine'); await page.locator('#v-meds .m-dose').nth(0).fill('5 mg once a day');
    await page.click('#v-add-med');
    ok('add button says another', (await page.locator('#v-add-med').innerText()) === '+ Add another medicine change');
    await page.locator('#v-meds .m-dose').nth(1).fill('75 mg');
    await page.click('#v-save');
    ok('medicine with a dose but no name refused', (await page.locator('#v-meds .err').nth(1).innerText()).includes('medicine\'s name'));
    await page.locator('#v-meds .m-name').nth(1).fill('Aspirin');
    await page.click('#v-save');
    ok('visit saved', !(await isOpen(page, 'd-visit')) && (await msg(page)).startsWith('Saved Abbu\'s visit to Dr Khan (heart).'), await msg(page));
    ok('old visit does not close the 4 Nov appointment', (await page.locator('#up-body').innerText()).includes('Wed 4 Nov'));
    t = await boxText(page, 'Abbu');
    ok('medicines now listed', t.includes('Amlodipine 5 mg once a day Started Tue 15 Sep, Dr Khan (heart)') && t.includes('Aspirin 75 mg Started Tue 15 Sep'), t);
    ok('last visit line', t.includes('Last visit Tue 15 Sep (41 days ago), Dr Khan (heart): BP is high. Less salt.'), t);
    // undo the save
    await undo(page);
    ok('undo the visit', (await saved(page)).visits.length === 0 && (await boxText(page, 'Abbu')).includes('No visits written down yet.'));
    // again, then a follow-up with changes
    await box(page, 'Abbu').locator('button', { hasText: '+ Add visit notes' }).click();
    await page.fill('#v-date', '2026-09-15'); await page.fill('#v-doctor', 'Dr Khan (heart)');
    await page.click('#v-add-med'); await page.locator('.m-name').nth(0).fill('Amlodipine'); await page.locator('.m-dose').nth(0).fill('5 mg once a day');
    await page.click('#v-add-med'); await page.locator('.m-name').nth(1).fill('Aspirin'); await page.locator('.m-dose').nth(1).fill('75 mg');
    await page.click('#v-save');
    await box(page, 'Abbu').locator('button', { hasText: '+ Add visit notes' }).click();
    await page.click('#v-quick .chip[data-ago="1"]');
    ok('Yesterday chip', (await page.inputValue('#v-date')) === '2026-10-25');
    await page.fill('#v-doctor', 'Dr Khan (heart)');
    ok('doctor suggestions from earlier visits', (await page.locator('#doc-list option').first().getAttribute('value')) === 'Dr Khan (heart)');
    await page.fill('#v-said', 'Feet swelling from amlodipine.');
    await page.click('#v-add-med'); await page.locator('.m-act').nth(0).selectOption('change'); await page.locator('.m-name').nth(0).fill('amlodipine'); await page.locator('.m-dose').nth(0).fill('2.5 mg once a day');
    await page.click('#v-add-med'); await page.locator('.m-act').nth(1).selectOption('stop');
    ok('Stopped hides the dose', await page.locator('.med-row').nth(1).locator('.m-dose').isHidden());
    await page.locator('.m-name').nth(1).fill('Aspirin');
    await page.click('#v-add-med'); await page.locator('.m-name').nth(2).fill('Atorvastatin');
    await page.locator('.med-row').nth(2).locator('.rm').click();
    ok('Remove this medicine', await page.locator('.med-row').count() === 2);
    await page.locator('#v-asked input').first().check();
    await page.click('#vo-tests'); await page.fill('#v-tests', 'ECG');
    await page.click('#vo-next'); await page.click('#v-quick-next .chip[data-m="1"]');
    ok('In 1 month from the visit date', (await page.inputValue('#v-next')) === '2026-11-25');
    await page.click('#v-next-clear');
    ok('Remove the next visit hides it again', await page.locator('#vw-next').isHidden() && (await page.inputValue('#v-next')) === '');
    await page.click('#v-save');
    ok('an earlier visit 10 days before does not close the 4 Nov appointment', (await page.locator('#up-body').innerText()).includes('Wed 4 Nov'), await page.locator('#up-body').innerText());
    t = await boxText(page, 'Abbu');
    ok('medicines now after the changes', t.includes('amlodipine 2.5 mg once a day Dose changed Sun 25 Oct') && !t.includes('Aspirin 75'), t);
    ok('asked question moved', t.includes('Questions for next time (2)') && t.includes('Asked before (1)'), t);
    ok('question count in the coming up line', (await page.locator('#up-body').innerText()).includes('2 questions to ask.'));

    // ---------- 5. Mark asked, Ask again, delete a question ----------
    await box(page, 'Abbu').locator('.q-list li', { hasText: 'Is walking safe?' }).locator('button', { hasText: 'Mark asked' }).click();
    ok('Mark asked', (await boxText(page, 'Abbu')).includes('Questions for next time (1)') && (await msg(page)).startsWith('Marked as asked.'));
    await undo(page);
    ok('undo Mark asked', (await boxText(page, 'Abbu')).includes('Questions for next time (2)'));
    await box(page, 'Abbu').locator('summary', { hasText: 'Asked before' }).click();
    t = await box(page, 'Abbu').locator('.sub-list').innerText();
    ok('asked before shows the date', t.includes('Is the swelling from the new tablet? (asked Sun 25 Oct)'), t);
    await box(page, 'Abbu').locator('.sub-list button', { hasText: 'Ask again' }).click();
    ok('Ask again brings it back', (await boxText(page, 'Abbu')).includes('Questions for next time (3)'));
    await undo(page);
    ok('Asked before stays open after redraw', await box(page, 'Abbu').locator('.sub-list').evaluate(d => d.open));
    await box(page, 'Abbu').locator('.q-list li', { hasText: 'Is walking safe?' }).locator('button', { hasText: 'Delete' }).click();
    ok('delete a question', (await boxText(page, 'Abbu')).includes('Questions for next time (1)'));
    await undo(page);
    ok('undo delete question', (await boxText(page, 'Abbu')).includes('Questions for next time (2)'));

    // ---------- 6. writing up an appointment from Coming up ----------
    await box(page, 'Abbu').locator('.appt button', { hasText: 'Edit' }).click();
    await page.fill('#a-date', '2026-10-26'); await page.click('#a-save');
    t = await page.locator('#up-body').innerText();
    ok('moved to today', t.includes('Dr Khan (heart), Mon 26 Oct at 10:30 am (today).'), t);
    await page.locator('#up-body button', { hasText: 'Add notes' }).click();
    ok('notes window for the appointment', (await page.locator('#v-for').innerText()) === 'For the appointment with Dr Khan (heart) on Mon 26 Oct.' && (await page.inputValue('#v-doctor')) === 'Dr Khan (heart)' && (await page.inputValue('#v-date')) === '2026-10-26');
    await page.locator('#v-asked label', { hasText: 'Can he fast in Ramadan?' }).locator('input').check();
    await page.fill('#v-said', 'Fasting is fine if sugar is checked.');
    await page.click('#vo-next'); await page.click('#v-quick-next .chip[data-m="3"]'); await page.fill('#v-next-time', '09:15');
    await page.click('#v-save');
    t = await msg(page);
    ok('saving closes the appointment and books the next', t.includes('The appointment on Mon 26 Oct is done.') && t.includes('Next visit: Tue 26 Jan 2027 at 9:15 am.'), t);
    t = await page.locator('#up-body').innerText();
    ok('coming up now shows the next one', t.includes('Abbu: Dr Khan (heart), Tue 26 Jan 2027 at 9:15 am (in 3 months). 1 question to ask.') && !t.includes('Mon 26 Oct'), t);
    s = await saved(page);
    ok('the asked question is linked to the visit', s.questions.find(q => q.text === 'Can he fast in Ramadan?').asked === '2026-10-26');

    // ---------- 7. edit and delete a visit ----------
    await box(page, 'Abbu').locator('summary', { hasText: 'All visits (3)' }).click();
    ok('All visits newest first', (await box(page, 'Abbu').locator('.visit h5').first().innerText()) === 'Mon 26 Oct, Dr Khan (heart)');
    t = await box(page, 'Abbu').locator('.visit').nth(1).innerText();
    ok('visit item shows changes and tests', t.includes('Dose changed amlodipine 2.5 mg once a day') && t.includes('Stopped Aspirin') && t.includes('Tests: ECG') && t.includes('Asked: Is the swelling from the new tablet?'), t);
    await box(page, 'Abbu').locator('.visit').nth(1).locator('button', { hasText: 'Edit' }).click();
    ok('edit window filled', (await page.locator('#dv-h').innerText()) === 'Edit visit notes' && await page.locator('.med-row').count() === 2 && await page.locator('#vw-tests').isVisible() && (await page.inputValue('#v-tests')) === 'ECG');
    ok('edit: the question asked at this visit is ticked', await page.locator('#v-asked label', { hasText: 'Is the swelling' }).locator('input').isChecked());
    await page.locator('.m-dose').nth(0).fill('2.5 mg at night');
    await page.click('#v-save');
    ok('edit saved', (await msg(page)).startsWith('Saved the visit notes.') && (await boxText(page, 'Abbu')).includes('amlodipine 2.5 mg at night'));
    ok('All visits stays open', await box(page, 'Abbu').locator('details.hist').evaluate(d => d.open));
    await box(page, 'Abbu').locator('.visit').nth(0).locator('button', { hasText: 'Edit' }).click();
    await page.click('#v-del');
    t = await page.locator('#up-body').innerText();
    ok('deleting the write-up brings back the appointment and removes the booked one', t.includes('Dr Khan (heart) was') === false && t.includes('Mon 26 Oct at 10:30 am (today)') && !t.includes('Jan 2027'), t);
    await undo(page);
    ok('undo the delete', (await page.locator('#up-body').innerText()).includes('Jan 2027'));

    // ---------- 8. search ----------
    await page.fill('#q', 'aspirin');
    ok('search finds the visits with aspirin', (await page.locator('#q-count').innerText()) === '2 visits found, newest first.' && (await page.locator('#q-results .visit h5').first().innerText()).startsWith('Abbu, '), await page.locator('#q-count').innerText());
    await page.fill('#q', 'zzz');
    ok('search: nothing found message', (await page.locator('#q-count').innerText()) === 'No visit notes contain that.');
    await page.fill('#q', '');
    ok('search cleared', (await page.locator('#q-results li').count()) === 0 && (await page.locator('#q-count').innerText()) === '');

    // ---------- 9. copy, email, print ----------
    await box(page, 'Abbu').locator('.tools button', { hasText: 'Copy' }).click();
    t = await page.evaluate(() => navigator.clipboard.readText());
    ok('copy history', t.startsWith('Abbu: doctor visits and medicines\nWritten Mon 26 Oct 2026\n\nAbout Abbu: Diabetic.\nAllergic to penicillin.') && t.includes('Visits, newest first (3):'), t.slice(0, 200));
    const href = await box(page, 'Abbu').locator('.tools a', { hasText: 'Email' }).getAttribute('href');
    ok('email link without a recipient', href.startsWith('mailto:?subject=Abbu%3A%20doctor%20visits%20and%20medicines&body='), href.slice(0, 80));
    await page.evaluate(() => { window.print = () => { window.__printed = document.getElementById('print-area').innerText; }; });
    await box(page, 'Abbu').locator('.tools button', { hasText: 'Print' }).click();
    t = await page.evaluate(() => window.__printed || '');
    ok('print area has the history', await page.evaluate(() => document.getElementById('print-area').textContent.includes('Medicines now (from these notes):')), t.slice(0, 100));

    // ---------- 10. a quick visit with only the doctor (optional parts not forced) ----------
    await box(page, 'Ali').locator('button', { hasText: '+ Add visit notes' }).click();
    ok('Ali has no questions to tick', await page.locator('#v-asked-box').isHidden());
    await page.fill('#v-doctor', 'Dr Rubina (children)'); await page.click('#v-save');
    ok('a visit with only the doctor saves', (await boxText(page, 'Ali')).includes('Last visit Mon 26 Oct (today), Dr Rubina (children).'));
    // switching person in the window updates the questions to tick
    await box(page, 'Ali').locator('button', { hasText: '+ Add visit notes' }).click();
    await page.selectOption('#v-person', { label: 'Abbu' });
    ok('changing who updates the questions', await page.locator('#v-asked input').count() === 1);
    await page.keyboard.press('Escape');
    // a past appointment shows in red with Remove
    await box(page, 'Ali').locator('button', { hasText: '+ Add an appointment' }).click();
    await page.fill('#a-doctor', 'Dentist'); await page.fill('#a-date', '2026-10-20'); await page.click('#a-save');
    ok('past appointment warns', (await msg(page)).includes('That date has passed.'));
    t = await page.locator('#up-body li').first().innerText();
    ok('past appointment first, in words', t.startsWith('Ali: Dentist was Tue 20 Oct (6 days ago). Add notes from that visit, or remove it if it did not happen.') && await page.locator('#up-body li.past').count() === 1, t);
    await box(page, 'Ali').locator('.appt.past button', { hasText: 'Remove' }).click();
    ok('Remove a past appointment', await page.locator('#up-body li.past').count() === 0 && (await msg(page)).startsWith('Removed the appointment with Dentist'));

    // ---------- 11. reload keeps everything ----------
    const before = await saved(page);
    await page.reload({ waitUntil: 'networkidle' });
    ok('reload keeps the notes', JSON.stringify(await saved(page)) === JSON.stringify(before) && await page.locator('#person-list li.person').count() === 2 && (await page.locator('#up-body').innerText()).includes('Jan 2027'));

    // ---------- 12. edit and delete a person ----------
    await box(page, 'Ali').locator('.p-top button', { hasText: 'Edit' }).click();
    ok('person edit window', (await page.locator('#dp-h').innerText()) === 'Edit Ali' && await page.locator('#p-edit').isVisible());
    await page.fill('#p-name', 'Ali (son)'); await page.click('#p-save');
    ok('rename', await box(page, 'Ali (son)').count() === 1);
    await box(page, 'Ali (son)').locator('.p-top button', { hasText: 'Edit' }).click();
    await page.click('#p-del');
    ok('delete person', await page.locator('#person-list li.person').count() === 1 && (await msg(page)).startsWith('Deleted Ali (son) and all their notes.'));
    await undo(page);
    ok('undo delete person', await page.locator('#person-list li.person').count() === 2 && (await saved(page)).visits.some(v => v.doctor === 'Dr Rubina (children)'));

    // ---------- 13. backup, restore, delete everything ----------
    [dl] = await Promise.all([page.waitForEvent('download'), page.click('#backup')]);
    const backupFile = await dl.path();
    ok('backup file', dl.suggestedFilename() === 'doctor-visit-notes-backup-2026-10-26.json' && (await page.locator('#set-msg').innerText()).startsWith('Saved a backup file with 2 people and 4 visits.'), await page.locator('#set-msg').innerText());
    await page.click('#wipe');
    ok('delete everything', await page.locator('#person-list li').count() === 0 && (await page.locator('#up-body').innerText()).startsWith('Add the first person'));
    await page.locator('#set-msg .undo').click();
    ok('undo delete everything', await page.locator('#person-list li.person').count() === 2);
    await page.click('#wipe');
    await page.setInputFiles('#restore-file', backupFile);
    await page.waitForFunction(() => document.querySelectorAll('#person-list li.person').length === 2);
    ok('restore a backup', (await page.locator('#set-msg').innerText()).startsWith('Restored 2 people and 4 visits.'));
    const badFile = path.join(require('os').tmpdir(), 'dv-bad.json'); fs.writeFileSync(badFile, '{"hello":1}');
    await page.setInputFiles('#restore-file', badFile);
    await page.waitForFunction(() => document.getElementById('set-msg').textContent.includes('not a backup'));
    ok('a wrong file changes nothing', await page.locator('#person-list li.person').count() === 2);
    await ctx.close();

    // ---------- 14. damaged saved data, blocked storage ----------
    ({ ctx, page } = await newPage(null, seed('{not json')));
    ok('damaged data: starts fresh and says so', (await page.locator('#set-msg').innerText()).includes('could not be read') && await page.locator('#person-list li').count() === 0);
    await ctx.close();
    ({ ctx, page } = await newPage(null, `Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } });`));
    ok('blocked storage: warning shown, app works', await page.locator('#storage-warn').isVisible());
    await page.click('#add-person'); await page.fill('#p-name', 'Me'); await page.click('#p-save');
    ok('blocked storage: can still add', await page.locator('#person-list li').count() === 1);
    await ctx.close();

    // ---------- 15. very long text and the demo situation ----------
    const LONG = JSON.parse(JSON.stringify(DEMO));
    LONG.people[1].note = 'Very long note '.repeat(25);
    LONG.visits[3].said = 'Superlongwordwithoutanyspaces'.repeat(12) + '\n' + 'Long pasted text. '.repeat(120);
    LONG.questions.push({ id: 59, person: 2, text: 'Q'.repeat(300), added: '2026-10-01', asked: '', visit: 0 });
    for (const scheme of ['dark', 'light']) {
        for (const state of ['demo', 'long', 'empty']) {
            ({ ctx, page } = await newPage({ colorScheme: scheme }, state === 'empty' ? null : seed(state === 'demo' ? DEMO : LONG)));
            if (state !== 'empty') { await box(page, 'Abbu').locator('summary', { hasText: 'All visits' }).click(); await page.fill('#q', 'dr'); }
            for (const w of [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920]) {
                await page.setViewportSize({ width: w, height: 900 });
                const tag = scheme + ' ' + state + ' ' + w + ': ';
                const wide = await page.evaluate(() => { const out = []; document.querySelectorAll('main *').forEach(e => { const r = e.getBoundingClientRect(); if (r.width && (r.right > innerWidth + 1 || r.left < -1)) out.push(e.className || e.tagName); }); return { sw: document.documentElement.scrollWidth, out: out.slice(0, 5) }; });
                ok(tag + 'no horizontal scroll, nothing sticks out', wide.sw <= w && !wide.out.length, wide);
                if (w >= 900) for (const pos of [0, 0.5, 1]) {
                    await page.evaluate(p => scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * p), pos);
                    const ov = await page.evaluate(() => {
                        const bad = [];
                        document.querySelectorAll('main, .app, .col-main, .col-side').forEach(par => {
                            const kids = [...par.children].filter(k => k.offsetParent !== null && getComputedStyle(k).display !== 'contents');
                            for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
                                const a = kids[i].getBoundingClientRect(), b = kids[j].getBoundingClientRect();
                                if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2) bad.push(kids[i].className + ' / ' + kids[j].className);
                            }
                        });
                        return bad;
                    });
                    ok(tag + 'no overlapping blocks at ' + pos * 100 + '%', !ov.length, ov);
                }
                if (w <= 390 && state !== 'empty') {
                    const overlap = sel => page.evaluate(s => {
                        const els = [...document.querySelectorAll(s)].filter(e => e.checkVisibility()).map(e => ({ e, r: e.getBoundingClientRect() }));
                        const bad = [];
                        for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
                            const a = els[i].r, b = els[j].r;
                            if (els[i].e.contains(els[j].e) || els[j].e.contains(els[i].e)) continue;
                            if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) bad.push((els[i].e.id || els[i].e.textContent.slice(0, 20)) + ' / ' + (els[j].e.id || els[j].e.textContent.slice(0, 20)));
                        }
                        return bad;
                    }, sel);
                    const placeholders = dlg => page.evaluate(d => [...document.querySelectorAll(d + ' input[placeholder], ' + d + ' textarea[placeholder]')].filter(i => i.checkVisibility()).filter(i => {
                        const c = document.createElement('canvas').getContext('2d'), cs = getComputedStyle(i); c.font = cs.fontSize + ' ' + cs.fontFamily;
                        const avail = i.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight), need = c.measureText(i.placeholder).width;
                        if (i.tagName !== 'TEXTAREA') return need > avail;
                        // a textarea wraps its placeholder: count the lines word by word
                        let lines = 1, line = '';
                        i.placeholder.split(' ').forEach(wd => { const tryL = line ? line + ' ' + wd : wd; if (c.measureText(tryL).width > avail && line) { lines++; line = wd; } else line = tryL; });
                        return lines * parseFloat(cs.lineHeight) > i.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) + 1;
                    }).map(i => i.id || i.className), dlg);
                    let o = await overlap('main button, main input, main select, main textarea, main a.mini, main summary');
                    ok(tag + 'page controls do not overlap', !o.length, o);
                    o = await placeholders('main'); ok(tag + 'page placeholders fit', !o.length, o);
                    await page.evaluate(() => scrollTo(0, 0));
                    await box(page, 'Abbu').locator('.visit').first().locator('button', { hasText: 'Edit' }).click();
                    for (const b of ['#vo-reason', '#vo-tests', '#vo-next']) if (await page.locator(b).isVisible()) await page.click(b);
                    await page.click('#v-add-med');
                    o = await overlap('#d-visit button, #d-visit input, #d-visit select, #d-visit textarea, #d-visit label.check');
                    ok(tag + 'visit window controls do not overlap', !o.length, o);
                    o = await placeholders('#d-visit'); ok(tag + 'visit window placeholders fit', !o.length, o);
                    ok(tag + 'visit window inside the screen', await page.locator('#d-visit').evaluate(d => { const r = d.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && d.scrollWidth <= d.clientWidth; }));
                    await page.keyboard.press('Escape');
                    await box(page, 'Abbu').locator('.appt button', { hasText: 'Edit' }).click();
                    if (await page.locator('#ao-note').isVisible()) await page.click('#ao-note');
                    o = await overlap('#d-appt button, #d-appt input, #d-appt select');
                    ok(tag + 'appointment window controls do not overlap', !o.length, o);
                    o = await placeholders('#d-appt'); ok(tag + 'appointment window placeholders fit', !o.length, o);
                    await page.keyboard.press('Escape');
                    await box(page, 'Abbu').locator('.p-top button', { hasText: 'Edit' }).click();
                    o = await overlap('#d-person button, #d-person input, #d-person textarea');
                    ok(tag + 'person window controls do not overlap', !o.length, o);
                    o = await placeholders('#d-person'); ok(tag + 'person window placeholders fit', !o.length, o);
                    await page.keyboard.press('Escape');
                }
            }
            if (scheme === 'dark' && state === 'demo') {
                const bg1 = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
                await page.locator('.theme-toggle').click();
                const bg2 = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
                ok('theme switch changes the colours', bg1 !== bg2, [bg1, bg2]);
                await page.locator('.theme-toggle').click();
            }
            await ctx.close();
        }
    }

    // the demo state reads as expected (the situation in the README)
    ({ ctx, page } = await newPage({ viewport: { width: 1280, height: 900 } }, seed(DEMO)));
    t = await page.locator('#up-body').innerText();
    ok('demo: coming up', t.includes('Ammi: Dr Farah (thyroid) was Fri 23 Oct (3 days ago).') && t.includes('Ali (son, 6): Dr Rubina (children), Wed 28 Oct at 5:00 pm (in 2 days).') && t.includes('Abbu: Dr Khan (heart), Wed 4 Nov at 10:30 am (in 9 days). 3 questions to ask.'), t);
    ok('demo: order past, then soonest', (await page.locator('#up-body li').first().innerText()).startsWith('Ammi:'));
    ok('demo: past row has Add notes and Remove', await page.locator('#up-body li.past button').count() === 2);
    await page.locator('#up-body li.past button', { hasText: 'Remove' }).click();
    ok('Remove from Coming up, with undo', await page.locator('#up-body li.past').count() === 0 && (await msg(page)).startsWith('Removed the appointment with Dr Farah (thyroid)'));
    await undo(page);
    ok('undo brings it back', await page.locator('#up-body li.past').count() === 1);
    t = await boxText(page, 'Abbu');
    ok('demo: Abbu medicines now', t.includes('Amlodipine 2.5 mg once a day Dose changed Wed 21 Oct, Dr Khan (heart)') && t.includes('Atorvastatin 10 mg at night Started Wed 21 Oct') && !t.includes('Aspirin 75'), t);

    // ---------- 16. Help at four widths ----------
    for (const w of [320, 390, 820, 1280]) {
        await page.setViewportSize({ width: w, height: 800 });
        await page.evaluate(() => scrollTo(0, 0));
        await page.click('.help-btn');
        const d = page.locator('dialog.help');
        const r = await d.boundingBox();
        ok('help ' + w + ': opens inside the screen', await d.evaluate(e => e.open) && r.x >= 0 && r.x + r.width <= w && r.y >= 0 && r.y + r.height <= 800, r);
        ok('help ' + w + ': title', (await d.locator('h2').innerText()) === 'How to use Doctor Visit Notes and Questions for the Family');
        await page.keyboard.press('Escape');
        ok('help ' + w + ': Escape closes', !(await d.evaluate(e => e.open)));
        await page.click('.help-btn'); await page.locator('.help-close').click();
        ok('help ' + w + ': Got it closes', !(await d.evaluate(e => e.open)));
        const bar = await page.evaluate(() => { const b = [...document.querySelectorAll('.topbar > *')].map(e => e.getBoundingClientRect()); return { rows: new Set(b.map(r => Math.round(r.top))).size, overlap: b.some((a, i) => b.some((c, j) => j > i && Math.min(a.right, c.right) - Math.max(a.left, c.left) > 1 && Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top) > 1)) }; });
        ok('help ' + w + ': top bar on one row, no overlap', bar.rows === 1 && !bar.overlap, bar);
    }

    // ---------- 17. screenshots ----------
    if (SHOTS) {
        await page.setViewportSize({ width: 1280, height: 900 });
        await page.evaluate(() => { document.activeElement && document.activeElement.blur(); scrollTo(0, 0); });
        await page.screenshot({ path: path.join(__dirname, 'screenshots', 'desktop.png'), fullPage: false });
        await ctx.close();
        ({ ctx, page } = await newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }, seed(DEMO)));
        await page.screenshot({ path: path.join(__dirname, 'screenshots', 'phone.png') });
    }
    await ctx.close();

    // every file the page asked for answered
    for (const f of ['favicon.svg', 'manifest.webmanifest', 'sw.js', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'screenshots/desktop.png', 'screenshots/phone.png', '../help.js', '../theme.js']) {
        const res = await fetch(URL + f); ok('file answers 200: ' + f, res.status === 200, res.status);
    }
    ['style.css', 'core.js', 'script.js', 'help.js', 'theme.js'].forEach(f => ok('requested ' + f, [...requested].some(u => u.endsWith('/' + f))));
    ok('no failed requests', !failed.length, failed);
    ok('no console errors', !errors.length, errors);
    await browser.close(); if (srv) srv.close();
    console.log(pass + ' passed, ' + fail + ' failed' + (fail ? '' : '. ALL GOOD'));
    process.exitCode = fail ? 1 : 0;
})();
