// Spaced Repetition Flashcards for Exams: the scheduling and text maths, with no page code. Works in the browser (window.CardCore) and in node (require).
// A study day is a whole day number. A new day starts at 4 am, so late-night study still counts for the evening before.
(function (root) {
    'use strict';
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const LIMITS = { text: 1000, name: 60, decks: 100, cards: 5000, newMax: 999, ivlMax: 3650, easeMin: 1300, easeMax: 4000, easeStart: 2500, known: 7, dayStartHour: 4 };
    const NEW_PRESETS = [0, 5, 10, 20, 30, 50, 100];

    // ---- days
    const dayOfDate = d => { const s = new Date(d.getTime() - LIMITS.dayStartHour * 36e5); return Math.round(Date.UTC(s.getFullYear(), s.getMonth(), s.getDate()) / 864e5); };
    const isoOf = n => new Date(n * 864e5).toISOString().slice(0, 10);
    function dayOfISO(s) {
        if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
        const [y, m, d] = s.split('-').map(Number);
        if (y < 2000 || y > 2200 || m < 1 || m > 12 || d < 1 || d > new Date(Date.UTC(y, m, 0)).getUTCDate()) return null;
        return Math.round(Date.UTC(y, m - 1, d) / 864e5);
    }
    function fmtDay(n, opt = {}) {
        const d = new Date(n * 864e5);
        return (opt.day === false ? '' : DAYS[d.getUTCDay()] + ' ') + d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()] + (opt.year ? ' ' + d.getUTCFullYear() : '');
    }
    const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
    function fmtIvl(days) {
        if (days <= 0) return 'today';
        if (days < 30) return plural(days, 'day');
        if (days < 365) { const m = Math.round(days / 30.4); return plural(m, 'month'); }
        const y = Math.round(days / 36.5) / 10; return y + (y === 1 ? ' year' : ' years');
    }
    function whenDue(due, today) {
        const k = due - today;
        if (k <= 0) return 'Due today';
        if (k === 1) return 'Due tomorrow';
        return 'Due in ' + fmtIvl(k) + ' (' + fmtDay(due) + ')';
    }

    // ---- scheduling (a simple SM-2, the method Anki started from)
    const newSched = () => ({ reps: 0, ivl: 0, due: 0, ease: LIMITS.easeStart, lapses: 0 });
    const isNew = s => s.reps === 0;
    // grade: 1 Again, 2 Hard, 3 Good, 4 Easy. Returns the new schedule and, for cards still being learnt today, how far back in the queue they go.
    function answer(s, grade, today, exam) {
        const n = Object.assign({}, s); n.reps = s.reps + 1;
        let requeue = 0;
        if (s.ivl === 0) {               // new, or forgotten and being learnt again
            if (grade === 1) { n.ivl = 0; requeue = 3; }
            else if (grade === 2) { n.ivl = 0; requeue = 6; }
            else n.ivl = grade === 3 ? 1 : 4;
        } else {
            const e = s.ease / 1000;
            if (grade === 1) { n.ivl = 0; n.lapses = s.lapses + 1; n.ease = Math.max(LIMITS.easeMin, s.ease - 200); requeue = 3; }
            else {
                const hard = Math.max(s.ivl + 1, Math.round(s.ivl * 1.2));
                const good = Math.max(hard + 1, Math.round(s.ivl * e));
                const easy = Math.max(good + 1, Math.round(s.ivl * e * 1.3));
                n.ivl = grade === 2 ? hard : grade === 3 ? good : easy;
                if (grade === 2) n.ease = Math.max(LIMITS.easeMin, s.ease - 150);
                if (grade === 4) n.ease = Math.min(LIMITS.easeMax, s.ease + 150);
            }
        }
        n.ivl = Math.min(n.ivl, LIMITS.ivlMax);
        // before an exam, every card comes back by the day before it (but never sooner than tomorrow)
        if (n.ivl > 0 && exam != null && exam > today) {
            const cap = Math.max(1, exam - 1 - today);
            if (n.ivl > cap) n.ivl = cap;
        }
        n.due = today + n.ivl;
        return { s: n, requeue };
    }
    // What each button will do, for the labels under them
    function preview(s, today, exam) {
        return [1, 2, 3, 4].map(g => { const r = answer(s, g, today, exam); return r.requeue ? (g === 1 ? 'again soon' : 'later today') : fmtIvl(r.s.ivl); });
    }

    // ---- items: each card is asked front to back, and also back to front if the deck says so
    function items(deck) {
        const out = [];
        deck.cards.forEach(c => { out.push({ deck, card: c, dir: 'f', s: c.s }); if (deck.reverse) out.push({ deck, card: c, dir: 'r', s: c.r || newSched() }); });
        return out;
    }
    const newLeft = (deck, today) => Math.max(0, deck.newPerDay + (deck.newDay === today ? deck.extra - deck.newCount : 0));
    // The study queue: cards due (most overdue first), then new cards in the order they were added. Only one side of a card per session.
    function deckQueue(deck, today) {
        const used = new Set(), its = items(deck), due = [], fresh = [];
        its.filter(i => !isNew(i.s) && i.s.due <= today).sort((a, b) => a.s.due - b.s.due).forEach(i => { if (!used.has(i.card.id)) { used.add(i.card.id); due.push(i); } });
        let k = newLeft(deck, today);
        its.filter(i => isNew(i.s)).forEach(i => { if (k > 0 && !used.has(i.card.id)) { used.add(i.card.id); fresh.push(i); k--; } });
        return { due, fresh };
    }
    function deckCounts(deck, today) {
        const all = items(deck), q = deckQueue(deck, today);
        const fresh = all.filter(i => isNew(i.s)), seen = all.filter(i => !isNew(i.s));
        const due = q.due.length, newToday = q.fresh.length;
        return { items: all.length, cards: deck.cards.length, due, newToday, total: due + newToday, newLeft: fresh.length,
            learning: seen.filter(i => i.s.ivl < LIMITS.known).length, known: seen.filter(i => i.s.ivl >= LIMITS.known).length,
            tomorrow: seen.filter(i => i.s.due === today + 1).length, week: seen.filter(i => i.s.due > today && i.s.due <= today + 7).length };
    }
    function buildQueue(decks, today) {
        const due = [], fresh = [];
        decks.forEach(deck => { const q = deckQueue(deck, today); due.push(...q.due); fresh.push(...q.fresh); });
        due.sort((a, b) => a.s.due - b.s.due);
        return due.concat(fresh).map(i => ({ deck: i.deck.id, card: i.card.id, dir: i.dir }));
    }
    // When will every new card have been started, and does that fit before the exam?
    function plan(deck, today) {
        const c = deckCounts(deck, today), left = c.newLeft, per = deck.newPerDay;
        const out = { left, per, finish: null, fits: true, need: 0, examIn: deck.exam != null ? deck.exam - today : null };
        if (left === 0) return out;
        const todayCan = c.newToday;
        if (left <= todayCan) out.finish = today;
        else if (per > 0) out.finish = today + Math.ceil((left - todayCan) / per);
        if (deck.exam != null && deck.exam > today) {
            if (out.finish == null || out.finish >= deck.exam) { out.fits = false; out.need = Math.ceil(left / (deck.exam - today)); }
        }
        return out;
    }
    function streak(log, today) {
        let d = log[today] ? today : today - 1, n = 0;
        while (log[d]) { n++; d--; }
        return { days: n, today: !!log[today] };
    }

    // ---- reading pasted text: one card per line, "front - back"
    const SEPS = { tab: '\t', dash: ' - ', eq: ' = ', semi: ';', colon: ':', comma: ',' };
    function csvSplit(line) {
        const out = []; let cur = '', q = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
            else if (ch === '"' && cur.trim() === '') { q = true; cur = ''; }
            else if (ch === ',') { out.push(cur); cur = ''; }
            else cur += ch;
        }
        out.push(cur); return out;
    }
    function splitLine(line, sep) {
        if (sep === 'auto') {
            if (line.includes('\t')) sep = 'tab';
            else if (/\s[-–—]\s/.test(line)) sep = 'dash';
            else if (line.includes(' = ')) sep = 'eq';
            else if (/^\s*"/.test(line) && line.includes(',')) sep = 'csv';
            else if (line.includes(';')) sep = 'semi';
            else if (line.includes(':')) sep = 'colon';
            else if (line.includes(',')) sep = 'comma';
            else return null;
        }
        let i, len;
        if (sep === 'csv' || (sep === 'comma' && /^\s*"/.test(line))) { const p = csvSplit(line); return p.length < 2 ? null : [p[0], p.slice(1).join(', ')]; }
        if (sep === 'dash') { const m = /\s[-–—]\s/.exec(line); if (!m) return null; i = m.index; len = m[0].length; }
        else { const t = SEPS[sep]; i = line.indexOf(t); len = t.length; if (i < 0) return null; }
        return [line.slice(0, i), line.slice(i + len)];
    }
    const clean = s => String(s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
    const keyOf = (f, b) => clean(f).toLowerCase() + '\u0001' + clean(b).toLowerCase();
    // existing: cards already in the deck. Returns the cards to add and what was skipped, with line numbers.
    function parsePaste(text, sep, existing = []) {
        const have = new Set(existing.map(c => keyOf(c.f, c.b)));
        const cards = [], noSep = [], empty = [], dup = [], tooLong = [];
        String(text || '').replace(/\r\n?/g, '\n').split('\n').forEach((raw, idx) => {
            if (!raw.trim()) return;
            const line = idx + 1, p = splitLine(raw, sep);
            if (!p) return noSep.push({ line, text: clean(raw) });
            const f = clean(p[0]), b = clean(p[1]);
            if (!f || !b) return empty.push({ line, text: clean(raw) });
            if (f.length > LIMITS.text || b.length > LIMITS.text) return tooLong.push({ line, text: f.slice(0, 40) });
            const k = keyOf(f, b);
            if (have.has(k)) return dup.push({ line, text: f });
            have.add(k); cards.push({ f, b });
        });
        return { cards, noSep, empty, dup, tooLong };
    }
    const guard = s => /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
    const csvCell = s => '"' + guard(s).replace(/"/g, '""') + '"';
    const toCSV = deck => 'Front,Back\r\n' + deck.cards.map(c => csvCell(c.f) + ',' + csvCell(c.b)).join('\r\n') + '\r\n';
    const toText = deck => deck.cards.map(c => c.f.replace(/\t/g, ' ') + '\t' + c.b.replace(/\t/g, ' ')).join('\n');

    // ---- saved data: every value is checked, anything broken is dropped or set to a safe default
    const int = (v, lo, hi, d) => Number.isInteger(v) && v >= lo && v <= hi ? v : d;
    function normSched(s) {
        if (!s || typeof s !== 'object') return newSched();
        return { reps: int(s.reps, 0, 1e6, 0), ivl: int(s.ivl, 0, LIMITS.ivlMax, 0), due: int(s.due, 0, 200000, 0), ease: int(s.ease, LIMITS.easeMin, LIMITS.easeMax, LIMITS.easeStart), lapses: int(s.lapses, 0, 1e6, 0) };
    }
    function normalize(raw) {
        const st = { v: 1, decks: [], log: {}, seq: 1 };
        if (!raw || typeof raw !== 'object' || !Array.isArray(raw.decks)) return st;
        const ids = new Set();
        let seq = int(raw.seq, 1, 1e9, 1);
        const id = v => { let x = typeof v === 'string' && /^[a-z0-9]{1,12}$/.test(v) && !ids.has(v) ? v : null; if (!x) { do { x = 'k' + (seq++).toString(36); } while (ids.has(x)); } ids.add(x); return x; };
        let total = 0;
        raw.decks.slice(0, LIMITS.decks).forEach(d => {
            if (!d || typeof d !== 'object') return;
            const name = clean(d.name || '').slice(0, LIMITS.name) || 'My deck';
            const deck = { id: id(d.id), name, newPerDay: int(d.newPerDay, 0, LIMITS.newMax, 20), reverse: d.reverse === true,
                exam: typeof d.exam === 'number' ? int(d.exam, 10000, 200000, null) : null,
                newDay: int(d.newDay, 0, 200000, 0), newCount: int(d.newCount, 0, 1e6, 0), extra: int(d.extra, 0, 1e6, 0), cards: [] };
            (Array.isArray(d.cards) ? d.cards : []).forEach(c => {
                if (!c || typeof c !== 'object' || total >= LIMITS.cards) return;
                const f = clean(c.f || '').slice(0, LIMITS.text), b = clean(c.b || '').slice(0, LIMITS.text);
                if (!f || !b) return;
                deck.cards.push({ id: id(c.id), f, b, s: normSched(c.s), r: c.r ? normSched(c.r) : null }); total++;
            });
            st.decks.push(deck);
        });
        if (raw.log && typeof raw.log === 'object') Object.keys(raw.log).forEach(k => { const n = int(+k, 10000, 200000, null), v = int(raw.log[k], 1, 1e6, null); if (n != null && v != null) st.log[n] = v; });
        st.seq = seq;
        return st;
    }
    function newId(st) { const used = new Set(); st.decks.forEach(d => { used.add(d.id); d.cards.forEach(c => used.add(c.id)); }); let x; do { x = 'k' + (st.seq++).toString(36); } while (used.has(x)); return x; }

    const api = { LIMITS, NEW_PRESETS, dayOfDate, dayOfISO, isoOf, fmtDay, fmtIvl, whenDue, plural, newSched, isNew, answer, preview, items, newLeft, deckCounts,
        buildQueue, plan, streak, splitLine, csvSplit, parsePaste, clean, keyOf, toCSV, toText, normalize, newId };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CardCore = api;
})(this);
