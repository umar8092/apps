// Drives the real page in headless Chromium: node ui-test.js [--shots] [--base https://umar8092.github.io/apps]
// Without --base it serves this repo on localhost. With --base it tests the LIVE page.
const pw = (() => { for (const m of ['playwright', 'playwright-core', '/opt/node-tools/node_modules/playwright']) { try { return require(m); } catch (e) { /* next */ } } throw new Error('playwright not found'); })();
const path = require('path'), fs = require('fs'), http = require('http');
const bi = process.argv.indexOf('--base');
const shots = process.argv.includes('--shots');
const SLUG = 'photo-size-reducer-for-online-forms';
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

async function load(b, vp, opt = {}) {
    const ctx = opt.ctx || await b.newContext({ viewport: vp, deviceScaleFactor: vp.width < 500 ? 2 : 1, colorScheme: opt.theme || 'dark', acceptDownloads: true });
    if (opt.init) await ctx.addInitScript(opt.init);
    const p = await ctx.newPage();
    p.errors = []; p.on('console', m => m.type() === 'error' && p.errors.push(m.text())); p.on('pageerror', e => p.errors.push(String(e)));
    p.bad = []; p.on('response', r => { if (r.status() >= 400) p.bad.push(r.status() + ' ' + r.url()); });
    p.ok200 = []; p.on('response', r => { if (r.status() === 200) p.ok200.push(r.url()); });
    await p.goto(url, { waitUntil: 'networkidle' });
    return p;
}
const idle = p => p.waitForFunction(() => !document.querySelector('.photo.busy'), null, { timeout: 60000 }).then(() => p.waitForTimeout(50));
const card = (p, i) => p.locator('.photo').nth(i);
const info = (p, i) => p.evaluate(i => {
    const ph = PhotoApp.photos()[i], li = document.querySelectorAll('.photo')[i];
    const q = s => li.querySelector(s);
    return { size: ph.result ? ph.result.blob.size : null, w: ph.result ? ph.result.w : null, h: ph.result ? ph.result.h : null, kept: !!(ph.result && ph.result.kept),
        sizeText: q('.p-size').textContent, verdict: q('.p-verdict').textContent, verdictCls: q('.p-verdict').className, detail: q('.p-detail').textContent,
        err: q('.err').textContent, dlHidden: q('.p-btns .primary').hidden || getComputedStyle(q('.p-btns .primary')).display === 'none', dlName: q('.p-btns .primary').download };
}, i);
// image files made by the browser itself
async function makeImage(p, w, h, type, q, opts = {}) {
    const b64 = await p.evaluate(({ w, h, type, q, opts }) => new Promise(res => {
        const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
        if (!opts.clear) { const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#2b6cb0'); gr.addColorStop(1, '#f6ad55'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }
        else { g.fillStyle = '#e11d48'; g.fillRect(w / 4, h / 4, w / 2, h / 2); }
        if (opts.noise) { const im = g.getImageData(0, 0, w, h); let s = 7; for (let i = 0; i < im.data.length; i += 4) { s = (s * 1103515245 + 12345) & 0x7fffffff; const n = (s % 61) - 30; im.data[i] += n; im.data[i + 1] += n; im.data[i + 2] += n; } g.putImageData(im, 0, 0); }
        if (opts.mark) { g.fillStyle = '#000'; g.fillRect(0, 0, w / 3, h / 3); }
        c.toBlob(b => { const r = new FileReader(); r.onload = () => res(r.result.split(',')[1]); r.readAsDataURL(b); }, type, q);
    }), { w, h, type, q, opts });
    return Buffer.from(b64, 'base64');
}
// JPEG with an EXIF "turn 90 degrees" mark, like a phone photo taken upright
function withExifRotate(jpg) {
    const tiff = Buffer.from([0x49, 0x49, 0x2A, 0x00, 0x08, 0, 0, 0, 0x01, 0x00, 0x12, 0x01, 0x03, 0x00, 0x01, 0, 0, 0, 0x06, 0x00, 0, 0, 0, 0, 0, 0]);
    const body = Buffer.concat([Buffer.from('Exif\0\0', 'binary'), tiff]);
    const len = body.length + 2;
    return Buffer.concat([jpg.subarray(0, 2), Buffer.from([0xFF, 0xE1, len >> 8, len & 255]), body, jpg.subarray(2)]);
}
const choose = (p, files) => p.setInputFiles('#file', files);
async function sample(p) { const n = await p.locator('.photo').count(); await p.click('#sample'); await p.waitForFunction(n => document.querySelectorAll('.photo').length > n, n); await idle(p); }
async function setMax(p, i, v, other, unit) {
    await card(p, i).locator('select[data-f=max]').selectOption(v);
    if (other != null) { await card(p, i).locator('input[data-f=other]').fill(other); if (unit) await card(p, i).locator('select[data-f=unit]').selectOption(unit); }
    await p.waitForTimeout(450); await idle(p);
}
async function more(p, i) { const b = card(p, i).locator('.p-rules > .link'); if (await b.isVisible()) await b.click(); }
async function pixelsOf(p, i) {   // decodes the result and reads its size and corner colour
    return p.evaluate(i => new Promise(res => {
        const img = new Image(); img.onload = () => { const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
            const d = g.getImageData(2, 2, 1, 1).data; res({ w: img.naturalWidth, h: img.naturalHeight, corner: [d[0], d[1], d[2]] }); };
        img.src = document.querySelectorAll('.photo')[i].querySelector('img').src;
    }), i);
}
async function layout(p) {
    return p.evaluate(() => {
        const W = document.documentElement.clientWidth, bad = [], inter = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
        if (document.documentElement.scrollWidth > W) bad.push('page scrolls sideways');
        document.querySelectorAll('main *').forEach(e => { const r = e.getBoundingClientRect(); if (r.width && !e.classList.contains('file-input') && !e.closest('.sr-only') && (r.right > W + 1 || r.left < -1)) bad.push('sticks out: ' + e.tagName + '.' + e.className); });
        const ctl = [...document.querySelectorAll('main input:not(.file-input), main select, main button, main a.primary')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.height; });
        for (let i = 0; i < ctl.length; i++) for (let j = i + 1; j < ctl.length; j++) if (inter(ctl[i].getBoundingClientRect(), ctl[j].getBoundingClientRect())) bad.push('overlap: ' + (ctl[i].dataset.f || ctl[i].textContent || ctl[i].id) + ' / ' + (ctl[j].dataset.f || ctl[j].textContent || ctl[j].id));
        // placeholders must fit their box
        const cv = document.createElement('canvas').getContext('2d');
        document.querySelectorAll('main input[placeholder]').forEach(e => { const r = e.getBoundingClientRect(); if (!r.width) return; const cs = getComputedStyle(e); cv.font = cs.fontSize + ' ' + cs.fontFamily;
            const room = e.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight); if (cv.measureText(e.placeholder).width > room + 1) bad.push('placeholder cut off: ' + e.placeholder); });
        // blocks inside main and inside each photo box never overlap
        const hosts = [document.querySelector('main'), ...document.querySelectorAll('.photo, .p-body, .p-btns, .p-head')];
        hosts.forEach(h => { const k = [...h.children].filter(c => { const r = c.getBoundingClientRect(), cs = getComputedStyle(c); return r.width > 4 && r.height > 4 && cs.position !== 'absolute' && cs.position !== 'fixed'; });
            for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) if (inter(k[i].getBoundingClientRect(), k[j].getBoundingClientRect())) bad.push('blocks overlap: ' + k[i].className + ' / ' + k[j].className); });
        return [...new Set(bad)].slice(0, 6);
    });
}

(async () => {
    let srv;
    if (bi >= 0) url = process.argv[bi + 1].replace(/\/$/, '') + '/' + SLUG + '/';
    else { srv = await serve(); url = 'http://localhost:' + srv.address().port + '/' + SLUG + '/'; }
    console.log('Testing ' + url);
    const b = await pw.chromium.launch();

    // 1. first use: empty state
    let p = await load(b, { width: 390, height: 844 });
    ok('first use: empty message shows', await p.isVisible('#empty') && (await p.locator('.photo').count()) === 0);
    ok('first use: Remove all is hidden', await p.isHidden('#all-actions'));
    ok('first use: no errors', p.errors.length === 0);

    // 2. the situation: a 2.4 MB phone-size photo, form allows 100 KB
    await sample(p);
    let r = await info(p, 0);
    ok('sample photo is ' + r.size + ' bytes, at most 100,000', r.size > 0 && r.size <= 100000);
    ok('uses the room well (over 80,000 bytes)', r.size > 80000);
    ok('says "Under 100 KB. Ready to upload."', r.verdict === 'Under 100 KB. Ready to upload.' && /good/.test(r.verdictCls));
    ok('big number shows the size in KB: ' + r.sizeText, /^\d+(\.\d)? KB$/.test(r.sizeText));
    ok('detail says was and now: ' + r.detail.replace(/\n/g, ' | '), /^Was 2\.\d MB, 3000\u00a0×\u00a02000\u00a0px\nNow \d+\u00a0×\u00a0\d+\u00a0px, JPG\. \d+% smaller\.$/.test(r.detail));
    ok('download name is sample-photo-under-100KB.jpg', r.dlName === 'sample-photo-under-100KB.jpg');
    let [dl] = await Promise.all([p.waitForEvent('download'), card(p, 0).locator('.p-btns .primary').click()]);
    let buf = fs.readFileSync(await dl.path());
    ok('downloaded file is a JPEG of the same size (' + buf.length + ' bytes)', buf.length === r.size && buf[0] === 0xFF && buf[1] === 0xD8 && dl.suggestedFilename() === 'sample-photo-under-100KB.jpg');
    ok('share button hidden where sharing files is not supported', await card(p, 0).locator('.p-btns .secondary', { hasText: 'Share' }).isHidden());
    ok('optional rules are not forced (hidden behind + More size rules)', await card(p, 0).locator('.more').isHidden() && await card(p, 0).locator('.p-rules > .link').isVisible());

    // every preset
    for (const kb of [20, 50, 200, 500, 1000, 2000]) {
        await setMax(p, 0, String(kb)); r = await info(p, 0);
        ok('preset ' + kb + ' KB: ' + r.size + ' bytes <= ' + kb * 1000 + ' (' + r.sizeText + ', ' + r.w + 'x' + r.h + ')', r.size <= kb * 1000 && /good/.test(r.verdictCls) && r.dlName.endsWith('-under-' + (kb >= 1000 ? kb / 1000 + 'MB' : kb + 'KB') + '.jpg'));
    }
    // other sizes typed by hand
    await setMax(p, 0, 'other', '150'); r = await info(p, 0);
    ok('other 150 KB: ' + r.size, r.size <= 150000 && r.verdict.startsWith('Under 150 KB'));
    await setMax(p, 0, 'other', '1.5', 'MB'); r = await info(p, 0);
    ok('other 1.5 MB', r.size <= 1500000 && r.verdict.startsWith('Under 1.5 MB'));
    await setMax(p, 0, 'other', '30kb', 'MB'); r = await info(p, 0);
    ok('pasted "30kb" in the MB box means 30 KB', r.size <= 30000 && r.verdict.startsWith('Under 30 KB'));
    for (const [v, msg] of [['', 'Type the size the form allows'], ['0', 'at least 2 KB'], ['-5', 'at least 2 KB'], ['abc', 'as a number'], ['60', 'up to 50 MB']]) {
        await card(p, 0).locator('select[data-f=unit]').selectOption(v === '60' ? 'MB' : 'KB');
        await card(p, 0).locator('input[data-f=other]').fill(v); await p.waitForTimeout(450); r = await info(p, 0);
        ok('other "' + v + '" refused: ' + r.err, r.err.includes(msg) && r.dlHidden && r.size === null && /Fix the size rule/.test(r.verdict));
    }
    await card(p, 0).locator('select[data-f=unit]').selectOption('KB');
    await card(p, 0).locator('input[data-f=other]').fill('80'); await p.waitForTimeout(450); await idle(p); r = await info(p, 0);
    ok('fixing the mistake brings the result back', r.size <= 80000 && !r.err && !r.dlHidden);

    // minimum size: between 20 and 50 KB
    await setMax(p, 0, '50'); await more(p, 0);
    await card(p, 0).locator('input[data-f=min]').fill('20'); await p.waitForTimeout(450); await idle(p); r = await info(p, 0);
    ok('between 20 and 50 KB: ' + r.size, r.size >= 20480 && r.size <= 50000 && r.verdict === 'Between 20 KB and 50 KB. Ready to upload.');
    await card(p, 0).locator('input[data-f=min]').fill('48'); await p.waitForTimeout(450); r = await info(p, 0);
    ok('at least 48 with a 50 KB limit is refused', /smaller than the limit of 50 KB/.test(r.err) && r.dlHidden);
    await card(p, 0).locator('input[data-f=min]').fill('x'); await p.waitForTimeout(450); r = await info(p, 0);
    ok('at least "x" is refused', /as a number/.test(r.err));
    await card(p, 0).locator('input[data-f=min]').fill(''); await p.waitForTimeout(450); await idle(p); r = await info(p, 0);
    ok('empty at least = no minimum', !r.err && r.verdict === 'Under 50 KB. Ready to upload.');

    // exact pixels
    await card(p, 0).locator('select[data-f=px]').selectOption('600x600'); await p.waitForTimeout(450); await idle(p);
    let px = await pixelsOf(p, 0); r = await info(p, 0);
    ok('600 x 600 exactly, under 50 KB', px.w === 600 && px.h === 600 && r.size <= 50000 && r.detail.includes('Now 600\u00a0×\u00a0600\u00a0px'));
    ok('crop fills the corner with the photo (not white)', px.corner.some(v => v < 200));
    await card(p, 0).locator('select[data-f=fit]').selectOption('pad'); await p.waitForTimeout(450); await idle(p);
    px = await pixelsOf(p, 0);
    ok('white bars: corner is white', px.w === 600 && px.corner.every(v => v > 245));
    await card(p, 0).locator('select[data-f=px]').selectOption('other');
    await card(p, 0).locator('input[data-f=w]').fill('413'); await card(p, 0).locator('input[data-f=h]').fill(''); await p.waitForTimeout(450); r = await info(p, 0);
    ok('width without height is refused', /both the width and the height/.test(r.err));
    await card(p, 0).locator('input[data-f=h]').fill('10'); await p.waitForTimeout(450); r = await info(p, 0);
    ok('10 px is refused', /between 16 and 8000/.test(r.err));
    await card(p, 0).locator('input[data-f=h]').fill('531'); await p.waitForTimeout(450); await idle(p);
    px = await pixelsOf(p, 0);
    ok('custom 413 x 531', px.w === 413 && px.h === 531);
    // impossible: big exact pixels and a 2 KB limit
    await card(p, 0).locator('input[data-f=w]').fill('3000'); await card(p, 0).locator('input[data-f=h]').fill('3000');
    await setMax(p, 0, 'other', '2', 'KB'); r = await info(p, 0);
    ok('impossible limit says so plainly: ' + r.verdict, /cannot be made under 2 KB and still be recognisable/.test(r.verdict) && r.sizeText === 'Too small' && r.dlHidden);
    await card(p, 0).locator('select[data-f=px]').selectOption(''); await setMax(p, 0, '100'); r = await info(p, 0);
    ok('back to 100 KB without pixels', r.size <= 100000 && /Under 100 KB/.test(r.verdict));

    // rotate
    await card(p, 0).locator('button', { hasText: 'Rotate' }).click(); await p.waitForTimeout(450); await idle(p); r = await info(p, 0);
    ok('rotate turns it portrait', r.h > r.w);
    await card(p, 0).locator('button', { hasText: 'Rotate' }).click(); await p.waitForTimeout(450); await idle(p); r = await info(p, 0);
    ok('rotate again: landscape', r.w > r.h);

    // each photo has its own rules; a new photo starts with the last rules
    await sample(p);
    await setMax(p, 1, '20');
    let r0 = await info(p, 0), r1 = await info(p, 1);
    ok('photo 1 keeps 100 KB while photo 2 is 20 KB', r0.verdict.startsWith('Under 100 KB') && r1.verdict.startsWith('Under 20 KB') && r1.size <= 20000);
    ok('Remove all shows with 2 photos, count (2)', await p.isVisible('#all-actions') && (await p.textContent('#count')) === '(2)');
    await sample(p);
    ok('new photo starts with the last rules (20 KB)', (await info(p, 2)).verdict.startsWith('Under 20 KB'));

    // remove, undo, remove all, undo
    await card(p, 1).locator('.p-remove').click();
    ok('remove: 2 left with Undo', (await p.locator('.photo').count()) === 2 && /Removed/.test(await p.textContent('#list-msg')));
    await p.click('#list-msg button'); await idle(p);
    ok('undo puts it back in its place', (await p.locator('.photo').count()) === 3 && (await info(p, 1)).verdict.startsWith('Under 20 KB'));
    await p.click('#clear');
    ok('remove all: empty again', (await p.locator('.photo').count()) === 0 && await p.isVisible('#empty'));
    await p.click('#list-msg button'); await idle(p);
    ok('undo remove all brings 3 back with results', (await p.locator('.photo.ok').count()) === 3);
    ok('no console errors in the main run', p.errors.length === 0);

    // reload: rules remembered, photos not kept
    await p.reload({ waitUntil: 'networkidle' });
    ok('reload: photos are not kept', (await p.locator('.photo').count()) === 0 && await p.isVisible('#empty'));
    await sample(p);
    ok('reload: last rule (20 KB) remembered', (await info(p, 0)).verdict.startsWith('Under 20 KB'));
    await p.context().close();

    // odd files
    p = await load(b, { width: 1280, height: 900 });
    await choose(p, [{ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') }]);
    ok('a text file is refused with a message', /is not a photo/.test(await p.textContent('#pick-msg')) && (await p.locator('.photo').count()) === 0);
    await choose(p, [{ name: 'cv.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') }]);
    ok('a PDF gets its own message', /is a PDF, not a photo/.test(await p.textContent('#pick-msg')));
    await choose(p, [{ name: 'empty.jpg', mimeType: 'image/jpeg', buffer: Buffer.alloc(0) }]);
    ok('an empty file is refused', /is empty/.test(await p.textContent('#pick-msg')));
    await choose(p, [{ name: 'IMG_0001.HEIC', mimeType: 'image/heic', buffer: Buffer.from('not really heic data here') }]); await idle(p);
    r = await info(p, 0);
    ok('HEIC this browser cannot open: clear advice', /cannot open HEIC/.test(r.verdict) && r.sizeText === 'Can’t open' && r.dlHidden);
    await choose(p, [{ name: 'broken.jpg', mimeType: 'image/jpeg', buffer: Buffer.from([0xFF, 0xD8, 1, 2, 3, 4, 5]) }]); await idle(p);
    ok('a damaged photo: clear message', /could not be opened as a photo/.test((await info(p, 1)).verdict));
    await p.click('#clear');
    // a JPEG that already fits is left as it is
    const small = await makeImage(p, 500, 400, 'image/jpeg', 0.6, { noise: true });
    await choose(p, [{ name: 'already-small.jpg', mimeType: 'image/jpeg', buffer: small }]); await idle(p);
    await setMax(p, 0, '100').catch(() => {});
    r = await info(p, 0);
    ok('fitting JPEG (' + small.length + ' bytes) is kept exactly', small.length <= 100000 && r.kept && r.size === small.length && /left exactly as it is/.test(r.verdict) && r.dlName === 'already-small.jpg');
    // a see-through PNG becomes JPG with white
    const png = await makeImage(p, 400, 400, 'image/png', 1, { clear: true });
    await choose(p, [{ name: 'logo.png', mimeType: 'image/png', buffer: png }]); await idle(p);
    px = await pixelsOf(p, 1); r = await info(p, 1);
    ok('see-through PNG: white background, saved as JPG', px.corner.every(v => v > 245) && r.dlName === 'logo-under-100KB.jpg');
    // a phone photo with the EXIF turn mark comes out upright (portrait)
    const exif = withExifRotate(await makeImage(p, 300, 200, 'image/jpeg', 0.9, { mark: true }));
    await setMax(p, 1, '20');
    await choose(p, [{ name: 'upright.jpg', mimeType: 'image/jpeg', buffer: exif }]); await idle(p);
    r = await info(p, 2);
    ok('EXIF rotated photo comes out portrait (' + r.w + 'x' + r.h + ')', r.w === 200 && r.h === 300);
    // tiny photo with a minimum: padded
    const tiny = await makeImage(p, 40, 40, 'image/png', 1);
    await choose(p, [{ name: 'signature.png', mimeType: 'image/png', buffer: tiny }]); await idle(p);
    await setMax(p, 3, '50'); await more(p, 3);
    await card(p, 3).locator('input[data-f=min]').fill('20'); await p.waitForTimeout(450); await idle(p);
    r = await info(p, 3); px = await pixelsOf(p, 3);
    ok('tiny photo padded to between 20 and 50 KB: ' + r.size, r.size >= 20480 && r.size <= 50000 && /Padded with empty space/.test(r.detail) && px.w === 40);
    // very long name wraps
    await choose(p, [{ name: 'a'.repeat(180) + '.png', mimeType: 'image/png', buffer: tiny }]); await idle(p);
    ok('very long name: no sideways scroll', (await layout(p)).length === 0);
    // more than 12
    const many = Array.from({ length: 10 }, (_, i) => ({ name: 'p' + i + '.png', mimeType: 'image/png', buffer: tiny }));
    await choose(p, many); await idle(p);
    ok('only 12 photos at a time, with a message', (await p.locator('.photo').count()) === 12 && /Only 12 photos fit/.test(await p.textContent('#pick-msg')));
    await p.click('#clear');
    // paste and drop
    await p.evaluate(async () => {
        const b = await (await fetch('favicon.svg')).blob();
        const c = document.createElement('canvas'); c.width = 64; c.height = 64; c.getContext('2d').fillRect(0, 0, 30, 30);
        const blob = await new Promise(r => c.toBlob(r, 'image/png'));
        const dt = new DataTransfer(); dt.items.add(new File([blob], 'screenshot.png', { type: 'image/png' }));
        document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }));
        const dt2 = new DataTransfer(); dt2.items.add(new File([blob], 'dropped.png', { type: 'image/png' }));
        document.getElementById('drop').dispatchEvent(new DragEvent('drop', { dataTransfer: dt2, bubbles: true, cancelable: true }));
    });
    await p.waitForTimeout(300); await idle(p);
    ok('paste a screenshot and drop a file both add a photo', (await p.locator('.photo.ok').count()) === 2 && (await p.textContent('.photo .p-name')) === 'screenshot.png');
    ok('no console errors with odd files', p.errors.filter(e => !/Failed to load resource/.test(e)).length === 0);
    // keyboard: the hidden file input is reachable with Tab and shows a focus ring on the box
    await p.reload({ waitUntil: 'networkidle' });
    let found = false;
    for (let i = 0; i < 8 && !found; i++) { await p.keyboard.press('Tab'); found = await p.evaluate(() => document.activeElement.id === 'file'); }
    ok('keyboard reaches "Choose photos"', found && await p.evaluate(() => getComputedStyle(document.getElementById('drop')).outlineStyle !== 'none'));
    await p.context().close();

    // share where the browser supports it
    p = await load(b, { width: 390, height: 844 }, { init: () => { navigator.canShare = () => true; navigator.share = d => { window.__shared = d.files[0].name; return Promise.resolve(); }; } });
    await sample(p);
    await card(p, 0).locator('button', { hasText: 'Share or save' }).click(); await p.waitForTimeout(200);
    ok('Share or save sends the smaller file', (await p.evaluate(() => window.__shared)) === 'sample-photo-under-20KB.jpg' || (await p.evaluate(() => window.__shared)) === 'sample-photo-under-100KB.jpg');
    await p.context().close();

    // corrupt saved rules, and storage blocked
    p = await load(b, { width: 390, height: 844 }, { init: () => { try { localStorage.setItem('photo-size-reducer-for-online-forms.rules', '{bad json'); } catch (e) {} } });
    await sample(p);
    ok('corrupt saved rules: starts with 100 KB, no errors', (await info(p, 0)).verdict.startsWith('Under 100 KB') && p.errors.length === 0);
    await p.context().close();
    p = await load(b, { width: 390, height: 844 }, { init: () => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); } });
    await sample(p); await setMax(p, 0, '50');
    ok('storage blocked: still works', (await info(p, 0)).size <= 50000 && p.errors.length === 0);
    await p.context().close();

    // offline after the first visit (service worker)
    if (bi < 0 || url.startsWith('https:')) {
        const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
        p = await load(b, null, { ctx });
        await p.evaluate(() => navigator.serviceWorker.ready); await p.reload({ waitUntil: 'networkidle' });
        await ctx.setOffline(true);
        await p.reload({ waitUntil: 'load' }).catch(() => {});
        ok('opens offline', (await p.textContent('h1').catch(() => '')) === 'Photo Size Reducer for Online Forms');
        await sample(p);
        ok('works offline (sample made smaller)', (await info(p, 0)).size > 0);
        await ctx.close();
    }

    // every file the page asks for loads
    p = await load(b, { width: 1280, height: 900 });
    const need = ['favicon.svg', 'manifest.webmanifest', 'style.css', 'core.js', 'script.js', '../help.js', '../theme.js', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'sw.js'];
    for (const f of need) { const res = await p.request.get(new URL(f, url).href); ok('200 for ' + f, res.status() === 200); }
    ok('no failed requests on load', p.bad.length === 0);
    // light / dark switch
    const before = await p.evaluate(() => getComputedStyle(document.body).color);
    await p.click('.theme-toggle');
    ok('light/dark switch changes the colours', before !== await p.evaluate(() => getComputedStyle(document.body).color));
    await p.context().close();

    // help at four widths
    for (const w of [320, 390, 820, 1280]) {
        p = await load(b, { width: w, height: 800 });
        const hb = await p.locator('.help-btn').boundingBox(), bk = await p.locator('a.back').boundingBox(), tg = await p.locator('.theme-toggle').boundingBox();
        ok(w + 'px: top bar on one line, no overlap', Math.abs(hb.y - bk.y) < 4 && Math.abs(tg.y - bk.y) < 4 && hb.x >= bk.x + bk.width && tg.x >= hb.x + hb.width);
        await p.click('.help-btn'); const d = await p.locator('dialog.help').boundingBox();
        ok(w + 'px: Help opens on screen with its title', d.x >= 0 && d.y >= 0 && d.x + d.width <= w && d.y + d.height <= 800 && /How to use Photo Size Reducer for Online Forms/.test(await p.textContent('dialog.help h2')));
        await p.keyboard.press('Escape'); ok(w + 'px: Escape closes Help', !(await p.evaluate(() => document.querySelector('dialog.help').open)));
        await p.click('.help-btn'); await p.click('.help-close'); ok(w + 'px: Got it closes Help', !(await p.evaluate(() => document.querySelector('dialog.help').open)));
        await p.context().close();
    }

    // every screen size, dark and light, with real results and every option open, then cleared
    for (const theme of ['dark', 'light']) {
        const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: theme });
        p = await load(b, null, { ctx });
        await sample(p); await sample(p);
        await setMax(p, 0, '50'); await more(p, 0); await card(p, 0).locator('input[data-f=min]').fill('20');
        await card(p, 0).locator('select[data-f=px]').selectOption('other'); await card(p, 0).locator('input[data-f=w]').fill('600'); await card(p, 0).locator('input[data-f=h]').fill('600');
        await setMax(p, 1, 'other', '150'); await p.waitForTimeout(450); await idle(p);
        for (const w of [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920]) {
            await p.setViewportSize({ width: w, height: w < 600 ? 800 : 900 });
            let bad = [];
            for (const pos of [0, 0.5, 1]) { await p.evaluate(x => scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * x), pos); bad = bad.concat(await layout(p)); }
            ok(theme + ' ' + w + 'px with results and every option open: ' + (bad.length ? [...new Set(bad)].join('; ') : 'clean'), bad.length === 0);
        }
        // an error showing at phone width
        await p.setViewportSize({ width: 320, height: 800 });
        await card(p, 1).locator('input[data-f=other]').fill('abc'); await p.waitForTimeout(450);
        ok(theme + ' 320px with an error message: clean', (await layout(p)).length === 0);
        await p.click('#clear');
        for (const w of [320, 390, 1280]) { await p.setViewportSize({ width: w, height: 800 }); ok(theme + ' ' + w + 'px after Remove all: clean', (await layout(p)).length === 0); }
        ok(theme + ': no console errors', p.errors.length === 0);
        await ctx.close();
    }

    // screenshots for the README: the real situation
    if (shots) {
        for (const [vp, file] of [[{ width: 1280, height: 1500 }, 'desktop.png'], [{ width: 390, height: 844 }, 'phone.png']]) {
            const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: vp.width < 500 ? 2 : 1, colorScheme: 'dark' });
            p = await load(b, null, { ctx });
            await sample(p);
            if (vp.width > 500) {
                await sample(p);
                await setMax(p, 1, '50'); await more(p, 1); await card(p, 1).locator('input[data-f=min]').fill('20');
                await card(p, 1).locator('select[data-f=px]').selectOption('600x600'); await p.waitForTimeout(450); await idle(p);
                await p.evaluate(() => scrollTo(0, 0));
                const bottom = await p.evaluate(() => { document.activeElement.blur(); return Math.ceil(document.getElementById('all-actions').getBoundingClientRect().bottom) + 28; });
                await p.screenshot({ path: path.join(__dirname, 'screenshots', file), clip: { x: 0, y: 0, width: 1280, height: Math.min(1500, bottom) } });
            } else {
                await p.evaluate(() => document.querySelector('.results').scrollIntoView());
                await p.evaluate(() => scrollBy(0, -12));
                await p.screenshot({ path: path.join(__dirname, 'screenshots', file) });
            }
            await ctx.close();
        }
        console.log('screenshots saved');
    }

    await b.close(); if (srv) srv.close();
    console.log(fail ? '\n' + fail + ' FAILED' : '\nALL UI CHECKS PASSED');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
