// Realistic saved state for the screenshots and UI tests: today is Wed 14 Oct 2026.
(function (root) {
    const H = typeof require !== 'undefined' && typeof module !== 'undefined' ? require('./core.js') : root.HabitCore;
    function seed() {
        const start = '2026-08-24', today = '2026-10-14';
        const habits = [
            { id: 'water', name: 'Drink water', color: '#0891b2', versions: [{ from: start, kind: 'count', target: 8, unit: 'glasses', step: 1, sched: { type: 'daily' } }] },
            { id: 'walk', name: 'Walk', color: '#22c55e', versions: [{ from: start, kind: 'count', target: 10000, unit: 'steps', step: 1000, sched: { type: 'daily' } }] },
            { id: 'vit', name: 'Take vitamins', color: '#f59e0b', versions: [{ from: start, kind: 'check', target: 1, unit: '', step: 1, sched: { type: 'daily' } }] },
            { id: 'gym', name: 'Exercise', color: '#f97316', versions: [{ from: start, kind: 'check', target: 1, unit: '', step: 1, sched: { type: 'week', times: 3 } }] },
            { id: 'read', name: 'Read', color: '#8b5cf6', versions: [{ from: start, kind: 'count', target: 20, unit: 'minutes', step: 5, sched: { type: 'days', days: [1, 2, 3, 4, 5] } }] },
            { id: 'cof', name: 'Coffee', color: '#f43f5e', versions: [{ from: start, kind: 'limit', target: 2, unit: 'cups', step: 1, sched: { type: 'daily' } }] }
        ];
        const log = { water: {}, walk: {}, vit: {}, gym: {}, read: {}, cof: {} };
        for (let d = start, k = 0; d < today; d = H.add(d, 1), k++) {
            log.water[d] = { n: k % 23 === 4 ? 6 : 8 + (k % 3 === 0 ? 1 : 0) };
            log.walk[d] = { n: k % 5 === 2 ? 7400 : 10000 + (k * 137) % 2600 };
            if (k % 19 !== 6) log.vit[d] = { n: 1 };
            if ([0, 2, 4].includes(H.dow(d) % 7 === 0 ? 6 : H.dow(d) - 1) && k % 29 !== 5) log.gym[d] = { n: 1 };
            if (H.dow(d) >= 1 && H.dow(d) <= 5) log.read[d] = { n: k % 7 === 3 ? 10 : 20 + (k % 4) * 5 };
            log.cof[d] = { n: k % 8 === 5 ? 3 : 1 + (k % 2) };
        }
        log.water['2026-10-09'] = { n: 2, s: 1 }; log.walk['2026-10-09'] = { n: 1200, s: 1 }; // ill on Friday
        log.water[today] = { n: 5 }; log.walk[today] = { n: 6432 }; log.vit[today] = { n: 1 }; log.read[today] = { n: 10 }; log.cof[today] = { n: 1 };
        log.gym['2026-10-12'] = { n: 1 }; log.water['2026-10-13'] = { n: 9 };
        return { habits, log, weekStart: 1 };
    }
    if (typeof module !== 'undefined' && module.exports) module.exports = seed;
    root.habitSeed = seed;
})(typeof window !== 'undefined' ? window : globalThis);
