// Score sheet maths, no page code. All scores are whole numbers, so totals are always exact.
// A game: { presetId, high (true = highest total wins), end: 'none' | 'reach' | 'out' | 'rounds', limit,
//   players: [{ id, name, start, adjs: [{ at, amount }], left }], rounds: [{ scores: { id: points } }], ended, keepFrom }
(function (root) {
    'use strict';
    const MAX = 999999, MAX_PLAYERS = 12, MAX_NAME = 30, MAX_ROUNDS = 500;
    const PRESETS = [
        { id: 'custom', name: 'Custom game', base: 'Custom game', high: true, end: 'none', limit: 0 },
        { id: 'pool101', name: 'Pool Rummy 101', base: 'Pool Rummy', high: false, end: 'out', limit: 101, chips: [[0, 'Won'], [20, 'Drop'], [40, 'Middle drop'], [80, 'Full count']] },
        { id: 'pool201', name: 'Pool Rummy 201', base: 'Pool Rummy', high: false, end: 'out', limit: 201, chips: [[0, 'Won'], [25, 'Drop'], [50, 'Middle drop'], [80, 'Full count']] },
        { id: 'points', name: 'Rummy, lowest wins', base: 'Rummy', high: false, end: 'none', limit: 0 },
        { id: 'gin', name: 'Gin Rummy, first to 100', base: 'Gin Rummy', high: true, end: 'reach', limit: 100 },
        { id: 'uno', name: 'Uno, first to 500', base: 'Uno', high: true, end: 'reach', limit: 500 },
        { id: 'hearts', name: 'Hearts, ends at 100', base: 'Hearts', high: false, end: 'reach', limit: 100 },
        { id: 'spades', name: 'Spades, first to 500', base: 'Spades', high: true, end: 'reach', limit: 500 },
        { id: 'carrom', name: 'Carrom, first to 25', base: 'Carrom', high: true, end: 'reach', limit: 25 },
        { id: 'scrabble', name: 'Scrabble, highest wins', base: 'Scrabble', high: true, end: 'none', limit: 0 }
    ];
    const ENDS = ['none', 'reach', 'out', 'rounds'];
    const preset = id => PRESETS.find(p => p.id === id) || PRESETS[0];
    const isInt = v => typeof v === 'number' && Number.isInteger(v) && Math.abs(v) <= MAX;

    // A typed score: blank is null (counts as 0), otherwise a whole number between -999999 and 999999.
    function parseScore(text) {
        let s = String(text == null ? '' : text).trim().replace(/\s+/g, '').replace(/^[−–—]/, '-').replace(/^\+/, '');
        if (s === '') return { ok: true, value: null };
        if (/^-?\d{1,3}(,\d{3})+$/.test(s)) s = s.replace(/,/g, '');
        if (!/^-?\d+$/.test(s)) {
            if (/^-?\d*[.,]\d+$/.test(s)) return { ok: false, error: 'Whole numbers only' };
            return { ok: false, error: 'Type a number' };
        }
        const v = Number(s);
        if (Math.abs(v) > MAX) return { ok: false, error: 'Too big (largest is 999999)' };
        return { ok: true, value: v === 0 ? 0 : v };
    }

    // The number in "Score to reach", "Out at" or "Number of rounds": a whole number from 1 to 999999.
    function parseLimit(text) {
        const r = parseScore(text);
        if (!r.ok) return r;
        if (r.value === null) return { ok: false, error: 'Type a number' };
        if (r.value < 1) return { ok: false, error: 'Must be 1 or more' };
        return r;
    }

    function better(g) { return g.high ? (a, b) => b.total - a.total : (a, b) => a.total - b.total; }

    // Plays the rounds in order: totals, when each player went out, and who was still in before the last round.
    function replay(g) {
        const tot = {}, outAt = {};
        const elim = g.end === 'out';
        const isOut = id => elim && tot[id] >= g.limit;
        const applyAdjs = count => g.players.forEach(p => (p.adjs || []).forEach(a => { if (a.at === count) tot[p.id] += a.amount; }));
        const mark = count => g.players.forEach(p => { if (isOut(p.id)) { if (!(p.id in outAt)) outAt[p.id] = count; } else delete outAt[p.id]; });
        g.players.forEach(p => { tot[p.id] = p.start || 0; });
        applyAdjs(0); mark(0);
        let inBeforeLast = g.players.filter(p => !isOut(p.id)).map(p => p.id);
        g.rounds.forEach((r, i) => {
            inBeforeLast = g.players.filter(p => !isOut(p.id)).map(p => p.id);
            Object.keys(r.scores).forEach(id => { if (id in tot) tot[id] += r.scores[id]; });
            mark(i + 1);
            applyAdjs(i + 1); mark(i + 1);
        });
        return { tot, outAt, inBeforeLast };
    }

    // Who is ahead, who is out, whether the game is over and who won.
    function status(g) {
        const R = replay(g), n = g.rounds.length, cmp = better(g);
        const rows = g.players.map(p => ({ id: p.id, name: p.name, total: R.tot[p.id], left: !!p.left,
            out: g.end === 'out' && R.tot[p.id] >= g.limit, outAt: p.id in R.outAt ? R.outAt[p.id] : null }));
        const playing = rows.filter(r => !r.left);
        const still = playing.filter(r => !r.out);
        let over = false, reason = '';
        if (n > 0 && n > (g.keepFrom || 0)) {
            if (g.end === 'reach' && playing.some(r => r.total >= g.limit)) { over = true; reason = 'reach'; }
            if (g.end === 'rounds' && n >= g.limit) { over = true; reason = 'rounds'; }
            if (g.end === 'out' && playing.length >= 2 && still.length <= 1) { over = true; reason = 'out'; }
        }
        if (g.ended && !over) { over = true; reason = 'ended'; }
        const best = list => { if (!list.length) return []; const s = list.slice().sort(cmp); return s.filter(r => r.total === s[0].total); };
        let winners = [];
        if (over) {
            if (g.end === 'out') {
                if (still.length) winners = best(still);
                else winners = best(playing.filter(r => R.inBeforeLast.includes(r.id) && r.outAt === n));
                if (!winners.length) winners = best(playing);
            } else winners = best(playing);
        }
        // ranking: players still in first, then players who went out (the last to go out ranks higher), then players who left
        const group = r => r.left ? 2 : r.out ? 1 : 0;
        const ranked = rows.slice().sort((a, b) => group(a) - group(b) || (group(a) === 1 ? (b.outAt || 0) - (a.outAt || 0) : 0) || cmp(a, b));
        if (over) { // winners on top even when the last players all went out in the same round
            const w = new Set(winners.map(r => r.id));
            ranked.sort((a, b) => (w.has(b.id) ? 1 : 0) - (w.has(a.id) ? 1 : 0));
        }
        let place = 0;
        ranked.forEach((r, i) => {
            const prev = ranked[i - 1];
            if (r.left) { r.rank = null; return; }
            const same = prev && !prev.left && group(prev) === group(r) && prev.total === r.total && prev.outAt === r.outAt;
            if (!same) place = i + 1;
            r.rank = place;
            r.winner = winners.some(w => w.id === r.id);
        });
        return { rows, ranked, over, reason, winners, rounds: n, still };
    }

    // One line about each player, for example "can take 19 more" in Pool Rummy 101 or "120 to reach 500" in Uno.
    function note(g, r, over) {
        if (r.left) return 'Left the table';
        if (r.out) return 'Out (' + g.limit + ' or more)';
        if (g.end === 'out') return 'Can take ' + (g.limit - 1 - r.total) + ' more';
        if (g.end === 'reach' && r.total < g.limit && !over) return (g.limit - r.total) + ' to reach ' + g.limit;
        return '';
    }

    const list = names => names.length <= 1 ? names.join('') : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];

    // The sentence at the top: "Sara leads with 42, 8 ahead of Ali" or "Sara wins with 64".
    function headline(g, st) {
        const lowNote = g.high ? '' : ' (lowest wins)';
        if (st.over) {
            const w = st.winners;
            if (!w.length) return { big: 'Game over', small: '' };
            if (w.length > 1) return { big: 'Tie: ' + list(w.map(r => r.name)), small: 'Level on ' + w[0].total + lowNote + '.' };
            const others = st.ranked.filter(r => !r.left && r.id !== w[0].id);
            let small = 'Won with ' + w[0].total + lowNote;
            if (g.end === 'out') small = others.length ? 'Last player in, with ' + w[0].total + '.' : 'Won with ' + w[0].total + '.';
            else if (others.length) small += ', ' + Math.abs(w[0].total - others[0].total) + ' ahead of ' + others[0].name + '.';
            else small += '.';
            return { big: w[0].name + ' wins!', small };
        }
        if (!st.rounds) return { big: 'Round 1', small: 'No scores yet. Type the first round below.' };
        const pool = st.ranked.filter(r => !r.left && !r.out);
        if (!pool.length) return { big: 'No one is playing', small: '' };
        const top = pool.filter(r => r.total === pool[0].total), next = pool.find(r => r.total !== pool[0].total);
        let big = top.length > 1 ? list(top.map(r => r.name)) + ' are level' : top[0].name + ' leads';
        let small = (top.length > 1 ? 'Level on ' : 'With ') + top[0].total + lowNote;
        if (top.length === 1 && next) small += ', ' + Math.abs(top[0].total - next.total) + ' ahead of ' + next.name;
        small += '. After ' + st.rounds + (st.rounds === 1 ? ' round' : ' rounds') + (g.end === 'rounds' ? ' of ' + g.limit : '') + '.';
        return { big, small };
    }

    // "Uno, first to 500", or "Uno (house rules)" when the rules were changed from the preset.
    function title(g) {
        const p = preset(g.presetId);
        if (p.high === g.high && p.end === g.end && (p.end === 'none' || p.limit === g.limit)) return p.name;
        return p.id === 'custom' ? p.name : p.base + ' (house rules)';
    }

    function rulesText(g) {
        const win = g.high ? 'highest score wins' : 'lowest score wins';
        const end = g.end === 'reach' ? 'ends when someone reaches ' + g.limit : g.end === 'out' ? 'out at ' + g.limit + ', last one left wins'
            : g.end === 'rounds' ? g.limit + (g.limit === 1 ? ' round' : ' rounds') : 'play until you stop';
        return title(g) + ' · ' + win + ' · ' + end;
    }

    // Plain text for Copy and Email.
    function summaryText(g, st, dateText) {
        const lines = [title(g) + (dateText ? ', ' + dateText : '') + ', ' + st.rounds + (st.rounds === 1 ? ' round' : ' rounds')];
        const h = headline(g, st);
        lines.push(h.big + (h.small ? ' ' + h.small : ''), '');
        st.ranked.forEach(r => {
            const n = note(g, r);
            lines.push((r.rank ? r.rank + '. ' : '- ') + r.name + ': ' + r.total + (r.out || r.left ? ' (' + n.toLowerCase() + ')' : ''));
        });
        if (st.rounds) {
            lines.push('', 'Round by round:');
            g.rounds.forEach((r, i) => lines.push('Round ' + (i + 1) + ': ' + g.players.filter(p => p.id in r.scores).map(p => p.name + ' ' + r.scores[p.id]).join(', ')));
        }
        return lines.join('\n');
    }

    // The total a player gets when they rejoin Pool Rummy: the highest total of those still in.
    function rejoinTotal(g, st) {
        const still = st.rows.filter(r => !r.left && !r.out);
        return still.length ? Math.max.apply(null, still.map(r => r.total)) : null;
    }

    // Who should get a box for a round: players at the table and not out before it started.
    function playersFor(g, roundIndex) {
        const before = { ...g, rounds: g.rounds.slice(0, roundIndex), ended: false };
        const st = status(before);
        const r = g.rounds[roundIndex];
        return g.players.filter(p => (r && p.id in r.scores) || (!p.left && !st.rows.find(x => x.id === p.id).out && !(r && (p.joinedAt || 0) > roundIndex)));
    }

    // Saved data is checked field by field; anything odd is dropped instead of crashing the page.
    function cleanGame(o) {
        if (!o || typeof o !== 'object' || !Array.isArray(o.players) || !Array.isArray(o.rounds)) return null;
        const ids = new Set(), players = [];
        for (const p of o.players.slice(0, MAX_PLAYERS)) {
            if (!p || typeof p.id !== 'string' || !p.id || ids.has(p.id) || typeof p.name !== 'string') continue;
            ids.add(p.id);
            players.push({ id: p.id, name: p.name.slice(0, MAX_NAME) || 'Player', start: isInt(p.start) ? p.start : 0,
                adjs: Array.isArray(p.adjs) ? p.adjs.filter(a => a && Number.isInteger(a.at) && a.at >= 0 && isInt(a.amount)).map(a => ({ at: a.at, amount: a.amount })) : [],
                left: p.left === true, joinedAt: Number.isInteger(p.joinedAt) && p.joinedAt >= 0 ? p.joinedAt : 0 });
        }
        if (!players.length) return null;
        const rounds = o.rounds.slice(0, MAX_ROUNDS).filter(r => r && r.scores && typeof r.scores === 'object').map(r => {
            const scores = {};
            Object.keys(r.scores).forEach(id => { if (ids.has(id) && isInt(r.scores[id])) scores[id] = r.scores[id]; });
            return { scores };
        });
        const end = ENDS.includes(o.end) ? o.end : 'none';
        const limit = Number.isInteger(o.limit) && o.limit >= 1 && o.limit <= MAX ? o.limit : (end === 'none' ? 0 : null);
        if (limit === null) return null;
        return { presetId: preset(o.presetId).id, high: o.high !== false, end, limit, players, rounds, ended: o.ended === true,
            keepFrom: Number.isInteger(o.keepFrom) && o.keepFrom >= 0 ? o.keepFrom : 0,
            startedAt: typeof o.startedAt === 'number' && isFinite(o.startedAt) ? o.startedAt : Date.now() };
    }

    function cleanHistory(a) {
        if (!Array.isArray(a)) return [];
        return a.filter(h => h && typeof h.title === 'string' && typeof h.at === 'number' && isFinite(h.at) && Array.isArray(h.players) && Array.isArray(h.winners))
            .slice(0, 100).map(h => ({ title: h.title.slice(0, 60), at: h.at, rounds: Number.isInteger(h.rounds) ? h.rounds : 0, finished: h.finished === true,
                players: h.players.filter(p => p && typeof p.name === 'string' && isInt(p.total)).slice(0, MAX_PLAYERS).map(p => ({ name: p.name.slice(0, MAX_NAME), total: p.total })),
                winners: h.winners.filter(w => typeof w === 'string').slice(0, MAX_PLAYERS).map(w => w.slice(0, MAX_NAME)) }));
    }

    // A finished or stopped game, as one line in Past games.
    function historyEntry(g, st, now) {
        return { title: title(g), at: now, rounds: st.rounds, finished: st.over,
            players: st.ranked.map(r => ({ name: r.name, total: r.total })), winners: st.over ? st.winners.map(w => w.name) : [] };
    }

    // Wins per name across finished past games, most wins first.
    function winTally(history) {
        const t = {};
        history.forEach(h => { if (h.finished) h.winners.forEach(w => { const k = w.trim().toLowerCase(); t[k] = t[k] || { name: w.trim(), wins: 0 }; t[k].wins++; }); });
        return Object.values(t).sort((a, b) => b.wins - a.wins || a.name.localeCompare(b.name));
    }

    const api = { MAX, MAX_PLAYERS, MAX_NAME, PRESETS, preset, parseScore, parseLimit, replay, status, note, headline, title, rulesText,
        summaryText, rejoinTotal, playersFor, cleanGame, cleanHistory, historyEntry, winTally };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.ScoreCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
