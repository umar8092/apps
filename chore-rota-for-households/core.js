// Chore Rota for Households: the logic, with no page code. Used by script.js in the browser and by tests.js in node.
// Weeks are calendar dates ("2026-10-12" = the first day of that week), so time zones and summer time never move a chore.
(function (root) {
    'use strict';
    const DAY = 86400000;
    const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const EFFORT = { 1: 'Light', 2: 'Medium', 3: 'Heavy' };
    const MAX_PEOPLE = 20, MAX_CHORES = 40, MAX_EVERY = 12, MAX_WEEKS = 1200;
    const KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

    // ---------- dates ----------
    function isKey(k) {
        const m = typeof k === 'string' && KEY_RE.exec(k); if (!m) return false;
        const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
        return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
    }
    function dayNum(k) { const m = KEY_RE.exec(k); return Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY); }
    function keyOf(n) { const d = new Date(n * DAY); return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0'); }
    function todayKey(now) { const d = now || new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
    // first day of the week that holds the date key, for weeks that start on weekStart (0 = Sunday ... 6 = Saturday)
    function weekOf(key, weekStart) { const n = dayNum(key), dow = (n + 4) % 7; return keyOf(n - ((dow - weekStart + 7) % 7)); }
    function addWeeks(k, w) { return keyOf(dayNum(k) + 7 * w); }
    function weeksBetween(a, b) { return Math.round((dayNum(b) - dayNum(a)) / 7); }
    function shortDate(k, withYear) {
        const n = dayNum(k), d = new Date(n * DAY);
        return DAYS[(n + 4) % 7] + ' ' + d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()] + (withYear ? ' ' + d.getUTCFullYear() : '');
    }
    function weekRange(k, todayK) {
        const end = keyOf(dayNum(k) + 6), y = todayK ? todayK.slice(0, 4) : '';
        const yr = !!todayK && (k.slice(0, 4) !== y || end.slice(0, 4) !== y);
        return shortDate(k, yr && k.slice(0, 4) !== end.slice(0, 4)) + ' to ' + shortDate(end, yr);
    }

    // ---------- names and numbers ----------
    function cleanName(s, max) { return String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max); }
    // "Ali, Sam and Zoe" or one per line: the names to add, in order
    function splitNames(s) {
        return String(s == null ? '' : s).split(/[,;\n\r\t]+|\s+and\s+|\s*&\s*/i).map(x => cleanName(x, 30)).filter(Boolean);
    }
    function parseEvery(s) {
        const t = String(s == null ? '' : s).trim();
        if (!/^\d+$/.test(t)) return null;
        const n = +t; return n >= 1 && n <= MAX_EVERY ? n : null;
    }
    function freqText(c) {
        if (c.daily) return 'every day';
        return c.every === 1 ? 'every week' : 'every ' + c.every + ' weeks';
    }
    function listJoin(a) { return a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }

    // ---------- saved state ----------
    function emptyState(weekStart, today) {
        const ws = weekStart == null ? 1 : weekStart;
        return { v: 1, weekStart: ws, start: weekOf(today || todayKey(), ws), people: [], chores: [], frozen: {}, overrides: {}, done: {}, nextId: 1 };
    }
    // checks every value of a saved or imported state; returns a clean copy, or null if it is not ours
    function validate(raw) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
        if (!Array.isArray(raw.people) || !Array.isArray(raw.chores)) return null;
        const ws = Number.isInteger(raw.weekStart) && raw.weekStart >= 0 && raw.weekStart <= 6 ? raw.weekStart : 1;
        let start = isKey(raw.start) ? weekOf(raw.start, ws) : weekOf(todayKey(), ws);
        const wk = k => isKey(k) ? weekOf(k, ws) : null;
        const s = { v: 1, weekStart: ws, start, people: [], chores: [], frozen: {}, overrides: {}, done: {}, nextId: 1 };
        const ids = new Set(); let maxId = 0;
        const takeId = id => { if (!Number.isInteger(id) || id < 1 || id > 1e9 || ids.has(id)) return 0; ids.add(id); if (id > maxId) maxId = id; return id; };
        raw.people.slice(0, 200).forEach(p => {
            if (!p || typeof p !== 'object') return;
            const name = cleanName(p.name, 30), id = name && takeId(p.id); if (!id) return;
            const person = { id, name, from: wk(p.from) || start, away: [] };
            if (person.from < start) person.from = start;
            if (p.removed && wk(p.removed)) person.removed = wk(p.removed);
            if (Array.isArray(p.away)) person.away = [...new Set(p.away.map(wk).filter(Boolean))].sort().slice(-500);
            s.people.push(person);
        });
        const personIds = new Set(s.people.map(p => p.id));
        raw.chores.slice(0, 400).forEach(c => {
            if (!c || typeof c !== 'object') return;
            const name = cleanName(c.name, 40), id = name && takeId(c.id); if (!id) return;
            const every = Number.isInteger(c.every) && c.every >= 1 && c.every <= MAX_EVERY ? c.every : 1;
            const effort = c.effort === 1 || c.effort === 2 || c.effort === 3 ? c.effort : 2;
            const chore = { id, name, every: c.daily ? 1 : every, effort, daily: !!c.daily, only: null, from: wk(c.from) || start };
            if (chore.from < start) chore.from = start;
            if (Array.isArray(c.only)) { const o = [...new Set(c.only.filter(x => personIds.has(x)))]; if (o.length) chore.only = o; }
            if (c.removed && wk(c.removed)) chore.removed = wk(c.removed);
            s.chores.push(chore);
        });
        const choreIds = new Set(s.chores.map(c => c.id));
        const weekMap = (src, valOk) => {
            const out = {}; if (!src || typeof src !== 'object' || Array.isArray(src)) return out;
            Object.keys(src).slice(0, 3000).forEach(k => {
                if (!isKey(k) || weekOf(k, ws) !== k || k < start) return;
                const m = src[k]; if (!m || typeof m !== 'object' || Array.isArray(m)) return;
                const clean = {};
                Object.keys(m).forEach(cid => { const id = +cid; if (choreIds.has(id) && valOk(m[cid])) clean[id] = m[cid]; });
                if (Object.keys(clean).length) out[k] = clean;
            });
            return out;
        };
        s.frozen = weekMap(raw.frozen, v => v === null || personIds.has(v));
        s.overrides = weekMap(raw.overrides, v => personIds.has(v));
        s.done = weekMap(raw.done, v => v === true);
        s.nextId = Math.max(maxId + 1, Number.isInteger(raw.nextId) && raw.nextId > maxId && raw.nextId < 1e9 ? raw.nextId : 1);
        return s;
    }

    // ---------- who is in, what is due ----------
    const active = (x, wk) => x.from <= wk && !(x.removed && x.removed <= wk);
    const isHome = (p, wk) => active(p, wk) && !p.away.includes(wk);
    const canDo = (c, p) => !c.only || c.only.includes(p.id);
    function isDue(c, wk) { return active(c, wk) && weeksBetween(c.from, wk) % c.every === 0; }
    const livePeople = s => s.people.filter(p => !p.removed);
    const liveChores = s => s.chores.filter(c => !c.removed);

    // ---------- the rota ----------
    // Works week by week from the start of the rota. Each person has a balance: the points of the jobs they did minus their fair share
    // of each week's points while they were home (away weeks add nothing, so nobody "owes" for a holiday).
    // The next job (heaviest first) goes to whoever is lowest, with a penalty for doing the same job as last time, then to whoever did
    // this job the fewest times, then to the next person in line for it. Weeks that were frozen (before a change to the people or the chores)
    // keep the rota they showed; swaps made by hand change who did the job and so even out in later weeks.
    function compute(s, upto) {
        const weeks = {}, order = new Map(s.people.map((p, i) => [p.id, i])), N = s.people.length || 1;
        const bal = {}, times = {}, last = {};
        s.people.forEach(p => { bal[p.id] = 0; });
        let wk = s.start, guard = 0;
        if (!isKey(upto) || upto < s.start) return { weeks, bal };
        while (wk <= upto && guard++ < MAX_WEEKS) {
            const home = s.people.filter(p => isHome(p, wk)), homeIds = new Set(home.map(p => p.id));
            const due = s.chores.filter(c => isDue(c, wk)).sort((a, b) => b.effort - a.effort || s.chores.indexOf(a) - s.chores.indexOf(b));
            const total = due.reduce((t, c) => t + c.effort, 0);
            if (home.length) home.forEach(p => { bal[p.id] -= total / home.length; });
            const base = {}, fz = s.frozen[wk];
            if (fz) {
                due.forEach(c => { const v = fz[c.id]; base[c.id] = v === undefined ? null : v; });
            } else {
                const temp = Object.assign({}, bal);
                due.forEach(c => {
                    const cands = home.filter(p => canDo(c, p));
                    if (!cands.length) { base[c.id] = null; return; }
                    const t = times[c.id] || {}, lastIdx = last[c.id] != null ? order.get(last[c.id]) : -1;
                    const key = p => [Math.round((temp[p.id] + (last[c.id] === p.id ? c.effort : 0)) * 1e6), t[p.id] || 0, (order.get(p.id) - lastIdx - 1 + N) % N];
                    cands.sort((a, b) => { const x = key(a), y = key(b); return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]; });
                    base[c.id] = cands[0].id; temp[cands[0].id] += c.effort;
                });
            }
            const ov = s.overrides[wk] || {}, assign = {}, swapped = {};
            due.forEach(c => {
                assign[c.id] = base[c.id];
                if (ov[c.id] != null && s.people.some(p => p.id === ov[c.id]) && ov[c.id] !== base[c.id]) { assign[c.id] = ov[c.id]; swapped[c.id] = true; }
                const who = assign[c.id];
                if (who != null) {
                    if (bal[who] === undefined) bal[who] = 0;
                    bal[who] += c.effort;
                    times[c.id] = times[c.id] || {}; times[c.id][who] = (times[c.id][who] || 0) + 1; last[c.id] = who;
                }
            });
            weeks[wk] = { due: due.map(c => c.id), base, assign, swapped, home: [...homeIds] };
            wk = addWeeks(wk, 1);
        }
        return { weeks, bal };
    }
    // the base rota of every week before `beforeWeek`, so a change to the people or chores does not rewrite past weeks
    function freeze(s, beforeWeek) {
        const prev = addWeeks(beforeWeek, -1);
        if (prev < s.start) return s;
        const r = compute(s, prev);
        Object.keys(r.weeks).forEach(k => { if (!s.frozen[k]) s.frozen[k] = Object.assign({}, r.weeks[k].base); });
        return s;
    }
    // jobs and points per person from the start up to and including week `upto`
    function stats(s, upto) {
        const r = compute(s, upto), out = {};
        s.people.forEach(p => { out[p.id] = { jobs: 0, points: 0, away: 0 }; });
        Object.keys(r.weeks).forEach(k => {
            const w = r.weeks[k];
            w.due.forEach(cid => { const who = w.assign[cid], c = s.chores.find(x => x.id === cid); if (who != null && out[who]) { out[who].jobs++; out[who].points += c.effort; } });
            s.people.forEach(p => { if (active(p, k) && p.away.includes(k)) out[p.id].away++; });
        });
        return out;
    }
    // one week, grouped by person, for the page and for copying
    function weekView(s, wk, r) {
        const w = (r || compute(s, wk)).weeks[wk];
        const people = s.people.filter(p => active(p, wk)).map(p => ({ id: p.id, name: p.name, away: p.away.includes(wk), jobs: [] }));
        const byId = new Map(people.map(p => [p.id, p])), unassigned = [], extra = [];
        if (w) w.due.forEach(cid => {
            const c = s.chores.find(x => x.id === cid), who = w.assign[cid];
            const job = { id: cid, name: c.name, effort: c.effort, freq: freqText(c), swapped: !!w.swapped[cid], done: !!(s.done[wk] && s.done[wk][cid]), base: w.base[cid] };
            if (who == null) unassigned.push(job);
            else if (byId.has(who)) byId.get(who).jobs.push(job);
            else { const p = s.people.find(x => x.id === who); if (p) { const e = { id: p.id, name: p.name, away: false, jobs: [job], gone: true }; byId.set(p.id, e); extra.push(e); } }
        });
        const all = people.concat(extra);
        const count = all.reduce((t, p) => t + p.jobs.length, 0) + unassigned.length;
        const done = all.reduce((t, p) => t + p.jobs.filter(j => j.done).length, 0) + unassigned.filter(j => j.done).length;
        return { week: wk, people: all, unassigned, count, done, exists: !!w };
    }
    function weekText(s, wk, today) {
        const v = weekView(s, wk), lines = ['Chore rota, ' + weekRange(wk, today)];
        v.people.forEach(p => {
            if (p.away && !p.jobs.length) lines.push(p.name + ': away');
            else lines.push(p.name + ': ' + (p.jobs.length ? p.jobs.map(j => j.name + (j.done ? ' (done)' : '')).join(', ') : 'nothing this week'));
        });
        if (v.unassigned.length) lines.push('Nobody free for: ' + v.unassigned.map(j => j.name).join(', '));
        return lines.join('\n');
    }

    const API = { DAYS, DAY_NAMES, EFFORT, MAX_PEOPLE, MAX_CHORES, MAX_EVERY, isKey, dayNum, keyOf, todayKey, weekOf, addWeeks, weeksBetween, shortDate, weekRange,
        cleanName, splitNames, parseEvery, freqText, listJoin, emptyState, validate, active, isHome, canDo, isDue, livePeople, liveChores, compute, freeze, stats, weekView, weekText };
    if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.ChoreCore = API;
})(typeof self !== 'undefined' ? self : this);
