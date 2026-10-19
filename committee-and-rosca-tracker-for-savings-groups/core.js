// Committee and ROSCA Tracker: the maths and the words, with no page code, so tests.js can check it in node.
// Amounts are whole cents (hundredths) so totals are exact. Dates are calendar days ('2026-10-05').
// A committee has members; each share is one turn. Every round each member pays amount x shares,
// and the member whose turn it is takes the pot (amount x all shares).
(function (root) {
    'use strict';
    const MAX = 10000000000; // 100,000,000 per share per round, in cents
    const MAXTXT = '100,000,000';
    const MAX_SHARES = 5, MAX_TURNS = 60;
    const FREQS = { month: { label: 'Every month', per: 'a month', each: 'each month' }, '2week': { label: 'Every 2 weeks', per: 'every 2 weeks', each: 'every 2 weeks' }, week: { label: 'Every week', per: 'a week', each: 'each week' } };
    const SYMBOLS = ['', 'Rs', '₹', '$', '€', '£', '৳', '₦', 'KSh', '₵', 'R', '₱', 'Rp', 'RM', 'AED', 'SAR', '¥', '₩', '₺', 'R$', 'E£', 'A$', 'C$', 'kr', 'CHF', 'zł'];

    // "2,500" "2.500" "2 500" "1,00,000" "12.5" "12,50" "$40" "Rs 1500" -> cents, or { error }
    function parseAmount(text) {
        let s = String(text == null ? '' : text).replace(/[   ']/g, ' ').trim();
        if (!s) return { error: 'Type the amount, such as 10000.' };
        s = s.replace(/^(rs\.?|inr|usd|eur|gbp|pkr|aed|sar|[$€£₹¥₩₦₱৳₺₽₴])\s*/i, '').replace(/\s*(rs\.?|[$€£₹¥₩₦₱৳₺₽₴])$/i, '').trim();
        if (/^[-−–]/.test(s)) return { error: 'Type the amount without a minus sign.' };
        if (/^\+/.test(s)) s = s.slice(1).trim();
        if (!/^[\d.,\s]+$/.test(s) || !/\d/.test(s)) return { error: 'Type a number, such as 2500 or 12.50.' };
        let whole, frac = '';
        if (/\s/.test(s)) {
            const parts = s.split(/\s+/);
            const last = parts[parts.length - 1];
            const dm = last.match(/^(\d{3})([.,]\d{0,2})?$/);
            if (!/^\d{1,3}$/.test(parts[0]) || !parts.slice(1, -1).every(p => /^\d{3}$/.test(p)) || !dm) return { error: 'That number looks mistyped. Type it like 2500 or 2,500.' };
            whole = parts.join('').replace(/[.,]\d*$/, ''); frac = dm[2] ? dm[2].slice(1) : '';
        } else {
            const dots = (s.match(/\./g) || []).length, commas = (s.match(/,/g) || []).length;
            let dec = null; // which mark is the decimal point
            if (dots && commas) dec = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ',';
            else if (dots + commas === 1) {
                const mark = dots ? '.' : ',', [a, b] = s.split(mark);
                dec = (b.length === 3 && /^\d{1,3}$/.test(a) && a !== '0') ? null : mark;
            }
            let intPart = s, fracPart = '';
            if (dec) { const i = s.lastIndexOf(dec); intPart = s.slice(0, i); fracPart = s.slice(i + 1); }
            const th = dec === '.' ? ',' : dec === ',' ? '.' : (dots ? '.' : ',');
            if (intPart.includes(dec || '\u0000')) return { error: 'That number looks mistyped. Type it like 2500 or 2,500.' };
            if (intPart.includes(th)) {
                const re = new RegExp('^\\d{1,3}(\\' + th + '\\d{3})+$'), ind = new RegExp('^\\d{1,2}(\\' + th + '\\d{2})*\\' + th + '\\d{3}$');
                if (!re.test(intPart) && !ind.test(intPart)) return { error: 'That number looks mistyped. Type it like 2500 or 2,500.' };
            }
            if (!/^[\d]*$/.test(fracPart)) return { error: 'That number looks mistyped. Type it like 2500 or 2,500.' };
            whole = intPart.split(th).join(''); frac = fracPart;
            if (whole === '' && frac === '') return { error: 'Type a number, such as 2500 or 12.50.' };
        }
        if (frac.length > 2) return { error: 'Use at most 2 numbers after the decimal point, such as 12.50.' };
        whole = whole.replace(/^0+(?=\d)/, '') || '0';
        if (whole.length > 9) return { error: 'That amount is too big. The most is ' + MAXTXT + '.' };
        const cents = Number(whole) * 100 + Number((frac + '00').slice(0, 2));
        if (cents === 0) return { error: 'Type an amount more than 0.' };
        if (cents > MAX) return { error: 'That amount is too big. The most is ' + MAXTXT + '.' };
        return { cents };
    }

    function fmt(cents, cur, locale) {
        const n = Math.abs(cents);
        let t;
        try { t = new Intl.NumberFormat(locale || undefined, { minimumFractionDigits: n % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(n / 100); }
        catch (e) { t = (n / 100).toFixed(n % 100 ? 2 : 0); }
        if (!cur) return t;
        return /^[A-Za-z]/.test(cur) || /[A-Za-z]$/.test(cur) ? cur + ' ' + t : cur + t;
    }

    // dates
    const pad = n => String(n).padStart(2, '0');
    const dayStr = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    function toDate(s) { const [y, m, d] = s.split('-').map(Number); const t = new Date(y, m - 1, d, 12); t.setFullYear(y); return t; }
    const isDay = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && +s.slice(0, 4) >= 2000 && +s.slice(0, 4) <= 2100 && dayStr(toDate(s)) === s;
    function addDays(s, n) { const d = toDate(s); d.setDate(d.getDate() + n); return dayStr(d); }
    // same day of the month, or the month's last day when it is shorter (31 Jan -> 28 Feb -> 31 Mar)
    function addMonths(s, n) {
        const [y, m, d] = s.split('-').map(Number), t = (y * 12 + (m - 1)) + n, yy = Math.floor(t / 12), mm = t % 12;
        const last = new Date(yy, mm + 1, 0, 12).getDate();
        return yy + '-' + pad(mm + 1) + '-' + pad(Math.min(d, last));
    }
    function daysBetween(a, b) { const u = s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); }; return Math.round((u(b) - u(a)) / 864e5); }
    function niceDate(s, locale) { try { return toDate(s).toLocaleDateString(locale || undefined, { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return s; } }
    function monthName(s, locale) { try { return toDate(s).toLocaleDateString(locale || undefined, { month: 'long', year: 'numeric' }); } catch (e) { return s; } }
    const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

    // ---------- the committee ----------
    const totalShares = c => c.members.reduce((t, m) => t + m.shares, 0);
    const rounds = c => c.order.length;
    const pot = c => c.amount * totalShares(c);
    const dueOf = (c, m) => c.amount * m.shares;
    const memberById = (c, id) => c.members.find(m => m.id === id);
    function roundDate(c, r) { return c.freq === 'month' ? addMonths(c.start, r) : addDays(c.start, r * (c.freq === 'week' ? 7 : 14)); }
    function roundName(c, r, locale) { return 'Round ' + (r + 1) + ' of ' + rounds(c) + ' (' + (c.freq === 'month' ? monthName(roundDate(c, r), locale) : niceDate(roundDate(c, r), locale)) + ')'; }
    const isLocked = (c, r) => !!c.handed[r];

    // keep the turn order in step with the members: each share is exactly one turn.
    // New shares go to the end; removed shares come off the latest turn not yet handed over.
    function syncOrder(c) {
        const want = {}; c.members.forEach(m => { want[m.id] = m.shares; });
        const have = {};
        let order = [];
        c.order.forEach((id, r) => { order.push({ id, r }); });
        // drop turns of members who are gone (never locked ones: callers refuse that)
        order = order.filter(t => want[t.id] !== undefined);
        order.forEach(t => { have[t.id] = (have[t.id] || 0) + 1; });
        for (let i = order.length - 1; i >= 0; i--) {
            const t = order[i];
            if (have[t.id] > want[t.id] && !c.handed[t.r]) { have[t.id]--; order.splice(i, 1); }
        }
        c.members.forEach(m => { for (let k = have[m.id] || 0; k < m.shares; k++) order.push({ id: m.id, r: -1 }); });
        // handed-over rounds keep their place: rebuild so locked turns stay at their round number
        const locked = order.filter(t => t.r >= 0 && c.handed[t.r]), free = order.filter(t => !(t.r >= 0 && c.handed[t.r]));
        const out = new Array(order.length);
        locked.forEach(t => { if (t.r < out.length && out[t.r] === undefined) out[t.r] = t.id; else free.unshift(t); });
        let k = 0;
        for (let i = 0; i < out.length; i++) if (out[i] === undefined) out[i] = free[k++].id;
        // payments and hand-overs past the last round are dropped
        Object.keys(c.handed).forEach(r => { if (+r >= out.length || c.handed[r] !== out[r]) delete c.handed[r]; });
        Object.keys(c.paid).forEach(r => { if (+r >= out.length) delete c.paid[r]; });
        Object.keys(c.paid).forEach(r => Object.keys(c.paid[r]).forEach(id => { if (want[id] === undefined) delete c.paid[r][id]; }));
        c.order = out;
        return c;
    }
    // how many turns of this member are already handed over (they cannot have fewer shares than that)
    const handedCount = (c, id) => Object.keys(c.handed).filter(r => c.handed[r] === id).length;

    function move(c, r, dir) {
        const t = r + dir;
        if (t < 0 || t >= c.order.length || isLocked(c, r) || isLocked(c, t)) return false;
        const o = c.order; [o[r], o[t]] = [o[t], o[r]]; return true;
    }
    // shuffle only the turns not yet handed over; rand() returns [0,1)
    function draw(c, rand) {
        const free = [], ids = [];
        c.order.forEach((id, r) => { if (!isLocked(c, r)) { free.push(r); ids.push(id); } });
        for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
        free.forEach((r, i) => { c.order[r] = ids[i]; });
        return free.length;
    }

    const paidIn = (c, r, id) => (c.paid[r] && c.paid[r][id] ? c.paid[r][id].c : 0);
    // the round whose date has come most recently; before the start it is round 0 (not started)
    function currentRound(c, today) {
        const n = rounds(c); if (!n) return { r: 0, started: false, ended: false };
        if (today < c.start) return { r: 0, started: false, ended: false, days: daysBetween(today, c.start) };
        let r = 0; while (r + 1 < n && roundDate(c, r + 1) <= today) r++;
        const ended = r === n - 1 && roundStatus(c, r).allPaid && Object.keys(c.handed).length === n;
        return { r, started: true, ended };
    }

    function roundStatus(c, r) {
        const taker = memberById(c, c.order[r]);
        let paidCount = 0, paidCents = 0, dueCents = 0; const unpaid = [], rows = [];
        c.members.forEach(m => {
            const due = dueOf(c, m), paid = Math.min(paidIn(c, r, m.id), due);
            dueCents += due; paidCents += paid;
            const row = { m, due, paid, left: due - paid, full: paid >= due, date: c.paid[r] && c.paid[r][m.id] ? c.paid[r][m.id].d : '' };
            rows.push(row);
            if (row.full) paidCount++; else unpaid.push(row);
        });
        return { r, taker, pot: pot(c), paidCount, memberCount: c.members.length, paidCents, dueCents, leftCents: dueCents - paidCents, unpaid, rows, allPaid: !unpaid.length, handed: isLocked(c, r) };
    }

    function memberSummary(c, m, today) {
        const n = rounds(c), turns = [], owed = [];
        let paidTotal = 0, fullRounds = 0, dueRounds = 0;
        const due = dueOf(c, m);
        for (let r = 0; r < n; r++) {
            if (c.order[r] === m.id) turns.push(r);
            const p = Math.min(paidIn(c, r, m.id), due); paidTotal += p;
            if (p >= due) fullRounds++;
            if (roundDate(c, r) <= today) { dueRounds++; if (p < due) owed.push({ r, left: due - p, part: p > 0 }); }
        }
        const owedCents = owed.reduce((t, o) => t + o.left, 0);
        return { m, due, turns, paidTotal, fullRounds, dueRounds, owed, owedCents, totalDue: due * n, received: turns.filter(r => isLocked(c, r)).length };
    }

    // ---------- words ----------
    const first = name => name.split(' ')[0];
    function headline(c, r, cur, locale) {
        const s = roundStatus(c, r);
        return s.taker ? s.taker.name + (s.handed ? ' took ' : ' takes ') + fmt(s.pot, cur, locale) : '';
    }
    function roundText(c, r, cur, today, locale) {
        const s = roundStatus(c, r), d = roundDate(c, r), lines = [c.name + ': ' + roundName(c, r, locale)];
        lines.push(s.taker.name + (s.handed ? ' took the pot of ' : ' takes the pot of ') + fmt(s.pot, cur, locale) + ' this round.');
        lines.push('Paid: ' + s.paidCount + ' of ' + s.memberCount + ' (' + fmt(s.paidCents, cur, locale) + ' of ' + fmt(s.dueCents, cur, locale) + ').');
        if (s.allPaid) lines.push('Everyone has paid. Thank you!');
        else {
            lines.push('', 'Still to pay:');
            s.unpaid.forEach(u => lines.push('- ' + u.m.name + ': ' + fmt(u.left, cur, locale) + (u.paid ? ' (paid ' + fmt(u.paid, cur, locale) + ' of ' + fmt(u.due, cur, locale) + ')' : '')));
            lines.push('', d < today ? 'It was due on ' + niceDate(d, locale) + '. Please pay as soon as you can. Thank you!' : 'Please pay by ' + niceDate(d, locale) + '. Thank you!');
        }
        return lines.join('\n');
    }
    function memberText(c, m, cur, today, locale) {
        const s = memberSummary(c, m, today), lines = [];
        let t = 'Hi ' + first(m.name) + ', a reminder for the ' + c.name + ' committee: ';
        if (s.owedCents) {
            t += 'you have ' + fmt(s.owedCents, cur, locale) + ' still to pay (' + s.owed.map(o => fmt(o.left, cur, locale) + ' for round ' + (o.r + 1) + ', ' + niceDate(roundDate(c, o.r), locale)).join('; ') + ').';
        } else t += 'you are paid up so far, thank you.';
        lines.push(t);
        const next = s.turns.filter(r => !isLocked(c, r));
        if (next.length) lines.push('Your turn to take the pot of ' + fmt(pot(c), cur, locale) + ': ' + next.map(r => 'round ' + (r + 1) + ' (' + niceDate(roundDate(c, r), locale) + ')').join(' and ') + '.');
        lines.push('Thank you!');
        return lines.join(' ');
    }
    function sheetText(c, cur, today, locale) {
        const n = rounds(c), lines = [c.name + ' committee', fmt(c.amount, cur, locale) + ' per share ' + FREQS[c.freq].per + ', ' + plural(c.members.length, 'member', 'members') + ', pot ' + fmt(pot(c), cur, locale) + ', ' + plural(n, 'round', 'rounds') + ' from ' + niceDate(c.start, locale) + ' to ' + niceDate(roundDate(c, n - 1), locale) + '.', '', 'Turn order:'];
        for (let r = 0; r < n; r++) {
            const s = roundStatus(c, r);
            lines.push((r + 1) + '. ' + niceDate(roundDate(c, r), locale) + ': ' + s.taker.name + (s.handed ? ' (pot handed over)' : '') + ' - paid ' + s.paidCount + ' of ' + s.memberCount);
        }
        lines.push('', 'Members:');
        c.members.forEach(m => {
            const s = memberSummary(c, m, today);
            lines.push('- ' + m.name + (m.shares > 1 ? ' (' + m.shares + ' shares)' : '') + ': paid ' + fmt(s.paidTotal, cur, locale) + ' of ' + fmt(s.totalDue, cur, locale) + (s.owedCents ? ', owes ' + fmt(s.owedCents, cur, locale) + ' now' : ', paid up') + '.');
        });
        return lines.join('\n');
    }

    // ---------- state ----------
    const cleanName = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, 60);
    const sameName = (a, b) => cleanName(a).toLocaleLowerCase() === cleanName(b).toLocaleLowerCase();
    function cleanPhone(s) {
        const t = String(s == null ? '' : s).trim(); if (!t) return { phone: '' };
        if (!/^\+?[\d\s().-]+$/.test(t)) return { error: 'Type the phone number with digits only, such as +92 300 1234567.' };
        const d = t.replace(/\D/g, '');
        if (d.length < 6 || d.length > 15) return { error: 'That phone number looks too short or too long.' };
        return { phone: (t.startsWith('+') ? '+' : '') + d };
    }
    function waLink(phone, text) { return 'https://wa.me/' + (phone ? phone.replace(/\D/g, '') : '') + '?text=' + encodeURIComponent(text); }
    const idOk = s => typeof s === 'string' && /^[\w-]{1,40}$/.test(s);
    function newCommittee(id, today) { return { id, name: 'My committee', amount: 0, freq: 'month', start: today, members: [], order: [], paid: {}, handed: {}, drawn: '' }; }
    function emptyState() { return { v: 1, cur: '', active: '', committees: [] }; }

    // anything saved or restored is checked; bad parts are dropped and the app never crashes
    function normalizeCommittee(x, today) {
        if (!x || typeof x !== 'object' || !idOk(x.id)) return null;
        const c = newCommittee(x.id, today);
        c.name = cleanName(x.name) || 'My committee';
        if (Number.isInteger(x.amount) && x.amount > 0 && x.amount <= MAX) c.amount = x.amount;
        if (FREQS[x.freq]) c.freq = x.freq;
        if (isDay(x.start)) c.start = x.start;
        if (isDay(x.drawn)) c.drawn = x.drawn;
        const ids = new Set();
        (Array.isArray(x.members) ? x.members : []).forEach(m => {
            if (!m || typeof m !== 'object' || !idOk(m.id) || ids.has(m.id)) return;
            const name = cleanName(m.name); if (!name || c.members.some(o => sameName(o.name, name))) return;
            const shares = Number.isInteger(m.shares) && m.shares >= 1 && m.shares <= MAX_SHARES ? m.shares : 1;
            if (totalShares(c) + shares > MAX_TURNS) return;
            const ph = cleanPhone(m.phone);
            ids.add(m.id); c.members.push({ id: m.id, name, shares, phone: ph.phone || '' });
        });
        c.order = (Array.isArray(x.order) ? x.order : []).filter(id => ids.has(id));
        if (x.handed && typeof x.handed === 'object') Object.keys(x.handed).forEach(r => { if (/^\d+$/.test(r) && c.order[+r] === x.handed[r]) c.handed[+r] = x.handed[r]; });
        if (x.paid && typeof x.paid === 'object') Object.keys(x.paid).forEach(r => {
            const row = x.paid[r]; if (!/^\d+$/.test(r) || !row || typeof row !== 'object') return;
            Object.keys(row).forEach(id => {
                const p = row[id]; if (!ids.has(id) || !p || !Number.isInteger(p.c) || p.c <= 0 || p.c > MAX * MAX_SHARES) return;
                (c.paid[+r] = c.paid[+r] || {})[id] = { c: p.c, d: isDay(p.d) ? p.d : '' };
            });
        });
        // the order must hold each member's shares exactly; a hand-over must match its turn
        const count = {}; c.order.forEach(id => { count[id] = (count[id] || 0) + 1; });
        if (c.members.some(m => (count[m.id] || 0) < handedCount(c, m.id))) c.handed = {};
        syncOrder(c);
        return c;
    }
    function normalize(raw, today) {
        if (!raw || typeof raw !== 'object' || !Array.isArray(raw.committees)) return null;
        const s = emptyState();
        if (SYMBOLS.includes(raw.cur)) s.cur = raw.cur;
        raw.committees.slice(0, 50).forEach(x => { const c = normalizeCommittee(x, today); if (c && !s.committees.some(o => o.id === c.id)) s.committees.push(c); });
        s.active = s.committees.some(c => c.id === raw.active) ? raw.active : (s.committees[0] ? s.committees[0].id : '');
        return s;
    }

    const api = { MAX, MAX_SHARES, MAX_TURNS, FREQS, SYMBOLS, parseAmount, fmt, dayStr, toDate, isDay, addDays, addMonths, daysBetween, niceDate, monthName, plural,
        totalShares, rounds, pot, dueOf, memberById, roundDate, roundName, isLocked, syncOrder, handedCount, move, draw, paidIn, currentRound, roundStatus, memberSummary,
        headline, roundText, memberText, sheetText, cleanName, sameName, cleanPhone, waLink, newCommittee, emptyState, normalize };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CRT = api;
})(this);
