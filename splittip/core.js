// The maths behind SplitTip, with no page code in it so it can be tested on its own (see tests.js).
// All money is whole cents, so shares always add up to the exact total.
(function (root) {
    const MAX_CENTS = 100000000000;   // 1 billion, far beyond any real bill

    // "12.50" -> 1250. Returns 0 for blank or unusable input, so a half-typed number never breaks the page.
    function parseMoney(s) {
        const n = parseFloat(String(s == null ? '' : s).replace(',', '.'));
        if (!Number.isFinite(n) || n < 0) return 0;
        return Math.min(Math.round(n * 100), MAX_CENTS);
    }

    // Splits total across weights using the largest remainder, so the parts add up to total exactly.
    function allocate(total, weights) {
        const sum = weights.reduce((a, b) => a + b, 0);
        if (!sum) return weights.map(() => 0);
        const raw = weights.map(w => total * w / sum);
        const out = raw.map(Math.floor);
        let left = total - out.reduce((a, b) => a + b, 0);
        raw.map((r, i) => [r - out[i], i]).sort((a, b) => b[0] - a[0] || a[1] - b[1])
            .forEach(([, i]) => { if (left > 0 && weights[i] > 0) { out[i]++; left--; } });
        return out;
    }

    // amounts: one entry per person (cents). Even split = the bill spread over equal "weights" of 1.
    // mode 'even': subtotal = amounts[0], split between `people`. mode 'person': each person pays their own amount plus a fair share of tax and tip.
    function compute({ mode, subtotal, amounts, people, tax, tipPct, roundUp }) {
        const pct = Math.min(Math.max(Number(tipPct) || 0, 0), 100);
        const sub = mode === 'person' ? amounts.reduce((a, b) => a + b, 0) : subtotal;
        const n = mode === 'person' ? amounts.length : Math.min(Math.max(Math.floor(people) || 1, 1), 100);
        const weights = mode === 'person' ? amounts : Array(n).fill(1);
        let tip = Math.round(sub * pct / 100);
        let shares = allocate(sub + tax + tip, weights);
        if (roundUp) {
            shares = shares.map(s => Math.ceil(s / 100) * 100);
            tip = shares.reduce((a, b) => a + b, 0) - sub - tax;   // the extra goes to the tip
        }
        return { subtotal: sub, tax, tip, total: sub + tax + tip, shares, tipPct: sub ? tip / sub * 100 : pct };
    }

    function format(cents, symbol) {
        return (symbol || '') + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    const api = { parseMoney, allocate, compute, format };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.SplitCore = api;
})(typeof self !== 'undefined' ? self : this);
