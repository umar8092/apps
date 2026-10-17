// Pocket Money and Chores Tracker for Kids: the page. The maths is in core.js.
(function () {
    'use strict';
    const M = window.PMC;
    const KEY = 'pocket-money-and-chores-tracker-for-kids.state';
    const $ = id => document.getElementById(id);
    const EXAMPLES = ['Make your bed', 'Tidy your room', 'Wash the dishes', 'Take out the bins', 'Feed the pet', 'Water the plants', 'Wash the car', 'Help with the shopping'];
    let st = M.emptyState(), storageOK = true, msg = null, open = null, focusKey = null, addOpen = false, lastDay = '';
    // a browser language the date functions cannot read (such as "en-US@posix") falls back to the default
    const locale = (() => { try { return Intl.getCanonicalLocales(navigator.language)[0]; } catch (e) { return undefined; } })();
    const today = () => M.dayStr(new Date());
    const cur = () => st.cur;
    const f = c => M.fmt(c, cur(), locale);
    const nd = (d, long) => M.niceDate(d, today(), locale, long);

    // ---- saving ----
    function load() {
        try {
            const raw = localStorage.getItem(KEY);
            if (raw) {
                let parsed = null;
                try { parsed = M.normalize(JSON.parse(raw)); } catch (e) { parsed = null; }
                if (parsed) st = parsed;
                else {
                    try { localStorage.setItem(KEY + '.broken', raw); } catch (e) { /* ignore */ }
                    msg = { where: 'top', text: 'Your saved data could not be read, so the app started fresh. A copy of the old data was kept on this device.' };
                }
            }
            localStorage.setItem(KEY + '.test', '1'); localStorage.removeItem(KEY + '.test');
        } catch (e) { storageOK = false; }
    }
    function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { storageOK = false; } }
    const snap = () => JSON.stringify(st);
    // every change: remember the state before it for Undo, save, draw, and say what happened
    function change(where, fn) {
        const before = snap();
        const text = fn();
        if (text === false) return false;
        save();
        msg = { where, text, snap: before };
        render();
        return true;
    }
    function undo() {
        if (!msg || !msg.snap) return;
        st = M.normalize(JSON.parse(msg.snap)) || M.emptyState();
        const where = msg.where;
        msg = { where: st.kids.some(k => k.id === where) ? where : 'top', text: 'Undone.' };
        open = null;
        payday();
        save(); render();
    }

    // pocket money for every payday up to today. Undo removes the money but keeps the paydays as done, so they are not added again.
    function payday() {
        const before = JSON.parse(snap());
        const added = M.runPaydays(st, today());
        lastDay = today();
        st.kids.forEach(k => { const b = before.kids.find(x => x.id === k.id); if (b) b.paidThrough = k.paidThrough; });
        before.seq = st.seq;
        if (!added.length) return false;
        save();
        msg = { where: 'top', text: M.paydayMessage(added, cur(), today(), locale) + (added.some(a => a.days.length > 1) ? ' Did not give all of those? Tap Undo, then add what you did give with "Add money".' : ''), snap: JSON.stringify(before) };
        return true;
    }

    // ---- small DOM helpers (user text always goes in with textContent) ----
    function el(tag, cls, text, attrs) {
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = text;
        if (attrs) Object.keys(attrs).forEach(k => (attrs[k] != null && e.setAttribute(k, attrs[k])));
        return e;
    }
    function btn(cls, text, fn, attrs) { const b = el('button', cls, text, attrs); b.type = 'button'; b.addEventListener('click', fn); return b; }
    function drawMsg(box, where) {
        box.textContent = ''; box.classList.remove('show', 'bad');
        if (!msg || msg.where !== where) return;
        box.classList.add('show');
        if (msg.bad) box.classList.add('bad');
        box.appendChild(el('span', '', msg.text));
        if (msg.snap) box.appendChild(btn('undo', 'Undo', undo, { 'data-f': 'undo' }));
    }
    function say(where, text, bad) { msg = { where, text, bad }; render(); }
    const kidById = id => st.kids.find(k => k.id === id);

    // a labelled field inside a panel; the typed value is kept in open.vals so a redraw never loses it
    function field(parent, kid, name, label, type, opts) {
        opts = opts || {};
        const id = 'f-' + kid.id + '-' + name, eid = 'e-' + kid.id + '-' + name, hid = opts.hint ? 'h-' + kid.id + '-' + name : null;
        parent.appendChild(el('label', '', label, { for: id }));
        let input;
        if (type === 'select') {
            input = el('select', '', null, { id });
            opts.options.forEach(([v, t]) => { const o = el('option', '', t, { value: v }); input.appendChild(o); });
        } else {
            input = el('input', '', null, { id, type, autocomplete: 'off', maxlength: opts.max || null, inputmode: opts.mode || null, placeholder: opts.ph || null });
        }
        input.setAttribute('aria-describedby', [eid, hid].filter(Boolean).join(' '));
        if (opts.maxDate) input.max = opts.maxDate;
        input.value = open.vals[name] != null ? open.vals[name] : '';
        if (type === 'select' && open.vals[name] == null) open.vals[name] = input.value;
        input.dataset.f = 'f-' + name;
        input.addEventListener('input', () => { open.vals[name] = input.value; if (opts.onInput) opts.onInput(); });
        input.addEventListener('change', () => { open.vals[name] = input.value; if (opts.onInput) opts.onInput(); });
        parent.appendChild(input);
        if (opts.hint) parent.appendChild(el('p', 'hint', opts.hint, { id: hid }));
        const err = el('p', 'err', open.errs[name] || '', { id: eid, role: 'alert' });
        if (open.errs[name]) input.setAttribute('aria-invalid', 'true');
        parent.appendChild(err);
        return input;
    }
    function openPanel(kid, what, vals, id) {
        open = { kid: kid.id, what, vals: vals || {}, errs: {}, id: id || null, all: false };
        focusKey = { hist: 'hist-h', money: 'f-amount' }[what] || 'f-name';
        msg = null;
        render();
    }
    function closePanel(kid, key) { open = null; focusKey = key || null; render(); }

    // ---- one child's box ----
    function kidCard(kid) {
        const t = today(), card = el('section', 'card kid', null, { 'aria-labelledby': 'h-' + kid.id, 'data-kid': kid.id });
        const head = el('div', 'kid-head');
        head.appendChild(el('h2', '', kid.name, { id: 'h-' + kid.id }));
        const bal = M.balance(kid), bp = el('p', 'bal' + (bal < 0 ? ' neg' : ''));
        bp.appendChild(el('span', 'bal-label', bal < 0 ? 'is short by' : 'has'));
        bp.appendChild(el('span', 'bal-num', f(bal)));
        head.appendChild(bp);
        card.appendChild(head);

        const s = M.sincePayday(kid, t), lines = el('ul', 'facts');
        if (kid.chores.length || s.choreCount) {
            const since = s.from ? 'Since payday (' + nd(s.from) + ')' : 'So far';
            lines.appendChild(el('li', '', s.choreCount ? since + ': ' + M.plural(s.choreCount, 'chore', 'chores') + ' done, earned ' + f(s.chores) + '.' : since + ': no chores done yet.'));
        }
        if (kid.allowance > 0) {
            const next = M.nextPayday(kid.sched, t), first = t < kid.sched.start;
            lines.appendChild(el('li', '', 'Pocket money: ' + f(kid.allowance) + ' ' + M.schedWords(kid.sched, locale) + '. ' + (first ? 'First payday: ' : 'Next: ') + nd(next) + '.'));
        } else lines.appendChild(el('li', '', 'No pocket money set: earns from chores only.'));
        if (bal < 0) lines.appendChild(el('li', 'neg', 'More was taken out than was added. Check "History" or tap "Add money".'));
        card.appendChild(lines);

        // savings goal
        const g = M.goalInfo(kid, t), gb = el('div', 'goal');
        if (g) {
            gb.appendChild(el('p', 'goal-h', 'Saving for: ' + g.name + ' (' + f(g.amount) + ')'));
            const bar = el('div', 'bar', null, { role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(g.pct), 'aria-label': 'Saved for ' + g.name });
            const fill = el('span'); fill.style.width = g.pct + '%'; bar.appendChild(fill);
            gb.appendChild(bar);
            if (g.reached) gb.appendChild(el('p', 'goal-t ok', 'Enough saved! ' + kid.name + ' can buy it now.'));
            else gb.appendChild(el('p', 'goal-t', f(g.saved) + ' saved, ' + f(g.left) + ' to go' + (g.paydays ? ': about ' + M.plural(g.paydays, 'more payday', 'more paydays') + ' (' + nd(g.by) + ')' : '') + '.'));
            const gbtn = el('div', 'goal-btns');
            if (g.reached) gbtn.appendChild(btn('mini strong', 'Bought it', () => bought(kid), { 'data-f': 'bought-' + kid.id }));
            gbtn.appendChild(btn('mini', 'Change goal', () => openPanel(kid, 'goal', { name: kid.goal.name, amount: M.plainAmount(kid.goal.amount) }), { 'data-f': 'goal-' + kid.id }));
            gb.appendChild(gbtn);
        } else gb.appendChild(btn('link', '+ Set a savings goal', () => openPanel(kid, 'goal', {}), { 'data-f': 'goal-' + kid.id }));
        card.appendChild(gb);

        const m = el('div', 'msg', null, { role: 'status', 'aria-live': 'polite' }); drawMsg(m, kid.id); card.appendChild(m);

        // chores
        card.appendChild(el('h3', 'ch-h', kid.name + "'s chores"));
        if (!kid.chores.length) card.appendChild(el('p', 'hint', 'No chores yet. Add jobs ' + kid.name + ' can do, with or without pay.'));
        const ul = el('ul', 'chores');
        kid.chores.forEach(c => {
            const li = el('li', 'chore'), info = el('div', 'ch-info'), n = M.doneOn(kid, c.id, t);
            info.appendChild(el('span', 'ch-name', c.name));
            info.appendChild(el('span', 'ch-pay', c.value > 0 ? 'Pays ' + f(c.value) : 'No pay'));
            if (n) info.appendChild(el('span', 'ch-done', n === 1 ? 'Done today' : 'Done ' + n + ' times today'));
            li.appendChild(info);
            const bs = el('div', 'ch-btns');
            bs.appendChild(btn('mini strong', 'Done', () => done(kid, c), { 'data-f': 'done-' + c.id, 'aria-label': 'Done: ' + c.name }));
            bs.appendChild(btn('mini', 'Edit', () => openPanel(kid, 'chore', { name: c.name, value: c.value ? M.plainAmount(c.value) : '' }, c.id), { 'data-f': 'edit-' + c.id, 'aria-label': 'Edit chore: ' + c.name }));
            li.appendChild(bs);
            ul.appendChild(li);
        });
        card.appendChild(ul);
        card.appendChild(btn('link', '+ Add a chore', () => openPanel(kid, 'chore', {}), { 'data-f': 'addchore-' + kid.id }));

        const kb = el('div', 'kid-btns');
        kb.appendChild(btn('mini', 'Add money', () => openPanel(kid, 'money', { kind: 'in', date: t }), { 'data-f': 'in-' + kid.id }));
        kb.appendChild(btn('mini', 'Take money out', () => openPanel(kid, 'money', { kind: 'out', date: t }), { 'data-f': 'out-' + kid.id }));
        kb.appendChild(btn('mini', 'History', () => (open && open.kid === kid.id && open.what === 'hist' ? closePanel(kid, 'hist-' + kid.id) : openPanel(kid, 'hist')), { 'data-f': 'hist-' + kid.id, 'aria-expanded': String(!!(open && open.kid === kid.id && open.what === 'hist')) }));
        kb.appendChild(btn('mini', 'Settings', () => openPanel(kid, 'settings', { name: kid.name, pay: kid.allowance ? M.plainAmount(kid.allowance) : '', freq: kid.sched.freq, start: t < kid.sched.start ? kid.sched.start : M.nextPayday(kid.sched, t) }), { 'data-f': 'set-' + kid.id }));
        card.appendChild(kb);

        if (open && open.kid === kid.id) card.appendChild(panel(kid));
        return card;
    }

    // ---- the open form under a child's box ----
    function panel(kid) {
        const p = el('form', 'panel'), w = open.what, t = today();
        p.noValidate = true;
        const title = { chore: open.id ? 'Edit chore' : 'Add a chore for ' + kid.name, money: open.id ? 'Edit this entry' : (open.vals.kind === 'out' ? 'Take money out' : 'Add money'),
            goal: kid.goal ? 'Change the savings goal' : 'Set a savings goal', settings: kid.name + "'s settings", hist: kid.name + "'s history" }[w];
        p.appendChild(el('h3', 'panel-h', title, { tabindex: '-1', 'data-f': w === 'hist' ? 'hist-h' : 'first' }));
        const buttons = (saveText, del) => {
            const r = el('div', 'row-btns');
            const sb = el('button', 'primary', saveText, { 'data-f': 'save' }); sb.type = 'submit'; r.appendChild(sb);
            r.appendChild(btn('secondary', 'Cancel', () => closePanel(kid, null)));
            p.appendChild(r);
            if (del) p.appendChild(btn('danger', del[0], del[1]));
        };
        if (w === 'chore') {
            const nameIn = field(p, kid, 'name', 'Chore', 'text', { max: M.NAME_MAX, ph: 'e.g. Tidy your room' });
            if (!open.id) {
                const q = el('div', 'quick', null, { role: 'group', 'aria-label': 'Example chores' });
                EXAMPLES.filter(x => !kid.chores.some(c => c.name.toLowerCase() === x.toLowerCase())).forEach(x => q.appendChild(btn('chip', x, () => { open.vals.name = x; nameIn.value = x; $('f-' + kid.id + '-value').focus(); })));
                if (q.childNodes.length) p.appendChild(q);
            }
            field(p, kid, 'value', 'Pays', 'text', { max: 14, mode: 'decimal', ph: 'e.g. 1', hint: 'Leave empty for a job with no pay.' });
            buttons(open.id ? 'Save chore' : 'Add chore', open.id ? ['Delete this chore', () => delChore(kid)] : null);
            p.addEventListener('submit', e => { e.preventDefault(); saveChore(kid); });
        } else if (w === 'money') {
            const entry = open.id ? kid.log.find(e => e.id === open.id) : null;
            if (!entry || entry.kind === 'in' || entry.kind === 'out') {
                const fs = el('fieldset', 'mode'), seg = el('div', 'seg');
                fs.appendChild(el('legend', '', 'Money'));
                [['in', 'Add money'], ['out', 'Take money out']].forEach(([v, txt]) => {
                    const l = el('label'), r = el('input', null, null, { type: 'radio', name: 'k-' + kid.id, value: v, 'data-f': 'kind-' + v });
                    r.checked = open.vals.kind === v;
                    r.addEventListener('change', () => { open.vals.kind = v; open.errs = {}; focusKey = 'kind-' + v; render(); });
                    l.appendChild(r); l.appendChild(document.createTextNode(' ' + txt)); seg.appendChild(l);
                });
                fs.appendChild(seg); p.appendChild(fs);
            } else p.appendChild(el('p', 'hint', entry.kind === 'pay' ? 'Pocket money for payday ' + nd(entry.date) + '.' : 'Chore: ' + (entry.note || 'chore') + '.'));
            const out = open.vals.kind === 'out';
            const can = M.maxOut(kid, open.id);
            field(p, kid, 'amount', 'Amount', 'text', { max: 14, mode: 'decimal', ph: out ? 'e.g. 3.50' : 'e.g. 10', hint: out ? kid.name + ' has ' + f(Math.max(0, can)) + ' to take out.' : null });
            if (!entry || entry.kind === 'in' || entry.kind === 'out') field(p, kid, 'note', 'What for? (optional)', 'text', { max: M.NOTE_MAX, ph: out ? 'e.g. Football stickers' : 'e.g. Gift from Grandma' });
            field(p, kid, 'date', 'Date', 'date', { maxDate: t });
            buttons(open.id ? 'Save change' : out ? 'Take out' : 'Add money', open.id ? ['Delete this entry', () => delEntry(kid)] : null);
            p.addEventListener('submit', e => { e.preventDefault(); saveMoney(kid); });
        } else if (w === 'goal') {
            field(p, kid, 'name', 'What are they saving for?', 'text', { max: M.NAME_MAX, ph: 'e.g. A new bike' });
            field(p, kid, 'amount', 'It costs', 'text', { max: 14, mode: 'decimal', ph: 'e.g. 120' });
            buttons('Save goal', kid.goal ? ['Remove the goal', () => change(kid.id, () => { kid.goal = null; open = null; return 'Goal removed.'; })] : null);
            p.addEventListener('submit', e => { e.preventDefault(); saveGoal(kid); });
        } else if (w === 'settings') {
            const upd = () => { const pv = p.querySelector('.preview'); if (pv) pv.textContent = schedPreview(open.vals.name || kid.name, open.vals, kid); };
            field(p, kid, 'name', "Child's name", 'text', { max: M.NAME_MAX, onInput: upd });
            field(p, kid, 'pay', 'Pocket money each payday', 'text', { max: 14, mode: 'decimal', ph: 'e.g. 5', hint: 'Leave empty if they only earn money from chores. A new amount counts from the next payday.', onInput: upd });
            const pair = el('div', 'pair'), a = el('div'), b = el('div');
            field(a, kid, 'freq', 'How often', 'select', { options: Object.keys(M.FREQS).map(k => [k, M.FREQS[k]]), onInput: upd });
            field(b, kid, 'start', 'Next payday', 'date', { onInput: upd });
            pair.appendChild(a); pair.appendChild(b); p.appendChild(pair);
            p.appendChild(el('p', 'preview', schedPreview(open.vals.name || kid.name, open.vals, kid), { 'aria-live': 'polite' }));
            buttons('Save settings', ['Delete ' + kid.name, () => delKid(kid)]);
            p.addEventListener('submit', e => { e.preventDefault(); saveSettings(kid); });
        } else if (w === 'hist') {
            const rows = M.history(kid);
            if (!rows.length) p.appendChild(el('p', 'hint', 'Nothing yet. Pocket money, chores and money in and out will be listed here.'));
            const ul = el('ul', 'hist');
            (open.all ? rows : rows.slice(0, 30)).forEach(r => {
                const e = r.entry, li = el('li'), main = el('div', 'h-main');
                main.appendChild(el('span', 'h-what', M.entryWords(e)));
                main.appendChild(el('span', 'h-date', nd(e.date)));
                li.appendChild(main);
                const side = el('div', 'h-side');
                side.appendChild(el('span', 'h-amt ' + (e.kind === 'out' ? 'minus' : 'plus'), (e.kind === 'out' ? '−' : '+') + f(e.amount)));
                side.appendChild(el('span', 'h-after', 'Left: ' + f(r.after)));
                li.appendChild(side);
                li.appendChild(btn('mini', 'Edit', () => openPanel(kid, 'money', { kind: e.kind, amount: M.plainAmount(e.amount), note: e.kind === 'in' || e.kind === 'out' ? e.note : '', date: e.date }, e.id), { 'data-f': 'he-' + e.id, 'aria-label': 'Edit: ' + M.entryWords(e) + ', ' + nd(e.date) }));
                ul.appendChild(li);
            });
            p.appendChild(ul);
            if (!open.all && rows.length > 30) p.appendChild(btn('link', 'Show all ' + rows.length, () => { open.all = true; render(); }));
            p.appendChild(btn('secondary', 'Close history', () => closePanel(kid, 'hist-' + kid.id)));
        }
        return p;
    }

    // ---- actions on a child ----
    function amountOrErr(name, text, opt) { const r = M.parseAmount(text, opt); if (r.error) open.errs[name] = r.error; return r.cents; }
    function badDate(name, d) {
        if (!M.isDay(d)) { open.errs[name] = 'Pick a date.'; return true; }
        if (d > today()) { open.errs[name] = 'That date has not come yet. Pick today or an earlier day.'; return true; }
        return false;
    }
    function failed() { const k = Object.keys(open.errs)[0]; focusKey = k ? 'f-' + k : null; render(); return !!k; }

    function done(kid, c) {
        change(kid.id, () => {
            kid.log.push({ id: M.uid(st), kind: 'chore', amount: c.value, date: today(), seq: st.seq, note: c.name, choreId: c.id });
            focusKey = 'done-' + c.id;
            return c.name + ': done' + (c.value ? ', ' + f(c.value) + ' added.' : '.');
        });
    }
    function saveChore(kid) {
        open.errs = {};
        const name = (open.vals.name || '').trim().replace(/\s+/g, ' ');
        if (!name) open.errs.name = 'Type the chore, such as Tidy your room.';
        else if (kid.chores.some(c => c.id !== open.id && c.name.toLowerCase() === name.toLowerCase())) open.errs.name = kid.name + ' already has this chore.';
        const value = amountOrErr('value', open.vals.value, { zero: true, blank: 0 });
        if (failed()) return;
        const id = open.id;
        change(kid.id, () => {
            if (id) { const c = kid.chores.find(x => x.id === id); c.name = name; c.value = value; focusKey = 'edit-' + id; }
            else { const c = { id: M.uid(st), name, value }; kid.chores.push(c); focusKey = 'addchore-' + kid.id; }
            open = id ? null : { kid: kid.id, what: 'chore', vals: {}, errs: {} };
            if (!id) focusKey = 'f-name';
            return id ? 'Chore saved. Money already earned stays the same.' : name + ' added' + (value ? ', pays ' + f(value) : ', no pay') + '. Add another, or tap Cancel.';
        });
    }
    function delChore(kid) {
        const id = open.id;
        change(kid.id, () => {
            const c = kid.chores.find(x => x.id === id);
            kid.chores = kid.chores.filter(x => x.id !== id); open = null; focusKey = 'addchore-' + kid.id;
            return '"' + c.name + '" deleted. Money already earned stays.';
        });
    }
    function saveMoney(kid) {
        open.errs = {};
        const v = open.vals, entry = open.id ? kid.log.find(e => e.id === open.id) : null;
        const kind = entry && (entry.kind === 'pay' || entry.kind === 'chore') ? entry.kind : v.kind;
        const amount = amountOrErr('amount', v.amount, { zero: kind === 'chore' });
        badDate('date', v.date);
        if (!open.errs.amount && kind === 'out') {
            const can = M.maxOut(kid, open.id);
            if (amount > can) open.errs.amount = can > 0 ? 'That is more than ' + kid.name + ' has. The most you can take out is ' + f(can) + '.' : kid.name + ' has no money to take out.';
        }
        // editing a pocket money or chore entry down must not leave more taken out than was added
        if (!open.errs.amount && entry && kind !== 'out' && M.maxOut(kid, entry.id) + amount < 0 && amount < entry.amount)
            open.errs.amount = 'That would leave ' + kid.name + ' with less than nothing, because money was already taken out.';
        if (failed()) return;
        const note = (v.note || '').trim().replace(/\s+/g, ' ').slice(0, M.NOTE_MAX);
        change(kid.id, () => {
            let text;
            if (entry) {
                entry.amount = amount; entry.date = v.date;
                if (kind === 'in' || kind === 'out') { entry.kind = kind; entry.note = note; }
                text = 'Entry saved.';
                open = { kid: kid.id, what: 'hist', vals: {}, errs: {} }; focusKey = 'hist-h';
            } else {
                kid.log.push({ id: M.uid(st), kind, amount, date: v.date, seq: st.seq, note });
                text = (kind === 'out' ? f(amount) + ' taken out' : f(amount) + ' added') + (note ? ' (' + note + ')' : '') + '. ' + M.balanceWords(kid, cur(), locale) + '.';
                open = null; focusKey = (kind === 'out' ? 'out-' : 'in-') + kid.id;
            }
            return text;
        });
    }
    function delEntry(kid) {
        const id = open.id, e = kid.log.find(x => x.id === id);
        if (e.kind !== 'out' && M.maxOut(kid, id) < 0) { open.errs = { amount: 'This cannot be deleted: money was already taken out of it. Delete or change what was taken out first.' }; focusKey = 'f-amount'; return render(); }
        change(kid.id, () => {
            kid.log = kid.log.filter(x => x.id !== id);
            open = { kid: kid.id, what: 'hist', vals: {}, errs: {} }; focusKey = 'hist-h';
            return 'Entry deleted (' + M.entryWords(e) + ', ' + nd(e.date) + ').';
        });
    }
    function saveGoal(kid) {
        open.errs = {};
        const name = (open.vals.name || '').trim().replace(/\s+/g, ' ');
        if (!name) open.errs.name = 'Type what they are saving for, such as A new bike.';
        const amount = amountOrErr('amount', open.vals.amount);
        if (failed()) return;
        change(kid.id, () => { kid.goal = { name, amount }; open = null; focusKey = 'goal-' + kid.id; return 'Goal saved: ' + name + ', ' + f(amount) + '.'; });
    }
    function bought(kid) {
        const g = kid.goal;
        if (M.balance(kid) < g.amount) return;
        change(kid.id, () => {
            kid.log.push({ id: M.uid(st), kind: 'out', amount: g.amount, date: today(), seq: st.seq, note: g.name.slice(0, M.NOTE_MAX) });
            kid.goal = null; focusKey = 'goal-' + kid.id;
            return 'Well done! ' + f(g.amount) + ' taken out for ' + g.name + '. ' + M.balanceWords(kid, cur(), locale) + ' left.';
        });
    }
    function schedPreview(name, v, kid) {
        const pay = M.parseAmount(v.pay, { zero: true, blank: 0 });
        if (pay.error) return '';
        if (!pay.cents) return name + ' earns money from chores only.';
        if (!M.isDay(v.start)) return '';
        const sched = { freq: v.freq || 'week', start: v.start }, t = today();
        let text = name + ' gets ' + f(pay.cents) + ' ' + M.schedWords(sched, locale) + '. ';
        const after = kid ? (kid.paidThrough > M.addDays(v.start, -1) ? kid.paidThrough : M.addDays(v.start, -1)) : M.addDays(v.start, -1);
        const back = M.paydaysBetween(sched, after, t);
        if (v.start > t) text += (kid ? 'Next payday: ' : 'First payday: ') + nd(v.start) + ' (in ' + M.plural(M.daysBetween(t, v.start), 'day', 'days') + ').';
        else if (back.length === 1 && back[0] === t) text += (kid ? 'Payday is today: ' : 'First payday is today: ') + f(pay.cents) + ' is added now.';
        else if (back.length) text += M.plural(back.length, 'payday', 'paydays') + ' from ' + nd(back[0]) + ' to today ' + (back.length === 1 ? 'is' : 'are') + ' added now: ' + f(pay.cents * back.length) + '.';
        else text += 'Next payday: ' + nd(M.nextPayday(sched, t)) + '.';
        return text;
    }
    function saveSettings(kid) {
        open.errs = {};
        const v = open.vals, name = (v.name || '').trim().replace(/\s+/g, ' ');
        if (!name) open.errs.name = "Type the child's name.";
        else if (st.kids.some(k => k.id !== kid.id && k.name.toLowerCase() === name.toLowerCase())) open.errs.name = 'You already have a child called ' + name + '. Add an initial, such as ' + name + ' K.';
        const pay = amountOrErr('pay', v.pay, { zero: true, blank: 0 });
        if (!M.isDay(v.start)) open.errs.start = 'Pick the next payday.';
        if (failed()) return;
        change(kid.id, () => {
            kid.name = name; kid.allowance = pay; kid.sched = { freq: M.FREQS[v.freq] ? v.freq : 'week', start: v.start };
            const prev = M.addDays(v.start, -1);
            if (prev > kid.paidThrough) kid.paidThrough = prev; // never pays the same payday twice
            const added = M.runPaydays(st, today());
            open = null; focusKey = 'set-' + kid.id;
            return 'Settings saved.' + (added.length ? ' ' + M.paydayMessage(added, cur(), today(), locale) : '');
        });
    }
    function delKid(kid) {
        change('top', () => { st.kids = st.kids.filter(k => k.id !== kid.id); open = null; focusKey = 'undo'; return kid.name + ' deleted, with all their money and chores.'; });
    }

    // ---- add a child ----
    function addPreview() {
        $('a-preview').textContent = schedPreview($('a-name').value.trim() || 'Your child', { pay: $('a-pay').value, freq: $('a-freq').value, start: $('a-start').value }, null);
    }
    function addKid(e) {
        e.preventDefault();
        ['a-name', 'a-pay', 'a-start'].forEach(id => { $('e-' + id).textContent = ''; $(id).removeAttribute('aria-invalid'); });
        const err = (id, text) => { $('e-' + id).textContent = text; $(id).setAttribute('aria-invalid', 'true'); };
        const name = $('a-name').value.trim().replace(/\s+/g, ' ');
        if (!name) err('a-name', "Type the child's name.");
        else if (st.kids.some(k => k.name.toLowerCase() === name.toLowerCase())) err('a-name', 'You already have a child called ' + name + '. Add an initial, such as ' + name + ' K.');
        else if (st.kids.length >= 20) err('a-name', 'This app holds up to 20 children.');
        const pay = M.parseAmount($('a-pay').value, { zero: true, blank: 0 });
        if (pay.error) err('a-pay', pay.error);
        const start = $('a-start').value;
        if (!M.isDay(start)) err('a-start', 'Pick the first payday.');
        const bad = document.querySelector('#add-form [aria-invalid="true"]');
        if (bad) { bad.focus(); return; }
        change('top', () => {
            const kid = { id: M.uid(st), name: name.slice(0, M.NAME_MAX), allowance: pay.cents, sched: { freq: $('a-freq').value, start }, paidThrough: M.addDays(start, -1), goal: null, chores: [], log: [] };
            st.kids.push(kid);
            const added = M.runPaydays(st, today());
            $('add-form').reset(); $('a-start').value = today(); addOpen = false;
            open = { kid: kid.id, what: 'chore', vals: {}, errs: {} }; focusKey = 'f-name';
            return name + ' added.' + (added.length ? ' ' + M.paydayMessage(added, cur(), today(), locale).replace('Payday! ', '') : '') + ' Now add the chores ' + name + ' can do.';
        });
    }

    // ---- share, print, backup ----
    function copyText(text, where) {
        const okMsg = () => say(where, 'Copied. Paste it into a message or a note.');
        const fallback = () => {
            const ta = el('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'absolute'; ta.style.left = '-9999px';
            document.body.appendChild(ta); ta.select();
            let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
            ta.remove(); ok ? okMsg() : say(where, 'Your browser did not allow copying. Use "Email the summary" instead.', true);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(okMsg, fallback); else fallback();
    }
    function buildChart() {
        const c = $('chart'); c.textContent = '';
        const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        st.kids.filter(k => k.chores.length).forEach(kid => {
            const s = el('div', 'chart-kid');
            s.appendChild(el('h2', '', kid.name + "'s chores"));
            s.appendChild(el('p', '', 'Week of ______________' + (kid.allowance > 0 ? '   ·   Pocket money: ' + f(kid.allowance) + ' ' + M.schedWords(kid.sched, locale) : '')));
            const tb = el('table'), hr = el('tr');
            hr.appendChild(el('th', '', 'Chore')); hr.appendChild(el('th', '', 'Pays'));
            days.forEach(d => hr.appendChild(el('th', '', d)));
            const th = el('thead'); th.appendChild(hr); tb.appendChild(th);
            const body = el('tbody');
            kid.chores.forEach(ch => {
                const tr = el('tr');
                tr.appendChild(el('td', 'c-name', ch.name)); tr.appendChild(el('td', '', ch.value ? f(ch.value) : '–'));
                days.forEach(() => tr.appendChild(el('td', 'c-box', '')));
                body.appendChild(tr);
            });
            tb.appendChild(body); s.appendChild(tb); c.appendChild(s);
        });
    }
    function printChart() {
        if (!st.kids.some(k => k.chores.length)) return say('set', 'Add a chore to a child first, then print the chart.', true);
        buildChart();
        document.body.classList.add('print-chart');
        const off = () => document.body.classList.remove('print-chart');
        window.addEventListener('afterprint', off, { once: true });
        window.print();
        setTimeout(off, 1000);
    }
    function backup() {
        const blob = new Blob([JSON.stringify(st, null, 1)], { type: 'application/json' });
        const a = el('a', null, null, { href: URL.createObjectURL(blob), download: 'pocket-money-backup-' + today() + '.json' });
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        say('set', 'Backup saved to your downloads. Keep it somewhere safe.');
    }
    function restore(file) {
        if (!file) return;
        const r = new FileReader();
        r.onload = () => {
            let next = null;
            try { next = M.normalize(JSON.parse(String(r.result))); } catch (e) { next = null; }
            if (!next || !next.kids.length) return say(st.kids.length ? 'set' : 'top', 'That file is not a backup from this app, so nothing was changed.', true);
            change('top', () => { st = next; open = null; M.runPaydays(st, today()); focusKey = 'undo'; return 'Backup restored: ' + M.plural(st.kids.length, 'child', 'children') + '.'; });
        };
        r.onerror = () => say('set', 'That file could not be read.', true);
        r.readAsText(file);
    }

    // ---- draw everything ----
    function render() {
        const t = today(), app = $('app');
        $('storage-warn').hidden = storageOK;
        app.classList.toggle('setup', !st.kids.length);
        drawMsg($('top-msg'), 'top');
        const box = $('kids'); box.textContent = '';
        st.kids.forEach(k => box.appendChild(kidCard(k)));
        // add form: open on first use, behind a button afterwards
        const showForm = !st.kids.length || addOpen;
        $('add-form').hidden = !showForm; $('open-add').hidden = showForm; $('a-cancel').hidden = !st.kids.length;
        $('add-h').textContent = st.kids.length ? 'Add another child' : 'Add a child';
        $('add-h').hidden = !showForm;
        drawMsg($('add-msg'), 'add');
        $('settings').hidden = !st.kids.length;
        drawMsg($('set-msg'), 'set');
        $('mail-all').href = 'mailto:?subject=' + encodeURIComponent('Pocket money') + '&body=' + encodeURIComponent(M.summaryText(st, t, locale));
        if ($('cur').value !== st.cur) $('cur').value = st.cur;
        if (!$('a-start').value) $('a-start').value = t;
        addPreview();
        if (focusKey) {
            const k = focusKey; focusKey = null;
            const scope = open ? document.querySelector('[data-kid="' + open.kid + '"]') || document : document;
            const target = scope.querySelector('[data-f="' + k + '"]') || document.querySelector('[data-f="' + k + '"]');
            if (target) target.focus({ preventScroll: false });
        }
    }

    // ---- start ----
    load();
    M.SYMBOLS.forEach(s => $('cur').appendChild(el('option', '', s || 'None (plain numbers)', { value: s })));
    $('cur').addEventListener('change', () => { st.cur = M.SYMBOLS.includes($('cur').value) ? $('cur').value : ''; save(); msg = null; render(); });
    $('add-form').addEventListener('submit', addKid);
    ['a-name', 'a-pay', 'a-freq', 'a-start'].forEach(id => $(id).addEventListener('input', addPreview));
    $('a-freq').addEventListener('change', addPreview);
    $('open-add').addEventListener('click', () => { addOpen = true; msg = null; render(); $('a-name').focus(); });
    $('a-cancel').addEventListener('click', () => { addOpen = false; $('add-form').reset(); $('a-start').value = today(); render(); $('open-add').focus(); });
    $('copy-all').addEventListener('click', () => copyText(M.summaryText(st, today(), locale), 'set'));
    $('print-chart').addEventListener('click', printChart);
    $('backup').addEventListener('click', backup);
    $('restore').addEventListener('click', () => $('restore-file').click());
    $('restore-file').addEventListener('change', e => { restore(e.target.files[0]); e.target.value = ''; });
    $('wipe').addEventListener('click', () => change('top', () => { st = Object.assign(M.emptyState(), { cur: st.cur }); open = null; focusKey = 'undo'; return 'Everything deleted.'; }));
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && open && !document.querySelector('dialog[open]')) { const k = open.kid; closePanel(kidById(k) || {}, null); } });
    payday();
    render();
    // a new day while the page is open (or the phone wakes up): add pocket money if it is payday
    const tick = () => { if (today() !== lastDay && payday()) render(); else if (today() !== lastDay) { lastDay = today(); render(); } };
    setInterval(tick, 30000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });

    if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
