// Page code for Shift Work Calendar. All maths is in core.js. Typed text is always shown with textContent.
(function () {
    const C = window.ShiftCore, KEY = 'shift-work-calendar.state', DAY_MS = 86400000;
    const $ = id => document.getElementById(id);
    // dates in the visitor's English style (US or UK order); anything odd or not English falls back to en-GB
    const lang = (() => { const l = String(navigator.language || '').split(/[@_]/)[0]; try { return /^en(-|$)/i.test(l) && Intl.DateTimeFormat.supportedLocalesOf([l]).length ? l : 'en-GB'; } catch (e) { return 'en-GB'; } })();
    const fmt = (n, o) => new Intl.DateTimeFormat(lang, Object.assign({ timeZone: 'UTC' }, o)).format(new Date(n * DAY_MS));
    const longDay = n => fmt(n, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const shortDay = n => fmt(n, { weekday: 'short', day: 'numeric', month: 'short' });
    const time = t => { const m = C.mins(t); return m == null ? '' : new Intl.DateTimeFormat(lang, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }).format(new Date(Date.UTC(2000, 0, 1, Math.floor(m / 60), m % 60))); };
    function el(tag, attrs, kids) {
        const e = document.createElement(tag);
        Object.entries(attrs || {}).forEach(([k, v]) => { if (v == null || v === false) return; if (k === 'text') e.textContent = v; else if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : v); });
        (kids || []).forEach(c => c != null && e.append(c));
        return e;
    }
    // readable text on a coloured box
    function inkOn(hex) { const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255; return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#1a1a1a' : '#fff'; }

    let today = C.todayNum(), state, view = { y: 0, m: 0, sel: null, chip: null }, undoSnap = null, storageOk = true;
    const fresh = () => ({ v: 1, people: [C.newPerson('Me', '', C.isoOf(today))], active: 0, weekStart: /^en-US$/i.test(lang) ? 0 : 1, set: false });
    function load() {
        try { const raw = localStorage.getItem(KEY); state = raw ? C.cleanState(JSON.parse(raw)) : null; } catch (e) { state = null; }
        if (!state) state = fresh();
    }
    function save() {
        try { localStorage.setItem(KEY, JSON.stringify(state)); storageOk = true; }
        catch (e) { if (storageOk) say('Your browser is blocking storage, so this rota will be lost when you close the page. Save a backup file to keep it.'); storageOk = false; }
    }
    const P = () => state.people[state.active];
    const many = () => state.people.length > 1;
    const shiftText = (p, id) => { const t = C.typeOf(p, id); if (!C.isWork(id)) return t.name === 'Off' ? 'Day off' : t.name; return t.name + ' shift'; };
    function timesText(p, id) {
        if (!C.isWork(id)) return '';
        const t = C.typeOf(p, id), len = C.lengthMins(t);
        if (!len) return 'no times set';
        return time(t.start) + ' – ' + time(t.end) + (C.crossesMidnight(t) || len === 1440 ? ' next day' : '') + ' (' + C.fmtHours(len) + ')';
    }
    const inDays = n => n === today ? 'today' : n === today + 1 ? 'tomorrow' : n > today ? 'in ' + (n - today) + ' days' : (today - n) + ' days ago';

    // ---- messages with undo
    let msgTimer;
    function say(text, canUndo) {
        $('msg-text').textContent = text; $('msg-undo').hidden = !canUndo; $('msg').hidden = false;
        clearTimeout(msgTimer); msgTimer = setTimeout(() => { $('msg').hidden = true; undoSnap = null; }, canUndo ? 12000 : 6000);
    }
    function snapshot() { undoSnap = JSON.stringify(state); }
    $('msg-undo').addEventListener('click', () => {
        if (!undoSnap) return; const s = C.cleanState(JSON.parse(undoSnap)); undoSnap = null;
        if (s) { state = s; view.chip = null; save(); render(); say('Undone.'); }
    });

    // ---- today
    function renderToday() {
        $('today-title').textContent = 'Today, ' + fmt(today, { weekday: 'long', day: 'numeric', month: 'long' });
        const list = $('today-list'); list.replaceChildren();
        const now = new Date(), nowMin = now.getHours() * 60 + now.getMinutes();
        state.people.forEach(p => {
            const box = el('div', { class: 'who' });
            if (many()) box.append(el('p', { class: 'who-name', text: p.name }));
            if (!p.seq.length) { box.append(el('p', { class: 'big-line', text: 'No pattern yet' }), el('p', { class: 'line', text: 'Choose a pattern under ' + (many() ? p.name + "'s" : 'Your') + ' shift pattern to see the shifts.' })); list.append(box); return; }
            const s = C.shiftOn(p, today), t = C.typeOf(p, s.id);
            const badge = el('span', { class: 'badge' + (C.isWork(s.id) ? '' : ' rest'), text: C.shortOf(p, s.id) });
            if (t.color) { badge.style.background = t.color; badge.style.color = inkOn(t.color); }
            box.append(el('p', { class: 'big-line' }, [badge, ' ' + shiftText(p, s.id) + ' today']));
            if (C.isWork(s.id)) box.append(el('p', { class: 'line muted', text: timesText(p, s.id) }));
            if (s.changed) box.append(el('p', { class: 'line muted', text: 'Changed by hand. Your pattern says ' + shiftText(p, s.planned).toLowerCase() + '.' }));
            const w = C.atWorkNow(p, today, nowMin);
            if (w && w.fromYesterday) box.append(el('p', { class: 'line now', text: 'At work now: ' + C.typeOf(p, w.id).name.toLowerCase() + ' shift from last night, until ' + time(w.until) + '.' }));
            else if (w) box.append(el('p', { class: 'line now', text: 'At work now, until ' + time(w.until) + (C.crossesMidnight(C.typeOf(p, w.id)) || C.lengthMins(C.typeOf(p, w.id)) === 1440 ? ' tomorrow' : '') + '.' }));
            if (C.isWork(s.id)) {
                const off = C.nextOff(p, today);
                box.append(el('p', { class: 'line strong', text: off ? 'Next day off: ' + shortDay(off.day) + ' (' + inDays(off.day) + ')' + (off.run > 1 ? ', ' + off.run + ' days off in a row' : ', 1 day off') + '.' : 'Your pattern has no days off.' }));
            } else {
                const nx = C.nextWork(p, today + 1);
                const run = nx == null ? 0 : nx - today;
                box.append(el('p', { class: 'line strong', text: nx == null ? 'Your pattern has no shifts.' : 'Next shift: ' + shortDay(nx) + ' (' + inDays(nx) + '), ' + shiftText(p, C.shiftOn(p, nx).id).toLowerCase() + (timesText(p, C.shiftOn(p, nx).id) && C.lengthMins(C.typeOf(p, C.shiftOn(p, nx).id)) ? ' at ' + time(C.typeOf(p, C.shiftOn(p, nx).id).start) : '') + '.' }));
                if (run > 1) box.append(el('p', { class: 'line muted', text: run === 2 ? 'Off today and tomorrow.' : 'Off for ' + run + ' days, today included.' }));
            }
            list.append(box);
        });
        const tg = $('together'), ready = state.people.filter(p => p.seq.length);
        tg.replaceChildren();
        if (many() && ready.length === state.people.length) {
            const days = C.allOff(state.people, today, 5);
            const names = state.people.length === 2 ? state.people.map(p => p.name).join(' and ') : 'You all';
            if (!days.length) tg.append(el('p', { class: 'line strong', text: names + ' have no day off together in the next 2 years.' }));
            else {
                tg.append(el('p', { class: 'line strong', text: 'Next day ' + (state.people.length === 2 ? names + ' are both' : 'you are all') + ' off: ' + shortDay(days[0]) + ' (' + inDays(days[0]) + ').' }));
                if (days.length > 1) tg.append(el('p', { class: 'line muted', text: 'Then: ' + days.slice(1).map(n => shortDay(n)).join(' · ') }));
            }
            tg.hidden = false;
        } else tg.hidden = true;
    }

    // ---- setup
    function renderSetup() {
        const p = P();
        $('setup-title').textContent = many() ? 'Shift patterns' : 'Your shift pattern';
        const ppl = $('people'); ppl.replaceChildren(); ppl.hidden = !many();
        state.people.forEach((q, i) => ppl.append(el('button', { type: 'button', class: 'person-tab', 'aria-pressed': String(i === state.active), text: q.name, onclick: () => { state.active = i; view.chip = null; save(); render(); } })));
        if (document.activeElement !== $('p-name')) $('p-name').value = p.name;
        const sel = $('p-preset'); sel.replaceChildren();
        const pid = C.presetFor(p.seq);
        if (!p.seq.length) sel.append(el('option', { value: '', text: 'Choose your pattern…' }));
        C.PRESETS.forEach(pr => sel.append(el('option', { value: pr.id, text: pr.name })));
        sel.append(el('option', { value: 'own', text: 'My own pattern' }));
        sel.value = !p.seq.length ? (view.own ? 'own' : '') : (pid || 'own');

        const seq = $('p-seq'); seq.replaceChildren();
        if (view.chip != null && view.chip >= p.seq.length) view.chip = null;
        p.seq.forEach((id, i) => {
            const t = C.typeOf(p, id);
            const b = el('button', { type: 'button', class: 'chip' + (C.isWork(id) ? '' : ' rest'), 'aria-pressed': String(view.chip === i), 'aria-label': 'Day ' + (i + 1) + ': ' + shiftText(p, id) + '. Tap to change.',
                onclick: () => { view.chip = view.chip === i ? null : i; renderSetup(); const c = $('p-seq').children[i]; if (c) c.firstChild.focus(); } },
                [el('span', { class: 'chip-n', text: String(i + 1) }), el('span', { class: 'chip-s', text: C.shortOf(p, id) })]);
            if (t.color) { b.style.background = t.color; b.style.color = inkOn(t.color); }
            seq.append(el('li', {}, [b]));
        });
        const work = p.seq.filter(C.isWork).length;
        $('seq-info').textContent = p.seq.length ? p.seq.length + ' days, then it repeats: ' + work + ' worked, ' + (p.seq.length - work) + ' off.' + (p.seq.length >= C.MAX_DAYS ? ' This is the longest pattern allowed (14 weeks).' : '') : 'Empty. Choose a pattern above, or tap the buttons below in order to build your own.';

        const add = $('p-add'); add.replaceChildren();
        const editing = view.chip != null;
        $('add-label').textContent = editing ? 'Change day ' + (view.chip + 1) + ' to:' : 'Add a day to the end:';
        p.types.concat([C.REST.off]).forEach(t => {
            const b = el('button', { type: 'button', class: 'adder', text: (editing ? '' : '+ ') + (t.id === 'off' ? 'Off' : t.name),
                disabled: !editing && p.seq.length >= C.MAX_DAYS,
                onclick: () => {
                    if (editing) { p.seq[view.chip] = t.id; view.chip = null; } else p.seq.push(t.id);
                    view.own = true; state.set = true; save(); render();
                } });
            if (t.color) b.style.borderLeftColor = t.color;
            add.append(b);
        });
        $('p-undo-last').textContent = editing ? 'Delete day ' + (view.chip + 1) : 'Remove last day';
        $('p-clear').textContent = editing ? 'Done' : 'Clear pattern';
        $('p-undo-last').disabled = !p.seq.length; $('p-clear').disabled = !editing && !p.seq.length;

        if (document.activeElement !== $('p-start')) $('p-start').value = p.start;
        const chk = $('p-check');
        if (p.seq.length) { const s = C.shiftOn(p, today); chk.textContent = 'Check: today (' + shortDay(today) + ') is day ' + s.dayOfPattern + ' of ' + p.seq.length + ', ' + shiftText(p, C.shiftOn(p, today).planned).toLowerCase() + '. If that is wrong, change the date above.'; }
        else chk.textContent = '';

        const types = $('p-types'); types.replaceChildren();
        if (!p.types.length) types.append(el('li', { class: 'empty', text: 'No shifts yet. They appear here when you choose a pattern.' }));
        p.types.forEach(t => {
            const dot = el('span', { class: 'dot', 'aria-hidden': 'true' }); dot.style.background = t.color;
            const name = el('input', { type: 'text', maxlength: '20', value: t.name, 'aria-label': 'Name of this shift', autocomplete: 'off' });
            name.addEventListener('input', () => { t.name = C.cleanName(name.value, t.name, 20); save(); renderAllButSetupInputs(); });
            name.addEventListener('change', () => { name.value = t.name; });
            const mk = (k, lbl) => { const i = el('input', { type: 'time', value: t[k], 'aria-label': t.name + ' ' + lbl }); i.addEventListener('change', () => { t[k] = C.mins(i.value) == null ? '' : i.value; save(); renderAllButSetupInputs(); hrs.textContent = hoursText(t); }); return el('label', { class: 'tl' }, [el('span', { text: lbl }), i]); };
            const hrs = el('span', { class: 'hrs', text: hoursText(t) });
            const rm = el('button', { type: 'button', class: 'link small', text: 'Remove', onclick: () => {
                const r = C.removeType(p, t.id); if (r.error) return say(r.error);
                snapshot(); save(); render(); say(t.name + ' removed.', true);
            } });
            types.append(el('li', { class: 'type' }, [el('div', { class: 'type-top' }, [dot, name]), el('div', { class: 'type-times' }, [mk('start', 'Starts'), mk('end', 'Ends'), el('div', { class: 'type-foot' }, [hrs, rm])])]));
        });
        const at = $('p-addtype'); at.replaceChildren(el('option', { value: '', text: 'Choose…' }));
        Object.values(C.BUILT_IN).filter(b => !p.types.some(t => t.id === b.id)).forEach(b => at.append(el('option', { value: b.id, text: b.name + ' (' + time(b.start) + ' – ' + time(b.end) + ')' })));
        at.append(el('option', { value: 'own', text: 'Another shift with my own name' }));
        at.disabled = p.types.length >= C.MAX_TYPES;

        $('p-remove').hidden = !many();
        $('add-person').hidden = state.people.length >= C.MAX_PEOPLE;
        $('people-hint').hidden = many() || state.people.length >= C.MAX_PEOPLE;
        $('app').classList.toggle('first-run', !state.people.some(q => q.seq.length));
    }
    function hoursText(t) { const l = C.lengthMins(t); return l ? C.fmtHours(l) + (C.crossesMidnight(t) || l === 1440 ? ', ends next day' : '') : 'no times'; }

    $('p-name').addEventListener('input', () => { P().name = C.cleanName($('p-name').value, many() ? 'Person ' + (state.active + 1) : 'Me', 30); save(); renderAllButSetupInputs(); });
    $('p-name').addEventListener('change', () => { $('p-name').value = P().name; });
    $('p-preset').addEventListener('change', () => {
        const v = $('p-preset').value, p = P();
        if (v === 'own') { view.own = true; if (C.presetFor(p.seq)) { snapshot(); p.seq = []; save(); render(); say('Pattern cleared. Tap the buttons below in order to build your own.', true); } else render(); return; }
        if (!v) return;
        if (p.seq.length) snapshot();
        C.applyPreset(p, v, today); view.chip = null; state.set = true; save(); render();
        const pr = C.PRESETS.find(x => x.id === v);
        say(pr.monday ? 'Day 1 set to Monday of this week.' : 'Pattern set. Now check the date day 1 is on.', !!undoSnap);
    });
    $('p-undo-last').addEventListener('click', () => {
        const p = P(); if (!p.seq.length) return;
        snapshot();
        if (view.chip != null) { p.seq.splice(view.chip, 1); view.chip = null; } else p.seq.pop();
        save(); render(); say('Day removed.', true);
    });
    $('p-clear').addEventListener('click', () => {
        if (view.chip != null) { view.chip = null; return renderSetup(); }
        snapshot(); P().seq = []; view.own = true; save(); render(); say('Pattern cleared.', true);
    });
    $('p-start').addEventListener('change', () => {
        const v = $('p-start').value, n = C.dayNum(v);
        if (isNaN(n) || n < C.MIN_DAY || n > C.MAX_DAY) { say('Pick a full date between 1900 and 2200.'); $('p-start').value = P().start; return; }
        P().start = v; save(); render();
    });
    $('p-addtype').addEventListener('change', () => {
        const v = $('p-addtype').value; if (!v) return;
        const r = C.addType(P(), v === 'own' ? '' : v, '');
        if (r.error) say(r.error);
        save(); render();
        if (r.type && v === 'own') { const inputs = $('p-types').querySelectorAll('input[type=text]'); const last = inputs[inputs.length - 1]; if (last) { last.focus(); last.select(); } }
    });
    $('add-person').addEventListener('click', () => {
        if (state.people.length >= C.MAX_PEOPLE) return;
        state.people.push(C.newPerson('Person ' + (state.people.length + 1), '', C.isoOf(today)));
        state.active = state.people.length - 1; view.chip = null; view.own = false; save(); render();
        $('p-name').focus(); $('p-name').select();
        say('Type their name and choose their pattern.');
    });
    $('p-remove').addEventListener('click', () => {
        if (!many()) return; snapshot();
        const gone = state.people.splice(state.active, 1)[0];
        state.active = Math.max(0, state.active - 1); view.chip = null; save(); render(); say(gone.name + ' removed.', true);
    });

    // ---- calendar
    function renderCalendar() {
        const { y, m } = view, { first, count } = C.monthDays(y, m);
        $('month-title').textContent = fmt(first, { month: 'long', year: 'numeric' });
        $('week-start').value = String(state.weekStart);
        const head = $('grid-head'); head.replaceChildren();
        for (let i = 0; i < 7; i++) { const wd = (state.weekStart + i) % 7, ref = 3 + wd; head.append(el('th', { scope: 'col', abbr: fmt(ref, { weekday: 'long' }), text: fmt(ref, { weekday: 'narrow' }) })); }   // day 3 = Sunday 4 Jan 1970
        const body = $('grid-body'); body.replaceChildren();
        const lead = C.mod(C.weekday(first) - state.weekStart, 7);
        let tr = el('tr');
        for (let i = 0; i < lead; i++) tr.append(el('td', { class: 'pad' }));
        const ready = state.people.filter(p => p.seq.length);
        const together = many() && ready.length === state.people.length;
        for (let n = first; n < first + count; n++) {
            if (tr.children.length === 7) { body.append(tr); tr = el('tr'); }
            const parts = [], kids = [el('span', { class: 'dnum', text: String(n - first + 1) })];
            let changed = false;
            ready.forEach(p => {
                const s = C.shiftOn(p, n), t = C.typeOf(p, s.id);
                if (s.changed) changed = true;
                const pill = el('span', { class: 'pill' + (C.isWork(s.id) ? '' : ' rest') + (s.id === 'off' ? ' off' : ''), text: C.shortOf(p, s.id) });
                if (t.color) { pill.style.background = t.color; pill.style.color = inkOn(t.color); }
                kids.push(pill);
                parts.push((many() ? p.name + ': ' : '') + shiftText(p, s.id) + (C.isWork(s.id) && C.lengthMins(t) ? ' ' + timesText(p, s.id) : '') + (s.changed ? ' (changed)' : ''));
            });
            const allOff = together && state.people.every(p => !C.isWork(C.shiftOn(p, n).id));
            if (changed) kids.push(el('span', { class: 'mark', 'aria-hidden': 'true' }));
            const b = el('button', { type: 'button', class: 'cell' + (n === today ? ' is-today' : '') + (allOff ? ' all-off' : '') + (view.sel === n ? ' is-sel' : ''),
                'aria-label': longDay(n) + (n === today ? ', today' : '') + (parts.length ? ': ' + parts.join('; ') : '') + (allOff ? '. Everyone is off.' : ''),
                'aria-pressed': String(view.sel === n), onclick: () => { view.sel = view.sel === n ? null : n; renderCalendar(); if (view.sel != null) $('day').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); const c = [...$('grid-body').querySelectorAll('.cell')][n - first]; if (c) c.focus(); } }, kids);
            tr.append(el('td', {}, [b]));
        }
        while (tr.children.length < 7) tr.append(el('td', { class: 'pad' }));
        body.append(tr);

        // legend: one entry per shift type in use
        const lg = $('legend'); lg.replaceChildren();
        if (!ready.length) lg.append('Choose a pattern to see your shifts here.');
        else {
            const seen = new Set();
            ready.forEach(p => p.types.concat([C.REST.off, C.REST.hol, C.REST.sick]).forEach(t => {
                const key = C.shortOf(p, t.id) + '|' + t.name; if (seen.has(key)) return; seen.add(key);
                const sw = el('span', { class: 'pill' + (C.isWork(t.id) ? '' : ' rest') + (t.id === 'off' ? ' off' : ''), text: C.shortOf(p, t.id) });
                if (t.color) { sw.style.background = t.color; sw.style.color = inkOn(t.color); }
                lg.append(el('span', { class: 'lg' }, [sw, ' ' + t.name]));
            }));
            lg.append(el('span', { class: 'lg' }, [el('span', { class: 'mark static', 'aria-hidden': 'true' }), ' Changed by hand']));
            if (together) lg.append(el('span', { class: 'lg' }, [el('span', { class: 'ring', 'aria-hidden': 'true' }), ' Everyone off']));
            if (many()) lg.append(el('span', { class: 'lg order', text: 'In each day, top to bottom: ' + ready.map(p => p.name).join(', ') + '.' }));
        }
        renderDay(); renderTotals();
    }
    function renderDay() {
        const box = $('day'), n = view.sel;
        if (n == null) { box.hidden = true; return; }
        box.hidden = false;
        $('day-title').textContent = longDay(n) + (n === today ? ' (today)' : ' (' + inDays(n) + ')');
        const list = $('day-list'); list.replaceChildren();
        state.people.forEach(p => {
            const w = el('div', { class: 'who' });
            if (many()) w.append(el('p', { class: 'who-name', text: p.name }));
            if (!p.seq.length) { w.append(el('p', { class: 'line muted', text: 'No pattern yet.' })); list.append(w); return; }
            const s = C.shiftOn(p, n);
            w.append(el('p', { class: 'big-line', text: shiftText(p, s.id) }));
            if (C.isWork(s.id)) w.append(el('p', { class: 'line muted', text: timesText(p, s.id) }));
            w.append(el('p', { class: 'line muted', text: s.changed ? 'Changed by hand. Your pattern says ' + shiftText(p, s.planned).toLowerCase() + ' (day ' + s.dayOfPattern + ' of ' + p.seq.length + ').' : 'Day ' + s.dayOfPattern + ' of your ' + p.seq.length + '-day pattern.' }));
            const id = 'chg-' + p.id;
            const sel = el('select', { id });
            p.types.concat([C.REST.off, C.REST.hol, C.REST.sick]).forEach(t => sel.append(el('option', { value: t.id, text: C.isWork(t.id) ? t.name + ' shift' : t.id === 'off' ? 'Day off' : t.name })));
            sel.value = s.id;
            sel.addEventListener('change', () => { snapshot(); C.setChange(p, n, sel.value); save(); render(); say(sel.value === s.planned ? 'Back to pattern.' : 'Day changed. Your pattern stays the same.', true); });
            w.append(el('label', { for: id, text: 'Change this day' + (many() ? ' for ' + p.name : '') }), sel);
            if (s.changed) w.append(el('button', { type: 'button', class: 'secondary small-top', text: 'Back to pattern', onclick: () => { snapshot(); C.setChange(p, n, null); save(); render(); say('Back to pattern.', true); } }));
            list.append(w);
        });
    }
    $('day-close').addEventListener('click', () => { const n = view.sel; view.sel = null; renderCalendar(); const c = [...$('grid-body').querySelectorAll('.cell')][n - C.monthDays(view.y, view.m).first]; if (c) c.focus(); });
    function renderTotals() {
        const box = $('totals'); box.replaceChildren();
        const { first } = C.monthDays(view.y, view.m), label = fmt(first, { month: 'long' });
        state.people.filter(p => p.seq.length).forEach(p => {
            const st = C.monthStats(p, view.y, view.m);
            const by = Object.keys(st.by).map(id => st.by[id] + ' ' + C.typeOf(p, id).name.toLowerCase()).join(', ');
            const extra = [st.hol ? st.hol + ' holiday' : '', st.sick ? st.sick + ' sick' : ''].filter(Boolean).join(', ');
            box.append(el('div', { class: 'tot' }, [
                el('p', { class: 'who-name', text: (many() ? p.name + ' in ' : 'In ') + label }),
                el('p', { class: 'line', text: st.shifts + (st.shifts === 1 ? ' shift' : ' shifts') + (by ? ' (' + by + ')' : '') + ', ' + st.off + (st.off === 1 ? ' day off' : ' days off') + (extra ? ', ' + extra : '') + '.' }),
                el('p', { class: 'line muted', text: st.minutes ? C.fmtHours(st.minutes) + ' of shifts' + (st.noTime ? ' (' + st.noTime + ' without times not counted)' : '') + '.' : 'Add shift times to see the hours.' })
            ]));
        });
    }
    function goMonth(n) { const d = new Date(n * DAY_MS); view.y = d.getUTCFullYear(); view.m = d.getUTCMonth() + 1; }
    function shiftMonth(by) { let y = view.y, m = view.m + by; if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; } if (y < 1900 || y > 2200) return; view.y = y; view.m = m; view.sel = null; renderCalendar(); syncTools(); }
    $('prev').addEventListener('click', () => shiftMonth(-1));
    $('next').addEventListener('click', () => shiftMonth(1));
    $('to-today').addEventListener('click', () => { goMonth(today); view.sel = today; renderCalendar(); syncTools(); });
    $('goto').addEventListener('change', () => {
        const n = C.dayNum($('goto').value); if (isNaN(n) || n < C.MIN_DAY || n > C.MAX_DAY) return;
        goMonth(n); view.sel = n; renderCalendar(); syncTools(); $('day').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
    $('week-start').addEventListener('change', () => { state.weekStart = $('week-start').value === '0' ? 0 : 1; save(); renderCalendar(); });

    // ---- share and save
    function monthText() {
        const { first, count } = C.monthDays(view.y, view.m), ready = state.people.filter(p => p.seq.length);
        const lines = ['Shifts for ' + fmt(first, { month: 'long', year: 'numeric' }) + (ready.length === 1 && ready[0].name !== 'Me' ? ' (' + ready[0].name + ')' : ''), ''];
        for (let n = first; n < first + count; n++) {
            const bits = ready.map(p => { const s = C.shiftOn(p, n), t = C.typeOf(p, s.id); return (ready.length > 1 ? p.name + ': ' : '') + (C.isWork(s.id) ? t.name + (C.lengthMins(t) ? ' ' + time(t.start) + '–' + time(t.end) : '') : s.id === 'off' ? 'Off' : t.name); });
            lines.push(fmt(n, { weekday: 'short' }) + ' ' + String(n - first + 1).padStart(2, ' ') + '  ' + bits.join(' · ') + (ready.length > 1 && ready.every(p => !C.isWork(C.shiftOn(p, n).id)) ? '  (all off)' : ''));
        }
        lines.push('');
        ready.forEach(p => { const st = C.monthStats(p, view.y, view.m); lines.push((ready.length > 1 ? p.name + ': ' : 'Total: ') + st.shifts + ' shifts, ' + st.off + ' days off' + (st.minutes ? ', ' + C.fmtHours(st.minutes) : '') + '.'); });
        return lines.join('\n');
    }
    function syncTools() {
        const ready = state.people.some(p => p.seq.length);
        const subj = 'Shifts for ' + fmt(C.monthDays(view.y, view.m).first, { month: 'long', year: 'numeric' });
        $('email').href = ready ? 'mailto:?subject=' + encodeURIComponent(subj) + '&body=' + encodeURIComponent(monthText()) : '#';
        $('email').setAttribute('aria-disabled', String(!ready));
        ['copy', 'print', 'ics', 'backup'].forEach(id => { $(id).disabled = !ready; });
        const who = $('ics-who'); const keep = who.value; who.replaceChildren();
        state.people.filter(p => p.seq.length).forEach(p => who.append(el('option', { value: p.id, text: p.name })));
        if (state.people.filter(p => p.seq.length).length > 1) who.append(el('option', { value: 'all', text: 'Everyone' }));
        if ([...who.options].some(o => o.value === keep)) who.value = keep;
        $('ics-who-wrap').hidden = state.people.filter(p => p.seq.length).length < 2;
    }
    $('email').addEventListener('click', e => { if ($('email').getAttribute('aria-disabled') === 'true') { e.preventDefault(); say('Choose a pattern first.'); } });
    $('copy').addEventListener('click', () => {
        const t = monthText();
        const done = () => say('Copied. Paste it into any message.');
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done, () => fallbackCopy(t, done)); else fallbackCopy(t, done);
    });
    function fallbackCopy(t, done) { const ta = el('textarea', { readonly: true }); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.append(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (e) { say('Could not copy. Use Email this month instead.'); } ta.remove(); }
    $('print').addEventListener('click', () => { view.sel = null; renderCalendar(); window.print(); });
    function download(name, text, type) {
        const url = URL.createObjectURL(new Blob([text], { type })), a = el('a', { href: url, download: name });
        document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
    }
    const fileName = s => (s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'my');
    $('ics').addEventListener('click', () => {
        const months = +$('ics-range').value, ready = state.people.filter(p => p.seq.length); if (!ready.length) return;
        const from = months === 1 ? C.monthDays(view.y, view.m).first : today;
        const to = months === 1 ? from + C.monthDays(view.y, view.m).count - 1 : (() => { const d = new Date(today * DAY_MS); return Math.round(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, d.getUTCDate()) / DAY_MS) - 1; })();
        const who = $('ics-who').value, list = who === 'all' ? ready : ready.filter(p => p.id === who).length ? ready.filter(p => p.id === who) : [ready[0]];
        const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
        let events = 0, body = [];
        list.forEach(p => { const r = C.ics(p, from, to, ready.length > 1, stamp); events += r.events; body.push(r.text.split('\r\n').filter(l => l && !/^(BEGIN|END):VCALENDAR$|^(VERSION|PRODID|CALSCALE|METHOD):/.test(l)).join('\r\n')); });
        if (!events) return say('No shifts in those dates, so there is nothing to add.');
        const text = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//umar8092//Shift Work Calendar//EN\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\n' + body.filter(Boolean).join('\r\n') + '\r\nEND:VCALENDAR\r\n';
        download((who === 'all' ? 'everyone' : fileName(list[0].name)) + '-shifts.ics', text, 'text/calendar');
        say(events + (events === 1 ? ' shift' : ' shifts') + ' from ' + shortDay(from) + ' to ' + shortDay(to) + ' saved. Open the file to add them to your calendar.');
    });
    $('backup').addEventListener('click', () => { download('shift-work-calendar-backup-' + C.isoOf(today) + '.json', JSON.stringify(state, null, 1), 'application/json'); say('Backup saved. Keep the file somewhere safe.'); });
    $('restore').addEventListener('click', () => $('restore-file').click());
    $('restore-file').addEventListener('change', () => {
        const f = $('restore-file').files[0]; $('restore-file').value = ''; if (!f) return;
        if (f.size > 2000000) return say('That file is too big to be a backup from this app.');
        f.text().then(t => {
            let s = null; try { s = C.cleanState(JSON.parse(t)); } catch (e) { s = null; }
            if (!s) return say('That file is not a backup from Shift Work Calendar. Nothing was changed.');
            snapshot(); s.set = true; state = s; view.chip = null; view.sel = null; save(); render(); say('Backup restored: ' + s.people.map(p => p.name).join(', ') + '.', true);
        }, () => say('Could not read that file.'));
    });
    $('reset').addEventListener('click', () => { snapshot(); state = fresh(); view.chip = null; view.sel = null; view.own = false; save(); render(); window.scrollTo(0, 0); say('Everything cleared.', true); });

    function renderAllButSetupInputs() {
        // after typing a name or time: refresh everything except the field being typed in
        renderToday(); renderCalendar(); syncTools();
        const ppl = $('people'); [...ppl.children].forEach((b, i) => { b.textContent = state.people[i].name; });
        state.people.length && $('p-add') && [...$('p-add').children].forEach((b, i) => { const t = P().types.concat([C.REST.off])[i]; if (t) b.textContent = (view.chip != null ? '' : '+ ') + (t.id === 'off' ? 'Off' : t.name); });
        const chk = $('p-check'); const p = P(); if (p.seq.length) chk.textContent = 'Check: today (' + shortDay(today) + ') is day ' + C.shiftOn(p, today).dayOfPattern + ' of ' + p.seq.length + ', ' + shiftText(p, C.shiftOn(p, today).planned).toLowerCase() + '. If that is wrong, change the date above.';
    }
    function render() { renderToday(); renderSetup(); renderCalendar(); syncTools(); }

    // a new day starts at midnight, or when the phone wakes the page up
    function tick() { const t = C.todayNum(); if (t !== today) { const followed = view.y * 12 + view.m === (() => { const d = new Date(today * DAY_MS); return d.getUTCFullYear() * 12 + d.getUTCMonth() + 1; })(); today = t; if (followed) goMonth(today); render(); } else renderToday(); }
    setInterval(tick, 30000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });

    load(); goMonth(today); render();
    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
    window.__shift = { get state() { return state; }, setToday(n) { today = n; goMonth(n); render(); } };   // used by the tests
})();
