// Drives the real page in headless Chromium: node ui-test.js [--shots] [--base https://umar8092.github.io/apps]
// Without --base it serves this repo on localhost. With --base it tests the LIVE page. The clock is Mon 19 Oct 2026, 10:00.
const pw = (() => { for (const m of ['playwright', 'playwright-core']) { try { return require(m); } catch (e) { /* next */ } } throw new Error('playwright not found'); })();
const path = require('path'), fs = require('fs'), http = require('http');
const bi = process.argv.indexOf('--base');
const shots = process.argv.includes('--shots'), only = process.argv.includes('--look');
let fail = 0, url;
const ok = (name, cond, extra) => { if (!cond) fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond || extra == null ? '' : '  -> ' + JSON.stringify(extra))); };
const NOW = new Date(2026, 9, 19, 10, 0).getTime();
const SLUG = 'committee-and-rosca-tracker-for-savings-groups', KEY = SLUG + '.state';

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

// the README situation: an office committee of 9 members (Imran has 2 shares), 10,000 a month from 5 Aug 2026, now in round 3
function seed() {
    const names = ['Ali', 'Bilal', 'Sara', 'Hina', 'Usman', 'Ayesha', 'Hamza', 'Zainab', 'Imran'];
    const members = names.map((n, i) => ({ id: 'm' + i, name: n, shares: n === 'Imran' ? 2 : 1, phone: n === 'Hina' ? '+923001234567' : '' }));
    const order = ['m0', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm8'];
    const due = m => 1000000 * m.shares, paid = { 0: {}, 1: {}, 2: {} };
    members.forEach(m => { paid[0][m.id] = { c: due(m), d: '2026-08-05' }; if (m.id !== 'm3') paid[1][m.id] = { c: due(m), d: '2026-09-05' }; });
    ['m1', 'm4', 'm5', 'm6', 'm7'].forEach(id => { paid[2][id] = { c: 1000000, d: '2026-10-06' }; });
    paid[2].m8 = { c: 2000000, d: '2026-10-05' }; paid[2].m3 = { c: 500000, d: '2026-10-07' };
    return { v: 1, cur: 'Rs', active: 'c1', committees: [{ id: 'c1', name: 'Office', amount: 1000000, freq: 'month', start: '2026-08-05', members, order, paid, handed: { 0: 'm0', 1: 'm1' }, drawn: '2026-08-01' }] };
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
const payBox = (p, name) => p.locator('.pay', { has: p.locator('.pay-name', { hasText: new RegExp('^' + name) }) });
const memBox = (p, name) => p.locator('.member', { has: p.locator('.m-name', { hasText: new RegExp('^' + name + '$') }) });

async function main() {
    let server;
    if (bi >= 0) url = process.argv[bi + 1].replace(/\/$/, '') + '/' + SLUG + '/';
    else { server = await serve(); url = 'http://localhost:' + server.address().port + '/' + SLUG + '/'; }
    const b = await pw.chromium.launch();
    try {
        if (only) {
            for (const [w, h, n] of [[1280, 900, 'desk'], [390, 1300, 'phone']]) {
                const p = await load(b, { width: w, height: h }, { state: seed() });
                if (w < 500) { for (let i = 0; i < 3; i++) { await p.evaluate(y => window.scrollTo(0, y), i * 1300); await p.screenshot({ path: process.env.OUT + '/' + n + i + '.png' }); } } else await p.screenshot({ path: process.env.OUT + '/' + n + '.png', fullPage: true }); await p.context().close();
            }
            return;
        }
        await tests(b);
    } finally { await b.close(); if (server) server.close(); }
    console.log(fail ? fail + ' FAILED' : 'ALL UI TESTS PASSED');
    process.exitCode = fail ? 1 : 0;
}
async function overlaps(p) {
    return p.evaluate(() => {
        const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
        const els = [...document.querySelectorAll('main input:not([type=file]):not([type=checkbox]), main select, main button, main a.secondary, main textarea')].filter(vis);
        const bad = [];
        for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
            const a = els[i].getBoundingClientRect(), b = els[j].getBoundingClientRect();
            if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) bad.push((els[i].id || els[i].textContent.trim().slice(0, 20)) + ' / ' + (els[j].id || els[j].textContent.trim().slice(0, 20)));
        }
        const sw = document.documentElement.scrollWidth > innerWidth + 1;
        return { bad: bad.slice(0, 5), sw };
    });
}
async function tests(b) {
    // 1. first use: only the setup form
    let p = await load(b, { width: 390, height: 844 });
    ok('first use shows the setup form', await p.isVisible('#setup-form') && !(await p.isVisible('#setup-view')));
    ok('members, round, turn order and tools hidden at first', !(await p.isVisible('#members')) && !(await p.isVisible('#round')) && !(await p.isVisible('#turns')) && !(await p.isVisible('#tools')));
    ok('first collection date defaults to today', (await p.inputValue('#c-start')) === '2026-10-19');
    await p.click('#c-save');
    ok('blank amount refused', /Type the amount/.test(await txt(p, '#c-amount-err')));
    await p.fill('#c-amount', '-5000'); await p.click('#c-save'); ok('negative amount refused', /minus/.test(await txt(p, '#c-amount-err')));
    await p.fill('#c-amount', '999999999999'); await p.click('#c-save'); ok('huge amount refused', /too big/.test(await txt(p, '#c-amount-err')));
    await p.fill('#c-amount', '0'); await p.click('#c-save'); ok('zero refused', /more than 0/.test(await txt(p, '#c-amount-err')));
    await p.fill('#c-name', 'Family committee'); await p.fill('#c-amount', '5,000'); await p.fill('#c-start', '2026-10-01'); await p.click('#c-save');
    ok('saved: details card shows the committee', (await txt(p, '#setup-h')) === 'Family committee' && /5,000 per share a month/.test(await txt(p, '#c-line1')), await txt(p, '#c-line1'));
    ok('asks for members next', /add the members/.test(await txt(p, '#setup-msg')));
    ok('members box now shows, round still hidden', await p.isVisible('#members') && !(await p.isVisible('#round')));
    // 2. members
    await p.click('#m-add'); ok('blank member name refused', /Type the member/.test(await txt(p, '#m-name-err')));
    ok('phone is optional and hidden', !(await p.isVisible('#m-phone')) && await p.isVisible('#m-phone-open'));
    await p.fill('#m-name', 'Ammi'); await p.press('#m-name', 'Enter');
    ok('Enter adds a member', (await p.locator('.member').count()) === 1 && /round 1/.test(await txt(p, '#members-msg')));
    ok('one member: round not shown yet', !(await p.isVisible('#round')) && /one more member/.test(await txt(p, '#c-now')));
    await p.fill('#m-name', ' ammi '); await p.click('#m-add'); ok('duplicate name refused', /already in this committee/.test(await txt(p, '#m-name-err')));
    await p.fill('#m-name', 'Bhai Jan'); await p.click('#m-phone-open'); await p.fill('#m-phone', 'call me'); await p.click('#m-add');
    ok('bad phone refused', /digits/.test(await txt(p, '#m-phone-err')));
    await p.fill('#m-phone', '+92 321 7654321'); await p.selectOption('#m-shares', '2'); await p.click('#m-add');
    ok('member with 2 shares and phone added', /2 shares/.test(await txt(p, '#members-msg')) && /rounds? 2 and round 3/.test(await txt(p, '#members-msg')), await txt(p, '#members-msg'));
    await p.fill('#m-name', 'Apa'); await p.click('#m-add');
    ok('3 shares + 1 = 4 rounds, pot 20,000', /4 rounds/.test(await txt(p, '#c-line2')) && /pot 20,000/.test(await txt(p, '#c-line1')), await txt(p, '#c-line1'));
    ok('round and turn order now visible', await p.isVisible('#round') && await p.isVisible('#turns'));
    ok('round 2 of 4 is current (1 Oct start, 19 Oct today)', (await txt(p, '#round-h')) === 'Round 1 of 4', await txt(p, '#round-h'));
    ok('Ammi takes 20,000', (await txt(p, '#r-taker')) === 'Ammi takes 20,000');
    // 3. payments
    await payBox(p, 'Ammi').locator('button', { hasText: 'Paid in full' }).click();
    ok('paid in full counts', /Paid: 1 of 3/.test(await txt(p, '#r-progress')) && /Ammi paid 5,000/.test(await txt(p, '#round-msg')));
    await payBox(p, 'Bhai Jan').locator('button', { hasText: 'Part payment' }).click();
    ok('part payment box asks for the total paid', /of 10,000/.test(await txt(p, '.part-panel label')));
    await p.fill('.part-panel input', '12000'); await p.click('.part-panel button:has-text("Save")');
    ok('more than due refused', /more than the 10,000/.test(await txt(p, '.part-panel .err')));
    await p.fill('.part-panel input', ''); await p.press('.part-panel input', 'Enter'); ok('blank part refused', /Type the amount/.test(await txt(p, '.part-panel .err')));
    await p.fill('.part-panel input', '4000'); await p.press('.part-panel input', 'Enter');
    ok('part payment saved', /4,000, 6,000 still to pay/.test(await txt(p, '#round-msg')) && /Bhai Jan 6,000/.test(await txt(p, '#r-left')));
    await p.click('#round-msg .undo'); ok('Undo takes the part payment back', /Bhai Jan 10,000/.test(await txt(p, '#r-left')));
    await payBox(p, 'Ammi').locator('button', { hasText: 'Mark as not paid' }).click(); ok('mark as not paid', /Paid: 0 of 3/.test(await txt(p, '#r-progress')));
    await payBox(p, 'Ammi').locator('button', { hasText: 'Paid in full' }).click();
    // reminder text for the group equals the core text
    await p.click('#r-copy');
    const clip = await p.evaluate(() => navigator.clipboard.readText());
    ok('copy reminder lists who still has to pay', /Still to pay:\n- Bhai Jan: 10,000\n- Apa: 5,000/.test(clip) && /Ammi takes the pot of 20,000/.test(clip), clip);
    const wa = await p.getAttribute('#r-wa', 'href'), mail = await p.getAttribute('#r-mail', 'href');
    ok('WhatsApp link carries the reminder', wa.startsWith('https://wa.me/?text=') && decodeURIComponent(wa.split('text=')[1]) === clip);
    ok('email works with no recipient typed', mail.startsWith('mailto:?subject=') && /Bhai%20Jan/.test(mail));
    // 4. hand-over locks the turn and stops deleting that member
    await p.check('#r-handed');
    ok('hand-over saved', /handed over to Ammi/.test(await txt(p, '#round-msg')) && (await saved(p)).committees[0].handed[0] === (await saved(p)).committees[0].order[0]);
    ok('handed round arrows disabled', await p.locator('.t-row').nth(0).locator('button').nth(1).isDisabled() && await p.locator('.t-row').nth(1).locator('button').nth(0).isDisabled());
    await memBox(p, 'Ammi').locator('button', { hasText: 'Delete' }).click();
    ok('member who took the pot cannot be deleted', /cannot be deleted/.test(await txt(p, '#members-msg')) && (await p.locator('.member').count()) === 3);
    // 5. turn order: move and draw with undo
    await p.locator('.t-row').nth(1).locator('button').nth(1).click();
    ok('arrow moves a turn one round later', /now takes the pot in round 3/.test(await txt(p, '#turns-msg')), await txt(p, '#turns-msg'));
    const ord0 = (await saved(p)).committees[0].order;
    await p.click('#draw'); ok('draw keeps the handed round 1', (await saved(p)).committees[0].order[0] === ord0[0] && /Order drawn at random on 19 Oct 2026/.test(await txt(p, '#drawn')));
    ok('draw keeps the same turns', JSON.stringify((await saved(p)).committees[0].order.slice().sort()) === JSON.stringify(ord0.slice().sort()));
    await p.click('#turns-msg .undo'); ok('undo the draw', JSON.stringify((await saved(p)).committees[0].order) === JSON.stringify(ord0) && !(await txt(p, '#drawn')));
    // 6. member reminder, edit, delete
    await memBox(p, 'Bhai Jan').locator('button', { hasText: 'Reminder' }).click();
    const rem = await p.inputValue('.member .panel textarea');
    ok('member reminder says what they owe and their turn', /you have 10,000 still to pay \(10,000 for round 1, 1 Oct 2026\)/.test(rem) && /Your turn to take the pot of 20,000/.test(rem), rem);
    ok('member WhatsApp goes to their number', (await p.getAttribute('.member .panel a', 'href')).startsWith('https://wa.me/923217654321?text='));
    await memBox(p, 'Bhai Jan').locator('button', { hasText: 'Edit' }).click();
    await p.fill('.member .panel input[type=text]', 'Bhai Jaan'); await p.press('.member .panel input[type=text]', 'Escape');
    ok('Escape cancels the edit', (await p.locator('.member .m-name', { hasText: 'Bhai Jan' }).count()) === 1 && !(await p.isVisible('.member .panel')));
    await memBox(p, 'Bhai Jan').locator('button', { hasText: 'Edit' }).click();
    await p.fill('.member .panel input[type=text]', 'Apa'); await p.click('.member .panel button:has-text("Save")');
    ok('rename to an existing name refused', /already in this committee/.test(await txt(p, '.member .panel .err')));
    await p.fill('.member .panel input[type=text]', 'Bhai Jaan'); await p.click('.member .panel button:has-text("Save")');
    ok('rename keeps payments and turns', /Saved Bhai Jaan \(was Bhai Jan\)/.test(await txt(p, '#members-msg')) && (await p.locator('.t-who', { hasText: 'Bhai Jaan' }).count()) === 2);
    await memBox(p, 'Apa').locator('button', { hasText: 'Delete' }).click();
    ok('delete a member', (await p.locator('.member').count()) === 2 && /Deleted Apa/.test(await txt(p, '#members-msg')));
    await p.click('#members-msg .undo'); ok('undo the delete', (await p.locator('.member').count()) === 3);
    // 7. reload keeps everything
    await p.reload({ waitUntil: 'networkidle' });
    ok('reload keeps the committee, members and payments', (await p.locator('.member').count()) === 3 && /Paid: 1 of 3/.test(await txt(p, '#r-progress')) && await p.isChecked('#r-handed'));
    // 8. currency remembered
    await p.selectOption('#cur', 'Rs'); ok('currency shown', (await txt(p, '#r-taker')) === 'Ammi took Rs 20,000');
    await p.reload({ waitUntil: 'networkidle' }); ok('currency remembered', (await p.inputValue('#cur')) === 'Rs');
    // 9. change details: amount change keeps saved payments
    await p.click('#edit-c'); ok('edit form filled', (await p.inputValue('#c-amount')) === '5000' && (await p.inputValue('#c-name')) === 'Family committee');
    await p.fill('#c-amount', '6000'); await p.click('#c-save');
    ok('changed amount note', /keep the amount they were saved with/.test(await txt(p, '#setup-msg')) && /pot Rs 24,000/.test(await txt(p, '#c-line1')));
    await p.click('#setup-msg .undo'); ok('undo details change', /pot Rs 20,000/.test(await txt(p, '#c-line1')));
    // 10. second committee and switching
    await p.click('#new-c'); ok('new committee opens an empty form', await p.isVisible('#setup-form') && (await p.inputValue('#c-amount')) === '' && await p.isVisible('#c-cancel'));
    await p.click('#c-cancel'); ok('cancel goes back', (await txt(p, '#setup-h')) === 'Family committee' && !(await p.isVisible('#pick-row')));
    await p.click('#new-c'); await p.fill('#c-name', 'Office'); await p.fill('#c-amount', '10000'); await p.click('#c-save');
    ok('two committees: picker shows', await p.isVisible('#pick') && (await p.locator('#pick option').count()) === 2 && (await txt(p, '#setup-h')) === 'Office');
    await p.selectOption('#pick', { label: 'Family committee' }); ok('switch committee', (await txt(p, '#setup-h')) === 'Family committee' && (await p.locator('.member').count()) === 3);
    await p.click('#del-c'); ok('delete committee', (await txt(p, '#setup-h')) === 'Office' && (await p.locator('#pick option').count()) === 1);
    await p.click('#tools-msg .undo'); ok('undo delete committee', (await p.locator('#pick option').count()) === 2);
    // 11. backup and restore
    await p.selectOption('#pick', { label: 'Family committee' });
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#backup')]);
    const file = await dl.path(); const back = JSON.parse(fs.readFileSync(file, 'utf8'));
    ok('backup file has both committees', back.committees.length === 2 && back.app === SLUG);
    await p.setInputFiles('#restore-file', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') });
    await p.waitForFunction(() => /not a backup/.test(document.getElementById('tools-msg').textContent), null, { timeout: 3000 }).catch(() => {});
    ok('bad backup refused', /not a backup/.test(await txt(p, '#tools-msg')));
    await p.click('#del-c'); await p.click('#del-c');
    ok('both deleted: back to first use', await p.isVisible('#setup-form') && !(await p.isVisible('#members')));
    ok('first-use form offers Restore a backup file', await p.isVisible('#restore-first'));
    const [chooser] = await Promise.all([p.waitForEvent('filechooser'), p.click('#restore-first')]);
    await chooser.setFiles(file);
    await p.waitForFunction(() => /2 committees/.test(document.getElementById('setup-msg').textContent), null, { timeout: 3000 }).catch(() => {});
    ok('restore brings them back', /2 committees/.test(await txt(p, '#setup-msg')) && (await p.locator('#pick option').count()) === 2 && !(await p.isVisible('#restore-first')), await txt(p, '#setup-msg'));
    ok('no console errors in the main run', !p.errors.length && !p.bad.length, p.errors.concat(p.bad));
    await p.context().close();

    // 12. the README situation (seeded): round 3 of the office committee
    p = await load(b, { width: 1280, height: 900 }, { state: seed() });
    ok('now line', (await txt(p, '#c-now')) === 'Now: round 3 of 10. Sara takes Rs 100,000. Paid 6 of 9.', await txt(p, '#c-now'));
    ok('round 3 open on load', (await txt(p, '#round-h')) === 'Round 3 of 10' && /5 Oct 2026 \(14 days ago\)/.test(await txt(p, '#r-date')));
    ok('still to pay line', (await txt(p, '#r-left')) === 'Still to pay: Ali Rs 10,000, Sara Rs 10,000, Hina Rs 5,000 (Rs 25,000 in all)', await txt(p, '#r-left'));
    ok('Hina owes 15,000 across two rounds', /Owes Rs 15,000 now \(round 2; round 3, part paid\)/.test(await txt(p, '.member:nth-child(4)')));
    ok('Imran 2 turns shown', /round 9 \(5 Apr 2027\), round 10 \(5 May 2027\)/.test(await txt(p, '.member:nth-child(9)')));
    await p.click('#r-next'); ok('next round is in the future', /Round 4 of 10/.test(await txt(p, '#round-h')) && /still to come/.test(await txt(p, '#r-note')) && await p.isVisible('#r-today'));
    await p.click('#r-today'); ok('go back to this round', /Round 3 of 10/.test(await txt(p, '#round-h')));
    await p.click('#r-prev'); await p.click('#r-prev'); ok('previous stops at round 1', await p.isDisabled('#r-prev'));
    ok('no console errors (seeded)', !p.errors.length && !p.bad.length, p.errors.concat(p.bad));
    await p.context().close();

    // 13. before the start
    const early = seed(); early.committees[0].start = '2026-11-05'; early.committees[0].paid = {}; early.committees[0].handed = {};
    p = await load(b, { width: 390, height: 844 }, { state: early });
    ok('not started yet', /Starts on 5 Nov 2026 \(in 17 days\)/.test(await txt(p, '#c-now')) && /starts on 5 Nov 2026/.test(await txt(p, '#r-note')));
    ok('nothing owed before the start', !/Owes/.test(await txt(p, '#m-list')));
    await p.context().close();

    // 14. corrupt and blocked storage
    p = await load(b, { width: 390, height: 844 }, { state: '{not json' });
    ok('corrupt saved data: fresh start, no errors', await p.isVisible('#setup-form') && !p.errors.length, p.errors);
    await p.context().close();
    p = await load(b, { width: 390, height: 844 }, { block: true });
    await p.fill('#c-amount', '1000'); await p.click('#c-save'); await p.fill('#m-name', 'A'); await p.click('#m-add'); await p.fill('#m-name', 'B'); await p.click('#m-add');
    ok('blocked storage still works for the visit', await p.isVisible('#round') && !p.errors.length, p.errors);
    await p.context().close();

    // 15. layout with everything open on small phones, light and dark
    for (const w of [320, 360, 390]) for (const theme of ['dark', 'light']) {
        const st = seed(); st.committees[0].members[0].name = 'Muhammad Abdullah Khan Niazi the Elder of the Family';
        p = await load(b, { width: w, height: 800 }, { state: st, theme });
        await payBox(p, 'Hina').locator('button', { hasText: 'Part payment' }).click();
        await memBox(p, 'Hina').locator('button', { hasText: 'Reminder' }).click();
        await p.click('#m-phone-open');
        let o = await overlaps(p);
        ok('w' + w + ' ' + theme + ': no overlaps or side scroll (panels open)', !o.bad.length && !o.sw, o);
        await memBox(p, 'Sara').locator('button', { hasText: 'Edit' }).click();
        await p.click('#edit-c');
        o = await overlaps(p);
        ok('w' + w + ' ' + theme + ': no overlaps with edit forms open', !o.bad.length && !o.sw, o);
        const fits = await p.evaluate(() => [...document.querySelectorAll('main input[placeholder]')].filter(i => i.offsetWidth).every(i => { const c = document.createElement('canvas').getContext('2d'); const cs = getComputedStyle(i); c.font = cs.fontSize + ' ' + cs.fontFamily; return c.measureText(i.placeholder).width <= i.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) + 1; }));
        ok('w' + w + ' ' + theme + ': placeholders fit', fits);
        await p.context().close();
    }
    // 16. light/dark switch and Help
    p = await load(b, { width: 390, height: 844 }, { state: seed() });
    await p.click('.theme-toggle'); ok('theme switch', (await p.getAttribute('html', 'data-theme')) === 'light');
    for (const w of [320, 390, 820, 1280]) {
        await p.setViewportSize({ width: w, height: 800 });
        await p.click('.topbar .help-btn, .topbar button[aria-label*="elp"]');
        const d = await p.evaluate(() => { const e = document.querySelector('dialog'); const r = e.getBoundingClientRect(); return { open: e.open, inside: r.left >= 0 && r.right <= innerWidth && r.top >= 0, title: e.textContent.includes('How to use Committee') }; });
        ok('help at ' + w, d.open && d.inside && d.title, d);
        await p.keyboard.press('Escape');
        ok('Escape closes help at ' + w, !(await p.evaluate(() => document.querySelector('dialog').open)));
    }
    await p.context().close();

    if (shots) {
        for (const [w, h, n] of [[1280, 900, 'desktop'], [390, 844, 'phone']]) {
            p = await load(b, { width: w, height: h }, { state: seed() });
            await p.screenshot({ path: path.join(__dirname, 'screenshots', n + '.png'), fullPage: w > 500 ? false : false });
            await p.context().close();
        }
        console.log('screenshots saved');
    }
}
main().catch(e => { console.error(e); process.exit(1); });
