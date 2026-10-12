// Expense and budget maths, no page code. Money is whole cents and dates are plain calendar dates ("2026-10-12"),
// so totals are exact and time zones never move a spend to another day.
(function (root) {
    const MAX_AMOUNT = 1000000000;  // 10,000,000.00 for one expense or one budget
    const MAX_ENTRIES = 20000;
    const MAX_CATS = 30;
    const MAX_PARTS = 8;
    const MAX_NAME = 40;
    const MAX_NOTE = 80;
    const SYMBOLS = ['', '$', '€', '£', '₹', 'Rs', '¥', '₩', '₦', '₱', 'R', 'kr', 'CHF', 'AED', 'SAR', 'RM'];
    const COLORS = ['#22c55e', '#f97316', '#3b82f6', '#a855f7', '#ec4899', '#ef4444', '#eab308', '#14b8a6', '#6366f1', '#84cc16', '#06b6d4', '#f43f5e'];
    const DEFAULT_CATS = ['Groceries', 'Eating out', 'Transport', 'Home and bills', 'Shopping', 'Health', 'Fun', 'Other'];
    const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const pad = n => String(n).padStart(2, '0');

    // Reads what people type or paste: "12.50", "12,50", "$1,299.00", "1.299,00 €". Returns { cents }, { blank } or { err }.
    function parseAmount(v) {
        let s = String(v == null ? '' : v).trim();
        if (!s) return { blank: true };
        if (/^-|-\s*\d|\d\s*-$/.test(s)) return { err: 'negative' };
        s = s.replace(/[^\d.,]/g, '');
        if (!/\d/.test(s)) return { err: 'nan' };
        const lastDot = s.lastIndexOf('.'), lastComma = s.lastIndexOf(',');
        if (lastDot >= 0 && lastComma >= 0) {
            const dec = lastDot > lastComma ? '.' : ',', other = dec === '.' ? ',' : '.';
            s = s.split(other).join('');
            if (s.split(dec).length > 2) return { err: 'nan' };
            s = s.replace(dec, '.');
        } else if (lastComma >= 0) {
            s = /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : (s.split(',').length === 2 ? s.replace(',', '.') : null);
        } else if (lastDot >= 0 && s.split('.').length > 2) {
            s = /^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, '') : null;
        }
        if (s == null || !/^\d*\.?\d*$/.test(s) || s === '.') return { err: 'nan' };
        const [w, f = ''] = s.split('.');
        if (w.replace(/^0+/, '').length > 8) return { err: 'big' };
        const f3 = (f + '000').slice(0, 3);
        const cents = parseInt(w || '0', 10) * 100 + parseInt(f3.slice(0, 2), 10) + (+f3[2] >= 5 ? 1 : 0);
        return cents > MAX_AMOUNT ? { err: 'big' } : { cents };
    }

    function fmt(cents, sym) {
        const neg = cents < 0, c = Math.abs(Math.round(cents));
        const s = String(Math.floor(c / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + pad(c % 100);
        const p = !sym ? '' : /[A-Za-z]$/.test(sym) ? sym + ' ' : sym;
        return (neg ? '-' : '') + p + s;
    }
    const plain = cents => (cents / 100).toFixed(2);

    // ---- calendar dates as day numbers (days since 1970-01-01), never shifted by time zones
    function validDate(s) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
        if (!m) return false;
        const y = +m[1], mo = +m[2], d = +m[3];
        return y >= 2000 && y <= 2100 && mo >= 1 && mo <= 12 && d >= 1 && d <= daysIn(y, mo);
    }
    const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
    const parts = s => s.split('-').map(Number);
    const dayNum = s => { const [y, m, d] = parts(s); return Math.round(Date.UTC(y, m - 1, d) / 864e5); };
    const fromNum = n => { const t = new Date(n * 864e5); return t.getUTCFullYear() + '-' + pad(t.getUTCMonth() + 1) + '-' + pad(t.getUTCDate()); };
    const mk = (y, m, d) => { while (m < 1) { m += 12; y--; } while (m > 12) { m -= 12; y++; } return y + '-' + pad(m) + '-' + pad(d); };
    // today's date on this device, as the person sees it on their calendar
    const today = (now = new Date()) => now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());

    // The budget month a date belongs to. startDay 1 = calendar months; 25 = from the 25th to the 24th of the next month.
    function periodOf(date, startDay = 1) {
        const [y, m, d] = parts(date);
        const start = d >= startDay ? mk(y, m, startDay) : mk(y, m - 1, startDay);
        const [sy, sm] = parts(start);
        const end = fromNum(dayNum(mk(sy, sm + 1, startDay)) - 1);
        return { start, end, days: dayNum(end) - dayNum(start) + 1 };
    }
    // The budget month n months before (negative) or after (positive) the one starting on `start`
    function shiftPeriod(start, n, startDay = 1) {
        const [y, m] = parts(start);
        return periodOf(mk(y, m + n, startDay), startDay);
    }
    function periodLabel(p, startDay = 1) {
        const [sy, sm, sd] = parts(p.start), [ey, em, ed] = parts(p.end);
        if (startDay === 1) return MONTHS[sm - 1] + ' ' + sy;
        const short = (mo) => MONTHS[mo - 1].slice(0, 3);
        return sd + ' ' + short(sm) + (sy !== ey ? ' ' + sy : '') + ' – ' + ed + ' ' + short(em) + ' ' + ey;
    }
    function dayLabel(date, withYear) {
        const [y, m, d] = parts(date), wd = DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
        return wd + ' ' + d + ' ' + MONTHS[m - 1].slice(0, 3) + (withYear ? ' ' + y : '');
    }

    // ---- saved data
    const newId = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    function defaults() {
        return { v: 1, cur: '', startDay: 1, cats: DEFAULT_CATS.map((name, i) => ({ id: i === DEFAULT_CATS.length - 1 ? 'other' : 'c' + i, name, budget: null, color: i === DEFAULT_CATS.length - 1 ? '#94a3b8' : COLORS[i % COLORS.length] })), entries: [] };
    }
    const okCents = (n, min) => Number.isInteger(n) && n >= min && n <= MAX_AMOUNT;
    const str = (v, max) => typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';
    // Cleans saved or restored data: anything wrong is dropped or set back to a safe value.
    function clean(raw) {
        const s = defaults();
        if (!raw || typeof raw !== 'object') return s;
        if (SYMBOLS.includes(raw.cur)) s.cur = raw.cur;
        if (Number.isInteger(raw.startDay) && raw.startDay >= 1 && raw.startDay <= 28) s.startDay = raw.startDay;
        if (Array.isArray(raw.cats)) {
            const cats = [], ids = new Set(), names = new Set();
            raw.cats.forEach(c => {
                if (!c || typeof c !== 'object' || cats.length >= MAX_CATS) return;
                const id = typeof c.id === 'string' && /^[\w-]{1,40}$/.test(c.id) ? c.id : null, name = str(c.name, MAX_NAME);
                if (!id || !name || ids.has(id) || names.has(name.toLowerCase())) return;
                ids.add(id); names.add(name.toLowerCase());
                cats.push({ id, name, budget: okCents(c.budget, 0) ? c.budget : null, color: /^#[0-9a-f]{6}$/i.test(c.color) ? c.color : COLORS[cats.length % COLORS.length] });
            });
            if (!ids.has('other')) {
                if (cats.length >= MAX_CATS) cats.pop();
                cats.push({ id: 'other', name: names.has('other') ? 'Other spending' : 'Other', budget: null, color: '#94a3b8' });
            }
            if (cats.length) s.cats = cats;
        }
        const catIds = new Set(s.cats.map(c => c.id));
        if (Array.isArray(raw.entries)) {
            const ids = new Set();
            raw.entries.forEach(e => {
                if (!e || typeof e !== 'object' || s.entries.length >= MAX_ENTRIES || !validDate(e.date) || !Array.isArray(e.parts)) return;
                const ps = [];
                e.parts.slice(0, MAX_PARTS).forEach(p => { if (p && okCents(p.cents, 1)) ps.push({ cat: catIds.has(p.cat) ? p.cat : 'other', cents: p.cents }); });
                const merged = mergeParts(ps);
                if (!merged.length || merged.reduce((a, p) => a + p.cents, 0) > MAX_AMOUNT) return;
                let id = typeof e.id === 'string' && /^[\w-]{1,40}$/.test(e.id) ? e.id : newId('e');
                while (ids.has(id)) id = newId('e');
                ids.add(id);
                s.entries.push({ id, date: e.date, note: str(e.note, MAX_NOTE), refund: e.refund === true, parts: merged });
            });
        }
        return s;
    }
    // Same category twice in one split becomes one part
    function mergeParts(ps) {
        const out = [];
        ps.forEach(p => { const m = out.find(o => o.cat === p.cat); if (m) m.cents += p.cents; else out.push({ cat: p.cat, cents: p.cents }); });
        return out;
    }

    // A split: the parts must add up to the amount. One part may be left empty and gets the rest.
    // parts: [{ cat, cents|null }]. Returns { parts } or { err, assigned, rest }.
    function resolveSplit(total, ps) {
        const blanks = ps.filter(p => p.cents == null);
        const assigned = ps.reduce((a, p) => a + (p.cents || 0), 0);
        if (blanks.length > 1) return { err: 'blanks', assigned, rest: total - assigned };
        if (blanks.length === 1) {
            const rest = total - assigned;
            if (rest <= 0) return { err: rest === 0 ? 'nothing-left' : 'over', assigned, rest };
            return { parts: mergeParts(ps.map(p => ({ cat: p.cat, cents: p.cents == null ? rest : p.cents })).filter(p => p.cents > 0)) };
        }
        if (assigned !== total) return { err: assigned > total ? 'over' : 'short', assigned, rest: total - assigned };
        return { parts: mergeParts(ps.filter(p => p.cents > 0)) };
    }

    const entryTotal = e => e.parts.reduce((a, p) => a + p.cents, 0);
    const signed = e => e.refund ? -entryTotal(e) : entryTotal(e);
    const inPeriod = (e, p) => e.date >= p.start && e.date <= p.end;

    // Everything the summary shows for one budget month. todayStr decides the days left (only for the month that holds today).
    function summary(state, period, todayStr) {
        const cats = state.cats.map(c => ({ id: c.id, name: c.name, color: c.color, budget: c.budget, spent: 0, refunds: 0, count: 0 }));
        const byId = Object.fromEntries(cats.map(c => [c.id, c]));
        let count = 0, refunds = 0;
        state.entries.forEach(e => {
            if (!inPeriod(e, period)) return;
            count++;
            e.parts.forEach(p => {
                const c = byId[p.cat] || byId.other; c.count++;
                if (e.refund) { c.spent -= p.cents; c.refunds += p.cents; refunds += p.cents; } else c.spent += p.cents;
            });
        });
        let spent = 0, budget = null, budgetedSpent = 0;
        cats.forEach(c => {
            spent += c.spent;
            if (c.budget != null) { budget = (budget || 0) + c.budget; budgetedSpent += c.spent; c.left = c.budget - c.spent; }
            c.status = c.budget == null ? 'none' : c.spent > c.budget ? 'over' : c.spent > 0 && c.spent * 100 >= c.budget * 80 ? 'near' : 'ok';
            c.pct = c.budget == null ? null : c.budget === 0 ? (c.spent > 0 ? 100 : 0) : Math.max(0, Math.min(100, c.spent * 100 / c.budget));
        });
        const s = { period, count, refunds, spent, budget, cats, unbudgeted: spent - budgetedSpent };
        s.left = budget == null ? null : budget - spent;
        const t = todayStr && todayStr >= period.start && todayStr <= period.end ? todayStr : null;
        s.isCurrent = !!t;
        s.isPast = !!todayStr && todayStr > period.end;
        s.daysLeft = t ? dayNum(period.end) - dayNum(t) + 1 : null;  // today counts as a day left
        s.perDay = t && s.left > 0 ? Math.floor(s.left / s.daysLeft) : null;  // rounded down so it never overspends
        return s;
    }

    // Entries of one budget month, newest day first, then newest added first
    function entriesIn(state, period, catId) {
        return state.entries.map((e, i) => ({ e, i }))
            .filter(x => inPeriod(x.e, period) && (!catId || x.e.parts.some(p => p.cat === catId)))
            .sort((a, b) => a.e.date < b.e.date ? 1 : a.e.date > b.e.date ? -1 : b.i - a.i)
            .map(x => x.e);
    }

    // Plain-text summary for copy, email and print
    function summaryText(state, period, todayStr, sym) {
        const s = summary(state, period, todayStr), f = c => fmt(c, sym), lines = [];
        lines.push('Spending for ' + periodLabel(period, state.startDay));
        if (s.budget == null) lines.push('Spent ' + f(s.spent) + '.');
        else lines.push('Spent ' + f(s.spent) + ' of a ' + f(s.budget) + ' budget. ' + (s.left >= 0 ? f(s.left) + ' left.' : f(-s.left) + ' over.'));
        if (s.perDay != null) lines.push('That is ' + f(s.perDay) + ' a day for the ' + s.daysLeft + (s.daysLeft === 1 ? ' day' : ' days') + ' left.');
        lines.push('');
        s.cats.filter(c => c.count || c.budget != null).forEach(c => {
            lines.push(c.name + ': ' + f(c.spent) + (c.budget == null ? '' : ' of ' + f(c.budget) + (c.left >= 0 ? ' (' + f(c.left) + ' left)' : ' (' + f(-c.left) + ' over)')));
        });
        const list = entriesIn(state, period);
        if (list.length) {
            lines.push('', 'Expenses:');
            const names = Object.fromEntries(state.cats.map(c => [c.id, c.name]));
            list.forEach(e => lines.push(dayLabel(e.date) + '  ' + (e.refund ? '-' : '') + f(entryTotal(e)) + '  ' + e.parts.map(p => names[p.cat] + (e.parts.length > 1 ? ' ' + f(p.cents) : '')).join(' + ') + (e.refund ? ' (refund)' : '') + (e.note ? '  ' + e.note : '')));
        }
        return lines.join('\n');
    }

    const api = { MAX_AMOUNT, MAX_ENTRIES, MAX_CATS, MAX_PARTS, MAX_NAME, MAX_NOTE, SYMBOLS, COLORS, DEFAULT_CATS, parseAmount, fmt, plain, validDate, daysIn, dayNum, fromNum, today,
        periodOf, shiftPeriod, periodLabel, dayLabel, defaults, clean, mergeParts, resolveSplit, entryTotal, signed, summary, entriesIn, summaryText, newId };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ExpenseCore = api;
})(this);
