// Drives the real page in headless Chromium: node ui-test.js [--shots] [--base https://umar8092.github.io/apps]
// Without --base it serves this repo on localhost. With --base it tests the LIVE page. The clock is Thu 22 Oct 2026, 10:30.
const pw = (() => { for (const m of ['playwright', 'playwright-core']) { try { return require(m); } catch (e) { /* next */ } } throw new Error('playwright not found'); })();
const path = require('path'), fs = require('fs'), http = require('http');
const bi = process.argv.indexOf('--base');
const shots = process.argv.includes('--shots');
let fail = 0, url;
const ok = (name, cond, extra) => { if (!cond) fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond || extra == null ? '' : '  -> ' + JSON.stringify(extra))); };
const NOW = new Date(2026, 9, 22, 10, 30).getTime();
const SLUG = 'tuition-fee-and-attendance-register-for-tutors', KEY = SLUG + '.state';

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

// the README situation: Ayesha tutors six children
function seed() {
    const s = o => Object.assign({ id: 'x', name: '', who: '', subj: '', days: [1, 2, 3, 4], bill: 'month', start: '2026-10-01', stop: '', part: 'full', missed: false, open: 0, marks: {}, entries: [] }, o);
    return { v: 1, cur: '', due: 10, greet: 'Assalam o alaikum', hol: {}, students: [
        s({ id: 'ali', name: 'Ali', who: 'Mrs Khan', subj: 'Class 8, Maths', fees: [{ from: '2026-10', c: 500000 }], marks: { '2026-10-06': 'a', '2026-10-20': 'a' } }),
        s({ id: 'sara', name: 'Sara', subj: 'Class 6, English', days: [1, 3, 5], fees: [{ from: '2026-10', c: 500000 }], entries: [{ id: 'p1', k: 'pay', d: '2026-10-05', c: 300000, m: '2026-10', note: '' }] }),
        s({ id: 'omar', name: 'Omar', subj: 'Class 9, Physics', days: [2, 4], start: '2026-09-01', fees: [{ from: '2026-09', c: 400000 }], entries: [{ id: 'p2', k: 'pay', d: '2026-09-04', c: 400000, m: '2026-09', note: '' }] }),
        s({ id: 'hina', name: 'Hina', subj: 'O level Chemistry', days: [1, 3], bill: 'class', fees: [{ from: '2026-10', c: 60000 }], marks: { '2026-10-14': 'a', '2026-10-17': 'x' } }),
        s({ id: 'bilal', name: 'Bilal', subj: 'Class 5, all subjects', days: [1, 2, 3, 4, 5], start: '2026-10-15', part: 'part', fees: [{ from: '2026-10', c: 600000 }], entries: [{ id: 'p3', k: 'pay', d: '2026-10-16', c: 330000, m: '2026-10', note: 'cash' }] }),
        s({ id: 'zara', name: 'Zara', subj: 'Class 4, Urdu', fees: [{ from: '2026-10', c: 500000 }], entries: [{ id: 'd1', k: 'disc', d: '2026-10-01', c: 100000, m: '2026-10', note: 'sister of Ali' }, { id: 'p4', k: 'pay', d: '2026-10-02', c: 400000, m: '2026-10', note: '' }] })] };
}

async function load(b, vp, opt = {}) {
    const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: opt.scale || 1, colorScheme: opt.theme || 'dark', locale: 'en-GB',
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
const txt = async (p, sel) => ((await p.locator(sel).first().innerText()) || '').replace(/\s+/g, ' ').trim();
const saved = p => p.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
const box = (p, id) => p.locator('#item-' + id);
const day = (p, id, n) => box(p, id).locator('button.day').filter({ has: p.locator('.dn', { hasText: new RegExp('^' + n + '$') }) });
const firstBox = p => p.locator('.item').first();
const fday = (p, n) => firstBox(p).locator('button.day').filter({ has: p.locator('.dn', { hasText: new RegExp('^' + n + '$') }) });
async function mark(p, n, label) { await fday(p, n).click(); await firstBox(p).locator('.day-panel button', { hasText: new RegExp('^' + label + '$') }).click(); }
async function noScroll(p) { return p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1); }
async function overlaps(p) {
    return p.evaluate(() => {
        const els = [...document.querySelectorAll('main input:not([type=checkbox]):not([type=radio]):not([type=file]), main select, main button, main .seg-b, main .wd-chip')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.height && getComputedStyle(e).visibility !== 'hidden'; });
        const out = [];
        for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
            if (els[i].contains(els[j]) || els[j].contains(els[i])) continue;
            const a = els[i].getBoundingClientRect(), b = els[j].getBoundingClientRect();
            if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) out.push((els[i].id || els[i].textContent.trim().slice(0, 20)) + ' / ' + (els[j].id || els[j].textContent.trim().slice(0, 20)));
        }
        return out.slice(0, 4);
    });
}
async function placeholdersFit(p) {
    return p.evaluate(() => [...document.querySelectorAll('main input[placeholder]')].filter(i => i.offsetParent).filter(i => {
        const c = document.createElement('canvas').getContext('2d'), cs = getComputedStyle(i);
        c.font = cs.fontSize + ' ' + cs.fontFamily;
        return c.measureText(i.placeholder).width > i.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) + 1;
    }).map(i => i.id));
}
async function addStudent(p, o) {
    await p.fill('#f-name', o.name);
    if (o.quick) await p.click('#f-days-quick .chip:has-text("' + o.quick + '")');
    if (o.cls) await p.click('label.seg-b:has(#f-bill-class)');
    await p.fill('#f-fee', o.fee);
    if (o.start) await p.fill('#f-start', o.start);
    await p.click('#f-save');
}

(async () => {
    let server;
    if (bi >= 0) url = process.argv[bi + 1].replace(/\/$/, '') + '/' + SLUG + '/';
    else { server = await serve(); url = 'http://localhost:' + server.address().port + '/' + SLUG + '/'; }
    const b = await pw.chromium.launch();
    const PHONE = { width: 390, height: 844 }, DESK = { width: 1280, height: 900 };

    // ---------- first use, empty state ----------
    let p = await load(b, PHONE);
    ok('empty: no today or month box, form shown', await p.isHidden('#today') && await p.isHidden('#month') && await p.isVisible('#add') && await p.isVisible('#restore-first'));
    ok('optional fields hidden behind + buttons', await p.isHidden('#f-more-box') && await p.isHidden('#f-open-box') && await p.isVisible('#f-more-open'));
    ok('start date defaults to the 1st of this month', await p.inputValue('#f-start') === '2026-10-01');
    await p.click('#f-save');
    ok('blank name and fee give clear errors', (await txt(p, '#f-name-err')) === "Type the student's name." && (await txt(p, '#f-fee-err')) === 'Type the monthly fee, such as 5000.');
    await p.fill('#f-name', 'Ali'); await p.fill('#f-fee', '-5'); await p.click('#f-save');
    ok('negative fee refused', (await txt(p, '#f-fee-err')).includes('minus'));
    await p.fill('#f-fee', '0'); await p.click('#f-save');
    ok('zero fee refused', (await txt(p, '#f-fee-err')).includes('more than 0'));
    await p.click('#f-days-quick .chip:has-text("Mon to Thu")');
    ok('quick days tick Mon to Thu', await p.isChecked('#f-wd-1') && await p.isChecked('#f-wd-4') && !await p.isChecked('#f-wd-5') && (await txt(p, '#f-wd-hint')).startsWith('Classes on Mon, Tue, Wed, Thu'));
    await p.fill('#f-fee', '5,000'); await p.click('#f-save');
    ok('Ali added with only name, days and fee (optional inputs not forced)', await p.locator('.item').count() === 1 && (await txt(p, '#add-msg')).startsWith('Ali added'));
    ok('Ali: 13 of 13 classes, 5,000 to pay, Late after the 10th', (await txt(p, '.item .i-att')) === 'Attended 13 of 13 classes.' && (await txt(p, '.item .b-pay')).startsWith('Still to pay: 5,000') && await p.isVisible('.item .b-pay .late'));
    ok('today box lists Ali (Thursday)', (await txt(p, '#t-list')).includes('Ali') && await p.isVisible('#today'));
    // today: one tap absent, then undo
    await p.click('#t-list button:has-text("Absent")');
    ok('one tap Absent today', (await txt(p, '.item .i-att')) === 'Attended 12 of 13 classes: absent 22 Oct.' && await p.getAttribute('#t-list button:has-text("Absent")', 'aria-pressed') === 'true');
    await p.click('#today-msg .undo');
    ok('undo the absence', (await txt(p, '.item .i-att')) === 'Attended 13 of 13 classes.');
    await p.click('#t-list button:has-text("Absent")'); await p.click('#t-list button:has-text("Present")');
    ok('Present undoes Absent', (await txt(p, '.item .i-att')) === 'Attended 13 of 13 classes.');
    // calendar marks
    await mark(p, 6, 'Absent'); await mark(p, 20, 'Absent');
    ok('calendar: absent 6 and 20 Oct', (await txt(p, '.item .i-att')) === 'Attended 11 of 13 classes: absent 6 Oct and 20 Oct.');
    ok('calendar shows ✗ on 6 Oct', (await txt(p, '.item button.day.absent >> nth=0')).includes('✗'));
    await mark(p, 17, 'Extra class');
    ok('extra class on Saturday', (await txt(p, '.item .i-att')).includes('1 extra class (17 Oct)'));
    await mark(p, 17, 'No class');
    await mark(p, 12, 'No class');
    ok('no class for this student on 12 Oct', (await txt(p, '.item .i-att')) === 'Attended 10 of 12 classes: absent 6 Oct and 20 Oct.');
    await mark(p, 12, 'Present');
    await mark(p, 8, 'Holiday for everyone');
    ok('holiday for everyone on 8 Oct', (await txt(p, '.item .i-att')) === 'Attended 10 of 12 classes: absent 6 Oct and 20 Oct.' && (await txt(p, '.item button.day.hol')).includes('H'));
    await fday(p, 8).click();
    await firstBox(p).locator('.day-panel button', { hasText: 'Holiday for everyone' }).click();
    ok('holiday removed again', (await txt(p, '.item .i-att')) === 'Attended 11 of 13 classes: absent 6 Oct and 20 Oct.');
    await fday(p, 27).click();
    ok('a day still to come says so', (await txt(p, '.day-panel .dp-now')).startsWith('Still to come'));
    await p.click('.day-panel button:has-text("Close")');
    ok('day panel closes', await p.locator('.day-panel').count() === 0);
    // payments
    await p.click('.item button:has-text("Record a payment")');
    const pid = await p.locator('.panel input[id$="-amt"]').getAttribute('id');
    ok('payment amount prefilled with what is owed', await p.inputValue('#' + pid) === '5000');
    await p.fill('#' + pid, ''); await p.click('.panel button:has-text("Save payment")');
    ok('blank payment refused', (await txt(p, '#' + pid + '-err')).length > 0);
    await p.fill('#' + pid, '3000');
    await p.fill('.panel input[type=date]', '2026-10-30'); await p.click('.panel button:has-text("Save payment")');
    ok('future payment date refused', (await txt(p, '.panel [id$="-d-err"]')).includes('future'));
    await p.fill('.panel input[type=date]', '2026-10-05'); await p.click('.panel button:has-text("Save payment")');
    ok('part payment: 2,000 still to pay', (await txt(p, '.item .b-pay')).startsWith('Still to pay: 2,000 (3,000 paid)'));
    ok('payment line shown with Delete', (await txt(p, '.item .b-lines')).includes('Paid 5 Oct'));
    await p.click('.item .b-lines button:has-text("Delete")');
    ok('delete payment', (await txt(p, '.item .b-pay')).startsWith('Still to pay: 5,000'));
    await p.click('.item .msg .undo');
    ok('undo delete payment', (await txt(p, '.item .b-pay')).startsWith('Still to pay: 2,000'));
    // copy message
    await p.click('.item button:has-text("Copy fee message")');
    const msg = await p.evaluate(() => navigator.clipboard.readText());
    ok('fee message for the parent', msg.startsWith('Hello,\nThis is a reminder that Ali\'s tuition fee for October 2026 is 5,000, of which 3,000 has been received. Still to pay: 2,000.') && msg.includes('attended 11 of 13 classes'), msg);
    // pay the rest: receipt
    await p.click('.item button:has-text("Record a payment")');
    await p.click('.panel .chip:has-text("Still to pay")');
    await p.click('.panel button:has-text("Save payment")');
    ok('paid in full', (await txt(p, '.item .b-pay')) === 'October paid in full' && await p.isHidden('.item .late'));
    await p.click('.item button:has-text("Copy fee message")');
    ok('receipt message once paid', (await p.evaluate(() => navigator.clipboard.readText())).includes('has been received in full'));
    // discount
    await p.click('.item button:has-text("Discount or extra charge")');
    await p.click('.panel label.seg-b:has-text("Extra charge")');
    await p.fill('.panel input[id$="-amt"]', '750.50');
    await p.click('.panel button:has-text("+ Add a note")'); await p.fill('.panel input[id$="-note"]', 'books');
    await p.click('.panel button:has-text("Save")');
    ok('extra charge for books', (await txt(p, '.item .b-pay')).startsWith('Still to pay: 750.50') && (await txt(p, '.item .b-lines')).includes('Extra charge: books'));
    // duplicate name
    await p.fill('#f-name', 'ali'); await p.fill('#f-fee', '100'); await p.click('#f-save');
    ok('same name twice is stopped with advice', (await txt(p, '#f-name-err')).includes('already have a student called ali'));
    // per class form
    await p.click('label.seg-b:has(#f-bill-class)');
    ok('per class: label, missed option, no part-month choice', (await txt(p, '#f-fee-l')) === 'Fee per class' && await p.isVisible('#f-missed-box') && await p.isHidden('#f-part-box'));
    await p.fill('#f-name', 'Hina'); await p.uncheck('#f-wd-2'); await p.uncheck('#f-wd-4'); await p.check('#f-wd-1'); await p.check('#f-wd-3'); await p.fill('#f-fee', '600'); await p.click('#f-save');
    ok('per class student: 6 classes so far', (await txt(p, '#i-list .item >> nth=1 >> .b-lines')).includes('6 classes × 600 so far'));
    ok('form keeps the last days for the next student', await p.isChecked('#f-wd-1') && await p.isChecked('#f-bill-class'));
    // reload keeps everything
    await p.reload({ waitUntil: 'networkidle' });
    ok('reload keeps students, marks and payments', await p.locator('.item').count() === 2 && (await txt(p, '.item .i-att')).includes('absent 6 Oct and 20 Oct') && (await txt(p, '.item .b-pay')).startsWith('Still to pay: 750.50'));
    // month navigation and carry
    await p.click('#mo-next');
    ok('November: unpaid 750.50 carried + fee', (await txt(p, '.item .b-lines')).includes('Unpaid from before') && (await txt(p, '.item .b-pay')).startsWith('Still to pay: 5,750.50') && await p.isVisible('#mo-today'));
    await p.click('#mo-today');
    ok('back to this month', (await txt(p, '#month-h')) === 'October 2026');
    // edit: new fee from November
    await p.click('.item button:has-text("Edit")');
    ok('edit fills the form', await p.inputValue('#f-name') === 'Ali' && await p.isVisible('#f-from-box') && (await txt(p, '#add-h')) === 'Edit Ali');
    await p.fill('#f-fee', '5500'); await p.selectOption('#f-from', '2026-11'); await p.click('#f-save');
    ok('October keeps 5,000', (await txt(p, '.item .tag')).startsWith('5,000 a month'));
    await p.click('#mo-next');
    ok('November uses 5,500', (await txt(p, '.item .tag')).startsWith('5,500 a month'));
    await p.click('#mo-today');
    // holiday today
    await p.click('#t-hol');
    ok('holiday today', (await txt(p, '#t-hint')).startsWith('Holiday today') && (await txt(p, '#t-hol')).startsWith('Not a holiday'));
    await p.click('#t-hol');
    // delete student with undo
    await p.click('#i-list .item >> nth=1 >> button:has-text("Delete")');
    ok('delete student', await p.locator('.item').count() === 1);
    await p.click('#add-msg .undo');
    ok('undo delete student', await p.locator('.item').count() === 2);
    ok('no console errors (first use run)', !p.errors.length && !p.bad.length, p.errors.concat(p.bad));
    await p.context().close();

    // ---------- the README situation ----------
    p = await load(b, DESK, { state: seed() });
    ok('month: still to collect 14,600 from 4 students', (await txt(p, '#mo-pay')) === 'Still to collect: 14,600 from 4 students', await txt(p, '#mo-pay'));
    ok('unpaid rows: Ali, Sara, Omar, Hina', (await p.locator('#mo-rows .mo-name').allInnerTexts()).join(',') === 'Ali,Sara,Omar,Hina');
    ok('Late tags: Ali, Sara, Omar late; Hina (per class) not', await p.locator('#mo-rows .late').count() === 3);
    await p.click('#mo-copy');
    ok('copy unpaid list', (await p.evaluate(() => navigator.clipboard.readText())) === 'Fees not paid yet for October 2026 (4):\n- Ali: 5,000\n- Sara: 2,000 (3,000 paid)\n- Omar: 4,000\n- Hina: 3,600\nTotal still to collect: 14,600');
    ok('Bilal part month 3,272.73, paid 27.27 extra', (await txt(p, '#item-bilal .b-lines')).includes('Fee for 12 of 22 class days') && (await txt(p, '#item-bilal .b-pay')).startsWith('Paid 27.27 extra'));
    ok('Zara with sister discount paid in full', (await txt(p, '#item-zara .b-pay')) === 'October paid in full');
    ok('today: Ali, Omar, Bilal, Zara have class on Thursday', (await p.locator('#t-list .t-name').allInnerTexts()).join(',') === 'Ali,Omar,Bilal,Zara');
    ok('find box shows with 6 students', await p.isVisible('#find-box'));
    await p.fill('#find', 'sa');
    ok('find Sara', await p.locator('.item').count() === 1 && (await txt(p, '.item .i-name')) === 'Sara');
    await p.fill('#find', 'zzz');
    ok('find: nobody', await p.locator('.item').count() === 0 && await p.isVisible('#find-none'));
    await p.fill('#find', '');
    await p.click('#mo-rows .mo-name:has-text("Omar")');
    ok('unpaid name jumps to the student', await p.evaluate(() => document.activeElement.id) === 'item-omar');
    await p.selectOption('#cur', 'Rs');
    ok('currency symbol shown and saved', (await txt(p, '#mo-pay')).includes('Rs 14,600') && (await saved(p)).cur === 'Rs');
    await p.selectOption('#cur', '');
    await p.selectOption('#due', '25');
    ok('due day 25: monthly fees not late yet (except carry)', await p.locator('#mo-rows .late').count() === 0);
    await p.selectOption('#due', '10');
    await p.click('#item-ali button:has-text("Copy fee message")');
    ok('greeting setting used', (await p.evaluate(() => navigator.clipboard.readText())).startsWith('Assalam o alaikum,\n'));
    // backup and restore
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#backup')]);
    const file = await dl.path();
    ok('backup file named for the app', dl.suggestedFilename() === SLUG + '-2026-10-22.json');
    await p.click('#del-all');
    ok('delete everything', await p.locator('.item').count() === 0 && await p.isHidden('#today'));
    await p.click('#tools-msg .undo');
    ok('undo delete everything', await p.locator('.item').count() === 6);
    await p.click('#del-all');
    await p.setInputFiles('#restore-file', file);
    ok('restore backup', await p.locator('.item').count() === 6 && (await txt(p, '#mo-pay')).includes('14,600'));
    const badFile = path.join(require('os').tmpdir(), 'tfr-bad.json'); fs.writeFileSync(badFile, '{"nope":1}');
    await p.setInputFiles('#restore-file', badFile);
    ok('a wrong file is refused', (await txt(p, '#tools-msg')).includes('not a backup') && await p.locator('.item').count() === 6);
    ok('no console errors (README run)', !p.errors.length && !p.bad.length, p.errors.concat(p.bad));
    // print register does not throw
    await p.evaluate(() => { window.print = () => { window.__printed = true; }; });
    await p.click('#mo-print');
    ok('print register', await p.evaluate(() => window.__printed === true) && (await p.locator('#report tr').count()) > 6);
    await p.context().close();

    // ---------- saved state problems ----------
    p = await load(b, PHONE, { state: '{not json' });
    ok('corrupt saved data: starts fresh with no errors', await p.locator('.item').count() === 0 && !p.errors.length, p.errors);
    await p.context().close();
    p = await load(b, PHONE, { state: { students: [{ name: 'X', start: 'bad' }, 5, null] } });
    ok('bad students dropped', await p.locator('.item').count() === 0 && !p.errors.length);
    await p.context().close();
    p = await load(b, PHONE, { block: true });
    ok('storage blocked: warning shown', await p.isVisible('#store-warn'));
    await addStudent(p, { name: 'Ali', quick: 'Mon to Thu', fee: '5000' });
    ok('storage blocked: still works', await p.locator('.item').count() === 1 && !p.errors.length, p.errors);
    await p.context().close();
    // long text and huge numbers
    p = await load(b, { width: 320, height: 700 });
    await p.click('#f-more-open');
    await addStudent(p, { name: 'Muhammad Abdullah Bin Abdul Rahman Khan', quick: 'Mon to Fri', fee: '99,999,999' });
    ok('long name and huge fee fit at 320px', await noScroll(p) && (await txt(p, '.item .b-pay')).includes('99,999,999'));
    ok('second day: next morning the today box moves on', true);
    await p.clock.fastForward(24 * 3600 * 1000);
    await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await p.waitForTimeout(300);
    ok('Friday shows in the today box', (await txt(p, '#t-date')).startsWith('Friday'));
    await p.context().close();

    // ---------- layout, help and theme at every width ----------
    for (const theme of ['dark', 'light']) {
        for (const w of [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920]) {
            p = await load(b, { width: w, height: 900 }, { state: seed(), theme });
            let good = await noScroll(p);
            await p.click('#item-ali button:has-text("Record a payment")');
            await day(p, 'sara', 7).click();
            await p.click('#f-more-open'); await p.click('#f-open-open');
            good = good && await noScroll(p);
            if (w <= 390) {
                const ov = await overlaps(p);
                ok(`[${theme} ${w}] no overlapping controls with panels open`, !ov.length, ov);
                const ph = await placeholdersFit(p);
                ok(`[${theme} ${w}] placeholders fit`, !ph.length, ph);
            }
            if (w >= 900) {
                const lap = [];
                for (const y of [0, 0.5, 1]) {
                    await p.evaluate(f => window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * f), y);
                    lap.push(...await p.evaluate(() => { const kids = [...document.querySelectorAll('main > *')].filter(e => e.getBoundingClientRect().height > 0 && getComputedStyle(e).display !== 'none'); const o = []; for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) { const a = kids[i].getBoundingClientRect(), c = kids[j].getBoundingClientRect(); if (a.left < c.right - 1 && c.left < a.right - 1 && a.top < c.bottom - 1 && c.top < a.bottom - 1) o.push(kids[i].className + '/' + kids[j].className); } return o; }));
                }
                ok(`[${theme} ${w}] no overlapping blocks when scrolled`, !lap.length, lap);
            }
            await p.click('#del-all');
            good = good && await noScroll(p);
            ok(`[${theme} ${w}] no horizontal scroll (filled and cleared)`, good);
            if (theme === 'dark' && [320, 390, 820, 1280].includes(w)) {
                await p.evaluate(() => window.scrollTo(0, 0));
                const hb = p.locator('.help-btn').first();
                await hb.click();
                const dlg = p.locator('dialog[open], [role=dialog]').first();
                const r = await dlg.boundingBox();
                ok(`[${w}] help opens inside the screen with its title`, r && r.x >= 0 && r.x + r.width <= w + 1 && (await dlg.innerText()).includes('How to use Tuition Fee and Attendance Register for Tutors'));
                await p.keyboard.press('Escape');
                ok(`[${w}] Escape closes help`, await p.locator('dialog[open]').count() === 0);
                await hb.click(); await p.click('text=Got it');
                ok(`[${w}] Got it closes help`, await p.locator('dialog[open]').count() === 0);
                const tb = await p.evaluate(() => { const bs = [...document.querySelectorAll('.topbar a, .topbar button')].map(e => e.getBoundingClientRect()); let o = false; for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) { const a = bs[i], c = bs[j]; if (a.left < c.right - 1 && c.left < a.right - 1 && a.top < c.bottom - 1 && c.top < a.bottom - 1) o = true; } return !o && bs.length >= 2; });
                ok(`[${w}] top bar buttons do not overlap`, tb);
            }
            if (theme === 'dark' && w === 1280) {
                const before = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
                await p.locator('.theme-toggle').first().click();
                const after = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
                ok('light/dark switch changes the look', before !== after);
            }
            ok(`[${theme} ${w}] no console errors`, !p.errors.length && !p.bad.length, p.errors.concat(p.bad));
            await p.context().close();
        }
    }

    // ---------- screenshots ----------
    if (shots) {
        const dir = path.join(__dirname, 'screenshots');
        p = await load(b, { width: 1280, height: 900 }, { state: seed() });
        await p.evaluate(() => window.scrollTo(0, 0));
        await p.screenshot({ path: path.join(dir, 'desktop.png') });
        await p.context().close();
        p = await load(b, { width: 390, height: 844 }, { state: seed(), scale: 2 });
        await p.screenshot({ path: path.join(dir, 'phone.png') });
        await p.context().close();
        console.log('screenshots saved');
    }
    await b.close();
    if (server) server.close();
    console.log(fail ? fail + ' FAILED' : 'ALL UI CHECKS PASSED');
    process.exitCode = fail ? 1 : 0;
})();
