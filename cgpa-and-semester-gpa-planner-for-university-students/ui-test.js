// Drives the real page in headless Chromium: node ui-test.js [--shots] [--base https://umar8092.github.io/apps]
// Without --base it serves this repo on localhost. With --base it tests the LIVE page.
const pw = (() => { for (const m of ['playwright', 'playwright-core']) { try { return require(m); } catch (e) { /* next */ } } throw new Error('playwright not found'); })();
const path = require('path'), fs = require('fs'), http = require('http');
const SLUG = 'cgpa-and-semester-gpa-planner-for-university-students', KEY = SLUG + '.state';
const bi = process.argv.indexOf('--base');
const shots = process.argv.includes('--shots');
let fail = 0, url;
const ok = (name, cond, extra) => { if (!cond) fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond || extra == null ? '' : '  -> ' + JSON.stringify(extra))); };

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

// Ayesha from the README: 2.84 over 74, Semester 5 final, Semester 6 expected, target 3.00 in 133
function ayesha(extra) {
    let n = 100; const C = (name, credits, grade) => ({ id: 'c' + (++n), name, credits, grade });
    return Object.assign({ v: 1, scale: 'hec', custom: [], pointsMax: '4', rounding: 'round', retake: 'latest', target: '3.00', total: '133',
        base: { on: true, cgpa: '2.84', credits: '74' }, nextId: 500,
        semesters: [
            { id: 's1', name: 'Semester 5', plan: false, courses: [C('Data Structures', '4', 'B+'), C('Database Systems', '3', 'A-'), C('Operating Systems', '3', 'B'), C('Technical Writing', '3', 'A'), C('Probability', '3', 'B-')] },
            { id: 's2', name: 'Semester 6', plan: true, courses: [C('Computer Networks', '3', 'A-'), C('Software Engineering', '3', 'A'), C('AI', '3', 'B+'), C('Web Development', '3', 'A'), C('Linear Algebra', '3', 'B+')] }
        ] }, extra || {});
}

async function load(b, vp, opt = {}) {
    const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: vp.width < 500 ? 2 : 1, colorScheme: opt.theme || 'dark', locale: 'en-GB',
        permissions: ['clipboard-read', 'clipboard-write'], acceptDownloads: true, serviceWorkers: 'block' });
    await ctx.route(/goatcounter\.com|gc\.zgo\.at/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
    if (opt.state !== undefined) await ctx.addInitScript(([k, s]) => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem(k, s); } }, [KEY, typeof opt.state === 'string' ? opt.state : JSON.stringify(opt.state)]);
    if (opt.block) await ctx.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
    const p = await ctx.newPage();
    p.setDefaultTimeout(4000);
    p.errors = []; p.on('console', m => m.type() === 'error' && p.errors.push(m.text())); p.on('pageerror', e => p.errors.push(String(e)));
    p.bad = []; p.on('response', r => { if (r.status() >= 400) p.bad.push(r.status() + ' ' + r.url()); });
    await p.goto(url, { waitUntil: 'networkidle' });
    return p;
}
const txt = async (p, sel) => ((await p.textContent(sel)) || '').replace(/\s+/g, ' ').trim();
const vis = (p, sel) => p.isVisible(sel);
const saved = p => p.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
const sem = (p, i) => p.locator('.sem').nth(i);
const crs = (p, si, ci) => sem(p, si).locator('.course').nth(ci);
async function fillCourse(p, si, ci, name, credits, grade) {
    const r = crs(p, si, ci);
    await r.locator('input[id^=cn-]').fill(name);
    await r.locator('input[id^=cc-]').fill(credits);
    if (grade !== undefined) { const g = r.locator('[id^=cg-]'); if (await g.evaluate(e => e.tagName) === 'SELECT') await g.selectOption(grade); else await g.fill(grade); }
}
async function overlaps(p) {
    return p.evaluate(() => {
        const els = [...document.querySelectorAll('input, select, button, a.secondary, summary')].filter(e => e.offsetParent && e.getBoundingClientRect().width > 0);
        const bad = [];
        for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
            if (els[i].contains(els[j]) || els[j].contains(els[i])) continue;
            const a = els[i].getBoundingClientRect(), c = els[j].getBoundingClientRect();
            if (Math.min(a.right, c.right) - Math.max(a.left, c.left) > 2 && Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top) > 2) bad.push((els[i].id || els[i].className) + ' / ' + (els[j].id || els[j].className));
        }
        return bad;
    });
}
const noHScroll = p => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
async function placeholdersFit(p) {
    return p.evaluate(() => [...document.querySelectorAll('input[placeholder]')].filter(i => i.offsetParent).filter(i => {
        const c = document.createElement('canvas').getContext('2d'), s = getComputedStyle(i);
        c.font = s.fontWeight + ' ' + s.fontSize + ' ' + s.fontFamily;
        return c.measureText(i.placeholder).width > i.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight) + 1;
    }).map(i => i.id + ': ' + i.placeholder));
}
async function selectsFit(p) {
    return p.evaluate(() => [...document.querySelectorAll('select')].filter(s => s.offsetParent).filter(s => {
        const c = document.createElement('canvas').getContext('2d'), st = getComputedStyle(s);
        c.font = st.fontWeight + ' ' + st.fontSize + ' ' + st.fontFamily;
        const o = s.options[s.selectedIndex]; if (!o) return false;
        return c.measureText(o.text).width > s.clientWidth - parseFloat(st.paddingLeft) - 22;
    }).map(s => s.id + ': ' + s.options[s.selectedIndex].text));
}

(async () => {
    let srv;
    if (bi >= 0) url = process.argv[bi + 1].replace(/\/$/, '') + '/' + SLUG + '/';
    else { srv = await serve(); url = 'http://localhost:' + srv.address().port + '/apps/' + SLUG + '/'; }
    const b = await pw.chromium.launch();

    // ---- first use: empty state, nothing forced
    let p = await load(b, { width: 390, height: 844 });
    ok('empty: no grades yet', (await txt(p, '#res-empty')).includes('No grades yet') && !await vis(p, '#res-body'));
    ok('empty: Semester 1 ready with 5 rows', (await p.locator('.sem').count()) === 1 && (await p.locator('.course').count()) === 5 && (await p.inputValue('[id^=sn-]')) === 'Semester 1');
    ok('empty: scale preset 4.00 (A- = 3.67)', (await p.inputValue('#scale')) === 'hec' && (await txt(p, '#scale-list')).includes('A- 3.67'));
    ok('empty: earlier record is optional and hidden', !await vis(p, '#base-card') && await vis(p, '#base-open'));
    ok('empty: target asks for a target, not an error', (await txt(p, '#answer')).includes('Type your target CGPA') && !(await p.getAttribute('#answer', 'class')).includes('bad'));
    ok('empty: semester box explains', (await txt(p, '.sem-sum')).includes('Type credit hours and pick grades'));
    ok('empty: untouched rows have no warnings', !(await p.locator('.c-note:visible').count()));
    // target without total, total without grades
    await p.fill('#target', '3');
    ok('target only: asks for degree credits', (await txt(p, '#answer')).includes('Type the credit hours in your whole degree'));
    await p.fill('#total', '130');
    ok('no grades: you need the target in all 130', (await txt(p, '#answer')).includes('You need at least 3.00') && (await txt(p, '#answer')).includes('remaining 130 credit hours'));
    await p.fill('#target', ''); await p.fill('#total', '');

    // ---- the real situation, through the page
    await p.click('#base-open');
    ok('earlier record opens and focuses', await vis(p, '#base-card') && (await p.evaluate(() => document.activeElement.id)) === 'base-cgpa');
    await p.fill('#base-cgpa', '2.84'); await p.fill('#base-cr', '74');
    await p.locator('[id^=sn-]').first().fill('Semester 5');
    await fillCourse(p, 0, 0, 'Data Structures', '4', 'B+');
    await fillCourse(p, 0, 1, 'Database Systems', '3', 'A-');
    await fillCourse(p, 0, 2, 'Operating Systems', '3', 'B');
    await fillCourse(p, 0, 3, 'Technical Writing', '3', 'A');
    await fillCourse(p, 0, 4, 'Probability', '3', 'B-');
    ok('Semester 5 GPA 3.33 over 16', (await txt(p, '.sem-sum')).includes('Semester GPA 3.33 · 16 credit hours'));
    ok('CGPA after Semester 5 2.93', (await txt(p, '.sem-sum')).includes('CGPA after this semester 2.93'));
    ok('Your CGPA 2.93 over 90', (await txt(p, '#cgpa')) === '2.93' && (await txt(p, '#cgpa-line')) === 'Over 90 credit hours.');
    const tbl = (await p.locator('#sem-rows').innerText()).replace(/\s+/g, ' ');
    ok('table: earlier record row and Semester 5 row', tbl.includes('Earlier record 74 - 2.84') && tbl.includes('Semester 5 16 3.33 2.93'), tbl);
    await p.fill('#target', '3.00'); await p.fill('#total', '133');
    let ans = await txt(p, '#answer');
    ok('answer: at least 3.16 in 43', ans.includes('You need at least 3.16') && ans.includes('remaining 43 credit hours to finish with a 3.00 CGPA'), ans);
    ok('answer: example grade B+ and best 3.27', ans.includes('B+ (3.33) or better') && ans.includes('Highest CGPA you can still reach: 3.27'));
    ok('credit hours left shown as a sum', (await txt(p, '#total-hint')).includes('133 in your degree − 90 completed = 43'));
    // what-if semester
    await p.click('#add-sem');
    ok('add semester: Semester 2 named next, focus on first course', (await p.locator('.sem').count()) === 2 && (await p.evaluate(() => document.activeElement.id.startsWith('cn-'))));
    await sem(p, 1).locator('[id^=sn-]').fill('Semester 6');
    await sem(p, 1).locator('[id^=sp-]').selectOption('1');
    const plan = [['Computer Networks', '3', 'A-'], ['Software Engineering', '3', 'A'], ['AI', '3', 'B+'], ['Web Development', '3', 'A'], ['Linear Algebra', '3', 'B+']];
    for (let i = 0; i < 5; i++) await fillCourse(p, 1, i, ...plan[i]);
    ok('plan box: expected GPA 3.67, CGPA would be 3.03', (await txt(p, '#sum-' + (await saved(p)).semesters[1].id)).includes('Expected GPA 3.67') && (await txt(p, '#sum-' + (await saved(p)).semesters[1].id)).includes('CGPA would be 3.03'));
    ok('real CGPA unchanged by the plan', (await txt(p, '#cgpa')) === '2.93');
    ok('plan line', (await txt(p, '#plan-line')) === 'With your expected grades for Semester 6: CGPA 3.03.');
    ok('plan answer: 2.88 in the last 28', (await txt(p, '#answer-plan')).includes('Your CGPA becomes 3.03. You would then need at least 2.88 in the last 28 credit hours.'));
    ok('plan semester box looks different', (await sem(p, 1).getAttribute('class')).includes('plan'));
    ok('no errors in the main run', !p.errors.length, p.errors);

    // ---- reload keeps everything
    await p.reload();
    ok('reload: CGPA and answer kept', (await txt(p, '#cgpa')) === '2.93' && (await txt(p, '#answer')).includes('3.16') && (await p.inputValue('#base-cgpa')) === '2.84' && (await p.locator('.sem').count()) === 2);
    ok('reload: plan kept', (await sem(p, 1).locator('[id^=sp-]').inputValue()) === '1');

    // ---- share
    await p.click('#copy');
    const clip = await p.evaluate(() => navigator.clipboard.readText());
    ok('copy: summary text', clip.includes('Semester 5: GPA 3.33 over 16 credit hours, CGPA after 2.93') && clip.includes('CGPA: 2.93') && clip.includes('You need at least 3.16') && clip.includes('Earlier record: CGPA 2.84 over 74'), clip);
    ok('copy: message', (await txt(p, '#share-msg')).includes('Copied'));
    const href = await p.getAttribute('#email', 'href');
    ok('email: mailto with no address, subject and body', href.startsWith('mailto:?subject=') && decodeURIComponent(href).includes('CGPA: 2.93'));
    await p.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
    const rep = await txt(p, '#report');
    ok('print report: every course and the answer', rep.includes('Data Structures') && rep.includes('Linear Algebra') && rep.includes('CGPA 2.93 over 90') && rep.includes('You need at least 3.16'), rep.slice(0, 200));

    // ---- edit a mistake, delete with undo
    const s1 = (await saved(p)).semesters[0].id;
    await crs(p, 0, 4).locator('select').selectOption('A');
    ok('edit grade: Probability B- to A -> GPA 3.58', (await txt(p, '#sum-' + s1)).includes('Semester GPA 3.58'));   // (53.34 - 8.01 + 12) / 16 = 3.5831
    await crs(p, 0, 4).locator('select').selectOption('B-');
    await crs(p, 0, 0).locator('.x').click();
    ok('delete course: GPA without Data Structures', (await txt(p, '#sum-' + s1)).includes('Semester GPA 3.34 · 12 credit hours') && (await txt(p, '#sems-msg')).includes('Data Structures deleted'));   // 40.02 / 12 = 3.335 exactly, rounded half up
    await p.click('#sems-msg .undo');
    ok('undo brings the course back', (await p.locator('.sem').first().locator('.course').count()) === 5 && (await txt(p, '#sum-' + s1)).includes('3.33 · 16'));
    await sem(p, 1).locator('.danger-link').click();
    ok('remove semester', (await p.locator('.sem').count()) === 1 && (await txt(p, '#sems-msg')).includes('Semester 6 removed') && !await vis(p, '#answer-plan'));
    await p.click('#sems-msg .undo');
    ok('undo brings the semester back', (await p.locator('.sem').count()) === 2 && await vis(p, '#answer-plan'));
    await p.click('#addc-' + s1);
    ok('+ Add course adds a row and focuses it', (await sem(p, 0).locator('.course').count()) === 6 && (await p.evaluate(() => document.activeElement.id.startsWith('cn-'))));

    // ---- odd inputs on one row
    const r6 = crs(p, 0, 5);
    await r6.locator('[id^=cc-]').fill('3');
    ok('credits without grade: no grade yet', (await r6.locator('.c-note').textContent()).includes('No grade yet') && (await txt(p, '#sum-' + s1)).includes('1 course has no grade yet'));
    await r6.locator('[id^=cc-]').fill('abc'); await r6.locator('select').selectOption('A');
    ok('letters in credits: red note, invalid', (await r6.locator('.c-note').getAttribute('class')).includes('bad') && (await r6.locator('[id^=cc-]').getAttribute('aria-invalid')) === 'true' && (await txt(p, '#cgpa')) === '2.93');
    await r6.locator('[id^=cc-]').fill('40');
    ok('40 credit hours refused', (await r6.locator('.c-note').textContent()).includes('from 0 to 30'));
    await r6.locator('[id^=cc-]').fill('-3');
    ok('negative credits refused', (await r6.locator('.c-note').textContent()).includes('from 0 to 30'));
    await r6.locator('[id^=cc-]').fill('0');
    ok('0 credit hours: not in GPA', (await r6.locator('.c-note').textContent()).includes('0 credit hours') && (await txt(p, '#cgpa')) === '2.93');
    await r6.locator('[id^=cc-]').fill('1,5'); await r6.locator('select').selectOption('#pass');
    ok('pass/fail with comma credits: not in GPA, completed', (await r6.locator('.c-note').textContent()).includes('Credit hours completed') && (await txt(p, '#cgpa')) === '2.93' && (await txt(p, '#cgpa-line')).includes('90 credit hours counted in your GPA · 91.5 credit hours completed'));
    await r6.locator('[id^=cn-]').fill('Probability'); await r6.locator('[id^=cc-]').fill('3'); await r6.locator('select').selectOption('A');
    // retake inside the same semester list: latest (this row) replaces the B- above
    ok('retake: older attempt marked not counted', (await crs(p, 0, 4).locator('.c-note').textContent()).includes('Not counted: retaken in Semester 5'));
    await p.locator('#more summary').click();
    await p.selectOption('#retake', 'all');
    ok('retake policy every attempt counts', (await crs(p, 0, 5).locator('.c-note').textContent()).includes('every attempt counts'));
    await p.selectOption('#retake', 'latest');
    await r6.locator('.x').click();
    // very long course name
    await crs(p, 0, 0).locator('[id^=cn-]').fill('A'.repeat(80));
    ok('very long name: no sideways scroll', await noHScroll(p));
    await crs(p, 0, 0).locator('[id^=cn-]').fill('Data Structures');
    // rounding
    await p.selectOption('#rounding', 'cut');
    ok('cut rounding: Semester 5 3.33 (3.3338) and CGPA 2.92 (2.9278)', (await txt(p, '#cgpa')) === '2.92');
    await p.selectOption('#rounding', 'round');
    // bad target and total
    await p.fill('#target', '4.5');
    ok('target above the scale: error', (await txt(p, '#answer')).includes('from 0 to 4.00') && (await p.getAttribute('#target', 'aria-invalid')) === 'true');
    await p.fill('#target', '3.00'); await p.fill('#total', '0');
    ok('total 0: error', (await txt(p, '#answer')).includes('as a number') && (await p.getAttribute('#total', 'aria-invalid')) === 'true');
    await p.fill('#total', '80');
    ok('total below completed: finished with a check', (await txt(p, '#answer')).includes('more than the 80 in your degree'));
    await p.fill('#total', '95'); await p.fill('#target', '3.50');
    ok('impossible target', (await txt(p, '#answer')).includes('3.50 can no longer be reached') && (await txt(p, '#answer')).includes('your CGPA would end at 2.98'));  // (263.5 + 4 x 5) / 95 = 2.984, cut so it never flatters
    await p.fill('#target', '2.50');
    ok('safe target', (await txt(p, '#answer')).includes('Target 2.50 is safe'));
    await p.fill('#target', '3.00'); await p.fill('#total', '133');

    // ---- scale change with undo
    await p.selectOption('#scale', 'abcdf');
    ok('scale change: warns about grades not on the new scale', (await txt(p, '#scale-msg')).includes('not exist on this scale') && (await p.locator('.c-note.bad').count()) > 0);
    ok('old grade still shown in its select', (await crs(p, 0, 0).locator('select').inputValue()) === 'B+');
    await p.click('#scale-msg .undo');
    ok('undo scale change', (await p.inputValue('#scale')) === 'hec' && (await txt(p, '#cgpa')) === '2.93');
    // custom scale starts from the current one
    await p.selectOption('#scale', 'custom');
    ok('custom scale copies the current grades', (await p.locator('.cg').count()) === 11 && await vis(p, '#custom-box'));
    await p.locator('.cg').first().locator('input').nth(1).fill('4.5');
    ok('custom: editing A to 4.5 changes the CGPA', (await txt(p, '#scale-list')).startsWith('A 4.50') && (await txt(p, '#cgpa')) !== '2.93');
    await p.click('#custom-add');
    ok('custom: + Add a grade adds a row', (await p.locator('.cg').count()) === 12);
    await p.click('#scale-msg .undo').catch(() => {});
    await p.selectOption('#scale', 'hec');
    // 10-point scale and typed points
    p2: {
        const q = await load(b, { width: 390, height: 844 });
        await q.selectOption('#scale', 'ten');
        await fillCourse(q, 0, 0, 'Maths', '4', 'O'); await fillCourse(q, 0, 1, 'Chemistry', '3', 'B');
        ok('10-point: SGPA 8.29', (await txt(q, '.sem-sum')).includes('Semester GPA 8.29'));
        await q.selectOption('#scale', 'points');
        ok('points: letters no longer valid', (await q.locator('.c-note.bad').count()) === 2);
        await fillCourse(q, 0, 0, 'Maths', '3', '3.5'); await fillCourse(q, 0, 1, 'Chemistry', '2', '2,8');
        ok('points: typed 3.5 and 2,8 -> 3.22', (await txt(q, '.sem-sum')).includes('Semester GPA 3.22'));
        await fillCourse(q, 0, 2, '', '3', '4.5');
        ok('points: above the top point refused', (await crs(q, 0, 2).locator('.c-note').textContent()).includes('above the top'));
        await q.fill('#points-max', '5');
        ok('points: raising the top point accepts 4.5', !(await crs(q, 0, 2).locator('.c-note').getAttribute('class')).includes('bad'));
        ok('no errors on other scales', !q.errors.length, q.errors);
        await q.context().close();
    }

    // ---- backup and restore, start over
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#backup')]);
    const file = await dl.path();
    ok('backup file name', /^cgpa-planner-backup-\d{4}-\d{2}-\d{2}\.json$/.test(dl.suggestedFilename()));
    await p.click('#reset');
    ok('start over: empty, scale kept, undo offered', (await p.locator('.sem').count()) === 1 && !await vis(p, '#base-card') && (await p.inputValue('#target')) === '' && await vis(p, '#share-msg .undo') && await vis(p, '#res-empty'));
    await p.click('#share-msg .undo');
    ok('undo start over', (await txt(p, '#cgpa')) === '2.93');
    await p.click('#reset');
    await p.setInputFiles('#restore-file', file);
    await p.waitForFunction(() => document.getElementById('share-msg').textContent.includes('Backup restored'));
    ok('restore backup', (await txt(p, '#share-msg')).includes('Backup restored: 2 semesters') && (await txt(p, '#cgpa')) === '2.93' && (await txt(p, '#answer')).includes('3.16'));
    await p.setInputFiles('#restore-file', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') });
    await p.waitForFunction(() => document.getElementById('share-msg').textContent.includes('could not be restored'));
    ok('restore a wrong file: refused, nothing lost', (await txt(p, '#share-msg')).includes('could not be restored') && (await txt(p, '#cgpa')) === '2.93');
    await p.setInputFiles('#restore-file', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('not json') });
    await p.waitForFunction(() => document.getElementById('share-msg').textContent.includes('not a backup file'));
    ok('restore broken JSON: refused', (await txt(p, '#share-msg')).includes('not a backup file'));
    ok('no errors after sharing and restoring', !p.errors.length, p.errors);
    await p.context().close();

    // ---- keyboard only
    p = await load(b, { width: 390, height: 844 });
    await p.focus('#add-sem'); await p.keyboard.press('Enter');
    ok('keyboard: Enter on + Add semester', (await p.locator('.sem').count()) === 2);
    await p.focus('[id^=cc-]'); await p.keyboard.type('3'); await p.keyboard.press('Tab');
    ok('keyboard: Tab from credits goes to grade', (await p.evaluate(() => document.activeElement.id)).startsWith('cg-'));
    ok('labels: every input and select has a label', await p.evaluate(() => [...document.querySelectorAll('input:not([type=file]), select')].filter(e => e.offsetParent).every(e => (e.labels && e.labels.length) || e.getAttribute('aria-label'))));
    await p.context().close();

    // ---- corrupt and blocked storage
    p = await load(b, { width: 390, height: 844 }, { state: '{not json' });
    ok('corrupt saved data: fresh start with a message', (await txt(p, '#sems-msg')).includes('could not be read') && (await p.locator('.sem').count()) === 1 && !p.errors.length);
    await p.context().close();
    p = await load(b, { width: 390, height: 844 }, { state: JSON.stringify({ semesters: 'x' }) });
    ok('wrong-shaped saved data: fresh start', (await p.locator('.sem').count()) === 1 && !p.errors.length, p.errors);
    await p.context().close();
    p = await load(b, { width: 390, height: 844 }, { block: true });
    await fillCourse(p, 0, 0, 'Maths', '3', 'A');
    ok('blocked storage: still works and warns', (await txt(p, '#cgpa')) === '4.00' && (await txt(p, '#share-msg')).includes('not letting this page save') && !p.errors.length, p.errors);
    await p.context().close();

    // ---- every width, both themes, filled and cleared
    const widths = [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920];
    for (const theme of ['dark', 'light']) for (const w of widths) {
        p = await load(b, { width: w, height: 900 }, { theme, state: ayesha() });
        ok(theme + ' ' + w + ': answer shown', (await txt(p, '#answer')).includes('3.16'));
        ok(theme + ' ' + w + ': no sideways scroll', await noHScroll(p));
        if (w <= 390) {
            await p.locator('#more summary').click();
            await p.selectOption('#scale', 'custom');
            let o = await overlaps(p); ok(theme + ' ' + w + ': no overlapping controls (custom scale, options open)', !o.length, o);
            const ph = await placeholdersFit(p); ok(theme + ' ' + w + ': placeholders fit', !ph.length, ph);
            const sf = await selectsFit(p); ok(theme + ' ' + w + ': select text fits', !sf.length, sf);
            await p.selectOption('#scale', 'points');
            o = await overlaps(p); ok(theme + ' ' + w + ': no overlapping controls (typed points)', !o.length, o);
            ok(theme + ' ' + w + ': no sideways scroll after opening options', await noHScroll(p));
        }
        { const ph = await placeholdersFit(p); ok(theme + ' ' + w + ': placeholders fit (filled)', !ph.length, ph); const sf = await selectsFit(p); ok(theme + ' ' + w + ': select text fits (filled)', !sf.length, sf); }
        if (w >= 900) {
            for (const pos of ['top', 'middle', 'bottom']) {
                await p.evaluate(pos => scrollTo(0, pos === 'top' ? 0 : pos === 'middle' ? document.body.scrollHeight / 2 : document.body.scrollHeight), pos);
                const bad = await p.evaluate(() => {
                    const out = [];
                    for (const parent of document.querySelectorAll('main, .col-main, .col-side')) {
                        const kids = [...parent.children].filter(e => e.offsetParent && getComputedStyle(e).display !== 'none');
                        for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
                            const a = kids[i].getBoundingClientRect(), c = kids[j].getBoundingClientRect();
                            if (Math.min(a.right, c.right) - Math.max(a.left, c.left) > 1 && Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top) > 1) out.push((kids[i].id || kids[i].className) + ' / ' + (kids[j].id || kids[j].className));
                        }
                    }
                    return out;
                });
                ok(theme + ' ' + w + ': no blocks overlap at scroll ' + pos, !bad.length, bad);
            }
            const side = await p.evaluate(() => [document.querySelector('.col-main').getBoundingClientRect().left, document.querySelector('.col-side').getBoundingClientRect().left]);
            ok(theme + ' ' + w + ': desktop puts results beside the semesters', side[1] > side[0] + 300);
        }
        ok(theme + ' ' + w + ': no errors', !p.errors.length, p.errors);
        await p.context().close();
        p = await load(b, { width: w, height: 900 }, { theme });
        ok(theme + ' ' + w + ' empty: no sideways scroll', await noHScroll(p));
        if (w <= 390) { const o = await overlaps(p); ok(theme + ' ' + w + ' empty: no overlapping controls', !o.length, o); }
        { const ph = await placeholdersFit(p); ok(theme + ' ' + w + ' empty: placeholders fit', !ph.length, ph); }
        await p.context().close();
    }

    // ---- Help dialog
    for (const w of [320, 390, 820, 1280]) {
        p = await load(b, { width: w, height: 800 });
        await p.click('.help-btn');
        const r = await p.locator('dialog.help').boundingBox();
        ok('help ' + w + ': open and on screen', r && r.x >= 0 && r.y >= 0 && r.x + r.width <= w && r.y + r.height <= 800 && (await txt(p, 'dialog.help h2')) === 'How to use CGPA and Semester GPA Planner');
        await p.keyboard.press('Escape');
        ok('help ' + w + ': Escape closes', !await p.evaluate(() => document.querySelector('dialog.help').open));
        await p.click('.help-btn'); await p.click('.help-close');
        ok('help ' + w + ': Got it closes', !await p.evaluate(() => document.querySelector('dialog.help').open));
        const tb = await p.evaluate(() => { const r = [...document.querySelectorAll('.topbar > *')].map(e => e.getBoundingClientRect()); return r.every(a => Math.abs(a.top - r[0].top) < 4); });
        ok('help ' + w + ': top bar on one line', tb);
        await p.context().close();
    }

    // ---- light/dark switch
    p = await load(b, { width: 390, height: 844 }, { theme: 'dark' });
    const bg1 = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await p.click('.theme-toggle');
    const bg2 = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
    ok('light/dark switch changes the look', bg1 !== bg2 && (await p.getAttribute('html', 'data-theme')) === 'light');
    await p.context().close();

    // ---- screenshots and files
    p = await load(b, { width: 1280, height: 1000 }, { state: ayesha() });
    if (shots) await p.screenshot({ path: path.join(__dirname, 'screenshots/desktop.png'), clip: { x: 0, y: 0, width: 1280, height: 1560 }, fullPage: true });
    await p.context().close();
    p = await load(b, { width: 390, height: 844 }, { state: ayesha() });
    if (shots) { await p.evaluate(() => { const r = document.getElementById('results'); scrollTo(0, r.getBoundingClientRect().top + scrollY - 12); }); await p.screenshot({ path: path.join(__dirname, 'screenshots/phone.png') }); }
    for (const f of ['favicon.svg', 'manifest.webmanifest', 'sw.js', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', '../help.js', '../theme.js', 'screenshots/desktop.png', 'screenshots/phone.png', 'core.js', 'script.js', 'style.css']) {
        const r = await p.request.get(new URL(f, url).href);
        ok('file ' + f + ' returns 200', r.status() === 200);
    }
    ok('every file the page asked for loaded', !p.bad.length, p.bad);
    await p.context().close();

    await b.close(); if (srv) srv.close();
    console.log(fail ? '\n' + fail + ' FAILED' : '\nALL UI TESTS PASSED');
    process.exitCode = fail ? 1 : 0;
})();
