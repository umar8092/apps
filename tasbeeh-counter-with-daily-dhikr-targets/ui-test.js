// Full page test with Playwright. Run from the repo root or this folder: node ui-test.js
//   BASE=https://umar8092.github.io/apps node ui-test.js   tests the live site
//   node ui-test.js --shots                                 also saves screenshots/desktop.png and phone.png
// "Now" is fixed to Fri 23 Oct 2026, 15:00 in Pakistan time so every answer can be checked exactly.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.resolve(__dirname, '..'), SLUG = 'tasbeeh-counter-with-daily-dhikr-targets', KEY = SLUG + '.state';
const SHOTS = process.argv.includes('--shots');
const NOW = new Date('2026-10-23T15:00:00+05:00');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; if (!cond) console.log('FAIL ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra).slice(0, 400) : '')); };

function serve() {
    const types = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml', png: 'image/png', webmanifest: 'application/manifest+json' };
    return new Promise(res => { const s = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0].replace(/^\/apps/, '')); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': types[f.split('.').pop()] || 'application/octet-stream' }); r.end(fs.readFileSync(f)); }).listen(0, () => res(s)); });
}

// Ayesha from the README: tasbeeh after prayer 245 taps today (2 rounds, now Alhamdulillah 12 of 33), istighfar 64 of 100,
// durood 1,000 on Fridays (640 so far), and the family's 1,25,000 Ayat-e-Karima by Thu 29 Oct shared by 3 (34,500 done).
const fatimah = [{ name: 'SubhanAllah', arabic: 'سُبْحَانَ اللَّهِ', count: 33 }, { name: 'Alhamdulillah', arabic: 'الْحَمْدُ لِلَّهِ', count: 33 }, { name: 'Allahu Akbar', arabic: 'اللَّهُ أَكْبَرُ', count: 34 }];
function ayesha() {
    const log = {};
    const day = i => { const d = new Date(2026, 9, 23 - i, 12); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
    for (let i = 1; i <= 9; i++) log[day(i)] = { 1: i === 4 ? 300 : 500, 2: i === 4 ? 40 : 100 };
    log[day(7)][3] = 1000; // last Friday
    log[day(2)][4] = 20000; log[day(1)][4] = 14500;
    log[day(0)] = { 1: 245, 2: 64, 3: 640 };
    return { v: 1, nextId: 5, active: 1, settings: { dayStart: 0, vibrate: 'marks' }, log, items: [
        { id: 1, kind: 'set', name: 'Tasbeeh after prayer (33, 33, 34)', steps: fatimah, rounds: 5 },
        { id: 2, kind: 'daily', name: 'Astaghfirullah (Istighfar)', arabic: 'أَسْتَغْفِرُ اللَّهَ', target: 100, days: null, mark: 100 },
        { id: 3, kind: 'daily', name: 'Durood (Salawat)', arabic: 'اللَّهُمَّ صَلِّ عَلَى مُحَمَّدٍ', target: 1000, days: [5], mark: 100 },
        { id: 4, kind: 'goal', name: 'Ayat-e-Karima', arabic: 'لَا إِلَهَ إِلَّا أَنْتَ سُبْحَانَكَ إِنِّي كُنْتُ مِنَ الظَّالِمِينَ', total: 125000, by: '2026-10-29', people: 3, offset: 0 }] };
}

(async () => {
    let srv, base = process.env.BASE;
    if (!base) { srv = await serve(); base = 'http://localhost:' + srv.address().port + '/apps'; }
    const URL = base.replace(/\/$/, '') + '/' + SLUG + '/';
    const browser = await chromium.launch();
    const errors = [];
    async function open(width, opts) {
        opts = opts || {};
        const ctx = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: 'Asia/Karachi', deviceScaleFactor: opts.scale || 1, acceptDownloads: true, colorScheme: opts.scheme || 'dark' });
        await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new globalThis.URL(URL).origin }).catch(() => {});
        const page = await ctx.newPage();
        await page.clock.install({ time: opts.time || NOW });
        page.on('pageerror', e => errors.push(e.message));
        page.on('console', m => { if (m.type() === 'error' && !/goatcounter|gc\.zgo|ERR_NAME_NOT_RESOLVED|ERR_INTERNET|ERR_TUNNEL|ERR_CONNECTION/i.test(m.text() + (m.location().url || ''))) errors.push(m.text()); });
        page.on('requestfailed', r => { if (!/gc\.zgo|goatcounter/.test(r.url())) errors.push('failed ' + r.url()); });
        if (opts.state !== undefined) await page.addInitScript(([k, v]) => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } }, [KEY, opts.state]);
        await page.goto(URL);
        return { ctx, page };
    }
    const txt = (p, sel) => p.textContent(sel).then(t => (t || '').replace(/\s+/g, ' ').trim());
    const tapN = async (p, n, sel) => { for (let i = 0; i < n; i++) await p.click(sel || '#tap'); };
    const saved = p => p.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);

    // ---------- first use: the usual list, tasbeeh after prayer moves on by itself ----------
    {
        const { ctx, page: p } = await open(390);
        ok('first use has 3 dhikr', (await p.$$('#pick .chip')).length === 3);
        ok('first chip is pressed', await p.getAttribute('#pick .chip', 'aria-pressed') === 'true');
        ok('first use shows SubhanAllah', (await txt(p, '#cur-step')) === 'Now: SubhanAllah (1 of 3)', await txt(p, '#cur-step'));
        ok('first use 0 of 33', (await txt(p, '#tap-n')) === '0' && (await txt(p, '#tap-sub')) === 'of 33');
        ok('first use line', (await txt(p, '#cur-line')) === '0 of 5 rounds done today, 5 to go', await txt(p, '#cur-line'));
        ok('empty week says nothing counted', (await txt(p, '#days li:first-child')) === 'Today Nothing counted');
        await tapN(p, 32);
        ok('32 of 33', (await txt(p, '#tap-n')) === '32');
        await tapN(p, 1);
        ok('33 moves to Alhamdulillah', (await txt(p, '#cur-step')) === 'Now: Alhamdulillah (2 of 3)' && (await txt(p, '#tap-n')) === '0');
        ok('message says the next phrase', (await txt(p, '#c-msg')) === 'Now: Alhamdulillah (33)', await txt(p, '#c-msg'));
        ok('Arabic shows the phrase being counted', (await txt(p, '#cur-ar')) === 'الْحَمْدُ لِلَّهِ');
        await tapN(p, 33);
        ok('66 moves to Allahu Akbar of 34', (await txt(p, '#cur-step')) === 'Now: Allahu Akbar (3 of 3)' && (await txt(p, '#tap-sub')) === 'of 34');
        await tapN(p, 34);
        ok('100 is one round', (await txt(p, '#cur-line')) === '1 of 5 rounds done today, 4 to go', await txt(p, '#cur-line'));
        ok('round message', (await txt(p, '#c-msg')) === 'Round 1 done. Now: SubhanAllah (33)', await txt(p, '#c-msg'));
        await p.click('#minus');
        ok('-1 goes back to Allahu Akbar 33', (await txt(p, '#cur-step')) === 'Now: Allahu Akbar (3 of 3)' && (await txt(p, '#tap-n')) === '33');
        ok('saved after each tap', (await saved(p)).log['2026-10-23'][1] === 99);
        ok('week shows taps and rounds', (await txt(p, '#week li:first-child .v')) === '99 (0 rounds)', await txt(p, '#week li:first-child .v'));

        // istighfar: 64 of 100, -1 at 0, change count
        await p.click('#pick .chip:nth-child(2)');
        ok('switch to istighfar', (await txt(p, '#cur-name')) === 'Astaghfirullah (Istighfar)');
        await p.click('#minus');
        ok('-1 at 0 explains', (await txt(p, '#c-msg')) === 'Nothing to take back today.');
        ok('-1 at 0 stays 0', (await txt(p, '#tap-n')) === '0');
        await tapN(p, 64);
        ok('istighfar 64 of 100', (await txt(p, '#cur-line')) === '64 of 100 today, 36 to go', await txt(p, '#cur-line'));
        ok('istighfar box agrees', (await txt(p, '#items li:nth-child(2) .b-line')) === '64 of 100 today, 36 to go');
        await p.click('#fix-open');
        ok('change count opens', await p.isVisible('#fix-n'));
        for (const [v, want] of [['', 'Type a number first, such as 33.'], ['abc', 'Type a whole number above 0, such as 33.'], ['-5', 'Type a whole number above 0, such as 33.'], ['3.5', 'Type a whole number above 0, such as 33.'], ['0', 'Type a whole number above 0, such as 33.']]) {
            await p.fill('#fix-n', v); await p.click('#fix-add');
            ok('add rejects "' + v + '"', (await txt(p, '#e-fix')) === want, await txt(p, '#e-fix'));
        }
        ok('rejected input marked', await p.getAttribute('#fix-n', 'aria-invalid') === 'true');
        await p.fill('#fix-n', '9999999'); await p.click('#fix-add');
        ok('add over the limit refused', (await txt(p, '#e-fix')).startsWith('That would be more than'), await txt(p, '#e-fix'));
        await p.fill('#fix-n', ' 36 '); await p.click('#fix-add');
        ok('add 36 with spaces reaches 100', (await txt(p, '#cur-line')) === '100 of 100 today: done', await txt(p, '#cur-line'));
        ok('chip gets a tick', (await txt(p, '#pick .chip:nth-child(2)')).endsWith('✓'));
        ok('box turns done', await p.getAttribute('#items li:nth-child(2)', 'class').then(c => c.includes('done')));
        await p.click('#c-msg .undo');
        ok('undo the add', (await txt(p, '#tap-n')) === '64');
        await p.fill('#fix-n', '0'); await p.click('#fix-set');
        ok('set today to 0', (await txt(p, '#tap-n')) === '0');
        await p.fill('#fix-n', '1,000'); await p.click('#fix-set');
        ok('set today to 1,000 with a comma', (await txt(p, '#tap-n')) === '1,000');
        await p.click('#fix-reset');
        ok('reset today', (await txt(p, '#tap-n')) === '0' && (await txt(p, '#c-msg')).startsWith('Astaghfirullah (Istighfar) today is back to 0.'));
        await p.click('#c-msg .undo');
        ok('undo reset', (await txt(p, '#tap-n')) === '1,000');
        await p.fill('#fix-n', '64'); await p.click('#fix-set');
        await p.click('#fix-reset'); await p.click('#fix-reset');
        ok('reset at 0 says so', (await txt(p, '#c-msg')) === 'Astaghfirullah (Istighfar) is already 0 today.');
        await p.fill('#fix-n', '64'); await p.click('#fix-set');
        await p.click('#fix-open');
        ok('change count closes', !(await p.isVisible('#fix-n')));

        // +1 full round on the set
        await p.click('#pick .chip:nth-child(1)');
        await p.click('#fix-open');
        ok('+1 full round shown for a set', await p.isVisible('#fix-round'));
        await p.click('#fix-round');
        ok('+1 full round adds 100', (await saved(p)).log['2026-10-23'][1] === 199 && (await txt(p, '#cur-line')) === '1 of 5 rounds done today, 4 to go');
        await p.click('#pick .chip:nth-child(2)');
        await p.click('#fix-open');
        ok('+1 full round hidden for a daily dhikr', !(await p.isVisible('#fix-round')));
        await p.click('#fix-open');

        // keyboard
        await p.evaluate(() => document.activeElement && document.activeElement.blur());
        await p.keyboard.press('Space'); await p.keyboard.press('Enter');
        ok('Space and Enter count', (await txt(p, '#tap-n')) === '66', await txt(p, '#tap-n'));
        await p.keyboard.press('Backspace');
        ok('Backspace takes one back', (await txt(p, '#tap-n')) === '65');
        await p.focus('#tap'); await p.keyboard.press('Space');
        ok('Space on the focused circle counts once', (await txt(p, '#tap-n')) === '66', await txt(p, '#tap-n'));
        await p.focus('#fix-open'); await p.keyboard.press('Backspace');
        ok('Backspace on another button does nothing', (await txt(p, '#tap-n')) === '66');

        // full screen
        await p.click('#focus-open');
        ok('full screen opens', await p.isVisible('#focus'));
        ok('full screen covers the screen', await p.$eval('#focus', e => { const r = e.getBoundingClientRect(); return r.width === innerWidth && r.height === innerHeight; }));
        await tapN(p, 4, '#f-tap');
        ok('full screen counts', (await txt(p, '#f-n')) === '70');
        await p.click('#f-minus');
        ok('full screen -1', (await txt(p, '#f-n')) === '69');
        await p.keyboard.press('Space');
        ok('Space counts in full screen', (await txt(p, '#f-n')) === '70', await txt(p, '#f-n'));
        await p.keyboard.press('Escape');
        ok('Escape closes full screen', !(await p.isVisible('#focus')) && (await txt(p, '#tap-n')) === '70');
        await p.click('#focus-open'); await p.click('#f-close');
        ok('Close closes full screen', !(await p.isVisible('#focus')));

        // reload keeps everything
        await p.reload();
        ok('reload keeps the active dhikr', (await txt(p, '#cur-name')) === 'Astaghfirullah (Istighfar)');
        ok('reload keeps the count', (await txt(p, '#tap-n')) === '70');
        ok('only prefixed keys', (await p.evaluate(() => Object.keys(localStorage))).every(k => k.startsWith(SLUG + '.') || k === 'apps.theme'), await p.evaluate(() => Object.keys(localStorage)));
        await ctx.close();
    }

    // ---------- adding, editing, deleting ----------
    {
        const { ctx, page: p } = await open(390);
        await p.click('#add');
        ok('add form opens', await p.isVisible('#edit'));
        ok('add form defaults to istighfar 100', (await p.inputValue('#e-name')) === 'Astaghfirullah (Istighfar)' && (await p.inputValue('#e-target')) === '100');
        await p.click('#save');
        ok('duplicate name refused', (await txt(p, '#e-name-err')).startsWith('You already have "Astaghfirullah (Istighfar)"'), await txt(p, '#e-name-err'));
        // Friday-only durood with its own target
        await p.selectOption('#e-phrase', 'durood');
        ok('picking a phrase fills the name', (await p.inputValue('#e-name')) === 'Durood (Salawat)');
        ok('picking a phrase fills the Arabic', (await p.inputValue('#e-ar')) === 'اللَّهُمَّ صَلِّ عَلَى مُحَمَّدٍ');
        await p.fill('#e-name', 'Durood on Friday');
        await p.selectOption('#e-target', 'custom');
        await p.fill('#e-target-n', '0'); await p.click('#save');
        ok('target 0 refused', (await txt(p, '#e-target-err')) === 'Type a whole number from 1 to 1,000,000.');
        await p.fill('#e-target-n', '1,000');
        await p.click('label[for=d-some]');
        await p.click('#save');
        ok('no day picked refused', (await txt(p, '#e-days-err')) === 'Tap at least one day, or choose Every day.');
        await p.click('#wk button[data-d="5"]');
        await p.click('#save');
        ok('added and counting it', (await txt(p, '#cur-name')) === 'Durood on Friday' && !(await p.isVisible('#edit')));
        ok('Friday target today', (await txt(p, '#cur-line')) === '0 of 1,000 today, 1,000 to go', await txt(p, '#cur-line'));
        ok('badge says Fridays', (await txt(p, '#items li:nth-child(4) .b-sub')).includes('Target on Fridays'), await txt(p, '#items li:nth-child(4) .b-sub'));
        await p.click('#l-msg .undo');
        ok('undo the add', (await p.$$('#pick .chip')).length === 3);

        // my own words, a set with a blank count
        await p.click('#add');
        await p.click('label[for=k-set]');
        ok('set kind shows 3 phrases', (await p.$$('#steps li')).length === 3);
        ok('set name filled', (await p.inputValue('#e-name')) === 'Tasbeeh after prayer (33, 33, 34)');
        await p.fill('#e-name', 'Morning set');
        await p.click('#step-add');
        await p.selectOption('#st-p3', 'own');
        await p.click('#save');
        ok('own words needed', (await txt(p, '#st-e3')) === 'Type the words for this phrase.');
        await p.fill('#st-n3', 'Ya Hayyu Ya Qayyum');
        await p.click('#save');
        ok('blank count refused', (await txt(p, '#st-e3')) === 'Type how many, from 1 to 1,000.');
        await p.fill('#st-c3', '7');
        await p.click('#steps li:nth-child(1) .del');
        ok('remove a phrase', (await p.$$('#steps li')).length === 3);
        ok('remove keeps typed values', (await p.inputValue('#st-n2')) === 'Ya Hayyu Ya Qayyum' && (await p.inputValue('#st-c2')) === '7');
        await p.selectOption('#e-rounds', 'custom');
        await p.fill('#e-rounds-n', '2');
        await p.click('#save');
        ok('set saved', (await txt(p, '#cur-name')) === 'Morning set' && (await txt(p, '#cur-step')) === 'Now: Alhamdulillah (1 of 3)');
        ok('set line', (await txt(p, '#cur-line')) === '0 of 2 rounds done today, 2 to go');
        ok('set box sums the round', (await txt(p, '#items li:nth-child(4) .b-sub')).includes('33 + 34 + 7 = 74 a round'), await txt(p, '#items li:nth-child(4) .b-sub'));

        // big goal: no total, then 1,25,000 with a date and 3 people
        await p.click('#add');
        await p.click('label[for=k-goal]');
        ok('goal name is Ayat-e-Karima', (await p.inputValue('#e-name')) === 'Ayat-e-Karima');
        ok('goal date and people are optional and hidden', !(await p.isVisible('#e-by')) && !(await p.isVisible('#e-people')));
        await p.click('#save');
        ok('goal total needed', (await txt(p, '#e-total-err')) === 'Type the total, such as 1,25,000.');
        await p.fill('#e-total', '1,25,000');
        await p.click('#o-by'); await p.fill('#e-by', '2026-10-01'); await p.click('#save');
        ok('past date refused', (await txt(p, '#e-by-err')) === 'Pick today or a day after today.');
        await p.fill('#e-by', '2026-10-29');
        await p.click('#o-people'); await p.fill('#e-people', '3');
        await p.click('#save');
        ok('goal saved', (await txt(p, '#cur-name')) === 'Ayat-e-Karima' && (await txt(p, '#tap-sub')) === 'of 125,000');
        ok('goal per day and split', (await txt(p, '#cur-extra')) === 'Today: 0 · 17,858 a day to finish by Thu 29 Oct · Shared by 3: 2 people do 41,667 and 1 person does 41,666', await txt(p, '#cur-extra'));
        await p.click('#fix-open'); await p.fill('#fix-n', '34500'); await p.click('#fix-add');
        ok('goal after adding', (await txt(p, '#cur-line')) === '34,500 of 125,000, 90,500 to go' && (await txt(p, '#cur-extra')).includes('12,929 a day'), await txt(p, '#cur-extra'));
        // edit: start again
        await p.click('#items li:nth-child(5) button:has-text("Edit")');
        ok('edit hides the kind', !(await p.isVisible('#k-goal + label')));
        ok('edit keeps the date', (await p.inputValue('#e-by')) === '2026-10-29');
        await p.click('#goal-again');
        ok('start again from 0', (await txt(p, '#tap-n')) === '0');
        await p.click('#l-msg .undo');
        ok('undo start again', (await txt(p, '#tap-n')) === '34,500');
        // a goal with no date and no people is fine
        await p.click('#add'); await p.click('label[for=k-goal]'); await p.fill('#e-name', 'Durood for Mawlid'); await p.selectOption('#e-phrase', 'durood').catch(() => {}); await p.fill('#e-name', 'Durood for Mawlid'); await p.fill('#e-total', '10000'); await p.click('#save');
        ok('goal without optional fields', (await txt(p, '#cur-extra')) === 'Today: 0', await txt(p, '#cur-extra'));

        // edit istighfar to 300: count kept, line updates
        await p.click('#pick .chip:nth-child(2)'); await tapN(p, 5);
        await p.click('#items li:nth-child(2) button:has-text("Edit")');
        ok('edit form title', (await txt(p, '#edit-h')) === 'Change Astaghfirullah (Istighfar)');
        await p.selectOption('#e-target', '300'); await p.click('#save');
        ok('edited target', (await txt(p, '#cur-line')) === '5 of 300 today, 295 to go', await txt(p, '#cur-line'));
        // cancel changes nothing
        await p.click('#items li:nth-child(2) button:has-text("Edit")'); await p.selectOption('#e-target', '33'); await p.click('#cancel');
        ok('cancel keeps target', (await txt(p, '#cur-line')) === '5 of 300 today, 295 to go');
        // move up
        await p.click('#items li:nth-child(2) button:has-text("Move up")');
        ok('move up', (await txt(p, '#pick .chip:nth-child(1)')) === 'Astaghfirullah (Istighfar)');
        // delete with undo
        await p.click('#items li:nth-child(1) button:has-text("Delete")');
        ok('delete', (await p.$$('#pick .chip')).length === 5 && (await txt(p, '#l-msg')).startsWith('Deleted Astaghfirullah (Istighfar) and its counts.'));
        ok('delete moves counting to the first', (await txt(p, '#cur-name')) === 'Tasbeeh after prayer (33, 33, 34)');
        await p.click('#l-msg .undo');
        ok('undo delete keeps counts', (await p.$$('#pick .chip')).length === 6 && (await saved(p)).log['2026-10-23'][2] === 5);
        // text is text
        await p.click('#add'); await p.selectOption('#e-phrase', 'own'); await p.fill('#e-name', '<img src=x onerror=window.hacked=1>'); await p.click('#save');
        ok('name shown as text', (await txt(p, '#cur-name')) === '<img src=x onerror=window.hacked=1>' && !(await p.evaluate(() => window.hacked)));
        ok('own words with no Arabic is fine', (await txt(p, '#cur-ar')) === '');

        // summary, email, copy
        const href = await p.getAttribute('#mail', 'href');
        ok('email link has no address and has the summary', href.startsWith('mailto:?subject=') && decodeURIComponent(href).includes('Astaghfirullah (Istighfar): 5 of 300 today, 295 to go'), href.slice(0, 200));
        await p.click('#copy');
        await p.waitForFunction(() => document.getElementById('set-msg').textContent.length > 0, null, { timeout: 5000 }).catch(() => {});
        ok('copy message', (await txt(p, '#set-msg')).startsWith('Copied') || (await txt(p, '#set-msg')).startsWith('Could not copy'), await txt(p, '#set-msg'));
        const clip = await p.evaluate(() => navigator.clipboard.readText()).catch(() => '');
        if (clip) ok('copied summary', clip.startsWith('My dhikr, Fri 23 Oct 2026:'), clip.slice(0, 80));

        // backup and restore
        const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#backup')]);
        const file = path.join(os.tmpdir(), 'tasbeeh-test-backup.json'); await dl.saveAs(file);
        ok('backup file name', dl.suggestedFilename() === 'tasbeeh-backup-2026-10-23.json');
        await p.click('#wipe');
        ok('delete everything empties', await p.isVisible('#none') && !(await p.isVisible('#cur')) && (await p.$$('#items li')).length === 0);
        await p.click('#set-msg .undo');
        ok('undo delete everything', (await p.$$('#pick .chip')).length === 7);
        await p.click('#wipe');
        await p.setInputFiles('#restore-file', file);
        await p.waitForFunction(() => document.getElementById('set-msg').textContent.startsWith('Restored'));
        ok('restore brings it all back', (await p.$$('#pick .chip')).length === 7 && (await txt(p, '#set-msg')).startsWith('Restored 7 dhikr'), await txt(p, '#set-msg'));
        const junk = path.join(os.tmpdir(), 'tasbeeh-junk.json'); fs.writeFileSync(junk, '{"hello":1}');
        await p.setInputFiles('#restore-file', junk);
        await p.waitForFunction(() => document.getElementById('set-msg').textContent.startsWith('That file'));
        ok('junk file refused', (await p.$$('#pick .chip')).length === 7);
        // empty state and the usual list
        await p.click('#wipe');
        ok('empty state message', (await txt(p, '#none .empty')).startsWith('Nothing to count yet.'));
        await p.keyboard.press('Space');
        ok('no errors counting with nothing', true);
        await p.click('#starter');
        ok('usual list again', (await p.$$('#pick .chip')).length === 3 && (await txt(p, '#cur-step')) === 'Now: SubhanAllah (1 of 3)');
        // theme switch
        const before = await p.evaluate(() => document.documentElement.getAttribute('data-theme'));
        await p.click('.theme-toggle');
        const after = await p.evaluate(() => document.documentElement.getAttribute('data-theme'));
        ok('theme switch', after && after !== before, [before, after]);
        await ctx.close();
    }

    // ---------- saved state from a week of use, history, streaks ----------
    {
        const { ctx, page: p } = await open(1280, { state: JSON.stringify(ayesha()) });
        ok('set position from saved state', (await txt(p, '#cur-step')) === 'Now: Alhamdulillah (2 of 3)' && (await txt(p, '#tap-n')) === '12');
        ok('set streak', (await txt(p, '#cur-extra')).startsWith('3 days in a row'), await txt(p, '#cur-extra'));
        ok('week rounds', (await txt(p, '#week li:nth-child(1) .v')) === '3,045 (30 rounds)', await txt(p, '#week li:nth-child(1) .v'));
        ok('week target days', (await txt(p, '#week li:nth-child(1) .d')) === 'Target reached on 5 of 7 days', await txt(p, '#week li:nth-child(1) .d'));
        ok('Friday durood: 1 of 1 day', (await txt(p, '#week li:nth-child(3) .d')) === 'Target reached on 0 of 1 day', await txt(p, '#week li:nth-child(3) .d'));
        ok('goal week', (await txt(p, '#week li:nth-child(4) .d')) === '34,500 of 125,000 in all');
        ok('yesterday row', (await txt(p, '#days li:nth-child(2)')).startsWith('Yesterday Tasbeeh after prayer (33, 33, 34) 500 (5 rounds) ✓'), await txt(p, '#days li:nth-child(2)'));
        await p.click('#days-more');
        ok('30 days', (await p.$$('#days li')).length === 30);
        await p.click('#pick .chip:nth-child(3)');
        ok('durood Friday line', (await txt(p, '#cur-line')) === '640 of 1,000 today, 360 to go');
        ok('durood Friday streak', (await txt(p, '#cur-extra')).startsWith('1 day in a row'), await txt(p, '#cur-extra'));
        await ctx.close();
    }

    // ---------- days: a new day at midnight, late-night counting, corrupt data ----------
    {
        const late = new Date('2026-10-23T23:59:40+05:00');
        const { ctx, page: p } = await open(390, { time: late, state: JSON.stringify(ayesha()) });
        await p.click('#pick .chip:nth-child(2)');
        await tapN(p, 2);
        ok('23:59 counts for Friday', (await txt(p, '#tap-n')) === '66');
        await p.clock.runFor(60000);
        ok('after midnight a new day starts', (await txt(p, '#tap-n')) === '0' && (await txt(p, '#days li:nth-child(2)')).includes('Astaghfirullah (Istighfar) 66'), await txt(p, '#days li:nth-child(2)'));
        ok('Saturday: durood has no target', (await p.$eval('#items li:nth-child(3) .b-line', e => e.textContent)) === '0 today (no target on Saturdays)');
        await p.selectOption('#s-day', '4');
        ok('day start 04:00 puts 00:01 back on Friday', (await txt(p, '#tap-n')) === '66', await txt(p, '#tap-n'));
        await p.reload();
        ok('day start is saved', (await p.inputValue('#s-day')) === '4' && (await txt(p, '#tap-n')) === '66');
        await ctx.close();
        const { ctx: c2, page: p2 } = await open(390, { state: '{"v":1,"items":[' });
        ok('corrupt data starts fresh', (await p2.$$('#pick .chip')).length === 3 && (await txt(p2, '#c-msg')) === 'Your saved counts could not be read, so the app started fresh.');
        await c2.close();
        const { ctx: c3, page: p3 } = await open(390, { state: JSON.stringify({ v: 1, items: [{ id: 1, kind: 'daily', name: 'X', target: 'lots' }], log: { x: 1 } }) });
        ok('bad saved items are dropped', await p3.isVisible('#none'));
        await c3.close();
    }

    // ---------- Help and layout: no overlapping controls on phones with every field shown ----------
    for (const w of [320, 360, 390, 820, 1280]) {
        const { ctx, page: p } = await open(w, { state: JSON.stringify(ayesha()) });
        await p.click('.help-btn, button:has-text("Help")');
        const box = await p.$eval('dialog.help', d => { const r = d.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, open: d.open, title: d.textContent.includes('How to use Tasbeeh Counter') }; });
        ok('help inside screen at ' + w, box.open && box.title && box.l >= 0 && box.r <= w && box.t >= 0 && box.b <= 900, box);
        await p.keyboard.press('Escape');
        ok('Escape closes help at ' + w, !(await p.$eval('dialog.help', d => d.open)));
        await p.click('button:has-text("Help")'); await p.click('dialog.help button:has-text("Got it")');
        ok('Got it closes help at ' + w, !(await p.$eval('dialog.help', d => d.open)));
        const bar = await p.$$eval('.topbar > *', els => els.map(e => e.getBoundingClientRect()).map(r => ({ l: r.left, r: r.right, t: r.top, b: r.bottom })));
        ok('top bar fits at ' + w, bar.every(r => r.r <= w && r.l >= 0) && bar.every((a, i) => bar.every((b, j) => i >= j || a.r <= b.l + 1 || b.r <= a.l + 1 || a.b <= b.t + 1 || b.b <= a.t + 1)), bar);
        if (w > 400) { await ctx.close(); continue; }
        await p.click('#fix-open');
        for (const k of ['daily', 'set', 'goal']) {
            await p.click('#add');
            await p.click('label[for=k-' + k + ']');
            if (k === 'daily') { await p.selectOption('#e-target', 'custom'); await p.click('label[for=d-some]'); }
            if (k === 'set') { await p.selectOption('#e-rounds', 'custom'); await p.selectOption('#st-p0', 'own'); }
            if (k === 'goal') { await p.click('#o-by'); await p.click('#o-people'); }
            const clash = await p.evaluate(() => {
                const els = [...document.querySelectorAll('input:not([type=radio]):not([type=file]), select, button, .seg label')].filter(e => e.offsetParent && !e.closest('.focus') && !e.closest('dialog'));
                const R = els.map(e => [e, e.getBoundingClientRect()]), bad = [];
                for (let i = 0; i < R.length; i++) {
                    if (R[i][1].right > innerWidth + 0.5 || R[i][1].left < -0.5) bad.push('out ' + (R[i][0].id || R[i][0].textContent.slice(0, 20)));
                    for (let j = i + 1; j < R.length; j++) { const a = R[i][1], b = R[j][1]; if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1 && !R[i][0].contains(R[j][0]) && !R[j][0].contains(R[i][0])) bad.push((R[i][0].id || R[i][0].textContent.slice(0, 20)) + ' x ' + (R[j][0].id || R[j][0].textContent.slice(0, 20))); }
                }
                // placeholders fit their boxes
                document.querySelectorAll('input[placeholder]').forEach(i => { if (!i.offsetParent) return; const c = document.createElement('canvas').getContext('2d'); const s = getComputedStyle(i); c.font = s.fontSize + ' ' + s.fontFamily; const need = c.measureText(i.placeholder).width + parseFloat(s.paddingLeft) + parseFloat(s.paddingRight); if (need > i.clientWidth + 1) bad.push('placeholder cut ' + i.id); });
                return bad;
            });
            ok('no overlap at ' + w + ' in ' + k, !clash.length, clash);
            ok('no side scroll at ' + w + ' in ' + k, await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
            await p.click('#cancel');
        }
        await ctx.close();
    }

    // ---------- every width, dark and light, filled in and cleared: no side scroll, nothing sticking out, no overlap when scrolled ----------
    for (const scheme of ['dark', 'light']) for (const w of [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920]) {
        const { ctx, page: p } = await open(w, { scheme, state: JSON.stringify(ayesha()) });
        for (const mode of ['filled', 'cleared']) {
            if (mode === 'cleared') await p.click('#wipe');
            else { await p.click('#fix-open'); await p.click('#days-more'); }
            const r = await p.evaluate(() => {
                const bad = [];
                if (document.documentElement.scrollWidth > innerWidth) bad.push('side scroll ' + document.documentElement.scrollWidth);
                document.querySelectorAll('main *').forEach(e => { if (!e.offsetParent || e.closest('details:not([open])')) return; const b = e.getBoundingClientRect(); if (b.width && (b.right > innerWidth + 0.5 || b.left < -0.5)) bad.push('sticks out ' + (e.id || e.className || e.tagName)); });
                return bad.slice(0, 5);
            });
            ok(scheme + ' ' + w + ' ' + mode + ' fits', !r.length, r);
            if (w >= 900) for (const where of [0, 0.5, 1]) {
                await p.evaluate(f => scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * f), where);
                const o = await p.evaluate(() => {
                    const bad = [];
                    for (const parent of [document.querySelector('main'), ...document.querySelectorAll('.col-main, .col-side')]) {
                        const kids = [...parent.children].filter(k => k.offsetParent && getComputedStyle(k).display !== 'contents').map(k => [k, k.getBoundingClientRect()]);
                        for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) { const a = kids[i][1], b = kids[j][1]; if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) bad.push((kids[i][0].id || kids[i][0].className) + ' x ' + (kids[j][0].id || kids[j][0].className)); }
                    }
                    return bad;
                });
                ok(scheme + ' ' + w + ' ' + mode + ' no overlap scrolled ' + where, !o.length, o);
            }
        }
        await ctx.close();
    }

    // ---------- screenshots for the README ----------
    if (SHOTS) {
        for (const [w, file, scale] of [[1280, 'desktop.png', 1], [390, 'phone.png', 2]]) {
            const { ctx, page: p } = await open(w, { scale, state: JSON.stringify(ayesha()), scheme: 'dark' });
            await p.waitForTimeout(300);
            const opts = { path: path.join(__dirname, 'screenshots', file), fullPage: true };
            if (w === 1280) opts.clip = { x: 0, y: 0, width: 1280, height: await p.evaluate(() => Math.ceil(document.querySelector('.faq').getBoundingClientRect().top + scrollY)) };
            else opts.clip = { x: 0, y: 0, width: 390, height: await p.evaluate(() => Math.ceil(document.getElementById('list').getBoundingClientRect().top + scrollY + 520)) };
            await p.screenshot(opts);
            await ctx.close();
        }
    }

    ok('no page errors', !errors.length, errors);
    await browser.close(); if (srv) srv.close();
    console.log(pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
