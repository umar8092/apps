// Replacement Reminder for Filters and Toothbrushes: the logic, no page code.
// Dates are 'YYYY-MM-DD' strings on the person's own calendar (no time zones involved).
(function (root) {
    'use strict';
    const MAX_ITEMS = 300, MAX_HISTORY = 40, MAX_WHO = 12;
    const MAX = { day: 730, week: 104, month: 36 };
    const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    // Common things and how often makers or health services usually say to replace them. The person can change any number.
    const PRESETS = [
        ['Toothbrush', 3, 'month'], ['Electric toothbrush head', 3, 'month'],
        ['Contact lenses (2-weekly)', 2, 'week'], ['Contact lenses (monthly)', 1, 'month'], ['Contact lens case', 3, 'month'],
        ['Water filter jug cartridge', 4, 'week'], ['Fridge water filter', 6, 'month'], ['Water purifier filter (RO or sediment)', 6, 'month'],
        ['Shower filter', 3, 'month'], ['AC filter (wash or clean)', 1, 'month'], ['Furnace or HVAC air filter', 3, 'month'],
        ['Air purifier filter', 6, 'month'], ['Vacuum cleaner filter', 3, 'month'], ['Cooker hood grease filter (wash)', 1, 'month'],
        ['Kitchen sponge', 1, 'week'], ['Razor blade or cartridge', 2, 'week'], ['Mascara', 3, 'month'],
        ['Pillow', 24, 'month'], ['Car wiper blades', 12, 'month'], ['Smoke alarm battery', 12, 'month']
    ].map(([name, n, unit]) => ({ name, n, unit }));

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
    // 31 Jan + 1 month = 28 Feb (or 29 Feb): the day is kept when the month has it, otherwise the month's last day.
    function addMonths(iso, n) {
        const p = parseDate(iso), t = p.y * 12 + (p.m - 1) + n, y = Math.floor(t / 12), m = t - y * 12 + 1;
        return y + '-' + pad(m) + '-' + pad(Math.min(p.d, daysIn(y, m)));
    }
    const addEvery = (iso, n, unit) => unit === 'month' ? addMonths(iso, n) : addDays(iso, unit === 'week' ? n * 7 : n);
    const diff = (a, b) => dayNum(b) - dayNum(a);                         // days from a to b
    const todayIso = (d = new Date()) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    const dow = iso => { const p = parseDate(iso); return DAYS[new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()]; };
    // "Sun 18 Oct" this year, "Sun 18 Oct 2027" other years
    function shortDate(iso, today) {
        const p = parseDate(iso); if (!p) return '';
        return dow(iso) + ' ' + p.d + ' ' + MONTHS[p.m - 1] + (today && iso.slice(0, 4) === today.slice(0, 4) ? '' : ' ' + p.y);
    }
    const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
    // 5 days, 3 weeks, 4 months, 2 years
    function span(a) { return a < 14 ? plural(a, 'day') : a < 60 ? plural(Math.floor(a / 7), 'week') : a < 730 ? plural(Math.floor(a / 30.44), 'month') : plural(Math.floor(a / 365.25), 'year'); }
    function rel(today, date) {
        const d = diff(today, date);
        if (d === 0) return 'today';
        if (d === 1) return 'tomorrow';
        if (d === -1) return 'yesterday';
        return d > 0 ? 'in ' + span(d) : span(-d) + ' ago';
    }
    // "every day", "every 3 days", "every week", "every 2 weeks", "every month", "every 3 months", "every year", "every 2 years"
    function everyText(n, unit) {
        if (unit === 'month' && n % 12 === 0) return n === 12 ? 'every year' : 'every ' + n / 12 + ' years';
        const w = unit === 'month' ? 'month' : unit === 'week' ? 'week' : 'day';
        return n === 1 ? 'every ' + w : 'every ' + n + ' ' + w + 's';
    }

    // ---- one item
    const label = it => it.name + (it.who ? ' (' + it.who + ')' : '');
    // The day it is due next. No date recorded = today. Paused days that were not counted move it later.
    function nextDue(it, today) {
        if (!it.last) return today;
        return addDays(addEvery(it.last, it.n, it.unit), it.skip || 0);
    }
    function dueLine(it, today) {
        if (it.paused) return 'Paused since ' + shortDate(it.paused, today) + ': not counting';
        if (!it.last) return 'Replace now (no date recorded yet)';
        const next = nextDue(it, today), d = diff(today, next);
        if (d < 0) return 'Replace now: ' + span(-d) + ' late (was due ' + shortDate(next, today) + ')';
        if (d === 0) return 'Replace today';
        if (d === 1) return 'Due tomorrow, ' + shortDate(next, today);
        return 'Due ' + shortDate(next, today) + ' (' + rel(today, next) + ')';
    }
    function subLine(it, today) {
        const bits = ['Replace ' + everyText(it.n, it.unit)];
        bits.push(it.last ? 'last replaced ' + shortDate(it.last, today) + ' (' + rel(today, it.last) + ')' : 'no date recorded');
        if (it.skip > 0) bits.push(plural(it.skip, 'paused day') + ' not counted');
        return bits.join(' · ');
    }
    // "Earlier: Fri 1 May, Sat 1 Feb" (the dates before the last one, newest first), or '' when there are none.
    function historyLine(it, today) {
        const h = (it.history || []).filter(x => x !== it.last).slice().sort().reverse();
        if (!h.length) return '';
        const shown = h.slice(0, 4).map(x => shortDate(x, today));
        return 'Earlier: ' + shown.join(', ') + (h.length > 4 ? ' and ' + (h.length - 4) + ' more' : '');
    }
    // Average days between replacements, or 0 when there are fewer than 3.
    function averageGap(it) {
        const h = (it.history || []).slice().sort().slice(-6);
        if (h.length < 3) return 0;
        return Math.round(diff(h[0], h[h.length - 1]) / (h.length - 1));
    }

    // ---- the whole list
    function sortItems(list, today) {
        return list.slice().sort((a, b) => {
            const x = nextDue(a, today), y = nextDue(b, today);
            return x < y ? -1 : x > y ? 1 : label(a).localeCompare(label(b)) || a.id - b.id;
        });
    }
    // 'now' = due today or late, 'later' = still to come, 'paused' = not counting
    function groups(items, today) {
        const g = { now: [], later: [], paused: [] };
        sortItems(items, today).forEach(it => {
            if (it.paused) g.paused.push(it);
            else (nextDue(it, today) <= today ? g.now : g.later).push(it);
        });
        g.paused.sort((a, b) => label(a).localeCompare(label(b)) || a.id - b.id);
        return g;
    }
    // "Water filter jug cartridge (12 days late)" for the summary
    function dueName(it, today) {
        const d = diff(today, nextDue(it, today));
        return label(it) + (it.last && d < 0 ? ' (' + span(-d) + ' late)' : '');
    }

    // ---- actions (return a new item, never change the old one)
    function replaced(it, day) {
        const h = (it.history || []).filter(x => x !== day).concat([day]).sort().slice(-MAX_HISTORY);
        const later = it.last && it.last > day;
        return Object.assign({}, it, { last: later ? it.last : day, skip: later ? it.skip : 0, paused: '', history: h });
    }
    const pause = (it, today) => Object.assign({}, it, { paused: today });
    // The paused days are not counted: the due date moves later by that many days.
    function resume(it, today) {
        if (!it.paused) return it;
        const add = it.last ? Math.max(0, diff(it.paused, today)) : 0;
        return Object.assign({}, it, { paused: '', skip: Math.min((it.skip || 0) + add, 3650) });
    }

    // ---- sharing
    function listText(items, today) {
        const g = groups(items, today), out = [];
        const line = it => '- ' + label(it) + ': ' + dueLine(it, today).replace(/^./, c => c.toLowerCase()) + ', ' + everyText(it.n, it.unit) + (it.note ? '. ' + it.note.replace(/\s*\n\s*/g, '; ') : '');
        if (g.now.length) out.push('Replace now:\n' + g.now.map(line).join('\n'));
        if (g.later.length) out.push('Coming up:\n' + g.later.map(line).join('\n'));
        if (g.paused.length) out.push('Paused:\n' + g.paused.map(it => '- ' + label(it)).join('\n'));
        return out.length ? 'Things to replace, ' + shortDate(today, null) + '\n\n' + out.join('\n\n') : '';
    }
    // What to buy for everything due in the next 'days' days, the same names counted together.
    function shoppingList(items, today, days) {
        const until = addDays(today, days), map = new Map();
        sortItems(items.filter(it => !it.paused), today).forEach(it => {
            const due = nextDue(it, today); if (due > until) return;
            const k = it.name.toLowerCase();
            if (!map.has(k)) map.set(k, { name: it.name, count: 0, first: due, who: [] });
            const x = map.get(k); x.count++; if (it.who) x.who.push(it.who);
        });
        return [...map.values()];
    }
    function shoppingText(items, today, days) {
        const list = shoppingList(items, today, days);
        if (!list.length) return '';
        return 'To buy for the next ' + days + ' days (' + shortDate(today, null) + '):\n' + list.map(x => '- ' + x.name + (x.count > 1 ? ' x ' + x.count : '') +
            (x.who.length ? ' (' + x.who.join(', ') + ')' : '') + ', ' + (x.first <= today ? 'needed now' : 'first needed ' + shortDate(x.first, today))).join('\n');
    }

    // ---- calendar file: one reminder per item on its due date at 9:00, repeating at its own interval
    const icsEsc = s => String(s).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
    function fold(line) {
        const out = []; let cur = '', len = 0;
        for (const ch of line) {
            const b = new TextEncoder().encode(ch).length;
            if (len + b > (out.length ? 74 : 75)) { out.push(cur); cur = ''; len = 0; }
            cur += ch; len += b;
        }
        out.push(cur);
        return out.join('\r\n ');
    }
    function ics(items, today, url) {
        const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//umar8092 apps//Replacement Reminder//EN', 'CALSCALE:GREGORIAN'];
        const stamp = today.replace(/-/g, '') + 'T000000Z';
        sortItems(items.filter(it => !it.paused), today).forEach(it => {
            let due = nextDue(it, today); if (due < today) due = today;
            const d = due.replace(/-/g, ''), end = addDays(due, 1).replace(/-/g, '');
            const freq = it.unit === 'month' ? 'MONTHLY' : it.unit === 'week' ? 'WEEKLY' : 'DAILY';
            L.push('BEGIN:VEVENT', 'UID:replace-' + it.id + '@umar8092.github.io', 'DTSTAMP:' + stamp,
                'DTSTART;VALUE=DATE:' + d, 'DTEND;VALUE=DATE:' + end, 'RRULE:FREQ=' + freq + ';INTERVAL=' + it.n,
                fold('SUMMARY:' + icsEsc('Replace: ' + label(it))),
                fold('DESCRIPTION:' + icsEsc('Replace ' + everyText(it.n, it.unit) + '. Tap Replaced today in the app: ' + url)),
                'BEGIN:VALARM', 'ACTION:DISPLAY', fold('DESCRIPTION:' + icsEsc('Replace: ' + label(it))), 'TRIGGER:PT9H', 'END:VALARM', 'END:VEVENT');
        });
        L.push('END:VCALENDAR');
        return L.join('\r\n') + '\r\n';
    }

    // ---- the form
    // f = { name, who, n, unit, last ('' = not sure), note }. When adding, who may hold several names with commas: one item each.
    function readForm(f, today, items, editingId) {
        const errors = {};
        const name = String(f.name || '').replace(/\s+/g, ' ').trim().slice(0, 60);
        if (!name) errors.name = 'Type what needs replacing, for example Toothbrush, or pick a common item.';
        const unit = MAX[f.unit] ? f.unit : 'month';
        const raw = String(f.n == null ? '' : f.n).trim();
        const n = /^\d+$/.test(raw) ? +raw : NaN;
        if (!(n >= 1 && n <= MAX[unit])) errors.n = 'Type a whole number from 1 to ' + MAX[unit] + ' ' + unit + 's.';
        let last = '';
        if (f.last) {
            if (!isDate(f.last)) errors.last = 'Choose a real date, or tap "Not sure".';
            else if (f.last > today) errors.last = 'The last replacement cannot be in the future. Choose today or an earlier day.';
            else last = f.last;
        }
        const clean = s => s.replace(/\s+/g, ' ').trim().slice(0, 40);
        const whoRaw = String(f.who || '');
        let whos = editingId != null ? [clean(whoRaw)] : whoRaw.split(',').map(clean);
        whos = whos.filter((w, i) => w && whos.findIndex(x => x.toLowerCase() === w.toLowerCase()) === i);
        if (!whos.length) whos = [''];
        if (whos.length > MAX_WHO) errors.who = 'That is ' + whos.length + ' names. Add up to ' + MAX_WHO + ' at a time.';
        const note = String(f.note || '').replace(/\r\n?/g, '\n').trim().slice(0, 300);
        if (Object.keys(errors).length) return { errors };
        const same = whos.filter(w => (items || []).some(it => it.id !== editingId && it.name.toLowerCase() === name.toLowerCase() && (it.who || '').toLowerCase() === w.toLowerCase()));
        return { items: whos.map(who => ({ name, who, n, unit, last, note })),
            warn: same.length ? 'You already had ' + same.map(w => label({ name, who: w })).join(', ') + '. Both are kept.' : '' };
    }

    // ---- saved data
    const emptyState = () => ({ v: 1, nextId: 1, items: [] });
    function cleanItem(x) {
        if (!x || typeof x !== 'object') return null;
        const name = typeof x.name === 'string' ? x.name.replace(/\s+/g, ' ').trim().slice(0, 60) : '';
        const id = Number.isInteger(x.id) && x.id > 0 ? x.id : null;
        const unit = MAX[x.unit] && Object.prototype.hasOwnProperty.call(MAX, x.unit) ? x.unit : null;
        const n = unit && Number.isInteger(x.n) && x.n >= 1 && x.n <= MAX[unit] ? x.n : null;
        if (!name || !id || !n) return null;
        const okDate = v => typeof v === 'string' && isDate(v) ? v : '';
        const hist = Array.isArray(x.history) ? [...new Set(x.history.filter(h => typeof h === 'string' && isDate(h)))].sort().slice(-MAX_HISTORY) : [];
        const last = okDate(x.last);
        return { id, name, who: typeof x.who === 'string' ? x.who.replace(/\s+/g, ' ').trim().slice(0, 40) : '', n, unit, last,
            skip: last && Number.isInteger(x.skip) && x.skip > 0 && x.skip <= 3650 ? x.skip : 0, paused: okDate(x.paused), history: hist,
            note: typeof x.note === 'string' ? x.note.slice(0, 300) : '', added: okDate(x.added) };
    }
    function validate(s) {
        if (!s || typeof s !== 'object' || !Array.isArray(s.items)) return null;
        const seen = new Set(), items = [];
        s.items.slice(0, MAX_ITEMS).forEach(x => { const it = cleanItem(x); if (it && !seen.has(it.id)) { seen.add(it.id); items.push(it); } });
        const maxId = items.reduce((m, it) => Math.max(m, it.id), 0);
        return { v: 1, nextId: Math.max(Number.isInteger(s.nextId) ? s.nextId : 1, maxId + 1), items };
    }

    const api = { MAX_ITEMS, MAX, MAX_WHO, PRESETS, parseDate, isDate, addDays, addMonths, addEvery, diff, todayIso, shortDate, rel, span, everyText, plural,
        label, nextDue, dueLine, subLine, historyLine, averageGap, sortItems, groups, dueName, replaced, pause, resume,
        listText, shoppingList, shoppingText, ics, readForm, emptyState, validate };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ReplaceCore = api;
})(this);
