(function () {
    const C = SplitCore, $ = id => document.getElementById(id), KEY = 'splittip-v1';
    const blank = () => ({ n: '', a: '', e: '' });
    const def = { mode: 'settle', bname: '', bill: '', tax: '', tip: '18', people: 2, round: false, cur: '$',
        rows: [blank(), blank()], prows: [blank(), blank(), blank()] };
    let s = Object.assign({}, def);
    try {
        const saved = JSON.parse(localStorage.getItem(KEY));
        if (saved && typeof saved === 'object') s = Object.assign(s, saved);
    } catch (e) { /* storage blocked or corrupt: start fresh */ }
    const clean = (rows, fallback) => Array.isArray(rows) && rows.length
        ? rows.slice(0, 30).map(r => ({ n: String((r && r.n) || '').slice(0, 30), a: String((r && r.a) || '').slice(0, 15), e: String((r && r.e) || '').slice(0, 80) }))
        : fallback;
    s.rows = clean(s.rows, def.rows); s.prows = clean(s.prows, def.prows);
    if (!['settle', 'even', 'person'].includes(s.mode)) s.mode = 'settle';
    s.bname = String(s.bname || '').slice(0, 60);

    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* ignore */ } };
    let last = '';

    function el(tag, cls, text) {
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = text;
        return e;
    }

    // One list of people. withEmail adds the optional email box used by "Who owes who".
    function rowsHtml(list, ul, withEmail, amountLabel) {
        ul.innerHTML = '';
        list.forEach((r, i) => {
            const li = document.createElement('li');
            li.innerHTML = '<input type="text" maxlength="30" placeholder="Person ' + (i + 1) + '" aria-label="Name of person ' + (i + 1) + '" autocomplete="off">' +
                '<input type="text" inputmode="decimal" maxlength="15" placeholder="' + amountLabel + '" aria-label="' + amountLabel + ' for person ' + (i + 1) + '" autocomplete="off">' +
                (withEmail ? '<input type="email" maxlength="80" placeholder="Email (optional)" aria-label="Email of person ' + (i + 1) + '" autocomplete="off" autocapitalize="off">' : '') +
                '<button type="button" aria-label="Remove person ' + (i + 1) + '">&times;</button>';
            const inputs = li.querySelectorAll('input'), x = li.querySelector('button');
            inputs[0].value = r.n; inputs[1].value = r.a;
            inputs[0].oninput = () => { r.n = inputs[0].value; render(); };
            inputs[1].oninput = () => { r.a = inputs[1].value; render(); };
            if (withEmail) { inputs[2].value = r.e; inputs[2].oninput = () => { r.e = inputs[2].value; render(); }; }
            x.onclick = () => { if (list.length > 1) { list.splice(i, 1); rowsHtml(list, ul, withEmail, amountLabel); render(); } };
            ul.appendChild(li);
        });
    }
    const paidRows = () => rowsHtml(s.prows, $('prows'), true, 'Paid 0.00');
    const orderRows = () => rowsHtml(s.rows, $('rows'), false, '0.00');

    const validEmail = e => /^[^\s@,;]+@[^\s@,;]+$/.test(e);

    // The "Who owes who" tab: the result list, the text for copy and email, and the mail links.
    function renderSettle(f) {
        const name = i => s.prows[i].n.trim() || 'Person ' + (i + 1);
        const paid = s.prows.map(x => C.parseMoney(x.a));
        const r = C.settle(paid), n = paid.length;
        const bill = s.bname.trim();

        $('s-share').textContent = (r.shares.every(c => c === r.shares[0]) ? '' : 'about ') + f(r.shares[0]);
        $('s-total').textContent = 'Total ' + f(r.total) + ' shared by ' + n + (n === 1 ? ' person' : ' people');

        const transfers = r.transfers.map(t => name(t.from) + ' pays ' + name(t.to) + ' ' + f(t.amount));
        $('transfers').innerHTML = '';
        (transfers.length ? transfers : [r.total ? 'Everyone has paid their share. Nobody owes anything.' : 'Type what each person paid to see who owes who.'])
            .forEach(t => $('transfers').appendChild(el('li', transfers.length ? '' : 'none', t)));

        $('s-people').innerHTML = '';
        const people = paid.map((p, i) => {
            const b = r.balance[i], d = el('div');
            const left = el('span', '', name(i)); left.appendChild(el('small', '', 'paid ' + f(p) + ', share ' + f(r.shares[i])));
            d.appendChild(left);
            d.appendChild(el('b', b > 0 ? 'get' : b < 0 ? 'owe' : '', b > 0 ? 'gets back ' + f(b) : b < 0 ? 'owes ' + f(-b) : 'all square'));
            $('s-people').appendChild(d);
            return name(i) + ' paid ' + f(p) + ' (share ' + f(r.shares[i]) + ')';
        });

        const body = (bill ? bill + '\n' : '') + 'Total ' + f(r.total) + ' for ' + n + (n === 1 ? ' person' : ' people') +
            '\n\nWho paid:\n' + people.join('\n') + '\n\nTo settle up:\n' + (transfers.length ? transfers.join('\n') : 'Nobody owes anything.');
        const subject = (bill || 'Our bill') + ': who owes who';
        const mail = emails => 'mailto:' + emails.join(',') + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
        const emailOf = i => s.prows[i].e.trim();
        const everyone = [...new Set(s.prows.map((x, i) => emailOf(i)).filter(validEmail))];
        const owing = [...new Set(r.balance.map((b, i) => b < 0 ? emailOf(i) : '').filter(validEmail))];
        $('mail-all').href = mail(everyone); $('mail-owe').href = mail(owing);
        $('mail-all').hidden = $('mail-owe').hidden = !r.total;
        return body;
    }

    function render() {
        const settle = s.mode === 'settle', person = s.mode === 'person', sym = s.cur;
        document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.mode === s.mode)));
        $('settle-box').hidden = !settle; $('settle-res').hidden = !settle; $('sum-box').hidden = settle;
        $('tt-box').hidden = settle; $('round-wrap').hidden = settle;
        $('even-box').hidden = person || settle; $('people-box').hidden = person || settle; $('person-box').hidden = !person;
        $('per-wrap').hidden = person || settle; $('shares').hidden = !person;
        document.querySelectorAll('#tips button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tip === s.tip)));
        $('round').checked = s.round; $('cur').value = s.cur;
        const f = c => C.format(c, sym);

        if (settle) { last = renderSettle(f); save(); return; }

        const people = Math.min(Math.max(parseInt(s.people, 10) || 1, 1), 100);
        const r = C.compute({
            mode: s.mode, subtotal: C.parseMoney(s.bill), amounts: s.rows.map(x => C.parseMoney(x.a)),
            people, tax: C.parseMoney(s.tax), tipPct: parseFloat(String(s.tip).replace(',', '.')) || 0, roundUp: s.round
        });
        $('r-sub').textContent = f(r.subtotal); $('r-tax').textContent = f(r.tax);
        $('r-tip').textContent = f(r.tip); $('r-total').textContent = f(r.total);
        $('r-pct').textContent = '(' + (Math.round(r.tipPct * 10) / 10) + '%)';
        const lines = [];
        if (person) {
            $('shares').innerHTML = '';
            r.shares.forEach((c, i) => {
                const name = s.rows[i].n.trim() || 'Person ' + (i + 1);
                const d = document.createElement('div');
                d.innerHTML = '<span></span><b></b>';
                d.children[0].textContent = name; d.children[1].textContent = f(c);
                $('shares').appendChild(d);
                lines.push(name + ': ' + f(c));
            });
        } else {
            $('per').textContent = f(r.shares[0]);
            lines.push(people + ' people, ' + f(r.shares[0]) + ' each');
        }
        last = ['Bill ' + f(r.subtotal), 'Tax ' + f(r.tax), 'Tip ' + f(r.tip), 'Total ' + f(r.total)].join(', ') + '\n' + lines.join('\n');
        save();
    }

    // wire up
    document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => { s.mode = b.dataset.mode; render(); });
    $('bname').value = s.bname; $('bill').value = s.bill; $('tax').value = s.tax; $('people').value = s.people;
    if (!['10', '15', '18', '20', '25'].includes(String(s.tip))) $('tip-custom').value = s.tip;
    $('bname').oninput = e => { s.bname = e.target.value; render(); };
    $('bill').oninput = e => { s.bill = e.target.value; render(); };
    $('tax').oninput = e => { s.tax = e.target.value; render(); };
    document.querySelectorAll('#tips button').forEach(b => b.onclick = () => { s.tip = b.dataset.tip; $('tip-custom').value = ''; render(); });
    $('tip-custom').oninput = e => { s.tip = e.target.value; render(); };
    const setPeople = n => { s.people = Math.min(Math.max(n, 1), 100); $('people').value = s.people; render(); };
    $('minus').onclick = () => setPeople((parseInt(s.people, 10) || 1) - 1);
    $('plus').onclick = () => setPeople((parseInt(s.people, 10) || 1) + 1);
    $('people').oninput = e => { s.people = e.target.value.replace(/\D/g, '').slice(0, 3); render(); };
    $('people').onblur = () => setPeople(parseInt(s.people, 10) || 1);
    $('round').onchange = e => { s.round = e.target.checked; render(); };
    $('cur').onchange = e => { s.cur = e.target.value; render(); };
    $('add-person').onclick = () => { if (s.rows.length < 30) { s.rows.push(blank()); orderRows(); render(); } };
    $('add-payer').onclick = () => { if (s.prows.length < 30) { s.prows.push(blank()); paidRows(); render(); } };
    $('copy').onclick = async () => {
        let ok = false;
        try { await navigator.clipboard.writeText(last); ok = true; } catch (e) {
            const t = document.createElement('textarea'); t.value = last; document.body.appendChild(t); t.select();
            try { ok = document.execCommand('copy'); } catch (e2) { /* ignore */ }
            t.remove();
        }
        $('msg').textContent = ok ? 'Copied.' : 'Could not copy. Select the numbers and copy them by hand.';
        setTimeout(() => { $('msg').textContent = ''; }, 2500);
    };

    paidRows(); orderRows(); render();
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
