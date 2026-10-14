// Drives the real page in headless Chromium: node ui-test.js [--shots] [--base https://umar8092.github.io/apps]
// Without --base it serves this repo on localhost. With --base it tests the LIVE page. The clock is Wed 14 Oct 2026, 10:00.
const pw = (() => { for (const m of ['playwright', 'playwright-core']) { try { return require(m); } catch (e) { /* next */ } } throw new Error('playwright not found'); })();
const path = require('path'), fs = require('fs'), http = require('http'), os = require('os');
const bi = process.argv.indexOf('--base');
const shots = process.argv.includes('--shots');
let fail = 0, url;
const ok = (name, cond, extra) => { if (!cond) fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond || extra == null ? '' : '  -> ' + JSON.stringify(extra))); };
const NOW = new Date(2026, 9, 14, 10, 0).getTime();
const SLUG = 'study-planner-and-exam-countdown', KEY = SLUG + '.state';

function serve() {
    const ROOT = path.resolve(__dirname, '..');
    const types = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml', png: 'image/png', webmanifest: 'application/manifest+json' };
    return new Promise(res => {
        const s = http.createServer((req, rs) => {
            let p = decodeURIComponent(req.url.split('?')[0]).replace(/^\/apps/, ''); if (p.endsWith('/')) p += 'index.html';
            const f = path.join(ROOT, p);
            if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rs.writeHead(404); return rs.end('nf'); }
            rs.writeHead(200, { 'content-type': types[f.split('.').pop()] || 'application/octet-stream' }); rs.end(fs.readFileSync(f));
        }).listen(0, () => res(s));
    });
}

// Ayesha's four exams; she studied Algebra and Quadratic equations on the last two days and keeps Fridays free
function seed() {
    const t = (id, name, done) => ({ id, name, done: done || null });
    return { v: 1, seq: 100, rest: [5], off: ['2026-10-31'], exams: [
        { id: 'e1', name: 'Maths', date: '2026-10-26', time: '09:00', place: 'Hall 3', rev: 1, topics: [t('t1', 'Algebra', '2026-10-12'), t('t2', 'Quadratic equations', '2026-10-13'), t('t3', 'Geometry'), t('t4', 'Trigonometry'), t('t5', 'Statistics'), t('t6', 'Probability'), t('t7', 'Vectors'), t('t8', 'Calculus')] },
        { id: 'e2', name: 'Physics', date: '2026-10-29', time: '13:30', place: '', rev: 1, topics: [t('t9', 'Motion and forces'), t('t10', 'Energy'), t('t11', 'Waves'), t('t12', 'Electricity'), t('t13', 'Magnetism'), t('t14', 'Atomic physics')] },
        { id: 'e3', name: 'Chemistry', date: '2026-11-03', time: '', place: '', rev: 2, topics: [t('t15', 'Atomic structure'), t('t16', 'Bonding'), t('t17', 'Moles'), t('t18', 'Acids and bases'), t('t19', 'Organic chemistry 1'), t('t20', 'Organic chemistry 2'), t('t21', 'Rates of reaction')] },
        { id: 'e4', name: 'English Literature', date: '2026-11-06', time: '', place: '', rev: 1, topics: [t('t22', 'Macbeth'), t('t23', 'An Inspector Calls'), t('t24', 'Poetry anthology'), t('t25', 'Unseen poetry')] }] };
}

async function load(b, vp, opt = {}) {
    const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: vp.width < 500 ? 2 : 1, colorScheme: opt.theme || 'dark', locale: opt.locale || 'en-GB',
        permissions: ['clipboard-read', 'clipboard-write'], acceptDownloads: true, serviceWorkers: 'block' });
    await ctx.route(/goatcounter\.com|gc\.zgo\.at/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
    if (opt.state !== undefined) await ctx.addInitScript(([k, s]) => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem(k, s); } }, [KEY, typeof opt.state === 'string' ? opt.state : JSON.stringify(opt.state)]);
    if (opt.block) await ctx.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
    const p = await ctx.newPage();
    await p.clock.install({ time: opt.time || NOW });
    p.errors = []; p.on('console', m => m.type() === 'error' && p.errors.push(m.text())); p.on('pageerror', e => p.errors.push(String(e)));
    p.bad = []; p.on('response', r => { if (r.status() >= 400) p.bad.push(r.status() + ' ' + r.url()); });
    await p.goto(url, { waitUntil: 'networkidle' });
    return p;
}
const txt = async (p, sel) => ((await p.innerText(sel)) || '').replace(/\s+/g, ' ').trim();
const saved = p => p.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
const noScroll = p => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
const box = (p, name) => p.locator('.exam', { has: p.locator('.ex-name', { hasText: new RegExp('^' + name + '$') }) });
const todayTopics = p => p.$$eval('#today-items .it-topic .it-name', l => l.map(e => e.textContent));
async function addExam(p, o) {
    if (await p.isVisible('#add-open')) await p.click('#add-open');
    await p.fill('#a-name', o.name); await p.fill('#a-date', o.date || '');
    if (o.time || o.place) { if (await p.isVisible('#a-more-open')) await p.click('#a-more-open'); if (o.time) await p.fill('#a-time', o.time); if (o.place) await p.fill('#a-place', o.place); }
    if (o.topics != null) await p.fill('#a-topics', o.topics);
    if (o.rev != null) await p.selectOption('#a-rev', String(o.rev));
    await p.click('#a-save');
}
const overlaps = p => p.evaluate(() => {
    const els = [...document.querySelectorAll('input:not([type=file]):not([type=checkbox]), select, button, textarea, a.back')].filter(e => e.offsetParent && e.getClientRects().length && e.checkVisibility());
    const r = els.map(e => e.getBoundingClientRect()), bad = [];
    for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) {
        if (els[i].contains(els[j]) || els[j].contains(els[i])) continue;
        const x = Math.min(r[i].right, r[j].right) - Math.max(r[i].left, r[j].left), y = Math.min(r[i].bottom, r[j].bottom) - Math.max(r[i].top, r[j].top);
        if (x > 1 && y > 1) bad.push((els[i].id || els[i].textContent.trim().slice(0, 20)) + ' / ' + (els[j].id || els[j].textContent.trim().slice(0, 20)));
    }
    return bad;
});
const placeholdersFit = p => p.evaluate(() => [...document.querySelectorAll('input[placeholder], textarea[placeholder]')].filter(i => i.offsetParent).filter(i => {
    const c = document.createElement('canvas').getContext('2d'), s = getComputedStyle(i); c.font = s.fontWeight + ' ' + s.fontSize + ' ' + s.fontFamily;
    return i.placeholder.split('\n').some(line => c.measureText(line).width > i.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight) + 1);
}).map(i => i.id + ':' + i.placeholder));
const blocksOverlap = p => p.evaluate(() => {
    const bad = [];
    document.querySelectorAll('main, .col-main, .col-side').forEach(m => {
        const kids = [...m.children].filter(k => k.getClientRects().length && getComputedStyle(k).display !== 'contents' && getComputedStyle(k).position !== 'absolute'), r = kids.map(k => k.getBoundingClientRect());
        for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) {
            const x = Math.min(r[i].right, r[j].right) - Math.max(r[i].left, r[j].left), y = Math.min(r[i].bottom, r[j].bottom) - Math.max(r[i].top, r[j].top);
            if (x > 1 && y > 1) bad.push(kids[i].className + ' / ' + kids[j].className);
        }
    });
    return bad;
});

(async () => {
    let srv;
    if (bi > 0) url = process.argv[bi + 1].replace(/\/$/, '') + '/' + SLUG + '/';
    else { srv = await serve(); url = 'http://localhost:' + srv.address().port + '/apps/' + SLUG + '/'; }
    const b = await pw.chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
    let p;

    // 1. first use: empty, the add form is open, nothing is forced
    p = await load(b, { width: 390, height: 844 });
    ok('first use: add form open', await p.isVisible('#add-form') && !(await p.isVisible('#add-open')));
    ok('first use: no Cancel when there is nothing to go back to', !(await p.isVisible('#a-cancel')));
    ok('first use: Today explains what to do', /No exams yet\. Add your first exam/.test(await txt(p, '#today')));
    ok('first use: plan hidden', !(await p.isVisible('#plan')));
    ok('first use: time and place hidden behind a button', !(await p.isVisible('#a-time')) && await p.isVisible('#a-more-open'));
    ok('first use: 1 revision day by default', await p.inputValue('#a-rev') === '1');
    // 2. mistakes are explained
    await p.click('#a-save');
    ok('blank subject refused', /Type the subject/.test(await txt(p, '#a-name-err')) && await p.getAttribute('#a-name', 'aria-invalid') === 'true');
    await p.fill('#a-name', 'Maths'); await p.click('#a-save');
    ok('blank date refused', /Pick the date/.test(await txt(p, '#a-date-err')));
    await p.fill('#a-date', '2026-10-01'); await p.click('#a-save');
    ok('past date refused', /has passed/.test(await txt(p, '#a-date-err')));
    await p.fill('#a-date', '2031-01-01'); await p.click('#a-save');
    ok('far future refused', /next 3 years/.test(await txt(p, '#a-date-err')));
    ok('nothing saved yet', (await saved(p)) === null);
    // 3. the real situation: Ayesha adds her exams, pasting topics from her syllabus
    await p.fill('#a-name', '   '); await p.fill('#a-name', 'Maths');
    await p.fill('#a-date', '2026-10-26'); await p.click('#a-more-open'); await p.fill('#a-time', '09:00'); await p.fill('#a-place', 'Hall 3');
    await p.fill('#a-topics', '1. Algebra\n2. Quadratic equations\n3. Geometry\n4. Trigonometry\n\n5. Statistics\n6. Probability\n7. Vectors\n8. Calculus\n8. Calculus');
    await p.click('#a-save');
    ok('exam added message', /Maths added: in 12 days, 8 topics \(1 repeat skipped\)/.test(await txt(p, '#exams-msg')), await txt(p, '#exams-msg'));
    ok('form closes and resets', !(await p.isVisible('#add-form')) && await p.isVisible('#add-open'));
    ok('numbering removed from topics', (await p.$$eval('.exam .it-name', l => l.map(e => e.textContent))).join('|') === 'Algebra|Quadratic equations|Geometry|Trigonometry|Statistics|Probability|Vectors|Calculus');
    ok('exam box: date, time, place, countdown', /Maths In 12 days Mon,? 26 Oct 2026 · 0?9:00 · Hall 3 0 of 8 topics done/.test(await txt(p, '.exam')), await txt(p, '.exam'));
    ok('countdown tile: 12 days', /Maths 12 days left Mon,? 26 Oct/.test(await txt(p, '#countdown')));
    ok('today: Algebra', (await todayTopics(p)).join() === 'Algebra');
    ok('plan shown', /8 topics left over 12 study days: at most 1 topic a day/.test(await txt(p, '#plan-sum')), await txt(p, '#plan-sum'));
    ok('box says when topics are done', /New topics done by Fri,? 23 Oct, then 1 revision day \(Sun,? 25 Oct\)/.test(await txt(p, '.exam .ex-note')), await txt(p, '.exam .ex-note'));
    await addExam(p, { name: 'Physics', date: '2026-10-29', topics: 'Motion and forces, Energy, Waves, Electricity, Magnetism, Atomic physics' });
    ok('commas split topics', (await box(p, 'Physics').locator('.it-name').count()) === 6);
    ok('optional time and place not forced', (await saved(p)).exams[1].time === '' && (await saved(p)).exams[1].place === '');
    await addExam(p, { name: 'maths', date: '2026-10-26' });
    ok('same exam twice refused', /already in your list/.test(await txt(p, '#a-name-err')));
    await p.click('#a-cancel');
    ok('Cancel closes the form', !(await p.isVisible('#add-form')));
    await addExam(p, { name: 'Chemistry', date: '2026-11-03', topics: '- Atomic structure\n- Bonding\n- Moles\n- Acids and bases\n- Organic chemistry 1\n- Organic chemistry 2\n- Rates of reaction', rev: 2 });
    await p.click('#add-open'); await p.fill('#a-name', 'English Literature');
    await p.fill('#a-date', '2026-11-06'); await p.fill('#a-topics', 'Macbeth\nAn Inspector Calls\nPoetry anthology\nUnseen poetry'); await p.press('#a-name', 'Enter');
    ok('Enter adds the exam', (await saved(p)).exams.length === 4);
    ok('countdown has 4 exams in date order', (await p.$$eval('.cd-name', l => l.map(e => e.textContent))).join() === 'Maths,Physics,Chemistry,English Literature');
    ok('exam boxes in date order', (await p.$$eval('.ex-name', l => l.map(e => e.textContent))).join() === 'Maths,Physics,Chemistry,English Literature');
    ok('plan: 25 topics, up to 2 a day', /25 topics left over 23 study days: up to 2 topics a day/.test(await txt(p, '#plan-sum')), await txt(p, '#plan-sum'));
    ok('plan: exam day line', /EXAM: Maths at 0?9:00, Hall 3/.test(await txt(p, '#days')));
    ok('plan: revision line', /Revise Maths: go over all 8 topics/.test(await txt(p, '#days')));
    ok('plan: 14 days then Show more', (await p.locator('#days > li').count()) === 14 && await p.isVisible('#more'));
    await p.click('#more');
    ok('Show more shows every day to the last exam', (await p.locator('#days > li').count()) === 23 && !(await p.isVisible('#more')));
    // 4. tick today's topic: stays on the list, saved
    const planBefore = await txt(p, '#days');
    await p.check('#today-items input[type=checkbox]');
    ok('ticked: done for today', /Done for today/.test(await txt(p, '#today-progress')));
    ok('ticked: still on today\'s list', (await todayTopics(p)).join() === 'Algebra');
    ok('ticked: rest of the plan unchanged', planBefore === await txt(p, '#days'));
    ok('ticked: progress in the box', /1 of 8 topics done/.test(await txt(p, '.exam >> nth=0')));
    ok('ticked: saved with today\'s date', (await saved(p)).exams[0].topics[0].done === '2026-10-14');
    await p.reload({ waitUntil: 'networkidle' });
    ok('reload keeps everything', (await p.locator('.exam').count()) === 4 && /Done for today/.test(await txt(p, '#today-progress')));
    await p.uncheck('#today-items input[type=checkbox]');
    ok('untick works', /0 of 1 topic done today/.test(await txt(p, '#today-progress')));
    // studied ahead: tick a Chemistry topic in its box
    await box(p, 'Chemistry').locator('label:has-text("Rates of reaction") input').check();
    ok('studied ahead: joins today\'s list ticked', (await todayTopics(p)).includes('Rates of reaction'));
    ok('studied ahead: one fewer left', /24 topics left/.test(await txt(p, '#plan-sum')));
    await box(p, 'Chemistry').locator('label:has-text("Rates of reaction") input').uncheck();
    // 5. edit topics as text: rename, add, delete, ticks kept, undo
    await p.check('#today-items input[type=checkbox]');
    await box(p, 'Maths').locator('text=Add or edit topics').click();
    ok('topics editor prefilled', (await p.inputValue('#tp-text')).split('\n').length === 8);
    await p.fill('#tp-text', 'Algebra\nGeometry\nTrig and bearings\nStatistics\nProbability\nVectors\nCalculus\nSets');
    await p.click('text=Save topics');
    ok('topics saved message', /Maths: 8 topics saved/.test(await txt(p, '#exams-msg')));
    const m1 = (await saved(p)).exams[0].topics;
    ok('tick kept on unchanged topic', m1[0].name === 'Algebra' && m1[0].done === '2026-10-14');
    ok('rename and delete applied', m1.map(t => t.name).join() === 'Algebra,Geometry,Trig and bearings,Statistics,Probability,Vectors,Calculus,Sets');
    await p.click('#exams-msg .undo');
    ok('undo brings the old topics back', (await saved(p)).exams[0].topics.map(t => t.name).includes('Quadratic equations'));
    // typing in the editor survives a tick elsewhere
    await box(p, 'Physics').locator('text=Add or edit topics').click();
    await p.fill('#tp-text', 'Motion\nEnergy\nNEW LINE');
    await p.uncheck('#today-items input[type=checkbox]');
    ok('typed topics kept while the page updates', (await p.inputValue('#tp-text')) === 'Motion\nEnergy\nNEW LINE');
    await box(p, 'Physics').locator('.panel >> text=Cancel').click();
    ok('cancel leaves topics as they were', (await saved(p)).exams[1].topics.length === 6);
    // 6. edit an exam: a mistake is refused, a change moves the plan, undo
    await box(p, 'Physics').locator('text=Edit exam').click();
    await p.fill('#ed-date', '2026-10-02'); await p.click('text=Save changes');
    ok('edit: past date refused', /has passed/.test(await txt(p, '#ed-date-err')));
    await p.fill('#ed-name', ''); await p.fill('#ed-date', '2026-10-30'); await p.click('text=Save changes');
    ok('edit: blank subject refused', /Type the subject/.test(await txt(p, '#ed-name-err')));
    await p.fill('#ed-name', 'Physics Paper 1'); await p.selectOption('#ed-rev', '3'); await p.fill('#ed-place', 'Room 12'); await p.click('text=Save changes');
    const ph = (await saved(p)).exams.find(e => e.name === 'Physics Paper 1');
    ok('edit saved', ph && ph.date === '2026-10-30' && ph.rev === 3 && ph.place === 'Room 12');
    ok('edit: 3 revision days shown', /then 3 revision days/.test(await txt(p, '.exam >> nth=1')), await txt(p, '.exam >> nth=1'));
    await p.click('#exams-msg .undo');
    ok('edit undone', (await saved(p)).exams.some(e => e.name === 'Physics' && e.date === '2026-10-29'));
    // 7. delete an exam, undo
    await box(p, 'English Literature').locator('text=Delete').click();
    ok('deleted', (await p.locator('.exam').count()) === 3 && /English Literature deleted/.test(await txt(p, '#exams-msg')));
    await p.click('#exams-msg .undo');
    ok('delete undone', (await p.locator('.exam').count()) === 4);
    // 8. study days: Fridays off, a day off, can't remove every day
    await p.click('#week >> text=Fri');
    ok('Friday off', /No study on Friday/.test(await txt(p, '#week-hint')) && await p.getAttribute('#week >> text=Fri', 'aria-pressed') === 'true');
    ok('plan shows Friday as rest day', /Fri,? 16 Oct Rest day/.test(await txt(p, '#days')));
    for (const d of ['Mon', 'Tue', 'Wed', 'Thu', 'Sat']) await p.click('#week >> text=' + d);
    await p.click('#week >> text=Sun');
    ok('the last study day of the week cannot be removed', /at least one study day/.test(await txt(p, '#week-err')) && (await saved(p)).rest.length === 6);
    for (const d of ['Mon', 'Tue', 'Wed', 'Thu', 'Sat']) await p.click('#week >> text=' + d);
    ok('weekdays back', (await saved(p)).rest.join() === '5');
    await p.click('#off-add'); ok('day off: blank refused', /Pick the date/.test(await txt(p, '#off-err')));
    await p.fill('#off-date', '2026-10-10'); await p.click('#off-add'); ok('day off: past refused', /has passed/.test(await txt(p, '#off-err')));
    await p.fill('#off-date', '2026-10-15'); await p.click('#off-add');
    ok('day off added', /Thu,? 15 Oct 2026/.test(await txt(p, '#offs')) && /Thu,? 15 Oct Tomorrow · Day off/.test(await txt(p, '#days')));
    await p.fill('#off-date', '2026-10-15'); await p.click('#off-add'); ok('day off: twice refused', /already a day off/.test(await txt(p, '#off-err')));
    await p.click('#offs .x');
    ok('day off removed', (await saved(p)).off.length === 0);
    // 9. sharing: copy, email, calendar, backup, restore
    await p.click('#copy');
    const clip = await p.evaluate(() => navigator.clipboard.readText());
    ok('copy: countdown and plan', /Maths: Mon,? 26 Oct 2026 at 0?9:00, Hall 3 \(in 12 days\)/.test(clip) && /Today, Wed,? 14 Oct:/.test(clip) && /Fri,? 16 Oct: rest day/.test(clip), clip.slice(0, 300));
    const mailHref = await p.evaluate(() => new Promise(res => { const real = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { if (this.href.startsWith('mailto:')) { HTMLAnchorElement.prototype.click = real; res(this.href); } else real.call(this); }; document.getElementById('email').click(); setTimeout(() => res(null), 500); }));
    ok('email: mailto with no address needed', !!mailHref && mailHref.startsWith('mailto:?subject=') && decodeURIComponent(mailHref).includes('EXAM: Maths'), mailHref && mailHref.slice(0, 80));
    ok('email: short enough for mail apps', !!mailHref && mailHref.length < 4300);
    let [dl] = await Promise.all([p.waitForEvent('download'), p.click('#cal')]);
    const icsText = fs.readFileSync(await dl.path(), 'utf8');
    ok('calendar file: 4 exams with reminders', dl.suggestedFilename() === 'exams.ics' && (icsText.match(/BEGIN:VEVENT/g) || []).length === 4 && /TRIGGER:-P1D/.test(icsText));
    [dl] = await Promise.all([p.waitForEvent('download'), p.click('#backup')]);
    const backupPath = path.join(os.tmpdir(), 'spc-backup.json'); await dl.saveAs(backupPath);
    ok('backup file name', /^study-plan-backup-2026-10-14\.json$/.test(dl.suggestedFilename()));
    await p.click('#wipe');
    ok('delete everything', (await p.locator('.exam').count()) === 0 && await p.isVisible('#add-form'));
    await p.click('#tools-msg .undo');
    ok('delete everything undone', (await p.locator('.exam').count()) === 4);
    await p.click('#wipe');
    await p.setInputFiles('#restore-file', backupPath);
    await p.waitForTimeout(200);
    ok('restore a backup', /Backup restored: 4 exams/.test(await txt(p, '#tools-msg')) && (await p.locator('.exam').count()) === 4);
    const badPath = path.join(os.tmpdir(), 'spc-bad.json'); fs.writeFileSync(badPath, '{"hello":1}');
    await p.setInputFiles('#restore-file', badPath); await p.waitForTimeout(200);
    ok('bad backup refused, nothing changed', /not a backup from this app/.test(await txt(p, '#tools-msg')) && (await p.locator('.exam').count()) === 4);
    ok('no console errors (main run)', p.errors.length === 0, p.errors);
    // 10. the next day the plan moves on by itself
    await p.clock.fastForward(24 * 3600 * 1000);
    await p.waitForTimeout(100);
    ok('midnight: plan moves to the next day', /Thursday 15 October/.test(await txt(p, '#today-date')) && /11 days left/.test(await txt(p, '#countdown')), await txt(p, '#today-date'));
    await p.context().close();

    // 11. awkward states
    p = await load(b, { width: 390, height: 844 }, { state: '{bad json' });
    ok('corrupt saved state: starts fresh', await p.isVisible('#add-form') && p.errors.length === 0, p.errors);
    await p.context().close();
    p = await load(b, { width: 390, height: 844 }, { state: { exams: [{ name: 'X', date: 'nope' }, 'junk'], rest: 'x' } });
    ok('odd saved values dropped', (await p.locator('.exam').count()) === 0 && p.errors.length === 0);
    await p.context().close();
    p = await load(b, { width: 390, height: 844 }, { block: true });
    ok('storage blocked: warning shown', await p.isVisible('#storage-warn'));
    await addExam(p, { name: 'Maths', date: '2026-10-20', topics: 'A\nB' });
    ok('storage blocked: app still works', (await p.locator('.exam').count()) === 1 && p.errors.length === 0, p.errors);
    await p.context().close();
    const s2 = seed(); s2.exams[0].date = '2026-10-14'; s2.exams.push({ id: 'old', name: 'History', date: '2026-10-05', rev: 1, time: '', place: '', topics: [{ id: 'h1', name: 'Romans', done: '2026-10-01' }] });
    p = await load(b, { width: 390, height: 844 }, { state: s2 });
    ok('exam today', /EXAM: Maths at 0?9:00, Hall 3\. Good luck!/.test(await txt(p, '#today-items')) && /Maths Today/.test(await txt(p, '#countdown')));
    ok('exam today: warning about unticked topics', /Maths is today: 6 topics not ticked/.test(await txt(p, '#plan-notes')));
    ok('past exam at the bottom, finished', (await p.$$eval('.ex-name', l => l.map(e => e.textContent))).pop() === 'History' && /Finished/.test(await txt(p, '.exam.past')));
    await p.locator('.exam.past >> text=Delete').click();
    ok('past exam deleted', (await p.locator('.exam.past').count()) === 0);
    await p.context().close();
    // a crammed exam: busy warning, and an exam with no study day left
    const s3 = { exams: [{ id: 'a', name: 'Biology', date: '2026-10-16', rev: 1, topics: Array.from({ length: 14 }, (_, i) => ({ name: 'Bio topic ' + (i + 1) })) }, { id: 'b', name: 'Art', date: '2026-10-17', rev: 0, topics: [{ name: 'Portfolio' }] }], rest: [4, 5], off: [] };
    p = await load(b, { width: 390, height: 844 }, { state: s3 });
    ok('busy warning', /Busy plan: up to 15 topics/.test(await txt(p, '#plan-notes')));
    ok('fewer revision days explained', /Biology: only 1 study day left, so no revision day instead of 1/.test(await txt(p, '#plan-notes')), await txt(p, '#plan-notes'));
    await p.context().close();
    p = await load(b, { width: 390, height: 844 }, { state: { exams: [{ id: 'a', name: 'Art', date: '2026-10-17', rev: 1, topics: [{ name: 'Portfolio' }] }], rest: [3, 4, 5], off: [] } });
    ok('no study day left: explained', /No study day left before Art, so 1 topic cannot be planned/.test(await txt(p, '#plan-notes')));
    await p.context().close();
    p = await load(b, { width: 390, height: 844 }, { state: { exams: [{ id: 'a', name: 'Art', date: '2026-10-20', rev: 1, topics: [] }] } });
    ok('exam with no topics: tells how to add them', /Add the topics of each exam/.test(await txt(p, '#today')) && /No topics yet/.test(await txt(p, '.exam')));
    await p.context().close();
    // very long text
    p = await load(b, { width: 320, height: 700 });
    await addExam(p, { name: 'Further Mathematics with Mechanics and Statistics Paper Two A', date: '2026-11-30', place: 'Main examination hall, second floor, room 214B', time: '13:00', topics: 'Supercalifragilisticexpialidocious'.repeat(3) + '\n' + 'A very long topic name that goes on and on about differential equations and series' });
    ok('long text: no sideways scroll at 320', await noScroll(p));
    ok('long text: topic shortened to 80', (await saved(p)).exams[0].topics.every(t => t.name.length <= 80));
    await p.context().close();

    // 12. every screen size with a full plan, in dark and light; phones also with every panel open
    for (const theme of ['dark', 'light']) {
        p = await load(b, { width: 1280, height: 900 }, { state: seed(), theme });
        for (const w of [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920]) {
            await p.setViewportSize({ width: w, height: 900 });
            ok(theme + ' ' + w + 'px: no sideways scroll', await noScroll(p));
            for (const pos of [0, .5, 1]) {
                await p.evaluate(f => window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * f), pos);
                const o = await blocksOverlap(p); if (o.length) ok(theme + ' ' + w + 'px blocks overlap at ' + pos, false, o);
            }
            if (w <= 390) {
                await p.click('#add-open'); await p.click('#a-more-open');
                let o = await overlaps(p); ok(theme + ' ' + w + 'px add form: no controls overlap', !o.length, o);
                ok(theme + ' ' + w + 'px placeholders fit', !(await placeholdersFit(p)).length, await placeholdersFit(p));
                await box(p, 'Maths').locator('text=Edit exam').click();
                o = await overlaps(p); ok(theme + ' ' + w + 'px edit exam: no controls overlap', !o.length, o);
                ok(theme + ' ' + w + 'px edit placeholders fit', !(await placeholdersFit(p)).length, await placeholdersFit(p));
                await box(p, 'Maths').locator('text=Add or edit topics').click();
                o = await overlaps(p); ok(theme + ' ' + w + 'px topics editor: no controls overlap', !o.length, o);
                ok(theme + ' ' + w + 'px still no sideways scroll with panels open', await noScroll(p));
                await p.reload({ waitUntil: 'networkidle' });
            }
        }
        // the cleared state too
        await p.click('#wipe');
        for (const w of [320, 390, 900, 1280, 1920]) { await p.setViewportSize({ width: w, height: 900 }); ok(theme + ' ' + w + 'px cleared: no sideways scroll, no overlap', await noScroll(p) && !(await blocksOverlap(p)).length); }
        const before = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
        await p.click('.theme-toggle');
        ok(theme + ': theme switch changes the look', before !== await p.evaluate(() => getComputedStyle(document.body).backgroundColor));
        ok(theme + ': no console errors', p.errors.length === 0, p.errors);
        await p.context().close();
    }

    // 13. Help at four widths
    for (const w of [320, 390, 820, 1280]) {
        p = await load(b, { width: w, height: 800 }, { state: seed() });
        const hb = p.locator('.help-btn').first();
        await hb.click();
        const r = await p.locator('dialog.help').boundingBox();
        ok(w + 'px Help opens inside the screen', r && r.x >= 0 && r.y >= 0 && r.x + r.width <= w + 1 && r.y + r.height <= 801 && /How to use Study Planner and Exam Countdown/.test(await txt(p, 'dialog.help')));
        await p.keyboard.press('Escape'); ok(w + 'px Escape closes Help', !(await p.evaluate(() => document.querySelector('dialog.help').open)));
        await hb.click(); await p.click('.help-close'); ok(w + 'px Got it closes Help', !(await p.evaluate(() => document.querySelector('dialog.help').open)));
        const tb = await p.evaluate(() => [...document.querySelectorAll('.topbar > *')].map(e => e.getBoundingClientRect()).map(r => [r.top, r.bottom, r.left, r.right]));
        let bad = false; for (let i = 0; i < tb.length; i++) for (let j = i + 1; j < tb.length; j++) if (Math.min(tb[i][1], tb[j][1]) - Math.max(tb[i][0], tb[j][0]) > 1 && Math.min(tb[i][3], tb[j][3]) - Math.max(tb[i][2], tb[j][2]) > 1) bad = true;
        ok(w + 'px top bar buttons do not overlap', !bad && new Set(tb.map(t => Math.round(t[0]))).size === 1);
        await p.context().close();
    }

    // 14. keyboard only: tab to a topic and tick it with Space
    p = await load(b, { width: 1280, height: 900 }, { state: seed() });
    await p.focus('#today-items input[type=checkbox]'); await p.keyboard.press('Space');
    ok('keyboard: Space ticks a topic', /Done for today/.test(await txt(p, '#today-progress')));
    ok('screen readers: every checkbox has a label', await p.$$eval('input[type=checkbox]', l => l.every(i => i.closest('label') && i.closest('label').textContent.trim())));
    ok('screen readers: every field has a label', await p.$$eval('input:not([type=checkbox]):not([type=file]), select, textarea', l => l.every(i => i.labels && i.labels.length)));
    await p.context().close();

    // 15. all files the page uses load
    p = await load(b, { width: 390, height: 844 });
    for (const f of ['favicon.svg', 'manifest.webmanifest', 'sw.js', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', '../help.js', '../theme.js', 'core.js', 'script.js', 'style.css']) {
        const r = await p.request.get(new URL(f, url).href); ok('file ' + f + ' loads', r.status() === 200);
    }
    ok('no failed requests', p.bad.length === 0, p.bad);
    await p.context().close();

    // 16. screenshots of the real situation
    if (shots) {
        const dir = path.join(__dirname, 'screenshots');
        p = await load(b, { width: 1280, height: 900 }, { state: seed() });
        await p.check('#today-items input[type=checkbox]');
        await p.screenshot({ path: path.join(dir, 'desktop.png') });
        await p.context().close();
        p = await load(b, { width: 390, height: 844 }, { state: seed() });
        await p.check('#today-items input[type=checkbox]');
        await p.evaluate(() => window.scrollTo(0, document.getElementById('today').offsetTop - 12));
        await p.screenshot({ path: path.join(dir, 'phone.png') });
        await p.context().close();
        console.log('screenshots saved');
    }
    await b.close(); if (srv) srv.close();
    console.log(fail ? '\n' + fail + ' UI check(s) FAILED' : '\nALL UI CHECKS PASSED');
    process.exit(fail ? 1 : 0);
})();
