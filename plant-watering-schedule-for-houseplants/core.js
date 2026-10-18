// Plant Watering Schedule for Houseplants: the logic, no page code.
// Dates are 'YYYY-MM-DD' strings on the person's own calendar (no time zones involved).
(function (root) {
    'use strict';
    const MAX_PLANTS = 300, MAX_EVERY = 90, MAX_FEED = 180, MAX_HISTORY = 60, MAX_TRIP = 120;
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
    const dow = iso => { const p = parseDate(iso); return DAYS[new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()]; };
    // "Sun 18 Oct" this year, "Sun 18 Oct 2027" other years
    function shortDate(iso, today) {
        const p = parseDate(iso); if (!p) return '';
        return dow(iso) + ' ' + p.d + ' ' + MONTHS[p.m - 1] + (today && iso.slice(0, 4) === today.slice(0, 4) ? '' : ' ' + p.y);
    }
    const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
    function rel(today, date) {
        const d = diff(today, date), a = Math.abs(d);
        if (d === 0) return 'today';
        if (d === 1) return 'tomorrow';
        if (d === -1) return 'yesterday';
        const t = a < 14 ? plural(a, 'day') : a < 60 ? plural(Math.floor(a / 7), 'week') : plural(Math.floor(a / 30), 'month');
        return d > 0 ? 'in ' + t : t + ' ago';
    }
    // "every day", "every 3 days", "every week", "every 2 weeks", "every 10 days"
    function everyText(n) {
        if (n === 1) return 'every day';
        if (n % 7 === 0) return n === 7 ? 'every week' : 'every ' + n / 7 + ' weeks';
        return 'every ' + n + ' days';
    }

    // ---- one plant
    // The number of days between waterings right now: the winter number in winter when the plant has one.
    const every = (p, season) => season === 'winter' && p.winterEvery ? p.winterEvery : p.every;
    // The day it needs water next. Never watered (or "not sure") = today. "Soil still wet" moves it to the check day.
    function nextWater(p, today, season) {
        let next = p.last ? addDays(p.last, every(p, season)) : today;
        if (!p.last && next > today) next = today;
        if (p.snooze && p.snooze > next) next = p.snooze;
        return next;
    }
    const feedOn = p => !!p.feedEvery;
    const feedPaused = (p, season) => feedOn(p) && p.feedPauseWinter && season === 'winter';
    function nextFeed(p, today) { return !feedOn(p) ? '' : p.lastFed ? addDays(p.lastFed, p.feedEvery) : today; }

    // The main line on each plant.
    function waterLine(p, today, season) {
        const next = nextWater(p, today, season), d = diff(today, next);
        const snoozed = p.snooze && p.snooze === next;
        if (snoozed && d > 0) return 'Soil was still wet: check again ' + (d === 1 ? 'tomorrow' : shortDate(next, today) + ' (' + rel(today, next) + ')');
        if (!p.last) return 'Water today (no watering recorded yet)';
        if (d < 0) return 'Water now: ' + plural(-d, 'day') + ' late (was due ' + shortDate(next, today) + ')';
        if (d === 0) return snoozed ? 'Check the soil today and water if it is dry' : 'Water today';
        if (d === 1) return 'Water tomorrow, ' + shortDate(next, today);
        return 'Water ' + shortDate(next, today) + ' (' + rel(today, next) + ')';
    }
    function feedLine(p, today, season) {
        if (!feedOn(p)) return '';
        if (feedPaused(p, season)) return 'Plant food: paused for winter';
        const n = nextFeed(p, today), d = diff(today, n);
        if (!p.lastFed) return 'Plant food: due today (no feed recorded yet)';
        if (d < 0) return 'Plant food: ' + plural(-d, 'day') + ' late (was due ' + shortDate(n, today) + ')';
        if (d === 0) return 'Plant food: due today';
        return 'Plant food: ' + shortDate(n, today) + ' (' + rel(today, n) + ')';
    }
    const feedDue = (p, today, season) => feedOn(p) && !feedPaused(p, season) && nextFeed(p, today) <= today;
    function subLine(p, today, season) {
        const bits = [];
        if (p.place) bits.push(p.place);
        let ev = 'Water ' + everyText(every(p, season));
        if (p.winterEvery && p.winterEvery !== p.every) ev += season === 'winter' ? ' (winter; summer ' + everyText(p.every) + ')' : ' (winter: ' + everyText(p.winterEvery) + ')';
        bits.push(ev);
        bits.push(p.last ? 'last watered ' + shortDate(p.last, today) + ' (' + rel(today, p.last) + ')' : 'not watered yet');
        return bits.join(' · ');
    }
    // Average days between the last waterings, or 0 when there are fewer than 3.
    function averageGap(p) {
        const h = (p.history || []).slice(-6);
        if (h.length < 3) return 0;
        return Math.round(diff(h[0], h[h.length - 1]) / (h.length - 1) * 10) / 10;
    }

    // ---- the whole list
    const active = plants => plants.filter(p => p.status === 'active');
    function sortPlants(list, today, season) {
        return list.slice().sort((a, b) => {
            const x = nextWater(a, today, season), y = nextWater(b, today, season);
            return x < y ? -1 : x > y ? 1 : a.name.localeCompare(b.name) || a.id - b.id;
        });
    }
    // 'now' = water today or late, 'later' = everything still to come, 'gone' = died or given away.
    function groups(plants, today, season) {
        const g = { now: [], later: [], gone: [] };
        sortPlants(plants, today, season).forEach(p => {
            if (p.status !== 'active') g.gone.push(p);
            else (nextWater(p, today, season) <= today ? g.now : g.later).push(p);
        });
        g.gone.sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id);
        return g;
    }
    const usesSeason = plants => active(plants).some(p => p.winterEvery || (feedOn(p) && p.feedPauseWinter));
    // "Basil (2 days late)" for the summary
    function dueName(p, today, season) {
        const d = diff(today, nextWater(p, today, season));
        return p.name + (d < 0 ? ' (' + plural(-d, 'day') + ' late)' : '');
    }

    // ---- actions (return a new plant, never change the old one)
    function watered(p, day) {
        const h = (p.history || []).filter(x => x !== day).concat([day]).sort().slice(-MAX_HISTORY);
        const last = p.last && p.last > day ? p.last : day;
        return Object.assign({}, p, { last, snooze: '', history: h });
    }
    function fed(p, day) { return Object.assign({}, p, { lastFed: p.lastFed && p.lastFed > day ? p.lastFed : day }); }
    function stillWet(p, today, days) { return Object.assign({}, p, { snooze: addDays(today, days || 1) }); }

    // ---- going away: which days the plant-sitter waters what
    // beforeAll = "I water everything the day before I leave". Otherwise each plant keeps its own rhythm from its next day
    // (the person keeps watering until they go). The trip is from 'from' to 'to', both days away.
    function tripPlan(plants, from, to, beforeAll, today, season) {
        const days = {}, none = [];
        const list = active(plants).sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id);
        list.forEach(p => {
            const n = every(p, season);
            let d = beforeAll ? addDays(from, n - 1) : nextWater(p, today, season);
            if (!beforeAll && d < today) d = today;
            while (d < from) d = addDays(d, n);
            let any = false;
            for (; d <= to; d = addDays(d, n)) { (days[d] = days[d] || []).push(p); any = true; }
            if (!any) none.push(p);
        });
        return { dates: Object.keys(days).sort().map(d => ({ date: d, plants: days[d] })), none };
    }
    function checkTrip(from, to, today) {
        if (!isDate(from)) return { field: 'from', msg: 'Choose the first day you are away.' };
        if (from < today) return { field: 'from', msg: 'The first day away cannot be in the past.' };
        if (!isDate(to)) return { field: 'to', msg: 'Choose the last day you are away.' };
        if (to < from) return { field: 'to', msg: 'The last day away is before the first day.' };
        if (diff(from, to) + 1 > MAX_TRIP) return { field: 'to', msg: 'That is more than ' + MAX_TRIP + ' days. Choose a shorter trip.' };
        return null;
    }
    const label = p => p.name + (p.place ? ' (' + p.place + ')' : '');
    function tripText(plants, from, to, beforeAll, today, season) {
        const plan = tripPlan(plants, from, to, beforeAll, today, season), out = [];
        const nDays = diff(from, to) + 1;
        out.push('Watering my plants while I am away: ' + shortDate(from, today) + ' to ' + shortDate(to, today) + ' (' + plural(nDays, 'day') + ')');
        if (beforeAll) out.push('I water all of them on ' + shortDate(addDays(from, -1), today) + ', the day before I leave.');
        out.push('');
        if (plan.dates.length) plan.dates.forEach(x => out.push(shortDate(x.date, today) + ': ' + x.plants.map(label).join(', ')));
        else out.push('Nothing needs water while I am away.');
        if (plan.none.length) { out.push(''); out.push('No water needed while I am away: ' + plan.none.map(label).join(', ') + '.'); }
        const notes = active(plants).filter(p => p.note).sort((a, b) => a.name.localeCompare(b.name));
        if (notes.length) { out.push(''); out.push('Notes:'); notes.forEach(p => out.push('- ' + p.name + ': ' + p.note.replace(/\s*\n\s*/g, '; '))); }
        out.push(''); out.push('Thank you!');
        return { text: out.join('\n'), plan };
    }
    // The plain list of every plant, for copying or email.
    function listText(plants, today, season) {
        const g = groups(plants, today, season), out = [];
        const line = p => '- ' + label(p) + ': ' + waterLine(p, today, season).replace(/^./, c => c.toLowerCase()) + ', ' + everyText(every(p, season)) + (p.note ? '. ' + p.note.replace(/\s*\n\s*/g, '; ') : '');
        if (g.now.length) out.push('Water today:\n' + g.now.map(line).join('\n'));
        if (g.later.length) out.push('Coming up:\n' + g.later.map(line).join('\n'));
        return out.length ? 'My plants, ' + shortDate(today, null) + (season === 'winter' ? ' (winter watering)' : '') + '\n\n' + out.join('\n\n') : '';
    }

    // ---- daily check reminder as a calendar file
    function icsDaily(time, today, url) {
        const t = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time || '') ? time : '09:00';
        const d = today.replace(/-/g, ''), hm = t.replace(':', '') + '00';
        const end = (() => { let [h, m] = t.split(':').map(Number); m += 15; if (m >= 60) { m -= 60; h = (h + 1) % 24; } return pad(h) + pad(m) + '00'; })();
        const endDay = end < hm ? addDays(today, 1).replace(/-/g, '') : d;
        return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//umar8092 apps//Plant Watering Schedule//EN', 'CALSCALE:GREGORIAN',
            'BEGIN:VEVENT', 'UID:plant-check-' + d + '-' + hm + '@umar8092.github.io', 'DTSTAMP:' + d + 'T000000Z',
            'DTSTART:' + d + 'T' + hm, 'DTEND:' + endDay + 'T' + end, 'RRULE:FREQ=DAILY',
            'SUMMARY:Check the plants', 'DESCRIPTION:Open the Plant Watering Schedule to see which plants need water today: ' + url,
            'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Check the plants', 'TRIGGER:PT0M', 'END:VALARM',
            'END:VEVENT', 'END:VCALENDAR'].join('\r\n') + '\r\n';
    }

    // ---- the form
    // f = { name, every, everyCustom, winterOn, winter, winterCustom, last ('' = not sure), place, note, feedOn, feed, feedCustom, lastFed, pauseWinter }
    function intVal(sel, custom, max) {
        const raw = sel === 'custom' ? String(custom == null ? '' : custom).trim() : String(sel);
        if (!/^\d+$/.test(raw)) return NaN;
        const n = +raw; return n >= 1 && n <= max ? n : NaN;
    }
    function readForm(f, today, plants, editingId) {
        const errors = {};
        const name = String(f.name || '').replace(/\s+/g, ' ').trim().slice(0, 60);
        if (!name) errors.name = 'Type the plant\'s name, for example Monstera.';
        const ev = intVal(f.every, f.everyCustom, MAX_EVERY);
        if (!ev) errors.every = 'Type a whole number of days from 1 to ' + MAX_EVERY + '.';
        let winterEvery = 0;
        if (f.winterOn) { winterEvery = intVal(f.winter, f.winterCustom, MAX_EVERY); if (!winterEvery) { errors.winter = 'Type a whole number of days from 1 to ' + MAX_EVERY + '.'; winterEvery = 0; } }
        let last = '';
        if (f.last) {
            if (!isDate(f.last)) errors.last = 'Choose a real date, or tap "Not sure".';
            else if (f.last > today) errors.last = 'The last watering cannot be in the future.';
            else last = f.last;
        }
        let feedEvery = 0, lastFed = '';
        if (f.feedOn) {
            feedEvery = intVal(f.feed, f.feedCustom, MAX_FEED);
            if (!feedEvery) { errors.feed = 'Type a whole number of days from 1 to ' + MAX_FEED + '.'; feedEvery = 0; }
            if (f.lastFed) {
                if (!isDate(f.lastFed)) errors.lastFed = 'Choose a real date, or leave it empty.';
                else if (f.lastFed > today) errors.lastFed = 'The last feed cannot be in the future.';
                else lastFed = f.lastFed;
            }
        }
        const place = String(f.place || '').replace(/\s+/g, ' ').trim().slice(0, 40);
        const note = String(f.note || '').replace(/\r\n?/g, '\n').trim().slice(0, 300);
        const same = name && (plants || []).some(p => p.status === 'active' && p.id !== editingId && p.name.toLowerCase() === name.toLowerCase() && (p.place || '').toLowerCase() === place.toLowerCase());
        if (Object.keys(errors).length) return { errors };
        return { plant: { name, every: ev, winterEvery, last, place, note,
            feedEvery, lastFed: feedEvery ? lastFed : '', feedPauseWinter: !!(feedEvery && f.pauseWinter) }, warn: same ? 'You already have a plant called ' + name + (place ? ' in ' + place : '') + '. Both are kept.' : '' };
    }

    // ---- saved data
    const emptyState = () => ({ v: 1, season: 'summer', nextId: 1, plants: [] });
    function cleanPlant(p) {
        if (!p || typeof p !== 'object') return null;
        const name = typeof p.name === 'string' ? p.name.replace(/\s+/g, ' ').trim().slice(0, 60) : '';
        const id = Number.isInteger(p.id) && p.id > 0 ? p.id : null;
        const ev = Number.isInteger(p.every) && p.every >= 1 && p.every <= MAX_EVERY ? p.every : null;
        if (!name || !id || !ev) return null;
        const okDate = v => typeof v === 'string' && isDate(v) ? v : '';
        const we = Number.isInteger(p.winterEvery) && p.winterEvery >= 1 && p.winterEvery <= MAX_EVERY ? p.winterEvery : 0;
        const fe = Number.isInteger(p.feedEvery) && p.feedEvery >= 1 && p.feedEvery <= MAX_FEED ? p.feedEvery : 0;
        const hist = Array.isArray(p.history) ? [...new Set(p.history.filter(x => typeof x === 'string' && isDate(x)))].sort().slice(-MAX_HISTORY) : [];
        return { id, name, every: ev, winterEvery: we, last: okDate(p.last), snooze: okDate(p.snooze), history: hist,
            place: typeof p.place === 'string' ? p.place.replace(/\s+/g, ' ').trim().slice(0, 40) : '',
            note: typeof p.note === 'string' ? p.note.slice(0, 300) : '',
            feedEvery: fe, lastFed: fe ? okDate(p.lastFed) : '', feedPauseWinter: !!(fe && p.feedPauseWinter),
            status: p.status === 'gone' ? 'gone' : 'active', added: okDate(p.added) };
    }
    function validate(s) {
        if (!s || typeof s !== 'object' || !Array.isArray(s.plants)) return null;
        const seen = new Set(), plants = [];
        s.plants.slice(0, MAX_PLANTS).forEach(x => { const p = cleanPlant(x); if (p && !seen.has(p.id)) { seen.add(p.id); plants.push(p); } });
        const maxId = plants.reduce((m, p) => Math.max(m, p.id), 0);
        const trip = s.trip && typeof s.trip === 'object' ? { from: isDate(s.trip.from) ? s.trip.from : '', to: isDate(s.trip.to) ? s.trip.to : '', beforeAll: s.trip.beforeAll !== false } : undefined;
        const out = { v: 1, season: s.season === 'winter' ? 'winter' : 'summer', nextId: Math.max(Number.isInteger(s.nextId) ? s.nextId : 1, maxId + 1), plants };
        if (trip) out.trip = trip;
        return out;
    }

    const api = { MAX_PLANTS, MAX_EVERY, MAX_FEED, MAX_TRIP, parseDate, isDate, addDays, diff, todayIso, shortDate, rel, everyText, plural,
        every, nextWater, nextFeed, feedOn, feedPaused, feedDue, waterLine, feedLine, subLine, averageGap, active, sortPlants, groups, usesSeason, dueName,
        watered, fed, stillWet, tripPlan, checkTrip, tripText, listText, icsDaily, readForm, emptyState, validate };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PlantCore = api;
})(this);
