// Pocket Money and Chores Tracker for Kids: the maths and the words, with no page code, so tests.js can check it in node.
// Amounts are whole cents (hundredths) so nothing is ever off by a rounding error.
// Dates are calendar days ('2026-10-17'), so time zones and summer time never move an entry to another day.
(function (root) {
    'use strict';
    const MAX = 999999999; // 9,999,999.99 in cents
    const SYMBOLS = ['', '$', '€', '£', '₹', 'Rs', '¥', '₩', '₦', '₱', 'R', 'kr', 'CHF', 'AED', 'SAR', 'RM', 'Rp', '৳', '₺', 'R$', 'zł', '₽', '₴', 'KSh', '₵', 'E£', 'A$', 'C$', 'NZ$'];
    const FREQS = { week: 'Every week', '2weeks': 'Every 2 weeks', month: 'Every month' };
    const KINDS = { pay: 'Pocket money', chore: 'Chore', in: 'Added', out: 'Taken out' };
    const NAME_MAX = 40, NOTE_MAX = 80;

    // "2,500" "2.500" "2 500" "12.5" "12,50" "$4" "Rs 150" -> cents, or { error }. opt.zero allows 0 (a chore with no pay).
    function parseAmount(text, opt) {
        opt = opt || {};
        let s = String(text == null ? '' : text).replace(/[   ']/g, ' ').trim();
        if (!s) return opt.blank != null ? { cents: opt.blank } : { error: 'Type the amount, such as 5 or 2.50.' };
        s = s.replace(/^(rs\.?|inr|usd|eur|gbp|pkr|aed|sar|[$€£₹¥₩₦₱৳₺₽₴])\s*/i, '').replace(/\s*(rs\.?|[$€£₹¥₩₦₱৳₺₽₴])$/i, '').trim();
        if (/^[-−–]/.test(s)) return { error: 'Type the amount without a minus sign.' };
        if (/^\+/.test(s)) s = s.slice(1).trim();
        if (!/^[\d.,\s]+$/.test(s) || !/\d/.test(s)) return { error: 'Type a number, such as 5 or 2.50.' };
        const bad = { error: 'That number looks mistyped. Type it like 1500 or 1,500.' };
        let whole, frac = '';
        if (/\s/.test(s)) {
            const parts = s.split(/\s+/), last = parts[parts.length - 1], dm = last.match(/^(\d{3})([.,]\d{0,2})?$/);
            if (!/^\d{1,3}$/.test(parts[0]) || !parts.slice(1, -1).every(p => /^\d{3}$/.test(p)) || !dm) return bad;
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
            if (intPart.includes(dec || '\u0000')) return bad;
            if (intPart.includes(th)) {
                const re = new RegExp('^\\d{1,3}(\\' + th + '\\d{3})+$'), ind = new RegExp('^\\d{1,2}(\\' + th + '\\d{2})*\\' + th + '\\d{3}$');
                if (!re.test(intPart) && !ind.test(intPart)) return bad;
            }
            if (!/^\d*$/.test(fracPart)) return bad;
            whole = intPart.split(th).join(''); frac = fracPart;
            if (whole === '' && frac === '') return { error: 'Type a number, such as 5 or 2.50.' };
        }
        if (frac.length > 2) return { error: 'Use at most 2 numbers after the decimal point, such as 2.50.' };
        whole = whole.replace(/^0+(?=\d)/, '') || '0';
        if (whole.length > 7) return { error: 'That amount is too big. The most is 9,999,999.99.' };
        const cents = Number(whole) * 100 + Number((frac + '00').slice(0, 2));
        if (cents === 0 && !opt.zero) return { error: 'Type an amount more than 0.' };
        if (cents > MAX) return { error: 'That amount is too big. The most is 9,999,999.99.' };
        return { cents };
    }

    function fmt(cents, cur, locale) {
        const n = Math.abs(cents);
        locale = okLocale(locale);
        let t;
        try { t = new Intl.NumberFormat(locale || undefined, { minimumFractionDigits: n % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(n / 100); }
        catch (e) { t = (n / 100).toFixed(n % 100 ? 2 : 0); }
        if (!cur) return t;
        return /^[A-Za-z]/.test(cur) || /[A-Za-z]$/.test(cur) ? cur + ' ' + t : cur + t;
    }
    // amounts in a form box: plain, 2 decimals only when needed, no thousands marks ("1500", "2.50")
    const plainAmount = c => (c % 100 ? (c / 100).toFixed(2) : String(c / 100));

    // dates
    const pad = n => String(n).padStart(2, '0');
    const dayStr = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    function toDate(s) { const [y, m, d] = s.split('-').map(Number); const t = new Date(y, m - 1, d, 12); t.setFullYear(y); return t; }
    const isDay = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && dayStr(toDate(s)) === s && s >= '2000-01-01' && s <= '2199-12-31';
    const ms = s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
    const daysBetween = (a, b) => Math.round((ms(b) - ms(a)) / 864e5);
    function addDays(s, n) { const d = new Date(ms(s) + n * 864e5); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
    const lastDayOf = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m is 1-12
    const weekday = s => new Date(ms(s)).getUTCDay();
    const okLocale = l => { try { return l ? Intl.getCanonicalLocales(l)[0] : undefined; } catch (e) { return undefined; } };
    function niceDate(s, today, locale, long) {
        locale = okLocale(locale);
        const d = toDate(s), opts = { weekday: 'short', day: 'numeric', month: 'short' };
        if (long) opts.weekday = 'long';
        if (!today || s.slice(0, 4) !== today.slice(0, 4)) opts.year = 'numeric';
        // the parts joined by spaces, so it reads the same in every browser: "Sat 17 Oct"
        try { return new Intl.DateTimeFormat(locale || undefined, opts).formatToParts(d).filter(x => x.type !== 'literal').map(x => x.value).join(' '); } catch (e) { return s; }
    }
    function dayName(s, locale) { locale = okLocale(locale); try { return toDate(s).toLocaleDateString(locale || undefined, { weekday: 'long' }); } catch (e) { return ''; } }
    const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
    const ordinal = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');

    // ---- paydays ----
    // a schedule is { freq: 'week' | '2weeks' | 'month', start: first payday }.
    // Monthly paydays keep the day of the month of the first one, and move to the last day in shorter months (31st -> 30 Apr, 28/29 Feb).
    function nthPayday(sched, i) {
        if (sched.freq === 'month') {
            const [y, m, d] = sched.start.split('-').map(Number), t = (m - 1) + i, yy = y + Math.floor(t / 12), mm = (t % 12) + 1;
            return yy + '-' + pad(mm) + '-' + pad(Math.min(d, lastDayOf(yy, mm)));
        }
        return addDays(sched.start, i * (sched.freq === '2weeks' ? 14 : 7));
    }
    // index of the first payday on or after `day`
    function firstIndexFrom(sched, day) {
        if (day <= sched.start) return 0;
        let i;
        if (sched.freq === 'month') {
            const [y, m] = sched.start.split('-').map(Number), [y2, m2] = day.split('-').map(Number);
            i = Math.max(0, (y2 - y) * 12 + (m2 - m) - 1);
        } else i = Math.max(0, Math.floor(daysBetween(sched.start, day) / (sched.freq === '2weeks' ? 14 : 7)) - 1);
        while (nthPayday(sched, i) < day) i++;
        return i;
    }
    // paydays after `after` (not counted) up to and including `upto`
    function paydaysBetween(sched, after, upto) {
        const out = [];
        if (!sched || !isDay(sched.start) || upto < sched.start) return out;
        for (let i = firstIndexFrom(sched, after ? addDays(after, 1) : sched.start); out.length < 1000; i++) {
            const p = nthPayday(sched, i);
            if (p > upto) break;
            out.push(p);
        }
        return out;
    }
    const nextPayday = (sched, today) => nthPayday(sched, firstIndexFrom(sched, addDays(today, 1)));
    function lastPayday(sched, today) {
        if (!sched || today < sched.start) return '';
        const i = firstIndexFrom(sched, addDays(today, 1));
        return i > 0 ? nthPayday(sched, i - 1) : '';
    }
    // "every Saturday" / "every 2 weeks on Saturday" / "on the 31st of every month (the last day in shorter months)"
    function schedWords(sched, locale) {
        if (sched.freq === 'month') {
            const d = Number(sched.start.slice(8));
            return 'on the ' + ordinal(d) + ' of every month' + (d > 28 ? ' (the last day in shorter months)' : '');
        }
        return (sched.freq === '2weeks' ? 'every 2 weeks on ' : 'every ') + dayName(sched.start, locale);
    }
    const perWord = f => (f === 'month' ? 'a month' : f === '2weeks' ? 'every 2 weeks' : 'a week');

    // ---- one child ----
    const sortedLog = log => log.slice().sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.seq - b.seq);
    const sign = e => (e.kind === 'out' ? -1 : 1);
    function balance(kid, upto) { return kid.log.reduce((s, e) => (upto && e.date > upto ? s : s + sign(e) * e.amount), 0); }
    // history newest first, with the balance after each entry
    function history(kid) {
        let bal = 0;
        return sortedLog(kid.log).map(e => { bal += sign(e) * e.amount; return { entry: e, after: bal }; }).reverse();
    }
    // the most that can be taken out, leaving out one entry that is being edited
    function maxOut(kid, exceptId) { return kid.log.reduce((s, e) => (e.id === exceptId ? s : s + sign(e) * e.amount), 0); }
    // chores, bonuses and money taken out since the last payday (or since the start)
    function sincePayday(kid, today) {
        const from = lastPayday(kid.sched, today) || '';
        let chores = 0, choreCount = 0, added = 0, out = 0;
        kid.log.forEach(e => {
            if (e.date < from || e.date > today) return;
            if (e.kind === 'chore') { chores += e.amount; choreCount++; } else if (e.kind === 'in') added += e.amount; else if (e.kind === 'out') out += e.amount;
        });
        return { from, chores, choreCount, added, out };
    }
    const doneOn = (kid, choreId, day) => kid.log.filter(e => e.kind === 'chore' && e.choreId === choreId && e.date === day).length;

    // savings goal: how far, how much is left, and how many paydays of pocket money that is
    function goalInfo(kid, today) {
        if (!kid.goal) return null;
        const bal = Math.max(0, balance(kid)), g = kid.goal.amount, left = Math.max(0, g - bal);
        const pct = Math.min(100, Math.floor(bal * 100 / g));
        let paydays = null, by = '';
        if (left > 0 && kid.allowance > 0) {
            paydays = Math.ceil(left / kid.allowance);
            by = nthPayday(kid.sched, firstIndexFrom(kid.sched, addDays(today, 1)) + paydays - 1);
        }
        return { name: kid.goal.name, amount: g, saved: bal, left, pct, reached: left === 0, paydays, by };
    }

    function balanceWords(kid, cur, locale) {
        const b = balance(kid);
        if (b < 0) return kid.name + ' is ' + fmt(b, cur, locale) + ' short';
        return kid.name + ' has ' + fmt(b, cur, locale);
    }
    function entryWords(e) {
        if (e.kind === 'pay') return 'Pocket money';
        if (e.kind === 'chore') return e.note || 'Chore';
        if (e.kind === 'in') return e.note ? 'Added: ' + e.note : 'Added';
        return e.note ? 'Taken out: ' + e.note : 'Taken out';
    }

    // ---- the whole family ----
    function emptyState() { return { v: 1, cur: '', seq: 0, kids: [] }; }
    const uid = st => 'k' + (++st.seq).toString(36);

    // add the pocket money for every payday since the last time the app was opened.
    // Returns [{ kid, days, total }] for the message. Paydays with no pocket money set are only marked as done.
    function runPaydays(st, today) {
        const added = [];
        st.kids.forEach(kid => {
            const days = paydaysBetween(kid.sched, kid.paidThrough, today);
            if (!days.length) return;
            kid.paidThrough = days[days.length - 1];
            if (!(kid.allowance > 0)) return;
            days.forEach(d => kid.log.push({ id: uid(st), kind: 'pay', amount: kid.allowance, date: d, seq: st.seq, note: '' }));
            added.push({ kidId: kid.id, name: kid.name, days, total: kid.allowance * days.length, each: kid.allowance });
        });
        return added;
    }
    function paydayMessage(added, cur, today, locale) {
        if (!added.length) return '';
        return 'Payday! ' + added.map(a => a.days.length === 1
            ? 'Added ' + fmt(a.each, cur, locale) + ' pocket money for ' + a.name + ' (' + niceDate(a.days[0], today, locale) + ').'
            : 'Added ' + a.days.length + ' paydays of ' + fmt(a.each, cur, locale) + ' for ' + a.name + ', ' + fmt(a.total, cur, locale) + ' in all (' + niceDate(a.days[0], today, locale) + ' to ' + niceDate(a.days[a.days.length - 1], today, locale) + ').').join(' ');
    }

    // plain text for copy, email and print
    function summaryText(st, today, locale) {
        const cur = st.cur, lines = ['Pocket money on ' + niceDate(today, today, locale, true) + ':', ''];
        st.kids.forEach(kid => {
            lines.push(balanceWords(kid, cur, locale));
            const s = sincePayday(kid, today);
            if (s.choreCount) lines.push('  Earned ' + fmt(s.chores, cur, locale) + ' from ' + plural(s.choreCount, 'chore', 'chores') + (s.from ? ' since payday (' + niceDate(s.from, today, locale) + ')' : ' so far'));
            if (kid.allowance > 0) lines.push('  Pocket money ' + fmt(kid.allowance, cur, locale) + ' ' + schedWords(kid.sched, locale) + ', next on ' + niceDate(nextPayday(kid.sched, today), today, locale));
            const g = goalInfo(kid, today);
            if (g) lines.push('  Saving for ' + g.name + ': ' + fmt(g.saved > g.amount ? g.amount : g.saved, cur, locale) + ' of ' + fmt(g.amount, cur, locale) + (g.reached ? ' (reached!)' : ', ' + fmt(g.left, cur, locale) + ' to go'));
            lines.push('');
        });
        return lines.join('\n').trim();
    }

    // ---- saved data: check every value, drop what is broken ----
    const str = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b-\u001f]/g, '').trim().slice(0, max) : '');
    const money = (v, zero) => Number.isInteger(v) && v <= MAX && (zero ? v >= 0 : v > 0);
    function normalize(raw) {
        if (!raw || typeof raw !== 'object' || !Array.isArray(raw.kids)) return null;
        const st = emptyState();
        st.cur = SYMBOLS.includes(raw.cur) ? raw.cur : '';
        let seq = Number.isInteger(raw.seq) && raw.seq > 0 ? raw.seq : 0;
        const ids = new Set();
        const fresh = id => { let x = typeof id === 'string' && /^[\w-]{1,20}$/.test(id) && !ids.has(id) ? id : 'r' + (++seq).toString(36); while (ids.has(x)) x = 'r' + (++seq).toString(36); ids.add(x); return x; };
        raw.kids.slice(0, 20).forEach(k => {
            if (!k || typeof k !== 'object') return;
            const name = str(k.name, NAME_MAX);
            if (!name || st.kids.some(o => o.name.toLowerCase() === name.toLowerCase())) return;
            const sc = k.sched && typeof k.sched === 'object' ? k.sched : {};
            const sched = { freq: FREQS[sc.freq] ? sc.freq : 'week', start: isDay(sc.start) ? sc.start : '' };
            if (!sched.start) return;
            const kid = { id: fresh(k.id), name, allowance: money(k.allowance, true) ? k.allowance : 0, sched,
                paidThrough: isDay(k.paidThrough) ? k.paidThrough : addDays(sched.start, -1), goal: null, chores: [], log: [] };
            if (k.goal && typeof k.goal === 'object' && str(k.goal.name, NAME_MAX) && money(k.goal.amount)) kid.goal = { name: str(k.goal.name, NAME_MAX), amount: k.goal.amount };
            (Array.isArray(k.chores) ? k.chores : []).slice(0, 60).forEach(c => {
                if (c && str(c.name, NAME_MAX) && money(c.value, true)) kid.chores.push({ id: fresh(c.id), name: str(c.name, NAME_MAX), value: c.value });
            });
            (Array.isArray(k.log) ? k.log : []).slice(0, 20000).forEach(e => {
                if (!e || !KINDS[e.kind] || !isDay(e.date) || !money(e.amount, e.kind === 'chore')) return;
                const n = Number.isInteger(e.seq) && e.seq > 0 ? e.seq : ++seq;
                if (n > seq) seq = n;
                const x = { id: fresh(e.id), kind: e.kind, amount: e.amount, date: e.date, seq: n, note: str(e.note, NOTE_MAX) };
                if (e.kind === 'chore' && typeof e.choreId === 'string') x.choreId = e.choreId.slice(0, 20);
                kid.log.push(x);
            });
            st.kids.push(kid);
        });
        st.seq = seq + 1;
        return st;
    }

    const api = { MAX, SYMBOLS, FREQS, KINDS, NAME_MAX, NOTE_MAX, parseAmount, fmt, plainAmount, dayStr, isDay, toDate, addDays, daysBetween, weekday, niceDate, dayName, plural, ordinal,
        nthPayday, paydaysBetween, nextPayday, lastPayday, schedWords, perWord, balance, history, maxOut, sincePayday, doneOn, goalInfo, balanceWords, entryWords,
        emptyState, uid, runPaydays, paydayMessage, summaryText, normalize };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PMC = api;
})(this);
