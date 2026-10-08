// Drives the real page in headless Chromium: node ui-test.js [--shots]
const pw = (() => { for (const m of ['playwright', 'playwright-core', '/opt/node-tools/node_modules/playwright']) { try { return require(m); } catch (e) { /* next */ } } throw new Error('playwright not found'); })();
const path = require('path'), fs = require('fs');
const url = 'file://' + path.join(__dirname, 'index.html');
const shots = process.argv.includes('--shots');
let fail = 0;
const ok = (name, cond) => { if (!cond) fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name); };
const WEEK = [['09:00', '17:30', '30'], ['09:00', '18:00', '30'], ['08:30', '17:00', '60'], ['09:00', '19:00', '30'], ['09:00', '17:00', '30'], ['22:00', '06:00', '30']];

async function load(b, vp, theme) {
  const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: vp.width < 500 ? 2 : 1, colorScheme: theme || 'dark', permissions: ['clipboard-read', 'clipboard-write'] });
  const p = await ctx.newPage();
  await p.clock.install({ time: new Date(2026, 9, 8, 15, 30) });   // Thursday 8 Oct 2026
  p.errors = []; p.on('console', m => m.type() === 'error' && p.errors.push(m.text())); p.on('pageerror', e => p.errors.push(String(e)));
  await p.goto(url);
  return p;
}
async function enter(p) {
  for (let i = 0; i < WEEK.length; i++) {
    const [s, e, b] = WEEK[i], n = i + 1;
    await p.fill('#start-' + n, s); await p.fill('#end-' + n, e); await p.selectOption('#break-' + n, b);
  }
}
async function overflow(p) {
  return p.evaluate(() => {
    const W = document.documentElement.clientWidth, bad = [];
    if (document.documentElement.scrollWidth > W) bad.push('page scrolls sideways');
    document.querySelectorAll('main *').forEach(e => { const r = e.getBoundingClientRect(); if (r.width && (r.right > W + 1 || r.left < -1) && !e.closest('dialog')) bad.push(e.tagName + '.' + e.className + ' ' + Math.round(r.left) + '..' + Math.round(r.right)); });
    return bad.slice(0, 5);
  });
}
async function overlaps(p) {   // no two sibling blocks in main may overlap; no two form controls inside a day may overlap
  return p.evaluate(() => {
    const bad = [], inter = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
    const groups = [[...document.querySelector('main').children].filter(e => e.offsetParent !== null && !e.classList.contains('topbar') || e.classList.contains('topbar')),
      [...document.querySelectorAll('.inputs > *')], [...document.querySelectorAll('.day')], [...document.querySelectorAll('#result > *')]];
    groups.forEach(g => { const v = g.filter(e => e.getBoundingClientRect().height > 0); for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) if (inter(v[i].getBoundingClientRect(), v[j].getBoundingClientRect())) bad.push(v[i].className + ' x ' + v[j].className); });
    document.querySelectorAll('.day').forEach(d => { const c = [...d.querySelectorAll('input,select,button')].filter(e => e.offsetParent); for (let i = 0; i < c.length; i++) for (let j = i + 1; j < c.length; j++) if (inter(c[i].getBoundingClientRect(), c[j].getBoundingClientRect())) bad.push('control overlap ' + c[i].id + ' ' + c[j].id); });
    return bad.slice(0, 5);
  });
}

(async () => {
  const b = await pw.chromium.launch();

  // --- the real situation
  for (const [label, vp] of [['phone', { width: 390, height: 844 }], ['desktop', { width: 1280, height: 900 }]]) {
    const p = await load(b, vp), t = s => label + ': ' + s;
    ok(t('opens on this week, Monday 5 Oct 2026'), (await p.inputValue('#wk-start')) === '2026-10-05' && (await p.textContent('.day .dayname')) === 'Mon 5 Oct');
    ok(t('empty form shows 0h and no warnings'), (await p.textContent('#total')) === '0h' && await p.locator('#note').isHidden());
    ok(t('overtime/pay are hidden behind a button'), await p.locator('#opt').isHidden() && await p.locator('#show-opt').isVisible());
    await enter(p);
    ok(t('total 48h 30m'), (await p.textContent('#total')) === '48h 30m');
    ok(t('decimal 48.50 over 6 days'), (await p.textContent('#dec')) === '48.50 hours in decimal, over 6 days');
    ok(t('Monday 8h, Tuesday 8h 30m, Saturday night shift 7h 30m'), (await p.textContent('.day:nth-child(1) .dayres')) === '8h' && (await p.textContent('.day:nth-child(2) .dayres')) === '8h 30m' && (await p.textContent('.day:nth-child(6) .dayres')) === '7h 30m');
    ok(t('night shift says ends next day'), (await p.textContent('.day:nth-child(6) .daynote')).includes('ends next day'));
    ok(t('Sunday is a day off'), (await p.textContent('.day:nth-child(7) .dayres')) === 'Day off');
    await p.click('#show-opt');
    await p.selectOption('#thr', '40'); await p.fill('#rate', '20');
    ok(t('overtime 8h 30m'), (await p.textContent('#sum')).includes('8h 30m (8.50)'));
    ok(t('pay 1,055.00'), (await p.textContent('#sum')).includes('1,055.00') && (await p.textContent('#sum')).includes('800.00') && (await p.textContent('#sum')).includes('255.00'));
    await p.selectOption('#thr', 'custom'); await p.fill('#thr-c', '38');
    ok(t('custom limit 38h gives 10h 30m overtime'), (await p.textContent('#sum')).includes('10h 30m (10.50)'));
    await p.selectOption('#thr', '40');
    await p.selectOption('#break-1', 'custom'); await p.fill('#break-c-1', '20');
    ok(t('custom break 20 min: Monday 8h 10m'), (await p.textContent('.day:nth-child(1) .dayres')) === '8h 10m');
    await p.selectOption('#break-1', '30');
    ok(t('back to 8h'), (await p.textContent('.day:nth-child(1) .dayres')) === '8h');
    // odd inputs
    await p.fill('#end-7', '09:00'); await p.fill('#start-7', '09:00');
    ok(t('same start and finish is flagged and counts 0'), await p.locator('#note').isVisible() && (await p.textContent('.day:nth-child(7) .dayres')) === '0h' && (await p.textContent('#total')) === '48h 30m');
    await p.fill('#end-7', '09:20'); await p.selectOption('#break-7', '30');
    ok(t('break longer than shift is flagged'), (await p.textContent('.day:nth-child(7) .daynote')).includes('longer than the shift'));
    await p.click('.day:nth-child(7) .clearday');
    ok(t('Clear day empties it'), (await p.textContent('.day:nth-child(7) .dayres')) === 'Day off' && await p.locator('#note').isHidden());
    // persistence and weeks
    await p.reload();
    ok(t('state survives reload'), (await p.textContent('#total')) === '48h 30m' && (await p.inputValue('#rate')) === '20');
    await p.click('#next-wk');
    ok(t('next week is empty, shows Mon 12 Oct'), (await p.textContent('#total')) === '0h' && (await p.textContent('.day .dayname')) === 'Mon 12 Oct');
    await p.click('#prev-wk');
    ok(t('previous week keeps its hours'), (await p.textContent('#total')) === '48h 30m');
    await p.click('#next-wk'); await p.click('#this-wk');
    ok(t('This week returns'), (await p.inputValue('#wk-start')) === '2026-10-05');
    // share
    const href = decodeURIComponent(await p.getAttribute('#mail', 'href'));
    ok(t('email link has no recipient, total, and the night shift'), href.startsWith('mailto:?subject=') && href.includes('48h 30m') && href.includes('Pay: 1,055.00') && href.includes('(next day)'));
    await p.click('#copy');
    const clip = await p.evaluate(() => navigator.clipboard.readText());
    ok(t('copy puts the timesheet on the clipboard'), clip.includes('Total: 48h 30m (48.50 hours)') && clip.includes('Mon 5 Oct  09:00 to 17:30, break 30m: 8h'));
    ok(t('no currency symbols'), !/[$€£¥]/.test(await p.textContent('body')));
    // start new week + undo
    await p.click('#new-wk');
    ok(t('new week clears'), (await p.textContent('#total')) === '0h' && await p.locator('#undo').isVisible());
    await p.click('#undo-btn');
    ok(t('undo restores'), (await p.textContent('#total')) === '48h 30m' && await p.locator('#undo').isHidden());
    // fill
    await p.click('#new-wk'); await p.click('#fill summary');
    await p.fill('#f-s', '09:00'); await p.fill('#f-e', '17:00'); await p.selectOption('#f-b', '30');
    await p.click('#fill-wd');
    ok(t('fill Mon-Fri: 5 x 7h 30m = 37h 30m'), (await p.textContent('#total')) === '37h 30m');
    await p.click('#fill-all');
    ok(t('fill all 7 days = 52h 30m'), (await p.textContent('#total')) === '52h 30m');
    await p.click('#undo-btn');
    ok(t('undo after fill restores Mon-Fri fill'), (await p.textContent('#total')) === '37h 30m');
    // rounding
    await p.selectOption('#round', '15'); await p.fill('#end-1', '17:08');
    ok(t('rounding to 15 min: 7h 38m -> 7h 45m'), (await p.textContent('.day:nth-child(1) .dayres')) === '7h 45m');
    await p.selectOption('#round', '0');
    ok(t('no console errors'), p.errors.length === 0);
    if (p.errors.length) console.log(p.errors);
    await p.context().close();
  }

  // --- help dialog and top bar
  for (const w of [320, 390, 820, 1280]) {
    const p = await load(b, { width: w, height: 800 });
    await p.click('.help-btn');
    const d = await p.evaluate(() => { const e = document.querySelector('dialog.help'), r = e.getBoundingClientRect(); return { open: e.open, l: r.left, r: r.right, t: r.top, b: r.bottom, title: e.querySelector('h2').textContent, W: innerWidth, H: innerHeight }; });
    ok('help ' + w + ': opens inside the screen with its title', d.open && d.l >= 0 && d.r <= d.W && d.t >= 0 && d.b <= d.H && d.title === 'How to use Work Hours Calculator');
    await p.keyboard.press('Escape');
    ok('help ' + w + ': Escape closes', !(await p.evaluate(() => document.querySelector('dialog.help').open)));
    await p.click('.help-btn'); await p.click('dialog.help .help-close');
    ok('help ' + w + ': Got it closes', !(await p.evaluate(() => document.querySelector('dialog.help').open)));
    const bar = await p.evaluate(() => { const r = [...document.querySelectorAll('.topbar > *')].map(e => e.getBoundingClientRect()); return { n: r.length, overlap: r.some((a, i) => r.some((c, j) => j > i && a.left < c.right - 1 && c.left < a.right - 1 && a.top < c.bottom - 1 && c.top < a.bottom - 1)), h: Math.max(...r.map(x => x.height)) }; });
    ok('help ' + w + ': top bar has 3 buttons, no overlap, one line', bar.n === 3 && !bar.overlap && bar.h < 60);
    await p.context().close();
  }

  // --- all widths, both themes, filled and cleared
  const widths = [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920];
  for (const theme of ['dark', 'light']) for (const w of widths) {
    const p = await load(b, { width: w, height: 900 }, theme), t = s => theme + ' ' + w + ': ' + s;
    await enter(p); await p.click('#show-opt'); await p.selectOption('#thr', '40'); await p.fill('#rate', '20'); await p.selectOption('#break-3', 'custom'); await p.fill('#break-c-3', '45'); await p.selectOption('#thr', 'custom'); await p.selectOption('#mult', 'custom');
    await p.click('#fill summary');
    let o = await overflow(p); ok(t('filled: no sideways scroll or overflow ' + o.join(',')), o.length === 0);
    o = await overlaps(p); ok(t('filled: nothing overlaps ' + o.join(',')), o.length === 0);
    if (w >= 900) {
      for (const y of ['top', 'middle', 'bottom']) {
        await p.evaluate(y => window.scrollTo(0, y === 'top' ? 0 : y === 'bottom' ? 1e6 : document.body.scrollHeight / 2), y);
        const q = await overlaps(p); ok(t('scroll ' + y + ': no overlap ' + q.join(',')), q.length === 0);
      }
      const two = await p.evaluate(() => { const a = document.querySelector('.inputs').getBoundingClientRect(), r = document.querySelector('#result').getBoundingClientRect(); return r.left >= a.right - 1 && Math.abs(r.top - a.top) < 4; });
      ok(t('desktop: inputs left, result right, same top'), two);
    }
    if (w <= 390) { const sc = await p.evaluate(() => getComputedStyle(document.querySelector('.app')).display); ok(t('phone layout is single column'), sc !== 'grid'); }
    await p.click('#new-wk');
    o = await overflow(p); ok(t('cleared: no overflow ' + o.join(',')), o.length === 0);
    o = await overlaps(p); ok(t('cleared: nothing overlaps'), o.length === 0);
    await p.context().close();
  }

  // --- theme switch and offline files
  { const p = await load(b, { width: 1280, height: 900 });
    const before = await p.evaluate(() => getComputedStyle(document.body).color);
    await p.click('.theme-toggle');
    const after = await p.evaluate(() => getComputedStyle(document.body).color);
    ok('light/dark switch changes the colours', before !== after);
    await p.context().close(); }
  for (const f of ['favicon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'manifest.webmanifest', 'sw.js', 'LICENSE', 'README.md', 'screenshots/desktop.png', 'screenshots/phone.png'])
    ok('file exists: ' + f, fs.existsSync(path.join(__dirname, f)) || shots);

  if (shots) {
    const fillShot = async p => { await enter(p); await p.click('#show-opt'); await p.selectOption('#thr', '40'); await p.fill('#rate', '20'); };
    let p = await load(b, { width: 1280, height: 1500 }); await fillShot(p); await p.evaluate(() => { document.activeElement.blur(); scrollTo(0, 0); }); await p.screenshot({ path: path.join(__dirname, 'screenshots/desktop.png')}); await p.context().close();
    p = await load(b, { width: 390, height: 844 }); await fillShot(p); await p.evaluate(() => { document.activeElement.blur(); document.querySelector('#result').scrollIntoView(); scrollBy(0, -8); }); await p.screenshot({ path: path.join(__dirname, 'screenshots/phone.png') }); await p.context().close();
  }
  await b.close();
  console.log(fail ? fail + ' FAILED' : 'ALL PASSED');
  process.exit(fail ? 1 : 0);
})();
