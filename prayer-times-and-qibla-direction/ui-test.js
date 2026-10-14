// Drives the real page in headless Chromium: node ui-test.js [--shots] [--base https://umar8092.github.io/apps]
// Without --base it serves this repo on localhost. With --base it tests the LIVE page.
// The clock is Wed 14 Oct 2026, 15:00 in Karachi (10:00 UTC); the device is in Karachi. The city search is mocked.
const pw = (() => { for (const m of ['playwright', 'playwright-core']) { try { return require(m); } catch (e) { /* next */ } } throw new Error('playwright not found'); })();
const path = require('path'), fs = require('fs'), http = require('http');
const PT = require('./core.js');
const bi = process.argv.indexOf('--base');
const shots = process.argv.includes('--shots');
let fail = 0, url;
const ok = (name, cond, extra) => { if (!cond) fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond || extra == null ? '' : '  -> ' + JSON.stringify(extra))); };
const NOW = Date.UTC(2026, 9, 14, 10, 0);
const KEY = 'prayer-times-and-qibla-direction.state';
const CITIES = {
    karachi: [{ name: 'Karachi', latitude: 24.8607, longitude: 67.0011, country_code: 'PK', country: 'Pakistan', admin1: 'Sindh', timezone: 'Asia/Karachi' },
        { name: 'Karachi', latitude: 33.9, longitude: 72.1, country_code: 'PK', country: 'Pakistan', admin1: 'Punjab', timezone: 'Asia/Karachi' }],
    london: [{ name: 'London', latitude: 51.5085, longitude: -0.1257, country_code: 'GB', country: 'United Kingdom', admin1: 'England', timezone: 'Europe/London' }],
    'new york': [{ name: 'New York', latitude: 40.7143, longitude: -74.006, country_code: 'US', country: 'United States', admin1: 'New York', timezone: 'America/New_York' }]
};

function serve() {
    const ROOT = path.resolve(__dirname, '..');
    const types = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml', png: 'image/png', webmanifest: 'application/manifest+json' };
    return new Promise(res => {
        const s = http.createServer((req, rs) => {
            let p = decodeURIComponent(req.url.split('?')[0]).replace(/^\/apps/, ''); if (p.endsWith('/')) p += 'index.html';
            const f = path.join(ROOT, p);
            if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rs.writeHead(404); return rs.end('nf'); }
            rs.writeHead(200, { 'content-type': types[f.split('.').pop()] || 'application/octet-stream' }); rs.end(fs.readFileSync(f));
        }).listen(0, () => res(s));
    });
}

async function load(b, vp, opt = {}) {
    const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: vp.width < 500 ? 2 : 1, colorScheme: opt.theme || 'dark', locale: opt.locale || 'en-US', timezoneId: opt.tz || 'Asia/Karachi',
        permissions: ['clipboard-read', 'clipboard-write'], acceptDownloads: true, serviceWorkers: 'block' });
    await ctx.route(/goatcounter\.com|gc\.zgo\.at/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
    await ctx.route(/geocoding-api\.open-meteo\.com/, r => {
        if (opt.searchDown) return r.abort();
        const name = new URL(r.request().url()).searchParams.get('name').toLowerCase();
        r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CITIES[name] ? { results: CITIES[name] } : { generationtime_ms: 0.1 }) });
    });
    if (opt.blockStorage) await ctx.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
    if (opt.state !== undefined) await ctx.addInitScript(([k, s]) => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem(k, s); } }, [KEY, typeof opt.state === 'string' ? opt.state : JSON.stringify(opt.state)]);
    const page = await ctx.newPage();
    page.errors = [];
    page.on('pageerror', e => page.errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') page.errors.push(m.text()); });
    await page.clock.install({ time: opt.time || NOW });
    await page.goto(url, { waitUntil: 'load' });
    return { ctx, page };
}
const txt = (page, sel) => page.locator(sel).innerText();
async function addCity(page, q, pick = 0) {
    if (await page.locator('#add-open').isVisible()) await page.click('#add-open');
    await page.fill('#q', q); await page.press('#q', 'Enter');
    await page.locator('#results .result').nth(pick).click();
}
const times = page => page.$$eval('#plist .prow', rows => rows.map(r => r.querySelector('.pn').textContent + ' ' + r.querySelector('.pt').textContent));

(async () => {
    let srv;
    if (bi >= 0) url = process.argv[bi + 1].replace(/\/$/, '') + '/prayer-times-and-qibla-direction/';
    else { srv = await serve(); url = 'http://localhost:' + srv.address().port + '/apps/prayer-times-and-qibla-direction/'; }
    const b = await pw.chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
    const K = { lat: 24.8607, lon: 67.0011, tz: 'Asia/Karachi', id: 'k', name: 'Karachi' };
    const exp = (pl, d, clock) => PT.timesFor(pl, d).list.map(x => x.name + ' ' + PT.fmtTime(x.min, clock || '12'));

    // ---- first use, search, the main situation ----
    let { ctx, page } = await load(b, { width: 390, height: 860 });
    ok('first use: empty message shown', await page.locator('#times-empty').isVisible());
    ok('first use: qibla, settings and month hidden', !(await page.locator('#qibla').isVisible()) && !(await page.locator('#settings').isVisible()) && !(await page.locator('#month').isVisible()));
    ok('first use: search form open, no Cancel', await page.locator('#q').isVisible() && !(await page.locator('#add-close').isVisible()));
    ok('first use: manual coordinates are optional (hidden)', !(await page.locator('#manual').isVisible()));
    await page.click('#search');
    ok('blank search asks for 2 letters', /at least 2 letters/.test(await txt(page, '#search-msg')));
    await page.fill('#q', 'Atlantis'); await page.click('#search');
    await page.waitForFunction(() => /No place/.test(document.getElementById('search-msg').textContent));
    ok('unknown place: clear message', /No place called "Atlantis"/.test(await txt(page, '#search-msg')));
    await page.fill('#q', 'karachi'); await page.press('#q', 'Enter');
    await page.waitForSelector('#results .result');
    ok('search lists both Karachis with province', (await page.$$eval('#results .parea', e => e.map(x => x.textContent))).join('|') === 'Sindh, Pakistan|Punjab, Pakistan');
    await page.locator('#results .result').first().click();
    ok('Karachi gets the Karachi method and Hanafi Asr', /University of Islamic Sciences, Karachi\. Asr: Hanafi/.test(await txt(page, '#method-line')));
    const want = ['Fajr 5:13 am', 'Sunrise 6:29 am', 'Dhuhr 12:18 pm', 'Asr 4:28 pm', 'Maghrib 6:06 pm', 'Isha 7:22 pm'];
    ok('Karachi 14 Oct 2026 times exact', JSON.stringify(await times(page)) === JSON.stringify(want), await times(page));
    ok('core gives the same', JSON.stringify(exp(Object.assign({ method: 'karachi', asr: 'hanafi' }, K), '2026-10-14')) === JSON.stringify(want));
    ok('next prayer line', (await txt(page, '#next-main')) === 'Next: Asr at 4:28 pm, in 1 h 28 min', await txt(page, '#next-main'));
    ok('now line', (await txt(page, '#next-sub')) === 'Now: Dhuhr time');
    ok('Dhuhr row marked Now, Asr Next, Fajr past', await page.locator('.prow.dhuhr.now').count() === 1 && await page.locator('.prow.asr.is-next').count() === 1 && await page.locator('.prow.fajr.past').count() === 1);
    ok('heading names the city', (await txt(page, '#times-h')) === 'Prayer times today in Karachi');
    ok('Gregorian and Hijri date', (await txt(page, '#d-greg')) === 'Wednesday 14 October 2026' && (await txt(page, '#d-hijri')) === '3 Jumada al-Awwal 1448 AH');
    ok('zone line, same zone as device', /Karachi local time \(Asia\/Karachi, UTC\+5\)\.$/.test(await txt(page, '#zone')), await txt(page, '#zone'));
    ok('qibla 268 degrees west', (await txt(page, '#q-main')) === '268° from north (west)', await txt(page, '#q-main'));
    ok('qibla distance', /2,800 km away from Karachi/.test(await txt(page, '#q-sub')), await txt(page, '#q-sub'));
    ok('arrow turned to 267.74', (await page.getAttribute('#arrow', 'transform')) === 'rotate(267.74 100 100)');
    ok('place box shows Showing tag', /Showing/.test(await txt(page, '.pbox.current')));
    ok('added message', /Added Karachi\. Method: Karachi, Asr: Hanafi/.test(await txt(page, '#place-msg')));
    ok('search form closed after adding', !(await page.locator('#q').isVisible()) && await page.locator('#add-open').isVisible());

    // ---- settings ----
    await page.selectOption('#asr', 'standard');
    const std = PT.fmtTime(PT.timesFor(Object.assign({ method: 'karachi', asr: 'standard' }, K), '2026-10-14').list[3].min, '12');
    ok('standard Asr is earlier (' + std + ')', (await txt(page, '.prow.asr .pt')) === std && std < '4:28 pm');
    await page.selectOption('#asr', 'hanafi');
    await page.click('#adj-box summary');
    await page.fill('#adj-maghrib', '2'); await page.press('#adj-maghrib', 'Tab');
    ok('Maghrib +2 minutes', (await txt(page, '.prow.maghrib .pt')) === '6:08 pm');
    ok('adjustments noted', /minute adjustments are included/.test(await txt(page, '#method-line')) && /\(in use\)/.test(await txt(page, '#adj-box summary')));
    await page.fill('#adj-isha', '999'); await page.press('#adj-isha', 'Tab');
    ok('999 minutes refused, value restored', (await page.inputValue('#adj-isha')) === '0' && (await txt(page, '.prow.isha .pt')) === '7:22 pm');
    await page.fill('#adj-fajr', '-3'); await page.press('#adj-fajr', 'Tab');
    ok('negative adjustment allowed', (await txt(page, '.prow.fajr .pt')) === '5:10 am');
    await page.fill('#adj-dhuhr', '1.6'); await page.press('#adj-dhuhr', 'Tab');
    ok('decimal minutes rounded', (await txt(page, '.prow.dhuhr .pt')) === '12:20 pm');
    await page.click('#adj-reset');
    ok('Set all to 0', (await txt(page, '.prow.maghrib .pt')) === '6:06 pm' && (await txt(page, '.prow.fajr .pt')) === '5:13 am');
    await page.locator('#day-msg .link-btn').click();
    ok('undo brings adjustments back', (await txt(page, '.prow.maghrib .pt')) === '6:08 pm');
    await page.click('#adj-reset');
    await page.selectOption('#method', 'mwl');
    ok('MWL changes Isha', (await txt(page, '.prow.isha .pt')) === PT.fmtTime(PT.timesFor(Object.assign({ method: 'mwl', asr: 'hanafi' }, K), '2026-10-14').list[5].min, '12'));
    await page.selectOption('#method', 'custom');
    ok('own angles fields appear', await page.locator('#c-fajr').isVisible());
    await page.fill('#c-fajr', '25'); await page.press('#c-fajr', 'Tab');
    ok('25 degrees refused', /10 to 22/.test(await txt(page, '#c-err')));
    await page.fill('#c-fajr', '15'); await page.press('#c-fajr', 'Tab');
    ok('Fajr 15 degrees used', (await txt(page, '#c-err')) === '' && (await txt(page, '.prow.fajr .pt')) === PT.fmtTime(PT.timesFor(Object.assign({ method: 'custom', custom: { fajr: 15, isha: 17 }, asr: 'hanafi' }, K), '2026-10-14').list[0].min, '12'));
    await page.check('#c-ishamin-on');
    ok('Isha 90 min after Maghrib', (await txt(page, '.prow.isha .pt')) === '7:36 pm', await txt(page, '.prow.isha .pt'));
    await page.selectOption('#method', 'makkah');
    ok('Umm al-Qura Isha 90 min after Maghrib', (await txt(page, '.prow.isha .pt')) === '7:36 pm');
    await page.selectOption('#method', 'karachi');
    await page.selectOption('#clock', '24');
    ok('24-hour clock', (await txt(page, '.prow.asr .pt')) === '16:28' && /16:28/.test(await txt(page, '#next-main')));
    await page.selectOption('#clock', '12');
    await page.selectOption('#hijri-adj', '-1');
    ok('Islamic date one day earlier', (await txt(page, '#d-hijri')) === '2 Jumada al-Awwal 1448 AH');
    await page.selectOption('#hijri-adj', '0');

    // ---- other days ----
    await page.click('#next-day');
    ok('next day: another-day note, no countdown', await page.locator('#other-day').isVisible() && !(await page.locator('#next').isVisible()));
    ok('next day heading and date', (await txt(page, '#times-h')) === 'Prayer times in Karachi' && (await txt(page, '#d-greg')) === 'Thursday 15 October 2026');
    ok('next day times', JSON.stringify(await times(page)) === JSON.stringify(exp(Object.assign({ method: 'karachi', asr: 'hanafi' }, K), '2026-10-15')));
    await page.click('#to-today2');
    ok('back to today', (await txt(page, '#d-greg')) === 'Wednesday 14 October 2026' && await page.locator('#next').isVisible());
    await page.fill('#day', '2150-12-31'); await page.dispatchEvent('#day', 'change');
    ok('last allowed day: Next day disabled', await page.locator('#next-day').isDisabled());
    await page.fill('#day', '2027-02-10'); await page.dispatchEvent('#day', 'change');
    ok('a Ramadan day shows the Islamic month', /Ramadan 1448 AH/.test(await txt(page, '#d-hijri')));
    await page.click('#to-today2');

    // ---- copy ----
    await page.click('#copy-day');
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    ok('copied text has the times, method and qibla', /Prayer times for Karachi on Wednesday 14 October 2026 \(3 Jumada al-Awwal 1448 AH\)/.test(clip) && /Asr: 4:28 pm/.test(clip) && /Qibla: 268° from north/.test(clip), clip);
    ok('copy message', /Copied/.test(await txt(page, '#day-msg')));

    // ---- month ----
    ok('month: October 2026 with 31 rows', (await txt(page, '#month-h')) === 'October 2026' && await page.locator('#mbody tr').count() === 31);
    ok('month: today highlighted', (await txt(page, '#mbody tr.today th')) === 'Wed 14');
    ok('month: row matches the day', (await page.$$eval('#mbody tr.today td', t => t.map(x => x.textContent))).join(' ') === '5:13 6:29 12:18 4:28 6:06 7:22');
    await page.click('#next-month');
    ok('month: next is November, 30 rows', (await txt(page, '#month-h')) === 'November 2026' && await page.locator('#mbody tr').count() === 30);
    await page.click('#prev-month'); await page.click('#prev-month'); await page.click('#prev-month');
    ok('month: back past the year start', (await txt(page, '#month-h')) === 'August 2026');
    await page.click('#next-month'); await page.click('#next-month');
    await page.click('#copy-month');
    const mclip = await page.evaluate(() => navigator.clipboard.readText());
    ok('copy month has 31 day lines', mclip.split('\n').filter(l => /^\w{3} \d+\t/.test(l)).length === 31);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#ics-month')]);
    const ics = fs.readFileSync(await dl.path(), 'utf8');
    ok('calendar file name', dl.suggestedFilename() === 'prayer-times-karachi-2026-10.ics', dl.suggestedFilename());
    ok('calendar file: 155 prayers with alerts, no sunrise', (ics.match(/BEGIN:VEVENT/g) || []).length === 155 && (ics.match(/BEGIN:VALARM/g) || []).length === 155 && !/Sunrise/.test(ics));
    ok('calendar file: Asr 14 Oct at 11:28 UTC', /DTSTART:20261014T112800Z\r\nDTEND:20261014T114300Z\r\nSUMMARY:Asr \(Karachi\)/.test(ics));

    // ---- compass ----
    const orient = (alpha) => page.evaluate(a => window.dispatchEvent(new DeviceOrientationEvent('deviceorientationabsolute', { alpha: a, beta: 0, gamma: 0, absolute: true })), alpha);
    await page.click('#compass');
    await orient(360 - 200);
    ok('compass: turn right 68', (await txt(page, '#q-live')) === 'Turn right by 68°.', await txt(page, '#q-live'));
    await orient(360 - 300);
    ok('compass: turn left 32', (await txt(page, '#q-live')) === 'Turn left by 32°.');
    await orient(360 - 266);
    ok('compass: facing the Qibla', (await txt(page, '#q-live')) === 'You are facing the Qibla.');
    await page.click('#compass');
    ok('compass stops', (await txt(page, '#compass')) === 'Use phone compass' && !(await page.getAttribute('#dial-rot', 'transform')));
    await page.click('#compass');
    await page.clock.runFor(4500);
    ok('no compass readings: clear message', /No compass reading/.test(await txt(page, '#q-live')));

    // ---- second place in another time zone ----
    await addCity(page, 'London');
    ok('London: MWL and standard Asr', /Muslim World League\. Asr: standard/.test(await txt(page, '#method-line')));
    const L = { lat: 51.5085, lon: -0.1257, tz: 'Europe/London', id: 'l', name: 'London', method: 'mwl', asr: 'standard' };
    ok('London times in London time', JSON.stringify(await times(page)) === JSON.stringify(exp(L, '2026-10-14')), await times(page));
    ok('London zone note mentions device', /UTC\+1\)\. Your device is on UTC\+5/.test(await txt(page, '#zone')), await txt(page, '#zone'));
    const lnn = PT.nowAndNext(L, NOW);
    ok('London countdown uses London time (next ' + lnn.next.name + ')', (await txt(page, '#next-main')).startsWith('Next: ' + lnn.next.name + ' at ' + PT.fmtTime(lnn.next.min, '12') + ', in ' + PT.fmtLeft(lnn.next.at - NOW)), await txt(page, '#next-main'));
    ok('two place boxes', await page.locator('.pbox').count() === 2);
    await addCity(page, 'karachi');
    ok('adding Karachi again just switches', /already in your places/.test(await txt(page, '#place-msg')) && await page.locator('.pbox').count() === 2 && /Karachi/.test(await txt(page, '#times-h')));
    await page.locator('.pbox', { hasText: 'London' }).locator('button', { hasText: 'Remove' }).click();
    ok('remove London', await page.locator('.pbox').count() === 1);
    await page.locator('#place-msg .link-btn').click();
    ok('undo brings London back', await page.locator('.pbox').count() === 2);
    await page.locator('.pbox', { hasText: 'London' }).locator('button', { hasText: 'Show' }).click();
    ok('Show switches place', /London/.test(await txt(page, '#times-h')) && /Settings for London/.test(await txt(page, '#settings-h')));
    await page.click('#hl-box summary'); await page.selectOption('#highlat', 'middle');
    await page.locator('.pbox', { hasText: 'Karachi' }).locator('button', { hasText: 'Show' }).click();
    ok('each place keeps its own settings', (await page.inputValue('#asr')) === 'hanafi' && (await page.inputValue('#highlat')) === 'angle');

    // ---- reload keeps everything ----
    await page.reload({ waitUntil: 'load' });
    ok('reload: both places, Karachi showing', await page.locator('.pbox').count() === 2 && /Karachi/.test(await txt(page, '#times-h')));
    await page.locator('.pbox', { hasText: 'London' }).locator('button', { hasText: 'Show' }).click();
    ok('reload: London rule kept', (await page.inputValue('#highlat')) === 'middle');
    ok('reload: 12-hour clock from the device (en-US)', (await page.inputValue('#clock')) === '12');
    const saved = await page.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
    ok('saved under the app key', saved.places.length === 2);

    // ---- time passes ----
    await page.locator('.pbox', { hasText: 'Karachi' }).locator('button', { hasText: 'Show' }).click();
    await page.clock.setSystemTime(Date.UTC(2026, 9, 14, 15, 0)); await page.evaluate(() => window.__ptTest.tick());
    ok('after Isha: next is Fajr tomorrow', /^Next: Fajr at 5:14 am tomorrow, in 9 h 14 min$/.test(await txt(page, '#next-main')), await txt(page, '#next-main'));
    ok('after Isha: now Isha', (await txt(page, '#next-sub')) === 'Now: Isha time');
    await page.clock.setSystemTime(Date.UTC(2026, 9, 14, 19, 0, 30)); await page.evaluate(() => window.__ptTest.tick());
    ok('midnight rollover: new date', (await txt(page, '#d-greg')) === 'Thursday 15 October 2026' && (await txt(page, '#mbody tr.today th')) === 'Thu 15');
    ok('after midnight: still Isha time, Fajr next', (await txt(page, '#next-sub')) === 'Now: Isha time' && /^Next: Fajr at 5:14 am, in 5 h 14 min$/.test(await txt(page, '#next-main')), await txt(page, '#next-main'));
    await page.clock.setSystemTime(Date.UTC(2026, 9, 15, 4, 0)); await page.evaluate(() => window.__ptTest.tick());
    ok('between sunrise and Dhuhr', /no prayer time/.test(await txt(page, '#next-sub')) && /^Next: Dhuhr/.test(await txt(page, '#next-main')));
    await page.clock.setSystemTime(Date.UTC(2026, 9, 15, 0, 20)); await page.evaluate(() => window.__ptTest.tick());
    ok('Fajr time ends at sunrise', (await txt(page, '#next-sub')) === 'Now: Fajr time (ends at sunrise)' && /^Next: Sunrise/.test(await txt(page, '#next-main')));
    ok('no errors in the main run', page.errors.length === 0, page.errors);

    // ---- light theme switch ----
    await page.click('.theme-toggle');
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    ok('light/dark switch changes the look', /^rgb\(2[0-9]{2}, 2[0-9]{2}, 2[0-9]{2}\)$/.test(bg), bg);
    await ctx.close();

    // ---- manual coordinates, far north, polar day ----
    ({ ctx, page } = await load(b, { width: 320, height: 800 }, { tz: 'Europe/Oslo' }));
    await page.click('#manual-open');
    await page.fill('#m-lat', 'abc'); await page.click('#m-add');
    ok('bad latitude refused', /Latitude must be/.test(await txt(page, '#m-err')));
    await page.fill('#m-lat', '95'); await page.click('#m-add');
    ok('latitude 95 refused', /Latitude must be/.test(await txt(page, '#m-err')));
    await page.fill('#m-lat', '59.91 N'); await page.fill('#m-lon', '200'); await page.click('#m-add');
    ok('longitude 200 refused', /Longitude must be/.test(await txt(page, '#m-err')));
    await page.fill('#m-lon', '10,75'); await page.fill('#m-name', 'Home in Oslo'); await page.press('#m-name', 'Enter');
    ok('manual place added with device zone and own name', /Home in Oslo/.test(await txt(page, '.pbox.current')) && /Europe\/Oslo/.test(await txt(page, '#zone')));
    ok('manual place shows coordinates', /59\.91 N, 10\.75 E/.test(await txt(page, '.pbox.current .parea')));
    await page.fill('#day', '2026-06-21'); await page.dispatchEvent('#day', 'change');
    const O = { lat: 59.91, lon: 10.75, tz: 'Europe/Oslo', id: 'o', name: 'o', method: 'mwl', asr: 'standard' };
    ok('Oslo midsummer uses the far-north rule, all six times shown', (await page.locator('#polar').isHidden()) && JSON.stringify(await times(page)) === JSON.stringify(exp(O, '2026-06-21')), await times(page));
    ok('month table marks Isha after midnight with am', /00?:\d\d am|12:\d\d am/.test(await page.$$eval('#mbody tr', r => r.map(x => x.lastChild.textContent).join(' '))));
    ok('far-north hint', /far from the equator, so in summer/.test(await page.locator('#hl-hint').textContent()));
    await page.click('#add-open'); await page.click('#manual-open');
    await page.fill('#m-lat', '69.65'); await page.fill('#m-lon', '18.96'); await page.fill('#m-name', 'Tromso'); await page.click('#m-add');
    await page.fill('#day', '2026-06-21'); await page.dispatchEvent('#day', 'change');
    ok('polar day: warning and dashes', await page.locator('#polar').isVisible() && /sun does not rise or set/.test(await txt(page, '#polar')) && (await txt(page, '.prow.sunrise .pt')) === '--');
    ok('polar day: Dhuhr still shown', (await txt(page, '.prow.dhuhr .pt')) !== '--');
    await page.click('#to-today2');
    ok('polar place in October is normal', await page.locator('#polar').isHidden());
    ok('no errors (manual, polar)', page.errors.length === 0, page.errors);
    await ctx.close();

    // ---- search down, storage blocked, corrupt state ----
    ({ ctx, page } = await load(b, { width: 390, height: 800 }, { searchDown: true }));
    await page.fill('#q', 'Lahore'); await page.click('#search');
    await page.waitForFunction(() => /not answering|No connection/.test(document.getElementById('search-msg').textContent));
    ok('search down: clear message pointing to latitude and longitude', /latitude and longitude/.test(await txt(page, '#search-msg')));
    await ctx.close();
    ({ ctx, page } = await load(b, { width: 390, height: 800 }, { blockStorage: true }));
    await addCity(page, 'New York');
    ok('storage blocked: still works for the visit (ISNA)', /ISNA/.test(await txt(page, '#method-line')) && page.errors.length === 0, page.errors);
    await ctx.close();
    for (const bad of ['{bad', '[]', JSON.stringify({ places: [{ lat: 'x' }, { lat: 10, lon: 10, tz: 'Mars/Base' }, null], current: 5, clock: 'x', hijriAdj: 99 })]) {
        ({ ctx, page } = await load(b, { width: 390, height: 800 }, { state: bad }));
        ok('corrupt saved state starts fresh: ' + bad.slice(0, 20), await page.locator('#times-empty').isVisible() && page.errors.length === 0, page.errors);
        await ctx.close();
    }
    const half = JSON.stringify({ places: [{ id: 'a', name: '<img src=x onerror=alert(1)>', lat: 24.86, lon: 67, tz: 'Asia/Karachi', method: 'nope', asr: 'x', adj: { fajr: 500, isha: 'a' } }], current: 'zz' });
    ({ ctx, page } = await load(b, { width: 390, height: 800 }, { state: half }));
    ok('partly bad state: place kept, bad values fixed, name shown as text', (await txt(page, '.pbox .pname')) === '<img src=x onerror=alert(1)>' && /Muslim World League/.test(await txt(page, '#method-line')) && (await page.inputValue('#adj-fajr')) === '0');
    await ctx.close();

    // ---- layout with filled state at every width ----
    const full = { places: [
        { id: 'k', name: 'Karachi', area: 'Sindh, Pakistan', country: 'PK', lat: 24.8607, lon: 67.0011, tz: 'Asia/Karachi', method: 'karachi', asr: 'hanafi', adj: { maghrib: 2 } },
        { id: 'l', name: 'London', area: 'England, United Kingdom', country: 'GB', lat: 51.5085, lon: -0.1257, tz: 'Europe/London', method: 'mwl', asr: 'standard' },
        { id: 'x', name: 'Llanfairpwllgwyngyllgogerychwyrndrobwllllantysiliogogogoch', area: 'Wales, United Kingdom of Great Britain and Northern Ireland', country: 'GB', lat: 53.22, lon: -4.2, tz: 'Europe/London', method: 'custom', asr: 'standard' }], current: 'k' };
    for (const theme of ['dark', 'light']) for (const w of [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920]) {
        ({ ctx, page } = await load(b, { width: w, height: 900 }, { state: full, theme }));
        if (w <= 390) { await page.click('#add-open'); await page.click('#manual-open'); await page.click('.pbox:nth-child(3) button'); await page.click('#adj-box summary'); await page.click('#hl-box summary'); }
        const r = await page.evaluate(() => {
            const out = { scroll: document.documentElement.scrollWidth > innerWidth + 1, stick: [], overlap: [], ctl: [], clip: [] };
            document.querySelectorAll('main *').forEach(e => { const b = e.getBoundingClientRect(); if (b.width && (b.right > innerWidth + 1 || b.left < -1)) out.stick.push(e.id || e.className || e.tagName); });
            const k = [...document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]), select, button')].filter(e => e.getBoundingClientRect().width > 0 && e.checkVisibility());
            for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { const a = k[i].getBoundingClientRect(), c = k[j].getBoundingClientRect(); if (Math.min(a.right, c.right) - Math.max(a.left, c.left) > 2 && Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top) > 2) out.ctl.push(k[i].id + '/' + k[j].id); }
            document.querySelectorAll('input[placeholder]').forEach(i => { if (i.offsetWidth) { const c = document.createElement('canvas').getContext('2d'); const cs = getComputedStyle(i); c.font = cs.fontSize + ' ' + cs.fontFamily; if (c.measureText(i.placeholder).width > i.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) + 1) out.clip.push(i.id); } });
            document.querySelectorAll('.mtable td, .mtable th').forEach(c => { if (c.scrollWidth > c.clientWidth + 1) out.clip.push('table cell ' + c.textContent); });
            return out;
        });
        for (const pos of [0, 0.5, 1]) {
            await page.evaluate(p => scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * p), pos);
            const o = await page.evaluate(() => { const bad = []; [document.querySelector('main'), ...document.querySelectorAll('.col')].forEach(h => { const k = [...h.children].filter(c => { const r = c.getBoundingClientRect(); return r.width > 4 && r.height > 4; }); for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { const a = k[i].getBoundingClientRect(), b = k[j].getBoundingClientRect(); if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 4 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 4) bad.push(k[i].className + '/' + k[j].className); } }); return bad; });
            if (o.length) r.overlap.push(pos + ':' + o.join(','));
        }
        ok(`[${theme} ${w}] no sideways scroll, nothing sticks out, no overlaps, no clipped text`, !r.scroll && !r.stick.length && !r.overlap.length && !r.ctl.length && !r.clip.length, r);
        if (w >= 900) { const cols = await page.evaluate(() => [document.querySelector('.col-a'), document.querySelector('.col-b')].map(e => Math.round(e.getBoundingClientRect().left))); ok(`[${theme} ${w}] desktop has two columns`, cols[1] > cols[0] + 300, cols); }
        await ctx.close();
    }

    // ---- screenshots for the README ----
    if (shots) {
        const st = { places: [full.places[0], full.places[1]], current: 'k' }; st.places[0] = Object.assign({}, st.places[0], { adj: {} });
        for (const [name, vp] of [['desktop', { width: 1280, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
            ({ ctx, page } = await load(b, vp, { state: st }));
            await page.screenshot({ path: path.join(__dirname, 'screenshots', name + '.png'), fullPage: name === 'desktop' ? false : false });
            if (name === 'desktop') { await page.setViewportSize({ width: 1280, height: 1500 }); await page.screenshot({ path: path.join(__dirname, 'screenshots', 'desktop.png') }); }
            await ctx.close();
        }
        console.log('screenshots saved');
    }
    await b.close(); if (srv) srv.close();
    console.log(fail ? '\n' + fail + ' FAILED' : '\nALL UI TESTS PASSED');
    process.exit(fail ? 1 : 0);
})();
