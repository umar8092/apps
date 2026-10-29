// Gold and Jewellery Record for the Family: the weights, the values and the words. No page code here, so tests.js can run it in node.
// Weights are kept in whole micrograms and money in whole cents. Values are worked out with BigInt, so every sum is exact:
// 1 tola is 11.6638038 g (180 troy grains), 1 tola = 12 masha, 1 masha = 8 ratti, 1 troy ounce is 31.1034768 g.
(function (root) {
    'use strict';
    const MAXC = 10000000000000;     // up to 100,000,000,000 for one amount or rate
    const MAXUG = 100000000000;      // up to 100 kg for one piece
    const LIM = { name: 80, person: 40, place: 40, note: 400, to: 60, people: 40, pieces: 1500, log: 20 };
    const CURS = ['', 'Rs', '₹', '৳', 'AED', 'SAR', 'QAR', 'KWD', 'OMR', 'BHD', '$', '€', '£', 'A$', 'C$', 'NZ$', 'R', '₦', 'KSh', 'RM', 'Rp', '₱', 'S$', '¥', '₩', '₺', 'R$', 'kr', 'CHF', 'zł'];
    // a rate's unit, in tenths of a microgram, so the tola is a whole number
    const UNIT_DEN = { tola: 116638038, '10g': 100000000, g: 10000000, oz: 311034768 };
    const UNIT_NAME = { tola: 'per tola', '10g': 'per 10 grams', g: 'per gram', oz: 'per ounce' };
    const UG_TOLA = 11663803.8, UG_OZ = 31103476.8;
    const KARATS = [24, 22, 21, 18, 14];
    const KARAT_RATES = [22, 21, 18];   // jewellers often give their own rate for these
    const FINE = { 24: '999', 22: '916', 21: '875', 18: '750', 14: '585' };

    // ---------- typed numbers ----------
    // "12,345.6", "12.345,6", "12 345", "1,00,000" and "Rs 23.5" all work. Returns the number times 10^dec as a whole number.
    function parseNum(text, dec, opt) {
        opt = opt || {};
        const bad = opt.bad || 'That number looks mistyped. Type it like 12345 or 12345.6.';
        let s = String(text == null ? '' : text).replace(/[   ']/g, ' ').trim();
        if (!s) return { error: opt.blank || 'Type a number.' };
        s = s.replace(/^(rs\.?|inr|pkr|usd|eur|gbp|aed|sar|[$€£₹¥₩₦₱৳₺₽₴])\s*/i, '').replace(/\s*(rs\.?|[$€£₹¥₩₦₱৳₺₽₴%])$/i, '').trim();
        if (opt.strip) s = s.replace(opt.strip, '').trim();
        if (/^[-−–]/.test(s)) return { error: opt.minus || 'Type it without a minus sign.' };
        if (/^\+/.test(s)) s = s.slice(1).trim();
        if (!/^[\d.,\s]+$/.test(s) || !/\d/.test(s)) return { error: bad };
        let intPart, fracPart = '';
        if (/\s/.test(s)) {
            const parts = s.split(/\s+/), last = parts[parts.length - 1], m = last.match(/^(\d{3})([.,]\d*)?$/);
            if (!/^\d{1,3}$/.test(parts[0]) || !parts.slice(1, -1).every(p => /^\d{3}$/.test(p)) || !m) return { error: bad };
            intPart = parts.slice(0, -1).join('') + m[1]; fracPart = m[2] ? m[2].slice(1) : '';
        } else {
            const dots = (s.match(/\./g) || []).length, commas = (s.match(/,/g) || []).length;
            let mark = null;
            if (dots && commas) mark = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ',';
            else if (dots + commas === 1) {
                const one = dots ? '.' : ',', [a, b] = s.split(one);
                // "12,345" is twelve thousand; "12,5" and "0.345" are decimals. Weights never use thousands, so there "2,500" is 2.5.
                mark = (!opt.weight && b.length === 3 && /^\d{1,3}$/.test(a) && a !== '0') ? null : one;
            }
            intPart = s;
            if (mark) { const i = s.lastIndexOf(mark); intPart = s.slice(0, i); fracPart = s.slice(i + 1); }
            const th = mark === '.' ? ',' : mark === ',' ? '.' : (dots ? '.' : ',');
            if (mark && intPart.includes(mark)) return { error: bad };
            if (intPart.includes(th)) {
                const west = new RegExp('^\\d{1,3}(\\' + th + '\\d{3})+$'), lakh = new RegExp('^\\d{1,2}(\\' + th + '\\d{2})*\\' + th + '\\d{3}$');
                if (!west.test(intPart) && !lakh.test(intPart)) return { error: bad };
                intPart = intPart.split(th).join('');
            }
            if (!/^\d*$/.test(fracPart) || !/^\d*$/.test(intPart)) return { error: bad };
        }
        fracPart = fracPart.replace(/0+$/, '');
        if (fracPart.length > dec) return { error: opt.decimals || ('Use at most ' + dec + ' decimal places.') };
        if (intPart.replace(/^0+/, '').length > 12) return { error: opt.big || 'That number is too big.' };
        const n = Number(intPart || '0') * Math.pow(10, dec) + Number((fracPart + '0000').slice(0, dec) || '0');
        if (opt.max != null && n > opt.max) return { error: opt.big || 'That number is too big.' };
        if (opt.positive && n <= 0) return { error: opt.zero || 'Type a number bigger than 0.' };
        return { n };
    }
    const MULT = { k: 1000, thousand: 1000, lakh: 100000, lakhs: 100000, lac: 100000, lacs: 100000, crore: 10000000, crores: 10000000, cr: 10000000, m: 1000000, million: 1000000 };
    const MONEY_OPT = { max: MAXC, blank: 'Type an amount, such as 120000.', big: 'That amount is too big.', bad: 'Type an amount such as 350000, 3,50,000 or 3.5 lakh.', decimals: 'Use at most 2 decimal places.', minus: 'Type it without a minus sign.' };
    // money: "350000", "3,50,000", "350,000.50", "Rs 3.5 lakh" and "50k" all work. Returns whole cents.
    function parseMoney(text, opt) {
        const o = Object.assign({}, MONEY_OPT, opt || {});
        const s = String(text == null ? '' : text).trim(), m = s.match(/^(.*?\d)\s*(k|thousand|lakhs?|lacs?|crores?|cr|m|million)\.?$/i);
        if (m) {
            const base = parseNum(m[1], 2, Object.assign({}, o, { max: null, decimals: 'Use at most 2 decimal places, such as 3.25 lakh.' }));
            if (base.error) return base;
            const n = base.n * MULT[m[2].toLowerCase()];
            if (n > o.max) return { error: o.big };
            if (o.positive && n <= 0) return { error: o.zero || 'Type an amount bigger than 0.' };
            return { n };
        }
        return parseNum(s, 2, o);
    }
    // optional money: blank is null, otherwise whole cents
    function parseOptMoney(t, opt) {
        if (String(t == null ? '' : t).trim() === '') return { n: null };
        return parseMoney(t, opt);
    }

    // ---------- weights ----------
    const WDEC = { tola: 3, g: 3, oz: 4 };
    const WNAME = { tola: 'tola', g: 'grams', oz: 'ounces' };
    // a weight typed in tola, grams or troy ounces, as whole micrograms
    function parseWeight(text, unit, opt) {
        opt = opt || {};
        const dec = WDEC[unit] || 3;
        const ex = unit === 'tola' ? '2.5' : unit === 'oz' ? '1.25' : '29.16';
        const r = parseNum(text, dec, { weight: true, strip: /\s*(tolas?|grams?|gms?|g|oz|ounces?)\.?$/i, blank: opt.blank || ('Type the weight in ' + WNAME[unit] + ', such as ' + ex + '.'),
            bad: 'Type the weight as a number, such as ' + ex + '.', decimals: 'Use at most ' + dec + ' decimal places for ' + WNAME[unit] + '.', minus: 'Type the weight without a minus sign.', big: 'That is too heavy for one piece (up to 100 kg).' });
        if (r.error) return r;
        let ug;
        if (unit === 'tola') ug = Number((BigInt(r.n) * 116638038n * 2n + 10000n) / 20000n);
        else if (unit === 'oz') ug = Number((BigInt(r.n) * 311034768n * 2n + 100000n) / 200000n);
        else ug = r.n * 1000;
        if (ug > MAXUG) return { error: 'That is too heavy for one piece (up to 100 kg).' };
        if (!opt.zeroOk && ug <= 0) return { error: 'Type a weight bigger than 0.' };
        return { ug };
    }
    // tola, masha and ratti as a jeweller writes them: "2 tola 6 masha 4 ratti"
    function parseTMR(t, m, r, opt) {
        opt = opt || {};
        const blank = [t, m, r].every(x => String(x == null ? '' : x).trim() === '');
        if (blank) return opt.zeroOk ? { ug: 0 } : { error: 'Type the tola, masha and ratti, such as 2 tola 6 masha.' };
        const one = (x, dec, max, word) => {
            if (String(x == null ? '' : x).trim() === '') return { n: 0 };
            const p = parseNum(x, dec, { weight: true, bad: 'Type the ' + word + ' as a number.', decimals: word === 'ratti' ? 'Ratti can have one decimal place, such as 4.5.' : 'Type whole ' + word + ', such as 6.', minus: 'Type it without a minus sign.' });
            if (p.error) return p;
            if (p.n > max) return { error: word === 'masha' ? 'Masha go from 0 to 11 (12 masha make 1 tola).' : word === 'ratti' ? 'Ratti go from 0 to 7.9 (8 ratti make 1 masha).' : 'That is too heavy for one piece.' };
            return p;
        };
        const a = one(t, 0, 8000, 'tola'); if (a.error) return a;
        const b = one(m, 0, 11, 'masha'); if (b.error) return b;
        const c = one(r, 1, 79, 'ratti'); if (c.error) return c;
        const tenths = ((a.n * 12 + b.n) * 8) * 10 + c.n;     // tenths of a ratti; 960 make a tola
        const ug = Number((BigInt(tenths) * 116638038n * 2n + 9600n) / 19200n);
        if (!opt.zeroOk && ug <= 0) return { error: 'Type a weight bigger than 0.' };
        if (ug > MAXUG) return { error: 'That is too heavy for one piece (up to 100 kg).' };
        return { ug };
    }
    // a weight back into the box it was typed in
    function weightInput(ug, unit) {
        if (!ug) return '';
        if (unit === 'g') return trimZeros((ug / 1e6).toFixed(3));
        if (unit === 'oz') return trimZeros((ug / UG_OZ).toFixed(4));
        return trimZeros((ug / UG_TOLA).toFixed(3));
    }
    function tmrParts(ug) {
        const tenths = Math.round(ug * 9600 / 116638038);
        return { t: Math.floor(tenths / 960), m: Math.floor((tenths % 960) / 80), r: (tenths % 80) / 10 };
    }
    const trimZeros = s => s.indexOf('.') < 0 ? s : s.replace(/\.?0+$/, '');
    const fmtTola = (ug, style) => groupNum((ug / UG_TOLA).toFixed(3), style) + ' tola';
    const fmtGram = (ug, style) => groupNum((ug / 1e6).toFixed(2), style) + ' g';
    function groupNum(s, style) { const [i, f] = s.split('.'); return groupDigits(i, style) + (f ? '.' + f : ''); }
    // "2 tola 6 masha 4 ratti"; zero parts are left out
    function fmtTMR(ug) {
        const p = tmrParts(ug), out = [];
        if (p.t) out.push(p.t + ' tola');
        if (p.m) out.push(p.m + ' masha');
        if (p.r) out.push(trimZeros(p.r.toFixed(1)) + ' ratti');
        return out.length ? out.join(' ') : 'less than 0.1 ratti';
    }
    // both units, the chosen one first: "2.500 tola (29.16 g)"
    const fmtW = (ug, state) => state.wunit === 'g' ? fmtGram(ug, state.group) + ' (' + fmtTola(ug, state.group) + ')' : fmtTola(ug, state.group) + ' (' + fmtGram(ug, state.group) + ')';
    const fmtW1 = (ug, state) => state.wunit === 'g' ? fmtGram(ug, state.group) : fmtTola(ug, state.group);

    // ---------- text ----------
    const cleanText = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
    const cleanNote = (s, max) => String(s == null ? '' : s).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]+/g, ' ')
        .split('\n').map(l => l.replace(/\s+$/, '')).join('\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
    const plural = (n, one, many) => n + ' ' + (n === 1 ? one : (many || one + 's'));
    const same = (a, b) => String(a).toLocaleLowerCase() === String(b).toLocaleLowerCase();

    // ---------- dates ----------
    const dNum = s => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 86400000;
    const dStr = n => new Date(n * 86400000).toISOString().slice(0, 10);
    function isDate(s) {
        if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
        const y = +s.slice(0, 4);
        return y >= 1900 && y <= 2200 && dStr(dNum(s)) === s;
    }
    const pad = n => String(n).padStart(2, '0');
    const today = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    const addDays = (s, n) => dStr(dNum(s) + n);
    const daysBetween = (a, b) => dNum(b) - dNum(a);
    const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    // "14 Dec 2026"
    const fmtDate = s => (+s.slice(8, 10)) + ' ' + MON[+s.slice(5, 7) - 1] + ' ' + s.slice(0, 4);
    function ago(s, t) {
        const d = daysBetween(s, t);
        if (d <= 0) return 'today';
        if (d === 1) return 'yesterday';
        return d + ' days ago';
    }

    // ---------- money words ----------
    // 1234567 as "1,234,567" (west) or "12,34,567" (lakh, as used in Pakistan, India and Bangladesh)
    function groupDigits(int, style) {
        const s = String(int);
        if (style === 'lakh' && s.length > 3) {
            let head = s.slice(0, -3);
            const tail = s.slice(-3), parts = [];
            while (head.length > 2) { parts.unshift(head.slice(-2)); head = head.slice(0, -2); }
            if (head) parts.unshift(head);
            return parts.join(',') + ',' + tail;
        }
        return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }
    // whole amounts show no decimals; amounts with cents show two
    function fmtMoney(cents, cur, style) {
        const n = Math.abs(cents), int = Math.floor(n / 100), fr = n % 100;
        const t = (cents < 0 ? '-' : '') + groupDigits(int, style) + (fr ? '.' + pad(fr) : '');
        if (!cur) return t;
        return /^[A-Za-z]/.test(cur) || /[A-Za-z]$/.test(cur) ? cur + ' ' + t : cur + t;
    }
    const moneyInput = c => c == null ? '' : (c / 100).toFixed(c % 100 ? 2 : 0);

    // ---------- the values ----------
    const net = p => p.ug - p.stoneUg;
    const purity = p => p.metal === 'silver' ? p.fine / 1000 : p.k / 24;
    const pureUg = p => net(p) * purity(p);
    const purityName = p => p.metal === 'silver' ? (p.fine === 999 ? 'Fine silver (999)' : p.fine === 925 ? 'Sterling silver (925)' : 'Silver ' + p.fine)
        : p.k + 'k' + (FINE[p.k] ? ' (' + FINE[p.k] + ')' : '') + ' gold';
    // which rate prices this piece: { rate, num, den, label } or null when no rate is typed
    function rateFor(p, rates) {
        if (!rates) return null;
        if (p.metal === 'silver') return rates.silver ? { rate: rates.silver, num: p.fine, den: 1000, label: 'silver' } : null;
        if (KARAT_RATES.includes(p.k) && rates['k' + p.k]) return { rate: rates['k' + p.k], num: 1, den: 1, label: p.k + 'k' };
        return rates.gold ? { rate: rates.gold, num: p.k, den: 24, label: '24k' } : null;
    }
    // what the piece is worth at the rate, in whole cents rounded to a whole unit of money (gold is never priced in paisa)
    function value(p, rates) {
        const r = rateFor(p, rates);
        if (!r) return null;
        const top = BigInt(net(p)) * 10n * BigInt(r.num) * BigInt(r.rate), bot = BigInt(r.den) * BigInt(UNIT_DEN[rates.unit]) * 100n;
        return Number((top * 2n + bot) / (bot * 2n)) * 100;
    }
    function personOf(state, id) { return state.people.find(x => x.id === id) || null; }
    const have = state => state.pieces.filter(p => p.status === 'have');
    function sums(list, rates) {
        const o = { n: list.length, goldUg: 0, pureGoldUg: 0, silverUg: 0, pureSilverUg: 0, value: 0, priced: 0, unpriced: 0, paid: 0, paidValue: 0, paidN: 0 };
        list.forEach(p => {
            if (p.metal === 'silver') { o.silverUg += net(p); o.pureSilverUg += pureUg(p); } else { o.goldUg += net(p); o.pureGoldUg += pureUg(p); }
            const v = value(p, rates);
            if (v == null) o.unpriced++; else { o.value += v; o.priced++; if (p.paid != null) { o.paid += p.paid; o.paidValue += v; o.paidN++; } }
        });
        o.pureGoldUg = Math.round(o.pureGoldUg); o.pureSilverUg = Math.round(o.pureSilverUg);
        return o;
    }
    // every person with their pieces, in the order they were added
    function byPerson(state) {
        return state.people.map(pr => { const list = have(state).filter(p => p.owner === pr.id); return { person: pr, list, s: sums(list, state.rates) }; });
    }
    // where things are kept: "Bank locker: 14 pieces"
    function byPlace(state) {
        const m = new Map();
        have(state).forEach(p => {
            const k = p.place ? p.place.toLocaleLowerCase() : '';
            if (!m.has(k)) m.set(k, { place: p.place || 'Place not written', list: [] });
            m.get(k).list.push(p);
        });
        return [...m.values()].map(g => Object.assign(g, { s: sums(g.list, state.rates) })).sort((a, b) => b.list.length - a.list.length);
    }
    // how much the family's gold went up or down since the rate typed before
    function change(state) {
        if (!state.prev || !state.rates.d) return null;
        const list = have(state), now = sums(list, state.rates), before = sums(list, state.prev);
        if (!now.priced || now.priced !== before.priced) return null;
        return { diff: now.value - before.value, d: state.prev.d };
    }
    const rateAge = (state, t) => state.rates.d ? daysBetween(state.rates.d, t) : null;
    const hasRate = rates => !!(rates.gold || rates.silver || KARAT_RATES.some(k => rates['k' + k]));

    // ---------- words ----------
    function rateWords(state) {
        const r = state.rates, fm = c => fmtMoney(c, state.cur, state.group), u = UNIT_NAME[r.unit], out = [];
        if (r.gold) out.push('24k gold ' + fm(r.gold) + ' ' + u);
        KARAT_RATES.forEach(k => { if (r['k' + k]) out.push(k + 'k gold ' + fm(r['k' + k]) + ' ' + u); });
        if (r.silver) out.push('Silver ' + fm(r.silver) + ' ' + u);
        return out;
    }
    function sumWords(s, state) {
        const out = [];
        if (s.goldUg) out.push(fmtW(s.goldUg, state) + ' of gold, ' + fmtW1(s.pureGoldUg, state) + ' pure');
        if (s.silverUg) out.push(fmtW(s.silverUg, state) + ' of silver');
        return out;
    }
    function pieceLine(p, state) {
        const fm = c => fmtMoney(c, state.cur, state.group), v = value(p, state.rates), bits = [p.name + ': ' + purityName(p) + ', ' + fmtW(net(p), state)];
        if (p.stoneUg) bits.push('stones ' + fmtW1(p.stoneUg, state) + ' taken off');
        if (p.place) bits.push('kept: ' + p.place);
        if (v != null) bits.push('worth ' + fm(v));
        if (p.paid != null) bits.push('paid ' + fm(p.paid) + (p.got ? ' on ' + fmtDate(p.got) : ''));
        return bits.join(', ');
    }
    function personText(g, state) {
        const fm = c => fmtMoney(c, state.cur, state.group), L = [g.person.name + ': ' + plural(g.s.n, 'piece')];
        sumWords(g.s, state).forEach(x => L.push(x));
        if (g.s.priced) L.push('Worth ' + fm(g.s.value) + (g.s.unpriced ? ' (' + plural(g.s.unpriced, 'piece') + ' without a rate)' : ''));
        g.list.forEach(p => L.push('- ' + pieceLine(p, state)));
        return L.join('\n');
    }
    function allText(state, t) {
        const fm = c => fmtMoney(c, state.cur, state.group), s = sums(have(state), state.rates), L = ['Family gold and jewellery, ' + fmtDate(t)];
        sumWords(s, state).forEach(x => L.push(x));
        if (s.priced) L.push('Worth ' + fm(s.value) + ' at the rate of ' + fmtDate(state.rates.d) + ' (before any shop deduction)');
        const rw = rateWords(state); if (rw.length) L.push('Rates: ' + rw.join('; '));
        byPerson(state).filter(g => g.list.length).forEach(g => { L.push(''); L.push(personText(g, state)); });
        return L.join('\n');
    }
    function placeText(g, state) {
        const L = [g.place + ': ' + plural(g.list.length, 'piece')];
        sumWords(g.s, state).forEach(x => L.push(x));
        g.list.forEach(p => { const pr = personOf(state, p.owner); L.push('[ ] ' + p.name + ' (' + (pr ? pr.name : '') + '), ' + purityName(p) + ', ' + fmtW1(net(p), state)); });
        return L.join('\n');
    }
    const csvCell = v => { let s = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    function csv(state) {
        const rows = [['Person', 'Piece', 'Metal', 'Purity', 'Weight (g)', 'Stones (g)', 'Metal weight (g)', 'Metal weight (tola)', 'Where kept', 'Got on', 'Paid', 'Worth now', 'Status', 'Sold or given on', 'Sold for', 'Given to', 'Note']];
        const num = c => c == null ? '' : (c / 100).toFixed(2), st = { have: 'Have it', sold: 'Sold', gone: 'Given away' };
        state.pieces.forEach(p => {
            const pr = personOf(state, p.owner), v = p.status === 'have' ? value(p, state.rates) : null;
            rows.push([pr ? pr.name : '', p.name, p.metal === 'silver' ? 'Silver' : 'Gold', p.metal === 'silver' ? p.fine : p.k + 'k', (p.ug / 1e6).toFixed(3), (p.stoneUg / 1e6).toFixed(3),
                (net(p) / 1e6).toFixed(3), (net(p) / UG_TOLA).toFixed(3), p.place, p.got, num(p.paid), num(v), st[p.status], p.out ? p.out.d : '', p.out ? num(p.out.amt) : '', p.out ? p.out.to : '', p.note]);
        });
        return rows.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
    }

    // ---------- saved state ----------
    const emptyRates = () => ({ unit: 'tola', d: '', gold: null, k22: null, k21: null, k18: null, silver: null });
    const emptyState = () => ({ v: 1, cur: '', group: 'west', wunit: 'tola', rates: emptyRates(), prev: null, people: [], pieces: [] });
    const okMoney = (n, min) => Number.isInteger(n) && n >= (min == null ? 0 : min) && n <= MAXC;
    const okId = id => typeof id === 'string' && /^[a-z0-9]{1,24}$/i.test(id);
    function cleanRates(r) {
        if (!r || typeof r !== 'object') return null;
        const o = emptyRates();
        o.unit = UNIT_DEN[r.unit] ? r.unit : 'tola';
        o.d = isDate(r.d) ? r.d : '';
        ['gold', 'k22', 'k21', 'k18', 'silver'].forEach(k => { o[k] = okMoney(r[k], 1) ? r[k] : null; });
        return o;
    }
    function cleanPiece(p, people) {
        if (!p || typeof p !== 'object' || !okId(p.id) || !people.some(x => x.id === p.owner)) return null;
        const name = cleanText(p.name, LIM.name);
        if (!name || !Number.isInteger(p.ug) || p.ug < 1 || p.ug > MAXUG) return null;
        const metal = p.metal === 'silver' ? 'silver' : 'gold';
        const o = { id: p.id, owner: p.owner, name, metal, k: 22, fine: 999, ug: p.ug, stoneUg: 0, unit: ['tola', 'g', 'oz', 'tmr'].includes(p.unit) ? p.unit : 'tola',
            place: cleanText(p.place, LIM.place), got: isDate(p.got) ? p.got : '', paid: okMoney(p.paid) ? p.paid : null, note: cleanNote(p.note, LIM.note), photo: typeof p.photo === 'string' && /^[a-z0-9]{1,30}$/i.test(p.photo) ? p.photo : '',
            status: ['have', 'sold', 'gone'].includes(p.status) ? p.status : 'have', out: null, log: [] };
        if (metal === 'gold') { if (!Number.isInteger(p.k) || p.k < 1 || p.k > 24) return null; o.k = p.k; }
        else { if (!Number.isInteger(p.fine) || p.fine < 1 || p.fine > 1000) return null; o.fine = p.fine; }
        if (Number.isInteger(p.stoneUg) && p.stoneUg > 0 && p.stoneUg < p.ug) o.stoneUg = p.stoneUg;
        if (o.status !== 'have') {
            const x = p.out && typeof p.out === 'object' ? p.out : {};
            o.out = { d: isDate(x.d) ? x.d : '', amt: o.status === 'sold' && okMoney(x.amt) ? x.amt : null, to: o.status === 'gone' ? cleanText(x.to, LIM.to) : '' };
        }
        o.log = (Array.isArray(p.log) ? p.log : []).filter(h => h && isDate(h.d) && typeof h.text === 'string').map(h => ({ d: h.d, text: cleanText(h.text, 160) })).filter(h => h.text).slice(-LIM.log);
        return o;
    }
    function cleanState(s) {
        if (!s || typeof s !== 'object' || !Array.isArray(s.pieces) || !Array.isArray(s.people)) return null;
        const people = [], seen = new Set();
        s.people.forEach(x => {
            if (!x || !okId(x.id) || seen.has(x.id)) return;
            const name = cleanText(x.name, LIM.person);
            if (!name || people.some(y => same(y.name, name))) return;
            seen.add(x.id); people.push({ id: x.id, name });
        });
        const pieces = [], pseen = new Set();
        s.pieces.forEach(p => { const c = cleanPiece(p, people.slice(0, LIM.people)); if (c && !pseen.has(c.id)) { pseen.add(c.id); pieces.push(c); } });
        const o = { v: 1, cur: CURS.includes(s.cur) ? s.cur : '', group: s.group === 'lakh' ? 'lakh' : 'west', wunit: s.wunit === 'g' ? 'g' : 'tola',
            rates: cleanRates(s.rates) || emptyRates(), prev: cleanRates(s.prev), people: people.slice(0, LIM.people), pieces: pieces.slice(0, LIM.pieces) };
        if (o.prev && !hasRate(o.prev)) o.prev = null;
        return o;
    }
    // a person nobody's piece belongs to any more is dropped
    function prunePeople(state) {
        state.people = state.people.filter(pr => state.pieces.some(p => p.owner === pr.id));
    }

    const api = { MAXC, MAXUG, LIM, CURS, UNIT_DEN, UNIT_NAME, UG_TOLA, UG_OZ, KARATS, KARAT_RATES, FINE, parseNum, parseMoney, parseOptMoney, parseWeight, parseTMR,
        weightInput, tmrParts, fmtTola, fmtGram, fmtTMR, fmtW, fmtW1, cleanText, cleanNote, plural, same, isDate, today, addDays, daysBetween, fmtDate, ago,
        groupDigits, fmtMoney, moneyInput, net, purity, pureUg, purityName, rateFor, value, personOf, have, sums, byPerson, byPlace, change, rateAge, hasRate,
        rateWords, sumWords, pieceLine, personText, allText, placeText, csv, emptyRates, emptyState, cleanRates, cleanPiece, cleanState, prunePeople };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.GJR = api;
})(typeof window !== 'undefined' ? window : this);
