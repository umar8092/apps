// Event Budget and Vendor Payments Planner: the money, the dates and the words. No page code here, so tests.js can run it in node.
// Money is kept in whole cents and dates as "2026-10-29" day strings counted in whole days, so every sum is exact.
(function (root) {
    'use strict';
    const MAXC = 10000000000000;     // up to 100,000,000,000 (1,000 crore) for one amount
    const MAXG = 100000;             // guests for per-head pricing
    const LIM = { ev: 60, vn: 60, cat: 30, contact: 80, note: 500, pnote: 80, events: 50, vendors: 200, pays: 300, plan: 60 };
    const CURS = ['', '$', '€', '£', 'Rs', '₹', 'A$', 'C$', 'NZ$', 'AED', 'SAR', 'QAR', 'KWD', 'R', '৳', '₦', 'KSh', 'RM', 'Rp', '₱', 'S$', '¥', '₩', '₺', 'R$', 'kr', 'CHF', 'zł'];
    // what the money goes on; "other" takes the person's own name for it
    const CATS = [['venue', 'Venue or hall'], ['food', 'Food and catering'], ['decor', 'Decor and flowers'], ['photo', 'Photo and video'], ['clothes', 'Clothes and tailor'],
        ['beauty', 'Makeup, hair and mehndi'], ['jewellery', 'Jewellery'], ['gifts', 'Gifts and favours'], ['music', 'Music, DJ and sound'], ['transport', 'Transport'],
        ['cards', 'Invitation cards'], ['cake', 'Cake and sweets'], ['other', 'Other']];
    const CAT_KEYS = CATS.map(c => c[0]);
    const catLabel = (v) => v.cat === 'other' ? (v.catName || 'Other') : (CATS.find(c => c[0] === v.cat) || CATS[CATS.length - 1])[1];

    // ---------- typed numbers ----------
    // "12,345.6", "12.345,6", "12 345", "1,00,000" and "Rs 23.5" all work. Returns the number times 10^dec as a whole number.
    function parseNum(text, dec, opt) {
        opt = opt || {};
        const bad = opt.bad || 'That number looks mistyped. Type it like 12345 or 12345.6.';
        let s = String(text == null ? '' : text).replace(/[   ']/g, ' ').trim();
        if (!s) return { error: opt.blank || 'Type a number.' };
        s = s.replace(/^(rs\.?|inr|usd|eur|gbp|pkr|aed|sar|[$€£₹¥₩₦₱৳₺₽₴])\s*/i, '').replace(/\s*(rs\.?|[$€£₹¥₩₦₱৳₺₽₴%])$/i, '').trim();
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
                // "12,345" is twelve thousand; "12,5" and "0.345" are decimals
                mark = (b.length === 3 && /^\d{1,3}$/.test(a) && a !== '0') ? null : one;
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
    const MONEY_OPT = { max: MAXC, blank: 'Type an amount, such as 120000.', big: 'That amount is too big.', bad: 'Type an amount such as 250000, 2,50,000 or 2.5 lakh.', decimals: 'Use at most 2 decimal places.', minus: 'Type it without a minus sign.' };
    // money: "250000", "2,50,000", "250,000.50", "Rs 2.5 lakh", "50k" and "1.2 crore" all work. Returns whole cents.
    function parseMoney(text, opt) {
        const o = Object.assign({}, MONEY_OPT, opt || {});
        const s = String(text == null ? '' : text).trim(), m = s.match(/^(.*?\d)\s*(k|thousand|lakhs?|lacs?|crores?|cr|m|million)\.?$/i);
        if (m) {
            const base = parseNum(m[1], 2, Object.assign({}, o, { max: null, decimals: 'Use at most 2 decimal places, such as 2.25 lakh.' }));
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
    function parseGuests(t) {
        const r = parseNum(t, 0, { blank: 'Type the number of guests, such as 250.', bad: 'Type a whole number of guests, such as 250.', decimals: 'Guests must be a whole number.', minus: 'Type it without a minus sign.', max: MAXG, big: 'That is too many guests (up to 100,000).', positive: true, zero: 'Type at least 1 guest.' });
        return r;
    }

    // ---------- text ----------
    const cleanText = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
    const cleanNote = (s, max) => String(s == null ? '' : s).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]+/g, ' ')
        .split('\n').map(l => l.replace(/\s+$/, '')).join('\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
    const plural = (n, one, many) => n + ' ' + (n === 1 ? one : (many || one + 's'));

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
    const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    // "Mon 14 Dec", with the year when it is not this year
    function fmtDate(s, t, opt) {
        opt = opt || {};
        const wd = WD[new Date(dNum(s) * 86400000).getUTCDay()];
        return (opt.noDay ? '' : wd + ' ') + (+s.slice(8, 10)) + ' ' + MON[+s.slice(5, 7) - 1] + (!t || s.slice(0, 4) !== t.slice(0, 4) || opt.year ? ' ' + s.slice(0, 4) : '');
    }
    function rel(s, t) {
        const d = daysBetween(t, s);
        if (d === 0) return 'today';
        if (d === 1) return 'tomorrow';
        if (d === -1) return 'yesterday';
        return d > 0 ? 'in ' + d + ' days' : (-d) + ' days ago';
    }
    // a due date: "in 46 days" or "3 days late"
    function dueRel(s, t) {
        const d = daysBetween(t, s);
        if (d === 0) return 'due today';
        if (d === 1) return 'due tomorrow';
        if (d < 0) return plural(-d, 'day') + ' late';
        return 'in ' + d + ' days';
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

    // ---------- the sums ----------
    // one vendor: the price agreed, what was paid (less refunds), what is still to pay and when
    function vStats(v) {
        const agreed = v.mode === 'perhead' ? v.rate * v.guests : v.price;
        let paidGross = 0, refunded = 0;
        v.pays.forEach(p => { if (p.kind === 'refund') refunded += p.amt; else paidGross += p.amt; });
        const net = paidGross - refunded, cancelled = v.status === 'cancelled';
        // a cancelled booking costs what was paid and not given back
        const cost = cancelled ? Math.max(0, net) : agreed;
        const balance = cancelled ? 0 : Math.max(0, agreed - net);
        const over = cancelled ? 0 : Math.max(0, net - agreed);
        const dues = cancelled ? [] : v.plan.slice().sort((a, b) => a.d < b.d ? -1 : a.d > b.d ? 1 : 0);
        const planned = dues.reduce((a, d) => a + d.amt, 0);
        return { agreed, paidGross, refunded, net, cost, balance, over, cancelled, dues, planned,
            unplanned: Math.max(0, balance - planned), overPlanned: Math.max(0, planned - balance) };
    }
    // one event: the budget, what is agreed, paid and still to pay, and how each category stands
    function eStats(ev) {
        const r = { agreed: 0, paid: 0, toPay: 0, over: 0, lost: 0, vendors: ev.vendors.length, active: 0, cancelled: 0, budget: ev.budget, cats: [] };
        const byCat = new Map();
        ev.vendors.forEach(v => {
            const s = vStats(v);
            r.agreed += s.cost; r.paid += Math.max(0, s.net); r.toPay += s.balance; r.over += s.over;
            if (s.cancelled) { r.cancelled++; r.lost += s.cost; } else r.active++;
            const key = v.cat === 'other' ? 'other:' + (v.catName || 'Other').toLowerCase() : v.cat;
            if (!byCat.has(key)) byCat.set(key, { key, cat: v.cat, label: catLabel(v), agreed: 0, paid: 0, toPay: 0, n: 0 });
            const c = byCat.get(key);
            c.agreed += s.cost; c.paid += Math.max(0, s.net); c.toPay += s.balance; c.n++;
        });
        // categories with a budget but no vendor yet still show
        Object.keys(ev.catBudgets).forEach(k => {
            if (!byCat.has(k) && CAT_KEYS.includes(k) && k !== 'other') byCat.set(k, { key: k, cat: k, label: catLabel({ cat: k }), agreed: 0, paid: 0, toPay: 0, n: 0 });
        });
        r.cats = [...byCat.values()].map(c => {
            const b = ev.catBudgets[c.key];
            return Object.assign(c, { budget: b == null ? null : b, overBy: b == null ? 0 : Math.max(0, c.agreed - b) });
        }).sort((a, b) => b.agreed - a.agreed || (a.label < b.label ? -1 : 1));
        r.left = ev.budget == null ? null : ev.budget - r.agreed;
        return r;
    }
    // every payment still planned, across all events, soonest first; late ones are first of all
    function upcoming(state, t) {
        const out = [];
        state.events.forEach(ev => ev.vendors.forEach(v => {
            if (v.status === 'cancelled') return;
            v.plan.forEach(d => out.push({ ev, v, due: d, days: daysBetween(t, d.d), late: d.d < t }));
        }));
        return out.sort((a, b) => a.due.d < b.due.d ? -1 : a.due.d > b.due.d ? 1 : a.ev.name < b.ev.name ? -1 : 1);
    }
    function totals(state) {
        const r = { agreed: 0, paid: 0, toPay: 0, budget: 0, budgeted: 0, events: state.events.length };
        state.events.forEach(ev => { const s = eStats(ev); r.agreed += s.agreed; r.paid += s.paid; r.toPay += s.toPay; if (ev.budget != null) { r.budget += ev.budget; r.budgeted++; } });
        return r;
    }
    function priceWords(v, fm) {
        if (v.mode === 'perhead') return fm(v.rate * v.guests) + ' (' + v.guests.toLocaleString('en-US') + ' guests × ' + fm(v.rate) + ')';
        return fm(v.price);
    }
    // "8,40,000 agreed of 9,00,000 budget: 60,000 left to plan" / "over budget by 20,000"
    function budgetWords(agreed, budget, fm) {
        if (budget == null) return fm(agreed) + ' agreed, no budget set';
        if (agreed > budget) return fm(agreed) + ' agreed of ' + fm(budget) + ' budget: over budget by ' + fm(agreed - budget);
        if (agreed === budget) return fm(agreed) + ' agreed of ' + fm(budget) + ' budget: all of the budget is promised';
        return fm(agreed) + ' agreed of ' + fm(budget) + ' budget: ' + fm(budget - agreed) + ' not promised yet';
    }

    // ---------- text to copy, email and save ----------
    function vendorLine(v, fm, t) {
        const s = vStats(v), cat = catLabel(v);
        if (s.cancelled) return v.name + ' (' + cat + '): cancelled. Paid ' + fm(s.paidGross) + (s.refunded ? ', refunded ' + fm(s.refunded) : '') + ', lost ' + fm(s.cost) + '.';
        let line = v.name + ' (' + cat + '): agreed ' + priceWords(v, fm) + ', paid ' + fm(s.net) + ', ';
        line += s.balance ? 'still to pay ' + fm(s.balance) : (s.over ? 'paid ' + fm(s.over) + ' more than agreed' : 'fully paid');
        if (s.dues.length) line += '. Due: ' + s.dues.map(d => fm(d.amt) + ' on ' + fmtDate(d.d, t)).join(', ');
        if (s.unplanned && s.dues.length) line += ', ' + fm(s.unplanned) + ' with no date';
        return line + '.';
    }
    function eventText(ev, state, t) {
        const fm = c => fmtMoney(c, state.cur, state.group), s = eStats(ev), L = [];
        L.push(ev.name + (ev.date ? ' (' + fmtDate(ev.date, t, { year: true }) + ')' : ''));
        L.push(budgetWords(s.agreed, ev.budget, fm) + '. Paid ' + fm(s.paid) + '. Still to pay ' + fm(s.toPay) + '.');
        if (!ev.vendors.length) L.push('No vendors yet.');
        ev.vendors.forEach(v => L.push('- ' + vendorLine(v, fm, t)));
        const overCats = s.cats.filter(c => c.overBy);
        if (overCats.length) L.push('Over budget: ' + overCats.map(c => c.label + ' by ' + fm(c.overBy)).join(', ') + '.');
        return L.join('\n');
    }
    function allText(state, t) {
        const fm = c => fmtMoney(c, state.cur, state.group), T = totals(state), up = upcoming(state, t), L = [];
        L.push('Event budget, ' + fmtDate(t, t, { year: true }));
        if (state.events.length > 1) L.push('All events: agreed ' + fm(T.agreed) + ', paid ' + fm(T.paid) + ', still to pay ' + fm(T.toPay) + '.');
        if (up.length) {
            L.push('', 'Payments due:');
            up.slice(0, 12).forEach(u => L.push('- ' + fmtDate(u.due.d, t) + ': ' + u.v.name + ' (' + u.ev.name + ') ' + fm(u.due.amt) + (u.late ? ', ' + dueRel(u.due.d, t) : '')));
            if (up.length > 12) L.push('- and ' + plural(up.length - 12, 'more payment'));
        }
        state.events.forEach(ev => L.push('', eventText(ev, state, t)));
        return L.join('\n');
    }
    const csvCell = v => { let s = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    // one row per payment, refund and planned payment, for a spreadsheet or the family
    function csv(state) {
        const rows = [['Event', 'Event date', 'Vendor', 'Category', 'Status', 'Agreed price', 'Type', 'Date', 'Amount', 'Note']];
        const num = c => (c / 100).toFixed(2);
        state.events.forEach(ev => ev.vendors.forEach(v => {
            const s = vStats(v), base = [ev.name, ev.date, v.name, catLabel(v), s.cancelled ? 'Cancelled' : 'Booked', num(s.agreed)];
            const items = v.pays.map(p => [p.kind === 'refund' ? 'Refund' : 'Paid', p.d, num(p.amt), p.note]).concat(s.dues.map(d => ['Still due', d.d, num(d.amt), '']));
            if (!items.length) items.push(['Nothing paid yet', '', '', '']);
            items.sort((a, b) => a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0).forEach(it => rows.push(base.concat(it)));
        }));
        return rows.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
    }

    // ---------- saved state ----------
    const emptyState = () => ({ v: 1, cur: '', group: 'west', events: [] });
    const okMoney = (n, min) => Number.isInteger(n) && n >= (min == null ? 0 : min) && n <= MAXC;
    const okId = id => typeof id === 'string' && /^[a-z0-9]{1,24}$/i.test(id);
    function cleanPay(p, kinds) {
        if (!p || typeof p !== 'object' || !okId(p.id) || !isDate(p.d) || !okMoney(p.amt, 1)) return null;
        const o = { id: p.id, d: p.d, amt: p.amt };
        if (kinds) { o.kind = p.kind === 'refund' ? 'refund' : 'pay'; o.note = cleanText(p.note, LIM.pnote); }
        return o;
    }
    function cleanList(list, fn, max) {
        const seen = new Set(), out = [];
        (Array.isArray(list) ? list : []).forEach(x => { const c = fn(x); if (c && !seen.has(c.id)) { seen.add(c.id); out.push(c); } });
        return out.slice(0, max);
    }
    function cleanVendor(v) {
        if (!v || typeof v !== 'object' || !okId(v.id)) return null;
        const name = cleanText(v.name, LIM.vn);
        if (!name) return null;
        const mode = v.mode === 'perhead' ? 'perhead' : 'fixed';
        const o = { id: v.id, name, cat: CAT_KEYS.includes(v.cat) ? v.cat : 'other', catName: '', mode, price: 0, rate: 0, guests: 0,
            history: [], pays: cleanList(v.pays, p => cleanPay(p, true), LIM.pays), plan: cleanList(v.plan, p => cleanPay(p, false), LIM.plan),
            status: v.status === 'cancelled' ? 'cancelled' : 'booked', contact: cleanText(v.contact, LIM.contact), note: cleanNote(v.note, LIM.note) };
        if (o.cat === 'other') o.catName = cleanText(v.catName, LIM.cat);
        if (mode === 'perhead') {
            if (!okMoney(v.rate) || !Number.isInteger(v.guests) || v.guests < 1 || v.guests > MAXG || v.rate * v.guests > MAXC) return null;
            o.rate = v.rate; o.guests = v.guests;
        } else {
            if (!okMoney(v.price)) return null;
            o.price = v.price;
        }
        o.history = (Array.isArray(v.history) ? v.history : []).filter(h => h && isDate(h.d) && okMoney(h.from) && okMoney(h.to))
            .map(h => ({ d: h.d, from: h.from, to: h.to })).slice(-20);
        // refunds can never be more than what was paid
        const st = vStats(o);
        if (st.net < 0) o.pays = o.pays.filter(p => p.kind !== 'refund');
        return o;
    }
    function cleanEvent(e) {
        if (!e || typeof e !== 'object' || !okId(e.id)) return null;
        const name = cleanText(e.name, LIM.ev);
        if (!name) return null;
        const cb = {};
        if (e.catBudgets && typeof e.catBudgets === 'object') Object.keys(e.catBudgets).forEach(k => {
            if ((CAT_KEYS.includes(k) && k !== 'other') && okMoney(e.catBudgets[k])) cb[k] = e.catBudgets[k];
        });
        return { id: e.id, name, date: isDate(e.date) ? e.date : '', budget: okMoney(e.budget) ? e.budget : null, catBudgets: cb,
            note: cleanNote(e.note, LIM.note), vendors: cleanList(e.vendors, cleanVendor, LIM.vendors) };
    }
    function cleanState(s) {
        if (!s || typeof s !== 'object' || !Array.isArray(s.events)) return null;
        return { v: 1, cur: CURS.includes(s.cur) ? s.cur : '', group: s.group === 'lakh' ? 'lakh' : 'west', events: cleanList(s.events, cleanEvent, LIM.events) };
    }

    const api = { MAXC, MAXG, LIM, CURS, CATS, CAT_KEYS, catLabel, parseNum, parseMoney, parseOptMoney, parseGuests, cleanText, cleanNote, plural,
        isDate, today, addDays, daysBetween, fmtDate, rel, dueRel, groupDigits, fmtMoney, moneyInput, vStats, eStats, upcoming, totals, priceWords, budgetWords,
        vendorLine, eventText, allText, csv, emptyState, cleanPay, cleanVendor, cleanEvent, cleanState };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.EVB = api;
})(typeof window !== 'undefined' ? window : this);
