// Drives the real page in headless Chromium: node ui-test.js [--shots] [--base https://umar8092.github.io/apps]
// Without --base it serves this repo on localhost. With --base it tests the LIVE page. The clock is Wed 14 Oct 2026, 10:00.
const pw = (() => { for (const m of ['playwright', 'playwright-core']) { try { return require(m); } catch (e) { /* next */ } } throw new Error('playwright not found'); })();
const path = require('path'), fs = require('fs'), http = require('http');
const bi = process.argv.indexOf('--base');
const shots = process.argv.includes('--shots');
let fail = 0, url;
const ok = (name, cond, extra) => { if (!cond) fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond || extra == null ? '' : '  -> ' + JSON.stringify(extra))); };
const NOW = new Date(2026, 9, 14, 10, 0).getTime();
const KEY = 'money-lent-and-borrowed-tracker.state';

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

// a realistic list: Ali's family, friends and a colleague
function seed() {
    let q = 0; const e = (kind, amount, date, note, due) => Object.assign({ id: 'e' + (++q), kind, amount: amount * 100, date, seq: q, note: note || '' }, due ? { due } : {});
    return { v: 1, cur: 'Rs', sort: 'owed', seq: 20, people: [
        { id: 'p1', name: 'Bilal', cur: null, entries: [e('lent', 5000, '2026-10-03', 'for the rent', '2026-10-31'), e('repaid', 1500, '2026-10-10')] },
        { id: 'p2', name: 'Sara (sister)', cur: null, entries: [e('borrowed', 2000, '2026-10-01', 'car repair')] },
        { id: 'p3', name: 'Hamza from work', cur: null, entries: [e('lent', 400, '2026-09-22', 'lunch'), e('lent', 800, '2026-09-29', 'taxi', '2026-10-09')] },
        { id: 'p4', name: 'Uncle Tariq', cur: null, entries: [e('lent', 10000, '2026-08-01'), e('repaid', 10000, '2026-09-15')] }
    ] };
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
const box = (p, name) => p.locator('.person', { has: p.locator('.p-name', { hasText: new RegExp('^' + name.replace(/[()]/g, '\\$&') + '$') }) });
async function add(p, who, kind, amount, extra = {}) {
    await p.fill('#who', who);
    await p.check('input[name=kind][value=' + kind + ']');
    await p.fill('#amount', String(amount));
    if (extra.date) { if (await p.isVisible('#date-open')) await p.click('#date-open'); await p.fill('#date', extra.date); }
    if (extra.due) { await p.click('#due-open'); await p.fill('#due', extra.due); }
    if (extra.note) { await p.click('#note-open'); await p.fill('#note', extra.note); }
    await p.click('#save');
}
const noScroll = p => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
const overlaps = p => p.evaluate(() => {
    const els = [...document.querySelectorAll('input:not([type=radio]):not([type=file]), select, button, textarea, .kind span, a.secondary')].filter(e => e.offsetParent && e.getClientRects().length && e.checkVisibility());
    const r = els.map(e => e.getBoundingClientRect()), bad = [];
    for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) {
        if (els[i].contains(els[j]) || els[j].contains(els[i])) continue;
        const x = Math.min(r[i].right, r[j].right) - Math.max(r[i].left, r[j].left), y = Math.min(r[i].bottom, r[j].bottom) - Math.max(r[i].top, r[j].top);
        if (x > 1 && y > 1) bad.push((els[i].id || els[i].textContent.trim().slice(0, 20)) + ' / ' + (els[j].id || els[j].textContent.trim().slice(0, 20)));
    }
    return bad;
});
const placeholdersFit = p => p.evaluate(() => [...document.querySelectorAll('input[placeholder]')].filter(i => i.offsetParent).filter(i => {
    const c = document.createElement('canvas').getContext('2d'), s = getComputedStyle(i); c.font = s.fontWeight + ' ' + s.fontSize + ' ' + s.fontFamily;
    return c.measureText(i.placeholder).width > i.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight) + 1;
}).map(i => i.id));

(async () => {
    let srv;
    if (bi > 0) url = process.argv[bi + 1].replace(/\/$/, '') + '/money-lent-and-borrowed-tracker/';
    else { srv = await serve(); url = 'http://localhost:' + srv.address().port + '/apps/money-lent-and-borrowed-tracker/'; }
    const b = await pw.chromium.launch();
    const phone = { width: 390, height: 844 }, desk = { width: 1280, height: 900 };

    // 1. first use, empty state, the main situation end to end
    let p = await load(b, phone);
    ok('empty: message shown', /Nobody here yet/.test(await txt(p, '#empty')));
    ok('empty: totals are 0', (await txt(p, '#t-tome')) === '0' && (await txt(p, '#t-iowe')) === '0');
    ok('optional fields hidden at start', !(await p.isVisible('#due')) && !(await p.isVisible('#note')) && !(await p.isVisible('#date')));
    await p.click('#save');
    ok('blank: name and amount errors', /name/.test(await txt(p, '#who-err')) && /amount/.test(await txt(p, '#amount-err')));
    await p.fill('#who', 'Bilal');
    ok('new person note', /New person: Bilal/.test(await txt(p, '#who-note')));
    await p.fill('#amount', '5,000');
    ok('preview before saving', (await txt(p, '#preview')) === 'After this: Bilal owes you 5,000.');
    await p.click('#due-open'); await p.fill('#due', '2026-10-31');
    await p.click('#note-open'); await p.fill('#note', 'for the rent');
    await p.click('#date-open'); await p.fill('#date', '2026-10-03');
    await p.click('#save');
    ok('saved message', /Saved: You lent Bilal 5,000 on 3 Oct\. Bilal owes you 5,000\. Bilal now has their own box\./.test(await txt(p, '#add-msg')), await txt(p, '#add-msg'));
    ok('form cleared, optional fields closed', (await p.inputValue('#amount')) === '' && (await p.inputValue('#who')) === '' && !(await p.isVisible('#due')));
    ok('Bilal box', (await txt(p, '.person .p-bal')) === 'Owes you 5,000' && /31 Oct \(17 days left\)/.test(await txt(p, '.person .p-due')));
    // part repayment on an earlier day, typed name in other case
    await p.fill('#who', 'bilal');
    ok('existing person note', (await txt(p, '#who-note')) === 'Bilal owes you 5,000.');
    await p.check('input[name=kind][value=repaid]');
    ok('Paid back in full offered', /Paid back in full \(5,000\)/.test(await txt(p, '#all-back')));
    await p.fill('#amount', '1500'); await p.click('#date-open'); await p.fill('#date', '2026-10-10');
    ok('due-date hidden for pay-backs', !(await p.isVisible('#due-open')));
    await p.click('#save');
    ok('part repayment', (await txt(p, '.person .p-bal')) === 'Owes you 3,500', await txt(p, '.person .p-bal'));
    ok('only one Bilal box', (await p.locator('.person').count()) === 1);
    ok('totals after repayment', (await txt(p, '#t-tome')) === '3,500' && (await txt(p, '#t-tome-n')) === 'from 1 person');
    // borrowed from someone else
    await add(p, 'Sara', 'borrowed', '2000');
    ok('you owe Sara', (await txt(p, '#t-iowe')) === '2,000' && (await txt(p, '#people')).includes('Sara You owe 2,000'));
    // undo the last save
    await p.click('#add-msg .undo');
    ok('undo removes Sara', !(/Sara/.test(await txt(p, '#people'))) && (await txt(p, '#add-msg')) === 'Undone.');
    await add(p, 'Sara', 'borrowed', '2000');
    // reminder message
    await box(p, 'Bilal').locator('button', { hasText: 'Reminder message' }).click();
    const rem = await p.inputValue('.panel textarea');
    ok('reminder text', rem === 'Hi Bilal, just a friendly reminder about the 3,500 you still owe me (5,000 I lent you on 3 Oct (for the rent), 1,500 you paid back on 10 Oct). Could you pay it back by 31 Oct? Thanks!', rem);
    await p.click('.panel button:has-text("Copy")');
    ok('reminder copied', (await p.evaluate(() => navigator.clipboard.readText())) === rem);
    const href = await p.getAttribute('.panel a:has-text("Email")', 'href');
    ok('email link with no address', href.startsWith('mailto:?subject=Money%20reminder&body=Hi%20Bilal'));
    // history: edit and delete with undo
    await box(p, 'Bilal').locator('button', { hasText: 'History (2)' }).click();
    ok('history rows', (await p.locator('.h-row').count()) === 2 && /After this: owes you 3,500/.test(await txt(p, '.hist')));
    await p.locator('.h-row').nth(1).locator('button', { hasText: 'Edit' }).click();
    await p.fill('#ed-amount', '2000'); await p.keyboard.press('Enter');
    ok('edit saved', (await txt(p, '#list-msg')).startsWith('Saved the change. Bilal owes you 3,000.'));
    await p.locator('.h-row').nth(1).locator('button', { hasText: 'Edit' }).click();
    await p.fill('#ed-amount', '-4'); await p.locator('.h-edit button', { hasText: 'Save' }).click();
    ok('edit refuses negative', /minus/.test(await txt(p, '.h-edit')));
    await p.keyboard.press('Escape');
    ok('Escape cancels edit', (await p.locator('.h-edit').count()) === 0 && /Owes you 3,000/.test(await txt(p, '#people')));
    await p.locator('.h-row').nth(1).locator('button', { hasText: 'Delete' }).click();
    ok('delete entry', /Bilal owes you 5,000/.test(await txt(p, '#list-msg')));
    await p.click('#list-msg .undo');
    ok('undo delete entry', /Bilal Owes you 3,000/.test(await txt(p, '#people')));
    // over-payment flips the box
    await add(p, 'Sara', 'paid', '2500');
    ok('over-payment message', /500 more than you owed, so now Sara owes you 500/.test(await txt(p, '#add-msg')), await txt(p, '#add-msg'));
    await p.click('#add-msg .undo');
    // paid back in full from the box, settled list
    await box(p, 'Sara').locator('button', { hasText: 'Paid back in full' }).click();
    ok('paid in full message', /you paid Sara back 2,000 today\. You and Sara are settled up\./.test(await txt(p, '#list-msg')));
    ok('Sara moved to settled', (await txt(p, '#settled-sum')) === 'Settled up (1)' && (await txt(p, '#t-iowe')) === '0');
    await p.click('#list-msg .undo');
    ok('undo paid in full', (await txt(p, '#t-iowe')) === '2,000');
    // rename and duplicate name
    await box(p, 'Sara').locator('button', { hasText: 'Change name or currency' }).click();
    await p.fill('#pe-name', 'BILAL'); await p.locator('.panel button', { hasText: 'Save' }).click();
    ok('duplicate name refused', /already someone called Bilal/.test(await txt(p, '.panel')));
    await p.fill('#pe-name', 'Sara (sister)'); await p.selectOption('#pe-cur', '£'); await p.locator('.panel button', { hasText: 'Save' }).click();
    ok('renamed with own currency', (await txt(p, '#people')).includes('Sara (sister) You owe £2,000') && /£2,000/.test(await txt(p, '#t-iowe')));
    // app currency
    await p.selectOption('#cur', 'Rs');
    ok('currency symbol everywhere', (await txt(p, '#t-tome')) === 'Rs 3,000' && (await txt(p, '#cur-tag')) === 'Rs');
    await p.fill('#who', 'Bilal');
    ok('currency tag beside amount', (await txt(p, '#cur-tag')) === 'Rs');
    await p.fill('#who', '');
    // odd inputs
    const tries = [['fifty', /number/], ['0', /more than 0/], ['12.345', null], ['10000000000', /too big/], ['1,2,3', /mistyped/], ['12.5', null]];
    await p.check('input[name=kind][value=lent]');
    for (const [v, re] of tries) {
        await p.fill('#who', 'Test'); await p.fill('#amount', v); await p.click('#save');
        const e = await txt(p, '#amount-err');
        ok('amount "' + v + '"', re ? re.test(e) : e === '', e);
        if (!re) await p.click('#add-msg .undo');
    }
    await p.fill('#amount', '5'); await p.click('#date-open'); await p.fill('#date', '2026-10-20'); await p.click('#save');
    ok('future date refused', /future/.test(await txt(p, '#date-err')));
    await p.fill('#date', '2026-10-05'); await p.click('#due-open'); await p.fill('#due', '2026-10-01'); await p.click('#save');
    ok('due before date refused', /cannot be before/.test(await txt(p, '#due-err')));
    await p.click('#due-clear'); await p.click('#date-today');
    await p.fill('#who', '<img src=x onerror=alert(1)>'); await p.fill('#amount', '1'); await p.click('#save');
    ok('typed HTML shown as text', (await p.locator('.p-name', { hasText: '<img' }).count()) === 1 && (await p.locator('.person img').count()) === 0);
    await p.click('#add-msg .undo');
    const long = 'A very long name that goes on and on and on for ever and ever more';
    await add(p, long, 'lent', '10');
    ok('long name cut to 60 and wraps', (await p.locator('.p-name', { hasText: long.slice(0, 60) }).count()) === 1 && await noScroll(p));
    await p.click('#add-msg .undo');
    // copy the whole list
    await p.click('#copy-all');
    const all = await p.evaluate(() => navigator.clipboard.readText());
    ok('copy the list', /^Money lent and borrowed, 14 Oct 2026\nOwed to you: Rs 3,000 from 1 person\nYou owe: £2,000 to 1 person/.test(all.replace(/ /g, ' ')), all);
    // reload keeps everything
    await p.reload({ waitUntil: 'networkidle' });
    ok('reload keeps state', /Bilal Owes you Rs 3,000/.test((await txt(p, '#people')).replace(/ /g, ' ')) && (await p.inputValue('#cur')) === 'Rs');
    // delete person with undo, wipe with undo
    await box(p, 'Bilal').locator('button', { hasText: 'Delete person' }).click();
    ok('delete person', /Deleted Bilal and 2 entries/.test(await txt(p, '#list-msg')));
    await p.click('#list-msg .undo');
    ok('undo delete person', (await p.locator('.person').count()) === 2);
    await p.click('#wipe');
    ok('delete everything', (await p.locator('.person').count()) === 0 && /Nobody here yet/.test(await txt(p, '#empty')) && (await p.inputValue('#cur')) === 'Rs');
    await p.click('#tools-msg .undo');
    ok('undo delete everything', (await p.locator('.person').count()) === 2);
    // backup and restore
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#backup')]);
    const file = await dl.path();
    const backup = JSON.parse(fs.readFileSync(file, 'utf8'));
    ok('backup file', dl.suggestedFilename() === 'money-lent-and-borrowed-backup-2026-10-14.json' && backup.people.length === 2);
    await p.click('#wipe');
    await p.setInputFiles('#restore-file', file);
    await p.waitForFunction(() => /Restored/.test(document.getElementById('tools-msg').textContent));
    ok('restore', (await p.locator('.person').count()) === 2 && (await txt(p, '#tools-msg')).startsWith('Restored 2 people and ' + backup.people.reduce((a, x) => a + x.entries.length, 0) + ' entries'));
    await p.setInputFiles('#restore-file', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"nope":1}') });
    await p.waitForFunction(() => /not a backup/.test(document.getElementById('tools-msg').textContent));
    ok('bad backup refused, nothing changed', (await p.locator('.person').count()) === 2);
    // keyboard only: Enter saves from the amount box
    await p.fill('#who', 'Keyboard'); await p.fill('#amount', '7'); await p.focus('#amount'); await p.keyboard.press('Enter');
    ok('Enter saves', /Keyboard owes you Rs 7/.test((await txt(p, '#add-msg')).replace(/ /g, ' ')));
    ok('no console errors (main run)', !p.errors.length && !p.bad.length, p.errors.concat(p.bad));
    await p.context().close();

    // 2. seeded list: late dates, settled group, sorting, find
    p = await load(b, phone, { state: seed() });
    ok('late line', /Past the pay-back-by date: Hamza from work \(5 days late\)\./.test(await txt(p, '#t-late')), await txt(p, '#t-late'));
    ok('totals seeded', (await txt(p, '#t-tome')).replace(/ /g, ' ') === 'Rs 4,700' && (await txt(p, '#t-tome-n')) === 'from 2 people');
    ok('settled group', (await txt(p, '#settled-sum')) === 'Settled up (1)' && !(await p.isVisible('#settled .person')));
    ok('order most owed', (await p.locator('#people .p-name').allTextContents()).join('|') === 'Bilal|Sara (sister)|Hamza from work');
    await p.selectOption('#sort', 'name');
    ok('sort by name', (await p.locator('#people .p-name').allTextContents()).join('|') === 'Bilal|Hamza from work|Sara (sister)');
    ok('find hidden under 6 people', !(await p.isVisible('#find')));
    await box(p, 'Hamza from work').locator('button', { hasText: 'Reminder message' }).click();
    ok('late reminder', /It was due back on 9 Oct\./.test(await p.inputValue('.panel textarea')));
    await box(p, 'Bilal').locator('button', { hasText: 'Add for Bilal' }).click();
    ok('Add for fills name', (await p.inputValue('#who')) === 'Bilal' && await p.evaluate(() => document.activeElement.id === 'amount'));
    // midnight rollover moves "days late"
    await p.clock.fastForward(16 * 3600 * 1000);
    await p.waitForTimeout(100);
    ok('midnight rollover', /6 days late/.test(await txt(p, '#t-late')), await txt(p, '#t-late'));
    await p.context().close();

    // 3. corrupt and blocked storage
    p = await load(b, phone, { state: '{not json' });
    ok('corrupt storage starts fresh', /Nobody here yet/.test(await txt(p, '#empty')) && !p.errors.length, p.errors);
    await p.context().close();
    p = await load(b, phone, { state: JSON.stringify({ people: [{ name: 'Ok', entries: [{ kind: 'lent', amount: 'x', date: 'y' }, { kind: 'lent', amount: 100, date: '2026-10-01' }] }, 5, { name: null }] }) });
    ok('half-bad storage keeps good parts', (await p.locator('.person').count()) === 1 && /Ok Owes you 1/.test(await txt(p, '#people')));
    await p.context().close();
    p = await load(b, phone, { block: true });
    ok('blocked storage notice', /not letting the app save/.test(await txt(p, '#add-msg')));
    await add(p, 'Ali', 'lent', '100');
    ok('works with blocked storage', /Ali Owes you 100/.test(await txt(p, '#people')) && !p.errors.length, p.errors);
    await p.context().close();

    // 4. many people: find box
    const many = seed(); for (let i = 0; i < 4; i++) many.people.push({ id: 'm' + i, name: 'Friend ' + i, cur: null, entries: [{ id: 'm' + i, kind: 'lent', amount: 100, date: '2026-10-01', seq: 30 + i }] });
    p = await load(b, phone, { state: many });
    ok('find shown with 6+ people', await p.isVisible('#find'));
    await p.fill('#find', 'friend 2');
    ok('find narrows', (await p.locator('.person:visible').count()) === 1);
    await p.fill('#find', 'zzz');
    ok('find no match', /Nobody matches "zzz"/.test(await txt(p, '#empty')));
    await p.context().close();

    // 5. layouts: every width, both themes, filled and empty, panels open
    for (const theme of ['dark', 'light']) for (const w of [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920]) {
        for (const st of [seed(), undefined]) {
            p = await load(b, { width: w, height: 900 }, { theme, state: st });
            if (st) {
                await p.fill('#who', 'Bilal'); await p.fill('#amount', '1000');
                await p.click('#due-open'); await p.click('#note-open'); await p.click('#date-open');
                await box(p, 'Bilal').locator('button', { hasText: 'History' }).click();
                await p.locator('.h-row').first().locator('button', { hasText: 'Edit' }).click();
            }
            const tag = theme + ' ' + w + (st ? ' filled' : ' empty');
            ok(tag + ': no horizontal scroll', await noScroll(p));
            if (w <= 390) { const o = await overlaps(p); ok(tag + ': controls do not overlap', !o.length, o); const pf = await placeholdersFit(p); ok(tag + ': placeholders fit', !pf.length, pf); }
            if (st && w <= 390) {
                await box(p, 'Hamza from work').locator('button', { hasText: 'Reminder message' }).click();
                await box(p, 'Sara (sister)').locator('button', { hasText: 'Change name or currency' }).click();
                const o = await overlaps(p); ok(tag + ': name panel does not overlap', !o.length, o);
            }
            if (w >= 900) {
                for (const pos of [0, .5, 1]) {
                    await p.evaluate(y => scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * y), pos);
                    const bad = await p.evaluate(() => { const kids = [...document.querySelectorAll('.app > *')].filter(e => e.offsetParent && getComputedStyle(e).display !== 'contents').map(e => [e, e.getBoundingClientRect()]), out = [];
                        for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) { const a = kids[i][1], c = kids[j][1]; if (Math.min(a.right, c.right) - Math.max(a.left, c.left) > 1 && Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top) > 1) out.push(kids[i][0].className + '/' + kids[j][0].className); } return out; });
                    ok(tag + ': no overlap at scroll ' + pos, !bad.length, bad);
                }
            }
            if (w === 1280 && st) { const two = await p.evaluate(() => { const a = document.querySelector('.add').getBoundingClientRect(), l = document.getElementById('list').getBoundingClientRect(); return l.left > a.right && Math.abs(l.top - a.top) < 5; }); ok(tag + ': form and people side by side', two); }
            if (theme === 'dark' && st && w === 390) {
                await p.click('.theme-toggle');
                ok('theme switch to light', (await p.evaluate(() => document.documentElement.dataset.theme)) === 'light');
            }
            ok(tag + ': no console errors', !p.errors.length, p.errors);
            await p.context().close();
        }
    }

    // 6. help dialog
    for (const w of [320, 390, 820, 1280]) {
        p = await load(b, { width: w, height: 800 });
        await p.click('.help-btn');
        const r = await p.locator('dialog.help').boundingBox();
        ok('help ' + w + ' opens on screen', r && r.x >= 0 && r.y >= 0 && r.x + r.width <= w + 1 && /How to use Money Lent and Borrowed Tracker/.test(await txt(p, 'dialog.help h2')));
        await p.keyboard.press('Escape'); ok('help ' + w + ' Escape closes', !(await p.evaluate(() => document.querySelector('dialog.help').open)));
        await p.click('.help-btn'); await p.click('.help-close'); ok('help ' + w + ' Got it closes', !(await p.evaluate(() => document.querySelector('dialog.help').open)));
        const tb = await p.evaluate(() => [...document.querySelectorAll('.topbar > *')].map(e => e.getBoundingClientRect()).map(r => [r.top, r.bottom]));
        ok('help ' + w + ' top bar on one line', tb.every(x => Math.abs(x[0] - tb[0][0]) < 4));
        await p.context().close();
    }

    // 7. screenshots of the real situation
    if (shots) {
        const dir = path.join(__dirname, 'screenshots');
        p = await load(b, desk, { state: seed() });
        await p.setViewportSize({ width: 1280, height: 1080 });
        await p.fill('#who', 'Bilal'); await p.check('input[name=kind][value=repaid]'); await p.fill('#amount', '1000');
        await p.evaluate(() => { document.activeElement.blur(); scrollTo(0, 0); });
        await p.screenshot({ path: path.join(dir, 'desktop.png') });
        await p.context().close();
        p = await load(b, phone, { state: seed() });
        await p.evaluate(() => scrollTo(0, document.getElementById('list').getBoundingClientRect().top + scrollY - 12));
        await p.screenshot({ path: path.join(dir, 'phone.png') });
        await p.context().close();
    }

    await b.close(); if (srv) srv.close();
    console.log(fail ? fail + ' FAILED' : 'ALL UI TESTS PASSED');
    process.exitCode = fail ? 1 : 0;
})();
