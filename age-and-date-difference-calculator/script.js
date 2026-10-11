// Page code for Age and Date Difference Calculator. The date maths lives in core.js (DateCore).
(function () {
    const C = window.DateCore, KEY = 'age-and-date-difference-calculator.state';
    const $ = id => document.getElementById(id);
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const newId = () => 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const P = C.parseISO, D = C.fmtDate;

    let state = load(), canSave = true, today = C.today(), answer = null, editingId = null;

    function load() {
        try { const raw = localStorage.getItem(KEY); return C.clean(raw ? JSON.parse(raw) : null); } catch (e) { return C.clean(null); }
    }
    function save() {
        try { localStorage.setItem(KEY, JSON.stringify(state)); }
        catch (e) { if (canSave) { canSave = false; say($('tools-msg'), 'This browser is not saving your dates (private mode or storage blocked). They work until you close the page.'); } }
    }
    const copyOf = o => JSON.parse(JSON.stringify(o));
    function say(box, text, undo) {
        box.textContent = text;
        if (undo) {
            const b = el('button', null, 'Undo'); b.type = 'button';
            b.addEventListener('click', () => { undo(); box.textContent = ''; });
            box.appendChild(b);
        }
    }
    const isoToday = () => C.toISO(today);

    // ---------- tabs
    const MODES = ['age', 'between', 'add'];
    function setMode(m, focus) {
        state.mode = m;
        MODES.forEach(x => {
            const t = $('tab-' + x), on = x === m;
            t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1;
            $('panel-' + x).hidden = !on;
        });
        $('workdays-box').hidden = m === 'age';
        if (focus) $('tab-' + m).focus();
        ['clear-msg', 'save-msg'].forEach(id => { $(id).textContent = ''; });
        closeSave(); save(); compute();
    }
    document.querySelectorAll('[role=tab]').forEach(t => {
        t.addEventListener('click', () => setMode(t.dataset.mode));
        t.addEventListener('keydown', e => {
            const i = MODES.indexOf(t.dataset.mode);
            let j = null;
            if (e.key === 'ArrowRight') j = (i + 1) % 3; else if (e.key === 'ArrowLeft') j = (i + 2) % 3; else if (e.key === 'Home') j = 0; else if (e.key === 'End') j = 2;
            if (j != null) { e.preventDefault(); setMode(MODES[j], true); }
        });
    });

    // ---------- fill the form from the saved state
    function fill() {
        $('birth').value = state.birth; $('age-on').value = state.ageOn || isoToday();
        document.querySelectorAll('input[name=rule]').forEach(i => { i.checked = i.value === state.rule; });
        $('from').value = state.from; $('to').value = state.to; $('include-end').checked = state.includeEnd;
        $('start').value = state.start || isoToday();
        document.querySelectorAll('input[name=sign]').forEach(i => { i.checked = Number(i.value) === state.sign; });
        $('amount').value = state.amount; $('unit').value = state.unit;
        renderWeekend(); renderHols();
    }
    // read every field into the state (blank or broken dates are kept as blank)
    function read() {
        const v = id => { const s = $(id).value; return P(s) != null ? s : ''; };
        state.birth = v('birth');
        // "Age on" is stored only when it is not today, so tomorrow it is still today
        const on = v('age-on'); state.ageOn = on && on !== isoToday() ? on : '';
        state.rule = (document.querySelector('input[name=rule]:checked') || {}).value === 'next' ? 'next' : 'last';
        state.from = v('from'); state.to = v('to'); state.includeEnd = $('include-end').checked;
        const st = v('start'); state.start = st && st !== isoToday() ? st : '';
        state.sign = (document.querySelector('input[name=sign]:checked') || {}).value === '-1' ? -1 : 1;
        state.amount = C.cleanText($('amount').value, 12); state.unit = $('unit').value in C.LIMITS ? $('unit').value : 'days';
    }
    // a date field: '' when empty, null when something is typed but it is not a whole date
    function dateOf(id) {
        const i = $(id), s = i.value;
        if (s) return P(s);
        return i.validity && i.validity.badInput ? null : '';
    }

    // ---------- the answer
    function setAnswer(a) {
        answer = a;
        const big = $('r-big'), facts = $('r-facts');
        $('res-label').textContent = a ? a.label : 'Answer';
        big.textContent = a ? a.big : promptText();
        big.className = 'big' + (a ? (a.bigDate ? ' date' : '') : ' none');
        $('r-line').textContent = a ? a.line : '';
        facts.textContent = '';
        (a ? a.facts : []).forEach(f => { facts.appendChild(el('dt', null, f[0])); facts.appendChild(el('dd', null, f[1])); });
        $('r-note').hidden = !(a && a.note); $('r-note').textContent = a && a.note ? a.note : '';
        $('save-box').hidden = !(a && a.save);
        if (a && a.save) $('open-save').textContent = a.save.button;
        if (!(a && a.save)) closeSave();
        $('tools').hidden = !a;
        $('mail').href = 'mailto:?subject=' + encodeURIComponent(a ? a.label + ': ' + a.big : 'Date answer') + '&body=' + encodeURIComponent(a ? text() : '');
        document.body.classList.toggle('has-answer', !!a);
    }
    function promptText() {
        return state.mode === 'age' ? 'Type a date of birth' : state.mode === 'between' ? 'Type two dates' : 'Type how many to add';
    }
    function text() {
        if (!answer) return '';
        return [answer.label + ': ' + answer.big, answer.line].concat(answer.facts.map(f => f[0] + ': ' + f[1])).concat(answer.note ? [answer.note] : [])
            .filter(Boolean).join('\n') + '\n\nAge and Date Difference Calculator: https://umar8092.github.io/apps/age-and-date-difference-calculator/';
    }
    const weekendWords = w => {
        const work = [0, 1, 2, 3, 4, 5, 6].filter(d => w.indexOf(d) < 0);
        const names = work.map(d => C.DAY_NAMES[d]);
        // a run of days in a row (Monday to Friday, Sunday to Thursday) reads better as "X to Y"
        const run = work.length > 2 && work.every((d, i) => i === 0 || d === work[i - 1] + 1);
        if (run) return C.DAY_NAMES[work[0]] + ' to ' + C.DAY_NAMES[work[work.length - 1]];
        if (w.length === 2 && w.indexOf(5) >= 0 && w.indexOf(6) >= 0) return 'Sunday to Thursday';
        return names.length > 2 ? names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] : names.join(' and ');
    };
    const holidaysDays = () => state.holidays.map(P);

    function compute() {
        read();
        ['age-err', 'between-err', 'add-err'].forEach(id => { $(id).textContent = ''; });
        $('feb29-box').hidden = !(P(state.birth) != null && C.isFeb29(P(state.birth)));
        updateChips();
        let a = null;
        if (state.mode === 'age') a = ageAnswer();
        else if (state.mode === 'between') a = betweenAnswer();
        else a = addAnswer();
        setAnswer(a);
        save();
    }

    function ageAnswer() {
        const b = dateOf('birth'), on = dateOf('age-on');
        if (b === '') return null;
        if (b === null) { $('age-err').textContent = 'Type the whole date of birth: day, month and year.'; return null; }
        if (on === '' || on === null) { $('age-err').textContent = 'Type the date to work out the age on, or tap Today.'; return null; }
        const r = C.age(b, on, state.rule);
        if (r.err) { $('age-err').textContent = on === today ? 'That date of birth is in the future. Check the year.' : 'The date of birth is after the "Age on" date.'; return null; }
        const isToday = on === today;
        const facts = [];
        if (r.totalMonths) facts.push(['In months', C.plural(r.totalMonths, 'month') + (r.days ? ' and ' + C.plural(r.days, 'day') : '')]);
        if (r.totalDays >= 7) facts.push(['In weeks', C.weeksText(r.totalDays)]);
        facts.push(['In days', C.plural(r.totalDays, 'day')], ['Born on a', r.bornDay]);
        const nextLabel = isToday ? 'Next birthday' : 'Next birthday after that date';
        const nb = r.next.date <= C.MAX_DAY ? 'Turns ' + C.fmtNum(r.next.turning) + ' on ' + D(r.next.date) + ', ' + C.inDaysText(r.next.inDays) +
            (r.next.inDays >= 14 ? ' (' + C.ymdText(r.next.wait) + ')' : '') : '';
        if (nb) facts.push([nextLabel, nb]);
        let line = (isToday ? 'Today' : 'On ' + D(on)) + ' ' + (isToday ? 'you are' : 'the age is') + ' ' + C.ymdText(r) + (r.bornToday ? '' : ' old') + '.';
        if (r.bornToday) line = 'Born today. Welcome to the world!';
        else if (r.birthdayToday) line = (isToday ? 'Happy birthday! Exactly ' : 'A birthday: exactly ') + C.plural(r.years, 'year') + ' old ' + (isToday ? 'today' : 'on ' + D(on)) + '.';
        const note = r.feb29 ? 'Born on 29 February: in years without it the birthday counts on ' + (r.rule === 'next' ? '1 March' : '28 February') + '.' : '';
        return { label: isToday ? 'Age today' : 'Age on ' + D(on), big: C.plural(r.years, 'year'), line, facts, note,
            save: { button: 'Save this birthday to My dates', kind: 'birthday', date: b, placeholder: "e.g. My birthday" } };
    }

    function betweenAnswer() {
        const a = dateOf('from'), b = dateOf('to');
        if (a === '' && b === '') return null;
        if (a === null || b === null) { $('between-err').textContent = 'Type the whole date: day, month and year.'; return null; }
        if (a === '' || b === '') { $('between-err').textContent = a === '' ? 'Now type the From date, or tap From today.' : 'Now type the To date, or tap To today.'; return null; }
        const r = C.between(a, b, { includeEnd: state.includeEnd, weekend: state.weekend, holidays: holidaysDays() });
        const facts = [];
        if (r.days >= 28 || r.ymd.years) facts.push(['In months', C.ymdText(r.ymd)]);
        if (r.days >= 7) facts.push(['In weeks', C.weeksText(r.days)]);
        if (r.days > 0) facts.push(['Working days', C.fmtNum(r.workdays) + ' (' + weekendWords(r.weekend) + (r.holidaysSkipped ? ', not counting ' + C.plural(r.holidaysSkipped, 'day') + ' off' : '') + ')']);
        if (r.days > 0) facts.push(['Days counted', r.days === 1 ? D(r.firstCounted) : D(r.firstCounted) + ' to ' + D(r.lastCounted)]);
        let line;
        if (r.days === 0) line = 'Both dates are the same day. Tick "Count the end date too" to count it as 1 day.';
        else line = 'From ' + D(r.from) + ' to ' + D(r.to) + (state.includeEnd ? ', counting both dates.' : ', not counting the end date.');
        const note = r.swapped ? 'The To date is before the From date, so this counts back from ' + D(r.to) + ' to ' + D(r.from) + '.' : '';
        const fut = b;   // the To date, when it is still to come
        return { label: 'Days between the dates', big: C.plural(r.days, 'day'), line, facts, note,
            save: fut >= today ? { button: 'Save ' + D(fut) + ' to My dates', kind: 'event', date: fut, placeholder: 'e.g. Wedding day' } : null };
    }

    function addAnswer() {
        const s = dateOf('start');
        if (s === null || s === '') { $('add-err').textContent = s === null ? 'Type the whole start date: day, month and year.' : 'Type the start date, or tap Today.'; return null; }
        const unit = state.unit, p = C.parseAmount(state.amount, unit);
        if (p.err === 'blank') return null;
        if (p.err) {
            $('add-err').textContent = p.err === 'negative' ? 'Type the number without a minus sign, and pick Subtract (earlier).'
                : p.err === 'whole' ? 'Type a whole number, like 30.' : p.err === 'big' ? 'That is too many. The most is ' + C.fmtNum(p.max) + ' ' + unitWord(unit, p.max) + '.' : 'Type a number, like 30.';
            return null;
        }
        const r = C.addAmount(s, p.n, unit, state.sign, { weekend: state.weekend, holidays: holidaysDays() });
        if (r.err) { $('add-err').textContent = 'That goes past the years ' + C.MIN_YEAR + ' to ' + C.MAX_YEAR + ' this app works with.'; return null; }
        const amount = C.fmtNum(p.n) + ' ' + unitWord(unit, p.n);
        const line = amount + ' ' + (state.sign > 0 ? 'after ' : 'before ') + D(s) + ' is ' + C.DAY_NAMES[C.weekday(r.date)] + '.';
        const facts = [];
        if (s !== today) facts.push(['From today', C.inDaysText(r.date - today).replace(/^./, c => c.toUpperCase())]);
        else if (unit !== 'days') facts.push(['From today', C.inDaysText(r.date - today).replace(/^./, c => c.toUpperCase())]);
        if (unit === 'workdays') facts.push(['Working days', weekendWords(state.weekend) + (r.holidaysSkipped ? ', skipping ' + C.plural(r.holidaysSkipped, 'day') + ' off' : '') + '. The start date is not counted.']);
        const span = Math.abs(r.date - s);
        if (unit !== 'days' && span) facts.push(['In days', C.plural(span, 'day')]);
        let note = '';
        if (r.moved) {
            const m = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][C.fromDay(r.date).m - 1];
            note = r.wanted.d + ' ' + m + ' ' + r.wanted.y + ' does not exist, so this is the last day of ' + m + '.';
        }
        return { label: state.sign > 0 ? 'The date after' : 'The date before', big: D(r.date), bigDate: true, line, facts, note,
            save: r.date >= today ? { button: 'Save ' + D(r.date) + ' to My dates', kind: 'event', date: r.date, placeholder: 'e.g. Visa runs out' } : null };
    }
    function unitWord(u, n) { const w = { days: ['day', 'days'], weeks: ['week', 'weeks'], months: ['month', 'months'], years: ['year', 'years'], workdays: ['working day', 'working days'] }[u]; return n === 1 ? w[0] : w[1]; }

    // highlight the quick pick that matches
    function updateChips() {
        document.querySelectorAll('#amount-chips .chip').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.a === state.amount.replace(/[\s,]/g, '') && b.dataset.u === state.unit)));
    }

    // ---------- inputs
    ['birth', 'age-on', 'from', 'to', 'start', 'amount', 'unit', 'include-end'].forEach(id => {
        $(id).addEventListener('input', compute); $(id).addEventListener('change', compute);
    });
    document.querySelectorAll('input[name=sign]').forEach(i => i.addEventListener('change', compute));
    // the 29 February choice also moves saved birthdays on 29 February
    document.querySelectorAll('input[name=rule]').forEach(i => i.addEventListener('change', () => { compute(); renderSaved(); }));
    document.querySelectorAll('form.panel').forEach(f => f.addEventListener('submit', e => { e.preventDefault(); compute(); }));
    $('age-on-today').addEventListener('click', () => { $('age-on').value = isoToday(); compute(); });
    $('start-today').addEventListener('click', () => { $('start').value = isoToday(); compute(); });
    $('from-today').addEventListener('click', () => { $('from').value = isoToday(); compute(); });
    $('to-today').addEventListener('click', () => { $('to').value = isoToday(); compute(); });
    $('swap').addEventListener('click', () => { const f = $('from').value; $('from').value = $('to').value; $('to').value = f; compute(); });
    document.querySelectorAll('#amount-chips .chip').forEach(b => b.addEventListener('click', () => { $('amount').value = b.dataset.a; $('unit').value = b.dataset.u; compute(); }));

    $('clear').addEventListener('click', () => {
        const before = copyOf(state), m = state.mode;
        if (m === 'age') { $('birth').value = ''; $('age-on').value = isoToday(); }
        else if (m === 'between') { $('from').value = ''; $('to').value = ''; $('include-end').checked = false; }
        else { $('start').value = isoToday(); $('amount').value = ''; $('unit').value = 'days'; document.querySelector('input[name=sign][value="1"]').checked = true; }
        compute();
        say($('clear-msg'), 'Cleared.', () => { state = Object.assign(state, pick(before)); fill(); compute(); });
    });
    // only the form fields, so Undo of Start over never brings back deleted saved dates
    const pick = s => ({ birth: s.birth, ageOn: s.ageOn, rule: s.rule, from: s.from, to: s.to, includeEnd: s.includeEnd, start: s.start, amount: s.amount, unit: s.unit, sign: s.sign });

    // ---------- working days settings
    const ORDER = [1, 2, 3, 4, 5, 6, 0];
    function renderWeekend() {
        const box = $('weekend'); box.textContent = '';
        ORDER.forEach(d => {
            const l = el('label'), i = el('input'); i.type = 'checkbox'; i.value = d; i.checked = state.weekend.indexOf(d) >= 0;
            i.addEventListener('change', () => {
                const w = [...box.querySelectorAll('input:checked')].map(x => Number(x.value));
                if (w.length === 7) { i.checked = false; $('weekend-err').textContent = 'At least one day must be a working day.'; return; }
                $('weekend-err').textContent = '';
                state.weekend = C.cleanWeekend(w); wdSummary(); save(); compute();
            });
            l.appendChild(i); l.appendChild(document.createTextNode(' ' + C.DAY_SHORT[d])); box.appendChild(l);
        });
        wdSummary();
    }
    function wdSummary() { $('wd-summary').textContent = weekendWords(state.weekend) + (state.holidays.length ? ' + ' + C.plural(state.holidays.length, 'day') + ' off' : ''); }
    function renderHols() {
        const ul = $('hols'); ul.textContent = '';
        state.holidays.forEach(h => {
            const li = el('li', 'hol'); li.appendChild(el('span', null, D(P(h))));
            const b = el('button', null, 'Remove'); b.type = 'button'; b.setAttribute('aria-label', 'Remove ' + D(P(h)));
            b.addEventListener('click', () => {
                const before = state.holidays.slice();
                state.holidays = state.holidays.filter(x => x !== h); save(); renderHols(); compute();
                say($('hol-msg'), 'Removed ' + D(P(h)) + '.', () => { state.holidays = before; save(); renderHols(); compute(); });
            });
            li.appendChild(b); ul.appendChild(li);
        });
        wdSummary();
    }
    $('hol-add').addEventListener('click', () => {
        const d = dateOf('hol-date'); $('hol-err').textContent = ''; $('hol-msg').textContent = '';
        if (d === '' || d === null) { $('hol-err').textContent = 'Pick the date of the day off first.'; return; }
        const iso = C.toISO(d);
        if (state.holidays.indexOf(iso) >= 0) { $('hol-err').textContent = D(d) + ' is already on the list.'; return; }
        if (state.holidays.length >= C.MAX_HOLIDAYS) { $('hol-err').textContent = 'The list is full (' + C.MAX_HOLIDAYS + ' days). Remove old ones first.'; return; }
        state.holidays = state.holidays.concat(iso).sort(); $('hol-date').value = '';
        save(); renderHols(); compute();
        say($('hol-msg'), 'Added ' + D(d) + (state.weekend.indexOf(C.weekday(d)) >= 0 ? '. It is already a weekly day off, so it changes nothing.' : '.'));
    });

    // ---------- save the answer's date to My dates
    function closeSave() { $('save-form').hidden = true; $('open-save').hidden = false; $('save-err').textContent = ''; }
    $('open-save').addEventListener('click', () => {
        if (!answer || !answer.save) return;
        $('save-form').hidden = false; $('open-save').hidden = true; $('save-msg').textContent = '';
        $('save-name').value = ''; $('save-name').placeholder = answer.save.placeholder; $('save-name').focus();
    });
    $('save-cancel').addEventListener('click', closeSave);
    $('save-form').addEventListener('submit', e => {
        e.preventDefault();
        if (!answer || !answer.save) return;
        const name = C.cleanText($('save-name').value, C.MAX_NAME);
        if (!name) { $('save-err').textContent = 'Type a name, like ' + answer.save.placeholder.replace(/^e\.g\. /, '') + '.'; $('save-name').focus(); return; }
        if (state.saved.length >= C.MAX_SAVED) { $('save-err').textContent = 'My dates is full (' + C.MAX_SAVED + '). Delete some first.'; return; }
        state.saved.push({ id: newId(), name, date: C.toISO(answer.save.date), kind: answer.save.kind });
        save(); renderSaved(); closeSave();
        say($('save-msg'), 'Saved "' + name + '" to My dates.');
    });

    // ---------- My dates
    const KIND_WORD = { birthday: 'Birthday', anniversary: 'Anniversary', event: 'One date' };
    function renderSaved() {
        const ul = $('saved'); ul.textContent = '';
        $('saved-empty').hidden = state.saved.length > 0;
        C.sortSaved(state.saved, today, state.rule).forEach(item => {
            const li = el('li', 'saved-item ' + item.kind); li.dataset.id = item.id;
            if (editingId === item.id) { li.classList.add('editing'); li.appendChild(itemForm(item)); ul.appendChild(li); return; }
            const d = C.describeSaved(item, today, state.rule);
            if (d.next.inDays === 0) li.classList.add('is-today');
            if (d.next.past) li.classList.add('past');
            const top = el('div', 's-top');
            top.appendChild(el('span', 's-name', item.name));
            top.appendChild(el('span', 's-kind', KIND_WORD[item.kind]));
            li.appendChild(top);
            li.appendChild(el('p', 's-head', d.head));
            li.appendChild(el('p', 's-sub', d.sub));
            const btns = el('div', 's-btns');
            const eb = el('button', null, 'Edit'); eb.type = 'button'; eb.setAttribute('aria-label', 'Edit ' + item.name);
            eb.addEventListener('click', () => { editingId = item.id; $('saved-msg').textContent = ''; renderSaved(); const f = ul.querySelector('.editing input'); if (f) f.focus(); });
            const db = el('button', null, 'Delete'); db.type = 'button'; db.setAttribute('aria-label', 'Delete ' + item.name);
            db.addEventListener('click', () => {
                const before = state.saved.slice();
                state.saved = state.saved.filter(x => x.id !== item.id); save(); renderSaved();
                say($('saved-msg'), 'Deleted "' + item.name + '".', () => { state.saved = before; save(); renderSaved(); });
            });
            btns.appendChild(eb); btns.appendChild(db); li.appendChild(btns);
            ul.appendChild(li);
        });
    }
    // the edit form inside a saved date's own box
    function itemForm(item) {
        const f = el('form', 'item-form'); f.noValidate = true; f.autocomplete = 'off';
        const uid = 'e-' + item.id;
        f.appendChild(Object.assign(el('label', null, 'Name'), { htmlFor: uid + '-name' }));
        const n = el('input'); n.type = 'text'; n.id = uid + '-name'; n.maxLength = C.MAX_NAME; n.value = item.name; f.appendChild(n);
        f.appendChild(Object.assign(el('label', null, 'Date'), { htmlFor: uid + '-date' }));
        const d = el('input'); d.type = 'date'; d.id = uid + '-date'; d.min = '1000-01-01'; d.max = '9999-12-31'; d.value = item.date; f.appendChild(d);
        f.appendChild(Object.assign(el('label', null, 'What is it?'), { htmlFor: uid + '-kind' }));
        const k = el('select'); k.id = uid + '-kind';
        [...$('n-kind').options].forEach(o => { const c = el('option', null, o.textContent); c.value = o.value; k.appendChild(c); });
        k.value = item.kind; f.appendChild(k);
        const err = el('p', 'err'); err.setAttribute('role', 'alert'); f.appendChild(err);
        const btns = el('div', 'form-btns');
        const ok = el('button', 'primary', 'Save'); ok.type = 'submit';
        const no = el('button', 'secondary', 'Cancel'); no.type = 'button';
        no.addEventListener('click', () => { editingId = null; renderSaved(); });
        btns.appendChild(ok); btns.appendChild(no); f.appendChild(btns);
        f.addEventListener('submit', e => {
            e.preventDefault();
            const name = C.cleanText(n.value, C.MAX_NAME), date = P(d.value);
            if (!name) { err.textContent = 'Type a name.'; n.focus(); return; }
            if (date == null) { err.textContent = 'Pick the whole date: day, month and year.'; d.focus(); return; }
            const before = state.saved.slice();
            state.saved = state.saved.map(x => x.id === item.id ? { id: x.id, name, date: C.toISO(date), kind: k.value } : x);
            editingId = null; save(); renderSaved();
            say($('saved-msg'), 'Saved the changes to "' + name + '".', () => { state.saved = before; save(); renderSaved(); });
        });
        return f;
    }
    $('open-new').addEventListener('click', () => { $('new-form').hidden = false; $('open-new').hidden = true; $('saved-msg').textContent = ''; $('n-name').focus(); });
    $('new-cancel').addEventListener('click', () => { $('new-form').hidden = true; $('open-new').hidden = false; $('n-err').textContent = ''; });
    $('new-form').addEventListener('submit', e => {
        e.preventDefault();
        const name = C.cleanText($('n-name').value, C.MAX_NAME), date = P($('n-date').value);
        if (!name) { $('n-err').textContent = 'Type a name, like Mum\'s birthday.'; $('n-name').focus(); return; }
        if (date == null) { $('n-err').textContent = 'Pick the whole date: day, month and year.'; $('n-date').focus(); return; }
        if (state.saved.length >= C.MAX_SAVED) { $('n-err').textContent = 'My dates is full (' + C.MAX_SAVED + '). Delete some first.'; return; }
        state.saved.push({ id: newId(), name, date: C.toISO(date), kind: $('n-kind').value });
        $('n-name').value = ''; $('n-date').value = ''; $('n-err').textContent = '';
        $('new-form').hidden = true; $('open-new').hidden = false;
        save(); renderSaved(); say($('saved-msg'), 'Added "' + name + '".');
    });

    // ---------- copy, email, print
    $('copy').addEventListener('click', async () => {
        const t = text(); if (!t) return;
        try { await navigator.clipboard.writeText(t); say($('tools-msg'), 'Copied. Paste it anywhere.'); }
        catch (e) { say($('tools-msg'), 'Copy is blocked in this browser. Use Email answer instead.'); }
    });
    $('print').addEventListener('click', () => window.print());

    // ---------- today, and a new day while the page is open
    function showToday() { $('today-line').textContent = 'Today is ' + D(today, true) + '.'; }
    function checkDay() {
        const t = C.today();
        if (t === today) return;
        const old = C.toISO(today);
        today = t;
        // fields that showed "today" move on to the new today
        if ($('age-on').value === old) $('age-on').value = isoToday();
        if ($('start').value === old) $('start').value = isoToday();
        showToday(); compute(); renderSaved();
    }
    document.addEventListener('visibilitychange', () => { if (!document.hidden) checkDay(); });
    window.addEventListener('focus', checkDay);
    setInterval(checkDay, 60000);

    showToday(); fill(); setMode(state.mode); renderSaved();
    window.DateApp = { checkDay };   // used by the page tests

    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
