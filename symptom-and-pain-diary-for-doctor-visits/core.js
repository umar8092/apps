// Symptom and Pain Diary: the maths, checks and report text. No page code here, so tests.js can run it in node.
// Times are wall-clock stamps "2026-10-22T14:10" and all arithmetic is done in whole minutes on those stamps,
// so summer time and time zones never move an episode to another day.
(function (root) {
    const pad = n => String(n).padStart(2, '0');
    const STAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
    const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
    const WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const MAX_LEN_MIN = 31 * 1440;
    const HELPED = ['', 'yes', 'some', 'no'];

    // minutes since 1970 for a wall-clock stamp, NaN when it is not a real date and time
    function toMin(s) {
        const m = STAMP.exec(String(s || ''));
        if (!m) return NaN;
        const [y, mo, d, h, mi] = m.slice(1).map(Number);
        if (mo < 1 || mo > 12 || d < 1 || h > 23 || mi > 59) return NaN;
        const dt = new Date(Date.UTC(y, mo - 1, d, h, mi));
        if (dt.getUTCDate() !== d || dt.getUTCMonth() !== mo - 1) return NaN;
        return dt.getTime() / 60000;
    }
    function fromMin(n) {
        const d = new Date(n * 60000);
        return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()) + 'T' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes());
    }
    const isStamp = s => !isNaN(toMin(s));
    const isDay = s => DAY.test(String(s || '')) && isStamp(s + 'T00:00');
    // the phone's own clock time as a stamp
    const stamp = date => date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + 'T' + pad(date.getHours()) + ':' + pad(date.getMinutes());
    const dayOf = s => String(s).slice(0, 10);
    const addMin = (s, n) => fromMin(toMin(s) + n);
    const addDays = (day, n) => fromMin(toMin(day + 'T00:00') + n * 1440).slice(0, 10);
    const dayDiff = (a, b) => Math.round((toMin(b + 'T00:00') - toMin(a + 'T00:00')) / 1440);
    const weekday = day => new Date(toMin(day + 'T00:00') * 60000).getUTCDay();

    function fmtDay(day, withYear) {
        if (!isDay(day)) return String(day);
        const [y, m, d] = day.split('-').map(Number);
        return WEEK[weekday(day)] + ' ' + d + ' ' + MONTH[m - 1] + (withYear ? ' ' + y : '');
    }
    const fmtTime = s => String(s).slice(11, 16);
    const monthName = ym => MONTH_LONG[Number(ym.slice(5, 7)) - 1] + ' ' + ym.slice(0, 4);

    // "45 min", "2 h", "3 h 20 min", "1 day 4 h", "3 days"
    function fmtDur(min) {
        min = Math.max(0, Math.round(min));
        if (min < 60) return min + ' min';
        if (min < 1440) { const h = Math.floor(min / 60), m = min % 60; return h + ' h' + (m ? ' ' + m + ' min' : ''); }
        const d = Math.floor(min / 1440), h = Math.round((min % 1440) / 60);
        if (h === 24) return (d + 1) + ' days';
        return d + (d === 1 ? ' day' : ' days') + (h ? ' ' + h + ' h' : '');
    }

    // ---------- episodes
    const endOf = (ep, now) => ep.end || now;
    function durationMin(ep, now) { return Math.max(0, toMin(endOf(ep, now)) - toMin(ep.start)); }
    // every calendar day the episode touched; one that ends exactly at midnight does not count the next day
    function episodeDays(ep, now) {
        const s = toMin(ep.start), e = toMin(endOf(ep, now));
        const first = dayOf(ep.start), last = e > s ? dayOf(fromMin(e - 1)) : first;
        const out = [];
        for (let d = first; d <= last && out.length < 400; d = addDays(d, 1)) out.push(d);
        return out;
    }

    // the days a summary covers, the period before it to compare with, and words for both
    function periodRange(kind, today) {
        const ym = today.slice(0, 7), first = ym + '-01';
        const lastMonthEnd = addDays(first, -1), lastMonthStart = lastMonthEnd.slice(0, 7) + '-01';
        if (kind === 'month') return { from: first, to: today, label: 'this month (' + monthName(ym) + ')', short: monthName(ym) + ' so far',
            prev: { from: lastMonthStart, to: lastMonthEnd, label: 'all of ' + monthName(lastMonthStart.slice(0, 7)) } };
        if (kind === 'last') {
            const pe = addDays(lastMonthStart, -1), ps = pe.slice(0, 7) + '-01';
            return { from: lastMonthStart, to: lastMonthEnd, label: 'last month (' + monthName(lastMonthStart.slice(0, 7)) + ')', short: monthName(lastMonthStart.slice(0, 7)),
                prev: { from: ps, to: pe, label: monthName(ps.slice(0, 7)) } };
        }
        if (kind === 'all') return { from: null, to: null, label: 'all entries', short: 'All entries', prev: null };
        const n = kind === '90' ? 90 : 30, from = addDays(today, -(n - 1));
        return { from, to: today, label: 'the last ' + n + ' days', short: 'Last ' + n + ' days',
            prev: { from: addDays(from, -n), to: addDays(from, -1), label: 'the ' + n + ' days before' } };
    }
    const inRange = (d, from, to) => (!from || d >= from) && (!to || d <= to);
    function inPeriod(eps, sid, from, to, now) {
        return eps.filter(ep => ep.sid === sid && episodeDays(ep, now).some(d => inRange(d, from, to)))
            .sort((a, b) => a.start < b.start ? 1 : a.start > b.start ? -1 : 0);
    }
    // distinct days with the symptom, counting only days inside the period
    function daysWith(list, from, to, now) {
        const set = new Set();
        list.forEach(ep => episodeDays(ep, now).forEach(d => { if (inRange(d, from, to)) set.add(d); }));
        return set;
    }
    // days pain medicine was taken: the day each episode with a medicine started
    function medDays(list, from, to) {
        const set = new Set();
        list.forEach(ep => { if (ep.meds.some(m => m.name) && inRange(dayOf(ep.start), from, to)) set.add(dayOf(ep.start)); });
        return set;
    }
    // one decimal, half up, from whole numbers
    const avg1 = (sum, n) => n ? (Math.round(sum * 10 / n) / 10).toFixed(1).replace(/\.0$/, '') : '';

    function medStats(list) {
        const map = new Map();
        list.forEach(ep => {
            const seen = new Set();
            ep.meds.forEach(m => {
                const key = m.name.trim().toLowerCase();
                if (!key || seen.has(key)) return;
                seen.add(key);
                if (!map.has(key)) map.set(key, { name: m.name.trim(), taken: 0, yes: 0, some: 0, no: 0, unknown: 0 });
                const s = map.get(key); s.taken++;
                if (m.helped === 'yes') s.yes++; else if (m.helped === 'some') s.some++; else if (m.helped === 'no') s.no++; else s.unknown++;
            });
        });
        return [...map.values()].sort((a, b) => b.taken - a.taken || a.name.localeCompare(b.name));
    }
    function medLine(s) {
        const times = s.taken === 1 ? 'time' : 'times';
        if (s.unknown === s.taken) return s.name + ': taken ' + s.taken + ' ' + times + ', whether it helped was not noted';
        const extra = [];
        if (s.some) extra.push('helped a bit ' + s.some);
        if (s.no) extra.push('did not help ' + s.no);
        if (s.unknown) extra.push('not noted ' + s.unknown);
        return s.name + ': helped ' + s.yes + ' of ' + s.taken + ' ' + times + (extra.length ? ' (' + extra.join(', ') + ')' : '');
    }
    function triggerStats(list) {
        const map = new Map();
        list.forEach(ep => new Set(ep.triggers.map(t => t.trim()).filter(Boolean)).forEach(t => {
            const key = t.toLowerCase();
            if (!map.has(key)) map.set(key, { name: t, n: 0 });
            map.get(key).n++;
        }));
        return [...map.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
    }

    function summary(eps, sid, kind, today, now) {
        const r = periodRange(kind, today);
        const list = inPeriod(eps, sid, r.from, r.to, now);
        const days = daysWith(list, r.from, r.to, now);
        const ended = list.filter(ep => ep.end);
        const out = {
            range: r, list, n: list.length, days: days.size, dayList: [...days].sort(),
            avgPain: avg1(list.reduce((a, ep) => a + ep.pain, 0), list.length),
            worst: list.reduce((a, ep) => Math.max(a, ep.pain), -1),
            longest: list.reduce((a, ep) => Math.max(a, durationMin(ep, now)), 0),
            avgLen: ended.length ? Math.round(ended.reduce((a, ep) => a + durationMin(ep, now), 0) / ended.length) : null,
            ongoing: list.filter(ep => !ep.end).length,
            meds: medStats(list), triggers: triggerStats(list), medDays: medDays(list, r.from, r.to).size,
            spanDays: r.from ? dayDiff(r.from, r.to) + 1 : null, prevDays: null, prevN: null
        };
        if (r.prev) {
            const pl = inPeriod(eps, sid, r.prev.from, r.prev.to, now);
            out.prevDays = daysWith(pl, r.prev.from, r.prev.to, now).size; out.prevN = pl.length;
        }
        // pain medicine on 10 or more days a month (scaled for longer periods) can itself cause more headaches
        const months = out.spanDays ? out.spanDays / 30 : 0;
        out.overuse = months > 0 && out.medDays >= 10 * Math.max(1, Math.round(months));
        return out;
    }

    // worst pain and medicine for each day in the period, for the calendar
    function dayMap(list, from, to, now) {
        const map = {};
        list.forEach(ep => {
            episodeDays(ep, now).forEach(d => {
                if (!inRange(d, from, to)) return;
                const x = map[d] || (map[d] = { pain: -1, med: false, n: 0 });
                x.pain = Math.max(x.pain, ep.pain); x.n++;
            });
            const sd = dayOf(ep.start);
            if (ep.meds.some(m => m.name) && inRange(sd, from, to)) (map[sd] || (map[sd] = { pain: ep.pain, med: false, n: 1 })).med = true;
        });
        return map;
    }

    // ---------- checks for the form
    function checkEpisode(v, now) {
        const err = {};
        const s = toMin(v.start), e = v.end ? toMin(v.end) : null, n = toMin(now);
        if (isNaN(s)) err.start = 'Choose when it started.';
        else if (s > n + 1) err.start = 'The start time is in the future. Choose a time up to now.';
        if (v.end !== null && v.end !== undefined && !err.start) {
            if (isNaN(e)) err.end = 'Choose when it stopped.';
            else if (e <= s) err.end = 'It must stop after it started (' + fmtDay(dayOf(v.start)) + ', ' + fmtTime(v.start) + ').';
            else if (e > n + 1) err.end = 'That would end in the future. Choose a shorter time, or "Still going".';
            else if (e - s > MAX_LEN_MIN) err.end = 'That is longer than 31 days. Check the dates.';
        }
        if (!err.start && v.end === null && n - s > MAX_LEN_MIN) err.end = 'Still going for more than 31 days? Choose when it stopped.';
        if (!Number.isInteger(v.pain) || v.pain < 0 || v.pain > 10) err.pain = 'Choose how bad it was, from 0 to 10.';
        return err;
    }

    // ---------- clean saved or restored data, dropping anything that does not fit
    const str = (v, max) => typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, max) : '';
    const cleanList = (a, max, len) => Array.isArray(a) ? [...new Set(a.map(x => str(x, len).trim()).filter(Boolean))].slice(0, max) : [];
    function clean(data) {
        if (!data || typeof data !== 'object' || !Array.isArray(data.symptoms)) return null;
        const ids = new Set(), symptoms = [];
        data.symptoms.slice(0, 30).forEach(s => {
            if (!s || typeof s !== 'object') return;
            const id = str(s.id, 40), name = str(s.name, 40).trim();
            if (!id || !name || ids.has(id)) return;
            ids.add(id);
            symptoms.push({ id, name, triggers: cleanList(s.triggers, 40, 40), wheres: cleanList(s.wheres, 30, 60) });
        });
        const episodes = [], eids = new Set();
        (Array.isArray(data.episodes) ? data.episodes : []).slice(0, 20000).forEach(ep => {
            if (!ep || typeof ep !== 'object') return;
            const id = str(ep.id, 40), sid = str(ep.sid, 40);
            if (!id || eids.has(id) || !ids.has(sid) || !isStamp(ep.start)) return;
            let end = null;
            if (ep.end) {
                // an end that is not a real time after the start would make wrong totals, so that entry is left out
                if (!isStamp(ep.end) || toMin(ep.end) <= toMin(ep.start) || toMin(ep.end) - toMin(ep.start) > MAX_LEN_MIN) return;
                end = ep.end;
            }
            const pain = Number(ep.pain);
            if (!Number.isInteger(pain) || pain < 0 || pain > 10) return;
            const meds = (Array.isArray(ep.meds) ? ep.meds : []).slice(0, 6).map(m => m && typeof m === 'object'
                ? { name: str(m.name, 60).trim(), helped: HELPED.includes(m.helped) ? m.helped : '' } : null).filter(m => m && m.name);
            eids.add(id);
            episodes.push({ id, sid, start: ep.start, end, pain, where: str(ep.where, 60).trim(), triggers: cleanList(ep.triggers, 20, 40), meds, note: str(ep.note, 500).trim() });
        });
        const period = ['30', '90', 'month', 'last', 'all'].includes(data.period) ? data.period : '30';
        const current = ids.has(data.current) ? data.current : (symptoms[0] ? symptoms[0].id : '');
        return { v: 1, symptoms, episodes, current, period, name: str(data.name, 40).trim() };
    }

    // ---------- starting lists for each kind of symptom (each symptom keeps its own and can change it)
    const PRESETS = {
        'Migraine': { triggers: ['Short or poor sleep', 'Missed or late meal', 'Stress', 'Period', 'Weather change', 'Screens', 'Bright light or noise', 'Caffeine', 'Alcohol', 'Not enough water'],
            wheres: ['Left side of head', 'Right side of head', 'Both sides', 'Forehead', 'Behind the eyes', 'Back of head and neck'] },
        'Headache': { triggers: ['Short or poor sleep', 'Missed or late meal', 'Stress', 'Screens', 'Caffeine', 'Not enough water', 'Long day'],
            wheres: ['Forehead', 'Both sides', 'Left side of head', 'Right side of head', 'Back of head and neck', 'Behind the eyes'] },
        'Back pain': { triggers: ['Lifting', 'Long sitting', 'Long standing', 'Exercise', 'Bad night\'s sleep', 'Long drive', 'Stress', 'Cold'],
            wheres: ['Lower back', 'Upper back', 'Neck', 'Down the left leg', 'Down the right leg'] },
        'Stomach pain': { triggers: ['Spicy food', 'Fatty or fried food', 'Dairy', 'Eating late', 'Large meal', 'Stress', 'Period', 'Caffeine', 'Alcohol'],
            wheres: ['Upper tummy', 'Lower tummy', 'Left side', 'Right side', 'All over'] },
        'Period pain': { triggers: ['Stress', 'Short or poor sleep', 'Caffeine', 'Not enough exercise'],
            wheres: ['Lower tummy', 'Lower back', 'Thighs'] },
        'Joint pain': { triggers: ['Weather change', 'Exercise', 'Long standing', 'Long sitting', 'Cold', 'Short or poor sleep'],
            wheres: ['Knees', 'Hands and fingers', 'Hips', 'Shoulders', 'Ankles and feet', 'Wrists'] }
    };
    const GENERIC = { triggers: ['Short or poor sleep', 'Stress', 'Food', 'Weather change', 'Exercise', 'Period'], wheres: [] };
    function newSymptom(name, id) {
        const key = Object.keys(PRESETS).find(k => k.toLowerCase() === String(name).trim().toLowerCase());
        const p = key ? PRESETS[key] : GENERIC;
        return { id, name: str(name, 40).trim(), triggers: p.triggers.slice(), wheres: p.wheres.slice() };
    }

    // ---------- the report for the doctor (print, copy, email and spreadsheet use the same words)
    function painWord(p) { return p >= 7 ? 'severe' : p >= 4 ? 'moderate' : p >= 1 ? 'mild' : 'no pain'; }
    function episodeLine(ep, now) {
        const sd = dayOf(ep.start);
        let when = fmtDay(sd, true) + ', ' + fmtTime(ep.start);
        if (ep.end) when += ' to ' + (dayOf(ep.end) !== sd ? fmtDay(dayOf(ep.end)) + ' ' : '') + fmtTime(ep.end) + ' (' + fmtDur(durationMin(ep, now)) + ')';
        else when += ', still going (' + fmtDur(durationMin(ep, now)) + ' so far)';
        const bits = [when, 'pain ' + ep.pain + '/10'];
        if (ep.where) bits.push(ep.where);
        let line = bits.join(', ') + '.';
        if (ep.triggers.length) line += ' Possible triggers: ' + ep.triggers.join(', ') + '.';
        if (ep.meds.length) line += ' Took: ' + ep.meds.map(m => m.name + (m.helped ? ' (' + helpedWord(m.helped) + ')' : '')).join(', ') + '.';
        if (ep.note) line += ' Note: ' + ep.note;
        return line;
    }
    const helpedWord = h => h === 'yes' ? 'helped' : h === 'some' ? 'helped a bit' : h === 'no' ? 'did not help' : 'not noted';

    function rangeText(s, today) {
        const r = s.range;
        if (!r.from) return s.n ? fmtDay(dayOf(s.list[s.list.length - 1].start), true) + ' to ' + fmtDay(today, true) : 'all entries';
        return fmtDay(r.from, r.from.slice(0, 4) !== r.to.slice(0, 4)) + ' to ' + fmtDay(r.to, true);
    }
    function headLines(sym, s, today) {
        const name = sym.name.toLowerCase(), lines = [];
        const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
        let d = 'Days with ' + name + ': ' + s.days;
        if (s.spanDays) d += ' of ' + s.spanDays;
        if (s.prevDays !== null) d += ' (' + s.range.prev.label + ': ' + s.prevDays + ')';
        lines.push(d);
        if (!s.n) return lines;
        let e = plural(s.n, 'episode') + ', average pain ' + s.avgPain + '/10, worst ' + s.worst + '/10';
        lines.push(e);
        const len = [];
        if (s.avgLen !== null) len.push('usually lasts ' + fmtDur(s.avgLen));
        len.push('longest ' + fmtDur(s.longest));
        if (s.ongoing) len.push(s.ongoing + ' still going');
        lines.push(len.join(', ').replace(/^./, c => c.toUpperCase()));
        if (s.meds.length) lines.push('Medicines: ' + s.meds.map(medLine).join('; '));
        lines.push('Medicine taken on ' + plural(s.medDays, 'day') + (s.spanDays ? ' of ' + s.spanDays : ''));
        if (s.triggers.length) lines.push('Most often after: ' + s.triggers.slice(0, 4).map(t => t.name + ' (' + t.n + ' of ' + s.n + ')').join(', '));
        return lines;
    }
    function reportText(sym, s, today, now, person, maxLen) {
        const out = ['Symptom diary: ' + sym.name + (person ? ', ' + person : ''), 'Period: ' + rangeText(s, today) + ' (' + s.range.label + ')', ''];
        headLines(sym, s, today).forEach(l => out.push(l));
        if (s.n) { out.push('', 'Episodes, newest first:'); }
        let text = out.join('\n');
        for (const ep of s.list) {
            const add = '\n- ' + episodeLine(ep, now);
            if (maxLen && text.length + add.length > maxLen - 90) { text += '\n(More episodes: use Print or Copy as text in the app for the full list.)'; break; }
            text += add;
        }
        return text + '\n\nKept with Symptom and Pain Diary. Not medical advice.';
    }
    // spreadsheet: one row per episode; cells that start like a formula are made plain text
    function csv(sym, list, now) {
        const q = v => { let t = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return /[",\n\r;]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
        const rows = [['Symptom', 'Started', 'Stopped', 'Length (minutes)', 'Length', 'Pain (0-10)', 'Where', 'Possible triggers', 'Medicines', 'Did it help', 'Note']];
        list.slice().reverse().forEach(ep => rows.push([sym.name, ep.start.replace('T', ' '), ep.end ? ep.end.replace('T', ' ') : 'still going', ep.end ? durationMin(ep, now) : '',
            ep.end ? fmtDur(durationMin(ep, now)) : '', ep.pain, ep.where, ep.triggers.join('; '), ep.meds.map(m => m.name).join('; '),
            ep.meds.map(m => helpedWord(m.helped)).join('; '), ep.note]));
        return rows.map(r => r.map(q).join(',')).join('\r\n') + '\r\n';
    }

    const api = { toMin, fromMin, isStamp, isDay, stamp, dayOf, addMin, addDays, dayDiff, weekday, fmtDay, fmtTime, fmtDur, monthName,
        durationMin, episodeDays, periodRange, inPeriod, daysWith, summary, dayMap, medStats, medLine, triggerStats, checkEpisode, clean,
        PRESETS, newSymptom, painWord, episodeLine, helpedWord, headLines, reportText, rangeText, csv, avg1, MAX_LEN_MIN };
    if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SPDCore = api;
})(typeof window !== 'undefined' ? window : this);
