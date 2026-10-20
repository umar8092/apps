// Birthday and Anniversary Reminder List: the logic, no page code.
// Dates are 'YYYY-MM-DD' strings on the person's own calendar (no time zones involved).
(function (root) {
    'use strict';
    const SLUG = 'birthday-and-anniversary-reminder-list';
    const MAX_ENTRIES = 1000, MAX_PASTE = 300;
    const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const KINDS = { birthday: 'Birthday', anniversary: 'Wedding anniversary', other: 'Other' };
    const GROUPS = { '': 'No group', family: 'Family', friends: 'Friends', work: 'Work' };
    const BEFORE = [0, 1, 2, 3, 7, 14];          // calendar reminder: days before (0 = on the day only)

    // ---- dates
    const pad = n => String(n).padStart(2, '0');
    const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
    const isLeap = y => daysIn(y, 2) === 29;
    function parseDate(v) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v == null ? '' : v));
        if (!m) return null;
        const y = +m[1], mo = +m[2], d = +m[3];
        if (y < 1800 || y > 2300 || mo < 1 || mo > 12 || d < 1 || d > daysIn(y, mo)) return null;
        return { y, m: mo, d };
    }
    const iso = (y, m, d) => y + '-' + pad(m) + '-' + pad(d);
    const dayNum = s => { const p = parseDate(s); return Math.round(Date.UTC(p.y, p.m - 1, p.d) / 864e5); };
    const fromNum = n => { const d = new Date(n * 864e5); return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()); };
    const addDays = (s, n) => fromNum(dayNum(s) + n);
    const diff = (a, b) => dayNum(b) - dayNum(a);                          // days from a to b
    const todayIso = (d = new Date()) => iso(d.getFullYear(), d.getMonth() + 1, d.getDate());
    function shortDate(s, today) {                                          // "Sat 24 Oct", with the year when it is not this year
        const p = parseDate(s); if (!p) return '';
        const dow = DAYS[new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()];
        return dow + ' ' + p.d + ' ' + MONTHS[p.m - 1] + (today && +today.slice(0, 4) === p.y ? '' : ' ' + p.y);
    }
    const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
    function ordinal(n) {
        const t = n % 100, u = n % 10;
        return n + (t >= 11 && t <= 13 ? 'th' : u === 1 ? 'st' : u === 2 ? 'nd' : u === 3 ? 'rd' : 'th');
    }

    // ---- when each date comes round
    // The day it is kept in year y. A 29 February date is kept on 28 Feb or 1 Mar in other years, as the person chose.
    function occIn(e, y) {
        if (e.m === 2 && e.d === 29 && !isLeap(y)) return e.feb29 === '1' ? iso(y, 3, 1) : iso(y, 2, 28);
        return iso(y, e.m, e.d);
    }
    const yearsAt = (e, date) => e.y ? +date.slice(0, 4) - e.y : null;  // age or years together on that day
    function nextOcc(e, today) {
        const ty = +today.slice(0, 4);
        let date = occIn(e, ty);
        if (date < today) date = occIn(e, ty + 1);
        return { date, days: diff(today, date), years: yearsAt(e, date) };
    }
    function lastOcc(e, today) {                                            // the most recent one before today
        const ty = +today.slice(0, 4);
        let date = occIn(e, ty);
        if (date >= today) date = occIn(e, ty - 1);
        return { date, days: diff(date, today), years: yearsAt(e, date) };
    }
    const kindLabel = e => e.kind === 'other' ? e.label : KINDS[e.kind];
    const poss = n => n + (/s$/i.test(n) ? "'" : "'s");

    // "Sara turns 31", "Ali and Sara: 11th wedding anniversary", "Ahmed: Work anniversary, 5 years"
    function title(e, years) {
        if (e.kind === 'birthday') return years === null ? poss(e.name) + ' birthday' : years === 0 ? e.name + ' was born' : e.name + ' turns ' + years;
        if (e.kind === 'anniversary') return e.name + ': ' + (years === null ? 'wedding anniversary' : years === 0 ? 'wedding day' : ordinal(years) + ' wedding anniversary');
        return e.name + ': ' + e.label + (years ? ', ' + plural(years, 'year') : '');
    }
    // The same without the name, for the person's own box: "Turns 31", "11th anniversary", "5 years"
    function boxTitle(e, years) {
        if (e.kind === 'birthday') return years === null ? 'Birthday' : years === 0 ? 'Born' : 'Turns ' + years;
        if (e.kind === 'anniversary') return years === null ? 'Anniversary' : years === 0 ? 'Wedding day' : ordinal(years) + ' anniversary';
        return years ? plural(years, 'year') : e.label;
    }
    function when(o, today) {
        if (o.days === 0) return 'today';
        if (o.days === 1) return 'tomorrow (' + shortDate(o.date, today) + ')';
        return 'on ' + shortDate(o.date, today) + ' (in ' + o.days + ' days)';
    }
    const upLine = (e, today) => { const o = nextOcc(e, today); return title(e, o.years) + ' ' + when(o, today); };
    function pastLine(e, today) {
        const o = lastOcc(e, today), y = o.years;
        let t;
        if (e.kind === 'birthday') t = y === null ? poss(e.name) + ' birthday was' : y === 0 ? e.name + ' was born' : e.name + ' turned ' + y;
        else t = title(e, y) + (e.kind === 'other' && y ? ',' : '') + ' was';
        return t + ' on ' + shortDate(o.date, today) + ' (' + (o.days === 1 ? 'yesterday' : o.days + ' days ago') + ')';
    }
    const boxLine = (e, today) => { const o = nextOcc(e, today); return boxTitle(e, o.years) + ' ' + when(o, today); };
    const daysChip = o => o.days === 0 ? 'Today' : o.days === 1 ? 'Tomorrow' : 'In ' + o.days + ' days';
    function since(e) {                                                     // "Born 24 Oct 1995", "Married 3 Jun 2015", "24 Oct, year not known"
        const dm = e.d + ' ' + MONTHS[e.m - 1];
        let s = e.y ? (e.kind === 'birthday' ? 'Born ' : e.kind === 'anniversary' ? 'Married ' : 'Since ') + dm + ' ' + e.y : dm + ', year not known';
        if (e.m === 2 && e.d === 29) s += ' (kept on ' + (e.feb29 === '1' ? '1 Mar' : '28 Feb') + ' in other years)';
        return s;
    }
    function sorted(entries, today) {
        return entries.map(e => ({ e, o: nextOcc(e, today) }))
            .sort((a, b) => a.o.days - b.o.days || a.e.name.localeCompare(b.e.name) || a.e.id - b.e.id);
    }
    // What the top box shows: today, tomorrow, the next 30 days, and anything in the last 7 days (to wish late).
    function upcoming(entries, today) {
        const r = { today: [], tomorrow: [], soon: [], passed: [] };
        sorted(entries, today).forEach(x => {
            if (x.o.days === 0) r.today.push(x); else if (x.o.days === 1) r.tomorrow.push(x); else if (x.o.days <= 30) r.soon.push(x);
            const l = lastOcc(x.e, today);
            if (x.o.days !== 0 && l.days >= 1 && l.days <= 7) r.passed.push({ e: x.e, o: l });
        });
        r.passed.sort((a, b) => a.o.days - b.o.days || a.e.name.localeCompare(b.e.name));
        return r;
    }
    // Wished is remembered for the day it was ticked, so it clears itself by next year.
    const wishedFor = (e, today) => { const o = nextOcc(e, today).days === 0 ? nextOcc(e, today) : lastOcc(e, today); return e.wished === o.date; };
    function listText(entries, today, max) {
        const rows = sorted(entries, today).filter(x => x.o.days <= 365).map(x => shortDate(x.o.date, null) + ': ' + title(x.e, x.o.years) + (x.e.note ? ' (' + x.e.note.replace(/\s+/g, ' ') + ')' : ''));
        const lim = max || rows.length;
        const lines = ['Birthdays and anniversaries, the next 12 months from ' + shortDate(today, null) + ':', ''].concat(rows.slice(0, lim));
        if (rows.length > lim) lines.push('...and ' + (rows.length - lim) + ' more');
        return lines.join('\n');
    }

    // ---- calendar file (.ics): a yearly all-day event per date, with a reminder at 9:00
    const esc = t => String(t).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
    function fold(line) {
        const out = []; let s = line;
        while (s.length > 74) { out.push(s.slice(0, 74)); s = ' ' + s.slice(74); }
        out.push(s); return out.join('\r\n');
    }
    function calTitle(e) {
        if (e.kind === 'birthday') return poss(e.name) + ' birthday' + (e.y ? ' (born ' + e.y + ')' : '');
        if (e.kind === 'anniversary') return poss(e.name) + ' wedding anniversary' + (e.y ? ' (married ' + e.y + ')' : '');
        return e.name + ': ' + e.label + (e.y ? ' (since ' + e.y + ')' : '');
    }
    function ics(entries, today, stamp, before) {
        const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//umar8092//Birthday and Anniversary Reminder List//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
        const ds = d => d.replace(/-/g, '');
        const alarms = sum => {
            L.push('BEGIN:VALARM', 'ACTION:DISPLAY', fold('DESCRIPTION:' + esc(sum)), 'TRIGGER;RELATED=START:PT9H', 'END:VALARM');
            if (before > 0) L.push('BEGIN:VALARM', 'ACTION:DISPLAY', fold('DESCRIPTION:' + esc(sum + ' in ' + plural(before, 'day'))),
                'TRIGGER;RELATED=START:-' + (before > 1 ? 'P' + (before - 1) + 'DT15H' : 'PT15H'), 'END:VALARM');
        };
        let n = 0;
        entries.forEach(e => {
            const sum = calTitle(e), desc = since(e) + (e.note ? '\n' + e.note : '');
            const ev = (uid, date, rrule) => {
                L.push('BEGIN:VEVENT', 'UID:' + uid + '@' + SLUG, 'DTSTAMP:' + stamp, 'DTSTART;VALUE=DATE:' + ds(date), 'DTEND;VALUE=DATE:' + ds(addDays(date, 1)));
                if (rrule) L.push(rrule);
                L.push(fold('SUMMARY:' + esc(sum)), fold('DESCRIPTION:' + esc(desc)), 'TRANSP:TRANSPARENT');
                alarms(sum); L.push('END:VEVENT');
            };
            const first = nextOcc(e, today).date;
            if (e.m === 2 && e.d === 29) {
                // No yearly rule can say "29 Feb, else 1 Mar", so each of the next 30 years gets its own event.
                const y0 = +first.slice(0, 4);
                for (let y = y0; y < y0 + 30; y++) ev(e.id + '-' + y, occIn(e, y), '');
            } else ev(e.id + '-' + ds(first), first, 'RRULE:FREQ=YEARLY');
            n++;
        });
        L.push('END:VCALENDAR');
        return { text: L.join('\r\n') + '\r\n', count: n };
    }

    // ---- reading the form (strings from the page), with plain error messages
    function clip(v, max, multi) {
        let s = String(v == null ? '' : v);
        s = multi ? s.replace(/\r\n?/g, '\n').replace(/[^\S\n]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim() : s.replace(/\s+/g, ' ').trim();
        return s.slice(0, max);
    }
    const sameDate = (a, b) => a.name.toLowerCase() === b.name.toLowerCase() && a.kind === b.kind && (a.kind !== 'other' || a.label.toLowerCase() === b.label.toLowerCase()) && a.d === b.d && a.m === b.m;
    // f: { name, kind, label, day, month, year, feb29, group, note }; others: the entries already on the list (minus the one being edited)
    function readForm(f, today, others) {
        const err = {};
        const name = clip(f.name, 60), kind = KINDS[f.kind] ? f.kind : 'birthday', label = kind === 'other' ? clip(f.label, 40) : '';
        if (!name) err.name = kind === 'anniversary' ? 'Type whose anniversary it is, such as "Ali and Sara".' : 'Type a name.';
        if (kind === 'other' && !label) err.label = 'Type what the day is, such as "Work anniversary".';
        const d = +f.day, m = +f.month, ys = String(f.year == null ? '' : f.year).trim();
        const ty = +today.slice(0, 4);
        let y = 0;
        if (!d || !m) err.date = 'Pick the day and the month.';
        else if (d > daysIn(2000, m)) err.date = MONTHS_LONG[m - 1] + ' has only ' + daysIn(2000, m) + ' days.';
        if (ys) {
            if (!/^\d{4}$/.test(ys)) err.year = 'Type the year as 4 digits, such as 1995, or leave it empty.';
            else if (+ys < 1900 || +ys > ty) err.year = 'Type a year from 1900 to ' + ty + ', or leave it empty.';
            else {
                y = +ys;
                if (!err.date && d === 29 && m === 2 && !isLeap(y)) err.date = y + ' had no 29 February. Check the day or the year.';
                else if (!err.date && iso(y, m, d) > today) err.date = 'That date has not happened yet. Leave the year empty if it is still to come.';
            }
        }
        const e = { name, kind, label, d: d || 0, m: m || 0, y, feb29: f.feb29 === '1' ? '1' : '28', group: GROUPS[f.group] !== undefined ? f.group : '', note: clip(f.note, 300, true), wished: '' };
        if (!Object.keys(err).length && (others || []).some(o => sameDate(o, e))) err.name = poss(name) + ' ' + kindLabel(e).toLowerCase() + ' on ' + d + ' ' + MONTHS[m - 1] + ' is already on the list.';
        return Object.keys(err).length ? { err } : { entry: e };
    }

    // ---- pasting a list: one person per line, such as "Sara 24/10/1995" or "Mum - 3 March" or "Ali and Sara anniversary 2015-06-12"
    const MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?';
    const monthOf = w => MONTHS.findIndex(x => w.toLowerCase().startsWith(x.toLowerCase())) + 1;
    function fullYear(s, ty) {
        if (!s) return 0;
        if (s.length === 4) return +s;
        const n = +s, cur = ty % 100;
        return n <= cur ? 2000 + n : 1900 + n;
    }
    function parseLine(raw, order, today) {
        const line = clip(raw, 200), ty = +today.slice(0, 4);
        if (!line) return null;
        let d, m, ys = '', match;
        const tries = [
            [new RegExp('(^|[^\\d])(\\d{4})-(\\d{1,2})-(\\d{1,2})(?!\\d)'), r => { ys = r[2]; m = +r[3]; d = +r[4]; }],
            [new RegExp('(^|[^\\d])(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?' + MONTH_RE + '(?:,?\\s+(\\d{4}))?(?![a-z\\d])', 'i'), r => { d = +r[2]; m = monthOf(r[3]); ys = r[4] || ''; }],
            [new RegExp('(^|[^a-z])' + MONTH_RE + '\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?(?![\\d])', 'i'), r => { m = monthOf(r[2]); d = +r[3]; ys = r[4] || ''; }],
            [/(^|[^\d])(\d{1,2})[\/.\-](\d{1,2})(?:[\/.\-](\d{4}|\d{2}))?(?![\d\/.\-]*\d)/, r => {
                const a = +r[2], b = +r[3];
                // The person's own order, unless one number can only be the day (24/10 read as month/day is impossible)
                if (order === 'md') { if (a > 12 && b <= 12) { d = a; m = b; } else { m = a; d = b; } }
                else if (b > 12 && a <= 12) { m = a; d = b; } else { d = a; m = b; }
                ys = r[4] || '';
            }]
        ];
        for (const [re, take] of tries) { match = re.exec(line); if (match) { take(match); break; } }
        if (!match) return { line, error: 'no date found' };
        let rest = (line.slice(0, match.index + match[1].length) + ' ' + line.slice(match.index + match[0].length));
        let kind = 'birthday';
        if (/\b(wedding\s+)?anniversary\b|\banniv\b|\bwedding\b|\bmarried\b/i.test(rest)) kind = 'anniversary';
        rest = rest.replace(/\b(wedding\s+anniversary|anniversary|anniv|wedding|married|birthday|bday|b-day|born|dob)\b/gi, ' ')
            .replace(/[\s,;:|\-–—()\[\]]+$/g, '').replace(/^[\s,;:|\-–—()\[\]]+/g, '').replace(/\s+/g, ' ').trim();
        const y = fullYear(ys, ty);
        const r = readForm({ name: rest, kind, day: d, month: m, year: y ? String(y) : '' }, today, []);
        if (r.err) return { line, error: r.err.date || r.err.year || r.err.name };
        return { line, entry: r.entry };
    }
    // vCard contacts file (exported from a phone): the full name with BDAY and ANNIVERSARY.
    function parseVcf(text, today) {
        const out = [], ty = +today.slice(0, 4);
        const unfolded = String(text).replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '');
        const cards = unfolded.split(/BEGIN:VCARD/i).slice(1);
        cards.forEach(c => {
            const get = key => { const r = new RegExp('^(?:item\\d+\\.)?' + key + '(?:;[^:\\n]*)?:(.*)$', 'im').exec(c); return r ? r[1].trim() : ''; };
            let name = get('FN').replace(/\\([,;\\])/g, '$1');
            if (!name) { const n = get('N').split(';'); name = [n[1], n[0]].filter(Boolean).join(' '); }
            const add = (raw, kind) => {
                const r = /^(?:(\d{4})|--)-?(\d{2})-?(\d{2})/.exec(raw.replace(/T.*$/, ''));
                if (!r) return;
                let ys = r[1] || '';
                if (ys === '1604' || (ys && +ys < 1900)) ys = '';           // phones use 1604 for "no year"
                const p = readForm({ name, kind, day: +r[3], month: +r[2], year: ys }, today, []);
                out.push(p.err ? { line: name + ' ' + raw, error: p.err.date || p.err.year || p.err.name } : { line: name + ' ' + raw, entry: p.entry });
            };
            add(get('BDAY'), 'birthday');
            add(get('ANNIVERSARY') || get('X-ANNIVERSARY') || get('X-ABDATE'), 'anniversary');
        });
        return out.slice(0, MAX_PASTE);
    }
    function parsePaste(text, order, today) {
        const lines = String(text == null ? '' : text).split(/\r?\n/).filter(l => l.trim()).slice(0, MAX_PASTE);
        return lines.map(l => parseLine(l, order, today)).filter(Boolean);
    }
    // Splits parsed rows into the ones to add, the ones already on the list (or twice in the paste) and the ones that could not be read.
    function sortImport(rows, entries) {
        const add = [], dup = [], bad = [];
        rows.forEach(r => {
            if (r.error) bad.push(r);
            else if (entries.concat(add).some(o => sameDate(o, r.entry))) dup.push(r);
            else add.push(r.entry);
        });
        return { add, dup, bad };
    }
    const guessOrder = lang => /^en-(us|ph)\b/i.test(String(lang || '')) ? 'md' : 'dm';   // month first in the US and the Philippines

    // ---- saved state
    const emptyState = () => ({ v: 1, nextId: 1, entries: [], order: 'dm', before: 1 });
    function cleanEntry(x) {
        if (!x || typeof x !== 'object' || !Number.isInteger(x.id) || x.id < 1 || x.id > 1e9) return null;
        const kind = KINDS[x.kind] ? x.kind : 'birthday';
        const name = clip(x.name, 60), label = kind === 'other' ? clip(x.label, 40) || 'Special day' : '';
        const d = x.d, m = x.m, y = x.y;
        if (!name || !Number.isInteger(m) || m < 1 || m > 12 || !Number.isInteger(d) || d < 1 || d > daysIn(2000, m)) return null;
        const yy = Number.isInteger(y) && y >= 1800 && y <= 2300 && !(d === 29 && m === 2 && !isLeap(y)) ? y : 0;
        return { id: x.id, name, kind, label, d, m, y: yy, feb29: x.feb29 === '1' ? '1' : '28', group: typeof x.group === 'string' && GROUPS[x.group] !== undefined ? x.group : '',
            note: clip(x.note, 300, true), wished: parseDate(x.wished) ? x.wished : '' };
    }
    // Checks every value from storage or a backup file; anything wrong is dropped, never trusted.
    function validate(s) {
        if (!s || typeof s !== 'object' || !Array.isArray(s.entries)) return null;
        const out = emptyState(), ids = new Set();
        s.entries.slice(0, MAX_ENTRIES).forEach(x => { const e = cleanEntry(x); if (e && !ids.has(e.id)) { ids.add(e.id); out.entries.push(e); } });
        out.order = s.order === 'md' ? 'md' : 'dm';
        out.before = BEFORE.includes(s.before) ? s.before : 1;
        out.nextId = Math.max(1, ...[...ids].map(i => i + 1), Number.isInteger(s.nextId) && s.nextId >= 1 && s.nextId <= 1e9 ? s.nextId : 1);
        return out;
    }

    const api = { SLUG, MAX_ENTRIES, KINDS, GROUPS, BEFORE, MONTHS, MONTHS_LONG, parseDate, addDays, diff, todayIso, shortDate, ordinal, isLeap, daysIn,
        occIn, nextOcc, lastOcc, title, boxTitle, when, upLine, pastLine, boxLine, daysChip, since, kindLabel, sorted, upcoming, wishedFor, listText,
        ics, readForm, parseLine, parsePaste, parseVcf, sortImport, guessOrder, emptyState, validate, cleanEntry, clip };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.BdayCore = api;
})(this);
