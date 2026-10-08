(function () {
    const C = WorkCore, $ = id => document.getElementById(id), KEY = 'work-hours-calculator.state';
    const WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const BREAKS = [['0', 'No break'], ['15', '15 minutes'], ['30', '30 minutes'], ['45', '45 minutes'], ['60', '1 hour'], ['90', '1 hour 30'], ['custom', 'Other…']];
    const pad = n => String(n).padStart(2, '0');
    const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    const fromIso = t => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3], 12) : null; };
    const addDays = (d, n) => { const x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; };
    const mondayOf = d => addDays(d, -((d.getDay() + 6) % 7));
    const label = d => WD[d.getDay()].slice(0, 3) + ' ' + d.getDate() + ' ' + MON[d.getMonth()];
    const longLabel = d => label(d) + ' ' + d.getFullYear();
    const blankDay = () => ({ s: '', e: '', b: '0', c: false });
    const blankWeek = () => Array.from({ length: 7 }, blankDay);

    let s = { start: iso(mondayOf(new Date())), weeks: {}, opt: false, thr: '0', thrC: '', rate: '', mult: '1.5', multC: '', round: '0', fb: '30' };
    try {
        const saved = JSON.parse(localStorage.getItem(KEY));
        if (saved && typeof saved === 'object') s = Object.assign(s, saved);
    } catch (e) { /* storage blocked or corrupt: start fresh */ }
    if (!fromIso(s.start)) s.start = iso(mondayOf(new Date()));
    if (!s.weeks || typeof s.weeks !== 'object') s.weeks = {};
    const str = (v, n) => String(v == null ? '' : v).slice(0, n);
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* ignore */ } };

    function days() {
        let w = s.weeks[s.start];
        if (!Array.isArray(w) || w.length !== 7) w = s.weeks[s.start] = blankWeek();
        w.forEach((d, i) => { if (!d || typeof d !== 'object') d = w[i] = blankDay(); d.s = str(d.s, 5); d.e = str(d.e, 5); d.b = str(d.b, 4); d.c = !!d.c; });
        return w;
    }
    function prune() {
        const keys = Object.keys(s.weeks).sort();
        keys.slice(0, Math.max(0, keys.length - 80)).forEach(k => delete s.weeks[k]);
        keys.forEach(k => { if (k !== s.start && s.weeks[k].every(d => !d.s && !d.e)) delete s.weeks[k]; });
    }
    const settings = () => {
        const thr = s.thr === 'custom' ? C.parseMoney(s.thrC) / 100 * 60 : parseFloat(s.thr) * 60;
        const mult = s.mult === 'custom' ? C.parseMult(s.multC) : C.parseMult(s.mult);
        return { thrMin: s.opt ? Math.round(thr) || 0 : 0, rate: s.opt ? C.parseMoney(s.rate) : 0, mult, roundTo: s.opt ? parseInt(s.round, 10) || 0 : 0 };
    };

    function option(sel, list, value) {
        list.forEach(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; sel.appendChild(o); });
        sel.value = value;
    }
    const refs = [];

    function buildDays() {
        const ul = $('days'); ul.innerHTML = ''; refs.length = 0;
        const start = fromIso(s.start), w = days();
        w.forEach((d, i) => {
            const date = addDays(start, i), n = i + 1, nm = WD[date.getDay()];
            const li = document.createElement('li'); li.className = 'day';
            li.innerHTML = '<div class="dayhead"><span class="dayname"></span><span class="dayres"></span></div>' +
                '<div class="dgrid"><div><label>Start</label><input type="time"></div><div><label>Finish</label><input type="time"></div>' +
                '<div class="brk"><label>Break (unpaid)</label><select></select><input type="text" inputmode="numeric" maxlength="3" placeholder="Minutes, e.g. 20" hidden></div></div>' +
                '<p class="daynote"></p><button type="button" class="addmail clearday">Clear day</button>';
            const [st, en] = li.querySelectorAll('input[type=time]'), sel = li.querySelector('select'), cb = li.querySelector('input[type=text]');
            li.querySelector('.dayname').textContent = label(date);
            const labs = li.querySelectorAll('label');
            st.id = 'start-' + n; en.id = 'end-' + n; sel.id = 'break-' + n; cb.id = 'break-c-' + n;
            labs[0].htmlFor = st.id; labs[1].htmlFor = en.id; labs[2].htmlFor = sel.id;
            st.setAttribute('aria-label', 'Start time on ' + nm); en.setAttribute('aria-label', 'Finish time on ' + nm);
            sel.setAttribute('aria-label', 'Break on ' + nm); cb.setAttribute('aria-label', 'Break minutes on ' + nm);
            option(sel, BREAKS, d.c ? 'custom' : (BREAKS.some(b => b[0] === d.b) ? d.b : 'custom'));
            if (sel.value === 'custom') { d.c = true; cb.hidden = false; cb.value = d.b; }
            st.value = d.s; en.value = d.e;
            st.oninput = () => { d.s = st.value; render(); };
            en.oninput = () => { d.e = en.value; render(); };
            sel.onchange = () => {
                if (sel.value === 'custom') { d.c = true; cb.hidden = false; d.b = cb.value; cb.focus(); } else { d.c = false; d.b = sel.value; cb.hidden = true; }
                render();
            };
            cb.oninput = () => { d.b = cb.value; render(); };
            li.querySelector('.clearday').onclick = () => { w[i] = blankDay(); buildDays(); render(); };
            ul.appendChild(li);
            refs.push({ li, res: li.querySelector('.dayres'), note: li.querySelector('.daynote') });
        });
        const end = addDays(start, 6);
        $('wk-start').value = s.start;
        $('wk-range').textContent = longLabel(start) + '  to  ' + longLabel(end);
    }

    let text = '';
    function render() {
        const start = fromIso(s.start), w = days(), set = settings(), r = C.week(w, set);
        const lines = [], warn = [];
        r.shifts.forEach((x, i) => {
            const ref = refs[i], d = w[i], date = addDays(start, i);
            let res = 'Day off', note = 'Type a start and finish time.', warnNote = false, line;
            ref.li.classList.toggle('off', x.state === 'blank');
            ref.res.classList.toggle('dim', x.minutes === 0);
            if (x.state === 'blank') { note = d.s || d.e ? 'Type both a start and a finish time.' : 'Leave empty for a day off.'; line = [label(date), 'Day off']; }
            else if (x.state === 'same') { res = '0h'; note = 'Start and finish are the same, so this day counts as 0. For a 24 hour shift, finish one minute earlier.'; warnNote = true; warn.push(label(date) + ': start and finish are the same'); line = [label(date) + '  ' + d.s + ' to ' + d.e, '0h']; }
            else {
                res = C.fmtHM(x.minutes);
                const bits = [C.fmtHM(x.gross) + ' on the clock'];
                if (x.brk) bits.push(x.brk + ' min break');
                if (x.overnight) bits.push('ends next day');
                if (set.roundTo) bits.push('rounded to ' + set.roundTo + ' min');
                note = bits.join(', ') + '.';
                if (x.state === 'break') { note = 'The break is longer than the shift, so this day counts as 0.'; warnNote = true; warn.push(label(date) + ': break longer than the shift'); }
                line = [label(date) + '  ' + d.s + (x.overnight ? ' to ' + d.e + ' (next day)' : ' to ' + d.e) + (x.brk ? ', break ' + x.brk + 'm' : ''), res];
            }
            ref.res.textContent = res; ref.note.textContent = note; ref.note.classList.toggle('warn', warnNote);
            lines.push(line);
        });

        $('total').textContent = C.fmtHM(r.total);
        $('dec').textContent = r.total ? C.fmtDec(r.total) + ' hours in decimal, over ' + r.worked + (r.worked === 1 ? ' day' : ' days') : 'Type a start and finish time to begin.';
        $('demo').hidden = !!r.total || w.some(d => d.s || d.e);
        const sum = $('sum'); sum.innerHTML = '';
        const add = (k, v, cls) => { const d = document.createElement('div'); if (cls) d.className = cls; const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = k; dd.textContent = v; d.append(dt, dd); sum.appendChild(d); };
        const out = [];
        if (r.worked) add('Average per day worked', C.fmtHM(Math.round(r.total / r.worked)));
        if (set.thrMin) {
            add('Regular hours', C.fmtHM(r.regular) + ' (' + C.fmtDec(r.regular) + ')');
            add('Overtime hours (after ' + C.fmtHM(set.thrMin) + ')', C.fmtHM(r.overtime) + ' (' + C.fmtDec(r.overtime) + ')');
        }
        if (r.rate) {
            if (set.thrMin) { add('Regular pay', C.fmtMoney(r.payRegular)); add('Overtime pay (x' + (r.mult / 100) + ')', C.fmtMoney(r.payOvertime)); }
            add('Total pay', C.fmtMoney(r.pay), 'total');
        }
        const ul = $('lines'); ul.innerHTML = '';
        lines.forEach(l => { const li = document.createElement('li'); if (l[1] === 'Day off') li.className = 'off'; const a = document.createElement('span'), b = document.createElement('span'); a.textContent = l[0]; b.textContent = l[1]; li.append(a, b); ul.appendChild(li); });
        const note = $('note'); note.hidden = !warn.length; note.textContent = warn.length ? 'Check: ' + warn.join('; ') + '. Those days count as 0.' : '';

        const head = 'Timesheet, week of ' + longLabel(start);
        const t = [head, ''];
        lines.forEach(l => t.push(l[0] + ': ' + l[1]));
        t.push('', 'Total: ' + C.fmtHM(r.total) + ' (' + C.fmtDec(r.total) + ' hours)');
        if (set.thrMin) t.push('Regular: ' + C.fmtHM(r.regular) + ', overtime: ' + C.fmtHM(r.overtime));
        if (r.rate) t.push('Pay: ' + C.fmtMoney(r.pay) + (set.thrMin ? ' (regular ' + C.fmtMoney(r.payRegular) + ' + overtime ' + C.fmtMoney(r.payOvertime) + ')' : ''));
        text = t.join('\n');
        $('mail').href = 'mailto:?subject=' + encodeURIComponent(head + ': ' + C.fmtHM(r.total)) + '&body=' + encodeURIComponent(text);
        prune(); save();
    }

    // undo for "Start a new week" and the fill buttons
    let backup = null;
    function snapshot(msg) { backup = JSON.parse(JSON.stringify(days())); $('undo-text').textContent = msg; $('undo').hidden = false; }
    function hideUndo() { backup = null; $('undo').hidden = true; }
    function flash(m) { $('msg').textContent = m; setTimeout(() => { if ($('msg').textContent === m) $('msg').textContent = ''; }, 3000); }

    function setWeek(d) { s.start = iso(d); hideUndo(); buildDays(); render(); }
    $('wk-start').onchange = () => { const d = fromIso($('wk-start').value); if (d) setWeek(d); else $('wk-start').value = s.start; };
    $('prev-wk').onclick = () => setWeek(addDays(fromIso(s.start), -7));
    $('next-wk').onclick = () => setWeek(addDays(fromIso(s.start), 7));
    $('this-wk').onclick = () => setWeek(mondayOf(new Date()));

    option($('f-b'), BREAKS.slice(0, -1), BREAKS.some(b => b[0] === s.fb) ? s.fb : '30');
    function fill(onlyWeekdays) {
        const st = $('f-s').value, en = $('f-e').value;
        if (!st || !en) { flash('Choose a Start and a Finish time first.'); return; }
        snapshot('Filled.');
        const w = days(), start = fromIso(s.start);
        w.forEach((d, i) => { const wd = addDays(start, i).getDay(); if (!onlyWeekdays || (wd >= 1 && wd <= 5)) w[i] = { s: st, e: en, b: $('f-b').value, c: false }; });
        s.fb = $('f-b').value; buildDays(); render();
    }
    $('fill-wd').onclick = () => fill(true);
    $('fill-all').onclick = () => fill(false);

    $('demo').onclick = () => {
        snapshot('Example added.');
        const w = days(), ex = [['09:00', '17:30', '30'], ['09:00', '18:00', '30'], ['08:30', '17:00', '60'], ['09:00', '19:00', '30'], ['09:00', '17:00', '30'], ['22:00', '06:00', '30']];
        ex.forEach((x, i) => { w[i] = { s: x[0], e: x[1], b: x[2], c: false }; });
        buildDays(); render();
    };
    $('new-wk').onclick = () => { snapshot('Cleared.'); s.weeks[s.start] = blankWeek(); buildDays(); render(); };
    $('undo-btn').onclick = () => { if (backup) { s.weeks[s.start] = backup; hideUndo(); buildDays(); render(); } };

    // optional overtime, pay and rounding
    const optBox = $('opt'), showOpt = $('show-opt');
    function syncOpt() {
        optBox.hidden = !s.opt; showOpt.hidden = s.opt; showOpt.setAttribute('aria-expanded', String(s.opt));
        $('thr-c').hidden = $('thr').value !== 'custom'; $('mult-c').hidden = $('mult').value !== 'custom';
    }
    showOpt.onclick = () => { s.opt = true; syncOpt(); $('thr').focus(); render(); };
    [['thr', 'thr'], ['thr-c', 'thrC'], ['rate', 'rate'], ['mult', 'mult'], ['mult-c', 'multC'], ['round', 'round']].forEach(([id, k]) => {
        const e = $(id); e.value = s[k] == null ? '' : s[k];
        if (e.value !== String(s[k]) && e.tagName === 'SELECT') e.selectedIndex = 0;
        e.oninput = e.onchange = () => { s[k] = e.value; syncOpt(); render(); };
    });
    syncOpt();

    $('copy').onclick = () => {
        const done = () => flash('Timesheet copied.');
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
        function fallback() {
            const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'absolute'; ta.style.left = '-9999px';
            document.body.appendChild(ta); ta.select();
            try { document.execCommand('copy'); done(); } catch (e) { flash('Could not copy. Select the text and copy it yourself.'); }
            ta.remove();
        }
    };
    $('print').onclick = () => window.print();

    buildDays(); render();
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
