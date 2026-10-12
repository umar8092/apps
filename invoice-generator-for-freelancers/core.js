// Invoice maths, dates and text. No page code here, so tests.js can check it in Node and in the browser.
// Money is always whole cents. Quantities are thousandths, rates are thousandths of a percent.
(function (root) {
    'use strict';
    const MAX_PRICE = 1000000000;      // 10,000,000.00 a unit, in cents
    const MAX_QTY = 100000000;         // 100,000 in thousandths
    const MAX_ITEMS = 50, MAX_TEXT = 300, MAX_DETAILS = 600, MAX_NAME = 120, MAX_NUMBER = 30, MAX_NOTES = 1500;
    const TERMS = ['0', '7', '14', '15', '30', '45', '60', 'custom'];
    const STYLES = ['1,234.56', '1.234,56', '1 234,56'];
    const SYMBOLS = ['', '$', '€', '£', '₹', 'Rs', '¥', '₩', '₦', '₱', 'R', 'kr', 'CHF', 'AED', 'SAR', 'RM', 'zł', '₺', 'R$'];
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    // ---- reading typed numbers ----
    // "1,250.00", "1.250,00", "$1,250", "1 250,5", "2,5" -> exact integer at `scale` decimals (2 for money).
    // style '1.234,56' or '1 234,56' means a lone comma is the decimal mark and "1.250" is one thousand two hundred and fifty.
    // Returns { v } or { blank } or { err: 'nan' | 'negative' | 'big' | 'decimals' }.
    function parseDec(raw, scale, opt) {
        opt = opt || {};
        let s = String(raw == null ? '' : raw).trim();
        if (!s) return { blank: true };
        let neg = false;
        if (/^\(.*\)$/.test(s) || /^[^\d]*-/.test(s) || /\d\s*-$/.test(s)) neg = true;
        s = s.replace(/[\s  ']/g, '');
        // letters are fine around the number (Rs 500, 500 kr) but not inside it: 1e5 or 12abc34 must not be read as 15 or 1234
        if (/[A-Za-z]/.test(s.replace(/^[^\d.,]+/, '').replace(/[^\d.,]+$/, ''))) return { err: 'nan' };
        s = s.replace(/[^\d.,]/g, '');
        if (!/\d/.test(s)) return { err: 'nan' };
        const commaDec = opt.style && opt.style !== '1,234.56';
        const lastDot = s.lastIndexOf('.'), lastComma = s.lastIndexOf(',');
        if (lastDot >= 0 && lastComma >= 0) {
            const dec = lastDot > lastComma ? '.' : ',', other = dec === '.' ? ',' : '.';
            s = s.split(other).join('');
            if (s.split(dec).length > 2) return { err: 'nan' };
            s = s.replace(dec, '.');
        } else if (lastComma >= 0) {
            if (s.split(',').length > 2) s = /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : null;
            else if (!commaDec && /^\d{1,3},\d{3}$/.test(s)) s = s.replace(',', '');
            else s = s.replace(',', '.');
        } else if (lastDot >= 0) {
            if (s.split('.').length > 2) s = /^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, '') : null;
            else if (commaDec && /^\d{1,3}\.\d{3}$/.test(s)) s = s.replace('.', '');
        }
        if (s == null || !/^\d*\.?\d*$/.test(s) || s === '.') return { err: 'nan' };
        let [w, f = ''] = s.split('.');
        w = w.replace(/^0+(?=\d)/, '') || '0';
        if (w.length > 13) return { err: 'big' };
        let extra = f.slice(scale);
        f = (f + '0'.repeat(scale)).slice(0, scale);
        let v = parseInt(w + f, 10);
        if (opt.strict && /[1-9]/.test(extra)) return { err: 'decimals' };
        if (extra && extra[0] >= '5') v += 1;   // half up (away from zero once the sign is put back)
        if (neg && v !== 0) { if (!opt.neg) return { err: 'negative' }; v = -v; }
        return { v };
    }
    // A price for one unit: whole cents, may be below zero (a credit line), at most 10 million.
    function parsePrice(raw, style) {
        const r = parseDec(raw, 2, { neg: true, style });
        if (r.v != null && Math.abs(r.v) > MAX_PRICE) return { err: 'big' };
        return r;
    }
    // An amount that cannot be below zero (discount, already paid).
    function parseAmount(raw, style) {
        const r = parseDec(raw, 2, { style });
        if (r.v != null && r.v > MAX_PRICE * 100) return { err: 'big' };
        return r;
    }
    // How many (hours, days, pieces): blank = 1, up to 3 decimals, more than 0.
    function parseQty(raw, style) {
        const r = parseDec(raw, 3, { style, strict: true });
        if (r.blank) return { v: 1000, blank: true };
        if (r.err) return r;
        if (r.v === 0) return { err: 'zero' };
        if (r.v > MAX_QTY) return { err: 'big' };
        return r;
    }
    // A percentage 0 to 100, up to 3 decimals, as thousandths of a percent (8.875% -> 8875).
    function parsePct(raw, style) {
        const r = parseDec(raw, 3, { style, strict: true });
        if (r.err || r.blank) return r;
        if (r.v > 100000) return { err: 'over100' };
        return r;
    }

    // a * b / c rounded half away from zero, exactly (BigInt so nothing is lost on big numbers).
    function mulDiv(a, b, c) {
        const n = BigInt(a) * BigInt(b), d = BigInt(c);
        const neg = (n < 0n) !== (d < 0n), an = n < 0n ? -n : n, ad = d < 0n ? -d : d;
        let q = an / ad; if ((an % ad) * 2n >= ad) q += 1n;
        return Number(neg ? -q : q);
    }

    // ---- the invoice sums ----
    // inv: { items: [{d, q, r, notax}], discType: 'pct'|'amt', disc, taxOn, taxRate, taxIncl, paid, status }
    // Returns lines (each with amount or errors), sums and a list of problems in plain words.
    function compute(inv, style) {
        const out = { lines: [], problems: [], subtotal: 0, discount: 0, tax: 0, total: 0, paid: 0, balance: 0, taxRate: 0, discPct: null };
        let taxedSub = 0, any = false;
        (inv.items || []).forEach((it, i) => {
            const d = String(it.d || '').trim(), line = { i, d, errors: {} };
            const q = parseQty(it.q, style), r = parsePrice(it.r, style);
            if (!d && q.blank && r.blank) { line.empty = true; out.lines.push(line); return; }
            if (q.err) line.errors.q = q.err;
            if (r.err) line.errors.r = r.err; else if (r.blank) line.errors.r = 'blank';
            if (!d) line.errors.d = 'blank';
            if (Object.keys(line.errors).length) { out.lines.push(line); out.problems.push({ where: 'item', i, text: 'Item ' + (i + 1) + ' needs fixing.' }); return; }
            line.qty = q.v; line.price = r.v; line.amount = mulDiv(q.v, r.v, 1000); line.notax = !!it.notax;
            out.subtotal += line.amount; if (!line.notax) taxedSub += line.amount; any = true;
            out.lines.push(line);
        });
        out.hasItems = any;
        if (!any && !out.problems.length) out.problems.push({ where: 'items', text: 'Add at least one item with a description and a price.' });
        if (out.subtotal < 0) out.problems.push({ where: 'items', text: 'The items add up to less than 0. Check the prices below 0.' });

        // discount, before tax
        if (inv.discOn) {
            if (inv.discType === 'amt') {
                const a = parseAmount(inv.disc, style);
                if (a.err) out.problems.push({ where: 'disc', code: a.err, text: a.err === 'negative' ? 'The discount cannot be below 0.' : 'The discount should be an amount, like 50.' });
                else if (!a.blank) out.discount = a.v;
            } else {
                const p = parsePct(inv.disc, style);
                if (p.err) out.problems.push({ where: 'disc', code: p.err, text: p.err === 'over100' ? 'The discount cannot be more than 100%.' : p.err === 'decimals' ? 'Use at most 3 decimals in the discount.' : p.err === 'negative' ? 'The discount cannot be below 0.' : 'The discount should be a percent, like 10.' });
                else if (!p.blank) { out.discPct = p.v; out.discount = mulDiv(Math.max(out.subtotal, 0), p.v, 100000); }
            }
            if (out.discount > Math.max(out.subtotal, 0)) { out.problems.push({ where: 'disc', code: 'over', text: 'The discount is more than the items add up to.' }); out.discount = Math.max(out.subtotal, 0); }
        }
        const afterDisc = out.subtotal - out.discount;

        // tax: on the taxed items only, after their share of the discount
        if (inv.taxOn) {
            const p = parsePct(inv.taxRate, style);
            if (p.err) out.problems.push({ where: 'tax', code: p.err, text: p.err === 'over100' ? 'The tax rate cannot be more than 100%.' : p.err === 'decimals' ? 'Use at most 3 decimals in the tax rate.' : p.err === 'negative' ? 'The tax rate cannot be below 0.' : 'The tax rate should be a percent, like 8.5.' });
            else if (!p.blank) {
                out.taxRate = p.v;
                const share = out.subtotal > 0 ? mulDiv(out.discount, taxedSub, out.subtotal) : 0;
                const base = Math.max(taxedSub - share, 0);
                out.taxBase = base;
                out.tax = inv.taxIncl ? mulDiv(base, p.v, 100000 + p.v) : mulDiv(base, p.v, 100000);
            }
        }
        out.total = inv.taxOn && !inv.taxIncl ? afterDisc + out.tax : afterDisc;

        // already paid
        if (inv.status === 'paid') out.paid = Math.max(out.total, 0);
        else if (inv.paidOn) {
            const a = parseAmount(inv.paid, style);
            if (a.err) out.problems.push({ where: 'paid', code: a.err, text: a.err === 'negative' ? 'The amount paid cannot be below 0.' : 'The amount paid should be an amount, like 200.' });
            else if (!a.blank) out.paid = a.v;
            if (out.paid > Math.max(out.total, 0)) out.problems.push({ where: 'paid', code: 'over', text: 'The amount already paid is more than the total.' });
        }
        out.balance = out.total - out.paid;
        out.ok = !out.problems.length;
        return out;
    }

    // ---- showing numbers ----
    function groupDigits(w, style) {
        const sep = style === '1.234,56' ? '.' : style === '1 234,56' ? ' ' : ',';
        return w.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
    }
    function fmt(cents, style) {
        const neg = cents < 0, a = Math.abs(cents);
        const w = String(Math.floor(a / 100)), f = String(a % 100).padStart(2, '0');
        return (neg ? '-' : '') + groupDigits(w, style) + (style && style !== '1,234.56' ? ',' : '.') + f;
    }
    function money(cents, sym, style) {
        const t = fmt(Math.abs(cents), style), neg = cents < 0 ? '-' : '';
        if (!sym) return neg + t;
        return neg + (/^[A-Za-z]/.test(sym) ? sym + ' ' + t : sym + t);
    }
    // 2500 -> "2.5", 1000 -> "1", 1500000 -> "1,500"
    function fmtQty(milli, style) {
        const w = String(Math.floor(milli / 1000)), f = String(milli % 1000).padStart(3, '0').replace(/0+$/, '');
        return groupDigits(w, style) + (f ? (style && style !== '1,234.56' ? ',' : '.') + f : '');
    }
    function fmtPct(milli, style) { return fmtQty(milli, style) + '%'; }

    // ---- dates (calendar days only, so time zones never move them) ----
    function isYmd(s) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return false;
        const [y, m, d] = s.split('-').map(Number), t = new Date(Date.UTC(y, m - 1, d));
        return y >= 1900 && y <= 2200 && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
    }
    function today(now) { const d = now || new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
    function toUTC(s) { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); }
    function addDays(s, n) { const t = new Date(toUTC(s) + n * 86400000); return t.getUTCFullYear() + '-' + String(t.getUTCMonth() + 1).padStart(2, '0') + '-' + String(t.getUTCDate()).padStart(2, '0'); }
    function daysBetween(a, b) { return Math.round((toUTC(b) - toUTC(a)) / 86400000); }
    function fmtDate(s) { if (!isYmd(s)) return ''; const [y, m, d] = s.split('-').map(Number); return d + ' ' + MONTHS[m - 1] + ' ' + y; }
    // The due date from the invoice date and the payment terms. Returns { due, text } or { err }.
    function dueOf(inv) {
        const issue = isYmd(inv.issue) ? inv.issue : null;
        if (!issue) return { err: 'issue' };
        if (inv.terms === 'custom') {
            if (!isYmd(inv.due)) return { err: 'due-blank' };
            if (inv.due < issue) return { err: 'due-before' };
            return { due: inv.due, text: 'Due ' + fmtDate(inv.due) };
        }
        const n = TERMS.includes(inv.terms) ? parseInt(inv.terms, 10) : 30;
        if (n === 0) return { due: issue, text: 'Due on receipt', onReceipt: true };
        return { due: addDays(issue, n), text: 'Due ' + fmtDate(addDays(issue, n)) + ' (' + n + ' days)' };
    }
    // For My invoices: "Paid", "Due today", "Due in 5 days", "Overdue by 3 days".
    function statusText(inv, todayYmd) {
        if (inv.status === 'paid') return { cls: 'paid', text: 'Paid' };
        const d = dueOf(inv);
        if (!d.due) return { cls: 'open', text: 'Not paid' };
        const n = daysBetween(todayYmd, d.due);
        if (n < 0) return { cls: 'late', text: 'Overdue by ' + (-n) + (n === -1 ? ' day' : ' days') };
        if (n === 0) return { cls: 'soon', text: 'Due today' };
        return { cls: n <= 7 ? 'soon' : 'open', text: 'Due in ' + n + (n === 1 ? ' day' : ' days') };
    }

    // ---- invoice numbers ----
    // "INV-0009" -> "INV-0010", "2026-099" -> "2026-100", "7" -> "8", "ABC" -> "ABC-2". Skips numbers already used.
    function bump(n) {
        const m = String(n).match(/^(.*?)(\d+)(\D*)$/);
        if (!m) return (String(n) || 'INV') + '-2';
        const next = String(BigInt(m[2]) + 1n);
        return m[1] + (next.length < m[2].length ? next.padStart(m[2].length, '0') : next) + m[3];
    }
    function nextNumber(saved) {
        const used = new Set((saved || []).map(s => String(s.number).trim().toLowerCase()));
        if (!saved || !saved.length) return 'INV-0001';
        const last = saved.slice().sort((a, b) => (a.created || 0) - (b.created || 0))[saved.length - 1];
        let n = bump(String(last.number || 'INV-0000').trim() || 'INV-0000'), guard = 0;
        while (used.has(n.toLowerCase()) && guard++ < 1000) n = bump(n);
        return n.slice(0, MAX_NUMBER);
    }

    // ---- plain text for copy and email ----
    function summary(inv, me, sym, style) {
        const c = compute(inv, style), d = dueOf(inv), m = v => money(v, sym, style), L = [];
        L.push('Invoice ' + (inv.number || ''));
        if (me && me.name) L.push('From: ' + me.name);
        if (inv.client && inv.client.name) L.push('To: ' + inv.client.name);
        if (isYmd(inv.issue)) L.push('Date: ' + fmtDate(inv.issue));
        if (d.due) L.push(d.onReceipt ? 'Due: on receipt' : 'Due: ' + fmtDate(d.due));
        L.push('');
        c.lines.filter(l => l.amount != null).forEach(l => L.push(l.d + ': ' + fmtQty(l.qty, style) + ' × ' + m(l.price) + ' = ' + m(l.amount)));
        L.push('');
        const taxName = (inv.taxName || 'Tax').trim() || 'Tax';
        if (c.discount || c.tax || inv.taxOn) L.push('Subtotal: ' + m(c.subtotal));
        if (c.discount) L.push('Discount' + (c.discPct != null ? ' ' + fmtPct(c.discPct, style) : '') + ': -' + m(c.discount));
        if (inv.taxOn && c.taxRate != null && !inv.taxIncl) L.push(taxName + ' ' + fmtPct(c.taxRate, style) + ': ' + m(c.tax));
        L.push('Total: ' + m(c.total));
        if (inv.taxOn && inv.taxIncl) L.push('Includes ' + taxName + ' ' + fmtPct(c.taxRate, style) + ': ' + m(c.tax));
        if (inv.status === 'paid') L.push('Paid in full. Nothing left to pay.');
        else {
            if (c.paid) L.push('Already paid: -' + m(c.paid));
            L.push('Amount due: ' + m(c.balance) + (d.due ? (d.onReceipt ? ', due on receipt' : ', due by ' + fmtDate(d.due)) : ''));
        }
        if (inv.notes && String(inv.notes).trim()) { L.push(''); L.push(String(inv.notes).trim()); }
        return L.join('\n');
    }

    // ---- saved data: check every value before it is used ----
    const str = (v, max) => typeof v === 'string' ? v.slice(0, max) : (typeof v === 'number' && isFinite(v) ? String(v).slice(0, max) : '');
    function newId() { return 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
    function blankItem() { return { d: '', q: '', r: '', notax: false }; }
    function blankInvoice(saved, prev, now) {
        const p = prev || {};
        return {
            id: newId(), number: nextNumber(saved), issue: today(now), terms: p.terms && TERMS.includes(p.terms) && p.terms !== 'custom' ? p.terms : '30', due: '',
            client: { name: '', details: '', email: '' }, items: [blankItem()],
            discOn: false, discType: 'pct', disc: '',
            taxOn: !!p.taxOn, taxName: p.taxName || 'Tax', taxRate: p.taxRate || '', taxIncl: !!p.taxIncl,
            paidOn: false, paid: '', notes: p.notes || '', status: 'unpaid', created: 0,
            cur: SYMBOLS.includes(p.cur) ? p.cur : '', style: STYLES.includes(p.style) ? p.style : '1,234.56'
        };
    }
    function cleanClient(c) { c = c && typeof c === 'object' ? c : {}; return { name: str(c.name, MAX_NAME), details: str(c.details, MAX_DETAILS), email: str(c.email, 200) }; }
    function cleanInvoice(v, saved) {
        if (!v || typeof v !== 'object') return null;
        const items = (Array.isArray(v.items) ? v.items : []).slice(0, MAX_ITEMS).filter(x => x && typeof x === 'object')
            .map(x => ({ d: str(x.d, MAX_TEXT), q: str(x.q, 20), r: str(x.r, 24), notax: x.notax === true }));
        return {
            id: typeof v.id === 'string' && /^[\w-]{1,40}$/.test(v.id) ? v.id : newId(),
            number: str(v.number, MAX_NUMBER) || nextNumber(saved || []),
            issue: isYmd(v.issue) ? v.issue : today(), terms: TERMS.includes(v.terms) ? v.terms : '30', due: isYmd(v.due) ? v.due : '',
            client: cleanClient(v.client), items: items.length ? items : [blankItem()],
            discOn: v.discOn === true, discType: v.discType === 'amt' ? 'amt' : 'pct', disc: str(v.disc, 24),
            taxOn: v.taxOn === true, taxName: str(v.taxName, 30) || 'Tax', taxRate: str(v.taxRate, 12), taxIncl: v.taxIncl === true,
            paidOn: v.paidOn === true, paid: str(v.paid, 24), notes: str(v.notes, MAX_NOTES), status: v.status === 'paid' ? 'paid' : 'unpaid',
            created: typeof v.created === 'number' && isFinite(v.created) ? v.created : 0,
            cur: SYMBOLS.includes(v.cur) ? v.cur : '', style: STYLES.includes(v.style) ? v.style : '1,234.56'
        };
    }
    function clean(s) {
        s = s && typeof s === 'object' ? s : {};
        const me = s.me && typeof s.me === 'object' ? s.me : {};
        const logo = typeof me.logo === 'string' && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(me.logo) && me.logo.length < 400000 ? me.logo : '';
        const saved = (Array.isArray(s.saved) ? s.saved : []).slice(0, 2000).map(x => cleanInvoice(x, [])).filter(Boolean);
        const seen = new Set(); saved.forEach(x => { while (seen.has(x.id)) x.id = newId(); seen.add(x.id); });
        const clients = (Array.isArray(s.clients) ? s.clients : []).slice(0, 500).map(cleanClient).filter(c => c.name.trim());
        const out = {
            v: 1, me: { name: str(me.name, MAX_NAME), details: str(me.details, MAX_DETAILS), logo },
            saved, clients, cur: SYMBOLS.includes(s.cur) ? s.cur : '', style: STYLES.includes(s.style) ? s.style : '1,234.56'
        };
        out.inv = cleanInvoice(s.inv, saved) || blankInvoice(saved);
        return out;
    }
    // Put a client in the saved list (same name = update it).
    function upsertClient(clients, c) {
        const name = String(c.name || '').trim(); if (!name) return clients;
        const list = clients.filter(x => x.name.trim().toLowerCase() !== name.toLowerCase());
        list.push(cleanClient(c)); list.sort((a, b) => a.name.localeCompare(b.name));
        return list;
    }

    // Number style changed: rewrite the typed numbers so they keep their value ("1,5" stays one and a half).
    function plain(v, scale, style) {
        const neg = v < 0, a = Math.abs(v), p = Math.pow(10, scale);
        const w = String(Math.floor(a / p)), f = String(a % p).padStart(scale, '0').replace(/0+$/, '');
        return (neg ? '-' : '') + w + (f ? (style !== '1,234.56' ? ',' : '.') + f : '');
    }
    function restyle(inv, from, to) {
        const re = (raw, scale, neg) => { const r = parseDec(raw, scale, { neg: neg, style: from }); return r.v != null ? plain(r.v, scale, to) : raw; };
        inv.items.forEach(it => { it.q = re(it.q, 3); it.r = re(it.r, 2, true); });
        inv.disc = re(inv.disc, inv.discType === 'amt' ? 2 : 3); inv.taxRate = re(inv.taxRate, 3); inv.paid = re(inv.paid, 2);
        inv.style = to;
        return inv;
    }

    const api = { restyle, parseDec, parsePrice, parseAmount, parseQty, parsePct, mulDiv, compute, fmt, money, fmtQty, fmtPct, isYmd, today, addDays, daysBetween, fmtDate, dueOf, statusText, bump, nextNumber, summary, clean, cleanInvoice, blankInvoice, blankItem, upsertClient, newId, TERMS, STYLES, SYMBOLS, MAX_ITEMS, MAX_TEXT, MAX_DETAILS, MAX_NAME, MAX_NUMBER, MAX_NOTES };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.InvoiceCore = api;
})(typeof window !== 'undefined' ? window : this);
