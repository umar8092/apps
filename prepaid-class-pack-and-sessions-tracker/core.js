// Prepaid Class Pack and Sessions Tracker: the logic, no page code.
// Dates are 'YYYY-MM-DD' strings on the person's own calendar. Money is kept in whole cents, so every total is exact.
// A pack has a set number of sessions (size) or is a pass with unlimited visits (size 0) until its last day.
// Each logged session is 'went' (counted), 'missed' (missed but the centre still counts it) or 'off' (cancelled or excused: not counted).
(function (root) {
    'use strict';
    const MAX_PACKS = 60, MAX_USES = 5000, MAX_SIZE = 500, MAX_PEOPLE = 4;
    const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const CURRENCIES = ['', '$', '€', '£', '₹', 'Rs', 'PKR', 'AED', 'SAR', '৳', '₦', 'R', 'KSh', 'RM', 'A$', 'C$'];
    const KINDS = { went: 'Went', missed: 'Missed (still counted)', off: 'Cancelled or excused (not counted)' };
    const COMMON = ['Swimming lessons', 'Gym visits', 'Physio sessions', 'Tuition classes', 'Yoga classes', 'Driving lessons', 'Music lessons', 'Dance classes'];

    // ---- dates
    const pad = n => String(n).padStart(2, '0');
    const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
    function parseDate(v) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v == null ? '' : v));
        if (!m) return null;
        const y = +m[1], mo = +m[2], d = +m[3];
        if (y < 1990 || y > 2200 || mo < 1 || mo > 12 || d < 1 || d > daysIn(y, mo)) return null;
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
    // A pack valid "3 months" from 1 Oct can be used up to and including 31 Dec.
    const lastDayAfter = (start, months) => addDays(addMonths(start, months), -1);
    const diff = (a, b) => dayNum(b) - dayNum(a);                         // days from a to b
    const todayIso = (d = new Date()) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    const dow = iso => { const p = parseDate(iso); return DAYS[new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()]; };
    // "Sun 30 Nov" this year, "Sun 30 Nov 2027" other years
    function shortDate(iso, today) {
        const p = parseDate(iso); if (!p) return '';
        return dow(iso) + ' ' + p.d + ' ' + MONTHS[p.m - 1] + (today && iso.slice(0, 4) === today.slice(0, 4) ? '' : ' ' + p.y);
    }
    const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
    function span(a) { return a < 14 ? plural(a, 'day') : a < 60 ? plural(Math.floor(a / 7), 'week') : a < 730 ? plural(Math.floor(a / 30.44), 'month') : plural(Math.floor(a / 365.25), 'year'); }
    function rel(today, date) {
        const d = diff(today, date);
        if (d === 0) return 'today';
        if (d === 1) return 'tomorrow';
        if (d === -1) return 'yesterday';
        return d > 0 ? 'in ' + span(d) : span(-d) + ' ago';
    }
    // "3 months", "6 weeks", "45 days": how long a pack runs, for the form preview
    function length(start, last) {
        const days = diff(start, last) + 1;
        for (let m = 1; m <= 36; m++) if (lastDayAfter(start, m) === last) return m % 12 === 0 ? plural(m / 12, 'year') : plural(m, 'month');
        return days % 7 === 0 && days <= 70 ? plural(days / 7, 'week') : plural(days, 'day');
    }

    // ---- money (whole cents)
    function parseMoney(v) {
        const s = String(v == null ? '' : v).replace(/[\s,]/g, '');
        if (!s) return { cents: null };
        if (!/^\d+(\.\d{0,2})?$/.test(s) && !/^\.\d{1,2}$/.test(s)) return { error: 'Type the price as a number, like 6000 or 89.50.' };
        const [a, b = ''] = s.split('.'), cents = Number(a || 0) * 100 + Number((b + '00').slice(0, 2));
        if (cents > 1e11) return { error: 'That price is too big. Check the number.' };
        return { cents };
    }
    function money(cents, cur) {
        const neg = cents < 0, c = Math.abs(cents), whole = Math.floor(c / 100), part = c % 100;
        const txt = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (part ? '.' + pad(part) : '');
        return (neg ? '-' : '') + (cur ? cur + (/^[A-Za-z]/.test(cur) || cur.length > 1 ? ' ' : '') : '') + txt;
    }
    // price shared over n sessions, rounded to the nearest cent
    const share = (cents, n) => Math.round(cents / n);

    // ---- one pack
    const usesOf = (state, pack) => state.uses.filter(u => u.pack === pack.id).sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id);
    const counts = u => u.kind === 'went' || u.kind === 'missed';
    // a short name for lists: "Swimming lessons (Ali)", "Gym visits"
    const title = p => p.name + (p.people.length ? ' (' + p.people.join(', ') + ')' : '');

    function stats(state, pack, today) {
        const uses = usesOf(state, pack), counted = uses.filter(counts);
        const used = pack.usedBefore + counted.length;
        const unlimited = pack.size === 0;
        const left = unlimited ? null : Math.max(0, pack.size - used);
        const notStarted = pack.start > today;
        const expired = !!pack.expiry && pack.expiry < today;
        const daysLeft = pack.expiry && !expired ? diff(notStarted ? pack.start : today, pack.expiry) + 1 : null;   // usable days, today included
        const s = { uses, used, went: uses.filter(u => u.kind === 'went').length, missed: uses.filter(u => u.kind === 'missed').length,
            off: uses.filter(u => u.kind === 'off').length, unlimited, left, notStarted, expired, daysLeft,
            usedUp: !unlimited && left === 0, last: counted.length ? counted[counted.length - 1].date : '' };
        s.ended = s.usedUp || expired;
        if (pack.cents != null && pack.cents > 0) {
            if (!unlimited) {
                s.per = share(pack.cents, pack.size);
                s.valueLeft = left === pack.size ? pack.cents : share(pack.cents * left, pack.size);
            } else if (used > 0) s.per = share(pack.cents, used);
        }
        // per person, when two or more share the pack
        if (pack.people.length > 1) s.byPerson = pack.people.map(n => ({ name: n, n: counted.filter(u => u.who === n).length }));
        // pace so far: counted sessions logged in the app since the start (sessions used before the app have no dates)
        // with sessions used before the app, the pace counts from the day the pack was added here
        const from = pack.usedBefore && pack.added > pack.start ? pack.added : pack.start;
        const elapsed = notStarted || from > today ? 0 : diff(from, today) + 1;
        s.elapsed = elapsed;
        if (!s.ended && !notStarted && !unlimited && left > 0 && elapsed >= 14 && counted.length >= 2) {
            if (daysLeft != null) {
                s.projected = Math.floor(counted.length * daysLeft / elapsed);
                if (s.projected < left) s.risk = left - s.projected;
            } else {
                s.lastAround = addDays(today, Math.ceil(left * elapsed / counted.length));
            }
        }
        return s;
    }

    // How often to go to use them all before the last day: "1 every 9 days", "2 a week", "2 to 3 a week", "every day"
    function needPace(left, daysLeft) {
        if (left <= 0 || !daysLeft) return '';
        if (left > daysLeft) return '';
        if (left === daysLeft) return 'every day';
        if (left * 7 <= daysLeft) { const every = Math.floor(daysLeft / left); return every === 7 ? '1 a week' : '1 every ' + every + ' days'; }
        const lo = Math.floor(left * 7 / daysLeft), hi = Math.ceil(left * 7 / daysLeft);
        return lo === hi ? lo + ' a week' : lo + ' to ' + hi + ' a week';
    }

    // The words shown in a pack's box and in "At a glance". cls: ok, soon, low, risk, done, bad, wait
    function status(state, pack, today, cur) {
        const s = stats(state, pack, today), out = { s, lines: [] };
        const ago = d => shortDate(d, today) + ' (' + rel(today, d) + ')';
        if (s.unlimited) {
            out.big = plural(s.used, 'visit') + ' so far';
            if (s.notStarted) { out.cls = 'wait'; out.head = 'Starts ' + ago(pack.start) + '.'; }
            else if (s.expired) { out.cls = 'done'; out.head = 'Pass ended on ' + shortDate(pack.expiry, today) + ' with ' + plural(s.used, 'visit') + '.'; }
            else if (pack.expiry) { out.cls = s.daysLeft <= 7 ? 'soon' : 'ok'; out.head = s.daysLeft === 1 ? 'Last day today.' : 'Valid until ' + ago(pack.expiry) + '.'; }
            else { out.cls = 'ok'; out.head = 'No end date.'; }
            if (s.per != null) out.lines.push(money(pack.cents, cur) + ' paid: ' + money(s.per, cur) + ' per visit so far.');
            out.short = plural(s.used, 'visit') + (s.expired ? ', pass ended' : pack.expiry && !s.notStarted ? ', ' + (s.daysLeft === 1 ? 'last day today' : 'ends ' + rel(today, pack.expiry)) : '');
            return out;
        }
        out.big = s.left + ' of ' + pack.size + ' left';
        if (s.usedUp) {
            out.cls = 'done';
            out.head = 'All ' + pack.size + ' used' + (s.last ? ', the last on ' + shortDate(s.last, today) : '') + '. Time to renew?';
            out.short = 'all ' + pack.size + ' used';
        } else if (s.expired) {
            out.cls = 'bad';
            out.head = 'Expired on ' + shortDate(pack.expiry, today) + ' with ' + plural(s.left, 'session') + ' not used' + (s.valueLeft ? ' (worth ' + money(s.valueLeft, cur) + ')' : '') + '.';
            out.lines.push('Ask the centre if they can extend it. If they do, tap Edit and change "Last day to use it".');
            out.short = 'expired with ' + s.left + ' unused';
        } else if (s.notStarted) {
            out.cls = 'wait';
            out.head = 'Starts ' + ago(pack.start) + '.' + (pack.expiry ? ' Last day ' + shortDate(pack.expiry, today) + '.' : '');
            out.short = 'starts ' + rel(today, pack.start);
        } else {
            const pace = pack.expiry ? needPace(s.left, s.daysLeft) : '';
            if (pack.expiry) {
                out.head = s.daysLeft === 1 ? 'Last day to use it: today.' : 'Last day to use it: ' + ago(pack.expiry) + '.';
                if (s.left > s.daysLeft) {
                    out.cls = 'risk';
                    out.lines.push('Not enough days left: even going every day, ' + plural(s.left - s.daysLeft, 'session') + ' would go to waste. Ask the centre for more time.');
                } else if (s.risk) {
                    out.cls = 'risk';
                    out.lines.push('You have used ' + (s.used - pack.usedBefore) + ' in the last ' + plural(s.elapsed, 'day') + '. At that pace about ' + s.projected + ' more fit before it ends, so ' + plural(s.risk, 'session') + ' could go to waste. Go ' + pace + ' to use them all.');
                } else {
                    out.cls = s.left <= 2 ? 'low' : s.daysLeft <= 7 ? 'soon' : 'ok';
                    out.lines.push('To use them all, go about ' + pace + '.');
                }
            } else {
                out.cls = s.left <= 2 ? 'low' : 'ok';
                out.head = 'No expiry date.';
                if (s.lastAround) out.lines.push('At your pace so far, the last one will be around ' + shortDate(s.lastAround, today) + '.');
            }
            if (s.left <= 2) out.lines.push((s.left === 1 ? 'Only 1 left' : 'Only 2 left') + ': think about renewing.');
            out.short = s.left + ' of ' + pack.size + ' left' + (pack.expiry ? ', ' + (s.daysLeft === 1 ? 'last day today' : 'ends ' + rel(today, pack.expiry)) : '');
        }
        if (s.per != null) out.lines.push(money(pack.cents, cur) + ' for ' + pack.size + ': ' + money(s.per, cur) + ' per session' + (!s.usedUp && s.valueLeft ? ', ' + money(s.valueLeft, cur) + ' still unused.' : '.'));
        return out;
    }

    const RANK = { bad: 0, risk: 1, low: 2, soon: 3, ok: 4, wait: 5, done: 6 };
    function sortPacks(state, packs, today) {
        return packs.map(p => ({ p, st: status(state, p, today, '') }))
            .sort((a, b) => RANK[a.st.cls] - RANK[b.st.cls] || (a.p.expiry || '9999') .localeCompare(b.p.expiry || '9999') || a.p.id - b.p.id)
            .map(x => x.p);
    }
    const live = state => state.packs.filter(p => !p.archived);

    // "At a glance": one line per open pack, the most urgent first, and the money still sitting in packs
    function glance(state, today, cur) {
        const packs = sortPacks(state, live(state), today);
        const rows = packs.map(p => { const st = status(state, p, today, cur); return { id: p.id, cls: st.cls, name: title(p), text: st.short }; });
        let unused = 0, withPrice = 0, risk = 0;
        packs.forEach(p => { const s = stats(state, p, today); if (!s.ended && s.valueLeft) { unused += s.valueLeft; withPrice++; } if (!s.ended && (s.risk || (s.left != null && s.daysLeft != null && s.left > s.daysLeft))) risk++; });
        return { rows, unused, withPrice, risk };
    }

    // ---- the log as text, to show the centre or a partner
    function logText(state, pack, today, cur) {
        const st = status(state, pack, today, cur), s = st.s;
        const L = [title(pack)];
        L.push(s.unlimited ? 'Pass with unlimited visits' + (pack.expiry ? ' from ' + shortDate(pack.start, today) + ' to ' + shortDate(pack.expiry, today) : ' from ' + shortDate(pack.start, today)) + '.'
            : pack.size + '-session pack from ' + shortDate(pack.start, today) + (pack.expiry ? ', last day ' + shortDate(pack.expiry, today) : ', no expiry') + (pack.carried ? ' (includes ' + plural(pack.carried, 'session') + ' carried over)' : '') + '.');
        if (pack.cents) L.push('Paid ' + money(pack.cents, cur) + '.');
        L.push(s.unlimited ? 'Visits so far: ' + s.used + '.' : 'Used ' + s.used + ' of ' + pack.size + ', ' + s.left + ' left.');
        if (s.byPerson) L.push(s.byPerson.map(x => x.name + ' ' + x.n).join(', ') + '.');
        L.push('');
        let n = pack.usedBefore;
        if (pack.usedBefore) L.push('1 to ' + pack.usedBefore + '. Used before this log was started');
        s.uses.forEach(u => {
            const who = u.who && pack.people.length > 1 ? ' (' + u.who + ')' : '', note = u.note ? ': ' + u.note : '';
            if (counts(u)) { n++; L.push(n + '. ' + shortDate(u.date, today) + ' ' + (u.kind === 'went' ? 'went' : 'missed, still counted') + who + note); }
            else L.push('-  ' + shortDate(u.date, today) + ' cancelled or excused, not counted' + who + note);
        });
        if (!s.uses.length && !pack.usedBefore) L.push('No sessions logged yet.');
        if (pack.note) L.push('', 'Note: ' + pack.note);
        return L.join('\n');
    }

    // ---- calendar file: one reminder a week before each open pack's last day
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
    function ics(state, today, url) {
        const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//umar8092 apps//Prepaid Class Pack Tracker//EN', 'CALSCALE:GREGORIAN'];
        const stamp = today.replace(/-/g, '') + 'T000000Z';
        let count = 0;
        live(state).forEach(p => {
            const s = stats(state, p, today);
            if (!p.expiry || s.ended) return;
            let day = addDays(p.expiry, -7); if (day < today) day = today;
            const t = title(p) + ': pack ends ' + shortDate(p.expiry, null);
            L.push('BEGIN:VEVENT', 'UID:classpack-' + p.id + '-' + p.expiry.replace(/-/g, '') + '@umar8092.github.io', 'DTSTAMP:' + stamp,
                'DTSTART;VALUE=DATE:' + day.replace(/-/g, ''), 'DTEND;VALUE=DATE:' + addDays(day, 1).replace(/-/g, ''),
                fold('SUMMARY:' + icsEsc(t)), fold('DESCRIPTION:' + icsEsc('Check how many sessions are left and book them before ' + shortDate(p.expiry, null) + ': ' + url)),
                'BEGIN:VALARM', 'ACTION:DISPLAY', fold('DESCRIPTION:' + icsEsc(t)), 'TRIGGER:PT9H', 'END:VALARM', 'END:VEVENT');
            count++;
        });
        L.push('END:VCALENDAR');
        return { text: L.join('\r\n') + '\r\n', count };
    }

    // ---- forms (return { errors } or the clean value)
    const oneLine = (s, n) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);
    const multi = (s, n) => String(s == null ? '' : s).replace(/\r\n?/g, '\n').trim().slice(0, n);
    function parseCount(v) {
        const s = String(v == null ? '' : v).trim();
        if (!s) return null;
        return /^\d+$/.test(s) ? Number(s) : NaN;
    }
    function splitPeople(v) {
        const out = [];
        String(v == null ? '' : v).split(/[,;\n]+/).map(x => oneLine(x, 30)).filter(Boolean).forEach(n => { if (!out.some(o => o.toLowerCase() === n.toLowerCase())) out.push(n); });
        return out;
    }
    // f: { name, type: 'count'|'pass', size, people, start, expiry, price, note, usedBefore }; old: the pack being edited (null when new); used: sessions already logged for it
    function readPack(f, today, old, loggedCounted, firstLogged) {
        const errors = {};
        const name = oneLine(f.name, 60);
        if (!name) errors.name = 'Type what the pack is for, like Swimming lessons.';
        const pass = f.type === 'pass';
        let size = 0;
        if (!pass) {
            const n = parseCount(f.size);
            if (n === null) errors.size = 'Type how many sessions the pack has.';
            else if (Number.isNaN(n)) errors.size = 'Type a whole number of sessions, like 10.';
            else if (n < 1) errors.size = 'A pack needs at least 1 session.';
            else if (n > MAX_SIZE) errors.size = 'That is more than ' + MAX_SIZE + ' sessions. Check the number.';
            else size = n;
        }
        const people = splitPeople(f.people);
        if (people.length > MAX_PEOPLE) errors.people = 'Up to ' + MAX_PEOPLE + ' people can share one pack. Make a second pack for the others.';
        let start = '';
        if (!isDate(f.start)) errors.start = 'Choose the first day you can use the pack.';
        else start = f.start;
        let expiry = '';
        if (f.expiry) {
            if (!isDate(f.expiry)) errors.expiry = 'Choose the last day you can use it, or tap "No expiry".';
            else if (start && f.expiry < start) errors.expiry = 'The last day cannot be before the first day.';
            else expiry = f.expiry;
        } else if (pass) errors.expiry = 'A pass needs the last day it is valid, like the end of the month.';
        if (start && firstLogged && firstLogged < start) errors.start = 'You logged a session on ' + shortDate(firstLogged, today) + ', before this date. Pick an earlier first day or change that session.';
        const m = parseMoney(f.price);
        if (m.error) errors.price = m.error;
        let usedBefore = 0;
        if (!pass) {
            const u = parseCount(f.usedBefore);
            if (Number.isNaN(u)) errors.usedBefore = 'Type a whole number, like 3.';
            else if (u && size && u + loggedCounted > size) errors.usedBefore = 'With the ' + plural(loggedCounted, 'session') + ' already logged, that is more than the ' + size + ' in the pack.';
            else usedBefore = u || 0;
            if (!errors.size && !errors.usedBefore && size && loggedCounted + usedBefore > size) errors.size = 'You already logged ' + plural(loggedCounted + usedBefore, 'used session') + ', so the pack needs at least ' + (loggedCounted + usedBefore) + '.';
        }
        if (Object.keys(errors).length) return { errors };
        const warn = expiry && expiry < today ? 'This pack has already ended. That is fine for keeping a record.' : '';
        return { pack: { name, people, size, start, expiry, cents: m.cents, note: multi(f.note, 400), usedBefore, carried: old ? old.carried : 0 }, warn };
    }
    // f: { date, kind, who, note }
    function readUse(f, pack, today, s, editing) {
        const errors = {};
        let date = '';
        if (!isDate(f.date)) errors.date = 'Choose the date of the session.';
        else if (f.date > today) errors.date = 'You can only log a session on or before today.';
        else if (f.date < pack.start) errors.date = 'The pack starts on ' + shortDate(pack.start, today) + '. Pick a date on or after it, or change the pack\'s first day with Edit.';
        else date = f.date;
        const kind = KINDS[f.kind] ? f.kind : '';
        if (!kind) errors.kind = 'Choose what happened.';
        let who = '';
        if (pack.people.length > 1) {
            who = pack.people.includes(f.who) ? f.who : '';
            if (!who && kind !== 'off') errors.who = 'Choose who went.';
            if (f.who && !who) errors.who = 'Choose who went.';
        } else if (pack.people.length === 1) who = pack.people[0];
        // a new counted session (or one changed to counted) needs a session left
        const wasCounted = editing && counts(editing);
        if (kind && kind !== 'off' && !wasCounted && !s.unlimited && s.left <= 0) errors.kind = 'All ' + pack.size + ' sessions are already used. Tap Renew for a new pack, or Edit the pack if the centre added sessions.';
        if (Object.keys(errors).length) return { errors };
        let warn = '';
        if (pack.expiry && date > pack.expiry) warn = 'This is after the pack\'s last day (' + shortDate(pack.expiry, today) + '). Fine if the centre extended it.';
        return { use: { date, kind, who, note: oneLine(f.note, 120) }, warn };
    }

    // a new pack that takes over from an old one: same name, people, size and price, the same length, starting today
    function renewal(old, today) {
        let expiry = '';
        if (old.expiry) {
            let m = 0; for (let i = 1; i <= 36; i++) if (lastDayAfter(old.start, i) === old.expiry) { m = i; break; }
            expiry = m ? lastDayAfter(today, m) : addDays(today, diff(old.start, old.expiry));
        }
        return { name: old.name, people: old.people.slice(), size: old.size - old.carried, start: today, expiry, cents: old.cents, note: old.note };
    }

    // ---- saved data
    const emptyState = () => ({ v: 1, nextId: 1, packs: [], uses: [] });
    const okDate = v => typeof v === 'string' && isDate(v) ? v : '';
    const okId = v => Number.isInteger(v) && v > 0 ? v : null;
    const str = (v, n) => typeof v === 'string' ? v.slice(0, n) : '';
    const okInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
    function validate(s) {
        if (!s || typeof s !== 'object' || !Array.isArray(s.packs)) return null;
        const out = emptyState(), all = new Set();
        let ids = new Set();
        s.packs.slice(0, MAX_PACKS).forEach(x => {
            if (!x || typeof x !== 'object' || !okId(x.id) || ids.has(x.id)) return;
            const name = oneLine(str(x.name, 120), 60), start = okDate(x.start);
            const size = okInt(x.size, 0, MAX_SIZE) ? x.size : null;
            if (!name || !start || size === null) return;
            let expiry = okDate(x.expiry); if (expiry && expiry < start) expiry = '';
            if (size === 0 && !expiry) return;
            const people = Array.isArray(x.people) ? splitPeople(x.people.filter(n => typeof n === 'string').join(',')).slice(0, MAX_PEOPLE) : [];
            ids.add(x.id); all.add(x.id);
            out.packs.push({ id: x.id, name, people, size, start, expiry, cents: okInt(x.cents, 0, 1e11) ? x.cents : null, note: str(x.note, 400),
                usedBefore: size && okInt(x.usedBefore, 0, size) ? x.usedBefore : 0, carried: size && okInt(x.carried, 0, size) ? x.carried : 0,
                archived: okDate(x.archived), added: okDate(x.added) });
        });
        const packs = new Map(out.packs.map(p => [p.id, p]));
        ids = new Set();
        const used = new Map();
        (Array.isArray(s.uses) ? s.uses : []).slice(0, MAX_USES).forEach(x => {
            if (!x || typeof x !== 'object' || !okId(x.id) || ids.has(x.id) || !packs.has(x.pack) || !okDate(x.date) || !KINDS[x.kind]) return;
            const p = packs.get(x.pack);
            if (x.date < p.start) return;
            if (x.kind !== 'off' && p.size) {                       // never more counted sessions than the pack holds
                const n = (used.get(p.id) || 0) + 1;
                if (n + p.usedBefore > p.size) return;
                used.set(p.id, n);
            }
            ids.add(x.id); all.add(x.id);
            out.uses.push({ id: x.id, pack: x.pack, date: x.date, kind: x.kind, who: p.people.includes(x.who) ? x.who : '', note: oneLine(str(x.note, 200), 120) });
        });
        out.nextId = Math.max(Number.isInteger(s.nextId) ? s.nextId : 1, Math.max(0, ...all) + 1);
        return out;
    }

    const api = { MAX_PACKS, MAX_SIZE, MAX_PEOPLE, KINDS, COMMON, CURRENCIES, parseDate, isDate, addDays, addMonths, lastDayAfter, diff, todayIso, shortDate, rel, span, plural, length,
        parseMoney, money, share, usesOf, counts, title, stats, needPace, status, sortPacks, live, glance, logText, ics, splitPeople, readPack, readUse, renewal, emptyState, validate };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PackCore = api;
})(this);
