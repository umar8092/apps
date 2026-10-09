(function () {
    const C = SubCore, $ = id => document.getElementById(id), KEY = 'subscription-tracker.state';
    const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const KNOWN = ['Netflix', 'Spotify', 'YouTube Premium', 'Disney+', 'Amazon Prime', 'Apple Music', 'Apple TV+', 'Apple One', 'iCloud+', 'Google One',
        'Microsoft 365', 'Xbox Game Pass', 'PlayStation Plus', 'Nintendo Switch Online', 'Hulu', 'Max', 'Paramount+', 'Peacock', 'Crunchyroll', 'Audible',
        'Kindle Unlimited', 'Dropbox', 'Adobe Creative Cloud', 'Canva Pro', 'ChatGPT Plus', 'Claude Pro', 'Duolingo', 'LinkedIn Premium', 'Patreon',
        'Gym', 'Phone plan', 'Internet', 'Newspaper', 'Magazine', 'VPN', 'Password manager', 'Meal kit', 'Car insurance', 'Home insurance', 'Charity donation'];
    const today = () => C.todayIso();

    // ---- saved state (storage may be blocked or corrupt: start fresh)
    let s = { subs: [], cur: '', sort: 'next' };
    try {
        const saved = JSON.parse(localStorage.getItem(KEY));
        if (saved && typeof saved === 'object') {
            s.subs = C.cleanList(saved.subs) || [];
            if ([...$('cur').options].some(o => o.value === saved.cur)) s.cur = saved.cur;
            if (['next', 'cost', 'name'].includes(saved.sort)) s.sort = saved.sort;
        }
    } catch (e) { /* start fresh */ }
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* storage blocked: works for this visit */ } };
    const money = c => C.fmt(c, s.cur);

    // ---- dates in words
    const dParts = iso => { const p = C.parseDate(iso); return p && { p, wd: WD[new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()] }; };
    function dateText(iso) {
        const x = dParts(iso); if (!x) return '';
        return x.wd + ' ' + x.p.d + ' ' + MON[x.p.m - 1] + (iso.slice(0, 4) !== today().slice(0, 4) ? ' ' + x.p.y : '');
    }
    function inDays(n) { return n === 0 ? 'today' : n === 1 ? 'tomorrow' : 'in ' + n + ' days'; }
    const whenText = iso => dateText(iso) + ' (' + inDays(C.diff(today(), iso)) + ')';
    const cycle = x => C.cycleText(x.every, x.unit);

    // ---- one line of text about each subscription (used on screen and in the copied/emailed list)
    function describe(x, t) {
        const st = C.status(x, t), next = C.nextOn(x, t), per = x.unit === 'month' && x.every === 1 ? '' : ' (' + money(C.monthly(x)) + ' a month)';
        if (st === 'cancelled') return { cls: 'cancelled', chip: 'Cancelled', text: 'Saves you ' + money(C.yearly(x)) + ' a year.' };
        if (st === 'paused') return { cls: 'paused', chip: 'Paused', text: 'Not counted in your totals.' };
        if (st === 'trial') return { cls: 'trial', chip: 'Free trial', warn: true, key: 'Free trial ends ' + whenText(x.date) + '.', text: ' Then ' + money(x.price) + ' ' + cycle(x) + per + '.' };
        if (!next) return { cls: 'active', text: 'Next payment date not set. Tap Edit to add it.' };
        return { cls: 'active', key: 'Next payment ' + whenText(next) + '.', text: '' };
    }

    // ---- render everything
    let undoSlot = null;   // { list, msg, where } for Delete everything, Restore and Try example
    let gone = null;       // { sub, index } shown in place of a deleted card
    let editing = null;    // id of the subscription in the form
    let text = '';

    function sorted(t) {
        const rank = x => ({ active: 0, trial: 0, paused: 1, cancelled: 2 })[C.status(x, t)];
        const key = x => C.nextOn(x, t) || '9999';
        return s.subs.slice().sort((a, b) => rank(a) - rank(b) ||
            (s.sort === 'cost' ? C.yearly(b) - C.yearly(a) : s.sort === 'name' ? 0 : (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0)) ||
            a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    }
    const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

    function render() {
        const t = today(), any = s.subs.length > 0, sum = C.summary(s.subs, t);
        // trials whose end date passed are now paying: store that so the form shows it too
        s.subs.forEach(x => { if (x.status === 'trial' && C.status(x, t) === 'active') x.status = 'active'; });

        $('result').hidden = !any; $('list-card').hidden = !any && !gone;
        $('intro').hidden = any;
        const formOpen = !any || editing || $('form').dataset.open === '1';
        $('form').hidden = !formOpen; $('open-form').hidden = formOpen;
        $('cancel').hidden = !(any || editing);
        $('share-tools').hidden = !any; $('backup').disabled = !any; $('clear').hidden = !any;
        $('f-sym').textContent = s.cur;

        // list
        const ul = $('subs'); ul.textContent = '';
        $('list-n').textContent = '(' + s.subs.length + ')';
        const list = sorted(t);
        if (gone) list.splice(Math.min(gone.index, list.length), 0, null);
        list.forEach(x => {
            if (!x) {
                const li = el('li', 'gone'); li.append(el('span', '', 'Deleted ' + gone.sub.name + '.'));
                const b = el('button', '', 'Undo'); b.type = 'button'; b.id = 'undo-del'; b.onclick = undoDelete; li.append(b); ul.append(li); return;
            }
            const d = describe(x, t), li = el('li', d.cls + (editing === x.id ? ' editing' : ''));
            li.dataset.id = x.id;
            const top = el('div', 's-top'); top.append(el('h3', 's-name', x.name), el('span', 's-price', money(x.price)));
            const how = el('p', 's-line'); how.textContent = cycle(x) + (x.unit === 'month' && x.every === 1 ? '' : ' · ' + money(C.monthly(x)) + ' a month on average');
            const line = el('p', 's-line' + (d.warn ? ' warn' : ''));
            if (d.chip) line.append(el('span', 'chip ' + d.cls, d.chip));
            if (d.key) line.append(el('b', '', d.key));
            if (d.text) line.append(document.createTextNode((d.key ? ' ' : '') + d.text.trim()));
            li.append(top, how, line);
            if (x.note) li.append(el('p', 's-note', x.note));
            const btns = el('div', 's-btns');
            const eb = el('button', 'edit', 'Edit'); eb.type = 'button'; eb.setAttribute('aria-label', 'Edit ' + x.name); eb.onclick = () => startEdit(x.id);
            const db = el('button', 'del', 'Delete'); db.type = 'button'; db.setAttribute('aria-label', 'Delete ' + x.name); db.onclick = () => del(x.id);
            btns.append(eb, db); li.append(btns); ul.append(li);
        });

        // result
        $('r-month').textContent = money(sum.month);
        $('r-year').textContent = money(sum.year) + ' a year · ' + sum.count + (sum.count === 1 ? ' subscription' : ' subscriptions') + (sum.count ? '' : ' being paid');
        const al = $('alerts'); al.textContent = '';
        const alert = (msg, cls) => al.append(el('li', cls || '', msg));
        sum.trialsSoon.forEach(x => alert(x.name + ': free trial ends ' + whenText(x.date) + '. Cancel before then if you do not want to pay ' + money(x.cents) + '.'));
        sum.dups.forEach(n => alert('You have "' + n + '" more than once. Is one a duplicate? Delete it so it is not counted twice.'));
        if (sum.undated.length) alert('No next payment date for ' + sum.undated.join(', ') + '. Add it (Edit) to see when ' + (sum.undated.length === 1 ? 'it is' : 'they are') + ' due.', 'info');
        $('r-7').textContent = money(sum.next7); $('r-30').textContent = money(sum.next30);
        const up = $('upcoming'); up.textContent = '';
        if (!sum.upcoming.length) up.append(el('li', 'empty', 'Nothing due in the next 30 days.'));
        sum.upcoming.forEach(u => {
            const li = el('li', u.trialEnd ? 'trial' : u.days <= 1 ? 'soon' : '');
            li.append(el('span', 'u-name', u.name), el('span', 'u-amt', money(u.cents)),
                el('span', 'u-when', dateText(u.date) + ', ' + inDays(u.days) + (u.trialEnd ? ' · free trial ends, first payment' : '')));
            up.append(li);
        });
        const bars = $('bars'); bars.textContent = '';
        $('big-h').hidden = !sum.biggest.length;
        sum.biggest.forEach(b => {
            const li = el('li'), bar = el('span', 'b-bar'), fill = el('i');
            fill.style.width = Math.max(2, b.pct) + '%'; bar.append(fill);
            li.append(el('span', 'b-name', b.name), el('span', 'b-amt', money(b.month) + ' (' + b.pct + '%)'), bar);
            bars.append(li);
        });
        const other = [];
        if (sum.paused) other.push(sum.paused + ' paused (not counted)');
        if (sum.cancelled) other.push(sum.cancelled + ' cancelled, saving you ' + money(sum.saved) + ' a year');
        $('r-other').textContent = other.length ? other.join(' · ') + '.' : '';
        $('r-other').hidden = !other.length;

        // text for Copy and Email
        const L = ['My subscriptions on ' + dateText(t) + ' ' + t.slice(0, 4), '',
            'Total: ' + money(sum.month) + ' a month, ' + money(sum.year) + ' a year (' + sum.count + (sum.count === 1 ? ' subscription' : ' subscriptions') + ')',
            'Due in the next 7 days: ' + money(sum.next7) + '. Next 30 days: ' + money(sum.next30) + '.', ''];
        sorted(t).forEach(x => {
            const st = C.status(x, t), next = C.nextOn(x, t);
            let line = '- ' + x.name + ': ' + money(x.price) + ' ' + cycle(x);
            if (st === 'trial') line += ', free trial ends ' + dateText(x.date);
            else if (st === 'paused') line += ' (paused)';
            else if (st === 'cancelled') line += ' (cancelled)';
            else if (next) line += ', next ' + dateText(next);
            if (x.note) line += '. Note: ' + x.note;
            L.push(line);
        });
        if (sum.cancelled) L.push('', 'Saved by cancelling: ' + money(sum.saved) + ' a year.');
        text = L.join('\n');
        $('mail').href = 'mailto:?subject=' + encodeURIComponent('My subscriptions: ' + money(sum.month) + ' a month') + '&body=' + encodeURIComponent(text);
        save();
    }

    // ---- the form
    const F = { name: $('f-name'), price: $('f-price'), cycle: $('f-cycle'), every: $('f-every'), unit: $('f-unit'), date: $('f-date'), note: $('f-note') };
    KNOWN.forEach(n => { const o = document.createElement('option'); o.value = n; $('known').append(o); });
    const statusVal = () => document.querySelector('input[name=st]:checked').value;
    function syncForm() {
        const st = statusVal();
        $('custom').hidden = F.cycle.value !== 'custom';
        $('date-box').hidden = st === 'paused' || st === 'cancelled';
        $('date-label').textContent = st === 'trial' ? 'Trial ends (first payment date)' : 'Next payment date';
        $('price-label').textContent = st === 'trial' ? 'Price after the trial' : 'Price';
        $('date-hint').textContent = st === 'trial' ? 'The day the free trial ends and the first payment is taken.' : 'Leave it empty if you do not know. A date in the past moves forward to the next payment by itself.';
    }
    document.querySelectorAll('input[name=st]').forEach(r => { r.onchange = syncForm; });
    F.cycle.onchange = () => { syncForm(); if (F.cycle.value === 'custom') F.every.focus(); };
    $('add-note').onclick = () => { $('note-box').hidden = false; $('add-note').hidden = true; F.note.focus(); };

    function resetForm() {
        editing = null; $('form').reset(); F.every.value = '2'; F.unit.value = 'month'; F.cycle.value = '1-month';
        $('note-box').hidden = true; $('add-note').hidden = false; $('form-err').textContent = '';
        $('form-h').textContent = 'Add a subscription'; $('save').textContent = 'Add subscription';
        syncForm();
    }
    function startEdit(id) {
        const x = s.subs.find(v => v.id === id); if (!x) return;
        resetForm(); editing = id;
        F.name.value = x.name; F.price.value = (x.price / 100).toFixed(2);
        const preset = x.every + '-' + x.unit;
        if ([...F.cycle.options].some(o => o.value === preset)) F.cycle.value = preset; else { F.cycle.value = 'custom'; F.every.value = x.every; F.unit.value = x.unit; }
        document.querySelector('input[name=st][value="' + C.status(x, today()) + '"]').checked = true;
        F.date.value = x.date; F.note.value = x.note;
        if (x.note) { $('note-box').hidden = false; $('add-note').hidden = true; }
        $('form-h').textContent = 'Edit ' + x.name; $('save').textContent = 'Save changes';
        syncForm(); render();
        $('add-card').scrollIntoView({ block: 'start', behavior: 'smooth' }); F.name.focus({ preventScroll: true });
    }
    function readForm() {
        const err = (m, f) => { $('form-err').textContent = m; f.focus(); return null; };
        const name = F.name.value.replace(/\s+/g, ' ').trim();
        if (!name) return err('Type a name, for example Netflix.', F.name);
        const p = C.parsePrice(F.price.value);
        if (p.err === 'blank') return err('Type the price, for example 9.99. Type 0 if it is free.', F.price);
        if (p.err === 'negative') return err('The price cannot be negative.', F.price);
        if (p.err === 'big') return err('That price is too big. The most is 1,000,000.', F.price);
        if (p.err) return err('Type the price as a number, for example 9.99.', F.price);
        let every, unit;
        if (F.cycle.value === 'custom') {
            unit = F.unit.value; every = Number(F.every.value.trim());
            if (!Number.isInteger(every) || every < 1 || every > C.MAX_EVERY[unit]) return err('For Other, type a whole number from 1 to ' + C.MAX_EVERY[unit] + ' ' + unit + 's.', F.every);
        } else { const [n, u] = F.cycle.value.split('-'); every = +n; unit = u; }
        const status = statusVal();
        let date = $('date-box').hidden ? (editing ? (s.subs.find(v => v.id === editing) || {}).date || '' : '') : F.date.value;
        if (date && !C.isDate(date)) return err('That date is not valid. Pick it from the calendar.', F.date);
        if (status === 'trial' && !date) return err('Pick the day the free trial ends, so you can be warned in time.', F.date);
        if (status === 'trial' && date < today()) return err('That trial end date has passed. Pick Paying instead, or a date from today on.', F.date);
        $('form-err').textContent = '';
        return { name, price: p.cents, every, unit, date, status, note: F.note.value.trim().slice(0, 200) };
    }
    $('form').onsubmit = e => {
        e.preventDefault();
        const v = readForm(); if (!v) return;
        let id;
        if (editing) { const x = s.subs.find(y => y.id === editing); if (x) Object.assign(x, v); id = editing; flash('Saved ' + v.name + '.'); }
        else {
            if (s.subs.length >= 300) { $('form-err').textContent = 'The list is full (300 subscriptions). Delete some first.'; return; }
            id = 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
            s.subs.push(Object.assign({ id }, v)); flash('Added ' + v.name + '.');
        }
        const wasEdit = !!editing;
        gone = null; resetForm(); $('form').dataset.open = wasEdit ? '0' : '1';
        render();
        if (wasEdit) { const li = document.querySelector('.subs li[data-id="' + id + '"]'); if (li) li.scrollIntoView({ block: 'center' }); }
        else F.name.focus();
    };
    $('cancel').onclick = () => { resetForm(); $('form').dataset.open = '0'; render(); };
    $('open-form').onclick = () => { $('form').dataset.open = '1'; resetForm(); render(); F.name.focus(); };

    // ---- delete with undo right where the card was
    function del(id) {
        const i = sorted(today()).findIndex(x => x.id === id); if (i < 0) return;
        const x = s.subs.find(v => v.id === id);
        if (editing === id) resetForm();
        s.subs = s.subs.filter(v => v.id !== id); gone = { sub: x, index: i };
        render(); const u = $('undo-del'); if (u) u.focus();
    }
    function undoDelete() { if (gone) { s.subs.push(gone.sub); const id = gone.sub.id; gone = null; render(); const b = document.querySelector('.subs li[data-id="' + id + '"] .del'); if (b) b.focus(); } }

    // ---- messages with optional Undo (Delete everything, Restore, Try example)
    let timer;
    function flash(m, undoList) {
        const msg = $('msg'); msg.textContent = m; clearTimeout(timer);
        undoSlot = undoList || null;
        if (undoList) { const b = el('button', '', 'Undo'); b.type = 'button'; b.id = 'undo-all'; b.onclick = () => { if (undoSlot) { s.subs = undoSlot; undoSlot = null; gone = null; msg.textContent = 'Back again.'; render(); } }; msg.append(' ', b); }
        else timer = setTimeout(() => { if (msg.textContent === m) msg.textContent = ''; }, 4000);
    }

    $('demo').onclick = () => {
        const t = today(), a = n => C.addDays(t, n);
        const ex = [['Netflix', 1549, 1, 'month', a(3), 'active'], ['Spotify', 1199, 1, 'month', a(12), 'active'], ['iCloud+', 299, 1, 'month', a(19), 'active'],
            ['Amazon Prime', 13900, 1, 'year', a(144), 'active'], ['Gym', 1000, 1, 'week', a(3), 'active'], ['The Daily News', 400, 1, 'month', a(5), 'trial'],
            ['Disney+', 1399, 1, 'month', '', 'cancelled'], ['Audible', 1495, 1, 'month', a(6), 'paused']];
        const before = s.subs.slice();
        ex.forEach((e, i) => s.subs.push({ id: 'ex' + i + Date.now().toString(36), name: e[0], price: e[1], every: e[2], unit: e[3], date: e[4], status: e[5], note: i === 0 ? 'Cancel in Account > Membership' : '' }));
        $('form').dataset.open = '0'; resetForm(); render();
        flash('Example list added. Change it or add your own.', before);
        $('result').scrollIntoView({ block: 'start' });
    };
    $('clear').onclick = () => { const before = s.subs.slice(); s.subs = []; gone = null; resetForm(); $('form').dataset.open = '1'; render(); flash('Everything deleted.', before); };

    $('sort').value = s.sort; $('sort').onchange = () => { s.sort = $('sort').value; gone = null; render(); };
    $('cur').value = s.cur; $('cur').onchange = () => { s.cur = $('cur').value; render(); };

    // ---- copy, print, calendar, backup
    $('copy').onclick = () => {
        const done = () => flash('List copied. Paste it anywhere.');
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
        function fallback() {
            const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'absolute'; ta.style.left = '-9999px';
            document.body.appendChild(ta); ta.select();
            try { document.execCommand('copy'); done(); } catch (e) { flash('Could not copy. Use Email list instead.'); }
            ta.remove();
        }
    };
    $('print').onclick = () => window.print();
    function download(name, type, body) {
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([body], { type })); a.download = name;
        document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    }
    $('cal').onclick = () => {
        const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
        const r = C.ics(s.subs, today(), s.cur, stamp);
        if (!r.count) { flash('Add a next payment date to a subscription you are paying for first.'); return; }
        download('subscription-payments.ics', 'text/calendar', r.text);
        flash('Calendar file saved with ' + r.count + (r.count === 1 ? ' subscription' : ' subscriptions') + '. Open it to add the reminders to your calendar.');
    };
    $('backup').onclick = () => {
        download('subscriptions-backup-' + today() + '.json', 'application/json', JSON.stringify({ app: 'subscription-tracker', version: 1, saved: today(), cur: s.cur, subs: s.subs }, null, 1));
        flash('Backup saved to your downloads.');
    };
    $('restore').onclick = () => { $('restore-file').value = ''; $('restore-file').click(); };
    $('restore-file').onchange = () => {
        const f = $('restore-file').files[0]; if (!f) return;
        if (f.size > 2000000) { flash('That file is too big to be a backup from this app.'); return; }
        const rd = new FileReader();
        rd.onload = () => {
            let data = null; try { data = JSON.parse(rd.result); } catch (e) { /* not JSON */ }
            const list = C.cleanList(data);
            if (!list || !list.length) { flash('That file is not a Subscription Tracker backup, or it is empty. Nothing was changed.'); return; }
            const before = s.subs.slice(); s.subs = list; gone = null; resetForm();
            if (data && [...$('cur').options].some(o => o.value === data.cur)) { s.cur = data.cur; $('cur').value = s.cur; }
            $('form').dataset.open = '0'; render(); flash('Restored ' + list.length + (list.length === 1 ? ' subscription.' : ' subscriptions.'), before);
        };
        rd.onerror = () => flash('Could not read that file.');
        rd.readAsText(f);
    };

    // a new day while the page stays open: dates move forward
    let shown = today();
    setInterval(() => { if (today() !== shown) { shown = today(); render(); } }, 60000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden && today() !== shown) { shown = today(); render(); } });

    resetForm(); render();
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
