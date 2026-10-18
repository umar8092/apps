// Full page test with Playwright. Run from the repo root or this folder: node ui-test.js
//   BASE=https://umar8092.github.io/apps node ui-test.js   tests the live site
//   node ui-test.js --shots                                 also saves screenshots/desktop.png and phone.png
// "Now" is fixed to Mon 19 Oct 2026 10:10 in Pakistan time so every answer can be checked exactly.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), SLUG = 'class-timetable-for-students-and-teachers', KEY = SLUG + '.state';
const SHOTS = process.argv.includes('--shots');
const AT = hm => new Date('2026-10-19T' + hm + ':00+05:00');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; if (!cond) console.log('FAIL ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra).slice(0, 500) : '')); };

function serve() {
    const types = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml', png: 'image/png', webmanifest: 'application/manifest+json' };
    return new Promise(res => { const s = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0].replace(/^\/apps/, '')); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': types[f.split('.').pop()] || 'application/octet-stream' }); r.end(fs.readFileSync(f)); }).listen(0, () => res(s)); });
}

// Ayesha's Year 10 timetable
const AYESHA = [
    { name: 'Maths', teacher: 'Mr Ahmed', times: [['Monday', '08:30', '09:30', '12'], ['Wednesday', '10:50', '11:50', '12'], ['Friday', '08:30', '09:30', '14']] },
    { name: 'English', teacher: 'Mrs Khan', times: [['Monday', '09:30', '10:30', '5'], ['Thursday', '08:30', '09:30', '5']] },
    { name: 'Chemistry', teacher: 'Dr Ali', bring: 'lab coat, goggles', times: [['Monday', '10:50', '11:50', 'Lab B4'], ['Tuesday', '13:00', '14:00', 'Lab B4']] },
    { name: 'Physics', times: [['Tuesday', '08:30', '09:30', 'Lab B2'], ['Thursday', '10:50', '11:50', 'Lab B2']] },
    { name: 'PE', bring: 'PE kit', times: [['Tuesday', '09:30', '10:30', 'Sports hall'], ['Friday', '13:00', '14:00', 'Sports hall']] },
    { name: 'History', times: [['Monday', '13:00', '14:00', '8'], ['Wednesday', '08:30', '09:30', '8'], ['Thursday', '13:00', '14:00', '8']] },
    { name: 'Computer Science', times: [['Wednesday', '09:30', '10:30', 'IT 1'], ['Friday', '10:50', '11:50', 'IT 1']] }
];

(async () => {
    let srv, base = process.env.BASE;
    if (!base) { srv = await serve(); base = 'http://localhost:' + srv.address().port + '/apps'; }
    const URL = base + '/' + SLUG + '/';
    const browser = await chromium.launch();
    const errors = [], failed = [], requested = new Set();
    async function newPage(opts, at, init) {
        const ctx = await browser.newContext(Object.assign({ viewport: { width: 390, height: 844 }, acceptDownloads: true, timezoneId: 'Asia/Karachi', colorScheme: 'dark', locale: 'en-GB' }, opts || {}));
        await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new globalThis.URL(base).origin });
        await ctx.route(/goatcounter\.com|gc\.zgo\.at/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
        const page = await ctx.newPage();
        await page.clock.install({ time: at || AT('10:10') });
        if (init) await page.addInitScript(init);
        page.on('pageerror', e => errors.push(e.message));
        page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
        page.on('request', r => { if (r.url().startsWith(base)) requested.add(r.url()); });
        page.on('response', r => { if (r.status() >= 400 && r.url().startsWith(base)) failed.push(r.status() + ' ' + r.url()); });
        await page.goto(URL, { waitUntil: 'networkidle' });
        return { ctx, page };
    }
    const txt = (page, sel) => page.locator(sel).innerText();
    const box = (page, name) => page.locator('#subj-list > li.box', { has: page.locator('h3.box-h', { hasText: new RegExp('^' + name + '$') }) });
    const rowSel = (i, cls) => '#rows > li:nth-child(' + (i + 1) + ') ' + cls;
    async function add(page, s) {
        if (!(await page.locator('#form').isVisible())) await page.click('#open-form');
        await page.fill('#f-name', s.name);
        for (let i = 0; i < s.times.length; i++) {
            if (i > 0) await page.click('#add-row');
            const [day, a, b, room] = s.times[i];
            await page.selectOption(rowSel(i, '.day-sel'), { label: day });
            await page.fill(rowSel(i, '.start'), a);
            await page.fill(rowSel(i, '.end'), b);
            await page.fill(rowSel(i, '.room'), room || '');
            if (s.weeks && s.weeks[i]) await page.selectOption(rowSel(i, '.week-sel'), s.weeks[i]);
        }
        if (s.teacher || s.bring || s.note) {
            if (await page.locator('#o-more').isVisible()) await page.click('#o-more');
            await page.fill('#f-teacher', s.teacher || ''); await page.fill('#f-bring', s.bring || ''); await page.fill('#f-note', s.note || '');
        }
        await page.click('#save');
    }
    const savedState = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
    const seed = st => 'localStorage.setItem(' + JSON.stringify(KEY) + ',' + JSON.stringify(JSON.stringify(st)) + ')';

    // ---------- 1. first use ----------
    let { ctx, page } = await newPage();
    ok('first use: form comes first', await page.evaluate(() => document.getElementById('app').classList.contains('setup')));
    ok('first use: empty list text', (await txt(page, '#empty')).includes('No subjects yet'));
    ok('first use: right now explains', (await txt(page, '#now-body')).includes('Add your subjects'));
    ok('first use: today/tomorrow/week hidden', !(await page.locator('#today').isVisible()) && !(await page.locator('#tomorrow').isVisible()) && !(await page.locator('#week').isVisible()));
    ok('first use: one day row ready', (await page.locator('#rows > li').count()) === 1);
    ok('first use: Remove hidden with one row', !(await page.locator('#rows .rm').isVisible()));
    ok('optional teacher/bring hidden', !(await page.locator('#f-teacher').isVisible()) && await page.locator('#o-more').isVisible());
    ok('week A/B choice hidden when off', !(await page.locator('.week-sel').isVisible()));

    // ---------- 2. validation ----------
    await page.click('#save');
    ok('blank name error', (await txt(page, '#e-name')).includes('Type the subject'));
    ok('blank times error', (await txt(page, rowSel(0, '.err'))).includes('Type when it starts and ends'));
    await page.fill('#f-name', 'Maths');
    await page.click(rowSel(0, '.chip:text-is("45 min")'));
    ok('length chip needs start', (await txt(page, rowSel(0, '.err'))).includes('starts first'));
    await page.fill(rowSel(0, '.start'), '08:30');
    await page.click(rowSel(0, '.chip:text-is("45 min")'));
    ok('45 min chip sets end', (await page.inputValue(rowSel(0, '.end'))) === '09:15');
    await page.click(rowSel(0, '.chip:text-is("1 hour")'));
    ok('1 hour chip sets end', (await page.inputValue(rowSel(0, '.end'))) === '09:30');
    await page.fill(rowSel(0, '.end'), '08:00');
    await page.click('#save');
    ok('end before start error', (await txt(page, rowSel(0, '.err'))).includes('ends before it starts'));
    await page.fill(rowSel(0, '.end'), '08:30');
    await page.click('#save');
    ok('same start and end error', (await txt(page, rowSel(0, '.err'))).includes('same as the start'));
    await page.fill(rowSel(0, '.start'), '23:30');
    await page.click(rowSel(0, '.chip:text-is("90 min")'));
    ok('chip past midnight refused', (await txt(page, rowSel(0, '.err'))).includes('after midnight'));
    ok('nothing saved after errors', (await savedState(page)).subjects.length === 0);
    // next row is prefilled: next school day, same times and room
    await page.fill(rowSel(0, '.start'), '08:30'); await page.fill(rowSel(0, '.end'), '09:30'); await page.fill(rowSel(0, '.room'), '12');
    await page.click('#add-row');
    ok('second row: next day', (await page.inputValue(rowSel(1, '.day-sel'))) === '2');
    ok('second row: same times and room', (await page.inputValue(rowSel(1, '.start'))) === '08:30' && (await page.inputValue(rowSel(1, '.end'))) === '09:30' && (await page.inputValue(rowSel(1, '.room'))) === '12');
    ok('Remove shows with 2 rows', await page.locator(rowSel(1, '.rm')).isVisible());
    await page.click(rowSel(1, '.rm'));
    ok('Remove deletes the row', (await page.locator('#rows > li').count()) === 1);
    await page.fill('#f-name', ''); await page.click('#cancel');
    ok('Clear empties the form on first use', (await page.inputValue('#f-name')) === '' && (await page.inputValue(rowSel(0, '.start'))) === '');

    // ---------- 3. Ayesha adds her timetable ----------
    for (const s of AYESHA) await add(page, s);
    ok('added message', (await txt(page, '#form-msg')).includes('Computer Science added: 2 lessons a week'));
    let st = await savedState(page);
    ok('7 subjects saved', st.subjects.length === 7, st.subjects.map(s => s.name));
    ok('maths 3 times saved', st.subjects.find(s => s.name === 'Maths').times.length === 3);
    ok('each subject gets its own colour', new Set(st.subjects.map(s => s.color)).size === 7);
    ok('no longer setup', !(await page.evaluate(() => document.getElementById('app').classList.contains('setup'))));
    ok('7 subject boxes', (await page.locator('#subj-list > li.box').count()) === 7);

    // ---------- 4. right now at Mon 10:10 ----------
    let now = await txt(page, '#now-body');
    ok('now: English', now.includes('Now: English'), now);
    ok('now: room and until', now.includes('Room 5 · Mrs Khan · until 10:30'), now);
    ok('now: 20 min left', now.includes('20 min left'), now);
    ok('next: Chemistry at 10:50 in 40 min', now.includes('Chemistry at 10:50 (in 40 min)'), now);
    ok('next: lab and teacher', now.includes('Lab B4 · Dr Ali'), now);
    ok('next: bring', now.includes('Bring: lab coat, goggles (Chemistry)'), now);
    ok('today heading', (await txt(page, '#today-h')) === 'Today, Mon 19 Oct');
    const todayTxt = await txt(page, '#today-body');
    ok('today order and gap', /Maths[\s\S]*English[\s\S]*Free 10:30 – 10:50 \(20 min\)[\s\S]*Chemistry[\s\S]*Free 11:50 – 13:00 \(1 h 10 min\)[\s\S]*History/.test(todayTxt), todayTxt);
    ok('today: English marked Now', (await page.locator('#today-body .lesson.on .name').innerText()) === 'English');
    ok('today: Maths faded as done', (await page.locator('#today-body .lesson.done').count()) === 1);
    ok('today: room labels', todayTxt.includes('Room 12') && todayTxt.includes('Lab B4'));
    ok('tomorrow heading', (await txt(page, '#tom-h')) === 'Tomorrow, Tue 20 Oct');
    const tom = await txt(page, '#tom-body');
    ok('tomorrow lessons in order', /Physics[\s\S]*PE[\s\S]*Chemistry/.test(tom), tom);
    ok('bring tomorrow', tom.includes('Bring tomorrow: PE kit (PE), lab coat, goggles (Chemistry)'), tom);
    const days = await page.locator('.wday-h').allInnerTexts();
    ok('week: Mon to Fri', days.length === 5 && days[0].startsWith('Monday') && days[4].startsWith('Friday'), days);
    ok('week: today marked', (await page.locator('.wday.is-today .wday-h').innerText()).includes('Monday'));
    ok('week: Friday has 3 lessons', (await page.locator('.wday').nth(4).locator('.wl').count()) === 3);
    ok('subject box lists times', (await box(page, 'Maths').innerText()).includes('Mon 08:30 – 09:30 · Room 12'));
    ok('subject box lesson count', (await box(page, 'Maths').innerText()).includes('3 lessons a week'));

    // the minute ticks on: 10:30 English ends, free until 10:50
    await page.clock.runFor(20 * 60 * 1000);
    now = await txt(page, '#now-body');
    ok('ticks to free time', now.includes('Free now until 10:50 (20 min)'), now);
    ok('free gap highlighted', (await page.locator('#today-body .free-gap.on').count()) === 1);

    // copy and email
    await page.click('#copy-week');
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    ok('copy week text', clip.includes('Monday\n  08:30 - 09:30  Maths (Room 12, Mr Ahmed)') && clip.includes('What to bring'), clip.slice(0, 200));
    ok('copy message', (await txt(page, '#week-msg')).includes('Copied the whole week'));
    const mail = await page.getAttribute('#mail-week', 'href');
    ok('email link has no recipient and a body', mail.startsWith('mailto:?subject=My%20class%20timetable&body='));

    // ---------- 5. reload keeps everything ----------
    await page.reload({ waitUntil: 'networkidle' });
    ok('reload keeps subjects', (await page.locator('#subj-list > li.box').count()) === 7);
    ok('reload: form closed, add button shown', await page.locator('#open-form').isVisible() && !(await page.locator('#form').isVisible()));
    st = await savedState(page);
    await ctx.close();

    // ---------- 6. different moments of the day and week ----------
    const at = async (when, fn) => { const r = await newPage(null, when, seed(st)); await fn(r.page); await r.ctx.close(); };
    await at(AT('07:50'), async p => {
        const n = await txt(p, '#now-body');
        ok('before school', n.includes('First lesson today: Maths at 08:30') && n.includes('In 40 min') && n.includes('Room 12 · Mr Ahmed'), n);
        ok('before school bring today', n.includes('Bring today: lab coat, goggles (Chemistry)'), n);
    });
    await at(AT('13:30'), async p => {
        const n = await txt(p, '#now-body');
        ok('last lesson of the day', n.includes('Now: History') && n.includes('30 min left') && n.includes('This is the last lesson today.'), n);
        ok('last lesson: next school day', n.includes('Next school day: Tue 20 Oct (tomorrow)') && n.includes('Physics at 08:30'), n);
    });
    await at(AT('15:00'), async p => {
        const n = await txt(p, '#now-body');
        ok('after school', n.includes('No more lessons today.') && n.includes('Physics at 08:30') && n.includes('Bring: PE kit (PE), lab coat, goggles (Chemistry)'), n);
    });
    await at(new Date('2026-10-23T16:00:00+05:00'), async p => {
        ok('friday: tomorrow becomes next school day', (await txt(p, '#tom-h')) === 'Next school day, Mon 26 Oct', await txt(p, '#tom-h'));
        ok('friday: no lessons tomorrow note', (await txt(p, '#tom-note')) === 'No lessons tomorrow (Saturday).');
    });
    await at(new Date('2026-10-24T11:00:00+05:00'), async p => {
        const n = await txt(p, '#now-body');
        ok('saturday', n.includes('No lessons today (Saturday).') && n.includes('Next school day: Mon 26 Oct') && n.includes('Maths at 08:30'), n);
        ok('saturday today card', (await txt(p, '#today-body')).includes('No lessons today.'));
    });
    await at(new Date('2026-10-19T23:59:00+05:00'), async p => {
        await p.clock.runFor(60 * 1000 + 15000);
        ok('midnight: date rolls to Tuesday', (await txt(p, '#today-h')) === 'Today, Tue 20 Oct', await txt(p, '#today-h'));
        ok('midnight: first lesson Physics', (await txt(p, '#now-body')).includes('First lesson today: Physics at 08:30'));
    });

    // ---------- 7. Week A and Week B, holidays, settings ----------
    ({ ctx, page } = await newPage(null, AT('10:10'), seed(st)));
    await page.check('#s-ab');
    ok('A/B on: this week is A', await page.isChecked('#ab-a'));
    ok('A/B on: message', (await txt(page, '#hol-msg')).includes('This week is now Week A'));
    ok('A/B legend shows the week', (await txt(page, '#ab-legend')) === 'This week (from Mon 19 Oct) is');
    ok('today shows week A', (await txt(page, '#today-h')) === 'Today, Mon 19 Oct · Week A');
    // Computer Science on Friday only in Week B: edit it
    await page.click('button[aria-label="Edit Computer Science"]');
    ok('edit form title', (await txt(page, '#form-h')) === 'Edit Computer Science');
    ok('week choice visible in A/B mode', await page.locator(rowSel(1, '.week-sel')).isVisible());
    await page.selectOption(rowSel(1, '.week-sel'), 'B');
    await page.click('#save');
    ok('saved message', (await txt(page, '#list-msg')).includes('Computer Science saved.'));
    ok('box says Week B only', (await box(page, 'Computer Science').innerText()).includes('Fri 10:50 – 11:50 · IT 1 · Week B only'));
    ok('week A grid Friday has 2', (await page.locator('.wday').nth(4).locator('.wl').count()) === 2);
    await page.click('#show-b');
    ok('week B grid Friday has 3', (await page.locator('.wday').nth(4).locator('.wl').count()) === 3);
    ok('week B: today not marked', (await page.locator('.wday.is-today').count()) === 0);
    ok('week buttons say which is this week', (await txt(page, '#show-a')) === 'Week A (this week)');
    // the week after is B: check through the core with the real state
    st = await savedState(page);
    ok('next week is B', await page.evaluate(s => TimetableCore.weekLetter('2026-10-26', TimetableCore.validate(s)), st) === 'B');
    await page.check('#ab-b');
    ok('switch this week to B', (await txt(page, '#today-h')) === 'Today, Mon 19 Oct · Week B');
    await page.check('#ab-a');
    // holiday validation and add
    await page.click('#o-hol');
    await page.fill('#h-name', 'Half term');
    await page.click('#h-add');
    ok('holiday needs a first day', (await txt(page, '#e-hol')).includes('first day'));
    await page.fill('#h-from', '2026-11-01'); await page.fill('#h-to', '2026-10-26');
    await page.click('#h-add');
    ok('holiday last before first', (await txt(page, '#e-hol')).includes('before the first'));
    await page.fill('#h-from', '2026-10-26'); await page.fill('#h-to', '2026-11-01');
    await page.click('#h-add');
    ok('holiday added', (await txt(page, '#hol-list')).includes('Half term') && (await txt(page, '#hol-list')).includes('Mon 26 Oct to Sun 1 Nov (7 days)'));
    await page.click('#o-hol'); await page.fill('#h-from', '2026-12-03'); await page.click('#h-add');
    ok('one-day holiday, default name', (await txt(page, '#hol-list')).includes('Holiday') && (await txt(page, '#hol-list')).includes('Thu 3 Dec (1 day)'));
    await page.click('button[aria-label="Delete Holiday"]');
    ok('holiday delete has undo', (await txt(page, '#hol-msg')).includes('Holiday deleted.') && await page.locator('#hol-msg .undo').isVisible());
    await page.click('#hol-msg .undo');
    ok('holiday undo', (await txt(page, '#hol-list')).includes('Thu 3 Dec'));
    await page.click('button[aria-label="Delete Holiday"]');
    // 12-hour clock
    await page.selectOption('#s-clock', '12');
    ok('12-hour times', (await txt(page, '#now-body')).includes('Chemistry at 10:50 am') && (await txt(page, '#today-body')).includes('1:00 pm'));
    await page.selectOption('#s-clock', 'auto');
    ok('auto clock in en-GB is 24-hour', (await txt(page, '#today-body')).includes('13:00'));
    // calendar file
    await page.click('#cal');
    ok('calendar needs a date', (await txt(page, '#e-cal')).includes('last day of term'));
    await page.fill('#c-until', '2026-10-01'); await page.click('#cal');
    ok('calendar past date refused', (await txt(page, '#e-cal')).includes('has passed'));
    await page.fill('#c-until', '2026-12-18');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#cal')]);
    const ics = fs.readFileSync(await dl.path(), 'utf8');
    ok('ics name', dl.suggestedFilename() === 'class-timetable.ics');
    ok('ics has 16 lessons', (ics.match(/BEGIN:VEVENT/g) || []).length === 16, (ics.match(/BEGIN:VEVENT/g) || []).length);
    ok('ics weekly rule until end of term', ics.includes('RRULE:FREQ=WEEKLY;INTERVAL=1;UNTIL=20261218T235959'));
    ok('ics week B lesson every 2 weeks, first on Fri 30 Oct', /DTSTART:20261030T105000\r\nDTEND:20261030T115000\r\nRRULE:FREQ=WEEKLY;INTERVAL=2/.test(ics));
    ok('ics skips half term', ics.includes('EXDATE:20261026T083000'));
    ok('ics room', ics.includes('LOCATION:Room 12') && ics.includes('LOCATION:Lab B4'));
    ok('ics CRLF', ics.includes('\r\n'));
    ok('calendar message', (await txt(page, '#tools-msg')).includes('16 repeating lessons until Fri 18 Dec'));
    st = await savedState(page);
    ok('term end remembered', st.termEnd === '2026-12-18');
    // week starts on Sunday: days order and A/B kept
    await page.selectOption('#s-start', '0');
    ok('week start Sunday keeps this week A', await page.isChecked('#ab-a'));
    ok('A/B legend from Sunday', (await txt(page, '#ab-legend')) === 'This week (from Sun 18 Oct) is');
    await page.selectOption('#s-start', '1');
    st = await savedState(page);
    await ctx.close();

    await at(new Date('2026-10-28T09:00:00+05:00'), async p => {
        const n = await txt(p, '#now-body');
        ok('in half term', n.includes('Holiday: Half term') && n.includes('No lessons until Mon 2 Nov.') && n.includes('Next school day: Mon 2 Nov'), n);
        ok('holiday today card', (await txt(p, '#today-body')).includes('Holiday: Half term'));
    });
    await at(new Date('2026-10-23T16:00:00+05:00'), async p => {
        ok('friday before half term: next school day is after it', (await txt(p, '#tom-h')) === 'Next school day, Mon 2 Nov · Week A', await txt(p, '#tom-h'));
    });

    // ---------- 8. edit, clash, duplicate, delete, undo ----------
    ({ ctx, page } = await newPage(null, AT('10:10'), seed(st)));
    await page.click('#open-form');
    await page.fill('#f-name', 'maths');
    await page.dispatchEvent('#f-name', 'input');
    ok('duplicate name hint', (await txt(page, '#h-dup')).includes('You already have Maths'));
    await page.fill('#f-name', 'Urdu');
    await page.selectOption(rowSel(0, '.day-sel'), { label: 'Monday' });
    await page.fill(rowSel(0, '.start'), '09:00'); await page.fill(rowSel(0, '.end'), '09:45');
    await page.click('#save');
    ok('clash said when added', (await txt(page, '#form-msg')).includes('clashes'));
    ok('clash in box', (await box(page, 'Urdu').innerText()).includes('Clash: Mon 09:00 – 09:45 overlaps Maths 08:30 – 09:30'));
    ok('clash shown on the other box too', (await box(page, 'Maths').innerText()).includes('overlaps Urdu'));
    ok('optional room not forced', (await savedState(page)).subjects.find(s => s.name === 'Urdu').times[0].room === '');
    await page.click('#cancel');
    await page.click('button[aria-label="Edit Urdu"]');
    await page.fill(rowSel(0, '.start'), '14:00'); await page.fill(rowSel(0, '.end'), '14:45'); await page.fill(rowSel(0, '.room'), 'Room 3');
    await page.click('#save');
    const urdu = await box(page, 'Urdu').innerText();
    ok('edit fixes the clash', !urdu.includes('Clash') && urdu.includes('Mon 14:00 – 14:45 · Room 3'), urdu);
    ok('typed Room 3 not doubled', !urdu.includes('Room Room'));
    await page.click('button[aria-label="Edit Urdu"]');
    await page.click('#del');
    ok('deleted with undo', (await txt(page, '#list-msg')).includes('Urdu deleted.') && (await box(page, 'Urdu').count()) === 0);
    await page.click('#list-msg .undo');
    ok('undo brings it back', (await box(page, 'Urdu').count()) === 1);
    // very long name and pasted text with spaces
    await page.click('#open-form');
    await page.fill('#f-name', '   Further   Mathematics with Statistics and Mechanics for the Advanced Level Course   ');
    await page.fill(rowSel(0, '.start'), '15:00'); await page.fill(rowSel(0, '.end'), '16:00');
    await page.click('#save');
    st = await savedState(page);
    ok('long pasted name trimmed and capped', st.subjects.some(s => s.name.startsWith('Further Mathematics with') && s.name.length <= 60));
    ok('long name: no sideways scroll', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    // backup and restore
    const [bk] = await Promise.all([page.waitForEvent('download'), page.click('#backup')]);
    const backup = fs.readFileSync(await bk.path(), 'utf8');
    ok('backup has subjects', JSON.parse(backup).subjects.length === 9);
    await page.click('#wipe');
    ok('delete everything', (await page.locator('#subj-list > li').count()) === 0 && (await txt(page, '#tools-msg')).includes('Everything was deleted.'));
    ok('after delete: setup again', await page.evaluate(() => document.getElementById('app').classList.contains('setup')));
    await page.click('#tools-msg .undo');
    ok('undo delete everything', (await page.locator('#subj-list > li').count()) === 9);
    await page.click('#wipe');
    const bad = path.join(__dirname, '..', 'node_modules', '.bad-backup.json'); fs.writeFileSync(bad, '{"hello":1}');
    await page.setInputFiles('#restore-file', bad);
    await page.waitForTimeout(300);
    ok('bad backup refused', (await txt(page, '#tools-msg')).includes('not a Class Timetable backup'));
    const good = path.join(__dirname, '..', 'node_modules', '.good-backup.json'); fs.writeFileSync(good, backup);
    await page.setInputFiles('#restore-file', good);
    await page.waitForTimeout(300);
    ok('restore backup', (await page.locator('#subj-list > li').count()) === 9 && (await txt(page, '#tools-msg')).includes('Restored 9 subjects'));
    ok('restored A/B and holidays', (await savedState(page)).ab === true && (await savedState(page)).holidays.length === 1);
    fs.unlinkSync(bad); fs.unlinkSync(good);
    await ctx.close();

    // ---------- 9. corrupt and blocked storage ----------
    ({ ctx, page } = await newPage(null, AT('10:10'), 'localStorage.setItem(' + JSON.stringify(KEY) + ', "{bad json")'));
    ok('corrupt state: fresh start', (await page.locator('#subj-list > li').count()) === 0 && (await txt(page, '#tools-msg')).includes('could not be read'));
    await ctx.close();
    ({ ctx, page } = await newPage(null, AT('10:10'), 'localStorage.setItem(' + JSON.stringify(KEY) + ', JSON.stringify({subjects:[{name:"Art",times:[{day:9,s:1,e:2},{day:1,s:600,e:540},{day:1,s:600,e:660,room:5}]},{name:""}],holidays:[{from:"2026-13-01",to:"x"}],ab:true}))'));
    const bv = await savedState(page);
    ok('bad values dropped', bv.subjects.length === 1 && bv.subjects[0].times.length === 1 && bv.subjects[0].times[0].room === '' && bv.holidays.length === 0 && bv.ab === false, bv);
    await ctx.close();
    ({ ctx, page } = await newPage(null, AT('10:10'), 'Object.defineProperty(window, "localStorage", { get() { throw new Error("blocked"); } })'));
    ok('blocked storage warns', await page.locator('#storage-warn').isVisible());
    await add(page, AYESHA[0]);
    ok('blocked storage still works for now', (await txt(page, '#now-body')).includes('Maths'));
    await ctx.close();

    // ---------- 10. screen sizes with a full timetable, and the cleared state ----------
    st.subjects = st.subjects.filter(s => s.name !== 'Further Mathematics with Statistics and Mechanics for the Advanced Level Course'.slice(0, 60));
    const WIDTHS = [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920];
    for (const scheme of ['dark', 'light']) for (const filled of [true, false]) {
        const r = await newPage({ colorScheme: scheme }, AT('10:10'), filled ? seed(st) : null);
        for (const w of WIDTHS) {
            await r.page.setViewportSize({ width: w, height: 900 });
            if (w <= 390 && filled) { await r.page.click('#open-form').catch(() => {}); await r.page.click('#add-row'); await r.page.click('#o-more').catch(() => {}); await r.page.click('#o-hol').catch(() => {}); }
            const tag = scheme + ' ' + w + (filled ? ' filled' : ' empty');
            ok('no sideways scroll ' + tag, await r.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
            const out = await r.page.evaluate(() => [...document.querySelectorAll('main *')].filter(e => { const b = e.getBoundingClientRect(); return b.width > 0 && (b.right > innerWidth + 1 || b.left < -1) && getComputedStyle(e).position !== 'fixed'; }).slice(0, 3).map(e => e.tagName + '.' + e.className));
            ok('nothing sticks out ' + tag, !out.length, out);
            if (w >= 900) for (const pos of [0, 0.5, 1]) {
                await r.page.evaluate(p => scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * p), pos);
                const o = await r.page.evaluate(() => { const bad = []; document.querySelectorAll('main, .col-main, .col-side').forEach(h => { const k = [...h.children].filter(c => c.getBoundingClientRect().height > 4); for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { const a = k[i].getBoundingClientRect(), b = k[j].getBoundingClientRect(); if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 4 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 4) bad.push(k[i].id + '/' + k[j].id); } }); return bad; });
                ok('no overlap after scroll ' + tag + ' ' + pos, !o.length, o);
            }
            if (w <= 390) {
                const c = await r.page.evaluate(() => { const k = [...document.querySelectorAll('input:not([type=hidden]):not([type=radio]):not([type=checkbox]), select, button, textarea, a.secondary')].filter(e => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0; }); const bad = []; for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { if (k[i].contains(k[j]) || k[j].contains(k[i])) continue; const a = k[i].getBoundingClientRect(), b = k[j].getBoundingClientRect(); if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2) bad.push((k[i].id || k[i].className) + '/' + (k[j].id || k[j].className)); } return bad.slice(0, 4); });
                ok('controls do not overlap ' + tag, !c.length, c);
                const ph = await r.page.evaluate(() => [...document.querySelectorAll('input[placeholder], textarea[placeholder]')].filter(e => e.offsetWidth > 0).filter(e => { const c = document.createElement('canvas').getContext('2d'); const cs = getComputedStyle(e); c.font = cs.fontSize + ' ' + cs.fontFamily; return c.measureText(e.placeholder).width > e.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) + 1; }).map(e => e.id || e.className));
                ok('placeholders fit ' + tag, !ph.length, ph);
            }
        }
        if (filled && scheme === 'dark') {
            // the light/dark switch
            const tg = r.page.locator('.theme-toggle');
            if (await tg.count()) { await tg.click(); ok('theme switch to light', await r.page.evaluate(() => document.documentElement.dataset.theme) === 'light'); await tg.click(); }
        }
        await r.ctx.close();
    }

    // ---------- 11. screenshots ----------
    if (SHOTS) {
        let r = await newPage({ viewport: { width: 1280, height: 900 } }, AT('10:10'), seed(st));
        await r.page.evaluate(() => { document.querySelector('#open-form') && document.querySelector('#open-form').click(); });
        await r.page.fill('#f-name', 'Biology');
        await r.page.selectOption(rowSel(0, '.day-sel'), { label: 'Tuesday' }); await r.page.fill(rowSel(0, '.start'), '10:50'); await r.page.fill(rowSel(0, '.end'), '11:50'); await r.page.fill(rowSel(0, '.room'), '3');
        await r.page.evaluate(() => scrollTo(0, 0));
        await r.page.screenshot({ path: path.join(__dirname, 'screenshots/desktop.png') });
        await r.ctx.close();
        r = await newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }, AT('10:10'), seed(st));
        await r.page.screenshot({ path: path.join(__dirname, 'screenshots/phone.png') });
        await r.ctx.close();
    }

    ok('no console errors', errors.length === 0, errors);
    ok('no failed requests', failed.length === 0, failed);
    const need = ['manifest.webmanifest', 'favicon.svg', 'style.css', 'core.js', 'script.js', 'theme.js', 'help.js'];
    need.filter(f => !/manifest|favicon/.test(f)).forEach(f => ok('requested ' + f, [...requested].some(u => u.endsWith('/' + f))));
    // every file the app links to or caches answers 200
    const files = ['', 'index.html', 'style.css', 'core.js', 'script.js', 'sw.js', 'favicon.svg', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', '../theme.js', '../help.js', '../'];
    const rq = await browser.newContext();
    for (const f of files) { const res = await rq.request.get(URL + f); ok('200 for ' + (f || './'), res.status() === 200, res.status()); }
    await rq.close();
    await browser.close(); if (srv) srv.close();
    console.log((fail ? 'FAILED ' + fail + ' of ' + (pass + fail) : 'ALL ' + pass + ' UI CHECKS PASSED') + ' (' + (process.env.BASE ? 'live' : 'local') + ')');
    process.exit(fail ? 1 : 0);
})();
