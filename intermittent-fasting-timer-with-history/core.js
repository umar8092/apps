// Intermittent Fasting Timer: the logic, with no page code. Works in the browser (window.Fast) and in node (module.exports).
// Times are milliseconds since 1970 (Date.now()), so a fast keeps the right length across midnight, clock changes and time zones.
// Lengths are counted in whole minutes, the same minutes the page shows, so "goal met" always agrees with what you see.
(function (root) {
    'use strict';
    const MIN = 60000, HOUR = 60 * MIN, DAY = 24 * HOUR;
    const MAX_FAST_MIN = 7 * 24 * 60;          // a fast can be at most 7 days (168 h) long
    const GOAL_MIN = [60, MAX_FAST_MIN];       // goal: 1 h to 168 h
    const PLANS = [
        { id: '12:12', h: 12, name: '12:12', hint: 'Gentle start' },
        { id: '14:10', h: 14, name: '14:10', hint: 'Easy' },
        { id: '16:8', h: 16, name: '16:8', hint: 'Most popular' },
        { id: '18:6', h: 18, name: '18:6', hint: 'Harder' },
        { id: '20:4', h: 20, name: '20:4', hint: 'Warrior' },
        { id: '23:1', h: 23, name: 'OMAD 23:1', hint: 'One meal a day' }
    ];
    const DEFAULT_SETTINGS = { goalMin: 16 * 60, h12: false, notify: false, vibrate: true };
    const NOTE_MAX = 80;

    const pad = n => String(n).padStart(2, '0');
    const isNum = n => typeof n === 'number' && Number.isFinite(n);
    const isInt = n => typeof n === 'number' && Number.isInteger(n);
    const minsOf = ms => Math.floor(Math.max(0, ms) / MIN);

    // 870 -> "14 h 30 min"; 45 -> "45 min"; 960 -> "16 h"; 0 -> "0 min"
    function duration(mins) {
        mins = Math.max(0, Math.floor(mins));
        const h = Math.floor(mins / 60), m = mins % 60;
        return h ? h + ' h' + (m ? ' ' + m + ' min' : '') : m + ' min';
    }
    // elapsed ms -> "14:30:05" (hours can go past 24)
    function stopwatch(ms) {
        const s = Math.floor(Math.max(0, ms) / 1000);
        return Math.floor(s / 3600) + ':' + pad(Math.floor(s % 3600 / 60)) + ':' + pad(s % 60);
    }
    function clock(ms, h12) {
        const d = new Date(ms), h = d.getHours(), m = pad(d.getMinutes());
        return h12 ? ((h % 12) || 12) + ':' + m + (h < 12 ? ' am' : ' pm') : pad(h) + ':' + m;
    }
    function dayKey(ms) { const d = new Date(ms); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
    function keyToMs(key) { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d).getTime(); }
    function addDays(key, n) { const [y, m, d] = key.split('-').map(Number); return dayKey(new Date(y, m - 1, d + n, 12).getTime()); }
    const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    function dateLabel(ms) { const d = new Date(ms); return WD[d.getDay()] + ' ' + d.getDate() + ' ' + MO[d.getMonth()]; }
    // "today", "yesterday", "tomorrow" or "Wed 21 Oct"
    function dayWord(ms, now) {
        const k = dayKey(ms), t = dayKey(now);
        if (k === t) return 'today';
        if (k === addDays(t, -1)) return 'yesterday';
        if (k === addDays(t, 1)) return 'tomorrow';
        return dateLabel(ms);
    }
    const when = (ms, now, h12) => clock(ms, h12) + ' ' + dayWord(ms, now);
    const plural = (n, one, many) => n + ' ' + (n === 1 ? one : (many || one + 's'));

    // "2026-10-21" + "20:00" -> ms in local time; null when not a real date/time
    function parseLocal(date, time) {
        const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || '').trim());
        const tm = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(String(time || '').trim());
        if (!dm || !tm) return null;
        const y = +dm[1], mo = +dm[2], d = +dm[3], h = +tm[1], mi = +tm[2];
        if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
        const dt = new Date(y, mo - 1, d, h, mi);
        return dt.getMonth() === mo - 1 && dt.getDate() === d ? dt.getTime() : null;
    }
    const dateInput = ms => dayKey(ms);
    const timeInput = ms => { const d = new Date(ms); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };

    // Reads a typed goal in hours ("16", "16.5", "16,5") plus optional minutes -> whole minutes, or null
    function parseGoal(hours, minutes) {
        const ht = String(hours == null ? '' : hours).trim().replace(',', '.');
        const mt = String(minutes == null ? '' : minutes).trim();
        if (!/^\d{1,3}(\.\d{1,2})?$/.test(ht)) return null;
        if (mt !== '' && !/^\d{1,2}$/.test(mt)) return null;
        const m = mt === '' ? 0 : +mt;
        if (m > 59) return null;
        const total = Math.round(parseFloat(ht) * 60) + m;
        return total >= GOAL_MIN[0] && total <= GOAL_MIN[1] ? total : null;
    }
    function planName(goalMin) {
        const p = PLANS.find(x => x.h * 60 === goalMin);
        if (p) return p.name;
        return goalMin < 24 * 60 && goalMin % 60 === 0 ? (goalMin / 60) + ':' + (24 - goalMin / 60) : duration(goalMin) + ' fast';
    }
    // eating window that goes with a goal: 16 h -> 8 h; fasts of 24 h or more have none
    const windowMin = goalMin => goalMin < 24 * 60 ? 24 * 60 - goalMin : 0;

    const fastMin = f => minsOf(f.end - f.start);
    const isMet = f => fastMin(f) >= f.goalMin;

    function cleanSettings(s) {
        s = s && typeof s === 'object' ? s : {};
        return {
            goalMin: isInt(s.goalMin) && s.goalMin >= GOAL_MIN[0] && s.goalMin <= GOAL_MIN[1] ? s.goalMin : DEFAULT_SETTINGS.goalMin,
            h12: typeof s.h12 === 'boolean' ? s.h12 : DEFAULT_SETTINGS.h12,
            notify: typeof s.notify === 'boolean' ? s.notify : DEFAULT_SETTINGS.notify,
            vibrate: typeof s.vibrate === 'boolean' ? s.vibrate : DEFAULT_SETTINGS.vibrate
        };
    }
    function cleanNote(n) { return typeof n === 'string' ? n.replace(/[\r\n\t]+/g, ' ').trim().slice(0, NOTE_MAX) : ''; }
    function cleanFast(f) {
        if (!f || typeof f !== 'object') return null;
        if (!isNum(f.start) || !isNum(f.end) || f.end <= f.start || f.end - f.start > MAX_FAST_MIN * MIN) return null;
        if (!isInt(f.goalMin) || f.goalMin < GOAL_MIN[0] || f.goalMin > GOAL_MIN[1]) return null;
        return { id: typeof f.id === 'string' && f.id ? f.id.slice(0, 40) : 'f' + Math.round(f.start), start: Math.round(f.start), end: Math.round(f.end), goalMin: f.goalMin, note: cleanNote(f.note) };
    }
    const sortFasts = list => list.sort((a, b) => b.start - a.start);

    // Makes any saved or restored value safe to use. Returns { data, dropped } where dropped counts bad fasts left out.
    function cleanData(raw, now) {
        const d = raw && typeof raw === 'object' ? raw : {};
        const fasts = [], ids = new Set();
        let dropped = 0;
        (Array.isArray(d.fasts) ? d.fasts : []).forEach(f => {
            const c = cleanFast(f);
            if (!c) { dropped++; return; }
            while (ids.has(c.id)) c.id += 'x';
            ids.add(c.id); fasts.push(c);
        });
        let current = null;
        const c = d.current;
        if (c && typeof c === 'object' && isNum(c.start) && c.start <= now + MIN && now - c.start <= MAX_FAST_MIN * MIN &&
            isInt(c.goalMin) && c.goalMin >= GOAL_MIN[0] && c.goalMin <= GOAL_MIN[1]) {
            current = { start: Math.round(c.start), goalMin: c.goalMin, notified: c.notified === true };
        } else if (c) dropped++;
        return { data: { v: 1, settings: cleanSettings(d.settings), current, fasts: sortFasts(fasts) }, dropped };
    }
    const emptyData = () => ({ v: 1, settings: cleanSettings({}), current: null, fasts: [] });

    // Another saved fast that shares time with [start, end), or null. skipId leaves out the fast being edited.
    function overlap(fasts, start, end, skipId) {
        return fasts.find(f => f.id !== skipId && f.start < end && start < f.end) || null;
    }

    // Checks a fast typed by hand (new or edited). Returns { error } or { fast }.
    function checkFast(fasts, input, now, h12, skipId) {
        const { start, end, goalMin } = input;
        if (start == null) return { error: 'Enter the date and time the fast started.', field: 'start' };
        if (end == null) return { error: 'Enter the date and time the fast ended.', field: 'end' };
        if (start > now + MIN) return { error: 'The start is in the future.', field: 'start' };
        if (end > now + MIN) return { error: 'The end is in the future. If you are still fasting, use Start fast instead.', field: 'end' };
        if (end <= start) return { error: 'The end must be after the start. A fast that ends the next morning needs the next day\'s date.', field: 'end' };
        if (minsOf(end - start) < 1) return { error: 'The fast must be at least 1 minute long.', field: 'end' };
        if (end - start > MAX_FAST_MIN * MIN) return { error: 'A fast can be at most 7 days (168 h) long. Check the dates.', field: 'end' };
        if (goalMin == null) return { error: 'Enter a goal between 1 and 168 hours.', field: 'goal' };
        const o = overlap(fasts, start, end, skipId);
        if (o) return { error: 'This overlaps the fast from ' + clock(o.start, h12) + ' ' + dateLabel(o.start) + ' to ' + clock(o.end, h12) + ' ' + dateLabel(o.end) + '.', field: 'start' };
        return { fast: { start, end, goalMin, note: cleanNote(input.note) } };
    }
    // Checks the start of a fast that is still going ("I finished eating at ...").
    function checkStart(fasts, start, now, h12) {
        if (start == null) return { error: 'Enter the date and time you finished eating.' };
        if (start > now + MIN) return { error: 'That time is in the future. Pick when you finished your last meal.' };
        if (now - start > MAX_FAST_MIN * MIN) return { error: 'That is more than 7 days ago. Check the date.' };
        const last = fasts.reduce((a, f) => (!a || f.end > a.end ? f : a), null);
        if (last && start < last.end) return { error: 'Your last saved fast ended at ' + clock(last.end, h12) + ' ' + dateLabel(last.end) + '. The new fast must start after that.' };
        return { start };
    }

    // What the timer card should say right now.
    function status(data, now) {
        const h12 = data.settings.h12;
        if (data.current) {
            const c = data.current, elapsed = Math.max(0, now - c.start), goalAt = c.start + c.goalMin * MIN;
            const doneMin = minsOf(elapsed), reached = doneMin >= c.goalMin;
            return {
                mode: 'fasting', start: c.start, elapsed, goalMin: c.goalMin, goalAt, reached,
                pct: Math.min(1, elapsed / (c.goalMin * MIN)),
                leftMin: reached ? 0 : Math.max(1, Math.ceil((goalAt - now) / MIN)),
                extraMin: reached ? doneMin - c.goalMin : 0,
                startText: when(c.start, now, h12), goalText: when(goalAt, now, h12),
                forgot: elapsed > (c.goalMin + 12 * 60) * MIN
            };
        }
        const last = data.fasts.reduce((a, f) => (!a || f.end > a.end ? f : a), null);
        if (last && now - last.end < 2 * DAY && now >= last.end) {
            const win = windowMin(last.goalMin), nextAt = last.end + win * MIN, eatingMin = minsOf(now - last.end);
            return {
                mode: 'eating', last, lastMin: fastMin(last), met: isMet(last), eatingMin, windowMin: win,
                nextAt: win ? nextAt : null, nextText: win ? when(nextAt, now, h12) : '',
                windowLeftMin: win && now < nextAt ? Math.max(1, Math.ceil((nextAt - now) / MIN)) : 0,
                windowOver: win ? now >= nextAt : false, endText: when(last.end, now, h12)
            };
        }
        return { mode: 'idle', hasHistory: data.fasts.length > 0 };
    }

    // Days in a row (by the day each fast ended) with at least one fast that met its goal, counting back from today
    // (or from yesterday when today has none yet, so the streak does not drop to 0 in the morning).
    function streak(fasts, now) {
        const days = new Set(fasts.filter(isMet).map(f => dayKey(f.end)));
        let k = dayKey(now);
        if (!days.has(k)) k = addDays(k, -1);
        let n = 0;
        while (days.has(k)) { n++; k = addDays(k, -1); }
        return n;
    }
    // Last 7 days, today included, by the day each fast ended.
    function week(fasts, now) {
        const today = dayKey(now), from = addDays(today, -6);
        const inWeek = fasts.filter(f => dayKey(f.end) >= from && dayKey(f.end) <= today);
        const total = inWeek.reduce((a, f) => a + fastMin(f), 0);
        const days = [];
        for (let i = 6; i >= 0; i--) {
            const k = addDays(today, -i), ofDay = inWeek.filter(f => dayKey(f.end) === k);
            const best = ofDay.reduce((a, f) => (!a || fastMin(f) > fastMin(a) ? f : a), null);
            days.push({ key: k, label: WD[new Date(keyToMs(k)).getDay()], today: k === today, mins: best ? fastMin(best) : 0, goalMin: best ? best.goalMin : 0, met: best ? isMet(best) : false, count: ofDay.length });
        }
        const longestEver = fasts.reduce((a, f) => (!a || fastMin(f) > fastMin(a) ? f : a), null);
        return {
            count: inWeek.length, met: inWeek.filter(isMet).length, totalMin: total,
            avgMin: inWeek.length ? Math.round(total / inWeek.length) : 0,
            longestWeekMin: inWeek.reduce((a, f) => Math.max(a, fastMin(f)), 0),
            longestEver, streak: streak(fasts, now), allCount: fasts.length, allMet: fasts.filter(isMet).length, days
        };
    }

    function fastLine(f, h12) {
        const m = fastMin(f);
        return dateLabel(f.start) + ' ' + clock(f.start, h12) + ' to ' + (dayKey(f.end) === dayKey(f.start) ? '' : dateLabel(f.end) + ' ') + clock(f.end, h12) +
            ': ' + duration(m) + (isMet(f) ? ' (goal ' + duration(f.goalMin) + ' met)' : ' (goal ' + duration(f.goalMin) + ', ' + duration(f.goalMin - m) + ' short)') +
            (f.note ? ' - ' + f.note : '');
    }
    function summaryText(data, now) {
        const h12 = data.settings.h12, w = week(data.fasts, now), s = status(data, now), lines = ['My fasting, last 7 days'];
        if (s.mode === 'fasting') lines.push('Fasting now: ' + duration(minsOf(s.elapsed)) + ' since ' + s.startText + ', goal ' + duration(s.goalMin) + (s.reached ? ' reached' : ', can eat at ' + s.goalText));
        lines.push('Fasts: ' + w.count + ', goal met ' + w.met + ' of ' + w.count);
        if (w.count) lines.push('Average: ' + duration(w.avgMin) + ', longest: ' + duration(w.longestWeekMin));
        lines.push('Streak: ' + plural(w.streak, 'day') + ' in a row meeting the goal');
        const recent = data.fasts.filter(f => dayKey(f.end) >= addDays(dayKey(now), -6));
        if (recent.length) { lines.push(''); recent.forEach(f => lines.push('- ' + fastLine(f, h12))); }
        return lines.join('\n');
    }
    function csv(fasts, h12) {
        const q = v => /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
        const rows = [['Start date', 'Start time', 'End date', 'End time', 'Length (h:mm)', 'Length (minutes)', 'Goal (minutes)', 'Goal met', 'Note']];
        fasts.slice().sort((a, b) => a.start - b.start).forEach(f => {
            const m = fastMin(f);
            rows.push([dayKey(f.start), clock(f.start, h12), dayKey(f.end), clock(f.end, h12), Math.floor(m / 60) + ':' + pad(m % 60), String(m), String(f.goalMin), isMet(f) ? 'yes' : 'no', f.note || '']);
        });
        return rows.map(r => r.map(q).join(',')).join('\n') + '\n';
    }

    const api = { MIN, HOUR, DAY, MAX_FAST_MIN, GOAL_MIN, PLANS, DEFAULT_SETTINGS, NOTE_MAX, duration, stopwatch, clock, dayKey, addDays, dateLabel, dayWord, when, plural,
        parseLocal, dateInput, timeInput, parseGoal, planName, windowMin, fastMin, isMet, minsOf, cleanSettings, cleanFast, cleanNote, cleanData, emptyData, sortFasts,
        overlap, checkFast, checkStart, status, streak, week, fastLine, summaryText, csv };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Fast = api;
})(typeof window !== 'undefined' ? window : this);
