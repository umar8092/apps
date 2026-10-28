// Event Budget and Vendor Payments Planner: the page. The money, dates and words are in core.js (window.EVB).
(function () {
    'use strict';
    const C = window.EVB, SLUG = 'event-budget-and-vendor-payments-planner', KEY = SLUG + '.state';
    const $ = id => document.getElementById(id);
    const CUR_NAMES = { '': 'None (plain numbers)', '$': '$ (dollar)', '€': '€ (euro)', '£': '£ (pound)', 'Rs': 'Rs (rupee)', '₹': '₹ (rupee)', 'A$': 'A$ (Australian dollar)', 'C$': 'C$ (Canadian dollar)',
        'NZ$': 'NZ$ (New Zealand dollar)', 'AED': 'AED (dirham)', 'SAR': 'SAR (riyal)', 'QAR': 'QAR (riyal)', 'KWD': 'KWD (dinar)', 'R': 'R (rand)', '৳': '৳ (taka)', '₦': '₦ (naira)', 'KSh': 'KSh (shilling)',
        'RM': 'RM (ringgit)', 'Rp': 'Rp (rupiah)', '₱': '₱ (peso)', 'S$': 'S$ (Singapore dollar)', '¥': '¥ (yen, yuan)', '₩': '₩ (won)', '₺': '₺ (lira)', 'R$': 'R$ (real)', 'kr': 'kr (krona, krone)', 'CHF': 'CHF (franc)', 'zł': 'zł (złoty)' };
    let state = C.emptyState(), t = C.today(new Date());
    let form = null;          // the one open form: { kind, eid, vid, did, pid }
    let open = {};            // vendor id -> payments list shown
    let showAllDue = false;
    let flash = null, undoSnap = null, canSave = true, loadNote = '', fresh = true;

    // ---------- saving ----------
    function load() {
        let raw = null;
        try { raw = localStorage.getItem(KEY); } catch (e) { canSave = false; }
        if (!raw) return;
        let s = null;
        try { s = C.cleanState(JSON.parse(raw)); } catch (e) { s = null; }
        if (s) { state = s; fresh = false; } else loadNote = 'Your saved events could not be read, so the app started fresh. If you have a backup file, restore it below.';
    }
    function save() {
        if (!canSave) { $('store-warn').hidden = false; return true; }
        try { localStorage.setItem(KEY, JSON.stringify(state)); return true; }
        catch (e) { flash = { where: 'top-msg', text: 'This browser could not save the last change. Save a backup file.', bad: true }; return false; }
    }
    function change(fn, where, text, keepForm) {
        const before = JSON.stringify(state);
        fn();
        undoSnap = before;
        if (!keepForm) form = null;
        flash = { where, text, undo: true };
        if (!save()) { state = C.cleanState(JSON.parse(before)) || state; undoSnap = null; }
        render();
    }
    function undo() {
        if (!undoSnap) return;
        const s = C.cleanState(JSON.parse(undoSnap));
        if (s) state = s;
        const where = flash && $(flash.where) ? flash.where : 'top-msg';
        undoSnap = null; form = null;
        save();
        flash = { where, text: 'Undone.' };
        fillSettings();
        render();
    }

    // ---------- helpers ----------
    function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
    function btn(text, cls, fn, label) { const b = el('button', cls, text); b.type = 'button'; if (label) b.setAttribute('aria-label', label); b.addEventListener('click', fn); return b; }
    const uid = () => Date.now().toString(36).slice(-6) + Math.random().toString(36).slice(2, 8);
    const fm = c => C.fmtMoney(c, state.cur, state.group);
    const evById = id => state.events.find(e => e.id === id);
    const vById = (ev, id) => ev && ev.vendors.find(v => v.id === id);
    let seq = 0;
    function input(id, opt) {
        const i = el(opt.area ? 'textarea' : 'input');
        i.id = id;
        if (!opt.area) { i.type = opt.type || 'text'; i.autocomplete = 'off'; }
        else i.rows = 3;
        if (opt.mode) i.inputMode = opt.mode;
        if (opt.max) i.maxLength = opt.max;
        if (opt.ph) i.placeholder = opt.ph;
        if (opt.value != null) i.value = opt.value;
        return i;
    }
    // a label, the control, and a place for its error message
    function field(box, text, ctl, money) {
        const l = el('label', '', text); l.htmlFor = ctl.id; box.appendChild(l);
        if (money && state.cur) { const r = el('div', 'amount-row'); r.appendChild(el('span', 'cur-tag', state.cur)); r.appendChild(ctl); box.appendChild(r); }
        else box.appendChild(ctl);
        const e = el('p', 'err'); e.id = ctl.id + '-err'; e.setAttribute('role', 'alert'); box.appendChild(e);
        ctl.setAttribute('aria-describedby', e.id);
        return ctl;
    }
    function setErr(ctl, msg) {
        const e = $(ctl.id + '-err');
        if (e) e.textContent = msg || '';
        if (msg) ctl.setAttribute('aria-invalid', 'true'); else ctl.removeAttribute('aria-invalid');
        return !msg;
    }
    function optional(box, text, build, startOpen) {
        const b = btn(text, 'link', () => { inner.hidden = false; b.hidden = true; const f = inner.querySelector('input,select,textarea'); if (f) f.focus(); });
        const inner = el('div', 'sub-box');
        inner.hidden = !startOpen; b.hidden = !!startOpen;
        box.appendChild(b); box.appendChild(inner);
        build(inner);
        return inner;
    }
    function catSelect(id, value) {
        const s = el('select'); s.id = id;
        C.CATS.forEach(([k, l]) => { const o = el('option', '', l); o.value = k; s.appendChild(o); });
        s.value = value || 'food';
        return s;
    }
    function showMsg(where, text, bad, withUndo) {
        const m = $(where);
        if (!m) return;
        m.textContent = '';
        m.className = 'msg' + (text ? ' show' : '') + (bad ? ' bad' : '');
        if (!text) return;
        m.appendChild(document.createTextNode(text + ' '));
        if (withUndo && undoSnap) m.appendChild(btn('Undo', 'link inline', undo));
    }
    function money(ctl, opt) { const r = C.parseMoney(ctl.value, opt); setErr(ctl, r.error); return r.error ? null : r.n; }
    function optMoney(ctl, opt) { const r = C.parseOptMoney(ctl.value, opt); setErr(ctl, r.error); return r.error ? undefined : r.n; }
    function dateVal(ctl, required) {
        const v = ctl.value;
        if (!v) { setErr(ctl, required ? 'Pick a date.' : ''); return required ? null : ''; }
        if (!C.isDate(v)) { setErr(ctl, 'Pick a real date.'); return null; }
        setErr(ctl, ''); return v;
    }
    function focusFirst(box) { const f = box.querySelector('input:not([type=radio]):not([type=checkbox]),select,textarea'); if (f) f.focus(); }

    // ---------- settings ----------
    function fillSettings() {
        const cur = $('cur');
        if (!cur.options.length) C.CURS.forEach(c => { const o = el('option', '', CUR_NAMES[c] || c); o.value = c; cur.appendChild(o); });
        cur.value = state.cur;
        $('group').value = state.group;
        const bud = $('e-budget-cur');
        bud.hidden = !state.cur; bud.textContent = state.cur;
    }

    // ---------- add an event ----------
    function addEvent() {
        const nameI = $('e-name'), dateI = $('e-date'), budI = $('e-budget');
        const name = C.cleanText(nameI.value, C.LIM.ev);
        let ok = setErr(nameI, name ? '' : 'Type a name for the event, such as Mehndi.');
        const d = dateVal(dateI, false); if (d === null) ok = false;
        const b = optMoney(budI); if (b === undefined) ok = false;
        if (state.events.length >= C.LIM.events) { showMsg('add-msg', 'You can keep up to 50 events. Delete an old one first.', true); return; }
        if (!ok) { const bad = document.querySelector('#add [aria-invalid="true"]'); if (bad) bad.focus(); return; }
        const id = uid();
        change(() => state.events.push({ id, name, date: d, budget: b, catBudgets: {}, note: '', vendors: [] }), 'add-msg', 'Added ' + name + '. Now add its vendors in its box.');
        nameI.value = ''; dateI.value = ''; budI.value = '';
        $('e-budget-box').hidden = true; $('e-budget-open').hidden = false;
        document.querySelectorAll('#quick .chip').forEach(c => c.classList.remove('on'));
        form = { kind: 'vadd', eid: id };
        render();
        const box = $('ev-' + id);
        if (box) { box.scrollIntoView({ block: 'start' }); const f = box.querySelector('.inline-form'); if (f) focusFirst(f); }
    }

    // ---------- forms inside the boxes ----------
    function vendorForm(ev, v) {
        const f = el('div', 'inline-form'), k = v ? 'vf' + v.id : 'vf';
        f.appendChild(el('p', 'f-h', v ? 'Edit ' + v.name : 'Add a vendor to ' + ev.name));
        const name = field(f, 'Vendor or what it is', input(k + '-name', { max: C.LIM.vn, ph: 'e.g. Al-Noor Caterers', value: v ? v.name : '' }));
        const cat = field(f, 'What is it for?', catSelect(k + '-cat', v ? v.cat : 'food'));
        const otherBox = el('div'); f.appendChild(otherBox);
        const catName = field(otherBox, 'Name the category', input(k + '-catname', { max: C.LIM.cat, ph: 'e.g. Fireworks', value: v ? v.catName : '' }));
        const syncCat = () => { otherBox.hidden = cat.value !== 'other'; };
        cat.addEventListener('change', syncCat); syncCat();

        const fs = el('fieldset', 'kinds'); fs.appendChild(el('legend', '', 'How is the price set?'));
        const mode = v ? v.mode : 'fixed', radios = {};
        [['fixed', 'One agreed price'], ['perhead', 'Price per guest × number of guests']].forEach(([val, txt]) => {
            const l = el('label', 'radio'), r = el('input'); r.type = 'radio'; r.name = k + '-mode'; r.value = val; r.checked = mode === val; radios[val] = r;
            l.appendChild(r); l.appendChild(document.createTextNode(txt)); fs.appendChild(l);
        });
        f.appendChild(fs);
        const fixBox = el('div'), headBox = el('div'); f.appendChild(fixBox); f.appendChild(headBox);
        const price = field(fixBox, 'Agreed price', input(k + '-price', { mode: 'decimal', max: 24, ph: 'e.g. 3.5 lakh', value: v && v.mode === 'fixed' ? C.moneyInput(v.price) : '' }), true);
        const rate = field(headBox, 'Price per guest', input(k + '-rate', { mode: 'decimal', max: 24, ph: 'e.g. 1800', value: v && v.mode === 'perhead' ? C.moneyInput(v.rate) : '' }), true);
        const guests = field(headBox, 'Number of guests', input(k + '-guests', { mode: 'numeric', max: 7, ph: 'e.g. 250', value: v && v.mode === 'perhead' ? String(v.guests) : '' }));
        const total = el('p', 'hint'); headBox.appendChild(total);
        const syncMode = () => {
            const ph = radios.perhead.checked; fixBox.hidden = ph; headBox.hidden = !ph;
            const r = C.parseMoney(rate.value), g = C.parseGuests(guests.value);
            total.textContent = !r.error && !g.error ? 'Agreed price: ' + fm(r.n * g.n) : '';
        };
        [radios.fixed, radios.perhead].forEach(r => r.addEventListener('change', syncMode));
        [rate, guests].forEach(i => i.addEventListener('input', syncMode));
        syncMode();
        if (v) f.appendChild(el('p', 'hint', 'If the price changes, the old price is kept in the vendor\'s history.'));

        let adv, advD, advN, dueD, dueA;
        if (!v) {
            optional(f, '+ Advance already paid (optional)', b => {
                adv = field(b, 'Advance paid', input(k + '-adv', { mode: 'decimal', max: 24, ph: 'e.g. 100000' }), true);
                advD = field(b, 'Paid on', input(k + '-advd', { type: 'date', value: t }));
                advN = field(b, 'Note', input(k + '-advn', { max: C.LIM.pnote, ph: 'e.g. cash' }));
            });
            optional(f, '+ When the rest is due (optional)', b => {
                dueD = field(b, 'Due on', input(k + '-dued', { type: 'date' }));
                dueA = field(b, 'Amount due then (optional)', input(k + '-duea', { mode: 'decimal', max: 24, ph: 'All that is left' }), true);
            });
        }
        let contact, note;
        optional(f, '+ Phone number or note (optional)', b => {
            contact = field(b, 'Phone or contact', input(k + '-contact', { max: C.LIM.contact, ph: 'e.g. 0300 1234567', value: v ? v.contact : '' }));
            note = field(b, 'Note', input(k + '-note', { area: true, max: C.LIM.note, ph: 'e.g. Includes 2 live stations, tea and setup. Final count by 1 Dec.', value: v ? v.note : '' }));
        }, !!(v && (v.contact || v.note)));

        const row = el('div', 'row-btns');
        row.appendChild(btn(v ? 'Save changes' : 'Add vendor', 'primary', () => {
            const nm = C.cleanText(name.value, C.LIM.vn);
            let ok = setErr(name, nm ? '' : 'Type who or what it is, such as Al-Noor Caterers.');
            const cn = C.cleanText(catName.value, C.LIM.cat);
            if (cat.value === 'other') ok = setErr(catName, cn ? '' : 'Type a name for the category, such as Fireworks.') && ok;
            const ph = radios.perhead.checked;
            let p = 0, r = 0, g = 0;
            if (ph) {
                r = money(rate); const gg = C.parseGuests(guests.value); setErr(guests, gg.error); g = gg.error ? null : gg.n;
                if (r == null || g == null) ok = false;
                else if (r * g > C.MAXC) { ok = setErr(guests, 'That total is too big.') && false; }
            } else { p = money(price); if (p == null) ok = false; }
            const agreed = ph ? r * g : p;
            let a = null, ad = t, an = '', dd = '', da = null;
            if (adv) {
                a = optMoney(adv, { positive: true, zero: 'Type an amount bigger than 0, or leave it blank.' }); if (a === undefined) ok = false;
                ad = dateVal(advD, !!a); if (ad === null) ok = false;
                an = C.cleanText(advN.value, C.LIM.pnote);
                if (a && ok && a > agreed) ok = setErr(adv, 'The advance is more than the agreed price of ' + fm(agreed) + '.') && false;
            }
            if (dueD) {
                dd = dateVal(dueD, false); if (dd === null) ok = false;
                da = optMoney(dueA, { positive: true, zero: 'Type an amount bigger than 0, or leave it blank.' }); if (da === undefined) ok = false;
                if (da && !dd && ok) ok = setErr(dueD, 'Pick the date it is due.') && false;
            }
            if (!ok) { const bad = f.querySelector('[aria-invalid="true"]'); if (bad) bad.focus(); return; }
            const fields = { name: nm, cat: cat.value, catName: cat.value === 'other' ? cn : '', mode: ph ? 'perhead' : 'fixed', price: ph ? 0 : p, rate: ph ? r : 0, guests: ph ? g : 0,
                contact: C.cleanText(contact.value, C.LIM.contact), note: C.cleanNote(note.value, C.LIM.note) };
            if (v) {
                change(() => {
                    const old = C.vStats(v).agreed;
                    Object.assign(v, fields);
                    if (agreed !== old) v.history.push({ d: t, from: old, to: agreed });
                    v.history = v.history.slice(-20);
                }, 'ev-msg-' + ev.id, 'Saved ' + nm + '.');
            } else {
                if (ev.vendors.length >= C.LIM.vendors) { showMsg('ev-msg-' + ev.id, 'An event can have up to 200 vendors.', true); return; }
                const nv = Object.assign({ id: uid(), history: [], pays: [], plan: [], status: 'booked' }, fields);
                if (a) nv.pays.push({ id: uid(), d: ad, amt: a, kind: 'pay', note: an || 'Advance' });
                if (dd) {
                    const left = agreed - (a || 0), amt = da || left;
                    if (amt > 0) nv.plan.push({ id: uid(), d: dd, amt });
                }
                change(() => ev.vendors.push(nv), 'ev-msg-' + ev.id, 'Added ' + nm + '.');
            }
        }));
        row.appendChild(btn('Cancel', 'secondary', () => { form = null; render(); }));
        f.appendChild(row);
        return f;
    }

    function payForm(ev, v, p, dueId) {
        const f = el('div', 'inline-form'), k = 'pf' + v.id, s = C.vStats(v);
        const isEdit = !!p;
        f.appendChild(el('p', 'f-h', isEdit ? 'Edit this ' + (p.kind === 'refund' ? 'refund' : 'payment') : 'Record a payment to ' + v.name));
        let kindRefund = null;
        if (!isEdit && s.net > 0) {
            const fs = el('fieldset', 'kinds'); fs.appendChild(el('legend', '', 'Which way did the money go?'));
            [['pay', 'I paid ' + v.name], ['refund', v.name + ' gave money back (refund)']].forEach(([val, txt], i) => {
                const l = el('label', 'radio'), r = el('input'); r.type = 'radio'; r.name = k + '-kind'; r.value = val; r.checked = i === 0;
                if (val === 'refund') kindRefund = r;
                l.appendChild(r); l.appendChild(document.createTextNode(txt)); fs.appendChild(l);
            });
            f.appendChild(fs);
        }
        const due = dueId ? s.dues.find(d => d.id === dueId) : s.dues[0];
        const suggest = isEdit ? p.amt : (due ? due.amt : s.balance);
        const amt = field(f, 'Amount', input(k + '-amt', { mode: 'decimal', max: 24, ph: 'e.g. 100000', value: suggest ? C.moneyInput(suggest) : '' }), true);
        const d = field(f, 'Date', input(k + '-d', { type: 'date', value: isEdit ? p.d : t }));
        const note = field(f, 'Note (optional)', input(k + '-note', { max: C.LIM.pnote, ph: 'e.g. cash', value: isEdit ? p.note : '' }));
        let take = null;
        if (!isEdit && s.dues.length) {
            const l = el('label', 'radio check'); take = el('input'); take.type = 'checkbox'; take.checked = true; take.id = k + '-take';
            l.appendChild(take); l.appendChild(document.createTextNode('Take it off the payment due on ' + C.fmtDate((due || s.dues[0]).d, t) + ' (' + fm((due || s.dues[0]).amt) + ')'));
            f.appendChild(l);
            if (kindRefund) {
                const sync = () => { l.hidden = kindRefund.checked; };
                f.querySelectorAll('input[name="' + k + '-kind"]').forEach(r => r.addEventListener('change', sync));
            }
        }
        const row = el('div', 'row-btns');
        row.appendChild(btn(isEdit ? 'Save changes' : 'Save payment', 'primary', () => {
            let ok = true;
            const a = money(amt, { positive: true, zero: 'Type an amount bigger than 0.' }); if (a == null) ok = false;
            const dv = dateVal(d, true); if (dv === null) ok = false;
            const refund = isEdit ? p.kind === 'refund' : !!(kindRefund && kindRefund.checked);
            if (ok && refund) {
                const otherNet = s.net - (isEdit ? -p.amt : 0);   // what was paid apart from this refund
                if (a > otherNet) ok = setErr(amt, 'A refund cannot be more than the ' + fm(otherNet) + ' paid to them.') && false;
            }
            if (ok && isEdit && !refund) {
                // lowering a payment must not leave refunds bigger than what was paid
                if (s.net - p.amt + a < 0) ok = setErr(amt, 'They gave back more than that. Edit the refund first.') && false;
            }
            if (!ok) { const bad = f.querySelector('[aria-invalid="true"]'); if (bad) bad.focus(); return; }
            const nt = C.cleanText(note.value, C.LIM.pnote);
            if (isEdit) {
                change(() => { p.amt = a; p.d = dv; p.note = nt; }, 'ev-msg-' + ev.id, 'Saved the ' + (refund ? 'refund' : 'payment') + '.');
                return;
            }
            if (v.pays.length >= C.LIM.pays) { showMsg('ev-msg-' + ev.id, 'This vendor has too many payments. Delete an old one first.', true); return; }
            change(() => {
                v.pays.push({ id: uid(), d: dv, amt: a, kind: refund ? 'refund' : 'pay', note: nt });
                if (!refund && take && take.checked) {
                    // take the payment off the due it was for, then the next ones
                    let left = a;
                    const order = C.vStats(v).dues.slice();
                    if (due) { order.splice(order.findIndex(x => x.id === due.id), 1); order.unshift(due); }
                    order.forEach(x => {
                        const real = v.plan.find(y => y.id === x.id);
                        if (!real || left <= 0) return;
                        const c = Math.min(left, real.amt); real.amt -= c; left -= c;
                    });
                    v.plan = v.plan.filter(y => y.amt > 0);
                }
                open[v.id] = true;
            }, 'ev-msg-' + ev.id, (refund ? 'Saved the refund of ' : 'Saved the payment of ') + fm(a) + (refund ? ' from ' : ' to ') + v.name + '. ' + after(s, refund ? -a : a));
        }));
        row.appendChild(btn('Cancel', 'secondary', () => { form = null; render(); }));
        f.appendChild(row);
        return f;
    }
    // what is left after a payment or refund: "Still to pay 2,00,000." / "Fully paid."
    function after(s, delta) {
        if (s.cancelled) return '';
        const left = s.agreed - (s.net + delta);
        return left > 0 ? 'Still to pay ' + fm(left) + '.' : left === 0 ? 'Fully paid.' : 'That is ' + fm(-left) + ' more than the agreed price.';
    }

    function planForm(ev, v, due) {
        const f = el('div', 'inline-form'), k = 'pl' + v.id, s = C.vStats(v);
        f.appendChild(el('p', 'f-h', due ? 'Edit the payment due' : 'When is the next payment due?'));
        const suggest = due ? due.amt : Math.max(0, s.balance - s.planned);
        const d = field(f, 'Due on', input(k + '-d', { type: 'date', value: due ? due.d : '' }));
        const amt = field(f, 'Amount due', input(k + '-amt', { mode: 'decimal', max: 24, ph: 'e.g. 200000', value: suggest ? C.moneyInput(suggest) : '' }), true);
        if (!due) f.appendChild(el('p', 'hint', 'Still to pay: ' + fm(s.balance) + (s.planned ? ', of which ' + fm(s.planned) + ' already has a date.' : '.')));
        const row = el('div', 'row-btns');
        row.appendChild(btn(due ? 'Save changes' : 'Save due date', 'primary', () => {
            let ok = true;
            const dv = dateVal(d, true); if (dv === null) ok = false;
            const a = money(amt, { positive: true, zero: 'Type an amount bigger than 0.' }); if (a == null) ok = false;
            if (!ok) { const bad = f.querySelector('[aria-invalid="true"]'); if (bad) bad.focus(); return; }
            if (!due && v.plan.length >= C.LIM.plan) { showMsg('ev-msg-' + ev.id, 'Too many due dates for this vendor.', true); return; }
            change(() => {
                if (due) { const real = v.plan.find(x => x.id === due.id); if (real) { real.d = dv; real.amt = a; } }
                else v.plan.push({ id: uid(), d: dv, amt: a });
            }, 'ev-msg-' + ev.id, fm(a) + ' to ' + v.name + ' is due on ' + C.fmtDate(dv, t) + '.');
        }));
        row.appendChild(btn('Cancel', 'secondary', () => { form = null; render(); }));
        f.appendChild(row);
        return f;
    }

    function cancelForm(ev, v) {
        const f = el('div', 'inline-form'), k = 'cf' + v.id, s = C.vStats(v);
        f.appendChild(el('p', 'f-h', 'Cancel the booking with ' + v.name + '?'));
        f.appendChild(el('p', 'hint top', s.net > 0 ? 'You paid them ' + fm(s.net) + '. Type what they gave back, if anything. What they keep counts as money lost.' : 'Nothing was paid to them, so nothing is lost.'));
        let amt = null, d = null;
        if (s.net > 0) {
            amt = field(f, 'Refund you got back (optional)', input(k + '-amt', { mode: 'decimal', max: 24, ph: 'None' }), true);
            d = field(f, 'Refund date', input(k + '-d', { type: 'date', value: t }));
        }
        const row = el('div', 'row-btns');
        row.appendChild(btn('Cancel the booking', 'primary', () => {
            let a = null, dv = t, ok = true;
            if (amt) {
                a = optMoney(amt, { positive: true, zero: 'Type an amount bigger than 0, or leave it blank.' }); if (a === undefined) ok = false;
                if (a && a > s.net) ok = setErr(amt, 'A refund cannot be more than the ' + fm(s.net) + ' paid to them.') && false;
                if (a) { dv = dateVal(d, true); if (dv === null) ok = false; }
            }
            if (!ok) { const bad = f.querySelector('[aria-invalid="true"]'); if (bad) bad.focus(); return; }
            change(() => {
                v.status = 'cancelled';
                if (a) v.pays.push({ id: uid(), d: dv, amt: a, kind: 'refund', note: 'Refund on cancelling' });
            }, 'ev-msg-' + ev.id, 'Cancelled ' + v.name + '.' + (s.net ? ' Money lost: ' + fm(s.net - (a || 0)) + '.' : ''));
        }));
        row.appendChild(btn('Keep the booking', 'secondary', () => { form = null; render(); }));
        f.appendChild(row);
        return f;
    }

    function copyForm(ev, v) {
        const f = el('div', 'inline-form'), others = state.events.filter(e => e.id !== ev.id);
        f.appendChild(el('p', 'f-h', 'Copy ' + v.name + ' to another event'));
        const s = el('select'); s.id = 'cp' + v.id;
        others.forEach(e => { const o = el('option', '', e.name); o.value = e.id; s.appendChild(o); });
        field(f, 'Which event?', s);
        f.appendChild(el('p', 'hint', 'The name, category, price and phone are copied, not the payments. Change the price there if that event pays a different part.'));
        const row = el('div', 'row-btns');
        row.appendChild(btn('Copy vendor', 'primary', () => {
            const to = evById(s.value);
            if (!to) return;
            if (to.vendors.length >= C.LIM.vendors) { showMsg('ev-msg-' + ev.id, 'That event already has 200 vendors.', true); return; }
            change(() => to.vendors.push({ id: uid(), name: v.name, cat: v.cat, catName: v.catName, mode: v.mode, price: v.price, rate: v.rate, guests: v.guests,
                history: [], pays: [], plan: [], status: 'booked', contact: v.contact, note: v.note }), 'ev-msg-' + to.id, 'Copied ' + v.name + ' to ' + to.name + '.');
        }));
        row.appendChild(btn('Cancel', 'secondary', () => { form = null; render(); }));
        f.appendChild(row);
        return f;
    }

    function eventForm(ev) {
        const f = el('div', 'inline-form'), k = 'ef' + ev.id;
        f.appendChild(el('p', 'f-h', 'Edit ' + ev.name));
        const name = field(f, 'Event name', input(k + '-name', { max: C.LIM.ev, value: ev.name }));
        const d = field(f, 'Date (optional)', input(k + '-d', { type: 'date', value: ev.date }));
        const b = field(f, 'Total budget (optional)', input(k + '-b', { mode: 'decimal', max: 24, ph: 'No budget', value: C.moneyInput(ev.budget) }), true);
        const note = field(f, 'Note (optional)', input(k + '-note', { area: true, max: C.LIM.note, ph: 'e.g. 300 guests, at the Marquee on Canal Road', value: ev.note }));
        const row = el('div', 'row-btns');
        row.appendChild(btn('Save changes', 'primary', () => {
            const nm = C.cleanText(name.value, C.LIM.ev);
            let ok = setErr(name, nm ? '' : 'Type a name for the event.');
            const dv = dateVal(d, false); if (dv === null) ok = false;
            const bv = optMoney(b); if (bv === undefined) ok = false;
            if (!ok) { const bad = f.querySelector('[aria-invalid="true"]'); if (bad) bad.focus(); return; }
            change(() => { ev.name = nm; ev.date = dv; ev.budget = bv; ev.note = C.cleanNote(note.value, C.LIM.note); }, 'ev-msg-' + ev.id, 'Saved ' + nm + '.');
        }));
        row.appendChild(btn('Cancel', 'secondary', () => { form = null; render(); }));
        f.appendChild(row);
        return f;
    }

    function catForm(ev) {
        const f = el('div', 'inline-form'), k = 'cb' + ev.id, ins = {};
        f.appendChild(el('p', 'f-h', 'Budget for each category'));
        f.appendChild(el('p', 'hint top', 'Fill in only the ones you want to keep an eye on. Leave the rest blank.'));
        C.CATS.filter(c => c[0] !== 'other').forEach(([key, label]) => {
            ins[key] = field(f, label, input(k + '-' + key, { mode: 'decimal', max: 24, ph: 'No budget', value: C.moneyInput(ev.catBudgets[key]) }), true);
        });
        const row = el('div', 'row-btns');
        row.appendChild(btn('Save budgets', 'primary', () => {
            let ok = true; const out = {};
            Object.keys(ins).forEach(key => { const v = optMoney(ins[key]); if (v === undefined) ok = false; else if (v != null) out[key] = v; });
            if (!ok) { const bad = f.querySelector('[aria-invalid="true"]'); if (bad) bad.focus(); return; }
            change(() => { ev.catBudgets = out; }, 'ev-msg-' + ev.id, 'Saved the category budgets.');
        }));
        row.appendChild(btn('Cancel', 'secondary', () => { form = null; render(); }));
        f.appendChild(row);
        return f;
    }

    function openForm(f) {
        form = f; flash = null; render();
        const box = document.querySelector('.inline-form');
        if (box) { focusFirst(box); box.scrollIntoView({ block: 'nearest' }); }
    }
    const plural = C.plural;
    const isForm = (kind, a, b) => form && form.kind === kind && (a == null || form.eid === a) && (b == null || form.vid === b);

    // ---------- drawing ----------
    function bar(paid, total, cls) {
        const b = el('div', 'bar' + (cls ? ' ' + cls : '')), i = el('span');
        const pct = total > 0 ? Math.min(100, Math.round(paid * 100 / total)) : (paid > 0 ? 100 : 0);
        i.style.width = pct + '%'; b.appendChild(i);
        b.setAttribute('role', 'img'); b.setAttribute('aria-label', pct + '% paid');
        return b;
    }
    function stat(label, value, cls) {
        const d = el('div', 'stat' + (cls ? ' ' + cls : ''));
        d.appendChild(el('span', 's-l', label)); d.appendChild(el('span', 's-v', value));
        return d;
    }

    function vendorBox(ev, v) {
        const s = C.vStats(v), box = el('article', 'vendor' + (s.cancelled ? ' k-cancel' : s.balance === 0 ? ' k-done' : s.dues.some(d => d.d < t) ? ' k-late' : ''));
        box.id = 'v-' + v.id;
        const top = el('div', 'v-top');
        top.appendChild(el('h4', 'v-name', v.name));
        top.appendChild(el('span', 'tag', C.catLabel(v)));
        if (s.cancelled) top.appendChild(el('span', 'tag bad', 'Cancelled'));
        else if (s.balance === 0 && !s.over) top.appendChild(el('span', 'tag good', 'Fully paid'));
        box.appendChild(top);

        if (s.cancelled) {
            box.appendChild(el('p', 'v-line', 'Was ' + C.priceWords(v, fm) + '. Paid ' + fm(s.paidGross) + (s.refunded ? ', got back ' + fm(s.refunded) : '') + '.'));
            box.appendChild(el('p', 'v-big' + (s.cost ? ' bad-t' : ''), s.cost ? 'Money lost: ' + fm(s.cost) : 'Nothing lost'));
        } else {
            box.appendChild(el('p', 'v-line', 'Agreed ' + C.priceWords(v, fm)));
            box.appendChild(bar(s.net, s.agreed));
            const g = el('div', 'stats');
            g.appendChild(stat('Paid', fm(s.net)));
            g.appendChild(stat('Still to pay', fm(s.balance), s.balance ? 'big' : 'good-t'));
            box.appendChild(g);
            if (s.refunded) box.appendChild(el('p', 'v-sub', 'Paid ' + fm(s.paidGross) + ', got back ' + fm(s.refunded) + '.'));
            if (s.over) box.appendChild(el('p', 'v-warn', 'You paid ' + fm(s.over) + ' more than the agreed price. Ask for it back, or fix the price or a payment.'));
        }
        if (v.history.length) {
            const h = v.history[v.history.length - 1];
            box.appendChild(el('p', 'v-sub', 'Price changed on ' + C.fmtDate(h.d, t) + ' from ' + fm(h.from) + ' to ' + fm(h.to) + (v.history.length > 1 ? ' (' + plural(v.history.length, 'change') + ' in all)' : '') + '.'));
        }

        // payments still due
        if (s.dues.length || (!s.cancelled && s.balance)) {
            const sec = el('div', 'dues');
            s.dues.forEach(d => {
                const r = el('div', 'due-row' + (d.d < t ? ' late' : ''));
                const txt = el('p', 'due-t');
                txt.appendChild(el('b', '', fm(d.amt)));
                txt.appendChild(document.createTextNode(' due ' + C.fmtDate(d.d, t) + ' · '));
                txt.appendChild(el('span', d.d < t ? 'bad-t' : '', C.dueRel(d.d, t)));
                r.appendChild(txt);
                const bb = el('div', 'due-btns');
                bb.appendChild(btn('Paid it', 'secondary small', () => openForm({ kind: 'pay', eid: ev.id, vid: v.id, did: d.id }), 'Paid the ' + fm(d.amt) + ' due ' + C.fmtDate(d.d, t)));
                bb.appendChild(btn('Edit', 'secondary small', () => openForm({ kind: 'plan', eid: ev.id, vid: v.id, did: d.id }), 'Edit the payment due ' + C.fmtDate(d.d, t)));
                bb.appendChild(btn('Delete', 'secondary small danger-t', () => change(() => { v.plan = v.plan.filter(x => x.id !== d.id); }, 'ev-msg-' + ev.id, 'Deleted the due date.'), 'Delete the payment due ' + C.fmtDate(d.d, t)));
                r.appendChild(bb);
                if (isForm('plan', ev.id, v.id) && form.did === d.id) r.appendChild(planForm(ev, v, d));
                if (isForm('pay', ev.id, v.id) && form.did === d.id) r.appendChild(payForm(ev, v, null, d.id));
                sec.appendChild(r);
            });
            if (s.unplanned && !s.cancelled) sec.appendChild(el('p', 'v-sub', (s.dues.length ? fm(s.unplanned) + ' more' : fm(s.unplanned)) + ' has no due date yet.'));
            if (s.overPlanned) sec.appendChild(el('p', 'v-warn', 'The due dates add up to ' + fm(s.overPlanned) + ' more than what is left to pay. Edit or delete one.'));
            box.appendChild(sec);
        }

        if (v.contact) box.appendChild(el('p', 'v-sub', 'Contact: ' + v.contact));
        if (v.note) box.appendChild(el('p', 'p-note', v.note));

        // payments made
        if (v.pays.length) {
            const tg = btn((open[v.id] ? 'Hide payments' : 'Show payments') + ' (' + v.pays.length + ')', 'link', () => { open[v.id] = !open[v.id]; render(); });
            tg.setAttribute('aria-expanded', String(!!open[v.id]));
            box.appendChild(tg);
            if (open[v.id]) {
                const list = el('ul', 'pays');
                v.pays.slice().sort((a, b) => a.d < b.d ? -1 : a.d > b.d ? 1 : 0).forEach(p => {
                    const li = el('li', 'pay' + (p.kind === 'refund' ? ' refund' : ''));
                    const tx = el('p', 'pay-t');
                    tx.appendChild(el('span', '', C.fmtDate(p.d, t) + ': '));
                    tx.appendChild(el('b', '', (p.kind === 'refund' ? 'got back ' : '') + fm(p.amt)));
                    if (p.note) tx.appendChild(document.createTextNode(' · ' + p.note));
                    li.appendChild(tx);
                    const bb = el('div', 'due-btns');
                    bb.appendChild(btn('Edit', 'secondary small', () => openForm({ kind: 'pedit', eid: ev.id, vid: v.id, pid: p.id }), 'Edit the payment of ' + fm(p.amt) + ' on ' + C.fmtDate(p.d, t)));
                    bb.appendChild(btn('Delete', 'secondary small danger-t', () => {
                        const net = C.vStats(v).net;
                        if (p.kind !== 'refund' && net - p.amt < 0) { showMsg('ev-msg-' + ev.id, 'Delete the refund first: they cannot give back more than you paid.', true); return; }
                        change(() => { v.pays = v.pays.filter(x => x.id !== p.id); }, 'ev-msg-' + ev.id, 'Deleted the ' + (p.kind === 'refund' ? 'refund' : 'payment') + ' of ' + fm(p.amt) + '.');
                    }, 'Delete the payment of ' + fm(p.amt) + ' on ' + C.fmtDate(p.d, t)));
                    li.appendChild(bb);
                    if (isForm('pedit', ev.id, v.id) && form.pid === p.id) li.appendChild(payForm(ev, v, p));
                    list.appendChild(li);
                });
                box.appendChild(list);
            }
        }

        if (isForm('pay', ev.id, v.id) && !form.did) box.appendChild(payForm(ev, v));
        if (isForm('plan', ev.id, v.id) && !form.did) box.appendChild(planForm(ev, v));
        if (isForm('vedit', ev.id, v.id)) box.appendChild(vendorForm(ev, v));
        if (isForm('cancel', ev.id, v.id)) box.appendChild(cancelForm(ev, v));
        if (isForm('copy', ev.id, v.id)) box.appendChild(copyForm(ev, v));

        const bb = el('div', 'v-btns');
        // while one of this vendor's forms is open, its own buttons are the only ones shown
        if (form && form.vid === v.id) { box.appendChild(bb); bb.hidden = true; return box; }
        if (!s.cancelled) {
            bb.appendChild(btn('Record a payment', 'primary', () => openForm({ kind: 'pay', eid: ev.id, vid: v.id }), 'Record a payment to ' + v.name));
            if (s.balance) bb.appendChild(btn('+ Due date', 'secondary', () => openForm({ kind: 'plan', eid: ev.id, vid: v.id }), 'Add a due date for ' + v.name));
        }
        bb.appendChild(btn('Edit', 'secondary', () => openForm({ kind: 'vedit', eid: ev.id, vid: v.id }), 'Edit ' + v.name));
        if (s.cancelled) bb.appendChild(btn('Book again', 'secondary', () => change(() => { v.status = 'booked'; }, 'ev-msg-' + ev.id, v.name + ' is booked again.'), 'Book ' + v.name + ' again'));
        else bb.appendChild(btn('Cancel booking', 'secondary', () => openForm({ kind: 'cancel', eid: ev.id, vid: v.id }), 'Cancel the booking with ' + v.name));
        if (state.events.length > 1) bb.appendChild(btn('Copy to event', 'secondary', () => openForm({ kind: 'copy', eid: ev.id, vid: v.id }), 'Copy ' + v.name + ' to another event'));
        bb.appendChild(btn('Delete', 'secondary danger-t', () => change(() => { ev.vendors = ev.vendors.filter(x => x.id !== v.id); }, 'ev-msg-' + ev.id, 'Deleted ' + v.name + ' and its payments.'), 'Delete ' + v.name));
        box.appendChild(bb);
        return box;
    }

    function eventBox(ev) {
        const s = C.eStats(ev), box = el('section', 'event' + (s.left != null && s.left < 0 ? ' k-over' : ''));
        box.id = 'ev-' + ev.id; box.setAttribute('aria-label', ev.name);
        const h = el('h3', 'e-name', ev.name); h.tabIndex = -1; box.appendChild(h);
        box.appendChild(el('p', 'e-when', ev.date ? C.fmtDate(ev.date, t, { year: true }) + ' · ' + (ev.date < t ? 'was ' + C.rel(ev.date, t) : C.rel(ev.date, t)) : 'No date set'));
        if (ev.note) box.appendChild(el('p', 'p-note', ev.note));

        const big = el('div', 'e-sum');
        if (ev.budget != null) {
            big.appendChild(el('p', 'e-big', fm(s.agreed) + ' agreed of ' + fm(ev.budget) + ' budget'));
            if (s.left < 0) big.appendChild(el('p', 'e-left bad-t', 'Over budget by ' + fm(-s.left)));
            else big.appendChild(el('p', 'e-left good-t', s.left ? fm(s.left) + ' of the budget not promised yet' : 'All of the budget is promised'));
        } else {
            big.appendChild(el('p', 'e-big', fm(s.agreed) + ' agreed'));
            big.appendChild(el('p', 'e-left', 'No budget set. Tap Edit event to add one.'));
        }
        box.appendChild(big);
        box.appendChild(bar(s.paid, s.agreed));
        const g = el('div', 'stats three');
        g.appendChild(stat('Paid', fm(s.paid)));
        g.appendChild(stat('Still to pay', fm(s.toPay), s.toPay ? 'big' : ''));
        g.appendChild(stat('Vendors', String(s.active) + (s.cancelled ? ' (+' + s.cancelled + ' cancelled)' : '')));
        box.appendChild(g);
        if (s.lost) box.appendChild(el('p', 'v-sub', 'Includes ' + fm(s.lost) + ' lost on cancelled bookings.'));
        if (s.over) box.appendChild(el('p', 'v-warn', 'Paid ' + fm(s.over) + ' more than agreed to some vendors.'));

        // by category
        if (s.cats.length) {
            const sec = el('div', 'cats');
            sec.appendChild(el('h4', '', 'By category'));
            const tb = el('ul', 'cat-list');
            s.cats.forEach(c => {
                const li = el('li', 'cat' + (c.overBy ? ' over' : ''));
                li.appendChild(el('span', 'c-l', c.label));
                li.appendChild(el('span', 'c-v', fm(c.agreed) + (c.budget != null ? ' of ' + fm(c.budget) : '')));
                if (c.overBy) li.appendChild(el('span', 'c-o', 'over by ' + fm(c.overBy)));
                else if (c.budget != null) li.appendChild(el('span', 'c-ok', fm(c.budget - c.agreed) + ' left'));
                tb.appendChild(li);
            });
            sec.appendChild(tb);
            box.appendChild(sec);
        }
        if (isForm('cats', ev.id)) box.appendChild(catForm(ev));
        else box.appendChild(btn(Object.keys(ev.catBudgets).length ? 'Change the category budgets' : '+ Budget per category (optional)', 'link', () => openForm({ kind: 'cats', eid: ev.id })));

        const list = el('div', 'v-list');
        if (!ev.vendors.length && !isForm('vadd', ev.id)) list.appendChild(el('p', 'hint', 'No vendors yet. Add the hall, caterer, decorator, photographer and anyone else you are paying.'));
        ev.vendors.forEach(v => list.appendChild(vendorBox(ev, v)));
        box.appendChild(list);
        if (isForm('vadd', ev.id)) box.appendChild(vendorForm(ev));
        if (isForm('eedit', ev.id)) box.appendChild(eventForm(ev));
        const m = el('div', 'msg'); m.id = 'ev-msg-' + ev.id; m.setAttribute('role', 'status'); m.setAttribute('aria-live', 'polite'); box.appendChild(m);

        const bb = el('div', 'e-btns');
        if (!isForm('vadd', ev.id)) bb.appendChild(btn('+ Add a vendor', 'primary', () => openForm({ kind: 'vadd', eid: ev.id }), 'Add a vendor to ' + ev.name));
        bb.appendChild(btn('Edit event', 'secondary', () => openForm({ kind: 'eedit', eid: ev.id }), 'Edit ' + ev.name));
        bb.appendChild(btn('Copy summary', 'secondary', () => copyText(C.eventText(ev, state, t), 'ev-msg-' + ev.id), 'Copy the summary of ' + ev.name));
        const mail = el('a', 'secondary', 'Email summary');
        mail.href = 'mailto:?subject=' + encodeURIComponent(ev.name + ' budget') + '&body=' + encodeURIComponent(C.eventText(ev, state, t));
        mail.setAttribute('aria-label', 'Email the summary of ' + ev.name);
        bb.appendChild(mail);
        bb.appendChild(btn('Delete event', 'secondary danger-t', () => change(() => { state.events = state.events.filter(e => e.id !== ev.id); }, 'top-msg', 'Deleted ' + ev.name + ' and its vendors.'), 'Delete ' + ev.name));
        box.appendChild(bb);
        return box;
    }

    function dueCard() {
        const body = $('due-body'), up = C.upcoming(state, t), T = C.totals(state);
        body.textContent = '';
        if (state.events.length > 1) {
            const g = el('div', 'stats three');
            g.appendChild(stat('All agreed', fm(T.agreed)));
            g.appendChild(stat('All paid', fm(T.paid)));
            g.appendChild(stat('All still to pay', fm(T.toPay), T.toPay ? 'big' : ''));
            body.appendChild(g);
        }
        if (!up.length) {
            body.appendChild(el('p', 'hint', T.toPay ? 'No due dates yet. Tap "+ Due date" on a vendor to see here when each payment is due.' : 'Nothing is waiting to be paid.'));
            return;
        }
        const late = up.filter(u => u.late);
        if (late.length) body.appendChild(el('p', 'v-warn', plural(late.length, 'payment') + ' late: ' + fm(late.reduce((a, u) => a + u.due.amt, 0)) + '.'));
        const first = up[0], nx = el('div', 'next');
        nx.appendChild(el('p', 'n-l', first.late ? 'Late' : 'Next payment'));
        nx.appendChild(el('p', 'n-big', fm(first.due.amt) + ' to ' + first.v.name));
        nx.appendChild(el('p', 'n-when' + (first.late ? ' bad-t' : ''), C.fmtDate(first.due.d, t) + ' · ' + C.dueRel(first.due.d, t) + ' · ' + first.ev.name));
        body.appendChild(nx);
        const rest = up.slice(1), shown = showAllDue ? rest : rest.slice(0, 5);
        if (rest.length) {
            body.appendChild(el('h4', '', 'After that'));
            const ul = el('ul', 'u-list');
            shown.forEach(u => {
                const li = el('li', u.late ? 'late' : '');
                const a = btn(C.fmtDate(u.due.d, t) + ': ' + fm(u.due.amt) + ' to ' + u.v.name, 'u-name link inline', () => { const b = $('v-' + u.v.id); if (b) { b.scrollIntoView({ block: 'start' }); const n = b.querySelector('.v-name'); if (n) { n.tabIndex = -1; n.focus(); } } });
                li.appendChild(a);
                li.appendChild(el('span', 'u-st' + (u.late ? ' bad-t' : ''), u.ev.name + ', ' + C.dueRel(u.due.d, t)));
                ul.appendChild(li);
            });
            body.appendChild(ul);
            if (rest.length > 5) body.appendChild(btn(showAllDue ? 'Show fewer' : 'Show all ' + rest.length, 'link', () => { showAllDue = !showAllDue; render(); }));
        }
        const unp = state.events.reduce((a, ev) => a + ev.vendors.reduce((b, v) => b + C.vStats(v).unplanned, 0), 0);
        if (unp) body.appendChild(el('p', 'v-sub', 'Also ' + fm(unp) + ' still to pay with no due date yet.'));
    }

    function render() {
        t = C.today(new Date());
        const has = state.events.length > 0;
        $('intro').hidden = has;
        $('due').hidden = !has;
        $('events').hidden = !has;
        $('add-h').textContent = has ? 'Add another event' : 'Add your first event';
        if (has) dueCard();
        const list = $('ev-list'); list.textContent = '';
        state.events.slice().sort((a, b) => (a.date || '9999') < (b.date || '9999') ? -1 : (a.date || '9999') > (b.date || '9999') ? 1 : 0).forEach(ev => list.appendChild(eventBox(ev)));
        $('mail-all').href = 'mailto:?subject=' + encodeURIComponent('Event budget') + '&body=' + encodeURIComponent(C.allText(state, t).slice(0, 1800));
        ['top-msg', 'add-msg', 'tools-msg', 'due-msg'].forEach(id => { if (!flash || flash.where !== id) showMsg(id, ''); });
        if (flash) showMsg(flash.where, flash.text, flash.bad, flash.undo);
    }

    // ---------- copy, files ----------
    function copyText(text, where) {
        const ok = () => { flash = { where, text: 'Copied. Paste it into WhatsApp, a message or an email.' }; showMsg(where, flash.text); };
        const fallback = () => {
            const ta = el('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'absolute'; ta.style.left = '-9999px';
            document.body.appendChild(ta); ta.select();
            let done = false; try { done = document.execCommand('copy'); } catch (e) { done = false; }
            ta.remove();
            if (done) ok(); else showMsg(where, 'Could not copy here. Use Email instead.', true);
        };
        if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(ok, fallback); else fallback();
    }
    function download(name, text, type) {
        const a = el('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }
    function restore(file) {
        if (!file) return;
        if (file.size > 5000000) { showMsg('tools-msg', 'That file is too big to be a backup from this app.', true); return; }
        const r = new FileReader();
        r.onload = () => {
            let s = null;
            try { const j = JSON.parse(r.result); s = C.cleanState(j && j.app === SLUG ? j.state : j); } catch (e) { s = null; }
            if (!s) { flash = { where: 'tools-msg', text: 'That file is not a backup from this app, so nothing was changed.', bad: true }; render(); return; }
            change(() => { state = s; }, 'tools-msg', 'Restored ' + plural(s.events.length, 'event') + ' from the backup.');
            fillSettings(); render();
        };
        r.onerror = () => showMsg('tools-msg', 'Could not read that file.', true);
        r.readAsText(file);
    }

    // ---------- start ----------
    function start() {
        load();
        if (fresh && /-(IN|PK|BD|NP|LK)$/i.test(navigator.language || '')) state.group = 'lakh';
        fillSettings();
        if (loadNote) flash = { where: 'top-msg', text: loadNote, bad: true };
        $('cur').addEventListener('change', e => { change(() => { state.cur = C.CURS.includes(e.target.value) ? e.target.value : ''; }, 'tools-msg', 'Money is now shown as ' + C.fmtMoney(12345000, e.target.value, state.group) + '.', true); fillSettings(); render(); });
        $('group').addEventListener('change', e => { change(() => { state.group = e.target.value === 'lakh' ? 'lakh' : 'west'; }, 'tools-msg', 'Big numbers are now shown as ' + C.fmtMoney(123456700, '', e.target.value === 'lakh' ? 'lakh' : 'west') + '.', true); });
        document.querySelectorAll('#quick .chip').forEach(c => c.addEventListener('click', () => {
            $('e-name').value = c.dataset.name;
            document.querySelectorAll('#quick .chip').forEach(x => x.classList.toggle('on', x === c));
            setErr($('e-name'), '');
        }));
        $('e-budget-open').addEventListener('click', () => { $('e-budget-box').hidden = false; $('e-budget-open').hidden = true; $('e-budget').focus(); });
        $('e-save').addEventListener('click', addEvent);
        ['e-name', 'e-budget'].forEach(id => $(id).addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addEvent(); } }));
        $('copy-all').addEventListener('click', () => copyText(C.allText(state, t), 'due-msg'));
        $('csv').addEventListener('click', () => { download('event-budget-' + t + '.csv', '﻿' + C.csv(state), 'text/csv;charset=utf-8'); showMsg('due-msg', 'Saved the spreadsheet file (CSV). It opens in Excel or Google Sheets.'); });
        $('print').addEventListener('click', () => window.print());
        $('backup').addEventListener('click', () => {
            download(SLUG + '-backup-' + t + '.json', JSON.stringify({ app: SLUG, saved: t, state }, null, 1), 'application/json');
            showMsg('tools-msg', 'Saved the backup file. Keep it somewhere safe, such as your email or cloud drive.');
        });
        const pick = () => $('restore-file').click();
        $('restore').addEventListener('click', pick); $('restore-first').addEventListener('click', pick);
        $('restore-file').addEventListener('change', e => { restore(e.target.files[0]); e.target.value = ''; });
        $('del-all').addEventListener('click', () => {
            if (!state.events.length) { showMsg('tools-msg', 'There is nothing to delete.'); return; }
            change(() => { state.events = []; }, 'tools-msg', 'Deleted everything.');
        });
        // the day changes at midnight: redraw "in 3 days" and late payments
        document.addEventListener('visibilitychange', () => { if (!document.hidden && C.today(new Date()) !== t && !form) render(); });
        render();
        if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
    }
    start();
})();
