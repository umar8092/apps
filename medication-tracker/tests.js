// Checks on the logic. Runs in the browser (test.html) and in Node: node tests.js (also try TZ=America/New_York node tests.js)
(function (root) {
    function runTests(C) {
        const r = [], check = (name, ok) => r.push({ name, ok: !!ok });
        const D = '2026-10-07';                       // a Wednesday
        const at = (day, t) => C.slotAt(day, t);
        let n = 0;
        const med = (o) => Object.assign({ id: 'm' + (++n), name: 'Med', who: '', start: '2026-10-01', end: null, perDose: 100, pills: null,
            plans: [{ from: '2026-10-01', kind: 'times', times: ['08:00', '20:00'], days: [0, 1, 2, 3, 4, 5, 6] }] }, o);
        const log = (m, t, slot, extra) => Object.assign({ id: 'l' + (++n), med: m.id, t, c: t, slot: slot || null, skip: false, pills: 0 }, extra);
        const S = (meds, logs) => ({ v: 1, meds, logs: logs || [] });
        const T = ms => { const d = new Date(ms); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };

        // ---- the README situation: Metformin 08:00 and 20:00, it is 21:00 and only the morning dose was logged
        const met = med({ name: 'Metformin 500 mg' });
        let st = S([met], [log(met, at(D, '08:04'), D + ' 08:00')]);
        let v = C.todayView(st, at(D, '21:00'));
        check('Metformin: 2 slots today', v.meds[0].slots.length === 2);
        check('08:00 dose taken at 08:04', v.meds[0].slots[0].state === 'taken' && T(v.meds[0].slots[0].log.t) === '08:04');
        check('20:00 dose is due (not logged)', v.meds[0].slots[1].state === 'due');
        check('summary: 1 of 2 taken, 1 due', v.done === 1 && v.total === 2 && v.due === 1);
        check('no "too soon" warning 12 h 56 min after the morning dose', C.checkDose(st, met, at(D, '21:00')) === '');
        check('morning view at 07:00: both later, next is 08:00', (() => { const w = C.todayView(S([met], [log(met, at(C.addDays(D, -1), '20:00'), C.addDays(D, -1) + ' 20:00')]), at(D, '07:00')); return w.meds[0].slots.length === 2 && w.meds[0].slots.every(s => s.state === 'later') && T(w.next.at) === '08:00'; })());
        check('07:00: yesterday\'s unlogged 20:00 dose is still shown (not logged)', (() => { const w = C.todayView(S([met]), at(D, '07:00')); return w.meds[0].slots.length === 3 && w.meds[0].slots[0].carried && w.meds[0].slots[0].state === 'due'; })());
        check('08:00 reached: yesterday\'s unlogged 20:00 dose drops off Today (the next dose is due)', (() => { const w = C.todayView(S([met]), at(D, '08:00')); return w.meds[0].slots.length === 2 && !w.meds[0].slots[0].carried; })());

        // double dose: logged 08:04, tries again at 08:40 for the 20:00 slot
        const warn = C.checkDose(st, met, at(D, '08:40'));
        check('double dose warning 36 min after: ' + warn, /already logged Metformin 500 mg at 08:04, 36 min ago/.test(warn));
        check('twice a day: warning window is 6 h', C.minGap(C.current(met)) === 6 * C.HOUR);
        check('once a day: warning window is 12 h', C.minGap({ kind: 'times', times: ['09:00'], days: [] }) === 12 * C.HOUR);
        check('4 times a day 08/12/16/20: window 2 h', C.minGap({ kind: 'times', times: ['08:00', '12:00', '16:00', '20:00'], days: [] }) === 2 * C.HOUR);
        check('23:00 and 01:00 (across midnight): window 1 h', C.minGap({ kind: 'times', times: ['01:00', '23:00'], days: [] }) === C.HOUR);

        // ---- midnight crossing: bedtime 23:00 dose, taken at 00:30 the next day
        const bed = med({ name: 'Sleep tablet', plans: [{ from: '2026-10-01', kind: 'times', times: ['23:00'], days: [0, 1, 2, 3, 4, 5, 6] }] });
        const N = C.addDays(D, 1);
        v = C.todayView(S([bed]), at(N, '00:30'));
        check('after midnight, yesterday\'s 23:00 dose is still on Today', v.meds[0].slots[0].carried && v.meds[0].slots[0].key === D + ' 23:00' && v.meds[0].slots[0].state === 'due');
        check('carried slot does not count in today\'s total', v.total === 1 && v.done === 0);
        st = S([bed], [log(bed, at(N, '00:30'), D + ' 23:00')]);
        v = C.todayView(st, at(N, '01:00'));
        check('logged at 00:30: shows as taken for yesterday 23:00', v.meds[0].slots[0].state === 'taken' && v.meds[0].slots[0].carried);
        check('...and tonight\'s 23:00 is still later (not marked taken)', v.meds[0].slots[1].key === N + ' 23:00' && v.meds[0].slots[1].state === 'later');
        check('history counts it for the 7th, taken at 00:30 next day', (() => { const h = C.history(st, at(N, '01:00'), 2); const d7 = h.days.find(d => d.day === D); return d7.rows[0].items[0].state === 'taken' && h.tot.taken === 1 && h.tot.missed === 0; })());
        check('text says (next day)', /23:00 dose taken at 00:30 \(next day\)/.test(C.historyText(st, at(N, '01:00'), 2)));
        v = C.todayView(S([bed]), at(N, '11:30'));
        check('12 h after 23:00 the open slot drops off Today', v.meds[0].slots.length === 1 && v.meds[0].slots[0].key === N + ' 23:00');

        // ---- as needed: ibuprofen at least 6 h apart, up to 3 in 24 h
        const ibu = med({ name: 'Ibuprofen 200 mg', plans: [{ from: '2026-10-01', kind: 'needed', gap: 360, max: 3 }] });
        st = S([ibu], [log(ibu, at(D, '10:15'))]);
        let s = C.neededStatus(st, ibu, at(D, '13:35'));
        check('next ibuprofen from 16:15', s.nextOk === at(D, '16:15') && s.reason === 'gap');
        check('1 in the last 24 h', s.count24 === 1);
        check('too-soon warning: ' + C.checkDose(st, ibu, at(D, '13:35')), /The last dose was at 10:15, 3 h 20 min ago\. You set at least 6 h between doses, so the next one is due from 16:15/.test(C.checkDose(st, ibu, at(D, '13:35'))));
        check('at 16:15 it is fine', C.neededStatus(st, ibu, at(D, '16:15')).nextOk === null && C.checkDose(st, ibu, at(D, '16:15')) === '');
        st = S([ibu], [log(ibu, at(D, '04:00')), log(ibu, at(D, '10:15')), log(ibu, at(D, '16:30'))]);
        s = C.neededStatus(st, ibu, at(D, '23:00'));
        check('3 of 3 in 24 h: next only at 04:00 tomorrow', s.count24 === 3 && s.reason === 'max' && s.nextOk === at(N, '04:00'));
        check('limit warning', /already logged 3 doses of Ibuprofen 200 mg in the last 24 hours, and your limit is 3/.test(C.checkDose(st, ibu, at(D, '23:00'))));
        check('no limit set: only the gap counts', C.neededStatus(S([med({ plans: [{ from: '2026-10-01', kind: 'needed', gap: 240, max: null }] })]), med(), at(D, '12:00')).nextOk === null);
        check('never taken: fine now', C.neededStatus(S([ibu]), ibu, at(D, '09:00')).nextOk === null && C.neededStatus(S([ibu]), ibu, at(D, '09:00')).last === null);

        // ---- skip, days of the week, start and end
        const wk = med({ name: 'Methotrexate', plans: [{ from: '2026-10-01', kind: 'times', times: ['09:00'], days: [1] }] });     // Mondays only
        check('weekly: nothing on Wednesday', C.todayView(S([wk]), at(D, '12:00')).meds[0].slots.length === 0);
        check('weekly: due on Monday 12 Oct', C.todayView(S([wk]), at('2026-10-12', '12:00')).meds[0].slots[0].state === 'due');
        st = S([met], [log(met, at(D, '08:30'), D + ' 08:00', { skip: true })]);
        v = C.todayView(st, at(D, '09:00'));
        check('skipped dose shows as skipped, not due', v.meds[0].slots[0].state === 'skipped' && v.due === 0);
        check('skip is not a dose: no too-soon warning', C.checkDose(st, met, at(D, '09:00')) === '' && C.lastTaken(st, met.id, at(D, '09:00')) === null);
        const course = med({ name: 'Amoxicillin', start: '2026-10-05', end: '2026-10-06' });
        check('course finished after the last day', C.todayView(S([course]), at(D, '09:00')).meds[0].finished && C.todayView(S([course]), at(D, '09:00')).meds[0].slots.length === 0);
        check('course not started yet', C.todayView(S([course]), at('2026-10-04', '09:00')).meds[0].notStarted);
        const h = C.history(S([course]), at(D, '09:00'), 7);
        check('history: 2 days x 2 doses not logged for the course, nothing on other days', h.tot.set === 4 && h.tot.missed === 4 && h.days.filter(d => d.rows.length).length === 2);
        check('history leaves out set times still ahead today', C.history(S([met]), at(D, '12:00'), 1).tot.set === 1);
        check('added today at 15:00: the 08:00 dose is not counted as missed in history unless logged', C.history(S([med({ start: D, created: at(D, '15:00') })]), at(D, '22:00'), 1).tot.set === 1);
        check('added today at 15:00 with an 08:00 time: shows due (can be logged or skipped)', C.todayView(S([med({ start: D })]), at(D, '15:00')).meds[0].slots[0].state === 'due');

        // ---- history summary, 7 days of Metformin
        const logs = [];
        for (let i = 0; i < 7; i++) { const d = C.addDays(D, -i); logs.push(log(met, at(d, '08:05'), d + ' 08:00')); if (i !== 3) logs.push(log(met, at(d, '20:10'), d + ' 20:00')); }
        st = S([met], logs);
        const hh = C.history(st, at(D, '22:00'), 7);
        check('7 days: 13 of 14 set doses taken, 1 not logged', hh.tot.set === 14 && hh.tot.taken === 13 && hh.tot.missed === 1);
        check('summary line', C.summaryLine(hh.tot) === '13 of 14 set doses taken, 1 not logged.');
        check('summary line when empty', C.summaryLine({ set: 0, taken: 0, skipped: 0, missed: 0, needed: 0 }) === 'Nothing logged yet.');
        const txt = C.historyText(st, at(D, '22:00'), 7);
        check('text lists the schedule', txt.includes('- Metformin 500 mg: 08:00 and 20:00, every day'));
        check('text marks the missed dose', txt.includes('20:00 dose not logged'));

        // ---- pills left
        const pm = med({ name: 'Vitamin D', perDose: 100, pills: { left: 2800, at: at(D, '07:00') }, plans: [{ from: '2026-10-01', kind: 'times', times: ['08:00'], days: [0, 1, 2, 3, 4, 5, 6] }] });
        st = S([pm], [log(pm, at(D, '08:00'), D + ' 08:00', { pills: 100 })]);
        let pl = C.pillsLeft(st, pm);
        check('28 pills, one taken: 27 left, 27 days', pl.left === 2700 && pl.days === 27 && !pl.low);
        pm.pills = { left: 700, at: at(D, '07:00') };
        pl = C.pillsLeft(st, pm);
        check('7 pills, one taken: 6 left, low', pl.left === 600 && pl.low);
        pm.pills = { left: 50, at: at(D, '07:00') };
        pl = C.pillsLeft(st, pm);
        check('more taken than counted: 0 left, out, never negative', pl.left === 0 && pl.out && pl.short);
        check('dose logged before the count was set does not count', C.pillsLeft(S([pm], [log(pm, at(D, '06:00'), D + ' 08:00', { pills: 100 })]), Object.assign({}, pm, { pills: { left: 1000, at: at(D, '07:00') } })).left === 1000);
        check('half tablets: 0.5 a dose twice a day, 10 pills = 10 days', C.pillsLeft(S([]), med({ perDose: 50, pills: { left: 1000, at: 0 } })).days === 10);
        check('weekly 1 pill, 4 left: 28 days', C.pillsLeft(S([]), Object.assign({}, wk, { perDose: 100, pills: { left: 400, at: 0 } })).days === 28);
        check('not counted: null', C.pillsLeft(S([met]), met) === null);

        // ---- reading input
        check('hours "4" -> 240 min', C.parseHours('4').min === 240);
        check('hours "1,5" -> 90 min', C.parseHours('1,5').min === 90);
        check('hours blank, negative, word, 0, huge refused', C.parseHours('').err && C.parseHours('-2').err && C.parseHours('abc').err && C.parseHours('0').err && C.parseHours('500').err);
        check('pills "28" -> 2800, "12.5" -> 1250, blank', C.parsePills('28').n === 2800 && C.parsePills('12.5').n === 1250 && C.parsePills(' ').blank);
        check('pills negative / word / huge refused', C.parsePills('-1').err && C.parsePills('ten').err && C.parsePills('9999999').err);
        check('pills text', C.pillsText(1250) === '12.5' && C.pillsText(2800) === '28' && C.pillsText(25) === '0.25');
        check('times are cleaned: duplicates, bad and order', JSON.stringify(C.cleanTimes(['20:00', '08:00', '08:00', '25:00', 'x', ''])) === '["08:00","20:00"]');
        check('dur', C.dur(30000) === 'less than a minute' && C.dur(35 * C.MIN) === '35 min' && C.dur(160 * C.MIN) === '2 h 40 min' && C.dur(2 * C.HOUR) === '2 h' && C.dur(3 * C.DAY + 5) === '3 days');
        check('days text', C.daysText([0, 1, 2, 3, 4, 5, 6]) === 'every day' && C.daysText([1, 2, 3, 4, 5]) === 'Monday to Friday' && C.daysText([1, 4]) === 'on Mon and Thu' && C.daysText([0]) === 'on Sun');
        check('schedule text as needed', C.scheduleText(ibu) === 'when needed, at least 6 h apart, up to 3 in 24 hours');

        // ---- changing the schedule keeps the past and moves today's dose
        const ch = med({ name: 'Change' });
        st = S([ch], [log(ch, at(D, '08:02'), D + ' 08:00'), log(ch, at(C.addDays(D, -1), '20:00'), C.addDays(D, -1) + ' 20:00')]);
        ch.plans.push({ from: D, kind: 'times', times: ['09:00', '21:00'], days: [0, 1, 2, 3, 4, 5, 6] });
        C.remapToday(st, ch, at(D, '10:00'));
        check('today\'s 08:00 dose moves to the new 09:00 time', st.logs.some(l => l.slot === D + ' 09:00'));
        check('yesterday keeps the old 20:00 time', C.slotsForDay(ch, C.addDays(D, -1))[1].time === '20:00' && C.history(st, at(D, '10:00'), 2).tot.missed === 1);

        // ---- calendar file
        const cal = C.ics(S([met, ibu, wk, course]), D, '20261007T090000Z');
        check('calendar: 3 reminders (2 Metformin + 1 weekly), as-needed and finished left out', cal.n === 3);
        check('calendar: daily rule at 08:00 floating time', cal.text.includes('DTSTART:20261007T080000') && cal.text.includes('RRULE:FREQ=DAILY'));
        check('calendar: weekly starts on the next Monday', cal.text.includes('DTSTART:20261012T090000') && cal.text.includes('RRULE:FREQ=WEEKLY;BYDAY=MO'));
        check('calendar: end date becomes UNTIL', C.ics(S([med({ start: D, end: '2026-10-14' })]), D, 'x').text.includes(';UNTIL=20261014T235959'));
        check('calendar: commas escaped, lines folded at 75', (() => { const t = C.ics(S([med({ name: 'A, B; C ' + 'x'.repeat(50), who: 'Mum' })]), D, 'x').text; return t.includes('A\\, B\\; C') && t.split('\r\n').every(l => l.length <= 75); })());

        // ---- saved data is never trusted
        check('clean(null) is empty', C.clean(null).meds.length === 0);
        check('clean("x") is empty', C.clean('x').meds.length === 0);
        const dirty = { meds: [{ id: 'a', name: '  Aspirin  ', start: '2026-10-01', plans: [{ from: '2026-10-01', kind: 'times', times: ['08:00', 'bad'], days: [1, 9, 1] }] },
            { id: 'a', name: 'dup id', start: '2026-10-01', plans: [{ from: '2026-10-01', kind: 'times', times: ['08:00'], days: [1] }] },
            { id: 'b', name: '', start: '2026-10-01', plans: [] }, { id: 'c', name: 'No plan', start: '2026-10-01', plans: [{ from: 'x', kind: 'times' }] },
            { id: 'd', name: 'Need', start: '2026-02-30', plans: [{ from: '2026-10-01', kind: 'needed', gap: 5 }] }, { id: '<x>', name: 'bad id', start: '2026-10-01', plans: [] }],
            logs: [{ id: 'z1', med: 'a', t: at(D, '08:00'), slot: D + ' 08:00' }, { id: 'z2', med: 'a', t: at(D, '08:30'), slot: D + ' 08:00' }, { id: 'z3', med: 'ghost', t: 1 }, { id: 'z4', med: 'a', t: 'soon' },
                { id: 'z5', med: 'a', t: at(D, '09:00'), slot: 'nonsense', skip: true }] };
        const cl = C.clean(dirty, at(D, '12:00'));
        check('clean keeps only the valid medicine, trimmed', cl.meds.length === 1 && cl.meds[0].name === 'Aspirin' && JSON.stringify(cl.meds[0].plans[0].times) === '["08:00"]' && JSON.stringify(cl.meds[0].plans[0].days) === '[1]');
        check('clean drops logs for unknown medicines, bad times and a second log for the same dose', cl.logs.length === 2 && cl.logs[0].id === 'z1');
        check('clean: a skip without a set time is not a skip', cl.logs[1].skip === false);
        check('clean drops logs older than 400 days', C.clean({ meds: dirty.meds.slice(0, 1), logs: [{ id: 'q', med: 'a', t: at(D, '08:00') - 500 * C.DAY }] }, at(D, '12:00')).logs.length === 0);
        check('very long name is cut to 60', C.clean({ meds: [{ id: 'x', name: 'y'.repeat(300), start: D, plans: [{ from: D, kind: 'needed', gap: 60 }] }] }).meds[0].name.length === 60);
        return r;
    }
    if (typeof module === 'object' && module.exports) {
        const r = runTests(require('./core.js'));
        r.forEach(t => console.log((t.ok ? 'PASS ' : 'FAIL ') + t.name));
        const bad = r.filter(t => !t.ok).length;
        console.log((r.length - bad) + ' of ' + r.length + ' checks passed');
        process.exit(bad ? 1 : 0);
    } else root.runTests = runTests;
})(this);
