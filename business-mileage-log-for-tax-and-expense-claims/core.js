// Business Mileage Log for Tax and Expense Claims: the logic, kept apart from the page so it can be tested (node tests.js).
// Distances are whole tenths of a mile or km, rates are thousandths of the currency per mile or km (72.5 cents = 725),
// so a trip's amount is an exact whole number of ten-thousandths. Totals are added up exactly and rounded to cents once.
(function (root) {
    'use strict';
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const CURRENCIES = ['', '£', '$', '€', 'C$', 'A$', '₹', 'Rs', 'PKR', 'AED', 'SAR', 'R', '₦', 'KSh', 'RM', 'NZ$'];
    const MAX_TRIPS = 20000, MAX_VEH = 10, MAX_TRIP_DIST = 50000;   // 5,000.0 miles or km in one trip
    const UNIT = { mi: { one: 'mile', many: 'miles', short: 'mi' }, km: { one: 'km', many: 'km', short: 'km' } };

    // The official rates. Each period applies to trips on or after its "from" date.
    // after: the yearly distance at which rate2 takes over (0 = never); pass: extra per passenger per mile or km.
    const PRESETS = {
        'uk-car': { name: 'UK: HMRC car or van', unit: 'mi', ys: '04-06', cur: '£', group: true,
            about: '45p a mile for the first 10,000 business miles in the tax year, then 25p. 5p a mile extra for each business passenger. Tax year from 6 April.',
            source: 'HMRC approved mileage rates (unchanged since 2011)',
            periods: [{ from: '2011-04-06', rate: 450, after: 10000, rate2: 250, pass: 50 }] },
        'uk-moto': { name: 'UK: HMRC motorcycle', unit: 'mi', ys: '04-06', cur: '£', group: true,
            about: '24p a mile. Tax year from 6 April.', source: 'HMRC approved mileage rates',
            periods: [{ from: '2011-04-06', rate: 240, after: 0, rate2: 0, pass: 0 }] },
        'uk-bike': { name: 'UK: HMRC bicycle', unit: 'mi', ys: '04-06', cur: '£', group: true,
            about: '20p a mile. Tax year from 6 April.', source: 'HMRC approved mileage rates',
            periods: [{ from: '2011-04-06', rate: 200, after: 0, rate2: 0, pass: 0 }] },
        'us-irs': { name: 'US: IRS business standard rate', unit: 'mi', ys: '01-01', cur: '$', group: true,
            about: '2026: 72.5¢ a mile to 30 June, 76¢ from 1 July. 2025: 70¢. 2024: 67¢. 2023: 65.5¢.',
            source: 'IRS Notice 2026-10 and Announcement 2026-11',
            periods: [{ from: '2023-01-01', rate: 655 }, { from: '2024-01-01', rate: 670 }, { from: '2025-01-01', rate: 700 },
                { from: '2026-01-01', rate: 725 }, { from: '2026-07-01', rate: 760 }].map(p => Object.assign({ after: 0, rate2: 0, pass: 0 }, p)) },
        'ca-cra': { name: 'Canada: CRA allowance rate', unit: 'km', ys: '01-01', cur: 'C$', group: true,
            about: '2026: 73¢ a km for the first 5,000 km in the year, then 67¢ (2025: 72¢ then 66¢). Add 4¢ in the territories with your own rate.',
            source: 'Department of Finance Canada automobile allowance rates',
            periods: [{ from: '2024-01-01', rate: 700, after: 5000, rate2: 640, pass: 0 }, { from: '2025-01-01', rate: 720, after: 5000, rate2: 660, pass: 0 },
                { from: '2026-01-01', rate: 730, after: 5000, rate2: 670, pass: 0 }] }
    };
    const RULES = ['uk-car', 'uk-moto', 'uk-bike', 'us-irs', 'ca-cra', 'custom'];
    const YEAR_STARTS = [['01-01', '1 Jan (calendar year)'], ['04-06', '6 Apr (UK tax year)'], ['04-01', '1 Apr (India, Japan)'], ['07-01', '1 Jul (Pakistan, Australia)'], ['10-01', '1 Oct']];

    // ---- dates
    const pad = n => String(n).padStart(2, '0');
    const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
    function parseDate(v) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v == null ? '' : v));
        if (!m) return null;
        const y = +m[1], mo = +m[2], d = +m[3];
        if (y < 1990 || y > 2200 || mo < 1 || mo > 12 || d < 1 || d > daysIn(y, mo)) return null;
        return { y, m: mo, d };
    }
    const isDate = v => !!parseDate(v);
    const dayNum = iso => { const p = parseDate(iso); return Math.round(Date.UTC(p.y, p.m - 1, p.d) / 864e5); };
    const fromNum = n => { const d = new Date(n * 864e5); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); };
    const addDays = (iso, n) => fromNum(dayNum(iso) + n);
    const todayIso = (d = new Date()) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    const dow = iso => { const p = parseDate(iso); return DAYS[new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()]; };
    // "Wed 21 Oct" this year, "Wed 21 Oct 2025" other years
    function shortDate(iso, today) {
        const p = parseDate(iso); if (!p) return '';
        return dow(iso) + ' ' + p.d + ' ' + MONTHS[p.m - 1] + (today && iso.slice(0, 4) === today.slice(0, 4) ? '' : ' ' + p.y);
    }
    const dayMonth = iso => { const p = parseDate(iso); return p.d + ' ' + MONTHS[p.m - 1]; };
    const fullDate = iso => { const p = parseDate(iso); return p.d + ' ' + MONTHS[p.m - 1] + ' ' + p.y; };
    const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
    const validYs = ys => { const m = /^(\d{2})-(\d{2})$/.exec(String(ys || '')); return !!m && +m[1] >= 1 && +m[1] <= 12 && +m[2] >= 1 && +m[2] <= (+m[1] === 2 ? 28 : daysIn(2001, +m[1])); };
    // the first day of the claim year that contains this date
    function yearStart(iso, ys) {
        const y = +iso.slice(0, 4), s = y + '-' + ys;
        return iso < s ? (y - 1) + '-' + ys : s;
    }
    const yearEnd = start => addDays((+start.slice(0, 4) + 1) + start.slice(4), -1);
    // "2026-27" for a tax year that does not start on 1 Jan, "2026" for one that does
    const yearName = start => start.slice(5) === '01-01' ? start.slice(0, 4) : start.slice(0, 4) + '-' + String(+start.slice(0, 4) + 1).slice(2);

    // ---- numbers
    const group3 = s => s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    // tenths of a mile or km: 1234 -> "123.4"
    const dist = t => group3(String(Math.floor(t / 10))) + '.' + (t % 10);
    const distU = (t, unit) => dist(t) + ' ' + UNIT[unit].short;
    const curPrefix = cur => cur ? cur + (/^[A-Za-z]/.test(cur) ? ' ' : '') : '';
    // money in cents, always with two decimals: 18540 -> "£185.40"
    function money(cents, cur) {
        const neg = cents < 0, c = Math.abs(cents);
        return (neg ? '-' : '') + curPrefix(cur) + group3(String(Math.floor(c / 100))) + '.' + pad(c % 100);
    }
    // exact ten-thousandths to cents, half up
    const toCents = x => Math.floor((x + 50) / 100);
    // a rate in thousandths: 450 -> "£0.45", 725 -> "$0.725"; "45p" and "72.5¢" for the familiar small rates
    function rate(r, cur) {
        if (r < 1000 && (cur === '£' || cur === '$' || cur === 'C$' || cur === 'A$' || cur === 'NZ$' || cur === '€')) {
            const n = r % 10 ? (r / 10).toFixed(1) : String(r / 10);
            return cur === '£' ? n + 'p' : cur === '€' ? n + ' cents' : n + '¢';
        }
        return curPrefix(cur) + Math.floor(r / 1000) + '.' + (r % 10 ? pad3(r % 1000) : pad(Math.floor((r % 1000) / 10)));
    }
    const pad3 = n => String(n).padStart(3, '0');

    // "12", "12.5", "12,5", "1,234", "24 mi" -> tenths (rounded to the nearest tenth)
    function parseDist(v, unit) {
        let s = String(v == null ? '' : v).trim().toLowerCase().replace(/\s*(miles?|mi|km|kms|kilometres?|kilometers?)\.?$/, '').replace(/\s/g, '');
        if (!s) return { error: 'Type how far you drove for work.' };
        if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(',', '.');
        else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
        if (/^-/.test(s)) return { error: 'The distance cannot be below zero.' };
        if (!/^\d+(\.\d*)?$/.test(s) && !/^\.\d+$/.test(s)) return { error: 'Type the distance as a number, like 12 or 12.5.' };
        const t = Math.round(Number(s) * 10);
        if (!(t > 0)) return { error: 'The distance must be more than 0.' };
        if (t > MAX_TRIP_DIST) return { error: 'That is more than 5,000 ' + UNIT[unit || 'mi'].many + ' for one trip. Check the number.' };
        return { t };
    }
    // an odometer reading in tenths
    function parseOdo(v) {
        const s = String(v == null ? '' : v).replace(/[\s,]/g, '');
        if (!s) return { error: 'Type the reading.' };
        if (!/^\d+(\.\d)?$/.test(s)) return { error: 'Type the reading as a whole number or with one decimal, like 48213 or 48213.5.' };
        const t = Math.round(Number(s) * 10);
        if (t > 99999999) return { error: 'That reading is too big. Check the number.' };
        return { t };
    }
    // a rate typed in the currency: "0.45", "45p", "72.5c", "30" -> thousandths
    function parseRate(v) {
        let s = String(v == null ? '' : v).trim().toLowerCase().replace(/^(rs\.?|pkr|inr|usd|gbp|cad|aud|eur|aed|sar|ksh|rm|c\$|a\$|nz\$)\s*/, '').replace(/^[^\d.a-z]+/, '').replace(/\s/g, '');
        if (!s) return { error: 'Type the rate, like 0.45 or 45p.' };
        let hundredths = false;
        if (/(p|c|¢|cents?|pence)$/.test(s)) { hundredths = true; s = s.replace(/(p|c|¢|cents?|pence)$/, ''); }
        if (/^\d+,\d{1,3}$/.test(s)) s = s.replace(',', '.');
        if (!/^\d+(\.\d*)?$/.test(s) && !/^\.\d+$/.test(s)) return { error: 'Type the rate as a number, like 0.45 or 45p.' };
        const n = Number(s) * (hundredths ? 10 : 1000), r = Math.round(n);
        if (Math.abs(n - r) > 1e-6) return { error: 'Use at most 3 decimals, like 0.725.' };
        if (r <= 0) return { error: 'The rate must be more than 0.' };
        if (r > 1e8) return { error: 'That rate is too big. Check the number.' };
        return { r };
    }
    function parseWhole(v, max) {
        const s = String(v == null ? '' : v).replace(/[\s,]/g, '');
        if (!s) return { n: 0 };
        if (!/^\d+$/.test(s)) return { error: 'Type a whole number.' };
        const n = Number(s);
        if (n > max) return { error: 'That is more than ' + group3(String(max)) + '.' };
        return { n };
    }

    // ---- rules: the rate a vehicle uses on a given day
    function ruleOf(v) {
        if (v.rule !== 'custom' && PRESETS[v.rule]) return PRESETS[v.rule];
        const c = v.custom;
        return { name: 'Own rate', unit: c.unit, ys: c.ys, cur: '', group: false, periods: c.periods };
    }
    function periodAt(rule, date) {
        let p = rule.periods[0];
        for (const q of rule.periods) if (q.from <= date) p = q;
        return p;
    }
    // vehicles on the same official rate share the yearly limit (HMRC counts cars and vans together)
    const groupKey = v => v.rule !== 'custom' && PRESETS[v.rule] ? 'r:' + v.rule : 'v:' + v.id;
    const tripDist = tr => tr.t * (tr.back ? 2 : 1);
    const byDate = (a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id;

    // Works out every trip's amount in date order, splitting a trip that crosses the yearly limit.
    // Returns a Map trip id -> { d, parts: [{ d, r, low }], pass: { d, r, n } or null, x (exact ten-thousandths), unit, ys, crossed }
    function compute(state) {
        const out = new Map();
        const vById = new Map(state.vehicles.map(v => [v.id, v]));
        const groups = new Map();
        for (const tr of state.trips) {
            const v = vById.get(tr.veh); if (!v) continue;
            const k = groupKey(v);
            if (!groups.has(k)) groups.set(k, []);
            groups.get(k).push(tr);
        }
        for (const list of groups.values()) {
            list.sort(byDate);
            let ys = null, used = 0;
            for (const tr of list) {
                const v = vById.get(tr.veh), rule = ruleOf(v), p = periodAt(rule, tr.date), d = tripDist(tr);
                const start = yearStart(tr.date, rule.ys);
                if (start !== ys) { ys = start; used = 0; }
                const parts = [];
                let crossed = false;
                if (p.after > 0) {
                    const left = Math.max(0, p.after * 10 - used), hi = Math.min(d, left);
                    if (hi > 0) parts.push({ d: hi, r: p.rate, low: false });
                    if (d - hi > 0) { parts.push({ d: d - hi, r: p.rate2, low: true }); crossed = hi > 0; }
                } else parts.push({ d, r: p.rate, low: false });
                used += d;
                const pass = tr.pass > 0 && p.pass > 0 ? { d, r: p.pass, n: tr.pass } : null;
                const x = parts.reduce((s, q) => s + q.d * q.r, 0) + (pass ? pass.d * pass.r * pass.n : 0);
                out.set(tr.id, { d, parts, pass, x, unit: rule.unit, ys: start, crossed, after: p.after });
            }
        }
        return out;
    }

    // ---- periods for "Your claim"
    function monthRange(iso) { const s = iso.slice(0, 8) + '01'; return { from: s, to: addDays(nextMonth(s), -1) }; }
    function nextMonth(first) { const y = +first.slice(0, 4), m = +first.slice(5, 7); return m === 12 ? (y + 1) + '-01-01' : y + '-' + pad(m + 1) + '-01'; }
    const monthName = iso => MONTHS_LONG[+iso.slice(5, 7) - 1] + ' ' + iso.slice(0, 4);
    function range(kind, today, ys, from, to) {
        if (kind === 'month') { const r = monthRange(today); return { from: r.from, to: r.to, label: monthName(today), short: monthName(today) }; }
        if (kind === 'last') { const first = addDays(today.slice(0, 8) + '01', -1).slice(0, 8) + '01', r = monthRange(first); return { from: r.from, to: r.to, label: monthName(first), short: monthName(first) }; }
        if (kind === 'year') { const s = yearStart(today, ys); return { from: s, to: yearEnd(s), label: 'Tax year ' + yearName(s) + ' (' + fullDate(s) + ' to ' + fullDate(yearEnd(s)) + ')', short: 'Tax year ' + yearName(s) }; }
        if (kind === 'lastyear') { const s = yearStart(addDays(yearStart(today, ys), -1), ys); return { from: s, to: yearEnd(s), label: 'Tax year ' + yearName(s) + ' (' + fullDate(s) + ' to ' + fullDate(yearEnd(s)) + ')', short: 'Tax year ' + yearName(s) }; }
        if (kind === 'all') return { from: '1990-01-01', to: '2200-12-31', label: 'All trips', short: 'All trips' };
        let a = isDate(from) ? from : today, b = isDate(to) ? to : today;
        if (b < a) { const t = a; a = b; b = t; }
        return { from: a, to: b, label: fullDate(a) + ' to ' + fullDate(b), short: fullDate(a) + ' to ' + fullDate(b) };
    }

    // ---- the claim for a date range
    function claim(state, from, to, calc) {
        calc = calc || compute(state);
        const vById = new Map(state.vehicles.map(v => [v.id, v]));
        const trips = state.trips.filter(t => t.date >= from && t.date <= to && calc.has(t.id)).sort(byDate);
        const units = {}, lines = new Map(), perVeh = new Map();
        let x = 0, missingPurpose = 0;
        for (const tr of trips) {
            const c = calc.get(tr.id), v = vById.get(tr.veh);
            units[c.unit] = (units[c.unit] || 0) + c.d;
            x += c.x;
            if (!tr.purpose) missingPurpose++;
            const pv = perVeh.get(v.id) || { v, d: 0, x: 0, n: 0 };
            pv.d += c.d; pv.x += c.x; pv.n++; perVeh.set(v.id, pv);
            for (const q of c.parts) {
                const k = v.id + '|' + q.r + '|' + (q.low ? 1 : 0);
                const l = lines.get(k) || { veh: v.id, unit: c.unit, r: q.r, low: q.low, d: 0, kind: 'rate' };
                l.d += q.d; lines.set(k, l);
            }
            if (c.pass) {
                const k = v.id + '|p' + c.pass.r;
                const l = lines.get(k) || { veh: v.id, unit: c.unit, r: c.pass.r, d: 0, kind: 'pass' };
                l.d += c.pass.d * c.pass.n; lines.set(k, l);
            }
        }
        return { trips, units, cents: toCents(x), x, lines: [...lines.values()], perVeh: [...perVeh.values()], missingPurpose };
    }
    const unitsText = units => Object.keys(units).filter(u => units[u]).map(u => distU(units[u], u)).join(' and ') || '0.0 mi';

    // one line of the breakdown: "412.0 miles at 45p = £185.40"
    function lineText(l, cur) {
        const amt = money(toCents(l.d * l.r), cur);
        if (l.kind === 'pass') return 'Passenger extra: ' + dist(l.d) + ' passenger ' + UNIT[l.unit].many + ' at ' + rate(l.r, cur) + ' = ' + amt;
        return dist(l.d) + ' ' + UNIT[l.unit].many + ' at ' + rate(l.r, cur) + (l.low ? ' (after the yearly limit)' : '') + ' = ' + amt;
    }

    // how far each vehicle (or shared official rate) is through its yearly limit, as of today
    function yearStatus(state, today, calc) {
        calc = calc || compute(state);
        const seen = new Map();
        for (const v of state.vehicles) {
            const k = groupKey(v), rule = ruleOf(v), p = periodAt(rule, today);
            if (seen.has(k)) { seen.get(k).names.push(v.name); continue; }
            const s = yearStart(today, rule.ys), e = yearEnd(s);
            const ids = new Set(state.vehicles.filter(w => groupKey(w) === k).map(w => w.id));
            let used = 0, x = 0;
            for (const tr of state.trips) if (ids.has(tr.veh) && tr.date >= s && tr.date <= e && calc.has(tr.id)) { used += calc.get(tr.id).d; x += calc.get(tr.id).x; }
            seen.set(k, { names: [v.name], rule, ruleName: v.rule === 'custom' ? 'your own rate' : rule.name, unit: rule.unit, start: s, end: e, used, cents: toCents(x), after: p.after, rate: p.rate, rate2: p.rate2,
                left: p.after > 0 ? Math.max(0, p.after * 10 - used) : null });
        }
        return [...seen.values()];
    }
    function yearText(y, cur) {
        const u = UNIT[y.unit];
        const head = 'So far: ' + dist(y.used) + ' ' + u.many + ', ' + money(y.cents, cur) + '.';
        if (!(y.after > 0)) return { head, line: 'No yearly limit: every ' + u.one + ' is at ' + rate(y.rate, cur) + '.' };
        if (y.left > 0) return { head, line: dist(y.left) + ' ' + u.many + ' left at ' + rate(y.rate, cur) + ' before the rate drops to ' + rate(y.rate2, cur) + ' (limit ' + group3(String(y.after)) + ' ' + u.many + ', resets on ' + fullDate(addDays(y.end, 1)) + ').' };
        return { head, line: 'Past the ' + group3(String(y.after)) + '-' + u.one + ' limit: the rest of this tax year is at ' + rate(y.rate2, cur) + ' a ' + u.one + ' (resets on ' + fullDate(addDays(y.end, 1)) + ').' };
    }

    // how a vehicle's rate reads in its box
    function ruleText(v, cur) {
        if (v.rule !== 'custom') return PRESETS[v.rule].about;
        const c = v.custom, u = UNIT[c.unit];
        const one = p => rate(p.rate, cur) + ' a ' + u.one + (p.after > 0 ? ' for the first ' + group3(String(p.after)) + ' ' + u.many + ' a year, then ' + rate(p.rate2, cur) : '') + (p.pass > 0 ? ', plus ' + rate(p.pass, cur) + ' per passenger' : '');
        const ys = YEAR_STARTS.find(y => y[0] === c.ys);
        return c.periods.map((p, i) => i === 0 ? one(p) : 'From ' + fullDate(p.from) + ': ' + one(p)).join('. ') + '. Year from ' + (ys ? ys[1].replace(/ \(.*/, '') : (+c.ys.slice(3)) + ' ' + MONTHS[+c.ys.slice(0, 2) - 1]) + '.';
    }

    // ---- reading the forms
    const clean = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
    function readTrip(f, state, today) {
        const errors = {}, warns = [];
        const v = state.vehicles.find(x => x.id === Number(f.veh));
        if (!v) errors.veh = 'Choose the vehicle.';
        const unit = v ? ruleOf(v).unit : 'mi';
        if (!isDate(f.date)) errors.date = 'Choose the date of the trip.';
        else if (f.date > today) errors.date = 'That date is in the future. Log a trip after you make it.';
        else if (f.date < '2000-01-01') errors.date = 'Choose a date from 2000 on.';
        const to = clean(f.to, 80), from = clean(f.from, 80), purpose = clean(f.purpose, 140);
        if (!to) errors.to = 'Type where you went, like the customer or the site.';
        let t = 0, back = !!f.back, odo = null;
        if (f.useOdo) {
            const a = parseOdo(f.odoStart), b = parseOdo(f.odoEnd);
            if (a.error) errors.odoStart = a.error;
            if (b.error) errors.odoEnd = b.error;
            if (!a.error && !b.error) {
                if (b.t <= a.t) errors.odoEnd = 'The reading at the end must be higher than at the start.';
                else if (b.t - a.t > MAX_TRIP_DIST) errors.odoEnd = 'That is more than 5,000 ' + UNIT[unit].many + ' for one trip. Check both readings.';
                else { t = b.t - a.t; odo = [a.t, b.t]; back = false; }
            }
        } else {
            const d = parseDist(f.dist, unit);
            if (d.error) errors.dist = d.error; else t = d.t;
        }
        let pass = 0;
        if (f.pass != null && String(f.pass).trim() !== '') {
            const p = parseWhole(f.pass, 8);
            if (p.error) errors.pass = p.error === 'Type a whole number.' ? 'Type how many passengers, like 1 or 2.' : 'Up to 8 passengers.';
            else pass = p.n;
        }
        if (Object.keys(errors).length) return { errors };
        const total = t * (back ? 2 : 1);
        if (total > 5000) warns.push('That is ' + distU(total, unit) + ' in one day. Check the number before saving.');
        if (!purpose) warns.push('Tip: add what the trip was for. Tax offices ask for the purpose of each trip.');
        return { trip: { veh: v.id, date: f.date, from, to, purpose, t, back, odo, pass }, warn: warns.join(' ') };
    }

    // the rule form: preset or own rates
    function readRule(f) {
        const errors = {};
        const name = clean(f.name, 40);
        if (!name) errors.name = 'Give the vehicle a name, like My car.';
        if (!RULES.includes(f.rule)) errors.rule = 'Choose which rate you claim.';
        if (f.rule !== 'custom') return Object.keys(errors).length ? { errors } : { veh: { name, rule: f.rule, custom: null } };
        const unit = f.unit === 'km' ? 'km' : 'mi';
        const r = parseRate(f.rate); if (r.error) errors.rate = r.error;
        let after = 0, rate2 = 0, pass = 0;
        if (f.useLimit) {
            const a = parseWhole(f.after, 1000000);
            if (a.error || !a.n) errors.after = a.error || 'Type after how many ' + UNIT[unit].many + ' the rate changes.';
            else after = a.n;
            const r2 = parseRate(f.rate2); if (r2.error) errors.rate2 = r2.error; else rate2 = r2.r;
        }
        if (f.usePass) { const p = parseRate(f.pass); if (p.error) errors.pass = p.error; else pass = p.r; }
        if (!validYs(f.ys)) errors.ys = 'Choose the day the year starts.';
        if (Object.keys(errors).length) return { errors };
        return { veh: { name, rule: 'custom', custom: { unit, ys: f.ys, periods: [{ from: '2000-01-01', rate: r.r, after, rate2, pass }] } } };
    }
    // new own rates: either for every trip, or only from a date on (older trips keep the old rate)
    function applyRates(old, fresh, mode, fromDate) {
        if (mode !== 'from' || !old || old.rule !== 'custom' || !isDate(fromDate) || fromDate <= '2000-01-01') return fresh.custom;
        const per = old.custom.periods.filter(p => p.from < fromDate);
        per.push(Object.assign({}, fresh.custom.periods[0], { from: fromDate }));
        return { unit: fresh.custom.unit, ys: fresh.custom.ys, periods: per };
    }
    const sameRates = (a, b) => a.rate === b.rate && a.after === b.after && a.rate2 === b.rate2 && a.pass === b.pass;

    // trips you can repeat in one tap: the latest distinct routes
    function recentRoutes(state, n) {
        const seen = new Set(), out = [];
        for (const tr of [...state.trips].sort(byDate).reverse()) {
            const k = [tr.veh, tr.from.toLowerCase(), tr.to.toLowerCase(), tr.purpose.toLowerCase(), tr.t, tr.back].join('|');
            if (seen.has(k)) continue;
            seen.add(k); out.push(tr);
            if (out.length >= (n || 6)) break;
        }
        return out;
    }
    const places = state => [...new Set(state.trips.flatMap(t => [t.from, t.to]).filter(Boolean))].sort((a, b) => a.localeCompare(b)).slice(0, 200);
    const route = tr => (tr.from ? tr.from + (tr.back ? ' ⇄ ' : ' → ') : (tr.back ? 'There and back: ' : '')) + tr.to;

    // ---- sharing
    function tripLine(tr, c, v, cur, today, many) {
        return shortDate(tr.date, today) + ' · ' + route(tr) + (tr.purpose ? ' · ' + tr.purpose : '') + ' · ' + distU(c.d, c.unit) + (tr.pass ? ' · ' + plural(tr.pass, 'passenger') : '') + (many ? ' · ' + v.name : '') + ' · ' + money(toCents(c.x), cur);
    }
    function claimText(state, rg, cur, name) {
        const calc = compute(state), cl = claim(state, rg.from, rg.to, calc), many = state.vehicles.length > 1;
        const vById = new Map(state.vehicles.map(v => [v.id, v]));
        const L = ['Mileage claim: ' + rg.label];
        if (name) L.push('Name: ' + name);
        L.push(plural(cl.trips.length, 'trip') + ', ' + unitsText(cl.units));
        for (const pv of cl.perVeh) L.push((many ? pv.v.name + ' (' + (pv.v.rule === 'custom' ? 'own rate' : PRESETS[pv.v.rule].name) + ')' : 'Rate: ' + (pv.v.rule === 'custom' ? 'own rate' : PRESETS[pv.v.rule].name)));
        for (const l of cl.lines) L.push((many ? vById.get(l.veh).name + ': ' : '') + lineText(l, cur));
        L.push('Total to claim: ' + money(cl.cents, cur));
        L.push('');
        L.push('Trips:');
        for (const tr of cl.trips) L.push(tripLine(tr, calc.get(tr.id), vById.get(tr.veh), cur, '', many));
        if (!cl.trips.length) L.push('(no trips in this period)');
        return L.join('\n');
    }
    // a spreadsheet file: one row per trip, totals at the bottom
    function csvCell(s) {
        s = String(s);
        if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
        return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }
    function csv(state, rg) {
        const calc = compute(state), cl = claim(state, rg.from, rg.to, calc);
        const vById = new Map(state.vehicles.map(v => [v.id, v]));
        const rows = [['Date', 'Vehicle', 'From', 'To', 'Purpose', 'Distance', 'Unit', 'There and back', 'Odometer start', 'Odometer end', 'Passengers', 'Rate', 'Amount']];
        const r3 = r => (r / 1000).toFixed(r % 10 ? 3 : 2);
        for (const tr of cl.trips) {
            const c = calc.get(tr.id), v = vById.get(tr.veh);
            rows.push([tr.date, v.name, tr.from, tr.to, tr.purpose, dist(c.d).replace(/,/g, ''), c.unit, tr.back ? 'yes' : 'no', tr.odo ? (tr.odo[0] / 10).toFixed(1) : '', tr.odo ? (tr.odo[1] / 10).toFixed(1) : '',
                tr.pass || '', c.parts.map(q => r3(q.r)).join(' then ') + (c.pass ? ' + ' + r3(c.pass.r) + ' per passenger' : ''), (toCents(c.x) / 100).toFixed(2)]);
        }
        for (const u of Object.keys(cl.units)) rows.push(['Total', '', '', '', '', dist(cl.units[u]).replace(/,/g, ''), u, '', '', '', '', '', '']);
        rows[rows.length - 1][12] = (cl.cents / 100).toFixed(2);
        if (!cl.trips.length) rows.push(['Total', '', '', '', '', '0.0', '', '', '', '', '', '', '0.00']);
        return '﻿' + rows.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
    }

    // ---- saved data
    const emptyState = () => ({ v: 1, nextId: 1, vehicles: [], trips: [] });
    const isInt = (n, lo, hi) => Number.isInteger(n) && n >= lo && n <= hi;
    function validPeriod(p) {
        return p && typeof p === 'object' && isDate(p.from) && isInt(p.rate, 1, 1e8) && isInt(p.after || 0, 0, 1000000) && isInt(p.rate2 || 0, 0, 1e8) && isInt(p.pass || 0, 0, 1e8)
            && (!(p.after > 0) || p.rate2 > 0);
    }
    function validate(s) {
        if (!s || typeof s !== 'object' || !Array.isArray(s.vehicles) || !Array.isArray(s.trips)) return null;
        const out = emptyState(), ids = new Set();
        for (const v of s.vehicles.slice(0, MAX_VEH)) {
            if (!v || !isInt(v.id, 1, 1e9) || ids.has(v.id) || typeof v.name !== 'string' || !clean(v.name, 40) || !RULES.includes(v.rule)) continue;
            let custom = null;
            if (v.rule === 'custom') {
                const c = v.custom;
                if (!c || (c.unit !== 'mi' && c.unit !== 'km') || !validYs(c.ys) || !Array.isArray(c.periods) || !c.periods.length || c.periods.length > 50 || !c.periods.every(validPeriod)) continue;
                const per = c.periods.map(p => ({ from: p.from, rate: p.rate, after: p.after || 0, rate2: p.after > 0 ? p.rate2 : 0, pass: p.pass || 0 })).sort((a, b) => a.from < b.from ? -1 : 1);
                per[0].from = per[0].from < '2000-01-01' ? per[0].from : '2000-01-01';
                custom = { unit: c.unit, ys: c.ys, periods: per };
            }
            ids.add(v.id);
            out.vehicles.push({ id: v.id, name: clean(v.name, 40), rule: v.rule, custom });
        }
        const tids = new Set();
        for (const t of s.trips) {
            if (out.trips.length >= MAX_TRIPS) break;
            if (!t || !isInt(t.id, 1, 1e9) || tids.has(t.id) || !ids.has(t.veh) || !isDate(t.date) || !isInt(t.t, 1, MAX_TRIP_DIST)) continue;
            if (typeof t.to !== 'string' || !clean(t.to, 80)) continue;
            const odo = Array.isArray(t.odo) && t.odo.length === 2 && isInt(t.odo[0], 0, 99999999) && isInt(t.odo[1], 0, 99999999) && t.odo[1] - t.odo[0] === t.t ? [t.odo[0], t.odo[1]] : null;
            tids.add(t.id);
            out.trips.push({ id: t.id, veh: t.veh, date: t.date, from: typeof t.from === 'string' ? clean(t.from, 80) : '', to: clean(t.to, 80),
                purpose: typeof t.purpose === 'string' ? clean(t.purpose, 140) : '', t: t.t, back: !odo && t.back === true, odo, pass: isInt(t.pass, 0, 8) ? t.pass : 0 });
        }
        const maxId = Math.max(0, ...out.vehicles.map(v => v.id), ...out.trips.map(t => t.id));
        out.nextId = isInt(s.nextId, maxId + 1, 1e9) ? s.nextId : maxId + 1;
        return out;
    }

    const api = { PRESETS, RULES, YEAR_STARTS, CURRENCIES, UNIT, MONTHS, parseDate, isDate, addDays, todayIso, shortDate, dayMonth, fullDate, plural, yearStart, yearEnd, yearName, validYs,
        dist, distU, money, toCents, rate, parseDist, parseOdo, parseRate, parseWhole, ruleOf, periodAt, groupKey, tripDist, compute, range, claim, unitsText, lineText,
        yearStatus, yearText, ruleText, readTrip, readRule, applyRates, sameRates, recentRoutes, places, route, tripLine, claimText, csv, emptyState, validate };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.MileageCore = api;
})(this);
