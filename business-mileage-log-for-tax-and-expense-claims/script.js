// Business Mileage Log for Tax and Expense Claims: the page. The logic lives in core.js.
(function () {
    'use strict';
    const C = window.MileageCore;
    const SLUG = 'business-mileage-log-for-tax-and-expense-claims';
    const KEY = SLUG + '.state', KEY_CUR = SLUG + '.cur', KEY_NAME = SLUG + '.name', KEY_PERIOD = SLUG + '.period';
    const $ = id => document.getElementById(id);
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const MAX_SHOWN = 300;

    let canSave = true, state, today = C.todayIso(), cur = '', curChosen = false, myName = '';
    let period = 'month', rFrom = '', rTo = '';
    let edTrip = null, edVeh = null, useOdo = false;

    // ---------- saving ----------
    function load() {
        let raw = null;
        try { raw = localStorage.getItem(KEY); } catch (e) { canSave = false; }
        if (raw) {
            try { const s = C.validate(JSON.parse(raw)); if (s) return s; } catch (e) { /* damaged: start fresh */ }
            setTimeout(() => show('set-msg', 'The saved trips could not be read, so the app started fresh.'), 0);
        }
        return C.emptyState();
    }
    function save() {
        try { localStorage.setItem(KEY, JSON.stringify(state)); canSave = true; } catch (e) { canSave = false; }
        $('storage-warn').hidden = canSave;
    }
    const setPref = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* fine */ } };
    const snapshot = () => JSON.stringify(state);
    function restoreSnap(snap) { state = C.validate(JSON.parse(snap)) || state; closeAll(); commit(); }
    function commit() { save(); render(); }

    // ---------- messages with Undo ----------
    const MSGS = ['trip-msg', 'set-msg'];
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
        clearTimeout(timers[id]); timers[id] = setTimeout(() => clearMsg(id), undoSnap ? 15000 : 7000);
    }
    function clearMsg(id) { const b = $(id); if (b) { b.textContent = ''; b.classList.remove('show'); } }

    // ---------- helpers ----------
    const veh = id => state.vehicles.find(v => v.id === id);
    const trip = id => state.trips.find(t => t.id === id);
    const newId = () => state.nextId++;
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
        if (body.length > 1800) body = body.slice(0, 1800) + '\n...\n(Too long for an email link. Use "Copy claim" or "Save spreadsheet (CSV)" and attach it.)';
        return 'mailto:?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
    }
    function btn(parent, cls, text, fn, aria) {
        const b = el('button', cls, text); b.type = 'button';
        if (aria) b.setAttribute('aria-label', aria);
        b.addEventListener('click', fn); parent.appendChild(b); return b;
    }
    // the tax year follows the first vehicle's rate (6 Apr for HMRC, 1 Jan for IRS and CRA)
    const mainYs = () => state.vehicles.length ? C.ruleOf(state.vehicles[0]).ys : '01-01';
    const curRange = () => C.range(period, today, mainYs(), rFrom, rTo);
    const unitName = (v, many) => C.UNIT[v ? C.ruleOf(v).unit : 'mi'][many ? 'many' : 'one'];

    // ---------- the page ----------
    function render() {
        today = C.todayIso();
        const has = state.vehicles.length > 0;
        $('start').hidden = has;
        ['add-row', 'claim', 'trips', 'year', 'vehicles'].forEach(id => { $(id).hidden = !has; });
        if (!has) return;
        const calc = C.compute(state);
        renderClaim(calc);
        renderYear(calc);
        renderVehicles();
    }

    function renderClaim(calc) {
        document.querySelectorAll('#periods .chip').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.p === period)));
        $('custom-range').hidden = period !== 'custom';
        const rg = curRange(), cl = C.claim(state, rg.from, rg.to, calc), many = state.vehicles.length > 1;
        const body = $('claim-body'); body.textContent = '';
        const total = el('p', 'total');
        total.appendChild(el('span', 'total-amt', C.money(cl.cents, cur)));
        total.appendChild(el('span', 'total-what', ' to claim'));
        body.appendChild(total);
        body.appendChild(el('p', 'total-sub', rg.label + ': ' + C.plural(cl.trips.length, 'trip') + ', ' + C.unitsText(cl.units) + '.'));
        if (cl.trips.length) {
            const ul = el('ul', 'breakdown');
            for (const l of cl.lines) ul.appendChild(el('li', l.low ? 'low' : l.kind === 'pass' ? 'pass' : '', (many ? veh(l.veh).name + ': ' : '') + C.lineText(l, cur)));
            body.appendChild(ul);
            if (cl.missingPurpose) body.appendChild(el('p', 'line warn', (cl.missingPurpose === 1 ? '1 trip has' : cl.missingPurpose + ' trips have') + ' no purpose. Tap Edit on it and fill in "What was it for?": tax offices ask for it.'));
        } else {
            body.appendChild(el('p', 'sum-empty', state.trips.length
                ? 'No trips in these dates. Tap "All trips" to see every trip, or "+ Add a trip".'
                : 'No trips yet. Tap "+ Add a trip" after each work trip and the claim adds up here.'));
        }
        $('email-claim').href = mailto('Mileage claim: ' + rg.short, C.claimText(state, rg, cur, myName));
        $('claim-tools').hidden = !cl.trips.length;
        renderTrips(cl, calc, rg);
    }

    function renderTrips(cl, calc, rg) {
        const box = $('trip-list'); box.textContent = '';
        $('trips-h').textContent = 'Trips: ' + rg.short;
        if (!cl.trips.length) { box.appendChild(el('p', 'sum-empty', state.trips.length ? 'No trips in these dates.' : 'Your trips will be listed here, newest first.')); return; }
        const list = cl.trips.slice().reverse(), many = state.vehicles.length > 1;
        const months = new Set(list.map(t => t.date.slice(0, 7)));
        let month = '', ul = null;
        list.slice(0, MAX_SHOWN).forEach(tr => {
            if (!ul || (months.size > 1 && tr.date.slice(0, 7) !== month)) {
                month = tr.date.slice(0, 7);
                if (months.size > 1) {
                    const sub = C.claim(state, month + '-01', month + '-31', calc);
                    const h = el('h3', 'month-h');
                    h.appendChild(el('span', null, C.MONTHS[+month.slice(5) - 1] + ' ' + month.slice(0, 4)));
                    h.appendChild(el('span', 'month-sum', C.unitsText(sub.units) + ' · ' + C.money(sub.cents, cur)));
                    box.appendChild(h);
                }
                ul = el('ul', 'trip-list'); box.appendChild(ul);
            }
            ul.appendChild(tripBox(tr, calc.get(tr.id), many));
        });
        if (list.length > MAX_SHOWN) box.appendChild(el('p', 'hint', 'Showing the newest ' + MAX_SHOWN + ' of ' + list.length + ' trips. "Save spreadsheet (CSV)" has them all.'));
    }

    function tripBox(tr, c, many) {
        const v = veh(tr.veh), u = c.unit;
        const li = el('li', 'trip'); li.dataset.id = tr.id;
        const top = el('div', 'trip-top');
        top.appendChild(el('span', 'trip-date', C.shortDate(tr.date, today)));
        top.appendChild(el('b', 'trip-amt', C.money(C.toCents(c.x), cur)));
        li.appendChild(top);
        li.appendChild(el('p', 'trip-route', C.route(tr)));
        if (tr.purpose) li.appendChild(el('p', 'trip-purpose', tr.purpose));
        else li.appendChild(el('p', 'trip-purpose none', 'No purpose yet: tap Edit to add what it was for.'));
        let how = tr.odo ? 'Odometer ' + C.dist(tr.odo[0]) + ' to ' + C.dist(tr.odo[1]) + ' = ' + C.distU(c.d, u)
            : tr.back ? C.distU(tr.t, u) + ' each way, there and back = ' + C.distU(c.d, u) : C.distU(c.d, u);
        if (c.parts.length === 1) how += ' at ' + C.rate(c.parts[0].r, cur) + (c.parts[0].low ? ' (past the yearly limit)' : '');
        else how += ': ' + c.parts.map(q => C.distU(q.d, u) + ' at ' + C.rate(q.r, cur)).join(' + ') + ' (this trip passed the ' + c.after.toLocaleString('en-GB') + '-' + C.UNIT[u].one + ' limit)';
        if (c.pass) how += ', plus ' + C.plural(c.pass.n, 'passenger') + ' at ' + C.rate(c.pass.r, cur);
        li.appendChild(el('p', 'trip-how', how + '.'));
        if (many) li.appendChild(el('p', 'trip-veh', v.name));
        const act = el('div', 'act');
        btn(act, 'mini', 'Edit', () => openTrip(tr.id), 'Edit the trip on ' + C.shortDate(tr.date, today) + ' to ' + tr.to);
        btn(act, 'mini', 'Repeat today', () => openTrip(null, tr), 'Log the same trip again today: ' + C.route(tr));
        li.appendChild(act);
        return li;
    }

    function renderYear(calc) {
        const body = $('year-body'); body.textContent = '';
        const ys = C.yearStatus(state, today, calc);
        $('year-h').textContent = ys.length === 1 ? 'Tax year ' + C.yearName(ys[0].start) + ' so far' : 'This tax year so far';
        ys.forEach(y => {
            const box = el('div', 'yr');
            box.appendChild(el('h3', null, y.names.join(', ') + ' · ' + y.ruleName));
            const t = C.yearText(y, cur);
            box.appendChild(el('p', 'yr-head', t.head));
            if (y.after > 0) {
                const bar = el('div', 'bar'); bar.setAttribute('role', 'img');
                bar.setAttribute('aria-label', C.dist(Math.min(y.used, y.after * 10)) + ' of ' + y.after + ' ' + C.UNIT[y.unit].many + ' used at the higher rate');
                const f = el('span'); f.style.width = Math.min(100, Math.round(y.used * 100 / (y.after * 10))) + '%'; bar.appendChild(f); box.appendChild(bar);
            }
            box.appendChild(el('p', 'line' + (y.after > 0 && y.left === 0 ? ' warn' : ''), t.line));
            box.appendChild(el('p', 'line muted', C.fullDate(y.start) + ' to ' + C.fullDate(y.end) + '.'));
            body.appendChild(box);
        });
    }

    function renderVehicles() {
        const ul = $('veh-list'); ul.textContent = '';
        state.vehicles.forEach(v => {
            const li = el('li', 'veh');
            const n = state.trips.filter(t => t.veh === v.id).length;
            li.appendChild(el('h3', null, v.name));
            li.appendChild(el('p', 'veh-rule', v.rule === 'custom' ? 'Your own rate' : C.PRESETS[v.rule].name));
            li.appendChild(el('p', 'line muted', C.ruleText(v, cur)));
            li.appendChild(el('p', 'line muted', C.plural(n, 'trip') + ' logged.'));
            const act = el('div', 'act');
            btn(act, 'mini', 'Edit vehicle or rate', () => openVeh(v.id), 'Edit ' + v.name);
            li.appendChild(act);
            ul.appendChild(li);
        });
        $('add-veh').hidden = state.vehicles.length >= 10;
    }

    // ---------- windows ----------
    function openDlg(id) { const d = $(id); if (!d.open) { if (d.showModal) d.showModal(); else d.setAttribute('open', ''); } }
    function closeDlg(id) { const d = $(id); if (d.open) { if (d.close) d.close(); else d.removeAttribute('open'); } }
    function closeAll() { ['d-trip', 'd-veh'].forEach(closeDlg); edTrip = edVeh = null; }
    function clearErrors(form) {
        form.querySelectorAll('.err').forEach(e => { e.textContent = ''; });
        form.querySelectorAll('[aria-invalid]').forEach(e => e.removeAttribute('aria-invalid'));
    }
    function showErrors(errors, map) {
        let first = null;
        Object.keys(errors).forEach(k => {
            const m = map[k]; if (!m) return;
            $(m[1]).textContent = errors[k];
            const f = $(m[0]); if (f) { f.setAttribute('aria-invalid', 'true'); if (!first) first = f; }
        });
        if (first) first.focus();
    }
    function showPart(w, o, on) { $(w).hidden = !on; $(o).hidden = on; }

    // ---------- the trip window ----------
    // id: edit that trip; like: a new trip filled in from that one; neither: a blank new trip
    function openTrip(id, like) {
        closeAll();
        const tr = id != null ? trip(id) : null;
        edTrip = tr ? tr.id : null;
        const f = $('f-trip'); f.reset(); clearErrors(f);
        $('dt-h').textContent = tr ? 'Edit trip' : 'Add a trip';
        $('t-save').textContent = tr ? 'Save changes' : 'Add trip';
        $('t-edit').hidden = !tr;
        const sel = $('t-veh'); sel.textContent = '';
        state.vehicles.forEach(v => { const o = el('option', null, v.name); o.value = v.id; sel.appendChild(o); });
        $('tw-veh').hidden = state.vehicles.length < 2;
        const last = state.trips.length ? state.trips.reduce((a, b) => (b.date > a.date || (b.date === a.date && b.id > a.id)) ? b : a) : null;
        const src = tr || like;
        sel.value = String(src ? src.veh : last && veh(last.veh) ? last.veh : state.vehicles[0].id);
        $('t-date').value = tr ? tr.date : today;
        $('t-date').max = today;
        const dl = $('places'); dl.textContent = '';
        C.places(state).forEach(p => { const o = document.createElement('option'); o.value = p; dl.appendChild(o); });
        // one-tap repeats for a new trip
        const rep = $('t-repeat'); rep.textContent = '';
        const routes = tr ? [] : C.recentRoutes(state, 6);
        routes.forEach(r => {
            const c = C.compute(state).get(r.id);
            const b = el('button', 'chip', C.route(r) + ' · ' + C.distU(c.d, c.unit)); b.type = 'button';
            b.addEventListener('click', () => { fillFrom(r); rep.querySelectorAll('.chip').forEach(x => x.setAttribute('aria-pressed', String(x === b))); });
            rep.appendChild(b);
        });
        $('tw-repeat').hidden = !routes.length;
        setOdo(false);
        showPart('tw-pass', 'to-pass', false);
        if (src) fillFrom(src);
        if (tr && tr.odo) { setOdo(true); $('t-odo-s').value = C.dist(tr.odo[0]).replace(/,/g, ''); $('t-odo-e').value = C.dist(tr.odo[1]).replace(/,/g, ''); }
        tripVehChanged();
        openDlg('d-trip');
        tripPreview();
        if (!tr && !like) setTimeout(() => $('t-to').focus(), 0);
    }
    function fillFrom(r) {
        $('t-veh').value = String(r.veh);
        $('t-from').value = r.from; $('t-to').value = r.to; $('t-purpose').value = r.purpose;
        $('t-dist').value = r.odo ? C.dist(r.t).replace(/,/g, '') : C.dist(r.t).replace(/,/g, '').replace(/\.0$/, '');
        $('t-back').checked = !!r.back;
        setOdo(false);
        $('t-pass').value = r.pass ? String(r.pass) : '';
        tripVehChanged();
        if (r.pass) showPart('tw-pass', 'to-pass', true);
        clearErrors($('f-trip'));
        tripPreview();
    }
    function setOdo(on) {
        useOdo = on;
        $('tw-odo').hidden = !on; $('tw-dist').hidden = on;
        $('to-odo').textContent = on ? 'Type the distance instead' : '+ Use odometer readings instead (optional)';
    }
    // labels follow the vehicle's miles or km, passengers only when its rate pays for them
    function tripVehChanged() {
        const v = veh(Number($('t-veh').value)); if (!v) return;
        const rule = C.ruleOf(v), u = C.UNIT[rule.unit];
        $('tl-dist').textContent = 'Business ' + u.many;
        const date = C.isDate($('t-date').value) ? $('t-date').value : today;
        const p = C.periodAt(rule, date);
        const passOk = p.pass > 0;
        if (!passOk) { $('t-pass').value = ''; showPart('tw-pass', 'to-pass', false); $('to-pass').hidden = true; }
        else if ($('tw-pass').hidden) $('to-pass').hidden = false;
        $('th-pass').textContent = passOk ? 'Adds ' + C.rate(p.pass, cur) + ' a ' + u.one + ' for each passenger who travels for work.' : '';
    }
    function tripForm() {
        return { veh: $('t-veh').value, date: $('t-date').value, from: $('t-from').value, to: $('t-to').value, purpose: $('t-purpose').value,
            dist: $('t-dist').value, back: $('t-back').checked, useOdo, odoStart: $('t-odo-s').value, odoEnd: $('t-odo-e').value,
            pass: $('tw-pass').hidden ? '' : $('t-pass').value };
    }
    // what this trip adds, worked out with all the other trips (the yearly limit depends on them)
    function tripPreview() {
        const pv = $('t-preview'), w = $('t-warn');
        const f = tripForm();
        if (!String(f.to).trim()) f.to = '?';
        const r = C.readTrip(f, state, today);
        if (r.errors) { pv.textContent = ''; w.textContent = ''; return; }
        const id = edTrip != null ? edTrip : 1e9;
        const trial = { vehicles: state.vehicles, trips: state.trips.filter(t => t.id !== id).concat([Object.assign({ id }, r.trip)]) };
        const c = C.compute(trial).get(id), u = C.UNIT[c.unit];
        let t = (edTrip != null ? 'This trip: ' : 'Adds ') + C.money(C.toCents(c.x), cur) + (edTrip != null || c.parts.length > 1 ? ' for ' : ' to your claim: ') + C.distU(c.d, c.unit);
        if (c.parts.length === 1) t += ' at ' + C.rate(c.parts[0].r, cur) + (c.parts[0].low ? ' (past the yearly limit of ' + c.after.toLocaleString('en-GB') + ' ' + u.many + ')' : '');
        else t = t.replace(' for ', edTrip != null ? ' for ' : ' to your claim for ') + ': ' + c.parts.map(q => C.distU(q.d, c.unit) + ' at ' + C.rate(q.r, cur)).join(' and ') + ', because this trip passes the ' + c.after.toLocaleString('en-GB') + '-' + u.one + ' yearly limit';
        if (c.pass) t += ', plus ' + C.plural(c.pass.n, 'passenger') + ' at ' + C.rate(c.pass.r, cur);
        pv.textContent = t + '.';
        w.textContent = f.to === '?' ? '' : r.warn;
    }
    function submitTrip(e) {
        e.preventDefault();
        const f = $('f-trip'); clearErrors(f);
        const r = C.readTrip(tripForm(), state, today);
        if (r.errors) {
            showErrors(r.errors, { veh: ['t-veh', 'te-veh'], date: ['t-date', 'te-date'], to: ['t-to', 'te-to'], dist: ['t-dist', 'te-dist'],
                odoStart: ['t-odo-s', 'te-odo-s'], odoEnd: ['t-odo-e', 'te-odo-e'], pass: ['t-pass', 'te-pass'] });
            return;
        }
        if (edTrip == null && state.trips.length >= 20000) { $('te-to').textContent = 'The log is full (20,000 trips). Save a backup and delete old trips first.'; return; }
        const before = snapshot(), old = edTrip != null ? trip(edTrip) : null;
        let id;
        if (old) { Object.assign(old, r.trip); id = old.id; } else { id = newId(); state.trips.push(Object.assign({ id }, r.trip)); }
        closeAll(); commit();
        const c = C.compute(state).get(id), rg = curRange();
        let t = (old ? 'Saved: ' : 'Added: ') + C.shortDate(r.trip.date, today) + ' to ' + r.trip.to + ', ' + C.distU(c.d, c.unit) + ', ' + C.money(C.toCents(c.x), cur) + '.';
        if (r.trip.date < rg.from || r.trip.date > rg.to) t += ' It is outside ' + rg.short + ': tap "All trips" to see it.';
        show('trip-msg', t, before);
        const box = document.querySelector('.trip[data-id="' + id + '"]');
        if (box) { box.classList.add('flash'); setTimeout(() => box.classList.remove('flash'), 1600); }
    }
    function deleteTrip() {
        const tr = trip(edTrip); if (!tr) return;
        const before = snapshot();
        state.trips = state.trips.filter(t => t.id !== tr.id);
        closeAll(); commit();
        show('trip-msg', 'Deleted the trip on ' + C.shortDate(tr.date, today) + ' to ' + tr.to + '.', before);
    }

    // ---------- the vehicle window ----------
    function openVeh(id) {
        closeAll();
        const v = id != null ? veh(id) : null;
        edVeh = v ? v.id : null;
        const f = $('f-veh'); f.reset(); clearErrors(f);
        $('dv-h').textContent = v ? 'Edit ' + v.name : state.vehicles.length ? 'Add another vehicle' : 'Your vehicle and mileage rate';
        $('v-save').textContent = v ? 'Save changes' : state.vehicles.length ? 'Add vehicle' : 'Save and start';
        $('v-edit').hidden = !v;
        $('v-name').value = v ? v.name : state.vehicles.length ? '' : 'My car';
        const rule = v ? v.rule : state.vehicles.length ? state.vehicles[0].rule : '';
        document.querySelectorAll('input[name="v-rule"]').forEach(r => { r.checked = r.value === rule; });
        // own rates: the latest period, or the official one being copied
        const src = v && v.rule === 'custom' ? v.custom : null;
        const p = src ? src.periods[src.periods.length - 1] : null;
        $('v-unit').value = src ? src.unit : 'mi';
        $('v-ys').value = src ? src.ys : '01-01';
        const r3 = n => (n / 1000).toFixed(n % 10 ? 3 : 2);
        $('v-rate').value = p ? r3(p.rate) : '';
        $('v-after').value = p && p.after ? String(p.after) : '';
        $('v-rate2').value = p && p.after ? r3(p.rate2) : '';
        $('v-pass').value = p && p.pass ? r3(p.pass) : '';
        showPart('vw-limit', 'vo-limit', !!(p && p.after));
        showPart('vw-pass', 'vo-pass', !!(p && p.pass));
        $('v-when-date').value = today;
        $('vw-when-date').hidden = true;
        vehChanged();
        openDlg('d-veh');
    }
    const ruleChoice = () => { const r = document.querySelector('input[name="v-rule"]:checked'); return r ? r.value : ''; };
    function vehForm() {
        return { name: $('v-name').value, rule: ruleChoice(), unit: $('v-unit').value, rate: $('v-rate').value, useLimit: !$('vw-limit').hidden,
            after: $('v-after').value, rate2: $('v-rate2').value, usePass: !$('vw-pass').hidden, pass: $('v-pass').value, ys: $('v-ys').value };
    }
    // the own-rate fields copy the official rate when you switch to them, so you only change what differs
    function copyPresetInto(key) {
        const pr = C.PRESETS[key]; if (!pr) return;
        const p = C.periodAt(pr, today), r3 = n => (n / 1000).toFixed(n % 10 ? 3 : 2);
        $('v-unit').value = pr.unit; $('v-ys').value = pr.ys; $('v-rate').value = r3(p.rate);
        $('v-after').value = p.after ? String(p.after) : ''; $('v-rate2').value = p.after ? r3(p.rate2) : '';
        $('v-pass').value = p.pass ? r3(p.pass) : '';
        showPart('vw-limit', 'vo-limit', !!p.after); showPart('vw-pass', 'vo-pass', !!p.pass);
    }
    function vehChanged() {
        const own = ruleChoice() === 'custom', v = edVeh != null ? veh(edVeh) : null;
        $('vw-own').hidden = !own;
        const u = C.UNIT[$('v-unit').value === 'km' ? 'km' : 'mi'];
        $('vl-rate').textContent = 'Rate per ' + u.one;
        $('vl-after').textContent = 'After how many ' + u.many + ' a year?';
        $('vl-rate2').textContent = 'Then the rate per ' + u.one + ' is';
        $('vl-pass').textContent = 'Extra per passenger per ' + u.one;
        $('vo-limit').textContent = '+ A lower rate after a number of ' + u.many + ' a year (optional)';
        const n = v ? state.trips.filter(t => t.veh === v.id).length : 0;
        $('vw-when').hidden = !(own && v && v.rule === 'custom' && n > 0);
        const when = document.querySelector('input[name="v-when"]:checked');
        $('vw-when-date').hidden = $('vw-when').hidden || !when || when.value !== 'from';
        vehPreview();
    }
    function vehPreview() {
        const pv = $('v-preview'), r = C.readRule(vehForm());
        if (r.errors) { pv.textContent = ''; return; }
        const v = edVeh != null ? veh(edVeh) : null, n = v ? state.trips.filter(t => t.veh === v.id).length : 0;
        const tmp = Object.assign({ id: v ? v.id : 0 }, r.veh);
        let t = (r.veh.rule === 'custom' ? 'Your own rate: ' : C.PRESETS[r.veh.rule].name + ': ') + C.ruleText(tmp, cur);
        if (r.veh.rule === 'custom') {
            const p = r.veh.custom.periods[0];
            if (p.rate >= 5000 && ['£', '$', '€', 'C$', 'A$', 'NZ$', ''].includes(cur)) t += ' Check: that is ' + C.rate(p.rate, cur) + ' a ' + C.UNIT[r.veh.custom.unit].one + '. For 45p or 45 cents type 0.45 or 45p.';
        }
        if (n) {
            const when = document.querySelector('input[name="v-when"]:checked');
            if (!$('vw-when').hidden && when && when.value === 'from' && C.isDate($('v-when-date').value)) t += ' Trips before ' + C.fullDate($('v-when-date').value) + ' keep the old rate.';
            else t += ' Its ' + C.plural(n, 'trip') + ' will be worked out with this rate.';
            if (v.rule !== 'custom' || r.veh.rule !== 'custom' || v.custom.unit !== r.veh.custom.unit) {
                const was = C.ruleOf(v).unit, now = r.veh.rule === 'custom' ? r.veh.custom.unit : C.PRESETS[r.veh.rule].unit;
                if (was !== now) t += ' Its trips were typed in ' + C.UNIT[was].many + ' and will now count as ' + C.UNIT[now].many + '.';
            }
        }
        pv.textContent = t;
    }
    function submitVeh(e) {
        e.preventDefault();
        const f = $('f-veh'); clearErrors(f);
        const r = C.readRule(vehForm());
        const errs = r.errors ? Object.assign({}, r.errors) : {};
        const v = edVeh != null ? veh(edVeh) : null;
        const when = document.querySelector('input[name="v-when"]:checked'), fromMode = !$('vw-when').hidden && when && when.value === 'from';
        const wd = $('v-when-date').value;
        if (fromMode && (!C.isDate(wd) || wd <= '2000-01-01')) errs.when = 'Choose the date the new rate starts.';
        const nm = $('v-name').value.trim().toLowerCase();
        if (!errs.name && nm && state.vehicles.some(x => x.id !== edVeh && x.name.toLowerCase() === nm)) errs.name = 'You already have a vehicle with this name. Give this one another name, like Van 2.';
        if (Object.keys(errs).length) {
            showErrors(errs, { name: ['v-name', 've-name'], rule: [null, 've-rule'], rate: ['v-rate', 've-rate'], after: ['v-after', 've-after'], rate2: ['v-rate2', 've-rate2'],
                pass: ['v-pass', 've-pass'], ys: ['v-ys', 've-ys'], when: ['v-when-date', 've-when'] });
            if (errs.rule) $('ve-rule').scrollIntoView({ block: 'nearest' });
            return;
        }
        const before = snapshot(), first = !state.vehicles.length;
        if (v) {
            const custom = r.veh.rule === 'custom' ? C.applyRates(v, r.veh, fromMode ? 'from' : 'all', wd) : null;
            v.name = r.veh.name; v.rule = r.veh.rule; v.custom = custom;
        } else state.vehicles.push({ id: newId(), name: r.veh.name, rule: r.veh.rule, custom: r.veh.custom });
        // the first official rate sets the currency, unless one was picked
        if (!curChosen && r.veh.rule !== 'custom' && C.PRESETS[r.veh.rule].cur && !cur) { cur = C.PRESETS[r.veh.rule].cur; $('s-cur').value = cur; }
        closeAll(); commit();
        show('trip-msg', first ? 'Ready. Tap "+ Add a trip" after each work trip.' : v ? 'Saved ' + r.veh.name + '.' : 'Added ' + r.veh.name + '. Choose it under "Vehicle" when you add a trip.', first ? null : before);
    }
    function deleteVeh() {
        const v = veh(edVeh); if (!v) return;
        const before = snapshot(), n = state.trips.filter(t => t.veh === v.id).length;
        state.vehicles = state.vehicles.filter(x => x.id !== v.id);
        state.trips = state.trips.filter(t => t.veh !== v.id);
        closeAll(); commit();
        show(state.vehicles.length ? 'trip-msg' : 'set-msg', 'Deleted ' + v.name + (n ? ' and its ' + C.plural(n, 'trip') : '') + '.', before);
    }

    // ---------- wiring ----------
    function init() {
        state = load();
        try {
            const c = localStorage.getItem(KEY_CUR); if (c !== null && C.CURRENCIES.includes(c)) { cur = c; curChosen = true; }
            const n = localStorage.getItem(KEY_NAME); if (typeof n === 'string') myName = n.slice(0, 60);
            const p = localStorage.getItem(KEY_PERIOD); if (['month', 'last', 'year', 'lastyear', 'all'].includes(p)) period = p;
        } catch (e) { /* fine */ }
        const sc = $('s-cur');
        C.CURRENCIES.forEach(c => { const o = el('option', null, c || 'None'); o.value = c; sc.appendChild(o); });
        sc.value = cur;
        sc.addEventListener('change', () => { cur = sc.value; curChosen = true; setPref(KEY_CUR, cur); render(); });
        $('s-name').value = myName;
        if (myName) showPart('sw-name', 'so-name', true);
        $('so-name').addEventListener('click', () => { showPart('sw-name', 'so-name', true); $('s-name').focus(); });
        $('s-name').addEventListener('input', () => { myName = $('s-name').value.trim().slice(0, 60); setPref(KEY_NAME, myName); render(); });

        // the rate choices
        const box = $('v-rules');
        C.RULES.forEach(k => {
            const lab = el('label', 'radio'), inp = document.createElement('input');
            inp.type = 'radio'; inp.name = 'v-rule'; inp.value = k;
            const sp = el('span');
            sp.appendChild(el('b', null, k === 'custom' ? "My employer's or my own rate" : C.PRESETS[k].name));
            sp.appendChild(el('small', null, k === 'custom' ? 'Any rate per mile or km, with an optional lower rate after a yearly limit.' : C.PRESETS[k].about));
            lab.appendChild(inp); lab.appendChild(document.createTextNode(' ')); lab.appendChild(sp);
            box.appendChild(lab);
        });
        C.YEAR_STARTS.forEach(y => { const o = el('option', null, y[1]); o.value = y[0]; $('v-ys').appendChild(o); });

        $('start-btn').addEventListener('click', () => openVeh(null));
        $('add-trip').addEventListener('click', () => openTrip(null));
        $('add-veh').addEventListener('click', () => openVeh(null));
        document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => closeAll()));
        ['d-trip', 'd-veh'].forEach(id => $(id).addEventListener('close', () => { if (id === 'd-trip') edTrip = null; else edVeh = null; }));

        // periods
        $('periods').addEventListener('click', e => {
            const b = e.target.closest('.chip'); if (!b) return;
            period = b.dataset.p;
            if (period === 'custom' && !rFrom) { rFrom = today.slice(0, 8) + '01'; rTo = today; $('r-from').value = rFrom; $('r-to').value = rTo; }
            if (period !== 'custom') setPref(KEY_PERIOD, period);
            render();
        });
        ['r-from', 'r-to'].forEach(id => $(id).addEventListener('change', () => { rFrom = $('r-from').value; rTo = $('r-to').value; render(); }));

        // trip window
        const ft = $('f-trip');
        ft.addEventListener('submit', submitTrip);
        ft.addEventListener('input', tripPreview);
        ft.addEventListener('change', tripPreview);
        $('t-veh').addEventListener('change', () => { tripVehChanged(); tripPreview(); });
        $('t-date').addEventListener('change', () => { tripVehChanged(); tripPreview(); });
        $('t-quick-date').addEventListener('click', e => { const b = e.target.closest('.chip'); if (!b) return; $('t-date').value = C.addDays(today, -Number(b.dataset.ago)); $('te-date').textContent = ''; $('t-date').removeAttribute('aria-invalid'); tripVehChanged(); tripPreview(); });
        $('to-odo').addEventListener('click', () => { setOdo(!useOdo); clearErrors(ft); (useOdo ? $('t-odo-s') : $('t-dist')).focus(); tripPreview(); });
        $('to-pass').addEventListener('click', () => { showPart('tw-pass', 'to-pass', true); $('t-pass').focus(); });
        $('t-del').addEventListener('click', deleteTrip);

        // vehicle window
        const fv = $('f-veh');
        fv.addEventListener('submit', submitVeh);
        fv.addEventListener('input', vehPreview);
        fv.addEventListener('change', e => {
            if (e.target.name === 'v-rule' && e.target.value === 'custom' && !$('v-rate').value) {
                const v = edVeh != null ? veh(edVeh) : null;
                copyPresetInto(v && v.rule !== 'custom' ? v.rule : '');
            }
            if (e.target.name === 'v-rule') $('ve-rule').textContent = '';
            vehChanged();
        });
        $('v-names').addEventListener('click', e => { const b = e.target.closest('.chip'); if (!b) return; $('v-name').value = b.dataset.n; $('ve-name').textContent = ''; $('v-name').removeAttribute('aria-invalid'); vehPreview(); });
        $('vo-limit').addEventListener('click', () => { showPart('vw-limit', 'vo-limit', true); $('v-after').focus(); vehPreview(); });
        $('vo-pass').addEventListener('click', () => { showPart('vw-pass', 'vo-pass', true); $('v-pass').focus(); vehPreview(); });
        $('v-del').addEventListener('click', deleteVeh);

        // sharing
        $('copy-claim').addEventListener('click', () => {
            const rg = curRange();
            copyText(C.claimText(state, rg, cur, myName)).then(ok => show('trip-msg', ok ? 'Copied the claim for ' + rg.short + '. Paste it into an email or message.' : 'Could not copy here. Use "Email claim" or "Save spreadsheet (CSV)" instead.'));
        });
        $('csv').addEventListener('click', () => {
            const rg = curRange();
            download('mileage-' + rg.short.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.csv', 'text/csv', C.csv(state, rg));
            show('trip-msg', 'Saved a spreadsheet file for ' + rg.short + '. It opens in Excel, Numbers or Google Sheets.');
        });
        $('print').addEventListener('click', () => window.print());

        // backup
        $('backup').addEventListener('click', () => {
            download('mileage-log-backup-' + today + '.json', 'application/json', JSON.stringify(state, null, 1));
            show('set-msg', 'Saved a backup file with ' + C.plural(state.vehicles.length, 'vehicle') + ' and ' + C.plural(state.trips.length, 'trip') + '.');
        });
        $('restore').addEventListener('click', () => $('restore-file').click());
        $('restore-file').addEventListener('change', e => {
            const f = e.target.files && e.target.files[0]; e.target.value = '';
            if (!f) return;
            if (f.size > 20e6) { show('set-msg', 'That file is too big to be a backup from this app.'); return; }
            const r = new FileReader();
            r.onload = () => {
                let s = null; try { s = C.validate(JSON.parse(String(r.result))); } catch (err) { s = null; }
                if (!s || !s.vehicles.length) { show('set-msg', 'That file is not a backup from this app. Nothing was changed.'); return; }
                const before = snapshot(); state = s; closeAll(); commit();
                show('set-msg', 'Restored ' + C.plural(s.vehicles.length, 'vehicle') + ' and ' + C.plural(s.trips.length, 'trip') + '.', before);
            };
            r.onerror = () => show('set-msg', 'Could not read that file.');
            r.readAsText(f);
        });
        $('wipe').addEventListener('click', () => {
            if (!state.vehicles.length && !state.trips.length) { show('set-msg', 'There is nothing to delete.'); return; }
            const before = snapshot(); state = C.emptyState(); closeAll(); commit();
            show('set-msg', 'Deleted everything.', before);
        });
        // a new day while the page stays open
        const tick = () => { if (C.todayIso() !== today) render(); };
        setInterval(tick, 60000);
        document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
        if (!canSave) $('storage-warn').hidden = false;
        render();
        if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
    }
    init();
})();
