// Mood and Sleep Journal: the page. The maths and checks live in core.js.
(function () {
    const C = window.MoodCore;
    const KEY = 'mood-and-sleep-journal.state';
    const $ = id => document.getElementById(id);
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const URL_APP = 'https://umar8092.github.io/apps/mood-and-sleep-journal/';
    const NS = 'http://www.w3.org/2000/svg';

    // ---------- saved state
    let storageOk = true, state = load();
    function fresh() { return { entries: {}, tags: C.defaultTags(), helpline: '', period: '30', month: '', noteOpen: false, withNotes: false }; }
    function load() {
        let raw = null;
        try { raw = localStorage.getItem(KEY); } catch (e) { storageOk = false; }
        if (!raw) return fresh();
        try {
            const data = JSON.parse(raw), s = C.clean(data);
            if (!s) return fresh();
            s.noteOpen = data.noteOpen === true; s.withNotes = data.withNotes === true;
            return s;
        } catch (e) { return fresh(); }
    }
    function save() {
        try { localStorage.setItem(KEY, JSON.stringify(state)); storageOk = true; }
        catch (e) { storageOk = false; }
    }
    const snapshot = () => JSON.stringify(state);
    function restoreSnapshot(snap) {
        const data = JSON.parse(snap), s = C.clean(data);
        if (s) { s.noteOpen = data.noteOpen === true; s.withNotes = data.withNotes === true; state = s; save(); }
        loadDay(form.day); renderAll();
    }

    // ---------- dates and words
    const today = () => C.dayOf(new Date());
    const toDate = d => { const [y, m, dd] = d.split('-').map(Number); return new Date(y, m - 1, dd); };
    function fmtDay(d, year) {
        try { return toDate(d).toLocaleDateString(undefined, year ? { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' } : { weekday: 'short', day: 'numeric', month: 'short' }); }
        catch (e) { return d; }
    }
    const dayName = d => d === today() ? 'today' : d === C.addDays(today(), -1) ? 'yesterday' : fmtDay(d, d.slice(0, 4) !== today().slice(0, 4));
    const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
    const tagName = id => (state.tags.find(t => t.id === id) || {}).name || '';
    const avgText = v => v == null ? '-' : v.toFixed(1);

    // a face for each mood: the mouth goes from a frown (1) to a big smile (5)
    function face(m, size) {
        const s = document.createElementNS(NS, 'svg');
        s.setAttribute('viewBox', '0 0 40 40'); s.setAttribute('width', size); s.setAttribute('height', size); s.setAttribute('aria-hidden', 'true'); s.setAttribute('class', 'face m' + m);
        const add = (tag, a) => { const e = document.createElementNS(NS, tag); Object.keys(a).forEach(k => e.setAttribute(k, a[k])); s.appendChild(e); };
        add('circle', { cx: 20, cy: 20, r: 18, class: 'f-bg' });
        add('circle', { cx: 14, cy: 16, r: 2.4, class: 'f-ink' }); add('circle', { cx: 26, cy: 16, r: 2.4, class: 'f-ink' });
        const curve = { 1: -7, 2: -3.5, 3: 0, 4: 4, 5: 8 }[m];
        add('path', { d: 'M12 ' + (27 - curve / 2) + ' Q20 ' + (27 + curve) + ' 28 ' + (27 - curve / 2), class: 'f-mouth' });
        return s;
    }

    // ---------- the form for one day
    const form = { day: today(), mood: 0, tags: new Set() };
    const f = { sleep: $('sleep'), note: $('note'), bed: $('bed'), wake: $('wake'), day: $('day') };
    function renderMoods() {
        const box = $('moods'); box.textContent = '';
        [1, 2, 3, 4, 5].forEach(m => {
            const b = el('button', 'mood'); b.type = 'button'; b.dataset.mood = m;
            b.setAttribute('aria-pressed', String(form.mood === m));
            b.append(face(m, 40), el('span', null, C.MOODS[m]));
            b.addEventListener('click', () => { form.mood = m; $('mood-err').textContent = ''; renderMoodState(); });
            box.appendChild(b);
        });
    }
    function renderMoodState() { document.querySelectorAll('#moods .mood').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.mood === form.mood))); }
    function renderTagChips() {
        const box = $('tags'); box.textContent = '';
        state.tags.forEach(t => {
            const b = el('button', 'chip', t.name); b.type = 'button';
            b.setAttribute('aria-pressed', String(form.tags.has(t.id)));
            b.addEventListener('click', () => { form.tags.has(t.id) ? form.tags.delete(t.id) : form.tags.add(t.id); b.setAttribute('aria-pressed', String(form.tags.has(t.id))); });
            box.appendChild(b);
        });
        if (!state.tags.length) box.appendChild(el('p', 'hint', 'No tags. Add your own below.'));
    }
    // fill the form from the saved entry for that day, or empty it
    function loadDay(d) {
        form.day = d;
        const e = state.entries[d];
        form.mood = e ? e.m : 0; form.tags = new Set(e ? e.tags : []);
        f.sleep.value = e && e.s != null ? fmtSleepInput(e.s) : '';
        f.note.value = e ? e.note : '';
        if (e && e.note) openNote();
        f.bed.value = ''; f.wake.value = '';
        ['mood-err', 'sleep-err'].forEach(id => { $(id).textContent = ''; });
        f.sleep.setAttribute('aria-invalid', 'false');
        renderEntryHead(); renderMoodState(); renderTagChips();
    }
    const fmtSleepInput = m => Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0');
    function renderEntryHead() {
        const d = form.day, has = !!state.entries[d], t = today();
        $('entry-h').textContent = d === t ? 'How was today?' : 'How was ' + (d === C.addDays(t, -1) ? 'yesterday' : fmtDay(d)) + '?';
        $('for-text').textContent = (d === t ? 'today, ' : d === C.addDays(t, -1) ? 'yesterday, ' : '') + fmtDay(d, d.slice(0, 4) !== t.slice(0, 4)) + (has ? ' (already filled in)' : '');
        $('save').textContent = has ? 'Update ' + (d === t ? 'today' : fmtDay(d)) : d === t ? 'Save today' : 'Save ' + fmtDay(d);
        f.day.value = d; f.day.max = t;
        $('day-today').disabled = d === t;
    }
    $('day-prev').addEventListener('click', () => { loadDay(C.addDays(form.day, -1)); clearMsg($('entry-msg')); renderCalendar(); });
    $('day-today').addEventListener('click', () => { loadDay(today()); clearMsg($('entry-msg')); state.month = ''; renderCalendar(); });
    f.day.addEventListener('change', () => {
        const v = f.day.value;
        if (!C.validDay(v)) return;
        if (v > today()) { say($('entry-msg'), 'That day has not happened yet. Choose today or an earlier day.', { kind: 'bad' }); f.day.value = form.day; return; }
        loadDay(v); clearMsg($('entry-msg')); state.month = v.slice(0, 7); renderCalendar();
    });
    f.sleep.addEventListener('input', () => { $('sleep-err').textContent = ''; f.sleep.setAttribute('aria-invalid', 'false'); });
    f.sleep.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveDay(); } });
    $('times-open').addEventListener('click', () => { $('times-box').hidden = false; $('times-open').hidden = true; f.bed.focus(); });
    [f.bed, f.wake].forEach(i => i.addEventListener('change', () => {
        if (!f.bed.value || !f.wake.value) return;
        const r = C.sleepFromTimes(f.bed.value, f.wake.value);
        if (r.error) { $('sleep-err').textContent = r.error; return; }
        f.sleep.value = fmtSleepInput(r.minutes); $('sleep-err').textContent = ''; f.sleep.setAttribute('aria-invalid', 'false');
    }));
    function openNote() { $('note-box').hidden = false; $('note-open').hidden = true; if (!state.noteOpen) { state.noteOpen = true; save(); } }
    $('note-open').addEventListener('click', () => { openNote(); f.note.focus(); });
    $('tag-open').addEventListener('click', () => { $('tag-box').hidden = false; $('tag-open').hidden = true; $('tag-name').focus(); });
    function addTag() {
        const r = C.checkTag($('tag-name').value, state.tags);
        $('tag-err').textContent = r.error || '';
        $('tag-name').setAttribute('aria-invalid', r.error ? 'true' : 'false');
        if (r.error) return;
        const t = { id: C.newId(), name: r.name };
        state.tags.push(t); form.tags.add(t.id); save();
        $('tag-name').value = ''; renderTagChips(); renderTagList();
        say($('entry-msg'), 'Added the tag "' + t.name + '" and ticked it for this day. Tap Save to keep it on this day.');
    }
    $('tag-add').addEventListener('click', addTag);
    $('tag-name').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } });
    $('tag-name').addEventListener('input', () => { $('tag-err').textContent = ''; });

    function saveDay() {
        const box = $('entry-msg');
        $('mood-err').textContent = ''; $('sleep-err').textContent = '';
        const sl = C.parseSleep(f.sleep.value);
        let bad = false;
        if (!form.mood) { $('mood-err').textContent = 'Tap a face to choose your mood.'; bad = true; }
        if (sl.error) { $('sleep-err').textContent = sl.error; f.sleep.setAttribute('aria-invalid', 'true'); bad = true; }
        if (form.day > today()) { say(box, 'That day has not happened yet.', { kind: 'bad' }); return; }
        if (bad) { clearMsg(box); (!form.mood ? $('moods').firstChild : f.sleep).focus(); return; }
        const snap = snapshot(), d = form.day, had = !!state.entries[d];
        state.entries[d] = { m: form.mood, s: sl.minutes, tags: state.tags.filter(t => form.tags.has(t.id)).map(t => t.id), note: f.note.value.trim().slice(0, C.NOTE_MAX) };
        save();
        const e = state.entries[d];
        const bits = [C.MOODS[e.m]];
        if (e.s != null) bits.push('slept ' + C.fmtSleep(e.s));
        if (e.tags.length) bits.push(e.tags.map(tagName).join(', '));
        let extra = '';
        if (e.m <= 2) extra = 'Sorry it was a hard day. ' + (state.helpline ? 'Your help line: ' + state.helpline + '. ' : '') + 'If you feel unsafe or think about harming yourself, contact your local emergency number or a crisis line now, or tell someone you trust.';
        if (e.s != null && e.s < 180) extra = (extra ? extra + ' ' : '') + 'Under 3 hours of sleep: check that ' + f.sleep.value.trim() + ' is right.';
        if (!storageOk) extra = (extra ? extra + ' ' : '') + 'This browser is not letting the app save, so the journal will be lost when the page is closed.';
        state.month = d.slice(0, 7);
        renderAll(); renderEntryHead();
        const nm = dayName(d);
        say(box, (had ? 'Updated ' : 'Saved ') + nm + ': ' + bits.join('; ') + '.' + (had ? ' The earlier entry for this day was replaced.' : ''), { undo: snap, undoText: had ? 'The earlier entry is back.' : 'Entry removed.', kind: e.m <= 2 ? 'soft' : '', extra });
    }
    $('save').addEventListener('click', saveDay);

    // ---------- messages with Undo
    function say(box, text, opt) {
        const o = opt || {};
        box.textContent = ''; box.className = 'msg show' + (o.kind ? ' ' + o.kind : '');
        const p = el('p', null, text); box.appendChild(p);
        if (o.extra) box.appendChild(el('p', 'msg-extra', o.extra));
        if (o.undo) {
            const b = el('button', 'link inline undo', 'Undo'); b.type = 'button';
            b.addEventListener('click', () => { restoreSnapshot(o.undo); say(box, o.undoText || 'Undone.'); });
            p.appendChild(document.createTextNode(' ')); p.appendChild(b);
        }
    }
    const clearMsg = box => { box.textContent = ''; box.className = 'msg'; };

    // ---------- calendar
    function monthShown() { return state.month || form.day.slice(0, 7); }
    function renderCalendar() {
        const ym = monthShown(), [y, m] = ym.split('-').map(Number), grid = $('cal-grid');
        grid.textContent = '';
        try { $('cal-h').textContent = new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }); } catch (e) { $('cal-h').textContent = ym; }
        const first = new Date(y, m - 1, 1), offset = (first.getDay() + 6) % 7, days = new Date(y, m, 0).getDate(), t = today();
        for (let i = 0; i < 7; i++) {
            let w = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i];
            try { w = new Date(2024, 0, 1 + i).toLocaleDateString(undefined, { weekday: 'narrow' }); } catch (e) { /* keep */ }
            grid.appendChild(el('span', 'cal-w', w));
        }
        for (let i = 0; i < offset; i++) grid.appendChild(el('span', 'cal-pad'));
        let filled = 0;
        for (let d = 1; d <= days; d++) {
            const day = ym + '-' + String(d).padStart(2, '0'), e = state.entries[day];
            const b = el('button', 'cal-d' + (e ? ' m' + e.m : '') + (day === t ? ' today' : '') + (day === form.day ? ' sel' : ''), String(d)); b.type = 'button';
            b.setAttribute('aria-label', fmtDay(day, true) + ': ' + (e ? C.MOODS[e.m] + (e.s != null ? ', slept ' + C.fmtSleep(e.s) : '') : day > t ? 'in the future' : 'no entry'));
            if (day > t) b.disabled = true;
            else b.addEventListener('click', () => { loadDay(day); clearMsg($('entry-msg')); renderCalendar(); $('entry').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
            if (e) filled++;
            grid.appendChild(b);
        }
        $('cal-next').disabled = ym >= t.slice(0, 7);
        const key = $('cal-key'); key.textContent = '';
        [1, 2, 3, 4, 5].forEach(k => { const s = el('span', 'k'); s.append(el('i', 'sw m' + k), document.createTextNode(C.MOODS[k])); key.appendChild(s); });
        grid.setAttribute('aria-description', filled + ' days filled in');
    }
    function shiftMonth(n) { const [y, m] = monthShown().split('-').map(Number), d = new Date(y, m - 1 + n, 1); state.month = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); save(); renderCalendar(); }
    $('cal-prev').addEventListener('click', () => shiftMonth(-1));
    $('cal-next').addEventListener('click', () => shiftMonth(1));

    // ---------- summary
    function period() {
        const t = today();
        // days before the first entry ever are not counted as "left blank"
        const ks = Object.keys(state.entries).sort(), first = ks.length ? ks[0] : t;
        if (state.period === 'all') return { from: first, to: t };
        const from = C.addDays(t, -(Number(state.period) - 1));
        return { from: first > from && first <= t ? first : from, to: t };
    }
    function currentSummary() { const per = period(); return { per, s: C.summary(state.entries, { from: per.from, to: per.to, tags: state.tags }), list: C.inPeriod(state.entries, per.from, per.to) }; }
    $('period').addEventListener('change', () => { state.period = $('period').value; save(); renderSummary(); renderList(); renderShare(); });
    function effectLine(e) {
        if (e.withoutAvg == null) return { main: avgText(e.withAvg) + ' on all ' + plural(e.withN, 'day'), sub: 'Every day had this tag, so there is nothing to compare.' };
        return { main: avgText(e.withAvg) + ' with (' + plural(e.withN, 'day') + '), ' + avgText(e.withoutAvg) + ' without (' + plural(e.withoutN, 'day') + ')',
            sub: e.few ? 'Few days, so this may be chance.' : e.diff > 0 ? 'Days with it were better on average.' : e.diff < 0 ? 'Days with it were worse on average.' : 'No difference.' };
    }
    function renderSummary() {
        const { s } = currentSummary();
        $('period').value = state.period;
        const has = s.n > 0;
        $('sum-empty').hidden = has; $('sum-body').hidden = !has;
        if (!has) {
            $('sum-empty-text').textContent = Object.keys(state.entries).length ? 'No entries in these days. Choose more days above.' : 'Save today\'s mood above. After a week or two you will see what goes with your better days.';
            return;
        }
        $('t-mood').textContent = avgText(s.avg) + ' / 5'; $('t-mood-word').textContent = C.moodWord(s.avg);
        $('t-sleep').textContent = s.sleep == null ? 'none' : C.fmtSleep(s.sleep); $('t-sleep-n').textContent = s.sleep == null ? 'no sleep typed' : 'from ' + plural(s.sleepN, 'night');
        $('t-days').textContent = s.n + ' of ' + s.span; $('t-days-sub').textContent = s.n < s.span ? plural(s.span - s.n, 'day') + ' left blank' : 'none missed';
        $('t-low').textContent = String(s.lowDays);
        const ul = $('effects'); ul.textContent = '';
        s.byTag.forEach(e => {
            const li = el('li', 'eff'), line = effectLine(e);
            const top = el('div', 'eff-top'); top.appendChild(el('span', 'eff-name', e.name));
            if (e.diff != null) { const d = el('span', 'eff-diff ' + (e.diff > 0 ? 'up' : e.diff < 0 ? 'down' : 'flat') + (e.few ? ' few' : ''), (e.diff > 0 ? '+' : e.diff < 0 ? '−' : '±') + Math.abs(e.diff).toFixed(1)); d.setAttribute('aria-label', (e.diff > 0 ? 'plus ' : e.diff < 0 ? 'minus ' : '') + Math.abs(e.diff).toFixed(1)); top.appendChild(d); }
            li.append(top, el('span', 'eff-main', line.main), el('span', 'eff-sub', line.sub));
            ul.appendChild(li);
        });
        if (!s.byTag.length) ul.appendChild(el('li', 'eff none', 'No tags ticked in these days yet. Tick what happened when you save a day.'));
        const bl = $('bands'); bl.textContent = '';
        [['short', 'Under 6 hours'], ['mid', '6 to 7 hours'], ['long', '7 hours or more']].forEach(([k, label]) => {
            const b = s.sleepBands[k], li = el('li', 'eff');
            const top = el('div', 'eff-top'); top.append(el('span', 'eff-name', label), el('span', 'eff-val', b.n ? avgText(b.avg) + ' / 5' : '-'));
            li.append(top, el('span', 'eff-sub', b.n ? 'Average mood after ' + plural(b.n, 'night') + ' like this.' : 'No nights like this.'));
            bl.appendChild(li);
        });
        if (!s.sleepN) { bl.textContent = ''; bl.appendChild(el('li', 'eff none', 'Type your sleep when you save a day to see this.')); }
    }

    // ---------- list of days
    function renderList() {
        const { list } = currentSummary(), ul = $('days');
        ul.textContent = '';
        $('list-h').textContent = list.length ? 'Your days (' + list.length + ')' : 'Your days';
        $('list-hint').textContent = list.length ? 'The days chosen above, newest first.' : Object.keys(state.entries).length ? 'No entries in the days chosen above.' : 'Your days will appear here.';
        list.slice().reverse().forEach(e => {
            const li = el('li', 'dy m' + e.m);
            const main = el('div', 'dy-main');
            const head = el('div', 'dy-head');
            head.append(face(e.m, 28), el('span', 'dy-date', fmtDay(e.day, e.day.slice(0, 4) !== today().slice(0, 4))), el('span', 'dy-mood', C.MOODS[e.m]));
            if (e.s != null) head.appendChild(el('span', 'dy-sleep', 'slept ' + C.fmtSleep(e.s)));
            main.appendChild(head);
            if (e.tags.length) main.appendChild(el('span', 'dy-tags', e.tags.map(tagName).join(', ')));
            if (e.note) main.appendChild(el('span', 'dy-note', e.note));
            const btns = el('div', 'dy-btns');
            const eb = el('button', 'secondary small', 'Edit'); eb.type = 'button'; eb.setAttribute('aria-label', 'Edit ' + fmtDay(e.day, true));
            const db = el('button', 'secondary small', 'Delete'); db.type = 'button'; db.setAttribute('aria-label', 'Delete ' + fmtDay(e.day, true));
            eb.addEventListener('click', () => { loadDay(e.day); state.month = e.day.slice(0, 7); renderCalendar(); clearMsg($('entry-msg')); $('entry').scrollIntoView({ behavior: 'smooth', block: 'start' }); $('moods').firstChild.focus({ preventScroll: true }); });
            db.addEventListener('click', () => {
                const snap = snapshot(); delete state.entries[e.day]; save();
                if (form.day === e.day) loadDay(e.day);
                renderAll();
                say($('list-msg'), 'Deleted ' + fmtDay(e.day, true) + '.', { undo: snap, undoText: 'The day is back.' });
            });
            btns.append(eb, db);
            li.append(main, btns);
            ul.appendChild(li);
        });
    }

    // ---------- share
    function reportLines() {
        const { per, s, list } = currentSummary(), notes = state.withNotes;
        const head = ['Mood and sleep journal'];
        if (!s.n) return { head: head.concat(['No entries from ' + fmtDay(per.from, true) + ' to ' + fmtDay(per.to, true) + '.']), rows: [], s, list };
        head.push(fmtDay(per.from, true) + ' to ' + fmtDay(per.to, true) + ': ' + s.n + ' of ' + plural(s.span, 'day') + ' filled in');
        head.push('Average mood: ' + avgText(s.avg) + ' out of 5 (' + C.moodWord(s.avg) + '). Low or Very low days: ' + s.lowDays + '.');
        head.push('Average sleep: ' + (s.sleep == null ? 'not recorded' : C.fmtSleep(s.sleep) + ' over ' + plural(s.sleepN, 'night')));
        head.push('Days by mood: ' + [5, 4, 3, 2, 1].map(k => C.MOODS[k] + ' ' + s.counts[k]).join(', '));
        if (s.byTag.length) {
            head.push('Average mood with and without each tag:');
            s.byTag.forEach(e => head.push('  ' + e.name + ': ' + effectLine(e).main + (e.diff != null ? ' (' + (e.diff > 0 ? '+' : '') + e.diff.toFixed(1) + ')' : '') + (e.few ? ', few days' : '')));
        }
        const b = s.sleepBands;
        if (s.sleepN) head.push('Mood after under 6 h: ' + (b.short.n ? avgText(b.short.avg) + ' (' + plural(b.short.n, 'night') + ')' : '-') + '; 6 to 7 h: ' + (b.mid.n ? avgText(b.mid.avg) + ' (' + plural(b.mid.n, 'night') + ')' : '-') + '; 7 h or more: ' + (b.long.n ? avgText(b.long.avg) + ' (' + plural(b.long.n, 'night') + ')' : '-'));
        const rows = list.slice().reverse().map(e => fmtDay(e.day, true) + ': ' + e.m + ' ' + C.MOODS[e.m] + (e.s != null ? ', slept ' + C.fmtSleep(e.s) : '') + (e.tags.length ? ', ' + e.tags.map(tagName).join(', ') : '') + (notes && e.note ? ' - ' + e.note.replace(/\s+/g, ' ') : ''));
        return { head, rows, s, list };
    }
    function reportText(maxLen) {
        const { head, rows } = reportLines();
        const tail = ['', 'Made with Mood and Sleep Journal: ' + URL_APP];
        let body = head.concat(rows.length ? ['', 'Days:'] : [], rows);
        if (maxLen) {
            const short = ['', '(Only the newest days fit in an email. Use Print or Download spreadsheet for all of them.)'];
            while (body.length > head.length + 2 && encodeURIComponent(body.concat(short, tail).join('\n')).length > maxLen) body.pop();
            if (body.length - head.length - 2 < rows.length) body = body.concat(short);
        }
        return body.concat(tail).join('\n');
    }
    $('with-notes').addEventListener('change', () => { state.withNotes = $('with-notes').checked; save(); renderShare(); });
    $('copy').addEventListener('click', () => {
        const text = reportText();
        const done = () => say($('share-msg'), 'Copied. Paste it into a message or email.' + (state.withNotes ? '' : ' Notes were left out.'));
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
        else fallbackCopy(text, done);
    });
    function fallbackCopy(text, done) {
        const t = el('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
        document.body.appendChild(t); t.select();
        let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
        t.remove();
        if (ok) done(); else say($('share-msg'), 'This browser blocked copying. Use Email or Print instead.', { kind: 'bad' });
    }
    function setMailLink() {
        const { list } = currentSummary(), a = $('email');
        if (!list.length) { a.removeAttribute('href'); a.setAttribute('aria-disabled', 'true'); return; }
        a.removeAttribute('aria-disabled');
        a.href = 'mailto:?subject=' + encodeURIComponent('Mood and sleep journal') + '&body=' + encodeURIComponent(reportText(1800));
    }
    $('email').addEventListener('click', e => {
        if (!$('email').hasAttribute('href')) { e.preventDefault(); return; }
        setMailLink();
        say($('share-msg'), 'Your mail app should open with the summary. Type the address there.');
    });
    function buildReport() {
        const { head, s, list } = reportLines(), rep = $('report');
        rep.textContent = '';
        rep.appendChild(el('h2', null, head[0]));
        head.slice(1).forEach(line => rep.appendChild(el('p', null, line)));
        if (!s.n) return;
        const table = el('table'), tr = el('tr');
        ['Date', 'Mood', 'Sleep', 'Tags'].concat(state.withNotes ? ['Note'] : []).forEach(h => tr.appendChild(el('th', null, h)));
        const thead = el('thead'); thead.appendChild(tr); table.appendChild(thead);
        const tb = el('tbody');
        list.forEach(e => {
            const row = el('tr');
            [fmtDay(e.day, true), e.m + ' ' + C.MOODS[e.m], e.s == null ? '' : C.fmtSleep(e.s), e.tags.map(tagName).join(', ')].concat(state.withNotes ? [e.note] : []).forEach(v => row.appendChild(el('td', null, v)));
            tb.appendChild(row);
        });
        table.appendChild(tb); rep.appendChild(table);
        rep.appendChild(el('p', 'r-foot', 'Mood: 1 Very low, 2 Low, 3 Okay, 4 Good, 5 Very good. Made with Mood and Sleep Journal, ' + URL_APP));
    }
    $('print').addEventListener('click', () => { buildReport(); window.print(); });
    window.addEventListener('beforeprint', buildReport);
    function download(fname, text, type) {
        const a = el('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = fname;
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }
    $('csv').addEventListener('click', () => {
        const { per, list } = currentSummary();
        if (!list.length) { say($('share-msg'), 'There are no entries in the days chosen above.', { kind: 'bad' }); return; }
        const sub = {}; list.forEach(e => { sub[e.day] = Object.assign({}, state.entries[e.day], state.withNotes ? {} : { note: '' }); });
        download('mood-and-sleep-' + list[0].day + '-to-' + list[list.length - 1].day + '.csv', '﻿' + C.csv(sub, state.tags), 'text/csv');
        say($('share-msg'), 'Spreadsheet saved with ' + plural(list.length, 'day') + '.' + (state.withNotes ? '' : ' Notes were left out.'));
    });

    // ---------- settings
    $('help-open').addEventListener('click', () => { $('helpline-box').hidden = false; $('help-open').hidden = true; $('helpline').focus(); });
    $('helpline').addEventListener('input', () => { state.helpline = C.cleanText($('helpline').value, C.HELP_MAX); save(); });
    function renderTagList() {
        const ul = $('tag-list'); ul.textContent = '';
        state.tags.forEach(t => {
            const li = el('li', 'tl');
            const used = Object.values(state.entries).filter(e => e.tags.includes(t.id)).length;
            li.append(el('span', 'tl-name', t.name), el('span', 'tl-n', used ? 'on ' + plural(used, 'day') : 'not used'));
            const b = el('button', 'secondary small', 'Remove'); b.type = 'button'; b.setAttribute('aria-label', 'Remove the tag ' + t.name);
            b.addEventListener('click', () => {
                const snap = snapshot();
                state.tags = state.tags.filter(x => x.id !== t.id);
                Object.values(state.entries).forEach(e => { e.tags = e.tags.filter(x => x !== t.id); });
                form.tags.delete(t.id); save(); renderAll(); renderTagChips();
                say($('set-msg'), 'Removed the tag "' + t.name + '"' + (used ? ' from ' + plural(used, 'day') : '') + '.', { undo: snap, undoText: 'The tag is back.' });
            });
            li.appendChild(b);
            ul.appendChild(li);
        });
        if (!state.tags.length) ul.appendChild(el('li', 'tl none', 'No tags. Add your own under "What happened?".'));
    }
    $('wipe').addEventListener('click', () => {
        const n = Object.keys(state.entries).length; if (!n) return;
        const snap = snapshot(); state.entries = {}; save(); loadDay(form.day); renderAll();
        say($('set-msg'), 'Deleted ' + plural(n, 'day') + ' from the journal.', { undo: snap, undoText: 'The journal is back.' });
    });
    $('backup').addEventListener('click', () => {
        download('mood-journal-backup-' + today() + '.json', JSON.stringify({ app: 'mood-and-sleep-journal', saved: today(), ...state }, null, 1), 'application/json');
        say($('set-msg'), 'Backup saved with ' + plural(Object.keys(state.entries).length, 'day') + '. It includes your notes, so keep the file somewhere private.');
    });
    $('restore').addEventListener('click', () => $('restore-file').click());
    $('restore-file').addEventListener('change', () => {
        const file = $('restore-file').files[0]; $('restore-file').value = '';
        if (!file) return;
        if (file.size > 10e6) { say($('set-msg'), 'That file is too big to be a backup from this app.', { kind: 'bad' }); return; }
        file.text().then(text => {
            let data = null; try { data = C.clean(JSON.parse(text)); } catch (e) { data = null; }
            if (!data) { say($('set-msg'), 'That file is not a backup from this app, so nothing was changed.', { kind: 'bad' }); return; }
            const snap = snapshot();
            data.noteOpen = state.noteOpen; data.withNotes = state.withNotes; state = data; save(); loadDay(form.day); renderAll();
            say($('set-msg'), 'Backup restored: ' + plural(Object.keys(state.entries).length, 'day') + ', ' + plural(state.tags.length, 'tag') + '.', { undo: snap, undoText: 'Back to how it was before the restore.' });
        }).catch(() => say($('set-msg'), 'That file could not be read.', { kind: 'bad' }));
    });

    // ---------- draw everything
    function renderSettings() {
        if (document.activeElement !== $('helpline')) $('helpline').value = state.helpline;
        if (state.helpline) { $('helpline-box').hidden = false; $('help-open').hidden = true; }
        $('wipe').disabled = !Object.keys(state.entries).length;
        if (state.noteOpen) { $('note-box').hidden = false; $('note-open').hidden = true; }
        renderTagList();
    }
    function renderShare() {
        const { list } = currentSummary();
        ['print', 'copy', 'csv'].forEach(id => { $(id).disabled = !list.length; });
        $('with-notes').checked = state.withNotes;
        setMailLink();
        $('share-hint').textContent = list.length ? 'Uses the days chosen above. Notes are left out unless you tick the box.' : 'Fill in some days first. Sharing uses the days chosen above.';
    }
    function renderAll() { renderCalendar(); renderSummary(); renderShare(); renderList(); renderSettings(); renderEntryHead(); }
    renderMoods(); loadDay(today()); renderAll();
    if (!storageOk) say($('entry-msg'), 'This browser is not letting the app save (private mode or blocked storage). The journal will be lost when the page is closed.', { kind: 'bad' });

    // a new day at midnight moves "today" on, unless the person is part-way through filling in a day
    let lastDay = today();
    setInterval(() => { const t = today(); if (t !== lastDay) { const wasToday = form.day === lastDay; lastDay = t; if (wasToday && !form.mood && !f.sleep.value && !f.note.value) loadDay(t); renderAll(); } }, 30000);

    if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
