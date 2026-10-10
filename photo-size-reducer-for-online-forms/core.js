// Logic for Photo Size Reducer for Online Forms, with no page code, so tests.js can check it in node.
// Sizes: a limit of 100 KB is met as at most 100,000 bytes (passes whether a website counts 1 KB as 1000 or 1024 bytes),
// and a minimum of 20 KB as at least 20,480 bytes, for the same reason.
(function (root) {
    const PRESETS = [20, 50, 100, 200, 500, 1000, 2000];   // KB
    const LIMIT_MIN_KB = 2, LIMIT_MAX_KB = 50000;           // 2 KB to 50 MB
    const PX_MIN = 16, PX_MAX = 8000;
    const MAX_SIDE = 4096, MAX_AREA = 16777216;             // what phones can draw safely
    const MIN_SIDE = 160;                                   // smaller than this a photo is no longer recognisable
    const TOP_Q = 0.92;
    const MAX_FILE = 100 * 1024 * 1024, MAX_PHOTOS = 12;

    // Reads a number typed or pasted by a person: "100", " 1.5 ", "1,5", "1,000", "100kb", "2 MB".
    // Returns { blank } or { n, unit } (unit is 'KB', 'MB' or '' when none was typed) or { err: 'nan' }.
    function parseNumber(text) {
        let s = String(text == null ? '' : text).trim().toLowerCase().replace(/\s+/g, '');
        if (!s) return { blank: true };
        let unit = '';
        const u = s.match(/(kb|k|mb|m|bytes|b)$/);
        if (u && s.length > u[0].length) { unit = u[1][0] === 'm' ? 'MB' : u[1][0] === 'k' ? 'KB' : 'B'; s = s.slice(0, -u[0].length); }
        if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
        else if (/^-?\d*,\d+$/.test(s)) s = s.replace(',', '.');
        if (!/^-?(\d+\.?\d*|\.\d+)$/.test(s)) return { err: 'nan' };
        return { n: parseFloat(s), unit };
    }

    const round1 = n => Math.round(n * 10) / 10;

    // The "Must be under" limit, typed in the unit box ('KB' or 'MB'). Returns { kb } or { err }.
    function parseLimit(text, unit) {
        const r = parseNumber(text);
        if (r.blank) return { err: 'blank' };
        if (r.err) return r;
        if (r.unit === 'B') return { err: 'nan' };
        const u = r.unit || unit || 'KB';
        if (r.n <= 0) return { err: r.n < 0 ? 'negative' : 'zero' };
        const kb = round1(u === 'MB' ? r.n * 1000 : r.n);
        if (kb < LIMIT_MIN_KB) return { err: 'small' };
        if (kb > LIMIT_MAX_KB) return { err: 'big' };
        return { kb };
    }

    // The optional "At least" size in KB. Empty means no minimum. Returns { kb } (0 = none) or { err }.
    function parseMin(text) {
        const r = parseNumber(text);
        if (r.blank) return { kb: 0 };
        if (r.err || r.unit === 'B') return { err: 'nan' };
        if (r.n < 0) return { err: 'negative' };
        return { kb: round1(r.unit === 'MB' ? r.n * 1000 : r.n) };
    }

    // Optional exact width and height. Both empty = off. Returns { off } or { w, h } or { err }.
    function parsePixels(wText, hText) {
        const a = String(wText == null ? '' : wText).trim(), b = String(hText == null ? '' : hText).trim();
        if (!a && !b) return { off: true };
        if (!a || !b) return { err: 'one' };
        const clean = s => s.replace(/\s*px$/i, '');
        if (!/^\d+$/.test(clean(a)) || !/^\d+$/.test(clean(b))) return { err: 'nan' };
        const w = parseInt(clean(a), 10), h = parseInt(clean(b), 10);
        if (w < PX_MIN || h < PX_MIN || w > PX_MAX || h > PX_MAX) return { err: 'range' };
        return { w, h };
    }

    const maxBytes = kb => Math.floor(kb * 1000);
    const minBytes = kb => Math.ceil(kb * 1024);
    // A minimum must leave room under the limit (at least 10%), or no photo can fit between them.
    const minFits = (minKB, maxKB) => !minKB || minBytes(minKB) <= maxBytes(maxKB) * 0.9;

    // 3.4 MB, 96 KB, 48.3 KB, 812 bytes. Counted in 1024s like Windows and most upload forms, rounded down so a file
    // under the limit never shows as the limit itself.
    function fmtSize(bytes) {
        if (bytes < 1024) return bytes + ' bytes';
        const kb = bytes / 1024;
        if (kb < 1024) return (kb < 100 ? Math.floor(kb * 10) / 10 : Math.floor(kb)) + ' KB';
        return Math.floor(kb / 1024 * 10) / 10 + ' MB';
    }
    // 100 KB, 1 MB, 1.5 MB, 12.5 KB
    const limitLabel = kb => kb >= 1000 && Math.round(kb) % 100 === 0 ? round1(kb / 1000) + ' MB' : kb + ' KB';

    // Size of the picture after rotating (rot is 0, 90, 180 or 270).
    const turned = (w, h, rot) => rot % 180 ? { w: h, h: w } : { w, h };

    // The longest side to start from: the photo's own, but no more than phones can draw.
    function startLong(w, h) {
        let long = Math.min(Math.max(w, h), MAX_SIDE);
        const s = long / Math.max(w, h);
        if (w * s * h * s > MAX_AREA) long = Math.floor(long * Math.sqrt(MAX_AREA / (w * s * h * s)));
        return Math.max(1, long);
    }

    // Canvas size for a longest side. With exact pixels the size is fixed.
    function outSize(w, h, rot, px, long) {
        if (px && px.w) return { w: px.w, h: px.h };
        const t = turned(w, h, rot), s = long / Math.max(t.w, t.h);
        return { w: Math.max(1, Math.round(t.w * s)), h: Math.max(1, Math.round(t.h * s)) };
    }

    // Where the (turned) picture goes on the canvas. 'crop' fills it and cuts the edges, 'pad' fits it with white bars.
    function placement(w, h, outW, outH, fit) {
        const s = fit === 'pad' ? Math.min(outW / w, outH / h) : Math.max(outW / w, outH / h);
        const dw = w * s, dh = h * s;
        return { dx: (outW - dw) / 2, dy: (outH - dh) / 2, dw, dh };
    }

    const floorQ = long => long >= 1000 ? 0.7 : long >= 500 ? 0.5 : 0.3;

    // Finds the best picture under maxBytes. encode(long, quality) must resolve to an object with .size (bytes).
    // Keeps the quality high and makes the picture smaller (in pixels) only as much as needed.
    // o = { long, maxBytes, minBytes, fixed }  -> { ok, res, long, q, pad } or { ok: false, smallest }
    async function shrink(encode, o) {
        const max = o.maxBytes, min = o.minBytes || 0;
        let long = o.long, smallest = null;
        const best = async (r, q) => {
            if (r.size >= min) return { ok: true, res: r, long, q, pad: false };
            // under the minimum: try more quality first, then pad the file
            if (q < 1) {
                const hi = await encode(long, 1);
                if (hi.size < min) return { ok: true, res: hi, long, q: 1, pad: true };
                let a = q, b = 1, good = hi.size <= max ? hi : null, gq = 1;
                for (let i = 0; i < 7; i++) {           // the lowest quality that reaches the minimum and stays under the limit
                    const m = (a + b) / 2, t = await encode(long, m);
                    if (t.size < min) a = m; else { if (t.size <= max) { good = t; gq = m; } b = m; }
                }
                if (good) return { ok: true, res: good, long, q: gq, pad: false };
            }
            return { ok: true, res: r, long, q, pad: true };
        };
        for (let round = 0; round < 16; round++) {
            const top = await encode(long, TOP_Q);
            if (top.size <= max) return best(top, TOP_Q);
            const fq = o.fixed ? 0.05 : floorQ(long);
            const low = await encode(long, fq);
            if (!smallest || low.size < smallest.size) smallest = low;
            if (low.size <= max) {
                let a = fq, b = TOP_Q, good = low, gq = fq;
                for (let i = 0; i < 6; i++) {           // the highest quality that stays under the limit
                    const m = (a + b) / 2, t = await encode(long, m);
                    if (t.size <= max) { good = t; gq = m; a = m; } else b = m;
                }
                return best(good, gq);
            }
            if (o.fixed) break;
            const next = Math.floor(long * Math.max(0.5, Math.min(0.9, Math.sqrt(max / low.size) * 0.92)));
            if (next >= MIN_SIDE) long = next;
            else if (long > MIN_SIDE) long = MIN_SIDE;
            else break;
        }
        return { ok: false, smallest };
    }

    // Makes a JPEG file bigger without changing the picture, by adding empty comment blocks after the start marker.
    // Used only when a form asks for "at least" a size the picture does not reach. Returns a new Uint8Array.
    function padJpeg(bytes, target) {
        let need = target - bytes.length;
        if (need <= 0 || bytes[0] !== 0xFF || bytes[1] !== 0xD8) return bytes;
        if (need < 4) need = 4;                        // the smallest block is 4 bytes
        const segs = [];
        while (need > 0) {
            let n = Math.min(need, 65537);
            if (need - n > 0 && need - n < 4) n -= 4;  // never leave a remainder too small for a block
            segs.push(n); need -= n;
        }
        const out = new Uint8Array(bytes.length + segs.reduce((a, b) => a + b, 0));
        out.set(bytes.subarray(0, 2), 0);
        let at = 2;
        segs.forEach(n => {
            const len = n - 2;                         // the length counts itself, not the FF FE marker
            out[at] = 0xFF; out[at + 1] = 0xFE; out[at + 2] = len >> 8; out[at + 3] = len & 255;
            out.fill(0x20, at + 4, at + n); at += n;
        });
        out.set(bytes.subarray(2), at);
        return out;
    }
    const padTarget = (minKB, maxKB) => Math.min(minBytes(minKB) + 200, maxBytes(maxKB) - 4);

    // A JPEG that already fits and needs no change is kept exactly as it is.
    const canKeep = (file, rules, rot) => /^image\/jpe?g$/i.test(file.type || '') && !rot && !(rules.px && rules.px.w) &&
        file.size <= maxBytes(rules.maxKB) && file.size >= (rules.minKB ? minBytes(rules.minKB) : 0);

    // What kind of file was chosen: 'image', 'heic', 'pdf', 'empty', 'big' or 'other'.
    function kindOf(name, type, size) {
        const n = String(name || '').toLowerCase(), t = String(type || '').toLowerCase();
        if (size === 0) return 'empty';
        if (size > MAX_FILE) return 'big';
        if (/hei[cf]/.test(t) || /\.hei[cf]$/.test(n)) return 'heic';
        if (t === 'application/pdf' || /\.pdf$/.test(n)) return 'pdf';
        if (t.startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp|avif|tiff?|jfif)$/.test(n)) return 'image';
        return 'other';
    }

    // IMG_1234.HEIC + 100 KB -> IMG_1234-under-100KB.jpg
    function outName(name, maxKB) {
        let base = String(name || 'photo').replace(/\.[a-z0-9]{1,5}$/i, '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').trim().slice(0, 80);
        if (!base) base = 'photo';
        return base + '-under-' + limitLabel(maxKB).replace(' ', '') + '.jpg';
    }

    // Saved rules for the next photo, checked one by one; anything odd falls back to the defaults.
    const DEFAULTS = { maxKB: 100, minKB: 0, px: null, fit: 'crop' };
    function cleanRules(r) {
        const out = { maxKB: DEFAULTS.maxKB, minKB: 0, px: null, fit: 'crop' };
        if (!r || typeof r !== 'object') return out;
        if (typeof r.maxKB === 'number' && isFinite(r.maxKB) && r.maxKB >= LIMIT_MIN_KB && r.maxKB <= LIMIT_MAX_KB) out.maxKB = round1(r.maxKB);
        if (typeof r.minKB === 'number' && isFinite(r.minKB) && r.minKB > 0 && minFits(r.minKB, out.maxKB)) out.minKB = round1(r.minKB);
        if (r.px && Number.isInteger(r.px.w) && Number.isInteger(r.px.h) && r.px.w >= PX_MIN && r.px.h >= PX_MIN && r.px.w <= PX_MAX && r.px.h <= PX_MAX) out.px = { w: r.px.w, h: r.px.h };
        if (r.fit === 'pad') out.fit = 'pad';
        return out;
    }

    const api = { PRESETS, LIMIT_MIN_KB, LIMIT_MAX_KB, PX_MIN, PX_MAX, MAX_SIDE, MAX_AREA, MIN_SIDE, TOP_Q, MAX_FILE, MAX_PHOTOS, DEFAULTS,
        parseNumber, parseLimit, parseMin, parsePixels, maxBytes, minBytes, minFits, fmtSize, limitLabel, turned, startLong, outSize,
        placement, shrink, padJpeg, padTarget, canKeep, kindOf, outName, cleanRules };
    if (typeof module === 'object' && module.exports) module.exports = api; else root.PhotoCore = api;
})(this);
