(() => {
    const W = WeatherCore, $ = id => document.getElementById(id);
    const store = {
        get: k => { try { return localStorage.getItem('weather-app.' + k); } catch (e) { return null; } },
        set: (k, v) => { try { localStorage.setItem('weather-app.' + k, v); } catch (e) { /* storage blocked */ } }
    };
    // earlier versions needed an API key. It is no longer used, so remove any copy saved in this browser.
    try { localStorage.removeItem('weather-app.owm_key'); localStorage.removeItem('owm_key'); } catch (e) { /* ignore */ }

    let units = store.get('units') === 'imperial' ? 'imperial' : 'metric';
    let place = null, data = null, fetchedAt = 0;

    const setStatus = (text, isError = false) => { $('status').textContent = text; $('status').classList.toggle('error', isError); };
    const json = async url => { const r = await fetch(url); if (!r.ok) throw new Error(r.status); return r.json(); };
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

    const deg = () => units === 'metric' ? '°C' : '°F';
    const temp = c => Math.round(units === 'metric' ? c : W.toF(c));
    const speed = k => Math.round(units === 'metric' ? k : W.toMph(k)) + (units === 'metric' ? ' km/h' : ' mph');
    // Times from the API are already the place's own wall-clock time ("2026-10-07T22:00"), so format them without any timezone shift.
    const hm = iso => iso.slice(11, 16);
    const hour = iso => iso.slice(11, 13) + ':00';
    const dayName = (iso, i) => i === 0 ? 'Today' : new Date(iso + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short' });

    async function geocode(name) {
        const r = await json('https://geocoding-api.open-meteo.com/v1/search?count=8&language=en&format=json&name=' + encodeURIComponent(name));
        return r.results || [];
    }

    async function search(q) {
        const { name, hint } = W.parseQuery(q);
        if (!name) return;
        setStatus('Searching…'); $('others').hidden = true;
        let found;
        try { found = W.pickPlaces(await geocode(name), hint); }
        catch (e) { return setStatus('Could not reach the weather service. Check your connection.', true); }
        if (!found.length) return setStatus('No place found for "' + name + '". Check the spelling and try again.', true);
        showOthers(W.otherPlaces(found));
        await load({ name: found[0].name, country: found[0].country, lat: found[0].latitude, lon: found[0].longitude });
    }

    // other places with the same name (Rome, Italy and Rome, Georgia), so a wrong first match is one tap to fix
    function showOthers(list) {
        const box = $('others'); box.innerHTML = '';
        if (!list.length) { box.hidden = true; return; }
        box.appendChild(el('span', '', 'Not the right place?'));
        list.forEach(p => {
            const b = el('button', '', W.placeDetail(p)); b.type = 'button';
            b.onclick = () => { box.hidden = true; load({ name: p.name, country: p.country, lat: p.latitude, lon: p.longitude }); };
            box.appendChild(b);
        });
        box.hidden = false;
    }

    async function load(p) {
        place = p; store.set('place', JSON.stringify(p));
        setStatus('Loading…');
        const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + p.lat + '&longitude=' + p.lon + '&timezone=auto&forecast_days=7' +
            '&current=temperature_2m,apparent_temperature,relative_humidity_2m,is_day,weather_code,wind_speed_10m' +
            '&hourly=temperature_2m,precipitation_probability,weather_code,is_day' +
            '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max,sunrise,sunset';
        try {
            data = await json(url); fetchedAt = Date.now();
            store.set('cache', JSON.stringify({ place: p, data, at: fetchedAt }));
            setStatus(''); render();
        } catch (e) {
            // offline or the service is down: show the last saved forecast for this place, clearly marked
            let c = null; try { c = JSON.parse(store.get('cache')); } catch (e2) { /* none */ }
            if (c && c.place && c.place.lat === p.lat && c.place.lon === p.lon) {
                data = c.data; fetchedAt = c.at; render();
                setStatus('Offline. Showing the forecast saved at ' + new Date(c.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + '.', true);
            } else setStatus('Could not reach the weather service. Check your connection.', true);
        }
    }

    function render() {
        if (!data || !place) return;
        const cur = data.current, d = data.daily, isDay = cur.is_day === 1;
        const info = W.describe(cur.weather_code, isDay);
        document.body.dataset.weather = info.theme;
        document.querySelectorAll('.units button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.units === units)));

        $('place-name').textContent = W.placeName(place);
        $('place-time').textContent = 'Local time ' + hm(cur.time);
        $('icon').textContent = info.icon; $('icon').setAttribute('aria-label', info.text);
        $('temp').textContent = temp(cur.temperature_2m); $('temp-unit').textContent = deg();
        $('desc').textContent = info.text;

        const rain = d.precipitation_probability_max[0] ?? 0, uv = d.uv_index_max[0] ?? 0;
        $('advice').innerHTML = '';
        W.advice({ feels: cur.apparent_temperature, rain, uv, wind: cur.wind_speed_10m, code: cur.weather_code })
            .forEach(t => $('advice').appendChild(el('li', '', t)));

        $('feels').textContent = temp(cur.apparent_temperature) + deg();
        $('hilo').textContent = temp(d.temperature_2m_max[0]) + '° / ' + temp(d.temperature_2m_min[0]) + '°';
        $('rain').textContent = Math.round(rain) + ' %';
        $('humidity').textContent = cur.relative_humidity_2m + ' %';
        $('wind').textContent = speed(cur.wind_speed_10m);
        $('uv').textContent = Math.round(uv);
        $('sunrise').textContent = hm(d.sunrise[0]); $('sunset').textContent = hm(d.sunset[0]);

        $('hourly').innerHTML = '';
        W.nextHours(data.hourly, cur.time, 12).forEach((h, i) => {
            const li = el('li');
            li.append(el('span', 'h-t', i === 0 ? 'Now' : hour(h.time)), el('span', 'h-i', W.describe(h.code, h.isDay === 1).icon),
                el('b', '', temp(h.temp) + '°'), el('span', 'h-r', h.rain != null ? Math.round(h.rain) + '%' : ''));
            li.title = W.describe(h.code, h.isDay === 1).text;
            $('hourly').appendChild(li);
        });

        $('daily').innerHTML = '';
        d.time.forEach((t, i) => {
            const w = W.describe(d.weather_code[i], true), li = el('li');
            li.append(el('span', 'd-n', dayName(t, i)), el('span', 'd-i', w.icon), el('span', 'd-r', Math.round(d.precipitation_probability_max[i] ?? 0) + '%'),
                el('b', '', temp(d.temperature_2m_max[i]) + '°'), el('span', 'd-lo', temp(d.temperature_2m_min[i]) + '°'));
            li.title = w.text;
            $('daily').appendChild(li);
        });
        $('weather-info').hidden = false;
    }

    $('search-form').addEventListener('submit', e => { e.preventDefault(); search($('city-input').value); });

    $('locate-button').addEventListener('click', () => {
        if (!navigator.geolocation) return setStatus('Location is not supported in this browser. Search for a city instead.', true);
        setStatus('Finding your location…');
        navigator.geolocation.getCurrentPosition(async pos => {
            const lat = +pos.coords.latitude.toFixed(3), lon = +pos.coords.longitude.toFixed(3);
            let name = 'Your location', country = '';
            try { // turn the position into a place name (free, no key). If it fails we still show the weather.
                const g = await json('https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=' + lat + '&longitude=' + lon + '&localityLanguage=en');
                name = g.city || g.locality || g.principalSubdivision || name; country = g.countryName || '';
            } catch (e) { /* keep the generic name */ }
            $('others').hidden = true;
            load({ name, country: country.replace(/ of Great Britain and Northern Ireland| \(the\)/g, ''), lat, lon });
        }, () => setStatus('Location access was denied. Search for a city instead.', true), { timeout: 15000 });
    });

    document.querySelectorAll('.units button').forEach(b => b.addEventListener('click', () => {
        units = b.dataset.units; store.set('units', units); render();
    }));

    // coming back to the tab after a while: refresh so the forecast is never stale
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && place && Date.now() - fetchedAt > 10 * 60 * 1000) load(place);
    });

    let saved = null; try { saved = JSON.parse(store.get('place')); } catch (e) { /* none */ }
    if (saved && typeof saved.lat === 'number' && typeof saved.lon === 'number') { $('city-input').value = saved.name || ''; load(saved); }
})();
