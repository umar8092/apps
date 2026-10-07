(() => {
    const $ = id => document.getElementById(id);
    const KEY = 'offlinetodo.tasks';
    const PRIORITY_NAMES = ['Low', 'Normal', 'High'];
    const EMPTY_TEXT = {
        all: 'Nothing here yet. Add your first task above.',
        active: 'Nothing left to do. Nice work.',
        done: 'No completed tasks yet.'
    };

    // ----- storage (can be blocked in private windows, so every call is guarded) -----
    function warnStorage() { $('storage-warning').hidden = false; }
    function readStore() { try { return localStorage.getItem(KEY); } catch (e) { warnStorage(); return null; } }
    function writeStore(value) { try { localStorage.setItem(KEY, value); } catch (e) { warnStorage(); } }

    function load() {
        const raw = readStore();
        if (!raw) return [];
        try { return TodoCore.parseImport(raw).tasks; } catch (e) {
            // never silently throw away data we could not read: keep a copy before the next save overwrites it
            try { localStorage.setItem(KEY + '.unreadable-backup', raw); } catch (err) { /* nothing more to do */ }
            return [];
        }
    }

    let tasks = load();
    let filter = 'all', query = '', editingId = null, dragId = null, toastTimer = null;

    const save = () => writeStore(JSON.stringify(tasks));

    // ----- toast with optional undo -----
    function toast(message, onUndo) {
        clearTimeout(toastTimer);
        $('toast-text').textContent = message;
        const undo = $('toast-undo');
        undo.hidden = !onUndo;
        undo.onclick = onUndo ? () => { hideToast(); onUndo(); } : null;
        $('toast').hidden = false;
        toastTimer = setTimeout(hideToast, 6000);
    }
    function hideToast() { clearTimeout(toastTimer); $('toast').hidden = true; }

    // run a change to the list; offer Undo when a message is given
    function change(fn, message) {
        const before = tasks;
        tasks = fn(tasks);
        save();
        render();
        if (message) toast(message, () => { tasks = before; save(); render(); });
    }

    // ----- rendering (all text goes in as text, never as HTML) -----
    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function iconButton(symbol, label, onClick, disabled) {
        const b = el('button', '', symbol);
        b.type = 'button';
        b.setAttribute('aria-label', label);
        b.disabled = !!disabled;
        b.addEventListener('click', onClick);
        return b;
    }

    function focusRow(id, selector) {
        const row = $('list').querySelector(`[data-id="${CSS.escape(id)}"]`);
        const target = row && (row.querySelector(selector + ':not(:disabled)') || row.querySelector('.actions button:not(:disabled)'));
        if (target) target.focus();
    }

    function row(t, shown, index) {
        const li = el('li', `task p${t.priority}${t.done ? ' done' : ''}`);
        li.dataset.id = t.id;
        li.draggable = editingId !== t.id;

        const box = document.createElement('input');
        box.type = 'checkbox';
        box.checked = t.done;
        box.setAttribute('aria-label', 'Done: ' + t.text);
        box.addEventListener('change', () => change(list => list.map(x => x.id === t.id ? { ...x, done: box.checked } : x)));

        const body = el('div', 'body');
        if (editingId === t.id) {
            const input = el('input', 'edit-input');
            input.type = 'text';
            input.maxLength = TodoCore.MAX_TEXT;
            input.value = t.text;
            input.setAttribute('aria-label', 'Edit task');
            let finished = false;
            const finish = (keep, refocus) => {
                if (finished) return;
                finished = true;
                editingId = null;
                const value = input.value.trim();
                if (keep && value && value !== t.text) {
                    tasks = tasks.map(x => x.id === t.id ? { ...x, text: value } : x);
                    save();
                }
                render();
                if (refocus) focusRow(t.id, '.edit');   // only after the keyboard; clicking elsewhere must not steal focus
            };
            input.addEventListener('keydown', e => {
                if (e.key === 'Enter') { e.preventDefault(); finish(true, true); }   // preventDefault stops the key press landing on the button we focus next
                else if (e.key === 'Escape') finish(false, true);
            });
            input.addEventListener('blur', () => finish(true));
            body.append(input);
            queueMicrotask(() => { input.focus(); input.select(); });
        } else {
            body.append(el('div', 'text', t.text));
        }

        const meta = el('div', 'meta');
        const due = TodoCore.dueInfo(t.due);
        if (due.label) meta.append(el('span', 'tag ' + due.state, due.label));
        if (t.priority !== 1) meta.append(el('span', 'tag ' + (t.priority === 2 ? 'high' : 'low'), PRIORITY_NAMES[t.priority] + ' priority'));
        if (meta.children.length) body.append(meta);

        const actions = el('div', 'actions');
        const edit = iconButton('✎', 'Edit task: ' + t.text, () => { editingId = t.id; render(); });
        edit.classList.add('edit');
        const up = iconButton('↑', 'Move up: ' + t.text, () => { move(t, shown[index - 1], false, '.up'); }, index === 0);
        up.classList.add('up');
        const down = iconButton('↓', 'Move down: ' + t.text, () => { move(t, shown[index + 1], true, '.down'); }, index === shown.length - 1);
        down.classList.add('down');
        const del = iconButton('✕', 'Delete task: ' + t.text, () => change(list => list.filter(x => x.id !== t.id), 'Task deleted'));
        actions.append(edit, up, down, del);

        li.append(box, body, actions);

        // drag and drop to reorder (desktop). The arrow buttons do the same on touch screens.
        li.addEventListener('dragstart', e => {
            dragId = t.id;
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', t.id);
            li.classList.add('dragging');
        });
        li.addEventListener('dragend', () => { dragId = null; li.classList.remove('dragging'); });
        li.addEventListener('dragover', e => { if (dragId && dragId !== t.id) e.preventDefault(); });
        li.addEventListener('drop', e => {
            e.preventDefault();
            if (!dragId || dragId === t.id) return;
            const from = tasks.findIndex(x => x.id === dragId), to = tasks.findIndex(x => x.id === t.id);
            tasks = TodoCore.place(tasks, dragId, t.id, from < to);
            save();
            render();
        });
        return li;
    }

    function move(task, neighbor, after, selector) {
        if (!neighbor) return;
        tasks = TodoCore.place(tasks, task.id, neighbor.id, after);
        save();
        render();
        focusRow(task.id, selector);
    }

    function render() {
        const shown = TodoCore.visible(tasks, filter, query);
        $('list').replaceChildren(...shown.map((t, i) => row(t, shown, i)));

        const empty = $('empty');
        empty.hidden = shown.length > 0;
        if (!shown.length) empty.textContent = query.trim() ? 'No tasks match your search.' : (tasks.length || filter === 'all' ? EMPTY_TEXT[filter] : EMPTY_TEXT.all);

        const c = TodoCore.counts(tasks);
        $('left').textContent = c.active === 1 ? '1 task left' : c.active + ' tasks left';
        $('clear-done').disabled = c.done === 0;
    }

    // ----- add -----
    $('add-form').addEventListener('submit', e => {
        e.preventDefault();
        const text = $('new-text').value.trim();
        if (!text) return;
        const task = TodoCore.normalizeTask({ text, due: $('new-due').value, priority: +$('new-priority').value, created: Date.now() });
        if (filter === 'done') setFilter('all');
        change(list => [...list, task]);
        $('new-text').value = '';
        $('new-due').value = '';
        $('new-priority').value = '1';
        $('new-text').focus();
    });

    // ----- filters, search, clear -----
    function setFilter(value) {
        filter = value;
        document.querySelectorAll('#filters button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.filter === value)));
        render();
    }
    document.querySelectorAll('#filters button').forEach(b => b.addEventListener('click', () => setFilter(b.dataset.filter)));
    $('search').addEventListener('input', e => { query = e.target.value; render(); });
    $('sort-due').addEventListener('click', () => {
        const sorted = TodoCore.sortByDue(tasks);
        if (sorted.every((t, i) => t === tasks[i])) return toast('Already sorted by due date');
        change(() => sorted, 'Sorted by due date');
    });
    $('clear-done').addEventListener('click', () => {
        const n = TodoCore.counts(tasks).done;
        if (n) change(list => list.filter(t => !t.done), `Cleared ${n} completed task${n === 1 ? '' : 's'}`);
    });
    document.addEventListener('keydown', e => {
        if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) {
            e.preventDefault();
            $('search').focus();
        }
    });

    // ----- copy and share the list as a checklist (whatever the filter and search are showing) -----
    async function copyText(text) {
        try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* fall back below */ }
        const box = el('textarea');          // older browsers, or pages the browser will not give clipboard access
        box.value = text;
        box.setAttribute('readonly', '');
        box.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
        document.body.append(box);
        box.select();
        let ok = false;
        try { ok = document.execCommand('copy'); } catch (e) { /* ok stays false */ }
        box.remove();
        return ok;
    }
    const checklist = () => TodoCore.toChecklist(TodoCore.visible(tasks, filter, query));
    $('copy').addEventListener('click', async () => {
        const text = checklist();
        if (!text) return toast('Nothing to copy.');
        const n = text.split('\n').length;
        toast(await copyText(text) ? `Copied ${n} task${n === 1 ? '' : 's'} as a checklist.` : 'Could not copy. Your browser blocked it.');
    });
    if (navigator.share) {
        $('share').hidden = false;
        $('share').addEventListener('click', async () => {
            const text = checklist();
            if (!text) return toast('Nothing to share.');
            try { await navigator.share({ title: 'My to-do list', text }); }
            catch (e) { if (e.name !== 'AbortError') toast('Could not share.'); }   // closing the share sheet is not an error
        });
    }

    // ----- backup -----
    $('export').addEventListener('click', () => {
        if (!tasks.length) return toast('Nothing to export yet.');
        const url = URL.createObjectURL(new Blob([TodoCore.exportJSON(tasks)], { type: 'application/json' }));
        const link = el('a');
        link.href = url;
        link.download = `offlinetodo-backup-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        toast(`Exported ${tasks.length} task${tasks.length === 1 ? '' : 's'}.`);
    });
    $('import-btn').addEventListener('click', () => $('import-file').click());
    $('import-file').addEventListener('change', async e => {
        const file = e.target.files[0];
        e.target.value = '';           // so choosing the same file again still works
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) return toast('That file is too big to be a backup.');
        try {
            const { tasks: incoming, skipped } = TodoCore.parseImport(await file.text());
            if (tasks.length && !confirm(`Replace your ${tasks.length} current task${tasks.length === 1 ? '' : 's'} with ${incoming.length} from this file?`)) return;
            change(() => incoming, `Imported ${incoming.length} task${incoming.length === 1 ? '' : 's'}` + (skipped ? ` (${skipped} skipped)` : '') + '.');
        } catch (err) {
            toast(err.message);
        }
    });

    // ----- offline status and install -----
    let offlineReady = false;
    function updatePill() {
        const pill = $('pill');
        if (!navigator.onLine) { pill.textContent = "You're offline. Everything still works."; pill.className = 'pill ok'; }
        else if (offlineReady) { pill.textContent = 'Ready to work offline'; pill.className = 'pill ok'; }
        else { pill.textContent = 'Saved on this device'; pill.className = 'pill'; }
    }
    window.addEventListener('online', updatePill);
    window.addEventListener('offline', updatePill);
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) {
        navigator.serviceWorker.register('sw.js')
            .then(() => navigator.serviceWorker.ready)
            .then(() => { offlineReady = true; updatePill(); })
            .catch(() => { /* the app still works online without it */ });
    }

    render();
    updatePill();
})();
