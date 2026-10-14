// Fuel Log and Car Running Cost Tracker: the page. The maths and the words are in core.js (window.FLC).
(function () {
    'use strict';
    const M = window.FLC, KEY = 'fuel-log-and-car-running-cost-tracker.state';
    const $ = id => document.getElementById(id);
    const CUR_NAMES = { '': 'None (plain numbers)', '$': '$ (dollar)', '€': '€ (euro)', '£': '£ (pound)', '₹': '₹ (rupee)', 'Rs': 'Rs (rupee)', '¥': '¥ (yen, yuan)', '₩': '₩ (won)', '₦': '₦ (naira)',
        '₱': '₱ (peso)', 'R': 'R (rand)', 'kr': 'kr (krona, krone)', 'CHF': 'CHF (franc)', 'AED': 'AED (dirham)', 'SAR': 'SAR (riyal)', 'RM': 'RM (ringgit)', 'Rp': 'Rp (rupiah)', '৳': '৳ (taka)',
        '₺': '₺ (lira)', 'R$': 'R$ (real)', 'zł': 'zł (złoty)', '₽': '₽ (ruble)', '₴': '₴ (hryvnia)', 'KSh': 'KSh (shilling)', '₵': '₵ (cedi)', 'E£': 'E£ (Egyptian pound)', 'A$': 'A$ (Australian dollar)', 'C$': 'C$ (Canadian dollar)' };
    const LANG = navigator.language || 'en';
    let LOCALE_DEC = '.';
    try { LOCALE_DEC = (new Intl.NumberFormat().formatToParts(1.5).find(p => p.type === 'decimal') || {}).value || '.'; } catch (e) { /* keep . */ }
    const PAGE = 30;
    let state = M.emptyState(LANG), storageOK = true, today = M.dayStr(new Date());
    let undoSnap = null, editing = null, carPanel = null, shown = PAGE; // carPanel = 'edit' | 'add' | null

    function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
    function btn(cls, text, fn) { const b = el('button', cls, text); b.type = 'button'; if (fn) b.addEventListener('click', fn); return b; }
    const car = () => state.cars.find(c => c.id === state.carId) || state.cars[0];
    const nice = d => M.niceDate(d, today);
    const money = c => M.fmt(c, state.cur);
    const perWord = c => c.du === 'km' ? 'km' : 'mile';
    const newId = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

    // ---------- storage ----------
    function load() {
        try {
            const raw = localStorage.getItem(KEY);
            if (raw) { const s = M.normalize(JSON.parse(raw), LANG); if (s) state = s; }
        } catch (e) { state = M.emptyState(LANG); }
        try { localStorage.setItem(KEY + '.test', '1'); localStorage.removeItem(KEY + '.test'); } catch (e) { storageOK = false; }
    }
    function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { storageOK = false; } $('storage-warn').hidden = storageOK; }
    const snap = () => JSON.stringify(state);
    function commit(before) { undoSnap = before; save(); render(); }

    const MSGS = ['add-msg', 'log-msg', 'tools-msg'];
    function say(box, text, withUndo) {
        box.textContent = '';
        if (!text) { box.classList.remove('show'); return; }
        box.classList.add('show');
        box.appendChild(document.createTextNode(text + ' '));
        if (withUndo && undoSnap) {
            const s = undoSnap;
            box.appendChild(btn('link inline undo', 'Undo', () => {
                state = M.normalize(JSON.parse(s), LANG) || M.emptyState(LANG); undoSnap = null; stopEditing(); carPanel = null; save(); render(); updateForm();
                MSGS.forEach(id => say($(id), ''));
                say(box, 'Undone.');
            }));
        }
    }
    function clearMsgs(except) { MSGS.forEach(id => { if (id !== except) say($(id), ''); }); }

    // ---------- the car ----------
    function renderCar() {
        const c = car(), many = state.cars.length > 1;
        const sel = $('car');
        sel.hidden = !many; $('car-name').hidden = many; $('car-name').textContent = c.name;
        $('car-label').htmlFor = many ? 'car' : '';
        $('car-label').textContent = many ? 'Car' : 'Car:';
        sel.textContent = '';
        state.cars.forEach(x => { const o = el('option', null, x.name); o.value = x.id; sel.appendChild(o); });
        sel.value = c.id;
        $('car-units').textContent = 'Distance in ' + M.DIST[c.du].long + ', fuel in ' + M.VOL[c.vu].long + ', fuel use shown as ' + M.ECO[c.eco] + '.';
        $('car-panel').hidden = !carPanel;
        $('car-edit').setAttribute('aria-expanded', String(carPanel === 'edit'));
        $('car-add').setAttribute('aria-expanded', String(carPanel === 'add'));
    }
    function openCarPanel(kind) {
        if (carPanel === kind) { carPanel = null; renderCar(); return; }
        carPanel = kind;
        const d = car(); // a new car starts with the same units as the current one
        $('car-panel-h').textContent = kind === 'add' ? 'Add a car' : 'Car settings';
        $('cp-name').value = kind === 'add' ? '' : d.name;
        $('cp-name').placeholder = kind === 'add' ? 'e.g. Wife\'s car, Motorbike' : 'e.g. Honda City';
        $('cp-du').value = d.du; $('cp-vu').value = d.vu; $('cp-eco').value = d.eco;
        $('cp-save').textContent = kind === 'add' ? 'Add car' : 'Save car';
        $('cp-delete').hidden = kind === 'add';
        $('cp-delete').textContent = state.cars.length > 1 ? 'Delete this car and its log' : 'Clear this car and its log';
        $('cp-name-err').textContent = ''; $('cp-name').setAttribute('aria-invalid', 'false');
        renderCar();
        $('cp-name').focus();
    }
    function saveCar() {
        const name = M.cleanText($('cp-name').value, 40);
        if (!name) { $('cp-name-err').textContent = 'Type a name for the car, such as Honda City.'; $('cp-name').setAttribute('aria-invalid', 'true'); $('cp-name').focus(); return; }
        const before = snap(), units = { du: $('cp-du').value, vu: $('cp-vu').value, eco: $('cp-eco').value };
        let msg;
        if (carPanel === 'add') {
            const c = M.newCar(newId('c'), name, units);
            state.cars.push(c); state.carId = c.id; stopEditing();
            msg = 'Added ' + name + '. It has its own log; pick a car at the top to switch.';
        } else {
            const c = car(); c.name = name; Object.assign(c, units);
            msg = 'Saved the settings for ' + name + '.';
        }
        carPanel = null; clearMsgs();
        commit(before); updateForm();
        say($('add-msg'), msg, true);
    }
    function deleteCar() {
        const c = car(), before = snap(), n = c.entries.length, only = state.cars.length === 1;
        if (!only) { state.cars = state.cars.filter(x => x !== c); state.carId = state.cars[0].id; }
        else { const fresh = M.newCar(newId('c'), 'My car', c); state.cars = [fresh]; state.carId = fresh.id; }
        carPanel = null; stopEditing(); clearMsgs();
        commit(before); updateForm();
        say($('add-msg'), (only ? 'Cleared ' : 'Deleted ') + c.name + ' and its ' + M.plural(n, 'entry', 'entries') + '.', true);
    }

    // ---------- the form ----------
    const mode = () => document.querySelector('input[name=mode]:checked').value;
    const formDate = () => $('date-box').hidden ? today : ($('date').value || '');
    const tripMode = () => car().read === 'trip';
    function setErr(id, input, text) { $(id).textContent = text || ''; if (input) $(input).setAttribute('aria-invalid', text ? 'true' : 'false'); }

    function updateLabels() {
        const c = car(), unit = M.DIST[c.du].short, vol = M.VOL[c.vu];
        const trip = tripMode();
        $('odo-label').textContent = trip ? 'Trip meter since your last fill-up (' + unit + ')' : 'Odometer (' + unit + ')';
        $('odo-hint').textContent = trip ? 'The distance on the trip meter. Reset it after you fill up.' : 'The total distance on the dashboard.';
        $('odo').placeholder = trip ? 'e.g. 480' : (c.du === 'km' ? 'e.g. 45935' : 'e.g. 28540');
        $('read-switch').textContent = trip ? 'Use the odometer instead' : 'Use the trip meter instead';
        $('vol-label').textContent = 'Fuel (' + vol.long + ')';
        $('price-label').textContent = 'Price per ' + vol.one;
        $('codo-label').textContent = 'Odometer (' + unit + ')';
        ['cur-tag', 'cur-tag2'].forEach(id => { $(id).hidden = !state.cur; $(id).textContent = state.cur; });
    }

    // the fill-up as typed, or { error } per field
    function readFill() {
        const c = car(), errs = {}, date = formDate();
        if (!$('date-box').hidden) {
            if (!M.isDay(date)) errs.date = 'Choose the date.';
            else if (date > today) errs.date = 'That date is in the future. Choose today or an earlier day.';
            else if (date < '1990-01-01') errs.date = 'Choose a date after 1990.';
        }
        const trip = tripMode(), d = trip ? M.parseTrip($('odo').value) : M.parseOdo($('odo').value);
        if (d.error) errs.odo = d.error;
        const f = M.solveFuel($('vol').value, $('price').value, $('total').value, LOCALE_DEC);
        if (f.error) errs.vol = f.error;
        const old = editing ? c.entries.find(e => e.id === editing) : null;
        const entry = { id: old ? old.id : 'new-entry', t: 'fill', date: M.isDay(date) ? date : today, seq: old && old.date === date ? old.seq : state.seq + 1, du: c.du,
            vol: f.vol, vu: c.vu, total: f.total == null ? null : f.total, full: $('full').checked, missed: $('missed').checked, note: M.cleanText($('note').value, 200) };
        if (trip) entry.trip = d.v; else entry.odo = d.v;
        if (!errs.odo && !errs.date) { const p = M.odoProblem(c, entry, undefined, today); if (p) errs.odo = p; }
        return { entry, errs, f };
    }
    // what this fill-up comes to, worked out as if it were saved
    function trial(entry) {
        const c = car(), test = { entries: c.entries.filter(e => e.id !== entry.id).concat([entry]) };
        const s = M.summary(test, today), row = s.rows.find(r => r.e === entry);
        return { s, row };
    }

    function updateForm() {
        updateLabels();
        const m = mode(), c = car();
        $('fill-fields').hidden = m !== 'fill'; $('cost-fields').hidden = m !== 'cost';
        $('save').textContent = editing ? 'Save changes' : m === 'fill' ? 'Save fill-up' : 'Save cost';
        $('date-text').textContent = $('date-box').hidden ? 'today' : ($('date').value ? (M.isDay($('date').value) && $('date').value === today ? 'today' : M.isDay($('date').value) ? nice($('date').value) : 'not set') : 'not set');
        $('date-open').hidden = !$('date-box').hidden;
        const pv = $('preview'); pv.textContent = '';
        ['vol', 'price', 'total'].forEach(id => { $(id).placeholder = { vol: 'e.g. 40', price: c.vu === 'L' ? 'e.g. 290' : 'e.g. 3.49', total: 'e.g. 9100' }[id]; });
        if (m !== 'fill') {
            const a = M.parseMoney($('amount').value);
            if (!a.error) pv.appendChild(el('p', null, $('cat').value + ': ' + money(a.v) + ' on ' + (formDate() === today ? 'today' : M.isDay(formDate()) ? nice(formDate()) : '…') + '.'));
            return;
        }
        const { entry, errs, f } = readFill();
        if (!f.error) {
            const vol = M.VOL[c.vu];
            if (f.worked === 'price') $('price').placeholder = '= ' + M.fmtPrice(f.price, '');
            if (f.worked === 'total') $('total').placeholder = '= ' + M.fmt(f.total, '');
            if (f.worked === 'vol') $('vol').placeholder = '= ' + M.num(f.vol / 1000, 0, 3);
            let t = 'Fuel ' + M.fmtVol(f.vol, c.vu);
            if (f.total != null) t += ', ' + money(f.total) + ' at ' + M.fmtPrice(f.price, state.cur) + ' per ' + vol.one;
            t += f.worked === 'vol' ? ' (fuel worked out).' : f.worked === 'price' ? ' (price worked out).' : f.worked === 'total' ? ' (total worked out).' : '.';
            pv.appendChild(el('p', null, t));
        }
        if (!f.error && !errs.odo && entry[tripMode() ? 'trip' : 'odo'] != null && $('odo').value.trim()) {
            const { s, row } = trial(entry);
            if (row) {
                const w = M.rowWords(row, c);
                let t = row.status === 'seg' ? 'This tank: ' + w.text : w.text;
                if (row.status === 'seg' && s.avg && s.segs.length > 1) {
                    const others = s.segs.filter(x => x !== row.seg), avg = { km: others.reduce((a, x) => a + x.km, 0), L: others.reduce((a, x) => a + x.L, 0) };
                    t += ' (' + M.compareWords(M.comparePct(row.seg, avg)) + ')';
                }
                const p = el('p', 'pv-result' + (w.tone === 'warn' ? ' warn' : ''), t + '.');
                pv.appendChild(p);
                if (row.status === 'seg' && M.unusual(row.seg.km, row.seg.L)) pv.appendChild(el('p', 'warn', 'That result looks unusual. Check the ' + (tripMode() ? 'trip meter' : 'odometer') + ' and the fuel amount.'));
                const gap = row.since != null ? row.since : null, far = c.du === 'km' ? 2000 : 1250;
                if (gap != null && gap / M.KM[c.du] > far && !entry.missed) pv.appendChild(el('p', 'warn', 'That is ' + M.fmtDist(gap, c.du) + ' since your last logged fill-up. If you forgot to log one, tick "I forgot to log a fill-up before this one" under "+ Missed a fill-up, or add a note".'));
            }
        }
    }

    function resetForm() {
        ['odo', 'vol', 'price', 'total', 'note', 'amount', 'codo', 'cnote'].forEach(id => { $(id).value = ''; });
        $('full').checked = true; $('missed').checked = false;
        $('more-box').hidden = true; $('more-open').hidden = false; $('cmore-box').hidden = true; $('cmore-open').hidden = false;
        $('date-box').hidden = true; $('date').value = today;
        ['date-err', 'odo-err', 'vol-err', 'amount-err', 'codo-err'].forEach(id => { $(id).textContent = ''; });
        ['date', 'odo', 'vol', 'price', 'total', 'amount', 'codo'].forEach(id => $(id).setAttribute('aria-invalid', 'false'));
    }
    function stopEditing() {
        if (!editing) return;
        editing = null; resetForm();
        $('editing').hidden = true; $('cancel-edit').hidden = true; $('modes').hidden = false;
    }

    function saveEntry() {
        clearMsgs('add-msg');
        const c = car(), m = mode();
        let bad = null;
        const mark = (errId, input, text) => { setErr(errId, input, text); if (text && !bad) bad = input; };
        const before = snap(), wasEditing = editing;
        let entry, msg;
        if (m === 'fill') {
            const r = readFill();
            mark('date-err', 'date', r.errs.date); mark('odo-err', 'odo', r.errs.odo); mark('vol-err', r.f.field || 'vol', r.errs.vol);
            if (!r.errs.vol) ['vol', 'price', 'total'].forEach(id => $(id).setAttribute('aria-invalid', 'false'));
            if (bad) { $(bad).focus(); say($('add-msg'), ''); return; }
            entry = r.entry;
            if (entry.id === 'new-entry') entry.id = newId('e');
        } else {
            const date = formDate(), a = M.parseMoney($('amount').value);
            let dErr = '';
            if (!$('date-box').hidden) { if (!M.isDay(date)) dErr = 'Choose the date.'; else if (date > today) dErr = 'That date is in the future. Choose today or an earlier day.'; else if (date < '1990-01-01') dErr = 'Choose a date after 1990.'; }
            mark('date-err', 'date', dErr);
            mark('amount-err', 'amount', a.error ? (a.error.startsWith('Type a number') && !$('amount').value.trim() ? 'Type the amount, such as 6000.' : a.error) : '');
            let odo = null;
            if (!$('cmore-box').hidden && $('codo').value.trim()) { const o = M.parseOdo($('codo').value); mark('codo-err', 'codo', o.error); odo = o.v; } else setErr('codo-err', 'codo', '');
            if (bad) { $(bad).focus(); say($('add-msg'), ''); return; }
            const old = editing ? c.entries.find(e => e.id === editing) : null;
            entry = { id: old ? old.id : newId('e'), t: 'cost', date, seq: old && old.date === date ? old.seq : state.seq + 1, du: c.du, cat: $('cat').value, amount: a.v, odo: odo == null ? null : odo, note: M.cleanText($('cnote').value, 200) };
        }
        if (entry.seq > state.seq) state.seq = entry.seq;
        if (wasEditing) c.entries = c.entries.map(e => e.id === wasEditing ? entry : e); else c.entries.push(entry);
        const s = M.summary(c, today), row = s.rows.find(r => r.e.id === entry.id);
        const when = entry.date === today ? '' : ' (' + nice(entry.date) + ')';
        if (entry.t === 'fill') {
            const w = M.rowWords(row, c);
            msg = (wasEditing ? 'Changes saved' : 'Saved') + when + '. ' + (row.status === 'seg' ? 'This tank: ' + w.text + '.' + (s.avg && s.segs.length > 1 ? ' Your average is ' + M.fmtEco(s.avg.km, s.avg.L, c.eco) + '.' : '') : w.text + '.');
        } else msg = (wasEditing ? 'Changes saved: ' : 'Saved: ') + entry.cat + ' ' + money(entry.amount) + when + '.';
        stopEditing(); resetForm();
        commit(before);
        updateForm();
        say($('add-msg'), msg, true);
        if (m === 'fill' && !wasEditing) $('odo').focus();
    }

    function startEdit(e) {
        clearMsgs(); stopEditing();
        editing = e.id;
        document.querySelector('input[name=mode][value=' + e.t + ']').checked = true;
        $('modes').hidden = true;
        $('editing').hidden = false; $('editing').textContent = 'Editing the ' + (e.t === 'fill' ? 'fill-up' : e.cat.toLowerCase() + ' cost') + ' from ' + nice(e.date) + '.';
        $('cancel-edit').hidden = false;
        $('date-box').hidden = false; $('date').value = e.date;
        if (e.t === 'fill') {
            const c = car();
            if ((e.trip != null) !== tripMode()) { c.read = e.trip != null ? 'trip' : 'odo'; save(); }
            const dist = e.trip != null ? e.trip : e.odo, inCar = e.du === c.du ? dist : Math.round(dist * M.KM[e.du] / M.KM[c.du]);
            $('odo').value = M.inputNum(inCar, 1);
            $('vol').value = M.inputNum(e.vu === c.vu ? e.vol : Math.round(e.vol * M.LT[e.vu] / M.LT[c.vu]), 3);
            $('total').value = e.total != null ? M.inputNum(e.total, 2) : '';
            $('price').value = '';
            $('full').checked = e.full; $('missed').checked = e.missed; $('note').value = e.note;
            if (e.missed || e.note) { $('more-box').hidden = false; $('more-open').hidden = true; }
        } else {
            $('cat').value = e.cat; $('amount').value = M.inputNum(e.amount, 2); $('cnote').value = e.note;
            $('codo').value = e.odo != null ? M.inputNum(e.odo, 1) : '';
            if (e.odo != null || e.note) { $('cmore-box').hidden = false; $('cmore-open').hidden = true; }
        }
        updateForm();
        $('add').scrollIntoView({ behavior: 'smooth', block: 'start' });
        $(e.t === 'fill' ? 'odo' : 'amount').focus({ preventScroll: true });
    }

    // ---------- results ----------
    function renderResults() {
        const c = car(), s = M.summary(c, today), per = perWord(c);
        $('res-h').textContent = 'How ' + c.name + ' is doing';
        const none = !c.entries.length;
        $('res-empty').hidden = !(none || !s.segs.length);
        $('res-empty').textContent = none ? 'Log your first fill-up. Fill the tank to full and type the odometer; when you log your next full tank, its fuel use shows here.'
            : !s.fills ? 'Log a fill-up to see your fuel use. Your costs are counted below.'
            : 'Fuel use shows after your next full tank. Your first full tank is the starting point.';
        $('tiles').hidden = none;
        const set = (id, v, sub) => { $(id).textContent = v; $(id + '-sub').textContent = sub; };
        if (s.last) {
            const pct = s.segs.length > 1 ? M.comparePct(s.last, s.avg) : null;
            set('r-last', M.fmtEco(s.last.km, s.last.L, c.eco), 'over ' + M.fmtDist(s.last.km, c.du) + ', to ' + nice(s.last.date) + (pct != null ? '. ' + M.compareWords(pct).replace(/^./, x => x.toUpperCase()) : ''));
            $('r-last').parentNode.classList.toggle('worse', pct != null && Math.round(pct) <= -10);
        } else { set('r-last', '–', 'needs two full tanks'); $('r-last').parentNode.classList.remove('worse'); }
        set('r-avg', s.avg ? M.fmtEco(s.avg.km, s.avg.L, c.eco) : '–', s.avg ? 'over ' + M.fmtDist(s.avg.km, c.du) + ', ' + M.plural(s.segs.length, 'tank', 'tanks') : 'needs two full tanks');
        $('r-fuelkm-label').textContent = 'Fuel cost per ' + per; $('r-allkm-label').textContent = 'All costs per ' + per;
        set('r-fuelkm', s.fuelPerKm ? M.fmtRate(s.fuelPerKm.cents / 100 / (s.fuelPerKm.km / M.KM[c.du]), state.cur) : '–',
            s.fuelPerKm ? 'fuel only' : s.segs.length ? 'type the total paid for your fill-ups to see it' : 'needs two full tanks with the total paid');
        set('r-allkm', s.allPerKm ? M.fmtRate(s.allPerKm.cents / 100 / (s.allPerKm.km / M.KM[c.du]), state.cur) : '–',
            s.allPerKm ? 'fuel and other costs over ' + M.fmtDist(s.allPerKm.km, c.du) + (s.allPerKm.unpriced ? ' (some fill-ups have no price)' : '') : 'needs two fill-ups');
        // money spent
        const sp = $('spend'); sp.textContent = '';
        $('spend-h').hidden = none; sp.hidden = none;
        [['This month', M.monthName(s.monthKey), s.month], ['Last month', M.monthName(M.prevMonth(s.monthKey)), s.lastMonth], ['This year', today.slice(0, 4), s.year]].forEach(([n, sub, p]) => {
            const b = el('div', 'sp');
            b.appendChild(el('span', 't-label', n));
            b.appendChild(el('span', 'sp-val', money(p.total)));
            b.appendChild(el('span', 't-sub', 'fuel ' + money(p.fuel) + ' · other ' + money(p.other)));
            b.title = sub; sp.appendChild(b);
        });
        // fuel use per tank
        const segs = s.segs.slice(-10).reverse(), tr = $('trend'); tr.textContent = '';
        $('trend-wrap').hidden = segs.length < 1;
        const best = Math.max.apply(null, segs.map(x => x.km / x.L).concat([0.0001])), avgK = s.avg ? s.avg.km / s.avg.L : 0;
        segs.forEach(x => {
            const li = el('li', 'bar-row' + (s.segs.length > 1 && x.km / x.L < avgK * 0.995 ? ' below' : ''));
            const top = el('div', 'bar-top');
            top.appendChild(el('span', 'bar-date', nice(x.fromDate) + ' to ' + nice(x.date)));
            top.appendChild(el('b', 'bar-val', M.fmtEco(x.km, x.L, c.eco)));
            li.appendChild(top);
            const track = el('div', 'bar-track'), fill = el('div', 'bar-fill');
            fill.style.width = Math.max(4, Math.round(x.km / x.L / best * 100)) + '%';
            track.appendChild(fill); li.appendChild(track);
            if (li.classList.contains('below')) li.appendChild(el('span', 'bar-note', 'below your average'));
            tr.appendChild(li);
        });
    }

    // ---------- the log ----------
    function renderLog() {
        const c = car(), s = M.summary(c, today), byId = {};
        s.rows.forEach(r => { byId[r.e.id] = r; });
        const filter = $('show').value;
        const all = c.entries.slice().sort(M.order).reverse(), list = all.filter(e => filter === 'all' || e.t === filter);
        $('show-wrap').hidden = !all.length || (!all.some(e => e.t === 'cost'));
        if ($('show-wrap').hidden && filter !== 'all') { $('show').value = 'all'; return renderLog(); }
        $('log-empty').hidden = !!all.length;
        const ul = $('entries'); ul.textContent = '';
        list.slice(0, shown).forEach(e => {
            const li = el('li', 'entry ' + e.t + (editing === e.id ? ' being-edited' : ''));
            const top = el('div', 'e-top');
            top.appendChild(el('b', 'e-what', e.t === 'cost' ? e.cat : e.full ? 'Fill-up' : 'Part fill'));
            top.appendChild(el('span', 'e-date', nice(e.date)));
            li.appendChild(top);
            if (e.t === 'fill') {
                let t = M.fmtVol(e.vol, e.vu);
                if (e.total != null) t += ' · ' + money(e.total) + ' · ' + M.fmtPrice(Math.round(e.total * 1e4 / e.vol), state.cur) + ' per ' + M.VOL[e.vu].one;
                li.appendChild(el('p', 'e-main', t));
                li.appendChild(el('p', 'e-sub', e.trip != null ? 'Trip meter ' + M.fmtOdo(e.trip, e.du) : 'Odometer ' + M.fmtOdo(e.odo, e.du)));
                const w = M.rowWords(byId[e.id], c);
                li.appendChild(el('p', 'e-res ' + w.tone, (byId[e.id].status === 'seg' ? 'This tank: ' : '') + w.text));
            } else {
                li.appendChild(el('p', 'e-main', money(e.amount)));
                if (e.odo != null) li.appendChild(el('p', 'e-sub', 'Odometer ' + M.fmtOdo(e.odo, e.du)));
            }
            if (e.note) li.appendChild(el('p', 'e-sub e-note', e.note));
            const b = el('div', 'e-btns');
            b.appendChild(btn('secondary small', 'Edit', () => startEdit(e)));
            b.appendChild(btn('secondary small', 'Delete', () => {
                const before = snap(); if (editing === e.id) stopEditing();
                c.entries = c.entries.filter(x => x.id !== e.id); clearMsgs();
                commit(before); updateForm();
                say($('log-msg'), 'Deleted the ' + (e.t === 'fill' ? 'fill-up' : e.cat.toLowerCase() + ' cost') + ' from ' + nice(e.date) + '.', true);
            }));
            b.lastChild.setAttribute('aria-label', 'Delete the ' + (e.t === 'fill' ? 'fill-up' : e.cat + ' cost') + ' from ' + nice(e.date));
            b.firstChild.setAttribute('aria-label', 'Edit the ' + (e.t === 'fill' ? 'fill-up' : e.cat + ' cost') + ' from ' + nice(e.date));
            li.appendChild(b);
            ul.appendChild(li);
        });
        $('more').hidden = list.length <= shown;
        $('more').textContent = 'Show ' + Math.min(PAGE, list.length - shown) + ' more';
    }

    function render() {
        $('storage-warn').hidden = storageOK;
        renderCar(); renderResults(); renderLog();
        $('cur').value = state.cur;
    }

    // ---------- share and backup ----------
    function download(name, text, type) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([text], { type }));
        a.download = name; document.body.appendChild(a); a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    }
    const fileName = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'car';
    function copyText(text, box, okMsg) {
        const done = () => say(box, okMsg), fallback = () => {
            const t = el('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.position = 'absolute'; t.style.left = '-9999px';
            document.body.appendChild(t); t.select();
            let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
            t.remove(); ok ? done() : say(box, 'Copying is blocked here. Use "Email the summary" instead.');
        };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
    }

    function wire() {
        $('car').addEventListener('change', () => { state.carId = $('car').value; carPanel = null; stopEditing(); shown = PAGE; clearMsgs(); save(); render(); updateForm(); });
        $('car-edit').addEventListener('click', () => openCarPanel('edit'));
        $('car-add').addEventListener('click', () => openCarPanel('add'));
        $('cp-save').addEventListener('click', saveCar);
        $('cp-cancel').addEventListener('click', () => { carPanel = null; renderCar(); });
        $('cp-delete').addEventListener('click', deleteCar);
        $('cp-name').addEventListener('keydown', e => { if (e.key === 'Enter') saveCar(); });
        $('car-panel').addEventListener('keydown', e => { if (e.key === 'Escape') { carPanel = null; renderCar(); $('car-edit').focus(); } });

        document.querySelectorAll('input[name=mode]').forEach(r => r.addEventListener('change', () => { clearMsgs(); ['odo-err', 'vol-err', 'amount-err', 'codo-err'].forEach(id => { $(id).textContent = ''; }); updateForm(); }));
        $('date-open').addEventListener('click', () => { $('date-box').hidden = false; $('date').value = $('date').value || today; $('date').max = today; updateForm(); $('date').focus(); });
        $('date-today').addEventListener('click', () => { $('date').value = today; $('date-box').hidden = true; setErr('date-err', 'date', ''); updateForm(); $('date-open').focus(); });
        $('read-switch').addEventListener('click', () => { const c = car(); c.read = c.read === 'trip' ? 'odo' : 'trip'; save(); $('odo').value = ''; setErr('odo-err', 'odo', ''); updateForm(); $('odo').focus(); });
        $('more-open').addEventListener('click', () => { $('more-box').hidden = false; $('more-open').hidden = true; $('missed').focus(); });
        $('cmore-open').addEventListener('click', () => { $('cmore-box').hidden = false; $('cmore-open').hidden = true; $('codo').focus(); });
        ['odo', 'vol', 'price', 'total', 'amount', 'codo', 'note', 'cnote', 'date'].forEach(id => {
            $(id).addEventListener('input', () => {
                if (['vol', 'price', 'total'].includes(id)) { setErr('vol-err', null, ''); ['vol', 'price', 'total'].forEach(x => $(x).setAttribute('aria-invalid', 'false')); }
                else if (id === 'date') setErr('date-err', 'date', ''); else if (id === 'odo') setErr('odo-err', 'odo', ''); else if (id === 'amount') setErr('amount-err', 'amount', ''); else if (id === 'codo') setErr('codo-err', 'codo', '');
                updateForm();
            });
            $(id).addEventListener('keydown', e => { if (e.key === 'Enter' && id !== 'date') { e.preventDefault(); saveEntry(); } });
        });
        ['full', 'missed', 'cat'].forEach(id => $(id).addEventListener('change', updateForm));
        $('save').addEventListener('click', saveEntry);
        $('cancel-edit').addEventListener('click', () => { stopEditing(); updateForm(); render(); say($('add-msg'), 'Editing cancelled. Nothing was changed.'); });
        $('add').addEventListener('keydown', e => { if (e.key === 'Escape' && editing) { stopEditing(); updateForm(); render(); say($('add-msg'), 'Editing cancelled. Nothing was changed.'); } });

        $('show').addEventListener('change', () => { shown = PAGE; renderLog(); });
        $('more').addEventListener('click', () => { shown += PAGE; renderLog(); });

        $('copy').addEventListener('click', () => { clearMsgs('tools-msg'); copyText(M.summaryText(state, car(), today), $('tools-msg'), 'Copied the summary for ' + car().name + '. Paste it into a message or note.'); });
        $('email').addEventListener('click', () => {
            clearMsgs('tools-msg');
            const subject = 'Fuel log for ' + car().name, body = M.summaryText(state, car(), today);
            location.href = 'mailto:?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body.length > 1800 ? body.slice(0, 1800) + '\n…' : body);
            say($('tools-msg'), 'Your mail app should open with the summary written. Type who to send it to and press send.');
        });
        $('print').addEventListener('click', () => { clearMsgs(); window.print(); });
        $('csv').addEventListener('click', () => { clearMsgs('tools-msg'); download('fuel-log-' + fileName(car().name) + '-' + today + '.csv', '﻿' + M.csv(car(), state.cur), 'text/csv'); say($('tools-msg'), 'Saved the log of ' + car().name + ' as a CSV file. Open it in Excel, Numbers or Google Sheets.'); });
        $('backup').addEventListener('click', () => { clearMsgs('tools-msg'); download('fuel-log-backup-' + today + '.json', JSON.stringify(state, null, 1), 'application/json'); say($('tools-msg'), 'Saved a backup of ' + M.plural(state.cars.length, 'car', 'cars') + '. Keep the file somewhere safe.'); });
        $('restore').addEventListener('click', () => { $('restore-file').value = ''; $('restore-file').click(); });
        $('restore-file').addEventListener('change', () => {
            const file = $('restore-file').files[0]; clearMsgs('tools-msg');
            if (!file) return;
            if (file.size > 20e6) { say($('tools-msg'), 'That file is too big to be a backup from this app.'); return; }
            const r = new FileReader();
            r.onload = () => {
                let s = null; try { s = M.normalize(JSON.parse(r.result), LANG); } catch (e) { s = null; }
                if (!s) { say($('tools-msg'), 'That file is not a backup from this app, so nothing was changed.'); return; }
                const before = snap(); state = s; stopEditing(); carPanel = null; shown = PAGE;
                commit(before); updateForm();
                const n = s.cars.reduce((a, c) => a + c.entries.length, 0);
                say($('tools-msg'), 'Restored ' + M.plural(s.cars.length, 'car', 'cars') + ' with ' + M.plural(n, 'entry', 'entries') + '.', true);
            };
            r.onerror = () => say($('tools-msg'), 'That file could not be read, so nothing was changed.');
            r.readAsText(file);
        });
        $('cur').addEventListener('change', () => { state.cur = $('cur').value; save(); render(); updateForm(); });
        $('wipe').addEventListener('click', () => {
            const before = snap(); clearMsgs('tools-msg');
            state = Object.assign(M.emptyState(LANG), { cur: state.cur }); stopEditing(); carPanel = null; shown = PAGE;
            commit(before); updateForm();
            say($('tools-msg'), 'Deleted every car and entry.', true);
        });
        window.addEventListener('focus', () => { const t = M.dayStr(new Date()); if (t !== today) { today = t; render(); updateForm(); } });
    }

    function init() {
        load();
        const cs = $('cur'); Object.keys(CUR_NAMES).forEach(k => { const o = el('option', null, CUR_NAMES[k]); o.value = k; cs.appendChild(o); });
        M.CATS.forEach(k => { const o = el('option', null, k); o.value = k; $('cat').appendChild(o); });
        $('date').value = today; $('date').max = today;
        wire(); render(); updateForm();
        if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
    }
    init();
})();
