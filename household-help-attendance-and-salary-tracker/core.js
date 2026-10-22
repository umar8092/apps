// Household Help Attendance and Salary Tracker: the maths and the words, with no page code, so tests.js can check it in node.
// Money is whole cents (hundredths) so every total is exact. Dates are calendar days ('2026-10-17'), months are '2026-10'.
// Each worker (maid, cook, driver, nanny) is paid by the month: the monthly pay, minus unpaid days off, plus extra days,
// overtime and bonuses, minus advances being taken back, like a family works it out on paper.
(function (root) {
    'use strict';
    const MAXPAY = 10000000000; // 100,000,000 per amount, in cents
    const SYMBOLS = ['', 'Rs', '₹', '$', '€', '£', '৳', '₦', 'KSh', '₵', 'R', '₱', 'Rp', 'RM', 'AED', 'SAR', 'QAR', '¥', '₩', '₺', 'R$', 'E£', 'A$', 'C$', 'kr', 'CHF', 'zł'];
    const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    // ---------- typed numbers ----------
    // "2,500" "2.500" "2 500" "1,00,000" "12.5" "12,50" "$40" "Rs 1500" -> cents, or { error }
    function parseAmount(text, opt) {
        opt = opt || {};
        const max = opt.max || MAXPAY, maxTxt = fmt(max, '', 'en-US');
        let s = String(text == null ? '' : text).replace(/[   ']/g, ' ').trim();
        if (!s) return { error: opt.blank || 'Type the amount, such as 220.' };
        s = s.replace(/^(rs\.?|inr|usd|eur|gbp|pkr|aed|sar|[$€£₹¥₩₦₱৳₺₽₴])\s*/i, '').replace(/\s*(rs\.?|[$€£₹¥₩₦₱৳₺₽₴])$/i, '').trim();
        if (/^[-−–]/.test(s)) return { error: 'Type the amount without a minus sign.' };
        if (/^\+/.test(s)) s = s.slice(1).trim();
        if (!/^[\d.,\s]+$/.test(s) || !/\d/.test(s)) return { error: 'Type a number, such as 220 or 12.50.' };
        let whole, frac = '';
        if (/\s/.test(s)) {
            const parts = s.split(/\s+/), last = parts[parts.length - 1], dm = last.match(/^(\d{3})([.,]\d{0,2})?$/);
            if (!/^\d{1,3}$/.test(parts[0]) || !parts.slice(1, -1).every(p => /^\d{3}$/.test(p)) || !dm) return { error: 'That number looks mistyped. Type it like 2500 or 2,500.' };
            whole = parts.join('').replace(/[.,]\d*$/, ''); frac = dm[2] ? dm[2].slice(1) : '';
        } else {
            const dots = (s.match(/\./g) || []).length, commas = (s.match(/,/g) || []).length;
            let dec = null;
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
            if (!/^\d*$/.test(fracPart)) return { error: 'That number looks mistyped. Type it like 2500 or 2,500.' };
            whole = intPart.split(th).join(''); frac = fracPart;
            if (whole === '' && frac === '') return { error: 'Type a number, such as 220 or 12.50.' };
        }
        if (frac.length > 2) return { error: 'Use at most 2 numbers after the decimal point, such as 12.50.' };
        whole = whole.replace(/^0+(?=\d)/, '') || '0';
        if (whole.length > 10) return { error: 'That amount is too big. The most is ' + maxTxt + '.' };
        const cents = Number(whole) * 100 + Number((frac + '00').slice(0, 2));
        if (cents === 0) return { error: 'Type an amount more than 0.' };
        if (cents > max) return { error: 'That amount is too big. The most is ' + maxTxt + '.' };
        return { cents };
    }

    function fmt(cents, cur, locale) {
        const n = Math.abs(cents);
        let t;
        try { t = new Intl.NumberFormat(locale || undefined, { minimumFractionDigits: n % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(n / 100); }
        catch (e) { t = (n / 100).toFixed(n % 100 ? 2 : 0); }
        if (!cur) return t;
        return /^[A-Za-z]/.test(cur) || /[A-Za-z]$/.test(cur) ? cur + ' ' + t : cur + t;
    }
    // ---------- dates ----------
    const pad = n => String(n).padStart(2, '0');
    const dayStr = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    function toDate(s) { const [y, m, d] = s.split('-').map(Number); const t = new Date(y, m - 1, d, 12); t.setFullYear(y); return t; }
    const isDay = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && +s.slice(0, 4) >= 2000 && +s.slice(0, 4) <= 2100 && dayStr(toDate(s)) === s;
    const isMonth = s => typeof s === 'string' && /^\d{4}-\d{2}$/.test(s) && isDay(s + '-01');
    function addDays(s, n) { const d = toDate(s); d.setDate(d.getDate() + n); return dayStr(d); }
    function daysBetween(a, b) { const u = s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); }; return Math.round((u(b) - u(a)) / 864e5); }
    const monthOf = s => s.slice(0, 7);
    function addMonth(ym, n) { const [y, m] = ym.split('-').map(Number), t = y * 12 + m - 1 + n; return Math.floor(t / 12) + '-' + pad(t % 12 + 1); }
    const daysIn = ym => { const [y, m] = ym.split('-').map(Number); return new Date(y, m, 0, 12).getDate(); };
    const firstDay = ym => ym + '-01';
    const lastDay = ym => ym + '-' + pad(daysIn(ym));
    const weekday = s => toDate(s).getDay();
    function niceDate(s, locale) { try { return toDate(s).toLocaleDateString(locale || undefined, { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return s; } }
    function shortDate(s, locale) { try { return toDate(s).toLocaleDateString(locale || undefined, { day: 'numeric', month: 'short' }); } catch (e) { return s; } }
    function dayName(s, locale) { try { return toDate(s).toLocaleDateString(locale || undefined, { weekday: 'short', day: 'numeric', month: 'short' }); } catch (e) { return s; } }
    function monthName(ym, locale) { try { return toDate(firstDay(ym)).toLocaleDateString(locale || undefined, { month: 'long', year: 'numeric' }); } catch (e) { return ym; } }
    const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
    // "5, 12 and 19 Oct"
    function dayList(days, locale) {
        if (!days.length) return '';
        const parts = days.map(d => shortDate(d, locale));
        return parts.length === 1 ? parts[0] : parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1];
    }

    const shortDay = s => DAYS[weekday(s)] + ' ' + shortDate(s);
    function monthsBetween(a, b) { const [y1, m1] = a.split('-').map(Number), [y2, m2] = b.split('-').map(Number); return (y2 - y1) * 12 + m2 - m1; }
    function monthShort(ym, locale) { try { return toDate(firstDay(ym)).toLocaleDateString(locale || undefined, { month: 'short', year: 'numeric' }); } catch (e) { return ym; } }
    function monthOnly(ym, locale) { try { return toDate(firstDay(ym)).toLocaleDateString(locale || undefined, { month: 'long' }); } catch (e) { return ym; } }
    // half days: 1 -> "½ day", 2 -> "1 day", 5 -> "2½ days"
    function halvesText(h) {
        const whole = Math.floor(h / 2), half = h % 2 ? '½' : '';
        const n = (whole || !half ? String(whole) : '') + half;
        return n + (h === 2 || h === 1 ? ' day' : ' days');
    }

    // "2" "1.5" "1,5" "1:30" "90 min" -> minutes of overtime, or { error }; blank is 0
    function parseHours(text) {
        const s = String(text == null ? '' : text).trim().toLowerCase();
        if (!s) return { min: 0 };
        if (/^[-−–]/.test(s)) return { error: 'Type the hours without a minus sign.' };
        let min, m;
        if ((m = s.match(/^(\d{1,2}):([0-5]\d)$/))) min = +m[1] * 60 + +m[2];
        else if ((m = s.match(/^(\d{1,4})\s*(m|min|mins|minutes?)$/))) min = +m[1];
        else if ((m = s.match(/^(\d{0,2})(?:[.,](\d{1,2}))?\s*(h|hr|hrs|hours?)?$/)) && (m[1] || m[2])) min = Math.round((+(m[1] || 0) + Number('0.' + (m[2] || '0'))) * 60);
        else return { error: 'Type hours such as 2, 1.5 or 1:30.' };
        if (min > 24 * 60) return { error: 'One day has at most 24 hours.' };
        return { min };
    }
    function hoursText(min) {
        const h = Math.floor(min / 60), m = min % 60;
        return h && m ? h + ' h ' + m + ' min' : h ? h + (h === 1 ? ' hour' : ' hours') : m + ' min';
    }

    // ---------- one worker ----------
    const RULES = ['thirty', 'month', 'work'];
    function newWorker(id, start) {
        return { id, name: '', role: '', start, stop: '', off: [], leave: 0, carry: false, rule: 'thirty',
            pays: [{ from: monthOf(start), c: 0 }], extraC: 0, otC: 0, open: 0, settled: '', marks: {}, entries: [] };
    }
    // the monthly pay in effect in a month
    function payFor(w, ym) { let c = w.pays[0].c; for (const p of w.pays) if (p.from <= ym) c = p.c; return c; }
    const isOff = (w, d) => w.off.includes(weekday(d));
    const employedOn = (w, d) => d >= w.start && (!w.stop || d <= w.stop);
    // how many days the monthly pay is divided by to get one day's pay
    function divisor(w, ym) {
        if (w.rule === 'month') return daysIn(ym);
        if (w.rule === 'work') { let n = 0; for (let d = firstDay(ym); d <= lastDay(ym); d = addDays(d, 1)) if (!isOff(w, d)) n++; return n || daysIn(ym); }
        return 30;
    }
    // a * b / c rounded half up to a whole number (all whole numbers, c > 0)
    const mulDiv = (a, b, c) => Math.floor((2 * a * b + c) / (2 * c));
    // split c cents into n parts that add up exactly; the first parts get the odd cents
    function parts(c, n) { const b = Math.floor(c / n), r = c % n; return Array.from({ length: n }, (_, i) => b + (i < r ? 1 : 0)); }
    // the share of each advance taken back in a month
    function advancesIn(w, ym) {
        const out = [];
        w.entries.forEach(e => {
            if (e.k !== 'adv') return;
            const i = monthsBetween(e.from, ym);
            if (i < 0 || i >= e.n) return;
            const p = parts(e.c, e.n), done = p.slice(0, i + 1).reduce((t, x) => t + x, 0);
            out.push({ e, c: p[i], part: i + 1, left: e.c - done });
        });
        return out.sort((a, b) => a.e.d < b.e.d ? -1 : a.e.d > b.e.d ? 1 : 0);
    }
    const entriesIn = (w, ym, k) => w.entries.filter(e => e.k === k && (k === 'paid' ? e.m === ym : monthOf(e.d) === ym)).sort((a, b) => a.d < b.d ? -1 : a.d > b.d ? 1 : 0);
    // what happened on each day of a month. A working day with no mark counts as worked (days still to come too).
    function attendance(w, ym) {
        const a = { worked: 0, absent: [], half: [], hol: [], extra: [], off: 0, otMin: 0, empDays: 0, empWork: 0, from: '', to: '' };
        for (let d = firstDay(ym), last = lastDay(ym); d <= last; d = addDays(d, 1)) {
            if (!employedOn(w, d)) continue;
            if (!a.from) a.from = d;
            a.to = d; a.empDays++;
            const mk = w.marks[d], k = mk ? mk.k : '', off = isOff(w, d);
            if (mk && mk.ot) a.otMin += mk.ot;
            if (off) { if (k === 'x') a.extra.push(d); else a.off++; continue; }
            a.empWork++;
            if (k === 'a') a.absent.push(d); else if (k === 'h') { a.half.push(d); } else if (k === 'p') a.hol.push(d); else a.worked++;
        }
        return a;
    }
    // what a day looks like in the calendar: worked | absent | half | hol | off | extra | none
    function dayKind(w, d) {
        if (!employedOn(w, d)) return 'none';
        const mk = w.marks[d], k = mk ? mk.k : '';
        if (isOff(w, d)) return k === 'x' ? 'extra' : 'off';
        return k === 'a' ? 'absent' : k === 'h' ? 'half' : k === 'p' ? 'hol' : 'worked';
    }
    // the pay for one month. carriedIn = paid leave left from before (in half days), bfIn = owed from before (minus = paid ahead)
    function monthCalc(w, ym, carriedIn, bfIn) {
        const S = payFor(w, ym), D = divisor(w, ym), a = attendance(w, ym);
        const r = { ym, S, D, a, employed: a.empDays > 0, full: a.empDays === daysIn(ym), counted: 0, base: 0 };
        if (r.employed) {
            r.counted = w.rule === 'work' ? a.empWork : Math.min(a.empDays, 30);
            r.base = r.full ? S : Math.min(S, mulDiv(S, r.counted, D));
        }
        // paid leave is used up by the days off in date order; whatever is left over is unpaid
        const offList = a.absent.map(d => ({ d, h: 2 })).concat(a.half.map(d => ({ d, h: 1 }))).sort((x, y) => x.d < y.d ? -1 : 1);
        r.leaveAvail = r.employed ? 2 * w.leave + carriedIn : 0;
        r.carriedIn = r.employed ? carriedIn : 0;
        r.leaveUsed = 0; r.paidLeave = []; r.unpaid = [];
        offList.forEach(x => {
            const t = Math.min(x.h, r.leaveAvail - r.leaveUsed);
            if (t > 0) { r.leaveUsed += t; r.paidLeave.push({ d: x.d, h: t, of: x.h }); }
            if (x.h - t > 0) r.unpaid.push({ d: x.d, h: x.h - t, of: x.h });
        });
        r.unpaidH = r.unpaid.reduce((t, x) => t + x.h, 0);
        r.carryOut = w.carry && r.employed ? r.leaveAvail - r.leaveUsed : (r.employed ? 0 : carriedIn);
        r.ded = Math.min(r.base, mulDiv(S, r.unpaidH, 2 * D));
        r.extraPay = w.extraC ? w.extraC * a.extra.length : mulDiv(S, a.extra.length, D);
        r.otPay = mulDiv(w.otC, a.otMin, 60);
        r.bonuses = entriesIn(w, ym, 'bonus');
        r.cuts = entriesIn(w, ym, 'ded');
        r.advs = advancesIn(w, ym);
        r.given = entriesIn(w, ym, 'adv');
        r.paids = entriesIn(w, ym, 'paid');
        const sum = l => l.reduce((t, x) => t + x.c, 0);
        r.bonus = sum(r.bonuses); r.cut = sum(r.cuts); r.adv = sum(r.advs); r.paid = sum(r.paids);
        r.net = r.base - r.ded + r.extraPay + r.otPay + r.bonus - r.cut - r.adv;
        r.bf = bfIn;
        r.toPay = bfIn + r.net - r.paid;
        r.busy = r.employed || r.bonus || r.cut || r.adv || r.paid || r.bf || r.given.length;
        return r;
    }
    // every month from the worker's first month up to ym, carrying leave and money from month to month
    function timeline(w, ym) {
        const out = [];
        // months before `settled` were paid before the record was started: they show their pay but owe nothing
        const settled = w.settled && w.settled > monthOf(w.start) ? w.settled : '';
        let carried = 0, bf = settled ? 0 : w.open;
        for (let m = monthOf(w.start); m <= ym; m = addMonth(m, 1)) {
            if (m === settled) bf = w.open;
            const r = monthCalc(w, m, carried, bf);
            if (settled && m < settled) { r.settled = true; r.toPay = 0; }
            out.push(r); carried = r.carryOut; bf = r.toPay;
        }
        return out;
    }
    function monthPay(w, ym) {
        if (ym < monthOf(w.start)) return monthCalc(w, ym, 0, 0);
        const t = timeline(w, ym);
        return t[t.length - 1];
    }

    // ---------- words ----------
    const RULE_TEXT = { thirty: 'monthly pay ÷ 30', month: 'monthly pay ÷ days in the month', work: 'monthly pay ÷ working days in the month' };
    function rateText(S, D, cur, locale) { return S % D === 0 ? fmt(S / D, cur, locale) : fmt(S, cur, locale) + ' ÷ ' + D; }
    function signed(c, cur, locale) { return (c < 0 ? '−' : '') + fmt(c, cur, locale); }
    // "5 Oct, 6 Oct and 27 Oct (half)"
    function halfList(list, locale) {
        const parts = list.map(x => shortDate(x.d, locale) + (x.h === 1 ? ' (half)' : ''));
        return parts.length === 1 ? parts[0] : parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1];
    }
    function attendText(r, w, today) {
        const a = r.a, bits = [];
        if (!r.employed) return '';
        bits.push(plural(a.worked, 'day worked', 'days worked'));
        if (a.half.length) bits.push(plural(a.half.length, 'half day', 'half days'));
        if (a.absent.length) bits.push(plural(a.absent.length, 'day absent', 'days absent'));
        if (a.hol.length) bits.push(plural(a.hol.length, 'paid holiday', 'paid holidays'));
        if (a.extra.length) bits.push(plural(a.extra.length, 'extra day', 'extra days'));
        if (w.off.length) bits.push(plural(a.off, 'weekly day off', 'weekly days off'));
        let t = bits.join(', ');
        if (today && monthOf(today) === r.ym && today < a.to) t += ' (days still to come are counted as worked)';
        else if (today && monthOf(today) < r.ym) t += ' (counted as worked)';
        return t;
    }
    // the pay slip as lines: { t: text, c: cents or null, kind }
    function slipLines(r, w, cur, locale) {
        const L = [], f = c => fmt(c, cur, locale);
        if (r.employed) {
            if (r.full) L.push({ t: 'Monthly pay', c: r.S, kind: 'base' });
            else {
                const unit = w.rule === 'work' ? 'working days' : 'days';
                const range = r.a.from === r.a.to ? shortDate(r.a.from, locale) : shortDate(r.a.from, locale) + ' to ' + shortDate(r.a.to, locale);
                L.push({ t: 'Monthly pay ' + f(r.S) + ' for ' + r.counted + ' of ' + r.D + ' ' + unit + ' (' + range + ')', c: r.base, kind: 'base' });
            }
        }
        if (r.paidLeave.length) {
            const used = halvesText(r.leaveUsed);
            L.push({ t: 'Paid leave: ' + used + ' (' + halfList(r.paidLeave, locale) + '), nothing taken off', c: null, kind: 'note' });
        }
        if (r.unpaidH) L.push({ t: 'Unpaid days off: ' + halvesText(r.unpaidH) + ' (' + halfList(r.unpaid, locale) + ') at ' + rateText(r.S, r.D, cur, locale) + ' a day', c: -r.ded, kind: 'minus' });
        if (r.a.hol.length) L.push({ t: 'Paid holidays: ' + dayList(r.a.hol, locale) + ', nothing taken off', c: null, kind: 'note' });
        if (r.a.extra.length) L.push({ t: 'Worked on a day off: ' + plural(r.a.extra.length, 'day', 'days') + ' (' + dayList(r.a.extra, locale) + ') at ' + (w.extraC ? f(w.extraC) : rateText(r.S, r.D, cur, locale)) + ' a day', c: r.extraPay, kind: 'plus' });
        if (r.a.otMin) L.push({ t: 'Overtime: ' + hoursText(r.a.otMin) + ' at ' + f(w.otC) + ' an hour', c: r.otPay, kind: 'plus' });
        r.bonuses.forEach(e => L.push({ t: 'Bonus' + (e.note ? ': ' + e.note : '') + ' (' + shortDate(e.d, locale) + ')', c: e.c, kind: 'plus', id: e.id }));
        r.cuts.forEach(e => L.push({ t: 'Taken off' + (e.note ? ': ' + e.note : '') + ' (' + shortDate(e.d, locale) + ')', c: -e.c, kind: 'minus', id: e.id }));
        r.advs.forEach(x => {
            let t = 'Advance of ' + f(x.e.c) + ' given ' + shortDate(x.e.d, locale) + (x.e.note ? ' (' + x.e.note + ')' : '');
            if (x.e.n > 1) t += ', part ' + x.part + ' of ' + x.e.n + (x.left ? ', ' + f(x.left) + ' still to take back' : ', all taken back');
            L.push({ t, c: -x.c, kind: 'minus', id: x.e.id });
        });
        r.given.filter(e => e.from !== r.ym).forEach(e => L.push({ t: 'Advance of ' + f(e.c) + ' given ' + shortDate(e.d, locale) + (e.note ? ' (' + e.note + ')' : '') + ', taken back from ' + monthOnly(e.from, locale) + ' pay' + (e.n > 1 ? ' over ' + e.n + ' months' : ''), c: null, kind: 'note', id: e.id }));
        L.push({ t: 'Pay for ' + monthOnly(r.ym, locale), c: r.net, kind: 'total' });
        if (r.bf > 0) L.push({ t: 'Still owed from before', c: r.bf, kind: 'plus' });
        if (r.bf < 0) L.push({ t: 'Paid ahead before (comes off this month)', c: r.bf, kind: 'minus' });
        r.paids.forEach(e => L.push({ t: 'Paid on ' + shortDate(e.d, locale) + (e.note ? ' (' + e.note + ')' : ''), c: -e.c, kind: 'minus', id: e.id }));
        return L;
    }
    function toPayText(r, cur, locale) {
        if (r.settled) return 'Already paid before this record was started';
        if (r.toPay > 0) return 'To pay: ' + fmt(r.toPay, cur, locale);
        if (r.toPay === 0) return r.paid ? 'Fully paid' : 'Nothing to pay';
        if (!r.employed) return 'Nothing to pay. They owe you ' + fmt(-r.toPay, cur, locale);
        return 'Nothing to pay. ' + fmt(-r.toPay, cur, locale) + ' comes off next month\'s pay';
    }
    // the slip as plain text for a message or the other parent
    function slipText(r, w, cur, locale, today) {
        const out = [(w.name || 'Worker') + (w.role ? ' (' + w.role + ')' : '') + ': pay for ' + monthName(r.ym, locale)];
        const at = attendText(r, w, today);
        if (at) out.push('Attendance: ' + at);
        slipLines(r, w, cur, locale).forEach(l => out.push(l.c == null ? l.t : l.t + ': ' + signed(l.c, cur, locale)));
        out.push(toPayText(r, cur, locale));
        return out.join('\n');
    }

    // ---------- saved data ----------
    const emptyState = () => ({ v: 1, cur: '', workers: [] });
    let seq = 0;
    const newId = () => Date.now().toString(36) + (seq++).toString(36) + Math.random().toString(36).slice(2, 6);
    const str = (x, n) => typeof x === 'string' ? x.trim().slice(0, n) : '';
    const int = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi;
    function cleanWorker(o) {
        if (!o || typeof o !== 'object' || !isDay(o.start)) return null;
        const w = newWorker(str(o.id, 40) || newId(), o.start);
        w.name = str(o.name, 40); w.role = str(o.role, 30);
        w.stop = isDay(o.stop) && o.stop >= o.start ? o.stop : '';
        w.off = Array.isArray(o.off) ? [...new Set(o.off.filter(d => int(d, 0, 6)))].sort().slice(0, 6) : [];
        w.leave = int(o.leave, 0, 10) ? o.leave : 0;
        w.carry = o.carry === true;
        w.rule = RULES.includes(o.rule) ? o.rule : 'thirty';
        const pays = Array.isArray(o.pays) ? o.pays.filter(p => p && isMonth(p.from) && int(p.c, 1, MAXPAY)) : [];
        if (!pays.length) return null;
        const seen = {};
        pays.forEach(p => { seen[p.from] = p.c; });
        w.pays = Object.keys(seen).sort().map(m => ({ from: m, c: seen[m] }));
        w.extraC = int(o.extraC, 1, MAXPAY) ? o.extraC : 0;
        w.otC = int(o.otC, 1, MAXPAY) ? o.otC : 0;
        w.settled = isMonth(o.settled) ? o.settled : '';
        w.open = Number.isInteger(o.open) && Math.abs(o.open) <= MAXPAY ? o.open : 0;
        if (o.marks && typeof o.marks === 'object') Object.keys(o.marks).forEach(d => {
            const m = o.marks[d];
            if (!isDay(d) || !m || typeof m !== 'object') return;
            const k = ['a', 'h', 'p', 'x'].includes(m.k) ? m.k : '', ot = int(m.ot, 1, 1440) ? m.ot : 0;
            if (k || ot) w.marks[d] = ot ? { k, ot } : { k };
        });
        w.entries = Array.isArray(o.entries) ? o.entries.slice(0, 5000).filter(e => e && ['adv', 'bonus', 'ded', 'paid'].includes(e.k) && isDay(e.d) && int(e.c, 1, MAXPAY)).map(e => {
            const x = { id: str(e.id, 40) || newId(), k: e.k, d: e.d, c: e.c, note: str(e.note, 60) };
            if (e.k === 'adv') { x.n = int(e.n, 1, 24) ? e.n : 1; x.from = isMonth(e.from) ? e.from : monthOf(e.d); }
            if (e.k === 'paid') x.m = isMonth(e.m) ? e.m : monthOf(e.d);
            return x;
        }) : [];
        return w;
    }
    function cleanState(o) {
        if (!o || typeof o !== 'object' || !Array.isArray(o.workers)) return null;
        const s = emptyState();
        s.cur = SYMBOLS.includes(o.cur) ? o.cur : '';
        const seen = new Set();
        o.workers.slice(0, 30).forEach(x => { const w = cleanWorker(x); if (w && !seen.has(w.id)) { seen.add(w.id); s.workers.push(w); } });
        return s;
    }

    const api = { MAXPAY, SYMBOLS, DAYS, DAYS_LONG, RULES, RULE_TEXT, parseAmount, parseHours, fmt, signed, halvesText, hoursText,
        pad, dayStr, toDate, isDay, isMonth, addDays, daysBetween, monthOf, addMonth, monthsBetween, daysIn, firstDay, lastDay, weekday,
        niceDate, shortDate, shortDay, dayName, monthName, monthShort, monthOnly, plural, dayList, halfList,
        newWorker, payFor, isOff, employedOn, divisor, mulDiv, parts, advancesIn, entriesIn, attendance, dayKind, monthCalc, timeline, monthPay,
        rateText, attendText, slipLines, toPayText, slipText, emptyState, newId, cleanWorker, cleanState };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.HHS = api;
})(typeof window !== 'undefined' ? window : this);
