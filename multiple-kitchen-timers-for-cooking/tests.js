// Checks for core.js. Run: node tests.js   (or open test.html in a browser)
(function () {
    const K = typeof require !== 'undefined' ? (require('./core.js'), globalThis.KitchenTimers) : window.KitchenTimers;
    let pass = 0; const fails = [];
    const eq = (got, want, name) => { if (JSON.stringify(got) === JSON.stringify(want)) pass++; else fails.push(name + ': got ' + JSON.stringify(got) + ', want ' + JSON.stringify(want)); };
    const { MIN, SEC, HOUR } = K;
    const T0 = new Date(2026, 9, 17, 18, 30, 0).getTime();   // Sat 17 Oct 2026, 6:30 pm
    const clock = t => { const d = new Date(t); const h = d.getHours(); return (h % 12 || 12) + ':' + String(d.getMinutes()).padStart(2, '0') + (h < 12 ? ' am' : ' pm'); };
    const st = () => { const s = K.fresh(); return s; };

    // parsing the length
    eq(K.parseLength('', '6', '30'), { ms: 390000 }, '6 min 30 s');
    eq(K.parseLength('1', '15', ''), { ms: 75 * MIN }, '1 h 15 min');
    eq(K.parseLength('', '90', ''), { ms: 90 * MIN }, '90 minutes allowed');
    eq(K.parseLength('', '1,5', ''), { ms: 90 * SEC }, 'comma decimal minutes');
    eq(K.parseLength('0.5', '', ''), { ms: 30 * MIN }, 'half an hour');
    eq(K.parseLength(' ', ' ', '45 '), { ms: 45 * SEC }, 'spaces trimmed');
    eq(K.parseLength('24', '', ''), { ms: 24 * HOUR }, '24 h is the limit');
    eq(K.parseLength('24', '0', '1').error, 'The longest timer is 24 hours.', 'over 24 h refused');
    eq(K.parseLength('', '', '').error, 'Choose how long, for example tap 10 min.', 'blank refused');
    eq(K.parseLength('0', '0', '0').error, 'Choose how long, for example tap 10 min.', 'zero refused');
    eq(K.parseLength('', '', '0.4').error, 'Choose how long, for example tap 10 min.', 'under a second refused');
    eq(K.parseLength('', '-5', ''), { error: 'Time cannot be below 0.', field: 'm' }, 'negative refused');
    eq(K.parseLength('', 'ten', ''), { error: 'Type the minutes as a number, for example 5.', field: 'm' }, 'words refused');
    eq(K.parseLength('', '5', '1e3').field, 's', '1e3 refused');
    eq(K.parseLength('99999', '', '').error, 'The longest timer is 24 hours.', 'huge refused');
    eq(K.parseLength('', '', '0.6'), { ms: SEC }, 'rounds to whole seconds');

    // showing time
    eq(K.fmt(390000), '6:30', 'fmt 6:30');
    eq(K.fmt(389001), '6:30', 'fmt rounds up');
    eq(K.fmt(1), '0:01', 'never 0:00 while running');
    eq(K.fmt(0), '0:00', 'fmt 0');
    eq(K.fmt(HOUR + 5 * SEC), '1:00:05', 'fmt hours');
    eq(K.fmt(24 * HOUR), '24:00:00', 'fmt 24 h');
    eq(K.fmtWords(390000), '6 min 30 s', 'words');
    eq(K.fmtWords(75 * MIN), '1 h 15 min', 'words h');
    eq(K.fmtWords(45 * SEC), '45 s', 'words s');
    eq(K.splitLength(3725000), { h: 1, m: 2, s: 5 }, 'split');
    eq(K.agoText(30 * SEC), 'Done just now', 'ago now');
    eq(K.agoText(2 * MIN + 59 * SEC), 'Done 2 min ago', 'ago min');
    eq(K.agoText(125 * MIN), 'Done 2 h 5 min ago', 'ago h');
    eq(K.agoText(3 * HOUR), 'Done 3 h ago', 'ago whole h');
    eq(K.agoText(72 * HOUR), 'Done 3 days ago', 'ago days');
    eq(K.whenText(T0 + 12 * MIN, T0, clock), 'at 6:42 pm', 'ends today');
    eq(K.whenText(T0 + 6 * HOUR, T0, clock), 'tomorrow at 12:30 am', 'ends after midnight');
    eq(K.whenText(T0 + 24 * HOUR, T0, clock), 'tomorrow at 6:30 pm', '24 h later');

    // names
    eq(K.cleanName('  Rice \n  on   the hob '), 'Rice on the hob', 'pasted name cleaned');
    eq(K.cleanName('x'.repeat(80)).length, 60, 'long name cut to 60');
    let s = st();
    eq(K.addTimer(s, '', 5 * MIN, T0).timer.name, 'Timer 1', 'blank name -> Timer 1');
    eq(K.addTimer(s, ' ', 5 * MIN, T0).timer.name, 'Timer 2', 'next -> Timer 2');
    s.timers.shift();
    eq(K.addTimer(s, '', 5 * MIN, T0).timer.name, 'Timer 1', 'gap reused');
    eq(new Set(s.timers.map(t => t.id)).size, s.timers.length, 'ids unique');

    // the main situation: rice 15 min, pasta 10 min, garlic bread 6 min 30 s, started together at 6:30 pm
    s = st();
    const rice = K.addTimer(s, 'Rice', 15 * MIN, T0).timer;
    const pasta = K.addTimer(s, 'Pasta', 10 * MIN, T0).timer;
    const bread = K.addTimer(s, 'Garlic bread', 390000, T0).timer;
    eq(K.sorted(s.timers, T0).map(t => t.name), ['Garlic bread', 'Pasta', 'Rice'], 'ends first on top');
    eq(K.whenText(rice.endAt, T0, clock), 'at 6:45 pm', 'rice ends 6:45');
    eq(K.whenText(bread.endAt, T0, clock), 'at 6:36 pm', 'bread ends 6:36');
    eq(K.tick(s, T0 + 390000 - 1).length, 0, 'not done a ms early');
    eq(K.tick(s, T0 + 390000).map(t => t.name), ['Garlic bread'], 'bread done on time');
    eq(K.isRinging(bread, T0 + 390000), true, 'bread rings');
    eq(K.sorted(s.timers, T0 + 391000).map(t => t.name), ['Garlic bread', 'Pasta', 'Rice'], 'ringing stays on top');
    K.silence(bread);
    eq(K.isRinging(bread, T0 + 400000), false, 'stop alarm');
    eq(K.sorted(s.timers, T0 + 400000).map(t => t.name), ['Pasta', 'Rice', 'Garlic bread'], 'finished go to the bottom');
    eq(K.leftOf(rice, T0 + 400000), 15 * MIN - 400000, 'rice left');
    // phone locked for 20 minutes: both finish, earliest first
    eq(K.tick(s, T0 + 20 * MIN).map(t => t.name), ['Pasta', 'Rice'], 'two finish while away, earliest first');
    eq([pasta.endedAt, rice.endedAt], [T0 + 10 * MIN, T0 + 15 * MIN], 'ended at the real end time');
    eq(K.agoText(T0 + 20 * MIN - rice.endedAt), 'Done 5 min ago', 'rice done 5 min ago');
    eq(K.tick(s, T0 + 24 * MIN), [], 'no double finish');
    eq(pasta.silenced, true, 'pasta stops ringing by itself after 10 min');
    eq(rice.silenced, false, 'rice still ringing after 9 min');
    K.tick(s, T0 + 25 * MIN);
    eq(rice.silenced, true, 'rice stops at exactly 10 min');

    // pause, resume, +1 min, restart, change
    s = st();
    const t = K.addTimer(s, 'Oven', 20 * MIN, T0).timer;
    eq(K.pause(t, T0 + 5 * MIN), true, 'pause');
    eq(K.leftOf(t, T0 + 50 * MIN), 15 * MIN, 'paused time does not move');
    eq(K.tick(s, T0 + 2 * HOUR), [], 'paused never finishes');
    eq(K.pause(t, T0), false, 'pause twice does nothing');
    K.resume(t, T0 + 60 * MIN);
    eq(t.endAt, T0 + 75 * MIN, 'resume ends 15 min later');
    K.addMinute(t, T0 + 60 * MIN);
    eq(K.leftOf(t, T0 + 60 * MIN), 16 * MIN, '+1 min while running');
    eq(Math.round(K.progress(t, T0 + 60 * MIN) * 100), 24, 'progress after +1 (5 of 21)');
    K.pause(t, T0 + 61 * MIN); K.addMinute(t, T0 + 61 * MIN);
    eq(K.leftOf(t, T0 + 99 * MIN), 16 * MIN, '+1 min while paused');
    K.restart(t, T0 + 100 * MIN);
    eq([t.status, K.leftOf(t, T0 + 100 * MIN), t.total], ['running', 20 * MIN, 20 * MIN], 'restart uses the length');
    K.tick(s, T0 + 121 * MIN);
    eq(t.status, 'done', 'done');
    K.addMinute(t, T0 + 122 * MIN);
    eq([t.status, K.leftOf(t, T0 + 122 * MIN), t.silenced], ['running', MIN, false], '+1 min on a finished timer runs 1 more minute');
    eq(K.change(t, 'Roast potatoes', 45 * MIN, T0 + 123 * MIN), true, 'change');
    eq([t.name, t.length, K.leftOf(t, T0 + 123 * MIN)], ['Roast potatoes', 45 * MIN, 45 * MIN], 'change name and time');
    eq(K.change(t, '  ', 10 * MIN, T0), true, 'blank name keeps the old one');
    eq(t.name, 'Roast potatoes', 'name kept');
    eq(K.change(t, 'x', 0, T0), false, 'change to 0 refused');
    K.pause(t, T0 + MIN); K.change(t, 'Roast potatoes', 30 * MIN, T0 + 2 * MIN);
    eq([t.status, t.left], ['paused', 30 * MIN], 'change keeps paused');
    const big = K.addTimer(s, 'Dough', 24 * HOUR, T0).timer;
    eq(K.addMinute(big, T0), false, '+1 min cannot pass 24 h');
    eq(K.addTimer(s, 'x', 0, T0).error, 'Choose a length from 1 second to 24 hours.', 'add 0 refused');

    // limits
    s = st(); s.timers = [];
    for (let i = 0; i < 20; i++) K.addTimer(s, 'T' + i, MIN, T0);
    eq(K.addTimer(s, 'one more', MIN, T0).error, 'You have 20 timers. Remove one you no longer need first.', '20 timers max');

    // saved timers
    s = st();
    eq(s.favs.map(f => f.name), ['Soft-boiled egg', 'Hard-boiled egg', 'Pasta', 'White rice', 'Tea'], 'starter saved timers');
    eq(!!K.addFav(s, 'pasta', 10 * MIN).exists, true, 'same name and time is not saved twice');
    eq(!!K.addFav(s, 'Pasta', 12 * MIN).fav, true, 'same name, other time is fine');
    eq(K.addFav(s, '  ', 10 * MIN).error, 'Give the timer a name first.', 'nameless refused');
    eq(new Set(s.favs.map(f => f.id)).size, s.favs.length, 'fav ids unique');

    // saved data: corrupt, odd, restored
    eq(K.sanitize('{oops').favs.length, 5, 'corrupt JSON -> fresh start');
    eq(K.sanitize(null).timers, [], 'null -> fresh');
    eq(K.sanitize([1, 2]).timers, [], 'array -> fresh');
    const back = K.sanitize(JSON.stringify(s));
    eq(back.favs.length, s.favs.length, 'favs round trip');
    s = st(); K.addTimer(s, 'Rice', 15 * MIN, T0); K.pause(K.addTimer(s, 'Eggs', 6 * MIN, T0).timer, T0 + MIN);
    const r = K.sanitize(JSON.parse(JSON.stringify(s)));
    eq(r.timers.map(x => [x.name, x.status]), [['Rice', 'running'], ['Eggs', 'paused']], 'timers round trip');
    eq(K.addTimer(r, 'New', MIN, T0).timer.id !== r.timers[0].id && K.addTimer(r, 'New2', MIN, T0).timer.id !== r.timers[1].id, true, 'no id clash after restore');
    const bad = K.sanitize({ timers: [{ id: 'a', status: 'running', length: 5000 }, { id: 'b', status: 'boiling', length: 5000, endAt: 1 },
        { id: 'c', status: 'paused', length: 5000, left: 0 }, { id: 'd', status: 'running', length: 1e12, endAt: 5 }, { id: '<x>', status: 'done', length: 5000 },
        { id: 'e', name: '<img src=x>', status: 'done', length: 5000, endedAt: 5 }, { id: 'e', status: 'done', length: 5000 }],
        favs: [{ id: 'f1', name: '', ms: 5000 }, { id: 'f2', name: 'Eggs', ms: -4 }, { id: 'f3', name: 'Tea', ms: 180400 }], settings: { sound: 'siren', vibrate: 'yes', awake: false } });
    eq(bad.timers.map(x => x.id), ['e'], 'broken timers dropped, duplicate id dropped');
    eq(bad.timers[0].name, '<img src=x>', 'name kept as plain text');
    eq(bad.favs.map(f => [f.name, f.ms]), [['Tea', 180000]], 'broken favs dropped, ms whole seconds');
    eq(bad.settings, { sound: 'beeps', vibrate: true, awake: false, notify: false }, 'settings validated');
    eq(K.sanitize({ favs: [] }).favs, [], 'removed all saved timers stays empty');
    eq(K.sanitize({}).favs.length, 5, 'no favs field gets the starters');

    const out = pass + ' passed, ' + fails.length + ' failed';
    if (typeof document !== 'undefined') { document.getElementById('out').textContent = out + '\n' + fails.join('\n'); }
    else { console.log(out); fails.forEach(f => console.log('FAIL ' + f)); if (fails.length) process.exit(1); }
})();
