// Interval Workout Timer for HIIT and Circuits: the workout rules, with no page code, so tests.js can check them.
// All lengths are whole seconds. A running workout stores the moment it would have started with no pauses,
// so the right step is always worked out from the clock: a locked phone or a reload never loses time.
(function (root) {
    'use strict';
    const SEC = 1000;
    const MAX_BLOCK = 60 * 60;          // longest single step: 60 min
    const MAX_ROUNDS = 100, MAX_SETS = 20, MAX_MOVES = 50;
    const MAX_TOTAL = 3 * 60 * 60;      // longest workout: 3 hours
    const NAME_MAX = 40, TITLE_MAX = 50, MAX_SAVED = 30, MAX_HISTORY = 500;
    const LOG_MIN = 60;                 // a workout stopped in under a minute is not added to the history

    const KINDS = { warm: 'Warm-up', work: 'Work', rest: 'Rest', setrest: 'Rest between sets', cool: 'Cool-down' };

    const blank = () => ({ name: '', warm: 0, work: 40, rest: 20, rounds: 8, sets: 1, setRest: 60, cool: 0, moves: [] });
    const mv = names => names.map(n => ({ name: n, secs: null }));
    const PRESETS = [
        { id: 'tabata', label: 'Tabata', note: '20 s on, 10 s off, 8 rounds', w: { name: 'Tabata', warm: 0, work: 20, rest: 10, rounds: 8, sets: 1, setRest: 60, cool: 0, moves: [] } },
        { id: '3030', label: '30 / 30', note: '30 s on, 30 s off, 10 rounds', w: { name: '30 on 30 off', warm: 0, work: 30, rest: 30, rounds: 10, sets: 1, setRest: 60, cool: 0, moves: [] } },
        { id: 'circuit', label: 'Circuit', note: '4 moves, 40 / 20, 3 sets', w: { name: 'Full body circuit', warm: 180, work: 40, rest: 20, rounds: 4, sets: 3, setRest: 60, cool: 120, moves: mv(['Squats', 'Push-ups', 'Lunges', 'Plank']) } },
        { id: 'emom', label: 'EMOM 10', note: 'a beep every minute, 10 min', w: { name: 'EMOM 10 minutes', warm: 0, work: 60, rest: 0, rounds: 10, sets: 1, setRest: 60, cool: 0, moves: [] } },
        { id: 'stretch', label: 'Stretching', note: '6 stretches, 30 s each', w: { name: 'Stretching', warm: 0, work: 30, rest: 10, rounds: 6, sets: 1, setRest: 60, cool: 0, moves: mv(['Neck rolls', 'Shoulder stretch', 'Hamstring stretch', 'Quad stretch, left', 'Quad stretch, right', "Child's pose"]) } }
    ];
    const DEFAULT_SETTINGS = { beeps: true, countdown: true, voice: false, vibrate: true, awake: true };

    // ---------- reading what was typed ----------
    // A length: "40" or "40s" = 40 seconds, "1:30" = 1 min 30 s, "2m" or "2 min" = 2 minutes, "1:00:00" = 1 hour.
    // Blank is allowed (0) only where `blankOk`. Returns { secs } or { error }.
    function parseDur(text, opt) {
        opt = opt || {};
        const label = opt.label || 'time', min = opt.min == null ? 0 : opt.min, max = opt.max == null ? MAX_BLOCK : opt.max;
        let s = String(text == null ? '' : text).trim().toLowerCase().replace(/,/g, '.').replace(/\s+/g, ' ');
        if (s === '') return min > 0 && !opt.blankOk ? { error: 'Type the ' + label + ', for example 40 or 1:30.' } : { secs: 0 };
        if (/^-/.test(s)) return { error: 'The ' + label + ' cannot be below 0.' };
        let secs;
        let m;
        if ((m = s.match(/^(\d{1,4}(?:\.\d+)?) ?(s|sec|secs|second|seconds)?$/))) secs = Number(m[1]);
        else if ((m = s.match(/^(\d{1,3}(?:\.\d+)?) ?(m|min|mins|minute|minutes)$/))) secs = Number(m[1]) * 60;
        else if ((m = s.match(/^(\d{1,3}):([0-5]?\d)$/))) secs = Number(m[1]) * 60 + Number(m[2]);
        else if ((m = s.match(/^(\d{1,2}):([0-5]\d):([0-5]\d)$/))) secs = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
        else return { error: 'Type the ' + label + ' as seconds (40) or minutes:seconds (1:30).' };
        secs = Math.round(secs);
        if (secs === 0 && min > 0) return { error: 'The ' + label + ' must be at least ' + min + ' second' + (min === 1 ? '' : 's') + '.' };
        if (secs > max) return { error: 'The longest ' + label + ' is ' + fmtWords(max) + '.' };
        return { secs };
    }

    // A whole count such as rounds: blank is an error, "8" fine, "8.5" or "eight" not.
    function parseCount(text, label, max) {
        const s = String(text == null ? '' : text).trim();
        if (s === '') return { error: 'Type the number of ' + label + ', for example 8.' };
        if (/^-/.test(s)) return { error: 'The number of ' + label + ' cannot be below 1.' };
        if (!/^\d{1,4}$/.test(s)) return { error: 'Type the number of ' + label + ' as a whole number, for example 8.' };
        const n = Number(s);
        if (n < 1) return { error: 'You need at least 1 of the ' + label + '.' };
        if (n > max) return { error: 'The most ' + label + ' is ' + max + '.' };
        return { n };
    }

    // Tidy a typed or pasted name: no line breaks or control characters, single spaces, cut to the limit.
    function cleanName(text, max) {
        return String(text == null ? '' : text).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max || NAME_MAX).trim();
    }

    // A pasted list of moves, one per line (or separated by commas or semicolons when on one line).
    // A time at the end gives that move its own length: "Plank 1:00", "Wall sit - 45s".
    function parseMoveList(text) {
        const raw = String(text == null ? '' : text);
        let lines = raw.split(/\r?\n/);
        if (lines.filter(l => l.trim()).length === 1) lines = raw.split(/[;,]/);
        const out = [];
        for (let line of lines) {
            line = line.replace(/^\s*(?:\d{1,2}[.)]|[-*•·])\s+/, '').trim();   // "1. Squats", "- Squats"
            if (!line) continue;
            let secs = null;
            const m = line.match(/^(.*?)[\s:–—-]*\(?\b(\d{1,2}:[0-5]\d|\d{1,4} ?(?:s|sec|secs|seconds?)|\d{1,3} ?(?:m|min|mins|minutes?))\)?$/i);
            if (m && cleanName(m[1])) { const d = parseDur(m[2], { min: 1 }); if (d.secs) { secs = d.secs; line = m[1]; } }
            const name = cleanName(line);
            if (name) out.push({ name, secs });
            if (out.length >= MAX_MOVES) break;
        }
        return out;
    }

    // ---------- the plan ----------
    // Every step in order. The rest after the last round of a set is left out (the set rest or the cool-down follows),
    // and so is any step of 0 seconds.
    function buildBlocks(w) {
        const blocks = [], moves = (w.moves || []).filter(m => m && m.name);
        const push = b => { if (b.secs > 0) blocks.push(b); };
        push({ kind: 'warm', secs: w.warm, name: '' });
        for (let s = 1; s <= w.sets; s++) {
            for (let r = 1; r <= w.rounds; r++) {
                const m = moves.length ? moves[(r - 1) % moves.length] : null;
                push({ kind: 'work', secs: m && m.secs ? m.secs : w.work, name: m ? m.name : '', round: r, set: s });
                if (r < w.rounds) push({ kind: 'rest', secs: w.rest, name: '', round: r, set: s });
            }
            if (s < w.sets) push({ kind: 'setrest', secs: w.setRest, name: '', set: s });
        }
        push({ kind: 'cool', secs: w.cool, name: '' });
        let at = 0;
        blocks.forEach((b, i) => { b.i = i; b.start = at; at += b.secs; });
        return blocks;
    }
    const totalOf = blocks => blocks.reduce((a, b) => a + b.secs, 0);

    // Plain words for a step: "Squats", "Work", "Rest", "Rest between sets".
    const title = b => b.kind === 'work' && b.name ? b.name : KINDS[b.kind];

    // A one-line description of the workout for the plan card.
    function describe(w) {
        const named = (w.moves || []).filter(m => m.name).length;
        const parts = [];
        if (w.warm) parts.push('Warm-up ' + fmt(w.warm));
        let core = (w.sets > 1 ? w.sets + ' sets of ' : '') + w.rounds + ' round' + (w.rounds === 1 ? '' : 's') + ': ' + fmt(w.work) + ' work';
        if (w.rest && w.rounds > 1) core += ', ' + fmt(w.rest) + ' rest';
        parts.push(core);
        if (w.sets > 1 && w.setRest) parts.push(fmt(w.setRest) + ' rest between sets');
        if (w.cool) parts.push('Cool-down ' + fmt(w.cool));
        if (named) parts.push(named + ' move' + (named === 1 ? '' : 's') + ' named');
        return parts.join(' · ');
    }

    // Check a whole workout typed in the form. f holds the raw texts. Returns { w } or { errors: {field: text} }.
    function readForm(f) {
        const errors = {};
        let w = { name: cleanName(f.name, TITLE_MAX) };
        const dur = (k, opt) => { const r = parseDur(f[k], opt); if (r.error) errors[k] = r.error; else w[k] = r.secs; };
        dur('warm', { label: 'warm-up' });
        dur('work', { label: 'work time', min: 1 });
        dur('rest', { label: 'rest time' });
        dur('cool', { label: 'cool-down' });
        const cnt = (k, label, max) => { const r = parseCount(f[k], label, max); if (r.error) errors[k] = r.error; else w[k] = r.n; };
        cnt('rounds', 'rounds', MAX_ROUNDS);
        cnt('sets', 'sets', MAX_SETS);
        if (w.sets > 1) dur('setRest', { label: 'rest between sets' }); else { const r = parseDur(f.setRest); w.setRest = r.error ? 60 : r.secs; }
        w.moves = [];
        (f.moves || []).forEach((m, i) => {
            const name = cleanName(m.name);
            let secs = null;
            if (String(m.secs == null ? '' : m.secs).trim() !== '') {
                const r = parseDur(m.secs, { label: 'time for this move', min: 1 });
                if (r.error) errors['move' + i] = r.error; else secs = r.secs;
            }
            if (name) w.moves.push({ name, secs });
            else if (secs) errors['move' + i] = 'Type a name for this move, or remove it.';
        });
        if (Object.keys(errors).length) return { errors };
        w = { name: w.name, warm: w.warm, work: w.work, rest: w.rest, rounds: w.rounds, sets: w.sets, setRest: w.setRest, cool: w.cool, moves: w.moves };
        const total = totalOf(buildBlocks(w));
        if (total > MAX_TOTAL) return { errors: { total: 'This workout is ' + fmtWords(total) + ' long. The longest is 3 hours: use fewer rounds or sets.' } };
        return { w };
    }

    // ---------- running ----------
    // run = { startAt, pausedAt (null while running), began (real start), pausedMs (time spent paused), blocks, total, name }
    function startRun(w, now) {
        const blocks = buildBlocks(w);
        return { startAt: now, pausedAt: null, began: now, pausedMs: 0, skippedMs: 0, blocks, total: totalOf(blocks), name: w.name || '', rounds: w.rounds, sets: w.sets };
    }
    const elapsedMs = (run, now) => Math.max(0, (run.pausedAt != null ? run.pausedAt : now) - run.startAt);

    // Where the workout is now: the step, time left in it, and the workout's time done and left.
    function position(run, now) {
        const el = elapsedMs(run, now), totalMs = run.total * SEC;
        if (el >= totalMs || !run.blocks.length) return { done: true, index: run.blocks.length, elapsed: totalMs, left: 0, blockLeft: 0 };
        let lo = 0, hi = run.blocks.length - 1;
        while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (run.blocks[mid].start * SEC <= el) lo = mid; else hi = mid - 1; }
        const b = run.blocks[lo], blockEnd = (b.start + b.secs) * SEC;
        return { done: false, index: lo, block: b, next: run.blocks[lo + 1] || null, elapsed: el, left: totalMs - el, blockLeft: blockEnd - el, blockDone: el - b.start * SEC };
    }

    function pause(run, now) { if (run.pausedAt == null) run.pausedAt = now; }
    function resume(run, now) { if (run.pausedAt != null) { run.startAt += now - run.pausedAt; run.pausedMs += now - run.pausedAt; run.pausedAt = null; } }
    // Jump to the start of step i (i = number of steps means the end).
    function jump(run, i, now) {
        const at = i >= run.blocks.length ? run.total * SEC : run.blocks[Math.max(0, i)].start * SEC;
        const base = run.pausedAt != null ? run.pausedAt : now;
        run.skippedMs += at - elapsedMs(run, now);   // + skipped ahead, - went back
        run.startAt = base - at;
    }
    function skip(run, now) { const p = position(run, now); if (!p.done) jump(run, p.index + 1, now); }
    // Back: more than 3 s into a step starts it again; otherwise goes to the step before.
    function back(run, now) {
        const p = position(run, now);
        if (p.done) return jump(run, run.blocks.length - 1, now);
        jump(run, p.blockDone > 3 * SEC || p.index === 0 ? p.index : p.index - 1, now);
    }
    // Time actually spent working out: the clock time since starting, minus pauses, at most 3 hours.
    function activeSecs(run, now) {
        const end = run.pausedAt != null ? run.pausedAt : now;
        const ms = end - run.began - run.pausedMs;
        return Math.max(0, Math.min(MAX_TOTAL, Math.round(ms / SEC)));
    }

    // The sounds to plan from elapsed time `fromMs`: start of each step and 3-2-1 before each step ends.
    // Returns [{ at (ms into the workout), kind: 'work'|'rest'|'tick'|'done' }].
    function cues(run, fromMs, countdown) {
        const out = [];
        for (const b of run.blocks) {
            const s = b.start * SEC, e = (b.start + b.secs) * SEC;
            if (s >= fromMs) out.push({ at: s, kind: b.kind === 'work' ? 'work' : 'rest', i: b.i });
            if (countdown && b.secs >= 5) for (let k = 3; k >= 1; k--) if (e - k * SEC >= fromMs) out.push({ at: e - k * SEC, kind: 'tick' });
        }
        if (run.total * SEC >= fromMs) out.push({ at: run.total * SEC, kind: 'done' });
        return out;
    }

    // ---------- showing time ----------
    // 0:40, 1:30, 1:02:05. Seconds are whole.
    function fmt(secs) {
        const t = Math.max(0, Math.round(secs)), h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = t % 60;
        return h ? h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0') : m + ':' + String(s).padStart(2, '0');
    }
    // A countdown in ms, rounded up so it shows 0:01 until the step really ends.
    const fmtLeft = ms => fmt(Math.ceil(Math.max(0, ms) / SEC - 1e-9));
    // Words: 45 s, 21 min 20 s, 1 h 4 min.
    function fmtWords(secs) {
        const t = Math.max(0, Math.round(secs)), h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = t % 60;
        if (h) return h + ' h' + (m ? ' ' + m + ' min' : '');
        if (m) return m + ' min' + (s ? ' ' + s + ' s' : '');
        return s + ' s';
    }

    // ---------- history ----------
    // Monday 00:00 of the week holding `now`, in local time.
    function weekStart(now) { const d = new Date(now); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return d.getTime(); }
    function dayKey(t) { const d = new Date(t); return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); }
    function stats(history, now) {
        const ws = weekStart(now), d30 = new Date(now); d30.setHours(0, 0, 0, 0); d30.setDate(d30.getDate() - 29);
        const week = history.filter(h => h.at >= ws && h.at <= now), month = history.filter(h => h.at >= d30.getTime() && h.at <= now);
        // streak: days in a row with a workout, ending today or yesterday
        const days = new Set(history.map(h => dayKey(h.at)));
        const d = new Date(now); d.setHours(12, 0, 0, 0);
        if (!days.has(dayKey(d.getTime()))) d.setDate(d.getDate() - 1);
        let streak = 0;
        while (days.has(dayKey(d.getTime()))) { streak++; d.setDate(d.getDate() - 1); }
        return { weekCount: week.length, weekSecs: week.reduce((a, h) => a + h.secs, 0), monthCount: month.length, monthSecs: month.reduce((a, h) => a + h.secs, 0), streak };
    }

    // ---------- saved data ----------
    const int = (v, lo, hi, dflt) => Number.isInteger(v) && v >= lo && v <= hi ? v : dflt;
    function sanitizeWorkout(x) {
        const b = blank();
        if (!x || typeof x !== 'object') return b;
        const w = {
            name: typeof x.name === 'string' ? cleanName(x.name, TITLE_MAX) : '',
            warm: int(x.warm, 0, MAX_BLOCK, 0), work: int(x.work, 1, MAX_BLOCK, b.work), rest: int(x.rest, 0, MAX_BLOCK, b.rest),
            rounds: int(x.rounds, 1, MAX_ROUNDS, b.rounds), sets: int(x.sets, 1, MAX_SETS, 1), setRest: int(x.setRest, 0, MAX_BLOCK, 60), cool: int(x.cool, 0, MAX_BLOCK, 0),
            moves: Array.isArray(x.moves) ? x.moves.slice(0, MAX_MOVES).filter(m => m && typeof m.name === 'string' && cleanName(m.name))
                .map(m => ({ name: cleanName(m.name), secs: int(m.secs, 1, MAX_BLOCK, null) })) : []
        };
        if (totalOf(buildBlocks(w)) > MAX_TOTAL) { w.rounds = b.rounds; w.sets = 1; }
        return w;
    }
    const fresh = () => ({ v: 1, nextId: 1, current: sanitizeWorkout(PRESETS[2].w), settings: Object.assign({}, DEFAULT_SETTINGS), saved: [], history: [], run: null });
    function sanitize(text, now) {
        let x;
        try { x = typeof text === 'string' ? JSON.parse(text) : text; } catch (e) { return Object.assign(fresh(), { damaged: true }); }
        if (!x || typeof x !== 'object' || Array.isArray(x)) return Object.assign(fresh(), { damaged: true });
        const st = fresh();
        st.nextId = int(x.nextId, 1, 1e9, 1);
        if (x.current) st.current = sanitizeWorkout(x.current);
        if (x.settings && typeof x.settings === 'object') for (const k of Object.keys(DEFAULT_SETTINGS)) if (typeof x.settings[k] === 'boolean') st.settings[k] = x.settings[k];
        const okId = v => typeof v === 'string' && /^[a-z0-9]{1,12}$/.test(v);
        if (Array.isArray(x.saved)) st.saved = x.saved.filter(s => s && okId(s.id)).slice(0, MAX_SAVED).map(s => ({ id: s.id, w: sanitizeWorkout(s.w) }));
        const okTime = t => Number.isFinite(t) && t > 946684800000 && t < (now || Date.now()) + 864e5;
        if (Array.isArray(x.history)) st.history = x.history.filter(h => h && okId(h.id) && okTime(h.at)).slice(-MAX_HISTORY)
            .map(h => ({ id: h.id, at: h.at, name: typeof h.name === 'string' ? cleanName(h.name, TITLE_MAX) : '', secs: int(h.secs, 0, MAX_TOTAL, 0), planned: int(h.planned, 0, MAX_TOTAL, 0), full: h.full === true }));
        // a workout that was running: keep it only if it is sound and not long finished
        const r = x.run;
        if (r && typeof r === 'object' && Array.isArray(r.blocks) && r.blocks.length && Number.isFinite(r.startAt) && Number.isFinite(r.began)) {
            const okKind = k => Object.prototype.hasOwnProperty.call(KINDS, k);
            let at = 0, good = true;
            const blocks = r.blocks.slice(0, 5000).map((b, i) => {
                if (!b || !okKind(b.kind) || !Number.isInteger(b.secs) || b.secs < 1 || b.secs > MAX_BLOCK) good = false;
                const nb = { kind: b && b.kind, secs: b && b.secs, name: b && typeof b.name === 'string' ? cleanName(b.name) : '', i, start: at };
                if (b && Number.isInteger(b.round)) nb.round = b.round;
                if (b && Number.isInteger(b.set)) nb.set = b.set;
                at += nb.secs || 0; return nb;
            });
            if (good && at <= MAX_TOTAL) {
                const run = { startAt: r.startAt, pausedAt: Number.isFinite(r.pausedAt) ? r.pausedAt : null, began: r.began, pausedMs: Number.isFinite(r.pausedMs) ? Math.max(0, r.pausedMs) : 0,
                    skippedMs: Number.isFinite(r.skippedMs) ? r.skippedMs : 0, blocks, total: at, name: typeof r.name === 'string' ? cleanName(r.name, TITLE_MAX) : '',
                    rounds: int(r.rounds, 1, MAX_ROUNDS, 1), sets: int(r.sets, 1, MAX_SETS, 1) };
                st.run = run;
            }
        }
        return st;
    }

    const api = { SEC, MAX_BLOCK, MAX_ROUNDS, MAX_SETS, MAX_MOVES, MAX_TOTAL, NAME_MAX, TITLE_MAX, MAX_SAVED, MAX_HISTORY, LOG_MIN, KINDS, PRESETS, DEFAULT_SETTINGS,
        blank, parseDur, parseCount, cleanName, parseMoveList, buildBlocks, totalOf, title, describe, readForm,
        startRun, position, pause, resume, jump, skip, back, activeSecs, cues, elapsedMs,
        fmt, fmtLeft, fmtWords, weekStart, stats, sanitizeWorkout, sanitize, fresh };
    root.IntervalTimer = api;
})(typeof window !== 'undefined' ? window : globalThis);
