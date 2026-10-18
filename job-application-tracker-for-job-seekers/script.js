// Job Application Tracker for Job Seekers: the page. The logic lives in core.js.
(function () {
    'use strict';
    const C = window.JobCore;
    const KEY = 'job-application-tracker-for-job-seekers.state';
    const URL_SELF = 'https://umar8092.github.io/apps/job-application-tracker-for-job-seekers/';
    const WHERE = ['LinkedIn', 'Indeed', 'Glassdoor', 'Company website', 'Recruiter or agency', 'Friend or referral', 'Job centre', 'Newspaper'];
    const $ = id => document.getElementById(id);
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

    let canSave = true, state, today = C.todayIso();
    let editing = null;        // id of the job in the form, or null for a new one
    let formOpen = false;
    let filter = 'active', query = '';
    let range = 'week';
    const openNotes = new Set();

    // ---------- saving ----------
    function load() {
        let raw = null;
        try { raw = localStorage.getItem(KEY); } catch (e) { canSave = false; }
        if (raw) {
            try { const s = C.validate(JSON.parse(raw)); if (s) return s; } catch (e) { /* damaged: start fresh */ }
            setTimeout(() => show('set-msg', 'The saved applications could not be read, so the app started fresh.'), 0);
        }
        return C.emptyState();
    }
    function save() {
        try { localStorage.setItem(KEY, JSON.stringify(state)); canSave = true; } catch (e) { canSave = false; }
        $('storage-warn').hidden = canSave;
    }
    const snapshot = () => JSON.stringify(state);
    function restoreSnap(snap) { state = C.validate(JSON.parse(snap)) || state; closeForm(); fillSettings(); commit(); }
    function commit() { save(); render(); }

    // ---------- messages with Undo ----------
    const MSGS = ['list-msg', 'form-msg', 'set-msg', 'rec-msg'];
    const timers = {};
    function show(id, text, undoSnap) {
        const box = $(id); if (!box) return;
        MSGS.forEach(o => { if (o !== id) clearMsg(o); });
        box.textContent = ''; box.classList.add('show');
        box.appendChild(el('span', null, text));
        if (undoSnap) {
            const b = el('button', 'undo', 'Undo'); b.type = 'button';
            b.addEventListener('click', () => { restoreSnap(undoSnap); show(id, 'Undone.'); });
            box.appendChild(b);
        }
        clearTimeout(timers[id]); timers[id] = setTimeout(() => clearMsg(id), undoSnap ? 15000 : 6000);
    }
    function clearMsg(id) { const b = $(id); if (b) { b.textContent = ''; b.classList.remove('show'); } }

    // ---------- helpers ----------
    const job = id => state.apps.find(a => a.id === id);
    const replace = (id, n) => { state.apps = state.apps.map(a => (a.id === id ? n : a)); };
    const S = () => state.settings;
    function copyText(text) {
        if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).then(() => true, () => fallbackCopy(text));
        return Promise.resolve(fallbackCopy(text));
    }
    function fallbackCopy(text) {
        const t = document.createElement('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
        document.body.appendChild(t); t.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; } t.remove(); return ok;
    }
    function download(name, type, body) {
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([body], { type })); a.download = name;
        document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    }
    function mailto(subject, text) {
        let body = text;
        if (body.length > 1800) body = body.slice(0, 1800) + '\n...\n(The record is too long for an email link. Use "Copy the record" and paste it.)';
        return 'mailto:?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
    }
    function flash(id) {
        const t = document.querySelector('li.box[data-id="' + id + '"]');
        if (t) { t.scrollIntoView({ block: 'center', behavior: 'smooth' }); t.classList.add('flash'); setTimeout(() => t.classList.remove('flash'), 1600); }
    }
    function goTo(id) {
        const a = job(id); if (!a) return;
        if (!C.matches(a, filter, query)) { filter = C.CLOSED.indexOf(a.stage) >= 0 ? 'closed' : 'active'; query = ''; $('find').value = ''; render(); }
        flash(id);
    }
    const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');

    // ---------- the summary ----------
    function renderSummary() {
        const body = $('sum-body'); body.textContent = '';
        if (!state.apps.length) { body.appendChild(el('p', 'sum-empty', 'Add the jobs you applied for. This box then shows who to follow up with today, your coming interviews and your week.')); return; }
        const sum = C.summary(state.apps, today, S());
        // needs you today
        const h = el('p', 'next-label', 'Needs you today');
        body.appendChild(h);
        if (!sum.todo.length) body.appendChild(el('p', 'next ok', 'Nothing today. Keep applying!'));
        else {
            const ul = el('ul', 'todo');
            sum.todo.forEach(x => {
                const li = el('li', 'todo-' + x.st.kind);
                const b = el('button', 'todo-btn'); b.type = 'button';
                b.appendChild(el('strong', null, x.app.company)); b.appendChild(document.createTextNode(' (' + x.app.role + '): '));
                b.appendChild(el('span', null, x.st.text.replace(/^Follow up today: /, 'follow up, ')));
                b.addEventListener('click', () => goTo(x.app.id));
                li.appendChild(b); ul.appendChild(li);
            });
            body.appendChild(ul);
        }
        // interviews
        if (sum.interviews.length) {
            body.appendChild(el('p', 'next-label gap', sum.interviews.length === 1 ? 'Coming interview' : 'Coming interviews'));
            const ul = el('ul', 'todo ivs-sum');
            sum.interviews.slice(0, 6).forEach(x => {
                const n = C.diff(today, x.iv.date);
                const when = (n === 0 ? 'Today' : n === 1 ? 'Tomorrow, ' + C.shortDate(x.iv.date, today) : C.shortDate(x.iv.date, today)) + (x.iv.time ? ' at ' + x.iv.time : '');
                const li = el('li'); const b = el('button', 'todo-btn'); b.type = 'button';
                b.appendChild(el('strong', null, when)); b.appendChild(document.createTextNode(': ' + x.app.company + ' (' + x.iv.kind + ')'));
                b.addEventListener('click', () => goTo(x.app.id));
                li.appendChild(b); ul.appendChild(li);
            });
            if (sum.interviews.length > 6) ul.appendChild(el('li', 'more', 'and ' + (sum.interviews.length - 6) + ' more'));
            body.appendChild(ul);
        }
        // the week
        const w = C.weekLine(sum.week, today);
        const wk = el('div', 'week');
        wk.appendChild(el('p', 'week-head', w.head));
        wk.appendChild(el('p', 'week-range', w.range));
        if (w.goal !== 0 && sum.week.goal) {
            const bar = el('div', 'bar'); bar.setAttribute('role', 'progressbar'); bar.setAttribute('aria-label', 'Weekly goal');
            bar.setAttribute('aria-valuemin', '0'); bar.setAttribute('aria-valuemax', String(sum.week.goal)); bar.setAttribute('aria-valuenow', String(Math.min(sum.week.count, sum.week.goal)));
            const fill = el('span'); fill.style.width = w.pct + '%'; bar.appendChild(fill); wk.appendChild(bar);
            wk.appendChild(el('p', 'week-left' + (sum.week.count >= sum.week.goal ? ' done' : ''), w.left));
        } else {
            const set = el('button', 'link small-link', '+ Set a weekly goal'); set.type = 'button';
            set.addEventListener('click', () => { $('s-goal').scrollIntoView({ block: 'center' }); $('s-goal').focus(); });
            wk.appendChild(set);
        }
        body.appendChild(wk);
        if (sum.sent) body.appendChild(el('p', 'stat', 'Sent ' + plural(sum.sent, 'application') + ', heard back from ' + sum.answered + ' (' + Math.round(sum.answered * 100 / sum.sent) + '%).'));
    }

    // ---------- the list ----------
    function render() {
        today = C.todayIso();
        $('app').classList.toggle('setup', !state.apps.length);
        renderSummary();
        const c = C.counts(state.apps);
        // stage filter buttons with counts
        const f = $('filters'); f.textContent = '';
        f.hidden = !state.apps.length;
        const opts = [['active', 'Active', c.active]].concat(C.STAGES.filter(s => C.ACTIVE.indexOf(s.k) >= 0 && c[s.k]).map(s => [s.k, s.t, c[s.k]]));
        if (c.closed) opts.push(['closed', 'Closed', c.closed]);
        opts.push(['all', 'All', c.all]);
        if (!opts.some(o => o[0] === filter)) filter = 'active';
        opts.forEach(o => {
            const b = el('button', 'filt'); b.type = 'button'; b.setAttribute('aria-pressed', String(filter === o[0]));
            b.appendChild(document.createTextNode(o[1] + ' ')); b.appendChild(el('span', 'n', String(o[2])));
            b.addEventListener('click', () => { filter = o[0]; render(); });
            f.appendChild(b);
        });
        $('find-wrap').hidden = state.apps.length < 6;
        if ($('find-wrap').hidden && query) { query = ''; $('find').value = ''; }
        const list = C.sorted(state.apps.filter(a => C.matches(a, filter, query)), today, S());
        const ul = $('boxes'); ul.textContent = '';
        list.forEach(a => ul.appendChild(box(a)));
        $('empty').hidden = !!state.apps.length;
        const none = $('none-here');
        none.hidden = !state.apps.length || !!list.length;
        if (!none.hidden) none.textContent = query ? 'No job matches "' + query + '".' : filter === 'active' ? 'No active applications. Every job here is closed: tap "Closed" to see them, or add a new job.' : 'No jobs here.';
        // places offered again
        const dl = $('where-list'); dl.textContent = '';
        const seen = new Set();
        state.apps.map(a => a.where).concat(WHERE).forEach(w => { const k = (w || '').toLowerCase(); if (w && !seen.has(k)) { seen.add(k); const o = document.createElement('option'); o.value = w; dl.appendChild(o); } });
        renderRecord();
        $('open-form').hidden = formOpen || !state.apps.length;
        $('form').hidden = !formOpen && !!state.apps.length;
        if (!state.apps.length && !formOpen) openForm(null, true);
    }

    function box(a) {
        const st = C.status(a, today, S());
        const li = el('li', 'box ' + st.kind + (st.urgent ? ' urgent' : '')); li.dataset.id = a.id;
        const top = el('div', 'box-top');
        top.appendChild(el('h3', 'box-name', a.company));
        top.appendChild(el('span', 'badge b-' + a.stage, C.stageName(a.stage)));
        li.appendChild(top);
        li.appendChild(el('p', 'box-role', a.role));
        const meta = [];
        if (a.applied) meta.push('Applied ' + C.shortDate(a.applied, today) + ' (' + C.ago(C.diff(a.applied, today)) + ')');
        else meta.push('Saved ' + C.shortDate(a.added || today, today));
        if (a.where) meta.push(a.where);
        if (a.salary) meta.push(a.salary);
        li.appendChild(el('p', 'box-sub', meta.join(' · ')));
        li.appendChild(el('p', 'st ' + st.kind, st.text));
        if (st.late) li.appendChild(el('p', 'hint late-hint', 'No answer for over 30 days? Set the stage to "No reply" to close it.'));
        const fu = C.lastFollow(a);
        if (fu && C.WAITING.indexOf(a.stage) >= 0) li.appendChild(el('p', 'box-sub', 'Last followed up ' + C.shortDate(fu, today)));
        if (a.stage === 'want' && a.closes && st.kind !== 'closing' && st.kind !== 'closed-ad') li.appendChild(el('p', 'box-sub', 'Advert closes ' + C.shortDate(a.closes, today)));
        // interviews
        if (a.interviews.length) {
            const ul = el('ul', 'ivs');
            a.interviews.forEach((iv, n) => {
                const past = iv.date < today;
                const r = el('li', 'iv' + (past ? ' past' : ''));
                r.appendChild(el('p', 'iv-when', C.shortDate(iv.date, today) + (iv.time ? ' at ' + iv.time : '') + ' · ' + iv.kind + (past ? ' (done)' : '')));
                if (iv.notes) r.appendChild(el('p', 'iv-notes', iv.notes));
                if (!past) {
                    const b = el('button', 'mini', 'Add to calendar'); b.type = 'button';
                    b.setAttribute('aria-label', 'Add the interview on ' + C.shortDate(iv.date, today) + ' at ' + a.company + ' to your calendar');
                    b.addEventListener('click', () => {
                        const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
                        download('interview-' + a.company.replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 40) + '-' + iv.date + '.ics', 'text/calendar', C.ics(a, iv, stamp, URL_SELF));
                        show('list-msg', 'Calendar file saved. Open it to add the interview with reminders the day before and 1 hour before.');
                    });
                    r.appendChild(b);
                }
                ul.appendChild(r);
            });
            li.appendChild(ul);
        }
        if (a.contact) li.appendChild(el('p', 'box-sub', 'Contact: ' + a.contact));
        if (a.notes) {
            const long = a.notes.length > 180 || a.notes.split('\n').length > 3;
            const open = openNotes.has(a.id);
            const p = el('p', 'box-note', long && !open ? a.notes.slice(0, 160).replace(/\s+\S*$/, '') + '…' : a.notes);
            li.appendChild(p);
            if (long) {
                const t = el('button', 'link tiny', open ? 'Show less' : 'Show all notes'); t.type = 'button';
                t.addEventListener('click', () => { open ? openNotes.delete(a.id) : openNotes.add(a.id); render(); flash(a.id); });
                li.appendChild(t);
            }
        }
        if (a.link) {
            const l = el('a', 'adlink', 'Open the advert'); l.href = a.link; l.target = '_blank'; l.rel = 'noopener noreferrer';
            li.appendChild(l);
        }
        // buttons
        const row = el('div', 'box-btns');
        const lab = el('label', 'stage-pick');
        lab.appendChild(el('span', null, 'Stage'));
        const sel = document.createElement('select');
        sel.setAttribute('aria-label', 'Stage for ' + a.role + ' at ' + a.company);
        C.STAGES.forEach(s => { const o = document.createElement('option'); o.value = s.k; o.textContent = s.t; if (s.k === a.stage) o.selected = true; sel.appendChild(o); });
        sel.addEventListener('change', () => {
            const snap = snapshot(), old = a.stage, k = sel.value;
            replace(a.id, C.setStage(a, k, today)); commit();
            let m = a.company + ' moved to "' + C.stageName(k) + '".';
            if (k === 'interview' && !job(a.id).interviews.some(i => i.date >= today)) m += ' Tap "+ Interview" to add the date.';
            if (C.CLOSED.indexOf(k) >= 0) m += ' It is under "Closed" now.';
            if (C.CLOSED.indexOf(old) >= 0 && C.CLOSED.indexOf(k) < 0) m = a.company + ' reopened as "' + C.stageName(k) + '".';
            if (!C.matches(job(a.id), filter, query)) filter = C.CLOSED.indexOf(k) >= 0 ? filter : 'active';
            render(); show('list-msg', m, snap); flash(a.id);
        });
        lab.appendChild(sel); row.appendChild(lab);
        if (C.WAITING.indexOf(a.stage) >= 0) {
            const b = el('button', 'mini strong', 'Followed up'); b.type = 'button';
            b.setAttribute('aria-label', 'I followed up with ' + a.company + ' today');
            b.addEventListener('click', () => {
                const snap = snapshot(); replace(a.id, C.followedUp(a, today)); commit();
                const f = C.followUp(job(a.id), today, S());
                show('list-msg', 'Followed up with ' + a.company + ' today. Next reminder: ' + C.shortDate(f.due, today) + ' if you hear nothing.', snap); flash(a.id);
            });
            row.appendChild(b);
        }
        if (C.CLOSED.indexOf(a.stage) < 0 && a.stage !== 'offer') {
            const iv = el('button', 'mini', '+ Interview'); iv.type = 'button';
            iv.setAttribute('aria-label', 'Add an interview for ' + a.company);
            iv.addEventListener('click', () => { openForm(a.id); addIv(); });
            row.appendChild(iv);
        }
        const ed = el('button', 'mini', 'Edit'); ed.type = 'button';
        ed.setAttribute('aria-label', 'Edit ' + a.role + ' at ' + a.company);
        ed.addEventListener('click', () => openForm(a.id));
        row.appendChild(ed);
        li.appendChild(row);
        return li;
    }

    // ---------- the form ----------
    const reveal = (btn, wrap, on) => { $(wrap).hidden = !on; $(btn).hidden = on; };
    function setErr(id, msg) { const e = $('e-' + id); if (e) e.textContent = msg || ''; const f = $('f-' + id); if (f) { if (msg) f.setAttribute('aria-invalid', 'true'); else f.removeAttribute('aria-invalid'); } }
    function clearErrs() { document.querySelectorAll('#form .err').forEach(e => { e.textContent = ''; }); document.querySelectorAll('#form [aria-invalid]').forEach(e => e.removeAttribute('aria-invalid')); }

    function ivRow(iv) {
        const n = $('ivs').children.length;
        const d = el('fieldset', 'iv-box');
        const lg = el('legend', null, 'Interview'); d.appendChild(lg);
        const id = 'iv' + Date.now().toString(36) + n;
        const pair = el('div', 'pair');
        const a = el('div'), b = el('div');
        const l1 = el('label', null, 'Date'); l1.htmlFor = id + 'd'; const i1 = document.createElement('input'); i1.type = 'date'; i1.id = id + 'd'; i1.className = 'iv-date'; i1.value = iv ? iv.date : '';
        const l2 = el('label', null, 'Time (optional)'); l2.htmlFor = id + 't'; const i2 = document.createElement('input'); i2.type = 'time'; i2.id = id + 't'; i2.className = 'iv-time'; i2.value = iv ? iv.time : '';
        a.appendChild(l1); a.appendChild(i1); b.appendChild(l2); b.appendChild(i2); pair.appendChild(a); pair.appendChild(b); d.appendChild(pair);
        const l3 = el('label', null, 'Type'); l3.htmlFor = id + 'k';
        const s = document.createElement('select'); s.id = id + 'k'; s.className = 'iv-kind';
        C.KINDS.forEach(k => { const o = document.createElement('option'); o.value = k; o.textContent = k; s.appendChild(o); });
        s.value = iv ? iv.kind : 'Video';
        d.appendChild(l3); d.appendChild(s);
        const l4 = el('label', null, 'What to prepare (optional)'); l4.htmlFor = id + 'n';
        const t = document.createElement('textarea'); t.id = id + 'n'; t.className = 'iv-notes'; t.rows = 2; t.maxLength = 500; t.placeholder = 'e.g. Bring passport, ask for Sam'; t.value = iv ? iv.notes : '';
        d.appendChild(l4); d.appendChild(t);
        const err = el('p', 'err iv-err'); err.setAttribute('role', 'alert'); d.appendChild(err);
        const rm = el('button', 'link danger-link', 'Remove this interview'); rm.type = 'button';
        rm.addEventListener('click', () => { d.remove(); ivLabels(); preview(); });
        d.appendChild(rm);
        [i1, i2, s].forEach(x => x.addEventListener('input', preview));
        $('ivs').appendChild(d);
        ivLabels();
        return d;
    }
    function ivLabels() {
        const rows = [...$('ivs').children];
        rows.forEach((r, i) => { r.querySelector('legend').textContent = rows.length > 1 ? 'Interview ' + (i + 1) : 'Interview'; });
        $('o-iv').textContent = rows.length ? '+ Add another interview' : '+ Add an interview (optional)';
    }
    function addIv() { const r = ivRow(null); r.scrollIntoView({ block: 'center' }); r.querySelector('.iv-date').focus(); preview(); }

    function placeCloses() {
        const want = $('f-stage').value === 'want';
        const w = $('w-closes');
        if (want && w.parentNode !== $('w-closes-top')) $('w-closes-top').appendChild(w);
        if (!want && w.parentNode !== $('w-more')) $('w-more').insertBefore(w, $('f-how').previousElementSibling);
        $('w-closes-top').hidden = !want;
        $('w-applied').hidden = want;
    }
    function openForm(id, quiet) {
        editing = id; formOpen = true;
        const a = id ? job(id) : null;
        clearErrs(); clearMsg('form-msg');
        $('form-h').textContent = a ? 'Edit ' + a.company : 'Add a job';
        $('save').textContent = a ? 'Save changes' : 'Add this job';
        $('cancel').textContent = a ? 'Cancel' : 'Done';
        $('edit-tools').hidden = !a;
        $('f-paste').value = '';
        $('f-company').value = a ? a.company : '';
        $('f-role').value = a ? a.role : '';
        $('f-stage').value = a ? a.stage : 'applied';
        $('f-applied').value = a ? (a.applied || today) : today;
        $('f-where').value = a ? a.where : '';
        $('f-link').value = a ? a.link : '';
        $('f-closes').value = a ? a.closes : '';
        $('f-how').value = a ? a.how : '';
        $('f-salary').value = a ? a.salary : '';
        $('f-contact').value = a ? a.contact : '';
        $('f-notes').value = a ? a.notes : '';
        $('f-followOn').value = a ? a.followOn : '';
        $('ivs').textContent = '';
        if (a) a.interviews.forEach(iv => ivRow(iv));
        ivLabels();
        reveal('o-paste', 'w-paste', false); $('o-paste').hidden = !!a;
        reveal('o-more', 'w-more', !!(a && (a.link || a.salary || a.closes || a.how || a.contact)));
        reveal('o-notes', 'w-notes', !!(a && a.notes));
        reveal('o-follow', 'w-follow', !!(a && a.followOn));
        placeCloses();
        $('form').hidden = false; $('open-form').hidden = true;
        dupCheck(); preview();
        if (!quiet) { $('add').scrollIntoView({ block: 'start', behavior: 'smooth' }); setTimeout(() => (a ? $('f-stage') : $('f-company')).focus({ preventScroll: true }), 250); }
    }
    function closeForm() {
        editing = null; formOpen = false;
        if (state.apps.length) { $('form').hidden = true; $('open-form').hidden = false; }
        $('form-h').textContent = 'Add a job';
    }
    function formValues() {
        return {
            company: $('f-company').value, role: $('f-role').value, stage: $('f-stage').value, applied: $('f-applied').value, where: $('f-where').value,
            how: $('f-how').value, link: $('f-link').value, salary: $('f-salary').value, closes: $('f-closes').value, contact: $('f-contact').value,
            notes: $('f-notes').value, followOn: $('f-followOn').value,
            interviews: [...$('ivs').children].map(r => ({ date: r.querySelector('.iv-date').value, time: r.querySelector('.iv-time').value, kind: r.querySelector('.iv-kind').value, notes: r.querySelector('.iv-notes').value }))
        };
    }
    function dupCheck() {
        $('dup').textContent = C.duplicates($('f-company').value, $('f-role').value, state.apps, editing, today);
    }
    function preview() {
        const f = formValues(), p = $('preview');
        $('h-follow').textContent = 'Leave empty to follow up ' + S().follow + ' days after the last news.';
        if (!f.company.trim() || !f.role.trim()) { p.textContent = ''; return; }
        const r = C.readForm(f, today, editing ? job(editing) : null);
        if (!r.ok) { p.textContent = ''; return; }
        const st = C.status(Object.assign({ id: 0 }, r.app), today, S());
        p.textContent = (r.moved ? 'Stage: Interview. ' : '') + st.text + '.';
    }
    function submit(ev) {
        ev.preventDefault();
        clearErrs();
        const old = editing ? job(editing) : null;
        const r = C.readForm(formValues(), today, old);
        if (!r.ok) {
            Object.keys(r.errors).forEach(k => {
                if (/^iv\d+$/.test(k)) { const row = $('ivs').children[Number(k.slice(2))]; if (row) row.querySelector('.iv-err').textContent = r.errors[k]; return; }
                if (['link', 'closes'].indexOf(k) >= 0) reveal('o-more', 'w-more', true);
                if (k === 'followOn') reveal('o-follow', 'w-follow', true);
                setErr(k, r.errors[k]);
            });
            const first = $('form').querySelector('[aria-invalid="true"]') || [...$('ivs').querySelectorAll('.iv-err')].find(e => e.textContent);
            if (first) { first.scrollIntoView({ block: 'center' }); if (first.focus) first.focus(); }
            return;
        }
        const snap = snapshot();
        if (old) {
            replace(old.id, r.app); const name = r.app.company; closeForm(); commit();
            show('list-msg', 'Saved ' + name + '.' + (r.moved ? ' Stage set to "Interview".' : ''), snap); flash(old.id);
        } else {
            r.app.id = state.nid++;
            state.apps.push(r.app);
            commit();
            if (!C.matches(r.app, filter, query)) { filter = C.CLOSED.indexOf(r.app.stage) >= 0 ? 'closed' : 'active'; query = ''; $('find').value = ''; render(); }
            const st = C.status(r.app, today, S());
            openForm(null, true);
            show('form-msg', 'Added ' + r.app.company + ': ' + st.text + '. Add the next job, or tap "Done".', snap);
            $('f-company').focus({ preventScroll: true });
        }
    }

    // ---------- the record ----------
    function rangeDates(k) {
        const [ws] = C.weekRange(today, S().weekStart);
        if (k === 'week') return [ws, C.addDays(ws, 6)];
        if (k === 'last') return [C.addDays(ws, -7), C.addDays(ws, -1)];
        if (k === '2w') return [C.addDays(today, -13), today];
        if (k === '4w') return [C.addDays(today, -27), today];
        const ds = state.apps.map(a => a.applied).concat(...state.apps.map(a => a.interviews.map(i => i.date))).concat(...state.apps.map(a => a.history.map(h => h.d))).filter(Boolean).sort();
        return [ds[0] || today, ds[ds.length - 1] > today ? ds[ds.length - 1] : today];
    }
    function renderRecord(keepDates) {
        if (!keepDates && range) { const [f, t] = rangeDates(range); $('r-from').value = f; $('r-to').value = t; }
        document.querySelectorAll('#rec-quick .chip').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.r === range)));
        const from = $('r-from').value, to = $('r-to').value;
        $('e-rec').textContent = '';
        let text = '';
        if (!C.isIso(from) || !C.isIso(to)) $('e-rec').textContent = 'Choose both dates.';
        else if (from > to) $('e-rec').textContent = 'The "From" date must be on or before the "To" date.';
        else text = C.recordText(state.apps, from, to, S().name).text;
        $('rec-text').textContent = text;
        $('rec-text').hidden = !text;
        ['rec-copy', 'rec-print'].forEach(id => { $(id).disabled = !text; });
        $('rec-csv').disabled = !state.apps.length;
        $('rec-mail').href = text ? mailto('Job search record ' + C.longDate(from) + ' to ' + C.longDate(to), text) : 'mailto:';
    }

    // ---------- settings ----------
    function fillSettings() {
        const s = S();
        const fo = [...$('s-follow').options].some(o => o.value === String(s.follow));
        $('s-follow').value = fo ? String(s.follow) : 'custom'; $('w-follow-days').hidden = fo; $('s-followdays').value = fo ? '' : String(s.follow);
        const go = [...$('s-goal').options].some(o => o.value === String(s.goal));
        $('s-goal').value = go ? String(s.goal) : 'custom'; $('w-goal-n').hidden = go; $('s-goaln').value = go ? '' : String(s.goal);
        $('s-week').value = String(s.weekStart);
        $('r-name').value = s.name;
        reveal('o-name', 'w-name', !!s.name);
        $('e-follow').textContent = ''; $('e-goal').textContent = '';
    }
    function readNum(input, min, max, errId, what) {
        const v = input.value.trim();
        if (!/^\d+$/.test(v) || Number(v) < min || Number(v) > max) { $(errId).textContent = 'Type a whole number of ' + what + ' from ' + min + ' to ' + max + '.'; input.setAttribute('aria-invalid', 'true'); return null; }
        $(errId).textContent = ''; input.removeAttribute('aria-invalid'); return Number(v);
    }

    // ---------- events ----------
    function wire() {
        $('form').addEventListener('submit', submit);
        $('open-form').addEventListener('click', () => openForm(null));
        $('cancel').addEventListener('click', () => { closeForm(); render(); });
        $('o-paste').addEventListener('click', () => { reveal('o-paste', 'w-paste', true); $('f-paste').focus(); });
        $('o-more').addEventListener('click', () => { reveal('o-more', 'w-more', true); $('f-link').focus(); });
        $('o-notes').addEventListener('click', () => { reveal('o-notes', 'w-notes', true); $('f-notes').focus(); });
        $('o-follow').addEventListener('click', () => { reveal('o-follow', 'w-follow', true); $('f-followOn').focus(); });
        $('o-iv').addEventListener('click', addIv);
        $('f-paste').addEventListener('input', () => {
            const p = C.parsePaste($('f-paste').value);
            if (p.company) $('f-company').value = p.company;
            if (p.role) $('f-role').value = p.role;
            if (p.where && !$('f-where').value.trim()) $('f-where').value = p.where;
            if (p.link) { $('f-link').value = p.link; reveal('o-more', 'w-more', true); }
            dupCheck(); preview();
        });
        ['f-company', 'f-role'].forEach(id => $(id).addEventListener('input', () => { setErr(id.slice(2), ''); dupCheck(); preview(); }));
        $('f-link').addEventListener('change', () => { const w = C.sourceFromLink(C.cleanLink($('f-link').value) || ''); if (w && !$('f-where').value.trim()) $('f-where').value = w; });
        $('f-stage').addEventListener('change', () => { placeCloses(); preview(); });
        ['f-applied', 'f-closes', 'f-followOn'].forEach(id => $(id).addEventListener('input', () => { setErr(id.slice(2), ''); preview(); }));
        $('quick-applied').addEventListener('click', e => {
            const b = e.target.closest('.chip'); if (!b) return;
            $('f-applied').value = C.addDays(today, -Number(b.dataset.days)); setErr('applied', ''); preview();
        });
        $('del').addEventListener('click', () => {
            const a = job(editing); if (!a) return;
            const snap = snapshot(); state.apps = state.apps.filter(x => x.id !== a.id); closeForm(); commit();
            show('list-msg', 'Deleted ' + a.role + ' at ' + a.company + '.', snap);
            $('list').scrollIntoView({ block: 'start' });
        });
        $('find').addEventListener('input', () => { query = $('find').value; render(); });
        // record
        $('rec-quick').addEventListener('click', e => { const b = e.target.closest('.chip'); if (!b) return; range = b.dataset.r; renderRecord(); });
        ['r-from', 'r-to'].forEach(id => $(id).addEventListener('input', () => { range = ''; renderRecord(true); }));
        $('o-name').addEventListener('click', () => { reveal('o-name', 'w-name', true); $('r-name').focus(); });
        $('r-name').addEventListener('input', () => { state.settings.name = $('r-name').value.trim().slice(0, 80); save(); renderRecord(true); });
        $('rec-copy').addEventListener('click', () => copyText($('rec-text').textContent).then(ok => show('rec-msg', ok ? 'Copied. Paste it into an email, a message or your job centre journal.' : 'Could not copy. Select the text and copy it yourself.')));
        $('rec-print').addEventListener('click', () => { document.body.classList.add('print-rec'); window.print(); setTimeout(() => document.body.classList.remove('print-rec'), 500); });
        $('rec-csv').addEventListener('click', () => { download('job-applications-' + today + '.csv', 'text/csv', C.csv(state.apps)); show('rec-msg', 'Spreadsheet saved (' + plural(state.apps.length, 'job') + '). It opens in Excel, Numbers or Google Sheets.'); });
        // settings
        $('s-follow').addEventListener('change', () => {
            const v = $('s-follow').value; $('w-follow-days').hidden = v !== 'custom';
            if (v === 'custom') { $('s-followdays').value = String(S().follow); $('s-followdays').focus(); return; }
            state.settings.follow = Number(v); $('e-follow').textContent = ''; commit(); preview();
            show('set-msg', 'Follow-ups now come after ' + plural(S().follow, 'day') + ' with no news.');
        });
        $('s-followdays').addEventListener('input', () => { const n = readNum($('s-followdays'), 1, 60, 'e-follow', 'days'); if (n !== null) { state.settings.follow = n; commit(); preview(); } });
        $('s-goal').addEventListener('change', () => {
            const v = $('s-goal').value; $('w-goal-n').hidden = v !== 'custom';
            if (v === 'custom') { $('s-goaln').value = S().goal ? String(S().goal) : ''; $('s-goaln').focus(); return; }
            state.settings.goal = Number(v); $('e-goal').textContent = ''; commit();
        });
        $('s-goaln').addEventListener('input', () => { const n = readNum($('s-goaln'), 1, 100, 'e-goal', 'applications'); if (n !== null) { state.settings.goal = n; commit(); } });
        $('s-week').addEventListener('change', () => { state.settings.weekStart = Number($('s-week').value); commit(); });
        $('backup').addEventListener('click', () => { download('job-applications-backup-' + today + '.json', 'application/json', JSON.stringify(state, null, 1)); show('set-msg', 'Backup saved (' + plural(state.apps.length, 'job') + '). Keep the file somewhere safe.'); });
        $('restore').addEventListener('click', () => $('restore-file').click());
        $('restore-file').addEventListener('change', () => {
            const file = $('restore-file').files[0]; if (!file) return;
            const rd = new FileReader();
            rd.onload = () => {
                let s = null; try { s = C.validate(JSON.parse(rd.result)); } catch (e) { s = null; }
                $('restore-file').value = '';
                if (!s) { show('set-msg', 'That file is not a backup from this app, so nothing was changed.'); return; }
                const snap = snapshot(); state = s; closeForm(); fillSettings(); commit();
                show('set-msg', 'Backup restored: ' + plural(s.apps.length, 'job') + '.', snap);
            };
            rd.onerror = () => show('set-msg', 'Could not read that file.');
            rd.readAsText(file);
        });
        $('wipe').addEventListener('click', () => {
            if (!state.apps.length) { show('set-msg', 'There is nothing to delete.'); return; }
            const snap = snapshot(); const keep = Object.assign({}, state.settings);
            state = C.emptyState(); state.settings = keep; closeForm(); commit();
            show('set-msg', 'Everything deleted.', snap);
        });
        document.addEventListener('visibilitychange', () => { if (!document.hidden && C.todayIso() !== today) render(); });
        setInterval(() => { if (C.todayIso() !== today) render(); }, 60000);
    }

    state = load();
    wire(); fillSettings();
    if (!state.apps.length) openForm(null, true);
    render();
    if (!canSave) $('storage-warn').hidden = false;
    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
