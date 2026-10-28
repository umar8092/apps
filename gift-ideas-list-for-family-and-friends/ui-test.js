// Drives the real page in headless Chromium. Run from the repo root:
//   node gift-ideas-list-for-family-and-friends/ui-test.js [--base http://localhost:8765] [--shots]
// --base defaults to a local server you start yourself (python3 -m http.server 8765 in the repo root).
// --shots also saves screenshots/desktop.png and screenshots/phone.png.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const args = process.argv.slice(2);
const bi = args.indexOf('--base'), BASE = (bi >= 0 ? args[bi + 1] : 'http://localhost:8765').replace(/\/$/, '');
const URL = BASE + '/gift-ideas-list-for-family-and-friends/';
const KEY = 'gift-ideas-list-for-family-and-friends.state';
const DIR = __dirname;
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; if (!cond) console.log('FAIL ' + name + (extra ? '  ' + extra : '')); };
const NOW = new Date('2026-10-29T10:00:00');

async function open(browser, width, opts) {
    opts = opts || {};
    const ctx = await browser.newContext({ viewport: { width, height: width < 600 ? 800 : 900 }, deviceScaleFactor: opts.scale || 1, colorScheme: opts.scheme || 'dark', locale: 'en-GB', acceptDownloads: true });
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE }).catch(() => {});
    await ctx.route(/goatcounter\.com|gc\.zgo\.at/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
    const page = await ctx.newPage();
    await page.clock.setFixedTime(opts.now || NOW);
    page.errors = [];
    page.on('pageerror', e => page.errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') page.errors.push(m.text()); });
    page.bad = [];
    page.on('response', r => { if (r.status() >= 400 && r.url().startsWith(BASE)) page.bad.push(r.status() + ' ' + r.url()); });
    if (opts.block) await page.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
    if (opts.state !== undefined) await page.addInitScript(([k, v]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, v); sessionStorage.setItem('seeded', '1'); } }, [KEY, opts.state]);
    await page.goto(URL, { waitUntil: 'load' });
    return page;
}
const saved = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
const box = (page, name) => page.locator('.person', { has: page.locator('.c-name', { hasText: new RegExp('^' + name.replace(/[()]/g, '\\$&') + '$') }) });
const gift = (page, person, what) => box(page, person).locator('.gift', { has: page.locator('.g-what', { hasText: new RegExp('^' + what + '$') }) });
const text = async (page, sel) => (await page.locator(sel).first().innerText()).replace(/\s+/g, ' ').trim();
const clean = s => s.replace(/\s+/g, ' ').trim();

// realistic filled-in state: Hina's family on Thu 29 Oct 2026
const I = (id, what, st, x) => Object.assign({ id, what, st, price: null, paid: null, occ: '', where: '', link: '', note: '' }, x || {});
const SEED = { v: 1, cur: '', people: [
    { id: 'p1', name: 'Sana (sister)', likes: 'Size M, shoe size 38. Loves green and gold. No sweets.', occ: [{ id: 'o1', name: 'Birthday', kind: 'yearly', d: 16, m: 11, budget: 600000 }, { id: 'o2', name: 'Eid ul-Fitr', kind: 'once', date: '2027-03-10', budget: 300000 }], ideas: [
        I('g1', 'Rose perfume, 50 ml', 'bought', { price: 450000, paid: 420000, occ: 'o1', bd: '2026-10-20', keep: 'Top shelf of the wardrobe', where: 'Dolmen Mall' }),
        I('g2', 'Green silk dupatta', 'idea', { price: 250000, occ: 'o1', where: 'Khaadi', link: 'https://www.khaadi.com/pk/' }),
        I('g3', 'The Forty Rules of Love (book)', 'idea', { price: 180000, occ: 'o2', note: 'She started it at Nani\'s and never finished it' }),
        I('g4', 'Perfume', 'given', { paid: 380000, gd: '2025-11-16', go: 'o1', gon: 'Birthday', bd: '2025-11-10' }),
        I('g5', 'Gold earrings', 'given', { paid: 900000, gd: '2025-03-31', go: '', gon: 'Eid ul-Fitr', bd: '2025-03-25' })] },
    { id: 'p2', name: 'Ammi and Abbu', likes: '', occ: [{ id: 'o3', name: 'Anniversary', kind: 'yearly', d: 6, m: 11, budget: 1000000 }], ideas: [
        I('g6', 'Framed family photo', 'idea', { price: 350000, occ: 'o3' }), I('g7', 'Dinner at Monal', 'idea', { price: 800000, occ: 'o3' })] },
    { id: 'p3', name: 'Ali (nephew)', likes: 'Turns 9. Loves cricket.', occ: [{ id: 'o4', name: 'Birthday', kind: 'yearly', d: 2, m: 12, budget: null }], ideas: [I('g8', 'Junior cricket bat', 'idea', { price: 550000, occ: 'o4' })] },
    { id: 'p4', name: 'Zara (best friend)', likes: '', occ: [{ id: 'o5', name: 'Wedding', kind: 'once', date: '2027-01-15', budget: 1500000 }], ideas: [] }] };

async function addPerson(page, o) {
    await page.fill('#p-name', o.name);
    if (o.d) { await page.selectOption('#p-bd-d', String(o.d)); await page.selectOption('#p-bd-m', String(o.m)); }
    if (o.budget != null) { if (await page.isVisible('#p-budget-open')) await page.click('#p-budget-open'); await page.fill('#p-budget', o.budget); }
    if (o.likes) { if (await page.isVisible('#p-likes-open')) await page.click('#p-likes-open'); await page.fill('#p-likes', o.likes); }
    await page.click('#p-save');
}
async function saveIdea(page, o) {
    if (o.who) await page.selectOption('#i-who', { label: o.who });
    await page.fill('#i-what', o.what);
    if (o.occ) await page.selectOption('#i-occ', { label: o.occ });
    if (o.price != null || o.where || o.link) {
        if (await page.isVisible('#i-more-open')) await page.click('#i-more-open');
        if (o.price != null) await page.fill('#i-price', o.price);
        if (o.where) await page.fill('#i-where', o.where);
        if (o.link) await page.fill('#i-link', o.link);
    }
    await page.click('#i-save');
}

async function main() {
    const browser = await chromium.launch();

    // ---------- first use, empty state, the main situation through the UI ----------
    let page = await open(browser, 390);
    ok('first use: intro shown', await page.isVisible('#intro'));
    ok('first use: no idea card or coming up yet', !(await page.isVisible('#idea-card')) && !(await page.isVisible('#soon')));
    ok('first use: restore link shown', await page.isVisible('#restore-first'));
    ok('optional fields hidden at first', !(await page.isVisible('#p-budget')) && !(await page.isVisible('#p-likes')));
    await page.click('#p-save');
    ok('blank name refused', (await text(page, '#p-name-err')).includes('Type a name'));
    await page.click('#quick .chip:has-text("Sister")');
    ok('quick pick fills the name', await page.inputValue('#p-name') === 'Sister');
    await page.fill('#p-name', 'Sana'); await page.selectOption('#p-bd-d', '16'); await page.click('#p-save');
    ok('day without month refused', (await text(page, '#p-bd-d-err')).includes('both the day and the month'));
    await page.selectOption('#p-bd-d', '31'); await page.selectOption('#p-bd-m', '4'); await page.click('#p-save');
    ok('31 April refused', (await text(page, '#p-bd-d-err')) === 'April has no day 31.');
    await page.selectOption('#p-bd-d', ''); await page.selectOption('#p-bd-m', '');
    await page.click('#p-budget-open'); await page.fill('#p-budget', '6000'); await page.click('#p-save');
    ok('budget without birthday refused', (await text(page, '#p-budget-err')).includes('Pick the birthday first'));
    await page.fill('#p-budget', '-6000'); await page.selectOption('#p-bd-d', '16'); await page.selectOption('#p-bd-m', '11'); await page.click('#p-save');
    ok('negative budget refused', (await text(page, '#p-budget-err')).includes('minus'));
    await addPerson(page, { name: 'Sana', d: 16, m: 11, budget: '6000', likes: 'Size M. Loves green.' });
    ok('person added with message', (await text(page, '#add-msg')).startsWith('Sana added.'));
    ok('form cleared after adding', await page.inputValue('#p-name') === '' && await page.inputValue('#p-bd-d') === '');
    ok('box shows next birthday', (await text(page, '#person-' + (await saved(page)).people[0].id + ' .tag')) === 'Birthday in 18 days');
    ok('idea card and coming up now shown', await page.isVisible('#idea-card') && await page.isVisible('#soon') && !(await page.isVisible('#intro')));
    await page.fill('#p-name', 'sana'); await page.click('#p-save');
    ok('duplicate name refused', (await text(page, '#p-name-err')).includes('already on the list'));
    await page.fill('#p-name', 'Mum'); await page.press('#p-name', 'Enter');
    ok('Enter adds a person (no birthday needed)', (await saved(page)).people.length === 2);

    // save ideas
    await page.selectOption('#i-who', { label: 'Sana' });
    ok('occasion defaults to the next one', (await page.locator('#i-occ option:checked').innerText()).startsWith('Birthday'));
    await page.click('#i-save');
    ok('blank idea refused', (await text(page, '#i-what-err')).includes('Type the gift'));
    await page.fill('#i-what', 'Rose perfume'); await page.click('#i-more-open'); await page.fill('#i-price', 'abc'); await page.click('#i-save');
    ok('bad price refused', (await text(page, '#i-price-err')).length > 5);
    await page.fill('#i-price', '4500'); await page.fill('#i-link', 'javascript:alert(1)'); await page.click('#i-save');
    ok('javascript link refused', (await text(page, '#i-link-err')).includes('web link'));
    await page.fill('#i-link', 'dolmenmall.com/perfume'); await page.fill('#i-where', 'Dolmen Mall'); await page.click('#i-save');
    ok('idea saved message', (await text(page, '#idea-msg')) === 'Saved for Sana: Rose perfume. Undo');
    ok('idea form cleared, optional box closed', await page.inputValue('#i-what') === '' && !(await page.isVisible('#i-price')));
    ok('who is kept for the next idea', (await page.locator('#i-who option:checked').innerText()) === 'Sana');
    let s = await saved(page);
    ok('idea stored exactly', JSON.stringify(s.people[0].ideas[0].price) === '450000' && s.people[0].ideas[0].link === 'https://dolmenmall.com/perfume');
    await page.fill('#i-what', 'Green silk scarf'); await page.click('#i-save');
    ok('idea with only a name is fine (optional fields not forced)', (await saved(page)).people[0].ideas.length === 2);
    const linkEl = gift(page, 'Sana', 'Rose perfume').locator('a.g-link');
    ok('link shown as text, opens in new tab', (await linkEl.innerText()) === 'Open link: dolmenmall.com' && await linkEl.getAttribute('target') === '_blank' && (await linkEl.getAttribute('rel')).includes('noopener'));

    // bought it
    await gift(page, 'Sana', 'Rose perfume').locator('button:has-text("Bought it")').click();
    ok('bought form prefilled with the rough price and today', await page.inputValue('.inline-form [id$="-paid"]') === '4500' && await page.inputValue('.inline-form [id$="-bd"]') === '2026-10-29');
    await page.fill('.inline-form [id$="-paid"]', '4200'); await page.fill('.inline-form [id$="-keep"]', 'Top of the wardrobe');
    await page.click('button:has-text("Mark as bought")');
    const sid = (await saved(page)).people.find(x => x.name === 'Sana').id;
    ok('budget after buying: 4,200 spent of 6,000: 1,800 left', (await text(page, '#person-' + sid + ' .occ .o-bud')) === '4,200 spent of 6,000: 1,800 left');
    ok('coming up shows Sana birthday next', (await text(page, '#soon-body .s-big')) === 'Next: Sana, Birthday' && (await text(page, '#soon-body .s-when')) === 'Mon 16 Nov (in 18 days)');
    ok('coming up: bought, not given yet', (await text(page, '#soon-body')).includes('Bought, not given yet: 1 gift, 4,200') && (await text(page, '#soon-body')).includes('Sana: Rose perfume (kept: Top of the wardrobe)'));
    ok('spent this year', (await text(page, '#soon-body .s-spent')) === 'Spent on gifts in 2026: 4,200 on 1 gift');
    // given it
    await gift(page, 'Sana', 'Rose perfume').locator('button:has-text("Given it")').click();
    ok('given form for a bought gift does not ask the price again', !(await page.isVisible('.inline-form [id$="-paid"]')));
    await page.fill('.inline-form [id$="-gd"]', '2026-11-01'); await page.click('button:has-text("Mark as given")');
    ok('future given day refused', (await text(page, '.inline-form [id$="-gd-err"]')).includes('future'));
    await page.fill('.inline-form [id$="-gd"]', '2026-10-29'); await page.click('button:has-text("Mark as given")');
    s = await saved(page);
    const rp = s.people.find(x => x.name === 'Sana').ideas.find(i => i.what === 'Rose perfume');
    ok('given stored with occasion name', rp.st === 'given' && rp.gd === '2026-10-29' && rp.gon === 'Birthday' && rp.paid === 420000);
    ok('given early still counts for this birthday', (await text(page, '#person-' + sid + ' .occ .o-bud')) === '4,200 spent of 6,000: 1,800 left');
    ok('Already given list shows it', (await text(page, '#person-' + sid)).includes('Already given'));
    // repeat warning
    await page.fill('#i-what', 'Dior perfume');
    ok('repeat warning while typing', (await text(page, '#i-rep')) === 'Heads up: you gave Sana "Rose perfume" for Birthday 2026.');
    await page.fill('#i-what', 'Handbag');
    ok('no warning for a new kind of gift', !(await page.isVisible('#i-rep')));
    // edit back to idea (fixing a mistake), then undo
    await gift(page, 'Sana', 'Rose perfume').locator('button:has-text("Edit")').click();
    ok('edit of a given gift shows Given for, not two occasion boxes', await page.isVisible('.inline-form [id$="-go"]') && !(await page.isVisible('.inline-form [id$="-occ"]')));
    await page.selectOption('.inline-form [id$="-st"]', 'idea');
    ok('status idea hides bought and given fields', !(await page.isVisible('.inline-form [id$="-paid"]')) && !(await page.isVisible('.inline-form [id$="-gd"]')));
    await page.click('.inline-form button:has-text("Save changes")');
    ok('put back to an idea', (await saved(page)).people.find(x => x.name === 'Sana').ideas.find(i => i.what === 'Rose perfume').st === 'idea');
    await page.click('#person-' + sid + ' .msg .undo');
    ok('undo brings back given', (await saved(page)).people.find(x => x.name === 'Sana').ideas.find(i => i.what === 'Rose perfume').st === 'given');
    // give an idea straight away (handmade): price asked, day bought not asked
    await gift(page, 'Sana', 'Green silk scarf').locator('button:has-text("Given it")').click();
    ok('give an idea directly: price asked, day bought and kept not asked', await page.isVisible('.inline-form [id$="-paid"]') && !(await page.isVisible('.inline-form [id$="-bd"]')) && !(await page.isVisible('.inline-form [id$="-keep"]')));
    await page.click('.inline-form button:has-text("Cancel")');
    ok('cancel closes the form', await page.locator('.inline-form').count() === 0);
    // edit name and copy to another person
    await gift(page, 'Sana', 'Green silk scarf').locator('button:has-text("Edit")').click();
    await page.fill('.inline-form [id$="-what"]', 'Green silk scarf, long');
    await page.selectOption('.inline-form [id$="-copy"]', { label: 'Mum' });
    await page.click('.inline-form button:has-text("Save changes")');
    s = await saved(page);
    ok('edit saved and copied to Mum', s.people.find(x => x.name === 'Sana').ideas.some(i => i.what === 'Green silk scarf, long') && s.people.find(x => x.name === 'Mum').ideas.some(i => i.what === 'Green silk scarf, long'));
    // delete with undo
    await gift(page, 'Mum', 'Green silk scarf, long').locator('button:has-text("Delete")').click();
    ok('idea deleted', (await saved(page)).people.find(x => x.name === 'Mum').ideas.length === 0);
    await box(page, 'Mum').locator('.msg .undo').click();
    ok('undo brings it back', (await saved(page)).people.find(x => x.name === 'Mum').ideas.length === 1);

    // occasions
    await box(page, 'Mum').locator('button:has-text("+ Add an occasion")').click();
    await page.click('.inline-form .chip:has-text("Anniversary")');
    await page.click('.inline-form button:has-text("Add occasion")');
    ok('yearly occasion needs a day', (await text(page, '.inline-form .err >> nth=1')).includes('Pick the day'));
    await page.selectOption('.inline-form select[id$="-d"]', '6'); await page.selectOption('.inline-form select[id$="-m"]', '11');
    await page.click('.inline-form button:has-text("+ Budget (optional)")'); await page.fill('.inline-form [id$="-budget"]', '10000');
    await page.click('.inline-form button:has-text("Add occasion")');
    ok('anniversary added', (await text(page, '.person .msg.show')).includes('Added Anniversary for Mum: Fri 6 Nov (in 8 days).'));
    ok('nothing bought yet warning (8 days away)', (await text(page, '#soon-body')).includes('Nothing bought yet'));
    ok('Mum now first in coming up', (await text(page, '#soon-body .s-big')) === 'Next: Mum, Anniversary');
    await box(page, 'Mum').locator('button:has-text("+ Add an occasion")').click();
    await page.click('.inline-form .chip:has-text("Christmas")');
    ok('Christmas fills 25 December', await page.inputValue('.inline-form select[id$="-d"]') === '25' && await page.inputValue('.inline-form select[id$="-m"]') === '12');
    await page.click('.inline-form button:has-text("Add occasion")');
    await box(page, 'Mum').locator('button:has-text("+ Add an occasion")').click();
    await page.click('.inline-form .chip:has-text("Eid ul-Fitr")');
    ok('Eid is one time', await page.isVisible('.inline-form input[type=date]') && !(await page.isVisible('.inline-form select[id$="-d"]')));
    await page.click('.inline-form button:has-text("Add occasion")');
    ok('one time needs a date', (await text(page, '.inline-form [id$="-date-err"]')) === 'Pick a date.');
    await page.fill('.inline-form input[type=date]', '2027-03-10'); await page.click('.inline-form button:has-text("Add occasion")');
    await box(page, 'Mum').locator('button:has-text("+ Add an occasion")').click();
    await page.locator('.inline-form .chip', { hasText: /^Other$/ }).click();
    await page.check('.inline-form input[value="none"]');
    await page.click('.inline-form button:has-text("Add occasion")');
    ok('Other needs a name', (await text(page, '.inline-form [id$="-name-err"]')).includes('Type a name'));
    await page.fill('.inline-form [id$="-name"]', 'Christmas'); await page.click('.inline-form button:has-text("Add occasion")');
    ok('same occasion twice refused', (await text(page, '.inline-form [id$="-name-err"]')).includes('already has Christmas'));
    await page.fill('.inline-form [id$="-name"]', 'Housewarming'); await page.click('.inline-form button:has-text("Add occasion")');
    s = await saved(page);
    ok('four occasions for Mum', s.people.find(x => x.name === 'Mum').occ.map(o => o.name + ':' + o.kind).join() === 'Anniversary:yearly,Christmas:yearly,Eid ul-Fitr:once,Housewarming:none');
    ok('no date shown as such', (await text(page, '#person-' + s.people.find(x => x.name === 'Mum').id)).includes('No date yet'));
    // edit occasion
    const mumOcc = box(page, 'Mum').locator('.occ', { hasText: 'Eid ul-Fitr' });
    await mumOcc.locator('button:has-text("Edit")').click();
    await page.fill('.inline-form input[type=date]', '2027-03-09'); await page.click('.inline-form button:has-text("Save changes")');
    ok('occasion edited', (await saved(page)).people.find(x => x.name === 'Mum').occ.find(o => o.name === 'Eid ul-Fitr').date === '2027-03-09');
    // delete occasion: its ideas move to Any occasion
    await gift(page, 'Mum', 'Green silk scarf, long').locator('button:has-text("Edit")').click();
    await page.selectOption('.inline-form [id$="-occ"]', { label: 'Christmas (Fri 25 Dec)' });
    await page.click('.inline-form button:has-text("Save changes")');
    await box(page, 'Mum').locator('.occ', { hasText: 'Christmas' }).locator('button:has-text("Delete")').click();
    ok('delete occasion message', (await text(page, '#person-' + s.people.find(x => x.name === 'Mum').id + ' .msg')).includes('now say "Any occasion"'));
    ok('idea moved to Any occasion', (await saved(page)).people.find(x => x.name === 'Mum').ideas[0].occ === '');
    // edit person
    await box(page, 'Mum').locator('button:has-text("Edit person")').click();
    await page.fill('.inline-form [id$="-name"]', 'Sana'); await page.click('.inline-form button:has-text("Save changes")');
    ok('rename to an existing name refused', (await text(page, '.inline-form [id$="-name-err"]')).includes('already on the list'));
    await page.fill('.inline-form [id$="-name"]', 'Ammi'); await page.click('.inline-form button:has-text("Save changes")');
    ok('renamed, idea card follows', await box(page, 'Ammi').count() === 1 && (await page.locator('#i-who option').allInnerTexts()).includes('Ammi'));
    // copy and email
    await box(page, 'Sana').locator('button:has-text("Copy their list")').click();
    const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
    ok('copy their list', clip.startsWith('Sana\nBirthday: Mon 16 Nov (in 18 days), budget 6,000') && clip.includes('Already given: Rose perfume (Birthday 2026)'), clip.slice(0, 120));
    const mail = await page.getAttribute('#mail', 'href');
    ok('email link with no recipient and the list in the body', mail.startsWith('mailto:?subject=Gift%20ideas&body=') && decodeURIComponent(mail).includes('Coming up:'));
    await page.click('#copy'); await page.waitForSelector('#soon-msg.show');
    ok('copy the list message', (await text(page, '#soon-msg')).startsWith('Copied the list.'), await text(page, '#soon-msg'));
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#ics')]);
    const ics = fs.readFileSync(await dl.path(), 'utf8');
    ok('calendar file', dl.suggestedFilename() === 'gift-days.ics' && ics.includes('SUMMARY:Sana: Birthday') && ics.includes('TRIGGER:-P7D'));
    // currency
    await page.selectOption('#cur', 'Rs');
    ok('currency shown', (await text(page, '#person-' + sid + ' .occ .o-bud')) === 'Rs 4,200 spent of Rs 6,000: Rs 1,800 left' && await page.isVisible('#i-price-cur') === false);
    // reload keeps everything
    await page.reload();
    ok('reload keeps people, currency and gifts', (await saved(page)).cur === 'Rs' && await box(page, 'Sana').count() === 1 && (await text(page, '#soon-body')).includes('Rs'));
    ok('no errors in the main run', page.errors.length === 0 && page.bad.length === 0, page.errors.concat(page.bad).join(' | '));
    // photo
    const png = path.join(DIR, 'icons', 'icon-192.png');
    await page.click('#i-note-open'); await page.setInputFiles('#i-photo', png);
    await page.waitForSelector('#i-photo-prev img');
    await page.selectOption('#i-who', { label: 'Sana' });
    await page.fill('#i-what', 'Photo frame'); await page.click('#i-save');
    s = await saved(page);
    const ph = s.people.find(x => x.name === 'Sana').ideas.find(i => i.what === 'Photo frame');
    ok('photo saved small as JPEG', ph && /^data:image\/jpeg;base64,/.test(ph.photo) && ph.photo.length < 60000);
    ok('photo shown in the box', await gift(page, 'Sana', 'Photo frame').locator('img.g-photo').count() === 1);
    await page.click('#i-note-open').catch(() => {});
    if (!(await page.isVisible('#i-photo'))) await page.click('#i-note-open');
    await page.setInputFiles('#i-photo', { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
    ok('non-photo file refused', (await text(page, '#i-photo-err')).includes('not a photo'));
    // edit removes photo
    await gift(page, 'Sana', 'Photo frame').locator('button:has-text("Edit")').click();
    await page.click('.inline-form button:has-text("Remove photo")'); await page.click('.inline-form button:has-text("Save changes")');
    ok('photo removed', !(await saved(page)).people.find(x => x.name === 'Sana').ideas.find(i => i.what === 'Photo frame').photo);
    // long text
    await page.selectOption('#i-who', { label: 'Sana' });
    await page.fill('#i-what', 'W'.repeat(120)); await page.click('#i-save');
    ok('very long name cut to 80', (await saved(page)).people.find(x => x.name === 'Sana').ideas.some(i => i.what === 'W'.repeat(80)));
    ok('no sideways scroll with long text', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    // backup and restore
    const [bk] = await Promise.all([page.waitForEvent('download'), page.click('#backup')]);
    const backup = fs.readFileSync(await bk.path(), 'utf8');
    ok('backup file', bk.suggestedFilename() === 'gift-ideas-backup-2026-10-29.json' && JSON.parse(backup).people.length === 2);
    await page.click('#del-all');
    ok('delete everything', (await saved(page)).people.length === 0 && await page.isVisible('#intro'));
    await page.click('#top-msg .undo');
    ok('undo delete everything', (await saved(page)).people.length === 2);
    await page.click('#del-all');
    await page.setInputFiles('#restore-file', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"nope":1}') });
    ok('bad backup refused', (await text(page, '#add-msg')).includes('not a backup'));
    await page.setInputFiles('#restore-file', { name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(backup) });
    ok('restore works', (await text(page, '#top-msg')).startsWith('Restored 2 people') && (await saved(page)).people.length === 2);
    ok('no errors after photo and backup', page.errors.length === 0, page.errors.join(' | '));
    await page.context().close();

    // ---------- corrupt and blocked storage ----------
    page = await open(browser, 390, { state: '{not json' });
    ok('corrupt saved state: fresh start with a message', (await text(page, '#top-msg')).includes('could not be read') && await page.isVisible('#intro'));
    await page.context().close();
    page = await open(browser, 390, { state: JSON.stringify({ people: [{ id: 'x', name: 'Ok', occ: [{ id: 'o', name: 'B', kind: 'yearly', d: 40, m: 2 }], ideas: [{ id: 'i', what: 'Y', st: 'weird' }] }] }) });
    ok('half-broken saved state keeps what is valid', await box(page, 'Ok').count() === 1 && (await saved(page)) !== null && page.errors.length === 0);
    await page.context().close();
    page = await open(browser, 390, { block: true });
    ok('blocked storage warns', await page.isVisible('#store-warn'));
    await addPerson(page, { name: 'Test' });
    ok('blocked storage still works for this visit', await box(page, 'Test').count() === 1 && page.errors.length === 0, page.errors.join(' | '));
    await page.context().close();

    // ---------- a new year: the birthday rolls on, the budget starts again ----------
    page = await open(browser, 390, { state: JSON.stringify(SEED), now: new Date('2026-11-17T09:00:00') });
    ok('day after birthday: next is next year, budget starts again', (await text(page, '#person-p1 .occ:has-text("Birthday") .o-when')) === 'Tue 16 Nov 2027 (in 364 days)' && (await text(page, '#person-p1 .occ:has-text("Birthday") .o-bud')) === '4,200 spent of 6,000: 1,800 left');
    await page.context().close();
    page = await open(browser, 390, { state: JSON.stringify(SEED), now: new Date('2027-03-12T09:00:00') });
    ok('one-time Eid passed: asks for next date', (await text(page, '#person-p1 .occ:has-text("Eid")')).includes('Was on Wed 10 Mar') && (await text(page, '#person-p1 .occ:has-text("Eid")')).includes('Tap Edit to pick the next date'));
    await page.context().close();

    // ---------- find a person ----------
    const many = JSON.parse(JSON.stringify(SEED));
    many.people.push({ id: 'p5', name: 'Bilal', likes: '', occ: [], ideas: [] }, { id: 'p6', name: 'Khala', likes: '', occ: [], ideas: [] });
    page = await open(browser, 390, { state: JSON.stringify(many) });
    ok('find box with 5 or more people', await page.isVisible('#find'));
    await page.fill('#find', 'kha');
    ok('find filters', await page.locator('#p-list .person:visible').count() === 1);
    await page.fill('#find', 'zzz');
    ok('find none message', await page.isVisible('#find-none'));
    await page.fill('#find', '');
    await page.click('#soon-body .u-name >> nth=0');
    ok('coming up names jump to the box', await page.evaluate(() => document.activeElement && document.activeElement.classList.contains('c-name')));
    await page.context().close();

    // ---------- filled state checks: coming up words ----------
    page = await open(browser, 1280, { state: JSON.stringify(SEED) });
    const soon = await text(page, '#soon-body');
    ok('coming up: Ammi and Abbu anniversary first, nothing bought yet', soon.startsWith('Next: Ammi and Abbu, Anniversary Fri 6 Nov (in 8 days) 2 ideas · Budget 10,000: nothing spent yet Nothing bought yet'), soon.slice(0, 160));
    ok('coming up: after that list', soon.includes('Sana (sister), Birthday: Mon 16 Nov (in 18 days)') && soon.includes('Ali (nephew), Birthday: Wed 2 Dec (in 34 days)'));
    ok('repeat warning on a saved idea', (await text(page, '#person-p1')).includes('Rose perfume, 50 ml') && (await text(page, '#person-p1 .gift.k-bought')).includes('Heads up: you gave Sana (sister) "Perfume" for Birthday 2025.'));
    // light/dark switch
    const before = await page.evaluate(() => getComputedStyle(document.body).color);
    await page.click('.theme-toggle');
    const after = await page.evaluate(() => getComputedStyle(document.body).color);
    ok('light/dark switch changes the look', before !== after);
    await page.context().close();

    // ---------- help, layout and sizes ----------
    for (const w of [320, 390, 820, 1280]) {
        page = await open(browser, w, { state: JSON.stringify(SEED) });
        await page.click('.help-btn, button:has-text("Help")');
        const d = page.locator('dialog[open], .help-dialog[open], [role=dialog]').first();
        await d.waitFor();
        const r = await d.boundingBox();
        ok('help fits at ' + w, r && r.x >= 0 && r.x + r.width <= w + 1 && (await d.innerText()).includes('How to use the Gift Ideas List'));
        await page.keyboard.press('Escape');
        ok('help closes with Escape at ' + w, !(await d.isVisible()));
        await page.click('.help-btn, button:has-text("Help")');
        await page.click('button:has-text("Got it")');
        ok('help closes with Got it at ' + w, !(await d.isVisible()));
        await page.context().close();
    }
    async function overlaps(page) {
        return page.evaluate(() => {
            const els = [...document.querySelectorAll('input:not([type=radio]):not([type=file]), select, button, textarea, a.secondary')].filter(e => e.offsetParent);
            const bad = [];
            for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
                const a = els[i].getBoundingClientRect(), b = els[j].getBoundingClientRect();
                if (a.width && b.width && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) bad.push((els[i].id || els[i].textContent.slice(0, 20)) + ' x ' + (els[j].id || els[j].textContent.slice(0, 20)));
            }
            return bad;
        });
    }
    for (const w of [320, 360, 390]) {
        page = await open(browser, w, { state: JSON.stringify(SEED) });
        for (const b of ['#i-more-open', '#i-note-open', '#p-budget-open', '#p-likes-open']) await page.click(b);
        await page.click('#person-p1 .gift:has-text("Green silk") button:has-text("Edit")');
        let o = await overlaps(page);
        ok('no overlapping controls with everything open at ' + w, o.length === 0, o.slice(0, 4).join(', '));
        await page.click('#person-p2 button:has-text("+ Add an occasion")');
        o = await overlaps(page);
        ok('no overlapping controls in the occasion form at ' + w, o.length === 0, o.slice(0, 4).join(', '));
        const ph = await page.evaluate(() => [...document.querySelectorAll('input[placeholder]')].filter(i => i.offsetParent).filter(i => { const c = document.createElement('canvas').getContext('2d'); const cs = getComputedStyle(i); c.font = cs.fontSize + ' ' + cs.fontFamily; return c.measureText(i.placeholder).width > i.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) + 1; }).map(i => i.id));
        ok('placeholders fit at ' + w, ph.length === 0, ph.join(', '));
        await page.context().close();
    }
    for (const scheme of ['dark', 'light']) for (const w of [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920]) {
        for (const st of [SEED, { v: 1, cur: '', people: [] }]) {
            page = await open(browser, w, { scheme, state: JSON.stringify(st) });
            const wide = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1 || [...document.querySelectorAll('main *')].some(e => { const r = e.getBoundingClientRect(); return r.width && r.right > innerWidth + 1 && getComputedStyle(e).position !== 'fixed'; }));
            ok('no sideways scroll ' + scheme + ' ' + w + (st.people.length ? ' filled' : ' empty'), !wide);
            if (w >= 900 && st.people.length) {
                for (const pos of ['top', 'middle', 'bottom']) {
                    await page.evaluate(p => scrollTo(0, p === 'top' ? 0 : p === 'middle' ? document.body.scrollHeight / 2 : document.body.scrollHeight), pos);
                    const ov = await page.evaluate(() => {
                        const kids = [...document.querySelectorAll('main.app > *, .col-a > *, .col-b > *')].filter(e => e.offsetParent && !e.classList.contains('col-a') && !e.classList.contains('col-b'));
                        const bad = [];
                        for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
                            if (kids[i].parentElement !== kids[j].parentElement) continue;
                            const a = kids[i].getBoundingClientRect(), b = kids[j].getBoundingClientRect();
                            if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) bad.push(kids[i].className + ' x ' + kids[j].className);
                        }
                        const ca = document.querySelector('.col-a').getBoundingClientRect(), cb = document.querySelector('.col-b').getBoundingClientRect();
                        if (ca.right > cb.left + 1) bad.push('columns');
                        return bad;
                    });
                    ok('no overlap at ' + w + ' ' + scheme + ' scrolled ' + pos, ov.length === 0, ov.join(', '));
                }
            }
            ok('no errors ' + scheme + ' ' + w, page.errors.length === 0 && page.bad.length === 0, page.errors.concat(page.bad).join(' | '));
            await page.context().close();
        }
    }

    // ---------- screenshots ----------
    if (args.includes('--shots')) {
        page = await open(browser, 1280, { state: JSON.stringify(SEED) });
        await page.setViewportSize({ width: 1280, height: 1560 });
        await page.screenshot({ path: path.join(DIR, 'screenshots', 'desktop.png') });
        await page.context().close();
        page = await open(browser, 390, { state: JSON.stringify(SEED), scale: 2 });
        await page.setViewportSize({ width: 390, height: 1500 });
        await page.screenshot({ path: path.join(DIR, 'screenshots', 'phone.png') });
        await page.context().close();
    }
    await browser.close();
    console.log(pass + ' passed, ' + fail + ' failed');
    if (fail) process.exitCode = 1;
}
main().catch(e => { console.error(e); process.exit(1); });
