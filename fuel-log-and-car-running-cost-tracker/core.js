// Fuel Log and Car Running Cost Tracker: the maths and the words, with no page code, so tests.js can check it in node.
// Money is whole cents. Fuel is stored in thousandths (32.457 L = 32457), distances in tenths (45,320.5 km = 453205),
// each with the unit it was typed in, so changing a car's units later never changes what was saved.
// Fuel use is worked out the "full to full" way: the distance between two full tanks divided by all the fuel put in
// after the first of them, part fills included. A tank with a missed fill-up in between is skipped, never guessed.
(function (root) {
    'use strict';
    const KM = { km: 1, mi: 1.609344 };                       // km in one unit
    const LT = { L: 1, usgal: 3.785411784, ukgal: 4.54609 };  // litres in one unit
    const DIST = { km: { short: 'km', long: 'kilometres' }, mi: { short: 'miles', long: 'miles' } };
    const VOL = { L: { short: 'L', one: 'litre', long: 'litres' }, usgal: { short: 'gal', one: 'gallon', long: 'US gallons' }, ukgal: { short: 'gal', one: 'gallon', long: 'UK gallons' } };
    const ECO = { kmL: 'km/L', L100: 'L/100 km', mpgus: 'mpg (US)', mpguk: 'mpg (UK)', miL: 'miles/L' };
    const CATS = ['Service', 'Repair', 'Tyres', 'Insurance', 'Tax and registration', 'Parking and tolls', 'Car wash', 'Loan or lease payment', 'Other'];
    const SYMBOLS = ['', '$', '€', '£', '₹', 'Rs', '¥', '₩', '₦', '₱', 'R', 'kr', 'CHF', 'AED', 'SAR', 'RM', 'Rp', '৳', '₺', 'R$', 'zł', '₽', '₴', 'KSh', '₵', 'E£', 'A$', 'C$'];
    const MAX_MONEY = 999999999999;   // 9,999,999,999.99
    const MAX_ODO = 99999999;         // 9,999,999.9
    const MAX_TRIP = 999999;          // 99,999.9
    const MAX_VOL = 9999999;          // 9,999.999
    const MAX_PRICE = 9999999999;     // 9,999,999.999 per litre or gallon

    // ---------- typed numbers ----------
    // Reads "45,320" "45.320" "45 320" "32.5" "32,5" "1,00,000" "$40" "Rs 9,100" "32.5 L".
    // o.dec = most decimals allowed, o.max = biggest value (scaled), o.amb = what "1.234" means when it could be either:
    // 'thousands', 'decimal' or 'locale' (the decimal mark of o.localeDec wins).
    function parseDec(text, o) {
        const ex = o.example || '10';
        let s = String(text == null ? '' : text).replace(/[   ']/g, ' ').trim();
        if (!s) return { error: o.empty || 'Type a number, such as ' + ex + '.' };
        s = s.replace(/^(rs\.?|inr|usd|eur|gbp|pkr|aed|sar|[$€£₹¥₩₦₱৳₺₽₴])\s*/i, '')
            .replace(/\s*(rs\.?|[$€£₹¥₩₦₱৳₺₽₴]|litres?|liters?|ltrs?|l|gallons?|gal|kms?|kilometres?|kilometers?|miles?|mi)\.?$/i, '').trim();
        if (/^[-−–]/.test(s)) return { error: o.neg || 'Type the number without a minus sign.' };
        if (/^\+/.test(s)) s = s.slice(1).trim();
        if (!/^[\d.,\s]+$/.test(s) || !/\d/.test(s)) return { error: 'Type a number, such as ' + ex + '.' };
        const bad = { error: 'That number looks mistyped. Type it like ' + ex + '.' };
        let whole, frac = '';
        if (/\s/.test(s)) {
            const parts = s.split(/\s+/), last = parts[parts.length - 1];
            const dm = last.match(/^(\d{3})([.,]\d*)?$/);
            if (!/^\d{1,3}$/.test(parts[0]) || !parts.slice(1, -1).every(p => /^\d{3}$/.test(p)) || !dm) return bad;
            whole = parts.join('').replace(/[.,]\d*$/, ''); frac = dm[2] ? dm[2].slice(1) : '';
        } else {
            const dots = (s.match(/\./g) || []).length, commas = (s.match(/,/g) || []).length;
            let dec = null;
            if (dots && commas) dec = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ',';
            else if (dots + commas === 1) {
                const mark = dots ? '.' : ',', [a, b] = s.split(mark);
                const couldBeThousands = b.length === 3 && /^\d{1,3}$/.test(a) && a !== '0';
                if (!couldBeThousands) dec = mark;
                else if (o.dec < 3 || o.amb === 'thousands') dec = null;
                else if (o.amb === 'decimal') dec = mark;
                else dec = mark === (o.localeDec || '.') ? mark : null;
            }
            let intPart = s, fracPart = '';
            if (dec) { const i = s.lastIndexOf(dec); intPart = s.slice(0, i); fracPart = s.slice(i + 1); }
            const th = dec === '.' ? ',' : dec === ',' ? '.' : (dots ? '.' : ',');
            if (dec && intPart.includes(dec)) return bad;
            if (intPart.includes(th)) {
                const re = new RegExp('^\\d{1,3}(\\' + th + '\\d{3})+$'), ind = new RegExp('^\\d{1,2}(\\' + th + '\\d{2})*\\' + th + '\\d{3}$');
                if (!re.test(intPart) && !ind.test(intPart)) return bad;
            }
            if (!/^\d*$/.test(fracPart)) return bad;
            whole = intPart.split(th).join(''); frac = fracPart;
            if (whole === '' && frac === '') return { error: 'Type a number, such as ' + ex + '.' };
        }
        if (frac.length > o.dec) return { error: o.dec ? 'Use at most ' + o.dec + ' number' + (o.dec > 1 ? 's' : '') + ' after the decimal point.' : 'Type a whole number, such as ' + ex + '.' };
        whole = whole.replace(/^0+(?=\d)/, '') || '0';
        if (whole.length > 13) return { error: o.big || 'That number is too big.' };
        const v = Number(whole) * Math.pow(10, o.dec) + Number((frac + '000').slice(0, o.dec) || 0);
        if (v === 0 && !o.zeroOK) return { error: o.zero || 'Type a number more than 0.' };
        if (v > o.max) return { error: o.big || 'That number is too big.' };
        return { v };
    }
    const parseMoney = t => parseDec(t, { dec: 2, max: MAX_MONEY, example: '9,100 or 45.50', zero: 'Type an amount more than 0.', big: 'That amount is too big.' });
    const parseOdo = t => parseDec(t, { dec: 1, max: MAX_ODO, amb: 'thousands', example: '45320', zeroOK: true, empty: 'Type the odometer reading (the total distance on the dashboard).', big: 'That reading is too big. The most is 9,999,999.9.' });
    const parseTrip = t => parseDec(t, { dec: 1, max: MAX_TRIP, amb: 'thousands', example: '430', zero: 'Type the distance since your last fill-up, more than 0.', empty: 'Type the distance on the trip meter since your last fill-up.', big: 'That is too far for one tank. The most is 99,999.9.' });
    const parseVol = t => parseDec(t, { dec: 3, max: MAX_VOL, amb: 'decimal', example: '32.5', zero: 'Type an amount of fuel more than 0.', big: 'That is too much fuel for one fill-up. The most is 9,999.999.' });
    const parsePrice = (t, localeDec) => parseDec(t, { dec: 3, max: MAX_PRICE, amb: 'locale', localeDec, example: '279.50 or 1.799', zero: 'Type a price more than 0.', big: 'That price is too big.' });

    // Fuel, price per unit and total: any two give the third. Returns { vol, total (cents or null), price (thousandths), worked: 'vol'|'price'|'total'|null } or { error, field }.
    function solveFuel(volText, priceText, totalText, localeDec) {
        const has = t => String(t == null ? '' : t).trim() !== '';
        const hv = has(volText), hp = has(priceText), ht = has(totalText);
        const v = hv ? parseVol(volText) : null, p = hp ? parsePrice(priceText, localeDec) : null, t = ht ? parseMoney(totalText) : null;
        if (v && v.error) return { error: v.error, field: 'vol' };
        if (p && p.error) return { error: p.error, field: 'price' };
        if (t && t.error) return { error: t.error, field: 'total' };
        if (!hv && !hp && !ht) return { error: 'Type how much fuel you put in, or the price and the total paid.', field: 'vol' };
        if (!hv && !(hp && ht)) return { error: hp ? 'Also type the fuel amount or the total paid, so the app can work out the other.' : 'Also type the fuel amount or the price, so the app can work out how much fuel that was.', field: 'vol' };
        if (hv && hp && ht) {
            const want = v.v * p.v / 1e4, diff = Math.abs(want - t.v);
            if (diff > Math.max(100, t.v * 0.01)) return { error: 'These three do not match: fuel × price = ' + (want / 100).toFixed(2) + ', but the total paid is ' + (t.v / 100).toFixed(2) + '. Check them, or clear the price to keep the fuel and total.', field: 'total' };
            return { vol: v.v, total: t.v, price: p.v, worked: null };
        }
        if (hv && hp) return { vol: v.v, total: Math.round(v.v * p.v / 1e4), price: p.v, worked: 'total' };
        if (hv && ht) return { vol: v.v, total: t.v, price: Math.round(t.v * 1e4 / v.v), worked: 'price' };
        if (hv) return { vol: v.v, total: null, price: null, worked: null };
        const vol = Math.round(t.v * 1e4 / p.v);
        if (vol <= 0) return { error: 'That works out at less than 0.001 of fuel. Check the price and the total.', field: 'price' };
        if (vol > MAX_VOL) return { error: 'That works out at more fuel than one fill-up can hold. Check the price and the total.', field: 'price' };
        return { vol, total: t.v, price: p.v, worked: 'vol' };
    }

    // ---------- formatting ----------
    function num(n, minD, maxD, locale) {
        try { return new Intl.NumberFormat(locale || undefined, { minimumFractionDigits: minD, maximumFractionDigits: maxD }).format(n); }
        catch (e) { return Number(n).toFixed(maxD); }
    }
    const withCur = (t, cur) => !cur ? t : (/^[A-Za-z]/.test(cur) || /[A-Za-z]$/.test(cur) ? cur + ' ' + t : cur + t);
    function fmt(cents, cur, locale) { const n = Math.abs(cents); return withCur(num(n / 100, n % 100 ? 2 : 0, 2, locale), cur); }
    // cost per km or per mile: always 2 decimals, 3 when it is tiny
    function fmtRate(units, cur, locale) { return withCur(num(units, units < 0.1 ? 3 : 2, units < 0.1 ? 3 : 2, locale), cur); }
    function fmtPrice(thousandths, cur, locale) { const t = Math.round(thousandths), d = t % 1000 === 0 ? 0 : t % 10 ? 3 : 2; return withCur(num(t / 1000, d, d, locale), cur); }
    const fmtVol = (milli, vu, locale) => num(milli / 1000, 0, 3, locale) + ' ' + VOL[vu].short;
    const fmtDist = (km, du, locale, d) => num(km / KM[du], 0, d == null ? 0 : d, locale) + ' ' + DIST[du].short;
    const fmtOdo = (tenths, du, locale) => num(tenths / 10, 0, 1, locale) + ' ' + DIST[du].short;
    const inputNum = (scaled, dec) => { const s = (scaled / Math.pow(10, dec)).toFixed(dec); return dec ? s.replace(/\.?0+$/, '') : s; };

    // fuel use in the car's chosen way; km and litres in, number out
    function ecoValue(km, L, mode) {
        if (!(km > 0) || !(L > 0)) return null;
        if (mode === 'L100') return L / km * 100;
        if (mode === 'mpgus') return (km / KM.mi) / (L / LT.usgal);
        if (mode === 'mpguk') return (km / KM.mi) / (L / LT.ukgal);
        if (mode === 'miL') return (km / KM.mi) / L;
        return km / L;
    }
    const fmtEco = (km, L, mode, locale) => { const v = ecoValue(km, L, mode); return v == null ? '' : num(v, 1, 1, locale) + ' ' + ECO[mode]; };
    // +4 = 4% better than the average (more distance from the same fuel), whatever unit is shown
    function comparePct(seg, avg) { if (!seg || !avg) return null; return (seg.km / seg.L) / (avg.km / avg.L) * 100 - 100; }
    function compareWords(pct) {
        if (pct == null) return '';
        const r = Math.round(Math.abs(pct));
        if (r < 1) return 'about the same as your average';
        return r + '% ' + (pct > 0 ? 'better' : 'worse') + ' than your average';
    }
    // a result this odd is almost always a typo in the odometer or the fuel
    const unusual = (km, L) => { const k = km / L; return k < 1.5 || k > 80; };

    // ---------- dates ----------
    const pad = n => String(n).padStart(2, '0');
    const dayStr = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    function toDate(s) { const [y, m, d] = s.split('-').map(Number); const t = new Date(y, m - 1, d, 12); t.setFullYear(y); return t; }
    const isDay = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && dayStr(toDate(s)) === s;
    function niceDate(s, today, locale) {
        const opts = { day: 'numeric', month: 'short' };
        if (!today || s.slice(0, 4) !== today.slice(0, 4)) opts.year = 'numeric';
        try { return toDate(s).toLocaleDateString(locale || undefined, opts); } catch (e) { return s; }
    }
    function prevMonth(ym) { let [y, m] = ym.split('-').map(Number); m--; if (!m) { m = 12; y--; } return y + '-' + pad(m); }
    function monthName(ym, locale) { try { return toDate(ym + '-01').toLocaleDateString(locale || undefined, { month: 'long', year: 'numeric' }); } catch (e) { return ym; } }
    const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

    // ---------- one car ----------
    const order = (a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.seq - b.seq;
    const litres = e => e.vol / 1000 * LT[e.vu];

    // position of every fill-up in km along the car's life, in date order (trip meter readings add to the one before)
    function positions(car, skipId) {
        let pos = null;
        return car.entries.filter(e => e.t === 'fill' && e.id !== skipId).sort(order).map(e => {
            if (e.trip != null) pos = (pos == null ? 0 : pos) + e.trip / 10 * KM[e.du];
            else pos = e.odo / 10 * KM[e.du];
            return { e, pos };
        });
    }

    // Where would a new or edited odometer reading sit? Returns '' or an error naming the neighbour.
    function odoProblem(car, entry, locale, today) {
        if (entry.trip != null || entry.odo == null) return '';
        const me = entry.odo / 10 * KM[entry.du];
        const list = positions(car, entry.id);
        let prev = null, next = null;
        list.forEach(x => { if (order(x.e, entry) < 0) prev = x; else if (!next) next = x; });
        const show = x => fmtDist(x.pos, entry.du, locale, 1);
        if (prev && me < prev.pos - 0.05) return 'That is lower than the reading at your fill-up on ' + niceDate(prev.e.date, today, locale) + ' (' + show(prev) + '). Check the number.';
        if (next && me > next.pos + 0.05) return 'That is higher than the reading at your later fill-up on ' + niceDate(next.e.date, today, locale) + ' (' + show(next) + '). Check the number or the date.';
        return '';
    }

    function summary(car, today) {
        const list = positions(car);
        const rows = [], segs = [];
        let lastFull = -1, accL = 0, accCost = 0, costKnown = true, broken = false;
        list.forEach((x, i) => {
            const e = x.e, L = litres(e), row = { e, pos: x.pos, L, since: i ? x.pos - list[i - 1].pos : null, status: '', seg: null };
            if (lastFull >= 0) {
                accL += L;
                if (e.total == null) costKnown = false; else accCost += e.total;
                if (e.missed) broken = true;
            }
            if (!e.full) row.status = lastFull >= 0 ? 'partial' : 'partial-first';
            else {
                if (lastFull < 0) row.status = e.missed && i ? 'missed' : 'first';
                else if (broken) row.status = 'missed';
                else {
                    const km = x.pos - list[lastFull].pos;
                    if (km <= 0) row.status = 'nodist';
                    else {
                        const seg = { km, L: accL, cost: costKnown ? accCost : null, date: e.date, fromDate: list[lastFull].e.date, id: e.id };
                        row.status = 'seg'; row.seg = seg; segs.push(seg);
                    }
                }
                lastFull = i; accL = 0; accCost = 0; costKnown = true; broken = false;
            }
            rows.push(row);
        });
        const sum = (a, f) => a.reduce((t, x) => t + f(x), 0);
        const avg = segs.length ? { km: sum(segs, s => s.km), L: sum(segs, s => s.L) } : null;
        const priced = segs.filter(s => s.cost != null);
        const fuelPerKm = priced.length ? { cents: sum(priced, s => s.cost), km: sum(priced, s => s.km) } : null;
        const costs = car.entries.filter(e => e.t === 'cost').sort(order);
        const span = list.length > 1 ? list[list.length - 1].pos - list[0].pos : 0;
        const fuelAfterFirst = sum(list.slice(1), x => x.e.total || 0), otherAll = sum(costs, e => e.amount);
        const allPerKm = span > 0 ? { cents: fuelAfterFirst + otherAll, km: span, unpriced: list.slice(1).some(x => x.e.total == null) } : null;
        const spent = key => {
            const inP = e => e.date.slice(0, key.length) === key;
            const fuel = sum(car.entries.filter(e => e.t === 'fill' && inP(e)), e => e.total || 0);
            const other = sum(costs.filter(inP), e => e.amount);
            return { fuel, other, total: fuel + other, fills: car.entries.filter(e => e.t === 'fill' && inP(e)).length };
        };
        const month = today.slice(0, 7);
        return {
            rows, segs, avg, last: segs[segs.length - 1] || null, fuelPerKm, allPerKm, span,
            fills: list.length, costs: costs.length, firstDate: list.length ? list[0].e.date : '',
            month: spent(month), lastMonth: spent(prevMonth(month)), year: spent(today.slice(0, 4)), monthKey: month
        };
    }

    // the line under a fill-up in the log
    function rowWords(row, car, locale) {
        if (row.status === 'seg') return { tone: 'good', text: fmtEco(row.seg.km, row.seg.L, car.eco, locale) + ' over ' + fmtDist(row.seg.km, car.du, locale) };
        if (row.status === 'first') return { tone: 'info', text: 'First full tank: fuel use shows from your next full tank' };
        if (row.status === 'partial') return { tone: 'info', text: 'Part fill: counted in the next full tank' };
        if (row.status === 'partial-first') return { tone: 'info', text: 'Part fill before your first full tank: not counted' };
        if (row.status === 'missed') return { tone: 'warn', text: 'A fill-up was missed before this, so this tank is skipped. The next full tank counts again' };
        return { tone: 'warn', text: 'No distance since the last full tank, so no fuel use for this one' };
    }

    // ---------- share ----------
    function summaryText(state, car, today, locale) {
        const s = summary(car, today), cur = state.cur, per = DIST[car.du].short === 'km' ? 'km' : 'mile';
        const lines = ['Fuel log for ' + car.name + ', ' + niceDate(today, '', locale)];
        if (s.last) lines.push('Last full tank: ' + fmtEco(s.last.km, s.last.L, car.eco, locale) + ' over ' + fmtDist(s.last.km, car.du, locale) + ' (to ' + niceDate(s.last.date, today, locale) + ')');
        if (s.avg) lines.push('Average fuel use: ' + fmtEco(s.avg.km, s.avg.L, car.eco, locale) + ' over ' + fmtDist(s.avg.km, car.du, locale));
        if (s.fuelPerKm) lines.push('Fuel cost per ' + per + ': ' + fmtRate(s.fuelPerKm.cents / 100 / (s.fuelPerKm.km / KM[car.du]), cur, locale));
        if (s.allPerKm) lines.push('All costs per ' + per + ': ' + fmtRate(s.allPerKm.cents / 100 / (s.allPerKm.km / KM[car.du]), cur, locale) + ' (fuel and other costs over ' + fmtDist(s.allPerKm.km, car.du, locale) + ')');
        [['This month', s.month], ['Last month', s.lastMonth], ['This year', s.year]].forEach(([n, p]) =>
            lines.push(n + ': ' + fmt(p.total, cur, locale) + ' (fuel ' + fmt(p.fuel, cur, locale) + ', other ' + fmt(p.other, cur, locale) + ')'));
        lines.push('', 'Log, newest first:');
        const byId = {}; s.rows.forEach(r => { byId[r.e.id] = r; });
        car.entries.slice().sort(order).reverse().forEach(e => lines.push('- ' + entryLine(e, byId[e.id], car, cur, today, locale)));
        if (!car.entries.length) lines.push('(nothing logged yet)');
        return lines.join('\n');
    }
    function entryLine(e, row, car, cur, today, locale) {
        const d = niceDate(e.date, today, locale);
        if (e.t === 'cost') return d + ': ' + e.cat + ' ' + fmt(e.amount, cur, locale) + (e.odo != null ? ', odometer ' + fmtOdo(e.odo, e.du, locale) : '') + (e.note ? ' (' + e.note + ')' : '');
        let t = d + ': ' + (e.full ? 'Fill-up' : 'Part fill') + ' ' + fmtVol(e.vol, e.vu, locale);
        if (e.total != null) t += ', ' + fmt(e.total, cur, locale) + ' (' + fmtPrice(Math.round(e.total * 1e4 / e.vol), cur, locale) + ' per ' + VOL[e.vu].one + ')';
        t += e.trip != null ? ', trip ' + fmtOdo(e.trip, e.du, locale) : ', odometer ' + fmtOdo(e.odo, e.du, locale);
        if (row && row.status === 'seg') t += ', ' + fmtEco(row.seg.km, row.seg.L, car.eco, locale);
        return t + (e.note ? ' (' + e.note + ')' : '');
    }
    function csv(car, cur) {
        const q = v => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
        const s = summary(car, '9999-12-31'), byId = {}; s.rows.forEach(r => { byId[r.e.id] = r; });
        const out = [['Car', 'Date', 'Type', 'Odometer', 'Trip meter', 'Distance unit', 'Fuel', 'Fuel unit', 'Full tank', 'Missed fill-up before', 'Total paid', 'Price per unit', 'Fuel use', 'Fuel use unit', 'Cost type', 'Note', 'Currency']];
        car.entries.slice().sort(order).forEach(e => {
            const r = byId[e.id], ecoV = r && r.seg ? ecoValue(r.seg.km, r.seg.L, car.eco) : null;
            if (e.t === 'fill') out.push([car.name, e.date, 'Fill-up', e.odo != null ? inputNum(e.odo, 1) : '', e.trip != null ? inputNum(e.trip, 1) : '', DIST[e.du].short, inputNum(e.vol, 3), VOL[e.vu].long,
                e.full ? 'yes' : 'no', e.missed ? 'yes' : 'no', e.total != null ? (e.total / 100).toFixed(2) : '', e.total != null ? (e.total * 10 / e.vol).toFixed(3) : '', ecoV != null ? ecoV.toFixed(2) : '', ecoV != null ? ECO[car.eco] : '', '', e.note, cur]);
            else out.push([car.name, e.date, 'Other cost', e.odo != null ? inputNum(e.odo, 1) : '', '', e.odo != null ? DIST[e.du].short : '', '', '', '', '', (e.amount / 100).toFixed(2), '', '', '', e.cat, e.note, cur]);
        });
        return out.map(r => r.map(q).join(',')).join('\r\n') + '\r\n';
    }

    // ---------- saved state ----------
    const cleanText = (s, n) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);
    function defaultUnits(lang) {
        const l = String(lang || 'en').toLowerCase(), region = (l.split('-')[1] || '').toUpperCase();
        if (region === 'US' || region === 'LR' || region === 'MM') return { du: 'mi', vu: 'usgal', eco: 'mpgus' };
        if (region === 'GB') return { du: 'mi', vu: 'L', eco: 'mpguk' };
        const l100 = ['DE', 'FR', 'ES', 'IT', 'NL', 'BE', 'AT', 'CH', 'PL', 'SE', 'NO', 'DK', 'FI', 'PT', 'CZ', 'SK', 'HU', 'IE', 'AU', 'NZ', 'CA', 'RO', 'GR', 'HR', 'SI', 'RU', 'UA', 'TR', 'ZA', 'CN', 'IL', 'BG', 'LT', 'LV', 'EE'];
        if (l100.includes(region) || (!region && ['de', 'fr', 'es', 'it', 'nl', 'pl', 'sv', 'nb', 'da', 'fi', 'pt', 'cs', 'ru', 'uk', 'tr'].includes(l))) return { du: 'km', vu: 'L', eco: 'L100' };
        return { du: 'km', vu: 'L', eco: 'kmL' };
    }
    function newCar(id, name, units) { return { id, name: cleanText(name, 40) || 'My car', du: units.du, vu: units.vu, eco: units.eco, read: 'odo', entries: [] }; }
    function emptyState(lang) { return { v: 1, cur: '', carId: 'c1', seq: 0, cars: [newCar('c1', 'My car', defaultUnits(lang))] }; }
    const okId = (x, used) => typeof x === 'string' && /^[\w-]{1,40}$/.test(x) && !used.has(x);
    const isInt = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi;
    // anything saved or restored is checked: bad cars or entries are dropped, never crash the app
    function normalize(raw, lang) {
        if (!raw || typeof raw !== 'object' || !Array.isArray(raw.cars)) return null;
        const s = { v: 1, cur: SYMBOLS.includes(raw.cur) ? raw.cur : '', carId: '', seq: 0, cars: [] };
        const ids = new Set(); let seq = Number.isInteger(raw.seq) && raw.seq >= 0 ? raw.seq : 0, n = 0;
        raw.cars.slice(0, 50).forEach(c => {
            if (!c || typeof c !== 'object') return;
            const d = defaultUnits(lang);
            const id = okId(c.id, ids) ? c.id : 'c' + (++n) + '-' + Math.random().toString(36).slice(2, 7); ids.add(id);
            const car = newCar(id, c.name, { du: KM[c.du] ? c.du : d.du, vu: LT[c.vu] ? c.vu : d.vu, eco: ECO[c.eco] ? c.eco : d.eco });
            car.read = c.read === 'trip' ? 'trip' : 'odo';
            (Array.isArray(c.entries) ? c.entries : []).slice(0, 20000).forEach(e => {
                if (!e || typeof e !== 'object' || !isDay(e.date)) return;
                const du = KM[e.du] ? e.du : car.du;
                const base = { id: okId(e.id, ids) ? e.id : 'e' + (++seq) + Math.random().toString(36).slice(2, 6), date: e.date, seq: isInt(e.seq, 0, 1e12) ? e.seq : ++seq, du, note: cleanText(e.note, 200) };
                ids.add(base.id);
                if (e.t === 'fill') {
                    if (!isInt(e.vol, 1, MAX_VOL) || !LT[e.vu]) return;
                    const f = Object.assign(base, { t: 'fill', vol: e.vol, vu: e.vu, total: isInt(e.total, 1, MAX_MONEY) ? e.total : null, full: e.full !== false, missed: e.missed === true });
                    if (isInt(e.trip, 1, MAX_TRIP)) f.trip = e.trip; else if (isInt(e.odo, 0, MAX_ODO)) f.odo = e.odo; else return;
                    car.entries.push(f);
                } else if (e.t === 'cost') {
                    if (!isInt(e.amount, 1, MAX_MONEY)) return;
                    const c2 = Object.assign(base, { t: 'cost', cat: CATS.includes(e.cat) ? e.cat : 'Other', amount: e.amount, odo: isInt(e.odo, 0, MAX_ODO) ? e.odo : null });
                    car.entries.push(c2);
                } else return;
                seq = Math.max(seq, base.seq);
            });
            s.cars.push(car);
        });
        if (!s.cars.length) return null;
        s.seq = seq;
        s.carId = s.cars.some(c => c.id === raw.carId) ? raw.carId : s.cars[0].id;
        return s;
    }

    const api = { KM, LT, DIST, VOL, ECO, CATS, SYMBOLS, MAX_MONEY, parseDec, parseMoney, parseOdo, parseTrip, parseVol, parsePrice, solveFuel,
        num, fmt, fmtRate, fmtPrice, fmtVol, fmtDist, fmtOdo, inputNum, ecoValue, fmtEco, comparePct, compareWords, unusual,
        dayStr, toDate, isDay, niceDate, prevMonth, monthName, plural, order, litres, positions, odoProblem, summary, rowWords,
        summaryText, entryLine, csv, cleanText, defaultUnits, newCar, emptyState, normalize };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FLC = api;
})(this);
