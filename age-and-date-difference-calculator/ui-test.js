// Drives the real page in headless Chromium: node ui-test.js [--shots] [--base https://umar8092.github.io/apps]
// Without --base it serves this repo on localhost. With --base it tests the LIVE page.
// The clock is set to Sunday 11 October 2026, 12:00, so every answer can be checked against hand-worked numbers.
const pw = (() => { for (const m of ['playwright', 'playwright-core', '/opt/node-tools/node_modules/playwright']) { try { return require(m); } catch (e) { /* next */ } } throw new Error('playwright not found'); })();
const path = require('path'), fs = require('fs'), http = require('http');
const bi = process.argv.indexOf('--base');
const shots = process.argv.includes('--shots');
const KEY = 'age-and-date-difference-calculator.state';
let fail = 0, url;
const ok = (name, cond, extra) => { if (!cond) fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (!cond && extra != null ? '  -> ' + JSON.stringify(extra).slice(0, 300) : '')); };

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

async function open(b, vp, opt = {}) {
    const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: vp.width < 500 ? 2 : 1, colorScheme: opt.theme || 'dark', permissions: ['clipboard-read', 'clipboard-write'], serviceWorkers: opt.sw ? 'allow' : 'block' });
    if (opt.state !== undefined) await ctx.addInitScript(([k, s]) => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem(k, s); } }, [KEY, typeof opt.state === 'string' ? opt.state : JSON.stringify(opt.state)]);
    const p = await ctx.newPage();
    await p.clock.install({ time: new Date(2026, 9, 11, 12, 0, 0) });
    p.errors = []; p.on('console', m => m.type() === 'error' && p.errors.push(m.text())); p.on('pageerror', e => p.errors.push(String(e)));
    p.bad = []; p.on('response', r => { if (r.status() >= 400) p.bad.push(r.status() + ' ' + r.url()); });
    await p.goto(url, { waitUntil: 'networkidle' });
    p.ctx = ctx;
    return p;
}
const txt = (p, sel) => p.locator(sel).first().innerText();
const big = p => txt(p, '#r-big');
const facts = p => p.evaluate(() => { const o = {}; const dl = document.getElementById('r-facts'); [...dl.querySelectorAll('dt')].forEach(dt => { o[dt.textContent] = dt.nextElementSibling.textContent; }); return o; });
const saved = p => p.$$eval('#saved .saved-item', l => l.map(li => ({ name: li.querySelector('.s-name') && li.querySelector('.s-name').textContent, head: li.querySelector('.s-head') && li.querySelector('.s-head').textContent })));
const stored = p => p.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), KEY);

async function layout(p) {
    return p.evaluate(() => {
        const W = document.documentElement.clientWidth, bad = [];
        if (document.documentElement.scrollWidth > W + 1) bad.push('horizontal scroll ' + document.documentElement.scrollWidth);
        const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
        const ctrls = [...document.querySelectorAll('main input:not([type=checkbox]):not([type=radio]), main select, main button, main a.secondary')].filter(vis);
        ctrls.forEach(e => { const r = e.getBoundingClientRect(); if (r.right > W + 1 || r.left < -1) bad.push('sticks out: ' + (e.id || e.textContent.trim().slice(0, 20))); });
        for (let i = 0; i < ctrls.length; i++) for (let j = i + 1; j < ctrls.length; j++) {
            const a = ctrls[i].getBoundingClientRect(), c = ctrls[j].getBoundingClientRect();
            if (Math.min(a.right, c.right) - Math.max(a.left, c.left) > 2 && Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top) > 2) bad.push('overlap: ' + (ctrls[i].id || ctrls[i].textContent.trim().slice(0, 15)) + ' / ' + (ctrls[j].id || ctrls[j].textContent.trim().slice(0, 15)));
        }
        // placeholders and texts must fit their boxes
        [...document.querySelectorAll('main input[type=text]')].filter(vis).forEach(i => { if (!i.placeholder) return; const c = document.createElement('canvas').getContext('2d'); const cs = getComputedStyle(i); c.font = cs.fontSize + ' ' + cs.fontFamily; const w = c.measureText(i.placeholder).width; if (w > i.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) + 1) bad.push('placeholder cut: ' + i.id); });
        [...document.querySelectorAll('main button, main .chip, main .tabs button')].filter(vis).forEach(b => { if (b.scrollWidth > b.clientWidth + 1) bad.push('button text cut: ' + b.textContent.trim()); });
        return bad;
    });
}
async function siblingsOverlap(p) {
    return p.evaluate(() => {
        const bad = [];
        document.querySelectorAll('main, .app, .col-main, .col-side').forEach(h => {
            const k = [...h.children].filter(c => { const r = c.getBoundingClientRect(); return r.width > 4 && r.height > 4 && getComputedStyle(c).position !== 'absolute'; });
            for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { const a = k[i].getBoundingClientRect(), b = k[j].getBoundingClientRect(); if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 4 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 4) bad.push(k[i].className + ' / ' + k[j].className); }
        });
        return bad;
    });
}

const FULL = { birth: '1990-08-15', from: '2026-06-01', to: '2026-11-01', amount: '90', holidays: ['2026-12-25'],
    saved: [{ id: 'a', name: "Mum's birthday", date: '1966-03-14', kind: 'birthday' }, { id: 'b', name: 'Wedding anniversary', date: '2016-10-12', kind: 'anniversary' }, { id: 'c', name: 'Visa runs out', date: '2027-01-09', kind: 'event' }] };

(async () => {
    let srv;
    if (bi >= 0) url = process.argv[bi + 1].replace(/\/$/, '') + '/age-and-date-difference-calculator/';
    else { srv = await serve(); url = 'http://localhost:' + srv.address().port + '/age-and-date-difference-calculator/'; }
    console.log('Testing ' + url);
    const b = await pw.chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});

    // ---------- first use: empty state
    let p = await open(b, { width: 390, height: 860 });
    ok('first use: opens on Age', (await p.getAttribute('#tab-age', 'aria-selected')) === 'true');
    ok('first use: today line says Sunday 11 October 2026', (await txt(p, '#today-line')) === 'Today is Sunday 11 October 2026.');
    ok('first use: answer asks for a date of birth', (await big(p)) === 'Type a date of birth' && await p.locator('#tools').isHidden());
    ok('first use: Age on is today', (await p.inputValue('#age-on')) === '2026-10-11');
    ok('first use: My dates shows the empty message', await p.locator('#saved-empty').isVisible());
    ok('first use: working days box hidden on Age', await p.locator('#workdays-box').isHidden());
    ok('first use: no error shown', (await txt(p, '#age-err')) === '');

    // ---------- the main situation: age
    await p.fill('#birth', '1990-08-15');
    ok('age: 36 years', (await big(p)) === '36 years');
    ok('age: line says 36 years, 1 month and 26 days old', (await txt(p, '#r-line')) === 'Today you are 36 years, 1 month and 26 days old.');
    let f = await facts(p);
    ok('age: 433 months and 26 days', f['In months'] === '433 months and 26 days', f);
    ok('age: 1,886 weeks and 4 days', f['In weeks'] === '1,886 weeks and 4 days');
    ok('age: 13,206 days', f['In days'] === '13,206 days');
    ok('age: born on a Wednesday', f['Born on a'] === 'Wednesday');
    ok('age: next birthday turns 37 on Sun 15 Aug 2027, in 308 days', f['Next birthday'] === 'Turns 37 on Sun 15 Aug 2027, in 308 days (10 months and 4 days)', f);
    // job form cutoff date
    await p.fill('#age-on', '2027-01-01');
    ok('age on a form date: 24? no, 36 years, label says Age on Fri 1 Jan 2027', (await txt(p, '#res-label')) === 'Age on Fri 1 Jan 2027');
    await p.fill('#birth', '2002-01-20');
    ok('job form: born 20 Jan 2002, on 1 Jan 2027: 24 years, 11 months and 12 days', (await txt(p, '#r-line')) === 'On Fri 1 Jan 2027 the age is 24 years, 11 months and 12 days old.');
    ok('job form: next birthday after that date', !!(await facts(p))['Next birthday after that date']);
    await p.click('#age-on-today');
    ok('Today button sets Age on back to today', (await p.inputValue('#age-on')) === '2026-10-11' && (await txt(p, '#res-label')) === 'Age today');
    // edge: future birth, birthday today, born today, 29 February
    await p.fill('#birth', '2027-01-01');
    ok('birth in the future: clear error, no answer', (await txt(p, '#age-err')) === 'That date of birth is in the future. Check the year.' && (await big(p)) === 'Type a date of birth');
    await p.fill('#age-on', '2026-06-01');
    ok('birth after the Age on date: error names Age on', (await txt(p, '#age-err')).includes('after the "Age on" date'));
    await p.click('#age-on-today');
    await p.fill('#birth', '2000-10-11');
    ok('birthday today: Happy birthday line', (await txt(p, '#r-line')) === 'Happy birthday! Exactly 26 years old today.');
    await p.fill('#birth', '2026-10-11');
    ok('born today: 0 years and a welcome line', (await big(p)) === '0 years' && (await txt(p, '#r-line')) === 'Born today. Welcome to the world!');
    await p.fill('#birth', '2004-02-29');
    ok('29 Feb birth: the choice appears', await p.locator('#feb29-box').isVisible());
    ok('29 Feb birth: note says 28 February', (await txt(p, '#r-note')).includes('28 February'));
    await p.fill('#age-on', '2026-02-28');
    ok('29 Feb birth, 28 Feb rule: 22 on 28 Feb 2026', (await big(p)) === '22 years');
    await p.check('input[name=rule][value=next]');
    ok('29 Feb birth, 1 March rule: still 21 on 28 Feb 2026', (await big(p)) === '21 years' && (await facts(p))['Next birthday after that date'].startsWith('Turns 22 on Sun 1 Mar 2026, tomorrow'));
    await p.fill('#birth', '1990-08-15');
    ok('the 29 Feb choice hides for other birthdays', await p.locator('#feb29-box').isHidden());
    await p.fill('#age-on', '');
    ok('blank Age on: asks for it', (await txt(p, '#age-err')).includes('tap Today'));
    await p.click('#age-on-today');
    ok('no console errors so far', p.errors.length === 0, p.errors);

    // ---------- save a birthday to My dates
    await p.click('#open-save');
    ok('save: name box opens with a placeholder', await p.locator('#save-name').isVisible() && (await p.getAttribute('#save-name', 'placeholder')) === 'e.g. My birthday');
    await p.click('#save-form button[type=submit]');
    ok('save: blank name is refused', (await txt(p, '#save-err')).startsWith('Type a name'));
    await p.fill('#save-name', '  My birthday  ');
    await p.press('#save-name', 'Enter');
    let s = await saved(p);
    ok('save: My birthday is listed, turns 37 in 308 days', s.length === 1 && s[0].name === 'My birthday' && s[0].head === 'Turns 37 in 308 days', s);
    ok('save: stored with an ISO date', (await stored(p)).saved[0].date === '1990-08-15');

    // ---------- My dates: add, validate, very long text, edit, delete, undo
    await p.click('#open-new');
    await p.click('#new-form button[type=submit]');
    ok('add: blank name refused', (await txt(p, '#n-err')).startsWith('Type a name'));
    await p.fill('#n-name', 'Visa runs out');
    await p.click('#new-form button[type=submit]');
    ok('add: blank date refused', (await txt(p, '#n-err')).startsWith('Pick the whole date'));
    await p.fill('#n-date', '2027-01-09'); await p.selectOption('#n-kind', 'event');
    await p.click('#new-form button[type=submit]');
    s = await saved(p);
    ok('add: Visa runs out, 90 days to go, sorted after nothing sooner', s.map(x => x.name).join('|') === 'Visa runs out|My birthday' && s[0].head === '90 days to go', s);
    await p.click('#open-new');
    const long = 'A very long name that someone pasted in from somewhere else and it keeps going on and on';
    await p.fill('#n-name', long); await p.fill('#n-date', '2016-10-12'); await p.selectOption('#n-kind', 'anniversary');
    await p.click('#new-form button[type=submit]');
    s = await saved(p);
    ok('add: long name cut to 60 characters, anniversary tomorrow is first', s[0].name === long.slice(0, 60).trim() && s[0].head === '10th anniversary tomorrow', s);
    ok('layout with a long name has no overflow (390)', (await layout(p)).length === 0, await layout(p));
    // edit
    await p.locator('#saved .saved-item').first().locator('button', { hasText: 'Edit' }).click();
    const ef = p.locator('#saved .editing form');
    await ef.locator('input[type=text]').fill('Wedding anniversary');
    await ef.locator('button[type=submit]').click();
    s = await saved(p);
    ok('edit: renamed and kept', s[0].name === 'Wedding anniversary' && s.length === 3);
    await p.locator('#saved-msg button').click();
    ok('edit: Undo brings the old name back', (await saved(p))[0].name === long.slice(0, 60).trim());
    await p.locator('#saved .saved-item').first().locator('button', { hasText: 'Edit' }).click();
    await p.locator('#saved .editing input[type=text]').fill('Wedding anniversary');
    await p.locator('#saved .editing input[type=date]').fill('');
    await p.locator('#saved .editing button[type=submit]').click();
    ok('edit: a blank date is refused inside the box', (await p.locator('#saved .editing .err').innerText()).startsWith('Pick the whole date'));
    await p.locator('#saved .editing input[type=date]').fill('2016-10-12');
    await p.locator('#saved .editing button[type=submit]').click();
    ok('edit: saved with the date', (await saved(p))[0].name === 'Wedding anniversary');
    // delete with undo
    await p.locator('#saved .saved-item', { hasText: 'Visa runs out' }).locator('button', { hasText: 'Delete' }).click();
    ok('delete: gone', (await saved(p)).length === 2 && (await txt(p, '#saved-msg')).startsWith('Deleted "Visa runs out"'));
    await p.locator('#saved-msg button').click();
    ok('delete: Undo brings it back', (await saved(p)).length === 3);

    // ---------- reload with saved state (second visit)
    await p.reload({ waitUntil: 'networkidle' });
    ok('reload: birth date and answer kept', (await p.inputValue('#birth')) === '1990-08-15' && (await big(p)) === '36 years');
    ok('reload: My dates kept', (await saved(p)).length === 3);

    // ---------- Days between dates
    await p.click('#tab-between');
    ok('between: tab switches and working days box shows', (await p.getAttribute('#tab-between', 'aria-selected')) === 'true' && await p.locator('#workdays-box').isVisible());
    ok('between: empty asks for two dates', (await big(p)) === 'Type two dates');
    await p.fill('#from', '2026-06-01');
    ok('between: one date only asks for the other', (await txt(p, '#between-err')) === 'Now type the To date, or tap To today.');
    await p.fill('#to', '2026-11-01');
    ok('between: 153 days', (await big(p)) === '153 days');
    f = await facts(p);
    ok('between: 5 months, 21 weeks and 6 days, 110 working days', f['In months'] === '5 months' && f['In weeks'] === '21 weeks and 6 days' && f['Working days'] === '110 (Monday to Friday)', f);
    ok('between: days counted Mon 1 Jun 2026 to Sat 31 Oct 2026', f['Days counted'] === 'Mon 1 Jun 2026 to Sat 31 Oct 2026');
    ok('between: line says not counting the end date', (await txt(p, '#r-line')) === 'From Mon 1 Jun 2026 to Sun 1 Nov 2026, not counting the end date.');
    await p.check('#include-end');
    ok('between: counting the end date: 154 days, last counted Sun 1 Nov', (await big(p)) === '154 days' && (await facts(p))['Days counted'] === 'Mon 1 Jun 2026 to Sun 1 Nov 2026');
    await p.uncheck('#include-end');
    await p.click('#swap');
    ok('between: Swap dates swaps and says counting back', (await p.inputValue('#from')) === '2026-11-01' && (await big(p)) === '153 days' && (await txt(p, '#r-note')).includes('counts back'));
    await p.click('#swap');
    // working days settings: Friday and Saturday weekend, a holiday
    await p.click('#workdays-box summary');
    await p.fill('#from', '2026-10-05'); await p.fill('#to', '2026-10-17'); await p.check('#include-end');
    ok('between: Mon 5 to Sat 17 Oct counting both: 10 working days', (await facts(p))['Working days'] === '10 (Monday to Friday)');
    await p.fill('#hol-date', '2026-10-07'); await p.click('#hol-add');
    ok('holiday added: 9 working days, says 1 day off', (await facts(p))['Working days'] === '9 (Monday to Friday, not counting 1 day off)' && (await txt(p, '#wd-summary')) === 'Monday to Friday + 1 day off');
    await p.fill('#hol-date', '2026-10-07'); await p.click('#hol-add');
    ok('holiday twice: refused', (await txt(p, '#hol-err')).includes('already on the list'));
    await p.fill('#hol-date', ''); await p.click('#hol-add');
    ok('holiday blank: asks for a date', (await txt(p, '#hol-err')).startsWith('Pick the date'));
    await p.locator('#hols button').click();
    ok('holiday removed: back to 10', (await facts(p))['Working days'] === '10 (Monday to Friday)');
    await p.locator('#hol-msg button').click();
    ok('holiday Undo: back to 9', (await facts(p))['Working days'].startsWith('9 '));
    await p.locator('#weekend label', { hasText: 'Sun' }).locator('input').uncheck();
    await p.locator('#weekend label', { hasText: 'Fri' }).locator('input').check();
    ok('Friday and Saturday off: Sunday to Thursday', (await facts(p))['Working days'].startsWith('8 (Sunday to Thursday') && (await txt(p, '#wd-summary')).startsWith('Sunday to Thursday'), await facts(p));
    for (const d of ['Mon', 'Tue', 'Wed', 'Thu', 'Sun']) await p.locator('#weekend label', { hasText: d }).locator('input').click();
    ok('all 7 days off: refused with a message', (await txt(p, '#weekend-err')) === 'At least one day must be a working day.' && !(await p.locator('#weekend label', { hasText: 'Sun' }).locator('input').isChecked()));
    for (const d of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']) await p.locator('#weekend label', { hasText: d }).locator('input').uncheck();
    await p.locator('#weekend label', { hasText: 'Sun' }).locator('input').check();
    ok('back to Monday to Friday', (await txt(p, '#wd-summary')).startsWith('Monday to Friday'));
    await p.fill('#from', '2026-10-11'); await p.fill('#to', '2026-10-11'); await p.uncheck('#include-end');
    ok('same day: 0 days with a hint', (await big(p)) === '0 days' && (await txt(p, '#r-line')).startsWith('Both dates are the same day'));
    await p.click('#from-today'); await p.fill('#to', '2026-12-25');
    ok('From today to Christmas: 75 days, save button offers Fri 25 Dec 2026', (await big(p)) === '75 days' && (await txt(p, '#open-save')) === 'Save Fri 25 Dec 2026 to My dates');
    await p.fill('#to', '2026-01-01');
    ok('a past To date: no save button (only future dates are saved from here)', await p.locator('#save-box').isHidden());

    // ---------- Add or subtract
    await p.click('#tab-add');
    ok('add: start is today, asks for how many', (await p.inputValue('#start')) === '2026-10-11' && (await big(p)) === 'Type how many to add');
    await p.fill('#amount', '90');
    ok('add: 90 days after Sun 11 Oct 2026 is Sat 9 Jan 2027', (await big(p)) === 'Sat 9 Jan 2027' && (await txt(p, '#r-line')) === '90 days after Sun 11 Oct 2026 is Saturday.');
    ok('add: the 90 days quick pick lights up', (await p.getAttribute('#amount-chips [data-a="90"][data-u="days"]', 'aria-pressed')) === 'true');
    await p.click('#amount-chips [data-a="6"]');
    ok('add: 6 months quick pick: Sun 11 Apr 2027, 182 days', (await big(p)) === 'Sun 11 Apr 2027' && (await facts(p))['In days'] === '182 days');
    await p.check('input[name=sign][value="-1"]');
    ok('subtract 6 months: Sat 11 Apr 2026', (await big(p)) === 'Sat 11 Apr 2026' && (await txt(p, '#res-label')) === 'The date before');
    await p.check('input[name=sign][value="1"]');
    await p.fill('#start', '2026-01-31'); await p.fill('#amount', '1'); await p.selectOption('#unit', 'months');
    ok('1 month after 31 Jan 2026: Sat 28 Feb 2026 with a note', (await big(p)) === 'Sat 28 Feb 2026' && (await txt(p, '#r-note')) === '31 February 2026 does not exist, so this is the last day of February.');
    ok('add: From today shown when the start is not today', (await facts(p))['From today'] === '225 days ago');
    await p.fill('#start', '2026-10-09'); await p.fill('#amount', '5'); await p.selectOption('#unit', 'workdays');
    ok('5 working days after Fri 9 Oct: Fri 16 Oct', (await big(p)) === 'Fri 16 Oct 2026' && (await facts(p))['Working days'].includes('The start date is not counted'));
    for (const [v, msg] of [['-5', 'without a minus sign'], ['1.5', 'whole number'], ['abc', 'Type a number'], ['99999999', 'too many']]) {
        await p.fill('#amount', v);
        ok('amount "' + v + '": clear message, no answer', (await txt(p, '#add-err')).includes(msg) && (await big(p)) === 'Type how many to add');
    }
    await p.fill('#amount', ' 1,000 '); await p.selectOption('#unit', 'days');
    ok('pasted " 1,000 " days works', (await big(p)) === 'Thu 5 Jul 2029');
    await p.fill('#amount', '0');
    ok('0 days: the same date', (await big(p)) === 'Fri 9 Oct 2026');
    await p.fill('#start', '9999-12-01'); await p.fill('#amount', '100');
    ok('past year 9999: range message', (await txt(p, '#add-err')).includes('1000 to 9999'));
    await p.fill('#start', '');
    ok('blank start: asks for it', (await txt(p, '#add-err')).includes('start date'));
    await p.click('#start-today'); await p.fill('#amount', '90'); await p.selectOption('#unit', 'days');
    // save the result as a deadline
    await p.click('#open-save'); await p.fill('#save-name', 'Passport renewal'); await p.click('#save-form button[type=submit]');
    ok('save from Add: Passport renewal 90 days to go', (await saved(p)).some(x => x.name === 'Passport renewal' && x.head === '90 days to go'));

    // ---------- copy, email, print
    await p.click('#copy');
    const clip = await p.evaluate(() => navigator.clipboard.readText());
    ok('copy: the answer as text with the link', clip.startsWith('The date after: Sat 9 Jan 2027\n90 days after Sun 11 Oct 2026 is Saturday.') && clip.includes('https://umar8092.github.io/apps/age-and-date-difference-calculator/'), clip);
    const mail = await p.getAttribute('#mail', 'href');
    ok('email: mailto with no recipient, subject and body', mail.startsWith('mailto:?subject=') && decodeURIComponent(mail).includes('Sat 9 Jan 2027'));
    await p.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed++; }; });
    await p.click('#print');
    ok('print: calls the browser print', (await p.evaluate(() => window.__printed)) === 1);

    // ---------- start over and undo
    await p.click('#clear');
    ok('Start over clears Add (start back to today, amount blank)', (await p.inputValue('#amount')) === '' && (await big(p)) === 'Type how many to add');
    await p.locator('#clear-msg button').click();
    ok('Start over Undo brings it back', (await p.inputValue('#amount')) === '90' && (await big(p)) === 'Sat 9 Jan 2027');
    await p.click('#tab-age'); await p.click('#clear');
    ok('Start over on Age clears the date of birth only', (await p.inputValue('#birth')) === '' && (await saved(p)).length === 4);
    await p.locator('#clear-msg button').click();
    ok('Undo on Age brings back 36 years', (await big(p)) === '36 years');

    // ---------- keyboard: arrow keys move between tabs
    await p.focus('#tab-age'); await p.keyboard.press('ArrowRight');
    ok('keyboard: ArrowRight moves to Days between dates', (await p.getAttribute('#tab-between', 'aria-selected')) === 'true' && await p.evaluate(() => document.activeElement.id) === 'tab-between');
    await p.keyboard.press('End');
    ok('keyboard: End moves to Add or subtract', (await p.getAttribute('#tab-add', 'aria-selected')) === 'true');
    await p.keyboard.press('ArrowRight');
    ok('keyboard: wraps round to Age', (await p.getAttribute('#tab-age', 'aria-selected')) === 'true');
    ok('screen reader: tabs and panels are labelled, answer is live', await p.evaluate(() => document.querySelectorAll('[role=tab][aria-controls]').length === 3 && document.getElementById('result').getAttribute('aria-live') === 'polite' && [...document.querySelectorAll('main input:not([type=checkbox]):not([type=radio]), main select')].every(i => i.labels && i.labels.length)));

    // ---------- the next day while the page stays open
    await p.clock.setSystemTime(new Date(2026, 9, 12, 0, 1, 0));
    await p.clock.runFor(61000);
    ok('midnight: today line moves to Monday 12 October', (await txt(p, '#today-line')) === 'Today is Monday 12 October 2026.');
    ok('midnight: Age on follows today', (await p.inputValue('#age-on')) === '2026-10-12' && (await facts(p))['Next birthday'].includes('in 307 days'));
    ok('midnight: My dates count down by one (anniversary today)', (await saved(p)).some(x => x.head === 'Today! 10th anniversary'));
    ok('no console errors in the whole run', p.errors.length === 0, p.errors);
    await p.ctx.close();

    // ---------- corrupt and odd saved state
    p = await open(b, { width: 390, height: 860 }, { state: '{bad' });
    ok('corrupt state: starts fresh, no errors', (await big(p)) === 'Type a date of birth' && p.errors.length === 0, p.errors);
    await p.ctx.close();
    p = await open(b, { width: 390, height: 860 }, { state: { mode: 'between', from: '2026-02-31', to: 5, saved: [{ name: '<img src=x onerror=alert(1)>', date: '2027-01-01', kind: 'event' }, { name: 'bad', date: 'x' }] } });
    ok('odd state: bad dates dropped, mode kept', (await p.getAttribute('#tab-between', 'aria-selected')) === 'true' && (await p.inputValue('#from')) === '');
    ok('odd state: HTML in a name shows as text', (await saved(p)).length === 1 && (await saved(p))[0].name === '<img src=x onerror=alert(1)>' && (await p.locator('#saved img').count()) === 0);
    await p.ctx.close();
    // storage blocked
    {
        const ctx = await b.newContext({ viewport: { width: 390, height: 860 }, serviceWorkers: 'block' });
        await ctx.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
        const q = await ctx.newPage(); const errs = []; q.on('pageerror', e => errs.push(String(e)));
        await q.goto(url, { waitUntil: 'networkidle' });
        await q.fill('#birth', '1990-08-15');
        ok('storage blocked: still works and says it is not saving', (await txt(q, '#r-big')) === '36 years' && (await txt(q, '#tools-msg')).includes('not saving') && errs.length === 0, errs);
        await ctx.close();
    }

    // ---------- every width, dark and light, filled and cleared, every tab, all optional parts open
    const WIDTHS = [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920];
    for (const theme of ['dark', 'light']) {
        const q = await open(b, { width: 390, height: 860 }, { state: FULL, theme });
        for (const w of WIDTHS) {
            await q.setViewportSize({ width: w, height: 900 });
            for (const mode of ['age', 'between', 'add']) {
                await q.click('#tab-' + mode);
                if (mode !== 'age' && !(await q.locator('#workdays-box').evaluate(e => e.open))) await q.click('#workdays-box summary');
                if (await q.locator('#open-save').isVisible()) await q.click('#open-save');
                if (await q.locator('#open-new').isVisible()) await q.click('#open-new');
                if (mode === 'age') { await q.fill('#birth', '2004-02-29'); }
                const lay = await layout(q);
                ok(theme + ' ' + w + 'px ' + mode + ': no overflow, overlaps or cut text', lay.length === 0, lay);
                if (w >= 900) for (const pos of [0, .5, 1]) {
                    await q.evaluate(x => window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * x), pos);
                    const o = await siblingsOverlap(q); if (o.length) ok(theme + ' ' + w + 'px ' + mode + ' scroll ' + pos + ': blocks do not overlap', false, o);
                }
                if (mode === 'age') await q.fill('#birth', '1990-08-15');
                if (await q.locator('#save-cancel').isVisible()) await q.click('#save-cancel');
            }
        }
        // cleared state
        await q.click('#tab-age'); await q.click('#clear');
        for (const w of [320, 390, 1280]) { await q.setViewportSize({ width: w, height: 900 }); const lay = await layout(q); ok(theme + ' ' + w + 'px cleared: clean layout', lay.length === 0, lay); }
        ok(theme + ': no console errors', q.errors.length === 0, q.errors);
        await q.ctx.close();
    }

    // ---------- light/dark switch
    p = await open(b, { width: 1280, height: 900 });
    const bg1 = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await p.locator('.theme-toggle').click();
    const bg2 = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
    ok('light/dark switch changes the colours', bg1 !== bg2 && (await p.evaluate(() => document.documentElement.dataset.theme)) === 'light');
    // help dialog at 4 widths
    for (const w of [320, 390, 820, 1280]) {
        await p.setViewportSize({ width: w, height: 800 });
        await p.click('.help-btn');
        const box = await p.locator('dialog.help').boundingBox();
        ok('help ' + w + 'px: opens fully on screen with its title', box && box.x >= 0 && box.x + box.width <= w && box.y >= 0 && box.y + box.height <= 800 && (await p.locator('dialog.help h2').innerText()) === 'How to use Age and Date Difference Calculator');
        await p.keyboard.press('Escape');
        ok('help ' + w + 'px: Escape closes', !(await p.locator('dialog.help').evaluate(d => d.open)));
        await p.click('.help-btn'); await p.click('.help-close');
        ok('help ' + w + 'px: Got it closes', !(await p.locator('dialog.help').evaluate(d => d.open)));
        const tb = await p.evaluate(() => { const r = [...document.querySelectorAll('.topbar > *')].map(e => e.getBoundingClientRect()); return { tops: r.map(x => Math.round(x.top)), bad: r.some((a, i) => r.some((c, j) => j > i && Math.min(a.right, c.right) - Math.max(a.left, c.left) > 1 && Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top) > 1)) }; });
        ok('help ' + w + 'px: top bar on one line, nothing overlaps', !tb.bad && new Set(tb.tops).size === 1, tb);
    }
    // files the page needs
    const files = ['favicon.svg', 'manifest.webmanifest', 'sw.js', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', '../help.js', '../theme.js', 'core.js', 'script.js', 'style.css', 'screenshots/desktop.png', 'screenshots/phone.png'];
    for (const fl of files) { const r = await p.request.get(new URL(fl, url).href); ok('file ' + fl + ' returns 200', r.status() === 200, r.status()); }
    ok('no failed requests', p.bad.length === 0, p.bad);
    await p.ctx.close();

    // service worker: offline after the first visit
    {
        const ctx = await b.newContext({ viewport: { width: 390, height: 860 } });
        const q = await ctx.newPage();
        await q.goto(url, { waitUntil: 'networkidle' });
        await q.evaluate(() => navigator.serviceWorker.ready);
        await q.reload({ waitUntil: 'networkidle' });
        await ctx.setOffline(true);
        await q.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
        await q.fill('#birth', '1990-08-15');
        ok('offline: the page loads from the saved copy and works', /years$/.test(await q.locator('#r-big').innerText()));
        await ctx.close();
    }

    if (shots) {
        const dir = path.join(__dirname, 'screenshots');
        for (const [w, h, name, scale] of [[1280, 1000, 'desktop.png', 1], [390, 844, 'phone.png', 2]]) {
            const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: scale, colorScheme: 'dark', serviceWorkers: 'block' });
            await ctx.addInitScript(([k, s]) => localStorage.setItem(k, s), [KEY, JSON.stringify(Object.assign({}, FULL, { birth: '', holidays: [] }))]);
            const q = await ctx.newPage();
            await q.clock.install({ time: new Date(2026, 9, 11, 12, 0, 0) });
            await q.goto(url, { waitUntil: 'networkidle' });
            await q.fill('#birth', '1990-08-15');
            await q.evaluate(() => document.activeElement.blur());
            await q.screenshot({ path: path.join(dir, name) });
            await ctx.close();
        }
        console.log('screenshots saved');
    }

    await b.close(); if (srv) srv.close();
    console.log(fail ? '\n' + fail + ' FAILED' : '\nALL UI CHECKS PASSED');
    process.exit(fail ? 1 : 0);
})();
