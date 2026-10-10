// Grocery list maths, no page code. Money is whole cents, quantities are whole thousandths (1.5 kg = 1500), so totals are exact.
(function (root) {
    const MAX_PRICE = 10000000;     // 100,000.00 for one item
    const MAX_QTY = 999000;         // 999
    const MAX_ITEMS = 300;
    const MAX_NAME = 80;
    const MAX_TAX = 30000;          // 30% in thousandths of a percent (8.875% = 8875)
    const pad = n => String(n).padStart(2, '0');

    // Reads what people type or paste: "1.29", "1,29", "$1,299.00", "1.299,00 €", " 12 ". Returns { cents }, { blank } or { err }.
    function parsePrice(v) {
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
        if (w.replace(/^0+/, '').length > 6) return { err: 'big' };
        const f3 = (f + '000').slice(0, 3);
        const cents = parseInt(w || '0', 10) * 100 + parseInt(f3.slice(0, 2), 10) + (+f3[2] >= 5 ? 1 : 0);
        return cents > MAX_PRICE ? { err: 'big' } : { cents };
    }

    // Reads a decimal with up to 3 places into thousandths: "1.5" -> 1500, "2" -> 2000, "0,25" -> 250. Blank -> { blank }.
    function parseThousandths(v) {
        const s = String(v == null ? '' : v).trim().replace(',', '.');
        if (!s) return { blank: true };
        if (/^-/.test(s)) return { err: 'negative' };
        if (!/^\d*\.?\d*$/.test(s) || s === '.') return { err: 'nan' };
        const [w, f = ''] = s.split('.');
        if (w.replace(/^0+/, '').length > 6) return { err: 'big' };
        const f4 = (f + '0000').slice(0, 4);
        return { n: parseInt(w || '0', 10) * 1000 + parseInt(f4.slice(0, 3), 10) + (+f4[3] >= 5 ? 1 : 0) };
    }
    function parseQty(v) {
        const r = parseThousandths(v);
        if (r.blank) return { n: 1000 };
        if (r.err) return r;
        if (r.n <= 0) return { err: 'zero' };
        return r.n > MAX_QTY ? { err: 'big' } : r;
    }
    function parseTax(v) {
        const r = parseThousandths(v);
        if (r.blank || r.err) return r;
        return r.n > MAX_TAX ? { err: 'big' } : r;
    }

    function fmt(cents, sym) {
        const neg = cents < 0, c = Math.abs(Math.round(cents));
        const s = String(Math.floor(c / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + pad(c % 100);
        const p = !sym ? '' : /[A-Za-z]$/.test(sym) ? sym + ' ' : sym;
        return (neg ? '-' : '') + p + s;
    }
    // 1500 -> "1.5", 2000 -> "2", 125 -> "0.125"
    const qtyText = n => String(Math.floor(n / 1000)) + (n % 1000 ? ('.' + String(n % 1000).padStart(3, '0')).replace(/0+$/, '') : '');

    // Cost of one line, rounded half up to the cent: 1.2 kg at 1.10 = 1.32, 3 at 0.89 = 2.67.
    const lineCents = it => it.price == null ? null : Math.floor((it.qty * it.price + 500) / 1000);
    // Sales tax on an amount, rounded half up: 41.44 at 8.875% = 3.68
    const taxOn = (cents, rate) => rate ? Math.floor((cents * rate + 50000) / 100000) : 0;

    // Everything the totals card shows. Amounts include tax when a tax rate is set.
    function summary(state) {
        const items = state.items || [], rate = state.tax || 0, s = { count: items.length, got: 0, toGet: 0, noPrice: 0, noPriceGot: 0 };
        let trolley = 0, left = 0;
        items.forEach(it => {
            const c = lineCents(it);
            if (it.got) { s.got++; trolley += c || 0; } else { s.toGet++; left += c || 0; }
            if (c == null) { s.noPrice++; if (it.got) s.noPriceGot++; }
        });
        s.trolleySub = trolley; s.leftSub = left; s.wholeSub = trolley + left;
        s.trolley = trolley + taxOn(trolley, rate);
        s.whole = trolley + left + taxOn(trolley + left, rate);
        s.left = s.whole - s.trolley;                       // still to get, so trolley + still to get always equals the whole list
        s.wholeTax = taxOn(trolley + left, rate);
        s.budget = state.budget == null ? null : state.budget;
        if (s.budget != null) {
            s.budgetLeft = s.budget - s.trolley;            // what is left to spend right now (negative = over)
            s.spare = s.budget - s.whole;                   // after buying everything (negative = over)
        }
        return s;
    }

    // ---- pasting a whole list: one item per line
    // "2 x Milk 1.29", "Milk x2 - 1.29", "- Bread", "[ ] Eggs", "1. Rice 8.99", "Bananas 1.2 kg"
    function parseLine(line) {
        let s = String(line == null ? '' : line).replace(/\s+/g, ' ').trim();
        s = s.replace(/^(?:[-*•·–]|\[\s?[xX✓ ]?\s?\]|\d{1,2}[.)])\s+/, '').trim();
        s = s.replace(/^\[\s?[xX✓ ]?\s?\]\s*/, '').trim();
        if (!s) return null;
        let price = null, qty = 1000;
        // a price at the end needs decimals or a currency sign, so "Eggs 12" stays a name
        const pm = /(?:^|\s)[-–:@=]?\s*((?:[$€£₹¥]|Rs\.?\s?)?\s?\d{1,6}(?:[.,]\d{3})*[.,]\d{1,2}\s?(?:[$€£₹¥]|kr)?|(?:[$€£₹¥]|Rs\.?\s?)\s?\d{1,6}(?:[.,]\d{1,2})?)$/i.exec(s);
        if (pm) { const p = parsePrice(pm[1]); if (p.cents != null) { price = p.cents; s = s.slice(0, pm.index).replace(/[\s\-–:@=]+$/, '').trim(); } }
        const tq = /\s[x×]\s?(\d{1,3}(?:[.,]\d{1,3})?)$/i.exec(s);
        const lq = /^(\d{1,3}(?:[.,]\d{1,3})?)\s?[x×]\s+(?=\S)/i.exec(s) || /^(\d{1,3}(?:[.,]\d{1,3})?)[x×](?=[^\d\s])/i.exec(s);
        if (tq) { const q = parseQty(tq[1]); if (q.n) { qty = q.n; s = s.slice(0, tq.index).trim(); } }
        else if (lq) { const q = parseQty(lq[1]); if (q.n) { qty = q.n; s = s.slice(lq[0].length).trim(); } }
        s = s.replace(/[\s\-–:@=]+$/, '').trim();
        if (!s) return null;
        return { name: s.slice(0, MAX_NAME), qty, price };
    }
    const parseList = text => String(text || '').split(/\r?\n/).map(parseLine).filter(Boolean);

    const sameName = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
    // Adding something already on the list (not yet in the trolley): add to its quantity when the price matches or one is unknown.
    function findMerge(items, it) {
        return items.find(x => !x.got && sameName(x.name, it.name) && (x.price == null || it.price == null || x.price === it.price)) || null;
    }

    // ---- saved state: validate everything, drop bad rows
    function cleanItem(x) {
        if (!x || typeof x !== 'object') return null;
        const name = typeof x.name === 'string' ? x.name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME) : '';
        if (!name) return null;
        const qty = Number.isInteger(x.qty) && x.qty > 0 && x.qty <= MAX_QTY ? x.qty : 1000;
        const price = Number.isInteger(x.price) && x.price >= 0 && x.price <= MAX_PRICE ? x.price : null;
        const id = typeof x.id === 'string' && /^[\w-]{1,40}$/.test(x.id) ? x.id : null;
        return { id, name, qty, price, got: x.got === true };
    }
    const SYMBOLS = ['', '$', '€', '£', '₹', 'Rs', '¥', '₩', '₦', '₱', 'R', 'kr', 'CHF', 'AED', 'SAR', 'RM'];
    function clean(raw) {
        const out = { items: [], budget: null, tax: null, cur: '' };
        if (!raw || typeof raw !== 'object') return out;
        const seen = new Set();
        (Array.isArray(raw.items) ? raw.items : []).slice(0, MAX_ITEMS).forEach((x, i) => {
            const it = cleanItem(x); if (!it) return;
            if (!it.id || seen.has(it.id)) it.id = 'i' + i + '-' + Math.random().toString(36).slice(2, 8);
            seen.add(it.id); out.items.push(it);
        });
        if (Number.isInteger(raw.budget) && raw.budget > 0 && raw.budget <= MAX_PRICE * 10) out.budget = raw.budget;
        if (Number.isInteger(raw.tax) && raw.tax > 0 && raw.tax <= MAX_TAX) out.tax = raw.tax;
        if (SYMBOLS.includes(raw.cur)) out.cur = raw.cur;
        return out;
    }

    // ---- plain-text list for copy, email and print
    function listText(state, sym) {
        const s = summary(state), f = c => fmt(c, sym), lines = [];
        const line = it => {
            const c = lineCents(it), q = it.qty !== 1000 ? qtyText(it.qty) + ' x ' : '';
            return (it.got ? '[x] ' : '[ ] ') + it.name + (c == null ? (q ? ' (' + q.replace(/ x $/, '') + ')' : '') : ': ' + (q ? q + f(it.price) + ' = ' : '') + f(c));
        };
        lines.push('Grocery list: ' + s.count + (s.count === 1 ? ' item' : ' items') + ', ' + f(s.whole) + ' in total' + (state.tax ? ' (incl. ' + qtyText(state.tax) + '% tax)' : ''));
        if (s.budget != null) lines.push('Budget ' + f(s.budget) + ': ' + (s.spare >= 0 ? f(s.spare) + ' to spare' : f(-s.spare) + ' over budget'));
        if (s.noPrice) lines.push(s.noPrice + (s.noPrice === 1 ? ' item has' : ' items have') + ' no price yet.');
        const todo = state.items.filter(i => !i.got), done = state.items.filter(i => i.got);
        if (todo.length) { lines.push('', 'Still to get (' + f(s.left) + '):'); todo.forEach(i => lines.push(line(i))); }
        if (done.length) { lines.push('', 'In the trolley (' + f(s.trolley) + '):'); done.forEach(i => lines.push(line(i))); }
        return lines.join('\n');
    }

    const api = { MAX_PRICE, MAX_QTY, MAX_ITEMS, MAX_NAME, MAX_TAX, SYMBOLS, parsePrice, parseQty, parseTax, fmt, qtyText, lineCents, taxOn, summary,
        parseLine, parseList, sameName, findMerge, cleanItem, clean, listText };
    if (typeof module === 'object' && module.exports) module.exports = api; else root.GroceryCore = api;
})(typeof self !== 'undefined' ? self : this);
