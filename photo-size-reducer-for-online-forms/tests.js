// Checks for core.js. Run with: node tests.js   (or open test.html in a browser)
(function (root) {
    async function runTests(C) {
        const r = [], check = (name, ok) => r.push({ name, ok: !!ok });

        // reading what people type
        check('limit 100 KB', C.parseLimit('100', 'KB').kb === 100);
        check('limit 1.5 MB = 1500 KB', C.parseLimit('1.5', 'MB').kb === 1500);
        check('limit typed with unit wins: "200kb" in MB box', C.parseLimit('200kb', 'MB').kb === 200);
        check('limit "2 MB" pasted', C.parseLimit(' 2 MB ', 'KB').kb === 2000);
        check('limit comma decimal "1,5" MB', C.parseLimit('1,5', 'MB').kb === 1500);
        check('limit thousands "1,000" KB', C.parseLimit('1,000', 'KB').kb === 1000);
        check('limit 12.5 KB keeps the decimal', C.parseLimit('12.5', 'KB').kb === 12.5);
        check('limit blank', C.parseLimit('  ', 'KB').err === 'blank');
        check('limit zero', C.parseLimit('0', 'KB').err === 'zero');
        check('limit negative', C.parseLimit('-50', 'KB').err === 'negative');
        check('limit words', C.parseLimit('fifty', 'KB').err === 'nan');
        check('limit too small (1 KB)', C.parseLimit('1', 'KB').err === 'small');
        check('limit too big (51 MB)', C.parseLimit('51', 'MB').err === 'big');
        check('limit 50 MB allowed', C.parseLimit('50', 'MB').kb === 50000);
        check('limit in bytes refused', C.parseLimit('500 bytes', 'KB').err === 'nan');
        check('min blank = none', C.parseMin('').kb === 0);
        check('min 20', C.parseMin('20').kb === 20);
        check('min negative', C.parseMin('-1').err === 'negative');
        check('min words', C.parseMin('abc').err === 'nan');
        check('pixels off', C.parsePixels('', '').off);
        check('pixels 600 x 600', C.parsePixels('600', '600 px').w === 600);
        check('pixels one missing', C.parsePixels('600', '').err === 'one');
        check('pixels decimal refused', C.parsePixels('600.5', '600').err === 'nan');
        check('pixels too small / too big', C.parsePixels('10', '600').err === 'range' && C.parsePixels('600', '9000').err === 'range');

        // sizes
        check('100 KB limit = 100,000 bytes', C.maxBytes(100) === 100000);
        check('at least 20 KB = 20,480 bytes', C.minBytes(20) === 20480);
        check('1 MB limit = 1,000,000 bytes', C.maxBytes(1000) === 1000000);
        check('min must be 10% under max', C.minFits(20, 50) && !C.minFits(48, 50) && C.minFits(0, 50));
        check('fmtSize bytes', C.fmtSize(812) === '812 bytes');
        check('fmtSize 48.3 KB', C.fmtSize(49500) === '48.3 KB');
        check('fmtSize never rounds up to the limit (100,000 bytes = 97.6 KB)', C.fmtSize(100000) === '97.6 KB');
        check('fmtSize 3.4 MB', C.fmtSize(3600000) === '3.4 MB');
        check('fmtSize 150 KB', C.fmtSize(153700) === '150 KB');
        check('limit labels', C.limitLabel(100) === '100 KB' && C.limitLabel(1000) === '1 MB' && C.limitLabel(1500) === '1.5 MB' && C.limitLabel(12.5) === '12.5 KB' && C.limitLabel(1234) === '1234 KB');

        // shapes
        check('turned 90', C.turned(4032, 3024, 90).w === 3024);
        check('start long side capped at 4096', C.startLong(8000, 6000) <= 4096);
        check('start long keeps area under the phone limit', (() => { const l = C.startLong(4096, 4096); return l * l <= C.MAX_AREA; })());
        check('start long small photo unchanged', C.startLong(800, 600) === 800);
        const o = C.outSize(4032, 3024, 0, null, 1600);
        check('out size keeps the shape', o.w === 1600 && o.h === 1200);
        const o2 = C.outSize(4032, 3024, 90, null, 1600);
        check('out size after rotating', o2.w === 1200 && o2.h === 1600);
        check('out size exact pixels', C.outSize(4032, 3024, 0, { w: 600, h: 600 }, 999).w === 600);
        const crop = C.placement(4032, 3024, 600, 600, 'crop');
        check('crop fills the square and centers', Math.round(crop.dh) === 600 && Math.round(crop.dw) === 800 && Math.round(crop.dx) === -100 && crop.dy === 0);
        const pad = C.placement(4032, 3024, 600, 600, 'pad');
        check('white bars keep the whole photo', Math.round(pad.dw) === 600 && Math.round(pad.dh) === 450 && Math.round(pad.dy) === 75);

        // the search, with a pretend JPEG encoder: bytes grow with pixels and quality
        const model = (w, h) => (long, q) => {
            const s = long / Math.max(w, h), px = Math.round(w * s) * Math.round(h * s);
            return Promise.resolve({ size: Math.round(px * (0.03 + 0.5 * q * q * q)), long, q });
        };
        const enc = model(4032, 3024);
        let s = await C.shrink(enc, { long: 4032, maxBytes: C.maxBytes(100), minBytes: 0 });
        check('phone photo gets under 100 KB', s.ok && s.res.size <= 100000);
        check('...uses most of the room (over 85 KB)', s.res.size > 85000);
        check('...at a usable size and quality (over 600 px, quality 0.5+)', s.long >= 600 && s.q >= 0.5);
        s = await C.shrink(enc, { long: 4032, maxBytes: C.maxBytes(20), minBytes: 0 });
        check('20 KB reached by making it smaller in pixels', s.ok && s.res.size <= 20000 && s.long < 600 && s.long >= C.MIN_SIDE);
        s = await C.shrink(enc, { long: 4032, maxBytes: C.maxBytes(2000), minBytes: 0 });
        check('2 MB limit keeps most pixels', s.ok && s.res.size <= 2000000 && s.long >= 1000);
        s = await C.shrink(enc, { long: 4032, maxBytes: 300, minBytes: 0 });
        check('impossible limit says no, with the smallest size tried', !s.ok && s.smallest.size > 300);
        s = await C.shrink(model(600, 600), { long: 600, maxBytes: C.maxBytes(50), minBytes: C.minBytes(20), fixed: true });
        check('exact 600 x 600 between 20 and 50 KB', s.ok && s.res.size <= 50000 && (s.res.size >= 20480 || s.pad) && s.long === 600);
        s = await C.shrink(model(100, 100), { long: 100, maxBytes: C.maxBytes(50), minBytes: C.minBytes(20) });
        check('tiny photo under the minimum asks for padding', s.ok && s.pad && s.res.size < 20480);
        s = await C.shrink(model(300, 300), { long: 300, maxBytes: C.maxBytes(200), minBytes: C.minBytes(100) });
        check('minimum reached by raising quality when it can', s.ok && (s.pad || (s.res.size >= 102400 && s.res.size <= 200000)));
        s = await C.shrink(model(1, 1), { long: 1, maxBytes: C.maxBytes(20), minBytes: 0 });
        check('1 x 1 pixel photo fits', s.ok);
        s = await C.shrink(model(4032, 3024), { long: 600, maxBytes: 2000, minBytes: 0, fixed: true });
        check('fixed pixels never change the pixel size', s.ok ? s.long === 600 : !s.ok);

        // padding a JPEG up to a minimum, exactly
        const jpg = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0, 4, 1, 2, 0xFF, 0xD9]);
        const p1 = C.padJpeg(jpg, 5000);
        check('padding reaches the exact size', p1.length === 5000);
        check('padding keeps the start marker and the original bytes after the comments', p1[0] === 0xFF && p1[1] === 0xD8 && p1[2] === 0xFF && p1[3] === 0xFE &&
            p1[p1.length - 1] === 0xD9 && p1[p1.length - 8] === 0xFF && p1[p1.length - 7] === 0xE0);
        const big = C.padJpeg(jpg, 200000);
        check('padding over 64 KB uses several blocks', big.length === 200000);
        let at = 2, blocks = 0;
        while (big[at] === 0xFF && big[at + 1] === 0xFE) { at += 2 + (big[at + 2] << 8 | big[at + 3]); blocks++; }
        check('padding blocks are valid JPEG comments', at === 200000 - 8 && blocks === 4 && big[at] === 0xFF && big[at + 1] === 0xE0);
        check('padding never needed: unchanged', C.padJpeg(jpg, 5) === jpg);
        check('padding 2 bytes short still makes a valid block', C.padJpeg(jpg, 12).length === 14);
        check('pad target stays under the limit', C.padTarget(20, 50) === 20680 && C.padTarget(1.8, 2) <= 1996);
        check('remainder edge: 65537 + 2', C.padJpeg(jpg, 10 + 65539).length === 10 + 65539);

        // keep a JPEG that already fits
        const rules = { maxKB: 100, minKB: 0, px: null };
        check('fitting JPEG is kept', C.canKeep({ type: 'image/jpeg', size: 84000 }, rules, 0));
        check('fitting PNG is changed to JPG', !C.canKeep({ type: 'image/png', size: 84000 }, rules, 0));
        check('rotated JPEG is redone', !C.canKeep({ type: 'image/jpeg', size: 84000 }, rules, 90));
        check('JPEG under the minimum is redone', !C.canKeep({ type: 'image/jpeg', size: 10000 }, { maxKB: 50, minKB: 20 }, 0));
        check('JPEG over the limit is redone', !C.canKeep({ type: 'image/jpeg', size: 100001 }, rules, 0));
        check('JPEG with exact pixels asked is redone', !C.canKeep({ type: 'image/jpeg', size: 1000 }, { maxKB: 100, px: { w: 600, h: 600 } }, 0));

        // files
        check('kinds', C.kindOf('a.jpg', 'image/jpeg', 5) === 'image' && C.kindOf('IMG_1.HEIC', '', 5) === 'heic' && C.kindOf('cv.pdf', 'application/pdf', 5) === 'pdf' &&
            C.kindOf('notes.docx', '', 5) === 'other' && C.kindOf('a.jpg', 'image/jpeg', 0) === 'empty' && C.kindOf('a.jpg', 'image/jpeg', 200 * 1024 * 1024) === 'big' &&
            C.kindOf('a.heic', 'image/heic', 5) === 'heic' && C.kindOf('scan', 'image/png', 5) === 'image');
        check('out name', C.outName('IMG_1234.HEIC', 100) === 'IMG_1234-under-100KB.jpg');
        check('out name MB', C.outName('passport photo.jpeg', 1000) === 'passport photo-under-1MB.jpg');
        check('out name odd characters and blank', C.outName('a/b:c?.png', 50) === 'a-b-c--under-50KB.jpg' && C.outName('', 20) === 'photo-under-20KB.jpg' && C.outName('.jpg', 20) === 'photo-under-20KB.jpg');
        check('out name very long is cut', C.outName('x'.repeat(300) + '.jpg', 20).length < 110);

        // saved rules
        check('clean rules: nothing saved', JSON.stringify(C.cleanRules(null)) === JSON.stringify({ maxKB: 100, minKB: 0, px: null, fit: 'crop' }));
        check('clean rules: good values kept', (() => { const c = C.cleanRules({ maxKB: 50, minKB: 20, px: { w: 600, h: 600 }, fit: 'pad' }); return c.maxKB === 50 && c.minKB === 20 && c.px.w === 600 && c.fit === 'pad'; })());
        check('clean rules: bad values dropped', (() => { const c = C.cleanRules({ maxKB: -5, minKB: 'x', px: { w: 1, h: 'a' }, fit: '<b>' }); return c.maxKB === 100 && c.minKB === 0 && c.px === null && c.fit === 'crop'; })());
        check('clean rules: minimum that no longer fits is dropped', C.cleanRules({ maxKB: 20, minKB: 19 }).minKB === 0);
        check('clean rules: array or string', C.cleanRules([1, 2]).maxKB === 100 && C.cleanRules('x').maxKB === 100);
        return r;
    }
    if (typeof module === 'object' && module.exports) {
        runTests(require('./core.js')).then(r => {
            r.forEach(t => console.log((t.ok ? 'PASS ' : 'FAIL ') + t.name));
            const bad = r.filter(t => !t.ok).length;
            console.log((r.length - bad) + ' of ' + r.length + ' checks passed');
            process.exit(bad ? 1 : 0);
        });
    } else root.runTests = runTests;
})(this);
