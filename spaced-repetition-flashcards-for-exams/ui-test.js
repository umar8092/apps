// Drives the real page in headless Chromium with the clock fixed at Fri 16 Oct 2026, 7 pm (Asia/Karachi).
// Run: node ui-test.js            (serves the repo locally)
//      node ui-test.js --base https://umar8092.github.io/apps   (tests the live site)
const fs = require('fs'), path = require('path'), http = require('http');
let pw; try { pw = require('playwright'); } catch (e) { pw = require('playwright-core'); }
const { STATE } = require('./fixtures.js');
const SLUG = 'spaced-repetition-flashcards-for-exams', KEY = SLUG + '.state', ROOT = path.join(__dirname, '..');
const bi = process.argv.indexOf('--base'), LIVE = bi > 0 ? process.argv[bi + 1].replace(/\/$/, '') : null;
let pass = 0; const fails = [];
const K = (y, m, d, h, mi) => new Date(Date.UTC(y, m, d, h - 5, mi)); // a time in Pakistan (UTC+5)
function ok(cond, what) { if (process.env.V) console.log('.. ' + what); if (cond) pass++; else { fails.push(what); console.log('FAIL ' + what); } }
function eq(got, want, what) { ok(JSON.stringify(got) === JSON.stringify(want), what + (JSON.stringify(got) === JSON.stringify(want) ? '' : ': got ' + JSON.stringify(got) + ', want ' + JSON.stringify(want))); }
function serve() {
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
    return new Promise(res => {
        const s = http.createServer((q, r) => {
            let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
            const f = path.join(ROOT, p);
            if (!f.startsWith(ROOT) || !fs.existsSync(f)) { r.writeHead(404); return r.end('nf'); }
            r.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f));
        }).listen(0, '127.0.0.1', () => res(s));
    });
}
let browser, URL_, errors = [];
async function open(opts = {}) {
    const ctx = await browser.newContext({ viewport: { width: opts.w || 390, height: opts.h || 900 }, timezoneId: 'Asia/Karachi', colorScheme: opts.scheme || 'dark', acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
    await ctx.route(/goatcounter\.com|gc\.zgo\.at/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
    if (opts.state !== undefined) await ctx.addInitScript(([k, s]) => { if (!sessionStorage.getItem('seeded')) { try { localStorage.setItem(k, s); } catch (e) {} sessionStorage.setItem('seeded', '1'); } }, [KEY, typeof opts.state === 'string' ? opts.state : JSON.stringify(opts.state)]);
    if (opts.block) await ctx.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
    ctx.setDefaultTimeout(4000);
    const page = await ctx.newPage();
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', e => errors.push(e.message));
    await page.clock.setFixedTime(opts.time || K(2026, 9, 16, 19, 0));
    await page.goto(URL_, { waitUntil: 'load' });
    return { page, ctx };
}
const txt = (p, s) => p.textContent(s).then(t => t.trim());
const vis = (p, s) => p.isVisible(s);
const saved = p => p.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);

(async () => {
    const srv = LIVE ? null : await serve();
    URL_ = (LIVE || 'http://127.0.0.1:' + srv.address().port) + '/' + SLUG + '/';
    browser = await pw.chromium.launch();

    // ---- first use, empty state, making a deck, adding cards
    {
        const { page, ctx } = await open();
        eq(await txt(page, '#t-big'), 'Make your first deck', 'empty: top box asks for a deck');
        eq(await txt(page, '#nd-label'), 'Name your first deck', 'empty: first deck label');
        ok(await vis(page, '#example'), 'empty: example button shown');
        ok(!(await vis(page, '#deck')), 'empty: no open deck panel');
        ok(!(await vis(page, '#study-all')), 'empty: no study button');
        await page.click('#nd-go');
        eq(await txt(page, '#nd-err'), 'Type a name for the deck, for example Biology chapter 3.', 'blank deck name refused');
        await page.fill('#nd-name', '   ');
        await page.click('#nd-go');
        ok((await txt(page, '#nd-err')).startsWith('Type a name'), 'spaces-only deck name refused');
        await page.fill('#nd-name', 'Biology chapter 3');
        await page.press('#nd-name', 'Enter');
        ok(await vis(page, '#deck'), 'deck panel opens after making a deck');
        eq(await txt(page, '#dk-name'), 'Biology chapter 3', 'deck panel title');
        await page.waitForTimeout(100);
        eq(await page.evaluate(() => document.activeElement.id), 'add-f', 'focus goes to Front');
        eq(await txt(page, '#t-big'), 'Add cards to start', 'deck with no cards: add cards');
        ok(!(await vis(page, '#d-exam-wrap')) && await vis(page, '#d-exam-add'), 'exam date is optional: hidden behind + Add exam date');
        ok(!(await vis(page, '#d-new-custom')), 'custom new-cards field hidden until Custom');
        eq(await page.inputValue('#d-new'), '20', 'new cards a day defaults to 20');
        await page.fill('#nd-name', 'biology CHAPTER 3'); await page.click('#nd-go');
        ok((await txt(page, '#nd-err')).includes('already have a deck'), 'duplicate deck name refused (any case)');
        await page.fill('#nd-name', '');
        // add one card
        await page.click('#add-go');
        eq(await txt(page, '#add-err'), 'Type the front (question).', 'blank card refused');
        await page.fill('#add-f', 'Mitochondria');
        await page.click('#add-go');
        eq(await txt(page, '#add-err'), 'Type the back (answer).', 'front only refused');
        await page.fill('#add-f', 'Mitochondria');
        await page.press('#add-f', 'Enter');
        eq(await page.evaluate(() => document.activeElement.id), 'add-b', 'Enter in Front moves to Back');
        await page.fill('#add-b', 'Makes energy (ATP) for the cell');
        await page.press('#add-b', 'Enter');
        eq(await page.inputValue('#add-f'), '', 'fields cleared after adding');
        eq(await txt(page, '#cards-n'), '(1)', 'one card in deck');
        eq(await txt(page, '#t-big'), '1 card to study today', 'one new card due');
        await page.fill('#add-f', 'mitochondria'); await page.fill('#add-b', 'makes energy (atp) for the cell'); await page.click('#add-go');
        eq(await txt(page, '#add-err'), 'This deck already has that card.', 'duplicate card refused (any case)');
        await page.fill('#add-f', 'Mitochondria'); await page.fill('#add-b', 'Powerhouse of the cell'); await page.click('#add-go');
        ok((await txt(page, '#toast-text')).includes('same front'), 'same front, different answer: added with a note');
        // paste many
        await page.click('#paste-box summary');
        ok(await page.isDisabled('#paste-go'), 'paste: Add disabled when empty');
        await page.fill('#paste', 'Nucleus - Holds the DNA\nRibosome\tMakes proteins\nosmosis = water moving through a membrane\n\nchloroplast\nNucleus - Holds the DNA\n - no front\n"Cell wall, plants","Rigid layer, outside the membrane"');
        const pv = await txt(page, '#preview');
        ok(pv.includes('Found 4 cards.'), 'paste preview counts cards: ' + pv);
        ok(pv.includes('no separator found: line 5 "chloroplast"'), 'paste preview names the line with no separator');
        ok(pv.includes('already in this deck: line 6'), 'paste preview names duplicates');
        ok(pv.includes('front or back missing: line 7'), 'paste preview names missing front');
        ok(pv.includes('and 1 more'), 'paste preview shows the first 3 and how many more');
        eq(await txt(page, '#paste-go'), 'Add 4 cards', 'paste button says how many');
        await page.selectOption('#sep', 'comma');
        ok((await txt(page, '#preview')).includes('Found 1 card.'), 'choosing comma changes what is found');
        await page.selectOption('#sep', 'auto');
        await page.click('#paste-go');
        eq(await txt(page, '#cards-n'), '(6)', 'pasted cards added');
        eq(await page.inputValue('#paste'), '', 'paste box cleared');
        await page.click('#toast-undo');
        eq(await txt(page, '#cards-n'), '(2)', 'undo removes pasted cards');
        await page.fill('#paste', 'Nucleus - Holds the DNA\nRibosome\tMakes proteins');
        await page.click('#paste-go');
        eq(await txt(page, '#cards-n'), '(4)', 'paste again');
        // search
        await page.fill('#search', 'ribo');
        eq(await page.$$eval('#clist .cbox', b => b.length), 1, 'search finds one card');
        await page.fill('#search', 'zzz');
        ok((await txt(page, '#clist')).includes('No card matches "zzz"'), 'search no match message');
        await page.fill('#search', '');
        // edit and delete a card in the list
        await page.click('#clist .cbox:first-child .mini:not(.del)');
        await page.fill('#ce-f', ''); await page.click('#clist form .primary');
        eq(await txt(page, '#clist form .err'), 'Type the front (question).', 'edit: blank front refused');
        await page.fill('#ce-f', 'Mitochondrion'); await page.press('#ce-b', 'Enter');
        eq(await txt(page, '#clist .cbox:first-child .cf'), 'Mitochondrion', 'edit saved');
        await page.click('#clist .cbox:first-child .mini:not(.del)'); await page.press('#ce-f', 'Escape');
        eq(await page.$$eval('#clist form', f => f.length), 0, 'Escape cancels edit');
        await page.click('#clist .cbox:first-child .del');
        eq(await txt(page, '#cards-n'), '(3)', 'card deleted');
        await page.click('#toast-undo');
        eq(await txt(page, '#cards-n'), '(4)', 'undo brings card back');
        // exam date
        await page.click('#d-exam-add');
        ok(await vis(page, '#d-exam-wrap'), 'exam field shown after tapping + Add exam date');
        await page.fill('#d-exam', '2026-10-10'); await page.dispatchEvent('#d-exam', 'change');
        eq(await txt(page, '#d-exam-err'), 'Pick a day after today.', 'past exam refused');
        await page.fill('#d-exam', '2026-10-16'); await page.dispatchEvent('#d-exam', 'change');
        eq(await txt(page, '#d-exam-err'), 'Pick a day after today.', 'exam today refused');
        await page.fill('#d-exam', '2040-01-01'); await page.dispatchEvent('#d-exam', 'change');
        ok((await txt(page, '#d-exam-err')).includes('10 years'), 'exam far ahead refused');
        await page.fill('#d-exam', '2026-11-06'); await page.dispatchEvent('#d-exam', 'change');
        ok((await txt(page, '#dlist')).includes('Exam Fri 6 Nov 2026: in 21 days'), 'exam countdown in deck box');
        eq(await txt(page, '#d-plan'), '4 new cards: all started today, before the exam.', 'plan with exam');
        await page.click('#d-exam-del');
        ok(!(await vis(page, '#d-exam-wrap')) && !(await txt(page, '#dlist')).includes('Exam'), 'exam removed');
        // new cards a day
        await page.selectOption('#d-new', 'custom');
        ok(await vis(page, '#d-new-custom'), 'custom field shown');
        await page.fill('#d-new-custom', '-4'); await page.dispatchEvent('#d-new-custom', 'change');
        ok((await txt(page, '#d-msg')).includes('from 0 to 999'), 'negative new per day refused');
        await page.fill('#d-new-custom', '1500'); await page.dispatchEvent('#d-new-custom', 'change');
        ok((await txt(page, '#d-msg')).includes('999 is used'), 'huge new per day capped');
        eq((await saved(page)).decks[0].newPerDay, 999, 'saved 999');
        await page.fill('#d-new-custom', '2'); await page.dispatchEvent('#d-new-custom', 'change');
        eq(await txt(page, '#t-big'), '2 cards to study today', 'custom 2 a day');
        eq(await txt(page, '#d-plan'), '4 new cards at 2 a day: all started by Sat 17 Oct 2026.', 'plan at 2 a day: 2 today, 2 left / 2 = 1 day');
        await page.selectOption('#d-new', '0');
        eq(await txt(page, '#t-big'), 'All done for today', 'none a day: nothing to study');
        ok((await txt(page, '#d-plan')).startsWith('New cards are off'), 'none a day explained');
        await page.selectOption('#d-new', '20');
        // reverse
        await page.check('#d-rev');
        ok((await txt(page, '#dlist')).includes('(both ways)'), 'reverse shown in deck box');
        eq(await txt(page, '#t-big'), '4 cards to study today', 'reverse: still one side per card per session');
        await page.uncheck('#d-rev');
        // rename
        await page.fill('#d-name', ''); await page.dispatchEvent('#d-name', 'change');
        ok((await txt(page, '#d-msg')).includes('old one was kept'), 'blank rename refused');
        await page.fill('#d-name', 'Cell biology'); await page.dispatchEvent('#d-name', 'change');
        eq(await txt(page, '#dk-name'), 'Cell biology', 'renamed');
        // mail link
        const href = await page.getAttribute('#d-mail', 'href');
        ok(href.startsWith('mailto:?subject=Flashcards%3A%20Cell%20biology&body='), 'email link has no recipient and a subject');
        ok(decodeURIComponent(href).includes('Nucleus - Holds the DNA'), 'email body has the cards');
        // copy
        await page.click('#d-copy');
        await page.waitForTimeout(100);
        ok((await txt(page, '#d-msg')).startsWith('Copied 4 cards'), 'copy message: ' + await txt(page, '#d-msg'));
        const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
        ok(clip.includes('Ribosome\tMakes proteins'), 'clipboard has tab-separated cards');
        // CSV
        const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#d-csv')]);
        eq(dl.suggestedFilename(), 'Cell-biology.csv', 'CSV file name');
        const csv = fs.readFileSync(await dl.path(), 'utf8');
        ok(csv.includes('"Ribosome","Makes proteins"'), 'CSV content');
        // reload keeps everything
        await page.reload();
        eq(await txt(page, '#t-big'), '4 cards to study today', 'reload keeps cards');
        eq(await page.$$eval('#dlist .dbox', b => b.length), 1, 'reload keeps deck');
        // long text
        await page.click('#dlist .dbox .secondary');
        const long = 'Describe the stages of mitosis in order and what happens in each one. '.repeat(5).trim();
        await page.fill('#add-f', long); await page.fill('#add-b', 'Prophase, metaphase, anaphase, telophase'); await page.click('#add-go');
        eq(await txt(page, '#cards-n'), '(5)', 'long card added');
        await page.fill('#add-f', 'x'.repeat(1200));
        eq((await page.inputValue('#add-f')).length, 1000, 'front limited to 1000 characters');
        await page.fill('#add-f', '');
        // reset and delete deck with undo
        await page.click('#d-reset');
        ok((await txt(page, '#toast-text')).includes('new again'), 'reset deck');
        await page.click('#toast-undo');
        await page.click('#d-del');
        eq(await page.$$eval('#dlist .dbox', b => b.length), 0, 'deck deleted');
        ok(!(await vis(page, '#deck')), 'deck panel closed after delete');
        await page.click('#toast-undo');
        eq(await page.$$eval('#dlist .dbox', b => b.length), 1, 'undo brings deck back');
        await ctx.close();
    }

    // ---- the worked example: Sara on Fri 16 Oct 2026
    {
        const { page, ctx } = await open({ state: STATE, w: 1280 });
        eq(await txt(page, '#t-date'), 'Today, Fri 16 Oct 2026', 'date line');
        eq(await txt(page, '#t-big'), '27 cards to study today', 'example: 27 cards today');
        eq(await txt(page, '#t-sub'), '12 to review, 15 new. About 5 min.', 'example: review and new split');
        eq(await txt(page, '#streak'), 'Studied 4 days in a row. Study today to keep it going.', 'streak not yet today');
        const boxes = await page.$$eval('#dlist .dbox', b => b.map(x => x.innerText.replace(/\s+/g, ' ')));
        ok(boxes[0].includes('13 cards to study today') && boxes[0].includes('60 cards: 40 new, 16 learning, 4 known') && boxes[0].includes('Exam Fri 23 Oct 2026: in 7 days'), 'pharmacology box: ' + boxes[0]);
        ok(boxes[1].includes('14 cards to study today') && boxes[1].includes('40 cards: 10 new, 12 learning, 18 known'), 'german box: ' + boxes[1]);
        await page.click('#dlist .dbox:first-child .secondary');
        eq(await txt(page, '#d-plan'), 'At 5 a day, 40 new cards will not all be started before the exam. You need 6 a day.', 'exam plan warns');
        eq(await txt(page, '#d-plan-fix'), 'Use 6 new cards a day', 'fix button');
        await page.click('#d-plan-fix');
        eq(await txt(page, '#d-plan'), '40 new cards at 6 a day: all started by Thu 22 Oct 2026, before the exam.', 'plan fits at 6 a day');
        ok(!(await vis(page, '#d-plan-fix')), 'fix button gone');
        eq(await txt(page, '#t-big'), '28 cards to study today', '6 new a day: one more today');
        await page.selectOption('#d-new', '5');
        // study all
        await page.click('#study-all');
        ok(await vis(page, '#study'), 'study panel shown');
        ok(!(await vis(page, '#study-all')), 'no second Study all button while studying');
        eq(await txt(page, '#q'), 'Omeprazole', 'most overdue card first');
        eq(await txt(page, '#st-left'), '27 cards left', 'cards left');
        ok(!(await vis(page, '#a-wrap')) && !(await vis(page, '#grades')), 'answer hidden until Show answer');
        await page.keyboard.press('Space');
        ok(await vis(page, '#a-wrap') && await vis(page, '#grades'), 'Space shows the answer');
        eq(await txt(page, '#a'), 'Proton pump inhibitor: reduces stomach acid', 'answer text');
        eq(await page.$$eval('.g small', s => s.map(x => x.textContent)), ['again soon', '4 days', '6 days', '6 days'], 'Omeprazole labels (ease 2.3, gap 3, exam cap 6)');
        eq(await txt(page, '#cap-note'), 'Your exam is Fri 23 Oct, so this card comes back by Thu 22 Oct at the latest.', 'exam cap explained');
        await page.keyboard.press('1');
        eq(await txt(page, '#st-left'), '27 cards left', 'Again keeps the card in the session');
        eq(await txt(page, '#q'), 'Atorvastatin', 'next card');
        await page.click('#show');
        eq(await page.$$eval('.g small', s => s.map(x => x.textContent)), ['again soon', '6 days', '6 days', '6 days'], 'Atorvastatin labels capped by exam');
        await page.click('.g3');
        eq(await txt(page, '#st-left'), '26 cards left', 'Good removes it');
        eq(await txt(page, '#t-big'), '26 cards to study today', 'top box counts down');
        eq(await txt(page, '#streak'), 'Studied 5 days in a row: 2 answers today.', 'streak now includes today');
        let s = await saved(page);
        const ator = s.decks[0].cards.find(c => c.f === 'Atorvastatin').s;
        eq([ator.ivl, ator.due], [6, 20748], 'Atorvastatin saved: 6 days, due Thu 22 Oct');
        // undo
        await page.click('#st-undo');
        eq(await txt(page, '#q'), 'Atorvastatin', 'undo shows the card again');
        eq(await txt(page, '#st-left'), '27 cards left', 'undo restores count');
        s = await saved(page);
        eq(s.decks[0].cards.find(c => c.f === 'Atorvastatin').s.due, 20741, 'undo restores saved schedule');
        // edit during study
        await page.click('#st-editbtn');
        ok(await vis(page, '#st-edit') && !(await vis(page, '#face')), 'edit form replaces the card');
        await page.keyboard.press('Space');
        ok(await vis(page, '#st-edit'), 'Space while editing types, does not show the answer');
        await page.fill('#st-eb', 'Statin: lowers LDL cholesterol');
        await page.click('#st-edit .primary');
        ok(await vis(page, '#face') && (await txt(page, '#q')) === 'Atorvastatin', 'back to the card after saving');
        await page.click('#show');
        eq(await txt(page, '#a'), 'Statin: lowers LDL cholesterol', 'edited answer shown');
        await page.click('#st-editbtn'); await page.press('#st-ef', 'Escape');
        ok(!(await vis(page, '#st-edit')), 'Escape closes study edit');
        // finish the session: Good to everything
        let guard = 0;
        while (await vis(page, '#st-run') && guard++ < 80) {
            if (!(await vis(page, '#grades'))) await page.click('#show');
            await page.click('.g3');
        }
        ok(await vis(page, '#st-done'), 'done screen at the end');
        eq(await txt(page, '#done-h'), 'Done for today', 'done heading');
        const doneSub = await txt(page, '#done-sub');
        console.log('done text: ' + doneSub);
        ok(/^You answered 2[78] cards\. Next: \d+ cards tomorrow, plus new cards\.$/.test(doneSub), 'done text: ' + doneSub);
        eq(await txt(page, '#t-big'), 'All done for today', 'top box all done');
        ok(await vis(page, '#more-new'), 'learn more offered');
        await page.click('#more-new');
        eq(await txt(page, '#st-left'), '10 cards left', 'learn 10 more new cards');
        await page.click('#st-stop');
        ok(!(await vis(page, '#study')) && (await txt(page, '#toast-text')).startsWith('Stopped'), 'stop for now');
        eq(await txt(page, '#t-big'), '10 cards to study today', 'the extra 10 still offered today');
        await page.reload();
        eq(await txt(page, '#t-big'), '10 cards to study today', 'reload keeps progress');
        await ctx.close();
    }

    // ---- next day, after midnight, and missed days
    {
        const { page, ctx } = await open({ state: STATE, time: K(2026, 9, 17, 1, 30) });
        eq(await txt(page, '#t-date'), 'Today, Fri 16 Oct 2026', '1:30 am still counts as the evening before');
        await ctx.close();
        const b = await open({ state: STATE, time: K(2026, 9, 17, 9, 0) });
        eq(await txt(b.page, '#t-date'), 'Today, Sat 17 Oct 2026', 'next morning is a new day');
        ok(!(await vis(b.page, '#streak')), 'next day: 16 Oct was not studied, so no streak');
        await b.ctx.close();
        const c = await open({ state: STATE, time: K(2026, 9, 25, 9, 0) });
        ok((await txt(c.page, '#dlist')).includes('Exam was on Fri 23 Oct 2026'), 'after the exam');
        ok(/^\d+ cards to study today$/.test(await txt(c.page, '#t-big')), 'missed days: cards waiting');
        ok(!(await vis(c.page, '#streak')), 'missed days: streak over');
        await c.ctx.close();
    }

    // ---- saved data problems
    {
        const { page, ctx } = await open({ state: '{not json' });
        await page.waitForTimeout(100);
        eq(await txt(page, '#t-big'), 'Make your first deck', 'corrupt saved data: starts fresh');
        ok((await txt(page, '#toast-text')).includes('could not be read'), 'corrupt saved data: says so');
        ok(await page.evaluate(k => localStorage.getItem(k + '.broken') === '{not json', KEY), 'corrupt saved data: copy kept');
        await ctx.close();
        const b = await open({ state: { decks: [{ name: 'X', newPerDay: 'lots', cards: [{ f: 'a', b: 'b', s: { reps: 'x', due: -5 } }, { f: '', b: 'c' }] }] } });
        eq(await txt(b.page, '#t-big'), '1 card to study today', 'bad values in saved data cleaned');
        await b.ctx.close();
        const c = await open({ block: true });
        ok(await vis(c.page, '#save-warn'), 'blocked storage: warning');
        await c.page.fill('#nd-name', 'Temp'); await c.page.click('#nd-go');
        ok(await vis(c.page, '#deck'), 'blocked storage: still works');
        await c.ctx.close();
    }

    // ---- backup and delete everything
    {
        const { page, ctx } = await open({ state: STATE });
        const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#export')]);
        eq(dl.suggestedFilename(), 'flashcards-backup-2026-10-16.json', 'backup file name');
        const file = await dl.path();
        await page.click('#wipe');
        eq(await txt(page, '#t-big'), 'Make your first deck', 'delete everything');
        await page.click('#toast-undo');
        eq(await txt(page, '#t-big'), '27 cards to study today', 'undo delete everything');
        await page.click('#wipe');
        await page.setInputFiles('#import-file', file);
        await page.waitForTimeout(200);
        eq(await txt(page, '#t-big'), '27 cards to study today', 'backup loaded');
        const bad = path.join(require('os').tmpdir(), 'not-a-backup.json'); fs.writeFileSync(bad, '{"hello":1}');
        await page.setInputFiles('#import-file', bad);
        await page.waitForTimeout(200);
        ok((await txt(page, '#tools-msg')).includes('not a backup'), 'bad backup refused');
        eq(await txt(page, '#t-big'), '27 cards to study today', 'bad backup changes nothing');
        // text file into the paste box
        await page.click('#dlist .dbox:last-child .secondary');
        const tf = path.join(require('os').tmpdir(), 'words.csv'); fs.writeFileSync(tf, '﻿Front,Back\r\n"die Milch","the milk"\r\n"der Käse","the cheese"\r\n');
        await page.click('#paste-box summary');
        await page.setInputFiles('#paste-file', tf);
        await page.waitForTimeout(200);
        ok((await txt(page, '#preview')).includes('Found 2 cards.'), 'CSV file read into paste box (header skipped)');
        await ctx.close();
    }

    // ---- help dialog and top bar
    for (const w of [320, 390, 820, 1280]) {
        const { page, ctx } = await open({ state: STATE, w });
        const bar = await page.$$eval('.topbar > *', els => els.map(e => e.getBoundingClientRect()).map(r => [r.top, r.bottom, r.left, r.right]));
        let overlap = false;
        for (let i = 0; i < bar.length; i++) for (let j = i + 1; j < bar.length; j++) if (bar[i][2] < bar[j][3] - 1 && bar[j][2] < bar[i][3] - 1 && bar[i][0] < bar[j][1] - 1 && bar[j][0] < bar[i][1] - 1) overlap = true;
        ok(!overlap, 'top bar buttons do not overlap at ' + w);
        ok(new Set(bar.map(r => Math.round(r[0]))).size === 1 || w <= 320, 'top bar on one line at ' + w);
        await page.click('.help-btn');
        const r = await page.$eval('dialog.help', d => { const b = d.getBoundingClientRect(); return { open: d.open, l: b.left, r: b.right, t: b.top, b: b.bottom, title: d.querySelector('#help-title').textContent }; });
        ok(r.open && r.l >= 0 && r.r <= w && r.t >= 0 && r.b <= 900, 'help inside the screen at ' + w);
        eq(r.title, 'How to use Spaced Repetition Flashcards for Exams', 'help title at ' + w);
        await page.keyboard.press('Escape');
        ok(!(await page.$eval('dialog.help', d => d.open)), 'Escape closes help at ' + w);
        await page.click('.help-btn'); await page.click('.help-close');
        ok(!(await page.$eval('dialog.help', d => d.open)), 'Got it closes help at ' + w);
        await ctx.close();
    }

    // ---- theme switch
    {
        const { page, ctx } = await open({ scheme: 'dark' });
        const bg1 = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
        await page.click('.theme-toggle');
        const bg2 = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
        ok(bg1 !== bg2, 'light/dark switch changes the look');
        await ctx.close();
    }

    // ---- screen sizes: no sideways scroll, nothing sticking out, no overlaps
    const WIDTHS = [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920];
    async function noScroll(page, label) {
        const r = await page.evaluate(() => {
            const w = document.documentElement.clientWidth, bad = [];
            document.querySelectorAll('main *').forEach(e => { const b = e.getBoundingClientRect(); if (b.width && (b.right > w + 1 || b.left < -1) && getComputedStyle(e).position !== 'fixed') bad.push(e.tagName + '#' + e.id + '.' + e.className); });
            return { sw: document.documentElement.scrollWidth, w, bad: bad.slice(0, 3) };
        });
        ok(r.sw <= r.w && !r.bad.length, 'no sideways scroll ' + label + ' ' + JSON.stringify(r.bad));
    }
    async function controlsApart(page, label) {
        const r = await page.evaluate(() => {
            const els = [...document.querySelectorAll('main input:not([type=checkbox]):not([type=file]), main select, main button, main textarea, main a.secondary')].filter(e => e.offsetParent && e.getBoundingClientRect().width);
            const boxes = els.map(e => [e, e.getBoundingClientRect()]), hits = [];
            for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
                const a = boxes[i][1], b = boxes[j][1];
                if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1 && !boxes[i][0].contains(boxes[j][0]) && !boxes[j][0].contains(boxes[i][0])) hits.push(boxes[i][0].id + '|' + boxes[j][0].id);
            }
            return hits.slice(0, 3);
        });
        ok(!r.length, 'controls do not overlap ' + label + ' ' + JSON.stringify(r));
    }
    async function placeholdersFit(page, label) {
        const r = await page.evaluate(() => {
            const c = document.createElement('canvas').getContext('2d'), bad = [];
            document.querySelectorAll('main input[placeholder]').forEach(e => { if (!e.offsetParent) return; const cs = getComputedStyle(e); c.font = cs.fontSize + ' ' + cs.fontFamily; const room = e.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - (e.type === 'search' ? 20 : 0); if (c.measureText(e.placeholder).width > room) bad.push(e.id); });
            return bad;
        });
        ok(!r.length, 'placeholders fit ' + label + ' ' + JSON.stringify(r));
    }
    for (const scheme of ['dark', 'light']) for (const w of WIDTHS) {
        const { page, ctx } = await open({ state: STATE, w, scheme });
        const label = w + ' ' + scheme;
        await page.click('#dlist .dbox:first-child .secondary');
        await page.click('#paste-box summary');
        await page.fill('#paste', 'a - b\nnope');
        await page.click('#d-exam-add').catch(() => {});
        await page.selectOption('#d-new', 'custom');
        await page.click('#clist .cbox:first-child .mini:not(.del)');
        await page.click('#study-all'); await page.click('#show');
        await noScroll(page, 'filled ' + label);
        if (w <= 390) { await controlsApart(page, 'filled ' + label); await placeholdersFit(page, label); }
        if (w >= 900) {
            for (const pos of ['top', 'middle', 'bottom']) {
                await page.evaluate(p => window.scrollTo(0, p === 'top' ? 0 : p === 'middle' ? document.body.scrollHeight / 2 : document.body.scrollHeight), pos);
                await page.waitForTimeout(30);
                const hit = await page.evaluate(() => {
                    const out = [];
                    [document.querySelector('main'), ...document.querySelectorAll('.col-main, .col-side')].forEach(par => {
                        const kids = [...par.children].filter(e => e.offsetParent && getComputedStyle(e).display !== 'contents').map(e => [e, e.getBoundingClientRect()]);
                        for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) { const a = kids[i][1], b = kids[j][1]; if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) out.push(kids[i][0].className + '|' + kids[j][0].className); }
                    });
                    return out;
                });
                ok(!hit.length, 'no overlapping blocks ' + label + ' ' + pos + ' ' + JSON.stringify(hit));
            }
        }
        // the done screen and the cleared state
        await page.click('#st-stop');
        await page.click('#wipe');
        await noScroll(page, 'cleared ' + label);
        if (w <= 390) await controlsApart(page, 'cleared ' + label);
        await ctx.close();
    }

    // ---- files the page needs
    {
        const { page, ctx } = await open();
        const files = ['favicon.svg', 'manifest.webmanifest', 'sw.js', 'core.js', 'script.js', 'style.css', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'screenshots/desktop.png', 'screenshots/phone.png', '../help.js', '../theme.js'];
        for (const f of files) { const r = await page.request.get(URL_ + f); eq(r.status(), 200, 'file ' + f); }
        await ctx.close();
    }

    eq(errors, [], 'no console errors');
    await browser.close(); if (srv) srv.close();
    console.log('\n' + pass + ' passed, ' + fails.length + ' failed' + (LIVE ? ' (LIVE ' + LIVE + ')' : ' (local)'));
    process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
