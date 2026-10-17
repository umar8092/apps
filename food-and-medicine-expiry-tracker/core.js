// Food and Medicine Expiry Tracker: the logic, no page code.
// Dates are 'YYYY-MM-DD' strings on the person's own calendar (no time zones involved).
(function (root) {
    'use strict';
    const SLUG = 'food-and-medicine-expiry-tracker';
    const MAX_ITEMS = 1000, MAX_OPEN_DAYS = 365;
    const PLACES = { fridge: 'Fridge', freezer: 'Freezer', cupboard: 'Cupboard', medicine: 'Medicine box', other: 'Other' };
    const KINDS = { use: 'Use by', best: 'Best before', exp: 'Expiry date' };
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
    function addMonths(iso, k) {
        const p = parseDate(iso), t = p.y * 12 + (p.m - 1) + k, y = Math.floor(t / 12), m = t - y * 12 + 1;
        return y + '-' + pad(m) + '-' + pad(Math.min(p.d, daysIn(y, m)));
    }
    // Packs that print only a month ("EXP 03/2027") are good until the last day of that month.
    const monthEnd = (y, m) => y + '-' + pad(m) + '-' + pad(daysIn(y, m));
    const dow = iso => { const p = parseDate(iso); return DAYS[new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()]; };
    // "Sun 18 Oct" this year, "Sun 18 Oct 2027" other years
    function shortDate(iso, today) {
        const p = parseDate(iso); if (!p) return '';
        return dow(iso) + ' ' + p.d + ' ' + MONTHS[p.m - 1] + (today && iso.slice(0, 4) === today.slice(0, 4) ? '' : ' ' + p.y);
    }
    const monthText = iso => { const p = parseDate(iso); return MONTHS[p.m - 1] + ' ' + p.y; };
    const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
    // Whole months and years between two dates a <= b ("1 year 2 months"), 0 months when under a month.
    function span(a, b) {
        let m = 0; while (m < 1200 && addMonths(a, m + 1) <= b) m++;
        const y = Math.floor(m / 12), r = m % 12;
        return (y ? plural(y, 'year') : '') + (y && r ? ' ' : '') + (r ? plural(r, 'month') : '');
    }
    // "today", "tomorrow", "in 5 days", "in 3 weeks", "in 4 months"; past: "yesterday", "3 days ago", "2 weeks ago".
    function rel(today, date) {
        const d = diff(today, date), a = Math.abs(d);
        if (d === 0) return 'today';
        if (d === 1) return 'tomorrow';
        if (d === -1) return 'yesterday';
        let t;
        if (a < 14) t = plural(a, 'day');
        else if (a < 60) t = plural(Math.floor(a / 7), 'week');
        else t = d > 0 ? span(today, date) : span(date, today);
        return d > 0 ? 'in ' + t : t + ' ago';
    }

    // ---- items
    // The date that counts: the printed date, or the last day after opening when that comes first
    // (opened Sat 17 Oct, "use within 3 days of opening" = use by Tue 20 Oct).
    function openEnd(it) { return it.opened && it.openDays ? addDays(it.opened, it.openDays) : ''; }
    function effDate(it) { const o = openEnd(it); return o && o < it.date ? o : it.date; }
    const byOpening = it => { const o = openEnd(it); return !!o && o < it.date; };
    const soonDays = it => it.kind === 'exp' && !byOpening(it) ? 30 : 3;   // medicines are flagged a month ahead
    function classify(it, today) {
        if (it.status !== 'active') return { section: 'archive', d: 0 };
        const d = diff(today, effDate(it));
        return { section: d < 0 ? 'expired' : d <= soonDays(it) ? 'soon' : 'later', d };
    }
    const placeWord = p => (PLACES[p] || 'Other').toLowerCase();
    function dateWords(it, today) {
        return it.monthOnly && !byOpening(it) ? 'end of ' + monthText(it.date) : shortDate(effDate(it), today);
    }
    // The main line on each item, e.g. "Use by Sun 18 Oct (tomorrow)" or "Expired on Sat 3 Oct (2 weeks ago): do not use".
    function statusLine(it, today) {
        const date = effDate(it), d = diff(today, date), when = dateWords(it, today), r = rel(today, date);
        const opened = byOpening(it);
        const word = opened ? 'Use by' : it.kind === 'best' ? 'Best before' : it.kind === 'exp' ? 'Expires' : 'Use by';
        const tail = opened ? ', ' + plural(it.openDays, 'day') + ' after opening' : '';
        if (d > 0) return word + ' ' + when + ' (' + r + ')' + tail;
        if (d === 0) return (word === 'Expires' ? 'Expires today' : word + ' today') + (it.monthOnly && !opened ? ', the end of ' + monthText(date) : ', ' + shortDate(date, today)) + tail;
        const advice = it.kind === 'exp' ? 'do not use' : it.kind === 'best' && !opened ? 'check it before eating' : 'do not eat';
        const past = it.kind === 'exp' && !opened ? 'Expired' : it.kind === 'best' && !opened ? 'Best before passed' : 'Use by date passed';
        return past + ' on ' + when + ' (' + r + ')' + tail + ': ' + advice;
    }
    // Small grey line: where it is, the printed date when opening decides, quantity.
    function subLine(it, today) {
        const bits = [PLACES[it.place] || 'Other'];
        if (it.qty) bits.push(it.qty);
        if (it.opened) bits.push('opened ' + shortDate(it.opened, today));
        if (byOpening(it)) bits.push((it.kind === 'best' ? 'best before ' : it.kind === 'exp' ? 'expiry ' : 'use by ') + (it.monthOnly ? 'end of ' + monthText(it.date) : shortDate(it.date, today)) + ' on the pack');
        return bits.join(' · ');
    }
    function sortItems(list, today) {
        return list.slice().sort((a, b) => effDate(a) < effDate(b) ? -1 : effDate(a) > effDate(b) ? 1 : a.name.localeCompare(b.name) || a.id - b.id);
    }
    function groups(items, today) {
        const g = { expired: [], soon: [], later: [], archive: [] };
        sortItems(items, today).forEach(it => g[classify(it, today).section].push(it));
        g.archive.sort((a, b) => (a.statusDate < b.statusDate ? 1 : a.statusDate > b.statusDate ? -1 : b.id - a.id));
        return g;
    }
    const countPlaces = (items) => { const c = {}; items.filter(it => it.status === 'active').forEach(it => { c[it.place] = (c[it.place] || 0) + 1; }); return c; };
    function summary(items, today) {
        const g = groups(items, today);
        const recent = items.filter(it => it.status !== 'active' && it.statusDate && diff(it.statusDate, today) <= 30 && diff(it.statusDate, today) >= 0);
        return { expired: g.expired.length, soon: g.soon.length, later: g.later.length, total: g.expired.length + g.soon.length + g.later.length,
            next: g.soon[0] || g.later[0] || null, used30: recent.filter(it => it.status === 'used').length, wasted30: recent.filter(it => it.status === 'wasted').length };
    }

    // ---- text to copy, email and print
    const itemText = (it, today) => it.name + (it.qty ? ' (' + it.qty + ')' : '') + ', ' + placeWord(it.place) + ': ' + statusLine(it, today).replace(/^./, c => c.toLowerCase());
    function listText(items, today) {
        const g = groups(items, today), out = [];
        const part = (title, list) => { if (list.length) out.push(title + ':\n' + list.map(it => '- ' + itemText(it, today)).join('\n')); };
        part('Expired', g.expired); part('Use soon', g.soon); part('Later', g.later);
        return out.length ? 'Food and medicine expiry dates, ' + shortDate(today, null) + '\n\n' + out.join('\n\n') : '';
    }
    // Things used up or thrown away in the last 30 days that are not in the list again (with a date still to come), A to Z.
    // The latest spelling of each name is kept.
    function shoppingList(items, today) {
        const have = new Set(items.filter(it => it.status === 'active' && classify(it, today).section !== 'expired').map(it => it.name.toLowerCase()));
        const seen = new Set(), out = [];
        items.filter(it => it.status !== 'active' && it.statusDate && diff(it.statusDate, today) <= 30 && diff(it.statusDate, today) >= 0)
            .sort((a, b) => (a.statusDate < b.statusDate ? 1 : a.statusDate > b.statusDate ? -1 : b.id - a.id))
            .forEach(it => { const k = it.name.toLowerCase(); if (!have.has(k) && !seen.has(k)) { seen.add(k); out.push(it.name); } });
        return out.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));   // A to Z, easy to read in the shop
    }

    // ---- calendar file (.ics): all-day events on the date with reminders
    const esc = t => String(t).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
    function fold(line) {
        const out = []; let s = line;
        while (s.length > 74) { out.push(s.slice(0, 74)); s = ' ' + s.slice(74); }
        out.push(s); return out.join('\r\n');
    }
    // Only dates still to come. Food reminds 1 day before and on the morning; medicines 30 and 7 days before.
    function ics(items, today, stamp) {
        const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//umar8092//Food and Medicine Expiry Tracker//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
        const ds = d => d.replace(/-/g, '');
        let n = 0;
        items.filter(it => it.status === 'active').forEach(it => {
            const date = effDate(it);
            if (date < today) return;
            const med = it.kind === 'exp' && !byOpening(it);
            const summaryText = (med ? 'Expires: ' : byOpening(it) || it.kind === 'use' ? 'Use by today: ' : 'Best before today: ') + it.name + ' (' + placeWord(it.place) + ')';
            L.push('BEGIN:VEVENT', 'UID:' + it.id + '-' + ds(date) + '@' + SLUG, 'DTSTAMP:' + stamp, 'DTSTART;VALUE=DATE:' + ds(date),
                'DTEND;VALUE=DATE:' + ds(addDays(date, 1)), fold('SUMMARY:' + esc(summaryText)), fold('DESCRIPTION:' + esc(itemText(it, today))), 'TRANSP:TRANSPARENT');
            // all-day events start at midnight: -PT15H is 9 am the day before, PT9H is 9 am on the day
            const alarms = med ? [[30, '-P30D'], [7, '-P7D']] : [[1, '-PT15H'], [0, 'PT9H']];
            alarms.filter(a => diff(today, date) >= a[0]).forEach(a => L.push('BEGIN:VALARM', 'ACTION:DISPLAY', fold('DESCRIPTION:' + esc(summaryText)), 'TRIGGER:' + a[1], 'END:VALARM'));
            L.push('END:VEVENT'); n++;
        });
        L.push('END:VCALENDAR');
        return { text: L.join('\r\n') + '\r\n', count: n };
    }

    // ---- reading the form (strings from the page) into an item, with plain error messages
    // f: { name, place, kind, mode: 'day'|'month', date, month, year, opened (date or ''), openDays, qty, note }
    const clip = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, n).trim();
    const clipNote = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '').replace(/\r\n?/g, '\n').trim().slice(0, n);
    function readForm(f, today) {
        const errs = {}, it = {};
        it.name = clip(f.name, 80);
        if (!it.name) errs.name = 'Type what it is, such as "Milk" or "Paracetamol syrup".';
        it.place = PLACES[f.place] ? f.place : 'fridge';
        it.kind = KINDS[f.kind] ? f.kind : 'use';
        it.monthOnly = f.mode === 'month';
        if (it.monthOnly) {
            const m = +f.month, y = +f.year;
            if (!(m >= 1 && m <= 12) || !(y >= 1950 && y <= 2200)) errs.date = 'Choose the month and the year printed on the pack.';
            else it.date = monthEnd(y, m);
        } else if (!String(f.date || '').trim()) errs.date = 'Choose the date printed on the pack, or tap a button such as "In 1 week".';
        else if (!isDate(f.date)) errs.date = 'That date is not valid.';
        else it.date = f.date;
        if (it.date && !errs.date) {
            if (it.date < addMonths(today, -120)) errs.date = 'That is more than 10 years ago. Check the year.';
            else if (it.date > addMonths(today, 360)) errs.date = 'That is more than 30 years away. Check the year.';
        }
        it.opened = ''; it.openDays = 0;
        if (f.opened != null && f.opened !== false) {
            const o = String(f.opened).trim(), n = String(f.openDays == null ? '' : f.openDays).trim();
            if (!o) errs.opened = 'Choose the day you opened it.';
            else if (!isDate(o)) errs.opened = 'That opening date is not valid.';
            else if (o > today) errs.opened = 'The opening day cannot be in the future.';
            else if (o < addMonths(today, -120)) errs.opened = 'That is more than 10 years ago. Check the year.';
            if (!/^\d+$/.test(n) || +n < 1 || +n > MAX_OPEN_DAYS) errs.openDays = 'Type how many days it keeps once opened, from 1 to 365 (the pack often says "use within 3 days of opening").';
            if (!errs.opened && !errs.openDays) { it.opened = o; it.openDays = +n; }
        }
        it.qty = clip(f.qty, 30);
        it.note = clipNote(f.note, 300);
        return { item: it, errs, ok: !Object.keys(errs).length };
    }

    // ---- saved data
    const emptyState = () => ({ v: 1, nextId: 1, items: [], lastPlace: 'fridge' });
    function cleanItem(x) {
        if (!x || typeof x !== 'object') return null;
        const id = Number(x.id), name = clip(x.name, 80);
        if (!Number.isInteger(id) || id < 1 || !name || !isDate(x.date)) return null;
        const it = { id, name, place: PLACES[x.place] ? x.place : 'other', kind: KINDS[x.kind] ? x.kind : 'use', date: x.date, monthOnly: x.monthOnly === true,
            opened: '', openDays: 0, qty: clip(x.qty, 30), note: clipNote(x.note, 300),
            status: ['active', 'used', 'wasted'].includes(x.status) ? x.status : 'active', statusDate: isDate(x.statusDate) ? x.statusDate : '', added: isDate(x.added) ? x.added : '' };
        if (it.monthOnly) { const p = parseDate(it.date); it.date = monthEnd(p.y, p.m); }
        const n = Number(x.openDays);
        if (isDate(x.opened) && Number.isInteger(n) && n >= 1 && n <= MAX_OPEN_DAYS) { it.opened = x.opened; it.openDays = n; }
        if (it.status === 'active') it.statusDate = '';
        return it;
    }
    function validate(s) {
        if (!s || typeof s !== 'object' || !Array.isArray(s.items)) return null;
        const out = emptyState(), seen = new Set();
        s.items.slice(0, MAX_ITEMS).forEach(x => { const it = cleanItem(x); if (it && !seen.has(it.id)) { seen.add(it.id); out.items.push(it); } });
        const maxId = out.items.reduce((m, it) => Math.max(m, it.id), 0);
        out.nextId = Math.max(maxId + 1, Number.isInteger(s.nextId) && s.nextId > 0 && s.nextId < 1e9 ? s.nextId : 1);
        out.lastPlace = PLACES[s.lastPlace] ? s.lastPlace : 'fridge';
        return out;
    }

    const api = { SLUG, PLACES, KINDS, MONTHS, MAX_ITEMS, parseDate, isDate, addDays, addMonths, diff, todayIso, monthEnd, shortDate, monthText, rel, span,
        openEnd, effDate, byOpening, soonDays, classify, statusLine, subLine, groups, countPlaces, summary, itemText, listText, shoppingList, ics,
        readForm, emptyState, cleanItem, validate, clip };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ExpiryCore = api;
})(this);
