// Logic for Signature Maker for Forms, with no page code, so tests.js can check it in node.
// Sizes: "under 20 KB" is met as at most 20,000 bytes and "at least 10 KB" as at least 10,240 bytes,
// so the file passes whether a website counts 1 KB as 1000 or 1024 bytes.
(function (root) {
    const PX_MIN = 20, PX_MAX = 4000;
    const KB_MIN = 2, KB_MAX = 10000;          // 2 KB to 10 MB
    const KEEP_LONG = 800;                      // longest side when the form asks for no exact pixels
    const SHRINK_LONG_MIN = 100;                // a signature smaller than this can no longer be read
    const TOP_Q = 0.95, LOW_Q = 0.3;

    // Quick picks for the size a form asks for. fmt 'jpg' has a white background, 'png' a see-through one.
    const PRESETS = [
        { id: 'p140', label: '140 × 60 px, 10 to 20 KB', fmt: 'jpg', w: 140, h: 60, minKB: 10, maxKB: 20 },
        { id: 'p140b', label: '140 × 60 px, 4 to 30 KB', fmt: 'jpg', w: 140, h: 60, minKB: 4, maxKB: 30 },
        { id: 'p350', label: '350 × 150 px, 20 to 100 KB', fmt: 'jpg', w: 350, h: 150, minKB: 20, maxKB: 100 },
        { id: 'p354', label: '354 × 157 px, 10 to 50 KB', fmt: 'jpg', w: 354, h: 157, minKB: 10, maxKB: 50 },
        { id: 'p100', label: 'Under 100 KB, any pixels', fmt: 'jpg', w: 0, h: 0, minKB: 0, maxKB: 100 },
        { id: 'doc', label: 'See-through PNG for PDFs', fmt: 'png', w: 0, h: 0, minKB: 0, maxKB: 0 }
    ];
    const DEFAULTS = { preset: 'p140', fmt: 'jpg', w: 140, h: 60, minKB: 10, maxKB: 20 };

    // Reads a number typed or pasted by a person: "20", " 1.5 ", "1,5", "20kb", "2 MB". Returns { blank } or { n, unit } or { err }.
    function parseNumber(text) {
        let s = String(text == null ? '' : text).trim().toLowerCase().replace(/\s+/g, '');
        if (!s) return { blank: true };
        let unit = '';
        const u = s.match(/(kb|k|mb|m|px)$/);
        if (u && s.length > u[0].length) { unit = u[1] === 'px' ? 'PX' : u[1][0] === 'm' ? 'MB' : 'KB'; s = s.slice(0, -u[0].length); }
        if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
        else if (/^-?\d*,\d+$/.test(s)) s = s.replace(',', '.');
        if (!/^-?(\d+\.?\d*|\.\d+)$/.test(s)) return { err: 'nan' };
        return { n: parseFloat(s), unit };
    }
    const round1 = n => Math.round(n * 10) / 10;

    // A size in KB from a box. Blank is allowed (0 = no rule). Returns { kb } or { err }.
    function parseKB(text) {
        const r = parseNumber(text);
        if (r.blank) return { kb: 0 };
        if (r.err || r.unit === 'PX') return { err: 'nan' };
        if (r.n < 0) return { err: 'negative' };
        if (r.n === 0) return { err: 'zero' };
        const kb = round1(r.unit === 'MB' ? r.n * 1000 : r.n);
        if (kb < KB_MIN) return { err: 'small' };
        if (kb > KB_MAX) return { err: 'big' };
        return { kb };
    }

    // Exact width and height. Both blank = keep the signature's own shape. Returns { w, h } (0, 0 = keep) or { err }.
    function parsePixels(wText, hText) {
        const a = String(wText == null ? '' : wText).trim().replace(/\s*px$/i, ''), b = String(hText == null ? '' : hText).trim().replace(/\s*px$/i, '');
        if (!a && !b) return { w: 0, h: 0 };
        if (!a || !b) return { err: 'one' };
        if (!/^\d+$/.test(a) || !/^\d+$/.test(b)) return { err: 'nan' };
        const w = parseInt(a, 10), h = parseInt(b, 10);
        if (w < PX_MIN || h < PX_MIN || w > PX_MAX || h > PX_MAX) return { err: 'range' };
        return { w, h };
    }

    const maxBytes = kb => Math.floor(kb * 1000);
    const minBytes = kb => Math.ceil(kb * 1024);
    // A minimum must leave room under the limit (10%), or no file can land between them.
    const minFits = (minKB, maxKB) => !minKB || !maxKB || minBytes(minKB) <= maxBytes(maxKB) * 0.9;

    // All the size boxes at once. Returns { rules } or { errs: { field: message } }.
    function readRules(f) {
        const errs = {};
        const px = parsePixels(f.w, f.h), mx = parseKB(f.max), mn = parseKB(f.min);
        if (px.err) errs.px = px.err === 'one' ? 'Type both the width and the height, or leave both empty to keep the signature’s own shape.'
            : px.err === 'nan' ? 'Width and height are whole numbers of pixels, like 140 and 60.'
            : 'Width and height must be between ' + PX_MIN + ' and ' + PX_MAX + ' pixels.';
        const kbMsg = e => e === 'zero' ? 'Type a size above 0, or leave it empty for no limit.' : e === 'negative' ? 'A size cannot be below zero.' : e === 'small' ? 'The smallest size is ' + KB_MIN + ' KB.'
            : e === 'big' ? 'The biggest size is 10 MB (10000 KB).' : 'Type a number of KB, like 20.';
        if (mx.err) errs.max = kbMsg(mx.err);
        if (mn.err) errs.min = mn.err === 'zero' ? 'Type a size above 0, or leave it empty.' : kbMsg(mn.err);
        if (!mx.err && !mn.err && mn.kb && mx.kb && !minFits(mn.kb, mx.kb)) errs.min = '“At least” must be smaller than “Must be under”, with some room between them.';
        if (Object.keys(errs).length) return { errs };
        return { rules: { fmt: f.fmt === 'png' ? 'png' : 'jpg', w: px.w, h: px.h, minKB: mn.kb, maxKB: mx.kb } };
    }

    // Which quick pick matches these rules, or 'own'.
    function presetFor(r) {
        const p = PRESETS.find(p => p.fmt === r.fmt && p.w === r.w && p.h === r.h && p.minKB === r.minKB && p.maxKB === r.maxKB);
        return p ? p.id : 'own';
    }

    // Saved rules, checked one by one; anything odd falls back to the defaults.
    function cleanRules(r) {
        const out = Object.assign({}, DEFAULTS);
        if (!r || typeof r !== 'object') return out;
        const num = (v, lo, hi) => typeof v === 'number' && isFinite(v) && v >= lo && v <= hi;
        if (r.fmt === 'png' || r.fmt === 'jpg') out.fmt = r.fmt;
        if (r.w === 0 && r.h === 0) { out.w = 0; out.h = 0; }
        else if (Number.isInteger(r.w) && Number.isInteger(r.h) && num(r.w, PX_MIN, PX_MAX) && num(r.h, PX_MIN, PX_MAX)) { out.w = r.w; out.h = r.h; }
        out.maxKB = r.maxKB === 0 ? 0 : num(r.maxKB, KB_MIN, KB_MAX) ? round1(r.maxKB) : out.maxKB;
        out.minKB = r.minKB === 0 ? 0 : num(r.minKB, KB_MIN, KB_MAX) ? round1(r.minKB) : 0;
        if (!minFits(out.minKB, out.maxKB)) out.minKB = 0;
        out.preset = presetFor(out);
        return out;
    }

    // 14.2 KB, 812 bytes, 1.2 MB. Counted in 1024s like Windows and most forms, rounded down.
    function fmtSize(bytes) {
        if (bytes < 1024) return bytes + ' bytes';
        const kb = bytes / 1024;
        if (kb < 1024) return (kb < 100 ? Math.floor(kb * 10) / 10 : Math.floor(kb)) + ' KB';
        return Math.floor(kb / 1024 * 10) / 10 + ' MB';
    }
    const kbLabel = kb => kb >= 1000 && Math.round(kb) % 100 === 0 ? round1(kb / 1000) + ' MB' : kb + ' KB';

    // The empty space kept around the signature, in output pixels.
    const marginFor = (W, H) => Math.max(2, Math.round(Math.min(W, H) * 0.07));

    // Where a signature of bw x bh goes in a W x H picture: as big as fits inside the margin, centred, never stretched.
    function fitBox(bw, bh, W, H) {
        const m = marginFor(W, H), s = Math.min((W - 2 * m) / bw, (H - 2 * m) / bh);
        return { s, dx: (W - bw * s) / 2, dy: (H - bh * s) / 2 };
    }

    // Picture size when no exact pixels are asked for: the signature's own shape, the longest side `long` (default 800),
    // never bigger than `cap` (a photo's own size) so a photo is not blown up.
    function keepSize(bw, bh, long, cap) {
        let L = Math.max(1, Math.round(Math.min(long || KEEP_LONG, cap || Infinity)));
        const ratio = bw / bh;
        let W, H;
        if (ratio >= 1) { W = L; H = Math.round(L / ratio); } else { H = L; W = Math.round(L * ratio); }
        // add the margin around it, and never make a side so thin it cannot be opened (a straight line)
        const m = Math.max(2, Math.round(Math.min(W, H) * 0.08));
        return { W: Math.max(PX_MIN, W + 2 * m), H: Math.max(PX_MIN, H + 2 * m) };
    }

    // ---- signing on screen. Points are stored as fractions of the pad's width, so the signature survives
    // turning the phone or resizing the window. Pen sizes are fractions of the pad width too.
    const PEN = { thin: 0.0045, medium: 0.007, thick: 0.011 };
    const PEN_MIN_PX = { thin: 1.1, medium: 1.5, thick: 2.1 };   // thinnest line in the file, so small files stay readable
    const INK = { black: '#111111', blue: '#1b3a9e' };

    function strokesBox(strokes, lw) {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        strokes.forEach(s => s.forEach(p => { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }));
        if (x0 === Infinity) return null;
        const h = (lw || 0) / 2;
        return { x: x0 - h, y: y0 - h, w: Math.max(x1 - x0 + 2 * h, 1e-4), h: Math.max(y1 - y0 + 2 * h, 1e-4) };
    }
    // Line width in the file: the pen scaled with the signature, but never thinner than PEN_MIN_PX.
    const lineWidth = (thick, s) => Math.max(PEN[thick] * s, PEN_MIN_PX[thick]);

    // Saved strokes are checked point by point; anything broken is dropped.
    function cleanStrokes(list) {
        if (!Array.isArray(list)) return [];
        return list.slice(0, 500).map(s => Array.isArray(s) ? s.slice(0, 5000).filter(p => Array.isArray(p) && p.length >= 2 &&
            typeof p[0] === 'number' && typeof p[1] === 'number' && isFinite(p[0]) && isFinite(p[1]) && Math.abs(p[0]) < 10 && Math.abs(p[1]) < 10)
            .map(p => [Math.round(p[0] * 1e5) / 1e5, Math.round(p[1] * 1e5) / 1e5]) : []).filter(s => s.length);
    }

    // ---- cleaning a photo of a signature on paper. Works on brightness values (0-255), w x h.
    // The paper's brightness is found block by block (the brightest pixel nearby), so shadows and grey paper become white
    // and only the ink, which is darker than the paper around it, is kept.
    function background(L, w, h) {
        const b = Math.max(4, Math.ceil(Math.max(w, h) / 90));
        const gw = Math.ceil(w / b), gh = Math.ceil(h / b);
        let g = new Float32Array(gw * gh);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = ((y / b) | 0) * gw + ((x / b) | 0), v = L[y * w + x]; if (v > g[i]) g[i] = v; }
        const pass = (src, fn) => { const out = new Float32Array(gw * gh);
            for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) { const vals = [];
                for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const yy = y + dy, xx = x + dx; if (yy >= 0 && yy < gh && xx >= 0 && xx < gw) vals.push(src[yy * gw + xx]); }
                out[y * gw + x] = fn(vals); }
            return out; };
        g = pass(g, v => Math.max.apply(null, v));                       // thick ink strokes do not count as paper
        g = pass(g, v => v.reduce((a, c) => a + c, 0) / v.length);       // smooth so the paper has no blocks
        g = pass(g, v => v.reduce((a, c) => a + c, 0) / v.length);
        const bg = new Float32Array(w * h);
        for (let y = 0; y < h; y++) {
            const fy = Math.min(gh - 1, Math.max(0, (y + 0.5) / b - 0.5)), y0 = Math.floor(fy), y1 = Math.min(gh - 1, y0 + 1), ty = fy - y0;
            for (let x = 0; x < w; x++) {
                const fx = Math.min(gw - 1, Math.max(0, (x + 0.5) / b - 0.5)), x0 = Math.floor(fx), x1 = Math.min(gw - 1, x0 + 1), tx = fx - x0;
                const top = g[y0 * gw + x0] * (1 - tx) + g[y0 * gw + x1] * tx, bot = g[y1 * gw + x0] * (1 - tx) + g[y1 * gw + x1] * tx;
                bg[y * w + x] = top * (1 - ty) + bot * ty;
            }
        }
        return bg;
    }

    // How much ink each pixel holds, 0-1. clean is the Clean-up slider, 1 (keep faint ink) to 9 (whitest background).
    function inkAmounts(L, bg, clean) {
        const hi = 0.95 - clean * 0.03, lo = hi - 0.3;
        const a = new Float32Array(L.length);
        for (let i = 0; i < L.length; i++) {
            const n = L[i] / Math.max(bg[i], 24);
            a[i] = n >= hi ? 0 : n <= lo ? 1 : (hi - n) / (hi - lo);
        }
        return a;
    }

    // Keeps the signature and drops the rest: marks touching the photo's edge (a table, the paper's edge, a finger),
    // and specks far from the signature. crop = { x, y, w, h } limits the search to a box the person drew.
    // Returns { keep: Uint8Array (1 = signature), box: { x, y, w, h } } or null when nothing is found.
    function findSignature(a, w, h, crop) {
        const N = w * h, on = new Uint8Array(N);
        const cx0 = crop ? Math.max(0, Math.floor(crop.x)) : 0, cy0 = crop ? Math.max(0, Math.floor(crop.y)) : 0;
        const cx1 = crop ? Math.min(w, Math.ceil(crop.x + crop.w)) : w, cy1 = crop ? Math.min(h, Math.ceil(crop.y + crop.h)) : h;
        for (let y = cy0; y < cy1; y++) for (let x = cx0; x < cx1; x++) if (a[y * w + x] > 0.4) on[y * w + x] = 1;
        const label = new Int32Array(N), comps = [], stack = new Int32Array(N);
        for (let i = 0; i < N; i++) {
            if (!on[i] || label[i]) continue;
            const c = { id: comps.length + 1, area: 0, x0: w, y0: h, x1: 0, y1: 0, edge: false };
            let sp = 0; stack[sp++] = i; label[i] = c.id;
            while (sp) {
                const j = stack[--sp], x = j % w, y = (j / w) | 0;
                c.area++; if (x < c.x0) c.x0 = x; if (x > c.x1) c.x1 = x; if (y < c.y0) c.y0 = y; if (y > c.y1) c.y1 = y;
                if (x <= 1 || y <= 1 || x >= w - 2 || y >= h - 2) c.edge = true;
                for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                    const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
                    const k = yy * w + xx; if (on[k] && !label[k]) { label[k] = c.id; stack[sp++] = k; }
                }
            }
            comps.push(c);
        }
        if (!comps.length) return null;
        let inner = comps.filter(c => !c.edge);
        if (!inner.length) inner = comps;                     // everything touches the edge: the photo is cropped tightly, keep it
        const big = Math.max(8, N * 0.00012, Math.max.apply(null, inner.map(c => c.area)) * 0.03);
        const main = inner.filter(c => c.area >= big);
        if (!main.length) return null;
        let bx0 = Math.min.apply(null, main.map(c => c.x0)), by0 = Math.min.apply(null, main.map(c => c.y0));
        let bx1 = Math.max.apply(null, main.map(c => c.x1)), by1 = Math.max.apply(null, main.map(c => c.y1));
        // small marks (the dot of an i, a full stop) count when they sit close to the signature
        const px = (bx1 - bx0) * 0.12 + 4, py = (by1 - by0) * 0.35 + 4;
        const kept = new Set(main.map(c => c.id));
        inner.forEach(c => { if (!kept.has(c.id) && c.area >= 3 && c.x1 >= bx0 - px && c.x0 <= bx1 + px && c.y1 >= by0 - py && c.y0 <= by1 + py) kept.add(c.id); });
        const keep = new Uint8Array(N);
        bx0 = w; by0 = h; bx1 = 0; by1 = 0;
        comps.forEach(c => { if (kept.has(c.id)) { if (c.x0 < bx0) bx0 = c.x0; if (c.y0 < by0) by0 = c.y0; if (c.x1 > bx1) bx1 = c.x1; if (c.y1 > by1) by1 = c.y1; } });
        // the soft edges of the ink (anti-aliasing) one pixel around the kept marks
        for (let y = Math.max(0, by0 - 2); y <= Math.min(h - 1, by1 + 2); y++) for (let x = Math.max(0, bx0 - 2); x <= Math.min(w - 1, bx1 + 2); x++) {
            let near = false;
            for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) {
                const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
                if (kept.has(label[yy * w + xx])) { near = true; break; }
            }
            if (near) keep[y * w + x] = 1;
        }
        bx0 = Math.max(0, bx0 - 2); by0 = Math.max(0, by0 - 2); bx1 = Math.min(w - 1, bx1 + 2); by1 = Math.min(h - 1, by1 + 2);
        return { keep, box: { x: bx0, y: by0, w: bx1 - bx0 + 1, h: by1 - by0 + 1 } };
    }

    // Small pictures lose thin lines when shrunk; this makes the ink darker again. s is how much the picture was shrunk.
    const inkBoost = s => s < 0.35 ? 1.8 : s < 0.7 ? 1.35 : 1;

    // ---- getting the file to the size the form asks for.
    // encode(scale, quality) resolves to { size, ... }. For a JPG it keeps the quality as high as the limit allows;
    // when no exact pixels are asked for it makes the picture smaller only if even a low quality is too big.
    // o = { fmt, maxBytes (0 = none), fixed (exact pixels), long (starting longest side) }
    // Returns { ok: true, res, q, scale } or { ok: false, smallest }.
    async function fitToLimit(encode, o) {
        const max = o.maxBytes || Infinity, png = o.fmt === 'png';
        let scale = 1, smallest = null;
        for (let round = 0; round < 12; round++) {
            const top = await encode(scale, png ? 1 : TOP_Q);
            if (top.size <= max) return { ok: true, res: top, q: png ? 1 : TOP_Q, scale };
            if (!smallest || top.size < smallest.size) smallest = top;
            if (!png) {
                const low = await encode(scale, LOW_Q);
                if (low.size < smallest.size) smallest = low;
                if (low.size <= max) {
                    let a = LOW_Q, b = TOP_Q, good = low, gq = LOW_Q;
                    for (let i = 0; i < 6; i++) { const m = (a + b) / 2, t = await encode(scale, m); if (t.size <= max) { good = t; gq = m; a = m; } else b = m; }
                    return { ok: true, res: good, q: gq, scale };
                }
            }
            if (o.fixed) break;
            const next = scale * Math.max(0.5, Math.min(0.9, Math.sqrt(max / smallest.size) * 0.92));
            if ((o.long || KEEP_LONG) * next < SHRINK_LONG_MIN) break;
            scale = next;
        }
        return { ok: false, smallest };
    }

    // Makes a JPEG bigger without changing the picture: empty comment blocks after the start marker.
    // Used only when a form asks for "at least" a size the signature does not reach on its own.
    function padJpeg(bytes, target) {
        let need = target - bytes.length;
        if (need <= 0 || bytes[0] !== 0xFF || bytes[1] !== 0xD8) return bytes;
        if (need < 4) need = 4;
        const segs = [];
        while (need > 0) {
            let n = Math.min(need, 65537);
            if (need - n > 0 && need - n < 4) n -= 4;
            segs.push(n); need -= n;
        }
        const out = new Uint8Array(bytes.length + segs.reduce((x, y) => x + y, 0));
        out.set(bytes.subarray(0, 2), 0);
        let at = 2;
        segs.forEach(n => {
            const len = n - 2;
            out[at] = 0xFF; out[at + 1] = 0xFE; out[at + 2] = len >> 8; out[at + 3] = len & 255;
            out.fill(0x20, at + 4, at + n); at += n;
        });
        out.set(bytes.subarray(2), at);
        return out;
    }

    // The same for a PNG: one text block (a "comment") before the end block. Pictures and viewers ignore it.
    let crcTable = null;
    function crc32(bytes, start, end) {
        if (!crcTable) { crcTable = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; } }
        let c = 0xFFFFFFFF;
        for (let i = start; i < end; i++) c = crcTable[(c ^ bytes[i]) & 255] ^ (c >>> 8);
        return (c ^ 0xFFFFFFFF) >>> 0;
    }
    function padPng(bytes, target) {
        const need = target - bytes.length;
        const sig = [0x89, 0x50, 0x4E, 0x47];
        if (need <= 0 || sig.some((v, i) => bytes[i] !== v) || bytes.length < 20) return bytes;
        const iend = bytes.length - 12;                      // the end block is always the last 12 bytes
        if (String.fromCharCode(bytes[iend + 4], bytes[iend + 5], bytes[iend + 6], bytes[iend + 7]) !== 'IEND') return bytes;
        const dataLen = Math.max(8, need - 12);              // 12 = length, type and check of the new block
        const chunk = new Uint8Array(12 + dataLen);
        chunk[0] = dataLen >>> 24; chunk[1] = (dataLen >>> 16) & 255; chunk[2] = (dataLen >>> 8) & 255; chunk[3] = dataLen & 255;
        chunk.set([0x74, 0x45, 0x58, 0x74], 4);              // tEXt
        const key = [0x43, 0x6F, 0x6D, 0x6D, 0x65, 0x6E, 0x74, 0]; // "Comment" and its end mark
        chunk.set(key, 8);
        chunk.fill(0x20, 8 + key.length, 8 + dataLen);
        const crc = crc32(chunk, 4, 8 + dataLen);
        chunk[8 + dataLen] = crc >>> 24; chunk[9 + dataLen] = (crc >>> 16) & 255; chunk[10 + dataLen] = (crc >>> 8) & 255; chunk[11 + dataLen] = crc & 255;
        const out = new Uint8Array(bytes.length + chunk.length);
        out.set(bytes.subarray(0, iend), 0); out.set(chunk, iend); out.set(bytes.subarray(iend), iend + chunk.length);
        return out;
    }
    const padTarget = (minKB, maxKB) => Math.min(minBytes(minKB) + 200, maxKB ? maxBytes(maxKB) - 4 : Infinity);

    // signature-140x60.jpg, signature.png
    const outName = (fmt, W, H, fixed) => 'signature' + (fixed ? '-' + W + 'x' + H : '') + '.' + fmt;

    // The green line under the result.
    function verdict(r) {
        if (r.minKB && r.maxKB) return 'Between ' + kbLabel(r.minKB) + ' and ' + kbLabel(r.maxKB) + '. Ready to upload.';
        if (r.maxKB) return 'Under ' + kbLabel(r.maxKB) + '. Ready to upload.';
        if (r.minKB) return 'At least ' + kbLabel(r.minKB) + '. Ready to upload.';
        return r.fmt === 'png' ? 'Ready. The background is see-through.' : 'Ready to upload.';
    }

    // What kind of file was chosen: 'image', 'heic', 'pdf', 'empty', 'big' or 'other'.
    function kindOf(name, type, size) {
        const n = String(name || '').toLowerCase(), t = String(type || '').toLowerCase();
        if (size === 0) return 'empty';
        if (size > 60 * 1024 * 1024) return 'big';
        if (/hei[cf]/.test(t) || /\.hei[cf]$/.test(n)) return 'heic';
        if (t === 'application/pdf' || /\.pdf$/.test(n)) return 'pdf';
        if (t.startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp|avif|jfif)$/.test(n)) return 'image';
        return 'other';
    }

    const api = { PX_MIN, PX_MAX, KB_MIN, KB_MAX, KEEP_LONG, SHRINK_LONG_MIN, TOP_Q, LOW_Q, PRESETS, DEFAULTS, PEN, PEN_MIN_PX, INK,
        parseNumber, parseKB, parsePixels, maxBytes, minBytes, minFits, readRules, presetFor, cleanRules, fmtSize, kbLabel,
        marginFor, fitBox, keepSize, strokesBox, lineWidth, cleanStrokes, background, inkAmounts, findSignature, inkBoost,
        fitToLimit, padJpeg, crc32, padPng, padTarget, outName, verdict, kindOf };
    if (typeof module === 'object' && module.exports) module.exports = api; else root.SignCore = api;
})(this);
