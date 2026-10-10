(function () {
    const C = DebtCore, $ = id => document.getElementById(id), KEY = 'loan-and-credit-card-payoff-planner.state', MAX_DEBTS = 10, MAX_ONEOFFS = 12;
    const ORDERS = ['avalanche', 'snowball', 'listed'];
    const ORDER_TEXT = { avalanche: 'Highest interest first', snowball: 'Smallest balance first', listed: 'In the order listed' };
    const uid = () => Math.random().toString(36).slice(2, 9);
    const blank = () => ({ id: uid(), name: '', bal: '', rate: '', pay: '', showName: false });
    const start = C.nextMonth(new Date());      // payment 1 is next month

    // ---- saved state (storage may be blocked or corrupt: start fresh). Every value is checked before use.
    const str = (v, n) => typeof v === 'string' ? v.slice(0, n) : '';
    function cleanDebt(x) {
        if (!x || typeof x !== 'object') return null;
        const d = blank();
        d.name = str(x.name, 40); d.bal = str(x.bal, 20); d.rate = str(x.rate, 12); d.pay = str(x.pay, 20);
        d.showName = !!x.showName || !!d.name;
        return d;
    }
    function cleanState(o) {
        const out = { debts: [blank()], extra: '', order: 'avalanche', oneoffs: [], cur: '' };
        if (!o || typeof o !== 'object') return out;
        const debts = Array.isArray(o.debts) ? o.debts.map(cleanDebt).filter(Boolean).slice(0, MAX_DEBTS) : [];
        if (debts.length) out.debts = debts;
        out.extra = str(o.extra, 20);
        if (ORDERS.includes(o.order)) out.order = o.order;
        if (Array.isArray(o.oneoffs)) out.oneoffs = o.oneoffs.filter(x => x && typeof x === 'object' && /^\d{4}-\d{2}$/.test(x.month) && C.indexOfKey(start, x.month) !== null)
            .slice(0, MAX_ONEOFFS).map(x => ({ id: uid(), amt: str(x.amt, 20), month: x.month }));
        if ([...$('cur').options].some(op => op.value === o.cur)) out.cur = o.cur;
        return out;
    }
    let s;
    try { s = cleanState(JSON.parse(localStorage.getItem(KEY))); } catch (e) { s = cleanState(null); }
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* storage blocked: works for this visit */ } };
    const money = c => C.fmt(c, s.cur);
    const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
    const label = (d, i) => d.name.trim() || 'Debt ' + (i + 1);
    const isEmpty = () => s.debts.length === 1 && !s.debts[0].bal.trim() && !s.debts[0].rate.trim() && !s.debts[0].pay.trim() && !s.debts[0].name.trim() && !s.extra.trim() && !s.oneoffs.length;
    const when = k => C.monthName(start, k, true);

    // ---- building the boxes (only when debts are added, removed or replaced, so typing never loses focus)
    function field(id, text, input, hint) {
        const w = el('div', 'field');
        const l = el('label', '', text); l.htmlFor = id; w.append(l, input);
        if (hint) { const h = el('p', 'hint', hint); h.id = id + '-hint'; w.append(h); }
        const e = el('p', 'ferr'); e.id = id + '-err'; w.append(e);
        const tgt = input.matches('input, select') ? input : input.querySelector('input');
        tgt.setAttribute('aria-describedby', (hint ? id + '-hint ' : '') + id + '-err');
        return w;
    }
    function textInput(id, val, opts) {
        const i = el('input'); i.type = 'text'; i.id = id; i.value = val; i.autocomplete = 'off';
        Object.assign(i, opts || {}); return i;
    }
    function moneyBox(input) { const w = el('div', 'money'), sym = el('span', 'sym', s.cur); sym.setAttribute('aria-hidden', 'true'); w.append(sym, input); return w; }

    function buildDebts() {
        const box = $('debts'); box.textContent = '';
        s.debts.forEach((d, i) => box.append(debtBox(d, i)));
        $('add-debt').hidden = s.debts.length >= MAX_DEBTS;
        $('intro').hidden = !isEmpty();
    }
    function debtBox(d, i) {
        const p = 'd' + i + '-', sec = el('section', 'debt c' + (i % 4));
        sec.setAttribute('aria-labelledby', p + 'title');
        const head = el('div', 'debt-head'), h = el('h2', '', label(d, i)); h.id = p + 'title'; head.append(h);
        if (s.debts.length > 1) { const rm = el('button', 'remove', 'Remove'); rm.type = 'button'; rm.setAttribute('aria-label', 'Remove ' + label(d, i)); rm.onclick = () => removeDebt(i); head.append(rm); }
        sec.append(head);
        const upd = (k, v) => { d[k] = v; save(); if (k === 'name') h.textContent = label(d, i); update(); };

        const nameIn = textInput(p + 'name', d.name, { maxLength: 40, placeholder: 'e.g. Credit card' });
        nameIn.oninput = () => upd('name', nameIn.value);
        const nameF = field(p + 'name', 'Name (optional)', nameIn); nameF.hidden = !d.showName;
        const nameBtn = el('button', 'link', '+ Add a name (optional)'); nameBtn.type = 'button'; nameBtn.hidden = d.showName;
        nameBtn.onclick = () => { d.showName = true; save(); nameF.hidden = false; nameBtn.hidden = true; nameIn.focus(); };

        const bal = textInput(p + 'bal', d.bal, { inputMode: 'decimal', maxLength: 20, placeholder: 'e.g. 3,200' });
        bal.oninput = () => upd('bal', bal.value);
        const rate = textInput(p + 'rate', d.rate, { inputMode: 'decimal', maxLength: 12, placeholder: 'e.g. 19.9' });
        rate.oninput = () => upd('rate', rate.value);
        const rateBox = el('div', 'money rate'); const pct = el('span', 'pct', '% a year'); pct.setAttribute('aria-hidden', 'true'); rateBox.append(rate, pct);
        const row = el('div', 'two');
        row.append(field(p + 'bal', 'Balance owed', moneyBox(bal)), field(p + 'rate', 'Interest rate', rateBox, 'The APR. Type 0 if none.'));
        const pay = textInput(p + 'pay', d.pay, { inputMode: 'decimal', maxLength: 20, placeholder: 'e.g. 100' });
        pay.oninput = () => upd('pay', pay.value);
        const payF = field(p + 'pay', 'Monthly payment', moneyBox(pay), 'What you pay on this debt each month (at least the minimum).');
        const warn = el('p', 'warn'); warn.id = p + 'warn'; warn.setAttribute('role', 'note');
        const links = el('div', 'links'); links.append(nameBtn);
        sec.append(nameF, row, payF, warn, links);
        return sec;
    }

    function buildOneoffs() {
        const box = $('oneoffs'); box.textContent = '';
        s.oneoffs.forEach((x, i) => {
            const p = 'o' + i + '-', sec = el('div', 'oneoff');
            const head = el('div', 'oneoff-head'); head.append(el('h3', '', 'One-off payment' + (s.oneoffs.length > 1 ? ' ' + (i + 1) : '')));
            const rm = el('button', 'remove', 'Remove'); rm.type = 'button'; rm.setAttribute('aria-label', 'Remove one-off payment ' + (i + 1)); rm.onclick = () => removeOneoff(i); head.append(rm);
            const amt = textInput(p + 'amt', x.amt, { inputMode: 'decimal', maxLength: 20, placeholder: 'e.g. 1,000' });
            amt.oninput = () => { x.amt = amt.value; save(); update(); };
            const sel = el('select'); sel.id = p + 'month';
            const at = C.indexOfKey(start, x.month);
            if (at < 1) { const o = el('option', '', C.monthName(start, at, true) + ' (in the past)'); o.value = x.month; sel.append(o); }
            for (let k = 1; k <= 120; k++) { const o = el('option', '', C.monthName(start, k, true)); o.value = C.monthKey(start, k); sel.append(o); }
            if (at > 120) { const o = el('option', '', C.monthName(start, at, true)); o.value = x.month; sel.append(o); }
            sel.value = x.month;
            sel.onchange = () => { x.month = sel.value; save(); update(); };
            const row = el('div', 'two'); row.append(field(p + 'amt', 'Amount', moneyBox(amt)), field(p + 'month', 'Paid in', sel));
            sec.append(head, row); box.append(sec);
        });
        $('add-oneoff').hidden = s.oneoffs.length >= MAX_ONEOFFS;
        $('add-oneoff').textContent = s.oneoffs.length ? '+ Add another one-off payment' : '+ Add a one-off payment (optional)';
        $('oneoff-hint').hidden = !s.oneoffs.length;
    }

    // ---- reading everything typed
    function read() {
        const all = s.debts.map((d, i) => ({ i, name: label(d, i), r: C.readDebt(d) }));
        const ex = s.extra.trim() ? C.parseMoney(s.extra) : { cents: 0 };
        const extraErr = ex.err ? { negative: 'The extra cannot be negative.', nan: 'Type a number, for example 100.', big: 'That is too big. The most is 100,000,000.' }[ex.err] : '';
        const offs = s.oneoffs.map((x, i) => { const a = x.amt.trim() ? C.parseMoney(x.amt) : { err: 'blank' }; return { i, at: C.indexOfKey(start, x.month), cents: a.cents, err: a.err, month: x.month }; });
        return { all, extra: ex.cents || 0, extraErr, offs };
    }

    // ---- results
    let text = '', lastPlan = null, monthsOpen = false;
    function update() {
        const R = read();
        // messages under the fields and in each debt box
        R.all.forEach(({ i, r }) => {
            ['bal', 'rate', 'pay'].forEach(f => {
                const msg = r.errs[f] && r.errs[f] !== 'blank' ? r.errs[f] : '';
                $('d' + i + '-' + f + '-err').textContent = msg; $('d' + i + '-' + f).setAttribute('aria-invalid', msg ? 'true' : 'false');
            });
            const w = $('d' + i + '-warn'), d = r.debt;
            w.textContent = r.status === 'paid' ? 'A balance of 0 means this debt is already paid off. It is left out of the plan.'
                : d && d.rate && d.min <= d.interest1 ? (d.min < d.interest1 ? 'The monthly payment is less than the ' + money(d.interest1) + ' interest added each month, so on its own this debt grows.'
                    : 'The monthly payment only covers the ' + money(d.interest1) + ' interest added each month, so on its own this debt never goes down.') + ' Pay more than ' + money(d.interest1) + ' a month.' : '';
        });
        $('extra-err').textContent = R.extraErr; $('extra').setAttribute('aria-invalid', R.extraErr ? 'true' : 'false');
        R.offs.forEach(o => { const msg = o.err && o.err !== 'blank' ? { negative: 'The amount cannot be negative.', nan: 'Type a number, for example 1,000.', big: 'That is too big. The most is 100,000,000.' }[o.err] : ''; $('o' + o.i + '-amt-err').textContent = msg; $('o' + o.i + '-amt').setAttribute('aria-invalid', msg ? 'true' : 'false'); });
        document.querySelectorAll('.money .sym').forEach(x => { x.textContent = s.cur; });
        $('intro').hidden = !isEmpty();
        const ok = R.all.filter(x => x.r.status === 'ok');
        $('order-box').hidden = ok.length < 2;
        chips(ok.reduce((t, x) => t + x.r.debt.min, 0));

        const out = $('out'); out.textContent = ''; lastPlan = null;
        const L = render(R, ok, out);
        text = L.join('\n');
        $('mail').href = 'mailto:?subject=' + encodeURIComponent('My debt payoff plan') + '&body=' + encodeURIComponent(text);
    }

    // amounts that make sense for these payments: about 10%, 25%, 50% and 100% of what is paid each month, rounded to a nice number
    function steps(budget) {
        if (!budget) return [5000, 10000, 20000, 50000];
        const nice = c => { const x = c / 100, p = Math.pow(10, Math.floor(Math.log10(x))); const best = [1, 2, 2.5, 5, 10].map(f => f * p).reduce((a, b) => Math.abs(b - x) < Math.abs(a - x) ? b : a); return Math.max(100, Math.round(best * 100)); };
        return [...new Set([0.1, 0.25, 0.5, 1].map(f => nice(budget * f)))];
    }
    function chips(budget) {
        const box = $('extra-chips'), want = steps(budget).map(String).join();
        if (box.dataset.v !== want) {
            box.dataset.v = want; box.textContent = '';
            steps(budget).forEach(c => { const b = el('button', 'chip', '+' + C.fmt(c, '').replace(/\.00$/, '')); b.type = 'button'; b.dataset.c = c; b.setAttribute('aria-label', 'Extra ' + C.fmt(c, '').replace(/\.00$/, '') + ' a month');
                b.onclick = () => { const v = C.fmt(c, '').replace(/\.00$/, ''); $('extra').value = v; s.extra = v; save(); update(); }; box.append(b); });
        }
        const cur = C.parseMoney(s.extra).cents;
        box.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.c) === cur)));
    }

    function render(R, ok, out) {
        const L = [], put = (e, t) => { out.append(e); if (t != null) L.push(t); return e; };
        const waitText = () => {
            const bad = R.all.filter(x => x.r.status === 'bad');
            if (bad.length) return 'Check the box marked in red in ' + bad.map(x => x.name).join(' and ') + ' to see your plan.';
            if (R.all.every(x => x.r.status === 'paid')) return 'Every balance is 0, so there is nothing to pay off. Well done!';
            return 'Type the balance, interest rate and monthly payment of a debt to see when you will be debt-free.';
        };
        if (!ok.length || R.extraErr || R.offs.some(o => o.err && o.err !== 'blank')) {
            const t = !ok.length ? waitText() : R.extraErr ? 'Check Extra each month, marked in red, to see your plan.' : 'Check the one-off payment marked in red to see your plan.';
            put(el('p', 'wait', t), t); $('res-h').textContent = 'When you will be debt-free';
            return L;
        }
        const debts = ok.map(x => x.r.debt), names = ok.map(x => x.name), cls = ok.map(x => 'c' + (x.i % 4));
        const oneoffs = R.offs.filter(o => !o.err && o.at >= 1 && o.cents > 0).map(o => ({ at: o.at, cents: o.cents }));
        const opts = { extra: R.extra, order: s.order, oneoffs };
        const plan = C.simulate(debts, opts); lastPlan = { plan, names, cls };
        const owedNow = debts.reduce((t, d) => t + d.bal, 0), interestNow = debts.reduce((t, d) => t + d.interest1, 0);
        $('res-h').textContent = plan.never ? 'Your plan' : 'When you will be debt-free';

        // headline
        const big = el('div', 'big');
        if (plan.never) {
            big.append(el('p', 'k', 'With these payments'), el('p', 'when never', 'Your debt is never paid off'));
            const t = plan.budget <= interestNow ? 'You pay ' + money(plan.budget) + ' a month, but ' + money(interestNow) + ' of interest is added this month, so what you owe keeps growing.'
                : 'It would take more than 100 years at ' + money(plan.budget) + ' a month.';
            big.append(el('p', '', t));
            put(big); L.push('With these payments your debt is never paid off. ' + t);
        } else {
            big.append(el('p', 'k', 'Debt-free in'), el('p', 'when', when(plan.months)));
            const t = 'In ' + C.span(plan.months) + ' (' + plan.months + (plan.months === 1 ? ' payment' : ' payments') + '), starting with your ' + when(1) + ' payment.';
            big.append(el('p', '', t));
            const st = el('dl', 'stats');
            [['Total interest', money(plan.interest)], ['Total you pay', money(plan.paid)], ['You pay each month', money(plan.budget)], ['You owe now', money(owedNow)]]
                .forEach(([k, v]) => { const d = el('div'); d.append(el('dt', '', k), el('dd', '', v)); st.append(d); });
            big.append(st); put(big);
            L.push('Debt-free in ' + when(plan.months) + '. ' + t, 'Total interest: ' + money(plan.interest) + '. Total you pay: ' + money(plan.paid) + '. You pay ' + money(plan.budget) + ' a month. You owe ' + money(owedNow) + ' now.');
        }

        // this month
        put(el('h3', '', 'This month (' + when(1) + '), pay'), '');
        L.push('This month (' + when(1) + '), pay:');
        const ul = put(el('ul', 'pay-list'));
        const first = plan.rows[0];
        debts.forEach((d, k) => {
            const li = el('li', cls[k]), nm = el('span', 'nm', names[k]), amt = plan.first[k], more = amt - Math.min(d.min, amt);
            const bits = [];
            if (more > 0) bits.push(money(d.min) + ' payment + ' + money(more) + ' extra');
            if (first && first.done.includes(k)) bits.push('Paid off with this payment');
            if (bits.length) nm.append(el('small', '', bits.join('. ')));
            li.append(nm, el('span', 'amt', money(amt))); ul.append(li);
            L.push('- ' + names[k] + ': ' + money(amt) + (bits.length ? ' (' + bits.join('. ') + ')' : ''));
        });
        if (oneoffs.some(o => o.at === 1)) { const t = 'This includes your one-off payment this month.'; put(el('p', 'note muted', t), t); }

        // payments that do not cover interest
        debts.forEach((d, k) => {
            if (!d.rate || d.min > d.interest1) return;
            const fixed = !plan.never && plan.per[k].payoff;
            const t = names[k] + ': the monthly payment of ' + money(d.min) + (d.min < d.interest1 ? ' is less than' : ' only covers') + ' the ' + money(d.interest1) + ' interest added each month. ' +
                (fixed ? 'The plan still pays it off by moving extra money to it.' : 'Pay more than ' + money(d.interest1) + ' a month on it.');
            put(el('p', 'note bad', t), t);
        });

        // order and payoff dates
        if (debts.length > 1 && !plan.never) {
            put(el('h3', '', 'When each debt is paid off'), ''); L.push('When each debt is paid off (' + ORDER_TEXT[s.order].toLowerCase() + '):');
            const ol = put(el('ol', 'order-list'));
            debts.map((d, k) => k).sort((a, b) => plan.per[a].payoff - plan.per[b].payoff || a - b).forEach((k, n) => {
                const li = el('li', cls[k]), nm = el('span', 'nm', (n + 1) + '. ' + names[k]);
                nm.append(el('small', '', 'Paid off ' + when(plan.per[k].payoff) + ' (' + C.span(plan.per[k].payoff) + ')'));
                const a = el('span', 'amt', money(plan.per[k].interest)); a.append(el('small', '', 'interest'));
                li.append(nm, a); ol.append(li);
                L.push((n + 1) + '. ' + names[k] + ': paid off ' + when(plan.per[k].payoff) + ', interest ' + money(plan.per[k].interest));
            });
            // which order is best
            const av = s.order === 'avalanche' ? plan : C.simulate(debts, Object.assign({}, opts, { order: 'avalanche' }));
            const sn = s.order === 'snowball' ? plan : C.simulate(debts, Object.assign({}, opts, { order: 'snowball' }));
            const line = (nm, r) => nm + ': debt-free ' + (r.never ? 'never' : when(r.months) + ', interest ' + money(r.interest)) + '.';
            put(el('h3', '', 'Which order is best'), ''); L.push('Which order is best:');
            const lines = [];
            if (!av.never && !sn.never && av.months === sn.months && av.interest === sn.interest) lines.push('Highest interest first and smallest balance first give the same result here: debt-free ' + when(av.months) + ', interest ' + money(av.interest) + '.');
            else {
                lines.push(line('Highest interest first', av), line('Smallest balance first', sn));
                if (!av.never && !sn.never && sn.interest > av.interest) {
                    const sk = sn.order[0];
                    lines.push('Highest interest first saves ' + money(sn.interest - av.interest) + '. Smallest balance first clears ' + names[sk] + ' sooner (' + when(sn.per[sk].payoff) + ' instead of ' + when(av.per[sk].payoff) + ').');
                }
            }
            if (s.order === 'listed') lines.push(line('In the order you listed (your plan)', plan));
            lines.forEach(t => put(el('p', 'note', t), t));
        }

        // without the plan
        const own = C.simulate(debts, { own: true });
        if (!plan.never && (own.never || own.months !== plan.months || own.interest !== plan.interest)) {
            put(el('h3', '', 'Without the plan'), ''); L.push('Without the plan:');
            if (own.never) {
                const stuck = debts.map((d, k) => k).filter(k => !own.per[k].payoff).map(k => names[k]);
                const t = 'Just paying each monthly payment, with no extra, ' + stuck.join(' and ') + (stuck.length > 1 ? ' are' : ' is') + ' never paid off. Your plan clears everything by ' + when(plan.months) + '.';
                put(el('p', 'note good', t), t);
            } else {
                const t1 = (debts.length > 1 ? 'Just paying each monthly payment, with no extra and without moving freed-up money to the next debt' : 'Just paying ' + money(debts[0].min) + ' a month with no extra') + ': debt-free ' + when(own.months) + ' (' + C.span(own.months) + '), interest ' + money(own.interest) + '.';
                const sooner = own.months - plan.months, saved = own.interest - plan.interest;
                const t2 = 'Your plan ' + (saved > 0 ? 'saves ' + money(saved) + ' in interest' : '') + (saved > 0 && sooner > 0 ? ' and ' : '') + (sooner > 0 ? 'gets you debt-free ' + C.span(sooner) + ' sooner' : '') + '.';
                put(el('p', 'note', t1), t1);
                if (saved > 0 || sooner > 0) put(el('p', 'note good', t2), t2);
            }
        }

        // finish sooner
        put(el('h3', '', plan.never ? 'What you need to pay' : 'Finish sooner'), ''); L.push(plan.never ? 'What you need to pay:' : 'Finish sooner:');
        if (!plan.never) {
            const tb = el('table', 'tbl'), cap = el('caption', 'muted', 'If you pay more each month'); cap.style.textAlign = 'left'; cap.style.paddingBottom = '.3rem'; cap.style.fontSize = '.9rem';
            const thead = el('thead'), hr = el('tr'); ['Pay a month', 'Debt-free', 'Interest'].forEach(h => { const th = el('th', '', h); th.scope = 'col'; hr.append(th); }); thead.append(hr);
            const tbody = el('tbody'); tb.append(cap, thead, tbody);
            const addRow = (pay, r, now) => {
                const tr = el('tr'); const a = el('td', '', money(pay)); if (now) a.append(el('small', '', 'your plan'));
                tr.append(a, el('td', '', r.never ? 'Never' : when(r.months)), el('td', '', r.never ? '-' : money(r.interest)));
                if (now) tr.className = 'done'; tbody.append(tr);
                L.push('- ' + money(pay) + ' a month: debt-free ' + (r.never ? 'never' : when(r.months) + ', interest ' + money(r.interest)) + (now ? ' (your plan)' : ''));
            };
            addRow(plan.budget, plan, true);
            steps(plan.budget).forEach(st => { const r = C.simulate(debts, Object.assign({}, opts, { extra: R.extra + st })); if (!r.never && r.months < plan.months) addRow(plan.budget + st, r, false); });
            put(tb);
        }
        const goals = [12, 24, 36, 60].filter(m => plan.never || m < plan.months);
        const glines = [];
        goals.forEach(m => {
            const e = C.extraFor(debts, m, opts); if (e == null) return;
            const r = C.simulate(debts, Object.assign({}, opts, { extra: e }));
            glines.push('To be debt-free in ' + C.span(m) + ' (by ' + when(m) + '): pay ' + money(plan.budget + e - R.extra) + ' a month, ' + money(e - R.extra) + ' more than now. Interest: ' + money(r.interest) + '.');
        });
        if (!glines.length && !plan.never && plan.months <= 12) glines.push('You are debt-free within a year. Well done!');
        glines.forEach(t => put(el('p', 'note', t), t));

        // month by month
        if (!plan.never || plan.rows.length) {
            const det = put(el('details', 'months'));
            const sum = el('summary', '', 'Month by month' + (plan.never ? ' (first 2 years)' : ' (' + plan.months + (plan.months === 1 ? ' payment)' : ' payments)'))); det.append(sum);
            const fill = () => {
                if (!det.open || det.querySelector('table')) return;
                const wrap = el('div', 'scroll'), tb = el('table', 'tbl'), thead = el('thead'), hr = el('tr');
                ['Month', 'You pay', 'Interest', 'Still owed'].forEach(h => { const th = el('th', '', h); th.scope = 'col'; hr.append(th); }); thead.append(hr);
                const tbody = el('tbody');
                (plan.never ? plan.rows.slice(0, 24) : plan.rows).forEach(r => {
                    const tr = el('tr', r.done.length ? 'done' : ''), m = el('td', '', C.monthName(start, r.m));
                    if (r.done.length) m.append(el('small', '', r.done.map(k => names[k]).join(', ') + ' paid off'));
                    tr.append(m, el('td', '', money(r.pay)), el('td', '', money(r.interest)), el('td', '', money(r.owed))); tbody.append(tr);
                });
                tb.append(thead, tbody); wrap.append(tb); det.append(wrap);
            };
            det.addEventListener('toggle', () => { monthsOpen = det.open; fill(); });
            if (monthsOpen) { det.open = true; fill(); }
        }
        const foot = 'Interest is added once a month (the yearly rate divided by 12), so your bank\'s figures can differ by a little. Update your balances from each new statement.';
        put(el('p', 'foot', foot));
        R.all.filter(x => x.r.status === 'wait' && !(x.r.missing.length === 3 && !s.debts[x.i].name.trim())).forEach(x => { const t = x.name + ' is left out until its balance, interest rate and monthly payment are filled in.'; out.insertBefore(el('p', 'note muted', t), out.children[1]); L.push(t); });
        R.offs.filter(o => !o.err && o.at < 1).forEach(o => { const t = 'The one-off payment in ' + C.monthName(start, o.at, true) + ' is in the past, so it is left out.'; out.insertBefore(el('p', 'note muted', t), out.children[1]); L.push(t); });
        if (oneoffs.length) L.push('One-off payments: ' + oneoffs.map(o => money(o.cents) + ' in ' + when(o.at)).join(', ') + '.');
        L.push('', 'Your debts: ' + debts.map((d, k) => names[k] + ' ' + money(d.bal) + ' at ' + C.rateText(d.rate) + '%, paying ' + money(d.min) + ' a month').join('; ') + '.' + (R.extra ? ' Extra each month: ' + money(R.extra) + ' (' + ORDER_TEXT[s.order].toLowerCase() + ').' : ''));
        L.push('', 'Interest added once a month (yearly rate / 12). Made with Loan and Credit Card Payoff Planner: https://umar8092.github.io/apps/loan-and-credit-card-payoff-planner/');
        return L.filter((t, i, a) => !(t === '' && a[i - 1] === ''));
    }

    // ---- actions with Undo
    let msgTimer;
    function say(t, undo) {
        const m = $('msg'); m.textContent = t; clearTimeout(msgTimer);
        if (undo) { const b = el('button', '', 'Undo'); b.type = 'button'; b.id = 'undo'; b.onclick = () => { undo(); m.textContent = 'Done. It is back.'; }; m.append(' ', b); }
        msgTimer = setTimeout(() => { m.textContent = ''; }, undo ? 12000 : 4000);
    }
    const snapshot = () => JSON.parse(JSON.stringify({ debts: s.debts, extra: s.extra, order: s.order, oneoffs: s.oneoffs }));
    function restore(x) { Object.assign(s, JSON.parse(JSON.stringify(x))); save(); syncPlan(); buildDebts(); buildOneoffs(); update(); }
    function syncPlan() { $('extra').value = s.extra; document.querySelectorAll('input[name=order]').forEach(r => { r.checked = r.value === s.order; }); }
    function removeDebt(i) {
        const before = snapshot(), name = label(s.debts[i], i);
        s.debts.splice(i, 1); save(); buildDebts(); update();
        say('Removed ' + name + '.', () => restore(before));
        const first = document.querySelector('#debts .debt input'); if (first) first.focus();
    }
    function removeOneoff(i) {
        const before = snapshot();
        s.oneoffs.splice(i, 1); save(); buildOneoffs(); update();
        say('Removed the one-off payment.', () => restore(before));
        $('add-oneoff').focus();
    }
    $('add-debt').onclick = () => {
        if (s.debts.length >= MAX_DEBTS) return;
        s.debts.push(blank()); save(); buildDebts(); update();
        $('d' + (s.debts.length - 1) + '-bal').focus();
    };
    $('add-oneoff').onclick = () => {
        if (s.oneoffs.length >= MAX_ONEOFFS) return;
        s.oneoffs.push({ id: uid(), amt: '', month: C.monthKey(start, Math.min(120, (s.oneoffs.length ? 1 + s.oneoffs.length : 1))) }); save(); buildOneoffs(); update();
        $('o' + (s.oneoffs.length - 1) + '-amt').focus();
    };
    $('extra').value = s.extra;
    $('extra').oninput = () => { s.extra = $('extra').value; save(); update(); };
    document.querySelectorAll('input[name=order]').forEach(r => { r.checked = r.value === s.order; r.onchange = () => { if (r.checked) { s.order = r.value; save(); update(); } }; });
    $('demo').onclick = () => {
        const before = snapshot();
        restore({ debts: [
            Object.assign(blank(), { name: 'Credit card', bal: '3,200', rate: '24.9', pay: '96', showName: true }),
            Object.assign(blank(), { name: 'Store card', bal: '650', rate: '18.9', pay: '25', showName: true }),
            Object.assign(blank(), { name: 'Car loan', bal: '8,500', rate: '6.9', pay: '250', showName: true })
        ], extra: '129', order: 'avalanche', oneoffs: [] });
        say('Example filled in: three debts, paying 129 extra a month (500 in total).', () => restore(before));
    };
    $('clear').onclick = () => {
        const before = snapshot();
        restore({ debts: [blank()], extra: '', order: 'avalanche', oneoffs: [] });
        say('Cleared. Start again with your first debt.', () => restore(before));
        $('d0-bal').focus();
    };
    $('cur').value = s.cur;
    $('cur').onchange = () => { s.cur = $('cur').value; save(); update(); };
    $('copy').onclick = async () => {
        try { await navigator.clipboard.writeText(text); say('Copied. Paste it into a message or note.'); }
        catch (e) {
            const t = el('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.position = 'absolute'; t.style.left = '-9999px'; document.body.append(t); t.select();
            let ok = false; try { ok = document.execCommand('copy'); } catch (e2) { /* not allowed */ } t.remove();
            say(ok ? 'Copied. Paste it into a message or note.' : 'Copy is blocked in this browser. Use Email plan instead.');
        }
    };
    $('print').onclick = () => { document.querySelectorAll('#out details').forEach(d => { d.open = true; d.dispatchEvent(new Event('toggle')); }); window.print(); };

    buildDebts(); buildOneoffs(); update();
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => { /* offline mode not available */ });
})();
