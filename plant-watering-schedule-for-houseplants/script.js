// Plant Watering Schedule for Houseplants: the page. The logic lives in core.js.
(function () {
    'use strict';
    const C = window.PlantCore;
    const KEY = 'plant-watering-schedule-for-houseplants.state';
    const URL_SELF = 'https://umar8092.github.io/apps/plant-watering-schedule-for-houseplants/';
    const $ = id => document.getElementById(id);
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

    let canSave = true, state, today = C.todayIso();
    let editing = null;          // id of the plant in the form, or null for a new one
    let formOpen = false;
    let filter = 'all';

    // ---------- saving ----------
    function load() {
        let raw = null;
        try { raw = localStorage.getItem(KEY); } catch (e) { canSave = false; }
        if (raw) {
            try { const s = C.validate(JSON.parse(raw)); if (s) return s; } catch (e) { /* damaged: start fresh */ }
            setTimeout(() => show('set-msg', 'The saved plants could not be read, so the app started fresh.'), 0);
        }
        return C.emptyState();
    }
    function save() {
        try { localStorage.setItem(KEY, JSON.stringify(state)); canSave = true; } catch (e) { canSave = false; }
        $('storage-warn').hidden = canSave;
    }
    const snapshot = () => JSON.stringify(state);
    function restoreSnap(snap) { state = C.validate(JSON.parse(snap)) || state; closeForm(); fillTrip(); commit(); }
    function commit() { save(); render(); }

    // ---------- messages with Undo ----------
    const MSGS = ['list-msg', 'form-msg', 'set-msg', 'trip-msg'];
    const timers = {};
    function show(id, text, undoSnap) {
        const box = $(id); if (!box) return;
        MSGS.forEach(o => { if (o !== id) clearMsg(o); });
        box.textContent = ''; box.classList.add('show');
        box.appendChild(el('span', null, text));
        if (undoSnap) {
            const b = el('button', 'undo', 'Undo'); b.type = 'button';
            b.addEventListener('click', () => { restoreSnap(undoSnap); show(id, 'Undone.'); });
            box.appendChild(b);
        }
        clearTimeout(timers[id]); timers[id] = setTimeout(() => clearMsg(id), undoSnap ? 15000 : 6000);
    }
    function clearMsg(id) { const b = $(id); if (b) { b.textContent = ''; b.classList.remove('show'); } }

    // ---------- helpers ----------
    const plant = id => state.plants.find(p => p.id === id);
    const replace = (id, np) => { state.plants = state.plants.map(p => (p.id === id ? np : p)); };
    function copyText(text) {
        if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).then(() => true, () => fallbackCopy(text));
        return Promise.resolve(fallbackCopy(text));
    }
    function fallbackCopy(text) {
        const t = document.createElement('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
        document.body.appendChild(t); t.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; } t.remove(); return ok;
    }
    function download(name, type, body) {
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([body], { type })); a.download = name;
        document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    }
    function mailto(subject, text) {
        let body = text;
        if (body.length > 1800) body = body.slice(0, 1800) + '\n...\n(The list is too long for an email link. Use "Copy" and paste it.)';
        return 'mailto:?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
    }
    function flash(id) {
        const t = document.querySelector('li.box[data-id="' + id + '"]');
        if (t) { t.scrollIntoView({ block: 'center', behavior: 'smooth' }); t.classList.add('flash'); setTimeout(() => t.classList.remove('flash'), 1600); }
    }

    // ---------- the list ----------
    function render() {
        today = C.todayIso();
        const season = state.season, all = state.plants, active = C.active(all);
        renderSummary();
        // season switch only when it changes something
        const seasonOn = C.usesSeason(all) || season === 'winter';
        $('season').hidden = !seasonOn;
        $('s-summer').checked = season === 'summer'; $('s-winter').checked = season === 'winter';
        $('season-hint').textContent = season === 'winter'
            ? 'Plants with a winter number now use it' + (active.some(p => p.feedEvery && p.feedPauseWinter) ? ', and paused plant food waits for spring.' : '.')
            : 'Switch to "Autumn and winter" when the days get short and plants grow slowly.';
        // place filter: places in use, plus All
        const places = [...new Set(active.map(p => p.place).filter(Boolean))].sort((a, b) => a.localeCompare(b));
        const noPlace = active.some(p => !p.place);
        const showFilter = places.length >= 2 || (places.length === 1 && noPlace);
        if (!showFilter || (filter !== 'all' && filter !== '' && !places.includes(filter)) || (filter === '' && !noPlace)) filter = 'all';
        const pl = $('places'); pl.textContent = ''; pl.hidden = !showFilter;
        if (showFilter) {
            const opts = [['all', 'All', active.length]].concat(places.map(x => [x, x, active.filter(p => p.place === x).length]));
            if (noPlace) opts.push(['', 'No place set', active.filter(p => !p.place).length]);
            opts.forEach(([k, name, n]) => {
                const b = el('button', 'place', name + ' (' + n + ')'); b.type = 'button';
                b.setAttribute('aria-pressed', String(filter === k));
                b.addEventListener('click', () => { filter = k; render(); });
                pl.appendChild(b);
            });
        }
        const shown = all.filter(p => p.status !== 'active' || filter === 'all' || p.place === filter);
        const g = C.groups(shown, today, season);
        $('empty').hidden = all.length > 0;
        ['now', 'later', 'gone'].forEach(k => {
            const ul = $('l-' + k); ul.textContent = '';
            g[k].forEach(p => ul.appendChild(box(p)));
            $('g-' + k).hidden = !g[k].length;
        });
        $('gone-sum').textContent = 'Gone plants (' + g.gone.length + ')';
        // the form is always open while the list is empty
        if (!all.length) formOpen = true;
        $('form').hidden = !formOpen;
        $('open-form').hidden = formOpen;
        $('form-h').hidden = !formOpen;   // the button says it already
        $('cancel').hidden = !all.length && editing == null;
        $('app').classList.toggle('setup', !all.length);
        // places typed before are offered again
        const dl = $('place-list'); dl.textContent = '';
        [...new Set(all.map(p => p.place).filter(Boolean))].sort().forEach(x => { const o = document.createElement('option'); o.value = x; dl.appendChild(o); });
        // sharing
        const text = C.listText(all, today, season);
        $('share-tools').hidden = !active.length;
        $('list').hidden = !all.length;
        $('mail-all').href = mailto('My plant watering list', text || 'My plants');
        renderTrip();
    }

    function renderSummary() {
        const b = $('sum-body'); b.textContent = '';
        const season = state.season, active = C.active(state.plants);
        if (!active.length) {
            b.appendChild(el('p', 'sum-empty', state.plants.length
                ? 'No plants in your list: they are all under "Gone plants".'
                : 'No plants yet. Add your first plant and the app shows which plants need water today.'));
            return;
        }
        const g = C.groups(active, today, season);
        if (g.now.length) {
            b.appendChild(el('p', 'next-label', g.now.length === 1 ? 'Needs water today' : g.now.length + ' plants need water today'));
            b.appendChild(el('p', 'next', g.now.map(p => C.dueName(p, today, season)).join(', ')));
            if (g.now.length >= 2) {
                const all = el('button', 'primary water-all', 'I watered all ' + g.now.length); all.type = 'button'; all.id = 'water-all';
                all.addEventListener('click', waterAll);
                b.appendChild(all);
            }
        } else {
            b.appendChild(el('p', 'next ok', 'Nothing needs water today.'));
        }
        const nxt = g.later[0];
        if (nxt) {
            const d = C.nextWater(nxt, today, season);
            b.appendChild(el('p', 'next-left', 'Next: ' + nxt.name + ', ' + (C.diff(today, d) === 1 ? 'tomorrow, ' + C.shortDate(d, today) : C.shortDate(d, today) + ' (' + C.rel(today, d) + ')') + '.'));
        }
        const feed = active.filter(p => C.feedDue(p, today, season)).sort((x, y) => x.name.localeCompare(y.name));
        if (feed.length) b.appendChild(el('p', 'feed-due', 'Plant food today: ' + feed.map(p => p.name).join(', ')));
    }

    function box(p) {
        const season = state.season, gone = p.status !== 'active';
        const next = gone ? '' : C.nextWater(p, today, season), d = gone ? 0 : C.diff(today, next);
        const cls = gone ? 'gone' : d < 0 ? 'late' : d === 0 ? 'now' : 'later';
        const li = el('li', 'box ' + cls); li.dataset.id = p.id;
        const top = el('div', 'box-top');
        top.appendChild(el('h4', 'box-name', p.name));
        li.appendChild(top);
        li.appendChild(el('p', 'box-sub', C.subLine(p, today, season)));
        if (!gone) {
            li.appendChild(el('p', 'st ' + cls, C.waterLine(p, today, season)));
            const fl = C.feedLine(p, today, season);
            if (fl) li.appendChild(el('p', 'feed' + (C.feedDue(p, today, season) ? ' due' : ''), fl));
        } else li.appendChild(el('p', 'st done', 'Gone: died or given away'));
        if (p.note) li.appendChild(el('p', 'box-note', p.note));
        const btns = el('div', 'box-btns');
        const mini = (text, fn, label, extra) => { const b = el('button', 'mini' + (extra ? ' ' + extra : ''), text); b.type = 'button'; b.setAttribute('aria-label', label); b.addEventListener('click', fn); btns.appendChild(b); return b; };
        if (!gone) {
            mini('Watered', () => water(p.id), 'Watered: ' + p.name, 'strong');
            if (d <= 0 && p.last) mini('Still wet', () => wet(p.id), 'Soil still wet, ask tomorrow: ' + p.name);
            if (C.feedOn(p) && !C.feedPaused(p, season)) mini('Fed', () => feed(p.id), 'Plant food given today: ' + p.name);
            mini('Edit', () => openForm(p.id), 'Edit ' + p.name);
        } else {
            mini('Bring back', () => setGone(p.id, false), 'Bring back ' + p.name, 'strong');
            mini('Delete', () => removePlant(p.id), 'Delete ' + p.name, 'bad');
        }
        li.appendChild(btns);
        return li;
    }

    function nextWords(p) {
        const d = C.nextWater(p, today, state.season);
        return C.diff(today, d) === 1 ? 'tomorrow, ' + C.shortDate(d, today) : C.shortDate(d, today) + ' (' + C.rel(today, d) + ')';
    }
    function water(id) {
        const p = plant(id); if (!p) return;
        if (p.last === today) { show('list-msg', p.name + ' is already marked watered today. Next: ' + nextWords(p) + '.'); return; }
        const before = snapshot();
        const np = C.watered(p, today); replace(id, np); commit();
        show('list-msg', p.name + ' watered. Next: ' + nextWords(np) + '.', before);
        flash(id);
    }
    function waterAll() {
        const g = C.groups(C.active(state.plants), today, state.season);
        if (!g.now.length) return;
        const before = snapshot(), names = g.now.map(p => p.name);
        g.now.forEach(p => replace(p.id, C.watered(p, today)));
        commit();
        show('list-msg', 'Watered ' + names.join(', ') + '.', before);
    }
    function wet(id) {
        const p = plant(id); if (!p) return;
        const before = snapshot();
        replace(id, C.stillWet(p, today, 1)); commit();
        show('list-msg', p.name + ': soil still wet, so it moves to tomorrow. Feel the soil again then.', before);
    }
    function feed(id) {
        const p = plant(id); if (!p) return;
        if (p.lastFed === today) { show('list-msg', p.name + ' is already marked fed today.'); return; }
        const before = snapshot();
        const np = C.fed(p, today); replace(id, np); commit();
        show('list-msg', p.name + ' fed. Next plant food: ' + C.shortDate(C.nextFeed(np, today), today) + '.', before);
    }
    function setGone(id, gone) {
        const p = plant(id); if (!p) return;
        const before = snapshot();
        replace(id, Object.assign({}, p, { status: gone ? 'gone' : 'active' }));
        if (editing === id) closeForm();
        commit();
        show('list-msg', gone ? p.name + ' moved to "Gone plants".' : p.name + ' is back in your list.', before);
        if (!gone) flash(id);
    }
    function removePlant(id) {
        const p = plant(id); if (!p) return;
        const before = snapshot();
        state.plants = state.plants.filter(x => x.id !== id);
        if (editing === id) closeForm();
        commit();
        show('list-msg', 'Deleted ' + p.name + '.', before);
    }

    // ---------- the form ----------
    const EVERY = [...$('f-every').options].map(o => o.value), WINTER = [...$('f-winter').options].map(o => o.value), FEED = [...$('f-feed').options].map(o => o.value);
    function setSel(sel, custom, wrap, list, n, dflt) {
        const v = n ? String(n) : dflt;
        if (list.includes(v)) { $(sel).value = v; $(custom).value = ''; } else { $(sel).value = 'custom'; $(custom).value = v; }
        $(wrap).hidden = $(sel).value !== 'custom';
    }
    function showPart(part, on) { $('w-' + part).hidden = !on; $('o-' + part).hidden = on; }
    function clearErrors() {
        ['name', 'every', 'last', 'winter', 'feed', 'lastfed'].forEach(k => { $('e-' + k).textContent = ''; });
        document.querySelectorAll('#form [aria-invalid]').forEach(x => x.removeAttribute('aria-invalid'));
    }
    function openForm(id) {
        const p = id != null ? plant(id) : null;
        editing = p ? p.id : null; formOpen = true;
        clearErrors(); clearMsg('form-msg');
        $('f-name').value = p ? p.name : '';
        setSel('f-every', 'f-everydays', 'w-every', EVERY, p && p.every, '7');
        $('f-last').value = p ? p.last : today;
        setSel('f-winter', 'f-winterdays', 'w-winterdays', WINTER, p && p.winterEvery, '14');
        showPart('winter', !!(p && p.winterEvery));
        $('f-place').value = p ? p.place : (filter !== 'all' && filter ? filter : '');
        $('f-note').value = p ? p.note : '';
        showPart('more', !!(p && (p.place || p.note)) || (!p && !!$('f-place').value));
        setSel('f-feed', 'f-feeddays', 'w-feeddays', FEED, p && p.feedEvery, '28');
        $('f-lastfed').value = p ? p.lastFed : '';
        $('f-pause').checked = p ? (p.feedEvery ? p.feedPauseWinter : true) : true;
        showPart('feed', !!(p && p.feedEvery));
        $('form-h').textContent = p ? 'Edit ' + p.name : 'Add a plant';
        $('save').textContent = p ? 'Save changes' : 'Add this plant';
        $('cancel').textContent = p ? 'Cancel' : 'Done';
        $('edit-tools').hidden = !p;
        const avg = p ? C.averageGap(p) : 0;
        $('avg').hidden = !avg;
        $('avg').textContent = avg ? 'Your last waterings were about ' + (avg === 1 ? 'every day' : 'every ' + avg + ' days') + ' apart.' : '';
        render(); preview();
        if (p) { $('add').scrollIntoView({ block: 'start', behavior: 'smooth' }); setTimeout(() => $('f-name').focus({ preventScroll: true }), 300); }
    }
    function closeForm() {
        editing = null; formOpen = false;
        $('form-h').textContent = 'Add a plant'; $('save').textContent = 'Add this plant'; $('cancel').textContent = 'Done';
        $('edit-tools').hidden = true; $('avg').hidden = true; clearErrors();
    }
    function formData() {
        return {
            name: $('f-name').value, every: $('f-every').value, everyCustom: $('f-everydays').value, last: $('f-last').value,
            winterOn: !$('w-winter').hidden, winter: $('f-winter').value, winterCustom: $('f-winterdays').value,
            place: $('w-more').hidden ? (editing != null ? (plant(editing) || {}).place : '') : $('f-place').value,
            note: $('w-more').hidden ? (editing != null ? (plant(editing) || {}).note : '') : $('f-note').value,
            feedOn: !$('w-feed').hidden, feed: $('f-feed').value, feedCustom: $('f-feeddays').value, lastFed: $('f-lastfed').value, pauseWinter: $('f-pause').checked
        };
    }
    function preview() {
        const f = formData();
        $('h-last').textContent = f.last ? '' : 'Not sure: the plant will show as needing water today.';
        const r = C.readForm(Object.assign({}, f, { name: f.name.trim() || 'x' }), today, [], null);
        const pv = $('preview');
        if (!r.plant) { pv.textContent = ''; return; }
        const p = Object.assign({ snooze: '', history: [] }, r.plant);
        const ev = C.every(p, state.season), d = C.nextWater(p, today, state.season), dd = C.diff(today, d);
        const when = dd < 0 ? 'today (' + C.plural(-dd, 'day') + ' late)' : dd === 0 ? 'today' : dd === 1 ? 'tomorrow, ' + C.shortDate(d, today) : C.shortDate(d, today) + ' (' + C.rel(today, d) + ')';
        pv.textContent = 'Next water: ' + when + ', then ' + C.everyText(ev) + (state.season === 'winter' && p.winterEvery ? ' (winter)' : '') + '.';
    }
    function submit(e) {
        e.preventDefault();
        clearErrors();
        const r = C.readForm(formData(), today, state.plants, editing);
        if (r.errors) {
            const map = { name: 'f-name', every: 'f-everydays', last: 'f-last', winter: 'f-winterdays', feed: 'f-feeddays', lastFed: 'f-lastfed' };
            let first = null;
            Object.keys(r.errors).forEach(k => {
                const ek = k === 'lastFed' ? 'lastfed' : k;
                $('e-' + ek).textContent = r.errors[k];
                let inp = $(map[k]);
                if ((k === 'every' || k === 'winter' || k === 'feed') && inp.closest('.opt[hidden]')) inp = $('f-' + k);
                inp.setAttribute('aria-invalid', 'true'); if (!first) first = inp;
            });
            if (first) first.focus();
            return;
        }
        if (state.plants.length >= C.MAX_PLANTS && editing == null) { $('e-name').textContent = 'You have ' + C.MAX_PLANTS + ' plants, the most this app keeps. Delete gone plants first.'; return; }
        const before = snapshot(), np = r.plant;
        if (editing != null) {
            const old = plant(editing);
            const upd = Object.assign({}, old, np);
            if (np.last !== old.last) { upd.snooze = ''; upd.history = np.last ? old.history.filter(x => x !== old.last).concat([np.last]).sort() : old.history.filter(x => x !== old.last); }
            replace(editing, upd);
            const id = editing; closeForm(); commit();
            show('list-msg', 'Saved ' + upd.name + '.' + (r.warn ? ' ' + r.warn : ''), before);
            flash(id);
        } else {
            const id = state.nextId++;
            state.plants.push(Object.assign({ id, snooze: '', history: np.last ? [np.last] : [], status: 'active', added: today }, np));
            const keepPlace = $('w-more').hidden ? '' : $('f-place').value;
            commit();
            show('form-msg', 'Added ' + np.name + '. Next water: ' + nextWords(plant(id)) + '. Add the next plant, or tap Done.' + (r.warn ? ' ' + r.warn : ''), before);
            // ready for the next plant: same place, the rest fresh
            $('f-name').value = ''; $('f-note').value = ''; $('f-last').value = today;
            $('f-place').value = keepPlace;
            showPart('winter', false); showPart('feed', false); $('f-lastfed').value = '';
            preview();
            $('f-name').focus({ preventScroll: true });
        }
    }

    // ---------- going away ----------
    function fillTrip() {
        const t = state.trip || {};
        $('t-from').value = t.from || ''; $('t-to').value = t.to || ''; $('t-before').checked = t.beforeAll !== false;
    }
    let tripNow = null;
    function renderTrip() {
        const from = $('t-from').value, to = $('t-to').value, active = C.active(state.plants);
        $('trip-empty').hidden = !!active.length;
        $('trip-form').hidden = !active.length;
        $('e-trip').textContent = '';
        ['t-from', 't-to'].forEach(i => $(i).removeAttribute('aria-invalid'));
        tripNow = null;
        if (active.length && (from || to)) {
            const err = C.checkTrip(from, to, today);
            if (err && (from && (to || err.field === 'from'))) { $('e-trip').textContent = err.msg; $(err.field === 'from' ? 't-from' : 't-to').setAttribute('aria-invalid', 'true'); }
            if (!err) tripNow = C.tripText(state.plants, from, to, $('t-before').checked, today, state.season);
        }
        $('trip-out').hidden = !tripNow;
        $('trip-text').textContent = tripNow ? tripNow.text : '';
        if (tripNow) $('trip-mail').href = mailto('Watering my plants while I am away', tripNow.text);
    }
    function tripChanged() {
        state.trip = { from: $('t-from').value, to: $('t-to').value, beforeAll: $('t-before').checked };
        save(); renderTrip();
    }

    // ---------- wiring ----------
    function init() {
        state = load();
        fillTrip();
        $('form').addEventListener('submit', submit);
        $('form').addEventListener('input', preview);
        $('form').addEventListener('change', preview);
        $('open-form').addEventListener('click', () => { openForm(null); $('f-name').focus(); });
        $('cancel').addEventListener('click', () => { const was = editing; closeForm(); clearMsg('form-msg'); render(); if (was != null) flash(was); });
        $('f-every').addEventListener('change', () => { $('w-every').hidden = $('f-every').value !== 'custom'; if (!$('w-every').hidden) $('f-everydays').focus(); });
        $('f-winter').addEventListener('change', () => { $('w-winterdays').hidden = $('f-winter').value !== 'custom'; if (!$('w-winterdays').hidden) $('f-winterdays').focus(); });
        $('f-feed').addEventListener('change', () => { $('w-feeddays').hidden = $('f-feed').value !== 'custom'; if (!$('w-feeddays').hidden) $('f-feeddays').focus(); });
        $('quick-last').addEventListener('click', e => {
            const b = e.target.closest('.chip'); if (!b) return;
            $('f-last').value = b.dataset.days === '' ? '' : C.addDays(today, -Number(b.dataset.days));
            $('e-last').textContent = ''; $('f-last').removeAttribute('aria-invalid');
            preview();
        });
        $('o-winter').addEventListener('click', () => { showPart('winter', true); $('f-winter').focus(); preview(); });
        $('x-winter').addEventListener('click', () => { showPart('winter', false); $('e-winter').textContent = ''; $('o-winter').focus(); preview(); });
        $('o-more').addEventListener('click', () => { showPart('more', true); $('f-place').focus(); });
        $('o-feed').addEventListener('click', () => { showPart('feed', true); $('f-feed').focus(); });
        $('x-feed').addEventListener('click', () => { showPart('feed', false); $('e-feed').textContent = ''; $('e-lastfed').textContent = ''; $('o-feed').focus(); });
        $('gone').addEventListener('click', () => { if (editing != null) setGone(editing, true); });
        $('del').addEventListener('click', () => { if (editing != null) removePlant(editing); });
        $('season').addEventListener('change', e => {
            if (e.target.name !== 'season') return;
            const before = snapshot(); state.season = e.target.value === 'winter' ? 'winter' : 'summer'; commit(); preview();
            show('list-msg', state.season === 'winter' ? 'Autumn and winter watering is on.' : 'Spring and summer watering is on.', before);
        });
        ['t-from', 't-to', 't-before'].forEach(i => { $(i).addEventListener('change', tripChanged); $(i).addEventListener('input', tripChanged); });
        $('trip-copy').addEventListener('click', () => { if (tripNow) copyText(tripNow.text).then(ok => show('trip-msg', ok ? 'Copied. Paste it into a message for your plant-sitter.' : 'Could not copy. Select the list and copy it yourself.')); });
        $('trip-print').addEventListener('click', () => { if (!tripNow) return; document.body.classList.add('print-trip'); window.print(); setTimeout(() => document.body.classList.remove('print-trip'), 500); });
        $('copy-all').addEventListener('click', () => {
            const t = C.listText(state.plants, today, state.season); if (!t) return;
            copyText(t).then(ok => show('set-msg', ok ? 'Copied your plant list.' : 'Could not copy. Try "Email my plant list" instead.'));
        });
        $('cal').addEventListener('click', () => {
            const t = $('r-time').value || '09:00';
            download('plant-check-reminder.ics', 'text/calendar', C.icsDaily(t, today, URL_SELF));
            show('set-msg', 'Saved a calendar file with a reminder every day at ' + t + '. Open it to add it to your calendar.');
        });
        $('backup').addEventListener('click', () => {
            download('plant-watering-backup-' + today + '.json', 'application/json', JSON.stringify(state, null, 1));
            show('set-msg', 'Saved a backup file with ' + C.plural(state.plants.length, 'plant') + '.');
        });
        $('restore').addEventListener('click', () => $('restore-file').click());
        $('restore-file').addEventListener('change', e => {
            const f = e.target.files && e.target.files[0]; e.target.value = '';
            if (!f) return;
            if (f.size > 2e6) { show('set-msg', 'That file is too big to be a backup from this app.'); return; }
            const r = new FileReader();
            r.onload = () => {
                let s = null; try { s = C.validate(JSON.parse(String(r.result))); } catch (err) { s = null; }
                if (!s) { show('set-msg', 'That file is not a backup from this app. Nothing was changed.'); return; }
                const before = snapshot(); state = s; closeForm(); fillTrip(); commit();
                show('set-msg', 'Restored ' + C.plural(s.plants.length, 'plant') + '.', before);
            };
            r.onerror = () => show('set-msg', 'Could not read that file.');
            r.readAsText(f);
        });
        $('wipe').addEventListener('click', () => {
            if (!state.plants.length && !state.trip) { show('set-msg', 'There is nothing to delete.'); return; }
            const before = snapshot(); state = C.emptyState(); closeForm(); fillTrip(); commit();
            show('set-msg', 'Deleted everything.', before);
        });
        // a new day while the page stays open
        setInterval(() => { if (C.todayIso() !== today) { render(); preview(); } }, 60000);
        document.addEventListener('visibilitychange', () => { if (!document.hidden && C.todayIso() !== today) { render(); preview(); } });
        if (!canSave) $('storage-warn').hidden = false;
        $('f-last').value = today;
        render(); preview();
        if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
    }
    init();
})();
