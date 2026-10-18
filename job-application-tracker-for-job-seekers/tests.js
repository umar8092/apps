// Logic checks for core.js. Run: node tests.js  (or open test.html in a browser)
(function () {
    const C = typeof module !== 'undefined' && module.exports !== undefined && typeof require === 'function' ? require('./core.js') : window.JobCore;
    let pass = 0, failed = 0; const out = [];
    const eq = (got, want, what) => { const g = JSON.stringify(got), w = JSON.stringify(want); if (g === w) pass++; else { failed++; out.push('FAIL ' + what + ': got ' + g + ', want ' + w); } };
    const T = '2026-10-18';   // a Sunday
    const S = { follow: 7, goal: 10, weekStart: 1, name: '' };
    let nid = 1;
    const job = o => Object.assign({ id: nid++, company: 'Co', role: 'Job', stage: 'applied', applied: '2026-10-10', where: '', how: '', link: '', salary: '', closes: '', contact: '', notes: '', followOn: '', interviews: [], history: [], added: T }, o);
    const form = o => Object.assign({ company: 'Acme Ltd', role: 'Sales Assistant', stage: 'applied', applied: T, where: 'Indeed', how: '', link: '', salary: '', closes: '', contact: '', notes: '', followOn: '', interviews: [] }, o);

    // ---- dates
    eq(C.addDays('2026-02-28', 1), '2026-03-01', 'add day over February');
    eq(C.addDays('2028-02-28', 1), '2028-02-29', 'leap year');
    eq(C.addDays('2026-12-31', 1), '2027-01-01', 'year end');
    eq(C.diff('2026-10-08', T), 10, 'diff 10 days');
    eq(C.shortDate('2026-10-22', T), 'Thu 22 Oct', 'short date');
    eq(C.shortDate('2027-01-04', T), 'Mon 4 Jan 2027', 'short date other year');
    eq(C.weekRange(T, 1), ['2026-10-12', '2026-10-18'], 'week Mon-Sun');
    eq(C.weekRange(T, 0), ['2026-10-18', '2026-10-24'], 'week Sun-Sat');
    eq(C.weekRange(T, 6), ['2026-10-17', '2026-10-23'], 'week Sat-Fri');
    eq(C.weekRange('2026-10-12', 1), ['2026-10-12', '2026-10-18'], 'week on its first day');
    eq(C.isIso('2026-02-30'), false, 'bad date');
    eq(C.isIso('2026-02-28'), true, 'good date');

    // ---- Amira's search on Sun 18 Oct 2026
    const acme = job({ company: 'Acme Ltd', role: 'Sales Assistant', applied: '2026-10-08', where: 'Indeed', how: 'Online form', history: [{ d: '2026-10-08', s: 'applied' }] });
    const beta = job({ company: 'Beta Ltd', role: 'Customer Service Advisor', stage: 'interview', applied: '2026-10-05', where: 'LinkedIn',
        interviews: [{ date: '2026-10-22', time: '10:00', kind: 'Video', notes: 'Prepare: a time I calmed an angry customer' }],
        history: [{ d: '2026-10-05', s: 'applied' }, { d: '2026-10-12', s: 'heard' }, { d: '2026-10-14', s: 'interview' }] });
    const gamma = job({ company: 'Gamma Foods', role: 'Warehouse Operative', stage: 'want', applied: '', closes: '2026-10-20', history: [{ d: '2026-10-16', s: 'want' }] });
    const delta = job({ company: 'Delta Bank', role: 'Admin Assistant', applied: '2026-10-12', where: 'Indeed', history: [{ d: '2026-10-12', s: 'applied' }] });
    const north = job({ company: 'Northside Council', role: 'Receptionist', applied: '2026-10-13', where: 'Job centre', how: 'In person', history: [{ d: '2026-10-13', s: 'applied' }] });
    const omega = job({ company: 'Omega Retail', role: 'Store Supervisor', applied: '2026-10-14', history: [{ d: '2026-10-14', s: 'applied' }] });
    const pine = job({ company: 'Pine Hotel', role: 'Front Desk Agent', applied: '2026-10-16', history: [{ d: '2026-10-16', s: 'applied' }] });
    const river = job({ company: 'River Clinic', role: 'Medical Receptionist', applied: '2026-10-17', history: [{ d: '2026-10-17', s: 'applied' }] });
    const star = job({ company: 'Star Cafe', role: 'Barista', stage: 'rejected', applied: '2026-09-30', history: [{ d: '2026-09-30', s: 'applied' }, { d: '2026-10-09', s: 'rejected' }] });
    const crown = job({ company: 'Crown Logistics', role: 'Office Assistant', stage: 'applied', applied: '2026-09-14', history: [{ d: '2026-09-14', s: 'applied' }] });
    const bright = job({ company: 'Bright Kids Nursery', role: 'Nursery Assistant', stage: 'offer', applied: '2026-09-28',
        interviews: [{ date: '2026-10-09', time: '14:30', kind: 'In person', notes: '' }], history: [{ d: '2026-09-28', s: 'applied' }, { d: '2026-10-02', s: 'interview' }, { d: '2026-10-16', s: 'offer' }] });
    const all = [acme, beta, gamma, delta, north, omega, pine, river, star, crown, bright];

    eq(C.status(acme, T, S).text, 'Follow up today: applied 10 days ago, no reply', 'acme follow up');
    eq(C.status(acme, T, S).kind, 'follow', 'acme kind');
    eq(C.status(beta, T, S).text, 'Interview Thu 22 Oct at 10:00, Video (in 4 days)', 'beta interview');
    eq(C.status(gamma, T, S).text, 'Apply by Tue 20 Oct (the advert closes in 2 days)', 'gamma closing');
    eq(C.status(gamma, T, S).urgent, true, 'closing in 2 days is urgent');
    eq(C.status(delta, T, S).text, 'Follow up Mon 19 Oct (tomorrow) if you hear nothing', 'delta wait');
    eq(C.status(river, T, S).text, 'Follow up Sat 24 Oct (in 6 days) if you hear nothing', 'river wait');
    eq(C.status(star, T, S).text, 'Rejected, Fri 9 Oct', 'star rejected');
    eq(C.status(bright, T, S).text, 'Offer Fri 16 Oct: give them your answer', 'bright offer');
    eq(C.status(crown, T, S).text, 'Follow up today: applied 34 days ago, no reply', 'crown long silence');
    eq(C.status(crown, T, S).late, true, 'crown suggests No reply');
    eq(C.status(acme, T, S).late, false, 'acme not 30 days');

    const sum = C.summary(all, T, S);
    eq(sum.todo.map(x => x.app.company), ['Bright Kids Nursery', 'Crown Logistics', 'Acme Ltd', 'Gamma Foods'], 'needs you today, in order');
    eq(sum.interviews.map(x => x.app.company), ['Beta Ltd'], 'coming interviews');
    eq(sum.week, { from: '2026-10-12', to: '2026-10-18', count: 5, goal: 10 }, 'this week 5 of 10');
    eq(C.weekLine(sum.week, T), { head: 'This week: 5 of 10 applications', range: 'Mon 12 Oct to Sun 18 Oct', left: '5 to go to reach your goal', pct: 50 }, 'week line');
    eq(C.weekLine({ from: '2026-10-12', to: '2026-10-18', count: 12, goal: 10 }, T).left, 'Goal reached. Well done!', 'goal passed');
    eq(C.weekLine({ from: '2026-10-12', to: '2026-10-18', count: 1, goal: 0 }, T).head, 'This week: 1 application', 'no goal, one');
    eq(sum.counts.applied, 7, 'count applied');
    eq(sum.counts.active, 10, 'count active');
    eq(sum.counts.closed, 1, 'count closed');
    eq(sum.counts.all, 11, 'count all');
    eq(C.sorted(all, T, S).map(a => a.company).slice(0, 5), ['Bright Kids Nursery', 'Crown Logistics', 'Acme Ltd', 'Beta Ltd', 'Gamma Foods'], 'list order');
    eq(C.sorted(all, T, S).map(a => a.company).slice(-1), ['Star Cafe'], 'closed at the end');

    // ---- follow-ups
    const acme2 = C.followedUp(acme, T);
    eq(C.status(acme2, T, S).text, 'Follow up Sun 25 Oct (in 7 days) if you hear nothing', 'after following up');
    eq(C.followedUp(acme2, T).history.filter(h => h.s === 'followup').length, 1, 'followed twice in a day counted once');
    eq(C.status(acme2, '2026-10-25', S).text, 'Follow up today: you followed up 7 days ago, no reply', 'a week after following up');
    eq(C.status(job({ followOn: '2026-10-21', applied: '2026-10-08' }), T, S).text, 'Follow up Wed 21 Oct (in 3 days) if you hear nothing', 'manual follow-up date');
    eq(C.status(job({ followOn: '2026-10-18', applied: '2026-10-17' }), T, S).text, 'Follow up today: the day you chose', 'manual date today');
    eq(C.followedUp(job({ followOn: '2026-10-18' }), T).followOn, '', 'following up clears the manual date');
    eq(C.status(job({ applied: '2026-10-08' }), T, { follow: 14, goal: 0, weekStart: 1 }).text, 'Follow up Thu 22 Oct (in 4 days) if you hear nothing', 'follow after 14 days');
    const heard = job({ stage: 'heard', applied: '2026-10-01', history: [{ d: '2026-10-01', s: 'applied' }, { d: '2026-10-10', s: 'heard' }] });
    eq(C.status(heard, T, S).text, 'Follow up today: they last replied 8 days ago', 'heard back follow up');
    const pastIv = job({ stage: 'interview', applied: '2026-10-01', interviews: [{ date: '2026-10-11', time: '', kind: 'Phone', notes: '' }], history: [{ d: '2026-10-01', s: 'applied' }, { d: '2026-10-05', s: 'interview' }] });
    eq(C.status(pastIv, T, S).text, 'Follow up today: the interview was 7 days ago, no news', 'after a past interview');
    eq(C.status(job({ stage: 'interview', interviews: [{ date: T, time: '09:30', kind: 'Phone', notes: '' }] }), T, S).text, 'Interview today at 09:30, Phone', 'interview today');
    eq(C.status(job({ stage: 'interview', interviews: [{ date: '2026-10-19', time: '', kind: 'In person', notes: '' }] }), T, S).text, 'Interview tomorrow, Mon 19 Oct, In person', 'interview tomorrow, no time');
    eq(C.status(job({ stage: 'interview', interviews: [{ date: '2026-10-25', time: '', kind: 'Other', notes: '' }, { date: '2026-10-20', time: '15:00', kind: 'Phone', notes: '' }] }), T, S).text,
        'Interview Tue 20 Oct at 15:00, Phone (in 2 days)', 'earliest interview first');
    // reopening a rejected job
    const re = C.setStage(star, 'applied', T);
    eq(re.stage, 'applied', 'reopened');
    eq(C.status(re, T, S).text, 'Follow up Sun 25 Oct (in 7 days) if you hear nothing', 'reopened counts from today');
    eq(C.status(re, '2026-10-25', S).text, 'Follow up today: you reopened it 7 days ago', 'reopened reason');
    eq(C.setStage(gamma, 'applied', T).applied, T, 'applying from want sets today');
    eq(C.setStage(acme, 'applied', T), acme, 'same stage no change');
    eq(C.setStage(acme, 'bogus', T), acme, 'unknown stage ignored');

    // ---- want to apply
    eq(C.status(job({ stage: 'want', applied: '', closes: T }), T, S).text, 'Apply today: the advert closes today', 'closes today');
    eq(C.status(job({ stage: 'want', applied: '', closes: '2026-10-16' }), T, S).text, 'The advert closed Fri 16 Oct (2 days ago)', 'advert closed');
    eq(C.status(job({ stage: 'want', applied: '', closes: '2026-10-30' }), T, S).urgent, false, 'closing in 12 days not urgent');
    eq(C.status(job({ stage: 'want', applied: '' }), T, S).text, 'Not applied yet', 'want, no closing date');
    eq(C.status(job({ stage: 'noreply', history: [{ d: '2026-10-16', s: 'noreply' }] }), T, S).text, 'No reply, Fri 16 Oct', 'no reply');
    eq(C.status(job({ stage: 'withdrew' }), T, S).text, 'You withdrew', 'withdrew, no date');

    // ---- form
    let r = C.readForm(form({}), T, null);
    eq(r.ok, true, 'basic form ok');
    eq(r.app.history, [{ d: T, s: 'applied' }], 'history on add');
    eq(r.app.added, T, 'added date');
    r = C.readForm(form({ company: '  ', role: '' }), T, null);
    eq(Object.keys(r.errors), ['company', 'role'], 'blank company and role');
    eq(C.readForm(form({ applied: '2026-10-19' }), T, null).errors, { applied: 'The day you applied cannot be after today.' }, 'future applied');
    eq(C.readForm(form({ applied: '' }), T, null).ok, false, 'applied needed');
    eq(C.readForm(form({ stage: 'want', applied: '' }), T, null).app.applied, '', 'want needs no applied date');
    eq(C.readForm(form({ stage: 'want', applied: '2026-10-01' }), T, null).app.applied, '', 'want drops the applied date');
    eq(C.readForm(form({ company: 'x'.repeat(81) }), T, null).ok, false, 'very long company');
    eq(C.readForm(form({ link: 'indeed.com/viewjob?jk=1' }), T, null).app.link, 'https://indeed.com/viewjob?jk=1', 'link without https');
    eq(C.readForm(form({ link: 'call me maybe' }), T, null).ok, false, 'not a link');
    eq(C.readForm(form({ link: 'javascript:alert(1)' }), T, null).ok, false, 'javascript link refused');
    eq(C.readForm(form({ interviews: [{ date: '', time: '', kind: 'Phone', notes: '' }] }), T, null).errors, { iv0: 'Choose the interview date, or tap "Remove this interview".' }, 'blank interview');
    r = C.readForm(form({ stage: 'applied', interviews: [{ date: '2026-10-22', time: '10:00', kind: 'Video', notes: 'n' }] }), T, null);
    eq([r.app.stage, r.moved], ['interview', true], 'an interview moves the stage');
    eq(r.app.history, [{ d: T, s: 'applied' }, { d: T, s: 'interview' }], 'history for interview add');
    r = C.readForm(form({ stage: 'heard', applied: '2026-10-01' }), T, null);
    eq(r.app.history, [{ d: '2026-10-01', s: 'applied' }, { d: T, s: 'heard' }], 'adding an older job already heard back');
    // edit keeps history and adds a change
    r = C.readForm(form({ stage: 'rejected', applied: '2026-10-08' }), T, acme);
    eq(r.app.id, acme.id, 'edit keeps id');
    eq(r.app.history, [{ d: '2026-10-08', s: 'applied' }, { d: T, s: 'rejected' }], 'edit adds stage change');
    eq(C.readForm(form({ notes: 'a'.repeat(6000) }), T, null).app.notes.length, 5000, 'very long notes cut');
    eq(C.readForm(form({ company: '<b>Acme</b>' }), T, null).app.company, '<b>Acme</b>', 'text kept as text');

    // ---- duplicates
    eq(C.duplicates('acme ltd', 'Sales Assistant', all, 0, T), 'You already have this job: Sales Assistant at Acme Ltd (Applied, applied Thu 8 Oct). Save anyway only if it is a new advert.', 'same job twice');
    eq(C.duplicates('ACME', 'Manager', all, 0, T), 'You have another job at Acme Ltd: Sales Assistant (Applied).', 'same company other job');
    eq(C.duplicates('Acme Ltd', 'Sales Assistant', all, acme.id, T), '', 'editing itself is not a duplicate');
    eq(C.duplicates('New Co', 'x', all, 0, T), '', 'no duplicate');
    eq(C.duplicates('', 'x', all, 0, T), '', 'blank company');

    // ---- pasting
    eq(C.parsePaste('Sales Assistant - Acme Ltd | LinkedIn https://www.linkedin.com/jobs/view/123'), { link: 'https://www.linkedin.com/jobs/view/123', role: 'Sales Assistant', company: 'Acme Ltd', where: 'LinkedIn' }, 'paste linkedin');
    eq(C.parsePaste('Acme Ltd hiring Sales Assistant in London, England'), { link: '', role: 'Sales Assistant', company: 'Acme Ltd', where: '' }, 'paste hiring');
    eq(C.parsePaste('Barista at Star Cafe'), { link: '', role: 'Barista', company: 'Star Cafe', where: '' }, 'paste at');
    eq(C.parsePaste('https://uk.indeed.com/viewjob?jk=abc.'), { link: 'https://uk.indeed.com/viewjob?jk=abc', role: '', company: '', where: 'Indeed' }, 'paste only a link');
    eq(C.parsePaste('Warehouse Operative'), { link: '', role: 'Warehouse Operative', company: '', where: '' }, 'paste only a title');
    eq(C.parsePaste('   '), { link: '', role: '', company: '', where: '' }, 'paste blank');
    eq(C.sourceFromLink('https://example.com/jobs'), '', 'unknown site');

    // ---- record for the job centre
    const acmeF = C.followedUp(acme, '2026-10-15');
    const rec = C.recordText([acmeF, beta, delta, north, star, gamma], '2026-10-12', '2026-10-18', 'Amira Khan');
    eq(rec.text, ['Job search record for Amira Khan: Mon 12 Oct 2026 to Sun 18 Oct 2026', '2 applications, 0 interviews, 1 follow-up',
        '', 'Mon 12 Oct 2026', '- Applied: Admin Assistant, Delta Bank (found on Indeed). Now: Applied.',
        '', 'Tue 13 Oct 2026', '- Applied: Receptionist, Northside Council (found on Job centre, applied in person). Now: Applied.',
        '', 'Thu 15 Oct 2026', '- Followed up: Sales Assistant, Acme Ltd.'].join('\n'), 'record text');
    const rec2 = C.recordText([beta], '2026-10-19', '2026-10-25', '');
    eq(rec2.text.split('\n').slice(0, 5), ['Job search record: Mon 19 Oct 2026 to Sun 25 Oct 2026', '0 applications, 1 interview, 0 follow-ups', '', 'Thu 22 Oct 2026', '- Interview at 10:00 (Video): Customer Service Advisor, Beta Ltd.'], 'record with interview');
    eq(C.recordText([], T, T, '').text.split('\n').pop(), 'Nothing recorded in these dates.', 'empty record');

    // ---- CSV and calendar
    const c = C.csv([job({ company: 'A, "B"', role: '=SUM(1)', notes: 'line1\nline2' })]);
    eq(c.split('\r\n')[1].slice(0, 30), '"A, ""B""","\'=SUM(1)",Applied,', 'csv quoting and formula guard');
    eq(c.charCodeAt(0), 0xfeff, 'csv has BOM for Excel');
    const ics = C.ics(beta, beta.interviews[0], '20261018T050000Z', 'https://x/');
    eq(ics.indexOf('DTSTART:20261022T100000') > 0 && ics.indexOf('DTEND:20261022T110000') > 0, true, 'ics times');
    eq(ics.indexOf('SUMMARY:Interview: Customer Service Advisor at Beta Ltd (Video)') > 0, true, 'ics summary');
    const late = C.ics(beta, { date: '2026-10-22', time: '23:30', kind: 'Phone', notes: 'a;b,c' }, 'x', 'u');
    eq(late.indexOf('DTEND:20261023T003000') > 0, true, 'ics crosses midnight');
    eq(late.indexOf('a\\;b\\,c') > 0, true, 'ics escapes');
    eq(C.ics(beta, { date: '2026-10-22', time: '', kind: 'Other', notes: '' }, 'x', 'u').indexOf('DTSTART;VALUE=DATE:20261022') > 0, true, 'ics all day');

    // ---- saved state
    eq(C.validate(null), null, 'null state');
    eq(C.validate({ apps: 'x' }), null, 'bad apps');
    const v = C.validate({ nid: 2, apps: [{ id: 1, company: 'A', role: 'B', stage: 'zzz', applied: '2026-13-01', added: '2026-10-01', interviews: [{ date: 'bad' }, { date: '2026-10-20', time: '25:00', kind: 'x' }], history: [{ d: 'no', s: 'x' }] },
        { id: 1, company: 'C', role: 'D', stage: 'want' }, { company: '', role: 'x' }, 5, null], settings: { follow: 999, goal: 5, weekStart: 3 } });
    eq(v.apps.length, 2, 'bad rows dropped');
    eq(v.apps[0].stage, 'applied', 'bad stage fixed');
    eq(v.apps[0].applied, '2026-10-01', 'bad applied falls back to added');
    eq(v.apps[0].interviews, [{ date: '2026-10-20', time: '', kind: 'Other', notes: '' }], 'interviews cleaned');
    eq(v.apps[1].id !== v.apps[0].id, true, 'duplicate ids fixed');
    eq(v.nid > v.apps[1].id, true, 'next id above all');
    eq(v.settings, { follow: 7, goal: 5, weekStart: 1, name: '' }, 'settings cleaned');
    eq(C.validate(C.emptyState()).apps, [], 'empty state ok');
    eq(C.validate({ apps: [{ company: 'A', role: 'B', link: 'javascript:alert(1)', applied: '2026-10-01' }] }).apps[0].link, '', 'bad link dropped on restore');

    const msg = (failed ? out.join('\n') + '\n' : '') + pass + ' passed, ' + failed + ' failed';
    if (typeof document !== 'undefined') { const p = document.createElement('pre'); p.textContent = msg; document.body.appendChild(p); }
    else { console.log(msg); if (failed) process.exitCode = 1; }
})();
