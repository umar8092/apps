// Net worth maths, no page code. Money is whole cents and dates are plain calendar dates ("2026-10-16"),
// so every total is exact and time zones never move an update to another day.
// An update ("entry") holds the balance of each account on one date. An account missing from an entry keeps
// its balance from the entry before (carried forward); an account with no balance at or before an entry did not exist yet.
(function (root) {
    const MAX_AMOUNT = 10000000000000;   // 100,000,000,000.00 per account
    const MAX_ACCOUNTS = 50;
    const MAX_ENTRIES = 1200;            // 100 years of monthly updates
    const MAX_NAME = 40;
    const SYMBOLS = ['', '$', '€', '£', '₹', 'Rs', '¥', '₩', '₦', '₱', 'R', 'kr', 'CHF', 'AED', 'SAR', 'RM'];
    // what each kind of account is called, whether it is owned or owed, and the word for its amount
    const KINDS = {
        cash: { side: 'own', name: 'Bank / cash', word: 'Balance' },
        savings: { side: 'own', name: 'Savings', word: 'Balance' },
        invest: { side: 'own', name: 'Investments', word: 'Worth now' },
        pension: { side: 'own', name: 'Pension / retirement', word: 'Worth now' },
        home: { side: 'own', name: 'Home / property', word: 'Worth about' },
        vehicle: { side: 'own', name: 'Car / vehicle', word: 'Worth about' },
        ownother: { side: 'own', name: 'Something else I own', word: 'Worth about' },
        mortgage: { side: 'owe', name: 'Mortgage', word: 'Still owed' },
        loan: { side: 'owe', name: 'Loan', word: 'Still owed' },
        card: { side: 'owe', name: 'Credit card', word: 'Still owed' },
        oweother: { side: 'owe', name: 'Other money I owe', word: 'Still owed' }
    };
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const pad = n => String(n).padStart(2, '0');

    // Reads what people type or paste: "12.50", "12,50", "$1,299.00", "1.299,00 €", "-250" (an overdrawn account).
    // Returns { cents }, { blank } or { err: 'nan' | 'big' }.
    function parseAmount(v) {
        let s = String(v == null ? '' : v).trim().replace(/[−‒–—]/g, '-');
        if (!s) return { blank: true };
        if (/\d\s*-\s*\d/.test(s)) return { err: 'nan' };
        const neg = /^\(.*\)$/.test(s) || /^[^\d]*-/.test(s) || /\d\s*-\s*[^\d]*$/.test(s);
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
        if (w.replace(/^0+/, '').length > 12) return { err: 'big' };
        const f3 = (f + '000').slice(0, 3);
        const cents = parseInt(w || '0', 10) * 100 + parseInt(f3.slice(0, 2), 10) + (+f3[2] >= 5 ? 1 : 0);
        if (cents > MAX_AMOUNT) return { err: 'big' };
        return { cents: neg && cents ? -cents : cents };
    }

    function fmt(cents, sym) {
        const neg = cents < 0, c = Math.abs(Math.round(cents));
        const s = String(Math.floor(c / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + pad(c % 100);
        const p = !sym ? '' : /[A-Za-z]$/.test(sym) ? sym + ' ' : sym;
        return (neg ? '-' : '') + p + s;
    }
    // the number as it goes back into a box to edit: "1310.20", "-45.50", "9200", "0"
    const plain = cents => (cents / 100).toFixed(2).replace(/\.00$/, '');

    // ---- calendar dates
    const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
    function validDate(s) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
        if (!m) return false;
        const y = +m[1], mo = +m[2], d = +m[3];
        return y >= 1950 && y <= 2150 && mo >= 1 && mo <= 12 && d >= 1 && d <= daysIn(y, mo);
    }
    const parts = s => s.split('-').map(Number);
    const dayNum = s => { const [y, m, d] = parts(s); return Math.round(Date.UTC(y, m - 1, d) / 864e5); };
    const today = (now = new Date()) => now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
    // k months after (or before, k < 0) a date; a day missing in that month becomes its last day (31 Mar - 1 month = 28 Feb)
    function addMonths(s, k) {
        const [y, m, d] = parts(s), t = (y * 12 + (m - 1)) + k, ny = Math.floor(t / 12), nm = t - ny * 12 + 1;
        return ny + '-' + pad(nm) + '-' + pad(Math.min(d, daysIn(ny, nm)));
    }
    const dateText = s => { const [y, m, d] = parts(s); return d + ' ' + MONTHS[m - 1] + ' ' + y; };
    const shortDate = s => { const [y, m] = parts(s); return MONTHS[m - 1] + ' ' + String(y).slice(2); };

    // ---- entries
    const side = acc => (KINDS[acc.kind] || KINDS.ownother).side;
    function indexOf(state, date) { return state.entries.findIndex(e => e.date === date); }
    // the last entry on or before a date (-1 if none)
    function atOrBefore(state, date) {
        let i = -1;
        state.entries.forEach((e, k) => { if (e.date <= date) i = k; });
        return i;
    }
    // balance of an account in entry i, carried from earlier entries; null when it had no balance yet
    function valueAt(state, id, i) {
        for (let k = i; k >= 0; k--) { const v = state.entries[k].values[id]; if (v !== undefined) return v; }
        return null;
    }
    function totalsAt(state, i) {
        let own = 0, owe = 0;
        if (i >= 0) state.accounts.forEach(a => { const v = valueAt(state, a.id, i) || 0; if (side(a) === 'own') own += v; else owe += v; });
        return { own, owe, net: own - owe };
    }
    // what changed from the entry before i: the difference in net worth, and the part of it from accounts that are new since
    function changeAt(state, i) {
        if (i <= 0) return null;
        const t = totalsAt(state, i), p = totalsAt(state, i - 1);
        const added = [];
        state.accounts.forEach(a => {
            const now = valueAt(state, a.id, i);
            if (now !== null && valueAt(state, a.id, i - 1) === null) added.push({ acc: a, effect: side(a) === 'own' ? now : -now });
        });
        return { diff: t.net - p.net, since: state.entries[i - 1].date, added, addedTotal: added.reduce((s, x) => s + x.effect, 0) };
    }
    // the change of one account against the entry before i ("better" means it raised net worth)
    function accChange(state, acc, i) {
        if (i <= 0) return null;
        const now = valueAt(state, acc.id, i), before = valueAt(state, acc.id, i - 1);
        if (now === null) return null;
        if (before === null) return { isNew: true, since: state.entries[i - 1].date };
        const d = now - before;
        return { diff: d, better: side(acc) === 'own' ? d > 0 : d < 0, since: state.entries[i - 1].date };
    }
    // makes sure there is an entry for the date. A new one starts with every balance from the entry before it.
    function ensureEntry(state, date) {
        let i = indexOf(state, date);
        if (i >= 0) return i;
        const prev = atOrBefore(state, date), values = {};
        if (prev >= 0) state.accounts.forEach(a => { const v = valueAt(state, a.id, prev); if (v !== null) values[a.id] = v; });
        state.entries.push({ date, values });
        state.entries.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
        return indexOf(state, date);
    }
    function setValue(state, date, id, cents) {
        const i = ensureEntry(state, date);
        state.entries[i].values[id] = cents;
        return i;
    }
    // removes one update; the update after it keeps the balances it showed (they no longer come from the deleted one)
    function deleteEntry(state, date) {
        const i = indexOf(state, date);
        if (i < 0) return false;
        const next = state.entries[i + 1];
        if (next) state.accounts.forEach(a => { if (next.values[a.id] === undefined) { const v = valueAt(state, a.id, i); if (v !== null) next.values[a.id] = v; } });
        state.entries.splice(i, 1);
        return true;
    }
    function deleteAccount(state, id) {
        state.accounts = state.accounts.filter(a => a.id !== id);
        state.entries.forEach(e => { delete e.values[id]; });
    }
    const newId = () => 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

    // ---- saved data is checked value by value; anything broken is dropped
    const okCents = v => Number.isInteger(v) && Math.abs(v) <= MAX_AMOUNT;
    function clean(raw) {
        const s = { v: 1, cur: '', accounts: [], entries: [] };
        if (!raw || typeof raw !== 'object') return s;
        if (SYMBOLS.includes(raw.cur)) s.cur = raw.cur;
        const ids = new Set();
        if (Array.isArray(raw.accounts)) raw.accounts.forEach(a => {
            if (!a || typeof a !== 'object' || s.accounts.length >= MAX_ACCOUNTS) return;
            const name = String(a.name == null ? '' : a.name).replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
            const id = typeof a.id === 'string' && /^[\w-]{1,40}$/.test(a.id) ? a.id : null;
            if (!name || !id || ids.has(id)) return;
            ids.add(id);
            s.accounts.push({ id, name, kind: KINDS[a.kind] ? a.kind : 'ownother' });
        });
        const dates = new Set();
        if (Array.isArray(raw.entries)) raw.entries.forEach(e => {
            if (!e || typeof e !== 'object' || !validDate(e.date) || dates.has(e.date)) return;
            const values = {};
            if (e.values && typeof e.values === 'object') Object.keys(e.values).forEach(k => {
                const v = e.values[k];
                if (ids.has(k) && okCents(v) && !(v < 0 && side(s.accounts.find(a => a.id === k)) === 'owe')) values[k] = v;
            });
            dates.add(e.date);
            s.entries.push({ date: e.date, values });
        });
        s.entries.sort((a, b) => (a.date < b.date ? -1 : 1));
        if (s.entries.length > MAX_ENTRIES) s.entries = s.entries.slice(-MAX_ENTRIES);
        return s;
    }

    // ---- a plain table for a spreadsheet; text that a spreadsheet would run as a formula is made harmless
    function csv(state) {
        const q = v => { let t = String(v); if (/^[=+\-@\t\r]/.test(t) && !/^-?\d/.test(t)) t = "'" + t; return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
        const num = c => (c / 100).toFixed(2);
        const head = ['Date'].concat(state.accounts.map(a => a.name + (side(a) === 'owe' ? ' (owed)' : '')), ['Total I own', 'Total I owe', 'Net worth']);
        const rows = [head.map(q).join(',')];
        state.entries.forEach((e, i) => {
            const t = totalsAt(state, i);
            rows.push([e.date].concat(state.accounts.map(a => { const v = valueAt(state, a.id, i); return v === null ? '' : num(v); }), [num(t.own), num(t.owe), num(t.net)]).map(q).join(','));
        });
        return rows.join('\r\n') + '\r\n';
    }

    const api = { MAX_AMOUNT, MAX_ACCOUNTS, MAX_ENTRIES, MAX_NAME, SYMBOLS, KINDS, parseAmount, fmt, plain, validDate, dayNum, today, addMonths, dateText, shortDate,
        side, indexOf, atOrBefore, valueAt, totalsAt, changeAt, accChange, ensureEntry, setValue, deleteEntry, deleteAccount, newId, clean, csv };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.NetWorthCore = api;
})(this);
