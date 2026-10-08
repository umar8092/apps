// Work hours maths, no page code. Times are minutes since midnight, money is whole cents.
(function (root) {
    const DAY = 1440;

    function parseTime(v) {
        const m = /^(\d{1,2}):(\d{2})$/.exec(String(v == null ? '' : v).trim());
        if (!m) return null;
        const h = +m[1], mi = +m[2];
        return h > 23 || mi > 59 ? null : h * 60 + mi;
    }

    // Whole minutes, 0 to 720. Blank, junk and negatives are 0.
    function parseBreak(v) {
        const x = Number(String(v == null ? '' : v).trim().replace(',', '.'));
        return x > 0 ? Math.min(Math.round(x), 720) : 0;
    }

    // "12.50" or "12,5" -> cents. Blank, junk and negatives are 0. Capped so the maths stays exact.
    function parseMoney(v) {
        const m = /^(\d*)(?:[.,](\d*))?$/.exec(String(v == null ? '' : v).trim());
        if (!m || (m[1] === '' && !m[2])) return 0;
        const whole = Math.min(parseInt(m[1] || '0', 10), 1000000);
        const f = ((m[2] || '') + '00').slice(0, 3);
        const cents = whole * 100 + Math.floor(parseInt(f, 10) / 10) + (parseInt(f[2], 10) >= 5 ? 1 : 0);
        return Math.min(cents, 100000000);
    }

    // "1.5" -> 150 (hundredths), kept between 1.00 and 10.00
    function parseMult(v) {
        const c = parseMoney(v);
        return c < 100 ? 100 : Math.min(c, 1000);
    }

    // One day. Finish earlier than start means the shift runs past midnight.
    // state: blank (nothing typed), ok, same (start = finish, counted as 0), break (break longer than the shift)
    function shift(day, roundTo) {
        const s = parseTime(day && day.s), e = parseTime(day && day.e);
        if (s === null || e === null) return { state: 'blank', minutes: 0, gross: 0, brk: 0, overnight: false };
        if (s === e) return { state: 'same', minutes: 0, gross: 0, brk: 0, overnight: false };
        const gross = (e - s + DAY) % DAY, overnight = e < s;
        const brk = parseBreak(day.b);
        let net = Math.max(gross - brk, 0);
        const r = roundTo > 0 ? roundTo : 0;
        if (r) net = Math.floor((net + r / 2) / r) * r;
        return { state: brk > gross ? 'break' : 'ok', minutes: net, gross, brk: Math.min(brk, gross), overnight };
    }

    // settings: { thrMin (minutes per week before overtime, 0 = none), rate (cents/hour), mult (hundredths), roundTo }
    function week(days, set) {
        set = set || {};
        const shifts = days.map(d => shift(d, set.roundTo));
        const total = shifts.reduce((a, x) => a + x.minutes, 0);
        const worked = shifts.filter(x => x.minutes > 0).length;
        const thr = set.thrMin > 0 ? set.thrMin : 0;
        const regular = thr ? Math.min(total, thr) : total;
        const overtime = total - regular;
        const rate = set.rate > 0 ? set.rate : 0, mult = set.mult >= 100 ? set.mult : 150;
        let payRegular = 0, payOvertime = 0;
        if (rate) {
            payRegular = Math.floor((2 * regular * rate + 60) / 120);
            payOvertime = Math.floor((2 * overtime * rate * mult + 6000) / 12000);
        }
        return { shifts, total, worked, regular, overtime, rate, mult, payRegular, payOvertime, pay: payRegular + payOvertime };
    }

    const fmtHM = min => { const h = Math.floor(min / 60), m = min % 60; return m ? h + 'h ' + m + 'm' : h + 'h'; };
    const fmtDec = min => (Math.round(min / 60 * 100) / 100).toFixed(2);
    const fmtMoney = c => { const w = Math.floor(c / 100), f = String(c % 100).padStart(2, '0'); return String(w).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + f; };
    const hhmm = min => String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0');

    const api = { parseTime, parseBreak, parseMoney, parseMult, shift, week, fmtHM, fmtDec, fmtMoney, hhmm };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.WorkCore = api;
})(typeof self !== 'undefined' ? self : this);
