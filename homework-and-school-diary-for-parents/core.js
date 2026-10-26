// Homework and School Diary for Parents: the logic, with no page code, so tests.js can check it.
// Dates are plain 'YYYY-MM-DD' strings in the device's own calendar; day maths uses whole UTC days, so there are no time zone or clock-change slips.
(function (root) {
    'use strict';
    var DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var DAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var TYPES = { homework: 'Homework', test: 'Test', project: 'Project', reminder: 'Reminder' };
    var LIMITS = { name: 40, cls: 40, subject: 40, text: 600, label: 40, subjects: 20, holidays: 30, children: 12, items: 3000, pasteLines: 30 };
    var DEFAULT_DAYS = [1, 2, 3, 4, 5];

    function pad(n) { return (n < 10 ? '0' : '') + n; }
    function isIso(s) {
        if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
        var y = +s.slice(0, 4), m = +s.slice(5, 7), d = +s.slice(8, 10);
        if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1) return false;
        return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
    }
    function dayNum(iso) { return Math.round(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000); }
    function fromNum(n) { var d = new Date(n * 86400000); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
    function addDays(iso, n) { return fromNum(dayNum(iso) + n); }
    function diff(a, b) { return dayNum(b) - dayNum(a); }  // days from a to b
    function weekday(iso) { return new Date(dayNum(iso) * 86400000).getUTCDay(); }
    function todayIso(now) { var d = now || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
    function fmt(iso, year) {
        var s = DAY_SHORT[weekday(iso)] + ' ' + (+iso.slice(8, 10)) + ' ' + MON[+iso.slice(5, 7) - 1];
        return year ? s + ' ' + iso.slice(0, 4) : s;
    }
    function fmtLong(iso) { return DAY_LONG[weekday(iso)] + ' ' + (+iso.slice(8, 10)) + ' ' + MON[+iso.slice(5, 7) - 1]; }
    // "today", "tomorrow", "in 4 days", "yesterday", "3 days late"
    function rel(iso, today) {
        var n = diff(today, iso);
        if (n === 0) return 'today';
        if (n === 1) return 'tomorrow';
        if (n === -1) return '1 day late';
        if (n < 0) return (-n) + ' days late';
        return 'in ' + n + ' days';
    }
    function daysText(days) {
        var d = (days || []).slice().sort(function (a, b) { return ((a + 6) % 7) - ((b + 6) % 7); });  // Monday first
        if (!d.length) return 'no school days set';
        var key = d.join(',');
        if (key === '1,2,3,4,5') return 'Mon to Fri';
        if (key === '1,2,3,4,5,6') return 'Mon to Sat';
        if (key === '1,2,3,4,0') return 'Sun to Thu';
        if (key === '1,2,3,4,6,0') return 'Sat to Thu';
        return d.map(function (x) { return DAY_SHORT[x]; }).join(', ');
    }

    function inHoliday(child, iso) {
        return (child.holidays || []).some(function (h) { return iso >= h.from && iso <= h.to; });
    }
    function holidayOn(child, iso) {
        var h = (child.holidays || []).filter(function (x) { return iso >= x.from && iso <= x.to; })[0];
        return h || null;
    }
    function isSchoolDay(child, iso) { return (child.days || []).indexOf(weekday(iso)) >= 0 && !inHoliday(child, iso); }
    // The first school day after the given day. Null when there is none in the next 400 days (no school days ticked).
    function nextSchoolDay(child, iso) {
        for (var i = 1; i <= 400; i++) { var d = addDays(iso, i); if (isSchoolDay(child, d)) return d; }
        return null;
    }

    // Every date an item falls on between from and to (both included), with whether it was ticked done for that date.
    function occurrences(item, from, to) {
        var out = [];
        if (item.repeat === 'weekly') {
            var start = item.due, n = diff(start, from), k = n > 0 ? Math.ceil(n / 7) : 0;
            for (var d = addDays(start, k * 7); d <= to; d = addDays(d, 7)) {
                if (item.until && d > item.until) break;
                out.push({ item: item, date: d, done: (item.doneDates || []).indexOf(d) >= 0 });
            }
        } else if (item.due >= from && item.due <= to) {
            out.push({ item: item, date: item.due, done: !!item.doneOn });
        }
        return out;
    }
    function isDone(item, date) { return item.repeat === 'weekly' ? (item.doneDates || []).indexOf(date) >= 0 : !!item.doneOn; }

    var TYPE_ORDER = { test: 0, project: 1, homework: 2, reminder: 3 };
    function byDate(a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : (TYPE_ORDER[a.item.type] - TYPE_ORDER[b.item.type]) || (a.item.created - b.item.created); }

    // What one child has left to do. Weekly items never pile up as late: only their dates from today on are shown.
    function childPlan(state, child, today) {
        var items = state.items.filter(function (it) { return it.childId === child.id; });
        var late = [], open = [], done = [];
        items.forEach(function (it) {
            if (it.repeat === 'weekly') {
                occurrences(it, today, addDays(today, 6)).forEach(function (o) { if (!o.done) open.push(o); });
            } else if (it.doneOn) {
                done.push({ item: it, date: it.due, done: true });
            } else if (it.due < today) {
                late.push({ item: it, date: it.due, done: false });
            } else {
                open.push({ item: it, date: it.due, done: false });
            }
        });
        late.sort(byDate); open.sort(byDate);
        done.sort(function (a, b) { return a.item.doneOn < b.item.doneOn ? 1 : a.item.doneOn > b.item.doneOn ? -1 : b.item.created - a.item.created; });
        return { late: late, open: open, done: done };
    }

    // The evening check: for each child, what is late, what is still due today, what is due on the next school day,
    // and tests or projects coming up in the week after it.
    function tonight(state, today) {
        return state.children.map(function (child) {
            var next = nextSchoolDay(child, today);
            var items = state.items.filter(function (it) { return it.childId === child.id; });
            var late = [], dueToday = [], forNext = [], soon = [];
            var nextEnd = next || today, soonEnd = addDays(nextEnd, 7);
            items.forEach(function (it) {
                if (it.repeat !== 'weekly' && !it.doneOn && it.due < today) late.push({ item: it, date: it.due, done: false });
                occurrences(it, today, soonEnd).forEach(function (o) {
                    if (o.date === today) { if (!o.done) dueToday.push(o); }
                    else if (o.date <= nextEnd) forNext.push(o);
                    else if (!o.done && (it.type === 'test' || it.type === 'project')) soon.push(o);
                });
            });
            [late, dueToday, forNext, soon].forEach(function (l) { l.sort(byDate); });
            var left = forNext.filter(function (o) { return !o.done; }).length;
            // a holiday between tonight and the next school day (a Friday before a break counts too)
            var holiday = null;
            for (var d = addDays(today, 1); !holiday && d < (next || addDays(today, 2)) && diff(today, d) <= 400; d = addDays(d, 1)) holiday = holidayOn(child, d);
            return { child: child, next: next, holiday: holiday, late: late, dueToday: dueToday, forNext: forNext, soon: soon, left: left };
        });
    }

    // Monday to Sunday of the week that holds iso.
    function weekStart(iso) { return addDays(iso, -((weekday(iso) + 6) % 7)); }
    function week(state, startIso) {
        var end = addDays(startIso, 6), days = [];
        for (var i = 0; i < 7; i++) days.push({ date: addDays(startIso, i), entries: [] });
        state.items.forEach(function (it) {
            var child = findChild(state, it.childId); if (!child) return;
            occurrences(it, startIso, end).forEach(function (o) { o.child = child; days[diff(startIso, o.date)].entries.push(o); });
        });
        days.forEach(function (d) { d.entries.sort(function (a, b) { return state.children.indexOf(a.child) - state.children.indexOf(b.child) || byDate(a, b); }); });
        return days;
    }

    function findChild(state, id) { for (var i = 0; i < state.children.length; i++) if (state.children[i].id === id) return state.children[i]; return null; }

    function itemTitle(it) {
        var t = TYPES[it.type] || 'Homework';
        return it.subject ? it.subject + ' ' + t.toLowerCase() : t;
    }
    function itemLine(o, today) {
        var s = itemTitle(o.item) + (o.item.text ? ': ' + o.item.text.replace(/\s*\n\s*/g, '; ') : '');
        return s;
    }

    // Splits a pasted message like "Eng: learn poem\nMaths: Ex 4.2" into one item per line.
    // A line starts with a subject when the words before the first ':' or ' - ' are short (up to 3 words, 25 letters).
    function splitPaste(text, fallbackSubject) {
        var lines = String(text || '').split(/\r?\n/).map(function (l) { return l.replace(/^\s*(?:[-*•·]|\d{1,2}[.)])\s*/, '').trim(); })
            .filter(function (l) { return l.length > 0; });
        return lines.slice(0, LIMITS.pasteLines).map(function (l) {
            var m = l.match(/^([^:\-–]{1,25}?)\s*(?::|\s[-–]\s)\s*(.+)$/);
            if (m && m[1].trim().split(/\s+/).length <= 3 && !/^\d+$/.test(m[1].trim())) return { subject: m[1].trim().slice(0, LIMITS.subject), text: m[2].trim().slice(0, LIMITS.text) };
            return { subject: (fallbackSubject || '').slice(0, LIMITS.subject), text: l.slice(0, LIMITS.text) };
        });
    }

    // Plain text for Copy, Share and Email.
    function tonightText(state, today) {
        var lines = ['Homework and tests, ' + fmtLong(today) + ' ' + today.slice(0, 4)];
        tonight(state, today).forEach(function (t) {
            var c = t.child;
            lines.push('');
            lines.push(c.name + (c.cls ? ' (' + c.cls + ')' : ''));
            t.late.forEach(function (o) { lines.push('- LATE, was due ' + fmt(o.date) + ': ' + itemLine(o, today)); });
            t.dueToday.forEach(function (o) { lines.push('- Due today, not ticked: ' + itemLine(o, today)); });
            if (!t.next) lines.push(t.holiday ? 'No school: ' + (t.holiday.label || 'holiday') + ' until ' + fmt(t.holiday.to) : 'No school days set.');
            else {
                if (t.holiday) lines.push('No school: ' + (t.holiday.label || 'holiday') + ' until ' + fmt(t.holiday.to) + '.');
                lines.push('For ' + fmt(t.next) + ' (' + rel(t.next, today) + '):');
                if (!t.forNext.length) lines.push('- Nothing written down');
                t.forNext.forEach(function (o) { lines.push('- ' + (o.done ? '[done] ' : '') + itemLine(o, today) + (o.date !== t.next ? ' (due ' + fmt(o.date) + ')' : '')); });
            }
            if (t.soon.length) {
                lines.push('Coming up:');
                t.soon.forEach(function (o) { lines.push('- ' + itemLine(o, today) + ', ' + fmt(o.date) + ' (' + rel(o.date, today) + ')'); });
            }
        });
        return lines.join('\n');
    }

    function weekText(state, startIso) {
        var days = week(state, startIso), lines = ['School week ' + fmt(startIso) + ' to ' + fmt(addDays(startIso, 6), true)];
        days.forEach(function (d) {
            if (!d.entries.length) return;
            lines.push(''); lines.push(fmtLong(d.date));
            d.entries.forEach(function (o) { lines.push('- ' + o.child.name + ': ' + (o.done ? '[done] ' : '') + itemLine(o)); });
        });
        if (lines.length === 1) lines.push('', 'Nothing written down this week.');
        return lines.join('\n');
    }

    // ---- saved state: everything is checked so a broken or edited file can never break the page ----
    function str(v, max) { return typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max) : ''; }
    function cleanChild(c) {
        if (!c || typeof c !== 'object') return null;
        var name = str(c.name, LIMITS.name); if (!name || typeof c.id !== 'string' || !c.id) return null;
        var days = Array.isArray(c.days) ? c.days.filter(function (d, i, a) { return d === (d | 0) && d >= 0 && d <= 6 && a.indexOf(d) === i; }) : DEFAULT_DAYS.slice();
        var subjects = [];
        (Array.isArray(c.subjects) ? c.subjects : []).forEach(function (s) { s = str(s, LIMITS.subject); if (s && subjects.indexOf(s) < 0 && subjects.length < LIMITS.subjects) subjects.push(s); });
        var holidays = (Array.isArray(c.holidays) ? c.holidays : []).filter(function (h) { return h && isIso(h.from) && isIso(h.to); })
            .slice(0, LIMITS.holidays).map(function (h) { return h.from <= h.to ? { from: h.from, to: h.to, label: str(h.label, LIMITS.label) } : { from: h.to, to: h.from, label: str(h.label, LIMITS.label) }; });
        return { id: c.id.slice(0, 40), name: name, cls: str(c.cls, LIMITS.cls), subjects: subjects, days: days, holidays: holidays };
    }
    function cleanItem(it, ids) {
        if (!it || typeof it !== 'object' || typeof it.id !== 'string' || ids.indexOf(it.childId) < 0 || !isIso(it.due)) return null;
        var type = TYPES[it.type] ? it.type : 'homework', text = str(it.text, LIMITS.text), subject = str(it.subject, LIMITS.subject);
        if (!text && !subject) return null;
        var weekly = it.repeat === 'weekly';
        return {
            id: it.id.slice(0, 40), childId: it.childId, type: type, subject: subject, text: text, due: it.due,
            repeat: weekly ? 'weekly' : '', until: weekly && isIso(it.until) ? it.until : '',
            doneOn: !weekly && isIso(it.doneOn) ? it.doneOn : '',
            doneDates: weekly && Array.isArray(it.doneDates) ? it.doneDates.filter(isIso).slice(-200) : [],
            created: typeof it.created === 'number' && isFinite(it.created) ? it.created : 0
        };
    }
    function cleanState(raw) {
        var s = { v: 1, children: [], items: [] };
        if (!raw || typeof raw !== 'object') return s;
        var seen = [];
        (Array.isArray(raw.children) ? raw.children : []).forEach(function (c) {
            c = cleanChild(c); if (c && seen.indexOf(c.id) < 0 && s.children.length < LIMITS.children) { seen.push(c.id); s.children.push(c); }
        });
        var itemIds = [];
        (Array.isArray(raw.items) ? raw.items : []).forEach(function (it) {
            it = cleanItem(it, seen); if (it && itemIds.indexOf(it.id) < 0 && s.items.length < LIMITS.items) { itemIds.push(it.id); s.items.push(it); }
        });
        return s;
    }
    function looksLikeBackup(raw) { return !!raw && typeof raw === 'object' && Array.isArray(raw.children) && Array.isArray(raw.items); }

    var counter = 0;
    function uid() { counter++; return Date.now().toString(36) + counter.toString(36) + Math.random().toString(36).slice(2, 6); }

    root.HW = {
        TYPES: TYPES, LIMITS: LIMITS, DAY_SHORT: DAY_SHORT, DEFAULT_DAYS: DEFAULT_DAYS,
        isIso: isIso, addDays: addDays, diff: diff, weekday: weekday, todayIso: todayIso, fmt: fmt, fmtLong: fmtLong, rel: rel, daysText: daysText,
        isSchoolDay: isSchoolDay, nextSchoolDay: nextSchoolDay, holidayOn: holidayOn, occurrences: occurrences, isDone: isDone,
        childPlan: childPlan, tonight: tonight, weekStart: weekStart, week: week, findChild: findChild, itemTitle: itemTitle, itemLine: itemLine,
        splitPaste: splitPaste, tonightText: tonightText, weekText: weekText, cleanState: cleanState, looksLikeBackup: looksLikeBackup, uid: uid
    };
})(typeof window !== 'undefined' ? window : globalThis);
