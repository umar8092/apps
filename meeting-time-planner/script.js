(function () {
    'use strict';
    const C = MeetCore;
    const KEY = 'meeting-time-planner.state';
    const $ = id => document.getElementById(id);
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    let state = null, undoState = null, msgTimer = null, current = null;

    function pad(n) { return String(n).padStart(2, '0'); }
    function todayStr() { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
    function nextWeekday() {
        const d = new Date(); d.setHours(12);
        while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    }
    function deviceZone() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { return ''; } }
    function uses12h() { try { return !!new Intl.DateTimeFormat([], { hour: 'numeric' }).resolvedOptions().hour12; } catch (e) { return false; } }
    function fresh() {
        const dz = deviceZone();
        const first = dz && dz.indexOf('/') > 0 ? C.cityOfZone(dz) : '';
        return { people: [{ text: first, own: null }, { text: '', own: null }], date: nextWeekday(), duration: 60, hs: 540, he: 1020, h12: uses12h() };
    }
    function load() {
        const f = fresh();
        try {
            const s = JSON.parse(localStorage.getItem(KEY));
            if (s && Array.isArray(s.people) && s.people.length) {
                f.people = s.people.slice(0, 12).map(p => ({ text: String(p.text || ''), own: p.own && p.own.s < p.own.e ? { s: +p.own.s, e: +p.own.e } : null }));
                if (/^\d{4}-\d{2}-\d{2}$/.test(s.date) && s.date >= todayStr()) f.date = s.date;
                if ([30, 45, 60, 90, 120, 180].includes(+s.duration)) f.duration = +s.duration;
                if (s.hs < s.he) { f.hs = +s.hs; f.he = +s.he; }
                f.h12 = !!s.h12;
            }
        } catch (e) { /* no saved state */ }
        return f;
    }
    function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage unavailable */ } }
    function say(text, undo) {
        const m = $('msg'); m.textContent = text; clearTimeout(msgTimer);
        if (undo) { const b = document.createElement('button'); b.type = 'button'; b.textContent = 'Undo'; b.addEventListener('click', undo); m.appendChild(b); }
        else msgTimer = setTimeout(() => { m.textContent = ''; }, 3500);
    }

    // ---- inputs ----
    function timeOptions(sel, from, to, value) {
        sel.textContent = '';
        for (let m = from; m <= to; m += 30) {
            const o = document.createElement('option'); o.value = m;
            o.textContent = m === 1440 ? (state.h12 ? '12:00 am (end of day)' : '24:00') : C.fmtTime(m, state.h12);
            if (m === value) o.selected = true; sel.appendChild(o);
        }
    }
    function drawHours() { timeOptions($('hs'), 0, 1410, state.hs); timeOptions($('he'), 30, 1440, state.he); $('h12').textContent = state.h12 ? '24-hour clock' : '12-hour clock'; }

    function drawPeople() {
        const ul = $('people'); ul.textContent = '';
        state.people.forEach((p, i) => {
            const li = document.createElement('li'); li.className = 'person';
            const box = document.createElement('div'); box.className = 'city';
            const inp = document.createElement('input');
            inp.setAttribute('list', 'cities'); inp.setAttribute('aria-label', 'City ' + (i + 1)); inp.placeholder = 'City, for example London';
            inp.autocomplete = 'off'; inp.value = p.text;
            inp.addEventListener('input', () => { p.text = inp.value; state.pick = null; update(); });
            const meta = document.createElement('div'); meta.className = 'meta';
            box.append(inp, meta);
            if (p.own) {
                const own = document.createElement('div'); own.className = 'own';
                const a = document.createElement('select'), b = document.createElement('select');
                a.setAttribute('aria-label', 'Hours for city ' + (i + 1) + ' start'); b.setAttribute('aria-label', 'Hours for city ' + (i + 1) + ' end');
                timeOptions(a, 0, 1410, p.own.s); timeOptions(b, 30, 1440, p.own.e);
                const upd = () => { state.pick = null; p.own = { s: +a.value, e: +b.value }; update(); };
                a.addEventListener('change', upd); b.addEventListener('change', upd);
                own.append(a, b); box.appendChild(own);
            }
            const x = document.createElement('button'); x.type = 'button'; x.className = 'x'; x.textContent = '×'; x.setAttribute('aria-label', 'Remove city ' + (i + 1));
            x.addEventListener('click', () => { state.pick = null; state.people.splice(i, 1); if (!state.people.length) state.people.push({ text: '', own: null }); drawPeople(); update(); });
            li.append(box, x); ul.appendChild(li);
        });
        $('add').hidden = state.people.length >= 12;
    }

    // ---- result ----
    function dateText(dayNo) { const d = new Date(dayNo * 86400000); return C.DAYS[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()]; }
    function fmt(m) { return C.fmtTime(m, state.h12); }

    function update() {
        save();
        const metas = $('people').querySelectorAll('.meta');
        const people = [], err = [];
        state.people.forEach((p, i) => {
            const meta = metas[i]; meta.className = 'meta'; meta.textContent = '';
            const hit = C.findCity(p.text);
            if (!p.text.trim()) { addOwnButton(meta, p); return; }
            if (!hit) { meta.className = 'meta bad'; meta.textContent = '“' + p.text.trim() + '” is not a city we know. Pick one from the list.'; err.push(i); return; }
            people.push({ tz: hit.tz, label: hit.label, start: p.own ? p.own.s : state.hs, end: p.own ? p.own.e : state.he });
            meta.textContent = C.utcOffsetText(hit.tz, C.zonedToUtc(hit.tz, state.date, 720));
            addOwnButton(meta, p);
        });
        const errEl = $('error'); errEl.hidden = true;
        if (state.hs >= state.he) { errEl.textContent = 'The working day must end after it starts.'; errEl.hidden = false; }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(state.date)) { errEl.textContent = 'Pick the day of the meeting.'; errEl.hidden = false; }
        $('result').hidden = true; current = null;
        if (!errEl.hidden) return;
        if (people.length < 2) { if (!err.length) say(people.length ? 'Add a second city to see the best time.' : 'Add the cities to see the best time.'); return; }
        $('msg').textContent = '';
        render(people);
    }
    function addOwnButton(meta, p) {
        const b = document.createElement('button'); b.type = 'button';
        if (p.own) { b.textContent = 'Use the common hours'; b.addEventListener('click', () => { state.pick = null; p.own = null; drawPeople(); update(); }); }
        else { b.textContent = '+ Different hours (optional)'; b.addEventListener('click', () => { state.pick = null; p.own = { s: state.hs, e: state.he }; drawPeople(); update(); }); }
        meta.appendChild(b);
    }

    function render(people) {
        const plan = C.plan(people, state.date, state.duration);
        const home = people[0];
        const homeDay = C.dayNoOf(state.date);
        const ok = !!plan.best;
        let pick = ok ? plan.best : plan.fallback;
        if (ok && state.pick) { const hit = plan.valid.find(c => c.utc === state.pick); if (hit) pick = hit; }
        current = { people, plan, pick, ok };
        $('result').hidden = false;

        $('kicker').textContent = ok ? 'Best time to meet' : 'No time works for everyone';
        $('best').className = 'big' + (ok ? '' : ' warn');
        const hv = C.view(home, pick.utc, state.duration, homeDay);
        $('best').textContent = ok ? fmt(hv.from) + ' ' + home.label : 'Closest: ' + fmt(hv.from) + ' ' + home.label;
        const lenText = C.fmtLen(state.duration), lenWords = { 30: '30-minute', 45: '45-minute', 60: '1-hour', 90: '90-minute', 120: '2-hour', 180: '3-hour' }[state.duration];
        if (ok) {
            const r = plan.ranges.map(g => {
                const f = C.fmtTime(C.local(home.tz, g.from).minutes, state.h12), t = C.fmtTime(C.local(home.tz, g.to).minutes, state.h12);
                return g.to === g.from ? 'at ' + f : 'between ' + f + ' and ' + t;
            });
            $('lead').textContent = 'A ' + lenWords + ' meeting is inside everyone\u2019s hours if it starts ' + r.join(', or ') + ' ' + home.label + ' time. This start leaves the most room for everyone.';
        } else {
            $('lead').textContent = 'Between ' + fmt(state.hs) + ' and ' + fmt(state.he) + ' there is no ' + lenWords + ' slot where everyone is free. This is the closest, with the least time outside working hours. Widening the hours or leaving a city out may help.';
        }

        const table = $('table'); table.textContent = '';
        const lines = [];
        const weekend = [];
        people.forEach((p, i) => {
            const v = C.view(p, pick.utc, state.duration, homeDay);
            const li = document.createElement('li'); if (v.outside > 0) li.className = 'out';
            const name = document.createElement('span'); name.textContent = p.label;
            const time = document.createElement('b'); time.textContent = fmt(v.from) + ' – ' + fmt(v.to);
            const small = document.createElement('small');
            const when = C.dayText(v);
            small.textContent = v.outside > 0 ? when + ' · ' + C.fmtLen(v.outside) + ' outside working hours' : when + ' · inside working hours';
            li.append(name, time, small); table.appendChild(li);
            lines.push(p.label + ': ' + fmt(v.from) + ' – ' + fmt(v.to) + ' ' + when);
            if (v.dow === 0 || v.dow === 6) weekend.push(p.label + ' (' + C.DAYS[v.dow] + ')');
        });
        const notes = $('notes');
        notes.hidden = !weekend.length;
        notes.textContent = weekend.length ? 'Weekend for ' + weekend.join(', ') + '.' : '';

        // other starts
        const chips = $('chips'); chips.textContent = '';
        $('alt').hidden = !(ok && plan.valid.length > 1);
        if (ok) plan.valid.forEach(c => {
            const b = document.createElement('button'); b.type = 'button';
            b.textContent = fmt(C.local(home.tz, c.utc).minutes);
            b.setAttribute('aria-pressed', c.utc === pick.utc ? 'true' : 'false');
            b.addEventListener('click', () => { state.pick = c.utc; render(people); });
            chips.appendChild(b);
        });

        // hours strips over the home day
        $('strip-title').textContent = 'Working hours across ' + dateText(homeDay) + ' (' + home.label + ' time)';
        const strips = $('strips'); strips.textContent = '';
        const slots = plan.cands.length;
        const pickIdx = plan.cands.findIndex(c => c.utc === pick.utc), span = Math.ceil(state.duration / plan.step);
        people.forEach((p, pi) => {
            const wrap = document.createElement('div');
            const nm = document.createElement('div'); nm.className = 'strip-name'; nm.textContent = p.label;
            const strip = document.createElement('div'); strip.className = 'strip';
            for (let k = 0; k < slots; k++) {
                const i = document.createElement('i');
                const c = plan.cands[k];
                const inside = C.outsideMinutes(C.local(p.tz, c.utc).minutes, plan.step, p.start, p.end) === 0;
                if (inside) i.classList.add('on');
                if (k >= pickIdx && k < pickIdx + span) i.classList.add('pick');
                strip.appendChild(i);
            }
            wrap.append(nm, strip); strips.appendChild(wrap);
        });
        const ax = document.createElement('div'); ax.className = 'axis';
        [0, 6, 12, 18, 24].forEach(h => { const s = document.createElement('span'); s.textContent = state.h12 ? (h % 12 || 12) + (h % 24 < 12 || h === 24 ? (h === 24 ? ' am' : ' am') : ' pm') : pad(h % 24); ax.appendChild(s); });
        strips.appendChild(ax);

        // sharing
        const head = 'Proposed meeting (' + lenText + ', ' + dateText(homeDay) + ' ' + home.label + ' date)';
        current.text = head + '\n' + lines.join('\n') + (ok ? '' : '\nNote: this is the closest option, not everyone is inside working hours.');
        $('email').href = 'mailto:?subject=' + encodeURIComponent('Meeting ' + dateText(homeDay) + ' at ' + fmt(hv.from) + ' ' + home.label) + '&body=' + encodeURIComponent(current.text);
    }

    // ---- actions ----
    function copyText(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
        return new Promise((res, rej) => {
            const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select();
            try { document.execCommand('copy') ? res() : rej(); } catch (e) { rej(e); } t.remove();
        });
    }
    $('copy').addEventListener('click', () => { if (current) copyText(current.text).then(() => say('Copied. Paste it into a chat or email.'), () => say('Could not copy. Use Email instead.')); });
    $('cal').addEventListener('click', () => {
        if (!current) return;
        const ics = C.buildIcs(current.pick.utc, state.duration, current.text, Date.now());
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' })); a.download = 'meeting.ics';
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        say('Calendar file saved. Open it to add the meeting; everyone sees it in their own time zone.');
    });
    $('add').addEventListener('click', () => { state.people.push({ text: '', own: null }); drawPeople(); $('people').querySelectorAll('input')[state.people.length - 1].focus(); update(); });
    $('date').addEventListener('input', () => { state.date = $('date').value; state.pick = null; update(); });
    $('duration').addEventListener('change', () => { state.duration = +$('duration').value; state.pick = null; update(); });
    $('hs').addEventListener('change', () => { state.hs = +$('hs').value; state.pick = null; update(); });
    $('he').addEventListener('change', () => { state.he = +$('he').value; state.pick = null; update(); });
    $('h12').addEventListener('click', () => { state.h12 = !state.h12; drawHours(); drawPeople(); update(); });
    $('reset').addEventListener('click', () => {
        undoState = JSON.stringify(state); state = fresh(); fillInputs();
        say('Started a new meeting.', () => { state = JSON.parse(undoState); fillInputs(); say('Brought your meeting back.'); });
    });

    function fillInputs() {
        $('date').value = state.date; $('date').min = todayStr(); $('duration').value = String(state.duration);
        drawHours(); drawPeople(); update();
    }

    const dl = $('cities');
    C.cityNames().forEach(n => { const o = document.createElement('option'); o.value = n; dl.appendChild(o); });
    state = load();
    fillInputs();
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
