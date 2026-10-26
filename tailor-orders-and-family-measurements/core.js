// Tailor Orders and Family Measurements: the logic, with no page code.
// Dates are calendar dates ('2026-10-27'), so time zones and summer time never move a date.
// Money is kept in whole cents, so every total is exact. Measurements are numbers in inches or cm.
(function (root) {
    'use strict';

    const CURRENCIES = ['', 'Rs', 'PKR', '₹', '$', '€', '£', 'AED', 'SAR', '৳', '₦', 'KSh', 'RM', 'A$', 'C$'];
    const MAX_PEOPLE = 40, MAX_ORDERS = 2000, MAX_SETS = 30, MAX_CUSTOM = 12, MAX_PAYMENTS = 30;
    const MAX_CENTS = 10000000000; // 100,000,000.00
    const LIMIT = { in: 200, cm: 500 };

    // The usual measurements a tailor takes, for a shirt or kameez and for trousers or shalwar.
    const FIELDS = [
        { key: 'length', label: 'Shirt / kameez length', group: 'top' },
        { key: 'shoulder', label: 'Shoulder', group: 'top' },
        { key: 'chest', label: 'Chest', group: 'top' },
        { key: 'waist', label: 'Waist', group: 'top' },
        { key: 'hip', label: 'Hip', group: 'top' },
        { key: 'sleeve', label: 'Sleeve length', group: 'top' },
        { key: 'armhole', label: 'Armhole', group: 'top' },
        { key: 'upperarm', label: 'Upper arm', group: 'top' },
        { key: 'cuff', label: 'Wrist / cuff', group: 'top' },
        { key: 'neck', label: 'Neck / collar', group: 'top' },
        { key: 'daman', label: 'Daman / hem width', group: 'top' },
        { key: 'tlength', label: 'Shalwar / trouser length', group: 'bottom' },
        { key: 'twaist', label: 'Trouser waist', group: 'bottom' },
        { key: 'thigh', label: 'Thigh', group: 'bottom' },
        { key: 'knee', label: 'Knee', group: 'bottom' },
        { key: 'bottom', label: 'Bottom / paicha', group: 'bottom' }
    ];
    const FIELD_KEYS = FIELDS.map(f => f.key);
    const ITEMS = ['Shalwar kameez', 'Kurta', 'Suit (3 piece)', 'Shirt', 'Trousers', 'School uniform', 'Dress', 'Alteration'];

    // ---------- dates ----------
    const pad = n => String(n).padStart(2, '0');
    const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    function isIso(s) {
        if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
        const [y, m, d] = s.split('-').map(Number);
        if (y < 1900 || y > 2200) return false;
        const t = new Date(Date.UTC(y, m - 1, d));
        return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
    }
    const toUtc = s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
    const fromUtc = t => { const d = new Date(t); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); };
    const addDays = (s, n) => fromUtc(toUtc(s) + n * 86400000);
    const diff = (a, b) => Math.round((toUtc(a) - toUtc(b)) / 86400000); // a minus b, in days
    const todayIso = (now = new Date()) => now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
    function fmt(s, withYear) {
        if (!isIso(s)) return '';
        const d = new Date(toUtc(s));
        return DAY[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + MON[d.getUTCMonth()] + (withYear ? ' ' + d.getUTCFullYear() : '');
    }
    // the year is shown only when the date is not in the current year
    const fmtNear = (s, today) => fmt(s, s.slice(0, 4) !== today.slice(0, 4));
    const plural = (n, one, many) => n + ' ' + (n === 1 ? one : (many || one + 's'));
    function rel(s, today) {
        const n = diff(s, today);
        if (n === 0) return 'today';
        if (n === 1) return 'tomorrow';
        if (n === -1) return 'yesterday';
        return n > 0 ? 'in ' + plural(n, 'day') : plural(-n, 'day') + ' ago';
    }
    function age(s, today) { // how long ago a measurement was taken, in plain words
        const n = diff(today, s);
        if (n <= 0) return 'today';
        if (n < 14) return plural(n, 'day') + ' ago';
        if (n < 60) return plural(Math.floor(n / 7), 'week') + ' ago';
        const months = monthsBetween(s, today);
        if (months < 12) return plural(months, 'month') + ' ago';
        const y = Math.floor(months / 12), m = months % 12;
        return plural(y, 'year') + (m ? ' ' + plural(m, 'month') : '') + ' ago';
    }
    function monthsBetween(a, b) { // whole months from a to b
        const [y1, m1, d1] = a.split('-').map(Number), [y2, m2, d2] = b.split('-').map(Number);
        let m = (y2 - y1) * 12 + (m2 - m1);
        if (d2 < d1) m--;
        return Math.max(0, m);
    }

    // ---------- measurements ----------
    const FRAC = { '¼': .25, '½': .5, '¾': .75, '⅛': .125, '⅜': .375, '⅝': .625, '⅞': .875 };
    const FRAC_OUT = { 0.125: '⅛', 0.25: '¼', 0.375: '⅜', 0.5: '½', 0.625: '⅝', 0.75: '¾', 0.875: '⅞' };
    // Reads "14", "14.5", "14,5", "14½", "14 1/2", "14-1/2", "1/2". Returns a number, null for blank, or NaN.
    function parseMeasure(text) {
        let s = String(text == null ? '' : text).trim().toLowerCase().replace(/(inches|inch|in|cm|"|”|″)$/, '').trim();
        if (!s) return null;
        let extra = 0;
        const last = s.slice(-1);
        if (FRAC[last] !== undefined) { extra = FRAC[last]; s = s.slice(0, -1).trim(); if (!s) return extra; }
        s = s.replace(',', '.');
        let m;
        if ((m = s.match(/^(\d+(?:\.\d+)?)$/))) return Number(m[1]) + extra;
        if (extra) return NaN;
        if ((m = s.match(/^(\d+)\s*(?:[\s-]|\+)\s*(\d+)\s*\/\s*(\d+)$/))) {
            const den = Number(m[3]); if (!den || Number(m[2]) >= den) return NaN;
            return Number(m[1]) + Number(m[2]) / den;
        }
        if ((m = s.match(/^(\d+)\s*\/\s*(\d+)$/))) { const den = Number(m[2]); if (!den || Number(m[1]) >= den) return NaN; return Number(m[1]) / den; }
        return NaN;
    }
    // Inches show as tailors write them (14½, 38¾); cm show with at most one decimal.
    function fmtMeasure(v, unit) {
        if (typeof v !== 'number' || !isFinite(v)) return '';
        if (unit === 'in') {
            const eighths = Math.round(v * 8);
            if (Math.abs(eighths / 8 - v) < 1e-9) {
                const whole = Math.floor(eighths / 8), rest = (eighths % 8) / 8;
                if (!rest) return String(whole);
                return (whole ? whole : '') + FRAC_OUT[rest];
            }
            return String(Math.round(v * 100) / 100);
        }
        return String(Math.round(v * 10) / 10);
    }
    const unitWord = u => u === 'cm' ? 'cm' : 'inches';
    // Converting rounds to what a tape shows: the nearest ¼ inch or 0.5 cm.
    function convert(v, from, to) {
        if (from === to) return v;
        return to === 'cm' ? Math.round(v * 2.54 * 2) / 2 : Math.round(v / 2.54 * 4) / 4;
    }
    function checkMeasure(text, unit) {
        const v = parseMeasure(text);
        if (v === null) return { value: null };
        if (isNaN(v)) return { error: 'Type a number like 14, 14.5 or 14 1/2.' };
        if (v <= 0) return { error: 'A measurement must be more than 0.' };
        if (v > LIMIT[unit]) return { error: 'That is more than ' + LIMIT[unit] + ' ' + unitWord(unit) + '. Check the number and the unit.' };
        return { value: Math.round(v * 1000) / 1000 };
    }
    // What changed from an older set to a newer one (the older one converted to the newer unit).
    function changes(older, newer) {
        if (!older || !newer) return [];
        const out = [];
        FIELDS.forEach(f => {
            const a = older.values[f.key], b = newer.values[f.key];
            if (typeof a !== 'number' || typeof b !== 'number') return;
            const a2 = convert(a, older.unit, newer.unit);
            if (Math.abs(a2 - b) < 1e-9) return;
            out.push({ label: f.label, from: a2, to: b, text: f.label + ' ' + fmtMeasure(a2, newer.unit) + ' → ' + fmtMeasure(b, newer.unit) });
        });
        return out;
    }
    function filledRows(set) {
        const rows = [];
        FIELDS.forEach(f => { if (typeof set.values[f.key] === 'number') rows.push({ label: f.label, value: fmtMeasure(set.values[f.key], set.unit), group: f.group }); });
        (set.custom || []).forEach(c => rows.push({ label: c.label, value: typeof c.value === 'number' ? fmtMeasure(c.value, set.unit) : c.text, group: 'other' }));
        return rows;
    }
    const latest = person => person && person.sets.length ? person.sets[person.sets.length - 1] : null;
    function measureText(person, today) {
        const set = latest(person);
        if (!set) return person.name + ': no measurements saved yet.';
        const lines = [person.name + ' measurements (' + unitWord(set.unit) + ', taken ' + fmt(set.date, true) + ')'];
        const rows = filledRows(set);
        const top = rows.filter(r => r.group === 'top'), bottom = rows.filter(r => r.group === 'bottom'), other = rows.filter(r => r.group === 'other');
        if (top.length) { lines.push('', 'Shirt / kameez'); top.forEach(r => lines.push(r.label.replace(/^Shirt \/ kameez length$/, 'Length') + ': ' + r.value)); }
        if (bottom.length) { lines.push('', 'Shalwar / trousers'); bottom.forEach(r => lines.push(r.label.replace(/^Shalwar \/ trouser length$/, 'Length') + ': ' + r.value)); }
        if (other.length) { lines.push('', 'Other'); other.forEach(r => lines.push(r.label + ': ' + r.value)); }
        if (!rows.length) lines.push('(no numbers filled in)');
        if (person.note) lines.push('', 'Fit: ' + person.note);
        return lines.join('\n');
    }

    // ---------- money ----------
    function parseMoney(text) {
        let s = String(text == null ? '' : text).trim();
        if (!s) return null;
        s = s.replace(/[\s,']/g, '').replace(/^(rs\.?|pkr|inr|usd|aed|sar|[$€£₹৳₦])/i, '');
        if (/^-/.test(s)) return -1;
        if (!/^\d+(\.\d{1,2})?$/.test(s) && !/^\.\d{1,2}$/.test(s)) return NaN;
        const [w, f = ''] = s.split('.');
        return Number(w || 0) * 100 + Number((f + '00').slice(0, 2));
    }
    function checkMoney(text, what) {
        const c = parseMoney(text);
        if (c === null) return { value: null };
        if (c === -1) return { error: what + ' cannot be below 0.' };
        if (isNaN(c)) return { error: what + ': type an amount like 1500 or 1,500.50.' };
        if (c > MAX_CENTS) return { error: what + ' is too large. Check the number.' };
        return { value: c };
    }
    function money(cents, cur) {
        const neg = cents < 0, a = Math.abs(cents), w = Math.floor(a / 100), f = a % 100;
        const s = String(w).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (f ? '.' + pad(f) : '');
        return (neg ? '-' : '') + (cur ? cur + ' ' : '') + s;
    }

    // ---------- orders ----------
    const paidOf = o => o.payments.reduce((t, p) => t + p.cents, 0);
    function balanceOf(o) { return o.price === null ? null : o.price - paidOf(o); }
    // Where an order stands today: collected, ready, late, due (with days), or no date.
    function statusOf(o, today) {
        if (o.status === 'collected') return { key: 'collected', rank: 9, text: 'Collected ' + (o.collected ? fmtNear(o.collected, today) : '') };
        if (o.status === 'ready') return { key: 'ready', rank: 1, text: 'Ready to collect' };
        if (!o.promised) return { key: 'nodate', rank: 4, text: 'No ready date' };
        const n = diff(o.promised, today);
        if (n < 0) return { key: 'late', rank: 0, days: -n, text: plural(-n, 'day') + ' late (promised ' + fmtNear(o.promised, today) + ')' };
        if (n === 0) return { key: 'due', rank: 2, days: 0, text: 'Ready today, ' + fmtNear(o.promised, today) };
        return { key: 'due', rank: n <= 7 ? 2 : 3, days: n, text: 'Ready ' + fmtNear(o.promised, today) + ' (' + rel(o.promised, today) + ')' };
    }
    function sortOpen(orders, today) {
        return orders.filter(o => o.status !== 'collected').map(o => ({ o, s: statusOf(o, today) })).sort((a, b) => {
            if (a.s.rank !== b.s.rank) return a.s.rank - b.s.rank;
            if (a.s.key === 'late') return b.s.days - a.s.days;
            if (a.o.promised && b.o.promised && a.o.promised !== b.o.promised) return a.o.promised < b.o.promised ? -1 : 1;
            return a.o.given < b.o.given ? -1 : a.o.given > b.o.given ? 1 : 0;
        }).map(x => x.o);
    }
    function sortCollected(orders) {
        return orders.filter(o => o.status === 'collected').sort((a, b) => (b.collected || '').localeCompare(a.collected || '') || b.given.localeCompare(a.given));
    }
    function moneyLine(o, cur) {
        const paid = paidOf(o), bal = balanceOf(o);
        if (o.price === null) return paid ? 'Paid ' + money(paid, cur) + ', price not set' : '';
        if (bal > 0) return 'Price ' + money(o.price, cur) + (paid ? ', paid ' + money(paid, cur) + ', balance ' + money(bal, cur) : ', nothing paid yet');
        if (bal < 0) return 'Price ' + money(o.price, cur) + ', paid ' + money(paid, cur) + ' (' + money(-bal, cur) + ' more than the price)';
        return o.price === 0 ? 'No charge' : 'Price ' + money(o.price, cur) + ', fully paid';
    }
    const piecesText = o => o.pieces > 1 ? ' (' + o.pieces + ' pieces)' : '';
    function orderLine(o, today, cur) {
        const s = statusOf(o, today), bal = balanceOf(o);
        let t = o.personName + ': ' + o.item + piecesText(o) + ' at ' + o.tailor + ', ' + s.text.charAt(0).toLowerCase() + s.text.slice(1);
        if (bal !== null && bal > 0) t += ', balance ' + money(bal, cur);
        else if (bal === 0 && o.price > 0) t += ', paid';
        else if (bal === null) t += ', price not set';
        return t;
    }
    function summary(orders, today) {
        const open = sortOpen(orders, today);
        const tailors = new Map();
        let toPay = 0, noPrice = 0, pieces = 0, late = 0, ready = 0, week = 0;
        open.forEach(o => {
            const s = statusOf(o, today), bal = balanceOf(o);
            pieces += o.pieces;
            if (s.key === 'late') late++;
            if (s.key === 'ready') ready++;
            if (s.key === 'due' && s.days <= 7) week++;
            if (bal === null) noPrice++; else if (bal > 0) toPay += bal;
            const k = o.tailor.toLowerCase();
            if (!tailors.has(k)) tailors.set(k, { name: o.tailor, orders: 0, pieces: 0, toPay: 0, late: 0, ready: 0 });
            const t = tailors.get(k);
            t.orders++; t.pieces += o.pieces; if (bal > 0) t.toPay += bal; if (s.key === 'late') t.late++; if (s.key === 'ready') t.ready++;
        });
        return { open, count: open.length, pieces, late, ready, week, toPay, noPrice, tailors: [...tailors.values()].sort((a, b) => b.orders - a.orders || a.name.localeCompare(b.name)) };
    }
    function summaryText(orders, today, cur) {
        const s = summary(orders, today);
        const lines = ['At the tailor (' + fmt(today, true) + ')'];
        if (!s.count) { lines.push('Nothing at the tailor right now.'); return lines.join('\n'); }
        lines.push(plural(s.count, 'order') + ' (' + plural(s.pieces, 'piece') + ') at ' + plural(s.tailors.length, 'tailor') + '. Still to pay: ' + money(s.toPay, cur) + (s.noPrice ? ' (+ ' + plural(s.noPrice, 'order') + ' with no price yet)' : ''));
        const groups = [['late', 'LATE'], ['ready', 'READY TO COLLECT'], ['due', 'COMING UP'], ['nodate', 'NO READY DATE']];
        groups.forEach(([key, title]) => {
            const list = s.open.filter(o => statusOf(o, today).key === key);
            if (!list.length) return;
            lines.push('', title);
            list.forEach(o => lines.push('- ' + orderLine(o, today, cur)));
        });
        return lines.join('\n');
    }
    function orderText(o, person, today, cur) {
        const lines = ['Order for ' + o.personName + ': ' + o.item + piecesText(o), 'Tailor: ' + o.tailor, 'Given ' + fmt(o.given, true) + (o.promised ? ', ready by ' + fmt(o.promised, true) : '')];
        const m = moneyLine(o, cur); if (m) lines.push(m);
        if (o.note) lines.push('Fabric and design: ' + o.note);
        if (person && latest(person)) lines.push('', measureText(person, today));
        return lines.join('\n');
    }

    // ---------- reading the order form ----------
    function readOrder(f, today) {
        const errors = {};
        const personName = String(f.personName || '').trim().slice(0, 60);
        if (!personName) errors.person = 'Choose who it is for, or type a name.';
        const item = String(f.item || '').trim().slice(0, 60);
        if (!item) errors.item = 'Type what is being stitched, like Kurta, or tap a suggestion.';
        const tailor = String(f.tailor || '').trim().slice(0, 60);
        if (!tailor) errors.tailor = 'Type the tailor or shop name.';
        let pieces = String(f.pieces == null ? '' : f.pieces).trim();
        pieces = pieces === '' ? 1 : Number(pieces);
        if (!Number.isInteger(pieces) || pieces < 1 || pieces > 50) errors.pieces = 'Pieces: a whole number from 1 to 50.';
        const given = f.given || today;
        if (!isIso(given)) errors.given = 'Pick the date you gave it.';
        const promised = f.promised || '';
        if (promised && !isIso(promised)) errors.promised = 'Pick a ready date, or choose Not set.';
        else if (promised && isIso(given) && promised < given) errors.promised = 'The ready date is before the day you gave it.';
        const price = checkMoney(f.price, 'Stitching price'); if (price.error) errors.price = price.error;
        const adv = checkMoney(f.advance, 'Advance paid'); if (adv.error) errors.advance = adv.error;
        const note = String(f.note || '').trim().slice(0, 1000);
        if (Object.keys(errors).length) return { errors };
        return { order: { personId: f.personId || null, personName, item, tailor, pieces, given, promised, price: price.value, advance: adv.value || 0, note } };
    }

    // ---------- saved data ----------
    const str = (v, n) => typeof v === 'string' ? v.slice(0, n) : '';
    const cents = v => Number.isInteger(v) && v >= 0 && v <= MAX_CENTS ? v : null;
    function cleanSet(s) {
        if (!s || typeof s !== 'object') return null;
        const unit = s.unit === 'cm' ? 'cm' : 'in';
        const values = {};
        FIELD_KEYS.forEach(k => { const v = s.values && s.values[k]; if (typeof v === 'number' && isFinite(v) && v > 0 && v <= LIMIT[unit]) values[k] = v; });
        const custom = (Array.isArray(s.custom) ? s.custom : []).slice(0, MAX_CUSTOM).map(c => {
            if (!c || typeof c !== 'object') return null;
            const label = str(c.label, 40).trim(); if (!label) return null;
            if (typeof c.value === 'number' && isFinite(c.value) && c.value > 0 && c.value <= LIMIT[unit]) return { label, value: c.value };
            const text = str(c.text, 40).trim(); return text ? { label, text } : null;
        }).filter(Boolean);
        return { id: str(s.id, 40) || uid(), unit, date: isIso(s.date) ? s.date : '2000-01-01', values, custom };
    }
    function clean(data) {
        const out = { v: 1, people: [], orders: [] };
        if (!data || typeof data !== 'object') return out;
        const ids = new Set();
        (Array.isArray(data.people) ? data.people : []).slice(0, MAX_PEOPLE).forEach(p => {
            if (!p || typeof p !== 'object') return;
            const name = str(p.name, 60).trim(); if (!name) return;
            let id = str(p.id, 40) || uid(); if (ids.has(id)) id = uid(); ids.add(id);
            const sets = (Array.isArray(p.sets) ? p.sets : []).map(cleanSet).filter(Boolean).slice(-MAX_SETS).sort((a, b) => a.date.localeCompare(b.date));
            out.people.push({ id, name, note: str(p.note, 300), sets });
        });
        const oids = new Set();
        (Array.isArray(data.orders) ? data.orders : []).slice(0, MAX_ORDERS).forEach(o => {
            if (!o || typeof o !== 'object') return;
            const personName = str(o.personName, 60).trim(), item = str(o.item, 60).trim(), tailor = str(o.tailor, 60).trim();
            if (!personName || !item || !tailor || !isIso(o.given)) return;
            let id = str(o.id, 40) || uid(); if (oids.has(id)) id = uid(); oids.add(id);
            const status = ['given', 'ready', 'collected'].includes(o.status) ? o.status : 'given';
            const payments = (Array.isArray(o.payments) ? o.payments : []).slice(0, MAX_PAYMENTS)
                .filter(p => p && cents(p.cents) !== null && p.cents > 0 && isIso(p.date)).map(p => ({ id: str(p.id, 40) || uid(), date: p.date, cents: p.cents }));
            const fixes = (Array.isArray(o.fixes) ? o.fixes : []).slice(0, 20).filter(x => x && isIso(x.date)).map(x => ({ date: x.date, note: str(x.note, 300) }));
            const pieces = Number.isInteger(o.pieces) && o.pieces >= 1 && o.pieces <= 50 ? o.pieces : 1;
            const personId = typeof o.personId === 'string' && out.people.some(p => p.id === o.personId) ? o.personId : null;
            out.orders.push({ id, personId, personName, item, tailor, pieces, given: o.given, promised: isIso(o.promised) && o.promised >= o.given ? o.promised : '',
                price: cents(o.price), payments, note: str(o.note, 1000), status, collected: status === 'collected' && isIso(o.collected) ? o.collected : (status === 'collected' ? o.given : ''), fixes });
        });
        return out;
    }
    let n = 0;
    function uid() { return Date.now().toString(36) + (n++).toString(36) + Math.random().toString(36).slice(2, 6); }

    const api = { CURRENCIES, FIELDS, FIELD_KEYS, ITEMS, LIMIT, MAX_PEOPLE, MAX_ORDERS, MAX_CUSTOM, MAX_PAYMENTS, isIso, addDays, diff, todayIso, fmt, fmtNear, rel, age, monthsBetween, plural,
        parseMeasure, fmtMeasure, unitWord, convert, checkMeasure, changes, filledRows, latest, measureText,
        parseMoney, checkMoney, money, paidOf, balanceOf, statusOf, sortOpen, sortCollected, moneyLine, orderLine, summary, summaryText, orderText, readOrder, clean, uid };
    root.TO = api;
    if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
