// Drives the real page in headless Chromium: node ui-test.js [--shots] [--base https://umar8092.github.io/apps]
// Without --base it serves this repo on localhost. With --base it tests the LIVE page.
// The PDFs it makes are checked with pdfinfo and pdftoppm (poppler-utils) when they are installed.
const pw = (() => { for (const m of ['playwright', 'playwright-core', '/opt/node-tools/node_modules/playwright']) { try { return require(m); } catch (e) { /* next */ } } throw new Error('playwright not found'); })();
const path = require('path'), fs = require('fs'), http = require('http'), os = require('os'), cp = require('child_process');
const bi = process.argv.indexOf('--base');
const shots = process.argv.includes('--shots');
let fail = 0, url;
const ok = (name, cond) => { if (!cond) fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name); };
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'scan-test-'));
const hasPoppler = (() => { try { cp.execSync('pdfinfo -v', { stdio: 'ignore' }); return true; } catch (e) { return false; } })();
const pdfInfo = f => { const o = cp.execSync('pdfinfo -f 1 -l 99 "' + f + '"').toString(); return { pages: +(o.match(/Pages:\s+(\d+)/) || [])[1], sizes: [...o.matchAll(/Page\s+\d+ size:\s+([\d.]+) x ([\d.]+)/g)].map(m => [+m[1], +m[2]]), title: (o.match(/Title:\s+(.*)/) || [])[1] }; };
// average brightness (0-255) of a PDF page and of its darkest 1%, from a small grey render
function pageTone(f, n) {
    cp.execSync('pdftoppm -gray -r 60 -f ' + n + ' -l ' + n + ' "' + f + '" "' + f + '.p"');
    const out = fs.readdirSync(path.dirname(f)).find(x => x.startsWith(path.basename(f) + '.p') && x.endsWith('.pgm'));
    const b = fs.readFileSync(path.join(path.dirname(f), out)); fs.unlinkSync(path.join(path.dirname(f), out));
    let i = 0, fields = 0; while (fields < 4) { while (b[i] === 0x20 || b[i] === 0x0a) i++; while (b[i] !== 0x20 && b[i] !== 0x0a) i++; fields++; } i++;
    const px = [...b.subarray(i)].sort((a, c) => a - c);
    return { mean: px.reduce((s, v) => s + v, 0) / px.length, dark: px[Math.floor(px.length * 0.01)] };
}

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

async function load(b, vp, opt = {}) {
    const ctx = opt.ctx || await b.newContext({ viewport: vp, deviceScaleFactor: vp.width < 500 ? 2 : 1, colorScheme: opt.theme || 'dark', acceptDownloads: true, locale: opt.locale || 'en-GB' });
    if (opt.init) await ctx.addInitScript(opt.init);
    const p = await ctx.newPage();
    p.errors = []; p.on('console', m => m.type() === 'error' && p.errors.push(m.text())); p.on('pageerror', e => p.errors.push(String(e)));
    p.bad = []; p.on('response', r => { if (r.status() >= 400) p.bad.push(r.status() + ' ' + r.url()); });
    await p.goto(url, { waitUntil: 'networkidle' });
    await p.waitForTimeout(300);
    return p;
}
const txt = (p, sel) => p.textContent(sel);
const nPages = p => p.locator('#pages .page:not(.gone)').count();
const subs = p => p.$$eval('#pages .page .p-sub', e => e.map(x => x.textContent));
async function demo(p) { await p.click('#demo'); await p.waitForFunction(() => document.querySelectorAll('#pages .page').length >= 3, null, { timeout: 30000 }); await p.waitForTimeout(200); }
// makes a photo in the page: a light page (corners q) on a dark table, as PNG bytes
async function photo(p, w, h, q, opt = {}) {
    const b64 = await p.evaluate(([w, h, q, opt]) => {
        const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
        x.fillStyle = opt.table || '#3b2a1c'; x.fillRect(0, 0, w, h);
        if (q) { x.fillStyle = '#efece4'; x.beginPath(); q.forEach((p, i) => i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1])); x.closePath(); x.fill();
            x.fillStyle = '#222'; x.font = Math.round(w / 30) + 'px serif'; for (let i = 0; i < 8; i++) x.fillText(opt.text || 'Line of text on the page ' + (i + 1), q[0][0] + w * 0.08, q[0][1] + h * 0.1 + i * h * 0.06); }
        return c.toDataURL('image/png').split(',')[1];
    }, [w, h, q, opt]);
    return Buffer.from(b64, 'base64');
}
const file = (name, buffer, mimeType) => ({ name, mimeType: mimeType || 'image/png', buffer });
async function choose(p, files) { await p.setInputFiles('#files', files); }
async function waitIdle(p) { await p.waitForFunction(() => !/Adding/.test(document.getElementById('add-msg').textContent), null, { timeout: 60000 }); await p.waitForTimeout(250); }
async function make(p) {
    await p.click('#make');
    await p.waitForFunction(() => !document.getElementById('result').hidden || document.querySelector('#custom-err').textContent || document.querySelector('#make-msg.bad'), null, { timeout: 120000 });
}
async function download(p, name) {
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#download')]);
    const f = path.join(TMP, name || dl.suggestedFilename()); await dl.saveAs(f);
    return { f, name: dl.suggestedFilename(), bytes: fs.statSync(f).size };
}
const corners = p => p.evaluate(() => [...document.querySelectorAll('.handle')].map(h => [parseFloat(h.style.left), parseFloat(h.style.top)]));
async function layout(p) {
    return p.evaluate(() => {
        const W = document.documentElement.clientWidth, bad = [], inter = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
        if (document.documentElement.scrollWidth > W) bad.push('page scrolls sideways');
        document.querySelectorAll('main *').forEach(e => { const r = e.getBoundingClientRect(); if (r.width && getComputedStyle(e).position !== 'absolute' && (r.right > W + 1 || r.left < -1)) bad.push('sticks out: ' + e.tagName + '.' + e.className); });
        const ctl = [...document.querySelectorAll('main input:not([type=radio]), main select, main button:not(.handle), main a.primary')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.height && getComputedStyle(e).display !== 'none'; });
        for (let i = 0; i < ctl.length; i++) for (let j = i + 1; j < ctl.length; j++) if (!ctl[i].contains(ctl[j]) && !ctl[j].contains(ctl[i]) && inter(ctl[i].getBoundingClientRect(), ctl[j].getBoundingClientRect())) bad.push('overlap: ' + (ctl[i].id || ctl[i].textContent.trim().slice(0, 15)) + ' / ' + (ctl[j].id || ctl[j].textContent.trim().slice(0, 15)));
        document.querySelectorAll('main input[placeholder]').forEach(i => { if (i.offsetWidth && i.scrollWidth > i.clientWidth + 1) bad.push('placeholder cut off: ' + i.id); });
        document.querySelectorAll('main button, main .p-sub, main .p-title, main label, main legend').forEach(e => { if (e.offsetWidth && e.scrollWidth > e.clientWidth + 2) bad.push('text cut off: ' + e.textContent.trim().slice(0, 20)); });
        for (const host of document.querySelectorAll('main, .col-main, .col-side, .pages')) {
            const k = [...host.children].filter(c => c.offsetWidth && c.offsetHeight && !['absolute', 'fixed'].includes(getComputedStyle(c).position));
            for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) if (inter(k[i].getBoundingClientRect(), k[j].getBoundingClientRect())) bad.push('blocks overlap: ' + k[i].className + ' / ' + k[j].className);
        }
        return bad.slice(0, 6);
    });
}

(async () => {
    let srv;
    if (bi > -1) url = process.argv[bi + 1].replace(/\/$/, '') + '/document-scanner-to-pdf/';
    else { srv = await serve(); url = 'http://localhost:' + srv.address().port + '/document-scanner-to-pdf/'; }
    console.log('Testing ' + url + (hasPoppler ? '' : ' (pdfinfo not installed: PDF contents not checked)'));
    const b = await pw.chromium.launch();

    // ---- 1. first visit: empty state
    let p = await load(b, { width: 390, height: 844 });
    ok('first visit: no pages list, Make the PDF is off and says why', await p.isHidden('#pages-card') && await p.isDisabled('#make') && (await txt(p, '#ready')) === 'Add at least one page first.');
    ok('first visit: Take a photo, Choose photos and the example button are there', await p.isVisible('#cam-btn') && await p.isVisible('#files-btn') && await p.isVisible('#demo'));
    ok('first visit: the custom size box is hidden (optional)', await p.isHidden('#custom-box'));
    ok('A4 is the paper for en-GB', (await p.inputValue('#paper')) === 'a4');
    ok('file name suggests scan and today\'s date', /^scan-\d{4}-\d\d-\d\d$/.test(await p.getAttribute('#name', 'placeholder')));
    ok('the camera button opens a camera picker (capture=environment)', (await p.getAttribute('#camera', 'capture')) === 'environment' && (await p.getAttribute('#files', 'multiple')) !== null);

    // ---- 2. one photo of a tilted page: found, straightened, editor opens
    const Q = [[120, 90], [700, 130], [680, 1000], [90, 960]];
    await choose(p, [file('page1.png', await photo(p, 800, 1080, Q))]); await waitIdle(p);
    ok('one photo: Page 1 added, editor open to check the corners', /^Page 1 added\. Check the corners, then tap Done\./.test(await txt(p, '#add-msg')) && await p.isVisible('#editor') && (await txt(p, '#ed-h')) === 'Fix page 1');
    await p.waitForTimeout(400);
    const box = await p.locator('#ed-photo').boundingBox(), sc = box.width / 800, cs = await corners(p);
    ok('the 4 corners land on the page corners (within 12 px of the photo)', cs.every((c, i) => Math.abs(c[0] / sc - Q[i][0]) < 12 && Math.abs(c[1] / sc - Q[i][1]) < 12));
    const prevSize = await p.evaluate(() => [document.getElementById('ed-prev').width, document.getElementById('ed-prev').height]);
    ok('the preview is straightened to the page shape (taller than wide)', prevSize[1] > prevSize[0] * 1.3);
    // drag the top-left corner with the mouse
    const h0 = await p.locator('.handle[data-i="0"]').boundingBox();
    await p.mouse.move(h0.x + 22, h0.y + 22); await p.mouse.down(); await p.mouse.move(h0.x + 32, h0.y + 42, { steps: 4 });
    ok('dragging shows the zoomed view of the corner', await p.isVisible('#loupe'));
    await p.mouse.up();
    const cs2 = await corners(p);
    ok('dragging moves the corner by the drag', Math.abs(cs2[0][0] - cs[0][0] - 10) < 2 && Math.abs(cs2[0][1] - cs[0][1] - 20) < 2 && await p.isHidden('#loupe'));
    // crossing over is refused
    const h2 = await p.locator('.handle[data-i="2"]').boundingBox();
    await p.mouse.move(h0.x + 32, h0.y + 42); await p.mouse.down(); await p.mouse.move(h2.x + 40, h2.y + 40, { steps: 8 }); await p.mouse.up();
    const cs3 = await corners(p);
    ok('corners cannot cross over: the shape stays a proper 4-sided page', await p.evaluate(q => window.ScanCore.isConvex(q), cs3));
    // keyboard
    await p.click('#ed-find'); const cf = await corners(p);
    ok('Find the page again puts the corners back', cf.every((c, i) => Math.abs(c[0] - cs[i][0]) < 1 && Math.abs(c[1] - cs[i][1]) < 1));
    await p.focus('.handle[data-i="1"]'); await p.keyboard.press('ArrowLeft'); await p.keyboard.press('Shift+ArrowDown');
    const ck = await corners(p);
    ok('arrow keys move a corner (1% and Shift 5%)', ck[1][0] < cf[1][0] - 1 && ck[1][1] > cf[1][1] + 3);
    await p.click('#ed-whole');
    const cw = await corners(p);
    ok('Use the whole photo puts the corners at the photo corners', Math.abs(cw[0][0]) < 1 && Math.abs(cw[2][0] - box.width) < 1.5 && Math.abs(cw[2][1] - box.height) < 1.5);
    await p.click('#ed-find');
    // look and turn
    await p.check('input[name=look][value=bw]'); await p.waitForTimeout(500);
    ok('choosing Black and white shows on the page in the list', (await subs(p))[0] === 'Black and white');
    await p.click('#ed-right'); await p.waitForTimeout(500);
    const turned = await p.evaluate(() => [document.getElementById('ed-prev').width, document.getElementById('ed-prev').height]);
    ok('Turn right: the preview is now wider than tall and the list says turned right', turned[0] > turned[1] && (await subs(p))[0] === 'Black and white, turned right');
    await p.click('#ed-left'); await p.waitForTimeout(300);
    ok('Turn left undoes it', (await subs(p))[0] === 'Black and white');
    await p.keyboard.press('Escape');
    ok('Escape closes Fix page and focus goes back to the page\'s Edit button', await p.isHidden('#editor') && await p.evaluate(() => document.activeElement.classList.contains('p-edit')));

    // ---- 3. bad files, each with a plain message, nothing added
    const bad = [['lease.pdf', Buffer.from('%PDF-1.4'), 'application/pdf', /already a PDF/], ['notes.txt', Buffer.from('hello'), 'text/plain', /not a photo/],
        ['empty.jpg', Buffer.alloc(0), 'image/jpeg', /empty \(0 bytes\)/], ['broken.jpg', Buffer.from('not really a jpeg at all'), 'image/jpeg', /could not be opened\. It may be damaged/],
        ['IMG_0001.HEIC', Buffer.from('ftypheic....'), 'image/heic', /HEIC photo, which this browser cannot open/]];
    for (const [n, buf, t, re] of bad) { await choose(p, [file(n, buf, t)]); await waitIdle(p); ok('bad file ' + n + ': ' + re.source, re.test(await txt(p, '#add-msg')) && await nPages(p) === 1); }

    // ---- 4. a photo with no page edges, and several at once
    await choose(p, [file('grey.png', await photo(p, 600, 800, null, { table: '#808080' }))]); await waitIdle(p);
    ok('no page found: whole photo is used and it says to drag the circles', /edges of the page were not found/.test(await txt(p, '#add-msg')) && (await subs(p))[1] === 'Clean colour, whole photo, set the corners');
    ok('Find the page again is off when nothing was found', await p.isDisabled('#ed-find'));
    await p.click('#ed-done');
    ok('Done closes Fix page', await p.isHidden('#editor'));
    const wide = [[60, 60], [1140, 80], [1120, 760], [80, 740]];
    await choose(p, [file('a.png', await photo(p, 1200, 820, wide, { text: 'Receipt A' })), file('b.png', await photo(p, 800, 1080, Q, { text: 'Page B' })), file('c.txt', Buffer.from('x'), 'text/plain')]); await waitIdle(p);
    ok('several photos at once: 2 added, the text file explained, no editor', /^2 pages added\./.test(await txt(p, '#add-msg')) && /not a photo/.test(await txt(p, '#add-msg')) && await nPages(p) === 4 && await p.isHidden('#editor'));
    ok('ready line counts 4 pages', (await txt(p, '#ready')) === '4 pages will go in the PDF, in the order shown.');

    // ---- 5. order: Up and Down, delete and undo
    ok('first Up and last Down are off', await p.locator('#pages .page').first().locator('.p-up').isDisabled() && await p.locator('#pages .page').last().locator('.p-down').isDisabled());
    await p.locator('#pages .page').nth(2).locator('.p-up').click();   // the wide receipt goes to number 2
    ok('Up moves page 3 to number 2 (its look list follows)', (await subs(p))[1] === 'Clean colour' && (await subs(p))[2] === 'Clean colour, whole photo, set the corners');
    await p.locator('#pages .page').nth(2).locator('button', { hasText: 'Delete' }).click();
    ok('Delete removes it, with Undo', await nPages(p) === 3 && /^Page 3 deleted\.Undo$/.test(await txt(p, '#pages-msg')));
    await p.click('#pages-msg button');
    ok('Undo puts it back in the same place', await nPages(p) === 4 && (await subs(p))[2] === 'Clean colour, whole photo, set the corners');
    await p.locator('#pages .page').nth(2).locator('button', { hasText: 'Delete' }).click();   // the grey photo is not wanted
    ok('after deleting the grey photo 3 pages remain', await nPages(p) === 3);

    // ---- 6. the PDF: name, paper, no limit
    await make(p);
    ok('PDF made: size, pages and no limit', /^\d+ KB$|^\d+\.\d+ MB$/.test(await txt(p, '#res-size')) && (await txt(p, '#res-verdict')) === '3 pages.');
    let d = await download(p);
    ok('empty name downloads as scan-<today>.pdf', /^scan-\d{4}-\d\d-\d\d\.pdf$/.test(d.name));
    ok('the size shown matches the file', (await txt(p, '#res-detail')).includes(d.bytes.toLocaleString('en-US') + ' bytes'));
    if (hasPoppler) {
        const inf = pdfInfo(d.f);
        ok('pdfinfo: 3 pages, A4 portrait, A4 landscape for the wide receipt, A4 portrait', inf.pages === 3 && inf.sizes[0][0] === 595.28 && inf.sizes[1][0] === 841.89 && inf.sizes[2][1] === 841.89);
        const t1 = pageTone(d.f, 1);
        ok('page 1 (Black and white) is white paper with black text', t1.mean > 200 && t1.dark < 60);
    }
    await p.fill('#name', 'Lease / ID: copy?');
    ok('changing the name keeps the result and renames the download', !(await p.isHidden('#result')) && (await p.getAttribute('#download', 'download')) === 'Lease ID copy.pdf');
    await p.selectOption('#paper', 'letter');
    ok('changing the paper hides the old PDF and says to make it again', await p.isHidden('#result') && /Something changed/.test(await txt(p, '#make-msg')));
    await make(p); d = await download(p);
    if (hasPoppler) { const inf = pdfInfo(d.f); ok('US Letter pages are 612 x 792 (792 x 612 for the receipt), title from the name', inf.sizes[0][0] === 612 && inf.sizes[0][1] === 792 && inf.sizes[1][0] === 792 && inf.title === 'Lease ID copy'); }
    await p.selectOption('#paper', 'fit'); await make(p); d = await download(p);
    if (hasPoppler) { const inf = pdfInfo(d.f); ok('Same shape as each page: the receipt page is receipt-shaped', Math.abs(inf.sizes[1][0] / inf.sizes[1][1] - 1080 / 680) < 0.08); }

    // ---- 7. size limits
    await p.selectOption('#limit', 'custom');
    ok('Other size… shows the size box', await p.isVisible('#custom'));
    for (const [v, re] of [['', /Type the size limit in MB/], ['abc', /as a number of MB/], ['0', /smallest limit is 0\.1 MB/], ['900', /largest limit is 500 MB/]]) {
        await p.fill('#custom', v); await p.click('#make');
        ok('size box "' + v + '" is refused: ' + re.source, re.test(await txt(p, '#custom-err')) && await p.isHidden('#result'));
    }
    // impossible: many pages under 0.1 MB
    await p.selectOption('#paper', 'a4');
    const many = []; for (let i = 0; i < 6; i++) many.push(file('m' + i + '.png', await photo(p, 1600, 2100, [[100, 100], [1500, 120], [1480, 2000], [120, 1980]], { text: 'Busy page ' + i + ' with plenty of words to keep' })));
    await choose(p, many); await waitIdle(p);
    await p.locator('#pages .page').nth(3).locator('.p-edit').click(); await p.check('input[name=look][value=photo]'); await p.click('#ed-all'); await p.waitForTimeout(800);
    ok('Use this look on all pages: all 9 pages are Photo as is, with Undo', (await subs(p)).every(s => s.startsWith('Photo as is')) && /^All 9 pages are now Photo as is/.test(await txt(p, '#ed-msg')));
    await p.click('#ed-msg button'); await p.waitForTimeout(500);
    ok('Undo brings back each page\'s own look', (await subs(p))[0] === 'Black and white' && (await subs(p))[3] === 'Photo as is' && (await subs(p))[4] === 'Clean colour');
    await p.click('#ed-done');
    // a limit about 60% of the full-quality size: made smaller to fit
    await p.selectOption('#limit', '0'); await make(p); const full = (await download(p)).bytes;
    const lim = Math.floor(full * 0.6 / 10000) / 100;
    await p.selectOption('#limit', 'custom'); await p.fill('#custom', String(lim)); await make(p);
    d = await download(p);
    ok('a ' + lim + ' MB limit (full quality is ' + full.toLocaleString('en-US') + ' bytes): made smaller and under it', d.bytes <= lim * 1e6 && new RegExp('under your ' + lim + ' MB limit').test(await txt(p, '#res-verdict')) && /Made smaller to fit: pictures at \d+% size and \d+% quality/.test(await txt(p, '#res-detail')));
    ok('the result shows green (under the limit)', !(await p.evaluate(() => document.getElementById('result').classList.contains('over'))));
    await p.fill('#custom', '0.1'); await make(p);
    ok('impossible limit: says it is still over, red, and explains what to do', /still over your 0\.1 MB limit/.test(await txt(p, '#res-verdict')) && /Delete a page, pick Black and white/.test(await txt(p, '#res-detail'))
        && await p.evaluate(() => document.getElementById('result').classList.contains('over')));
    d = await download(p);
    ok('the smallest possible PDF can still be downloaded', d.bytes > 100000 && d.bytes < 2000000);
    if (hasPoppler) ok('pdfinfo reads all 9 pages of it', pdfInfo(d.f).pages === 9);
    await p.selectOption('#limit', '10000000'); await make(p);
    ok('10 MB: under, not shrunk', /^9 pages, under your 10 MB limit\.$/.test(await txt(p, '#res-verdict')) && !/Made smaller/.test(await txt(p, '#res-detail')));
    ok('no console errors so far', !p.errors.length); if (p.errors.length) console.log(p.errors);

    // ---- 8. reload: pages, order, looks, name and limit are still there
    const before = await subs(p);
    await p.reload({ waitUntil: 'networkidle' }); await p.waitForFunction(() => document.querySelectorAll('#pages .page').length === 9, null, { timeout: 20000 });
    ok('after reload: 9 pages in the same order with the same looks', JSON.stringify(await subs(p)) === JSON.stringify(before) && /still here from last time/.test(await txt(p, '#add-msg')));
    ok('after reload: name and 10 MB limit remembered', (await p.inputValue('#name')) === 'Lease / ID: copy?' && (await p.inputValue('#limit')) === '10000000');

    // ---- 9. Start over and undo
    await p.click('#restart');
    ok('Start over: no pages, name cleared, Undo offered', await p.isHidden('#pages-card') && (await p.inputValue('#name')) === '' && /^All 9 pages removed\./.test(await txt(p, '#add-msg')));
    await p.click('#add-msg button');
    ok('Undo brings back all 9 pages and the name', await nPages(p) === 9 && (await p.inputValue('#name')) === 'Lease / ID: copy?');
    await p.click('#restart'); await p.waitForTimeout(500);
    await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(800);
    ok('after Start over and reload the list is empty', await p.isHidden('#pages-card') && await p.isVisible('#demo'));
    ok('no console errors', !p.errors.length); if (p.errors.length) console.log(p.errors);

    // ---- 10. at most 60 pages
    const tiny = await photo(p, 120, 160, [[10, 10], [110, 12], [108, 150], [12, 148]]);
    await choose(p, Array.from({ length: 62 }, (_, i) => file('t' + i + '.png', tiny))); await waitIdle(p);
    ok('62 photos: 60 added and it says 2 more were not', await nPages(p) === 60 && /2 more not added: 60 pages is the most/.test(await txt(p, '#add-msg')));
    await choose(p, [file('one.png', tiny)]); await waitIdle(p);
    ok('a 61st page is refused with a plain message', /already has 60 pages/.test(await txt(p, '#add-msg')) && await nPages(p) === 60);
    await p.click('#restart');
    await p.context().close();

    // ---- 11. corrupt saved data, and storage blocked
    p = await load(b, { width: 390, height: 844 });
    await p.evaluate(() => new Promise(res => { localStorage.setItem('document-scanner-to-pdf.settings', '{bad'); localStorage.setItem('document-scanner-to-pdf.name', '[1,2]');
        const r = indexedDB.open('document-scanner-to-pdf', 1); r.onsuccess = () => { const t = r.result.transaction('pages', 'readwrite'); const s = t.objectStore('pages');
            s.put({ id: 'x1', w: 'wide', h: 10 }); s.put({ id: 'x2', w: 100, h: 100, corners: [[0, 0]], blob: 'nope' }); s.put({ id: 'x3', w: 100, h: 100, rot: 45, corners: 'bad', blob: new Blob(['x']) }); t.oncomplete = res; }; }));
    await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(800);
    ok('corrupt saved data: the page opens, bad records are dropped or cleaned, no crash', !p.errors.length && await nPages(p) <= 1 && (await p.inputValue('#paper')) === 'a4' && (await p.inputValue('#name')) === '');
    await p.click('#restart').catch(() => {});
    await p.context().close();
    p = await load(b, { width: 390, height: 844 }, { init: () => { Object.defineProperty(window, 'indexedDB', { get() { throw new Error('blocked'); } }); const k = Storage.prototype; k.setItem = k.getItem = () => { throw new Error('blocked'); }; } });
    ok('storage blocked: it says pages are not being saved', /not letting the app save pages/.test(await txt(p, '#privacy')));
    await demo(p); await make(p);
    ok('storage blocked: the PDF is still made', !(await p.isHidden('#result')) && !p.errors.length);
    await p.context().close();

    // ---- 12. US visitors get US Letter
    p = await load(b, { width: 1280, height: 900 }, { locale: 'en-US' });
    ok('en-US: US Letter is picked', (await p.inputValue('#paper')) === 'letter');
    await p.context().close();

    // ---- 13. offline after the first visit
    if (bi === -1 || url.startsWith('https')) {
        const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); p = await load(b, null, { ctx });
        await p.evaluate(() => navigator.serviceWorker.ready); await p.reload({ waitUntil: 'networkidle' });
        await ctx.setOffline(true); await p.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
        ok('works offline after the first visit', (await p.textContent('h1').catch(() => '')) === 'Document Scanner to PDF');
        await ctx.setOffline(false); await ctx.close();
    }

    // ---- 14. screen sizes with real state, light and dark, and the editor open on phones
    for (const theme of ['dark', 'light']) {
        p = await load(b, { width: 1280, height: 900 }, { theme });
        await demo(p); await p.selectOption('#limit', '2000000'); await make(p);
        for (const w of [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920]) {
            await p.setViewportSize({ width: w, height: w < 600 ? 800 : 900 }); await p.waitForTimeout(80);
            const l = await layout(p); ok(theme + ' ' + w + 'px with 3 pages and a PDF: layout clean' + (l.length ? ' ' + l.join('; ') : ''), !l.length);
            if (w >= 900) {
                for (const pos of [0, 0.5, 1]) { await p.evaluate(x => window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * x), pos); const l2 = await layout(p); if (l2.length) ok(theme + ' ' + w + 'px scrolled ' + pos * 100 + '%: ' + l2.join('; '), false); }
                const side = await p.evaluate(() => { const a = document.querySelector('.col-main').getBoundingClientRect(), s = document.querySelector('.col-side').getBoundingClientRect(); return s.left >= a.right && Math.abs(s.top - a.top) < 2; });
                ok(theme + ' ' + w + 'px: pages on the left, the PDF on the right', side);
            }
        }
        for (const w of [320, 360, 390, 1280]) {
            await p.setViewportSize({ width: w, height: 800 });
            await p.locator('#pages .page').first().locator('.p-edit').click(); await p.waitForTimeout(500);
            await p.selectOption('#limit', 'custom');
            const l = await layout(p); ok(theme + ' ' + w + 'px with Fix page and the size box open: layout clean' + (l.length ? ' ' + l.join('; ') : ''), !l.length);
            const st = await p.evaluate(() => { const s = document.getElementById('stage').getBoundingClientRect(); return s.right <= innerWidth && s.left >= 0 && s.height <= innerHeight; });
            ok(theme + ' ' + w + 'px: the photo with its corners fits on the screen', st);
            await p.selectOption('#limit', '2000000'); await p.click('#ed-done');
        }
        // light/dark switch
        const tog = p.locator('.theme-toggle');
        if (await tog.count()) { const bg1 = await p.evaluate(() => getComputedStyle(document.body).backgroundColor); await tog.click(); const bg2 = await p.evaluate(() => getComputedStyle(document.body).backgroundColor); ok(theme + ': the Light/Dark switch changes the colours', bg1 !== bg2); await tog.click(); }
        ok(theme + ': no console errors or failed requests', !p.errors.length && !p.bad.length); if (p.errors.length || p.bad.length) console.log(p.errors, p.bad);
        await p.context().close();
    }

    // ---- 15. Help
    p = await load(b, { width: 390, height: 844 });
    for (const w of [320, 390, 820, 1280]) {
        await p.setViewportSize({ width: w, height: 800 });
        await p.click('.help-btn'); const r = await p.locator('dialog.help').boundingBox();
        ok(w + 'px: Help opens fully on screen with its title', r.x >= 0 && r.x + r.width <= w && r.y >= 0 && r.y + r.height <= 800 && /How to use Document Scanner to PDF/.test(await p.textContent('dialog.help h2')));
        await p.keyboard.press('Escape'); ok(w + 'px: Escape closes Help', !(await p.evaluate(() => document.querySelector('dialog.help').open)));
        await p.click('.help-btn'); await p.click('.help-close'); ok(w + 'px: Got it closes Help', !(await p.evaluate(() => document.querySelector('dialog.help').open)));
        const tb = await p.evaluate(() => { const r = [...document.querySelectorAll('.topbar > *')].map(e => e.getBoundingClientRect()); return r.every(a => Math.abs(a.top - r[0].top) < 4); });
        ok(w + 'px: top bar buttons on one line', tb);
    }
    const files = ['favicon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'manifest.webmanifest', 'sw.js', '../help.js', '../theme.js', 'core.js', 'script.js', 'style.css'];
    for (const f of files) { const r = await p.request.get(new URL(f, url).href); ok('file ' + f + ' answers 200', r.status() === 200); }
    await p.context().close();

    // ---- screenshots for the README
    if (shots) {
        const dir = path.join(__dirname, 'screenshots'); fs.mkdirSync(dir, { recursive: true });
        for (const [name, vp] of [['desktop', { width: 1280, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
            p = await load(b, vp, { theme: 'dark' });
            await demo(p); await p.fill('#name', 'Lease and ID'); await p.selectOption('#limit', '2000000'); await make(p);
            if (name === 'phone') {
                await p.locator('#pages .page').nth(1).locator('.p-edit').click(); await p.waitForTimeout(900);
                await p.evaluate(() => window.scrollTo(0, document.getElementById('editor').getBoundingClientRect().top + scrollY - 10));
                await p.screenshot({ path: path.join(dir, 'phone.png') });
            } else {
                await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(300);
                await p.screenshot({ path: path.join(dir, 'desktop.png'), clip: { x: 0, y: 0, width: 1280, height: 900 } });
            }
            await p.context().close();
        }
        console.log('screenshots saved');
    }

    await b.close(); if (srv) srv.close();
    console.log('\n' + (fail ? fail + ' FAILED' : 'ALL UI CHECKS PASSED'));
    process.exitCode = fail ? 1 : 0;
})();
