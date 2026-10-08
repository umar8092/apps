(function () {
    const C = DueCore;
    const KEY = 'due-date-calculator.state';
    const $ = id => document.getElementById(id);
    const blank = () => ({ method: 'lmp', lmp: '', conception: '', ivf: '', scan: '', cycle: '', embryo: '5', weeks: '', days: '' });
    let state = blank(), undoState = null, msgTimer = 0;

    try { const saved = JSON.parse(localStorage.getItem(KEY)); if (saved && typeof saved === 'object') state = Object.assign(blank(), saved); } catch (e) {}
    if (!['lmp', 'conception', 'ivf', 'scan'].includes(state.method)) state.method = 'lmp';
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} };

    function inputs() {
        const m = state.method;
        return { method: m, date: state[m], cycle: state.cycle, embryoDay: state.embryo, weeks: state.weeks, days: state.days };
    }
    function say(text, undo) {
        const el = $('msg');
        el.textContent = text;
        if (undo) {
            const b = document.createElement('button');
            b.type = 'button'; b.textContent = 'Undo';
            b.addEventListener('click', undo);
            el.appendChild(b);
        }
        clearTimeout(msgTimer);
        if (!undo) msgTimer = setTimeout(() => { el.textContent = ''; }, 3000);
    }

    let current = null;
    function render() {
        document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.method === state.method)));
        document.querySelectorAll('.pane').forEach(p => { p.hidden = p.id !== 'f-' + state.method; });
        const today = C.todayNum();
        const todayISO = C.toISO(today);
        ['lmp', 'conception', 'ivf', 'scan'].forEach(k => { $('d-' + k).max = todayISO; });
        $('cycle-box').hidden = !(state.cycle !== '' || cycleOpen);
        $('show-cycle').hidden = !$('cycle-box').hidden;
        const err = $('error'), res = $('result');
        const r = C.dueDate(inputs(), today);
        if (r.error) {
            current = null;
            res.hidden = true;
            err.textContent = r.error;
            err.hidden = !state[state.method]; // stay quiet until a date has been typed
            return;
        }
        err.hidden = true;
        current = r;
        const p = C.progress(r, today);
        $('due').textContent = C.fmtDate(r.due);
        $('line').textContent = p.line;
        $('togo').textContent = p.togo + '.';
        $('fill').style.width = p.percent + '%';
        const notes = r.notes.concat(p.notes).join(' ');
        $('notes').textContent = notes; $('notes').hidden = !p.notes.length && !r.notes.length;
        const ul = $('miles'); ul.textContent = '';
        C.milestones(r, today).forEach(m => {
            const li = document.createElement('li');
            li.className = (m.status === 'passed' ? 'passed ' : '') + (m.weeks === 40 ? 'due' : '');
            const b = document.createElement('b'); b.textContent = m.weeks + ' wks';
            const t = document.createElement('span'); t.textContent = C.fmtShort(m.date) + ' (' + m.status + ')';
            const s = document.createElement('small'); s.textContent = m.text;
            li.append(b, t, s);
            ul.appendChild(li);
        });
        $('email').href = 'mailto:?subject=' + encodeURIComponent('My estimated due date: ' + C.fmtDate(r.due)) + '&body=' + encodeURIComponent(C.summary(r, today));
        res.hidden = false;
    }
    let cycleOpen = false;

    document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => { state.method = b.dataset.method; save(); render(); }));
    [['d-lmp', 'lmp'], ['d-conception', 'conception'], ['d-ivf', 'ivf'], ['d-scan', 'scan'], ['cycle', 'cycle'], ['embryo', 'embryo'], ['s-weeks', 'weeks'], ['s-days', 'days']]
        .forEach(([id, key]) => ['input', 'change'].forEach(ev => $(id).addEventListener(ev, () => { state[key] = $(id).value; save(); render(); })));
    $('show-cycle').addEventListener('click', () => { cycleOpen = true; render(); $('cycle').focus(); });

    $('copy').addEventListener('click', () => {
        if (!current) return;
        const text = C.summary(current, C.todayNum());
        const done = () => say('Copied. Paste it into any chat or note.');
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => say('Could not copy. Select the text and copy it by hand.'));
        else say('Could not copy on this browser.');
    });
    $('cal').addEventListener('click', () => {
        if (!current) return;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([C.ics(current)], { type: 'text/calendar' }));
        a.download = 'due-date.ics';
        document.body.appendChild(a); a.click(); a.remove();
        say('Calendar file saved. Open it to add the due date to your calendar.');
    });
    $('reset').addEventListener('click', () => {
        undoState = state; state = blank(); cycleOpen = false; save();
        ['d-lmp', 'd-conception', 'd-ivf', 'd-scan', 'cycle', 's-weeks', 's-days'].forEach(id => { $(id).value = ''; });
        $('embryo').value = '5';
        render();
        say('Cleared. Ready for a new date.', () => { state = undoState; undoState = null; fill(); save(); render(); say('Restored.'); });
    });

    function fill() {
        $('d-lmp').value = state.lmp; $('d-conception').value = state.conception; $('d-ivf').value = state.ivf; $('d-scan').value = state.scan;
        $('cycle').value = state.cycle; $('embryo').value = state.embryo; $('s-weeks').value = state.weeks; $('s-days').value = state.days;
    }
    fill(); render();
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
