#!/usr/bin/env node
// Shared quality check for every app. Usage:  node scripts/check-app.js <slug> [--base https://umar8092.github.io/apps]
// Without --base it serves this repo locally. With --base it tests the LIVE site.
// Checks files and metadata, then loads the page at 11 widths in dark and light and tests: console errors, failed requests,
// horizontal scroll, overlapping blocks (also after scrolling), overlapping controls on phones, and the Help dialog.
// Exit code 1 and a list of failures if anything is wrong. Paste the summary into the run report.
// Needs Playwright (npm i playwright) or set CHROME=/path/to/chrome with playwright-core installed.
const fs = require('fs'), path = require('path'), http = require('http');
let pw; try { pw = require('playwright'); } catch (e) { pw = require('playwright-core'); }

const args = process.argv.slice(2), slug = args.find(a => !a.startsWith('--'));
const baseIdx = args.indexOf('--base'), BASE = baseIdx >= 0 ? args[baseIdx + 1].replace(/\/$/, '') : null;
if (!slug) { console.error('Usage: node scripts/check-app.js <slug> [--base URL]'); process.exit(2); }
const ROOT = path.resolve(__dirname, '..');
const WIDTHS = [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920];
const fails = [], notes = [];
const fail = m => { if (!fails.includes(m)) fails.push(m); };

function serve() {
    const types = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml', png: 'image/png', webmanifest: 'application/manifest+json', woff2: 'font/woff2', xml: 'application/xml', txt: 'text/plain' };
    return new Promise(res => {
        const s = http.createServer((req, rs) => {
            let p = decodeURIComponent(req.url.split('?')[0].replace(/^\/apps/, '')); if (p.endsWith('/')) p += 'index.html';
            const f = path.join(ROOT, p);
            if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rs.writeHead(404); return rs.end('nf'); }
            rs.writeHead(200, { 'content-type': types[f.split('.').pop()] || 'application/octet-stream' }); rs.end(fs.readFileSync(f));
        }).listen(0, () => res({ s, base: 'http://localhost:' + s.address().port }));
    });
}

function staticChecks() {
    const dir = path.join(ROOT, slug), has = f => fs.existsSync(path.join(dir, f));
    if (!fs.existsSync(dir)) return fail('folder ' + slug + '/ does not exist');
    ['index.html', 'favicon.svg', 'manifest.webmanifest', 'sw.js', 'README.md', 'LICENSE', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'screenshots/desktop.png', 'screenshots/phone.png']
        .forEach(f => { if (!has(f)) fail('missing file ' + slug + '/' + f); });
    if (!has('index.html')) return;
    const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
    if (!/<meta\s+name=["']description["']\s+content=["'][^"']{20,}/i.test(html)) fail('index.html needs a <meta name="description"> (the hub only lists pages that have one)');
    if (!/<meta\s+name=["']app-color["']\s+content=["']#[0-9a-f]{6}/i.test(html)) fail('index.html needs <meta name="app-color" content="#hex">');
    if (!/<a[^>]*class=["']back["'][^>]*href=["']\.\.\/["']/.test(html) && !/<a[^>]*href=["']\.\.\/["'][^>]*class=["']back["']/.test(html)) fail('missing the "← All apps" back link (a.back to ../)');
    if (!/src=["']\.\.\/help\.js["']/.test(html)) fail('missing <script src="../help.js">');
    const hd = html.match(/<script[^>]*id=["']help-data["'][^>]*>([\s\S]*?)<\/script>/);
    if (!hd) fail('missing help-data JSON block'); else { try { const d = JSON.parse(hd[1]); if (!d.title || !(d.sections || []).length) fail('help-data needs a title and sections'); } catch (e) { fail('help-data is not valid JSON'); } }
    if (/innerHTML\s*=/.test(['script.js', 'app.js', 'core.js'].filter(has).map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n') + html)) notes.push('NOTE: innerHTML found; confirm no user-typed text goes through it (use textContent)');
    const sw = has('sw.js') ? fs.readFileSync(path.join(dir, 'sw.js'), 'utf8') : '';
    if (sw && !new RegExp("['\"]" + slug + "-v\\d+").test(sw)) fail('sw.js cache name must be "' + slug + '-vN"');
    if (sw && /caches\.delete/.test(sw) && !new RegExp("(startsWith\\(|indexOf\\()['\"]" + slug + "-").test(sw)) fail('sw.js must delete only caches starting with "' + slug + '-"');
    ['help.js', 'theme.js'].forEach(f => { if (new RegExp("\\.\\./" + f).test(html) && sw && !sw.includes('../' + f)) fail('sw.js FILES list is missing ../' + f); });
    const keys = [...(html + ['script.js', 'app.js'].filter(has).map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n')).matchAll(/(?:localStorage|sessionStorage)\.\w+Item\(\s*['"]([^'"]+)['"]/g)].map(m => m[1]);
    keys.filter(k => k !== slug && !k.startsWith(slug + '.')).forEach(k => fail('storage key "' + k + '" must start with "' + slug + '."'));
    let apps = []; try { apps = JSON.parse(fs.readFileSync(path.join(ROOT, 'apps.json'), 'utf8')); } catch (e) { fail('apps.json unreadable'); }
    const e = apps.find(a => a.slug === slug);
    if (!e) fail('apps.json has no entry for ' + slug); else if (!e.name || !e.description || !/^#[0-9a-f]{6}$/i.test(e.color || '')) fail('apps.json entry needs name, description and color');
    const readme = has('README.md') ? fs.readFileSync(path.join(dir, 'README.md'), 'utf8') : '';
    [...readme.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].forEach(m => { if (!/^https?:/.test(m[1]) && !has(m[1])) fail('README image not found: ' + m[1]); });
    const root = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
    if (!root.includes('(' + slug + '/)') && !root.includes('/apps/' + slug + '/')) fail('root README.md has no entry for ' + slug);
}

async function pageChecks(base) {
    const url = base + '/' + slug + '/';
    const browser = await pw.chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
    for (const scheme of ['dark', 'light']) {
        const ctx = await browser.newContext({ colorScheme: scheme, viewport: { width: 1280, height: 800 } });
        const page = await ctx.newPage();
        let tag = '';
        page.on('pageerror', e => fail(tag + 'page error: ' + e.message));
        page.on('console', m => { if (m.type() === 'error') fail(tag + 'console error: ' + m.text().slice(0, 150)); });
        page.on('response', r => { if (r.status() >= 400 && r.url().startsWith(base)) fail(tag + 'request failed ' + r.status() + ': ' + r.url().replace(base, '')); });
        for (const w of WIDTHS) {
            tag = '[' + scheme + ' ' + w + 'px] ';
            await page.setViewportSize({ width: w, height: w < 600 ? 800 : 900 });
            await page.goto(url, { waitUntil: 'networkidle' }).catch(e => fail(tag + 'could not load: ' + e.message));
            const noScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
            if (!await noScroll()) fail(tag + 'horizontal scroll');
            // sticking out of the page
            const out = await page.evaluate(() => [...document.querySelectorAll('main *, .app *, .page *')].filter(e => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && cs.position !== 'fixed' && cs.display !== 'none' && (r.right > window.innerWidth + 1 || r.left < -1) && !e.closest('[style*="overflow"]') && getComputedStyle(e.parentElement).overflowX === 'visible'; }).slice(0, 3).map(e => e.tagName + '.' + e.className));
            if (out.length) fail(tag + 'sticks out of the page: ' + out.join(', '));
            // overlapping sibling blocks, at the top, middle and bottom of the page
            const overlapJs = () => page.evaluate(() => {
                const bad = [], hosts = document.querySelectorAll('main, .app, .page');
                hosts.forEach(h => { const k = [...h.children].filter(c => { const r = c.getBoundingClientRect(), cs = getComputedStyle(c); return r.width > 4 && r.height > 4 && cs.display !== 'none' && cs.position !== 'fixed' && cs.position !== 'absolute'; });
                    for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { const a = k[i].getBoundingClientRect(), b = k[j].getBoundingClientRect(); const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left), oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top); if (ox > 4 && oy > 4) bad.push((k[i].className || k[i].tagName) + ' / ' + (k[j].className || k[j].tagName)); } });
                return bad.slice(0, 3);
            });
            for (const pos of [0, 0.5, 1]) {
                await page.evaluate(p => window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * p), pos);
                const o = await overlapJs(); if (o.length) fail(tag + 'blocks overlap after scrolling ' + pos * 100 + '%: ' + o.join('; '));
            }
            // controls overlapping each other (phones)
            if (w <= 390) {
                const c = await page.evaluate(() => { const k = [...document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, button, textarea')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; }); const bad = [];
                    for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) { if (k[i].contains(k[j]) || k[j].contains(k[i])) continue; const a = k[i].getBoundingClientRect(), b = k[j].getBoundingClientRect(); const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left), oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top); if (ox > 3 && oy > 3) bad.push((k[i].id || k[i].className || k[i].tagName) + ' / ' + (k[j].id || k[j].className || k[j].tagName)); }
                    return bad.slice(0, 3); });
                if (c.length) fail(tag + 'controls overlap: ' + c.join('; '));
            }
            // tap size on phones
            if (w <= 390) { const s = await page.evaluate(() => [...document.querySelectorAll('button, a.back, select, input:not([type=hidden])')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 32 && e.type !== 'checkbox' && e.type !== 'radio' && !e.closest('summary'); }).slice(0, 3).map(e => (e.id || e.className || e.tagName) + ' ' + Math.round(e.getBoundingClientRect().height) + 'px')); if (s.length && !notes.some(n => n.startsWith('NOTE small tap'))) notes.push('NOTE small tap targets under 32px on phones (first seen ' + tag.trim() + '): ' + s.join(', ')); }
            // help dialog
            if (['320', '390', '820', '1280'].includes(String(w))) {
                await page.evaluate(() => window.scrollTo(0, 0));
                const btn = page.locator('.help-btn').first();
                if (!await btn.count()) { fail(tag + 'no Help button'); continue; }
                const bb = await btn.boundingBox(), bk = await page.locator('a.back').first().boundingBox();
                if (bb && bk && Math.min(bb.x + bb.width, bk.x + bk.width) - Math.max(bb.x, bk.x) > 2 && Math.min(bb.y + bb.height, bk.y + bk.height) - Math.max(bb.y, bk.y) > 2) fail(tag + 'Help button overlaps the back button');
                await btn.click();
                const d = page.locator('dialog.help'); if (!await d.evaluate(e => e.open)) fail(tag + 'Help dialog did not open');
                else { const r = await d.boundingBox(); if (!r || r.x < -1 || r.y < -1 || r.x + r.width > w + 1 || r.y + r.height > (w < 600 ? 800 : 900) + 1) fail(tag + 'Help dialog is not fully on screen'); if (!(await d.locator('h2').innerText()).trim()) fail(tag + 'Help dialog has no title'); }
                await page.keyboard.press('Escape'); if (await d.evaluate(e => e.open)) fail(tag + 'Escape did not close Help');
                await btn.click(); await page.locator('.help-close').click(); if (await d.evaluate(e => e.open)) fail(tag + '"Got it" did not close Help');
            }
        }
        await ctx.close();
    }
    // reload with corrupt saved state must not crash
    const ctx = await browser.newContext(), page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.goto(url); await page.evaluate(s => { Object.keys(localStorage).filter(k => k.startsWith(s + '.')).forEach(k => localStorage.setItem(k, '{bad')); localStorage.setItem(s + '.state', '{bad'); }, slug);
    await page.reload({ waitUntil: 'networkidle' }); if (errs.length) fail('corrupt saved state crashes the page: ' + errs[0]);
    await browser.close();
}

(async () => {
    const idx = path.join(ROOT, slug, 'index.html');
    if (!BASE && fs.existsSync(idx) && /http-equiv=["']refresh["']/i.test(fs.readFileSync(idx, 'utf8'))) { console.log(slug + ' is a redirect to a renamed app, nothing to check.'); process.exit(0); }
    if (!BASE) staticChecks();
    let srv, base = BASE;
    if (!base) { srv = await serve(); base = srv.base + '/apps'; if (!fs.existsSync(path.join(ROOT, 'index.html'))) fail('repo root has no index.html'); srv.base2 = base; }
    try { await pageChecks(BASE ? BASE : srv.base); } catch (e) { fail('check crashed: ' + e.message); }
    if (srv) srv.s.close();
    notes.forEach(n => console.log(n));
    console.log(fails.length ? '\nFAILED ' + fails.length + ' check(s) for ' + slug + ':\n - ' + fails.join('\n - ') : '\nALL CHECKS PASSED for ' + slug + ' (' + (BASE ? 'live' : 'local') + ', 11 widths x dark+light)');
    process.exit(fails.length ? 1 : 0);
})();
