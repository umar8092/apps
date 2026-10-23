// Page checks with Playwright: node ui-test.js [--base https://umar8092.github.io/apps] [--shots]
// Drives the real situation (two children, marks and grades) through the page and checks the exact answers,
// every edge case in the use-case list, saved state, layout at 11 widths in dark and light, and Help.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), http = require('http');
const SLUG = 'exam-result-and-report-card-tracker-for-parents', ROOT = path.resolve(__dirname, '..'), KEY = SLUG + '.state';
const args = process.argv.slice(2), bi = args.indexOf('--base'), BASE = bi >= 0 ? args[bi + 1].replace(/\/$/, '') : null, SHOTS = args.includes('--shots');
let pass = 0; const fails = [];
const ok = (c, what) => { if (c) pass++; else { fails.push(what); if (process.env.V) console.log('FAIL ' + what); } };
const eq = (g, w, what) => ok(JSON.stringify(g) === JSON.stringify(w), what + '\n   got:  ' + JSON.stringify(g) + '\n   want: ' + JSON.stringify(w));

function serve() {
    const types = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml', png: 'image/png', webmanifest: 'application/manifest+json', woff2: 'font/woff2' };
    return new Promise(res => {
        const s = http.createServer((req, rs) => {
            let p = decodeURIComponent(req.url.split('?')[0].replace(/^\/apps/, '')); if (p.endsWith('/')) p += 'index.html';
            const f = path.join(ROOT, p);
            if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rs.writeHead(404); return rs.end('nf'); }
            rs.writeHead(200, { 'content-type': types[f.split('.').pop()] || 'application/octet-stream' }); rs.end(fs.readFileSync(f));
        }).listen(0, () => res({ s, url: 'http://localhost:' + s.address().port + '/apps' }));
    });
}

(async () => {
    let srv = null, base = BASE;
    if (!base) { srv = await serve(); base = srv.url; }
    const URL_ = base + '/' + SLUG + '/';
    const browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: 390, height: 860 }, permissions: ['clipboard-read', 'clipboard-write'] });
    await ctx.route(/goatcounter|gc\.zgo\.at/, r => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
    ctx.setDefaultTimeout(6000);
    const page = await ctx.newPage();
    const errors = [], failed = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('response', r => { if (r.status() >= 400) failed.push(r.status() + ' ' + r.url()); });
    await page.goto(URL_, { waitUntil: 'networkidle' });
    await page.evaluate(k => localStorage.removeItem(k), KEY); await page.reload({ waitUntil: 'networkidle' });
    const T = s => page.locator(s).innerText();
    const box = n => page.locator('article.item').filter({ has: page.locator('h2', { hasText: new RegExp('^' + n + '$') }) });

    // ---------- first use / empty state ----------
    ok(await page.locator('#items').isHidden(), 'empty: no children list');
    eq(await T('#add-h'), 'Add a child', 'empty: heading');
    ok(await page.locator('#restore-first').isVisible(), 'empty: restore link offered');
    ok(await page.locator('#c-cls-box').isHidden(), 'class is optional and hidden');
    await page.click('#c-save');
    eq(await T('#c-name-err'), "Type your child's name.", 'blank name refused');

    // ---------- add Ali ----------
    await page.fill('#c-name', 'Ali');
    await page.click('#c-cls-open'); await page.fill('#c-cls', 'Class 6');
    for (const s of ['English', 'Maths', 'Science', 'Urdu', 'Islamiat']) await page.click('#c-subs-quick .chip:text-is("' + s + '")');
    eq(await page.inputValue('#c-subs'), 'English, Maths, Science, Urdu, Islamiat', 'subject chips fill the box');
    await page.click('#c-subs-quick .chip:text-is("Urdu")'); await page.click('#c-subs-quick .chip:text-is("Urdu")');
    eq(await page.inputValue('#c-subs'), 'English, Maths, Science, Islamiat, Urdu', 'chip toggles off and on');
    await page.fill('#c-subs', 'English, Maths, Science, Urdu, Islamiat');
    await page.click('#c-save');
    ok(await box('Ali').isVisible(), 'Ali has a box');
    ok((await box('Ali').innerText()).includes('No results yet'), 'Ali empty box text');
    eq(await T('#add-h'), 'Add another child', 'heading after first child');
    await page.fill('#c-name', 'ali'); await page.click('#c-save');
    ok((await T('#c-name-err')).includes('already have a child called ali'), 'duplicate name refused');
    await page.fill('#c-name', '');

    async function addResult(child, name, date, out, marks, more) {
        more = more || {};
        const b = box(child);
        if (more.edit) await b.locator('.ex-btns button', { hasText: 'Edit' }).nth(more.edit - 1).click();
        else await b.locator('button', { hasText: 'Add a result' }).click();
        const p = b.locator('.panel');
        if (name != null) await p.locator('input[id$="-name"]').fill(name);
        if (date) await p.locator('input[type=date]').fill(date);
        if (out) await p.locator('input[id$="-out"]').fill(String(out));
        for (const [s, v] of Object.entries(marks)) {
            const row = p.locator('.r-row').filter({ has: page.locator('.r-subj', { hasText: new RegExp('^' + s + '$') }) });
            if (v === 'absent') await row.locator('.seg-b', { hasText: 'Absent' }).click();
            else if (typeof v === 'object') { await row.locator('.seg-b', { hasText: 'Grade' }).click(); await row.locator('select').selectOption(v.grade); }
            else { await row.locator('.seg-b', { hasText: 'Marks' }).click(); await row.locator('.r-got').fill(String(v)); }
        }
        if (more.pos) { await p.locator('button', { hasText: '+ Add position' }).click(); await p.locator('input[id$="-pos"]').fill(more.pos[0]); await p.locator('input[id$="-posof"]').fill(more.pos[1]); }
        if (more.before) await more.before(p);
        await p.locator('button', { hasText: /^Save (result|changes)$/ }).click();
        return p;
    }
    // ---------- the main situation ----------
    await addResult('Ali', 'Monthly test', '2026-02-12', 25, { English: 19, Maths: 18, Science: 16, Urdu: 15, Islamiat: 'absent' });
    ok((await T('#msg-' + await box('Ali').getAttribute('id').then(i => i.slice(6)))).includes('Saved Monthly test: 5 subjects.'), 'saved message');
    eq(await box('Ali').locator('.i-big').innerText(), '68% overall', 'monthly test: 68% overall (absent not zero)');
    ok((await box('Ali').innerText()).includes('68 out of 100 marks · absent in 1 subject'), 'absent subject noted');
    await addResult('Ali', 'Term 1', '2026-03-12', 100, { English: 80, Maths: 74, Science: 70, Urdu: 65, Islamiat: 85 });
    await addResult('Ali', 'Term 2', '2026-10-15', 100, { English: 88, Maths: 62, Science: 68, Urdu: 74, Islamiat: 80 }, { pos: ['5', '32'] });
    const ali = box('Ali');
    eq(await ali.locator('.i-big').innerText(), '74.4% overall', 'Term 2 overall 372/500');
    eq(await ali.locator('.i-change').innerText(), '▼ Down 0.4 from 74.8% in Term 1', 'overall change');
    ok((await ali.locator('.i-latest').first().innerText()).includes('Latest: Term 2 · 15 Oct 2026 · Position 5 of 32'), 'latest line with position');
    eq(await ali.locator('.att li').allInnerTexts(), ['Maths 62% (down 12 from 74%)'], 'needs attention: Maths');
    eq(await ali.locator('.wins li').allInnerTexts(), ['Best subject: English 88%', 'Most improved: Urdu, up 9 to 74%'], 'doing well');
    const mrow = ali.locator('.s-row').filter({ has: page.locator('.s-name', { hasText: /^Maths$/ }) });
    eq(await mrow.locator('.s-sub').innerText(), '62/100 in Term 2, down from 74%', 'Maths row');
    ok((await mrow.locator('.s-pct').innerText()).replace(/\s+/g, ' ') === '62% ▼ 12', 'Maths percent and change');
    ok(await mrow.locator('svg.spark').count() === 1, 'Maths sparkline');
    eq(await ali.locator('.chart .hit').count(), 3, 'overall chart has 3 points');
    await ali.locator('.chart .hit').nth(1).hover();
    eq(await ali.locator('.tip').innerText(), 'Term 1: 74.8%', 'chart hover tooltip');
    // copy summary
    await ali.locator('button', { hasText: 'Copy summary' }).click();
    await page.waitForTimeout(200);
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    ok(clip.includes('Maths: 62% in Term 2, down from 74% in Term 1') && clip.startsWith('Ali (Class 6): exam results'), 'copied summary text');
    ok((await ali.locator('.msg').innerText()).includes('Copied'), 'copied message');
    // history
    await ali.locator('.hist summary').click();
    eq(await ali.locator('.ex .ex-name').allInnerTexts(), ['Term 2', 'Term 1', 'Monthly test'], 'All results newest first');
    ok((await ali.locator('.ex').nth(2).innerText()).includes('Islamiat\nAbsent'), 'absent shown in history');

    // ---------- form edge cases ----------
    await ali.locator('button', { hasText: 'Add a result' }).click();
    let p = ali.locator('.panel');
    ok(await p.locator('input[id$="-pos"]').isHidden(), 'position is optional and hidden');
    eq(await p.locator('input[type=date]').inputValue(), await page.evaluate(() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }), 'date defaults to today');
    eq(await p.locator('input[id$="-out"]').inputValue(), '100', 'usual total remembered');
    await p.locator('button', { hasText: 'Save result' }).click();
    eq(await p.locator('input[id$="-name"] + .err').innerText(), 'Type a name for the test, or tap one below.', 'blank test name refused');
    await p.locator('.quick .chip', { hasText: 'Class test' }).click();
    eq(await p.locator('input[id$="-name"]').inputValue(), 'Class test', 'test name chip');
    await p.locator('button', { hasText: 'Save result' }).click();
    eq(await p.locator('[id$="-err"]').last().innerText(), 'Type the marks for at least one subject, or pick Grade or Absent.', 'no marks at all refused');
    await p.locator('.chip', { hasText: /^25$/ }).click();
    eq(await p.locator('.r-out').first().inputValue(), '25', 'out-of chip fills every subject');
    const r0 = p.locator('.r-row').first();
    await r0.locator('.r-got').fill('30'); await p.locator('button', { hasText: 'Save result' }).click();
    ok((await r0.locator('.r-err').innerText()).includes('more than the total (25)'), 'marks above total refused');
    await r0.locator('.r-got').fill('abc'); await p.locator('button', { hasText: 'Save result' }).click();
    eq(await r0.locator('.r-err').innerText(), 'Type the marks as a number, like 45 or 23.5.', 'text marks refused');
    await r0.locator('.r-got').fill('-2'); await p.locator('button', { hasText: 'Save result' }).click();
    eq(await r0.locator('.r-err').innerText(), 'Marks cannot be below zero.', 'negative refused');
    await r0.locator('.r-got').fill('23,5');
    eq(await r0.locator('.r-pct').innerText(), '= 94%', 'live percent preview 23.5/25');
    await r0.locator('.r-got').fill('31/50');
    eq(await r0.locator('.r-pct').innerText(), '= 62%', 'pasted 31/50 preview');
    await p.locator('input[type=date]').fill('2099-01-01'); await p.locator('button', { hasText: 'Save result' }).click();
    eq(await p.locator('input[type=date] + .err').innerText(), 'The date cannot be after today.', 'future date refused');
    await p.locator('input[type=date]').fill('2026-10-20');
    // a new subject, then remove an empty new row
    await p.locator('button', { hasText: '+ Add a subject' }).click();
    const nr = p.locator('.r-row').last();
    await nr.locator('.r-got').fill('20');
    await p.locator('button', { hasText: 'Save result' }).click();
    eq(await nr.locator('.r-err').innerText(), 'Type the subject name.', 'new subject needs a name');
    await nr.locator('.r-sname').fill('Computer');
    await p.locator('button', { hasText: '+ Add a subject' }).click(); await p.locator('.r-row').last().locator('button', { hasText: 'Remove' }).click();
    await p.locator('button', { hasText: 'Save result' }).click();
    ok((await ali.locator('.msg').innerText()).includes('Saved Class test: 2 subjects. Maths, Science, Urdu, Islamiat were left blank and not counted.'), 'blank subjects skipped and named');
    ok((await ali.locator('.s-name').allInnerTexts()).includes('Computer'), 'new subject added to the list');
    eq(await ali.locator('.i-big').innerText(), '68% overall', 'class test: English 31/50 + Computer 20/25 = 51/75 = 68%');
    // undo the class test
    await ali.locator('.msg .undo').click();
    eq(await ali.locator('.i-big').innerText(), '74.4% overall', 'undo removes the class test');
    ok(!(await ali.locator('.s-name').allInnerTexts()).includes('Computer'), 'undo removes the new subject');

    // ---------- edit a mistake, then undo ----------
    await addResult('Ali', null, null, null, { Maths: 70 }, { edit: 1 });
    eq(await box('Ali').locator('.att').count(), 0, 'after fixing Maths to 70 nothing needs attention');
    ok((await box('Ali').locator('.msg').innerText()).includes('Saved changes to Term 2'), 'edit message');
    await box('Ali').locator('.msg .undo').click();
    eq(await box('Ali').locator('.att li').allInnerTexts(), ['Maths 62% (down 12 from 74%)'], 'undo the edit');
    // delete a result and undo
    await box('Ali').locator('.hist summary').click().catch(() => {});
    if (!await box('Ali').locator('.hist').evaluate(d => d.open)) await box('Ali').locator('.hist summary').click();
    await box('Ali').locator('.ex-btns button', { hasText: 'Delete' }).first().click();
    eq(await box('Ali').locator('.i-big').innerText(), '74.8% overall', 'deleting Term 2 shows Term 1');
    await box('Ali').locator('.msg .undo').click();
    eq(await box('Ali').locator('.i-big').innerText(), '74.4% overall', 'undo delete');

    // ---------- edit child: rename a subject, new class ----------
    await box('Ali').locator('button', { hasText: 'Edit child' }).click();
    let ep = box('Ali').locator('.panel');
    await ep.locator('.sub-row input').nth(1).fill('Mathematics');
    await ep.locator('input[id$="-cls"]').fill('Class 7');
    await ep.locator('button', { hasText: 'Save changes' }).click();
    eq(await box('Ali').locator('.att li').allInnerTexts(), ['Mathematics 62% (down 12 from 74%)'], 'renamed subject keeps its history');
    ok((await box('Ali').locator('.i-latest').first().innerText()).includes('Class 6'), 'old result keeps the class it was in');
    eq(await box('Ali').locator('.tag').innerText(), 'Class 7', 'new class shown');
    await box('Ali').locator('.msg .undo').click();
    eq(await box('Ali').locator('.tag').innerText(), 'Class 6', 'undo child edit');
    // remove a subject (dropped): old results stay
    await box('Ali').locator('button', { hasText: 'Edit child' }).click();
    ep = box('Ali').locator('.panel');
    await ep.locator('.sub-row').nth(1).locator('button', { hasText: 'Remove' }).click();
    await ep.locator('button', { hasText: 'Save changes' }).click();
    ok((await box('Ali').locator('.s-name').allInnerTexts()).includes('Maths'), 'subject in the latest exam still shows');
    await box('Ali').locator('.msg .undo').click();
    await box('Ali').locator('button', { hasText: 'Edit child' }).click();
    await box('Ali').locator('.panel button', { hasText: 'Cancel' }).click();
    eq(await box('Ali').locator('.panel').count(), 0, 'cancel closes the panel');

    // ---------- second child with grades ----------
    await page.fill('#c-name', 'Hira'); await page.fill('#c-subs', 'English, Maths, Urdu, Art'); await page.click('#c-save');
    await addResult('Hira', 'Term 1', '2026-03-10', null, { English: { grade: 'A' }, Maths: { grade: 'B' }, Urdu: { grade: 'A+' }, Art: { grade: 'A' } });
    await addResult('Hira', 'Term 2', '2026-10-14', null, { English: { grade: 'A+' }, Maths: { grade: 'C' }, Urdu: { grade: 'A' }, Art: { grade: 'A' } });
    const hira = box('Hira');
    eq(await hira.locator('.i-big').innerText(), 'About 73.8% overall', 'grades-only overall');
    eq(await hira.locator('.att li').allInnerTexts(), ['Maths 55% (down 10 from 65%)', 'Urdu 75% (down 15 from 90%)'], 'grade drops flagged');
    eq(await hira.locator('.s-row').first().locator('.s-sub').innerText(), 'Grade A+ in Term 2, up from A', 'grade row text');
    // the form remembers grade mode for that subject
    await hira.locator('button', { hasText: 'Add a result' }).click();
    ok(await hira.locator('.panel .r-row').first().locator('input[value=grade]').isChecked(), 'grade mode remembered per subject');
    await hira.locator('.panel button', { hasText: 'Cancel' }).click();
    eq(await page.locator('article.item').count(), 2, 'two children, each in their own box');

    // ---------- settings ----------
    await page.selectOption('#flag-below', 'other');
    ok(await page.locator('#fb-other').isVisible(), 'Other shows a box');
    await page.fill('#fb-other-v', '150'); await page.click('#fb-other-save');
    eq(await T('#fb-other-err'), 'Type a number from 1 to 100.', 'other out of range refused');
    await page.fill('#fb-other-v', '70'); await page.click('#fb-other-save');
    eq(await box('Ali').locator('.att li').allInnerTexts(), ['Maths 62% (below 70%, down 12 from 74%)', 'Science 68% (below 70%)'], 'custom 70% warning level');
    eq(await page.locator('#flag-below').inputValue(), '700', 'custom level shown in the select');
    await page.locator('#tools-msg .undo').click();
    eq(await page.locator('#flag-below').inputValue(), '500', 'undo settings');
    await page.click('#grades-open');
    const gl = page.locator('#g-list .g-row');
    eq(await gl.count(), 7, 'seven usual grades');
    eq(await gl.nth(3).locator('.g-name').inputValue(), 'C', 'fourth grade is C');
    await gl.nth(3).locator('button').click();
    await page.click('#g-save');
    ok((await T('#g-err')).includes("Grade C is used in Hira's Term 2"), 'cannot remove a grade that is used');
    await page.click('#g-reset');
    await page.click('#g-add'); await gl.last().locator('.g-name').fill('A*'); await gl.last().locator('.g-pct').fill('95');
    await page.click('#g-save');
    ok((await T('#tools-msg')).includes('A* 95%'), 'grade added');

    // ---------- reload: saved state ----------
    await page.reload({ waitUntil: 'networkidle' });
    eq(await page.locator('article.item').count(), 2, 'reload keeps both children');
    eq(await box('Ali').locator('.i-big').innerText(), '74.4% overall', 'reload keeps results');
    ok(await page.locator('#restore-first').isHidden(), 'restore link hidden once data exists');

    // ---------- backup and restore ----------
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#backup')]);
    const bpath = path.join(__dirname, '..', '.ui-backup.json'); await dl.saveAs(bpath);
    const saved = JSON.parse(fs.readFileSync(bpath, 'utf8'));
    eq(saved.children.map(c => c.name), ['Ali', 'Hira'], 'backup file has both children');
    await page.click('#del-all');
    eq(await page.locator('article.item').count(), 0, 'delete everything');
    await page.locator('#tools-msg .undo').click();
    eq(await page.locator('article.item').count(), 2, 'undo delete everything');
    await page.click('#del-all');
    await page.setInputFiles('#restore-file', bpath);
    await page.waitForTimeout(300);
    eq(await page.locator('article.item').count(), 2, 'restore brings both back');
    ok((await T('#tools-msg')).includes('Backup restored: 2 children.'), 'restore message');
    fs.writeFileSync(bpath, '{"nope":1}');
    await page.setInputFiles('#restore-file', bpath); await page.waitForTimeout(300);
    eq(await T('#tools-msg'), 'That file is not a backup from this app.', 'bad backup refused');
    fs.unlinkSync(bpath);
    // delete a child with undo
    await box('Hira').locator('button', { hasText: 'Delete child' }).click();
    eq(await page.locator('article.item').count(), 1, 'delete child');
    ok((await T('#add-msg')).includes('Hira and 2 results deleted.'), 'delete child message');
    await page.locator('#add-msg .undo').click();
    eq(await page.locator('article.item').count(), 2, 'undo delete child');

    // ---------- long text ----------
    await page.fill('#c-name', 'W'.repeat(60)); await page.fill('#c-subs', 'A very long subject name that goes on'); await page.click('#c-save');
    eq((await page.locator('article.item h2').last().innerText()).length, 40, 'long name cut to 40');
    const sw = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
    ok(sw, 'long names do not cause sideways scroll');
    await page.locator('article.item').last().locator('button', { hasText: 'Delete child' }).click();
    const goodState = await page.evaluate(k => localStorage.getItem(k), KEY);

    // ---------- corrupt saved state ----------
    for (const bad of ['{not json', '{"children":"x"}', 'null', '{"children":[{"name":5}]}']) {
        await page.evaluate(([k, v]) => localStorage.setItem(k, v), [KEY, bad]); await page.reload({ waitUntil: 'networkidle' });
        eq(await page.locator('article.item').count(), 0, 'corrupt save starts fresh: ' + bad);
    }
    await page.evaluate(([k, v]) => localStorage.setItem(k, v), [KEY, goodState]); await page.reload({ waitUntil: 'networkidle' });

    // ---------- keyboard: Enter adds a child ----------
    await page.fill('#c-name', 'Sara'); await page.press('#c-name', 'Enter');
    ok(await box('Sara').isVisible(), 'Enter key adds a child');
    await box('Sara').locator('button', { hasText: 'Delete child' }).click();

    // ---------- theme switch ----------
    const tt = page.locator('.theme-toggle');
    if (await tt.count()) {
        const before = await page.evaluate(() => getComputedStyle(document.body).color);
        await tt.click();
        ok(before !== await page.evaluate(() => getComputedStyle(document.body).color), 'light/dark switch changes colours');
        await tt.click();
    } else ok(false, 'theme switch missing');

    // ---------- layout at every width, dark and light, filled state with panels open ----------
    const WIDTHS = [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920];
    for (const scheme of ['dark', 'light']) {
        await page.emulateMedia({ colorScheme: scheme });
        for (const w of WIDTHS) {
            await page.setViewportSize({ width: w, height: 900 });
            await page.reload({ waitUntil: 'networkidle' });
            for (const n of ['Ali', 'Hira']) { const h = box(n).locator('.hist'); if (!await h.evaluate(d => d.open)) await h.locator('summary').click(); }
            await box('Ali').locator('button', { hasText: 'Add a result' }).click();
            await box('Ali').locator('.panel button', { hasText: '+ Add a subject' }).click();
            await box('Ali').locator('.panel button', { hasText: '+ Add position' }).click();
            await box('Ali').locator('.panel .r-row').nth(1).locator('.seg-b', { hasText: 'Grade' }).click();
            await page.click('#grades-open');
            await page.selectOption('#flag-drop', 'other');
            await page.click('#c-cls-open');
            const tag = scheme + ' ' + w + ': ';
            ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), tag + 'no horizontal scroll');
            const out = await page.evaluate(() => [...document.querySelectorAll('main *')].filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.right > innerWidth + 1 || r.left < -1) && getComputedStyle(e).position !== 'absolute'; }).slice(0, 3).map(e => e.tagName + '.' + e.className));
            eq(out, [], tag + 'nothing sticks out');
            if (w <= 390) {
                const ov = await page.evaluate(() => {
                    const els = [...document.querySelectorAll('input:not([type=radio]):not([type=file]), select, button, .seg-b')].filter(e => e.offsetParent && e.getBoundingClientRect().width);
                    const bad = [];
                    for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
                        if (els[i].contains(els[j]) || els[j].contains(els[i])) continue;
                        const a = els[i].getBoundingClientRect(), b = els[j].getBoundingClientRect();
                        if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) bad.push((els[i].id || els[i].textContent.slice(0, 15)) + ' / ' + (els[j].id || els[j].textContent.slice(0, 15)));
                    }
                    return bad.slice(0, 3);
                });
                eq(ov, [], tag + 'no controls overlap');
                // placeholders and values fit their boxes
                const clip = await page.evaluate(() => {
                    const c = document.createElement('canvas').getContext('2d');
                    return [...document.querySelectorAll('input[type=text]')].filter(i => i.offsetParent).filter(i => {
                        const cs = getComputedStyle(i); c.font = cs.fontSize + ' ' + cs.fontFamily;
                        const room = i.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
                        return c.measureText(i.placeholder || '').width > room + 1;
                    }).map(i => i.id + ' "' + i.placeholder + '"');
                });
                eq(clip, [], tag + 'placeholders fit');
            }
            if (w >= 900) {
                for (const pos of [0, 0.5, 1]) {
                    await page.evaluate(f => window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * f), pos);
                    const o = await page.evaluate(() => {
                        const bad = [];
                        for (const host of [document.querySelector('main'), ...document.querySelectorAll('.col-a, .col-b, .item')]) {
                            const kids = [...host.children].filter(e => e.offsetParent && e.getBoundingClientRect().height);
                            for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
                                const a = kids[i].getBoundingClientRect(), b = kids[j].getBoundingClientRect();
                                if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) bad.push(kids[i].className + ' / ' + kids[j].className);
                            }
                        }
                        return bad.slice(0, 3);
                    });
                    eq(o, [], tag + 'no blocks overlap at scroll ' + pos);
                }
                if (w === 1280) {
                    const cols = await page.evaluate(() => [document.querySelector('.col-a').getBoundingClientRect(), document.querySelector('.col-b').getBoundingClientRect()].map(r => Math.round(r.left)));
                    ok(cols[1] > cols[0] + 300, tag + 'two columns side by side');
                }
            }
        }
    }
    await page.emulateMedia({ colorScheme: 'dark' });

    // ---------- Help ----------
    for (const w of [320, 390, 820, 1280]) {
        await page.setViewportSize({ width: w, height: 800 }); await page.reload({ waitUntil: 'networkidle' });
        await page.locator('.help-btn, button:has-text("Help")').first().click();
        const d = page.locator('dialog.help');
        ok(await d.evaluate(e => e.open), w + ': help opens');
        const r = await d.boundingBox();
        ok(r && r.x >= 0 && r.y >= 0 && r.x + r.width <= w && r.y + r.height <= 800, w + ': help fits the screen');
        ok((await d.locator('h2').innerText()).includes('How to use Exam Result and Report Card Tracker for Parents'), w + ': help title');
        await page.keyboard.press('Escape'); ok(!await d.evaluate(e => e.open), w + ': Escape closes help');
        await page.locator('.help-btn, button:has-text("Help")').first().click(); await page.locator('.help-close').click();
        ok(!await d.evaluate(e => e.open), w + ': Got it closes help');
        const tb = await page.evaluate(() => { const b = [...document.querySelectorAll('.topbar > *')].map(e => e.getBoundingClientRect()); return b.length > 1 ? b.every(r => Math.abs(r.top - b[0].top) < 30) : true; });
        ok(tb, w + ': top bar buttons on one line');
    }

    // ---------- screenshots ----------
    if (SHOTS) {
        await page.emulateMedia({ colorScheme: 'dark' });
        const shotPage = async (w, scale, file, extra) => {
            const c2 = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: scale, colorScheme: 'dark' });
            await c2.route(/goatcounter|gc\.zgo\.at/, r => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
            const p2 = await c2.newPage(); await p2.goto(URL_, { waitUntil: 'networkidle' });
            await p2.evaluate(([k, v]) => localStorage.setItem(k, v), [KEY, goodState]); await p2.reload({ waitUntil: 'networkidle' });
            if (extra) await extra(p2);
            await p2.screenshot({ path: path.join(__dirname, 'screenshots', file), fullPage: false }); await c2.close();
        };
        await shotPage(1280, 1, 'desktop.png', async p2 => { await p2.evaluate(() => { const r = document.querySelector('.items').getBoundingClientRect(); window.scrollTo(0, r.top + scrollY - 16); }); });
        await shotPage(390, 2, 'phone.png', async p2 => { await p2.evaluate(() => { const r = document.querySelector('.items').getBoundingClientRect(); window.scrollTo(0, r.top + scrollY - 10); }); });
    }

    eq(errors, [], 'no console errors');
    eq(failed.filter(f => !/goatcounter|zgo/.test(f)), [], 'no failed requests');
    await browser.close(); if (srv) srv.s.close();
    fails.forEach(f => console.log('FAIL ' + f));
    console.log((fails.length ? fails.length + ' FAILED, ' : 'ALL PASSED, ') + pass + ' page checks (' + (BASE ? 'live' : 'local') + ')');
    if (fails.length) process.exitCode = 1;
})().catch(e => { console.error(String(e.message).split("\n").slice(0, 4).join("\n")); fails.forEach(f => console.log("FAIL " + f)); process.exit(1); });
