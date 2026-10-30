// Declutter and Sell Tracker: the money, the dates and the words. No page code here, so tests.js can run it in node.
// Money is kept in whole cents and dates as "2026-10-30" day strings, so every sum is exact.
(function (root) {
    'use strict';
    const MAXC = 10000000000;        // up to 100,000,000 for one item
    const LIM = { name: 80, note: 300, site: 40, who: 60, swap: 120 };
    const SITES = ['OLX', 'Facebook Marketplace', 'eBay', 'Vinted', 'Gumtree', 'Craigslist', 'Depop', 'WhatsApp group', 'Friends and family'];
    const STALE = 14;                // days at one price before a price drop is suggested
    const ST = { sale: 'For sale', reserved: 'Reserved', sold: 'Sold', given: 'Given away', kept: 'Kept' };

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
    const parseMoney = (t, opt) => parseNum(t, 2, Object.assign({ max: MAXC, blank: 'Type an amount, such as 8000.', big: 'That amount is too big.', bad: 'Type an amount such as 8000 or 33.50.', decimals: 'Use at most 2 decimal places.', minus: 'Type it without a minus sign.', positive: true, zero: 'Type an amount bigger than 0.' }, opt || {}));
    // optional money: blank is null
    function parseOptMoney(t, opt) {
        if (String(t == null ? '' : t).trim() === '') return { n: null };
        return parseMoney(t, opt);
    }
    // money where 0 is fine (a deposit, a swap): blank is 0
    function parseZeroMoney(t) {
        if (String(t == null ? '' : t).trim() === '') return { n: 0 };
        return parseMoney(t, { positive: false });
    }

    // ---------- text ----------
    const cleanText = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max).trim();
    const cleanNote = (s, max) => String(s == null ? '' : s).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]+/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, max).trim();
    const norm = s => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    // the sites an item is listed on: the presets in their usual order, then any typed ones, no repeats
    function cleanSites(list) {
        const out = [], seen = new Set();
        (Array.isArray(list) ? list : []).forEach(s => {
            const v = cleanText(s, LIM.site), k = norm(v);
            if (v && k && !seen.has(k)) { seen.add(k); out.push(SITES.find(p => norm(p) === k) || v); }
        });
        return out.sort((a, b) => { const i = SITES.indexOf(a), j = SITES.indexOf(b); return (i < 0 ? 99 : i) - (j < 0 ? 99 : j); }).slice(0, 12);
    }
    // "Gumtree, Shpock" typed in Other places
    const splitSites = s => String(s == null ? '' : s).split(/[,;\n]+/).map(x => cleanText(x, LIM.site)).filter(Boolean);

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
    // "Sat 31 Oct", with the year when it is not this year
    function fmtDate(s, t) {
        const wd = WD[new Date(dNum(s) * 86400000).getUTCDay()];
        return wd + ' ' + (+s.slice(8, 10)) + ' ' + MON[+s.slice(5, 7) - 1] + (!t || s.slice(0, 4) !== t.slice(0, 4) ? ' ' + s.slice(0, 4) : '');
    }
    // "today", "tomorrow", "Sat 31 Oct"
    function dayWord(s, t) {
        const d = daysBetween(t, s);
        return d === 0 ? 'today' : d === 1 ? 'tomorrow' : d === -1 ? 'yesterday' : fmtDate(s, t);
    }
    const plural = (n, one, many) => n + ' ' + (n === 1 ? one : (many || one + 's'));
    const ago = n => n === 0 ? 'today' : n === 1 ? 'yesterday' : n + ' days ago';

    // ---------- money ----------
    function fmtMoney(cents, cur, loc) {
        const n = Math.abs(cents);
        let t;
        try { t = new Intl.NumberFormat(loc || undefined, { minimumFractionDigits: n % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(n / 100); }
        catch (e) { t = (n / 100).toFixed(n % 100 ? 2 : 0); }
        t = (cents < 0 ? '-' : '') + t;
        if (!cur) return t;
        return /^[A-Za-z]/.test(cur) || /[A-Za-z]$/.test(cur) ? cur + ' ' + t : cur + t;
    }
    const moneyInput = c => c == null ? '' : (c / 100).toFixed(c % 100 ? 2 : 0);
    // a whole amount split by weights (asking prices) to the cent, the leftover cents going to the biggest remainders first (ties: first in the list)
    function split(total, weights) {
        // if any item has no asking price, everyone gets an equal share
        const ws = weights.every(x => x > 0) ? weights.slice() : weights.map(() => 1);
        const sumW = ws.reduce((a, b) => a + b, 0);
        const base = ws.map(x => Math.floor(total * x / sumW));
        let left = total - base.reduce((a, b) => a + b, 0);
        const order = ws.map((x, i) => ({ i, r: (total * x) % sumW })).sort((a, b) => b.r - a.r || a.i - b.i);
        for (let k = 0; left > 0; k++, left--) base[order[k % order.length].i]++;
        return base;
    }

    // ---------- items ----------
    const price = it => it.prices.length ? it.prices[it.prices.length - 1].c : null;
    const firstPrice = it => it.prices.length ? it.prices[0].c : null;
    // a new asking price on day t: the same day replaces the last one; blank clears it
    function setPrice(it, c, t) {
        if (c == null) { it.prices = []; return; }
        if (price(it) === c) return;
        const last = it.prices[it.prices.length - 1];
        if (last && last.d === t) { last.c = c; if (it.prices.length > 1 && it.prices[it.prices.length - 2].c === c) it.prices.pop(); }
        else it.prices.push({ d: t, c });
        if (it.prices.length > 30) it.prices.splice(1, it.prices.length - 30);
    }
    // the day the price was last set (or the day it was listed)
    const priceSince = it => it.prices.length ? (it.prices[it.prices.length - 1].d > it.listed ? it.prices[it.prices.length - 1].d : it.listed) : it.listed;
    const daysListed = (it, t) => Math.max(0, daysBetween(it.listed, t));
    const openOffers = it => it.offers.filter(o => o.st === 'open');
    function bestOffer(it) {
        const o = openOffers(it);
        return o.length ? o.reduce((a, b) => (b.c > a.c ? b : a)) : null;
    }
    // for sale at the same price for STALE days or more with no open offer: a price drop is due
    function dropDue(it, t) {
        if (it.st !== 'sale' || price(it) == null || openOffers(it).length) return 0;
        const d = daysBetween(priceSince(it), t);
        return d >= STALE ? d : 0;
    }
    // "Was 15,000, then 13,500, now 12,000"
    function priceTrail(it, cur, loc) {
        if (it.prices.length < 2) return '';
        const ps = it.prices.map(p => fmtMoney(p.c, cur, loc));
        return 'Was ' + ps.slice(0, -1).join(', then ') + ', now ' + ps[ps.length - 1];
    }
    const log = (it, d, text) => { it.log.push({ d, text: cleanText(text, 200) }); if (it.log.length > 40) it.log.splice(0, it.log.length - 40); };

    // ---------- what happens to an item ----------
    function addOffer(it, o, t) {
        it.offers.push({ id: o.id, who: cleanText(o.who, LIM.who), c: o.c, d: t, st: 'open' });
        if (it.offers.length > 60) it.offers.splice(0, it.offers.length - 60);
    }
    function setOffer(it, oid, st) { const o = it.offers.find(x => x.id === oid); if (o) o.st = st; }
    // a buyer has agreed: hold it for them
    function reserve(it, deal, t) {
        it.st = 'reserved';
        it.deal = { who: cleanText(deal.who, LIM.who), c: deal.c, pick: deal.pick || null, paid: Math.min(deal.paid || 0, deal.c), d: t };
        it.offers.forEach(o => { if (o.st === 'open' && norm(o.who) === norm(it.deal.who) && it.deal.who) o.st = 'accepted'; });
        log(it, t, 'Reserved for ' + (it.deal.who || 'a buyer'));
    }
    // the buyer did not come: back on sale; a deposit is either given back or kept
    function noShow(it, t, keepDeposit) {
        const d = it.deal;
        if (!d) return;
        if (keepDeposit && d.paid > 0) it.dep += d.paid;
        log(it, t, (d.who || 'The buyer') + ' did not come' + (d.paid > 0 ? (keepDeposit ? ', deposit kept' : ', deposit given back') : ''));
        it.offers.forEach(o => { if (o.st === 'accepted' && norm(o.who) === norm(d.who)) o.st = 'noshow'; });
        it.st = 'sale'; it.deal = null;
    }
    // sold (paid and gone). c may be 0 for a swap.
    function sell(it, s, t) {
        it.st = 'sold';
        it.done = { d: s.d || t, who: cleanText(s.who, LIM.who), c: s.c, swap: cleanText(s.swap, LIM.swap), bundle: s.bundle || null };
        it.deal = null;
        it.offers.forEach(o => { if (o.st === 'open') o.st = 'declined'; });
    }
    // sell several items together for one price, split by their asking prices
    function sellBundle(items, total, s, t, bid) {
        const parts = split(total, items.map(price));
        items.forEach((it, i) => sell(it, Object.assign({}, s, { c: parts[i], bundle: bid }), t));
        return parts;
    }
    function giveAway(it, who, t) { it.st = 'given'; it.done = { d: t, who: cleanText(who, LIM.who), c: 0, swap: '', bundle: null }; it.deal = null; }
    function keep(it, t) { it.st = 'kept'; it.done = { d: t, who: '', c: 0, swap: '', bundle: null }; it.deal = null; }
    function relist(it, t) {
        if (it.st === 'sale') return;
        log(it, t, 'Put back on sale');
        it.st = 'sale'; it.done = null; it.deal = null;
    }

    // ---------- the lists and totals ----------
    function sorted(items, t) {
        const r = { reserved: [], sale: [], sold: [], given: [], kept: [] };
        items.forEach(it => r[it.st].push(it));
        r.reserved.sort((a, b) => (a.deal.pick || '9999').localeCompare(b.deal.pick || '9999') || a.name.localeCompare(b.name));
        r.sale.sort((a, b) => (dropDue(b, t) > 0) - (dropDue(a, t) > 0) || a.listed.localeCompare(b.listed) || a.name.localeCompare(b.name));
        ['sold', 'given', 'kept'].forEach(k => r[k].sort((a, b) => b.done.d.localeCompare(a.done.d) || a.name.localeCompare(b.name)));
        return r;
    }
    const sum = (list, f) => list.reduce((a, it) => a + (f(it) || 0), 0);
    function summary(state, t) {
        const s = sorted(state.items, t);
        const priced = s.sold.filter(i => firstPrice(i) != null && !i.done.swap);
        const r = {
            sale: s.sale.length, asking: sum(s.sale, price), noPrice: s.sale.filter(i => price(i) == null).length, dropDue: s.sale.filter(i => dropDue(i, t)).length,
            offers: sum(s.sale, i => openOffers(i).length),
            reserved: s.reserved.length, agreed: sum(s.reserved, i => i.deal.c), depHeld: sum(s.reserved, i => i.deal.paid),
            sold: s.sold.length, soldFor: sum(s.sold, i => i.done.c), swaps: s.sold.filter(i => i.done.swap).length,
            depKept: sum(state.items, i => i.dep),
            given: s.given.length, kept: s.kept.length, total: state.items.length,
            pricedSold: sum(priced, i => i.done.c), pricedAsked: sum(priced, firstPrice), pct: null
        };
        r.toCollect = r.agreed - r.depHeld;
        r.made = r.soldFor + r.depKept;
        if (r.pricedAsked > 0) r.pct = Math.round(r.pricedSold * 100 / r.pricedAsked);
        return r;
    }
    // per place: how many listed now and how many sold from there
    function bySite(items) {
        const m = new Map();
        items.forEach(it => {
            const where = it.sites.length ? it.sites : ['Not set'];
            where.forEach(w => {
                const e = m.get(w) || { site: w, sale: 0, sold: 0 };
                if (it.st === 'sale' || it.st === 'reserved') e.sale++;
                if (it.st === 'sold') e.sold++;
                m.set(w, e);
            });
        });
        return [...m.values()].filter(e => e.sale || e.sold);
    }
    function dealWords(it, t, cur, loc) {
        const d = it.deal, out = [(d.who || 'A buyer') + ', ' + fmtMoney(d.c, cur, loc)];
        out.push(d.pick ? 'collecting ' + dayWord(d.pick, t) : 'no day set');
        if (d.paid > 0) out.push(fmtMoney(d.paid, cur, loc) + ' paid, ' + fmtMoney(d.c - d.paid, cur, loc) + ' to collect');
        return out.join(', ');
    }
    function doneWords(it, t, cur, loc) {
        const d = it.done;
        if (it.st === 'sold') {
            let s = 'Sold' + (d.who ? ' to ' + d.who : '') + ' ' + dayWord(d.d, t).replace(/^(?=[A-Z])/, 'on ');
            if (d.swap) s += ', swapped for ' + d.swap + (d.c ? ' plus ' + fmtMoney(d.c, cur, loc) : '');
            else s += ' for ' + fmtMoney(d.c, cur, loc);
            const f = firstPrice(it);
            if (!d.swap && f != null && f !== d.c) s += ' (first asked ' + fmtMoney(f, cur, loc) + ')';
            return s;
        }
        if (it.st === 'given') return 'Given away' + (d.who ? ' to ' + d.who : '') + ' ' + dayWord(d.d, t).replace(/^(?=[A-Z])/, 'on ');
        return 'Kept, taken off sale ' + dayWord(d.d, t).replace(/^(?=[A-Z])/, 'on ');
    }
    // the text to paste into a listing
    function adText(it, cur, loc) {
        const p = price(it), out = ['For sale: ' + it.name + (p != null ? ', ' + fmtMoney(p, cur, loc) : '')];
        if (it.note) out.push(it.note);
        return out.join('\n');
    }
    function listText(state, t, cur, loc) {
        const s = sorted(state.items, t), m = summary(state, t), M = c => fmtMoney(c, cur, loc), out = ['My things for sale (' + fmtDate(t, t) + ')'];
        if (s.reserved.length) out.push('', 'Waiting to be collected:', ...s.reserved.map(it => '- ' + it.name + ': ' + dealWords(it, t, cur, loc)));
        if (s.sale.length) out.push('', 'For sale:', ...s.sale.map(it => '- ' + it.name + ': ' + (price(it) == null ? 'no price set' : M(price(it))) + (it.sites.length ? ' (' + it.sites.join(', ') + ')' : '') + ', listed ' + ago(daysListed(it, t))));
        if (s.sold.length) out.push('', 'Sold:', ...s.sold.map(it => '- ' + it.name + ': ' + doneWords(it, t, cur, loc)));
        if (s.given.length) out.push('', 'Given away:', ...s.given.map(it => '- ' + it.name + (it.done.who ? ' (to ' + it.done.who + ')' : '')));
        out.push('', 'Money made: ' + M(m.made) + ' from ' + plural(m.sold, 'item') + ' sold' + (m.pct != null ? ' (' + m.pct + '% of what I first asked)' : ''));
        if (m.sale) out.push('Still for sale: ' + plural(m.sale, 'item') + ', asking ' + M(m.asking));
        if (m.reserved) out.push('Still to collect: ' + M(m.toCollect));
        return out.join('\n');
    }

    // ---------- saved data ----------
    const emptyState = () => ({ v: 1, cur: '', items: [] });
    const okId = s => typeof s === 'string' && /^[a-z0-9_-]{1,40}$/i.test(s);
    const okC = c => Number.isInteger(c) && c > 0 && c <= MAXC;
    const okC0 = c => Number.isInteger(c) && c >= 0 && c <= MAXC;
    const okPhoto = s => typeof s === 'string' && s.length < 150000 && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(s);
    function cleanItem(i) {
        if (!i || typeof i !== 'object' || !okId(i.id)) return null;
        const name = cleanText(i.name, LIM.name);
        if (!name || !Object.prototype.hasOwnProperty.call(ST, i.st) || !isDate(i.listed)) return null;
        const r = { id: i.id, name, st: i.st, listed: i.listed, sites: cleanSites(i.sites), note: cleanNote(i.note, LIM.note),
            prices: (Array.isArray(i.prices) ? i.prices : []).filter(p => p && isDate(p.d) && okC(p.c)).map(p => ({ d: p.d, c: p.c })).slice(-30),
            min: okC(i.min) ? i.min : null, photo: okPhoto(i.photo) ? i.photo : '', dep: okC0(i.dep) ? i.dep : 0,
            offers: (Array.isArray(i.offers) ? i.offers : []).filter(o => o && okId(o.id) && okC(o.c) && isDate(o.d) && ['open', 'declined', 'accepted', 'noshow'].includes(o.st))
                .map(o => ({ id: o.id, who: cleanText(o.who, LIM.who), c: o.c, d: o.d, st: o.st })).slice(-60),
            log: (Array.isArray(i.log) ? i.log : []).filter(l => l && isDate(l.d) && typeof l.text === 'string').map(l => ({ d: l.d, text: cleanText(l.text, 200) })).slice(-40),
            deal: null, done: null };
        if (r.st === 'reserved') {
            const d = i.deal;
            if (!d || !okC(d.c) || !isDate(d.d)) return null;
            r.deal = { who: cleanText(d.who, LIM.who), c: d.c, pick: isDate(d.pick) ? d.pick : null, paid: okC0(d.paid) ? Math.min(d.paid, d.c) : 0, d: d.d };
        }
        if (r.st === 'sold' || r.st === 'given' || r.st === 'kept') {
            const d = i.done;
            if (!d || !isDate(d.d)) return null;
            r.done = { d: d.d, who: cleanText(d.who, LIM.who), c: r.st === 'sold' && okC0(d.c) ? d.c : 0, swap: r.st === 'sold' ? cleanText(d.swap, LIM.swap) : '', bundle: okId(d.bundle) ? d.bundle : null };
        }
        return r;
    }
    const CURS = ['', '$', '€', '£', 'Rs', '₹', 'A$', 'C$', 'NZ$', 'AED', 'SAR', 'QAR', 'KWD', 'R', '৳', '₦', 'KSh', 'RM', 'Rp', '₱', 'S$', '¥', '₩', '₺', 'R$', 'kr', 'CHF', 'zł'];
    function cleanState(s) {
        if (!s || typeof s !== 'object' || !Array.isArray(s.items)) return null;
        const seen = new Set(), items = [];
        s.items.forEach(i => { const c = cleanItem(i); if (c && !seen.has(c.id)) { seen.add(c.id); items.push(c); } });
        return { v: 1, cur: CURS.includes(s.cur) ? s.cur : '', items: items.slice(0, 1000) };
    }

    const api = { MAXC, LIM, SITES, STALE, ST, CURS, parseNum, parseMoney, parseOptMoney, parseZeroMoney, cleanText, cleanNote, norm, cleanSites, splitSites,
        isDate, today, addDays, daysBetween, fmtDate, dayWord, plural, ago, fmtMoney, moneyInput, split, price, firstPrice, setPrice, priceSince, daysListed,
        openOffers, bestOffer, dropDue, priceTrail, log, addOffer, setOffer, reserve, noShow, sell, sellBundle, giveAway, keep, relist,
        sorted, summary, bySite, dealWords, doneWords, adText, listText, emptyState, okPhoto, cleanItem, cleanState };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.DECLUTTER = api;
})(typeof window !== 'undefined' ? window : this);
