// Tuition Fee and Attendance Register for Tutors: the maths and the words, with no page code, so tests.js can check it in node.
// Money is whole cents (hundredths) so every total is exact. Dates are calendar days ('2026-10-17'), months are '2026-10'.
// Each student has their own class days and fee (by the month or by the class). A class day with no mark counts as attended;
// the tutor taps only the absences. Unpaid fees carry to the next month and paying extra comes off the next month.
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
    function signed(c, cur, locale) { return (c < 0 ? '−' : '') + fmt(c, cur, locale); }
    // a * b / c rounded half up to a whole number (all whole numbers, c > 0)
    const mulDiv = (a, b, c) => Math.floor((2 * a * b + c) / (2 * c));
    function dayNames(days) { return [1, 2, 3, 4, 5, 6, 0].filter(d => days.includes(d)).map(d => DAYS[d]).join(', '); }

    // ---------- one student ----------
    const BILLS = ['month', 'class'];
    function newStudent(id, start) {
        return { id, name: '', who: '', subj: '', days: [], bill: 'month', fees: [{ from: monthOf(start), c: 0 }], start, stop: '',
            part: 'full', missed: false, open: 0, marks: {}, entries: [] };
    }
    // the fee in effect in a month (a monthly fee, or the fee for one class)
    function feeFor(s, ym) { let c = s.fees[0].c; for (const f of s.fees) if (f.from <= ym) c = f.c; return c; }
    const isClassDay = (s, d) => s.days.includes(weekday(d));
    const enrolledOn = (s, d) => d >= s.start && (!s.stop || d <= s.stop);
    // class days in a month between two dates (no fixed days: every calendar day counts, for a part-month fee)
    function countDays(s, from, to) { let n = 0; for (let d = from; d <= to; d = addDays(d, 1)) if (!s.days.length || isClassDay(s, d)) n++; return n; }
    // what a day is for this student: present | absent | extra | hol | none (no class that day for them) | off | out (not enrolled)
    // later = the day has not come yet (nothing is counted for it)
    function dayKind(s, d, hol, today) {
        if (!enrolledOn(s, d)) return { k: 'out' };
        const mk = s.marks[d], later = d > today;
        if (mk === 'x') return { k: 'extra', later };
        if (!isClassDay(s, d)) return { k: 'off', later, hol: !!hol[d] };
        if (hol[d]) return { k: 'hol', later };
        if (mk === 'c') return { k: 'none', later };
        if (mk === 'a') return { k: 'absent', later };
        return { k: 'present', later };
    }
    const entriesIn = (s, ym, k) => s.entries.filter(e => e.k === k && e.m === ym).sort((a, b) => a.d < b.d ? -1 : a.d > b.d ? 1 : 0);
    const sum = list => list.reduce((t, e) => t + e.c, 0);
    // one month on its own, without what was carried from earlier months
    function monthCalc(s, ym, hol, today) {
        const first = firstDay(ym), last = lastDay(ym);
        const from = s.start > first ? s.start : first, to = s.stop && s.stop < last ? s.stop : last;
        const r = { ym, rate: feeFor(s, ym), active: from <= to, from, to, present: [], absent: [], extra: [], hol: [], none: [], later: 0, fee: 0, n: 0, partial: null };
        if (r.active) for (let d = from; d <= to; d = addDays(d, 1)) {
            const k = dayKind(s, d, hol, today);
            if (k.k === 'off' || k.k === 'out') continue;
            if (k.later) { if (k.k === 'present' || k.k === 'extra') r.later++; continue; }
            r[k.k].push(d);
        }
        r.attended = r.present.length + r.extra.length;
        r.held = r.attended + r.absent.length;
        r.soFar = s.bill === 'class' && ym >= monthOf(today);
        if (r.active) {
            if (s.bill === 'class') {
                r.n = r.attended + (s.missed ? r.absent.length : 0);
                r.fee = r.rate * r.n;
            } else if (s.part === 'part' && (from > first || to < last)) {
                const T = countDays(s, first, last), R = countDays(s, from, to);
                r.partial = { R, T };
                r.fee = mulDiv(r.rate, R, T);
            } else r.fee = r.rate;
        }
        r.adds = entriesIn(s, ym, 'add');
        r.discs = entriesIn(s, ym, 'disc');
        r.pays = entriesIn(s, ym, 'pay');
        r.charge = r.fee + sum(r.adds) - sum(r.discs);
        r.paid = sum(r.pays);
        return r;
    }
    // the month with everything carried in: unpaid fees from before, or money paid extra before (carry below 0)
    function monthFee(s, ym, hol, today) {
        const sm = monthOf(s.start);
        let carry = s.open;
        for (let m = sm; m < ym; m = addMonth(m, 1)) { const c = monthCalc(s, m, hol, today); carry += c.charge - c.paid; }
        const r = monthCalc(s, ym, hol, today);
        r.started = ym >= sm;
        r.carry = r.started ? carry : 0;
        r.due = r.charge + r.carry;
        r.toPay = r.due - r.paid;
        r.ahead = s.entries.filter(e => e.k === 'pay' && e.m > ym).sort((a, b) => a.m < b.m ? -1 : a.m > b.m ? 1 : 0);
        // listed for the month when they had classes, owe money, or paid something
        r.busy = r.active || r.carry !== 0 || r.paid > 0 || r.adds.length > 0 || r.discs.length > 0;
        return r;
    }
    // late: a monthly fee for this month after the due day, or anything still unpaid from a month that has ended
    function isLate(s, r, today, dueDay) {
        if (r.toPay <= 0) return false;
        if (r.ym < monthOf(today)) return true;
        if (r.ym > monthOf(today)) return false;
        return r.carry > 0 || (s.bill === 'month' && Number(today.slice(8)) > dueDay);
    }

    // ---------- words ----------
    function attendText(r, locale) {
        if (!r.active) return '';
        if (!r.held) return r.later ? 'No classes yet this month (' + plural(r.later, 'class', 'classes') + ' to come).' : 'No classes this month.';
        let t = 'Attended ' + r.attended + ' of ' + plural(r.held, 'class', 'classes');
        const bits = [];
        if (r.absent.length) bits.push('absent ' + dayList(r.absent, locale));
        if (r.extra.length) bits.push(plural(r.extra.length, 'extra class', 'extra classes') + ' (' + dayList(r.extra, locale) + ')');
        if (bits.length) t += ': ' + bits.join('; ');
        return t + '.';
    }
    // the fee lines of a month, in the order a tutor works it out
    function feeLines(r, s, cur, locale) {
        const f = c => fmt(c, cur, locale), L = [];
        if (r.active) {
            if (s.bill === 'class') {
                const missed = s.missed && r.absent.length ? ' (' + r.absent.length + ' missed, charged)' : '';
                L.push({ t: plural(r.n, 'class', 'classes') + missed + ' × ' + f(r.rate) + (r.soFar ? ' so far' : ''), c: r.fee, kind: 'fee' });
            } else if (r.partial) {
                L.push({ t: 'Fee for ' + r.partial.R + ' of ' + r.partial.T + (s.days.length ? ' class days' : ' days') + ' (monthly fee ' + f(r.rate) + ')', c: r.fee, kind: 'fee' });
            } else L.push({ t: 'Monthly fee', c: r.fee, kind: 'fee' });
        }
        r.adds.forEach(e => L.push({ t: 'Extra charge' + (e.note ? ': ' + e.note : ''), c: e.c, kind: 'add', id: e.id }));
        r.discs.forEach(e => L.push({ t: 'Discount' + (e.note ? ': ' + e.note : ''), c: -e.c, kind: 'disc', id: e.id }));
        if (r.carry > 0) L.push({ t: 'Unpaid from before', c: r.carry, kind: 'carry' });
        if (r.carry < 0) L.push({ t: 'Paid extra before', c: r.carry, kind: 'carry' });
        if (L.length > 1) L.push({ t: 'Total for ' + monthOnly(r.ym, locale), c: r.due, kind: 'total' });
        r.pays.forEach(e => L.push({ t: 'Paid ' + shortDate(e.d, locale) + (e.note ? ' (' + e.note + ')' : ''), c: -e.c, kind: 'pay', id: e.id }));
        return L;
    }
    function statusText(r, cur, locale) {
        const f = c => fmt(c, cur, locale), mo = monthOnly(r.ym, locale);
        if (r.toPay > 0) return 'Still to pay: ' + f(r.toPay) + (r.paid ? ' (' + f(r.paid) + ' paid)' : '');
        if (r.toPay < 0) return 'Paid ' + f(-r.toPay) + ' extra. It comes off the next fee.';
        if (r.due > 0 || r.paid > 0) return mo + ' paid in full';
        if (r.soFar && r.active) return 'No classes to pay for yet in ' + mo;
        return 'Nothing to pay for ' + mo;
    }
    // the message for a parent: a reminder while money is owed, a receipt once it is paid
    function messageText(r, s, cur, locale, greet) {
        const f = c => fmt(c, cur, locale), mo = monthName(r.ym, locale), who = s.name || 'your child', out = [];
        const hi = (greet || 'Hello').trim();
        out.push(hi + (/[,!.]$/.test(hi) ? '' : ','));
        if (r.toPay > 0) out.push('This is a reminder that ' + who + "'s tuition fee for " + mo + ' is ' + f(r.due) + (r.paid ? ', of which ' + f(r.paid) + ' has been received. Still to pay: ' + f(r.toPay) + '.' : '.'));
        else out.push('Thank you. ' + who + "'s tuition fee for " + mo + (r.due > 0 ? ' (' + f(r.due) + ')' : '') + ' has been received in full.');
        const lines = feeLines(r, s, cur, locale).filter(l => l.kind !== 'total');
        if (lines.length > 1) lines.forEach(l => out.push('- ' + l.t + ': ' + signed(l.c, cur, locale)));
        if (r.toPay < 0) out.push(f(-r.toPay) + ' paid extra will come off the next fee.');
        const at = attendText(r, locale);
        if (at && r.held) out.push('Classes in ' + monthOnly(r.ym, locale) + ': ' + at.charAt(0).toLowerCase() + at.slice(1));
        out.push('Thank you.');
        return out.join('\n');
    }
    // the list of who has not paid, for the tutor
    function unpaidText(list, ym, cur, locale) {
        const f = c => fmt(c, cur, locale), owe = list.filter(x => x.r.toPay > 0);
        if (!owe.length) return 'All fees for ' + monthName(ym, locale) + ' are paid.';
        const L = ['Fees not paid yet for ' + monthName(ym, locale) + ' (' + owe.length + '):'];
        owe.forEach(x => L.push('- ' + (x.s.name || 'Student') + ': ' + f(x.r.toPay) + (x.r.paid ? ' (' + f(x.r.paid) + ' paid)' : '') + (x.r.carry > 0 ? ' (includes ' + f(x.r.carry) + ' from before)' : '')));
        L.push('Total still to collect: ' + f(owe.reduce((t, x) => t + x.r.toPay, 0)));
        return L.join('\n');
    }
    // every student's month together
    function summary(st, ym, today) {
        const list = st.students.map(s => ({ s, r: monthFee(s, ym, st.hol, today) })).filter(x => x.r.busy);
        const owe = list.filter(x => x.r.toPay > 0);
        let received = 0;
        st.students.forEach(s => s.entries.forEach(e => { if (e.k === 'pay' && monthOf(e.d) === ym) received += e.c; }));
        return { list, owe, charged: list.reduce((t, x) => t + x.r.charge, 0), paid: list.reduce((t, x) => t + x.r.paid, 0),
            toCollect: owe.reduce((t, x) => t + x.r.toPay, 0), received };
    }
    // students who have a class on a day
    function classOn(st, d, today) {
        return st.students.filter(s => { const k = dayKind(s, d, st.hol, today).k; return k === 'present' || k === 'absent' || k === 'extra'; });
    }

    // ---------- saved data ----------
    const emptyState = () => ({ v: 1, cur: '', due: 10, greet: '', hol: {}, students: [] });
    let seq = 0;
    const newId = () => Date.now().toString(36) + (seq++).toString(36) + Math.random().toString(36).slice(2, 6);
    const str = (x, n) => typeof x === 'string' ? x.trim().slice(0, n) : '';
    const int = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi;
    function cleanStudent(o) {
        if (!o || typeof o !== 'object' || !isDay(o.start)) return null;
        const s = newStudent(str(o.id, 40) || newId(), o.start);
        s.name = str(o.name, 40); s.who = str(o.who, 40); s.subj = str(o.subj, 40);
        if (!s.name) return null;
        s.stop = isDay(o.stop) && o.stop >= o.start ? o.stop : '';
        s.days = Array.isArray(o.days) ? [...new Set(o.days.filter(d => int(d, 0, 6)))].sort() : [];
        s.bill = BILLS.includes(o.bill) ? o.bill : 'month';
        s.part = o.part === 'part' ? 'part' : 'full';
        s.missed = o.missed === true;
        const fees = Array.isArray(o.fees) ? o.fees.filter(p => p && isMonth(p.from) && int(p.c, 0, MAXPAY)) : [];
        if (!fees.length) return null;
        const seen = {};
        fees.forEach(p => { seen[p.from] = p.c; });
        s.fees = Object.keys(seen).sort().map(m => ({ from: m, c: seen[m] }));
        s.open = Number.isInteger(o.open) && Math.abs(o.open) <= MAXPAY ? o.open : 0;
        if (o.marks && typeof o.marks === 'object') Object.keys(o.marks).forEach(d => { if (isDay(d) && ['a', 'c', 'x'].includes(o.marks[d])) s.marks[d] = o.marks[d]; });
        const sm = monthOf(s.start);
        s.entries = Array.isArray(o.entries) ? o.entries.slice(0, 5000).filter(e => e && ['pay', 'add', 'disc'].includes(e.k) && isDay(e.d) && int(e.c, 1, MAXPAY))
            .map(e => ({ id: str(e.id, 40) || newId(), k: e.k, d: e.d, c: e.c, m: isMonth(e.m) && e.m >= sm ? e.m : (monthOf(e.d) >= sm ? monthOf(e.d) : sm), note: str(e.note, 60) })) : [];
        return s;
    }
    function cleanState(o) {
        if (!o || typeof o !== 'object' || !Array.isArray(o.students)) return null;
        const s = emptyState();
        s.cur = SYMBOLS.includes(o.cur) ? o.cur : '';
        s.due = int(o.due, 1, 28) ? o.due : 10;
        s.greet = str(o.greet, 40);
        if (o.hol && typeof o.hol === 'object') Object.keys(o.hol).forEach(d => { if (isDay(d) && o.hol[d]) s.hol[d] = 1; });
        const seen = new Set();
        o.students.slice(0, 300).forEach(x => { const w = cleanStudent(x); if (w && !seen.has(w.id)) { seen.add(w.id); s.students.push(w); } });
        return s;
    }

    const api = { MAXPAY, SYMBOLS, DAYS, DAYS_LONG, BILLS, parseAmount, fmt, signed, mulDiv, dayNames,
        pad, dayStr, toDate, isDay, isMonth, addDays, daysBetween, monthOf, addMonth, monthsBetween, daysIn, firstDay, lastDay, weekday,
        niceDate, shortDate, shortDay, dayName, monthName, monthShort, monthOnly, plural, dayList,
        newStudent, feeFor, isClassDay, enrolledOn, countDays, dayKind, monthCalc, monthFee, isLate,
        attendText, feeLines, statusText, messageText, unpaidText, summary, classOn, emptyState, newId, cleanStudent, cleanState };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.TFR = api;
})(typeof window !== 'undefined' ? window : this);
