// Checks on the weather logic. Runs in the browser (test.html) and in Node: node tests.js
(function (root) {
    function runTests(W) {
        const r = [], check = (name, ok) => r.push({ name, ok: !!ok });
        const adv = o => W.advice(Object.assign({ feels: 18, rain: 0, uv: 1, wind: 10, code: 0 }, o)).join(' | ');

        check('code 0 by day is clear sky with a sun', W.describe(0, true).text === 'Clear sky' && W.describe(0, true).icon === '☀️' && W.describe(0, true).theme === 'clear-day');
        check('code 0 at night is a moon on the night theme', W.describe(0, false).icon === '🌙' && W.describe(0, false).theme === 'clear-night');
        check('rain, snow and storm codes pick their themes', W.describe(63, true).theme === 'rain' && W.describe(73, true).theme === 'snow' && W.describe(95, true).theme === 'storm');
        check('overcast uses the clouds themes', W.describe(3, true).theme === 'clouds-day' && W.describe(3, false).theme === 'clouds-night');
        check('unknown code does not break', W.describe(12345, true).text === 'Unknown');

        check('advice: heavy rain chance says take an umbrella', /Take an umbrella.*70%/.test(adv({ rain: 70 })));
        check('advice: medium chance says maybe pack one', /Maybe pack an umbrella.*40%/.test(adv({ rain: 40 })));
        check('advice: low chance says no umbrella', /No umbrella needed/.test(adv({ rain: 5 })));
        check('advice: clothing follows how it feels', /Freezing/.test(adv({ feels: -3 })) && /Cold/.test(adv({ feels: 5 })) && /Cool/.test(adv({ feels: 12 })) &&
            /Mild/.test(adv({ feels: 20 })) && /Warm/.test(adv({ feels: 26 })) && /Hot/.test(adv({ feels: 35 })));
        check('advice: strong UV and wind add a line each', /sunscreen/.test(adv({ uv: 8 })) && !/sunscreen/.test(adv({ uv: 2 })) && /windy/.test(adv({ wind: 50 })) && !/windy/.test(adv({ wind: 20 })));
        check('advice: thunderstorm and snow are called out', /Thunderstorms/.test(adv({ code: 95 })) && /Snow is expected/.test(adv({ code: 73 })) && !/umbrella needed/.test(adv({ code: 73 })));

        check('unit conversion', W.toF(0) === 32 && W.toF(100) === 212 && Math.round(W.toMph(100)) === 62);

        check('parseQuery splits a country hint', JSON.stringify(W.parseQuery('Rome, IT')) === '{"name":"Rome","hint":"it"}' && W.parseQuery('London').hint === '' && W.parseQuery('  ').name === '');
        const rome = [{ name: 'Rome', country_code: 'US', country: 'United States', admin1: 'Georgia' }, { name: 'Rome', country_code: 'IT', country: 'Italy', admin1: 'Lazio' }];
        check('pickPlaces puts the matching country first', W.pickPlaces(rome, 'it')[0].country_code === 'IT' && W.pickPlaces(rome, 'georgia')[0].admin1 === 'Georgia');
        check('pickPlaces keeps all results and the order when there is no hint or no match', W.pickPlaces(rome, '')[0].country_code === 'US' && W.pickPlaces(rome, 'zz').length === 2 && W.pickPlaces(null, '').length === 0);
        check('place names for display', W.placeName(rome[1]) === 'Rome, Italy' && W.placeDetail(rome[1]) === 'Rome, Lazio, Italy' && W.placeDetail({ name: 'Paris', admin1: 'Paris', country: 'France' }) === 'Paris, France');

        const ks = [{ name: 'Karachi', country: 'Pakistan', population: 14000000 }, { name: 'Karachi', admin1: 'Kirov Oblast', country: 'Russia' },
            { name: 'Karachi', admin1: 'Kirov Oblast', country: 'Russia', population: 12 }, { name: 'Karachi', country: 'Pakistan', population: 14000000 }];
        check('otherPlaces hides tiny villages and duplicates of the first match', W.otherPlaces(ks).length === 0);
        const rm = [{ name: 'Rome', country: 'Italy', admin1: 'Lazio', population: 2300000 }, { name: 'Rome', country: 'United States', admin1: 'Georgia', population: 36000 },
            { name: 'Rome', country: 'United States', admin1: 'Georgia', population: 36000 }, { name: 'Rome', country: 'United States', admin1: 'New York', population: 32000 }];
        check('otherPlaces offers real towns once each', W.otherPlaces(rm).map(W.placeDetail).join('|') === 'Rome, Georgia, United States|Rome, New York, United States' && W.otherPlaces([]).length === 0);

        const hourly = { time: ['2026-10-07T21:00', '2026-10-07T22:00', '2026-10-07T23:00', '2026-10-08T00:00'], temperature_2m: [1, 2, 3, 4], precipitation_probability: [0, 10, 20, 30], weather_code: [0, 1, 2, 3], is_day: [0, 0, 0, 0] };
        let h = W.nextHours(hourly, '2026-10-07T22:15', 2);
        check('nextHours starts at the current hour and stops at n', h.length === 2 && h[0].temp === 2 && h[1].temp === 3 && h[0].rain === 10);
        check('nextHours crosses midnight and never runs past the data', W.nextHours(hourly, '2026-10-07T23:00', 5).map(x => x.temp).join() === '3,4');
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
