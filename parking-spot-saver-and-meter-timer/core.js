// Parking Spot Saver and Meter Timer: the logic, with no page code. Times are whole milliseconds since 1970.
(function (root) {
    'use strict';
    const MIN = 60000, HOUR = 60 * MIN, DAY = 24 * HOUR;
    const MAX_PAID = 30 * DAY, MAX_SPOTS = 5, MAX_NOTE = 300, MAX_CAR = 40;
    const WARN_CHOICES = [0, 5, 10, 15, 30];
    const PRESETS = ['none', '1800000', '3600000', '7200000', '10800000', '14400000'];   // choices remembered for next time
    const RING_WINDOW = 5 * MIN;   // a "time is up" that came while the page was closed still rings if it is this recent

    // "1.5", "1,5", " 2 " -> number; blank -> 0; anything else -> NaN
    function readNum(text) {
        const t = String(text == null ? '' : text).trim().replace(',', '.');
        if (t === '') return 0;
        if (!/^\d*\.?\d+$|^\d+\.$/.test(t)) return NaN;
        return Number(t);
    }

    // Days, hours and minutes typed by the user -> { ms } or { error }
    function readLength(days, hours, mins) {
        const d = readNum(days), h = readNum(hours), m = readNum(mins);
        if ([d, h, m].some(Number.isNaN)) return { error: 'Type numbers only, for example 1 hour 30 minutes.' };
        const ms = Math.round((d * DAY + h * HOUR + m * MIN) / MIN) * MIN;
        if (ms <= 0) return { error: 'Type how long you paid for, at least 1 minute.' };
        if (ms > MAX_PAID) return { error: 'That is more than 30 days. Type a shorter time.' };
        return { ms };
    }

    // "18:30" -> the next time the clock shows 18:30 after now (today, or tomorrow if that has passed)
    function untilTime(now, hhmm) {
        const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
        if (!m || +m[1] > 23 || +m[2] > 59) return { error: 'Pick the time your parking is paid until.' };
        const d = new Date(now);
        d.setHours(+m[1], +m[2], 0, 0);
        let tomorrow = false;
        if (d.getTime() <= now) { d.setDate(d.getDate() + 1); d.setHours(+m[1], +m[2], 0, 0); tomorrow = true; }
        return { endAt: d.getTime(), tomorrow };
    }

    // What the paid-time choice means: { endAt: null } for no limit, { endAt } or { error }
    function paidEnd(now, choice, custom) {
        custom = custom || {};
        if (choice === 'none') return { endAt: null };
        if (choice === 'other') { const r = readLength(custom.days, custom.hours, custom.mins); return r.error ? r : { endAt: now + r.ms }; }
        if (choice === 'until') { const r = untilTime(now, custom.until); return r.error ? r : { endAt: r.endAt, tomorrow: r.tomorrow }; }
        const ms = Number(choice);
        if (Number.isFinite(ms) && ms > 0 && ms <= MAX_PAID) return { endAt: now + ms };
        return { error: 'Choose how long you paid for.' };
    }

    // Adding time: if the paid time is still running it is added to the end; if it already ran out it counts from now
    function extend(spot, now, ms) {
        const base = spot.endAt && spot.endAt > now ? spot.endAt : now;
        const endAt = Math.min(base + ms, now + MAX_PAID);
        const paidFrom = spot.endAt && spot.endAt > now ? spot.paidFrom : now;
        return Object.assign({}, spot, { endAt, paidFrom, warned: false, ended: false });
    }

    function state(spot, now) {
        if (!spot.endAt) return 'free';
        if (now >= spot.endAt) return 'over';
        if (spot.warnMin > 0 && now >= spot.endAt - spot.warnMin * MIN) return 'soon';
        return 'ok';
    }

    // Which alert is due now: 'warn', 'end' or null. Marks it on the returned copy so it fires once.
    function dueAlert(spot, now) {
        if (!spot.endAt) return { spot, alert: null };
        if (!spot.ended && now >= spot.endAt) {
            return { spot: Object.assign({}, spot, { ended: true, warned: true }), alert: now - spot.endAt < RING_WINDOW ? 'end' : null };
        }
        const warnAt = spot.endAt - spot.warnMin * MIN;
        if (spot.warnMin > 0 && !spot.warned && now >= warnAt && now < spot.endAt) {
            return { spot: Object.assign({}, spot, { warned: true }), alert: 'warn' };   // still inside the warning time: always worth a beep
        }
        return { spot, alert: null };
    }

    // Time left, rounded down so the app never promises more time than there is
    function fmtLeft(ms) {
        if (ms < MIN) return Math.max(0, Math.floor(ms / 1000)) + ' s';
        if (ms < 10 * MIN) { const m = Math.floor(ms / MIN), s = Math.floor((ms % MIN) / 1000); return m + ' min ' + String(s).padStart(2, '0') + ' s'; }
        return fmtSpan(ms);
    }
    // Time passed or a length: "45 min", "1 h 05 min", "3 days 4 h"
    function fmtSpan(ms) {
        const tm = Math.floor(ms / MIN);
        if (tm < 1) return 'less than 1 min';
        if (tm < 60) return tm + ' min';
        const d = Math.floor(tm / 1440), h = Math.floor((tm % 1440) / 60), m = tm % 60;
        if (d > 0) return d + (d === 1 ? ' day' : ' days') + (h ? ' ' + h + ' h' : '');
        return h + ' h' + (m ? ' ' + String(m).padStart(2, '0') + ' min' : '');
    }

    function sameDay(a, b) { const x = new Date(a), y = new Date(b); return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate(); }
    // "3:40 PM", "tomorrow at 1:30 AM", "Tue 27 Oct at 9:00 AM"
    function fmtWhen(ts, now, locale) {
        const time = new Date(ts).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
        if (sameDay(ts, now)) return time;
        if (sameDay(ts, now + DAY)) return 'tomorrow at ' + time;
        if (sameDay(ts, now - DAY)) return 'yesterday at ' + time;
        return new Date(ts).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' }) + ' at ' + time;
    }

    // "at 3:40 PM", "yesterday at 9:00 AM", "on Tue 27 Oct at 9:00 AM"
    function fmtAt(ts, now, locale) {
        const w = fmtWhen(ts, now, locale);
        return /^(tomorrow|yesterday)/.test(w) ? w : (sameDay(ts, now) ? 'at ' : 'on ') + w;
    }

    // The main line for a parked car
    function statusText(spot, now, locale) {
        const st = state(spot, now);
        if (st === 'free') return { st, big: 'No time limit', line: 'Parked ' + fmtSpan(now - spot.parkedAt) + ' ago' };
        const until = fmtWhen(spot.endAt, now, locale);
        if (st === 'over') return { st, big: 'Paid time ran out', line: 'Ran out ' + (now - spot.endAt < MIN ? 'just now' : fmtSpan(now - spot.endAt) + ' ago') + ', at ' + until };
        return { st, big: fmtLeft(spot.endAt - now) + ' left', line: 'Paid until ' + until };
    }

    // Share of the paid time used, 0..1, for the bar
    function used(spot, now) {
        if (!spot.endAt) return 0;
        const total = spot.endAt - spot.paidFrom;
        return total > 0 ? Math.min(1, Math.max(0, (now - spot.paidFrom) / total)) : 1;
    }

    // Distance and direction from where you stand to the car
    function distance(from, to) {
        const R = 6371000, rad = Math.PI / 180;
        const p1 = from.lat * rad, p2 = to.lat * rad, dp = (to.lat - from.lat) * rad, dl = (to.lon - from.lon) * rad;
        const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
        const metres = 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
        const y = Math.sin(dl) * Math.cos(p2), x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
        const bearing = (Math.atan2(y, x) / rad + 360) % 360;
        return { metres, bearing };
    }
    const DIRS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
    function fmtMetres(m) { return m < 1000 ? (m < 100 ? Math.round(m / 5) * 5 : Math.round(m / 10) * 10) + ' m' : (m / 1000).toFixed(m < 10000 ? 1 : 0) + ' km'; }
    function farText(from, to) {
        const d = distance(from, to), slack = (from.acc || 0) + (to.acc || 0);
        if (d.metres <= Math.max(25, slack)) return 'You are very close: your car is within about ' + fmtMetres(Math.max(25, slack)) + '. Look around, and check the note and photo.';
        return 'Your car is about ' + fmtMetres(d.metres) + ' away, to the ' + DIRS[Math.round(d.bearing / 45) % 8] + '.' + (slack > 100 ? ' (The location is rough, so this may be off by about ' + fmtMetres(slack) + '.)' : '');
    }

    function fix(n) { return (Math.round(n * 1e6) / 1e6).toString(); }
    // Walking directions in the phone's maps app (Google Maps opens on Android, iPhone and computers)
    function mapsUrl(loc) { return 'https://www.google.com/maps/dir/?api=1&destination=' + fix(loc.lat) + ',' + fix(loc.lon) + '&travelmode=walking'; }
    function pinUrl(loc) { return 'https://maps.google.com/?q=' + fix(loc.lat) + ',' + fix(loc.lon); }

    function shareText(spot, now, locale) {
        const lines = [spot.car + ' is parked' + (spot.note ? ' at: ' + spot.note : '.')];
        lines.push('Parked ' + fmtAt(spot.parkedAt, now, locale) + '.' + (spot.endAt ? ' Paid until ' + fmtWhen(spot.endAt, now, locale) + '.' : ''));
        if (spot.loc) lines.push('Map: ' + pinUrl(spot.loc));
        return lines.join('\n');
    }

    // A calendar event at the end of the paid time, with an alarm before it, so the phone reminds you even when locked
    function icsEscape(t) { return String(t).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
    function icsTime(ts) { return new Date(ts).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); }
    function ics(spot, now) {
        const desc = [spot.note ? 'Where: ' + spot.note : '', spot.loc ? 'Map: ' + pinUrl(spot.loc) : ''].filter(Boolean).join('\n');
        const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//umar8092//Parking Spot Saver//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
            'UID:parking-' + spot.id + '-' + spot.endAt + '@umar8092.github.io', 'DTSTAMP:' + icsTime(now),
            'DTSTART:' + icsTime(spot.endAt), 'DTEND:' + icsTime(spot.endAt + 15 * MIN),
            'SUMMARY:' + icsEscape('Parking ends: ' + spot.car)];
        if (desc) L.push('DESCRIPTION:' + icsEscape(desc));
        if (spot.loc) L.push('GEO:' + fix(spot.loc.lat) + ';' + fix(spot.loc.lon));
        if (spot.warnMin > 0) L.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEscape('Parking ends in ' + spot.warnMin + ' min: ' + spot.car), 'TRIGGER:-PT' + spot.warnMin + 'M', 'END:VALARM');
        L.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEscape('Parking time is up: ' + spot.car), 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR');
        return L.join('\r\n') + '\r\n';
    }

    function cleanText(t, max) { return String(t == null ? '' : t).replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, max); }
    function nextCarName(spots) {
        if (!spots.length) return 'My car';
        for (let i = 2; ; i++) if (!spots.some(s => s.car === 'Car ' + i)) return 'Car ' + i;
    }

    function validLoc(l) {
        if (!l || typeof l !== 'object') return null;
        const lat = Number(l.lat), lon = Number(l.lon), acc = Number(l.acc);
        if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
        return { lat, lon, acc: Number.isFinite(acc) && acc >= 0 ? Math.min(acc, 1e6) : 0, at: Number.isFinite(+l.at) ? +l.at : 0 };
    }
    // Checks every saved value; anything broken is dropped, never trusted
    function restore(raw) {
        const out = { v: 1, nextId: 1, spots: [], settings: { sound: true, vibrate: true, notify: false, warnMin: 10 } };
        if (!raw || typeof raw !== 'object') return out;
        const s = raw.settings || {};
        out.settings.sound = s.sound !== false;
        out.settings.vibrate = s.vibrate !== false;
        out.settings.notify = s.notify === true;
        out.settings.warnMin = WARN_CHOICES.includes(+s.warnMin) ? +s.warnMin : 10;
        if (PRESETS.includes(s.lastChoice)) out.settings.lastChoice = s.lastChoice;
        const ids = new Set();
        (Array.isArray(raw.spots) ? raw.spots : []).forEach(x => {
            if (!x || typeof x !== 'object' || out.spots.length >= MAX_SPOTS) return;
            const id = String(x.id || '').replace(/[^\w-]/g, '').slice(0, 20);
            const parkedAt = Number(x.parkedAt);
            if (!id || ids.has(id) || !Number.isFinite(parkedAt) || parkedAt <= 0) return;
            let endAt = x.endAt == null ? null : Number(x.endAt);
            if (endAt !== null && (!Number.isFinite(endAt) || endAt <= 0)) endAt = null;
            let paidFrom = Number(x.paidFrom);
            if (!Number.isFinite(paidFrom) || (endAt && paidFrom > endAt)) paidFrom = endAt ? Math.min(parkedAt, endAt) : parkedAt;
            ids.add(id);
            out.spots.push({ id, car: cleanText(x.car, MAX_CAR) || 'My car', note: cleanText(x.note, MAX_NOTE), loc: validLoc(x.loc), hasPhoto: x.hasPhoto === true,
                parkedAt, endAt, paidFrom, warnMin: WARN_CHOICES.includes(+x.warnMin) ? +x.warnMin : 10, warned: x.warned === true, ended: x.ended === true });
        });
        const n = parseInt(raw.nextId, 10);
        out.nextId = Number.isFinite(n) && n > 0 ? n : 1;
        out.spots.forEach(sp => { const k = parseInt(sp.id.replace(/\D/g, ''), 10); if (k >= out.nextId) out.nextId = k + 1; });
        return out;
    }

    const api = { MIN, HOUR, DAY, MAX_SPOTS, MAX_NOTE, MAX_CAR, WARN_CHOICES, readNum, readLength, untilTime, paidEnd, extend, state, dueAlert,
        fmtLeft, fmtSpan, fmtWhen, fmtAt, statusText, used, distance, fmtMetres, farText, mapsUrl, pinUrl, shareText, ics, cleanText, nextCarName, validLoc, restore };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Park = api;
})(this);
