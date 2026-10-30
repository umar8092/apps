// Bus and Train Timetable for My Stops: the rules, with no page code (used by script.js and tests.js).
// Times are whole minutes from the start of a service day. 24:15 (1455) means 00:15 after midnight,
// still belonging to the day before, like the last buses on a printed timetable.
(function (root) {
    'use strict';
    const DAY = 1440, MAX = DAY + 359;            // up to 29:59, the morning after
    const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const DAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const WEEK = [1, 2, 3, 4, 5, 6, 0];           // Monday first

    const pad = n => (n < 10 ? '0' : '') + n;
    function hhmm(min) { const m = ((min % DAY) + DAY) % DAY; return pad(Math.floor(m / 60)) + ':' + pad(m % 60); }
    function hhmm24(min) { return pad(Math.floor(min / 60)) + ':' + pad(min % 60); }   // keeps 24:15 as is
    function dateStr(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
    function parseDate(s) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); if (!m) return null;
        const d = new Date(+m[1], +m[2] - 1, +m[3]);
        return d.getMonth() === +m[2] - 1 && d.getDate() === +m[3] ? d : null;
    }
    function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }

    // One time a person typed: 7:15, 07.15, 19:05, 7:15pm, 7pm, 24:15. Returns minutes or null.
    function hm(h, m, ap) {
        if (m > 59) return null;
        if (ap) {
            if (h < 1 || h > 12) return null;
            h = h % 12 + (/^p/i.test(ap) ? 12 : 0);
        }
        const t = h * 60 + m;
        return t > MAX ? null : t;
    }

    // Reads every time out of typed or pasted text (a column from a timetable, a message, a photo's text).
    // Words such as "Bus 42" or "Fridays only" are skipped; impossible times such as 25:70 are reported.
    // A time that drops from the evening into the early morning (23:40 then 00:15) belongs to the night before.
    function parseTimes(text) {
        const src = String(text == null ? '' : text).slice(0, 20000);
        const out = { times: [], bad: [], skipped: 0, afterMidnight: 0 };
        const hasSep = /\d[:.h]\d{2}/i.test(src);
        const re = /(\d{1,2})\s*[:.h]\s*(\d{2})(?![\d.:\/])\s*([ap]\.?\s?m\.?|[ap](?![a-z]))?|\b(\d{3,4})\b\s*([ap]\.?\s?m\.?)?|\b(\d{1,2})\s*([ap]\.?\s?m\.?)(?![a-z])/gi;
        let m, prev = -1; const found = [];
        const dateLike = /\d{1,2}[.\/-]\d{1,2}[.\/-]\d{2,4}/g;
        const clean = src.replace(dateLike, ' ');                // 12.11.2026 is a date, not 12:11
        while ((m = re.exec(clean))) {
            let t = null, raw = m[0].trim();
            if (m[1] != null) t = hm(+m[1], +m[2], m[3]);
            else if (m[4] != null) {
                if (hasSep && !m[5]) continue;                    // 4 digits next to 07:15-style times: a year or a route number
                const s = m[4]; t = hm(+s.slice(0, s.length - 2), +s.slice(-2), m[5]);
            } else if (m[6] != null) t = hm(+m[6], 0, m[7]);
            if (t == null) { out.bad.push(raw); continue; }
            found.push(t);
        }
        found.forEach(t => {
            if (prev >= 1080 && t < 360 && t < prev) t += DAY;    // evening to early morning: after midnight
            if (prev >= DAY && t < 360) t += DAY;                  // still in the small hours
            if (t > MAX) { out.bad.push(hhmm(t)); return; }
            prev = t; out.times.push(t);
        });
        const words = src.replace(re, ' ').match(/[a-z]{2,}/gi) || [];
        out.skipped = words.length;
        out.times = uniqSort(out.times);
        out.afterMidnight = out.times.filter(t => t >= DAY).length;
        return out;
    }
    function uniqSort(a) { return [...new Set(a)].sort((x, y) => x - y); }

    // Text for a list of saved times that reads back to exactly the same list.
    function timesText(times) {
        const plain = times.map(hhmm).join(' ');
        if (JSON.stringify(parseTimes(plain).times) === JSON.stringify(times)) return plain;
        return times.map(hhmm24).join(' ');
    }

    // "Every 12 minutes from 06:00 to 22:00". An end before the start runs past midnight.
    function everyN(from, to, step) {
        if (from == null || to == null || !(step >= 1 && step <= 240) || step !== Math.floor(step)) return null;
        let end = to; if (end < from) end += DAY;
        const out = []; for (let t = from; t <= end && t <= MAX && out.length < 500; t += step) out.push(t);
        return out;
    }

    // ---------- which times run on a date ----------
    function inRange(g, ds) { return (!g.from || ds >= g.from) && (!g.until || ds <= g.until); }
    // The times a route runs on one service day. A public holiday runs the Sunday times.
    // A timetable with dates (summer, school holidays) replaces the normal one on the days it covers.
    function dayInfo(route, d, holidays) {
        const ds = dateStr(d), holiday = (holidays || []).includes(ds);
        const dow = holiday ? 0 : d.getDay();
        const match = route.groups.filter(g => g.days.includes(dow) && inRange(g, ds));
        const dated = match.filter(g => g.from || g.until);
        const use = dated.length ? dated : match;
        return { holiday, dow, groups: use, times: uniqSort([].concat(...use.map(g => g.times))) };
    }

    // Upcoming departures from `now` (ms): [{ at (ms), min, svc (Date of the service day) }], soonest first.
    function upcoming(route, now, holidays, count) {
        const nd = new Date(now), nowMin = Math.floor(now / 60000);
        const out = [];
        for (let k = -1; k <= 8 && out.length < count; k++) {
            const svc = addDays(new Date(nd.getFullYear(), nd.getMonth(), nd.getDate()), k);
            dayInfo(route, svc, holidays).times.forEach(t => {
                const at = new Date(svc.getFullYear(), svc.getMonth(), svc.getDate(), 0, t).getTime();
                if (Math.floor(at / 60000) >= nowMin) out.push({ at, min: t, svc });
            });
        }
        out.sort((a, b) => a.at - b.at);
        return out.slice(0, count);
    }
    // Whole minutes from now to a departure (0 = due now).
    function minsTo(at, now) { return Math.floor(at / 60000) - Math.floor(now / 60000); }
    function inText(n) {
        if (n <= 0) return 'due now';
        if (n < 60) return 'in ' + n + ' min';
        const d = Math.floor(n / 1440), h = Math.floor((n % 1440) / 60), m = n % 60;
        if (d) return 'in ' + d + (d === 1 ? ' day' : ' days') + (h ? ' ' + h + ' h' : '');
        return 'in ' + h + ' h' + (m ? ' ' + pad(m) + ' min' : '');
    }
    // "Today", "Tomorrow", "Mon 2 Nov" for the calendar day a departure leaves on.
    function whenLabel(at, now) {
        const a = new Date(at), n = new Date(now);
        const diff = Math.round((new Date(a.getFullYear(), a.getMonth(), a.getDate()) - new Date(n.getFullYear(), n.getMonth(), n.getDate())) / 864e5);
        if (diff === 0) return '';
        if (diff === 1) return 'Tomorrow';
        return DAY_SHORT[a.getDay()] + ' ' + a.getDate() + ' ' + a.toLocaleString('en-GB', { month: 'short' });
    }
    // The departure to aim for when it takes `walk` minutes to reach the stop.
    function catchable(list, now, walk) { return list.find(x => minsTo(x.at, now) >= walk) || null; }

    // "Mon–Fri", "Sat", "Every day", "Mon, Wed, Fri"
    function daysLabel(days) {
        const set = WEEK.filter(d => days.includes(d));
        if (set.length === 7) return 'Every day';
        if (!set.length) return 'No days';
        const runs = []; let start = 0;
        for (let i = 1; i <= set.length; i++) {
            if (i === set.length || WEEK.indexOf(set[i]) !== WEEK.indexOf(set[i - 1]) + 1) {
                const a = set[start], b = set[i - 1], len = i - start;
                runs.push(len >= 3 ? DAY_SHORT[a] + '–' + DAY_SHORT[b] : set.slice(start, i).map(x => DAY_SHORT[x]).join(', '));
                start = i;
            }
        }
        return runs.join(', ');
    }
    // Days of the week with no timetable at all (only counting timetables without dates).
    function daysWithout(route) {
        const covered = new Set([].concat(...route.groups.filter(g => !g.from && !g.until && g.times.length).map(g => g.days)));
        return WEEK.filter(d => !covered.has(d));
    }
    // Days ticked in two timetables without dates: their times are combined.
    function daysTwice(route) {
        const seen = {}, out = [];
        route.groups.filter(g => !g.from && !g.until).forEach(g => g.days.forEach(d => { seen[d] = (seen[d] || 0) + 1; }));
        WEEK.forEach(d => { if (seen[d] > 1) out.push(d); });
        return out;
    }

    // ---------- copy text ----------
    function routeText(route) {
        const lines = [route.name + (route.stop ? ' (from ' + route.stop + ')' : '')];
        route.groups.forEach(g => {
            let h = daysLabel(g.days);
            if (g.from || g.until) h += ' (' + (g.from ? 'from ' + g.from : '') + (g.from && g.until ? ' ' : '') + (g.until ? 'until ' + g.until : '') + ')';
            lines.push(h + ': ' + (g.times.length ? g.times.map(hhmm).join(' ') : 'no times'));
        });
        const none = daysWithout(route);
        if (none.length && none.length < 7) lines.push('No service: ' + none.map(d => DAY_SHORT[d]).join(', '));
        return lines.join('\n');
    }

    // ---------- checking saved or restored data ----------
    const str = (v, n) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n) : '');
    function cleanGroup(g) {
        if (!g || typeof g !== 'object') return null;
        const days = Array.isArray(g.days) ? uniqSort(g.days.filter(d => Number.isInteger(d) && d >= 0 && d <= 6)) : [];
        const times = Array.isArray(g.times) ? uniqSort(g.times.filter(t => Number.isInteger(t) && t >= 0 && t <= MAX)).slice(0, 600) : [];
        const from = parseDate(g.from) ? g.from : '', until = parseDate(g.until) ? g.until : '';
        if (!days.length || !times.length) return null;
        return { days, times, from: from && until && from > until ? until : from, until: from && until && from > until ? from : until };
    }
    function cleanRoute(r) {
        if (!r || typeof r !== 'object') return null;
        const name = str(r.name, 60); if (!name) return null;
        const groups = (Array.isArray(r.groups) ? r.groups : []).slice(0, 12).map(cleanGroup).filter(Boolean);
        if (!groups.length) return null;
        const walk = Number.isInteger(r.walk) && r.walk >= 0 && r.walk <= 120 ? r.walk : 0;
        return { id: str(r.id, 40) || Math.random().toString(36).slice(2, 10), name, stop: str(r.stop, 80), walk, groups };
    }
    function cleanState(s) {
        if (!s || typeof s !== 'object' || !Array.isArray(s.routes)) return null;
        const routes = s.routes.slice(0, 30).map(cleanRoute).filter(Boolean);
        const ids = new Set(); routes.forEach(r => { while (ids.has(r.id)) r.id += 'x'; ids.add(r.id); });
        const holidays = Array.isArray(s.holidays) ? uniqSort(s.holidays.filter(h => parseDate(h))).slice(-200) : [];
        return { v: 1, routes, holidays };
    }

    root.TTCore = { DAY, MAX, DAY_SHORT, DAY_LONG, WEEK, hhmm, hhmm24, dateStr, parseDate, addDays, parseTimes, timesText, everyN,
        dayInfo, upcoming, minsTo, inText, whenLabel, catchable, daysLabel, daysWithout, daysTwice, routeText, cleanState, cleanRoute };
})(typeof window !== 'undefined' ? window : globalThis);
