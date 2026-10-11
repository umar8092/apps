// Drives the real page in headless Chromium: node ui-test.js [--shots] [--base https://umar8092.github.io/apps]
// Without --base it serves this repo on localhost. With --base it tests the LIVE page.
const pw = (() => { for (const m of ['playwright', 'playwright-core', '/opt/node-tools/node_modules/playwright']) { try { return require(m); } catch (e) { /* next */ } } throw new Error('playwright not found'); })();
const path = require('path'), fs = require('fs'), http = require('http');
const bi = process.argv.indexOf('--base');
const shots = process.argv.includes('--shots');
const SLUG = 'signature-maker-for-forms';
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
const idle = p => p.waitForFunction(() => !document.getElementById('result').classList.contains('busy'), null, { timeout: 30000 }).then(() => p.waitForTimeout(60));
const res = p => p.evaluate(() => {
    const r = SignApp.result(), q = id => document.getElementById(id);
    return { has: !!r, size: r ? r.blob.size : null, W: r ? r.W : null, H: r ? r.H : null, fmt: r ? r.fmt : null, padded: r ? r.padded : null, type: r ? r.blob.type : null,
        sizeText: q('res-size').textContent, verdict: q('res-verdict').textContent, verdictBad: q('res-verdict').classList.contains('bad'), detail: q('res-detail').textContent,
        empty: !q('res-empty').hidden, failed: q('result').classList.contains('failed'), dl: q('download').getAttribute('download'), href: !!q('download').getAttribute('href') };
});
// A handwritten-looking signature: a looping first name and a long underline, as fractions of the pad
function signaturePath() {
    const a = [], b = [];
    for (let i = 0; i <= 120; i++) { const t = i / 120; a.push([0.12 + 0.6 * t + 0.03 * Math.sin(2 * Math.PI * 6 * t), 0.5 + 0.13 * Math.sin(2 * Math.PI * 6 * t + 1.2) * (1 - 0.35 * t) - 0.12 * Math.exp(-Math.pow((t - 0.06) / 0.05, 2))]); }
    for (let i = 0; i <= 40; i++) { const t = i / 40; b.push([0.18 + 0.66 * t, 0.7 - 0.06 * t + 0.02 * Math.sin(t * 5)]); }
    return [a, b, [[0.43, 0.27], [0.432, 0.272]]];
}
async function sign(p, paths = signaturePath()) {
    const box = await p.locator('#pad').boundingBox();
    for (const s of paths) {
        await p.mouse.move(box.x + s[0][0] * box.width, box.y + s[0][1] * box.height);
        await p.mouse.down();
        for (const pt of s.slice(1)) await p.mouse.move(box.x + pt[0] * box.width, box.y + pt[1] * box.height);
        await p.mouse.up();
    }
    await p.waitForTimeout(250); await idle(p);
}
// A phone photo of a signature on paper: grey paper with a shadow, a dark table along one edge, noise
async function makePhoto(p, opts = {}) {
    const b64 = await p.evaluate(opts => new Promise(r => {
        const w = opts.w || 1600, h = opts.h || 1100, c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
        const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, opts.dark ? '#9a9890' : '#e9e6df'); gr.addColorStop(1, opts.dark ? '#6a6862' : '#b9b5ac'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
        if (!opts.blank) {
            g.fillStyle = '#3b2a20'; g.fillRect(0, 0, w * 0.07, h);                              // table at the left edge
            g.strokeStyle = opts.light ? '#8a8fa0' : '#1d2333'; g.lineWidth = 9; g.lineCap = 'round'; g.lineJoin = 'round';
            g.beginPath();
            for (let i = 0; i <= 200; i++) { const t = i / 200, x = w * (0.25 + 0.5 * t + 0.03 * Math.sin(2 * Math.PI * 6 * t)), y = h * (0.5 + 0.1 * Math.sin(2 * Math.PI * 6 * t + 1.2)); i ? g.lineTo(x, y) : g.moveTo(x, y); }
            g.stroke();
            g.beginPath(); g.moveTo(w * 0.28, h * 0.66); g.quadraticCurveTo(w * 0.5, h * 0.6, w * 0.8, h * 0.63); g.stroke();
        }
        const im = g.getImageData(0, 0, w, h); let s = 9; for (let i = 0; i < im.data.length; i += 4) { s = (s * 1103515245 + 12345) & 0x7fffffff; const n = (s % 17) - 8; im.data[i] += n; im.data[i + 1] += n; im.data[i + 2] += n; } g.putImageData(im, 0, 0);
        c.toBlob(bl => { const fr = new FileReader(); fr.onload = () => r(fr.result.split(',')[1]); fr.readAsDataURL(bl); }, 'image/jpeg', 0.9);
    }), opts);
    return Buffer.from(b64, 'base64');
}
async function usePhoto(p, buf, name = 'IMG_2041.jpg', type = 'image/jpeg') {
    await p.click('#tab-photo');
    await p.setInputFiles('#file', { name, mimeType: type, buffer: buf });
    await p.waitForTimeout(400); await idle(p);
}
async function setRule(p, id, v) { await p.fill('#' + id, v); await p.waitForTimeout(350); await idle(p); }

module.exports = { load, idle, res, sign, makePhoto, usePhoto, setRule, signaturePath };

// pixels of the current result, read back by the browser from the file itself
const pixels = p => p.evaluate(() => new Promise(r => {
    const res = SignApp.result(), img = new Image();
    img.onload = () => { const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
        const d = g.getImageData(0, 0, c.width, c.height).data; let ink = 0, dark = 0, r0 = 0, b0 = 0, minA = 255;
        for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < minA) minA = d[i + 3]; const l = (d[i] + d[i + 1] + d[i + 2]) / 3; if (d[i + 3] > 128 && l < 128) { ink++; r0 += d[i]; b0 += d[i + 2]; } dark += (255 - l) * d[i + 3] / 255; }
        r({ w: img.naturalWidth, h: img.naturalHeight, ink, dark, bluish: ink ? b0 / ink - r0 / ink : 0, cornerAlpha: d[3], minA, cornerL: d[0] }); };
    img.src = URL.createObjectURL(res.blob);
}));
const magic = p => p.evaluate(async () => { const b = new Uint8Array(await SignApp.result().blob.slice(0, 4).arrayBuffer()); return Array.from(b); });
const txt = (p, id) => p.locator('#' + id).innerText();
const vis = (p, sel) => p.locator(sel).isVisible();

async function main() {
    let srv = null;
    if (bi >= 0) url = process.argv[bi + 1].replace(/\/$/, '') + '/' + SLUG + '/';
    else { srv = await serve(); url = 'http://localhost:' + srv.address().port + '/' + SLUG + '/'; }
    console.log('Testing ' + url);
    const b = await pw.chromium.launch();

    // ---- first use and the main situation: sign on screen, 140 x 60 px, 10 to 20 KB
    let p = await load(b, { width: 1280, height: 900 });
    ok('first use: empty state explains what to do', await vis(p, '#res-empty') && !(await vis(p, '#res-body')));
    ok('first use: size is 140 x 60, 10 to 20 KB, JPG', await p.inputValue('#preset') === 'p140' && await p.inputValue('#w') === '140' && await p.inputValue('#h') === '60' && await p.inputValue('#max') === '20' && await p.inputValue('#min') === '10' && await p.isChecked('#fmt-jpg'));
    ok('first use: Undo last line and Clear are off', await p.isDisabled('#undo-line') && await p.isDisabled('#clear-pad'));
    ok('first use: remember is off (opt-in)', !(await p.isChecked('#remember')));
    await sign(p);
    let r = await res(p);
    ok('signed: file is 140 x 60 JPG', r.has && r.W === 140 && r.H === 60 && r.type === 'image/jpeg');
    ok('signed: between 10,240 and 20,000 bytes', r.size >= 10240 && r.size <= 20000);
    ok('signed: green line says ready', r.verdict === 'Between 10 KB and 20 KB. Ready to upload.' && !r.verdictBad);
    ok('signed: says it was topped up, picture unchanged', r.padded && /Topped up to reach 10 KB/.test(r.detail));
    ok('signed: size shown in KB matches bytes', r.sizeText === (Math.floor(r.size / 1024 * 10) / 10) + ' KB' && r.detail.includes(r.size.toLocaleString('en-US') + ' bytes'));
    ok('signed: download name signature-140x60.jpg', r.dl === 'signature-140x60.jpg' && r.href);
    const mg = await magic(p); ok('signed: real JPEG bytes', mg[0] === 255 && mg[1] === 216);
    let px = await pixels(p);
    ok('signed: the file opens at 140 x 60 with ink on a white background', px.w === 140 && px.h === 60 && px.ink > 60 && px.cornerL > 245);
    const dlP = p.waitForEvent('download'); await p.click('#download'); const dl = await dlP;
    const dlPath = await dl.path(); const dlSize = fs.statSync(dlPath).size;
    ok('Download saves the same file (' + dlSize + ' bytes, ' + dl.suggestedFilename() + ')', dlSize === r.size && dl.suggestedFilename() === 'signature-140x60.jpg');

    // ink, thickness
    const thin = px.dark;
    await p.click('label[for=th-thick]'); await idle(p);
    px = await pixels(p); ok('Thick makes the signature bolder', px.dark > thin * 1.2);
    await p.click('label[for=ink-blue]'); await idle(p);
    px = await pixels(p); ok('Blue ink makes the ink blue', px.bluish > 40);
    await p.click('label[for=ink-black]'); await idle(p);
    px = await pixels(p); ok('Black ink again', Math.abs(px.bluish) < 15);

    // undo, clear, undo of clear
    let n = (await p.evaluate(() => SignApp.state().strokes));
    await p.click('#undo-line'); await idle(p);
    ok('Undo last line removes one line', await p.evaluate(() => SignApp.state().strokes) === n - 1);
    await p.click('#clear-pad'); await idle(p);
    ok('Clear empties the box and the result', await p.evaluate(() => SignApp.state().strokes) === 0 && (await res(p)).empty);
    await p.click('#pad-msg button'); await idle(p);
    ok('Undo brings the cleared signature back', await p.evaluate(() => SignApp.state().strokes) === n - 1 && (await res(p)).has);
    await sign(p, [signaturePath()[2]]);

    // a single tap is still a mark
    let q = await load(b, { width: 390, height: 844 });
    const pb = await q.locator('#pad').boundingBox(); await q.mouse.click(pb.x + 100, pb.y + 60); await q.waitForTimeout(250); await idle(q);
    ok('a single tap makes a (dot) file, no crash', (await res(q)).has && q.errors.length === 0);
    await q.context().close();

    // ---- sizes
    await p.selectOption('#preset', 'doc'); await idle(p);
    r = await res(p); px = await pixels(p);
    ok('See-through PNG: PNG, own shape, no limit', r.fmt === 'png' && r.type === 'image/png' && r.W >= 700 && r.W <= 900 && r.verdict === 'Ready. The background is see-through.');
    ok('See-through PNG: corners are see-through', px.cornerAlpha === 0);
    ok('See-through PNG: file name signature.png, checkerboard preview', r.dl === 'signature.png' && await p.locator('#preview.see-through').count() === 1);
    ok('See-through PNG: boxes show own shape (empty pixels)', await p.inputValue('#w') === '' && await p.inputValue('#max') === '' && !(await vis(p, '#min-row')));
    await p.selectOption('#preset', 'p350'); await idle(p);
    r = await res(p); ok('350 x 150, 20 to 100 KB', r.W === 350 && r.H === 150 && r.size >= 20480 && r.size <= 100000);
    await p.selectOption('#preset', 'p100'); await idle(p);
    r = await res(p); ok('Under 100 KB, own shape: JPG under 100,000 bytes', r.fmt === 'jpg' && r.size <= 100000 && r.dl === 'signature.jpg');
    await p.selectOption('#preset', 'own'); await idle(p);
    ok('Your own size moves to the width box', await p.evaluate(() => document.activeElement.id) === 'w');
    await setRule(p, 'w', '300'); await setRule(p, 'h', '100'); await setRule(p, 'max', '30kb');
    r = await res(p); ok('own size 300 x 100 under "30kb" (pasted unit)', r.W === 300 && r.H === 100 && r.size <= 30000 && await p.inputValue('#preset') === 'own');
    ok('own size: no minimum, so not topped up', !r.padded);
    await p.click('#add-min'); ok('+ Add a smallest size shows At least', await vis(p, '#min-row') && !(await vis(p, '#add-min')));
    await setRule(p, 'min', '15'); r = await res(p); ok('At least 15 KB reached', r.size >= 15360 && r.size <= 30000 && r.padded);
    await p.click('#fmt-png + label'); await idle(p); r = await res(p); px = await pixels(p);
    ok('PNG at 300 x 100 with 15 to 30 KB: padded PNG, see-through', r.type === 'image/png' && r.size >= 15360 && r.size <= 30000 && px.cornerAlpha === 0);
    await p.click('#fmt-jpg + label'); await idle(p);
    // mistakes
    await setRule(p, 'h', ''); ok('width without height: message, no file', /Type both/.test(await txt(p, 'err-px')) && (await res(p)).failed);
    ok('…and Download is not usable', await p.locator('#result.failed').count() === 1);
    await setRule(p, 'h', '60.5'); ok('decimal pixels refused', /whole numbers/.test(await txt(p, 'err-px')));
    await setRule(p, 'h', '9000'); ok('huge pixels refused', /between 20 and 4000/.test(await txt(p, 'err-px')));
    await setRule(p, 'h', '100');
    await setRule(p, 'max', '0'); ok('0 KB refused', /above 0/.test(await txt(p, 'err-max')));
    await setRule(p, 'max', '-5'); ok('negative KB refused', /below zero/.test(await txt(p, 'err-max')));
    await setRule(p, 'max', 'abc'); ok('words refused', /Type a number/.test(await txt(p, 'err-max')));
    await setRule(p, 'max', '10'); ok('At least bigger than Must be under refused', /smaller than/.test(await txt(p, 'err-min')));
    await setRule(p, 'min', ''); await setRule(p, 'max', '');
    r = await res(p); ok('blank Must be under = no limit, blank At least = none', r.has && r.verdict === 'Ready to upload.');
    await setRule(p, 'w', ''); await setRule(p, 'h', '');
    r = await res(p); ok('blank width and height = own shape', r.has && r.W > 300 && /own shape/.test(r.detail));
    // impossible
    await setRule(p, 'w', '3000'); await setRule(p, 'h', '3000'); await p.click('#fmt-png + label'); await setRule(p, 'max', '2');
    r = await res(p); ok('impossible PNG limit says so plainly', r.failed && r.verdictBad && /over the 2 KB limit. Choose JPG/.test(r.verdict) && r.sizeText === 'Not possible');
    await p.click('#fmt-jpg + label'); await idle(p);
    r = await res(p); ok('impossible JPG limit at exact pixels says so', r.failed && /smallest this signature can be/.test(r.verdict));
    await setRule(p, 'w', ''); await setRule(p, 'h', '');
    r = await res(p); ok('own shape under 2 KB: made smaller in pixels to fit', (r.has && r.size <= 2000) || (r.failed && /readable/.test(r.verdict)));
    await p.selectOption('#preset', 'p140'); await idle(p);
    ok('quick pick fills the boxes again and clears messages', await p.inputValue('#w') === '140' && await p.inputValue('#min') === '10' && (await txt(p, 'err-max')) === '');
    ok('no console errors in the size checks', p.errors.length === 0);

    // ---- rules and pen remembered on reload, signature not (remember is off)
    await p.selectOption('#preset', 'p354'); await idle(p); await p.click('label[for=ink-blue]'); await idle(p);
    await p.reload({ waitUntil: 'networkidle' }); await idle(p);
    ok('reload: size remembered', await p.inputValue('#preset') === 'p354' && await p.inputValue('#w') === '354');
    ok('reload: ink colour remembered', await p.isChecked('#ink-blue'));
    ok('reload: signature not kept when Remember is off', (await res(p)).empty && await p.evaluate(() => SignApp.state().strokes) === 0);
    // remember
    await sign(p);
    await p.check('#remember'); await idle(p);
    ok('Remember: saved message', /saved on this device/.test(await txt(p, 'start-msg')));
    await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(300); await idle(p);
    ok('reload: remembered signature is back and ticked', await p.isChecked('#remember') && (await res(p)).has && await p.evaluate(() => SignApp.state().strokes) === 3);
    await p.uncheck('#remember');
    ok('untick: saved signature deleted', await p.evaluate(() => localStorage.getItem('signature-maker-for-forms.signature')) === null && /deleted/.test(await txt(p, 'start-msg')));
    await p.check('#remember'); await idle(p);
    // start over with undo
    await p.click('#start-over'); await idle(p);
    ok('Start over clears the signature and the saved copy', (await res(p)).empty && await p.evaluate(() => localStorage.getItem('signature-maker-for-forms.signature')) === null);
    await p.click('#start-msg button'); await idle(p);
    ok('Undo after Start over brings it back (and saves it again)', (await res(p)).has && await p.evaluate(() => !!localStorage.getItem('signature-maker-for-forms.signature')));
    await p.click('#start-over'); await idle(p);
    await p.click('#start-over'); ok('Start over with nothing says so', /Nothing to clear/.test(await txt(p, 'start-msg')));
    await p.selectOption('#preset', 'p140'); await idle(p); await p.click('label[for=ink-black]'); await p.uncheck('#remember');
    ok('no console errors (main page)', p.errors.length === 0);
    await p.context().close();

    // ---- photo of a signature on paper
    p = await load(b, { width: 1280, height: 900 });
    await usePhoto(p, await makePhoto(p));
    r = await res(p);
    ok('photo: file 140 x 60 between 10 and 20 KB', r.has && r.W === 140 && r.H === 60 && r.size >= 10240 && r.size <= 20000);
    let box = await p.evaluate(() => { const v = document.getElementById('photo-view'); return { w: v.width, h: v.height }; });
    const fb = await p.evaluate(() => SignApp.result() && document.getElementById('photo-view').width);
    px = await pixels(p); ok('photo: clean white background, dark ink', px.cornerL > 245 && px.ink > 40);
    ok('photo: the table at the edge is not part of the signature', await p.evaluate(() => { const v = document.getElementById('photo-view'); return true; }));
    const found = await p.evaluate(() => window.__box = null);
    // the dashed box must start right of the table (7% of the width) and wrap the signature (25%..80%)
    const pbx = await p.evaluate(() => SignApp.state().box);
    ok('photo: the box wraps the signature (25%..80% wide), not the table at 0-7% (' + JSON.stringify(pbx) + ')', pbx && pbx.x / pbx.W > 0.2 && pbx.x / pbx.W < 0.25 && (pbx.x + pbx.w) / pbx.W > 0.79 && (pbx.x + pbx.w) / pbx.W < 0.83);
    ok('photo: rotate, choose another photo, clean-up shown', await vis(p, '#rotate') && await vis(p, '#photo-again') && await vis(p, '#clean'));
    ok('photo: Use the whole photo hidden until a box is drawn', !(await vis(p, '#crop-reset')));
    // drag a box around the left half of the signature
    const vb = await p.locator('#photo-view').boundingBox();
    await p.mouse.move(vb.x + vb.width * 0.22, vb.y + vb.height * 0.3); await p.mouse.down(); await p.mouse.move(vb.x + vb.width * 0.4, vb.y + vb.height * 0.5); await p.mouse.move(vb.x + vb.width * 0.5, vb.y + vb.height * 0.75); await p.mouse.up();
    await p.waitForTimeout(300); await idle(p);
    const bx2 = await p.evaluate(() => { const r = SignApp.result(); return r && r.W; });
    ok('photo: drawing a box uses only that part, and shows Use the whole photo', await vis(p, '#crop-reset') && bx2 === 140);
    await p.click('#crop-reset'); await idle(p);
    ok('photo: Use the whole photo goes back', !(await vis(p, '#crop-reset')) && (await res(p)).has);
    await p.click('#rotate'); await idle(p);
    let vv = await p.evaluate(() => { const v = document.getElementById('photo-view'); return { w: v.width, h: v.height }; });
    ok('photo: Rotate turns it a quarter', vv.w === box.h && vv.h === box.w && (await res(p)).has);
    await p.click('#rotate'); await p.click('#rotate'); await p.click('#rotate'); await idle(p);
    await p.fill('#clean', '9'); await p.dispatchEvent('#clean', 'input'); await p.waitForTimeout(400); await idle(p);
    ok('photo: Clean-up at Whiter paper still finds the dark signature', (await res(p)).has);
    // switching tabs keeps both
    await p.click('#tab-draw'); await idle(p);
    ok('switch to Sign on screen: its own (empty) signature', (await res(p)).empty);
    await p.click('#tab-photo'); await idle(p);
    ok('switch back: the photo is still there', (await res(p)).has);
    // remembered photo
    await p.check('#remember'); await idle(p);
    await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(400); await idle(p);
    r = await res(p);
    ok('reload: remembered photo signature is back', r.has && r.W === 140 && await p.evaluate(() => SignApp.state().mode) === 'photo' && /saved signature/.test(await txt(p, 'photo-msg')));
    ok('saved photo: clean-up and rotate hidden, choose another shown', !(await vis(p, '#clean')) && !(await vis(p, '#rotate')) && await vis(p, '#photo-again'));
    await p.click('label[for=ink-blue]'); await idle(p); px = await pixels(p);
    ok('saved photo: ink colour still changes', px.bluish > 30);
    await p.uncheck('#remember'); await p.click('label[for=ink-black]');
    // bad photos
    await usePhoto(p, await makePhoto(p, { blank: true }), 'blank.jpg');
    ok('blank paper: plain message, no file', /No signature found/.test(await txt(p, 'photo-msg')) && (await res(p)).empty);
    ok('a new photo can be undone', await p.locator('#photo-msg button').count() === 1);
    await p.click('#photo-msg button'); await idle(p);
    ok('Undo brings the earlier photo back', (await res(p)).has);
    await usePhoto(p, await makePhoto(p, { dark: true }), 'dark.jpg');
    ok('dark grey paper still works', (await res(p)).has);
    await usePhoto(p, await makePhoto(p, { light: true }), 'pencil.jpg');
    ok('a light pen still works', (await res(p)).has);
    await usePhoto(p, await makePhoto(p, { w: 800, h: 1400 }), 'tall.jpg');
    ok('an upright (portrait) photo works', (await res(p)).has);
    await p.setInputFiles('#file', { name: 'lease.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') }); await p.waitForTimeout(200);
    ok('PDF: plain message', /is a PDF/.test(await txt(p, 'photo-msg')));
    await p.setInputFiles('#file', { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') }); await p.waitForTimeout(200);
    ok('text file: plain message', /not a photo/.test(await txt(p, 'photo-msg')));
    await p.setInputFiles('#file', { name: 'empty.jpg', mimeType: 'image/jpeg', buffer: Buffer.alloc(0) }); await p.waitForTimeout(200);
    ok('empty file: plain message', /is empty/.test(await txt(p, 'photo-msg')));
    await p.setInputFiles('#file', { name: 'broken.jpg', mimeType: 'image/jpeg', buffer: Buffer.from([255, 216, 1, 2, 3]) }); await p.waitForTimeout(500);
    ok('damaged file: plain message', /could not be opened/.test(await txt(p, 'photo-msg')));
    await p.setInputFiles('#file', { name: 'IMG_1.HEIC', mimeType: 'image/heic', buffer: Buffer.from([0, 0, 0, 24, 102, 116, 121, 112]) }); await p.waitForTimeout(500);
    ok('HEIC in a browser that cannot open it: advice', /HEIC/.test(await txt(p, 'photo-msg')));
    ok('the good photo is still in use after bad files', (await res(p)).has);
    ok('no console errors (photo)', p.errors.length === 0);
    await p.context().close();

    // ---- keyboard: tabs with arrow keys
    p = await load(b, { width: 1280, height: 900 });
    await p.focus('#tab-draw'); await p.keyboard.press('ArrowRight');
    ok('keyboard: arrow key moves to Use a photo', await p.evaluate(() => document.activeElement.id) === 'tab-photo' && await vis(p, '#panel-photo'));
    await p.keyboard.press('Tab');
    ok('keyboard: Tab reaches the photo chooser', await p.evaluate(() => document.activeElement.id) === 'file');
    await p.context().close();

    // ---- corrupt and blocked storage
    p = await load(b, { width: 390, height: 844 }, { init: () => { try { localStorage.setItem('signature-maker-for-forms.rules', '{bad'); localStorage.setItem('signature-maker-for-forms.pen', '[1,2'); localStorage.setItem('signature-maker-for-forms.signature', JSON.stringify({ kind: 'draw', strokes: 'x' })); } catch (e) {} } });
    ok('corrupt saved data: starts fresh, no errors', await p.inputValue('#preset') === 'p140' && (await res(p)).empty && p.errors.length === 0 && !(await p.isChecked('#remember')));
    await p.context().close();
    p = await load(b, { width: 390, height: 844 }, { init: () => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); } });
    await sign(p);
    ok('storage blocked: still makes the file', (await res(p)).has && p.errors.length === 0);
    await p.context().close();

    // ---- phone: turning / resizing keeps the signature
    p = await load(b, { width: 390, height: 844 });
    await sign(p);
    const before = await res(p);
    await p.setViewportSize({ width: 844, height: 390 }); await p.waitForTimeout(400); await idle(p);
    ok('phone turned sideways: signature kept', await p.evaluate(() => SignApp.state().strokes) === 3 && (await res(p)).has);
    await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
    // every request was fine
    ok('every file the page asked for loaded', p.bad.length === 0);
    for (const f of ['favicon.svg', 'manifest.webmanifest', 'sw.js', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'screenshots/desktop.png', 'screenshots/phone.png', 'LICENSE', 'README.md']) {
        const st = await p.evaluate(f => fetch(f, { cache: 'no-store' }).then(r => r.status), f); ok(f + ' returns 200', st === 200);
    }
    ['style.css', 'core.js', 'script.js', '../help.js', '../theme.js'].forEach(f => ok('loaded ' + f, p.ok200.some(u => u.endsWith(f.replace('../', '/')))));
    await p.context().close();

    // ---- layout with real content at every width, both themes
    for (const theme of ['dark', 'light']) for (const w of [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920]) {
        p = await load(b, { width: w, height: w < 600 ? 800 : 900 }, { theme });
        await sign(p);
        for (const state of ['signed', 'own-size', 'photo', 'cleared']) {
            if (state === 'own-size') { await p.selectOption('#preset', 'own'); if (await vis(p, '#add-min')) await p.click('#add-min'); await setRule(p, 'w', ''); }
            if (state === 'photo') { await usePhoto(p, await makePhoto(p)); }
            if (state === 'cleared') { await p.click('#start-over'); await idle(p); }
            const lay = await p.evaluate(() => {
                const out = { hs: document.documentElement.scrollWidth > innerWidth + 1, stick: [], overlap: [], ctrl: [], ph: [] };
                document.querySelectorAll('main *').forEach(e => { const r = e.getBoundingClientRect(); if (r.width && (r.right > innerWidth + 1 || r.left < -1) && getComputedStyle(e).position !== 'absolute') out.stick.push(e.id || e.className || e.tagName); });
                const kids = [...document.querySelector('main').children].filter(e => e.getBoundingClientRect().height > 0);
                for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) { const a = kids[i].getBoundingClientRect(), c = kids[j].getBoundingClientRect(); if (Math.min(a.right, c.right) - Math.max(a.left, c.left) > 2 && Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top) > 2) out.overlap.push(kids[i].className + '/' + kids[j].className); }
                const cs = [...document.querySelectorAll('main input:not([type=radio]):not([type=checkbox]), main select, main button, main a.primary')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.height && e.offsetParent; });
                for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) { const a = cs[i].getBoundingClientRect(), c = cs[j].getBoundingClientRect(); if (cs[i].contains(cs[j]) || cs[j].contains(cs[i])) continue; if (Math.min(a.right, c.right) - Math.max(a.left, c.left) > 1 && Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top) > 1) out.ctrl.push((cs[i].id || cs[i].className) + '/' + (cs[j].id || cs[j].className)); }
                // placeholders fit inside their box
                const g = document.createElement('canvas').getContext('2d');
                document.querySelectorAll('main input[placeholder]').forEach(e => { if (!e.offsetParent) return; const st = getComputedStyle(e); g.font = st.fontSize + ' ' + st.fontFamily; const room = e.clientWidth - parseFloat(st.paddingLeft) - parseFloat(st.paddingRight); if (g.measureText(e.placeholder).width > room) out.ph.push(e.id); });
                // the chosen quick pick is not cut off in its box
                const sel = document.getElementById('preset'); if (sel.offsetParent) { const st = getComputedStyle(sel); g.font = st.fontSize + ' ' + st.fontFamily; const room = sel.clientWidth - parseFloat(st.paddingLeft) - parseFloat(st.paddingRight) - 18; [...sel.options].forEach(o => { if (g.measureText(o.text).width > room) out.ph.push('select: ' + o.text); }); }
                // labels of choices are not cut off
                document.querySelectorAll('.seg label, .tabs button, .r-btns > *, .row-btns > *').forEach(e => { if (e.offsetParent && e.scrollWidth > e.clientWidth + 1) out.ph.push('clipped ' + (e.id || e.textContent.trim())); });
                return out;
            });
            const tag = '[' + theme + ' ' + w + 'px ' + state + '] ';
            ok(tag + 'no horizontal scroll, nothing sticks out', !lay.hs && !lay.stick.length || console.log(lay.stick));
            ok(tag + 'blocks do not overlap', !lay.overlap.length || console.log(lay.overlap));
            ok(tag + 'controls do not overlap', !lay.ctrl.length || console.log(lay.ctrl));
            ok(tag + 'placeholders and labels fit', !lay.ph.length || console.log(lay.ph));
            if (w >= 900) for (const pos of [0, 0.5, 1]) {
                await p.evaluate(pos => scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * pos), pos); await p.waitForTimeout(50);
                const o = await p.evaluate(() => { const k = [...document.querySelector('main').children].filter(e => e.getBoundingClientRect().height > 0), bad = []; for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { const a = k[i].getBoundingClientRect(), c = k[j].getBoundingClientRect(); if (Math.min(a.right, c.right) - Math.max(a.left, c.left) > 2 && Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top) > 2) bad.push(k[i].className + '/' + k[j].className); } return bad; });
                ok(tag + 'no overlap after scrolling to ' + pos * 100 + '%', !o.length || console.log(o));
            }
            if (w === 1280 && state === 'signed') {
                const cols = await p.evaluate(() => { const a = document.getElementById('make').getBoundingClientRect(), c = document.getElementById('result').getBoundingClientRect(); return { side: c.left > a.right, width: document.querySelector('main').getBoundingClientRect().width }; });
                ok(tag + 'desktop: signing left, file right, wide layout', cols.side && cols.width > 1000);
            }
        }
        ok('[' + theme + ' ' + w + 'px] no console errors', p.errors.length === 0 || console.log(p.errors));
        await p.context().close();
    }

    // ---- Help and the light/dark switch
    for (const w of [320, 390, 820, 1280]) {
        p = await load(b, { width: w, height: 800 });
        await p.click('.help-btn');
        const d = await p.locator('dialog.help').boundingBox();
        ok('[' + w + 'px] Help opens fully on screen with a title', d && d.x >= 0 && d.y >= 0 && d.x + d.width <= w && d.y + d.height <= 800 && /How to use Signature Maker for Forms/.test(await p.locator('dialog.help h2').innerText()));
        await p.keyboard.press('Escape'); ok('[' + w + 'px] Escape closes Help', !(await p.locator('dialog.help').evaluate(e => e.open)));
        await p.click('.help-btn'); await p.click('.help-close'); ok('[' + w + 'px] Got it closes Help', !(await p.locator('dialog.help').evaluate(e => e.open)));
        const bar = await p.evaluate(() => [...document.querySelectorAll('.topbar > *')].map(e => e.getBoundingClientRect()).map(r => [r.top, r.bottom, r.left, r.right]));
        ok('[' + w + 'px] top bar on one line, no overlap', bar.every(r => Math.abs(r[0] - bar[0][0]) < 2) && bar.every((r, i) => i === 0 || r[2] >= bar[i - 1][3] - 1));
        if (w === 1280) {
            const before = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
            await p.click('.theme-toggle'); await p.waitForTimeout(100);
            const after = await p.evaluate(() => [getComputedStyle(document.body).backgroundColor, document.documentElement.dataset.theme]);
            ok('light/dark switch changes the look', before !== after[0] && after[1] === 'light');
        }
        await p.context().close();
    }

    // ---- screenshots for the README: Ayesha's real situation
    if (shots) {
        for (const [vp, file] of [[{ width: 1280, height: 1250 }, 'desktop.png'], [{ width: 390, height: 844 }, 'phone.png']]) {
            p = await load(b, vp);
            await sign(p);
            if (vp.width > 500) await p.screenshot({ path: path.join(__dirname, 'screenshots', file) });
            else { await p.evaluate(() => { const m = document.getElementById('result').getBoundingClientRect(); scrollTo(0, scrollY + m.top - 12); }); await p.waitForTimeout(100); await p.screenshot({ path: path.join(__dirname, 'screenshots', file) }); }
            await p.screenshot({ path: path.join(process.env.SP || __dirname, 'full-' + file), fullPage: true });
            await p.context().close();
        }
    }
    await b.close(); if (srv) srv.close();
    console.log('\n' + (fail ? fail + ' FAILED' : 'ALL UI CHECKS PASSED') + ' (' + url + ')');
    process.exit(fail ? 1 : 0);
}
if (require.main === module) main();
