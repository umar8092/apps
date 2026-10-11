// Medication Tracker logic, no page code. Every function that depends on the clock takes `now` (milliseconds), so tests are exact.
// Days are local 'YYYY-MM-DD' keys, set times are 'HH:MM', a dose slot is 'YYYY-MM-DD HH:MM'. Pill counts are whole hundredths (1.5 pills = 150).
(function (root) {
    const MIN = 60000, HOUR = 60 * MIN, DAY = 24 * HOUR;
    const MAX_MEDS = 40, MAX_TIMES = 8, MAX_NAME = 60, MAX_WHO = 40, MAX_LOGS = 6000, KEEP_DAYS = 400;
    const CARRY = 12 * HOUR;      // a set time from yesterday stays on Today for 12 hours if it was not logged (late-night doses)
    const pad = n => String(n).padStart(2, '0');

    // ---- dates
    const dayKey = ms => { const d = new Date(ms); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
    const isDay = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && dayKey(new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)).getTime()) === s;
    const isTime = s => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
    const dayStart = day => new Date(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10)).getTime();
    const addDays = (day, n) => dayKey(new Date(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10) + n, 12).getTime());
    const weekday = day => new Date(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10)).getDay();
    const slotAt = (day, time) => new Date(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10), +time.slice(0, 2), +time.slice(3, 5)).getTime();
    const mins = t => +t.slice(0, 2) * 60 + +t.slice(3, 5);
    const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    // "35 min", "2 h 40 min", "3 days"
    function dur(ms) {
        ms = Math.max(0, ms);
        if (ms < MIN) return 'less than a minute';
        const m = Math.floor(ms / MIN);
        if (m < 60) return m + ' min';
        if (m < 48 * 60) { const h = Math.floor(m / 60), r = m % 60; return h + ' h' + (r ? ' ' + r + ' min' : ''); }
        return Math.floor(m / (24 * 60)) + ' days';
    }

    // ---- reading what people type
    // Hours between doses: "4", "1.5", "0,5". Returns { min } or { err }.
    function parseHours(v) {
        const s = String(v == null ? '' : v).trim().replace(',', '.');
        if (!s) return { err: 'blank' };
        if (/^-/.test(s)) return { err: 'negative' };
        if (!/^\d{0,3}(\.\d{0,2})?$/.test(s) || s === '.') return { err: 'nan' };
        const m = Math.round(parseFloat(s) * 60);
        if (m < 15) return { err: 'small' };
        if (m > 7 * 24 * 60) return { err: 'big' };
        return { min: m };
    }
    // A pill count: "28", "12.5", "0,5" -> hundredths. Returns { n }, { blank } or { err }.
    function parsePills(v, max) {
        const s = String(v == null ? '' : v).trim().replace(',', '.');
        if (!s) return { blank: true };
        if (/^-/.test(s)) return { err: 'negative' };
        if (!/^\d{0,5}(\.\d{0,2})?$/.test(s) || s === '.') return { err: 'nan' };
        const n = Math.round(parseFloat(s) * 100);
        if (n > (max || 999900)) return { err: 'big' };
        return { n };
    }
    const pillsText = n => { const w = Math.floor(n / 100), f = n % 100; return f ? (w + '.' + pad(f)).replace(/0$/, '') : String(w); };
    function cleanTimes(list) {
        const out = [...new Set((list || []).filter(isTime))].sort();
        return out.slice(0, MAX_TIMES);
    }

    // ---- the schedule of one medicine (it can change; old days keep the schedule they had)
    function planFor(med, day) {
        let p = med.plans[0];
        for (const q of med.plans) if (q.from <= day) p = q;
        return p;
    }
    const current = med => med.plans[med.plans.length - 1];
    function activeOn(med, day) { return day >= med.start && (!med.end || day <= med.end); }
    function slotsForDay(med, day) {
        if (!activeOn(med, day)) return [];
        const p = planFor(med, day);
        if (p.kind !== 'times' || !p.days.includes(weekday(day))) return [];
        return p.times.map(t => ({ key: day + ' ' + t, day, time: t, at: slotAt(day, t) }));
    }
    // Shortest safe gap used for the "too soon" warning on set-time medicines: half the shortest time between two set times (12 h for once a day).
    function minGap(plan) {
        if (plan.kind === 'needed') return plan.gap * MIN;
        const t = plan.times.map(mins);
        if (t.length < 2) return 12 * HOUR;
        let g = 24 * 60;
        for (let i = 0; i < t.length; i++) g = Math.min(g, ((t[(i + 1) % t.length] - t[i]) + 24 * 60) % (24 * 60) || 24 * 60);
        return Math.round(g / 2) * MIN;
    }

    const medLogs = (state, id) => state.logs.filter(l => l.med === id);
    const taken = logs => logs.filter(l => !l.skip);
    function lastTaken(state, id, now) {
        let last = null;
        for (const l of state.logs) if (l.med === id && !l.skip && l.t <= now + MIN && (!last || l.t > last.t)) last = l;
        return last;
    }

    // As-needed medicine: when may the next dose be taken? { last, count24, nextOk (ms or null = now is fine), reason }
    function neededStatus(state, med, now) {
        const p = current(med), last = lastTaken(state, med.id, now);
        const in24 = taken(medLogs(state, med.id)).filter(l => l.t > now - DAY && l.t <= now).sort((a, b) => a.t - b.t);
        let nextOk = null, reason = '';
        if (last && last.t + p.gap * MIN > now) { nextOk = last.t + p.gap * MIN; reason = 'gap'; }
        if (p.max && in24.length >= p.max) {
            const freeAt = in24[in24.length - p.max].t + DAY;    // when the oldest dose that counts leaves the 24-hour window
            if (!nextOk || freeAt > nextOk) { nextOk = freeAt; reason = 'max'; }
        }
        return { last, count24: in24.length, max: p.max || null, gap: p.gap, nextOk, reason };
    }

    // Is it safe to log a dose now? Returns a warning sentence, or '' when all is fine.
    function checkDose(state, med, now, fmtTime) {
        fmtTime = fmtTime || (ms => { const d = new Date(ms); return pad(d.getHours()) + ':' + pad(d.getMinutes()); });
        const p = current(med), last = lastTaken(state, med.id, now), warn = [];
        if (p.kind === 'needed') {
            const s = neededStatus(state, med, now);
            if (s.max && s.count24 >= s.max) warn.push('You have already logged ' + s.count24 + ' doses of ' + med.name + ' in the last 24 hours, and your limit is ' + s.max + '.');
            if (last && now - last.t < p.gap * MIN) warn.push('The last dose was at ' + fmtTime(last.t) + ', ' + dur(now - last.t) + ' ago. You set at least ' + hoursText(p.gap) + ' between doses, so the next one is due from ' + fmtTime(last.t + p.gap * MIN) + '.');
        } else if (last && now - last.t < minGap(p)) {
            warn.push('You already logged ' + med.name + ' at ' + fmtTime(last.t) + ', ' + dur(now - last.t) + ' ago.');
        }
        return warn.join(' ');
    }
    const hoursText = m => { const h = Math.floor(m / 60), r = m % 60; return (h ? h + ' h' : '') + (h && r ? ' ' : '') + (r ? r + ' min' : ''); };

    // Pills left (null when not counted), and roughly how many days that lasts.
    function pillsLeft(state, med) {
        if (!med.pills) return null;
        let left = med.pills.left;
        for (const l of state.logs) if (l.med === med.id && !l.skip && l.c >= med.pills.at) left -= l.pills || 0;
        const p = current(med);
        let perDay = null;
        if (p.kind === 'times' && med.perDose > 0) perDay = p.times.length * p.days.length / 7 * med.perDose;
        const days = perDay ? Math.floor(Math.max(0, left) / perDay) : null;
        return { left: Math.max(0, left), short: left < 0, days, low: left < med.perDose || (days != null && days <= 7), out: left < med.perDose };
    }

    // Everything the Today screen shows.
    function todayView(state, now) {
        const today = dayKey(now), yest = addDays(today, -1);
        const bySlot = new Map();
        for (const l of state.logs) if (l.slot) bySlot.set(l.med + '|' + l.slot, l);
        const meds = [];
        let due = 0, done = 0, total = 0, next = null;
        for (const med of state.meds) {
            const p = current(med), v = { med, kind: p.kind, plan: p, slots: [], extras: [], last: lastTaken(state, med.id, now), pills: pillsLeft(state, med) };
            v.finished = !!med.end && today > med.end;
            v.notStarted = today < med.start;
            if (p.kind === 'times' || planFor(med, yest).kind === 'times') {
                const todays = slotsForDay(med, today);
                // an unlogged set time from yesterday stays for up to 12 hours, but not once the next set time has come
                const nextAfter = s => { const n = slotsForDay(med, yest).concat(todays).find(x => x.at > s.at); return n ? n.at : Infinity; };
                const carried = slotsForDay(med, yest).filter(s => !bySlot.has(med.id + '|' + s.key) && s.at >= now - CARRY && nextAfter(s) > now).map(s => Object.assign(s, { carried: true }));
                const yestTaken = slotsForDay(med, yest).filter(s => bySlot.has(med.id + '|' + s.key) && bySlot.get(med.id + '|' + s.key).t >= dayStart(today) && s.at >= now - CARRY)
                    .map(s => Object.assign(s, { carried: true }));
                for (const s of [...carried, ...yestTaken].sort((a, b) => a.at - b.at).concat(todays)) {
                    const log = bySlot.get(med.id + '|' + s.key) || null;
                    s.log = log;
                    s.state = log ? (log.skip ? 'skipped' : 'taken') : s.at <= now ? 'due' : 'later';
                    if (!s.carried) { total++; if (log) done++; }
                    if (s.state === 'due') due++;
                    if (s.state === 'later' && (!next || s.at < next.at)) next = { at: s.at, med, time: s.time };
                    v.slots.push(s);
                }
                const keys = new Set(v.slots.map(s => s.key));
                v.extras = taken(medLogs(state, med.id)).filter(l => dayKey(l.t) === today && (!l.slot || (l.slot.slice(0, 10) === today && !keys.has(l.slot)))).sort((a, b) => a.t - b.t);
            }
            if (p.kind === 'needed') {
                v.need = neededStatus(state, med, now);
                v.extras = taken(medLogs(state, med.id)).filter(l => dayKey(l.t) === today && !l.slot).sort((a, b) => a.t - b.t);
                if (planFor(med, today).kind === 'needed') v.slots = v.slots.filter(s => s.log);
            }
            meds.push(v);
        }
        // due first, then by the next set time, then as-needed
        const rank = v => v.finished ? 4 : v.slots.some(s => s.state === 'due') ? 0 : v.kind === 'times' ? 1 : 2;
        const nextAt = v => { const s = v.slots.find(x => x.state === 'later' || x.state === 'due'); return s ? s.at : Infinity; };
        meds.sort((a, b) => rank(a) - rank(b) || nextAt(a) - nextAt(b) || a.med.name.localeCompare(b.med.name));
        return { today, meds, due, done, total, next };
    }

    // History for the last `days` days: per day, per medicine, what was taken, skipped or not logged. Set times still ahead today are left out.
    function history(state, now, days) {
        const today = dayKey(now), out = [], tot = { set: 0, taken: 0, skipped: 0, missed: 0, needed: 0 };
        const bySlot = new Map();
        for (const l of state.logs) if (l.slot) bySlot.set(l.med + '|' + l.slot, l);
        for (let i = 0; i < days; i++) {
            const day = addDays(today, -i), rows = [];
            for (const med of state.meds) {
                if (!activeOn(med, day) && !state.logs.some(l => l.med === med.id && (l.slot ? l.slot.slice(0, 10) === day : dayKey(l.t) === day))) continue;
                const r = { med, items: [] };
                for (const s of slotsForDay(med, day)) {
                    const log = bySlot.get(med.id + '|' + s.key);
                    if (!log && (s.at > now || s.at < med.created)) continue;     // still ahead, or before the medicine was added
                    if (!log) { r.items.push({ time: s.time, state: 'missed' }); tot.missed++; tot.set++; }
                    else if (log.skip) { r.items.push({ time: s.time, state: 'skipped' }); tot.skipped++; tot.set++; }
                    else { r.items.push({ time: s.time, state: 'taken', t: log.t }); tot.taken++; tot.set++; }
                }
                const keys = new Set(slotsForDay(med, day).map(s => s.key));
                for (const l of taken(medLogs(state, med.id))) {
                    const d = l.slot ? l.slot.slice(0, 10) : dayKey(l.t);
                    if (d === day && !(l.slot && keys.has(l.slot))) { r.items.push({ state: 'extra', t: l.t }); tot.needed++; }
                }
                r.items.sort((a, b) => (a.t || slotAt(day, a.time)) - (b.t || slotAt(day, b.time)));
                if (r.items.length) rows.push(r);
            }
            out.push({ day, rows });
        }
        return { days: out, tot };
    }

    // Plain-text history for copy, email and print.
    function historyText(state, now, days, fmtTime, fmtDay) {
        fmtTime = fmtTime || (ms => { const d = new Date(ms); return pad(d.getHours()) + ':' + pad(d.getMinutes()); });
        fmtDay = fmtDay || (d => d);
        const h = history(state, now, days), L = [];
        L.push('Medication log, last ' + days + ' days (to ' + fmtDay(dayKey(now)) + ')');
        L.push(summaryLine(h.tot));
        L.push('');
        L.push('Medicines:');
        for (const m of state.meds) L.push('- ' + m.name + (m.who ? ' (for ' + m.who + ')' : '') + ': ' + scheduleText(m, fmtTime));
        for (const d of h.days) {
            L.push('');
            L.push(fmtDay(d.day));
            if (!d.rows.length) L.push('  Nothing logged');
            for (const r of d.rows) L.push('  ' + r.med.name + ': ' + r.items.map(it => itemText(it, fmtTime, d.day)).join(', '));
        }
        return L.join('\n');
    }
    function itemText(it, fmtTime, day) {
        const ft = t => fmtTime(slotAt(day, t));
        if (it.state === 'taken') return ft(it.time) + ' dose taken at ' + fmtTime(it.t) + (dayKey(it.t) !== day ? ' (next day)' : '');
        if (it.state === 'skipped') return ft(it.time) + ' dose skipped';
        if (it.state === 'missed') return ft(it.time) + ' dose not logged';
        return 'taken at ' + fmtTime(it.t);
    }
    function summaryLine(t) {
        const parts = [];
        if (t.set) parts.push(t.taken + ' of ' + t.set + ' set doses taken' + (t.skipped ? ', ' + t.skipped + ' skipped' : '') + (t.missed ? ', ' + t.missed + ' not logged' : ''));
        if (t.needed) parts.push(t.needed + (t.needed === 1 ? ' dose' : ' doses') + ' taken when needed');
        return parts.length ? parts.join('. ') + '.' : 'Nothing logged yet.';
    }
    function scheduleText(med, fmtTime) {
        fmtTime = fmtTime || (ms => { const d = new Date(ms); return pad(d.getHours()) + ':' + pad(d.getMinutes()); });
        const p = current(med);
        let s;
        if (p.kind === 'needed') s = 'when needed, at least ' + hoursText(p.gap) + ' apart' + (p.max ? ', up to ' + p.max + ' in 24 hours' : '');
        else {
            const ts = p.times.map(t => fmtTime(slotAt('2024-01-01', t)));
            s = (ts.length > 1 ? ts.slice(0, -1).join(', ') + ' and ' + ts[ts.length - 1] : ts[0]) + ', ' + daysText(p.days);
        }
        if (med.end) s += ', until ' + med.end;
        return s;
    }
    function daysText(days) {
        if (days.length === 7) return 'every day';
        if (days.length === 5 && [1, 2, 3, 4, 5].every(d => days.includes(d))) return 'Monday to Friday';
        const order = [1, 2, 3, 4, 5, 6, 0].filter(d => days.includes(d)).map(d => DAY_NAMES[d]);
        return 'on ' + (order.length > 1 ? order.slice(0, -1).join(', ') + ' and ' + order[order.length - 1] : order[0]);
    }

    // When the schedule changes, today's doses logged for a set time that no longer exists move to the nearest new time that is still open.
    function remapToday(state, med, now) {
        const today = dayKey(now), slots = slotsForDay(med, today);
        const used = new Set(state.logs.filter(l => l.med === med.id && l.slot && slots.some(s => s.key === l.slot)).map(l => l.slot));
        for (const l of state.logs.filter(x => x.med === med.id && x.slot && x.slot.slice(0, 10) === today && !slots.some(s => s.key === x.slot)).sort((a, b) => a.t - b.t)) {
            const free = slots.filter(s => !used.has(s.key)).sort((a, b) => Math.abs(a.at - l.t) - Math.abs(b.at - l.t))[0];
            if (free && !l.skip) { l.slot = free.key; used.add(free.key); } else if (l.skip) l.slot = '__gone'; else l.slot = null;
        }
        state.logs = state.logs.filter(l => l.slot !== '__gone');
    }

    // Calendar file with a repeating reminder at every set time (floating local time, so it follows the phone's clock).
    function ics(state, today, stamp) {
        const esc = s => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
        const fold = line => { const out = []; let s = line; while (s.length > 74) { out.push(s.slice(0, 74)); s = ' ' + s.slice(74); } out.push(s); return out.join('\r\n'); };
        const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//umar8092//Medication Tracker//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
        let n = 0;
        const BY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
        for (const med of state.meds) {
            const p = current(med);
            if (p.kind !== 'times' || (med.end && med.end < today)) continue;
            let first = today < med.start ? med.start : today;
            for (let i = 0; i < 7 && !p.days.includes(weekday(first)); i++) first = addDays(first, 1);
            for (const t of p.times) {
                n++;
                const rule = p.days.length === 7 ? 'FREQ=DAILY' : 'FREQ=WEEKLY;BYDAY=' + [1, 2, 3, 4, 5, 6, 0].filter(d => p.days.includes(d)).map(d => BY[d]).join(',');
                L.push('BEGIN:VEVENT', 'UID:' + med.id + '-' + t.replace(':', '') + '@umar8092.github.io', 'DTSTAMP:' + stamp,
                    'DTSTART:' + first.replace(/-/g, '') + 'T' + t.replace(':', '') + '00', 'DURATION:PT5M',
                    'RRULE:' + rule + (med.end ? ';UNTIL=' + med.end.replace(/-/g, '') + 'T235959' : ''),
                    fold('SUMMARY:' + esc('Take ' + med.name + (med.who ? ' (for ' + med.who + ')' : ''))),
                    fold('DESCRIPTION:' + esc('Open Medication Tracker and tap Taken: https://umar8092.github.io/apps/medication-tracker/')),
                    'BEGIN:VALARM', 'ACTION:DISPLAY', fold('DESCRIPTION:' + esc('Take ' + med.name)), 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT');
            }
        }
        L.push('END:VCALENDAR');
        return { n, text: L.join('\r\n') + '\r\n' };
    }

    // Saved or imported data: keep only what is valid, never trust it.
    function clean(raw, now) {
        const out = { v: 1, meds: [], logs: [] };
        if (!raw || typeof raw !== 'object') return out;
        const ids = new Set();
        for (const m of Array.isArray(raw.meds) ? raw.meds.slice(0, MAX_MEDS) : []) {
            if (!m || typeof m !== 'object' || typeof m.id !== 'string' || !/^[\w-]{1,40}$/.test(m.id) || ids.has(m.id)) continue;
            const name = typeof m.name === 'string' ? m.name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME) : '';
            if (!name || !isDay(m.start)) continue;
            const plans = [];
            for (const p of Array.isArray(m.plans) ? m.plans.slice(-50) : []) {
                if (!p || !isDay(p.from)) continue;
                if (p.kind === 'needed') {
                    const gap = Number.isInteger(p.gap) && p.gap >= 15 && p.gap <= 7 * 24 * 60 ? p.gap : null;
                    if (gap == null) continue;
                    const max = Number.isInteger(p.max) && p.max >= 1 && p.max <= 24 ? p.max : null;
                    plans.push({ from: p.from, kind: 'needed', gap, max });
                } else if (p.kind === 'times') {
                    const times = cleanTimes(Array.isArray(p.times) ? p.times : []);
                    const days = [...new Set((Array.isArray(p.days) ? p.days : []).filter(d => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
                    if (!times.length || !days.length) continue;
                    plans.push({ from: p.from, kind: 'times', times, days });
                }
            }
            if (!plans.length) continue;
            plans.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
            const med = { id: m.id, name, who: typeof m.who === 'string' ? m.who.replace(/\s+/g, ' ').trim().slice(0, MAX_WHO) : '', start: m.start, end: isDay(m.end) && m.end >= m.start ? m.end : null, plans,
                created: Number.isFinite(m.created) ? m.created : 0, perDose: Number.isInteger(m.perDose) && m.perDose > 0 && m.perDose <= 5000 ? m.perDose : 100, pills: null };
            if (m.pills && Number.isInteger(m.pills.left) && m.pills.left >= 0 && m.pills.left <= 999900 && Number.isFinite(m.pills.at)) med.pills = { left: m.pills.left, at: m.pills.at };
            ids.add(m.id); out.meds.push(med);
        }
        const cut = (now || Date.now()) - KEEP_DAYS * DAY, lids = new Set();
        for (const l of Array.isArray(raw.logs) ? raw.logs : []) {
            if (!l || typeof l !== 'object' || !ids.has(l.med) || typeof l.id !== 'string' || lids.has(l.id) || !Number.isFinite(l.t) || l.t < cut) continue;
            const slot = typeof l.slot === 'string' && isDay(l.slot.slice(0, 10)) && isTime(l.slot.slice(11)) && l.slot.length === 16 ? l.slot : null;
            const pills = Number.isInteger(l.pills) && l.pills >= 0 && l.pills <= 5000 ? l.pills : 0;
            lids.add(l.id);
            out.logs.push({ id: l.id, med: l.med, t: l.t, c: Number.isFinite(l.c) ? l.c : l.t, slot, skip: l.skip === true && !!slot, pills });
        }
        // one entry per dose slot
        const seen = new Set();
        out.logs.sort((a, b) => a.c - b.c);
        out.logs = out.logs.filter(l => { if (!l.slot) return true; const k = l.med + '|' + l.slot; if (seen.has(k)) return false; seen.add(k); return true; }).slice(-MAX_LOGS);
        out.logs.sort((a, b) => a.t - b.t);
        return out;
    }

    root.MedCore = { MIN, HOUR, DAY, MAX_MEDS, MAX_TIMES, MAX_NAME, MAX_WHO, CARRY, DAY_NAMES, dayKey, isDay, isTime, addDays, weekday, slotAt, dayStart, dur, hoursText,
        parseHours, parsePills, pillsText, cleanTimes, planFor, current, slotsForDay, minGap, lastTaken, neededStatus, checkDose, pillsLeft, todayView, history,
        historyText, summaryLine, scheduleText, daysText, remapToday, ics, clean };
})(typeof window !== 'undefined' ? window : globalThis);
if (typeof module === 'object' && module.exports) module.exports = globalThis.MedCore;
