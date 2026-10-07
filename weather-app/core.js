// The logic behind Weather App, with no page code in it so it can be tested on its own (see tests.js).
// All weather values stay in metric (°C, km/h). The page converts for display, so changing units needs no new request.
(function (root) {
    // WMO weather codes from Open-Meteo -> words, a picture, and the page background theme
    const CODES = {
        0: ['Clear sky', '☀️', 'clear'], 1: ['Mainly clear', '🌤️', 'clear'], 2: ['Partly cloudy', '⛅', 'clouds'], 3: ['Overcast', '☁️', 'clouds'],
        45: ['Fog', '🌫️', 'mist'], 48: ['Freezing fog', '🌫️', 'mist'],
        51: ['Light drizzle', '🌦️', 'rain'], 53: ['Drizzle', '🌦️', 'rain'], 55: ['Heavy drizzle', '🌧️', 'rain'],
        56: ['Freezing drizzle', '🌧️', 'rain'], 57: ['Heavy freezing drizzle', '🌧️', 'rain'],
        61: ['Light rain', '🌦️', 'rain'], 63: ['Rain', '🌧️', 'rain'], 65: ['Heavy rain', '🌧️', 'rain'],
        66: ['Freezing rain', '🌧️', 'rain'], 67: ['Heavy freezing rain', '🌧️', 'rain'],
        71: ['Light snow', '🌨️', 'snow'], 73: ['Snow', '🌨️', 'snow'], 75: ['Heavy snow', '❄️', 'snow'], 77: ['Snow grains', '🌨️', 'snow'],
        80: ['Light showers', '🌦️', 'rain'], 81: ['Showers', '🌧️', 'rain'], 82: ['Heavy showers', '🌧️', 'rain'],
        85: ['Snow showers', '🌨️', 'snow'], 86: ['Heavy snow showers', '❄️', 'snow'],
        95: ['Thunderstorm', '⛈️', 'storm'], 96: ['Thunderstorm with hail', '⛈️', 'storm'], 99: ['Thunderstorm with hail', '⛈️', 'storm']
    };

    function describe(code, isDay) {
        const c = CODES[code] || ['Unknown', '🌡️', 'clouds'];
        const night = !isDay;
        const icon = night && code <= 1 ? '🌙' : night && code === 2 ? '☁️' : c[1];
        const theme = c[2] === 'clear' ? (night ? 'clear-night' : 'clear-day')
            : c[2] === 'clouds' ? (night ? 'clouds-night' : 'clouds-day') : c[2];
        return { text: c[0], icon, theme };
    }

    const toF = c => c * 9 / 5 + 32;
    const toMph = kmh => kmh * 0.621371;

    // Short, practical advice for the day. Inputs are metric. Returns a list of plain sentences.
    function advice({ feels, rain, uv, wind, code }) {
        const out = [];
        const snow = [71, 73, 75, 77, 85, 86].includes(code);
        if (code >= 95) out.push('Thunderstorms are possible. Stay indoors if you can.');
        if (snow) out.push('Snow is expected. Wear waterproof shoes.');
        else if (rain >= 60) out.push('Take an umbrella. Rain is likely today (' + Math.round(rain) + '%).');
        else if (rain >= 30) out.push('Maybe pack an umbrella. There is a ' + Math.round(rain) + '% chance of rain today.');
        else out.push('No umbrella needed. Rain is unlikely today.');
        if (feels <= 0) out.push('Freezing. Wear a heavy coat, a hat and gloves.');
        else if (feels <= 8) out.push('Cold. Wear a warm coat.');
        else if (feels <= 15) out.push('Cool. Bring a jacket.');
        else if (feels <= 22) out.push('Mild. A light layer is enough.');
        else if (feels <= 29) out.push('Warm. Light clothes are fine.');
        else out.push('Hot. Dress light and drink plenty of water.');
        if (uv >= 6) out.push('Strong sun (UV ' + Math.round(uv) + '). Use sunscreen and sunglasses.');
        if (wind >= 40) out.push('It is windy. Hold on to that umbrella.');
        return out;
    }

    // Search results come best-match first. "Rome,IT" or "Paris, Texas" narrows by country code, country, or region.
    function parseQuery(q) {
        const parts = String(q || '').split(',').map(s => s.trim()).filter(Boolean);
        return { name: parts[0] || '', hint: (parts.slice(1).join(' ') || '').toLowerCase() };
    }
    function pickPlaces(results, hint) {
        const list = Array.isArray(results) ? results : [];
        if (!hint) return list;
        // exact match on country code, country or region; a longer hint (3+ letters) may also start a name ("ger" -> Germany)
        const same = v => v && String(v).toLowerCase() === hint;
        const starts = v => hint.length >= 3 && v && String(v).toLowerCase().startsWith(hint);
        const hit = list.filter(r => same(r.country_code) || same(r.country) || same(r.admin1) || starts(r.country) || starts(r.admin1));
        return hit.length ? hit.concat(list.filter(r => !hit.includes(r))) : list;
    }
    // Other places worth offering when the first match may be wrong: real towns (10,000+ people), no duplicates, at most 4.
    function otherPlaces(list) {
        const seen = new Set([list[0] && placeDetail(list[0])]);
        return list.slice(1).filter(p => (p.population || 0) >= 10000 && !seen.has(placeDetail(p)) && seen.add(placeDetail(p))).slice(0, 4);
    }
    const placeName = p => [p.name, p.country].filter(Boolean).join(', ');
    const placeDetail = p => [p.name, p.admin1 && p.admin1 !== p.name ? p.admin1 : '', p.country].filter(Boolean).join(', ');

    // The next `n` hours starting from the current hour. times are local "YYYY-MM-DDTHH:MM" strings.
    function nextHours(hourly, nowLocal, n) {
        const from = String(nowLocal).slice(0, 13) + ':00';
        const i = Math.max(hourly.time.findIndex(t => t >= from), 0);
        return hourly.time.slice(i, i + n).map((t, k) => ({
            time: t, temp: hourly.temperature_2m[i + k], rain: hourly.precipitation_probability[i + k],
            code: hourly.weather_code[i + k], isDay: hourly.is_day[i + k]
        }));
    }

    const api = { describe, advice, parseQuery, pickPlaces, otherPlaces, placeName, placeDetail, nextHours, toF, toMph };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.WeatherCore = api;
})(typeof self !== 'undefined' ? self : this);
