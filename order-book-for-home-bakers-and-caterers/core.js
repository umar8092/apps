// Order Book for Home Bakers and Caterers: the logic, kept apart from the page so it can be tested (node tests.js).
// Money is kept in whole cents (integers) so every total is exact. Dates are 'YYYY-MM-DD' strings, times 'HH:MM' or ''.
(function (root) {
    'use strict';
    const pad = n => String(n).padStart(2, '0');
    const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const STATUS = { open: 'Confirmed', ready: 'Ready', done: 'Handed over', cancel: 'Cancelled' };

    // ---------- dates ----------
    const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z')) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
    const isTime = s => s === '' || (typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s));
    const toUTC = s => new Date(s + 'T00:00:00Z');
    const iso = d => d.toISOString().slice(0, 10);
    const localISO = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    const addDays = (s, n) => { const d = toUTC(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
    const daysBetween = (a, b) => Math.round((toUTC(b) - toUTC(a)) / 864e5);
    const dow = s => toUTC(s).getUTCDay();
    const fmtDate = s => { const d = toUTC(s); return DAYS[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()]; };
    const fmtDateY = s => { const d = toUTC(s); return DAYS[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear(); };
    const fmtDateLong = s => { const d = toUTC(s); return DAYS_LONG[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + MONTHS_LONG[d.getUTCMonth()]; };
    const weekStart = s => addDays(s, -((dow(s) + 6) % 7));   // Monday
    const monthStart = s => s.slice(0, 8) + '01';
    const monthEnd = s => { const d = toUTC(monthStart(s)); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0); return iso(d); };
    const monthName = s => MONTHS_LONG[Number(s.slice(5, 7)) - 1] + ' ' + s.slice(0, 4);
    function relDay(s, today) {
        const n = daysBetween(today, s);
        if (n === 0) return 'today';
        if (n === 1) return 'tomorrow';
        if (n === -1) return 'yesterday';
        return n > 0 ? 'in ' + n + ' days' : (-n) + ' days ago';
    }
    function fmtTime(t) {
        if (!t) return 'Any time';
        let h = Number(t.slice(0, 2)); const m = t.slice(3, 5), ap = h < 12 ? 'am' : 'pm';
        h = h % 12 || 12;
        return h + ':' + m + ' ' + ap;
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

    // ---------- one order ----------
    const total = o => o.price + (o.mode === 'delivery' ? o.deliv : 0);
    const paid = o => o.adv + o.pays.reduce((s, p) => s + p.amt, 0);
    // money the baker keeps: nothing when the advance was given back on a cancelled order
    const kept = o => (o.status === 'cancel' && o.refund) ? 0 : paid(o);
    const balance = o => o.status === 'cancel' ? 0 : total(o) - paid(o);   // negative = paid more than the price
    const isActive = o => o.status === 'open' || o.status === 'ready';
    const sortKey = o => o.date + ' ' + (o.time || '99:99') + ' ' + String(o.n).padStart(6, '0');
    const byTime = (a, b) => sortKey(a) < sortKey(b) ? -1 : sortKey(a) > sortKey(b) ? 1 : 0;

    function moneyLine(o, cur, style) {
        const f = c => fmtMoney(c, cur, style);
        const t = total(o), p = paid(o);
        if (o.status === 'cancel') {
            if (!p) return 'Cancelled, nothing was paid';
            return o.refund ? 'Cancelled, ' + f(p) + ' given back' : 'Cancelled, you kept ' + f(p);
        }
        const deliv = o.mode === 'delivery' && o.deliv ? ' (with ' + f(o.deliv) + ' delivery)' : '';
        if (p === 0) return 'Total ' + f(t) + deliv + ', nothing paid yet';
        const b = t - p;
        if (b > 0) return 'Total ' + f(t) + deliv + ', paid ' + f(p) + ', balance ' + f(b);
        if (b === 0) return 'Total ' + f(t) + deliv + ', paid in full';
        return 'Total ' + f(t) + deliv + ', paid ' + f(p) + ' (' + f(-b) + ' more than the total)';
    }

    // ---------- the whole book ----------
    function countOn(orders, date, exceptId) {
        return orders.filter(o => o.date === date && o.status !== 'cancel' && o.id !== exceptId).length;
    }
    function dayInfo(orders, date) {
        const list = orders.filter(o => o.date === date && isActive(o)).sort(byTime);
        return { date, list, count: list.length, collect: list.reduce((s, o) => s + Math.max(0, balance(o)), 0) };
    }
    function periodStats(orders, from, to) {
        const inP = orders.filter(o => o.date >= from && o.date <= to);
        const live = inP.filter(o => o.status !== 'cancel');
        const sales = live.reduce((s, o) => s + total(o), 0) + inP.filter(o => o.status === 'cancel').reduce((s, o) => s + kept(o), 0);
        const received = inP.reduce((s, o) => s + kept(o), 0);
        const toCollect = live.reduce((s, o) => s + Math.max(0, balance(o)), 0);
        return { from, to, count: live.length, cancelled: inP.length - live.length, sales, received, toCollect };
    }
    function summary(orders, today) {
        const ws = weekStart(today);
        return {
            today: dayInfo(orders, today),
            tomorrow: dayInfo(orders, addDays(today, 1)),
            late: orders.filter(o => isActive(o) && o.date < today).sort(byTime),
            owed: orders.filter(o => o.status === 'done' && balance(o) > 0).sort(byTime),
            week: periodStats(orders, ws, addDays(ws, 6)),
            month: periodStats(orders, monthStart(today), monthEnd(today)),
        };
    }
    // the list on screen: groups by day, in time order
    function listView(orders, filter, today, q) {
        const query = String(q || '').trim().toLowerCase();
        let list = orders.filter(o => {
            if (filter === 'upcoming') return isActive(o);
            if (filter === 'done') return o.status === 'done';
            if (filter === 'cancel') return o.status === 'cancel';
            return true;
        });
        if (query) list = list.filter(o => [o.name, o.phone, o.what, o.note, o.addr, '#' + o.n].join(' ').toLowerCase().includes(query));
        list.sort(byTime);
        if (filter === 'done' || filter === 'cancel') list.reverse();
        const groups = [];
        list.forEach(o => {
            const key = filter === 'upcoming' && o.date < today ? 'late' : o.date;
            let g = groups.find(x => x.key === key);
            if (!g) { g = { key, date: o.date, late: key === 'late', list: [] }; groups.push(g); }
            g.list.push(o);
        });
        groups.forEach(g => { g.collect = g.list.reduce((s, o) => s + Math.max(0, balance(o)), 0); });
        return { count: list.length, groups };
    }
    function customers(orders) {
        const map = new Map();
        orders.slice().sort(byTime).forEach(o => {
            const k = o.name.trim().toLowerCase(); if (!k) return;
            const c = map.get(k) || { name: o.name.trim(), phone: '', count: 0 };
            c.count++; if (o.phone) c.phone = o.phone; c.name = o.name.trim();
            map.set(k, c);
        });
        return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
    }

    // ---------- messages ----------
    function whenText(o) { return fmtDateLong(o.date) + (o.time ? ' at ' + fmtTime(o.time) : ''); }
    function message(o, kind, cur, style, shop) {
        const f = c => fmtMoney(c, cur, style);
        const first = o.name.trim().split(/\s+/)[0] || 'there';
        const how = o.mode === 'delivery' ? 'Delivery' : 'Pickup';
        const t = total(o), p = paid(o), b = t - p;
        const L = [];
        const sign = shop ? '\n' + shop : '';
        if (kind === 'confirm') {
            L.push('Hi ' + first + ', your order is confirmed. Thank you!');
            L.push('');
            L.push('Order #' + o.n + ': ' + o.what);
            if (o.note) L.push('Note: ' + o.note);
            L.push(how + ': ' + whenText(o) + (o.mode === 'delivery' && o.addr ? ' to ' + o.addr : ''));
            L.push('Total: ' + f(t) + (o.mode === 'delivery' && o.deliv ? ' (with ' + f(o.deliv) + ' delivery)' : ''));
            if (p > 0) L.push('Paid: ' + f(p));
            if (b > 0) L.push('Balance to pay on ' + (o.mode === 'delivery' ? 'delivery' : 'pickup') + ': ' + f(b));
            else L.push('Paid in full.');
        } else if (kind === 'remind') {
            L.push('Hi ' + first + ', a reminder that your order (' + o.what + ') is for ' + (o.mode === 'delivery' ? 'delivery' : 'pickup') + ' on ' + whenText(o) + '.');
            if (b > 0) L.push('Balance to pay: ' + f(b) + '.');
            L.push('See you then!');
        } else if (kind === 'ready') {
            L.push('Hi ' + first + ', your order (' + o.what + ') is ready' + (o.mode === 'delivery' ? ' and on its way.' : ' for pickup.'));
            if (b > 0) L.push('Balance to pay: ' + f(b) + '.');
        } else {   // pay
            L.push('Hi ' + first + ', a kind reminder that ' + f(Math.max(0, b)) + ' is still to be paid for your order of ' + fmtDate(o.date) + ' (' + o.what + ').');
            L.push('Total ' + f(t) + ', paid ' + f(p) + '. Thank you!');
        }
        return L.join('\n') + sign;
    }
    function dayListText(orders, date, cur, style) {
        const d = dayInfo(orders, date), f = c => fmtMoney(c, cur, style);
        const L = ['Orders for ' + fmtDateY(date) + ': ' + d.count + (d.count === 1 ? ' order' : ' orders') + (d.collect ? ', collect ' + f(d.collect) : '')];
        if (!d.count) L.push('No orders.');
        d.list.forEach(o => {
            L.push('');
            L.push(fmtTime(o.time) + ' - ' + o.name + (o.phone ? ' (' + o.phone + ')' : '') + ' - #' + o.n);
            L.push('  ' + o.what);
            if (o.note) L.push('  Note: ' + o.note);
            L.push('  ' + (o.mode === 'delivery' ? 'Delivery' + (o.addr ? ' to ' + o.addr : '') : 'Pickup') + (o.status === 'ready' ? ' - READY' : ''));
            L.push('  ' + moneyLine(o, cur, style));
        });
        return L.join('\n');
    }
    function csv(orders) {
        const q = v => { const s = String(v == null ? '' : v); return /[",\n\r]/.test(s) || /^[=+\-@]/.test(s) ? '"' + (/^[=+\-@]/.test(s) ? "'" : '') + s.replace(/"/g, '""') + '"' : s; };
        const m = c => (c / 100).toFixed(2);
        const rows = [['Order', 'Date', 'Time', 'Customer', 'Phone', 'What', 'Note', 'Pickup or delivery', 'Address', 'Price', 'Delivery charge', 'Total', 'Paid', 'Balance', 'Status', 'Advance given back']];
        orders.slice().sort(byTime).forEach(o => rows.push([o.n, o.date, o.time, o.name, o.phone, o.what, o.note, o.mode, o.addr, m(o.price), m(o.mode === 'delivery' ? o.deliv : 0), m(total(o)), m(paid(o)), m(balance(o)), STATUS[o.status], o.status === 'cancel' ? (o.refund ? 'yes' : 'no') : '']));
        return rows.map(r => r.map(q).join(',')).join('\r\n');
    }

    // ---------- saved data: always checked before use ----------
    const str = (v, max) => typeof v === 'string' ? v.slice(0, max) : '';
    const cents = v => Number.isInteger(v) && v >= 0 && v <= 1e12 ? v : null;
    function cleanOrder(o) {
        if (!o || typeof o !== 'object') return null;
        if (!Number.isInteger(o.id) || o.id < 1 || !isDate(o.date) || !isTime(o.time == null ? '' : o.time)) return null;
        const name = str(o.name, 80).trim(), what = str(o.what, 400).trim();
        if (!name || !what) return null;
        const price = cents(o.price), deliv = cents(o.deliv || 0), adv = cents(o.adv || 0);
        if (price === null || deliv === null || adv === null) return null;
        const pays = Array.isArray(o.pays) ? o.pays.filter(p => p && isDate(p.d) && cents(p.amt) !== null && p.amt > 0).map(p => ({ d: p.d, amt: p.amt })) : [];
        return {
            id: o.id, n: Number.isInteger(o.n) && o.n > 0 ? o.n : o.id, name, phone: str(o.phone, 40).trim(), what, note: str(o.note, 600).trim(),
            date: o.date, time: o.time || '', mode: o.mode === 'delivery' ? 'delivery' : 'pickup', addr: str(o.addr, 200).trim(),
            price, deliv, adv, pays, status: STATUS[o.status] ? o.status : 'open', refund: !!o.refund, created: isDate(o.created) ? o.created : o.date,
        };
    }
    const CURS = ['', 'Rs', '₹', '$', '€', '£', 'AED', 'SAR', 'Tk', 'RM', 'R', 'A$', 'C$', '₦', 'KSh', '₱', '¥'];
    function cleanState(s) {
        const out = { v: 1, cur: '', style: 'intl', limit: 0, shop: '', nextId: 1, orders: [] };
        if (!s || typeof s !== 'object' || !Array.isArray(s.orders)) return null;
        out.cur = CURS.includes(s.cur) ? s.cur : '';
        out.style = s.style === 'sa' ? 'sa' : 'intl';
        out.limit = Number.isInteger(s.limit) && s.limit >= 0 && s.limit <= 200 ? s.limit : 0;
        out.shop = str(s.shop, 60).trim();
        const seen = new Set();
        s.orders.forEach(o => { const c = cleanOrder(o); if (c && !seen.has(c.id)) { seen.add(c.id); out.orders.push(c); } });
        const maxId = out.orders.reduce((m, o) => Math.max(m, o.id, o.n), 0);
        out.nextId = Number.isInteger(s.nextId) && s.nextId > maxId ? s.nextId : maxId + 1;
        return out;
    }

    const api = { pad, isDate, isTime, addDays, daysBetween, localISO, fmtDate, fmtDateY, fmtDateLong, weekStart, monthStart, monthEnd, monthName, relDay, fmtTime,
        readMoney, fmtMoney, total, paid, kept, balance, isActive, byTime, moneyLine, countOn, dayInfo, periodStats, summary, listView, customers,
        message, dayListText, csv, cleanOrder, cleanState, STATUS, CURS };
    if (typeof module === 'object' && module.exports) module.exports = api; else root.OrderCore = api;
})(this);
