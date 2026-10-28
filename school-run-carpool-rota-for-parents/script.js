// School Run Carpool Rota for Parents: the page. The logic lives in core.js.
(function () {
    'use strict';
    const C = window.CarpoolCore;
    const KEY = 'school-run-carpool-rota-for-parents.state';
    const $ = id => document.getElementById(id);
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const btn = (cls, text, fn) => { const b = el('button', cls, text); b.type = 'button'; if (fn) b.addEventListener('click', fn); return b; };
    const CURS = [['', 'None'], ['$', '$'], ['€', '€ (EUR)'], ['£', '£ (GBP)'], ['₹', '₹ (INR)'], ['Rs', 'Rs (PKR, LKR, NPR)'], ['AED', 'AED'], ['SAR', 'SAR'], ['A$', 'A$ (AUD)'], ['C$', 'C$ (CAD)'], ['R', 'R (ZAR)'], ['¥', '¥ (JPY, CNY)']];

    let canSave = true, state, today, vw, cm, r;
    let editing = null;          // id of the family in the form, or 0 for a new one
    let formKids = [], formNo = new Set();
    let openRun = null;          // "date|run|driver" or "date|run|kids" for the open list in the week
    let awayOpen = null;         // id of the family whose Away dates form is open

    // ---------- saving ----------
    function load() {
        let raw = null;
        try { raw = localStorage.getItem(KEY); } catch (e) { canSave = false; }
        if (raw) {
            try { const s = C.validate(JSON.parse(raw)); if (s) return s; } catch (e) { /* damaged: start fresh */ }
            setTimeout(() => show('set-msg', 'The saved rota could not be read, so the app started fresh.'), 0);
        }
        return C.emptyState(C.todayKey());
    }
    function save() {
        try { localStorage.setItem(KEY, JSON.stringify(state)); canSave = true; } catch (e) { canSave = false; }
        $('storage-warn').hidden = canSave;
    }
    const snapshot = () => JSON.stringify(state);
    function restoreSnap(snap) { state = C.validate(JSON.parse(snap)) || state; commit(); }
    function commit() { save(); render(); }

    // ---------- messages with Undo ----------
    const MSGS = ['week-msg', 'fam-msg', 'cost-msg', 'set-msg'], timers = {};
    function show(id, text, undoSnap) {
        const box = $(id); if (!box) return;
        MSGS.forEach(o => { if (o !== id) clearMsg(o); });
        box.textContent = ''; box.classList.add('show');
        box.appendChild(el('span', null, text));
        if (undoSnap) box.appendChild(btn('undo', 'Undo', () => { restoreSnap(undoSnap); show(id, 'Undone.'); }));
        clearTimeout(timers[id]); timers[id] = setTimeout(() => clearMsg(id), undoSnap ? 15000 : 6000);
    }
    function clearMsg(id) { const b = $(id); if (b) { b.textContent = ''; b.classList.remove('show'); } }

    // ---------- helpers ----------
    const fam = id => state.families.find(f => f.id === id);
    const live = k => state.families.filter(f => C.activeOn(f, k || today));
    const sameName = (a, b) => a.toLocaleLowerCase() === b.toLocaleLowerCase();
    const plural = (n, one, many) => n + ' ' + (n === 1 ? one : (many || one + 's'));
    const runsOn = () => C.RUNS.filter(x => state.runs[x]);
    function dayLabel(k) {
        const d = C.dayNum(k) - C.dayNum(today);
        return (d === 0 ? 'Today, ' : d === 1 ? 'Tomorrow, ' : d === -1 ? 'Yesterday, ' : '') + C.shortDate(k, k.slice(0, 4) !== today.slice(0, 4));
    }
    // a day before today keeps its saved drives; change one and it is worked out again with the change
    function touchDay(k) { if (k < today) C.unfreeze(state, k); }
    function overFor(k, x) { const o = state.over[k] || (state.over[k] = {}); return x ? (o[x] || (o[x] = {})) : o; }
    function tidyOver(k) {
        const o = state.over[k]; if (!o) return;
        C.RUNS.forEach(x => { if (o[x] && !o[x].driver && !(o[x].out || []).length) delete o[x]; if (o[x] && o[x].out && !o[x].out.length) delete o[x].out; });
        if (!o.off && !o.am && !o.pm) delete state.over[k];
    }
    function freshStart() { if (!state.families.length) { state.start = today; state.log = {}; state.over = {}; } }
    function copyText(text, okMsg, msgId) {
        const done = () => show(msgId, okMsg), fallback = () => {
            const t = el('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.position = 'absolute'; t.style.left = '-9999px';
            document.body.appendChild(t); t.select();
            let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
            t.remove(); ok ? done() : show(msgId, 'Copying is blocked here. Use "Email this week" instead.');
        };
        if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
    }

    // ---------- who drives next ----------
    function runText(run, x) {
        const p = el('p', 'n-run');
        p.appendChild(el('span', 'n-when', C.RUN_NAME[x]));
        if (!run.k.length) { p.appendChild(el('span', 'n-who muted', 'No ride needed')); return p; }
        const who = el('span', 'n-who');
        if (run.d == null) { who.classList.add('bad'); who.textContent = 'Nobody can drive yet'; }
        else { who.appendChild(el('b', null, C.famName(state, run.d))); who.appendChild(document.createTextNode(' drives')); }
        p.appendChild(who);
        p.appendChild(el('span', 'n-kids', C.kidNames(state, run.k).join(', ')));
        return p;
    }
    function renderNext() {
        const list = $('next-list'); list.textContent = '';
        const empty = !state.families.length || !state.families.some(f => f.kids.length);
        $('start-here').hidden = !empty;
        $('step-fam').classList.toggle('ok', !empty);
        if (empty) return;
        const items = [];
        for (let i = 0; i <= 45 && items.length < 2; i++) {
            const k = C.addDays(today, i), d = r.days[k];
            if (!d) continue;
            if (k === today || !d.off) items.push(d);
        }
        if (!items.length) { list.appendChild(el('li', 'hint', 'No school days in the next 6 weeks. Check the school days and No school days in Settings.')); return; }
        items.forEach(d => {
            const li = el('li', 'next-box' + (d.key === today ? ' is-today' : ''));
            li.appendChild(el('h3', null, d.key === today || C.dayNum(d.key) - C.dayNum(today) === 1 ? dayLabel(d.key) : 'Next school day, ' + C.shortDate(d.key)));
            if (d.off) li.appendChild(el('p', 'n-off', 'No school: ' + d.off));
            else C.RUNS.forEach(x => { if (d.runs[x]) li.appendChild(runText(d.runs[x], x)); });
            list.appendChild(li);
        });
    }

    // ---------- the week ----------
    function renderWeek() {
        const cmon = C.mondayOf(today), smon = C.mondayOf(state.start);
        $('week-h').textContent = vw === cmon ? 'This week' : C.dayNum(vw) - C.dayNum(cmon) === 7 ? 'Next week' : C.dayNum(vw) - C.dayNum(cmon) === -7 ? 'Last week' : 'Week of ' + C.shortDate(vw, vw.slice(0, 4) !== today.slice(0, 4));
        $('week-range').textContent = C.shortDate(vw) + ' to ' + C.shortDate(C.addDays(vw, 6), C.addDays(vw, 6).slice(0, 4) !== today.slice(0, 4));
        $('this-week').hidden = vw === cmon;
        $('prev').disabled = vw <= smon;
        $('nextw').disabled = C.dayNum(vw) - C.dayNum(cmon) >= 52 * 7;
        const list = $('day-list'); list.textContent = '';
        const empty = $('week-empty');
        const has = !!state.families.length;
        $('week-tools').hidden = !has;
        if (!has) { empty.hidden = false; empty.textContent = 'Add the families first. Each school day then shows who drives.'; return; }
        let shown = 0;
        for (let i = 0; i < 7; i++) {
            const k = C.addDays(vw, i);
            if (k < state.start || !C.isSchoolDay(state, k) && !r.days[k]) continue;
            const d = r.days[k]; if (!d) continue;
            list.appendChild(dayBox(d)); shown++;
        }
        empty.hidden = !!shown;
        empty.textContent = vw < C.mondayOf(state.start) || C.addDays(vw, 6) < state.start ? 'The rota started on ' + C.shortDate(state.start, true) + '.'
            : 'No school days this week. Choose the school days in Settings.';
    }
    function dayBox(d) {
        const k = d.key, li = el('li', 'day-box' + (k === today ? ' is-today' : '') + (k < today ? ' past' : '') + (d.off ? ' off' : ''));
        const head = el('div', 'd-head');
        const h = el('h3', null, dayLabel(k)); head.appendChild(h);
        const hol = C.holidayOn(state, k);
        if (!hol) {
            const offB = btn('off-btn', d.off ? 'Undo no school' : 'Mark no school', () => {
                const before = snapshot(); touchDay(k);
                const o = overFor(k); o.off = !o.off; if (!o.off) delete o.off; tidyOver(k);
                commit(); show('week-msg', (state.over[k] && state.over[k].off ? 'No school on ' : 'School again on ') + C.shortDate(k) + '.', before);
            });
            offB.setAttribute('aria-pressed', String(!!d.off)); offB.setAttribute('aria-label', (d.off ? 'Undo no school on ' : 'Mark no school on ') + C.shortDate(k));
            head.appendChild(offB);
        }
        li.appendChild(head);
        if (d.off) { li.appendChild(el('p', 'd-off', hol ? 'No school: ' + hol + ' (in No school days, in Settings)' : 'No school. Nobody drives.')); return li; }
        C.RUNS.forEach(x => { if (d.runs[x]) li.appendChild(runBox(d, x)); });
        return li;
    }
    function runBox(d, x) {
        const k = d.key, run = d.runs[x], box = el('div', 'run');
        const top = el('div', 'r-top');
        top.appendChild(el('span', 'r-when', C.RUN_LONG[x]));
        if (run.sw) top.appendChild(el('span', 'badge sw', 'Swapped'));
        box.appendChild(top);
        const who = el('p', 'r-who');
        if (!run.k.length) { who.textContent = 'No ride needed: no child is riding.'; who.classList.add('muted'); }
        else if (run.d == null) { who.textContent = 'Nobody can drive. Tap "Change driver" to pick a family.'; who.classList.add('bad'); }
        else { who.appendChild(el('b', null, C.famName(state, run.d))); who.appendChild(document.createTextNode(' drives')); }
        box.appendChild(who);
        if (run.k.length) {
            const f = fam(run.d);
            const kids = el('p', 'r-kids', C.kidNames(state, run.k).join(', '));
            if (f) kids.appendChild(el('span', 'seats', ' · ' + run.k.length + ' of ' + f.seats + ' seats'));
            box.appendChild(kids);
            if (f && run.k.length > f.seats) box.appendChild(el('p', 'r-warn', 'Too many children for ' + f.name + "'s car: " + run.k.length + ' riding, ' + f.seats + ' seats. Untick a child in "Who is riding" or pick another driver.'));
        }
        const btns = el('div', 'r-btns');
        const id1 = k + '|' + x + '|driver', id2 = k + '|' + x + '|kids';
        const b1 = btn('change-btn', 'Change driver', () => { openRun = openRun === id1 ? null : id1; render(); focusOpen(); });
        b1.setAttribute('aria-expanded', String(openRun === id1));
        const b2 = btn('change-btn', 'Who is riding', () => { openRun = openRun === id2 ? null : id2; render(); focusOpen(); });
        b2.setAttribute('aria-expanded', String(openRun === id2));
        btns.appendChild(b1); btns.appendChild(b2); box.appendChild(btns);
        if (openRun === id1) box.appendChild(driverPicker(d, x));
        if (openRun === id2) box.appendChild(kidPicker(d, x));
        return box;
    }
    function focusOpen() { const f = document.querySelector('.picker select, .picker input'); if (f) f.focus(); }
    function driverPicker(d, x) {
        const k = d.key, run = d.runs[x], wrap = el('div', 'picker');
        const sid = 'pick-' + k + x;
        const lab = el('label', null, 'Who drives ' + C.RUN_NAME[x].toLowerCase() + ', ' + C.shortDate(k)); lab.htmlFor = sid; wrap.appendChild(lab);
        const sel = el('select'); sel.id = sid;
        const cur = (state.over[k] && state.over[k][x] && state.over[k][x].driver) || null;
        const o0 = el('option', null, 'Back to the rota'); o0.value = ''; sel.appendChild(o0);
        live(k).forEach(f => {
            const notes = [];
            if (C.awayOn(f, k)) notes.push('away'); else if (!C.canDrive(f, k, x)) notes.push('usually cannot');
            if (f.seats < run.k.length) notes.push(f.seats + ' seats');
            const o = el('option', null, f.name + (notes.length ? ' (' + notes.join(', ') + ')' : '')); o.value = String(f.id);
            if (cur === f.id) o.selected = true; sel.appendChild(o);
        });
        if (!cur) o0.selected = true;
        sel.addEventListener('change', () => {
            const before = snapshot(); touchDay(k);
            const o = overFor(k, x); if (sel.value) o.driver = +sel.value; else delete o.driver; tidyOver(k);
            openRun = null; commit();
            const nd = r.days[k] && r.days[k].runs[x];
            show('week-msg', sel.value ? C.famName(state, +sel.value) + ' drives ' + C.RUN_NAME[x].toLowerCase() + ', ' + C.shortDate(k) + '. The rota evens it out in the next days.'
                : 'Back to the rota: ' + (nd && nd.d != null ? C.famName(state, nd.d) + ' drives.' : 'nobody can drive.'), before);
        });
        wrap.appendChild(sel);
        wrap.appendChild(el('p', 'hint', '"Back to the rota" lets the rota choose again.'));
        return wrap;
    }
    function kidPicker(d, x) {
        const k = d.key, wrap = el('fieldset', 'picker');
        wrap.appendChild(el('legend', null, 'Who is riding ' + C.RUN_NAME[x].toLowerCase() + ', ' + C.shortDate(k)));
        const out = ((state.over[k] || {})[x] || {}).out || [];
        let any = false;
        live(k).forEach(f => { if (C.awayOn(f, k)) return; f.kids.forEach(c => {
            if (!(c.rides === 'both' || c.rides === x)) return; any = true;
            const l = el('label', 'check'), i = el('input'); i.type = 'checkbox'; i.checked = !out.includes(c.id);
            i.addEventListener('change', () => {
                const before = snapshot(); touchDay(k);
                const o = overFor(k, x), set = new Set(o.out || []); i.checked ? set.delete(c.id) : set.add(c.id); o.out = [...set]; tidyOver(k);
                commit(); show('week-msg', c.name + (i.checked ? ' rides ' : ' is not riding ') + C.RUN_NAME[x].toLowerCase() + ', ' + C.shortDate(k) + '.', before);
                const again = document.querySelector('.picker input'); if (again) again.focus();
            });
            l.appendChild(i); l.appendChild(el('span', null, c.name + ' (' + f.name + ')')); wrap.appendChild(l);
        }); });
        if (!any) wrap.appendChild(el('p', 'hint', 'No child rides at this time.'));
        return wrap;
    }

    // ---------- drives so far ----------
    function renderCount() {
        const list = $('count-list'); list.textContent = '';
        const fams = state.families.filter(f => f.joined <= today);
        $('count').hidden = !state.families.length;
        $('count-since').textContent = 'From ' + C.shortDate(state.start, state.start.slice(0, 4) !== today.slice(0, 4)) + ' up to and including today.';
        const rows = fams.map(f => ({ f, n: r.drives[f.id] || 0, s: r.score.get(f.id) || 0, gone: !C.activeOn(f, today) })).sort((a, b) => b.n - a.n || a.f.name.localeCompare(b.f.name));
        const activeRows = rows.filter(x => !x.gone);
        const top = activeRows.reduce((m, x) => x.s > m.s ? x : m, activeRows[0] || { s: 0 });
        const level = activeRows.every(x => x.s === top.s);
        rows.forEach(x => {
            const li = el('li', 'count-row');
            li.appendChild(el('span', 'c-name', x.f.name + (x.gone ? ' (left)' : '')));
            li.appendChild(el('span', 'c-num', plural(x.n, 'drive')));
            const gap = top.s - x.s;
            if (!x.gone) li.appendChild(el('span', 'badge' + (gap > 1 ? ' behind' : ''), activeRows.length < 2 ? 'Only family' : level ? 'Level' : gap <= 0 ? 'Most drives' : gap + ' behind'));
            list.appendChild(li);
        });
        const joined = fams.filter(f => f.joined > state.start && C.activeOn(f, today));
        const small = live(today).filter(f => f.seats < C.riders(state, today, runsOn()[0]).length);
        $('count-note').textContent = (small.length ? C.listJoin(small.map(f => f.name + ' (' + plural(f.seats, 'seat') + ')')) + (small.length === 1 ? ' has' : ' have') + ' fewer seats than the children riding, so ' + (small.length === 1 ? 'only drives' : 'only drive') + ' when fewer children ride or by a swap. ' : '') + (joined.length ? C.listJoin(joined.map(f => f.name)) + ' joined later and started level with the family that had driven least. ' : '')
            + 'A family that cannot drive some days drives less; fuel cost sharing evens that out in money.';
    }

    // ---------- families ----------
    function noText(f) {
        const days = state.days.slice().sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)), rs = runsOn();
        const has = (d, x) => f.no.includes(d + x);
        if (days.every(d => rs.every(x => has(d, x)))) return 'Cannot drive on any school day (only by a swap)';
        const allRun = rs.length === 2 ? rs.filter(x => days.every(d => has(d, x))) : [];
        const parts = allRun.map(x => x === 'am' ? 'mornings' : 'afternoons');
        days.forEach(d => {
            const v = rs.filter(x => has(d, x) && !allRun.includes(x));
            if (!v.length) return;
            parts.push(C.DAYS[d] + (v.length === rs.length || rs.length === 1 ? '' : ' ' + (v[0] === 'am' ? 'mornings' : 'afternoons')));
        });
        return parts.length ? 'Cannot drive: ' + parts.join(', ') : 'Can drive any school day';
    }
    function kidText(c) { return c.name + (runsOn().length === 2 && c.rides !== 'both' ? ' (' + (c.rides === 'am' ? 'mornings only' : 'afternoons only') + ')' : ''); }
    function renderFamilies() {
        const list = $('fam-list'); list.textContent = '';
        live(today).concat(state.families.filter(f => f.joined > today)).filter((f, i, a) => a.indexOf(f) === i).forEach(f => {
            const li = el('li', 'box');
            const t = el('div', 'box-top');
            t.appendChild(el('h3', 'box-name', f.name));
            t.appendChild(el('span', 'badge', plural(f.seats, 'seat')));
            li.appendChild(t);
            li.appendChild(el('p', 'box-sub', f.kids.length ? 'Children: ' + f.kids.map(kidText).join(', ') : 'No child in the carpool (driver only)'));
            li.appendChild(el('p', 'box-sub', noText(f)));
            if (f.joined > today) li.appendChild(el('p', 'box-sub em', 'Starts on ' + C.shortDate(f.joined, f.joined.slice(0, 4) !== today.slice(0, 4))));
            const aw = f.away.filter(a => a.to >= today);
            if (aw.length) {
                const ul = el('ul', 'away-list');
                aw.forEach(a => {
                    const row = el('li', 'away-row');
                    row.appendChild(el('span', null, 'Away ' + (a.from === a.to ? C.shortDate(a.from) : C.shortDate(a.from) + ' to ' + C.shortDate(a.to))));
                    const x = btn('x-btn', '×', () => { const before = snapshot(); f.away.splice(f.away.indexOf(a), 1); commit(); show('fam-msg', 'Away dates removed for ' + f.name + '.', before); });
                    x.setAttribute('aria-label', 'Remove away dates for ' + f.name); row.appendChild(x); ul.appendChild(row);
                });
                li.appendChild(ul);
            }
            if (awayOpen === f.id) li.appendChild(awayForm(f));
            const b = el('div', 'box-btns');
            const eb = btn('secondary small', 'Edit', () => openForm(f.id)); eb.setAttribute('aria-label', 'Edit ' + f.name);
            const ab = btn('secondary small', 'Away dates', () => { awayOpen = awayOpen === f.id ? null : f.id; render(); const i = $('a-from'); if (i) i.focus(); }); ab.setAttribute('aria-label', 'Away dates for ' + f.name);
            const rb = btn('secondary small', 'Remove', () => removeFamily(f)); rb.setAttribute('aria-label', 'Remove ' + f.name);
            b.appendChild(eb); b.appendChild(ab); b.appendChild(rb); li.appendChild(b);
            list.appendChild(li);
        });
        $('f-open').hidden = editing !== null;
        $('f-open').disabled = live(today).length >= C.MAX_FAMILIES;
    }
    function awayForm(f) {
        const p = el('div', 'panel away-form');
        p.appendChild(el('p', 'hint top0', 'On these days ' + f.name + ' does not drive and their children do not ride.'));
        const two = el('div', 'two');
        const mk = (id, text, val) => { const w = el('div'); const l = el('label', null, text); l.htmlFor = id; const i = el('input'); i.type = 'date'; i.id = id; i.value = val; i.min = today; w.appendChild(l); w.appendChild(i); two.appendChild(w); return i; };
        const a = mk('a-from', 'From', today), b = mk('a-to', 'To', today);
        p.appendChild(two);
        const err = el('p', 'err'); err.setAttribute('role', 'alert'); p.appendChild(err);
        const rb = el('div', 'row-btns');
        rb.appendChild(btn('primary', 'Add away dates', () => {
            const from = a.value, to = b.value || a.value;
            if (!C.isKey(from) || !C.isKey(to)) { err.textContent = 'Choose the first and last day away.'; return; }
            if (to < from) { err.textContent = 'The last day is before the first day.'; return; }
            if (f.away.length >= C.MAX_AWAY) { err.textContent = 'That is the most away dates for one family. Remove old ones first.'; return; }
            const before = snapshot();
            f.away.push({ from, to, name: '' }); f.away.sort((x, y) => x.from < y.from ? -1 : 1); awayOpen = null;
            commit(); show('fam-msg', f.name + ' is away ' + (from === to ? 'on ' + C.shortDate(from) : 'from ' + C.shortDate(from) + ' to ' + C.shortDate(to)) + '.', before);
        }));
        rb.appendChild(btn('secondary', 'Cancel', () => { awayOpen = null; render(); }));
        p.appendChild(rb);
        return p;
    }
    function removeFamily(f) {
        const before = snapshot();
        const drove = Object.values(state.log).some(e => C.RUNS.some(x => e[x] && e[x].d === f.id));
        if (!drove || f.joined >= today) {
            state.families.splice(state.families.indexOf(f), 1);
            Object.keys(state.over).forEach(k => { C.RUNS.forEach(x => { const o = state.over[k][x]; if (o && o.driver === f.id) delete o.driver; if (o && o.out) o.out = o.out.filter(id => !f.kids.some(c => c.id === id)); }); tidyOver(k); });
            show('fam-msg', f.name + ' was removed.', before);
        } else { f.left = today; show('fam-msg', f.name + ' is off the rota from today. Their past drives stay in the count.', before); }
        if (editing === f.id) editing = null;
        commit();
    }

    // the add / edit form
    function openForm(id) {
        editing = id; const f = id ? fam(id) : null;
        $('f-form').hidden = false;
        $('f-form-h').textContent = f ? 'Edit ' + f.name : 'Add a family';
        $('f-save').textContent = f ? 'Save changes' : 'Add family';
        $('f-name').value = f ? f.name : '';
        formKids = f ? f.kids.map(c => ({ id: c.id, name: c.name, rides: c.rides })) : [{ id: null, name: '', rides: 'both' }];
        formNo = new Set(f ? f.no : []);
        $('f-seats').value = String(f ? f.seats : 4);
        const showJoin = !f && state.families.length > 0;
        $('f-join-wrap').hidden = !showJoin; $('f-join').value = today; $('f-join').min = today;
        ['f-name-err', 'kid-err', 'f-join-err'].forEach(e => { $(e).textContent = ''; });
        $('f-name').removeAttribute('aria-invalid');
        renderForm(); render();
        $('f-form').scrollIntoView({ block: 'nearest' }); $('f-name').focus();
    }
    function closeForm() { editing = null; $('f-form').hidden = true; render(); }
    function renderForm() {
        const ul = $('kid-rows'); ul.textContent = '';
        formKids.forEach((c, i) => {
            const li = el('li', 'kid-row');
            const iid = 'kid-' + i;
            const l = el('label', 'sr', 'Child ' + (i + 1) + ' name'); l.htmlFor = iid; li.appendChild(l);
            const inp = el('input'); inp.type = 'text'; inp.id = iid; inp.maxLength = 30; inp.autocomplete = 'off'; inp.placeholder = i ? 'Another child' : 'Name, e.g. Ali'; inp.value = c.name;
            inp.addEventListener('input', () => { c.name = inp.value; });
            li.appendChild(inp);
            if (runsOn().length === 2) {
                const sl = el('label', 'sr', 'How child ' + (i + 1) + ' rides'); sl.htmlFor = iid + 'r'; li.appendChild(sl);
                const sel = el('select'); sel.id = iid + 'r';
                [['both', 'Both ways'], ['am', 'Mornings only'], ['pm', 'Afternoons only']].forEach(([v, t]) => { const o = el('option', null, t); o.value = v; if (c.rides === v) o.selected = true; sel.appendChild(o); });
                sel.addEventListener('change', () => { c.rides = sel.value; });
                li.appendChild(sel);
            }
            const x = btn('x-btn', '×', () => { formKids.splice(i, 1); renderForm(); const n = $('kid-' + Math.max(0, i - 1)); (n || $('kid-add')).focus(); });
            x.setAttribute('aria-label', 'Remove child ' + (i + 1)); li.appendChild(x);
            ul.appendChild(li);
        });
        $('kid-add').hidden = formKids.length >= C.MAX_KIDS;
        const grid = $('no-grid'); grid.textContent = '';
        const days = state.days.slice().sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
        if (!days.length) grid.appendChild(el('p', 'hint', 'Choose the school days in Settings first.'));
        days.forEach(d => {
            const row = el('div', 'no-row');
            row.appendChild(el('span', 'no-day', C.DAYS[d]));
            runsOn().forEach(x => {
                const v = d + x, b = btn('no-chip', C.RUN_NAME[x], () => { formNo.has(v) ? formNo.delete(v) : formNo.add(v); b.setAttribute('aria-pressed', String(formNo.has(v))); b.textContent = (formNo.has(v) ? 'Cannot: ' : '') + C.RUN_NAME[x]; });
                b.setAttribute('aria-pressed', String(formNo.has(v))); b.textContent = (formNo.has(v) ? 'Cannot: ' : '') + C.RUN_NAME[x];
                b.setAttribute('aria-label', C.DAY_NAMES[d] + ' ' + C.RUN_NAME[x].toLowerCase() + ': cannot drive');
                row.appendChild(b);
            });
            grid.appendChild(row);
        });
    }
    function saveForm() {
        const nameIn = $('f-name'), name = C.cleanName(nameIn.value, 30), ne = $('f-name-err'), ke = $('kid-err'), je = $('f-join-err');
        ne.textContent = ke.textContent = je.textContent = ''; nameIn.removeAttribute('aria-invalid');
        const f = editing ? fam(editing) : null;
        if (!name) { ne.textContent = 'Type the family or driver name.'; nameIn.setAttribute('aria-invalid', 'true'); nameIn.focus(); return; }
        if (live(today).concat(state.families.filter(g => g.joined > today)).some(g => g !== f && sameName(g.name, name))) { ne.textContent = 'There is already a family called ' + name + '. Add a surname or initial.'; nameIn.setAttribute('aria-invalid', 'true'); nameIn.focus(); return; }
        const kids = formKids.map(c => ({ id: c.id, name: C.cleanName(c.name, 30), rides: c.rides })).filter(c => c.name);
        const seen = new Set();
        for (const c of kids) { const k = c.name.toLocaleLowerCase(); if (seen.has(k)) { ke.textContent = c.name + ' is typed twice.'; return; } seen.add(k); }
        let joined = today;
        if (!f && state.families.length) {
            joined = $('f-join').value || today;
            if (!C.isKey(joined)) { je.textContent = 'Choose the day they start, or leave today.'; return; }
            if (joined < today) { je.textContent = 'Choose today or a later day.'; return; }
        }
        const before = snapshot();
        if (!f) freshStart();
        const seats = Math.min(C.MAX_SEATS, Math.max(1, +$('f-seats').value || 4));
        kids.forEach(c => { if (!c.id) c.id = state.nextId++; });
        const no = [...formNo].filter(v => /^[0-6](am|pm)$/.test(v)).sort();
        if (f) { Object.assign(f, { name, kids, seats, no }); show('fam-msg', name + ' saved. The rota is worked out again from today; past days stay as they were.', before); }
        else {
            state.families.push({ id: state.nextId++, name, kids, seats, no, away: [], joined, left: null });
            show('fam-msg', name + ' added' + (joined > today ? ', starting ' + C.shortDate(joined) : '') + '.', before);
        }
        editing = null; $('f-form').hidden = true; commit();
    }

    // ---------- fuel cost sharing ----------
    function renderCosts() {
        $('costs').hidden = !state.families.length;
        const on = state.cost.on;
        $('cost-off').hidden = on; $('cost-on').hidden = !on;
        if (!on) return;
        if (document.activeElement !== $('cost-amt')) $('cost-amt').value = state.cost.cents ? C.money(state.cost.cents, '').replace(/\.00$/, '') : '';
        $('cur').value = state.cur;
        $('m-name').textContent = C.monthName(cm);
        $('m-next').disabled = cm >= today.slice(0, 7);
        $('m-prev').disabled = cm <= state.start.slice(0, 7);
        const box = $('settle'); box.textContent = '';
        const st = C.settle(state, r, cm, today);
        const cur = state.cur;
        if (!state.cost.cents) { box.appendChild(el('p', 'hint', 'Type the cost of one drive to see who pays who.')); return; }
        box.appendChild(el('p', 's-total', (cm === today.slice(0, 7) ? 'So far in ' : 'In ') + C.monthName(cm) + ': ' + plural(st.count, 'drive') + ' × ' + C.money(state.cost.cents, cur) + ' = ' + C.money(st.total, cur)));
        if (!st.count) { box.appendChild(el('p', 'hint', 'No drives this month.')); return; }
        const pays = el('ul', 'pays');
        if (!st.pays.length) pays.appendChild(el('li', 'pay even', 'Everyone is even. Nobody owes anything.'));
        st.pays.forEach(p => { const li = el('li', 'pay'); li.appendChild(el('b', null, p.from)); li.appendChild(document.createTextNode(' pays ')); li.appendChild(el('b', null, p.to)); li.appendChild(document.createTextNode(' ' + C.money(p.cents, cur))); pays.appendChild(li); });
        box.appendChild(pays);
        const tbl = el('table', 'st-table'), th = el('tr');
        ['Family', 'Drove', 'Their share', 'Result'].forEach(t => { const c = el('th', null, t); c.scope = 'col'; th.appendChild(c); });
        const thead = el('thead'); thead.appendChild(th); tbl.appendChild(thead);
        const tb = el('tbody');
        st.rows.forEach(x => {
            const tr = el('tr');
            tr.appendChild(el('td', null, x.name));
            tr.appendChild(el('td', null, x.drove + ' (' + C.money(x.owed, cur) + ')'));
            tr.appendChild(el('td', null, C.money(x.share, cur)));
            tr.appendChild(el('td', x.net > 0 ? 'good' : x.net < 0 ? 'bad' : '', x.net > 0 ? 'gets ' + C.money(x.net, cur) : x.net < 0 ? 'pays ' + C.money(-x.net, cur) : 'even'));
            tb.appendChild(tr);
        });
        tbl.appendChild(tb); box.appendChild(tbl);
        box.appendChild(el('p', 'hint', '"Their share" is the cost of the rides their children had. After these payments every family has paid the same for each ride of each child.'));
    }
    function costText() {
        const st = C.settle(state, r, cm, today), cur = state.cur;
        const lines = [state.title + ' fuel costs, ' + C.monthName(cm), plural(st.count, 'drive') + ' × ' + C.money(state.cost.cents, cur) + ' = ' + C.money(st.total, cur), ''];
        if (!st.pays.length) lines.push('Everyone is even.'); else st.pays.forEach(p => lines.push(p.from + ' pays ' + p.to + ' ' + C.money(p.cents, cur)));
        lines.push(''); st.rows.forEach(x => lines.push(x.name + ': drove ' + x.drove + ', share ' + C.money(x.share, cur)));
        return lines.join('\n');
    }

    // ---------- settings ----------
    function renderSettings() {
        if (document.activeElement !== $('s-title')) $('s-title').value = state.title;
        const box = $('s-days'); box.textContent = '';
        [1, 2, 3, 4, 5, 6, 0].forEach(d => {
            const b = btn('day-chip', C.DAYS[d], () => {
                const before = snapshot(), set = new Set(state.days);
                if (set.has(d) && set.size === 1) { $('s-days-err').textContent = 'Keep at least one school day.'; return; }
                $('s-days-err').textContent = '';
                set.has(d) ? set.delete(d) : set.add(d); state.days = [...set].sort();
                commit(); show('set-msg', C.DAY_NAMES[d] + (set.has(d) ? ' is a school day from today.' : ' is no longer a school day, from today.'), before);
            });
            b.setAttribute('aria-pressed', String(state.days.includes(d))); b.setAttribute('aria-label', C.DAY_NAMES[d]);
            box.appendChild(b);
        });
        $('s-am').checked = state.runs.am; $('s-pm').checked = state.runs.pm;
        const hl = $('hol-list'); hl.textContent = '';
        state.holidays.slice().sort((a, b) => a.from < b.from ? -1 : 1).forEach(h => {
            const li = el('li', 'away-row' + (h.to < today ? ' past' : ''));
            li.appendChild(el('span', null, (h.name ? h.name + ': ' : '') + (h.from === h.to ? C.shortDate(h.from, true) : C.shortDate(h.from) + ' to ' + C.shortDate(h.to, true))));
            const x = btn('x-btn', '×', () => {
                const before = snapshot(); state.holidays.splice(state.holidays.indexOf(h), 1);
                for (let n = C.dayNum(h.from); n <= C.dayNum(h.to); n++) touchDay(C.keyOf(n));
                commit(); show('set-msg', 'No school days removed.', before);
            });
            x.setAttribute('aria-label', 'Remove ' + (h.name || 'no school days')); li.appendChild(x);
            hl.appendChild(li);
        });
    }
    function setRun(x, on) {
        const other = x === 'am' ? 'pm' : 'am';
        $('s-runs-err').textContent = '';
        if (!on && !state.runs[other]) { $('s-runs-err').textContent = 'Keep at least one ride.'; $('s-' + x).checked = true; return; }
        const before = snapshot(); state.runs[x] = on;
        commit(); show('set-msg', C.RUN_LONG[x] + (on ? ' rides are on' : ' rides are off') + ', from today.', before);
    }
    function addHoliday() {
        const from = $('h-from').value, to = $('h-to').value || from, err = $('h-err');
        err.textContent = '';
        if (!C.isKey(from)) { err.textContent = 'Choose the first day with no school.'; $('h-from').focus(); return; }
        if (!C.isKey(to)) { err.textContent = 'Choose the last day with no school.'; return; }
        if (to < from) { err.textContent = 'The last day is before the first day.'; return; }
        if (C.dayNum(to) - C.dayNum(from) > 366) { err.textContent = 'That is more than a year. Check the dates.'; return; }
        if (state.holidays.length >= C.MAX_HOLIDAYS) { err.textContent = 'That is the most. Remove old ones first.'; return; }
        const before = snapshot();
        state.holidays.push({ from, to, name: C.cleanName($('h-name').value, 40) });
        for (let n = C.dayNum(from); n <= C.dayNum(to); n++) touchDay(C.keyOf(n));
        $('h-form').hidden = true; $('h-open').hidden = false;
        commit(); show('set-msg', 'No school ' + (from === to ? 'on ' + C.shortDate(from) : 'from ' + C.shortDate(from) + ' to ' + C.shortDate(to)) + '. Nobody drives.', before);
    }

    // ---------- render ----------
    function render() {
        today = C.todayKey();
        if (!vw) vw = C.mondayOf(today);
        if (!cm) cm = today.slice(0, 7);
        if (vw < C.mondayOf(state.start)) vw = C.mondayOf(state.start);
        if (state.families.length && C.freeze(state, today)) save();
        const until = [C.addDays(vw, 6), C.addDays(today, 46)].sort().pop();
        r = C.compute(state, today, until);
        $('app').classList.toggle('setup', !state.families.length);
        renderNext(); renderWeek(); renderCount(); renderFamilies(); renderCosts(); renderSettings();
        const txt = C.weekText(state, r, vw, today);
        $('email').href = 'mailto:?subject=' + encodeURIComponent(state.title + ' rota, week of ' + C.shortDate(vw)) + '&body=' + encodeURIComponent(txt);
        $('share').hidden = !navigator.share;
        $('restart').hidden = !state.families.length;
    }

    // ---------- wiring ----------
    function init() {
        state = load(); save();
        const seats = $('f-seats');
        for (let i = 1; i <= C.MAX_SEATS; i++) { const o = el('option', null, String(i)); o.value = String(i); seats.appendChild(o); }
        CURS.forEach(([v, t]) => { const o = el('option', null, t); o.value = v; $('cur').appendChild(o); });
        if (!CURS.some(c => c[0] === state.cur)) { const o = el('option', null, state.cur); o.value = state.cur; $('cur').appendChild(o); }

        $('prev').addEventListener('click', () => { vw = C.addDays(vw, -7); openRun = null; render(); });
        $('nextw').addEventListener('click', () => { vw = C.addDays(vw, 7); openRun = null; render(); });
        $('this-week').addEventListener('click', () => { vw = C.mondayOf(today); openRun = null; render(); $('prev').focus(); });
        $('copy').addEventListener('click', () => copyText(C.weekText(state, r, vw, today), 'Copied. Paste it in the parents\' group chat.', 'week-msg'));
        $('share').addEventListener('click', () => { navigator.share({ title: state.title + ' rota', text: C.weekText(state, r, vw, today) }).catch(() => {}); });
        $('print').addEventListener('click', () => { openRun = null; render(); window.print(); });

        $('f-open').addEventListener('click', () => openForm(0));
        $('f-cancel').addEventListener('click', closeForm);
        $('f-save').addEventListener('click', saveForm);
        $('f-name').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveForm(); } });
        $('kid-add').addEventListener('click', () => { formKids.push({ id: null, name: '', rides: 'both' }); renderForm(); $('kid-' + (formKids.length - 1)).focus(); });

        $('cost-open').addEventListener('click', () => { const before = snapshot(); state.cost.on = true; commit(); $('cost-amt').focus(); show('cost-msg', 'Fuel cost sharing is on.', before); });
        $('cost-stop').addEventListener('click', () => { const before = snapshot(); state.cost.on = false; commit(); show('cost-msg', 'Fuel cost sharing is off. Your cost per drive is kept.', before); });
        $('cost-amt').addEventListener('input', () => {
            const t = $('cost-amt').value.trim(), c = C.parseMoney(t), err = $('cost-err');
            if (!t) { err.textContent = ''; state.cost.cents = 0; $('cost-amt').removeAttribute('aria-invalid'); save(); render(); return; }
            if (isNaN(c)) { err.textContent = /^-/.test(t) ? 'The cost cannot be negative.' : 'Type an amount such as 300 or 4.50.'; $('cost-amt').setAttribute('aria-invalid', 'true'); return; }
            err.textContent = ''; $('cost-amt').removeAttribute('aria-invalid'); state.cost.cents = c; save(); render();
        });
        $('cur').addEventListener('change', () => { state.cur = $('cur').value; save(); render(); });
        $('m-prev').addEventListener('click', () => { cm = C.addMonths(cm, -1); render(); });
        $('m-next').addEventListener('click', () => { cm = C.addMonths(cm, 1); render(); });
        $('cost-copy').addEventListener('click', () => copyText(costText(), 'Copied who pays who.', 'cost-msg'));

        $('s-title').addEventListener('input', () => { state.title = C.cleanName($('s-title').value, 40) || 'School run'; save(); render(); });
        $('s-am').addEventListener('change', () => setRun('am', $('s-am').checked));
        $('s-pm').addEventListener('change', () => setRun('pm', $('s-pm').checked));
        $('h-open').addEventListener('click', () => { $('h-form').hidden = false; $('h-open').hidden = true; $('h-from').value = today; $('h-to').value = ''; $('h-name').value = ''; $('h-err').textContent = ''; $('h-from').focus(); });
        $('h-cancel').addEventListener('click', () => { $('h-form').hidden = true; $('h-open').hidden = false; });
        $('h-save').addEventListener('click', addHoliday);
        $('h-from').addEventListener('change', () => { if (!$('h-to').value || $('h-to').value < $('h-from').value) $('h-to').value = $('h-from').value; });
        $('restart').addEventListener('click', () => {
            const before = snapshot(); state.start = today; state.log = {};
            commit(); show('set-msg', 'Every family is back to 0 drives, counting from today.', before);
        });
        $('backup').addEventListener('click', () => {
            const blob = new Blob([JSON.stringify(state, null, 1)], { type: 'application/json' });
            const a = el('a'); a.href = URL.createObjectURL(blob); a.download = 'school-run-carpool-rota-' + today + '.json';
            document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
            show('set-msg', 'Backup saved to your downloads.');
        });
        $('restore').addEventListener('click', () => $('restore-file').click());
        $('restore-file').addEventListener('change', () => {
            const file = $('restore-file').files[0]; if (!file) return;
            if (file.size > 3e6) { show('set-msg', 'That file is too big to be a rota backup.'); return; }
            const rd = new FileReader();
            rd.onload = () => {
                let s = null; try { s = C.validate(JSON.parse(rd.result)); } catch (e) { s = null; }
                $('restore-file').value = '';
                if (!s) { show('set-msg', 'That file is not a School Run Carpool Rota backup. Nothing was changed.'); return; }
                const before = snapshot(); state = s; vw = null; editing = null; $('f-form').hidden = true;
                commit(); show('set-msg', 'Backup restored: ' + plural(s.families.length, 'family', 'families') + '.', before);
            };
            rd.readAsText(file);
        });
        $('wipe').addEventListener('click', () => {
            const before = snapshot(); state = C.emptyState(today); vw = null; editing = null; $('f-form').hidden = true;
            commit(); show('set-msg', 'Everything was deleted.', before);
        });
        render();
        // midnight and coming back to the tab move today on
        setInterval(() => { if (C.todayKey() !== today) render(); }, 30000);
        document.addEventListener('visibilitychange', () => { if (!document.hidden && C.todayKey() !== today) render(); });
        if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
    }
    init();
})();
