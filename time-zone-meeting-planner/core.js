// Time Zone Meeting Planner: the maths, with no page code. Times are minutes since local midnight.
// Works in the browser (MeetCore) and in node (module.exports). Time zones come from the built-in Intl database, so it works offline.
(function (root) {
    const MIN = 60000;
    const ALIASES = {
        'New York': 'America/New_York', 'Boston': 'America/New_York', 'Washington': 'America/New_York', 'Miami': 'America/New_York', 'Atlanta': 'America/New_York',
        'Toronto': 'America/Toronto', 'Chicago': 'America/Chicago', 'Houston': 'America/Chicago', 'Dallas': 'America/Chicago', 'Mexico City': 'America/Mexico_City',
        'Denver': 'America/Denver', 'Phoenix': 'America/Phoenix', 'Los Angeles': 'America/Los_Angeles', 'San Francisco': 'America/Los_Angeles', 'Seattle': 'America/Los_Angeles',
        'Vancouver': 'America/Vancouver', 'Anchorage': 'America/Anchorage', 'Honolulu': 'Pacific/Honolulu', 'Sao Paulo': 'America/Sao_Paulo', 'Buenos Aires': 'America/Argentina/Buenos_Aires',
        'London': 'Europe/London', 'Dublin': 'Europe/Dublin', 'Lisbon': 'Europe/Lisbon', 'Paris': 'Europe/Paris', 'Berlin': 'Europe/Berlin', 'Madrid': 'Europe/Madrid', 'Rome': 'Europe/Rome',
        'Amsterdam': 'Europe/Amsterdam', 'Brussels': 'Europe/Brussels', 'Zurich': 'Europe/Zurich', 'Stockholm': 'Europe/Stockholm', 'Warsaw': 'Europe/Warsaw', 'Athens': 'Europe/Athens',
        'Istanbul': 'Europe/Istanbul', 'Moscow': 'Europe/Moscow', 'Kyiv': 'Europe/Kyiv', 'Cairo': 'Africa/Cairo', 'Lagos': 'Africa/Lagos', 'Nairobi': 'Africa/Nairobi', 'Johannesburg': 'Africa/Johannesburg',
        'Dubai': 'Asia/Dubai', 'Riyadh': 'Asia/Riyadh', 'Tehran': 'Asia/Tehran', 'Karachi': 'Asia/Karachi', 'Lahore': 'Asia/Karachi', 'Islamabad': 'Asia/Karachi',
        'Delhi': 'Asia/Kolkata', 'Mumbai': 'Asia/Kolkata', 'Bangalore': 'Asia/Kolkata', 'Kolkata': 'Asia/Kolkata', 'Chennai': 'Asia/Kolkata', 'Hyderabad': 'Asia/Kolkata', 'Pune': 'Asia/Kolkata',
        'Kathmandu': 'Asia/Kathmandu', 'Dhaka': 'Asia/Dhaka', 'Bangkok': 'Asia/Bangkok', 'Jakarta': 'Asia/Jakarta', 'Singapore': 'Asia/Singapore', 'Kuala Lumpur': 'Asia/Kuala_Lumpur',
        'Manila': 'Asia/Manila', 'Hong Kong': 'Asia/Hong_Kong', 'Shanghai': 'Asia/Shanghai', 'Beijing': 'Asia/Shanghai', 'Taipei': 'Asia/Taipei', 'Seoul': 'Asia/Seoul', 'Tokyo': 'Asia/Tokyo',
        'Sydney': 'Australia/Sydney', 'Melbourne': 'Australia/Melbourne', 'Perth': 'Australia/Perth', 'Auckland': 'Pacific/Auckland'
    };
    // Working hours people can pick for themselves. A shift that ends before it starts runs past midnight (night shift).
    const PRESETS = {
        office: { label: 'Office hours', s: 540, e: 1020 }, early: { label: 'Early shift', s: 360, e: 840 }, evening: { label: 'Evening shift', s: 840, e: 1320 },
        night: { label: 'Night shift', s: 1320, e: 360 }, any: { label: 'Any time', s: 0, e: 1440 }
    };
    const rawOf = h => { const p = h && h.k !== 'custom' && PRESETS[h.k] ? PRESETS[h.k] : (h && h.k === 'custom' ? h : PRESETS.office); return { s: +p.s, e: +p.e }; };
    // {k:'office'|...|'custom', s, e} -> the window the planner uses. A window that crosses midnight gets an end past 1440.
    // A full 24 hours is continuous (a meeting may cross midnight), so it is made long enough that nothing falls outside it.
    function windowOf(h) {
        const { s, e } = rawOf(h);
        let end = e > s ? e : e + 1440;
        if (end - s >= 1440) end = s + 2880;
        return { start: s, end };
    }
    const MAX_MEETING = 180;   // minutes
    const lenWords = d => ({ 60: '1-hour', 120: '2-hour', 180: '3-hour' }[d] || d + '-minute');
    const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const fmtCache = {};

    function formatter(tz) {
        return fmtCache[tz] || (fmtCache[tz] = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }));
    }
    function validZone(tz) { try { formatter(tz); return true; } catch (e) { return false; } }
    function parts(tz, utc) {
        const o = {};
        formatter(tz).formatToParts(new Date(utc)).forEach(p => { o[p.type] = p.value; });
        return { y: +o.year, mo: +o.month, d: +o.day, h: +o.hour % 24, mi: +o.minute };
    }
    // Minutes the zone is ahead of UTC at that moment (daylight saving included).
    function offsetMinutes(tz, utc) {
        const p = parts(tz, utc);
        return Math.round((Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi) - Math.floor(utc / MIN) * MIN) / MIN);
    }
    // The local date and time of day in a zone at a moment.
    function local(tz, utc) {
        const p = parts(tz, utc);
        const dayNo = Math.round(Date.UTC(p.y, p.mo - 1, p.d) / 86400000);
        return { minutes: p.h * 60 + p.mi, dayNo, dow: new Date(dayNo * 86400000).getUTCDay() };
    }
    // The moment (UTC milliseconds) when the clock in a zone shows this date and minute of day.
    function zonedToUtc(tz, dateStr, minutes) {
        const [y, m, d] = dateStr.split('-').map(Number);
        const guess = Date.UTC(y, m - 1, d, 0, minutes);
        const o1 = offsetMinutes(tz, guess);
        let utc = guess - o1 * MIN;
        const o2 = offsetMinutes(tz, utc);
        if (o2 !== o1) utc = guess - o2 * MIN;
        return utc;
    }
    function dayNoOf(dateStr) { const [y, m, d] = dateStr.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 86400000); }

    // Minutes of the meeting [s, s+dur] that fall outside the working hours [ws, we] of one person (0 = fully inside).
    function outsideMinutes(s, dur, ws, we) {
        let best = 0;
        for (const sh of [-1440, 0, 1440]) {
            const a = Math.max(s + sh, ws), b = Math.min(s + sh + dur, we);
            best = Math.max(best, Math.max(0, b - a));
        }
        return dur - best;
    }
    // How far inside the working hours the meeting sits (smaller of the gap before and after), for a meeting that fits.
    function comfort(s, dur, ws, we) {
        let best = -1;
        for (const sh of [-1440, 0, 1440]) {
            if (s + sh >= ws && s + sh + dur <= we) best = Math.max(best, Math.min(s + sh - ws, we - (s + sh + dur)));
        }
        return best;
    }

    // people: [{tz, start, end}] (working hours in minutes), date: 'YYYY-MM-DD' in the first person's zone, duration in minutes.
    function plan(people, date, duration, step) {
        step = step || 30;
        const home = people[0].tz;
        const t0 = zonedToUtc(home, date, 0);
        const cands = [];
        for (let i = 0; i < 1440 / step; i++) {
            const utc = t0 + i * step * MIN;
            const outside = people.map(p => outsideMinutes(local(p.tz, utc).minutes, duration, p.start, p.end));
            const ok = outside.every(x => x === 0);
            const c = ok ? Math.min.apply(null, people.map(p => comfort(local(p.tz, utc).minutes, duration, p.start, p.end))) : -1;
            cands.push({ utc, ok, comfort: c, outside, total: outside.reduce((a, b) => a + b, 0), count: outside.filter(x => x > 0).length, worst: Math.max.apply(null, outside) });
        }
        const valid = cands.filter(c => c.ok);
        let best = null, fallback = null;
        valid.forEach(c => { if (!best || c.comfort > best.comfort) best = c; });
        if (!best) cands.forEach(c => {
            if (!fallback || c.total < fallback.total || (c.total === fallback.total && c.count < fallback.count)) fallback = c;
        });
        const ranges = [];
        valid.forEach(c => {
            const last = ranges[ranges.length - 1];
            if (last && c.utc - last.to === step * MIN) last.to = c.utc; else ranges.push({ from: c.utc, to: c.utc });
        });
        return { cands, valid, best, fallback, ranges, step };
    }

    // How one person sees a meeting starting at utc.
    function view(person, utc, duration, homeDayNo) {
        const l = local(person.tz, utc), e = local(person.tz, utc + duration * MIN);
        return { from: l.minutes, to: e.minutes, dow: l.dow, dayDiff: l.dayNo - homeDayNo, outside: outsideMinutes(l.minutes, duration, person.start, person.end) };
    }

    function fmtTime(min, h12) {
        min = ((Math.round(min) % 1440) + 1440) % 1440;
        const h = Math.floor(min / 60), m = min % 60, mm = String(m).padStart(2, '0');
        if (!h12) return String(h).padStart(2, '0') + ':' + mm;
        return ((h % 12) || 12) + ':' + mm + ' ' + (h < 12 ? 'am' : 'pm');
    }
    function fmtLen(min) {
        const h = Math.floor(min / 60), m = min % 60;
        return (h ? h + ' h' : '') + (h && m ? ' ' : '') + (m ? m + ' min' : '');
    }
    // "09:00 - 17:00", "22:00 - 06:00 (next day)" for a shift that runs past midnight, "(24 hours)" when start equals end
    function hoursText(h, h12) {
        const { s, e } = rawOf(h);
        return fmtTime(s, h12) + ' \u2013 ' + (e === 1440 ? (h12 ? '12:00 am' : '24:00') : fmtTime(e, h12)) + (e < s ? ' (next day)' : e === s ? ' (24 hours)' : '');
    }
    function dayText(v) { return DAYS[v.dow] + (v.dayDiff === 1 ? ' (next day)' : v.dayDiff === -1 ? ' (previous day)' : v.dayDiff > 1 ? ' (+' + v.dayDiff + ' days)' : v.dayDiff < -1 ? ' (' + v.dayDiff + ' days)' : ''); }

    // ---- cities ----
    function cityOfZone(tz) { return tz.split('/').pop().replace(/_/g, ' '); }
    function allZones() {
        try { if (Intl.supportedValuesOf) return Intl.supportedValuesOf('timeZone'); } catch (e) { /* fall through */ }
        return Object.keys(ALIASES).map(k => ALIASES[k]);
    }
    function cityNames() {
        const names = Object.keys(ALIASES), seen = {};
        names.forEach(n => { seen[n.toLowerCase()] = 1; });
        allZones().forEach(z => { const c = cityOfZone(z); if (!seen[c.toLowerCase()] && z.indexOf('/') > 0 && !/^(Etc|SystemV)/.test(z)) { seen[c.toLowerCase()] = 1; names.push(c); } });
        return names.sort();
    }
    // Finds the time zone for what the user typed: a city name, or a zone like "Europe/London". Returns {tz, label} or null.
    function findCity(text) {
        const t = String(text || '').trim().replace(/\s+/g, ' ');
        if (!t) return null;
        const lc = t.toLowerCase();
        for (const k of Object.keys(ALIASES)) if (k.toLowerCase() === lc) return { tz: ALIASES[k], label: k };
        const zones = allZones().filter(z => z.indexOf('/') > 0);
        const exact = zones.find(z => z.toLowerCase() === lc.replace(/ /g, '_'));
        if (exact) return { tz: exact, label: cityOfZone(exact) };
        const byCity = zones.filter(z => cityOfZone(z).toLowerCase() === lc);
        if (byCity.length === 1) return { tz: byCity[0], label: cityOfZone(byCity[0]) };
        return null;
    }
    function utcOffsetText(tz, utc) {
        const o = offsetMinutes(tz, utc), a = Math.abs(o);
        return 'UTC' + (o < 0 ? '-' : '+') + Math.floor(a / 60) + (a % 60 ? ':' + String(a % 60).padStart(2, '0') : '');
    }

    // ---- sharing ----
    function pad(n) { return String(n).padStart(2, '0'); }
    function icsStamp(utc) { const d = new Date(utc); return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + 'T' + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + '00Z'; }
    function icsEscape(s) { return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
    function buildIcs(utc, duration, description, now) {
        return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Time Zone Meeting Planner//EN', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
            'UID:' + icsStamp(utc) + '-time-zone-meeting-planner@umar8092.github.io', 'DTSTAMP:' + icsStamp(now || utc),
            'DTSTART:' + icsStamp(utc), 'DTEND:' + icsStamp(utc + duration * MIN), 'SUMMARY:Meeting',
            'DESCRIPTION:' + icsEscape(description), 'END:VEVENT', 'END:VCALENDAR'].join('\r\n') + '\r\n';
    }

    const api = { hoursText, ALIASES, PRESETS, MAX_MEETING, windowOf, lenWords, DAYS, validZone, offsetMinutes, local, zonedToUtc, dayNoOf, outsideMinutes, comfort, plan, view,
        fmtTime, fmtLen, dayText, cityOfZone, cityNames, findCity, utcOffsetText, buildIcs, icsStamp };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.MeetCore = api;
})(typeof self !== 'undefined' ? self : this);
