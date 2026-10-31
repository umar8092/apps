// Learner Driver Practice Log: the page. The logic lives in core.js.
(function () {
    'use strict';
    const C = window.LearnerCore;
    const SLUG = 'learner-driver-practice-log';
    const KEY = SLUG + '.state';
    const $ = id => document.getElementById(id);
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

    let canSave = true, state, edDrive = null, edLearner = null, liveTimer = null, geoPos = null;

    // ---------- saving ----------
    function load() {
        let raw = null;
        try { raw = localStorage.getItem(KEY); } catch (e) { canSave = false; }
        if (raw) {
            try { const s = C.validate(JSON.parse(raw)); if (s) return s; } catch (e) { /* damaged: start fresh */ }
            setTimeout(() => show('set-msg', 'The saved log could not be read, so the app started fresh. Restore a backup file if you have one.'), 0);
        }
        return C.emptyState();
    }
    function save() {
        try { localStorage.setItem(KEY, JSON.stringify(state)); canSave = true; } catch (e) { canSave = false; }
        $('storage-warn').hidden = canSave;
    }
    const cur = () => state.learners.find(l => l.id === state.cur) || null;
    const snapshot = () => JSON.stringify(state);

    // ---------- messages with undo ----------
    let msgTimer = null;
    function show(id, text, undoSnap) {
        const m = $(id);
        m.textContent = '';
        m.classList.toggle('show', !!text);
        if (!text) return;
        m.appendChild(el('span', null, text));
        if (undoSnap) {
            const b = el('button', 'undo', 'Undo'); b.type = 'button';
            b.addEventListener('click', () => { state = C.validate(JSON.parse(undoSnap)) || C.emptyState(); save(); render(); show(id, 'Undone.'); });
            m.appendChild(b);
        }
        clearTimeout(msgTimer);
        msgTimer = setTimeout(() => { m.textContent = ''; m.classList.remove('show'); }, undoSnap ? 15000 : 6000);
    }

    // ---------- render ----------
    function render() {
        const l = cur();
        $('start').hidden = !!l;
        ['progress', 'add-row', 'drives', 'skills', 'rules'].forEach(id => { $(id).hidden = !l; });
        if (!l) { $('who').hidden = true; stopLiveTimer(); return; }
        renderWho(); renderProgress(l); renderLive(l); renderDrives(l); renderSkills(l); renderRules(l);
    }
    function renderWho() {
        const s = $('who-sel'); s.textContent = '';
        state.learners.forEach(x => { const o = el('option', null, x.name); o.value = x.id; s.appendChild(o); });
        s.value = state.cur;
        $('who').hidden = state.learners.length < 2;
    }
    function bar(label, have, need, cls) {
        const w = el('div', 'meter ' + (cls || ''));
        const top = el('p', 'meter-top');
        top.appendChild(el('span', 'meter-label', label));
        top.appendChild(el('span', 'meter-num', C.dur(have) + ' of ' + need / 60 + ' h' + (have >= need ? ' ✓' : '')));
        w.appendChild(top);
        const b = el('div', 'bar'); b.setAttribute('role', 'progressbar'); b.setAttribute('aria-label', label);
        b.setAttribute('aria-valuemin', '0'); b.setAttribute('aria-valuemax', String(need)); b.setAttribute('aria-valuenow', String(Math.min(have, need)));
        const f = el('span'); f.style.width = (need ? Math.min(100, have / need * 100) : 100).toFixed(1) + '%'; b.appendChild(f);
        w.appendChild(b);
        return w;
    }
    function renderProgress(l) {
        const today = C.todayIso();
        const t = C.totals(l), tg = t.targets, body = $('prog-body');
        $('prog-h').textContent = l.name + "'s hours";
        body.textContent = '';
        const big = el('p', 'total');
        big.appendChild(el('span', 'total-amt', C.dur(t.total)));
        big.appendChild(el('span', 'total-what', ' of ' + tg.total + ' hours'));
        body.appendChild(big);
        body.appendChild(el('p', 'total-sub', tg.rule.id === 'custom' ? 'Your own goal' : tg.rule.label + ', ' + tg.rule.group));
        body.appendChild(bar('All supervised driving', t.total, t.need.total));
        if (t.need.night) body.appendChild(bar('At night', t.night, t.need.night, 'night'));
        if (t.need.weather) body.appendChild(bar('In bad weather', t.weather, t.need.weather, 'weather'));
        const lines = C.headline(l, today);
        const go = el('p', 'togo ' + (t.done ? 'done' : ''), lines[1]);
        body.appendChild(go);
        if (!t.done && !l.drives.length) body.appendChild(el('p', 'line muted', 'Log your first drive to see how long the rest will take.'));
        const det = el('ul', 'breakdown');
        const li = (txt, cls) => det.appendChild(el('li', cls || '', txt));
        li(t.drives + (t.drives === 1 ? ' drive' : ' drives') + ', ' + C.dur(t.drive) + ' behind the wheel' + (t.nightDriven ? ', ' + C.dur(t.nightDriven) + ' of it at night' : ''));
        if (t.bonus) li('+ ' + C.dur(t.bonus) + ' bonus for ' + C.dur(t.lessonMin) + ' of lessons with an instructor (1 hour counts as ' + tg.lesson.mult + ', up to ' + tg.lesson.cap + ' h)', 'bonus');
        else if (tg.lesson && t.lessonMin === 0) li('Lessons with an instructor count ' + (tg.lesson.mult === 3 ? 'triple' : 'double') + ' here, up to ' + tg.lesson.cap + ' logbook hours.', 'bonus muted-li');
        if (t.prior.total) li('+ ' + C.dur(t.prior.total) + ' logged before (' + C.dur(t.prior.night) + ' at night)', 'prior');
        body.appendChild(det);
        // email: totals and skills, plus the most recent drives so the link stays a sensible length
        const text = C.summaryText(l, today);
        const short = text.length > 1800 ? text.slice(0, 1800).replace(/\n[^\n]*$/, '') + '\n(more drives: use Copy summary or Save logbook)' : text;
        $('email').href = 'mailto:?subject=' + encodeURIComponent('Learner driver log: ' + l.name) + '&body=' + encodeURIComponent(short);
        const has = l.drives.length > 0;
        $('csv').disabled = !has; $('print').disabled = !has;
    }
    function renderLive(l) {
        const live = l.live;
        $('live').hidden = !live; $('add-btns').hidden = !!live;
        stopLiveTimer();
        if (!live) return;
        const tick = () => {
            const min = Math.max(0, Math.floor((Date.now() - live.a) / 6e4));
            const d = new Date(live.a);
            $('live-text').textContent = l.name + ' is driving since ' + C.hm(d.getHours() * 60 + d.getMinutes()) + (C.isoOf(d) !== C.todayIso() ? ' on ' + C.niceDate(C.isoOf(d), false) : '') + ' · ' + C.dur(min);
        };
        tick(); liveTimer = setInterval(tick, 15000);
    }
    function stopLiveTimer() { if (liveTimer) clearInterval(liveTimer); liveTimer = null; }

    function renderDrives(l) {
        const list = $('drive-list'); list.textContent = '';
        const ds = C.sortDrives(l.drives);
        if (!ds.length) { list.appendChild(el('p', 'sum-empty', 'No drives yet. Tap "Start a drive now" before you set off, or "+ Add a drive I did".')); return; }
        let month = '', ul = null;
        const sums = {};
        ds.forEach(d => { const k = d.date.slice(0, 7); sums[k] = sums[k] || { min: 0, night: 0, n: 0 }; sums[k].min += d.min; sums[k].night += d.night; sums[k].n++; });
        ds.slice(0, 400).forEach(d => {
            const k = d.date.slice(0, 7);
            if (k !== month) {
                month = k;
                const p = C.parseIso(k + '-01');
                const h = el('h3', 'month-h');
                h.appendChild(el('span', null, ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][p.mo - 1] + ' ' + p.y));
                h.appendChild(el('span', 'month-sum', sums[k].n + (sums[k].n === 1 ? ' drive, ' : ' drives, ') + C.dur(sums[k].min) + (sums[k].night ? ' (' + C.dur(sums[k].night) + ' night)' : '')));
                list.appendChild(h);
                ul = el('ul', 'drive-ul'); list.appendChild(ul);
            }
            const li = el('li', 'drive'); li.dataset.id = d.id;
            const top = el('div', 'drive-top');
            top.appendChild(el('span', 'drive-date', C.niceDate(d.date, false)));
            top.appendChild(el('b', 'drive-min', C.dur(d.min)));
            li.appendChild(top);
            li.appendChild(el('p', 'drive-time', C.hm(d.start) + ' to ' + C.hm(d.end) + (d.end <= d.start ? ' (next day)' : '') + (d.night ? ' · ' + C.dur(d.night) + ' at night' + (d.nightManual ? ' (typed)' : '') : ' · daytime')));
            const who = [];
            if (d.lesson) who.push('Lesson with an instructor');
            if (d.sup) who.push('With ' + d.sup);
            if (d.car) who.push(d.car);
            if (who.length) li.appendChild(el('p', 'drive-who', who.join(' · ')));
            const tags = [...(d.roads || []).map(id => (C.ROADS.find(r => r.id === id) || {}).label), ...(d.skills || []).map(id => (C.SKILLS.find(s => s.id === id) || {}).label)].filter(Boolean);
            if (tags.length) { const tw = el('p', 'drive-tags'); tags.forEach(t => tw.appendChild(el('span', 'tag', t))); li.appendChild(tw); }
            if (d.notes) li.appendChild(el('p', 'drive-notes', d.notes));
            const act = el('div', 'act');
            const e = el('button', 'mini', 'Edit'); e.type = 'button'; e.setAttribute('aria-label', 'Edit the drive on ' + C.niceDate(d.date)); e.addEventListener('click', () => openDrive(d));
            const x = el('button', 'mini', 'Delete'); x.type = 'button'; x.setAttribute('aria-label', 'Delete the drive on ' + C.niceDate(d.date)); x.addEventListener('click', () => deleteDrive(d.id));
            act.appendChild(e); act.appendChild(x); li.appendChild(act);
            ul.appendChild(li);
        });
        if (ds.length > 400) list.appendChild(el('p', 'hint', 'Showing the newest 400 drives. All ' + ds.length + ' are in the totals, the CSV and the backup.'));
    }
    function renderSkills(l) {
        const r = C.readiness(l), t = C.totals(l), ready = $('ready');
        ready.className = 'ready ' + (r.ready ? 'ok' : '');
        if (r.ready) ready.textContent = 'Hours done and every skill ticked confident: ' + l.name + ' looks ready to book the driving test.';
        else if (t.done) ready.textContent = 'Hours done. Still to tick confident: ' + r.notConfident.length + (r.notConfident.length === 1 ? ' skill.' : ' skills.');
        else ready.textContent = (12 - r.notConfident.length) + ' of 12 skills ticked confident.';
        const ul = $('skill-list'); ul.textContent = '';
        C.skillStats(l).forEach(s => {
            const li = el('li', 'skill' + (s.confident ? ' conf' : '') + (s.count ? '' : ' none'));
            const txt = el('div', 'skill-txt');
            txt.appendChild(el('b', null, s.label));
            txt.appendChild(el('span', 'skill-n', s.count ? 'Practised on ' + s.count + (s.count === 1 ? ' drive' : ' drives') + ', last ' + C.niceDate(s.last, false) : 'Not practised yet'));
            li.appendChild(txt);
            const lab = el('label', 'conf-box'); const cb = el('input'); cb.type = 'checkbox'; cb.checked = s.confident;
            cb.setAttribute('aria-label', 'Confident at ' + s.label);
            cb.addEventListener('change', () => { const snap = snapshot(); if (cb.checked) l.confident[s.id] = true; else delete l.confident[s.id]; save(); render(); show('msg', (cb.checked ? 'Ticked confident: ' : 'Unticked: ') + s.label + '.', snap); });
            lab.appendChild(cb); lab.appendChild(el('span', null, 'Confident'));
            li.appendChild(lab);
            ul.appendChild(li);
        });
    }
    function renderRules(l) {
        const t = C.targetsOf(l), b = $('rules-body'); b.textContent = '';
        const ul = el('ul', 'rule-list');
        ul.appendChild(el('li', null, 'Learner: ' + l.name));
        ul.appendChild(el('li', null, (t.rule.id === 'custom' ? 'Own goal' : t.rule.label + ', ' + t.rule.group) + ': ' + t.total + ' hours, ' + t.night + ' at night' + (t.weather ? ', ' + t.weather + ' in bad weather' : '')));
        if (t.lesson) ul.appendChild(el('li', null, 'Instructor lessons: 1 hour counts as ' + t.lesson.mult + ', up to ' + t.lesson.cap + ' logbook hours'));
        const n = l.night;
        let nd = C.nightDesc(n);
        if (n.mode === 'sun') { const s = C.sunTimes(C.todayIso(), n.lat, n.lon); if (!s.polar) nd += ' (today ' + C.clockOf(s.set) + ' to ' + C.clockOf(s.rise) + ')'; }
        ul.appendChild(el('li', null, nd));
        if (l.prior.total) ul.appendChild(el('li', null, 'Logged before: ' + C.dur(l.prior.total) + ', ' + C.dur(l.prior.night) + ' at night'));
        b.appendChild(ul);
    }

    // ---------- drive form ----------
    const pressed = box => [...$(box).querySelectorAll('.chip[aria-pressed="true"]')].map(b => b.dataset.id);
    function buildTags() {
        const mk = (box, items) => { const w = $(box); w.textContent = ''; items.forEach(it => { const b = el('button', 'chip', it.label); b.type = 'button'; b.dataset.id = it.id; b.setAttribute('aria-pressed', 'false'); b.addEventListener('click', () => { b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') === 'true' ? 'false' : 'true'); }); w.appendChild(b); }); };
        mk('t-roads', C.ROADS); mk('t-skills', C.SKILLS);
    }
    function setPressed(box, ids) { $(box).querySelectorAll('.chip').forEach(b => b.setAttribute('aria-pressed', ids.includes(b.dataset.id) ? 'true' : 'false')); }
    function clearErrs(form) { form.querySelectorAll('.err').forEach(e => { e.textContent = ''; }); form.querySelectorAll('[aria-invalid]').forEach(e => e.removeAttribute('aria-invalid')); }
    function fillLists(l) {
        const uniq = key => [...new Set(C.sortDrives(l.drives).map(d => d[key]).filter(Boolean))].slice(0, 20);
        [['sups', 'sup'], ['cars', 'car']].forEach(([id, k]) => { const dl = $(id); dl.textContent = ''; uniq(k).forEach(v => { const o = el('option'); o.value = v; dl.appendChild(o); }); });
    }
    function openDrive(d, prefill) {
        const l = cur(); if (!l) return;
        edDrive = d || null;
        const f = $('f-drive'); clearErrs(f);
        fillLists(l);
        $('dd-h').textContent = d ? 'Edit drive' : 'Add a drive';
        $('dd-who').textContent = state.learners.length > 1 ? 'Learner: ' + l.name : '';
        $('t-save').textContent = d ? 'Save changes' : 'Add drive';
        $('t-edit').hidden = !d;
        const last = C.sortDrives(l.drives)[0];
        const src = d || prefill || {};
        $('t-date').value = src.date || C.todayIso();
        $('t-date').max = C.todayIso();
        $('t-start').value = src.start != null ? C.hm(src.start) : '';
        $('t-end').value = src.end != null ? C.hm(src.end) : '';
        $('t-sup').value = d ? d.sup : (last ? last.sup : '');
        $('t-car').value = d ? d.car : (last ? last.car : '');
        $('t-lesson').checked = !!(d && d.lesson);
        $('t-notes').value = d ? d.notes : '';
        $('t-night').value = d && d.nightManual ? String(d.night) : '';
        setPressed('t-roads', d ? d.roads : []); setPressed('t-skills', d ? d.skills : []);
        $('tw-car').hidden = !$('t-car').value; $('to-car').hidden = !$('tw-car').hidden;
        $('tw-night').hidden = !(d && d.nightManual); $('to-night').hidden = !$('tw-night').hidden;
        $('tw-notes').hidden = !(d && d.notes); $('to-notes').hidden = !$('tw-notes').hidden;
        const tg = C.targetsOf(l);
        $('t-lesson-hint').textContent = tg.lesson ? '(1 hour counts as ' + tg.lesson.mult + ', up to ' + tg.lesson.cap + ' logbook hours' + (tg.lesson.night === false ? '; not towards night hours' : '') + ')' : '';
        preview();
        $('d-drive').showModal();
        if (!d && !prefill) $('t-start').focus();
    }
    function formDrive() {
        return { date: $('t-date').value, start: $('t-start').value, end: $('t-end').value, sup: $('t-sup').value,
            nightManual: $('tw-night').hidden ? '' : $('t-night').value };
    }
    function preview() {
        const l = cur(); if (!l) return;
        const r = C.checkDrive(formDrive(), l, { editId: edDrive && edDrive.id });
        const p = $('t-preview');
        if (r.min && r.nightMin != null) {
            let s = C.dur(r.min) + ' drive';
            s += r.nightMin ? ', ' + C.dur(r.nightMin) + ' of it at night' : ', all in daylight';
            if (l.night.mode === 'sun' && !$('tw-night').hidden && $('t-night').value.trim()) s += ' (typed)';
            else if (l.night.mode === 'sun') {
                const st = C.sunTimes($('t-date').value, l.night.lat, l.night.lon);
                if (!st.polar) s += ' (sunset ' + C.clockOf(st.set) + ', sunrise ' + C.clockOf(st.rise) + ')';
            } else s += ' (night ' + C.hm(l.night.from) + ' to ' + C.hm(l.night.to) + ')';
            p.textContent = s;
        } else p.textContent = '';
        $('t-warn').textContent = r.warns.join(' ');
        return r;
    }
    function showErrs(prefix, errs, map) {
        let first = null;
        Object.keys(map).forEach(k => { const e = $(prefix + 'e-' + map[k]); if (e) e.textContent = errs[k] || ''; const inp = $(prefix + '-' + map[k]); if (inp) { if (errs[k]) { inp.setAttribute('aria-invalid', 'true'); first = first || inp; } else inp.removeAttribute('aria-invalid'); } });
        return first;
    }
    function saveDrive(ev) {
        ev.preventDefault();
        const l = cur(); if (!l) return;
        const r = C.checkDrive(formDrive(), l, { editId: edDrive && edDrive.id });
        const first = showErrs('t', r.errs, { date: 'date', start: 'start', end: 'end', night: 'night', sup: 'sup' });
        if (!r.ok) { if (first) first.focus(); return; }
        const snap = snapshot();
        const typed = !$('tw-night').hidden && $('t-night').value.trim() !== '';
        const d = C.validDrive({ id: edDrive ? edDrive.id : C.uid(), date: $('t-date').value, start: r.start, end: r.end, night: r.nightMin, nightManual: typed,
            sup: $('t-sup').value.trim(), car: $('t-car').value.trim(), notes: $('t-notes').value.trim(), lesson: $('t-lesson').checked,
            roads: pressed('t-roads'), skills: pressed('t-skills') });
        if (edDrive) l.drives = l.drives.map(x => x.id === d.id ? d : x); else l.drives.push(d);
        const wasNew = !edDrive;
        if (wasNew && l.live) l.live = null;
        save(); $('d-drive').close(); render();
        const t = C.totals(l);
        show('msg', (wasNew ? 'Added ' : 'Saved ') + C.dur(d.min) + (d.night ? ' (' + C.dur(d.night) + ' at night)' : '') + '. ' + (t.done ? 'All hours done!' : C.dur(t.toGo) + ' to go.'), snap);
        flash(d.id);
    }
    function flash(id) {
        const li = document.querySelector('.drive[data-id="' + CSS.escape(id) + '"]');
        if (li) { li.classList.add('flash'); setTimeout(() => li.classList.remove('flash'), 1600); }
    }
    function deleteDrive(id) {
        const l = cur(); const d = l.drives.find(x => x.id === id); if (!d) return;
        const snap = snapshot();
        l.drives = l.drives.filter(x => x.id !== id);
        save(); render();
        show('msg', 'Deleted the drive on ' + C.niceDate(d.date, false) + ' (' + C.dur(d.min) + ').', snap);
        $('add-drive').focus();
    }

    // ---------- learner form ----------
    function buildSelects() {
        const rs = $('l-rule'); rs.textContent = '';
        const groups = {};
        C.RULES.forEach(r => { if (!groups[r.group]) { groups[r.group] = el('optgroup'); groups[r.group].label = r.group; rs.appendChild(groups[r.group]); }
            const o = el('option', null, r.label); o.value = r.id; groups[r.group].appendChild(o); });
        const cs = $('l-city'); cs.textContent = '';
        const o0 = el('option', null, 'Choose a town'); o0.value = ''; cs.appendChild(o0);
        C.CITIES.slice().sort((a, b) => a.name.localeCompare(b.name)).forEach(c => { const o = el('option', null, c.name); o.value = c.id; cs.appendChild(o); });
        const og = el('option', null, "My phone's location"); og.value = 'geo'; og.hidden = true; og.disabled = true; cs.appendChild(og);
    }
    function hoursText(min) { return min % 60 ? Math.floor(min / 60) + ':' + String(min % 60).padStart(2, '0') : String(min / 60); }
    function openLearner(l) {
        edLearner = l || null;
        const f = $('f-learner'); clearErrs(f);
        $('dl-h').textContent = l ? 'Change ' + l.name + "'s log" : 'Who is learning, and where?';
        $('l-edit').hidden = !l;
        const base = l || C.newLearner('', 'au-nsw');
        $('l-name').value = l ? l.name : '';
        $('l-rule').value = base.rule;
        $('l-total').value = String(base.custom.total); $('l-nightreq').value = String(base.custom.night);
        $('l-weather').value = base.custom.weather ? String(base.custom.weather) : '';
        $('lw-weather').hidden = !base.custom.weather; $('lo-weather').hidden = !!base.custom.weather;
        $('l-mult').value = String(base.custom.lessonMult); $('l-cap').value = base.custom.lessonCap ? String(base.custom.lessonCap) : '';
        geoPos = null;
        const n = base.night;
        f.querySelector('input[name="l-nmode"][value="' + n.mode + '"]').checked = true;
        if (n.mode === 'sun') {
            if (n.city && C.cityById(n.city)) $('l-city').value = n.city;
            else { geoPos = { lat: n.lat, lon: n.lon, place: n.place }; setGeoOption(); }
            $('l-from').value = '18:00'; $('l-to').value = '06:00';
        } else { $('l-city').value = ''; $('l-from').value = C.hm(n.from); $('l-to').value = C.hm(n.to); }
        $('l-ptotal').value = base.prior.total ? hoursText(base.prior.total) : '';
        $('l-pnight').value = base.prior.night ? hoursText(base.prior.night) : '';
        $('lw-prior').hidden = !base.prior.total; $('lo-prior').hidden = !!base.prior.total;
        $('l-warn').textContent = '';
        learnerFormSync(false);
        $('d-learner').showModal();
        if (!l) $('l-name').focus();
    }
    function setGeoOption() {
        const o = $('l-city').querySelector('option[value="geo"]');
        o.hidden = false; o.disabled = false; o.textContent = "My phone's location (" + geoPos.lat.toFixed(2) + ', ' + geoPos.lon.toFixed(2) + ')';
        $('l-city').value = 'geo';
    }
    function learnerFormSync(ruleChanged) {
        const r = C.ruleById($('l-rule').value) || C.ruleById('custom');
        $('lw-custom').hidden = r.id !== 'custom';
        let h = '';
        if (r.id !== 'custom') {
            h = 'Needs ' + r.total + ' hours of supervised driving, ' + r.night + ' of them at night' + (r.weather ? ' and ' + r.weather + ' in bad weather' : '') + '.';
            if (r.lesson) h += ' Each hour of lessons with an instructor counts as ' + r.lesson.mult + ', up to ' + r.lesson.cap + ' logbook hours.';
            h += ' Check with your licensing office: rules change.';
        } else h = 'Type the hours your rule asks for, or your own goal if there is no minimum (UK, Ireland, New Zealand, Pakistan, India and many more).';
        $('l-rule-hint').textContent = h;
        if (ruleChanged && r.city && !geoPos) $('l-city').value = r.city;
        const mode = $('f-learner').querySelector('input[name="l-nmode"]:checked').value;
        $('lw-sun').hidden = mode !== 'sun'; $('lw-fixed').hidden = mode !== 'fixed';
        $('lw-cap').hidden = $('l-mult').value === '1';
        if ($('l-mult').value !== '1' && !$('l-cap').value) $('l-cap').value = String(+$('l-mult').value * 10);
        sunHint();
    }
    function sunHint() {
        const pos = $('l-city').value === 'geo' ? geoPos : C.cityById($('l-city').value);
        if (!pos) { $('l-sun-hint').textContent = ''; return; }
        const s = C.sunTimes(C.todayIso(), pos.lat, pos.lon);
        $('l-sun-hint').textContent = s.polar ? (s.polar === 'day' ? 'The sun does not set there today.' : 'The sun does not rise there today.') : 'Today there: sunset ' + C.clockOf(s.set) + ', sunrise ' + C.clockOf(s.rise) + ' (your phone\'s clock).';
    }
    const parseHours = C.parseHours;
    function saveLearner(ev) {
        ev.preventDefault();
        const errs = {};
        const name = $('l-name').value.trim();
        if (!name) errs.name = 'Type the learner\'s name.';
        else if (state.learners.some(x => x.name.toLowerCase() === name.toLowerCase() && (!edLearner || x.id !== edLearner.id))) errs.name = 'There is already a learner called ' + name + '.';
        const rule = $('l-rule').value;
        const custom = edLearner ? Object.assign({}, edLearner.custom) : { total: 50, night: 10, weather: 0, lessonMult: 1, lessonCap: 0 };
        if (rule === 'custom') {
            const int = (id, k, lo, hi, msg) => { const v = $(id).value.trim(); if (!/^\d+$/.test(v) || +v < lo || +v > hi) { errs[k] = msg; return null; } return +v; };
            custom.total = int('l-total', 'total', 1, 500, 'Type the total hours, a whole number from 1 to 500.');
            custom.night = int('l-nightreq', 'nightreq', 0, 500, 'Type the night hours, 0 if none.');
            if (custom.total != null && custom.night != null && custom.night > custom.total) errs.nightreq = 'Night hours are part of the total, so they cannot be more than ' + custom.total + '.';
            custom.weather = 0;
            if (!$('lw-weather').hidden && $('l-weather').value.trim()) { custom.weather = int('l-weather', 'weather', 0, 500, 'Type the bad-weather hours, a whole number.'); if (custom.weather != null && custom.total != null && custom.weather > custom.total) errs.weather = 'Cannot be more than the total of ' + custom.total + '.'; }
            custom.lessonMult = +$('l-mult').value;
            custom.lessonCap = custom.lessonMult > 1 ? int('l-cap', 'cap', 1, 500, 'Type how many logbook hours lessons can add up to, like 30.') : 0;
        }
        const mode = $('f-learner').querySelector('input[name="l-nmode"]:checked').value;
        let night = null;
        if (mode === 'sun') {
            const v = $('l-city').value;
            if (v === 'geo' && geoPos) night = { mode: 'sun', place: geoPos.place, city: '', lat: geoPos.lat, lon: geoPos.lon };
            else { const c = C.cityById(v); if (c) night = { mode: 'sun', place: c.name, city: c.id, lat: c.lat, lon: c.lon }; else errs.city = 'Choose the town or the nearest big city, so sunset and sunrise are right.'; }
        } else {
            const a = C.parseTime($('l-from').value), b = C.parseTime($('l-to').value);
            if (a == null) errs.from = 'Type when night starts, like 21:00.';
            if (b == null) errs.to = 'Type when night ends, like 05:00.';
            if (a != null && b != null && a === b) errs.to = 'Night cannot start and end at the same time.';
            if (a != null && b != null && a !== b) night = { mode: 'fixed', from: a, to: b };
        }
        let prior = { total: 0, night: 0 };
        if (!$('lw-prior').hidden) {
            const pt = $('l-ptotal').value.trim(), pn = $('l-pnight').value.trim();
            const a = pt ? parseHours(pt) : 0, b = pn ? parseHours(pn) : 0;
            if (a == null) errs.ptotal = 'Type hours like 32, 32.5 or 32:30.';
            if (b == null) errs.pnight = 'Type hours like 4, 4.5 or 4:30.';
            if (a != null && b != null && b > a) errs.pnight = 'Night hours are part of the hours logged before, so they cannot be more.';
            if (a != null && b != null) prior = { total: a, night: b };
        }
        const map = { name: 'name', total: 'total', nightreq: 'nightreq', weather: 'weather', cap: 'cap', city: 'city', from: 'from', to: 'to', ptotal: 'ptotal', pnight: 'pnight' };
        const first = showErrs('l', errs, map);
        if (Object.keys(errs).length) { if (first) first.focus(); return; }
        const snap = snapshot();
        let l = edLearner;
        if (!l) { l = C.newLearner(name, rule); state.learners.push(l); state.cur = l.id; }
        const nightChanged = l.night && JSON.stringify(l.night) !== JSON.stringify(night) && l.drives.length;
        l.name = name; l.rule = rule; l.custom = custom; l.night = night; l.prior = prior;
        save(); $('d-learner').close(); render();
        show('msg', (edLearner ? 'Saved.' : 'Ready: log ' + name + "'s first drive.") + (nightChanged ? ' Drives already logged keep their night minutes; edit a drive to work it out again.' : ''), edLearner ? snap : null);
    }
    function useGeo() {
        if (!navigator.geolocation) { $('le-city').textContent = 'This browser cannot share your location. Choose the nearest big city.'; return; }
        $('l-sun-hint').textContent = 'Finding your location…';
        navigator.geolocation.getCurrentPosition(p => {
            geoPos = { lat: Math.round(p.coords.latitude * 100) / 100, lon: Math.round(p.coords.longitude * 100) / 100 };
            geoPos.place = 'your location (' + geoPos.lat.toFixed(2) + ', ' + geoPos.lon.toFixed(2) + ')';
            $('le-city').textContent = ''; $('l-city').removeAttribute('aria-invalid');
            setGeoOption(); sunHint();
        }, () => { $('l-sun-hint').textContent = ''; $('le-city').textContent = 'Location is off or was not allowed. Choose the nearest big city instead.'; }, { timeout: 15000, maximumAge: 6e5 });
    }

    // ---------- backup ----------
    function download(name, text, type) {
        const a = el('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name;
        document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    }
    const safeName = s => s.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'learner';

    // ---------- wire up ----------
    function init() {
        state = load();
        buildTags(); buildSelects();
        save();
        render();
        document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
        $('start-btn').addEventListener('click', () => openLearner(null));
        $('add-learner').addEventListener('click', () => openLearner(null));
        $('add-learner2').addEventListener('click', () => openLearner(null));
        $('edit-learner').addEventListener('click', () => openLearner(cur()));
        $('who-sel').addEventListener('change', e => { state.cur = e.target.value; save(); render(); });
        $('add-drive').addEventListener('click', () => openDrive(null));
        $('live-start').addEventListener('click', () => { const l = cur(); const snap = snapshot(); l.live = { a: Date.now() }; save(); render(); show('msg', 'Timing the drive. Tap "Finish drive" when you park. You can close this page meanwhile.', snap); });
        $('live-cancel').addEventListener('click', () => { const l = cur(); const snap = snapshot(); l.live = null; save(); render(); show('msg', 'Stopped timing. Nothing was logged.', snap); });
        $('live-stop').addEventListener('click', () => {
            const l = cur(); if (!l || !l.live) return;
            const a = new Date(l.live.a), b = new Date();
            openDrive(null, { date: C.isoOf(a), start: a.getHours() * 60 + a.getMinutes(), end: b.getHours() * 60 + b.getMinutes() });
        });
        $('t-quick-date').addEventListener('click', e => { const b = e.target.closest('[data-ago]'); if (!b) return; $('t-date').value = C.addDays(C.todayIso(), -b.dataset.ago); preview(); });
        ['t-date', 't-start', 't-end', 't-night'].forEach(id => { $(id).addEventListener('input', preview); $(id).addEventListener('change', preview); });
        $('f-drive').addEventListener('submit', saveDrive);
        $('t-del').addEventListener('click', () => { const id = edDrive.id; $('d-drive').close(); deleteDrive(id); });
        [['to-car', 'tw-car', 't-car'], ['to-night', 'tw-night', 't-night'], ['to-notes', 'tw-notes', 't-notes'], ['lo-weather', 'lw-weather', 'l-weather'], ['lo-prior', 'lw-prior', 'l-ptotal']]
            .forEach(([b, w, f]) => $(b).addEventListener('click', () => { $(w).hidden = false; $(b).hidden = true; $(f).focus(); preview(); }));
        $('l-rule').addEventListener('change', () => learnerFormSync(true));
        $('l-mult').addEventListener('change', () => learnerFormSync(false));
        $('l-city').addEventListener('change', () => { if ($('l-city').value !== 'geo') geoPos = null; sunHint(); });
        $('f-learner').querySelectorAll('input[name="l-nmode"]').forEach(r => r.addEventListener('change', () => learnerFormSync(false)));
        $('l-geo').addEventListener('click', useGeo);
        $('f-learner').addEventListener('submit', saveLearner);
        $('l-del').addEventListener('click', () => {
            const l = edLearner; if (!l) return;
            if (!confirm('Delete ' + l.name + ' and all ' + l.drives.length + ' drives? You can undo straight after.')) return;
            const snap = snapshot();
            state.learners = state.learners.filter(x => x.id !== l.id);
            state.cur = state.learners[0] ? state.learners[0].id : null;
            save(); $('d-learner').close(); render();
            show(state.cur ? 'msg' : 'set-msg', 'Deleted ' + l.name + '.', snap);
        });
        $('copy').addEventListener('click', async () => {
            const text = C.summaryText(cur(), C.todayIso());
            try { await navigator.clipboard.writeText(text); show('msg', 'Copied. Paste it into a message or a note.'); }
            catch (e) { const ta = el('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (x) { /* no */ } ta.remove(); show('msg', ok ? 'Copied.' : 'Could not copy here. Use Email summary instead.'); }
        });
        $('csv').addEventListener('click', () => { const l = cur(); download('learner-log-' + safeName(l.name) + '-' + C.todayIso() + '.csv', '﻿' + C.csv(l), 'text/csv'); show('msg', 'Saved the logbook as a CSV file.'); });
        $('print').addEventListener('click', () => window.print());
        $('backup').addEventListener('click', () => { download('learner-driver-log-backup-' + C.todayIso() + '.json', JSON.stringify(state, null, 1), 'application/json'); show('set-msg', 'Saved a backup file. Keep it somewhere safe.'); });
        $('restore').addEventListener('click', () => $('restore-file').click());
        $('restore-file').addEventListener('change', e => {
            const file = e.target.files[0]; e.target.value = '';
            if (!file) return;
            if (file.size > 5e6) { show('set-msg', 'That file is too big to be a backup from this app.'); return; }
            const rd = new FileReader();
            rd.onload = () => {
                let s = null; try { s = C.validate(JSON.parse(rd.result)); } catch (x) { s = null; }
                if (!s || !s.learners.length) { show('set-msg', 'That file is not a backup from this app, so nothing was changed.'); return; }
                const snap = snapshot(); state = s; save(); render();
                show('set-msg', 'Restored ' + s.learners.length + (s.learners.length === 1 ? ' learner' : ' learners') + ' and ' + s.learners.reduce((a, l) => a + l.drives.length, 0) + ' drives.', snap);
            };
            rd.onerror = () => show('set-msg', 'Could not read that file.');
            rd.readAsText(file);
        });
        $('wipe').addEventListener('click', () => {
            if (!state.learners.length) { show('set-msg', 'There is nothing to delete.'); return; }
            if (!confirm('Delete every learner and every drive on this device? You can undo straight after.')) return;
            const snap = snapshot(); state = C.emptyState(); save(); render(); show('set-msg', 'Deleted everything.', snap);
        });
        document.addEventListener('visibilitychange', () => { if (!document.hidden && cur()) render(); });
    }
    init();
})();
