// Drives the real page in headless Chromium: node ui-test.js [--shots] [--base https://umar8092.github.io/apps]
// Without --base it serves this repo on localhost. With --base it tests the LIVE page. The clock is Sat 24 Oct 2026, 10:00.
const pw = (() => { for (const m of ['playwright', 'playwright-core']) { try { return require(m); } catch (e) { /* next */ } } throw new Error('playwright not found'); })();
const path = require('path'), fs = require('fs'), http = require('http'), os = require('os');
const bi = process.argv.indexOf('--base');
const shots = process.argv.includes('--shots');
let fail = 0, url;
const ok = (name, cond, extra) => { if (!cond) fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond || extra == null ? '' : '  -> ' + JSON.stringify(extra))); };
const NOW = new Date(2026, 9, 24, 10, 0).getTime();
const SLUG = 'symptom-and-pain-diary-for-doctor-visits';
const KEY = SLUG + '.state';

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

// Sara's migraine diary from the README (same episodes as tests.js)
const MIGRAINE = C => ({ id: 'm', name: 'Migraine', triggers: ['Short or poor sleep', 'Missed or late meal', 'Stress', 'Period', 'Weather change', 'Screens', 'Bright light or noise', 'Caffeine', 'Alcohol', 'Not enough water'],
    wheres: ['Left side of head', 'Right side of head', 'Both sides', 'Forehead', 'Behind the eyes', 'Back of head and neck'] });
function sara(extra) {
    const ep = (id, start, end, pain, triggers, meds, more) => Object.assign({ id, sid: 'm', start, end, pain, where: '', triggers: triggers || [], meds: meds || [], note: '' }, more || {});
    const med = (name, helped) => ({ name, helped: helped || '' });
    const eps = [
        ep('1', '2026-09-28T07:30', '2026-09-28T19:30', 7, ['Short or poor sleep', 'Stress'], [med('Sumatriptan 50 mg', 'yes')], { where: 'Right side of head' }),
        ep('2', '2026-10-03T22:00', '2026-10-04T06:00', 6, ['Short or poor sleep'], [med('Ibuprofen 400 mg', 'yes')], { where: 'Left side of head' }),
        ep('3', '2026-10-09T15:00', '2026-10-09T18:30', 4, ['Screens'], [med('Ibuprofen 400 mg', 'some')], { where: 'Behind the eyes' }),
        ep('4', '2026-10-15T09:00', '2026-10-16T11:00', 8, ['Period', 'Short or poor sleep'], [med('Ibuprofen 400 mg', 'no'), med('Sumatriptan 50 mg', 'yes')], { where: 'Left side of head', note: 'Sick twice, had to lie down in a dark room' }),
        ep('5', '2026-10-21T13:10', '2026-10-21T17:40', 5, ['Stress', 'Missed or late meal'], [med('Ibuprofen 400 mg', 'yes')], { where: 'Both sides' }),
        ep('6', '2026-10-24T08:15', null, 6, ['Short or poor sleep'], [med('Ibuprofen 400 mg')], { where: 'Left side of head' }),
        ep('p1', '2026-08-30T09:00', '2026-08-30T12:00', 4), ep('p2', '2026-09-01T08:00', '2026-09-01T20:00', 6),
        ep('p3', '2026-09-05T07:00', '2026-09-06T09:00', 7), ep('p4', '2026-09-08T10:00', '2026-09-08T15:00', 5),
        ep('p5', '2026-09-12T10:00', '2026-09-12T16:00', 5), ep('p6', '2026-09-18T21:00', '2026-09-19T08:00', 6),
        ep('p7', '2026-09-23T06:00', '2026-09-23T14:00', 7)
    ];
    return Object.assign({ v: 1, symptoms: [MIGRAINE(), { id: 'b', name: 'Back pain', triggers: ['Lifting', 'Long sitting'], wheres: ['Lower back'] }], episodes: eps, current: 'm', period: '30', name: 'Sara Khan' }, extra || {});
}

async function load(b, vp, opt = {}) {
    const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: vp.width < 500 ? 2 : 1, colorScheme: opt.theme || 'dark', locale: 'en-GB',
        permissions: ['clipboard-read', 'clipboard-write'], acceptDownloads: true, serviceWorkers: 'block' });
    await ctx.route(/goatcounter\.com|gc\.zgo\.at/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
    if (opt.state !== undefined) await ctx.addInitScript(([k, s]) => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem(k, s); } }, [KEY, typeof opt.state === 'string' ? opt.state : JSON.stringify(opt.state)]);
    if (opt.block) await ctx.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
    const p = await ctx.newPage();
    await p.clock.install({ time: opt.time || NOW });
    p.errors = []; p.on('console', m => m.type() === 'error' && p.errors.push(m.text())); p.on('pageerror', e => p.errors.push(String(e)));
    p.bad = []; p.on('response', r => { if (r.status() >= 400) p.bad.push(r.status() + ' ' + r.url()); });
    p.files = []; p.on('requestfinished', r => p.files.push(r.url()));
    await p.goto(url, { waitUntil: 'networkidle' });
    return p;
}
const txt = async (p, sel) => ((await p.textContent(sel)) || '').replace(/\s+/g, ' ').trim();
const vis = (p, sel) => p.isVisible(sel);
const saved = p => p.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
const chip = (p, group, text) => p.click(group + ' .chip >> text="' + text + '"');
async function noScroll(p) { return p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1); }
async function overlaps(p) {
    return p.evaluate(() => {
        const els = [...document.querySelectorAll('input, select, textarea, button, .chip, a.secondary')].filter(e => e.offsetParent && e.getBoundingClientRect().width > 0 && !e.closest('dialog'));
        const out = [];
        for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
            const a = els[i].getBoundingClientRect(), b = els[j].getBoundingClientRect();
            if (els[i].contains(els[j]) || els[j].contains(els[i])) continue;
            if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) out.push((els[i].id || els[i].textContent.trim().slice(0, 20)) + ' / ' + (els[j].id || els[j].textContent.trim().slice(0, 20)));
        }
        return out;
    });
}

(async () => {
    let srv;
    if (bi > 0) url = process.argv[bi + 1].replace(/\/$/, '') + '/' + SLUG + '/';
    else { srv = await serve(); url = 'http://localhost:' + srv.address().port + '/apps/' + SLUG + '/'; }
    console.log('Testing ' + url);
    const b = await pw.chromium.launch();

    // ---------- 1. first use: choose what to track, then log the migraine she has now
    let p = await load(b, { width: 390, height: 844 });
    ok('first use: setup shown', await vis(p, '#setup') && !(await vis(p, '#log')) && !(await vis(p, '#summary')));
    ok('first use: settings still there (restore a backup)', await vis(p, '#restore'));
    await p.click('#own-add');
    ok('own symptom: blank name refused', (await txt(p, '#own-err')).includes('Type a name'));
    await p.click('#presets button >> text="Migraine"');
    ok('Migraine chosen: tab and form', (await txt(p, '#syms')).includes('Migraine') && (await txt(p, '#log-h')) === 'Log migraine' && !(await vis(p, '#setup')));
    ok('presets give migraine triggers', (await p.$$('#trig-chips .chip')).length === 10);
    // nothing chosen: pain is required, start defaults to Now, still going
    await p.click('#save');
    ok('save with no pain: asks for pain', (await txt(p, '#pain-err')) === 'Choose how bad it was, from 0 to 10.' && (await saved(p)).episodes.length === 0);
    ok('start defaults to now', (await txt(p, '#start-text')) === 'today 10:00');
    // stopped with start now: hint, and a length would end in the future
    await chip(p, '#stop-seg', 'It has stopped');
    ok('stopped while start is now: hint', await vis(p, '#stop-hint'));
    await p.click('#pain .pn >> text="6"');
    await p.click('#save');
    ok('stopped but no length: asks for length', (await txt(p, '#end-err')).startsWith('Choose how long it lasted'));
    await chip(p, '#len-chips', '1 h');
    await p.click('#save');
    ok('ends in the future: refused', (await txt(p, '#end-err')).startsWith('That would end in the future'));
    await chip(p, '#stop-seg', 'Still going');
    await chip(p, '#trig-chips', 'Short or poor sleep');
    await p.click('#med-add');
    await p.fill('#med-name-0', '  Ibuprofen   400 mg ');
    await p.click('#save');
    let st = await saved(p);
    ok('still-going episode saved with trigger and medicine', st.episodes.length === 1 && st.episodes[0].end === null && st.episodes[0].pain === 6 && st.episodes[0].start === '2026-10-24T10:00'
        && st.episodes[0].triggers[0] === 'Short or poor sleep' && st.episodes[0].meds[0].name === 'Ibuprofen 400 mg', st.episodes[0]);
    ok('optional where and note were not forced', st.episodes[0].where === '' && st.episodes[0].note === '');
    ok('saved message', (await txt(p, '#log-msg')).startsWith('Saved: Migraine, today 10:00, still going, pain 6/10.'));
    ok('form reset after save', (await p.$$('#pain .pn[aria-pressed="true"]')).length === 0 && (await p.$$('#meds .med-row')).length === 0);
    ok('still going box', await vis(p, '#ongoing') && (await txt(p, '.og-h')) === 'Migraine: since today 10:00');
    // undo the save, then redo it
    await p.click('#log-msg .undo');
    ok('undo removes the new episode', (await saved(p)).episodes.length === 0 && !(await vis(p, '#ongoing')));
    // an episode from 3 days ago, typed with the date and time pickers
    await chip(p, '#start-chips', 'Earlier: choose');
    await p.fill('#start-pick', '2026-10-21T13:10');
    ok('start line follows the picker', (await txt(p, '#start-text')) === 'Wed 21 Oct 13:10');
    await chip(p, '#stop-seg', 'It has stopped');
    await chip(p, '#len-chips', '4 h');
    ok('end line shows the end and length', (await txt(p, '#end-text')) === 'Wed 21 Oct 17:10 (4 h)');
    await chip(p, '#len-chips', 'Choose the end time');
    await p.fill('#end-pick', '2026-10-21T12:00');
    await p.click('#pain .pn >> text="5"');
    await p.click('#save');
    ok('end before start refused', (await txt(p, '#end-err')).startsWith('It must stop after it started'));
    await p.fill('#end-pick', '2026-10-21T17:40');
    await chip(p, '#trig-chips', 'Stress'); await chip(p, '#trig-chips', 'Missed or late meal');
    await p.click('#med-add'); await p.fill('#med-name-0', 'Ibuprofen 400 mg'); await p.selectOption('#med-help-0', 'yes');
    await p.click('#more-open'); await p.click('#where-chips .chip >> text="Both sides"');
    await p.fill('#note', 'x'.repeat(600));
    await p.click('#save');
    st = await saved(p);
    ok('past episode saved', st.episodes.length === 1 && st.episodes[0].end === '2026-10-21T17:40' && st.episodes[0].where === 'Both sides' && st.episodes[0].note.length === 500 && st.episodes[0].meds[0].helped === 'yes', st.episodes[0]);
    ok('summary: 1 day, 4 h 30 min', (await txt(p, '#days-n')) === '1' && (await txt(p, '#t-len')) === '4 h 30 min');
    // add your own trigger
    await p.click('#trig-open'); await p.fill('#trig-name', 'Cheese'); await p.press('#trig-name', 'Enter');
    ok('own trigger added and ticked', (await p.getAttribute('#trig-chips .chip >> text="Cheese"', 'aria-pressed')) === 'true' && (await saved(p)).symptoms[0].triggers.includes('Cheese'));
    // now the one still going, then stop it
    await chip(p, '#start-chips', '1 h ago');
    await p.click('#pain .pn >> text="7"');
    await p.click('#med-add'); await p.fill('#med-name-0', 'Sumatriptan 50 mg');
    await p.click('#save');
    ok('still going since 09:00', (await txt(p, '.og-h')) === 'Migraine: since today 09:00' && (await txt(p, '.og-sub')).startsWith('1 h so far, pain 7/10'));
    await p.selectOption('.og-help select', 'yes');
    await p.click('.og-btns >> text="It stopped now"');
    st = await saved(p);
    const stopped = st.episodes.find(e => e.pain === 7);
    ok('It stopped now: end set and helped saved', stopped.end === '2026-10-24T10:00' && stopped.meds[0].helped === 'yes' && stopped.triggers.includes('Cheese'), stopped);
    ok('stop message with undo', (await txt(p, '#ongoing-msg')).startsWith('Migraine stopped: it lasted 1 h.') || !(await vis(p, '#ongoing')));
    ok('summary now 2 days, 2 episodes', (await txt(p, '#days-n')) === '2' && (await txt(p, '#t-n')) === '2');
    ok('medicine lines', (await txt(p, '#med-lines')).includes('Ibuprofen 400 mg: helped 1 of 1 time') && (await txt(p, '#med-lines')).includes('Sumatriptan 50 mg: helped 1 of 1 time'));
    // edit: change pain, then cancel another edit
    await p.click('.ep >> nth=0 >> text="Edit"');
    ok('edit fills the form', (await txt(p, '#log-h')) === 'Edit this migraine episode' && (await p.inputValue('#start-pick')) === '2026-10-24T09:00' && (await txt(p, '#save')) === 'Save changes');
    await p.click('#pain .pn >> text="9"');
    await p.click('#save');
    st = await saved(p);
    ok('edit saved in place', st.episodes.length === 2 && st.episodes.some(e => e.pain === 9 && e.start === '2026-10-24T09:00') && (await txt(p, '#log-h')) === 'Log migraine');
    await p.click('.ep >> nth=0 >> text="Edit"');
    await p.click('#pain .pn >> text="2"');
    await p.press('#start-pick', 'Escape');
    ok('Escape cancels editing, nothing changed', (await saved(p)).episodes.some(e => e.pain === 9) && (await txt(p, '#log-msg')).startsWith('Editing cancelled'));
    // delete with undo
    await p.click('.ep >> nth=0 >> text="Delete"');
    ok('delete', (await saved(p)).episodes.length === 1);
    await p.click('#list-msg .undo');
    ok('undo delete', (await saved(p)).episodes.length === 2);
    // second symptom, duplicates and renames
    await p.click('.add-sym');
    ok('add a symptom opens the chooser with Migraine marked', await vis(p, '#setup') && (await p.isDisabled('#presets button >> text="Migraine (added)"')));
    await p.fill('#own-name', 'migraine'); await p.click('#own-add');
    ok('same name opens the existing one', (await saved(p)).symptoms.length === 1 && (await txt(p, '#log-msg')).includes('already in your diary'));
    await p.click('.add-sym'); await p.click('#presets button >> text="Back pain"');
    st = await saved(p);
    ok('Back pain added with its own triggers, current', st.symptoms.length === 2 && st.symptoms[1].triggers[0] === 'Lifting' && st.current === st.symptoms[1].id && (await txt(p, '#log-h')) === 'Log back pain');
    ok('Back pain has its own empty summary', (await txt(p, '#sum-empty-h')) === 'No episodes yet');
    await p.fill('#sym-name-1', ''); await p.dispatchEvent('#sym-name-1', 'change');
    ok('rename to blank refused', (await p.inputValue('#sym-name-1')) === 'Back pain' && (await txt(p, '#sym-boxes')).includes('A name is needed'));
    await p.fill('#sym-name-1', 'MIGRAINE'); await p.dispatchEvent('#sym-name-1', 'change');
    ok('rename to an existing name refused', (await saved(p)).symptoms[1].name === 'Back pain');
    await p.fill('#sym-name-1', 'Lower back pain'); await p.dispatchEvent('#sym-name-1', 'change');
    ok('rename works', (await saved(p)).symptoms[1].name === 'Lower back pain' && (await txt(p, '#syms')).includes('Lower back pain'));
    await p.click('#sym-boxes .sym-box >> nth=1 >> text=/^Remove Lower back pain/');
    ok('remove symptom', (await saved(p)).symptoms.length === 1);
    await p.click('#set-msg .undo');
    ok('undo remove symptom', (await saved(p)).symptoms.length === 2);
    // remove a trigger from the list, past episodes keep it
    await p.click('#syms .sym >> text="Migraine"');
    await p.click('#sym-boxes .sym-box >> nth=0 >> .chip >> text=/^Cheese/');
    st = await saved(p);
    ok('trigger removed from list, episode keeps it', !st.symptoms[0].triggers.includes('Cheese') && st.episodes.some(e => e.triggers.includes('Cheese')));
    // reload keeps everything
    await p.reload({ waitUntil: 'networkidle' });
    ok('reload keeps the diary', (await saved(p)).episodes.length === 2 && (await txt(p, '#t-n')) === '2');
    // 31-day limit
    await chip(p, '#start-chips', 'Earlier: choose'); await p.fill('#start-pick', '2026-09-01T09:00');
    await p.click('#pain .pn >> text="3"'); await p.click('#save');
    ok('still going over 31 days refused', (await txt(p, '#end-err')).startsWith('Still going for more than 31 days'));
    await p.fill('#start-pick', '2026-10-25T09:00'); await p.click('#save');
    ok('start in the future refused', (await txt(p, '#start-err')).startsWith('The start time is in the future'));
    ok('flow: no console errors', p.errors.length === 0, p.errors);
    await p.context().close();

    // ---------- 2. Sara's month: the answer for the doctor
    p = await load(b, { width: 1280, height: 900 }, { state: sara() });
    ok('days with migraine', (await txt(p, '#days-n')) === '8' && (await txt(p, '#days-unit')) === 'of 30 days' && (await txt(p, '#days-text')) === 'with migraine in the last 30 days');
    ok('compared with before', (await txt(p, '#compare')) === 'In the 30 days before: 9 days, so 1 fewer now.');
    ok('tiles', [await txt(p, '#t-n'), await txt(p, '#t-pain'), await txt(p, '#t-len'), await txt(p, '#t-long')].join('|') === '6|6/10|10 h 48 min|1 day 2 h');
    ok('medicines', (await txt(p, '#med-lines')) === 'Ibuprofen 400 mg: helped 2 of 5 times (helped a bit 1, did not help 1, not noted 1)Sumatriptan 50 mg: helped 2 of 2 times');
    ok('medicine days', (await txt(p, '#med-days')) === 'Medicine taken on 6 days of 30.' && !(await vis(p, '#overuse')));
    ok('top trigger', (await txt(p, '#trig-counts li >> nth=0')) === 'Short or poor sleep4 of 6');
    ok('calendar: 5 weeks, 8 coloured days, 6 medicine dots', (await p.$$('#cal .cd')).length === 35 && (await p.$$('#cal .cd.mild, #cal .cd.moderate, #cal .cd.severe')).length === 8 && (await p.$$('#cal .dot')).length === 6);
    ok('episodes list grouped by month', (await txt(p, '#months')).startsWith('October 2026') && (await p.$$('.ep')).length === 6);
    ok('over-midnight episode shown with both days', (await txt(p, '#months')).includes('Sat 3 Oct, 22:00 to Sun 4 Oct 06:00'));
    const mail = await p.getAttribute('#email', 'href');
    ok('email link: subject and summary, no address', mail.startsWith('mailto:?subject=Migraine%20diary%3A%20Sara%20Khan&body=') && decodeURIComponent(mail).includes('Days with migraine: 8 of 30 (the 30 days before: 9)'));
    await p.click('#copy');
    const clip = await p.evaluate(() => navigator.clipboard.readText());
    ok('copy as text', clip.startsWith('Symptom diary: Migraine, Sara Khan\nPeriod: Fri 25 Sep to Sat 24 Oct 2026 (the last 30 days)') && (clip.match(/\n- /g) || []).length === 6);
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#csv')]);
    const csvText = fs.readFileSync(await dl.path(), 'utf8');
    ok('spreadsheet download', dl.suggestedFilename() === 'migraine-diary-2026-10-24.csv' && csvText.split('\r\n').length === 8);
    await p.emulateMedia({ media: 'print' }); await p.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
    ok('print report: summary and 6 rows', (await p.$$('#report tbody tr')).length === 6 && (await vis(p, '#report')) && (await txt(p, '#report h2')) === 'Migraine diary: Sara Khan');
    await p.emulateMedia({ media: 'screen' });
    await p.selectOption('#period', 'month');
    ok('this month', (await txt(p, '#days-n')) === '7' && (await txt(p, '#days-unit')) === 'of 24 days' && (await txt(p, '#days-text')) === 'with migraine in this month (October 2026)' && (await txt(p, '#compare')).includes('This month is not over yet.'));
    await p.selectOption('#period', 'last');
    ok('last month', (await txt(p, '#days-n')) === '9');
    await p.selectOption('#period', 'all');
    ok('all entries: no calendar, explains why', !(await vis(p, '#cal-wrap')) && (await vis(p, '#cal-none')) && (await txt(p, '#t-n')) === '13');
    await p.reload({ waitUntil: 'networkidle' });
    ok('period remembered', (await p.inputValue('#period')) === 'all');
    await p.selectOption('#period', '30');
    await p.click('#syms .sym >> text="Back pain"');
    ok('switching symptom: own empty summary, share disabled', (await txt(p, '#sum-empty-h')) === 'No episodes yet' && (await p.isDisabled('#print')) && (await p.getAttribute('#email', 'aria-disabled')) === 'true');
    await p.click('#syms .sym >> text="Migraine"');
    // backup, restore, delete all
    const [bk] = await Promise.all([p.waitForEvent('download'), p.click('#backup')]);
    const bkPath = await bk.path();
    ok('backup file', bk.suggestedFilename() === 'symptom-diary-backup-2026-10-24.json' && JSON.parse(fs.readFileSync(bkPath, 'utf8')).episodes.length === 13);
    await p.click('#wipe');
    ok('delete whole diary goes back to first use', (await vis(p, '#setup')) && (await saved(p)).episodes.length === 0);
    await p.click('#set-msg .undo');
    ok('undo delete whole diary', (await saved(p)).episodes.length === 13);
    const junk = path.join(os.tmpdir(), 'spd-junk.json'); fs.writeFileSync(junk, '{"hello":1}');
    await p.setInputFiles('#restore-file', junk);
    await p.waitForTimeout(200);
    ok('restore junk refused', (await txt(p, '#set-msg')).startsWith('That file is not a backup') && (await saved(p)).episodes.length === 13);
    await p.click('#wipe');
    await p.setInputFiles('#restore-file', bkPath); await p.waitForTimeout(200);
    ok('restore backup', (await saved(p)).episodes.length === 13 && (await txt(p, '#set-msg')).startsWith('Backup restored: 2 symptoms, 13 episodes.'));
    ok('Sara: no console errors or failed requests', p.errors.length === 0 && p.bad.length === 0, p.errors.concat(p.bad));
    await p.context().close();

    // ---------- 3. medication overuse note
    const many = sara(); many.episodes = Array.from({ length: 10 }, (_, i) => ({ id: 'o' + i, sid: 'm', start: '2026-10-' + String(i + 10) + 'T09:00', end: '2026-10-' + String(i + 10) + 'T12:00', pain: 5, where: '', triggers: [], meds: [{ name: 'Paracetamol', helped: 'some' }], note: '' }));
    p = await load(b, { width: 390, height: 844 }, { state: many });
    ok('10 medicine days: overuse note', (await vis(p, '#overuse')) && (await txt(p, '#overuse')).startsWith('You took medicine on 10 days in the last 30 days.'));
    await p.context().close();

    // ---------- 4. corrupt and blocked storage
    p = await load(b, { width: 390, height: 844 }, { state: '{not json' });
    ok('corrupt saved state: starts fresh', (await vis(p, '#setup')) && p.errors.length === 0);
    await p.context().close();
    p = await load(b, { width: 390, height: 844 }, { state: JSON.stringify({ symptoms: [{ id: 'q', name: 'Dizzy' }], episodes: [{ id: 1, sid: 'q', start: 'x' }, { id: 'ok', sid: 'q', start: '2026-10-20T10:00', end: '2026-10-20T09:00', pain: 3 }], current: 'q' }) });
    ok('bad entries left out, good symptom kept', (await txt(p, '#syms')).includes('Dizzy') && (await txt(p, '#sum-empty-h')) === 'No episodes yet' && p.errors.length === 0);
    await p.context().close();
    p = await load(b, { width: 390, height: 844 }, { block: true });
    ok('storage blocked: warning and the app still works', await vis(p, '#store-warn'));
    await p.click('#presets button >> text="Headache"'); await p.click('#pain .pn >> text="3"'); await p.click('#save');
    ok('storage blocked: episode still counted', (await txt(p, '#t-n')) === '1' && p.errors.length === 0, p.errors);
    await p.context().close();

    // ---------- 5. widths, long text, every optional field open
    const long = sara(); long.symptoms[0].name = 'Very long symptom name that goes on and on x'.slice(0, 40); long.name = 'W'.repeat(40);
    long.episodes[0].note = 'Longwordwithoutanyspaces'.repeat(20); long.episodes[0].where = 'Z'.repeat(60);
    for (const w of [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920]) for (const theme of ['dark', 'light']) {
        p = await load(b, { width: w, height: 900 }, { state: long, theme });
        if (w <= 390) {
            await chip(p, '#start-chips', 'Earlier: choose'); await chip(p, '#stop-seg', 'It has stopped'); await chip(p, '#len-chips', 'Choose the end time');
            await p.click('#trig-open'); await p.click('#med-add'); await p.click('#med-add'); await p.click('#more-open');
            const o = await overlaps(p);
            ok(w + ' ' + theme + ': no controls overlap with all fields open', o.length === 0, o.slice(0, 4));
            const clipped = await p.evaluate(() => [...document.querySelectorAll('input[placeholder]')].filter(i => i.offsetParent).filter(i => { const c = document.createElement('canvas').getContext('2d'); const cs = getComputedStyle(i); c.font = cs.fontSize + ' ' + cs.fontFamily; return c.measureText(i.placeholder).width > i.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) + 1; }).map(i => i.id || i.placeholder));
            ok(w + ' ' + theme + ': every placeholder fits', clipped.length === 0, clipped);
        }
        ok(w + ' ' + theme + ': no horizontal scroll', await noScroll(p));
        if (w >= 900) {
            const bad = [];
            for (const pos of [0, .5, 1]) {
                await p.evaluate(f => window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * f), pos);
                bad.push(...await p.evaluate(() => {
                    const kids = [...document.querySelectorAll('.app > *, .col-main > *, .col-side > *')].filter(e => e.offsetParent && e.getBoundingClientRect().height > 0);
                    const out = [];
                    for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
                        if (kids[i].contains(kids[j]) || kids[j].contains(kids[i])) continue;
                        const a = kids[i].getBoundingClientRect(), c = kids[j].getBoundingClientRect();
                        if (Math.min(a.right, c.right) - Math.max(a.left, c.left) > 1 && Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top) > 1) out.push((kids[i].id || kids[i].className) + '/' + (kids[j].id || kids[j].className));
                    }
                    return out;
                }));
            }
            ok(w + ' ' + theme + ': no blocks overlap when scrolled', bad.length === 0, bad.slice(0, 3));
        }
        if (w === 1280 && theme === 'dark') {
            const side = await p.evaluate(() => { const a = document.getElementById('log').getBoundingClientRect(), s = document.getElementById('summary').getBoundingClientRect(), m = document.getElementById('col-main').getBoundingClientRect(), c = document.getElementById('col-side').getBoundingClientRect(); return s.left > a.right && Math.abs(m.top - c.top) < 2; });
            ok('1280: form and summary side by side', side);
        }
        if ([320, 390, 820, 1280].includes(w) && theme === 'dark') {
            await p.evaluate(() => window.scrollTo(0, 0));
            await p.click('.help-btn');
            const box = await p.locator('dialog.help').boundingBox();
            ok(w + ': help dialog on screen with title', box && box.x >= 0 && box.x + box.width <= w + 1 && (await txt(p, 'dialog.help h2')) === 'How to use Symptom and Pain Diary');
            await p.keyboard.press('Escape');
            ok(w + ': Escape closes help', !(await p.evaluate(() => document.querySelector('dialog.help').open)));
            await p.click('.help-btn'); await p.click('.help-close');
            ok(w + ': Got it closes help', !(await p.evaluate(() => document.querySelector('dialog.help').open)));
            const bar = await p.evaluate(() => { const r = [...document.querySelectorAll('.topbar > *')].map(e => e.getBoundingClientRect()); return r.every(x => Math.abs(x.top - r[0].top) < 4); });
            ok(w + ': top bar on one line', bar);
        }
        if (w === 390 && theme === 'dark') {
            await p.click('.theme-toggle');
            ok('light/dark switch', (await p.evaluate(() => document.documentElement.dataset.theme)) === 'light');
        }
        ok(w + ' ' + theme + ': no console errors', p.errors.length === 0, p.errors);
        await p.context().close();
    }

    // ---------- 6. files and screenshots
    p = await load(b, { width: 390, height: 844 }, { state: sara() });
    const need = ['favicon.svg', 'manifest.webmanifest', 'style.css', 'core.js', 'script.js', '../help.js', '../theme.js'];
    for (const f of need.concat(['sw.js', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'])) {
        const r = await p.request.get(new URL(f, url).href);
        ok('file ' + f + ' returns 200', r.status() === 200);
    }
    if (shots) {
        await p.evaluate(() => document.getElementById('summary').scrollIntoView());
        await p.evaluate(() => window.scrollBy(0, -12));
        await p.screenshot({ path: path.join(__dirname, 'screenshots', 'phone.png') });
        await p.context().close();
        p = await load(b, { width: 1280, height: 1000 }, { state: sara() });
        await p.screenshot({ path: path.join(__dirname, 'screenshots', 'desktop.png') });
    }
    await p.context().close();

    await b.close(); if (srv) srv.close();
    console.log(fail ? fail + ' FAILED' : 'ALL UI TESTS PASSED');
    process.exitCode = fail ? 1 : 0;
})();
