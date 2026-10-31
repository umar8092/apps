// Learner Driver Practice Log: the logic (no page code). Works in the browser (window.LearnerCore) and in node (require).
(function (root) {
    'use strict';

    // ---------- rules: hours a learner must log ----------
    // total and night in hours. lesson: each hour with a driving instructor counts as `mult` hours, up to `cap` logbook hours;
    // lessonNight false = lesson time does not count towards the night hours (NSW).
    const RULES = [
        { id: 'au-nsw', group: 'Australia', label: 'NSW, under 25', total: 120, night: 20, lesson: { mult: 3, cap: 30, night: false }, city: 'sydney' },
        { id: 'au-vic', group: 'Australia', label: 'Victoria, under 21', total: 120, night: 20, city: 'melbourne' },
        { id: 'au-qld', group: 'Australia', label: 'Queensland, under 25', total: 100, night: 10, lesson: { mult: 3, cap: 30, night: true }, city: 'brisbane' },
        { id: 'au-act', group: 'Australia', label: 'ACT, under 25', total: 100, night: 10, lesson: { mult: 3, cap: 30, night: true }, city: 'canberra' },
        { id: 'au-act25', group: 'Australia', label: 'ACT, 25 and over', total: 50, night: 5, city: 'canberra' },
        { id: 'au-sa', group: 'Australia', label: 'SA, under 25', total: 75, night: 15, city: 'adelaide' },
        { id: 'au-wa', group: 'Australia', label: 'Western Australia', total: 50, night: 5, city: 'perth' },
        { id: 'au-tas', group: 'Australia', label: 'Tasmania', total: 80, night: 15, lesson: { mult: 2, cap: 20, night: true }, city: 'hobart' },
        { id: 'us-ca', group: 'United States', label: 'California', total: 50, night: 10, city: 'losangeles' },
        { id: 'us-tx', group: 'United States', label: 'Texas', total: 30, night: 10, city: 'houston' },
        { id: 'us-fl', group: 'United States', label: 'Florida', total: 50, night: 10, city: 'miami' },
        { id: 'us-ny', group: 'United States', label: 'New York', total: 50, night: 15, city: 'newyork' },
        { id: 'us-pa', group: 'United States', label: 'Pennsylvania', total: 65, night: 10, weather: 5, city: 'philadelphia' },
        { id: 'us-50', group: 'United States', label: 'Most other states', total: 50, night: 10, city: 'chicago' },
        { id: 'custom', group: 'Other', label: 'My own goal or rule', total: 50, night: 10, city: '' }
    ];
    const ruleById = id => RULES.find(r => r.id === id) || null;

    const CITIES = [
        ['sydney', 'Sydney', -33.87, 151.21], ['melbourne', 'Melbourne', -37.81, 144.96], ['brisbane', 'Brisbane', -27.47, 153.03],
        ['canberra', 'Canberra', -35.28, 149.13], ['adelaide', 'Adelaide', -34.93, 138.6], ['perth', 'Perth', -31.95, 115.86],
        ['hobart', 'Hobart', -42.88, 147.33], ['darwin', 'Darwin', -12.46, 130.84], ['newcastle', 'Newcastle (NSW)', -32.93, 151.78],
        ['goldcoast', 'Gold Coast', -28.02, 153.4], ['townsville', 'Townsville', -19.26, 146.82],
        ['auckland', 'Auckland', -36.85, 174.76], ['wellington', 'Wellington', -41.29, 174.78], ['christchurch', 'Christchurch', -43.53, 172.64],
        ['losangeles', 'Los Angeles', 34.05, -118.24], ['sanfrancisco', 'San Francisco', 37.77, -122.42], ['sandiego', 'San Diego', 32.72, -117.16],
        ['houston', 'Houston', 29.76, -95.37], ['dallas', 'Dallas', 32.78, -96.8], ['miami', 'Miami', 25.76, -80.19], ['orlando', 'Orlando', 28.54, -81.38],
        ['newyork', 'New York City', 40.71, -74.01], ['buffalo', 'Buffalo', 42.89, -78.88], ['philadelphia', 'Philadelphia', 39.95, -75.17],
        ['pittsburgh', 'Pittsburgh', 40.44, -79.99], ['chicago', 'Chicago', 41.88, -87.63], ['atlanta', 'Atlanta', 33.75, -84.39],
        ['seattle', 'Seattle', 47.61, -122.33], ['phoenix', 'Phoenix', 33.45, -112.07], ['denver', 'Denver', 39.74, -104.99],
        ['boston', 'Boston', 42.36, -71.06], ['detroit', 'Detroit', 42.33, -83.05], ['columbus', 'Columbus (Ohio)', 39.96, -83.0],
        ['charlotte', 'Charlotte', 35.23, -80.84], ['anchorage', 'Anchorage', 61.22, -149.9], ['honolulu', 'Honolulu', 21.31, -157.86],
        ['toronto', 'Toronto', 43.65, -79.38], ['vancouver', 'Vancouver', 49.28, -123.12], ['montreal', 'Montreal', 45.5, -73.57],
        ['london', 'London', 51.51, -0.13], ['manchester', 'Manchester', 53.48, -2.24], ['glasgow', 'Glasgow', 55.86, -4.25],
        ['dublin', 'Dublin', 53.35, -6.26], ['karachi', 'Karachi', 24.86, 67.0], ['lahore', 'Lahore', 31.55, 74.34],
        ['islamabad', 'Islamabad', 33.68, 73.05], ['delhi', 'Delhi', 28.61, 77.21], ['mumbai', 'Mumbai', 19.08, 72.88],
        ['dubai', 'Dubai', 25.2, 55.27], ['riyadh', 'Riyadh', 24.71, 46.68], ['singapore', 'Singapore', 1.35, 103.82],
        ['johannesburg', 'Johannesburg', -26.2, 28.05], ['capetown', 'Cape Town', -33.92, 18.42]
    ].map(([id, name, lat, lon]) => ({ id, name, lat, lon }));
    const cityById = id => CITIES.find(c => c.id === id) || null;

    const ROADS = [
        ['local', 'Quiet local streets'], ['main', 'Busy main roads'], ['highway', 'Highway or motorway'], ['country', 'Country roads'],
        ['city', 'City centre or heavy traffic'], ['gravel', 'Gravel or dirt road'], ['rain', 'Rain'], ['snow', 'Fog, snow or ice']
    ].map(([id, label]) => ({ id, label }));
    const WEATHER = ['rain', 'snow'];
    const SKILLS = [
        ['start', 'Moving off and stopping smoothly'], ['turns', 'Turns and intersections'], ['roundabout', 'Roundabouts'],
        ['lanes', 'Changing lanes and merging'], ['hill', 'Hill start'], ['parallel', 'Parallel parking'], ['reversepark', 'Reverse parking into a bay'],
        ['threepoint', 'Three-point turn or U-turn'], ['reversing', 'Reversing in a straight line'], ['highway', 'Highway or motorway driving'],
        ['emergency', 'Emergency stop'], ['nightdrive', 'Driving at night']
    ].map(([id, label]) => ({ id, label }));

    // ---------- dates and times ----------
    const pad = n => String(n).padStart(2, '0');
    const isoOf = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    const todayIso = () => isoOf(new Date());
    function parseIso(s) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
        if (!m) return null;
        const y = +m[1], mo = +m[2], d = +m[3];
        if (y < 1990 || y > 2200 || mo < 1 || mo > 12 || d < 1) return null;
        const dt = new Date(y, mo - 1, d);
        return dt.getMonth() === mo - 1 && dt.getDate() === d ? { y, mo, d } : null;
    }
    function addDays(iso, n) { const p = parseIso(iso); const d = new Date(p.y, p.mo - 1, p.d + n); return isoOf(d); }
    function dayDiff(a, b) { const p = parseIso(a), q = parseIso(b); return Math.round((Date.UTC(q.y, q.mo - 1, q.d) - Date.UTC(p.y, p.mo - 1, p.d)) / 864e5); }
    // "7:05", "07:05", "705", "7.05", "7pm", "7:30 pm", "19:30" -> minutes after midnight, or null
    function parseTime(s) {
        let t = String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, '');
        if (!t) return null;
        let ap = null;
        const am = /^(.*?)(a|p)\.?m?\.?$/.exec(t);
        if (am) { t = am[1]; ap = am[2]; }
        let h, m;
        let x = /^(\d{1,2})(?:[:.h](\d{2}))?$/.exec(t);
        if (x) { h = +x[1]; m = x[2] ? +x[2] : 0; }
        else if ((x = /^(\d{1,2})(\d{2})$/.exec(t))) { h = +x[1]; m = +x[2]; }
        else return null;
        if (m > 59) return null;
        if (ap) { if (h < 1 || h > 12) return null; h = h % 12 + (ap === 'p' ? 12 : 0); }
        else if (h > 23 && !(h === 24 && m === 0)) return null;
        if (h === 24) h = 0;
        return h * 60 + m;
    }
    const hm = min => pad(Math.floor(min / 60)) + ':' + pad(min % 60);
    const localMs = (iso, min) => { const p = parseIso(iso); return new Date(p.y, p.mo - 1, p.d, Math.floor(min / 60), min % 60).getTime(); };

    // "86 h 30 min", "45 min", "0 min"
    function dur(min) {
        min = Math.max(0, Math.round(min));
        const h = Math.floor(min / 60), m = min % 60;
        if (!h) return m + ' min';
        return m ? h + ' h ' + m + ' min' : h + ' h';
    }
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    function niceDate(iso, withYear) {
        const p = parseIso(iso); if (!p) return iso;
        const d = new Date(p.y, p.mo - 1, p.d);
        return DAYS[d.getDay()] + ' ' + p.d + ' ' + MONTHS[p.mo - 1] + (withYear === false ? '' : ' ' + p.y);
    }

    // ---------- sunrise and sunset (sunrise equation, about 1 to 2 minutes accurate) ----------
    const RAD = Math.PI / 180;
    function sunTimes(iso, lat, lon) {
        const p = parseIso(iso);
        const jd = Date.UTC(p.y, p.mo - 1, p.d, 12) / 864e5 + 2440587.5;
        const n = Math.round(jd - 2451545.0 + 0.0008);
        const Js = n - lon / 360;
        const M = ((357.5291 + 0.98560028 * Js) % 360 + 360) % 360;
        const C = 1.9148 * Math.sin(M * RAD) + 0.02 * Math.sin(2 * M * RAD) + 0.0003 * Math.sin(3 * M * RAD);
        const L = ((M + C + 180 + 102.9372) % 360 + 360) % 360;
        const Jt = 2451545.0 + Js + 0.0053 * Math.sin(M * RAD) - 0.0069 * Math.sin(2 * L * RAD);
        const sd = Math.sin(L * RAD) * Math.sin(23.4397 * RAD), cd = Math.cos(Math.asin(sd));
        const cw = (Math.sin(-0.833 * RAD) - Math.sin(lat * RAD) * sd) / (Math.cos(lat * RAD) * cd);
        if (cw > 1) return { polar: 'night' };
        if (cw < -1) return { polar: 'day' };
        const w = Math.acos(cw) / RAD;
        const toMs = J => (J - 2440587.5) * 864e5;
        return { rise: toMs(Jt - w / 360), set: toMs(Jt + w / 360) };
    }
    const clockOf = ms => { const d = new Date(ms); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };

    // daylight (not night) intervals [a, b] in ms that can touch a drive on `iso`
    function dayIntervals(iso, night) {
        const out = [];
        for (let k = -1; k <= 1; k++) {
            const d = addDays(iso, k);
            if (night.mode === 'fixed') {
                // night runs from `from` to `to`; daylight is the rest
                const f = night.from, t = night.to;
                if (f === t) continue; // no daylight at all? treat as all night
                if (t < f) out.push([localMs(d, t), localMs(d, f)]);
                else { out.push([localMs(d, 0), localMs(d, f)]); out.push([localMs(d, t), localMs(addDays(d, 1), 0)]); }
            } else {
                const s = sunTimes(d, night.lat, night.lon);
                if (s.polar === 'day') out.push([localMs(d, 0), localMs(addDays(d, 1), 0)]);
                else if (!s.polar) out.push([s.rise, s.set]);
            }
        }
        return out;
    }
    // a drive's start and end as ms; end not after start means it ran past midnight
    function driveSpan(date, startMin, endMin) {
        const a = localMs(date, startMin);
        const b = endMin > startMin ? localMs(date, endMin) : localMs(addDays(date, 1), endMin);
        return { a, b, min: Math.round((b - a) / 6e4), overnight: endMin <= startMin };
    }
    function nightMinutes(date, startMin, endMin, night) {
        const s = driveSpan(date, startMin, endMin);
        if (s.min <= 0) return 0;
        let dayMs = 0;
        dayIntervals(date, night).forEach(([x, y]) => { const o = Math.min(y, s.b) - Math.max(x, s.a); if (o > 0) dayMs += o; });
        return Math.max(0, Math.min(s.min, s.min - Math.round(dayMs / 6e4)));
    }
    function nightDesc(night) {
        if (!night) return '';
        if (night.mode === 'fixed') return 'Night is ' + hm(night.from) + ' to ' + hm(night.to);
        return 'Night is sunset to sunrise in ' + (night.place || 'your area');
    }

    // ---------- checking a drive before it is saved ----------
    const MAX_MIN = 12 * 60;
    function checkDrive(f, learner, opts) {
        opts = opts || {};
        const errs = {}, warns = [];
        const now = opts.now != null ? opts.now : Date.now();
        const today = isoOf(new Date(now));
        if (!parseIso(f.date)) errs.date = 'Choose the date of the drive.';
        else if (f.date > today) errs.date = 'This date is in the future. Log a drive after you have driven.';
        else if (dayDiff(f.date, today) > 365 * 5) errs.date = 'This date is more than 5 years ago. Check the year.';
        const s = parseTime(f.start), e = parseTime(f.end);
        if (s == null) errs.start = String(f.start || '').trim() ? 'Type the time like 17:30 or 5:30 pm.' : 'Type the time you started.';
        if (e == null) errs.end = String(f.end || '').trim() ? 'Type the time like 18:45 or 6:45 pm.' : 'Type the time you finished.';
        let span = null;
        if (!errs.date && s != null && e != null) {
            if (s === e) errs.end = 'The finish time is the same as the start time.';
            else {
                span = driveSpan(f.date, s, e);
                if (span.min > MAX_MIN) errs.end = 'That is a ' + dur(span.min) + ' drive. Check the start and finish times (am or pm?).';
                else if (span.a > now + 5 * 6e4) errs.start = 'This start time has not happened yet.';
                else {
                    if (span.overnight) warns.push('Finished after midnight, on ' + niceDate(addDays(f.date, 1), false) + '.');
                    if (span.b > now + 5 * 6e4) warns.push('The finish time is later than now.');
                    if (span.min > 4 * 60) warns.push('A long drive of ' + dur(span.min) + ': check the times. Take a break every 2 hours.');
                    const clash = (learner && learner.drives || []).find(d => d.id !== opts.editId && (() => { const o = driveSpan(d.date, d.start, d.end); return o.a < span.b && span.a < o.b; })());
                    if (clash) errs.start = 'This overlaps another drive (' + niceDate(clash.date, false) + ', ' + hm(clash.start) + ' to ' + hm(clash.end) + ').';
                }
            }
        }
        let nightMin = null;
        if (span && !errs.start && !errs.end) {
            nightMin = learner && learner.night ? nightMinutes(f.date, s, e, learner.night) : 0;
            if (f.nightManual != null && f.nightManual !== '') {
                const nm = parseDur(f.nightManual);
                if (nm == null) errs.night = 'Type the night time in minutes, like 40, or as 1:10.';
                else if (nm > span.min) errs.night = 'Night time cannot be more than the whole drive (' + dur(span.min) + ').';
                else nightMin = nm;
            }
        }
        if (String(f.sup || '').trim().length > 60) errs.sup = 'Keep the name under 60 characters.';
        return { ok: !Object.keys(errs).length, errs, warns, start: s, end: e, min: span ? span.min : 0, nightMin };
    }
    // "40" min, "1:10", "1h 10", "1.5" hours? keep it simple: minutes or h:mm
    function parseDur(v) {
        const t = String(v == null ? '' : v).trim().toLowerCase();
        if (!t) return null;
        let m = /^(\d{1,3})$/.exec(t); if (m) return +m[1];
        m = /^(\d{1,2})[:h]\s*(\d{1,2})\s*(m|min)?$/.exec(t); if (m && +m[2] < 60) return +m[1] * 60 + +m[2];
        m = /^(\d{1,3})\s*(m|min|mins|minutes)$/.exec(t); if (m) return +m[1];
        return null;
    }

    // hours typed as "32", "32.5", "32,5" or "32:30" -> minutes (up to 1000 hours), or null
    function parseHours(v) {
        const t = String(v == null ? '' : v).trim().replace(',', '.');
        let m = /^(\d{1,4})(?:\.(\d{1,2}))?$/.exec(t);
        if (m) { const min = Math.round(parseFloat(t) * 60); return min <= 60000 ? min : null; }
        m = /^(\d{1,4}):(\d{2})$/.exec(t);
        if (m && +m[2] < 60) { const min = +m[1] * 60 + +m[2]; return min <= 60000 ? min : null; }
        return null;
    }

    // ---------- totals ----------
    function targetsOf(learner) {
        const r = ruleById(learner.rule) || ruleById('custom');
        if (r.id === 'custom') {
            const c = learner.custom || {};
            return { total: c.total, night: c.night || 0, weather: c.weather || 0, lesson: c.lessonMult > 1 ? { mult: c.lessonMult, cap: c.lessonCap || 0, night: true } : null, rule: r };
        }
        return { total: r.total, night: r.night, weather: r.weather || 0, lesson: r.lesson || null, rule: r };
    }
    function totals(learner) {
        const t = targetsOf(learner);
        let drive = 0, night = 0, lessonMin = 0, weather = 0;
        const n = (learner.drives || []).length;
        (learner.drives || []).forEach(d => {
            drive += d.min;
            if (d.lesson) lessonMin += d.min;
            if (!(d.lesson && t.lesson && t.lesson.night === false)) night += d.night;
            if ((d.roads || []).some(x => WEATHER.includes(x))) weather += d.min;
        });
        let bonus = 0;
        if (t.lesson && t.lesson.mult > 1 && t.lesson.cap > 0) {
            const eligible = Math.floor(t.lesson.cap * 60 / t.lesson.mult);
            bonus = Math.min(lessonMin, eligible) * (t.lesson.mult - 1);
        }
        const prior = learner.prior || { total: 0, night: 0 };
        const total = drive + bonus + (prior.total || 0);
        const nightAll = night + (prior.night || 0);
        const need = { total: t.total * 60, night: t.night * 60, weather: t.weather * 60 };
        const left = { total: Math.max(0, need.total - total), night: Math.max(0, need.night - nightAll), weather: Math.max(0, need.weather - weather) };
        const toGo = Math.max(left.total, left.night, left.weather);
        return { drives: n, drive, night: nightAll, nightDriven: night, lessonMin, bonus, weather, prior, total, need, left, toGo, done: toGo === 0, targets: t };
    }
    // pace: minutes a week over the last 4 weeks, or since the first drive if nothing in the last 4 weeks
    function pace(learner, today) {
        const ds = learner.drives || [];
        if (!ds.length) return null;
        const from = addDays(today, -27);
        const recent = ds.filter(d => d.date >= from && d.date <= today).reduce((a, d) => a + d.min, 0);
        if (recent > 0) return { perWeek: recent / 4, basis: 'last 4 weeks' };
        const first = ds.reduce((a, d) => d.date < a ? d.date : a, ds[0].date);
        const weeks = Math.max(1, (dayDiff(first, today) + 1) / 7);
        return { perWeek: ds.reduce((a, d) => a + d.min, 0) / weeks, basis: 'since the first drive' };
    }
    function finishEstimate(learner, today) {
        const t = totals(learner);
        if (t.done) return null;
        const p = pace(learner, today);
        if (!p || p.perWeek < 1) return null;
        // actual driving needed: night and weather are part of the total, so the slowest one decides
        const weeks = Math.ceil(t.toGo / p.perWeek);
        return { weeks, perWeek: Math.round(p.perWeek), basis: p.basis, date: addDays(today, weeks * 7) };
    }
    function skillStats(learner) {
        return SKILLS.map(s => {
            const ds = (learner.drives || []).filter(d => (d.skills || []).includes(s.id));
            const last = ds.reduce((a, d) => (!a || d.date > a) ? d.date : a, '');
            return { id: s.id, label: s.label, count: ds.length, last, confident: !!(learner.confident || {})[s.id] };
        });
    }
    function readiness(learner) {
        const t = totals(learner), sk = skillStats(learner);
        const notConfident = sk.filter(s => !s.confident);
        return { hoursDone: t.done, skillsDone: !notConfident.length, notConfident, ready: t.done && !notConfident.length };
    }

    // ---------- headline sentences ----------
    function headline(learner, today) {
        const t = totals(learner), lines = [];
        const tg = t.targets;
        let main = dur(t.total) + ' of ' + tg.total + ' hours';
        if (tg.night) main += ', ' + dur(t.night) + ' of ' + tg.night + ' at night';
        lines.push(main);
        if (t.done) {
            lines.push('All ' + tg.total + ' hours done' + (tg.night ? ', including ' + tg.night + ' at night' : '') + (tg.weather ? ' and ' + tg.weather + ' in bad weather' : '') + '.');
        } else {
            let s = dur(t.toGo) + ' of driving to go';
            const bits = [];
            if (t.left.night) bits.push(dur(t.left.night) + ' of it at night');
            if (t.left.weather) bits.push(dur(t.left.weather) + ' in bad weather');
            if (bits.length) s += ' (' + bits.join(', ') + ')';
            const f = finishEstimate(learner, today);
            if (f) s += ': about ' + f.weeks + (f.weeks === 1 ? ' week' : ' weeks') + ' at your pace of ' + dur(f.perWeek) + ' a week (around ' + niceDate(f.date) + ')';
            lines.push(s + '.');
        }
        return lines;
    }
    function summaryText(learner, today) {
        const t = totals(learner), tg = t.targets, out = [];
        out.push('Learner driver log: ' + (learner.name || 'Learner'));
        out.push('Rule: ' + (tg.rule.id === 'custom' ? 'own goal of ' + tg.total + ' hours, ' + tg.night + ' at night' : tg.rule.group + ', ' + tg.rule.label));
        headline(learner, today).forEach(l => out.push(l));
        if (t.bonus) out.push('Includes ' + dur(t.bonus) + ' bonus for ' + dur(t.lessonMin) + ' of lessons with an instructor.');
        if (t.prior.total) out.push('Includes ' + dur(t.prior.total) + ' logged before (' + dur(t.prior.night) + ' at night).');
        if (tg.weather) out.push('Bad weather: ' + dur(t.weather) + ' of ' + tg.weather + ' hours.');
        out.push(t.drives + (t.drives === 1 ? ' drive' : ' drives') + ', ' + dur(t.drive) + ' behind the wheel.');
        const sk = skillStats(learner);
        out.push('');
        out.push('Skills:');
        sk.forEach(s => out.push('- ' + s.label + ': ' + (s.count ? 'practised ' + s.count + (s.count === 1 ? ' time' : ' times') : 'not practised yet') + (s.confident ? ' (confident)' : '')));
        const ds = sortDrives(learner.drives || []);
        if (ds.length) {
            out.push('');
            out.push('Drives:');
            ds.forEach(d => out.push(driveLine(d)));
        }
        return out.join('\n');
    }
    function driveLine(d) {
        const parts = [niceDate(d.date), hm(d.start) + ' to ' + hm(d.end) + (d.end <= d.start ? ' (next day)' : ''), dur(d.min) + (d.night ? ', ' + dur(d.night) + ' at night' : '')];
        if (d.lesson) parts.push('lesson with an instructor');
        if (d.sup) parts.push('with ' + d.sup);
        if (d.car) parts.push(d.car);
        const roads = (d.roads || []).map(id => (ROADS.find(r => r.id === id) || {}).label).filter(Boolean);
        if (roads.length) parts.push(roads.join(', '));
        const sk = (d.skills || []).map(id => (SKILLS.find(s => s.id === id) || {}).label).filter(Boolean);
        if (sk.length) parts.push('practised: ' + sk.join(', '));
        if (d.notes) parts.push(d.notes);
        return parts.join(' · ');
    }
    const csvCell = v => { const s = String(v == null ? '' : v); return /[",\n\r]/.test(s) || /^[=+\-@]/.test(s) ? '"' + (/^[=+\-@]/.test(s) ? "'" : '') + s.replace(/"/g, '""') + '"' : s; };
    function csv(learner) {
        const rows = [['Date', 'Start', 'Finish', 'Minutes', 'Night minutes', 'Hours', 'Lesson with instructor', 'Supervisor', 'Car', 'Roads and conditions', 'Skills practised', 'Notes']];
        sortDrives(learner.drives || []).slice().reverse().forEach(d => rows.push([d.date, hm(d.start), hm(d.end), d.min, d.night, (d.min / 60).toFixed(2), d.lesson ? 'Yes' : '', d.sup, d.car,
            (d.roads || []).map(id => (ROADS.find(r => r.id === id) || {}).label).filter(Boolean).join('; '),
            (d.skills || []).map(id => (SKILLS.find(s => s.id === id) || {}).label).filter(Boolean).join('; '), d.notes]));
        return rows.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
    }
    // newest first
    const sortDrives = ds => ds.slice().sort((a, b) => a.date !== b.date ? (a.date < b.date ? 1 : -1) : b.start - a.start);

    // ---------- state ----------
    const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    function newLearner(name, ruleId) {
        const r = ruleById(ruleId) || ruleById('custom');
        const c = cityById(r.city);
        return {
            id: uid(), name: String(name || '').trim().slice(0, 40) || 'Learner', rule: r.id,
            custom: { total: 50, night: 10, weather: 0, lessonMult: 1, lessonCap: 0 },
            night: c ? { mode: 'sun', place: c.name, city: c.id, lat: c.lat, lon: c.lon } : { mode: 'fixed', from: 18 * 60, to: 6 * 60 },
            prior: { total: 0, night: 0 }, drives: [], confident: {}, live: null
        };
    }
    const emptyState = () => ({ v: 1, learners: [], cur: null });
    const str = (v, n) => typeof v === 'string' ? v.slice(0, n) : '';
    const intIn = (v, a, b) => Number.isInteger(v) && v >= a && v <= b;
    function validNight(n) {
        if (!n || typeof n !== 'object') return null;
        if (n.mode === 'fixed' && intIn(n.from, 0, 1439) && intIn(n.to, 0, 1439)) return { mode: 'fixed', from: n.from, to: n.to };
        if (n.mode === 'sun' && typeof n.lat === 'number' && typeof n.lon === 'number' && Math.abs(n.lat) <= 90 && Math.abs(n.lon) <= 180)
            return { mode: 'sun', place: str(n.place, 60) || 'your area', city: str(n.city, 30), lat: n.lat, lon: n.lon };
        return null;
    }
    function validDrive(d) {
        if (!d || typeof d !== 'object' || !parseIso(d.date) || !intIn(d.start, 0, 1439) || !intIn(d.end, 0, 1439) || d.start === d.end) return null;
        const sp = driveSpan(d.date, d.start, d.end);
        if (sp.min <= 0 || sp.min > MAX_MIN + 120) return null;
        const night = intIn(d.night, 0, sp.min) ? d.night : 0;
        return {
            id: str(d.id, 40) || uid(), date: d.date, start: d.start, end: d.end, min: sp.min, night, nightManual: !!d.nightManual,
            sup: str(d.sup, 60), car: str(d.car, 40), notes: str(d.notes, 500), lesson: !!d.lesson,
            roads: Array.isArray(d.roads) ? [...new Set(d.roads.filter(x => ROADS.some(r => r.id === x)))] : [],
            skills: Array.isArray(d.skills) ? [...new Set(d.skills.filter(x => SKILLS.some(s => s.id === x)))] : []
        };
    }
    function validLearner(l) {
        if (!l || typeof l !== 'object') return null;
        const base = newLearner(str(l.name, 40), ruleById(l.rule) ? l.rule : 'custom');
        base.id = str(l.id, 40) || base.id;
        const c = l.custom || {};
        base.custom = {
            total: intIn(c.total, 1, 500) ? c.total : 50, night: intIn(c.night, 0, 500) ? c.night : 10, weather: intIn(c.weather, 0, 500) ? c.weather : 0,
            lessonMult: [1, 2, 3].includes(c.lessonMult) ? c.lessonMult : 1, lessonCap: intIn(c.lessonCap, 0, 500) ? c.lessonCap : 0
        };
        if (base.custom.night > base.custom.total) base.custom.night = base.custom.total;
        base.night = validNight(l.night) || base.night;
        const p = l.prior || {};
        base.prior = { total: intIn(p.total, 0, 60000) ? p.total : 0, night: intIn(p.night, 0, 60000) ? p.night : 0 };
        if (base.prior.night > base.prior.total) base.prior.night = base.prior.total;
        const seen = new Set();
        base.drives = (Array.isArray(l.drives) ? l.drives : []).map(validDrive).filter(d => d && !seen.has(d.id) && seen.add(d.id)).slice(0, 5000);
        base.confident = {};
        if (l.confident && typeof l.confident === 'object') SKILLS.forEach(s => { if (l.confident[s.id] === true) base.confident[s.id] = true; });
        base.live = l.live && typeof l.live.a === 'number' && l.live.a > 1e12 ? { a: l.live.a } : null;
        return base;
    }
    function validate(s) {
        if (!s || typeof s !== 'object' || !Array.isArray(s.learners)) return null;
        const seen = new Set();
        const learners = s.learners.map(validLearner).filter(l => l && !seen.has(l.id) && seen.add(l.id)).slice(0, 20);
        const cur = learners.some(l => l.id === s.cur) ? s.cur : (learners[0] ? learners[0].id : null);
        return { v: 1, learners, cur };
    }

    const api = { RULES, CITIES, ROADS, SKILLS, WEATHER, ruleById, cityById, parseIso, isoOf, todayIso, addDays, dayDiff, parseTime, parseDur, hm, dur, niceDate,
        parseHours, sunTimes, clockOf, nightMinutes, nightDesc, driveSpan, checkDrive, targetsOf, totals, pace, finishEstimate, skillStats, readiness, headline,
        summaryText, driveLine, csv, sortDrives, newLearner, emptyState, validate, validDrive, uid, MAX_MIN };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.LearnerCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
