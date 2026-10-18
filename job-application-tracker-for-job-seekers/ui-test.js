// Full page test with Playwright. Run from the repo root or this folder: node ui-test.js
//   BASE=https://umar8092.github.io/apps node ui-test.js   tests the live site
//   node ui-test.js --shots                                 also saves screenshots/desktop.png and phone.png
// "Today" is fixed to Sun 18 Oct 2026 in Pakistan time so every answer can be checked exactly.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), SLUG = 'job-application-tracker-for-job-seekers', KEY = SLUG + '.state';
const SHOTS = process.argv.includes('--shots');
const NOW = new Date('2026-10-18T10:00:00+05:00');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; if (!cond) console.log('FAIL ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra).slice(0, 400) : '')); };

function serve() {
    const types = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml', png: 'image/png', webmanifest: 'application/manifest+json' };
    return new Promise(res => { const s = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0].replace(/^\/apps/, '')); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': types[f.split('.').pop()] || 'application/octet-stream' }); r.end(fs.readFileSync(f)); }).listen(0, () => res(s)); });
}

// Amira's job search on Sun 18 Oct 2026
const H = (...a) => a.map(x => ({ d: x[0], s: x[1] }));
const AMIRA = { v: 1, nid: 12, settings: { follow: 7, goal: 10, weekStart: 1, name: 'Amira Khan' }, apps: [
    { id: 1, company: 'Acme Ltd', role: 'Sales Assistant', stage: 'applied', applied: '2026-10-08', where: 'Indeed', how: 'Online form', link: 'https://uk.indeed.com/viewjob?jk=1', history: H(['2026-10-08', 'applied']) },
    { id: 2, company: 'Beta Ltd', role: 'Customer Service Advisor', stage: 'interview', applied: '2026-10-05', where: 'LinkedIn', salary: '24,000 a year', contact: 'Sam Lee, sam@beta.example',
        interviews: [{ date: '2026-10-22', time: '10:00', kind: 'Video', notes: 'Prepare: a time I calmed an angry customer' }], history: H(['2026-10-05', 'applied'], ['2026-10-12', 'heard'], ['2026-10-14', 'interview']) },
    { id: 3, company: 'Gamma Foods', role: 'Warehouse Operative', stage: 'want', applied: '', closes: '2026-10-20', where: 'Company website', added: '2026-10-16', history: H(['2026-10-16', 'want']) },
    { id: 4, company: 'Delta Bank', role: 'Admin Assistant', stage: 'applied', applied: '2026-10-12', where: 'Indeed', history: H(['2026-10-12', 'applied']) },
    { id: 5, company: 'Northside Council', role: 'Receptionist', stage: 'applied', applied: '2026-10-13', where: 'Job centre', how: 'In person', history: H(['2026-10-13', 'applied']) },
    { id: 6, company: 'Omega Retail', role: 'Store Supervisor', stage: 'applied', applied: '2026-10-14', where: 'LinkedIn', history: H(['2026-10-14', 'applied']) },
    { id: 7, company: 'Pine Hotel', role: 'Front Desk Agent', stage: 'applied', applied: '2026-10-16', where: 'Indeed', history: H(['2026-10-16', 'applied']) },
    { id: 8, company: 'River Clinic', role: 'Medical Receptionist', stage: 'applied', applied: '2026-10-17', where: 'Indeed', history: H(['2026-10-17', 'applied']) },
    { id: 9, company: 'Star Cafe', role: 'Barista', stage: 'rejected', applied: '2026-09-30', where: 'Friend or referral', history: H(['2026-09-30', 'applied'], ['2026-10-09', 'rejected']) },
    { id: 10, company: 'Crown Logistics', role: 'Office Assistant', stage: 'applied', applied: '2026-09-14', where: 'Recruiter or agency', history: H(['2026-09-14', 'applied']) },
    { id: 11, company: 'Bright Kids Nursery', role: 'Nursery Assistant', stage: 'offer', applied: '2026-09-28', where: 'Job centre',
        interviews: [{ date: '2026-10-09', time: '14:30', kind: 'In person', notes: '' }], history: H(['2026-09-28', 'applied'], ['2026-10-02', 'interview'], ['2026-10-16', 'offer']) }
] };

(async () => {
    let srv, base = process.env.BASE;
    if (!base) { srv = await serve(); base = 'http://localhost:' + srv.address().port + '/apps'; }
    const URL = base + '/' + SLUG + '/';
    const browser = await chromium.launch();
    const errors = [], failed = [], requested = new Set();
    async function newPage(opts, state) {
        const ctx = await browser.newContext(Object.assign({ viewport: { width: 390, height: 844 }, acceptDownloads: true, timezoneId: 'Asia/Karachi', colorScheme: 'dark' }, opts || {}));
        await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new globalThis.URL(base).origin });
        await ctx.route(/goatcounter\.com|gc\.zgo\.at/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
        const page = await ctx.newPage();
        await page.clock.setFixedTime(NOW);
        if (state !== undefined) await page.addInitScript(([k, s]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, s); sessionStorage.setItem('seeded', '1'); } }, [KEY, typeof state === 'string' ? state : JSON.stringify(state)]);
        page.on('pageerror', e => errors.push(e.message));
        page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
        page.on('request', r => { if (r.url().startsWith(base)) requested.add(r.url()); });
        page.on('response', r => { if (r.status() >= 400 && r.url().startsWith(base)) failed.push(r.status() + ' ' + r.url()); });
        await page.goto(URL, { waitUntil: 'networkidle' });
        return { ctx, page };
    }
    const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const boxOf = (page, name) => page.locator('li.box', { has: page.locator('.box-name', { hasText: new RegExp('^' + esc(name) + '$') }) });
    const stOf = (page, name) => boxOf(page, name).locator('.st').innerText();
    const txt = (page, sel) => page.locator(sel).innerText();
    const saved = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
    async function add(page, f) {
        if (!(await page.locator('#form').isVisible())) await page.click('#open-form');
        await page.fill('#f-company', f.company); await page.fill('#f-role', f.role);
        if (f.stage) await page.selectOption('#f-stage', f.stage);
        if (f.applied) await page.fill('#f-applied', f.applied);
        if (f.where !== undefined) await page.fill('#f-where', f.where);
        await page.click('#save');
    }

    // ===== 1. first use, empty state, adding the first jobs =====
    {
        const { ctx, page } = await newPage();
        ok('first use: form shown first', await page.evaluate(() => document.getElementById('app').classList.contains('setup')));
        ok('first use: form open', await page.locator('#form').isVisible());
        ok('first use: no Add button', await page.locator('#open-form').isHidden());
        ok('first use: summary explains', (await txt(page, '#sum-body')).includes('Add the jobs you applied for'));
        ok('first use: empty list message', await page.locator('#empty').isVisible());
        ok('optional sections hidden', await page.locator('#w-more').isHidden() && await page.locator('#w-notes').isHidden() && await page.locator('#w-paste').isHidden() && await page.locator('#w-follow').isHidden());
        ok('date applied defaults to today', await page.inputValue('#f-applied') === '2026-10-18');
        // blank
        await page.click('#save');
        ok('blank: company error', (await txt(page, '#e-company')).includes('Type the company'));
        ok('blank: role error', (await txt(page, '#e-role')).includes('Type the job title'));
        ok('blank: nothing saved', (await page.locator('li.box').count()) === 0);
        // future date
        await page.fill('#f-company', 'Acme Ltd'); await page.fill('#f-role', 'Sales Assistant'); await page.fill('#f-applied', '2026-10-20');
        await page.click('#save');
        ok('future applied date refused', (await txt(page, '#e-applied')).includes('cannot be after today'));
        // chips + preview, no optional fields filled (not forced)
        await page.click('#quick-applied .chip:text-is("Yesterday")');
        ok('Yesterday chip', await page.inputValue('#f-applied') === '2026-10-17');
        await page.fill('#f-applied', '2026-10-08'); await page.fill('#f-where', 'Indeed');
        ok('preview before saving', (await txt(page, '#preview')) === 'Follow up today: applied 10 days ago, no reply.', await txt(page, '#preview'));
        await page.click('#save');
        ok('added message', (await txt(page, '#form-msg')).startsWith('Added Acme Ltd: Follow up today'), await txt(page, '#form-msg'));
        ok('form stays open for the next job', await page.locator('#form').isVisible() && await page.inputValue('#f-company') === '');
        ok('acme in list', (await stOf(page, 'Acme Ltd')) === 'Follow up today: applied 10 days ago, no reply');
        ok('acme needs you today', (await txt(page, '#sum-body')).includes('Acme Ltd (Sales Assistant): follow up, applied 10 days ago, no reply'));
        // duplicate warning
        await page.fill('#f-company', 'acme ltd'); await page.fill('#f-role', 'Sales Assistant');
        ok('same job warned', (await txt(page, '#dup')).startsWith('You already have this job: Sales Assistant at Acme Ltd'), await txt(page, '#dup'));
        await page.fill('#f-role', 'Manager');
        ok('same company warned', (await txt(page, '#dup')) === 'You have another job at Acme Ltd: Sales Assistant (Applied).');
        await page.fill('#f-company', ''); await page.fill('#f-role', '');
        ok('warning clears', (await txt(page, '#dup')) === '');
        // paste from an advert
        await page.click('#o-paste');
        await page.fill('#f-paste', 'Customer Service Advisor - Beta Ltd | LinkedIn https://www.linkedin.com/jobs/view/4455');
        ok('paste: company', await page.inputValue('#f-company') === 'Beta Ltd');
        ok('paste: role', await page.inputValue('#f-role') === 'Customer Service Advisor');
        ok('paste: link and section opened', await page.inputValue('#f-link') === 'https://www.linkedin.com/jobs/view/4455' && await page.locator('#w-more').isVisible());
        ok('paste: where', await page.inputValue('#f-where') === 'LinkedIn');
        await page.fill('#f-applied', '2026-10-05');
        // interview in the form
        await page.click('#o-iv');
        ok('interview box added', (await page.locator('#ivs fieldset').count()) === 1 && (await txt(page, '#o-iv')) === '+ Add another interview');
        await page.click('#save');
        ok('blank interview date refused', (await page.locator('#ivs .iv-err').innerText()).includes('Choose the interview date'));
        await page.locator('#ivs .iv-date').fill('2026-10-22'); await page.locator('#ivs .iv-time').fill('10:00');
        await page.locator('#ivs .iv-notes').fill('Prepare: a time I calmed an angry customer');
        ok('preview says stage moves', (await txt(page, '#preview')).startsWith('Stage: Interview. Interview Thu 22 Oct at 10:00, Video (in 4 days)'), await txt(page, '#preview'));
        // a second interview, then remove it
        await page.click('#o-iv');
        ok('two interviews numbered', (await page.locator('#ivs legend').allInnerTexts()).join('|') === 'Interview 1|Interview 2');
        await page.locator('#ivs fieldset').nth(1).locator('.danger-link').click();
        ok('interview removed', (await page.locator('#ivs fieldset').count()) === 1 && (await txt(page, '#ivs legend')) === 'Interview');
        await page.click('#save');
        ok('beta interview status', (await stOf(page, 'Beta Ltd')) === 'Interview Thu 22 Oct at 10:00, Video (in 4 days)');
        ok('beta badge', (await boxOf(page, 'Beta Ltd').locator('.badge').innerText()) === 'Interview');
        ok('coming interview in summary', (await txt(page, '#sum-body')).includes('Thu 22 Oct at 10:00: Beta Ltd (Video)'));
        ok('paste section closes after save', await page.locator('#w-paste').isHidden());
        // want to apply
        await page.selectOption('#f-stage', 'want');
        ok('want: date applied hidden', await page.locator('#w-applied').isHidden());
        ok('want: closing date shown without opening more', await page.locator('#f-closes').isVisible());
        await page.fill('#f-company', 'Gamma Foods'); await page.fill('#f-role', 'Warehouse Operative'); await page.fill('#f-closes', '2026-10-20');
        await page.click('#save');
        ok('want status', (await stOf(page, 'Gamma Foods')) === 'Apply by Tue 20 Oct (the advert closes in 2 days)');
        ok('stage select back to Applied after save', await page.inputValue('#f-stage') === 'applied' && await page.locator('#w-applied').isVisible());
        await page.click('#cancel');
        ok('Done closes the form', await page.locator('#form').isHidden() && await page.locator('#open-form').isVisible());
        ok('setup layout ends', !(await page.evaluate(() => document.getElementById('app').classList.contains('setup'))));
        // reload keeps everything
        await page.reload({ waitUntil: 'networkidle' });
        ok('reload keeps jobs', (await page.locator('li.box').count()) === 3);
        const s = await saved(page);
        ok('saved interview', s.apps[1].interviews[0].time === '10:00' && s.apps[1].stage === 'interview');
        ok('saved key prefix', (await page.evaluate(() => Object.keys(localStorage))).every(k => k.startsWith('job-application-tracker-for-job-seekers.')));
        // calendar file for the interview
        const [dl] = await Promise.all([page.waitForEvent('download'), boxOf(page, 'Beta Ltd').locator('.iv .mini').click()]);
        const ics = fs.readFileSync(await dl.path(), 'utf8');
        ok('ics file', dl.suggestedFilename() === 'interview-beta-ltd-2026-10-22.ics' && ics.includes('DTSTART:20261022T100000') && ics.includes('SUMMARY:Interview: Customer Service Advisor at Beta Ltd (Video)'), dl.suggestedFilename());
        // followed up + undo
        await boxOf(page, 'Acme Ltd').locator('button:text-is("Followed up")').click();
        ok('followed up message', (await txt(page, '#list-msg')).includes('Followed up with Acme Ltd today. Next reminder: Sun 25 Oct'));
        ok('followed up status', (await stOf(page, 'Acme Ltd')) === 'Follow up Sun 25 Oct (in 7 days) if you hear nothing');
        ok('last followed shown', (await boxOf(page, 'Acme Ltd').innerText()).includes('Last followed up Sun 18 Oct'));
        await page.click('#list-msg .undo');
        ok('undo followed up', (await stOf(page, 'Acme Ltd')) === 'Follow up today: applied 10 days ago, no reply');
        // stage change to rejected, closed filter, reopen
        await boxOf(page, 'Acme Ltd').locator('select').selectOption('rejected');
        ok('rejected message', (await txt(page, '#list-msg')).includes('Acme Ltd moved to "Rejected". It is under "Closed" now.'));
        ok('rejected hidden from active', (await boxOf(page, 'Acme Ltd').count()) === 0);
        ok('closed filter count', (await page.locator('.filt:has-text("Closed")').innerText()).replace(/\s+/g, ' ') === 'Closed 1');
        await page.click('.filt:has-text("Closed")');
        ok('closed shows rejected', (await stOf(page, 'Acme Ltd')) === 'Rejected, Sun 18 Oct');
        ok('closed job has no + Interview or Followed up', (await boxOf(page, 'Acme Ltd').locator('.mini').allInnerTexts()).join('|') === 'Edit');
        await boxOf(page, 'Acme Ltd').locator('select').selectOption('applied');
        ok('reopened message', (await txt(page, '#list-msg')).includes('Acme Ltd reopened as "Applied".'));
        ok('reopened status', (await stOf(page, 'Acme Ltd')) === 'Follow up Sun 25 Oct (in 7 days) if you hear nothing');
        // want -> applied from the box sets today
        await boxOf(page, 'Gamma Foods').locator('select').selectOption('applied');
        ok('applied from want', (await boxOf(page, 'Gamma Foods').locator('.box-sub').first().innerText()).startsWith('Applied Sun 18 Oct (today)'));
        await page.click('#list-msg .undo');
        ok('undo stage', (await stOf(page, 'Gamma Foods')).startsWith('Apply by'));
        // + Interview from the box opens the form with a new interview row
        await boxOf(page, 'Acme Ltd').locator('button:text-is("+ Interview")').click();
        ok('+ Interview opens edit form', (await txt(page, '#form-h')) === 'Edit Acme Ltd' && (await page.locator('#ivs fieldset').count()) === 1);
        await page.locator('#ivs .iv-date').fill('2026-10-19'); await page.locator('#ivs .iv-kind').selectOption('Phone');
        await page.click('#save');
        ok('edit saved with stage move', (await txt(page, '#list-msg')).includes('Saved Acme Ltd. Stage set to "Interview".'));
        ok('interview tomorrow', (await stOf(page, 'Acme Ltd')) === 'Interview tomorrow, Mon 19 Oct, Phone');
        // edit a mistake
        await boxOf(page, 'Gamma Foods').locator('button:text-is("Edit")').click();
        ok('edit form filled', await page.inputValue('#f-company') === 'Gamma Foods' && await page.inputValue('#f-closes') === '2026-10-20');
        ok('edit form has no paste', await page.locator('#o-paste').isHidden());
        await page.fill('#f-role', 'Warehouse Team Leader'); await page.click('#save');
        ok('edit changed role', (await boxOf(page, 'Gamma Foods').locator('.box-role').innerText()) === 'Warehouse Team Leader');
        // delete with undo
        await boxOf(page, 'Gamma Foods').locator('button:text-is("Edit")').click();
        await page.click('#del');
        ok('deleted', (await boxOf(page, 'Gamma Foods').count()) === 0 && (await txt(page, '#list-msg')).includes('Deleted Warehouse Team Leader at Gamma Foods.'));
        await page.click('#list-msg .undo');
        ok('undo delete', (await boxOf(page, 'Gamma Foods').count()) === 1);
        // cancel an edit changes nothing
        await boxOf(page, 'Beta Ltd').locator('button:text-is("Edit")').click();
        await page.fill('#f-company', 'Changed'); await page.click('#cancel');
        ok('cancel edit', (await boxOf(page, 'Beta Ltd').count()) === 1);
        // XSS-looking text is shown as text
        await add(page, { company: '<img src=x onerror=alert(1)>', role: '<b>Bold</b>', applied: '2026-10-18' });
        ok('text shown as typed', (await boxOf(page, '<img src=x onerror=alert(1)>').count()) === 1 && (await page.locator('.box img').count()) === 0);
        await page.click('#cancel');
        await ctx.close();
    }

    // ===== 2. Amira's full search, summary, filters, record, settings =====
    {
        const { ctx, page } = await newPage({}, AMIRA);
        const sum = await txt(page, '#sum-body');
        ok('needs you today order', sum.indexOf('Bright Kids Nursery') < sum.indexOf('Crown Logistics') && sum.indexOf('Crown Logistics') < sum.indexOf('Acme Ltd') && sum.indexOf('Acme Ltd') < sum.indexOf('Gamma Foods'), sum);
        ok('offer line', sum.includes('Bright Kids Nursery (Nursery Assistant): Offer Fri 16 Oct: give them your answer'));
        ok('week line', sum.includes('This week: 5 of 10 applications') && sum.includes('Mon 12 Oct to Sun 18 Oct') && sum.includes('5 to go to reach your goal'));
        ok('reply rate', sum.includes('Sent 10 applications, heard back from 3 (30%).'));
        ok('progress bar half', await page.locator('.bar span').evaluate(e => e.style.width) === '50%');
        ok('filter counts', (await page.locator('.filt').allInnerTexts()).map(t => t.replace(/\s+/g, ' ')).join('|') === 'Active 10|Want to apply 1|Applied 7|Interview 1|Offer 1|Closed 1|All 11', await page.locator('.filt').allInnerTexts());
        ok('list order', (await page.locator('.box-name').allInnerTexts()).slice(0, 5).join('|') === 'Bright Kids Nursery|Crown Logistics|Acme Ltd|Beta Ltd|Gamma Foods');
        ok('30 day hint', (await boxOf(page, 'Crown Logistics').innerText()).includes('No answer for over 30 days?'));
        ok('advert link safe', await boxOf(page, 'Acme Ltd').locator('a.adlink').getAttribute('rel') === 'noopener noreferrer');
        await page.click('.filt:has-text("Want to apply")');
        ok('stage filter', (await page.locator('.box-name').allInnerTexts()).join('|') === 'Gamma Foods');
        await page.click('.filt:has-text("All")');
        ok('all filter', (await page.locator('li.box').count()) === 11);
        // tapping a "needs you today" line jumps to the job, switching filter if needed
        await page.click('.filt:has-text("Offer")');
        await page.locator('#sum-body .todo-btn', { hasText: 'Crown Logistics' }).click();
        ok('jump switches to Active', (await page.locator('.filt[aria-pressed="true"]').innerText()).startsWith('Active') && (await boxOf(page, 'Crown Logistics').count()) === 1);
        // search
        ok('search shown for 6+ jobs', await page.locator('#find').isVisible());
        await page.fill('#find', 'recep');
        ok('search', (await page.locator('.box-name').allInnerTexts()).sort().join('|') === 'Northside Council|River Clinic');
        await page.fill('#find', 'zzz');
        ok('search none', (await txt(page, '#none-here')) === 'No job matches "zzz".');
        await page.fill('#find', '');
        // record
        const rec = await txt(page, '#rec-text');
        ok('record this week', rec.startsWith('Job search record for Amira Khan: Mon 12 Oct 2026 to Sun 18 Oct 2026\n5 applications, 0 interviews, 0 follow-ups'), rec.slice(0, 200));
        ok('record line', rec.includes('- Receptionist, Northside Council'.replace('- ', '- Applied: ')) && rec.includes('(found on Job centre, applied in person). Now: Applied.'));
        ok('name section shown when saved', await page.locator('#w-name').isVisible());
        await page.click('#rec-quick .chip:text-is("Last 4 weeks")');
        ok('last 4 weeks dates', await page.inputValue('#r-from') === '2026-09-21' && await page.inputValue('#r-to') === '2026-10-18');
        ok('last 4 weeks content', (await txt(page, '#rec-text')).includes('9 applications, 1 interview, 0 follow-ups'), (await txt(page, '#rec-text')).slice(0, 200));
        await page.click('#rec-quick .chip:text-is("Last week")');
        ok('last week', await page.inputValue('#r-from') === '2026-10-05' && await page.inputValue('#r-to') === '2026-10-11');
        await page.click('#rec-quick .chip:text-is("Everything")');
        ok('everything from first date', await page.inputValue('#r-from') === '2026-09-14' && (await txt(page, '#rec-text')).includes('10 applications, 2 interviews'));
        await page.fill('#r-from', '2026-10-20'); await page.fill('#r-to', '2026-10-10');
        ok('from after to', (await txt(page, '#e-rec')).includes('"From" date must be on or before') && await page.locator('#rec-copy').isDisabled());
        ok('no chip pressed for own dates', (await page.locator('#rec-quick .chip[aria-pressed="true"]').count()) === 0);
        await page.click('#rec-quick .chip:text-is("This week")');
        await page.click('#rec-copy');
        const clip = await page.evaluate(() => navigator.clipboard.readText());
        ok('record copied', clip.startsWith('Job search record for Amira Khan'), clip.slice(0, 80));
        const mail = await page.locator('#rec-mail').getAttribute('href');
        ok('email works with no recipient', mail.startsWith('mailto:?subject=Job%20search%20record') && decodeURIComponent(mail).includes('Northside Council'));
        await page.fill('#r-name', '');
        ok('name optional', (await txt(page, '#rec-text')).startsWith('Job search record: Mon 12 Oct'));
        const [csv] = await Promise.all([page.waitForEvent('download'), page.click('#rec-csv')]);
        const csvText = fs.readFileSync(await csv.path(), 'utf8');
        ok('csv', csv.suggestedFilename() === 'job-applications-2026-10-18.csv' && csvText.split('\r\n').length === 13 && csvText.includes('Beta Ltd,Customer Service Advisor,Interview,2026-10-05'), csvText.slice(0, 200));
        // settings: follow-up days
        await page.selectOption('#s-follow', '14');
        ok('follow 14 days', (await stOf(page, 'Acme Ltd')) === 'Follow up Thu 22 Oct (in 4 days) if you hear nothing');
        await page.selectOption('#s-follow', 'custom');
        for (const bad of ['0', '61', 'abc', '']) { await page.fill('#s-followdays', bad); ok('bad follow days ' + JSON.stringify(bad), (await txt(page, '#e-follow')).includes('from 1 to 60')); }
        await page.fill('#s-followdays', '3');
        ok('custom follow 3', (await txt(page, '#e-follow')) === '' && (await stOf(page, 'River Clinic')) === 'Follow up Tue 20 Oct (in 2 days) if you hear nothing');
        // weekly goal
        await page.selectOption('#s-goal', '0');
        ok('no goal', (await txt(page, '#sum-body')).includes('This week: 5 applications') && await page.locator('#sum-body .small-link').isVisible());
        await page.selectOption('#s-goal', 'custom'); await page.fill('#s-goaln', '200');
        ok('bad goal', (await txt(page, '#e-goal')).includes('from 1 to 100'));
        await page.fill('#s-goaln', '4');
        ok('goal reached', (await txt(page, '#sum-body')).includes('Goal reached. Well done!'));
        await page.selectOption('#s-week', '0');
        ok('week from Sunday', (await txt(page, '#sum-body')).includes('Sun 18 Oct to Sat 24 Oct') && (await txt(page, '#sum-body')).includes('This week: 0 of 4'));
        await page.reload({ waitUntil: 'networkidle' });
        const s = await saved(page);
        ok('settings kept', s.settings.follow === 3 && s.settings.goal === 4 && s.settings.weekStart === 0 && await page.inputValue('#s-follow') === '3' && await page.inputValue('#s-goaln') === '4');
        // long notes
        await boxOf(page, 'Pine Hotel').locator('button:text-is("Edit")').click();
        await page.click('#o-notes'); await page.fill('#f-notes', 'Long note. '.repeat(60)); await page.click('#save');
        ok('long notes cut', (await boxOf(page, 'Pine Hotel').locator('.box-note').innerText()).endsWith('…'));
        await boxOf(page, 'Pine Hotel').locator('button:text-is("Show all notes")').click();
        ok('show all notes', (await boxOf(page, 'Pine Hotel').locator('.box-note').innerText()).length > 600);
        // manual follow-up day
        await boxOf(page, 'Delta Bank').locator('button:text-is("Edit")').click();
        ok('own follow-up day hint', (await page.locator('#o-follow').isVisible()));
        await page.click('#o-follow');
        ok('follow hint uses setting', (await txt(page, '#h-follow')) === 'Leave empty to follow up 3 days after the last news.');
        await page.fill('#f-followOn', '2026-10-23'); await page.click('#save');
        ok('own follow-up day', (await stOf(page, 'Delta Bank')) === 'Follow up Fri 23 Oct (in 5 days) if you hear nothing');
        // backup and restore
        const [bk] = await Promise.all([page.waitForEvent('download'), page.click('#backup')]);
        const bkPath = await bk.path();
        ok('backup file', bk.suggestedFilename() === 'job-applications-backup-2026-10-18.json' && JSON.parse(fs.readFileSync(bkPath, 'utf8')).apps.length === 11);
        await page.click('#wipe');
        ok('delete everything', (await page.locator('li.box').count()) === 0 && (await txt(page, '#set-msg')).includes('Everything deleted.'));
        ok('after wipe the form is open', await page.locator('#form').isVisible());
        await page.click('#set-msg .undo');
        ok('undo delete everything', (await page.locator('li.box').count()) > 5);
        await page.click('#wipe');
        await page.setInputFiles('#restore-file', bkPath);
        await page.waitForTimeout(200);
        ok('restore backup', (await txt(page, '#set-msg')).includes('Backup restored: 11 jobs.') && (await page.locator('li.box').count()) === 10);
        await page.setInputFiles('#restore-file', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') });
        await page.waitForTimeout(200);
        ok('bad backup refused', (await txt(page, '#set-msg')).includes('not a backup from this app') && (await page.locator('li.box').count()) === 10);
        if (SHOTS) {
            await page.close();
        }
        await ctx.close();
    }

    // ===== 3. damaged saved data, blocked storage, many jobs, very long names =====
    {
        const { ctx, page } = await newPage({}, '{not json');
        ok('damaged data starts fresh', (await page.locator('#form').isVisible()) && (await txt(page, '#set-msg')).includes('could not be read'));
        await ctx.close();
    }
    {
        const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
        await ctx.route(/goatcounter\.com|gc\.zgo\.at/, r => r.fulfill({ status: 200, body: '' }));
        const page = await ctx.newPage();
        await page.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
        const errs = []; page.on('pageerror', e => errs.push(e.message));
        await page.goto(URL, { waitUntil: 'networkidle' });
        ok('blocked storage warns', await page.locator('#storage-warn').isVisible() && errs.length === 0, errs);
        await page.fill('#f-company', 'A'); await page.fill('#f-role', 'B'); await page.click('#save');
        ok('blocked storage still works', (await page.locator('li.box').count()) === 1);
        await ctx.close();
    }
    {
        const many = JSON.parse(JSON.stringify(AMIRA));
        for (let i = 0; i < 300; i++) many.apps.push({ id: 100 + i, company: 'Company ' + i, role: 'Role ' + i, stage: ['applied', 'rejected', 'noreply'][i % 3], applied: '2026-0' + (1 + i % 9) + '-1' + (i % 9), history: [] });
        many.apps.push({ id: 999, company: 'A'.repeat(80), role: 'Supercalifragilisticexpialidocious'.repeat(2), stage: 'applied', applied: '2026-10-18', where: 'W'.repeat(60), notes: 'N'.repeat(3000), history: [] });
        const t0 = Date.now();
        const { ctx, page } = await newPage({ viewport: { width: 320, height: 700 } }, many);
        ok('300 jobs load fast', Date.now() - t0 < 8000, Date.now() - t0);
        ok('300 jobs no side scroll', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await page.click('.filt:has-text("All")');
        ok('all 312', (await page.locator('li.box').count()) === 312);
        ok('all no side scroll', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await ctx.close();
    }

    // ===== 4. layout: phones with every optional field open, desktop scroll, light and dark =====
    for (const w of [320, 360, 390]) {
        const { ctx, page } = await newPage({ viewport: { width: w, height: 800 } }, AMIRA);
        await page.click('#open-form');
        for (const b of ['#o-paste', '#o-more', '#o-notes', '#o-follow']) await page.click(b);
        await page.click('#o-iv'); await page.click('#o-iv');
        await page.selectOption('#s-follow', 'custom'); await page.selectOption('#s-goal', 'custom');
        const bad = await page.evaluate(() => {
            const els = [...document.querySelectorAll('input:not([type=file]):not([type=checkbox]), select, textarea, button, a.secondary')].filter(e => e.offsetParent && e.getBoundingClientRect().width);
            const out = [];
            for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
                const a = els[i].getBoundingClientRect(), b = els[j].getBoundingClientRect();
                if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) out.push((els[i].id || els[i].className || els[i].textContent) + ' x ' + (els[j].id || els[j].className || els[j].textContent));
            }
            els.forEach(e => { const r = e.getBoundingClientRect(); if (r.right > innerWidth + 0.5 || r.left < -0.5) out.push('outside: ' + (e.id || e.className)); });
            // placeholders must fit their box
            document.querySelectorAll('input[placeholder], textarea[placeholder]').forEach(e => {
                if (!e.offsetParent) return;
                const c = document.createElement('canvas').getContext('2d'), cs = getComputedStyle(e); c.font = cs.fontSize + ' ' + cs.fontFamily;
                const room = e.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
                if (e.tagName === 'INPUT' && c.measureText(e.placeholder).width > room) out.push('placeholder cut: ' + e.id);
            });
            return out;
        });
        ok('no overlapping controls at ' + w, bad.length === 0, bad);
        ok('no side scroll at ' + w, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await ctx.close();
    }
    for (const scheme of ['dark', 'light']) for (const w of [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920]) {
        for (const st of [AMIRA, undefined]) {
            const { ctx, page } = await newPage({ viewport: { width: w, height: 900 }, colorScheme: scheme }, st);
            const side = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
            ok('no side scroll ' + scheme + ' ' + w + (st ? ' filled' : ' empty'), side <= 0, side);
            if (w >= 900 && st) {
                for (const pos of ['top', 'mid', 'bottom']) {
                    await page.evaluate(p => window.scrollTo(0, p === 'top' ? 0 : p === 'mid' ? document.body.scrollHeight / 2 : document.body.scrollHeight), pos);
                    const ov = await page.evaluate(() => {
                        const o = [];
                        [document.querySelector('main'), document.querySelector('.col-main'), document.querySelector('.col-side')].forEach(p => {
                            const kids = [...p.children].filter(k => k.offsetParent && getComputedStyle(k).display !== 'contents');
                            for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
                                const a = kids[i].getBoundingClientRect(), b = kids[j].getBoundingClientRect();
                                if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) o.push((kids[i].className || kids[i].tagName) + ' x ' + (kids[j].className || kids[j].tagName));
                            }
                        });
                        return o;
                    });
                    ok('no overlap ' + scheme + ' ' + w + ' ' + pos, ov.length === 0, ov);
                }
                if (w >= 1024) ok('two columns at ' + w, await page.evaluate(() => document.querySelector('.col-side').getBoundingClientRect().left > document.querySelector('.col-main').getBoundingClientRect().right));
            }
            await ctx.close();
        }
    }
    // help dialog and theme switch
    for (const w of [320, 390, 820, 1280]) {
        const { ctx, page } = await newPage({ viewport: { width: w, height: 800 } }, AMIRA);
        await page.click('.help-btn');
        const d = page.locator('dialog[open]');
        ok('help opens at ' + w, await d.isVisible() && (await d.innerText()).includes('How to use Job Application Tracker for Job Seekers'));
        const r = await d.boundingBox();
        ok('help inside screen at ' + w, r.x >= 0 && r.x + r.width <= w + 0.5);
        await page.keyboard.press('Escape');
        ok('Escape closes help at ' + w, (await page.locator('dialog[open]').count()) === 0);
        await page.click('.help-btn'); await page.click('dialog[open] button:has-text("Got it")');
        ok('Got it closes help at ' + w, (await page.locator('dialog[open]').count()) === 0);
        const tb = await page.evaluate(() => [...document.querySelectorAll('.topbar a, .topbar button')].map(e => e.getBoundingClientRect()).map(r => [r.left, r.right, r.top, r.bottom]));
        let clash = false; for (let i = 0; i < tb.length; i++) for (let j = i + 1; j < tb.length; j++) { const a = tb[i], b = tb[j]; if (a[0] < b[1] - 1 && b[0] < a[1] - 1 && a[2] < b[3] - 1 && b[2] < a[3] - 1) clash = true; }
        ok('top bar no overlap at ' + w, !clash && tb.length >= 3);
        if (w === 390) {
            await page.click('.theme-toggle');
            const th = await page.evaluate(() => document.documentElement.dataset.theme);
            ok('theme switch', th === 'light' && await page.evaluate(() => getComputedStyle(document.body).color) === 'rgb(46, 15, 27)', th);
        }
        await ctx.close();
    }

    // screenshots
    if (SHOTS) {
        let { ctx, page } = await newPage({ viewport: { width: 1280, height: 1000 } }, AMIRA);
        await page.screenshot({ path: path.join(__dirname, 'screenshots/desktop.png') });
        await ctx.close();
        ({ ctx, page } = await newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }, AMIRA));
        await page.screenshot({ path: path.join(__dirname, 'screenshots/phone.png') });
        await ctx.close();
    }

    // files the page asked for
    ['style.css', 'core.js', 'script.js', '../help.js', '../theme.js'].forEach(f => {
        const u = new globalThis.URL(f, URL).href; ok('requested ' + f, [...requested].some(r => r.split('?')[0] === u));
    });
    const { ctx, page } = await newPage({}, AMIRA);
    for (const f of ['sw.js', 'favicon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'manifest.webmanifest', '../help.js', '../theme.js', 'screenshots/desktop.png', 'screenshots/phone.png']) {
        const r = await page.request.get(new globalThis.URL(f, URL).href); ok('200 ' + f, r.status() === 200, r.status());
    }
    ok('service worker registers', await page.evaluate(() => navigator.serviceWorker.ready.then(r => !!r.active)));
    await ctx.close();
    ok('no console errors', errors.length === 0, errors);
    ok('no failed requests', failed.length === 0, failed);
    await browser.close(); if (srv) srv.close();
    console.log(pass + ' passed, ' + fail + ' failed');
    if (fail) process.exitCode = 1;
})();
