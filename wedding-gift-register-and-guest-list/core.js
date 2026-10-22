// Wedding Gift Register and Guest List: the maths and the words, with no page code, so tests.js can check it in node.
// Amounts are whole cents (hundredths) so totals are always exact. Dates are calendar days ('2026-10-22').
(function (root) {
    'use strict';
    const MAX = 999999999999; // 9,999,999,999.99 in cents
    const SYMBOLS = ['', '$', '€', '£', '₹', 'Rs', '¥', '₩', '₦', '₱', 'R', 'kr', 'CHF', 'AED', 'SAR', 'RM', 'Rp', '৳', '₺', 'R$', 'zł', '₽', '₴', 'KSh', '₵', 'E£', 'A$', 'C$'];
    // "2,500" "2.500" "2 500" "1,00,000" "12.5" "12,50" "$40" "Rs 1500" -> cents, or { error }
    function parseAmount(text) {
        let s = String(text == null ? '' : text).replace(/[   ']/g, ' ').trim();
        if (!s) return { error: 'Type the amount, such as 2500.' };
        s = s.replace(/^(rs\.?|inr|usd|eur|gbp|pkr|aed|sar|[$€£₹¥₩₦₱৳₺₽₴])\s*/i, '').replace(/\s*(rs\.?|[$€£₹¥₩₦₱৳₺₽₴])$/i, '').trim();
        if (/^[-−–]/.test(s)) return { error: 'Type the amount without a minus sign.' };
        if (/^\+/.test(s)) s = s.slice(1).trim();
        if (!/^[\d.,\s]+$/.test(s) || !/\d/.test(s)) return { error: 'Type a number, such as 2500 or 12.50.' };
        let whole, frac = '';
        if (/\s/.test(s)) {
            const parts = s.split(/\s+/);
            const last = parts[parts.length - 1];
            const dm = last.match(/^(\d{3})([.,]\d{0,2})?$/);
            if (!/^\d{1,3}$/.test(parts[0]) || !parts.slice(1, -1).every(p => /^\d{3}$/.test(p)) || !dm) return { error: 'That number looks mistyped. Type it like 2500 or 2,500.' };
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
            if (intPart.includes(dec || '\u0000')) return { error: 'That number looks mistyped. Type it like 2500 or 2,500.' };
            if (intPart.includes(th)) {
                const re = new RegExp('^\\d{1,3}(\\' + th + '\\d{3})+$'), ind = new RegExp('^\\d{1,2}(\\' + th + '\\d{2})*\\' + th + '\\d{3}$');
                if (!re.test(intPart) && !ind.test(intPart)) return { error: 'That number looks mistyped. Type it like 2500 or 2,500.' };
            }
            if (!/^[\d]*$/.test(fracPart)) return { error: 'That number looks mistyped. Type it like 2500 or 2,500.' };
            whole = intPart.split(th).join(''); frac = fracPart;
            if (whole === '' && frac === '') return { error: 'Type a number, such as 2500 or 12.50.' };
        }
        if (frac.length > 2) return { error: 'Use at most 2 numbers after the decimal point, such as 12.50.' };
        whole = whole.replace(/^0+(?=\d)/, '') || '0';
        if (whole.length > 10) return { error: 'That amount is too big. The most is 9,999,999,999.99.' };
        const cents = Number(whole) * 100 + Number((frac + '00').slice(0, 2));
        if (cents === 0) return { error: 'Type an amount more than 0.' };
        if (cents > MAX) return { error: 'That amount is too big. The most is 9,999,999,999.99.' };
        return { cents };
    }

    function fmt(cents, cur, locale) {
        const n = Math.abs(cents);
        let t;
        try { t = new Intl.NumberFormat(locale || undefined, { minimumFractionDigits: n % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(n / 100); }
        catch (e) { t = (n / 100).toFixed(n % 100 ? 2 : 0); }
        if (!cur) return t;
        return /^[A-Za-z]/.test(cur) || /[A-Za-z]$/.test(cur) ? cur + ' ' + t : cur + t;
    }
    // lakh grouping (3,45,000) for rupees and taka, the reader's own style otherwise
    const localeFor = (cur, fallback) => (['Rs', '₹', '৳'].includes(cur) ? 'en-IN' : fallback || undefined);

    // dates
    const pad = n => String(n).padStart(2, '0');
    const dayStr = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    function toDate(s) { const [y, m, d] = s.split('-').map(Number); const t = new Date(y, m - 1, d, 12); t.setFullYear(y); return t; }
    const isDay = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && s >= '1900-01-01' && dayStr(toDate(s)) === s;
    function niceDate(s, locale) {
        try { return toDate(s).toLocaleDateString(locale || undefined, { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return s; }
    }
    const plural = (n, one, many) => n.toLocaleString('en') + ' ' + (n === 1 ? one : many);

    const clean = (s, max) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, max);
    const cleanName = s => clean(s, 60);
    const same = (a, b) => clean(a, 200).toLocaleLowerCase() === clean(b, 200).toLocaleLowerCase();
    const label = f => f.name + (f.city ? ' (' + f.city + ')' : '');

    // which family did the person mean? an exact "Name (City)" label first, then the name if only one family has it
    function findFamily(state, typed, city) {
        const t = cleanName(typed); if (!t) return { none: true };
        const c = clean(city, 40);
        if (c) { const f = state.families.find(x => same(x.name, t) && same(x.city, c)); return f ? { fam: f } : { none: true }; }
        const exact = state.families.find(x => same(label(x), t)); if (exact) return { fam: exact };
        const byName = state.families.filter(x => same(x.name, t));
        if (byName.length === 1) return { fam: byName[0] };
        if (byName.length > 1) return { many: byName };
        return { none: true };
    }

    const giftOrder = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.seq - b.seq);
    const eventOf = (state, id) => state.events.find(e => e.id === id);
    // where a gift happened, in words: our event's name, or the name typed for their event
    const eventName = (state, g) => (g.dir === 'in' ? (eventOf(state, g.event) || { name: 'your event' }).name : g.event || 'their event');

    // one family: what they gave us, what we gave them, and the difference
    function familySummary(state, fam) {
        const gifts = state.gifts.filter(g => g.fam === fam.id).sort(giftOrder);
        const inn = gifts.filter(g => g.dir === 'in'), out = gifts.filter(g => g.dir === 'out');
        const sum = l => l.reduce((t, g) => t + g.amount, 0);
        const received = sum(inn), given = sum(out);
        return { gifts, inn, out, received, given, diff: received - given, lastIn: inn[inn.length - 1] || null, lastOut: out[out.length - 1] || null,
            itemsIn: inn.filter(g => g.item).map(g => g.item), itemsOut: out.filter(g => g.item).map(g => g.item),
            last: gifts.length ? gifts[gifts.length - 1].date : '' };
    }
    // "5,000 and gold ring" / "gold ring" / "5,000"
    function giftWhat(g, cur, locale) { return [g.amount ? fmt(g.amount, cur, locale) : '', g.item].filter(Boolean).join(' and '); }
    function oneGift(state, g, cur, locale) { return giftWhat(g, cur, locale) + ' at ' + eventName(state, g) + ', ' + niceDate(g.date, locale); }

    // the lines in a family's box
    function familyLines(state, fam, locale) {
        const s = familySummary(state, fam), cur = state.cur, L = localeFor(cur, locale);
        const total = (amt, items) => [amt ? fmt(amt, cur, L) : '', items.join(', ')].filter(Boolean).join(' + ');
        const lines = {};
        lines.gave = s.inn.length === 0 ? 'Gave you: nothing yet'
            : s.inn.length === 1 ? 'Gave you: ' + oneGift(state, s.inn[0], cur, L)
            : 'Gave you: ' + total(s.received, s.itemsIn) + ' in all (' + s.inn.length + ' gifts, last ' + oneGift(state, s.lastIn, cur, L) + ')';
        lines.you = s.out.length === 0 ? 'You gave them: nothing yet'
            : s.out.length === 1 ? 'You gave them: ' + oneGift(state, s.out[0], cur, L)
            : 'You gave them: ' + total(s.given, s.itemsOut) + ' in all (' + s.out.length + ' gifts, last ' + oneGift(state, s.lastOut, cur, L) + ')';
        if (!s.inn.length && !s.out.length) { lines.bal = 'No gifts written down yet.'; lines.tone = 'none'; }
        else if (s.diff > 0) { lines.bal = 'They have given you ' + fmt(s.diff, cur, L) + ' more than you gave them.'; lines.tone = 'owe'; }
        else if (s.diff < 0) { lines.bal = 'You have given them ' + fmt(s.diff, cur, L) + ' more than they gave you.'; lines.tone = 'ahead'; }
        else if (s.received) { lines.bal = 'Even: you have each given ' + fmt(s.received, cur, L) + '.'; lines.tone = 'even'; }
        else { lines.bal = 'Gifts in kind only, no cash.'; lines.tone = 'even'; }
        if ((s.itemsIn.length || s.itemsOut.length) && s.received + s.given > 0) lines.bal += ' Gifts in kind are not counted in this.';
        return lines;
    }

    // our events, newest first, with what came in at each
    function eventSummary(state, id) {
        const gifts = state.gifts.filter(g => g.dir === 'in' && g.event === id).sort(giftOrder);
        const cashFam = new Set(gifts.filter(g => g.amount).map(g => g.fam)), allFam = new Set(gifts.map(g => g.fam));
        return { gifts, total: gifts.reduce((t, g) => t + g.amount, 0), cashFamilies: cashFam.size, families: allFam.size,
            items: gifts.filter(g => g.item).length, date: gifts.length ? gifts[0].date : '', guests: state.guests.filter(x => x.event === id).length };
    }
    function eventsByDate(state) {
        return state.events.map((e, i) => ({ e, i, s: eventSummary(state, e.id) }))
            .sort((a, b) => (b.s.date || '9999') > (a.s.date || '9999') ? 1 : (b.s.date || '9999') < (a.s.date || '9999') ? -1 : b.i - a.i).map(x => x.e);
    }
    // "Received 3,45,000 from 112 families · 6 gifts in kind"
    function eventWords(state, id, locale) {
        const s = eventSummary(state, id), L = localeFor(state.cur, locale);
        if (!s.gifts.length) return 'No gifts written down yet';
        let t = s.total ? 'Received ' + fmt(s.total, state.cur, L) + ' from ' + plural(s.cashFamilies, 'family', 'families') : 'No cash yet';
        if (s.items) t += ' · ' + plural(s.items, 'gift', 'gifts') + ' in kind';
        return t;
    }
    function totals(state) {
        let received = 0, given = 0, nIn = 0, nOut = 0;
        state.gifts.forEach(g => { if (g.dir === 'in') { received += g.amount; nIn++; } else { given += g.amount; nOut++; } });
        return { received, given, nIn, nOut, families: state.families.length };
    }

    // the guest list for one of our events
    const STATUS = { wait: 'No reply yet', yes: 'Coming', no: 'Not coming' };
    function guestSummary(state, id) {
        const list = state.guests.filter(x => x.event === id);
        const c = { all: { f: 0, p: 0 }, yes: { f: 0, p: 0 }, no: { f: 0, p: 0 }, wait: { f: 0, p: 0 } };
        list.forEach(x => { c.all.f++; c.all.p += x.n; c[x.status].f++; c[x.status].p += x.n; });
        const gave = new Set(state.gifts.filter(g => g.dir === 'in' && g.event === id).map(g => g.fam));
        c.gave = list.filter(x => gave.has(x.fam)).length;
        return c;
    }
    const people = n => plural(n, 'person', 'people');
    // "Coming: 86 families, 312 people. Expect 312 + the ones who have not replied (up to 90)."
    function guestWords(state, id) {
        const c = guestSummary(state, id);
        if (!c.all.f) return 'Nobody on the guest list yet.';
        let t = 'Invited ' + plural(c.all.f, 'family', 'families') + ' (' + people(c.all.p) + '). Coming: ' + people(c.yes.p) + '.';
        if (c.wait.f) t += ' No reply yet from ' + plural(c.wait.f, 'family', 'families') + ' (' + people(c.wait.p) + '), so plan for ' + (c.yes.p).toLocaleString('en') + ' to ' + (c.yes.p + c.wait.p).toLocaleString('en') + ' people.';
        else t += ' Everyone has replied, so plan for ' + people(c.yes.p) + '.';
        return t;
    }

    function famByIdMap(state) { const m = {}; state.families.forEach(f => { m[f.id] = f; }); return m; }
    const byLabel = (a, b) => label(a).localeCompare(label(b), undefined, { sensitivity: 'base' });

    // copy text: the register of one of our events
    function eventText(state, id, locale) {
        const ev = eventOf(state, id); if (!ev) return '';
        const s = eventSummary(state, id), L = localeFor(state.cur, locale), F = famByIdMap(state);
        const lines = ['Gifts received at ' + ev.name + (s.date ? ' (' + niceDate(s.date, L) + ')' : ''), eventWords(state, id, locale), ''];
        const rows = s.gifts.slice().sort((a, b) => byLabel(F[a.fam], F[b.fam]) || giftOrder(a, b));
        rows.forEach((g, i) => { const f = F[g.fam]; lines.push((i + 1) + '. ' + label(f) + (f.relation ? ', ' + f.relation : '') + ': ' + giftWhat(g, state.cur, L) + (g.note ? ' (' + g.note + ')' : '')); });
        return lines.join('\n');
    }
    // copy text: every family with both sides
    function registerText(state, locale, today) {
        const t = totals(state), L = localeFor(state.cur, locale);
        const lines = ['Gift register' + (today ? ', ' + niceDate(today, L) : ''), 'Received in all: ' + fmt(t.received, state.cur, L) + '. Given in all: ' + fmt(t.given, state.cur, L) + '.', ''];
        eventsByDate(state).forEach(e => lines.push(e.name + ': ' + eventWords(state, e.id, locale)));
        lines.push('');
        state.families.slice().sort(byLabel).forEach(f => {
            const l = familyLines(state, f, locale);
            lines.push(label(f) + (f.relation ? ', ' + f.relation : ''), '  ' + l.gave, '  ' + l.you, '  ' + l.bal);
        });
        return lines.join('\n');
    }
    function guestText(state, id, locale) {
        const ev = eventOf(state, id); if (!ev) return '';
        const F = famByIdMap(state), lines = ['Guest list for ' + ev.name, guestWords(state, id), ''];
        ['yes', 'wait', 'no'].forEach(st => {
            const l = state.guests.filter(x => x.event === id && x.status === st).sort((a, b) => byLabel(F[a.fam], F[b.fam]));
            if (!l.length) return;
            lines.push(STATUS[st] + ' (' + plural(l.length, 'family', 'families') + ', ' + people(l.reduce((t, x) => t + x.n, 0)) + ')');
            l.forEach(x => lines.push('- ' + label(F[x.fam]) + ': ' + people(x.n)));
            lines.push('');
        });
        return lines.join('\n').trim();
    }

    // order: "name" A to Z, "gave" most given to you first, "recent" latest gift first
    function sortFamilies(state, by) {
        const info = state.families.map((f, i) => ({ f, i, s: familySummary(state, f) }));
        const byName = (a, b) => byLabel(a.f, b.f) || a.i - b.i;
        info.sort(by === 'gave' ? (a, b) => (b.s.received - a.s.received) || byName(a, b)
            : by === 'recent' ? (a, b) => (a.s.last < b.s.last ? 1 : a.s.last > b.s.last ? -1 : byName(a, b)) : byName);
        return info.map(x => x.f);
    }
    // search as you type: name, city, relation or the name of an event they gave at
    function matches(state, fam, q) {
        q = clean(q, 60).toLocaleLowerCase(); if (!q) return true;
        const hay = [fam.name, fam.city, fam.relation, ...state.gifts.filter(g => g.fam === fam.id).map(g => eventName(state, g))].join(' ').toLocaleLowerCase();
        return q.split(' ').every(w => hay.includes(w));
    }

    function emptyState() { return { v: 1, cur: '', sort: 'name', seq: 0, families: [], events: [], gifts: [], guests: [] }; }
    const okId = v => typeof v === 'string' && /^[\w-]{1,40}$/.test(v);

    // anything saved or restored is checked: bad rows are dropped, never crash the app
    function normalize(raw) {
        if (!raw || typeof raw !== 'object' || !Array.isArray(raw.families)) return null;
        const s = emptyState();
        if (SYMBOLS.includes(raw.cur)) s.cur = raw.cur;
        if (['name', 'gave', 'recent'].includes(raw.sort)) s.sort = raw.sort;
        let seq = Number.isInteger(raw.seq) && raw.seq > 0 ? raw.seq : 0;
        const fid = new Set(), eid = new Set();
        raw.families.forEach(f => {
            if (!f || typeof f !== 'object' || !okId(f.id) || fid.has(f.id)) return;
            const fam = { id: f.id, name: cleanName(f.name), relation: clean(f.relation, 40), city: clean(f.city, 40) };
            if (!fam.name || s.families.some(x => same(label(x), label(fam)))) return;
            fid.add(f.id); s.families.push(fam);
        });
        (Array.isArray(raw.events) ? raw.events : []).forEach(e => {
            if (!e || typeof e !== 'object' || !okId(e.id) || eid.has(e.id)) return;
            const name = clean(e.name, 60); if (!name || s.events.some(x => same(x.name, name))) return;
            eid.add(e.id); s.events.push({ id: e.id, name });
        });
        const gid = new Set();
        (Array.isArray(raw.gifts) ? raw.gifts : []).forEach(g => {
            if (!g || typeof g !== 'object' || !okId(g.id) || gid.has(g.id) || !fid.has(g.fam) || !['in', 'out'].includes(g.dir) || !isDay(g.date)) return;
            const amount = Number.isInteger(g.amount) && g.amount >= 0 && g.amount <= MAX ? g.amount : -1, item = clean(g.item, 80);
            if (amount < 0 || (!amount && !item)) return;
            let event;
            if (g.dir === 'in') { if (!eid.has(g.event)) return; event = g.event; } else event = clean(g.event, 60);
            const gs = Number.isInteger(g.seq) && g.seq >= 0 ? g.seq : ++seq; seq = Math.max(seq, gs);
            gid.add(g.id); s.gifts.push({ id: g.id, fam: g.fam, dir: g.dir, event, amount, item, date: g.date, note: clean(g.note, 200), seq: gs });
        });
        (Array.isArray(raw.guests) ? raw.guests : []).forEach(x => {
            if (!x || typeof x !== 'object' || !okId(x.id) || !fid.has(x.fam) || !eid.has(x.event) || !STATUS[x.status]) return;
            if (s.guests.some(y => y.id === x.id || (y.fam === x.fam && y.event === x.event))) return;
            const n = Number.isInteger(x.n) && x.n >= 1 && x.n <= 999 ? x.n : 1;
            s.guests.push({ id: x.id, event: x.event, fam: x.fam, n, status: x.status });
        });
        s.seq = seq;
        return s;
    }

    const api = { SYMBOLS, MAX, STATUS, parseAmount, fmt, localeFor, dayStr, isDay, toDate, niceDate, plural, clean, cleanName, same, label, findFamily,
        eventOf, eventName, familySummary, giftWhat, familyLines, eventSummary, eventsByDate, eventWords, totals, guestSummary, guestWords,
        eventText, registerText, guestText, sortFamilies, matches, emptyState, normalize };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.WGR = api;
})(this);
