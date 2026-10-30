// Work Hours Limit Tracker page code. The sums live in core.js (window.WHL).
(function () {
    'use strict';
    const C = window.WHL;
    const KEY = 'work-hours-limit-tracker-for-international-students.data';
    const $ = id => document.getElementById(id);
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

    let state = C.emptyState(), canSave = true, editId = null, showAllWeeks = false;
    let now = C.nowParts();
    let viewWeek = C.periodStart(now.day, 1);

    // ---- saving ----
    function load() {
        let raw = null;
        try { raw = localStorage.getItem(KEY); } catch (e) { canSave = false; }
        if (raw) {
            try { state = C.sanitize(JSON.parse(raw)) || C.emptyState(); } catch (e) { state = C.emptyState(); }
        }
    }
    function save() {
        try { localStorage.setItem(KEY, JSON.stringify(state)); canSave = true; } catch (e) { canSave = false; }
        $('store-warn').hidden = canSave;
    }
    const snapshot = () => JSON.stringify(state);
    function restoreSnap(s) { state = C.sanitize(JSON.parse(s)) || C.emptyState(); save(); render(); }

    // ---- messages ----
    const timers = {};
    function say(id, text, undoSnap, bad) {
        const box = $(id);
        box.textContent = '';
        box.className = 'msg' + (text ? ' show' : '') + (bad ? ' bad' : '');
        if (!text) return;
        box.appendChild(el('span', '', text));
        if (undoSnap) {
            const b = el('button', 'link inline', 'Undo');
            b.type = 'button';
            b.addEventListener('click', () => { restoreSnap(undoSnap); say(id, 'Undone.'); });
            box.appendChild(document.createTextNode(' '));
            box.appendChild(b);
        }
        clearTimeout(timers[id]);
        timers[id] = setTimeout(() => say(id, ''), undoSnap ? 15000 : 8000);
    }

    // ---- week box ----
    function weekName(from) {
        const cur = C.periodStart(now.day, state.rule.weekStart);
        if (from === cur) return 'This week';
        if (from === cur - 7) return 'Last week';
        if (from === cur + 7) return 'Next week';
        return 'Week';
    }
    function li(label, value, cls) {
        const l = el('li', cls || '');
        l.appendChild(el('span', '', label));
        l.appendChild(el('b', '', value));
        return l;
    }
    function renderWeek() {
        const rep = C.weekReport(state, viewWeek, now), rule = state.rule, fortnight = rule.period === 14;
        $('week-name').textContent = weekName(viewWeek);
        $('week-range').textContent = C.fmtRange(rep.from, rep.to);
        const big = $('big'), sub = $('big-sub');
        // the period that decides the answer (the tighter one with a fortnight rule)
        const limited = rep.windows.filter(w => w.limit !== null);
        const tight = limited.length ? limited.reduce((a, b) => (b.limit - b.total < a.limit - a.total ? b : a)) : null;
        big.className = 'big';
        if (rep.status === 'nolimit') {
            big.textContent = 'No limit this week';
            sub.textContent = 'Every day is in an official holiday, so you can work full time. ' + fmtTotal(rep.week.total) + ' this week.';
        } else if (rep.status === 'over') {
            big.textContent = 'Over by ' + C.fmt(rep.over);
            big.classList.add('bad');
            sub.textContent = 'You have worked ' + C.fmt(rep.workedOver) + ' more than ' + C.fmt(tight.limit) + (fortnight ? ' in the fortnight ' + C.fmtRange(tight.from, tight.to) : ' this week') + '.';
        } else if (rep.status === 'planned-over') {
            big.textContent = 'Over by ' + C.fmt(rep.over);
            big.classList.add('bad');
            sub.textContent = 'With your planned shifts you would work ' + C.fmt(tight.total) + ' of ' + C.fmt(tight.limit) + (fortnight ? ' in the fortnight ' + C.fmtRange(tight.from, tight.to) : ' this week') + '. Drop or shorten a planned shift.';
        } else if (rep.status === 'full') {
            big.textContent = 'No hours left';
            big.classList.add('warn');
            sub.textContent = 'You have reached ' + C.fmt(tight.limit) + (fortnight ? ' in the fortnight ' + C.fmtRange(tight.from, tight.to) : ' this week') + '. Do not take another shift.';
        } else {
            big.textContent = C.fmt(rep.left) + ' left';
            big.classList.add('good');
            sub.textContent = fortnight ? C.fmt(tight.total) + ' of ' + C.fmt(tight.limit) + ' in the fortnight ' + C.fmtRange(tight.from, tight.to) + '.' : C.fmt(rep.week.total) + ' of ' + C.fmt(tight.limit) + ' this week.';
        }
        // bar: worked solid, planned lighter
        const bar = $('bar');
        if (tight) {
            bar.hidden = false;
            const scale = Math.max(tight.limit, tight.total);
            $('bar-fill').style.width = (tight.worked / scale * 100) + '%';
            $('bar-plan').style.left = (tight.worked / scale * 100) + '%';
            $('bar-plan').style.width = (tight.planned / scale * 100) + '%';
            bar.className = 'bar' + (tight.total > tight.limit ? ' over' : '');
            bar.setAttribute('aria-label', C.fmt(tight.total) + ' of ' + C.fmt(tight.limit));
        } else bar.hidden = true;

        const stats = $('stats');
        stats.textContent = '';
        stats.appendChild(li(fortnight ? 'This week (' + C.fmtDay(rep.from) + ' to ' + C.fmtDay(rep.to) + ')' : 'Hours this week', fmtTotal(rep.week.total)));
        if (rep.week.total) {
            stats.appendChild(li('Worked so far', C.fmt(rep.week.worked)));
            stats.appendChild(li('Planned (not ended yet)', C.fmt(rep.week.planned)));
        }
        if (fortnight) for (const w of rep.windows) {
            const lab = 'Fortnight ' + C.fmtDay(w.from) + ' to ' + C.fmtDay(w.to);
            stats.appendChild(li(lab, w.limit === null ? fmtTotal(w.total) + ', holiday' : C.fmt(w.total) + ' of ' + C.fmt(w.limit), w.over ? 'over' : ''));
        } else if (rep.week.limit !== null && rep.week.holiday) stats.appendChild(li('Holiday week limit', C.fmt(rep.week.limit)));
        if (rep.windows.some(w => w.part)) stats.appendChild(li('Holiday', 'Only part of this ' + (fortnight ? 'fortnight' : 'week') + ', so the term-time limit applies', 'note'));
        const emps = Object.keys(rep.week.byEmp).filter(k => rep.week.byEmp[k] > 0);
        if (emps.length > 1) {
            stats.appendChild(li('By employer', '', 'head'));
            for (const k of emps.sort((a, b) => rep.week.byEmp[b] - rep.week.byEmp[a])) stats.appendChild(li(k || 'No employer typed', C.fmt(rep.week.byEmp[k]), 'emp'));
        }
        // planned shifts to drop
        const ob = $('over-box');
        if (rep.status === 'planned-over' && rep.overShifts.length) {
            ob.hidden = false;
            $('over-h').textContent = 'Planned shifts you could drop or shorten (' + C.fmt(rep.over) + ' too many):';
            const ul = $('over-list');
            ul.textContent = '';
            for (const s of rep.overShifts) ul.appendChild(el('li', '', C.shiftLine(s)));
        } else ob.hidden = true;

        const rt = C.ruleText(rule);
        $('rule-line').textContent = 'Your limit: ' + rt.text + ' (' + rt.name + ').';
        const text = C.weekText(state, rep, now);
        $('mail').href = 'mailto:?subject=' + encodeURIComponent('Work hours, ' + C.fmtRange(rep.from, rep.to)) + '&body=' + encodeURIComponent(text);
        $('today').disabled = viewWeek === C.periodStart(now.day, rule.weekStart);
        renderShifts(rep);
    }
    const fmtTotal = m => m ? C.fmt(m) : '0 h';

    // ---- shifts ----
    function renderShifts(rep) {
        const list = $('shift-list');
        list.textContent = '';
        $('shifts-h').textContent = 'Shifts in ' + weekName(viewWeek).toLowerCase().replace(/^week$/, 'this week');
        $('shift-none').hidden = rep.shifts.length > 0;
        for (const s of rep.shifts) {
            const planned = C.isPlanned(s, now), sp = C.span(s), d = C.parseDate(s.date);
            const box = el('article', 'item' + (planned ? ' planned' : ' worked') + (s.id === editId ? ' editing' : ''));
            box.id = 'shift-' + s.id;
            const top = el('div', 'it-head');
            top.appendChild(el('h3', 'it-name', C.fmtDay(d) + (s.employer ? ' · ' + s.employer : '')));
            top.appendChild(el('span', 'it-hours', C.fmt(C.net(s))));
            box.appendChild(top);
            box.appendChild(el('p', 'it-meta strong', s.start + ' to ' + s.end + (sp.crosses ? ' (ends ' + C.fmtDay(d + 1) + ')' : '')));
            const bits = [];
            bits.push(planned ? 'Planned' : 'Worked');
            if (s.brk) bits.push(C.fmt(s.brk) + ' unpaid break');
            const inWeek = C.parts(s).filter(x => x.day >= rep.from && x.day <= rep.to).reduce((a, x) => a + x.min, 0);
            if (inWeek !== C.net(s)) bits.push(C.fmt(inWeek) + ' of it counts in this week');
            const meta = el('p', 'it-meta');
            const tag = el('span', 'tag ' + (planned ? 't-plan' : 't-done'), bits[0]);
            meta.appendChild(tag);
            if (bits.length > 1) meta.appendChild(document.createTextNode(' · ' + bits.slice(1).join(' · ')));
            box.appendChild(meta);
            if (s.note) box.appendChild(el('p', 'it-note', s.note));
            const btns = el('div', 'it-btns');
            const mk = (label, fn, cls) => { const b = el('button', cls || 'secondary', label); b.type = 'button'; b.addEventListener('click', fn); btns.appendChild(b); return b; };
            mk('Edit', () => startEdit(s.id));
            mk('Same time next week', () => repeatShift(s.id));
            mk('Delete', () => deleteShift(s.id), 'secondary del');
            box.appendChild(btns);
            list.appendChild(box);
        }
    }
    function deleteShift(id) {
        const snap = snapshot(), s = state.shifts.find(x => x.id === id);
        if (!s) return;
        state.shifts = state.shifts.filter(x => x.id !== id);
        if (editId === id) stopEdit();
        save(); render();
        say('week-msg', 'Deleted the shift on ' + C.fmtDay(C.parseDate(s.date)) + '.', snap);
    }
    function repeatShift(id) {
        const s = state.shifts.find(x => x.id === id);
        if (!s) return;
        const snap = snapshot();
        const copy = Object.assign({}, s, { id: C.newId(), date: C.dayStr(C.parseDate(s.date) + 7) });
        if (!C.isDate(copy.date)) return;
        state.shifts.push(copy);
        save();
        viewWeek = C.periodStart(C.parseDate(copy.date), state.rule.weekStart);
        render();
        say('week-msg', 'Added ' + C.shiftLine(copy) + '. ' + afterText(copy), snap);
    }
    function afterText(s) {
        const r = C.weekReport(state, C.periodStart(C.parseDate(s.date), state.rule.weekStart), now);
        if (r.status === 'nolimit') return 'Holiday week: no limit.';
        if (r.over) return 'That week is now over the limit by ' + C.fmt(r.over) + '.';
        return 'That week: ' + C.fmt(r.left) + ' left.';
    }

    // ---- history ----
    function renderHistory() {
        const all = C.allWindows(state, now), card = $('hist');
        card.hidden = !all.length;
        if (!all.length) return;
        const fortnight = state.rule.period === 14;
        $('hist-h').textContent = fortnight ? 'Every fortnight so far' : 'Every week so far';
        const os = C.overSummary(state, now);
        const note = $('hist-note');
        const bits = [];
        if (os.worked.length) bits.push(os.worked.length + (os.worked.length === 1 ? (fortnight ? ' fortnight' : ' week') : (fortnight ? ' fortnights' : ' weeks')) + ' worked over the limit');
        if (os.planned.length) bits.push(os.planned.length + (os.planned.length === 1 ? (fortnight ? ' fortnight' : ' week') : (fortnight ? ' fortnights' : ' weeks')) + ' planned over the limit');
        note.textContent = (fortnight ? 'Fortnights overlap: each one starts on a ' + C.FULL_DAYS[state.rule.weekStart] + '. ' : '') + (bits.length ? bits.join(', ') + '.' : 'No ' + (fortnight ? 'fortnight' : 'week') + ' over the limit.');
        note.className = 'hint' + (os.worked.length ? ' bad' : os.planned.length ? ' warn' : ' good');
        const ul = $('hist-list');
        ul.textContent = '';
        const shown = showAllWeeks ? all : all.slice(0, 12);
        for (const w of shown) {
            const item = el('li');
            const b = el('button', 'wk' + (w.workedOver ? ' over' : w.over ? ' plan-over' : ''));
            b.type = 'button';
            b.appendChild(el('span', 'wk-range', C.fmtRange(w.from, w.to)));
            let val = w.limit === null ? fmtTotal(w.total) + ', holiday' : C.fmt(w.total) + ' of ' + C.fmt(w.limit);
            if (w.over) val += w.workedOver ? ', over by ' + C.fmt(w.over) : ', planned over by ' + C.fmt(w.over);
            b.appendChild(el('b', '', val));
            b.addEventListener('click', () => { viewWeek = C.periodStart(w.from, state.rule.weekStart); render(); $('week').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
            if (w.from <= viewWeek + 6 && w.to >= viewWeek && !fortnight) b.setAttribute('aria-current', 'true');
            item.appendChild(b);
            ul.appendChild(item);
        }
        $('hist-more').hidden = all.length <= 12 || showAllWeeks;
    }

    // ---- add / edit form ----
    function formRaw() { return { employer: $('a-emp').value, date: $('a-date').value, start: $('a-start').value, end: $('a-end').value, brk: $('a-brk').value, note: $('a-note').value }; }
    function showErr(id, text) { $(id + '-err').textContent = text || ''; $(id).setAttribute('aria-invalid', text ? 'true' : 'false'); }
    function preview() {
        const raw = formRaw(), a = C.parseTime(raw.start), b = C.parseTime(raw.end), len = $('a-len');
        if (isNaN(a) || isNaN(b) || a === b) { len.textContent = ''; return; }
        const g = C.span(raw).gross, brk = /^\d+$/.test(raw.brk.trim()) ? +raw.brk.trim() : 0;
        let t = 'Shift length: ' + C.fmt(Math.max(0, g - brk)) + (brk && brk < g ? ' after the break' : '');
        if (b < a) t += ', ends the next day';
        t += '.';
        len.className = 'len';
        // what the week would look like with this shift, before it is saved
        const v = C.validateShift(raw);
        if (v.ok) {
            const trial = { rule: state.rule, holidays: state.holidays, shifts: state.shifts.filter(x => x.id !== editId).concat([Object.assign({ id: '_new' }, v.shift)]) };
            const r = C.weekReport(trial, C.periodStart(C.parseDate(v.shift.date), state.rule.weekStart), now);
            const per = state.rule.period === 14 ? 'fortnight' : 'week';
            if (r.status === 'nolimit') t += ' Holiday ' + per + ': no limit.';
            else if (r.over) { t += ' With it you would be over the limit by ' + C.fmt(r.over) + ' that ' + per + '.'; len.className = 'len over'; }
            else if (r.left === 0) t += ' After it you would be exactly at the limit, with no hours left that ' + per + '.';
            else t += ' After it: ' + C.fmt(r.left) + ' left that ' + per + '.';
        }
        len.textContent = t;
    }
    function saveShift() {
        const v = C.validateShift(formRaw());
        ['a-date', 'a-start', 'a-end', 'a-brk'].forEach(id => showErr(id, ''));
        if (!v.ok) {
            if (v.errors.date) showErr('a-date', v.errors.date);
            if (v.errors.start) showErr('a-start', v.errors.start);
            if (v.errors.end) showErr('a-end', v.errors.end);
            if (v.errors.brk) { openBox('a-brk', true); showErr('a-brk', v.errors.brk); }
            const first = ['a-date', 'a-start', 'a-end', 'a-brk'].find(id => $(id).getAttribute('aria-invalid') === 'true');
            if (first) $(first).focus();
            return;
        }
        const snap = snapshot();
        let s;
        if (editId) {
            s = state.shifts.find(x => x.id === editId);
            if (!s) { stopEdit(); return; }
            Object.assign(s, v.shift);
        } else {
            s = Object.assign({ id: C.newId() }, v.shift);
            state.shifts.push(s);
        }
        const clash = state.shifts.find(x => x.id !== s.id && C.overlaps(x, s));
        const was = editId;
        save();
        viewWeek = C.periodStart(C.parseDate(s.date), state.rule.weekStart);
        stopEdit(true);
        render();
        let msg = (was ? 'Saved: ' : 'Added: ') + C.shiftLine(s) + '. ' + afterText(s);
        if (clash) msg += ' Careful: it overlaps your ' + (clash.employer ? clash.employer + ' ' : '') + 'shift ' + C.fmtDay(C.parseDate(clash.date)) + ' ' + clash.start + ' to ' + clash.end + '. If it is the same shift twice, delete one.';
        say('add-msg', msg, snap, !!clash);
        $('a-note').value = '';
    }
    function startEdit(id) {
        const s = state.shifts.find(x => x.id === id);
        if (!s) return;
        editId = id;
        $('a-emp').value = s.employer; $('a-date').value = s.date; $('a-start').value = s.start; $('a-end').value = s.end;
        $('a-brk').value = s.brk ? String(s.brk) : ''; $('a-note').value = s.note || '';
        openBox('a-brk', !!s.brk); openBox('a-note', !!s.note);
        $('add-h').textContent = 'Edit the shift';
        $('a-save').textContent = 'Save changes';
        $('a-cancel').hidden = false;
        ['a-date', 'a-start', 'a-end', 'a-brk'].forEach(x => showErr(x, ''));
        preview(); render();
        $('add').scrollIntoView({ behavior: 'smooth', block: 'start' });
        $('a-emp').focus({ preventScroll: true });
    }
    function stopEdit(keep) {
        editId = null;
        $('add-h').textContent = 'Add a shift';
        $('a-save').textContent = 'Add shift';
        $('a-cancel').hidden = true;
        if (!keep) { $('a-note').value = ''; }
    }
    function openBox(name, open) {
        $(name + '-box').hidden = !open;
        $(name + '-open').setAttribute('aria-expanded', String(open));
        $(name + '-open').hidden = open;
    }
    function renderEmployers() {
        const counts = {};
        for (const s of state.shifts) if (s.employer) counts[s.employer] = (counts[s.employer] || 0) + 1;
        const names = Object.keys(counts).sort((a, b) => counts[b] - counts[a] || a.localeCompare(b));
        const dl = $('emp-list'); dl.textContent = '';
        for (const n of names) { const o = el('option'); o.value = n; dl.appendChild(o); }
        const chips = $('emp-chips'); chips.textContent = '';
        for (const n of names.slice(0, 4)) {
            const b = el('button', 'chip' + ($('a-emp').value.trim() === n ? ' on' : ''), n);
            b.type = 'button';
            b.setAttribute('aria-pressed', String($('a-emp').value.trim() === n));
            b.addEventListener('click', () => { $('a-emp').value = n; renderEmployers(); });
            chips.appendChild(b);
        }
        chips.hidden = !names.length;
    }

    // ---- rule ----
    function renderRule() {
        const r = state.rule, sel = $('r-preset');
        if (!sel.options.length) for (const p of C.PRESETS) { const o = el('option', '', p.id === 'custom' ? p.short : p.short + ': ' + p.limit + ' h a ' + (p.period === 14 ? 'fortnight' : 'week')); o.value = p.id; sel.appendChild(o); }
        sel.value = r.preset;
        const rt = C.ruleText(r);
        $('r-sum').textContent = rt.text.charAt(0).toUpperCase() + rt.text.slice(1) + '. ' + rt.starts + '.';
        const ws = $('r-start');
        if (!ws.options.length) [1, 2, 3, 4, 5, 6, 0].forEach(d => { const o = el('option', '', C.FULL_DAYS[d]); o.value = String(d); ws.appendChild(o); });
        ws.value = String(r.weekStart);
        $('r-start-l').textContent = r.period === 14 ? 'Fortnights start on' : 'Weeks start on';
        if (document.activeElement !== $('r-limit')) $('r-limit').value = String(r.limit / 60);
        $('r-period').value = String(r.period);
        $('r-hol').value = r.holiday === null ? 'none' : 'limit';
        $('r-hol-box').hidden = r.holiday === null;
        if (document.activeElement !== $('r-hol-h')) $('r-hol-h').value = r.holiday === null ? '' : String(r.holiday / 60);
        $('r-hol-h').previousElementSibling.textContent = r.period === 14 ? 'Most hours in a holiday fortnight' : 'Most hours in a holiday week';
    }
    function setRule(changes, custom) {
        const snap = snapshot();
        Object.assign(state.rule, changes);
        if (custom) state.rule.preset = 'custom';
        viewWeek = rebase(viewWeek);
        save(); render();
        return snap;
    }

    // ---- holidays ----
    function renderHolidays() {
        const list = $('hol-list');
        list.textContent = '';
        const hols = state.holidays.slice().sort((a, b) => C.parseDate(a.from) - C.parseDate(b.from));
        for (const h of hols) {
            const box = el('div', 'item hol');
            const f = C.parseDate(h.from), t = C.parseDate(h.to);
            box.appendChild(el('h3', 'it-name', h.name || 'Holiday'));
            box.appendChild(el('p', 'it-meta', C.fmtDay(f) + (f === t ? '' : ' to ' + C.fmtDay(t)) + ' ' + new Date(t * 86400000).getUTCFullYear() + ' (' + (t - f + 1) + (t === f ? ' day' : ' days') + ')'));
            const b = el('button', 'secondary del', 'Delete');
            b.type = 'button';
            b.setAttribute('aria-label', 'Delete ' + (h.name || 'holiday') + ' ' + C.fmtDay(f));
            b.addEventListener('click', () => {
                const snap = snapshot();
                state.holidays = state.holidays.filter(x => x.id !== h.id);
                save(); render();
                say('top-msg', 'Deleted the holiday ' + (h.name || C.fmtDay(f)) + '.', snap);
            });
            const row = el('div', 'it-btns one'); row.appendChild(b); box.appendChild(row);
            list.appendChild(box);
        }
    }

    function render() {
        now = C.nowParts();
        renderWeek(); renderHistory(); renderEmployers(); renderRule(); renderHolidays();
        $('store-warn').hidden = canSave;
    }

    // ---- files ----
    function download(name, text, type) {
        const blob = new Blob([text], { type }), a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }

    // ---- events ----
    function wire() {
        $('prev').addEventListener('click', () => { viewWeek -= 7; render(); });
        $('next').addEventListener('click', () => { viewWeek += 7; render(); });
        $('today').addEventListener('click', () => { viewWeek = C.periodStart(now.day, state.rule.weekStart); render(); });
        $('rule-jump').addEventListener('click', () => { $('rule').scrollIntoView({ behavior: 'smooth', block: 'start' }); $('r-preset').focus({ preventScroll: true }); });
        $('copy').addEventListener('click', () => {
            const text = C.weekText(state, C.weekReport(state, viewWeek, now), now);
            const done = () => say('week-msg', 'Copied. Paste it into a message or email.');
            const fallback = () => { const t = el('textarea'); t.value = text; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); done(); } catch (e) { say('week-msg', 'Could not copy. Use Email this week instead.', null, true); } t.remove(); };
            if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
        });
        ['a-start', 'a-end', 'a-brk'].forEach(id => $(id).addEventListener('input', () => { showErr(id, ''); preview(); }));
        $('a-date').addEventListener('input', () => { showErr('a-date', ''); preview(); });
        $('a-emp').addEventListener('input', renderEmployers);
        $('a-save').addEventListener('click', saveShift);
        ['a-emp', 'a-date', 'a-start', 'a-end', 'a-brk'].forEach(id => $(id).addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveShift(); } }));
        $('a-cancel').addEventListener('click', () => { stopEdit(); ['a-date', 'a-start', 'a-end', 'a-brk'].forEach(x => showErr(x, '')); render(); say('add-msg', 'Not changed.'); });
        $('a-brk-open').addEventListener('click', () => { openBox('a-brk', true); $('a-brk').focus(); });
        $('a-note-open').addEventListener('click', () => { openBox('a-note', true); $('a-note').focus(); });
        document.querySelectorAll('#brk-chips .chip').forEach(b => b.addEventListener('click', () => { $('a-brk').value = b.dataset.brk; showErr('a-brk', ''); preview(); }));

        $('r-preset').addEventListener('change', e => {
            const id = e.target.value, snap = snapshot();
            if (id === 'custom') { state.rule.preset = 'custom'; openRuleMore(); save(); render(); $('r-limit').focus(); return; }
            state.rule = C.ruleFromPreset(id, state.rule.weekStart);
            viewWeek = rebase(viewWeek);
            save(); render();
            say('top-msg', 'Rule set: ' + C.ruleText(state.rule).text + '.', snap);
        });
        $('r-more-open').addEventListener('click', openRuleMore);
        $('r-limit').addEventListener('change', () => {
            const p = C.parseHours($('r-limit').value, state.rule.period * 24);
            showErr('r-limit', p.error);
            if (p.error) return;
            if (p.min !== state.rule.limit) setRule({ limit: p.min }, true);
        });
        $('r-period').addEventListener('change', () => {
            const period = +$('r-period').value, ch = { period };
            if (state.rule.limit > period * 1440) ch.limit = period * 1440;
            if (state.rule.holiday !== null && state.rule.holiday > period * 1440) ch.holiday = period * 1440;
            setRule(ch, true);
        });
        $('r-start').addEventListener('change', () => setRule({ weekStart: +$('r-start').value }, false));
        $('r-hol').addEventListener('change', () => {
            if ($('r-hol').value === 'none') setRule({ holiday: null }, true);
            else { $('r-hol-box').hidden = false; setRule({ holiday: state.rule.period === 14 ? 4800 : 2400 }, true); $('r-hol-h').focus(); }
        });
        $('r-hol-h').addEventListener('change', () => {
            const p = C.parseHours($('r-hol-h').value, state.rule.period * 24);
            $('r-hol-err').textContent = p.error || ''; $('r-hol-h').setAttribute('aria-invalid', p.error ? 'true' : 'false');
            if (!p.error && p.min !== state.rule.holiday) setRule({ holiday: p.min }, true);
        });

        $('h-open').addEventListener('click', () => { $('h-box').hidden = false; $('h-open').hidden = true; $('h-from').focus(); });
        $('h-cancel').addEventListener('click', closeHol);
        $('h-save').addEventListener('click', () => {
            const v = C.validateHoliday({ from: $('h-from').value, to: $('h-to').value, name: $('h-name').value });
            showErr('h-from', v.errors.from); showErr('h-to', v.errors.to);
            if (!v.ok) return;
            const snap = snapshot();
            state.holidays.push(Object.assign({ id: C.newId() }, v.holiday));
            save(); closeHol(); render();
            say('top-msg', 'Holiday saved: ' + C.fmtRange(C.parseDate(v.holiday.from), C.parseDate(v.holiday.to)) + '.', snap);
        });

        $('backup').addEventListener('click', () => { download('work-hours-backup-' + C.dayStr(now.day) + '.json', JSON.stringify(state, null, 1), 'application/json'); say('tools-msg', 'Backup file saved. Keep it somewhere safe.'); });
        $('csv').addEventListener('click', () => {
            if (!state.shifts.length) { say('tools-msg', 'There are no shifts yet.', null, true); return; }
            download('work-hours-' + C.dayStr(now.day) + '.csv', '﻿' + C.csv(state), 'text/csv'); say('tools-msg', 'CSV saved. Open it in Excel, Numbers or Google Sheets.');
        });
        $('restore').addEventListener('click', () => $('restore-file').click());
        $('restore-file').addEventListener('change', e => {
            const f = e.target.files && e.target.files[0];
            e.target.value = '';
            if (!f) return;
            if (f.size > 5e6) { say('tools-msg', 'That file is too big to be a backup from this app.', null, true); return; }
            const rd = new FileReader();
            rd.onload = () => {
                let data = null;
                try { data = C.sanitize(JSON.parse(rd.result)); } catch (err) { data = null; }
                if (!data || (!data.shifts.length && !data.holidays.length)) { say('tools-msg', 'That file is not a backup from this app, or it is empty. Nothing was changed.', null, true); return; }
                const snap = snapshot();
                state = data; stopEdit(); save();
                viewWeek = C.periodStart(now.day, state.rule.weekStart);
                render();
                say('tools-msg', 'Restored ' + data.shifts.length + (data.shifts.length === 1 ? ' shift' : ' shifts') + ' and ' + data.holidays.length + (data.holidays.length === 1 ? ' holiday' : ' holidays') + '.', snap);
            };
            rd.onerror = () => say('tools-msg', 'Could not read that file.', null, true);
            rd.readAsText(f);
        });
        $('wipe').addEventListener('click', () => {
            if (!state.shifts.length && !state.holidays.length) { say('tools-msg', 'There is nothing to delete.'); return; }
            const snap = snapshot();
            state = C.emptyState(); stopEdit(); save();
            viewWeek = C.periodStart(now.day, state.rule.weekStart);
            render();
            say('tools-msg', 'Everything deleted.', snap);
        });
        $('hist-more').addEventListener('click', () => { showAllWeeks = true; renderHistory(); });
        // planned shifts turn into worked ones as time passes
        setInterval(() => { const n = C.nowParts(); if (n.min !== now.min || n.day !== now.day) render(); }, 30000);
        document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
    }
    // after the week start day changes, stay on the same week (today's week if it was showing)
    function rebase(from) {
        const anchor = now.day >= from && now.day <= from + 6 ? now.day : from + 3;
        return C.periodStart(anchor, state.rule.weekStart);
    }
    function openRuleMore() { $('r-more').hidden = false; $('r-more-open').hidden = true; $('r-more-open').setAttribute('aria-expanded', 'true'); }
    function closeHol() { $('h-box').hidden = true; $('h-open').hidden = false; $('h-from').value = ''; $('h-to').value = ''; $('h-name').value = ''; showErr('h-from', ''); showErr('h-to', ''); }

    load();
    viewWeek = C.periodStart(now.day, state.rule.weekStart);
    $('a-date').value = C.dayStr(now.day);
    wire();
    render();
    if (state.rule.preset === 'custom') openRuleMore();
    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
