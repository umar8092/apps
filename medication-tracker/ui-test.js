// Drives the real page in headless Chromium: node ui-test.js [--shots] [--base https://umar8092.github.io/apps]
// Without --base it serves this repo on localhost. With --base it tests the LIVE page.
const pw = (() => { for (const m of ['playwright', 'playwright-core', '/opt/node-tools/node_modules/playwright']) { try { return require(m); } catch (e) { /* next */ } } throw new Error('playwright not found'); })();
const path = require('path'), fs = require('fs'), http = require('http');
const bi = process.argv.indexOf('--base');
const shots = process.argv.includes('--shots');
let fail = 0, url;
const ok = (name, cond, extra) => { if (!cond) fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (!cond && extra != null ? '  -> ' + JSON.stringify(extra).slice(0, 300) : '')); };

function serve() {
    const ROOT = path.resolve(__dirname, '..');
    const types = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml', png: 'image/png', webmanifest: 'application/manifest+json' };
    return new Promise(res => {
        const s = http.createServer((req, rs) => {
            let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
            const f = path.join(ROOT, p);
            if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rs.writeHead(404); return rs.end('nf'); }
            rs.writeHead(200, { 'content-type': types[f.split('.').pop()] || 'application/octet-stream' }); rs.end(fs.readFileSync(f));
        }).listen(0, () => res(s));
    });
}

// Times are wall-clock times in the page's time zone (Karachi, UTC+5, no daylight saving).
const TZ_OFF = 5 * 3600000;
const T = s => Date.parse(s + ':00Z') - TZ_OFF;

async function open(b, vp, opt = {}) {
    const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: vp.width < 500 ? 2 : 1, colorScheme: opt.theme || 'dark', locale: 'en-US', timezoneId: 'Asia/Karachi',
        permissions: ['clipboard-read', 'clipboard-write'], acceptDownloads: true });
    if (opt.init) await ctx.addInitScript(opt.init);
    const p = await ctx.newPage();
    p.errors = []; p.on('console', m => m.type() === 'error' && p.errors.push(m.text())); p.on('pageerror', e => p.errors.push(String(e)));
    p.bad = []; p.on('response', r => { if (r.status() >= 400) p.bad.push(r.status() + ' ' + r.url()); });
    p.at = async s => { await p.clock.setFixedTime(T(s)); };
    await p.at(opt.time || '2026-10-07T08:04');
    await p.goto(url, { waitUntil: 'networkidle' });
    p.ctx = ctx;
    return p;
}
const reloadAt = async (p, s) => { await p.at(s); await p.reload({ waitUntil: 'networkidle' }); };
const txt = (p, sel) => p.locator(sel).first().innerText();
const med = (p, name) => p.locator('.med', { has: p.locator('.m-name', { hasText: name }) });
const slot = (p, name, time) => med(p, name).locator('.slot', { has: p.locator('.s-time', { hasText: new RegExp('^' + time + '$') }) });
async function addMed(p, o) {
    await p.fill('#f-name', o.name);
    if (o.needed) {
        await p.check('input[name=kind][value=needed]');
        await p.selectOption('#f-gap', o.gap || '4'); if (o.gapCustom != null) await p.fill('#f-gap-custom', o.gapCustom);
        await p.selectOption('#f-max', o.max == null ? '' : o.max); if (o.maxCustom != null) await p.fill('#f-max-custom', o.maxCustom);
    } else if (o.preset) await p.click('[data-preset="' + o.preset + '"]');
    if (o.times) { await p.click('[data-preset="1"]'); for (let i = 1; i < o.times.length; i++) await p.click('#add-time'); const ins = p.locator('#times input'); for (let i = 0; i < o.times.length; i++) await ins.nth(i).fill(o.times[i]); }
    if (o.days) { await p.check('input[name=every][value=some]'); for (const d of o.days) await p.locator('#days label', { hasText: d }).click(); }
    if (o.who) { await p.click('#open-who'); await p.fill('#f-who', o.who); }
    if (o.left != null) { await p.click('#open-pills'); await p.fill('#f-left', o.left); if (o.per != null) await p.fill('#f-per', o.per); }
    if (o.end) { await p.click('#open-end'); await p.fill('#f-end', o.end); }
    await p.click('#save');
}
async function layout(p) {
    return p.evaluate(() => {
        const W = document.documentElement.clientWidth, bad = [], inter = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
        if (document.documentElement.scrollWidth > W) bad.push('page scrolls sideways');
        document.querySelectorAll('main *').forEach(e => { const r = e.getBoundingClientRect(); if (r.width && (r.right > W + 1 || r.left < -1) && !e.closest('.days-list')) bad.push('sticks out: ' + e.tagName + '.' + e.className); });
        const c = [...document.querySelectorAll('main input:not([type=radio]):not([type=checkbox]), main select, main button, main a.secondary')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.height; });
        for (let i = 0; i < c.length; i++) for (let j = i + 1; j < c.length; j++) if (!c[i].contains(c[j]) && !c[j].contains(c[i]) && inter(c[i].getBoundingClientRect(), c[j].getBoundingClientRect())) bad.push('overlap: ' + (c[i].id || c[i].className || c[i].textContent) + ' / ' + (c[j].id || c[j].className || c[j].textContent));
        // placeholders and button labels must fit their boxes
        const cv = document.createElement('canvas').getContext('2d');
        document.querySelectorAll('main input[placeholder]').forEach(e => { const r = e.getBoundingClientRect(); if (!r.width) return; const cs = getComputedStyle(e); cv.font = cs.fontSize + ' ' + cs.fontFamily; const w = cv.measureText(e.placeholder).width; const room = e.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight); if (w > room + 1) bad.push('placeholder cut: ' + e.id); });
        document.querySelectorAll('main button, main a.secondary').forEach(e => { if (e.offsetWidth && e.scrollWidth > e.clientWidth + 1) bad.push('label cut: ' + e.textContent); });
        return bad.slice(0, 6);
    });
}
async function siblings(p) {
    return p.evaluate(() => {
        const bad = [];
        document.querySelectorAll('main, .app, .col-side, .col-main').forEach(h => { const k = [...h.children].filter(c => { const r = c.getBoundingClientRect(); return r.width > 4 && r.height > 4 && getComputedStyle(c).position !== 'fixed'; });
            for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { const a = k[i].getBoundingClientRect(), b = k[j].getBoundingClientRect(); if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 4 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 4) bad.push(k[i].className + ' / ' + k[j].className); } });
        return bad;
    });
}

(async () => {
    let srv;
    if (bi >= 0) url = process.argv[bi + 1].replace(/\/$/, '') + '/medication-tracker/';
    else { srv = await serve(); url = 'http://localhost:' + srv.address().port + '/medication-tracker/'; }
    console.log('Testing ' + url);
    const b = await pw.chromium.launch();

    // ---- first use and the main situation: Metformin twice a day
    let p = await open(b, { width: 390, height: 860 }, { time: '2026-10-07T07:50' });
    ok('first use: "No medicines yet" and the example button', (await txt(p, '#r-big')) === 'No medicines yet' && await p.isVisible('#demo'));
    ok('first use: history hidden until there is something', await p.isHidden('#hist'));
    ok('optional fields are hidden behind + buttons', await p.isHidden('#who-box') && await p.isHidden('#pills-box') && await p.isHidden('#end-box') && await p.isVisible('#open-who'));
    ok('default: At set times, Once a day at 08:00', await p.isChecked('input[name=kind][value=times]') && (await p.inputValue('#times input')) === '08:00' && (await p.getAttribute('[data-preset="1"]', 'aria-pressed')) === 'true');

    await p.click('#save');
    ok('blank name refused with a plain message', /Type the medicine/.test(await txt(p, '#form-err')));
    await addMed(p, { name: '  Metformin   500 mg ', preset: 2, left: '56' });
    ok('added without the optional who / last day; spaces tidied', (await med(p, 'Metformin 500 mg').count()) === 1 && /Metformin 500 mg added/.test(await txt(p, '#form-msg')));
    ok('schedule shown in words', /8:00 AM and 8:00 PM, every day/.test(await med(p, 'Metformin').locator('.m-plan').innerText()));
    ok('07:50: 0 of 2, next Metformin at 8:00 AM in 10 min', (await txt(p, '#r-big')) === '0 of 2 doses done' && /Next: Metformin 500 mg at 8:00 AM \(in 10 min\)/.test(await txt(p, '#r-next')));
    await addMed(p, { name: 'metformin 500 MG', preset: 1 });
    ok('the same medicine twice is refused', /already on your list/.test(await txt(p, '#form-err')));
    await p.fill('#f-name', '');

    await reloadAt(p, '2026-10-07T08:04');
    await slot(p, 'Metformin', '8:00 AM').locator('button.take').click();
    ok('08:04: 8:00 AM dose shows "Taken at 8:04 AM"', /Taken at 8:04 AM/.test(await slot(p, 'Metformin', '8:00 AM').innerText()));
    ok('message with Undo', /Metformin 500 mg, 8:00 AM dose: taken at 8:04 AM/.test(await txt(p, '#today-msg')) && await p.isVisible('#today-msg button'));
    ok('keyboard focus moved to the Change button of that dose', await p.evaluate(() => document.activeElement.textContent === 'Change'));
    ok('pills: 55 left, about 27 days', /55 pills left, about 27 days\./.test(await med(p, 'Metformin').locator('.m-pills').innerText()));

    // double dose at 08:30, on the 8:00 PM slot
    await reloadAt(p, '2026-10-07T08:30');
    await slot(p, 'Metformin', '8:00 PM').locator('button.take').click();
    ok('double dose: confirm dialog says when the last dose was', await p.locator('#confirm').evaluate(d => d.open) && /already logged Metformin 500 mg at 8:04 AM, 26 min ago/.test(await txt(p, '#c-text')));
    await p.click('#c-no');
    ok('Cancel: not logged', /Not logged/.test(await txt(p, '#today-msg')) && /Due in/.test(await slot(p, 'Metformin', '8:00 PM').innerText()));
    await slot(p, 'Metformin', '8:00 PM').locator('button.take').click(); await p.keyboard.press('Escape');
    ok('Escape also cancels', /Due in/.test(await slot(p, 'Metformin', '8:00 PM').innerText()));

    // evening: did I take it?
    await reloadAt(p, '2026-10-07T21:00');
    ok('21:00: "1 of 2 doses done", "1 dose is not taken yet."', (await txt(p, '#r-big')) === '1 of 2 doses done' && (await txt(p, '#r-next')) === '1 dose is not taken yet.');
    ok('21:00: 8:00 PM dose "Not taken yet, due 1 h ago"', /Not taken yet, due 1 h ago/.test(await slot(p, 'Metformin', '8:00 PM').innerText()));
    await slot(p, 'Metformin', '8:00 PM').locator('button.take').click();
    ok('no warning 13 h after the morning dose; all done', !(await p.locator('#confirm').evaluate(d => d.open)) && (await txt(p, '#r-big')) === '2 of 2 doses done' && (await txt(p, '#r-next')) === 'All done for today.');
    // undo
    await p.click('#today-msg button');
    ok('Undo brings it back to not taken', (await txt(p, '#r-big')) === '1 of 2 doses done');
    await slot(p, 'Metformin', '8:00 PM').locator('button.take').click();

    // change the time of a dose, a future time, not taken + undo
    await slot(p, 'Metformin', '8:00 AM').locator('button', { hasText: 'Change' }).click();
    await p.fill('.edit-row input', '2026-10-07T07:55'); await p.click('.edit-row button.primary');
    ok('Change: dose time now 7:55 AM', /Taken at 7:55 AM/.test(await slot(p, 'Metformin', '8:00 AM').innerText()));
    await slot(p, 'Metformin', '8:00 AM').locator('button', { hasText: 'Change' }).click();
    await p.fill('.edit-row input', '2026-10-07T23:30'); await p.click('.edit-row button.primary');
    ok('a time still ahead is refused', /still ahead/.test(await txt(p, '.edit-row .err')));
    await p.click('.edit-row button.danger');
    ok('"Not taken" removes the dose', /Not taken yet/.test(await slot(p, 'Metformin', '8:00 AM').innerText()));
    await p.click('#today-msg button');
    ok('...and Undo restores 7:55 AM', /Taken at 7:55 AM/.test(await slot(p, 'Metformin', '8:00 AM').innerText()));

    // ---- as needed: ibuprofen
    await addMed(p, { name: 'Ibuprofen 200 mg', needed: true, gap: '6', max: '3' });
    ok('as needed: "OK to take a dose now", 0 in 24 h', /OK to take a dose now/.test(await med(p, 'Ibuprofen').innerText()) && /In the last 24 hours: 0 of 3/.test(await med(p, 'Ibuprofen').innerText()));
    await med(p, 'Ibuprofen').locator('.take-now').click();
    await reloadAt(p, '2026-10-07T23:40');
    ok('2 h 40 min later: wait until 3:00 AM tomorrow', /Wait until tomorrow 3:00 AM \(in 3 h 20 min\)/.test(await med(p, 'Ibuprofen').innerText()), await med(p, 'Ibuprofen').innerText());
    await med(p, 'Ibuprofen').locator('.take-now').click();
    ok('too soon: dialog with the gap', /You set at least 6 h between doses/.test(await txt(p, '#c-text')));
    await p.click('#c-yes');
    ok('"Log it anyway" logs it: 2 of 3 in 24 h', /In the last 24 hours: 2 of 3/.test(await med(p, 'Ibuprofen').innerText()));

    // ---- custom values and validation
    await p.fill('#f-name', 'Test'); await p.check('input[name=kind][value=needed]'); await p.selectOption('#f-gap', 'custom'); await p.click('#save');
    ok('custom gap blank refused', /hours between doses as a number/.test(await txt(p, '#form-err')));
    await p.fill('#f-gap-custom', '-3'); await p.click('#save'); ok('negative gap refused', !!(await txt(p, '#form-err')));
    await p.fill('#f-gap-custom', '500'); await p.click('#save'); ok('huge gap refused', /up to 168 hours/.test(await txt(p, '#form-err')));
    await p.fill('#f-gap-custom', '5'); await p.selectOption('#f-max', 'custom'); await p.fill('#f-max-custom', '30'); await p.click('#save');
    ok('30 doses a day refused', /1 to 24/.test(await txt(p, '#form-err')));
    await p.fill('#f-max-custom', '5'); await p.click('#save');
    ok('custom 5 h and 5 doses accepted', /at least 5 h apart, up to 5 in 24 hours/.test(await med(p, 'Test').innerText()));
    await p.fill('#f-name', 'Twice'); await p.click('[data-preset="2"]'); await p.locator('#times input').nth(1).fill('08:00'); await p.click('#save');
    ok('the same time twice refused', /is there twice/.test(await txt(p, '#form-err')));
    await p.click('[data-preset="1"]'); await p.check('input[name=every][value=some]'); await p.click('#save');
    ok('Some days with no day ticked refused', /Tick at least one day/.test(await txt(p, '#form-err')));
    await p.check('input[name=every][value=all]'); await p.click('#open-pills'); await p.fill('#f-left', 'ten'); await p.click('#save');
    ok('pills left as a word refused', /how many pills you have/.test(await txt(p, '#form-err')));
    await p.fill('#f-left', '10'); await p.fill('#f-per', '0'); await p.click('#save');
    ok('0 pills per dose refused', /pills make one dose/.test(await txt(p, '#form-err')));
    await p.fill('#f-per', ''); await p.click('#open-end'); await p.fill('#f-end', '2026-10-01'); await p.click('#save');
    ok('last day before today refused', /cannot be before today/.test(await txt(p, '#form-err')));
    await p.fill('#f-end', ''); await p.fill('#f-left', ''); await p.fill('#f-name', 'x'.repeat(80) + ' pasted\nname'); await p.click('#save');
    ok('very long name kept to 60 characters and wraps in its box', (await med(p, 'xxxx').locator('.m-name').innerText()).length === 60 && (await layout(p)).length === 0, await layout(p));

    // ---- edit: change times, cancel, delete with undo
    await med(p, 'Metformin').locator('.m-edit').click();
    ok('Edit fills the form', (await p.inputValue('#f-name')) === 'Metformin 500 mg' && (await txt(p, '#save')) === 'Save changes' && (await p.inputValue('#f-left')) === '54');
    await p.locator('#times input').nth(0).fill('09:00'); await p.locator('#times input').nth(1).fill('21:00'); await p.click('#save');
    ok('new times: today\'s doses moved to 9:00 AM and 9:00 PM', /Taken at 7:55 AM/.test(await slot(p, 'Metformin', '9:00 AM').innerText()) && /Taken at/.test(await slot(p, 'Metformin', '9:00 PM').innerText()));
    ok('saved message says new times count from today', /new times count from today/.test(await txt(p, '#today-msg')));
    await med(p, 'Test').locator('.m-edit').click(); await p.click('#cancel-edit');
    ok('Cancel leaves the form empty again', (await p.inputValue('#f-name')) === '' && (await txt(p, '#save')) === 'Add medicine');
    await med(p, 'Test').locator('.m-edit').click(); await p.click('#delete-med');
    ok('Delete medicine removes it', (await med(p, 'Test').count()) === 0 && /deleted/.test(await txt(p, '#today-msg')));
    await p.click('#today-msg button');
    ok('...Undo brings it back', (await med(p, 'Test').count()) === 1);

    // ---- saved state, history, copy, email
    await reloadAt(p, '2026-10-08T07:00');
    ok('next day: saved; yesterday\'s doses in History', (await med(p, 'Metformin').count()) === 1 && /Yesterday/.test(await txt(p, '#days-list')));
    ok('history summary', /Last 7 days: 2 of 2 set doses taken/.test(await txt(p, '#hist-sum')), await txt(p, '#hist-sum'));
    await p.selectOption('#range', '14'); await p.reload({ waitUntil: 'networkidle' });
    ok('range remembered', (await p.inputValue('#range')) === '14');
    await p.click('#copy');
    const clip = await p.evaluate(() => navigator.clipboard.readText());
    ok('Copy: the log as text', /^Medication log, last 14 days/.test(clip) && clip.includes('- Metformin 500 mg: 9:00 AM and 9:00 PM, every day'));
    const mail = await p.getAttribute('#mail', 'href');
    ok('Email: mailto with no address, subject and body', mail.startsWith('mailto:?subject=Medication%20log&body=') && decodeURIComponent(mail).includes('Medication log, last 7 days'));

    // calendar file
    let [dl] = await Promise.all([p.waitForEvent('download'), p.click('#ics')]);
    const ics = fs.readFileSync(await dl.path(), 'utf8');
    ok('calendar file: daily reminders for set times only', dl.suggestedFilename() === 'medication-reminders.ics' && (ics.match(/BEGIN:VEVENT/g) || []).length === 3 && ics.includes('RRULE:FREQ=DAILY') && /Downloaded 3 reminders/.test(await txt(p, '#tools-msg')));

    // backup and restore
    [dl] = await Promise.all([p.waitForEvent('download'), p.click('#backup')]);
    const backup = fs.readFileSync(await dl.path(), 'utf8');
    ok('backup file', /^medication-tracker-backup-2026-10-08\.json$/.test(dl.suggestedFilename()) && JSON.parse(backup).app === 'medication-tracker');
    await p.click('#wipe');
    ok('Delete everything', (await txt(p, '#r-big')) === 'No medicines yet' && await p.isVisible('#tools-msg button'));
    await p.click('#tools-msg button');
    ok('...Undo', (await med(p, 'Metformin').count()) === 1);
    const tmp = path.join(require('os').tmpdir(), 'mt-'), good = tmp + 'b.json', bad = tmp + 'x.json';
    fs.writeFileSync(good, backup); fs.writeFileSync(bad, '{"app":"other"}');
    const q = await open(b, { width: 390, height: 860 }, { time: '2026-10-08T07:05' });
    await q.setInputFiles('#restore-file', bad); await q.waitForTimeout(150);
    ok('restore a wrong file: nothing changed', /Nothing was changed/.test(await txt(q, '#tools-msg')) && (await txt(q, '#r-big')) === 'No medicines yet');
    await q.setInputFiles('#restore-file', good); await q.waitForTimeout(150);
    ok('restore the backup on a "new phone"', /Restored 4 medicines/.test(await txt(q, '#tools-msg')) && (await med(q, 'Metformin').count()) === 1);
    ok('no console errors (main run)', !p.errors.length && !q.errors.length && !p.bad.length, p.errors.concat(q.errors, p.bad));
    await q.ctx.close();

    // ---- bedtime dose after midnight, skip, weekly, course
    p = await open(b, { width: 390, height: 860 }, { time: '2026-10-07T12:00' });
    await addMed(p, { name: 'Sleep tablet', times: ['23:00'] });
    await addMed(p, { name: 'Methotrexate 10 mg', times: ['09:00'], days: ['Mon'] });
    await addMed(p, { name: 'Amoxicillin 500 mg', preset: 3, end: '2026-10-08' });
    ok('weekly on Mondays: "Nothing to take today." on a Wednesday', /Nothing to take today/.test(await med(p, 'Methotrexate').innerText()) && /on Mon/.test(await med(p, 'Methotrexate').innerText()));
    await slot(p, 'Amoxicillin', '8:00 AM').locator('button', { hasText: 'Skip' }).click();
    ok('Skip: shows Skipped, counts as done', /Skipped/.test(await slot(p, 'Amoxicillin', '8:00 AM').innerText()));
    await slot(p, 'Amoxicillin', '8:00 AM').locator('button', { hasText: 'Undo skip' }).click();
    ok('Undo skip', /Not taken yet/.test(await slot(p, 'Amoxicillin', '8:00 AM').innerText()));
    await reloadAt(p, '2026-10-08T00:30');
    ok('00:30: yesterday\'s 11:00 PM dose is still on Today', await slot(p, 'Sleep tablet', 'Yesterday 11:00 PM').count() === 1);
    await slot(p, 'Sleep tablet', 'Yesterday 11:00 PM').locator('button.take').click();
    ok('...logged for last night; tonight\'s 11:00 PM is still to come', /Taken at 12:30 AM/.test(await slot(p, 'Sleep tablet', 'Yesterday 11:00 PM').innerText()) && /Due in 22 h 30 min/.test(await slot(p, 'Sleep tablet', '11:00 PM').innerText()));
    await reloadAt(p, '2026-10-09T09:00');
    ok('course after its last day: "Course finished"', /Course finished on/.test(await med(p, 'Amoxicillin').innerText()) && (await med(p, 'Amoxicillin').locator('.slot').count()) === 0);
    ok('history: last night\'s dose counted on the 7th, taken "next day"', /11:00 PM taken next day at 12:30 AM/.test(await txt(p, '#days-list')));
    // keyboard only
    await reloadAt(p, '2026-10-12T09:30');
    await slot(p, 'Methotrexate', '9:00 AM').locator('button.take').focus(); await p.keyboard.press('Enter');
    ok('keyboard: Enter on Taken logs the dose (Monday)', /Taken at 9:30 AM/.test(await slot(p, 'Methotrexate', '9:00 AM').innerText()));
    ok('no console errors (second run)', !p.errors.length, p.errors);
    await p.ctx.close();

    // ---- corrupt saved state, blocked storage
    p = await open(b, { width: 390, height: 860 }, { init: () => { try { localStorage.setItem('medication-tracker.state', '{"meds":[{"id":"a","name":"x"'); localStorage.setItem('medication-tracker.range', 'zz'); } catch (e) { /* */ } } });
    ok('corrupt saved data: starts fresh with no error', (await txt(p, '#r-big')) === 'No medicines yet' && !p.errors.length, p.errors);
    await p.ctx.close();
    p = await open(b, { width: 390, height: 860 }, { init: () => { Storage.prototype.setItem = () => { throw new Error('blocked'); }; Storage.prototype.getItem = () => { throw new Error('blocked'); }; } });
    await addMed(p, { name: 'Aspirin 75 mg', preset: 1 });
    ok('storage blocked: still works and says it is not saving', (await med(p, 'Aspirin').count()) === 1 && /not saving/.test(await txt(p, '#tools-msg')) && !p.errors.length, p.errors);
    await p.ctx.close();

    // ---- layout at every width, dark and light, filled and empty
    const W = [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920];
    for (const theme of ['dark', 'light']) {
        p = await open(b, { width: 390, height: 860 }, { theme, time: '2026-10-07T20:40' });
        await p.click('#demo');
        for (const w of W) {
            await p.setViewportSize({ width: w, height: 900 });
            const l = await layout(p); if (l.length) ok(theme + ' ' + w + 'px filled: layout', false, l);
            if (w >= 900) for (const pos of [0, .5, 1]) { await p.evaluate(x => scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * x), pos); const s = await siblings(p); if (s.length) ok(theme + ' ' + w + 'px blocks overlap at ' + pos, false, s); }
        }
        ok(theme + ': filled layout clean at 11 widths (no sideways scroll, nothing sticks out or overlaps, placeholders fit)', true);
        // every optional field and mode on narrow phones
        for (const w of [320, 360, 390]) {
            await p.setViewportSize({ width: w, height: 900 });
            await med(p, 'Metformin').locator('.m-edit').click();
            for (const id of ['#open-who', '#open-pills', '#open-end']) if (await p.isVisible(id)) await p.click(id);
            await p.check('input[name=every][value=some]'); await p.click('[data-preset="4"]');
            let l = await layout(p); ok(theme + ' ' + w + 'px: set times, 4 times, some days, all extras open: no overlap', !l.length, l);
            await p.check('input[name=kind][value=needed]'); await p.selectOption('#f-gap', 'custom'); await p.selectOption('#f-max', 'custom');
            l = await layout(p); ok(theme + ' ' + w + 'px: when needed with both "Other" boxes: no overlap', !l.length, l);
            await p.click('#cancel-edit');
            await slot(p, 'Metformin', '8:00 AM').locator('button', { hasText: 'Change' }).click();
            l = await layout(p); ok(theme + ' ' + w + 'px: change-time editor: no overlap', !l.length, l);
            await p.click('.edit-row button:has-text("Cancel")');
        }
        if (shots && theme === 'dark') {
            const dir = path.join(__dirname, 'screenshots');
            for (const [w, f] of [[1280, 'desktop.png'], [390, 'phone.png']]) {
                const s = await open(b, { width: w, height: w < 500 ? 844 : 900 }, { time: '2026-10-07T20:40' });
                await s.click('#demo'); await s.evaluate(() => { document.getElementById('today-msg').textContent = ''; });
                await s.screenshot({ path: path.join(dir, f), fullPage: w > 500, clip: w < 500 ? { x: 0, y: 0, width: 390, height: 1500 } : undefined });
                await s.ctx.close();
            }
            console.log('screenshots saved');
        }
        // light/dark switch
        await p.setViewportSize({ width: 1280, height: 900 });
        const before = await p.evaluate(() => getComputedStyle(document.body).color);
        await p.click('.theme-toggle');
        ok(theme + ': Light/Dark switch changes the look', before !== await p.evaluate(() => getComputedStyle(document.body).color));
        // cleared state
        await p.click('#wipe');
        for (const w of W) { await p.setViewportSize({ width: w, height: 900 }); const l = await layout(p); if (l.length) ok(theme + ' ' + w + 'px empty: layout', false, l); }
        ok(theme + ': empty layout clean at 11 widths', true);
        // help dialog
        for (const w of [320, 390, 820, 1280]) {
            await p.setViewportSize({ width: w, height: 800 }); await p.evaluate(() => scrollTo(0, 0));
            await p.click('.help-btn');
            const r = await p.locator('dialog.help').boundingBox();
            const okBox = r && r.x >= 0 && r.y >= 0 && r.x + r.width <= w && r.y + r.height <= 800 && /How to use Medication Tracker/.test(await txt(p, 'dialog.help h2'));
            await p.keyboard.press('Escape'); const esc = !(await p.locator('dialog.help').evaluate(d => d.open));
            await p.click('.help-btn'); await p.click('.help-close'); const got = !(await p.locator('dialog.help').evaluate(d => d.open));
            const bar = await p.evaluate(() => { const t = document.querySelector('.topbar'); return t ? t.getBoundingClientRect().height : 0; });
            ok(theme + ' ' + w + 'px: Help opens on screen, Escape and Got it close it, top bar on one line', okBox && esc && got && bar < 60, { okBox, esc, got, bar });
        }
        ok(theme + ': no console errors or failed requests', !p.errors.length && !p.bad.length, p.errors.concat(p.bad));
        await p.ctx.close();
    }
    await b.close(); if (srv) srv.close();
    console.log(fail ? fail + ' FAILED' : 'ALL UI CHECKS PASSED');
    process.exit(fail ? 1 : 0);
})();
