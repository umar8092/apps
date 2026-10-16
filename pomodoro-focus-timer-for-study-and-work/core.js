// Pomodoro Focus Timer: the logic, with no page code. Works in the browser (window.Focus) and in node (module.exports).
// Times are whole milliseconds since 1970 (Date.now()). Focus time is saved as whole minutes, so every total adds up exactly.
(function (root) {
    'use strict';
    const MIN = 60000;
    const MODES = ['focus', 'short', 'long'];
    const LIMITS = { focus: [1, 180], short: [1, 60], long: [1, 90], every: [0, 12], goal: [0, 30], est: [1, 50] };
    const DEFAULT_SETTINGS = { focus: 25, short: 5, long: 15, every: 4, autoBreak: false, autoFocus: false,
        sound: 'bell', vibrate: true, awake: false, notify: false, goal: 0 };
    const PRESETS = { classic: { focus: 25, short: 5, long: 15, every: 4 }, long: { focus: 50, short: 10, long: 30, every: 3 }, deep: { focus: 90, short: 20, long: 30, every: 2 } };
    const LIVE_MS = 5000;  // an end noticed within 5 s happened while the page was open

    const pad = n => String(n).padStart(2, '0');
    const isInt = n => typeof n === 'number' && Number.isInteger(n);
    const clampInt = (v, lo, hi, dflt) => { const n = typeof v === 'string' && /^\s*\d+\s*$/.test(v) ? +v : v; return isInt(n) && n >= lo && n <= hi ? n : dflt; };

    // Reads a typed whole number of minutes; null when blank or not allowed.
    function parseWhole(text, lo, hi) {
        const t = String(text == null ? '' : text).trim();
        if (!/^\d{1,4}$/.test(t)) return null;
        const n = +t;
        return n >= lo && n <= hi ? n : null;
    }

    function dayKey(ms) { const d = new Date(ms); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
    function dayStart(key) { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d).getTime(); }
    function addDays(key, n) { const [y, m, d] = key.split('-').map(Number); return dayKey(new Date(y, m - 1, d + n, 12).getTime()); }
    const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    function dayLabel(key, withYear) { const d = new Date(dayStart(key)); return WD[d.getDay()] + ' ' + d.getDate() + ' ' + MO[d.getMonth()] + (withYear ? ' ' + d.getFullYear() : ''); }
    function clock(ms) { const d = new Date(ms); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }

    // 1500000 ms -> "25:00"; 3725000 -> "1:02:05". Rounds up so 0:00 shows only at the very end.
    function countdown(ms) {
        const s = Math.max(0, Math.ceil(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), r = s % 60;
        return h ? h + ':' + pad(m) + ':' + pad(r) : pad(m) + ':' + pad(r);
    }
    // 100 -> "1 h 40 min"; 25 -> "25 min"; 0 -> "0 min"; 60 -> "1 h"
    function duration(mins) {
        const h = Math.floor(mins / 60), m = mins % 60;
        return h ? h + ' h' + (m ? ' ' + m + ' min' : '') : m + ' min';
    }
    const plural = (n, one, many) => n + ' ' + (n === 1 ? one : (many || one + 's'));

    function cleanSettings(s) {
        s = s && typeof s === 'object' ? s : {};
        const out = {};
        for (const k of ['focus', 'short', 'long', 'every', 'goal']) out[k] = clampInt(s[k], LIMITS[k][0], LIMITS[k][1], DEFAULT_SETTINGS[k]);
        for (const k of ['autoBreak', 'autoFocus', 'vibrate', 'awake', 'notify']) out[k] = typeof s[k] === 'boolean' ? s[k] : DEFAULT_SETTINGS[k];
        out.sound = ['bell', 'beep', 'off'].includes(s.sound) ? s.sound : DEFAULT_SETTINGS.sound;
        return out;
    }

    const lengthOf = (mode, settings) => settings[mode] * MIN;

    function newTimer(settings, mode) {
        mode = MODES.includes(mode) ? mode : 'focus';
        return { mode, status: 'idle', length: lengthOf(mode, settings), remaining: lengthOf(mode, settings), endsAt: null, startedAt: null, cycle: 0, cycleDay: null, taskId: null };
    }

    function remainingAt(t, now) { return t.status === 'running' ? Math.max(0, t.endsAt - now) : t.remaining; }
    function elapsedAt(t, now) { return Math.max(0, t.length - remainingAt(t, now)); }

    function start(t, now) {
        if (t.status === 'running') return t;
        const n = Object.assign({}, t, { status: 'running', endsAt: now + t.remaining, startedAt: t.startedAt == null ? now : t.startedAt });
        // a new day starts the count to the long break again
        if (n.mode === 'focus' && n.cycleDay !== dayKey(now)) { n.cycle = 0; n.cycleDay = dayKey(now); }
        return n;
    }
    function pause(t, now) {
        if (t.status !== 'running') return t;
        return Object.assign({}, t, { status: 'paused', remaining: Math.max(0, t.endsAt - now), endsAt: null });
    }

    // the break that follows a focus block, given the number of full blocks done since the last long break
    function breakAfter(cycle, settings) { return settings.every > 0 && cycle > 0 && cycle % settings.every === 0 ? 'long' : 'short'; }

    function idlePhase(t, mode, settings) {
        return Object.assign({}, t, { mode, status: 'idle', length: lengthOf(mode, settings), remaining: lengthOf(mode, settings), endsAt: null, startedAt: null });
    }

    function makeRecord(t, mins, end, full, tasks) {
        const task = t.taskId && tasks ? tasks.find(x => x.id === t.taskId) : null;
        return { id: 'r' + t.startedAt, start: t.startedAt, end, mins, task: task ? task.id : null, name: task ? task.name : '', full };
    }

    // Moves the timer past every phase that has ended by `now`. Returns {timer, records, ended} where ended lists
    // {mode, at, next, live} for each phase that ran out (live = noticed within a few seconds, so sound is right).
    // A focus block only starts by itself if the break ended while the page was open, so an evening away
    // never fills the log with blocks nobody did.
    function advance(t, settings, now, tasks) {
        const records = [], ended = [];
        let guard = 0;
        while (t.status === 'running' && t.endsAt <= now && guard++ < 500) {
            const at = t.endsAt, live = now - at < LIVE_MS, mode = t.mode;
            let next;
            if (mode === 'focus') {
                records.push(makeRecord(t, Math.round(t.length / MIN), at, true, tasks));
                const cycle = t.cycle + 1;
                next = breakAfter(cycle, settings);
                t = Object.assign(idlePhase(t, next, settings), { cycle });
            } else {
                next = 'focus';
                t = idlePhase(t, 'focus', settings);
                if (mode === 'long') t.cycle = 0;
            }
            ended.push({ mode, at, next, live });
            const auto = next === 'focus' ? settings.autoFocus && live : settings.autoBreak;
            if (auto) t = start(t, at);
        }
        return { timer: t, records, ended };
    }

    // Stops the current phase early. how = 'reset' (same phase, full length again) or 'skip' (go to the next phase).
    // count = true keeps the focus minutes done so far (whole minutes, at least 1). Skipped focus does not count towards the long break.
    function stopEarly(t, settings, now, how, count, tasks) {
        const records = [];
        if (t.mode === 'focus' && count && t.startedAt != null) {
            const done = elapsedAt(t, now), mins = Math.round(done / MIN);
            if (done >= MIN) records.push(makeRecord(t, Math.min(mins, Math.round(t.length / MIN)), now, false, tasks));
        }
        let next = t.mode;
        if (how === 'skip') next = t.mode === 'focus' ? 'short' : 'focus';
        let n = idlePhase(t, next, settings);
        if (how === 'skip' && t.mode === 'long') n.cycle = 0;
        return { timer: n, records };
    }

    function switchMode(t, mode, settings) { return idlePhase(t, mode, settings); }

    // Settings changed: an untouched phase takes the new length at once; a started one keeps going.
    function applySettings(t, settings) { return t.startedAt == null && t.status === 'idle' ? idlePhase(t, t.mode, settings) : t; }

    // ----- tasks -----
    function cleanName(s) { return String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120); }
    // Pasted lists: one task per line, bullets and numbering removed, blank lines and repeats dropped.
    function splitTasks(text) {
        const seen = new Set(), out = [];
        for (const line of String(text || '').split(/\r?\n/)) {
            const name = cleanName(line.replace(/^\s*(?:[-*•–]|\d{1,3}[.)]|\[\s?[xX]?\s?\])\s+/, ''));
            const k = name.toLowerCase();
            if (name && !seen.has(k)) { seen.add(k); out.push(name); }
        }
        return out;
    }

    // ----- summaries -----
    function recordsOn(records, key) { return records.filter(r => dayKey(r.start) === key).sort((a, b) => a.start - b.start); }
    function totals(records) {
        let mins = 0, blocks = 0, partMins = 0;
        for (const r of records) { mins += r.mins; if (r.full) blocks++; else partMins += r.mins; }
        return { mins, blocks, partMins };
    }
    // "3 blocks + 12 min", "1 block", "12 min stopped early"
    function blocksText(t) {
        if (!t.blocks && !t.partMins) return 'no blocks';
        if (!t.blocks) return t.partMins + ' min stopped early';
        return plural(t.blocks, 'block') + (t.partMins ? ' + ' + t.partMins + ' min' : '');
    }
    // per task for a list of records, most time first; tasks without a name go last as "No task"
    function byTask(records, tasks) {
        const map = new Map();
        for (const r of records) {
            const live = r.task && tasks ? tasks.find(x => x.id === r.task) : null;
            const key = r.task || '', name = live ? live.name : (r.name || 'No task picked');
            if (!map.has(key)) map.set(key, { id: r.task, name, recs: [] });
            map.get(key).recs.push(r);
        }
        return [...map.values()].map(g => Object.assign(g, totals(g.recs)))
            .sort((a, b) => (a.id ? 0 : 1) - (b.id ? 0 : 1) || b.mins - a.mins || a.name.localeCompare(b.name));
    }
    function taskTotals(records, id) { return totals(records.filter(r => r.task === id)); }

    function summaryText(records, tasks, key) {
        const recs = recordsOn(records, key), t = totals(recs);
        const lines = ['Focus time, ' + dayLabel(key, true) + ': ' + duration(t.mins) + ' (' + blocksText(t) + ')'];
        for (const g of byTask(recs, tasks)) lines.push('- ' + g.name + ': ' + duration(g.mins) + ' (' + blocksText(g) + ')');
        if (!recs.length) lines.push('No focus time logged.');
        return lines.join('\n');
    }

    // last 7 days ending today, oldest first
    function week(records, todayKey) {
        const days = [];
        for (let i = 6; i >= 0; i--) { const key = addDays(todayKey, -i); days.push(Object.assign({ key }, totals(recordsOn(records, key)))); }
        const mins = days.reduce((a, d) => a + d.mins, 0), active = days.filter(d => d.mins > 0).length;
        return { days, mins, blocks: days.reduce((a, d) => a + d.blocks, 0), active, max: Math.max(0, ...days.map(d => d.mins)) };
    }
    // days in a row with any focus time, counting today only if it has some
    function streak(records, todayKey) {
        const keys = new Set(records.map(r => dayKey(r.start)));
        let key = keys.has(todayKey) ? todayKey : addDays(todayKey, -1), n = 0;
        while (keys.has(key) && n < 4000) { n++; key = addDays(key, -1); }
        return n;
    }

    function csv(records, tasks) {
        const q = s => /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
        const rows = ['Date,Start,End,Minutes,Task,Full block'];
        for (const r of [...records].sort((a, b) => a.start - b.start)) {
            const live = r.task && tasks ? tasks.find(x => x.id === r.task) : null;
            let name = live ? live.name : r.name;
            if (/^[=+\-@]/.test(name)) name = "'" + name;  // never let a spreadsheet run a task name as a formula
            rows.push([dayKey(r.start), clock(r.start), clock(r.end), r.mins, q(name), r.full ? 'yes' : 'no'].join(','));
        }
        return rows.join('\n') + '\n';
    }

    // ----- saved data -----
    function cleanTask(x) {
        if (!x || typeof x !== 'object' || typeof x.id !== 'string' || !/^[\w-]{1,40}$/.test(x.id)) return null;
        const name = cleanName(x.name);
        if (!name) return null;
        return { id: x.id, name, est: clampInt(x.est, 1, 50, null), done: x.done === true, created: isInt(x.created) ? x.created : 0 };
    }
    const okTime = n => isInt(n) && n > 946684800000 && n < 4102444800000;  // 2000 to 2100
    function cleanRecord(x) {
        if (!x || typeof x !== 'object' || !okTime(x.start) || !okTime(x.end) || x.end < x.start) return null;
        const mins = clampInt(x.mins, 1, 600, null);
        if (mins == null) return null;
        return { id: typeof x.id === 'string' && x.id.length <= 40 ? x.id : 'r' + x.start, start: x.start, end: x.end, mins,
            task: typeof x.task === 'string' && x.task.length <= 40 ? x.task : null, name: cleanName(x.name), full: x.full === true };
    }
    function cleanTimer(x, settings) {
        const t = newTimer(settings, x && x.mode);
        if (!x || typeof x !== 'object') return t;
        if (['running', 'paused'].includes(x.status) && okTime(x.startedAt) && isInt(x.length) && x.length > 0 && x.length <= 180 * MIN) {
            t.status = x.status; t.length = x.length; t.startedAt = x.startedAt;
            if (x.status === 'running' && okTime(x.endsAt)) t.endsAt = x.endsAt;
            else if (x.status === 'paused' && isInt(x.remaining) && x.remaining >= 0 && x.remaining <= x.length) t.remaining = x.remaining;
            else return newTimer(settings, x.mode);
            if (t.status === 'running') t.remaining = t.length;
        }
        t.cycle = clampInt(x.cycle, 0, 99, 0);
        t.cycleDay = typeof x.cycleDay === 'string' && /^\d{4}-\d\d-\d\d$/.test(x.cycleDay) ? x.cycleDay : null;
        t.taskId = typeof x.taskId === 'string' && x.taskId.length <= 40 ? x.taskId : null;
        return t;
    }
    // Checks every value from storage or a backup file. Bad rows are dropped, never trusted.
    function cleanData(d) {
        d = d && typeof d === 'object' && !Array.isArray(d) ? d : {};
        const settings = cleanSettings(d.settings);
        const ids = new Set(), tasks = [];
        for (const x of Array.isArray(d.tasks) ? d.tasks.slice(0, 500) : []) { const c = cleanTask(x); if (c && !ids.has(c.id)) { ids.add(c.id); tasks.push(c); } }
        const rids = new Set(), records = [];
        for (const x of Array.isArray(d.records) ? d.records.slice(0, 50000) : []) { const c = cleanRecord(x); if (c && !rids.has(c.id)) { rids.add(c.id); records.push(c); } }
        const timer = cleanTimer(d.timer, settings);
        if (timer.taskId && !ids.has(timer.taskId)) timer.taskId = null;
        return { v: 1, settings, tasks, records, timer };
    }
    // adds records that are not there yet (two tabs finishing the same block save it once)
    function mergeRecords(list, add) {
        const ids = new Set(list.map(r => r.id));
        return list.concat(add.filter(r => !ids.has(r.id) && (ids.add(r.id), true)));
    }

    const api = { MIN, MODES, LIMITS, DEFAULT_SETTINGS, PRESETS, parseWhole, dayKey, dayStart, addDays, dayLabel, clock, countdown, duration, plural,
        cleanSettings, newTimer, remainingAt, elapsedAt, start, pause, advance, stopEarly, switchMode, applySettings, breakAfter,
        cleanName, splitTasks, recordsOn, totals, blocksText, byTask, taskTotals, summaryText, week, streak, csv, cleanData, mergeRecords };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Focus = api;
})(typeof window !== 'undefined' ? window : globalThis);
