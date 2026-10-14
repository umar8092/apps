// Drives the real page in headless Chromium: node ui-test.js [--shots] [--base https://umar8092.github.io/apps]
// Without --base it serves this repo on localhost. With --base it tests the LIVE page. The clock is Wed 14 Oct 2026, 10:00.
const pw = (() => { for (const m of ['playwright', 'playwright-core']) { try { return require(m); } catch (e) { /* next */ } } throw new Error('playwright not found'); })();
const path = require('path'), fs = require('fs'), http = require('http');
const bi = process.argv.indexOf('--base');
const shots = process.argv.includes('--shots');
let fail = 0, url;
const ok = (name, cond, extra) => { if (!cond) fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond || extra == null ? '' : '  -> ' + JSON.stringify(extra))); };
const NOW = new Date(2026, 9, 14, 10, 0).getTime();
const SLUG = 'weekly-meal-planner-with-shopping-list', KEY = SLUG + '.v1';

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

// The Khan family's week: 4 people, Uncle and Aunt over for Tuesday's curry (6), leftovers Wednesday, eating out Friday.
const EX = {
    bol: ['Spaghetti bolognese', 4, '500 g beef mince\n1 onion\n2 cloves garlic\n1 tin chopped tomatoes\n2 tbsp tomato puree\n400 g spaghetti\n50 g parmesan\nOlive oil'],
    cur: ['Chicken curry', 4, '600 g chicken thighs\n2 onions\n3 cloves garlic\n2 tbsp curry paste\n1 tin coconut milk\n300 g basmati rice\n1 bunch coriander'],
    faj: ['Chicken fajitas', 4, '500 g chicken breast\n2 red peppers\n1 onion\n8 tortilla wraps\n150 ml sour cream\n1 lime'],
    sal: ['Salmon with potatoes and green beans', 4, '4 salmon fillets\n1 kg potatoes\n300 g green beans\n1 lemon\n2 tbsp olive oil'],
    dal: ['Daal and rice', 4, '250 g red lentils\n1 onion\n2 cloves garlic\n1 tin chopped tomatoes\n1 tsp turmeric\n1 tsp cumin seeds\n300 g basmati rice'],
    sti: ['Vegetable stir fry', 2, '200 g egg noodles\n1 red pepper\n1 head broccoli\n2 carrots\n2 tbsp soy sauce\n1 tbsp sesame oil'],
    oml: ['Cheese omelette', 1, '3 eggs\n1 tbsp butter\n30 g cheddar']
};
function seed() {
    const meals = Object.entries(EX).map(([id, [name, makes, ingredients]]) => ({ id, name, makes, ingredients }));
    const d = (meal, people) => [{ id: 'e' + Math.random().toString(36).slice(2, 7), slot: 'dinner', meal, people: people || 4 }];
    return { v: 1, settings: { people: 4, weekStart: 1, slots: ['dinner'] }, meals, ticks: {}, extras: {},
        plan: { '2026-10-12': d('bol'), '2026-10-13': d('cur', 6), '2026-10-14': [{ id: 'l1', slot: 'dinner', note: 'Leftovers', people: 4 }], '2026-10-15': d('faj'),
            '2026-10-16': [{ id: 'o1', slot: 'dinner', note: 'Eating out', people: 4 }], '2026-10-17': d('sal'), '2026-10-18': d('dal') } };
}

async function load(b, vp, opt = {}) {
    const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: vp.width < 500 ? 2 : 1, colorScheme: opt.theme || 'dark', locale: 'en-GB',
        permissions: ['clipboard-read', 'clipboard-write'], acceptDownloads: true, serviceWorkers: 'block' });
    await ctx.route(/goatcounter\.com|gc\.zgo\.at/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
    if (opt.state !== undefined) await ctx.addInitScript(([k, s]) => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem(k, s); } }, [KEY, typeof opt.state === 'string' ? opt.state : JSON.stringify(opt.state)]);
    if (opt.block) await ctx.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
    const page = await ctx.newPage();
    page.errors = [];
    page.on('pageerror', e => page.errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') page.errors.push(m.text()); });
    if (opt.clock) await page.clock.install({ time: opt.clock }); else await page.clock.setFixedTime(NOW);
    await page.goto(url, { waitUntil: 'networkidle' });
    return page;
}
const txt = (p, sel) => p.locator(sel).first().textContent();
const items = p => p.$$eval('#groups .item', els => els.map(e => [e.querySelector('.it-name').textContent, (e.querySelector('.it-amt') || {}).textContent || '']));
const amt = async (p, name) => { const it = (await items(p)).find(i => i[0] === name); return it ? it[1] : null; };
async function addAt(p, date, slot, choose, people) {
    await p.click(`.day[data-date="${date}"] .slot[data-slot="${slot}"] .add-btn`);
    await p.selectOption('#p-meal', { label: choose });
    if (people != null) await p.fill('#p-people', String(people));
    await p.click('#p-save');
}
async function noOverlap(p) {
    return p.evaluate(() => {
        const ctl = [...document.querySelectorAll('main input:not([type=checkbox]):not([type=file]), main select, main button, main a.secondary, main textarea')].filter(e => e.offsetParent && e.getBoundingClientRect().width > 0);
        const bad = [];
        for (let i = 0; i < ctl.length; i++) for (let j = i + 1; j < ctl.length; j++) {
            const a = ctl[i].getBoundingClientRect(), b = ctl[j].getBoundingClientRect();
            if (ctl[i].contains(ctl[j]) || ctl[j].contains(ctl[i])) continue;
            if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) bad.push((ctl[i].id || ctl[i].className) + ' / ' + (ctl[j].id || ctl[j].className));
        }
        return bad.slice(0, 4);
    });
}
const hscroll = p => p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
async function placeholdersFit(p) {
    return p.evaluate(() => [...document.querySelectorAll('main input[placeholder], main textarea[placeholder]')].filter(e => e.offsetParent).filter(e => {
        if (e.tagName === 'TEXTAREA') return false;
        const c = document.createElement('canvas').getContext('2d'), cs = getComputedStyle(e);
        c.font = cs.fontSize + ' ' + cs.fontFamily;
        return c.measureText(e.placeholder).width > e.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) + 1;
    }).map(e => e.id));
}

(async () => {
    let server;
    if (bi >= 0) url = process.argv[bi + 1].replace(/\/$/, '') + '/' + SLUG + '/';
    else { server = await serve(); url = 'http://localhost:' + server.address().port + '/' + SLUG + '/'; }
    const b = await pw.chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});

    // ---------- first use, empty state ----------
    let p = await load(b, { width: 390, height: 844 });
    ok('week range', await txt(p, '#week-range') === 'Mon 12 Oct to Sun 18 Oct 2026', await txt(p, '#week-range'));
    ok('today marked', (await p.$$('.day.today')).length === 1 && await p.locator('.day.today').getAttribute('data-date') === '2026-10-14');
    ok('dinner only at first', (await p.$$('.day[data-date="2026-10-12"] .slot')).length === 1);
    ok('empty list explains', /Add meals to the days/.test(await txt(p, '#list-empty')));
    ok('empty meals explains', /No meals yet/.test(await txt(p, '#meals-empty')) && await p.isVisible('#examples'));
    ok('copy/clear week disabled when empty', await p.isDisabled('#copy-last') && await p.isDisabled('#clear-week'));
    ok('optional inputs hidden at first', !(await p.isVisible('#pick')) && !(await p.isVisible('#meal-form')));
    ok('no console errors on first load', !p.errors.length, p.errors);

    // a first-timer: plan with a brand-new meal straight from the day
    await p.click('.day[data-date="2026-10-12"] .add-btn');
    ok('picker opens in the day with "A new meal" chosen when there are no meals', await p.isVisible('.day[data-date="2026-10-12"] #pick') && await p.inputValue('#p-meal') === 'new');
    ok('picker title', await txt(p, '#pick-h') === 'Add dinner on Monday 12 Oct');
    await p.click('#p-save');
    ok('new meal needs a name', /Type the name/.test(await txt(p, '#p-name-err')));
    await p.fill('#p-name', 'Spaghetti bolognese');
    await p.fill('#p-ing', EX.bol[2]);
    await p.fill('#p-people', '0'); await p.click('#p-save');
    ok('zero people refused', /at least 1/.test(await txt(p, '#p-people-err')));
    await p.fill('#p-people', '-3'); await p.click('#p-save');
    ok('negative refused', /below 1/.test(await txt(p, '#p-people-err')));
    await p.fill('#p-people', '2.5'); await p.click('#p-save');
    ok('decimal refused', /whole number/.test(await txt(p, '#p-people-err')));
    await p.fill('#p-people', '500'); await p.click('#p-save');
    ok('huge refused', /most is 50/.test(await txt(p, '#p-people-err')));
    await p.fill('#p-people', '4'); await p.click('#p-save');
    ok('added from the day', /Added Spaghetti bolognese on Monday 12 Oct/.test(await txt(p, '#week-msg')));
    ok('meal saved to My meals', (await p.$$('#meal-list .meal')).length === 1);
    ok('list has beef 500 g', await amt(p, 'Beef mince') === '500 g', await items(p));
    ok('list summary', /things to buy for 1 meal, Mon 12 Oct to Sun 18 Oct/.test(await txt(p, '#list-sum')), await txt(p, '#list-sum'));
    ok('which meal needs it', /Mon: Spaghetti bolognese/.test(await txt(p, '#groups .item')));
    // same name again is refused
    await p.click('.day[data-date="2026-10-13"] .add-btn');
    await p.selectOption('#p-meal', 'new'); await p.fill('#p-name', 'spaghetti BOLOGNESE'); await p.click('#p-save');
    ok('duplicate meal name refused', /already have a meal/.test(await txt(p, '#p-name-err')));
    await p.keyboard.press('Escape');
    ok('Escape closes picker', !(await p.isVisible('#pick')));
    // examples
    await p.click('#examples').catch(() => {});
    ok('examples hidden once there are meals', !(await p.isVisible('#examples')));
    await p.close();

    // ---------- examples from empty ----------
    p = await load(b, { width: 390, height: 844 });
    await p.click('#examples');
    ok('7 example meals', (await p.$$('#meal-list .meal')).length === 7 && /Added 7 example meals/.test(await txt(p, '#meals-msg')));
    ok('find box shows with 7 meals', await p.isVisible('#find'));
    await p.fill('#find', 'chick');
    ok('find filters', (await p.$$('#meal-list .meal')).length === 2);
    await p.fill('#find', 'zzz');
    ok('find nothing message', /No meal has "zzz"/.test(await txt(p, '#meals-empty')));
    await p.fill('#find', '');
    // the whole week through the UI
    await addAt(p, '2026-10-12', 'dinner', 'Spaghetti bolognese');
    await p.click('.day[data-date="2026-10-13"] .add-btn');
    await p.selectOption('#p-meal', { label: 'Chicken curry' });
    ok('people hint says the scale', /makes 4\. The list uses the recipe as it is/.test(await txt(p, '#p-people-hint')));
    await p.click('#p-pick-plus, .stepper button[data-for="p-people"][data-d="1"]'); await p.click('.stepper button[data-for="p-people"][data-d="1"]');
    ok('stepper to 6 and hint 1½ times', await p.inputValue('#p-people') === '6' && /1½ times every ingredient/.test(await txt(p, '#p-people-hint')));
    await p.click('#p-save');
    await addAt(p, '2026-10-14', 'dinner', 'Leftovers');
    ok('Leftovers needs no people', /Nothing to buy/.test(await txt(p, '.day[data-date="2026-10-14"] .entry')));
    await addAt(p, '2026-10-15', 'dinner', 'Chicken fajitas');
    await p.click('.day[data-date="2026-10-16"] .add-btn'); await p.selectOption('#p-meal', 'other'); await p.click('#p-save');
    ok('Something else needs words', /Type what it is/.test(await txt(p, '#p-note-err')));
    await p.fill('#p-note', 'Takeaway pizza'); await p.click('#p-save');
    await addAt(p, '2026-10-17', 'dinner', 'Salmon with potatoes and green beans');
    await addAt(p, '2026-10-18', 'dinner', 'Daal and rice');
    // onions: bol 1 + curry 2 x 1.5 = 3 + fajitas 1 + daal 1 = 6
    ok('onions added up', await amt(p, 'Onions') === '6', await items(p));
    // garlic: 2 + 4.5 + 2 = 8.5
    ok('garlic 8½ cloves, buy 9', await amt(p, 'Garlic') === '8½ cloves (buy 9)');
    ok('rice 450 + 300 = 750 g', await amt(p, 'Basmati rice') === '750 g');
    ok('tins of tomatoes 2', await amt(p, 'Tomatoes') === '2 tins');
    ok('chicken thighs for 6', await amt(p, 'Chicken thighs') === '900 g');
    ok('coconut milk 1½ tins', await amt(p, 'Coconut milk') === '1½ tins (buy 2)');
    ok('summary 5 meals', /for 5 meals/.test(await txt(p, '#list-sum')), await txt(p, '#list-sum'));
    ok('aisle headings in order', (await p.$$eval('.group-h', e => e.map(x => x.textContent)))[0] === 'Fruit and veg');
    // Shopping for: today onwards
    ok('Shopping for shown mid-week', await p.isVisible('#list-days'));
    await p.selectOption('#list-days', 'today');
    ok('today onwards leaves out Mon and Tue', await amt(p, 'Onions') === '2' && /for 3 meals, Wed 14 Oct to Sun 18 Oct/.test(await txt(p, '#list-sum')), [await amt(p, 'Onions'), await txt(p, '#list-sum')]);
    await p.selectOption('#list-days', 'all');
    // ticking
    await p.locator('#groups .item', { hasText: 'Onions' }).locator('input').click();
    ok('tick moves to Got it', /Got it \(1\)/.test(await txt(p, '#got-h')) && !(await items(p)).some(i => i[0] === 'Onions'));
    ok('summary counts ticks', /1 ticked off/.test(await txt(p, '#list-sum')));
    const href = await p.getAttribute('#email', 'href');
    ok('email link with no address, subject and items', href.startsWith('mailto:?subject=Shopping%20list%20for%20Mon%2012%20Oct%20to%20Sun%2018%20Oct') && decodeURIComponent(href).includes('- Garlic: 8½ cloves (buy 9)') && !decodeURIComponent(href).includes('- Onions'));
    ok('email has the meals', decodeURIComponent(href).includes('Tue 13 Oct - Chicken curry (for 6)') && decodeURIComponent(href).includes('Fri 16 Oct - Takeaway pizza'));
    await p.click('#copy');
    const clip = await p.evaluate(() => navigator.clipboard.readText());
    ok('copy puts the list on the clipboard', /FRUIT AND VEG/.test(clip) && /\(1 already ticked off\)/.test(clip) && /Copied/.test(await txt(p, '#list-msg')));
    // extras
    await p.click('#extra-add');
    ok('blank extra refused', /Type something to buy/.test(await txt(p, '#extra-err')));
    await p.fill('#extra', 'Toilet roll'); await p.press('#extra', 'Enter');
    ok('extra added (Enter)', await amt(p, 'Toilet roll') === '' && /Added by you/.test(await p.locator('#groups .item', { hasText: 'Toilet roll' }).innerText()));
    await p.fill('#extra', '1 onion');
    await p.click('#extra-add');
    ok('extra onion merges and comes back from Got it', await amt(p, 'Onions') === '7' && await p.isHidden('#got-wrap'));
    await p.locator('#groups .item', { hasText: 'Toilet roll' }).locator('.x').click();
    ok('remove extra', (await amt(p, 'Toilet roll')) === null && /Removed Toilet roll/.test(await txt(p, '#list-msg')));
    await p.click('#list-msg .link');
    ok('undo remove extra', await amt(p, 'Toilet roll') === '');
    // pasted lines into the extra box
    await p.focus('#extra');
    await p.evaluate(() => { const dt = new DataTransfer(); dt.setData('text/plain', 'Milk 2 litres\nBread\n\nBin bags'); document.getElementById('extra').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); });
    await p.click('#extra-add');
    ok('pasted list becomes 3 items', await amt(p, 'Milk') === '2 litres' && await amt(p, 'Bread') === '' && await amt(p, 'Bin bags') === '');
    // change an entry: curry back to 4 people
    await p.click('.day[data-date="2026-10-13"] .entry-btn');
    ok('change panel', await txt(p, '#pick-h') === 'Change dinner on Tuesday 13 Oct' && await p.isVisible('#p-remove') && await p.inputValue('#p-people') === '6');
    await p.fill('#p-people', '4'); await p.click('#p-save');
    ok('change saved: garlic 7 cloves', await amt(p, 'Garlic') === '7 cloves');
    // move fajitas from Thu to Fri lunch
    await p.click('.day[data-date="2026-10-15"] .entry-btn');
    await p.selectOption('#p-day', '2026-10-16'); await p.selectOption('#p-slot', 'lunch'); await p.click('#p-save');
    ok('moved: Thu empty, Fri shows Lunch slot', (await p.$$('.day[data-date="2026-10-15"] .entry')).length === 0 && (await p.$$('.day[data-date="2026-10-16"] .slot[data-slot="lunch"] .entry')).length === 1);
    ok('lunch chip switched on', await p.getAttribute('#slot-chips .chip:nth-child(2)', 'aria-pressed') === 'true');
    // remove and undo
    await p.click('.day[data-date="2026-10-17"] .entry .x');
    ok('removed salmon', (await p.$$('.day[data-date="2026-10-17"] .entry')).length === 0 && await amt(p, 'Salmon fillets') === null);
    await p.click('#week-msg .link');
    ok('undo brings salmon back', (await p.$$('.day[data-date="2026-10-17"] .entry')).length === 1 && await amt(p, 'Salmon fillets') === '4');
    // Take it off the plan from the panel
    await p.click('.day[data-date="2026-10-16"] .slot[data-slot="dinner"] .entry-btn');
    await p.click('#p-remove');
    ok('take off from panel', !(await p.locator('.day[data-date="2026-10-16"]').innerText()).includes('Takeaway pizza'));
    // reload keeps everything
    await p.reload({ waitUntil: 'networkidle' });
    ok('reload keeps plan, extras and ticks', await amt(p, 'Garlic') === '7 cloves' && await amt(p, 'Bread') === '' && (await p.$$('.day .entry')).length === 6);
    // edit a meal in My meals with preview
    await p.locator('#meal-list .meal', { hasText: 'Daal and rice' }).locator('button', { hasText: 'Edit' }).click();
    ok('meal form opens in its box', await p.isVisible('#meal-list #meal-form') && await txt(p, '#mf-h') === 'Edit Daal and rice');
    await p.fill('#m-ing', '250 g red lentils\n2 onions\nFor the tadka:\n½ tsp turmeric\nSalt');
    ok('preview reads lines', JSON.stringify(await p.$$eval('#m-preview-list li', e => e.map(x => x.innerText.replace(/\s+/g, ' ')))) === JSON.stringify(['Red lentils 250 g', 'Onions 2', 'Turmeric ½ tsp', 'Salt no amount']));
    await p.fill('#m-name', 'Chicken curry'); await p.click('#m-save');
    ok('rename to an existing name refused', /already have a meal called Chicken curry/.test(await txt(p, '#m-name-err')));
    await p.fill('#m-name', 'Daal and rice'); await p.fill('#m-makes', ''); await p.click('#m-save');
    ok('blank portions refused', /Type how many/.test(await txt(p, '#m-makes-err')));
    await p.fill('#m-makes', '4'); await p.click('#m-save');
    ok('meal edit changes the list (1+1+2+2 and the extra 1)', await amt(p, 'Onions') === '7' && await amt(p, 'Turmeric') === '½ tsp', await items(p));
    // delete a meal that is on the plan
    await p.locator('#meal-list .meal', { hasText: 'Chicken curry' }).locator('button', { hasText: 'Delete' }).click();
    ok('delete meal takes it off the plan', /Deleted Chicken curry and took it off 1 day/.test(await txt(p, '#meals-msg')) && (await p.$$('.day[data-date="2026-10-13"] .entry')).length === 0);
    await p.click('#meals-msg .link');
    ok('undo delete meal', (await p.$$('.day[data-date="2026-10-13"] .entry')).length === 1);
    // a meal with no ingredients
    await p.click('#meal-add'); await p.fill('#m-name', 'Pizza night'); await p.click('#m-save');
    await addAt(p, '2026-10-15', 'dinner', 'Pizza night');
    ok('meal with no ingredients flagged', /No ingredients yet/.test(await txt(p, '.day[data-date="2026-10-15"] .entry')) && /1 meal has no ingredients yet/.test(await txt(p, '#list-empty')));
    // long names do not break the layout
    await p.click('#meal-add'); await p.fill('#m-name', 'W'.repeat(60)); await p.fill('#m-ing', '1 ' + 'verylongingredientname'.repeat(6)); await p.click('#m-save');
    await addAt(p, '2026-10-15', 'dinner', 'W'.repeat(60));
    ok('long names: no sideways scroll at 390', !(await hscroll(p)));
    // week navigation and copy last week
    await p.click('#next');
    ok('next week', await txt(p, '#week-range') === 'Mon 19 Oct to Sun 25 Oct 2026' && await p.isVisible('#this-week') && !(await p.$('.day.today')));
    ok('next week list empty', /Add meals to the days/.test(await txt(p, '#list-empty')) && !(await p.isVisible('#list-days')));
    await p.click('#copy-last');
    ok('copied last week', /Copied 8 meals from last week/.test(await txt(p, '#week-msg')) && (await p.$$('.day .entry')).length === 8, await txt(p, '#week-msg'));
    await p.click('#clear-week');
    ok('clear week', (await p.$$('.day .entry')).length === 0);
    await p.click('#week-msg .link');
    ok('undo clear', (await p.$$('.day .entry')).length === 8);
    await p.click('#this-week');
    ok('back to this week', await txt(p, '#week-range') === 'Mon 12 Oct to Sun 18 Oct 2026');
    // week starts on Saturday (shopping day)
    await p.selectOption('#wstart', '6');
    ok('week from Saturday', await txt(p, '#week-range') === 'Sat 10 Oct to Fri 16 Oct 2026' && /start on Saturday/.test(await txt(p, '#set-msg')));
    ok('extras follow the new week', await amt(p, 'Bread') === '');
    await p.selectOption('#wstart', '1');
    // untick everything
    await p.locator('#groups .item').first().locator('input').click();
    await p.click('#untick');
    ok('untick everything', await p.isHidden('#got-wrap') && /Unticked everything/.test(await txt(p, '#list-msg')));
    // keyboard only: Escape in meal form, focus back
    await p.click('#meal-add'); await p.keyboard.press('Escape');
    ok('Escape closes meal form', !(await p.isVisible('#meal-form')) && await p.evaluate(() => document.activeElement.id) === 'meal-add');
    // backup and restore
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#backup')]);
    const file = await dl.path();
    ok('backup file named', /^meal-planner-backup-2026-10-14\.json$/.test(dl.suggestedFilename()));
    await p.click('#wipe');
    ok('delete everything', (await p.$$('#meal-list .meal')).length === 0 && (await p.$$('.day .entry')).length === 0);
    await p.click('#set-msg .link');
    ok('undo delete everything', (await p.$$('#meal-list .meal')).length === 9);
    await p.click('#wipe');
    await p.setInputFiles('#restore-file', file);
    await p.waitForFunction(() => /Restored/.test(document.getElementById('set-msg').textContent), null, { timeout: 5000 }).catch(() => {});
    ok('restore', /Restored 9 meals/.test(await txt(p, '#set-msg')) && (await p.$$('.day .entry')).length === 8);
    const badFile = path.join(require('os').tmpdir(), 'not-backup.json'); fs.writeFileSync(badFile, '{"hello":1}');
    await p.setInputFiles('#restore-file', badFile);
    await p.waitForFunction(() => /not a backup/.test(document.getElementById('set-msg').textContent), null, { timeout: 5000 }).catch(() => {});
    ok('bad backup refused', /not a backup/.test(await txt(p, '#set-msg')) && (await p.$$('.day .entry')).length === 8);
    ok('no console errors in the whole run', !p.errors.length, p.errors);
    await p.close();

    // ---------- saved state problems ----------
    p = await load(b, { width: 390, height: 844 }, { state: '{not json' });
    ok('corrupt saved state starts fresh with a message', /could not be read/.test(await txt(p, '#week-msg')) && (await p.$$('#meal-list .meal')).length === 0);
    await p.close();
    p = await load(b, { width: 390, height: 844 }, { state: JSON.stringify({ meals: [{ id: 'x', name: '<img src=x onerror=alert(1)>', makes: 2, ingredients: '<b>1 egg</b>' }], plan: { '2026-10-14': [{ id: 'a', slot: 'dinner', meal: 'x', people: 2 }] } }) });
    ok('typed HTML shown as text', (await txt(p, '.day.today .e-name')) === '<img src=x onerror=alert(1)>' && !(await p.$('main img')));
    await p.close();
    p = await load(b, { width: 390, height: 844 }, { block: true });
    ok('storage blocked: warning and still works', await p.isVisible('#storage-warn'));
    await p.click('#examples'); await addAt(p, '2026-10-14', 'dinner', 'Cheese omelette');
    ok('storage blocked: list still made', await amt(p, 'Eggs') === '12');
    ok('storage blocked: no page errors', !p.errors.length, p.errors);
    await p.close();

    // ---------- midnight: Sunday 23:59 -> Monday moves to the new week ----------
    p = await load(b, { width: 390, height: 844 }, { state: seed(), clock: new Date(2026, 9, 18, 23, 59, 40).getTime() });
    ok('Sunday before midnight', await p.locator('.day.today').getAttribute('data-date') === '2026-10-18');
    await p.clock.runFor(60000);
    ok('after midnight: next week and Monday is today', await txt(p, '#week-range') === 'Mon 19 Oct to Sun 25 Oct 2026' && await p.locator('.day.today').getAttribute('data-date') === '2026-10-19');
    await p.close();

    // ---------- other tab ----------
    const ctxP = await load(b, { width: 1280, height: 900 }, { state: seed() });
    const p2 = await ctxP.context().newPage(); await p2.clock.setFixedTime(NOW); await p2.goto(url, { waitUntil: 'networkidle' });
    await p2.click('.day[data-date="2026-10-14"] .entry .x');
    await ctxP.waitForTimeout(300);
    ok('change in another tab shows here', (await ctxP.$$('.day[data-date="2026-10-14"] .entry')).length === 0);
    await ctxP.context().close();

    // ---------- sizes, layout, help, themes ----------
    for (const theme of ['dark', 'light']) {
        for (const w of [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920]) {
            p = await load(b, { width: w, height: w < 600 ? 800 : 900 }, { theme, state: Object.assign(seed(), { settings: { people: 4, weekStart: 1, slots: ['breakfast', 'lunch', 'dinner', 'snacks'] }, extras: { '2026-10-12': [{ id: 'x', text: 'Toilet roll' }] }, ticks: { '2026-10-12': ['onion'] } }) });
            ok(`[${theme} ${w}] no sideways scroll, filled`, !(await hscroll(p)));
            const wrapped = await p.$$eval('.chip, .week-nav button, .tool-grid button, .tool-grid a, .row-btns button, .step, .add-btn', e => e.filter(x => x.offsetParent && (x.scrollWidth > x.clientWidth + 1 || (x.classList.contains('chip') && x.getBoundingClientRect().height > 50))).map(x => x.textContent));
            ok(`[${theme} ${w}] button words not broken or cut`, !wrapped.length, wrapped);
            if (w <= 390) {
                ok(`[${theme} ${w}] controls do not overlap`, !(await noOverlap(p)).length, await noOverlap(p));
                ok(`[${theme} ${w}] placeholders fit`, !(await placeholdersFit(p)).length, await placeholdersFit(p));
                await p.click('.day[data-date="2026-10-13"] .slot[data-slot="dinner"] .entry-btn');
                ok(`[${theme} ${w}] change panel: no overlap or scroll`, !(await noOverlap(p)).length && !(await hscroll(p)), await noOverlap(p));
                await p.selectOption('#p-meal', 'new');
                ok(`[${theme} ${w}] new meal fields: no overlap`, !(await noOverlap(p)).length && !(await hscroll(p)), await noOverlap(p));
                ok(`[${theme} ${w}] new-meal placeholders fit`, !(await placeholdersFit(p)).length, await placeholdersFit(p));
                await p.selectOption('#p-meal', 'other');
                ok(`[${theme} ${w}] other placeholders fit`, !(await placeholdersFit(p)).length, await placeholdersFit(p));
                await p.click('#p-cancel');
                await p.click('#meal-add');
                ok(`[${theme} ${w}] meal form: no overlap`, !(await noOverlap(p)).length && !(await hscroll(p)), await noOverlap(p));
                ok(`[${theme} ${w}] meal form placeholders fit`, !(await placeholdersFit(p)).length, await placeholdersFit(p));
            }
            if (w >= 900) {
                for (const where of [0, 0.5, 1]) {
                    await p.evaluate(f => window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * f), where);
                    const bad = await p.evaluate(() => {
                        const kids = [...document.querySelectorAll('.app > *, .col-main > *, .col-side > *')].filter(e => e.offsetParent && getComputedStyle(e).display !== 'contents');
                        const out = [];
                        for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
                            if (kids[i].parentElement !== kids[j].parentElement) continue;
                            const a = kids[i].getBoundingClientRect(), c = kids[j].getBoundingClientRect();
                            if (a.left < c.right - 1 && c.left < a.right - 1 && a.top < c.bottom - 1 && c.top < a.bottom - 1) out.push(kids[i].className + '/' + kids[j].className);
                        }
                        return out;
                    });
                    ok(`[${theme} ${w}] no overlapping blocks at scroll ${where}`, !bad.length, bad);
                }
                const two = await p.evaluate(() => { const a = document.querySelector('.col-main').getBoundingClientRect(), c = document.querySelector('.col-side').getBoundingClientRect(); return c.left >= a.right && Math.abs(a.top - c.top) < 2; });
                ok(`[${theme} ${w}] week and list side by side`, two);
            }
            if ([320, 390, 820, 1280].includes(w)) {
                await p.evaluate(() => window.scrollTo(0, 0));
                await p.click('.help-btn');
                const box = await p.evaluate(() => { const d = document.querySelector('dialog.help'); const r = d.getBoundingClientRect(); return { open: d.open, l: r.left, r: r.right, t: r.top, b: r.bottom, title: d.querySelector('h2').textContent }; });
                ok(`[${theme} ${w}] help opens inside the screen`, box.open && box.l >= 0 && box.r <= w && box.t >= 0 && box.title === 'How to use Weekly Meal Planner with Shopping List', box);
                await p.keyboard.press('Escape');
                ok(`[${theme} ${w}] Escape closes help`, !(await p.evaluate(() => document.querySelector('dialog.help').open)));
                await p.click('.help-btn'); await p.click('.help-close');
                ok(`[${theme} ${w}] Got it closes help`, !(await p.evaluate(() => document.querySelector('dialog.help').open)));
                const bar = await p.evaluate(() => [...document.querySelectorAll('.topbar > *')].map(e => e.getBoundingClientRect()).map(r => [Math.round(r.top), Math.round(r.left), Math.round(r.right)]));
                ok(`[${theme} ${w}] top bar on one line, no overlap`, bar.every(r => r[0] === bar[0][0]) && bar.every((r, i) => !i || r[1] >= bar[i - 1][2]), bar);
            }
            ok(`[${theme} ${w}] no console errors`, !p.errors.length, p.errors);
            await p.close();
        }
    }
    // theme switch
    p = await load(b, { width: 390, height: 844 }, { theme: 'dark' });
    await p.click('.theme-toggle');
    ok('theme switch to light', await p.evaluate(() => document.documentElement.dataset.theme) === 'light' && await p.evaluate(() => getComputedStyle(document.body).color) === 'rgb(42, 16, 51)');
    await p.close();
    // cleared state at all widths
    for (const w of [320, 390, 900, 1920]) {
        p = await load(b, { width: w, height: 800 });
        ok(`[cleared ${w}] no sideways scroll`, !(await hscroll(p)));
        await p.close();
    }

    if (shots) {
        const dir = path.join(__dirname, 'screenshots'); fs.mkdirSync(dir, { recursive: true });
        const st = seed(); st.ticks = { '2026-10-12': ['olive oil', 'garlic'] }; st.extras = { '2026-10-12': [{ id: 'x', text: 'Toilet roll' }] };
        p = await load(b, { width: 1280, height: 900 }, { state: st, theme: 'dark' });
        await p.screenshot({ path: path.join(dir, 'desktop.png'), fullPage: false });
        await p.close();
        p = await load(b, { width: 390, height: 844 }, { state: st, theme: 'dark' });
        await p.screenshot({ path: path.join(dir, 'phone.png') });
        await p.close();
        console.log('screenshots saved');
    }
    await b.close(); if (server) server.close();
    console.log(fail ? fail + ' FAILED' : 'ALL UI TESTS PASSED');
    process.exitCode = fail ? 1 : 0;
})();
