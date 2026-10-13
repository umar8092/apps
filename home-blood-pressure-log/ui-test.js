// Drives the real page in headless Chromium: node ui-test.js [--shots] [--base https://umar8092.github.io/apps]
// Without --base it serves this repo on localhost. With --base it tests the LIVE page. The clock is Tue 13 Oct 2026, 9:30 p.m.
const pw = (() => { for (const m of ['playwright', 'playwright-core']) { try { return require(m); } catch (e) { /* next */ } } throw new Error('playwright not found'); })();
const path = require('path'), fs = require('fs'), http = require('http');
const bi = process.argv.indexOf('--base');
const shots = process.argv.includes('--shots');
let fail = 0, url;
const ok = (name, cond, extra) => { if (!cond) fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond || extra == null ? '' : '  -> ' + JSON.stringify(extra))); };
const NOW = new Date(2026, 9, 13, 21, 30).getTime();
const KEY = 'home-blood-pressure-log.state';

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

// the doctor's 7-day check from the README: Wed 7 Oct is day 1, then 6 days of 2 morning and 2 evening readings
function week(extra) {
    const W = [['2026-10-07', [148, 95], [146, 93], [142, 90], [140, 88]], ['2026-10-08', [142, 90], [140, 88], [136, 86], [134, 84]], ['2026-10-09', [144, 91], [141, 89], [135, 85], [133, 84]],
        ['2026-10-10', [139, 88], [137, 87], [132, 83], [130, 82]], ['2026-10-11', [141, 89], [139, 88], [134, 85], [132, 83]], ['2026-10-12', [143, 90], [140, 88], [136, 86], [133, 84]],
        ['2026-10-13', [140, 89], [138, 87], [133, 84], [131, 83]]];
    const PULSE = [72, 70, 68, 69, 74, 71, 70, 68, 73, 70, 69, 71, 75, 72, 70, 69, 71, 70, 68, 70, 72, 71, 69, 68, 70, 72, 71, 69];
    const rs = []; let k = 0;
    W.forEach(([d, ...v]) => ['07:10', '07:12', '21:00', '21:02'].forEach((t, i) => { rs.push({ id: 'r' + k, t: d + 'T' + t, sys: v[i][0], dia: v[i][1], pulse: PULSE[k], arm: 'L', note: k === 13 ? 'after coffee' : '' }); k++; }));
    return Object.assign({ people: [{ id: 'p1', name: 'Sara Khan', guide: 'nice', target: { sys: 140, dia: 90 }, readings: rs }], current: 'p1', period: '7', skipFirst: true, pulseOpen: true, arm: 'L' }, extra || {});
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
async function add(p, sys, dia, pulse) {
    await p.fill('#sys', String(sys)); await p.fill('#dia', String(dia));
    if (pulse != null) { if (!await vis(p, '#pulse')) await p.click('#pulse-open'); await p.fill('#pulse', String(pulse)); }
    await p.click('#save');
}

(async () => {
    let srv;
    if (bi >= 0) url = process.argv[bi + 1].replace(/\/$/, '') + '/home-blood-pressure-log/';
    else { srv = await serve(); url = 'http://localhost:' + srv.address().port + '/apps/home-blood-pressure-log/'; }
    const b = await pw.chromium.launch();

    // ---- first use: empty state, optional fields not forced
    let p = await load(b, { width: 390, height: 844 });
    ok('empty: no readings yet', (await txt(p, '#sum-empty')).includes('No readings yet'));
    ok('empty: share buttons off', await p.isDisabled('#print') && await p.isDisabled('#copy') && await p.isDisabled('#csv') && (await p.getAttribute('#email', 'aria-disabled')) === 'true');
    ok('empty: pulse, time and note are hidden (optional)', !await vis(p, '#pulse') && !await vis(p, '#when') && !await vis(p, '#note'));
    ok('empty: only one person, no switcher', !await vis(p, '#people'));
    ok('empty: guide defaults to UK for en-GB', (await p.inputValue('#guide')) === 'nice');
    // blank, typos, decimals, swapped
    await p.click('#save');
    ok('blank: both errors', (await txt(p, '#sys-err')).startsWith('Type the top number') && (await txt(p, '#dia-err')).startsWith('Type the bottom number'));
    ok('blank: nothing saved', (await p.evaluate(k => localStorage.getItem(k), KEY)) === null);
    await add(p, 1200, 80);
    ok('typo 1200: did you mean 120', (await txt(p, '#sys-err')) === '1200 is too high for the top number. Did you mean 120?');
    await add(p, '120.5', 80);
    ok('decimal refused', /whole number/.test(await txt(p, '#sys-err')));
    await add(p, -120, 80);
    ok('negative refused', !!(await txt(p, '#sys-err')));
    await add(p, 0, 0);
    ok('zero refused', !!(await txt(p, '#sys-err')) && !!(await txt(p, '#dia-err')));
    await add(p, 80, 128);
    ok('swapped: message', (await txt(p, '#dia-err')).includes('Did you swap them?'));
    ok('swapped: swap button shows', await vis(p, '#swap'));
    await p.click('#swap');
    ok('swap: numbers swapped', (await p.inputValue('#sys')) === '128' && (await p.inputValue('#dia')) === '80');
    await add(p, 100, 100);
    ok('same numbers refused', /cannot be the same/.test(await txt(p, '#dia-err')) && !await vis(p, '#swap'));
    // first good reading, no pulse needed
    await add(p, 128, 82);
    ok('save: message with range', (await txt(p, '#add-msg')).startsWith('Saved 128/82 at 21:30: Normal (under 135/85).'), await txt(p, '#add-msg'));
    ok('save: boxes cleared and focus back on top number', (await p.inputValue('#sys')) === '' && await p.evaluate(() => document.activeElement.id) === 'sys');
    ok('save: average shows', (await txt(p, '#avg')) === '128/82' && (await txt(p, '#avg-meta')).startsWith('Average of 1 reading over 1 day, Tue, 13 Oct 2026.'));
    ok('save: list shows it', (await txt(p, '#days')).includes('128/82'));
    ok('save: share on', !await p.isDisabled('#copy') && (await p.getAttribute('#email', 'href')).startsWith('mailto:?subject='));
    ok('save: saved with no pulse', (await saved(p)).people[0].readings[0].pulse === null);
    // undo
    await p.click('#add-msg .undo');
    ok('undo: reading removed', (await saved(p)).people[0].readings.length === 0 && (await txt(p, '#sum-empty')).includes('No readings yet'));
    // pasted "135/88/72" into the top box
    await p.fill('#sys', '135/88/72');
    ok('paste: split into three boxes', (await p.inputValue('#sys')) === '135' && (await p.inputValue('#dia')) === '88' && (await p.inputValue('#pulse')) === '72' && await vis(p, '#pulse'));
    await p.keyboard.press('Enter');
    ok('Enter saves; pulse shown', (await txt(p, '#add-msg')).startsWith('Saved 135/88, pulse 72 at 21:30: Raised: stage 1 range (135/85 or higher).'), await txt(p, '#add-msg'));
    // typed "120/80" then carrying on with "/70" in the bottom box
    await p.fill('#pulse', '');
    await p.click('#sys'); await p.keyboard.type('120/80');
    ok('typing 120/80 moves to bottom box', (await p.inputValue('#sys')) === '120' && (await p.inputValue('#dia')) === '80' && await p.evaluate(() => document.activeElement.id) === 'dia');
    await p.keyboard.type('/70');
    ok('carrying on /70 fills the pulse', (await p.inputValue('#dia')) === '80' && (await p.inputValue('#pulse')) === '70');
    await p.fill('#pulse', '400'); await p.click('#save');
    ok('pulse too high refused', /too high for the pulse/.test(await txt(p, '#pulse-err')));
    await p.fill('#pulse', ''); await p.click('#save');
    ok('pulse left empty is fine', (await txt(p, '#add-msg')).startsWith('Saved 120/80 at'));
    // duplicate tap
    await add(p, 120, 80);
    ok('double tap: warned', (await txt(p, '#add-msg')).includes('same reading at this time'));
    await p.click('#add-msg .undo');
    // very high and low readings
    await add(p, 185, 122);
    ok('very high: emergency advice', (await p.getAttribute('#add-msg', 'class')).includes('bad') && (await txt(p, '#add-msg')).includes('call emergency services'));
    ok('very high: warning in the average', await vis(p, '#sum-warn') && (await txt(p, '#sum-warn')).startsWith('1 reading was very high (185/122'));
    await p.click('#add-msg .undo');
    ok('very high undone: warning gone', !await vis(p, '#sum-warn'));
    await add(p, 88, 58);
    ok('low: advice', (await txt(p, '#add-msg')).includes('Low (under 90/60)') && (await txt(p, '#add-msg')).includes('dizzy'));
    await p.click('#add-msg .undo');
    // earlier time, future time, note shown as text
    await p.click('#when-open');
    ok('change time: box opens with now', (await p.inputValue('#when')) === '2026-10-13T21:30' && (await txt(p, '#when-text')) === 'the time below');
    await p.fill('#when', '2026-10-14T07:00'); await add(p, 130, 80);
    ok('future time refused', /in the future/.test(await txt(p, '#when-err')));
    await p.fill('#when', '2026-10-13T07:05');
    await p.click('#more-open'); await p.selectOption('#arm', 'R'); await p.fill('#note', '<b>missed tablet</b>');
    await p.click('#save');
    ok('earlier time saved', (await saved(p)).people[0].readings.some(r => r.t === '2026-10-13T07:05' && r.arm === 'R' && r.note === '<b>missed tablet</b>'));
    ok('time box closes after save, back to now', !await vis(p, '#when-box') && (await txt(p, '#when-text')) === 'now');
    ok('note shown as plain text', (await txt(p, '#days')).includes('<b>missed tablet</b>') && !(await p.$('#days b')));
    ok('arm remembered', (await p.inputValue('#arm')) === 'R');
    await p.click('#when-open'); await p.fill('#when', '2026-09-01T08:00'); await add(p, 126, 79);
    ok('old date: says outside the chosen days', (await txt(p, '#add-msg')).includes('outside the days chosen'));
    await p.click('#add-msg .undo');
    // morning and evening split, session average
    ok('list: morning and evening', /Morning/.test(await txt(p, '#days')) && /Evening average 1/.test(await txt(p, '#days')));
    // edit: Escape cancels, invalid shows error, save works
    await p.click('.rd >> nth=0 >> text=Edit');
    ok('edit opens', await vis(p, '.rd-edit'));
    await p.keyboard.press('Escape');
    ok('Escape cancels edit', !await vis(p, '.rd-edit'));
    await p.click('.rd >> nth=0 >> text=Edit');
    const ins = p.locator('.rd-edit input');
    await ins.nth(0).fill('80'); await ins.nth(1).fill('120'); await p.click('.rd-edit >> text=Save');
    ok('edit: swapped refused', (await txt(p, '.rd-edit')).includes('Did you swap them?'));
    await ins.nth(0).fill('124'); await ins.nth(1).fill('78'); await p.click('.rd-edit >> text=Save');
    ok('edit: saved', (await txt(p, '#list-msg')).startsWith('Saved the change: 124/78') && (await txt(p, '#days')).includes('124/78'));
    await p.click('#list-msg .undo');
    ok('edit: undo', !(await txt(p, '#days')).includes('124/78'));
    // delete with undo
    const before = (await saved(p)).people[0].readings.length;
    await p.click('.rd >> nth=0 >> text=Delete');
    ok('delete', (await saved(p)).people[0].readings.length === before - 1 && (await txt(p, '#list-msg')).startsWith('Deleted'));
    await p.click('#list-msg .undo');
    ok('delete: undo', (await saved(p)).people[0].readings.length === before);
    // reload keeps everything
    await p.reload({ waitUntil: 'networkidle' });
    ok('reload keeps readings and opened pulse box', (await saved(p)).people[0].readings.length === before && await vis(p, '#pulse'));
    ok('no console errors (first use)', !p.errors.length, p.errors);
    await p.context().close();

    // ---- the doctor's 7-day check
    p = await load(b, { width: 1280, height: 900 }, { state: week() });
    ok('week: average 137/86', (await txt(p, '#avg')) === '137/86');
    ok('week: range in words', (await txt(p, '#avg-lvl')) === 'Raised: stage 1 range (135/85 or higher)');
    ok('week: readings, days and dates', (await txt(p, '#avg-meta')) === 'Average of 24 readings over 6 days, Thu, 8 Oct to Tue, 13 Oct 2026. Average pulse 71.', await txt(p, '#avg-meta'));
    ok('week: first day left out', (await txt(p, '#skip-note')) === 'Left out the first day, Wed, 7 Oct (4 readings).');
    ok('week: target met', (await txt(p, '#target-line')) === 'Under your doctor\'s target of 140/90.');
    ok('week: morning and evening', (await txt(p, '#t-am')) === '140/89' && (await txt(p, '#t-pm')) === '133/84' && (await txt(p, '#t-am-n')) === '12 readings');
    ok('week: highest and lowest', (await txt(p, '#t-hi')) === '144/91' && (await txt(p, '#t-hi-when')) === 'Fri, 9 Oct, 07:10' && (await txt(p, '#t-lo')) === '130/82');
    ok('week: counts', (await txt(p, '#counts')) === 'Raised: stage 1 range (135/85 or higher)16Normal (under 135/85)8', await txt(p, '#counts'));
    ok('week: chart drawn', (await p.$$('#chart circle')).length === 48 && (await txt(p, '#line-label')) === 'Your target 140/90');
    ok('week: list marks day 1', (await txt(p, '#days')).includes('left out of the average'));
    if (shots) await p.screenshot({ path: path.join(__dirname, 'screenshots/desktop.png') });
    await p.uncheck('#skip');
    ok('week with day 1: 138/87', (await txt(p, '#avg')) === '138/87' && !await vis(p, '#skip-note'));
    await p.check('#skip');
    // guides and target
    await p.selectOption('#guide', 'aha');
    ok('US guide words', (await txt(p, '#avg-lvl')) === 'High: stage 1 (130 to 139 or 80 to 89)');
    await p.selectOption('#guide', 'nice');
    await p.fill('#t-sys', '135');
    ok('target 135/90 not met', (await txt(p, '#target-line')) === 'Not under your doctor\'s target of 135/90: the top number is at or above it.');
    await p.fill('#t-dia', '');
    ok('target half typed: message', /Type both numbers/.test(await txt(p, '#t-err')));
    await p.fill('#t-dia', '150');
    ok('target top below bottom refused', /top bigger/.test(await txt(p, '#t-err')));
    await p.click('#target-remove');
    ok('target removed', !await vis(p, '#target-line') && (await saved(p)).people[0].target === null && (await txt(p, '#line-label')) === 'Raised from 135/85');
    // periods
    await p.selectOption('#period', 'all');
    ok('all readings', (await txt(p, '#avg-meta')).startsWith('Average of 24 readings over 6 days'));
    await p.selectOption('#period', 'dates');
    ok('choose dates: last 7 days filled in', (await p.inputValue('#from')) === '2026-10-07' && (await p.inputValue('#to')) === '2026-10-13');
    await p.fill('#from', '2026-10-12');
    ok('dates 12-13: 2 days, first left out', (await txt(p, '#avg-meta')).startsWith('Average of 4 readings over 1 day'));
    await p.fill('#to', '2026-10-10');
    ok('dates the wrong way round are swapped', (await p.inputValue('#from')) === '2026-10-10' && (await p.inputValue('#to')) === '2026-10-12' && /swapped/.test(await txt(p, '#dates-err')));
    await p.fill('#to', '2026-11-05'); await p.fill('#from', '2026-11-01');
    ok('dates with no readings', (await txt(p, '#sum-empty-text')).startsWith('No readings in these days'), [await txt(p, '#sum-empty-text'), await p.inputValue('#from'), await p.inputValue('#to')]);
    await p.selectOption('#period', '7');
    // copy and email
    await p.click('#copy');
    const clip = await p.evaluate(() => navigator.clipboard.readText());
    ok('copy: summary text', clip.startsWith('Blood pressure readings: Sara Khan\nThu, 8 Oct to Tue, 13 Oct 2026 (first day, Wed, 7 Oct, left out)\nAverage: 137/86 mmHg from 24 readings over 6 days\nRange: Raised: stage 1 range (135/85 or higher), UK and Europe guide'), clip.slice(0, 300));
    ok('copy: readings listed with notes', clip.includes('Readings:\nTue, 13 Oct 2026\n  07:10  140/89  pulse 70  left arm') && clip.includes('(after coffee)'), clip.slice(400, 700));
    const mail = await p.getAttribute('#email', 'href');
    ok('email works with no address', mail.startsWith('mailto:?subject=Blood%20pressure%20readings%3A%20Sara%20Khan&body=') && decodeURIComponent(mail).includes('Average: 137/86'));
    ok('email length kept short', mail.length < 2100);
    // spreadsheet
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#csv')]);
    const csv = fs.readFileSync(await dl.path(), 'utf8');
    ok('csv: name and rows', dl.suggestedFilename() === 'blood-pressure-sara-khan-2026-10-07-to-2026-10-13.csv' && csv.split('\r\n').length === 30 && csv.includes('2026-10-09,07:10,144,91,73,Left,Morning,Raised: stage 1 range,'));
    // print report
    await p.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
    ok('print report: table of 28 readings', (await p.$$('#report tbody tr')).length === 28 && (await txt(p, '#report h2')) === 'Blood pressure readings: Sara Khan');
    await p.emulateMedia({ media: 'print' });
    ok('print shows only the report', await vis(p, '#report') && !await vis(p, '#add'));
    await p.emulateMedia({ media: 'screen' });
    // backup
    const [bk] = await Promise.all([p.waitForEvent('download'), p.click('#backup')]);
    const backupPath = await bk.path();
    ok('backup file', bk.suggestedFilename() === 'blood-pressure-backup-2026-10-13.json' && JSON.parse(fs.readFileSync(backupPath, 'utf8')).people[0].readings.length === 28);
    // second person
    await p.click('#person-add');
    ok('second person added and chosen', await vis(p, '#people') && (await txt(p, '#sum-empty')).includes('No readings yet'));
    await p.fill('#name', 'Ahmed');
    await add(p, 150, 95);
    ok('second person: own reading and average', (await txt(p, '#avg')) === '150/95' && (await txt(p, '#avg-lvl')) === 'High: stage 2 range (150/95 or higher)');
    ok('people chips', (await txt(p, '#people')) === 'Sara KhanAhmed');
    await p.click('#people >> text=Sara Khan');
    ok('switch back: Sara untouched', (await txt(p, '#avg')) === '137/86');
    await p.click('#people >> text=Ahmed');
    ok('remove button names the person', (await txt(p, '#person-remove')) === 'Remove Ahmed' && (await txt(p, '#wipe')) === "Delete all of Ahmed's readings");
    await p.click('#person-remove');
    ok('person removed', !await vis(p, '#people') && (await txt(p, '#avg')) === '137/86');
    await p.click('#set-msg .undo');
    ok('person removal undone', await vis(p, '#people') && (await saved(p)).people.length === 2);
    // delete everything for one person with undo
    await p.click('#people >> text=Sara Khan');
    await p.click('#wipe');
    ok('wipe', (await saved(p)).people[0].readings.length === 0 && (await txt(p, '#set-msg')).startsWith('Deleted 28 readings.'));
    await p.click('#set-msg .undo');
    ok('wipe undone', (await saved(p)).people[0].readings.length === 28);
    // restore: bad file refused, good file restored with undo
    const badFile = path.join(require('os').tmpdir(), 'bp-bad.json'); fs.writeFileSync(badFile, '{"hello":1}');
    await p.setInputFiles('#restore-file', badFile);
    await p.waitForFunction(() => document.getElementById('set-msg').textContent.includes('not a backup'));
    ok('restore: wrong file refused', (await saved(p)).people.length === 2);
    await p.setInputFiles('#restore-file', backupPath);
    await p.waitForFunction(() => document.getElementById('set-msg').textContent.includes('Backup restored'));
    ok('restore: backup loaded', (await saved(p)).people.length === 1 && (await txt(p, '#set-msg')).startsWith('Backup restored: 1 person, 28 readings.'));
    await p.click('#set-msg .undo');
    ok('restore: undo', (await saved(p)).people.length === 2);
    ok('no console errors (week)', !p.errors.length, p.errors);
    await p.context().close();

    // ---- after midnight counts with the evening before; midnight moves the 7 days on
    p = await load(b, { width: 390, height: 844 }, { state: week({ skipFirst: false }), time: new Date(2026, 9, 14, 0, 30).getTime() });
    await add(p, 132, 84);
    ok('00:30 reading saved with its date', (await txt(p, '#add-msg')).startsWith('Saved 132/84 at Wed, 14 Oct, 00:30'), await txt(p, '#add-msg'));
    ok('00:30 reading listed in the evening of Tue 13 Oct', await p.evaluate(() => { const d = document.querySelector('#days .day'); return d.querySelector('.day-h').textContent.startsWith('Tue, 13 Oct') || d.querySelector('.day-h').textContent.startsWith('Tue 13 Oct'); }));
    ok('00:30 counts in the last 7 days (8 to 14 Oct)', (await txt(p, '#avg-meta')).startsWith('Average of 25 readings over 6 days, Thu, 8 Oct to Tue, 13 Oct 2026'), await txt(p, '#avg-meta'));
    await p.clock.fastForward(24 * 3600e3);
    await p.waitForTimeout(100);
    ok('next day: 7 days move on (9 to 15 Oct)', (await txt(p, '#avg-meta')).startsWith('Average of 21 readings over 5 days, Fri, 9 Oct to Tue, 13 Oct 2026'), await txt(p, '#avg-meta'));
    await p.context().close();

    // ---- corrupt and blocked storage
    p = await load(b, { width: 390, height: 844 }, { state: '{bad json' });
    ok('corrupt saved data: starts fresh', (await txt(p, '#sum-empty')).includes('No readings yet') && !p.errors.length, p.errors);
    await add(p, 125, 80);
    ok('corrupt: can save again', (await saved(p)).people[0].readings.length === 1);
    await p.context().close();
    p = await load(b, { width: 390, height: 844 }, { state: JSON.stringify({ people: [{ name: 'X', readings: [{ t: 'nope', sys: 'a' }, { t: '2026-10-13T07:00', sys: 300, dia: 400 }, { t: '2026-10-13T07:00', sys: 131, dia: 81 }] }], period: 'zzz' }) });
    ok('bad values dropped, good kept', (await txt(p, '#avg')) === '131/81' && (await p.inputValue('#period')) === '7');
    await p.context().close();
    p = await load(b, { width: 390, height: 844 }, { block: true });
    ok('blocked storage: notice', (await txt(p, '#add-msg')).includes('not letting the app save'));
    await add(p, 125, 80);
    ok('blocked storage: still works for now', (await txt(p, '#avg')) === '125/80' && (await txt(p, '#add-msg')).includes('lost when the page is closed'));
    ok('blocked storage: no errors', !p.errors.length, p.errors);
    await p.context().close();

    // ---- huge log stays quick; very long name and note wrap
    const big = week(); big.people[0].name = 'A very long name that goes on and on'; big.period = 'all';
    for (let i = 0; i < 1500; i++) { const d = new Date(2022, 0, 1 + Math.floor(i / 2)); big.people[0].readings.push({ id: 'h' + i, t: d.toISOString().slice(0, 10) + (i % 2 ? 'T20:00' : 'T08:00'), sys: 120 + (i % 30), dia: 75 + (i % 15), pulse: null, arm: '', note: i === 3 ? 'x'.repeat(200) : '' }); }
    p = await load(b, { width: 320, height: 700 }, { state: big });
    ok('1528 readings: average shown', (await txt(p, '#avg-meta')).startsWith('Average of 1526 readings over 756 days, Sun, 2 Jan 2022 to Tue, 13 Oct 2026.'), await txt(p, '#avg-meta'));
    ok('320px: no sideways scroll with long text', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await p.context().close();

    // ---- screen sizes and themes with a filled-in log and with an empty one, scroll overlap, narrow-phone layout
    for (const theme of ['dark', 'light']) for (const st of [week(), null]) for (const w of [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920]) {
        p = await load(b, { width: w, height: 800 }, st ? { state: st, theme } : { theme });
        const tag = theme + ' ' + w + (st ? ' filled' : ' empty');
        if (w <= 390) { await p.click('#more-open'); if (await vis(p, '#when-open')) await p.click('#when-open'); await p.click('.rd >> nth=0 >> text=Edit').catch(() => {}); }
        const hs = await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
        if (!hs) ok(tag + ': no sideways scroll', false);
        if (w <= 390) {
            const o = await p.evaluate(() => { const k = [...document.querySelectorAll('input:not([type=checkbox]):not([type=file]), select, button, a.secondary')].filter(e => e.getBoundingClientRect().width > 0); const bad = [];
                for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { const a = k[i].getBoundingClientRect(), c = k[j].getBoundingClientRect(); if (Math.min(a.right, c.right) - Math.max(a.left, c.left) > 2 && Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top) > 2) bad.push(k[i].id + '/' + k[j].id); } return bad; });
            if (o.length) ok(tag + ': controls do not overlap', false, o.slice(0, 3));
            const ph = await p.evaluate(() => [...document.querySelectorAll('input[placeholder]')].filter(i => i.getBoundingClientRect().width > 0).filter(i => { const c = document.createElement('canvas').getContext('2d'); const cs = getComputedStyle(i); c.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily; return c.measureText(i.placeholder).width > i.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight); }).map(i => i.id));
            if (ph.length) ok(tag + ': placeholders fit', false, ph);
        }
        if (w >= 900) for (const pos of [0, 0.5, 1]) {
            await p.evaluate(x => scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * x), pos);
            const ov = await p.evaluate(() => { const bad = []; document.querySelectorAll('main, .col-main, .col-side').forEach(h => { const k = [...h.children].filter(c => c.getBoundingClientRect().height > 4 && getComputedStyle(c).display !== 'none');
                for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { const a = k[i].getBoundingClientRect(), c = k[j].getBoundingClientRect(); if (Math.min(a.right, c.right) - Math.max(a.left, c.left) > 4 && Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top) > 4) bad.push(k[i].className + '/' + k[j].className); } }); return bad; });
            if (ov.length) ok(tag + ' scroll ' + pos + ': no overlap', false, ov);
        }
        if (w === 1280 && st) { const r = await p.evaluate(() => [document.querySelector('.col-main').getBoundingClientRect().width, document.querySelector('.app').getBoundingClientRect().width]); if (!(r[1] > 1000 && r[0] > 400)) ok(tag + ': desktop uses its width', false, r); }
        if (p.errors.length) ok(tag + ': no errors', false, p.errors);
        await p.context().close();
    }
    ok('sizes 320-1920, dark and light, filled and empty: no sideways scroll, overlaps or cut placeholders', true);

    // ---- help dialog and top bar at 4 widths
    for (const w of [320, 390, 820, 1280]) {
        p = await load(b, { width: w, height: 800 });
        await p.click('.help-btn');
        const r = await p.locator('dialog.help').boundingBox();
        ok('help ' + w + ': open and on screen', r && r.x >= 0 && r.y >= 0 && r.x + r.width <= w && r.y + r.height <= 800 && (await txt(p, 'dialog.help h2')) === 'How to use Home Blood Pressure Log');
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

    // ---- phone screenshot and files
    p = await load(b, { width: 390, height: 844 }, { state: week() });
    if (shots) {
        await p.evaluate(() => document.getElementById('summary').scrollIntoView());
        await p.evaluate(() => scrollBy(0, -12));
        await p.screenshot({ path: path.join(__dirname, 'screenshots/phone.png') });
    }
    for (const f of ['favicon.svg', 'manifest.webmanifest', 'sw.js', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', '../help.js', '../theme.js', 'screenshots/desktop.png', 'screenshots/phone.png']) {
        const r = await p.request.get(new URL(f, url).href);
        ok('file ' + f + ' returns 200', r.status() === 200);
    }
    ok('every file the page asked for loaded', !p.bad.length, p.bad);
    await p.context().close();

    await b.close(); if (srv) srv.close();
    console.log(fail ? '\n' + fail + ' FAILED' : '\nALL UI TESTS PASSED');
    process.exitCode = fail ? 1 : 0;
})();
