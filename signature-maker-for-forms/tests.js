// Checks for core.js. Run with: node tests.js   (or open test.html in a browser)
(function (root) {
    async function runTests(C) {
        const r = [], check = (name, ok) => r.push({ name, ok: !!ok });

        // reading what people type
        check('KB 20', C.parseKB('20').kb === 20);
        check('KB blank = no rule', C.parseKB('  ').kb === 0);
        check('KB zero refused (leave empty for none)', C.parseKB('0').err === 'zero');
        check('KB pasted "20kb"', C.parseKB('20kb').kb === 20);
        check('KB "1.5 MB" = 1500', C.parseKB('1.5 MB').kb === 1500);
        check('KB comma decimal "12,5"', C.parseKB('12,5').kb === 12.5);
        check('KB negative', C.parseKB('-5').err === 'negative');
        check('KB words', C.parseKB('twenty').err === 'nan');
        check('KB too small (1)', C.parseKB('1').err === 'small');
        check('KB too big (11 MB)', C.parseKB('11mb').err === 'big');
        check('KB px refused', C.parseKB('140px').err === 'nan');
        check('pixels 140 x 60', C.parsePixels('140', ' 60px ').w === 140 && C.parsePixels('140', '60').h === 60);
        check('pixels both blank = own shape', C.parsePixels('', '').w === 0);
        check('pixels one missing', C.parsePixels('140', '').err === 'one');
        check('pixels decimal', C.parsePixels('140.5', '60').err === 'nan');
        check('pixels negative', C.parsePixels('-140', '60').err === 'nan');
        check('pixels out of range', C.parsePixels('10', '60').err === 'range' && C.parsePixels('5000', '60').err === 'range');

        // all the boxes together
        const ok = C.readRules({ fmt: 'jpg', w: '140', h: '60', max: '20', min: '10' }).rules;
        check('rules 140x60 10-20 JPG', ok && ok.w === 140 && ok.h === 60 && ok.minKB === 10 && ok.maxKB === 20 && ok.fmt === 'jpg');
        check('that is the first quick pick', C.presetFor(ok) === 'p140');
        check('typed own size = own', C.presetFor({ fmt: 'jpg', w: 200, h: 80, minKB: 0, maxKB: 30 }) === 'own');
        check('min bigger than max refused', !!C.readRules({ fmt: 'jpg', w: '', h: '', max: '20', min: '30' }).errs.min);
        check('min too close to max refused (18 and 20)', !!C.readRules({ fmt: 'jpg', w: '', h: '', max: '20', min: '18' }).errs.min);
        check('min with no max is fine', C.readRules({ fmt: 'png', w: '', h: '', max: '', min: '10' }).rules.minKB === 10);
        check('several errors at once', (e => e.px && e.max)(C.readRules({ fmt: 'jpg', w: '140', h: '', max: 'abc', min: '' }).errs));
        check('unknown fmt becomes jpg', C.readRules({ fmt: 'gif', w: '', h: '', max: '', min: '' }).rules.fmt === 'jpg');

        // saved rules
        check('saved rules: nothing = defaults', C.cleanRules(null).w === 140 && C.cleanRules(null).preset === 'p140');
        check('saved rules: junk = defaults', C.cleanRules({ w: 'x', h: -1, maxKB: 'a', minKB: 1e9, fmt: 'exe' }).maxKB === 20 && C.cleanRules({ fmt: 'exe' }).fmt === 'jpg');
        check('saved rules: document PNG kept', C.cleanRules({ fmt: 'png', w: 0, h: 0, maxKB: 0, minKB: 0 }).preset === 'doc');
        check('saved rules: min that no longer fits dropped', C.cleanRules({ fmt: 'jpg', w: 140, h: 60, maxKB: 20, minKB: 19 }).minKB === 0);

        // bytes: under = 1000s, at least = 1024s
        check('under 20 KB = 20,000 bytes', C.maxBytes(20) === 20000);
        check('at least 10 KB = 10,240 bytes', C.minBytes(10) === 10240);
        check('pad target 10-20 KB = 10,440 bytes', C.padTarget(10, 20) === 10440);
        check('pad target never above the limit', C.padTarget(10, 10.4) === 10396);
        check('pad target with no limit', C.padTarget(10, 0) === 10440);
        check('fmtSize', C.fmtSize(812) === '812 bytes' && C.fmtSize(14540) === '14.1 KB' && C.fmtSize(20000) === '19.5 KB' && C.fmtSize(1572864) === '1.5 MB');
        check('kbLabel', C.kbLabel(20) === '20 KB' && C.kbLabel(1000) === '1 MB' && C.kbLabel(12.5) === '12.5 KB');

        // placing the signature
        const f = C.fitBox(100, 50, 140, 60);
        check('fit 100x50 into 140x60: margin 4, scale 1.04, centred', Math.abs(f.s - 1.04) < 1e-9 && Math.abs(f.dx - 18) < 1e-9 && Math.abs(f.dy - 4) < 1e-9);
        const tall = C.fitBox(50, 100, 140, 60);
        check('a tall signature is not stretched (scale 0.52)', Math.abs(tall.s - 0.52) < 1e-9 && Math.abs(tall.dx - 57) < 1e-9);
        const k = C.keepSize(400, 100);
        check('own shape 4:1 = 832 x 232', k.W === 832 && k.H === 232);
        const k2 = C.keepSize(100, 300, 800, 450);
        check('own shape tall photo capped at 450', k2.H === 450 + 2 * 12 && k2.W === 150 + 24);
        check('own shape of a straight line is still openable', C.keepSize(1000, 1).H >= C.PX_MIN);
        check('strokes box with pen width', (b => Math.abs(b.x - 0.095) < 1e-9 && Math.abs(b.w - 0.31) < 1e-9)(C.strokesBox([[[0.1, 0.2], [0.4, 0.3]]], 0.01)));
        check('strokes box of nothing', C.strokesBox([], 0.01) === null);
        check('one tap still has a box', C.strokesBox([[[0.5, 0.5]]], 0.007).w > 0);
        check('line never thinner than the minimum', C.lineWidth('medium', 50) === 1.5 && C.lineWidth('thick', 1000) === 11);
        check('saved strokes cleaned', (s => s.length === 1 && s[0].length === 2)(C.cleanStrokes([[[0.1, 0.1], ['a', 1], [0.2, 0.2], [NaN, 1]], 'x', [], [[1e9, 1]]])));
        check('saved strokes: not a list', C.cleanStrokes('junk').length === 0 && C.cleanStrokes(null).length === 0);

        // cleaning a photo: grey paper with a shadow, a signature, a dark table at the left edge, specks
        const w = 300, h = 160, L = new Float32Array(w * h);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) L[y * w + x] = 200 - x * 0.25;           // paper darkens to the right (a shadow)
        for (let y = 0; y < h; y++) for (let x = 0; x < 20; x++) L[y * w + x] = 40;                       // a dark table on the left edge
        for (let x = 80; x < 220; x++) { const y = Math.round(80 + 20 * Math.sin(x / 12)); for (let d = -2; d <= 2; d++) L[(y + d) * w + x] = 60; } // the signature
        for (let d = 0; d < 9; d++) L[(50 + (d / 3 | 0)) * w + 150 + d % 3] = 60;                          // the dot of an i, near it
        for (let d = 0; d < 9; d++) L[(140 + (d / 3 | 0)) * w + 270 + d % 3] = 60;                         // a speck far away
        const bg = C.background(L, w, h);
        check('paper brightness found under the ink', Math.abs(bg[80 * w + 150] - (200 - 150 * 0.25)) < 12);
        const a = C.inkAmounts(L, bg, 5);
        check('ink is ink', a[Math.round(80 + 20 * Math.sin(150 / 12)) * w + 150] === 1);
        check('shadowed paper is paper', a[20 * w + 280] === 0);
        check('clean-up: whiter paper drops faint ink', C.inkAmounts(new Float32Array([170]), new Float32Array([200]), 9)[0] === 0 && C.inkAmounts(new Float32Array([170]), new Float32Array([200]), 1)[0] > 0);
        const found = C.findSignature(a, w, h);
        check('signature found', !!found);
        check('box wraps the signature, not the table', found && found.box.x >= 75 && found.box.x <= 80 && found.box.x + found.box.w >= 219 && found.box.x + found.box.w <= 224);
        check('the dot of the i is kept', found && found.keep[51 * w + 151] === 1);
        check('the far speck is dropped', found && found.keep[141 * w + 271] === 0);
        check('the table at the edge is dropped', found && found.keep[80 * w + 5] === 0);
        const cropped = C.findSignature(a, w, h, { x: 140, y: 40, w: 100, h: 90 });
        check('a box drawn by hand limits the search', cropped && cropped.box.x >= 138 && cropped.box.x + cropped.box.w <= 242);
        check('blank paper: nothing found', C.findSignature(new Float32Array(w * h), w, h) === null);
        const edgeOnly = new Float32Array(50 * 20); for (let x = 0; x < 50; x++) edgeOnly[10 * 50 + x] = 1;
        check('a signature cropped tightly to the edges is still found', !!C.findSignature(edgeOnly, 50, 20));
        check('ink boost for small files', C.inkBoost(0.2) === 1.8 && C.inkBoost(0.5) === 1.35 && C.inkBoost(1) === 1);

        // the size search, with a pretend encoder: bytes = 60000 * quality * scale^2
        const enc = (scale, q) => Promise.resolve({ size: Math.round(60000 * q * scale * scale), scale, q });
        let s = await C.fitToLimit(enc, { fmt: 'jpg', maxBytes: 100000, fixed: true });
        check('fits at top quality straight away', s.ok && s.q === C.TOP_Q && s.scale === 1);
        s = await C.fitToLimit(enc, { fmt: 'jpg', maxBytes: 30000, fixed: true });
        check('lowers the quality to fit, keeps it as high as it can', s.ok && s.res.size <= 30000 && s.res.size > 27000 && s.scale === 1);
        s = await C.fitToLimit(enc, { fmt: 'jpg', maxBytes: 5000, fixed: true });
        check('exact pixels that cannot fit: says so with the smallest', !s.ok && s.smallest.size === 18000);
        s = await C.fitToLimit(enc, { fmt: 'jpg', maxBytes: 5000, fixed: false, long: 800 });
        check('own shape: makes it smaller in pixels to fit', s.ok && s.scale < 1 && s.res.size <= 5000);
        s = await C.fitToLimit(enc, { fmt: 'jpg', maxBytes: 20, fixed: false, long: 800 });
        check('own shape, impossible limit: stops at a readable size', !s.ok);
        s = await C.fitToLimit(enc, { fmt: 'png', maxBytes: 0, fixed: false });
        check('PNG with no limit', s.ok && s.res.size === 60000);
        s = await C.fitToLimit(enc, { fmt: 'png', maxBytes: 30000, fixed: true });
        check('PNG over the limit at exact pixels: says so', !s.ok);

        // padding up to a minimum
        const jpg = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0, 4, 1, 2, 0xFF, 0xD9]);
        const pj = C.padJpeg(jpg, 10440);
        check('JPEG padded to exactly 10,440 bytes', pj.length === 10440);
        check('JPEG still starts and ends right, picture bytes unchanged', pj[0] === 0xFF && pj[1] === 0xD8 && pj[2] === 0xFF && pj[3] === 0xFE && pj[pj.length - 1] === 0xD9 && pj[pj.length - 2] === 0xFF);
        check('JPEG padded past 64 KB uses several blocks', (p => p.length === 150000 && p[2] === 0xFF && p[3] === 0xFE && p[2 + 65537] === 0xFF && p[3 + 65537] === 0xFE)(C.padJpeg(jpg, 150000)));
        check('JPEG already big enough is left alone', C.padJpeg(jpg, 5) === jpg);
        check('not a JPEG is left alone', C.padJpeg(new Uint8Array([1, 2, 3]), 100).length === 3);
        // a real 1x1 PNG
        const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84, 120, 156, 99, 248, 15, 4, 0, 9, 251, 3, 253, 227, 85, 242, 156, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]);
        check('crc32 of IHDR matches the PNG', C.crc32(png, 12, 29) === ((31 << 24 >>> 0) + (21 << 16) + (196 << 8) + 137));
        const pp = C.padPng(png, 10440);
        check('PNG padded to 10,440 bytes', pp.length === 10440);
        const tl = pp.length - 12 - (10440 - png.length);
        check('PNG text block is valid (length, type, check) and IEND is last', (() => {
            const len = (pp[tl] << 24 >>> 0) + (pp[tl + 1] << 16) + (pp[tl + 2] << 8) + pp[tl + 3];
            const type = String.fromCharCode(pp[tl + 4], pp[tl + 5], pp[tl + 6], pp[tl + 7]);
            const crc = ((pp[tl + 8 + len] << 24) >>> 0) + (pp[tl + 9 + len] << 16) + (pp[tl + 10 + len] << 8) + pp[tl + 11 + len];
            const end = String.fromCharCode(pp[pp.length - 8], pp[pp.length - 7], pp[pp.length - 6], pp[pp.length - 5]);
            return type === 'tEXt' && crc === C.crc32(pp, tl + 4, tl + 8 + len) && end === 'IEND';
        })());
        check('not a PNG is left alone', C.padPng(jpg, 1000) === jpg);

        // words
        check('verdict between', C.verdict({ fmt: 'jpg', minKB: 10, maxKB: 20 }) === 'Between 10 KB and 20 KB. Ready to upload.');
        check('verdict under', C.verdict({ fmt: 'jpg', minKB: 0, maxKB: 100 }) === 'Under 100 KB. Ready to upload.');
        check('verdict see-through', C.verdict({ fmt: 'png', minKB: 0, maxKB: 0 }) === 'Ready. The background is see-through.');
        check('file names', C.outName('jpg', 140, 60, true) === 'signature-140x60.jpg' && C.outName('png', 832, 232, false) === 'signature.png');
        check('file kinds', C.kindOf('a.HEIC', '', 5) === 'heic' && C.kindOf('a.pdf', 'application/pdf', 5) === 'pdf' && C.kindOf('a.txt', 'text/plain', 5) === 'other' && C.kindOf('a.jpg', 'image/jpeg', 0) === 'empty' && C.kindOf('a.jpg', 'image/jpeg', 5) === 'image');
        return r;
    }
    if (typeof module === 'object' && module.exports) {
        runTests(require('./core.js')).then(r => {
            r.forEach(t => console.log((t.ok ? 'PASS ' : 'FAIL ') + t.name));
            const bad = r.filter(t => !t.ok).length;
            console.log('\n' + (r.length - bad) + ' of ' + r.length + ' checks passed');
            process.exit(bad ? 1 : 0);
        });
    } else root.runTests = runTests;
})(this);
