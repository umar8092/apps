// Document Scanner to PDF: the maths, with no page code. Works in the browser (window.ScanCore) and in Node (require).
// Pictures are plain objects { data: Uint8ClampedArray RGBA, width, height }, like the browser's ImageData.
(function (root) {
    const MAX_PAGES = 60;          // pages in one PDF
    const STORE_LONG = 2400;       // a photo is kept at most this many pixels on its long side
    const PAGE_LONG = 2000;        // a finished page is at most this many pixels on its long side (about 170 dpi on A4)
    const MB = 1000000;            // 1 MB = 1,000,000 bytes, the smaller meaning, so a "10 MB" limit is safe either way
    const LOOKS = ['color', 'grey', 'bw', 'photo'];
    const PAPERS = { a4: [595.28, 841.89], letter: [612, 792] };

    // ---- what kind of file was chosen
    function kindOf(name, type, size) {
        const n = String(name || '').toLowerCase(), t = String(type || '').toLowerCase();
        if (size === 0) return 'empty';
        if (t === 'application/pdf' || /\.pdf$/.test(n)) return 'pdf';
        if (/heic|heif/.test(t) || /\.(heic|heif)$/.test(n)) return size > 60 * MB ? 'big' : 'heic';
        if (/^image\//.test(t) || /\.(jpe?g|png|webp|gif|bmp|avif)$/.test(n)) return size > 60 * MB ? 'big' : 'image';
        return 'other';
    }

    // ---- sizes and names
    function fmtSize(bytes) {
        if (!(bytes >= 0)) return '';
        if (bytes < 1000) return bytes + ' bytes';
        if (bytes < MB) return Math.max(1, Math.round(bytes / 1000)) + ' KB';
        const v = bytes / MB;
        return (v < 10 ? (Math.ceil(v * 100) / 100).toFixed(2) : (Math.ceil(v * 10) / 10).toFixed(1)) + ' MB';  // rounded up, never shows under the real size
    }
    // "10", "2.5", "1,5" -> bytes; '' -> no limit
    function parseLimit(text) {
        const s = String(text == null ? '' : text).trim().replace(/\s*mb$/i, '').replace(',', '.');
        if (s === '') return { bytes: 0 };
        if (!/^\d*\.?\d+$/.test(s)) return { err: 'nan' };
        const v = parseFloat(s);
        if (v < 0.1) return { err: 'small' };
        if (v > 500) return { err: 'big' };
        return { bytes: Math.round(v * MB) };
    }
    function limitText(bytes) { return bytes ? fmtLimit(bytes / MB) + ' MB' : ''; }
    function fmtLimit(v) { return String(Math.round(v * 100) / 100); }
    function today(d) {
        d = d || new Date();
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }
    function fileName(text, d) {
        let s = String(text || '').replace(/[\u0000-\u001f\u007f\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
        s = s.replace(/(\.pdf)+$/i, '').replace(/^[.\s]+|[.\s]+$/g, '').slice(0, 80).trim();
        return (s || 'scan-' + today(d)) + '.pdf';
    }

    // ---- corners: [[x,y] top-left, top-right, bottom-right, bottom-left] in photo pixels
    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    function wholePhoto(w, h) { return [[0, 0], [w, 0], [w, h], [0, h]]; }
    function isConvex(q) {
        if (!Array.isArray(q) || q.length !== 4) return false;
        let sign = 0;
        for (let i = 0; i < 4; i++) {
            const a = q[i], b = q[(i + 1) % 4], c = q[(i + 2) % 4];
            const z = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
            if (Math.abs(z) < 1e-9) return false;
            if (!sign) sign = Math.sign(z); else if (Math.sign(z) !== sign) return false;
        }
        return true;
    }
    function quadArea(q) {
        let a = 0;
        for (let i = 0; i < 4; i++) { const p = q[i], n = q[(i + 1) % 4]; a += p[0] * n[1] - n[0] * p[1]; }
        return Math.abs(a) / 2;
    }
    // Puts four points in the order top-left, top-right, bottom-right, bottom-left (by angle around their centre)
    function orderCorners(pts) {
        const cx = pts.reduce((s, p) => s + p[0], 0) / 4, cy = pts.reduce((s, p) => s + p[1], 0) / 4;
        const s = pts.slice().sort((a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx));
        // sorted clockwise on screen starting near the left; start at the point with the smallest x+y
        let start = 0; s.forEach((p, i) => { if (p[0] + p[1] < s[start][0] + s[start][1]) start = i; });
        return [0, 1, 2, 3].map(i => s[(start + i) % 4].slice());
    }
    function validCorners(q, w, h) {
        return Array.isArray(q) && q.length === 4 && q.every(p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite) && p[0] >= -1 && p[1] >= -1 && p[0] <= w + 1 && p[1] <= h + 1)
            && isConvex(q) && quadArea(q) >= 64;
    }
    // Finished page size in pixels from the corners: the longer of each pair of opposite edges, at most PAGE_LONG
    function outSize(q, rot) {
        let w = Math.max(dist(q[0], q[1]), dist(q[3], q[2])), h = Math.max(dist(q[0], q[3]), dist(q[1], q[2]));
        const s = Math.min(1, PAGE_LONG / Math.max(w, h));
        w = Math.max(1, Math.round(w * s)); h = Math.max(1, Math.round(h * s));
        return (rot / 90) % 2 ? { w: h, h: w } : { w, h };
    }

    // ---- straightening: the 3x3 matrix that maps the finished page (u,v) to the photo (x,y)
    function homography(src, W, H) {
        const dst = [[0, 0], [W, 0], [W, H], [0, H]], A = [], b = [];
        for (let i = 0; i < 4; i++) {
            const [u, v] = dst[i], [x, y] = src[i];
            A.push([u, v, 1, 0, 0, 0, -u * x, -v * x]); b.push(x);
            A.push([0, 0, 0, u, v, 1, -u * y, -v * y]); b.push(y);
        }
        for (let c = 0; c < 8; c++) {   // Gaussian elimination with pivoting
            let p = c; for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
            [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
            for (let r = 0; r < 8; r++) {
                if (r === c) continue;
                const f = A[r][c] / A[c][c];
                for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k];
                b[r] -= f * b[c];
            }
        }
        const h = b.map((v, i) => v / A[i][i]);
        return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
    }
    function mapPoint(m, u, v) {
        const d = m[6] * u + m[7] * v + m[8];
        return [(m[0] * u + m[1] * v + m[2]) / d, (m[3] * u + m[4] * v + m[5]) / d];
    }
    // Cuts the page out of the photo and makes it a straight W x H rectangle (bilinear sampling)
    function warp(img, q, W, H) {
        const m = homography(q, W, H), out = new Uint8ClampedArray(W * H * 4), s = img.data, sw = img.width, sh = img.height;
        let o = 0;
        for (let v = 0; v < H; v++) {
            for (let u = 0; u < W; u++, o += 4) {
                const uu = u + 0.5, vv = v + 0.5, d = m[6] * uu + m[7] * vv + m[8];
                let x = (m[0] * uu + m[1] * vv + m[2]) / d - 0.5, y = (m[3] * uu + m[4] * vv + m[5]) / d - 0.5;
                if (x < 0) x = 0; else if (x > sw - 1) x = sw - 1;
                if (y < 0) y = 0; else if (y > sh - 1) y = sh - 1;
                const x0 = x | 0, y0 = y | 0, x1 = x0 + 1 < sw ? x0 + 1 : x0, y1 = y0 + 1 < sh ? y0 + 1 : y0, fx = x - x0, fy = y - y0;
                const i00 = (y0 * sw + x0) * 4, i10 = (y0 * sw + x1) * 4, i01 = (y1 * sw + x0) * 4, i11 = (y1 * sw + x1) * 4;
                for (let c = 0; c < 3; c++) {
                    const top = s[i00 + c] + (s[i10 + c] - s[i00 + c]) * fx, bot = s[i01 + c] + (s[i11 + c] - s[i01 + c]) * fx;
                    out[o + c] = top + (bot - top) * fy;
                }
                out[o + 3] = 255;
            }
        }
        return { data: out, width: W, height: H };
    }
    // Turns a picture a quarter, half or three quarters clockwise
    function rotate(img, deg) {
        deg = ((deg % 360) + 360) % 360;
        if (!deg) return img;
        const w = img.width, h = img.height, W = deg === 180 ? w : h, H = deg === 180 ? h : w, s = img.data, out = new Uint8ClampedArray(s.length);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            let X, Y;
            if (deg === 90) { X = h - 1 - y; Y = x; } else if (deg === 180) { X = w - 1 - x; Y = h - 1 - y; } else { X = y; Y = w - 1 - x; }
            const i = (y * w + x) * 4, j = (Y * W + X) * 4;
            out[j] = s[i]; out[j + 1] = s[i + 1]; out[j + 2] = s[i + 2]; out[j + 3] = 255;
        }
        return { data: out, width: W, height: H };
    }

    // ---- making paper white and text dark
    function luminance(img) {
        const n = img.width * img.height, L = new Float32Array(n), d = img.data;
        for (let i = 0, j = 0; i < n; i++, j += 4) L[i] = 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2];
        return L;
    }
    // How bright the paper is at each point: a bright value of each small block, spread over the text, smoothed
    function paperLevel(L, w, h) {
        const bs = Math.max(8, Math.round(Math.max(w, h) / 40)), gw = Math.ceil(w / bs), gh = Math.ceil(h / bs), g = new Float32Array(gw * gh);
        const hist = new Uint32Array(64);
        for (let by = 0; by < gh; by++) for (let bx = 0; bx < gw; bx++) {
            hist.fill(0); let n = 0;
            const x1 = Math.min(w, (bx + 1) * bs), y1 = Math.min(h, (by + 1) * bs);
            for (let y = by * bs; y < y1; y += 2) for (let x = bx * bs; x < x1; x += 2) { hist[Math.min(63, L[y * w + x] >> 2)]++; n++; }
            let want = n * 0.1, k = 63;  // the brightest 10%
            for (; k > 0; k--) { want -= hist[k]; if (want <= 0) break; }
            g[by * gw + bx] = k * 4 + 2;
        }
        // spread the brightest neighbour (covers blocks full of text), then smooth
        const grow = new Float32Array(g.length), sm = new Float32Array(g.length);
        for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
            let m = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < gw && Y < gh) m = Math.max(m, g[Y * gw + X]); }
            grow[y * gw + x] = m;
        }
        // a large darker area (an ID photo, a coloured box) is not paper: never treat paper as darker than 62% of the usual paper
        const sorted = Array.from(grow).sort((a, b) => a - b), floor = sorted[Math.floor(sorted.length * 0.75)] * 0.62;
        for (let i = 0; i < grow.length; i++) if (grow[i] < floor) grow[i] = floor;
        for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
            let t = 0, n = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < gw && Y < gh) { t += grow[Y * gw + X]; n++; } }
            sm[y * gw + x] = Math.max(48, t / n);
        }
        return { g: sm, gw, gh, bs };
    }
    function levelAt(P, x, y) {
        const fx = Math.min(P.gw - 1, Math.max(0, (x + 0.5) / P.bs - 0.5)), fy = Math.min(P.gh - 1, Math.max(0, (y + 0.5) / P.bs - 0.5));
        const x0 = fx | 0, y0 = fy | 0, x1 = Math.min(P.gw - 1, x0 + 1), y1 = Math.min(P.gh - 1, y0 + 1), ax = fx - x0, ay = fy - y0, g = P.g;
        const t = g[y0 * P.gw + x0] + (g[y0 * P.gw + x1] - g[y0 * P.gw + x0]) * ax, b = g[y1 * P.gw + x0] + (g[y1 * P.gw + x1] - g[y1 * P.gw + x0]) * ax;
        return t + (b - t) * ay;
    }
    // look: 'color' clean colour (white paper, colours kept), 'grey', 'bw' black and white, 'photo' unchanged
    function applyLook(img, look) {
        if (look === 'photo' || LOOKS.indexOf(look) < 0) return img;
        const w = img.width, h = img.height, d = img.data, L = luminance(img), P = paperLevel(L, w, h);
        const lo = 25, hi = 225, k = 255 / (hi - lo);
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const i = y * w + x, j = i * 4, f = 255 / levelAt(P, x, y);
                if (look === 'color') {
                    for (let c = 0; c < 3; c++) { const v = (d[j + c] * f - lo) * k; d[j + c] = v < 0 ? 0 : v > 255 ? 255 : v; }
                } else {
                    let v = (L[i] * f - lo) * k;
                    if (look === 'bw') v = v < 150 ? 0 : v > 200 ? 255 : (v - 150) * 5.1;   // a short soft edge keeps letters smooth
                    v = v < 0 ? 0 : v > 255 ? 255 : v;
                    d[j] = d[j + 1] = d[j + 2] = v;
                }
            }
        }
        return img;
    }

    // ---- finding the page in a small copy of the photo (a light page on a darker table)
    function otsu(L) {
        const hist = new Float64Array(256); for (let i = 0; i < L.length; i++) hist[L[i] | 0]++;
        let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
        let sB = 0, wB = 0, best = -1, t = 128;
        for (let i = 0; i < 256; i++) {
            wB += hist[i]; if (!wB) continue; const wF = L.length - wB; if (!wF) break;
            sB += i * hist[i]; const mB = sB / wB, mF = (sum - sB) / wF, v = wB * wF * (mB - mF) * (mB - mF);
            if (v > best) { best = v; t = i; }
        }
        return { t, sep: Math.sqrt(best / (L.length * L.length)) };
    }
    function detectPage(img) {
        const w = img.width, h = img.height, n = w * h;
        if (w < 16 || h < 16) return null;
        const L = luminance(img), o = otsu(L);
        if (o.sep < 18) return null;                      // no clear light page against a darker background
        const mask = new Uint8Array(n); for (let i = 0; i < n; i++) mask[i] = L[i] > o.t ? 1 : 0;
        // largest light patch
        const lab = new Int32Array(n), stack = new Int32Array(n); let best = 0, bestSize = 0, id = 0;
        for (let s = 0; s < n; s++) {
            if (!mask[s] || lab[s]) continue;
            id++; let top = 0, size = 0; stack[top++] = s; lab[s] = id;
            while (top) {
                const p = stack[--top]; size++; const x = p % w, y = (p / w) | 0;
                if (x > 0 && mask[p - 1] && !lab[p - 1]) { lab[p - 1] = id; stack[top++] = p - 1; }
                if (x < w - 1 && mask[p + 1] && !lab[p + 1]) { lab[p + 1] = id; stack[top++] = p + 1; }
                if (y > 0 && mask[p - w] && !lab[p - w]) { lab[p - w] = id; stack[top++] = p - w; }
                if (y < h - 1 && mask[p + w] && !lab[p + w]) { lab[p + w] = id; stack[top++] = p + w; }
            }
            if (size > bestSize) { bestSize = size; best = id; }
        }
        if (bestSize < n * 0.08 || bestSize > n * 0.97) return null;
        // the four corners: the points furthest out along the diagonals
        let tl, tr, br, bl, a = Infinity, b = -Infinity, c = -Infinity, e = Infinity;
        for (let p = 0; p < n; p++) {
            if (lab[p] !== best) continue;
            const x = p % w + 0.5, y = (p / w | 0) + 0.5;
            if (x + y < a) { a = x + y; tl = [x, y]; }
            if (x + y > b) { b = x + y; br = [x, y]; }
            if (x - y > c) { c = x - y; tr = [x, y]; }
            if (x - y < e) { e = x - y; bl = [x, y]; }
        }
        let q = [tl, tr, br, bl];
        // a page turned about 45 degrees: the diagonals find edges, not corners; try the straight directions instead
        if (!isConvex(q) || quadArea(q) < bestSize * 0.8) {
            let l, r, t, bo, minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            for (let p = 0; p < n; p++) {
                if (lab[p] !== best) continue;
                const x = p % w + 0.5, y = (p / w | 0) + 0.5;
                if (x < minX) { minX = x; l = [x, y]; } if (x > maxX) { maxX = x; r = [x, y]; }
                if (y < minY) { minY = y; t = [x, y]; } if (y > maxY) { maxY = y; bo = [x, y]; }
            }
            q = orderCorners([l, t, r, bo]);
        }
        if (!isConvex(q) || quadArea(q) < bestSize * 0.8 || quadArea(q) > bestSize * 1.25) return null;   // not a four-sided page
        return q;
    }
    function scaleCorners(q, s) { return q.map(p => [p[0] * s, p[1] * s]); }
    // moves each corner a little towards the middle so a sliver of table is not left at the edges
    function inset(q, frac) {
        const cx = q.reduce((s, p) => s + p[0], 0) / 4, cy = q.reduce((s, p) => s + p[1], 0) / 4;
        return q.map(p => [p[0] + (cx - p[0]) * frac, p[1] + (cy - p[1]) * frac]);
    }

    // ---- PDF pages: where the picture goes on the paper, in points (1/72 inch)
    function placement(w, h, paper) {
        let pw, ph;
        if (paper === 'fit') { const s = 841.89 / Math.max(w, h); pw = w * s; ph = h * s; }
        else { const p = PAPERS[paper] || PAPERS.a4; [pw, ph] = w > h ? [p[1], p[0]] : p; }
        const s = Math.min(pw / w, ph / h), dw = w * s, dh = h * s;
        const r = v => Math.round(v * 100) / 100;
        return { pw: r(pw), ph: r(ph), x: r((pw - dw) / 2), y: r((ph - dh) / 2), w: r(dw), h: r(dh) };
    }
    // Writes a PDF with one JPEG picture per page. pages: [{ jpeg: Uint8Array, w, h }]
    function buildPdf(pages, paper, title) {
        const enc = s => { const a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i) & 255; return a; };
        const parts = [], offsets = []; let len = 0;
        const put = x => { const a = typeof x === 'string' ? enc(x) : x; parts.push(a); len += a.length; };
        const obj = (n, body) => { offsets[n] = len; put(n + ' 0 obj\n'); body(); put('\nendobj\n'); };
        const N = pages.length, kids = [];
        for (let i = 0; i < N; i++) kids.push((3 + i * 3) + ' 0 R');
        put('%PDF-1.4\n%âãÏÓ\n');
        obj(1, () => put('<< /Type /Catalog /Pages 2 0 R >>'));
        obj(2, () => put('<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + N + ' >>'));
        pages.forEach((pg, i) => {
            const n = 3 + i * 3, pl = placement(pg.w, pg.h, paper);
            const content = 'q\n' + pl.w + ' 0 0 ' + pl.h + ' ' + pl.x + ' ' + pl.y + ' cm\n/Im0 Do\nQ\n';
            obj(n, () => put('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + pl.pw + ' ' + pl.ph + '] /Resources << /XObject << /Im0 ' + (n + 2) + ' 0 R >> >> /Contents ' + (n + 1) + ' 0 R >>'));
            obj(n + 1, () => { put('<< /Length ' + content.length + ' >>\nstream\n'); put(content); put('\nendstream'); });
            obj(n + 2, () => {
                put('<< /Type /XObject /Subtype /Image /Width ' + pg.w + ' /Height ' + pg.h + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + pg.jpeg.length + ' >>\nstream\n');
                put(pg.jpeg); put('\nendstream');
            });
        });
        const info = 3 + N * 3, safe = String(title || '').replace(/[^\x20-\x7e]/g, '').replace(/[\\()]/g, '\\$&').slice(0, 100);
        obj(info, () => put('<< /Title (' + safe + ') /Producer (Document Scanner to PDF) >>'));
        const xref = len;
        let x = 'xref\n0 ' + (info + 1) + '\n0000000000 65535 f \n';
        for (let i = 1; i <= info; i++) x += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
        put(x + 'trailer\n<< /Size ' + (info + 1) + ' /Root 1 0 R /Info ' + info + ' 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');
        const out = new Uint8Array(len); let o = 0; parts.forEach(p => { out.set(p, o); o += p.length; });
        return out;
    }
    const pdfOverhead = n => 900 + n * 420;
    // The steps tried, in order, to get under a size limit: picture scale and JPEG quality
    const FIT_STEPS = [[1, 0.85], [1, 0.75], [1, 0.65], [1, 0.55], [0.85, 0.55], [0.85, 0.45], [0.7, 0.5], [0.7, 0.4], [0.58, 0.45], [0.48, 0.42], [0.4, 0.4]];

    // ---- saved pages: check every value read back from storage
    function cleanPage(p) {
        if (!p || typeof p !== 'object' || typeof p.id !== 'string' || !p.id) return null;
        const w = Math.round(+p.w), h = Math.round(+p.h);
        if (!(w >= 1 && h >= 1 && w <= 10000 && h <= 10000)) return null;
        const rot = [0, 90, 180, 270].indexOf(+p.rot) >= 0 ? +p.rot : 0;
        const look = LOOKS.indexOf(p.look) >= 0 ? p.look : 'color';
        const corners = validCorners(p.corners, w, h) ? p.corners.map(c => [+c[0], +c[1]]) : wholePhoto(w, h);
        return { id: p.id, w, h, rot, look, corners, auto: !!p.auto, order: Number.isFinite(+p.order) ? +p.order : 0 };
    }
    function cleanSettings(s) {
        s = s && typeof s === 'object' ? s : {};
        return {
            paper: ['a4', 'letter', 'fit'].indexOf(s.paper) >= 0 ? s.paper : '',
            limit: Number.isFinite(+s.limit) && +s.limit >= 0.1 * MB && +s.limit <= 500 * MB ? Math.round(+s.limit) : 0,
            look: LOOKS.indexOf(s.look) >= 0 ? s.look : 'color'
        };
    }
    function defaultPaper(lang) { return /^(en-(us|ca)|es-(us|mx)|fr-ca)$/i.test(String(lang || '')) || /-(US|CA|MX|PH|CL|CO)$/.test(String(lang || '')) ? 'letter' : 'a4'; }

    const api = { MAX_PAGES, STORE_LONG, PAGE_LONG, MB, LOOKS, PAPERS, FIT_STEPS, kindOf, fmtSize, parseLimit, limitText, fileName, today,
        wholePhoto, isConvex, quadArea, orderCorners, validCorners, outSize, homography, mapPoint, warp, rotate, luminance, applyLook,
        otsu, detectPage, scaleCorners, inset, placement, buildPdf, pdfOverhead, cleanPage, cleanSettings, defaultPaper };
    if (typeof module === 'object' && module.exports) module.exports = api; else root.ScanCore = api;
})(this);
