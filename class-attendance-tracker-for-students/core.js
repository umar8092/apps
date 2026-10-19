// Class Attendance Tracker for Students: the logic, no page code.
// All maths is in whole numbers. A required percent is kept in hundredths (75% = 7500), so "attended / held >= 75%"
// is checked as attended * 10000 >= 7500 * held, with no rounding. Percents are shown cut down to one decimal,
// never rounded up, so 74.98% shows as 74.9% and never as 75.0%.
(function (root) {
    'use strict';
    const SLUG = 'class-attendance-tracker-for-students';
    const FULL = 10000;                        // 100% in hundredths
    const MAX_SUBJECTS = 40, MAX_COUNT = 5000, MAX_LEFT = 1000, MAX_LOG = 60;
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    const pad = n => String(n).padStart(2, '0');
    const plural = (n, one, many) => n + ' ' + (n === 1 ? one : (many || one + 'es'));
    const classes = n => plural(n, 'class');
    const divCeil = (a, b) => Math.floor((a + b - 1) / b);   // a >= 0, b > 0

    function todayIso(now) { const d = now || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
    function isDate(v) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v == null ? '' : v)); if (!m) return false;
        const y = +m[1], mo = +m[2], d = +m[3];
        return y >= 2000 && y <= 2200 && mo >= 1 && mo <= 12 && d >= 1 && d <= new Date(Date.UTC(y, mo, 0)).getUTCDate();
    }
    function shortDate(iso) { if (!isDate(iso)) return ''; const [y, m, d] = iso.split('-').map(Number); return DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] + ' ' + d + ' ' + MONTHS[m - 1]; }
    function longDate(iso) { if (!isDate(iso)) return ''; const [y, m, d] = iso.split('-').map(Number); return d + ' ' + MONTHS[m - 1] + ' ' + y; }

    // ---- reading what the person typed
    // Whole numbers: spaces and thousands commas are ignored ("1,200" = 1200). Blank means 0 when blankZero is set.
    function readCount(v, max, blankZero) {
        const s = String(v == null ? '' : v).replace(/[\s,]/g, '');
        if (s === '') return blankZero ? { ok: true, n: 0 } : { ok: false, err: 'blank' };
        if (!/^\d+$/.test(s)) return { ok: false, err: /^-/.test(s) ? 'negative' : /[.]/.test(s) ? 'decimal' : 'nan' };
        const n = Number(s);
        if (n > max) return { ok: false, err: 'big' };
        return { ok: true, n };
    }
    // A percent like 75, 66.67 or 66,67 -> hundredths (7500, 6667). 1% to 100%.
    function readPct(v) {
        const s = String(v == null ? '' : v).replace(/\s|%/g, '').replace(',', '.');
        if (s === '') return { ok: false, err: 'blank' };
        const m = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(s);
        if (!m) return { ok: false, err: 'nan' };
        const bp = Number(m[1]) * 100 + Number(((m[2] || '') + '00').slice(0, 2));
        if (bp < 100 || bp > FULL) return { ok: false, err: 'range' };
        return { ok: true, bp };
    }
    function pctLabel(bp) { const whole = Math.floor(bp / 100), frac = bp % 100; return whole + (frac ? '.' + pad(frac).replace(/0$/, '') : '') + '%'; }
    // attended / held as a percent cut to one decimal (never rounded up). '' when nothing is held.
    function pctOf(att, held) { if (!held) return ''; const t = Math.floor(att * 1000 / held); return Math.floor(t / 10) + '.' + (t % 10) + '%'; }

    // ---- the answers for one subject. s = { held, att, bp, w, left } with held/att in counted classes, left in classes (or null)
    function stats(s) {
        const held = s.held, att = s.att, bp = s.bp, w = s.w || 1;
        const r = { held, att, bp, w, pct: pctOf(att, held), status: 'none' };
        r.ifMiss = pctOf(att, held + w);
        r.ifAttend = pctOf(att + w, held + w);
        if (held > 0) {
            const gap = att * FULL - bp * held;           // >= 0 means at or above the line
            if (gap >= 0) {
                r.canMiss = Math.floor(gap / (bp * w));
                r.status = r.canMiss >= 1 ? 'safe' : 'edge';
                // how many to attend before you can miss one
                if (r.canMiss === 0 && bp < FULL) r.toSpare = divCeil(bp * w - gap, w * (FULL - bp));
            } else {
                r.status = 'below';
                r.need = bp >= FULL ? null : divCeil(-gap, w * (FULL - bp));   // null: 100% can never be reached again
            }
        }
        if (Number.isInteger(s.left)) {
            const L = s.left, endHeld = held + L * w;
            const p = { left: L };
            if (endHeld === 0) p.none = true;
            else {
                const must = Math.max(0, divCeil(Math.max(0, bp * endHeld - att * FULL), w * FULL));
                if (must > L) { p.impossible = true; p.best = pctOf(att + L * w, endHeld); }
                else { p.must = must; p.spare = L - must; p.ifAll = pctOf(att + L * w, endHeld); }
            }
            r.plan = p;
        }
        return r;
    }

    const STATUS = { safe: 'Safe', edge: 'On the line', below: 'Below', none: 'No classes yet' };
    function badge(st, bp) { return st.status === 'below' ? 'Below ' + pctLabel(bp) : STATUS[st.status]; }

    // The plain-words answer for one subject: { main, extra }.
    function advice(st) {
        const line = pctLabel(st.bp);
        let main, extra = '';
        if (st.status === 'none') main = 'No classes yet. Tap Present or Absent after each class.';
        else if (st.status === 'safe') main = 'You can miss ' + classes(st.canMiss) + ' and stay at ' + line + ' or above.';
        else if (st.status === 'edge') {
            main = 'Do not miss the next class: it would drop you to ' + st.ifMiss + '.';
            if (st.toSpare) extra = 'Attend the next ' + classes(st.toSpare) + ' to be able to miss 1.';
        } else if (st.need == null) main = 'You have missed a class, so you can no longer get back to 100%.';
        else main = 'Attend the next ' + classes(st.need) + ' in a row to get back to ' + line + '.';
        return { main, extra };
    }
    function planText(st) {
        const p = st.plan; if (!p) return '';
        const line = pctLabel(st.bp);
        if (p.none) return 'No classes left this term.';
        if (p.left === 0) return p.impossible ? 'The term is over at ' + st.pct + ', below ' + line + '.' : 'No classes left this term. You end at ' + st.pct + '.';
        if (p.impossible) return 'Even if you attend all ' + classes(p.left) + ' left, you end the term at ' + p.best + ', below ' + line + '. Ask your college about medical leave or extra classes.';
        if (p.spare === 0) return 'To end the term at ' + line + ', attend all ' + classes(p.left) + ' left.';
        return 'To end the term at ' + line + ', attend at least ' + p.must + ' of the ' + classes(p.left) + ' left (you can miss ' + p.spare + ').';
    }

    // ---- all subjects
    function overall(subjects) {
        let held = 0, att = 0;
        subjects.forEach(s => { held += s.held; att += s.att; });
        const bps = [...new Set(subjects.map(s => s.bp))];
        return { held, att, pct: pctOf(att, held), oneRule: bps.length === 1 ? bps[0] : null,
            safe: bps.length === 1 && held > 0 ? att * FULL >= bps[0] * held : null };
    }
    function summary(subjects) {
        const rows = subjects.map(s => ({ s, st: stats(s) }));
        return { below: rows.filter(r => r.st.status === 'below'), edge: rows.filter(r => r.st.status === 'edge'),
            safe: rows.filter(r => r.st.status === 'safe'), none: rows.filter(r => r.st.status === 'none'), all: overall(subjects) };
    }

    // ---- marking a class. kind: 'p' present, 'a' absent, 'c' cancelled (not counted). Returns a new subject.
    function mark(s, kind, date) {
        const n = Object.assign({}, s, { log: (s.log || []).slice() });
        const w = n.w || 1;
        if (kind === 'p') { if (n.held + w > MAX_COUNT) return null; n.held += w; n.att += w; }
        else if (kind === 'a') { if (n.held + w > MAX_COUNT) return null; n.held += w; }
        else if (kind !== 'c') return null;
        if (Number.isInteger(n.left) && n.left > 0) n.left -= 1;
        n.log.push({ d: date, k: kind });
        if (n.log.length > MAX_LOG) n.log = n.log.slice(-MAX_LOG);
        return n;
    }

    // ---- text to copy or email
    function subjectText(s) {
        const st = stats(s), a = advice(st);
        let t = s.name + ': ' + (s.held ? s.att + ' of ' + s.held + ' (' + st.pct + ')' : 'no classes yet') + ', needs ' + pctLabel(s.bp) + '. ' + a.main;
        const p = planText(st); if (p) t += ' ' + p;
        return t;
    }
    function listText(state, today) {
        const lines = ['Class attendance on ' + longDate(today)];
        if (state.term) lines[0] += ' (' + state.term + ')';
        lines.push('');
        state.subjects.forEach(s => lines.push(subjectText(s)));
        const o = overall(state.subjects);
        if (o.held) { lines.push(''); lines.push('All subjects together: ' + o.att + ' of ' + o.held + ' (' + o.pct + ')'); }
        return lines.join('\n');
    }

    // ---- reading the add/edit form. f = raw strings. Returns { ok, subject } or { ok:false, errors:{field:msg} }
    function readForm(f, others) {
        const errors = {};
        const name = clip(f.name, 50);
        if (!name) errors.name = 'Type the subject name, like Physics.';
        else if (others.some(o => o.name.toLowerCase() === name.toLowerCase())) errors.name = 'You already have ' + name + '. Use a different name, like ' + name + ' lab.';
        let bp = null;
        if (f.rule === 'other') { const p = readPct(f.pct); if (p.ok) bp = p.bp; else errors.pct = 'Type a percent from 1 to 100, like 75.'; }
        else { const p = readPct(f.rule); if (p.ok) bp = p.bp; else errors.pct = 'Choose the attendance your college needs.'; }
        const countErr = (r, what) => r.err === 'negative' ? what + ' cannot be below 0.' : r.err === 'decimal' ? 'Use a whole number of classes for ' + what.toLowerCase() + '.' :
            r.err === 'big' ? 'Use a number up to ' + MAX_COUNT + '.' : 'Type a whole number, like 24.';
        const h = readCount(f.held, MAX_COUNT, true), a = readCount(f.att, MAX_COUNT, true);
        if (!h.ok) errors.held = countErr(h, 'Classes held');
        if (!a.ok) errors.att = countErr(a, 'Classes attended');
        if (h.ok && a.ok && a.n > h.n) errors.att = 'Attended (' + a.n + ') cannot be more than held (' + h.n + ').';
        const w = [1, 2, 3].includes(Number(f.w)) ? Number(f.w) : 1;
        let left = null;
        if (String(f.left == null ? '' : f.left).trim() !== '') {
            const l = readCount(f.left, MAX_LEFT, false);
            if (l.ok) left = l.n; else errors.left = l.err === 'big' ? 'Use a number up to ' + MAX_LEFT + '.' : 'Type a whole number of classes, like 12, or leave it blank.';
        }
        if (Object.keys(errors).length) return { ok: false, errors };
        return { ok: true, subject: { name, bp, w, held: h.n, att: a.n, left } };
    }

    // ---- saved state
    function emptyState() { return { v: 1, nextId: 1, rule: 7500, term: '', subjects: [], last: null }; }
    function clip(v, max) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max); }
    const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
    function cleanSubject(x, ids) {
        if (!x || typeof x !== 'object' || !int(x.id, 1, 1e9) || ids.has(x.id)) return null;
        const name = clip(x.name, 50); if (!name) return null;
        if (!int(x.held, 0, MAX_COUNT) || !int(x.att, 0, x.held)) return null;
        const s = { id: x.id, name, bp: int(x.bp, 100, FULL) ? x.bp : 7500, w: [1, 2, 3].includes(x.w) ? x.w : 1, held: x.held, att: x.att,
            left: int(x.left, 0, MAX_LEFT) ? x.left : null };
        s.log = (Array.isArray(x.log) ? x.log : []).filter(e => e && isDate(e.d) && ['p', 'a', 'c'].includes(e.k)).slice(-MAX_LOG).map(e => ({ d: e.d, k: e.k }));
        ids.add(s.id);
        return s;
    }
    function validate(raw) {
        if (!raw || typeof raw !== 'object' || !Array.isArray(raw.subjects)) return null;
        const s = emptyState(), ids = new Set();
        s.rule = int(raw.rule, 100, FULL) ? raw.rule : 7500;
        s.term = clip(raw.term, 40);
        s.subjects = raw.subjects.map(x => cleanSubject(x, ids)).filter(Boolean).slice(0, MAX_SUBJECTS);
        const maxId = s.subjects.reduce((m, x) => Math.max(m, x.id), 0);
        s.nextId = int(raw.nextId, maxId + 1, 1e9) ? raw.nextId : maxId + 1;
        if (raw.last && typeof raw.last === 'object' && Array.isArray(raw.last.subjects)) {
            const lid = new Set();
            const subs = raw.last.subjects.map(x => cleanSubject(x, lid)).filter(Boolean).slice(0, MAX_SUBJECTS);
            if (subs.length) s.last = { ended: isDate(raw.last.ended) ? raw.last.ended : '', term: clip(raw.last.term, 40), subjects: subs };
        }
        return s;
    }
    // A backup file is { app, saved, state }; a bare state is accepted too.
    function readBackup(text) {
        let j; try { j = JSON.parse(text); } catch (e) { return null; }
        if (j && j.app && j.app !== SLUG) return null;
        return validate(j && j.state ? j.state : j);
    }

    const api = { SLUG, FULL, MAX_SUBJECTS, MAX_COUNT, MAX_LEFT, todayIso, isDate, shortDate, longDate, readCount, readPct, pctLabel, pctOf,
        stats, badge, advice, planText, overall, summary, mark, subjectText, listText, readForm, emptyState, validate, readBackup, clip, classes };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.AttendCore = api;
})(this);
