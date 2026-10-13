// Page code for Baby Feeding and Nappy Tracker. The logic lives in core.js (BabyCore).
(function () {
    const C = window.BabyCore, KEY = 'baby-feeding-and-nappy-tracker.state';
    const $ = id => document.getElementById(id);
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const now = () => Date.now();
    const newId = p => p + now().toString(36) + Math.random().toString(36).slice(2, 7);
    const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

    // ---- times in the phone's own clock style (1:05 AM or 01:05)
    let tf, df; try { tf = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }); df = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' }); } catch (e) { tf = df = null; }
    const pad = n => String(n).padStart(2, '0');
    const fmtTime = ms => { if (tf) return tf.format(new Date(ms)); const d = new Date(ms); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
    const fmtDate = key => df ? df.format(new Date(C.dayStart(key) + 12 * C.HOUR)) : key;
    const today = () => C.dayKey(now());
    const dayName = key => key === today() ? 'Today' : key === C.addDays(today(), -1) ? 'Yesterday' : fmtDate(key);
    function when(ms) {
        const k = C.dayKey(ms);
        return k === today() ? fmtTime(ms) : k === C.addDays(today(), -1) ? 'yesterday ' + fmtTime(ms) : fmtDate(k) + ', ' + fmtTime(ms);
    }
    const toInput = ms => { const d = new Date(ms); return C.dayKey(ms) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };
    function fromInput(v) {
        const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(v || '');
        if (!m || !C.isDay(m[1]) || +m[2] > 23 || +m[3] > 59) return null;
        return new Date(+m[1].slice(0, 4), +m[1].slice(5, 7) - 1, +m[1].slice(8, 10), +m[2], +m[3]).getTime();
    }

    // ---- saved state
    let state = load(), canSave = true, viewDay = today(), editingId = null, editUnit = 'ml', lastMinute = 0, lastToday = today();
    function load() {
        try { const raw = localStorage.getItem(KEY); return C.clean(raw ? JSON.parse(raw) : null, now()); } catch (e) { return C.clean(null, now()); }
    }
    function save() {
        try { localStorage.setItem(KEY, JSON.stringify(state)); }
        catch (e) { if (canSave) { canSave = false; $('save-warn').hidden = false; } }
    }
    const snapshot = () => JSON.stringify(state);
    function restoreSnap(s) { state = C.clean(JSON.parse(s), now()); save(); closeEditor(); render(); }
    const baby = () => state.babies.find(b => b.id === state.current) || state.babies[0];

    // a short message with an optional Undo button
    const MSGS = ['now-msg', 'day-msg', 'tools-msg'];
    function say(id, text, snap, bad) {
        MSGS.forEach(m => { $(m).textContent = ''; $(m).classList.remove('bad'); });
        const box = $(id); box.textContent = text; box.classList.toggle('bad', !!bad);
        if (snap) {
            const b = el('button', null, 'Undo'); b.type = 'button';
            b.addEventListener('click', () => { restoreSnap(snap); say(id, 'Undone.'); });
            box.appendChild(b);
        }
    }

    // ---- top: which baby
    function renderBabies() {
        const nav = $('babies'); nav.textContent = '';
        nav.hidden = state.babies.length < 2;
        state.babies.forEach(b => {
            const t = el('button', 'baby-tab'); t.type = 'button';
            t.setAttribute('aria-pressed', b.id === state.current ? 'true' : 'false');
            t.appendChild(el('span', 'bt-name', b.name));
            if (b.feed || b.sleep) t.appendChild(el('span', 'bt-run', b.feed ? 'feeding' : 'asleep'));
            t.addEventListener('click', () => { if (state.current === b.id) return; state.current = b.id; save(); closeEditor(); MSGS.forEach(m => { $(m).textContent = ''; }); $('b-err').textContent = ''; render(); prefillBottle(); });
            nav.appendChild(t);
        });
    }

    // ---- status: last feed and which side next
    function lastFeedText(e) {
        if (e.t === 'breast') return C.describe(e, state.unit).detail;
        return 'Bottle ' + C.describe(e, state.unit).detail;
    }
    function renderStatus() {
        const b = baby(), t = now();
        const feeds = b.entries.filter(e => e.t === 'breast' || e.t === 'bottle');
        const last = feeds[feeds.length - 1] && feeds.reduce((a, z) => z.start > a.start ? z : a);
        $('st-h').textContent = state.babies.length > 1 ? b.name + ': last feed' : 'Last feed';
        const big = $('st-big'), meta = $('st-meta');
        if (b.feed) {
            big.textContent = 'Feeding now';
            const o = C.openSeg(b.feed), before = feeds.filter(e => e.start < b.feed.start);
            const last = before.length ? before.reduce((a, z) => z.start > a.start ? z : a) : null;
            meta.textContent = 'Started ' + when(b.feed.start) + (o ? ', now on the ' + C.sideName(o.side).toLowerCase() : ', paused') +
                (last ? '. Feed before: ' + C.fmtDur(b.feed.start - last.start) + ' earlier' : '');
        } else if (last) {
            big.textContent = C.fmtDur(t - last.start) + ' ago';
            meta.textContent = 'Started ' + when(last.start) + ': ' + lastFeedText(last);
        } else {
            big.textContent = 'No feeds yet';
            meta.textContent = 'Tap Left or Right below when the baby starts feeding, or save a bottle.';
        }
        const next = b.feed ? null : C.nextSide(b.entries), chip = $('st-next');
        chip.hidden = !next;
        if (next) chip.textContent = 'Offer next: ' + C.sideName(next.side) + ' side' + (next.both ? ' (the baby finished on it last time)' : ' (only the ' + C.sideName(next.side === 'L' ? 'R' : 'L').toLowerCase() + ' side was used last time)');
        ['L', 'R'].forEach(s => {
            const on = !!next && next.side === s;
            $('start-' + s).classList.toggle('suggest', on);
            $('tag-' + s).textContent = on ? 'Offer next' : '';
        });
        const more = $('st-more'); more.textContent = '';
        const nap = b.entries.filter(e => e.t === 'nappy').reduce((a, z) => !a || z.start > a.start ? z : a, null);
        if (nap) more.appendChild(el('li', null, 'Last nappy: ' + C.fmtDur(t - nap.start) + ' ago, ' + C.describe(nap).detail.toLowerCase()));
        if (b.sleep) more.appendChild(el('li', null, 'Asleep now for ' + C.fmtDur(t - b.sleep.start) + ' (since ' + when(b.sleep.start) + ')'));
        else {
            const sl = b.entries.filter(e => e.t === 'sleep').reduce((a, z) => !a || z.end > a.end ? z : a, null);
            if (sl) more.appendChild(el('li', null, 'Last woke up: ' + C.fmtDur(t - sl.end) + ' ago (slept ' + C.fmtDur(sl.end - sl.start) + ')'));
        }
    }

    // ---- live timers (updated every second)
    function renderTimers() {
        const b = baby(), t = now();
        $('breast-idle').hidden = !!b.feed; $('breast-run').hidden = !b.feed;
        if (b.feed) {
            const o = C.openSeg(b.feed), secs = C.sideSecs(b.feed, t), lastSide = b.feed.segs[b.feed.segs.length - 1].side;
            $('run-state').textContent = o ? 'Feeding on the ' + C.sideName(o.side).toLowerCase() : 'Paused (last on the ' + C.sideName(lastSide).toLowerCase() + ')';
            $('run-clock').textContent = C.clock((secs.L + secs.R) * 1000);
            ['L', 'R'].forEach(s => { const p = $('clock-' + s); p.querySelector('b').textContent = C.clock(secs[s] * 1000); p.classList.toggle('on', !!o && o.side === s); });
            const other = (o ? o.side : lastSide) === 'L' ? 'right' : 'left';
            $('switch').textContent = 'Switch to ' + other;
            $('pause').textContent = o ? 'Pause' : 'Resume ' + C.sideName(lastSide).toLowerCase();
            const long = t - b.feed.start > 90 * C.MIN;
            $('run-warn').hidden = !long;
            if (long) $('run-warn').textContent = 'This timer started ' + C.fmtDur(t - b.feed.start) + ' ago. If you forgot to stop it, tap "Stop and save feed", then Edit the minutes in the day\'s list.';
        }
        $('sleep-start').hidden = !!b.sleep; $('sleep-run').hidden = !b.sleep;
        if (b.sleep) {
            $('sleep-clock').textContent = C.clock(t - b.sleep.start);
            const long = t - b.sleep.start > 12 * C.HOUR;
            $('sleep-warn').hidden = !long;
            if (long) $('sleep-warn').textContent = 'Still asleep after ' + C.fmtDur(t - b.sleep.start) + '? If you forgot to tap "Baby woke up", tap it now and Edit the wake-up time in the day\'s list.';
        }
    }

    // ---- the chosen day: totals and the list
    function tile(box, label, value, sub) {
        const d = el('div', 'tile'); d.appendChild(el('span', 't-label', label)); d.appendChild(el('b', 't-val', value));
        if (sub) d.appendChild(el('span', 't-sub', sub));
        box.appendChild(d);
    }
    function renderTotals() {
        const b = baby(), t = now(), from = C.dayStart(viewDay), to = C.dayStart(C.addDays(viewDay, 1));
        const run = { feed: b.feed, sleep: b.sleep, now: t };
        const x = C.totals(b.entries, from, to, state.unit, run);
        $('day-h').textContent = dayName(viewDay);
        $('next').disabled = viewDay >= today();
        const first = b.entries.length ? C.dayKey(b.entries[0].start) : today();
        $('prev').disabled = viewDay <= first;
        const box = $('totals'); box.textContent = '';
        tile(box, 'Feeds', String(x.feeds), x.feeds ? [x.breast ? plural(x.breast, 'breast', 'breast') : '', x.bottles ? plural(x.bottles, 'bottle', 'bottles') : '', x.feeds > x.breast + x.bottles ? 'one now' : ''].filter(Boolean).join(', ') : '');
        tile(box, 'Breast time', x.breastSecs ? C.fmtSecs(x.breastSecs) : '0 min');
        tile(box, 'Bottles', x.bottles ? x.bottleText : '0 ' + state.unit, x.bottles ? plural(x.bottles, 'bottle', 'bottles') : '');
        tile(box, 'Wet nappies', String(x.wet));
        tile(box, 'Dirty nappies', String(x.dirty));
        tile(box, 'Sleep', x.sleep ? C.fmtDur(x.sleep) : '0 min');
        $('avg').textContent = x.avgGap ? 'Average time between feeds: ' + C.fmtDur(x.avgGap) + ' (start to start)' : '';
        if (viewDay === today()) {
            const y = C.totals(b.entries, t - C.DAY, t + 1, state.unit, run);
            $('last24').textContent = 'Last 24 hours: ' + plural(y.feeds, 'feed', 'feeds') + ', ' + plural(y.wet, 'wet nappy', 'wet nappies') + ', ' + plural(y.dirty, 'dirty nappy', 'dirty nappies') + ', ' + (y.sleep ? C.fmtDur(y.sleep) : '0 min') + ' sleep';
        } else $('last24').textContent = '';
    }
    function dayEntries() {
        const from = C.dayStart(viewDay), to = C.dayStart(C.addDays(viewDay, 1));
        return baby().entries.filter(e => e.start >= from && e.start < to).sort((a, z) => z.start - a.start);
    }
    function renderList() {
        const list = $('entries'); list.textContent = '';
        const items = dayEntries();
        $('empty').hidden = items.length > 0;
        items.forEach(e => {
            const d = C.describe(e, state.unit), li = el('li', 'entry ' + e.t);
            if (e.id === editingId) li.classList.add('editing');
            const top = el('div', 'e-top');
            top.appendChild(el('span', 'e-time', fmtTime(e.start) + (e.t === 'sleep' ? ' to ' + (C.dayKey(e.end) === C.dayKey(e.start) ? fmtTime(e.end) : when(e.end)) : '')));
            top.appendChild(el('b', 'e-title', d.title));
            li.appendChild(top);
            li.appendChild(el('p', 'e-detail', d.detail));
            if (e.note) li.appendChild(el('p', 'e-note', e.note));
            const btns = el('div', 'e-btns');
            const ed = el('button', null, 'Edit'); ed.type = 'button'; ed.setAttribute('aria-label', 'Edit ' + d.title.toLowerCase() + ' at ' + fmtTime(e.start));
            ed.addEventListener('click', () => openEditor(e));
            const del = el('button', null, 'Delete'); del.type = 'button'; del.setAttribute('aria-label', 'Delete ' + d.title.toLowerCase() + ' at ' + fmtTime(e.start));
            del.addEventListener('click', () => {
                const snap = snapshot(), b = baby();
                b.entries = b.entries.filter(x => x.id !== e.id);
                if (editingId === e.id) closeEditor();
                save(); render();
                say('day-msg', 'Deleted ' + d.title.toLowerCase() + ' at ' + fmtTime(e.start) + '.', snap);
            });
            btns.appendChild(ed); btns.appendChild(del); li.appendChild(btns);
            list.appendChild(li);
        });
    }

    // ---- share text for the chosen day
    function dayText() {
        const b = baby(), from = C.dayStart(viewDay), to = C.dayStart(C.addDays(viewDay, 1));
        const x = C.totals(b.entries, from, to, state.unit, { feed: b.feed, sleep: b.sleep, now: now() });
        const lines = [b.name + ', ' + fmtDate(viewDay),
            'Feeds: ' + x.feeds + (x.feeds ? ' (' + plural(x.breast, 'breast feed', 'breast feeds') + ', ' + C.fmtSecs(x.breastSecs) + '; ' + plural(x.bottles, 'bottle', 'bottles') + (x.bottles ? ', ' + x.bottleText : '') + ')' : ''),
            'Wet nappies: ' + x.wet + ', dirty nappies: ' + x.dirty,
            'Sleep: ' + (x.sleep ? C.fmtDur(x.sleep) : '0 min')];
        if (x.avgGap) lines.push('Average time between feeds: ' + C.fmtDur(x.avgGap));
        lines.push('');
        dayEntries().slice().reverse().forEach(e => {
            const d = C.describe(e, state.unit);
            lines.push(fmtTime(e.start) + (e.t === 'sleep' ? '-' + fmtTime(e.end) : '') + '  ' + d.title + ': ' + d.detail + (e.note ? ' (' + e.note + ')' : ''));
        });
        if (!dayEntries().length) lines.push('Nothing logged on this day.');
        return lines.join('\n');
    }

    function renderTools() {
        const b = baby();
        if (document.activeElement !== $('baby-name')) $('baby-name').value = b.name === 'Baby' ? '' : b.name;
        $('unit').value = state.unit;
        ['b-unit'].forEach(id => { $(id).textContent = state.unit; });
        $('b-amount').placeholder = state.unit === 'oz' ? 'e.g. 3' : 'e.g. 90';
        $('remove-baby').hidden = state.babies.length < 2;
        $('remove-baby').textContent = 'Remove ' + b.name;
        $('wipe').textContent = state.babies.length > 1 || b.name !== 'Baby' ? 'Delete ' + b.name + '\'s whole log' : 'Delete the whole log';
        $('add-baby').hidden = state.babies.length >= C.MAX_BABIES;
        document.querySelector('.day').dataset.print = b.name + ', ' + fmtDate(viewDay);
        $('mail').href = 'mailto:?subject=' + encodeURIComponent(b.name + ': feeds and nappies, ' + fmtDate(viewDay)) + '&body=' + encodeURIComponent(dayText().slice(0, 1800));
    }
    // the last bottle's amount and milk are filled in for next time
    function prefillBottle() {
        const last = baby().entries.filter(e => e.t === 'bottle').pop();
        if (!last) { $('b-amount').value = ''; return; }
        const a = last.unit === state.unit ? last.amount : state.unit === 'oz' ? Math.round(C.toMl(last.amount, last.unit) / C.OZ * 10) / 10 : Math.round(C.toMl(last.amount, last.unit));
        $('b-amount').value = state.unit === 'oz' ? C.ozText(a) : String(a);
        $('b-milk').value = last.milk || 'formula';
    }

    function render() {
        if (!state.babies.some(b => b.id === state.current)) state.current = state.babies[0].id;
        renderBabies(); renderStatus(); renderTimers(); renderTotals(); renderList(); renderTools();
        lastMinute = Math.floor(now() / C.MIN);
    }

    // ---- actions: breast feed
    function addEntry(e) {
        const c = C.checkEntry(e, now());
        if (c.error) return c;
        const b = baby(); b.entries.push(c.entry); b.entries.sort((a, z) => a.start - z.start);
        return c;
    }
    ['L', 'R'].forEach(s => $('start-' + s).addEventListener('click', () => {
        const b = baby(); if (b.feed) return;
        b.feed = C.startFeed(s, now()); save(); render();
        say('now-msg', 'Timer started on the ' + C.sideName(s).toLowerCase() + '.');
        $('stop').focus();
    }));
    $('switch').addEventListener('click', () => {
        const b = baby(); if (!b.feed) return;
        const o = C.openSeg(b.feed), cur = o ? o.side : b.feed.segs[b.feed.segs.length - 1].side, to = cur === 'L' ? 'R' : 'L';
        C.switchSide(b.feed, to, now()); save(); render();
        say('now-msg', 'Now on the ' + C.sideName(to).toLowerCase() + '.');
    });
    $('pause').addEventListener('click', () => {
        const b = baby(); if (!b.feed) return;
        const o = C.openSeg(b.feed);
        if (o) { C.pauseFeed(b.feed, now()); say('now-msg', 'Paused. Tap Resume when the baby feeds again.'); }
        else { const side = b.feed.segs[b.feed.segs.length - 1].side; C.switchSide(b.feed, side, now()); say('now-msg', 'Feeding again on the ' + C.sideName(side).toLowerCase() + '.'); }
        save(); render();
    });
    $('stop').addEventListener('click', () => {
        const b = baby(); if (!b.feed) return;
        const snap = snapshot(), e = C.finishFeed(b.feed, now(), newId('e'));
        let clipped = false;
        ['left', 'right'].forEach(k => { if (e[k] > 3 * 3600) { e[k] = 3 * 3600; clipped = true; } });
        if (e.end - e.start > 6 * C.HOUR) e.end = e.start + 6 * C.HOUR;
        if (e.left + e.right === 0) e[e.first === 'L' ? 'left' : 'right'] = 1;
        const c = addEntry(e);
        b.feed = null;
        if (c.error) { save(); render(); say('now-msg', 'The feed could not be saved: ' + c.error, snap, true); return; }
        viewDay = today(); save(); render();
        say('now-msg', 'Saved breast feed: ' + C.describe(c.entry).detail + '.' + (clipped ? ' The timer ran very long, so each side was saved as at most 3 hours. Tap Edit in the day\'s list to fix it.' : ''), snap);
        $('start-' + C.nextSide(b.entries).side).focus();
    });
    $('discard').addEventListener('click', () => {
        const b = baby(); if (!b.feed) return;
        const snap = snapshot(); b.feed = null; save(); render();
        say('now-msg', 'Feed timer discarded. Nothing was saved.', snap);
    });

    // ---- bottle, nappy, sleep
    $('b-save').addEventListener('click', () => {
        const p = C.parseAmount($('b-amount').value, state.unit);
        $('b-err').textContent = p.error || '';
        if (p.error) { $('b-amount').focus(); return; }
        const snap = snapshot();
        const c = addEntry({ id: newId('e'), t: 'bottle', start: now(), amount: p.value, unit: state.unit, milk: $('b-milk').value });
        if (c.error) { $('b-err').textContent = c.error; return; }
        viewDay = today(); save(); render();
        say('now-msg', 'Saved bottle: ' + C.describe(c.entry, state.unit).detail + ' at ' + fmtTime(c.entry.start) + '.', snap);
    });
    $('b-amount').addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); $('b-save').click(); } });
    $('b-amount').addEventListener('input', () => { $('b-err').textContent = ''; });
    [['n-wet', true, false], ['n-dirty', false, true], ['n-both', true, true]].forEach(([id, wet, dirty]) => $(id).addEventListener('click', () => {
        const snap = snapshot(), c = addEntry({ id: newId('e'), t: 'nappy', start: now(), wet, dirty });
        viewDay = today(); save(); render();
        say('now-msg', 'Saved ' + C.describe(c.entry).detail.toLowerCase() + ' nappy at ' + fmtTime(c.entry.start) + '.', snap);
    }));
    $('sleep-start').addEventListener('click', () => {
        const b = baby(); if (b.sleep) return;
        b.sleep = { start: now() }; save(); render();
        say('now-msg', 'Sleep timer started at ' + fmtTime(b.sleep.start) + '.');
        $('sleep-stop').focus();
    });
    $('sleep-stop').addEventListener('click', () => {
        const b = baby(); if (!b.sleep) return;
        const snap = snapshot(), t = now();
        const c = addEntry({ id: newId('e'), t: 'sleep', start: b.sleep.start, end: Math.max(t, b.sleep.start + 1000) });
        b.sleep = null; viewDay = today(); save(); render();
        if (c.error) { say('now-msg', 'This sleep timer ran for more than 24 hours, so it was not saved. Use "+ Add an earlier feed, nappy or sleep" with the right times.', snap, true); return; }
        say('now-msg', 'Saved sleep: ' + C.fmtDur(c.entry.end - c.entry.start) + ' (' + fmtTime(c.entry.start) + ' to ' + fmtTime(c.entry.end) + ').', snap);
        $('sleep-start').focus();
    });
    $('sleep-discard').addEventListener('click', () => {
        const b = baby(); if (!b.sleep) return;
        const snap = snapshot(); b.sleep = null; save(); render();
        say('now-msg', 'Sleep timer discarded. Nothing was saved.', snap);
    });

    // ---- day navigation
    $('prev').addEventListener('click', () => { viewDay = C.addDays(viewDay, -1); render(); });
    $('next').addEventListener('click', () => { if (viewDay < today()) { viewDay = C.addDays(viewDay, 1); render(); } });

    // ---- add or edit an entry
    const etype = () => document.querySelector('input[name=etype]:checked').value;
    function showType() {
        const t = etype();
        ['breast', 'bottle', 'nappy', 'sleep'].forEach(k => { $('e-' + k).hidden = k !== t; });
        $('e-start-l').textContent = t === 'sleep' ? 'Fell asleep at' : t === 'nappy' ? 'Changed at' : t === 'bottle' ? 'Time' : 'Started at';
        $('e-unit').textContent = editUnit;
        $('e-err').textContent = '';
    }
    document.querySelectorAll('input[name=etype]').forEach(r => r.addEventListener('change', showType));
    function setType(t) { document.querySelector('input[name=etype][value=' + t + ']').checked = true; showType(); }
    function openEditor(e) {
        const t = now();
        editingId = e ? e.id : null;
        editUnit = e && e.t === 'bottle' ? e.unit : state.unit;
        $('ed-h').textContent = e ? 'Edit ' + C.describe(e, state.unit).title.toLowerCase() : 'Add an earlier entry';
        $('e-save').textContent = e ? 'Save changes' : 'Save';
        const start = e ? e.start : t - 30 * C.MIN;
        $('e-start').value = toInput(start); $('e-start').max = toInput(t);
        $('e-end').value = toInput(e && e.t === 'sleep' ? e.end : Math.min(t, start + C.HOUR)); $('e-end').max = toInput(t);
        $('e-left').value = e && e.t === 'breast' && e.left ? String(Math.round(e.left / 60) || 1) : '';
        $('e-right').value = e && e.t === 'breast' && e.right ? String(Math.round(e.right / 60) || 1) : '';
        $('e-first').value = e && e.t === 'breast' ? e.first : 'L';
        $('e-amount').value = e && e.t === 'bottle' ? (e.unit === 'oz' ? C.ozText(e.amount) : String(e.amount)) : '';
        $('e-amount').placeholder = editUnit === 'oz' ? 'e.g. 3' : 'e.g. 90';
        $('e-milk').value = e && e.t === 'bottle' && e.milk ? e.milk : 'formula';
        const nap = e && e.t === 'nappy' ? (e.wet && e.dirty ? 'both' : e.wet ? 'wet' : 'dirty') : 'wet';
        document.querySelector('input[name=enappy][value=' + nap + ']').checked = true;
        $('e-note').value = e ? e.note : '';
        $('note-box').hidden = !(e && e.note); $('open-note').hidden = !$('note-box').hidden;
        setType(e ? e.t : 'breast');
        $('editor').hidden = false; $('add-earlier').hidden = true;
        renderList();
        $('editor').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        document.querySelector('input[name=etype]:checked').focus({ preventScroll: true });
    }
    function closeEditor() {
        editingId = null; $('editor').hidden = true; $('add-earlier').hidden = false; $('e-err').textContent = '';
        document.querySelectorAll('.entry.editing').forEach(x => x.classList.remove('editing'));
    }
    $('add-earlier').addEventListener('click', () => openEditor(null));
    $('e-cancel').addEventListener('click', () => { closeEditor(); $('add-earlier').focus(); });
    $('form').addEventListener('keydown', ev => { if (ev.key === 'Escape') { ev.preventDefault(); closeEditor(); $('add-earlier').focus(); } });
    $('open-note').addEventListener('click', () => { $('note-box').hidden = false; $('open-note').hidden = true; $('e-note').focus(); });
    $('form').addEventListener('submit', ev => {
        ev.preventDefault();
        const err = m => { $('e-err').textContent = m; };
        const t = etype(), start = fromInput($('e-start').value);
        if (start == null) return err('Choose the date and time.');
        if (start > now() + C.MIN) return err('The time cannot be in the future.');
        const e = { id: editingId || newId('e'), t, start, note: $('e-note').value.trim() };
        if (t === 'breast') {
            const l = C.parseMinutes($('e-left').value), r = C.parseMinutes($('e-right').value);
            if (l.error || r.error) return err((l.error || r.error));
            if (!l.value && !r.value) return err('Type the minutes on at least one side.');
            e.left = l.value * 60; e.right = r.value * 60;
            e.first = l.value && r.value ? $('e-first').value : l.value ? 'L' : 'R';
            e.last = l.value && r.value ? (e.first === 'L' ? 'R' : 'L') : e.first;
            e.end = start + (e.left + e.right) * 1000;
            if (editingId) { const old = baby().entries.find(x => x.id === editingId); if (old && old.t === 'breast' && old.start === start && old.left === e.left && old.right === e.right && old.first === e.first) { e.last = old.last; e.end = old.end; } }
        } else if (t === 'bottle') {
            const p = C.parseAmount($('e-amount').value, editUnit);
            if (p.error) return err(p.error);
            e.amount = p.value; e.unit = editUnit; e.milk = $('e-milk').value;
        } else if (t === 'nappy') {
            const v = document.querySelector('input[name=enappy]:checked').value;
            e.wet = v !== 'dirty'; e.dirty = v !== 'wet';
        } else {
            const end = fromInput($('e-end').value);
            if (end == null) return err('Choose the wake-up date and time.');
            e.end = end;
        }
        const c = C.checkEntry(e, now());
        if (c.error) return err(c.error);
        const snap = snapshot(), b = baby(), was = !!editingId;
        b.entries = b.entries.filter(x => x.id !== c.entry.id); b.entries.push(c.entry); b.entries.sort((a, z) => a.start - z.start);
        viewDay = C.dayKey(c.entry.start); closeEditor(); save(); render();
        say('day-msg', (was ? 'Changes saved: ' : 'Added: ') + C.describe(c.entry, state.unit).title.toLowerCase() + ' at ' + when(c.entry.start) + '.', snap);
    });

    // ---- settings and sharing
    $('baby-name').addEventListener('input', () => {
        baby().name = $('baby-name').value.trim().slice(0, 30) || 'Baby';
        save(); renderBabies(); renderStatus(); renderTools();
    });
    $('unit').addEventListener('change', () => {
        state.unit = $('unit').value === 'oz' ? 'oz' : 'ml'; save(); render(); prefillBottle();
        say('tools-msg', 'Bottle amounts are now in ' + state.unit + '.');
    });
    function copyText(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
        return new Promise((res, rej) => {
            const ta = el('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'absolute'; ta.style.left = '-9999px';
            document.body.appendChild(ta); ta.select();
            try { document.execCommand('copy') ? res() : rej(); } catch (e) { rej(e); } finally { ta.remove(); }
        });
    }
    $('copy').addEventListener('click', () => copyText(dayText()).then(() => say('tools-msg', 'Copied the log for ' + (viewDay === today() ? 'today' : viewDay === C.addDays(today(), -1) ? 'yesterday' : fmtDate(viewDay)) + '. Paste it into a message.'),
        () => say('tools-msg', 'This browser blocked copying. Use Email day instead.', null, true)));
    $('print').addEventListener('click', () => window.print());
    $('add-baby').addEventListener('click', () => {
        if (state.babies.length >= C.MAX_BABIES) return;
        let n = state.babies.length + 1; while (state.babies.some(b => b.name === 'Baby ' + n)) n++;
        const b = C.newBaby(newId('b'), 'Baby ' + n);
        state.babies.push(b); state.current = b.id; closeEditor(); save(); render(); prefillBottle();
        say('tools-msg', 'Added ' + b.name + ' with an empty log. Type the name in "Baby\'s name". Switch babies with the names at the top.');
        $('baby-name').value = ''; $('baby-name').focus();
    });
    $('remove-baby').addEventListener('click', () => {
        if (state.babies.length < 2) return;
        const snap = snapshot(), b = baby();
        state.babies = state.babies.filter(x => x.id !== b.id); state.current = state.babies[0].id;
        closeEditor(); save(); render(); prefillBottle();
        say('tools-msg', 'Removed ' + b.name + ' and that log.', snap);
    });
    $('wipe').addEventListener('click', () => {
        const b = baby();
        if (!b.entries.length && !b.feed && !b.sleep) return say('tools-msg', 'The log is already empty.');
        const snap = snapshot(), n = b.entries.length; b.entries = []; b.feed = null; b.sleep = null; viewDay = today();
        closeEditor(); save(); render();
        say('tools-msg', 'Deleted ' + plural(n, 'entry', 'entries') + ' for ' + b.name + '.', snap);
    });
    $('backup').addEventListener('click', () => {
        const data = Object.assign({ app: 'baby-feeding-and-nappy-tracker', saved: new Date().toISOString() }, state);
        const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }));
        const a = el('a'); a.href = url; a.download = 'baby-tracker-backup-' + today() + '.json';
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
        say('tools-msg', 'Backup saved as ' + a.download + '. Keep it somewhere safe, for example in your email or cloud drive.');
    });
    $('restore').addEventListener('click', () => $('restore-file').click());
    $('restore-file').addEventListener('change', () => {
        const f = $('restore-file').files[0]; $('restore-file').value = '';
        if (!f) return;
        if (f.size > 5e6) return say('tools-msg', 'That file is too big to be a backup from this app.', null, true);
        const r = new FileReader();
        r.onload = () => {
            let raw; try { raw = JSON.parse(r.result); } catch (e) { raw = null; }
            if (!raw || raw.app !== 'baby-feeding-and-nappy-tracker' || !Array.isArray(raw.babies)) return say('tools-msg', 'That file is not a backup from Baby Feeding and Nappy Tracker.', null, true);
            const st = C.clean(raw, now()), count = st.babies.reduce((s, b) => s + b.entries.length, 0);
            const snap = snapshot(); state = st; viewDay = today(); closeEditor(); save(); render(); prefillBottle();
            say('tools-msg', 'Restored ' + plural(count, 'entry', 'entries') + ' for ' + st.babies.map(b => b.name).join(' and ') + '.', snap);
        };
        r.onerror = () => say('tools-msg', 'That file could not be read.', null, true);
        r.readAsText(f);
    });

    // ---- clocks: every second for timers, every minute for "ago" texts, midnight moves Today on
    function tick() {
        const b = baby();
        if (b.feed || b.sleep) renderTimers();
        const m = Math.floor(now() / C.MIN);
        if (m !== lastMinute) {
            const t = today();
            if (t !== lastToday) { if (viewDay === lastToday) viewDay = t; lastToday = t; renderList(); }
            lastMinute = m; renderBabies(); renderStatus(); renderTotals(); renderTools();
        }
    }
    setInterval(tick, 1000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { lastMinute = 0; tick(); renderTimers(); } });
    // another tab changed the log: show the same thing here
    window.addEventListener('storage', ev => { if (ev.key === KEY) { state = load(); closeEditor(); render(); } });

    try { localStorage.setItem(KEY + '.test', '1'); localStorage.removeItem(KEY + '.test'); } catch (e) { canSave = false; $('save-warn').hidden = false; }
    render(); prefillBottle();
})();
