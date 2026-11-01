// Charity and Donation Log with Yearly Total: the page. The maths and the words are in core.js (window.GIVING).
(function () {
    'use strict';
    const C = window.GIVING, SLUG = 'charity-and-donation-log-with-yearly-total', KEY = SLUG + '.state';
    const $ = id => document.getElementById(id);
    const LOC = (() => { for (const l of [navigator.language, String(navigator.language || '').split(/[@.]/)[0], 'en-GB']) { try { if (l && Intl.getCanonicalLocales(l).length) return l; } catch (e) { /* try the next */ } } return 'en-GB'; })();
    const CUR_NAMES = { '': 'None (plain numbers)', 'Rs': 'Rs (rupee)', '₹': '₹ (rupee)', '$': '$ (dollar)', '€': '€ (euro)', '£': '£ (pound)', 'A$': 'A$ (Australian dollar)', 'C$': 'C$ (Canadian dollar)',
        'NZ$': 'NZ$ (New Zealand dollar)', 'AED': 'AED (dirham)', 'SAR': 'SAR (riyal)', 'QAR': 'QAR (riyal)', 'KWD': 'KWD (dinar)', 'R': 'R (rand)', '৳': '৳ (taka)', '₦': '₦ (naira)', 'KSh': 'KSh (shilling)',
        'GH₵': 'GH₵ (cedi)', 'E£': 'E£ (Egyptian pound)', 'RM': 'RM (ringgit)', 'Rp': 'Rp (rupiah)', '₱': '₱ (peso)', 'S$': 'S$ (Singapore dollar)', '¥': '¥ (yen, yuan)', '₺': '₺ (lira)', 'R$': 'R$ (real)', 'kr': 'kr (krona, krone)', 'CHF': 'CHF (franc)', 'zł': 'zł (złoty)' };
    const OWN = '__own', PAGE = 50;
    let state = C.emptyState(), t = C.today(new Date()), viewY = null;
    let editId = null, find = '', showN = PAGE, panel = {};
    let flash = null, undoSnap = null, canSave = true, loadNote = '';

    // ---------- saving ----------
    function load() {
        let raw = null;
        try { raw = localStorage.getItem(KEY); } catch (e) { canSave = false; }
        let tz = ''; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { tz = ''; }
        state.yearStart = C.guessYearStart(tz);
        if (!raw) return;
        let s = null;
        try { s = C.cleanState(JSON.parse(raw)); } catch (e) { s = null; }
        if (s) state = s; else loadNote = 'Your saved gifts could not be read, so the app started fresh. If you have a backup file, restore it below.';
    }
    function save() {
        if (!canSave) { $('store-warn').hidden = false; return; }
        try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { canSave = false; $('store-warn').hidden = false; }
    }
    function change(fn, where, text, after) {
        const before = JSON.stringify(state);
        fn();
        save();
        if (after) after();
        undoSnap = before;
        flash = { where, text, undo: true };
        render();
    }
    function undo() {
        if (!undoSnap) return;
        const s = C.cleanState(JSON.parse(undoSnap));
        if (s) state = s;
        const where = flash && $(flash.where) ? flash.where : 'top-msg';
        undoSnap = null; panel = {};
        if (editId && !state.gifts.some(g => g.id === editId)) resetForm();
        save();
        flash = { where, text: 'Undone.' };
        fillSettings(); fillLists();
        render();
    }

    // ---------- helpers ----------
    function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
    function btn(text, cls, fn, label) { const b = el('button', cls, text); b.type = 'button'; if (label) b.setAttribute('aria-label', label); b.addEventListener('click', fn); return b; }
    const p = (cls, text) => el('p', cls, text);
    // a no-break space keeps "Rs" on the same line as the number
    const money = c => C.fmtMoney(c, state.cur, LOC).replace(' ', ' ');
    const date = (s, o) => C.fmtDate(s, t, o);
    const newId = pre => pre + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const plural = C.plural;
    const curYear = () => C.yearOf(t, state.yearStart).y;
    function copyText(text, where) {
        const done = () => { flash = { where, text: 'Copied. Paste it into a message or email.' }; render(); };
        const fallback = () => {
            const ta = el('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'absolute'; ta.style.left = '-9999px';
            document.body.appendChild(ta); ta.select();
            let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
            ta.remove();
            if (ok) done(); else { flash = { where, text: 'Could not copy here. Use Email summary instead.', bad: true }; render(); }
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
    function clearMsgs() { document.querySelectorAll('.msg').forEach(m => { m.textContent = ''; m.className = 'msg'; }); }
    function download(name, type, text) {
        const blob = new Blob([text], { type });
        const a = el('a'); a.href = URL.createObjectURL(blob); a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }
    function fillSelect(sel, pairs, value) {
        sel.textContent = '';
        pairs.forEach(([v, text]) => { const o = el('option', null, text); o.value = v; sel.appendChild(o); });
        if (value != null) sel.value = value;
    }

    // ---------- the form ----------
    const rc = () => (document.querySelector('input[name="f-rc"]:checked') || {}).value || 'none';
    function setRc(v) { document.querySelectorAll('input[name="f-rc"]').forEach(r => { r.checked = r.value === v; }); }
    function fillLists() {
        const dl = $('f-to-list'); dl.textContent = '';
        C.names(state, 'to').slice(0, 200).forEach(n => { const o = el('option'); o.value = n; dl.appendChild(o); });
        const bl = $('f-behalf-list'); bl.textContent = '';
        C.names(state, 'behalf').slice(0, 50).forEach(n => { const o = el('option'); o.value = n; bl.appendChild(o); });
        const keep = $('f-kind').value;
        const pairs = C.kinds(state).map(k => [k, k]).concat([[OWN, 'Other (type your own)']]);
        fillSelect($('f-kind'), pairs, pairs.some(x => x[0] === keep) ? keep : C.KINDS[0]);
        $('f-kind-box').hidden = $('f-kind').value !== OWN;
    }
    function lastTo(name) {
        const n = C.norm(name); if (!n) return null;
        return state.gifts.filter(g => C.norm(g.to) === n).reduce((a, g) => !a || g.date > a.date ? g : a, null);
    }
    // a name used before fills in its usual kind, payment and receipt
    function applyDefaults() {
        if (editId) return;
        const g = lastTo($('f-to').value);
        $('f-amt').placeholder = g ? 'last time ' + C.fmtNum(g.amt, LOC) : 'e.g. 5000';
        if (!g) return;
        if ([...$('f-kind').options].some(o => o.value === g.kind)) { $('f-kind').value = g.kind; $('f-kind-box').hidden = true; }
        $('f-how').value = g.how;
        setRc(g.receipt);
    }
    function updateForm() {
        const rep = !editId && $('f-rep').value;
        $('f-rep-box').hidden = !!editId;
        $('f-date-l').textContent = rep ? 'First gift on' : 'Date given';
        $('f-save').textContent = editId ? 'Save changes' : rep ? 'Add regular gift' : 'Add gift';
        $('f-cancel').hidden = !editId;
        $('add-h').textContent = editId ? 'Edit this gift' : 'Add a gift';
        $('add').classList.toggle('editing', !!editId);
        ['f-amt-tag', 'pl-tag', 'goal-tag'].forEach(id => { $(id).hidden = !state.cur; $(id).textContent = state.cur; });
        const h = $('f-rep-hint');
        h.hidden = !rep;
        if (rep) {
            const d = C.isDate($('f-date').value) ? $('f-date').value : t;
            const words = C.freqWords({ freq: rep, start: d }).toLowerCase();
            h.textContent = d <= t ? 'The gift on ' + date(d) + ' is added now. After that, ' + words + ', the app asks you to confirm it was given.'
                : 'Nothing is added yet. From ' + date(d) + ', ' + words + ', the app asks you to confirm it was given.';
        }
    }
    function openOpt(name, show) { $('f-' + name + '-box').hidden = !show; $('f-' + name + '-open').hidden = show; }
    function resetForm() {
        editId = null;
        ['f-to', 'f-amt', 'f-kind-own', 'f-behalf', 'f-note'].forEach(id => { $(id).value = ''; });
        ['f-to', 'f-amt', 'f-date', 'f-kind-own'].forEach(id => setErr(id, ''));
        $('f-date').value = t; $('f-rep').value = '';
        $('f-kind').value = C.KINDS[0]; $('f-kind-box').hidden = true;
        $('f-how').value = 'cash'; setRc('none');
        $('f-amt').placeholder = 'e.g. 5000';
        openOpt('behalf', false); openOpt('note', false);
        updateForm();
    }
    function startEdit(id) {
        const g = state.gifts.find(x => x.id === id); if (!g) return;
        resetForm();
        editId = id;
        $('f-to').value = g.to; $('f-amt').value = C.moneyInput(g.amt); $('f-date').value = g.date;
        if (![...$('f-kind').options].some(o => o.value === g.kind)) fillLists();
        $('f-kind').value = g.kind; $('f-kind-box').hidden = true;
        $('f-how').value = g.how; setRc(g.receipt);
        $('f-behalf').value = g.behalf; openOpt('behalf', !!g.behalf);
        $('f-note').value = g.note; openOpt('note', !!g.note);
        updateForm(); render();
        $('add').scrollIntoView({ block: 'start', behavior: 'smooth' });
        $('f-to').focus({ preventScroll: true });
    }
    function readForm() {
        let ok = true;
        const to = C.tidy($('f-to').value, 60);
        if (!to) ok = setErr('f-to', 'Type who you gave to, such as a charity, a masjid, a church or a person.') && ok; else setErr('f-to', '');
        const a = C.parseMoney($('f-amt').value);
        if (a.error) ok = setErr('f-amt', a.error) && ok; else setErr('f-amt', '');
        const rep = editId ? '' : $('f-rep').value, d = $('f-date').value;
        if (!C.isDate(d)) ok = setErr('f-date', 'Pick the date you gave it.') && ok;
        else if (!rep && d > t) ok = setErr('f-date', 'That date is in the future. Add the gift once it is given, or pick a choice under Repeat to plan it.') && ok;
        else setErr('f-date', '');
        let kind = $('f-kind').value;
        if (kind === OWN) {
            kind = C.tidy($('f-kind-own').value, 40);
            if (!kind) ok = setErr('f-kind-own', 'Type the kind of giving, or pick one from the list.') && ok; else setErr('f-kind-own', '');
        }
        if (!ok) { const first = document.querySelector('#add [aria-invalid="true"]'); if (first) first.focus(); return null; }
        return { to, amt: a.n, date: d, rep, kind, how: $('f-how').value, receipt: rc(),
            behalf: $('f-behalf-box').hidden ? '' : C.tidy($('f-behalf').value, 40), note: $('f-note-box').hidden ? '' : C.tidy($('f-note').value, 120) };
    }
    function saveForm() {
        const r = readForm(); if (!r) return;
        const after = () => { if (r.date <= t) viewY = C.yearOf(r.date, state.yearStart).y; resetForm(); fillLists(); };
        const common = { to: r.to, amt: r.amt, kind: r.kind, how: r.how, receipt: r.receipt, behalf: r.behalf, note: r.note };
        if (editId) {
            const id = editId;
            change(() => { const g = state.gifts.find(x => x.id === id); if (g) Object.assign(g, common, { date: r.date }); }, 'add-msg', 'Saved the gift of ' + money(r.amt) + ' to ' + r.to + '.', after);
        } else if (r.rep) {
            const plan = Object.assign({ id: newId('r'), start: r.date, freq: r.rep, n: 0, stopped: '' }, common);
            let text;
            if (r.date <= t) {
                plan.n = 1;
                text = 'Added ' + money(r.amt) + ' to ' + r.to + ' on ' + date(r.date) + '. ' + C.freqWords(plan) + ', it will ask you to confirm. Next: ' + date(C.nextOf(plan)) + '.';
            } else text = 'Set up a regular gift of ' + money(r.amt) + ' to ' + r.to + '. ' + C.freqWords(plan) + ', from ' + date(r.date) + '.';
            change(() => {
                state.plans.push(plan);
                if (plan.n) state.gifts.push(Object.assign({ id: newId('g'), date: r.date, plan: plan.id }, common));
            }, 'add-msg', text, after);
        } else {
            change(() => { state.gifts.push(Object.assign({ id: newId('g'), date: r.date, plan: '' }, common)); }, 'add-msg', 'Added ' + money(r.amt) + ' to ' + r.to + ' on ' + date(r.date) + '.', after);
        }
        $('f-to').focus({ preventScroll: true });
    }

    // ---------- regular gifts ----------
    function giveDue(plan, k, d) {
        state.gifts.push({ id: newId('g'), date: d, to: plan.to, amt: plan.amt, kind: plan.kind, how: plan.how, receipt: plan.receipt, behalf: plan.behalf, note: plan.note, plan: plan.id });
        plan.n = k + 1;
    }
    function renderDue() {
        const ul = $('due-list'); ul.textContent = '';
        let total = 0;
        const firsts = state.plans.filter(pl => !pl.stopped).map(pl => ({ pl, dues: C.duesOf(pl, t, 4), count: C.dueCount(pl, t) })).filter(x => x.count)
            .sort((a, b) => a.dues[0].date < b.dues[0].date ? -1 : 1);
        firsts.forEach(({ pl, dues, count }) => {
            total += count;
            const d = dues[0], li = el('li', 'due-i');
            const top = el('div', 'g-top'); top.append(el('p', 'g-n', pl.to), el('p', 'g-a', money(pl.amt)));
            li.append(top, p('g-s', C.freqWords(pl) + ' · due ' + date(d.date)));
            if (count > 1) li.appendChild(p('g-s', plural(count - 1, 'more is', 'more are') + ' due after this: ' + dues.slice(1).map(x => date(x.date, { noDay: true })).join(', ') + (count > dues.length ? ' and later' : '') + '.'));
            const b = el('div', 'g-b');
            b.append(btn('Given', 'primary small', () => change(() => giveDue(pl, d.k, d.date), 'due-msg', 'Added ' + money(pl.amt) + ' to ' + pl.to + ' on ' + date(d.date) + '.'), 'Given: ' + pl.to + ' ' + money(pl.amt) + ' due ' + date(d.date)),
                btn('Skip', 'secondary small', () => change(() => { pl.n = d.k + 1; }, 'due-msg', 'Skipped ' + pl.to + ' on ' + date(d.date) + '. Nothing was added.'), 'Skip: ' + pl.to + ' due ' + date(d.date)));
            li.appendChild(b);
            ul.appendChild(li);
        });
        $('due').hidden = !total;
        $('due-h').textContent = total > 1 ? plural(total, 'regular gift', 'regular gifts') + ' due' : 'Regular gift due';
        $('due-all').hidden = total < 2;
        $('due-all').textContent = 'Mark all ' + total + ' as given';
    }
    function renderPlans() {
        const box = $('plan-list'); box.textContent = '';
        const live = state.plans.filter(pl => !pl.stopped).sort((a, b) => C.nextOf(a) < C.nextOf(b) ? -1 : 1);
        $('plans').hidden = !live.length;
        live.forEach(pl => {
            const d = el('div', 'box');
            const top = el('div', 'g-top'); top.append(el('p', 'b-n', pl.to), el('p', 'g-a', money(pl.amt)));
            const nx = C.nextOf(pl);
            d.append(top, p('b-l', C.freqWords(pl) + ' · ' + pl.kind + ' · ' + C.HOW[pl.how]), p('b-l', (nx <= t ? 'Due now: ' : 'Next: ') + date(nx) + (pl.behalf ? ' · on behalf of ' + pl.behalf : '')));
            if (panel[pl.id] === 'amount') {
                const pn = el('div', 'panel in-list');
                const lab = el('label', null, 'New amount for the gifts still to come'); lab.htmlFor = 'pa-' + pl.id;
                const inp = el('input'); inp.type = 'text'; inp.id = 'pa-' + pl.id; inp.inputMode = 'decimal'; inp.maxLength = 20; inp.autocomplete = 'off'; inp.value = C.moneyInput(pl.amt);
                const er = p('err'); er.id = 'pa-' + pl.id + '-err'; er.setAttribute('role', 'alert'); inp.setAttribute('aria-describedby', er.id);
                const go = () => {
                    const r = C.parseMoney(inp.value);
                    if (r.error) { setErr(inp.id, r.error); inp.focus(); return; }
                    delete panel[pl.id];
                    change(() => { pl.amt = r.n; }, 'plans-msg', pl.to + ' is now ' + money(r.n) + '. Gifts already added keep their amount.');
                };
                inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
                inp.addEventListener('input', () => setErr(inp.id, ''));
                const rb = el('div', 'row-btns');
                rb.append(btn('Save amount', 'secondary', go), btn('Cancel', 'secondary', () => { delete panel[pl.id]; render(); }));
                pn.append(lab, inp, er, rb);
                d.appendChild(pn);
                setTimeout(() => { if (document.activeElement === document.body || !document.activeElement) inp.focus(); }, 0);
            } else {
                const b = el('div', 'g-b');
                b.append(btn('Change amount', 'secondary small', () => { panel = { [pl.id]: 'amount' }; render(); $('pa-' + pl.id).focus(); }, 'Change amount: ' + pl.to),
                    btn('Stop', 'secondary small danger-t', () => change(() => { pl.stopped = t; }, 'plans-msg', 'Stopped the regular gift to ' + pl.to + '. Gifts already added are kept.'), 'Stop the regular gift to ' + pl.to));
                d.appendChild(b);
            }
            box.appendChild(d);
        });
    }

    // ---------- the year ----------
    function tile(cls, label, big, note) {
        const d = el('div', 'tile ' + cls);
        d.append(p('t-l', label), p('t-big', big));
        if (note) d.appendChild(p('t-n', note));
        return d;
    }
    function lines(rows) {
        const ul = el('ul', 'lines');
        rows.forEach(([a, b, strong]) => { const li = el('li', strong ? 'strong' : null); li.append(el('span', null, a), el('span', null, b)); ul.appendChild(li); });
        return ul;
    }
    function block(title, kids) { const d = el('div', 'block'); d.appendChild(el('h3', null, title)); kids.forEach(k => d.appendChild(k)); return d; }
    function renderSum() {
        const yr = C.yearFrom(viewY, state.yearStart), cy = curYear(), isNow = viewY === cy;
        const s = C.yearStats(state, yr.from, yr.to), body = $('sum-body'); body.textContent = '';
        $('sum-h').textContent = 'Year ' + yr.label;
        $('y-range').textContent = C.rangeWords(yr.from, yr.to) + (isNow ? ' · this year' : '');
        $('y-next').disabled = viewY >= cy;
        $('y-prev').disabled = viewY <= 2000;
        $('y-now').hidden = isNow;
        const tiles = el('div', 'tiles');
        tiles.appendChild(tile('main', isNow ? 'Given this year' : 'Given in ' + yr.label, money(s.total), s.count ? plural(s.count, 'gift', 'gifts') + ' to ' + plural(s.causeList.length, 'cause', 'causes') : 'No gifts added for this year.'));
        const g = C.goalStats(state.goal, s.total, yr, t);
        if (g && !g.future) {
            const big = g.reached ? 'Goal reached' : money(g.left) + ' still to give';
            let note = g.pct + '% of ' + money(g.goal) + ' given.';
            if (g.reached && g.over) note += ' ' + money(g.over) + ' more than the goal.';
            if (!g.reached && g.monthsLeft) note += ' About ' + money(g.perMonth) + ' a month for the ' + plural(g.monthsLeft, 'month', 'months') + ' left (' + (g.monthsLeft > 1 ? C.shortMonth(C.ym(t)) + ' to ' + C.shortMonth(C.ym(yr.to)) : C.shortMonth(C.ym(t))) + ').';
            if (!g.reached && g.past) note += ' Short by ' + money(g.left) + '.';
            const tl = tile('goal', 'Yearly goal', big, note);
            const bar = el('div', 'gbar' + (g.reached ? ' done' : '')); const sp = el('span'); sp.style.width = g.pct + '%'; bar.appendChild(sp);
            bar.setAttribute('role', 'img'); bar.setAttribute('aria-label', g.pct + '% of the yearly goal given');
            tl.insertBefore(bar, tl.lastChild);
            tiles.appendChild(tl);
        }
        body.appendChild(tiles);
        if (!s.count) return;
        if (s.behalfList.length) body.appendChild(block('Your own and on behalf of others', [lines([['Your own giving', money(s.own), true]].concat(s.behalfList.map(b => ['On behalf of ' + b.name, money(b.total)])))]));
        const R = s.receipts, rk = [lines([['Receipt kept: ' + plural(R.kept.n, 'gift', 'gifts'), money(R.kept.amt)], ['Receipt still to get: ' + plural(R.todo.n, 'gift', 'gifts'), money(R.todo.amt), R.todo.n > 0], ['No receipt needed: ' + plural(R.none.n, 'gift', 'gifts'), money(R.none.amt)]])];
        if (R.todo.n) {
            rk.push(p('t-n', 'Ask for these receipts:'));
            const ol = el('ul', 'todo-list');
            R.todo.list.forEach(x => ol.appendChild(el('li', null, x.to + ': ' + money(x.amt) + ' on ' + date(x.date, { noDay: true }))));
            rk.push(ol);
        }
        body.appendChild(block('Receipts for your tax form', rk));
        body.appendChild(block('By kind', [lines(s.kindList.map(k => [k.name, money(k.total)]))]));
        body.appendChild(block('By cause', [lines(s.causeList.slice(0, 15).map(c => [c.name + (c.count > 1 ? ' (' + c.count + ' gifts)' : ''), money(c.total)]))].concat(s.causeList.length > 15 ? [p('t-n', 'And ' + plural(s.causeList.length - 15, 'more cause', 'more causes') + '. All are in the saved list.')] : [])));
        if (s.howList.length > 1) body.appendChild(block('How you paid', [lines(s.howList.map(h => [h.name, money(h.total)]))]));
        const det = el('details', 'months'); det.appendChild(el('summary', null, 'Month by month'));
        const ul = el('ul', 'bars'), max = Math.max(1, ...s.months.map(m => m.total));
        s.months.forEach(m => {
            const li = el('li', m.key === C.ym(t) ? 'cur-m' : null), bar = el('p', 'bar'), sp = el('span');
            sp.style.width = (m.total ? Math.max(2, Math.round(m.total * 100 / max)) : 0) + '%'; bar.appendChild(sp);
            li.append(el('span', null, C.shortMonth(m.key) + ' ' + m.key.slice(2, 4)), bar, el('span', 'bv', money(m.total)));
            ul.appendChild(li);
        });
        det.appendChild(ul); body.appendChild(det);
        const b = el('div', 'sum-btns');
        b.append(btn('Copy summary', 'secondary', () => copyText(C.summaryText(state, yr, t, LOC), 'sum-msg')),
            btn('Email summary', 'secondary', () => {
                let text = C.summaryText(state, yr, t, LOC);
                if (text.length > 1800) text = text.slice(0, 1800).replace(/\n[^\n]*$/, '') + '\n... (the full list is in the saved file)';
                const a = el('a'); a.href = 'mailto:?subject=' + encodeURIComponent('My giving for ' + yr.label) + '&body=' + encodeURIComponent(text);
                document.body.appendChild(a); a.click(); a.remove();
            }),
            btn('Save list for tax form', 'secondary', () => {
                download('giving-' + yr.label + '.csv', 'text/csv', '﻿' + C.csv(state, yr.from, yr.to));
                flash = { where: 'sum-msg', text: 'Saved the list of ' + plural(s.count, 'gift', 'gifts') + ' for ' + yr.label + '. It opens in Excel or Google Sheets.' }; render();
            }));
        body.appendChild(b);
    }

    // ---------- gifts ----------
    function renderGifts() {
        const yr = C.yearFrom(viewY, state.yearStart);
        const all = C.inRange(state, yr.from, yr.to).sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
        $('gifts-h').textContent = 'Gifts in ' + yr.label + (all.length ? ' (' + all.length + ')' : '');
        $('find-box').hidden = all.length <= 5 && !find;
        const q = C.norm(find);
        const list = q ? all.filter(g => [g.to, g.kind, g.note, g.behalf].some(x => C.norm(x).includes(q))) : all;
        const ul = $('g-list'); ul.textContent = '';
        if (!list.length) ul.appendChild(el('li', 'empty', q ? 'No gift in ' + yr.label + ' matches "' + find.trim() + '".' : 'No gifts in ' + yr.label + ' yet.'));
        list.slice(0, showN).forEach(g => {
            const li = el('li', 'gift' + (g.receipt === 'todo' ? ' rc-todo' : ''));
            const top = el('div', 'g-top'); top.append(el('p', 'g-n', g.to), el('p', 'g-a', money(g.amt)));
            li.append(top, p('g-s', date(g.date) + ' · ' + g.kind + ' · ' + C.HOW[g.how]));
            const tags = el('div', 'g-tags');
            tags.appendChild(el('span', 'tag' + (g.receipt === 'todo' ? ' warn' : g.receipt === 'kept' ? ' ok' : ''), C.RECEIPT[g.receipt]));
            if (g.behalf) tags.appendChild(el('span', 'tag', 'On behalf of ' + g.behalf));
            if (g.plan) tags.appendChild(el('span', 'tag', 'Regular gift'));
            li.appendChild(tags);
            if (g.note) li.appendChild(p('g-s', g.note));
            const b = el('div', 'g-b');
            if (g.receipt === 'todo') b.appendChild(btn('Got the receipt', 'primary small', () => change(() => { g.receipt = 'kept'; }, 'gifts-msg', 'Marked the receipt from ' + g.to + ' as kept.'), 'Got the receipt for ' + g.to + ' ' + money(g.amt) + ' on ' + date(g.date)));
            b.append(btn('Edit', 'secondary small', () => startEdit(g.id), 'Edit ' + g.to + ' ' + money(g.amt) + ' on ' + date(g.date)),
                btn('Delete', 'secondary small danger-t', () => { if (editId === g.id) resetForm(); change(() => { state.gifts = state.gifts.filter(x => x.id !== g.id); }, 'gifts-msg', 'Deleted ' + money(g.amt) + ' to ' + g.to + ' on ' + date(g.date) + '.'); }, 'Delete ' + g.to + ' ' + money(g.amt) + ' on ' + date(g.date)));
            li.appendChild(b);
            ul.appendChild(li);
        });
        $('g-more').hidden = list.length <= showN;
        $('g-more').textContent = 'Show more (' + (list.length - showN) + ' left)';
    }

    // ---------- promises ----------
    function renderPledges() {
        const box = $('pl-list'); box.textContent = '';
        state.pledges.slice().sort((a, b) => a.from < b.from ? 1 : -1).forEach(pl => {
            const s = C.pledgeStats(state, pl), d = el('div', 'box' + (s.done ? ' done' : ''));
            const top = el('div', 'g-top'); top.append(el('p', 'b-n', pl.to), el('p', 'g-a', s.done ? 'Fully paid' : money(s.left) + ' left'));
            d.append(top, p('b-l', 'Promised ' + money(pl.amt) + ' on ' + date(pl.from, { year: true })),
                p('b-l', 'Paid ' + money(s.paid) + (s.count ? ' in ' + plural(s.count, 'gift', 'gifts') + ', last on ' + date(s.last, { noDay: true }) : '') + (s.over ? ' (' + money(s.over) + ' more than promised)' : '')));
            const bar = el('div', 'plbar' + (s.done ? ' done' : '')); const sp = el('span'); sp.style.width = s.pct + '%'; bar.appendChild(sp);
            bar.setAttribute('role', 'img'); bar.setAttribute('aria-label', s.pct + '% of the promise paid');
            d.appendChild(bar);
            const b = el('div', 'g-b');
            b.appendChild(btn('Remove', 'secondary small danger-t', () => change(() => { state.pledges = state.pledges.filter(x => x.id !== pl.id); }, 'pl-msg', 'Removed the promise to ' + pl.to + '. The gifts are kept.'), 'Remove the promise to ' + pl.to));
            d.appendChild(b);
            box.appendChild(d);
        });
    }
    function addPledge() {
        let ok = true;
        const to = C.tidy($('pl-to').value, 60);
        if (!to) ok = setErr('pl-to', 'Type who you promised, such as Masjid Al-Noor.') && ok; else setErr('pl-to', '');
        const a = C.parseMoney($('pl-amt').value);
        if (a.error) ok = setErr('pl-amt', a.error) && ok; else setErr('pl-amt', '');
        if (!ok) { const f = document.querySelector('#pledges [aria-invalid="true"]'); if (f) f.focus(); return; }
        const from = C.isDate($('pl-from').value) ? $('pl-from').value : t;
        change(() => { state.pledges.push({ id: newId('p'), to, amt: a.n, from }); }, 'pl-msg', 'Added your promise of ' + money(a.n) + ' to ' + to + '. Gifts to ' + to + ' from ' + date(from) + ' count towards it.');
        $('pl-to').value = ''; $('pl-amt').value = ''; $('pl-from').value = t;
    }

    // ---------- settings ----------
    function fillSettings() {
        const names = Object.assign({}, CUR_NAMES);
        if (!(state.cur in names)) names[state.cur] = state.cur;
        fillSelect($('cur'), Object.keys(names).map(k => [k, names[k]]), state.cur);
        fillSelect($('yr'), Object.keys(C.YEARS).map(k => [k, C.YEARS[k]]), state.yearStart);
    }
    function renderGoal() {
        $('goal-now').textContent = state.goal ? 'Your goal: give ' + money(state.goal) + ' each year.' : '';
        const editing = !$('goal-box').hidden;
        $('goal-open').hidden = editing;
        $('goal-open').textContent = state.goal ? 'Change the goal' : '+ Set a yearly giving goal (optional)';
        $('goal-del').hidden = !state.goal || editing;
    }

    // ---------- the page ----------
    function render() {
        t = C.today(new Date());
        const cy = curYear();
        if (viewY == null || viewY > cy) viewY = cy;
        const any = state.gifts.length > 0;
        $('intro').hidden = any || state.plans.length > 0;
        $('sum').hidden = !any;
        $('gifts').hidden = !any;
        if (any) { renderSum(); renderGifts(); }
        renderDue(); renderPlans(); renderPledges(); renderGoal(); updateForm();
        $('add-hint').hidden = any || !!editId;
        $('restore-first').hidden = any || state.plans.length > 0 || state.pledges.length > 0;
        $('del-all').disabled = !any && !state.plans.length && !state.pledges.length && !state.goal;
        clearMsgs();
        if (loadNote) showMsg($('top-msg'), loadNote, false, true);
        if (flash) {
            let box = $(flash.where);
            if (!box || box.closest('[hidden]')) box = $('top-msg');
            showMsg(box, flash.text, flash.undo, flash.bad);
            flash = null;
        }
    }

    // ---------- start ----------
    load();
    if (!canSave) $('store-warn').hidden = false;
    fillSettings();
    fillSelect($('f-how'), Object.keys(C.HOW).map(k => [k, C.HOW[k]]), 'cash');
    fillLists();
    $('f-to').addEventListener('input', () => { setErr('f-to', ''); applyDefaults(); });
    $('f-kind').addEventListener('change', () => { const own = $('f-kind').value === OWN; $('f-kind-box').hidden = !own; setErr('f-kind-own', ''); if (own) $('f-kind-own').focus(); });
    ['f-amt', 'f-kind-own'].forEach(id => $(id).addEventListener('input', () => setErr(id, '')));
    $('f-date').addEventListener('change', () => { setErr('f-date', ''); updateForm(); });
    $('f-date').addEventListener('input', () => { setErr('f-date', ''); updateForm(); });
    $('f-rep').addEventListener('change', () => { setErr('f-date', ''); updateForm(); });
    $('f-behalf-open').addEventListener('click', () => { openOpt('behalf', true); $('f-behalf').focus(); });
    $('f-note-open').addEventListener('click', () => { openOpt('note', true); $('f-note').focus(); });
    $('f-save').addEventListener('click', saveForm);
    $('f-cancel').addEventListener('click', () => { resetForm(); render(); });
    $('add').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'radio') { e.preventDefault(); saveForm(); } });
    $('y-prev').addEventListener('click', () => { viewY--; showN = PAGE; render(); });
    $('y-next').addEventListener('click', () => { if (viewY < curYear()) viewY++; showN = PAGE; render(); });
    $('y-now').addEventListener('click', () => { viewY = curYear(); showN = PAGE; render(); $('y-prev').focus(); });
    $('find').addEventListener('input', () => { find = $('find').value; showN = PAGE; renderGifts(); });
    $('g-more').addEventListener('click', () => { showN += PAGE; renderGifts(); });
    $('due-all').addEventListener('click', () => {
        let n = 0, sum = 0;
        const before = JSON.stringify(state);
        state.plans.forEach(pl => C.duesOf(pl, t, 1000).forEach(d => { giveDue(pl, d.k, d.date); n++; sum += pl.amt; }));
        save(); undoSnap = before;
        flash = { where: 'top-msg', text: 'Added ' + plural(n, 'regular gift', 'regular gifts') + ', ' + money(sum) + ' in all.', undo: true }; render();
    });
    $('pl-from').value = t;
    $('pl-add').addEventListener('click', addPledge);
    ['pl-to', 'pl-amt'].forEach(id => { $(id).addEventListener('input', () => setErr(id, '')); $(id).addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addPledge(); } }); });

    $('cur').addEventListener('change', () => { const v = $('cur').value; state.cur = v; save(); flash = { where: 'tools-msg', text: v ? 'Amounts now show ' + v + '.' : 'Amounts now show plain numbers.' }; render(); });
    $('yr').addEventListener('change', () => {
        const v = $('yr').value;
        change(() => { state.yearStart = v; }, 'tools-msg', 'Your year now runs ' + C.YEARS[v].replace(/ \(.*\)$/, '') + '.', () => { viewY = null; });
    });
    const saveGoal = () => {
        const r = C.parseMoney($('goal').value, { blank: 'Type how much you want to give each year, such as 200000.' });
        if (r.error) { setErr('goal', r.error); $('goal').focus(); return; }
        setErr('goal', ''); $('goal-box').hidden = true;
        change(() => { state.goal = r.n; }, 'tools-msg', 'Your yearly goal is ' + money(r.n) + '.');
    };
    $('goal-open').addEventListener('click', () => { $('goal-box').hidden = false; $('goal').value = state.goal ? C.moneyInput(state.goal) : ''; setErr('goal', ''); renderGoal(); $('goal').focus(); });
    $('goal-save').addEventListener('click', saveGoal);
    $('goal-cancel').addEventListener('click', () => { $('goal-box').hidden = true; setErr('goal', ''); renderGoal(); $('goal-open').focus(); });
    $('goal').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveGoal(); } });
    $('goal').addEventListener('input', () => setErr('goal', ''));
    $('goal-del').addEventListener('click', () => change(() => { state.goal = 0; }, 'tools-msg', 'Removed the yearly goal.'));
    $('backup').addEventListener('click', () => {
        if (!state.gifts.length && !state.plans.length && !state.pledges.length) { flash = { where: 'tools-msg', text: 'Nothing to back up yet.' }; render(); return; }
        download('charity-donation-log-backup-' + t + '.json', 'application/json', JSON.stringify(Object.assign({ app: SLUG }, state), null, 1));
        flash = { where: 'tools-msg', text: 'Saved the backup file. Keep it somewhere safe, such as your email or cloud drive.' }; render();
    });
    const pick = () => { $('restore-file').value = ''; $('restore-file').click(); };
    $('restore').addEventListener('click', pick);
    $('restore-first').addEventListener('click', pick);
    $('restore-file').addEventListener('change', () => {
        const f = $('restore-file').files[0]; if (!f) return;
        const where = state.gifts.length ? 'tools-msg' : 'add-msg';
        if (f.size > 8000000) { flash = { where, text: 'That file is too big to be a backup from this app.', bad: true }; render(); return; }
        const r = new FileReader();
        r.onload = () => {
            let s = null; try { s = C.cleanState(JSON.parse(r.result)); } catch (e) { s = null; }
            if (!s || (!s.gifts.length && !s.plans.length && !s.pledges.length)) { flash = { where, text: 'That file is not a backup from this app, or it has no gifts in it.', bad: true }; render(); return; }
            loadNote = ''; panel = {};
            const last = s.gifts.reduce((a, x) => x.date > a ? x.date : a, '');
            change(() => { state = s; }, 'tools-msg', 'Restored ' + plural(s.gifts.length, 'gift', 'gifts') + (s.plans.length ? ', ' + plural(s.plans.length, 'regular gift', 'regular gifts') : '') + (s.pledges.length ? ' and ' + plural(s.pledges.length, 'promise', 'promises') : '') + '.',
                () => { viewY = last ? C.yearOf(last, state.yearStart).y : null; fillSettings(); fillLists(); resetForm(); });
        };
        r.onerror = () => { flash = { where, text: 'Could not read that file.', bad: true }; render(); };
        r.readAsText(f);
    });
    $('del-all').addEventListener('click', () => {
        panel = {}; loadNote = ''; find = ''; $('find').value = '';
        change(() => { state = Object.assign(C.emptyState(), { cur: state.cur, yearStart: state.yearStart }); }, 'tools-msg', 'Deleted everything.', () => { resetForm(); fillLists(); viewY = null; });
    });
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && C.today(new Date()) !== t && !editId && !Object.keys(panel).length) { const old = t; render(); if ($('f-date').value === old) $('f-date').value = t; if ($('pl-from').value === old) $('pl-from').value = t; render(); }
    });
    resetForm();
    render();
    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
