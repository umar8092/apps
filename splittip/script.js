(function () {
    const C = SplitCore, $ = id => document.getElementById(id), KEY = 'splittip-v1';
    const def = { mode: 'even', bill: '', tax: '', tip: '18', people: 2, round: false, cur: '$', rows: [{ n: '', a: '' }, { n: '', a: '' }] };
    let s = Object.assign({}, def);
    try {
        const saved = JSON.parse(localStorage.getItem(KEY));
        if (saved && typeof saved === 'object') s = Object.assign(s, saved);
        if (!Array.isArray(s.rows) || !s.rows.length) s.rows = def.rows;
    } catch (e) { /* storage blocked or corrupt: start fresh */ }
    s.rows = s.rows.slice(0, 30).map(r => ({ n: String((r && r.n) || '').slice(0, 30), a: String((r && r.a) || '').slice(0, 15) }));

    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* ignore */ } };
    let last = '';

    function rowsHtml() {
        $('rows').innerHTML = '';
        s.rows.forEach((r, i) => {
            const li = document.createElement('li');
            li.innerHTML = '<input type="text" maxlength="30" placeholder="Person ' + (i + 1) + '" aria-label="Name of person ' + (i + 1) + '" autocomplete="off">' +
                '<input type="text" inputmode="decimal" maxlength="15" placeholder="0.00" aria-label="Amount for person ' + (i + 1) + '" autocomplete="off">' +
                '<button type="button" aria-label="Remove person ' + (i + 1) + '">&times;</button>';
            const [n, a, x] = li.children;
            n.value = r.n; a.value = r.a;
            n.oninput = () => { r.n = n.value; render(); };
            a.oninput = () => { r.a = a.value; render(); };
            x.onclick = () => { if (s.rows.length > 1) { s.rows.splice(i, 1); rowsHtml(); render(); } };
            $('rows').appendChild(li);
        });
    }

    function render() {
        const person = s.mode === 'person', sym = s.cur;
        document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.mode === s.mode)));
        $('even-box').hidden = person; $('people-box').hidden = person; $('person-box').hidden = !person;
        $('per-wrap').hidden = person; $('shares').hidden = !person;
        document.querySelectorAll('#tips button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tip === s.tip)));
        $('round').checked = s.round; $('cur').value = s.cur;

        const people = Math.min(Math.max(parseInt(s.people, 10) || 1, 1), 100);
        const r = C.compute({
            mode: s.mode, subtotal: C.parseMoney(s.bill), amounts: s.rows.map(x => C.parseMoney(x.a)),
            people, tax: C.parseMoney(s.tax), tipPct: parseFloat(String(s.tip).replace(',', '.')) || 0, roundUp: s.round
        });
        const f = c => C.format(c, sym);
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
    $('bill').value = s.bill; $('tax').value = s.tax; $('people').value = s.people;
    if (!['10', '15', '18', '20', '25'].includes(String(s.tip))) $('tip-custom').value = s.tip;
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
    $('add-person').onclick = () => { if (s.rows.length < 30) { s.rows.push({ n: '', a: '' }); rowsHtml(); render(); } };
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

    rowsHtml(); render();
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
