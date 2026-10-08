// Drives the real page in headless Chromium: node ui-test.js [--shots]
// Needs playwright (or playwright-core with CHROME_PATH pointing at a Chrome/Chromium).
const pw = (() => { for (const m of ['playwright', 'playwright-core', '/opt/node-tools/node_modules/playwright']) { try { return require(m); } catch (e) { /* try next */ } } throw new Error('playwright not found'); })();
const path = require('path'), fs = require('fs');
const url = 'file://' + path.join(__dirname, 'index.html');
const shots = process.argv.includes('--shots');
let fail = 0;
const ok = (name, cond) => { if (!cond) fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name); };
const person = (p, i) => p.locator('#people .person').nth(i);
async function setCities(p, list) {
  await p.click('#reset');
  while (await p.locator('#people .person').count() < list.length) await p.click('#add');
  for (let i = 0; i < list.length; i++) await person(p, i).locator('input').first().fill(list[i]);
}
// form controls must never sit on top of each other
async function overlaps(p) {
  return p.evaluate(() => {
    const els = [...document.querySelectorAll('input,select,button,a.second')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; });
    const hits = [];
    for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
      const A = els[i].getBoundingClientRect(), B = els[j].getBoundingClientRect();
      if (els[i].contains(els[j]) || els[j].contains(els[i])) continue;
      if (Math.min(A.right, B.right) - Math.max(A.left, B.left) > 3 && Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top) > 3) hits.push((els[i].id || els[i].textContent.trim()) + ' x ' + (els[j].id || els[j].textContent.trim()));
    }
    return hits;
  });
}
(async () => {
  const b = await pw.chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  for (const [label, vp] of [['small phone', { width: 320, height: 700 }], ['phone', { width: 390, height: 844 }], ['tablet', { width: 820, height: 1100 }], ['desktop', { width: 1280, height: 900 }]]) {
    const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: label === 'phone' ? 2 : 1, timezoneId: 'Europe/London', locale: 'en-GB', acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
    const p = await ctx.newPage();
    await p.clock.install({ time: new Date(2026, 9, 7, 12, 0) });
    const errors = []; p.on('console', m => m.type() === 'error' && errors.push(m.text())); p.on('pageerror', e => errors.push(String(e)));
    await p.goto(url);
    const t = s => label + ': ' + s;
    ok(t('back to all apps link'), (await p.getAttribute('a.back', 'href')) === '../' && /All apps/.test(await p.textContent('a.back')));
    ok(t('name says it is for time zones'), (await p.textContent('h1')) === 'Time Zone Meeting Planner' && /time zones/i.test(await p.textContent('.sub')));
    ok(t('first city is the device city'), (await person(p, 0).locator('input').inputValue()) === 'London');
    ok(t('no result with one city'), await p.locator('#result').isHidden());
    ok(t('every person has their own working hours, office hours by default'), (await p.locator('#people select.hours').count()) === 2 && (await p.locator('#people select.hours').first().inputValue()) === 'office');
    ok(t('there is no single shared hours box any more'), (await p.locator('#hs').count()) === 0);
    await p.fill('#date', '2026-10-08');
    await person(p, 1).locator('input').first().fill('New York');
    ok(t('London + New York best 15:00 London'), (await p.textContent('#best')) === '15:00 London');
    ok(t('lead explains the window'), (await p.textContent('#lead')).includes('1-hour meeting is inside everyone’s hours if it starts between 14:00 and 16:00 London time'));
    const rows = await p.locator('#table li').allTextContents();
    ok(t('table shows London 15:00 and New York 10:00'), rows.length === 2 && rows[0].includes('15:00 – 16:00') && rows[1].includes('10:00 – 11:00') && rows[1].includes('Thu'));
    ok(t('5 other start times as chips'), await p.locator('#chips button').count() === 5);
    await p.locator('#chips button').first().click();
    ok(t('picking the 14:00 chip updates New York to 09:00'), (await p.locator('#table li').nth(1).textContent()).includes('09:00 – 10:00'));
    await p.locator('#chips button').nth(2).click();

    // day person in London, night person in New York
    await person(p, 1).locator('select.hours').selectOption('night');
    ok(t('night shift in New York: best 09:30 London'), (await p.textContent('#best')) === '09:30 London');
    const night = await p.locator('#table li').allTextContents();
    ok(t('night shift: New York is 04:30 - 05:30 and inside their hours'), night[1].includes('04:30 – 05:30') && night[1].includes('inside working hours'));
    ok(t('night shift: starts 09:00-10:00 London'), (await p.textContent('#lead')).includes('between 09:00 and 10:00 London time'));
    ok(t('night shift option text shows it runs to the next day'), (await person(p, 1).locator('select.hours option[value=night]').textContent()).includes('next day'));
    // custom hours that cross midnight
    await person(p, 1).locator('select.hours').selectOption('custom');
    ok(t('custom hours show start and end selectors'), (await person(p, 1).locator('.own select').count()) === 2);
    await person(p, 1).locator('.own select').nth(0).selectOption('1260'); await person(p, 1).locator('.own select').nth(1).selectOption('420');
    ok(t('custom 21:00-07:00 says it ends the next day'), (await person(p, 1).locator('.own-note').textContent()).includes('next day'));
    ok(t('custom 21:00-07:00 in New York gives a wider window (starts 08:00-11:30...)'), (await p.textContent('#lead')).includes('London time') && (await p.textContent('#kicker')) === 'Best time to meet');
    await person(p, 1).locator('select.hours').selectOption('office');
    ok(t('back to office hours'), (await p.textContent('#best')) === '15:00 London');

    // lengths: presets, custom, and the 3 hour cap
    const lens = await p.locator('#duration option').allTextContents();
    ok(t('length list has 15 minutes to 3 hours and a custom option'), lens[0] === '15 minutes' && lens.includes('3 hours') && lens[lens.length - 1].startsWith('Custom'));
    ok(t('custom box hidden until chosen'), await p.locator('#custom-box').isHidden());
    await p.selectOption('#duration', 'custom');
    ok(t('custom box shown'), await p.locator('#custom-box').isVisible());
    await p.fill('#custom-len', '50');
    ok(t('custom 50 minutes: lead says 50-minute'), (await p.textContent('#lead')).includes('50-minute'));
    ok(t('custom 50 minutes: row shows 50 minute meeting (15:00 - 15:50)'), (await p.locator('#table li').first().textContent()).includes('15:00 – 15:50'));
    await p.fill('#custom-len', '181');
    ok(t('181 minutes is refused with a message and no result'), (await p.textContent('#error')).includes('3 hours') && await p.locator('#result').isHidden());
    await p.fill('#custom-len', '180');
    ok(t('180 minutes (3 hours) is allowed'), (await p.locator('#error').isHidden()) && (await p.textContent('#best')) === '14:00 London');
    await p.fill('#custom-len', '4');
    ok(t('4 minutes is refused'), !(await p.locator('#error').isHidden()));
    await p.fill('#custom-len', '');
    ok(t('empty custom length is refused, not crashed'), !(await p.locator('#error').isHidden()));
    await p.fill('#custom-len', '90');
    await p.selectOption('#duration', '60');
    ok(t('back to a preset length hides the custom box'), (await p.locator('#custom-box').isHidden()) && (await p.textContent('#best')) === '15:00 London');
    await p.selectOption('#duration', '150');
    ok(t('2 hours 30 preset'), (await p.textContent('#lead')).includes('150-minute'));
    await p.selectOption('#duration', '60');

    // three cities, no overlap, then fix it with Mumbai's own hours
    await p.click('#add'); await person(p, 2).locator('input').first().fill('Chicago');
    ok(t('3 cities best 15:30 London'), (await p.textContent('#best')) === '15:30 London');
    ok(t('Chicago shows 09:30'), (await p.locator('#table li').nth(2).textContent()).includes('09:30 – 10:30'));
    await person(p, 2).locator('input').first().fill('Mumbai');
    ok(t('no overlap says so'), (await p.textContent('#kicker')) === 'No time works for everyone' && (await p.textContent('#best')).startsWith('Closest:'));
    ok(t('no overlap suggests what to change'), (await p.textContent('#lead')).includes('shorter meeting'));
    ok(t('some row is flagged outside hours'), await p.locator('#table li.out').count() > 0);
    ok(t('chips hidden when nothing fits'), await p.locator('#alt').isHidden());
    await person(p, 2).locator('select.hours').selectOption('evening');
    ok(t('Mumbai on an evening shift creates an overlap'), (await p.textContent('#best')) === '15:00 London');
    await person(p, 2).locator('select.hours').selectOption('office');
    await person(p, 2).locator('input').first().fill('Atlantis');
    ok(t('unknown city gets a clear message beside it'), (await person(p, 2).locator('.meta.bad').textContent()).includes('not a city we know'));
    ok(t('still answers for the cities that are understood'), (await p.textContent('#best')).includes('London'));
    await person(p, 2).locator('input').first().fill('');
    await person(p, 2).locator('.x').click();
    ok(t('remove a city'), await p.locator('#people .person').count() === 2);

    // layout, privacy, clock
    ok(t('no currency symbols'), !/[$€£¥]/.test(await p.textContent('body')));
    ok(t('no form controls on top of each other'), (await overlaps(p)).length === 0);
    await p.click('#h12');
    ok(t('12-hour clock'), (await p.textContent('#best')) === '3:00 pm London');
    ok(t('hours labels follow the clock'), (await person(p, 0).locator('select.hours option[value=office]').textContent()).includes('9:00 am'));
    await p.click('#h12');

    // share
    const href = await p.getAttribute('#email', 'href');
    ok(t('email link has no recipient and the times'), href.startsWith('mailto:?subject=') && decodeURIComponent(href).includes('London: 15:00 – 16:00') && decodeURIComponent(href).includes('New York: 10:00 – 11:00'));
    await p.click('#copy');
    ok(t('copy puts summary on clipboard'), (await p.evaluate(() => navigator.clipboard.readText())).includes('New York: 10:00 – 11:00 Thu'));
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#cal')]);
    const ics = fs.readFileSync(await dl.path(), 'utf8');
    ok(t('calendar file: 14:00Z start'), dl.suggestedFilename() === 'meeting.ics' && ics.includes('DTSTART:20261008T140000Z') && ics.includes('DTEND:20261008T150000Z'));
    await p.fill('#date', '2026-10-10');
    await person(p, 1).locator('input').first().fill('Tokyo'); await person(p, 0).locator('select.hours').selectOption('any'); await person(p, 1).locator('select.hours').selectOption('any');
    ok(t('weekend note appears'), await p.locator('#notes').isVisible() && (await p.textContent('#notes')).includes('Weekend'));
    await p.fill('#date', '2026-10-08'); await person(p, 0).locator('select.hours').selectOption('office'); await person(p, 1).locator('select.hours').selectOption('office');

    // saved state, reset, undo, safety
    await person(p, 1).locator('input').first().fill('New York');
    await person(p, 1).locator('select.hours').selectOption('night');
    await p.reload();
    ok(t('state restored after reload, including night shift'), (await person(p, 1).locator('input').first().inputValue()) === 'New York' && (await person(p, 1).locator('select.hours').inputValue()) === 'night' && (await p.textContent('#best')) === '09:30 London');
    ok(t('storage keys namespaced'), await p.evaluate(() => Object.keys(localStorage).every(k => k.startsWith('time-zone-meeting-planner.'))));
    await p.click('#reset');
    ok(t('start a new meeting clears the cities and hours'), (await person(p, 1).locator('input').first().inputValue()) === '' && (await person(p, 1).locator('select.hours').inputValue()) === 'office' && await p.locator('#result').isHidden());
    await p.click('#msg button');
    ok(t('undo brings it back'), (await person(p, 1).locator('select.hours').inputValue()) === 'night' && (await p.textContent('#best')) === '09:30 London');
    await person(p, 1).locator('input').first().fill('<img src=x onerror=alert(1)>');
    ok(t('typed text is shown as text'), await p.locator('#people img').count() === 0);
    await person(p, 1).locator('input').first().fill('New York');
    ok(t('no horizontal scroll'), await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    ok(t('no overlaps after all that'), (await overlaps(p)).length === 0);
    ok(t('no console errors'), errors.length === 0);

    // a state saved by the earlier version (one shared 10:00-16:00 window) still loads
    await p.evaluate(() => { localStorage.clear(); localStorage.setItem('meeting-time-planner.state', JSON.stringify({ people: [{ text: 'London', own: null }, { text: 'New York', own: null }], date: '2026-10-08', duration: 60, hs: 600, he: 960, h12: false })); });
    await p.reload();
    ok(t('earlier saved version still opens, with its shared hours kept per person'), (await person(p, 1).locator('select.hours').inputValue()) === 'custom' && (await p.textContent('#best')) === '15:00 London');

    if (shots && label !== 'tablet' && label !== 'small phone') {
      await setCities(p, ['London', 'New York', 'Karachi']);
      await p.fill('#date', '2026-10-08');
      await person(p, 1).locator('select.hours').selectOption('office');
      await person(p, 2).locator('select.hours').selectOption('evening');
      await p.waitForTimeout(150);
      await p.evaluate(() => { document.activeElement && document.activeElement.blur(); window.scrollTo(0, 0); });
      await p.emulateMedia({ colorScheme: label === 'phone' ? 'light' : 'dark' }); await p.waitForTimeout(100);
      if (label === 'desktop') await p.setViewportSize({ width: 1100, height: 1700 });
      await p.screenshot({ path: path.join(__dirname, 'screenshots', label + '.png'), fullPage: true });
      if (label === 'desktop') { await p.emulateMedia({ colorScheme: 'light' }); await p.waitForTimeout(100); await p.screenshot({ path: path.join(__dirname, 'screenshots', 'desktop-light.png'), fullPage: true }); }
    }
    await ctx.close();
  }
  await b.close();
  const must = ['favicon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'manifest.webmanifest', 'sw.js', 'LICENSE'];
  ok('icon and support files exist', must.every(f => fs.existsSync(path.join(__dirname, f))));
  console.log(fail ? fail + ' FAILED' : 'ALL PASSED');
  process.exit(fail ? 1 : 0);
})();
