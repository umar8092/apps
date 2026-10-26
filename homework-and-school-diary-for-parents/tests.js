// Logic checks for core.js. Run with `node tests.js` or open test.html.
(function () {
    'use strict';
    var HW = (typeof window !== 'undefined' ? window : globalThis).HW;
    if (!HW && typeof require === 'function') { require('./core.js'); HW = globalThis.HW; }
    var pass = 0, fails = [];
    function eq(got, want, what) {
        var g = JSON.stringify(got), w = JSON.stringify(want);
        if (g === w) pass++; else fails.push(what + ': got ' + g + ', want ' + w);
    }
    function ok(c, what) { eq(!!c, true, what); }

    // ---- dates ----
    eq(HW.weekday('2026-10-26'), 1, '26 Oct 2026 is a Monday');
    eq(HW.fmt('2026-10-26'), 'Mon 26 Oct', 'short date');
    eq(HW.fmt('2027-01-01', true), 'Fri 1 Jan 2027', 'date with year');
    eq(HW.addDays('2026-12-31', 1), '2027-01-01', 'over the new year');
    eq(HW.addDays('2028-02-28', 1), '2028-02-29', 'leap day');
    eq(HW.addDays('2026-03-28', 2), '2026-03-30', 'over a clock change');
    eq(HW.rel('2026-10-27', '2026-10-26'), 'tomorrow', 'tomorrow');
    eq(HW.rel('2026-10-26', '2026-10-26'), 'today', 'today');
    eq(HW.rel('2026-10-30', '2026-10-26'), 'in 4 days', 'in 4 days');
    eq(HW.rel('2026-10-25', '2026-10-26'), '1 day late', '1 day late');
    eq(HW.rel('2026-10-23', '2026-10-26'), '3 days late', '3 days late');
    ok(!HW.isIso('2026-02-30'), '30 Feb is not a date'); ok(!HW.isIso(''), 'blank is not a date'); ok(HW.isIso('2028-02-29'), '2028 has 29 Feb');
    eq(HW.weekStart('2026-11-01'), '2026-10-26', 'Sunday belongs to the week starting Monday');
    eq(HW.daysText([5, 4, 3, 2, 1]), 'Mon to Fri', 'days text Mon to Fri');
    eq(HW.daysText([0, 1, 2, 3, 4]), 'Sun to Thu', 'days text Sun to Thu');
    eq(HW.daysText([1, 3]), 'Mon, Wed', 'days text custom');

    // ---- next school day per child ----
    var ali = { id: 'a', name: 'Ali', cls: 'Class 5', subjects: ['Maths'], days: [1, 2, 3, 4, 5], holidays: [] };
    var sara = { id: 's', name: 'Sara', cls: '', subjects: [], days: [1, 2, 3, 4, 5, 6], holidays: [] };
    var gulf = { id: 'g', name: 'Omar', cls: '', subjects: [], days: [0, 1, 2, 3, 4], holidays: [] };
    eq(HW.nextSchoolDay(ali, '2026-10-26'), '2026-10-27', 'Mon evening -> Tue');
    eq(HW.nextSchoolDay(ali, '2026-10-30'), '2026-11-02', 'Fri evening -> Mon for Mon-Fri');
    eq(HW.nextSchoolDay(sara, '2026-10-30'), '2026-10-31', 'Fri evening -> Sat for Mon-Sat');
    eq(HW.nextSchoolDay(gulf, '2026-10-29'), '2026-11-01', 'Thu evening -> Sun for Sun-Thu');
    eq(HW.nextSchoolDay(gulf, '2026-10-31'), '2026-11-01', 'Sat evening -> Sun for Sun-Thu');
    var hol = { id: 'h', name: 'H', cls: '', subjects: [], days: [1, 2, 3, 4, 5], holidays: [{ from: '2026-12-21', to: '2027-01-01', label: 'Winter break' }] };
    eq(HW.nextSchoolDay(hol, '2026-12-18'), '2027-01-04', 'skips the winter break');
    eq(HW.holidayOn(hol, '2026-12-25').label, 'Winter break', 'holiday found');
    eq(HW.nextSchoolDay({ days: [], holidays: [] }, '2026-10-26'), null, 'no school days -> none');

    // ---- the evening check ----
    function item(id, child, type, subject, text, due, extra) {
        var it = { id: id, childId: child, type: type, subject: subject, text: text, due: due, repeat: '', until: '', doneOn: '', doneDates: [], created: +id.replace(/\D/g, '') || 0 };
        Object.keys(extra || {}).forEach(function (k) { it[k] = extra[k]; });
        return it;
    }
    var st = HW.cleanState({ children: [ali, sara], items: [
        item('i1', 'a', 'homework', 'Maths', 'Exercise 4.2', '2026-10-27'),
        item('i2', 'a', 'homework', 'Urdu', 'Write 5 sentences', '2026-10-23'),          // late, 3 days
        item('i3', 'a', 'test', 'English', 'Poem by heart', '2026-10-29'),               // coming up Thu
        item('i4', 'a', 'homework', 'Science', 'Label the plant', '2026-10-27', { doneOn: '2026-10-26' }),
        item('i5', 's', 'reminder', 'PE', 'Bring the PE kit', '2026-10-28', { repeat: 'weekly' }),  // every Wed
        item('i6', 's', 'homework', 'English', 'Read page 12', '2026-10-27', { doneOn: '2026-10-26' }),
        item('i7', 'a', 'homework', 'Art', 'Colour the map', '2026-11-20'),              // more than a week away: not in coming up
        item('i8', 'a', 'project', 'Science', 'Water cycle poster', '2026-11-02'),
        item('i9', 'a', 'homework', '', 'Due today thing', '2026-10-26')
    ] });
    var tn = HW.tonight(st, '2026-10-26');
    eq(tn[0].next, '2026-10-27', 'Ali next school day');
    eq(tn[0].late.map(function (o) { return o.item.id; }), ['i2'], 'Ali late');
    eq(tn[0].dueToday.map(function (o) { return o.item.id; }), ['i9'], 'Ali due today not ticked');
    eq(tn[0].forNext.map(function (o) { return [o.item.id, o.done]; }), [['i1', false], ['i4', true]], 'Ali for Tuesday, done shown ticked');
    eq(tn[0].left, 1, 'Ali has 1 left for Tuesday');
    eq(tn[0].soon.map(function (o) { return o.item.id; }), ['i3', 'i8'], 'Ali coming up: test Thu, project Mon (homework not listed)');
    eq(tn[1].forNext.map(function (o) { return o.item.id; }), ['i6'], 'Sara for Tuesday');
    eq(tn[1].left, 0, 'Sara all done for Tuesday');
    var tue = HW.tonight(st, '2026-10-27');
    eq(tue[1].forNext.map(function (o) { return [o.item.id, o.date]; }), [['i5', '2026-10-28']], 'weekly PE kit shows on Tuesday evening for Wednesday');
    eq(HW.tonight(st, '2026-11-03')[1].forNext.map(function (o) { return o.date; }), ['2026-11-04'], 'weekly repeats next Wednesday');
    // Friday evening: Sara (Mon-Sat) is asked about Saturday; Ali about Monday, including anything put on the weekend
    var fri = HW.cleanState({ children: [ali, sara], items: [item('w1', 'a', 'homework', 'Maths', 'Weekend sheet', '2026-10-31'), item('w2', 'a', 'test', 'Urdu', 'Spelling', '2026-11-02')] });
    var tf = HW.tonight(fri, '2026-10-30');
    eq(tf[0].next, '2026-11-02', 'Ali Friday -> Monday');
    eq(tf[0].forNext.map(function (o) { return o.item.id; }), ['w1', 'w2'], 'weekend item and Monday test both for Monday, in date order');
    eq(tf[1].next, '2026-10-31', 'Sara Friday -> Saturday');

    // ---- the child's own list ----
    var plan = HW.childPlan(st, ali, '2026-10-26');
    eq(plan.late.map(function (o) { return o.item.id; }), ['i2'], 'plan late');
    eq(plan.open.map(function (o) { return o.item.id; }), ['i9', 'i1', 'i3', 'i8', 'i7'], 'plan open in date order');
    eq(plan.done.map(function (o) { return o.item.id; }), ['i4'], 'plan done');
    var sp = HW.childPlan(st, sara, '2026-10-29');
    eq(sp.open.length, 1, 'weekly item: only the next one shows, never piles up');
    eq(sp.late.length, 0, 'weekly item is never late');
    // ticking a weekly date
    var wk = st.items.filter(function (x) { return x.id === 'i5'; })[0];
    wk.doneDates.push('2026-10-28');
    eq(HW.tonight(st, '2026-10-27')[1].left, 0, 'weekly ticked for that Wednesday');
    eq(HW.tonight(st, '2026-11-03')[1].left, 1, 'next Wednesday is open again');
    eq(HW.occurrences(wk, '2026-10-01', '2026-11-11').map(function (o) { return o.date; }), ['2026-10-28', '2026-11-04', '2026-11-11'], 'weekly never before its first day');

    // ---- week view ----
    var w = HW.week(st, '2026-10-26');
    eq(w.length, 7, '7 days'); eq(w[1].date, '2026-10-27', 'Tuesday');
    eq(w[1].entries.map(function (o) { return o.child.name + ':' + o.item.id; }), ['Ali:i1', 'Ali:i4', 'Sara:i6'], 'Tuesday lists each child in order');
    eq(w[2].entries.map(function (o) { return o.item.id + ':' + o.done; }), ['i5:true'], 'Wednesday weekly ticked');
    ok(/Nothing written down this week/.test(HW.weekText(HW.cleanState({ children: [ali], items: [] }), '2026-10-26')), 'empty week text');

    // ---- copy text ----
    var txt = HW.tonightText(st, '2026-10-26');
    ok(txt.indexOf('Homework and tests, Monday 26 Oct 2026') === 0, 'text title');
    ok(txt.indexOf('Ali (Class 5)') > 0, 'text child with class');
    ok(txt.indexOf('- LATE, was due Fri 23 Oct: Urdu homework: Write 5 sentences') > 0, 'text late line');
    ok(txt.indexOf('For Tue 27 Oct (tomorrow):\n- Maths homework: Exercise 4.2\n- [done] Science homework: Label the plant') > 0, 'text for tomorrow');
    ok(txt.indexOf('- English test: Poem by heart, Thu 29 Oct (in 3 days)') > 0, 'text coming up');
    var txtH = HW.tonightText(HW.cleanState({ children: [hol], items: [] }), '2026-12-18');
    eq(HW.tonight(HW.cleanState({ children: [hol], items: [] }), '2026-12-11')[0].holiday, null, 'no holiday note on an ordinary weekend');
    ok(txtH.indexOf('No school: Winter break until Fri 1 Jan.') > 0 && txtH.indexOf('For Mon 4 Jan (in 17 days):\n- Nothing written down') > 0, 'text holiday');

    // ---- pasting the teacher's message ----
    eq(HW.splitPaste('English: learn the poem\nMaths - Ex 4.2 Q1-10\n\n Urdu: page 23 ', ''),
        [{ subject: 'English', text: 'learn the poem' }, { subject: 'Maths', text: 'Ex 4.2 Q1-10' }, { subject: 'Urdu', text: 'page 23' }], 'paste with subjects');
    eq(HW.splitPaste('1. Read chapter 2\n2) Learn words', 'English'), [{ subject: 'English', text: 'Read chapter 2' }, { subject: 'English', text: 'Learn words' }], 'numbered list keeps the picked subject');
    eq(HW.splitPaste('• Social studies: map of Asia', ''), [{ subject: 'Social studies', text: 'map of Asia' }], 'bullet with two-word subject');
    eq(HW.splitPaste('Note for parents please sign the diary today: thanks', 'X')[0].subject, 'X', 'long phrase before colon is not a subject');
    eq(HW.splitPaste('Q1-10 of 4.2', 'Maths'), [{ subject: 'Maths', text: 'Q1-10 of 4.2' }], 'a dash inside words is not a subject');
    eq(HW.splitPaste('', 'x'), [], 'blank paste');
    eq(HW.splitPaste(new Array(50).join('Maths: x\n'), '').length, 30, 'at most 30 lines');

    // ---- saved state is checked ----
    eq(HW.cleanState(null), { v: 1, children: [], items: [] }, 'null state');
    eq(HW.cleanState('junk').children.length, 0, 'junk state');
    var bad = HW.cleanState({ children: [{ id: 'x', name: '  ' }, { id: 'y', name: 'Zara', days: [9, 1, 1, 'x'], subjects: ['Art', 'Art', 5], holidays: [{ from: '2026-12-31', to: '2026-12-20' }, { from: 'bad' }] }, { id: 'y', name: 'Dup' }],
        items: [{ id: 'q', childId: 'nobody', due: '2026-10-26', text: 'x' }, { id: 'r', childId: 'y', due: '2026-13-01', text: 'x' }, { id: 's', childId: 'y', due: '2026-10-26', text: '', subject: '' },
            { id: 't', childId: 'y', due: '2026-10-26', type: 'evil', text: 'ok', doneOn: 'yesterday' }] });
    eq(bad.children.length, 1, 'nameless and duplicate children dropped');
    eq(bad.children[0].days, [1], 'bad days dropped');
    eq(bad.children[0].subjects, ['Art'], 'subjects cleaned');
    eq(bad.children[0].holidays, [{ from: '2026-12-20', to: '2026-12-31', label: '' }], 'holiday swapped, bad one dropped');
    eq(bad.items.map(function (i) { return [i.id, i.type, i.doneOn]; }), [['t', 'homework', '']], 'items cleaned');
    ok(HW.looksLikeBackup({ children: [], items: [] }) && !HW.looksLikeBackup({ foo: 1 }) && !HW.looksLikeBackup(null), 'backup shape');
    var long = HW.cleanState({ children: [{ id: 'l', name: new Array(100).join('A') }], items: [{ id: 'm', childId: 'l', due: '2026-10-26', text: new Array(900).join('b') }] });
    eq([long.children[0].name.length, long.items[0].text.length], [40, 600], 'very long text is cut to the limits');

    var out = pass + ' checks passed' + (fails.length ? ', ' + fails.length + ' FAILED:\n' + fails.join('\n') : '');
    if (typeof document !== 'undefined' && document.body) { var pre = document.createElement('pre'); pre.id = 'result'; pre.textContent = out; document.body.appendChild(pre); }
    if (typeof console !== 'undefined') console.log(out);
    if (typeof process !== 'undefined' && process.exitCode !== undefined && fails.length) process.exitCode = 1;
    if (typeof window !== 'undefined') window.TEST_RESULT = { pass: pass, fails: fails };
})();
