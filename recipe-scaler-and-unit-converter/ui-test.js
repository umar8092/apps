// Drives the real page in headless Chromium: node ui-test.js [--shots] [--base https://umar8092.github.io/apps]
// Without --base it serves this repo on localhost. With --base it tests the LIVE page.
const pw = (() => { for (const m of ['playwright', 'playwright-core', '/opt/node-tools/node_modules/playwright']) { try { return require(m); } catch (e) { /* next */ } } throw new Error('playwright not found'); })();
const path = require('path'), fs = require('fs'), http = require('http');
const bi = process.argv.indexOf('--base');
const shots = process.argv.includes('--shots');
let fail = 0, url;
const ok = (name, cond) => { if (!cond) fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name); };

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

// The README situation: pancakes that serve 4, cooked for 7
const PANCAKES = '1 1/2 cups all-purpose flour\n3 1/2 tsp baking powder\n1 tbsp sugar\n1/4 tsp salt\n1 1/4 cups milk\n1 egg\n3 tbsp butter, melted\nMaple syrup, to serve';
const METHOD = 'Mix the flour, baking powder, sugar and salt.\nWhisk in the milk, egg and melted butter.\nHeat a griddle to 375°F and cook 1/4 cup of batter per pancake.';
const WANT = ['2⅔ cups all-purpose flour', '2 tbsp baking powder', '1 tbsp + 2¼ tsp sugar', '½ tsp salt', '2¼ cups milk', '1¾ eggs', '⅓ cup butter, melted', 'Maple syrup, to serve'];

async function load(b, vp, opt = {}) {
    const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: vp.width < 500 ? 2 : 1, colorScheme: opt.theme || 'dark',
        permissions: ['clipboard-read', 'clipboard-write'], storageState: opt.state });
    if (opt.init) await ctx.addInitScript(opt.init);
    const p = await ctx.newPage();
    p.errors = []; p.on('console', m => m.type() === 'error' && p.errors.push(m.text())); p.on('pageerror', e => p.errors.push(String(e)));
    p.bad = []; p.on('response', r => { if (r.status() >= 400) p.bad.push(r.status() + ' ' + r.url()); });
    p.urls = []; p.on('request', r => p.urls.push(r.url()));
    await p.goto(url, { waitUntil: 'networkidle' });
    return p;
}
// the text of each result line without the "Recipe says" and tip lines
const lines = p => p.$$eval('#lines > li', ls => ls.map(l => { const c = l.cloneNode(true); c.querySelectorAll('.was,.tip').forEach(x => x.remove()); return c.textContent.trim(); }));
const txt = (p, sel) => p.textContent(sel);
async function situation(p, method = true) {
    await p.fill('#ing', PANCAKES);
    if (method) { await p.click('#add-method'); await p.fill('#method', METHOD); }
    await p.fill('#from', '4'); await p.fill('#to', '7');
}

async function main() {
    let srv;
    if (bi > 0) url = process.argv[bi + 1].replace(/\/$/, '') + '/recipe-scaler-and-unit-converter/';
    else { srv = await serve(); url = 'http://localhost:' + srv.address().port + '/recipe-scaler-and-unit-converter/'; }
    console.log('Testing ' + url);
    const b = await pw.chromium.launch();
    const vp = { width: 390, height: 844 }, desk = { width: 1280, height: 900 };

    // ---- first use, empty state, optional parts hidden
    let p = await load(b, vp);
    ok('first use: example button shown, empty message, factor ×1', !(await p.isHidden('#demo')) && !(await p.isHidden('#lines-empty')) && (await txt(p, '#r-factor')) === '×1');
    ok('first use: Copy, Print and Save are disabled with nothing to scale', await p.isDisabled('#copy') && await p.isDisabled('#print') && await p.isDisabled('#save'));
    ok('optional parts not forced: method, "I have" and the name box are hidden', await p.isHidden('#method-box') && await p.isHidden('#have-box') && await p.isHidden('#save-box'));
    ok('"Start a new recipe" is hidden when there is nothing to clear', await p.isHidden('#new'));
    ok('empty save list explains what it is for', (await txt(p, '#saved-empty')).includes('Recipes you save'));
    await p.click('#mail', { force: true }); ok('Email with nothing to send says so instead of opening mail', (await txt(p, '#result-msg')).includes('Add some ingredients'));

    // ---- the main situation
    await situation(p);
    ok('pancakes for 4 made for 7: ×1.75', (await txt(p, '#r-factor')) === '×1.75' && (await txt(p, '#r-meta')) === 'For 7 instead of 4.');
    const got = await lines(p);
    ok('every scaled amount matches the hand-worked answer', JSON.stringify(got) === JSON.stringify(WANT));
    if (JSON.stringify(got) !== JSON.stringify(WANT)) console.log(got);
    ok('egg line says what to do with ¾ of an egg', (await txt(p, '#lines .tip')) === 'Use 1 egg, plus 2 tbsp of another beaten egg.');
    ok('each line says what the recipe said: "Recipe says: 1½ cups"', (await txt(p, '#lines li:first-child .was')) === 'Recipe says: 1½ cups');
    ok('the line with no amount is kept and says so', (await txt(p, '#lines li:last-child .was')) === 'No amount, kept as written');
    ok('method shown with the oven temperature converted', (await p.textContent('#method-list')).includes('375°F (190°C, 170°C fan, gas 5)'));
    ok('cooking time note shown when scaled', (await txt(p, '#notes')).includes('Cooking times are not scaled'));
    ok('each ingredient sits in its own bordered box', await p.$eval('#lines li', e => getComputedStyle(e).borderTopStyle === 'solid' && parseFloat(getComputedStyle(e).borderLeftWidth) >= 4));
    ok('intro hides once there is a recipe; Start a new recipe appears', await p.isHidden('#intro') && !(await p.isHidden('#new')));

    // ---- edit a mistake: change an ingredient line
    await p.fill('#ing', PANCAKES.replace('1 egg', '2 eggs'));
    ok('editing the list updates straight away (2 eggs x1.75 = 3½ eggs)', (await lines(p))[5] === '3½ eggs');
    await p.fill('#ing', PANCAKES);

    // ---- quick sizes
    await p.click('.chips button[data-x="2"]');
    ok('Double sets I want to make to 8 and ×2', (await p.inputValue('#to')) === '8' && (await txt(p, '#r-factor')) === '×2' && (await lines(p))[0] === '3 cups all-purpose flour');
    ok('Double is shown as pressed', (await p.getAttribute('.chips button[data-x="2"]', 'aria-pressed')) === 'true');
    await p.click('.chips button[data-x="0.5"]');
    ok('Half: 2, 1 egg -> ½ egg with a hint', (await p.inputValue('#to')) === '2' && (await lines(p))[5] === '½ egg' && (await txt(p, '#lines .tip')).startsWith('Beat 1 egg'));
    await p.click('.chips button[data-x="1"]');
    ok('Same: ×1, no "Recipe says" lines, no cooking time note', (await txt(p, '#r-factor')) === '×1' && (await p.$$('#lines .was')).length === 0 && !(await txt(p, '#notes')).includes('Cooking times'));
    await p.click('.chips button[data-x="3"]');
    ok('Triple: ×3, 1½ cups -> 4½ cups', (await txt(p, '#r-factor')) === '×3' && (await lines(p))[0] === '4½ cups all-purpose flour');

    // ---- odd inputs in the servings boxes
    const bad = [['0', 'must be more than 0'], ['-2', 'must be more than 0'], ['abc', 'as a number'], ['20000', 'up to 10,000']];
    for (const [v, msg] of bad) {
        await p.fill('#to', v);
        ok('I want to make "' + v + '" -> plain message, recipe shown as it is', (await txt(p, '#scale-err')).includes(msg) && (await txt(p, '#r-factor')) === '×1');
    }
    await p.fill('#to', ''); ok('blank I want to make: asks for it, ×1', (await txt(p, '#r-meta')).includes('Type what you want to make') && (await txt(p, '#scale-err')) === '');
    await p.fill('#to', '2.5'); ok('decimals: 2.5 of 4 = ×0.63 (shown to 2 places)', (await txt(p, '#r-factor')) === '×0.63');
    await p.fill('#from', '0.001'); await p.fill('#to', '9999'); ok('more than 1,000 times is refused', (await txt(p, '#scale-err')).includes('1,000 times'));
    await p.fill('#from', ''); await p.fill('#to', '7'); ok('blank recipe makes: asks for it', (await txt(p, '#r-meta')).includes('The recipe makes'));
    await p.click('.chips button[data-x="2"]'); ok('Double with no "recipe makes" fills 1 and 2', (await p.inputValue('#from')) === '1' && (await p.inputValue('#to')) === '2');
    await p.fill('#from', '4'); await p.fill('#to', '7');

    // ---- units
    await p.check('input[name=mode][value=metric]', { force: true });
    const met = await lines(p);
    ok('Grams and ml: flour ≈ 315 g, milk 520 ml, baking powder stays 2 tbsp, butter ≈ 74 g', met[0] === '≈ 315 g all-purpose flour' && met[4] === '520 ml milk' && met[1] === '2 tbsp baking powder' && met[6] === '≈ 74 g butter, melted');
    ok('≈ is explained in a note', (await txt(p, '#notes')).includes('≈ means'));
    ok('egg hint in grams', (await txt(p, '#lines .tip')).includes('38 g'));
    await p.fill('#ing', '500 g flour\n250 ml milk\n200 g chicken');
    await p.fill('#from', ''); await p.fill('#to', '');
    await p.check('input[name=mode][value=us]', { force: true });
    ok('Cups and spoons, not scaled: 500 g flour ≈ 4¼ cups, 250 ml milk = 1 cup + 1 tbsp, 200 g chicken = 7 oz',
        JSON.stringify(await lines(p)) === JSON.stringify(['≈ 4¼ cups flour', '1 cup + 1 tbsp milk', '7 oz chicken']));
    ok('converting without scaling is allowed: meta explains', (await txt(p, '#r-meta')).startsWith('Same amounts'));
    await p.check('input[name=mode][value=same]', { force: true });
    await p.fill('#ing', '1 tbsp butter'); await p.selectOption('#sys', 'au'); await p.check('input[name=mode][value=metric]', { force: true });
    ok('Australian tablespoon (20 ml) in grams and ml mode = 1 tbsp + 1 tsp', (await lines(p))[0] === '1 tbsp + 1 tsp butter');
    await p.selectOption('#sys', 'us'); await p.check('input[name=mode][value=same]', { force: true });

    // ---- pasted text from a recipe website, very long lines
    await p.fill('#ing', '▢ 2 cups flour\n• 1 egg\n\n\nFor the sauce:\n' + 'Very long ingredient name '.repeat(20));
    const pasted = await lines(p);
    ok('pasted bullets and tick boxes removed, blank lines skipped, heading shown', pasted[0] === '2 cups flour' && pasted[1] === '1 egg' && pasted[2] === 'For the sauce' && pasted.length === 4);
    ok('a very long line wraps inside its box (no sideways scroll)', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));

    // ---- scale to an ingredient I have
    await p.fill('#ing', PANCAKES.replace('1 egg', '3 eggs')); await p.fill('#from', '4'); await p.fill('#to', '4');
    await p.click('#add-have');
    const opts = await p.$$eval('#have-line option', o => o.map(x => x.textContent));
    ok('"I have" lists the ingredients with an amount (7 of 8 lines)', opts.length === 7 && opts.includes('3 eggs') && !opts.includes('Maple syrup, to serve'));
    await p.selectOption('#have-line', '3 eggs');
    ok('the box shows the unit of the chosen line ("eggs")', (await txt(p, '#have-unit')) === 'eggs');
    await p.fill('#have', '2');
    ok('I have 2 of 3 eggs: I want to make becomes 2.67 and eggs show 2', (await p.inputValue('#to')) === '2.67' && (await lines(p))[5] === '2 eggs' && (await txt(p, '#have-msg')).includes('×0.67'));
    await p.fill('#have', '0'); ok('I have 0: plain message', (await txt(p, '#have-err')).includes('more than 0'));
    await p.fill('#have', 'lots'); ok('I have "lots": plain message', (await txt(p, '#have-err')).includes('as a number'));
    await p.selectOption('#have-line', '1 1/2 cups all-purpose flour'); await p.fill('#have', '1 1/2');
    ok('I have 1 1/2 cups of the 1½ cups flour: back to 4 (×1)', (await p.inputValue('#to')) === '4' && (await txt(p, '#r-factor')) === '×1');
    await p.click('#remove-have'); ok('Close hides the "I have" box again', await p.isHidden('#have-box') && !(await p.isHidden('#add-have')));
    await p.fill('#ing', PANCAKES); await p.fill('#to', '7');

    // ---- copy, email, print
    await p.click('#copy');
    const clip = await p.evaluate(() => navigator.clipboard.readText());
    ok('Copy gives the scaled recipe as text with title, amounts, hint and method', clip.startsWith('Recipe for 7\nScaled ×1.75 (the recipe makes 4). Amounts as written.') && clip.includes('- 2⅔ cups all-purpose flour') && clip.includes('(Use 1 egg, plus 2 tbsp') && clip.includes('Method:\n1. Mix the flour'));
    ok('Copy says it worked', (await txt(p, '#result-msg')).startsWith('Copied'));
    const mail = await p.getAttribute('#mail', 'href');
    ok('Email opens a mail with no address needed, the recipe in the body', mail.startsWith('mailto:?subject=Recipe%20for%207&body=') && decodeURIComponent(mail).includes('2⅔ cups all-purpose flour'));
    await p.emulateMedia({ media: 'print' });
    ok('Print shows only the scaled recipe', await p.isHidden('#recipe-card') && await p.isHidden('#saved-card') && await p.isVisible('#lines'));
    await p.emulateMedia({ media: 'screen' });

    // ---- save, reload, update, open, delete, undo
    await p.click('#save');
    ok('Save asks for a name (the box appears only now)', await p.isVisible('#save-box') && await p.isHidden('#save'));
    await p.click('#save-ok'); ok('blank name refused with a message', (await txt(p, '#save-err')).includes('Type a name'));
    await p.fill('#name', 'Sunday pancakes'); await p.press('#name', 'Enter');
    ok('Enter saves: listed in My recipes with makes 4 and 8 ingredients', (await txt(p, '#saved .rec-name')) === 'Sunday pancakes' && (await txt(p, '#saved .rec-meta')) === 'Makes 4 · 8 ingredients' && (await txt(p, '#result-msg')).includes('Saved "Sunday pancakes"'));
    ok('the result title is the recipe name', (await txt(p, '#res-h')) === 'Sunday pancakes');
    ok('saved recipes sit in their own bordered boxes', await p.$eval('.rec', e => getComputedStyle(e).borderTopStyle === 'solid'));
    await p.reload({ waitUntil: 'networkidle' });
    ok('reload (next day): recipe, numbers, method and saved list are all back', (await p.inputValue('#ing')) === PANCAKES && (await p.inputValue('#to')) === '7' && (await p.inputValue('#method')) === METHOD && (await p.$$('.rec')).length === 1 && JSON.stringify(await lines(p)) === JSON.stringify(WANT));
    await p.fill('#ing', PANCAKES + '\n1 tsp vanilla'); await p.click('#save');
    ok('saving again: the name is filled in', (await p.inputValue('#name')) === 'Sunday pancakes');
    await p.press('#name', 'Enter');
    ok('saving with the same name updates it (still 1 recipe, 9 ingredients)', (await p.$$('.rec')).length === 1 && (await txt(p, '#saved .rec-meta')) === 'Makes 4 · 9 ingredients' && (await txt(p, '#result-msg')).includes('Updated'));
    await p.click('#save'); await p.press('#name', 'Escape'); ok('Escape closes the name box without saving', await p.isHidden('#save-box'));

    // start a new recipe, undo
    await p.click('#new');
    ok('Start a new recipe empties the boxes but keeps saved recipes', (await p.inputValue('#ing')) === '' && (await p.inputValue('#from')) === '' && (await p.$$('.rec')).length === 1 && (await txt(p, '#res-h')) === 'Scaled recipe');
    await p.click('#recipe-msg button');
    ok('Undo brings the recipe back', (await p.inputValue('#ing')).includes('vanilla') && (await p.inputValue('#to')) === '7');
    await p.click('#new');
    await p.fill('#ing', '2 cups rice'); await p.fill('#from', '2'); await p.fill('#to', '6'); await p.click('#save'); await p.fill('#name', 'Rice'); await p.click('#save-ok');
    ok('a second recipe is saved at the top', (await p.$$eval('.rec-name', e => e.map(x => x.textContent))).join() === 'Rice,Sunday pancakes');
    await p.click('.rec:nth-child(2) .open-btn');
    ok('Open loads the saved recipe with its numbers', (await p.inputValue('#ing')).includes('vanilla') && (await p.inputValue('#from')) === '4' && (await txt(p, '#res-h')) === 'Sunday pancakes' && (await p.$eval('.rec:nth-child(2)', e => e.classList.contains('open'))));
    await p.click('#recipe-msg button'); ok('Undo after Open goes back to what was there', (await p.inputValue('#ing')) === '2 cups rice');
    await p.click('.rec:first-child button:has-text("Delete")');
    ok('Delete shows Undo in its place', (await txt(p, '.rec.gone')).includes('Deleted "Rice"') && (await p.$$('.rec:not(.gone)')).length === 1);
    await p.click('.rec.gone button'); ok('Undo puts it back in the same place', (await p.$$eval('.rec-name', e => e.map(x => x.textContent))).join() === 'Rice,Sunday pancakes');
    await p.click('.rec:first-child button:has-text("Delete")'); await p.reload({ waitUntil: 'networkidle' });
    ok('a deleted recipe stays deleted after reload', (await p.$$eval('.rec-name', e => e.map(x => x.textContent))).join() === 'Sunday pancakes');
    // method remove and undo
    await p.click('.open-btn');
    await p.click('#remove-method'); ok('Remove the method hides it and offers Undo', await p.isHidden('#method-box') && await p.isHidden('#method-out'));
    await p.click('#recipe-msg button'); ok('Undo brings the method back', (await p.inputValue('#method')) === METHOD);
    // example and its undo
    await p.click('#new'); await p.click('#demo');
    ok('Try an example recipe fills pancakes for 7', (await txt(p, '#r-factor')) === '×1.75' && (await txt(p, '#res-h')) === 'Fluffy pancakes');
    await p.click('#recipe-msg button'); ok('Undo removes the example', (await p.inputValue('#ing')) === '');
    ok('no console errors or failed requests (main run)', !p.errors.length && !p.bad.length);
    if (p.errors.length || p.bad.length) console.log(p.errors, p.bad);
    await p.context().close();

    // ---- corrupt and blocked storage
    p = await load(b, vp, { init: () => { try { localStorage.setItem('recipe-scaler-and-unit-converter.state', '{"ingredients":5,"mode":"x","from":{}}'); localStorage.setItem('recipe-scaler-and-unit-converter.recipes', '[1,{"name":"Ok","ingredients":"1 egg"},{"name":""}]'); } catch (e) { /* */ } } });
    ok('corrupt saved values: starts fresh, keeps the one valid recipe', (await p.inputValue('#ing')) === '' && (await p.$$('.rec')).length === 1 && !p.errors.length);
    await p.context().close();
    p = await load(b, vp, { init: () => { localStorage.setItem('recipe-scaler-and-unit-converter.state', '{bad'); } });
    ok('broken JSON in storage: page still works', (await txt(p, '#r-factor')) === '×1' && !p.errors.length);
    await p.context().close();
    p = await load(b, vp, { init: () => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); } });
    await p.fill('#ing', '1 egg'); await p.fill('#from', '1'); await p.fill('#to', '2');
    ok('storage blocked: still scales and says it is not saving', (await lines(p))[0] === '2 eggs' && (await txt(p, '#recipe-msg')).includes('not saving') && !p.errors.length);
    await p.context().close();

    // ---- offline: the service worker serves the saved copy
    if (!url.startsWith('http://localhost') || true) {
        p = await load(b, vp);
        await p.evaluate(() => Promise.race([navigator.serviceWorker.ready, new Promise(r => setTimeout(r, 8000))]));
        await p.reload({ waitUntil: 'networkidle' });
        await p.context().setOffline(true);
        let offOk = false; try { await p.reload({ waitUntil: 'load' }); offOk = (await txt(p, 'h1')) === 'Recipe Scaler and Unit Converter'; } catch (e) { offOk = false; }
        if (offOk) { await p.fill('#ing', '2 cups flour'); await p.fill('#from', '2'); await p.fill('#to', '1'); offOk = (await lines(p))[0] === '1 cup flour'; }
        ok('works offline after the first visit', offOk);
        await p.context().setOffline(false);
        await p.context().close();
    }

    // ---- light/dark switch, keyboard
    p = await load(b, desk, { theme: 'dark' });
    const bg1 = await p.$eval('body', e => getComputedStyle(e).color);
    await p.click('.theme-toggle');
    const bg2 = await p.$eval('body', e => getComputedStyle(e).color);
    ok('light/dark switch changes the look and is remembered', bg1 !== bg2 && (await p.evaluate(() => localStorage.getItem('apps.theme'))) === 'light');
    await p.click('.theme-toggle');
    await p.focus('#ing'); await p.keyboard.type('2 cups flour'); await p.keyboard.press('Tab');
    await p.keyboard.press('Tab'); // past "+ Add the method"
    await p.keyboard.press('Tab'); // sys
    ok('keyboard: Tab moves from the list through the controls', ['add-method', 'sys', 'new'].includes(await p.evaluate(() => document.activeElement.id)));
    await p.focus('#from'); await p.keyboard.type('2'); await p.keyboard.press('Tab'); await p.keyboard.type('3');
    ok('keyboard only: typing in the boxes scales (×1.5)', (await txt(p, '#r-factor')) === '×1.5');
    await p.focus('input[name=mode][value=same]'); await p.keyboard.press('ArrowRight');
    ok('arrow keys switch Show amounts in', (await p.$eval('input[name=mode]:checked', e => e.value)) === 'metric');
    ok('labels: every input, select and textarea has a label', await p.evaluate(() => [...document.querySelectorAll('input:not([type=radio]),select,textarea')].every(e => document.querySelector('label[for="' + e.id + '"]'))));
    await p.context().close();

    // ---- layout at every width, filled and empty, dark and light
    const widths = [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920];
    for (const theme of ['dark', 'light']) for (const w of widths) {
        p = await load(b, { width: w, height: 900 }, { theme });
        for (const state of ['filled', 'empty']) {
            if (state === 'filled') {
                await situation(p);
                await p.click('#add-have'); await p.selectOption('#have-line', '1 egg');
                await p.click('#save'); await p.fill('#name', 'Sunday pancakes'); await p.click('#save-ok');
                await p.click('#save'); // name box open
            } else { await p.click('#new'); }
            const tag = theme + ' ' + w + ' ' + state + ': ';
            const r = await p.evaluate(() => {
                const W = document.documentElement.clientWidth, out = [];
                document.querySelectorAll('main *').forEach(e => { const b = e.getBoundingClientRect(); if (b.width && (b.right > W + 1 || b.left < -1) && getComputedStyle(e).position !== 'absolute') out.push(e.id || e.className || e.tagName); });
                return { scroll: document.documentElement.scrollWidth > W, out: out.slice(0, 5) };
            });
            ok(tag + 'no sideways scroll, nothing sticks out', !r.scroll && !r.out.length);
            if (r.out.length) console.log(r.out);
            if (w <= 390) {
                const ov = await p.evaluate(() => {
                    const els = [...document.querySelectorAll('main input:not([type=radio]), main select, main button, main textarea, main a.secondary, .seg span')].filter(e => e.offsetParent);
                    const o = [];
                    for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
                        const a = els[i].getBoundingClientRect(), c = els[j].getBoundingClientRect();
                        if (els[i].contains(els[j]) || els[j].contains(els[i])) continue;
                        if (Math.min(a.right, c.right) - Math.max(a.left, c.left) > 1 && Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top) > 1) o.push((els[i].id || els[i].textContent.trim().slice(0, 12)) + '/' + (els[j].id || els[j].textContent.trim().slice(0, 12)));
                    }
                    // placeholders and button labels must fit their boxes
                    const cv = document.createElement('canvas').getContext('2d'), clip = [];
                    document.querySelectorAll('main input[placeholder]').forEach(e => { if (!e.offsetParent) return; const s = getComputedStyle(e); cv.font = s.fontSize + ' ' + s.fontFamily; const room = e.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight); if (cv.measureText(e.placeholder).width > room) clip.push(e.id); });
                    document.querySelectorAll('main button, .seg span, main a.secondary').forEach(e => { if (e.offsetParent && e.scrollWidth > e.clientWidth + 1) clip.push(e.id || e.textContent.trim()); });
                    return { o, clip };
                });
                ok(tag + 'no controls overlap, every placeholder and label fits', !ov.o.length && !ov.clip.length);
                if (ov.o.length || ov.clip.length) console.log(ov);
            }
            if (w >= 900) {
                let worst = [];
                for (const pos of [0, 0.5, 1]) {
                    await p.evaluate(f => scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * f), pos);
                    const o = await p.evaluate(() => {
                        const res = [];
                        document.querySelectorAll('main, .app, .col-in, .col-out').forEach(par => {
                            const kids = [...par.children].filter(k => k.offsetParent && getComputedStyle(k).display !== 'contents');
                            for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
                                const a = kids[i].getBoundingClientRect(), c = kids[j].getBoundingClientRect();
                                if (Math.min(a.right, c.right) - Math.max(a.left, c.left) > 1 && Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top) > 1) res.push((kids[i].id || kids[i].className) + '/' + (kids[j].id || kids[j].className));
                            }
                        });
                        return res;
                    });
                    worst = worst.concat(o);
                }
                ok(tag + 'no blocks overlap at the top, middle and bottom', !worst.length);
                if (worst.length) console.log(worst);
                if (state === 'filled') ok(tag + 'desktop: recipe on the left, result on the right', await p.evaluate(() => { const a = document.querySelector('.col-in').getBoundingClientRect(), c = document.querySelector('.col-out').getBoundingClientRect(); return c.left > a.right - 1 && Math.abs(a.top - c.top) < 2; }));
            }
        }
        ok(theme + ' ' + w + ': no console errors', !p.errors.length);
        await p.context().close();
    }

    // ---- Help at 4 widths
    for (const w of [320, 390, 820, 1280]) {
        p = await load(b, { width: w, height: w < 600 ? 800 : 900 });
        const bar = await p.evaluate(() => { const bs = [...document.querySelectorAll('.topbar > *')].map(e => e.getBoundingClientRect()); const top = bs.map(x => x.top); return { oneRow: Math.max(...top) - Math.min(...top) < 4, overlap: bs.some((a, i) => bs.some((c, j) => j > i && Math.min(a.right, c.right) - Math.max(a.left, c.left) > 1 && Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top) > 1)) }; });
        ok(w + ': top bar buttons on one row, not overlapping', bar.oneRow && !bar.overlap);
        await p.click('.help-btn');
        const d = await p.$eval('dialog.help', e => { const r = e.getBoundingClientRect(); return { open: e.open, inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, title: e.querySelector('h2').textContent }; });
        ok(w + ': Help opens fully on screen with its title', d.open && d.inside && d.title === 'How to use Recipe Scaler and Unit Converter');
        await p.keyboard.press('Escape'); ok(w + ': Escape closes Help', !(await p.$eval('dialog.help', e => e.open)));
        await p.click('.help-btn'); await p.click('.help-close'); ok(w + ': Got it closes Help', !(await p.$eval('dialog.help', e => e.open)));
        await p.context().close();
    }

    // ---- screenshots for the README
    if (shots) {
        for (const [vpx, file] of [[{ width: 1280, height: 900 }, 'desktop.png'], [{ width: 390, height: 844 }, 'phone.png']]) {
            p = await load(b, vpx, { theme: 'dark' });
            await situation(p);
            await p.evaluate(() => { document.activeElement.blur(); scrollTo(0, 0); }); await p.waitForTimeout(200);
            if (vpx.width < 500) { await p.evaluate(() => document.getElementById('scale-card').scrollIntoView()); await p.waitForTimeout(200); await p.screenshot({ path: path.join(__dirname, 'screenshots', file) }); }
            else await p.screenshot({ path: path.join(__dirname, 'screenshots', file) });
            await p.context().close();
        }
        console.log('screenshots written');
    }

    // ---- every file the page asks for loads, icons and screenshots exist
    p = await load(b, desk);
    await p.evaluate(() => Promise.race([navigator.serviceWorker.ready, new Promise(r => setTimeout(r, 8000))]));
    ok('page requests: no failed files', !p.bad.length);
    const need = ['favicon.svg', 'manifest.webmanifest', 'sw.js', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', '../help.js', '../theme.js', 'core.js', 'script.js', 'style.css'];
    for (const f of need) { const r = await p.request.get(new URL(f, url).href); ok('file returns 200: ' + f, r.status() === 200); }
    ok('service worker is registered', await p.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())));
    await p.context().close();
    if (!(bi > 0)) {
        ['screenshots/desktop.png', 'screenshots/phone.png'].forEach(f => ok('exists: ' + f, fs.existsSync(path.join(__dirname, f))));
        const readme = fs.readFileSync(path.join(__dirname, 'README.md'), 'utf8');
        [...readme.matchAll(/\]\(([^)#]+)\)|src="([^"]+)"/g)].map(m => m[1] || m[2]).filter(l => !/^https?:|^mailto:/.test(l)).forEach(l => ok('README link resolves: ' + l, fs.existsSync(path.join(__dirname, l))));
    }

    await b.close(); if (srv) srv.close();
    console.log('\n' + (fail ? 'FAILED: ' + fail : 'ALL UI CHECKS PASSED'));
    process.exitCode = fail ? 1 : 0;
}
main().catch(e => { console.error(e); process.exitCode = 1; });
