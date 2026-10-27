// Prepaid Mobile Data Bundle Tracker: the maths and the words. No page code here, so tests.js can run it in node.
// Data is kept in thousandths of a MB (1 GB = 1024 MB, as operators count it), money in whole cents and times as
// whole minutes of local clock time ("2026-10-21T14:05"), so every sum is exact.
(function (root) {
    'use strict';
    const GB = 1024000;              // one GB in thousandths of a MB
    const MAXD = 10000 * GB;         // 10,000 GB in one bundle is plenty
    const MAXC = 100000000000;       // money up to 1,000,000,000
    const MIN_PACE = 180;            // need 3 hours of use before a pace means anything
    const DAYM = 1440;

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
    const parseMoney = t => parseNum(t, 2, { max: MAXC, blank: 'Type an amount, such as 1000.', big: 'That amount is too big.', bad: 'Type an amount such as 1000 or 999.50.', decimals: 'Use at most 2 decimal places.', minus: 'Type it without a minus sign.' });
    // "7.4", "7.4 GB", "750MB", "1,250 mb". A unit typed in the box wins over the unit picked beside it.
    function parseData(text, unit, opt) {
        opt = opt || {};
        let s = String(text == null ? '' : text).trim(), u = unit === 'MB' ? 'MB' : 'GB';
        const m = s.match(/\s*(gb|gbs|gig|gigs|g|mb|mbs|m)\.?$/i);
        if (m && /\d/.test(s.slice(0, m.index))) { u = /^m/i.test(m[1]) ? 'MB' : 'GB'; s = s.slice(0, m.index); }
        const r = parseNum(s, 3, { blank: opt.blank || 'Type how much data, such as 7.4.', bad: 'Type an amount such as 7.4 or 750.', decimals: 'Use at most 3 decimal places.', minus: 'Type it without a minus sign.', big: 'That is more data than any bundle has.' });
        if (r.error) return r;
        const n = u === 'GB' ? r.n * 1024 : r.n;           // thousandths of a MB
        if (n > MAXD) return { error: 'That is more data than any bundle has.' };
        if (opt.positive && n <= 0) return { error: 'Type an amount bigger than 0.' };
        return { n, unit: u };
    }

    // ---------- times ----------
    const pad = n => String(n).padStart(2, '0');
    const isTime = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s) && Number(s.slice(0, 4)) >= 2000 && Number(s.slice(0, 4)) <= 2200 && tStr(tMin(s)) === s;
    function tMin(s) { const y = +s.slice(0, 4), mo = +s.slice(5, 7), d = +s.slice(8, 10), h = +s.slice(11, 13), mi = +s.slice(14, 16); return Math.round(Date.UTC(y, mo - 1, d, h, mi) / 60000); }
    function tStr(n) { const d = new Date(n * 60000); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()) + 'T' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()); }
    const localNow = date => date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + 'T' + pad(date.getHours()) + ':' + pad(date.getMinutes());
    const addMin = (s, n) => tStr(tMin(s) + n);
    const join = (d, t) => d + 'T' + t;

    // ---------- one bundle ----------
    // b = { start, exp, mb, price?, carried?, ended?, tops: [{ id, at, mb, price? }], reads: [{ id, at, mb }] }
    const endOf = b => b.ended && b.ended < b.exp ? b.ended : b.exp;
    // data the bundle held at a moment: the bundle, anything carried over and the extra data added up to then
    const capAt = (b, at) => b.mb + (b.carried || 0) + b.tops.filter(t => t.at <= at).reduce((s, t) => s + t.mb, 0);
    // what a balance check at that minute can show: a top-up saved in the same minute counts as after the check
    const capBefore = (b, at) => b.mb + (b.carried || 0) + b.tops.filter(t => t.at < at).reduce((s, t) => s + t.mb, 0);
    const sortedReads = b => b.reads.slice().sort((x, y) => x.at < y.at ? -1 : x.at > y.at ? 1 : 0);
    // top-ups from the minute of one check up to (not including) the minute of the next
    const topsBetween = (b, a, z) => b.tops.filter(t => t.at >= a && t.at < z).reduce((s, t) => s + t.mb, 0);

    // Is a balance check possible? Data left can only go down, except when extra data was added.
    function checkRead(b, at, mb, now, skipId) {
        if (!isTime(at)) return 'Pick the date and time you checked.';
        if (at < b.start) return 'That is before the bundle was bought (' + b.start.replace('T', ' ') + ').';
        if (now && at > now) return 'That time has not come yet.';
        if (at > endOf(b)) return 'That is after the bundle ' + (b.ended && b.ended < b.exp ? 'was replaced' : 'expired') + '.';
        const cap = capBefore(b, at);
        if (mb > cap) return 'That is more than the whole bundle (' + fmtData(cap) + '). Check the number, or use "+ Add extra data" if you topped up.';
        const rs = sortedReads(b).filter(r => r.id !== skipId);
        const before = rs.filter(r => r.at <= at).pop(), after = rs.find(r => r.at > at);
        if (before && before.at === at) return 'You already saved a balance at that exact time. Edit that one instead.';
        if (before && mb > before.mb + topsBetween(b, before.at, at)) return 'Data left cannot go up: it was ' + fmtData(before.mb) + ' at ' + before.at.slice(11) + ' on ' + before.at.slice(0, 10) + '. Check the number, or use "+ Add extra data" if you topped up.';
        if (after && after.mb > mb + topsBetween(b, at, after.at)) return 'A later check shows ' + fmtData(after.mb) + ' left, more than this. Check the number.';
        return '';
    }
    function checkBuy(o, now) {
        if (!isTime(o.start)) return { f: 'start', e: 'Pick the date and time you bought it.' };
        if (now && tMin(o.start) > tMin(now) + 5) return { f: 'start', e: 'That time has not come yet.' };
        if (!isTime(o.exp)) return { f: 'exp', e: 'Pick the expiry date and time.' };
        if (o.exp <= o.start) return { f: 'exp', e: 'The expiry must be after the time you bought it.' };
        if (tMin(o.exp) - tMin(o.start) > 400 * DAYM) return { f: 'exp', e: 'That is more than 400 days. Check the expiry date.' };
        return null;
    }

    // Everything the box shows for one bundle at the time "now".
    function analyse(b, now) {
        const nowM = tMin(now), startM = tMin(b.start), end = endOf(b), endM = tMin(end);
        const rs = sortedReads(b), last = rs[rs.length - 1];
        const o = { end, replaced: !!(b.ended && b.ended < b.exp), cap: capAt(b, now < end ? now : end) };
        o.left = last ? last.mb : capBefore(b, b.start);
        o.leftAt = last ? last.at : b.start;
        o.checked = !!last;
        // the pace: data used from purchase to the last check, per day
        const usedAtLast = capBefore(b, o.leftAt) - o.left, spanAtLast = tMin(o.leftAt) - startM;
        o.used = usedAtLast;
        o.pace = null;
        if (last && spanAtLast >= MIN_PACE) o.pace = Math.round(usedAtLast * DAYM / spanAtLast);  // thousandths of a MB a day
        o.state = nowM >= endM ? (o.replaced ? 'replaced' : 'expired') : (last && last.mb === 0 ? 'out' : 'active');
        // data left now: the last check, minus the pace since then (only an estimate, shown with "about")
        const ref = Math.min(nowM, endM), since = ref - tMin(o.leftAt);
        o.est = o.left + topsBetween(b, o.leftAt, tStr(ref + 1));
        o.estimated = false;
        if (o.pace != null && since >= 60 && o.left > 0) { o.est = Math.max(0, o.est - Math.round(o.pace * since / DAYM)); o.estimated = true; }
        o.remain = endM - nowM;                            // minutes until it expires
        o.timePct = Math.min(100, Math.max(0, Math.round((nowM - startM) * 100 / Math.max(1, endM - startM))));
        o.usedPct = o.cap ? Math.min(100, Math.max(0, Math.round((o.cap - o.est) * 100 / o.cap))) : 0;
        if (o.state === 'active') {
            o.allow = o.remain > 0 ? Math.floor(o.est * DAYM / o.remain) : 0;   // you can use this much a day
            if (o.pace != null) {
                if (o.pace === 0) o.lasts = true;
                else {
                    const outM = tMin(o.leftAt) + Math.floor(o.left * DAYM / o.pace) + Math.floor(topsBetween(b, o.leftAt, addMin(end, 1)) * DAYM / o.pace);
                    if (outM < endM) { o.lasts = false; o.runOut = tStr(Math.max(outM, tMin(o.leftAt))); o.early = endM - Math.max(outM, nowM); if (outM <= nowM) o.maybeOut = true; }
                    else { o.lasts = true; o.spare = Math.max(0, o.est - Math.round(o.pace * o.remain / DAYM)); }
                }
            }
        }
        if (o.state === 'out') { o.outAt = last.at; o.early = endM - tMin(last.at); }
        o.paid = (b.price || 0) + b.tops.reduce((s, t) => s + (t.price || 0), 0);
        o.hasPrice = b.price != null || b.tops.some(t => t.price != null);
        const total = capAt(b, end) - (b.carried || 0);
        o.total = total;
        o.perGB = o.hasPrice && total > 0 ? Math.round(o.paid * GB / total) : null;   // cents for one GB bought
        return o;
    }
    // data used over the bundle's whole life (for past bundles): only known when the last check was near its end
    function usedTotal(b) {
        const rs = sortedReads(b), last = rs[rs.length - 1];
        if (!last) return null;
        return { used: capBefore(b, last.at) - last.mb, left: last.mb, at: last.at, exact: last.mb === 0 || tMin(endOf(b)) - tMin(last.at) <= DAYM };
    }
    // cost per GB of every bundle bought on each line, newest first, for comparing weekly and monthly offers
    function spentIn(state, ym) {
        let c = 0, n = 0, x = 0;
        state.lines.forEach(l => l.buys.forEach(b => {
            if (b.price != null && b.start.slice(0, 7) === ym) { c += b.price; n++; }
            b.tops.forEach(t => { if (t.price != null && t.at.slice(0, 7) === ym) { c += t.price; x++; } });
        }));
        return { cents: c, bundles: n, extras: x };
    }
    // How much was left at the moment a new bundle replaces this one (for carrying it over)
    function leftAt(b, at) {
        const a = analyse(b, at);
        return a.state === 'active' ? a.est : 0;
    }

    // ---------- words ----------
    function fmtNum(n, loc, max, min) {
        try { return new Intl.NumberFormat(loc || undefined, { maximumFractionDigits: max == null ? 3 : max, minimumFractionDigits: min || 0 }).format(n); } catch (e) { return String(n); }
    }
    // under 1 GB in whole MB, under 10 GB with 2 decimals, then 1 decimal
    function fmtData(n, loc) {
        if (n < GB) { const mb = Math.round(n / 1000); return (n > 0 && mb === 0 ? 'under 1' : fmtNum(mb, loc, 0)) + ' MB'; }
        const g = n / GB;
        return fmtNum(g < 10 ? Math.round(g * 100) / 100 : Math.round(g * 10) / 10, loc, g < 10 ? 2 : 1) + ' GB';
    }
    // a value for an input box, in GB unless it is under 1 GB
    function dataInput(n) {
        if (n < GB && n % 1000 === 0 && n > 0) return { v: String(n / 1000), u: 'MB' };
        return { v: String(Math.round(n / 1024) / 1000), u: 'GB' };
    }
    function fmtMoney(cents, cur, loc) {
        const n = Math.abs(cents);
        let t;
        try { t = new Intl.NumberFormat(loc || undefined, { minimumFractionDigits: n % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(n / 100); }
        catch (e) { t = (n / 100).toFixed(n % 100 ? 2 : 0); }
        t = (cents < 0 ? '-' : '') + t;
        if (!cur) return t;
        return /^[A-Za-z]/.test(cur) || /[A-Za-z]$/.test(cur) ? cur + ' ' + t : cur + t;
    }
    // "Tue 3 Nov" (+ year when not this year), with "14:05" when asked
    function fmtWhen(s, loc, o) {
        o = o || {};
        const opt = { day: 'numeric', month: 'short', timeZone: 'UTC' };
        if (o.wd !== false) opt.weekday = 'short';
        if (o.year) opt.year = 'numeric';
        let t;
        try { t = new Intl.DateTimeFormat(loc || 'en-GB', opt).format(new Date(tMin(s) * 60000)); } catch (e) { t = s.slice(0, 10); }
        return o.time ? t + ', ' + s.slice(11) : t;
    }
    // "9 days", "2 days 5 hours", "7 hours", "40 minutes"
    function fmtSpan(min) {
        min = Math.max(0, Math.round(min));
        const d = Math.floor(min / DAYM), h = Math.floor((min % DAYM) / 60), m = min % 60;
        const w = (n, one) => n + ' ' + one + (n === 1 ? '' : 's');
        if (d >= 14 || (d >= 1 && !h)) return w(d, 'day');
        if (d >= 1) return w(d, 'day') + ' ' + w(h, 'hour');
        if (h >= 1) return w(h, 'hour');
        return w(m, 'minute');
    }
    const perDay = (n, loc) => fmtData(n, loc) + ' a day';

    // ---------- saved data ----------
    const emptyState = () => ({ v: 1, cur: '', lines: [] });
    const str = (s, max) => typeof s === 'string' ? s.slice(0, max) : '';
    const int = (n, lo, hi) => Number.isInteger(n) && n >= lo && n <= hi;
    const rid = p => p + Math.random().toString(36).slice(2, 10);
    function cleanBuy(b) {
        if (!b || typeof b !== 'object' || !isTime(b.start) || !isTime(b.exp) || b.exp <= b.start || !int(b.mb, 1, MAXD)) return null;
        const o = { id: str(b.id, 40) || rid('b'), start: b.start, exp: b.exp, mb: b.mb, tops: [], reads: [] };
        if (b.price != null && int(b.price, 0, MAXC)) o.price = b.price;
        if (b.carried != null && int(b.carried, 1, MAXD)) o.carried = b.carried;
        if (isTime(b.ended) && b.ended > b.start && b.ended < b.exp) o.ended = b.ended;
        const end = endOf(o);
        (Array.isArray(b.tops) ? b.tops : []).slice(0, 200).forEach(t => {
            if (!t || !isTime(t.at) || t.at < o.start || t.at > end || !int(t.mb, 1, MAXD)) return;
            const x = { id: str(t.id, 40) || rid('t'), at: t.at, mb: t.mb };
            if (t.price != null && int(t.price, 0, MAXC)) x.price = t.price;
            o.tops.push(x);
        });
        const seen = {};
        (Array.isArray(b.reads) ? b.reads : []).slice(0, 3000).forEach(r => {
            if (!r || !isTime(r.at) || seen[r.at] || r.at < o.start || r.at > end || !int(r.mb, 0, MAXD) || r.mb > capBefore(o, r.at)) return;
            seen[r.at] = 1;
            o.reads.push({ id: str(r.id, 40) || rid('r'), at: r.at, mb: r.mb });
        });
        o.reads = sortedReads(o);
        return o;
    }
    function cleanLine(l) {
        const name = str(l && l.name, 40).trim();
        if (!name) return null;
        const o = { id: str(l.id, 40) || rid('l'), name, buys: [] };
        (Array.isArray(l.buys) ? l.buys : []).slice(0, 1000).forEach(b => { const x = cleanBuy(b); if (x) o.buys.push(x); });
        if (!o.buys.length) return null;
        o.buys.sort((a, b) => a.start < b.start ? -1 : a.start > b.start ? 1 : 0);
        return o;
    }
    function cleanState(s) {
        if (!s || typeof s !== 'object' || !Array.isArray(s.lines)) return null;
        const o = emptyState();
        o.cur = str(s.cur, 6);
        s.lines.slice(0, 50).forEach(l => { const x = cleanLine(l); if (x) o.lines.push(x); });
        return o;
    }

    const api = { GB, DAYM, parseNum, parseMoney, parseData, isTime, tMin, tStr, localNow, addMin, join, endOf, capAt, capBefore, topsBetween, sortedReads, checkRead, checkBuy,
        analyse, usedTotal, spentIn, leftAt, fmtNum, fmtData, dataInput, fmtMoney, fmtWhen, fmtSpan, perDay, emptyState, cleanBuy, cleanLine, cleanState };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PDB = api;
})(typeof window !== 'undefined' ? window : this);
