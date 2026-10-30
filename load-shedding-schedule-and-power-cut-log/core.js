// Load Shedding Schedule and Power Cut Log: the maths and the words. No page code here, so tests.js can run it in node.
// Cut times in a schedule are minutes after midnight (14:00 = 840). A cut whose end is earlier than its start ends the next day.
// Logged cuts are kept as millisecond timestamps, so totals are exact; durations are rounded to whole minutes only for display.
// All dates use the device's own clock and time zone, so summer time changes are handled by the Date object.
(function (root) {
    'use strict';
    const DAY = 86400000, MIN = 60000;
    const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const ALL = [0, 1, 2, 3, 4, 5, 6];
    const MAX_PLACES = 10, MAX_SLOTS = 24, MAX_CUTS = 5000, MAX_CUT = 31 * DAY;

    // ---------- dates ----------
    const pad = n => (n < 10 ? '0' : '') + n;
    function dayStart(ms) { const d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); }
    function addDays(ms, n) { const d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n).getTime(); }
    function dayKey(ms) { const d = new Date(ms); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
    function keyToMs(k) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(k || ''));
        if (!m) return null;
        const d = new Date(+m[1], +m[2] - 1, +m[3]);
        return d.getMonth() === +m[2] - 1 && d.getDate() === +m[3] ? d.getTime() : null;
    }
    // midnight of the day plus a number of minutes (works across summer time changes and past midnight)
    function atMin(day, min) { const d = new Date(day); return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, min).getTime(); }
    function hhmm(min) { min = ((min % 1440) + 1440) % 1440; return pad(Math.floor(min / 60)) + ':' + pad(min % 60); }
    function clock(ms) { const d = new Date(ms); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
    function minOfDay(ms) { const d = new Date(ms); return d.getHours() * 60 + d.getMinutes(); }
    function dateText(ms, year) { const d = new Date(ms); return DAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()] + (year ? ' ' + d.getFullYear() : ''); }
    function shortDate(ms, year) { const d = new Date(ms); return d.getDate() + ' ' + MONTHS[d.getMonth()] + (year ? ' ' + d.getFullYear() : ''); }
    function dayWord(ms, now) {
        const t = dayStart(now), d = dayStart(ms);
        if (d === t) return 'Today';
        if (d === addDays(t, 1)) return 'Tomorrow';
        if (d === addDays(t, -1)) return 'Yesterday';
        return dateText(ms);
    }

    // ---------- durations ----------
    function mins(ms) { return Math.round(ms / MIN); }
    function dur(ms) {
        const m = Math.max(0, mins(ms)), h = Math.floor(m / 60), r = m % 60;
        if (!h) return r + ' min';
        return r ? h + ' h ' + r + ' min' : h + ' h';
    }

    // ---------- typed times ----------
    // "14:00", "14.00", "1400", "2pm", "2:30 pm", "8", "24:00" (midnight at the end of the day). Returns minutes or null.
    function parseTime(text, suffix) {
        let s = String(text == null ? '' : text).toLowerCase().replace(/\s+/g, ' ').trim();
        let m = s.match(/^(\d{1,2})(?:[:.h](\d{2}))?\s*(am|pm|a\.m\.?|p\.m\.?)?$/);
        if (!m) { const d = s.match(/^(\d{1,2})(\d{2})\s*(am|pm|a\.m\.?|p\.m\.?)?$/); if (d) m = [d[0], d[1], d[2], d[3]]; }
        if (!m) return null;
        let h = +m[1]; const mi = m[2] == null ? 0 : +m[2];
        const ap = m[3] ? m[3][0] : (suffix || '');
        if (mi > 59) return null;
        if (ap) {
            if (h < 1 || h > 12) return null;
            h = h % 12 + (ap === 'p' ? 12 : 0);
            return h * 60 + mi;
        }
        if (h === 24 && mi === 0) return 1440;
        if (h > 23) return null;
        return h * 60 + mi;
    }
    const T = '(\\d{1,2}(?:[:.h]\\d{2})?|\\d{3,4})\\s*(am|pm|a\\.m\\.?|p\\.m\\.?)?';
    const RANGE = new RegExp(T + '\\s*(?:-|–|—|to|till|until|upto|up to|>|→)\\s*' + T, 'gi');
    // Reads cut times out of pasted text such as a message from the electricity company:
    // "08:00-10:00, 14:00 to 16:00", "2pm - 4pm", "11-1pm". Returns {slots:[{s,e}], bad:[lines that had numbers but no time range]}
    function parseScheduleText(text) {
        const slots = [], bad = [];
        String(text == null ? '' : text).split(/\r?\n/).forEach(line => {
            let found = 0;
            for (const m of line.matchAll(RANGE)) {
                const a1 = m[2] ? m[2].toLowerCase()[0] : '', a2 = m[4] ? m[4].toLowerCase()[0] : '';
                let s, e = parseTime(m[3] + (m[4] ? ' ' + m[4] : ''));
                if (!a1 && a2) {
                    // "2-4pm" means 2pm to 4pm; "11-1pm" means 11am to 1pm
                    s = parseTime(m[1], a2);
                    if (s != null && e != null && s >= e) s = parseTime(m[1], a2 === 'p' ? 'a' : 'p');
                } else if (a1 && !a2) {
                    s = parseTime(m[1] + ' ' + m[2]);
                    e = parseTime(m[3], a1);
                    if (s != null && e != null && e <= s) e = parseTime(m[3], a1 === 'p' ? 'a' : 'p');
                } else s = parseTime(m[1] + (m[2] ? ' ' + m[2] : ''));
                if (s == null || e == null || s % 1440 === e % 1440) continue;
                found++;
                const slot = { s: s % 1440, e: e % 1440 };
                if (!slots.some(x => x.s === slot.s && x.e === slot.e)) slots.push(slot);
            }
            if (!found && /\d/.test(line)) bad.push(line.trim().slice(0, 80));
        });
        return { slots, bad };
    }

    // ---------- schedules ----------
    function cleanDays(days) {
        const out = ALL.filter(d => Array.isArray(days) && days.includes(d));
        return out;
    }
    function slotError(slot) {
        if (slot.s == null) return 'Pick the time the power goes.';
        if (slot.e == null) return 'Pick the time the power comes back.';
        if (slot.s === slot.e) return 'The power cannot go and come back at the same time.';
        if (!slot.days || !slot.days.length) return 'Pick at least one day.';
        return '';
    }
    function slotLen(slot) { return slot.e > slot.s ? slot.e - slot.s : slot.e + 1440 - slot.s; }
    function sortSlots(slots) { return slots.slice().sort((a, b) => a.s - b.s || a.e - b.e); }
    // the schedule that applies on a day: the latest one that started on or before it
    function scheduleOn(place, day) {
        const k = dayKey(day);
        let best = null;
        (place.schedules || []).forEach(sc => { if (sc.from <= k && (!best || sc.from >= best.from)) best = sc; });
        return best || (place.schedules && place.schedules.length ? null : null);
    }
    function slotsOn(place, day) {
        const sc = scheduleOn(place, day), wd = new Date(day).getDay();
        return sc ? sortSlots(sc.slots.filter(sl => sl.days.includes(wd))) : [];
    }
    function currentSlots(place, now) {
        const sc = scheduleOn(place, now) || (place.schedules || []).slice().sort((a, b) => a.from < b.from ? 1 : -1)[0];
        return sc ? sortSlots(sc.slots) : [];
    }
    // Saving new cut times keeps the old ones for earlier days, so past totals do not change.
    // The first cut times also cover earlier days, so cuts logged afterwards for last week are judged against them.
    function setSchedule(place, slots, now) {
        const k = dayKey(now), list = (place.schedules || []).filter(sc => sc.from < k);
        list.push({ from: (place.schedules || []).length ? k : '1970-01-01', slots: sortSlots(slots.map(sl => ({ s: sl.s, e: sl.e, days: cleanDays(sl.days) }))) });
        place.schedules = list;
    }

    // ---------- intervals ----------
    function merge(list) {
        const a = list.filter(x => x[1] > x[0]).sort((x, y) => x[0] - y[0]), out = [];
        a.forEach(x => { const l = out[out.length - 1]; if (l && x[0] <= l[1]) l[1] = Math.max(l[1], x[1]); else out.push([x[0], x[1]]); });
        return out;
    }
    function total(list) { return list.reduce((t, x) => t + x[1] - x[0], 0); }
    function overlap(a, b) {
        let t = 0, i = 0, j = 0;
        while (i < a.length && j < b.length) {
            const s = Math.max(a[i][0], b[j][0]), e = Math.min(a[i][1], b[j][1]);
            if (e > s) t += e - s;
            if (a[i][1] < b[j][1]) i++; else j++;
        }
        return t;
    }
    // planned cut intervals between two moments, merged (so 23:00-00:00 and 00:00-01:00 become one cut)
    function planned(place, from, to) {
        const out = [];
        for (let d = addDays(dayStart(from), -1); d <= to; d = addDays(d, 1)) {
            slotsOn(place, d).forEach(sl => {
                const s = atMin(d, sl.s), e = sl.e > sl.s ? atMin(d, sl.e) : atMin(d, sl.e + 1440);
                const cs = Math.max(s, from), ce = Math.min(e, to);
                if (ce > cs) out.push([cs, ce]);
            });
        }
        return merge(out);
    }

    // ---------- the answer at the top of each place ----------
    function openCut(place) { return (place.cuts || []).find(c => c.e == null) || null; }
    function status(place, now) {
        const ints = planned(place, addDays(dayStart(now), -2), addDays(dayStart(now), 9));
        const cur = ints.find(x => x[0] <= now && now < x[1]) || null;
        const next = ints.find(x => x[0] > now) || null;
        const hasSlots = (place.schedules || []).some(sc => sc.slots.length);
        return { open: openCut(place), cur, next, hasSlots };
    }
    function slotText(sl) { return hhmm(sl.s) + ' to ' + hhmm(sl.e) + (sl.e <= sl.s ? ' (next day)' : ''); }
    function daysText(days) {
        const d = cleanDays(days);
        if (d.length === 7) return 'Every day';
        if (d.join() === '1,2,3,4,5') return 'Mon to Fri';
        if (d.join() === '1,2,3,4,5,6') return 'Mon to Sat';
        if (d.join() === '0,6') return 'Sat and Sun';
        return [1, 2, 3, 4, 5, 6, 0].filter(x => d.includes(x)).map(x => DAYS[x]).join(', ');
    }
    function plannedPerDay(place, day) { return total(planned(place, dayStart(day), addDays(dayStart(day), 1))); }

    // ---------- logged cuts ----------
    function cutError(place, s, e, id, now) {
        if (s == null || isNaN(s)) return 'Pick the date and time the power went.';
        if (s > now + MIN) return 'The power cannot go in the future. Check the date and time.';
        if (e != null) {
            if (isNaN(e)) return 'Pick the date and time the power came back.';
            if (e <= s) return 'The power must come back after it went. Check the times.';
            if (e > now + MIN) return 'The power cannot come back in the future. Leave it as still off, or check the time.';
            if (e - s > MAX_CUT) return 'That is longer than 31 days. Check the dates.';
        }
        const end = e == null ? Infinity : e;
        const hit = (place.cuts || []).find(c => c.id !== id && c.s < end && (c.e == null ? Infinity : c.e) > s);
        if (hit) return 'This overlaps the cut on ' + dateText(hit.s) + ' from ' + clock(hit.s) + (hit.e == null ? ' (still off)' : ' to ' + clock(hit.e)) + '. Edit that one instead.';
        if ((place.cuts || []).length >= MAX_CUTS && !id) return 'This place already has ' + MAX_CUTS + ' cuts. Save a backup and delete old ones.';
        return '';
    }

    // ---------- report for a period ----------
    function period(kind, now, fromKey, toKey) {
        const t = dayStart(now), d = new Date(now);
        if (kind === 'lastmonth') { const s = new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime(); return { from: s, to: new Date(d.getFullYear(), d.getMonth(), 1).getTime() }; }
        if (kind === '7d') return { from: addDays(t, -6), to: addDays(t, 1) };
        if (kind === 'today') return { from: t, to: addDays(t, 1) };
        if (kind === 'year') return { from: new Date(d.getFullYear(), 0, 1).getTime(), to: addDays(t, 1) };
        if (kind === 'custom') {
            const a = keyToMs(fromKey), b = keyToMs(toKey);
            if (a == null || b == null) return { error: 'Pick both dates.' };
            if (b < a) return { error: 'The "To" date is before the "From" date.' };
            return { from: a, to: addDays(b, 1) };
        }
        return { from: new Date(d.getFullYear(), d.getMonth(), 1).getTime(), to: addDays(t, 1) };
    }
    function report(place, from, to, now) {
        const end = Math.min(to, now);
        const rows = [];
        (place.cuts || []).forEach(c => {
            const ce = c.e == null ? now : c.e, s = Math.max(c.s, from), e = Math.min(ce, end);
            if (e > s || (c.s >= from && c.s < end)) rows.push({ cut: c, s: c.s, e: ce, open: c.e == null, inside: Math.max(0, e - s) });
        });
        rows.sort((a, b) => b.s - a.s);
        const actual = merge(rows.map(r => [Math.max(r.s, from), Math.min(r.e, end)]));
        // planned time counts from when the person started tracking (or the earliest cut they logged), not before
        const first = (place.cuts || []).reduce((m, c) => Math.min(m, c.s), Infinity);
        const since = Math.min(place.since || from, first === Infinity ? Infinity : dayStart(first));
        const planFrom = Math.max(from, since);
        const plan = planFrom < end ? planned(place, planFrom, end) : [];
        // each cut against the planned times around it (a cut that starts before the period is still judged whole)
        const around = rows.length ? planned(place, Math.min(...rows.map(r => r.s)), Math.max(...rows.map(r => r.e))) : [];
        rows.forEach(r => { const p = overlap([[r.s, r.e]], around); r.extra = (r.e - r.s) - p; r.kind = p === 0 ? 'unplanned' : r.extra >= MIN ? 'over' : 'planned'; });
        const off = total(actual), planMs = total(plan), outside = off - overlap(actual, plan);
        let longest = null; rows.forEach(r => { if (!longest || r.e - r.s > longest.e - longest.s) longest = r; });
        const daysCount = planFrom < end ? Math.max(1, Math.round((addDays(dayStart(end - 1), 1) - dayStart(planFrom)) / DAY)) : 0;
        return {
            from, to, end, rows, off, count: rows.length, planned: planMs, planFrom, diff: off - planMs, outside,
            unplanned: rows.filter(r => r.kind === 'unplanned').length, longest, days: daysCount,
            perDay: daysCount ? off / daysCount : 0, future: from > now
        };
    }
    function diffText(r) {
        const d = mins(r.diff);
        if (!r.planned) return '';
        if (d === 0) return 'the same as planned';
        return dur(Math.abs(r.diff)) + (d > 0 ? ' more than planned' : ' less than planned');
    }
    function periodText(r) {
        const last = addDays(r.to, -1), sameY = new Date(r.from).getFullYear() === new Date(last).getFullYear();
        if (dayStart(r.from) === dayStart(last)) return dateText(r.from, true);
        return shortDate(r.from, !sameY) + ' to ' + shortDate(last, true);
    }
    function rowLine(r) {
        const sameDay = dayStart(r.s) === dayStart(r.e);
        const back = r.open ? 'still off' : (sameDay ? clock(r.e) : dateText(r.e) + ' ' + clock(r.e));
        return dateText(r.s) + '  ' + clock(r.s) + ' to ' + back + '  ' + dur(r.e - r.s) + (r.kind === 'unplanned' ? '  (not planned)' : r.kind === 'over' ? '  (' + dur(r.extra) + ' outside planned times)' : '');
    }
    function summaryText(place, r) {
        const lines = ['Power cuts at ' + place.name + ', ' + periodText(r)];
        lines.push('Without power: ' + dur(r.off) + ' in ' + r.count + (r.count === 1 ? ' cut' : ' cuts') + (r.days ? ', about ' + dur(r.perDay) + ' a day' : ''));
        if (r.planned) lines.push('Planned load shedding in this time: ' + dur(r.planned) + ' (' + diffText(r) + ')');
        if (r.outside >= MIN) lines.push('Outside the planned times: ' + dur(r.outside) + (r.unplanned ? ', including ' + r.unplanned + ' unplanned ' + (r.unplanned === 1 ? 'cut' : 'cuts') : ''));
        if (r.longest && r.count > 1) lines.push('Longest cut: ' + dur(r.longest.e - r.longest.s) + ' on ' + dateText(r.longest.s) + ', ' + clock(r.longest.s) + ' to ' + (r.longest.open ? 'still off' : clock(r.longest.e)));
        if (r.rows.length) { lines.push(''); r.rows.slice().reverse().forEach(x => lines.push(rowLine(x))); }
        return lines.join('\n');
    }
    function csv(place, r) {
        const q = v => { v = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
        const out = [['Place', 'Power went', 'Power came back', 'Minutes without power', 'Planned?', 'Minutes outside planned times', 'Note'].join(',')];
        r.rows.slice().reverse().forEach(x => out.push([place.name, dayKey(x.s) + ' ' + clock(x.s), x.open ? 'still off' : dayKey(x.e) + ' ' + clock(x.e), mins(x.e - x.s),
            x.kind === 'unplanned' ? 'No' : x.kind === 'over' ? 'Partly' : 'Yes', mins(x.extra), x.cut.note || ''].map(q).join(',')));
        return out.join('\r\n') + '\r\n';
    }

    // ---------- calendar file with the cut times ----------
    function ics(place, now, remind) {
        const esc = s => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
        const f = ms => { const d = new Date(ms); return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + 'T' + pad(d.getHours()) + pad(d.getMinutes()) + '00'; };
        const by = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'], stamp = new Date(now).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
        const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//umar8092//Load Shedding Schedule//EN', 'CALSCALE:GREGORIAN'];
        currentSlots(place, now).forEach((sl, i) => {
            let d = dayStart(now);
            for (let k = 0; k < 7 && !sl.days.includes(new Date(d).getDay()); k++) d = addDays(d, 1);
            const s = atMin(d, sl.s), e = atMin(d, sl.s + slotLen(sl));
            L.push('BEGIN:VEVENT', 'UID:' + place.id + '-' + i + '-' + sl.s + '-' + sl.e + '@load-shedding-schedule', 'DTSTAMP:' + stamp,
                'DTSTART:' + f(s), 'DTEND:' + f(e),
                'RRULE:' + (sl.days.length === 7 ? 'FREQ=DAILY' : 'FREQ=WEEKLY;BYDAY=' + cleanDays(sl.days).map(x => by[x]).join(',')),
                'SUMMARY:' + esc('Power cut ' + hhmm(sl.s) + ' to ' + hhmm(sl.e) + ' (' + place.name + ')'),
                'DESCRIPTION:' + esc('Planned load shedding. Charge your phone and plan cooking before it starts.'),
                'TRANSP:TRANSPARENT');
            if (remind > 0) L.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc('Power cut in ' + remind + ' min (' + place.name + ')'), 'TRIGGER:-PT' + remind + 'M', 'END:VALARM');
            L.push('END:VEVENT');
        });
        L.push('END:VCALENDAR');
        return L.join('\r\n') + '\r\n';
    }

    // ---------- saved data ----------
    function str(v, max) { return typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max) : ''; }
    const isMin = v => Number.isInteger(v) && v >= 0 && v < 1440;
    const isMs = v => typeof v === 'number' && isFinite(v) && v > 0 && v < 8.64e15;
    function cleanState(raw) {
        if (!raw || typeof raw !== 'object' || !Array.isArray(raw.places)) return null;
        const places = [], ids = new Set();
        raw.places.slice(0, MAX_PLACES).forEach((p, i) => {
            if (!p || typeof p !== 'object') return;
            let id = str(p.id, 40) || 'p' + i; while (ids.has(id)) id += 'x'; ids.add(id);
            const name = str(p.name, 40) || 'Place ' + (places.length + 1);
            const schedules = (Array.isArray(p.schedules) ? p.schedules : []).filter(sc => sc && keyToMs(sc.from) != null && Array.isArray(sc.slots)).slice(0, 200)
                .map(sc => ({ from: sc.from, slots: sortSlots(sc.slots.filter(sl => sl && isMin(sl.s) && isMin(sl.e) && sl.s !== sl.e && cleanDays(sl.days).length).slice(0, MAX_SLOTS).map(sl => ({ s: sl.s, e: sl.e, days: cleanDays(sl.days) }))) }));
            const seen = new Set(), cuts = [];
            (Array.isArray(p.cuts) ? p.cuts : []).slice(0, MAX_CUTS).forEach((c, j) => {
                if (!c || !isMs(c.s) || (c.e != null && (!isMs(c.e) || c.e <= c.s))) return;
                let cid = str(c.id, 40) || 'c' + j; while (seen.has(cid)) cid += 'x'; seen.add(cid);
                cuts.push({ id: cid, s: c.s, e: c.e == null ? null : c.e, note: str(c.note, 200) });
            });
            // only one cut can be still running
            cuts.sort((a, b) => a.s - b.s);
            const open = cuts.filter(c => c.e == null);
            open.slice(0, -1).forEach(c => { c.e = Math.min(...cuts.filter(x => x.s > c.s).map(x => x.s)); });
            places.push({ id, name, since: isMs(p.since) ? p.since : (cuts[0] ? cuts[0].s : Date.now()), schedules, cuts: cuts.filter(c => c.e == null || c.e > c.s) });
        });
        const kinds = ['month', 'lastmonth', '7d', 'year', 'custom'];
        return { v: 1, places, sel: str(raw.sel, 40), period: kinds.includes(raw.period) ? raw.period : 'month', remind: [0, 5, 10, 15, 30, 60].includes(raw.remind) ? raw.remind : 15 };
    }

    root.LSCore = { DAY, MIN, DAYS, MONTHS, ALL, MAX_PLACES, MAX_SLOTS, pad, dayStart, addDays, dayKey, keyToMs, atMin, hhmm, clock, minOfDay, dateText, shortDate, dayWord,
        mins, dur, parseTime, parseScheduleText, cleanDays, slotError, slotLen, sortSlots, scheduleOn, slotsOn, currentSlots, setSchedule, merge, total, overlap, planned,
        openCut, status, slotText, daysText, plannedPerDay, cutError, period, report, diffText, periodText, rowLine, summaryText, csv, ics, cleanState };
})(typeof window !== 'undefined' ? window : globalThis);
