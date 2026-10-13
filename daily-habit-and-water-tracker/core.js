// Daily Habit and Water Tracker: the logic (dates, goals, streaks, checks). No page code here, so tests.js can check it.
// Dates are calendar days as 'YYYY-MM-DD' strings, worked out with UTC maths, so time zones and summer time never move a day.
(function (root) {
    const H = {};
    H.KINDS = ['check', 'count', 'limit'];
    H.COLORS = ['#0891b2', '#3b82f6', '#22c55e', '#f59e0b', '#f97316', '#f43f5e', '#8b5cf6', '#64748b'];
    H.MAX_HABITS = 40;
    H.MAX_TARGET = 100000;
    H.MAX_N = 1000000;
    // plural unit -> singular, for "1 glass" / "2 glasses"
    H.UNITS = { glasses: 'glass', cups: 'cup', ml: 'ml', oz: 'oz', minutes: 'minute', pages: 'page', steps: 'step', times: 'time', km: 'km', miles: 'mile' };

    const pad = n => String(n).padStart(2, '0');
    H.ymd = (y, m, d) => y + '-' + pad(m) + '-' + pad(d);
    H.fromDate = dt => H.ymd(dt.getFullYear(), dt.getMonth() + 1, dt.getDate()); // the local calendar day of a Date
    H.valid = s => {
        if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
        const [y, m, d] = s.split('-').map(Number), t = new Date(Date.UTC(y, m - 1, d));
        return y >= 1900 && y <= 2200 && t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
    };
    const utc = s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
    const fromUtc = t => { const x = new Date(t); return H.ymd(x.getUTCFullYear(), x.getUTCMonth() + 1, x.getUTCDate()); };
    H.add = (s, n) => fromUtc(utc(s) + n * 86400000);
    H.diff = (a, b) => Math.round((utc(b) - utc(a)) / 86400000); // days from a to b
    H.dow = s => new Date(utc(s)).getUTCDay(); // 0 Sunday .. 6 Saturday
    H.weekStart = (s, ws) => H.add(s, -((H.dow(s) - ws + 7) % 7));

    // ---------- whole numbers typed by people: "8", " 10,000 ", "10.000", "1 500"
    H.parseWhole = (str, min, max) => {
        const t = String(str == null ? '' : str).trim();
        if (!t) return { error: 'empty' };
        let s = t;
        if (/^\d{1,3}([,.\s\u00a0\u202f]\d{3})+$/.test(s)) s = s.replace(/[,.\s\u00a0\u202f]/g, '');
        if (/^-/.test(s)) return { error: 'negative' };
        if (/^\d+[.,]\d+$/.test(s)) return { error: 'decimal' };
        if (!/^\d+$/.test(s)) return { error: 'notnumber' };
        const n = Number(s);
        if (n < min) return { error: 'small', n };
        if (n > max) return { error: 'big', n };
        return { n };
    };

    // ---------- settings: each habit keeps a list of versions so a changed goal only counts from the day it changed
    H.first = h => h.versions[0].from;
    H.settings = (h, d) => { let v = null; for (const x of h.versions) { if (x.from <= d) v = x; else break; } return v; };
    H.planned = (v, d) => v.sched.type !== 'days' || v.sched.days.includes(H.dow(d));
    H.entry = (log, h, d) => { const e = (log[h.id] || {})[d]; return { n: e ? e.n : 0, s: !!(e && e.s) }; };
    H.metN = (v, n) => v.kind === 'check' ? n >= 1 : v.kind === 'count' ? n >= v.target : n <= v.target;
    const doneDay = (v, n) => v.kind === 'limit' ? n <= v.target : H.metN(v, n); // a "times a week" day that counts

    // the state of one habit on one day, for the strip, the grid and the streaks
    // future, before, skip, met, todo (today, not yet), ontrack (limit habit today, still under), missed, rest (not planned), extra (done on a rest day), open (times-a-week day not done)
    H.dayState = (h, log, d, today) => {
        if (d > today) return 'future';
        const v = H.settings(h, d);
        if (!v) return 'before';
        const e = H.entry(log, h, d);
        if (e.s) return 'skip';
        if (v.sched.type === 'week') return v.kind !== 'limit' && H.metN(v, e.n) ? 'met' : 'open';
        if (!H.planned(v, d)) return v.kind !== 'limit' && e.n > 0 && H.metN(v, e.n) ? 'extra' : 'rest';
        if (v.kind === 'limit') return e.n > v.target ? 'missed' : d === today ? 'ontrack' : 'met';
        if (H.metN(v, e.n)) return 'met';
        return d === today ? 'todo' : 'missed';
    };

    // a "times a week" habit: how many days done this week and the target (fewer when the habit started mid-week or days were skipped)
    H.week = (h, log, wsDate, today) => {
        const end = H.add(wsDate, 6), ref = end < today ? end : today, v = H.settings(h, ref);
        if (!v || v.sched.type !== 'week') return null;
        const start = H.first(h);
        let eligible = 0, done = 0;
        for (let i = 0; i < 7; i++) {
            const d = H.add(wsDate, i);
            if (d < start) continue;
            const e = H.entry(log, h, d);
            if (e.s) continue;
            eligible++;
            const dv = H.settings(h, d);
            if (d <= today && dv && doneDay(dv, e.n) && (dv.kind !== 'check' || e.n >= 1)) done++;
        }
        const target = Math.min(v.sched.times, eligible);
        const state = target === 0 ? 'none' : done >= target ? 'met' : end >= today ? 'open' : 'unmet';
        return { done, target, times: v.sched.times, state, from: wsDate, to: end };
    };

    // current and best streak. Days for daily / some-days / limit habits, weeks for "times a week" habits.
    // Skipped days and days the habit is not planned never break a streak. Today only adds to it once done
    // (a limit habit's today is never counted: the day is not over yet).
    H.streak = (h, log, today, ws) => {
        const v = H.settings(h, today);
        if (!v) return { cur: 0, best: 0, unit: 'day' };
        const start = H.first(h);
        let run = 0, best = 0;
        if (v.sched.type === 'week') {
            for (let w = H.weekStart(start, ws); w <= today; w = H.add(w, 7)) {
                const r = H.week(h, log, w, today);
                if (!r) continue;
                if (r.state === 'met') { run++; best = Math.max(best, run); }
                else if (r.state === 'unmet') run = 0;
            }
            return { cur: run, best, unit: 'week' };
        }
        const span = Math.min(H.diff(start, today), 3700);
        for (let i = span; i >= 0; i--) {
            const st = H.dayState(h, log, H.add(today, -i), today);
            if (st === 'met') { run++; best = Math.max(best, run); }
            else if (st === 'missed') run = 0;
        }
        return { cur: run, best, unit: 'day' };
    };

    // how often it was kept: last 30 days (or last 4 finished weeks plus this week once met)
    H.rate = (h, log, today, ws) => {
        const v = H.settings(h, today);
        if (!v) return { met: 0, of: 0, unit: 'day' };
        let met = 0, of = 0;
        if (v.sched.type === 'week') {
            const cw = H.weekStart(today, ws);
            for (let i = 4; i >= 0; i--) {
                const r = H.week(h, log, H.add(cw, -7 * i), today);
                if (!r) continue;
                if (r.state === 'met') { met++; of++; } else if (r.state === 'unmet') of++;
            }
            return { met, of, unit: 'week' };
        }
        for (let i = 29; i >= 0; i--) {
            const st = H.dayState(h, log, H.add(today, -i), today);
            if (st === 'met') { met++; of++; } else if (st === 'missed') of++;
        }
        return { met, of, unit: 'day' };
    };

    // everything the page needs for one habit on day d
    H.info = (h, log, d, today, ws) => {
        const v = H.settings(h, d);
        if (!v) return null;
        const e = H.entry(log, h, d), state = H.dayState(h, log, d, today);
        let due, done, week = null;
        if (e.s) { due = false; done = false; }
        else if (v.sched.type === 'week') {
            week = H.week(h, log, H.weekStart(d, ws), today);
            done = state === 'met';
            const before = week ? week.done - (done ? 1 : 0) : 0;
            due = done || (week && before < week.target);
        } else if (!H.planned(v, d)) { due = false; done = state === 'extra'; }
        else { due = true; done = state === 'met' || state === 'ontrack'; }
        return { h, v, n: e.n, skipped: e.s, state, due: !!due, done: !!done, week };
    };
    H.dayTotals = (habits, log, d, today, ws) => {
        const list = habits.map(h => H.info(h, log, d, today, ws)).filter(Boolean);
        const due = list.filter(i => i.due);
        return { list, due: due.length, done: due.filter(i => i.done).length };
    };

    // ---------- words
    const DAY3 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    H.DAY3 = DAY3;
    H.unitText = (unit, n) => n === 1 && H.UNITS[unit] ? H.UNITS[unit] : unit;
    H.amount = (n, unit) => H.fmtN(n) + (unit ? ' ' + H.unitText(unit, n) : '');
    H.fmtN = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    H.schedText = (v, ws) => {
        const s = v.sched;
        if (s.type === 'daily') return 'Every day';
        if (s.type === 'week') return s.times === 1 ? 'Once a week' : s.times + ' times a week';
        const days = s.days.slice().sort((a, b) => ((a - ws + 7) % 7) - ((b - ws + 7) % 7));
        const key = s.days.slice().sort().join('');
        if (key === '12345') return 'Weekdays (Mon to Fri)';
        if (key === '06') return 'Weekends';
        if (days.length === 7) return 'Every day';
        return days.map(i => DAY3[i]).join(', ');
    };
    H.goalText = v => v.kind === 'check' ? 'Tick when done' : v.kind === 'count' ? H.amount(v.target, v.unit) + ' a day' : 'No more than ' + H.amount(v.target, v.unit) + ' a day';
    // the status line for one habit on the day being shown
    H.statusText = (i, isToday) => {
        const v = i.v, n = i.n;
        if (i.skipped) return 'Skipped' + (isToday ? ' today' : '') + ', does not break the streak';
        if (v.kind === 'check') {
            if (n >= 1) return 'Done';
            if (v.sched.type === 'week' && i.week && !i.due) return 'Done ' + i.week.done + ' of ' + i.week.target + ' this week, nothing more needed';
            if (i.state === 'rest') return 'Not planned for this day';
            return isToday ? 'Not done yet' : 'Not done';
        }
        if (v.kind === 'count') {
            if (n >= v.target) return H.amount(n, v.unit) + ', goal reached';
            const left = v.target - n;
            if (i.state === 'rest' || (v.sched.type === 'week' && !i.due)) return H.fmtN(n) + ' of ' + H.amount(v.target, v.unit);
            return H.fmtN(n) + ' of ' + H.amount(v.target, v.unit) + ', ' + H.amount(left, v.unit) + ' to go';
        }
        if (n > v.target) return H.amount(n, v.unit) + ', ' + H.amount(n - v.target, v.unit) + ' over the limit';
        if (n === 0 && v.target === 0) return H.amount(0, v.unit) + ', on track';
        if (n === v.target) return H.amount(n, v.unit) + ', at the limit';
        return H.fmtN(n) + ' of ' + H.amount(v.target, v.unit) + ', ' + H.amount(v.target - n, v.unit) + ' left';
    };
    H.streakText = (s, kind) => {
        const u = s.unit === 'week' ? 'week' : 'day', p = n => n + ' ' + u + (n === 1 ? '' : 's');
        return 'Streak: ' + p(s.cur) + (s.best > s.cur ? ' · Best: ' + p(s.best) : '');
    };

    // ---------- making and checking habits
    H.newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
    H.cleanSched = s => {
        if (!s || typeof s !== 'object') return null;
        if (s.type === 'daily') return { type: 'daily' };
        if (s.type === 'days') {
            const days = Array.isArray(s.days) ? [...new Set(s.days.filter(d => Number.isInteger(d) && d >= 0 && d <= 6))].sort() : [];
            return days.length ? { type: 'days', days } : null;
        }
        if (s.type === 'week') return Number.isInteger(s.times) && s.times >= 1 && s.times <= 7 ? { type: 'week', times: s.times } : null;
        return null;
    };
    H.cleanVersion = x => {
        if (!x || typeof x !== 'object' || !H.valid(x.from) || !H.KINDS.includes(x.kind)) return null;
        const sched = H.cleanSched(x.sched);
        if (!sched) return null;
        if (x.kind === 'check') return { from: x.from, kind: 'check', target: 1, unit: '', step: 1, sched };
        const minT = x.kind === 'limit' ? 0 : 1;
        if (!Number.isInteger(x.target) || x.target < minT || x.target > H.MAX_TARGET) return null;
        const step = Number.isInteger(x.step) && x.step >= 1 && x.step <= H.MAX_TARGET ? x.step : 1;
        const unit = typeof x.unit === 'string' ? x.unit.trim().slice(0, 20) : '';
        if (x.kind === 'limit' && sched.type === 'week') return null;
        return { from: x.from, kind: x.kind, target: x.target, unit, step, sched };
    };
    H.cleanHabit = x => {
        if (!x || typeof x !== 'object' || typeof x.id !== 'string' || !/^[a-z0-9]{1,24}$/.test(x.id)) return null;
        const name = typeof x.name === 'string' ? x.name.replace(/\s+/g, ' ').trim().slice(0, 60) : '';
        if (!name || !Array.isArray(x.versions)) return null;
        const seen = new Set(), versions = x.versions.map(H.cleanVersion).filter(v => v && !seen.has(v.from) && seen.add(v.from)).sort((a, b) => a.from < b.from ? -1 : 1);
        if (!versions.length || versions.length > 400) return null;
        const color = H.COLORS.includes(x.color) ? x.color : H.COLORS[0];
        return { id: x.id, name, color, versions };
    };
    // a whole saved state or backup file; returns null if it is not ours at all
    H.clean = data => {
        if (!data || typeof data !== 'object' || !Array.isArray(data.habits)) return null;
        const ids = new Set(), habits = [];
        for (const x of data.habits) {
            const h = H.cleanHabit(x);
            if (h && !ids.has(h.id) && habits.length < H.MAX_HABITS) { ids.add(h.id); habits.push(h); }
        }
        const log = {};
        const src = data.log && typeof data.log === 'object' ? data.log : {};
        for (const id of ids) {
            const days = src[id];
            if (!days || typeof days !== 'object') continue;
            const out = {};
            for (const d of Object.keys(days)) {
                const e = days[d];
                if (!H.valid(d) || !e || typeof e !== 'object') continue;
                const n = Number.isInteger(e.n) && e.n >= 0 && e.n <= H.MAX_N ? e.n : 0, s = e.s === 1 || e.s === true;
                if (n || s) out[d] = s ? { n, s: 1 } : { n };
            }
            if (Object.keys(out).length) log[id] = out;
        }
        return { habits, log, weekStart: data.weekStart === 0 ? 0 : 1 };
    };

    // change one day's amount (keeps a "skipped" mark only when asked)
    H.setN = (log, id, d, n, skip) => {
        const days = log[id] || (log[id] = {});
        n = Math.max(0, Math.min(H.MAX_N, n | 0));
        if (!n && !skip) delete days[d]; else days[d] = skip ? { n, s: 1 } : { n };
        if (!Object.keys(days).length) delete log[id];
    };

    // apply edited settings from day `from`. allPast: use the new goal for every earlier day too.
    H.applyVersion = (h, nv, from, allPast) => {
        const v = Object.assign({}, nv, { from });
        if (allPast) { h.versions = [Object.assign(v, { from: H.first(h) })]; return h; }
        const keep = h.versions.filter(x => x.from < from);
        h.versions = keep.concat(v);
        if (!keep.length) v.from = from; // the habit starts today
        return h;
    };
    // move the start day. Earlier: the first version starts earlier. Later: earlier versions are dropped.
    H.setStart = (h, start) => {
        const later = h.versions.filter(x => x.from > start);
        const base = H.settings(h, start) || h.versions[0];
        h.versions = [Object.assign({}, base, { from: start })].concat(later);
        return h;
    };

    // ---------- calendar reminder file (.ics): floating local time, so it rings at that time wherever you are
    H.ics = (h, v, time, startDay, stamp) => {
        const [hh, mm] = time.split(':');
        const d = startDay.replace(/-/g, '');
        const esc = s => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
        const BY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
        const rule = v.sched.type === 'days' ? 'RRULE:FREQ=WEEKLY;BYDAY=' + v.sched.days.map(i => BY[i]).join(',') : 'RRULE:FREQ=DAILY';
        let first = startDay;
        if (v.sched.type === 'days') while (!v.sched.days.includes(H.dow(first))) first = H.add(first, 1);
        const fd = first.replace(/-/g, '');
        const title = esc('Habit: ' + h.name + (v.kind === 'count' ? ' (' + H.amount(v.target, v.unit) + ')' : v.kind === 'limit' ? ' (no more than ' + H.amount(v.target, v.unit) + ')' : ''));
        const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//umar8092//Daily Habit and Water Tracker//EN', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
            'UID:daily-habit-and-water-tracker-' + h.id + '-' + d + '@umar8092.github.io', 'DTSTAMP:' + stamp,
            'DTSTART:' + fd + 'T' + hh + mm + '00', 'DURATION:PT10M', rule, 'SUMMARY:' + title,
            'DESCRIPTION:' + esc('Log it in the Daily Habit and Water Tracker: https://umar8092.github.io/apps/daily-habit-and-water-tracker/'),
            'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + title, 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'];
        return lines.map(l => { const out = []; while (l.length > 73) { out.push(l.slice(0, 73)); l = ' ' + l.slice(73); } out.push(l); return out.join('\r\n'); }).join('\r\n') + '\r\n';
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = H;
    root.HabitCore = H;
})(typeof window !== 'undefined' ? window : globalThis);
