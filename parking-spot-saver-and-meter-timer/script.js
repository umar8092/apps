// Parking Spot Saver and Meter Timer: the page. The logic lives in core.js (window.Park).
(function () {
    'use strict';
    const P = window.Park, SLUG = 'parking-spot-saver-and-meter-timer', KEY = SLUG + '.data', PHOTO = SLUG + '.photo.';
    const $ = id => document.getElementById(id);
    const TITLE = document.title, LOCALE = undefined;
    const now = () => Date.now();

    let data = P.restore(null), photos = {}, canSave = true, undo = null;
    // the form: what is being typed now
    const form = { editing: null, loc: null, photo: undefined, choice: 'none' };   // photo: undefined = unchanged (edit), null = none, string = new photo

    // ---------- saving ----------
    function load() {
        let raw = null;
        try {
            localStorage.setItem(SLUG + '.test', '1'); localStorage.removeItem(SLUG + '.test');
            const t = localStorage.getItem(KEY);
            if (t) { try { raw = JSON.parse(t); } catch (e) { raw = null; } }
        } catch (e) { canSave = false; }
        data = P.restore(raw);
        data.spots.forEach(s => {
            if (!s.hasPhoto) return;
            let p = null;
            try { p = localStorage.getItem(PHOTO + s.id); } catch (e) { /* blocked */ }
            if (typeof p === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(p)) photos[s.id] = p; else s.hasPhoto = false;
        });
        try {   // photos of spots that no longer exist
            Object.keys(localStorage).filter(k => k.startsWith(PHOTO) && !data.spots.some(s => PHOTO + s.id === k)).forEach(k => localStorage.removeItem(k));
        } catch (e) { /* blocked */ }
        $('storage-warn').hidden = canSave;
    }
    function save() {
        if (!canSave) return;
        try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { $('storage-warn').hidden = false; }
    }
    function savePhoto(id, url) {
        try {
            if (url) localStorage.setItem(PHOTO + id, url); else localStorage.removeItem(PHOTO + id);
            return true;
        } catch (e) { return false; }
    }

    // ---------- small helpers ----------
    function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
    function btn(cls, text, fn) { const b = el('button', cls, text); b.type = 'button'; b.addEventListener('click', fn); return b; }
    function msg(box, text, undoFn) {
        const m = $(box); m.textContent = '';
        if (!text) return;
        m.appendChild(el('span', '', text));
        if (undoFn) m.appendChild(btn('link', 'Undo', undoFn));
    }
    function announce(t) { const a = $('announce'); a.textContent = ''; setTimeout(() => { a.textContent = t; }, 50); }
    function accText(acc) { return 'about ' + P.fmtMetres(Math.max(5, acc)); }

    // ---------- sound, vibration, notification ----------
    let audio = null;
    function unlockAudio() {
        if (audio) { if (audio.state === 'suspended') audio.resume().catch(() => {}); return; }
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) try { audio = new AC(); } catch (e) { audio = null; }
    }
    function beep(times) {
        unlockAudio();
        if (!audio) return;
        const t0 = audio.currentTime + 0.05;
        for (let i = 0; i < times; i++) {
            const o = audio.createOscillator(), g = audio.createGain(), t = t0 + i * 0.32;
            o.type = 'square'; o.frequency.value = i % 2 ? 990 : 1320;
            g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
            o.connect(g).connect(audio.destination); o.start(t); o.stop(t + 0.26);
        }
    }
    function ring(spot, kind) {
        const text = kind === 'end' ? 'Paid parking time is up: ' + spot.car + '.' : 'Paid parking ends in ' + spot.warnMin + ' min: ' + spot.car + '.';
        if (data.settings.sound) beep(kind === 'end' ? 9 : 6);
        if (data.settings.vibrate && navigator.vibrate) try { navigator.vibrate([400, 150, 400, 150, 400]); } catch (e) { /* not allowed */ }
        if (data.settings.notify && 'Notification' in window && Notification.permission === 'granted') {
            const opts = { body: spot.note || 'Open the app to add time or find your car.', icon: 'icons/icon-192.png', tag: SLUG + '-' + spot.id };
            const show = () => { try { new Notification(text, opts); } catch (e) { /* phones need the service worker */ } };
            if (navigator.serviceWorker && navigator.serviceWorker.getRegistration) {
                navigator.serviceWorker.getRegistration().then(r => r ? r.showNotification(text, opts) : show()).catch(show);
            } else show();
        }
        announce(text);
    }

    // ---------- the list of parked cars ----------
    const boxes = {};
    function renderList() {
        const list = $('list'); list.textContent = '';
        Object.keys(boxes).forEach(k => delete boxes[k]);
        $('app').classList.toggle('empty', !data.spots.length);
        $('cars-empty').hidden = data.spots.length > 0;
        $('cars-h').textContent = data.spots.length > 1 ? 'Where you parked (' + data.spots.length + ' cars)' : 'Where you parked';
        data.spots.forEach(s => list.appendChild(buildBox(s)));
        tick();
    }
    function buildBox(s) {
        const li = el('li', 'spot'); li.dataset.id = s.id;
        const head = el('div', 'spot-head');
        const h = el('h3', 'car-name', s.car), badge = el('span', 'badge');
        head.append(h, badge); li.appendChild(head);
        const big = el('p', 'big'), bar = el('div', 'bar'), fill = el('i'), line = el('p', 'line'), parked = el('p', 'parked');
        bar.appendChild(fill); bar.setAttribute('aria-hidden', 'true');
        li.append(big, bar, line, parked);
        if (s.note) { const n = el('p', 'note'); n.appendChild(el('span', 'note-k', 'Where: ')); n.appendChild(document.createTextNode(s.note)); li.appendChild(n); }
        if (photos[s.id]) {
            const pb = btn('photo-btn', '', () => { const big2 = pb.classList.toggle('big'); pb.setAttribute('aria-expanded', big2 ? 'true' : 'false'); });
            pb.setAttribute('aria-label', 'Photo of where ' + s.car + ' is parked. Tap to see it bigger or smaller.'); pb.setAttribute('aria-expanded', 'false');
            const img = el('img'); img.src = photos[s.id]; img.alt = ''; pb.appendChild(img); li.appendChild(pb);
        }
        li.appendChild(el('p', 'locline', s.loc ? 'Location saved (' + accText(s.loc.acc) + ').' : 'No location saved. Use the note' + (photos[s.id] ? ' and photo.' : ' to find it.')));
        const acts = el('div', 'acts');
        const far = el('p', 'far-out'); far.setAttribute('aria-live', 'polite');
        if (s.loc) {
            const a = el('a', 'primary walk', 'Walk back in Maps');
            a.href = P.mapsUrl(s.loc); a.target = '_blank'; a.rel = 'noopener';
            acts.appendChild(a);
            acts.appendChild(btn('secondary', 'How far is my car?', () => howFar(s.id, far)));
            acts.appendChild(far);
        }
        if (s.endAt) {
            const ext = el('div', 'row-btns three');
            [[15, '+15 min'], [30, '+30 min'], [60, '+1 hour']].forEach(([m, t]) => ext.appendChild(btn('secondary', t, () => addTime(s.id, m))));
            ext.setAttribute('role', 'group'); ext.setAttribute('aria-label', 'Add paid time to ' + s.car);
            acts.appendChild(ext);
            acts.appendChild(btn('secondary', 'Add reminder to calendar', () => calendar(s.id)));
        } else {
            acts.appendChild(btn('secondary', 'Set paid time', () => startEdit(s.id, true)));
        }
        const two = el('div', 'row-btns two');
        two.append(btn('secondary', 'Copy or share', () => share(s.id)), btn('secondary', 'Change', () => startEdit(s.id)));
        acts.appendChild(two);
        acts.appendChild(btn('secondary clear', "I'm back, clear this spot", () => clearSpot(s.id)));
        const m = el('div', 'msg'); m.id = 'msg-' + s.id; m.setAttribute('role', 'status'); m.setAttribute('aria-live', 'polite');
        acts.appendChild(m);
        li.appendChild(acts);
        boxes[s.id] = { li, badge, big, bar, fill, line, parked };
        return li;
    }

    const BADGE = { free: 'No time limit', ok: 'Paid', soon: 'Ending soon', over: 'Time is up' };
    let lastTitle = '';
    function tick() {
        const t = now();
        let changed = false, worst = null;
        data.spots = data.spots.map(s => {
            const r = P.dueAlert(s, t);
            if (r.spot !== s) changed = true;
            if (r.alert) ring(r.spot, r.alert);
            return r.spot;
        });
        if (changed) save();
        data.spots.forEach(s => {
            const b = boxes[s.id]; if (!b) return;
            const st = P.statusText(s, t, LOCALE);
            b.li.className = 'spot st-' + st.st;
            b.badge.textContent = BADGE[st.st];
            b.big.textContent = st.big;
            b.line.textContent = st.line;
            b.bar.hidden = !s.endAt;
            b.fill.style.width = (P.used(s, t) * 100).toFixed(1) + '%';
            b.parked.textContent = 'Parked ' + P.fmtAt(s.parkedAt, t, LOCALE) + (st.st === 'free' ? '' : ' (' + P.fmtSpan(t - s.parkedAt) + ' ago)');
            if (st.st === 'over' && (!worst || worst.st !== 'over')) worst = { st: 'over', s };
            else if (st.st === 'soon' && !worst) worst = { st: 'soon', s, left: s.endAt - t };
        });
        const title = !worst ? TITLE : worst.st === 'over' ? 'Time is up: ' + worst.s.car + ' · Parking' : P.fmtSpan(worst.left) + ' left: ' + worst.s.car + ' · Parking';
        if (title !== lastTitle) { document.title = title; lastTitle = title; }
        paidText();
    }

    // ---------- actions on a parked car ----------
    function find(id) { return data.spots.find(s => s.id === id); }
    function replace(spot) { data.spots = data.spots.map(s => s.id === spot.id ? spot : s); }
    function addTime(id, mins) {
        const s = find(id); if (!s) return;
        const t = now(), wasOver = s.endAt <= t, before = s.endAt;
        const n = P.extend(s, t, mins * P.MIN);
        replace(n); save(); renderList();
        const capped = n.endAt - (wasOver ? t : before) < mins * P.MIN;
        msg('msg-' + id, 'Added ' + P.fmtSpan(mins * P.MIN) + (wasOver ? ' from now' : '') + '. Paid until ' + P.fmtWhen(n.endAt, t, LOCALE) + '.' + (capped ? ' (30 days is the most.)' : ''), () => {
            replace(s); save(); renderList(); msg('msg-' + id, 'Added time taken back.');
        });
    }
    function howFar(id, out) {
        const s = find(id); if (!s || !s.loc) return;
        if (!navigator.geolocation) { out.textContent = 'This browser cannot get your location.'; return; }
        out.textContent = 'Finding where you are now…';
        navigator.geolocation.getCurrentPosition(p => {
            const s2 = find(id); if (!s2) return;
            out.textContent = P.farText({ lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy }, s2.loc);
        }, e => { out.textContent = geoError(e); }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
    }
    function calendar(id) {
        const s = find(id); if (!s || !s.endAt) return;
        try {
            const blob = new Blob([P.ics(s, now())], { type: 'text/calendar;charset=utf-8' });
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'parking-ends-' + s.car.replace(/[^\w-]+/g, '-').toLowerCase() + '.ics';
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(a.href), 30000);
            msg('msg-' + id, 'Calendar file made. Open it and press Add, so your phone reminds you ' + (s.warnMin ? s.warnMin + ' min before ' : 'at ') + P.fmtWhen(s.endAt, now(), LOCALE) + '.');
        } catch (e) { msg('msg-' + id, 'Could not make the calendar file in this browser.'); }
    }
    function share(id) {
        const s = find(id); if (!s) return;
        const text = P.shareText(s, now(), LOCALE);
        const copy = () => {
            if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => msg('msg-' + id, 'Copied. Paste it into a message.'), () => showText(id, text));
            else showText(id, text);
        };
        if (navigator.share && matchMedia('(pointer: coarse)').matches) navigator.share({ title: 'Where ' + s.car + ' is parked', text }).catch(e => { if (!e || e.name !== 'AbortError') copy(); });
        else copy();
    }
    function showText(id, text) {
        const m = $('msg-' + id); m.textContent = '';
        m.appendChild(el('span', '', 'Copy this text:'));
        const ta = el('textarea', 'copy-box'); ta.value = text; ta.readOnly = true; ta.rows = 4; m.appendChild(ta); ta.select();
    }
    function clearSpot(id) {
        const i = data.spots.findIndex(s => s.id === id); if (i < 0) return;
        const s = data.spots[i], ph = photos[s.id];
        data.spots.splice(i, 1); delete photos[s.id]; savePhoto(s.id, null);
        if (form.editing === id) resetForm();
        save(); renderList();
        undo = { s, ph, i };
        msg('list-msg', 'Cleared ' + s.car + '. Welcome back!', () => {
            if (!undo || data.spots.length >= P.MAX_SPOTS) return;
            data.spots.splice(Math.min(undo.i, data.spots.length), 0, undo.s);
            if (undo.ph) { photos[undo.s.id] = undo.ph; savePhoto(undo.s.id, undo.ph); }
            undo = null; save(); renderList(); msg('list-msg', 'Spot is back.');
        });
    }

    // ---------- the form ----------
    function setChoice(v) {
        form.choice = v;
        document.querySelectorAll('#presets .preset').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === v ? 'true' : 'false'));
        $('other-box').hidden = v !== 'other';
        $('until-box').hidden = v !== 'until';
        $('save-err').textContent = '';
        paidText();
    }
    function customVals() { return { days: $('len-d').value, hours: $('len-h').value, mins: $('len-m').value, until: $('until').value }; }
    function paidText() {
        const t = now(), out = $('paid-text'), v = form.choice;
        if (v === 'keep') { const s = find(form.editing); out.textContent = s && s.endAt ? 'Stays as it is: paid until ' + P.fmtWhen(s.endAt, t, LOCALE) + '.' : 'Stays as it is: no time limit.'; return; }
        if (v === 'none') { out.textContent = 'No time limit: the app shows how long you have been parked.'; return; }
        const c = customVals();
        if (v === 'other' && !c.days.trim() && !c.hours.trim() && !c.mins.trim()) { out.textContent = 'Type the days, hours and minutes you paid for (up to 30 days).'; return; }
        if (v === 'until' && !c.until) { out.textContent = 'Pick the time on your ticket. A time earlier than now means tomorrow.'; return; }
        const r = P.paidEnd(t, v, c);
        out.textContent = r.error ? r.error : 'Paid until ' + P.fmtWhen(r.endAt, t, LOCALE) + ' (' + P.fmtSpan(r.endAt - t + 30000) + ' from now).';
    }
    function locStatus(text) { $('loc-status').textContent = text; }
    function showLoc() {
        $('loc-clear').hidden = !form.loc;
        $('loc-btn').textContent = form.loc ? 'Update my location' : 'Add my location';
        if (!form.loc) { locStatus('Saves the exact spot, so “Walk back in Maps” can lead you to the car.'); return; }
        const a = form.loc.acc;
        locStatus(a > 100 ? 'Location added, but it is rough (' + accText(a) + '). Indoors or underground the signal is weak, so write the level and bay in the note too.'
            : 'Location added (accurate to ' + accText(a) + ').');
    }
    function geoError(e) {
        if (e && e.code === 1) return 'Location is blocked for this page. Allow it in your browser\'s site settings, or use the note and a photo.';
        if (e && e.code === 3) return 'Getting your location took too long. Try again near an exit or in the open, or use the note and a photo.';
        return 'Your location is not available here (often underground). Use the note and a photo; you can add the location later with Change.';
    }
    function getLocation() {
        if (!navigator.geolocation) { locStatus('This browser cannot get your location. Use the note and a photo.'); return; }
        const b = $('loc-btn'); b.disabled = true; locStatus('Finding your location… (allow it if your browser asks)');
        navigator.geolocation.getCurrentPosition(p => {
            b.disabled = false;
            form.loc = P.validLoc({ lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy, at: now() });
            showLoc();
        }, e => { b.disabled = false; showLoc(); locStatus(geoError(e)); }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
    }
    function currentPhoto() { return form.photo === undefined ? (form.editing ? photos[form.editing] || null : null) : form.photo; }
    function showPhoto() {
        const p = currentPhoto();
        $('photo-prev').hidden = !p; $('photo-add').hidden = !!p;
        if (p) $('photo-img').src = p; else $('photo-img').removeAttribute('src');
    }
    function readPhoto(file) {
        $('photo-err').textContent = '';
        if (!file) return;
        if (file.type && !/^image\//.test(file.type)) { $('photo-err').textContent = 'That file is not a photo. Pick a photo or take a new one.'; return; }
        const url = URL.createObjectURL(file), img = new Image();
        img.onload = () => {
            const k = Math.min(1, 1024 / Math.max(img.naturalWidth, img.naturalHeight));
            const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
            c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
            URL.revokeObjectURL(url);
            form.photo = c.toDataURL('image/jpeg', 0.72);
            showPhoto();
        };
        img.onerror = () => { URL.revokeObjectURL(url); $('photo-err').textContent = 'This browser cannot open that photo. Try another, or take a new one.'; };
        img.src = url;
    }
    function resetForm() {
        form.editing = null; form.loc = null; form.photo = undefined;
        $('note').value = ''; $('car').value = ''; $('car-wrap').hidden = true; $('car-add').hidden = false;
        $('len-d').value = ''; $('len-h').value = ''; $('len-m').value = ''; $('until').value = '';
        $('photo-in').value = ''; $('photo-err').textContent = ''; $('save-err').textContent = '';
        $('save-h').textContent = data.spots.length ? 'Save another car\'s spot' : 'Save my parking spot';
        $('save-btn').textContent = 'Save my spot'; $('cancel-edit').hidden = true;
        document.querySelector('.preset[data-v="keep"]').hidden = true;
        $('warn').value = String(data.settings.warnMin);
        setChoice(data.settings.lastChoice || 'none');
        showLoc(); showPhoto();
    }
    function startEdit(id, paidOnly) {
        const s = find(id); if (!s) return;
        resetForm();
        form.editing = id; form.loc = s.loc;
        $('note').value = s.note; $('car').value = s.car; $('car-wrap').hidden = false; $('car-add').hidden = true;
        $('save-h').textContent = 'Change: ' + s.car;
        $('save-btn').textContent = 'Save changes'; $('cancel-edit').hidden = false;
        document.querySelector('.preset[data-v="keep"]').hidden = false;
        $('warn').value = String(s.warnMin);
        setChoice('keep'); showLoc(); showPhoto();
        msg('save-msg', '');
        $('save').scrollIntoView({ behavior: 'smooth', block: 'start' });
        (paidOnly ? document.querySelector('.preset[data-v="7200000"]') : $('note')).focus({ preventScroll: true });
    }
    function submit(e) {
        e.preventDefault();
        unlockAudio();
        const t = now(), err = $('save-err'); err.textContent = '';
        const editing = form.editing ? find(form.editing) : null;
        if (!editing && data.spots.length >= P.MAX_SPOTS) { err.textContent = 'You can keep up to ' + P.MAX_SPOTS + ' cars. Clear one you are back at first.'; return; }
        let paid = { keep: true };
        if (form.choice !== 'keep') {
            paid = P.paidEnd(t, form.choice, customVals());
            if (paid.error) { err.textContent = paid.error; (form.choice === 'until' ? $('until') : $('len-h')).focus(); return; }
        }
        const warnMin = +$('warn').value;
        const note = P.cleanText($('note').value, P.MAX_NOTE);
        const car = P.cleanText($('car').value, P.MAX_CAR) || (editing ? editing.car : P.nextCarName(data.spots));
        let spot;
        if (editing) {
            spot = Object.assign({}, editing, { car, note, loc: form.loc, warnMin });
            if (!paid.keep) Object.assign(spot, { endAt: paid.endAt, paidFrom: t, warned: false, ended: false });
            else if (warnMin !== editing.warnMin) spot.warned = false;
        } else {
            spot = { id: 's' + data.nextId++, car, note, loc: form.loc, hasPhoto: false, parkedAt: t, endAt: paid.endAt, paidFrom: t, warnMin, warned: false, ended: false };
        }
        const ph = currentPhoto();
        let photoMsg = '';
        if (ph) { photos[spot.id] = ph; spot.hasPhoto = savePhoto(spot.id, ph); if (!spot.hasPhoto && canSave) photoMsg = ' The photo is too big to keep on this device, so it shows only until you close the page.'; }
        else { delete photos[spot.id]; spot.hasPhoto = false; savePhoto(spot.id, null); }
        if (spot.endAt) spot = P.dueAlert(spot, t).spot;   // a time that already passed does not ring at once
        if (editing) replace(spot); else data.spots.unshift(spot);
        data.settings.warnMin = warnMin;
        if (form.choice !== 'keep') data.settings.lastChoice = ['other', 'until'].includes(form.choice) ? data.settings.lastChoice : form.choice;
        save();
        const wasEditing = !!editing;
        resetForm(); renderList();
        const what = spot.endAt ? 'Paid until ' + P.fmtWhen(spot.endAt, t, LOCALE) + '.' : 'No time limit.';
        msg('save-msg', (wasEditing ? 'Changes saved for ' : 'Saved ') + spot.car + '. ' + what + photoMsg);
        msg('msg-' + spot.id, (wasEditing ? 'Changes saved. ' : 'Spot saved. ') + what + photoMsg);
        if (matchMedia('(max-width: 899px)').matches) $('cars').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // ---------- settings ----------
    function showSettings() {
        $('s-sound').checked = data.settings.sound; $('s-vibrate').checked = data.settings.vibrate; $('s-notify').checked = data.settings.notify;
    }
    function bind() {
        $('save-form').addEventListener('submit', submit);
        $('cancel-edit').addEventListener('click', () => { resetForm(); msg('save-msg', 'Nothing changed.'); });
        document.querySelectorAll('#presets .preset').forEach(b => b.addEventListener('click', () => {
            setChoice(b.dataset.v);
            if (b.dataset.v === 'other') $('len-h').focus(); else if (b.dataset.v === 'until') $('until').focus();
        }));
        ['len-d', 'len-h', 'len-m', 'until'].forEach(id => $(id).addEventListener('input', () => { $('save-err').textContent = ''; paidText(); }));
        $('loc-btn').addEventListener('click', getLocation);
        $('loc-clear').addEventListener('click', () => { form.loc = null; showLoc(); locStatus('Location removed. Press Add my location to add it again.'); });
        $('photo-add').addEventListener('click', () => $('photo-in').click());
        $('photo-change').addEventListener('click', () => $('photo-in').click());
        $('photo-remove').addEventListener('click', () => { form.photo = null; $('photo-in').value = ''; showPhoto(); });
        $('photo-in').addEventListener('change', e => readPhoto(e.target.files && e.target.files[0]));
        $('car-add').addEventListener('click', () => { $('car-wrap').hidden = false; $('car-add').hidden = true; $('car').focus(); });
        $('s-sound').addEventListener('change', e => { data.settings.sound = e.target.checked; save(); });
        $('s-vibrate').addEventListener('change', e => { data.settings.vibrate = e.target.checked; save(); });
        $('s-notify').addEventListener('change', e => {
            if (!e.target.checked) { data.settings.notify = false; save(); msg('set-msg', ''); return; }
            if (!('Notification' in window)) { e.target.checked = false; msg('set-msg', 'This browser cannot show notifications from a web page. On an iPhone, add the app to your home screen first.'); return; }
            Notification.requestPermission().then(p => {
                data.settings.notify = p === 'granted'; e.target.checked = data.settings.notify; save();
                msg('set-msg', p === 'granted' ? 'Notifications are on while this page is open.' : 'Notifications are blocked. Allow them in your browser\'s site settings.');
            }).catch(() => { e.target.checked = false; });
        });
        $('test-sound').addEventListener('click', () => { beep(6); if (navigator.vibrate) try { navigator.vibrate(300); } catch (e) { /* ignore */ } });
        ['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, unlockAudio, { passive: true }));
        document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
    }

    load();
    showSettings();
    bind();
    resetForm();
    renderList();
    setInterval(tick, 1000);
    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
