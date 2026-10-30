// Load Shedding Schedule and Power Cut Log: the page. The maths is in core.js (LSCore).
(function () {
    'use strict';
    const C = window.LSCore;
    const KEY = 'load-shedding-schedule-and-power-cut-log.state';
    const $ = id => document.getElementById(id);
    const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
    let state = { v: 1, places: [], sel: '', period: 'month', remind: 15 };
    let storeOK = true, undoSnap = null, toastTimer = null, editingPlace = null, editingCut = null, addingMore = false, calOpen = null;

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
    const snap = () => JSON.stringify(state);
    function toast(text, canUndo) {
        $('toast-text').textContent = text;
        $('toast-undo').hidden = !canUndo;
        $('toast').hidden = false;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => { $('toast').hidden = true; undoSnap = null; }, 9000);
    }
    function withUndo(text, fn) { undoSnap = snap(); fn(); save(); render(); toast(text, true); }
    $('toast-undo').addEventListener('click', () => {
        if (!undoSnap) return;
        const s = C.cleanState(JSON.parse(undoSnap)); if (s) state = s;
        undoSnap = null; editingPlace = null; editingCut = null; save(); render(); toast('Undone.', false);
    });

    // ---------- small helpers ----------
    function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
    function btn(text, cls, fn) { const b = el('button', cls, text); b.type = 'button'; b.addEventListener('click', fn); return b; }
    const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    const now = () => Date.now();
    const place = id => state.places.find(p => p.id === id);
    function timeVal(min) { return min == null ? '' : C.hhmm(min); }
    function readTime(input) { const v = input.value; if (!v) return null; const m = /^(\d{2}):(\d{2})/.exec(v); return m ? +m[1] * 60 + +m[2] : null; }
    function download(name, type, text) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([text], { type }));
        a.download = name; document.body.appendChild(a); a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    }
    let fieldN = 0;
    function field(labelText, input) {
        const f = el('div', 'field'), l = el('label', null, labelText);
        input.id = input.id || 'f' + (++fieldN); l.htmlFor = input.id; f.append(l, input); return f;
    }
    function input(type, attrs) { const i = document.createElement('input'); i.type = type; Object.assign(i, attrs || {}); return i; }

    // ---------- the cut times editor (new place and Edit cut times) ----------
    function editor(host, opts) {
        host.textContent = '';
        const wrap = el('div', 'editor');
        if (opts.isNew) {
            const q = el('div', 'quick'); q.setAttribute('role', 'group'); q.setAttribute('aria-label', 'Quick pick');
            ['Home', 'Shop', 'Office'].forEach(n => q.append(btn(n, 'chip', () => { name.value = n; name.removeAttribute('aria-invalid'); nameErr.textContent = ''; })));
            wrap.append(q);
        }
        const name = input('text', { maxLength: 40, autocomplete: 'off', placeholder: 'e.g. Home', value: opts.name || '' });
        wrap.append(field('Name of the place', name));
        const nameErr = el('p', 'err'); nameErr.setAttribute('role', 'alert'); wrap.append(nameErr);

        wrap.append(el('h3', null, 'Cut times'));
        wrap.append(el('p', 'hint top', 'Each planned power cut, from the time the power goes to the time it comes back.'));
        const list = el('div', 'slots'); wrap.append(list);
        function addSlot(sl) {
            const box = el('div', 'slot');
            const head = el('div', 'slot-h');
            const title = el('p', 'slot-t');
            head.append(title, btn('Remove', 'link inline danger-t', () => { box.remove(); number(); }));
            const s = input('time', { value: timeVal(sl && sl.s) }), e = input('time', { value: timeVal(sl && sl.e) });
            const two = el('div', 'two'); two.append(field('Power goes', s), field('Power comes back', e));
            const next = el('p', 'hint nextday');
            const fs = el('fieldset', 'days'); fs.append(el('legend', null, 'On these days'));
            const chips = el('div', 'day-chips');
            DAY_ORDER.forEach(d => {
                const lab = el('label', 'day'), c = input('checkbox', { value: String(d), checked: !sl || !sl.days || sl.days.includes(d) });
                lab.append(c, el('span', null, C.DAYS[d])); chips.append(lab);
            });
            fs.append(chips);
            const err = el('p', 'err'); err.setAttribute('role', 'alert');
            box.append(head, two, next, fs, err);
            function upd() { const a = readTime(s), b = readTime(e); next.textContent = a != null && b != null && b < a ? 'Ends the next day, at ' + C.hhmm(b) + '.' : a != null && b != null && a !== b ? 'A ' + C.dur(C.slotLen({ s: a, e: b }) * C.MIN) + ' cut.' : ''; }
            s.addEventListener('input', upd); e.addEventListener('input', upd); upd();
            box._read = () => ({ s: readTime(s), e: readTime(e), days: [...chips.querySelectorAll('input:checked')].map(c => +c.value) });
            box._err = err; box._inputs = [s, e];
            list.append(box); number();
            return box;
        }
        function number() { [...list.children].forEach((b, i) => { b.querySelector('.slot-t').textContent = 'Cut ' + (i + 1); }); }
        (opts.slots && opts.slots.length ? opts.slots : [null]).forEach(addSlot);
        wrap.append(btn('+ Add a cut time', 'secondary small add-slot', () => { if (list.children.length >= C.MAX_SLOTS) return; const b = addSlot(null); b._inputs[0].focus(); }));

        const pasteOpen = btn('+ Paste the times from a message (optional)', 'link');
        const pasteBox = el('div', 'sub-box paste'); pasteBox.hidden = true;
        const ta = document.createElement('textarea'); ta.rows = 3; ta.maxLength = 3000; ta.placeholder = 'e.g. 08:00-10:00, 14:00 to 16:00';
        const pasteMsg = el('p', 'msg'); pasteMsg.setAttribute('role', 'status');
        pasteBox.append(field('Paste or type the times', ta), el('p', 'hint', 'Times like 08:00-10:00, 14:00 to 16:00, 2-4pm or 1400-1600. Each is added for every day; untick days after.'),
            btn('Add these times', 'secondary add-pasted', () => {
                const r = C.parseScheduleText(ta.value);
                pasteMsg.className = 'msg show';
                if (!r.slots.length) { pasteMsg.classList.add('bad'); pasteMsg.textContent = 'No times found. Type them like 08:00-10:00 or 2pm to 4pm.'; return; }
                // fill an empty first box instead of leaving it blank
                [...list.children].forEach(b => { const v = b._read(); if (v.s == null && v.e == null) b.remove(); });
                let added = 0;
                r.slots.forEach(sl => { if (list.children.length < C.MAX_SLOTS && ![...list.children].some(b => { const v = b._read(); return v.s === sl.s && v.e === sl.e; })) { addSlot({ s: sl.s, e: sl.e, days: C.ALL }); added++; } });
                if (!list.children.length) addSlot(null);
                pasteMsg.textContent = 'Added ' + added + (added === 1 ? ' cut time' : ' cut times') + '.' + (r.bad.length ? ' Could not read: ' + r.bad.join(' | ') : '');
                ta.value = '';
            }), pasteMsg);
        pasteOpen.addEventListener('click', () => { pasteBox.hidden = false; pasteOpen.hidden = true; ta.focus(); });
        wrap.append(pasteOpen, pasteBox);
        if (opts.note) wrap.append(el('p', 'hint', opts.note));
        const err = el('p', 'err'); err.setAttribute('role', 'alert');
        const row = el('div', 'row-btns');
        row.append(btn(opts.isNew ? 'Save place' : 'Save', 'primary save-place', () => {
            nameErr.textContent = ''; err.textContent = ''; name.removeAttribute('aria-invalid');
            let ok = true; const slots = [];
            const nm = name.value.replace(/\s+/g, ' ').trim();
            if (!nm) { nameErr.textContent = 'Type a name, such as Home.'; name.setAttribute('aria-invalid', 'true'); ok = false; }
            else if (state.places.some(p => p.id !== opts.id && p.name.toLowerCase() === nm.toLowerCase())) { nameErr.textContent = 'You already have a place called ' + nm + '. Pick another name.'; name.setAttribute('aria-invalid', 'true'); ok = false; }
            [...list.children].forEach(b => {
                b._err.textContent = '';
                const v = b._read();
                if (v.s == null && v.e == null) return; // an empty box is ignored
                const m = C.slotError(v);
                if (m) { b._err.textContent = m; ok = false; } else slots.push(v);
            });
            if (!ok) { const first = wrap.querySelector('.err:not(:empty)'); if (first) first.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
            opts.onSave(nm, slots);
        }));
        if (opts.onCancel) row.append(btn('Cancel', 'secondary', opts.onCancel));
        wrap.append(err, row);
        host.append(wrap);
        return { name };
    }

    // ---------- the add card ----------
    function renderAdd() {
        const has = state.places.length > 0;
        const show = !has || addingMore;
        $('add').hidden = !show;
        $('add-more').hidden = !has || addingMore || state.places.length >= C.MAX_PLACES;
        $('add-h').textContent = has ? 'Add another place' : "Add your area's cut times";
        $('restore-first').hidden = has;
        if (!show) { $('add-editor').textContent = ''; return; }
        if ($('add-editor').firstChild) return;
        editor($('add-editor'), {
            isNew: true, name: has ? '' : 'Home',
            onCancel: has ? () => { addingMore = false; renderAdd(); } : null,
            onSave(nm, slots) {
                const t = now(), p = { id: uid(), name: nm, since: t, schedules: [], cuts: [] };
                C.setSchedule(p, slots, t);
                state.places.push(p); state.sel = p.id; addingMore = false;
                $('add-editor').textContent = '';
                save(); render(); toast(nm + ' saved.', false);
                const box = document.querySelector('[data-place="' + p.id + '"]'); if (box) box.scrollIntoView({ block: 'start', behavior: 'smooth' });
            }
        });
    }
    $('add-more').addEventListener('click', () => { addingMore = true; renderAdd(); $('add').scrollIntoView({ block: 'start', behavior: 'smooth' }); const n = $('add-editor').querySelector('input[type=text]'); if (n) n.focus(); });

    // ---------- each place ----------
    function statusBox(p, t) {
        const st = C.status(p, t), box = el('div', 'act');
        const big = el('p', 'a-big'), note = el('p', 'a-note'), note2 = el('p', 'a-note');
        if (st.open) {
            box.classList.add('is-off');
            big.textContent = 'Power is off since ' + (C.dayStart(st.open.s) === C.dayStart(t) ? C.clock(st.open.s) : C.dateText(st.open.s) + ' ' + C.clock(st.open.s));
            note.textContent = 'Off for ' + C.dur(t - st.open.s) + '.';
            if (st.cur) note2.textContent = 'Planned cut until ' + (C.dayStart(st.cur[1]) === C.dayStart(t) ? '' : 'tomorrow ') + C.clock(st.cur[1]) + ', in ' + C.dur(st.cur[1] - t) + '.';
            else note2.textContent = 'This is not a planned cut.' + (st.next ? ' Next planned cut: ' + C.dayWord(st.next[0], t).replace('Today', 'today').replace('Tomorrow', 'tomorrow') + ' ' + C.clock(st.next[0]) + '.' : '');
        } else if (st.cur) {
            box.classList.add('is-cut');
            big.textContent = 'Planned cut now';
            note.textContent = 'Power back ' + (C.dayStart(st.cur[1]) === C.dayStart(t) ? 'at ' : C.dayWord(st.cur[1], t).toLowerCase() + ' at ') + C.clock(st.cur[1]) + ', in ' + C.dur(st.cur[1] - t) + '.';
            note2.textContent = 'Has the power gone? Tap Power went to log it.';
        } else if (st.hasSlots) {
            box.classList.add('is-on');
            big.textContent = 'Power should be on';
            if (st.next) {
                const w = C.dayWord(st.next[0], t);
                note.textContent = 'Next cut ' + (w === 'Today' ? '' : (w === 'Tomorrow' ? 'tomorrow ' : w + ', ')) + C.clock(st.next[0]) + ' to ' + C.clock(st.next[1]) + ', in ' + C.dur(st.next[0] - t) + '.';
            } else note.textContent = 'No planned cut in the next 7 days.';
        } else {
            box.classList.add('is-none');
            big.textContent = 'No planned cut times';
            note.textContent = 'Tap Edit cut times to add them, or just log cuts with Power went.';
        }
        box.append(big, note); if (note2.textContent) box.append(note2);
        return box;
    }
    function timeline(p, t) {
        const d0 = C.dayStart(t), d1 = C.addDays(d0, 1), len = d1 - d0;
        const wrap = el('div', 'tl-wrap');
        const bar = el('div', 'tl');
        const pl = C.planned(p, d0, d1);
        const cuts = C.merge((p.cuts || []).map(c => [Math.max(c.s, d0), Math.min(c.e == null ? t : c.e, d1, t)]));
        const seg = (x, cls) => { const s = el('span', cls); s.style.left = ((x[0] - d0) / len * 100) + '%'; s.style.width = Math.max(0.4, (x[1] - x[0]) / len * 100) + '%'; bar.append(s); };
        pl.forEach(x => seg(x, 'tl-plan'));
        cuts.forEach(x => seg(x, 'tl-cut'));
        const n = el('span', 'tl-now'); n.style.left = ((t - d0) / len * 100) + '%'; bar.append(n);
        bar.setAttribute('role', 'img');
        bar.setAttribute('aria-label', 'Today: ' + (pl.length ? 'planned cuts ' + pl.map(x => C.clock(x[0]) + ' to ' + C.clock(x[1])).join(', ') : 'no planned cuts') + '. ' + (cuts.length ? 'Logged cuts ' + C.dur(C.total(cuts)) + '.' : 'No cuts logged today.'));
        const ticks = el('div', 'tl-ticks'); ['00', '06', '12', '18', '24'].forEach(x => ticks.append(el('span', null, x)));
        const legend = el('p', 'tl-legend');
        const k1 = el('span', 'key plan'), k2 = el('span', 'key cut'), k3 = el('span', 'key now');
        legend.append(k1, document.createTextNode('Planned '), k2, document.createTextNode('Power was off '), k3, document.createTextNode('Now'));
        wrap.append(el('p', 'r-label', "Today's timeline"), bar, ticks, legend);
        return wrap;
    }
    function dayList(p, day, label) {
        const sl = C.slotsOn(p, day), row = el('p', 'day-list');
        row.append(el('b', null, label + ': '));
        row.append(document.createTextNode(sl.length ? sl.map(x => C.hhmm(x.s) + ' to ' + C.hhmm(x.e)).join(' · ') : 'no planned cuts'));
        return row;
    }
    function placeBox(p) {
        const t = now(), box = el('article', 'place'); box.dataset.place = p.id;
        const top = el('div', 'p-top');
        const h = el('h2', 'p-name', p.name);
        top.append(h);
        const cs = C.currentSlots(p, t);
        const most = Math.max(...C.ALL.map(d => cs.filter(s => s.days.includes(d)).reduce((a, s) => a + C.slotLen(s), 0)));
        top.append(el('p', 'p-sub', cs.length ? cs.length + (cs.length === 1 ? ' planned cut time' : ' planned cut times') + ', up to ' + C.dur(most * C.MIN) + ' a day' : 'No planned cut times yet'));
        box.append(top);
        if (editingPlace === p.id) {
            const host = el('div'); box.append(host);
            editor(host, {
                id: p.id, name: p.name, slots: cs,
                note: p.cuts.length ? 'New times count from today. Earlier days keep the old times in your totals.' : '',
                onCancel: () => { editingPlace = null; render(); },
                onSave(nm, slots) {
                    withUndo(nm + ' saved.', () => { p.name = nm; C.setSchedule(p, slots, now()); editingPlace = null; });
                }
            });
            return box;
        }
        const dyn = el('div', 'p-dyn'); box.append(dyn);
        fillDyn(p, dyn);
        const btns = el('div', 'p-btns');
        btns.append(btn('Edit cut times', 'secondary', () => { editingPlace = p.id; calOpen = null; render(); const b = document.querySelector('[data-place="' + p.id + '"]'); if (b) b.scrollIntoView({ block: 'start' }); }));
        const calB = btn('Add to calendar', 'secondary', () => { calOpen = calOpen === p.id ? null : p.id; render(); });
        calB.setAttribute('aria-expanded', String(calOpen === p.id));
        calB.disabled = !cs.length;
        btns.append(calB);
        btns.append(btn('Delete place', 'secondary danger-t', () => withUndo(p.name + ' deleted.', () => { state.places = state.places.filter(x => x !== p); if (state.sel === p.id) state.sel = ''; })));
        box.append(btns);
        if (calOpen === p.id && cs.length) {
            const cal = el('div', 'sub-box cal');
            const sel = document.createElement('select');
            [[0, 'No reminder'], [5, '5 minutes before'], [10, '10 minutes before'], [15, '15 minutes before'], [30, '30 minutes before'], [60, '1 hour before']].forEach(([v, txt]) => { const o = new Option(txt, String(v)); o.selected = v === state.remind; sel.append(o); });
            sel.addEventListener('change', () => { state.remind = +sel.value; save(); });
            cal.append(field('Remind me', sel), el('p', 'hint', 'Saves a calendar file with each cut time as a repeating event. Open it to add them to your phone\'s calendar. If the times change, delete the old events and add them again.'),
                btn('Save calendar file', 'primary', () => {
                    download('power-cuts-' + p.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase().replace(/^-|-$/g, '') + '.ics', 'text/calendar', C.ics(p, now(), state.remind));
                    toast('Calendar file saved. Open it to add the cut times.', false);
                }));
            box.append(cal);
        }
        return box;
    }
    function fillDyn(p, dyn) {
        const t = now();
        dyn.textContent = '';
        dyn.append(statusBox(p, t));
        const open = C.openCut(p);
        const main = btn(open ? 'Power is back' : 'Power went', 'primary big-btn ' + (open ? 'is-back' : 'is-went'), () => {
            const tt = now();
            const cur = C.openCut(p);
            if (cur) {
                cur.e = Math.max(tt, cur.s + 1000);
                save(); render(); toast('Power back at ' + C.clock(cur.e) + ' after ' + C.dur(cur.e - cur.s) + '.', false);
            } else {
                const err = C.cutError(p, tt, null, null, tt);
                if (err) { toast(err, false); return; }
                p.cuts.push({ id: uid(), s: tt, e: null, note: '' });
                save(); render(); toast('Power went at ' + C.clock(tt) + '. Tap Power is back when it returns.', false);
            }
        });
        dyn.append(main, el('p', 'hint center', open ? 'Tap when the power returns. You can change the times in the log.' : 'Tap when the power goes. The time is saved; you can change it later.'));
        dyn.append(timeline(p, t));
        dyn.append(dayList(p, t, 'Today'), dayList(p, C.addDays(C.dayStart(t), 1), 'Tomorrow'));
    }
    function renderPlaces() {
        const host = $('places'); host.textContent = '';
        state.places.forEach(p => host.append(placeBox(p)));
        host.hidden = !state.places.length;
    }

    // ---------- the log ----------
    function currentPlace() {
        let p = place(state.sel);
        if (!p) { p = state.places[0] || null; state.sel = p ? p.id : ''; }
        return p;
    }
    function currentReport() {
        const p = currentPlace(); if (!p) return null;
        const pr = C.period(state.period, now(), $('log-from').value, $('log-to').value);
        if (pr.error) return { p, error: pr.error };
        return { p, r: C.report(p, pr.from, pr.to, now()) };
    }
    function cutForm(host, p, cut, done) {
        host.textContent = '';
        const t = now(), today = C.dayKey(t);
        const ds = input('date', { value: cut ? C.dayKey(cut.s) : today, max: today }), ts = input('time', { value: cut ? C.clock(cut.s) : '' });
        const de = input('date', { value: cut && cut.e != null ? C.dayKey(cut.e) : (cut ? C.dayKey(cut.s) : today), max: today }), te = input('time', { value: cut && cut.e != null ? C.clock(cut.e) : '' });
        const still = input('checkbox', { checked: !!cut && cut.e == null });
        const r1 = el('div', 'two'); r1.append(field('Date power went', ds), field('Time power went', ts));
        const r2 = el('div', 'two'); r2.append(field('Date power came back', de), field('Time power came back', te));
        const stillL = el('label', 'check'); stillL.append(still, el('span', null, 'Still off (the power has not come back)'));
        const nextNote = el('p', 'hint');
        const note = input('text', { maxLength: 200, autocomplete: 'off', placeholder: 'e.g. transformer fault', value: cut ? cut.note || '' : '' });
        const noteF = field('Note', note);
        const noteOpen = btn('+ Add a note (optional)', 'link');
        noteF.hidden = !(cut && cut.note); noteOpen.hidden = !noteF.hidden;
        noteOpen.addEventListener('click', () => { noteF.hidden = false; noteOpen.hidden = true; note.focus(); });
        const err = el('p', 'err'); err.setAttribute('role', 'alert');
        let deTouched = !!(cut && cut.e != null && C.dayKey(cut.e) !== C.dayKey(cut.s));
        function sync() {
            r2.hidden = still.checked;
            const a = readTime(ts), b = readTime(te);
            if (!deTouched && ds.value) {
                const base = C.keyToMs(ds.value);
                if (base != null) de.value = a != null && b != null && b <= a ? C.dayKey(C.addDays(base, 1)) : ds.value;
            }
            nextNote.textContent = !still.checked && ds.value && de.value && de.value !== ds.value ? 'The power came back on ' + (C.keyToMs(de.value) != null ? C.dateText(C.keyToMs(de.value)) : de.value) + '.' : '';
        }
        [ds, ts, te, still].forEach(i => i.addEventListener('input', sync));
        still.addEventListener('change', sync);
        de.addEventListener('input', () => { deTouched = true; sync(); });
        sync();
        const row = el('div', 'row-btns');
        row.append(btn(cut ? 'Save changes' : 'Add cut', 'primary save-cut', () => {
            const a = readTime(ts), b = readTime(te), d1 = C.keyToMs(ds.value), d2 = C.keyToMs(de.value);
            const s = d1 != null && a != null ? C.atMin(d1, a) : null;
            if (!still.checked && (d2 == null || b == null)) { err.textContent = 'Pick the date and time the power came back, or tick Still off.'; return; }
            const e = still.checked ? null : C.atMin(d2, b);
            if (s == null) { err.textContent = 'Pick the date and time the power went.'; return; }
            if (e == null && p.cuts.some(c => c.e == null && (!cut || c.id !== cut.id))) { err.textContent = 'Another cut is still marked as off. Tap Power is back on it first.'; return; }
            if (e == null && p.cuts.some(c => c.s > s && (!cut || c.id !== cut.id))) { err.textContent = 'A later cut is logged, so this one must have ended. Add the time the power came back.'; return; }
            const m = C.cutError(p, s, e, cut ? cut.id : null, now());
            if (m) { err.textContent = m; return; }
            const n = note.value.replace(/\s+/g, ' ').trim().slice(0, 200);
            if (cut) { cut.s = s; cut.e = e; cut.note = n; } else p.cuts.push({ id: uid(), s, e, note: n });
            save(); done(true);
            toast(cut ? 'Cut changed.' : 'Cut added: ' + C.dateText(s) + ' ' + C.clock(s) + (e ? ' to ' + C.clock(e) + ', ' + C.dur(e - s) : ', still off') + '.', false);
        }));
        row.append(btn('Cancel', 'secondary', () => done(false)));
        host.append(r1, stillL, r2, nextNote, noteOpen, noteF, err, row);
        return ts;
    }
    function renderLog() {
        const p = currentPlace();
        $('log').hidden = !p;
        if (!p) return;
        const sel = $('log-place'); sel.textContent = '';
        state.places.forEach(x => { const o = new Option(x.name, x.id); o.selected = x.id === p.id; sel.append(o); });
        $('log-place-box').hidden = state.places.length < 2;
        $('log-period').value = state.period;
        $('custom-box').hidden = state.period !== 'custom';
        $('log-h').textContent = 'Power cut log' + (state.places.length > 1 ? '' : ': ' + p.name);
        renderSum();
        renderRows();
    }
    function sumLine(label, value, note, cls) {
        const d = el('div', 's-row' + (cls ? ' ' + cls : ''));
        d.append(el('p', 's-label', label), el('p', 's-val', value));
        if (note) d.append(el('p', 's-note', note));
        return d;
    }
    function renderSum() {
        const out = $('sum'); out.textContent = ''; $('period-err').textContent = '';
        const cr = currentReport(); if (!cr) return;
        if (cr.error) { $('period-err').textContent = cr.error; $('share').hidden = true; return; }
        const r = cr.r, p = cr.p;
        out.append(el('p', 's-period', C.periodText(r)));
        if (r.future) { out.append(el('p', 'hint', 'These dates are in the future.')); $('share').hidden = true; return; }
        out.append(sumLine('Without power', C.dur(r.off), r.count ? r.count + (r.count === 1 ? ' cut' : ' cuts') + (r.days ? ', about ' + C.dur(r.perDay) + ' a day' : '') : 'No cuts logged in this time.', 'main'));
        if (r.planned) out.append(sumLine('Planned load shedding', C.dur(r.planned), C.diffText(r) + (r.planFrom > r.from ? ' (counted from ' + C.shortDate(r.planFrom) + ', when you started)' : ''), r.diff > C.MIN ? 'more' : ''));
        else if (!(p.schedules || []).some(sc => sc.slots.length)) out.append(el('p', 'hint', 'No cut times for ' + p.name + ', so every cut counts as unplanned.'));
        if (r.outside >= C.MIN) out.append(sumLine('Outside the planned times', C.dur(r.outside), r.unplanned ? 'Including ' + r.unplanned + ' unplanned ' + (r.unplanned === 1 ? 'cut' : 'cuts') + '.' : '', 'more'));
        if (r.longest && r.count > 1) out.append(sumLine('Longest cut', C.dur(r.longest.e - r.longest.s), C.dateText(r.longest.s) + ', ' + C.clock(r.longest.s) + ' to ' + (r.longest.open ? 'still off' : C.clock(r.longest.e))));
        $('share').hidden = !r.count;
    }
    function renderRows() {
        const host = $('rows'); host.textContent = '';
        const cr = currentReport();
        if (!cr || cr.error) { $('rows-h').hidden = true; return; }
        const r = cr.r, p = cr.p;
        $('rows-h').hidden = false;
        $('rows-h').textContent = r.rows.length ? 'Cuts, newest first' : 'Cuts';
        if (!r.rows.length) { host.append(el('p', 'hint', p.cuts.length ? 'No cuts logged in this time. Pick another time under Show.' : 'No cuts logged yet. Tap Power went when the power goes.')); return; }
        r.rows.forEach(x => {
            const row = el('div', 'r-row' + (x.open ? ' now' : ''));
            if (editingCut === x.cut.id) {
                row.classList.add('editing');
                const ts = cutForm(row, p, x.cut, () => { editingCut = null; render(); });
                host.append(row); setTimeout(() => ts.focus(), 0);
                return;
            }
            const main = el('div', 'r-main');
            main.append(el('p', 'r-date', C.dateText(x.s)));
            const sameDay = C.dayStart(x.s) === C.dayStart(x.e);
            main.append(el('p', 'r-time', C.clock(x.s) + ' to ' + (x.open ? 'still off' : (sameDay ? '' : C.dateText(x.e) + ' ') + C.clock(x.e))));
            main.append(el('p', 'r-dur', C.dur(x.e - x.s)));
            const tag = el('p', 'r-tag ' + x.kind, x.kind === 'unplanned' ? 'Not planned' : x.kind === 'over' ? C.dur(x.extra) + ' outside planned times' : 'Planned');
            main.append(tag);
            if (x.cut.note) main.append(el('p', 'r-note', x.cut.note));
            const b = el('div', 'r-btns');
            b.append(btn('Edit', 'secondary small', () => { editingCut = x.cut.id; renderRows(); }));
            b.append(btn('Delete', 'secondary small danger-t', () => withUndo('Cut on ' + C.dateText(x.s) + ' deleted.', () => { p.cuts = p.cuts.filter(c => c !== x.cut); editingCut = null; })));
            row.append(main, b);
            host.append(row);
        });
    }
    $('log-place').addEventListener('change', e => { state.sel = e.target.value; editingCut = null; save(); renderLog(); });
    $('log-period').addEventListener('change', e => {
        state.period = e.target.value;
        if (state.period === 'custom' && !$('log-from').value) { const t = now(); $('log-from').value = C.dayKey(new Date(new Date(t).getFullYear(), new Date(t).getMonth(), 1).getTime()); $('log-to').value = C.dayKey(t); }
        save(); renderLog();
    });
    ['log-from', 'log-to'].forEach(id => $(id).addEventListener('change', renderLog));
    $('past-open').addEventListener('click', () => {
        const p = currentPlace(); if (!p) return;
        $('past-box').hidden = false; $('past-open').hidden = true;
        const ts = cutForm($('past-box'), p, null, changed => { $('past-box').hidden = true; $('past-open').hidden = false; $('past-box').textContent = ''; if (changed) render(); });
        ts.focus();
    });
    function logMsg(text, bad) { const m = $('log-msg'); m.textContent = text; m.className = 'msg show' + (bad ? ' bad' : ''); }
    $('copy').addEventListener('click', () => {
        const cr = currentReport(); if (!cr || cr.error) return;
        const text = C.summaryText(cr.p, cr.r);
        const fallback = () => {
            const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'absolute'; ta.style.left = '-9999px';
            document.body.appendChild(ta); ta.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; } ta.remove();
            logMsg(ok ? 'Copied. Paste it into a message, email or complaint form.' : 'Could not copy here. Use Email or Print instead.', !ok);
        };
        if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(() => logMsg('Copied. Paste it into a message, email or complaint form.'), fallback);
        else fallback();
    });
    $('email').addEventListener('click', () => {
        const cr = currentReport(); if (!cr || cr.error) return;
        let body = C.summaryText(cr.p, cr.r);
        if (body.length > 1800) body = body.slice(0, 1800).replace(/\n[^\n]*$/, '') + '\n... (list shortened: use Copy for a complaint for the full list)';
        location.href = 'mailto:?subject=' + encodeURIComponent('Power cuts at ' + cr.p.name + ', ' + C.periodText(cr.r)) + '&body=' + encodeURIComponent(body);
    });
    $('print').addEventListener('click', () => {
        const cr = currentReport(); if (!cr || cr.error) return;
        let pa = $('print-area'); if (!pa) { pa = el('pre', 'print-only'); pa.id = 'print-area'; document.body.append(pa); }
        pa.textContent = C.summaryText(cr.p, cr.r);
        window.print();
    });
    $('csv').addEventListener('click', () => {
        const cr = currentReport(); if (!cr || cr.error) return;
        download('power-cuts-' + C.dayKey(cr.r.from) + '-to-' + C.dayKey(C.addDays(cr.r.to, -1)) + '.csv', 'text/csv', '﻿' + C.csv(cr.p, cr.r));
        logMsg('CSV saved. Open it in Excel, Google Sheets or Numbers.');
    });

    // ---------- backup ----------
    function toolsMsg(text, bad) { const m = $('tools-msg'); m.textContent = text; m.className = 'msg show' + (bad ? ' bad' : ''); }
    $('backup').addEventListener('click', () => {
        if (!state.places.length) { toolsMsg('Nothing to back up yet.', true); return; }
        download('load-shedding-backup-' + C.dayKey(now()) + '.json', 'application/json', JSON.stringify(state, null, 1));
        toolsMsg('Backup file saved. Keep it somewhere safe, such as your email or cloud drive.');
    });
    const restore = () => $('restore-file').click();
    $('restore').addEventListener('click', restore);
    $('restore-first').addEventListener('click', restore);
    $('restore-file').addEventListener('change', e => {
        const f = e.target.files && e.target.files[0]; e.target.value = '';
        if (!f) return;
        if (f.size > 5e6) { toolsMsg('That file is too big to be a backup from this app.', true); toast('That file is too big to be a backup from this app.', false); return; }
        const rd = new FileReader();
        rd.onload = () => {
            let s = null; try { s = C.cleanState(JSON.parse(String(rd.result))); } catch (err) { s = null; }
            if (!s || !s.places.length) { toolsMsg('That file is not a backup from this app.', true); toast('That file is not a backup from this app.', false); return; }
            withUndo('Backup restored: ' + s.places.length + (s.places.length === 1 ? ' place.' : ' places.'), () => { state = s; editingPlace = null; editingCut = null; addingMore = false; });
            toolsMsg('Backup restored.');
        };
        rd.onerror = () => toolsMsg('Could not read that file.', true);
        rd.readAsText(f);
    });
    $('del-all').addEventListener('click', () => {
        if (!state.places.length) { toolsMsg('There is nothing to delete.', true); return; }
        withUndo('Everything deleted.', () => { state = { v: 1, places: [], sel: '', period: 'month', remind: state.remind }; editingPlace = null; editingCut = null; addingMore = false; });
        $('tools-msg').textContent = ''; $('tools-msg').className = 'msg';
    });

    // ---------- draw ----------
    function render() {
        if (editingPlace && !place(editingPlace)) editingPlace = null;
        renderPlaces(); renderAdd(); renderLog();
        $('intro').hidden = false;
    }
    // keep the countdowns and the running cut fresh, without touching anything being typed
    function tick() {
        state.places.forEach(p => { if (editingPlace === p.id) return; const box = document.querySelector('[data-place="' + p.id + '"] .p-dyn'); if (box && !box.contains(document.activeElement)) fillDyn(p, box); });
        if (!$('log').hidden && !editingCut) { renderSum(); if (!$('rows').contains(document.activeElement)) renderRows(); }
    }
    load(); save(); render();
    setInterval(tick, 20000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
