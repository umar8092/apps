(function () {
    const C = PayCore, $ = id => document.getElementById(id), KEY = 'hourly-to-salary-converter.state', MAX_JOBS = 4;
    const PRESETS = ['40', '37.5', '35', '30', '20'];
    const MULTS = ['1.25', '1.5', '2'];
    const OPT = { hour: 'hour', day: 'day', week: 'week', '2week': '2 weeks', month: 'month', year: 'year' };
    const blank = () => ({ id: Math.random().toString(36).slice(2, 9), name: '', pay: '', per: 'hour', hours: '40', days: 5, paid: '', unpaid: '', ot: '', mult: '1.5', showName: false, showOff: false, showOt: false });

    // ---- saved state (storage may be blocked or corrupt: start fresh). Every value is checked before use.
    const str = (v, n) => typeof v === 'string' ? v.slice(0, n) : '';
    function cleanJob(x) {
        if (!x || typeof x !== 'object') return null;
        const j = blank();
        j.name = str(x.name, 40); j.pay = str(x.pay, 20); j.hours = typeof x.hours === 'string' ? x.hours.slice(0, 8) : '40';
        j.paid = str(x.paid, 6); j.unpaid = str(x.unpaid, 6); j.ot = str(x.ot, 6); j.mult = str(x.mult, 6) || '1.5';
        if (C.PERS.includes(x.per)) j.per = x.per;
        const d = Number(x.days); if (Number.isInteger(d) && d >= 1 && d <= 7) j.days = d;
        j.showName = !!x.showName || !!j.name; j.showOff = !!x.showOff || !!(j.paid || j.unpaid); j.showOt = !!x.showOt || !!j.ot;
        return j;
    }
    function cleanState(o) {
        const out = { jobs: [blank()], cur: '' };
        if (!o || typeof o !== 'object') return out;
        const jobs = Array.isArray(o.jobs) ? o.jobs.map(cleanJob).filter(Boolean).slice(0, MAX_JOBS) : [];
        if (jobs.length) out.jobs = jobs;
        if ([...$('cur').options].some(op => op.value === o.cur)) out.cur = o.cur;
        return out;
    }
    let s;
    try { s = cleanState(JSON.parse(localStorage.getItem(KEY))); } catch (e) { s = cleanState(null); }
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* storage blocked: works for this visit */ } };
    const money = c => C.fmt(c, s.cur);
    const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
    const label = (j, i) => j.name.trim() || 'Job ' + (i + 1);
    const isEmpty = () => s.jobs.length === 1 && !s.jobs[0].pay.trim() && !s.jobs[0].name.trim();

    // ---- build the job boxes (only when jobs are added, removed or replaced, so typing never loses focus)
    function field(id, text, input, hint) {
        const w = el('div', 'field');
        const l = el('label', '', text); l.htmlFor = id; w.append(l, input);
        if (hint) { const h = el('p', 'hint', hint); h.id = id + '-hint'; input.setAttribute('aria-describedby', id + '-hint ' + id + '-err'); w.append(h); }
        else input.setAttribute('aria-describedby', id + '-err');
        const e = el('p', 'ferr'); e.id = id + '-err'; w.append(e);
        return w;
    }
    function textInput(id, val, opts) {
        const i = el('input'); i.type = 'text'; i.id = id; i.value = val; i.autocomplete = 'off';
        Object.assign(i, opts || {}); return i;
    }
    function reveal(text, onOpen) { const b = el('button', 'link', text); b.type = 'button'; b.onclick = onOpen; return b; }

    function buildJobs() {
        const box = $('jobs'); box.textContent = '';
        s.jobs.forEach((j, i) => box.append(jobBox(j, i)));
        $('add-job').hidden = s.jobs.length >= MAX_JOBS;
        $('intro').hidden = !isEmpty();
    }
    function jobBox(j, i) {
        const p = 'j' + i + '-', sec = el('section', 'job c' + (i % 4));
        sec.dataset.id = j.id; sec.setAttribute('aria-labelledby', p + 'title');
        const head = el('div', 'job-head'), h = el('h2', '', label(j, i)); h.id = p + 'title'; head.append(h);
        if (s.jobs.length > 1) { const rm = el('button', 'remove', 'Remove'); rm.type = 'button'; rm.setAttribute('aria-label', 'Remove ' + label(j, i)); rm.onclick = () => removeJob(i); head.append(rm); }
        sec.append(head);
        const upd = (k, v) => { j[k] = v; save(); if (k === 'name') h.textContent = label(j, i); update(); };

        // name (optional)
        const nameIn = textInput(p + 'name', j.name, { maxLength: 40, placeholder: 'e.g. Office job' });
        nameIn.oninput = () => upd('name', nameIn.value);
        const nameField = field(p + 'name', 'Name (optional)', nameIn);
        nameField.hidden = !j.showName;
        const nameBtn = reveal('+ Add a name (optional)', () => { j.showName = true; save(); nameField.hidden = false; nameBtn.hidden = true; nameIn.focus(); });
        nameBtn.hidden = j.showName;

        // pay and how often
        const pay = textInput(p + 'pay', j.pay, { inputMode: 'decimal', maxLength: 20, placeholder: j.per === 'year' ? 'e.g. 45,000' : 'e.g. 22.50' });
        pay.oninput = () => upd('pay', pay.value);
        const wrap = el('div', 'money'); const sym = el('span', 'sym', s.cur); sym.setAttribute('aria-hidden', 'true');
        const payF = field(p + 'pay', 'Pay', pay); payF.replaceChild(wrap, pay); wrap.append(sym, pay);
        const per = el('select'); per.id = p + 'per';
        C.PERS.forEach(k => { const o = el('option', '', OPT[k]); o.value = k; per.append(o); }); per.value = j.per;
        per.onchange = () => { pay.placeholder = per.value === 'year' ? 'e.g. 45,000' : per.value === 'month' ? 'e.g. 3,500' : 'e.g. 22.50'; upd('per', per.value); };
        const perF = field(p + 'per', 'Per', per);
        const row = el('div', 'two'); row.append(payF, perF);

        // hours and days
        const hours = textInput(p + 'hours', j.hours, { inputMode: 'decimal', maxLength: 8 });
        const chips = el('div', 'chips'); chips.setAttribute('role', 'group'); chips.setAttribute('aria-label', 'Common hours a week');
        const mark = () => chips.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === hours.value.trim().replace(',', '.'))));
        PRESETS.forEach(v => { const b = el('button', 'chip', v); b.type = 'button'; b.dataset.v = v; b.setAttribute('aria-label', v + ' hours a week'); b.onclick = () => { hours.value = v; upd('hours', v); mark(); }; chips.append(b); });
        hours.oninput = () => { upd('hours', hours.value); mark(); }; mark();
        const hoursF = field(p + 'hours', 'Hours a week', hours, 'Your normal hours, without overtime.');
        hoursF.insertBefore(chips, hoursF.querySelector('.hint'));
        const days = el('select'); days.id = p + 'days';
        for (let d = 1; d <= 7; d++) { const o = el('option', '', String(d)); o.value = d; days.append(o); } days.value = j.days;
        days.onchange = () => upd('days', Number(days.value));
        const daysF = field(p + 'days', 'Days a week', days);
        const row2 = el('div', 'hd'); row2.append(hoursF, daysF);

        // holidays and unpaid days off (optional)
        const off = el('div', 'extra'); off.hidden = !j.showOff;
        off.append(el('h3', '', 'Holidays and days off'));
        const paid = textInput(p + 'paid', j.paid, { inputMode: 'decimal', maxLength: 6, placeholder: 'e.g. 25' });
        paid.oninput = () => upd('paid', paid.value);
        const unpaid = textInput(p + 'unpaid', j.unpaid, { inputMode: 'decimal', maxLength: 6, placeholder: 'e.g. 10' });
        unpaid.oninput = () => upd('unpaid', unpaid.value);
        off.append(field(p + 'paid', 'Paid holiday days a year', paid, 'Days off you are still paid for, including public holidays. Your pay stays the same.'),
            field(p + 'unpaid', 'Unpaid days off a year', unpaid, 'Days you are not paid for. They lower your yearly pay.'));
        const offBtn = reveal('+ Add holidays and unpaid days off (optional)', () => { j.showOff = true; save(); off.hidden = false; offBtn.hidden = true; paid.focus(); });
        offBtn.hidden = j.showOff;

        // overtime (optional)
        const ot = el('div', 'extra'); ot.hidden = !j.showOt;
        ot.append(el('h3', '', 'Overtime'));
        const otIn = textInput(p + 'ot', j.ot, { inputMode: 'decimal', maxLength: 6, placeholder: 'e.g. 5' });
        otIn.oninput = () => upd('ot', otIn.value);
        const multSel = el('select'); multSel.id = p + 'mult';
        [['1.25', '1.25 times'], ['1.5', '1.5 times'], ['2', '2 times'], ['other', 'Other…']].forEach(([v, t]) => { const o = el('option', '', t); o.value = v; multSel.append(o); });
        const multIn = textInput(p + 'mult-other', MULTS.includes(j.mult) ? '' : j.mult, { inputMode: 'decimal', maxLength: 5, placeholder: 'e.g. 1.75' });
        const otherF = field(p + 'mult-other', 'Times your normal rate', multIn, 'Between 1 and 5. Type 1 for overtime at your normal rate.');
        multSel.value = MULTS.includes(j.mult) ? j.mult : 'other'; otherF.hidden = multSel.value !== 'other';
        multSel.onchange = () => { const o = multSel.value === 'other'; otherF.hidden = !o; upd('mult', o ? multIn.value : multSel.value); if (o) multIn.focus(); };
        multIn.oninput = () => upd('mult', multIn.value);
        const otRow = el('div', 'two'); otRow.append(field(p + 'ot', 'Overtime hours a week', otIn), field(p + 'mult', 'Overtime rate', multSel));
        ot.append(otRow, otherF);
        const otBtn = reveal('+ Add overtime (optional)', () => { j.showOt = true; save(); ot.hidden = false; otBtn.hidden = true; otIn.focus(); });
        otBtn.hidden = j.showOt;

        const links = el('div', 'links'); links.append(nameBtn, offBtn, otBtn);
        sec.append(nameField, row, row2, off, ot, links);
        return sec;
    }

    // ---- results
    const ERR_FIELDS = ['pay', 'hours', 'paid', 'unpaid', 'ot', 'mult'];
    function update() {
        const all = s.jobs.map((j, i) => ({ j, i, name: label(j, i), r: C.readJob(j) }));
        // messages under the fields
        all.forEach(({ i, r }) => {
            const other = $('j' + i + '-mult-other'), otherOn = other && !other.closest('.field').hidden;
            ERR_FIELDS.concat('mult-other').forEach(f => {
                const key = f === 'mult-other' ? (otherOn ? 'mult' : '') : (f === 'mult' && otherOn ? '' : f);
                const msg = key && r.errs[key] && r.errs[key] !== 'blank' ? r.errs[key] : '';
                const e = $('j' + i + '-' + f + '-err'); if (e) e.textContent = msg;
                const inp = $('j' + i + '-' + f); if (inp) inp.setAttribute('aria-invalid', msg ? 'true' : 'false');
            });
        });
        document.querySelectorAll('.money .sym').forEach(x => { x.textContent = s.cur; });
        $('intro').hidden = !isEmpty();

        // which job pays more
        const cmp = C.compare(all.map(x => ({ name: x.name, res: x.r.res })));
        const cb = $('compare'); cb.textContent = ''; cb.hidden = !cmp;
        $('res-h').textContent = s.jobs.length > 1 ? 'Your jobs compared' : 'Your pay';
        if (cmp) {
            cb.append(el('h3', '', 'Which job pays more'));
            compareLines(cmp).forEach((t, k) => cb.append(el('p', k ? '' : 'win', t)));
        }

        const box = $('tables'); box.textContent = '';
        all.forEach(x => box.append(table(x, all.length > 1)));
        text = summary(all, cmp);
        $('mail').href = 'mailto:?subject=' + encodeURIComponent(s.jobs.length > 1 ? 'Job offers compared' : 'My pay per hour, month and year') + '&body=' + encodeURIComponent(text);
    }
    function compareLines(cmp) {
        const L = [];
        const n = cmp.rows.length + 1;
        if (cmp.tie) L.push((n === 2 ? 'Both jobs pay ' : 'All ' + n + ' jobs pay ') + 'the same: ' + money(cmp.top.res.year) + ' a year.');
        else {
            L.push(cmp.top.name + ' pays the most: ' + money(cmp.top.res.year) + ' a year.');
            cmp.rows.forEach(r => L.push(r.less === 0 ? r.name + ' pays the same.'
                : cmp.top.name + ' pays ' + money(r.less) + ' more a year than ' + r.name + ' (' + money(r.lessMonth) + ' more a month).'));
        }
        if (cmp.hourDiffers) {
            const h = cmp.hourTop, t = cmp.top, dh = h.res.hoursYear < t.res.hoursYear;
            L.push('But per hour you actually work, ' + h.name + ' pays more: ' + money(h.res.eff) + ' against ' + money(t.res.eff) + ' at ' + t.name + '.' +
                (dh ? ' At ' + t.name + ' you work ' + C.num(t.res.hoursYear - h.res.hoursYear) + ' more hours a year (' + C.num(t.res.hoursYear) + ' against ' + C.num(h.res.hoursYear) + ').' : ''));
        } else if (cmp.tie && cmp.hourTop && !cmp.hourTie) {
            L.push('Per hour you actually work, ' + cmp.hourTop.name + ' pays more: ' + money(cmp.hourTop.res.eff) + '.');
        }
        return L;
    }
    function table({ j, i, name, r }, many) {
        const card = el('div', 'res-job c' + (i % 4));
        card.append(el('h3', 'res-name', name));
        if (!r.ok) {
            const blankPay = r.errs.pay === 'blank' && Object.keys(r.errs).length === 1;
            card.append(el('p', 'res-wait', blankPay ? (many ? 'Type the pay for ' + name + ' to see it here.' : 'Type your pay to see it per hour, day, week, month and year.')
                : 'Check the box marked in red in ' + name + ' to see the result.'));
            return card;
        }
        const x = r.res, jb = r.job;
        card.append(el('p', 'res-sub', money(jb.cents) + ' ' + C.PER_TEXT[jb.per] + ' · ' + C.num(jb.hc / 100) + ' hours a week, ' + jb.days + (jb.days === 1 ? ' day' : ' days')));
        const dl = el('dl', 'rows');
        const row = (k, v, cls) => { const d = el('div', cls || ''); d.append(el('dt', '', k), el('dd', '', v)); dl.append(d); };
        row('Per hour', money(x.hour));
        row('Per day (' + C.num(x.dayHours / 100) + ' hours)', money(x.day));
        row('Per week', money(x.week));
        row('Every 2 weeks', money(x.twoWeeks));
        row('Per month (average)', money(x.month));
        row('Per year', money(x.year), 'year');
        card.append(dl);
        const notes = el('ul', 'notes');
        if (x.unpaidCut) notes.append(el('li', '', money(x.full) + ' for a full 52 weeks, minus ' + money(x.unpaidCut) + ' for ' + C.num(jb.u2 / 2) + ' unpaid ' + (jb.u2 === 2 ? 'day' : 'days') + ' off.'));
        if (jb.oc) notes.append(el('li', '', 'Includes overtime: ' + money(x.otYear) + ' a year (' + C.num(jb.oc / 100) + ' hours a week at ' + C.num(jb.mc / 100) + ' times ' + money(x.hour) + ', in the ' + C.num(x.weeksWorked) + ' weeks you work). Per hour and per day are your normal rate.'));
        notes.append(el('li', '', 'You work ' + C.num(x.hoursYear) + ' hours a year' + (x.weeksWorked !== 52 ? ' (' + C.num(x.weeksWorked) + ' weeks at work).' : '.')));
        if (x.eff != null && x.effDiffers) notes.append(el('li', 'eff', 'Per hour you actually work: ' + money(x.eff) + (jb.p2 ? ', because paid holiday is paid but not worked' : '') + (jb.oc && jb.mc !== 100 ? (jb.p2 ? ' and overtime pays more' : ', because overtime pays more') : '') + '.'));
        card.append(notes);
        return card;
    }

    // ---- text for Copy and Email
    let text = '';
    function summary(all, cmp) {
        const L = [];
        if (cmp) { L.push('Which job pays more'); compareLines(cmp).forEach(t => L.push(t)); L.push(''); }
        all.forEach(({ name, r }) => {
            if (!r.ok) { L.push(name + ': not filled in yet.', ''); return; }
            const x = r.res, jb = r.job;
            L.push(name + ': ' + money(jb.cents) + ' ' + C.PER_TEXT[jb.per] + ', ' + C.num(jb.hc / 100) + ' hours a week, ' + jb.days + ' days a week' +
                (jb.p2 ? ', ' + C.num(jb.p2 / 2) + ' paid holiday days' : '') + (jb.u2 ? ', ' + C.num(jb.u2 / 2) + ' unpaid days off' : '') +
                (jb.oc ? ', ' + C.num(jb.oc / 100) + ' overtime hours a week at ' + C.num(jb.mc / 100) + ' times' : ''));
            L.push('- Per hour: ' + money(x.hour), '- Per day: ' + money(x.day), '- Per week: ' + money(x.week), '- Every 2 weeks: ' + money(x.twoWeeks),
                '- Per month (average): ' + money(x.month), '- Per year: ' + money(x.year));
            if (x.effDiffers) L.push('- Per hour you actually work: ' + money(x.eff) + ' (' + C.num(x.hoursYear) + ' hours a year)');
            L.push('');
        });
        L.push('All amounts before tax. A year is 52 weeks.', 'Worked out with Hourly to Salary Converter: https://umar8092.github.io/apps/hourly-to-salary-converter/');
        return L.join('\n');
    }

    // ---- actions with Undo
    let msgTimer;
    function say(t, undo) {
        const m = $('msg'); m.textContent = t; clearTimeout(msgTimer);
        if (undo) { const b = el('button', '', 'Undo'); b.type = 'button'; b.id = 'undo'; b.onclick = () => { undo(); m.textContent = 'Done. It is back.'; }; m.append(' ', b); }
        msgTimer = setTimeout(() => { m.textContent = ''; }, undo ? 12000 : 4000);
    }
    function snapshot() { return JSON.parse(JSON.stringify(s.jobs)); }
    function restore(jobs) { s.jobs = jobs; save(); buildJobs(); update(); }
    function removeJob(i) {
        const before = snapshot(), name = label(s.jobs[i], i);
        s.jobs.splice(i, 1); save(); buildJobs(); update();
        say('Removed ' + name + '.', () => restore(before));
        const first = document.querySelector('#jobs .job input'); if (first) first.focus();
    }
    $('add-job').onclick = () => {
        if (s.jobs.length >= MAX_JOBS) return;
        const prev = s.jobs[s.jobs.length - 1], j = blank();
        j.hours = prev.hours; j.days = prev.days;     // most offers share the same week; easy to change
        s.jobs.push(j); save(); buildJobs(); update();
        $('j' + (s.jobs.length - 1) + '-pay').focus();
    };
    $('demo').onclick = () => {
        const before = snapshot();
        const a = Object.assign(blank(), { name: 'Agency job', pay: '22.50', per: 'hour', hours: '37.5', days: 5, unpaid: '20', showName: true, showOff: true });
        const b = Object.assign(blank(), { name: 'Office job', pay: '43,000', per: 'year', hours: '45', days: 5, paid: '33', showName: true, showOff: true });
        restore([a, b]);
        say('Example filled in: an hourly job with 20 unpaid days off, and a salary job with 33 paid holiday days.', () => restore(before));
    };
    $('clear').onclick = () => {
        const before = snapshot();
        restore([blank()]);
        say('Cleared. Start again with your pay.', () => restore(before));
        $('j0-pay').focus();
    };
    $('cur').value = s.cur;
    $('cur').onchange = () => { s.cur = $('cur').value; save(); update(); };
    $('copy').onclick = async () => {
        try { await navigator.clipboard.writeText(text); say('Copied. Paste it into a message or note.'); }
        catch (e) {
            const t = el('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.position = 'absolute'; t.style.left = '-9999px'; document.body.append(t); t.select();
            let ok = false; try { ok = document.execCommand('copy'); } catch (e2) { /* not allowed */ } t.remove();
            say(ok ? 'Copied. Paste it into a message or note.' : 'Copy is blocked in this browser. Use Email results instead.');
        }
    };
    $('print').onclick = () => window.print();

    buildJobs(); update();
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => { /* offline mode not available */ });
})();
