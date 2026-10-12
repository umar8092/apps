// Checks on the maths. Runs in the browser (test.html) and in Node: node tests.js
(function (root) {
    function runTests(C) {
        const r = [], check = (name, ok) => r.push({ name, ok: !!ok });
        const near = (a, b, e) => Math.abs(a - b) <= (e || 0.01);
        const blank = (w, h, v) => { const d = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < d.length; i += 4) { d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; } return { data: d, width: w, height: h }; };
        const px = (img, x, y) => { const i = (y * img.width + x) * 4; return [img.data[i], img.data[i + 1], img.data[i + 2]]; };
        const set = (img, x, y, rgb) => { const i = (y * img.width + x) * 4; img.data[i] = rgb[0]; img.data[i + 1] = rgb[1]; img.data[i + 2] = rgb[2]; };
        // a light page (a 4-sided shape) on a dark table
        const inside = (q, x, y) => { let s = 0; for (let i = 0; i < 4; i++) { const a = q[i], b = q[(i + 1) % 4], z = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]); if (z < 0) return false; } return true; };
        const scene = (w, h, q, page, table) => { const img = blank(w, h, table); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (inside(q, x + 0.5, y + 0.5)) set(img, x, y, [page, page, page]); return img; };

        // files
        check('photo kinds: jpg, png, heic, pdf, other, empty, too big', C.kindOf('a.jpg', 'image/jpeg', 10) === 'image' && C.kindOf('a.PNG', '', 10) === 'image'
            && C.kindOf('IMG_1.HEIC', '', 10) === 'heic' && C.kindOf('lease.pdf', 'application/pdf', 10) === 'pdf' && C.kindOf('a.docx', 'application/msword', 10) === 'other'
            && C.kindOf('a.jpg', 'image/jpeg', 0) === 'empty' && C.kindOf('a.jpg', 'image/jpeg', 61e6) === 'big');

        // sizes and limits
        check('fmtSize: 512 bytes, 850 KB, 2.14 MB rounded up, 12.4 MB', C.fmtSize(512) === '512 bytes' && C.fmtSize(850000) === '850 KB' && C.fmtSize(2131000) === '2.14 MB' && C.fmtSize(12345678) === '12.4 MB');
        check('fmtSize never shows less than the real size: 9,999,999 bytes is 10.00 MB', C.fmtSize(9999999) === '10.00 MB');
        check('parseLimit: blank = no limit, 10 -> 10,000,000 bytes, 2,5 -> 2,500,000', C.parseLimit('').bytes === 0 && C.parseLimit('10').bytes === 10000000 && C.parseLimit('2,5').bytes === 2500000 && C.parseLimit('5 MB').bytes === 5000000);
        check('parseLimit refuses words, under 0.1 and over 500', C.parseLimit('ten').err === 'nan' && C.parseLimit('-1').err === 'nan' && C.parseLimit('0').err === 'small' && C.parseLimit('0.05').err === 'small' && C.parseLimit('501').err === 'big');
        check('limitText 2500000 -> 2.5 MB', C.limitText(2500000) === '2.5 MB' && C.limitText(0) === '');

        // names
        const d = new Date(2026, 9, 12);
        check('empty name -> scan-2026-10-12.pdf', C.fileName('', d) === 'scan-2026-10-12.pdf' && C.fileName('   ', d) === 'scan-2026-10-12.pdf');
        check('name keeps spaces and adds .pdf once', C.fileName('Lease and ID', d) === 'Lease and ID.pdf' && C.fileName('lease.pdf', d) === 'lease.pdf' && C.fileName('lease.PDF.pdf', d) === 'lease.pdf');
        check('name drops / \\ : * ? " < > | and is at most 80 characters', C.fileName('a/b:c*?"<>|d', d) === 'a b c d.pdf' && C.fileName('x'.repeat(200), d).length === 84);
        check('name of only dots -> default', C.fileName('...', d) === 'scan-2026-10-12.pdf');

        // corners
        check('whole photo corners', JSON.stringify(C.wholePhoto(40, 30)) === '[[0,0],[40,0],[40,30],[0,30]]');
        check('convex: a page yes; corners crossed over no; 3 points no', C.isConvex([[0, 0], [10, 0], [10, 10], [0, 10]]) && !C.isConvex([[0, 0], [10, 10], [10, 0], [0, 10]]) && !C.isConvex([[0, 0], [1, 1], [2, 2]]));
        check('orderCorners puts shuffled corners in TL, TR, BR, BL order', JSON.stringify(C.orderCorners([[10, 10], [0, 0], [0, 10], [10, 0]])) === '[[0,0],[10,0],[10,10],[0,10]]');
        check('validCorners refuses outside the photo, NaN and tiny', C.validCorners([[0, 0], [100, 0], [100, 80], [0, 80]], 100, 80) && !C.validCorners([[0, 0], [150, 0], [100, 80], [0, 80]], 100, 80)
            && !C.validCorners([[0, 0], [NaN, 0], [100, 80], [0, 80]], 100, 80) && !C.validCorners([[0, 0], [4, 0], [4, 4], [0, 4]], 100, 80));
        const os = C.outSize([[0, 0], [1000, 0], [1000, 1414], [0, 1414]], 0);
        check('outSize: an A4-shaped crop 1000 x 1414 stays 1000 x 1414', os.w === 1000 && os.h === 1414);
        const big = C.outSize([[0, 0], [3000, 0], [3000, 4000], [0, 4000]], 0), turned = C.outSize([[0, 0], [3000, 0], [3000, 4000], [0, 4000]], 90);
        check('outSize: at most 2000 px on the long side, and swaps when turned', big.w === 1500 && big.h === 2000 && turned.w === 2000 && turned.h === 1500);
        check('outSize uses the longer of opposite edges (a page photographed at an angle)', C.outSize([[100, 0], [300, 0], [400, 300], [0, 300]], 0).w === 400);

        // straightening
        const q = [[20, 10], [180, 30], [170, 220], [10, 200]], m = C.homography(q, 100, 150);
        const okMap = [[0, 0], [100, 0], [100, 150], [0, 150]].every((p, i) => { const t = C.mapPoint(m, p[0], p[1]); return near(t[0], q[i][0], 1e-6) && near(t[1], q[i][1], 1e-6); });
        check('homography sends the page corners to the photo corners exactly', okMap);
        const grad = blank(60, 40, 0); for (let y = 0; y < 40; y++) for (let x = 0; x < 60; x++) set(grad, x, y, [x * 4, y * 6, 100]);
        const same = C.warp(grad, C.wholePhoto(60, 40), 60, 40);
        let maxDiff = 0; for (let i = 0; i < same.data.length; i++) maxDiff = Math.max(maxDiff, Math.abs(same.data[i] - grad.data[i]));
        check('warp with the whole photo gives the same picture', maxDiff <= 1 && same.width === 60 && same.height === 40);
        const crop = C.warp(grad, [[10, 10], [30, 10], [30, 30], [10, 30]], 20, 20);
        check('warp of a square crop gives that part of the photo', near(px(crop, 0, 0)[0], 40, 1) && near(px(crop, 19, 19)[1], 174, 1));

        // turning
        const t = blank(3, 2, 0); set(t, 0, 0, [255, 0, 0]); set(t, 2, 1, [0, 0, 255]);
        const r90 = C.rotate(t, 90), r180 = C.rotate(t, 180), r270 = C.rotate(t, 270);
        check('rotate 90 clockwise: 3x2 becomes 2x3, top-left goes to top-right', r90.width === 2 && r90.height === 3 && px(r90, 1, 0)[0] === 255 && px(r90, 0, 2)[2] === 255);
        check('rotate 180 and 270', px(r180, 2, 1)[0] === 255 && px(r180, 0, 0)[2] === 255 && r270.width === 2 && px(r270, 0, 2)[0] === 255 && px(r270, 1, 0)[2] === 255);
        check('rotate 0 and 360 leave it alone', C.rotate(t, 0) === t && C.rotate(t, 360) === t);

        // looks
        const shadow = () => { const img = blank(200, 200, 0); for (let y = 0; y < 200; y++) for (let x = 0; x < 200; x++) { const p = 230 - x * 0.5; set(img, x, y, [p, p, p - 10]); }
            for (let y = 90; y < 110; y++) for (let x = 20; x < 180; x++) { const p = 40 - x * 0.05; set(img, x, y, [p, p, p]); } set(img, 100, 50, [200, 30, 30]); return img; };
        const col = C.applyLook(shadow(), 'color');
        check('clean colour: grey shadowed paper becomes white on both sides', px(col, 5, 20)[0] >= 250 && px(col, 195, 20)[0] >= 245);
        check('clean colour: text stays dark', px(col, 30, 100)[0] < 60 && px(col, 170, 100)[0] < 80);
        check('clean colour keeps colour (a red stamp stays red)', px(col, 100, 50)[0] > px(col, 100, 50)[1] + 60);
        const bw = C.applyLook(shadow(), 'bw'), grey = C.applyLook(shadow(), 'grey');
        check('black and white: paper 255, text 0', px(bw, 195, 20)[0] === 255 && px(bw, 5, 20)[0] === 255 && px(bw, 100, 100)[0] === 0);
        check('grey: no colour left', px(grey, 100, 50)[0] === px(grey, 100, 50)[1] && px(grey, 100, 50)[1] === px(grey, 100, 50)[2]);
        const ph = shadow(), before = px(ph, 195, 20)[0]; C.applyLook(ph, 'photo');
        check('photo as is: unchanged', px(ph, 195, 20)[0] === before);
        const white = C.applyLook(blank(50, 50, 255), 'bw');
        check('an empty white page stays white', px(white, 25, 25)[0] === 255);

        // finding the page
        const pageQ = [[60, 40], [230, 55], [220, 290], [45, 275]], found = C.detectPage(scene(300, 330, pageQ, 235, 70));
        check('finds a tilted page on a dark table (within 3 px)', found && found.every((p, i) => near(p[0], pageQ[i][0], 3) && near(p[1], pageQ[i][1], 3)));
        const diamond = [[150, 20], [280, 150], [150, 280], [20, 150]], fd = C.detectPage(scene(300, 300, diamond, 240, 60));
        check('finds a page turned 45 degrees', fd && C.isConvex(fd) && near(C.quadArea(fd), C.quadArea(diamond), C.quadArea(diamond) * 0.06));
        check('no page found in a plain grey photo', C.detectPage(blank(200, 200, 128)) === null);
        check('no page found when the page fills the whole photo', C.detectPage(scene(200, 200, [[0, 0], [200, 0], [200, 200], [0, 200]], 240, 60)) === null);
        check('tiny picture: nothing found, no crash', C.detectPage(blank(8, 8, 0)) === null);
        check('scaleCorners and inset', JSON.stringify(C.scaleCorners([[1, 2], [3, 4], [5, 6], [7, 8]], 2)) === '[[2,4],[6,8],[10,12],[14,16]]'
            && JSON.stringify(C.inset([[0, 0], [10, 0], [10, 10], [0, 10]], 0.1)) === '[[0.5,0.5],[9.5,0.5],[9.5,9.5],[0.5,9.5]]');

        // placing on paper
        const a4 = C.placement(1000, 1414, 'a4');
        check('A4 photo on A4: fills the page', a4.pw === 595.28 && a4.ph === 841.89 && near(a4.w, 595.28, 0.6) && near(a4.h, 841.89, 0.6));
        const card = C.placement(1000, 630, 'a4');
        check('a wide picture gets a landscape page', card.pw === 841.89 && card.ph === 595.28 && card.w === 841.89 && near(card.y, (595.28 - 530.39) / 2, 0.2));
        const let1 = C.placement(1000, 1414, 'letter');
        check('A4 photo on US Letter: fits the width, centred top to bottom', let1.pw === 612 && let1.w <= 612 && let1.h <= 792 && near(let1.x * 2 + let1.w, 612, 0.05) && near(let1.y * 2 + let1.h, 792, 0.05));
        const fit = C.placement(800, 600, 'fit');
        check('each page its own shape: page = picture shape, long side 841.89', fit.pw === 841.89 && fit.ph === 631.42 && fit.x === 0 && fit.y === 0);

        // writing the PDF
        const jpg = new Uint8Array([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9]), pdf = C.buildPdf([{ jpeg: jpg, w: 10, h: 14 }, { jpeg: jpg, w: 20, h: 10 }], 'a4', 'Lease (signed)');
        let s = ''; for (let i = 0; i < pdf.length; i++) s += String.fromCharCode(pdf[i]);
        check('PDF starts with %PDF-1.4 and ends with %%EOF', s.startsWith('%PDF-1.4') && s.trimEnd().endsWith('%%EOF'));
        check('PDF has 2 pages', /\/Count 2 /.test(s) && (s.match(/\/Type \/Page /g) || []).length === 2);
        const xrefAt = +s.match(/startxref\n(\d+)/)[1];
        check('startxref points at the xref table', s.slice(xrefAt, xrefAt + 4) === 'xref');
        const offs = s.slice(xrefAt).split('\n').slice(3).filter(l => / 00000 n $/.test(l)).map(l => +l.slice(0, 10));
        check('every xref offset points at its object', offs.length === 9 && offs.every((o, i) => s.slice(o, o + String(i + 1).length + 6) === (i + 1) + ' 0 obj'));
        check('image stream length is the JPEG length', /\/Length 7 >>\nstream\n\xff\xd8/.test(s));
        check('title brackets are escaped', s.includes('/Title (Lease \\(signed\\))'));
        check('second page is landscape', s.includes('/MediaBox [0 0 841.89 595.28]'));

        // saved data
        const good = C.cleanPage({ id: 'p1', w: 100, h: 80, rot: 90, look: 'bw', corners: [[0, 0], [100, 0], [100, 80], [0, 80]], order: 2 });
        check('a good saved page is kept', good && good.rot === 90 && good.look === 'bw' && good.order === 2);
        const odd = C.cleanPage({ id: 'p2', w: 100, h: 80, rot: 45, look: 'neon', corners: 'x' });
        check('bad turn, look and corners are reset', odd && odd.rot === 0 && odd.look === 'color' && odd.corners[2][0] === 100);
        check('a saved page with no id or size is dropped', C.cleanPage(null) === null && C.cleanPage({ id: '', w: 1, h: 1 }) === null && C.cleanPage({ id: 'x', w: 0, h: 5 }) === null && C.cleanPage({ id: 'x', w: 'a', h: 5 }) === null);
        const cs = C.cleanSettings({ paper: 'tabloid', limit: -5, look: 'grey' }), cs2 = C.cleanSettings({ paper: 'letter', limit: 10000000 });
        check('settings: bad paper and limit reset, good kept', cs.paper === '' && cs.limit === 0 && cs.look === 'grey' && cs2.paper === 'letter' && cs2.limit === 10000000 && C.cleanSettings('junk').look === 'color');
        check('default paper: US Letter for en-US and en-CA, A4 for en-GB, ur-PK, de-DE', C.defaultPaper('en-US') === 'letter' && C.defaultPaper('en-CA') === 'letter' && C.defaultPaper('en-GB') === 'a4' && C.defaultPaper('ur-PK') === 'a4' && C.defaultPaper('de-DE') === 'a4');
        return r;
    }
    if (typeof module === 'object' && module.exports) {
        const r = runTests(require('./core.js'));
        r.forEach(t => console.log((t.ok ? 'PASS ' : 'FAIL ') + t.name));
        const bad = r.filter(t => !t.ok).length;
        console.log('\n' + (r.length - bad) + ' of ' + r.length + ' checks passed');
        process.exitCode = bad ? 1 : 0;
    } else root.runTests = runTests;
})(this);
