// Gift Ideas List for Family and Friends: the dates, the money and the words. No page code here, so tests.js can run it in node.
// Money is kept in whole cents and dates as "2026-10-29" day strings counted in whole days, so every sum is exact.
(function (root) {
    'use strict';
    const MAXC = 10000000000;        // money up to 100,000,000 for one gift
    const LIM = { name: 40, what: 80, where: 200, link: 500, note: 500, likes: 500, keep: 120, occ: 40 };

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
    const parseMoney = (t, opt) => parseNum(t, 2, Object.assign({ max: MAXC, blank: 'Type an amount, such as 120.', big: 'That amount is too big.', bad: 'Type an amount such as 120 or 33.50.', decimals: 'Use at most 2 decimal places.', minus: 'Type it without a minus sign.' }, opt || {}));
    // optional money: blank is null, otherwise a whole number of cents (0 is allowed: a gift that cost nothing)
    function parseOptMoney(t) {
        if (String(t == null ? '' : t).trim() === '') return { n: null };
        return parseMoney(t);
    }

    // ---------- text ----------
    const cleanText = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
    const cleanNote = (s, max) => String(s == null ? '' : s).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]+/g, ' ')
        .split('\n').map(l => l.replace(/\s+$/, '')).join('\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
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
    const leap = y => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    const DIM = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    const validDM = (d, m) => Number.isInteger(m) && m >= 1 && m <= 12 && Number.isInteger(d) && d >= 1 && d <= DIM[m - 1];
    // the day of a yearly occasion in a given year; 29 Feb falls on 28 Feb in other years
    const onYear = (o, y) => y + '-' + pad(o.m) + '-' + pad(o.m === 2 && o.d === 29 && !leap(y) ? 28 : o.d);

    const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    function fmtDate(s, t, opt) {
        opt = opt || {};
        const wd = WD[new Date(dNum(s) * 86400000).getUTCDay()];
        return (opt.noDay ? '' : wd + ' ') + (+s.slice(8, 10)) + ' ' + MON[+s.slice(5, 7) - 1] + (!t || s.slice(0, 4) !== t.slice(0, 4) || opt.year ? ' ' + s.slice(0, 4) : '');
    }
    function rel(s, t) {
        const d = daysBetween(t, s);
        if (d === 0) return 'today';
        if (d === 1) return 'tomorrow';
        if (d === -1) return 'yesterday';
        return d > 0 ? 'in ' + d + ' days' : (-d) + ' days ago';
    }
    const dmWords = o => o.d + ' ' + MONTHS[o.m - 1];

    // ---------- occasions ----------
    // kind 'yearly' (every year on d/m), 'once' (one date, for Eid, Diwali, a wedding) or 'none' (no date yet)
    // next(): the coming day of the occasion on or after today, or for a one-time date that passed, that date with past = true
    function next(o, t) {
        if (o.kind === 'yearly') {
            const y = +t.slice(0, 4);
            let d = onYear(o, y);
            if (d < t) d = onYear(o, y + 1);
            return { d, days: daysBetween(t, d), past: false };
        }
        if (o.kind === 'once' && isDate(o.date)) return { d: o.date, days: daysBetween(t, o.date), past: o.date < t };
        return null;
    }
    // the first day that counts for this year's gift: the day after last time's occasion (so a gift given on last year's
    // birthday does not count against this year's budget, but one given early does)
    function cycleStart(o, t) {
        if (o.kind !== 'yearly') return '1900-01-01';
        const n = next(o, t), y = +n.d.slice(0, 4);
        return addDays(onYear(o, y - 1), 1);
    }
    function whenWords(o, t) {
        const n = next(o, t);
        if (!n) return 'No date yet';
        if (n.past) return 'Was on ' + fmtDate(n.d, t);
        return fmtDate(n.d, t) + ' (' + rel(n.d, t) + ')';
    }
    const repeatWords = o => o.kind === 'yearly' ? 'Every year on ' + dmWords(o) : o.kind === 'once' ? 'One time' : 'No date yet';
    const occName = (p, id) => { const o = p.occ.find(x => x.id === id); return o ? o.name : ''; };

    // ---------- money for one occasion ----------
    const cost = i => i.paid != null ? i.paid : (i.price != null ? i.price : 0);
    const hasCost = i => i.paid != null || i.price != null;
    function occStats(p, o, t) {
        const start = cycleStart(o, t);
        const ideas = p.ideas.filter(i => i.st === 'idea' && i.occ === o.id);
        const bought = p.ideas.filter(i => i.st === 'bought' && i.occ === o.id);
        const given = p.ideas.filter(i => i.st === 'given' && i.go === o.id && i.gd >= start && i.gd <= t);
        const spent = bought.concat(given).reduce((a, i) => a + cost(i), 0);
        const r = { ideas: ideas.length, bought: bought.length, given: given.length, spent, budget: o.budget, left: null, over: 0 };
        if (o.budget != null) { r.left = Math.max(0, o.budget - spent); r.over = Math.max(0, spent - o.budget); }
        return r;
    }
    // the person's next dated occasion (one-time dates that passed are skipped)
    function personNext(p, t) {
        let best = null;
        p.occ.forEach(o => { const n = next(o, t); if (n && !n.past && (!best || n.d < best.n.d)) best = { o, n }; });
        return best;
    }
    const openIdeas = p => p.ideas.filter(i => i.st === 'idea');
    const boughtIdeas = p => p.ideas.filter(i => i.st === 'bought');
    const givenIdeas = p => p.ideas.filter(i => i.st === 'given').sort((a, b) => (b.gd || '').localeCompare(a.gd || ''));
    // people sorted by their next occasion; people with no dated occasion last, by name
    function orderPeople(people, t) {
        return people.map(p => ({ p, nx: personNext(p, t) })).sort((a, b) => {
            if (a.nx && b.nx) return a.nx.n.d.localeCompare(b.nx.n.d) || a.p.name.localeCompare(b.p.name);
            if (a.nx || b.nx) return a.nx ? -1 : 1;
            return a.p.name.localeCompare(b.p.name);
        }).map(r => r.p);
    }
    // every dated occasion in the next `days` days (and at least `min` of them), soonest first
    function upcoming(people, t, days, min) {
        const all = [];
        people.forEach(p => p.occ.forEach(o => { const n = next(o, t); if (n && !n.past) all.push({ p, o, d: n.d, days: n.days, st: occStats(p, o, t) }); }));
        all.sort((a, b) => a.d.localeCompare(b.d) || a.p.name.localeCompare(b.p.name) || a.o.name.localeCompare(b.o.name));
        return all.filter((r, k) => r.days <= days || k < (min || 0));
    }
    // gifts already given to this person that look like the new idea ("Perfume" and "Dior perfume")
    function givenBefore(p, what, exceptId) {
        const w = norm(what);
        if (w.length < 3) return [];
        return givenIdeas(p).filter(i => {
            if (i.id === exceptId) return false;
            const g = norm(i.what);
            if (!g) return false;
            if (g === w) return true;
            const gw = g.split(' '), ww = w.split(' ');
            return ww.some(x => x.length >= 4 && gw.includes(x));
        });
    }
    function spentInYear(people, y) {
        let total = 0, count = 0;
        people.forEach(p => p.ideas.forEach(i => {
            const d = i.st === 'given' ? (i.bd || i.gd) : i.st === 'bought' ? i.bd : null;
            if (d && d.slice(0, 4) === String(y) && hasCost(i)) { total += cost(i); count++; }
        }));
        return { total, count };
    }

    // ---------- words ----------
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
    const plural = (n, one, many) => n + ' ' + (n === 1 ? one : (many || one + 's'));
    // "1 bought, 2 ideas" / "No gift yet"
    function giftWords(st) {
        const parts = [];
        if (st.given) parts.push(st.given + ' given');
        if (st.bought) parts.push(st.bought + ' bought');
        if (st.ideas) parts.push(plural(st.ideas, 'idea'));
        return parts.length ? parts.join(', ') : 'No gift ideas yet';
    }
    function budgetWords(st, fm) {
        if (st.budget == null) return st.spent ? fm(st.spent) + ' spent' : '';
        if (!st.spent) return 'Budget ' + fm(st.budget) + ': nothing spent yet';
        if (st.over) return fm(st.spent) + ' spent of ' + fm(st.budget) + ': ' + fm(st.over) + ' over budget';
        return fm(st.spent) + ' spent of ' + fm(st.budget) + ': ' + fm(st.left) + ' left';
    }
    function ideaLine(p, i, fm) {
        const bits = [i.what];
        const price = i.paid != null ? i.paid : i.price;
        if (price != null) bits.push(fm(price));
        if (i.occ && occName(p, i.occ)) bits.push('for ' + occName(p, i.occ));
        if (i.where) bits.push('from ' + i.where);
        let s = bits.join(', ');
        if (i.link) s += ' ' + i.link;
        if (i.st === 'bought') s = 'BOUGHT: ' + s + (i.keep ? ' (kept: ' + i.keep + ')' : '');
        return s;
    }
    // plain text for one person, to copy or email to a partner or family member
    function personText(p, t, cur, loc) {
        const fm = c => fmtMoney(c, cur, loc), L = [p.name];
        p.occ.forEach(o => {
            const st = occStats(p, o, t), b = budgetWords(st, fm);
            L.push(o.name + ': ' + whenWords(o, t) + (o.budget != null ? ', budget ' + fm(o.budget) : '') + (b && o.budget == null ? ', ' + b : ''));
        });
        if (p.likes) L.push('About them: ' + p.likes.replace(/\n+/g, '; '));
        const b = boughtIdeas(p), o = openIdeas(p), g = givenIdeas(p);
        if (b.length) { L.push('Bought, not given yet:'); b.forEach(i => L.push('- ' + ideaLine(p, i, fm).replace(/^BOUGHT: /, ''))); }
        if (o.length) { L.push('Gift ideas:'); o.forEach(i => L.push('- ' + ideaLine(p, i, fm) + (i.note ? ' (' + i.note.replace(/\n+/g, '; ') + ')' : ''))); }
        if (!b.length && !o.length) L.push('No gift ideas yet.');
        if (g.length) L.push('Already given: ' + g.map(i => i.what + ' (' + givenWhen(i) + ')').join(', '));
        return L.join('\n');
    }
    const givenWhen = i => (i.gon ? i.gon + ' ' : '') + (i.gd ? i.gd.slice(0, 4) : '');
    function summaryText(state, t, loc) {
        const fm = c => fmtMoney(c, state.cur, loc), L = ['Gift ideas: ' + fmtDate(t, t, { year: true })];
        const up = upcoming(state.people, t, 60, 3);
        if (up.length) {
            L.push('', 'Coming up:');
            up.forEach(r => L.push('- ' + r.p.name + ', ' + r.o.name + ': ' + fmtDate(r.d, t) + ' (' + rel(r.d, t) + '), ' + giftWords(r.st).toLowerCase().replace(/^no gift ideas yet$/, 'no gift ideas yet')));
        }
        orderPeople(state.people, t).forEach(p => { L.push(''); L.push(personText(p, t, state.cur, loc)); });
        if (!state.people.length) L.push('', 'No one on the list yet.');
        return L.join('\n');
    }

    // calendar file: every dated occasion, yearly ones repeating, each with a reminder a week before to buy the gift
    function ics(people, t, stamp) {
        const esc = x => String(x).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
        const fold = line => { const out = []; let s = line; while (s.length > 74) { out.push(s.slice(0, 74)); s = ' ' + s.slice(74); } out.push(s); return out.join('\r\n'); };
        const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//umar8092 apps//Gift Ideas List for Family and Friends//EN', 'CALSCALE:GREGORIAN'];
        let n = 0;
        people.forEach(p => p.occ.forEach(o => {
            const nx = next(o, t);
            if (!nx || nx.past) return;
            n++;
            // a yearly 29 Feb repeats on the last day of February
            const rule = o.kind !== 'yearly' ? null : o.m === 2 && o.d === 29 ? 'RRULE:FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1' : 'RRULE:FREQ=YEARLY';
            L.push('BEGIN:VEVENT', 'UID:' + p.id + '-' + o.id + '@gift-ideas-list-for-family-and-friends', 'DTSTAMP:' + stamp,
                'DTSTART;VALUE=DATE:' + nx.d.replace(/-/g, ''), 'DTEND;VALUE=DATE:' + addDays(nx.d, 1).replace(/-/g, ''));
            if (rule) L.push(rule);
            L.push(fold('SUMMARY:' + esc(p.name + ': ' + o.name)),
                fold('DESCRIPTION:' + esc('Gift for ' + p.name + '. Your ideas are in the Gift Ideas List.')),
                'BEGIN:VALARM', 'ACTION:DISPLAY', fold('DESCRIPTION:' + esc('Buy a gift for ' + p.name + ' (' + o.name + ' in a week)')), 'TRIGGER:-P7D', 'END:VALARM', 'END:VEVENT');
        }));
        L.push('END:VCALENDAR');
        return { text: L.join('\r\n') + '\r\n', count: n };
    }

    // ---------- saved data ----------
    const emptyState = () => ({ v: 1, cur: '', people: [] });
    const okId = s => typeof s === 'string' && /^[a-z0-9_-]{1,40}$/i.test(s);
    const okMoney = n => n == null ? null : (Number.isInteger(n) && n >= 0 && n <= MAXC ? n : undefined);
    function cleanOcc(o) {
        if (!o || typeof o !== 'object' || !okId(o.id)) return null;
        const name = cleanText(o.name, LIM.occ);
        if (!name) return null;
        const r = { id: o.id, name, kind: o.kind, budget: null };
        const b = okMoney(o.budget); if (b === undefined) return null; r.budget = b;
        if (o.kind === 'yearly') { if (!validDM(o.d, o.m)) return null; r.d = o.d; r.m = o.m; }
        else if (o.kind === 'once') { if (!isDate(o.date)) return null; r.date = o.date; }
        else if (o.kind !== 'none') return null;
        return r;
    }
    function cleanIdea(i, occIds) {
        if (!i || typeof i !== 'object' || !okId(i.id)) return null;
        const what = cleanText(i.what, LIM.what);
        if (!what || !['idea', 'bought', 'given'].includes(i.st)) return null;
        const price = okMoney(i.price), paid = okMoney(i.paid);
        if (price === undefined || paid === undefined) return null;
        const r = { id: i.id, what, st: i.st, price, paid: i.st === 'idea' ? null : paid, occ: occIds.includes(i.occ) ? i.occ : '',
            where: cleanText(i.where, LIM.where), link: i.link ? (cleanLink(i.link) || '') : '', note: cleanNote(i.note, LIM.note), added: isDate(i.added) ? i.added : null };
        if (typeof i.photo === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(i.photo) && i.photo.length < 400000) r.photo = i.photo;
        if (i.st !== 'idea') { r.bd = isDate(i.bd) ? i.bd : null; r.keep = cleanText(i.keep, LIM.keep); }
        if (i.st === 'bought' && !r.bd) return null;
        if (i.st === 'given') {
            if (!isDate(i.gd)) return null;
            r.gd = i.gd; r.go = occIds.includes(i.go) ? i.go : ''; r.gon = cleanText(i.gon, LIM.occ);
        }
        return r;
    }
    function cleanPerson(p) {
        if (!p || typeof p !== 'object' || !okId(p.id)) return null;
        const name = cleanText(p.name, LIM.name);
        if (!name) return null;
        const occ = (Array.isArray(p.occ) ? p.occ : []).map(cleanOcc).filter(Boolean).slice(0, 30);
        const ids = occ.map(o => o.id);
        const ideas = (Array.isArray(p.ideas) ? p.ideas : []).map(i => cleanIdea(i, ids)).filter(Boolean).slice(0, 500);
        return { id: p.id, name, likes: cleanNote(p.likes, LIM.likes), occ, ideas };
    }
    const CURS = ['', '$', '€', '£', 'Rs', '₹', 'A$', 'C$', 'NZ$', 'AED', 'SAR', 'QAR', 'KWD', 'R', '৳', '₦', 'KSh', 'RM', 'Rp', '₱', 'S$', '¥', '₩', '₺', 'R$', 'kr', 'CHF', 'zł'];
    function cleanState(s) {
        if (!s || typeof s !== 'object' || !Array.isArray(s.people)) return null;
        const seen = new Set(), people = [];
        s.people.forEach(p => { const c = cleanPerson(p); if (c && !seen.has(c.id)) { seen.add(c.id); people.push(c); } });
        return { v: 1, cur: CURS.includes(s.cur) ? s.cur : '', people: people.slice(0, 300) };
    }

    const api = { MAXC, LIM, CURS, parseNum, parseMoney, parseOptMoney, cleanText, cleanNote, cleanLink, linkHost, norm, isDate, today, addDays, daysBetween, leap, validDM, onYear,
        fmtDate, rel, dmWords, MONTHS, next, cycleStart, whenWords, repeatWords, occName, cost, occStats, personNext, openIdeas, boughtIdeas, givenIdeas, orderPeople,
        upcoming, givenBefore, spentInYear, fmtMoney, moneyInput, plural, giftWords, budgetWords, ideaLine, personText, givenWhen, summaryText, ics, emptyState, cleanOcc, cleanIdea, cleanPerson, cleanState };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.GIFTS = api;
})(typeof window !== 'undefined' ? window : this);
