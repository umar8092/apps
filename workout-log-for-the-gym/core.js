// Workout Log for the Gym: the logic, with no page code. Works in the browser (window.WorkoutCore) and in node (require).
// Weights are whole hundredths of the unit they were typed in (62.5 kg is { w: 6250, u: 'kg' }), so nothing drifts.
// Comparisons use whole grams. Times of day are milliseconds since 1970 in the person's own clock.
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.WorkoutCore = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const LB_G = 453.59237;                 // grams in one pound
    const KINDS = ['weight', 'body', 'time'];
    const KIND_LABEL = { weight: 'Weight × reps', body: 'Bodyweight reps', time: 'Time hold' };
    const REST_PRESETS = [0, 30, 45, 60, 90, 120, 180, 300];
    const LIMIT = { name: 60, plan: 40, plans: 30, exPerPlan: 40, setsPerEx: 60, note: 300, maxKg: 1000, maxLb: 2200, maxReps: 999, maxSec: 36000, minRest: 5, maxRest: 900 };

    // ---------- numbers ----------
    // "62.5", "62,5", " 60 kg", "135lb" -> hundredths. Blank -> null.
    function parseWeight(str, unit) {
        const s = String(str == null ? '' : str).trim().toLowerCase().replace(/\s*(kgs?|lbs?|pounds?|kilos?)$/, '').replace(',', '.').trim();
        if (s === '') return { empty: true };
        if (!/^\d*\.?\d+$|^\d+\.$/.test(s)) return { err: s.startsWith('-') ? 'The weight cannot be below 0.' : 'Type the weight as a number, like 62.5.' };
        const v = Math.round(parseFloat(s) * 100);
        const max = unit === 'lb' ? LIMIT.maxLb : LIMIT.maxKg;
        if (v > max * 100) return { err: 'That is more than ' + max + ' ' + unit + '. Check the weight.' };
        return { v };
    }
    function parseReps(str) {
        const s = String(str == null ? '' : str).trim();
        if (s === '') return { empty: true };
        if (/^-/.test(s)) return { err: 'Reps cannot be below 1.' };
        if (!/^\d+$/.test(s)) return { err: 'Reps are a whole number, like 8.' };
        const v = parseInt(s, 10);
        if (v < 1) return { err: '0 reps is nothing to log. Type the reps you did.' };
        if (v > LIMIT.maxReps) return { err: 'That is more than ' + LIMIT.maxReps + ' reps. Check the number.' };
        return { v };
    }
    // "45", "45s", "1:30", "1m 30s", "2 min" -> seconds.
    function parseDuration(str) {
        const s = String(str == null ? '' : str).trim().toLowerCase();
        if (s === '') return { empty: true };
        let sec = null, m;
        if ((m = s.match(/^(\d+):([0-5]?\d)$/))) sec = +m[1] * 60 + +m[2];
        else if ((m = s.match(/^(\d+):([0-5]\d):([0-5]\d)$/))) sec = +m[1] * 3600 + +m[2] * 60 + +m[3];
        else if ((m = s.match(/^(\d+)\s*(s|sec|secs|seconds?)?$/))) sec = +m[1];
        else if ((m = s.match(/^(?:(\d+)\s*(?:m|min|mins|minutes?))\s*(?:(\d+)\s*(?:s|sec|secs|seconds?)?)?$/))) sec = +m[1] * 60 + (m[2] ? +m[2] : 0);
        if (sec == null) return { err: s.startsWith('-') ? 'The time cannot be below 0.' : 'Type the time like 45 or 1:30.' };
        if (sec < 1) return { err: '0 seconds is nothing to log. Type how long you held it.' };
        if (sec > LIMIT.maxSec) return { err: 'That is more than 10 hours. Check the time.' };
        return { v: sec };
    }

    const toGrams = (w, u) => u === 'lb' ? Math.round(w * LB_G / 100) : w * 10;
    // grams -> hundredths of the unit, rounded to 0.1 so converted weights stay readable
    const fromGrams = (g, u) => u === 'lb' ? Math.round(g / LB_G * 10) * 10 : Math.round(g / 100) * 10;
    // A set's weight in the unit being shown: exact when it was typed in that unit.
    const weightIn = (w, from, to) => from === to ? w : fromGrams(toGrams(w, from), to);

    function group3(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
    // hundredths -> "62.5", "60", "61.25"
    function fmtNum(h) {
        const neg = h < 0; h = Math.abs(Math.round(h));
        const whole = Math.floor(h / 100), frac = h % 100;
        let s = group3(whole);
        if (frac) s += '.' + (frac % 10 ? String(frac).padStart(2, '0') : String(frac / 10));
        return (neg ? '-' : '') + s;
    }
    const fmtW = (w, u) => fmtNum(w) + ' ' + u;
    // seconds -> "45 s", "1:30", "1:02:05"
    function fmtSec(s) {
        s = Math.max(0, Math.round(s));
        if (s < 60) return s + ' s';
        const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), r = s % 60;
        return h ? h + ':' + String(m).padStart(2, '0') + ':' + String(r).padStart(2, '0') : m + ':' + String(r).padStart(2, '0');
    }
    // a countdown "1:05" / "0:09"
    const clock = s => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
    // milliseconds -> "52 min", "1 h 5 min"
    function fmtLen(ms) {
        const min = Math.max(0, Math.round(ms / 60000));
        if (min < 60) return min + ' min';
        return Math.floor(min / 60) + ' h' + (min % 60 ? ' ' + (min % 60) + ' min' : '');
    }
    function fmtRest(s) {
        if (!s) return 'Off';
        if (s < 60) return s + ' s';
        return s % 60 ? Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') + ' min' : (s / 60) + ' min';
    }

    // ---------- dates ----------
    const pad = n => String(n).padStart(2, '0');
    const isoDay = ms => { const d = new Date(ms); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
    const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    // "Mon 12 Oct", plus the year when it is not this year
    function fmtDay(ms, nowMs) {
        const d = new Date(ms), n = new Date(nowMs == null ? Date.now() : nowMs);
        return DAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()] + (d.getFullYear() !== n.getFullYear() ? ' ' + d.getFullYear() : '');
    }
    const fmtTime = ms => { const d = new Date(ms); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
    // "today", "yesterday", "3 days ago", or the day
    function ago(ms, nowMs) {
        const a = new Date(isoDay(ms) + 'T12:00'), b = new Date(isoDay(nowMs) + 'T12:00');
        const d = Math.round((b - a) / 86400000);
        if (d === 0) return 'today';
        if (d === 1) return 'yesterday';
        if (d > 1 && d < 7) return d + ' days ago';
        return fmtDay(ms, nowMs);
    }
    // start of the week (00:00 local) holding nowMs; weekStart 1 = Monday, 0 = Sunday
    function weekStartMs(nowMs, weekStart) {
        const d = new Date(nowMs); d.setHours(0, 0, 0, 0);
        const back = (d.getDay() - weekStart + 7) % 7;
        d.setDate(d.getDate() - back);
        return d.getTime();
    }
    // "18:30" on the day of dayIso -> ms
    function atTime(dayIso, hhmm) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayIso || ''), t = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
        if (!m || !t || +t[1] > 23 || +t[2] > 59) return null;
        const d = new Date(+m[1], +m[2] - 1, +m[3], +t[1], +t[2], 0, 0);
        return d.getMonth() === +m[2] - 1 ? d.getTime() : null;
    }

    // ---------- the data ----------
    function emptyData() {
        return { v: 1, nextId: 1, exercises: [], plans: [], sessions: [], live: null };
    }
    const newId = data => data.nextId++;
    const norm = s => String(s || '').trim().replace(/\s+/g, ' ');
    const findEx = (data, id) => data.exercises.find(e => e.id === id) || null;
    const findExByName = (data, name) => { const n = norm(name).toLowerCase(); return data.exercises.find(e => e.name.toLowerCase() === n) || null; };
    // Reuses an exercise with the same name (any case), so the history stays in one place.
    function getOrAddExercise(data, name, kind, rest) {
        const n = norm(name).slice(0, LIMIT.name);
        if (!n) return null;
        const had = findExByName(data, n);
        if (had) return had;
        const ex = { id: newId(data), name: n, kind: KINDS.includes(kind) ? kind : 'weight', rest: rest == null ? null : rest };
        data.exercises.push(ex);
        return ex;
    }

    // Ready-made plans for the first visit. Their exercises use the usual rest from Settings until one is given its own.
    const P = {
        'Bench press': ['weight', 120], 'Overhead press': ['weight', 120], 'Incline dumbbell press': ['weight', 90], 'Lateral raise': ['weight', 60],
        'Triceps pushdown': ['weight', 60], 'Deadlift': ['weight', 180], 'Pull-up': ['body', 120], 'Barbell row': ['weight', 120], 'Lat pulldown': ['weight', 90],
        'Biceps curl': ['weight', 60], 'Squat': ['weight', 180], 'Romanian deadlift': ['weight', 120], 'Leg press': ['weight', 90], 'Leg curl': ['weight', 60],
        'Calf raise': ['weight', 60], 'Plank': ['time', 60], 'Dips': ['body', 90], 'Push-up': ['body', 60]
    };
    const PRESETS = {
        ppl: [['Push', ['Bench press', 'Overhead press', 'Incline dumbbell press', 'Lateral raise', 'Triceps pushdown', 'Dips']],
              ['Pull', ['Deadlift', 'Pull-up', 'Barbell row', 'Lat pulldown', 'Biceps curl']],
              ['Legs', ['Squat', 'Romanian deadlift', 'Leg press', 'Leg curl', 'Calf raise', 'Plank']]],
        ul: [['Upper', ['Bench press', 'Barbell row', 'Overhead press', 'Lat pulldown', 'Biceps curl', 'Triceps pushdown']],
             ['Lower', ['Squat', 'Romanian deadlift', 'Leg press', 'Leg curl', 'Calf raise', 'Plank']]],
        full: [['Full body', ['Squat', 'Bench press', 'Barbell row', 'Overhead press', 'Pull-up', 'Plank']]]
    };
    function addPreset(data, key) {
        const list = PRESETS[key]; if (!list) return [];
        return list.map(([name, exs]) => {
            const plan = { id: newId(data), name: uniquePlanName(data, name), ex: exs.map(n => getOrAddExercise(data, n, P[n][0], null).id) };
            data.plans.push(plan);
            return plan;
        });
    }
    function uniquePlanName(data, name, exceptId) {
        const base = norm(name).slice(0, LIMIT.plan) || 'My workout';
        const taken = n => data.plans.some(p => p.id !== exceptId && p.name.toLowerCase() === n.toLowerCase());
        if (!taken(base)) return base;
        for (let i = 2; ; i++) if (!taken(base + ' ' + i)) return base + ' ' + i;
    }

    // ---------- sets and bests ----------
    const isWork = s => !s.wu;
    // what a set weighs in grams (bodyweight: the extra weight, 0 when none)
    const setG = s => s.w ? toGrams(s.w, s.u) : 0;
    // Epley estimate of the most you could lift once; only for 1-12 reps, where it is close enough.
    function e1rmG(g, reps) {
        if (!g || !reps || reps > 12) return null;
        return reps === 1 ? g : Math.round(g * (1 + reps / 30));
    }
    // all the work sets of one exercise in sessions that started before `beforeMs` (and are not `skipId`)
    function priorSets(data, exId, beforeMs, skipId) {
        const out = [];
        data.sessions.forEach(s => { if (s.id !== skipId && s.start < beforeMs) s.entries.forEach(e => { if (e.ex === exId) e.sets.forEach(x => { if (isWork(x)) out.push(x); }); }); });
        return out;
    }
    // Is `set` a new best compared with `before`? Weight: no earlier set was at least as heavy with at least as many reps.
    function bestKind(kind, set, before) {
        if (!isWork(set) || !before.length) return null;
        if (kind === 'time') {
            const max = Math.max(...before.map(b => b.t || 0));
            return set.t > max ? { type: 'time', text: 'New best: longest hold, ' + fmtSec(set.t) } : null;
        }
        const g = setG(set);
        if (before.some(b => setG(b) >= g && (b.r || 0) >= set.r)) return null;
        const maxG = Math.max(...before.map(setG));
        if (g > maxG) return { type: 'heaviest', text: kind === 'body' ? 'New best: most extra weight' : 'New best: heaviest ever' };
        return { type: 'reps', text: kind === 'body' && !g ? 'New best: most reps' : 'New best: most reps at this weight' };
    }
    // for every set of a session: is it a new best when it was done?
    function sessionBests(data, session) {
        const res = {};
        session.entries.forEach(e => {
            const ex = findEx(data, e.ex); if (!ex) return;
            const before = priorSets(data, e.ex, session.start, session.id);
            e.sets.forEach((s, i) => {
                const b = bestKind(ex.kind, s, before);
                if (b) res[e.ex + ':' + i] = b;
                if (isWork(s)) before.push(s);
            });
        });
        return res;
    }
    // the session with this exercise done most recently before `beforeMs`, and its sets
    function lastTime(data, exId, beforeMs, skipId) {
        let best = null;
        data.sessions.forEach(s => {
            if (s.id === skipId || s.start >= beforeMs) return;
            const e = s.entries.find(x => x.ex === exId && x.sets.some(isWork));
            if (e && (!best || s.start > best.session.start)) best = { session: s, sets: e.sets.filter(isWork), note: e.note || '' };
        });
        return best;
    }
    // the best set ever: weight by estimated 1-rep max (then weight, then reps), bodyweight by extra weight then reps, time by length
    function bestEver(data, exId, kind) {
        let best = null, bestSess = null;
        const score = s => kind === 'time' ? [s.t || 0, 0, 0] : kind === 'body' ? [setG(s), s.r, 0] : [e1rmG(setG(s), s.r) || 0, setG(s), s.r];
        const better = (a, b) => { for (let i = 0; i < 3; i++) { if (a[i] !== b[i]) return a[i] > b[i]; } return false; };
        data.sessions.forEach(ss => ss.entries.forEach(e => { if (e.ex === exId) e.sets.forEach(s => { if (isWork(s) && (!best || better(score(s), score(best)))) { best = s; bestSess = ss; } }); }));
        return best ? { set: best, session: bestSess } : null;
    }

    // one set in words: "62.5 kg × 8", "12 reps", "+10 kg × 8", "1:30"
    function setText(kind, s, unit) {
        if (kind === 'time') return fmtSec(s.t) + (s.w ? ' with ' + fmtW(weightIn(s.w, s.u, unit), unit) : '');
        if (kind === 'body') return s.w ? '+' + fmtW(weightIn(s.w, s.u, unit), unit) + ' × ' + s.r : s.r + (s.r === 1 ? ' rep' : ' reps');
        return fmtW(weightIn(s.w || 0, s.u, unit), unit) + ' × ' + s.r;
    }
    // several sets in words: "60 kg: 8, 8, 7 reps" when the weight is the same, else "60 kg × 8, 62.5 kg × 6"
    function setsText(kind, sets, unit) {
        if (!sets.length) return '';
        if (kind === 'time') return sets.map(s => setText(kind, s, unit)).join(', ');
        const ws = sets.map(s => weightIn(s.w || 0, s.u, unit));
        if (ws.every(w => w === ws[0])) {
            const reps = sets.map(s => s.r).join(', ') + (sets.length === 1 && sets[0].r === 1 ? ' rep' : ' reps');
            if (kind === 'body') return ws[0] ? '+' + fmtW(ws[0], unit) + ': ' + reps : reps;
            return fmtW(ws[0], unit) + ': ' + reps;
        }
        return sets.map(s => setText(kind, s, unit)).join(', ');
    }
    // "est. 1-rep max 75.8 kg"
    function e1rmText(s, unit) {
        const e = e1rmG(setG(s), s.r);
        return e && s.r > 1 ? 'est. 1-rep max ' + fmtW(fromGrams(e, unit), unit) : '';
    }

    // what to put in the boxes for the next set: this workout's last set, else the same set number last time, else the first set last time
    function suggestNext(data, session, exId, unit) {
        const e = session.entries.find(x => x.ex === exId);
        const done = e ? e.sets : [];
        let from = null;
        for (let i = done.length - 1; i >= 0; i--) if (isWork(done[i])) { from = done[i]; break; }
        if (!from && done.length) from = done[done.length - 1];
        if (!from) {
            const lt = lastTime(data, exId, session.start, session.id);
            if (lt) from = lt.sets[Math.min(done.length, lt.sets.length - 1)];
        }
        if (!from) return null;
        return { w: from.w ? weightIn(from.w, from.u, unit) : 0, r: from.r || 0, t: from.t || 0 };
    }

    // ---------- a workout's numbers ----------
    function summary(data, session, unit) {
        const bests = sessionBests(data, session);
        let sets = 0, volG = 0, done = 0;
        const skipped = [], bestList = [];
        session.entries.forEach(e => {
            const ex = findEx(data, e.ex); if (!ex) return;
            const work = e.sets.filter(isWork);
            if (!e.sets.length) { skipped.push(ex.name); return; }
            done++;
            sets += work.length;
            if (ex.kind !== 'time') work.forEach(s => { volG += setG(s) * s.r; });
            // the strongest new best of this exercise
            let pick = null;
            e.sets.forEach((s, i) => { if (bests[e.ex + ':' + i]) { if (!pick || setG(s) > setG(pick.s) || (setG(s) === setG(pick.s) && (s.r || s.t) > (pick.s.r || pick.s.t))) pick = { s, b: bests[e.ex + ':' + i] }; } });
            if (pick) bestList.push({ name: ex.name, text: setText(ex.kind, pick.s, unit), why: pick.b.text });
        });
        const end = session.end || lastSetAt(session) || session.start;
        return { sets, volume: fromGrams(volG, unit), exercisesDone: done, skipped, bests: bestList, lengthMs: Math.max(0, end - session.start) };
    }
    function lastSetAt(session) {
        let t = 0; session.entries.forEach(e => e.sets.forEach(s => { if (s.at > t) t = s.at; })); return t || null;
    }
    const setCount = session => session.entries.reduce((n, e) => n + e.sets.length, 0);

    // plain text for copying, sharing or email
    function sessionTextPlain(data, session, unit, nowMs) {
        const sm = summary(data, session, unit), bests = sessionBests(data, session);
        const lines = [session.name + ', ' + fmtDay(session.start, nowMs) + ' ' + fmtTime(session.start) + (session.end ? ' (' + fmtLen(session.end - session.start) + ')' : '')];
        lines.push(sm.sets + ' sets' + (sm.volume ? ', ' + fmtW(sm.volume, unit) + ' lifted' : ''));
        session.entries.forEach(e => {
            const ex = findEx(data, e.ex); if (!ex || !e.sets.length) return;
            lines.push('');
            lines.push(ex.name);
            e.sets.forEach((s, i) => lines.push('  ' + (s.wu ? 'Warm-up' : 'Set ' + (e.sets.slice(0, i).filter(isWork).length + 1)) + ': ' + setText(ex.kind, s, unit) + (bests[e.ex + ':' + i] ? '  (' + bests[e.ex + ':' + i].text + ')' : '')));
            if (e.note) lines.push('  Note: ' + e.note);
        });
        if (sm.skipped.length) { lines.push(''); lines.push('Skipped: ' + sm.skipped.join(', ')); }
        return lines.join('\n');
    }

    // ---------- this week ----------
    function weekStats(data, nowMs, weekStart) {
        const from = weekStartMs(nowMs, weekStart);
        const list = data.sessions.filter(s => s.end && s.start >= from && s.start <= nowMs && setCount(s));
        return { workouts: list.length, sets: list.reduce((n, s) => n + s.entries.reduce((m, e) => m + e.sets.filter(isWork).length, 0), 0) };
    }
    const finishedSessions = data => data.sessions.filter(s => s.end).sort((a, b) => b.start - a.start);

    // ---------- progress of one exercise ----------
    // one point per workout: heaviest work set (weight), most reps or extra weight (bodyweight), longest hold (time)
    function progressPoints(data, exId, kind, unit) {
        const pts = [];
        data.sessions.filter(s => s.end).sort((a, b) => a.start - b.start).forEach(s => {
            const sets = []; s.entries.forEach(e => { if (e.ex === exId) e.sets.forEach(x => { if (isWork(x)) sets.push(x); }); });
            if (!sets.length) return;
            let v;
            if (kind === 'time') v = Math.max(...sets.map(x => x.t || 0));
            else if (kind === 'body' && !sets.some(x => x.w)) v = Math.max(...sets.map(x => x.r));
            else v = Math.max(...sets.map(x => fromGrams(setG(x), unit))) / 100;
            pts.push({ t: s.start, v });
        });
        return pts;
    }
    function progressLabel(kind, data, exId) {
        if (kind === 'time') return 'Longest hold per workout (seconds)';
        if (kind === 'body' && !data.sessions.some(s => s.entries.some(e => e.ex === exId && e.sets.some(x => x.w)))) return 'Most reps in one set per workout';
        return kind === 'body' ? 'Most extra weight per workout' : 'Heaviest set per workout';
    }
    function exerciseStats(data, exId) {
        let sessions = 0, sets = 0, last = 0;
        data.sessions.forEach(s => { const e = s.entries.filter(x => x.ex === exId && x.sets.length); if (e.length) { sessions++; e.forEach(x => { sets += x.sets.filter(isWork).length; }); if (s.start > last) last = s.start; } });
        return { sessions, sets, last };
    }

    // ---------- CSV ----------
    const csvCell = v => { let s = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    function csv(data, unit) {
        const rows = [['Date', 'Start', 'Workout', 'Exercise', 'Set', 'Warm-up', 'Weight (' + unit + ')', 'Reps', 'Seconds', 'Note']];
        data.sessions.filter(s => s.end).sort((a, b) => a.start - b.start).forEach(s => s.entries.forEach(e => {
            const ex = findEx(data, e.ex); if (!ex) return;
            e.sets.forEach((x, i) => rows.push([isoDay(s.start), fmtTime(s.start), s.name, ex.name, i + 1, x.wu ? 'yes' : '', x.w ? fmtNum(weightIn(x.w, x.u, unit)).replace(/,/g, '') : (ex.kind === 'weight' ? '0' : ''), x.r || '', x.t || '', i === 0 ? e.note || '' : '']));
        }));
        return rows.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
    }

    // ---------- checking saved or restored data ----------
    const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
    const txt = (v, max) => typeof v === 'string' ? v.slice(0, max) : '';
    function validRest(v) { return v === null || v === undefined ? null : (isInt(v, 0, LIMIT.maxRest) ? v : null); }
    function cleanSet(x, kind) {
        if (!x || typeof x !== 'object') return null;
        const u = x.u === 'lb' ? 'lb' : 'kg';
        const s = { u, at: isInt(x.at, 0, 9e15) ? x.at : 0 };
        if (x.w != null) { if (!isInt(x.w, 0, (u === 'lb' ? LIMIT.maxLb : LIMIT.maxKg) * 100)) return null; s.w = x.w; }
        if (kind === 'time') { if (!isInt(x.t, 1, LIMIT.maxSec)) return null; s.t = x.t; }
        else { if (!isInt(x.r, 1, LIMIT.maxReps)) return null; s.r = x.r; if (kind === 'weight' && s.w == null) s.w = 0; }
        if (x.wu === true) s.wu = true;
        return s;
    }
    // Returns clean data, or null when it is not this app's data at all.
    function validate(obj) {
        if (!obj || typeof obj !== 'object' || !Array.isArray(obj.exercises) || !Array.isArray(obj.sessions)) return null;
        const d = emptyData(); let maxId = 0;
        const seenEx = new Set(), seenNames = new Set();
        obj.exercises.forEach(e => {
            if (!e || !isInt(e.id, 1, 1e9) || seenEx.has(e.id)) return;
            const name = norm(txt(e.name, LIMIT.name)); if (!name || seenNames.has(name.toLowerCase())) return;
            seenEx.add(e.id); seenNames.add(name.toLowerCase());
            d.exercises.push({ id: e.id, name, kind: KINDS.includes(e.kind) ? e.kind : 'weight', rest: validRest(e.rest) });
            maxId = Math.max(maxId, e.id);
        });
        const kindOf = id => (d.exercises.find(e => e.id === id) || {}).kind;
        (Array.isArray(obj.plans) ? obj.plans : []).slice(0, LIMIT.plans).forEach(p => {
            if (!p || !isInt(p.id, 1, 1e9) || d.plans.some(q => q.id === p.id)) return;
            const name = norm(txt(p.name, LIMIT.plan)); if (!name) return;
            const ex = (Array.isArray(p.ex) ? p.ex : []).filter((id, i, a) => seenEx.has(id) && a.indexOf(id) === i).slice(0, LIMIT.exPerPlan);
            d.plans.push({ id: p.id, name, ex }); maxId = Math.max(maxId, p.id);
        });
        const seenS = new Set();
        obj.sessions.forEach(s => {
            if (!s || !isInt(s.id, 1, 1e9) || seenS.has(s.id) || !isInt(s.start, 0, 9e15)) return;
            const end = s.end == null ? null : (isInt(s.end, s.start, 9e15) ? s.end : null);
            const entries = [];
            (Array.isArray(s.entries) ? s.entries : []).forEach(e => {
                if (!e || !seenEx.has(e.ex) || entries.some(x => x.ex === e.ex)) return;
                const sets = (Array.isArray(e.sets) ? e.sets : []).map(x => cleanSet(x, kindOf(e.ex))).filter(Boolean).slice(0, LIMIT.setsPerEx);
                entries.push({ ex: e.ex, sets, note: txt(e.note, LIMIT.note) });
            });
            seenS.add(s.id);
            d.sessions.push({ id: s.id, name: norm(txt(s.name, LIMIT.plan)) || 'Workout', plan: isInt(s.plan, 1, 1e9) ? s.plan : null, start: s.start, end, entries });
            maxId = Math.max(maxId, s.id);
        });
        // only one workout can be in progress: keep the newest open one, close older ones at their last set
        const open = d.sessions.filter(s => !s.end).sort((a, b) => b.start - a.start);
        open.slice(1).forEach(s => { s.end = Math.max(s.start, lastSetAt(s) || s.start); });
        if (open[0]) {
            const r = obj.live && obj.live.rest;
            d.live = { id: open[0].id, rest: r && seenEx.has(r.ex) && isInt(r.ends, 0, 9e15) && isInt(r.total, 1, LIMIT.maxRest + 600) ? { ex: r.ex, ends: r.ends, total: r.total } : null };
        }
        d.nextId = Math.max(isInt(obj.nextId, 1, 2e9) ? obj.nextId : 1, maxId + 1);
        return d;
    }

    return {
        LB_G, KINDS, KIND_LABEL, REST_PRESETS, LIMIT, PRESETS,
        parseWeight, parseReps, parseDuration, toGrams, fromGrams, weightIn, fmtNum, fmtW, fmtSec, clock, fmtLen, fmtRest,
        isoDay, fmtDay, fmtTime, ago, weekStartMs, atTime,
        emptyData, newId, norm, findEx, findExByName, getOrAddExercise, addPreset, uniquePlanName,
        isWork, setG, e1rmG, priorSets, bestKind, sessionBests, lastTime, bestEver, setText, setsText, e1rmText, suggestNext,
        summary, lastSetAt, setCount, sessionTextPlain, weekStats, finishedSessions, progressPoints, progressLabel, exerciseStats, csv, validate
    };
}));
