// Full page test with Playwright. Run from the repo root or this folder: node ui-test.js
//   BASE=https://umar8092.github.io/apps node ui-test.js   tests the live site
//   node ui-test.js --shots                                 also saves screenshots/desktop.png and phone.png
// "Today" is fixed to Tue 20 Oct 2026 in Pakistan time so every answer can be checked exactly.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.resolve(__dirname, '..'), SLUG = 'reading-log-and-book-goal-tracker', KEY = SLUG + '.state';
const SHOTS = process.argv.includes('--shots');
const NOW = new Date('2026-10-20T10:00:00+05:00');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; if (!cond) console.log('FAIL ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra).slice(0, 400) : '')); };

function serve() {
    const types = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml', png: 'image/png', webmanifest: 'application/manifest+json' };
    return new Promise(res => { const s = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0].replace(/^\/apps/, '')); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': types[f.split('.').pop()] || 'application/octet-stream' }); r.end(fs.readFileSync(f)); }).listen(0, () => res(s)); });
}

// Ayesha's shelf from the README: a book club novel due Friday, an audiobook, an ebook, 21 books finished this year, goal 24.
const B = (id, title, author, x) => Object.assign({ id, title, author, format: 'pages', total: 300, start: 0, status: 'finished', added: '2026-01-02', by: '', finished: '', log: [] }, x);
const TITLES = [['Atomic Habits', 'James Clear'], ['Educated', 'Tara Westover'], ['The Alchemist', 'Paulo Coelho'], ['Sapiens', 'Yuval Noah Harari'], ['The Forty Rules of Love', 'Elif Shafak'],
    ['Project Hail Mary', 'Andy Weir'], ['Becoming', 'Michelle Obama'], ['The Midnight Library', 'Matt Haig'], ['Klara and the Sun', 'Kazuo Ishiguro'], ['Deep Work', 'Cal Newport'],
    ['A Thousand Splendid Suns', 'Khaled Hosseini'], ['The Psychology of Money', 'Morgan Housel'], ['Circe', 'Madeline Miller'], ['Man’s Search for Meaning', 'Viktor Frankl'],
    ['Pachinko', 'Min Jin Lee'], ['Thinking, Fast and Slow', 'Daniel Kahneman'], ['The Housemaid', 'Freida McFadden'], ['Ikigai', 'Héctor García'], ['Normal People', 'Sally Rooney'],
    ['The Silent Patient', 'Alex Michaelides'], ['Shantaram', 'Gregory David Roberts']];
const SHELF = { v: 1, seq: 40, goals: { 2026: 24 }, books: [
    B(1, 'The Kite Runner', 'Khaled Hosseini', { total: 320, status: 'reading', added: '2026-10-16', by: '2026-10-23', log: [{ d: '2026-10-17', at: 40 }, { d: '2026-10-18', at: 90 }, { d: '2026-10-20', at: 182 }] }),
    B(2, 'Dune', 'Frank Herbert', { format: 'percent', total: 100, status: 'reading', added: '2026-10-01', log: [{ d: '2026-10-02', at: 6 }, { d: '2026-10-06', at: 14 }, { d: '2026-10-09', at: 21 }, { d: '2026-10-12', at: 30 }, { d: '2026-10-15', at: 36 }, { d: '2026-10-19', at: 42 }] }),
    B(3, 'The Body', 'Bill Bryson', { format: 'audio', total: 1060, status: 'reading', added: '2026-10-10', log: [{ d: '2026-10-11', at: 50 }, { d: '2026-10-13', at: 130 }, { d: '2026-10-14', at: 175 }, { d: '2026-10-16', at: 240 }, { d: '2026-10-19', at: 310 }] }),
    B(4, 'Tomorrow, and Tomorrow, and Tomorrow', 'Gabrielle Zevin', { total: 416, status: 'want' })
].concat(TITLES.map(([t, a], i) => {
    const fin = '2026-' + String(1 + Math.floor(i * 9.4 / 21)).padStart(2, '0') + '-' + String(5 + (i * 7) % 22).padStart(2, '0');
    return B(10 + i, t, a, { finished: fin, log: i > 16 ? [{ d: '2026-09-' + String(8 + (i - 17) * 6).padStart(2, '0'), at: 120 }, { d: fin, at: 300 }] : [] });
})).concat([B(31, 'Wolf Hall', 'Hilary Mantel', { total: 650, status: 'stopped', log: [{ d: '2026-08-01', at: 80 }, { d: '2026-08-04', at: 112 }] })]) };
// The Kite Runner was started on the 16th; give the other days to the finished Shantaram so the chart is a real month
SHELF.books.find(b => b.title === 'Shantaram').log = [['2026-09-21', 30], ['2026-09-22', 75], ['2026-09-24', 110], ['2026-09-25', 140], ['2026-09-27', 196], ['2026-09-28', 230], ['2026-09-29', 262], ['2026-10-01', 300]].map(([d, at]) => ({ d, at }));
SHELF.books.find(b => b.title === 'Shantaram').finished = '2026-10-01';
SHELF.books.find(b => b.title === 'The Silent Patient').log = [['2026-10-03', 40], ['2026-10-04', 95], ['2026-10-05', 130], ['2026-10-07', 190], ['2026-10-08', 236], ['2026-10-10', 300]].map(([d, at]) => ({ d, at }));
SHELF.books.find(b => b.title === 'The Silent Patient').finished = '2026-10-10';
SHELF.books.find(b => b.title === 'Normal People').log = [['2026-10-11', 70], ['2026-10-12', 150], ['2026-10-14', 230], ['2026-10-15', 300]].map(([d, at]) => ({ d, at }));
SHELF.books.find(b => b.title === 'Normal People').finished = '2026-10-15';

(async () => {
    let srv, base = process.env.BASE;
    if (!base) { srv = await serve(); base = 'http://localhost:' + srv.address().port + '/apps'; }
    const URL = base + '/' + SLUG + '/';
    const browser = await chromium.launch();
    const errors = [], failed = [], requested = new Set();
    async function newPage(opts, seed) {
        const ctx = await browser.newContext(Object.assign({ viewport: { width: 390, height: 844 }, acceptDownloads: true, timezoneId: 'Asia/Karachi', colorScheme: 'dark', locale: 'en-GB' }, opts || {}));
        await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new globalThis.URL(base).origin });
        await ctx.route(/goatcounter\.com|gc\.zgo\.at/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
        if (seed !== undefined) await ctx.addInitScript(([k, v]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, v); sessionStorage.setItem('seeded', '1'); } }, [KEY, typeof seed === 'string' ? seed : JSON.stringify(seed)]);
        const page = await ctx.newPage();
        await page.clock.setFixedTime(NOW);
        page.on('pageerror', e => errors.push(e.message));
        page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
        page.on('request', r => { if (r.url().startsWith(base)) requested.add(r.url()); });
        page.on('response', r => { if (r.status() >= 400 && r.url().startsWith(base)) failed.push(r.status() + ' ' + r.url()); });
        await page.goto(URL, { waitUntil: 'networkidle' });
        return { ctx, page };
    }
    const txt = (page, sel) => page.$eval(sel, e => e.textContent.replace(/\s+/g, ' ').trim()).catch(() => null);
    const vis = (page, sel) => page.isVisible(sel);
    const saved = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
    const box = (page, title) => page.locator('#now-list > li', { has: page.locator('h3', { hasText: title }) });
    async function readDownload(page, click) {
        const [dl] = await Promise.all([page.waitForEvent('download'), click()]);
        return { name: dl.suggestedFilename(), body: fs.readFileSync(await dl.path(), 'utf8') };
    }
    async function logAt(page, title, value, day) {
        const b = box(page, title);
        if (day) { await b.getByRole('button', { name: /another day/i }).click(); await box(page, title).locator('input[type=date]').fill(day); }
        await box(page, title).locator('.logf input[type=text]').first().fill(String(value));
        await box(page, title).locator('.logf .save').click();
    }

    // ---------- 1. first use: empty states ----------
    let { ctx, page } = await newPage();
    ok('first use: setup layout puts Add a book first', await page.$eval('#app', e => e.classList.contains('setup')));
    ok('first use: form open', await vis(page, '#form') && !(await vis(page, '#open-form')));
    ok('first use: reading now empty text', await vis(page, '#now-empty'));
    ok('first use: goal says none yet', (await txt(page, '#goal-body')) === 'No books finished in 2026 yet.', await txt(page, '#goal-body'));
    ok('first use: stats empty', (await txt(page, '#stats-body')).startsWith('Your streak'));
    ok('first use: want list hidden', !(await vis(page, '#want')));
    ok('optional author hidden behind a button', !(await vis(page, '#f-author')) && await vis(page, '#o-author'));
    ok('optional start and finish-by hidden', !(await vis(page, '#f-start')) && !(await vis(page, '#f-by')));
    ok('no year picker with one year', !(await vis(page, '#year-wrap')));

    // ---------- 2. errors in the form ----------
    await page.click('#save');
    ok('blank title error', (await txt(page, '#e-title')) === 'Type the book title.');
    ok('blank pages error', (await txt(page, '#e-total')) === 'Type the number of pages.');
    ok('focus goes to the first error', await page.evaluate(() => document.activeElement.id) === 'f-title');
    await page.fill('#f-title', 'The Kite Runner');
    for (const bad of ['0', '-3', 'abc', '25000', '12.5']) { await page.fill('#f-pages', bad); await page.click('#save'); ok('bad pages "' + bad + '" refused', (await txt(page, '#e-total')).startsWith('Type a whole number of pages'), await txt(page, '#e-total')); }
    ok('nothing saved after errors', (await saved(page)).books.length === 0);

    // ---------- 3. the real situation: book club on Friday ----------
    await page.fill('#f-pages', '320');
    await page.click('#o-by'); await page.fill('#f-by', '2026-10-23');
    ok('preview pages a day', (await txt(page, '#preview')) === '320 pages to go. To finish by Fri 23 Oct: 80 pages a day.', await txt(page, '#preview'));
    await page.fill('#f-by', '2026-10-19'); await page.click('#save');
    ok('finish-by in the past refused', (await txt(page, '#e-by')) === 'Pick today or a later day.');
    await page.fill('#f-by', '2026-10-23');
    await page.click('#save');
    ok('added message', (await txt(page, '#form-msg')).startsWith('Added “The Kite Runner”.'), await txt(page, '#form-msg'));
    ok('form folds away after the first book', !(await vis(page, '#form')) && await vis(page, '#open-form'));
    let kb = box(page, 'The Kite Runner');
    ok('book box shown', await kb.count() === 1);
    ok('not started line', (await txt(page, '#now-list .box-line')) === 'Not started: 320 pages');
    ok('plan from today, 4 days', (await txt(page, '#now-list .plan-plan')) === 'To finish by Fri 23 Oct read 80 pages a day from today (4 days).', await txt(page, '#now-list .plan-plan'));
    // log: Saturday 40, Sunday 90 (forgot to log), then today 182
    await logAt(page, 'The Kite Runner', 40, '2026-10-17');
    ok('saved another day message', (await txt(page, '#now-msg')).startsWith('Saved “The Kite Runner”: 40 pages read Sat 17 Oct. 280 pages left.'), await txt(page, '#now-msg'));
    await logAt(page, 'The Kite Runner', 90, '2026-10-18');
    ok('day box closes after saving', await box(page, 'The Kite Runner').locator('input[type=date]').count() === 0);
    ok('plan before reading today: 230 over 4 days = 58', (await txt(page, '#now-list .plan-plan')) === 'To finish by Fri 23 Oct read 58 pages a day from today (4 days).', await txt(page, '#now-list .plan-plan'));
    await logAt(page, 'The Kite Runner', 182);
    ok('saved today message', (await txt(page, '#now-msg')).startsWith('Saved “The Kite Runner”: 92 pages read today. 138 pages left.'), await txt(page, '#now-msg'));
    ok('where line', (await txt(page, '#now-list .box-line')) === 'Page 182 of 320, 56%, 138 pages left');
    ok('THE ANSWER: 46 pages a day from tomorrow', (await txt(page, '#now-list .plan-plan')) === 'To finish by Fri 23 Oct read 46 pages a day from tomorrow (3 days).', await txt(page, '#now-list .plan-plan'));
    const subs = await page.$$eval('#now-list .plan-sub', l => l.map(e => e.textContent));
    ok('pace compared honestly', subs[0] === 'That is more than your pace, about 45 pages a day.', subs);
    ok('estimate at pace', subs[1] === 'At your pace (about 45 pages a day) you finish around Sat 24 Oct.', subs);
    ok('today line', (await txt(page, '#now-list .today-line')) === 'Today: 92 pages.');
    ok('last time hint', (await txt(page, '#now-list .logf .hint')) === 'Last time: page 182, today.');
    ok('streak', (await txt(page, '#stats-body .big')) === 'Streak: 1 day', await txt(page, '#stats-body .big'));
    ok('longest streak', (await txt(page, '#stats-body .sub-line')) === 'Longest: 2 days.', await txt(page, '#stats-body .sub-line'));
    ok('totals today', (await page.$$eval('.totals dd', l => l.map(e => e.textContent)))[0] === '92 pages');
    ok('totals 7 days', (await page.$$eval('.totals dd', l => l.map(e => e.textContent)))[1] === '182 pages (on 3 of 7 days)');
    ok('chart has 30 days', await page.locator('.chart .col').count() === 30);

    // ---------- 4. mistakes while logging ----------
    const err = () => txt(page, '#now-list .logf .err');
    await box(page, 'The Kite Runner').locator('.logf .save').click();
    ok('blank page error', (await err()) === 'Type the page you stopped on.');
    await logAt(page, 'The Kite Runner', 'abc'); ok('text page error', (await err()) === 'Type a page number, such as 182.');
    await logAt(page, 'The Kite Runner', 400); ok('past the end error', (await err()).startsWith('This book has 320 pages.'));
    await logAt(page, 'The Kite Runner', 182); ok('same page error', (await err()) === 'You were already at page 182. Type where you stopped this time.');
    await logAt(page, 'The Kite Runner', 150);
    ok('lower page asks', (await txt(page, '.confirm p')) === 'Page 150 is before page 182, where you were last time. Did you go back to re-read?', await txt(page, '.confirm p'));
    await page.click('.confirm >> text=No, let me fix it');
    ok('fix it closes the question', await page.locator('.confirm').count() === 0 && (await saved(page)).books[0].log.length === 3);
    await logAt(page, 'The Kite Runner', 150); await page.click('.confirm >> text=Yes, I went back');
    ok('went back saved', (await txt(page, '#now-msg')).startsWith('Saved “The Kite Runner”: went back to page 150. 170 pages left.'), await txt(page, '#now-msg'));
    ok('went back counts nothing today', (await txt(page, '#now-list .today-line')) === 'Today: 92 pages.');
    await box(page, 'The Kite Runner').getByRole('button', { name: /^History of/ }).click();
    const hist = await page.$$eval('.history li span', l => l.map(e => e.textContent));
    ok('history newest first', hist[0] === 'Tue 20 Oct: page 150 (went back)' && hist[1] === 'Tue 20 Oct: page 182 (read 92 pages)' && hist[3] === 'Sat 17 Oct: page 40 (read 40 pages)', hist);
    await page.locator('.history li').first().getByRole('button').click();
    ok('history delete', (await saved(page)).books[0].log.length === 3 && (await txt(page, '#now-msg')).startsWith('Deleted the reading of Tue 20 Oct'));
    await page.click('#now-msg .undo');
    ok('undo history delete', (await saved(page)).books[0].log.length === 4);
    await page.locator('.history li').first().getByRole('button').click();
    ok('history still open after delete', await page.locator('.history').count() === 1);
    await box(page, 'The Kite Runner').getByRole('button', { name: /^Hide history/ }).click();
    ok('history hides', await page.locator('.history').count() === 0);
    // a day in the future
    await box(page, 'The Kite Runner').getByRole('button', { name: /another day/i }).click();
    await box(page, 'The Kite Runner').locator('input[type=date]').evaluate(e => { e.removeAttribute('max'); e.value = '2026-10-22'; });
    await box(page, 'The Kite Runner').locator('.logf input[type=text]').fill('200'); await box(page, 'The Kite Runner').locator('.logf .save').click();
    ok('future day refused', (await err()) === 'That day has not come yet. Pick today or an earlier day.');
    await box(page, 'The Kite Runner').getByRole('button', { name: 'Back to today' }).click();

    // ---------- 5. the yearly goal ----------
    await page.click('#goal-open');
    for (const bad of ['abc', '0', '5000']) { await page.fill('#goal-n', bad); await page.click('#goal-save'); ok('bad goal "' + bad + '" refused', (await txt(page, '#goal-e')).startsWith('Type a whole number of books')); }
    await page.fill('#goal-n', '24'); await page.click('#goal-save');
    ok('goal saved', (await txt(page, '#goal-msg')).startsWith('Your goal for 2026 is 24 books.'));
    ok('goal big line', (await txt(page, '#goal-body .big')) === '0 of 24 books finished in 2026');
    ok('behind', (await txt(page, '#goal-body .state')) === '19 books behind: by today you would have about 19 finished.', await txt(page, '#goal-body .state'));
    ok('pace for the rest of the year', (await page.$$eval('#goal-body .sub-line', l => l.map(e => e.textContent)))[0] === 'To reach 24 by 31 Dec: 24 more books in 73 days, about one book every 3 days.', await page.$$eval('#goal-body .sub-line', l => l.map(e => e.textContent)));
    ok('change goal link', (await txt(page, '#goal-open')) === 'Change goal');

    // ---------- 6. finishing ----------
    await logAt(page, 'The Kite Runner', 320);
    ok('finished message', (await txt(page, '#now-msg')).startsWith('You finished “The Kite Runner”! That is 1 of 24 in 2026.'), await txt(page, '#now-msg'));
    ok('moved to finished list', (await txt(page, '#done-list li')).includes('Finished Tue 20 Oct, read in 4 days'), await txt(page, '#done-list li'));
    ok('goal counts it', (await txt(page, '#goal-body .big')) === '1 of 24 books finished in 2026');
    await page.click('#now-msg .undo');
    ok('undo finish', (await saved(page)).books[0].status === 'reading' && await box(page, 'The Kite Runner').count() === 1);
    await box(page, 'The Kite Runner').getByRole('button', { name: /as finished/ }).click();
    ok('Finished button', (await saved(page)).books[0].status === 'finished' && (await saved(page)).books[0].finished === '2026-10-20');

    // ---------- 7. a book finished last year, on 31 December ----------
    await page.click('#open-form');
    await page.fill('#f-title', 'War and Peace'); await page.fill('#f-pages', '1225');
    await page.click('label[for=st-finished]');
    ok('finished hides start and finish-by', !(await vis(page, '#o-start')) && await vis(page, '#f-done'));
    await page.fill('#f-done', '2026-10-21'); await page.click('#save');
    ok('finished in the future refused', (await txt(page, '#e-done')).startsWith('That day has not come yet'));
    await page.fill('#f-done', '2025-12-31');
    ok('preview year', (await txt(page, '#preview')) === 'Counts as finished in 2025.');
    await page.click('#save');
    ok('year picker appears', await vis(page, '#year-wrap'));
    ok('shows 2025 after adding', (await txt(page, '#done-h')) === 'Finished books in 2025' && (await txt(page, '#goal-h')) === 'Books in 2025', await txt(page, '#goal-h'));
    ok('2025 has 1 book, no goal', (await txt(page, '#goal-body .big')) === '1 book finished in 2025');
    await page.selectOption('#year', '2026');
    ok('back to 2026', (await txt(page, '#goal-body .big')) === '1 of 24 books finished in 2026');

    // ---------- 8. want to read, then start ----------
    await page.click('#open-form');
    await page.fill('#f-title', 'Dune'); await page.click('label[for=fm-percent]');
    ok('percent hides pages', !(await vis(page, '#f-pages')));
    await page.click('label[for=st-want]');
    ok('save button says want', (await txt(page, '#save')) === 'Add to Want to read');
    await page.click('#save');
    ok('want list', await vis(page, '#want') && (await txt(page, '#want-list h3')) === 'Dune');
    await page.click('#want-list >> text=Start reading');
    ok('started', (await saved(page)).books.find(b => b.title === 'Dune').status === 'reading' && !(await vis(page, '#want')));
    await logAt(page, 'Dune', '42.5'); ok('percent decimal refused', (await txt(page, '#now-list .logf .err')) === 'Type a whole percent from 0 to 100, such as 45.');
    await logAt(page, 'Dune', '42');
    ok('percent line', (await txt(page, '#now-list .box-line')) === '42% read, 58% left');

    // ---------- 9. audiobook with time left ----------
    await page.click('#open-form');
    await page.fill('#f-title', 'Atomic Habits'); await page.click('label[for=fm-audio]');
    await page.fill('#f-lh', '5'); await page.fill('#f-lm', '35');
    await page.click('#o-author'); await page.fill('#f-author', 'James Clear');
    await page.click('#save');
    const ab = box(page, 'Atomic Habits');
    ok('author shown', (await ab.locator('.box-sub').textContent()) === 'by James Clear');
    await ab.locator('select.mode').selectOption('left');
    await ab.locator('input[aria-label=Hours]').fill('3'); await ab.locator('input[aria-label=Minutes]').fill('25');
    await ab.locator('.save').click();
    ok('audio from time left', (await box(page, 'Atomic Habits').locator('.box-line').textContent()) === '2 h 10 min of 5 h 35 min, 38%, 3 h 25 min left');
    await box(page, 'Atomic Habits').locator('select.mode').selectOption('left');
    await box(page, 'Atomic Habits').locator('input[aria-label=Hours]').fill('9'); await box(page, 'Atomic Habits').locator('.save').click();
    ok('time left longer than the book refused', (await box(page, 'Atomic Habits').locator('.err').textContent()).startsWith('The audiobook is only 5 h 35 min long.'));
    ok('mixed totals', (await page.$$eval('.totals dd', l => l.map(e => e.textContent)))[0] === '92 pages, 42% of ebooks, 2 h 10 min listened', await page.$$eval('.totals dd', l => l.map(e => e.textContent)));

    // ---------- 10. stop and read again ----------
    await box(page, 'Dune').getByRole('button', { name: /^Stop reading/ }).click();
    ok('stopped list', await vis(page, '#stopped-wrap') && (await txt(page, '#stopped-list li .done-sub')) === 'Stopped at 42%');
    await page.click('#stopped-list >> text=Read again');
    ok('read again', (await saved(page)).books.find(b => b.title === 'Dune').status === 'reading');

    // ---------- 11. edit ----------
    await box(page, 'Dune').getByRole('button', { name: /^Edit/ }).click();
    ok('edit title', (await txt(page, '#form-h')) === 'Edit “Dune”');
    ok('format locked after logging', await page.$eval('#fm-pages', e => e.disabled) && (await txt(page, '#h-format')).startsWith('The format cannot change'));
    await page.fill('#f-title', 'Dune ' + 'x'.repeat(200));
    await page.click('#o-by'); await page.fill('#f-by', '2026-10-31');
    await page.click('#save');
    const dune = (await saved(page)).books.find(b => b.title.startsWith('Dune'));
    ok('very long title cut to 150', dune.title.length === 150);
    ok('finish-by added in edit', dune.by === '2026-10-31');
    ok('percent plan 58% over 11 days = 6', (await box(page, 'Dune').locator('.plan-plan').textContent()) === 'To finish by Sat 31 Oct read 6% a day from tomorrow (11 days).', await box(page, 'Dune').locator('.plan-plan').textContent());
    // shrink a page book below what was logged
    await page.click('#done-list li >> text=Edit');
    await page.fill('#f-pages', '100'); await page.click('#save');
    ok('cannot shrink below a logged page', (await txt(page, '#e-total')).startsWith('You have logged page 182, so the book cannot be shorter'), await txt(page, '#e-total'));
    await page.click('#cancel');
    // delete with undo
    await box(page, 'Atomic Habits').getByRole('button', { name: /^Edit/ }).click();
    await page.click('#del');
    ok('deleted', !(await saved(page)).books.some(b => b.title === 'Atomic Habits'));
    await page.click('#form-msg .undo');
    ok('undo delete', (await saved(page)).books.some(b => b.title === 'Atomic Habits'));
    // duplicate title note
    await page.click('#open-form'); await page.fill('#f-title', 'the kite runner'); await page.fill('#f-pages', '320');
    ok('duplicate title note', (await txt(page, '#preview')).includes('You already have “The Kite Runner” (finished 20 Oct 2026)'));
    await page.click('#cancel');

    // ---------- 12. reload keeps everything ----------
    await page.reload({ waitUntil: 'networkidle' });
    ok('reload keeps books', (await saved(page)).books.length === 4 && await page.locator('#now-list > li').count() === 2);
    ok('reload keeps goal', (await txt(page, '#goal-body .big')) === '1 of 24 books finished in 2026');

    // ---------- 13. share and backup ----------
    await page.click('#copy');
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    ok('copy list', clip.startsWith('Books I read in 2026: 1 of my goal of 24\n\n1. The Kite Runner (finished 20 Oct 2026)'), clip);
    const mail = await page.getAttribute('#mail', 'href');
    ok('email without a recipient', mail.startsWith('mailto:?subject=Books%20I%20read%20in%202026&body='));
    const bk = await readDownload(page, () => page.click('#backup'));
    ok('backup file', bk.name === 'reading-log-backup-2026-10-20.json' && JSON.parse(bk.body).books.length === 4);
    await page.click('#wipe');
    ok('delete everything', (await saved(page)).books.length === 0 && (await txt(page, '#goal-body .big')) === 'No books finished in 2026 yet.');
    await page.click('#set-msg .undo');
    ok('undo delete everything', (await saved(page)).books.length === 4);
    await page.click('#wipe');
    const tmp = path.join(os.tmpdir(), 'rl-backup.json'), bad = path.join(os.tmpdir(), 'rl-bad.json');
    fs.writeFileSync(tmp, bk.body); fs.writeFileSync(bad, '{"books":[{"title":"x"}]}');
    await page.setInputFiles('#restore-file', bad);
    await page.waitForFunction(() => document.getElementById('set-msg').textContent.includes('not a backup'));
    ok('bad backup refused', (await saved(page)).books.length === 0);
    await page.setInputFiles('#restore-file', tmp);
    await page.waitForFunction(() => document.getElementById('set-msg').textContent.startsWith('Restored'));
    ok('restore backup', (await saved(page)).books.length === 4 && (await txt(page, '#goal-body .big')) === '1 of 24 books finished in 2026');
    // remove the goal
    await page.click('#goal-open'); await page.fill('#goal-n', ''); await page.click('#goal-save');
    ok('goal removed', (await txt(page, '#goal-msg')).startsWith('Removed the goal for 2026.') && (await txt(page, '#goal-body .big')) === '1 book finished in 2026');
    await page.click('#goal-msg .undo');
    ok('undo goal removal', (await saved(page)).goals['2026'] === 24);
    // keyboard: the log input is reachable and Enter saves
    await box(page, 'Dune').locator('.logf input').focus(); await page.keyboard.type('50'); await page.keyboard.press('Enter');
    ok('Enter saves a reading', (await saved(page)).books.find(b => b.title.startsWith('Dune')).log.length === 2);
    // light/dark switch
    const before = await page.evaluate(() => document.documentElement.getAttribute('data-theme') || 'system');
    await page.click('.theme-toggle');
    const after = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    ok('theme switch', after && after !== before, [before, after]);
    await ctx.close();

    // ---------- 14. corrupt and blocked storage ----------
    ({ ctx, page } = await newPage({}, '{broken'));
    ok('corrupt state starts fresh with a note', (await txt(page, '#set-msg')).startsWith('The saved books could not be read'));
    await ctx.close();
    ({ ctx, page } = await newPage({}, JSON.stringify({ books: [{ title: 'x', format: 'pages', total: -1 }] })));
    ok('invalid state starts fresh', await vis(page, '#now-empty'));
    await ctx.close();

    // ---------- 15. the shelf: layout at every width, dark and light ----------
    const WIDTHS = [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920];
    for (const scheme of ['dark', 'light']) {
        ({ ctx, page } = await newPage({ colorScheme: scheme, viewport: { width: 1280, height: 900 } }, SHELF));
        for (const w of WIDTHS) {
            await page.setViewportSize({ width: w, height: w < 600 ? 844 : 900 });
            const tag = scheme + ' ' + w + ': ';
            ok(tag + 'no horizontal scroll', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
            for (const pos of [0, 0.5, 1]) {
                await page.evaluate(p => scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * p), pos);
                const o = await page.evaluate(() => { const bad = []; document.querySelectorAll('main, .col-main, .col-side').forEach(h => { const k = [...h.children].filter(c => c.getBoundingClientRect().height > 4 && getComputedStyle(c).display !== 'none'); for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { const a = k[i].getBoundingClientRect(), b = k[j].getBoundingClientRect(); if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 4 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 4) bad.push(k[i].className + '/' + k[j].className); } }); return bad; });
                ok(tag + 'no overlap at ' + pos, !o.length, o);
            }
            if (w >= 900) ok(tag + 'two columns', await page.evaluate(() => document.querySelector('.col-side').getBoundingClientRect().left > document.querySelector('.col-main').getBoundingClientRect().right - 1));
        }
        await ctx.close();
    }
    // phones with every optional part open: nothing overlaps, placeholders fit
    for (const w of [320, 360, 390]) {
        ({ ctx, page } = await newPage({ viewport: { width: w, height: 844 } }, SHELF));
        await box(page, 'The Kite Runner').getByRole('button', { name: /^History of/ }).click();
        await box(page, 'Dune').getByRole('button', { name: /another day/i }).click();
        await logAt(page, 'The Kite Runner', 100);
        await page.click('#open-form'); await page.click('#o-author'); await page.click('#o-start'); await page.click('#o-by');
        await page.click('#goal-open');
        const states = [['pages', null], ['audio', '#fm-audio'], ['percent', '#fm-percent']];
        for (const [name, sel] of states) {
            if (sel) await page.click('label[for=' + sel.slice(1) + ']');
            const c = await page.evaluate(() => { const k = [...document.querySelectorAll('input:not([type=hidden]):not([type=radio]), select, button, textarea, .seg label')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }); const bad = [];
                for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { if (k[i].contains(k[j]) || k[j].contains(k[i]) || (k[i].htmlFor && k[i].htmlFor === k[j].id) || (k[j].htmlFor && k[j].htmlFor === k[i].id)) continue; const a = k[i].getBoundingClientRect(), b = k[j].getBoundingClientRect(); if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2) bad.push((k[i].id || k[i].className || k[i].textContent) + ' / ' + (k[j].id || k[j].className || k[j].textContent)); }
                return bad; });
            ok(w + ' ' + name + ': no controls overlap', !c.length, c);
            ok(w + ' ' + name + ': no horizontal scroll', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
            const cut = await page.evaluate(() => [...document.querySelectorAll('input[placeholder]')].filter(e => e.offsetWidth > 0).filter(e => { const c = document.createElement('canvas').getContext('2d'); const cs = getComputedStyle(e); c.font = cs.fontSize + ' ' + cs.fontFamily; return c.measureText(e.placeholder).width > e.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) + 1; }).map(e => e.id + ':' + e.placeholder));
            ok(w + ' ' + name + ': placeholders fit', !cut.length, cut);
            const seg = await page.evaluate(() => [...document.querySelectorAll('.seg label, .mini, .primary, .secondary')].filter(e => e.offsetWidth > 0 && e.scrollWidth > e.clientWidth + 1).map(e => e.textContent));
            ok(w + ' ' + name + ': no clipped button text', !seg.length, seg);
        }
        await ctx.close();
    }

    // ---------- 16. screenshots ----------
    if (SHOTS) {
        ({ ctx, page } = await newPage({ viewport: { width: 1280, height: 900 } }, SHELF));
        await page.screenshot({ path: path.join(__dirname, 'screenshots/desktop.png'), fullPage: false });
        await ctx.close();
        ({ ctx, page } = await newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }, SHELF));
        await page.screenshot({ path: path.join(__dirname, 'screenshots/phone.png'), fullPage: false });
        await ctx.close();
    }
    ({ ctx, page } = await newPage({ viewport: { width: 1280, height: 900 } }, SHELF));
    ok('shelf goal', (await txt(page, '#goal-body .big')) === '21 of 24 books finished in 2026', await txt(page, '#goal-body .big'));
    ok('shelf ahead', (await txt(page, '#goal-body .state')) === '2 books ahead of schedule.', await txt(page, '#goal-body .state'));
    await ctx.close();

    // every file the page asked for came back
    ['style.css', 'core.js', 'script.js'].forEach(f => ok('requested ' + f, [...requested].some(u => u.endsWith('/' + SLUG + '/' + f))));
    // files the browser only fetches when installing or showing the icon: ask for each one
    ({ ctx, page } = await newPage());
    for (const f of ['manifest.webmanifest', 'favicon.svg', 'sw.js', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'screenshots/desktop.png', 'screenshots/phone.png', '../help.js', '../theme.js'])
        ok('file returns 200: ' + f, await page.evaluate(u => fetch(u, { cache: 'no-store' }).then(r => r.status), f) === 200);
    const man = await page.evaluate(() => fetch('manifest.webmanifest').then(r => r.json()));
    ok('manifest icons', man.icons.length === 2 && man.theme_color === '#d9480f');
    await ctx.close();
    ok('help.js and theme.js requested', [...requested].some(u => u.endsWith('/help.js')) && [...requested].some(u => u.endsWith('/theme.js')));
    ok('no console errors', !errors.length, errors);
    ok('no failed requests', !failed.length, failed);
    await browser.close(); if (srv) srv.close();
    console.log(pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})();
