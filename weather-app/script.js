// Get a free key at https://home.openweathermap.org/api_keys and either paste it
// below or enter it in the "API key" box on the page (the box saves it in your browser only).
const API_KEY = 'YOUR_API_KEY';

const $ = id => document.getElementById(id);
const store = {
    get: k => { try { return localStorage.getItem('weather-app.' + k) ?? localStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { localStorage.setItem('weather-app.' + k, v); } catch (e) { /* storage blocked */ } }
};

let units = store.get('units') === 'imperial' ? 'imperial' : 'metric';
let lastQuery = null;

const getKey = () => store.get('owm_key') || (API_KEY !== 'YOUR_API_KEY' ? API_KEY : '');

function setStatus(text, isError = false) {
    const el = $('status');
    el.textContent = text;
    el.classList.toggle('error', isError);
}

function syncUnits() {
    document.querySelectorAll('.units button').forEach(b =>
        b.setAttribute('aria-pressed', String(b.dataset.units === units)));
}

async function getWeather(query) {
    const key = getKey();
    if (!key) {
        $('key-panel').open = true;
        setStatus('Add your free OpenWeatherMap API key below to get started.', true);
        return;
    }
    lastQuery = query;
    setStatus('Loading…');
    const params = new URLSearchParams({ ...query, appid: key, units });
    try {
        const res = await fetch('https://api.openweathermap.org/data/2.5/weather?' + params);
        const data = await res.json();
        if (res.status === 401) {
            $('key-panel').open = true;
            return setStatus('That API key was rejected. New keys can take up to 2 hours to activate.', true);
        }
        if (res.status === 404) return setStatus('City not found. Check the spelling and try again.', true);
        if (res.status === 429) return setStatus('Too many requests. Wait a minute and try again.', true);
        if (!res.ok) return setStatus('Something went wrong. Please try again.', true);
        setStatus('');
        displayWeather(data);
    } catch (err) {
        setStatus('Could not reach the weather service. Check your connection.', true);
    }
}

// formats a unix time in the searched city's own timezone (offset is in seconds)
function clock(ts, offset) {
    const d = new Date((ts + offset) * 1000);
    return d.getUTCHours().toString().padStart(2, '0') + ':' + d.getUTCMinutes().toString().padStart(2, '0');
}

function themeFor(w, night) {
    const main = w.main.toLowerCase();
    if (main === 'thunderstorm') return 'storm';
    if (main === 'rain' || main === 'drizzle') return 'rain';
    if (main === 'snow') return 'snow';
    if (main === 'clouds') return night ? 'clouds-night' : 'clouds-day';
    if (main === 'clear') return night ? 'clear-night' : 'clear-day';
    return 'mist'; // mist, fog, haze, smoke, dust…
}

function displayWeather(data) {
    const w = data.weather[0];
    const night = w.icon.endsWith('n');
    const deg = units === 'metric' ? '°C' : '°F';
    document.body.dataset.weather = themeFor(w, night);

    $('place-name').textContent = data.name + (data.sys.country ? ', ' + data.sys.country : '');
    $('place-time').textContent = 'Local time ' + clock(Math.floor(Date.now() / 1000), data.timezone);
    $('icon').src = `https://openweathermap.org/img/wn/${w.icon}@2x.png`;
    $('icon').alt = w.description;
    $('temp').textContent = Math.round(data.main.temp);
    $('temp-unit').textContent = deg;
    $('desc').textContent = w.description;
    $('feels').textContent = Math.round(data.main.feels_like) + deg;
    $('hilo').textContent = Math.round(data.main.temp_max) + '° / ' + Math.round(data.main.temp_min) + '°';
    $('humidity').textContent = data.main.humidity + ' %';
    $('wind').textContent = Math.round(data.wind.speed) + (units === 'metric' ? ' m/s' : ' mph');
    $('pressure').textContent = data.main.pressure + ' hPa';
    $('visibility').textContent = data.visibility != null
        ? (units === 'metric' ? (data.visibility / 1000).toFixed(1) + ' km' : (data.visibility / 1609.34).toFixed(1) + ' mi')
        : '–';
    $('sunrise').textContent = clock(data.sys.sunrise, data.timezone);
    $('sunset').textContent = clock(data.sys.sunset, data.timezone);
    $('weather-info').hidden = false;
}

$('search-form').addEventListener('submit', e => {
    e.preventDefault();
    const city = $('city-input').value.trim();
    if (!city) return;
    store.set('last_city', city);
    getWeather({ q: city });
});

$('locate-button').addEventListener('click', () => {
    if (!navigator.geolocation) return setStatus('Location is not supported in this browser.', true);
    setStatus('Finding your location…');
    navigator.geolocation.getCurrentPosition(
        pos => getWeather({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
        () => setStatus('Location access was denied. Search for a city instead.', true)
    );
});

document.querySelectorAll('.units button').forEach(b => b.addEventListener('click', () => {
    units = b.dataset.units;
    store.set('units', units);
    syncUnits();
    if (lastQuery) getWeather(lastQuery);
}));

$('key-form').addEventListener('submit', e => {
    e.preventDefault();
    const key = $('key-input').value.trim();
    if (!key) return;
    store.set('owm_key', key);
    $('key-input').value = '';
    $('key-panel').open = false;
    setStatus('API key saved in this browser.');
    const city = store.get('last_city') || $('city-input').value.trim();
    if (city) getWeather({ q: city });
});

syncUnits();
if (!getKey()) {
    $('key-panel').open = true;
    setStatus('Add your free OpenWeatherMap API key below to get started.');
} else if (store.get('last_city')) {
    $('city-input').value = store.get('last_city');
    getWeather({ q: store.get('last_city') });
}
