// Logic for Baby Feeding and Nappy Tracker, kept apart from the page so it can be tested (tests.js).
// Times are stored as milliseconds (UTC); days are the phone's own local calendar days.
(function (root) {
    const MIN = 60000, HOUR = 60 * MIN, DAY = 24 * HOUR;
    const OZ = 29.5735;                     // 1 US fluid ounce in ml (baby bottles are marked in US oz)
    const LIMIT = { ml: 1000, oz: 34 };     // a bottle bigger than this is a typing mistake
    const MAX_BABIES = 4, MAX_ENTRIES = 20000;
    const TYPES = ['breast', 'bottle', 'nappy', 'sleep'];

    // ---- numbers typed by a tired person: "120", "4.5", "4,5" (comma decimals)
    function parseAmount(text, unit) {
        const s = String(text == null ? '' : text).trim().replace(/\s+/g, '');
        if (!s) return { error: 'Type how much the baby drank.' };
        if (!/^\d{1,4}([.,]\d{0,2})?$/.test(s) && !/^[.,]\d{1,2}$/.test(s)) return { error: 'Type a number, for example ' + (unit === 'oz' ? '4 or 4.5' : '120') + '.' };
        const n = Number(s.replace(',', '.'));
        if (!(n > 0)) return { error: 'The amount must be more than 0.' };
        if (n > LIMIT[unit]) return { error: 'That is more than ' + LIMIT[unit] + ' ' + unit + '. Check the number.' };
        return { value: Math.round(n * 100) / 100 };
    }
    function parseMinutes(text) {
        const s = String(text == null ? '' : text).trim();
        if (!s) return { value: 0 };
        if (!/^\d{1,3}$/.test(s)) return { error: 'Type whole minutes, for example 12.' };
        const n = Number(s);
        if (n > 180) return { error: 'One side can be at most 180 minutes.' };
        return { value: n };
    }
    const toMl = (amount, unit) => unit === 'oz' ? amount * OZ : amount;
    // an amount shown in the chosen unit: ml as a whole number, oz with one decimal
    function fmtAmount(ml, unit) {
        if (unit === 'oz') return (Math.round(ml / OZ * 10) / 10).toFixed(1) + ' oz';
        return Math.round(ml) + ' ml';
    }
    // ounces as typed: 4 -> 4.0, 4.5 -> 4.5, 4.25 -> 4.25
    const ozText = n => { const t = (Math.round(n * 100) / 100).toFixed(2); return t.endsWith('0') ? t.slice(0, -1) : t; };
    // total of bottles in the shown unit (90 + 60.5 = 150.5 ml); adds the typed numbers directly when they are all in that unit
    function sumBottles(list, unit) {
        if (list.every(e => e.unit === unit)) {
            const hundredths = list.reduce((s, e) => s + Math.round(e.amount * 100), 0);
            return unit === 'oz' ? ozText(hundredths / 100) + ' oz' : String(hundredths / 100) + ' ml';
        }
        return fmtAmount(list.reduce((s, e) => s + toMl(e.amount, e.unit), 0), unit);
    }

    // ---- durations in plain words
    function fmtDur(ms) {
        const m = Math.floor(Math.max(0, ms) / MIN);
        if (m < 1) return 'under 1 min';
        const h = Math.floor(m / 60), r = m % 60;
        return h ? h + ' h' + (r ? ' ' + r + ' min' : '') : r + ' min';
    }
    // seconds of feeding rounded to whole minutes; a short burst is "under 1 min", never "0 min"
    function fmtSecs(sec) {
        if (sec <= 0) return '0 min';
        if (sec < 30) return 'under 1 min';
        const m = Math.round(sec / 60), h = Math.floor(m / 60), r = m % 60;
        return h ? h + ' h' + (r ? ' ' + r + ' min' : '') : r + ' min';
    }
    // a running clock: 4:05 or 1:04:05
    function clock(ms) {
        const s = Math.floor(Math.max(0, ms) / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
        const p = n => String(n).padStart(2, '0');
        return h ? h + ':' + p(m) + ':' + p(x) : m + ':' + p(x);
    }

    // ---- calendar days on this phone (DST-safe: built from y/m/d, not by adding 24 h)
    const pad = n => String(n).padStart(2, '0');
    function dayKey(ms) { const d = new Date(ms); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
    function dayStart(key) { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d).getTime(); }
    function addDays(key, n) { const [y, m, d] = key.split('-').map(Number); return dayKey(new Date(y, m - 1, d + n, 12).getTime()); }
    const isDay = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && dayKey(dayStart(s)) === s;

    // ---- the breast-feed timer: segments of feeding on one side; Pause closes the open one
    function startFeed(side, now) { return { start: now, segs: [{ side, from: now, to: null }] }; }
    function openSeg(feed) { const s = feed.segs[feed.segs.length - 1]; return s && s.to == null ? s : null; }
    function switchSide(feed, side, now) {
        const o = openSeg(feed);
        if (o && o.side === side) return feed;
        if (o) o.to = now;
        feed.segs.push({ side, from: now, to: null });
        return feed;
    }
    function pauseFeed(feed, now) { const o = openSeg(feed); if (o) o.to = now; return feed; }
    function sideSecs(feed, now) {
        const t = { L: 0, R: 0 };
        feed.segs.forEach(s => { t[s.side] += Math.max(0, ((s.to == null ? now : s.to) - s.from)) / 1000; });
        return { L: Math.round(t.L), R: Math.round(t.R) };
    }
    // stopping the timer gives a finished feed entry
    function finishFeed(feed, now, id) {
        const secs = sideSecs(feed, now), used = feed.segs.filter(s => ((s.to == null ? now : s.to) - s.from) >= 1000);
        const first = (used[0] || feed.segs[0]).side, last = (used[used.length - 1] || feed.segs[feed.segs.length - 1]).side;
        const o = openSeg(feed), end = o ? now : Math.max(...feed.segs.map(s => s.to));
        return { id, t: 'breast', start: feed.start, end: Math.max(end, feed.start), left: secs.L, right: secs.R, first, last, note: '' };
    }

    // which breast to offer next: after both sides, the side the baby finished on (it was emptied less);
    // after one side only, the other side
    function nextSide(entries) {
        const b = entries.filter(e => e.t === 'breast').sort((a, z) => z.start - a.start)[0];
        if (!b) return null;
        const both = b.left > 0 && b.right > 0;
        const side = both ? b.last : (b.left > 0 ? 'R' : b.right > 0 ? 'L' : (b.first === 'L' ? 'R' : 'L'));
        return { side, both, from: b };
    }
    const sideName = s => s === 'L' ? 'Left' : 'Right';

    // ---- totals over a window [from, to): feeds and nappies count when they start inside it;
    // sleep counts only the part inside it (a night's sleep is split at midnight)
    function totals(entries, from, to, unit, running) {
        const inWin = e => e.start >= from && e.start < to;
        const feeds = entries.filter(e => (e.t === 'breast' || e.t === 'bottle') && inWin(e)).sort((a, z) => a.start - z.start);
        const breast = feeds.filter(e => e.t === 'breast'), bottles = feeds.filter(e => e.t === 'bottle');
        const nappies = entries.filter(e => e.t === 'nappy' && inWin(e));
        let sleep = 0;
        const sleeps = entries.filter(e => e.t === 'sleep').map(e => [e.start, e.end]);
        if (running && running.sleep) sleeps.push([running.sleep.start, running.now]);
        sleeps.forEach(([a, b]) => { sleep += Math.max(0, Math.min(b, to) - Math.max(a, from)); });
        let runningFeed = 0;
        if (running && running.feed && running.feed.start >= from && running.feed.start < to) runningFeed = 1;
        const gaps = [];
        for (let i = 1; i < feeds.length; i++) gaps.push(feeds[i].start - feeds[i - 1].start);
        return {
            feeds: feeds.length + runningFeed,
            breast: breast.length,
            breastSecs: breast.reduce((s, e) => s + e.left + e.right, 0),
            bottles: bottles.length,
            bottleText: bottles.length ? sumBottles(bottles, unit) : '',
            wet: nappies.filter(e => e.wet).length,
            dirty: nappies.filter(e => e.dirty).length,
            nappies: nappies.length,
            sleep,
            avgGap: gaps.length ? Math.round(gaps.reduce((s, g) => s + g, 0) / gaps.length) : 0
        };
    }

    // ---- checking an entry typed or restored; returns the clean entry or an error sentence
    const num = (v, lo, hi) => typeof v === 'number' && isFinite(v) && v >= lo && v <= hi;
    const T0 = Date.UTC(2000, 0, 1);
    function checkEntry(e, now) {
        if (!e || typeof e !== 'object' || !TYPES.includes(e.t)) return { error: 'Unknown entry.' };
        if (!num(e.start, T0, now + 2 * MIN)) return { error: 'The time cannot be in the future.' };
        const out = { id: typeof e.id === 'string' && e.id ? e.id.slice(0, 40) : 'e' + Math.random().toString(36).slice(2, 10), t: e.t, start: Math.round(e.start),
            note: typeof e.note === 'string' ? e.note.slice(0, 200) : '' };
        if (e.t === 'breast') {
            if (!num(e.left, 0, 3 * 3600) || !num(e.right, 0, 3 * 3600)) return { error: 'Type the minutes on each side (0 to 180).' };
            if (e.left + e.right <= 0) return { error: 'Type the minutes on at least one side.' };
            out.left = Math.round(e.left); out.right = Math.round(e.right);
            out.first = e.first === 'R' ? 'R' : 'L';
            out.last = e.last === 'L' || e.last === 'R' ? e.last : (out.left && out.right ? (out.first === 'L' ? 'R' : 'L') : (out.left ? 'L' : 'R'));
            if (!out.left || !out.right) out.first = out.last = out.left ? 'L' : 'R';
            out.end = num(e.end, out.start, out.start + 6 * HOUR) ? Math.round(e.end) : out.start + (out.left + out.right) * 1000;
        } else if (e.t === 'bottle') {
            const unit = e.unit === 'oz' ? 'oz' : 'ml';
            if (!num(e.amount, 0.01, LIMIT[unit])) return { error: 'The amount must be more than 0 and at most ' + LIMIT[unit] + ' ' + unit + '.' };
            out.amount = Math.round(e.amount * 100) / 100; out.unit = unit;
            out.milk = e.milk === 'formula' || e.milk === 'breast' ? e.milk : '';
        } else if (e.t === 'nappy') {
            if (!e.wet && !e.dirty) return { error: 'Choose wet, dirty or both.' };
            out.wet = !!e.wet; out.dirty = !!e.dirty;
        } else {
            if (!num(e.end, T0, now + 2 * MIN)) return { error: 'The wake-up time cannot be in the future.' };
            if (e.end <= e.start) return { error: 'The wake-up time must be after the time the baby fell asleep.' };
            if (e.end - e.start > DAY) return { error: 'A sleep longer than 24 hours is probably a typing mistake. Check the times.' };
            out.end = Math.round(e.end);
        }
        return { entry: out };
    }

    function newBaby(id, name) { return { id, name: name || 'Baby', entries: [], feed: null, sleep: null }; }
    function cleanFeed(f, now) {
        if (!f || !num(f.start, T0, now + 2 * MIN) || !Array.isArray(f.segs) || !f.segs.length || f.segs.length > 500) return null;
        const segs = [];
        for (let i = 0; i < f.segs.length; i++) {
            const s = f.segs[i], last = i === f.segs.length - 1;
            if (!s || (s.side !== 'L' && s.side !== 'R') || !num(s.from, T0, now + 2 * MIN)) return null;
            if (s.to == null) { if (!last) return null; segs.push({ side: s.side, from: s.from, to: null }); }
            else if (num(s.to, s.from, now + 2 * MIN)) segs.push({ side: s.side, from: s.from, to: s.to });
            else return null;
        }
        return { start: f.start, segs };
    }
    // any saved or restored state is rebuilt from scratch; anything odd is dropped, never trusted
    function clean(raw, now) {
        const st = { v: 1, unit: 'ml', babies: [], current: '' };
        if (!raw || typeof raw !== 'object') { st.babies.push(newBaby('b1', 'Baby')); st.current = 'b1'; return st; }
        st.unit = raw.unit === 'oz' ? 'oz' : 'ml';
        (Array.isArray(raw.babies) ? raw.babies : []).slice(0, MAX_BABIES).forEach((b, i) => {
            if (!b || typeof b !== 'object') return;
            let id = typeof b.id === 'string' && /^[\w-]{1,40}$/.test(b.id) ? b.id : 'b' + (i + 1);
            if (st.babies.some(x => x.id === id)) id = id + '-' + i;
            const name = typeof b.name === 'string' && b.name.trim() ? b.name.trim().slice(0, 30) : 'Baby';
            const baby = newBaby(id, name), seen = new Set();
            (Array.isArray(b.entries) ? b.entries : []).slice(-MAX_ENTRIES).forEach(e => {
                const c = checkEntry(e, now);
                if (c.entry && !seen.has(c.entry.id)) { seen.add(c.entry.id); baby.entries.push(c.entry); }
            });
            baby.entries.sort((a, z) => a.start - z.start);
            baby.feed = cleanFeed(b.feed, now);
            baby.sleep = b.sleep && num(b.sleep.start, T0, now + 2 * MIN) ? { start: b.sleep.start } : null;
            st.babies.push(baby);
        });
        if (!st.babies.length) st.babies.push(newBaby('b1', 'Baby'));
        st.current = st.babies.some(b => b.id === raw.current) ? raw.current : st.babies[0].id;
        return st;
    }

    // one line per entry, used on screen, in copy/email and in print
    function describe(e, unit) {
        if (e.t === 'breast') {
            const parts = [];
            const L = e.left > 0 ? 'Left ' + fmtSecs(e.left) : '', R = e.right > 0 ? 'Right ' + fmtSecs(e.right) : '';
            if (L && R) parts.push(e.first === 'L' ? L + ', then ' + R : R + ', then ' + L); else parts.push(L || R);
            return { title: 'Breast feed', detail: parts.join('') + (L && R ? ' (' + fmtSecs(e.left + e.right) + ')' : '') };
        }
        if (e.t === 'bottle') {
            const typed = e.unit === 'oz' ? ozText(e.amount) + ' oz' : e.amount + ' ml';
            const amt = e.unit === unit ? typed : fmtAmount(toMl(e.amount, e.unit), unit) + ' (' + typed + ')';
            return { title: 'Bottle', detail: amt + (e.milk === 'formula' ? ', formula' : e.milk === 'breast' ? ', breast milk' : '') };
        }
        if (e.t === 'nappy') return { title: 'Nappy', detail: e.wet && e.dirty ? 'Wet and dirty' : e.wet ? 'Wet' : 'Dirty' };
        return { title: 'Sleep', detail: fmtDur(e.end - e.start) };
    }

    const api = { MIN, HOUR, DAY, OZ, LIMIT, MAX_BABIES, parseAmount, parseMinutes, toMl, fmtAmount, ozText, sumBottles, fmtDur, fmtSecs, clock,
        dayKey, dayStart, addDays, isDay, startFeed, openSeg, switchSide, pauseFeed, sideSecs, finishFeed, nextSide, sideName,
        totals, checkEntry, newBaby, clean, describe };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.BabyCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
