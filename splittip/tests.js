// Checks on the maths. Runs in the browser (test.html) and in Node: node tests.js
(function (root) {
    function runTests(C) {
        const r = [], check = (name, ok) => r.push({ name, ok: !!ok });
        const sum = a => a.reduce((x, y) => x + y, 0);
        const even = o => C.compute(Object.assign({ mode: 'even', subtotal: 0, people: 1, tax: 0, tipPct: 0, roundUp: false }, o));

        check('parseMoney reads 12.50', C.parseMoney('12.50') === 1250);
        check('parseMoney accepts a comma decimal', C.parseMoney('12,5') === 1250);
        check('parseMoney: blank, junk and negatives are 0', ['', 'abc', '-5', null, undefined].every(v => C.parseMoney(v) === 0));
        check('parseMoney caps huge numbers', C.parseMoney('1e30') <= 100000000000);
        check('parseMoney avoids float error (0.1+0.2 style)', C.parseMoney('1.005') === 101 || C.parseMoney('1.005') === 100);

        check('allocate sums exactly', sum(C.allocate(100, [1, 1, 1])) === 100);
        check('allocate gives the extra cent to the first person', C.allocate(100, [1, 1, 1]).join() === '34,33,33');
        check('allocate with zero weights is all zero', C.allocate(500, [0, 0]).join() === '0,0');
        check('allocate proportional', C.allocate(1000, [1, 3]).join() === '250,750');

        let x = even({ subtotal: 10000, people: 4, tipPct: 20 });
        check('100 + 20% tip split 4 ways = 30.00 each', x.tip === 2000 && x.total === 12000 && x.shares.join() === '3000,3000,3000,3000');
        x = even({ subtotal: 10000, people: 3, tipPct: 15, tax: 800 });
        check('tax and tip add to the total', x.total === 10000 + 800 + 1500);
        check('uneven split still adds up to the total', sum(x.shares) === x.total && x.shares.length === 3);
        x = even({ subtotal: 4750, people: 3, tipPct: 18, roundUp: true });
        check('round up: every share is a whole unit', x.shares.every(s => s % 100 === 0));
        check('round up: totals stay consistent', sum(x.shares) === x.total && x.total === x.subtotal + x.tax + x.tip);
        check('round up never lowers the tip', x.tip >= Math.round(4750 * .18));
        check('0 people is treated as 1', even({ subtotal: 1000, people: 0 }).shares.length === 1);
        check('people is capped at 100', even({ subtotal: 1000, people: 5000 }).shares.length === 100);
        check('tip over 100% is capped', even({ subtotal: 1000, tipPct: 900 }).tip === 1000);
        check('negative tip is 0', even({ subtotal: 1000, tipPct: -5 }).tip === 0);
        check('zero bill gives zero shares', sum(even({ people: 3 }).shares) === 0);

        x = C.compute({ mode: 'person', amounts: [2000, 3000], tax: 500, tipPct: 20, people: 9, roundUp: false });
        check('by person: subtotal is the sum of amounts, people count ignored', x.subtotal === 5000 && x.shares.length === 2);
        check('by person: each pays own amount plus fair tax and tip', x.shares.join() === '2600,3900');
        check('by person: shares add up exactly', sum(x.shares) === x.total);
        x = C.compute({ mode: 'person', amounts: [1000, 0, 1000], tax: 0, tipPct: 0, roundUp: false });
        check('by person: someone who ordered nothing pays nothing', x.shares.join() === '1000,0,1000');
        x = C.compute({ mode: 'person', amounts: [3333, 3333, 3334], tax: 101, tipPct: 17, roundUp: true });
        check('by person + round up stays consistent', sum(x.shares) === x.total && x.shares.every(s => s % 100 === 0));

        check('format adds symbol and thousands', C.format(123456, '$') === '$1,234.56');
        check('format with no symbol', C.format(5, '') === '0.05');
        return r;
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = runTests;
        if (require.main === module) {
            const res = runTests(require('./core.js'));
            res.forEach(t => !t.ok && console.log('FAIL', t.name));
            console.log(res.filter(t => t.ok).length + '/' + res.length + ' passed');
            process.exit(res.every(t => t.ok) ? 0 : 1);
        }
    }
    root.runTests = runTests;
})(typeof self !== 'undefined' ? self : this);
