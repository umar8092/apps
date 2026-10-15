// Warranty and Return Deadline Tracker: the logic, no page code.
// Dates are 'YYYY-MM-DD' strings on the person's own calendar (no time zones involved). Money is whole cents.
(function (root) {
    'use strict';
    const SLUG = 'warranty-and-return-deadline-tracker';
    const MAX_ITEMS = 500, MAX_RETURN_DAYS = 365, MAX_MONTHS = 600, MAX_CENTS = 100000000;
    const RETURN_SOON = 7, WARRANTY_SOON = 30;          // days left that count as "ends soon"
    const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    // ---- dates
    const pad = n => String(n).padStart(2, '0');
    const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
    function parseDate(v) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v == null ? '' : v));
        if (!m) return null;
        const y = +m[1], mo = +m[2], d = +m[3];
        if (y < 1950 || y > 2200 || mo < 1 || mo > 12 || d < 1 || d > daysIn(y, mo)) return null;
        return { y, m: mo, d };
    }
    const isDate = v => !!parseDate(v);
    const dayNum = iso => { const p = parseDate(iso); return Math.round(Date.UTC(p.y, p.m - 1, p.d) / 864e5); };
    const fromNum = n => { const d = new Date(n * 864e5); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); };
    const addDays = (iso, n) => fromNum(dayNum(iso) + n);
    const diff = (a, b) => dayNum(b) - dayNum(a);                         // days from a to b
    const todayIso = (d = new Date()) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    // Same day k months later, or the last day of that month when it is shorter (31 Jan + 1 month = 28 Feb).
    function addMonths(iso, k) {
        const p = parseDate(iso), t = p.y * 12 + (p.m - 1) + k, y = Math.floor(t / 12), m = t - y * 12 + 1;
        return y + '-' + pad(m) + '-' + pad(Math.min(p.d, daysIn(y, m)));
    }
    // Last day of cover for a period of `months` that starts on `start`: the day before the same date `months` later
    // (3 Oct 2026 + 2 years = covered until 2 Oct 2028). When that date does not exist, the last day of that month
    // (31 Jan + 1 month = until 28 Feb; 29 Feb 2024 + 1 year = until 28 Feb 2025).
    function periodEnd(start, months) {
        const p = parseDate(start), t = p.y * 12 + (p.m - 1) + months, y = Math.floor(t / 12), m = t - y * 12 + 1;
        return p.d > daysIn(y, m) ? y + '-' + pad(m) + '-' + pad(daysIn(y, m)) : addDays(y + '-' + pad(m) + '-' + pad(p.d), -1);
    }
    function longDate(iso, withDay = true) {
        const p = parseDate(iso); if (!p) return '';
        const dow = DAYS[new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()];
        return (withDay ? dow + ' ' : '') + p.d + ' ' + MONTHS[p.m - 1] + ' ' + p.y;
    }
    // "Fri 23 Oct" this year, "Fri 23 Oct 2027" other years
    function shortDate(iso, today) {
        const p = parseDate(iso); if (!p) return '';
        const dow = DAYS[new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()];
        return dow + ' ' + p.d + ' ' + MONTHS[p.m - 1] + (today && iso.slice(0, 4) === today.slice(0, 4) ? '' : ' ' + p.y);
    }
    const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
    // Time left from today until the end date (the end date itself still counts): "today is the last day", "8 days left", "1 year 11 months left".
    function leftText(today, end) {
        const d = diff(today, end);
        if (d < 0) return '';
        if (d === 0) return 'today is the last day';
        if (d < 62) return plural(d, 'day') + ' left';
        let m = 0; while (m < 1200 && addMonths(today, m + 1) <= end) m++;
        const y = Math.floor(m / 12), r = m % 12;
        return (y ? plural(y, 'year') : '') + (y && r ? ' ' : '') + (r ? plural(r, 'month') : '') + ' left';
    }
    function agoText(today, end) {
        const d = diff(end, today);
        if (d <= 0) return '';
        if (d === 1) return 'yesterday';
        if (d < 62) return d + ' days ago';
        let m = 0; while (m < 1200 && addMonths(end, m + 1) <= today) m++;
        const y = Math.floor(m / 12), r = m % 12;
        return (y ? plural(y, 'year') : '') + (y && r ? ' ' : '') + (r ? plural(r, 'month') : '') + ' ago';
    }

    // ---- money (what people type or paste: "9.99", "9,99", "$1,299.00", "1.299,00 €")
    function parsePrice(v) {
        let s = String(v == null ? '' : v).trim();
        if (!s) return { cents: null };
        if (/-/.test(s)) return { err: 'The price cannot be negative.' };
        s = s.replace(/[^\d.,]/g, '');
        if (!/\d/.test(s)) return { err: 'Type the price as a number, such as 449.99.' };
        const lastDot = s.lastIndexOf('.'), lastComma = s.lastIndexOf(',');
        if (lastDot >= 0 && lastComma >= 0) {
            const dec = lastDot > lastComma ? '.' : ',', other = dec === '.' ? ',' : '.';
            s = s.split(other).join('');
            if (s.split(dec).length > 2) return { err: 'Type the price as a number, such as 449.99.' };
            s = s.replace(dec, '.');
        } else if (lastComma >= 0) {
            s = /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : (s.split(',').length === 2 ? s.replace(',', '.') : null);
        } else if (lastDot >= 0 && s.split('.').length > 2) {
            s = /^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, '') : null;
        }
        if (s == null || !/^\d*\.?\d*$/.test(s) || s === '.') return { err: 'Type the price as a number, such as 449.99.' };
        const [w, f = ''] = s.split('.');
        const big = { err: 'That price is too big. The most is 1,000,000.' };
        if (w.replace(/^0+/, '').length > 7) return big;
        const f3 = (f + '000').slice(0, 3);
        const cents = parseInt(w || '0', 10) * 100 + parseInt(f3.slice(0, 2), 10) + (+f3[2] >= 5 ? 1 : 0);
        return cents > MAX_CENTS ? big : { cents };
    }
    function fmt(cents, sym) {
        const c = Math.abs(Math.round(cents));
        const s = String(Math.floor(c / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + pad(c % 100);
        return (!sym ? '' : /[A-Za-z]$/.test(sym) ? sym + ' ' : sym) + s;
    }

    // ---- deadlines for one item
    // Counting starts on the delivery date when there is one (online orders), otherwise on the day it was bought.
    const startOf = it => it.delivered || it.bought;
    function returnEnd(it) {
        if (!it.ret || it.ret.t === 'none') return null;
        if (it.ret.t === 'until') return it.ret.until;
        return addDays(startOf(it), it.ret.days);           // "within 30 days": 30 days after the day it started
    }
    function warrantyEnd(it) {                               // a date, 'life' or null
        if (!it.war || it.war.t === 'none') return null;
        if (it.war.t === 'life') return 'life';
        if (it.war.t === 'until') return it.war.until;
        return periodEnd(startOf(it), it.war.months);
    }
    // An extended warranty starts the day after the maker's warranty ends (or on the start day when there is none).
    function extEnd(it) {
        if (!it.ext || !(it.ext > 0)) return null;
        const w = warrantyEnd(it);
        if (w === 'life') return null;
        return periodEnd(w ? addDays(w, 1) : startOf(it), it.ext);
    }
    // Last day of any warranty cover: 'life', a date or null.
    function coverEnd(it) {
        const w = warrantyEnd(it), e = extEnd(it);
        if (w === 'life') return 'life';
        return e || w;
    }

    // Where the item sits and what to say about it today.
    //   section: 'return' (can still go back), 'warranty' (covered), 'ended' (no cover left), 'archive' (returned or no longer have it)
    function classify(it, today) {
        const r = returnEnd(it), c = coverEnd(it);
        const out = { section: 'ended', next: null, soon: false, returnOpen: false, covered: false, notYet: false };
        out.notYet = !!it.delivered && it.delivered > today;
        out.returnOpen = !!r && r >= today && !it.kept;
        out.covered = c === 'life' || (!!c && c >= today);
        if (it.status !== 'active') { out.section = 'archive'; return out; }
        if (out.returnOpen) { out.section = 'return'; out.next = r; out.soon = diff(today, r) <= RETURN_SOON; }
        else if (out.covered) { out.section = 'warranty'; out.next = c === 'life' ? null : c; out.soon = c !== 'life' && diff(today, c) <= WARRANTY_SOON; }
        return out;
    }
    // Most urgent first; lifetime cover after dated cover; ended items newest ended first.
    function sortItems(items, today) {
        const key = it => { const k = classify(it, today); return k; };
        return items.slice().sort((a, b) => {
            const ka = key(a), kb = key(b);
            if (ka.section === 'ended' && kb.section === 'ended') {
                const ea = lastEnd(a) || '', eb = lastEnd(b) || '';
                return ea < eb ? 1 : ea > eb ? -1 : a.name.localeCompare(b.name);
            }
            if (ka.section === 'archive') return (b.statusDate || '').localeCompare(a.statusDate || '') || a.name.localeCompare(b.name);
            const na = ka.next || '9999-12-31', nb = kb.next || '9999-12-31';
            return na < nb ? -1 : na > nb ? 1 : a.name.localeCompare(b.name) || a.id - b.id;
        });
    }
    function lastEnd(it) {
        const c = coverEnd(it), r = returnEnd(it);
        if (c === 'life') return '9999-12-31';
        return [c, r].filter(Boolean).sort().pop() || it.bought;
    }
    function groups(items, today) {
        const g = { return: [], warranty: [], ended: [], archive: [] };
        sortItems(items, today).forEach(it => g[classify(it, today).section].push(it));
        return g;
    }

    // Plain sentences about the deadlines, used on the page and in copied text.
    function returnLine(it, today) {
        const r = returnEnd(it);
        if (!r) return 'No returns';
        if (it.kept && r >= today) return 'Keeping it (could return until ' + shortDate(r, today) + ')';
        if (r < today) return 'Return window closed ' + shortDate(r, today);
        const notYet = it.delivered && it.delivered > today ? ' (counts from delivery on ' + shortDate(it.delivered, today) + ')' : '';
        return 'Return by ' + shortDate(r, today) + ' (' + leftText(today, r) + ')' + notYet;
    }
    function warrantyLine(it, today) {
        const w = warrantyEnd(it);
        if (w === 'life') return 'Lifetime warranty';
        if (!w) return it.ext ? '' : 'No warranty';
        if (w < today) return 'Warranty ended ' + longDate(w, false) + ' (' + agoText(today, w) + ')';
        return 'Warranty until ' + longDate(w, false) + ' (' + leftText(today, w) + ')';
    }
    function extLine(it, today) {
        const e = extEnd(it);
        if (!e) return '';
        if (e < today) return 'Extended warranty ended ' + longDate(e, false);
        return 'Extended warranty until ' + longDate(e, false) + ' (' + leftText(today, e) + ')';
    }
    function retWindowText(it) {
        if (!it.ret || it.ret.t === 'none') return 'no returns';
        if (it.ret.t === 'until') return 'returns until ' + longDate(it.ret.until, false);
        return plural(it.ret.days, 'day') + ' to return';
    }
    function warWindowText(it) {
        if (!it.war || it.war.t === 'none') return 'no warranty';
        if (it.war.t === 'life') return 'lifetime warranty';
        if (it.war.t === 'until') return 'warranty until ' + longDate(it.war.until, false);
        return monthsText(it.war.months) + ' warranty';
    }
    function monthsText(m) {
        if (m % 12 === 0) return plural(m / 12, 'year');
        return plural(m, 'month');
    }
    function itemText(it, today, sym) {
        const L = [it.name + (it.shop ? ' (' + it.shop + ')' : '')];
        L.push('Bought ' + longDate(it.bought, false) + (it.delivered ? ', delivered ' + longDate(it.delivered, false) : '') + (it.price != null ? ', ' + fmt(it.price, sym) : ''));
        if (it.status === 'returned') L.push('Returned' + (it.statusDate ? ' on ' + longDate(it.statusDate, false) : ''));
        else if (it.status === 'gone') L.push('No longer have it' + (it.statusDate ? ' (since ' + longDate(it.statusDate, false) + ')' : ''));
        else L.push(returnLine(it, today));
        [warrantyLine(it, today), extLine(it, today)].filter(Boolean).forEach(l => L.push(l));
        if (it.order) L.push('Order or receipt number: ' + it.order);
        if (it.serial) L.push('Serial number: ' + it.serial);
        if (it.note) L.push('Notes: ' + it.note);
        return L.join('\n');
    }
    function listText(items, today, sym) {
        const g = groups(items, today), out = [];
        const sec = (title, list) => { if (list.length) out.push(title.toUpperCase() + '\n\n' + list.map(it => itemText(it, today, sym)).join('\n\n')); };
        sec('Can still be returned', g.return);
        sec('Under warranty', g.warranty);
        sec('Cover ended', g.ended);
        return out.length ? 'My purchases, return deadlines and warranties (' + longDate(today, false) + ')\n\n' + out.join('\n\n\n') : '';
    }
    function summary(items, today, sym) {
        const g = groups(items, today);
        const soonReturn = g.return.filter(it => diff(today, returnEnd(it)) <= RETURN_SOON).length;
        const soonWar = g.warranty.filter(it => classify(it, today).soon).length;
        const live = items.filter(it => it.status === 'active');
        const coveredWorth = live.filter(it => classify(it, today).covered && it.price != null).reduce((t, it) => t + it.price, 0);
        let next = null;
        // the date that comes first, a return or a warranty end
        const cands = [g.return[0], g.warranty.find(it => classify(it, today).next)].filter(Boolean);
        const first = cands.sort((a, b) => classify(a, today).next < classify(b, today).next ? -1 : 1)[0];
        if (first) {
            const k = classify(first, today);
            next = { id: first.id, kind: k.section, date: k.next, name: first.name, shop: first.shop, left: leftText(today, k.next) };
        }
        return { canReturn: g.return.length, covered: g.return.filter(it => classify(it, today).covered).length + g.warranty.length,
            ended: g.ended.length, archived: g.archive.length, soonReturn, soonWar, coveredWorth, next, total: live.length };
    }

    // ---- calendar file (.ics) with all-day events and reminders
    const esc = t => String(t).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
    function fold(line) {
        const out = []; let s = line;
        while (s.length > 74) { out.push(s.slice(0, 74)); s = ' ' + s.slice(74); }
        out.push(s); return out.join('\r\n');
    }
    // Only deadlines still to come. Return deadlines remind 3 days and 1 day before; warranties 30 days before.
    function ics(items, today, stamp) {
        const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//umar8092//Warranty and Return Deadline Tracker//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
        const ds = d => d.replace(/-/g, '');
        let n = 0;
        const ev = (uid, date, summary, desc, alarms) => {
            L.push('BEGIN:VEVENT', 'UID:' + uid + '@' + SLUG, 'DTSTAMP:' + stamp, 'DTSTART;VALUE=DATE:' + ds(date),
                'DTEND;VALUE=DATE:' + ds(addDays(date, 1)), fold('SUMMARY:' + esc(summary)), fold('DESCRIPTION:' + esc(desc)), 'TRANSP:TRANSPARENT');
            alarms.filter(a => diff(today, date) >= a).forEach(a => L.push('BEGIN:VALARM', 'ACTION:DISPLAY', fold('DESCRIPTION:' + esc(summary)), 'TRIGGER:-P' + a + 'D', 'END:VALARM'));
            L.push('END:VEVENT'); n++;
        };
        items.filter(it => it.status === 'active').forEach(it => {
            const where = it.shop ? ' to ' + it.shop : '', info = itemText(it, today, '');
            const r = returnEnd(it);
            if (r && r >= today && !it.kept) ev(it.id + '-return', r, 'Last day to return ' + it.name + where, info, [3, 1, 0]);
            const w = warrantyEnd(it);
            if (w && w !== 'life' && w >= today) ev(it.id + '-warranty', w, 'Warranty ends: ' + it.name, info, [30, 7]);
            const e = extEnd(it);
            if (e && e >= today) ev(it.id + '-extended', e, 'Extended warranty ends: ' + it.name, info, [30, 7]);
        });
        L.push('END:VCALENDAR');
        return { text: L.join('\r\n') + '\r\n', count: n };
    }

    // ---- reading the form (strings from the page) into an item, with plain error messages
    // f: { name, shop, bought, delivered, retSel, retDays, retUntil, warSel, warNum, warUnit, warUntil, extSel, extNum, extUnit, price, order, serial, note }
    function readForm(f, today) {
        const errs = {}, it = {};
        it.name = clip(f.name, 80);
        if (!it.name) errs.name = 'Type what you bought, such as "Washing machine".';
        it.shop = clip(f.shop, 60);
        if (!isDate(f.bought)) errs.bought = 'Choose the day you bought it.';
        else if (f.bought > today) errs.bought = 'The day you bought it cannot be after today.';
        it.bought = f.bought;
        it.delivered = '';
        if (f.delivered) {
            if (!isDate(f.delivered)) errs.delivered = 'Choose the delivery day, or remove it.';
            else if (isDate(f.bought) && f.delivered < f.bought) errs.delivered = 'Delivery cannot be before the day you bought it.';
            else if (diff(today, f.delivered) > 90) errs.delivered = 'Delivery can be at most 90 days from today.';
            else if (f.delivered !== f.bought) it.delivered = f.delivered;
        }
        const start = it.delivered || it.bought;
        // return window
        const rs = f.retSel;
        if (rs === 'none') it.ret = { t: 'none' };
        else if (rs === 'until') {
            if (!isDate(f.retUntil)) errs.ret = 'Choose the last day you can return it.';
            else if (isDate(start) && f.retUntil < start) errs.ret = 'The last return day cannot be before the day you bought it.';
            it.ret = { t: 'until', until: f.retUntil };
        } else {
            const n = rs === 'custom' ? whole(f.retDays) : +rs;
            if (!(n >= 1 && n <= MAX_RETURN_DAYS)) errs.ret = 'Type the number of days you have to return it, from 1 to 365.';
            it.ret = { t: 'days', days: n };
        }
        // maker's warranty
        const ws = f.warSel;
        if (ws === 'none') it.war = { t: 'none' };
        else if (ws === 'life') it.war = { t: 'life' };
        else if (ws === 'until') {
            if (!isDate(f.warUntil)) errs.war = 'Choose the day the warranty ends.';
            else if (isDate(start) && f.warUntil < start) errs.war = 'The warranty cannot end before the day you bought it.';
            it.war = { t: 'until', until: f.warUntil };
        } else {
            const m = ws === 'custom' ? toMonths(f.warNum, f.warUnit) : +ws;
            if (!(m >= 1 && m <= MAX_MONTHS)) errs.war = 'Type how long the warranty lasts: 1 to 600 months, or 1 to 50 years.';
            it.war = { t: 'months', months: m };
        }
        // extended warranty (optional)
        it.ext = 0;
        if (f.extSel && f.extSel !== '0') {
            if (it.war.t === 'life') errs.ext = 'A lifetime warranty does not need an extended one. Remove the extended warranty.';
            const m = f.extSel === 'custom' ? toMonths(f.extNum, f.extUnit) : +f.extSel;
            if (!(m >= 1 && m <= MAX_MONTHS)) errs.ext = errs.ext || 'Type how long the extended warranty lasts: 1 to 600 months, or 1 to 50 years.';
            it.ext = m >= 1 && m <= MAX_MONTHS ? m : 0;
        }
        const p = parsePrice(f.price);
        if (p.err) errs.price = p.err;
        it.price = p.err ? null : p.cents;
        it.order = clip(f.order, 60);
        it.serial = clip(f.serial, 60);
        it.note = clip(f.note, 500, true);
        return { item: it, errs, ok: !Object.keys(errs).length };
    }
    function whole(v) { const s = String(v == null ? '' : v).trim(); return /^\d{1,4}$/.test(s) ? +s : NaN; }
    function toMonths(num, unit) { const n = whole(num); return unit === 'y' ? (n >= 1 && n <= 50 ? n * 12 : NaN) : n; }
    function clip(v, max, multi) {
        let s = String(v == null ? '' : v);
        s = multi ? s.replace(/\r\n?/g, '\n').replace(/[^\S\n]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim() : s.replace(/\s+/g, ' ').trim();
        return s.slice(0, max);
    }
    // The preview line under the form, before saving.
    function previewText(f, today) {
        const r = readForm(f, today);
        const it = Object.assign({ id: 0, status: 'active', kept: false }, r.item);
        const bits = [];
        if (!r.errs.bought && !r.errs.delivered && !r.errs.ret) bits.push(returnEnd(it) ? (returnEnd(it) < today ? 'Return window closed ' + shortDate(returnEnd(it), today) : 'Return by ' + shortDate(returnEnd(it), today)) : 'No returns');
        if (!r.errs.bought && !r.errs.delivered && !r.errs.war) {
            const w = warrantyEnd(it);
            bits.push(w === 'life' ? 'Lifetime warranty' : w ? (w < today ? 'Warranty ended ' : 'Warranty until ') + longDate(w, false) : 'No warranty');
            if (!r.errs.ext && extEnd(it)) bits.push('Extended until ' + longDate(extEnd(it), false));
        }
        return bits.join(' · ');
    }

    // ---- saved state
    const emptyState = () => ({ v: 1, nextId: 1, items: [], cur: '' });
    const CURS = ['', '$', '€', '£', '₹', 'Rs', '¥', '₩', '₦', '₱', 'R', 'kr', 'CHF', 'AED', 'SAR'];
    // Checks every value from storage or a backup file; anything wrong is dropped, never trusted.
    function validate(s) {
        if (!s || typeof s !== 'object' || !Array.isArray(s.items)) return null;
        const out = emptyState();
        out.cur = CURS.includes(s.cur) ? s.cur : '';
        const seen = new Set();
        s.items.slice(0, MAX_ITEMS).forEach(x => {
            const it = cleanItem(x);
            if (!it || seen.has(it.id)) return;
            seen.add(it.id); out.items.push(it);
        });
        out.nextId = Math.max(1, ...out.items.map(it => it.id + 1), Number.isInteger(s.nextId) && s.nextId < 1e9 ? s.nextId : 1);
        return out;
    }
    function cleanItem(x) {
        if (!x || typeof x !== 'object' || !Number.isInteger(x.id) || x.id < 1 || x.id > 1e9) return null;
        const name = clip(x.name, 80);
        if (!name || !isDate(x.bought)) return null;
        const it = { id: x.id, name, shop: clip(x.shop, 60), bought: x.bought, delivered: isDate(x.delivered) && x.delivered > x.bought ? x.delivered : '' };
        const r = x.ret || {};
        it.ret = r.t === 'days' && Number.isInteger(r.days) && r.days >= 1 && r.days <= MAX_RETURN_DAYS ? { t: 'days', days: r.days }
            : r.t === 'until' && isDate(r.until) ? { t: 'until', until: r.until } : { t: 'none' };
        const w = x.war || {};
        it.war = w.t === 'months' && Number.isInteger(w.months) && w.months >= 1 && w.months <= MAX_MONTHS ? { t: 'months', months: w.months }
            : w.t === 'until' && isDate(w.until) ? { t: 'until', until: w.until } : w.t === 'life' ? { t: 'life' } : { t: 'none' };
        it.ext = Number.isInteger(x.ext) && x.ext >= 1 && x.ext <= MAX_MONTHS && it.war.t !== 'life' ? x.ext : 0;
        it.price = Number.isInteger(x.price) && x.price >= 0 && x.price <= MAX_CENTS ? x.price : null;
        it.order = clip(x.order, 60); it.serial = clip(x.serial, 60); it.note = clip(x.note, 500, true);
        it.photo = typeof x.photo === 'string' && /^p\d{1,20}$/.test(x.photo) ? x.photo : '';
        it.status = ['active', 'returned', 'gone'].includes(x.status) ? x.status : 'active';
        it.statusDate = isDate(x.statusDate) ? x.statusDate : '';
        it.kept = x.kept === true;
        return it;
    }
    // Receipt files in a backup: only images and PDFs as base64 data URLs, at most 8 MB each.
    const PHOTO_RE = /^data:(image\/(jpeg|png|webp|gif)|application\/pdf);base64,[A-Za-z0-9+/]+=*$/;
    const okPhoto = d => typeof d === 'string' && d.length < 11e6 && PHOTO_RE.test(d);

    const api = { SLUG, MAX_ITEMS, RETURN_SOON, WARRANTY_SOON, CURS, parseDate, isDate, addDays, addMonths, periodEnd, diff, todayIso, longDate, shortDate,
        leftText, agoText, parsePrice, fmt, startOf, returnEnd, warrantyEnd, extEnd, coverEnd, classify, sortItems, groups, returnLine, warrantyLine, extLine,
        retWindowText, warWindowText, monthsText, itemText, listText, summary, ics, readForm, previewText, emptyState, validate, cleanItem, okPhoto, clip };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.WarrantyCore = api;
})(this);
