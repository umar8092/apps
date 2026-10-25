// Pet Care Log and Reminders: the logic, no page code.
// Dates are 'YYYY-MM-DD' strings on the person's own calendar; meal times are 'YYYY-MM-DDTHH:MM' local times.
// Money is kept in whole cents and weight in whole grams, so every total is exact.
(function (root) {
    'use strict';
    const MAX_PETS = 30, MAX_CARE = 400, MAX_HISTORY = 40, MAX_VISITS = 2000, MAX_WEIGHTS = 1500, MAX_MEALS = 6, FEED_DAYS = 14;
    const MAX = { day: 730, week: 104, month: 36, year: 5 };
    const KINDS = ['Cat', 'Dog', 'Rabbit', 'Guinea pig or hamster', 'Bird', 'Fish', 'Other'];
    const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const CURRENCIES = ['', '$', '€', '£', '₹', 'Rs', 'PKR', 'AED', 'SAR', '৳', '₦', 'R', 'KSh', 'RM', 'A$', 'C$'];
    // Usual times for adult pets. Puppies, kittens and some products need other times: the person changes the number to what the vet or the box says.
    const P = (name, n, unit) => ({ name, n, unit });
    const PRESETS = {
        Cat: [P('Flea treatment', 1, 'month'), P('Worming', 3, 'month'), P('Vaccine booster', 1, 'year'), P('Vet check-up', 1, 'year'),
            P('Nail trim', 3, 'week'), P('Litter tray full clean', 1, 'week'), P('Brushing', 1, 'week')],
        Dog: [P('Flea and tick treatment', 1, 'month'), P('Worming', 3, 'month'), P('Vaccine booster', 1, 'year'), P('Rabies vaccine', 1, 'year'),
            P('Heartworm prevention', 1, 'month'), P('Vet check-up', 1, 'year'), P('Nail trim', 4, 'week'), P('Bath and grooming', 4, 'week')],
        Rabbit: [P('Vaccine (myxomatosis and RHD)', 1, 'year'), P('Vet check-up', 1, 'year'), P('Nail trim', 6, 'week'), P('Hutch deep clean', 1, 'week')],
        'Guinea pig or hamster': [P('Cage deep clean', 1, 'week'), P('Nail trim', 6, 'week'), P('Vet check-up', 1, 'year')],
        Bird: [P('Cage deep clean', 1, 'week'), P('Nail and beak check', 1, 'month'), P('Vet check-up', 1, 'year')],
        Fish: [P('Partial water change', 1, 'week'), P('Filter clean', 1, 'month')],
        Other: [P('Vet check-up', 1, 'year'), P('Home or cage deep clean', 1, 'week')]
    };
    const presetsFor = kind => PRESETS[kind] || PRESETS.Other;

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
    // 31 Jan + 1 month = 28 Feb (or 29 Feb): the day is kept when the month has it, otherwise the month's last day.
    function addMonths(iso, n) {
        const p = parseDate(iso), t = p.y * 12 + (p.m - 1) + n, y = Math.floor(t / 12), m = t - y * 12 + 1;
        return y + '-' + pad(m) + '-' + pad(Math.min(p.d, daysIn(y, m)));
    }
    function addEvery(iso, n, unit) {
        if (unit === 'year') return addMonths(iso, n * 12);
        if (unit === 'month') return addMonths(iso, n);
        return addDays(iso, unit === 'week' ? n * 7 : n);
    }
    const diff = (a, b) => dayNum(b) - dayNum(a);                         // days from a to b
    const todayIso = (d = new Date()) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    const nowStamp = (d = new Date()) => todayIso(d) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    const dow = iso => { const p = parseDate(iso); return DAYS[new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()]; };
    // "Sun 18 Oct" this year, "Sun 18 Oct 2027" other years
    function shortDate(iso, today) {
        const p = parseDate(iso); if (!p) return '';
        return dow(iso) + ' ' + p.d + ' ' + MONTHS[p.m - 1] + (today && iso.slice(0, 4) === today.slice(0, 4) ? '' : ' ' + p.y);
    }
    const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
    function span(a) { return a < 14 ? plural(a, 'day') : a < 60 ? plural(Math.floor(a / 7), 'week') : a < 730 ? plural(Math.floor(a / 30.44), 'month') : plural(Math.floor(a / 365.25), 'year'); }
    function rel(today, date) {
        const d = diff(today, date);
        if (d === 0) return 'today';
        if (d === 1) return 'tomorrow';
        if (d === -1) return 'yesterday';
        return d > 0 ? 'in ' + span(d) : span(-d) + ' ago';
    }
    function everyText(n, unit) {
        if (unit === 'once') return 'just once';
        if (unit === 'month' && n % 12 === 0) unit = 'year', n = n / 12;
        return n === 1 ? 'every ' + unit : 'every ' + n + ' ' + unit + 's';
    }
    // "8:05 am" from 'YYYY-MM-DDTHH:MM'
    function clock(stamp) {
        const m = /T(\d{2}):(\d{2})$/.exec(stamp || ''); if (!m) return '';
        const h = +m[1];
        return ((h % 12) || 12) + ':' + m[2] + (h < 12 ? ' am' : ' pm');
    }
    // Age from the birthday: "3 weeks old", "5 months old", "2 years 3 months old"
    function age(birthday, today) {
        if (!isDate(birthday) || birthday > today) return '';
        const d = diff(birthday, today);
        if (d < 7) return plural(d, 'day') + ' old';
        if (d < 61) return plural(Math.floor(d / 7), 'week') + ' old';
        const b = parseDate(birthday), t = parseDate(today);
        let months = (t.y - b.y) * 12 + (t.m - b.m); if (t.d < b.d) months--;
        if (months < 24) return plural(months, 'month') + ' old';
        const y = Math.floor(months / 12), r = months % 12;
        return plural(y, 'year') + (r ? ' ' + plural(r, 'month') : '') + ' old';
    }

    // ---- money (whole cents) and weight (whole grams)
    function parseMoney(v) {
        const s = String(v == null ? '' : v).replace(/[\s,]/g, '');
        if (!s) return { cents: null };
        if (!/^\d+(\.\d{0,2})?$/.test(s)) return { error: 'Type the cost as a number, like 2500 or 12.50.' };
        const [a, b = ''] = s.split('.'), cents = Number(a) * 100 + Number((b + '00').slice(0, 2));
        if (cents > 1e11) return { error: 'That cost is too big. Check the number.' };
        return { cents };
    }
    function money(cents, cur) {
        const neg = cents < 0, c = Math.abs(cents), whole = Math.floor(c / 100), part = c % 100;
        const txt = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (part ? '.' + pad(part) : '');
        return (neg ? '-' : '') + (cur ? cur + (/^[A-Za-z]/.test(cur) || cur.length > 1 ? ' ' : '') : '') + txt;
    }
    const LB = 453.59237;
    // "4.5" or "4,5" in kg or lb -> grams
    function parseWeight(v, unit) {
        let s = String(v == null ? '' : v).trim().replace(/\s/g, '');
        if (/^\d+,\d{1,3}$/.test(s)) s = s.replace(',', '.');
        if (!s) return { error: 'Type the weight, for example 4.5.' };
        if (!/^\d+(\.\d{1,3})?$/.test(s) && !/^\.\d{1,3}$/.test(s)) return { error: 'Type the weight as a number, for example 4.5.' };
        const g = Math.round(Number(s) * (unit === 'lb' ? LB : 1000));
        if (g < 1) return { error: 'The weight must be more than 0.' };
        if (g > 150000) return { error: 'That is more than 150 kg (330 lb). Check the number and the unit.' };
        return { g };
    }
    function weightText(g, unit) {
        if (unit === 'lb') { const lb = g / LB; return (lb < 10 ? lb.toFixed(2) : lb.toFixed(1)).replace(/\.?0+$/, '') + ' lb'; }
        const kg = g / 1000; return (kg < 2 ? kg.toFixed(3) : kg.toFixed(2)).replace(/\.?0+$/, '') + ' kg';
    }

    // ---- one care reminder
    const isOnce = c => c.unit === 'once';
    function nextDue(c, today) {
        if (isOnce(c)) return c.due || today;
        if (!c.last) return today;
        return addEvery(c.last, c.n, c.unit);
    }
    // 'late', 'now' (today), 'soon' (within 7 days) or 'later'
    function urgency(c, today) {
        const d = diff(today, nextDue(c, today));
        if (!isOnce(c) && !c.last) return 'late';
        return d < 0 ? 'late' : d === 0 ? 'now' : d <= 7 ? 'soon' : 'later';
    }
    function dueLine(c, today) {
        const next = nextDue(c, today), d = diff(today, next);
        if (isOnce(c)) {
            if (d < 0) return 'Appointment was ' + shortDate(next, today) + ' (' + rel(today, next) + '): tap Done or change the date';
            if (d === 0) return 'Appointment today';
            return 'Appointment ' + (d === 1 ? 'tomorrow, ' + shortDate(next, today) : shortDate(next, today) + ' (' + rel(today, next) + ')');
        }
        if (!c.last) return 'Due now (no date recorded yet)';
        if (d < 0) return span(-d) + ' late (was due ' + shortDate(next, today) + ')';
        if (d === 0) return 'Due today';
        if (d === 1) return 'Due tomorrow, ' + shortDate(next, today);
        return 'Due ' + shortDate(next, today) + ' (' + rel(today, next) + ')';
    }
    function subLine(c, today) {
        if (isOnce(c)) return 'One-off, not repeated';
        return 'Repeat ' + everyText(c.n, c.unit) + ' · ' + (c.last ? 'last done ' + shortDate(c.last, today) + ' (' + rel(today, c.last) + ')' : 'no date recorded');
    }
    function historyLine(c, today) {
        const h = (c.history || []).filter(x => x !== c.last).slice().sort().reverse();
        if (!h.length) return '';
        return 'Before: ' + h.slice(0, 4).map(x => shortDate(x, today)).join(', ') + (h.length > 4 ? ' and ' + (h.length - 4) + ' more' : '');
    }
    // Done on 'day': the next date counts from that day. An older day than the last one only goes into the history.
    function done(c, day) {
        const h = (c.history || []).filter(x => x !== day).concat([day]).sort().slice(-MAX_HISTORY);
        return Object.assign({}, c, { last: c.last && c.last > day ? c.last : day, history: h });
    }
    function sortCare(list, today) {
        return list.slice().sort((a, b) => {
            const x = nextDue(a, today), y = nextDue(b, today);
            return x < y ? -1 : x > y ? 1 : a.name.localeCompare(b.name) || a.id - b.id;
        });
    }

    // ---- feeding (meals logged on this device)
    const mealsOn = (feeds, petId, day) => feeds.filter(f => f.pet === petId && f.t.slice(0, 10) === day).map(f => f.t).sort();
    function feedLine(pet, feeds, today) {
        if (!pet.meals) return '';
        const t = mealsOn(feeds, pet.id, today);
        if (!t.length) return 'Not fed yet today (' + plural(pet.meals, 'meal') + ' a day)';
        return 'Fed today at ' + t.map(clock).join(', ') + ' (' + t.length + ' of ' + pet.meals + ')';
    }
    // keep two weeks of meals
    const trimFeeds = (feeds, today) => feeds.filter(f => f.t.slice(0, 10) >= addDays(today, -FEED_DAYS));

    // ---- weight
    const weightsOf = (weights, petId) => weights.filter(w => w.pet === petId).sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id);
    // "4.6 kg on Mon 12 Oct (up 300 g since Wed 12 Aug)"
    function weightLine(list, unit, today) {
        if (!list.length) return '';
        const last = list[list.length - 1];
        let out = weightText(last.g, unit) + ' on ' + shortDate(last.date, today);
        const prev = list.slice(0, -1).reverse().find(w => w.date < last.date);
        if (prev) {
            const ch = last.g - prev.g;
            out += ch === 0 ? ' (same as ' + shortDate(prev.date, today) + ')'
                : ' (' + (ch > 0 ? 'up ' : 'down ') + weightText(Math.abs(ch), unit) + ' since ' + shortDate(prev.date, today) + ')';
        }
        return out;
    }

    // ---- vet visits and costs
    function costTotals(visits, pets, today) {
        const ym = today.slice(0, 7), y = today.slice(0, 4), per = new Map();
        let month = 0, year = 0, all = 0;
        visits.forEach(v => {
            if (!v.cents) return;
            all += v.cents;
            if (v.date.slice(0, 4) === y) { year += v.cents; per.set(v.pet, (per.get(v.pet) || 0) + v.cents); }
            if (v.date.slice(0, 7) === ym) month += v.cents;
        });
        const perPet = pets.filter(p => per.has(p.id)).map(p => ({ pet: p, cents: per.get(p.id) }));
        return { month, year, all, perPet };
    }
    const sortVisits = visits => visits.slice().sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id);

    // ---- the whole day
    // Everything due today or late, and the next thing coming, across pets that are not archived.
    function todayList(state, today) {
        const live = new Map(state.pets.filter(p => !p.archived).map(p => [p.id, p]));
        const care = sortCare(state.care.filter(c => live.has(c.pet)), today);
        const due = care.filter(c => nextDue(c, today) <= today).map(c => ({ pet: live.get(c.pet), care: c }));
        const nx = care.find(c => nextDue(c, today) > today);
        const hungry = [...live.values()].filter(p => p.meals && mealsOn(state.feeds, p.id, today).length < p.meals)
            .map(p => ({ pet: p, fed: mealsOn(state.feeds, p.id, today).length }));
        return { due, next: nx ? { pet: live.get(nx.pet), care: nx } : null, hungry };
    }

    // ---- sharing: a care sheet for a pet sitter or a new vet
    function petSheet(state, pet, today, wunit, cur) {
        const L = [pet.name + ' (' + pet.kind + ')' + (pet.archived ? ', archived' : '')];
        const a = age(pet.birthday, today);
        if (pet.birthday) L.push('Born ' + shortDate(pet.birthday, null) + (a ? ', ' + a : ''));
        if (pet.meals) L.push('Meals: ' + plural(pet.meals, 'meal') + ' a day');
        const ws = weightsOf(state.weights, pet.id);
        if (ws.length) L.push('Weight: ' + weightLine(ws, wunit, today));
        if (pet.note) L.push('Notes: ' + pet.note.replace(/\s*\n\s*/g, '; '));
        const care = sortCare(state.care.filter(c => c.pet === pet.id), today);
        if (care.length) {
            L.push('', 'Care:');
            care.forEach(c => L.push('- ' + c.name + ': ' + dueLine(c, today).replace(/: tap Done or change the date$/, '') + (isOnce(c) ? '' : ', ' + everyText(c.n, c.unit) + (c.last ? ', last done ' + shortDate(c.last, null) : '')) + (c.note ? '. ' + c.note.replace(/\s*\n\s*/g, '; ') : '')));
        }
        const vs = sortVisits(state.visits.filter(v => v.pet === pet.id));
        if (vs.length) {
            L.push('', 'Vet visits:');
            vs.slice(0, 10).forEach(v => L.push('- ' + shortDate(v.date, null) + ': ' + v.what + (v.cents ? ', ' + money(v.cents, cur) : '') + (v.note ? '. ' + v.note.replace(/\s*\n\s*/g, '; ') : '')));
            if (vs.length > 10) L.push('- and ' + (vs.length - 10) + ' earlier visits');
        }
        return L.join('\n');
    }
    function allText(state, today, wunit, cur) {
        const pets = state.pets.filter(p => !p.archived);
        if (!pets.length) return '';
        return 'Pet care, ' + shortDate(today, null) + '\n\n' + pets.map(p => petSheet(state, p, today, wunit, cur)).join('\n\n');
    }

    // ---- calendar file: one reminder per care item, repeating at its own time
    const icsEsc = s => String(s).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
    function fold(line) {
        const out = []; let cur = '', len = 0;
        for (const ch of line) {
            const b = new TextEncoder().encode(ch).length;
            if (len + b > (out.length ? 74 : 75)) { out.push(cur); cur = ''; len = 0; }
            cur += ch; len += b;
        }
        out.push(cur);
        return out.join('\r\n ');
    }
    function ics(state, today, url) {
        const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//umar8092 apps//Pet Care Log//EN', 'CALSCALE:GREGORIAN'];
        const stamp = today.replace(/-/g, '') + 'T000000Z', live = new Map(state.pets.filter(p => !p.archived).map(p => [p.id, p]));
        let count = 0;
        sortCare(state.care.filter(c => live.has(c.pet)), today).forEach(c => {
            let due = nextDue(c, today);
            if (isOnce(c) && due < today) return;
            if (due < today) due = today;
            const d = due.replace(/-/g, ''), end = addDays(due, 1).replace(/-/g, ''), title = live.get(c.pet).name + ': ' + c.name;
            L.push('BEGIN:VEVENT', 'UID:petcare-' + c.id + '@umar8092.github.io', 'DTSTAMP:' + stamp, 'DTSTART;VALUE=DATE:' + d, 'DTEND;VALUE=DATE:' + end);
            if (!isOnce(c)) L.push('RRULE:FREQ=' + (c.unit === 'year' ? 'YEARLY' : c.unit === 'month' ? 'MONTHLY' : c.unit === 'week' ? 'WEEKLY' : 'DAILY') + ';INTERVAL=' + c.n);
            L.push(fold('SUMMARY:' + icsEsc(title)), fold('DESCRIPTION:' + icsEsc((isOnce(c) ? 'Appointment. ' : 'Repeat ' + everyText(c.n, c.unit) + '. ') + 'Tap Done in the app: ' + url)),
                'BEGIN:VALARM', 'ACTION:DISPLAY', fold('DESCRIPTION:' + icsEsc(title)), 'TRIGGER:PT9H', 'END:VALARM', 'END:VEVENT');
            count++;
        });
        L.push('END:VCALENDAR');
        return { text: L.join('\r\n') + '\r\n', count };
    }

    // ---- forms (return { errors } or the clean value)
    const oneLine = (s, n) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);
    const multi = (s, n) => String(s == null ? '' : s).replace(/\r\n?/g, '\n').trim().slice(0, n);
    function readPet(f, today, pets, editingId) {
        const errors = {};
        const name = oneLine(f.name, 40);
        if (!name) errors.name = 'Type your pet\'s name.';
        const kind = KINDS.includes(f.kind) ? f.kind : 'Other';
        let birthday = '';
        if (f.birthday) {
            if (!isDate(f.birthday)) errors.birthday = 'Choose a real date, or leave it empty.';
            else if (f.birthday > today) errors.birthday = 'The birthday cannot be in the future.';
            else birthday = f.birthday;
        }
        const meals = Number.isInteger(+f.meals) && +f.meals >= 0 && +f.meals <= MAX_MEALS ? +f.meals : 0;
        if (Object.keys(errors).length) return { errors };
        const same = (pets || []).some(p => p.id !== editingId && p.name.toLowerCase() === name.toLowerCase());
        return { pet: { name, kind, birthday, meals, note: multi(f.note, 500) }, warn: same ? 'You already have a pet called ' + name + '. Both are kept.' : '' };
    }
    function readCare(f, today) {
        const errors = {};
        const name = oneLine(f.name, 60);
        if (!name) errors.name = 'Type what needs doing, for example Worming, or pick a common one.';
        const unit = f.unit === 'once' || MAX[f.unit] ? f.unit : 'month';
        let n = 1, last = '', due = '';
        if (unit === 'once') {
            if (!isDate(f.due)) errors.due = 'Choose the date of the appointment.';
            else due = f.due;
        } else {
            const raw = String(f.n == null ? '' : f.n).trim();
            n = /^\d+$/.test(raw) ? +raw : NaN;
            if (!(n >= 1 && n <= MAX[unit])) errors.n = 'Type a whole number from 1 to ' + MAX[unit] + ' ' + unit + 's.';
            if (f.last) {
                if (!isDate(f.last)) errors.last = 'Choose a real date, or tap "Not sure".';
                else if (f.last > today) errors.last = 'The last time cannot be in the future. Choose today or an earlier day.';
                else last = f.last;
            }
        }
        if (Object.keys(errors).length) return { errors };
        return { care: { name, n, unit, last, due, note: multi(f.note, 300) } };
    }
    function readVisit(f, today) {
        const errors = {};
        let date = '';
        if (!isDate(f.date)) errors.date = 'Choose the date of the visit.';
        else if (f.date > today) errors.date = 'That date is still to come. For a future appointment, add a care reminder and choose "Just once".';
        else date = f.date;
        const what = oneLine(f.what, 80);
        if (!what) errors.what = 'Type what the visit was for, for example Vaccines or Check-up.';
        const m = parseMoney(f.cost);
        if (m.error) errors.cost = m.error;
        if (Object.keys(errors).length) return { errors };
        return { visit: { date, what, cents: m.cents || 0, note: multi(f.note, 500) } };
    }
    function readWeight(f, today) {
        const errors = {};
        let date = '';
        if (!isDate(f.date)) errors.date = 'Choose the date you weighed your pet.';
        else if (f.date > today) errors.date = 'The date cannot be in the future.';
        else date = f.date;
        const w = parseWeight(f.weight, f.unit === 'lb' ? 'lb' : 'kg');
        if (w.error) errors.weight = w.error;
        if (Object.keys(errors).length) return { errors };
        return { weight: { date, g: w.g } };
    }

    // ---- saved data
    const emptyState = () => ({ v: 1, nextId: 1, pets: [], care: [], feeds: [], weights: [], visits: [] });
    const okDate = v => typeof v === 'string' && isDate(v) ? v : '';
    const okId = v => Number.isInteger(v) && v > 0 ? v : null;
    const str = (v, n) => typeof v === 'string' ? v.slice(0, n) : '';
    function validate(s) {
        if (!s || typeof s !== 'object' || !Array.isArray(s.pets)) return null;
        // ids are unique within each list; nextId stays above all of them
        const out = emptyState(), all = new Set();
        let ids = new Set();
        const take = x => { if (!okId(x.id) || ids.has(x.id)) return false; ids.add(x.id); all.add(x.id); return true; };
        const list = () => { ids = new Set(); };
        s.pets.slice(0, MAX_PETS).forEach(x => {
            if (!x || typeof x !== 'object' || !take(x)) return;
            const name = oneLine(str(x.name, 80), 40); if (!name) { ids.delete(x.id); all.delete(x.id); return; }
            out.pets.push({ id: x.id, name, kind: KINDS.includes(x.kind) ? x.kind : 'Other', birthday: okDate(x.birthday),
                meals: Number.isInteger(x.meals) && x.meals >= 0 && x.meals <= MAX_MEALS ? x.meals : 0, note: str(x.note, 500), archived: okDate(x.archived), added: okDate(x.added) });
        });
        const pet = new Set(out.pets.map(p => p.id));
        list();
        (Array.isArray(s.care) ? s.care : []).slice(0, MAX_CARE).forEach(x => {
            if (!x || typeof x !== 'object' || !pet.has(x.pet) || !take(x)) return;
            const name = oneLine(str(x.name, 80), 60);
            const unit = x.unit === 'once' || (MAX[x.unit] && Object.prototype.hasOwnProperty.call(MAX, x.unit)) ? x.unit : null;
            const n = unit === 'once' ? 1 : unit && Number.isInteger(x.n) && x.n >= 1 && x.n <= MAX[unit] ? x.n : null;
            const due = unit === 'once' ? okDate(x.due) : '';
            if (!name || !n || (unit === 'once' && !due)) { ids.delete(x.id); all.delete(x.id); return; }
            const hist = Array.isArray(x.history) ? [...new Set(x.history.filter(h => typeof h === 'string' && isDate(h)))].sort().slice(-MAX_HISTORY) : [];
            out.care.push({ id: x.id, pet: x.pet, name, n, unit, last: unit === 'once' ? '' : okDate(x.last), due, history: hist, note: str(x.note, 300) });
        });
        (Array.isArray(s.feeds) ? s.feeds : []).slice(-2000).forEach(x => {
            if (x && pet.has(x.pet) && typeof x.t === 'string' && /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(x.t) && isDate(x.t.slice(0, 10))) out.feeds.push({ pet: x.pet, t: x.t });
        });
        list();
        (Array.isArray(s.weights) ? s.weights : []).slice(-MAX_WEIGHTS).forEach(x => {
            if (!x || typeof x !== 'object' || !pet.has(x.pet) || !okDate(x.date) || !(Number.isInteger(x.g) && x.g >= 1 && x.g <= 150000) || !take(x)) return;
            out.weights.push({ id: x.id, pet: x.pet, date: x.date, g: x.g });
        });
        list();
        (Array.isArray(s.visits) ? s.visits : []).slice(-MAX_VISITS).forEach(x => {
            if (!x || typeof x !== 'object' || !pet.has(x.pet) || !okDate(x.date) || !take(x)) return;
            const what = oneLine(str(x.what, 120), 80); if (!what) { ids.delete(x.id); all.delete(x.id); return; }
            out.visits.push({ id: x.id, pet: x.pet, date: x.date, what, cents: Number.isInteger(x.cents) && x.cents >= 0 && x.cents <= 1e11 ? x.cents : 0, note: str(x.note, 500) });
        });
        const maxId = Math.max(0, ...all);
        out.nextId = Math.max(Number.isInteger(s.nextId) ? s.nextId : 1, maxId + 1);
        return out;
    }

    const api = { MAX_PETS, MAX_CARE, MAX_MEALS, MAX, KINDS, CURRENCIES, PRESETS, presetsFor, parseDate, isDate, addDays, addMonths, addEvery, diff, todayIso, nowStamp,
        shortDate, rel, span, plural, everyText, clock, age, parseMoney, money, parseWeight, weightText,
        isOnce, nextDue, urgency, dueLine, subLine, historyLine, done, sortCare, mealsOn, feedLine, trimFeeds, weightsOf, weightLine,
        costTotals, sortVisits, todayList, petSheet, allText, ics, readPet, readCare, readVisit, readWeight, emptyState, validate };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PetCore = api;
})(this);
