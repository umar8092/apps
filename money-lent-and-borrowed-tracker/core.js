// Money Lent and Borrowed Tracker: the maths and the words, with no page code, so tests.js can check it in node.
// Amounts are whole cents (hundredths) so nothing is ever off by a rounding error.
// Dates are calendar days ('2026-10-14'), so time zones and summer time never move an entry to another day.
(function (root) {
    'use strict';
    const MAX = 999999999999; // 9,999,999,999.99 in cents
    const KINDS = {
        lent: { sign: 1, me: 'I lent them money', short: 'Lent', past: 'You lent' },
        repaid: { sign: -1, me: 'They paid me back', short: 'Paid you back', past: 'They paid you back' },
        borrowed: { sign: -1, me: 'I borrowed from them', short: 'Borrowed', past: 'You borrowed' },
        paid: { sign: 1, me: 'I paid them back', short: 'You paid back', past: 'You paid back' }
    };
    const SYMBOLS = ['', '$', '€', '£', '₹', 'Rs', '¥', '₩', '₦', '₱', 'R', 'kr', 'CHF', 'AED', 'SAR', 'RM', 'Rp', '৳', '₺', 'R$', 'zł', '₽', '₴', 'KSh', '₵', 'E£', 'A$', 'C$'];

    // "2,500" "2.500" "2 500" "1,00,000" "12.5" "12,50" "$40" "Rs 1500" -> cents, or { error }
    function parseAmount(text) {
        let s = String(text == null ? '' : text).replace(/[   ']/g, ' ').trim();
        if (!s) return { error: 'Type the amount, such as 2500.' };
        s = s.replace(/^(rs\.?|inr|usd|eur|gbp|pkr|aed|sar|[$€£₹¥₩₦₱৳₺₽₴])\s*/i, '').replace(/\s*(rs\.?|[$€£₹¥₩₦₱৳₺₽₴])$/i, '').trim();
        if (/^[-−–]/.test(s)) return { error: 'Type the amount without a minus sign. To record money coming back, choose "They paid me back" or "I paid them back".' };
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
        if (whole.length > 10) return { error: 'That amount is too big. The most is 9,999,999,999.99.' };
        const cents = Number(whole) * 100 + Number((frac + '00').slice(0, 2));
        if (cents === 0) return { error: 'Type an amount more than 0.' };
        if (cents > MAX) return { error: 'That amount is too big. The most is 9,999,999,999.99.' };
        return { cents };
    }

    function fmt(cents, cur, locale) {
        const n = Math.abs(cents);
        let t;
        try { t = new Intl.NumberFormat(locale || undefined, { minimumFractionDigits: n % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(n / 100); }
        catch (e) { t = (n / 100).toFixed(n % 100 ? 2 : 0); }
        if (!cur) return t;
        return /^[A-Za-z]/.test(cur) || /[A-Za-z]$/.test(cur) ? cur + ' ' + t : cur + t;
    }

    // dates
    const pad = n => String(n).padStart(2, '0');
    const dayStr = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    const isDay = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && dayStr(toDate(s)) === s;
    function toDate(s) { const [y, m, d] = s.split('-').map(Number); const t = new Date(y, m - 1, d, 12); t.setFullYear(y); return t; }
    function daysBetween(a, b) { return Math.round((Date.UTC(...b.split('-').map((v, i) => i === 1 ? v - 1 : +v)) - Date.UTC(...a.split('-').map((v, i) => i === 1 ? v - 1 : +v))) / 864e5); }
    function niceDate(s, today, locale) {
        const d = toDate(s), opts = { day: 'numeric', month: 'short' };
        if (!today || s.slice(0, 4) !== today.slice(0, 4)) opts.year = 'numeric';
        try { return d.toLocaleDateString(locale || undefined, opts); } catch (e) { return s; }
    }
    const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

    function sorted(entries) { return entries.slice().sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.seq - b.seq); }

    // one person: balance (>0 they owe you, <0 you owe them), running balance per entry, and the pay-back-by date that still counts
    function personSummary(person, today) {
        let bal = 0, dues = [], lent = 0, repaid = 0, borrowed = 0, paid = 0, last = '';
        const rows = sorted(person.entries).map(e => {
            bal += KINDS[e.kind].sign * e.amount;
            if (e.kind === 'lent') lent += e.amount; else if (e.kind === 'repaid') repaid += e.amount; else if (e.kind === 'borrowed') borrowed += e.amount; else paid += e.amount;
            if (e.due && (e.kind === 'lent' || e.kind === 'borrowed')) dues.push({ due: e.due, dir: e.kind === 'lent' ? 1 : -1 });
            if (bal <= 0) dues = dues.filter(d => d.dir !== 1);
            if (bal >= 0) dues = dues.filter(d => d.dir !== -1);
            if (e.date > last) last = e.date;
            return { entry: e, after: bal };
        });
        const open = dues.filter(d => d.dir === Math.sign(bal)).map(d => d.due).sort();
        const due = open[0] || '';
        const daysLeft = due && today ? daysBetween(today, due) : null;
        return { balance: bal, rows, due, daysLeft, overdue: daysLeft != null && daysLeft < 0, lent, repaid, borrowed, paid, last, count: person.entries.length };
    }

    // "Bilal owes you 3,500" / "You owe Sara 2,000" / "You and Ali are settled up"
    function balanceWords(name, bal, cur, locale) {
        if (bal > 0) return name + ' owes you ' + fmt(bal, cur, locale);
        if (bal < 0) return 'You owe ' + name + ' ' + fmt(bal, cur, locale);
        return 'You and ' + name + ' are settled up';
    }
    function dueWords(s, today, locale) {
        if (!s.due) return '';
        const who = s.balance > 0 ? 'Pay back by ' : 'You said you would pay back by ';
        const d = niceDate(s.due, today, locale), n = s.daysLeft;
        return who + d + (n < 0 ? ' (' + plural(-n, 'day', 'days') + ' late)' : n === 0 ? ' (today)' : n === 1 ? ' (tomorrow)' : ' (' + plural(n, 'day', 'days') + ' left)');
    }

    const curOf = (state, p) => (p.cur == null ? state.cur : p.cur);

    // totals for everyone, grouped by currency so different currencies are never added together
    function totals(state, today) {
        const toMe = {}, iOwe = {}, order = [];
        let nToMe = 0, nIOwe = 0, nSettled = 0, nLate = 0;
        state.people.forEach(p => {
            const s = personSummary(p, today), c = curOf(state, p);
            if (!order.includes(c)) order.push(c);
            if (s.balance > 0) { toMe[c] = (toMe[c] || 0) + s.balance; nToMe++; }
            else if (s.balance < 0) { iOwe[c] = (iOwe[c] || 0) - s.balance; nIOwe++; }
            else nSettled++;
            if (s.overdue) nLate++;
        });
        const list = m => order.filter(c => m[c]).map(c => ({ cur: c, cents: m[c] }));
        return { toMe: list(toMe), iOwe: list(iOwe), nToMe, nIOwe, nSettled, nLate, people: state.people.length };
    }
    function moneyList(list, locale) { return list.length ? list.map(x => fmt(x.cents, x.cur, locale)).join(' + ') : fmt(0, list.cur, locale); }

    // what is still open, in plain words, for a reminder: "5,000 on 3 Oct, 1,500 paid back on 10 Oct"
    function historyWords(person, cur, today, locale, sinceSettled) {
        let rows = personSummary(person, today).rows;
        if (sinceSettled) { let k = 0; rows.forEach((r, i) => { if (r.after === 0) k = i + 1; }); rows = rows.slice(k); }
        return rows.map(r => {
            const e = r.entry, a = fmt(e.amount, cur, locale), d = niceDate(e.date, today, locale);
            const n = e.note ? ' (' + e.note + ')' : '';
            return e.kind === 'lent' ? a + ' I lent you on ' + d + n : e.kind === 'repaid' ? a + ' you paid back on ' + d + n
                : e.kind === 'borrowed' ? a + ' I borrowed on ' + d + n : a + ' I paid back on ' + d + n;
        });
    }
    function reminderText(state, person, today, locale) {
        const s = personSummary(person, today), cur = curOf(state, person), first = person.name.split(' ')[0];
        const amt = fmt(s.balance, cur, locale), h = historyWords(person, cur, today, locale, true);
        if (s.balance > 0) {
            let t = 'Hi ' + first + ', just a friendly reminder about the ' + amt + ' you still owe me';
            t += h.length > 1 ? ' (' + h.join(', ') + ').' : h.length ? ' (' + h[0] + ').' : '.';
            if (s.due) t += s.overdue ? ' It was due back on ' + niceDate(s.due, today, locale) + '.' : ' Could you pay it back by ' + niceDate(s.due, today, locale) + '?';
            else t += ' Could you let me know when you can pay it back?';
            return t + ' Thanks!';
        }
        if (s.balance < 0) {
            let t = 'Hi ' + first + ', just so we both have the same note: I owe you ' + amt;
            t += h.length ? ' (' + h.join(', ') + ').' : '.';
            t += s.due ? ' I will pay it back by ' + niceDate(s.due, today, locale) + '.' : ' I will pay it back soon.';
            return t + ' Thanks!';
        }
        return 'Hi ' + first + ', we are all settled up now. Thanks!';
    }
    function statementText(state, person, today, locale) {
        const s = personSummary(person, today), cur = curOf(state, person);
        const lines = ['Money with ' + person.name, balanceWords(person.name, s.balance, cur, locale) + '.'];
        const dw = dueWords(s, today, locale); if (dw) lines.push(dw + '.');
        lines.push('');
        s.rows.forEach(r => {
            const e = r.entry;
            lines.push(niceDate(e.date, today, locale) + ': ' + KINDS[e.kind].past + ' ' + fmt(e.amount, cur, locale) + (e.note ? ' (' + e.note + ')' : '') +
                '. After this: ' + (r.after > 0 ? 'owes you ' + fmt(r.after, cur, locale) : r.after < 0 ? 'you owe ' + fmt(r.after, cur, locale) : 'settled') + '.');
        });
        return lines.join('\n');
    }
    function summaryText(state, today, locale) {
        const t = totals(state, today), lines = ['Money lent and borrowed, ' + niceDate(today, '', locale)];
        lines.push('Owed to you: ' + (t.toMe.length ? moneyList(t.toMe, locale) + ' from ' + plural(t.nToMe, 'person', 'people') : 'nothing'));
        lines.push('You owe: ' + (t.iOwe.length ? moneyList(t.iOwe, locale) + ' to ' + plural(t.nIOwe, 'person', 'people') : 'nothing'));
        lines.push('');
        sortPeople(state, 'owed', today).forEach(p => {
            const s = personSummary(p, today), dw = dueWords(s, today, locale);
            lines.push('- ' + balanceWords(p.name, s.balance, curOf(state, p), locale) + (dw ? ' (' + dw.charAt(0).toLowerCase() + dw.slice(1) + ')' : ''));
        });
        return lines.join('\n');
    }

    // order: "owed" = biggest balances first then settled, "name" = A to Z, "recent" = latest entry first
    function sortPeople(state, by, today) {
        const info = state.people.map((p, i) => ({ p, i, s: personSummary(p, today) }));
        const byName = (a, b) => a.p.name.localeCompare(b.p.name, undefined, { sensitivity: 'base' }) || a.i - b.i;
        info.sort(by === 'name' ? byName : by === 'recent' ? (a, b) => (a.s.last < b.s.last ? 1 : a.s.last > b.s.last ? -1 : byName(a, b))
            : (a, b) => ((b.s.balance !== 0) - (a.s.balance !== 0)) || (Math.abs(b.s.balance) - Math.abs(a.s.balance)) || byName(a, b));
        return info.map(x => x.p);
    }

    const cleanName = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, 60);
    const sameName = (a, b) => cleanName(a).toLocaleLowerCase() === cleanName(b).toLocaleLowerCase();
    const cleanNote = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, 200);

    function emptyState() { return { v: 1, cur: '', sort: 'owed', seq: 0, people: [] }; }
    // anything saved or restored is checked: bad people or entries are dropped, never crash the app
    function normalize(raw) {
        const s = emptyState();
        if (!raw || typeof raw !== 'object' || !Array.isArray(raw.people)) return null;
        if (SYMBOLS.includes(raw.cur)) s.cur = raw.cur;
        if (['owed', 'name', 'recent'].includes(raw.sort)) s.sort = raw.sort;
        let seq = 0; const ids = new Set();
        raw.people.forEach(p => {
            if (!p || typeof p !== 'object') return;
            const name = cleanName(p.name); if (!name || s.people.some(q => sameName(q.name, name))) return;
            let id = typeof p.id === 'string' && /^[\w-]{1,40}$/.test(p.id) && !ids.has(p.id) ? p.id : 'p' + (ids.size + 1) + '-' + Math.random().toString(36).slice(2, 7);
            ids.add(id);
            const person = { id, name, cur: p.cur == null || !SYMBOLS.includes(p.cur) ? null : p.cur, entries: [] };
            (Array.isArray(p.entries) ? p.entries : []).forEach(e => {
                if (!e || typeof e !== 'object' || !KINDS[e.kind] || !Number.isInteger(e.amount) || e.amount <= 0 || e.amount > MAX || !isDay(e.date)) return;
                const ent = { id: typeof e.id === 'string' && /^[\w-]{1,40}$/.test(e.id) ? e.id : 'e' + (++seq), kind: e.kind, amount: e.amount, date: e.date,
                    seq: Number.isInteger(e.seq) && e.seq >= 0 ? e.seq : ++seq, note: cleanNote(e.note) };
                if ((e.kind === 'lent' || e.kind === 'borrowed') && isDay(e.due) && e.due >= e.date) ent.due = e.due;
                seq = Math.max(seq, ent.seq);
                person.entries.push(ent);
            });
            s.people.push(person);
        });
        s.seq = Math.max(seq, Number.isInteger(raw.seq) ? raw.seq : 0);
        return s;
    }

    const api = { KINDS, SYMBOLS, MAX, parseAmount, fmt, dayStr, isDay, toDate, daysBetween, niceDate, plural, sorted, personSummary, balanceWords, dueWords, curOf,
        totals, moneyList, reminderText, statementText, summaryText, sortPeople, cleanName, sameName, cleanNote, emptyState, normalize };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.MLB = api;
})(this);
