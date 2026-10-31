// Loyalty and Membership Card Wallet: barcode drawing and card list logic, with no page code.
// Every barcode is drawn from the number itself, so nothing ever has to be downloaded.
(function (root) {
    'use strict';
    const qr = root.qrcodegen || (typeof require !== 'undefined' ? require('./qrcodegen.js') : null);

    const FORMATS = {
        auto: 'Work it out for me',
        ean13: 'EAN-13',
        ean8: 'EAN-8',
        upca: 'UPC-A',
        code128: 'Code 128',
        code39: 'Code 39',
        qr: 'QR code',
        none: 'No barcode, number only'
    };
    const NUMERIC = { ean13: 13, ean8: 8, upca: 12 };
    const MAX_NUMBER = 80, MAX_NAME = 60, MAX_OWNER = 40, MAX_NOTE = 300;
    const COLORS = [
        { id: 'red', name: 'Red', hex: '#d63a3a' }, { id: 'orange', name: 'Orange', hex: '#e8650c' },
        { id: 'yellow', name: 'Yellow', hex: '#c99200' }, { id: 'green', name: 'Green', hex: '#2f9e44' },
        { id: 'teal', name: 'Teal', hex: '#0c8b8b' }, { id: 'blue', name: 'Blue', hex: '#1c6ed6' },
        { id: 'purple', name: 'Purple', hex: '#7b3fe4' }, { id: 'pink', name: 'Pink', hex: '#db2777' },
        { id: 'brown', name: 'Brown', hex: '#8a5a2b' }, { id: 'grey', name: 'Grey', hex: '#5f6b7a' }
    ];
    const colorHex = id => (COLORS.find(c => c.id === id) || COLORS[7]).hex;

    // ---------- check digits ----------
    // Weights 3 and 1 from the right, as in every EAN and UPC barcode.
    function checkDigit(body) {
        let sum = 0;
        for (let i = 0; i < body.length; i++) {
            const fromRight = body.length - i;           // 1 for the digit next to the check digit
            sum += Number(body[i]) * (fromRight % 2 === 1 ? 3 : 1);
        }
        return String((10 - sum % 10) % 10);
    }
    const validCheck = s => /^\d+$/.test(s) && s.length >= 2 && checkDigit(s.slice(0, -1)) === s.slice(-1);

    // ---------- cleaning what was typed ----------
    // Digits typed with spaces, dashes or dots ("9 501101 530003", "1234-5678") become plain digits.
    function clean(raw) {
        const s = String(raw == null ? '' : raw).replace(/[​-‍﻿]/g, '').replace(/\s+/g, ' ').trim();
        const squeezed = s.replace(/[\s\-.]/g, '');
        if (squeezed && /^\d+$/.test(squeezed)) return squeezed;
        return s;
    }

    function detect(value) {
        if (/^\d+$/.test(value)) {
            if (value.length === 13 && validCheck(value)) return 'ean13';
            if (value.length === 12 && validCheck(value)) return 'upca';
            if (value.length === 8 && validCheck(value)) return 'ean8';
        }
        if (/^[\x20-\x7e]+$/.test(value)) return 'code128';
        return 'qr';
    }

    // Returns { ok, value, format, error, warn }
    function validate(raw, format) {
        const value = clean(raw);
        format = FORMATS[format] ? format : 'auto';
        if (!value) return { ok: false, error: 'Type the card number.', value, format };
        if (value.length > MAX_NUMBER) return { ok: false, error: 'That is ' + value.length + ' characters. A card number can have up to ' + MAX_NUMBER + '.', value, format };
        if (format === 'auto') {
            const f = detect(value);
            let warn = '';
            if (/^\d+$/.test(value) && (value.length === 13 || value.length === 8 || value.length === 12) && f === 'code128')
                warn = 'The last digit does not match ' + (value.length === 13 ? 'an EAN-13' : value.length === 8 ? 'an EAN-8' : 'a UPC-A') + ' shop barcode, so it will be shown as Code 128. Check the number on your card.';
            return { ok: true, value, format: f, auto: true, warn };
        }
        if (NUMERIC[format]) {
            const n = NUMERIC[format], label = FORMATS[format];
            if (!/^\d+$/.test(value)) return { ok: false, error: label + ' can only have digits. Choose Code 128 for numbers with letters.', value, format };
            if (value.length !== n) return { ok: false, error: label + ' needs ' + n + ' digits. You typed ' + value.length + '.', value, format };
            if (!validCheck(value)) return { ok: false, error: 'The last digit should be ' + checkDigit(value.slice(0, -1)) + ' for ' + label + '. Check the number, or choose Code 128 if it is printed like this.', value, format };
            return { ok: true, value, format };
        }
        if (format === 'code128') {
            if (!/^[\x20-\x7e]+$/.test(value)) return { ok: false, error: 'Code 128 takes English letters, digits and signs only. Choose QR code for other letters.', value, format };
            return { ok: true, value, format };
        }
        if (format === 'code39') {
            const up = value.toUpperCase();
            if (!/^[0-9A-Z\-. $/+%]+$/.test(up)) return { ok: false, error: 'Code 39 takes A to Z, 0 to 9 and - . $ / + % and spaces only.', value, format };
            return { ok: true, value: up, format, warn: up !== value ? 'Code 39 has capital letters only, so it is shown in capitals.' : '' };
        }
        return { ok: true, value, format };   // qr, none
    }

    // ---------- 1D barcodes as strings of modules: '1' black, '0' white ----------
    const EAN_L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
    const EAN_G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
    const EAN_R = EAN_L.map(p => p.replace(/./g, c => c === '1' ? '0' : '1'));
    const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

    function ean13(d) {
        const par = PARITY[Number(d[0])];
        let s = '101';
        for (let i = 1; i <= 6; i++) s += (par[i - 1] === 'L' ? EAN_L : EAN_G)[Number(d[i])];
        s += '01010';
        for (let i = 7; i <= 12; i++) s += EAN_R[Number(d[i])];
        return s + '101';
    }
    function ean8(d) {
        let s = '101';
        for (let i = 0; i < 4; i++) s += EAN_L[Number(d[i])];
        s += '01010';
        for (let i = 4; i < 8; i++) s += EAN_R[Number(d[i])];
        return s + '101';
    }

    const C128 = ['212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
        '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
        '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
        '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
        '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
        '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
        '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
        '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
        '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
        '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
        '114131', '311141', '411131', '211412', '211214', '211232', '2331112'];
    const widths = w => { let s = '', bar = true; for (const c of w) { s += (bar ? '1' : '0').repeat(Number(c)); bar = !bar; } return s; };

    // Code values for the text: set C (two digits per symbol) for long runs of digits, set B otherwise.
    function code128Values(t) {
        const vals = [];
        let set = null, i = 0;
        const digitRun = from => { let j = from; while (j < t.length && t[j] >= '0' && t[j] <= '9') j++; return j - from; };
        while (i < t.length) {
            const run = digitRun(i);
            const useC = run >= 4 && (i === 0 || i + run === t.length || run >= 6);
            if (useC) {
                const pairs = Math.floor(run / 2);
                // an odd run: the pairs go in set C and the last digit in set B
                if (set !== 'C') { vals.push(set === null ? 105 : 99); set = 'C'; }
                for (let k = 0; k < pairs; k++) { vals.push(Number(t.substr(i, 2))); i += 2; }
                continue;
            }
            if (set !== 'B') { vals.push(set === null ? 104 : 100); set = 'B'; }
            vals.push(t.charCodeAt(i) - 32); i++;
        }
        let sum = vals[0];
        for (let k = 1; k < vals.length; k++) sum += vals[k] * k;
        vals.push(sum % 103);
        return vals;
    }
    function code128(t) {
        const vals = code128Values(t);
        return vals.map(v => widths(C128[v])).join('') + widths(C128[106]);
    }

    // Code 39: 2 wide bars and 1 wide space per letter (or 3 wide spaces for $ / + %), wide = 3 narrow.
    const C39_BARS = { 1: '10001', 2: '01001', 3: '11000', 4: '00101', 5: '10100', 6: '01100', 7: '00011', 8: '10010', 9: '01010', 0: '00110' };
    const C39_ORDER = ['1234567890', 'ABCDEFGHIJ', 'KLMNOPQRST', 'UVWXYZ-. *'];
    const C39_SPACES = ['0100', '0010', '0001', '1000'];
    const C39_EXTRA = { '$': '1110', '/': '1101', '+': '1011', '%': '0111' };
    function c39char(ch) {
        let bars, spaces;
        if (C39_EXTRA[ch]) { bars = '00000'; spaces = C39_EXTRA[ch]; }
        else {
            const g = C39_ORDER.findIndex(r => r.includes(ch));
            const pos = C39_ORDER[g].indexOf(ch);
            bars = C39_BARS['1234567890'[pos]]; spaces = C39_SPACES[g];
        }
        let s = '';
        for (let k = 0; k < 9; k++) {
            const wide = (k % 2 === 0 ? bars[k / 2] : spaces[(k - 1) / 2]) === '1';
            s += (k % 2 === 0 ? '1' : '0').repeat(wide ? 3 : 1);
        }
        return s;
    }
    function code39(t) { return ('*' + t + '*').split('').map(c39char).join('0'); }

    // Returns { type: 'bars', bits, quiet } or { type: 'qr', size, modules } or { type: 'none' } or { type: 'error', error }
    function encode(value, format) {
        try {
            if (format === 'ean13') return { type: 'bars', bits: ean13(value), quiet: 11 };
            if (format === 'upca') return { type: 'bars', bits: ean13('0' + value), quiet: 11 };
            if (format === 'ean8') return { type: 'bars', bits: ean8(value), quiet: 9 };
            if (format === 'code128') return { type: 'bars', bits: code128(value), quiet: 10 };
            if (format === 'code39') return { type: 'bars', bits: code39(value), quiet: 10 };
            if (format === 'qr') {
                if (!qr) return { type: 'error', error: 'The QR code drawer did not load.' };
                const code = qr.QrCode.encodeText(value, qr.QrCode.Ecc.MEDIUM);
                const modules = [];
                for (let y = 0; y < code.size; y++) { const row = []; for (let x = 0; x < code.size; x++) row.push(code.getModule(x, y)); modules.push(row); }
                return { type: 'qr', size: code.size, modules };
            }
            return { type: 'none' };
        } catch (e) { return { type: 'error', error: 'This number cannot be drawn as ' + (FORMATS[format] || 'a barcode') + '.' }; }
    }

    // "9501101530003" -> "9 501101 530003"; long digit numbers in groups of 4; text left as it is
    function display(value, format) {
        if (!/^\d+$/.test(value)) return value;
        if (format === 'ean13') return value[0] + ' ' + value.slice(1, 7) + ' ' + value.slice(7);
        if (format === 'upca') return value[0] + ' ' + value.slice(1, 6) + ' ' + value.slice(6, 11) + ' ' + value[11];
        if (format === 'ean8') return value.slice(0, 4) + ' ' + value.slice(4);
        if (value.length <= 5) return value;
        return value.replace(/(\d{4})(?=\d)/g, '$1 ');
    }

    // ---------- dates ----------
    const pad = n => String(n).padStart(2, '0');
    const isoDay = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    function validDate(s) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return false;
        const [y, m, d] = s.split('-').map(Number), t = new Date(y, m - 1, d);
        return y >= 1900 && y <= 2200 && t.getFullYear() === y && t.getMonth() === m - 1 && t.getDate() === d;
    }
    const nice = s => { const [y, m, d] = s.split('-').map(Number); return d + ' ' + MONTHS[m - 1] + ' ' + y; };
    function daysBetween(a, b) {
        const [y1, m1, d1] = a.split('-').map(Number), [y2, m2, d2] = b.split('-').map(Number);
        return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
    }
    // { text, level: 'expired' | 'soon' | 'ok' } or null
    function expiry(expires, today) {
        if (!validDate(expires)) return null;
        const n = daysBetween(today, expires);
        if (n < 0) return { text: 'Expired ' + nice(expires), level: 'expired' };
        if (n === 0) return { text: 'Expires today', level: 'soon' };
        if (n === 1) return { text: 'Expires tomorrow', level: 'soon' };
        if (n <= 30) return { text: 'Expires in ' + n + ' days (' + nice(expires) + ')', level: 'soon' };
        return { text: 'Expires ' + nice(expires), level: 'ok' };
    }

    // ---------- cards ----------
    const str = (v, max) => (typeof v === 'string' ? v : '').replace(/\s+/g, ' ').trim().slice(0, max);
    const note = v => (typeof v === 'string' ? v : '').replace(/\r\n?/g, '\n').trim().slice(0, MAX_NOTE);
    const count = v => (Number.isInteger(v) && v >= 0 && v < 1e9 ? v : 0);
    const time = v => (Number.isFinite(v) && v >= 0 && v < 1e14 ? Math.floor(v) : 0);
    let idSeq = 0;
    const newId = () => 'c' + Date.now().toString(36) + (idSeq++).toString(36) + Math.random().toString(36).slice(2, 6);

    // A card from storage or a backup file -> a safe card, or null if it cannot be used
    function sanitize(c) {
        if (!c || typeof c !== 'object') return null;
        const name = str(c.name, MAX_NAME);
        const fmt = FORMATS[c.format] && c.format !== 'auto' ? c.format : 'auto';
        const v = validate(typeof c.number === 'string' || typeof c.number === 'number' ? String(c.number) : '', fmt);
        if (!name || !v.ok) return null;
        return {
            id: typeof c.id === 'string' && /^[\w-]{1,40}$/.test(c.id) ? c.id : newId(),
            name, number: v.value, format: v.format,
            color: COLORS.some(k => k.id === c.color) ? c.color : 'pink',
            owner: str(c.owner, MAX_OWNER), note: note(c.note),
            expires: validDate(c.expires) ? c.expires : '',
            uses: count(c.uses), lastUsed: time(c.lastUsed), created: time(c.created)
        };
    }
    function sanitizeList(list) {
        if (!Array.isArray(list)) return [];
        const seen = new Set(), out = [];
        for (const c of list.slice(0, 1000)) {
            const s = sanitize(c);
            if (!s) continue;
            while (seen.has(s.id)) s.id = newId();
            seen.add(s.id); out.push(s);
        }
        return out;
    }

    const sameCard = (a, b) => a.number === b.number && a.format === b.format;
    function findDuplicate(cards, number, format, exceptId) { return cards.find(c => c.id !== exceptId && c.number === number && c.format === format) || null; }

    // Backup: adds the cards that are not here yet. Returns { cards, added, skipped, bad } or { error }
    function merge(cards, text) {
        let data;
        try { data = JSON.parse(text); } catch (e) { return { error: 'This file is not a card wallet backup.' }; }
        const list = Array.isArray(data) ? data : data && data.app === 'loyalty-and-membership-card-wallet' && Array.isArray(data.cards) ? data.cards : null;
        if (!list) return { error: 'This file is not a card wallet backup.' };
        const out = cards.slice(), ids = new Set(cards.map(c => c.id));
        let added = 0, skipped = 0, bad = 0;
        for (const raw of list.slice(0, 1000)) {
            const c = sanitize(raw);
            if (!c) { bad++; continue; }
            if (out.some(o => sameCard(o, c))) { skipped++; continue; }
            while (ids.has(c.id)) c.id = newId();
            ids.add(c.id); out.push(c); added++;
        }
        return { cards: out, added, skipped, bad };
    }
    const backup = (cards, now) => JSON.stringify({ app: 'loyalty-and-membership-card-wallet', version: 1, saved: new Date(now).toISOString(), cards }, null, 1);

    // Sort: 'used' (most shown first), 'az', 'new'. Query matches the name, whose card, number or note.
    function list(cards, sort, query) {
        const q = String(query || '').trim().toLowerCase();
        const qDigits = q.replace(/[\s\-]/g, '');
        let out = cards.filter(c => !q || c.name.toLowerCase().includes(q) || c.owner.toLowerCase().includes(q) || c.note.toLowerCase().includes(q) ||
            (qDigits && c.number.toLowerCase().includes(qDigits)));
        const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.owner.localeCompare(b.owner);
        if (sort === 'az') out.sort(byName);
        else if (sort === 'new') out.sort((a, b) => b.created - a.created || byName(a, b));
        else out.sort((a, b) => b.uses - a.uses || b.lastUsed - a.lastUsed || byName(a, b));
        return out;
    }

    function textList(cards) {
        return cards.map(c => c.name + (c.owner ? ' (' + c.owner + ')' : '') + ': ' + display(c.number, c.format) +
            (c.format !== 'none' ? ' [' + FORMATS[c.format] + ']' : '') + (c.note ? ' - ' + c.note.replace(/\n/g, ' ') : '')).join('\n');
    }

    const api = { FORMATS, COLORS, colorHex, MAX_NUMBER, MAX_NAME, MAX_OWNER, MAX_NOTE, checkDigit, validCheck, clean, detect, validate, encode,
        ean13, ean8, code128, code128Values, code39, display, validDate, isoDay, nice, daysBetween, expiry, sanitize, sanitizeList, findDuplicate,
        merge, backup, list, textList, newId };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.WalletCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
