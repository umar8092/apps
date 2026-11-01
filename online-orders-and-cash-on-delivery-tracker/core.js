// Online Orders and Cash on Delivery Tracker: the logic, kept apart from the page so it can be tested (node tests.js).
// Money is kept in whole cents (integers) so every total is exact. Dates are 'YYYY-MM-DD' strings.
// An order's cur is '' when it is in the main currency (Settings), or its own symbol when it was paid in another currency.
(function (root) {
    'use strict';
    const pad = n => String(n).padStart(2, '0');
    const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    // ---------- dates ----------
    const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z')) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
    const toUTC = s => new Date(s + 'T00:00:00Z');
    const iso = d => d.toISOString().slice(0, 10);
    const localISO = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    const addDays = (s, n) => { const d = toUTC(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
    const daysBetween = (a, b) => Math.round((toUTC(b) - toUTC(a)) / 864e5);
    const fmtDate = s => { const d = toUTC(s); return DAYS[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()]; };
    const fmtDateY = s => fmtDate(s) + ' ' + s.slice(0, 4);
    const monthName = s => MONTHS_LONG[Number(s.slice(5, 7)) - 1] + ' ' + s.slice(0, 4);
    const plural = (n, one, many) => n + ' ' + (n === 1 ? one : (many || one + 's'));
    function relDay(s, today) {
        const n = daysBetween(today, s);
        if (n === 0) return 'today';
        if (n === 1) return 'tomorrow';
        if (n === -1) return 'yesterday';
        return n > 0 ? 'in ' + n + ' days' : (-n) + ' days ago';
    }

    // ---------- money ----------
    function readMoney(s) {
        const t = String(s == null ? '' : s).replace(/[\s,]/g, '');
        if (!/^\d{1,10}(\.\d{1,2})?$/.test(t)) return NaN;
        const [w, f = ''] = t.split('.');
        return Number(w) * 100 + Number((f + '00').slice(0, 2));
    }
    function group(n, style) {
        const s = String(n);
        if (style === 'sa' && s.length > 3) { const last = s.slice(-3), rest = s.slice(0, -3); return rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last; }
        return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }
    function fmtMoney(c, cur, style) {
        const neg = c < 0, a = Math.abs(c), w = Math.floor(a / 100), f = a % 100;
        return (neg ? '-' : '') + (cur ? cur + (/[A-Za-z.]$/.test(cur) ? ' ' : '') : '') + group(w, style) + (f ? '.' + pad(f) : '');
    }
    // totals per currency: { '': 745000, '$': 1250 }
    function sumBy(list, fn) {
        const m = {};
        list.forEach(o => { const v = fn(o); if (v) m[o.cur || ''] = (m[o.cur || ''] || 0) + v; });
        return m;
    }
    const isZero = m => !Object.keys(m).some(k => m[k]);
    // "Rs 7,450 + $12.50"; main currency first
    function fmtMulti(m, main, style) {
        const keys = Object.keys(m).filter(k => m[k]).sort((a, b) => (a === '' ? -1 : b === '' ? 1 : a < b ? -1 : 1));
        if (!keys.length) return fmtMoney(0, main, style);
        return keys.map(k => fmtMoney(m[k], k || main, style)).join(' + ');
    }

    // ---------- one order ----------
    // status: coming, arrived, returning (sent back), refused (cash on delivery turned away at the door), cancelled
    const ENDED = ['returning', 'refused', 'cancelled'];
    const paid = o => o.pay === 'online' ? o.price : ((o.status === 'arrived' || o.status === 'returning') ? o.codPaid : 0);
    const refundGot = o => o.refunds.reduce((s, r) => s + r.amt, 0);
    const refundOwed = o => (ENDED.includes(o.status) && !o.refundClosed) ? Math.max(0, o.refundDue - refundGot(o)) : 0;
    const spent = o => paid(o) - refundGot(o);
    const returnBy = o => (o.status === 'arrived' && o.retDays > 0 && isDate(o.arrived)) ? addDays(o.arrived, o.retDays) : '';
    const returnOpen = (o, today) => { const r = returnBy(o); return !!r && !o.keep && today <= r; };
    const isLate = (o, today) => o.status === 'coming' && !!o.expected && o.expected < today;
    const endDate = o => o.status === 'returning' ? o.retSent : o.endDate;

    // the short badge for the box
    function badge(o, today) {
        if (o.status === 'coming') return isLate(o, today) ? { k: 'late', t: 'Late' } : { k: 'coming', t: 'On the way' };
        if (o.status === 'arrived') return returnOpen(o, today) ? { k: 'ret', t: 'Can return' } : { k: 'arrived', t: 'Arrived' };
        const owed = refundOwed(o);
        if (o.status === 'returning') return owed ? { k: 'wait', t: 'Refund waiting' } : { k: 'done', t: refundGot(o) ? 'Returned, refunded' : 'Returned' };
        if (owed) return { k: 'wait', t: 'Refund waiting' };
        return o.status === 'refused' ? { k: 'cancel', t: 'Refused' } : { k: 'cancel', t: 'Cancelled' };
    }

    // the main line under the item: when it comes, or what happened
    function whenLine(o, today) {
        if (o.status === 'coming') {
            if (!o.expected) return 'Ordered ' + fmtDate(o.ordered) + ', arrival date not known';
            const n = daysBetween(today, o.expected);
            if (n < 0) return 'Late: expected ' + fmtDate(o.expected) + ', ' + plural(-n, 'day') + ' ago';
            return 'Expected ' + relDay(o.expected, today) + (n > 1 ? ', ' + fmtDate(o.expected) : ' (' + fmtDate(o.expected) + ')');
        }
        if (o.status === 'arrived') {
            const r = returnBy(o);
            let s = 'Arrived ' + fmtDate(o.arrived);
            if (r && !o.keep) {
                const n = daysBetween(today, r);
                s += n < 0 ? ', return window closed ' + fmtDate(r) : n === 0 ? ', last day to return is today' : ', return by ' + fmtDate(r) + ' (' + plural(n, 'day') + ' left)';
            } else if (o.keep) s += ', keeping it';
            return s;
        }
        const d = endDate(o), ago = d ? daysBetween(d, today) : 0;
        const verb = o.status === 'returning' ? 'Sent back' : o.status === 'refused' ? 'Refused at the door' : 'Cancelled';
        return verb + (d ? ' ' + fmtDate(d) + (refundOwed(o) && ago > 0 ? ', ' + plural(ago, 'day') + ' ago' : '') : '');
    }

    // the money line
    function moneyLine(o, main, style) {
        const f = c => fmtMoney(c, o.cur || main, style);
        const got = refundGot(o), owed = refundOwed(o);
        if (o.status === 'coming') return o.pay === 'cod' ? 'Cash on delivery: keep ' + f(o.price) + ' ready' : 'Paid online ' + f(o.price);
        if (o.status === 'arrived') return o.pay === 'cod' ? 'Paid ' + f(o.codPaid) + ' cash to the rider' : 'Paid online ' + f(o.price);
        if (o.status === 'refused' && o.pay === 'cod') return 'Nothing paid';
        if (o.status === 'cancelled' && o.pay === 'cod') return 'Nothing paid';
        const p = paid(o);
        if (!o.refundDue && !got) return 'Paid ' + f(p) + ', no refund expected';
        if (owed) return 'Refund ' + f(o.refundDue) + (got ? ': got ' + f(got) + ', still waiting for ' + f(owed) : ', not received yet');
        if (got >= o.refundDue) return 'Refunded ' + f(got) + (got < p ? ' of ' + f(p) : ' in full');
        return 'Refunded ' + f(got) + ' of ' + f(o.refundDue) + ', no more coming';
    }

    // ---------- the summary at the top ----------
    function byExpected(a, b) {
        const ka = (a.expected || '9999-99-99') + String(a.n).padStart(6, '0'), kb = (b.expected || '9999-99-99') + String(b.n).padStart(6, '0');
        return ka < kb ? -1 : ka > kb ? 1 : 0;
    }
    function summary(orders, today) {
        const coming = orders.filter(o => o.status === 'coming').sort(byExpected);
        const cod = coming.filter(o => o.pay === 'cod');
        const late = coming.filter(o => isLate(o, today));
        const soon = coming.filter(o => o.expected === today || o.expected === addDays(today, 1));
        const returns = orders.filter(o => returnOpen(o, today)).sort((a, b) => returnBy(a) < returnBy(b) ? -1 : returnBy(a) > returnBy(b) ? 1 : a.n - b.n);
        const refunds = orders.filter(o => refundOwed(o) > 0).sort((a, b) => (endDate(a) || '') < (endDate(b) || '') ? -1 : (endDate(a) || '') > (endDate(b) || '') ? 1 : a.n - b.n);
        const mStart = today.slice(0, 8) + '01';
        const month = orders.filter(o => o.ordered >= mStart && o.ordered <= today.slice(0, 8) + '31');
        const monthSpent = sumBy(month, spent);
        const shops = new Map();
        month.forEach(o => { const v = spent(o); if (v <= 0) return; const k = o.shop.trim().toLowerCase() || '?'; const e = shops.get(k) || { shop: o.shop.trim() || 'Other', n: 0, m: {} }; e.n++; e.m[o.cur || ''] = (e.m[o.cur || ''] || 0) + v; shops.set(k, e); });
        return {
            coming, cod, late, soon, returns, refunds,
            cash: sumBy(cod, o => o.price),
            refundTotal: sumBy(refunds, refundOwed),
            month: { name: monthName(today), count: month.filter(o => o.status !== 'cancelled' && o.status !== 'refused').length, spent: monthSpent,
                     refunded: sumBy(month, refundGot), shops: [...shops.values()].sort((a, b) => b.n - a.n) },
        };
    }

    // ---------- the list ----------
    function inTab(o, tab) {
        if (tab === 'coming') return o.status === 'coming';
        if (tab === 'arrived') return o.status === 'arrived';
        if (tab === 'returns') return o.status === 'returning' || refundOwed(o) > 0;
        return true;
    }
    function listView(orders, tab, today, q) {
        const query = String(q || '').trim().toLowerCase();
        let list = orders.filter(o => inTab(o, tab));
        if (query) list = list.filter(o => [o.shop, o.what, o.track, o.courier, o.note, '#' + o.n].join(' ').toLowerCase().includes(query));
        if (tab === 'coming') return list.sort(byExpected);
        const key = o => o.status === 'coming' ? 'z' + (o.expected || o.ordered) : o.status === 'arrived' ? o.arrived : (endDate(o) || o.ordered);
        return list.sort((a, b) => key(a) < key(b) ? 1 : key(a) > key(b) ? -1 : b.n - a.n);
    }
    function counts(orders) {
        const c = { coming: 0, arrived: 0, returns: 0, all: orders.length };
        orders.forEach(o => { ['coming', 'arrived', 'returns'].forEach(t => { if (inTab(o, t)) c[t]++; }); });
        return c;
    }
    function shopNames(orders) {
        const seen = new Map();
        orders.forEach(o => { const k = o.shop.trim().toLowerCase(); if (k && !seen.has(k)) seen.set(k, o.shop.trim()); });
        return [...seen.values()];
    }

    // ---------- text to copy or send ----------
    function itemName(o) { return o.what.trim() + (o.shop.trim() ? ' from ' + o.shop.trim() : ''); }
    function comingText(orders, today, main, style) {
        const s = summary(orders, today);
        const L = ['On the way: ' + plural(s.coming.length, 'parcel') + ' (' + fmtDateY(today) + ')'];
        s.coming.forEach(o => {
            const when = !o.expected ? 'date not known' : isLate(o, today) ? 'LATE, expected ' + fmtDate(o.expected) : 'expected ' + fmtDate(o.expected);
            L.push('- ' + itemName(o) + ', ' + when + ', ' + (o.pay === 'cod' ? 'cash on delivery ' + fmtMoney(o.price, o.cur || main, style) : 'paid online') + (o.track ? ', tracking ' + o.track : ''));
        });
        if (s.cod.length) L.push('', 'Keep ' + fmtMulti(s.cash, main, style) + ' cash ready for ' + plural(s.cod.length, 'cash on delivery parcel') + '.');
        return L.join('\n');
    }
    // a polite message to the shop's helpline: where is my parcel, or where is my refund
    function chaseText(o, today, main, style) {
        const f = c => fmtMoney(c, o.cur || main, style);
        const ref = (o.track ? '\nTracking number: ' + o.track : '') + (o.orderNo ? '\nOrder number: ' + o.orderNo : '');
        if (o.status === 'coming') {
            const L = ['Hello, I am asking about my order: ' + o.what.trim() + '.', 'Order date: ' + fmtDateY(o.ordered) + ref];
            if (o.expected) L.push(isLate(o, today) ? 'It was expected on ' + fmtDateY(o.expected) + ' (' + plural(daysBetween(o.expected, today), 'day') + ' ago) and has not arrived.' : 'It is expected on ' + fmtDateY(o.expected) + '.');
            else L.push('It has not arrived yet.');
            L.push('Please tell me where it is and when it will be delivered. Thank you.');
            return L.join('\n');
        }
        const d = endDate(o), owed = refundOwed(o), got = refundGot(o);
        const did = o.status === 'returning' ? 'I returned it on ' : o.status === 'refused' ? 'I refused it at delivery on ' : 'I cancelled it on ';
        const L = ['Hello, I am waiting for a refund for my order: ' + o.what.trim() + '.', 'Order date: ' + fmtDateY(o.ordered) + ref];
        if (d) L.push(did + fmtDateY(d) + ' (' + plural(daysBetween(d, today), 'day') + ' ago).');
        L.push(got ? 'I have received ' + f(got) + ' so far. ' + f(owed) + ' is still to be refunded.' : 'The refund of ' + f(owed) + ' has not been received yet.');
        L.push('Please tell me when it will be paid. Thank you.');
        return L.join('\n');
    }
    function csv(orders, main) {
        const q = v => { const s = String(v == null ? '' : v); return /[",\n\r]/.test(s) || /^[=+\-@]/.test(s) ? '"' + (/^[=+\-@]/.test(s) ? "'" : '') + s.replace(/"/g, '""') + '"' : s; };
        const m = c => (c / 100).toFixed(2);
        const ST = { coming: 'On the way', arrived: 'Arrived', returning: 'Sent back', refused: 'Refused at the door', cancelled: 'Cancelled' };
        const rows = [['Order', 'Shop', 'What', 'Currency', 'Price', 'How paid', 'Ordered', 'Expected', 'Status', 'Arrived', 'Paid', 'Return by', 'Sent back or cancelled', 'Refund due', 'Refund received', 'Refund still owed', 'Tracking', 'Courier', 'Shop order number', 'Note']];
        orders.slice().sort((a, b) => a.n - b.n).forEach(o => rows.push([o.n, o.shop, o.what, o.cur || main, m(o.price), o.pay === 'cod' ? 'Cash on delivery' : 'Online', o.ordered, o.expected, ST[o.status], o.arrived,
            m(paid(o)), returnBy(o), endDate(o) || '', m(ENDED.includes(o.status) ? o.refundDue : 0), m(refundGot(o)), m(refundOwed(o)), o.track, o.courier, o.orderNo, o.note]));
        return '﻿' + rows.map(r => r.map(q).join(',')).join('\r\n') + '\r\n';
    }

    // ---------- saved data: everything restored is checked ----------
    const str = (v, max) => typeof v === 'string' ? v.slice(0, max) : '';
    const cents = v => Number.isInteger(v) && v >= 0 && v <= 1e12 ? v : null;
    const STATUSES = ['coming', 'arrived', 'returning', 'refused', 'cancelled'];
    const CURS = ['', 'Rs', '₹', '$', '€', '£', 'AED', 'SAR', 'QAR', 'Tk', 'RM', 'R', 'A$', 'C$', '₦', 'KSh', '₱', '¥', '₺', 'Rp', '฿', 'E£'];
    function cleanOrder(o) {
        if (!o || typeof o !== 'object') return null;
        const id = Number.isInteger(o.id) && o.id > 0 ? o.id : null;
        const what = str(o.what, 300).trim(), price = cents(o.price);
        if (!id || !what || price === null || !isDate(o.ordered)) return null;
        const status = STATUSES.includes(o.status) ? o.status : 'coming';
        const pay = o.pay === 'cod' ? 'cod' : 'online';
        const out = { id, n: Number.isInteger(o.n) && o.n > 0 ? o.n : id, shop: str(o.shop, 60).trim(), what, price, cur: CURS.includes(o.cur) ? o.cur : '', pay,
            ordered: o.ordered, expected: isDate(o.expected) ? o.expected : '', track: str(o.track, 60).trim(), courier: str(o.courier, 40).trim(), orderNo: str(o.orderNo, 60).trim(),
            retDays: Number.isInteger(o.retDays) && o.retDays >= 0 && o.retDays <= 365 ? o.retDays : 0, note: str(o.note, 500).trim(), status,
            arrived: isDate(o.arrived) ? o.arrived : '', codPaid: cents(o.codPaid) === null ? price : o.codPaid, keep: o.keep === true,
            retSent: isDate(o.retSent) ? o.retSent : '', endDate: isDate(o.endDate) ? o.endDate : '', refundDue: cents(o.refundDue) === null ? 0 : o.refundDue,
            refunds: Array.isArray(o.refunds) ? o.refunds.filter(r => r && isDate(r.d) && cents(r.amt) !== null && r.amt > 0).map(r => ({ d: r.d, amt: r.amt })) : [],
            refundClosed: o.refundClosed === true };
        if ((status === 'arrived' || status === 'returning') && !out.arrived) out.arrived = out.ordered;
        if (status === 'returning' && !out.retSent) out.retSent = out.arrived;
        return out;
    }
    function cleanState(s) {
        const out = { v: 1, cur: '', style: 'intl', nextId: 1, orders: [] };
        if (!s || typeof s !== 'object' || !Array.isArray(s.orders)) return out;
        if (CURS.includes(s.cur)) out.cur = s.cur;
        if (s.style === 'sa') out.style = 'sa';
        const seen = new Set();
        s.orders.forEach(o => { const c = cleanOrder(o); if (c && !seen.has(c.id)) { seen.add(c.id); out.orders.push(c); } });
        const maxId = out.orders.reduce((m, o) => Math.max(m, o.id, o.n), 0);
        out.nextId = Math.max(maxId + 1, Number.isInteger(s.nextId) && s.nextId > 0 && s.nextId < 1e9 ? s.nextId : 1);
        return out;
    }
    function newOrder(fields, id) {
        return cleanOrder(Object.assign({ id, n: id, shop: '', what: '', price: 0, cur: '', pay: 'online', ordered: '', expected: '', track: '', courier: '', orderNo: '', retDays: 0, note: '',
            status: 'coming', arrived: '', codPaid: 0, keep: false, retSent: '', endDate: '', refundDue: 0, refunds: [], refundClosed: false }, fields));
    }

    const api = { pad, isDate, addDays, daysBetween, localISO, fmtDate, fmtDateY, monthName, relDay, plural, readMoney, fmtMoney, sumBy, isZero, fmtMulti,
        paid, refundGot, refundOwed, spent, returnBy, returnOpen, isLate, endDate, badge, whenLine, moneyLine, summary, inTab, listView, counts, shopNames,
        itemName, comingText, chaseText, csv, cleanOrder, cleanState, newOrder, CURS };
    if (typeof module === 'object' && module.exports) module.exports = api; else root.ParcelCore = api;
})(this);
