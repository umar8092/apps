// Tasbeeh Counter with Daily Dhikr Targets: the logic, with no page code, so tests.js can check it in Node and in test.html.
// Days are local 'YYYY-MM-DD' strings. Every count is a whole number. The app only counts; it gives no rulings.
(function (root) {
    'use strict';
    const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const LONG_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const LIMITS = { count: 9999999, target: 1000000, goal: 9999999, steps: 10, stepCount: 1000, rounds: 50, people: 500, name: 40, arabic: 120, items: 40 };

    // the phrases people pick from; arabic is shown large, the name is the transliteration
    const PHRASES = [
        { key: 'subhanallah', name: 'SubhanAllah', arabic: 'سُبْحَانَ اللَّهِ', meaning: 'Glory be to Allah' },
        { key: 'alhamdulillah', name: 'Alhamdulillah', arabic: 'الْحَمْدُ لِلَّهِ', meaning: 'All praise is for Allah' },
        { key: 'allahuakbar', name: 'Allahu Akbar', arabic: 'اللَّهُ أَكْبَرُ', meaning: 'Allah is the Greatest' },
        { key: 'istighfar', name: 'Astaghfirullah (Istighfar)', arabic: 'أَسْتَغْفِرُ اللَّهَ', meaning: 'I seek forgiveness from Allah' },
        { key: 'durood', name: 'Durood (Salawat)', arabic: 'اللَّهُمَّ صَلِّ عَلَى مُحَمَّدٍ', meaning: 'O Allah, send blessings on Muhammad' },
        { key: 'tahlil', name: 'La ilaha illallah', arabic: 'لَا إِلَهَ إِلَّا اللَّهُ', meaning: 'There is no god but Allah' },
        { key: 'bihamdihi', name: 'SubhanAllahi wa bihamdihi', arabic: 'سُبْحَانَ اللَّهِ وَبِحَمْدِهِ', meaning: 'Glory and praise be to Allah' },
        { key: 'hawqala', name: 'La hawla wa la quwwata illa billah', arabic: 'لَا حَوْلَ وَلَا قُوَّةَ إِلَّا بِاللَّهِ', meaning: 'There is no power and no strength except with Allah' },
        { key: 'karima', name: 'Ayat-e-Karima', arabic: 'لَا إِلَهَ إِلَّا أَنْتَ سُبْحَانَكَ إِنِّي كُنْتُ مِنَ الظَّالِمِينَ', meaning: 'There is no god but You, glory be to You; I was among the wrongdoers' }
    ];
    const phrase = key => PHRASES.find(p => p.key === key);

    // ---------- days ----------
    const pad = n => String(n).padStart(2, '0');
    function parse(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); }
    function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
    const isIso = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && iso(parse(s)) === s;
    function addDays(s, n) { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); }
    const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / 86400000); // b - a in days
    const dow = s => parse(s).getDay();
    function fmtDate(s) { const d = parse(s); return DAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()]; }
    function fmtDateY(s) { const d = parse(s); return fmtDate(s) + ' ' + d.getFullYear(); }
    // the counting day: with a day start of 4, 02:30 still counts for the day before
    function dayKey(now, startHour) {
        const d = new Date(now.getTime());
        if (now.getHours() < (startHour || 0)) d.setDate(d.getDate() - 1);
        return iso(d);
    }

    // ---------- numbers ----------
    const fmt = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const plural = (n, one, many) => fmt(n) + ' ' + (n === 1 ? one : many);
    // whole numbers only; "1,25,000", "1 000" and spaces are fine, anything else is NaN
    function readInt(s) {
        const t = String(s == null ? '' : s).replace(/[\s,]/g, '');
        return /^\d{1,7}$/.test(t) ? Number(t) : NaN;
    }
    const cleanText = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

    // ---------- items ----------
    // daily: a target for each day (or only some weekdays). set: phrases in order, such as 33 + 33 + 34 after each prayer.
    // goal: one big total over many days, such as 1,25,000 Ayat-e-Karima for a gathering.
    function newDaily(id, p, target, days) { return { id, kind: 'daily', name: p.name, arabic: p.arabic || '', target, days: days || null, mark: target % 33 === 0 && target <= 99 ? 33 : 100 }; }
    function newSet(id, name, steps, rounds) { return { id, kind: 'set', name, steps, rounds }; }
    function newGoal(id, p, total, by, people) { return { id, kind: 'goal', name: p.name, arabic: p.arabic || '', total, by: by || '', people: people || 0, offset: 0 }; }
    const fatimahSteps = () => ['subhanallah', 'alhamdulillah', 'allahuakbar'].map((k, i) => ({ name: phrase(k).name, arabic: phrase(k).arabic, count: i === 2 ? 34 : 33 }));

    function starter() {
        return {
            v: 1, nextId: 4, active: 1,
            items: [newSet(1, 'Tasbeeh after prayer (33, 33, 34)', fatimahSteps(), 5), newDaily(2, phrase('istighfar'), 100), newDaily(3, phrase('durood'), 100)],
            log: {}, settings: { dayStart: 0, vibrate: 'marks' }
        };
    }

    const countOn = (state, day, id) => (state.log[day] && state.log[day][id]) || 0;
    function setCount(state, day, id, n) {
        n = Math.max(0, Math.min(LIMITS.count, Math.round(n)));
        const d = state.log[day] || (state.log[day] = {});
        if (n > 0) d[id] = n; else delete d[id];
        if (!Object.keys(d).length) delete state.log[day];
        return n;
    }
    const addCount = (state, day, id, n) => setCount(state, day, id, countOn(state, day, id) + n);
    const totalAll = (state, id) => Object.keys(state.log).reduce((a, d) => a + (state.log[d][id] || 0), 0);
    const roundSize = it => it.steps.reduce((a, s) => a + s.count, 0);
    const hasTarget = (it, day) => it.kind === 'daily' ? (!it.days || it.days.includes(dow(day))) : it.kind === 'set';

    // where a set is after n taps today: rounds done, the phrase being counted and how far into it
    function setPosition(it, n) {
        const size = roundSize(it), done = Math.floor(n / size);
        let r = n - done * size, i = 0;
        while (r >= it.steps[i].count) { r -= it.steps[i].count; i++; }
        return { rounds: done, step: i, inStep: r, stepCount: it.steps[i].count };
    }

    // the target for one day, in taps (0 when there is none that day)
    function dayTarget(it, day) {
        if (it.kind === 'daily') return hasTarget(it, day) ? it.target : 0;
        if (it.kind === 'set') return it.rounds * roundSize(it);
        return 0;
    }

    // should the phone buzz after this tap? 'target' wins over 'mark'
    function buzzAfter(state, it, day) {
        const n = countOn(state, day, it.id);
        if (n <= 0) return '';
        const t = dayTarget(it, day);
        if (it.kind === 'goal') { const got = goalDone(it, state); return got === it.total ? 'target' : got > 0 && got % 100 === 0 ? 'mark' : ''; }
        if (t && n === t) return 'target';
        if (it.kind === 'set') { const p = setPosition(it, n); return p.inStep === 0 ? (p.step === 0 ? 'round' : 'mark') : ''; }
        return it.mark && n % it.mark === 0 ? 'mark' : '';
    }

    // days in a row the target was reached, back from today (or from yesterday while today is not done yet);
    // days with no target (a Friday-only dhikr on a Tuesday) are skipped and do not break it
    function streak(state, it, today) {
        if (it.kind === 'goal') return 0;
        let n = 0, day = today;
        for (let i = 0; i < 3700; i++, day = addDays(day, -1)) {
            const t = dayTarget(it, day);
            if (!t) continue;
            if (countOn(state, day, it.id) >= t) n++;
            else if (day !== today) break;
        }
        return n;
    }

    // a big goal: counted from every day, less what was there when it was started again
    const goalDone = (it, state) => Math.max(0, totalAll(state, it.id) - (it.offset || 0));
    function goalStatus(state, it, today) {
        const done = goalDone(it, state), left = Math.max(0, it.total - done), out = { done, left, total: it.total };
        if (it.by && isIso(it.by)) {
            const days = diffDays(today, it.by) + 1; // today counts
            out.daysLeft = days;
            out.perDay = days > 0 ? Math.ceil(left / days) : null;
        }
        if (it.people > 1) out.split = splitAmong(it.total, it.people);
        return out;
    }
    // exact share of a total between people: some do one more so it adds up
    function splitAmong(total, people) {
        const base = Math.floor(total / people), extra = total - base * people;
        return { base, extra, people };
    }

    // counts per item over the last n days, today included
    function lastDays(state, today, n) {
        const days = [];
        for (let i = 0; i < n; i++) days.push(addDays(today, -i));
        return days;
    }
    function sumDays(state, id, days) { return days.reduce((a, d) => a + countOn(state, d, id), 0); }
    function metDays(state, it, days) {
        let met = 0, of = 0;
        days.forEach(d => { const t = dayTarget(it, d); if (t) { of++; if (countOn(state, d, it.id) >= t) met++; } });
        return { met, of };
    }

    // plain words for one item today, used on the page, in its box and in the shared summary
    function todayLine(state, it, today) {
        const n = countOn(state, today, it.id);
        if (it.kind === 'goal') {
            const g = goalStatus(state, it, today);
            return g.left === 0 ? fmt(g.done) + ' of ' + fmt(g.total) + ': goal reached' : fmt(g.done) + ' of ' + fmt(g.total) + ', ' + fmt(g.left) + ' to go';
        }
        if (it.kind === 'set') {
            const p = setPosition(it, n);
            if (p.rounds > it.rounds) return plural(p.rounds, 'round', 'rounds') + ' done today (target ' + it.rounds + ')';
            return p.rounds + ' of ' + plural(it.rounds, 'round', 'rounds') + ' done today' + (p.rounds === it.rounds ? '' : ', ' + (it.rounds - p.rounds) + ' to go');
        }
        const t = dayTarget(it, today);
        if (!t) return fmt(n) + ' today (no target on ' + LONG_DAYS[dow(today)] + 's)';
        return n >= t ? fmt(n) + ' of ' + fmt(t) + ' today: done' : fmt(n) + ' of ' + fmt(t) + ' today, ' + fmt(t - n) + ' to go';
    }
    // a count of a set in plain words: "245 (2 rounds)"
    function countText(it, n) { return it.kind === 'set' ? fmt(n) + ' (' + plural(Math.floor(n / roundSize(it)), 'round', 'rounds') + ')' : fmt(n); }
    function daysText(it) {
        if (it.kind !== 'daily' || !it.days) return '';
        if (it.days.length === 1) return 'on ' + LONG_DAYS[it.days[0]] + 's';
        return 'on ' + it.days.slice().sort().map(d => DAYS[d]).join(', ');
    }

    function summary(state, today) {
        const lines = ['My dhikr, ' + fmtDateY(today) + ':'];
        state.items.forEach(it => {
            let l = '- ' + it.name + ': ' + todayLine(state, it, today);
            const s = streak(state, it, today);
            if (s > 1) l += ' (' + s + ' days in a row)';
            if (it.kind === 'goal') {
                const g = goalStatus(state, it, today);
                if (g.split) l += '. Shared by ' + g.split.people + ': ' + splitText(g.split);
                if (g.perDay && g.left) l += '. ' + fmt(g.perDay) + ' a day to finish by ' + fmtDate(it.by);
            }
            lines.push(l);
        });
        const week = lastDays(state, today, 7);
        lines.push('', 'Last 7 days:');
        state.items.forEach(it => lines.push('- ' + it.name + ': ' + countText(it, sumDays(state, it.id, week))));
        return lines.join('\n');
    }
    function splitText(sp) {
        if (!sp.extra) return fmt(sp.base) + ' each';
        return plural(sp.extra, 'person does', 'people do') + ' ' + fmt(sp.base + 1) + ' and ' + plural(sp.people - sp.extra, 'person does', 'people do') + ' ' + fmt(sp.base);
    }

    // ---------- reading saved or restored data ----------
    const isInt = (n, lo, hi) => Number.isInteger(n) && n >= lo && n <= hi;
    function cleanItem(x) {
        if (!x || typeof x !== 'object' || !isInt(x.id, 1, 1e9)) return null;
        const name = cleanText(x.name, LIMITS.name), arabic = cleanText(x.arabic, LIMITS.arabic);
        if (x.kind === 'daily') {
            if (!name || !isInt(x.target, 1, LIMITS.target)) return null;
            const days = Array.isArray(x.days) ? [...new Set(x.days.filter(d => isInt(d, 0, 6)))].sort() : null;
            return { id: x.id, kind: 'daily', name, arabic, target: x.target, days: days && days.length && days.length < 7 ? days : null, mark: [0, 33, 100].includes(x.mark) ? x.mark : 100 };
        }
        if (x.kind === 'set') {
            if (!name || !Array.isArray(x.steps) || !x.steps.length || x.steps.length > LIMITS.steps || !isInt(x.rounds, 1, LIMITS.rounds)) return null;
            const steps = x.steps.map(s => s && { name: cleanText(s.name, LIMITS.name), arabic: cleanText(s.arabic, LIMITS.arabic), count: s.count }).filter(s => s && s.name && isInt(s.count, 1, LIMITS.stepCount));
            if (steps.length !== x.steps.length) return null;
            return { id: x.id, kind: 'set', name, steps, rounds: x.rounds };
        }
        if (x.kind === 'goal') {
            if (!name || !isInt(x.total, 1, LIMITS.goal)) return null;
            return { id: x.id, kind: 'goal', name, arabic, total: x.total, by: isIso(x.by) ? x.by : '', people: isInt(x.people, 2, LIMITS.people) ? x.people : 0, offset: isInt(x.offset, 0, 1e12) ? x.offset : 0 };
        }
        return null;
    }
    // returns a clean state, or null when the data is not this app's
    function load(raw) {
        let x = raw;
        if (typeof raw === 'string') { try { x = JSON.parse(raw); } catch (e) { return null; } }
        if (!x || typeof x !== 'object' || x.v !== 1 || !Array.isArray(x.items)) return null;
        const items = [], seen = new Set();
        x.items.slice(0, LIMITS.items).forEach(i => { const c = cleanItem(i); if (c && !seen.has(c.id)) { seen.add(c.id); items.push(c); } });
        const log = {};
        if (x.log && typeof x.log === 'object') {
            Object.keys(x.log).forEach(d => {
                if (!isIso(d) || !x.log[d] || typeof x.log[d] !== 'object') return;
                const day = {};
                Object.keys(x.log[d]).forEach(k => { const n = x.log[d][k]; if (seen.has(Number(k)) && isInt(n, 1, LIMITS.count)) day[Number(k)] = n; });
                if (Object.keys(day).length) log[d] = day;
            });
        }
        const s = x.settings || {};
        const maxId = items.reduce((a, i) => Math.max(a, i.id), 0);
        return {
            v: 1, items, log,
            nextId: isInt(x.nextId, maxId + 1, 1e9) ? x.nextId : maxId + 1,
            active: items.some(i => i.id === x.active) ? x.active : (items[0] ? items[0].id : 0),
            settings: { dayStart: isInt(s.dayStart, 0, 6) ? s.dayStart : 0, vibrate: ['marks', 'every', 'off'].includes(s.vibrate) ? s.vibrate : 'marks' }
        };
    }

    const api = { DAYS, LONG_DAYS, LIMITS, PHRASES, phrase, isIso, addDays, diffDays, dow, fmtDate, fmtDateY, dayKey, fmt, plural, readInt, cleanText,
        newDaily, newSet, newGoal, fatimahSteps, starter, countOn, setCount, addCount, totalAll, roundSize, hasTarget, setPosition, dayTarget, buzzAfter,
        streak, goalDone, goalStatus, splitAmong, splitText, lastDays, sumDays, metDays, todayLine, countText, daysText, summary, cleanItem, load };
    if (typeof module === 'object' && module.exports) module.exports = api; else root.TasbeehCore = api;
})(this);
