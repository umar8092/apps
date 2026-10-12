// Unit price maths. No page code here, so tests.js can check it in Node and in the browser.
(function (root) {
    'use strict';
    const MAX_PRICE = 100000000000;   // 1,000,000,000.00 in cents
    const MAX_SIZE = 1000000, MAX_COUNT = 10000, MAX_ITEMS = 10, MAX_NAME = 40;

    // Every unit, measured in its kind's base unit: grams, millilitres, metres or items.
    const UNITS = {
        g: { kind: 'weight', f: 1, label: 'g' }, kg: { kind: 'weight', f: 1000, label: 'kg' },
        oz: { kind: 'weight', f: 28.349523125, label: 'oz' }, lb: { kind: 'weight', f: 453.59237, label: 'lb' },
        ml: { kind: 'volume', f: 1, label: 'ml' }, cl: { kind: 'volume', f: 10, label: 'cl' }, l: { kind: 'volume', f: 1000, label: 'L' },
        floz: { kind: 'volume', f: 29.5735295625, label: 'fl oz' }, flozuk: { kind: 'volume', f: 28.4130625, label: 'UK fl oz' },
        pt: { kind: 'volume', f: 568.26125, label: 'UK pint' }, ptus: { kind: 'volume', f: 473.176473, label: 'US pint' },
        gal: { kind: 'volume', f: 3785.411784, label: 'US gallon' },
        m: { kind: 'length', f: 1, label: 'm' }, ft: { kind: 'length', f: 0.3048, label: 'ft' }, yd: { kind: 'length', f: 0.9144, label: 'yd' },
        item: { kind: 'count', f: 1, label: 'item' }
    };
    // What the price can be shown "per", for each kind.
    const PER = {
        weight: [['kg', 1000, 'kg'], ['100g', 100, '100 g'], ['lb', 453.59237, 'lb'], ['oz', 28.349523125, 'oz']],
        volume: [['l', 1000, 'litre'], ['100ml', 100, '100 ml'], ['gal', 3785.411784, 'US gallon'], ['floz', 29.5735295625, 'fl oz']],
        length: [['m', 1, 'metre'], ['10m', 10, '10 m'], ['ft', 0.3048, 'ft'], ['100ft', 30.48, '100 ft']],
        count: [['item', 1, 'item'], ['10item', 10, '10 items'], ['100item', 100, '100 items']]
    };
    const KIND_WORD = { weight: 'weight (g, kg, oz, lb)', volume: 'liquid (ml, L, fl oz, pints)', length: 'length (m, ft, yd)', count: 'number of items' };
    const SYMBOLS = ['', '$', '€', '£', '₹', 'Rs', '¥', '₩', '₦', '₱', 'R', 'kr', 'CHF', 'AED', 'SAR', 'RM'];

    // "2,49", "$2.49", "1,299.00", "1.299,00 €" -> number. Returns { n }, { blank } or { err: 'nan' | 'negative' | 'zero' }.
    function parseNum(v) {
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
        const n = parseFloat(s);
        if (!(n > 0)) return { err: 'zero' };
        return { n };
    }
    // Price in whole cents (half a cent rounds up).
    function parsePrice(v) {
        const r = parseNum(v);
        if (!r.n) return r;
        const cents = Math.round(r.n * 100 + 1e-9);
        if (cents < 1) return { err: 'zero' };
        if (cents > MAX_PRICE) return { err: 'big' };
        return { cents };
    }
    function parseSize(v) {
        const r = parseNum(v);
        if (!r.n) return r;
        if (r.n > MAX_SIZE) return { err: 'big' };
        const n = Math.round(r.n * 1e6) / 1e6;
        return n > 0 ? { n } : { err: 'zero' };
    }
    function parseCount(v) {
        const s = String(v == null ? '' : v).trim();
        if (!s) return { n: 1, blank: true };
        if (/^-/.test(s)) return { err: 'negative' };
        if (!/^\d+$/.test(s.replace(/\s/g, ''))) return { err: 'whole' };
        const n = parseInt(s.replace(/\s/g, ''), 10);
        if (n < 1) return { err: 'zero' };
        if (n > MAX_COUNT) return { err: 'big' };
        return { n };
    }

    // Half up, so 0.945 shows as 0.95 (toFixed alone gives 0.94 because of how computers store decimals).
    function fixed(n, d) { const p = Math.pow(10, d); return (Math.round(n * p * (1 + 1e-12)) / p).toFixed(d); }
    function group(n, d) {
        const [w, f] = fixed(n, d).split('.');
        return w.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (f ? '.' + f : '');
    }
    function money(n, sym, d) {
        const t = group(n, d == null ? 2 : d);
        return sym ? (/^[A-Za-z]/.test(sym) ? sym + ' ' + t : sym + t) : t;
    }
    function fmtCents(c, sym) { return money(c / 100, sym, 2); }
    function trimNum(n) {
        const [w, f] = String(Math.round(n * 1e6) / 1e6).split('.');
        return w.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (f ? '.' + f : '');
    }
    function unitLabel(u, n) {
        if (u === 'item') return n === 1 ? 'item' : 'items';
        if ((u === 'pt' || u === 'ptus' || u === 'gal') && n !== 1) return UNITS[u].label + 's';
        return UNITS[u].label;
    }
    // "1.2 kg", "4 × 250 g", "12 items"
    function sizeText(it) {
        const s = trimNum(it.size) + ' ' + unitLabel(it.unit, it.size);
        return it.count > 1 ? it.count + ' × ' + s : s;
    }
    function perList(kind) { return PER[kind] || []; }
    // A sensible "per" for a kind, from the unit of the first item: metric -> kg / litre, oz -> oz, fl oz -> fl oz.
    function defaultPer(kind, unit) {
        if (kind === 'weight') return unit === 'oz' ? 'oz' : unit === 'lb' ? 'lb' : 'kg';
        if (kind === 'volume') return unit === 'floz' ? 'floz' : unit === 'gal' ? 'gal' : '100ml' === unit ? '100ml' : 'l';
        if (kind === 'length') return unit === 'ft' || unit === 'yd' ? 'ft' : 'm';
        return 'item';
    }

    // Read one item's typed values. Returns { ok, cents, size, count, unit, base } or { errors: {field: code} }.
    function readItem(raw) {
        const p = parsePrice(raw.price), s = parseSize(raw.size), c = parseCount(raw.count);
        const unit = UNITS[raw.unit] ? raw.unit : 'g';
        const errors = {};
        if (p.err) errors.price = p.err; else if (p.blank) errors.price = 'blank';
        if (s.err) errors.size = s.err; else if (s.blank) errors.size = 'blank';
        if (c.err) errors.count = c.err;
        if (Object.keys(errors).length) return { ok: false, errors, unit, kind: UNITS[unit].kind };
        return { ok: true, cents: p.cents, size: s.n, count: c.n, unit, kind: UNITS[unit].kind, base: s.n * c.n * UNITS[unit].f };
    }

    // Decimals so that every different unit price looks different (2 to 5), and small ones are not shown as 0.00.
    function decimalsFor(values) {
        const v = values.filter(x => x > 0);
        let d = 2;
        const min = Math.min.apply(null, v.length ? v : [1]);
        if (min < 1) d = 3;
        if (min < 0.01) d = 4;
        const distinct = v.slice().sort((a, b) => a - b).filter((x, i, a) => i === 0 || !same(a[i - 1], x));
        while (d < 5 && distinct.some((x, i) => i > 0 && fixed(distinct[i - 1], d) === fixed(x, d))) d++;
        return d;
    }
    function same(a, b) { return Math.abs(a - b) <= 1e-9 * Math.max(Math.abs(a), Math.abs(b), 1e-12); }
    function pctText(p) {
        if (p >= 1) return Math.round(p) + '%';
        if (p >= 0.1) return (Math.round(p * 10) / 10) + '%';
        return 'less than 0.1%';
    }

    // Compare a list of raw items. perKey: wanted "per" (falls back to the default for the kind).
    function compare(rawItems, perKey) {
        const items = rawItems.map((raw, i) => Object.assign({ index: i, letter: String.fromCharCode(65 + i), name: String(raw.name || '').trim().slice(0, MAX_NAME) }, readItem(raw)));
        items.forEach(it => { it.label = it.name || 'Item ' + it.letter; });
        const valid = items.filter(it => it.ok);
        const res = { items, valid: [], skipped: [], other: [], kind: null, per: null };
        items.filter(it => !it.ok).forEach(it => res.skipped.push(it));
        if (!valid.length) return res;
        const kind = valid[0].kind;
        res.kind = kind;
        const pers = perList(kind);
        const per = pers.find(p => p[0] === perKey) || pers.find(p => p[0] === defaultPer(kind, valid[0].unit));
        res.per = { key: per[0], f: per[1], label: per[2] };
        valid.forEach(it => { if (it.kind !== kind) res.other.push(it); else res.valid.push(it); });
        res.valid.forEach(it => { it.unitPrice = it.cents / 100 / it.base * per[1]; it.perBase = it.cents / it.base; });
        const ranked = res.valid.slice().sort((a, b) => same(a.perBase, b.perBase) ? a.index - b.index : a.perBase - b.perBase);
        res.ranked = ranked;
        if (!ranked.length) return res;
        const best = ranked[0];
        res.decimals = decimalsFor(ranked.map(it => it.unitPrice));
        ranked.forEach(it => {
            it.cheapest = same(it.perBase, best.perBase);
            if (!it.cheapest) {
                it.pct = (it.perBase / best.perBase - 1) * 100;
                it.diffPer = it.unitPrice - best.unitPrice;
            }
            // What the cheapest item's amount would cost at this item's unit price, to the cent.
            it.sameAmountCents = Math.round(it.perBase * best.base + 1e-9);
            it.moreCents = it.sameAmountCents - best.cents;
        });
        res.best = best;
        res.cheapest = ranked.filter(it => it.cheapest);
        return res;
    }

    function perText(res, n, sym) { return money(n, sym, res.decimals) + ' per ' + res.per.label; }
    function listJoin(a) { return a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }

    // The plain-words answer: { head, sub } or null.
    function verdict(res, sym) {
        if (!res.ranked || !res.ranked.length) return null;
        const r = res.ranked;
        if (r.length === 1) return { head: r[0].label + ': ' + perText(res, r[0].unitPrice, sym), sub: 'Add another item to see which is cheaper.' , single: true };
        const ch = res.cheapest;
        if (ch.length === r.length) return { head: (r.length === 2 ? 'Both cost' : 'All ' + r.length + ' cost') + ' the same', sub: perText(res, r[0].unitPrice, sym) + '. Pick whichever pack suits you.', tie: true };
        if (ch.length > 1) return { head: listJoin(ch.map(i => i.label)) + ' are cheapest', sub: 'Same price: ' + perText(res, ch[0].unitPrice, sym) + '.' };
        const next = r[1];
        return { head: r[0].label + ' is cheapest', sub: perText(res, r[0].unitPrice, sym) + '. ' + (r.length > 2 ? 'The next cheapest, ' + next.label + ', costs ' : next.label + ' costs ') + pctText(next.pct) + ' more per ' + res.per.label + '.' };
    }
    // One line per item for the result list and the copied text.
    function itemLine(res, it, sym) {
        return it.label + ': ' + sizeText(it) + ' for ' + fmtCents(it.cents, sym) + ' = ' + perText(res, it.unitPrice, sym);
    }
    function moreText(res, it, sym) {
        if (it.cheapest) return '';
        let d = res.decimals;
        while (d < 6 && +fixed(it.diffPer, d) === 0) d++;
        return pctText(it.pct) + ' more (' + money(it.diffPer, sym, d) + ' more per ' + res.per.label + ')';
    }
    function sameAmountText(res, it, sym) {
        if (it.cheapest || !res.best) return '';
        const amt = trimNum(res.best.base / UNITS[res.best.unit].f) + ' ' + unitLabel(res.best.unit, res.best.base / UNITS[res.best.unit].f);
        return 'The same ' + amt + ' bought this way costs ' + fmtCents(it.sameAmountCents, sym) + (it.moreCents > 0 ? ', ' + fmtCents(it.moreCents, sym) + ' more.' : '.');
    }
    function summaryText(res, sym) {
        const v = verdict(res, sym);
        if (!v) return '';
        const out = ['Which is cheaper? (price per ' + res.per.label + ')', v.head + '. ' + v.sub, ''];
        res.ranked.forEach((it, i) => out.push((i + 1) + '. ' + itemLine(res, it, sym) + (it.cheapest && res.ranked.length > 1 && !v.tie ? ' (cheapest)' : it.cheapest ? '' : ', ' + moreText(res, it, sym))));
        res.other.forEach(it => out.push('Not compared: ' + it.label + ' (' + sizeText(it) + ') is a different kind of unit.'));
        return out.join('\n');
    }

    function newId() { return 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
    function blankItem(unit) { return { id: newId(), name: '', price: '', size: '', unit: UNITS[unit] ? unit : 'g', count: '' }; }
    // Clean saved or restored state; anything odd is dropped.
    function clean(s) {
        const out = { items: [], per: {}, cur: '' };
        if (!s || typeof s !== 'object') { out.items = [blankItem(), blankItem()]; return out; }
        const str = (v, n) => typeof v === 'string' ? v.slice(0, n) : typeof v === 'number' && isFinite(v) ? String(v).slice(0, n) : '';
        (Array.isArray(s.items) ? s.items : []).slice(0, MAX_ITEMS).forEach(it => {
            if (!it || typeof it !== 'object') return;
            out.items.push({ id: typeof it.id === 'string' && /^[\w-]{1,40}$/.test(it.id) ? it.id : newId(), name: str(it.name, MAX_NAME), price: str(it.price, 20),
                size: str(it.size, 20), unit: UNITS[it.unit] ? it.unit : 'g', count: str(it.count, 8), named: !!it.named || !!str(it.name, MAX_NAME), pack: !!it.pack || !!str(it.count, 8) });
        });
        if (!out.items.length) out.items = [blankItem(), blankItem()];
        const ids = new Set();
        out.items.forEach(it => { if (ids.has(it.id)) it.id = newId(); ids.add(it.id); });
        if (s.per && typeof s.per === 'object') Object.keys(PER).forEach(k => { if (perList(k).some(p => p[0] === s.per[k])) out.per[k] = s.per[k]; });
        out.cur = SYMBOLS.includes(s.cur) ? s.cur : '';
        return out;
    }

    const api = { MAX_PRICE, MAX_SIZE, MAX_COUNT, MAX_ITEMS, MAX_NAME, UNITS, PER, KIND_WORD, SYMBOLS, parseNum, parsePrice, parseSize, parseCount, money, fmtCents, trimNum, unitLabel, sizeText,
        perList, defaultPer, readItem, decimalsFor, pctText, compare, perText, verdict, itemLine, moreText, sameAmountText, summaryText, newId, blankItem, clean };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.UnitPriceCore = api;
})(this);
