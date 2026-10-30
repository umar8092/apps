// Shopping Wishlist with a Cooling-Off Wait: the dates, the money and the words. No page code here, so tests.js can run it in node.
// Money is kept in whole cents and dates as "2026-10-30" day strings counted in whole days, so every sum is exact.
(function (root) {
    'use strict';
    const MAXC = 10000000000;        // up to 100,000,000 for one item
    const LIM = { name: 80, where: 120, link: 500, why: 300 };
    const WAITS = [1, 2, 7, 30];     // quick picks in days; any 1 to 365 with Custom
    const MAXWAIT = 365;

    // ---------- typed numbers ----------
    // "12,345.6", "12.345,6", "12 345", "1,00,000" and "Rs 23.5" all work. Returns the number times 10^dec as a whole number.
    function parseNum(text, dec, opt) {
        opt = opt || {};
        const bad = opt.bad || 'That number looks mistyped. Type it like 12345 or 12345.6.';
        let s = String(text == null ? '' : text).replace(/[   ']/g, ' ').trim();
        if (!s) return { error: opt.blank || 'Type a number.' };
        s = s.replace(/^(rs\.?|inr|usd|eur|gbp|pkr|aed|sar|[$€£₹¥₩₦₱৳₺₽₴])\s*/i, '').replace(/\s*(rs\.?|[$€£₹¥₩₦₱৳₺₽₴%])$/i, '').trim();
        if (/^[-−–]/.test(s)) return { error: opt.minus || 'Type it without a minus sign.' };
        if (/^\+/.test(s)) s = s.slice(1).trim();
        if (!/^[\d.,\s]+$/.test(s) || !/\d/.test(s)) return { error: bad };
        let intPart, fracPart = '';
        if (/\s/.test(s)) {
            const parts = s.split(/\s+/), last = parts[parts.length - 1], m = last.match(/^(\d{3})([.,]\d*)?$/);
            if (!/^\d{1,3}$/.test(parts[0]) || !parts.slice(1, -1).every(p => /^\d{3}$/.test(p)) || !m) return { error: bad };
            intPart = parts.slice(0, -1).join('') + m[1]; fracPart = m[2] ? m[2].slice(1) : '';
        } else {
            const dots = (s.match(/\./g) || []).length, commas = (s.match(/,/g) || []).length;
            let mark = null;
            if (dots && commas) mark = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ',';
            else if (dots + commas === 1) {
                const one = dots ? '.' : ',', [a, b] = s.split(one);
                // "12,345" is twelve thousand; "12,5" and "0.345" are decimals
                mark = (b.length === 3 && /^\d{1,3}$/.test(a) && a !== '0') ? null : one;
            }
            intPart = s;
            if (mark) { const i = s.lastIndexOf(mark); intPart = s.slice(0, i); fracPart = s.slice(i + 1); }
            const th = mark === '.' ? ',' : mark === ',' ? '.' : (dots ? '.' : ',');
            if (mark && intPart.includes(mark)) return { error: bad };
            if (intPart.includes(th)) {
                const west = new RegExp('^\\d{1,3}(\\' + th + '\\d{3})+$'), lakh = new RegExp('^\\d{1,2}(\\' + th + '\\d{2})*\\' + th + '\\d{3}$');
                if (!west.test(intPart) && !lakh.test(intPart)) return { error: bad };
                intPart = intPart.split(th).join('');
            }
            if (!/^\d*$/.test(fracPart) || !/^\d*$/.test(intPart)) return { error: bad };
        }
        fracPart = fracPart.replace(/0+$/, '');
        if (fracPart.length > dec) return { error: opt.decimals || ('Use at most ' + dec + ' decimal places.') };
        if (intPart.replace(/^0+/, '').length > 12) return { error: opt.big || 'That number is too big.' };
        const n = Number(intPart || '0') * Math.pow(10, dec) + Number((fracPart + '0000').slice(0, dec) || '0');
        if (opt.max != null && n > opt.max) return { error: opt.big || 'That number is too big.' };
        if (opt.positive && n <= 0) return { error: opt.zero || 'Type a number bigger than 0.' };
        return { n };
    }
    const parseMoney = (t, opt) => parseNum(t, 2, Object.assign({ max: MAXC, blank: 'Type an amount, such as 120.', big: 'That amount is too big.', bad: 'Type an amount such as 120 or 33.50.', decimals: 'Use at most 2 decimal places.', minus: 'Type it without a minus sign.', positive: true, zero: 'Type an amount bigger than 0, or leave it blank.' }, opt || {}));
    // optional money: blank is null, otherwise a whole number of cents above 0
    function parseOptMoney(t) {
        if (String(t == null ? '' : t).trim() === '') return { n: null };
        return parseMoney(t);
    }
    // a wait in whole days, 1 to 365
    function parseDays(t) {
        const s = String(t == null ? '' : t).trim();
        if (!s) return { error: 'Type how many days to wait, such as 14.' };
        if (!/^\d+$/.test(s)) return { error: 'Type a whole number of days, such as 14.' };
        const n = Number(s);
        if (n < 1) return { error: 'Wait at least 1 day.' };
        if (n > MAXWAIT) return { error: 'Wait at most ' + MAXWAIT + ' days.' };
        return { n };
    }

    // ---------- text ----------
    const cleanText = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max).trim();
    // a link is kept only if it is a plain web address; it is shown as text and opened only on tap
    function cleanLink(s) {
        let v = cleanText(s, LIM.link);
        if (!v) return '';
        if (!/^[a-z][a-z0-9+.-]*:/i.test(v)) v = 'https://' + v;
        try {
            const u = new URL(v);
            if ((u.protocol !== 'https:' && u.protocol !== 'http:') || !/\./.test(u.hostname)) return null;
            return u.href;
        } catch (e) { return null; }
    }
    function linkHost(href) { try { return new URL(href).hostname.replace(/^www\./, ''); } catch (e) { return ''; } }
    const norm = s => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

    // ---------- dates ----------
    const dNum = s => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 86400000;
    const dStr = n => new Date(n * 86400000).toISOString().slice(0, 10);
    function isDate(s) {
        if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
        const y = +s.slice(0, 4);
        return y >= 1900 && y <= 2200 && dStr(dNum(s)) === s;
    }
    const pad = n => String(n).padStart(2, '0');
    const today = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    const addDays = (s, n) => dStr(dNum(s) + n);
    const daysBetween = (a, b) => dNum(b) - dNum(a);
    const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    // "Mon 9 Nov", with the year when it is not this year
    function fmtDate(s, t) {
        const wd = WD[new Date(dNum(s) * 86400000).getUTCDay()];
        return wd + ' ' + (+s.slice(8, 10)) + ' ' + MON[+s.slice(5, 7) - 1] + (!t || s.slice(0, 4) !== t.slice(0, 4) ? ' ' + s.slice(0, 4) : '');
    }
    const plural = (n, one, many) => n + ' ' + (n === 1 ? one : (many || one + 's'));
    function waitName(n) {
        if (n === 7) return '1 week';
        if (n === 14) return '2 weeks';
        if (n === 30) return '30 days';
        return plural(n, 'day');
    }

    // ---------- money ----------
    function fmtMoney(cents, cur, loc) {
        const n = Math.abs(cents);
        let t;
        try { t = new Intl.NumberFormat(loc || undefined, { minimumFractionDigits: n % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(n / 100); }
        catch (e) { t = (n / 100).toFixed(n % 100 ? 2 : 0); }
        t = (cents < 0 ? '-' : '') + t;
        if (!cur) return t;
        return /^[A-Za-z]/.test(cur) || /[A-Za-z]$/.test(cur) ? cur + ' ' + t : cur + t;
    }
    const moneyInput = c => c == null ? '' : (c / 100).toFixed(c % 100 ? 2 : 0);

    // ---------- items ----------
    // the day the wait ends: the day added plus the wait, or the "need it by" day if that comes first (never before the day added)
    function endFor(added, wait, needBy) {
        let e = addDays(added, wait);
        if (needBy && needBy < e) e = needBy < added ? added : needBy;
        return e;
    }
    const price = it => it.prices.length ? it.prices[it.prices.length - 1].c : null;
    const firstPrice = it => it.prices.length ? it.prices[0].c : null;
    // a new price on day t: the same day replaces the last one; a blank clears the price
    function setPrice(it, c, t) {
        if (c == null) { it.prices = []; return; }
        if (price(it) === c) return;
        const last = it.prices[it.prices.length - 1];
        if (last && last.d === t) { last.c = c; if (it.prices.length > 1 && it.prices[it.prices.length - 2].c === c) it.prices.pop(); }
        else it.prices.push({ d: t, c });
        if (it.prices.length > 50) it.prices.splice(1, it.prices.length - 50);
    }
    // 'ready' once the wait has ended, otherwise the saved status
    function status(it, t) {
        if (it.st !== 'wait') return it.st;
        return it.ends <= t ? 'ready' : 'wait';
    }
    function waitWords(it, t) {
        const d = daysBetween(t, it.ends);
        if (d > 0) return 'Wait ends ' + fmtDate(it.ends, t) + ' (' + (d === 1 ? 'tomorrow' : 'in ' + d + ' days') + ')';
        if (d === 0) return 'Wait ended today';
        return 'Wait ended ' + fmtDate(it.ends, t) + ' (' + (d === -1 ? 'yesterday' : (-d) + ' days ago') + ')';
    }
    // how much of the wait has passed, 0 to 1
    function progress(it, t) {
        const all = daysBetween(it.added, it.ends);
        if (all <= 0) return 1;
        return Math.max(0, Math.min(1, daysBetween(it.added, t) / all));
    }
    // { from, now, diff } when the price has changed since it was added
    function priceChange(it) {
        if (it.prices.length < 2) return null;
        const from = firstPrice(it), now = price(it);
        return from === now ? null : { from, now, diff: now - from };
    }
    function waitLonger(it, days, t) {
        const base = it.ends > t ? it.ends : t;
        it.ends = addDays(base, days);
        it.needBy = null;
        it.wait = Math.min(MAXWAIT * 10, daysBetween(it.added, it.ends));
    }
    function decide(it, kind, t, paid) {
        it.st = kind === 'buy' ? 'bought' : 'skipped';
        it.dd = t;
        it.early = it.ends > t;
        it.paid = kind === 'buy' ? (paid == null ? null : paid) : null;
    }
    function reopen(it) { it.st = 'wait'; it.dd = null; it.paid = null; it.early = false; }
    // an item on the list with the same name (to warn about adding it twice or buying what was skipped)
    function sameAs(items, name, skipId) {
        const n = norm(name);
        if (!n) return null;
        const hits = items.filter(it => it.id !== skipId && norm(it.name) === n);
        return hits.find(it => it.st === 'wait') || hits.sort((a, b) => (b.dd || '').localeCompare(a.dd || ''))[0] || null;
    }
    function sorted(items, t) {
        const ready = [], wait = [], done = [];
        items.forEach(it => { const s = status(it, t); (s === 'ready' ? ready : s === 'wait' ? wait : done).push(it); });
        ready.sort((a, b) => a.ends.localeCompare(b.ends) || a.name.localeCompare(b.name));
        wait.sort((a, b) => a.ends.localeCompare(b.ends) || a.name.localeCompare(b.name));
        done.sort((a, b) => b.dd.localeCompare(a.dd) || a.name.localeCompare(b.name));
        return { ready, wait, bought: done.filter(i => i.st === 'bought'), skipped: done.filter(i => i.st === 'skipped') };
    }
    const sum = (list, f) => list.reduce((a, it) => a + (f(it) || 0), 0);
    function summary(state, t) {
        const s = sorted(state.items, t), year = t.slice(0, 4), month = t.slice(0, 7);
        const open = s.ready.concat(s.wait);
        const skY = s.skipped.filter(i => i.dd.slice(0, 4) === year), buY = s.bought.filter(i => i.dd.slice(0, 4) === year);
        const buM = s.bought.filter(i => i.dd.slice(0, 7) === month);
        const r = {
            ready: s.ready.length, waiting: s.wait.length, open: open.length, openTotal: sum(open, price), noPrice: open.filter(i => price(i) == null).length,
            skippedYear: skY.length, notSpentYear: sum(skY, price), skippedAll: s.skipped.length, notSpentAll: sum(s.skipped, price),
            boughtYear: buY.length, spentYear: sum(buY, i => i.paid), boughtEarlyYear: buY.filter(i => i.early).length,
            spentMonth: sum(buM, i => i.paid), boughtMonth: buM.length,
            dropSaved: sum(s.bought, i => i.paid != null && firstPrice(i) != null && firstPrice(i) > i.paid ? firstPrice(i) - i.paid : 0),
            limit: state.limit, left: null
        };
        if (state.limit != null) r.left = state.limit - r.spentMonth;
        return r;
    }
    function itemLine(it, t, cur, loc) {
        const p = price(it), parts = [it.name + ': ' + (p == null ? 'no price yet' : fmtMoney(p, cur, loc))];
        const st = status(it, t);
        if (st === 'ready' || st === 'wait') { const w = waitWords(it, t); parts.push(w[0].toLowerCase() + w.slice(1)); }
        if (st === 'bought') parts.push('bought ' + fmtDate(it.dd, t) + (it.paid != null ? ' for ' + fmtMoney(it.paid, cur, loc) : ''));
        if (st === 'skipped') parts.push('skipped ' + fmtDate(it.dd, t));
        if (it.where) parts.push(it.where);
        if (it.link) parts.push(it.link);
        return '- ' + parts.join(', ');
    }
    function listText(state, t, cur, loc) {
        const s = sorted(state.items, t), m = summary(state, t), out = ['My shopping wishlist (' + fmtDate(t, t) + ')'];
        const block = (h, list) => { if (list.length) out.push('', h, ...list.map(it => itemLine(it, t, cur, loc))); };
        block('Ready to decide:', s.ready);
        block('Still waiting:', s.wait);
        out.push('', 'Wishlist total: ' + fmtMoney(m.openTotal, cur, loc) + ' for ' + plural(m.open, 'item'));
        out.push('Not spent this year (skipped): ' + fmtMoney(m.notSpentYear, cur, loc) + ' on ' + plural(m.skippedYear, 'item'));
        if (m.boughtYear) out.push('Bought after thinking it over this year: ' + plural(m.boughtYear, 'item') + ', ' + fmtMoney(m.spentYear, cur, loc));
        return out.join('\n');
    }
    // a calendar file with one all-day reminder on the day the wait ends, at 9 in the morning
    function ics(it, t, stamp) {
        const esc = x => String(x).replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
        const fold = line => { const out = []; let s = line; while (s.length > 74) { out.push(s.slice(0, 74)); s = ' ' + s.slice(74); } out.push(s); return out.join('\r\n'); };
        const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//umar8092 apps//Shopping Wishlist with a Cooling-Off Wait//EN', 'CALSCALE:GREGORIAN',
            'BEGIN:VEVENT', 'UID:' + it.id + '-' + it.ends + '@shopping-wishlist-with-a-cooling-off-wait', 'DTSTAMP:' + stamp,
            'DTSTART;VALUE=DATE:' + it.ends.replace(/-/g, ''), 'DTEND;VALUE=DATE:' + addDays(it.ends, 1).replace(/-/g, ''),
            fold('SUMMARY:' + esc('Buy or skip: ' + it.name + '?')),
            fold('DESCRIPTION:' + esc('Your wait for ' + it.name + ' ends today. Do you still want it? Open the Shopping Wishlist and tap Buy it or Skip it.')),
            'BEGIN:VALARM', 'ACTION:DISPLAY', fold('DESCRIPTION:' + esc('Buy or skip: ' + it.name + '?')), 'TRIGGER;RELATED=START:PT9H', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'];
        return L.join('\r\n') + '\r\n';
    }

    // ---------- saved data ----------
    const emptyState = () => ({ v: 1, cur: '', limit: null, items: [] });
    const okId = s => typeof s === 'string' && /^[a-z0-9_-]{1,40}$/i.test(s);
    const okC = c => Number.isInteger(c) && c > 0 && c <= MAXC;
    function cleanItem(i) {
        if (!i || typeof i !== 'object' || !okId(i.id)) return null;
        const name = cleanText(i.name, LIM.name);
        if (!name || !['wait', 'bought', 'skipped'].includes(i.st) || !isDate(i.added) || !isDate(i.ends) || i.ends < i.added) return null;
        const wait = Number(i.wait);
        if (!Number.isInteger(wait) || wait < 0 || wait > MAXWAIT * 10) return null;
        const prices = (Array.isArray(i.prices) ? i.prices : []).filter(p => p && isDate(p.d) && okC(p.c)).map(p => ({ d: p.d, c: p.c })).slice(-50);
        const r = { id: i.id, name, prices, where: cleanText(i.where, LIM.where), link: i.link ? (cleanLink(i.link) || '') : '', why: cleanText(i.why, LIM.why),
            added: i.added, wait, ends: i.ends, needBy: isDate(i.needBy) ? i.needBy : null, st: i.st, dd: null, paid: null, early: false };
        if (i.st !== 'wait') {
            if (!isDate(i.dd)) return null;
            r.dd = i.dd; r.early = i.early === true;
            if (i.st === 'bought' && okC(i.paid)) r.paid = i.paid;
        }
        return r;
    }
    const CURS = ['', '$', '€', '£', 'Rs', '₹', 'A$', 'C$', 'NZ$', 'AED', 'SAR', 'QAR', 'KWD', 'R', '৳', '₦', 'KSh', 'RM', 'Rp', '₱', 'S$', '¥', '₩', '₺', 'R$', 'kr', 'CHF', 'zł'];
    function cleanState(s) {
        if (!s || typeof s !== 'object' || !Array.isArray(s.items)) return null;
        const seen = new Set(), items = [];
        s.items.forEach(i => { const c = cleanItem(i); if (c && !seen.has(c.id)) { seen.add(c.id); items.push(c); } });
        return { v: 1, cur: CURS.includes(s.cur) ? s.cur : '', limit: okC(s.limit) ? s.limit : null, items: items.slice(0, 2000) };
    }

    const api = { MAXC, LIM, WAITS, MAXWAIT, CURS, parseNum, parseMoney, parseOptMoney, parseDays, cleanText, cleanLink, linkHost, norm, isDate, today, addDays, daysBetween,
        fmtDate, plural, waitName, MONTHS, fmtMoney, moneyInput, endFor, price, firstPrice, setPrice, status, waitWords, progress, priceChange, waitLonger, decide, reopen,
        sameAs, sorted, summary, itemLine, listText, ics, emptyState, cleanItem, cleanState };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.WISHLIST = api;
})(typeof window !== 'undefined' ? window : this);
