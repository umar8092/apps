// Job Application Tracker for Job Seekers: the logic, with no page code. Used by script.js and tests.js.
// Dates are calendar dates ('2026-10-18') so time zones and summer time never move a date.
(function (root) {
    'use strict';

    const STAGES = [
        { k: 'want', t: 'Want to apply' },
        { k: 'applied', t: 'Applied' },
        { k: 'heard', t: 'Heard back' },
        { k: 'interview', t: 'Interview' },
        { k: 'offer', t: 'Offer' },
        { k: 'rejected', t: 'Rejected' },
        { k: 'noreply', t: 'No reply' },
        { k: 'withdrew', t: 'I withdrew' }
    ];
    const STAGE_KEYS = STAGES.map(s => s.k);
    const ACTIVE = ['want', 'applied', 'heard', 'interview', 'offer'];
    const CLOSED = ['rejected', 'noreply', 'withdrew'];
    const WAITING = ['applied', 'heard', 'interview'];      // stages where a follow-up makes sense
    const HOW = ['', 'Online form', 'Email', 'In person', 'By phone', 'Through an agency', 'Other'];
    const HOW_WORDS = { 'Online form': 'applied online', 'Email': 'applied by email', 'In person': 'applied in person', 'By phone': 'applied by phone', 'Through an agency': 'applied through an agency' };
    const KINDS = ['Phone', 'Video', 'In person', 'Test or assessment', 'Other'];
    const stageName = k => (STAGES.find(s => s.k === k) || { t: k }).t;

    // ---------- dates ----------
    const pad = n => String(n).padStart(2, '0');
    const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    const todayIso = () => iso(new Date());
    const parts = s => s.split('-').map(Number);
    const utc = s => { const [y, m, d] = parts(s); return Date.UTC(y, m - 1, d); };
    function isIso(s) {
        if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
        const [y, m, d] = parts(s), t = new Date(Date.UTC(y, m - 1, d));
        return y >= 1990 && y <= 2100 && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
    }
    const isTime = s => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
    function addDays(s, n) { const t = new Date(utc(s) + n * 86400000); return t.getUTCFullYear() + '-' + pad(t.getUTCMonth() + 1) + '-' + pad(t.getUTCDate()); }
    const diff = (a, b) => Math.round((utc(b) - utc(a)) / 86400000);   // days from a to b
    const dow = s => new Date(utc(s)).getUTCDay();
    const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    function shortDate(s, today) {
        const [y, m, d] = parts(s);
        return DAYS[dow(s)] + ' ' + d + ' ' + MONTHS[m - 1] + (today && parts(today)[0] === y ? '' : ' ' + y);
    }
    const longDate = s => shortDate(s, null);
    function ago(n) { return n === 0 ? 'today' : n === 1 ? 'yesterday' : n + ' days ago'; }
    function rel(today, s) {
        const n = diff(today, s);
        if (n === 0) return 'today';
        if (n === 1) return 'tomorrow';
        if (n === -1) return 'yesterday';
        return n > 0 ? 'in ' + n + ' days' : -n + ' days ago';
    }
    function weekRange(today, start) {
        const back = (dow(today) - start + 7) % 7, from = addDays(today, -back);
        return [from, addDays(from, 6)];
    }
    const inRange = (d, from, to) => !!d && d >= from && d <= to;

    // ---------- facts about one application ----------
    const lastOf = (app, test) => { let d = ''; (app.history || []).forEach(h => { if (test(h) && h.d > d) d = h.d; }); return d; };
    const stageDate = (app, k) => lastOf(app, h => h.s === k);
    const lastFollow = app => lastOf(app, h => h.s === 'followup');
    const lastChange = app => lastOf(app, h => h.s !== 'followup');
    const sortIv = list => list.slice().sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
    function nextInterview(app, today) { return sortIv((app.interviews || []).filter(i => i.date >= today))[0] || null; }
    function lastPastInterview(app, today) { const p = sortIv((app.interviews || []).filter(i => i.date < today)); return p[p.length - 1] || null; }

    // When to follow up, counted from the last thing that happened.
    function followUp(app, today, s) {
        if (WAITING.indexOf(app.stage) < 0) return null;
        const rank = { applied: 0, reopen: 0, heard: 1, interview: 2, followup: 3 };
        const events = [{ d: app.applied || today, why: 'applied' }];
        const ch = lastChange(app);
        if (ch) events.push({ d: ch, why: app.stage === 'applied' ? (ch > (app.applied || '') ? 'reopen' : 'applied') : 'heard' });
        const fu = lastFollow(app); if (fu) events.push({ d: fu, why: 'followup' });
        const iv = lastPastInterview(app, today); if (iv) events.push({ d: iv.date, why: 'interview' });
        let base = events[0];
        events.forEach(e => { if (e.d > base.d || (e.d === base.d && rank[e.why] > rank[base.why])) base = e; });
        const manual = app.followOn && (!fu || app.followOn > fu) ? app.followOn : '';
        return { due: manual || addDays(base.d, s.follow), base: base.d, why: base.why, manual: !!manual };
    }
    function ivText(i, today) {
        const n = diff(today, i.date), at = i.time ? ' at ' + i.time : '';
        const kind = i.kind ? ', ' + i.kind : '';
        if (n === 0) return 'Interview today' + at + kind;
        if (n === 1) return 'Interview tomorrow, ' + shortDate(i.date, today) + at + kind;
        return 'Interview ' + shortDate(i.date, today) + at + kind + ' (in ' + n + ' days)';
    }
    function followReason(f, today) {
        const n = diff(f.base, today);
        if (f.manual) return 'the day you chose';
        if (f.why === 'followup') return 'you followed up ' + ago(n) + ', no reply';
        if (f.why === 'interview') return 'the interview was ' + ago(n) + ', no news';
        if (f.why === 'heard') return 'they last replied ' + ago(n);
        if (f.why === 'reopen') return 'you reopened it ' + ago(n);
        return 'applied ' + ago(n) + ', no reply';
    }

    // The one line that says what to do next, plus a sort key and how urgent it is.
    function status(app, today, s) {
        const st = app.stage;
        if (CLOSED.indexOf(st) >= 0) {
            const d = stageDate(app, st);
            const t = st === 'rejected' ? 'Rejected' : st === 'noreply' ? 'No reply' : 'You withdrew';
            return { kind: 'closed', text: t + (d ? ', ' + shortDate(d, today) : ''), key: '9' + (d || ''), urgent: false };
        }
        if (st === 'want') {
            if (!app.closes) return { kind: 'want', text: 'Not applied yet', key: '5', urgent: false };
            const n = diff(today, app.closes);
            if (n < 0) return { kind: 'closed-ad', text: 'The advert closed ' + shortDate(app.closes, today) + ' (' + ago(-n) + ')', key: '8' + app.closes, urgent: false };
            if (n === 0) return { kind: 'closing', text: 'Apply today: the advert closes today', key: '1' + app.closes, urgent: true };
            return { kind: 'closing', text: 'Apply by ' + shortDate(app.closes, today) + ' (the advert closes ' + rel(today, app.closes) + ')', key: '2' + app.closes, urgent: n <= 3 };
        }
        if (st === 'offer') {
            const d = stageDate(app, 'offer') || today;
            return { kind: 'offer', text: 'Offer ' + (d === today ? 'today' : shortDate(d, today)) + ': give them your answer', key: '0' + d, urgent: true };
        }
        const iv = nextInterview(app, today);
        if (iv) return { kind: 'interview', text: ivText(iv, today), key: '1' + iv.date + (iv.time || '99:99'), urgent: diff(today, iv.date) <= 1, iv };
        const f = followUp(app, today, s);
        if (f.due <= today) {
            return { kind: 'follow', text: 'Follow up today: ' + followReason(f, today), key: '1' + f.due, urgent: true,
                late: app.stage === 'applied' && !lastFollow(app) && diff(f.base, today) >= 30 };
        }
        return { kind: 'wait', text: 'Follow up ' + shortDate(f.due, today) + ' (' + rel(today, f.due) + ') if you hear nothing', key: '3' + f.due, urgent: false };
    }

    // ---------- the summary at the top ----------
    function counts(apps) {
        const c = {}; STAGE_KEYS.forEach(k => { c[k] = 0; });
        apps.forEach(a => { c[a.stage]++; });
        c.active = ACTIVE.reduce((n, k) => n + c[k], 0);
        c.closed = CLOSED.reduce((n, k) => n + c[k], 0);
        c.all = apps.length;
        return c;
    }
    function summary(apps, today, s) {
        const today_ = [], soon = [];
        apps.forEach(a => {
            const st = status(a, today, s);
            if (st.kind === 'follow' || st.kind === 'offer' || (st.kind === 'closing' && st.urgent) || (st.kind === 'interview' && st.urgent)) today_.push({ app: a, st });
            (a.interviews || []).forEach(i => { if (i.date >= today) soon.push({ app: a, iv: i }); });
        });
        today_.sort((x, y) => x.st.key.localeCompare(y.st.key));
        soon.sort((x, y) => (x.iv.date + (x.iv.time || '99')).localeCompare(y.iv.date + (y.iv.time || '99')));
        const [from, to] = weekRange(today, s.weekStart);
        const week = apps.filter(a => a.stage !== 'want' && inRange(a.applied, from, to)).length;
        const replied = apps.filter(a => a.stage !== 'want' && a.applied).length;
        const answered = apps.filter(a => a.stage !== 'want' && a.applied && ['heard', 'interview', 'offer', 'rejected'].indexOf(a.stage) >= 0).length;
        return { todo: today_, interviews: soon, week: { from, to, count: week, goal: s.goal }, counts: counts(apps), sent: replied, answered };
    }
    function weekLine(w, today) {
        const range = shortDate(w.from, today) + ' to ' + shortDate(w.to, today);
        const n = w.count, apps = n === 1 ? '1 application' : n + ' applications';
        if (!w.goal) return { head: 'This week: ' + apps, range, left: '' };
        const left = w.goal - n;
        return { head: 'This week: ' + n + ' of ' + w.goal + ' applications', range, left: left > 0 ? left + ' to go to reach your goal' : 'Goal reached. Well done!', pct: Math.min(100, Math.round(n * 100 / w.goal)) };
    }

    // ---------- sorting and filtering ----------
    function sorted(apps, today, s) {
        return apps.map(a => ({ a, st: status(a, today, s) }))
            .sort((x, y) => x.st.key.localeCompare(y.st.key) || x.a.company.localeCompare(y.a.company, undefined, { sensitivity: 'base' }))
            .map(x => x.a);
    }
    function matches(app, filter, q) {
        if (filter === 'active' && ACTIVE.indexOf(app.stage) < 0) return false;
        if (filter === 'closed' && CLOSED.indexOf(app.stage) < 0) return false;
        if (STAGE_KEYS.indexOf(filter) >= 0 && app.stage !== filter) return false;
        q = (q || '').trim().toLowerCase();
        if (q && (app.company + ' ' + app.role + ' ' + (app.where || '')).toLowerCase().indexOf(q) < 0) return false;
        return true;
    }
    const norm = s => String(s || '').toLowerCase().replace(/[.,]/g, '').replace(/\b(ltd|limited|inc|llc|plc|pvt|gmbh|co|company)\b/g, '').replace(/\s+/g, ' ').trim();
    function duplicates(company, role, apps, exceptId, today) {
        const c = norm(company); if (!c) return '';
        const same = apps.filter(a => a.id !== exceptId && norm(a.company) === c);
        if (!same.length) return '';
        const exact = same.find(a => norm(a.role) === norm(role) && norm(role));
        const a = exact || same[0];
        const when = a.applied ? ', applied ' + shortDate(a.applied, today) : '';
        if (exact) return 'You already have this job: ' + a.role + ' at ' + a.company + ' (' + stageName(a.stage) + when + '). Save anyway only if it is a new advert.';
        return 'You have ' + (same.length === 1 ? 'another job' : same.length + ' other jobs') + ' at ' + a.company + ': ' + same.map(x => x.role + ' (' + stageName(x.stage) + ')').join(', ') + '.';
    }

    // ---------- pasting from an advert ----------
    function sourceFromLink(url) {
        const h = (String(url).match(/^https?:\/\/([^/?#]+)/i) || [])[1] || '';
        const host = h.toLowerCase().replace(/^www\./, '');
        const map = [['linkedin.', 'LinkedIn'], ['indeed.', 'Indeed'], ['glassdoor.', 'Glassdoor'], ['monster.', 'Monster'], ['reed.co.uk', 'Reed'], ['totaljobs.', 'Totaljobs'],
            ['rozee.pk', 'Rozee.pk'], ['naukri.', 'Naukri'], ['seek.', 'Seek'], ['ziprecruiter.', 'ZipRecruiter'], ['findajob.dwp', 'Find a job (gov.uk)'], ['bayt.', 'Bayt'], ['stepstone.', 'StepStone']];
        const m = map.find(x => host.indexOf(x[0]) >= 0);
        return m ? m[1] : '';
    }
    function cleanLink(s) {
        s = String(s || '').trim();
        if (!s) return '';
        if (/\s/.test(s)) return null;
        if (!/^https?:\/\//i.test(s)) { if (/^[\w-]+(\.[\w-]+)+(\/|$)/.test(s)) s = 'https://' + s; else return null; }
        return s.length <= 600 ? s : null;
    }
    function parsePaste(text) {
        text = String(text || '').replace(/\s+/g, ' ').trim();
        const out = { link: '', role: '', company: '', where: '' };
        const m = text.match(/https?:\/\/\S+/i);
        if (m) { out.link = m[0].replace(/[),.;]+$/, ''); out.where = sourceFromLink(out.link); text = (text.slice(0, m.index) + ' ' + text.slice(m.index + m[0].length)).trim(); }
        text = text.replace(/\s*[|\-–—]\s*(LinkedIn|Indeed(\.com)?|Glassdoor|Monster|Reed(\.co\.uk)?|Totaljobs|Rozee\.pk|Naukri(\.com)?|Seek|ZipRecruiter|Bayt(\.com)?|StepStone)\s*$/i, '').trim();
        if (!text) return out;
        let h = text.match(/^(.+?) (?:is )?hiring (?:a |an )?(.+?)(?: in .+)?$/i);
        if (h) { out.company = h[1].trim(); out.role = h[2].trim(); return out; }
        h = text.match(/^(.+?) at (.+)$/i);
        if (h) { out.role = h[1].trim(); out.company = h[2].trim(); return out; }
        const bits = text.split(/\s+[|\-–—]\s+/).map(x => x.trim()).filter(Boolean);
        if (bits.length >= 2) { out.role = bits[0]; out.company = bits[1]; return out; }
        out.role = text;
        return out;
    }

    // ---------- reading the form ----------
    // f has strings: company, role, stage, applied, where, how, link, salary, closes, contact, notes, followOn,
    // and interviews: [{date, time, kind, notes}]
    function readForm(f, today, old) {
        const e = {}, t = v => String(v == null ? '' : v).trim();
        const company = t(f.company), role = t(f.role), stage = STAGE_KEYS.indexOf(f.stage) >= 0 ? f.stage : 'applied';
        if (!company) e.company = 'Type the company or employer, for example Acme Ltd.';
        else if (company.length > 80) e.company = 'Keep the company name under 80 characters.';
        if (!role) e.role = 'Type the job title, for example Sales Assistant.';
        else if (role.length > 100) e.role = 'Keep the job title under 100 characters.';
        let applied = t(f.applied);
        if (stage === 'want') applied = '';
        else if (!applied) e.applied = 'Choose the day you applied (or set Stage to "Want to apply").';
        else if (!isIso(applied)) e.applied = 'That date is not valid.';
        else if (applied > today) e.applied = 'The day you applied cannot be after today.';
        const link = cleanLink(f.link);
        if (link === null) e.link = 'That does not look like a web link. Paste it as it is, for example https://www.indeed.com/viewjob?jk=123.';
        const closes = t(f.closes);
        if (closes && !isIso(closes)) e.closes = 'That date is not valid.';
        const followOn = t(f.followOn);
        if (followOn && !isIso(followOn)) e.followOn = 'That date is not valid.';
        const how = HOW.indexOf(f.how) >= 0 ? f.how : '';
        const ivs = [];
        (f.interviews || []).forEach((i, n) => {
            const d = t(i.date), tm = t(i.time);
            if (!d) e['iv' + n] = 'Choose the interview date, or tap "Remove this interview".';
            else if (!isIso(d)) e['iv' + n] = 'That date is not valid.';
            else if (tm && !isTime(tm)) e['iv' + n] = 'That time is not valid.';
            else ivs.push({ date: d, time: tm, kind: KINDS.indexOf(i.kind) >= 0 ? i.kind : 'Other', notes: t(i.notes).slice(0, 500) });
        });
        if (Object.keys(e).length) return { ok: false, errors: e };
        // an interview booked means the stage is at least "Interview"
        let st = stage;
        if (ivs.length && ['want', 'applied', 'heard'].indexOf(st) >= 0) st = 'interview';
        if (st !== 'want' && !applied) applied = today;
        const app = Object.assign({}, old || {}, {
            company, role, stage: st, applied, where: t(f.where).slice(0, 60), how, link: link || '', salary: t(f.salary).slice(0, 60),
            closes, contact: t(f.contact).slice(0, 150), notes: t(f.notes).slice(0, 5000), followOn, interviews: sortIv(ivs)
        });
        const hist = (old && old.history ? old.history.slice() : []);
        if (!old) hist.push({ d: st === 'want' ? today : (st === 'applied' ? applied : today), s: st });
        else if (old.stage !== st) hist.push({ d: today, s: st });
        if (!old && st !== 'want' && st !== 'applied') hist.unshift({ d: applied, s: 'applied' });
        app.history = hist;
        if (!old) app.added = today;
        return { ok: true, app, moved: st !== stage };
    }

    // Changing the stage from the box.
    function setStage(app, k, today) {
        if (STAGE_KEYS.indexOf(k) < 0 || app.stage === k) return app;
        const n = Object.assign({}, app, { stage: k, history: (app.history || []).concat([{ d: today, s: k }]) });
        if (k !== 'want' && !n.applied) n.applied = today;
        return n;
    }
    function followedUp(app, today) {
        const h = (app.history || []).filter(x => !(x.s === 'followup' && x.d === today));
        return Object.assign({}, app, { followOn: '', history: h.concat([{ d: today, s: 'followup' }]) });
    }

    // ---------- the job search record (for a job centre or benefits office) ----------
    function recordEvents(apps, from, to) {
        const ev = [];
        apps.forEach(a => {
            if (a.stage !== 'want' && inRange(a.applied, from, to)) ev.push({ d: a.applied, type: 'applied', a });
            (a.history || []).forEach(h => { if (h.s === 'followup' && inRange(h.d, from, to)) ev.push({ d: h.d, type: 'followup', a }); });
            (a.interviews || []).forEach(i => { if (inRange(i.date, from, to)) ev.push({ d: i.date, type: 'interview', a, i }); });
        });
        const order = { applied: 0, followup: 1, interview: 2 };
        return ev.sort((x, y) => x.d.localeCompare(y.d) || order[x.type] - order[y.type] || x.a.company.localeCompare(y.a.company));
    }
    function recordText(apps, from, to, name) {
        const ev = recordEvents(apps, from, to);
        const n = k => ev.filter(e => e.type === k).length;
        const plural = (c, w) => c + ' ' + w + (c === 1 ? '' : 's');
        const lines = ['Job search record' + (name ? ' for ' + name : '') + ': ' + longDate(from) + ' to ' + longDate(to),
            plural(n('applied'), 'application') + ', ' + plural(n('interview'), 'interview') + ', ' + plural(n('followup'), 'follow-up')];
        let day = '';
        ev.forEach(e => {
            if (e.d !== day) { day = e.d; lines.push('', longDate(e.d)); }
            const a = e.a, job = a.role + ', ' + a.company;
            if (e.type === 'applied') {
                const det = [a.where ? 'found on ' + a.where : '', HOW_WORDS[a.how] || ''].filter(Boolean).join(', ');
                lines.push('- Applied: ' + job + (det ? ' (' + det + ')' : '') + '. Now: ' + stageName(a.stage) + '.');
            } else if (e.type === 'followup') lines.push('- Followed up: ' + job + '.');
            else lines.push('- Interview' + (e.i.time ? ' at ' + e.i.time : '') + ' (' + e.i.kind + '): ' + job + '.');
        });
        if (!ev.length) lines.push('', 'Nothing recorded in these dates.');
        return { text: lines.join('\n'), count: ev.length };
    }
    function csv(apps) {
        const q = v => { v = String(v == null ? '' : v); return /[",\n\r]/.test(v) || /^[=+\-@]/.test(v) ? '"' + (/^[=+\-@]/.test(v) ? "'" : '') + v.replace(/"/g, '""') + '"' : v; };
        const rows = [['Company', 'Job title', 'Stage', 'Date applied', 'Where found', 'How applied', 'Link', 'Salary', 'Advert closes', 'Contact', 'Interviews', 'Follow-ups', 'Notes']];
        apps.slice().sort((a, b) => (b.applied || '9').localeCompare(a.applied || '9')).forEach(a => rows.push([a.company, a.role, stageName(a.stage), a.applied, a.where, a.how, a.link, a.salary, a.closes, a.contact,
            (a.interviews || []).map(i => i.date + (i.time ? ' ' + i.time : '') + ' ' + i.kind).join('; '),
            (a.history || []).filter(h => h.s === 'followup').map(h => h.d).join('; '), a.notes]));
        return '\ufeff' + rows.map(r => r.map(q).join(',')).join('\r\n') + '\r\n';
    }

    // ---------- calendar file for one interview ----------
    function icsEsc(s) { return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
    function fold(line) { const out = []; while (line.length > 74) { out.push(line.slice(0, 74)); line = ' ' + line.slice(74); } out.push(line); return out.join('\r\n'); }
    function ics(app, iv, stamp, url) {
        const d = iv.date.replace(/-/g, '');
        const sum = 'Interview: ' + app.role + ' at ' + app.company + (iv.kind ? ' (' + iv.kind + ')' : '');
        const desc = [iv.notes, app.contact ? 'Contact: ' + app.contact : '', app.link ? 'Advert: ' + app.link : '', 'Job Application Tracker: ' + url].filter(Boolean).join('\n');
        const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//umar8092 apps//Job Application Tracker//EN', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
            'UID:interview-' + app.id + '-' + d + (iv.time || '').replace(':', '') + '@umar8092.github.io', 'DTSTAMP:' + stamp];
        if (iv.time) {
            const [h, m] = iv.time.split(':').map(Number), end = h * 60 + m + 60;
            const endDay = end >= 1440 ? addDays(iv.date, 1).replace(/-/g, '') : d, e = end % 1440;
            L.push('DTSTART:' + d + 'T' + pad(h) + pad(m) + '00', 'DTEND:' + endDay + 'T' + pad(Math.floor(e / 60)) + pad(e % 60) + '00');
        } else L.push('DTSTART;VALUE=DATE:' + d, 'DTEND;VALUE=DATE:' + addDays(iv.date, 1).replace(/-/g, ''));
        L.push(fold('SUMMARY:' + icsEsc(sum)), fold('DESCRIPTION:' + icsEsc(desc)));
        if (iv.kind === 'In person') L.push(fold('LOCATION:' + icsEsc(app.company)));
        L.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEsc(sum), 'TRIGGER:' + (iv.time ? '-P1D' : '-PT15H'), 'END:VALARM',
            'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEsc(sum), 'TRIGGER:' + (iv.time ? '-PT1H' : 'PT8H'), 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR');
        return L.join('\r\n') + '\r\n';
    }

    // ---------- saved state ----------
    const defaults = () => ({ follow: 7, goal: 0, weekStart: 1, name: '' });
    const emptyState = () => ({ v: 1, nid: 1, apps: [], settings: defaults() });
    const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
    function validate(s) {
        if (!s || typeof s !== 'object' || !Array.isArray(s.apps)) return null;
        const set = defaults(), ss = s.settings || {};
        if (Number.isInteger(ss.follow) && ss.follow >= 1 && ss.follow <= 60) set.follow = ss.follow;
        if (Number.isInteger(ss.goal) && ss.goal >= 0 && ss.goal <= 100) set.goal = ss.goal;
        if ([0, 1, 6].indexOf(ss.weekStart) >= 0) set.weekStart = ss.weekStart;
        set.name = str(ss.name, 80);
        const ids = new Set(); let max = 0;
        const apps = [];
        s.apps.slice(0, 5000).forEach(a => {
            if (!a || typeof a !== 'object') return;
            const company = str(a.company, 80).trim(), role = str(a.role, 100).trim();
            if (!company || !role) return;
            let id = Number.isInteger(a.id) && a.id > 0 && !ids.has(a.id) ? a.id : 0;
            const stage = STAGE_KEYS.indexOf(a.stage) >= 0 ? a.stage : 'applied';
            const n = {
                id, company, role, stage, applied: isIso(a.applied) ? a.applied : '', where: str(a.where, 60), how: HOW.indexOf(a.how) >= 0 ? a.how : '',
                link: cleanLink(str(a.link, 600)) || '', salary: str(a.salary, 60), closes: isIso(a.closes) ? a.closes : '', contact: str(a.contact, 150),
                notes: str(a.notes, 5000), followOn: isIso(a.followOn) ? a.followOn : '', added: isIso(a.added) ? a.added : '',
                interviews: sortIv((Array.isArray(a.interviews) ? a.interviews : []).filter(i => i && isIso(i.date)).slice(0, 50)
                    .map(i => ({ date: i.date, time: isTime(i.time) ? i.time : '', kind: KINDS.indexOf(i.kind) >= 0 ? i.kind : 'Other', notes: str(i.notes, 500) }))),
                history: (Array.isArray(a.history) ? a.history : []).filter(h => h && isIso(h.d) && (STAGE_KEYS.indexOf(h.s) >= 0 || h.s === 'followup')).slice(0, 500).map(h => ({ d: h.d, s: h.s }))
            };
            if (n.stage !== 'want' && !n.applied) n.applied = n.added || (n.history[0] && n.history[0].d) || '';
            if (n.stage !== 'want' && !n.applied) return;
            apps.push(n); if (id) { ids.add(id); max = Math.max(max, id); }
        });
        apps.forEach(a => { if (!a.id) { a.id = ++max; ids.add(a.id); } });
        const nid = Math.max(max + 1, Number.isInteger(s.nid) ? s.nid : 1);
        return { v: 1, nid, apps, settings: set };
    }

    const api = { STAGES, STAGE_KEYS, ACTIVE, CLOSED, WAITING, HOW, KINDS, stageName, todayIso, isIso, isTime, addDays, diff, shortDate, longDate, ago, rel, weekRange,
        stageDate, lastFollow, nextInterview, lastPastInterview, followUp, status, counts, summary, weekLine, sorted, matches, duplicates,
        sourceFromLink, cleanLink, parsePaste, readForm, setStage, followedUp, recordEvents, recordText, csv, ics, emptyState, validate };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.JobCore = api;
})(typeof window !== 'undefined' ? window : this);
