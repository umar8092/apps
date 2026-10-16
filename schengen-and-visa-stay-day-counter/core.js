// Schengen and Visa Stay Day Counter: the logic, no page code.
// Dates are 'YYYY-MM-DD' strings on the person's own calendar (no time zones involved).
// The rule "N days in any M days": on every day you are inside, the days you were inside during the M days ending
// that day (that day included) must be N or fewer. Entry and exit days both count as days inside.
(function (root) {
    'use strict';
    const SLUG = 'schengen-and-visa-stay-day-counter';
    const MAX_TRIPS = 500, MAX_COUNTERS = 20, MAX_TRIP_DAYS = 1096, MAX_N = 366, MAX_M = 1096;
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
    const diff = (a, b) => dayNum(b) - dayNum(a);
    const todayIso = (d = new Date()) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    // "Fri 16 Oct 2026"
    function longDate(iso) {
        const p = parseDate(iso); if (!p) return '';
        return DAYS[new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()] + ' ' + p.d + ' ' + MONTHS[p.m - 1] + ' ' + p.y;
    }
    // "1 Jun" in the same year as `year`, otherwise "1 Jun 2025"
    function shortDate(iso, year) {
        const p = parseDate(iso); if (!p) return '';
        return p.d + ' ' + MONTHS[p.m - 1] + (year && String(p.y) === String(year) ? '' : ' ' + p.y);
    }
    const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
    // "1 Jun to 20 Jun 2026", "28 Dec 2025 to 3 Jan 2026"
    function rangeText(a, b) {
        if (!b) return 'Since ' + longDate(a);
        return shortDate(a, a.slice(0, 4) === b.slice(0, 4) ? b.slice(0, 4) : null) + ' to ' + shortDate(b);
    }

    // ---- presence
    const tripLen = t => t.exit ? diff(t.entry, t.exit) + 1 : null;
    // Last day a trip is counted: its exit, or today for a trip that is still going on (no exit yet).
    const tripEnd = (t, today) => t.exit || (t.entry <= today ? today : t.entry);
    // Set of day numbers spent inside. Days shared by overlapping trips count once.
    function daySet(trips, today, skipId) {
        const s = new Set();
        trips.forEach(t => {
            if (t.id === skipId) return;
            if (!t.exit && t.entry > today) return;
            for (let d = dayNum(t.entry), e = dayNum(tripEnd(t, today)); d <= e; d++) s.add(d);
        });
        return s;
    }
    // Days inside during the m days ending on day d (d included).
    function usedOn(set, d, m) { let c = 0; for (let x = d - m + 1; x <= d; x++) if (set.has(x)) c++; return c; }
    // How many days in a row, starting on day `start`, you can be inside without breaking the rule (0 to n).
    // Adding a day raises the count of every window that holds it, so every day inside in [x, x+m-1] is re-checked:
    // this also catches a later planned trip that the new days would push over the limit.
    function maxStay(set, start, n, m) {
        const lo = start - m, hi = start + n + 2 * m, size = hi - lo + 1;
        const pres = new Uint8Array(size), cnt = new Int32Array(size);
        set.forEach(d => { if (d >= lo && d <= hi) pres[d - lo] = 1; });
        let run = 0;
        for (let i = 0; i < size; i++) { run += pres[i]; if (i >= m) run -= pres[i - m]; cnt[i] = run; }
        let len = 0;
        // n days in a row fill a whole window, so nobody can stay longer than n days
        for (let k = 0; k < n; k++) {
            const x = start + k - lo;
            if (pres[x]) { if (cnt[x] > n) break; len++; continue; }   // already inside that day (another trip)
            let ok = cnt[x] + 1 <= n;
            for (let i = x + 1; ok && i < x + m && i < size; i++) if (pres[i] && cnt[i] + 1 > n) ok = false;
            if (!ok) break;
            pres[x] = 1; for (let i = x; i < x + m && i < size; i++) cnt[i]++;
            len++;
        }
        return len;
    }
    // First day inside on which the rule is broken, or null.
    function firstOver(set, n, m) {
        const days = [...set].sort((a, b) => a - b);
        let j = 0;
        for (let i = 0; i < days.length; i++) {
            while (days[j] < days[i] - m + 1) j++;
            if (i - j + 1 > n) return days[i];
        }
        return null;
    }
    // Earliest day on or after `from` when a full n-day stay is possible. Quick test first: the days in
    // [E+n-m, E-1] and [E+n, E+m-1] share a window with the whole stay, so there must be none.
    function fullFrom(set, from, n, m) {
        const days = [...set].sort((a, b) => a - b), last = days.length ? days[days.length - 1] : from;
        const lo = from - m, hi = last + 2 * m + n, pre = new Int32Array(hi - lo + 2);
        days.forEach(d => { if (d >= lo && d <= hi) pre[d - lo + 1]++; });
        for (let i = 1; i < pre.length; i++) pre[i] += pre[i - 1];
        const count = (a, b) => { a = Math.max(a, lo); b = Math.min(b, hi); return b < a ? 0 : pre[b - lo + 1] - pre[a - lo]; };
        for (let e = from; e <= last + m + 1; e++) {
            if (count(e + n - m, e - 1) || count(e + n, e + m - 1)) continue;
            if (maxStay(set, e, n, m) >= n) return e;
        }
        return Math.max(from, last + m + 1);
    }
    // Earliest day on or after `from` when you may enter at all (at least 1 day).
    function canEnterFrom(set, from, n, m) {
        let last = from; set.forEach(d => { if (d > last) last = d; });
        for (let e = from; e <= last + m + 1; e++) if (!set.has(e) && maxStay(set, e, n, m) >= 1) return e;
        return last + m + 1;
    }

    // ---- the answers
    // Where you stand today for one counter (a rule plus its trips).
    function status(c, today) {
        const n = c.n, m = c.m, t = dayNum(today);
        const pastSet = daySet(c.trips.filter(x => x.entry <= today), today);
        const all = daySet(c.trips, today);
        const used = usedOn(pastSet, t, m);
        const res = { used, left: Math.max(0, n - used), over: used > n, n, m, today };
        // the next day an old day drops out of the window
        let firstIn = null; for (let d = t - m + 1; d <= t; d++) if (pastSet.has(d)) { firstIn = d; break; }
        const inside = c.trips.find(x => x.entry <= today && (!x.exit || x.exit >= today));
        if (inside) {
            const others = daySet(c.trips, today, inside.id);
            const len = maxStay(others, dayNum(inside.entry), n, m);
            res.inside = inside;
            res.leaveBy = len ? addDays(inside.entry, len - 1) : null;
            res.overSince = res.leaveBy ? (res.leaveBy < today ? addDays(res.leaveBy, 1) : null) : inside.entry;
            if (inside.exit) {
                res.exitOk = !!res.leaveBy && inside.exit <= res.leaveBy;
                res.full = fromNum(fullFrom(all, dayNum(inside.exit) + 1, n, m));
            }
        } else {
            const len = maxStay(all, t, n, m);
            res.stayToday = len;
            res.stayUntil = len ? addDays(today, len - 1) : null;
            res.enterFrom = len ? today : fromNum(canEnterFrom(all, t, n, m));
            res.full = fromNum(fullFrom(all, t, n, m));
            if (firstIn !== null && used > 0) res.backOn = fromNum(firstIn + m);
        }
        const ov = firstOver(all, n, m);
        res.overDay = ov === null ? null : fromNum(ov);
        res.overCount = ov === null ? 0 : usedOn(all, ov, m);
        return res;
    }
    // Planning a trip: enter on `entry`, optionally leave on `exit`.
    function plan(c, today, entry, exit) {
        const n = c.n, m = c.m;
        if (!isDate(entry)) return { error: 'Choose the day you will enter.' };
        if (entry < today) return { error: 'Choose today or a later day. Add past trips under "Add a trip".' };
        if (exit != null && exit !== '' && !isDate(exit)) return { error: 'The leaving day is not a real date.' };
        if (exit && exit < entry) return { error: 'The leaving day is before the day you enter.' };
        if (exit && diff(entry, exit) + 1 > MAX_TRIP_DAYS) return { error: 'That trip is longer than 3 years. Check the dates.' };
        const clash = c.trips.find(x => x.entry <= (exit || entry) && tripEnd(x, today) >= entry && (x.exit || x.entry <= today));
        if (clash) return { error: 'You already have a trip on those days (' + rangeText(clash.entry, clash.exit) + '). Edit that trip instead.' };
        const set = daySet(c.trips, today), e = dayNum(entry);
        const len = maxStay(set, e, n, m);
        const ongoing = c.trips.some(x => !x.exit && x.entry <= today);
        const r = { entry, exit: exit || null, len, ongoing, n, m };
        r.usedBefore = usedOn(set, e - 1, m - 1);   // days inside in the window that ends on the entry day, before it
        if (!len) { r.blocked = true; r.enterFrom = fromNum(canEnterFrom(set, e, n, m)); return r; }
        r.lastDay = addDays(entry, len - 1);
        if (exit) {
            r.tripDays = diff(entry, exit) + 1;
            r.ok = exit <= r.lastDay;
            if (r.ok) {
                const s2 = new Set(set); for (let d = e; d <= dayNum(exit); d++) s2.add(d);
                r.usedAtExit = usedOn(s2, dayNum(exit), m);
            } else r.overOn = addDays(r.lastDay, 1);
        }
        return r;
    }
    // Facts for one trip in the list.
    function tripInfo(c, trip, today) {
        const n = c.n, m = c.m, t = dayNum(today);
        const kind = trip.entry > today ? 'planned' : (!trip.exit ? 'ongoing' : (trip.exit >= today ? 'inside' : 'past'));
        const end = tripEnd(trip, today), info = { kind, days: diff(trip.entry, end) + 1 };
        if (kind === 'past') {
            let inWin = 0; for (let d = Math.max(dayNum(trip.entry), t - m + 1); d <= dayNum(trip.exit); d++) inWin++;
            info.counting = inWin;
            info.goneOn = addDays(trip.exit, m);   // from this day none of its days count
        }
        const others = daySet(c.trips, today, trip.id), all = daySet(c.trips, today);
        const own = new Set(); for (let d = dayNum(trip.entry); d <= dayNum(end); d++) own.add(d);
        // first day of this trip on which the rule is broken (with all trips counted)
        const days = [...own].sort((a, b) => a - b);
        for (const d of days) { if (usedOn(all, d, m) > n) { info.overOn = fromNum(d); break; } }
        if (info.overOn) {
            const len = maxStay(others, dayNum(trip.entry), n, m);
            info.leaveBy = len ? addDays(trip.entry, len - 1) : null;
        }
        info.overlap = [...own].some(d => others.has(d));
        return info;
    }

    // ---- state
    const newId = p => p + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
    const defaultCounter = () => ({ id: newId('c'), name: 'Schengen area', n: 90, m: 180, trips: [] });
    function emptyState() { const c = defaultCounter(); return { v: 1, counters: [c], cur: c.id }; }
    const cleanText = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
    function ruleError(n, m) {
        if (!Number.isInteger(n) || n < 1 || n > MAX_N) return 'Days allowed must be a whole number from 1 to ' + MAX_N + '.';
        if (!Number.isInteger(m) || m < 2 || m > MAX_M) return 'The period must be a whole number of days from 2 to ' + MAX_M + '.';
        if (n >= m) return 'Days allowed must be fewer than the days in the period.';
        return '';
    }
    function validTrip(t) {
        if (!t || typeof t !== 'object' || !isDate(t.entry)) return null;
        const exit = t.exit == null || t.exit === '' ? null : t.exit;
        if (exit !== null && (!isDate(exit) || exit < t.entry || diff(t.entry, exit) + 1 > MAX_TRIP_DAYS)) return null;
        return { id: typeof t.id === 'string' && t.id ? t.id.slice(0, 40) : newId('t'), entry: t.entry, exit, note: cleanText(t.note, 80) };
    }
    function validate(s) {
        if (!s || typeof s !== 'object' || !Array.isArray(s.counters)) return null;
        const ids = new Set(), counters = [];
        s.counters.slice(0, MAX_COUNTERS).forEach(c => {
            if (!c || typeof c !== 'object') return;
            const n = Number(c.n), m = Number(c.m);
            if (ruleError(n, m)) return;
            const trips = [], tids = new Set();
            (Array.isArray(c.trips) ? c.trips : []).slice(0, MAX_TRIPS).forEach(t => { const v = validTrip(t); if (v && !tids.has(v.id)) { tids.add(v.id); trips.push(v); } });
            let id = typeof c.id === 'string' && c.id ? c.id.slice(0, 40) : newId('c'); if (ids.has(id)) id = newId('c'); ids.add(id);
            counters.push({ id, name: cleanText(c.name, 40) || 'My trips', n, m, trips });
        });
        if (!counters.length) return null;
        return { v: 1, counters, cur: counters.some(c => c.id === s.cur) ? s.cur : counters[0].id };
    }
    // Reads the trip form. Returns { trip } or { errors: { field: message } }.
    function readTrip(f, c, today, editingId) {
        const errors = {};
        const entry = String(f.entry || '').trim(), still = !!f.still, exit = still ? null : String(f.exit || '').trim();
        if (!entry) errors.entry = 'Choose the day you entered.';
        else if (!isDate(entry)) errors.entry = 'That is not a real date.';
        if (!still) {
            if (!exit) errors.exit = 'Choose the day you left, or tick "I am still there".';
            else if (!isDate(exit)) errors.exit = 'That is not a real date.';
            else if (isDate(entry) && exit < entry) errors.exit = 'The day you left is before the day you entered.';
            else if (isDate(entry) && diff(entry, exit) + 1 > MAX_TRIP_DAYS) errors.exit = 'That trip is longer than 3 years. Check the dates.';
        } else if (isDate(entry) && entry > today) errors.entry = 'You cannot be there now on a trip that starts later. Untick "I am still there" and add the leaving day.';
        else if (c.trips.some(x => !x.exit && x.id !== editingId)) errors.still = 'Another trip has no leaving day yet. Add its leaving day first.';
        if (Object.keys(errors).length) return { errors };
        if (!editingId && c.trips.length >= MAX_TRIPS) return { errors: { entry: 'This list is full (' + MAX_TRIPS + ' trips). Delete old trips first.' } };
        return { trip: { id: editingId || newId('t'), entry, exit, note: cleanText(f.note, 80) } };
    }
    // Newest first: trips still going on, then by entry day.
    const sortTrips = trips => trips.slice().sort((a, b) => (a.entry < b.entry ? 1 : a.entry > b.entry ? -1 : 0));
    const ruleText = c => c.n + ' days in any ' + c.m + ' days';

    // ---- sharing
    function summaryText(c, today) {
        const s = status(c, today), L = [];
        L.push(c.name + ' (' + ruleText(c) + ')');
        L.push('On ' + longDate(today) + ': ' + s.used + ' of ' + c.n + ' days used, ' + s.left + ' left.');
        if (s.inside) {
            L.push('Inside now since ' + longDate(s.inside.entry) + '.');
            L.push(s.leaveBy ? 'Last day you can stay: ' + longDate(s.leaveBy) + '.' : 'Over the limit since the day of entry.');
        } else if (s.stayUntil) L.push('Entering today, you could stay until ' + longDate(s.stayUntil) + ' (' + plural(s.stayToday, 'day') + ').');
        else L.push('You cannot enter today. Earliest entry: ' + longDate(s.enterFrom) + '.');
        if (s.full) L.push('Full ' + c.n + ' days available again from ' + longDate(s.full) + '.');
        if (s.overDay) L.push('Warning: the limit is broken on ' + longDate(s.overDay) + '.');
        L.push('');
        L.push('Trips (entry and exit days both count):');
        if (!c.trips.length) L.push('- none yet');
        sortTrips(c.trips).forEach(t => {
            const i = tripInfo(c, t, today);
            L.push('- ' + (t.exit ? longDate(t.entry) + ' to ' + longDate(t.exit) : longDate(t.entry) + ' to now') + ', ' + plural(i.days, 'day')
                + (i.kind === 'planned' ? ' (planned)' : '') + (t.note ? ', ' + t.note : ''));
        });
        L.push('');
        L.push('Worked out with Schengen and Visa Stay Day Counter: https://umar8092.github.io/apps/' + SLUG + '/');
        L.push('Not legal advice. The border officer\'s count is the one that matters.');
        return L.join('\n');
    }
    // A calendar file with one all-day event.
    function icsEvent(date, title, desc, now) {
        const esc = s => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
        const d = date.replace(/-/g, ''), d2 = addDays(date, 1).replace(/-/g, '');
        const stamp = (now || new Date()).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
        return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//umar8092//' + SLUG + '//EN', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
            'UID:' + SLUG + '-' + d + '@umar8092.github.io', 'DTSTAMP:' + stamp, 'DTSTART;VALUE=DATE:' + d, 'DTEND;VALUE=DATE:' + d2,
            'SUMMARY:' + esc(title), 'DESCRIPTION:' + esc(desc),
            'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc(title), 'TRIGGER:-P7D', 'END:VALARM',
            'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc(title), 'TRIGGER:-P1D', 'END:VALARM',
            'END:VEVENT', 'END:VCALENDAR'].join('\r\n') + '\r\n';
    }

    const api = { SLUG, MAX_TRIPS, MAX_COUNTERS, MAX_N, MAX_M, parseDate, isDate, dayNum, fromNum, addDays, diff, todayIso, longDate, shortDate, rangeText, plural,
        tripLen, daySet, usedOn, maxStay, firstOver, fullFrom, canEnterFrom, status, plan, tripInfo,
        newId, defaultCounter, emptyState, validate, validTrip, readTrip, ruleError, sortTrips, ruleText, cleanText, summaryText, icsEvent };
    if (typeof module === 'object' && module.exports) module.exports = api; else root.StayCore = api;
})(typeof window !== 'undefined' ? window : this);
