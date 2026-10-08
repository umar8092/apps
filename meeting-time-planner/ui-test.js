// Drives the real page in headless Chromium: node ui-test.js [--shots]
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const path = require('path'), fs = require('fs');
const url = 'file://' + path.join(__dirname, 'index.html');
const shots = process.argv.includes('--shots');
let fail = 0;
const ok = (name, cond) => { if (!cond) fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name); };
async function setCities(p, list) {
  await p.click('#reset');
  while (await p.locator('#people .person').count() < list.length) await p.click('#add');
  const ins = p.locator('#people .person input');
  for (let i = 0; i < list.length; i++) await ins.nth(i).fill(list[i]);
}
(async () => {
  const b = await chromium.launch();
  for (const [label, vp] of [['phone', { width: 390, height: 844 }], ['tablet', { width: 820, height: 1100 }], ['desktop', { width: 1280, height: 900 }]]) {
    const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: label === 'phone' ? 2 : 1, timezoneId: 'Europe/London', locale: 'en-GB', acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
    const p = await ctx.newPage();
    await p.clock.install({ time: new Date(2026, 9, 7, 12, 0) });
    const errors = []; p.on('console', m => m.type() === 'error' && errors.push(m.text())); p.on('pageerror', e => errors.push(String(e)));
    await p.goto(url);
    const t = s => label + ': ' + s;
    ok(t('first city is the device city'), (await p.inputValue('#people .person input')) === 'London');
    ok(t('no result with one city'), await p.locator('#result').isHidden());
    ok(t('no error shown on a fresh page'), await p.locator('#error').isHidden());
    ok(t('default date is today (a weekday)'), (await p.inputValue('#date')) === '2026-10-07');
    await p.fill('#date', '2026-10-08');
    await p.locator('#people .person input').nth(1).fill('New York');
    ok(t('best time London+NY'), (await p.textContent('#best')) === '15:00 London');
    ok(t('lead explains the window'), (await p.textContent('#lead')).includes('1-hour meeting is inside everyone’s hours if it starts between 14:00 and 16:00 London time'));
    const rows = await p.locator('#table li').allTextContents();
    ok(t('table shows London 15:00 and New York 10:00'), rows.length === 2 && rows[0].includes('15:00 – 16:00') && rows[1].includes('10:00 – 11:00') && rows[1].includes('Thu'));
    ok(t('5 other start times as chips'), await p.locator('#chips button').count() === 5);
    await p.locator('#chips button').first().click();
    ok(t('picking 14:00 chip updates answer to NY 09:00'), (await p.locator('#table li').nth(1).textContent()).includes('09:00 – 10:00'));
    await p.locator('#chips button').nth(2).click();
    // three cities: Chicago
    await p.click('#add'); await p.locator('#people .person input').nth(2).fill('Chicago');
    ok(t('3 cities best 15:30 London'), (await p.textContent('#best')) === '15:30 London');
    ok(t('Chicago shows 09:30'), (await p.locator('#table li').nth(2).textContent()).includes('09:30 – 10:30'));
    // no overlap
    await p.locator('#people .person input').nth(2).fill('Mumbai');
    ok(t('no overlap says so'), (await p.textContent('#kicker')) === 'No time works for everyone' && (await p.textContent('#best')).startsWith('Closest:'));
    ok(t('some row is flagged outside hours'), await p.locator('#table li.out').count() > 0 && (await p.locator('#table li.out small').first().textContent()).includes('outside working hours'));
    ok(t('chips hidden when nothing fits'), await p.locator('#alt').isHidden());
    // different hours for Mumbai: 12-23 → overlap
    await p.locator('#people .person').nth(2).locator('.meta button').click();
    const sels = p.locator('#people .person').nth(2).locator('.own select');
    await sels.nth(0).selectOption('720'); await sels.nth(1).selectOption('1380');
    ok(t('own hours for one city can create an overlap'), (await p.textContent('#kicker')) === 'Best time to meet');
    await p.locator('#people .person').nth(2).locator('.meta button').click();
    ok(t('back to common hours: no overlap again'), (await p.textContent('#kicker')) === 'No time works for everyone');
    // bad city
    await p.locator('#people .person input').nth(2).fill('Atlantis');
    ok(t('unknown city gets a clear message beside it'), (await p.locator('#people .person .meta.bad').textContent()).includes('not a city we know'));
    ok(t('still answers for the cities that are understood'), (await p.textContent('#best')) === '15:00 London' || (await p.textContent('#best')).includes('London'));
    await p.locator('#people .person input').nth(2).fill('');
    // remove third row
    await p.locator('#people .person .x').nth(2).click();
    ok(t('remove a city'), await p.locator('#people .person').count() === 2);
    // currency, no forced optional
    const body = await p.textContent('body');
    ok(t('no currency symbols'), !/[$€£¥]/.test(body));
    ok(t('different hours is behind a button'), await p.locator('#people .own').count() === 0);
    // 12 hour
    await p.click('#h12');
    ok(t('12-hour clock'), (await p.textContent('#best')) === '3:00 pm London');
    await p.click('#h12');
    // duration
    await p.selectOption('#duration', '180');
    ok(t('3 hour meeting: London+NY only 14:00 start'), (await p.textContent('#best')) === '14:00 London' && await p.locator('#alt').isHidden());
    await p.selectOption('#duration', '60');
    // invalid working day
    await p.selectOption('#hs', '1020'); await p.selectOption('#he', '540');
    ok(t('end before start shows message'), (await p.textContent('#error')).includes('must end after') && await p.locator('#result').isHidden());
    await p.selectOption('#hs', '540'); await p.selectOption('#he', '1020');
    // share
    const href = await p.getAttribute('#email', 'href');
    ok(t('email link has no recipient and the times'), href.startsWith('mailto:?subject=') && decodeURIComponent(href).includes('London: 15:00 – 16:00') && decodeURIComponent(href).includes('New York: 10:00 – 11:00'));
    await p.click('#copy');
    ok(t('copy puts summary on clipboard'), (await p.evaluate(() => navigator.clipboard.readText())).includes('New York: 10:00 – 11:00 Thu'));
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#cal')]);
    const ics = fs.readFileSync(await dl.path(), 'utf8');
    ok(t('calendar file: 14:00Z start'), dl.suggestedFilename() === 'meeting.ics' && ics.includes('DTSTART:20261008T140000Z') && ics.includes('DTEND:20261008T150000Z'));
    // weekend note
    await p.fill('#date', '2026-10-10');
    await p.locator('#people .person input').nth(1).fill('Tokyo'); await p.selectOption('#hs', '0'); await p.selectOption('#he', '1440');
    ok(t('weekend note appears'), await p.locator('#notes').isVisible() && (await p.textContent('#notes')).includes('Weekend'));
    await p.fill('#date', '2026-10-08'); await p.selectOption('#hs', '540'); await p.selectOption('#he', '1020');
    // saved state
    await p.locator('#people .person input').nth(1).fill('New York');
    await p.reload();
    ok(t('state restored after reload'), (await p.locator('#people .person input').nth(1).inputValue()) === 'New York' && (await p.textContent('#best')) === '15:00 London');
    ok(t('storage keys namespaced'), await p.evaluate(() => Object.keys(localStorage).every(k => k.startsWith('meeting-time-planner.'))));
    // start new meeting + undo
    await p.click('#reset');
    ok(t('start a new meeting clears the cities'), (await p.locator('#people .person input').nth(1).inputValue()) === '' && await p.locator('#result').isHidden());
    await p.click('#msg button');
    ok(t('undo brings it back'), (await p.locator('#people .person input').nth(1).inputValue()) === 'New York' && (await p.textContent('#best')) === '15:00 London');
    // xss safe
    await p.locator('#people .person input').nth(1).fill('<img src=x onerror=alert(1)>');
    ok(t('typed text is shown as text'), await p.locator('#people img').count() === 0);
    await p.locator('#people .person input').nth(1).fill('New York');
    // layout
    ok(t('no horizontal scroll'), await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    ok(t('no console errors'), errors.length === 0);
    if (shots && label !== 'tablet') {
      await setCities(p, ['London', 'New York', 'Chicago']);
      await p.fill('#date', '2026-10-08');
      await p.waitForTimeout(150);
      await p.evaluate(() => document.activeElement && document.activeElement.blur());
      await p.evaluate(() => window.scrollTo(0, 0));
      await p.emulateMedia({ colorScheme: label === 'phone' ? 'light' : 'dark' }); await p.waitForTimeout(100);
      const out = path.join(__dirname, 'screenshots', label + '.png');
      if (label === 'desktop') await p.setViewportSize({ width: 1100, height: 1500 });
      await p.screenshot({ path: out, fullPage: true });
      if (label === 'desktop') {
        await p.emulateMedia({ colorScheme: 'light' }); await p.waitForTimeout(100);
        await p.screenshot({ path: path.join(__dirname, 'screenshots', 'desktop-light.png'), fullPage: true });
      }
    }
    await ctx.close();
  }
  await b.close();
  const must = ['favicon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'manifest.webmanifest', 'sw.js', 'LICENSE'];
  ok('icon and support files exist', must.every(f => fs.existsSync(path.join(__dirname, f))));
  console.log(fail ? fail + ' FAILED' : 'ALL PASSED');
  process.exit(fail ? 1 : 0);
})();
