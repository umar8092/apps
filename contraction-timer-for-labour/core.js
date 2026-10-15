// Contraction Timer for Labour: the timing maths, with no page code, so tests.js can check it in node.
// Every time is a whole number of milliseconds since 1970 (Date.now()); every length shown is whole seconds.
(function (root) {
    'use strict';
    const SEC = 1000, MIN = 60 * SEC;
    const MIN_LEN = 5, MAX_LEN = 10 * 60;          // a saved contraction lasts 5 seconds to 10 minutes
    const PRESETS = {
        '511': { apart: 5 * 60, last: 60, hold: 60, label: '5-1-1' },
        '411': { apart: 4 * 60, last: 60, hold: 60, label: '4-1-1' },
        '311': { apart: 3 * 60, last: 60, hold: 60, label: '3-1-1' }
    };
    const LIMITS = { apart: [60, 15 * 60], last: [20, 3 * 60], hold: [10, 4 * 60] };   // apart and last in seconds, hold in minutes
    const KINDS = { waters: 'Waters broke', bleeding: 'Bleeding', called: 'Called midwife or hospital', left: 'Left for hospital', other: 'Note' };
    const STRENGTHS = { mild: 'Mild', medium: 'Medium', strong: 'Strong' };

    // 65 -> "1:05", 3725 -> "1:02:05"
    function fmtLen(sec) {
        sec = Math.max(0, Math.round(sec));
        const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
        return h ? h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0') : m + ':' + String(s).padStart(2, '0');
    }
    // 65 -> "1 min 5 sec", 3720 -> "1 h 2 min", 45 -> "45 sec"
    function fmtWords(sec) {
        sec = Math.max(0, Math.round(sec));
        const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
        if (h) return h + ' h' + (m ? ' ' + m + ' min' : '');
        if (m) return m + ' min' + (s ? ' ' + s + ' sec' : '');
        return s + ' sec';
    }
    // "1:05", "65", "65s", "1m 5s", "1 min 5 sec", "2 min", "1.5 min" -> seconds; null if it cannot be read.
    // A plain number is seconds, because contractions are measured in seconds (30 to 90 is usual).
    function parseLen(text) {
        const t = String(text == null ? '' : text).trim().toLowerCase().replace(',', '.');
        if (!t) return null;
        let m = t.match(/^(\d{1,2}):(\d{1,2})$/);
        if (m) { const s = +m[2]; return s < 60 ? +m[1] * 60 + s : null; }
        m = t.match(/^(\d+(?:\.\d+)?)\s*(s|sec|secs|second|seconds)?$/);
        if (m) return Math.round(+m[1]);
        m = t.match(/^(\d+(?:\.\d+)?)\s*(m|min|mins|minute|minutes)(?:\s*(\d+)\s*(s|sec|secs|second|seconds)?)?$/);
        if (m) return Math.round(+m[1] * 60 + (m[3] ? +m[3] : 0));
        return null;
    }
    function clampInt(v, lo, hi, dflt) { v = Math.round(Number(v)); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt; }

    // The rule the person was given, e.g. 5-1-1: apart (seconds), last (seconds), hold (minutes).
    function cleanRule(r) {
        r = r && typeof r === 'object' ? r : {};
        const preset = PRESETS[r.preset] ? r.preset : r.preset === 'custom' ? 'custom' : '511';
        if (preset !== 'custom') return Object.assign({ preset }, PRESETS[preset], { label: PRESETS[preset].label });
        const out = { preset, apart: clampInt(r.apart, LIMITS.apart[0], LIMITS.apart[1], 300), last: clampInt(r.last, LIMITS.last[0], LIMITS.last[1], 60), hold: clampInt(r.hold, LIMITS.hold[0], LIMITS.hold[1], 60) };
        out.label = ruleLabel(out);
        return out;
    }
    function ruleLabel(r) { return (r.apart % 60 ? fmtLen(r.apart) : r.apart / 60) + '-' + (r.last % 60 ? fmtLen(r.last) : r.last / 60) + '-' + (r.hold % 60 ? r.hold + ' min' : r.hold / 60); }
    function ruleWords(r) { return 'contractions ' + fmtWords(r.apart) + ' apart or closer, each lasting ' + fmtWords(r.last) + ' or more, for ' + holdWords(r.hold); }
    // 60 -> "1 hour", 120 -> "2 hours", 90 -> "1 h 30 min", 45 -> "45 min"
    function holdWords(min) { return min % 60 ? fmtWords(min * 60) : min === 60 ? '1 hour' : min / 60 + ' hours'; }
    // "the last hour", "the last 2 hours", "the last 45 min"
    function lastWords(min) { return min === 60 ? 'the last hour' : 'the last ' + holdWords(min); }

    function sorted(items) { return items.slice().sort((a, b) => a.start - b.start); }
    function len(c) { return Math.round((c.end - c.start) / SEC); }

    // Adds "apart" (seconds from the start of the one before, null for the first) to each contraction, oldest first.
    function withApart(items) {
        const s = sorted(items);
        return s.map((c, i) => Object.assign({}, c, { len: len(c), apart: i ? Math.round((c.start - s[i - 1].start) / SEC) : null }));
    }

    // The stretch being timed now: walk back from the newest contraction while the gap between starts stays
    // under max(30 min, 2 x the rule's gap). Contractions timed yesterday, or before a long pause, are not part of it.
    function currentRun(list, rule) {
        if (!list.length) return [];
        const brk = Math.max(30 * 60, 2 * rule.apart);
        let i = list.length - 1;
        while (i > 0 && (list[i].start - list[i - 1].start) / SEC <= brk) i--;
        return list.slice(i);
    }

    // Answers "is it time?" at the moment `now`, using contractions that started before `now`.
    function evaluate(items, ruleIn, now) {
        const rule = cleanRule(ruleIn);
        const done = withApart(items.filter(c => c.end <= now));
        const res = { rule, total: done.length, count: 0, avgApart: null, avgLen: null, timedFor: 0, sinceLast: null, paused: false,
            okApart: false, okLen: false, okHold: false, met: false, firstMet: null, last: done[done.length - 1] || null };
        if (!done.length) return res;
        const newest = done[done.length - 1];
        res.sinceLast = Math.round((now - newest.start) / SEC);
        res.paused = (now - newest.start) / SEC > 2 * rule.apart;   // no new one for twice the rule's gap
        const run = currentRun(done, rule);
        res.timedFor = Math.round((now - run[0].start) / SEC);
        const from = now - rule.hold * MIN;
        const win = run.filter(c => c.start >= from);
        res.count = win.length;
        if (win.length) res.avgLen = Math.round(win.reduce((a, c) => a + c.len, 0) / win.length);
        const gaps = win.filter(c => c !== run[0] && c.apart != null).map(c => c.apart);
        if (gaps.length) res.avgApart = Math.round(gaps.reduce((a, g) => a + g, 0) / gaps.length);
        res.okApart = res.avgApart != null && res.avgApart <= rule.apart;
        res.okLen = res.avgLen != null && res.avgLen >= rule.last;
        res.okHold = res.timedFor >= rule.hold * 60 && run[0].start <= from;
        res.met = res.okApart && res.okLen && res.okHold && gaps.length >= 2 && !res.paused;
        return res;
    }

    // The first moment the rule was reached: checked at the end of each contraction, oldest first.
    function firstMet(items, rule) {
        const s = sorted(items);
        for (const c of s) if (evaluate(s, rule, c.end).met) return c.end;
        return null;
    }

    // Checks a new or edited contraction. Returns an error message, or '' if it is fine.
    function checkOne(items, c, now, fmtTime) {
        if (!Number.isFinite(c.start) || !Number.isFinite(c.end)) return 'Choose the time it started and how long it lasted.';
        const l = len(c);
        if (l < MIN_LEN) return 'A contraction lasts at least ' + MIN_LEN + ' seconds. Type how long it lasted, for example 1:05.';
        if (l > MAX_LEN) return 'That is longer than 10 minutes. Type how long it lasted in minutes and seconds, for example 1:05.';
        if (c.end > now + 1000) return 'That time has not happened yet. Choose an earlier time.';
        const clash = items.find(o => o.id !== c.id && o.start < c.end && c.start < o.end);
        if (clash) return 'This overlaps the contraction that started at ' + (fmtTime ? fmtTime(clash.start) : new Date(clash.start).toLocaleTimeString()) + '. Change that one or this one.';
        return '';
    }

    // "02:14" or "02:14:30" typed in a time box -> the moment with that clock time closest to `ref`
    // (the contraction's old start, or now for a new one), never later than `now`.
    function timeToMs(hhmmss, ref, now) {
        const m = String(hhmmss || '').match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
        if (!m || +m[1] > 23 || +m[2] > 59 || (m[3] && +m[3] > 59)) return NaN;
        let best = NaN;
        for (const shift of [-1, 0, 1]) {
            const d = new Date(ref); d.setDate(d.getDate() + shift); d.setHours(+m[1], +m[2], m[3] ? +m[3] : 0, 0);
            const t = d.getTime();
            if (t <= now + 1000 && (isNaN(best) || Math.abs(t - ref) < Math.abs(best - ref))) best = t;
        }
        return best;
    }

    // Plain text for the midwife, oldest first.
    function logText(items, notes, ruleIn, now, fmtTime) {
        const rule = cleanRule(ruleIn), r = evaluate(items, rule, now), ft = fmtTime || (t => new Date(t).toLocaleTimeString());
        const L = ['Contraction log (' + new Date(now).toDateString() + ')', 'My rule: ' + rule.label + ' (' + ruleWords(rule) + ')'];
        if (r.total) {
            L.push(lastWords(rule.hold).replace('the l', 'L') + ': ' + r.count + ' contraction' + (r.count === 1 ? '' : 's') +
                (r.avgApart != null ? ', on average ' + fmtLen(r.avgApart) + ' apart' : '') + (r.avgLen != null ? ', lasting ' + fmtLen(r.avgLen) : ''));
            const fm = firstMet(items, rule);
            L.push(fm ? 'Rule first reached at ' + ft(fm) : 'Rule not reached yet');
        }
        L.push('');
        const rows = withApart(items).map(c => ({ t: c.start, s: ft(c.start) + '  lasted ' + fmtLen(c.len) + (c.apart != null ? '  apart ' + fmtLen(c.apart) : '') + (STRENGTHS[c.strength] ? '  ' + STRENGTHS[c.strength].toLowerCase() : '') }))
            .concat((notes || []).map(n => ({ t: n.at, s: ft(n.at) + '  ' + (KINDS[n.kind] || 'Note').toUpperCase() + (n.text ? ': ' + n.text : '') })))
            .sort((a, b) => a.t - b.t);
        if (!rows.length) L.push('No contractions timed yet.');
        rows.forEach(x => L.push(x.s));
        L.push('', 'Times are when each contraction started. Apart = from the start of one to the start of the next.');
        return L.join('\n');
    }

    // Restores saved data, dropping anything that is not valid.
    function cleanState(raw) {
        const s = raw && typeof raw === 'object' ? raw : {};
        const okT = t => Number.isFinite(t) && t > 946684800000 && t < 4102444800000;
        const id = x => typeof x === 'string' && x.length < 40 ? x : Math.random().toString(36).slice(2, 10);
        const items = (Array.isArray(s.items) ? s.items : []).filter(c => c && okT(c.start) && okT(c.end) && (c.end - c.start) / SEC >= 1 && (c.end - c.start) / SEC <= MAX_LEN)
            .map(c => ({ id: id(c.id), start: c.start, end: c.end, strength: STRENGTHS[c.strength] ? c.strength : '' })).slice(-2000);
        const notes = (Array.isArray(s.notes) ? s.notes : []).filter(n => n && okT(n.at))
            .map(n => ({ id: id(n.id), at: n.at, kind: KINDS[n.kind] ? n.kind : 'other', text: typeof n.text === 'string' ? n.text.slice(0, 200) : '' })).slice(-500);
        return { v: 1, items: sorted(items), notes: notes.sort((a, b) => a.at - b.at), running: okT(s.running) ? s.running : null, rule: cleanRule(s.rule), wake: s.wake === true };
    }

    const api = { SEC, MIN, MIN_LEN, MAX_LEN, PRESETS, LIMITS, KINDS, STRENGTHS, fmtLen, fmtWords, parseLen, cleanRule, ruleLabel, ruleWords, holdWords, lastWords,
        withApart, currentRun, evaluate, firstMet, checkOne, timeToMs, logText, cleanState };
    if (typeof module === 'object' && module.exports) module.exports = api; else root.CT = api;
})(this);
