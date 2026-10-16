// Spaced Repetition Flashcards for Exams: the page. The scheduling and text maths live in core.js.
(function () {
    'use strict';
    const C = window.CardCore, SLUG = 'spaced-repetition-flashcards-for-exams', KEY = SLUG + '.state';
    const $ = id => document.getElementById(id);
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    let state = C.normalize(null), saveOK = true, undoSnap = null, toastTimer = 0;
    let today = C.dayOfDate(new Date()), openId = null, search = '', shown = 50, editing = null, sess = null;

    // ---- saving
    function load() {
        let raw = null;
        try { raw = localStorage.getItem(KEY); } catch (e) { saveOK = false; return; }
        if (!raw) return;
        try { state = C.normalize(JSON.parse(raw)); }
        catch (e) {
            try { localStorage.setItem(KEY + '.broken', raw); } catch (e2) {}
            state = C.normalize(null);
            setTimeout(() => toast('Your saved cards could not be read, so the app started fresh. A copy was kept in this browser.'), 0);
        }
    }
    function save() {
        try { localStorage.setItem(KEY, JSON.stringify(state)); saveOK = true; } catch (e) { saveOK = false; }
        $('save-warn').hidden = saveOK;
    }
    const snapshot = () => JSON.stringify(state);
    function toast(text, snap) {
        undoSnap = snap || null;
        $('toast-text').textContent = text;
        $('toast-undo').hidden = !snap;
        $('toast').hidden = false;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => { $('toast').hidden = true; undoSnap = null; }, snap ? 10000 : 5000);
    }
    $('toast-undo').addEventListener('click', () => {
        if (!undoSnap) return;
        state = C.normalize(JSON.parse(undoSnap)); undoSnap = null;
        if (openId && !deckById(openId)) openId = null;
        endSession(true);
        save(); render(); toast('Undone.');
    });

    const deckById = id => state.decks.find(d => d.id === id);
    const totalCards = () => state.decks.reduce((n, d) => n + d.cards.length, 0);
    const cardOf = q => { const d = deckById(q.deck); return d && d.cards.find(c => c.id === q.card); };

    // ---- the top box
    function renderToday() {
        const counts = state.decks.map(d => C.deckCounts(d, today));
        const due = counts.reduce((n, c) => n + c.due, 0), fresh = counts.reduce((n, c) => n + c.newToday, 0), total = due + fresh;
        const cards = totalCards(), btn = $('study-all');
        $('t-date').textContent = 'Today, ' + C.fmtDay(today, { year: true });
        btn.hidden = true;
        if (!state.decks.length) {
            $('t-big').textContent = 'Make your first deck';
            $('t-sub').textContent = 'Give it a name under Your decks, then add the questions and answers you need to learn.';
        } else if (!cards) {
            $('t-big').textContent = 'Add cards to start';
            $('t-sub').textContent = 'Open a deck and type or paste your cards.';
        } else if (total) {
            $('t-big').textContent = C.plural(total, 'card') + ' to study today';
            $('t-sub').textContent = [due ? due + ' to review' : '', fresh ? fresh + ' new' : ''].filter(Boolean).join(', ') + '. About ' + Math.max(1, Math.round(total * 10 / 60)) + ' min.';
            btn.hidden = !!sess; btn.textContent = 'Study all (' + total + ')';
        } else {
            $('t-big').textContent = 'All done for today';
            $('t-sub').textContent = nextText();
        }
        const s = C.streak(state.log, today), sk = $('streak');
        sk.hidden = !s.days;
        sk.textContent = !s.days ? '' : s.today ? (s.days === 1 ? 'You studied today' : 'Studied ' + s.days + ' days in a row') + ': ' + C.plural(state.log[today], 'answer') + ' today.'
            : 'Studied ' + C.plural(s.days, 'day') + ' in a row. Study today to keep it going.';
    }
    function nextText() {
        let next = null, n = 0;
        state.decks.forEach(d => C.items(d).forEach(i => { if (!C.isNew(i.s) && i.s.due > today) { if (next == null || i.s.due < next) { next = i.s.due; n = 0; } if (i.s.due === next) n++; } }));
        const newWaiting = state.decks.some(d => C.deckCounts(d, today).newLeft > 0);
        if (next == null) return newWaiting ? 'New cards wait for tomorrow.' : 'No cards are waiting.';
        return 'Next: ' + C.plural(n, 'card') + (next === today + 1 ? ' tomorrow' : ' on ' + C.fmtDay(next)) + (newWaiting ? ', plus new cards' : '') + '.';
    }

    // ---- deck boxes
    function renderDecks() {
        const ul = $('dlist'); ul.textContent = '';
        state.decks.forEach(d => {
            const c = C.deckCounts(d, today), li = el('li', 'dbox' + (d.id === openId ? ' open' : ''));
            li.appendChild(el('h3', null, d.name));
            li.appendChild(el('p', 'd-due', !c.cards ? 'No cards yet' : c.total ? C.plural(c.total, 'card') + ' to study today' : 'Nothing due today'));
            if (c.cards) li.appendChild(el('p', 'd-mix', C.plural(c.cards, 'card') + ': ' + c.newLeft + ' new, ' + c.learning + ' learning, ' + c.known + ' known' + (d.reverse ? ' (both ways)' : '')));
            if (d.exam != null) li.appendChild(el('p', 'd-exam', examText(d)));
            const row = el('div', 'd-btns');
            const st = el('button', 'primary', c.total ? 'Study (' + c.total + ')' : 'Study'); st.type = 'button'; st.disabled = !c.total;
            st.addEventListener('click', () => startSession([d.id]));
            const op = el('button', 'secondary', d.id === openId ? 'Deck is open' : 'Open deck'); op.type = 'button';
            op.setAttribute('aria-label', 'Open deck ' + d.name);
            op.addEventListener('click', () => openDeck(d.id, !d.cards.length));
            row.append(st, op); li.appendChild(row); ul.appendChild(li);
        });
        const first = !state.decks.length;
        $('nd-label').textContent = first ? 'Name your first deck' : 'New deck name';
        $('example').hidden = state.decks.length > 0;
        $('nd-go').textContent = 'Make deck';
    }
    function examText(d) {
        const k = d.exam - today, day = C.fmtDay(d.exam, { year: true });
        if (k > 1) return 'Exam ' + day + ': in ' + k + ' days';
        if (k === 1) return 'Exam tomorrow (' + day + ')';
        if (k === 0) return 'Exam today. Good luck!';
        return 'Exam was on ' + day;
    }

    // ---- the open deck
    function openDeck(id, focusAdd) {
        openId = id; search = ''; shown = 50; editing = null; $('search').value = '';
        $('paste').value = ''; $('add-err').textContent = ''; $('d-msg').textContent = ''; $('d-exam-err').textContent = '';
        render();
        const target = focusAdd ? $('add-f') : $('dk-name');
        $('deck').scrollIntoView({ block: 'start', behavior: 'smooth' });
        setTimeout(() => target.focus({ preventScroll: true }), 50);
    }
    function renderDeck() {
        const d = openId && deckById(openId);
        $('deck').hidden = !d;
        if (!d) return;
        const c = C.deckCounts(d, today);
        $('dk-name').textContent = d.name;
        $('dk-meta').textContent = !c.cards ? 'No cards yet. Add your first one below.' : C.plural(c.cards, 'card') + '. ' + (c.total ? c.total + ' to study today' : 'Nothing due today') + '. Due tomorrow: ' + c.tomorrow + ', next 7 days: ' + c.week + '.';
        $('cards-n').textContent = '(' + c.cards + ')';
        renderCardList(d);
        if (document.activeElement !== $('d-name')) $('d-name').value = d.name;
        const preset = C.NEW_PRESETS.includes(d.newPerDay), sel = $('d-new');
        if (document.activeElement !== $('d-new-custom')) {
            sel.value = preset ? String(d.newPerDay) : 'custom';
            $('d-new-custom').hidden = preset; $('d-new-custom').value = d.newPerDay;
        }
        $('d-rev').checked = d.reverse;
        const hasExam = d.exam != null;
        $('d-exam-add').hidden = hasExam; $('d-exam-wrap').hidden = !hasExam;
        $('d-exam').min = C.isoOf(today + 1);
        if (hasExam && document.activeElement !== $('d-exam')) $('d-exam').value = C.isoOf(d.exam);
        renderPlan(d);
        const none = !d.cards.length;
        ['d-copy', 'd-csv', 'd-print', 'd-reset'].forEach(id => { $(id).disabled = none; });
        $('d-mail').href = mailHref(d);
        $('d-mail').classList.toggle('off', none);
        $('d-mail').setAttribute('aria-disabled', none ? 'true' : 'false');
        updatePreview();
    }
    function renderPlan(d) {
        const p = C.plan(d, today), fix = $('d-plan-fix');
        let t = '';
        fix.hidden = true;
        if (!p.left) t = d.cards.length ? 'Every card has been started.' : '';
        else if (p.examIn != null && p.examIn > 0 && !p.fits) {
            t = (p.per === 0 ? 'New cards are off, so ' + C.plural(p.left, 'new card') + ' will not be started before the exam.' : 'At ' + p.per + ' a day, ' + C.plural(p.left, 'new card') + ' will not all be started before the exam.') + ' You need ' + p.need + ' a day.';
            fix.hidden = false; fix.textContent = 'Use ' + p.need + ' new cards a day';
            fix.dataset.n = p.need;
        } else if (p.finish == null) t = 'New cards are off: you only review cards you have started. ' + C.plural(p.left, 'card') + ' not started.';
        else t = C.plural(p.left, 'new card') + (p.finish === today ? ': all started today' : ' at ' + p.per + ' a day: all started by ' + C.fmtDay(p.finish, { year: true })) + (p.examIn > 0 ? ', before the exam.' : '.');
        $('d-plan').textContent = t;
        $('d-plan').classList.toggle('warn', !fix.hidden);
    }
    function renderCardList(d) {
        const ul = $('clist'); ul.textContent = '';
        const q = search.trim().toLowerCase();
        const list = q ? d.cards.filter(c => (c.f + ' ' + c.b).toLowerCase().includes(q)) : d.cards;
        list.slice(0, shown).forEach(c => {
            const li = el('li', 'cbox');
            if (editing === c.id) { li.appendChild(editForm(d, c)); ul.appendChild(li); return; }
            li.appendChild(el('p', 'cf', c.f));
            li.appendChild(el('p', 'cb', c.b));
            li.appendChild(el('p', 'cw', C.isNew(c.s) ? 'New: not studied yet' : C.whenDue(c.s.due, today) + (c.s.lapses ? ', forgotten ' + C.plural(c.s.lapses, 'time') : '')));
            const row = el('div', 'c-btns');
            const e = el('button', 'mini', 'Edit'); e.type = 'button'; e.setAttribute('aria-label', 'Edit card ' + c.f.slice(0, 40));
            e.addEventListener('click', () => { editing = c.id; renderDeck(); const f = $('ce-f'); if (f) f.focus(); });
            const x = el('button', 'mini del', 'Delete'); x.type = 'button'; x.setAttribute('aria-label', 'Delete card ' + c.f.slice(0, 40));
            x.addEventListener('click', () => {
                const snap = snapshot();
                d.cards = d.cards.filter(k => k.id !== c.id);
                dropFromSession(c.id); save(); render(); toast('Card deleted.', snap);
            });
            row.append(e, x); li.appendChild(row); ul.appendChild(li);
        });
        if (!list.length) ul.appendChild(el('li', 'empty', q ? 'No card matches "' + search.trim() + '".' : 'No cards yet.'));
        const more = $('cmore');
        more.hidden = list.length <= shown;
        more.textContent = 'Show more (' + (list.length - shown) + ' more)';
    }
    function editForm(d, c) {
        const f = el('form', 'edit-in'); f.noValidate = true;
        const lf = el('label', null, 'Front (question)'); lf.htmlFor = 'ce-f';
        const tf = el('textarea'); tf.id = 'ce-f'; tf.rows = 2; tf.maxLength = 1000; tf.value = c.f;
        const lb = el('label', null, 'Back (answer)'); lb.htmlFor = 'ce-b';
        const tb = el('textarea'); tb.id = 'ce-b'; tb.rows = 2; tb.maxLength = 1000; tb.value = c.b;
        const err = el('p', 'err'); err.setAttribute('role', 'alert');
        const two = el('div', 'two');
        const sv = el('button', 'primary', 'Save card'); sv.type = 'submit';
        const cn = el('button', 'secondary', 'Cancel'); cn.type = 'button';
        cn.addEventListener('click', () => { editing = null; renderDeck(); });
        two.append(sv, cn);
        f.append(lf, tf, lb, tb, err, two);
        f.addEventListener('submit', ev => {
            ev.preventDefault();
            const r = setText(d, c, tf.value, tb.value);
            if (r) { err.textContent = r; return; }
            editing = null; save(); render(); toast('Card saved. Its progress is kept.');
        });
        [tf, tb].forEach(t => t.addEventListener('keydown', ev => { if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); f.requestSubmit(); } if (ev.key === 'Escape') { editing = null; renderDeck(); } }));
        return f;
    }
    function setText(d, c, fv, bv) {
        const f = C.clean(fv), b = C.clean(bv);
        if (!f || !b) return !f ? 'Type the front (question).' : 'Type the back (answer).';
        if (f.length > C.LIMITS.text || b.length > C.LIMITS.text) return 'Keep each side to 1000 characters.';
        if (d.cards.some(k => k.id !== c.id && C.keyOf(k.f, k.b) === C.keyOf(f, b))) return 'This deck already has that card.';
        c.f = f; c.b = b; return '';
    }

    // ---- making decks and cards
    $('newdeck').addEventListener('submit', ev => {
        ev.preventDefault();
        const name = C.clean($('nd-name').value).slice(0, C.LIMITS.name), err = $('nd-err');
        err.textContent = '';
        if (!name) { err.textContent = 'Type a name for the deck, for example Biology chapter 3.'; $('nd-name').focus(); return; }
        if (state.decks.length >= C.LIMITS.decks) { err.textContent = 'You can have up to ' + C.LIMITS.decks + ' decks. Delete one you no longer need.'; return; }
        if (state.decks.some(d => d.name.toLowerCase() === name.toLowerCase())) { err.textContent = 'You already have a deck called "' + name + '".'; return; }
        const d = { id: C.newId(state), name, newPerDay: 20, reverse: false, exam: null, newDay: 0, newCount: 0, extra: 0, cards: [] };
        state.decks.push(d); $('nd-name').value = '';
        save(); openDeck(d.id, true);
    });
    $('example').addEventListener('click', () => {
        const words = [['der Hund', 'the dog'], ['die Katze', 'the cat'], ['das Haus', 'the house'], ['das Wasser', 'the water'], ['das Brot', 'the bread'], ['der Apfel', 'the apple'],
            ['gehen', 'to go'], ['essen', 'to eat'], ['schlafen', 'to sleep'], ['heute', 'today'], ['morgen', 'tomorrow'], ['danke', 'thank you']];
        const d = { id: C.newId(state), name: 'German words (example)', newPerDay: 10, reverse: false, exam: null, newDay: 0, newCount: 0, extra: 0, cards: [] };
        words.forEach(([f, b]) => d.cards.push({ id: C.newId(state), f, b, s: C.newSched(), r: null }));
        state.decks.push(d); save(); render();
        toast('Example deck added. Tap Study to try it. Delete it any time in its settings.');
    });
    function addCards(d, list) {
        const room = C.LIMITS.cards - totalCards();
        if (room <= 0) return 0;
        list.slice(0, room).forEach(x => d.cards.push({ id: C.newId(state), f: x.f, b: x.b, s: C.newSched(), r: null }));
        return Math.min(room, list.length);
    }
    $('add-form').addEventListener('submit', ev => {
        ev.preventDefault();
        const d = deckById(openId), err = $('add-err'); if (!d) return;
        const f = C.clean($('add-f').value), b = C.clean($('add-b').value);
        err.textContent = '';
        if (!f) { err.textContent = 'Type the front (question).'; $('add-f').focus(); return; }
        if (!b) { err.textContent = 'Type the back (answer).'; $('add-b').focus(); return; }
        if (d.cards.some(k => C.keyOf(k.f, k.b) === C.keyOf(f, b))) { err.textContent = 'This deck already has that card.'; return; }
        if (!addCards(d, [{ f, b }])) { err.textContent = 'You have reached ' + C.LIMITS.cards + ' cards, the most this app keeps. Delete some first.'; return; }
        const same = d.cards.filter(k => k.f.toLowerCase() === f.toLowerCase()).length > 1;
        $('add-f').value = ''; $('add-b').value = '';
        save(); render(); $('add-f').focus();
        toast(same ? 'Card added. Note: another card has the same front with a different answer.' : 'Card added. ' + C.plural(d.cards.length, 'card') + ' in this deck.');
    });
    [$('add-f'), $('add-b')].forEach(t => t.addEventListener('keydown', ev => {
        if (ev.key !== 'Enter' || ev.shiftKey) return;
        ev.preventDefault();
        if (t === $('add-f')) $('add-b').focus(); else $('add-form').requestSubmit();
    }));

    // ---- pasting many
    function updatePreview() {
        const d = deckById(openId), box = $('preview'), go = $('paste-go');
        box.textContent = '';
        if (!d || !$('paste').value.trim()) { go.disabled = true; go.textContent = 'Add cards'; return; }
        const r = C.parsePaste($('paste').value, $('sep').value, d.cards);
        const room = C.LIMITS.cards - totalCards(), n = Math.min(r.cards.length, Math.max(0, room));
        box.appendChild(el('p', 'pv-n', r.cards.length ? 'Found ' + C.plural(r.cards.length, 'card') + '.' : 'No cards found yet.'));
        if (r.cards.length) {
            const ex = el('ul', 'pv-ex');
            r.cards.slice(0, 3).forEach(c => { const li = el('li'); li.append(el('b', null, c.f), document.createTextNode(' → ' + c.b)); ex.appendChild(li); });
            if (r.cards.length > 3) ex.appendChild(el('li', 'pv-more', 'and ' + (r.cards.length - 3) + ' more'));
            box.appendChild(ex);
        }
        const lines = (arr, what) => { if (!arr.length) return; box.appendChild(el('p', 'pv-skip', C.plural(arr.length, 'line') + ' skipped, ' + what + ': ' + arr.slice(0, 4).map(x => 'line ' + x.line + (x.text ? ' "' + x.text.slice(0, 30) + '"' : '')).join(', ') + (arr.length > 4 ? ' and more' : '') + '.')); };
        lines(r.noSep, 'no separator found');
        lines(r.empty, 'front or back missing');
        lines(r.dup, 'already in this deck');
        lines(r.tooLong, 'over 1000 characters');
        if (n < r.cards.length) box.appendChild(el('p', 'pv-skip', 'Only ' + n + ' fit: the app keeps up to ' + C.LIMITS.cards + ' cards in all.'));
        go.disabled = !n; go.textContent = n ? 'Add ' + C.plural(n, 'card') : 'Add cards';
    }
    $('paste').addEventListener('input', updatePreview);
    $('sep').addEventListener('change', updatePreview);
    $('paste-go').addEventListener('click', () => {
        const d = deckById(openId); if (!d) return;
        const r = C.parsePaste($('paste').value, $('sep').value, d.cards);
        if (!r.cards.length) return;
        const snap = snapshot(), n = addCards(d, r.cards);
        $('paste').value = ''; save(); render();
        toast('Added ' + C.plural(n, 'card') + ' to ' + d.name + '.', snap);
    });
    $('paste-file-btn').addEventListener('click', () => $('paste-file').click());
    $('paste-file').addEventListener('change', () => {
        const f = $('paste-file').files[0]; $('paste-file').value = '';
        if (!f) return;
        if (f.size > 2e6) { toast('That file is too big (over 2 MB). Paste the cards instead.'); return; }
        f.text().then(t => {
            let lines = t.replace(/^﻿/, '');
            if (/^\s*"?front"?\s*[,;\t]\s*"?back"?\s*$/i.test(lines.split(/\r?\n/)[0])) lines = lines.split(/\r?\n/).slice(1).join('\n');
            $('paste').value = lines; $('paste-box').open = true; updatePreview(); $('paste').focus();
        }).catch(() => toast('That file could not be read.'));
    });

    // ---- deck settings
    $('d-name').addEventListener('change', () => {
        const d = deckById(openId); if (!d) return;
        const name = C.clean($('d-name').value).slice(0, C.LIMITS.name);
        if (!name) { $('d-name').value = d.name; $('d-msg').textContent = 'A deck needs a name, so the old one was kept.'; return; }
        if (state.decks.some(x => x !== d && x.name.toLowerCase() === name.toLowerCase())) { $('d-name').value = d.name; $('d-msg').textContent = 'You already have a deck called "' + name + '".'; return; }
        d.name = name; $('d-msg').textContent = ''; save(); render();
    });
    (function fillNew() {
        const s = $('d-new');
        C.NEW_PRESETS.forEach(n => { const o = el('option', null, n === 0 ? 'None (only review)' : String(n)); o.value = n; s.appendChild(o); });
        const o = el('option', null, 'Custom'); o.value = 'custom'; s.appendChild(o);
    })();
    function setNew(n) {
        const d = deckById(openId); if (!d) return;
        d.newPerDay = Math.max(0, Math.min(C.LIMITS.newMax, Math.round(n)));
        save(); render();
    }
    $('d-new').addEventListener('change', () => {
        const v = $('d-new').value;
        if (v === 'custom') { $('d-new-custom').hidden = false; $('d-new-custom').focus(); return; }
        setNew(+v);
    });
    $('d-new-custom').addEventListener('change', () => {
        const v = parseFloat(String($('d-new-custom').value).replace(',', '.'));
        if (!isFinite(v) || v < 0) { $('d-msg').textContent = 'Type a number of new cards a day from 0 to 999.'; return; }
        if (v > C.LIMITS.newMax) $('d-msg').textContent = 'The most is 999 a day, so 999 is used.'; else $('d-msg').textContent = '';
        $('d-new-custom').blur(); setNew(v);
    });
    $('d-plan-fix').addEventListener('click', () => { const n = +$('d-plan-fix').dataset.n; if (n > 0) { setNew(n); toast('New cards a day set to ' + Math.min(n, C.LIMITS.newMax) + '.'); } });
    $('d-rev').addEventListener('change', () => { const d = deckById(openId); if (!d) return; d.reverse = $('d-rev').checked; save(); render(); });
    $('d-exam-add').addEventListener('click', () => { $('d-exam-add').hidden = true; $('d-exam-wrap').hidden = false; $('d-exam').value = ''; $('d-exam').focus(); });
    $('d-exam').addEventListener('change', () => {
        const d = deckById(openId), err = $('d-exam-err'); if (!d) return;
        const n = C.dayOfISO($('d-exam').value);
        err.textContent = '';
        if (n == null) { if ($('d-exam').value) err.textContent = 'Pick a real date.'; return; }
        if (n <= today) { err.textContent = 'Pick a day after today.'; return; }
        if (n > today + 3650) { err.textContent = 'Pick a day within the next 10 years.'; return; }
        d.exam = n; save(); render();
    });
    $('d-exam-del').addEventListener('click', () => {
        const d = deckById(openId); if (!d) return;
        d.exam = null; $('d-exam-err').textContent = ''; save(); render(); $('d-exam-add').focus();
    });
    function mailHref(d) {
        let body = d.name + '\n\n', n = 0;
        for (const c of d.cards) { const line = c.f + ' - ' + c.b + '\n'; if (encodeURIComponent(body + line).length > 1700) break; body += line; n++; }
        if (n < d.cards.length) body += '\n(First ' + n + ' of ' + d.cards.length + ' cards. Use Save as CSV to send all of them.)\n';
        body += '\nPaste these lines into Spaced Repetition Flashcards for Exams: https://umar8092.github.io/apps/' + SLUG + '/\n';
        return 'mailto:?subject=' + encodeURIComponent('Flashcards: ' + d.name) + '&body=' + encodeURIComponent(body);
    }
    $('d-mail').addEventListener('click', ev => { if ($('d-mail').getAttribute('aria-disabled') === 'true') ev.preventDefault(); });
    $('d-copy').addEventListener('click', () => {
        const d = deckById(openId); if (!d) return;
        const t = C.toText(d);
        const done = () => { $('d-msg').textContent = 'Copied ' + C.plural(d.cards.length, 'card') + ' (front and back separated by a tab).'; };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done, () => fallbackCopy(t, done)); else fallbackCopy(t, done);
    });
    function fallbackCopy(t, done) {
        const ta = el('textarea'); ta.value = t; ta.style.position = 'absolute'; ta.style.left = '-9999px'; document.body.appendChild(ta); ta.select();
        let ok = false; try { ok = document.execCommand('copy'); } catch (e) {}
        ta.remove();
        if (ok) done(); else $('d-msg').textContent = 'Copying was blocked. Use Save as CSV instead.';
    }
    function download(name, text, type) {
        const a = el('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name;
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }
    const fileName = s => (s.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 40) || 'deck');
    $('d-csv').addEventListener('click', () => {
        const d = deckById(openId); if (!d) return;
        download(fileName(d.name) + '.csv', '﻿' + C.toCSV(d), 'text/csv');
        $('d-msg').textContent = 'Saved ' + fileName(d.name) + '.csv with ' + C.plural(d.cards.length, 'card') + '.';
    });
    $('d-print').addEventListener('click', () => {
        const d = deckById(openId); if (!d) return;
        const pa = $('print-area'); pa.textContent = '';
        pa.appendChild(el('h1', null, d.name));
        const t = el('table'), hr = el('tr'); hr.append(el('th', null, 'Front'), el('th', null, 'Back')); t.appendChild(hr);
        d.cards.forEach(c => { const tr = el('tr'); tr.append(el('td', null, c.f), el('td', null, c.b)); t.appendChild(tr); });
        pa.appendChild(t); window.print();
    });
    $('d-reset').addEventListener('click', () => {
        const d = deckById(openId); if (!d || !d.cards.length) return;
        const snap = snapshot();
        d.cards.forEach(c => { c.s = C.newSched(); c.r = null; }); d.newDay = 0; d.newCount = 0; d.extra = 0;
        endSession(true); save(); render(); toast('All cards in ' + d.name + ' are new again.', snap);
    });
    $('d-del').addEventListener('click', () => {
        const d = deckById(openId); if (!d) return;
        const snap = snapshot();
        state.decks = state.decks.filter(x => x !== d); openId = null;
        endSession(true); save(); render(); toast('Deck ' + d.name + ' deleted (' + C.plural(d.cards.length, 'card') + ').', snap);
        $('decks-h').scrollIntoView({ block: 'start' });
    });
    $('dk-close').addEventListener('click', () => { const id = openId; openId = null; render(); const b = [...$('dlist').querySelectorAll('.dbox')][state.decks.findIndex(d => d.id === id)]; if (b) { b.scrollIntoView({ block: 'center' }); b.querySelector('.secondary').focus({ preventScroll: true }); } });
    $('search').addEventListener('input', () => { search = $('search').value; shown = 50; const d = deckById(openId); if (d) renderCardList(d); });
    $('cmore').addEventListener('click', () => { shown += 50; renderDeck(); });

    // ---- studying
    function startSession(deckIds) {
        const decks = deckIds.map(deckById).filter(Boolean);
        const queue = C.buildQueue(decks, today);
        if (!queue.length) { render(); return; }
        sess = { decks: deckIds, queue, done: 0, size: queue.length, undo: [], showing: false };
        $('study').hidden = false; $('st-run').hidden = false; $('st-done').hidden = true; $('st-edit').hidden = true;
        renderCard(); renderToday();
        $('show').focus({ preventScroll: true });
        $('study').scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
    function current() {
        while (sess && sess.queue.length && !cardOf(sess.queue[0])) sess.queue.shift();
        return sess && sess.queue[0];
    }
    function schedOf(q) { const c = cardOf(q); return q.dir === 'r' ? (c.r || C.newSched()) : c.s; }
    function renderCard() {
        const q = current();
        if (!q) return finishSession();
        const c = cardOf(q), d = deckById(q.deck), s = schedOf(q);
        $('st-deck').textContent = d.name + (q.dir === 'r' ? ' · back to front' : '') + (C.isNew(s) ? ' · new card' : '');
        $('st-left').textContent = C.plural(sess.queue.length, 'card') + ' left';
        $('st-bar').style.width = Math.round(100 * sess.done / Math.max(1, sess.done + sess.queue.length)) + '%';
        $('q-tag').textContent = q.dir === 'r' ? 'Answer (say the question)' : 'Question';
        const qt = q.dir === 'r' ? c.b : c.f, at = q.dir === 'r' ? c.f : c.b;
        $('q').textContent = qt; $('a').textContent = at;
        $('q').classList.toggle('long', qt.length > 140); $('a').classList.toggle('long', at.length > 140);
        $('a-wrap').hidden = !sess.showing; $('show').hidden = sess.showing; $('grades').hidden = !sess.showing;
        const pv = C.preview(s, today, d.exam);
        [1, 2, 3, 4].forEach(g => { $('g' + g).textContent = pv[g - 1]; });
        const capped = d.exam != null && C.answer(s, 4, today, d.exam).s.ivl < C.answer(s, 4, today, null).s.ivl;
        $('cap-note').hidden = !capped;
        $('cap-note').textContent = capped ? 'Your exam is ' + C.fmtDay(d.exam) + ', so this card comes back by ' + C.fmtDay(Math.max(today + 1, d.exam - 1)) + ' at the latest.' : '';
        $('st-undo').disabled = !sess.undo.length;
    }
    function showAnswer() { if (!sess || sess.showing || !$('st-edit').hidden) return; sess.showing = true; renderCard(); $('grades').querySelector('.g3').focus({ preventScroll: true }); }
    function grade(g) {
        const q = current(); if (!q || !sess.showing) return;
        const c = cardOf(q), d = deckById(q.deck), s = schedOf(q);
        sess.undo.push({ q, s: Object.assign({}, s), hadR: !!c.r, nd: [d.newDay, d.newCount, d.extra], log: state.log[today] || 0, queue: sess.queue.slice(), done: sess.done });
        if (sess.undo.length > 50) sess.undo.shift();
        if (C.isNew(s)) { if (d.newDay !== today) { d.newDay = today; d.newCount = 0; d.extra = 0; } d.newCount++; }
        const r = C.answer(s, g, today, d.exam);
        if (q.dir === 'r') c.r = r.s; else c.s = r.s;
        state.log[today] = (state.log[today] || 0) + 1;
        sess.queue.shift(); sess.done++;
        if (r.requeue) sess.queue.splice(Math.min(r.requeue, sess.queue.length), 0, q);
        sess.showing = false;
        save(); renderCard(); renderToday(); renderDecks(); renderDeck();
        if (!$('st-run').hidden) $('show').focus({ preventScroll: true });
    }
    $('show').addEventListener('click', showAnswer);
    $('grades').addEventListener('click', ev => { const b = ev.target.closest('button[data-g]'); if (b) grade(+b.dataset.g); });
    $('st-undo').addEventListener('click', () => {
        const u = sess && sess.undo.pop(); if (!u) return;
        const c = cardOf(u.q), d = deckById(u.q.deck);
        if (c && d) {
            if (u.q.dir === 'r') c.r = u.hadR ? u.s : null; else c.s = u.s;
            [d.newDay, d.newCount, d.extra] = u.nd;
        }
        if (u.log) state.log[today] = u.log; else delete state.log[today];
        sess.queue = u.queue; sess.done = u.done; sess.showing = false;
        $('st-run').hidden = false; $('st-done').hidden = true;
        save(); render(); renderCard(); $('show').focus({ preventScroll: true });
    });
    $('st-editbtn').addEventListener('click', () => {
        const q = current(); if (!q) return;
        const c = cardOf(q);
        $('st-ef').value = c.f; $('st-eb').value = c.b; $('st-eerr').textContent = '';
        $('st-edit').hidden = false; $('face').hidden = true; $('show').hidden = true; $('grades').hidden = true;
        $('st-ef').focus();
    });
    function closeStudyEdit() { $('st-edit').hidden = true; $('face').hidden = false; renderCard(); }
    $('st-ecancel').addEventListener('click', closeStudyEdit);
    $('st-edit').addEventListener('submit', ev => {
        ev.preventDefault();
        const q = current(); if (!q) return;
        const r = setText(deckById(q.deck), cardOf(q), $('st-ef').value, $('st-eb').value);
        if (r) { $('st-eerr').textContent = r; return; }
        save(); closeStudyEdit(); renderDeck(); toast('Card saved.');
    });
    [$('st-ef'), $('st-eb')].forEach(t => t.addEventListener('keydown', ev => {
        if (ev.key === 'Escape') { ev.preventDefault(); closeStudyEdit(); }
        else if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); $('st-edit').requestSubmit(); }
    }));
    $('st-stop').addEventListener('click', () => {
        const n = sess ? sess.done : 0;
        endSession(); render();
        toast(n ? 'Stopped. Your ' + C.plural(n, 'answer') + ' are saved.' : 'Stopped.');
        $('today').scrollIntoView({ block: 'start' });
    });
    function finishSession() {
        $('st-run').hidden = true; $('st-done').hidden = false;
        const decks = sess.decks.map(deckById).filter(Boolean);
        const anyDue = decks.some(d => C.deckCounts(d, today).total > 0);
        $('done-h').textContent = anyDue ? 'Session finished' : 'Done for today';
        $('done-sub').textContent = 'You answered ' + C.plural(sess.done, 'card') + '. ' + nextText();
        const fresh = decks.reduce((n, d) => n + C.deckCounts(d, today).newLeft, 0), more = $('more-new');
        more.hidden = !fresh || anyDue;
        more.textContent = 'Learn ' + Math.min(10, fresh) + ' more new cards today';
        $('done-h').focus({ preventScroll: true });
    }
    $('more-new').addEventListener('click', () => {
        if (!sess) return;
        let left = 10;
        sess.decks.map(deckById).filter(Boolean).forEach(d => {
            const c = C.deckCounts(d, today); if (!left || !c.newLeft) return;
            const k = Math.min(left, c.newLeft);
            if (d.newDay !== today) { d.newDay = today; d.newCount = 0; d.extra = 0; }
            d.extra += Math.max(0, d.newCount - d.newPerDay - d.extra) + k; left -= k;
        });
        save(); startSession(sess.decks);
    });
    $('done-close').addEventListener('click', () => { endSession(); render(); $('today').scrollIntoView({ block: 'start' }); });
    function endSession() { sess = null; $('study').hidden = true; $('st-edit').hidden = true; $('face').hidden = false; renderToday(); }
    function dropFromSession(cardId) { if (sess) { sess.queue = sess.queue.filter(q => q.card !== cardId); sess.undo = sess.undo.filter(u => u.q.card !== cardId); if (!$('study').hidden && !$('st-run').hidden) renderCard(); } }
    $('study-all').addEventListener('click', () => startSession(state.decks.map(d => d.id)));
    document.addEventListener('keydown', ev => {
        if (!sess || $('study').hidden || $('st-run').hidden || !$('st-edit').hidden || ev.ctrlKey || ev.metaKey || ev.altKey) return;
        const t = ev.target, tag = t && t.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.closest && t.closest('dialog'))) return;
        if ((ev.key === ' ' || ev.key === 'Enter') && (tag === 'BUTTON' || tag === 'A' || tag === 'SUMMARY')) return;
        if (!sess.showing && (ev.key === ' ' || ev.key === 'Enter')) { ev.preventDefault(); showAnswer(); }
        else if (sess.showing && /^[1-4]$/.test(ev.key)) { ev.preventDefault(); grade(+ev.key); }
    });

    // ---- backup
    $('export').addEventListener('click', () => {
        const stamp = C.isoOf(today);
        download('flashcards-backup-' + stamp + '.json', JSON.stringify(Object.assign({ app: SLUG }, state), null, 1), 'application/json');
        $('tools-msg').textContent = 'Saved flashcards-backup-' + stamp + '.json with ' + C.plural(state.decks.length, 'deck') + ' and ' + C.plural(totalCards(), 'card') + '.';
    });
    $('import').addEventListener('click', () => $('import-file').click());
    $('import-file').addEventListener('change', () => {
        const f = $('import-file').files[0]; $('import-file').value = '';
        if (!f) return;
        if (f.size > 20e6) { $('tools-msg').textContent = 'That file is too big to be a backup from this app.'; return; }
        f.text().then(t => {
            let raw; try { raw = JSON.parse(t); } catch (e) { raw = null; }
            if (!raw || !Array.isArray(raw.decks)) { $('tools-msg').textContent = 'That file is not a backup from this app. Nothing was changed.'; return; }
            const n = C.normalize(raw);
            if (!n.decks.length) { $('tools-msg').textContent = 'That backup has no decks. Nothing was changed.'; return; }
            const snap = snapshot();
            state = n; openId = null; endSession(true); save(); render();
            $('tools-msg').textContent = '';
            toast('Loaded ' + C.plural(n.decks.length, 'deck') + ' and ' + C.plural(totalCards(), 'card') + '.', snap);
        }).catch(() => { $('tools-msg').textContent = 'That file could not be read.'; });
    });
    $('wipe').addEventListener('click', () => {
        if (!state.decks.length && !Object.keys(state.log).length) { $('tools-msg').textContent = 'There is nothing to delete.'; return; }
        const snap = snapshot();
        state = C.normalize(null); openId = null; endSession(true); save(); render();
        $('tools-msg').textContent = '';
        toast('Everything deleted.', snap);
    });

    // ---- drawing
    function render() {
        renderToday(); renderDecks(); renderDeck();
        $('save-warn').hidden = saveOK;
    }
    function tick() {
        const t = C.dayOfDate(new Date());
        if (t !== today) { today = t; render(); if (sess && !$('st-run').hidden) renderCard(); }
    }
    setInterval(tick, 60000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
    window.addEventListener('storage', ev => { if (ev.key === KEY && !sess) { load(); if (openId && !deckById(openId)) openId = null; render(); } });

    load(); save(); render();
    if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
