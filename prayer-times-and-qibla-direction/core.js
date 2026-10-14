// Prayer Times and Qibla Direction: the maths, with no page code, so it can be tested in node (node tests.js).
// Sun position and prayer-time formulas follow the standard method used by most timetables (PrayTimes.org, Aladhan):
// Fajr and Isha when the sun is a set angle below the horizon, Sunrise and Maghrib at 0.833 degrees, Dhuhr at solar noon,
// Asr when a shadow is its object's length (or twice it, Hanafi) plus the noon shadow.
(function (root) {
    'use strict';
    const KAABA = { lat: 21.4225241, lon: 39.8261818 };
    const PRAYERS = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
    const NAMES = { fajr: 'Fajr', sunrise: 'Sunrise', dhuhr: 'Dhuhr', asr: 'Asr', maghrib: 'Maghrib', isha: 'Isha' };

    // fajr / isha: degrees below the horizon; ishaMin: Isha this many minutes after Maghrib instead of an angle;
    // maghrib: degrees (Shia methods) instead of sunset; adj: minutes the authority itself adds to its timetable.
    const METHODS = {
        karachi: { name: 'University of Islamic Sciences, Karachi', short: 'Karachi', fajr: 18, isha: 18 },
        mwl: { name: 'Muslim World League', short: 'Muslim World League', fajr: 18, isha: 17 },
        isna: { name: 'Islamic Society of North America (ISNA)', short: 'ISNA', fajr: 15, isha: 15 },
        makkah: { name: 'Umm al-Qura, Makkah', short: 'Umm al-Qura', fajr: 18.5, ishaMin: 90 },
        egypt: { name: 'Egyptian General Authority of Survey', short: 'Egypt', fajr: 19.5, isha: 17.5 },
        dubai: { name: 'Dubai (UAE)', short: 'Dubai', fajr: 18.2, isha: 18.2, adj: { sunrise: -3, dhuhr: 3, asr: 3, maghrib: 3 } },
        gulf: { name: 'Gulf region (Bahrain, Oman)', short: 'Gulf region', fajr: 19.5, ishaMin: 90 },
        kuwait: { name: 'Kuwait', short: 'Kuwait', fajr: 18, isha: 17.5 },
        qatar: { name: 'Qatar', short: 'Qatar', fajr: 18, ishaMin: 90 },
        singapore: { name: 'Singapore, Malaysia, Indonesia (MUIS, JAKIM)', short: 'Singapore and Malaysia', fajr: 20, isha: 18 },
        turkey: { name: 'Diyanet, Turkey', short: 'Diyanet', fajr: 18, isha: 17, adj: { sunrise: -7, dhuhr: 5, asr: 4, maghrib: 7 } },
        france: { name: 'Union of Islamic Organisations of France (12 degrees)', short: 'France UOIF', fajr: 12, isha: 12 },
        russia: { name: 'Spiritual Administration of Muslims of Russia', short: 'Russia', fajr: 16, isha: 15 },
        tehran: { name: 'Institute of Geophysics, Tehran (Shia)', short: 'Tehran', fajr: 17.7, isha: 14, maghrib: 4.5 },
        jafari: { name: 'Shia Ithna Ashari, Qum (Jafari)', short: 'Jafari', fajr: 16, isha: 14, maghrib: 4 },
        custom: { name: 'My own angles', short: 'Own angles' }
    };
    const HANAFI = ['PK', 'IN', 'BD', 'AF', 'UZ', 'TJ', 'TM', 'KZ', 'KG'];
    const BY_COUNTRY = { PK: 'karachi', IN: 'karachi', BD: 'karachi', AF: 'karachi', SA: 'makkah', YE: 'makkah', EG: 'egypt', SD: 'egypt', LY: 'egypt',
        AE: 'dubai', BH: 'gulf', OM: 'gulf', KW: 'kuwait', QA: 'qatar', SG: 'singapore', MY: 'singapore', BN: 'singapore', ID: 'singapore',
        TR: 'turkey', FR: 'france', RU: 'russia', IR: 'tehran', US: 'isna', CA: 'isna' };
    // a device time zone tells the country well enough for "Use my location"
    const TZ_COUNTRY = { 'Asia/Karachi': 'PK', 'Asia/Kolkata': 'IN', 'Asia/Calcutta': 'IN', 'Asia/Dhaka': 'BD', 'Asia/Kabul': 'AF', 'Asia/Riyadh': 'SA',
        'Asia/Aden': 'YE', 'Africa/Cairo': 'EG', 'Africa/Khartoum': 'SD', 'Africa/Tripoli': 'LY', 'Asia/Dubai': 'AE', 'Asia/Bahrain': 'BH', 'Asia/Muscat': 'OM',
        'Asia/Kuwait': 'KW', 'Asia/Qatar': 'QA', 'Asia/Singapore': 'SG', 'Asia/Kuala_Lumpur': 'MY', 'Asia/Brunei': 'BN', 'Asia/Jakarta': 'ID',
        'Europe/Istanbul': 'TR', 'Europe/Paris': 'FR', 'Europe/Moscow': 'RU', 'Asia/Tehran': 'IR', 'Asia/Tashkent': 'UZ', 'Asia/Dushanbe': 'TJ',
        'Asia/Ashgabat': 'TM', 'Asia/Almaty': 'KZ', 'Asia/Bishkek': 'KG', 'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US',
        'America/Los_Angeles': 'US', 'America/Phoenix': 'US', 'America/Toronto': 'CA', 'America/Vancouver': 'CA', 'America/Edmonton': 'CA' };

    const rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI;
    const sin = d => Math.sin(rad(d)), cos = d => Math.cos(rad(d)), tan = d => Math.tan(rad(d));
    const asin = x => deg(Math.asin(x)), acos = x => deg(Math.acos(x)), atan2 = (y, x) => deg(Math.atan2(y, x)), acot = x => deg(Math.atan(1 / x));
    const fix = (a, b) => { a = a - b * Math.floor(a / b); return a < 0 ? a + b : a; };

    function julian(y, m, d) {
        if (m <= 2) { y -= 1; m += 12; }
        const A = Math.floor(y / 100), B = 2 - A + Math.floor(A / 4);
        return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5;
    }
    function sunPosition(jd) {
        const D = jd - 2451545.0;
        const g = fix(357.529 + 0.98560028 * D, 360), q = fix(280.459 + 0.98564736 * D, 360);
        const L = fix(q + 1.915 * sin(g) + 0.020 * sin(2 * g), 360), e = 23.439 - 0.00000036 * D;
        const RA = fix(atan2(cos(e) * sin(L), cos(L)) / 15, 24);
        return { decl: asin(sin(e) * sin(L)), eqt: q / 15 - RA };
    }

    // settings: { method, custom:{fajr,isha,ishaMin}, asr:'standard'|'hanafi', highLat:'angle'|'seventh'|'middle', adj:{fajr..isha minutes} }
    // Returns minutes after local midnight (rounded, may be below 0 or 1440 or above) of each time, or null when it does not happen.
    function computeDay(y, m, d, lat, lon, tzHours, settings) {
        const s = settings || {};
        const meth = Object.assign({}, METHODS[s.method] || METHODS.mwl);
        if (s.method === 'custom') {
            const c = s.custom || {};
            meth.fajr = c.fajr; if (c.ishaMin) { meth.ishaMin = c.ishaMin; } else meth.isha = c.isha;
        }
        const jDate = julian(y, m, d) - lon / (15 * 24);
        const midDay = t => fix(12 - sunPosition(jDate + t).eqt, 24);
        const sunAngleTime = (angle, t, ccw) => {
            const decl = sunPosition(jDate + t).decl, noon = midDay(t);
            const T = acos((-sin(angle) - sin(decl) * sin(lat)) / (cos(decl) * cos(lat))) / 15;
            return noon + (ccw ? -T : T);
        };
        const asrTime = (factor, t) => { const decl = sunPosition(jDate + t).decl; return sunAngleTime(-acot(factor + tan(Math.abs(lat - decl))), t); };
        // first guesses in day fractions, then refined so the sun's position is taken at the time itself
        const p = { fajr: 5 / 24, sunrise: 6 / 24, dhuhr: 12 / 24, asr: 13 / 24, sunset: 18 / 24, maghrib: 18 / 24, isha: 18 / 24 };
        let t;
        for (let i = 0; i < 3; i++) {
            t = {
                fajr: sunAngleTime(meth.fajr, p.fajr, true),
                sunrise: sunAngleTime(0.833, p.sunrise, true),
                dhuhr: midDay(p.dhuhr),
                asr: asrTime(s.asr === 'hanafi' ? 2 : 1, p.asr),
                sunset: sunAngleTime(0.833, p.sunset),
                maghrib: meth.maghrib ? sunAngleTime(meth.maghrib, p.maghrib) : NaN,
                isha: meth.ishaMin ? NaN : sunAngleTime(meth.isha, p.isha)
            };
            Object.keys(p).forEach(k => { if (!isNaN(t[k])) p[k] = t[k] / 24; });
        }
        const shift = tzHours - lon / 15;
        Object.keys(t).forEach(k => { t[k] += shift; });
        if (!meth.maghrib) t.maghrib = t.sunset;
        if (meth.ishaMin) t.isha = t.maghrib + meth.ishaMin / 60;
        // far north or south: Fajr and Isha are kept within a share of the night
        if (!isNaN(t.sunrise) && !isNaN(t.sunset)) {
            const night = fix(t.sunrise - t.sunset, 24);
            const portion = angle => s.highLat === 'middle' ? night / 2 : s.highLat === 'seventh' ? night / 7 : night * angle / 60;
            const adjust = (time, base, angle, ccw) => {
                const p = portion(angle), diff = ccw ? fix(base - time, 24) : fix(time - base, 24);
                return (isNaN(time) || diff > p) ? base + (ccw ? -p : p) : time;
            };
            t.fajr = adjust(t.fajr, t.sunrise, meth.fajr, true);
            if (!meth.ishaMin) t.isha = adjust(t.isha, t.sunset, meth.isha, false);
            if (meth.maghrib) t.maghrib = adjust(t.maghrib, t.sunset, meth.maghrib, false);
        }
        const out = { highLatUsed: false };
        const adj = Object.assign({}, meth.adj || {});
        PRAYERS.forEach(k => {
            const v = t[k];
            const user = s.adj && Number.isFinite(s.adj[k]) ? s.adj[k] : 0;
            out[k] = isNaN(v) ? null : Math.floor(v * 60 + 0.5) + (adj[k] || 0) + user;
        });
        return out;
    }

    // UTC offset in hours of a time zone at a moment; null when the zone is unknown
    const fmtCache = {};
    function zoneParts(tz, ms) {
        let f = fmtCache[tz];
        if (!f) f = fmtCache[tz] = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
        const o = {}; f.formatToParts(new Date(ms)).forEach(p => { o[p.type] = p.value; });
        return { y: +o.year, m: +o.month, d: +o.day, h: +o.hour % 24, mi: +o.minute, s: +o.second };
    }
    function validZone(tz) { try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return typeof tz === 'string' && tz.length > 0; } catch (e) { return false; } }
    function tzOffset(tz, ms) {
        const p = zoneParts(tz, ms);
        return Math.round((Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000) / 60000) / 60;
    }
    // offset used for a whole calendar day: the one at local noon (summer time changes happen at night)
    function dayOffset(tz, y, m, d) { const guess = Date.UTC(y, m - 1, d, 12); return tzOffset(tz, guess - tzOffset(tz, guess) * 3600000); }
    function todayIn(tz, ms) { const p = zoneParts(tz, ms); return iso(p.y, p.m, p.d); }
    function nowMinutesIn(tz, ms) { const p = zoneParts(tz, ms); return p.h * 60 + p.mi + p.s / 60; }

    const pad = n => String(n).padStart(2, '0');
    function iso(y, m, d) { return String(y).padStart(4, '0') + '-' + pad(m) + '-' + pad(d); }
    function parseISO(s) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); if (!m) return null; const y = +m[1], mo = +m[2], d = +m[3]; const dt = new Date(Date.UTC(y, mo - 1, d)); return dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d ? { y, m: mo, d } : null; }
    function addDays(s, n) { const p = parseISO(s); const dt = new Date(Date.UTC(p.y, p.m - 1, p.d + n)); return iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()); }
    function daysInMonth(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }

    // all six times of a date at a place, with the moment (ms) each happens
    function timesFor(place, dateISO) {
        const p = parseISO(dateISO), off = dayOffset(place.tz, p.y, p.m, p.d);
        const r = computeDay(p.y, p.m, p.d, place.lat, place.lon, off, place);
        const base = Date.UTC(p.y, p.m - 1, p.d) - off * 3600000;
        const list = PRAYERS.map(k => ({ key: k, name: NAMES[k], min: r[k], at: r[k] === null ? null : base + r[k] * 60000 }));
        return { date: dateISO, offset: off, list };
    }

    // the prayer whose time it is now, and the next one (tomorrow's Fajr after Isha)
    function nowAndNext(place, ms) {
        const today = todayIn(place.tz, ms);
        const days = [timesFor(place, addDays(today, -1)), timesFor(place, today), timesFor(place, addDays(today, 1))];
        const events = [];
        days.forEach(d => d.list.forEach(x => { if (x.at !== null) events.push(Object.assign({ date: d.date }, x)); }));
        events.sort((a, b) => a.at - b.at);
        let current = null, next = null;
        for (const e of events) { if (e.at <= ms) current = e; else { next = e; break; } }
        // after sunrise there is no prayer until Dhuhr
        if (current && current.key === 'sunrise') current = null;
        return { today, current, next };
    }

    function qibla(lat, lon) {
        const p1 = rad(lat), p2 = rad(KAABA.lat), dl = rad(KAABA.lon - lon);
        const bearing = fix(deg(Math.atan2(Math.sin(dl), Math.cos(p1) * Math.tan(p2) - Math.sin(p1) * Math.cos(dl))), 360);
        const a = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
        const km = 2 * 6371.0088 * Math.asin(Math.min(1, Math.sqrt(a)));
        return { bearing, km };
    }
    const POINTS = ['north', 'north-north-east', 'north-east', 'east-north-east', 'east', 'east-south-east', 'south-east', 'south-south-east',
        'south', 'south-south-west', 'south-west', 'west-south-west', 'west', 'west-north-west', 'north-west', 'north-north-west'];
    const compassWord = b => POINTS[Math.round(fix(b, 360) / 22.5) % 16];

    // "5:13 am" or "05:13"; minutes beyond the day are marked
    function fmtTime(min, clock) {
        if (min === null || min === undefined) return '--';
        const day = Math.floor(min / 1440), m = ((min % 1440) + 1440) % 1440, h = Math.floor(m / 60), mm = pad(m % 60);
        const t = clock === '24' ? pad(h) + ':' + mm : ((h % 12) || 12) + ':' + mm + (h < 12 ? ' am' : ' pm');
        return t + (day > 0 ? ' (next day)' : day < 0 ? ' (day before)' : '');
    }
    function fmtLeft(ms) {
        const total = Math.max(0, Math.ceil(ms / 60000)), h = Math.floor(total / 60), m = total % 60;
        if (total < 1) return 'less than a minute';
        return [h ? h + ' h' : '', m || !h ? m + ' min' : ''].filter(Boolean).join(' ');
    }
    function fmtOffset(h) { const s = h < 0 ? '-' : '+', a = Math.abs(h), hh = Math.floor(a), mm = Math.round((a - hh) * 60); return 'UTC' + s + hh + (mm ? ':' + pad(mm) : ''); }

    const HIJRI_MONTHS = ['Muharram', 'Safar', 'Rabi al-Awwal', 'Rabi al-Thani', 'Jumada al-Awwal', 'Jumada al-Thani', 'Rajab', 'Shaban', 'Ramadan', 'Shawwal', 'Dhul Qadah', 'Dhul Hijjah'];
    // Islamic (Umm al-Qura) date of a day; adjustDays moves it to match the local moon sighting
    function hijriParts(dateISO, adjustDays) {
        try {
            const p = parseISO(addDays(dateISO, adjustDays || 0));
            const f = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'UTC' });
            const o = {}; f.formatToParts(new Date(Date.UTC(p.y, p.m - 1, p.d, 12))).forEach(x => { o[x.type] = x.value; });
            const d = parseInt(o.day, 10), m = parseInt(o.month, 10), y = parseInt(String(o.year || o.relatedYear || '').replace(/\D/g, ''), 10);
            return d >= 1 && d <= 30 && m >= 1 && m <= 12 && y > 0 ? { d, m, y } : null;
        } catch (e) { return null; }
    }
    function hijri(dateISO, adjustDays) { const h = hijriParts(dateISO, adjustDays); return h ? h.d + ' ' + HIJRI_MONTHS[h.m - 1] + ' ' + h.y + ' AH' : ''; }

    function defaultsFor(country) {
        return { method: BY_COUNTRY[country] || 'mwl', asr: HANAFI.includes(country) ? 'hanafi' : 'standard' };
    }

    // check a saved place; returns a clean copy or null
    function cleanPlace(p) {
        if (!p || typeof p !== 'object') return null;
        const lat = Number(p.lat), lon = Number(p.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
        if (!validZone(p.tz)) return null;
        const num = (v, lo, hi, dflt) => { v = Number(v); return Number.isFinite(v) && v >= lo && v <= hi ? v : dflt; };
        const c = p.custom || {};
        const adj = {}; PRAYERS.forEach(k => { adj[k] = Math.round(num((p.adj || {})[k], -60, 60, 0)); });
        return {
            id: typeof p.id === 'string' && p.id ? p.id.slice(0, 40) : 'p' + Math.random().toString(36).slice(2, 9),
            name: typeof p.name === 'string' && p.name.trim() ? p.name.trim().slice(0, 80) : 'My place',
            area: typeof p.area === 'string' ? p.area.slice(0, 120) : '',
            country: typeof p.country === 'string' ? p.country.slice(0, 2).toUpperCase() : '',
            lat, lon, tz: p.tz,
            method: METHODS[p.method] ? p.method : 'mwl',
            custom: { fajr: num(c.fajr, 10, 22, 18), isha: num(c.isha, 10, 22, 17), ishaMin: Math.round(num(c.ishaMin, 0, 180, 0)) },
            asr: p.asr === 'hanafi' ? 'hanafi' : 'standard',
            highLat: ['angle', 'seventh', 'middle'].includes(p.highLat) ? p.highLat : 'angle',
            adj
        };
    }
    function cleanState(s) {
        const out = { places: [], current: null, clock: '', hijriAdj: 0 };
        if (!s || typeof s !== 'object') return out;
        if (Array.isArray(s.places)) s.places.slice(0, 20).forEach(p => { const c = cleanPlace(p); if (c && !out.places.some(x => x.id === c.id)) out.places.push(c); });
        out.current = out.places.some(p => p.id === s.current) ? s.current : (out.places[0] ? out.places[0].id : null);
        out.clock = s.clock === '12' || s.clock === '24' ? s.clock : '';
        const h = Math.round(Number(s.hijriAdj)); out.hijriAdj = Number.isFinite(h) && h >= -2 && h <= 2 ? h : 0;
        return out;
    }

    // "24.86, 67.00" style typed coordinates; also accepts "24.86 N 67.00 E" and a comma decimal with spaces between
    function parseCoord(s, max) {
        if (typeof s !== 'string') return null;
        let t = s.trim().replace(/[°º]/g, '').replace(/\s+/g, ' ');
        let sign = 1; const hemi = /\s*([NSEWnsew])$/.exec(t);
        if (hemi) { if (/[SWsw]/.test(hemi[1])) sign = -1; t = t.slice(0, hemi.index).trim(); }
        t = t.replace(',', '.');
        if (!/^[-+]?\d{1,3}(\.\d+)?$/.test(t)) return null;
        const v = Number(t) * sign;
        return Math.abs(v) <= max ? v : null;
    }

    // a calendar file with the five prayers of each day; times in UTC so every calendar app shows them right
    function ics(place, dates, clockless) {
        const stamp = d => { const x = new Date(d); return x.getUTCFullYear() + pad(x.getUTCMonth() + 1) + pad(x.getUTCDate()) + 'T' + pad(x.getUTCHours()) + pad(x.getUTCMinutes()) + '00Z'; };
        const esc = s => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
        const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//umar8092 apps//Prayer Times and Qibla Direction//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
            'X-WR-CALNAME:' + esc('Prayer times, ' + place.name)];
        const now = stamp(clockless || Date.now());
        dates.forEach(date => {
            timesFor(place, date).list.forEach(x => {
                if (x.key === 'sunrise' || x.at === null) return;
                lines.push('BEGIN:VEVENT', 'UID:' + place.id + '-' + date + '-' + x.key + '@prayer-times-and-qibla-direction', 'DTSTAMP:' + now,
                    'DTSTART:' + stamp(x.at), 'DTEND:' + stamp(x.at + 15 * 60000), 'SUMMARY:' + esc(x.name + ' (' + place.name + ')'), 'TRANSP:TRANSPARENT',
                    'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc(x.name + ' time'), 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT');
            });
        });
        lines.push('END:VCALENDAR');
        return lines.join('\r\n') + '\r\n';
    }

    const api = { KAABA, PRAYERS, NAMES, METHODS, BY_COUNTRY, TZ_COUNTRY, HANAFI, julian, sunPosition, computeDay, tzOffset, dayOffset, todayIn, nowMinutesIn,
        validZone, iso, parseISO, addDays, daysInMonth, timesFor, nowAndNext, qibla, compassWord, fmtTime, fmtLeft, fmtOffset, hijri, hijriParts, HIJRI_MONTHS, defaultsFor,
        cleanPlace, cleanState, parseCoord, ics };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PT = api;
})(this);
