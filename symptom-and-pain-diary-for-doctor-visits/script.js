// Symptom and Pain Diary: the page. The maths, checks and report words live in core.js.
(function () {
    const C = window.SPDCore;
    const KEY = 'symptom-and-pain-diary-for-doctor-visits.state';
    const $ = id => document.getElementById(id);
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const btn = (cls, text, onClick) => { const b = el('button', cls, text); b.type = 'button'; if (onClick) b.addEventListener('click', onClick); return b; };
    const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
    const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

    // ---------- saved state
    let storageOk = true, state = load();
    function fresh() { return { v: 1, symptoms: [], episodes: [], current: '', period: '30', name: '' }; }
    function load() {
        let raw = null;
        try { raw = localStorage.getItem(KEY); } catch (e) { storageOk = false; }
        if (!raw) return fresh();
        try { return C.clean(JSON.parse(raw)) || fresh(); } catch (e) { return fresh(); }
    }
    function save() {
        try { localStorage.setItem(KEY, JSON.stringify(state)); storageOk = true; } catch (e) { storageOk = false; }
        $('store-warn').hidden = storageOk;
    }
    const snapshot = () => JSON.stringify(state);
    function restoreSnapshot(snap) { const s = C.clean(JSON.parse(snap)); if (s) { state = s; save(); } resetForm(); renderAll(); }
    const sym = () => state.symptoms.find(s => s.id === state.current) || state.symptoms[0] || null;
    const symById = id => state.symptoms.find(s => s.id === id);

    // ---------- time words
    const now = () => C.stamp(new Date());
    const today = () => now().slice(0, 10);
    function whenText(t) {
        const d = C.dayOf(t), td = today();
        const day = d === td ? 'today' : d === C.addDays(td, -1) ? 'yesterday' : C.fmtDay(d, d.slice(0, 4) !== td.slice(0, 4));
        return day + ' ' + C.fmtTime(t);
    }
    const lower = s => s.name.toLowerCase();

    // ---------- messages with Undo
    function say(box, text, opt) {
        const o = opt || {};
        box.textContent = ''; box.className = 'msg show' + (o.kind ? ' ' + o.kind : '');
        const p = el('p', null, text); box.appendChild(p);
        if (o.undo) {
            const b = btn('link inline undo', 'Undo', () => { restoreSnapshot(o.undo); say(box, o.undoText || 'Undone.'); });
            p.appendChild(document.createTextNode(' ')); p.appendChild(b);
        }
    }
    const clearMsg = box => { box.textContent = ''; box.className = 'msg'; };
    function setErr(id, text, input) {
        $(id + '-err').textContent = text || '';
        if (input) input.setAttribute('aria-invalid', text ? 'true' : 'false');
    }

    // ---------- symptoms: first use and adding more
    const PRESET_NAMES = Object.keys(C.PRESETS);
    function addSymptom(name) {
        name = String(name || '').trim().replace(/\s+/g, ' ');
        if (!name) { setErr('own', 'Type a name, for example Dizziness.', $('own-name')); return; }
        const same = state.symptoms.find(s => s.name.toLowerCase() === name.toLowerCase());
        if (same) { state.current = same.id; save(); closeSetup(); renderAll(); say($('log-msg'), same.name + ' is already in your diary, so it was opened.'); return; }
        if (state.symptoms.length >= 30) { setErr('own', 'You can keep up to 30 symptoms.', $('own-name')); return; }
        const s = C.newSymptom(name, newId());
        state.symptoms.push(s); state.current = s.id; save();
        $('own-name').value = ''; setErr('own', '', $('own-name'));
        closeSetup(); resetForm(); renderAll();
        say($('log-msg'), s.name + ' added. Log an episode below whenever it happens.');
    }
    let setupOpen = false;
    function openSetup() { setupOpen = true; renderSetup(); $('setup').scrollIntoView({ block: 'nearest' }); }
    function closeSetup() { setupOpen = false; }
    function renderSetup() {
        const none = !state.symptoms.length;
        $('setup').hidden = !(none || setupOpen);
        $('setup-cancel').hidden = none;
        const box = $('presets'); box.textContent = '';
        PRESET_NAMES.forEach(n => {
            const have = state.symptoms.some(s => s.name.toLowerCase() === n.toLowerCase());
            const b = btn('secondary preset', n, () => addSymptom(n));
            if (have) { b.disabled = true; b.title = 'Already in your diary'; b.textContent = n + ' (added)'; }
            box.appendChild(b);
        });
    }
    $('own-add').addEventListener('click', () => addSymptom($('own-name').value));
    $('own-name').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addSymptom($('own-name').value); } });
    $('setup-cancel').addEventListener('click', () => { closeSetup(); setErr('own', '', $('own-name')); renderAll(); });

    function renderTabs() {
        const nav = $('syms'); nav.textContent = '';
        nav.hidden = !state.symptoms.length;
        const cur = sym();
        state.symptoms.forEach(s => {
            const b = btn('sym', s.name, () => {
                if (form.editing) resetForm();
                state.current = s.id; save(); renderAll();
            });
            b.setAttribute('aria-pressed', cur && cur.id === s.id ? 'true' : 'false');
            nav.appendChild(b);
        });
        nav.appendChild(btn('sym add-sym', '+ Add a symptom', openSetup));
    }

    // ---------- the log form
    const form = {};
    function resetForm() {
        Object.assign(form, { editing: null, start: 'now', stopped: false, len: '', pain: null, triggers: new Set(), meds: [], where: '', note: '' });
        $('start-pick').value = ''; $('end-pick').value = ''; $('where').value = ''; $('note').value = '';
        ['start', 'end', 'pain'].forEach(id => setErr(id, ''));
        $('start-pick').setAttribute('aria-invalid', 'false'); $('end-pick').setAttribute('aria-invalid', 'false');
        $('more-box').hidden = true; $('more-open').hidden = false;
        $('trig-box').hidden = true; $('trig-open').hidden = false; $('trig-name').value = '';
    }
    function startValue() {
        if (form.start === 'pick') return $('start-pick').value || '';
        const n = now();
        return form.start === 'now' ? n : C.addMin(n, -Number(form.start));
    }
    function endValue(start) {
        if (!form.stopped) return null;
        if (form.len === 'now') return now();
        if (form.len === 'pick') return $('end-pick').value || '';
        if (!form.len) return '';
        return C.isStamp(start) ? C.addMin(start, Number(form.len)) : '';
    }
    function renderForm() {
        const s = sym();
        if (!s) return;
        $('log-h').textContent = form.editing ? 'Edit this ' + lower(s) + ' episode' : 'Log ' + lower(s);
        $('save').textContent = form.editing ? 'Save changes' : 'Save episode';
        $('edit-cancel').hidden = !form.editing;
        $('log').classList.toggle('editing', !!form.editing);
        renderTimes();
        // pain buttons
        const pain = $('pain');
        if (!pain.children.length) for (let i = 0; i <= 10; i++) {
            const b = btn('pn', String(i), () => { form.pain = i; setErr('pain', ''); renderForm(); });
            b.dataset.p = i; b.setAttribute('aria-label', i + ' out of 10, ' + C.painWord(i));
            pain.appendChild(b);
        }
        [...pain.children].forEach(b => { b.setAttribute('aria-pressed', Number(b.dataset.p) === form.pain ? 'true' : 'false'); b.className = 'pn ' + level(Number(b.dataset.p)); });
        // triggers for this symptom, plus any ticked on an old episode that are no longer in the list
        const tc = $('trig-chips'); tc.textContent = '';
        const names = s.triggers.slice();
        form.triggers.forEach(t => { if (!names.some(n => n.toLowerCase() === t.toLowerCase())) names.push(t); });
        names.forEach(t => {
            const on = [...form.triggers].some(x => x.toLowerCase() === t.toLowerCase());
            const b = btn('chip', t, () => {
                const hit = [...form.triggers].find(x => x.toLowerCase() === t.toLowerCase());
                if (hit) form.triggers.delete(hit); else form.triggers.add(t);
                renderForm();
            });
            b.setAttribute('aria-pressed', on ? 'true' : 'false');
            tc.appendChild(b);
        });
        if (!names.length) tc.appendChild(el('p', 'hint', 'No triggers in the list. Add your own below.'));
        renderMeds();
        // where suggestions: this symptom's list and places used before
        const wc = $('where-chips'); wc.textContent = '';
        const used = state.episodes.filter(e => e.sid === s.id && e.where).map(e => e.where);
        [...new Set(s.wheres.concat(used).map(w => w.trim()))].slice(0, 10).forEach(w => wc.appendChild(btn('chip', w, () => { $('where').value = w; })));
    }
    // the start and stop part of the form (also refreshed every minute, so "Now" stays now)
    function renderTimes() {
        document.querySelectorAll('#start-chips .chip').forEach(b => b.setAttribute('aria-pressed', b.dataset.start === form.start ? 'true' : 'false'));
        $('start-box').hidden = form.start !== 'pick';
        const sv = startValue();
        $('start-text').textContent = C.isStamp(sv) ? whenText(sv) : 'choose the date and time above';
        document.querySelectorAll('#stop-seg .chip').forEach(b => b.setAttribute('aria-pressed', (b.dataset.stopped === 'yes') === form.stopped ? 'true' : 'false'));
        $('len-box').hidden = !form.stopped;
        $('stop-hint').hidden = !(form.stopped && form.start === 'now');
        document.querySelectorAll('#len-chips .chip').forEach(b => b.setAttribute('aria-pressed', b.dataset.len === form.len ? 'true' : 'false'));
        $('end-box').hidden = form.len !== 'pick';
        const ev = endValue(sv);
        const showEnd = !!(form.stopped && form.len && form.len !== 'pick' && ev && C.isStamp(sv));
        $('end-line').hidden = !showEnd;
        if (showEnd) $('end-text').textContent = whenText(ev) + ' (' + C.fmtDur(C.toMin(ev) - C.toMin(sv)) + ')';
    }
    const level = p => p >= 7 ? 'severe' : p >= 4 ? 'moderate' : p >= 1 ? 'mild' : 'zero';

    function renderMeds() {
        const box = $('meds'); box.textContent = '';
        form.meds.forEach((m, i) => {
            const row = el('div', 'med-row');
            const f1 = el('div', 'field'), l1 = el('label', null, 'Medicine ' + (form.meds.length > 1 ? i + 1 : '') + ' and dose');
            const inp = el('input'); inp.type = 'text'; inp.maxLength = 60; inp.autocomplete = 'off'; inp.placeholder = 'e.g. Ibuprofen 400 mg';
            inp.id = 'med-name-' + i; l1.htmlFor = inp.id; inp.setAttribute('list', 'med-names'); inp.value = m.name;
            inp.addEventListener('input', () => { m.name = inp.value; });
            f1.append(l1, inp);
            const f2 = el('div', 'field'), l2 = el('label', null, 'Did it help?');
            const sel = el('select'); sel.id = 'med-help-' + i; l2.htmlFor = sel.id;
            [['', 'Not sure yet'], ['yes', 'Yes'], ['some', 'A bit'], ['no', 'No']].forEach(([v, t]) => { const o = el('option', null, t); o.value = v; sel.appendChild(o); });
            sel.value = m.helped; sel.addEventListener('change', () => { m.helped = sel.value; });
            f2.append(l2, sel);
            const rm = btn('link inline rm', 'Remove', () => { form.meds.splice(i, 1); renderMeds(); });
            rm.setAttribute('aria-label', 'Remove medicine ' + (i + 1));
            row.append(f1, f2, rm);
            box.appendChild(row);
        });
        $('med-add').textContent = form.meds.length ? '+ Add another medicine' : '+ Add a medicine you took';
        $('med-add').hidden = form.meds.length >= 6;
        const dl = $('med-names'); dl.textContent = '';
        const seen = new Set();
        state.episodes.slice().sort((a, b) => a.start < b.start ? 1 : -1).forEach(e => e.meds.forEach(m => {
            const k = m.name.toLowerCase(); if (seen.has(k) || seen.size >= 30) return; seen.add(k);
            const o = el('option'); o.value = m.name; dl.appendChild(o);
        }));
    }

    $('start-chips').addEventListener('click', e => {
        const b = e.target.closest('[data-start]'); if (!b) return;
        form.start = b.dataset.start; setErr('start', '', $('start-pick'));
        if (form.start === 'pick' && !$('start-pick').value) $('start-pick').value = C.addMin(now(), -180);
        renderTimes();
        if (form.start === 'pick') $('start-pick').focus();
    });
    $('start-pick').addEventListener('input', () => { setErr('start', '', $('start-pick')); renderTimes(); });
    $('stop-seg').addEventListener('click', e => {
        const b = e.target.closest('[data-stopped]'); if (!b) return;
        form.stopped = b.dataset.stopped === 'yes'; setErr('end', '', $('end-pick')); renderTimes();
    });
    $('len-chips').addEventListener('click', e => {
        const b = e.target.closest('[data-len]'); if (!b) return;
        form.len = b.dataset.len; setErr('end', '', $('end-pick'));
        if (form.len === 'pick' && !$('end-pick').value) { const sv = startValue(); $('end-pick').value = C.isStamp(sv) ? C.addMin(sv, 60) : now(); }
        renderTimes();
        if (form.len === 'pick') $('end-pick').focus();
    });
    $('end-pick').addEventListener('input', () => { setErr('end', '', $('end-pick')); renderTimes(); });
    $('med-add').addEventListener('click', () => {
        form.meds.push({ name: '', helped: '' }); renderMeds();
        const i = form.meds.length - 1; $('med-name-' + i).focus();
    });
    $('more-open').addEventListener('click', () => { $('more-box').hidden = false; $('more-open').hidden = true; $('where').focus(); });
    $('trig-open').addEventListener('click', () => { $('trig-box').hidden = false; $('trig-open').hidden = true; $('trig-name').focus(); });
    function addTrigger() {
        const s = sym(), t = $('trig-name').value.trim().replace(/\s+/g, ' ');
        if (!s || !t) { $('trig-name').focus(); return; }
        const have = s.triggers.find(x => x.toLowerCase() === t.toLowerCase());
        if (!have) { if (s.triggers.length < 40) s.triggers.push(t); save(); }
        const name = have || t;
        if (![...form.triggers].some(x => x.toLowerCase() === name.toLowerCase())) form.triggers.add(name);
        $('trig-name').value = ''; $('trig-box').hidden = true; $('trig-open').hidden = false;
        renderForm(); renderSettings();
    }
    $('trig-add').addEventListener('click', addTrigger);
    $('trig-name').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addTrigger(); } });

    function saveEpisode() {
        const s = sym(); if (!s) return;
        const n = now(), start = startValue(), end = endValue(start);
        ['start', 'end', 'pain'].forEach(id => setErr(id, ''));
        $('start-pick').setAttribute('aria-invalid', 'false'); $('end-pick').setAttribute('aria-invalid', 'false');
        let err = C.checkEpisode({ start, end, pain: form.pain }, n);
        if (form.stopped && !form.len) err.end = 'Choose how long it lasted, or "Still going".';
        if (err.start) setErr('start', err.start, $('start-pick'));
        if (err.end) setErr('end', err.end, form.len === 'pick' ? $('end-pick') : null);
        if (err.pain) setErr('pain', err.pain);
        if (Object.keys(err).length) {
            const first = err.start ? (form.start === 'pick' ? $('start-pick') : $('start-chips').querySelector('[aria-pressed="true"]')) : err.end ? (form.len === 'pick' ? $('end-pick') : $('stop-seg').querySelector('[aria-pressed="true"]')) : $('pain').children[5];
            if (first) first.focus();
            say($('log-msg'), 'Not saved yet: please fix the message' + (Object.keys(err).length > 1 ? 's' : '') + ' above.', { kind: 'bad' });
            return;
        }
        const meds = form.meds.map(m => ({ name: m.name.trim().replace(/\s+/g, ' ').slice(0, 60), helped: m.helped })).filter(m => m.name);
        const ep = { id: form.editing || newId(), sid: s.id, start, end, pain: form.pain, where: $('where').value.trim().slice(0, 60),
            triggers: [...form.triggers], meds, note: $('note').value.trim().slice(0, 500) };
        const snap = snapshot(), wasEdit = !!form.editing;
        if (wasEdit) {
            const i = state.episodes.findIndex(e => e.id === form.editing);
            if (i >= 0) { ep.sid = state.episodes[i].sid; state.episodes[i] = ep; } else state.episodes.push(ep);
        } else state.episodes.push(ep);
        const dup = !wasEdit && state.episodes.some(e => e !== ep && e.sid === ep.sid && e.start === ep.start);
        save(); resetForm(); renderAll();
        let text = (wasEdit ? 'Changes saved: ' : 'Saved: ') + symById(ep.sid).name + ', ' + whenText(ep.start) + (ep.end ? ', ' + C.fmtDur(C.durationMin(ep, n)) : ', still going') + ', pain ' + ep.pain + '/10.';
        if (dup) text += ' You already had one starting at the same time; delete one in Episodes if it was a double tap.';
        say($('log-msg'), text, { undo: snap, undoText: wasEdit ? 'The episode is back as it was.' : 'Removed again.' });
    }
    $('save').addEventListener('click', saveEpisode);
    $('edit-cancel').addEventListener('click', () => { resetForm(); renderAll(); say($('log-msg'), 'Editing cancelled. Nothing was changed.'); });
    $('log').addEventListener('keydown', e => { if (e.key === 'Escape' && form.editing) { resetForm(); renderAll(); say($('log-msg'), 'Editing cancelled. Nothing was changed.'); } });

    function editEpisode(ep) {
        resetForm();
        Object.assign(form, { editing: ep.id, start: 'pick', stopped: !!ep.end, len: ep.end ? 'pick' : '', pain: ep.pain,
            triggers: new Set(ep.triggers), meds: ep.meds.map(m => ({ name: m.name, helped: m.helped })) });
        $('start-pick').value = ep.start; $('end-pick').value = ep.end || '';
        $('where').value = ep.where; $('note').value = ep.note;
        if (ep.where || ep.note) { $('more-box').hidden = false; $('more-open').hidden = true; }
        if (state.current !== ep.sid) { state.current = ep.sid; save(); }
        renderAll();
        clearMsg($('log-msg'));
        $('log').scrollIntoView({ block: 'start' });
        $('start-pick').focus({ preventScroll: true });
    }

    // ---------- still going
    function renderOngoing() {
        const list = state.episodes.filter(e => !e.end).sort((a, b) => a.start < b.start ? -1 : 1);
        $('ongoing').hidden = !list.length;
        const box = $('ongoing-list'); box.textContent = '';
        const n = now();
        list.forEach(ep => {
            const s = symById(ep.sid);
            const item = el('div', 'og ' + level(ep.pain));
            item.appendChild(el('p', 'og-h', s.name + ': since ' + whenText(ep.start)));
            item.appendChild(el('p', 'og-sub', C.fmtDur(C.durationMin(ep, n)) + ' so far, pain ' + ep.pain + '/10' + (ep.meds.length ? ', took ' + ep.meds.map(m => m.name).join(', ') : '')));
            const selects = [];
            ep.meds.forEach((m, i) => {
                if (m.helped) return;
                const f = el('div', 'field og-help'), l = el('label', null, 'Did ' + m.name + ' help?');
                const sel = el('select'); sel.id = 'og-' + ep.id + '-' + i; l.htmlFor = sel.id;
                [['', 'Not sure'], ['yes', 'Yes'], ['some', 'A bit'], ['no', 'No']].forEach(([v, t]) => { const o = el('option', null, t); o.value = v; sel.appendChild(o); });
                selects.push([m, sel]); f.append(l, sel); item.appendChild(f);
            });
            const row = el('div', 'og-btns');
            row.appendChild(btn('primary small', 'It stopped now', () => {
                const t = now(), snap = snapshot();
                if (C.toMin(t) - C.toMin(ep.start) > C.MAX_LEN_MIN) { editEpisode(ep); setErr('end', 'This started more than 31 days ago. Choose when it stopped.'); return; }
                ep.end = C.toMin(t) > C.toMin(ep.start) ? t : C.addMin(ep.start, 1);
                selects.forEach(([m, sel]) => { m.helped = sel.value; });
                save(); renderAll();
                say($('ongoing-msg'), s.name + ' stopped: it lasted ' + C.fmtDur(C.durationMin(ep, t)) + '.', { undo: snap, undoText: 'It is marked as still going again.' });
            }));
            row.appendChild(btn('secondary small', 'Edit', () => editEpisode(ep)));
            item.appendChild(row);
            box.appendChild(item);
        });
    }

    // ---------- summary
    function current() {
        const s = sym();
        return { s, sum: C.summary(state.episodes, s.id, state.period, today(), now()) };
    }
    function renderSummary() {
        const { s, sum } = current();
        $('period').value = state.period;
        const empty = !sum.n;
        $('sum-empty').hidden = !empty; $('sum-body').hidden = empty;
        const anyEver = state.episodes.some(e => e.sid === s.id);
        $('sum-empty-h').textContent = anyEver ? 'No ' + lower(s) + ' in ' + sum.range.label : 'No episodes yet';
        $('sum-empty-text').textContent = anyEver
            ? (sum.prevDays ? 'In ' + sum.range.prev.label + ' you had it on ' + plural(sum.prevDays, 'day') + '. ' : '') + 'Choose a longer period above to see older episodes.'
            : 'Log an episode and it is counted here: the days, how bad, how long, what helped and the triggers.';
        if (empty) return;
        $('days-n').textContent = sum.days;
        $('days-unit').textContent = sum.spanDays ? 'of ' + sum.spanDays + ' days' : (sum.days === 1 ? 'day' : 'days');
        $('days-text').textContent = 'with ' + lower(s) + ' in ' + sum.range.label;
        let cmp = '';
        if (sum.prevDays !== null) {
            const d = sum.days - sum.prevDays;
            cmp = 'In ' + sum.range.prev.label + ': ' + plural(sum.prevDays, 'day') + (d === 0 ? ', the same.' : d < 0 ? ', so ' + -d + ' fewer now.' : ', so ' + d + ' more now.');
            if (state.period === 'month') cmp += ' This month is not over yet.';
        }
        $('compare').textContent = cmp; $('compare').hidden = !cmp;
        $('t-n').textContent = sum.n; $('t-n-sub').textContent = sum.ongoing ? sum.ongoing + ' still going' : '';
        $('t-pain').textContent = sum.avgPain + '/10'; $('t-pain-sub').textContent = 'worst ' + sum.worst + '/10';
        $('t-len').textContent = sum.avgLen === null ? '-' : C.fmtDur(sum.avgLen);
        $('t-len-sub').textContent = sum.avgLen === null ? 'none has stopped yet' : 'average of ' + plural(sum.n - sum.ongoing, 'episode');
        $('t-long').textContent = C.fmtDur(sum.longest);
        const longest = sum.list.reduce((a, e) => C.durationMin(e, now()) > C.durationMin(a, now()) ? e : a, sum.list[0]);
        $('t-long-sub').textContent = C.fmtDay(C.dayOf(longest.start)) + (longest.end ? '' : ', still going');
        const ml = $('med-lines'); ml.textContent = '';
        if (!sum.meds.length) ml.appendChild(el('li', 'muted', 'No medicine noted in this period.'));
        sum.meds.forEach(m => ml.appendChild(el('li', null, C.medLine(m))));
        $('med-days').textContent = 'Medicine taken on ' + plural(sum.medDays, 'day') + (sum.spanDays ? ' of ' + sum.spanDays : '') + '.';
        $('overuse').hidden = !sum.overuse;
        $('overuse').textContent = 'You took medicine on ' + sum.medDays + ' days in ' + sum.range.label + '. For headaches, pain medicine on 10 or more days a month can itself cause more headaches (medication overuse headache). Mention this to your doctor; do not stop a prescribed medicine without asking.';
        const tc = $('trig-counts'); tc.textContent = '';
        if (!sum.triggers.length) tc.appendChild(el('li', 'muted', 'No triggers ticked in this period.'));
        sum.triggers.slice(0, 6).forEach(t => {
            const li = el('li');
            li.appendChild(el('span', 'c-name', t.name));
            li.appendChild(el('span', 'c-n', t.n + ' of ' + sum.n));
            const track = el('span', 'track'), bar = el('span', 'bar'); bar.style.width = Math.round(t.n * 100 / sum.n) + '%';
            track.appendChild(bar); li.appendChild(track); tc.appendChild(li);
        });
        renderCalendar(sum);
    }
    function renderCalendar(sum) {
        const r = sum.range, show = r.from && sum.spanDays <= 92;
        $('cal-wrap').hidden = !show; $('cal-none').hidden = !!show;
        if (!show) return;
        const map = C.dayMap(sum.list, r.from, r.to, now()), cal = $('cal'), td = today();
        cal.textContent = '';
        // whole weeks, Monday to Sunday, around the period
        const first = C.addDays(r.from, -((C.weekday(r.from) + 6) % 7)), last = C.addDays(r.to, (7 - C.weekday(r.to)) % 7);
        for (let d = first; d <= last; d = C.addDays(d, 1)) {
            const inside = d >= r.from && d <= r.to, x = map[d];
            const c = el('span', 'cd' + (inside ? '' : ' out') + (x && x.pain >= 0 ? ' ' + level(x.pain) : '') + (d === td ? ' today' : ''));
            c.setAttribute('role', 'listitem');
            c.appendChild(el('span', 'cd-n', String(Number(d.slice(8)))));
            if (x && x.med) c.appendChild(el('span', 'dot'));
            if (inside) c.setAttribute('aria-label', C.fmtDay(d) + (x && x.pain >= 0 ? ': worst pain ' + x.pain + ' out of 10' + (x.med ? ', medicine taken' : '') : ': none'));
            else c.setAttribute('aria-hidden', 'true');
            if (inside && (d.slice(8) === '01' || d === r.from)) c.dataset.month = C.monthName(d.slice(0, 7)).slice(0, 3);
            cal.appendChild(c);
        }
    }
    $('period').addEventListener('change', () => { state.period = $('period').value; save(); renderAll(); });

    // ---------- the list of episodes
    function renderList() {
        const { s, sum } = current(), box = $('months');
        box.textContent = '';
        $('list-h').textContent = s.name + ' episodes';
        $('list-hint').textContent = sum.n ? 'In ' + sum.range.label + ', newest first.' : 'None in ' + sum.range.label + '.';
        let month = '', group = null;
        sum.list.forEach(ep => {
            const m = ep.start.slice(0, 7);
            if (m !== month) {
                month = m; group = el('div', 'month');
                group.appendChild(el('h3', 'month-h', C.monthName(m)));
                group.appendChild(el('ul', 'eps'));
                box.appendChild(group);
            }
            group.lastChild.appendChild(episodeRow(ep, s));
        });
    }
    function episodeRow(ep, s) {
        const li = el('li', 'ep ' + level(ep.pain)), n = now();
        const head = el('div', 'ep-head');
        const sd = C.dayOf(ep.start);
        let when = C.fmtDay(sd) + ', ' + C.fmtTime(ep.start);
        if (ep.end) when += ' to ' + (C.dayOf(ep.end) !== sd ? C.fmtDay(C.dayOf(ep.end)) + ' ' : '') + C.fmtTime(ep.end);
        head.appendChild(el('span', 'ep-when', when));
        head.appendChild(el('span', 'ep-pain', ep.pain + '/10 ' + C.painWord(ep.pain)));
        li.appendChild(head);
        li.appendChild(el('p', 'ep-len', ep.end ? 'Lasted ' + C.fmtDur(C.durationMin(ep, n)) : 'Still going, ' + C.fmtDur(C.durationMin(ep, n)) + ' so far'));
        if (ep.where) li.appendChild(el('p', 'ep-line', 'Where: ' + ep.where));
        if (ep.triggers.length) li.appendChild(el('p', 'ep-line', 'After: ' + ep.triggers.join(', ')));
        if (ep.meds.length) li.appendChild(el('p', 'ep-line', 'Took: ' + ep.meds.map(m => m.name + (m.helped ? ' (' + C.helpedWord(m.helped) + ')' : '')).join(', ')));
        if (ep.note) li.appendChild(el('p', 'ep-note', ep.note));
        const row = el('div', 'ep-btns');
        const eb = btn('secondary small', 'Edit', () => editEpisode(ep)); eb.setAttribute('aria-label', 'Edit ' + when);
        const db = btn('secondary small', 'Delete', () => {
            const snap = snapshot();
            state.episodes = state.episodes.filter(e => e.id !== ep.id);
            if (form.editing === ep.id) resetForm();
            save(); renderAll();
            say($('list-msg'), 'Deleted the episode from ' + whenText(ep.start) + '.', { undo: snap, undoText: 'The episode is back.' });
        });
        db.setAttribute('aria-label', 'Delete ' + when);
        row.append(eb, db); li.appendChild(row);
        return li;
    }

    // ---------- settings
    $('person').addEventListener('input', () => { state.name = $('person').value.trim().slice(0, 40); save(); });
    function renderSettings() {
        $('person').value = state.name;
        const box = $('sym-boxes'); box.textContent = '';
        if (!state.symptoms.length) box.appendChild(el('p', 'hint top', 'No symptoms yet. Choose one at the top.'));
        state.symptoms.forEach((s, idx) => {
            const b = el('div', 'sym-box');
            const id = 'sym-name-' + idx, l = el('label', null, 'Name'); l.htmlFor = id;
            const inp = el('input'); inp.type = 'text'; inp.id = id; inp.maxLength = 40; inp.autocomplete = 'off'; inp.value = s.name;
            const err = el('p', 'err'); err.setAttribute('role', 'alert');
            inp.addEventListener('change', () => {
                const v = inp.value.trim().replace(/\s+/g, ' ');
                err.textContent = '';
                if (!v) { err.textContent = 'A name is needed. It was put back.'; inp.value = s.name; return; }
                if (state.symptoms.some(o => o !== s && o.name.toLowerCase() === v.toLowerCase())) { err.textContent = 'You already have ' + v + '. Choose another name.'; inp.value = s.name; return; }
                s.name = v; save(); rm.textContent = rmLabel(); renderTabs(); renderForm(); renderSummary(); renderList(); renderOngoing();
            });
            b.append(l, inp, err);
            const count = state.episodes.filter(e => e.sid === s.id).length;
            b.appendChild(el('p', 'hint', plural(count, 'episode') + ' logged.'));
            b.appendChild(el('p', 'sub-legend', 'Triggers to choose from'));
            if (s.triggers.length) b.appendChild(el('p', 'hint top', 'Tap one to take it off the list. Past episodes keep it.'));
            const tl = el('div', 'chips small');
            if (!s.triggers.length) tl.appendChild(el('p', 'hint', 'None. Add your own when logging.'));
            s.triggers.forEach(t => {
                const c = btn('chip removable', t + ' ×', () => {
                    const snap = snapshot();
                    s.triggers = s.triggers.filter(x => x !== t); save(); renderForm(); renderSettings();
                    say($('set-msg'), '"' + t + '" removed from the list for ' + s.name + '. Past episodes keep it.', { undo: snap, undoText: '"' + t + '" is back in the list.' });
                });
                c.setAttribute('aria-label', 'Remove trigger ' + t + ' from ' + s.name);
                tl.appendChild(c);
            });
            b.appendChild(tl);
            const rmLabel = () => 'Remove ' + s.name + (count ? ' and its ' + plural(count, 'episode') : '');
            const rm = btn('danger small-danger', rmLabel(), () => {
                const snap = snapshot();
                state.symptoms = state.symptoms.filter(x => x !== s);
                state.episodes = state.episodes.filter(e => e.sid !== s.id);
                if (state.current === s.id) state.current = state.symptoms[0] ? state.symptoms[0].id : '';
                resetForm(); save(); renderAll();
                say($('set-msg'), s.name + ' removed' + (count ? ' with ' + plural(count, 'episode') : '') + '.', { undo: snap, undoText: s.name + ' is back.' });
            });
            b.appendChild(rm);
            box.appendChild(b);
        });
        $('wipe').hidden = !state.symptoms.length;
    }
    function download(name, text, type) {
        const a = el('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name;
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }
    $('backup').addEventListener('click', () => {
        download('symptom-diary-backup-' + today() + '.json', JSON.stringify(Object.assign({ app: 'symptom-and-pain-diary-for-doctor-visits', saved: now() }, state), null, 1), 'application/json');
        say($('set-msg'), 'Backup saved with ' + plural(state.episodes.length, 'episode') + '. Keep the file somewhere safe.');
    });
    $('restore').addEventListener('click', () => $('restore-file').click());
    $('restore-file').addEventListener('change', () => {
        const file = $('restore-file').files[0]; $('restore-file').value = '';
        if (!file) return;
        if (file.size > 20e6) { say($('set-msg'), 'That file is too big to be a backup from this app.', { kind: 'bad' }); return; }
        file.text().then(text => {
            let data = null; try { data = C.clean(JSON.parse(text)); } catch (e) { data = null; }
            if (!data || !data.symptoms.length) { say($('set-msg'), 'That file is not a backup from this app, so nothing was changed.', { kind: 'bad' }); return; }
            const snap = snapshot();
            state = data; closeSetup(); resetForm(); save(); renderAll();
            say($('set-msg'), 'Backup restored: ' + plural(state.symptoms.length, 'symptom') + ', ' + plural(state.episodes.length, 'episode') + '.', { undo: snap, undoText: 'Back to how it was before the restore.' });
        }).catch(() => say($('set-msg'), 'That file could not be read.', { kind: 'bad' }));
    });
    $('wipe').addEventListener('click', () => {
        const snap = snapshot(), n = state.episodes.length;
        state = fresh(); resetForm(); save(); renderAll();
        say($('set-msg'), 'The whole diary was deleted (' + plural(n, 'episode') + ').', { undo: snap, undoText: 'Your diary is back.' });
        $('settings').scrollIntoView({ block: 'nearest' });
    });

    // ---------- share
    function reportFor(maxLen) { const { s, sum } = current(); return C.reportText(s, sum, today(), now(), state.name, maxLen); }
    function setMailLink() {
        const { s, sum } = current(), a = $('email');
        if (!sum.n) { a.removeAttribute('href'); a.setAttribute('aria-disabled', 'true'); return; }
        a.removeAttribute('aria-disabled');
        a.href = 'mailto:?subject=' + encodeURIComponent(s.name + ' diary' + (state.name ? ': ' + state.name : '')) + '&body=' + encodeURIComponent(reportFor(1800));
    }
    function renderShare() {
        const { sum } = current();
        ['print', 'copy', 'csv'].forEach(id => { $(id).disabled = !sum.n; });
        $('share-hint').textContent = sum.n ? 'Uses ' + sum.range.label + ' (' + plural(sum.n, 'episode') + '). Change "Show" above for another period.' : 'Nothing to share for this period yet.';
        setMailLink();
    }
    $('email').addEventListener('click', e => {
        if (!$('email').hasAttribute('href')) { e.preventDefault(); return; }
        setMailLink();
        say($('share-msg'), 'Your mail app should open with the summary. Type your doctor\'s address there. A very long list is shortened in the email; use Print or Copy as text for all of it.');
    });
    function fallbackCopy(text, done) {
        const t = el('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
        document.body.appendChild(t); t.select();
        let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
        t.remove();
        if (ok) done(); else say($('share-msg'), 'This browser blocked copying. Use Email or Print instead.', { kind: 'bad' });
    }
    $('copy').addEventListener('click', () => {
        const text = reportFor(0), done = () => say($('share-msg'), 'Copied. Paste it into a message or a note for your doctor.');
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
        else fallbackCopy(text, done);
    });
    $('csv').addEventListener('click', () => {
        const { s, sum } = current();
        download(s.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-diary-' + today() + '.csv', '﻿' + C.csv(s, sum.list, now()), 'text/csv');
        say($('share-msg'), 'Spreadsheet saved. It opens in Excel, Numbers or Google Sheets.');
    });
    function buildReport() {
        const { s, sum } = current(), rep = $('report'), td = today(), n = now();
        rep.textContent = '';
        rep.appendChild(el('h2', null, s.name + ' diary' + (state.name ? ': ' + state.name : '')));
        rep.appendChild(el('p', null, 'Period: ' + C.rangeText(sum, td) + ' (' + sum.range.label + '). Printed ' + C.fmtDay(td, true) + '.'));
        C.headLines(s, sum, td).forEach((l, i) => rep.appendChild(el('p', i === 0 ? 'r-big' : null, l)));
        if (sum.overuse) rep.appendChild(el('p', null, 'Note: medicine taken on ' + sum.medDays + ' days; 10 or more a month can cause medication overuse headache.'));
        const table = el('table'), thead = el('thead'), hr = el('tr');
        ['Started', 'Stopped / length', 'Pain', 'Where', 'Possible triggers', 'Medicine (did it help?)', 'Note'].forEach(h => hr.appendChild(el('th', null, h)));
        thead.appendChild(hr); table.appendChild(thead);
        const tb = el('tbody');
        sum.list.forEach(ep => {
            const tr = el('tr'), sd = C.dayOf(ep.start);
            const len = ep.end ? (C.dayOf(ep.end) !== sd ? C.fmtDay(C.dayOf(ep.end)) + ' ' : '') + C.fmtTime(ep.end) + ' (' + C.fmtDur(C.durationMin(ep, n)) + ')' : 'still going (' + C.fmtDur(C.durationMin(ep, n)) + ')';
            [C.fmtDay(sd, true) + ' ' + C.fmtTime(ep.start), len, ep.pain + '/10', ep.where, ep.triggers.join(', '),
                ep.meds.map(m => m.name + (m.helped ? ' (' + C.helpedWord(m.helped) + ')' : '')).join(', '), ep.note].forEach(v => tr.appendChild(el('td', null, v)));
            tb.appendChild(tr);
        });
        table.appendChild(tb); rep.appendChild(table);
        rep.appendChild(el('p', 'r-foot', 'Pain is the worst of each episode, 0 (none) to 10 (worst ever). Kept with Symptom and Pain Diary for Doctor Visits. Not medical advice.'));
    }
    $('print').addEventListener('click', () => { buildReport(); window.print(); });
    window.addEventListener('beforeprint', buildReport);

    // ---------- draw everything
    function renderAll() {
        $('store-warn').hidden = storageOk;
        renderSetup(); renderTabs(); renderSettings();
        const has = !!sym();
        if (has && state.current !== sym().id) state.current = sym().id;
        ['col-side', 'list', 'log'].forEach(id => { $(id).hidden = !has; });
        $('ongoing').hidden = true;
        if (!has) return;
        renderOngoing(); renderForm(); renderSummary(); renderShare(); renderList();
    }
    resetForm();
    renderAll();
    // keep "so far" times and the "Now" start fresh while the page stays open
    setInterval(() => { if (sym() && document.visibilityState === 'visible') { renderOngoing(); renderTimes(); } }, 60000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && sym()) renderAll(); });

    if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
