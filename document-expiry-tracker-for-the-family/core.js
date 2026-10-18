// Document Expiry Tracker for the Family: the logic, no page code.
// Dates are 'YYYY-MM-DD' strings on the person's own calendar (no time zones involved).
(function (root) {
    'use strict';
    const SLUG = 'document-expiry-tracker-for-the-family';
    const MAX_PEOPLE = 40, MAX_DOCS = 400, MAX_HISTORY = 20;
    const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    // Kinds of document, with how long before the end the reminder starts by default.
    //   travel: 'rule' = needs months left after the trip (passports), 'trip' = must last until you are back, '' = not checked for travel
    const TYPES = [
        { k: 'passport', label: 'Passport', remind: { n: 9, u: 'm' }, travel: 'rule' },
        { k: 'id', label: 'National ID card', remind: { n: 2, u: 'm' }, travel: 'trip' },
        { k: 'visa', label: 'Visa or residence permit', remind: { n: 3, u: 'm' }, travel: 'trip' },
        { k: 'work', label: 'Work permit', remind: { n: 3, u: 'm' }, travel: '' },
        { k: 'licence', label: 'Driving licence', remind: { n: 2, u: 'm' }, travel: 'trip' },
        { k: 'carins', label: 'Car insurance', remind: { n: 1, u: 'm' }, travel: '' },
        { k: 'carreg', label: 'Car registration or road tax', remind: { n: 1, u: 'm' }, travel: '' },
        { k: 'carcheck', label: 'Car safety check (MOT, fitness)', remind: { n: 1, u: 'm' }, travel: '' },
        { k: 'health', label: 'Health insurance or health card', remind: { n: 1, u: 'm' }, travel: '' },
        { k: 'home', label: 'Home insurance', remind: { n: 1, u: 'm' }, travel: '' },
        { k: 'travelins', label: 'Travel insurance', remind: { n: 2, u: 'w' }, travel: 'trip' },
        { k: 'other', label: 'Something else', remind: { n: 1, u: 'm' }, travel: '' }
    ];
    const typeOf = k => TYPES.find(t => t.k === k) || TYPES[TYPES.length - 1];

    // ---- dates
    const pad = n => String(n).padStart(2, '0');
    const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
    function parseDate(v) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v == null ? '' : v));
        if (!m) return null;
        const y = +m[1], mo = +m[2], d = +m[3];
        if (y < 1950 || y > 2200 || mo < 1 || mo > 12 || d < 1 || d > daysIn(y, mo)) return null;
        return { y, m: mo, d };
    }
    const isDate = v => !!parseDate(v);
    const dayNum = iso => { const p = parseDate(iso); return Math.round(Date.UTC(p.y, p.m - 1, p.d) / 864e5); };
    const fromNum = n => { const d = new Date(n * 864e5); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); };
    const addDays = (iso, n) => fromNum(dayNum(iso) + n);
    const diff = (a, b) => dayNum(b) - dayNum(a);                         // days from a to b
    const todayIso = (d = new Date()) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    // Same day k months later (k may be negative), or the last day of that month when it is shorter (31 Mar - 1 month = 28 Feb).
    function addMonths(iso, k) {
        const p = parseDate(iso), t = p.y * 12 + (p.m - 1) + k, y = Math.floor(t / 12), m = t - y * 12 + 1;
        return y + '-' + pad(m) + '-' + pad(Math.min(p.d, daysIn(y, m)));
    }
    const monthEnd = (y, m) => y + '-' + pad(m) + '-' + pad(daysIn(y, m));
    function longDate(iso, withDay = true) {
        const p = parseDate(iso); if (!p) return '';
        const dow = DAYS[new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()];
        return (withDay ? dow + ' ' : '') + p.d + ' ' + MONTHS[p.m - 1] + ' ' + p.y;
    }
    const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
    function span(from, to) {                   // whole months and days from `from` to `to` (to >= from), in words
        const d = diff(from, to);
        if (d < 62) return plural(d, 'day');
        let m = 0; while (m < 2400 && addMonths(from, m + 1) <= to) m++;
        const y = Math.floor(m / 12), r = m % 12;
        return (y ? plural(y, 'year') : '') + (y && r ? ' ' : '') + (r ? plural(r, 'month') : '');
    }
    // Time left until the end date (the end date itself is still valid).
    function leftText(today, end) {
        const d = diff(today, end);
        if (d < 0) return '';
        if (d === 0) return 'last day today';
        if (d === 1) return 'expires tomorrow';
        return span(today, end) + ' left';
    }
    function agoText(today, end) {
        const d = diff(end, today);
        if (d <= 0) return '';
        if (d === 1) return 'yesterday';
        return span(end, today) + ' ago';
    }

    // ---- one document
    // exp: { t: 'date', d } | { t: 'month', y, m } (valid to the end of that month) | { t: 'none' }
    function expiry(doc) {
        const e = doc.exp || {};
        if (e.t === 'date') return e.d;
        if (e.t === 'month') return monthEnd(e.y, e.m);
        return null;
    }
    function remindDate(doc) {
        const e = expiry(doc);
        if (!e) return null;
        const r = doc.remind || typeOf(doc.type).remind;
        return r.u === 'w' ? addDays(e, -7 * r.n) : addMonths(e, -r.n);
    }
    function remindText(r) {
        return r.u === 'w' ? (r.n % 52 === 0 ? plural(r.n / 52, 'year') : plural(r.n, 'week')) : (r.n % 12 === 0 ? plural(r.n / 12, 'year') : plural(r.n, 'month'));
    }
    const docTitle = doc => (doc.type === 'other' ? doc.name || 'Document' : typeOf(doc.type).label) + (doc.country ? ' (' + doc.country + ')' : '');
    function expText(doc) {
        const e = doc.exp || {};
        if (e.t === 'month') return MONTHS_LONG[e.m - 1] + ' ' + e.y;            // a card that shows only month and year
        if (e.t === 'date') return longDate(e.d);
        return '';
    }
    const isPassport = doc => doc.type === 'passport';
    // Fewer than 6 months left: many countries refuse entry with such a passport.
    const underSix = (doc, today) => { const e = expiry(doc); return isPassport(doc) && !!e && e >= today && e < addMonths(today, 6); };

    // state: 'expired', 'soon' (inside the reminder time), 'ok', 'none' (does not expire). applied: renewal applied for.
    function classify(doc, today) {
        const e = expiry(doc);
        if (!e) return { state: 'none', applied: !!doc.applied };
        const r = remindDate(doc);
        const st = e < today ? 'expired' : (today >= r || underSix(doc, today)) ? 'soon' : 'ok';
        return { state: st, applied: !!doc.applied && st !== 'ok', exp: e, remind: r };
    }
    // Soonest end first; ones that do not expire last.
    function sortDocs(docs) {
        return docs.slice().sort((a, b) => {
            const ea = expiry(a) || '9999-12-31', eb = expiry(b) || '9999-12-31';
            return ea < eb ? -1 : ea > eb ? 1 : docTitle(a).localeCompare(docTitle(b)) || a.id - b.id;
        });
    }
    // The sentence under a document's title.
    function statusLine(doc, today) {
        const k = classify(doc, today);
        if (k.state === 'none') return 'Does not expire';
        const when = doc.exp.t === 'month' ? 'the end of ' + expText(doc) : expText(doc);
        if (k.state === 'expired') return 'Expired ' + (doc.exp.t === 'month' ? 'at ' + when : 'on ' + when) + ' (' + agoText(today, k.exp) + ')';
        return 'Valid until ' + when + ' (' + leftText(today, k.exp) + ')';
    }
    // What to do now, in plain words.
    function adviceLine(doc, today) {
        const k = classify(doc, today);
        if (k.state === 'none') return '';
        if (k.applied) return 'Renewal applied for on ' + longDate(doc.applied, false) + '. Tap "Renewed" when the new one arrives.';
        if (k.state === 'expired') return 'Renew it now. It can no longer be used.';
        if (k.state === 'soon') {
            if (underSix(doc, today)) return 'Renew it now: under 6 months left, and many countries will not let you in with it.';
            return 'Renew it now. Your reminder started on ' + longDate(k.remind, false) + '.';
        }
        return 'Start renewing on ' + longDate(k.remind, false) + (isPassport(doc) ? ' (keeps 6 months for travel)' : '') + '.';
    }

    // ---- the whole family
    // Documents that need doing something, soonest first, then ones waiting for the new card.
    function summary(state, today) {
        const name = id => (state.people.find(p => p.id === id) || {}).name || '';
        const docs = sortDocs(state.docs);
        const todo = [], waiting = [];
        docs.forEach(d => { const k = classify(d, today); if (k.state === 'expired' || k.state === 'soon') (k.applied ? waiting : todo).push(d); });
        const next = docs.find(d => classify(d, today).state === 'ok');
        const line = d => name(d.who) + ': ' + docTitle(d) + ' ' + (classify(d, today).state === 'expired' ? 'expired ' + agoText(today, expiry(d)) : 'expires ' + longDate(expiry(d)) + ' (' + leftText(today, expiry(d)) + ')');
        return {
            total: docs.length, expired: todo.filter(d => classify(d, today).state === 'expired').length, todo, waiting, next,
            todoLines: todo.map(line), waitingLines: waiting.map(d => name(d.who) + ': ' + docTitle(d) + ', applied for on ' + longDate(d.applied, false)),
            nextLine: next ? name(next.who) + ': ' + docTitle(next) + ', start renewing on ' + longDate(remindDate(next)) + ' (expires ' + longDate(expiry(next), false) + ')' : ''
        };
    }

    // ---- travel check: are the passports and visas good for a trip that ends on `back`?
    // rule: months the passport must still be valid after you come back (6, 3) or 0 = until you are back.
    function travelCheck(state, back, rule, today) {
        if (!isDate(back)) return { err: 'Choose the day you come back.' };
        if (back < today) return { err: 'The day you come back cannot be before today.' };
        const out = [];
        state.people.forEach(p => sortDocs(state.docs.filter(d => d.who === p.id)).forEach(d => {
            const t = typeOf(d.type).travel; if (!t) return;
            const e = expiry(d), months = t === 'rule' ? rule : 0;
            const need = months ? addMonths(back, months) : back;
            let ok, text;
            if (!e) { ok = true; text = 'does not expire'; }
            else if (e < today) { ok = false; text = 'has already expired (' + longDate(e, false) + '). Renew it before you go.'; }
            else if (e < back) { ok = false; text = 'ends on ' + longDate(e, false) + ', before you come back. Renew it before you go.'; }
            else if (e < need) { ok = false; text = 'ends on ' + longDate(e, false) + ', only ' + span(back, e) + ' after you come back. Many countries want ' + plural(months, 'month') + '. Renew it first.'; }
            else { ok = true; text = 'valid until ' + longDate(e, false) + (diff(back, e) > 0 ? ', ' + span(back, e) + ' after you come back' : ', the day you come back'); }
            out.push({ id: d.id, ok, person: p.name, title: docTitle(d), text, applied: !!d.applied });
        }));
        return { rows: out, bad: out.filter(r => !r.ok).length };
    }

    // ---- copy and email text (document numbers are only in a single document's copy)
    function docText(doc, today, withNumber) {
        const L = [docTitle(doc) + ': ' + statusLine(doc, today)];
        const a = adviceLine(doc, today); if (a) L.push(a);
        if (withNumber && doc.number) L.push('Number: ' + doc.number);
        if (doc.note) L.push('Notes: ' + doc.note);
        return L.join('\n');
    }
    function personText(state, p, today) {
        const docs = sortDocs(state.docs.filter(d => d.who === p.id));
        return p.name.toUpperCase() + '\n' + (docs.length ? docs.map(d => docText(d, today, false)).join('\n\n') : 'No documents yet');
    }
    function listText(state, today) {
        if (!state.docs.length) return '';
        const s = summary(state, today), L = ['Family documents and expiry dates (' + longDate(today, false) + ')'];
        if (s.todoLines.length) L.push('TO RENEW NOW\n' + s.todoLines.map(x => '- ' + x).join('\n'));
        if (s.waitingLines.length) L.push('WAITING FOR THE NEW ONE\n' + s.waitingLines.map(x => '- ' + x).join('\n'));
        state.people.forEach(p => { if (state.docs.some(d => d.who === p.id)) L.push(personText(state, p, today)); });
        return L.join('\n\n');
    }

    // ---- calendar file (.ics): a "start renewing" day and the expiry day for each document still to come
    const esc = t => String(t).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
    function fold(line) {
        const out = []; let s = line;
        while (s.length > 74) { out.push(s.slice(0, 74)); s = ' ' + s.slice(74); }
        out.push(s); return out.join('\r\n');
    }
    function ics(state, docs, today, stamp) {
        const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//umar8092//Document Expiry Tracker for the Family//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
        const ds = d => d.replace(/-/g, '');
        const name = id => (state.people.find(p => p.id === id) || {}).name || '';
        let n = 0;
        const ev = (uid, date, summary, desc, alarms) => {
            L.push('BEGIN:VEVENT', 'UID:' + uid + '@' + SLUG, 'DTSTAMP:' + stamp, 'DTSTART;VALUE=DATE:' + ds(date),
                'DTEND;VALUE=DATE:' + ds(addDays(date, 1)), fold('SUMMARY:' + esc(summary)), fold('DESCRIPTION:' + esc(desc)), 'TRANSP:TRANSPARENT');
            alarms.filter(a => diff(today, date) >= a).forEach(a => L.push('BEGIN:VALARM', 'ACTION:DISPLAY', fold('DESCRIPTION:' + esc(summary)), 'TRIGGER:-P' + a + 'D', 'END:VALARM'));
            L.push('END:VEVENT'); n++;
        };
        docs.forEach(d => {
            const e = expiry(d); if (!e || e < today) return;
            const who = name(d.who), title = docTitle(d), info = who + ': ' + docTitle(d) + ', expires ' + longDate(e, false);
            const r = remindDate(d);
            if (r >= today && r < e) ev(d.id + '-' + e + '-renew', r, 'Renew ' + who + ': ' + title + ' (expires ' + longDate(e, false) + ')', info, [0]);
            ev(d.id + '-' + e + '-expires', e, who + ': ' + title + ' expires today', info, [7, 0]);
        });
        L.push('END:VCALENDAR');
        return { text: L.join('\r\n') + '\r\n', count: n };
    }

    // ---- reading the form (strings from the page), with plain error messages
    // f: { who, newName, type, name, expKind, expDate, expMonth, expYear, remSel, remNum, remUnit, number, country, note }
    function readForm(f, state, today) {
        const errs = {}, doc = {};
        if (f.who === 'new' || !state.people.some(p => String(p.id) === String(f.who))) {
            const nm = clip(f.newName, 40);
            if (!nm) errs.who = 'Type whose document it is, such as "Aisha" or "Me".';
            else if (state.people.some(p => p.name.toLowerCase() === nm.toLowerCase())) errs.who = nm + ' is already on the list. Choose them under "Whose document is it?".';
            else if (state.people.length >= MAX_PEOPLE) errs.who = 'The list is full (40 people).';
            doc.newName = nm; doc.who = null;
        } else doc.who = +f.who;
        doc.type = TYPES.some(t => t.k === f.type) ? f.type : 'other';
        doc.name = clip(f.name, 60);
        if (doc.type === 'other' && !doc.name) errs.name = 'Type what the document is, such as "Gym membership card".';
        if (doc.type !== 'other') doc.name = '';
        const k = f.expKind;
        if (k === 'none') doc.exp = { t: 'none' };
        else if (k === 'month') {
            const m = +f.expMonth, y = whole(f.expYear);
            if (!(m >= 1 && m <= 12)) errs.exp = 'Choose the month it expires.';
            else if (!(y >= 1950 && y <= 2200)) errs.exp = 'Type the year it expires, with 4 digits, such as 2031.';
            doc.exp = { t: 'month', y, m };
        } else {
            if (!isDate(f.expDate)) errs.exp = 'Choose the date it expires. It is printed on the document.';
            doc.exp = { t: 'date', d: f.expDate };
        }
        const rs = f.remSel;
        if (rs === 'custom') {
            const n = whole(f.remNum), u = f.remUnit === 'w' ? 'w' : 'm';
            if (!(n >= 1 && n <= (u === 'w' ? 104 : 36))) errs.rem = 'Type how long before: 1 to 104 weeks, or 1 to 36 months.';
            doc.remind = { n, u };
        } else {
            const m = /^(\d{1,2})([wm])$/.exec(rs || '');
            doc.remind = m ? { n: +m[1], u: m[2] } : typeOf(doc.type).remind;
        }
        doc.number = clip(f.number, 40);
        doc.country = clip(f.country, 40);
        doc.note = clip(f.note, 300, true);
        return { doc, errs, ok: !Object.keys(errs).length };
    }
    function previewText(f, state, today) {
        const r = readForm(f, state, today);
        if (r.errs.exp || r.errs.rem) return '';
        const d = r.doc;
        if (d.exp.t === 'none') return 'Does not expire, so there is no reminder.';
        const e = expiry(d), rd = remindDate(d);
        if (e < today) return 'Already expired ' + agoText(today, e) + '. It will show as "Renew now".';
        const st = (d.exp.t === 'month' ? 'Valid until the end of ' + expText(d) : 'Expires ' + longDate(e)) + ' (' + leftText(today, e) + ').';
        return st + ' ' + (rd <= today ? 'That is inside the reminder time, so it will show as "Renew now".' : 'Start renewing on ' + longDate(rd) + '.');
    }
    function whole(v) { const s = String(v == null ? '' : v).trim(); return /^\d{1,4}$/.test(s) ? +s : NaN; }
    function clip(v, max, multi) {
        let s = String(v == null ? '' : v);
        s = multi ? s.replace(/\r\n?/g, '\n').replace(/[^\S\n]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim() : s.replace(/\s+/g, ' ').trim();
        return s.slice(0, max);
    }

    // ---- saved state
    const emptyState = () => ({ v: 1, nextId: 1, people: [], docs: [], trip: { back: '', rule: 6 } });
    // Checks every value from storage or a backup file; anything wrong is dropped, never trusted.
    function validate(s) {
        if (!s || typeof s !== 'object' || !Array.isArray(s.people) || !Array.isArray(s.docs)) return null;
        const out = emptyState(), ids = new Set(), names = new Set();
        const okId = x => Number.isInteger(x) && x >= 1 && x <= 1e9;
        s.people.slice(0, MAX_PEOPLE).forEach(p => {
            if (!p || !okId(p.id) || ids.has(p.id)) return;
            const name = clip(p.name, 40); if (!name || names.has(name.toLowerCase())) return;
            ids.add(p.id); names.add(name.toLowerCase()); out.people.push({ id: p.id, name });
        });
        const people = new Set(out.people.map(p => p.id));
        s.docs.slice(0, MAX_DOCS).forEach(x => { const d = cleanDoc(x, people); if (d && !ids.has(d.id)) { ids.add(d.id); out.docs.push(d); } });
        const t = s.trip || {};
        out.trip = { back: isDate(t.back) ? t.back : '', rule: [0, 3, 6].includes(t.rule) ? t.rule : 6 };
        out.nextId = Math.max(1, ...[...ids].map(i => i + 1), okId(s.nextId) ? s.nextId : 1);
        return out;
    }
    function cleanExp(e) {
        if (!e || typeof e !== 'object') return null;
        if (e.t === 'none') return { t: 'none' };
        if (e.t === 'date' && isDate(e.d)) return { t: 'date', d: e.d };
        if (e.t === 'month' && Number.isInteger(e.y) && e.y >= 1950 && e.y <= 2200 && Number.isInteger(e.m) && e.m >= 1 && e.m <= 12) return { t: 'month', y: e.y, m: e.m };
        return null;
    }
    function cleanDoc(x, people) {
        if (!x || typeof x !== 'object' || !Number.isInteger(x.id) || x.id < 1 || x.id > 1e9 || !people.has(x.who)) return null;
        const type = TYPES.some(t => t.k === x.type) ? x.type : 'other';
        const exp = cleanExp(x.exp); if (!exp) return null;
        const d = { id: x.id, who: x.who, type, name: type === 'other' ? clip(x.name, 60) || 'Document' : '', exp };
        const r = x.remind || {};
        d.remind = Number.isInteger(r.n) && (r.u === 'w' ? r.n >= 1 && r.n <= 104 : r.u === 'm' && r.n >= 1 && r.n <= 36) ? { n: r.n, u: r.u } : typeOf(type).remind;
        d.number = clip(x.number, 40); d.country = clip(x.country, 40); d.note = clip(x.note, 300, true);
        d.applied = isDate(x.applied) ? x.applied : '';
        d.history = (Array.isArray(x.history) ? x.history : []).slice(-MAX_HISTORY)
            .map(h => h && typeof h === 'object' ? { exp: cleanExp(h.exp), on: isDate(h.on) ? h.on : '', number: clip(h.number, 40) } : null)
            .filter(h => h && h.exp && h.exp.t !== 'none');
        return d;
    }

    const api = { SLUG, MAX_PEOPLE, MAX_DOCS, TYPES, typeOf, parseDate, isDate, addDays, addMonths, monthEnd, diff, todayIso, longDate, span, leftText, agoText,
        expiry, remindDate, remindText, docTitle, expText, underSix, classify, sortDocs, statusLine, adviceLine, summary, travelCheck,
        docText, personText, listText, ics, readForm, previewText, emptyState, validate, cleanDoc, clip };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.DocCore = api;
})(this);
