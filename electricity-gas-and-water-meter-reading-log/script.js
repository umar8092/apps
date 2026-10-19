// Electricity, Gas and Water Meter Reading Log: the page. The maths and the words are in core.js (window.MRL).
(function () {
    'use strict';
    const C = window.MRL, SLUG = 'electricity-gas-and-water-meter-reading-log', KEY = SLUG + '.state';
    const $ = id => document.getElementById(id);
    // a locale Intl accepts (some systems report tags such as "en-US@posix")
    const LOC = (() => { for (const l of [navigator.language, String(navigator.language || '').split(/[@.]/)[0], 'en-GB']) { try { if (l && Intl.getCanonicalLocales(l).length) return l; } catch (e) { /* try the next */ } } return 'en-GB'; })();
    const CUR_NAMES = { '': 'None (plain numbers)', 'Rs': 'Rs (rupee)', '₹': '₹ (rupee)', '$': '$ (dollar)', '€': '€ (euro)', '£': '£ (pound)', '৳': '৳ (taka)', '₦': '₦ (naira)',
        'KSh': 'KSh (shilling)', '₵': '₵ (cedi)', 'R': 'R (rand)', '₱': '₱ (peso)', 'Rp': 'Rp (rupiah)', 'RM': 'RM (ringgit)', 'AED': 'AED (dirham)', 'SAR': 'SAR (riyal)',
        '¥': '¥ (yen, yuan)', '₩': '₩ (won)', '₺': '₺ (lira)', 'R$': 'R$ (real)', 'E£': 'E£ (Egyptian pound)', 'A$': 'A$ (Australian dollar)', 'C$': 'C$ (Canadian dollar)', 'kr': 'kr (krona, krone)', 'CHF': 'CHF (franc)', 'zł': 'zł (złoty)' };
    let state = C.emptyState(), today = C.localDay(new Date());
    let editing = null;        // id of the meter in the form, or null when adding
    let steps = [];            // the price steps in the form: [{ upTo: text, p: text }]
    let drafts = {};           // typed but not saved readings per meter: { d, v, reset, open }
    let editRead = null;       // { mid, rid } reading being edited
    let showAll = {};          // meter id -> show every reading
    let pendingWarn = null;    // a reading that looked like a typo, saved on the second tap
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
        const where = flash ? flash.where : 'top-msg';
        undoSnap = null; editRead = null;
        save();
        flash = { where, text: 'Undone.' };
        render();
    }

    // ---------- helpers ----------
    function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
    function btn(text, cls, fn, label) { const b = el('button', cls, text); b.type = 'button'; if (label) b.setAttribute('aria-label', label); b.addEventListener('click', fn); return b; }
    const money = c => C.fmtMoney(c, state.cur, LOC);
    const date = (s, y) => C.fmtDate(s, LOC, y);
    const byId = id => state.meters.find(x => x.id === id);
    const newId = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    function uw(m, mu) { return m.unit === 'units' && mu === 1000 ? 'unit' : m.unit; }
    const units = (m, mu) => C.fmtUnits(mu, LOC) + ' ' + uw(m, Math.round(mu / 100) * 100);
    const rate = (m, mu) => C.fmtRate(mu, LOC) + ' ' + m.unit + ' a day';
    const reading = mu => C.fmtReading(mu, LOC);
    const ord = n => n + ((n % 100 >= 11 && n % 100 <= 13) ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
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
        $(id + '-err').textContent = msg || '';
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

    // ---------- the meter form ----------
    function fillDays() {
        const sel = $('f-day');
        for (let d = 1; d <= 31; d++) {
            const o = el('option', null, d >= 29 ? ord(d) + ' (or the last day)' : ord(d) + ' of each month'); o.value = String(d); sel.appendChild(o);
        }
    }
    function fillCur() {
        const sel = $('cur');
        Object.keys(CUR_NAMES).forEach(k => { const o = el('option', null, CUR_NAMES[k]); o.value = k; sel.appendChild(o); });
        if (state.cur && !(state.cur in CUR_NAMES)) { const o = el('option', null, state.cur); o.value = state.cur; sel.appendChild(o); }
        sel.value = state.cur;
    }
    function formUnit() { return $('f-unit').value === 'other' ? ($('f-ounit').value.trim() || 'units') : $('f-unit').value; }
    function unitLabels() {
        const u = formUnit();
        $('f-flat-l').textContent = 'Price per ' + (u === 'units' ? 'unit' : u);
        $('f-limit-l').textContent = 'Most ' + u + ' per bill period';
        $('f-ounit-box').hidden = $('f-unit').value !== 'other';
        renderSteps();
    }
    function renderSteps() {
        const box = $('f-steps'); box.textContent = '';
        const u = formUnit();
        steps.forEach((s, i) => {
            const lastOne = i === steps.length - 1;
            const row = el('div', 'step');
            const head = el('p', 'step-h', stepHead(i, u));
            head.id = 'st-h' + i;
            row.appendChild(head);
            const g = el('div', lastOne ? 'step-g one' : 'step-g');
            if (!lastOne) {
                const f1 = el('div', 'field');
                const l1 = el('label', null, 'Up to (' + u + ')'); l1.htmlFor = 'st-u' + i;
                const i1 = el('input'); i1.type = 'text'; i1.id = 'st-u' + i; i1.inputMode = 'decimal'; i1.maxLength = 14; i1.autocomplete = 'off'; i1.placeholder = 'e.g. ' + (100 * (i + 1)); i1.value = s.upTo;
                i1.addEventListener('input', () => { s.upTo = i1.value; });
                i1.addEventListener('input', stepHeads);
                f1.append(l1, i1); g.appendChild(f1);
            }
            const f2 = el('div', 'field');
            const l2 = el('label', null, 'Price per ' + (u === 'units' ? 'unit' : u)); l2.htmlFor = 'st-p' + i;
            const i2 = el('input'); i2.type = 'text'; i2.id = 'st-p' + i; i2.inputMode = 'decimal'; i2.maxLength = 16; i2.autocomplete = 'off'; i2.placeholder = 'e.g. ' + [10, 15, 22, 30, 35][Math.min(i, 4)]; i2.value = s.p;
            i2.addEventListener('input', () => { s.p = i2.value; });
            f2.append(l2, i2); g.appendChild(f2);
            row.appendChild(g);
            if (steps.length > 2) row.appendChild(btn('Remove step ' + (i + 1), 'link small-link danger-t', () => { steps.splice(i, 1); renderSteps(); }));
            box.appendChild(row);
        });
        $('f-step-add').hidden = steps.length >= 12;
    }
    function stepHead(i, u) {
        const p = i === 0 ? 0 : C.parseUnits(steps[i - 1].upTo).n;
        const prev = p != null ? C.fmtUnits(p, LOC) + ' ' + u : 'the end of step ' + i;
        return 'Step ' + (i + 1) + ': ' + (i === steps.length - 1 ? 'above ' : 'from ') + prev;
    }
    // only the headings change while typing, so the cursor stays where it is
    function stepHeads() {
        const u = formUnit();
        steps.forEach((s, i) => {
            const h = $('st-h' + i); if (!h) return;
            h.textContent = stepHead(i, u);
        });
    }
    function openBox(which, open) {
        $('f-' + which + '-box').hidden = !open;
        $('f-' + which + '-open').hidden = open;
    }
    function priceMode() {
        const s = $('f-mode').value === 'steps';
        $('f-flat-box').hidden = s; $('f-steps-box').hidden = !s;
        if (s && steps.length < 2) { steps = [{ upTo: '', p: '' }, { upTo: '', p: '' }]; }
        renderSteps();
    }
    function resetForm() {
        editing = null;
        ['f-name', 'f-ounit', 'f-flat', 'f-fixed', 'f-tax', 'f-limit'].forEach(id => { $(id).value = ''; });
        $('f-unit').value = 'kWh'; $('f-day').value = '1'; $('f-mode').value = 'flat'; $('f-per').value = 'bill'; $('f-whole').checked = false;
        steps = [];
        ['price', 'fixed', 'tax', 'limit'].forEach(b => openBox(b, false));
        ['f-name', 'f-ounit', 'f-flat', 'f-fixed', 'f-tax', 'f-limit'].forEach(id => setErr(id, ''));
        $('f-steps-err').textContent = '';
        priceMode(); unitLabels();
    }
    function fillForm(m) {
        resetForm();
        editing = m.id;
        $('f-name').value = m.name;
        if (C.UNITS.includes(m.unit)) $('f-unit').value = m.unit; else { $('f-unit').value = 'other'; $('f-ounit').value = m.unit; }
        $('f-day').value = String(m.day);
        const p = m.price;
        if (p.mode !== 'none') {
            openBox('price', true);
            $('f-mode').value = p.mode;
            if (p.mode === 'flat') $('f-flat').value = C.fmtPrice(p.flat, '', 'en-US').replace(/,/g, '');
            else { steps = p.steps.map(s => ({ upTo: s.upTo == null ? '' : String(s.upTo / 1000), p: String(s.p / 10000) })); $('f-whole').checked = !!p.whole; }
            if (m.fixed) { openBox('fixed', true); $('f-fixed').value = String(m.fixed.c / 100); $('f-per').value = m.fixed.per; }
            if (m.tax) { openBox('tax', true); $('f-tax').value = String(m.tax / 100); }
        }
        if (m.limit) { openBox('limit', true); $('f-limit').value = String(m.limit / 1000); }
        priceMode(); unitLabels();
    }
    function readForm() {
        let ok = true;
        const name = $('f-name').value.trim();
        ok = setErr('f-name', name ? '' : 'Type a name, such as Electricity.') && ok;
        let unit = $('f-unit').value;
        if (unit === 'other') { unit = $('f-ounit').value.trim(); ok = setErr('f-ounit', unit ? '' : 'Type the unit shown on the meter.') && ok; } else setErr('f-ounit', '');
        let price = { mode: 'none' }, fixed = null, tax = 0, limit = 0;
        if (!$('f-price-box').hidden) {
            if ($('f-mode').value === 'flat') {
                const r = C.parsePrice($('f-flat').value); ok = setErr('f-flat', r.error) && ok;
                if (!r.error) price = { mode: 'flat', flat: r.n };
            } else {
                let err = '', from = 0; const out = [];
                steps.forEach((s, i) => {
                    if (err) return;
                    const lastOne = i === steps.length - 1;
                    const p = C.parsePrice(s.p);
                    if (p.error) { err = 'Step ' + (i + 1) + ': ' + p.error; return; }
                    if (lastOne) { out.push({ upTo: null, p: p.n }); return; }
                    const u = C.parseUnits(s.upTo);
                    if (u.error) { err = 'Step ' + (i + 1) + ': ' + u.error; return; }
                    if (u.n <= from) { err = 'Step ' + (i + 1) + ' must end above ' + C.fmtUnits(from, LOC) + '.'; return; }
                    out.push({ upTo: u.n, p: p.n }); from = u.n;
                });
                $('f-steps-err').textContent = err; ok = !err && ok;
                if (!err) price = { mode: 'steps', steps: out, whole: $('f-whole').checked };
            }
            if (!$('f-fixed-box').hidden && $('f-fixed').value.trim()) {
                const r = C.parseMoney($('f-fixed').value); ok = setErr('f-fixed', r.error) && ok;
                if (!r.error && r.n > 0) fixed = { c: r.n, per: $('f-per').value };
            } else setErr('f-fixed', '');
            if (!$('f-tax-box').hidden && $('f-tax').value.trim()) {
                const r = C.parsePct($('f-tax').value); ok = setErr('f-tax', r.error) && ok;
                if (!r.error) tax = r.n;
            } else setErr('f-tax', '');
        }
        if (!$('f-limit-box').hidden && $('f-limit').value.trim()) {
            const r = C.parseUnits($('f-limit').value); ok = setErr('f-limit', r.error) && ok;
            if (!r.error) limit = r.n;
        } else setErr('f-limit', '');
        if (!ok) { const bad = document.querySelector('#add [aria-invalid="true"]') || $('f-steps-err'); if (bad && bad.focus) bad.focus(); return null; }
        return { name, unit, day: Number($('f-day').value), price, fixed, tax, limit };
    }
    function saveMeter() {
        const f = readForm();
        if (!f) return;
        if (editing) {
            const id = editing;
            resetForm();
            change(() => { Object.assign(byId(id), f); }, 'm-msg-' + id, 'Saved the changes to ' + f.name + '.');
            const box = document.querySelector('[data-id="' + id + '"]'); if (box) box.scrollIntoView({ block: 'start' });
        } else {
            const m = Object.assign({ id: newId('m'), readings: [] }, f);
            resetForm();
            change(() => { state.meters.push(m); }, 'm-msg-' + m.id, 'Added ' + f.name + '. Now type the number on the meter and its date.');
            const inp = $('rv-' + m.id); if (inp) { inp.scrollIntoView({ block: 'center' }); inp.focus(); }
        }
    }

    // ---------- readings ----------
    function draftOf(id) { return drafts[id] || (drafts[id] = { d: today, v: '', reset: false, open: false }); }
    function saveReading(m) {
        const dr = draftOf(m.id), where = 'm-msg-' + m.id;
        const errBox = $('rerr-' + m.id), vIn = $('rv-' + m.id), dIn = $('rd-' + m.id);
        const fail = msg => { errBox.textContent = msg; vIn.setAttribute('aria-invalid', 'true'); vIn.focus(); };
        dr.d = dIn.value; dr.v = vIn.value;
        const r = C.parseReading(dr.v);
        if (r.error) return fail(r.error);
        const reset = dr.reset && m.readings.some(x => x.d < dr.d);
        const chk = C.checkReading(m.readings, { d: dr.d, v: r.n, reset, today, loc: LOC });
        if (chk.error) { if (!C.isDay(dr.d) || dr.d > today || dr.d < '2000-01-01') { errBox.textContent = chk.error; dIn.setAttribute('aria-invalid', 'true'); dIn.focus(); return; } return fail(chk.error); }
        const key = m.id + dr.d + r.n;
        if (chk.warn && pendingWarn !== key) {
            pendingWarn = key;
            return fail('That is ' + rate(m, chk.perDay) + ', far more than your usual ' + rate(m, chk.usual) + '. Check the number. If it is right, tap "Save reading" again.');
        }
        pendingWarn = null;
        const old = m.readings.find(x => x.d === dr.d);
        const prev = C.sorted(m.readings).filter(x => x.d < dr.d).pop();
        let text = old ? 'Replaced the reading for ' + date(dr.d) + ': ' + reading(r.n) + '.' : 'Saved ' + reading(r.n) + ' on ' + date(dr.d) + '.';
        if (prev && !reset) text += ' Used ' + units(m, r.n - prev.v) + ' since ' + date(prev.d) + '.';
        if (reset) text += ' Counting starts again from this reading.';
        drafts[m.id] = { d: today, v: '', reset: false, open: false };
        change(() => {
            m.readings = m.readings.filter(x => x.d !== dr.d);
            m.readings.push({ id: newId('r'), d: dr.d, v: r.n, reset });
            m.readings = C.sorted(m.readings);
        }, where, text);
    }
    function saveEdit(m, rd) {
        const errBox = $('eerr-' + rd.id), vIn = $('ev-' + rd.id), dIn = $('ed-' + rd.id), reset = $('ex-' + rd.id) ? $('ex-' + rd.id).checked : false;
        const r = C.parseReading(vIn.value);
        if (r.error) { errBox.textContent = r.error; vIn.focus(); return; }
        const others = m.readings.filter(x => x.id !== rd.id);
        const rs = reset && others.some(x => x.d < dIn.value);
        const chk = C.checkReading(others, { d: dIn.value, v: r.n, reset: rs, today, loc: LOC });
        if (chk.error) { errBox.textContent = chk.error; (C.isDay(dIn.value) && dIn.value <= today ? vIn : dIn).focus(); return; }
        const clash = others.find(x => x.d === dIn.value);
        if (clash) { errBox.textContent = 'There is already a reading on ' + date(dIn.value, true) + '. Delete it first, or pick another date.'; dIn.focus(); return; }
        const d = dIn.value;
        editRead = null;
        change(() => {
            const x = m.readings.find(y => y.id === rd.id);
            x.d = d; x.v = r.n; x.reset = rs;
            m.readings = C.sorted(m.readings);
        }, 'm-msg-' + m.id, 'Changed the reading to ' + reading(r.n) + ' on ' + date(d) + '.');
    }

    // ---------- words for sharing ----------
    function summaryText(m) {
        const s = C.summary(m, today), L = [];
        L.push(m.name + ' meter (' + m.unit + ')');
        if (!s.count) { L.push('No readings yet.'); return L.join('\n'); }
        L.push('Bill period: ' + date(s.period.start, true) + ' to ' + date(s.period.end, true));
        L.push('Last reading: ' + reading(s.last.v) + ' on ' + date(s.last.d, true));
        if (s.rate != null) {
            if (s.inPeriod) L.push('Used so far: ' + units(m, s.soFar) + (s.exact ? '' : ' (partly estimated)') + ' in ' + C.daysWord(s.period.days - s.daysLeft));
            L.push('Use per day: ' + rate(m, s.rate));
            if (s.billSoFar) L.push('Units so far cost: ' + money(s.billSoFar.energy));
            L.push('By ' + date(s.period.end) + ' at this rate: about ' + units(m, s.projected) + (s.billEnd ? ', bill about ' + money(s.billEnd.total) : ''));
            if (s.limit) L.push(s.over ? 'Over the ' + units(m, s.limit) + ' limit by ' + units(m, s.over) : 'Limit ' + units(m, s.limit) + ': ' + rate(m, s.allow) + ' left for ' + C.daysWord(s.daysLeft));
        }
        const h = C.history(m, today, 12);
        if (h.length) {
            L.push('', 'Past bill periods:');
            h.forEach(r => L.push(date(r.start) + ' to ' + date(r.end, true) + ': ' + (r.part ? 'about ' : '') + units(m, r.mu) + (r.bill ? ', bill ' + money(r.bill.total) : '')));
        }
        L.push('', 'Readings:');
        C.readingRows(m).slice(0, 24).forEach(x => L.push(date(x.r.d, true) + ': ' + reading(x.r.v) + (x.used != null ? ' (+' + units(m, x.used) + ')' : x.reset ? ' (new meter)' : '')));
        return L.join('\n');
    }

    // ---------- drawing a meter ----------
    function priceWords(m) {
        const p = m.price;
        if (p.mode === 'flat') return C.fmtPrice(p.flat, state.cur, LOC) + ' per ' + (m.unit === 'units' ? 'unit' : m.unit);
        if (p.mode === 'steps') return p.steps.length + ' price steps' + (p.whole ? ', whole bill at the top step' : '');
        return 'No price added';
    }
    function resultBlock(m, s, box) {
        const res = el('div', 'res');
        box.appendChild(res);
        if (!s.count) {
            res.appendChild(el('p', 'r-label', 'Start here'));
            res.appendChild(el('p', 'r-line', 'Type the number on the meter below. The reading on your last bill, with its date, is a good first one: then you see the use since that bill straight away.'));
            return;
        }
        if (s.rate == null) {
            res.appendChild(el('p', 'r-label', 'First reading saved'));
            res.appendChild(el('p', 'r-big', reading(s.last.v)));
            res.appendChild(el('p', 'r-line', 'on ' + date(s.last.d, true) + '. Add another reading in a few days to see how much you use.'));
            return;
        }
        const usedDays = s.period.days - s.daysLeft;
        if (s.inPeriod) {
            res.appendChild(el('p', 'r-label', 'Used so far this bill period' + (s.exact ? '' : ' (partly estimated)')));
            res.appendChild(el('p', 'r-big', units(m, s.soFar)));
            res.appendChild(el('p', 'r-line', date(s.period.start) + ' to ' + date(s.last.d) + ' (' + C.daysWord(usedDays) + '), ' + rate(m, usedDays ? s.soFar / usedDays : s.rate)));
            if (!s.exact) res.appendChild(el('p', 'r-note', 'Your readings cover ' + C.daysWord(s.knownDays) + ' of these (' + units(m, s.known) + '). The other ' + C.daysWord(usedDays - s.knownDays) + ' are estimated at ' + rate(m, s.rate) + '.'));
            if (s.billSoFar) res.appendChild(el('p', 'r-line strong', 'Units so far cost ' + money(s.billSoFar.energy)));
        } else {
            res.appendChild(el('p', 'r-label', 'No reading yet in this bill period'));
            res.appendChild(el('p', 'r-line', 'This period started on ' + date(s.period.start) + '. Type today\'s reading to see what you have used since then.'));
        }
        const pj = el('div', 'proj');
        pj.appendChild(el('p', 'p-label', 'By ' + date(s.period.end) + ', at this rate'));
        pj.appendChild(el('p', 'p-big', 'about ' + units(m, s.projected) + (s.billEnd ? ', bill about ' + money(s.billEnd.total) : '')));
        if (s.billEnd && (s.billEnd.fixed || s.billEnd.tax)) {
            let t = 'Units ' + money(s.billEnd.energy);
            if (s.billEnd.fixed) t += ' + fixed charge ' + money(s.billEnd.fixed);
            if (s.billEnd.tax) t += ' + tax ' + C.fmtNum(m.tax / 100, 2, LOC) + '% ' + money(s.billEnd.tax);
            pj.appendChild(el('p', 'p-note', t));
        }
        pj.appendChild(el('p', 'p-note', 'At ' + rate(m, s.rate) + (s.rateFrom === 'period' ? ' (your use this bill period)' : ' (your last 30 days of readings)') + ' for the ' + C.daysWord(s.daysLeft) + ' left.'));
        res.appendChild(pj);
        if (s.limit) {
            const lim = el('div', 'limit ' + (s.over ? 'is-over' : s.willPass ? 'is-warn' : 'is-ok'));
            if (s.over) {
                lim.appendChild(el('p', 'l-big', 'Over your ' + units(m, s.limit) + ' limit by ' + units(m, s.over)));
                lim.appendChild(el('p', 'l-note', 'This bill period ends on ' + date(s.period.end) + '.'));
            } else {
                lim.appendChild(el('p', 'l-big', 'To stay under ' + units(m, s.limit) + ': use at most ' + rate(m, s.allow)));
                lim.appendChild(el('p', 'l-note', s.willPass
                    ? (units(m, s.limit - s.soFar) + ' left for ' + C.daysWord(s.daysLeft) + '. At your usual ' + rate(m, s.rate) + ' you will pass it around ' + date(s.passOn) + '.')
                    : ('On track: ' + units(m, s.limit - s.soFar) + ' left for ' + C.daysWord(s.daysLeft) + ', and at your usual ' + rate(m, s.rate) + ' you will stay under.')));
            }
            res.appendChild(lim);
        }
        if (s.ago >= 7) res.appendChild(el('p', 'r-stale', 'Your last reading was ' + C.daysWord(s.ago) + ' ago. Type today\'s reading for a closer answer.'));
    }
    function addReadingBlock(m, s, box) {
        const dr = draftOf(m.id);
        const f = el('div', 'add-r');
        f.appendChild(el('h3', null, 'Add a reading'));
        const g = el('div', 'two');
        const f1 = el('div', 'field'), l1 = el('label', null, 'Date'), d = el('input');
        l1.htmlFor = 'rd-' + m.id; d.type = 'date'; d.id = 'rd-' + m.id; d.value = dr.d; d.max = today; d.min = '2000-01-01';
        d.addEventListener('input', () => { dr.d = d.value; d.removeAttribute('aria-invalid'); });
        f1.append(l1, d);
        const f2 = el('div', 'field'), l2 = el('label', null, 'Reading (' + m.unit + ')'), v = el('input');
        l2.htmlFor = 'rv-' + m.id; v.type = 'text'; v.id = 'rv-' + m.id; v.inputMode = 'decimal'; v.maxLength = 16; v.autocomplete = 'off';
        v.placeholder = s.last ? 'last ' + reading(s.last.v) : 'e.g. 8186';
        v.value = dr.v; v.setAttribute('aria-describedby', 'rerr-' + m.id);
        v.addEventListener('input', () => { dr.v = v.value; v.removeAttribute('aria-invalid'); });
        v.addEventListener('keydown', e => { if (e.key === 'Enter') saveReading(m); });
        f2.append(l2, v);
        g.append(f1, f2); f.appendChild(g);
        if (s.count) {
            if (!dr.open) f.appendChild(btn('+ New meter, or the meter went back to 0?', 'link', () => { dr.d = d.value; dr.v = v.value; dr.open = true; render(); $('rx-' + m.id).focus(); }));
            else {
                const c = el('label', 'check'), x = el('input'); x.type = 'checkbox'; x.id = 'rx-' + m.id; x.checked = dr.reset;
                x.addEventListener('change', () => { dr.reset = x.checked; });
                c.append(x, el('span', null, 'New meter, or the meter went back to 0. Start counting again from this reading.'));
                f.appendChild(c);
            }
        }
        const err = el('p', 'err'); err.id = 'rerr-' + m.id; err.setAttribute('role', 'alert'); f.appendChild(err);
        f.appendChild(btn('Save reading', 'primary save-r', () => saveReading(m)));
        if (s.last) f.appendChild(el('p', 'hint', 'Last reading: ' + reading(s.last.v) + ' on ' + date(s.last.d, true) + (s.ago === 0 ? ' (today)' : s.ago === 1 ? ' (yesterday)' : ' (' + C.daysWord(s.ago) + ' ago)') + '.'));
        box.appendChild(f);
    }
    function readingsBlock(m, box) {
        const rows = C.readingRows(m);
        if (!rows.length) return;
        const w = el('div', 'reads');
        w.appendChild(el('h3', null, 'Readings (' + rows.length + ')'));
        const list = el('div', 'r-list');
        const limit = showAll[m.id] ? rows.length : 5;
        rows.slice(0, limit).forEach(x => {
            const row = el('div', 'r-row');
            if (editRead && editRead.rid === x.r.id) {
                row.classList.add('editing');
                const g = el('div', 'two');
                const f1 = el('div', 'field'), l1 = el('label', null, 'Date'), d = el('input');
                l1.htmlFor = 'ed-' + x.r.id; d.type = 'date'; d.id = 'ed-' + x.r.id; d.value = x.r.d; d.max = today; d.min = '2000-01-01';
                f1.append(l1, d);
                const f2 = el('div', 'field'), l2 = el('label', null, 'Reading'), v = el('input');
                l2.htmlFor = 'ev-' + x.r.id; v.type = 'text'; v.id = 'ev-' + x.r.id; v.inputMode = 'decimal'; v.maxLength = 16; v.autocomplete = 'off'; v.value = String(x.r.v / 1000);
                v.addEventListener('keydown', e => { if (e.key === 'Enter') saveEdit(m, x.r); });
                f2.append(l2, v);
                g.append(f1, f2); row.appendChild(g);
                if (rows.length > 1) {
                    const c = el('label', 'check'), cb = el('input'); cb.type = 'checkbox'; cb.id = 'ex-' + x.r.id; cb.checked = !!x.r.reset;
                    c.append(cb, el('span', null, 'New meter, or the meter went back to 0'));
                    row.appendChild(c);
                }
                const err = el('p', 'err'); err.id = 'eerr-' + x.r.id; err.setAttribute('role', 'alert'); row.appendChild(err);
                const b = el('div', 'row-btns');
                b.append(btn('Save', 'primary', () => saveEdit(m, x.r)), btn('Cancel', 'secondary', () => { editRead = null; render(); }));
                row.appendChild(b);
            } else {
                const t = el('div', 'r-main');
                t.appendChild(el('p', 'r-date', date(x.r.d, true)));
                t.appendChild(el('p', 'r-val', reading(x.r.v)));
                t.appendChild(el('p', 'r-used', x.first ? 'First reading' : x.reset ? 'New meter: counting starts again' : '+' + units(m, x.used) + ' in ' + C.daysWord(x.days) + ' · ' + rate(m, x.perDay)));
                row.appendChild(t);
                const b = el('div', 'r-btns');
                b.append(btn('Edit', 'secondary small', () => { editRead = { mid: m.id, rid: x.r.id }; render(); const i = $('ev-' + x.r.id); if (i) i.focus(); }, 'Edit the reading of ' + date(x.r.d, true)),
                    btn('Delete', 'secondary small', () => change(() => { m.readings = m.readings.filter(y => y.id !== x.r.id); }, 'm-msg-' + m.id, 'Deleted the reading of ' + date(x.r.d) + '.'), 'Delete the reading of ' + date(x.r.d, true)));
                row.appendChild(b);
            }
            list.appendChild(row);
        });
        w.appendChild(list);
        if (rows.length > 5) w.appendChild(btn(showAll[m.id] ? 'Show only the last 5' : 'Show all ' + rows.length + ' readings', 'link', () => { showAll[m.id] = !showAll[m.id]; render(); }));
        box.appendChild(w);
    }
    function historyBlock(m, box) {
        const h = C.history(m, today);
        if (!h.length) return;
        const w = el('div', 'hist');
        w.appendChild(el('h3', null, 'Past bill periods'));
        const list = el('div', 'h-list');
        h.forEach(r => {
            const row = el('div', 'h-row');
            const a = el('div', 'h-l');
            a.appendChild(el('p', 'h-when', date(r.start) + ' to ' + date(r.end, true)));
            a.appendChild(el('p', 'h-what', (r.part ? 'about ' : '') + units(m, r.mu) + ' · ' + rate(m, r.perDay) + (r.part ? ' · part (readings cover ' + r.covered + ' of ' + r.days + ' days)' : '')));
            if (r.vsLastYear) {
                const pct = Math.round(r.vsLastYear.change * 100);
                a.appendChild(el('p', 'h-ly ' + (pct > 0 ? 'up' : 'down'), (pct === 0 ? 'Same as' : (pct > 0 ? pct + '% more than ' : -pct + '% less than ')) + ' ' + date(r.vsLastYear.start, true) + ' period a year before'));
            }
            row.appendChild(a);
            if (r.bill) row.appendChild(el('p', 'h-bill', money(r.bill.total)));
            list.appendChild(row);
        });
        w.appendChild(list);
        if (h.some(r => r.bill)) w.appendChild(el('p', 'hint', 'Bills here use today\'s price.'));
        box.appendChild(w);
    }
    function meterBox(m) {
        const s = C.summary(m, today);
        const box = el('article', 'meter');
        box.dataset.id = m.id;
        const top = el('div', 'm-top');
        top.appendChild(el('h2', 'm-name', m.name));
        top.appendChild(el('span', 'tag', m.unit));
        box.appendChild(top);
        box.appendChild(el('p', 'm-sub', 'Read for the bill on the ' + ord(m.day) + (m.day >= 29 ? ' (or the last day)' : '') + ' · ' + priceWords(m) + (m.limit ? ' · limit ' + units(m, m.limit) : '')));
        const msg = el('div', 'msg'); msg.id = 'm-msg-' + m.id; msg.setAttribute('role', 'status'); msg.setAttribute('aria-live', 'polite');
        resultBlock(m, s, box);
        addReadingBlock(m, s, box);
        box.appendChild(msg);
        readingsBlock(m, box);
        historyBlock(m, box);
        const b = el('div', 'm-btns');
        b.appendChild(btn('Copy summary', 'secondary', () => copyText(summaryText(m), 'm-msg-' + m.id)));
        const mail = el('a', 'secondary', 'Email');
        mail.href = 'mailto:?subject=' + encodeURIComponent(m.name + ' meter readings') + '&body=' + encodeURIComponent(summaryText(m));
        b.appendChild(mail);
        b.appendChild(btn('Edit meter', 'secondary', () => { fillForm(m); render(); $('add').scrollIntoView({ block: 'start' }); $('f-name').focus(); }));
        b.appendChild(btn('Delete meter', 'secondary danger-t', () => {
            if (editing === m.id) resetForm();
            change(() => { state.meters = state.meters.filter(x => x.id !== m.id); }, 'top-msg', 'Deleted ' + m.name + ' and its ' + m.readings.length + ' readings.');
        }));
        box.appendChild(b);
        return box;
    }

    // ---------- render ----------
    function render() {
        const list = $('m-list');
        list.textContent = '';
        state.meters.forEach(m => list.appendChild(meterBox(m)));
        $('meters').hidden = !state.meters.length && !(flash && flash.where === 'top-msg');
        $('intro').hidden = !!state.meters.length;
        $('add-h').textContent = editing ? 'Edit ' + (byId(editing) ? byId(editing).name : 'meter') : state.meters.length ? 'Add another meter' : 'Add a meter';
        $('add-intro').hidden = !!editing;
        $('quick').hidden = !!editing;
        $('f-save').textContent = editing ? 'Save changes' : 'Add meter';
        $('f-cancel').hidden = !editing;
        $('restore-first').hidden = !!state.meters.length || !!editing;
        $('del-all').hidden = !state.meters.length;
        $('backup').disabled = !state.meters.length;
        document.querySelectorAll('.cur-tag').forEach(t => { t.textContent = state.cur; t.hidden = !state.cur; });
        ['top-msg', 'add-msg', 'tools-msg'].forEach(id => { $(id).textContent = ''; $(id).className = 'msg'; });
        if (flash) {
            showMsg($(flash.where), flash.text, flash.undo && undoSnap, flash.bad);
            flash = null;
        }
    }

    // ---------- backup ----------
    function backup() {
        const blob = new Blob([JSON.stringify({ app: SLUG, saved: today, state }, null, 1)], { type: 'application/json' });
        const a = el('a'); a.href = URL.createObjectURL(blob); a.download = 'meter-readings-' + today + '.json';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        flash = { where: 'tools-msg', text: 'Backup file saved to your downloads.' }; render();
    }
    function restore(file) {
        const where = state.meters.length ? 'tools-msg' : 'add-msg';
        if (!file) return;
        if (file.size > 5e6) { flash = { where, text: 'That file is too big to be a backup from this app.', bad: true }; render(); return; }
        const rd = new FileReader();
        rd.onload = () => {
            let s = null;
            try { const j = JSON.parse(rd.result); s = C.cleanState(j && j.state ? j.state : j); } catch (e) { s = null; }
            if (!s) { flash = { where, text: 'That file is not a backup from this app.', bad: true }; render(); return; }
            resetForm();
            change(() => { state = s; }, where, 'Restored ' + s.meters.length + (s.meters.length === 1 ? ' meter' : ' meters') + '.');
            $('cur').value = state.cur;
        };
        rd.onerror = () => { flash = { where, text: 'Could not read that file.', bad: true }; render(); };
        rd.readAsText(file);
    }

    // ---------- wire up ----------
    function init() {
        load();
        fillDays(); fillCur();
        const top = el('div', 'msg'); top.id = 'top-msg'; top.setAttribute('role', 'status'); top.setAttribute('aria-live', 'polite');
        $('meters').insertBefore(top, $('m-list'));
        resetForm();
        document.querySelectorAll('#quick .chip').forEach(c => c.addEventListener('click', () => {
            $('f-name').value = c.dataset.name; $('f-unit').value = c.dataset.unit; setErr('f-name', ''); unitLabels(); $('f-day').focus();
        }));
        $('f-unit').addEventListener('change', unitLabels);
        $('f-ounit').addEventListener('input', unitLabels);
        $('f-mode').addEventListener('change', priceMode);
        $('f-step-add').addEventListener('click', () => { steps.splice(steps.length - 1, 0, { upTo: '', p: '' }); renderSteps(); const i = $('st-u' + (steps.length - 2)); if (i) i.focus(); });
        $('f-price-open').addEventListener('click', () => { openBox('price', true); priceMode(); $('f-mode').focus(); });
        $('f-price-remove').addEventListener('click', () => { openBox('price', false); openBox('fixed', false); openBox('tax', false); ['f-flat', 'f-fixed', 'f-tax'].forEach(id => { $(id).value = ''; setErr(id, ''); }); steps = []; $('f-mode').value = 'flat'; priceMode(); $('f-price-open').focus(); });
        $('f-fixed-open').addEventListener('click', () => { openBox('fixed', true); $('f-fixed').focus(); });
        $('f-tax-open').addEventListener('click', () => { openBox('tax', true); $('f-tax').focus(); });
        $('f-limit-open').addEventListener('click', () => { openBox('limit', true); $('f-limit').focus(); });
        $('f-save').addEventListener('click', saveMeter);
        $('f-cancel').addEventListener('click', () => { const id = editing; resetForm(); render(); const b = document.querySelector('[data-id="' + id + '"]'); if (b) b.scrollIntoView({ block: 'start' }); });
        $('add').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type === 'text') saveMeter(); });
        $('cur').addEventListener('change', () => { state.cur = $('cur').value; save(); render(); });
        $('backup').addEventListener('click', backup);
        $('restore').addEventListener('click', () => $('restore-file').click());
        $('restore-first').addEventListener('click', () => $('restore-file').click());
        $('restore-file').addEventListener('change', e => { restore(e.target.files[0]); e.target.value = ''; });
        $('del-all').addEventListener('click', () => { resetForm(); change(() => { state.meters = []; }, 'tools-msg', 'Deleted every meter and reading.'); });
        if (!canSave) $('store-warn').hidden = false;
        render();
        // a new day while the page stays open
        setInterval(() => { const t = C.localDay(new Date()); if (t !== today) { Object.values(drafts).forEach(d => { if (d.d === today) d.d = t; }); today = t; render(); } }, 60000);
        if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
    }
    init();
})();
