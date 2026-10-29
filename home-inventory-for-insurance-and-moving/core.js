// Home Inventory for Insurance and Moving: the sums and the words. No page code here, so tests.js can run it in node.
// Money is kept in whole cents and every total is a sum of whole numbers, so the room totals always add up to the home total.
(function (root) {
    'use strict';
    const MAXC = 100000000000;       // up to 1,000,000,000 for one item, and for one item times how many
    const MAXQ = 9999;
    const LIM = { name: 80, room: 40, brand: 80, serial: 60, receipt: 120, note: 400, outNote: 160, rooms: 60, items: 2000 };
    const CURS = ['', 'Rs', '₹', '৳', 'AED', 'SAR', 'QAR', 'KWD', 'OMR', 'BHD', '$', '€', '£', 'A$', 'C$', 'NZ$', 'R', '₦', 'KSh', 'RM', 'Rp', '₱', 'S$', '¥', '₩', '₺', 'R$', 'kr', 'CHF', 'zł'];
    const ROOMS = ['Living room', 'Kitchen', 'Main bedroom', 'Bedroom 2', 'Kids\' room', 'Dining room', 'Study', 'Bathroom', 'Hall and stairs', 'Garage or shed', 'Loft or storage', 'Garden'];
    const GONE = { sold: 'Sold', given: 'Given away', binned: 'Thrown away', claim: 'Lost, stolen or damaged' };

    // ---------- typed numbers ----------
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
                // "12,345" is twelve thousand; "12,5" and "0.345" are decimals.
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
    const MONEY_OPT = { max: MAXC, blank: 'Type an amount, such as 650.', big: 'That amount is too big.', bad: 'Type an amount such as 650, 1,250.50 or 1.5 lakh.', decimals: 'Use at most 2 decimal places.', minus: 'Type it without a minus sign.' };
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


    // how many of it: blank is 1, otherwise a whole number from 1 to 9999
    function parseQty(text) {
        const s = String(text == null ? '' : text).trim().replace(/^[x×]\s*/i, '').replace(/\s*[x×]$/i, '');
        if (!s) return { n: 1 };
        if (/^[-−–]/.test(s)) return { error: 'Type how many without a minus sign.' };
        if (!/^\d+$/.test(s)) return { error: 'Type how many as a whole number, such as 6.' };
        const n = Number(s);
        if (n < 1) return { error: 'Type 1 or more. To remove an item, use Gone or Delete.' };
        if (n > MAXQ) return { error: 'Up to ' + MAXQ + ' of one item.' };
        return { n };
    }

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
    const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    // "14 Dec 2026"
    const fmtDate = s => (+s.slice(8, 10)) + ' ' + MON[+s.slice(5, 7) - 1] + ' ' + s.slice(0, 4);
    // how old a thing is, in whole months and years: "2 years 3 months old", "5 months old", "less than a month old"
    function ageWords(got, t) {
        if (!isDate(got) || !isDate(t) || got > t) return '';
        let m = (+t.slice(0, 4) - +got.slice(0, 4)) * 12 + (+t.slice(5, 7) - +got.slice(5, 7));
        if (+t.slice(8, 10) < +got.slice(8, 10)) m--;
        if (m < 1) return 'less than a month old';
        const y = Math.floor(m / 12), r = m % 12, out = [];
        if (y) out.push(plural(y, 'year'));
        if (r) out.push(plural(r, 'month'));
        return out.join(' ') + ' old';
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
        const t = groupDigits(int, style) + (fr ? '.' + pad(fr) : ''), sign = cents < 0 ? '-' : '';
        if (!cur) return sign + t;
        return sign + (/^[A-Za-z]/.test(cur) || /[A-Za-z]$/.test(cur) ? cur + ' ' + t : cur + t);
    }
    const moneyInput = c => c == null ? '' : (c / 100).toFixed(c % 100 ? 2 : 0);

    // ---------- the sums ----------
    // what one line is worth: value of each times how many, or null when no value is typed yet
    const total = x => x.value == null ? null : x.value * x.qty;
    const atHome = state => state.items.filter(x => x.status === 'have');
    function sums(list) {
        const o = { lines: list.length, n: 0, value: 0, valuedN: 0, unvaluedN: 0, unvaluedLines: 0, paid: 0 };
        list.forEach(x => {
            o.n += x.qty;
            const t = total(x);
            if (t == null) { o.unvaluedN += x.qty; o.unvaluedLines++; } else { o.value += t; o.valuedN += x.qty; }
            if (x.paid != null) o.paid += x.paid;
        });
        return o;
    }
    function roomOf(state, id) { return state.rooms.find(r => r.id === id) || null; }
    // every room with the things in it, in the order the rooms were added
    function byRoom(state) {
        return state.rooms.map(room => { const list = atHome(state).filter(x => x.room === room.id); return { room, list, s: sums(list) }; }).filter(g => g.list.length);
    }
    // the contents cover against what everything adds up to
    function coverCheck(state) {
        if (state.cover == null) return null;
        const s = sums(atHome(state));
        return { cover: state.cover, total: s.value, spare: state.cover - s.value, unvaluedN: s.unvaluedN };
    }
    // things whose value each is more than the most the policy pays for one item: insurers want these named
    function overLimit(state) {
        if (state.limit == null) return [];
        return atHome(state).filter(x => x.value != null && x.value > state.limit).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
    }
    // the most valuable lines, biggest first
    function topValued(state, n) {
        return atHome(state).filter(x => x.value != null && x.value > 0).sort((a, b) => total(b) - total(a) || a.name.localeCompare(b.name)).slice(0, n);
    }
    const claims = state => state.items.filter(x => x.status === 'claim');
    const gone = state => state.items.filter(x => x.status !== 'have' && x.status !== 'claim');
    function matches(x, q) {
        q = String(q || '').trim().toLocaleLowerCase();
        if (!q) return true;
        return [x.name, x.brand, x.serial, x.receipt, x.note].some(f => f && f.toLocaleLowerCase().includes(q));
    }
    // another thing with the same name in the same room, so the person can see a double entry
    function twin(state, room, name, notId) {
        return state.items.find(x => x.id !== notId && x.status === 'have' && x.room === room && same(x.name, name)) || null;
    }

    // ---------- words ----------
    function itemTitle(x) { return x.name + (x.qty > 1 ? ' × ' + x.qty : ''); }
    function itemLine(x, state, t) {
        const fm = c => fmtMoney(c, state.cur, state.group), bits = [itemTitle(x)];
        if (x.brand) bits.push(x.brand);
        if (x.serial) bits.push('serial ' + x.serial);
        if (x.got) bits.push('bought ' + fmtDate(x.got) + (t && ageWords(x.got, t) ? ' (' + ageWords(x.got, t) + ')' : ''));
        if (x.paid != null) bits.push('paid ' + fm(x.paid));
        if (x.receipt) bits.push('receipt: ' + x.receipt);
        bits.push(x.value == null ? 'no value yet' : 'value ' + (x.qty > 1 ? fm(x.value) + ' each, ' + fm(total(x)) : fm(x.value)));
        return bits.join(', ');
    }
    function sumWords(s, state) {
        return plural(s.n, 'item') + (s.value || s.valuedN ? ', ' + fmtMoney(s.value, state.cur, state.group) : '') + (s.unvaluedN ? ' (' + s.unvaluedN + ' without a value)' : '');
    }
    function roomText(g, state, t) {
        const L = [g.room.name + ': ' + sumWords(g.s, state)];
        g.list.forEach(x => L.push('- ' + itemLine(x, state, t)));
        return L.join('\n');
    }
    // a list to tick off while packing or unpacking a room
    function checklist(g) {
        const L = [g.room.name + ': ' + plural(g.s.n, 'item')];
        g.list.forEach(x => L.push('[ ] ' + itemTitle(x) + (x.brand ? ' (' + x.brand + ')' : '')));
        return L.join('\n');
    }
    function coverWords(state) {
        const c = coverCheck(state), fm = v => fmtMoney(v, state.cur, state.group);
        if (!c) return '';
        if (c.spare < 0) return 'Contents cover ' + fm(c.cover) + ': ' + fm(-c.spare) + ' less than your things add up to.';
        return 'Contents cover ' + fm(c.cover) + ': enough, ' + fm(c.spare) + ' to spare' + (c.unvaluedN ? ' before the ' + plural(c.unvaluedN, 'item') + ' without a value' : '') + '.';
    }
    function allText(state, t) {
        const s = sums(atHome(state)), L = ['Home inventory, ' + fmtDate(t), 'Whole home: ' + sumWords(s, state) + ' to buy new today'];
        const cw = coverWords(state); if (cw) L.push(cw);
        const ol = overLimit(state);
        if (ol.length) L.push('Worth more than the single item limit of ' + fmtMoney(state.limit, state.cur, state.group) + ': ' + ol.map(x => x.name + ' ' + fmtMoney(x.value, state.cur, state.group)).join('; '));
        byRoom(state).forEach(g => { L.push(''); L.push(roomText(g, state, t)); });
        return L.join('\n');
    }
    function claimText(state, t) {
        const list = claims(state), s = sums(list), L = ['Lost, stolen or damaged items, ' + fmtDate(t), plural(s.n, 'item') + ', ' + fmtMoney(s.value, state.cur, state.group) + ' to buy new today' + (s.unvaluedN ? ' (' + s.unvaluedN + ' without a value)' : '')];
        list.forEach(x => {
            const r = roomOf(state, x.room);
            L.push('- ' + itemLine(x, state, t) + (r ? ', ' + r.name : '') + (x.out && x.out.d ? ', ' + fmtDate(x.out.d) : '') + (x.out && x.out.note ? ': ' + x.out.note : ''));
        });
        return L.join('\n');
    }
    const csvCell = v => { let s = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    function csv(state) {
        const rows = [['Room', 'Item', 'How many', 'Value each', 'Total value', 'Brand and model', 'Serial number', 'Date bought', 'Price paid', 'Receipt or proof', 'Status', 'Gone on', 'What happened', 'Note', 'Photo', 'Receipt photo']];
        const num = c => c == null ? '' : (c / 100).toFixed(2);
        state.items.forEach(x => {
            const r = roomOf(state, x.room);
            rows.push([r ? r.name : '', x.name, x.qty, num(x.value), num(total(x)), x.brand, x.serial, x.got, num(x.paid), x.receipt, x.status === 'have' ? 'At home' : GONE[x.status],
                x.out ? x.out.d : '', x.out ? x.out.note : '', x.note, x.photo ? 'Yes' : '', x.rphoto ? 'Yes' : '']);
        });
        return rows.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
    }

    // ---------- saved state ----------
    const emptyState = () => ({ v: 1, cur: '', group: 'west', cover: null, limit: null, rooms: [], items: [] });
    const okMoney = (n, min) => Number.isInteger(n) && n >= (min == null ? 0 : min) && n <= MAXC;
    const okId = id => typeof id === 'string' && /^[a-z0-9]{1,30}$/i.test(id);
    const okKey = k => typeof k === 'string' && /^[a-z0-9]{1,30}$/i.test(k) ? k : '';
    function cleanItem(x, rooms) {
        if (!x || typeof x !== 'object' || !okId(x.id) || !rooms.some(r => r.id === x.room)) return null;
        const name = cleanText(x.name, LIM.name);
        if (!name || !Number.isInteger(x.qty) || x.qty < 1 || x.qty > MAXQ) return null;
        const value = okMoney(x.value) && x.value * x.qty <= MAXC ? x.value : null;
        const o = { id: x.id, room: x.room, name, qty: x.qty, value, brand: cleanText(x.brand, LIM.brand), serial: cleanText(x.serial, LIM.serial),
            got: isDate(x.got) ? x.got : '', paid: okMoney(x.paid) ? x.paid : null, receipt: cleanText(x.receipt, LIM.receipt), note: cleanNote(x.note, LIM.note),
            photo: okKey(x.photo), rphoto: okKey(x.rphoto), status: GONE[x.status] ? x.status : 'have', out: null, added: isDate(x.added) ? x.added : '' };
        if (o.status !== 'have') {
            const g = x.out && typeof x.out === 'object' ? x.out : {};
            o.out = { d: isDate(g.d) ? g.d : '', note: typeof g.note === 'string' ? cleanText(g.note, LIM.outNote) : '' };
        }
        return o;
    }
    function cleanState(s) {
        if (!s || typeof s !== 'object' || !Array.isArray(s.items) || !Array.isArray(s.rooms)) return null;
        const rooms = [], seen = new Set();
        s.rooms.forEach(r => {
            if (!r || !okId(r.id) || seen.has(r.id)) return;
            const name = cleanText(r.name, LIM.room);
            if (!name || rooms.some(y => same(y.name, name))) return;
            seen.add(r.id); rooms.push({ id: r.id, name });
        });
        const keep = rooms.slice(0, LIM.rooms), items = [], iseen = new Set();
        s.items.forEach(x => { const c = cleanItem(x, keep); if (c && !iseen.has(c.id)) { iseen.add(c.id); items.push(c); } });
        return { v: 1, cur: CURS.includes(s.cur) ? s.cur : '', group: s.group === 'lakh' ? 'lakh' : 'west',
            cover: okMoney(s.cover) ? s.cover : null, limit: okMoney(s.limit, 1) ? s.limit : null, rooms: keep, items: items.slice(0, LIM.items) };
    }
    // a room nothing is in any more (at home, claimed or gone) is dropped
    function pruneRooms(state) {
        state.rooms = state.rooms.filter(r => state.items.some(x => x.room === r.id));
    }

    const api = { MAXC, MAXQ, LIM, CURS, ROOMS, GONE, parseNum, parseMoney, parseOptMoney, parseQty, cleanText, cleanNote, plural, same, isDate, today, fmtDate, ageWords,
        groupDigits, fmtMoney, moneyInput, total, atHome, sums, roomOf, byRoom, coverCheck, overLimit, topValued, claims, gone, matches, twin,
        itemTitle, itemLine, sumWords, roomText, checklist, coverWords, allText, claimText, csv, emptyState, cleanItem, cleanState, pruneRooms };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.HIN = api;
})(typeof window !== 'undefined' ? window : this);
