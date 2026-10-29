// Commute Pass or Pay Per Ride Tracker: the logic, with no page code. Money is whole cents (integers) so totals are exact.
(function (root) {
    'use strict';
    const MAX_FARES = 10, MAX_PASSES = 10, MAX_BOUGHT = 300, MAX_RIDES = 5000, MAX_N = 50, MAX_DAYS = 400, MAX_CARD = 200;
    const MAX_MONEY = 9999999999;   // 99,999,999.99
    const CURRENCIES = ['', '$', '€', '£', '₹', 'Rs', 'PKR', 'AED', 'SAR', '৳', '₦', 'R', 'KSh', 'RM', 'A$', 'C$', '¥', '₩', 'TL', 'zł'];
    const KINDS = ['days', 'month', 'rides'];
    const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    // ---------- dates (calendar days only, so time zones never shift a day) ----------
    const pad = n => String(n).padStart(2, '0');
    const iso = (y, m, d) => y + '-' + pad(m) + '-' + pad(d);
    function parseDate(s) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
        if (!m) return null;
        const y = +m[1], mo = +m[2], d = +m[3];
        if (y < 2000 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > daysIn(y, mo)) return null;
        return { y, m: mo, d };
    }
    const isDate = s => !!parseDate(s);
    function daysIn(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
    function toUtc(s) { const p = parseDate(s); return Date.UTC(p.y, p.m - 1, p.d); }
    function fromUtc(t) { const d = new Date(t); return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()); }
    const addDays = (s, n) => fromUtc(toUtc(s) + n * 86400000);
    const diff = (a, b) => Math.round((toUtc(b) - toUtc(a)) / 86400000);   // b - a in days
    const weekday = s => new Date(toUtc(s)).getUTCDay();
    function todayIso(now) { const d = now || new Date(); return iso(d.getFullYear(), d.getMonth() + 1, d.getDate()); }
    const ym = s => s.slice(0, 7);
    function monthStart(s) { return s.slice(0, 8) + '01'; }
    function monthEnd(s) { const p = parseDate(s); return iso(p.y, p.m, daysIn(p.y, p.m)); }
    function addMonths(ymStr, n) { let y = +ymStr.slice(0, 4), m = +ymStr.slice(5, 7) + n; while (m > 12) { m -= 12; y++; } while (m < 1) { m += 12; y--; } return y + '-' + pad(m); }
    function monthName(ymStr, withYear) { const y = +ymStr.slice(0, 4), m = +ymStr.slice(5, 7); return MONTHS[m - 1] + (withYear ? ' ' + y : ''); }
    function shortDate(s, today) { const p = parseDate(s); if (!p) return ''; return WD[weekday(s)] + ' ' + p.d + ' ' + MON[p.m - 1] + (today && today.slice(0, 4) !== s.slice(0, 4) ? ' ' + p.y : ''); }
    function dayMonth(s, today) { const p = parseDate(s); return p.d + ' ' + MON[p.m - 1] + (today && today.slice(0, 4) !== s.slice(0, 4) ? ' ' + p.y : ''); }

    // ---------- numbers and money ----------
    const plural = (n, one, many) => n + ' ' + (n === 1 ? one : (many || one + 's'));
    function parseMoney(str) {
        const t = String(str == null ? '' : str).trim().replace(/[\s, ']/g, '');
        if (t === '') return { empty: true };
        if (/^-/.test(t)) return { error: 'Use a number that is 0 or more.' };
        const m = /^(\d*)(?:\.(\d*))?$/.exec(t);
        if (!m || (m[1] === '' && !m[2])) return { error: 'Type a number, for example 80 or 2.50.' };
        if (m[2] && m[2].length > 2) return { error: 'Use at most 2 decimals, for example 2.75.' };
        const v = Number(m[1] || '0') * 100 + Number(((m[2] || '') + '00').slice(0, 2));
        if (!Number.isSafeInteger(v) || v > MAX_MONEY) return { error: 'That is too large. The most is 99,999,999.99.' };
        return { value: v };
    }
    function parseCount(str, min, max) {
        const t = String(str == null ? '' : str).trim();
        if (t === '') return { empty: true };
        if (!/^\d+$/.test(t)) return { error: 'Use a whole number from ' + min + ' to ' + max + '.' };
        const v = Number(t);
        if (v < min || v > max) return { error: 'Use a whole number from ' + min + ' to ' + max + '.' };
        return { value: v };
    }
    function group(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
    function money(c, cur) {
        const neg = c < 0, a = Math.abs(c), whole = Math.floor(a / 100), cents = a % 100;
        const num = group(whole) + (cents ? '.' + pad(cents) : '');
        const sym = cur || '';
        const s = !sym ? num : (/[A-Za-z]$/.test(sym) ? sym + ' ' + num : sym + num);
        return (neg ? '-' : '') + s;
    }
    const plainMoney = c => (c / 100).toFixed(2);

    // ---------- state ----------
    let seq = 0;
    const uid = p => (p || 'x') + Date.now().toString(36) + (seq++).toString(36) + Math.floor(Math.random() * 1e4).toString(36);
    function emptyState() {
        return { v: 1, cur: '', fares: [{ id: 'f1', name: 'One ride', price: null }],
                 passes: [{ id: 'p1', name: 'Monthly pass', price: null, kind: 'month', days: 30, rides: 10, covers: null }],
                 bought: [], rides: [], pace: { wd: [1, 2, 3, 4, 5], perDay: 2, fare: 'f1', off: 0 } };
    }
    const cleanName = (s, fb) => { const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, 40); return t || fb; };
    const okMoney = v => Number.isSafeInteger(v) && v >= 0 && v <= MAX_MONEY;
    const okInt = (v, a, b) => Number.isInteger(v) && v >= a && v <= b;
    function validate(s) {
        if (!s || typeof s !== 'object' || !Array.isArray(s.fares) || !Array.isArray(s.passes)) return null;
        const out = emptyState();
        out.cur = CURRENCIES.includes(s.cur) ? s.cur : '';
        const ids = new Set();
        out.fares = s.fares.slice(0, MAX_FARES).filter(f => f && typeof f.id === 'string' && f.id && !ids.has(f.id) && ids.add(f.id))
            .map(f => ({ id: f.id.slice(0, 40), name: cleanName(f.name, 'Ride'), price: okMoney(f.price) ? f.price : null }));
        if (!out.fares.length) return null;
        const fareIds = new Set(out.fares.map(f => f.id)), pids = new Set();
        const passOf = p => ({ id: p.id.slice(0, 40), name: cleanName(p.name, 'Pass'), price: okMoney(p.price) ? p.price : null,
            kind: KINDS.includes(p.kind) ? p.kind : 'month', days: okInt(p.days, 1, MAX_DAYS) ? p.days : 30, rides: okInt(p.rides, 1, MAX_CARD) ? p.rides : 10,
            covers: Array.isArray(p.covers) ? p.covers.filter(id => fareIds.has(id)) : null });
        out.passes = s.passes.slice(0, MAX_PASSES).filter(p => p && typeof p.id === 'string' && p.id && !pids.has(p.id) && pids.add(p.id)).map(passOf);
        out.bought = (Array.isArray(s.bought) ? s.bought : []).slice(0, MAX_BOUGHT)
            .filter(b => b && typeof b.id === 'string' && b.id && isDate(b.start) && okMoney(b.price))
            .map(b => Object.assign(passOf(Object.assign({}, b, { id: b.passId || 'gone' })), { id: b.id.slice(0, 40), passId: String(b.passId || '').slice(0, 40), start: b.start, price: b.price }));
        out.rides = (Array.isArray(s.rides) ? s.rides : []).slice(0, MAX_RIDES)
            .filter(r => r && typeof r.id === 'string' && r.id && isDate(r.date) && okInt(r.n, 1, MAX_N) && okMoney(r.price))
            .map(r => ({ id: r.id.slice(0, 40), date: r.date, fareId: String(r.fareId || '').slice(0, 40), fareName: cleanName(r.fareName, 'Ride'), price: r.price, n: r.n }));
        const p = s.pace || {};
        out.pace = { wd: Array.isArray(p.wd) ? [...new Set(p.wd.filter(d => okInt(d, 0, 6)))].sort() : [1, 2, 3, 4, 5],
                     perDay: okInt(p.perDay, 1, 20) ? p.perDay : 2, fare: fareIds.has(p.fare) ? p.fare : out.fares[0].id, off: okInt(p.off, 0, 31) ? p.off : 0 };
        return out;
    }

    // ---------- passes ----------
    const covers = (pass, fareId) => !pass.covers || pass.covers.includes(fareId);
    function passWindow(pass, start) {
        if (pass.kind === 'days') return { from: start, to: addDays(start, pass.days - 1) };
        if (pass.kind === 'month') return { from: start, to: monthEnd(start) };
        return { from: start, to: null };
    }
    function passKindText(p) {
        if (p.kind === 'days') return p.days === 7 ? '7 days from the day you start' : plural(p.days, 'day') + ' from the day you start';
        if (p.kind === 'month') return 'a calendar month (1st to last day)';
        return plural(p.rides, 'ride') + ' on a card';
    }
    function ridesOf(state) {           // every single ride, oldest first
        const units = [];
        state.rides.slice().sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0)
            .forEach(r => { for (let i = 0; i < r.n; i++) units.push({ date: r.date, fareId: r.fareId, price: r.price, entry: r.id }); });
        return units;
    }
    // Which logged rides each bought pass covered. Passes bought first use rides first.
    function coverage(state) {
        const units = ridesOf(state), byEntry = {};
        const bought = state.bought.slice().sort((a, b) => a.start < b.start ? -1 : a.start > b.start ? 1 : 0).map(b => {
            const w = passWindow(b, b.start), info = { b, from: w.from, to: w.to, used: 0, worth: 0, last: null };
            const live = state.passes.find(p => p.id === b.passId), rule = live ? { covers: live.covers } : b;   // "Covers these rides" follows the pass on offer while it exists
            units.forEach(u => {
                if (u.by || u.date < w.from || (w.to && u.date > w.to) || !covers(rule, u.fareId)) return;
                if (b.kind === 'rides' && info.used >= b.rides) return;
                u.by = b.id; info.used++; info.worth += u.price; info.last = u.date;
                const e = byEntry[u.entry] || (byEntry[u.entry] = { n: 0, names: [] }); e.n++; if (!e.names.includes(b.name)) e.names.push(b.name);
            });
            return info;
        });
        return { units, bought, byEntry };
    }

    // The cheapest cost of the given travel days with one kind of pass (bought as often as it helps) or paying per ride.
    // days: [{ date, rides: [{ fareId, price, n }] }] sorted by date.
    // Returns the best way ({ cost, count, paid, left }) and "forced": the cheapest way that buys at least one pass.
    function bestWith(pass, days) {
        if (pass.price == null) return null;
        const P = pass.price;
        const perRide = days.reduce((t, d) => t + d.rides.reduce((s, r) => s + r.price * r.n, 0), 0);
        const split = days.map(d => { let c = 0, u = 0; d.rides.forEach(r => { if (covers(pass, r.fareId)) c += r.price * r.n; else u += r.price * r.n; }); return { date: d.date, c, u }; });
        const uncoveredAll = split.reduce((t, d) => t + d.u, 0);
        const none = { cost: perRide, count: 0, paid: perRide, left: 0 };
        if (pass.kind === 'month') {
            // one pass per calendar month, bought only for the months where it is cheaper
            const months = [...new Set(split.map(d => ym(d.date)))];
            const best = { cost: 0, count: 0, paid: 0, left: 0 };
            let pick = null;   // the month where one pass costs the least extra
            months.forEach(m => { const ds = split.filter(d => ym(d.date) === m), c = ds.reduce((t, d) => t + d.c, 0), u = ds.reduce((t, d) => t + d.u, 0);
                if (P < c) { best.cost += P + u; best.count++; best.paid += u; } else { best.cost += c + u; best.paid += c + u; }
                if (!pick || P - c < pick.extra) pick = { extra: P - c, c }; });
            const forced = best.count ? best : pick ? { cost: perRide + pick.extra, count: 1, paid: perRide - pick.c, left: 0 } : { cost: P, count: 1, paid: 0, left: 0 };
            return { perRide, best, forced };
        }
        if (pass.kind === 'days') {
            const n = split.length, INF = Infinity;
            const f = new Array(n + 1).fill(0), g = new Array(n + 1).fill(INF), fTake = [], gTake = [], jump = [];
            g[n] = INF;
            for (let i = n - 1; i >= 0; i--) {
                const end = addDays(split[i].date, pass.days - 1);
                let j = i, unc = 0; while (j < n && split[j].date <= end) { unc += split[j].u; j++; }
                jump[i] = j;
                const pay = split[i].c + split[i].u, b = P + unc + f[j];
                if (b < pay + f[i + 1]) { f[i] = b; fTake[i] = 1; } else { f[i] = pay + f[i + 1]; fTake[i] = 0; }
                if (pay + g[i + 1] < b) { g[i] = pay + g[i + 1]; gTake[i] = 0; } else { g[i] = b; gTake[i] = 1; }
            }
            const walk = forced => {
                let count = 0, paid = 0, i = 0, mode = forced ? 'g' : 'f';
                while (i < n) {
                    const take = mode === 'g' ? gTake[i] : fTake[i];
                    if (take) { count++; for (let k = i; k < jump[i]; k++) paid += split[k].u; i = jump[i]; mode = 'f'; }
                    else { paid += split[i].c + split[i].u; i++; }
                }
                return { count, paid };
            };
            const bw = walk(false), best = { cost: f[0], count: bw.count, paid: bw.paid, left: 0 };
            let forced;
            if (n === 0) forced = { cost: P, count: 1, paid: 0, left: 0 };
            else { const fw = walk(true); forced = { cost: g[0], count: fw.count, paid: fw.paid, left: 0 }; }
            return { perRide, best, forced };
        }
        // ride card: unused rides stay on the card for later, so each ride on it costs price / rides.
        // A ride goes on the card only when its fare is dearer than that.
        const cov = []; days.forEach(d => d.rides.forEach(r => { if (covers(pass, r.fareId)) for (let k = 0; k < r.n; k++) cov.push(r.price); }));
        const card = (list) => { const on = list.length, rest = perRide - list.reduce((t, x) => t + x, 0), count = Math.ceil(on / pass.rides);
            return { cost: Math.round(on * P / pass.rides) + rest, count, paid: rest, left: count * pass.rides - on, rides: on }; };
        const dear = cov.filter(x => x * pass.rides > P);
        const best = dear.length ? card(dear) : none;
        const forced = best.count ? best : cov.length ? card(cov) : Object.assign({}, none, { na: true });
        return { perRide, best, forced };
    }
    function daysFromUnits(units) {   // logged rides grouped by day
        const map = new Map();
        units.forEach(u => { let d = map.get(u.date); if (!d) { d = { date: u.date, rides: [] }; map.set(u.date, d); }
            const r = d.rides.find(x => x.fareId === u.fareId && x.price === u.price); if (r) r.n++; else d.rides.push({ fareId: u.fareId, price: u.price, n: 1 }); });
        return [...map.values()].sort((a, b) => a.date < b.date ? -1 : 1);
    }
    // Every pass compared with paying per ride. best = the cheapest pass that saves money (null if none does).
    function compare(state, days) {
        const perRide = days.reduce((t, d) => t + d.rides.reduce((s, r) => s + r.price * r.n, 0), 0);
        const options = state.passes.filter(p => p.price != null).map(p => { const r = bestWith(p, days); return Object.assign({ pass: p }, r.best.count ? r.best : r.forced, { helps: r.best.count > 0 && r.best.cost < perRide }); });
        let best = null;
        options.forEach(o => { if (o.helps && (!best || o.cost < best.cost)) best = o; });
        let closest = null;
        options.forEach(o => { if (!o.helps && !o.na && (!closest || o.cost < closest.cost)) closest = o; });
        return { perRide, options, best, closest };
    }
    function cardRate(p, cur) { const exact = (p.price % p.rides) === 0; return (exact ? '' : 'about ') + money(Math.round(p.price / p.rides), cur); }
    function optionText(o, perRide, cur) {
        const p = o.pass;
        if (o.na) return p.name + ': none of these rides can go on it';
        let t;
        if (p.kind === 'rides') {
            t = p.name + ': ' + plural(o.rides, 'ride') + ' on it at ' + cardRate(p, cur) + ' a ride' + (o.paid ? ' + ' + money(o.paid, cur) + ' paid per ride' : '') + ' = ' + money(o.cost, cur);
            const d = perRide - o.cost;
            t += d > 0 ? ', saves ' + money(d, cur) : d < 0 ? ', ' + money(-d, cur) + ' more' : ', the same';
            return t + ' (' + plural(o.count, 'card') + (o.left ? ', ' + plural(o.left, 'ride') + ' left for later' : '') + ')';
        }
        t = p.name + ': ' + plural(o.count, 'pass', 'passes') + (o.paid ? ' + ' + money(o.paid, cur) + ' paid per ride' : '') + ' = ' + money(o.cost, cur);
        const d = perRide - o.cost;
        return t + (d > 0 ? ', saves ' + money(d, cur) : d < 0 ? ', ' + money(-d, cur) + ' more' : ', the same');
    }

    // ---------- a month looking back ----------
    function monthReport(state, ymStr, today) {
        const cov = coverage(state), from = ymStr + '-01', to = monthEnd(from);
        const units = cov.units.filter(u => u.date >= from && u.date <= to);
        const rides = units.length, perRide = units.reduce((t, u) => t + u.price, 0);
        const cmp = compare(state, daysFromUnits(units));
        const boughtHere = state.bought.filter(b => b.start >= from && b.start <= to);
        const passSpend = boughtHere.reduce((t, b) => t + b.price, 0);
        const notCovered = units.filter(u => !u.by).reduce((t, u) => t + u.price, 0);
        const anyBought = cov.bought.some(i => i.from <= to && (i.to ? i.to >= from : true));
        const travelDays = new Set(units.map(u => u.date)).size;
        return { ym: ymStr, from, to, rides, travelDays, perRide, cmp, current: today >= from && today <= to, future: today < from,
                 spent: passSpend + notCovered, passSpend, notCovered, boughtHere, anyBought };
    }
    function monthHeadline(rep, cur) {
        const name = monthName(rep.ym);
        if (!rep.rides) return rep.future ? 'No rides logged for ' + name : 'No rides logged in ' + name + (rep.current ? ' yet' : '');
        return (rep.current ? name + ' so far: ' : name + ': ') + plural(rep.rides, 'ride') + ', ' + money(rep.perRide, cur) + ' paying per ride';
    }
    const the = p => (p.kind === 'rides' ? 'buying the ' : 'the ') + p.name;
    function monthVerdict(rep, cur) {
        const c = rep.cmp;
        if (!rep.rides || !c.options.length) return null;
        const would = rep.current ? 'would save' : 'would have saved';
        if (c.best) return { good: true, text: cap(the(c.best.pass)) + ' ' + would + ' ' + money(c.perRide - c.best.cost, cur) + (c.best.pass.kind === 'rides' ? '' : '') };
        if (!c.closest) return { good: false, text: 'None of your passes covers these rides' };
        const more = c.closest.cost - c.perRide;
        if (more === 0) return { good: false, text: 'Paying per ride and ' + the(c.closest.pass) + ' cost the same' };
        return { good: false, text: 'Paying per ride was cheapest: ' + the(c.closest.pass) + ' would have cost ' + money(more, cur) + ' more' };
    }
    const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

    // ---------- your passes ----------
    function boughtStatus(state, today, cur) {
        const cov = coverage(state);
        return cov.bought.map(i => {
            const b = i.b, saved = i.worth - b.price;
            let state2, lines = [];
            if (b.kind === 'rides') {
                const left = b.rides - i.used;
                state2 = left === 0 ? 'done' : i.from > today ? 'future' : 'active';
                lines.push(i.used + ' of ' + b.rides + ' rides used' + (left ? ', ' + plural(left, 'ride') + ' left' : ''));
                if (left === 0) lines.push(saved >= 0 ? 'Worth it: the ' + b.rides + ' rides would have cost ' + money(i.worth, cur) + ' paying per ride, so it saved ' + money(saved, cur) : 'Not worth it: the ' + b.rides + ' rides would have cost ' + money(i.worth, cur) + ' paying per ride, ' + money(-saved, cur) + ' less than the card');
                else lines.push('So far the rides on it would have cost ' + money(i.worth, cur) + ' paying per ride' + (saved >= 0 ? ', already ' + money(saved, cur) + ' saved' : ''));
            } else {
                const range = dayMonth(i.from, today) + ' to ' + dayMonth(i.to, today);
                if (i.from > today) { state2 = 'future'; lines.push('Starts ' + shortDate(i.from, today) + ', ends ' + shortDate(i.to, today)); }
                else if (i.to < today) {
                    state2 = 'done';
                    lines.push(range + ': ' + plural(i.used, 'ride') + ' on the pass');
                    lines.push(saved > 0 ? 'Worth it: paying per ride would have cost ' + money(i.worth, cur) + ', so it saved ' + money(saved, cur)
                        : saved === 0 ? 'It cost the same as paying per ride (' + money(i.worth, cur) + ')'
                        : 'Not worth it: paying per ride would have cost ' + money(i.worth, cur) + ', ' + money(-saved, cur) + ' less than the pass');
                } else {
                    state2 = 'active';
                    const daysLeft = diff(today, i.to) + 1;
                    lines.push(range + ' (' + (daysLeft === 1 ? 'last day today' : plural(daysLeft, 'day') + ' left, today included') + '): ' + plural(i.used, 'ride') + ' so far, worth ' + money(i.worth, cur) + ' paying per ride');
                    if (saved >= 0) lines.push('Already paid for itself: ' + money(saved, cur) + ' saved so far');
                    else {
                        const fare = state.fares.find(f => f.id === state.pace.fare);
                        let t = money(-saved, cur) + ' more in rides to pay for itself';
                        const live = state.passes.find(p => p.id === b.passId);
                        if (fare && fare.price > 0 && covers(live || b, fare.id)) t += ': about ' + plural(Math.ceil(-saved / fare.price), 'more ride') + ' at ' + money(fare.price, cur) + ' by ' + shortDate(i.to, today);
                        lines.push(t);
                    }
                }
            }
            return { b, state: state2, used: i.used, worth: i.worth, saved, lines };
        });
    }

    // ---------- looking ahead ----------
    function paceDays(state, from, to, opts) {     // the days you usually travel between two dates
        const out = []; if (!state.pace.wd.length) return out;
        for (let d = from; d <= to; d = addDays(d, 1)) if (state.pace.wd.includes(weekday(d))) out.push(d);
        return out;
    }
    function usualFare(state) { return state.fares.find(f => f.id === state.pace.fare) || state.fares[0]; }
    function nextMonthPlan(state, today) {
        const m = addMonths(ym(today), 1), from = m + '-01', to = monthEnd(from), fare = usualFare(state);
        let days = paceDays(state, from, to);
        const off = Math.min(state.pace.off, days.length);
        days = days.slice(0, days.length - off);
        const rides = days.length * state.pace.perDay;
        if (fare.price == null) return { ym: m, fare, noFare: true, days: days.length, rides, off };
        const travel = days.map(d => ({ date: d, rides: [{ fareId: fare.id, price: fare.price, n: state.pace.perDay }] }));
        return Object.assign({ ym: m, fare, days: days.length, rides, off }, compare(state, travel));
    }
    function buyTodayLines(state, today, cur) {
        const fare = usualFare(state), r = state.pace.perDay;
        const loggedToday = state.rides.filter(x => x.date === today).reduce((t, x) => t + x.n, 0);
        return state.passes.filter(p => p.price != null).map(p => {
            const out = { pass: p };
            if (fare.price == null) { out.text = 'Type the price of ' + fare.name + ' first.'; return out; }
            if (!covers(p, fare.id)) { out.text = 'Does not cover your usual ride (' + fare.name + ').'; return out; }
            if (fare.price === 0) { out.verdict = 'no'; out.text = 'Your usual ride is free, so the pass never pays for itself.'; return out; }
            const even = Math.ceil(p.price / fare.price);
            if (p.kind === 'rides') {
                const full = p.rides * fare.price, save = full - p.price;
                out.verdict = save > 0 ? 'yes' : save === 0 ? 'same' : 'no';
                out.text = save > 0 ? 'Worth it if you use all ' + p.rides + ' rides: they would cost ' + money(full, cur) + ' paying per ride, so it saves ' + money(save, cur) + '. It pays for itself at the ' + ordinal(even) + ' ride.'
                    : save === 0 ? 'The same as paying per ride: ' + p.rides + ' × ' + money(fare.price, cur) + ' = ' + money(full, cur) + '.'
                    : 'Not worth it: ' + p.rides + ' rides paying per ride cost ' + money(full, cur) + ', ' + money(-save, cur) + ' less than the card.';
                return out;
            }
            const w = passWindow(p, today), days = paceDays(state, w.from, w.to);
            let rides = 0, evenDay = null;
            days.forEach(d => { rides += d === today ? Math.max(0, r - loggedToday) : r; if (!evenDay && rides >= even) evenDay = d; });
            const worth = rides * fare.price, save = worth - p.price;
            out.verdict = save > 0 ? 'yes' : save === 0 ? 'same' : 'no';
            out.window = w; out.rides = rides; out.even = even; out.evenDay = evenDay;
            const span = (w.from === w.to ? 'today only' : 'today to ' + shortDate(w.to, today));
            if (!rides) { out.verdict = 'no'; out.text = 'Bought today (' + span + '): no more travel days before it ends at your usual pace, so it would not pay for itself.'; return out; }
            const start = 'Bought today (' + span + '): about ' + plural(rides, 'ride') + ' at your usual pace, ' + money(worth, cur) + ' paying per ride. ';
            out.text = start + (save > 0 ? 'Worth it: saves about ' + money(save, cur) + '. It pays for itself at ' + plural(even, 'ride') + ', around ' + shortDate(evenDay, today) + '.'
                : save === 0 ? 'About the same as paying per ride.'
                : 'Not worth it: about ' + money(-save, cur) + ' more than paying per ride. You would need ' + plural(even, 'ride') + ' to make it pay.');
            return out;
        });
    }
    const ordinal = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
    function recentPace(state, today) {
        const from = addDays(today, -27);
        const rides = state.rides.filter(r => r.date >= from && r.date <= today).reduce((t, r) => t + r.n, 0);
        const days = new Set(state.rides.filter(r => r.date >= from && r.date <= today).map(r => r.date)).size;
        return { rides, days, perWeek: Math.round(rides / 4 * 10) / 10 };
    }

    // ---------- text for copy, email and CSV ----------
    function summaryText(state, ymStr, today) {
        const cur = state.cur, rep = monthReport(state, ymStr, today), L = [];
        L.push('Commute costs: ' + monthName(ymStr, true));
        L.push(monthHeadline(rep, cur) + '.');
        if (rep.rides) L.push(plural(rep.travelDays, 'day') + ' of travel.');
        const v = monthVerdict(rep, cur); if (v) L.push(v.text + '.');
        rep.cmp.options.forEach(o => L.push('- ' + optionText(o, rep.cmp.perRide, cur)));
        if (rep.anyBought) L.push('Spent: ' + money(rep.spent, cur) + (rep.passSpend ? ' (passes bought this month ' + money(rep.passSpend, cur) + ', rides not on a pass ' + money(rep.notCovered, cur) + ')' : ' (rides not on a pass)') + '.');
        const plan = nextMonthPlan(state, today);
        if (!plan.noFare && ymStr === ym(today) && plan.options.length) {
            L.push('');
            L.push(planHeadline(plan, cur) + '.');
        }
        return L.join('\n');
    }
    function planHeadline(plan, cur) {
        const name = monthName(plan.ym);
        if (!plan.rides) return 'No travel days in ' + name + ' with your usual days';
        if (!plan.options.length) return name + ': about ' + plural(plan.rides, 'ride') + ', ' + money(plan.perRide, cur) + ' paying per ride';
        if (plan.best) return 'Buy the ' + plan.best.pass.name + ' for ' + name + ': saves about ' + money(plan.perRide - plan.best.cost, cur);
        return 'Pay per ride in ' + name + ': no pass would save money';
    }
    function csv(state) {
        const q = s => /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
        const cov = coverage(state);
        const rows = [['Date', 'Ride', 'Rides', 'Price per ride', 'Total', 'On a pass'].join(',')];
        state.rides.slice().sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0).forEach(r => {
            const c = cov.byEntry[r.id];
            rows.push([r.date, q(r.fareName), r.n, plainMoney(r.price), plainMoney(r.price * r.n), q(c ? c.n + ' on ' + c.names.join(' and ') : '')].join(','));
        });
        return rows.join('\n') + '\n';
    }

    const api = { MAX_FARES, MAX_PASSES, MAX_N, MAX_DAYS, MAX_CARD, CURRENCIES, KINDS, WD, parseDate, isDate, addDays, diff, weekday, todayIso, ym, monthEnd, addMonths, monthName,
        shortDate, dayMonth, plural, ordinal, parseMoney, parseCount, money, uid, emptyState, validate, covers, passWindow, passKindText, coverage, bestWith, compare, optionText,
        monthReport, monthHeadline, monthVerdict, boughtStatus, nextMonthPlan, planHeadline, buyTodayLines, recentPace, usualFare, summaryText, csv, cardRate };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CommuteCore = api;
})(typeof window !== 'undefined' ? window : this);
