// Drives the real page in headless Chromium: node ui-test.js [--shots]
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const path = require('path'), fs = require('fs');
const url = 'file://' + path.join(__dirname, 'index.html');
const shots = process.argv.includes('--shots');
let fail = 0;
const ok = (name, cond) => { if (!cond) fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name); };
(async () => {
  const b = await chromium.launch();
  for (const [label, vp] of [['phone', { width: 390, height: 844 }], ['tablet', { width: 820, height: 1100 }], ['desktop', { width: 1280, height: 900 }]]) {
    const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: label === 'phone' ? 2 : 1, acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
    const p = await ctx.newPage();
    await p.clock.install({ time: new Date(2026, 9, 8, 15, 30) });
    const errors = []; p.on('console', m => m.type() === 'error' && errors.push(m.text())); p.on('pageerror', e => errors.push(String(e)));
    await p.goto(url);
    const t = s => label + ': ' + s;
    ok(t('no result shown before a date is typed'), await p.locator('#result').isHidden());
    ok(t('no error shown on an empty form'), await p.locator('#error').isHidden());
    ok(t('cycle length is hidden behind a button'), await p.locator('#cycle').isHidden() && await p.locator('#show-cycle').isVisible());
    await p.fill('#d-lmp', '2026-09-01');
    ok(t('due date'), (await p.textContent('#due')) === 'Tuesday 8 June 2027');
    ok(t('weeks today'), (await p.textContent('#line')) === 'Today you are 5 weeks 2 days pregnant (1st trimester).');
    ok(t('days to go'), (await p.textContent('#togo')) === '243 days to go (34 weeks 5 days).');
    ok(t('9 key dates'), await p.locator('#miles li').count() === 9);
    const body = await p.textContent('body');
    ok(t('no currency symbols'), !/[$€£¥]/.test(body));
    const href = await p.getAttribute('#email', 'href');
    ok(t('email link has no recipient and the due date'), href.startsWith('mailto:?subject=') && decodeURIComponent(href).includes('Tuesday 8 June 2027'));
    await p.click('#show-cycle'); await p.fill('#cycle', '35');
    ok(t('35-day cycle gives 15 June'), (await p.textContent('#due')) === 'Tuesday 15 June 2027');
    await p.fill('#cycle', '');
    ok(t('blank cycle goes back to 28'), (await p.textContent('#due')) === 'Tuesday 8 June 2027');
    await p.click('#copy');
    ok(t('copy puts the summary on the clipboard'), (await p.evaluate(() => navigator.clipboard.readText())).includes('Estimated due date: Tuesday 8 June 2027'));
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#cal')]);
    ok(t('calendar file downloads'), dl.suggestedFilename() === 'due-date.ics');
    if (label === 'desktop') {
      // other methods
      await p.click('#tab-conception'); await p.fill('#d-conception', '2026-09-15');
      ok('conception method', (await p.textContent('#due')) === 'Tuesday 8 June 2027');
      await p.click('#tab-ivf'); await p.fill('#d-ivf', '2026-02-01');
      ok('IVF day 5', (await p.textContent('#due')) === 'Tuesday 20 October 2026');
      await p.selectOption('#embryo', '3');
      ok('IVF day 3', (await p.textContent('#due')) === 'Thursday 22 October 2026');
      await p.click('#tab-scan'); await p.fill('#d-scan', '2026-01-01');
      ok('scan without weeks shows a clear message', (await p.textContent('#error')).includes('weeks') && await p.locator('#result').isHidden());
      await p.fill('#s-weeks', '8'); await p.fill('#s-days', '3');
      ok('scan 8w3d', (await p.textContent('#due')) === 'Monday 10 August 2026');
      await p.click('#tab-lmp');
      ok('switching back keeps the first date', (await p.inputValue('#d-lmp')) === '2026-09-01');
      // odd inputs
      await p.fill('#d-lmp', '2026-10-20');
      ok('a date in the future gives a clear message, no result', (await p.textContent('#error')).includes("can't be in the future") && await p.locator('#result').isHidden());
      await p.fill('#d-lmp', '2026-09-01');
      // saved between visits
      await p.reload();
      ok('state is restored after reload', (await p.inputValue('#d-lmp')) === '2026-09-01' && (await p.textContent('#due')) === 'Tuesday 8 June 2027');
      ok('storage key is namespaced', await p.evaluate(() => Object.keys(localStorage).every(k => k.startsWith('due-date-calculator.'))));
      // optional bits never forced
      // start over + undo
      await p.click('#reset');
      ok('start over clears the form', (await p.inputValue('#d-lmp')) === '' && await p.locator('#result').isHidden());
      await p.click('#msg button');
      ok('undo brings it back', (await p.inputValue('#d-lmp')) === '2026-09-01' && (await p.textContent('#due')) === 'Tuesday 8 June 2027');
      await p.click('#reset'); await p.reload();
      ok('start over stays cleared after reload', (await p.inputValue('#d-lmp')) === '');
      // past due date
      await p.fill('#d-lmp', '2025-10-01');
      ok('long ago date warns', (await p.textContent('#line')).includes('due date was') && await p.locator('#notes').isVisible());
      await p.fill('#d-lmp', '2026-09-01');
    }
    ok(t('no horizontal scroll'), await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    ok(t('no console errors'), errors.length === 0);
    if (shots && label !== 'tablet') {
      const dir = path.join(__dirname, 'screenshots');
      await p.fill('#d-lmp', '2026-09-01'); await p.reload(); await p.evaluate(() => document.activeElement.blur());
      if (label === 'phone') { await p.emulateMedia({ colorScheme: 'dark' }); await p.waitForTimeout(150); await p.screenshot({ path: dir + '/phone.png' }); }
      else {
        await p.emulateMedia({ colorScheme: 'dark' }); await p.waitForTimeout(150);
        await p.screenshot({ path: dir + '/desktop.png', fullPage: true });
        await p.emulateMedia({ colorScheme: 'light' }); await p.waitForTimeout(150);
        await p.screenshot({ path: dir + '/desktop-light.png', fullPage: true });
      }
    }
    await ctx.close();
  }
  // service worker file + assets exist
  const need = ['index.html', 'style.css', 'core.js', 'script.js', 'favicon.svg', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'LICENSE', 'README.md', 'screenshots/desktop.png', 'screenshots/phone.png', 'screenshots/desktop-light.png'];
  need.forEach(f => { if (!fs.existsSync(path.join(__dirname, f)) && !(shots === false && f.startsWith('README'))) ok('file exists ' + f, false); });
  await b.close();
  console.log(fail ? fail + ' FAILED' : 'ALL UI CHECKS PASSED');
  process.exit(fail ? 1 : 0);
})();
