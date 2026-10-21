// Quran Reading Planner and Khatam Tracker: the logic, with no page code, so tests.js can check it in Node and in test.html.
// Dates are local 'YYYY-MM-DD' strings. A position is the last page read (0 = not started).
(function (root) {
    'use strict';
    const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    // the printed copies people own; "custom" is any other page count typed by the person
    const COPIES = {
        '604': { pages: 604, name: 'Madani, 15 lines' },
        '610': { pages: 610, name: 'Indo-Pak, 15 lines' },
        '548': { pages: 548, name: 'Indo-Pak, 16 lines' },
        '848': { pages: 848, name: 'Indo-Pak, 13 lines' }
    };
    const LIMITS = { minPages: 30, maxPages: 2000, maxPerDay: 2000, maxDays: 3660, name: 40, title: 80, people: 30 };
    // Madani mushaf (604 pages): the page each surah starts on, and the surah names
    const SURAH_PAGE = [1, 2, 50, 77, 106, 128, 151, 177, 187, 208, 221, 235, 249, 255, 262, 267, 282, 293, 305, 312, 322, 332, 342, 350, 359, 367, 377, 385, 396, 404,
        411, 415, 418, 428, 434, 440, 446, 453, 458, 467, 477, 483, 489, 496, 499, 502, 507, 511, 515, 518, 520, 523, 526, 528, 531, 534, 537, 542, 545, 549,
        551, 553, 554, 556, 558, 560, 562, 564, 566, 568, 570, 572, 574, 575, 577, 578, 580, 582, 583, 585, 586, 587, 587, 589, 590, 591, 591, 592, 593, 594,
        595, 595, 596, 596, 597, 597, 598, 598, 599, 599, 600, 600, 601, 601, 601, 602, 602, 602, 603, 603, 603, 604, 604, 604];
    const SURAH_NAME = ['Al-Fatihah', 'Al-Baqarah', 'Al Imran', 'An-Nisa', 'Al-Maidah', 'Al-Anam', 'Al-Araf', 'Al-Anfal', 'At-Tawbah', 'Yunus', 'Hud', 'Yusuf', 'Ar-Rad', 'Ibrahim',
        'Al-Hijr', 'An-Nahl', 'Al-Isra', 'Al-Kahf', 'Maryam', 'Ta-Ha', 'Al-Anbiya', 'Al-Hajj', 'Al-Muminun', 'An-Nur', 'Al-Furqan', 'Ash-Shuara', 'An-Naml', 'Al-Qasas',
        'Al-Ankabut', 'Ar-Rum', 'Luqman', 'As-Sajdah', 'Al-Ahzab', 'Saba', 'Fatir', 'Ya-Sin', 'As-Saffat', 'Sad', 'Az-Zumar', 'Ghafir', 'Fussilat', 'Ash-Shura', 'Az-Zukhruf',
        'Ad-Dukhan', 'Al-Jathiyah', 'Al-Ahqaf', 'Muhammad', 'Al-Fath', 'Al-Hujurat', 'Qaf', 'Adh-Dhariyat', 'At-Tur', 'An-Najm', 'Al-Qamar', 'Ar-Rahman', 'Al-Waqiah',
        'Al-Hadid', 'Al-Mujadila', 'Al-Hashr', 'Al-Mumtahanah', 'As-Saff', 'Al-Jumuah', 'Al-Munafiqun', 'At-Taghabun', 'At-Talaq', 'At-Tahrim', 'Al-Mulk', 'Al-Qalam',
        'Al-Haqqah', 'Al-Maarij', 'Nuh', 'Al-Jinn', 'Al-Muzzammil', 'Al-Muddaththir', 'Al-Qiyamah', 'Al-Insan', 'Al-Mursalat', 'An-Naba', 'An-Naziat', 'Abasa', 'At-Takwir',
        'Al-Infitar', 'Al-Mutaffifin', 'Al-Inshiqaq', 'Al-Buruj', 'At-Tariq', 'Al-Ala', 'Al-Ghashiyah', 'Al-Fajr', 'Al-Balad', 'Ash-Shams', 'Al-Layl', 'Ad-Duha', 'Ash-Sharh',
        'At-Tin', 'Al-Alaq', 'Al-Qadr', 'Al-Bayyinah', 'Az-Zalzalah', 'Al-Adiyat', 'Al-Qariah', 'At-Takathur', 'Al-Asr', 'Al-Humazah', 'Al-Fil', 'Quraysh', 'Al-Maun',
        'Al-Kawthar', 'Al-Kafirun', 'An-Nasr', 'Al-Masad', 'Al-Ikhlas', 'Al-Falaq', 'An-Nas'];

    // ---------- dates ----------
    const pad = n => String(n).padStart(2, '0');
    function parse(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); }
    function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
    const isIso = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && iso(parse(s)) === s;
    const todayIso = now => iso(now || new Date());
    function addDays(s, n) { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); }
    const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / 86400000); // b - a in days
    function fmtDate(s) { const d = parse(s); return DAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()]; }
    function fmtDateY(s) { const d = parse(s); return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear(); }
    const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
    const pages = n => plural(n, 'page', 'pages');

    // ---------- typed values ----------
    // whole numbers only; "1,204" and spaces are fine, anything else is NaN
    function readInt(s) {
        const t = String(s == null ? '' : s).replace(/[\s,]/g, '');
        return /^\d{1,7}$/.test(t) ? Number(t) : NaN;
    }
    const cleanText = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

    // ---------- juz and surah ----------
    // Madani 604: juz 1 is pages 1-21, then every juz is 20 pages from page 22. Other copies: split evenly (about).
    const juzExact = total => total === 604;
    function juzStart(total, j) {
        if (j <= 1) return 1;
        if (total === 604) return 20 * (j - 1) + 2;
        return Math.round(1 + total * (j - 1) / 30);
    }
    const juzEnd = (total, j) => (j >= 30 ? total : juzStart(total, j + 1) - 1);
    function juzOfPage(total, p) { for (let j = 30; j >= 1; j--) if (p >= juzStart(total, j)) return j; return 1; }
    const juzDone = (total, pos) => { let n = 0; for (let j = 1; j <= 30; j++) if (juzEnd(total, j) <= pos) n++; return n; };
    function surahOfPage(p) { let s = 0; for (let i = 0; i < 114; i++) if (SURAH_PAGE[i] <= p) s = i; return { n: s + 1, name: SURAH_NAME[s] }; }

    // ---------- state ----------
    const emptyState = () => ({ v: 1, copy: '604', total: 604, plan: null, log: [], khatams: [], group: null, nextId: 1 });

    // the log sorted by day, then by the order it was typed
    const sortedLog = s => s.log.map((e, i) => ({ d: e.d, at: e.at, i })).sort((x, y) => (x.d < y.d ? -1 : x.d > y.d ? 1 : x.i - y.i));
    const startPos = s => (s.plan ? s.plan.from - 1 : 0);
    function position(s) { const l = sortedLog(s); return l.length ? l[l.length - 1].at : startPos(s); }
    // position at the end of a day (before any later reading)
    function positionOn(s, day) { let p = startPos(s); sortedLog(s).forEach(e => { if (e.d <= day) p = e.at; }); return p; }
    function dailyAmounts(s) {
        const out = {}; let prev = startPos(s);
        sortedLog(s).forEach(e => { const step = Math.max(0, e.at - prev); out[e.d] = (out[e.d] || 0) + step; prev = e.at; });
        return out;
    }
    const isComplete = s => !!s.plan && position(s) >= s.total;

    // checks a reading before it is saved: returns an error sentence, or '' when fine
    function checkReading(s, day, at, today) {
        if (!s.plan) return 'Set up your plan first.';
        if (!isIso(day)) return 'Pick the day you read.';
        if (day > today) return 'That day has not come yet.';
        if (day < s.plan.start) return 'That is before your plan started on ' + fmtDate(s.plan.start) + '. Change the start under "Change plan" first.';
        if (!Number.isInteger(at)) return 'Type the page number where you stopped, such as 221.';
        if (at < 1 || at > s.total) return 'Your copy has ' + s.total + ' pages. Type a page from 1 to ' + s.total + '.';
        const before = positionOn(s, day);
        if (at < before) return 'Page ' + at + ' is before page ' + before + ', where you had already reached. If that was a mistake, delete it under "History".';
        const later = sortedLog(s).find(e => e.d > day);
        if (later && at > later.at) return 'On ' + fmtDate(later.d) + ' you had only reached page ' + later.at + '. Type a page up to ' + later.at + ' for this day.';
        return '';
    }

    // ---------- the plan ----------
    // plan: { start, from (first page to read), mode: 'date' | 'pace', by, perDay }
    function schedule(plan, total) {
        const pos0 = plan.from - 1, P = total - pos0;
        const n = plan.mode === 'date' ? diffDays(plan.start, plan.by) + 1 : Math.max(1, Math.ceil(P / plan.perDay));
        const target = i => (i < 0 ? pos0 : i >= n - 1 ? total : plan.mode === 'date' ? pos0 + Math.ceil(P * (i + 1) / n) : Math.min(total, pos0 + plan.perDay * (i + 1)));
        return { days: n, end: addDays(plan.start, n - 1), perDay: plan.mode === 'date' ? Math.ceil(P / n) : plan.perDay, target, pages: P };
    }
    // checks a plan from the form: returns an error sentence, or ''
    function checkPlan(p, total, today) {
        if (!isIso(p.start)) return 'Pick the day you start.';
        if (!Number.isInteger(p.from) || p.from < 1 || p.from > total) return 'Type the page you start from: 1 to ' + total + '.';
        if (p.mode === 'date') {
            if (!isIso(p.by)) return 'Pick the day you want to finish by.';
            if (p.by < p.start) return 'The finish day is before the start day.';
            if (p.by < today) return 'That finish day has already passed. Pick today or a later day.';
            if (diffDays(p.start, p.by) + 1 > LIMITS.maxDays) return 'Pick a finish day within 10 years.';
        } else {
            if (!Number.isInteger(p.perDay) || p.perDay < 1) return 'Type how many pages a day, 1 or more.';
            if (p.perDay > LIMITS.maxPerDay) return 'That is more pages than the whole copy. Type a smaller number.';
        }
        return '';
    }

    // what to tell the reader today
    function status(s, today) {
        if (!s.plan) return null;
        const plan = s.plan, total = s.total, sc = schedule(plan, total), pos = position(s), left = total - pos;
        const base = { pos, left, total, end: sc.end, perDay: sc.perDay, mode: plan.mode };
        if (left <= 0) return Object.assign(base, { kind: 'complete', days: diffDays(plan.start, lastDay(s) || today) + 1 });
        if (today < plan.start) return Object.assign(base, { kind: 'future', start: plan.start });
        const i = diffDays(plan.start, today);
        const posStart = positionOn(s, addDays(today, -1));
        const readToday = pos - posStart;
        const behind = Math.max(0, sc.target(i - 1) - posStart);
        const ahead = Math.max(0, pos - sc.target(i));
        if (plan.mode === 'date') {
            if (today > plan.by) return Object.assign(base, { kind: 'passed', by: plan.by, readToday });
            const daysLeft = diffDays(today, plan.by) + 1;
            const need = Math.ceil((total - posStart) / daysLeft);
            const goal = Math.min(total, posStart + need);
            const todo = Math.max(0, goal - pos);
            const next = todo === 0 && daysLeft > 1 ? Math.ceil(left / (daysLeft - 1)) : 0; // a day from tomorrow
            return Object.assign(base, { kind: 'date', by: plan.by, daysLeft, need, goal, todo, readToday, behind, ahead, next });
        }
        const goal = Math.min(total, posStart + plan.perDay);
        const todo = Math.max(0, goal - pos);
        // finish at this pace: today's share still open, or from tomorrow when today is done
        const finish = todo > 0 ? addDays(today, Math.ceil((total - posStart) / plan.perDay) - 1) : addDays(today, Math.ceil(left / plan.perDay));
        return Object.assign(base, { kind: 'pace', goal, todo, readToday, behind, ahead, finish, late: diffDays(sc.end, finish) });
    }
    function lastDay(s) { const l = sortedLog(s); return l.length ? l[l.length - 1].d : ''; }

    // days in a row with reading, counting back from today (or yesterday if today has none yet)
    function streak(s, today) {
        const am = dailyAmounts(s), days = new Set(Object.keys(am).filter(d => am[d] > 0));
        s.khatams.forEach(k => (k.days || []).forEach(d => days.add(d)));
        let d = days.has(today) ? today : addDays(today, -1), n = 0;
        while (days.has(d)) { n++; d = addDays(d, -1); }
        return n;
    }
    // finishing a khatam: keep it in the list and clear the log for the next one
    function completeKhatam(s) {
        if (!isComplete(s)) return false;
        const am = dailyAmounts(s);
        s.khatams.push({ start: s.plan.start, end: lastDay(s) || s.plan.start, total: s.total, days: Object.keys(am).filter(d => am[d] > 0) });
        s.log = []; s.plan = null;
        return true;
    }

    // ---------- group khatam ----------
    const emptyGroup = () => ({ title: '', by: '', people: [], who: Array(30).fill(0), done: Array(30).fill(false) });
    // 30 juz in order: with 7 people the first 2 read 5 juz and the others 4
    function shareOut(g) {
        const k = g.people.length; if (!k) return false;
        const base = Math.floor(30 / k), extra = 30 % k; let j = 0;
        g.people.forEach((p, idx) => { const n = base + (idx < extra ? 1 : 0); for (let c = 0; c < n; c++) g.who[j++] = p.id; });
        return true;
    }
    const juzOf = (g, id) => { const out = []; g.who.forEach((w, i) => { if (w === id) out.push(i + 1); }); return out; };
    const groupDone = g => g.done.filter(Boolean).length;
    function ranges(list) { // [1,2,3,5] -> "1-3, 5"
        const out = []; let i = 0;
        while (i < list.length) { let j = i; while (j + 1 < list.length && list[j + 1] === list[j] + 1) j++; out.push(j > i + 1 ? list[i] + '-' + list[j] : j === i + 1 ? list[i] + ', ' + list[j] : String(list[i])); i = j + 1; }
        return out.join(', ');
    }
    function groupText(g) {
        const lines = [];
        lines.push(g.title ? 'Khatam: ' + g.title : 'Group Quran khatam');
        if (g.by) lines.push('Finish by ' + fmtDateY(g.by));
        lines.push(groupDone(g) + ' of 30 juz read');
        lines.push('');
        g.people.forEach(p => {
            const js = juzOf(g, p.id);
            if (!js.length) { lines.push(p.name + ': no juz yet'); return; }
            lines.push(p.name + ': Juz ' + js.map(j => j + (g.done[j - 1] ? ' ✓' : '')).join(', '));
        });
        const free = []; g.who.forEach((w, i) => { if (!w) free.push(i + 1); });
        if (free.length) lines.push('Not taken yet: Juz ' + ranges(free));
        const notDone = []; g.done.forEach((d, i) => { if (!d) notDone.push(i + 1); });
        lines.push('');
        lines.push(notDone.length ? 'Still to read: Juz ' + ranges(notDone) : 'All 30 juz are read. Khatam complete.');
        return lines.join('\n');
    }

    // ---------- my progress as text ----------
    function progressText(s, today) {
        const st = status(s, today), lines = ['My Quran reading'];
        if (st) {
            lines.push('Page ' + st.pos + ' of ' + s.total + ' (' + juzDone(s.total, st.pos) + ' of 30 juz done)');
            if (st.kind === 'complete') lines.push('Khatam complete.');
            else if (st.mode === 'date') lines.push('Finishing by ' + fmtDateY(s.plan.by) + (st.kind === 'date' ? ': ' + pages(st.need) + ' a day' : ''));
            else lines.push(pages(s.plan.perDay) + ' a day' + (st.kind === 'pace' ? ', finishing around ' + fmtDateY(st.finish) : ''));
        }
        const n = s.khatams.length + (isComplete(s) ? 1 : 0);
        lines.push('Khatams finished: ' + n);
        s.khatams.slice().reverse().forEach(k => lines.push('- ' + fmtDateY(k.start) + ' to ' + fmtDateY(k.end)));
        return lines.join('\n');
    }

    // ---------- saved state ----------
    function validate(o) {
        if (!o || typeof o !== 'object' || o.v !== 1) return null;
        const s = emptyState();
        const total = readInt(o.total);
        if (!(total >= LIMITS.minPages && total <= LIMITS.maxPages)) return null;
        s.total = total;
        s.copy = COPIES[o.copy] && COPIES[o.copy].pages === total ? o.copy : 'custom';
        if (o.plan) {
            const p = o.plan, plan = { start: p.start, from: p.from, mode: p.mode === 'pace' ? 'pace' : 'date', by: p.mode === 'pace' ? '' : p.by, perDay: p.mode === 'pace' ? p.perDay : 0 };
            if (!isIso(plan.start) || !Number.isInteger(plan.from) || plan.from < 1 || plan.from > total) return null;
            if (plan.mode === 'date' && (!isIso(plan.by) || plan.by < plan.start)) return null;
            if (plan.mode === 'pace' && !(Number.isInteger(plan.perDay) && plan.perDay >= 1 && plan.perDay <= LIMITS.maxPerDay)) return null;
            s.plan = plan;
            if (!Array.isArray(o.log)) return null;
            for (const e of o.log) {
                if (!e || !isIso(e.d) || !Number.isInteger(e.at) || e.at < 1 || e.at > total || e.d < plan.start) return null;
                s.log.push({ d: e.d, at: e.at });
            }
            // pages must never go down from one reading to the next
            let prev = plan.from - 1; for (const e of sortedLog(s)) { if (e.at < prev) return null; prev = e.at; }
        }
        if (Array.isArray(o.khatams)) {
            for (const k of o.khatams) {
                if (!k || !isIso(k.start) || !isIso(k.end) || k.end < k.start) return null;
                s.khatams.push({ start: k.start, end: k.end, total: readInt(k.total) || total, days: Array.isArray(k.days) ? k.days.filter(isIso).slice(0, 4000) : [] });
            }
        }
        if (o.group) {
            const g = o.group, ng = emptyGroup(); const ids = new Set();
            ng.title = cleanText(g.title, LIMITS.title);
            ng.by = isIso(g.by) ? g.by : '';
            if (!Array.isArray(g.people) || !Array.isArray(g.who) || !Array.isArray(g.done) || g.who.length !== 30 || g.done.length !== 30) return null;
            for (const p of g.people.slice(0, LIMITS.people)) {
                if (!p || !Number.isInteger(p.id) || p.id < 1 || ids.has(p.id)) return null;
                const name = cleanText(p.name, LIMITS.name); if (!name) return null;
                ids.add(p.id); ng.people.push({ id: p.id, name });
            }
            ng.who = g.who.map(w => (ids.has(w) ? w : 0));
            ng.done = g.done.map(d => d === true);
            s.group = ng;
        }
        let maxId = 0; if (s.group) s.group.people.forEach(p => { maxId = Math.max(maxId, p.id); });
        s.nextId = Math.max(Number.isInteger(o.nextId) ? o.nextId : 1, maxId + 1);
        return s;
    }

    const api = { COPIES, LIMITS, SURAH_PAGE, SURAH_NAME, isIso, todayIso, addDays, diffDays, fmtDate, fmtDateY, plural, pages, readInt, cleanText,
        juzExact, juzStart, juzEnd, juzOfPage, juzDone, surahOfPage, emptyState, sortedLog, position, positionOn, dailyAmounts, isComplete, checkReading,
        schedule, checkPlan, status, streak, completeKhatam, emptyGroup, shareOut, juzOf, groupDone, ranges, groupText, progressText, validate };
    if (typeof module === 'object' && module.exports) module.exports = api; else root.QuranCore = api;
})(this);
