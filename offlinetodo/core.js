// The logic behind OfflineTodo, with no page code in it so it can be tested on its own (see test.html).
(function (root) {
    const MAX_TEXT = 500;
    const MAX_TASKS = 5000;

    function uid() {
        return (root.crypto && root.crypto.randomUUID)
            ? root.crypto.randomUUID()
            : 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    }

    // Returns a clean task, or null if the input is not a usable task.
    // Used for saved data and for imported files, so nothing odd can get into the list.
    function normalizeTask(t) {
        if (!t || typeof t !== 'object' || typeof t.text !== 'string') return null;
        const text = t.text.trim().slice(0, MAX_TEXT);
        if (!text) return null;
        const due = typeof t.due === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t.due) && !isNaN(Date.parse(t.due)) ? t.due : '';
        return {
            id: typeof t.id === 'string' && t.id ? t.id.slice(0, 64) : uid(),
            text,
            done: t.done === true,
            due,
            priority: [0, 1, 2].includes(t.priority) ? t.priority : 1,   // 0 low, 1 normal, 2 high
            created: Number.isFinite(t.created) ? t.created : Date.now()
        };
    }

    function normalizeList(arr) {
        const seen = new Set(), out = [];
        let skipped = 0;
        for (const raw of arr.slice(0, MAX_TASKS)) {
            const t = normalizeTask(raw);
            if (!t) { skipped++; continue; }
            if (seen.has(t.id)) t.id = uid();
            seen.add(t.id);
            out.push(t);
        }
        return { tasks: out, skipped: skipped + Math.max(0, arr.length - MAX_TASKS) };
    }

    // Reads the text of a backup file. Throws an Error with a plain message when it is not a valid backup.
    function parseImport(text) {
        let data;
        try { data = JSON.parse(text); } catch (e) { throw new Error('That file is not valid JSON.'); }
        const arr = Array.isArray(data) ? data : (data && Array.isArray(data.tasks) ? data.tasks : null);
        if (!arr) throw new Error('That file is not an OfflineTodo backup.');
        const result = normalizeList(arr);
        if (arr.length && !result.tasks.length) throw new Error('No valid tasks were found in that file.');
        return result;
    }

    function exportJSON(tasks) {
        return JSON.stringify({ app: 'OfflineTodo', version: 1, exported: new Date().toISOString(), tasks }, null, 2);
    }

    // How a due date should read, and which style it gets.
    function dueInfo(due, now) {
        if (!due) return { label: '', state: '' };
        const today = new Date((now || new Date()).getFullYear(), (now || new Date()).getMonth(), (now || new Date()).getDate());
        const [y, m, d] = due.split('-').map(Number);
        const days = Math.round((new Date(y, m - 1, d) - today) / 86400000);
        if (days < 0) return { label: 'Overdue ' + -days + (days === -1 ? ' day' : ' days'), state: 'overdue' };
        if (days === 0) return { label: 'Due today', state: 'today' };
        if (days === 1) return { label: 'Due tomorrow', state: 'soon' };
        if (days <= 6) return { label: 'Due in ' + days + ' days', state: 'soon' };
        return { label: 'Due ' + new Date(y, m - 1, d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }), state: 'later' };
    }

    // Moves one task next to another (before it, or after it). Returns a new list.
    function place(list, id, neighborId, after) {
        const item = list.find(t => t.id === id);
        const rest = list.filter(t => t.id !== id);
        const at = rest.findIndex(t => t.id === neighborId);
        if (!item || at < 0) return list;
        rest.splice(at + (after ? 1 : 0), 0, item);
        return rest;
    }

    // Most urgent first: soonest due date (no date goes last), then high priority first. Ties keep their order. Done tasks go to the end.
    function sortByDue(list) {
        const at = new Map(list.map((t, i) => [t.id, i]));
        const key = t => [t.done ? 1 : 0, t.due || '9999-99-99', -t.priority, at.get(t.id)];
        return list.slice().sort((a, b) => { const x = key(a), y = key(b); for (let i = 0; i < 4; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1; return 0; });
    }

    function visible(list, filter, query) {
        const q = (query || '').trim().toLowerCase();
        return list.filter(t =>
            (filter === 'all' || (filter === 'done') === t.done) &&
            (!q || t.text.toLowerCase().includes(q)));
    }

    function counts(list) {
        const done = list.filter(t => t.done).length;
        return { done, active: list.length - done };
    }

    // A plain-text checklist, one task per line. Pastes into Notes, Keep, Notion, Obsidian and most other apps.
    function toChecklist(list) {
        return list.map(t => {
            const extra = [];
            if (t.due) extra.push('due ' + t.due);
            if (t.priority === 2) extra.push('high priority');
            if (t.priority === 0) extra.push('low priority');
            return '- [' + (t.done ? 'x' : ' ') + '] ' + t.text.replace(/\s*[\r\n]+\s*/g, ' ') + (extra.length ? ' (' + extra.join(', ') + ')' : '');
        }).join('\n');
    }

    root.TodoCore = { MAX_TEXT, uid, normalizeTask, parseImport, exportJSON, toChecklist, dueInfo, place, sortByDue, visible, counts };
})(window);
