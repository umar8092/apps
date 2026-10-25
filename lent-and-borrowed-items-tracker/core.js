// Lent and Borrowed Items Tracker: dates, words and checks, with no page code, so tests.js can check it in node.
// Dates are calendar days ('2026-10-25'), so time zones and summer time never move a loan to another day.
(function (root) {
    'use strict';
    const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const LIMITS = { what: 80, who: 60, note: 300 };
    const DUE_PRESETS = { none: null, w1: 7, w2: 14, m1: 'm1', custom: 'custom' };

    const pad = n => String(n).padStart(2, '0');
    function isDate(s) {
        if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
        const [y, m, d] = s.split('-').map(Number), t = new Date(Date.UTC(y, m - 1, d));
        return y >= 1900 && y <= 2200 && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
    }
    const toUTC = s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
    const fromUTC = t => { const d = new Date(t); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); };
    const localToday = (now = new Date()) => now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
    const daysBetween = (a, b) => Math.round((toUTC(b) - toUTC(a)) / 86400000);   // b - a
    const addDays = (s, n) => fromUTC(toUTC(s) + n * 86400000);
    function addMonths(s, n) {   // 31 Jan + 1 month = 28 Feb (or 29)
        const [y, m, d] = s.split('-').map(Number), t = new Date(Date.UTC(y, m - 1 + n, 1));
        const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
        return t.getUTCFullYear() + '-' + pad(t.getUTCMonth() + 1) + '-' + pad(Math.min(d, last));
    }
    // "Fri 30 Oct", or "Fri 30 Oct 2025" when it is not this year
    function fmtDate(s, today) {
        const d = new Date(toUTC(s));
        const base = DAYS[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()];
        return today && s.slice(0, 4) === today.slice(0, 4) ? base : base + ' ' + d.getUTCFullYear();
    }
    const plural = (n, one, many) => n + ' ' + (n === 1 ? one : (many || one + 's'));
    function ago(n) {   // how long since: 0 -> today
        if (n <= 0) return 'today';
        if (n === 1) return 'yesterday';
        const months = Math.round(n / 30.44);
        return n + ' days ago' + (n >= 60 ? ', about ' + (months >= 24 ? plural(Math.round(n / 365.25), 'year') : plural(months, 'month')) : '');
    }
    function span(n) {   // a length of time: "43 days"
        if (n <= 0) return 'the same day';
        return plural(n, 'day') + (n >= 60 ? ', about ' + (n >= 730 ? plural(Math.round(n / 365.25), 'year') : plural(Math.round(n / 30.44), 'month')) : '');
    }

    // tidy pasted text: one line, single spaces, no control characters
    const clean = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f​﻿]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
    const cleanNote = s => String(s == null ? '' : s).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f​﻿]+/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, LIMITS.note);
    const same = (a, b) => clean(a, 200).toLowerCase() === clean(b, 200).toLowerCase();

    // when it should come back, from the preset the person picked
    function dueFrom(preset, date, custom) {
        if (preset === 'none' || !preset) return null;
        if (preset === 'custom') return custom || '';
        if (preset === 'm1') return addMonths(date, 1);
        if (typeof DUE_PRESETS[preset] === 'number') return addDays(date, DUE_PRESETS[preset]);
        return null;
    }

    // check the add/edit form. f: { kind, what, who, date, duePreset, dueDate, note, returned }
    function readForm(f, today) {
        const errs = {};
        const kind = f.kind === 'borrowed' ? 'borrowed' : 'lent';
        const what = clean(f.what, LIMITS.what), who = clean(f.who, LIMITS.who), note = cleanNote(f.note);
        if (!what) errs.what = kind === 'lent' ? 'Type what you lent, such as Drill or Harry Potter book.' : 'Type what you borrowed, such as Cake tin.';
        if (!who) errs.who = kind === 'lent' ? 'Type who has it, such as Bilal.' : 'Type who you borrowed it from, such as Aunt Sara.';
        const date = f.date || '';
        if (!isDate(date)) errs.date = 'Pick the day it was ' + (kind === 'lent' ? 'lent' : 'borrowed') + '.';
        else if (date > today) errs.date = 'This date is after today. Pick today or an earlier day.';
        let due = null;
        if (!errs.date) {
            due = dueFrom(f.duePreset, date, f.dueDate);
            if (due === '') { errs.due = 'Pick the give-back date, or choose "No date".'; due = null; }
            else if (due !== null && !isDate(due)) { errs.due = 'Pick a real date for giving it back.'; due = null; }
            else if (due !== null && due < date) { errs.due = 'The give-back date is before the day it was ' + (kind === 'lent' ? 'lent' : 'borrowed') + '. Pick a later day.'; due = null; }
        }
        let returned = f.returned === undefined ? null : f.returned;   // '' means the return day was cleared: ask for it
        if (returned !== null && !errs.date) {
            if (!isDate(returned)) errs.returned = 'Pick the day it came back.';
            else if (returned < date) errs.returned = 'The return day is before the day it was ' + (kind === 'lent' ? 'lent' : 'borrowed') + '.';
            else if (returned > today) errs.returned = 'The return day is after today.';
        }
        if (Object.keys(errs).length) return { ok: false, errs };
        return { ok: true, item: { kind, what, who, date, due, note, returned } };
    }

    // where a loan stands today
    function status(it, today) {
        const held = daysBetween(it.date, it.returned || today);
        if (it.returned) return { state: 'back', held };
        if (!it.due) return { state: 'open', held };
        const left = daysBetween(today, it.due);
        if (left < 0) return { state: 'late', held, late: -left };
        if (left === 0) return { state: 'today', held };
        return { state: left <= 3 ? 'soon' : 'ok', held, left };
    }

    // the words in an item's box
    function words(it, today) {
        const s = status(it, today), lent = it.kind === 'lent';
        const line = it.returned
            ? (lent ? 'Lent to ' : 'Borrowed from ') + it.who + ' · ' + fmtDate(it.date, today)
            : (lent ? 'With ' : 'From ') + it.who + ' · ' + (lent ? 'lent ' : 'borrowed ') + fmtDate(it.date, today) + ' (' + ago(s.held) + ')';
        let tag;
        if (s.state === 'back') tag = (lent ? 'Got it back ' : 'Gave it back ') + fmtDate(it.returned, today) + ', after ' + span(s.held);
        else if (s.state === 'open') tag = 'No give-back date';
        else if (s.state === 'late') tag = plural(s.late, 'day') + ' late · was due ' + fmtDate(it.due, today);
        else if (s.state === 'today') tag = (lent ? 'Due back today' : 'Give it back today');
        else tag = (lent ? 'Due back ' : 'Give back by ') + fmtDate(it.due, today) + ' · in ' + plural(s.left, 'day');
        return { line, tag, state: s.state, held: s.held };
    }

    // most urgent first: late (most late first), due today, soonest due, then no date (held longest first)
    function sortOpen(items, today) {
        const rank = it => { const s = status(it, today); return s.state === 'late' ? [0, -s.late] : s.state === 'today' ? [1, 0] : s.left !== undefined ? [2, s.left] : [3, -s.held]; };
        return items.slice().sort((a, b) => { const x = rank(a), y = rank(b); return x[0] - y[0] || x[1] - y[1] || a.what.localeCompare(b.what); });
    }
    const sortBack = items => items.slice().sort((a, b) => (b.returned > a.returned ? 1 : b.returned < a.returned ? -1 : 0) || (b.date > a.date ? 1 : -1));

    function summary(items, today) {
        const out = { lent: 0, borrowed: 0, lentLate: 0, borrowedLate: 0, lentToday: 0, borrowedToday: 0, back: 0 };
        items.forEach(it => {
            if (it.returned) { out.back++; return; }
            const s = status(it, today).state;
            out[it.kind]++;
            if (s === 'late') out[it.kind + 'Late']++;
            if (s === 'today') out[it.kind + 'Today']++;
        });
        return out;
    }

    // everyone you have lent to or borrowed from, with what is open
    function people(items) {
        const map = new Map();
        items.forEach(it => {
            const k = it.who.toLowerCase();
            if (!map.has(k)) map.set(k, { name: it.who, lent: 0, borrowed: 0, back: 0, total: 0 });
            const p = map.get(k); p.total++;
            if (it.returned) p.back++; else p[it.kind]++;
        });
        return [...map.values()].sort((a, b) => (b.lent + b.borrowed) - (a.lent + a.borrowed) || a.name.localeCompare(b.name));
    }
    function personLine(p) {
        const bits = [];
        if (p.lent) bits.push(p.name + ' has ' + plural(p.lent, 'thing') + ' of yours');
        if (p.borrowed) bits.push('you have ' + plural(p.borrowed, 'thing') + ' of ' + p.name + "'s");
        if (!bits.length) bits.push('Nothing open with ' + p.name);
        let s = bits.join('; '); s = s[0].toUpperCase() + s.slice(1);
        return s + (p.back ? '. ' + plural(p.back, 'loan') + ' finished before.' : '.');
    }

    // a polite message for the person who has your thing
    function reminderText(it, today) {
        const s = status(it, today);
        let when = 'since ' + fmtDate(it.date, today);
        let ask = 'Could I have it back when you get a chance?';
        if (s.state === 'late') ask = 'We said ' + fmtDate(it.due, today) + ', so could I have it back soon?';
        else if (s.state === 'today') ask = 'We said today, so could I have it back today or tomorrow?';
        else if (s.left !== undefined) ask = 'Could I have it back by ' + fmtDate(it.due, today) + '?';
        return 'Hi ' + it.who + ', hope you are well! Just a friendly reminder that you still have my ' + it.what + ' (' + when + '). ' + ask + ' Thank you!';
    }

    // the whole list as plain text, for copy or email
    function listText(items, today) {
        const open = k => sortOpen(items.filter(i => !i.returned && i.kind === k), today);
        const out = [];
        const lent = open('lent'), bor = open('borrowed');
        out.push('THINGS I LENT (' + lent.length + ')');
        if (!lent.length) out.push('- none');
        lent.forEach(it => { const w = words(it, today); out.push('- ' + it.what + ': ' + w.line + '. ' + w.tag + '.'); });
        out.push('', 'THINGS I BORROWED (' + bor.length + ')');
        if (!bor.length) out.push('- none');
        bor.forEach(it => { const w = words(it, today); out.push('- ' + it.what + ': ' + w.line + '. ' + w.tag + '.'); });
        return out.join('\n');
    }

    function csv(items, today) {
        const q = v => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) || /^[=+\-@]/.test(s) ? '"' + (/^[=+\-@]/.test(s) ? "'" : '') + s.replace(/"/g, '""') + '"' : s; };
        const rows = [['Lent or borrowed', 'What', 'Who', 'Date', 'Give back by', 'Returned on', 'Days', 'Status', 'Note']];
        sortBack(items.filter(i => i.returned)).concat(sortOpen(items.filter(i => !i.returned), today)).forEach(it => {
            const w = words(it, today);
            rows.push([it.kind === 'lent' ? 'Lent' : 'Borrowed', it.what, it.who, it.date, it.due || '', it.returned || '', w.held, w.tag, it.note || '']);
        });
        return rows.map(r => r.map(q).join(',')).join('\r\n');
    }

    // matches a search: what, who or note, any word order
    function matches(it, query) {
        const words2 = clean(query, 100).toLowerCase().split(' ').filter(Boolean);
        const hay = (it.what + ' ' + it.who + ' ' + (it.note || '')).toLowerCase();
        return words2.every(w => hay.includes(w));
    }

    // read saved or restored data, keeping only valid items
    function restore(raw) {
        const out = { v: 1, items: [] };
        if (!raw || typeof raw !== 'object' || !Array.isArray(raw.items)) return out;
        const seen = new Set();
        raw.items.forEach(r => {
            if (!r || typeof r !== 'object') return;
            const kind = r.kind === 'borrowed' ? 'borrowed' : r.kind === 'lent' ? 'lent' : null;
            const what = clean(r.what, LIMITS.what), who = clean(r.who, LIMITS.who);
            if (!kind || !what || !who || !isDate(r.date)) return;
            let id = typeof r.id === 'string' && /^[a-z0-9]{4,32}$/.test(r.id) ? r.id : newId();
            while (seen.has(id)) id = newId();
            seen.add(id);
            const due = isDate(r.due) && r.due >= r.date ? r.due : null;
            const returned = isDate(r.returned) && r.returned >= r.date ? r.returned : null;
            out.items.push({ id, kind, what, who, date: r.date, due, note: cleanNote(r.note), returned, hasPhoto: r.hasPhoto === true });
        });
        return out;
    }
    const newId = () => (Date.now().toString(36) + Math.random().toString(36).slice(2, 8)).slice(0, 16);
    const isPhoto = p => typeof p === 'string' && p.length < 3000000 && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(p);

    const api = { LIMITS, isDate, localToday, daysBetween, addDays, addMonths, fmtDate, plural, ago, span, clean, cleanNote, same, dueFrom, readForm, status, words,
        sortOpen, sortBack, summary, people, personLine, reminderText, listText, csv, matches, restore, newId, isPhoto };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.LentCore = api;
})(typeof window !== 'undefined' ? window : this);
