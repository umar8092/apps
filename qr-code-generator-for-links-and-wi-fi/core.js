// QR Code Generator for Links and Wi-Fi: the logic, with no page code, so it can be checked with node tests.js.
// buildPayload() turns what the person typed into the exact text inside the code; encode() turns that text into squares.
(function (root) {
    const qr = root.qrcodegen || (typeof require !== 'undefined' ? require('./qrcodegen.js') : null);

    const TYPES = ['link', 'wifi', 'text', 'contact', 'phone', 'sms', 'email'];
    const TYPE_NAMES = { link: 'Link', wifi: 'Wi-Fi', text: 'Text', contact: 'Contact card', phone: 'Phone call', sms: 'Text message', email: 'Email' };
    const FIELDS = {
        link: ['url'],
        wifi: ['ssid', 'security', 'password', 'hidden'],
        text: ['text'],
        contact: ['first', 'last', 'mobile', 'email', 'org', 'title', 'work', 'website', 'address', 'note'],
        phone: ['number'],
        sms: ['number', 'message'],
        email: ['to', 'subject', 'body']
    };
    const ECLS = { L: 'LOW', M: 'MEDIUM', Q: 'QUARTILE', H: 'HIGH' };
    // Most bytes one code (version 40) holds at each error correction level
    const MAX_BYTES = { L: 2953, M: 2331, Q: 1663, H: 1273 };
    const SECURITY = ['WPA', 'WEP', 'nopass'];

    const str = v => (typeof v === 'string' ? v : v == null ? '' : String(v));
    const utf8Length = s => { let n = 0; for (const ch of s) { const c = ch.codePointAt(0); n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4; } return n; };

    // Wi-Fi codes need \ ; , : " escaped with a backslash. A name that looks like hex is put in quotes so phones do not read it as hex.
    function wifiEscape(s) { return s.replace(/([\\;,:"])/g, '\\$1'); }
    function wifiValue(s) { const e = wifiEscape(s); return /^[0-9a-f]+$/i.test(s) && s.length % 2 === 0 ? '"' + e + '"' : e; }
    // vCard text needs \ , ; and new lines escaped
    function vEscape(s) { return s.replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/([,;])/g, '\\$1'); }

    // Phone numbers: keep a leading + and the digits; spaces, dashes, dots and brackets are dropped
    function cleanPhone(raw) {
        const s = str(raw).trim();
        if (!s) return { ok: false, error: 'Type the phone number.' };
        if (/[^\d+\s().\-\/]/.test(s)) return { ok: false, error: 'A phone number has only digits, with + at the start for the country code.' };
        if (s.indexOf('+') > 0 || (s.match(/\+/g) || []).length > 1) return { ok: false, error: 'The + goes only at the very start, for the country code.' };
        const out = s.replace(/[^\d+]/g, '');
        const digits = out.replace(/\D/g, '');
        if (digits.length < 3) return { ok: false, error: 'This phone number is too short.' };
        if (digits.length > 17) return { ok: false, error: 'This phone number is too long. Check it.' };
        return { ok: true, value: out };
    }

    const KNOWN_SCHEMES = /^(mailto|tel|sms|smsto|geo|bitcoin|upi|whatsapp|market|itms-apps|spotify|skype|facetime|maps):/i;
    function cleanUrl(raw) {
        let s = str(raw).replace(/[\r\n\t]+/g, '').trim();
        if (!s) return { ok: false, error: 'Type or paste the link.' };
        const notes = [];
        if (/\s/.test(s)) { s = s.replace(/\s/g, '%20'); notes.push('The spaces in the link were changed to %20 so it still opens.'); }
        if (!/^[a-z][a-z0-9+.\-]*:\/\//i.test(s) && !KNOWN_SCHEMES.test(s)) s = 'https://' + s.replace(/^\/+/, '');
        const host = (s.match(/^[a-z][a-z0-9+.\-]*:\/\/([^\/?#:]*)/i) || [])[1];
        if (host !== undefined && !/\./.test(host) && host.toLowerCase() !== 'localhost') notes.push('Check the link: "' + host + '" has no ending like .com, so it may not open.');
        return { ok: true, value: s, notes };
    }

    // Returns { ok, text, notes } or { ok:false, error, field }
    function buildPayload(type, f) {
        f = f || {};
        const g = k => str(f[k]);
        if (type === 'link') {
            const u = cleanUrl(g('url'));
            if (!u.ok) return { ok: false, error: u.error, field: 'url' };
            return { ok: true, text: u.value, notes: u.notes, opens: u.value };
        }
        if (type === 'wifi') {
            const ssid = g('ssid').replace(/[\r\n]+/g, ' ').trim();
            if (!ssid) return { ok: false, error: 'Type the Wi-Fi network name, exactly as it shows on your phone.', field: 'ssid' };
            if (utf8Length(ssid) > 32) return { ok: false, error: 'Wi-Fi network names are at most 32 characters. Check it.', field: 'ssid' };
            const sec = SECURITY.includes(g('security')) ? g('security') : 'WPA';
            const pw = g('password').replace(/[\r\n]+/g, '');
            const notes = [];
            if (sec !== 'nopass') {
                if (!pw) return { ok: false, error: 'Type the Wi-Fi password, or choose None (open network).', field: 'password' };
                if (/^\s|\s$/.test(pw)) notes.push('The password starts or ends with a space. Remove it unless the password really has one.');
                if (sec === 'WPA' && pw.length < 8) notes.push('WPA passwords are usually at least 8 characters. Check the password.');
                if (sec === 'WPA' && pw.length > 63 && !(pw.length === 64 && /^[0-9a-f]+$/i.test(pw))) notes.push('WPA passwords are at most 63 characters. Check the password.');
                if (sec === 'WEP' && ![5, 13, 10, 26].includes(pw.length)) notes.push('WEP passwords are 5 or 13 characters, or 10 or 26 hex digits. Check the password.');
            }
            let text = 'WIFI:T:' + sec + ';S:' + wifiValue(ssid) + ';';
            if (sec !== 'nopass') text += 'P:' + wifiValue(pw) + ';';
            if (f.hidden === true || f.hidden === 'true') text += 'H:true;';
            text += ';';
            return { ok: true, text, notes, ssid, password: sec === 'nopass' ? '' : pw, security: sec };
        }
        if (type === 'text') {
            const t = g('text').replace(/\s+$/, '');
            if (!t.trim()) return { ok: false, error: 'Type the text the code should show.', field: 'text' };
            return { ok: true, text: t.replace(/\r\n?/g, '\n'), notes: [] };
        }
        if (type === 'contact') {
            const one = k => g(k).replace(/[\r\n]+/g, ' ').trim();
            const first = one('first'), last = one('last'), org = one('org');
            if (!first && !last && !org) return { ok: false, error: 'Type a name or a company.', field: 'first' };
            const L = ['BEGIN:VCARD', 'VERSION:3.0', 'N:' + vEscape(last) + ';' + vEscape(first) + ';;;', 'FN:' + vEscape([first, last].filter(Boolean).join(' ') || org)];
            if (org) L.push('ORG:' + vEscape(org));
            if (one('title')) L.push('TITLE:' + vEscape(one('title')));
            for (const [k, label] of [['mobile', 'TEL;TYPE=CELL:'], ['work', 'TEL;TYPE=WORK:']]) {
                if (!one(k)) continue;
                const p = cleanPhone(one(k));
                if (!p.ok) return { ok: false, error: p.error, field: k };
                L.push(label + p.value);
            }
            if (one('email')) {
                if (!EMAIL_RE.test(one('email'))) return { ok: false, error: 'This email address does not look right. Check it.', field: 'email' };
                L.push('EMAIL:' + one('email'));
            }
            if (one('website')) { const u = cleanUrl(one('website')); L.push('URL:' + vEscape(u.value)); }
            if (g('address').trim()) L.push('ADR:;;' + vEscape(g('address').trim().replace(/\s*[\r\n]+\s*/g, ', ')) + ';;;;');
            if (g('note').trim()) L.push('NOTE:' + vEscape(g('note').trim()));
            L.push('END:VCARD');
            return { ok: true, text: L.join('\n'), notes: [] };
        }
        if (type === 'phone') {
            const p = cleanPhone(g('number'));
            if (!p.ok) return { ok: false, error: p.error, field: 'number' };
            const notes = p.value.startsWith('+') ? [] : ['Tip: start with the country code, like +44, if people in other countries may scan it.'];
            return { ok: true, text: 'tel:' + p.value, notes };
        }
        if (type === 'sms') {
            const p = cleanPhone(g('number'));
            if (!p.ok) return { ok: false, error: p.error, field: 'number' };
            const msg = g('message').replace(/\r\n?/g, '\n').trim();
            return { ok: true, text: 'SMSTO:' + p.value + ':' + msg, notes: [] };
        }
        if (type === 'email') {
            const to = g('to').trim();
            if (!to) return { ok: false, error: 'Type the email address.', field: 'to' };
            if (!EMAIL_RE.test(to)) return { ok: false, error: 'This email address does not look right. Check it.', field: 'to' };
            const q = [];
            if (g('subject').trim()) q.push('subject=' + encodeURIComponent(g('subject').trim()));
            if (g('body').trim()) q.push('body=' + encodeURIComponent(g('body').trim().replace(/\r?\n/g, '\r\n')));
            return { ok: true, text: 'mailto:' + to + (q.length ? '?' + q.join('&') : ''), notes: [] };
        }
        return { ok: false, error: 'Choose what the code should do.', field: null };
    }
    const EMAIL_RE = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>".]{2,}$/;

    // Text -> squares. Returns { ok, size, modules: boolean[][], version } or { ok:false, error, bytes, max }
    function encode(text, ecl) {
        ecl = ECLS[ecl] ? ecl : 'M';
        const bytes = utf8Length(text);
        try {
            const segs = qr.QrSegment.makeSegments(text);
            const code = qr.QrCode.encodeSegments(segs, qr.QrCode.Ecc[ECLS[ecl]], 1, 40, -1, false);
            const modules = [];
            for (let y = 0; y < code.size; y++) { const row = []; for (let x = 0; x < code.size; x++) row.push(code.getModule(x, y)); modules.push(row); }
            return { ok: true, size: code.size, version: code.version, modules, bytes };
        } catch (e) {
            const max = MAX_BYTES[ecl];
            const lower = Object.keys(MAX_BYTES).filter(k => MAX_BYTES[k] >= bytes && MAX_BYTES[k] > max);
            return { ok: false, bytes, max, error: 'This is too long for one QR code: ' + fmt(bytes) + ' letters and symbols, and a code holds at most ' + fmt(max) + ' at this error correction.' +
                (lower.length ? ' Choose Low error correction (holds ' + fmt(MAX_BYTES.L) + ') or make it shorter.' : ' Make it shorter, or put it on a web page and make a code for the link.') };
        }
    }
    const fmt = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

    // Smallest sensible printed width: about 0.5 mm per square including the quiet border, never under 2 cm
    function printWidthCm(size) { return Math.max(2, Math.ceil((size + 8) * 0.05 * 2) / 2); }

    // Picture layout. The QR keeps a quiet border of 4 squares; each square is a whole number of pixels so it stays sharp.
    // Returns the exact width asked for (or the smallest that fits), square size and where the code starts.
    function layout(size, widthPx) {
        const units = size + 8;
        const w = Math.max(units, Math.round(widthPx) || 0);
        const unit = Math.floor(w / units);
        const offset = Math.floor((w - unit * size) / 2);
        return { width: w, unit, offset, minWidth: units, grew: w > Math.round(widthPx || 0) };
    }

    // One path for all dark squares, in units of squares, with the quiet border
    function svgPath(modules, quiet) {
        quiet = quiet == null ? 4 : quiet;
        let d = '';
        modules.forEach((row, y) => {
            let x = 0;
            while (x < row.length) {
                if (!row[x]) { x++; continue; }
                let end = x; while (end < row.length && row[end]) end++;
                d += 'M' + (x + quiet) + ' ' + (y + quiet) + 'h' + (end - x) + 'v1h-' + (end - x) + 'z';
                x = end;
            }
        });
        return d;
    }

    const xmlEscape = s => str(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

    // A complete SVG file. lines = caption lines already wrapped to fit the width.
    function svgFile(modules, opts) {
        opts = opts || {};
        const n = modules.length, units = n + 8;
        const lines = (opts.lines || []).filter(l => l && l.text);
        const lineH = units * 0.085, pad = lines.length ? units * 0.04 : 0;
        const h = units + (lines.length ? lines.length * lineH + pad : 0);
        const fg = HEX_RE.test(opts.fg) ? opts.fg : '#000000', bg = HEX_RE.test(opts.bg) ? opts.bg : '#ffffff';
        let s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + units + ' ' + round(h) + '" width="' + (opts.px || units * 10) + '" height="' + round((opts.px || units * 10) * h / units) + '" shape-rendering="crispEdges">';
        if (!opts.transparent) s += '<rect width="100%" height="100%" fill="' + bg + '"/>';
        s += '<path fill="' + fg + '" d="' + svgPath(modules) + '"/>';
        lines.forEach((l, i) => {
            s += '<text x="' + units / 2 + '" y="' + round(units - 1 + (i + 0.8) * lineH) + '" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="' + round(lineH * (l.bold ? 0.62 : 0.56)) + '"' + (l.bold ? ' font-weight="700"' : '') + ' fill="' + fg + '">' + xmlEscape(l.text) + '</text>';
        });
        return s + '</svg>';
    }
    const round = v => Math.round(v * 100) / 100;
    const HEX_RE = /^#[0-9a-f]{6}$/i;

    // Contrast between the dots and the background (WCAG ratio). Phones need dark dots on a light background.
    function lum(hex) {
        const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
        return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    }
    function colourCheck(fg, bg, transparent) {
        if (!HEX_RE.test(fg) || !HEX_RE.test(bg)) return { ok: false, warning: 'Pick a colour for the dots and the background.' };
        const back = transparent ? '#ffffff' : bg;
        const a = lum(fg), b = lum(back), ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        if (a > b) return { ok: false, ratio, warning: 'The dots are lighter than the background. Many phone cameras cannot read that. Make the dots dark and the background light.' };
        if (ratio < 4) return { ok: false, ratio, warning: 'The dots and the background are too alike, so phones may not read the code. Make the dots darker or the background lighter.' };
        if (transparent && a > 0.18) return { ok: true, ratio, warning: 'See-through background: put the code only on a light background, or phones may not read it.' };
        return { ok: true, ratio, warning: transparent ? 'See-through background: put the code only on a light background.' : '' };
    }

    // Short words for the saved list and the picture's description
    function describe(type, f) {
        f = f || {};
        const g = k => str(f[k]).trim();
        const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
        switch (type) {
            case 'link': return g('url') ? 'Opens ' + cut(g('url').replace(/^https?:\/\//i, ''), 60) : 'Link';
            case 'wifi': return g('ssid') ? 'Joins Wi-Fi ' + cut(g('ssid'), 40) : 'Wi-Fi';
            case 'text': return g('text') ? 'Shows "' + cut(g('text').replace(/\s+/g, ' '), 50) + '"' : 'Text';
            case 'contact': { const n = [g('first'), g('last')].filter(Boolean).join(' ') || g('org'); return n ? 'Contact card for ' + cut(n, 40) : 'Contact card'; }
            case 'phone': return g('number') ? 'Calls ' + cut(g('number'), 30) : 'Phone call';
            case 'sms': return g('number') ? 'Text message to ' + cut(g('number'), 30) : 'Text message';
            case 'email': return g('to') ? 'Email to ' + cut(g('to'), 50) : 'Email';
        }
        return 'QR code';
    }

    // Words under the code: own caption first, then for Wi-Fi the network and password if asked
    function captionLines(type, f, opts) {
        opts = opts || {};
        const out = [];
        const cap = str(opts.caption).replace(/[\r\n]+/g, ' ').trim();
        if (cap) out.push({ text: cap, bold: true });
        if (type === 'wifi' && opts.wifiText !== false) {
            const p = buildPayload('wifi', f);
            if (p.ok) {
                out.push({ text: 'Network: ' + p.ssid });
                out.push({ text: p.security === 'nopass' ? 'No password' : 'Password: ' + p.password });
            }
        }
        return out;
    }

    // Saved state and saved codes are checked field by field; anything odd is dropped
    function cleanFields(type, f) {
        const out = {};
        if (!f || typeof f !== 'object') return out;
        (FIELDS[type] || []).forEach(k => {
            if (k === 'hidden') out[k] = f[k] === true;
            else if (typeof f[k] === 'string') out[k] = f[k].slice(0, 4000);
        });
        if (type === 'wifi' && !SECURITY.includes(out.security)) out.security = 'WPA';
        return out;
    }
    const SIZES = [256, 512, 1024, 2048];
    function cleanLook(o) {
        o = o && typeof o === 'object' ? o : {};
        const size = Math.round(Number(o.size));
        return {
            ecl: ECLS[o.ecl] ? o.ecl : 'M',
            fg: HEX_RE.test(o.fg) ? o.fg.toLowerCase() : '#000000',
            bg: HEX_RE.test(o.bg) ? o.bg.toLowerCase() : '#ffffff',
            transparent: o.transparent === true,
            size: size >= 64 && size <= 4096 ? size : 1024,
            caption: typeof o.caption === 'string' ? o.caption.slice(0, 80) : '',
            wifiText: o.wifiText !== false
        };
    }
    function cleanSaved(list) {
        if (!Array.isArray(list)) return [];
        const seen = new Set();
        return list.filter(x => x && typeof x === 'object' && TYPES.includes(x.type) && typeof x.id === 'string' && x.id && !seen.has(x.id) && seen.add(x.id))
            .slice(0, 200)
            .map(x => ({ id: x.id.slice(0, 40), type: x.type, name: (typeof x.name === 'string' && x.name.trim() ? x.name.trim() : describe(x.type, x.fields)).slice(0, 80), fields: cleanFields(x.type, x.fields), look: cleanLook(x.look), saved: Number.isFinite(x.saved) ? x.saved : 0 }));
    }

    const api = { TYPES, TYPE_NAMES, FIELDS, MAX_BYTES, SIZES, wifiEscape, vEscape, cleanPhone, cleanUrl, buildPayload, encode, printWidthCm, layout, svgPath, svgFile, xmlEscape, colourCheck, describe, captionLines, cleanFields, cleanLook, cleanSaved, utf8Length };
    if (typeof module !== 'undefined') module.exports = api; else root.QrCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
