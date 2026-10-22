// Shared House Expenses for Roommates: the maths and the words, with no page code, so tests.js can check it in node.
// Amounts are whole cents (hundredths) so every split adds up exactly. Dates are calendar days ('2026-10-05').
// A balance is what a flatmate paid minus their share: more than 0 = the others owe them, less than 0 = they owe.
(function (root) {
    'use strict';
    const MAX = 999999999999; // 9,999,999,999.99 in cents
    const SYMBOLS = ['', 'Rs', '₹', '$', '€', '£', '৳', 'AED', 'SAR', 'RM', 'Rp', '₦', 'KSh', '₵', 'R', '₱', '¥', '₺', 'E£', 'R$', 'A$', 'C$', 'CHF', 'kr', 'zł'];
    const CATS = ['Rent', 'Electricity', 'Gas', 'Water', 'Internet', 'Groceries', 'Cleaning', 'Repairs', 'Maid or cook', 'Other'];
    const MAX_PEOPLE = 20;

    // "2,500" "2.500" "2 500" "1,00,000" "12.5" "12,50" "$40" "Rs 1500" -> cents, or { error }. opts.zero allows 0.
    function parseAmount(text, opts) {
        opts = opts || {};
        let s = String(text == null ? '' : text).replace(/[   ']/g, ' ').trim();
        if (!s) return { error: 'Type the amount, such as 2500.' };
        s = s.replace(/^(rs\.?|inr|usd|eur|gbp|pkr|aed|sar|[$€£₹¥₦₱৳₺])\s*/i, '').replace(/\s*(rs\.?|\/-|[$€£₹¥₦₱৳₺])$/i, '').trim();
        if (/^[-−–]/.test(s)) return { error: 'Type the amount without a minus sign.' };
        if (/^\+/.test(s)) s = s.slice(1).trim();
        if (!/^[\d.,\s]+$/.test(s) || !/\d/.test(s)) return { error: 'Type a number, such as 2500 or 12.50.' };
        const bad = { error: 'That number looks mistyped. Type it like 2500 or 2,500.' };
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
            if (whole === '' && frac === '') return { error: 'Type a number, such as 2500 or 12.50.' };
        }
        if (frac.length > 2) return { error: 'Use at most 2 numbers after the decimal point, such as 12.50.' };
        whole = whole.replace(/^0+(?=\d)/, '') || '0';
        if (whole.length > 10) return { error: 'That amount is too big. The most is 9,999,999,999.99.' };
        const cents = Number(whole) * 100 + Number((frac + '00').slice(0, 2));
        if (cents === 0 && !opts.zero) return { error: 'Type an amount more than 0.' };
        if (cents > MAX) return { error: 'That amount is too big. The most is 9,999,999,999.99.' };
        return { cents };
    }

    // a share such as 1, 2 or 1.5 -> hundredths (100, 200, 150), or { error }
    function parseShare(text) {
        const s = String(text == null ? '' : text).trim().replace(',', '.');
        if (!s) return { error: 'blank' };
        if (!/^\d{1,4}(\.\d{1,2})?$/.test(s)) return { error: 'bad' };
        const n = Math.round(Number(s) * 100);
        if (n <= 0) return { error: 'zero' };
        if (n > 100000) return { error: 'big' };
        return { n };
    }

    // 1850000 -> "18,500" (lakh grouping "1,85,000" for rupees and taka); negative amounts get a minus sign
    const localeFor = cur => (['Rs', '₹', '৳'].includes(cur) ? 'en-IN' : 'en-US');
    function fmt(cents, cur) {
        const n = Math.abs(cents);
        let t;
        try { t = new Intl.NumberFormat(localeFor(cur), { minimumFractionDigits: n % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(n / 100); }
        catch (e) { t = (n / 100).toFixed(n % 100 ? 2 : 0); }
        if (cur) t = /^[A-Za-z]/.test(cur) || /[A-Za-z]$/.test(cur) ? cur + ' ' + t : cur + t;
        return (cents < 0 ? '−' : '') + t;
    }

    // dates
    const pad = n => String(n).padStart(2, '0');
    const dayStr = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    function toDate(s) { const [y, m, d] = s.split('-').map(Number); const t = new Date(y, m - 1, d, 12); t.setFullYear(y); return t; }
    const isDay = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && s >= '1900-01-01' && s <= '2999-12-31' && dayStr(toDate(s)) === s;
    const niceDate = s => { try { return toDate(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return s; } };
    const shortDate = s => { try { return toDate(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); } catch (e) { return s; } };
    const monthName = ym => { try { return toDate(ym + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }); } catch (e) { return ym; } };
    const clean = (s, max) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, max);
    const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

    // Splits total across whole-number weights by the largest remainder, so the parts always add up to total exactly.
    // Ties go to the earlier person in the list.
    function allocate(total, weights) {
        const sum = weights.reduce((a, b) => a + b, 0);
        if (!sum) return weights.map(() => 0);
        // BigInt so a huge amount times a big share never loses a cent
        const T = BigInt(total), S = BigInt(sum);
        const out = weights.map(w => Number(T * BigInt(w) / S));
        const rem = weights.map(w => Number(T * BigInt(w) % S));
        let left = total - out.reduce((a, b) => a + b, 0);
        rem.map((r, i) => [r, i]).sort((a, b) => b[0] - a[0] || a[1] - b[1])
            .forEach(([, i]) => { if (left > 0 && weights[i] > 0) { out[i]++; left--; } });
        return out;
    }

    const nameOf = (state, id) => { const p = state.people.find(x => x.id === id); return p ? p.name : 'Someone'; };
    const order = (state, ids) => state.people.map(p => p.id).filter(id => ids.includes(id));

    // what each person owes for one expense: { id: cents }
    function sharesOf(state, it) {
        const ids = order(state, Object.keys(it.parts)), out = {};
        if (it.split === 'exact') { ids.forEach(id => { out[id] = it.parts[id]; }); return out; }
        const w = ids.map(id => (it.split === 'shares' ? it.parts[id] : 1));
        allocate(it.c, w).forEach((c, i) => { out[ids[i]] = c; });
        return out;
    }

    // all-time balance per person (cents), in the order of the flatmates list
    function balances(state) {
        const bal = {}; state.people.forEach(p => { bal[p.id] = 0; });
        state.items.forEach(it => {
            if (it.k === 'pay') { bal[it.from] += it.c; bal[it.to] -= it.c; return; }
            bal[it.by] += it.c;
            const sh = sharesOf(state, it); Object.keys(sh).forEach(id => { bal[id] -= sh[id]; });
        });
        return bal;
    }

    // the fewest-payments pass: the biggest debt pays the biggest credit first, ties by list order
    function settle(state, bal) {
        bal = bal || balances(state);
        const idx = id => state.people.findIndex(p => p.id === id);
        const owe = [], get = [];
        state.people.forEach(p => { const b = bal[p.id] || 0; if (b < 0) owe.push([p.id, -b]); else if (b > 0) get.push([p.id, b]); });
        const by = (a, b) => b[1] - a[1] || idx(a[0]) - idx(b[0]);
        owe.sort(by); get.sort(by);
        const out = [];
        for (let i = 0, j = 0; i < owe.length && j < get.length;) {
            const c = Math.min(owe[i][1], get[j][1]);
            out.push({ from: owe[i][0], to: get[j][0], c });
            owe[i][1] -= c; get[j][1] -= c;
            if (!owe[i][1]) i++;
            if (!get[j][1]) j++;
        }
        return out;
    }

    function balanceWords(name, b, cur) {
        if (b > 0) return name + ' gets back ' + fmt(b, cur);
        if (b < 0) return name + ' owes ' + fmt(-b, cur);
        return name + ' is settled up';
    }

    // "Split equally between 4: 2,100 each" and similar, for an expense box
    function splitWords(state, it, cur) {
        const sh = sharesOf(state, it), ids = Object.keys(sh), n = ids.length;
        if (it.split === 'equal') {
            if (n === 1) return 'Only ' + nameOf(state, ids[0]) + ' shares this';
            const vals = [...new Set(ids.map(id => sh[id]))].sort((a, b) => b - a);
            const each = vals.length === 1 ? fmt(vals[0], cur) + ' each' : vals.map(v => fmt(v, cur)).join(' or ') + ' each';
            return 'Split equally between ' + (n === state.people.length ? 'all ' + n : ids.map(id => nameOf(state, id)).join(', ')) + ': ' + each;
        }
        const list = order(state, ids).map(id => nameOf(state, id) + ' ' + fmt(sh[id], cur) + (it.split === 'shares' ? ' (' + shareText(it.parts[id]) + ')' : ''));
        return (it.split === 'shares' ? 'Split by shares: ' : 'Exact amounts: ') + list.join(', ');
    }
    const shareText = h => { const n = h / 100; return (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, '')) + (h === 100 ? ' share' : ' shares'); };

    // checks a typed expense. d = { what, amount, by, date, split, sel: [ids], vals: { id: text } } -> { item } or { error, field, who }
    function makeExpense(state, d) {
        const what = clean(d.what, 40);
        if (!what) return { error: 'Type or tap what it was for, such as Rent.', field: 'what' };
        const p = parseAmount(d.amount);
        if (p.error) return { error: p.error, field: 'amount' };
        if (!state.people.some(x => x.id === d.by)) return { error: 'Choose who paid.', field: 'by' };
        if (!isDay(d.date)) return { error: 'Choose the date it was paid.', field: 'date' };
        const sel = order(state, d.sel || []);
        if (!sel.length) return { error: 'Tick at least one person who shares this.', field: 'sel' };
        const split = ['equal', 'shares', 'exact'].includes(d.split) ? d.split : 'equal', parts = {};
        if (split === 'equal') sel.forEach(id => { parts[id] = 1; });
        if (split === 'shares') {
            for (const id of sel) {
                const s = parseShare((d.vals || {})[id]), nm = nameOf(state, id);
                if (s.error) return { error: s.error === 'big' ? nm + "'s share is too big. Use numbers like 1, 2 or 1.5." : 'Type ' + nm + "'s share, such as 1 or 2 (more than 0).", field: 'val', who: id };
                parts[id] = s.n;
            }
        }
        if (split === 'exact') {
            let sum = 0;
            for (const id of sel) {
                const nm = nameOf(state, id), raw = String((d.vals || {})[id] == null ? '' : d.vals[id]).trim();
                if (!raw) return { error: "Type " + nm + "'s part, or untick " + nm + '.', field: 'val', who: id };
                const a = parseAmount(raw, { zero: true });
                if (a.error) return { error: nm + ': ' + a.error, field: 'val', who: id };
                if (!a.cents) return { error: nm + "'s part is 0. Untick " + nm + ' instead.', field: 'val', who: id };
                parts[id] = a.cents; sum += a.cents;
            }
            if (sum !== p.cents) {
                const diff = p.cents - sum, cur = d.cur || '';
                return { error: 'The parts add up to ' + fmt(sum, cur) + ' but the amount is ' + fmt(p.cents, cur) + ': ' + fmt(Math.abs(diff), cur) + (diff > 0 ? ' is not given to anyone yet.' : ' too much.'), field: 'sum' };
            }
        }
        return { item: { k: 'exp', d: d.date, what, c: p.cents, by: d.by, split, parts } };
    }

    // what the exact-amount split still has to give out (cents, can be negative), or null if a part is unreadable
    function exactLeft(amountText, vals, sel) {
        const p = parseAmount(amountText); if (p.error) return null;
        let sum = 0;
        for (const id of sel) { const raw = String(vals[id] == null ? '' : vals[id]).trim(); if (!raw) continue; const a = parseAmount(raw, { zero: true }); if (a.error) return null; sum += a.cents; }
        return p.cents - sum;
    }

    function makePayment(state, d) {
        if (!state.people.some(x => x.id === d.from)) return { error: 'Choose who paid the money.', field: 'from' };
        if (!state.people.some(x => x.id === d.to)) return { error: 'Choose who got the money.', field: 'to' };
        if (d.from === d.to) return { error: 'Choose two different people.', field: 'to' };
        const p = parseAmount(d.amount);
        if (p.error) return { error: p.error, field: 'amount' };
        if (!isDay(d.date)) return { error: 'Choose the date it was paid.', field: 'date' };
        return { item: { k: 'pay', d: d.date, from: d.from, to: d.to, c: p.cents } };
    }

    function itemTitle(state, it, cur) {
        if (it.k === 'pay') return nameOf(state, it.from) + ' paid ' + nameOf(state, it.to) + ' ' + fmt(it.c, cur);
        return it.what + ': ' + fmt(it.c, cur) + ', paid by ' + nameOf(state, it.by);
    }

    // months that have entries, newest first ('2026-10')
    const months = state => [...new Set(state.items.map(it => it.d.slice(0, 7)))].sort().reverse();

    // one month (or ym = '' for all time): spending, by what it was for, and each person's share and payments
    function monthSummary(state, ym) {
        const s = { ym, total: 0, count: 0, byWhat: [], people: {}, payments: 0, items: [] };
        const byWhat = {};
        state.people.forEach(p => { s.people[p.id] = { paid: 0, share: 0 }; });
        state.items.filter(it => !ym || it.d.slice(0, 7) === ym).forEach(it => {
            s.items.push(it);
            if (it.k === 'pay') { s.payments++; return; }
            s.total += it.c; s.count++;
            const key = it.what.toLowerCase();
            (byWhat[key] = byWhat[key] || { what: it.what, c: 0 }).c += it.c;
            s.people[it.by].paid += it.c;
            const sh = sharesOf(state, it); Object.keys(sh).forEach(id => { s.people[id].share += sh[id]; });
        });
        s.byWhat = Object.values(byWhat).sort((a, b) => b.c - a.c || a.what.localeCompare(b.what));
        s.items.sort((a, b) => (b.d > a.d ? 1 : b.d < a.d ? -1 : 0) || state.items.indexOf(b) - state.items.indexOf(a));
        return s;
    }

    // text to copy, share or email
    function summaryText(state, ym, cur, today) {
        const L = [], bal = balances(state), tr = settle(state, bal);
        L.push('Shared house expenses, ' + niceDate(today));
        L.push('');
        if (!tr.length) L.push('Everyone is settled up.');
        else { L.push('To settle up:'); tr.forEach(t => L.push('- ' + nameOf(state, t.from) + ' pays ' + nameOf(state, t.to) + ' ' + fmt(t.c, cur))); }
        L.push('');
        L.push('Balances:');
        state.people.forEach(p => { if (!p.out || bal[p.id]) L.push('- ' + balanceWords(p.name, bal[p.id], cur)); });
        const s = monthSummary(state, ym);
        if (s.count) {
            L.push('');
            L.push((ym ? monthName(ym) : 'All time') + ': spent ' + fmt(s.total, cur) + ' (' + s.byWhat.map(w => w.what + ' ' + fmt(w.c, cur)).join(', ') + ')');
            state.people.forEach(p => { const x = s.people[p.id]; if (x.paid || x.share) L.push('- ' + p.name + ': share ' + fmt(x.share, cur) + ', paid ' + fmt(x.paid, cur)); });
            L.push('');
            L.push('Expenses:');
            s.items.filter(it => it.k === 'exp').slice().reverse().forEach(it => L.push('- ' + shortDate(it.d) + ' ' + itemTitle(state, it, cur) + '. ' + splitWords(state, it, cur)));
        }
        const pays = s.items.filter(it => it.k === 'pay');
        if (pays.length) { L.push(''); L.push('Money paid back:'); pays.slice().reverse().forEach(it => L.push('- ' + shortDate(it.d) + ' ' + itemTitle(state, it, cur))); }
        return L.join('\n');
    }

    // ---- saved data ----
    const emptyState = () => ({ v: 1, people: [], items: [] });
    const okCents = c => Number.isInteger(c) && c >= 1 && c <= MAX;
    // checks saved or restored data; drops anything that does not make sense. Throws if it is not this app's data at all.
    function normalize(raw) {
        if (!raw || typeof raw !== 'object' || !Array.isArray(raw.people) || !Array.isArray(raw.items)) throw new Error('not shared house data');
        const st = emptyState(), ids = new Set(), names = new Set();
        raw.people.forEach(p => {
            if (!p || typeof p !== 'object' || st.people.length >= MAX_PEOPLE) return;
            const id = clean(p.id, 40), name = clean(p.name, 30);
            if (!id || !name || ids.has(id) || names.has(name.toLowerCase())) return;
            ids.add(id); names.add(name.toLowerCase());
            st.people.push({ id, name, out: p.out === true });
        });
        const itemIds = new Set();
        raw.items.forEach(it => {
            if (!it || typeof it !== 'object' || !isDay(it.d) || !okCents(it.c)) return;
            let id = clean(it.id, 40) || 'e' + Math.random().toString(36).slice(2, 10);
            while (itemIds.has(id)) id += 'x';
            if (it.k === 'pay') {
                if (!ids.has(it.from) || !ids.has(it.to) || it.from === it.to) return;
                itemIds.add(id); st.items.push({ id, k: 'pay', d: it.d, from: it.from, to: it.to, c: it.c }); return;
            }
            if (it.k !== 'exp' || !ids.has(it.by) || !['equal', 'shares', 'exact'].includes(it.split) || !it.parts || typeof it.parts !== 'object') return;
            const what = clean(it.what, 40) || 'Other', parts = {};
            let sum = 0;
            for (const k of Object.keys(it.parts)) {
                const v = it.parts[k];
                if (!ids.has(k) || !Number.isInteger(v) || v < 1) return;
                if (it.split === 'shares' && v > 100000) return;
                if (it.split === 'exact' && v > MAX) return;
                parts[k] = it.split === 'equal' ? 1 : v; sum += v;
            }
            if (!Object.keys(parts).length || (it.split === 'exact' && sum !== it.c)) return;
            itemIds.add(id); st.items.push({ id, k: 'exp', d: it.d, what, c: it.c, by: it.by, split: it.split, parts });
        });
        return st;
    }

    const api = { MAX, MAX_PEOPLE, SYMBOLS, CATS, parseAmount, parseShare, fmt, dayStr, toDate, isDay, niceDate, shortDate, monthName, clean, plural, allocate, nameOf,
        sharesOf, balances, settle, balanceWords, splitWords, shareText, makeExpense, exactLeft, makePayment, itemTitle, months, monthSummary, summaryText, emptyState, normalize };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.HouseCore = api;
})(this);
