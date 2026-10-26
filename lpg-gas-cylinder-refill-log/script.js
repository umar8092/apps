// LPG Gas Cylinder Refill Log: the page. The maths and the words are in core.js (window.LPG).
(function () {
    'use strict';
    const C = window.LPG, SLUG = 'lpg-gas-cylinder-refill-log', KEY = SLUG + '.state';
    const $ = id => document.getElementById(id);
    // a locale Intl accepts (some systems report tags such as "en-US@posix")
    const LOC = (() => { for (const l of [navigator.language, String(navigator.language || '').split(/[@.]/)[0], 'en-GB']) { try { if (l && Intl.getCanonicalLocales(l).length) return l; } catch (e) { /* try the next */ } } return 'en-GB'; })();
    const CUR_NAMES = { '': 'None (plain numbers)', 'Rs': 'Rs (rupee)', '₹': '₹ (rupee)', '$': '$ (dollar)', '€': '€ (euro)', '£': '£ (pound)', '৳': '৳ (taka)', '₦': '₦ (naira)',
        'KSh': 'KSh (shilling)', '₵': '₵ (cedi)', 'R': 'R (rand)', '₱': '₱ (peso)', 'Rp': 'Rp (rupiah)', 'RM': 'RM (ringgit)', 'AED': 'AED (dirham)', 'SAR': 'SAR (riyal)',
        '¥': '¥ (yen, yuan)', '₩': '₩ (won)', '₺': '₺ (lira)', 'R$': 'R$ (real)', 'E£': 'E£ (Egyptian pound)', 'A$': 'A$ (Australian dollar)', 'C$': 'C$ (Canadian dollar)', 'kr': 'kr (krona, krone)', 'CHF': 'CHF (franc)', 'zł': 'zł (złoty)' };
    let state = C.emptyState(), today = C.localDay(new Date());
    let editing = null;        // id of the cylinder in the form, or null when adding
    let drafts = {};           // typed but not saved refills per cylinder: { d, g, c }
    let editRef = null;        // { cid, rid } refill being edited
    let showAll = {};          // cylinder id -> show every refill
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
        flash = { where, text, undo: true };
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
    }

    // ---------- helpers ----------
    function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
    function btn(text, cls, fn, label) { const b = el('button', cls, text); b.type = 'button'; if (label) b.setAttribute('aria-label', label); b.addEventListener('click', fn); return b; }
    function p(cls, text) { return el('p', cls, text); }
    const money = c => C.fmtMoney(c, state.cur, LOC);
    const date = (s, o) => C.fmtDate(s, LOC, o);
    const gas = (c, g, max) => C.fmtGas(g, c.unit, LOC, max);
    const byId = id => state.cyls.find(x => x.id === id);
    const newId = pre => pre + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const perUnit = (c, ppu) => money(ppu) + ' a ' + c.unit;
    const yearOpt = s => s.slice(0, 4) === today.slice(0, 4) ? undefined : true;
    function copyText(text, where) {
        const done = () => { flash = { where, text: 'Copied. Paste it into a message or email.' }; render(); };
        const fallback = () => {
            const t = el('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.position = 'absolute'; t.style.left = '-9999px';
            document.body.appendChild(t); t.select();
            let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
            t.remove();
            if (ok) done(); else { flash = { where, text: 'Could not copy here. Use Email instead.', bad: true }; render(); }
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

    // ---------- the cylinder form ----------
    function fillCur() {
        const sel = $('cur');
        Object.keys(CUR_NAMES).forEach(k => { const o = el('option', null, CUR_NAMES[k]); o.value = k; sel.appendChild(o); });
        if (state.cur && !(state.cur in CUR_NAMES)) { const o = el('option', null, state.cur); o.value = state.cur; sel.appendChild(o); }
        sel.value = state.cur;
    }
    function sizeMode() { $('f-osize-box').hidden = $('f-size').value !== 'other'; if ($('f-osize-box').hidden) setErr('f-osize', ''); }
    function openUsual(open) { $('f-usual-box').hidden = !open; $('f-usual-open').hidden = open; }
    function resetForm() {
        editing = null;
        $('f-name').value = ''; $('f-size').value = '11800|kg'; $('f-osize').value = ''; $('f-ounit').value = 'kg';
        $('f-lead').value = '2'; $('f-spare').checked = false; $('f-usual').value = '';
        ['f-name', 'f-osize', 'f-usual'].forEach(id => setErr(id, ''));
        sizeMode(); openUsual(false);
    }
    function fillForm(c) {
        resetForm();
        editing = c.id;
        $('f-name').value = c.name;
        const v = c.size + '|' + c.unit;
        if ([...$('f-size').options].some(o => o.value === v)) $('f-size').value = v;
        else { $('f-size').value = 'other'; $('f-osize').value = C.fmtNum(c.size / 1000, 'en-US').replace(/,/g, ''); $('f-ounit').value = c.unit; }
        $('f-lead').value = [...$('f-lead').options].some(o => o.value === String(c.lead)) ? String(c.lead) : '2';
        $('f-spare').checked = !!c.spare;
        if (c.usual) { $('f-usual').value = String(c.usual); openUsual(true); }
        sizeMode();
    }
    function readForm() {
        let ok = true;
        const name = $('f-name').value.trim();
        if (!name) ok = setErr('f-name', 'Type a name, such as Kitchen.') && ok; else setErr('f-name', '');
        let size, unit;
        if ($('f-size').value === 'other') {
            const r = C.parseGas($('f-osize').value);
            if (r.error) ok = setErr('f-osize', r.error) && ok;
            else { setErr('f-osize', ''); size = r.n; unit = $('f-ounit').value; }
        } else { const [s, u] = $('f-size').value.split('|'); size = Number(s); unit = u; }
        let usual;
        if (!$('f-usual-box').hidden && $('f-usual').value.trim()) {
            const r = C.parseDays($('f-usual').value);
            if (r.error) ok = setErr('f-usual', r.error) && ok; else { setErr('f-usual', ''); usual = r.n; }
        } else setErr('f-usual', '');
        if (!ok) { const bad = document.querySelector('#add [aria-invalid="true"]'); if (bad) bad.focus(); return null; }
        const o = { name, size, unit, lead: Number($('f-lead').value), spare: $('f-spare').checked };
        if (usual) o.usual = usual;
        return o;
    }
    function saveCyl() {
        const f = readForm();
        if (!f) return;
        if (editing) {
            const c = byId(editing);
            if (!c) { resetForm(); render(); return; }
            // a smaller size can make a typed amount too big for it
            if (c.refills.some(r => r.g != null && r.g * 5 > f.size * 6)) { flash = { where: 'add-msg', text: 'Some refills of ' + c.name + ' have more gas than this size holds. Pick a bigger size, or edit those refills first.', bad: true }; render(); return; }
            const id = c.id;
            change(() => { Object.assign(c, f); if (!f.usual) delete c.usual; }, 'top-msg', 'Saved the changes to ' + f.name + '.');
            resetForm(); render();
            const b = document.querySelector('[data-id="' + id + '"]'); if (b) b.scrollIntoView({ block: 'start' });
            return;
        }
        const c = Object.assign({ id: newId('c'), refills: [] }, f);
        change(() => { state.cyls.push(c); }, 'top-msg', 'Added ' + c.name + '. Now log the cylinder you are using now.');
        resetForm(); render();
        const d = document.getElementById('rd-' + c.id);
        if (d) { d.closest('.cyl').scrollIntoView({ block: 'start' }); d.focus(); }
    }

    // ---------- refills ----------
    function draftOf(id) { return drafts[id] || (drafts[id] = { d: today, g: '', c: '' }); }
    // reads a refill from inputs; returns the refill or null after showing the errors
    function readRefill(c, ids, rid) {
        const r = { d: $(ids.d).value };
        let ok = true;
        [ids.d, ids.g, ids.c, ids.out].forEach(id => id && setErr(id, ''));
        const gt = $(ids.g).value.trim();
        if (gt) { const x = C.parseGas(gt); if (x.error) ok = setErr(ids.g, x.error) && ok; else r.g = x.n; }
        const ct = $(ids.c).value.trim();
        if (ct) { const x = C.parseMoney(ct); if (x.error) ok = setErr(ids.c, x.error) && ok; else r.c = x.n; }
        if (ids.out && $(ids.out) && $(ids.out).value) r.out = $(ids.out).value;
        if (!r.d) ok = setErr(ids.d, 'Pick the date it was put on.') && ok;
        if (ok) {
            const e = C.checkRefill(c, r, today, rid);
            if (e) ok = setErr({ d: ids.d, g: ids.g, out: ids.out }[e.field], e.error) && ok;
        }
        if (!ok) { const bad = document.querySelector('[data-id="' + c.id + '"] [aria-invalid="true"]'); if (bad) bad.focus(); return null; }
        if (r.g === c.size) delete r.g;
        return r;
    }
    function saveRefill(c) {
        const r = readRefill(c, { d: 'rd-' + c.id, g: 'rg-' + c.id, c: 'rc-' + c.id });
        if (!r) return;
        r.id = newId('r');
        drafts[c.id] = null;
        change(() => { c.refills.push(r); }, 'cm-' + c.id, 'Saved the refill of ' + date(r.d, yearOpt(r.d)) + '.');
    }
    function saveEdit(c, old) {
        const r = readRefill(c, { d: 'ed-' + old.id, g: 'eg-' + old.id, c: 'ec-' + old.id, out: 'eo-' + old.id }, old.id);
        if (!r) return;
        editRef = null;
        change(() => { ['g', 'c', 'out'].forEach(k => delete old[k]); Object.assign(old, r); }, 'cm-' + c.id, 'Saved the changes.');
    }
    function ranOut(c, a) {
        const r = c.refills.find(x => x.id === a.cur.r.id);
        if (!r) return;
        if (r.d > today) return;
        change(() => { r.out = today; }, 'cm-' + c.id, 'Marked as empty today. Log the refill when you put on a full cylinder.');
    }

    // ---------- words for one cylinder ----------
    function summaryText(c, a) {
        const L = [c.name + ' gas cylinder (' + C.sizeLabel(c, LOC) + ')'];
        if (a.status === 'empty') L.push('Empty since ' + date(a.emptySince, yearOpt(a.emptySince)) + '.');
        else if (a.emptyDay) {
            L.push('Likely empty around ' + date(a.emptyDay, 'wd') + ' (' + C.inDays(a.daysLeft) + ').');
            if (!c.spare) L.push('Get a refill by ' + date(a.bookDay, 'wd') + '.');
            L.push('About ' + gas(c, a.left, 1) + ' left (estimated).');
        } else if (a.cur) L.push('In use since ' + date(a.cur.r.d, yearOpt(a.cur.r.d)) + ' (' + C.daysWord(a.cur.running) + ').');
        if (a.rate) L.push('A full cylinder usually lasts ' + C.daysWord(a.fullDays) + '.');
        if (a.price) L.push('Price: ' + perUnit(c, a.price.ppu) + (a.price.trend && a.price.trend.pct ? ', ' + (a.price.trend.pct > 0 ? 'up ' : 'down ') + Math.abs(a.price.trend.pct) + '% since ' + date(a.price.trend.since, true) : '') + '.');
        if (a.month != null) L.push('Gas costs about ' + money(a.month) + ' a month.');
        if (a.rows.length) {
            L.push('', 'Refills:');
            a.rows.slice(0, 12).forEach(x => L.push(date(x.r.d, true) + ': ' + gas(c, x.g) + (x.r.c != null ? ', ' + money(x.r.c) : '') + (x.inUse ? ' (in use)' : x.days != null ? ', lasted ' + C.daysWord(x.days) : '')));
        }
        return L.join('\n');
    }
    function calendar(c, a) {
        const day = a.bookDay && a.bookDay > today ? a.bookDay : today;
        const d = day.replace(/-/g, ''), d2 = C.addDays(day, 1).replace(/-/g, '');
        const esc = s => s.replace(/[\\;,]/g, m => '\\' + m).replace(/\n/g, '\\n');
        const title = (c.spare ? 'Swap to the spare gas cylinder: ' : 'Get an LPG refill: ') + c.name;
        const desc = 'Likely empty around ' + date(a.emptyDay, 'wd') + '. From the LPG Gas Cylinder Refill Log.';
        const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
        const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//umar8092//LPG Gas Cylinder Refill Log//EN', 'BEGIN:VEVENT', 'UID:' + c.id + '-' + d + '@umar8092.github.io',
            'DTSTAMP:' + stamp, 'DTSTART;VALUE=DATE:' + d, 'DTEND;VALUE=DATE:' + d2, 'SUMMARY:' + esc(title), 'DESCRIPTION:' + esc(desc),
            'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc(title), 'TRIGGER:PT9H', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
        download('lpg-refill-' + (c.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'cylinder') + '.ics', 'text/calendar', ics);
        flash = { where: 'cm-' + c.id, text: 'Calendar file saved. Open it to add the reminder for ' + date(day, 'wd') + '.' }; render();
    }

    // ---------- one cylinder box ----------
    function answerBlock(c, a, box) {
        const res = el('div', 'res');
        if (a.status === 'start') {
            res.appendChild(p('r-big', 'Start here'));
            res.appendChild(p('r-note', 'Log the cylinder you are using now: the day it was put on and, if you know it, the price. Then log each refill as you put on a full cylinder.'));
            box.appendChild(res); return;
        }
        if (a.status === 'empty') {
            const act = el('div', 'act is-empty');
            act.appendChild(p('a-big', 'Empty since ' + date(a.emptySince, 'wd')));
            act.appendChild(p('a-note', (a.emptyDays ? C.daysWord(a.emptyDays) + ' without gas. ' : '') + (c.spare ? 'Connect the spare and log it as a refill below.' : 'Log the refill below when you put on a full cylinder.')));
            res.appendChild(act);
        } else if (a.status === 'learning') {
            res.appendChild(p('r-label', 'In use since ' + date(a.cur.r.d, yearOpt(a.cur.r.d))));
            res.appendChild(p('r-big', C.daysWord(a.cur.running)));
            res.appendChild(p('r-note', 'Not sure yet when it will run out. When it does, tap "It ran out today", then log the refill: from then on the app knows how long a cylinder lasts you. Or tap Edit cylinder and type how many days one usually lasts.'));
        } else {
            const w = el('div', 'when');
            w.appendChild(p('r-label', 'Likely empty around'));
            w.appendChild(p('r-big', date(a.emptyDay, 'wd')));
            w.appendChild(p('r-line', a.daysLeft >= 0 ? (a.daysLeft === 0 ? 'Today' : C.inDays(a.daysLeft).replace(/^in/, 'In')) + ', put on ' + date(a.cur.r.d, yearOpt(a.cur.r.d)) + ' (' + C.daysWord(a.cur.running) + ' ago)' : 'Expected ' + C.inDays(a.daysLeft) + ', put on ' + date(a.cur.r.d, yearOpt(a.cur.r.d))));
            res.appendChild(w);
            const act = el('div', 'act is-' + a.status);
            let big, note;
            if (a.status === 'late') {
                big = 'It should be empty by now';
                note = 'Expected around ' + date(a.emptyDay) + '. When it runs out, tap "It ran out today", or log the refill if you already changed it.';
            } else if (c.spare) {
                big = a.daysLeft === 0 ? 'Swap to the spare today or tomorrow' : 'Swap to the spare around ' + date(a.emptyDay, 'wd');
                note = 'Then get the empty one refilled, so a full spare is ready again.';
            } else if (a.status === 'due') {
                big = a.daysLeft === 0 ? 'Get a refill today' : 'Get a refill now';
                note = a.daysLeft === 0 ? 'It should run out today.' : 'It should run out ' + C.inDays(a.daysLeft) + '.';
            } else {
                big = 'Get a refill by ' + date(a.bookDay, 'wd');
                note = C.inDays(C.diff(today, a.bookDay)).replace(/^in/, 'In') + (c.lead ? ', ' + C.daysWord(c.lead) + ' before it should run out.' : ', the day it should run out.');
            }
            act.appendChild(p('a-big', big)); act.appendChild(p('a-note', note));
            res.appendChild(act);
            const left = el('div', 'left');
            left.appendChild(p('r-line strong', 'About ' + gas(c, a.left, 1) + ' left (' + a.leftPct + '%), estimated'));
            const bar = el('div', 'bar'); bar.setAttribute('aria-hidden', 'true');
            const fill = el('span'); fill.style.width = a.leftPct + '%'; bar.appendChild(fill); left.appendChild(bar);
            res.appendChild(left);
        }
        if (a.rate) {
            const kgDay = C.fmtNum(a.rate.g / a.rate.d / 1000, LOC, 2);
            res.appendChild(p('r-note', 'A full ' + C.sizeLabel(c, LOC) + ' cylinder usually lasts ' + C.daysWord(a.fullDays) + ' (' + kgDay + ' ' + c.unit + ' a day, ' +
                (a.rate.typed ? 'from the days you typed' : a.rate.n === 1 ? 'from your last cylinder' : 'from your last ' + a.rate.n + ' cylinders') + ').'));
        }
        box.appendChild(res);
        // the newest finished cylinder ran out too soon
        const lastDone = a.rows.find(x => x.days != null);
        if (lastDone && lastDone.flag && lastDone.flag.kind === 'short') {
            const f = p('flag'); f.appendChild(el('b', null, 'Ran out ' + C.daysWord(lastDone.flag.by) + ' sooner than usual. '));
            f.appendChild(document.createTextNode('The cylinder put on ' + date(lastDone.r.d, yearOpt(lastDone.r.d)) + ' lasted ' + C.daysWord(lastDone.days) + '; that much gas usually lasts you ' + C.daysWord(lastDone.flag.usual) + '. If you did not use more gas than usual, it may have been under-filled, or there may be a leak.'));
            box.appendChild(f);
        }
        if (a.price || a.spentYear.n) {
            const m = el('div', 'money');
            if (a.price) {
                const line = p(null, 'Price now: ' + perUnit(c, a.price.ppu) + ' (' + date(a.price.d, yearOpt(a.price.d)) + ')');
                const t = a.price.trend;
                if (t) {
                    line.appendChild(document.createTextNode(', '));
                    line.appendChild(el('span', t.pct > 0 ? 'up' : t.pct < 0 ? 'down' : null, t.pct > 0 ? 'up ' + t.pct + '%' : t.pct < 0 ? 'down ' + (-t.pct) + '%' : 'the same'));
                    line.appendChild(document.createTextNode(' since ' + date(t.since, yearOpt(t.since)) + ' (' + perUnit(c, t.was) + ')'));
                }
                m.appendChild(line);
                if (a.month != null) m.appendChild(p(null, 'Gas costs you about ' + money(a.month) + ' a month at this price.'));
            }
            const parts = [];
            if (a.spentMonth.n) parts.push(money(a.spentMonth.c) + ' this month' + (a.spentYear.n === a.spentMonth.n ? ' and this year' : '') + ' (' + a.spentMonth.n + (a.spentMonth.n === 1 ? ' refill)' : ' refills)'));
            if (a.spentYear.n && (a.spentYear.n !== a.spentMonth.n)) parts.push(money(a.spentYear.c) + ' in ' + today.slice(0, 4) + ' (' + a.spentYear.n + (a.spentYear.n === 1 ? ' refill)' : ' refills)'));
            if (parts.length) m.appendChild(p(null, 'Spent on refills: ' + parts.join(', ') + '.'));
            box.appendChild(m);
        }
    }
    function field(labelText, id, input, errId) {
        const f = el('div', 'field');
        const l = el('label', null, labelText); l.htmlFor = id; f.appendChild(l);
        f.appendChild(input);
        const e = p('err'); e.id = (errId || id) + '-err'; e.setAttribute('role', 'alert'); f.appendChild(e);
        input.setAttribute('aria-describedby', e.id);
        return f;
    }
    function textInput(id, value, placeholder, mode) {
        const i = el('input'); i.type = 'text'; i.id = id; i.value = value || ''; i.placeholder = placeholder || ''; i.autocomplete = 'off'; i.maxLength = 16; i.inputMode = mode || 'decimal';
        return i;
    }
    function dateInput(id, value) { const i = el('input'); i.type = 'date'; i.id = id; i.value = value || ''; i.max = today; return i; }
    function amountRow(input, suffix, prefix) {
        const r = el('div', 'amount-row');
        if (prefix && state.cur) r.appendChild(el('span', 'cur-tag', state.cur));
        r.appendChild(input);
        if (suffix) r.appendChild(el('span', 'suffix', suffix));
        return r;
    }
    function gasField(c, id, value) {
        const i = textInput(id, value, 'full, ' + C.fmtNum(c.size / 1000, LOC));
        const f = field('Gas filled', id, amountRow(i, c.unit));
        return f;
    }
    function logBlock(c, a, box) {
        const wrap = el('div', 'log');
        if (a.cur && a.cur.r.d <= today) wrap.appendChild(btn('It ran out today', 'secondary out-btn', () => ranOut(c, a)));
        const h = el('h3', null, a.status === 'start' ? 'Log the cylinder in use now' : 'Log a refill');
        wrap.appendChild(h);
        const d = draftOf(c.id);
        const di = dateInput('rd-' + c.id, d.d);
        di.addEventListener('input', () => { d.d = di.value; });
        wrap.appendChild(field('Date the full cylinder was put on', di.id, di));
        const two = el('div', 'two refill-two');
        const gf = gasField(c, 'rg-' + c.id, d.g);
        gf.querySelector('input').addEventListener('input', e => { d.g = e.target.value; });
        const ci = textInput('rc-' + c.id, d.c, 'e.g. 3200');
        ci.addEventListener('input', () => { d.c = ci.value; });
        two.appendChild(gf);
        two.appendChild(field('Price paid (optional)', ci.id, amountRow(ci, null, true)));
        wrap.appendChild(two);
        wrap.appendChild(p('hint', 'Leave Gas filled empty for a full ' + C.sizeLabel(c, LOC) + ' cylinder, or type less for a partial refill.'));
        const s = btn('Save refill', 'primary save-r', () => saveRefill(c));
        wrap.appendChild(s);
        wrap.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.closest('.log') === wrap) { e.preventDefault(); saveRefill(c); } });
        box.appendChild(wrap);
    }
    function rowWords(c, x) {
        if (x.inUse) return 'In use, ' + C.daysWord(x.running) + ' so far';
        if (x.r.out) return 'Ran out ' + date(x.r.out, yearOpt(x.r.out)) + ' after ' + C.daysWord(x.days) + (x.gap ? '; ' + C.daysWord(x.gap) + ' without gas' : '');
        return x.days === 0 ? 'Changed the same day' : 'Lasted ' + C.daysWord(x.days);
    }
    function editRow(c, x) {
        const row = el('div', 'r-row editing');
        const r = x.r;
        const di = dateInput('ed-' + r.id, r.d);
        row.appendChild(field('Date the full cylinder was put on', di.id, di));
        const two = el('div', 'two refill-two');
        two.appendChild(gasField(c, 'eg-' + r.id, r.g != null ? C.fmtNum(r.g / 1000, 'en-US').replace(/,/g, '') : ''));
        two.appendChild(field('Price paid (optional)', 'ec-' + r.id, amountRow(textInput('ec-' + r.id, r.c != null ? (r.c / 100).toFixed(r.c % 100 ? 2 : 0) : '', 'e.g. 3200'), null, true)));
        row.appendChild(two);
        const oi = dateInput('eo-' + r.id, r.out || '');
        const of = field('Ran out on (optional)', oi.id, oi);
        row.appendChild(of);
        row.appendChild(p('hint', 'Only if it ran out before the next refill was put on. Leave it empty otherwise.'));
        const b = el('div', 'row-btns');
        b.appendChild(btn('Save changes', 'primary', () => saveEdit(c, r)));
        b.appendChild(btn('Cancel', 'secondary', () => { editRef = null; render(); }));
        row.appendChild(b);
        row.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); saveEdit(c, r); } if (e.key === 'Escape') { editRef = null; render(); } });
        return row;
    }
    function refillsBlock(c, a, box) {
        if (!a.rows.length) return;
        const wrap = el('div', 'reads');
        wrap.appendChild(el('h3', null, 'Refills (' + a.rows.length + ')'));
        const list = el('div', 'r-list');
        const rows = showAll[c.id] ? a.rows : a.rows.slice(0, 6);
        rows.forEach(x => {
            if (editRef && editRef.cid === c.id && editRef.rid === x.r.id) { list.appendChild(editRow(c, x)); return; }
            const row = el('div', 'r-row' + (x.inUse ? ' now' : ''));
            const main = el('div', 'r-main');
            main.appendChild(p('r-date', date(x.r.d, true)));
            main.appendChild(p('r-val', gas(c, x.g) + (x.assumed ? ' (full)' : '') + (x.r.c != null ? ', ' + money(x.r.c) : '')));
            main.appendChild(p('r-used', rowWords(c, x) + (x.ppu != null ? ' · ' + perUnit(c, x.ppu) : '')));
            if (x.flag) main.appendChild(p('r-flag', x.flag.kind === 'short'
                ? 'Ran out ' + C.daysWord(x.flag.by) + ' sooner than usual (usual ' + C.daysWord(x.flag.usual) + '): under-filled, a leak, or more cooking?'
                : 'Lasted ' + C.daysWord(x.flag.by) + ' longer than usual, so it is left out of the average. Missed a refill? Add it, or Edit this one and add the day it ran out.'));
            row.appendChild(main);
            const b = el('div', 'r-btns');
            b.appendChild(btn('Edit', 'secondary small', () => { editRef = { cid: c.id, rid: x.r.id }; render(); const i = $('ed-' + x.r.id); if (i) i.focus(); }, 'Edit the refill of ' + date(x.r.d, true)));
            b.appendChild(btn('Delete', 'secondary small', () => { change(() => { c.refills = c.refills.filter(y => y.id !== x.r.id); }, 'cm-' + c.id, 'Deleted the refill of ' + date(x.r.d, true) + '.'); }, 'Delete the refill of ' + date(x.r.d, true)));
            row.appendChild(b);
            list.appendChild(row);
        });
        wrap.appendChild(list);
        if (a.rows.length > 6) wrap.appendChild(btn(showAll[c.id] ? 'Show fewer' : 'Show all ' + a.rows.length + ' refills', 'link', () => { showAll[c.id] = !showAll[c.id]; render(); }));
        box.appendChild(wrap);
    }
    function cylBox(c) {
        const a = C.analyse(c, today);
        const box = el('article', 'cyl'); box.dataset.id = c.id;
        box.setAttribute('aria-label', c.name);
        const top = el('div', 'c-top');
        top.appendChild(el('h2', 'c-name', c.name));
        top.appendChild(el('span', 'tag', C.sizeLabel(c, LOC)));
        if (c.spare) top.appendChild(el('span', 'tag', 'with a spare'));
        box.appendChild(top);
        answerBlock(c, a, box);
        const msg = el('div', 'msg'); msg.id = 'cm-' + c.id; msg.setAttribute('role', 'status'); msg.setAttribute('aria-live', 'polite');
        box.appendChild(msg);
        logBlock(c, a, box);
        refillsBlock(c, a, box);
        const bt = el('div', 'c-btns');
        const text = () => summaryText(c, C.analyse(c, today));
        bt.appendChild(btn('Copy summary', 'secondary', () => copyText(text(), 'cm-' + c.id)));
        const mail = el('a', 'secondary', 'Email');
        mail.href = 'mailto:?subject=' + encodeURIComponent('Gas cylinder: ' + c.name) + '&body=' + encodeURIComponent(text());
        bt.appendChild(mail);
        if (a.emptyDay && a.status !== 'late') bt.appendChild(btn('Add reminder to calendar', 'secondary', () => calendar(c, a)));
        bt.appendChild(btn('Edit cylinder', 'secondary', () => { fillForm(c); render(); $('add').scrollIntoView({ block: 'start' }); $('f-name').focus(); }));
        bt.appendChild(btn('Delete cylinder', 'secondary danger-t', () => { if (editing === c.id) resetForm(); change(() => { state.cyls = state.cyls.filter(y => y.id !== c.id); }, 'top-msg', 'Deleted ' + c.name + ' and its ' + c.refills.length + (c.refills.length === 1 ? ' refill.' : ' refills.')); }));
        box.appendChild(bt);
        return box;
    }

    function render() {
        // keep the focus on the same field when the page is drawn again
        const focusId = document.activeElement && document.activeElement.id;
        const list = $('c-list');
        list.textContent = '';
        state.cyls.forEach(c => list.appendChild(cylBox(c)));
        $('cyls').hidden = !state.cyls.length && !(flash && flash.where === 'top-msg');
        $('intro').hidden = !!state.cyls.length;
        $('add-h').textContent = editing ? 'Edit ' + (byId(editing) ? byId(editing).name : 'cylinder') : state.cyls.length ? 'Add another cylinder' : 'Add a cylinder';
        $('add-intro').hidden = !!editing;
        $('quick').hidden = !!editing;
        $('f-save').textContent = editing ? 'Save changes' : 'Add cylinder';
        $('f-cancel').hidden = !editing;
        $('restore-first').hidden = !!state.cyls.length || !!editing;
        $('del-all').hidden = !state.cyls.length;
        $('backup').disabled = !state.cyls.length;
        ['top-msg', 'add-msg', 'tools-msg'].forEach(id => { $(id).textContent = ''; $(id).className = 'msg'; });
        if (flash) {
            showMsg($(flash.where) || $('top-msg'), flash.text, flash.undo && undoSnap, flash.bad);
            flash = null;
        }
        if (focusId && $(focusId) && document.activeElement !== $(focusId) && /^(rd|rg|rc|ed|eg|ec|eo)-/.test(focusId)) $(focusId).focus();
    }

    // ---------- backup ----------
    function backup() {
        download('lpg-refills-' + today + '.json', 'application/json', JSON.stringify({ app: SLUG, saved: today, state }, null, 1));
        flash = { where: 'tools-msg', text: 'Backup file saved to your downloads.' }; render();
    }
    function restore(file) {
        const where = state.cyls.length ? 'tools-msg' : 'add-msg';
        if (!file) return;
        if (file.size > 5e6) { flash = { where, text: 'That file is too big to be a backup from this app.', bad: true }; render(); return; }
        const rd = new FileReader();
        rd.onload = () => {
            let s = null;
            try { const j = JSON.parse(rd.result); s = C.cleanState(j && j.state ? j.state : j); } catch (e) { s = null; }
            if (!s) { flash = { where, text: 'That file is not a backup from this app.', bad: true }; render(); return; }
            resetForm();
            change(() => { state = s; }, where, 'Restored ' + s.cyls.length + (s.cyls.length === 1 ? ' cylinder' : ' cylinders') + '.');
            $('cur').value = state.cur;
        };
        rd.onerror = () => { flash = { where, text: 'Could not read that file.', bad: true }; render(); };
        rd.readAsText(file);
    }

    // ---------- wire up ----------
    function init() {
        load();
        fillCur();
        const top = el('div', 'msg'); top.id = 'top-msg'; top.setAttribute('role', 'status'); top.setAttribute('aria-live', 'polite');
        $('cyls').insertBefore(top, $('c-list'));
        resetForm();
        document.querySelectorAll('#quick .chip').forEach(c => c.addEventListener('click', () => { $('f-name').value = c.dataset.name; setErr('f-name', ''); $('f-size').focus(); }));
        $('f-size').addEventListener('change', () => { sizeMode(); if ($('f-size').value === 'other') $('f-osize').focus(); });
        $('f-usual-open').addEventListener('click', () => { openUsual(true); $('f-usual').focus(); });
        $('f-save').addEventListener('click', saveCyl);
        $('f-cancel').addEventListener('click', () => { const id = editing; resetForm(); render(); const b = document.querySelector('[data-id="' + id + '"]'); if (b) b.scrollIntoView({ block: 'start' }); });
        $('add').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type === 'text') saveCyl(); });
        $('cur').addEventListener('change', () => { state.cur = $('cur').value; save(); render(); });
        $('backup').addEventListener('click', backup);
        $('restore').addEventListener('click', () => $('restore-file').click());
        $('restore-first').addEventListener('click', () => $('restore-file').click());
        $('restore-file').addEventListener('change', e => { restore(e.target.files[0]); e.target.value = ''; });
        $('del-all').addEventListener('click', () => { resetForm(); change(() => { state.cyls = []; }, 'tools-msg', 'Deleted every cylinder and refill.'); });
        if (!canSave) $('store-warn').hidden = false;
        render();
        // a new day while the page stays open
        setInterval(() => { const t = C.localDay(new Date()); if (t !== today) { Object.values(drafts).forEach(d => { if (d && d.d === today) d.d = t; }); today = t; render(); } }, 60000);
        if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
    }
    init();
})();
