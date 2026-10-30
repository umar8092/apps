// Bus and Train Timetable for My Stops: the page. The rules are in core.js (TTCore).
(function () {
    'use strict';
    const C = window.TTCore;
    const KEY = 'bus-and-train-timetable-for-my-stops.state';
    const $ = id => document.getElementById(id);
    let state = { v: 1, routes: [], holidays: [] };
    let storeOK = true, undoSnap = null, toastTimer = null;
    let editingId = null, editorNode = null, addingMore = false;
    const openFull = {};          // route id -> day offset shown in "Full timetable"

    // ---------- saving ----------
    function load() {
        try {
            const raw = localStorage.getItem(KEY);
            if (raw) { const s = C.cleanState(JSON.parse(raw)); if (s) state = s; }
        } catch (e) { /* corrupt or blocked: start fresh */ }
    }
    function save() {
        try { localStorage.setItem(KEY, JSON.stringify(state)); storeOK = true; } catch (e) { storeOK = false; }
        $('store-warn').hidden = storeOK;
    }
    function toast(text, canUndo) {
        $('toast-text').textContent = text;
        $('toast-undo').hidden = !canUndo;
        $('toast').hidden = false;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => { $('toast').hidden = true; if (canUndo) undoSnap = null; }, canUndo ? 10000 : 4000);
    }
    function withUndo(text, fn) { undoSnap = JSON.stringify(state); fn(); save(); render(); toast(text, true); }
    $('toast-undo').addEventListener('click', () => {
        if (!undoSnap) return;
        const s = C.cleanState(JSON.parse(undoSnap)); if (s) state = s;
        undoSnap = null; closeEditor(); save(); render(); toast('Undone.', false);
    });

    // ---------- small helpers ----------
    function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
    function btn(text, cls, fn) { const b = el('button', cls, text); b.type = 'button'; b.addEventListener('click', fn); return b; }
    const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    const route = id => state.routes.find(r => r.id === id);
    let fieldN = 0;
    function field(labelText, inp) {
        const f = el('div', 'field'), l = el('label', null, labelText);
        inp.id = inp.id || 'f' + (++fieldN); l.htmlFor = inp.id; f.append(l, inp); return f;
    }
    function input(type, attrs) { const i = document.createElement('input'); i.type = type; Object.assign(i, attrs || {}); return i; }
    function readTime(inp) { const m = /^(\d{2}):(\d{2})/.exec(inp.value || ''); return m ? +m[1] * 60 + +m[2] : null; }
    function download(name, type, text) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([text], { type }));
        a.download = name; document.body.appendChild(a); a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    }
    async function copyText(text) {
        try { await navigator.clipboard.writeText(text); return true; } catch (e) {
            const t = el('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
            document.body.appendChild(t); t.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (e2) { ok = false; } t.remove(); return ok;
        }
    }
    const todayStr = () => C.dateStr(new Date());
    const timeLabel = min => C.hhmm(min) + (min >= C.DAY ? ' (after midnight)' : '');

    // ---------- the editor (new stop and Edit) ----------
    function makeEditor(r) {
        const isNew = !r;
        const wrap = el('div', 'editor');
        wrap.append(el('h3', 'first', 'Where does it take you?'));
        const q = el('div', 'quick'); q.setAttribute('role', 'group'); q.setAttribute('aria-label', 'Quick pick');
        const name = input('text', { maxLength: 60, autocomplete: 'off', placeholder: 'e.g. Bus 42 to City Centre', value: r ? r.name : '' });
        ['To work', 'To home', 'To school', 'To university', 'To city centre'].forEach(n => q.append(btn(n, 'chip', () => { name.value = n; name.removeAttribute('aria-invalid'); nameErr.textContent = ''; })));
        wrap.append(q, field('Name', name));
        const nameErr = el('p', 'err'); nameErr.setAttribute('role', 'alert'); wrap.append(nameErr);

        const stop = input('text', { maxLength: 80, autocomplete: 'off', placeholder: 'e.g. Main Market stop', value: r ? r.stop : '' });
        const stopBox = field('Stop or station where you get on (optional)', stop);
        const stopBtn = btn('+ Add the stop name (optional)', 'link', () => { stopBox.hidden = false; stopBtn.hidden = true; stop.focus(); });
        stopBox.hidden = !(r && r.stop); stopBtn.hidden = !stopBox.hidden;
        wrap.append(stopBtn, stopBox);

        const walkSel = document.createElement('select');
        [['0', 'Do not count'], ['2', '2 min'], ['3', '3 min'], ['5', '5 min'], ['7', '7 min'], ['10', '10 min'], ['15', '15 min'], ['20', '20 min'], ['other', 'Other…']]
            .forEach(([v, t]) => { const o = el('option', null, t); o.value = v; walkSel.append(o); });
        const walkOther = input('text', { inputMode: 'numeric', maxLength: 3, placeholder: '0 to 120', autocomplete: 'off' });
        const w = r ? r.walk : 0;
        if ([0, 2, 3, 5, 7, 10, 15, 20].includes(w)) walkSel.value = String(w); else { walkSel.value = 'other'; walkOther.value = String(w); }
        const walkOtherBox = field('Walk in minutes', walkOther); walkOtherBox.hidden = walkSel.value !== 'other';
        walkSel.addEventListener('change', () => { walkOtherBox.hidden = walkSel.value !== 'other'; if (!walkOtherBox.hidden) walkOther.focus(); });
        const walkErr = el('p', 'err'); walkErr.setAttribute('role', 'alert');
        const walkRow = el('div', 'two'); walkRow.append(field('Walk to the stop', walkSel), walkOtherBox);
        wrap.append(walkRow, el('p', 'hint', 'Used to tell you when to leave. Count the time to reach the platform too.'), walkErr);

        wrap.append(el('h3', null, 'Departure times'));
        wrap.append(el('p', 'hint top', 'The times it leaves your stop, from the timetable. Leave a set empty if nothing runs on those days.'));
        let presets = null;
        if (isNew) {
            presets = el('div', 'quick presets'); presets.setAttribute('role', 'group'); presets.setAttribute('aria-label', 'Days');
            presets.append(btn('Same times every day', 'chip', () => setGroups([{ days: [0, 1, 2, 3, 4, 5, 6] }])),
                btn('Weekdays, Saturday, Sunday', 'chip', () => setGroups([{ days: [1, 2, 3, 4, 5] }, { days: [6] }, { days: [0] }])));
            wrap.append(presets);
        }
        const list = el('div', 'slots'); wrap.append(list);
        const addG = btn('+ Add times for other days', 'link add-slot', () => { addGroup({ days: [] }).querySelector('.day input').focus(); refresh(); });
        const info = el('p', 'hint info'); info.setAttribute('aria-live', 'polite');
        wrap.append(addG, info);

        function setGroups(gs) {
            const texts = [...list.children].map(b => b._area.value);
            if (texts.slice(gs.length).some(t => t.trim()) && !confirm('Remove the times typed in the extra sets?')) return;
            list.textContent = '';
            gs.forEach((g, i) => addGroup({ days: g.days, text: texts[i] || '' }));
            refresh();
        }
        function addGroup(g) {
            const box = el('div', 'slot');
            const head = el('div', 'slot-h');
            const title = el('p', 'slot-t');
            const rm = btn('Remove these times', 'link inline danger-t', () => { box.remove(); refresh(); });
            head.append(title, rm);
            const fs = el('fieldset', 'days'); fs.append(el('legend', null, 'On these days'));
            const chips = el('div', 'day-chips');
            C.WEEK.forEach(d => {
                const l = el('label', 'day'), c = input('checkbox', { value: String(d), checked: (g.days || []).includes(d) });
                c.setAttribute('aria-label', C.DAY_LONG[d]);
                c.addEventListener('change', refresh);
                l.append(c, el('span', null, C.DAY_SHORT[d])); chips.append(l);
            });
            fs.append(chips);
            const area = document.createElement('textarea');
            area.rows = 3; area.maxLength = 20000; area.spellcheck = false; area.autocomplete = 'off';
            area.placeholder = 'e.g. 07:15 07:40 08:05 08:30';
            area.value = g.text != null ? g.text : (g.times ? C.timesText(g.times) : '');
            area.addEventListener('input', () => { area.removeAttribute('aria-invalid'); refresh(); });
            const sum = el('p', 'hint sum'), err = el('p', 'err'); err.setAttribute('role', 'alert');

            // every N minutes
            const nBox = el('div', 'sub-box every'); nBox.hidden = true;
            const nFrom = input('time', { value: '06:00' }), nTo = input('time', { value: '22:00' });
            const nStep = input('text', { inputMode: 'numeric', maxLength: 3, value: '15', autocomplete: 'off' });
            const nRow = el('div', 'three'); nRow.append(field('From', nFrom), field('To', nTo), field('Every (min)', nStep));
            const nErr = el('p', 'err'); nErr.setAttribute('role', 'alert');
            nBox.append(nRow, nErr, btn('Add these times', 'secondary', () => {
                const step = /^\s*\d{1,3}\s*$/.test(nStep.value) ? +nStep.value : NaN;
                const ts = C.everyN(readTime(nFrom), readTime(nTo), step);
                if (readTime(nFrom) == null || readTime(nTo) == null) { nErr.textContent = 'Set both times.'; return; }
                if (!ts) { nErr.textContent = 'Every must be a whole number of minutes from 1 to 240.'; nStep.setAttribute('aria-invalid', 'true'); nStep.focus(); return; }
                nErr.textContent = ''; nStep.removeAttribute('aria-invalid');
                const merged = [...new Set(C.parseTimes(area.value).times.concat(ts))].sort((a, b) => a - b);
                area.value = C.timesText(merged); area.removeAttribute('aria-invalid');
                nBox.hidden = true; nOpen.hidden = false; refresh();
                toast('Added ' + ts.length + ' times, ' + C.hhmm(ts[0]) + ' to ' + C.hhmm(ts[ts.length - 1]) + '.', false);
            }));
            const nOpen = btn('+ Add times every N minutes', 'link', () => { nBox.hidden = false; nOpen.hidden = true; nStep.focus(); });

            // only between dates
            const dBox = el('div', 'sub-box dates');
            const dFrom = input('date', { value: g.from || '' }), dTo = input('date', { value: g.until || '' });
            const dRow = el('div', 'two'); dRow.append(field('From', dFrom), field('Until (included)', dTo));
            const dErr = el('p', 'err'); dErr.setAttribute('role', 'alert');
            dBox.append(el('p', 'hint top', 'Between these dates these times replace the normal times on the ticked days.'), dRow, dErr,
                btn('No dates, use all year', 'link inline', () => { dFrom.value = ''; dTo.value = ''; dBox.hidden = true; dOpen.hidden = false; refresh(); }));
            const dOpen = btn('+ Only between dates (optional)', 'link', () => { dBox.hidden = false; dOpen.hidden = true; dFrom.focus(); });
            dBox.hidden = !(g.from || g.until); dOpen.hidden = !dBox.hidden;
            [dFrom, dTo].forEach(i => i.addEventListener('change', refresh));

            const areaField = field('Departure times', area);
            box.append(head, fs, areaField, sum, err, nOpen, nBox, dOpen, dBox);
            Object.assign(box, { _title: title, _rm: rm, _area: area, _sum: sum, _err: err, _days: () => [...chips.querySelectorAll('input:checked')].map(c => +c.value),
                _from: dFrom, _to: dTo, _dErr: dErr, _dBox: dBox });
            list.append(box);
            return box;
        }
        function readGroups() {
            return [...list.children].map(b => ({ box: b, days: b._days(), parsed: C.parseTimes(b._area.value),
                from: b._dBox.hidden ? '' : b._from.value, until: b._dBox.hidden ? '' : b._to.value }));
        }
        function refresh() {
            const gs = readGroups();
            gs.forEach((g, i) => {
                const b = g.box, p = g.parsed;
                b._title.textContent = (gs.length > 1 ? 'Times ' + (i + 1) + ': ' : '') + C.daysLabel(g.days) + (g.from || g.until ? ' (dates)' : '');
                b._rm.hidden = gs.length < 2;
                if (!p.times.length) b._sum.textContent = b._area.value.trim() ? 'No times found yet. Type them like 07:15.' : '';
                else b._sum.textContent = p.times.length + (p.times.length === 1 ? ' time' : ' times') + ', ' + C.hhmm(p.times[0]) + ' to ' + C.hhmm(p.times[p.times.length - 1]) +
                    (p.afterMidnight ? ' (' + p.afterMidnight + ' after midnight, counted as the night before)' : '') + (p.skipped ? '. Words were skipped.' : '.');
                b._err.textContent = p.bad.length ? 'Cannot be a time: ' + p.bad.slice(0, 5).join(', ') + '. Fix or delete ' + (p.bad.length === 1 ? 'it.' : 'them.') : '';
            });
            const fake = { groups: gs.filter(g => g.parsed.times.length && g.days.length).map(g => ({ days: g.days, times: g.parsed.times, from: g.from, until: g.until })) };
            const none = C.daysWithout(fake), twice = C.daysTwice(fake);
            const bits = [];
            if (fake.groups.length && none.length && none.length < 7) bits.push('No departures on ' + none.map(d => C.DAY_SHORT[d]).join(', ') + '.');
            if (twice.length) bits.push(twice.map(d => C.DAY_SHORT[d]).join(', ') + (twice.length === 1 ? ' is' : ' are') + ' ticked in two sets: their times are combined.');
            info.textContent = bits.join(' ');
        }
        (r ? r.groups : [{ days: [0, 1, 2, 3, 4, 5, 6] }]).forEach(g => addGroup(g));
        refresh();

        const saveErr = el('p', 'err'); saveErr.setAttribute('role', 'alert');
        const btns = el('div', 'row-btns');
        btns.append(btn(isNew ? 'Save this stop' : 'Save changes', 'primary', doSave));
        if (!isNew || state.routes.length) btns.append(btn('Cancel', 'secondary', () => { closeEditor(); render(); }));
        wrap.append(saveErr, btns);

        function doSave() {
            let first = null; const flag = (inp, msgEl, msg) => { if (msgEl) msgEl.textContent = msg; if (inp) inp.setAttribute('aria-invalid', 'true'); if (!first) first = inp; };
            nameErr.textContent = ''; walkErr.textContent = ''; saveErr.textContent = '';
            const nm = name.value.replace(/\s+/g, ' ').trim();
            if (!nm) flag(name, nameErr, 'Give it a name, like "To work" or "Bus 42 to City Centre".'); else name.removeAttribute('aria-invalid');
            let walk = walkSel.value === 'other' ? (/^\s*\d{1,3}\s*$/.test(walkOther.value) ? +walkOther.value : NaN) : +walkSel.value;
            if (!(walk >= 0 && walk <= 120)) flag(walkOther, walkErr, 'Type the walk in whole minutes, from 0 to 120.'); else walkOther.removeAttribute('aria-invalid');
            let gs = readGroups(); const groups = [];
            // a set of days left empty (Sunday with no buses) simply means no departures on those days
            if (gs.some(g => g.parsed.times.length)) gs = gs.filter(g => g.box._area.value.trim());
            gs.forEach(g => {
                const b = g.box; b._dErr.textContent = '';
                if (g.parsed.bad.length) flag(b._area, null, '');
                if (!g.parsed.times.length) flag(b._area, b._err, b._area.value.trim() ? 'No times found. Type them like 07:15 07:40.' : 'Type at least one departure time, like 07:15.');
                if (!g.days.length) { b._err.textContent = (b._err.textContent ? b._err.textContent + ' ' : '') + 'Tick at least one day.'; if (!first) first = b.querySelector('.day input'); }
                if (!b._dBox.hidden) {
                    if (!g.from && !g.until) flag(b._from, b._dErr, 'Pick at least one date, or tap No dates, use all year.');
                    else if (g.from && g.until && g.from > g.until) flag(b._to, b._dErr, 'Until must be on or after From.');
                }
                groups.push({ days: g.days, times: g.parsed.times, from: g.from, until: g.until });
            });
            if (first) { saveErr.textContent = 'Please fix the red parts above.'; first.focus(); return; }
            const clean = C.cleanRoute({ id: r ? r.id : uid(), name: nm, stop: stopBox.hidden ? '' : stop.value, walk, groups });
            if (!clean) { saveErr.textContent = 'Something is missing. Check the times and days.'; return; }
            if (r) Object.assign(r, clean); else state.routes.push(clean);
            save(); closeEditor(); render();
            toast((r ? 'Saved changes to ' : 'Saved ') + clean.name + '.', false);
            const card = document.querySelector('[data-id="' + clean.id + '"]'); if (card) { card.scrollIntoView({ block: 'nearest' }); card.querySelector('h2').focus(); }
        }
        return wrap;
    }
    function openEditor(id) {
        editingId = id; editorNode = makeEditor(id === 'new' ? null : route(id));
        if (id !== 'new') { const box = el('div', 'route editing'); box.dataset.id = id; box.append(el('h2', 'r-name', 'Edit: ' + route(id).name), editorNode); editorNode = box; }
    }
    function closeEditor() { editingId = null; editorNode = null; addingMore = false; }

    // ---------- the stop boxes ----------
    function routeCard(r, idx, now) {
        const card = el('article', 'route'); card.dataset.id = r.id;
        const h = el('h2', 'r-name', r.name); h.tabIndex = -1; card.append(h);
        const subBits = []; if (r.stop) subBits.push('From ' + r.stop); if (r.walk) subBits.push(r.walk + ' min walk to the stop');
        if (subBits.length) card.append(el('p', 'r-sub', subBits.join(' · ')));

        const today = new Date(now), ti = C.dayInfo(r, today, state.holidays);
        const list = C.upcoming(r, now, state.holidays, 12);
        const st = el('div', 'status');
        let todayText;
        if (ti.holiday) todayText = 'Today is a public holiday: ' + (ti.times.length ? 'Sunday times.' : 'no departures (none on Sundays).');
        else if (ti.times.length) todayText = 'Today (' + C.DAY_SHORT[ti.dow] + '): ' + ti.groups.map(g => C.daysLabel(g.days) + (g.from || g.until ? ' dated' : '')).join(' + ') + ' times.';
        else todayText = 'No departures today (' + C.DAY_LONG[ti.dow] + ').';
        st.append(el('p', 'today', todayText));

        if (!list.length) {
            st.classList.add('none');
            st.append(el('p', 'big-none', 'No departures in the next week.'), el('p', 'note', 'Check the days and dates with Edit.'));
        } else {
            const nx = list[0], mins = C.minsTo(nx.at, now), when = C.whenLabel(nx.at, now);
            const lab = el('p', 'n-label', 'Next' + (when ? ' · ' + when : ''));
            const big = el('p', 'n-big'); big.append(el('span', 'n-time', C.hhmm(nx.min)), el('span', 'n-in' + (mins <= 2 ? ' soon' : ''), C.inText(mins)));
            st.append(lab, big);
            const then = list.slice(1, 3);
            if (then.length) {
                let prevW = when;
                const t = then.map(x => {
                    const w = C.whenLabel(x.at, now), n = C.minsTo(x.at, now);
                    const pre = w !== prevW ? (w ? (w === 'Tomorrow' ? 'tomorrow' : w) : 'today') + ' ' : ''; prevW = w;
                    return pre + C.hhmm(x.min) + (n < 720 ? ' (' + C.inText(n) + ')' : '');
                });
                st.append(el('p', 'note', 'Then ' + t.join(' and ')));
            }
            if (r.walk) {
                const c = C.catchable(list, now, r.walk);
                if (c && C.minsTo(c.at, now) - r.walk < 120) {
                    const leave = C.minsTo(c.at, now) - r.walk;
                    const lead = leave === 0 ? 'Leave now' : 'Leave ' + C.inText(leave);
                    let txt = lead + ' to catch the ' + C.hhmm(c.min) + (C.whenLabel(c.at, now) && C.whenLabel(c.at, now) !== when ? ' ' + C.whenLabel(c.at, now) : '') + '.';
                    if (c !== nx) txt = 'The ' + C.hhmm(nx.min) + ' is too soon to reach with your ' + r.walk + ' min walk. ' + txt;
                    st.append(el('p', 'leave' + (c !== nx ? ' missed' : ''), txt));
                }
            }
            if (ti.times.length) {
                const last = ti.times[ti.times.length - 1];
                const lastAt = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, last).getTime();
                st.append(el('p', 'note last', C.minsTo(lastAt, now) >= 0 ? 'Last one today: ' + timeLabel(last) + '.' : 'That was the last one today.'));
            }
        }
        card.append(st);

        const btns = el('div', 'r-btns');
        const full = btn(openFull[r.id] != null ? 'Hide timetable' : 'Full timetable', 'secondary', () => {
            if (openFull[r.id] != null) delete openFull[r.id]; else openFull[r.id] = 0; render();
        });
        full.setAttribute('aria-expanded', String(openFull[r.id] != null));
        btns.append(full,
            btn('Edit', 'secondary', () => { addingMore = false; openEditor(r.id); render(); const f = document.querySelector('.route.editing input'); if (f) f.focus(); }),
            btn('Copy times', 'secondary', async () => { toast(await copyText(C.routeText(r)) ? 'Copied the times of ' + r.name + '.' : 'Could not copy. Select the times in Full timetable instead.', false); }));
        if (idx > 0) btns.append(btn('Move up', 'secondary', () => { state.routes.splice(idx, 1); state.routes.splice(idx - 1, 0, r); save(); render(); }));
        btns.append(btn('Delete', 'secondary danger-t', () => withUndo('Deleted ' + r.name + '.', () => { state.routes = state.routes.filter(x => x !== r); delete openFull[r.id]; })));
        card.append(btns);
        if (openFull[r.id] != null) card.append(fullTable(r, now));
        return card;
    }

    function fullTable(r, now) {
        const box = el('div', 'full');
        const sel = document.createElement('select');
        const base = new Date(now);
        for (let k = 0; k < 7; k++) {
            const d = C.addDays(new Date(base.getFullYear(), base.getMonth(), base.getDate()), k);
            const o = el('option', null, (k === 0 ? 'Today, ' : k === 1 ? 'Tomorrow, ' : '') + C.DAY_LONG[d.getDay()] + ' ' + d.getDate() + ' ' + d.toLocaleString('en-GB', { month: 'short' }));
            o.value = String(k); sel.append(o);
        }
        sel.value = String(openFull[r.id]);
        sel.addEventListener('change', () => { openFull[r.id] = +sel.value; render(); const s = document.querySelector('[data-id="' + r.id + '"] .full select'); if (s) s.focus(); });
        box.append(field('Show the times for', sel));
        const d = C.addDays(new Date(base.getFullYear(), base.getMonth(), base.getDate()), openFull[r.id]);
        const info = C.dayInfo(r, d, state.holidays);
        if (!info.times.length) { box.append(el('p', 'note', info.holiday ? 'Public holiday: no departures (none on Sundays).' : 'No departures on this day.')); return box; }
        box.append(el('p', 'hint', (info.holiday ? 'Public holiday, Sunday times. ' : '') + info.times.length + ' departures.'));
        const ul = el('ul', 'times');
        const next = C.upcoming(r, now, state.holidays, 1)[0];
        info.times.forEach(t => {
            const at = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, t).getTime();
            const li = el('li', null, C.hhmm(t));
            if (C.minsTo(at, now) < 0) { li.className = 'gone'; li.title = 'Gone'; }
            if (next && next.at === at) { li.className = 'next'; li.append(el('span', 'sr-only', ' (next)')); }
            if (t >= C.DAY) { li.classList.add('late'); li.append(el('span', 'sup', '+1')); li.title = 'After midnight'; }
            ul.append(li);
        });
        box.append(ul);
        if (info.times.some(t => t >= C.DAY)) box.append(el('p', 'hint', '+1: after midnight, the night of this day.'));
        return box;
    }

    // ---------- the whole page ----------
    function render() {
        const now = Date.now(), has = state.routes.length > 0;
        const d = new Date(now);
        $('clock-bar').hidden = !has;
        $('clock').textContent = 'Now ' + C.hhmm(d.getHours() * 60 + d.getMinutes()) + ' · ' + C.DAY_LONG[d.getDay()] + ' ' + d.getDate() + ' ' + d.toLocaleString('en-GB', { month: 'long' });
        $('today-holiday').checked = state.holidays.includes(todayStr());

        const host = $('routes'); host.textContent = '';
        state.routes.forEach((r, i) => host.append(editingId === r.id && editorNode ? editorNode : routeCard(r, i, now)));
        host.hidden = !has;

        const showAdd = !has || addingMore || editingId === 'new';
        $('add').hidden = !showAdd;
        $('add-more').hidden = showAdd;
        $('first-links').hidden = has;
        $('add-intro').hidden = has;
        $('add-h').textContent = has ? 'Add another stop' : 'Add a stop and its times';
        if (showAdd) {
            if (editingId !== 'new') { openEditor('new'); }
            const ae = $('add-editor'); if (ae.firstChild !== editorNode) { ae.textContent = ''; ae.append(editorNode); }
        } else $('add-editor').textContent = '';

        $('hols').hidden = !has; $('tools').hidden = !has;
        const hl = $('hol-list'); hl.textContent = '';
        const ts = todayStr();
        state.holidays.slice().reverse().forEach(h => {
            const pd = C.parseDate(h), li = el('li', 'hol' + (h < ts ? ' past' : ''));
            li.append(el('span', null, C.DAY_SHORT[pd.getDay()] + ' ' + pd.getDate() + ' ' + pd.toLocaleString('en-GB', { month: 'short' }) + ' ' + pd.getFullYear() + (h === ts ? ' (today)' : '')),
                btn('Remove', 'link inline danger-t', () => withUndo('Removed the holiday.', () => { state.holidays = state.holidays.filter(x => x !== h); })));
            hl.append(li);
        });
        if (!state.holidays.length) hl.append(el('li', 'hint', 'No holidays added.'));
    }

    // ---------- buttons outside the boxes ----------
    $('add-more').addEventListener('click', () => { addingMore = true; openEditor('new'); render(); const f = $('add-editor').querySelector('input'); if (f) f.focus(); });
    $('today-holiday').addEventListener('change', e => {
        const t = todayStr();
        state.holidays = state.holidays.filter(h => h !== t);
        if (e.target.checked) state.holidays.push(t), state.holidays.sort();
        save(); render(); toast(e.target.checked ? 'Today runs the Sunday times.' : 'Today runs its normal times.', false);
    });
    $('hol-add').addEventListener('click', () => {
        const v = $('hol-date').value, err = $('hol-err');
        if (!C.parseDate(v)) { err.textContent = 'Pick a date first.'; $('hol-date').focus(); return; }
        err.textContent = '';
        if (state.holidays.includes(v)) { toast('That date is already a holiday.', false); return; }
        state.holidays.push(v); state.holidays.sort(); $('hol-date').value = ''; save(); render(); toast('Holiday added: Sunday times on that day.', false);
    });
    $('example').addEventListener('click', () => {
        const wd = [1, 2, 3, 4, 5];
        const home = C.everyN(360, 1320, 20).concat(C.parseTimes('22:40 23:20 00:10').times.map(t => t < 360 ? t + C.DAY : t));
        state.routes.push(
            { id: uid(), name: 'Shuttle to Campus', stop: 'Main Market stop', walk: 5, groups: [
                { days: wd, times: C.parseTimes('07:15 07:40 08:05 08:30 09:00 10:30 12:00').times, from: '', until: '' },
                { days: [6], times: C.parseTimes('08:00 10:00 12:00').times, from: '', until: '' }] },
            { id: uid(), name: 'Bus 42 home', stop: 'University gate', walk: 3, groups: [
                { days: wd, times: home, from: '', until: '' },
                { days: [6, 0], times: C.everyN(390, 1380, 30), from: '', until: '' }] });
        state = C.cleanState(state); save(); closeEditor(); render(); toast('Example added. Edit or delete it when you add your own.', false);
    });
    $('backup').addEventListener('click', () => {
        download('bus-train-timetable-backup-' + todayStr() + '.json', 'application/json', JSON.stringify({ app: 'bus-and-train-timetable-for-my-stops', ...state }, null, 1));
        $('tools-msg').textContent = 'Backup saved to your downloads.'; $('tools-msg').className = 'msg show';
    });
    const pickRestore = () => $('restore-file').click();
    $('restore').addEventListener('click', pickRestore);
    $('restore-first').addEventListener('click', pickRestore);
    $('restore-file').addEventListener('change', e => {
        const f = e.target.files[0]; e.target.value = ''; if (!f) return;
        const bad = () => { if (state.routes.length) { $('tools-msg').textContent = 'That file is not a backup from this app.'; $('tools-msg').className = 'msg show bad'; } else toast('That file is not a backup from this app.', false); };
        if (f.size > 2e6) return bad();
        f.text().then(t => {
            let s = null; try { s = C.cleanState(JSON.parse(t)); } catch (x) { s = null; }
            if (!s || !s.routes.length) return bad();
            $('tools-msg').textContent = ''; $('tools-msg').className = 'msg';
            withUndo('Restored ' + s.routes.length + (s.routes.length === 1 ? ' stop.' : ' stops.'), () => { state = s; closeEditor(); });
        }).catch(bad);
    });
    $('del-all').addEventListener('click', () => {
        if (!confirm('Delete all your stops and holidays from this device?')) return;
        withUndo('Deleted everything.', () => { state = { v: 1, routes: [], holidays: [] }; closeEditor(); Object.keys(openFull).forEach(k => delete openFull[k]); });
    });

    // ---------- keep the countdown fresh ----------
    let lastMin = -1;
    function tick() {
        const m = Math.floor(Date.now() / 60000);
        if (m === lastMin) return; lastMin = m;
        const a = document.activeElement;
        // do not pull the day list or a stop being edited away from under the person's finger: just move the clock on
        if ((a && a.closest && a.closest('.full')) || (editingId && editingId !== 'new' && editorNode && editorNode.contains(a))) {
            const d = new Date(); $('clock').textContent = 'Now ' + C.hhmm(d.getHours() * 60 + d.getMinutes()) + ' · ' + C.DAY_LONG[d.getDay()] + ' ' + d.getDate() + ' ' + d.toLocaleString('en-GB', { month: 'long' });
            return;
        }
        render();
    }
    load(); render(); lastMin = Math.floor(Date.now() / 60000);
    setInterval(tick, 5000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { lastMin = -1; tick(); } });
    window.addEventListener('pageshow', () => { lastMin = -1; tick(); });

    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
