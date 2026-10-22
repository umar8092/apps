// Drives the real page in headless Chromium: node ui-test.js [--shots] [--base https://umar8092.github.io/apps]
// Without --base it serves this repo on localhost. With --base it tests the LIVE page. The clock is Thu 22 Oct 2026, 10:30.
const pw = (() => { for (const m of ['playwright', 'playwright-core']) { try { return require(m); } catch (e) { /* next */ } } throw new Error('playwright not found'); })();
const path = require('path'), fs = require('fs'), http = require('http');
const bi = process.argv.indexOf('--base');
const shots = process.argv.includes('--shots');
let fail = 0, url;
const ok = (name, cond, extra) => { if (!cond) fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond || extra == null ? '' : '  -> ' + JSON.stringify(extra))); };
const NOW = new Date(2026, 9, 22, 10, 30).getTime();
const SLUG = 'household-help-attendance-and-salary-tracker', KEY = SLUG + '.state';

function serve() {
    const ROOT = path.resolve(__dirname, '..');
    const types = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml', png: 'image/png', webmanifest: 'application/manifest+json', woff2: 'font/woff2' };
    return new Promise(res => {
        const s = http.createServer((req, rs) => {
            let p = decodeURIComponent(req.url.split('?')[0]).replace(/^\/apps/, ''); if (p.endsWith('/')) p += 'index.html';
            const f = path.join(ROOT, p);
            if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rs.writeHead(404); return rs.end('nf'); }
            rs.writeHead(200, { 'content-type': types[f.split('.').pop()] || 'application/octet-stream' }); rs.end(fs.readFileSync(f));
        }).listen(0, () => res(s));
    });
}

// the README situation: Rubina the maid, Akram the driver who joined on 15 Oct, and Shabana the cook paid 18,000
function seed() {
    const w = (o) => Object.assign({ id: 'x', name: '', role: '', start: '2026-10-01', stop: '', off: [], leave: 0, carry: false, rule: 'thirty', pays: [], extraC: 0, otC: 0, open: 0, settled: '', marks: {}, entries: [] }, o);
    const rubina = w({ id: 'rubina', name: 'Rubina', role: 'Maid', start: '2025-04-01', settled: '2026-10', off: [0], leave: 2, pays: [{ from: '2025-04', c: 3000000 }],
        marks: { '2026-10-05': { k: 'a' }, '2026-10-06': { k: 'a' }, '2026-10-19': { k: 'a' }, '2026-10-20': { k: 'a' }, '2026-10-27': { k: 'h' }, '2026-10-11': { k: 'x' } },
        entries: [{ id: 'adv1', k: 'adv', d: '2026-10-12', c: 500000, note: '', n: 1, from: '2026-10' }] });
    const akram = w({ id: 'akram', name: 'Akram', role: 'Driver', start: '2026-10-15', rule: 'month', pays: [{ from: '2026-10', c: 4000000 }], otC: 20000,
        marks: { '2026-10-16': { k: '', ot: 120 }, '2026-10-21': { k: '', ot: 90 } } });
    const shabana = w({ id: 'shabana', name: 'Shabana', role: 'Cook', start: '2026-01-01', settled: '2026-10', off: [5], leave: 1, pays: [{ from: '2026-01', c: 1800000 }],
        marks: { '2026-10-08': { k: 'a' }, '2026-10-13': { k: 'a' }, '2026-10-14': { k: 'p' } }, entries: [{ id: 'b1', k: 'bonus', d: '2026-10-10', c: 200000, note: 'Birthday', n: 1 }] });
    return { v: 1, cur: '', workers: [rubina, akram, shabana] };
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
    await p.goto(url, { waitUntil: 'networkidle' });
    return p;
}
const txt = async (p, sel) => ((await p.innerText(sel)) || '').replace(/\s+/g, ' ').trim();
const saved = p => p.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
const box = (p, id) => p.locator('#item-' + id);
const day = (p, id, n) => box(p, id).locator('button.day').filter({ has: p.locator('.dn', { hasText: new RegExp('^' + n + '$') }) });
const firstBox = p => p.locator('.item').first();
const fday = (p, n) => firstBox(p).locator('button.day').filter({ has: p.locator('.dn', { hasText: new RegExp('^' + n + '$') }) });
async function mark(p, n, label) { await fday(p, n).click(); await firstBox(p).locator('.panel button', { hasText: new RegExp('^' + label + '$') }).click(); }
const toPay = p => txt(p, '.item >> nth=0 >> .b-pay');

async function noScroll(p) { return p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1); }
async function overlaps(p) {
    return p.evaluate(() => {
        const bad = [];
        document.querySelectorAll('main, .app, .col-a, .col-b, .i-list').forEach(par => {
            const kids = [...par.children].filter(e => { const s = getComputedStyle(e); return s.display !== 'none' && s.display !== 'contents' && s.position !== 'absolute' && e.offsetHeight; });
            for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
                const a = kids[i].getBoundingClientRect(), b = kids[j].getBoundingClientRect();
                if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2) bad.push((kids[i].id || kids[i].className) + ' / ' + (kids[j].id || kids[j].className));
            }
        });
        return bad;
    });
}
async function controlOverlaps(p) {
    return p.evaluate(() => {
        const els = [...document.querySelectorAll('input:not([type=file]):not([type=checkbox]), select, button')].filter(e => e.offsetParent && !e.closest('.cal') && !e.closest('dialog'));
        const bad = [];
        for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
            const a = els[i].getBoundingClientRect(), b = els[j].getBoundingClientRect();
            if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) bad.push((els[i].id || els[i].textContent.trim().slice(0, 20)) + ' / ' + (els[j].id || els[j].textContent.trim().slice(0, 20)));
        }
        const out = [...document.querySelectorAll('input, select, button')].filter(e => e.offsetParent && e.getBoundingClientRect().right > window.innerWidth + 1).map(e => e.id || e.textContent.trim().slice(0, 20));
        // placeholders must fit their box
        const clip = [...document.querySelectorAll('input[placeholder]')].filter(e => e.offsetParent && !e.value).filter(e => {
            const c = document.createElement('canvas').getContext('2d'), s = getComputedStyle(e);
            c.font = s.fontSize + ' ' + s.fontFamily;
            return c.measureText(e.placeholder).width > e.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight) + 1;
        }).map(e => e.id + ' "' + e.placeholder + '"');
        return bad.concat(out.map(x => 'sticks out: ' + x), clip.map(x => 'placeholder cut: ' + x));
    });
}

async function main() {
    let server;
    if (bi > -1) url = process.argv[bi + 1].replace(/\/$/, '') + '/' + SLUG + '/';
    else { server = await serve(); url = 'http://localhost:' + server.address().port + '/apps/' + SLUG + '/'; }
    const b = await pw.chromium.launch();
    try {
        // ---------- first use: empty state, the form, validation ----------
        let p = await load(b, { width: 390, height: 844 });
        ok('empty: no month box, no workers', await p.locator('#month').isHidden() && await p.locator('#items').isHidden());
        ok('empty: restore link offered', await p.locator('#restore-first').isVisible());
        ok('optional fields hidden at first', await p.locator('#f-ot-box').isHidden() && await p.locator('#f-open-box').isHidden() && await p.locator('#f-extra-box').isHidden() && await p.locator('#f-role-box').isHidden());
        ok('pay for a day off link only when a day off is ticked', await p.locator('#f-extra-open').isHidden());
        await p.click('#f-save');
        ok('blank form: name and pay errors', (await txt(p, '#f-name-err')).includes('name') && (await txt(p, '#f-pay-err')).includes('monthly pay'));
        ok('blank form: optional fields not forced', !(await txt(p, '#f-ot-err')) && !(await txt(p, '#f-open-err')) && !(await txt(p, '#f-extra-err')));
        for (const [v, want] of [['-5', 'minus'], ['abc', 'number'], ['0', 'more than 0'], ['999999999999', 'too big']]) {
            await p.fill('#f-pay', v); await p.click('#f-save');
            ok('pay "' + v + '" is refused', (await txt(p, '#f-pay-err')).includes(want), await txt(p, '#f-pay-err'));
        }
        await p.fill('#f-name', 'Rubina');
        await p.click('#quick .chip[data-role="Maid"]');
        ok('job chip is selected', await p.getAttribute('#quick .chip[data-role="Maid"]', 'aria-pressed') === 'true');
        await p.fill('#f-pay', '30,000');
        ok('day pay hint: one day is 1,000', (await txt(p, '#f-rule-hint')).includes('one day is 1,000 in every month'), await txt(p, '#f-rule-hint'));
        for (const d of [0, 1, 2, 3, 4, 5, 6]) await p.check('#f-wd-' + d);
        await p.click('#f-save');
        ok('every day off is refused', (await txt(p, '#f-wd-err')).includes('Untick'));
        for (const d of [1, 2, 3, 4, 5, 6]) await p.uncheck('#f-wd-' + d);
        ok('pay for a day off link appears with a day off', await p.locator('#f-extra-open').isVisible());
        await p.selectOption('#f-leave', '2');
        ok('carry-over choice appears with paid leave', await p.locator('#f-carry-box').isVisible());
        ok('start date defaults to the 1st of this month, no settled tick needed', await p.inputValue('#f-start') === '2026-10-01' && await p.locator('#f-settled-box').isHidden());
        await p.fill('#f-start', '2024-03-01');
        ok('start long ago: "Pay before October 2026 is already settled" ticked', await p.locator('#f-settled-box').isVisible() && await p.isChecked('#f-settled') && (await txt(p, '#f-settled-box')).includes('October 2026'));
        await p.fill('#f-start', '2026-10-01');
        await p.click('#f-save');
        ok('worker added in its own box', await p.locator('.item').count() === 1 && (await txt(p, '.item .i-name')) === 'Rubina');
        ok('form is cleared after adding', await p.inputValue('#f-name') === '' && await p.inputValue('#f-pay') === '');
        ok('today line', (await txt(p, '.item .tb-t')).startsWith('Today, Thu, 22 Oct: a working day'), await txt(p, '.item .tb-t'));
        ok('full pay before any marks', (await toPay(p)) === 'To pay: 30,000', await toPay(p));
        ok('days before the start are not buttons', true);

        // ---------- the main situation ----------
        for (const n of [5, 6, 19, 20]) await mark(p, n, 'Absent');
        await mark(p, 27, 'Half day');
        await mark(p, 11, 'Came to work');
        const cells = async n => txt(p, '.item >> nth=0 >> button.day:has(.dn:text-is("' + n + '")) >> .dq');
        ok('calendar: 5 Oct paid leave (L), 19 Oct unpaid (✗), 27 half (½), 11 extra (+1), 4 Oct Off', (await cells(5)) === 'L' && (await cells(19)) === '✗' && (await cells(27)) === '½' && (await cells(11)) === '+1' && (await cells(4)) === 'Off', [await cells(5), await cells(19), await cells(27), await cells(11), await cells(4)]);
        ok('day button tells a screen reader what it is', (await fday(p, 19).getAttribute('aria-label')).includes('absent, unpaid'));
        await firstBox(p).locator('button', { hasText: /^Advance$/ }).click();
        await p.fill('[id^="adv-amt-"]', '');
        await p.click('text=Save advance');
        ok('advance needs an amount', (await txt(p, '.item .panel .err >> nth=0')).length > 0);
        await p.fill('[id^="adv-amt-"]', '5000'); await p.fill('[id^="adv-day-"]', '2026-10-12');
        ok('advance note is optional and hidden', await p.locator('[id^="adv-note-"]').isHidden());
        await p.click('text=Save advance');
        ok('MAIN: To pay 23,500', (await toPay(p)) === 'To pay: 23,500', await toPay(p));
        const slipT = await txt(p, '.item .bill');
        ok('slip explains every line', ['Monthly pay 30,000', 'Paid leave: 2 days (5 Oct and 6 Oct), nothing taken off', 'Unpaid days off: 2½ days (19 Oct, 20 Oct and 27 Oct (half)) at 1,000 a day', '−2,500', 'Worked on a day off: 1 day (11 Oct) at 1,000 a day', 'Advance of 5,000 given 12 Oct', '−5,000', 'Pay for October 23,500'].every(s => slipT.includes(s)), slipT);
        ok('current month says days to come count as worked', slipT.includes('days still to come are counted as worked'));
        ok('month box total', (await txt(p, '#mo-pay')) === 'To pay for October: 23,500');
        await firstBox(p).locator('button', { hasText: 'Copy pay slip' }).click();
        const clip = await p.evaluate(() => navigator.clipboard.readText());
        ok('copied slip text', clip.startsWith('Rubina (Maid): pay for October 2026') && clip.includes('To pay: 23,500'), clip);

        // edit a mistake: 20 Oct was actually worked
        await mark(p, 20, 'Worked');
        ok('fix a day: 1½ unpaid days, To pay 24,500', (await toPay(p)) === 'To pay: 24,500', await toPay(p));
        await p.click('.item .msg .undo');
        ok('undo the fix', (await toPay(p)) === 'To pay: 23,500');

        // today buttons
        await firstBox(p).locator('button', { hasText: 'Absent today' }).click();
        ok('absent today: uses no leave (all used), 1,000 more off', (await toPay(p)) === 'To pay: 22,500' && (await txt(p, '.item .tb-t')).includes('absent (unpaid)'), await toPay(p));
        await firstBox(p).locator('button', { hasText: 'Mark today as worked' }).click();
        ok('today back to worked', (await toPay(p)) === 'To pay: 23,500');

        // payments: part, undo, carry to next month
        await firstBox(p).locator('button', { hasText: 'Record a payment' }).click();
        ok('payment amount filled with what is owed', await p.inputValue('[id^="pay-amt-"]') === '23500');
        await p.fill('[id^="pay-amt-"]', '20000');
        await p.click('text=Save payment');
        ok('part payment leaves 3,500', (await toPay(p)) === 'To pay: 3,500', await toPay(p));
        await p.click('#mo-next');
        ok('3,500 is carried into November', (await txt(p, '.item .bill')).includes('Still owed from before 3,500') && (await toPay(p)) === 'To pay: 33,500', await toPay(p));
        await p.click('#mo-today');
        await firstBox(p).locator('.b-line:has-text("Paid on") button', { hasText: 'Delete' }).click();
        ok('delete a payment', (await toPay(p)) === 'To pay: 23,500');
        await p.click('.item .msg .undo');
        ok('undo the delete', (await toPay(p)) === 'To pay: 3,500');

        // reload keeps everything
        await p.reload({ waitUntil: 'networkidle' });
        ok('reload: saved state is back', (await toPay(p)) === 'To pay: 3,500' && (await cells(19)) === '✗');

        // edit: pay rise from November
        await firstBox(p).locator('button', { hasText: /^Edit$/ }).click();
        ok('edit fills the form', await p.inputValue('#f-name') === 'Rubina' && await p.inputValue('#f-pay') === '30000' && await p.isChecked('#f-wd-0'));
        ok('new pay month is hidden until the pay changes', await p.locator('#f-from-box').isHidden());
        await p.fill('#f-pay', '32000');
        ok('new pay month appears', await p.locator('#f-from-box').isVisible());
        await p.selectOption('#f-from', '2026-11');
        await p.click('#f-save');
        ok('October keeps the old pay', (await toPay(p)) === 'To pay: 3,500');
        await p.click('#mo-next');
        ok('November uses 32,000', (await txt(p, '.item .bill')).includes('Monthly pay 32,000'));
        await p.click('#mo-today');

        // second worker: joined mid-month, ÷ days in month, overtime
        await p.fill('#f-name', 'Akram'); await p.click('#quick .chip[data-role="Driver"]'); await p.fill('#f-pay', '40000');
        await p.selectOption('#f-rule', 'month'); await p.fill('#f-start', '2026-10-15');
        await p.click('#f-ot-open'); await p.fill('#f-ot', '200');
        await p.press('#f-ot', 'Enter');
        ok('Enter adds the worker', await p.locator('.item').count() === 2);
        const ak = p.locator('.item').nth(1);
        ok('joined 15 Oct: 17 of 31 days = 21,935.48', (await ak.locator('.bill').innerText()).includes('Monthly pay 40,000 for 17 of 31 days (15 Oct to 31 Oct)') && (await ak.locator('.b-pay').innerText()) === 'To pay: 21,935.48', await ak.locator('.b-pay').innerText());
        ok('days before joining are not buttons', await ak.locator('.day.none').count() === 14);
        await ak.locator('button.day:has(.dn:text-is("16"))').click();
        await p.fill('[id^="ot-"]', '25'); await ak.locator('button', { hasText: 'Save hours' }).click();
        ok('25 overtime hours refused', (await ak.locator('.panel .err').innerText()).includes('24 hours'));
        await p.fill('[id^="ot-"]', '1:30'); await ak.locator('button', { hasText: 'Save hours' }).click();
        ok('1:30 overtime adds 300', (await ak.locator('.bill').innerText()).includes('Overtime: 1 h 30 min at 200 an hour') && (await ak.locator('.b-pay').innerText()) === 'To pay: 22,235.48', await ak.locator('.b-pay').innerText());
        await ak.locator('button', { hasText: 'Bonus or deduction' }).click();
        await p.selectOption('[id^="bn-k-"]', 'ded'); await p.fill('[id^="bn-amt-"]', '235.48');
        await ak.locator('button', { hasText: '+ Add a note (optional)' }).click(); await p.fill('[id^="bn-note-"]', 'Broken mirror');
        await ak.locator('.panel button', { hasText: /^Save$/ }).click();
        ok('deduction with a note', (await ak.locator('.bill').innerText()).includes('Taken off: Broken mirror') && (await ak.locator('.b-pay').innerText()) === 'To pay: 22,000');
        ok('month box adds both', (await txt(p, '#mo-pay')) === 'To pay for October: 25,500', await txt(p, '#mo-pay'));

        // currency
        await p.selectOption('#cur', 'Rs');
        ok('currency symbol shown', (await toPay(p)) === 'To pay: Rs 3,500');
        await p.reload({ waitUntil: 'networkidle' });
        ok('currency remembered', (await toPay(p)) === 'To pay: Rs 3,500' && await p.inputValue('#cur') === 'Rs');

        // next day: the page stays open overnight
        await p.clock.fastForward('24:00:00');
        await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
        await p.waitForTimeout(100);
        ok('next day: today line moves to Fri, 23 Oct', (await txt(p, '.item .tb-t')).startsWith('Today, Fri, 23 Oct'), await txt(p, '.item .tb-t'));

        // backup and restore
        const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#backup')]);
        const file = await dl.path(); const bk = JSON.parse(fs.readFileSync(file, 'utf8'));
        ok('backup holds both workers', bk.workers.length === 2 && bk.workers[0].name === 'Rubina');
        await firstBox(p).locator('button', { hasText: /^Delete$/ }).last().click();
        ok('delete a worker', await p.locator('.item').count() === 1);
        await p.click('#add-msg .undo');
        ok('undo the delete', await p.locator('.item').count() === 2);
        await p.click('#del-all');
        ok('delete everything', await p.locator('.item').count() === 0 && await p.locator('#month').isHidden());
        await p.click('#tools-msg .undo');
        ok('undo delete everything', await p.locator('.item').count() === 2);
        await p.click('#del-all');
        await p.setInputFiles('#restore-file', file);
        ok('restore the backup', await p.locator('.item').count() === 2 && (await toPay(p)) === 'To pay: Rs 3,500');
        await p.setInputFiles('#restore-file', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"nope":1}') });
        ok('a wrong file is refused', (await txt(p, '#tools-msg')).includes('not a backup') && await p.locator('.item').count() === 2);
        ok('no console errors in the main run', !p.errors.length && !p.bad.length, p.errors.concat(p.bad));
        await p.context().close();

        // ---------- long-time worker: earlier months settled; leaving with an advance left ----------
        p = await load(b, { width: 390, height: 844 });
        await p.fill('#f-name', 'Shabana'); await p.click('#quick .chip[data-role=""]');
        ok('Other... shows a job box', await p.locator('#f-role-box').isVisible());
        await p.fill('#f-role', 'Carer'); await p.fill('#f-pay', '18000'); await p.fill('#f-start', '2025-01-10');
        await p.click('#f-save');
        ok('old start: nothing owed from before', (await toPay(p)) === 'To pay: 18,000', await toPay(p));
        ok('own job shown', (await txt(p, '.item .tag')) === 'Carer');
        await p.click('#mo-prev');
        ok('earlier month says already paid, no payment buttons', (await toPay(p)) === 'Already paid before this record was started' && await firstBox(p).locator('button', { hasText: 'Record a payment' }).count() === 0);
        await p.click('#mo-today');
        await firstBox(p).locator('button', { hasText: /^Advance$/ }).click();
        await p.fill('[id^="adv-amt-"]', '30000'); await p.selectOption('[id^="adv-n-"]', '3');
        await p.click('text=Save advance');
        ok('30,000 over 3 months: 10,000 now', (await txt(p, '.item .bill')).includes('part 1 of 3, 20,000 still to take back') && (await toPay(p)) === 'To pay: 8,000', await toPay(p));
        await firstBox(p).locator('button', { hasText: /^Edit$/ }).click();
        await p.click('#f-stop-open'); await p.fill('#f-stop', '2026-10-31'); await p.click('#f-save');
        await p.click('#mo-next');
        ok('left with 20,000 of the advance not taken back and October unpaid (8,000): they owe you 2,000', (await toPay(p)) === 'Nothing to pay. They owe you 2,000', await toPay(p));
        await p.context().close();

        // ---------- corrupt and blocked storage ----------
        p = await load(b, { width: 390, height: 844 }, { state: '{not json' });
        ok('corrupt saved data: starts fresh, no errors', await p.locator('.item').count() === 0 && !p.errors.length, p.errors);
        await p.context().close();
        const half = seed(); half.workers.push({ id: 'bad', name: 'X', start: 'never' }); half.workers[0].marks['zzz'] = { k: 'a' }; half.cur = 9;
        p = await load(b, { width: 390, height: 844 }, { state: half });
        ok('partly broken saved data: good workers kept', await p.locator('.item').count() === 3 && !p.errors.length);
        await p.context().close();
        p = await load(b, { width: 390, height: 844 }, { block: true });
        ok('storage blocked: warning shown', await p.locator('#store-warn').isVisible());
        await p.fill('#f-name', 'A'); await p.fill('#f-pay', '100'); await p.click('#f-save');
        ok('storage blocked: still works', await p.locator('.item').count() === 1 && !p.errors.length, p.errors);
        await p.context().close();

        // ---------- the seeded README situation ----------
        p = await load(b, { width: 390, height: 844 }, { state: seed() });
        ok('seeded: Rubina 23,500', (await txt(p, '#item-rubina .b-pay')) === 'To pay: 23,500');
        ok('seeded: Akram 21,935.48 + 3.5 h overtime 700 = 22,635.48', (await txt(p, '#item-akram .b-pay')) === 'To pay: 22,635.48', await txt(p, '#item-akram .b-pay'));
        ok('seeded: Shabana 18,000 - 1 unpaid (600) + 2,000 bonus = 19,400', (await txt(p, '#item-shabana .b-pay')) === 'To pay: 19,400', await txt(p, '#item-shabana .b-pay'));
        ok('seeded: month total 65,535.48', (await txt(p, '#mo-pay')) === 'To pay for October: 65,535.48', await txt(p, '#mo-pay'));
        await p.context().close();

        // ---------- light/dark switch ----------
        p = await load(b, { width: 1280, height: 900 }, { state: seed() });
        const tg = p.locator('.theme-toggle');
        if (await tg.count()) {
            const bg1 = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
            await tg.click();
            const bg2 = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
            ok('theme switch changes the look', bg1 !== bg2 && await p.evaluate(() => document.documentElement.dataset.theme === 'light'));
        } else ok('theme switch present', false);
        await p.context().close();

        // ---------- help dialog ----------
        for (const w of [320, 390, 820, 1280]) {
            p = await load(b, { width: w, height: w < 600 ? 800 : 900 });
            await p.click('.help-btn');
            const d = p.locator('dialog.help'), r = await d.boundingBox();
            ok('help at ' + w + ': opens on screen with a title', await d.evaluate(e => e.open) && r.x >= 0 && r.x + r.width <= w + 1 && (await d.locator('h2').innerText()).includes('Household Help'));
            await p.keyboard.press('Escape');
            const closed1 = !(await d.evaluate(e => e.open));
            await p.click('.help-btn'); await p.click('.help-close');
            ok('help at ' + w + ': Escape and Got it close it', closed1 && !(await d.evaluate(e => e.open)));
            const bars = await p.evaluate(() => [...document.querySelectorAll('.topbar > *, .back')].map(e => e.getBoundingClientRect()).map(r => [r.top, r.bottom, r.left, r.right]));
            let clash = false; for (let i = 0; i < bars.length; i++) for (let j = i + 1; j < bars.length; j++) { const a = bars[i], c = bars[j]; if (Math.min(a[3], c[3]) - Math.max(a[2], c[2]) > 2 && Math.min(a[1], c[1]) - Math.max(a[0], c[0]) > 2 && !(a[2] <= c[2] && a[3] >= c[3])) clash = true; }
            ok('help at ' + w + ': top bar buttons do not overlap', !clash);
            await p.context().close();
        }

        // ---------- screen sizes, filled and cleared, dark and light ----------
        for (const theme of ['dark', 'light']) for (const w of [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920]) {
            for (const filled of [true, false]) {
                p = await load(b, { width: w, height: 900 }, { theme, state: filled ? seed() : undefined });
                const tag = theme + ' ' + w + (filled ? ' filled' : ' empty');
                if (filled) {
                    await p.click('#item-rubina button.day:has(.dn:text-is("19"))');
                    await p.click('#item-akram button.day:has(.dn:text-is("16"))');
                    await p.click('#item-shabana button:has-text("Advance")');
                } else { await p.click('#f-ot-open'); await p.click('#f-open-open'); await p.click('#quick .chip[data-role=""]'); await p.check('#f-wd-0'); await p.click('#f-extra-open'); }
                const sc = await noScroll(p);
                if (!sc) ok(tag + ': no horizontal scroll', false);
                if (w >= 900) for (const pos of [0, .5, 1]) {
                    await p.evaluate(f => window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * f), pos);
                    const o = await overlaps(p); if (o.length) ok(tag + ': no overlap at scroll ' + pos, false, o);
                }
                if (w <= 390) { const c = await controlOverlaps(p); if (c.length) ok(tag + ': controls do not overlap', false, c); }
                if (p.errors.length) ok(tag + ': no errors', false, p.errors);
                await p.context().close();
            }
        }
        ok('screen sizes checked (failures listed above if any)', true);

        // ---------- screenshots ----------
        if (shots) {
            p = await load(b, { width: 1280, height: 1500 }, { state: seed() });
            await p.click('#item-rubina button.day:has(.dn:text-is("19"))');
            await p.screenshot({ path: path.join(__dirname, 'screenshots/desktop.png') });
            await p.context().close();
            p = await load(b, { width: 390, height: 844 }, { state: seed() });
            const y = await p.evaluate(() => document.getElementById('item-rubina').getBoundingClientRect().top + scrollY - 12);
            await p.setViewportSize({ width: 390, height: 1500 });
            await p.evaluate(y => window.scrollTo(0, y), y);
            await p.screenshot({ path: path.join(__dirname, 'screenshots/phone.png') });
            await p.context().close();
        }
    } finally {
        await b.close();
        if (server) server.close();
    }
    console.log(fail ? fail + ' FAILED' : 'ALL UI TESTS PASSED');
    process.exitCode = fail ? 1 : 0;
}
main().catch(e => { console.error(e); process.exitCode = 1; });
