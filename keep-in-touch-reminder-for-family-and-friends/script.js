// Keep in Touch Reminder for Family and Friends: the page. The maths and the words are in core.js (window.KIT).
(function () {
    'use strict';
    const C = window.KIT, SLUG = 'keep-in-touch-reminder-for-family-and-friends', KEY = SLUG + '.state';
    const $ = id => document.getElementById(id);
    // a locale Intl accepts (some systems report tags such as "en-US@posix")
    const LOC = (() => { for (const l of [navigator.language, String(navigator.language || '').split(/[@.]/)[0], 'en-GB']) { try { if (l && Intl.getCanonicalLocales(l).length) return l; } catch (e) { /* try the next */ } } return 'en-GB'; })();
    const COMMON = [['Asia/Karachi', 'Pakistan'], ['Asia/Kolkata', 'India'], ['Asia/Dhaka', 'Bangladesh'], ['Asia/Kathmandu', 'Nepal'], ['Asia/Colombo', 'Sri Lanka'],
        ['Asia/Dubai', 'UAE (Dubai)'], ['Asia/Riyadh', 'Saudi Arabia'], ['Asia/Qatar', 'Qatar'], ['Asia/Kuwait', 'Kuwait'], ['Asia/Muscat', 'Oman'], ['Asia/Bahrain', 'Bahrain'],
        ['Europe/London', 'UK (London)'], ['Europe/Dublin', 'Ireland'], ['Europe/Berlin', 'Germany'], ['Europe/Paris', 'France'], ['Europe/Madrid', 'Spain'], ['Europe/Rome', 'Italy'],
        ['Europe/Amsterdam', 'Netherlands'], ['Europe/Stockholm', 'Sweden'], ['Europe/Istanbul', 'Turkey'],
        ['America/New_York', 'US East (New York)'], ['America/Chicago', 'US Central (Chicago)'], ['America/Denver', 'US Mountain (Denver)'], ['America/Los_Angeles', 'US West (Los Angeles)'],
        ['America/Toronto', 'Canada East (Toronto)'], ['America/Vancouver', 'Canada West (Vancouver)'], ['America/Mexico_City', 'Mexico'], ['America/Sao_Paulo', 'Brazil'],
        ['Australia/Sydney', 'Australia East (Sydney)'], ['Australia/Perth', 'Australia West (Perth)'], ['Pacific/Auckland', 'New Zealand'],
        ['Asia/Singapore', 'Singapore'], ['Asia/Kuala_Lumpur', 'Malaysia'], ['Asia/Jakarta', 'Indonesia (Jakarta)'], ['Asia/Manila', 'Philippines'], ['Asia/Shanghai', 'China'],
        ['Asia/Hong_Kong', 'Hong Kong'], ['Asia/Tokyo', 'Japan'], ['Asia/Seoul', 'South Korea'],
        ['Africa/Cairo', 'Egypt'], ['Africa/Lagos', 'Nigeria'], ['Africa/Nairobi', 'Kenya'], ['Africa/Johannesburg', 'South Africa']];
    const COMMON_NAME = Object.fromEntries(COMMON);
    let state = C.emptyState(), today = C.localDay(new Date());
    let editing = null;        // id of the person in the form, or null when adding
    let editRef = null;        // { pid, eid } history entry being edited
    let openMore = {};         // person id -> "another day or a note" panel open
    let drafts = {};           // person id -> { d, n } typed in that panel
    let showAll = {};          // person id -> show the whole history
    let flash = null, undoSnap = null, canSave = true;

    // ---------- saving ----------
    function load() {
        let raw = null;
        try { raw = localStorage.getItem(KEY); } catch (e) { canSave = false; }
        if (!raw) return;
        try { const s = C.cleanState(JSON.parse(raw)); if (s) state = s; } catch (e) { /* corrupt: start fresh */ }
    }
    function save() {
        if (!canSave) { $('store-warn').hidden = false; return; }
        try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { canSave = false; $('store-warn').hidden = false; }
    }
    const snap = () => JSON.stringify(state);
    function change(fn, where, text) {
        const before = snap();
        fn();
        save();
        undoSnap = before;
        flash = { where, text: typeof text === 'function' ? text() : text, undo: true };
        render();
    }
    function undo() {
        if (!undoSnap) return;
        const s = C.cleanState(JSON.parse(undoSnap));
        if (s) state = s;
        const where = flash && $(flash.where) ? flash.where : 'top-msg';
        undoSnap = null; editRef = null;
        save();
        flash = { where, text: 'Undone.' };
        render();
        const box = $(where); if (box) box.scrollIntoView({ block: 'nearest' });
    }

    // ---------- helpers ----------
    function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
    function btn(text, cls, fn, label) { const b = el('button', cls, text); b.type = 'button'; if (label) b.setAttribute('aria-label', label); b.addEventListener('click', fn); return b; }
    function p(cls, text) { return el('p', cls, text); }
    const date = (s, o) => C.fmtDate(s, LOC, o);
    const byId = id => state.people.find(x => x.id === id);
    const newId = pre => pre + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const tzName = tz => COMMON_NAME[tz] || C.tzCity(tz);
    const winText = w => C.fmtMin(w.from, LOC) + ' to ' + C.fmtMin(w.to, LOC);
    function myTime(d) { try { return new Intl.DateTimeFormat(LOC, { hour: '2-digit', minute: '2-digit' }).format(d); } catch (e) { return C.hm(d.getHours() * 60 + d.getMinutes()); } }
    function copyText(text, where) {
        const done = () => { flash = { where, text: 'Copied. Paste it into a message or a note.' }; render(); };
        const fallback = () => {
            const t = el('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.position = 'absolute'; t.style.left = '-9999px';
            document.body.appendChild(t); t.select();
            let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
            t.remove();
            if (ok) done(); else { flash = { where, text: 'Could not copy here. Use Email the list instead.', bad: true }; render(); }
        };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
    }
    function setErr(id, msg) {
        const e = $(id + '-err'); if (e) e.textContent = msg || '';
        const inp = $(id); if (inp) { if (msg) inp.setAttribute('aria-invalid', 'true'); else inp.removeAttribute('aria-invalid'); }
        return !msg;
    }
    function showMsg(box, text, withUndo, bad) {
        if (!box) return;
        box.textContent = '';
        box.className = 'msg show' + (bad ? ' bad' : '');
        box.appendChild(document.createTextNode(text + ' '));
        if (withUndo) box.appendChild(btn('Undo', 'link inline undo', undo));
    }
    function download(name, type, text) {
        const blob = new Blob([text], { type });
        const a = el('a'); a.href = URL.createObjectURL(blob); a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }
    const fileName = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'person';

    // ---------- the person form ----------
    function fillSelects() {
        const tz = $('f-tz');
        tz.appendChild(Object.assign(el('option', null, 'Same time zone as me'), { value: '' }));
        const g1 = el('optgroup'); g1.label = 'Countries';
        COMMON.slice().sort((a, b) => a[1].localeCompare(b[1])).forEach(([z, n]) => { if (C.validTz(z)) g1.appendChild(Object.assign(el('option', null, n), { value: z })); });
        tz.appendChild(g1);
        let all = [];
        try { all = Intl.supportedValuesOf('timeZone'); } catch (e) { all = COMMON.map(x => x[0]); }
        const g2 = el('optgroup'); g2.label = 'All time zones';
        all.forEach(z => g2.appendChild(Object.assign(el('option', null, z.replace(/_/g, ' ')), { value: z })));
        tz.appendChild(g2);
        ['f-from', 'f-to'].forEach(id => { for (let m = 0; m < 1440; m += 30) $(id).appendChild(Object.assign(el('option', null, C.fmtMin(m, LOC)), { value: String(m) })); });
        $('f-from').value = '540'; $('f-to').value = '1260';
        // the preset labels in the reader's own clock format
        [...$('f-win').options].forEach(o => { const m = o.value.match(/^(\d+)-(\d+)$/); if (m) o.textContent = o.textContent.replace(/\d\d:\d\d to \d\d:\d\d/, winText({ from: +m[1], to: +m[2] })); });
    }
    function modes() {
        $('f-oevery-box').hidden = $('f-every').value !== 'other';
        $('f-lastd-box').hidden = $('f-last').value !== 'pick';
        const custom = $('f-win').value === 'custom';
        $('f-cwin-box').hidden = !custom; $('f-cwin-hint').hidden = !custom;
        if ($('f-oevery-box').hidden) setErr('f-oevery', '');
        if ($('f-lastd-box').hidden) setErr('f-lastd', '');
        if (!custom) setErr('f-from', '');
    }
    function openBox(name, open) { $('f-' + name + '-box').hidden = !open; $('f-' + name + '-open').hidden = open; }
    function resetForm() {
        editing = null;
        $('f-name').value = ''; $('f-every').value = '7'; $('f-oevery').value = ''; $('f-last').value = ''; $('f-lastd').value = '';
        $('f-tz').value = ''; $('f-win').value = ''; $('f-from').value = '540'; $('f-to').value = '1260'; $('f-note').value = '';
        ['f-name', 'f-oevery', 'f-lastd', 'f-from'].forEach(id => setErr(id, ''));
        $('f-last-box').hidden = false;
        $('f-lastd').max = today;
        openBox('tz', false); openBox('note', false); modes();
    }
    function fillForm(x) {
        resetForm();
        editing = x.id;
        $('f-name').value = x.name;
        if ([...$('f-every').options].some(o => o.value === String(x.every))) $('f-every').value = String(x.every);
        else { $('f-every').value = 'other'; $('f-oevery').value = String(x.every); }
        $('f-last-box').hidden = true;
        if (x.tz || x.win) {
            openBox('tz', true);
            $('f-tz').value = x.tz || '';
            if (x.tz && $('f-tz').value !== x.tz) $('f-tz').appendChild(Object.assign(el('option', null, x.tz), { value: x.tz })), $('f-tz').value = x.tz;
            if (x.win) {
                const v = x.win.from + '-' + x.win.to;
                if ([...$('f-win').options].some(o => o.value === v)) $('f-win').value = v;
                else { $('f-win').value = 'custom'; $('f-from').value = String(x.win.from - x.win.from % 30); $('f-to').value = String(x.win.to - x.win.to % 30); }
            }
        }
        if (x.note) { openBox('note', true); $('f-note').value = x.note; }
        modes();
    }
    function readForm() {
        let ok = true;
        const name = C.cleanName($('f-name').value);
        if (!name) ok = setErr('f-name', 'Type a name, such as Nani.') && ok;
        else if (state.people.some(x => x.id !== editing && x.name.toLowerCase() === name.toLowerCase())) ok = setErr('f-name', 'You already have someone called ' + name + '. Add something to tell them apart, such as ' + name + ' (Lahore).') && ok;
        else setErr('f-name', '');
        let every;
        if ($('f-every').value === 'other') {
            const r = C.parseEvery($('f-oevery').value);
            if (r.error) ok = setErr('f-oevery', r.error) && ok; else { setErr('f-oevery', ''); every = r.n; }
        } else every = Number($('f-every').value);
        let last = null;
        if (!editing && $('f-last').value !== '') {
            if ($('f-last').value === 'pick') {
                const d = $('f-lastd').value;
                if (!C.isDay(d)) ok = setErr('f-lastd', 'Pick the day, or choose "Not sure, or not yet".') && ok;
                else if (d > today) ok = setErr('f-lastd', 'That day is in the future. Pick today or an earlier day.') && ok;
                else { setErr('f-lastd', ''); last = d; }
            } else last = C.addDays(today, -Number($('f-last').value));
        }
        let tz = '', win = null;
        if (!$('f-tz-box').hidden) {
            tz = $('f-tz').value;
            const wv = $('f-win').value;
            if (wv === 'custom') {
                const from = Number($('f-from').value), to = Number($('f-to').value);
                if (from === to) ok = setErr('f-from', 'From and To are the same time. Pick a different To time.') && ok;
                else { setErr('f-from', ''); win = { from, to }; }
            } else if (wv) { const [a, b] = wv.split('-').map(Number); win = { from: a, to: b }; }
        }
        const note = $('f-note-box').hidden ? '' : C.cleanNote($('f-note').value, 500);
        if (!ok) { const bad = document.querySelector('#add [aria-invalid="true"]'); if (bad) bad.focus(); return null; }
        return { name, every, last, tz, win, note };
    }
    function savePerson() {
        const f = readForm();
        if (!f) return;
        if (editing) {
            const x = byId(editing);
            if (!x) { resetForm(); render(); return; }
            resetForm();
            change(() => {
                x.name = f.name; x.every = f.every;
                if (f.tz) x.tz = f.tz; else delete x.tz;
                if (f.win) x.win = f.win; else delete x.win;
                if (f.note) x.note = f.note; else delete x.note;
            }, 'pm-' + x.id, 'Saved the changes to ' + f.name + '.');
            const box = $('p-' + x.id); if (box) box.scrollIntoView({ block: 'nearest' });
            return;
        }
        if (state.people.length >= 200) { showMsg($('add-msg'), 'You have 200 people, the most this app holds. Delete someone first.', false, true); return; }
        const x = { id: newId('p'), name: f.name, every: f.every, added: today, log: [] };
        if (f.tz) x.tz = f.tz;
        if (f.win) x.win = f.win;
        if (f.note) x.note = f.note;
        if (f.last) x.log.push({ id: newId('e'), d: f.last, k: 'any' });
        const s = C.status(x, today);
        resetForm();
        change(() => { state.people.push(x); }, 'add-msg', 'Added ' + x.name + ': ' + (s.kind === 'never' ? 'on today\u2019s list.' : C.headline(s).toLowerCase() + '.'));
        $('f-name').focus();
    }

    // ---------- logging a contact ----------
    function logContact(x, kind) {
        const d0 = drafts[x.id] || {};
        const d = openMore[x.id] ? (d0.d || today) : today;
        const n = openMore[x.id] ? C.cleanNote(d0.n, 200) : '';
        const e = { id: newId('e'), d, k: kind };
        if (n) e.n = n;
        const err = C.checkEntry(e, today);
        if (err) { flash = { where: 'pm-' + x.id, text: err, bad: true }; render(); const i = $('lg-d-' + x.id); if (i) i.focus(); return; }
        let text = '';
        delete openMore[x.id]; delete drafts[x.id];
        change(() => {
            x.log.push(e);
            const s = C.status(x, today);
            const what = kind === 'try' ? 'Noted that you tried ' + x.name : C.KINDS[kind] + ' ' + x.name;
            text = what + (d === today ? ' today' : ' on ' + date(d, 'wd')) + '. ' + (kind === 'try' ? 'They stay due until you get through.' :
                s.kind === 'paused' ? '' : s.kind === 'over' ? 'Still ' + C.headline(s).toLowerCase() + '.' : s.kind === 'today' ? 'Due again today.' : 'Next due ' + date(s.due, 'wd') + '.');
        }, 'pm-' + x.id, () => text);
        const box = $('p-' + x.id); if (box) box.scrollIntoView({ block: 'nearest' });
    }

    // ---------- the calendar file ----------
    function calendar(x) {
        const s = C.status(x, today);
        const day = s.due && s.due > today ? s.due : today;
        const d = day.replace(/-/g, ''), d2 = C.addDays(day, 1).replace(/-/g, '');
        const esc = t => t.replace(/[\\;,]/g, m => '\\' + m).replace(/\n/g, '\\n');
        const title = 'Get in touch with ' + x.name;
        const desc = 'You aim to be in touch ' + C.everyWords(x.every) + '. ' + C.lastWords(s, LOC) + '. From the Keep in Touch Reminder.';
        const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
        const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//umar8092//Keep in Touch Reminder//EN', 'BEGIN:VEVENT', 'UID:' + x.id + '-' + d + '@umar8092.github.io',
            'DTSTAMP:' + stamp, 'DTSTART;VALUE=DATE:' + d, 'DTEND;VALUE=DATE:' + d2, 'SUMMARY:' + esc(title), 'DESCRIPTION:' + esc(desc),
            'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc(title), 'TRIGGER:PT9H', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
        download('keep-in-touch-' + fileName(x.name) + '.ics', 'text/calendar', ics);
        flash = { where: 'pm-' + x.id, text: 'Calendar file saved. Open it to add the reminder for ' + date(day, 'wd') + '.' }; render();
    }

    // ---------- their time now ----------
    function clockLines(x, now) {
        const out = [];
        let min, ahead = 0;
        if (x.tz) {
            const c = C.clock(x.tz, now); min = c.min; ahead = c.ahead;
            const mineWd = new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(now);
            out.push({ cls: 'tz-now', text: 'Their time now: ' + C.fmtMin(c.min, LOC) + (c.wd !== mineWd ? ' ' + c.wd : '') + ' (' + C.aheadWords(c.ahead) + ')' });
        } else min = now.getHours() * 60 + now.getMinutes();
        if (x.win) {
            const a = C.advice(min, x.win), their = x.tz && ahead ? ' their time' : '';
            if (a.good) out.push({ cls: 'tz-good', text: 'A good time to call now (until ' + C.fmtMin(x.win.to, LOC) + their + ').' });
            else {
                const at = new Date(now.getTime() + a.untilStart * 60000);
                out.push({ cls: 'tz-bad', text: 'Not a good time to call. Good from ' + C.fmtMin(x.win.from, LOC) + their + (their ? ', ' + myTime(at) + ' your time' : '') + ' (in ' + C.fmtGap(a.untilStart) + ').' });
            }
        }
        return out;
    }
    function fillClock(box, x) {
        box.textContent = '';
        clockLines(x, new Date()).forEach(l => box.appendChild(p(l.cls, l.text)));
    }
    function tick() {
        const d = C.localDay(new Date());
        if (d !== today) { today = d; $('f-lastd').max = today; render(); return; }
        document.querySelectorAll('.tz-box').forEach(b => { const x = byId(b.dataset.pid); if (x) fillClock(b, x); });
    }

    // ---------- the Today card ----------
    function renderToday() {
        const body = $('today-body'); body.textContent = '';
        $('today-h').textContent = 'Today, ' + date(today, 'wd');
        const sm = C.summary(state.people, today);
        if (sm.now.length) {
            body.appendChild(p('t-big', sm.now.length === 1 ? '1 person to get in touch with today' : sm.now.length + ' people to get in touch with today'));
            const ul = el('ul', 't-list');
            sm.now.forEach(r => {
                const li = el('li', 'k-' + r.s.kind), a = el('a', null, r.p.name);
                a.href = '#p-' + r.p.id;
                li.appendChild(a);
                li.appendChild(el('span', null, ': ' + (r.s.kind === 'never' ? 'no contact logged yet' : C.headline(r.s).toLowerCase())));
                ul.appendChild(li);
            });
            body.appendChild(ul);
        } else if (sm.next) body.appendChild(p('t-big', 'Everyone is up to date'));
        else body.appendChild(p('t-big', 'Everyone is paused'));
        if (sm.next) body.appendChild(p('t-next', 'Next: ' + sm.next.p.name + ', ' + C.headline(sm.next.s).toLowerCase() + ' (' + date(sm.next.s.due, 'wd') + ').'));
        const parts = [];
        if (sm.over.length) parts.push(sm.over.length + ' overdue');
        if (sm.today.length) parts.push(sm.today.length + ' due today');
        if (sm.never.length) parts.push(sm.never.length + ' not logged yet');
        if (sm.soon.length + sm.ok.length) parts.push((sm.soon.length + sm.ok.length) + ' up to date');
        if (sm.paused.length) parts.push(sm.paused.length + ' paused');
        body.appendChild(p('t-count', parts.join(' \u00b7 ')));
        const text = C.summaryText(state.people, today, LOC);
        $('mail').href = 'mailto:?subject=' + encodeURIComponent('Keep in touch: ' + date(today, 'wd')) + '&body=' + encodeURIComponent(text);
    }

    // ---------- one person's box ----------
    function statusBlock(x, s, box) {
        const act = el('div', 'act k-' + s.kind);
        act.appendChild(p('a-big', C.headline(s)));
        let note;
        if (s.kind === 'paused') note = 'Paused since ' + date(x.paused, 'wd') + '. Reminders are off until you tap Resume.' + (s.last ? ' ' + C.lastWords(s, LOC) + '.' : '');
        else if (s.kind === 'never') note = 'No contact logged yet. After you get in touch, tap what you did below.';
        else if (s.kind === 'over') note = C.lastWords(s, LOC) + '. You aim to be in touch ' + C.everyWords(x.every) + ', so they were due ' + date(s.due, 'wd') + '.';
        else if (s.kind === 'today') note = C.lastWords(s, LOC) + '. You aim to be in touch ' + C.everyWords(x.every) + '.';
        else note = C.lastWords(s, LOC) + '. Next due ' + date(s.due, 'wd') + '.';
        act.appendChild(p('a-note', note));
        if (s.tried) act.appendChild(p('a-try', 'You tried ' + C.ago(s.triedAgo) + (s.triedAgo > 1 ? ' (' + date(s.tried.d, 'wd') + ')' : '') + ', no answer.'));
        box.appendChild(act);
    }
    function logBlock(x, box) {
        const wrap = el('div', 'log');
        wrap.appendChild(p('l-h', 'Just got in touch? Tap what you did:'));
        const g = el('div', 'l-btns');
        [['call', 'Called'], ['msg', 'Messaged'], ['met', 'Met up']].forEach(([k, t]) => g.appendChild(btn(t, 'primary', () => logContact(x, k), t + ' ' + x.name)));
        g.appendChild(btn('Tried, no answer', 'secondary', () => logContact(x, 'try'), 'Tried ' + x.name + ', no answer'));
        wrap.appendChild(g);
        if (!openMore[x.id]) {
            wrap.appendChild(btn('+ Another day or a note about it (optional)', 'link', () => { openMore[x.id] = true; drafts[x.id] = { d: today, n: '' }; render(); const i = $('lg-d-' + x.id); if (i) i.focus(); }));
        } else {
            const d0 = drafts[x.id] || (drafts[x.id] = { d: today, n: '' });
            const more = el('div', 'more');
            const two = el('div', 'two more-two');
            const f1 = el('div', 'field'), l1 = el('label', null, 'Day'), i1 = el('input');
            i1.type = 'date'; i1.id = 'lg-d-' + x.id; i1.max = today; i1.value = d0.d; l1.htmlFor = i1.id;
            i1.addEventListener('input', () => { d0.d = i1.value; });
            f1.append(l1, i1);
            const f2 = el('div', 'field'), l2 = el('label', null, 'What you talked about'), i2 = el('input');
            i2.type = 'text'; i2.id = 'lg-n-' + x.id; i2.maxLength = 200; i2.autocomplete = 'off'; i2.placeholder = 'e.g. Her new job'; i2.value = d0.n || ''; l2.htmlFor = i2.id;
            i2.addEventListener('input', () => { d0.n = i2.value; });
            f2.append(l2, i2);
            two.append(f1, f2);
            more.appendChild(two);
            more.appendChild(p('hint', 'Now tap Called, Messaged, Met up or Tried, no answer above.'));
            more.appendChild(btn('Close', 'link', () => { delete openMore[x.id]; delete drafts[x.id]; render(); }));
            wrap.appendChild(more);
        }
        box.appendChild(wrap);
    }
    function historyBlock(x, box) {
        const list = C.sorted(x);
        const h = el('div', 'hist');
        h.appendChild(el('h4', null, 'History'));
        if (!list.length) { h.appendChild(p('hint', 'Nothing yet.')); box.appendChild(h); return; }
        const ul = el('div', 'h-list');
        const shown = showAll[x.id] ? list : list.slice(0, 5);
        shown.forEach(e => {
            const row = el('div', 'h-row');
            if (editRef && editRef.pid === x.id && editRef.eid === e.id) {
                row.classList.add('editing');
                const two = el('div', 'two');
                const f1 = el('div', 'field'), l1 = el('label', null, 'Day'), i1 = el('input');
                i1.type = 'date'; i1.id = 'ed-d'; i1.max = today; i1.value = e.d; l1.htmlFor = 'ed-d'; f1.append(l1, i1);
                const f2 = el('div', 'field'), l2 = el('label', null, 'What you did'), s2 = el('select');
                s2.id = 'ed-k'; l2.htmlFor = 'ed-k';
                Object.keys(C.KINDS).forEach(k => s2.appendChild(Object.assign(el('option', null, C.KINDS[k]), { value: k })));
                s2.value = e.k; f2.append(l2, s2);
                two.append(f1, f2);
                const l3 = el('label', null, 'Note'), i3 = el('input');
                i3.type = 'text'; i3.id = 'ed-n'; i3.maxLength = 200; i3.autocomplete = 'off'; i3.value = e.n || ''; i3.placeholder = 'e.g. Her new job'; l3.htmlFor = 'ed-n';
                const err = p('err', ''); err.id = 'ed-err'; err.setAttribute('role', 'alert');
                const bs = el('div', 'row-btns');
                bs.appendChild(btn('Save', 'primary', () => {
                    const ne = { id: e.id, d: i1.value, k: s2.value };
                    const n = C.cleanNote(i3.value, 200); if (n) ne.n = n;
                    const msg = C.checkEntry(ne, today);
                    if (msg) { err.textContent = msg; i1.setAttribute('aria-invalid', 'true'); i1.focus(); return; }
                    editRef = null;
                    change(() => { x.log[x.log.indexOf(e)] = ne; }, 'pm-' + x.id, 'Saved.');
                }));
                bs.appendChild(btn('Cancel', 'secondary', () => { editRef = null; render(); }));
                row.append(two, l3, i3, err, bs);
            } else {
                const l = el('div', 'h-l');
                l.appendChild(p('h-what', C.KINDS[e.k]));
                l.appendChild(p('h-when', date(e.d, e.d.slice(0, 4) === today.slice(0, 4) ? 'wd' : 'year') + ' \u00b7 ' + C.ago(C.diff(e.d, today))));
                if (e.n) l.appendChild(p('h-note', e.n));
                const bs = el('div', 'h-btns');
                bs.appendChild(btn('Edit', 'secondary small', () => { editRef = { pid: x.id, eid: e.id }; render(); const i = $('ed-d'); if (i) i.focus(); }, 'Edit ' + C.KINDS[e.k] + ' on ' + date(e.d)));
                bs.appendChild(btn('Delete', 'secondary small danger-t', () => change(() => { x.log.splice(x.log.indexOf(e), 1); }, 'pm-' + x.id, 'Deleted ' + C.KINDS[e.k].toLowerCase() + ' on ' + date(e.d, 'wd') + '.'), 'Delete ' + C.KINDS[e.k] + ' on ' + date(e.d)));
                row.append(l, bs);
            }
            ul.appendChild(row);
        });
        h.appendChild(ul);
        if (list.length > 5) h.appendChild(btn(showAll[x.id] ? 'Show only the latest 5' : 'Show all ' + list.length, 'link', () => { showAll[x.id] = !showAll[x.id]; render(); }));
        box.appendChild(h);
    }
    function statsLine(x) {
        const c = C.last30(x, today), parts = [];
        const w = (n, one, many) => n + ' ' + (n === 1 ? one : many);
        if (c.call) parts.push(w(c.call, 'call', 'calls'));
        if (c.msg) parts.push(w(c.msg, 'message', 'messages'));
        if (c.met) parts.push(w(c.met, 'meet-up', 'meet-ups'));
        if (c.any) parts.push(w(c.any, 'other contact', 'other contacts'));
        if (c.try) parts.push(w(c.try, 'try with no answer', 'tries with no answer'));
        return 'Last 30 days: ' + (parts.length ? parts.join(', ') : 'no contact logged');
    }
    function personBox(x, s) {
        const box = el('article', 'person k-' + s.kind);
        box.id = 'p-' + x.id;
        box.setAttribute('aria-label', x.name);
        const top = el('div', 'c-top');
        top.appendChild(el('h3', 'c-name', x.name));
        top.appendChild(el('span', 'tag', C.everyWords(x.every).replace(/^e/, 'E')));
        if (x.tz) top.appendChild(el('span', 'tag', tzName(x.tz)));
        box.appendChild(top);
        statusBlock(x, s, box);
        if (x.tz || x.win) {
            const tzb = el('div', 'tz-box'); tzb.dataset.pid = x.id;
            fillClock(tzb, x);
            box.appendChild(tzb);
        }
        if (x.note) box.appendChild(p('p-note', x.note));
        logBlock(x, box);
        const m = el('div', 'msg'); m.id = 'pm-' + x.id; m.setAttribute('role', 'status'); m.setAttribute('aria-live', 'polite');
        box.appendChild(m);
        historyBlock(x, box);
        box.appendChild(p('stats', statsLine(x)));
        const bs = el('div', 'c-btns');
        bs.appendChild(btn('Add next due day to calendar', 'secondary', () => calendar(x)));
        if (x.paused) bs.appendChild(btn('Resume', 'secondary', () => change(() => { delete x.paused; x.resumed = today; }, 'pm-' + x.id, 'Reminders for ' + x.name + ' are back on.')));
        else bs.appendChild(btn('Pause reminders', 'secondary', () => change(() => { x.paused = today; }, 'pm-' + x.id, 'Paused ' + x.name + '. They are not counted until you tap Resume.')));
        bs.appendChild(btn('Edit person', 'secondary', () => { fillForm(x); render(); $('add').scrollIntoView({ block: 'start' }); $('f-name').focus(); }));
        bs.appendChild(btn('Delete person', 'secondary danger-t', () => {
            if (editing === x.id) resetForm();
            change(() => { state.people.splice(state.people.indexOf(x), 1); }, 'top-msg', 'Deleted ' + x.name + '.');
        }));
        box.appendChild(bs);
        return box;
    }

    // ---------- the whole page ----------
    function applyFind() {
        const q = $('find').value.trim().toLowerCase();
        let shown = 0;
        document.querySelectorAll('#p-list .person').forEach(b => {
            const x = byId(b.id.slice(2)), hit = !q || (x && x.name.toLowerCase().includes(q));
            b.hidden = !hit; if (hit) shown++;
        });
        $('find-none').hidden = !q || shown > 0;
    }
    function render() {
        const has = state.people.length > 0;
        $('intro').hidden = has;
        $('today').hidden = !has;
        $('people').hidden = !has;
        $('find-box').hidden = state.people.length < 6;
        if ($('find-box').hidden) $('find').value = '';
        $('add-h').textContent = editing ? 'Edit ' + ((byId(editing) || {}).name || 'person') : has ? 'Add another person' : 'Add a person';
        $('add-intro').hidden = has || !!editing;
        $('quick').hidden = !!editing;
        $('f-save').textContent = editing ? 'Save changes' : 'Add person';
        $('f-cancel').hidden = !editing;
        $('restore-first').hidden = has || !!editing;
        $('del-all').disabled = !has;
        $('backup').disabled = !has;
        const list = $('p-list'); list.textContent = '';
        if (has) {
            renderToday();
            C.order(state.people, today).forEach(r => list.appendChild(personBox(r.p, r.s)));
            applyFind();
        }
        ['top-msg', 'add-msg', 'tools-msg', 'today-msg'].forEach(id => { $(id).className = 'msg'; $(id).textContent = ''; });
        if (flash) { const b = $(flash.where) || $('top-msg'); showMsg(b, flash.text, flash.undo, flash.bad); }
        flash = null;
    }

    // ---------- backup ----------
    function backup() {
        download(SLUG + '-' + today + '.json', 'application/json', JSON.stringify(Object.assign({ app: SLUG, saved: new Date().toISOString() }, state), null, 1));
        flash = { where: 'tools-msg', text: 'Backup saved (' + state.people.length + (state.people.length === 1 ? ' person' : ' people') + '). Keep the file somewhere safe.' }; render();
    }
    function restore(file) {
        const where = state.people.length ? 'tools-msg' : 'add-msg';
        if (!file) return;
        if (file.size > 5e6) { flash = { where, text: 'That file is too big to be a backup from this app.', bad: true }; render(); return; }
        const r = new FileReader();
        r.onload = () => {
            let s = null;
            try { s = C.cleanState(JSON.parse(r.result)); } catch (e) { s = null; }
            if (!s) { flash = { where, text: 'That file is not a backup from this app. Nothing was changed.', bad: true }; render(); return; }
            resetForm();
            change(() => { state = s; }, where, 'Backup restored: ' + s.people.length + (s.people.length === 1 ? ' person.' : ' people.'));
        };
        r.onerror = () => { flash = { where, text: 'Could not read that file.', bad: true }; render(); };
        r.readAsText(file);
    }

    // ---------- start ----------
    load();
    if (!canSave) $('store-warn').hidden = false;
    fillSelects();
    resetForm();
    $('quick').addEventListener('click', e => {
        const b = e.target.closest('.chip'); if (!b) return;
        $('f-name').value = b.dataset.name; $('f-every').value = b.dataset.every; setErr('f-name', ''); modes();
        $('f-name').focus(); $('f-name').select();
    });
    ['f-every', 'f-last', 'f-win'].forEach(id => $(id).addEventListener('change', modes));
    ['f-from', 'f-to'].forEach(id => $(id).addEventListener('change', () => setErr('f-from', '')));
    $('f-tz-open').addEventListener('click', () => { openBox('tz', true); $('f-tz').focus(); });
    $('f-note-open').addEventListener('click', () => { openBox('note', true); $('f-note').focus(); });
    $('f-name').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); savePerson(); } });
    $('f-oevery').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); savePerson(); } });
    $('f-save').addEventListener('click', savePerson);
    $('f-cancel').addEventListener('click', () => { const id = editing; resetForm(); render(); const b = id && $('p-' + id); if (b) b.scrollIntoView({ block: 'nearest' }); });
    $('backup').addEventListener('click', backup);
    $('restore').addEventListener('click', () => $('restore-file').click());
    $('restore-first').addEventListener('click', () => $('restore-file').click());
    $('restore-file').addEventListener('change', e => { restore(e.target.files[0]); e.target.value = ''; });
    $('del-all').addEventListener('click', () => { resetForm(); change(() => { state = C.emptyState(); }, 'tools-msg', 'Everything was deleted.'); });
    $('copy').addEventListener('click', () => copyText(C.summaryText(state.people, today, LOC), 'today-msg'));
    $('find').addEventListener('input', applyFind);
    render();
    setInterval(tick, 20000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });

    if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
