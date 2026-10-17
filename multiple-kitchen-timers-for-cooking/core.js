// Multiple Kitchen Timers for Cooking: the timer rules, with no page code, so tests.js can check them.
// Every running timer stores the moment it ends (not a countdown), so a locked phone or a reload never loses time.
(function (root) {
    'use strict';
    const SEC = 1000, MIN = 60 * SEC, HOUR = 60 * MIN;
    const MAX_LEN = 24 * HOUR;          // longest timer
    const MAX_TIMERS = 20;              // timers on the screen at once
    const MAX_FAVS = 40;                // saved timers
    const RING_FOR = 10 * MIN;          // a finished timer stops ringing by itself after this
    const LOUD_FOR = MIN;               // first minute: alarm every 2 s, then a short reminder every 15 s
    const NAME_MAX = 60;

    const STARTERS = [
        { name: 'Soft-boiled egg', ms: 6 * MIN },
        { name: 'Hard-boiled egg', ms: 10 * MIN },
        { name: 'Pasta', ms: 10 * MIN },
        { name: 'White rice', ms: 15 * MIN },
        { name: 'Tea', ms: 3 * MIN }
    ];
    const DEFAULT_SETTINGS = { sound: 'beeps', vibrate: true, awake: true, notify: false };

    // One box of the length: '' is 0, "1.5" and "1,5" are allowed, anything else is NaN.
    function parseNum(text) {
        const s = String(text == null ? '' : text).trim().replace(',', '.');
        if (s === '') return 0;
        if (!/^\d{0,5}(\.\d{0,3})?$/.test(s) || s === '.') return NaN;
        return Number(s);
    }

    // Hours, minutes and seconds as typed -> { ms } or { error, field }. 90 minutes is fine (1 h 30 min).
    function parseLength(h, m, s) {
        const parts = { h: parseNum(h), m: parseNum(m), s: parseNum(s) };
        const names = { h: 'hours', m: 'minutes', s: 'seconds' };
        for (const k of ['h', 'm', 's']) {
            if (Number.isNaN(parts[k])) {
                const raw = String(k === 'h' ? h : k === 'm' ? m : s).trim();
                return { error: /^-/.test(raw) ? 'Time cannot be below 0.' : 'Type the ' + names[k] + ' as a number, for example 5.', field: k };
            }
        }
        const ms = Math.round((parts.h * HOUR + parts.m * MIN + parts.s * SEC) / SEC) * SEC;
        if (ms < SEC) return { error: 'Choose how long, for example tap 10 min.', field: 'm' };
        if (ms > MAX_LEN) return { error: 'The longest timer is 24 hours.', field: parts.h ? 'h' : parts.m ? 'm' : 's' };
        return { ms };
    }

    // Split a length back into the three boxes (for the Change form).
    function splitLength(ms) {
        const t = Math.max(0, Math.ceil(ms / SEC));
        return { h: Math.floor(t / 3600), m: Math.floor(t % 3600 / 60), s: t % 60 };
    }

    // Clock face: 6:30, 1:05:00. Rounds up so it never shows 0:00 while still running.
    function fmt(ms) {
        const { h, m, s } = splitLength(ms);
        const ss = String(s).padStart(2, '0');
        return h ? h + ':' + String(m).padStart(2, '0') + ':' + ss : m + ':' + ss;
    }

    // Words: 6 min 30 s, 1 h 15 min, 45 s, 24 h.
    function fmtWords(ms) {
        const { h, m, s } = splitLength(ms);
        const out = [];
        if (h) out.push(h + ' h');
        if (m) out.push(m + ' min');
        if (s) out.push(s + ' s');
        return out.join(' ') || '0 s';
    }

    // How long ago a timer finished.
    function agoText(ms) {
        if (ms < MIN) return 'Done just now';
        const mins = Math.floor(ms / MIN);
        if (mins < 60) return 'Done ' + mins + ' min ago';
        const h = Math.floor(mins / 60), rest = mins % 60;
        if (h >= 48) return 'Done ' + Math.floor(h / 24) + ' days ago';
        return 'Done ' + h + ' h' + (rest ? ' ' + rest + ' min' : '') + ' ago';
    }

    function dayStart(t) { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }
    // "at 6:42 pm", "tomorrow at 6:42 pm". timeFmt turns a time stamp into the local clock time.
    function whenText(at, now, timeFmt) {
        const days = Math.round((dayStart(at) - dayStart(now)) / (24 * HOUR));
        const clock = timeFmt(at);
        if (days === 0) return 'at ' + clock;
        if (days === 1) return 'tomorrow at ' + clock;
        if (days === -1) return 'yesterday at ' + clock;
        return 'on ' + new Date(at).toDateString() + ' at ' + clock;
    }

    function cleanName(text) { return String(text == null ? '' : text).replace(/\s+/g, ' ').trim().slice(0, NAME_MAX); }

    // "Timer 1", "Timer 2"... the smallest number not used yet.
    function defaultName(timers) {
        const used = new Set(timers.map(t => (/^Timer (\d+)$/.exec(t.name) || [])[1]).filter(Boolean).map(Number));
        let n = 1; while (used.has(n)) n++;
        return 'Timer ' + n;
    }

    function leftOf(t, now) {
        if (t.status === 'running') return Math.max(0, t.endAt - now);
        if (t.status === 'paused') return t.left;
        return 0;
    }
    function isRinging(t, now) { return t.status === 'done' && !t.silenced && now - t.endedAt < RING_FOR; }
    // 0..1 of the way through
    function progress(t, now) {
        if (t.status === 'done') return 1;
        return t.total > 0 ? Math.min(1, Math.max(0, 1 - leftOf(t, now) / t.total)) : 0;
    }

    function newId(state) { state.nextId = (state.nextId || 1) + 1; return 't' + state.nextId; }

    // Start a new timer. Returns { timer } or { error }.
    function addTimer(state, name, ms, now) {
        if (state.timers.length >= MAX_TIMERS) return { error: 'You have ' + MAX_TIMERS + ' timers. Remove one you no longer need first.' };
        if (!(ms >= SEC && ms <= MAX_LEN)) return { error: 'Choose a length from 1 second to 24 hours.' };
        const timer = { id: newId(state), name: cleanName(name) || defaultName(state.timers), length: ms, total: ms,
            status: 'running', endAt: now + ms, left: ms, endedAt: 0, silenced: false, created: now };
        state.timers.push(timer);
        return { timer };
    }

    function pause(t, now) {
        if (t.status !== 'running') return false;
        t.left = Math.max(0, t.endAt - now);
        if (t.left <= 0) return false;
        t.status = 'paused';
        return true;
    }
    function resume(t, now) {
        if (t.status !== 'paused') return false;
        t.status = 'running'; t.endAt = now + t.left;
        return true;
    }
    // +1 min. On a finished timer it starts a fresh 1-minute run (and stops the alarm).
    function addMinute(t, now) {
        if (t.status === 'done') {
            t.status = 'running'; t.endAt = now + MIN; t.total = MIN; t.silenced = false; t.endedAt = 0;
            return true;
        }
        if (leftOf(t, now) + MIN > MAX_LEN) return false;
        if (t.status === 'running') t.endAt += MIN; else t.left += MIN;
        t.total += MIN;
        return true;
    }
    function restart(t, now) {
        t.status = 'running'; t.endAt = now + t.length; t.total = t.length; t.left = t.length; t.endedAt = 0; t.silenced = false;
        return true;
    }
    // Change the name and the time left. The new time becomes the length Restart uses. A paused timer stays paused.
    function change(t, name, ms, now) {
        if (!(ms >= SEC && ms <= MAX_LEN)) return false;
        t.name = cleanName(name) || t.name;
        t.length = ms; t.total = ms;
        if (t.status === 'paused') t.left = ms;
        else { t.status = 'running'; t.endAt = now + ms; t.left = ms; t.endedAt = 0; t.silenced = false; }
        return true;
    }
    function silence(t) { if (t.status !== 'done' || t.silenced) return false; t.silenced = true; return true; }

    // Moves timers whose end time has passed to "done". Returns the ones that just finished, earliest first.
    function tick(state, now) {
        const done = [];
        for (const t of state.timers) {
            if (t.status === 'running' && t.endAt <= now) { t.status = 'done'; t.endedAt = t.endAt; t.silenced = false; done.push(t); }
            if (t.status === 'done' && !t.silenced && now - t.endedAt >= RING_FOR) t.silenced = true;
        }
        return done.sort((a, b) => a.endedAt - b.endedAt);
    }

    // Ringing first, then running (ends first on top), then paused (least left first), then finished (latest first).
    function sorted(timers, now) {
        const rank = t => isRinging(t, now) ? 0 : t.status === 'running' ? 1 : t.status === 'paused' ? 2 : 3;
        return timers.slice().sort((a, b) => rank(a) - rank(b) ||
            (rank(a) === 3 || rank(a) === 0 ? b.endedAt - a.endedAt : leftOf(a, now) - leftOf(b, now)) || a.created - b.created);
    }

    // Saved timers
    function addFav(state, name, ms) {
        const n = cleanName(name);
        if (!n) return { error: 'Give the timer a name first.' };
        if (!(ms >= SEC && ms <= MAX_LEN)) return { error: 'Choose a length from 1 second to 24 hours.' };
        const same = state.favs.find(f => f.name.toLowerCase() === n.toLowerCase() && f.ms === ms);
        if (same) return { exists: same };
        if (state.favs.length >= MAX_FAVS) return { error: 'You have ' + MAX_FAVS + ' saved timers. Remove one first.' };
        const fav = { id: newId(state), name: n, ms };
        state.favs.push(fav);
        return { fav };
    }
    function starterFavs(state) { return STARTERS.map(s => ({ id: newId(state), name: s.name, ms: s.ms })); }

    function fresh() {
        const state = { v: 1, nextId: 1, timers: [], favs: [], settings: Object.assign({}, DEFAULT_SETTINGS) };
        state.favs = starterFavs(state);
        return state;
    }

    const num = (x, lo, hi) => typeof x === 'number' && Number.isFinite(x) && x >= lo && x <= hi;
    // Saved data -> a safe state. Anything broken is dropped; nothing usable -> a fresh start.
    function sanitize(raw) {
        let d = raw;
        if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { return fresh(); } }
        if (!d || typeof d !== 'object' || Array.isArray(d)) return fresh();
        const state = { v: 1, nextId: num(d.nextId, 1, 1e12) ? Math.floor(d.nextId) : 1, timers: [], favs: [], settings: Object.assign({}, DEFAULT_SETTINGS) };
        const ids = new Set();
        const okId = id => typeof id === 'string' && /^[\w-]{1,40}$/.test(id) && !ids.has(id);
        const BIG = 8.64e15;
        for (const t of Array.isArray(d.timers) ? d.timers : []) {
            if (state.timers.length >= MAX_TIMERS) break;
            if (!t || typeof t !== 'object' || !okId(t.id) || !['running', 'paused', 'done'].includes(t.status)) continue;
            if (!num(t.length, SEC, MAX_LEN)) continue;
            const timer = { id: t.id, name: cleanName(t.name) || 'Timer', length: t.length, total: num(t.total, 1, MAX_LEN + MAX_LEN) ? t.total : t.length,
                status: t.status, endAt: num(t.endAt, 0, BIG) ? t.endAt : 0, left: num(t.left, 0, MAX_LEN) ? t.left : 0,
                endedAt: num(t.endedAt, 0, BIG) ? t.endedAt : 0, silenced: t.silenced === true, created: num(t.created, 0, BIG) ? t.created : 0 };
            if (timer.status === 'running' && !timer.endAt) continue;
            if (timer.status === 'paused' && timer.left < SEC) continue;
            ids.add(timer.id); state.timers.push(timer);
        }
        if (Array.isArray(d.favs)) {
            for (const f of d.favs) {
                if (state.favs.length >= MAX_FAVS) break;
                if (!f || typeof f !== 'object' || !okId(f.id) || !num(f.ms, SEC, MAX_LEN) || !cleanName(f.name)) continue;
                ids.add(f.id); state.favs.push({ id: f.id, name: cleanName(f.name), ms: Math.round(f.ms / SEC) * SEC });
            }
        } else state.favs = starterFavs(state);
        const s = d.settings && typeof d.settings === 'object' ? d.settings : {};
        if (['beeps', 'bell', 'off'].includes(s.sound)) state.settings.sound = s.sound;
        for (const k of ['vibrate', 'awake', 'notify']) if (typeof s[k] === 'boolean') state.settings[k] = s[k];
        // ids must never repeat after a restore
        const top = [...ids].map(id => Number(id.replace(/^\D+/, ''))).filter(Number.isFinite);
        state.nextId = Math.max(state.nextId, ...top, 1);
        return state;
    }

    root.KitchenTimers = { SEC, MIN, HOUR, MAX_LEN, MAX_TIMERS, MAX_FAVS, RING_FOR, LOUD_FOR, NAME_MAX, STARTERS, DEFAULT_SETTINGS,
        parseNum, parseLength, splitLength, fmt, fmtWords, agoText, whenText, cleanName, defaultName, leftOf, isRinging, progress,
        addTimer, pause, resume, addMinute, restart, change, silence, tick, sorted, addFav, starterFavs, fresh, sanitize };
})(typeof window !== 'undefined' ? window : globalThis);
