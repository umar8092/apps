// Drives the real page in headless Chromium. Run from the repo root: node homework-and-school-diary-for-parents/ui-test.js [baseUrl]
// Without a base URL it serves the repo itself. The clock is fixed at Mon 26 Oct 2026, 8 pm in Karachi, so the answers are exact.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), SLUG = 'homework-and-school-diary-for-parents';
const SHOTS = process.env.SHOTS === '1';
let pass = 0; const fails = [];
function eq(got, want, what) { const g = JSON.stringify(got), w = JSON.stringify(want); if (g === w) pass++; else fails.push(what + ': got ' + g + ', want ' + w); }
function ok(c, what) { eq(!!c, true, what); }
// innerText follows text-transform, so headings come back in capitals: compare without case
function has(text, part, what) { if (String(text).toLowerCase().includes(String(part).toLowerCase())) pass++; else fails.push(what + ': "' + part + '" not in "' + String(text).slice(0, 400) + '"'); }

function serve() {
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
    return new Promise(res => {
        const s = http.createServer((q, r) => {
            let p = decodeURIComponent(q.url.split('?')[0]).replace(/^\/apps/, ''); if (p.endsWith('/')) p += 'index.html';
            const f = path.join(ROOT, p);
            if (!f.startsWith(ROOT) || !fs.existsSync(f)) { r.writeHead(404); return r.end('no'); }
            r.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f));
        }).listen(0, '127.0.0.1', () => res({ s, base: 'http://127.0.0.1:' + s.address().port + '/apps' }));
    });
}

async function newPage(browser, base, width, opts = {}) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: opts.scale || 1, timezoneId: 'Asia/Karachi', colorScheme: opts.scheme || 'dark', permissions: ['clipboard-read', 'clipboard-write'] });
    await ctx.route(/goatcounter\.com|gc\.zgo\.at/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
    const page = await ctx.newPage();
    page.setDefaultTimeout(6000);
    page.errors = [];
    page.on('pageerror', e => page.errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') page.errors.push(m.text()); });
    page.on('response', r => { if (r.status() >= 400) page.errors.push(r.status() + ' ' + r.url()); });
    await page.clock.install({ time: new Date(opts.time || '2026-10-26T20:00:00+05:00') });
    await page.goto(base + '/' + SLUG + '/', { waitUntil: 'load' });
    return { ctx, page };
}

async function addChild(page, name, cls, subjects, preset) {
    if (await page.locator('#add-child').isVisible()) await page.click('#add-child');
    await page.fill('#cf-name', name);
    if (cls) { await page.click('text=+ Add class or school (optional)'); await page.fill('#cf-cls', cls); }
    for (const s of subjects || []) await page.click('#child-form .chip-btn:text-is("' + s + '")');
    if (preset) await page.click('#child-form .presets button:text-is("' + preset + '")');
    await page.click('#child-form button:text-is("Save child")');
}
async function pickChild(page, name) { await page.click('#child-chips label:has-text("' + name + '")'); }
async function addItem(page, { child, type, subject, what, due, chip, weekly }) {
    if (child) await pickChild(page, child);
    if (type) await page.click('#type-seg label:has-text("' + type + '")');
    if (subject !== undefined) await page.fill('#subject', subject);
    if (what !== undefined) await page.fill('#what', what);
    if (chip) await page.click('#due-chips label:has-text("' + chip + '")');
    if (due) await page.fill('#due', due);
    if (weekly) await page.click('#repeat-open');
    await page.click('#add-btn');
}
// The real evening: Ayesha, two children, the teacher's WhatsApp message for Ali.
async function fillRealistic(page) {
    await addChild(page, 'Ali', 'Class 5', ['English', 'Maths', 'Science', 'Urdu']);
    await addChild(page, 'Sara', 'Class 2', ['English', 'Maths'], 'Mon to Sat');
    await addItem(page, { child: 'Ali', subject: '', what: 'English: learn the poem on page 34\nMaths: Exercise 4.2, questions 1 to 10\nUrdu: write 5 sentences about your family', chip: 'Tomorrow' });
    await addItem(page, { child: 'Ali', type: 'Test', subject: 'English', what: 'The poem by heart', due: '2026-10-29' });
    await addItem(page, { child: 'Ali', type: 'Homework', subject: 'Science', what: 'Label the parts of a plant', due: '2026-10-23' });
    await addItem(page, { child: 'Ali', type: 'Project', subject: 'Science', what: 'Water cycle poster', due: '2026-11-02' });
    await addItem(page, { child: 'Sara', type: 'Reminder', subject: 'PE', what: 'Bring the PE kit', due: '2026-10-28', weekly: true });
    await addItem(page, { child: 'Sara', type: 'Homework', subject: 'English', what: 'Read page 12 aloud', chip: 'Tomorrow' });
    await addItem(page, { child: 'Sara', type: 'Homework', subject: 'Maths', what: 'Count to 50 in twos', chip: 'Tomorrow' });
    await page.click('#tonight .t-kid:nth-child(2) button[aria-label="Done: English homework"]');
}
const tonightText = page => page.locator('#tonight-body').innerText();

async function overlapCheck(page) {
    return page.evaluate(() => {
        const bad = [], vis = e => { if (e.closest('details:not([open])') && !e.closest('summary')) return false; const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden'; };
        const ctrls = [...document.querySelectorAll('input:not([type=radio]):not([type=checkbox]):not([type=file]), select, textarea, button, .chips span, .seg span')].filter(vis);
        for (let i = 0; i < ctrls.length; i++) for (let j = i + 1; j < ctrls.length; j++) {
            const a = ctrls[i].getBoundingClientRect(), b = ctrls[j].getBoundingClientRect();
            if (ctrls[i].contains(ctrls[j]) || ctrls[j].contains(ctrls[i])) continue;
            if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) bad.push((ctrls[i].id || ctrls[i].textContent.slice(0, 20)) + ' / ' + (ctrls[j].id || ctrls[j].textContent.slice(0, 20)));
        }
        const out = [...document.querySelectorAll('main *')].filter(vis).filter(e => e.getBoundingClientRect().right > document.documentElement.clientWidth + 1).map(e => e.tagName + '.' + e.className).slice(0, 5);
        const ph = [...document.querySelectorAll('input[placeholder], textarea[placeholder]')].filter(vis).filter(e => {
            const c = document.createElement('canvas').getContext('2d'); const s = getComputedStyle(e); c.font = s.fontSize + ' ' + s.fontFamily;
            return c.measureText(e.placeholder).width > e.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight) + 1 && e.tagName === 'INPUT';
        }).map(e => e.id + ': ' + e.placeholder);
        return { bad, out, ph, scroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 };
    });
}

(async () => {
    let srv = null, base = process.argv[2];
    if (!base) { srv = await serve(); base = srv.base; }
    const live = !srv;
    const browser = await chromium.launch();
    if (process.env.DEBUG) {
        const { ctx, page } = await newPage(browser, base, 1280);
        await fillRealistic(page);
        await page.click('button[aria-label="Edit Ali"]');
        await page.click('text=+ Add a holiday or break (optional)');
        const info = await page.evaluate(() => [...document.querySelectorAll('#add-child, #kid-list button')].filter(b => b.getBoundingClientRect().height).map(b => { const r = b.getBoundingClientRect(); return b.textContent + ' ' + Math.round(r.top) + '-' + Math.round(r.bottom) + ' x' + Math.round(r.left) + '-' + Math.round(r.right); }));
        console.log(info.join('\n'));
        await page.screenshot({ path: process.env.DEBUG, fullPage: true });
        await browser.close(); if (srv) srv.s.close(); return;
    }

    console.log('block 1');
    // ---------- 1. first use, the main evening, and every answer ----------
    {
        const { ctx, page } = await newPage(browser, base, 390);
        has(await tonightText(page), 'Start by adding your child', 'first use: empty Tonight explains what to do');
        ok(await page.locator('#child-form').isVisible(), 'first use: the Add a child form is open');
        ok(await page.locator('#add-form').isHidden(), 'first use: add form hidden until a child exists');
        ok(await page.locator('#add-empty').isVisible(), 'first use: add box says add a child first');
        ok(await page.locator('#child-form button:text-is("Cancel")').isHidden(), 'first use: no Cancel that would leave nothing');
        ok(await page.locator('#cf-cls').isHidden(), 'class is optional and hidden behind a button');
        // blank name
        await page.click('#child-form button:text-is("Save child")');
        has(await page.locator('#child-form .err').innerText(), "Type the child's name", 'blank child name is refused');
        // no school days
        await page.fill('#cf-name', 'Test');
        for (const d of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']) await page.click('#child-form .days label:has(input[aria-label="' + d + '"])');
        await page.click('#child-form button:text-is("Save child")');
        has(await page.locator('#child-form .err').innerText(), 'Tick at least one school day', 'no school days is refused');
        await page.click('#child-form .presets button:text-is("Mon to Fri")');
        await page.fill('#cf-name', '');
        await fillRealistic(page);
        const t = await tonightText(page);
        has(t, 'Ali Class 5', 'Ali box with class');
        has(t, 'Late', 'late heading');
        has(t, 'Science: Label the parts of a plant\nWas due Fri 23 Oct (3 days late)', 'late item with days late');
        has(t, 'For Tue 27 Oct (tomorrow)', 'Ali for tomorrow');
        has(t, 'English: learn the poem on page 34', 'pasted line 1 with subject');
        has(t, 'Maths: Exercise 4.2, questions 1 to 10', 'pasted line 2 with subject');
        has(t, 'Urdu: write 5 sentences about your family', 'pasted line 3 with subject');
        has(t, 'Coming up', 'coming up');
        ok(!(await page.locator('#tonight .t-kid').first().innerText()).includes('Due Tue 27 Oct'), 'items under "For Tue 27 Oct" do not repeat the date');
        has(t, 'English: The poem by heart\nDue Thu 29 Oct (in 3 days)', 'test coming up in 3 days');
        has(t, 'Science: Water cycle poster\nDue Mon 2 Nov (in 7 days)', 'project coming up');
        has(t, 'Sara Class 2', 'Sara box');
        ok(!(await page.locator('#tonight .t-kid').nth(1).innerText()).includes('All done'), 'Sara still has Maths left');
        await page.click('#tonight .t-kid:nth-child(2) button[aria-label="Done: Maths homework"]');
        has(await page.locator('#tonight .t-kid').nth(1).innerText(), 'All done for Tue 27 Oct.', 'Sara: all done for tomorrow');
        ok(!(await page.locator('#tonight .t-kid').nth(1).innerText()).includes('PE kit'), 'weekly PE kit (Wed) not in Monday evening check');
        // undo the last tick
        await page.click('#tonight-msg .undo');
        ok(!(await page.locator('#tonight .t-kid').nth(1).innerText()).includes('All done'), 'undo brings the Maths item back');
        await page.click('#tonight .t-kid:nth-child(2) button[aria-label="Done: Maths homework"]');

        // Copy text
        await page.click('#copy-tonight');
        const clip = await page.evaluate(() => navigator.clipboard.readText());
        has(clip, 'Homework and tests, Monday 26 Oct 2026', 'copy title');
        has(clip, 'Ali (Class 5)\n- LATE, was due Fri 23 Oct: Science homework: Label the parts of a plant\nFor Tue 27 Oct (tomorrow):\n- English homework: learn the poem on page 34', 'copy Ali block');
        has(clip, 'Sara (Class 2)\nFor Tue 27 Oct (tomorrow):\n- [done] English homework: Read page 12 aloud\n- [done] Maths homework: Count to 50 in twos', 'copy Sara block');
        // Email works with no address typed
        const mail = decodeURIComponent(await page.getAttribute('#email-tonight', 'href'));
        ok(mail.startsWith('mailto:?subject=Homework and tests for Mon 26 Oct&body='), 'email link with no recipient');
        has(mail, 'Ali (Class 5)', 'email body has the check');

        // the child's own box
        const kid = page.locator('#kid-list .kid').first();
        has(await kid.innerText(), 'Class 5 · School days: Mon to Fri', 'child box meta');
        has(await kid.innerText(), 'Late (1)', 'child box late count');
        has(await kid.innerText(), 'To do (5)', 'child box to do count');
        // Move to next school day
        await kid.locator('button:text-is("Move to Tue 27 Oct")').click();
        ok(!(await tonightText(page)).includes('3 days late'), 'moved item is no longer late');
        has(await page.locator('#kids-msg').innerText(), 'Science homework moved to Tue 27 Oct.', 'move message');
        await page.click('#kids-msg .undo');
        has(await tonightText(page), '3 days late', 'undo move');
        // edit an item
        await kid.locator('button[aria-label="Edit Urdu homework"]').click();
        const eb = page.locator('.edit-box');
        await eb.locator('textarea').fill('Write 6 sentences about your family');
        await eb.locator('button:text-is("Save")').click();
        has(await tonightText(page), 'Urdu: Write 6 sentences about your family', 'edit saved');
        // edit with blank text and subject is refused
        await kid.locator('button[aria-label="Edit Urdu homework"]').click();
        await eb.locator('input[type=text]').fill(''); await eb.locator('textarea').fill('');
        await eb.locator('button:text-is("Save")').click();
        has(await eb.locator('.err').innerText(), 'Write what to do', 'blank edit refused');
        await eb.locator('button:text-is("Cancel")').click();
        // delete with undo
        await kid.locator('button[aria-label="Edit Urdu homework"]').click();
        await eb.locator('button:text-is("Delete")').click();
        ok(!(await tonightText(page)).includes('Urdu'), 'deleted');
        await page.click('#kids-msg .undo');
        has(await tonightText(page), 'Urdu: Write 6 sentences', 'undo delete');
        // done list in the box, then Not done
        await page.click('#tonight .t-kid:nth-child(1) button[aria-label="Done: Urdu homework"]');
        await kid.locator('summary:has-text("Done recently")').click();
        has(await kid.locator('details').last().innerText(), 'Write 6 sentences', 'done recently lists it');
        await kid.locator('details').last().locator('button:text-is("Not done")').click();
        has(await page.locator('#tonight .t-kid').first().innerText(), 'Urdu: Write 6 sentences', 'not done brings it back');
        // weekly series listed and editable
        const sara = page.locator('#kid-list .kid').nth(1);
        has(await sara.innerText(), 'School days: Mon to Sat', 'Sara own school days');
        await sara.locator('summary:has-text("Every week (1)")').click();
        has(await sara.innerText(), 'Every Wednesday, next Wed 28 Oct', 'weekly series');

        // week at a glance
        const wk = await page.locator('#week-list').innerText();
        has(await page.locator('#week-title').innerText(), 'Mon 26 Oct to Sun 1 Nov 2026 (this week)', 'week title');
        has(wk, 'Tuesday 27 Oct\nAli: English homework: learn the poem on page 34', 'week Tuesday');
        has(wk, 'Wednesday 28 Oct\nSara: PE reminder: Bring the PE kit', 'week Wednesday weekly');
        await page.click('#week-next');
        has(await page.locator('#week-list').innerText(), 'Wednesday 4 Nov\nSara: PE reminder', 'weekly next week');
        has(await page.locator('#week-list').innerText(), 'Monday 2 Nov\nAli: Science project', 'project next week');
        await page.click('#week-now');

        // reload keeps everything
        const before = await tonightText(page);
        await page.reload({ waitUntil: 'load' });
        eq(await tonightText(page), before, 'reload restores the diary');
        ok(await page.locator('#child-form').count() === 0, 'reload: child form closed when children exist');

        if (SHOTS) {
            await page.evaluate(() => window.scrollTo(0, 0));
            await page.screenshot({ path: path.join(__dirname, 'screenshots/phone-raw.png'), fullPage: false });
        }
        eq(page.errors, [], 'no console errors in the main run');
        await ctx.close();
    }

    console.log('block 2');
    // ---------- 2. adding: paste, optional fields, odd input ----------
    {
        const { ctx, page } = await newPage(browser, base, 360);
        await addChild(page, 'Omar', '', [], 'Sun to Thu');
        has(await page.locator('#kids-msg').innerText(), 'Added Omar', 'add child message');
        ok(await page.locator('#repeat').isHidden(), 'repeat is optional, hidden behind a button');
        // Thursday? Today is Monday. Next school day for Sun-Thu on Monday is Tuesday.
        has(await page.locator('#due-note').innerText(), 'Due Tue 27 Oct (tomorrow).', 'default due is the next school day');
        // nothing typed
        await page.click('#add-btn');
        has(await page.locator('#add-err').innerText(), 'Write what to do, or pick a subject.', 'blank add refused');
        ok(await page.locator('#what').getAttribute('aria-invalid') === 'true', 'blank add marks the box');
        // subject only is fine
        await page.fill('#subject', 'Maths'); await page.click('#add-btn');
        has(await page.locator('#add-msg').innerText(), 'Added Maths homework for Omar, due Tue 27 Oct (tomorrow).', 'subject only adds');
        eq(await page.inputValue('#subject'), '', 'subject cleared after add');
        // undo the add
        await page.click('#add-msg .undo');
        has(await tonightText(page), 'Nothing written down for Tue 27 Oct', 'undo add');
        // paste with mixed lines, untick split -> one item
        await page.fill('#what', 'Maths: page 5\nlearn table of 7');
        ok(await page.locator('#split-box').isVisible(), 'split offered for two lines');
        has(await page.locator('#split-preview').innerText(), 'Maths: page 5', 'preview line 1');
        await page.fill('#subject', 'English');
        has(await page.locator('#split-preview').innerText(), 'English: learn table of 7', 'line with no subject takes the typed subject');
        await page.uncheck('#split');
        await page.click('#add-btn');
        has(await page.locator('#add-msg').innerText(), 'Added English homework for Omar', 'unticked split adds one item');
        // Thursday evening for a Sun-Thu school -> Sunday
        await page.fill('#due', '2026-10-30');
        has(await page.locator('#due-note').innerText(), 'Fri is not a school day for Omar.', 'warns about a non-school day');
        await page.fill('#due', '2026-10-20');
        has(await page.locator('#due-note').innerText(), 'That day has passed, so it will show as late.', 'past date note');
        // very long single text
        await page.fill('#what', 'x'.repeat(700)); await page.click('#add-btn');
        has(await page.locator('#add-err').innerText(), 'too long for one item (700 letters, the limit is 600)', 'very long text refused with the reason');
        // emoji, script and symbols render as text
        await page.fill('#what', '<img src=x onerror=alert(1)> ریاضی ✏️'); await page.fill('#due', '2026-10-27'); await page.click('#add-btn');
        has(await tonightText(page), '<img src=x onerror=alert(1)> ریاضی ✏️', 'typed text shown as text');
        // weekly
        await addItem(page, { type: 'Test', subject: 'Spelling', what: 'Words from list 3', due: '2026-10-29', weekly: true });
        has(await page.locator('#add-msg').innerText(), 'Added Spelling test for Omar, every Thursday.', 'weekly add message');
        ok(await page.locator('#repeat').isHidden(), 'repeat closes after adding');
        // Thursday evening for Sun-Thu
        await page.clock.setFixedTime(new Date('2026-10-29T21:00:00+05:00'));
        await page.reload({ waitUntil: 'load' });
        has(await tonightText(page), 'Nothing written down for Sun 1 Nov (in 3 days).', 'Sun-Thu school: Thursday evening asks about Sunday');
        has(await tonightText(page), 'Due today, not ticked', 'weekly test today not ticked');
        eq(page.errors, [], 'no console errors in the add run');
        await ctx.close();
    }

    console.log('block 3');
    // ---------- 3. holidays, edit and delete a child, backup, wipe, corrupt state ----------
    {
        const { ctx, page } = await newPage(browser, base, 1280, { time: '2026-12-18T20:00:00+05:00', scheme: 'light' });
        await addChild(page, 'Ali', 'Class 5', ['Maths']);
        await page.click('button[aria-label="Edit Ali"]');
        await page.click('text=+ Add a holiday or break (optional)');
        await page.fill('#cf-h0f', '2026-12-21'); await page.fill('#cf-h0t', '2027-01-01'); await page.fill('#cf-h0l', 'Winter break');
        await page.click('#child-form button:text-is("Save child")');
        has(await tonightText(page), 'No school: Winter break until Fri 1 Jan. Back on Mon 4 Jan.', 'holiday note on the Friday before');
        has(await tonightText(page), 'Nothing written down for Mon 4 Jan (in 17 days).', 'next school day after the break');
        has(await page.locator('#kid-list').innerText(), '1 holiday', 'holiday counted in the box');
        // holiday with a missing day is refused
        await page.click('button[aria-label="Edit Ali"]');
        await page.click('text=+ Add a holiday or break (optional)');
        await page.fill('#cf-h1f', '');
        await page.click('#child-form button:text-is("Save child")');
        has(await page.locator('#child-form .err').innerText(), 'Pick both days of each holiday', 'half holiday refused');
        await page.click('#child-form .hol-row:nth-child(2) .rm');
        await page.click('#child-form button:text-is("Cancel")');
        // subject chips in the add form
        await page.click('#subject-chips .chip-btn:text-is("Maths")');
        eq(await page.inputValue('#subject'), 'Maths', 'subject chip fills the subject');
        await page.click('#add-btn');
        has(await tonightText(page), 'Maths', 'added via chip');
        // backup
        const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#backup')]);
        const file = path.join(__dirname, 'screenshots', 'backup-test.json'); await dl.saveAs(file);
        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        eq([data.children.length, data.items.length, data.children[0].holidays[0].label], [1, 1, 'Winter break'], 'backup file has everything');
        // wipe with undo
        await page.click('#wipe');
        has(await tonightText(page), 'Start by adding your child', 'wiped');
        ok(await page.locator('#child-form').isVisible(), 'after wipe the add a child form is open');
        await page.click('#set-msg .undo');
        has(await tonightText(page), 'Ali', 'undo wipe');
        ok(await page.locator('#child-form').count() === 0, 'undo wipe closes the empty form');
        // restore: a wrong file changes nothing
        const junk = path.join(__dirname, 'screenshots', 'junk-test.json'); fs.writeFileSync(junk, '{"hello":1}');
        await page.setInputFiles('#restore-file', junk);
        await page.waitForFunction(() => /not a backup/.test(document.getElementById('set-msg').textContent));
        has(await page.locator('#set-msg').innerText(), 'not a backup from this app. Nothing was changed.', 'wrong file refused');
        // delete a child, then restore the backup
        await page.click('button[aria-label="Edit Ali"]');
        await page.click('#child-form button:text-is("Delete Ali and their items")');
        has(await tonightText(page), 'Start by adding your child', 'child deleted');
        await page.setInputFiles('#restore-file', file);
        await page.waitForFunction(() => /Restored/.test(document.getElementById('set-msg').textContent));
        has(await page.locator('#set-msg').innerText(), 'Restored 1 children and 1 items.', 'restore message');
        has(await tonightText(page), 'Ali', 'restored');
        fs.unlinkSync(file); fs.unlinkSync(junk);
        // corrupt saved state
        await page.evaluate(s => localStorage.setItem(s + '.state', '{"children":[{"id":"x","name":"Zed","days":[1]}],"items":[{"id":1}]}'), SLUG);
        await page.reload({ waitUntil: 'load' });
        has(await tonightText(page), 'Zed', 'half-broken saved state keeps what is valid');
        await page.evaluate(s => localStorage.setItem(s + '.state', 'not json'), SLUG);
        await page.reload({ waitUntil: 'load' });
        has(await tonightText(page), 'Start by adding your child', 'broken saved state starts fresh');
        eq(page.errors, [], 'no console errors in the holiday/backup run');
        await ctx.close();
    }

    console.log('block 4');
    // ---------- 4. storage blocked ----------
    {
        const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
        await ctx.route(/goatcounter\.com|gc\.zgo\.at/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
        await ctx.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
        const page = await ctx.newPage(); page.setDefaultTimeout(6000); const errs = []; page.on('pageerror', e => errs.push(e.message));
        await page.goto(base + '/' + SLUG + '/', { waitUntil: 'load' });
        ok(await page.locator('#storage-warn').isVisible(), 'storage blocked: warning shown');
        await addChild(page, 'Ali', '', []);
        has(await page.locator('#tonight-body').innerText(), 'Ali', 'storage blocked: still works for this visit');
        eq(errs, [], 'storage blocked: no errors');
        await ctx.close();
    }

    console.log('block 5');
    // ---------- 5. layout at every width, filled and empty, dark and light ----------
    for (const scheme of (process.env.QUICK ? [] : ['dark', 'light'])) {
        for (const w of [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920]) {
            const { ctx, page } = await newPage(browser, base, w, { scheme });
            const tag = scheme + ' ' + w + ': ';
            let r = await overlapCheck(page);
            eq([r.scroll, r.out, r.bad], [false, [], []], tag + 'empty state layout');
            if (w <= 390) eq(r.ph, [], tag + 'placeholders fit (empty state)');
            await fillRealistic(page);
            // open every optional thing
            await page.click('#repeat-open');
            await page.fill('#what', 'English: a\nMaths: b');
            const kid = page.locator('#kid-list .kid').first();
            await kid.locator('button[aria-label="Edit Urdu homework"]').click();
            for (const d of await page.locator('#kid-list details').all()) await d.evaluate(e => { e.open = true; });
            r = await overlapCheck(page);
            eq([r.scroll, r.out, r.bad], [false, [], []], tag + 'filled layout with edit box open');
            if (w <= 390) eq(r.ph, [], tag + 'placeholders fit (filled)');
            await kid.locator('.edit-box button:text-is("Cancel")').click();
            await page.click('button[aria-label="Edit Ali"]');
            await page.click('text=+ Add a holiday or break (optional)');
            await page.click('text=+ Add class or school (optional)').catch(() => { });
            r = await overlapCheck(page);
            eq([r.scroll, r.out, r.bad], [false, [], []], tag + 'child form with holiday open');
            if (w <= 390) eq(r.ph, [], tag + 'placeholders fit (child form)');
            if (w >= 900) {
                for (const pos of [0, 0.5, 1]) {
                    await page.evaluate(p => window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * p), pos);
                    const o = await page.evaluate(() => {
                        const out = [];
                        const kids = [...document.querySelector('main').children].filter(e => e.getBoundingClientRect().height > 0);
                        for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
                            const a = kids[i].getBoundingClientRect(), b = kids[j].getBoundingClientRect();
                            if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) out.push(kids[i].className + '/' + kids[j].className);
                        }
                        return out;
                    });
                    eq(o, [], tag + 'no blocks overlap at scroll ' + pos);
                }
                const cols = await page.evaluate(() => [document.querySelector('.col-main').getBoundingClientRect().left, document.querySelector('.col-side').getBoundingClientRect().left]);
                ok(cols[1] > cols[0] + 300, tag + 'desktop has two columns');
            }
            // help dialog
            if ([320, 390, 820, 1280].includes(w)) {
                await page.evaluate(() => window.scrollTo(0, 0));
                const btn = page.locator('.topbar button:has-text("Help"), button.help-btn').first();
                await btn.click();
                const d = page.locator('dialog.help');
                const bb = await d.boundingBox();
                ok(bb && bb.x >= 0 && bb.x + bb.width <= w + 1 && bb.y >= 0, tag + 'help dialog on screen');
                has(await d.locator('h2').innerText(), 'How to use Homework and School Diary for Parents', tag + 'help title');
                await page.keyboard.press('Escape');
                ok(!(await d.evaluate(e => e.open)), tag + 'Escape closes help');
                await btn.click(); await page.click('.help-close');
                ok(!(await d.evaluate(e => e.open)), tag + 'Got it closes help');
                const bar = await page.evaluate(() => [...document.querySelectorAll('.topbar > *')].map(e => { const r = e.getBoundingClientRect(); return [r.top, r.bottom, r.left, r.right]; }));
                let clash = false; for (let i = 0; i < bar.length; i++) for (let j = i + 1; j < bar.length; j++) if (Math.min(bar[i][3], bar[j][3]) - Math.max(bar[i][2], bar[j][2]) > 1 && Math.min(bar[i][1], bar[j][1]) - Math.max(bar[i][0], bar[j][0]) > 1) clash = true;
                ok(!clash, tag + 'top bar buttons do not overlap');
            }
            // theme switch
            if (w === 390) {
                const bg1 = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
                await page.click('.theme-toggle');
                const bg2 = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
                ok(bg1 !== bg2, tag + 'theme switch changes the look');
            }
            if (SHOTS && scheme === 'dark' && w === 1280) {
                await page.click('#child-form button:text-is("Cancel")');
                await page.fill('#what', ''); await page.click('#repeat').catch(() => { });
                await page.reload({ waitUntil: 'load' });
                await page.evaluate(() => window.scrollTo(0, 0));
                await page.screenshot({ path: path.join(__dirname, 'screenshots/desktop.png'), fullPage: false });
            }
            eq(page.errors, [], tag + 'no console errors');
            await ctx.close();
        }
    }
    if (SHOTS) {
        const { ctx, page } = await newPage(browser, base, 390, { scale: 2 });
        await fillRealistic(page);
        await page.reload({ waitUntil: 'load' });
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: path.join(__dirname, 'screenshots/phone.png'), fullPage: true, clip: { x: 0, y: 0, width: 390, height: 1500 } });
        await ctx.close();
        try { fs.unlinkSync(path.join(__dirname, 'screenshots/phone-raw.png')); } catch (e) { }
    }
    // the logic checks in the browser too
    {
        const ctx = await browser.newContext(); const page = await ctx.newPage();
        await page.goto(base + '/' + SLUG + '/test.html');
        const r = await page.evaluate(() => window.TEST_RESULT);
        eq(r && r.fails, [], 'test.html logic checks pass in the browser (' + (r && r.pass) + ')');
        await ctx.close();
    }
    await browser.close();
    if (srv) srv.s.close();
    console.log((live ? 'LIVE ' : 'LOCAL ') + pass + ' UI checks passed' + (fails.length ? ', ' + fails.length + ' FAILED:\n - ' + fails.join('\n - ') : ''));
    process.exitCode = fails.length ? 1 : 0;
})();
