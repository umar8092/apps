// Screen Time Allowance Timer for Kids: the page. The maths is in core.js.
(function () {
    'use strict';
    const M = window.STA;
    const KEY = 'screen-time-allowance-timer-for-kids.state';
    const $ = id => document.getElementById(id);
    const PRESETS = [['30', '30 min'], ['60', '1 h'], ['90', '1 h 30 min'], ['120', '2 h'], ['180', '3 h'], ['0', 'No screen time'], ['custom', 'Custom…']];
    const DAYS = [1, 2, 3, 4, 5, 6, 0]; // Monday first
    let st = M.emptyState(), storageOK = true, msg = null, open = null, focusKey = null, addOpen = false, lastDay = '';
    let refs = {}, alerted = {}, audio = null;
    const baseTitle = document.title;
    const locale = (() => { try { return Intl.getCanonicalLocales(navigator.language)[0]; } catch (e) { return undefined; } })();
    const now = () => Date.now();
    const today = () => M.dayKey(now());
    const dur = M.fmtDur;

    // ---- saving ----
    function load() {
        try {
            const raw = localStorage.getItem(KEY);
            if (raw) {
                let parsed = null;
                try { parsed = M.normalize(JSON.parse(raw)); } catch (e) { parsed = null; }
                if (parsed) st = parsed;
                else {
                    try { localStorage.setItem(KEY + '.broken', raw); } catch (e) { /* ignore */ }
                    msg = { where: 'top', text: 'Your saved data could not be read, so the app started fresh. A copy of the old data was kept on this device.', bad: true };
                }
            }
            localStorage.setItem(KEY + '.test', '1'); localStorage.removeItem(KEY + '.test');
        } catch (e) { storageOK = false; }
    }
    function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { storageOK = false; } }
    const snap = () => JSON.stringify(st);
    // every change: remember the state before it for Undo, save, draw, and say what happened
    function change(where, fn) {
        const before = snap();
        const text = fn();
        if (text === false) return false;
        save();
        msg = { where, text, snap: before };
        render();
        return true;
    }
    function undo() {
        if (!msg || !msg.snap) return;
        st = M.normalize(JSON.parse(msg.snap)) || M.emptyState();
        const where = msg.where;
        msg = { where: st.kids.some(k => k.id === where) ? where : 'top', text: 'Undone.' };
        open = null;
        save(); seedAlerts(); render();
    }

    // ---- small DOM helpers (user text always goes in with textContent) ----
    function el(tag, cls, text, attrs) {
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = text;
        if (attrs) Object.keys(attrs).forEach(k => (attrs[k] != null && e.setAttribute(k, attrs[k])));
        return e;
    }
    function btn(cls, text, fn, attrs) { const b = el('button', cls, text, attrs); b.type = 'button'; b.addEventListener('click', fn); return b; }
    function drawMsg(box, where) {
        box.textContent = ''; box.classList.remove('show', 'bad');
        if (!msg || msg.where !== where) return;
        box.classList.add('show');
        if (msg.bad) box.classList.add('bad');
        box.appendChild(el('span', '', msg.text));
        if (msg.snap) box.appendChild(btn('undo', 'Undo', undo, { 'data-f': 'undo' }));
    }
    function say(where, text, bad) { msg = { where, text, bad }; render(); }
    const kidById = id => st.kids.find(k => k.id === id);
    const dayWord = t => t === 'weekend' ? 'weekend or holiday' : 'school day';

    // a "how much screen time" picker: presets, or Custom with a typed time. vals holds what was picked so a redraw keeps it.
    function allowField(parent, idp, name, label, vals, errs) {
        const id = idp + '-' + name, cid = id + '-c', eid = 'e-' + id;
        parent.appendChild(el('label', '', label, { for: id }));
        const sel = el('select', '', null, { id, 'data-f': id });
        PRESETS.forEach(([v, t]) => sel.appendChild(el('option', '', t, { value: v })));
        if (vals[name] == null) vals[name] = '60';
        sel.value = vals[name];
        parent.appendChild(sel);
        const wrap = el('div', 'custom');
        const cl = el('label', 'sr', 'Custom time for ' + label.toLowerCase(), { for: cid });
        const ci = el('input', '', null, { id: cid, type: 'text', autocomplete: 'off', maxlength: '20', placeholder: 'e.g. 45 or 1:15', 'aria-describedby': eid + ' h-' + cid, 'data-f': cid });
        ci.value = vals[name + 'C'] || '';
        wrap.append(cl, ci, el('p', 'hint', 'Minutes (45) or hours and minutes (1:15).', { id: 'h-' + cid }));
        wrap.hidden = sel.value !== 'custom';
        parent.appendChild(wrap);
        const err = el('p', 'err', (errs && errs[name]) || '', { id: eid, role: 'alert' });
        if (errs && errs[name]) (sel.value === 'custom' ? ci : sel).setAttribute('aria-invalid', 'true');
        parent.appendChild(err);
        sel.addEventListener('change', () => { vals[name] = sel.value; wrap.hidden = sel.value !== 'custom'; err.textContent = ''; ci.removeAttribute('aria-invalid'); if (sel.value === 'custom') ci.focus(); parent.dispatchEvent(new Event('allow')); });
        ci.addEventListener('input', () => { vals[name + 'C'] = ci.value; parent.dispatchEvent(new Event('allow')); });
    }
    function readAllow(vals, name) { return vals[name] === 'custom' ? M.parseDuration(vals[name + 'C']) : { min: +vals[name] }; }
    function allowVals(min) { const p = PRESETS.find(([v]) => v === String(min)); return p ? [String(min), ''] : ['custom', min >= 60 ? Math.floor(min / 60) + ':' + String(min % 60).padStart(2, '0') : String(min)]; }
    const allowWords = min => min === 0 ? 'no screen time' : dur(min);

    // ---- the top: today ----
    function drawToday() {
        const t = today(), type = M.dayType(st, t), plain = M.plainDayType(st, t);
        $('today').hidden = !st.kids.length;
        $('today-h').textContent = M.longDay(t, locale);
        $('today-type').textContent = type === 'weekend' ? (plain === 'weekend' ? 'Weekend: everyone gets their weekend time.' : 'Holiday: everyone gets their weekend time.') : (plain === 'school' ? 'School day: everyone gets their school-day time.' : 'School day today (changed from a weekend day).');
        $('today-toggle').textContent = type === 'school' ? (plain === 'school' ? 'Make today a holiday' : 'Make today a weekend day again') : (plain === 'weekend' ? 'Make today a school day' : 'Make today a school day again');
    }
    function toggleToday() {
        const t = today(), type = M.dayType(st, t), plain = M.plainDayType(st, t);
        change('top', () => {
            if (st.days[t]) delete st.days[t]; else st.days[t] = type === 'school' ? 'weekend' : 'school';
            const nowType = M.dayType(st, t);
            return nowType === 'weekend' ? (plain === 'school' ? 'Today is a holiday: everyone gets their weekend time.' : 'Today is a weekend day again.') : (plain === 'weekend' ? 'Today is a school day: everyone gets their school-day time.' : 'Today is a school day again.');
        });
    }

    // ---- one child's box ----
    function kidCard(kid) {
        const t = today(), card = el('section', 'card kid', null, { 'aria-labelledby': 'h-' + kid.id, 'data-kid': kid.id });
        const head = el('div', 'kid-head');
        head.appendChild(el('h2', '', kid.name, { id: 'h-' + kid.id }));
        const badge = el('span', 'badge');
        head.appendChild(badge);
        card.appendChild(head);
        const big = el('p', 'big', null, { 'aria-live': 'off' }), num = el('span', 'big-num'), lab = el('span', 'big-label');
        big.append(num, lab); card.appendChild(big);
        const bar = el('div', 'bar', null, { role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-label': kid.name + "'s screen time used today" });
        const fill = el('span'); bar.appendChild(fill); card.appendChild(bar);
        const used = el('p', 'used'); card.appendChild(used);
        const alert = el('p', 'alert', null, { role: 'alert' }); card.appendChild(alert);
        const go = btn('primary go', 'Start', () => startStop(kid), { 'data-f': 'go-' + kid.id });
        card.appendChild(go);
        const since = el('p', 'since'); card.appendChild(since);

        const m = el('div', 'msg', null, { role: 'status', 'aria-live': 'polite' }); drawMsg(m, kid.id); card.appendChild(m);

        const isOpen = w => !!(open && open.kid === kid.id && open.what === w);
        const kb = el('div', 'kid-btns');
        kb.appendChild(btn('mini', '+ Bonus time', () => togglePanel(kid, 'bonus', { min: '' }), { 'data-f': 'bonus-' + kid.id, 'aria-expanded': String(isOpen('bonus')) }));
        kb.appendChild(btn('mini', 'Add time by hand', () => togglePanel(kid, 'manual', { min: '', date: t }), { 'data-f': 'manual-' + kid.id, 'aria-expanded': String(isOpen('manual')) }));
        kb.appendChild(btn('mini', "Today's sessions", () => togglePanel(kid, 'list', { date: t }), { 'data-f': 'list-' + kid.id, 'aria-expanded': String(isOpen('list')) }));
        kb.appendChild(btn('mini', 'Change times', () => { const a = allowVals(kid.school), b = allowVals(kid.weekend); togglePanel(kid, 'edit', { name: kid.name, school: a[0], schoolC: a[1], weekend: b[0], weekendC: b[1] }); }, { 'data-f': 'edit-' + kid.id, 'aria-expanded': String(isOpen('edit')) }));
        card.appendChild(kb);
        if (open && open.kid === kid.id) card.appendChild(panel(kid));

        const wk = el('div', 'week'); card.appendChild(wk);
        refs[kid.id] = { card, badge, num, lab, bar, fill, used, alert, go, since, wk, weekSig: '' };
        update(kid);
        return card;
    }
    // the parts of a box that change every second
    function update(kid) {
        const r = refs[kid.id]; if (!r) return;
        const t = today(), n = now(), s = M.status(st, kid, t, n);
        r.card.classList.remove('ok', 'warn', 'up', 'none', 'running');
        r.card.classList.add(s.state); if (s.running) r.card.classList.add('running');
        r.badge.textContent = (s.dayType === 'weekend' ? 'Weekend: ' : 'School day: ') + allowWords(s.allowMin - s.bonusMin);
        let num, lab;
        if (s.state === 'none') { num = 'No screen time'; lab = 'today'; }
        else if (s.overMin > 0) { num = 'Time is up'; lab = 'over by ' + dur(s.overMin); }
        else if (s.state === 'up') { num = 'Time is up'; lab = ''; }
        else if (s.running) { num = M.fmtClock(s.leftSec); lab = 'left today'; }
        else { num = dur(s.leftMin); lab = 'left today'; }
        if (r.num.textContent !== num) r.num.textContent = num;
        r.lab.textContent = lab;
        const pct = s.allowMin ? Math.min(100, Math.round(s.usedSec / (s.allowMin * 60) * 100)) : (s.usedSec ? 100 : 0);
        r.fill.style.width = pct + '%'; r.bar.setAttribute('aria-valuenow', String(pct));
        r.used.textContent = dur(s.usedMin) + ' of ' + dur(s.allowMin) + ' used today' + (s.bonusMin ? ' (includes ' + dur(s.bonusMin) + ' bonus)' : '') + '.';
        let al = '';
        if (s.running && s.state === 'warn') al = 'Nearly time: ' + dur(Math.ceil(s.leftSec / 60)) + ' left for ' + kid.name + '.';
        else if (s.running && s.state === 'up') al = 'Time is up for ' + kid.name + '. Tap Stop when the screen is handed back.';
        else if (s.running && s.state === 'none') al = kid.name + ' has no screen time today. Tap Stop, or give bonus time.';
        if (r.alert.textContent !== al) r.alert.textContent = al;
        r.alert.hidden = !al;
        r.go.textContent = s.running ? 'Stop' : 'Start';
        r.go.classList.toggle('stop', s.running);
        r.go.setAttribute('aria-label', (s.running ? 'Stop ' : 'Start ') + kid.name + "'s screen time");
        let since = '';
        if (s.running) {
            since = 'Started at ' + M.timeOf(s.since) + (M.dayKey(s.since) !== t ? ' yesterday' : '') + ' (' + dur(Math.floor(s.runSec / 60)) + ' ago).';
            if (s.runSec > 3 * 3600) since += ' Forgot to stop? Tap Stop, then fix the end time in "Today\'s sessions".';
        }
        r.since.textContent = since; r.since.hidden = !since;
        drawWeek(kid, r, t, n);
        alarm(kid, s, t);
    }
    function drawWeek(kid, r, t, n) {
        const w = M.week(st, kid, t, n), sig = JSON.stringify(w);
        if (sig === r.weekSig) return;
        r.weekSig = sig;
        r.wk.textContent = '';
        r.wk.appendChild(el('h3', 'week-h', 'Past 7 days'));
        const ol = el('ol', 'days7');
        const top = Math.max(1, ...w.map(d => Math.max(d.used, d.allow)));
        w.forEach(d => {
            const over = d.used > d.allow, li = el('li', over ? 'over' : '', null, { 'aria-label': M.niceDay(d.key, t, locale) + ': ' + dur(d.used) + ' of ' + dur(d.allow) + (over ? ', over' : '') });
            const col = el('span', 'col', null, { 'aria-hidden': 'true' }), lim = el('span', 'lim'), u = el('span', 'u');
            lim.style.height = Math.round(d.allow / top * 100) + '%'; u.style.height = Math.round(Math.min(d.used, top) / top * 100) + '%';
            col.append(lim, u);
            li.append(el('span', 'dmin', d.used >= 60 ? Math.floor(d.used / 60) + ':' + String(d.used % 60).padStart(2, '0') : d.used + 'm', { 'aria-hidden': 'true' }), col, el('span', 'dname', M.shortWeekday(d.key, locale), { 'aria-hidden': 'true' }));
            if (d.key === t) li.classList.add('is-today');
            ol.appendChild(li);
        });
        r.wk.appendChild(ol);
        const tot = w.reduce((a, d) => a + d.used, 0), all = w.reduce((a, d) => a + d.allow, 0), overDays = w.filter(d => d.used > d.allow).length;
        r.wk.appendChild(el('p', 'week-t', dur(tot) + ' of ' + dur(all) + ' allowed' + (overDays ? ', over on ' + overDays + (overDays === 1 ? ' day' : ' days') : '') + '.'));
    }

    // ---- warning and time-up beeps ----
    function seedAlerts() { alerted = {}; const t = today(); st.kids.forEach(k => { const s = M.status(st, k, t, now()); alerted[k.id + '|' + t + '|warn'] = s.state === 'warn' || s.state === 'up' || s.state === 'none'; alerted[k.id + '|' + t + '|up'] = s.state === 'up' || s.state === 'none'; }); }
    function alarm(kid, s, t) {
        if (!s.running || (s.state !== 'warn' && s.state !== 'up')) return;
        const key = kid.id + '|' + t + '|' + s.state;
        if (alerted[key]) return;
        alerted[key] = true; if (s.state === 'up') alerted[kid.id + '|' + t + '|warn'] = true;
        if (st.settings.sound) {
            beep(s.state === 'up' ? 3 : 1);
            try { if (navigator.vibrate) navigator.vibrate(s.state === 'up' ? [400, 200, 400, 200, 400] : [300]); } catch (e) { /* ignore */ }
        }
    }
    function unlockAudio() {
        try { const C = window.AudioContext || window.webkitAudioContext; if (!audio && C) audio = new C(); if (audio && audio.state === 'suspended') audio.resume(); } catch (e) { audio = null; }
    }
    function beep(times) {
        if (!audio) return;
        try {
            const t0 = audio.currentTime + 0.05;
            for (let i = 0; i < times; i++) {
                const o = audio.createOscillator(), g = audio.createGain();
                o.type = 'sine'; o.frequency.value = 880; o.connect(g); g.connect(audio.destination);
                const a = t0 + i * 0.5; g.gain.setValueAtTime(0.0001, a); g.gain.exponentialRampToValueAtTime(0.4, a + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, a + 0.35);
                o.start(a); o.stop(a + 0.4);
            }
        } catch (e) { /* no sound on this device */ }
    }
    function title() {
        const t = today(), up = st.kids.filter(k => { const s = M.status(st, k, t, now()); return s.running && (s.state === 'up' || s.state === 'none'); }).map(k => k.name);
        const want = up.length ? 'Time is up: ' + up.join(', ') + ' | ' + baseTitle : baseTitle;
        if (document.title !== want) document.title = want;
    }

    // ---- actions ----
    function startStop(kid) {
        unlockAudio();
        const run = M.runningOf(st, kid.id), n = now();
        focusKey = 'go-' + kid.id;
        if (run) change(kid.id, () => { M.stop(st, kid.id, n); const s = M.status(st, kid, today(), n), mins = Math.ceil((Math.min(n, run.start + 86400000) - run.start) / 60000); return 'Stopped. ' + kid.name + ' used ' + dur(mins) + ' this time. ' + M.statusLine(kid, s).replace(kid.name + ': ', 'Now: '); });
        else change(kid.id, () => { M.start(st, kid.id, n); const s = M.status(st, kid, today(), n); return 'Started at ' + M.timeOf(n) + '. ' + (s.state === 'none' ? kid.name + ' has no screen time today.' : s.state === 'up' ? kid.name + "'s time for today is already used up." : dur(s.leftMin) + ' left today.'); });
    }
    function togglePanel(kid, what, vals) {
        if (open && open.kid === kid.id && open.what === what) { open = null; focusKey = { bonus: 'bonus-', manual: 'manual-', list: 'list-', edit: 'edit-' }[what] + kid.id; render(); return; }
        open = { kid: kid.id, what, vals: vals || {}, errs: {}, edit: null };
        focusKey = 'first'; msg = null; render();
    }
    function closePanel(kid, key) { open = null; focusKey = key || 'go-' + kid.id; render(); }

    // ---- the open form under a child's box ----
    function textField(parent, kid, name, label, opts) {
        opts = opts || {};
        const id = 'f-' + kid.id + '-' + name, eid = 'e-' + id;
        parent.appendChild(el('label', opts.sr ? 'sr' : '', label, { for: id }));
        const input = el('input', '', null, { id, type: opts.type || 'text', autocomplete: 'off', maxlength: opts.max || null, inputmode: opts.mode || null, placeholder: opts.ph || null, 'aria-describedby': eid, 'data-f': 'f-' + name });
        input.value = open.vals[name] != null ? open.vals[name] : '';
        input.addEventListener('input', () => { open.vals[name] = input.value; });
        parent.appendChild(input);
        const err = el('p', 'err', open.errs[name] || '', { id: eid, role: 'alert' });
        if (open.errs[name]) input.setAttribute('aria-invalid', 'true');
        parent.appendChild(err);
        return input;
    }
    function chips(parent, list, onPick) {
        const q = el('div', 'quick');
        list.forEach(([v, t]) => q.appendChild(btn('chip', t, () => onPick(v))));
        parent.appendChild(q);
    }
    function rowBtns(parent, saveText, kid, extra) {
        const r = el('div', 'row-btns');
        const s = el('button', 'primary', saveText, { type: 'submit', 'data-f': 'save' }); r.appendChild(s);
        if (extra) r.appendChild(extra);
        r.appendChild(btn('secondary', 'Cancel', () => closePanel(kid)));
        parent.appendChild(r);
    }
    function noteField(p, kid) {
        if (open.vals.noteOpen) textField(p, kid, 'note', 'Reason (optional)', { max: 60, ph: 'e.g. Finished homework' });
        else p.appendChild(btn('link', '+ Add a reason (optional)', () => { open.vals.noteOpen = true; focusKey = 'f-note'; render(); }, { 'data-f': 'note-open' }));
    }
    function panel(kid) {
        const p = el('form', 'panel'), w = open.what, t = today();
        p.noValidate = true;
        const titles = { bonus: 'Bonus time for ' + kid.name + ' today', manual: 'Add time by hand for ' + kid.name, list: kid.name + "'s sessions", edit: 'Change ' + kid.name + "'s times" };
        p.appendChild(el('h3', 'panel-h', titles[w], { tabindex: '-1', 'data-f': 'first' }));
        if (w === 'bonus' || w === 'manual') {
            if (w === 'bonus') p.appendChild(el('p', 'hint', 'Extra minutes for today only, such as for chores or homework.'));
            else p.appendChild(el('p', 'hint', 'For screen time you did not time, such as at a friend\'s house.'));
            const inp = textField(p, kid, 'min', w === 'bonus' ? 'Extra time' : 'How long', { max: 20, ph: 'e.g. 15 or 1:00' });
            const errEl = inp.nextElementSibling;
            p.insertBefore(el('p', 'hint', 'Minutes (15) or hours and minutes (1:30).'), errEl.nextSibling);
            chips(p, [['10', '10 min'], ['15', '15 min'], ['30', '30 min'], ['60', '1 h']], v => { open.vals.min = v; inp.value = v; });
            if (w === 'manual') {
                p.appendChild(el('label', '', 'Which day', { for: 'f-' + kid.id + '-date' }));
                const sel = el('select', '', null, { id: 'f-' + kid.id + '-date', 'data-f': 'f-date' });
                for (let i = 0; i < 7; i++) { const k = M.addDays(t, -i); sel.appendChild(el('option', '', M.niceDay(k, t, locale), { value: k })); }
                sel.value = open.vals.date || t;
                sel.addEventListener('change', () => { open.vals.date = sel.value; });
                p.appendChild(sel);
            }
            noteField(p, kid);
            rowBtns(p, w === 'bonus' ? 'Give bonus' : 'Add time', kid);
            p.addEventListener('submit', e => { e.preventDefault(); saveExtra(kid, w); });
        } else if (w === 'list') listPanel(p, kid, t);
        else if (w === 'edit') {
            textField(p, kid, 'name', "Child's name", { max: 40 });
            const box = el('div', 'allow-fields'); p.appendChild(box);
            allowField(box, 'k' + kid.id, 'school', 'Screen time on school days', open.vals, open.errs);
            allowField(box, 'k' + kid.id, 'weekend', 'Screen time at weekends and holidays', open.vals, open.errs);
            p.appendChild(el('p', 'hint', 'Changes count from today. Past days keep what was used.'));
            rowBtns(p, 'Save', kid, btn('danger', 'Delete ' + kid.name, () => delKid(kid), { 'data-f': 'del-kid' }));
            p.addEventListener('submit', e => { e.preventDefault(); saveKid(kid); });
        }
        return p;
    }
    function listPanel(p, kid, t) {
        p.appendChild(el('label', '', 'Day', { for: 'f-' + kid.id + '-lday' }));
        const sel = el('select', '', null, { id: 'f-' + kid.id + '-lday', 'data-f': 'f-lday' });
        for (let i = 0; i < 7; i++) { const k = M.addDays(t, -i); sel.appendChild(el('option', '', M.niceDay(k, t, locale), { value: k })); }
        sel.value = open.vals.date || t;
        sel.addEventListener('change', () => { open.vals.date = sel.value; open.edit = null; focusKey = 'f-lday'; render(); });
        p.appendChild(sel);
        const day = open.vals.date || t, e = M.dayEntries(st, kid.id, day), n = now();
        const ul = el('ul', 'entries');
        e.sessions.forEach(s => {
            const li = el('li', 'entry');
            if (open.edit === s.id) { li.classList.add('editing'); li.appendChild(editSession(kid, s)); ul.appendChild(li); return; }
            const end = s.end === null ? n : s.end, mins = Math.ceil((end - s.start) / 60000);
            const info = el('div', 'e-info');
            const crossA = M.dayKey(s.start) !== day ? ' (' + M.niceDay(M.dayKey(s.start), t, locale) + ')' : '', crossB = s.end !== null && M.dayKey(s.end) !== M.dayKey(s.start) ? ' (' + M.niceDay(M.dayKey(s.end), t, locale) + ')' : '';
            info.appendChild(el('span', 'e-what', M.timeOf(s.start) + crossA + ' to ' + (s.end === null ? 'now' : M.timeOf(s.end) + crossB)));
            info.appendChild(el('span', 'e-sub', s.end === null ? 'Running, ' + dur(Math.floor((n - s.start) / 60000)) + ' so far' : dur(mins)));
            li.appendChild(info);
            li.appendChild(btn('mini', 'Edit', () => { open.edit = s.id; open.vals.es = M.timeOf(s.start); open.vals.ee = s.end === null ? '' : M.timeOf(s.end); open.errs = {}; focusKey = 'f-es'; render(); }, { 'aria-label': 'Edit session ' + M.timeOf(s.start), 'data-f': 'edit-s-' + s.id }));
            ul.appendChild(li);
        });
        e.manual.forEach(m => {
            const li = el('li', 'entry'), info = el('div', 'e-info');
            info.appendChild(el('span', 'e-what', 'Added by hand: ' + dur(m.min)));
            if (m.note) info.appendChild(el('span', 'e-sub', m.note));
            li.appendChild(info);
            li.appendChild(btn('mini', 'Delete', () => change(kid.id, () => { st.manual = st.manual.filter(x => x.id !== m.id); return 'Deleted ' + dur(m.min) + ' added by hand.'; }), { 'aria-label': 'Delete ' + dur(m.min) + ' added by hand' }));
            ul.appendChild(li);
        });
        e.bonus.forEach(b => {
            const li = el('li', 'entry bonus'), info = el('div', 'e-info');
            info.appendChild(el('span', 'e-what', 'Bonus: +' + dur(b.min)));
            if (b.note) info.appendChild(el('span', 'e-sub', b.note));
            li.appendChild(info);
            li.appendChild(btn('mini', 'Delete', () => change(kid.id, () => { st.bonus = st.bonus.filter(x => x.id !== b.id); return 'Deleted the ' + dur(b.min) + ' bonus.'; }), { 'aria-label': 'Delete bonus of ' + dur(b.min) }));
            ul.appendChild(li);
        });
        if (!ul.children.length) p.appendChild(el('p', 'hint empty', 'Nothing on this day yet.'));
        p.appendChild(ul);
        const tot = Math.ceil(M.usedSec(st, kid.id, day, n) / 60), allow = M.allowanceMin(st, kid, day);
        p.appendChild(el('p', 'preview', 'Total: ' + dur(tot) + ' of ' + dur(allow) + ' (' + dayWord(M.dayType(st, day)) + ').'));
        const r = el('div', 'row-btns'); r.appendChild(btn('secondary', 'Close', () => closePanel(kid, 'list-' + kid.id))); p.appendChild(r);
        p.addEventListener('submit', ev => { ev.preventDefault(); if (open.edit) saveSession(kid); });
    }
    function editSession(kid, s) {
        const box = el('div', 'edit-s'), running = s.end === null;
        box.appendChild(el('p', 'e-what', running ? 'Change when this session started' : 'Change this session'));
        const pair = el('div', 'pair');
        const a = el('div'), b = el('div');
        textField(a, kid, 'es', 'Started at', { type: 'time' });
        if (!running) textField(b, kid, 'ee', 'Ended at', { type: 'time' });
        pair.append(a); if (!running) pair.append(b);
        box.appendChild(pair);
        if (!running) box.appendChild(el('p', 'hint', 'An end earlier than the start means it ended after midnight.'));
        const r = el('div', 'row-btns');
        r.appendChild(el('button', 'primary', 'Save', { type: 'submit', 'data-f': 'save-s' }));
        r.appendChild(btn('danger', 'Delete session', () => { open.edit = null; change(kid.id, () => { st.sessions = st.sessions.filter(x => x.id !== s.id); return 'Deleted the session from ' + M.timeOf(s.start) + '.'; }); }, { 'data-f': 'del-s' }));
        r.appendChild(btn('secondary', 'Cancel', () => { open.edit = null; open.errs = {}; render(); }));
        box.appendChild(r);
        return box;
    }
    function saveSession(kid) {
        const s = st.sessions.find(x => x.id === open.edit); if (!s) { open.edit = null; render(); return; }
        const running = s.end === null, res = M.sessionTimes(M.dayKey(s.start), open.vals.es, open.vals.ee, now(), running);
        if (res.error) { open.errs = /start/i.test(res.error) ? { es: res.error } : { ee: res.error }; focusKey = /start/i.test(res.error) ? 'f-es' : 'f-ee'; render(); return; }
        const clash = M.overlap(st, kid.id, res.start, res.end === null ? now() : res.end, s.id, now());
        if (clash) { open.errs = { es: 'That overlaps the session from ' + M.timeOf(clash.start) + ' to ' + (clash.end === null ? 'now' : M.timeOf(clash.end)) + '. Change the times or delete one of them.' }; focusKey = 'f-es'; render(); return; }
        const day = open.vals.date;
        open.edit = null; open.errs = {};
        change(kid.id, () => {
            s.start = res.start; s.end = res.end;
            return 'Session changed: ' + M.timeOf(res.start) + ' to ' + (res.end === null ? 'now' : M.timeOf(res.end) + (res.nextDay ? ' (next day)' : '')) + '.';
        });
        open = { kid: kid.id, what: 'list', vals: { date: day || today() }, errs: {}, edit: null }; render();
    }
    function saveExtra(kid, w) {
        const r = M.parseDuration(open.vals.min, { min: 1, max: w === 'bonus' ? 360 : M.DAY_MIN });
        if (r.error) { open.errs = { min: r.error }; focusKey = 'f-min'; render(); return; }
        const note = String(open.vals.note || '').trim().slice(0, 60), t = today(), date = w === 'manual' && M.isKey(open.vals.date) && open.vals.date <= t ? open.vals.date : t;
        open = null; focusKey = 'go-' + kid.id;
        change(kid.id, () => {
            if (w === 'bonus') st.bonus.push({ id: M.nextId(st), kid: kid.id, date: t, min: r.min, note });
            else st.manual.push({ id: M.nextId(st), kid: kid.id, date, min: r.min, note });
            const s = M.status(st, kid, t, now());
            return (w === 'bonus' ? 'Gave ' + kid.name + ' ' + dur(r.min) + ' bonus today. ' : 'Added ' + dur(r.min) + ' for ' + (date === t ? 'today' : date === M.addDays(t, -1) ? 'yesterday' : M.niceDay(date, t, locale)) + '. ') + M.statusLine(kid, s).replace(kid.name + ': ', 'Now: ');
        });
        seedAlertsFor(kid);
    }
    // after a bonus the warning may come again later; after adding time it should not beep straight away
    function seedAlertsFor(kid) { const t = today(), s = M.status(st, kid, t, now()); alerted[kid.id + '|' + t + '|warn'] = s.state !== 'ok'; alerted[kid.id + '|' + t + '|up'] = s.state === 'up' || s.state === 'none'; }
    function saveKid(kid) {
        const name = String(open.vals.name || '').trim(), a = readAllow(open.vals, 'school'), b = readAllow(open.vals, 'weekend'), errs = {};
        if (!name) errs.name = "Type the child's name.";
        else if (st.kids.some(k => k.id !== kid.id && k.name.toLowerCase() === name.toLowerCase())) errs.name = 'There is already a child called ' + name + '. Add a letter or a surname to tell them apart.';
        if (a.error) errs.school = a.error; if (b.error) errs.weekend = b.error;
        if (Object.keys(errs).length) { open.errs = errs; focusKey = errs.name ? 'f-name' : errs.school ? 'k' + kid.id + '-school' : 'k' + kid.id + '-weekend'; if (errs.school && open.vals.school === 'custom') focusKey += '-c'; else if (!errs.school && errs.weekend && open.vals.weekend === 'custom') focusKey += '-c'; render(); return; }
        open = null; focusKey = 'edit-' + kid.id;
        change(kid.id, () => { kid.name = name; kid.school = a.min; kid.weekend = b.min; return 'Saved. ' + name + ' gets ' + allowWords(a.min) + ' on school days and ' + allowWords(b.min) + ' at weekends and on holidays.'; });
        seedAlertsFor(kidById(kid.id));
    }
    function delKid(kid) {
        open = null; focusKey = null;
        change('top', () => {
            st.kids = st.kids.filter(k => k.id !== kid.id);
            ['sessions', 'manual', 'bonus'].forEach(l => { st[l] = st[l].filter(x => x.kid !== kid.id); });
            return 'Deleted ' + kid.name + ' and their times.';
        });
    }

    // ---- add a child ----
    const addVals = { school: '60', weekend: '120' };
    let addErrs = {};
    function drawAdd() {
        const has = st.kids.length > 0, showForm = !has || addOpen;
        $('add-h').textContent = has ? 'Add another child' : 'Add a child';
        $('open-add').hidden = showForm; $('add-form').hidden = !showForm; $('a-cancel').hidden = !has;
        drawMsg($('add-msg'), 'add');
        const box = $('a-allow'); box.textContent = '';
        allowField(box, 'a', 'school', 'Screen time on school days', addVals, addErrs);
        allowField(box, 'a', 'weekend', 'Screen time at weekends and holidays', addVals, addErrs);
        preview();
    }
    function preview() {
        const name = $('a-name').value.trim() || 'Your child', a = readAllow(addVals, 'school'), b = readAllow(addVals, 'weekend');
        $('a-preview').textContent = a.error || b.error ? '' : name + ' gets ' + allowWords(a.min) + ' on school days and ' + allowWords(b.min) + ' at weekends and on holidays.';
    }
    function addKid(e) {
        e.preventDefault();
        const name = $('a-name').value.trim(), a = readAllow(addVals, 'school'), b = readAllow(addVals, 'weekend');
        addErrs = {};
        let err = '';
        if (!name) err = "Type the child's name.";
        else if (st.kids.some(k => k.name.toLowerCase() === name.toLowerCase())) err = 'There is already a child called ' + name + '. Add a letter or a surname to tell them apart.';
        else if (st.kids.length >= 50) err = 'You can add up to 50 children.';
        $('e-a-name').textContent = err; err ? $('a-name').setAttribute('aria-invalid', 'true') : $('a-name').removeAttribute('aria-invalid');
        if (a.error) addErrs.school = a.error; if (b.error) addErrs.weekend = b.error;
        if (err || a.error || b.error) {
            drawAdd();
            const f = err ? $('a-name') : a.error ? (addVals.school === 'custom' ? $('a-school-c') : $('a-school')) : (addVals.weekend === 'custom' ? $('a-weekend-c') : $('a-weekend'));
            f.focus(); return;
        }
        addOpen = false;
        let kid;
        focusKey = null;
        change('top', () => { kid = { id: M.nextId(st), name, school: a.min, weekend: b.min }; st.kids.push(kid); return 'Added ' + name + ': ' + allowWords(a.min) + ' on school days, ' + allowWords(b.min) + ' at weekends and on holidays. Tap Start when ' + name + ' begins.'; });
        $('a-name').value = ''; addVals.school = '60'; addVals.weekend = '120'; addVals.schoolC = ''; addVals.weekendC = '';
        seedAlertsFor(kid);
        render();
        focusKey = 'go-' + kid.id; focusNow();
    }

    // ---- settings ----
    function drawSettings() {
        $('warn').value = String(st.settings.warn);
        $('sound').checked = st.settings.sound;
        const g = $('weekend-days');
        if (!g.children.length) DAYS.forEach(d => {
            const ref = M.addDays('2026-10-19', (d + 6) % 7); // 19 Oct 2026 is a Monday
            const l = el('label', 'day-chip'), i = el('input', '', null, { type: 'checkbox', value: String(d), 'data-f': 'wd-' + d });
            i.addEventListener('change', () => {
                const set = [...g.querySelectorAll('input:checked')].map(x => +x.value).sort();
                st.settings.weekend = set; save(); seedAlerts();
                say('set', set.length ? 'Weekend days saved.' : 'No weekend days: every day uses the school-day time, unless you make it a holiday.');
            });
            l.append(i, document.createTextNode(' ' + M.shortWeekday(ref, locale)));
            g.appendChild(l);
        });
        g.querySelectorAll('input').forEach(i => { i.checked = st.settings.weekend.includes(+i.value); });
        drawMsg($('set-msg'), 'set');
        $('copy-all').disabled = !st.kids.length;
        const body = M.summary(st, today(), now(), locale);
        $('mail-all').href = 'mailto:?subject=' + encodeURIComponent('Screen time today') + '&body=' + encodeURIComponent(body);
        $('mail-all').classList.toggle('off', !st.kids.length);
        $('mail-all').setAttribute('aria-disabled', String(!st.kids.length));
    }
    function copyText(text) {
        const done = () => say('set', "Copied today's summary. Paste it into a message.");
        const fallback = () => { const ta = el('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; } ta.remove(); ok ? done() : say('set', 'Could not copy here. Use "Email today\'s summary" instead.', true); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
    }
    function backup() {
        const blob = new Blob([JSON.stringify(st, null, 1)], { type: 'application/json' }), a = el('a');
        a.href = URL.createObjectURL(blob); a.download = 'screen-time-backup-' + today() + '.json';
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        say('set', 'Backup file saved. Keep it somewhere safe, or open it on another device with "Restore a backup".');
    }
    function restore(file) {
        if (!file) return;
        if (file.size > 5e6) { say('set', 'That file is too big to be a backup from this app.', true); return; }
        const r = new FileReader();
        r.onload = () => {
            let data = null; try { data = M.normalize(JSON.parse(r.result)); } catch (e) { data = null; }
            if (!data) { say('set', 'That file is not a backup from this app, so nothing was changed.', true); return; }
            open = null;
            change('set', () => { st = data; return 'Backup restored: ' + data.kids.length + (data.kids.length === 1 ? ' child.' : ' children.'); });
            seedAlerts(); render();
        };
        r.onerror = () => say('set', 'Could not read that file.', true);
        r.readAsText(file);
    }

    // ---- drawing ----
    function focusNow() {
        if (!focusKey) return;
        const f = document.querySelector('[data-f="' + focusKey + '"]') || document.getElementById(focusKey);
        focusKey = null;
        if (f) { try { f.focus({ preventScroll: false }); } catch (e) { f.focus(); } }
    }
    function render() {
        lastDay = today();
        M.prune(st, lastDay);
        $('storage-warn').hidden = storageOK;
        $('app').classList.toggle('setup', !st.kids.length);
        drawToday();
        drawMsg($('top-msg'), 'top');
        refs = {};
        const list = $('kids'); list.textContent = '';
        st.kids.forEach(k => list.appendChild(kidCard(k)));
        drawAdd(); drawSettings(); title();
        focusNow();
    }
    function tick() {
        if (today() !== lastDay) { seedAlerts(); if (open && open.what !== 'list') open = null; render(); return; }
        st.kids.forEach(update);
        title();
    }

    // ---- wiring ----
    $('add-form').addEventListener('submit', addKid);
    $('a-name').addEventListener('input', () => { $('e-a-name').textContent = ''; $('a-name').removeAttribute('aria-invalid'); preview(); });
    $('a-allow').addEventListener('allow', preview);
    $('open-add').addEventListener('click', () => { addOpen = true; msg = null; drawAdd(); $('a-name').focus(); });
    $('a-cancel').addEventListener('click', () => { addOpen = false; addErrs = {}; $('a-name').value = ''; $('e-a-name').textContent = ''; drawAdd(); $('open-add').focus(); });
    $('today-toggle').addEventListener('click', toggleToday);
    $('warn').addEventListener('change', () => { st.settings.warn = +$('warn').value; save(); seedAlerts(); say('set', st.settings.warn ? 'You will be warned ' + st.settings.warn + (st.settings.warn === 1 ? ' minute' : ' minutes') + ' before time is up.' : 'No warning before time is up.'); });
    $('sound').addEventListener('change', () => { st.settings.sound = $('sound').checked; save(); if (st.settings.sound) { unlockAudio(); beep(1); } say('set', st.settings.sound ? 'Beep and vibrate are on.' : 'Beep and vibrate are off. The box still turns orange and red.'); });
    $('copy-all').addEventListener('click', () => copyText(M.summary(st, today(), now(), locale)));
    $('mail-all').addEventListener('click', e => { if (!st.kids.length) { e.preventDefault(); say('set', 'Add a child first.'); } else $('mail-all').href = 'mailto:?subject=' + encodeURIComponent('Screen time today') + '&body=' + encodeURIComponent(M.summary(st, today(), now(), locale)); });
    $('backup').addEventListener('click', backup);
    $('restore').addEventListener('click', () => $('restore-file').click());
    $('restore-file').addEventListener('change', e => { restore(e.target.files[0]); e.target.value = ''; });
    $('wipe').addEventListener('click', () => { if (!st.kids.length) { say('set', 'There is nothing to delete.'); return; } open = null; const s = st.settings; change('top', () => { st = M.emptyState(); st.settings = s; return 'Everything was deleted.'; }); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });

    load();
    seedAlerts();
    render();
    setInterval(tick, 1000);
    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
