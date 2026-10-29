// Commute Pass or Pay Per Ride Tracker: the page. The logic lives in core.js.
(function () {
    'use strict';
    const C = window.CommuteCore;
    const KEY = 'commute-pass-or-pay-per-ride-tracker.state';
    const $ = id => document.getElementById(id);
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const btn = (cls, text, label) => { const b = el('button', cls, text); b.type = 'button'; if (label) b.setAttribute('aria-label', label); return b; };

    let canSave = true, state, today = C.todayIso();
    let logDay = today, view = C.ym(today);
    let editing = null;           // id of the ride being edited
    let buying = null;            // id of the pass whose "I bought this pass" form is open
    let allDays = false;          // show every day of the month, not only the latest 7

    // ---------- saving ----------
    function load() {
        let raw = null;
        try { raw = localStorage.getItem(KEY); } catch (e) { canSave = false; }
        if (raw) {
            try { const s = C.validate(JSON.parse(raw)); if (s) return s; } catch (e) { /* damaged: start fresh */ }
            setTimeout(() => show('set-msg', 'The saved rides could not be read, so the app started fresh.'), 0);
        }
        return C.emptyState();
    }
    function save() {
        try { localStorage.setItem(KEY, JSON.stringify(state)); canSave = true; } catch (e) { canSave = false; }
        $('storage-warn').hidden = canSave;
    }
    const snapshot = () => JSON.stringify(state);
    function restoreSnap(snap) { state = C.validate(JSON.parse(snap)) || state; editing = null; buying = null; commit(true); }
    function commit(rebuild) { save(); render(rebuild); }

    // ---------- messages with Undo ----------
    const MSGS = ['log-msg', 'mine-msg', 'list-msg', 'setup-msg', 'fill-msg', 'set-msg'];
    const timers = {};
    function show(id, text, undoSnap) {
        const box = $(id); if (!box) return;
        MSGS.forEach(o => { if (o !== id) clearMsg(o); });
        box.textContent = ''; box.classList.add('show');
        box.appendChild(el('span', null, text));
        if (undoSnap) {
            const b = btn('undo', 'Undo');
            b.addEventListener('click', () => { restoreSnap(undoSnap); show(id, 'Undone.'); });
            box.appendChild(b);
        }
        clearTimeout(timers[id]); timers[id] = setTimeout(() => clearMsg(id), undoSnap ? 15000 : 6000);
    }
    function clearMsg(id) { const b = $(id); if (b) { b.textContent = ''; b.classList.remove('show'); } }
    function setErr(input, errId, text) { $(errId).textContent = text || ''; if (input) input.setAttribute('aria-invalid', text ? 'true' : 'false'); }

    // ---------- helpers ----------
    const m = c => C.money(c, state.cur);
    const priced = () => state.fares.some(f => f.price != null);
    const fareById = id => state.fares.find(f => f.id === id);
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
        if (body.length > 1800) body = body.slice(0, 1800) + '\n...\n(Too long for an email link. Use "Copy this month" and paste it.)';
        return 'mailto:?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
    }
    const dayName = d => C.shortDate(d, today) + (d === today ? ' (today)' : d === C.addDays(today, -1) ? ' (yesterday)' : '');
    function fareLabel(f) { return f.name + (f.price == null ? ' (no price yet)' : ' · ' + m(f.price)); }
    function fillFareSelect(sel, value) {
        sel.textContent = '';
        state.fares.forEach(f => { const o = el('option', null, fareLabel(f)); o.value = f.id; sel.appendChild(o); });
        sel.value = fareById(value) ? value : state.fares[0].id;
    }

    // ---------- render ----------
    function render(rebuild) {
        document.body.classList.toggle('setup-first', !priced());
        if (rebuild !== false) { renderFares(); renderPasses(); $('s-cur').value = state.cur; }
        renderLog();
        renderSummary();
        renderMine();
        renderList();
        renderAhead();
        renderFill();
        $('mail').href = mailto('My commute costs: ' + C.monthName(view, true), C.summaryText(state, view, today));
    }

    function renderSummary() {
        $('m-name').textContent = C.monthName(view, true);
        $('m-next').disabled = view >= C.ym(today);
        $('to-now').hidden = view === C.ym(today);
        const b = $('sum-body'); b.textContent = '';
        if (!priced()) {
            b.appendChild(el('p', 'next', 'Start by typing what one ride costs'));
            b.appendChild(el('p', 'hint', 'Type the price under "Your fares and passes", then the price of the pass you are thinking about. Then log each ride with one tap.'));
            const go = btn('secondary go', 'Type my fare');
            go.addEventListener('click', () => { const i = document.querySelector('#fares .f-price'); if (i) { i.scrollIntoView({ block: 'center' }); i.focus(); } });
            b.appendChild(go);
            return;
        }
        const rep = C.monthReport(state, view, today);
        b.appendChild(el('p', 'next', C.monthHeadline(rep, state.cur)));
        if (!rep.rides) {
            b.appendChild(el('p', 'hint', rep.future ? '' : 'Tap "One way" or "There and back" each time you travel, or use "Fill in several days" for rides you did not log.'));
            return;
        }
        b.appendChild(el('p', 'facts-line', C.plural(rep.travelDays, 'day') + ' of travel, ' + (Math.round(rep.perRide / rep.rides) === rep.perRide / rep.rides ? m(rep.perRide / rep.rides) : 'about ' + m(Math.round(rep.perRide / rep.rides))) + ' a ride'));
        const v = C.monthVerdict(rep, state.cur);
        if (v) b.appendChild(el('p', 'verdict ' + (v.good ? 'good' : 'pay'), v.text));
        else b.appendChild(el('p', 'hint', 'Type the price of a pass under "Your fares and passes" to compare it.'));
        if (rep.cmp.options.length) {
            const ul = el('ul', 'options');
            ul.appendChild(el('li', 'opt-line base', 'Paying per ride: ' + m(rep.perRide)));
            rep.cmp.options.forEach(o => { const li = el('li', 'opt-line' + (rep.cmp.best && rep.cmp.best === o ? ' best' : ''), C.optionText(o, rep.perRide, state.cur)); ul.appendChild(li); });
            b.appendChild(ul);
        }
        if (rep.anyBought) {
            b.appendChild(el('p', 'spent', 'You spent ' + m(rep.spent) + ' this month: ' + (rep.passSpend ? m(rep.passSpend) + ' on passes bought this month + ' : '') + m(rep.notCovered) + ' on rides not on a pass.'));
        }
        if (rep.current) {
            const fare = C.usualFare(state), left = [];
            for (let d = C.addDays(today, 1); d <= rep.to; d = C.addDays(d, 1)) if (state.pace.wd.includes(C.weekday(d))) left.push(d);
            if (fare.price != null && left.length) {
                const more = left.length * state.pace.perDay, total = rep.rides + more;
                b.appendChild(el('p', 'hint', 'At your usual pace you will reach about ' + C.plural(total, 'ride') + ' (' + m(rep.perRide + more * fare.price) + ' paying per ride) by ' + C.shortDate(rep.to, today) + '.'));
            }
        }
    }

    function renderLog() {
        const d = $('l-date'); d.max = today; if (d.value !== logDay) d.value = logDay;
        $('d-next').disabled = logDay >= today;
        $('l-day').textContent = C.isDate(logDay) ? dayName(logDay) : '';
        $('w-fare').hidden = state.fares.length < 2;
        const sel = $('l-fare'), keep = sel.value || state.pace.fare;
        fillFareSelect(sel, keep);
        const f = fareById(sel.value);
        $('fare-line').textContent = f.price == null ? 'Type the price of ' + f.name + ' under "Your fares and passes" first.' : (state.fares.length < 2 ? f.name + ': ' : '') + m(f.price) + ' a ride';
        $('fare-line').classList.toggle('err', f.price == null);
        const ok = f.price != null;
        ['add1', 'add2', 'add-n'].forEach(id => { $(id).disabled = !ok; });
        const onDay = state.rides.filter(r => r.date === logDay).reduce((t, r) => t + r.n, 0);
        if (onDay && C.isDate(logDay)) $('l-day').textContent += ': ' + C.plural(onDay, 'ride') + ' logged';
    }

    function renderMine() {
        const ul = $('mine-list'); ul.textContent = '';
        const st = C.boughtStatus(state, today, state.cur).sort((a, b) => a.b.start < b.b.start ? 1 : -1);
        $('mine-empty').hidden = st.length > 0;
        st.slice(0, 30).forEach(s => {
            const li = el('li', 'box bought st-' + s.state);
            const h = el('div', 'box-head');
            h.appendChild(el('strong', null, s.b.name + ' · ' + m(s.b.price)));
            h.appendChild(el('span', 'tag', s.state === 'active' ? 'In use' : s.state === 'future' ? 'Not started' : s.b.kind === 'rides' ? 'Used up' : 'Ended'));
            li.appendChild(h);
            li.appendChild(el('p', 'small-line', 'Bought ' + C.shortDate(s.b.start, today)));
            s.lines.forEach((t, i) => li.appendChild(el('p', i === s.lines.length - 1 && s.state !== 'future' ? 'pass-verdict ' + (s.saved >= 0 ? 'good' : 'pay') : 'small-line', t)));
            const del = btn('secondary small', 'Delete', 'Delete ' + s.b.name + ' bought ' + C.shortDate(s.b.start, today));
            del.addEventListener('click', () => { const snap = snapshot(); state.bought = state.bought.filter(x => x.id !== s.b.id); commit(false); show('mine-msg', 'Deleted ' + s.b.name + '.', snap); });
            const row = el('div', 'row-btns'); row.appendChild(del); li.appendChild(row);
            ul.appendChild(li);
        });
    }

    function renderList() {
        $('list-h').textContent = 'Rides in ' + C.monthName(view, true);
        const ul = $('days'); ul.textContent = '';
        const from = view + '-01', to = C.monthEnd(from);
        const rides = state.rides.filter(r => r.date >= from && r.date <= to).sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
        $('list-empty').textContent = rides.length ? '' : 'No rides in ' + C.monthName(view) + '.';
        const cov = C.coverage(state).byEntry;
        const byDay = new Map(); rides.forEach(r => { if (!byDay.has(r.date)) byDay.set(r.date, []); byDay.get(r.date).push(r); });
        const SHOW = 7, entries = [...byDay.entries()];
        const more = $('more-days');
        more.hidden = entries.length <= SHOW;
        more.textContent = allDays ? 'Show only the latest ' + SHOW + ' days' : 'Show all ' + entries.length + ' days';
        more.setAttribute('aria-expanded', String(allDays));
        (allDays ? entries : entries.slice(0, SHOW)).forEach(([date, list]) => {
            const li = el('li', 'box day');
            const total = list.reduce((t, r) => t + r.n * r.price, 0), n = list.reduce((t, r) => t + r.n, 0);
            const h = el('div', 'box-head'); h.appendChild(el('strong', null, dayName(date))); h.appendChild(el('span', 'day-total', C.plural(n, 'ride') + ' · ' + m(total))); li.appendChild(h);
            list.forEach(r => li.appendChild(r.id === editing ? editRow(r) : rideRow(r, cov[r.id])));
            ul.appendChild(li);
        });
    }
    function rideRow(r, c) {
        const row = el('div', 'ride'), info = el('div', 'ride-info');
        info.appendChild(el('p', 'ride-text', r.fareName + ': ' + C.plural(r.n, 'ride') + ' × ' + m(r.price) + ' = ' + m(r.n * r.price)));
        if (c) info.appendChild(el('p', 'on-pass', (c.n === r.n ? 'On ' : c.n + ' on ') + c.names.join(' and ')));
        row.appendChild(info);
        const b = el('div', 'ride-btns');
        const minus = btn('secondary small', '−', 'One ride fewer on ' + C.shortDate(r.date, today)), plus = btn('secondary small', '+', 'One more ride on ' + C.shortDate(r.date, today));
        const ed = btn('secondary small', 'Edit', 'Edit rides on ' + C.shortDate(r.date, today)), del = btn('secondary small', 'Delete', 'Delete rides on ' + C.shortDate(r.date, today));
        minus.addEventListener('click', () => { const snap = snapshot(); if (r.n <= 1) { state.rides = state.rides.filter(x => x.id !== r.id); commit(false); show('list-msg', 'Deleted the ride on ' + C.shortDate(r.date, today) + '.', snap); } else { r.n--; commit(false); } });
        plus.disabled = r.n >= C.MAX_N;
        plus.addEventListener('click', () => { if (r.n < C.MAX_N) { r.n++; commit(false); } });
        ed.addEventListener('click', () => { editing = r.id; renderList(); const i = document.querySelector('#days .e-n'); if (i) i.focus(); });
        del.addEventListener('click', () => { const snap = snapshot(); state.rides = state.rides.filter(x => x.id !== r.id); commit(false); show('list-msg', 'Deleted ' + C.plural(r.n, 'ride') + ' on ' + C.shortDate(r.date, today) + '.', snap); });
        [minus, plus, ed, del].forEach(x => b.appendChild(x));
        row.appendChild(b);
        return row;
    }
    function editRow(r) {
        const f = el('div', 'ride edit');
        const id = 'e' + r.id;
        const l1 = el('label', null, 'Rides'); l1.htmlFor = id + 'n';
        const n = el('input', 'e-n'); n.id = id + 'n'; n.type = 'text'; n.inputMode = 'numeric'; n.maxLength = 2; n.value = r.n; n.autocomplete = 'off';
        const l2 = el('label', null, 'Price per ride'); l2.htmlFor = id + 'p';
        const p = el('input', 'e-p'); p.id = id + 'p'; p.type = 'text'; p.inputMode = 'decimal'; p.maxLength = 14; p.value = (r.price / 100).toFixed(r.price % 100 ? 2 : 0); p.autocomplete = 'off';
        const err = el('p', 'err'); err.id = id + 'err'; err.setAttribute('role', 'alert');
        n.setAttribute('aria-describedby', err.id); p.setAttribute('aria-describedby', err.id);
        const pair = el('div', 'pair'); const a = el('div'), b = el('div'); a.append(l1, n); b.append(l2, p); pair.append(a, b);
        const row = el('div', 'row-btns'); const sv = btn('primary', 'Save'), cn = btn('secondary', 'Cancel'); row.append(sv, cn);
        f.append(el('p', 'ride-text', r.fareName), pair, err, row);
        const doSave = () => {
            const cn2 = C.parseCount(n.value, 1, C.MAX_N), pr = C.parseMoney(p.value);
            if (cn2.empty || cn2.error) { err.textContent = 'Rides: ' + (cn2.error || 'type how many, 1 to ' + C.MAX_N + '.'); n.setAttribute('aria-invalid', 'true'); n.focus(); return; }
            if (pr.empty || pr.error) { err.textContent = 'Price per ride: ' + (pr.error || 'type a price, 0 for a free ride.'); p.setAttribute('aria-invalid', 'true'); p.focus(); return; }
            const snap = snapshot(); r.n = cn2.value; r.price = pr.value; editing = null; commit(false); show('list-msg', 'Saved the rides on ' + C.shortDate(r.date, today) + '.', snap);
        };
        sv.addEventListener('click', doSave);
        cn.addEventListener('click', () => { editing = null; renderList(); });
        [n, p].forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doSave(); } if (e.key === 'Escape') { editing = null; renderList(); } }));
        return f;
    }

    function renderAhead() {
        const wd = $('wd');
        if (!wd.children.length) {
            [1, 2, 3, 4, 5, 6, 0].forEach(d => {
                const l = el('label', 'wd-day'); const i = el('input'); i.type = 'checkbox'; i.value = d;
                i.addEventListener('change', () => { const set = new Set(state.pace.wd); if (i.checked) set.add(d); else set.delete(d); state.pace.wd = [...set].sort(); commit(false); });
                l.append(i, el('span', null, C.WD[d])); wd.appendChild(l);
            });
        }
        [...wd.querySelectorAll('input')].forEach(i => { i.checked = state.pace.wd.includes(+i.value); });
        const per = $('p-per'); if (document.activeElement !== per) per.value = state.pace.perDay;
        document.querySelectorAll('#quick-per .chip').forEach(c => c.setAttribute('aria-pressed', String(+c.dataset.v === state.pace.perDay)));
        $('w-pfare').hidden = state.fares.length < 2;
        fillFareSelect($('p-fare'), state.pace.fare);
        const next = C.addMonths(C.ym(today), 1);
        $('l-off').textContent = 'Days you will not travel in ' + C.monthName(next);
        const off = $('p-off'); if (document.activeElement !== off) off.value = state.pace.off;
        const rp = C.recentPace(state, today);
        $('recent').textContent = rp.rides ? 'Your last 4 weeks: ' + C.plural(rp.rides, 'ride') + ' on ' + C.plural(rp.days, 'day') + ', about ' + String(rp.perWeek) + ' a week.' : '';

        const b = $('ahead-body'); b.textContent = '';
        const fare = C.usualFare(state);
        if (fare.price == null) { b.appendChild(el('p', 'hint', 'Type the price of ' + fare.name + ' under "Your fares and passes" to see the answer.')); return; }
        if (!state.passes.some(p => p.price != null)) { b.appendChild(el('p', 'hint', 'Type the price of a pass under "Your fares and passes" to see whether it is worth buying.')); return; }
        if (!state.pace.wd.length) { b.appendChild(el('p', 'err', 'Tick at least one day you usually travel.')); return; }
        b.appendChild(el('h3', 'sub-h', 'If you buy it today'));
        const ul = el('ul', 'boxes');
        C.buyTodayLines(state, today, state.cur).forEach(x => {
            const li = el('li', 'box buy ' + (x.verdict === 'yes' ? 'good' : x.verdict === 'no' ? 'pay' : ''));
            li.appendChild(el('strong', null, x.pass.name + ' · ' + m(x.pass.price)));
            li.appendChild(el('p', 'small-line', x.text));
            ul.appendChild(li);
        });
        b.appendChild(ul);
        const plan = C.nextMonthPlan(state, today);
        b.appendChild(el('h3', 'sub-h', C.monthName(plan.ym, true) + ', the whole month'));
        b.appendChild(el('p', 'next small-next ' + (plan.best ? 'good' : 'pay'), C.planHeadline(plan, state.cur)));
        if (plan.rides) {
            b.appendChild(el('p', 'facts-line', C.plural(plan.days, 'travel day') + ' × ' + C.plural(state.pace.perDay, 'ride') + ' = ' + C.plural(plan.rides, 'ride') + (plan.off ? ' (' + C.plural(plan.off, 'day') + ' off taken away)' : '') + '.'));
            const ol = el('ul', 'options');
            ol.appendChild(el('li', 'opt-line base', 'Paying per ride: ' + m(plan.perRide)));
            plan.options.forEach(o => ol.appendChild(el('li', 'opt-line' + (plan.best === o ? ' best' : ''), C.optionText(o, plan.perRide, state.cur))));
            b.appendChild(ol);
        }
    }

    function renderFill() {
        $('w-gfare').hidden = state.fares.length < 2;
        const sel = $('g-fare'); fillFareSelect(sel, sel.value || state.pace.fare);
        $('g-from').max = today; $('g-to').max = today;
    }

    // ---------- fares and passes (rebuilt only when the list changes, so typing is never interrupted) ----------
    function field(labelText, input, id) { const w = el('div', 'fld'); const l = el('label', null, labelText); l.htmlFor = id; input.id = id; w.append(l, input); return w; }
    function textIn(cls, value, max, mode) { const i = el('input', cls); i.type = 'text'; i.value = value; i.maxLength = max; i.autocomplete = 'off'; if (mode) i.inputMode = mode; return i; }
    const moneyStr = v => v == null ? '' : (v / 100).toFixed(v % 100 ? 2 : 0);

    function renderFares() {
        const ul = $('fares'); ul.textContent = '';
        state.fares.forEach((f, idx) => {
            const li = el('li', 'box fare');
            const name = textIn('f-name', f.name, 40), price = textIn('f-price', moneyStr(f.price), 14, 'decimal');
            price.placeholder = '80';
            const err = el('p', 'err'); err.id = 'fe-' + f.id; err.setAttribute('role', 'alert'); price.setAttribute('aria-describedby', err.id);
            const pair = el('div', 'pair'); pair.append(field('Name', name, 'fn-' + f.id), field('Price per ride', price, 'fp-' + f.id));
            li.append(pair, err);
            name.addEventListener('change', () => { f.name = name.value.replace(/\s+/g, ' ').trim().slice(0, 40) || 'Ride ' + (idx + 1); name.value = f.name; commit(false); renderPassesCovers(); });
            price.addEventListener('change', () => {
                const r = C.parseMoney(price.value);
                if (r.error) { err.textContent = r.error; price.setAttribute('aria-invalid', 'true'); return; }
                err.textContent = ''; price.setAttribute('aria-invalid', 'false');
                const was = f.price; f.price = r.empty ? null : r.value; price.value = moneyStr(f.price);
                commit(false);
                if (was != null && f.price != null && was !== f.price) show('setup-msg', f.name + ' is now ' + m(f.price) + ' a ride. Rides already logged keep ' + m(was) + '.');
            });
            if (state.fares.length > 1) {
                const del = btn('secondary small', 'Delete this fare', 'Delete the fare ' + f.name);
                del.addEventListener('click', () => {
                    const snap = snapshot();
                    state.fares = state.fares.filter(x => x.id !== f.id);
                    state.passes.forEach(p => { if (p.covers) p.covers = p.covers.filter(id => id !== f.id); });
                    if (state.pace.fare === f.id) state.pace.fare = state.fares[0].id;
                    commit(true); show('setup-msg', 'Deleted the fare ' + f.name + '. Rides already logged keep their price.', snap);
                });
                const row = el('div', 'row-btns'); row.appendChild(del); li.appendChild(row);
            }
            ul.appendChild(li);
        });
        $('add-fare').hidden = state.fares.length >= C.MAX_FARES;
    }

    const KIND_OPTS = [['d7', '7 days from the day you start'], ['d30', '30 days from the day you start'], ['month', 'A calendar month (1st to last day)'], ['dN', 'Another number of days'], ['rides', 'A card with a number of rides']];
    const kindValue = p => p.kind === 'month' ? 'month' : p.kind === 'rides' ? 'rides' : p.days === 7 ? 'd7' : p.days === 30 ? 'd30' : 'dN';
    function renderPasses() {
        const ul = $('passes'); ul.textContent = '';
        state.passes.forEach((p, idx) => {
            const li = el('li', 'box pass'); li.dataset.id = p.id;
            const name = textIn('p-name', p.name, 40), price = textIn('p-price', moneyStr(p.price), 14, 'decimal');
            price.placeholder = '3000';
            const err = el('p', 'err'); err.id = 'pe-' + p.id; err.setAttribute('role', 'alert'); price.setAttribute('aria-describedby', err.id);
            const pair = el('div', 'pair'); pair.append(field('Name', name, 'pn-' + p.id), field('Price', price, 'pp-' + p.id));
            const kind = el('select', 'p-kind'); KIND_OPTS.forEach(([v, t]) => { const o = el('option', null, t); o.value = v; kind.appendChild(o); }); kind.value = kindValue(p);
            const kf = field('How long it lasts', kind, 'pk-' + p.id);
            const days = textIn('p-days', String(p.days), 3, 'numeric'), rides = textIn('p-rides', String(p.rides), 3, 'numeric');
            const dw = field('Number of days', days, 'pd-' + p.id), rw = field('Rides on the card', rides, 'pr-' + p.id);
            const derr = el('p', 'err'); derr.id = 'pde-' + p.id; derr.setAttribute('role', 'alert'); days.setAttribute('aria-describedby', derr.id); rides.setAttribute('aria-describedby', derr.id);
            const showKind = () => { const v = kind.value; dw.hidden = v !== 'dN'; rw.hidden = v !== 'rides'; };
            showKind();
            const cov = el('div', 'covers'); cov.dataset.id = p.id;
            li.append(pair, err, kf, dw, rw, derr, cov);
            fillCovers(cov, p);

            name.addEventListener('change', () => { p.name = name.value.replace(/\s+/g, ' ').trim().slice(0, 40) || 'Pass ' + (idx + 1); name.value = p.name; commit(false); });
            price.addEventListener('change', () => {
                const r = C.parseMoney(price.value);
                if (r.error) { err.textContent = r.error; price.setAttribute('aria-invalid', 'true'); return; }
                if (r.value === 0) { err.textContent = 'A pass that costs 0 is free: type its price.'; price.setAttribute('aria-invalid', 'true'); return; }
                err.textContent = ''; price.setAttribute('aria-invalid', 'false'); p.price = r.empty ? null : r.value; price.value = moneyStr(p.price); commit(false); updateBuyBtn(li, p);
            });
            kind.addEventListener('change', () => {
                const v = kind.value;
                if (v === 'd7') { p.kind = 'days'; p.days = 7; } else if (v === 'd30') { p.kind = 'days'; p.days = 30; }
                else if (v === 'month') p.kind = 'month'; else if (v === 'rides') p.kind = 'rides';
                else { p.kind = 'days'; if (p.days === 7 || p.days === 30) { p.days = 14; days.value = '14'; } }
                showKind(); derr.textContent = ''; commit(false); updateBuyBtn(li, p);
            });
            days.addEventListener('change', () => { const r = C.parseCount(days.value, 1, C.MAX_DAYS); if (r.empty || r.error) { derr.textContent = 'Number of days: use a whole number from 1 to ' + C.MAX_DAYS + '.'; days.setAttribute('aria-invalid', 'true'); return; } derr.textContent = ''; days.setAttribute('aria-invalid', 'false'); p.days = r.value; commit(false); });
            rides.addEventListener('change', () => { const r = C.parseCount(rides.value, 1, C.MAX_CARD); if (r.empty || r.error) { derr.textContent = 'Rides on the card: use a whole number from 1 to ' + C.MAX_CARD + '.'; rides.setAttribute('aria-invalid', 'true'); return; } derr.textContent = ''; rides.setAttribute('aria-invalid', 'false'); p.rides = r.value; commit(false); });

            // I bought this pass
            const buyB = btn('secondary buy-btn', 'I bought this pass');
            const bw = el('div', 'opt buy-form'); bw.hidden = buying !== p.id;
            const bd = el('input', 'b-date'); bd.type = 'date'; bd.value = today; bd.max = C.addDays(today, 60);
            const bhint = el('p', 'hint'); const berr = el('p', 'err'); berr.setAttribute('role', 'alert'); berr.id = 'be-' + p.id; bd.setAttribute('aria-describedby', berr.id);
            const bsave = btn('primary', 'Save'), bcancel = btn('secondary', 'Cancel');
            const brow = el('div', 'row-btns'); brow.append(bsave, bcancel);
            bw.append(field('It started on', bd, 'bd-' + p.id), bhint, berr, brow);
            const upHint = () => { if (!C.isDate(bd.value)) { bhint.textContent = ''; return; } const w = C.passWindow(p, bd.value); bhint.textContent = w.to ? 'Covers ' + C.shortDate(w.from, today) + ' to ' + C.shortDate(w.to, today) + '.' : 'Covers the next ' + C.plural(p.rides, 'ride') + ' from ' + C.shortDate(w.from, today) + '.'; };
            buyB.addEventListener('click', () => { if (p.price == null) { err.textContent = 'Type the price of this pass first.'; price.focus(); return; } buying = p.id; bw.hidden = false; bd.value = today; upHint(); bd.focus(); });
            bd.addEventListener('input', upHint);
            bcancel.addEventListener('click', () => { buying = null; bw.hidden = true; berr.textContent = ''; });
            bsave.addEventListener('click', () => {
                if (!C.isDate(bd.value)) { berr.textContent = 'Choose the day the pass started.'; bd.focus(); return; }
                if (bd.value > C.addDays(today, 60)) { berr.textContent = 'Choose a day in the next 60 days or before.'; bd.focus(); return; }
                if (state.bought.length >= 300) { berr.textContent = 'You have 300 passes saved, the most. Delete old ones first.'; return; }
                const snap = snapshot();
                state.bought.push({ id: C.uid('b'), passId: p.id, name: p.name, price: p.price, kind: p.kind, days: p.days, rides: p.rides, covers: p.covers ? p.covers.slice() : null, start: bd.value });
                buying = null; bw.hidden = true; berr.textContent = '';
                commit(false); show('setup-msg', 'Saved: ' + p.name + ' bought ' + C.shortDate(bd.value, today) + '. See "Passes you bought".', snap);
            });
            li.append(buyB, bw);
            updateBuyBtn(li, p);

            const del = btn('secondary small', 'Delete this pass', 'Delete the pass ' + p.name);
            del.addEventListener('click', () => { const snap = snapshot(); state.passes = state.passes.filter(x => x.id !== p.id); commit(true); show('setup-msg', 'Deleted ' + p.name + '. Passes you already bought stay.', snap); });
            const row = el('div', 'row-btns'); row.appendChild(del); li.appendChild(row);
            ul.appendChild(li);
        });
        $('add-pass').hidden = state.passes.length >= C.MAX_PASSES;
    }
    function updateBuyBtn(li, p) { const b = li.querySelector('.buy-btn'); if (b) b.setAttribute('aria-disabled', String(p.price == null)); }
    function fillCovers(cov, p) {
        cov.textContent = ''; cov.hidden = state.fares.length < 2;
        if (cov.hidden) return;
        cov.appendChild(el('p', 'label-like', 'Covers these rides'));
        state.fares.forEach(f => {
            const l = el('label', 'check'); const i = el('input'); i.type = 'checkbox'; i.checked = C.covers(p, f.id);
            i.addEventListener('change', () => {
                const set = new Set(p.covers || state.fares.map(x => x.id)); if (i.checked) set.add(f.id); else set.delete(f.id);
                p.covers = set.size === state.fares.length ? null : state.fares.map(x => x.id).filter(id => set.has(id)); commit(false);
            });
            l.append(i, el('span', null, f.name)); cov.appendChild(l);
        });
    }
    function renderPassesCovers() { document.querySelectorAll('#passes .covers').forEach(c => { const p = state.passes.find(x => x.id === c.dataset.id); if (p) fillCovers(c, p); }); }

    // ---------- logging ----------
    function addRides(date, fareId, n, msgId) {
        const f = fareById(fareId);
        if (!f || f.price == null) return false;
        if (!C.isDate(date)) { setErr($('l-date'), 'e-date', 'Choose a day.'); return false; }
        if (date > today) { setErr($('l-date'), 'e-date', 'That day has not come yet. Log rides on the day you travel.'); return false; }
        setErr($('l-date'), 'e-date', '');
        const snap = snapshot();
        let r = state.rides.find(x => x.date === date && x.fareId === f.id && x.price === f.price && x.n + n <= C.MAX_N);
        if (r) r.n += n;
        else {
            if (state.rides.length >= 5000) { show(msgId, 'You have 5,000 ride entries, the most this app keeps. Download them (CSV), then delete old months.'); return false; }
            r = { id: C.uid('r'), date, fareId: f.id, fareName: f.name, price: f.price, n }; state.rides.push(r);
        }
        if (C.ym(date) !== view) view = C.ym(date);
        commit(false);
        show(msgId, 'Added ' + C.plural(n, 'ride') + ' on ' + C.shortDate(date, today) + ' (' + m(n * f.price) + ').', snap);
        return true;
    }
    $('add1').addEventListener('click', () => addRides(logDay, $('l-fare').value, 1, 'log-msg'));
    $('add2').addEventListener('click', () => addRides(logDay, $('l-fare').value, 2, 'log-msg'));
    $('o-more').addEventListener('click', () => { $('w-more').hidden = false; $('o-more').hidden = true; $('l-n').focus(); });
    function addN() {
        const r = C.parseCount($('l-n').value, 1, C.MAX_N);
        if (r.empty || r.error) { setErr($('l-n'), 'e-n', r.error || 'Type how many rides, 1 to ' + C.MAX_N + '.'); $('l-n').focus(); return; }
        setErr($('l-n'), 'e-n', '');
        if (addRides(logDay, $('l-fare').value, r.value, 'log-msg')) $('l-n').value = '';
    }
    $('add-n').addEventListener('click', addN);
    $('l-n').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addN(); } });
    $('l-fare').addEventListener('change', () => renderLog());
    $('l-date').addEventListener('change', () => {
        const v = $('l-date').value;
        if (!C.isDate(v)) { setErr($('l-date'), 'e-date', 'Choose a day.'); return; }
        if (v > today) { setErr($('l-date'), 'e-date', 'That day has not come yet. Log rides on the day you travel.'); return; }
        setErr($('l-date'), 'e-date', ''); logDay = v; if (C.ym(v) !== view) view = C.ym(v); render(false);
    });
    $('d-prev').addEventListener('click', () => { logDay = C.addDays(C.isDate(logDay) ? logDay : today, -1); setErr($('l-date'), 'e-date', ''); if (C.ym(logDay) !== view) view = C.ym(logDay); render(false); });
    $('d-next').addEventListener('click', () => { if (logDay < today) { logDay = C.addDays(logDay, 1); if (C.ym(logDay) !== view) view = C.ym(logDay); render(false); } });

    // ---------- month navigation ----------
    $('more-days').addEventListener('click', () => { allDays = !allDays; renderList(); });
    $('m-prev').addEventListener('click', () => { view = C.addMonths(view, -1); editing = null; render(false); });
    $('m-next').addEventListener('click', () => { if (view < C.ym(today)) { view = C.addMonths(view, 1); editing = null; render(false); } });
    $('to-now').addEventListener('click', () => { view = C.ym(today); render(false); });

    // ---------- your usual travel ----------
    function setPer(v) { const r = C.parseCount(v, 1, 20); if (r.empty || r.error) { setErr($('p-per'), 'e-per', 'Use a whole number from 1 to 20.'); return; } setErr($('p-per'), 'e-per', ''); state.pace.perDay = r.value; commit(false); }
    $('p-per').addEventListener('change', () => setPer($('p-per').value));
    $('quick-per').addEventListener('click', e => { const c = e.target.closest('.chip'); if (c) { $('p-per').value = c.dataset.v; setPer(c.dataset.v); } });
    $('p-fare').addEventListener('change', () => { state.pace.fare = $('p-fare').value; commit(false); });
    $('p-off').addEventListener('change', () => {
        const v = $('p-off').value.trim() === '' ? '0' : $('p-off').value, r = C.parseCount(v, 0, 31);
        if (r.error) { setErr($('p-off'), 'e-off', 'Use a whole number from 0 to 31.'); return; }
        setErr($('p-off'), 'e-off', ''); state.pace.off = r.value; commit(false);
    });

    // ---------- setup buttons ----------
    $('add-fare').addEventListener('click', () => {
        if (state.fares.length >= C.MAX_FARES) return;
        const snap = snapshot(); state.fares.push({ id: C.uid('f'), name: 'Ride ' + (state.fares.length + 1), price: null }); commit(true);
        const boxes = document.querySelectorAll('#fares .f-name'); const i = boxes[boxes.length - 1]; i.focus(); i.select();
        show('setup-msg', 'Added a fare. Type its name and price.', snap);
    });
    $('add-pass').addEventListener('click', () => {
        if (state.passes.length >= C.MAX_PASSES) return;
        const snap = snapshot(); state.passes.push({ id: C.uid('p'), name: 'Pass ' + (state.passes.length + 1), price: null, kind: 'days', days: 7, rides: 10, covers: null }); commit(true);
        const boxes = document.querySelectorAll('#passes .p-name'); const i = boxes[boxes.length - 1]; i.focus(); i.select();
        show('setup-msg', 'Added a pass. Type its name and price and choose how long it lasts.', snap);
    });
    const curSel = $('s-cur');
    C.CURRENCIES.forEach(c => { const o = el('option', null, c || 'None (plain numbers)'); o.value = c; curSel.appendChild(o); });
    curSel.addEventListener('change', () => { state.cur = curSel.value; commit(true); });

    // ---------- fill in several days ----------
    $('g-go').addEventListener('click', () => {
        const from = $('g-from').value, to = $('g-to').value, nr = C.parseCount($('g-n').value, 1, C.MAX_N), f = fareById($('g-fare').value);
        const e = t => { $('e-fill').textContent = t; };
        if (!C.isDate(from) || !C.isDate(to)) return e('Choose both dates.');
        if (to < from) return e('"To" is before "From". Swap the dates.');
        if (to > today) return e('"To" is after today. Fill in days that have passed.');
        if (C.diff(from, to) > 366) return e('Fill in at most a year at a time.');
        if (nr.empty || nr.error) return e('Rides each day: use a whole number from 1 to ' + C.MAX_N + '.');
        if (!f || f.price == null) return e('Type the price of ' + (f ? f.name : 'the ride') + ' under "Your fares and passes" first.');
        if (!state.pace.wd.length) return e('Tick the days you usually travel under "Should I buy a pass?".');
        const days = []; for (let d = from; d <= to; d = C.addDays(d, 1)) if (state.pace.wd.includes(C.weekday(d))) days.push(d);
        if (!days.length) return e('None of your usual travel days fall between these dates.');
        if (state.rides.length + days.length > 5000) return e('That is more than the 5,000 entries this app keeps.');
        e('');
        const snap = snapshot();
        let skipped = 0;
        days.forEach(d => { if (state.rides.some(r => r.date === d)) { skipped++; return; } state.rides.push({ id: C.uid('r'), date: d, fareId: f.id, fareName: f.name, price: f.price, n: nr.value }); });
        const added = days.length - skipped;
        if (!added) return e('Every one of those days already has rides logged. Nothing was added.');
        view = C.ym(to); commit(false);
        show('fill-msg', 'Added ' + C.plural(added * nr.value, 'ride') + ' on ' + C.plural(added, 'day') + (skipped ? '. ' + C.plural(skipped, 'day') + ' that already had rides were left as they were' : '') + '.', snap);
    });

    // ---------- share and backup ----------
    $('copy').addEventListener('click', () => copyText(C.summaryText(state, view, today)).then(ok => show('set-msg', ok ? 'Copied. Paste it into a message or note.' : 'Could not copy. Use "Email this month" instead.')));
    $('csv').addEventListener('click', () => { if (!state.rides.length) return show('set-msg', 'There are no rides to download yet.'); download('commute-rides-' + today + '.csv', 'text/csv', C.csv(state)); show('set-msg', 'Downloaded all ' + C.plural(state.rides.reduce((t, r) => t + r.n, 0), 'ride') + '.'); });
    $('print').addEventListener('click', () => window.print());
    $('backup').addEventListener('click', () => { download('commute-pass-backup-' + today + '.json', 'application/json', JSON.stringify(state, null, 1)); show('set-msg', 'Backup saved. Keep the file to restore your rides on any device.'); });
    $('restore').addEventListener('click', () => $('restore-file').click());
    $('restore-file').addEventListener('change', () => {
        const file = $('restore-file').files[0]; if (!file) return;
        if (file.size > 5e6) { show('set-msg', 'That file is too large to be a backup from this app.'); $('restore-file').value = ''; return; }
        const rd = new FileReader();
        rd.onload = () => {
            let s = null; try { s = C.validate(JSON.parse(rd.result)); } catch (e) { s = null; }
            $('restore-file').value = '';
            if (!s) return show('set-msg', 'That file is not a backup from this app. Nothing was changed.');
            const snap = snapshot(); state = s; editing = null; buying = null; commit(true);
            show('set-msg', 'Restored ' + C.plural(s.rides.reduce((t, r) => t + r.n, 0), 'ride') + ' and ' + C.plural(s.passes.length, 'pass', 'passes') + '.', snap);
        };
        rd.onerror = () => show('set-msg', 'Could not read that file.');
        rd.readAsText(file);
    });
    $('wipe').addEventListener('click', () => { const snap = snapshot(); state = C.emptyState(); editing = null; buying = null; view = C.ym(today); logDay = today; commit(true); show('set-msg', 'Everything was deleted.', snap); });

    // ---------- midnight ----------
    setInterval(() => {
        const t = C.todayIso();
        if (t !== today) { const wasToday = logDay === today, wasView = view === C.ym(today); today = t; if (wasToday) logDay = t; if (wasView) view = C.ym(t); render(false); }
    }, 30000);

    state = load();
    save();
    render(true);
    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
