// School Run Carpool Rota for Parents: the logic, with no page code. Used by script.js in the browser and by tests.js in node.
// Days are calendar dates ("2026-10-28") turned into day numbers in UTC, so time zones and summer time never move a drive.
(function (root) {
    'use strict';
    const DAY = 86400000;
    const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const RUNS = ['am', 'pm'];
    const RUN_NAME = { am: 'Morning', pm: 'Afternoon' };
    const RUN_LONG = { am: 'Morning (to school)', pm: 'Afternoon (home)' };
    const MAX_FAMILIES = 12, MAX_KIDS = 8, MAX_SEATS = 9, MAX_AWAY = 30, MAX_HOLIDAYS = 60, MAX_CENTS = 100000000; // 1,000,000.00 a drive
    const KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

    // ---------- dates ----------
    function isKey(k) {
        const m = typeof k === 'string' && KEY_RE.exec(k); if (!m) return false;
        const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
        return +m[1] >= 2000 && +m[1] <= 2200 && d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
    }
    function dayNum(k) { const m = KEY_RE.exec(k); return Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY); }
    function keyOf(n) { const d = new Date(n * DAY); return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0'); }
    function todayKey(now) { const d = now || new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
    function addDays(k, n) { return keyOf(dayNum(k) + n); }
    function weekday(k) { return (dayNum(k) + 4) % 7; }
    function mondayOf(k) { return addDays(k, -((weekday(k) + 6) % 7)); }
    function shortDate(k, withYear) {
        const n = dayNum(k), d = new Date(n * DAY);
        return DAYS[(n + 4) % 7] + ' ' + d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()] + (withYear ? ' ' + d.getUTCFullYear() : '');
    }
    function monthName(ym) { return MONTH_NAMES[+ym.slice(5, 7) - 1] + ' ' + ym.slice(0, 4); }
    function addMonths(ym, n) { let y = +ym.slice(0, 4), m = +ym.slice(5, 7) - 1 + n; y += Math.floor(m / 12); m = ((m % 12) + 12) % 12; return y + '-' + String(m + 1).padStart(2, '0'); }

    // ---------- names and money ----------
    function cleanName(s, max) { return String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max); }
    function splitNames(s) { return String(s == null ? '' : s).split(/[,;\n\r\t]+|\s+and\s+|\s*&\s*/i).map(x => cleanName(x, 30)).filter(Boolean); }
    function listJoin(a) { return a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }
    // "300", "1,200.50", "12,50", "1,20,000", "$ 4.5" -> whole cents; NaN when it is not a usable amount
    function parseMoney(s) {
        let t = String(s == null ? '' : s).replace(/[\s ]/g, '').replace(/^(rs\.?|inr|pkr|aed|sar|usd|eur|gbp|[$€£₹¥])+/i, '').replace(/(rs\.?|[$€£₹¥])+$/i, '');
        if (!t || !/^[0-9.,]+$/.test(t)) return NaN;
        const lc = t.lastIndexOf(','), ld = t.lastIndexOf('.');
        if (lc >= 0 && ld >= 0) { const dec = lc > ld ? ',' : '.'; t = t.split(dec === ',' ? '.' : ',').join(''); if (dec === ',') t = t.replace(',', '.'); }
        else if (lc >= 0) { t = (t.split(',').length === 2 && /,\d{1,2}$/.test(t)) ? t.replace(',', '.') : t.split(',').join(''); }
        if (!/^\d+(\.\d{0,2})?$/.test(t) && !/^\.\d{1,2}$/.test(t)) return NaN;
        const [w, f = ''] = t.split('.');
        const c = (+(w || 0)) * 100 + +(f + '00').slice(0, 2);
        return c > MAX_CENTS ? NaN : c;
    }
    function groupDigits(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
    function money(c, cur) {
        const neg = c < 0, a = Math.abs(Math.round(c));
        const s = groupDigits(Math.floor(a / 100)) + '.' + String(a % 100).padStart(2, '0');
        return (neg ? '-' : '') + (cur ? cur + (/^[A-Za-z]/.test(cur) ? ' ' : '') : '') + s;
    }

    // ---------- saved state ----------
    function emptyState(today) {
        return { v: 1, title: 'School run', days: [1, 2, 3, 4, 5], runs: { am: true, pm: true }, start: today || todayKey(),
            families: [], holidays: [], over: {}, log: {}, cost: { on: false, cents: 0 }, cur: '', nextId: 1 };
    }
    const str = (v, max) => typeof v === 'string' ? cleanName(v, max) : '';
    const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
    function cleanRange(r) {
        if (!r || !isKey(r.from) || !isKey(r.to) || r.to < r.from) return null;
        return { from: r.from, to: r.to, name: str(r.name, 40) };
    }
    // checks every value of a saved or imported state; returns a clean copy, or null if it is not ours
    function validate(raw) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.v !== 1 || !isKey(raw.start)) return null;
        const s = emptyState(raw.start);
        s.title = str(raw.title, 40) || 'School run';
        if (Array.isArray(raw.days)) s.days = [...new Set(raw.days.filter(d => int(d, 0, 6)))].sort();
        if (raw.runs && typeof raw.runs === 'object') s.runs = { am: raw.runs.am !== false, pm: raw.runs.pm !== false };
        if (!s.runs.am && !s.runs.pm) s.runs.am = true;
        const ids = new Set(); let maxId = 0;
        const useId = id => { if (!int(id, 1, 1e9) || ids.has(id)) return false; ids.add(id); if (id > maxId) maxId = id; return true; };
        (Array.isArray(raw.families) ? raw.families : []).slice(0, 200).forEach(f => {
            if (!f || typeof f !== 'object' || !useId(f.id)) return;
            const name = str(f.name, 30); if (!name) return;
            const kids = [];
            (Array.isArray(f.kids) ? f.kids : []).slice(0, MAX_KIDS).forEach(k => {
                if (!k || !useId(k.id)) return; const kn = str(k.name, 30); if (!kn) return;
                kids.push({ id: k.id, name: kn, rides: ['both', 'am', 'pm'].includes(k.rides) ? k.rides : 'both' });
            });
            const no = [...new Set((Array.isArray(f.no) ? f.no : []).filter(x => typeof x === 'string' && /^[0-6](am|pm)$/.test(x)))].sort();
            const away = (Array.isArray(f.away) ? f.away : []).map(cleanRange).filter(Boolean).slice(0, MAX_AWAY);
            const joined = isKey(f.joined) ? f.joined : s.start;
            const left = isKey(f.left) && f.left >= joined ? f.left : null;
            s.families.push({ id: f.id, name, kids, seats: int(f.seats, 1, MAX_SEATS) ? f.seats : 4, no, away, joined, left });
        });
        s.holidays = (Array.isArray(raw.holidays) ? raw.holidays : []).map(cleanRange).filter(Boolean).slice(0, MAX_HOLIDAYS);
        const famIds = new Set(s.families.map(f => f.id));
        const kidIds = new Set(); s.families.forEach(f => f.kids.forEach(k => kidIds.add(k.id)));
        if (raw.over && typeof raw.over === 'object') Object.keys(raw.over).slice(0, 5000).forEach(k => {
            const o = raw.over[k]; if (!isKey(k) || !o || typeof o !== 'object') return;
            const c = {}; if (o.off === true) c.off = true;
            RUNS.forEach(r => { const x = o[r]; if (!x || typeof x !== 'object') return; const y = {};
                if (famIds.has(x.driver)) y.driver = x.driver;
                if (Array.isArray(x.out)) { const out = [...new Set(x.out.filter(id => kidIds.has(id)))]; if (out.length) y.out = out; }
                if (Object.keys(y).length) c[r] = y; });
            if (Object.keys(c).length) s.over[k] = c;
        });
        if (raw.log && typeof raw.log === 'object') Object.keys(raw.log).slice(0, 5000).forEach(k => {
            const e = raw.log[k]; if (!isKey(k) || !e || typeof e !== 'object' || k < s.start) return;
            const c = { off: typeof e.off === 'string' && e.off ? cleanName(e.off, 40) || 'No school' : '' };
            RUNS.forEach(r => { const x = e[r]; if (!x || typeof x !== 'object') return;
                c[r] = { d: famIds.has(x.d) ? x.d : null, k: Array.isArray(x.k) ? [...new Set(x.k.filter(id => int(id, 1, 1e9)))].slice(0, 100) : [], sw: x.sw === true }; });
            s.log[k] = c;
        });
        if (raw.cost && typeof raw.cost === 'object') s.cost = { on: raw.cost.on === true, cents: int(raw.cost.cents, 0, MAX_CENTS) ? raw.cost.cents : 0 };
        s.cur = str(raw.cur, 4);
        s.nextId = Math.max(int(raw.nextId, 1, 2e9) ? raw.nextId : 1, maxId + 1);
        return s;
    }

    // ---------- who drives ----------
    const inRange = (k, r) => k >= r.from && k <= r.to;
    function activeOn(f, k) { return f.joined <= k && (!f.left || k < f.left); }
    function awayOn(f, k) { return f.away.some(r => inRange(k, r)); }
    function holidayOn(s, k) { const h = s.holidays.find(r => inRange(k, r)); return h ? (h.name || 'No school') : ''; }
    function isSchoolDay(s, k) { return s.days.includes(weekday(k)); }
    function canDrive(f, k, r) { return !f.no.includes(weekday(k) + r); }
    function riders(s, k, r) {
        const out = ((s.over[k] || {})[r] || {}).out || [], list = [];
        s.families.forEach(f => { if (!activeOn(f, k) || awayOn(f, k)) return;
            f.kids.forEach(c => { if ((c.rides === 'both' || c.rides === r) && !out.includes(c.id)) list.push(c.id); }); });
        return list;
    }
    // the drives of one school day with the scores so far; does not change the scores
    function decideDay(s, k, score, last) {
        const o = s.over[k] || {};
        const off = holidayOn(s, k) || (o.off ? 'No school' : '');
        const day = { key: k, off, runs: {} };
        if (off) return day;
        const famIdx = new Map(s.families.map((f, i) => [f.id, i]));
        const droveToday = new Set();
        RUNS.forEach(r => {
            if (!s.runs[r]) return;
            const kids = riders(s, k, r);
            const run = { d: null, k: kids, sw: false };
            if (kids.length) {
                const want = (o[r] || {}).driver, wf = s.families.find(f => f.id === want);
                if (wf && activeOn(wf, k)) { run.d = want; run.sw = true; }
                else {
                    const cands = s.families.filter(f => activeOn(f, k) && !awayOn(f, k) && canDrive(f, k, r));
                    // enough seats first, then fewest drives (today's drive, plus one more so the same family rarely does both runs), then whoever drove longest ago
                    const eff = f => score.get(f.id) + (droveToday.has(f.id) ? 2 : 0);
                    cands.sort((a, b) => ((b.seats >= kids.length) - (a.seats >= kids.length)) || (eff(a) - eff(b))
                        || (droveToday.has(a.id) - droveToday.has(b.id)) || ((last.has(a.id) ? last.get(a.id) : -1) - (last.has(b.id) ? last.get(b.id) : -1)) || (famIdx.get(a.id) - famIdx.get(b.id)));
                    if (cands.length) run.d = cands[0].id;
                }
                if (run.d != null) droveToday.add(run.d);
            }
            day.runs[r] = run;
        });
        return day;
    }
    // walks every day from the start to `until` (and at least to today); past days come from the log so later changes never rewrite them
    function compute(s, today, until) {
        const end = until > today ? until : today;
        const score = new Map(), drives = new Map(), last = new Map(), days = {};
        let upToToday = null, scoreToday = null;
        const famById = new Map(s.families.map(f => [f.id, f]));
        const startN = dayNum(s.start), endN = dayNum(end);
        for (let n = startN; n <= endN; n++) {
            const k = keyOf(n);
            // a family that joins later starts level with the family that has driven least, so it does not drive every day to catch up
            s.families.forEach(f => { if (!score.has(f.id) && activeOn(f, k)) {
                const others = s.families.filter(g => g.id !== f.id && score.has(g.id) && activeOn(g, k)).map(g => score.get(g.id));
                score.set(f.id, f.joined > s.start && others.length ? Math.min(...others) : 0); drives.set(f.id, 0); } });
            if (!isSchoolDay(s, k) && !s.log[k]) { if (k === today) { upToToday = snapshot(drives); scoreToday = new Map(score); } continue; }
            let day;
            if (k < today && s.log[k]) { const e = s.log[k]; day = { key: k, off: e.off, runs: {}, frozen: true };
                RUNS.forEach(r => { if (e[r]) day.runs[r] = { d: e[r].d, k: e[r].k, sw: e[r].sw }; }); }
            else day = decideDay(s, k, score, last);
            RUNS.forEach(r => { const run = day.runs[r]; if (!run || run.d == null || !famById.has(run.d)) return;
                if (!score.has(run.d)) { score.set(run.d, 0); drives.set(run.d, 0); }
                score.set(run.d, score.get(run.d) + 1); drives.set(run.d, drives.get(run.d) + 1); last.set(run.d, n * 2 + (r === 'pm' ? 1 : 0)); });
            days[k] = day;
            if (k === today) { upToToday = snapshot(drives); scoreToday = new Map(score); }
        }
        if (!upToToday) { upToToday = snapshot(drives); scoreToday = new Map(score); }
        // drives and fair-share scores up to and including today (a family that joined later starts level, so its score can be above its drives)
        return { days, drives: upToToday, score: scoreToday };
    }
    function snapshot(m) { const o = {}; m.forEach((v, k) => { o[k] = v; }); return o; }
    // saves the drives of days before today, so changing a family's days or seats later never rewrites what already happened
    function freeze(s, today) {
        const r = compute(s, today, today); let changed = false;
        Object.keys(r.days).forEach(k => { if (k >= today || s.log[k]) return; const d = r.days[k], e = { off: d.off || '' };
            RUNS.forEach(x => { if (d.runs[x]) e[x] = { d: d.runs[x].d, k: d.runs[x].k.slice(), sw: d.runs[x].sw }; });
            s.log[k] = e; changed = true; });
        return changed;
    }
    // a change to a past day: forget its saved drives so they are worked out again with the change
    function unfreeze(s, k) { delete s.log[k]; }

    // ---------- fuel cost sharing ----------
    // each drive costs `cents`; the driver is owed it and it is shared by the families of the children in the car (per child),
    // in whole cents, the odd cents going to the families with the largest remainders
    function settle(s, r, ym, today) {
        const kidFam = new Map(); s.families.forEach(f => f.kids.forEach(c => kidFam.set(c.id, f.id)));
        const net = new Map(), drove = new Map(), share = new Map(), order = s.families.map(f => f.id);
        const add = (m, id, v) => m.set(id, (m.get(id) || 0) + v);
        const C = s.cost.cents; let count = 0, kidTrips = 0;
        Object.keys(r.days).sort().forEach(k => {
            if (k.slice(0, 7) !== ym || k > today) return;
            RUNS.forEach(x => { const run = r.days[k].runs[x]; if (!run || run.d == null) return;
                count++; add(drove, run.d, 1);
                const per = new Map(); run.k.forEach(id => { const f = kidFam.get(id); if (f != null) per.set(f, (per.get(f) || 0) + 1); });
                const total = [...per.values()].reduce((a, b) => a + b, 0); kidTrips += total;
                if (!total) { per.set(run.d, 1); }
                const T = total || 1, parts = [...per.entries()].map(([f, n]) => ({ f, base: Math.floor(C * n / T), rem: (C * n) % T, i: order.indexOf(f) }));
                let left = C - parts.reduce((a, p) => a + p.base, 0);
                parts.sort((a, b) => b.rem - a.rem || a.i - b.i).forEach(p => { if (left > 0) { p.base++; left--; } });
                parts.forEach(p => { add(share, p.f, p.base); add(net, p.f, -p.base); });
                add(net, run.d, C);
            });
        });
        const rows = s.families.filter(f => drove.has(f.id) || share.has(f.id)).map(f => ({ id: f.id, name: f.name, drove: drove.get(f.id) || 0,
            owed: (drove.get(f.id) || 0) * C, share: share.get(f.id) || 0, net: net.get(f.id) || 0 }));
        return { count, total: count * C, kidTrips, rows, pays: payments(rows) };
    }
    // fewest payments: the family that owes most pays the family owed most, until everyone is level
    function payments(rows) {
        const deb = rows.filter(x => x.net < 0).map(x => ({ id: x.id, name: x.name, v: -x.net })), cre = rows.filter(x => x.net > 0).map(x => ({ id: x.id, name: x.name, v: x.net }));
        const out = [];
        while (deb.length && cre.length) {
            deb.sort((a, b) => b.v - a.v); cre.sort((a, b) => b.v - a.v);
            const d = deb[0], c = cre[0], v = Math.min(d.v, c.v);
            out.push({ from: d.name, to: c.name, cents: v });
            d.v -= v; c.v -= v; if (!d.v) deb.shift(); if (!c.v) cre.shift();
        }
        return out;
    }

    // ---------- text for the group chat ----------
    function kidNames(s, ids) { const m = new Map(); s.families.forEach(f => f.kids.forEach(c => m.set(c.id, c.name))); return ids.map(id => m.get(id)).filter(Boolean); }
    function famName(s, id) { const f = s.families.find(x => x.id === id); return f ? f.name : ''; }
    function runLine(s, run, r) {
        if (!run.k.length) return RUN_NAME[r] + ': no ride needed';
        return RUN_NAME[r] + ': ' + (run.d == null ? 'NOBODY CAN DRIVE yet' : famName(s, run.d) + ' drives') + ' (' + kidNames(s, run.k).join(', ') + ')';
    }
    function weekText(s, r, monday, today) {
        const lines = [s.title + ' rota, week of ' + shortDate(monday, monday.slice(0, 4) !== today.slice(0, 4)), ''];
        for (let i = 0; i < 7; i++) {
            const k = addDays(monday, i), d = r.days[k]; if (!d && !isSchoolDay(s, k)) continue;
            lines.push(shortDate(k) + (k === today ? ' (today)' : ''));
            if (!d) { lines.push('  No drives'); continue; }
            if (d.off) { lines.push('  No school: ' + d.off); continue; }
            RUNS.forEach(x => { if (d.runs[x]) lines.push('  ' + runLine(s, d.runs[x], x)); });
        }
        return lines.join('\n');
    }

    const api = { DAYS, DAY_NAMES, MONTHS, RUNS, RUN_NAME, RUN_LONG, MAX_FAMILIES, MAX_KIDS, MAX_SEATS, MAX_AWAY, MAX_HOLIDAYS, MAX_CENTS,
        isKey, dayNum, keyOf, todayKey, addDays, weekday, mondayOf, shortDate, monthName, addMonths,
        cleanName, splitNames, listJoin, parseMoney, money, emptyState, validate,
        activeOn, awayOn, holidayOn, isSchoolDay, canDrive, riders, compute, freeze, unfreeze, settle, payments, kidNames, famName, runLine, weekText };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CarpoolCore = api;
})(typeof self !== 'undefined' ? self : this);
