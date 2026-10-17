// Drives the real page in headless Chromium: node ui-test.js [--shots] [--base https://umar8092.github.io/apps]
// Without --base it serves this repo on localhost. With --base it tests the LIVE page. The clock is Sat 17 Oct 2026, 10:00.
const pw = (() => { for (const m of ['playwright', 'playwright-core']) { try { return require(m); } catch (e) { /* next */ } } throw new Error('playwright not found'); })();
const path = require('path'), fs = require('fs'), http = require('http');
const bi = process.argv.indexOf('--base');
const shots = process.argv.includes('--shots');
let fail = 0, url;
const ok = (name, cond, extra) => { if (!cond) fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond || extra == null ? '' : '  -> ' + JSON.stringify(extra))); };
const NOW = new Date(2026, 9, 17, 10, 0).getTime();
const KEY = 'pocket-money-and-chores-tracker-for-kids.state';

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

// a realistic family: Ali (9) gets 5 every Saturday, Sara (12) gets 20 on the 1st of the month and saves for a bike
function seed() {
    let q = 0; const e = (kind, amount, date, note, choreId) => Object.assign({ id: 'e' + (++q), kind, amount: Math.round(amount * 100), date, seq: q, note: note || '' }, choreId ? { choreId } : {});
    return { v: 1, cur: '£', seq: 100, kids: [
        { id: 'ka', name: 'Ali', allowance: 500, sched: { freq: 'week', start: '2026-10-03' }, paidThrough: '2026-10-10', goal: { name: 'Lego set', amount: 3000 },
          chores: [{ id: 'c1', name: 'Tidy your room', value: 50 }, { id: 'c2', name: 'Wash the car', value: 200 }, { id: 'c3', name: 'Make your bed', value: 0 }, { id: 'c4', name: 'Feed the cat', value: 25 }],
          log: [e('pay', 5, '2026-10-03'), e('pay', 5, '2026-10-10'), e('chore', 0.5, '2026-10-12', 'Tidy your room', 'c1'), e('chore', 2, '2026-10-14', 'Wash the car', 'c2'), e('out', 3.5, '2026-10-15', 'Football stickers'), e('chore', 0.25, '2026-10-16', 'Feed the cat', 'c4')] },
        { id: 'ks', name: 'Sara', allowance: 2000, sched: { freq: 'month', start: '2026-09-01' }, paidThrough: '2026-10-01', goal: { name: 'New bike', amount: 12000 },
          chores: [{ id: 'c5', name: 'Wash the dishes', value: 100 }, { id: 'c6', name: 'Help with the shopping', value: 150 }],
          log: [e('pay', 20, '2026-09-01'), e('in', 25, '2026-09-20', 'Birthday money from Grandma'), e('pay', 20, '2026-10-01'), e('chore', 1, '2026-10-05', 'Wash the dishes', 'c5'), e('chore', 1.5, '2026-10-11', 'Help with the shopping', 'c6'), e('chore', 1, '2026-10-13', 'Wash the dishes', 'c5')] }
    ] };
}

async function load(b, vp, opt = {}) {
    const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: vp.width < 500 ? 2 : 1, colorScheme: opt.theme || 'dark', locale: opt.locale === null ? undefined : 'en-GB',
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
const kid = name => `section.kid:has(h2:text-is("${name}"))`;
const bal = (p, name) => txt(p, kid(name) + ' .bal-num');

// no input, select or button overlapping another, and nothing wider than the page
async function layoutOK(p, label) {
    const r = await p.evaluate(() => {
        const vis = e => { const s = getComputedStyle(e); const b = e.getBoundingClientRect(); return s.visibility !== 'hidden' && s.display !== 'none' && b.width > 0 && b.height > 0; };
        const els = [...document.querySelectorAll('main input:not([type=radio]):not([type=file]), main select, main button, main a.secondary, main .seg label')].filter(vis);
        const boxes = els.map(e => ({ e, b: e.getBoundingClientRect() }));
        const over = [];
        for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
            const a = boxes[i], c = boxes[j];
            if (a.e.contains(c.e) || c.e.contains(a.e)) continue;
            const x = Math.min(a.b.right, c.b.right) - Math.max(a.b.left, c.b.left), y = Math.min(a.b.bottom, c.b.bottom) - Math.max(a.b.top, c.b.top);
            if (x > 1 && y > 1) over.push((a.e.id || a.e.textContent.trim().slice(0, 20)) + ' / ' + (c.e.id || c.e.textContent.trim().slice(0, 20)));
        }
        const wide = document.documentElement.scrollWidth > window.innerWidth;
        const out = [...document.querySelectorAll('main *')].filter(vis).filter(e => e.getBoundingClientRect().right > window.innerWidth + 1).map(e => e.className || e.tagName).slice(0, 5);
        // placeholders must fit their box
        const cut = [...document.querySelectorAll('main input[placeholder]')].filter(vis).filter(i => {
            const c = document.createElement('canvas').getContext('2d'), s = getComputedStyle(i); c.font = s.fontSize + ' ' + s.fontFamily;
            return c.measureText(i.placeholder).width > i.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight) + 1;
        }).map(i => i.id);
        return { over, wide, out, cut };
    });
    ok(label + ': no overlapping controls, no sideways scroll, placeholders fit', !r.over.length && !r.wide && !r.out.length && !r.cut.length, r);
}

async function run() {
    let server;
    if (bi >= 0) url = process.argv[bi + 1].replace(/\/$/, '') + '/pocket-money-and-chores-tracker-for-kids/';
    else { server = await serve(); url = 'http://localhost:' + server.address().port + '/pocket-money-and-chores-tracker-for-kids/'; }
    const b = await pw.chromium.launch();
    const phone = { width: 390, height: 844 }, desk = { width: 1280, height: 900 };

    // ---- 1. first use: empty state ----
    let p = await load(b, phone);
    ok('first use: the add form is open', await p.isVisible('#add-form') && await txt(p, '#add-h') === 'Add a child');
    ok('first use: no share card yet', !(await p.isVisible('#settings')));
    ok('first use: first payday defaults to today', await p.inputValue('#a-start') === '2026-10-17');
    await p.fill('#a-name', 'Ali');
    ok('preview with no pocket money (optional field not forced)', await txt(p, '#a-preview') === 'Ali earns money from chores only.');
    await p.fill('#a-pay', '5');
    ok('preview with pocket money today', await txt(p, '#a-preview') === 'Ali gets 5 every Saturday. First payday is today: 5 is added now.', await txt(p, '#a-preview'));
    await p.fill('#a-start', '2026-10-24');
    ok('preview with a future payday', await txt(p, '#a-preview') === 'Ali gets 5 every Saturday. First payday: Sat 24 Oct (in 7 days).');
    await p.fill('#a-start', '2026-10-03');
    ok('preview with paydays in the past (catch up)', await txt(p, '#a-preview') === 'Ali gets 5 every Saturday. 3 paydays from Sat 3 Oct to today are added now: 15.', await txt(p, '#a-preview'));
    await p.selectOption('#a-freq', 'month');
    ok('preview monthly', (await txt(p, '#a-preview')).startsWith('Ali gets 5 on the 3rd of every month.'));
    await p.selectOption('#a-freq', 'week'); await p.fill('#a-start', '2026-10-17');
    // errors
    await p.fill('#a-name', '  '); await p.click('#a-save');
    ok('blank name refused', await txt(p, '#e-a-name') === "Type the child's name.");
    await p.fill('#a-name', 'Ali'); await p.fill('#a-pay', '-5'); await p.click('#a-save');
    ok('negative pocket money refused', await txt(p, '#e-a-pay') === 'Type the amount without a minus sign.');
    await p.fill('#a-pay', 'five'); await p.click('#a-save');
    ok('words refused', (await txt(p, '#e-a-pay')).startsWith('Type a number'));
    await p.fill('#a-pay', '5'); await p.click('#a-save');
    ok('child added with pocket money today', await bal(p, 'Ali') === '5', await bal(p, 'Ali'));
    ok('added message', (await txt(p, '#top-msg')).startsWith('Ali added. Added 5 pocket money for Ali (Sat 17 Oct).'), await txt(p, '#top-msg'));
    ok('chore form opens next with focus in it', await p.evaluate(() => document.activeElement && document.activeElement.id.endsWith('-name')) && await p.isVisible(kid('Ali') + ' .panel'));
    ok('pocket money line', (await txt(p, kid('Ali') + ' .facts')).includes('Pocket money: 5 every Saturday. Next: Sat 24 Oct.'));

    // ---- 2. chores ----
    await p.click(kid('Ali') + ' .chip:text-is("Tidy your room")');
    ok('example chip fills the name', (await p.inputValue(kid('Ali') + ' input[id$="-name"]')) === 'Tidy your room');
    await p.fill(kid('Ali') + ' input[id$="-value"]', '0.50'); await p.click(kid('Ali') + ' button:text-is("Add chore")');
    ok('chore added and form stays for the next', (await txt(p, kid('Ali') + ' .chores')).includes('Tidy your room Pays 0.50') && await p.isVisible(kid('Ali') + ' .panel'));
    await p.fill(kid('Ali') + ' input[id$="-name"]', 'tidy your room'); await p.click(kid('Ali') + ' button:text-is("Add chore")');
    ok('same chore twice refused', (await txt(p, kid('Ali') + ' .panel .err')).includes('already has this chore'));
    await p.fill(kid('Ali') + ' input[id$="-name"]', 'Make your bed'); await p.fill(kid('Ali') + ' input[id$="-value"]', ''); await p.click(kid('Ali') + ' button:text-is("Add chore")');
    ok('chore with no pay (empty pay allowed)', (await txt(p, kid('Ali') + ' .chores')).includes('Make your bed No pay'));
    await p.fill(kid('Ali') + ' input[id$="-name"]', 'Wash the car'); await p.fill(kid('Ali') + ' input[id$="-value"]', '-2'); await p.click(kid('Ali') + ' button:text-is("Add chore")');
    ok('negative chore pay refused', (await txt(p, kid('Ali') + ' .panel')).includes('without a minus sign'));
    await p.fill(kid('Ali') + ' input[id$="-value"]', '2'); await p.click(kid('Ali') + ' button:text-is("Add chore")');
    await p.keyboard.press('Escape');
    ok('Escape closes the form', !(await p.isVisible(kid('Ali') + ' .panel')));
    await p.click(kid('Ali') + ' button[aria-label="Done: Tidy your room"]');
    ok('Done adds the pay', await bal(p, 'Ali') === '5.50' && (await txt(p, kid('Ali') + ' .msg')).startsWith('Tidy your room: done, 0.50 added.'));
    ok('focus stays on the Done button', await p.evaluate(() => document.activeElement.getAttribute('aria-label')) === 'Done: Tidy your room');
    await p.click(kid('Ali') + ' button[aria-label="Done: Tidy your room"]');
    ok('done twice in a day', await bal(p, 'Ali') === '6' && (await txt(p, kid('Ali') + ' .chores')).includes('Done 2 times today'));
    await p.click(kid('Ali') + ' .msg .undo');
    ok('undo a Done', await bal(p, 'Ali') === '5.50' && (await txt(p, kid('Ali') + ' .chores')).includes('Done today'));
    await p.click(kid('Ali') + ' button[aria-label="Done: Make your bed"]');
    ok('no-pay chore ticked without money', await bal(p, 'Ali') === '5.50' && (await txt(p, kid('Ali') + ' .msg')) === 'Make your bed: done. Undo');
    ok('since payday line', (await txt(p, kid('Ali') + ' .facts')).includes('Since payday (Sat 17 Oct): 2 chores done, earned 0.50.'));
    // edit and delete a chore
    await p.click(kid('Ali') + ' button[aria-label="Edit chore: Wash the car"]');
    await p.fill(kid('Ali') + ' input[id$="-value"]', '3'); await p.click(kid('Ali') + ' button:text-is("Save chore")');
    ok('chore pay edited', (await txt(p, kid('Ali') + ' .chores')).includes('Wash the car Pays 3'));
    await p.click(kid('Ali') + ' button[aria-label="Edit chore: Wash the car"]'); await p.click(kid('Ali') + ' button:text-is("Delete this chore")');
    ok('chore deleted', !(await txt(p, kid('Ali') + ' .chores')).includes('Wash the car'));
    await p.click(kid('Ali') + ' .msg .undo');
    ok('chore delete undone', (await txt(p, kid('Ali') + ' .chores')).includes('Wash the car'));

    // ---- 3. money out and in ----
    await p.click(kid('Ali') + ' button:text-is("Take money out")');
    ok('take out shows what they have', (await txt(p, kid('Ali') + ' .panel')).includes('Ali has 5.50 to take out.'));
    await p.fill(kid('Ali') + ' input[id$="-amount"]', '6'); await p.click(kid('Ali') + ' .panel button[type=submit]');
    ok('taking out more than they have is refused', (await txt(p, kid('Ali') + ' .panel .err')).includes('The most you can take out is 5.50.'));
    await p.fill(kid('Ali') + ' input[id$="-amount"]', '2'); await p.click(kid('Ali') + ' .panel button[type=submit]');
    ok('take out without a note (optional)', await bal(p, 'Ali') === '3.50' && (await txt(p, kid('Ali') + ' .msg')).startsWith('2 taken out. Ali has 3.50.'));
    await p.click(kid('Ali') + ' button:text-is("Add money")');
    await p.fill(kid('Ali') + ' input[id$="-amount"]', '10'); await p.fill(kid('Ali') + ' input[id$="-note"]', 'Eid money from Grandma');
    await p.fill(kid('Ali') + ' input[type=date]', '2026-10-18'); await p.click(kid('Ali') + ' .panel button[type=submit]');
    ok('future date refused', (await txt(p, kid('Ali') + ' .panel')).includes('That date has not come yet.'));
    await p.fill(kid('Ali') + ' input[type=date]', '2026-10-16'); await p.fill(kid('Ali') + ' input[id$="-amount"]', '0'); await p.click(kid('Ali') + ' .panel button[type=submit]');
    ok('zero refused', (await txt(p, kid('Ali') + ' .panel')).includes('Type an amount more than 0.'));
    await p.fill(kid('Ali') + ' input[id$="-amount"]', '10'); await p.click(kid('Ali') + ' .panel button[type=submit]');
    ok('money added for an earlier day', await bal(p, 'Ali') === '13.50' && (await txt(p, kid('Ali') + ' .msg')).includes('(Eid money from Grandma)'));
    // switching Add/Take inside the form
    await p.click(kid('Ali') + ' button:text-is("Add money")');
    await p.check(kid('Ali') + ' input[value=out]');
    ok('switch to take out in the form', (await txt(p, kid('Ali') + ' .panel-h')) === 'Take money out' && (await p.isVisible(kid('Ali') + ' .panel button:text-is("Take out")')));
    await p.click(kid('Ali') + ' .panel button:text-is("Cancel")');

    // ---- 4. goal ----
    await p.click(kid('Ali') + ' button:text-is("+ Set a savings goal")');
    await p.click(kid('Ali') + ' button:text-is("Save goal")');
    ok('goal needs a name and price', (await txt(p, kid('Ali') + ' .panel')).includes('Type what they are saving for') && (await txt(p, kid('Ali') + ' .panel')).includes('Type the amount'));
    await p.fill(kid('Ali') + ' input[id$="-name"]', 'Lego set'); await p.fill(kid('Ali') + ' input[id$="-amount"]', '30'); await p.click(kid('Ali') + ' button:text-is("Save goal")');
    ok('goal shows saved, to go and paydays', (await txt(p, kid('Ali') + ' .goal')).includes('13.50 saved, 16.50 to go: about 4 more paydays (Sat 14 Nov).'), await txt(p, kid('Ali') + ' .goal'));
    ok('goal bar', await p.getAttribute(kid('Ali') + ' .bar', 'aria-valuenow') === '45');
    ok('no Bought it before it is reached', !(await p.isVisible(kid('Ali') + ' button:text-is("Bought it")')));
    await p.click(kid('Ali') + ' button:text-is("Add money")'); await p.fill(kid('Ali') + ' input[id$="-amount"]', '20'); await p.click(kid('Ali') + ' .panel button[type=submit]');
    ok('goal reached', (await txt(p, kid('Ali') + ' .goal')).includes('Enough saved! Ali can buy it now.') && await p.getAttribute(kid('Ali') + ' .bar', 'aria-valuenow') === '100');
    await p.click(kid('Ali') + ' button:text-is("Bought it")');
    ok('Bought it takes the price out and clears the goal', await bal(p, 'Ali') === '3.50' && (await txt(p, kid('Ali') + ' .msg')).startsWith('Well done! 30 taken out for Lego set.') && await p.isVisible(kid('Ali') + ' button:text-is("+ Set a savings goal")'));
    await p.click(kid('Ali') + ' .msg .undo');
    ok('undo Bought it', await bal(p, 'Ali') === '33.50' && (await txt(p, kid('Ali') + ' .goal')).includes('Lego set'));
    await p.click(kid('Ali') + ' button:text-is("Change goal")'); await p.click(kid('Ali') + ' button:text-is("Remove the goal")');
    ok('remove the goal', await p.isVisible(kid('Ali') + ' button:text-is("+ Set a savings goal")'));

    // ---- 5. history: edit and delete ----
    await p.click(kid('Ali') + ' button:text-is("History")');
    const hrows = await p.$$eval(kid('Ali') + ' .hist li', ls => ls.map(l => l.innerText.replace(/\s+/g, ' ').trim()));
    ok('history newest first with balance', hrows[0].startsWith('Added Sat 17 Oct +20 Left: 33.50') && hrows[hrows.length - 1].startsWith('Added: Eid money from Grandma Fri 16 Oct +10 Left: 10') && hrows[hrows.length - 2].startsWith('Pocket money Sat 17 Oct +5 Left: 15'), hrows);
    ok('history lists the earlier day in order', hrows.some(r => r.startsWith('Added: Eid money from Grandma Fri 16 Oct +10')));
    await p.click(kid('Ali') + ' .hist li:has-text("Eid money") button');
    ok('edit form filled in', await p.inputValue(kid('Ali') + ' input[id$="-amount"]') === '10' && await p.inputValue(kid('Ali') + ' input[id$="-note"]') === 'Eid money from Grandma');
    await p.fill(kid('Ali') + ' input[id$="-amount"]', '12.50'); await p.click(kid('Ali') + ' button:text-is("Save change")');
    ok('entry edited, back to history', await bal(p, 'Ali') === '36' && await p.isVisible(kid('Ali') + ' .hist'));
    await p.click(kid('Ali') + ' .hist li:has-text("Eid money") button'); await p.click(kid('Ali') + ' button:text-is("Delete this entry")');
    ok('entry deleted', await bal(p, 'Ali') === '23.50' && (await txt(p, kid('Ali') + ' .msg')).startsWith('Entry deleted (Added: Eid money from Grandma, Fri 16 Oct).'));
    await p.click(kid('Ali') + ' .msg .undo');
    ok('entry delete undone', await bal(p, 'Ali') === '36');
    // take most of it out, then try to delete money that was already spent
    await p.click(kid('Ali') + ' button:text-is("Take money out")'); await p.fill(kid('Ali') + ' input[id$="-amount"]', '30'); await p.click(kid('Ali') + ' .panel button[type=submit]');
    await p.click(kid('Ali') + ' button:text-is("History")');
    await p.click(kid('Ali') + ' .hist li:has(.h-what:text-is("Added")) button'); await p.click(kid('Ali') + ' button:text-is("Delete this entry")');
    ok('deleting money already spent is refused', (await txt(p, kid('Ali') + ' .panel')).includes('cannot be deleted') && await bal(p, 'Ali') === '6');
    await p.fill(kid('Ali') + ' input[id$="-amount"]', '1'); await p.click(kid('Ali') + ' button:text-is("Save change")');
    ok('lowering it below what was spent is refused', (await txt(p, kid('Ali') + ' .panel')).includes('less than nothing'));
    await p.keyboard.press('Escape');

    // ---- 6. settings ----
    await p.click('#open-add');
    await p.fill('#a-name', 'ali'); await p.click('#a-save');
    ok('second child with the same name refused', (await txt(p, '#e-a-name')).startsWith('You already have a child called ali'));
    await p.fill('#a-name', 'Sara'); await p.fill('#a-pay', '20'); await p.selectOption('#a-freq', 'month'); await p.fill('#a-start', '2026-11-01'); await p.click('#a-save');
    ok('second child in their own box with their own payday', await bal(p, 'Sara') === '0' && (await txt(p, kid('Sara') + ' .facts')).includes('Pocket money: 20 on the 1st of every month. First payday: Sun 1 Nov.'));
    await p.click(kid('Sara') + ' .panel button:text-is("Cancel")');
    await p.click(kid('Ali') + ' button:text-is("Settings")');
    ok('settings filled in with the next payday', await p.inputValue(kid('Ali') + ' input[id$="-start"]') === '2026-10-24' && await p.inputValue(kid('Ali') + ' input[id$="-pay"]') === '5');
    await p.fill(kid('Ali') + ' input[id$="-name"]', 'Sara'); await p.click(kid('Ali') + ' button:text-is("Save settings")');
    ok('rename to a name in use refused', (await txt(p, kid('Ali') + ' .panel')).includes('You already have a child called Sara'));
    await p.fill(kid('Ali') + ' input[id$="-name"]', 'Ali'); await p.fill(kid('Ali') + ' input[id$="-pay"]', '6'); await p.fill(kid('Ali') + ' input[id$="-start"]', '2026-10-17');
    ok('settings preview never pays today twice', (await txt(p, kid('Ali') + ' .panel .preview')) === 'Ali gets 6 every Saturday. Next payday: Sat 24 Oct.', await txt(p, kid('Ali') + ' .panel .preview'));
    await p.click(kid('Ali') + ' button:text-is("Save settings")');
    ok('new amount from the next payday, no double pay', await bal(p, 'Ali') === '6' && (await txt(p, kid('Ali') + ' .facts')).includes('Pocket money: 6 every Saturday. Next: Sat 24 Oct.'));
    await p.click(kid('Sara') + ' button:text-is("Settings")'); await p.click(kid('Sara') + ' button:text-is("Delete Sara")');
    ok('child deleted', !(await p.isVisible(kid('Sara'))) && (await txt(p, '#top-msg')).startsWith('Sara deleted'));
    await p.click('#top-msg .undo');
    ok('child delete undone', await p.isVisible(kid('Sara')));

    // ---- 7. currency, copy, email, print ----
    await p.selectOption('#cur', '£');
    ok('currency symbol shown', await bal(p, 'Ali') === '£6');
    const mail = decodeURIComponent(await p.getAttribute('#mail-all', 'href'));
    ok('email works with no recipient', mail.startsWith('mailto:?subject=Pocket money&body=Pocket money on Saturday 17 Oct:') && mail.includes('Ali has £6'), mail.slice(0, 120));
    await p.click('#copy-all');
    const clip = await p.evaluate(() => navigator.clipboard.readText());
    ok('copy the summary', clip.includes('Ali has £6') && clip.includes('Sara has £0') && (await txt(p, '#set-msg')).startsWith('Copied.'));
    await p.evaluate(() => { window.print = () => { window.__printed = document.body.classList.contains('print-chart') && document.getElementById('chart').innerText; }; });
    await p.click('#print-chart');
    const chart = await p.evaluate(() => window.__printed);
    ok('chore chart for the fridge', !!chart && chart.includes("Ali's chores") && chart.includes('Tidy your room') && chart.includes('Mon') && !chart.includes("Sara's chores"), chart);
    ok('chart has a box per day', await p.$$eval('#chart .chart-kid:first-child tbody tr:first-child .c-box', x => x.length) === 7);
    await p.reload({ waitUntil: 'networkidle' });
    ok('reload keeps everything and the currency', await bal(p, 'Ali') === '£6' && await p.inputValue('#cur') === '£' && await p.isVisible(kid('Sara')));
    ok('reload does not pay twice', (await saved(p)).kids[0].log.filter(e => e.kind === 'pay').length === 1);
    // backup and restore
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#backup')]);
    const file = await dl.path(), backupText = fs.readFileSync(file, 'utf8');
    ok('backup file', dl.suggestedFilename() === 'pocket-money-backup-2026-10-17.json' && JSON.parse(backupText).kids.length === 2);
    const junk = path.join(require('os').tmpdir(), 'pm-junk.json'); fs.writeFileSync(junk, '{"hello":1}');
    await p.setInputFiles('#restore-file', junk);
    await p.waitForTimeout(200);
    ok('a wrong file is refused', (await txt(p, '#set-msg')).startsWith('That file is not a backup from this app') && await p.isVisible(kid('Ali')));
    await p.click('#wipe');
    ok('delete everything', !(await p.isVisible(kid('Ali'))) && await p.isVisible('#add-form') && (await txt(p, '#top-msg')).startsWith('Everything deleted.'));
    const bk = path.join(require('os').tmpdir(), 'pm-backup.json'); fs.writeFileSync(bk, backupText);
    await p.setInputFiles('#restore-file', bk); await p.waitForTimeout(200);
    ok('restore a backup', await bal(p, 'Ali') === '£6' && (await txt(p, '#top-msg')).startsWith('Backup restored: 2 children.'));
    await p.click('#wipe'); await p.click('#top-msg .undo');
    ok('undo delete everything', await bal(p, 'Ali') === '£6');
    ok('no console errors (main run)', !p.errors.length && !p.bad.length, p.errors.concat(p.bad));
    await p.context().close();

    // ---- 8. catch-up after weeks away, undo, and the next day ----
    const st = seed(); st.kids[0].paidThrough = '2026-09-26'; st.kids[0].log = st.kids[0].log.filter(e => e.kind !== 'pay');
    p = await load(b, phone, { state: st });
    ok('missed paydays are all added', (await txt(p, '#top-msg')).startsWith('Payday! Added 3 paydays of £5 for Ali, £15 in all (Sat 3 Oct to Sat 17 Oct).'), await txt(p, '#top-msg'));
    ok('monthly child not paid again this month', await bal(p, 'Sara') === '£68.50');
    await p.click('#top-msg .undo');
    ok('undo the catch-up removes the money', await bal(p, 'Ali') === '−£0.75' || (await bal(p, 'Ali')).includes('0.75'), await bal(p, 'Ali'));
    ok('a child left short is explained', (await txt(p, kid('Ali'))).includes('is short by') && (await txt(p, kid('Ali') + ' .facts')).includes('More was taken out than was added.'));
    await p.reload({ waitUntil: 'networkidle' });
    ok('undone paydays are not added again on reload', (await saved(p)).kids[0].log.filter(e => e.kind === 'pay').length === 0 && !(await txt(p, '#top-msg')).includes('Payday'));
    await p.context().close();

    p = await load(b, desk, { state: seed() });
    ok('payday today added on open', (await txt(p, '#top-msg')).startsWith('Payday! Added £5 pocket money for Ali (Sat 17 Oct).') && await bal(p, 'Ali') === '£14.25');
    ok('Sara with the README numbers', await bal(p, 'Sara') === '£68.50' && (await txt(p, kid('Sara') + ' .goal')).includes('£68.50 saved, £51.50 to go: about 3 more paydays (Fri 1 Jan 2027).'), await txt(p, kid('Sara') + ' .goal'));
    if (shots) {
        await p.click(kid('Ali') + ' button[aria-label="Done: Tidy your room"]');
        await p.click(kid('Ali') + ' button[aria-label="Done: Make your bed"]');
        await p.evaluate(() => scrollTo(0, 0));
        await p.screenshot({ path: path.join(__dirname, 'screenshots/desktop.png'), fullPage: false });
    }
    await layoutOK(p, 'desktop filled');
    // the next Saturday comes while the page is open
    await p.clock.fastForward(7 * 24 * 3600e3);
    await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await p.waitForTimeout(100);
    ok('next payday added while open', (await txt(p, '#top-msg')).includes('Added £5 pocket money for Ali (Sat 24 Oct).'), await txt(p, '#top-msg'));
    ok('"done today" resets the next day', !(await txt(p, kid('Ali') + ' .chores')).includes('Done today'));
    ok('no console errors (seeded desktop)', !p.errors.length && !p.bad.length, p.errors.concat(p.bad));
    await p.context().close();

    // ---- 8b. the browser's own language (even one the date functions cannot read) ----
    p = await load(b, phone, { locale: null, state: seed() });
    const line = await txt(p, kid('Ali') + ' .facts');
    ok('default browser language: weekday and dates shown', /every Saturday\. Next: Sat\w*,? (Oct 24|24 Oct)\./.test(line) && !/\d{4}-\d{2}-\d{2}/.test(line), line);
    ok('default browser language: no console errors', !p.errors.length, p.errors);
    await p.context().close();

    // ---- 9. corrupt and blocked storage ----
    p = await load(b, phone, { state: '{not json' });
    ok('corrupt data: starts fresh and says so', (await txt(p, '#top-msg')).startsWith('Your saved data could not be read') && await p.isVisible('#add-form'));
    ok('corrupt data kept aside', await p.evaluate(k => localStorage.getItem(k + '.broken'), KEY) === '{not json');
    await p.context().close();
    p = await load(b, phone, { block: true });
    ok('storage blocked: warning shown, app still works', await p.isVisible('#storage-warn'));
    await p.fill('#a-name', 'Ali'); await p.click('#a-save');
    ok('storage blocked: child still added', await p.isVisible(kid('Ali')) && !p.errors.length, p.errors);
    await p.context().close();

    // ---- 10. extreme input: long names and huge amounts ----
    const big = seed(); big.kids[0].name = 'Alexandria-Mariam Fatima Zahra Rahimova'; big.kids[0].chores[0].name = 'Clean out the garage and sort the recycling'; big.kids[0].log.push({ id: 'zz', kind: 'in', amount: 999999999, date: '2026-10-16', seq: 99, note: 'x'.repeat(80) });
    for (const w of [320, 360, 390]) {
        p = await load(b, { width: w, height: 800 }, { state: big });
        await layoutOK(p, w + 'px long names, huge amounts');
        const k = kid('Alexandria-Mariam Fatima Zahra Rahimova');
        for (const [btnText, label] of [['+ Add a chore', 'chore form'], ['Add money', 'money form'], ['Settings', 'settings form'], ['History', 'history'], ['+ Set a savings goal', 'goal form']]) {
            const target = p.locator(kid('Sara') + ` button:text-is("${btnText}")`);
            if (btnText === '+ Set a savings goal') await p.click(k + ' button:text-is("Change goal")'); else if (btnText === 'History') await p.click(k + ' button:text-is("History")'); else await target.click();
            await layoutOK(p, w + 'px ' + label + ' open');
        }
        await p.click('#open-add'); await layoutOK(p, w + 'px add another child open');
        if (w === 390 && shots) { /* phone shot comes from the normal family below */ }
        ok(w + 'px no console errors', !p.errors.length, p.errors);
        await p.context().close();
    }

    // ---- 11. phone screenshot and light theme ----
    p = await load(b, phone, { state: seed() });
    await layoutOK(p, '390 filled');
    if (shots) {
        await p.click(kid('Ali') + ' button[aria-label="Done: Tidy your room"]');
        await p.evaluate(() => scrollTo(0, 0));
        await p.screenshot({ path: path.join(__dirname, 'screenshots/phone.png'), fullPage: false });
    }
    const toggle = p.locator('.theme-toggle');
    if (await toggle.count()) {
        const before = await p.evaluate(() => getComputedStyle(document.body).color);
        await toggle.click();
        const after = await p.evaluate(() => getComputedStyle(document.body).color);
        ok('light/dark switch changes the colours', before !== after && await p.evaluate(() => document.documentElement.dataset.theme) === 'light');
    } else ok('light/dark switch present', false);
    await p.context().close();
    p = await load(b, desk, { theme: 'light', state: seed() });
    await layoutOK(p, 'desktop light');
    // scroll test: no two blocks overlap at the top, middle and bottom
    for (const w of [900, 1024, 1280, 1418, 1920]) {
        await p.setViewportSize({ width: w, height: 900 });
        for (const pos of ['top', 'mid', 'bottom']) {
            await p.evaluate(x => scrollTo(0, x === 'top' ? 0 : x === 'mid' ? document.body.scrollHeight / 2 : document.body.scrollHeight), pos);
            const over = await p.evaluate(() => {
                const kids = [...document.querySelectorAll('main > *, .col-main > *, .col-side > *, #kids > *')].filter(e => e.offsetParent !== null || getComputedStyle(e).display === 'contents');
                const bx = kids.filter(e => getComputedStyle(e).display !== 'contents').map(e => ({ e, b: e.getBoundingClientRect() })).filter(x => x.b.height > 0);
                const bad = [];
                for (let i = 0; i < bx.length; i++) for (let j = i + 1; j < bx.length; j++) {
                    const a = bx[i], c = bx[j]; if (a.e.contains(c.e) || c.e.contains(a.e)) continue;
                    if (Math.min(a.b.right, c.b.right) - Math.max(a.b.left, c.b.left) > 1 && Math.min(a.b.bottom, c.b.bottom) - Math.max(a.b.top, c.b.top) > 1) bad.push((a.e.id || a.e.className) + '/' + (c.e.id || c.e.className));
                }
                return bad;
            });
            ok(`scroll ${w} ${pos}: no blocks overlap`, !over.length, over);
        }
    }
    ok('desktop uses two columns', await p.evaluate(() => { const a = document.querySelector('.col-main').getBoundingClientRect(), c = document.querySelector('.col-side').getBoundingClientRect(); return c.left > a.right && Math.abs(a.top - c.top) < 2; }));
    await p.context().close();

    // ---- 12. help dialog at every width ----
    for (const w of [320, 390, 820, 1280]) {
        p = await load(b, { width: w, height: 800 }, { state: seed() });
        await p.click('.help-btn');
        const d = await p.evaluate(() => { const e = document.querySelector('dialog[open]'); if (!e) return null; const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, h: e.querySelector('h2') && e.querySelector('h2').textContent }; });
        ok(w + ' help opens inside the screen', d && d.l >= 0 && d.r <= w && d.t >= 0 && d.h === 'How to use Pocket Money and Chores Tracker for Kids', d);
        await p.keyboard.press('Escape');
        ok(w + ' Escape closes help and the payday message stays', !(await p.$('dialog[open]')));
        await p.click('.help-btn'); await p.click('dialog[open] button:text-is("Got it")');
        ok(w + ' Got it closes help', !(await p.$('dialog[open]')));
        const bar = await p.evaluate(() => { const bs = [...document.querySelectorAll('.topbar > *, .topbar button')].map(e => e.getBoundingClientRect()); let o = 0; for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) { const a = bs[i], c = bs[j]; if (Math.min(a.right, c.right) - Math.max(a.left, c.left) > 1 && Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top) > 1 && !(a.left <= c.left && a.right >= c.right && a.top <= c.top && a.bottom >= c.bottom)) o++; } return o; });
        ok(w + ' top bar buttons do not overlap', bar === 0, bar);
        await p.context().close();
    }

    await b.close();
    if (server) server.close();
    console.log(fail ? fail + ' FAILED' : 'ALL UI TESTS PASSED');
    process.exitCode = fail ? 1 : 0;
}
run().catch(e => { console.error(e); process.exit(1); });
