// Prayer Times and Qibla Direction: page code. The maths is in core.js.
(function () {
    'use strict';
    const KEY = 'prayer-times-and-qibla-direction.state';
    const $ = id => document.getElementById(id);
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
    const deviceTz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (e) { return 'UTC'; } })();
    const deviceClock = (() => { try { return new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hour12 === false ? '24' : '12'; } catch (e) { return '12'; } })();

    let state = load();
    let view = null;           // date being shown (YYYY-MM-DD), null = today
    let monthView = null;      // {y, m}
    let undo = null;
    let compassOn = false, heading = null;

    function load() {
        try { const raw = localStorage.getItem(KEY); return PT.cleanState(raw ? JSON.parse(raw) : null); }
        catch (e) { return PT.cleanState(null); }
    }
    function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage blocked: keeps working for this visit */ } }
    const clock = () => state.clock || deviceClock;
    const place = () => state.places.find(p => p.id === state.current) || null;
    const now = () => Date.now();

    function message(box, text, undoFn) {
        const m = $(box); m.textContent = '';
        if (!text) return;
        m.appendChild(el('span', '', text));
        if (undoFn) {
            const b = el('button', 'link-btn', 'Undo'); b.type = 'button';
            b.addEventListener('click', () => { undoFn(); m.textContent = ''; });
            m.appendChild(document.createTextNode(' ')); m.appendChild(b);
        }
    }

    // ---------- dates ----------
    const LOCALE = (() => { try { return navigator.language || 'en-GB'; } catch (e) { return 'en-GB'; } })();
    function longDate(iso) {
        const p = PT.parseISO(iso);
        try { return new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(p.y, p.m - 1, p.d, 12))); }
        catch (e) { return iso; }
    }
    function shortDay(iso) {
        const p = PT.parseISO(iso);
        try { return new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(p.y, p.m - 1, p.d, 12))) + ' ' + p.d; }
        catch (e) { return String(p.d); }
    }
    function monthName(y, m) {
        try { return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 15))); }
        catch (e) { return y + '-' + m; }
    }
    const today = () => PT.todayIn(place().tz, now());
    const shown = () => view || today();
    const inRange = iso => iso >= '1950-01-01' && iso <= '2150-12-31';

    // ---------- places ----------
    function placeArea(p) { return p.area || (Math.abs(p.lat).toFixed(2) + (p.lat >= 0 ? ' N, ' : ' S, ') + Math.abs(p.lon).toFixed(2) + (p.lon >= 0 ? ' E' : ' W')); }
    function addPlace(raw) {
        const p = PT.cleanPlace(Object.assign({ id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }, raw));
        if (!p) { message('place-msg', 'That place could not be added.'); return; }
        const same = state.places.find(x => x.name === p.name && Math.abs(x.lat - p.lat) < 0.01 && Math.abs(x.lon - p.lon) < 0.01);
        if (same) { state.current = same.id; save(); closeAdd(); view = null; monthView = null; render(); message('place-msg', p.name + ' is already in your places, now showing it.'); return; }
        if (state.places.length >= 20) { message('place-msg', 'You can keep up to 20 places. Remove one first.'); return; }
        state.places.push(p); state.current = p.id; save();
        closeAdd(); view = null; monthView = null; render();
        try { $('times').scrollIntoView({ block: 'start' }); } catch (e) { /* old browser */ }
        const m = PT.METHODS[p.method];
        message('place-msg', 'Added ' + p.name + '. Method: ' + m.short + ', Asr: ' + (p.asr === 'hanafi' ? 'Hanafi' : 'standard') + '. Change them in Settings if your mosque uses another.');
    }
    function removePlace(id) {
        const i = state.places.findIndex(p => p.id === id); if (i < 0) return;
        const before = JSON.stringify(state), name = state.places[i].name;
        state.places.splice(i, 1);
        if (state.current === id) state.current = state.places[0] ? state.places[0].id : null;
        save(); view = null; monthView = null; render();
        message('place-msg', 'Removed ' + name + '.', () => { state = PT.cleanState(JSON.parse(before)); save(); render(); });
    }
    function renderPlaces() {
        const box = $('places'); box.textContent = '';
        state.places.forEach(p => {
            const cur = p.id === state.current;
            const card = el('div', 'pbox' + (cur ? ' current' : ''));
            const info = el('div', 'pinfo');
            info.appendChild(el('span', 'pname', p.name));
            info.appendChild(el('span', 'parea', placeArea(p)));
            card.appendChild(info);
            const btns = el('div', 'pbtns');
            if (cur) btns.appendChild(el('span', 'tag', 'Showing'));
            else { const s = el('button', 'btn small', 'Show'); s.type = 'button'; s.setAttribute('aria-label', 'Show ' + p.name); s.addEventListener('click', () => { state.current = p.id; save(); view = null; monthView = null; message('place-msg', ''); render(); }); btns.appendChild(s); }
            const r = el('button', 'btn small quiet', 'Remove'); r.type = 'button'; r.setAttribute('aria-label', 'Remove ' + p.name);
            r.addEventListener('click', () => removePlace(p.id)); btns.appendChild(r);
            card.appendChild(btns); box.appendChild(card);
        });
        const none = !state.places.length;
        if (none) { $('add').hidden = false; $('add-open').hidden = true; $('add-close').hidden = true; }
        else if ($('add').dataset.open !== '1') { $('add').hidden = true; $('add-open').hidden = false; }
    }
    function openAdd() { $('add').hidden = false; $('add').dataset.open = '1'; $('add-open').hidden = true; $('add-close').hidden = false; $('q').focus(); }
    function closeAdd() {
        $('add').dataset.open = ''; $('results').textContent = ''; message('search-msg', ''); $('q').value = '';
        $('manual').hidden = true; $('manual-open').setAttribute('aria-expanded', 'false'); ['m-lat', 'm-lon', 'm-name'].forEach(i => { $(i).value = ''; }); $('m-err').textContent = '';
        if (state.places.length) { $('add').hidden = true; $('add-open').hidden = false; $('add-close').hidden = true; }
    }

    // place search with Open-Meteo (no key needed)
    let searchNo = 0;
    async function search() {
        const q = $('q').value.trim(); $('results').textContent = '';
        if (q.length < 2) { message('search-msg', 'Type at least 2 letters of your city or town.'); $('q').focus(); return; }
        const my = ++searchNo; message('search-msg', 'Searching…');
        let data;
        try {
            const r = await fetch('https://geocoding-api.open-meteo.com/v1/search?count=10&language=en&format=json&name=' + encodeURIComponent(q));
            if (!r.ok) throw new Error('status ' + r.status);
            data = await r.json();
        } catch (e) {
            if (my !== searchNo) return;
            message('search-msg', (navigator.onLine === false ? 'No connection, so the city search does not work right now.' : 'The city search is not answering right now.') +
                ' Your saved places still work. You can also tap "+ Enter latitude and longitude instead".');
            return;
        }
        if (my !== searchNo) return;
        const list = (data && Array.isArray(data.results) ? data.results : []).filter(x => Number.isFinite(x.latitude) && Number.isFinite(x.longitude) && PT.validZone(x.timezone));
        if (!list.length) { message('search-msg', 'No place called "' + q.slice(0, 40) + '" was found. Check the spelling, or try a bigger town nearby.'); return; }
        message('search-msg', 'Tap your place:');
        list.forEach(x => {
            const li = el('li'); const b = el('button', 'result'); b.type = 'button';
            b.appendChild(el('span', 'pname', x.name));
            b.appendChild(el('span', 'parea', [x.admin1, x.country].filter(Boolean).join(', ')));
            b.addEventListener('click', () => {
                const cc = (x.country_code || '').toUpperCase(), d = PT.defaultsFor(cc);
                addPlace({ name: x.name, area: [x.admin1, x.country].filter(Boolean).join(', '), country: cc, lat: x.latitude, lon: x.longitude, tz: x.timezone, method: d.method, asr: d.asr });
            });
            li.appendChild(b); $('results').appendChild(li);
        });
    }
    function locate() {
        if (!navigator.geolocation) { message('search-msg', 'This browser cannot share your location. Search for your city instead.'); return; }
        message('search-msg', 'Finding your location…');
        navigator.geolocation.getCurrentPosition(pos => {
            const cc = PT.TZ_COUNTRY[deviceTz] || '', d = PT.defaultsFor(cc);
            const lat = Math.round(pos.coords.latitude * 10000) / 10000, lon = Math.round(pos.coords.longitude * 10000) / 10000;
            message('search-msg', '');
            addPlace({ name: 'My location', area: '', country: cc, lat, lon, tz: deviceTz, method: d.method, asr: d.asr });
        }, err => {
            message('search-msg', err && err.code === 1 ? 'Location is blocked for this page. Type your city above instead, or allow location in the browser settings.' : 'Your location could not be found. Type your city above instead.');
        }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 });
    }
    function fillZones() {
        let zones = [];
        try { zones = Intl.supportedValuesOf('timeZone'); } catch (e) { zones = []; }
        if (!zones.includes(deviceTz)) zones.unshift(deviceTz);
        const s = $('m-tz'); s.textContent = '';
        zones.forEach(z => { const o = el('option', '', z.replace(/_/g, ' ')); o.value = z; s.appendChild(o); });
        s.value = deviceTz;
    }
    function manualAdd() {
        const lat = PT.parseCoord($('m-lat').value, 90), lon = PT.parseCoord($('m-lon').value, 180);
        $('m-lat').setAttribute('aria-invalid', lat === null); $('m-lon').setAttribute('aria-invalid', lon === null);
        if (lat === null) { $('m-err').textContent = 'Latitude must be a number from -90 to 90, such as 24.86 (south is minus).'; $('m-lat').focus(); return; }
        if (lon === null) { $('m-err').textContent = 'Longitude must be a number from -180 to 180, such as 67.00 (west is minus).'; $('m-lon').focus(); return; }
        $('m-err').textContent = '';
        const tz = $('m-tz').value, cc = PT.TZ_COUNTRY[tz] || '', d = PT.defaultsFor(cc);
        addPlace({ name: $('m-name').value.trim() || 'My place', area: '', country: cc, lat, lon, tz, method: d.method, asr: d.asr });
    }

    // ---------- today's times ----------
    function renderTimes() {
        const p = place(); const has = !!p;
        $('times-empty').hidden = has; $('times-body').hidden = !has;
        ['qibla', 'settings', 'month'].forEach(id => { $(id).hidden = !has; });
        $('app').classList.toggle('no-place', !has); $('change-place').hidden = !has;
        if (!has) { $('times-h').textContent = 'Prayer times today'; return; }
        const t = now(), td = today(), d = shown(), isToday = d === td;
        const data = PT.timesFor(p, d);
        $('times-h').textContent = isToday ? 'Prayer times today in ' + p.name : 'Prayer times in ' + p.name;
        $('d-greg').textContent = longDate(d);
        const h = PT.hijri(d, state.hijriAdj); $('d-hijri').textContent = h ? h : '';
        $('day').value = d;
        $('other-day').hidden = isToday;

        const nn = PT.nowAndNext(p, t);
        $('next').hidden = !isToday;
        if (isToday) {
            if (nn.next) {
                const when = PT.fmtTime(nn.next.min, clock()).replace(/ \((next day|day before)\)$/, '');
                const nm = $('next-main'); nm.textContent = 'Next: ' + nn.next.name + ' at ' + when + (nn.next.date !== td ? ' tomorrow' : '') + ', ';
                nm.appendChild(el('span', 'left', 'in ' + PT.fmtLeft(nn.next.at - t)));
                const sub = nn.current ? 'Now: ' + nn.current.name + ' time' + (nn.current.key === 'fajr' ? ' (ends at sunrise)' : '') : 'Between sunrise and Dhuhr there is no prayer time.';
                $('next-sub').textContent = sub;
            } else { $('next-main').textContent = 'No prayer times can be worked out here around today.'; $('next-sub').textContent = ''; }
        }
        const list = $('plist'); list.textContent = '';
        data.list.forEach(x => {
            const li = el('li', 'prow ' + x.key);
            const isNow = isToday && nn.current && nn.current.key === x.key && nn.current.date === d;
            const isNext = isToday && nn.next && nn.next.key === x.key && nn.next.date === d;
            const past = isToday && x.at !== null && x.at <= t && !isNow;
            if (isNow) li.classList.add('now'); if (isNext) li.classList.add('is-next'); if (past) li.classList.add('past');
            li.appendChild(el('span', 'pn', x.name));
            if (isNow) li.appendChild(el('span', 'tag', 'Now')); else if (isNext) li.appendChild(el('span', 'tag next-tag', 'Next'));
            li.appendChild(el('span', 'pt', PT.fmtTime(x.min, clock())));
            list.appendChild(li);
        });
        const missing = data.list.filter(x => x.at === null).map(x => x.name);
        $('polar').hidden = !missing.length;
        if (missing.length) $('polar').textContent = (data.list[1].at === null ? 'The sun does not rise or set here on this day, so ' : 'On this day the sky never gets dark enough, so ') +
            missing.join(', ') + ' cannot be worked out. Follow your local mosque or the nearest city further south (or north).';
        const pd = PT.parseISO(d), off = data.offset, devOff = PT.dayOffset(deviceTz, pd.y, pd.m, pd.d);
        $('zone').textContent = 'Times are in ' + p.name + ' local time (' + p.tz.replace(/_/g, ' ') + ', ' + PT.fmtOffset(off) + ')' +
            (off !== devOff ? '. Your device is on ' + PT.fmtOffset(devOff) + ', so the countdown already allows for the difference.' : '.');
        const m = PT.METHODS[p.method];
        $('method-line').textContent = 'Method: ' + m.name + '. Asr: ' + (p.asr === 'hanafi' ? 'Hanafi' : 'standard') + '.' +
            (PT.PRAYERS.some(k => p.adj[k]) ? ' Your minute adjustments are included.' : '');
        $('prev-day').disabled = !inRange(PT.addDays(d, -1)); $('next-day').disabled = !inRange(PT.addDays(d, 1));
    }
    function dayText(p, d) {
        const data = PT.timesFor(p, d), h = PT.hijri(d, state.hijriAdj), q = PT.qibla(p.lat, p.lon);
        return ['Prayer times for ' + p.name + ' on ' + longDate(d) + (h ? ' (' + h + ')' : ''), '']
            .concat(data.list.map(x => x.name + ': ' + PT.fmtTime(x.min, clock())))
            .concat(['', 'Method: ' + PT.METHODS[p.method].name + '; Asr: ' + (p.asr === 'hanafi' ? 'Hanafi' : 'standard'),
                'Qibla: ' + Math.round(q.bearing) + '° from north (' + PT.compassWord(q.bearing) + ')', '', 'https://umar8092.github.io/apps/prayer-times-and-qibla-direction/']).join('\n');
    }
    async function copyText(text, box, okMsg) {
        try { await navigator.clipboard.writeText(text); message(box, okMsg); }
        catch (e) {
            const ta = el('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
            let ok = false; try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
            ta.remove(); message(box, ok ? okMsg : 'Copying is blocked in this browser. Use Share or Email instead.');
        }
    }

    // ---------- qibla ----------
    function renderQibla() {
        const p = place(); if (!p) return;
        const q = PT.qibla(p.lat, p.lon), b = Math.round(q.bearing);
        $('arrow').setAttribute('transform', 'rotate(' + q.bearing.toFixed(2) + ' 100 100)');
        $('q-main').textContent = b + '° from north (' + PT.compassWord(q.bearing) + ')';
        $('q-sub').textContent = 'The Kaaba in Makkah is ' + (q.km < 1 ? 'less than 1 km' : Math.round(q.km).toLocaleString('en-GB') + ' km') + ' away from ' + p.name + '.';
        $('q-how').textContent = q.km < 0.05 ? 'You are at the Kaaba.' : 'Without a compass: face north, then turn right by ' + b + '°.';
        updateCompass();
    }
    function updateCompass() {
        const p = place(); if (!p) return;
        const rot = $('dial-rot');
        if (!compassOn || heading === null) { rot.removeAttribute('transform'); $('top-mark').setAttribute('visibility', 'hidden'); return; }
        rot.setAttribute('transform', 'rotate(' + (-heading).toFixed(1) + ' 100 100)');
        $('top-mark').setAttribute('visibility', 'visible');
        const q = PT.qibla(p.lat, p.lon), diff = ((q.bearing - heading + 540) % 360) - 180;
        $('q-live').textContent = Math.abs(diff) <= 5 ? 'You are facing the Qibla.' : 'Turn ' + (diff > 0 ? 'right' : 'left') + ' by ' + Math.round(Math.abs(diff)) + '°.';
        $('q-live').classList.toggle('ok', Math.abs(diff) <= 5);
    }
    function onOrient(e) {
        let h = null;
        if (typeof e.webkitCompassHeading === 'number' && !isNaN(e.webkitCompassHeading)) h = e.webkitCompassHeading;
        else if (e.absolute && typeof e.alpha === 'number') h = (360 - e.alpha) % 360;
        if (h === null) return;
        const so = (screen.orientation && typeof screen.orientation.angle === 'number') ? screen.orientation.angle : 0;
        heading = (h + so + 360) % 360; updateCompass();
    }
    let compassTimer = null;
    async function toggleCompass() {
        if (compassOn) { stopCompass(); return; }
        if (typeof DeviceOrientationEvent === 'undefined') { $('q-live').textContent = 'This device has no compass. Use the angle above with a compass, or face north and turn right.'; return; }
        try { if (typeof DeviceOrientationEvent.requestPermission === 'function') { const r = await DeviceOrientationEvent.requestPermission(); if (r !== 'granted') { $('q-live').textContent = 'The compass was not allowed. Use the angle above instead.'; return; } } }
        catch (e) { $('q-live').textContent = 'The compass could not be started. Use the angle above instead.'; return; }
        compassOn = true; heading = null; $('compass').textContent = 'Stop the compass';
        $('q-live').textContent = 'Hold the phone flat…';
        window.addEventListener('deviceorientationabsolute', onOrient); window.addEventListener('deviceorientation', onOrient);
        clearTimeout(compassTimer);
        compassTimer = setTimeout(() => { if (compassOn && heading === null) { stopCompass(); $('q-live').textContent = 'No compass reading came from this device. Use the angle above, or face north and turn right.'; } }, 4000);
    }
    function stopCompass() {
        compassOn = false; heading = null; clearTimeout(compassTimer);
        window.removeEventListener('deviceorientationabsolute', onOrient); window.removeEventListener('deviceorientation', onOrient);
        $('compass').textContent = 'Use phone compass'; $('q-live').textContent = ''; $('q-live').classList.remove('ok'); updateCompass();
    }
    function buildDial() {
        const g = $('ticks'), ns = 'http://www.w3.org/2000/svg';
        for (let a = 0; a < 360; a += 15) {
            const l = document.createElementNS(ns, 'line'), big = a % 90 === 0;
            l.setAttribute('x1', 100); l.setAttribute('y1', 8); l.setAttribute('x2', 100); l.setAttribute('y2', big ? 18 : 13);
            l.setAttribute('transform', 'rotate(' + a + ' 100 100)'); g.appendChild(l);
        }
    }

    // ---------- settings ----------
    function fillMethods() {
        const s = $('method'); s.textContent = '';
        Object.keys(PT.METHODS).forEach(k => {
            const m = PT.METHODS[k];
            const o = el('option', '', m.name + (k === 'custom' ? '' : ' (Fajr ' + m.fajr + '°, Isha ' + (m.ishaMin ? m.ishaMin + ' min after Maghrib' : m.isha + '°') + ')'));
            o.value = k; s.appendChild(o);
        });
        const a = $('adj'); a.textContent = '';
        PT.PRAYERS.forEach(k => {
            const f = el('div', 'field adj-f'); const l = el('label', '', PT.NAMES[k]); l.htmlFor = 'adj-' + k;
            const i = el('input'); i.type = 'number'; i.id = 'adj-' + k; i.min = -60; i.max = 60; i.step = 1; i.inputMode = 'numeric';
            i.addEventListener('change', () => setAdj(k, i));
            f.appendChild(l); f.appendChild(i); a.appendChild(f);
        });
    }
    function renderSettings() {
        const p = place(); if (!p) return;
        $('settings-h').textContent = 'Settings for ' + p.name;
        $('method').value = p.method; $('asr').value = p.asr; $('highlat').value = p.highLat;
        const m = PT.METHODS[p.method];
        $('method-hint').textContent = p.method === 'custom' ? 'Type the angles your mosque uses.' :
            (m.adj ? 'This method includes the minutes the authority adds to its own timetable.' : (p.country && PT.BY_COUNTRY[p.country] === p.method ? 'The usual method for this country.' : ''));
        $('custom').hidden = p.method !== 'custom';
        $('c-fajr').value = p.custom.fajr; $('c-isha').value = p.custom.isha; $('c-ishamin-on').checked = p.custom.ishaMin > 0;
        $('c-ishamin').value = p.custom.ishaMin || 90; $('c-ishamin-wrap').hidden = !(p.custom.ishaMin > 0); $('c-isha').disabled = p.custom.ishaMin > 0;
        PT.PRAYERS.forEach(k => { const i = $('adj-' + k); if (document.activeElement !== i) i.value = p.adj[k]; i.removeAttribute('aria-invalid'); });
        $('adj-box').querySelector('summary').textContent = 'Adjust minutes to match your mosque' + (PT.PRAYERS.some(k => p.adj[k]) ? ' (in use)' : '');
        const far = Math.abs(p.lat) >= 48;
        $('hl-hint').textContent = far ? 'This place is far from the equator, so in summer Fajr and Isha are kept to a share of the short night by this rule.' :
            'Only matters for places far from the equator (above about 48° north or south), where summer nights are very short.';
        $('clock').value = clock(); $('hijri-adj').value = String(state.hijriAdj);
    }
    function change(fn) { const p = place(); if (!p) return; fn(p); save(); render(); }
    function setAdj(k, input) {
        const v = input.value.trim() === '' ? 0 : Number(input.value);
        if (!Number.isFinite(v) || v < -60 || v > 60) { input.setAttribute('aria-invalid', 'true'); input.value = place().adj[k]; message('day-msg', ''); return; }
        change(p => { p.adj[k] = Math.round(v); });
    }
    function setCustom() {
        const f = Number($('c-fajr').value), i = Number($('c-isha').value), on = $('c-ishamin-on').checked, mi = Math.round(Number($('c-ishamin').value));
        if (!(f >= 10 && f <= 22)) { $('c-err').textContent = 'Fajr angle must be from 10 to 22 degrees.'; return; }
        if (!on && !(i >= 10 && i <= 22)) { $('c-err').textContent = 'Isha angle must be from 10 to 22 degrees.'; return; }
        if (on && !(mi >= 1 && mi <= 180)) { $('c-err').textContent = 'Minutes after Maghrib must be from 1 to 180.'; return; }
        $('c-err').textContent = '';
        change(p => { p.custom = { fajr: f, isha: on ? p.custom.isha : i, ishaMin: on ? mi : 0 }; });
    }

    // ---------- month ----------
    function curMonth() { if (!monthView) { const p = PT.parseISO(shown()); monthView = { y: p.y, m: p.m }; } return monthView; }
    function monthDates() { const { y, m } = curMonth(), n = PT.daysInMonth(y, m), out = []; for (let d = 1; d <= n; d++) out.push(PT.iso(y, m, d)); return out; }
    // 12-hour table cells leave out am/pm (said once above the table), except a time after midnight such as Isha far north in summer
    const tableTime = min => { const t = PT.fmtTime(min, clock()).replace(/ \(.*\)$/, ''); return clock() === '24' || min < 0 || min >= 1440 ? t : t.replace(/ (am|pm)$/, ''); };
    function renderMonth() {
        const p = place(); if (!p) return;
        const { y, m } = curMonth(), td = today();
        $('month-h').textContent = monthName(y, m);
        const first = PT.hijri(PT.iso(y, m, 1), state.hijriAdj), last = PT.hijri(PT.iso(y, m, PT.daysInMonth(y, m)), state.hijriAdj);
        $('month-sub').textContent = p.name + ' · Method: ' + PT.METHODS[p.method].short + ' · ' + (p.asr === 'hanafi' ? 'Hanafi' : 'Standard') + ' Asr' +
            (clock() === '12' ? ' · 12-hour clock: morning times are am, from Dhuhr on pm' : '') + (first && last ? ' · ' + first.replace(/ AH$/, '') + ' to ' + last : '');
        const body = $('mbody'); body.textContent = '';
        monthDates().forEach(d => {
            const tr = el('tr'); if (d === td) { tr.className = 'today'; tr.setAttribute('aria-current', 'date'); }
            const th = el('th', '', shortDay(d)); th.scope = 'row'; tr.appendChild(th);
            PT.timesFor(p, d).list.forEach(x => tr.appendChild(el('td', '', x.min === null ? '--' : tableTime(x.min))));
            body.appendChild(tr);
        });
        const prev = PT.iso(m === 1 ? y - 1 : y, m === 1 ? 12 : m - 1, 1), next = PT.iso(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1, 1);
        $('prev-month').disabled = prev < '1950-01-01'; $('next-month').disabled = next > '2150-12-31';
    }
    function monthText() {
        const p = place(), { y, m } = curMonth();
        const rows = monthDates().map(d => [shortDay(d)].concat(PT.timesFor(p, d).list.map(x => PT.fmtTime(x.min, clock()).replace(/ \(.*\)$/, ''))).join('\t'));
        return ['Prayer times for ' + p.name + ', ' + monthName(y, m), 'Method: ' + PT.METHODS[p.method].name + '; Asr: ' + (p.asr === 'hanafi' ? 'Hanafi' : 'standard'), '',
            ['Date', 'Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'].join('\t')].concat(rows).join('\n');
    }
    function downloadIcs() {
        const p = place(), { y, m } = curMonth();
        const blob = new Blob([PT.ics(p, monthDates())], { type: 'text/calendar' });
        const a = el('a'); a.href = URL.createObjectURL(blob);
        a.download = 'prayer-times-' + p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + y + '-' + String(m).padStart(2, '0') + '.ics';
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        message('month-msg', 'Downloaded the calendar file for ' + monthName(y, m) + '. Open it to add the prayers to your calendar.');
    }

    // ---------- all ----------
    function render() {
        if (state.current && !place()) state.current = state.places[0] ? state.places[0].id : null;
        renderPlaces(); renderTimes(); renderQibla(); renderSettings(); renderMonth();
    }
    let lastMinute = -1, lastToday = '';
    function tick() {
        const p = place(); if (!p) return;
        const t = now(), mnt = Math.floor(t / 60000), td = today();
        if (td !== lastToday && lastToday && view === null) monthView = null;
        if (mnt !== lastMinute || td !== lastToday) { lastMinute = mnt; lastToday = td; renderTimes(); if (!$('month').hidden) renderMonth(); }
    }

    function goDay(d) { if (!d || !PT.parseISO(d) || !inRange(d)) return; view = d === today() ? null : d; monthView = null; message('day-msg', ''); renderTimes(); renderMonth(); }

    // events
    $('search').addEventListener('click', search);
    $('q').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); search(); } });
    $('locate').addEventListener('click', locate);
    $('manual-open').addEventListener('click', () => { const open = $('manual').hidden; $('manual').hidden = !open; $('manual-open').setAttribute('aria-expanded', String(open)); if (open) $('m-lat').focus(); });
    $('m-add').addEventListener('click', manualAdd);
    ['m-lat', 'm-lon', 'm-name'].forEach(i => $(i).addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); manualAdd(); } }));
    $('add-open').addEventListener('click', openAdd);
    $('add-close').addEventListener('click', closeAdd);
    $('prev-day').addEventListener('click', () => goDay(PT.addDays(shown(), -1)));
    $('next-day').addEventListener('click', () => goDay(PT.addDays(shown(), 1)));
    $('day').addEventListener('change', () => { if ($('day').value) goDay($('day').value); else $('day').value = shown(); });
    $('to-today2').addEventListener('click', () => goDay(today()));
    $('change-place').addEventListener('click', () => { $('place').scrollIntoView({ behavior: 'smooth', block: 'start' }); $('place').focus({ preventScroll: true }); });
    $('copy-day').addEventListener('click', () => copyText(dayText(place(), shown()), 'day-msg', 'Copied the times. Paste them into a message or note.'));
    if (navigator.share) $('share-day').hidden = false;
    $('share-day').addEventListener('click', () => { navigator.share({ title: 'Prayer times', text: dayText(place(), shown()) }).catch(() => {}); });
    $('email-day').addEventListener('click', () => {
        const p = place(), d = shown();
        location.href = 'mailto:?subject=' + encodeURIComponent('Prayer times for ' + p.name + ', ' + longDate(d)) + '&body=' + encodeURIComponent(dayText(p, d));
    });
    $('compass').addEventListener('click', toggleCompass);
    $('method').addEventListener('change', () => change(p => { p.method = $('method').value; }));
    $('asr').addEventListener('change', () => change(p => { p.asr = $('asr').value; }));
    $('highlat').addEventListener('change', () => change(p => { p.highLat = $('highlat').value; }));
    ['c-fajr', 'c-isha', 'c-ishamin'].forEach(i => $(i).addEventListener('change', setCustom));
    $('c-ishamin-on').addEventListener('change', () => { $('c-ishamin-wrap').hidden = !$('c-ishamin-on').checked; $('c-isha').disabled = $('c-ishamin-on').checked; setCustom(); });
    $('adj-reset').addEventListener('click', () => {
        const p = place(), before = Object.assign({}, p.adj);
        change(q => { PT.PRAYERS.forEach(k => { q.adj[k] = 0; }); });
        message('day-msg', 'Minute adjustments set to 0.', () => change(q => { q.adj = before; }));
    });
    $('clock').addEventListener('change', () => { state.clock = $('clock').value; save(); render(); });
    $('hijri-adj').addEventListener('change', () => { state.hijriAdj = Number($('hijri-adj').value) || 0; save(); render(); });
    $('prev-month').addEventListener('click', () => { const v = curMonth(); monthView = v.m === 1 ? { y: v.y - 1, m: 12 } : { y: v.y, m: v.m - 1 }; message('month-msg', ''); renderMonth(); });
    $('next-month').addEventListener('click', () => { const v = curMonth(); monthView = v.m === 12 ? { y: v.y + 1, m: 1 } : { y: v.y, m: v.m + 1 }; message('month-msg', ''); renderMonth(); });
    $('print-month').addEventListener('click', () => { document.body.classList.add('print-month'); window.print(); });
    window.addEventListener('afterprint', () => document.body.classList.remove('print-month'));
    $('copy-month').addEventListener('click', () => copyText(monthText(), 'month-msg', 'Copied the month timetable.'));
    $('ics-month').addEventListener('click', downloadIcs);
    window.addEventListener('storage', e => { if (e.key === KEY) { state = load(); render(); } });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });

    buildDial(); fillMethods(); fillZones(); render();
    lastToday = state.places.length ? today() : '';
    setInterval(tick, 15000);
    window.__ptTest = { get state() { return state; }, render, tick };

    if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
