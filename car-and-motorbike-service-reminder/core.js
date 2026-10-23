// Car and Motorbike Service Reminder: the logic, no page code.
// Dates are 'YYYY-MM-DD' strings on the person's own calendar. Distances are whole km or miles (each vehicle has its own unit).
// Money is whole cents. A service is due "every N km/miles or every N months/weeks, whichever comes first".
(function (root) {
    'use strict';
    const SLUG = 'car-and-motorbike-service-reminder';
    const MAX_VEHICLES = 10, MAX_JOBS = 40, MAX_HISTORY = 100, MAX_READINGS = 400, MAX_DIST = 9999999, MAX_COST = 99999999999;
    const SYMBOLS = ['', 'Rs', '₹', '$', '€', '£', '৳', 'AED', 'SAR', 'RM', 'Rp', '₦', 'KSh', '₵', 'R', '₱', '¥', '₺', 'E£', 'R$', 'A$', 'C$', 'CHF', 'kr', 'zł'];
    const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    // Usual starting points (km, miles, time). The person can change every number.
    //   d: [every km, every miles] (0 = not by distance), t: { n, u } (u 'm' months or 'w' weeks, null = not by time)
    const m = n => ({ n, u: 'm' });
    const JOBS = {
        car: [
            { k: 'oil', label: 'Engine oil and oil filter', d: [5000, 3000], t: m(6) },
            { k: 'service', label: 'Full service', d: [15000, 10000], t: m(12) },
            { k: 'airfilter', label: 'Air filter', d: [15000, 10000], t: m(12) },
            { k: 'cabin', label: 'AC (cabin) filter', d: [15000, 10000], t: m(12) },
            { k: 'brakes', label: 'Brake pads check', d: [10000, 6000], t: m(12) },
            { k: 'brakefluid', label: 'Brake fluid', d: [0, 0], t: m(24) },
            { k: 'plugs', label: 'Spark plugs', d: [30000, 20000], t: m(24) },
            { k: 'coolant', label: 'Coolant', d: [40000, 25000], t: m(24) },
            { k: 'gearoil', label: 'Gearbox oil', d: [40000, 25000], t: m(24) },
            { k: 'rotation', label: 'Tyre rotation and wheel balancing', d: [10000, 6000], t: null },
            { k: 'alignment', label: 'Wheel alignment', d: [10000, 6000], t: m(12) },
            { k: 'tyres', label: 'New tyres', d: [50000, 30000], t: m(60) },
            { k: 'battery', label: 'Battery check', d: [0, 0], t: m(12) },
            { k: 'insurance', label: 'Insurance renewal', d: [0, 0], t: m(12) },
            { k: 'tax', label: 'Token tax or road tax', d: [0, 0], t: m(12) },
            { k: 'test', label: 'MOT or fitness test', d: [0, 0], t: m(12) },
            { k: 'other', label: 'Something else', d: [0, 0], t: m(6) }
        ],
        bike: [
            { k: 'oil', label: 'Engine oil', d: [1000, 600], t: m(3) },
            { k: 'service', label: 'Full service (tuning)', d: [3000, 2000], t: m(6) },
            { k: 'chain', label: 'Chain clean, lube and adjust', d: [500, 300], t: m(1) },
            { k: 'airfilter', label: 'Air filter', d: [5000, 3000], t: m(12) },
            { k: 'plugs', label: 'Spark plug', d: [8000, 5000], t: m(12) },
            { k: 'brakes', label: 'Brake shoes or pads check', d: [5000, 3000], t: m(6) },
            { k: 'tyres', label: 'New tyres', d: [20000, 12000], t: m(48) },
            { k: 'battery', label: 'Battery check', d: [0, 0], t: m(12) },
            { k: 'insurance', label: 'Insurance renewal', d: [0, 0], t: m(12) },
            { k: 'tax', label: 'Token tax or road tax', d: [0, 0], t: m(12) },
            { k: 'test', label: 'MOT or fitness test', d: [0, 0], t: m(12) },
            { k: 'other', label: 'Something else', d: [0, 0], t: m(6) }
        ]
    };
    const jobType = (kind, k) => (JOBS[kind] || JOBS.car).find(j => j.k === k) || null;
    const unitWord = u => u === 'mi' ? 'miles' : 'km';

    // ---- numbers
    function group(n) { const s = String(Math.abs(n)); return (n < 0 ? '-' : '') + s.replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
    const dist = (n, u) => group(n) + ' ' + (u === 'mi' ? (n === 1 ? 'mile' : 'miles') : 'km');
    // A whole distance from typed text ("45,210", "45 210"). '' when blank, NaN when not a whole number in range.
    function parseDist(v) {
        const s = String(v == null ? '' : v).trim().replace(/[\s,']/g, '');
        if (!s) return '';
        if (!/^\d{1,7}$/.test(s)) return NaN;
        const n = +s; return n <= MAX_DIST ? n : NaN;
    }
    function parseWhole(v, max) { const s = String(v == null ? '' : v).trim(); if (!s) return ''; return /^\d{1,4}$/.test(s) && +s >= 1 && +s <= max ? +s : NaN; }
    // Money from typed text to whole cents: "12,400", "1250.5", "Rs 300". '' when blank, NaN when not a valid amount.
    function parseMoney(v) {
        let s = String(v == null ? '' : v).trim().replace(/[^\d.,\-]/g, '');
        if (!s) return String(v == null ? '' : v).trim() ? NaN : '';
        if (s.startsWith('-')) return NaN;
        s = s.replace(/,(?=\d{3}(\D|$))/g, '').replace(/,/g, '.');
        if (!/^\d+(\.\d{1,2})?$/.test(s)) return NaN;
        const [a, b = ''] = s.split('.'); const c = +a * 100 + +(b + '00').slice(0, 2);
        return c <= MAX_COST ? c : NaN;
    }
    function fmt(cents, cur) {
        const neg = cents < 0, c = Math.abs(cents), w = Math.floor(c / 100), f = c % 100;
        const n = group(w) + (f ? '.' + String(f).padStart(2, '0') : '');
        return (neg ? '-' : '') + (cur ? cur + ' ' : '') + n;
    }

    // ---- dates
    const pad = n => String(n).padStart(2, '0');
    const daysIn = (y, mo) => new Date(Date.UTC(y, mo, 0)).getUTCDate();
    function parseDate(v) {
        const x = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v == null ? '' : v));
        if (!x) return null;
        const y = +x[1], mo = +x[2], d = +x[3];
        if (y < 1950 || y > 2200 || mo < 1 || mo > 12 || d < 1 || d > daysIn(y, mo)) return null;
        return { y, m: mo, d };
    }
    const isDate = v => !!parseDate(v);
    const dayNum = iso => { const p = parseDate(iso); return Math.round(Date.UTC(p.y, p.m - 1, p.d) / 864e5); };
    const fromNum = n => { const d = new Date(n * 864e5); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); };
    const addDays = (iso, n) => fromNum(dayNum(iso) + n);
    const diff = (a, b) => dayNum(b) - dayNum(a);
    const todayIso = (d = new Date()) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    // Same day k months later, or the last day of a shorter month (31 Aug + 6 months = 28 Feb).
    function addMonths(iso, k) {
        const p = parseDate(iso), t = p.y * 12 + (p.m - 1) + k, y = Math.floor(t / 12), mo = t - y * 12 + 1;
        return y + '-' + pad(mo) + '-' + pad(Math.min(p.d, daysIn(y, mo)));
    }
    function longDate(iso, withDay = true) {
        const p = parseDate(iso); if (!p) return '';
        const dow = DAYS[new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()];
        return (withDay ? dow + ' ' : '') + p.d + ' ' + MONTHS[p.m - 1] + ' ' + p.y;
    }
    const shortDate = (iso, today) => { const p = parseDate(iso); return p ? p.d + ' ' + MONTHS[p.m - 1] + (today && iso.slice(0, 4) === today.slice(0, 4) ? '' : ' ' + p.y) : ''; };
    const plural = (n, w) => group(n) + ' ' + w + (n === 1 ? '' : 's');
    function span(from, to) {                   // a time in words from `from` to `to` (to >= from)
        const d = diff(from, to);
        if (d < 14) return plural(d, 'day');
        if (d < 62) return plural(Math.floor(d / 7), 'week');
        let k = 0; while (k < 2400 && addMonths(from, k + 1) <= to) k++;
        const y = Math.floor(k / 12), r = k % 12;
        return (y ? plural(y, 'year') : '') + (y && r ? ' ' : '') + (r ? plural(r, 'month') : '');
    }
    const timeText = t => t ? plural(t.n, t.u === 'w' ? 'week' : 'month') : '';

    // ---- odometer: each reading is { on, r (what the meter showed), base }. Distance driven in all = r + base.
    // base only changes when the meter was replaced or reset, so the total keeps counting.
    const total = x => x.r + x.base;
    const lastReading = v => v.readings.length ? v.readings[v.readings.length - 1] : null;
    const curTotal = v => { const r = lastReading(v); return r ? total(r) : null; };
    const curBase = v => { const r = lastReading(v); return r ? r.base : 0; };
    // Average distance a day from the readings of the last year (needs 7+ days between them).
    function perDay(v, today) {
        const rs = v.readings.filter(r => diff(r.on, today) <= 365);
        if (rs.length < 2) return 0;
        const a = rs[0], b = rs[rs.length - 1], days = diff(a.on, b.on), d = total(b) - total(a);
        return days >= 7 && d > 0 ? d / days : 0;
    }

    // ---- one service job
    // job: { id, type, name, dist (0 = not by distance), time ({ n, u } or null), history: [{ on, r (null = not known), base, cost (cents or null), note }] }
    const jobTitle = (v, j) => j.type === 'other' ? j.name : (jobType(v.kind, j.type) || { label: j.name || 'Service' }).label;
    function lastDone(j) {                       // the most recent time it was done
        let best = null;
        j.history.forEach(h => { if (!best || h.on > best.on || (h.on === best.on && (h.r == null ? -1 : h.r + h.base) >= (best.r == null ? -1 : best.r + best.base))) best = h; });
        return best;
    }
    function soonDist(j) { return Math.min(j.dist, Math.max(Math.round(j.dist / 10), 100)); }
    function soonDays(j) { const days = j.time.u === 'w' ? j.time.n * 7 : j.time.n * 30; return Math.min(30, Math.max(7, Math.round(days / 10))); }
    // Where a job stands today. level: 'over' | 'due' | 'soon' | 'ok' | 'need' (needs an odometer reading)
    function status(v, j, today) {
        const last = lastDone(j), cur = curTotal(v), s = { last, level: 'ok' };
        if (j.dist) {
            if (last && last.r != null) {
                s.dueTotal = last.r + last.base + j.dist; s.dueAt = s.dueTotal - curBase(v);
                if (cur != null) s.left = s.dueTotal - cur;
            }
            if (s.left == null) s.needReading = true;
        }
        if (j.time && last) { s.dueOn = j.time.u === 'w' ? addDays(last.on, j.time.n * 7) : addMonths(last.on, j.time.n); s.daysLeft = diff(today, s.dueOn); }
        const rate = perDay(v, today), lr = lastReading(v);
        if (s.left > 0 && rate && lr) { s.rate = rate; s.estOn = addDays(lr.on, Math.ceil(s.left / rate)); }
        const distOver = s.left != null && s.left < 0, timeOver = s.daysLeft != null && s.daysLeft < 0;
        if (distOver || timeOver) s.level = 'over';
        else if (s.left === 0 || s.daysLeft === 0) s.level = 'due';
        else if ((s.left != null && s.left <= soonDist(j)) || (s.daysLeft != null && s.daysLeft <= soonDays(j)) || (s.estOn && diff(today, s.estOn) <= 14)) s.level = 'soon';
        else if (s.needReading && s.dueOn == null) s.level = 'need';
        s.distOver = distOver; s.timeOver = timeOver;
        // the day it is expected, for sorting: overdue first (most overdue first), then soonest
        const dates = [s.dueOn, s.estOn].filter(Boolean).sort();
        s.when = dates.length ? dates[0] : null;
        s.first = s.dueOn && s.estOn ? (s.estOn < s.dueOn ? 'dist' : 'time') : '';
        return s;
    }
    const RANK = { over: 0, due: 1, soon: 2, ok: 3, need: 4 };
    function sortKey(v, j, s, today) {
        let score;
        if (s.level === 'over') {
            const byDist = s.left != null && s.left < 0 ? s.left / Math.max(1, j.dist) : 0, byTime = s.daysLeft != null && s.daysLeft < 0 ? s.daysLeft / 365 : 0;
            score = Math.min(byDist, byTime);
        } else {
            const a = s.left != null ? s.left / Math.max(1, j.dist) : Infinity, b = s.when ? diff(today, s.when) / 365 : Infinity;
            score = Math.min(a, b); if (score === Infinity) score = 99;
        }
        return [RANK[s.level], score];
    }
    function sortJobs(v, today) {
        return v.jobs.map(j => ({ j, s: status(v, j, today) }))
            .map(x => Object.assign(x, { key: sortKey(v, x.j, x.s, today) }))
            .sort((a, b) => a.key[0] - b.key[0] || a.key[1] - b.key[1] || jobTitle(v, a.j).localeCompare(jobTitle(v, b.j)));
    }

    // The main line for a job, in plain words.
    function headline(v, j, s, today) {
        const u = v.unit;
        if (s.level === 'over') {
            const parts = [];
            if (s.distOver) parts.push('overdue by ' + dist(-s.left, u));
            if (s.timeOver) parts.push((s.distOver ? 'and ' : 'overdue by ') + span(s.dueOn, today) + (s.distOver ? ' late' : ''));
            const t = parts.join(' ');
            return t.charAt(0).toUpperCase() + t.slice(1);
        }
        if (s.level === 'due') return s.left === 0 ? 'Due now: the odometer has reached ' + group(s.dueAt) + ' ' + unitWord(u) : 'Due today';
        const parts = [];
        if (s.left != null) parts.push('in ' + dist(s.left, u));
        else if (j.dist && s.needReading && s.dueAt != null) parts.push('at ' + dist(s.dueAt, u));
        if (s.dueOn) parts.push((parts.length ? 'or by ' : 'by ') + longDate(s.dueOn) + (s.daysLeft === 1 ? ' (tomorrow)' : ' (in ' + span(today, s.dueOn) + ')'));
        if (!parts.length) return j.dist ? 'Type the odometer reading to see when it is due' : 'Due date not known';
        return 'Due ' + parts.join(' ') + (s.left != null && s.dueOn ? ', whichever comes first' : '');
    }
    // A second line with the details: the odometer reading to watch for and the estimate.
    function detail(v, j, s, today) {
        const u = v.unit, bits = [];
        if (s.dueAt != null && s.level !== 'over' && s.left !== 0 && s.dueAt >= 0) bits.push('Watch for ' + group(s.dueAt) + ' ' + unitWord(u) + ' on the odometer');
        if (s.level === 'over' && s.distOver && s.dueAt != null && s.dueAt >= 0) bits.push('Was due at ' + group(s.dueAt) + ' ' + unitWord(u));
        if (s.level === 'over' && s.timeOver) bits.push('Was due on ' + longDate(s.dueOn, false));
        if (s.estOn && s.level !== 'over') {
            const r = s.rate >= 10 ? Math.round(s.rate) : Math.round(s.rate * 10) / 10;
            bits.push((diff(today, s.estOn) <= 0 ? 'You have probably driven that far already: check the odometer' : 'About ' + shortDate(s.estOn, today) + ' at your usual ' + r + ' ' + unitWord(u) + ' a day') +
                (s.first === 'dist' && s.dueOn ? ', so the distance will come first' : s.first === 'time' ? ', so the date will come first' : ''));
        }
        return bits.join('. ') + (bits.length ? '.' : '');
    }
    function everyText(v, j) {
        const a = j.dist ? 'every ' + dist(j.dist, v.unit) : '', b = j.time ? 'every ' + timeText(j.time) : '';
        return (a && b ? a + ' or ' + b : a || b).replace(/^e/, 'E');
    }
    function lastText(v, j, today) {
        const l = lastDone(j); if (!l) return '';
        return 'Last done ' + longDate(l.on, false) + (l.r != null ? ' at ' + dist(l.r, v.unit) : '');
    }

    // ---- across all vehicles
    function todo(state, today) {
        const out = [];
        state.vehicles.forEach(v => sortJobs(v, today).forEach(x => { if (['over', 'due', 'soon'].includes(x.s.level)) out.push({ v, j: x.j, s: x.s, key: x.key }); }));
        return out.sort((a, b) => a.key[0] - b.key[0] || a.key[1] - b.key[1]);
    }
    function nextUp(state, today) {
        let best = null;
        state.vehicles.forEach(v => sortJobs(v, today).forEach(x => { if (x.s.level === 'ok' && (!best || x.key[1] < best.key[1])) best = { v, j: x.j, s: x.s, key: x.key }; }));
        return best;
    }
    function spent(v, today) {
        const y = today.slice(0, 4); let year = 0, all = 0, n = 0;
        v.jobs.forEach(j => j.history.forEach(h => { if (h.cost != null) { all += h.cost; n++; if (h.on.slice(0, 4) === y) year += h.cost; } }));
        return { year, all, n };
    }
    const levelWord = { over: 'Overdue', due: 'Due now', soon: 'Due soon', ok: 'OK', need: 'Needs a reading' };
    // Plain text for the mechanic: what is overdue or due soon on each vehicle.
    function mechanicText(state, vehicles, today) {
        const out = [];
        vehicles.forEach(v => {
            const items = sortJobs(v, today).filter(x => ['over', 'due', 'soon'].includes(x.s.level));
            const lr = lastReading(v);
            out.push(v.name + (lr ? ' (odometer ' + dist(lr.r, v.unit) + ' on ' + longDate(lr.on, false) + ')' : ''));
            if (!items.length) out.push('- Nothing due now.');
            items.forEach(x => out.push('- ' + jobTitle(v, x.j) + ': ' + headline(v, x.j, x.s, today).replace(/^./, c => c.toLowerCase())));
            out.push('');
        });
        return ('Service list, ' + longDate(today) + '\n\n' + out.join('\n')).trim() + '\n';
    }
    function fullText(state, today, cur) {
        const out = ['Car and motorbike services, ' + longDate(today), ''];
        state.vehicles.forEach(v => {
            const lr = lastReading(v);
            out.push(v.name + (lr ? ', odometer ' + dist(lr.r, v.unit) + ' on ' + longDate(lr.on, false) : ''));
            sortJobs(v, today).forEach(x => {
                out.push('- ' + jobTitle(v, x.j) + ' [' + levelWord[x.s.level] + ']: ' + headline(v, x.j, x.s, today).replace(/^./, c => c.toLowerCase()) + '. ' + everyText(v, x.j) + '. ' + lastText(v, x.j, today) + '.');
            });
            const sp = spent(v, today);
            if (sp.n) out.push('Spent on services: ' + fmt(sp.year, cur) + ' this year, ' + fmt(sp.all, cur) + ' in all.');
            out.push('');
        });
        return out.join('\n').trim() + '\n';
    }

    // ---- calendar file (.ics): an all-day event on each date-based due day still to come
    const esc = t => String(t).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
    function fold(line) { const out = []; let s = line; while (s.length > 74) { out.push(s.slice(0, 74)); s = ' ' + s.slice(74); } out.push(s); return out.join('\r\n'); }
    function ics(state, vehicles, today, stamp) {
        const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//umar8092//Car and Motorbike Service Reminder//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
        const ds = d => d.replace(/-/g, '');
        let n = 0;
        vehicles.forEach(v => v.jobs.forEach(j => {
            const s = status(v, j, today); if (!s.dueOn || s.dueOn < today) return;
            const title = v.name + ': ' + jobTitle(v, j) + ' due';
            const desc = everyText(v, j) + ', whichever comes first. ' + lastText(v, j, today) + '.' + (s.dueAt != null ? ' Due earlier if the odometer reaches ' + dist(s.dueAt, v.unit) + '.' : '');
            L.push('BEGIN:VEVENT', 'UID:' + v.id + '-' + j.id + '-' + s.dueOn + '@' + SLUG, 'DTSTAMP:' + stamp, 'DTSTART;VALUE=DATE:' + ds(s.dueOn),
                'DTEND;VALUE=DATE:' + ds(addDays(s.dueOn, 1)), fold('SUMMARY:' + esc(title)), fold('DESCRIPTION:' + esc(desc)), 'TRANSP:TRANSPARENT');
            [7, 0].filter(a => diff(today, s.dueOn) >= a).forEach(a => L.push('BEGIN:VALARM', 'ACTION:DISPLAY', fold('DESCRIPTION:' + esc(title)), 'TRIGGER:-P' + a + 'D', 'END:VALARM'));
            L.push('END:VEVENT'); n++;
        }));
        L.push('END:VCALENDAR');
        return { text: L.join('\r\n') + '\r\n', count: n };
    }

    // ---- changes (each returns an error string, or '' when done)
    function clip(v, max, multi) {
        let s = String(v == null ? '' : v);
        s = multi ? s.replace(/\r\n?/g, '\n').replace(/[^\S\n]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim() : s.replace(/\s+/g, ' ').trim();
        return s.slice(0, max);
    }
    const newId = state => state.nextId++;
    // Add an odometer reading for today. replaced = the meter was replaced or reset (so a lower number is fine).
    function addReading(state, v, raw, on, replaced) {
        const r = parseDist(raw);
        if (r === '') return 'Type the number on the odometer.';
        if (Number.isNaN(r)) return 'Type the odometer as a whole number, like 45210.';
        const lr = lastReading(v);
        if (lr && on < lr.on) return 'There is already a later reading (' + longDate(lr.on, false) + ').';
        let base = lr ? lr.base : 0;
        if (lr && r < lr.r) {
            if (!replaced) return 'LOWER';
            base = total(lr) - r;              // keep counting from the last reading
        }
        if (lr && lr.on === on) v.readings.pop();
        v.readings.push({ on, r, base });
        if (v.readings.length > MAX_READINGS) v.readings.splice(0, v.readings.length - MAX_READINGS);
        return '';
    }
    // Mark a job done on a day at a reading (raw text, may be blank when the job is only by time). Cost/note optional.
    function markDone(state, v, j, f, today) {
        if (!isDate(f.on)) return { field: 'on', err: 'Pick the day it was done.' };
        if (f.on > today) return { field: 'on', err: 'That day has not come yet. Pick today or an earlier day.' };
        const r = parseDist(f.reading);
        if (Number.isNaN(r)) return { field: 'reading', err: 'Type the odometer as a whole number, like 45210.' };
        if (r === '' && j.dist) return { field: 'reading', err: 'Type the odometer reading when it was done. It counts the next ' + dist(j.dist, v.unit) + ' from there.' };
        const lr = lastReading(v);
        if (r !== '' && lr && f.on >= lr.on && r < lr.r) return { field: 'reading', err: 'That is lower than the last odometer reading (' + dist(lr.r, v.unit) + ' on ' + longDate(lr.on, false) + '). Check the number.' };
        const cost = parseMoney(f.cost);
        if (Number.isNaN(cost)) return { field: 'cost', err: 'Type the cost as a number, like 3500 or 3500.50.' };
        const entry = { on: f.on, r: r === '' ? null : r, base: curBase(v), cost: cost === '' ? null : cost, note: clip(f.note, 200) };
        j.history.push(entry);
        if (j.history.length > MAX_HISTORY) j.history.splice(0, j.history.length - MAX_HISTORY);
        // a newer reading also moves the odometer on
        if (entry.r != null && (!lr || (f.on >= lr.on && entry.r >= lr.r))) addReading(state, v, String(entry.r), f.on, false);
        return { err: '' };
    }

    // ---- reading the add/edit form (strings from the page)
    // f: { vehicle ('new' or id), vName, vKind, vUnit, vOdo, type, name, dist, timeN, timeU, lastOn, lastAt }
    function readForm(f, state, today, editing) {
        const errs = {}, isNew = f.vehicle === 'new';
        let v = isNew ? null : state.vehicles.find(x => String(x.id) === String(f.vehicle));
        let kind = 'car', unit = 'km', odo = null;
        if (isNew) {
            const name = clip(f.vName, 40);
            if (!name) errs.vName = 'Type a name for the vehicle, like Honda City or My bike.';
            else if (state.vehicles.some(x => x.name.toLowerCase() === name.toLowerCase())) errs.vName = 'You already have a vehicle called ' + name + '. Pick it above, or use another name.';
            else if (state.vehicles.length >= MAX_VEHICLES) errs.vName = 'You can keep up to ' + MAX_VEHICLES + ' vehicles.';
            kind = f.vKind === 'bike' ? 'bike' : 'car'; unit = f.vUnit === 'mi' ? 'mi' : 'km';
            const o = parseDist(f.vOdo);
            if (o === '') errs.vOdo = 'Type the number on the odometer now.';
            else if (Number.isNaN(o)) errs.vOdo = 'Type the odometer as a whole number, like 45210.';
            else odo = o;
        } else if (!v) errs.vehicle = 'Pick a vehicle.';
        else { kind = v.kind; unit = v.unit; odo = curTotal(v) == null ? null : lastReading(v).r; }
        const type = jobType(kind, f.type) ? f.type : 'other';
        const name = clip(f.name, 50);
        if (type === 'other' && !name) errs.name = 'Type what the service is, like Clutch plate or Car wash.';
        const d = parseDist(f.dist), tn = parseWhole(f.timeN, f.timeU === 'w' ? 260 : 120);
        if (Number.isNaN(d) || d === 0) errs.dist = 'Type a whole number of ' + unitWord(unit) + ', or leave it empty.';
        if (Number.isNaN(tn)) errs.time = f.timeU === 'w' ? 'Type 1 to 260 weeks, or leave it empty.' : 'Type 1 to 120 months, or leave it empty.';
        if (d === '' && tn === '' && !errs.dist && !errs.time) errs.dist = 'Fill in at least one: how many ' + unitWord(unit) + ', or how many months.';
        if (!isDate(f.lastOn)) errs.lastOn = 'Pick the day it was last done. Not sure? Leave today.';
        else if (f.lastOn > today) errs.lastOn = 'That day has not come yet. Pick today or an earlier day.';
        let at = parseDist(f.lastAt);
        if (d !== '' && !Number.isNaN(d)) {
            if (at === '') errs.lastAt = 'Type the odometer reading when it was last done. Not sure? Use today\'s reading.';
            else if (Number.isNaN(at)) errs.lastAt = 'Type the odometer as a whole number, like 45210.';
            else if (odo != null && at > odo) errs.lastAt = 'That is more than the odometer shows now (' + dist(odo, unit) + ').';
        } else if (Number.isNaN(at)) errs.lastAt = 'Type the odometer as a whole number, or leave it empty.';
        if (!isNew && v && !editing && v.jobs.length >= MAX_JOBS) errs.type = 'This vehicle already has ' + MAX_JOBS + ' services.';
        if (!isNew && v && !errs.name) {
            const title = type === 'other' ? name : jobType(kind, type).label;
            const clash = v.jobs.find(j => j.id !== (editing || 0) && jobTitle(v, j).toLowerCase() === title.toLowerCase());
            if (clash) errs.type = v.name + ' already has ' + title + '. Use Edit on it instead.';
        }
        if (Object.keys(errs).length) return { errs };
        return { errs: null, isNew, v, kind, unit, odo, type, name: type === 'other' ? name : '', dist: d === '' ? 0 : d, time: tn === '' ? null : { n: tn, u: f.timeU === 'w' ? 'w' : 'm' },
            lastOn: f.lastOn, lastAt: at === '' || Number.isNaN(at) ? null : at, vName: clip(f.vName, 40) };
    }
    // Apply a checked form. Returns the job.
    function applyForm(state, r, today, editingId) {
        let v = r.v;
        if (r.isNew) {
            v = { id: newId(state), name: r.vName, kind: r.kind, unit: r.unit, readings: [], jobs: [] };
            v.readings.push({ on: today, r: r.odo, base: 0 });
            state.vehicles.push(v);
        }
        let j = editingId ? v.jobs.find(x => x.id === editingId) : null;
        const entry = { on: r.lastOn, r: r.lastAt, base: curBase(v), cost: null, note: '' };
        if (j) {
            j.type = r.type; j.name = r.name; j.dist = r.dist; j.time = r.time;
            const l = lastDone(j);
            if (l) { l.on = r.lastOn; if (r.lastAt !== l.r) { l.r = r.lastAt; l.base = curBase(v); } } else j.history.push(entry);
        } else {
            j = { id: newId(state), type: r.type, name: r.name, dist: r.dist, time: r.time, history: [entry] };
            v.jobs.push(j);
        }
        return { v, j };
    }
    function previewText(r, today) {
        const v = r.isNew ? { id: 0, name: r.vName, kind: r.kind, unit: r.unit, readings: [{ on: today, r: r.odo, base: 0 }], jobs: [] } : r.v;
        const j = { id: -1, type: r.type, name: r.name, dist: r.dist, time: r.time, history: [{ on: r.lastOn, r: r.lastAt, base: curBase(v), cost: null, note: '' }] };
        const s = status(v, j, today);
        return levelWord[s.level] + ': ' + headline(v, j, s, today).replace(/^./, c => c.toLowerCase()) + '.';
    }

    // ---- saved state
    const emptyState = () => ({ v: 1, nextId: 1, vehicles: [] });
    // Checks every value from storage or a backup file; anything wrong is dropped, never trusted.
    function validate(s) {
        if (!s || typeof s !== 'object' || !Array.isArray(s.vehicles)) return null;
        const out = emptyState(), ids = new Set(), names = new Set();
        const okId = x => Number.isInteger(x) && x >= 1 && x <= 1e9;
        const okDist = x => Number.isInteger(x) && x >= 0 && x <= MAX_DIST;
        const okBase = x => Number.isInteger(x) && Math.abs(x) <= MAX_DIST * 10;
        s.vehicles.slice(0, MAX_VEHICLES).forEach(x => {
            if (!x || typeof x !== 'object' || !okId(x.id) || ids.has(x.id)) return;
            const name = clip(x.name, 40); if (!name || names.has(name.toLowerCase())) return;
            const v = { id: x.id, name, kind: x.kind === 'bike' ? 'bike' : 'car', unit: x.unit === 'mi' ? 'mi' : 'km', readings: [], jobs: [] };
            (Array.isArray(x.readings) ? x.readings : []).forEach(r => { if (r && isDate(r.on) && okDist(r.r) && okBase(r.base || 0)) v.readings.push({ on: r.on, r: r.r, base: r.base || 0 }); });
            v.readings = v.readings.map((r, i) => [r, i]).sort((a, b) => a[0].on < b[0].on ? -1 : a[0].on > b[0].on ? 1 : a[1] - b[1]).map(a => a[0]).slice(-MAX_READINGS);
            ids.add(v.id); names.add(name.toLowerCase());
            const titles = new Set();
            (Array.isArray(x.jobs) ? x.jobs : []).slice(0, MAX_JOBS).forEach(y => {
                if (!y || typeof y !== 'object' || !okId(y.id) || ids.has(y.id)) return;
                const type = jobType(v.kind, y.type) ? y.type : 'other';
                const j = { id: y.id, type, name: type === 'other' ? clip(y.name, 50) || 'Service' : '', dist: Number.isInteger(y.dist) && y.dist >= 1 && y.dist <= MAX_DIST ? y.dist : 0, time: null, history: [] };
                const t = y.time; if (t && Number.isInteger(t.n) && (t.u === 'w' ? t.n >= 1 && t.n <= 260 : t.u === 'm' && t.n >= 1 && t.n <= 120)) j.time = { n: t.n, u: t.u };
                if (!j.dist && !j.time) return;
                (Array.isArray(y.history) ? y.history : []).slice(-MAX_HISTORY).forEach(h => {
                    if (!h || !isDate(h.on)) return;
                    j.history.push({ on: h.on, r: okDist(h.r) ? h.r : null, base: okBase(h.base || 0) ? h.base || 0 : 0,
                        cost: Number.isInteger(h.cost) && h.cost >= 0 && h.cost <= MAX_COST ? h.cost : null, note: clip(h.note, 200) });
                });
                if (!j.history.length) return;
                const title = jobTitle(v, j).toLowerCase(); if (titles.has(title)) return;
                titles.add(title); ids.add(j.id); v.jobs.push(j);
            });
            out.vehicles.push(v);
        });
        out.nextId = Math.max(1, ...[...ids].map(i => i + 1), okId(s.nextId) ? s.nextId : 1);
        return out;
    }

    const api = { SLUG, SYMBOLS, JOBS, MAX_VEHICLES, MAX_JOBS, jobType, unitWord, group, dist, parseDist, parseMoney, fmt, parseDate, isDate, addDays, addMonths, diff, todayIso,
        longDate, shortDate, span, total, lastReading, curTotal, curBase, perDay, jobTitle, lastDone, status, sortJobs, headline, detail, everyText, lastText, todo, nextUp, spent,
        levelWord, mechanicText, fullText, ics, clip, addReading, markDone, readForm, applyForm, previewText, emptyState, validate };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ServiceCore = api;
})(this);
