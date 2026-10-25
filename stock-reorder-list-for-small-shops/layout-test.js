// Layout checks with a realistic filled-in shop, panels open and every optional field shown, at 11 widths in dark and light.
// Run from the repo root with a static server on port 8765 (or pass a base url).
const { chromium } = require('playwright');
const BASE = (process.argv[2] || 'http://localhost:8765').replace(/\/$/, '');
const URL = BASE + '/stock-reorder-list-for-small-shops/';
const day = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const it = (id, name, unit, sup, stock, low, full, price, extra) => Object.assign({ id, name, unit, sup, stock, low, full, price, arch: false, upd: day(0), ord: null, got: [] }, extra || {});
const items = [it('a', 'Cooking oil 5 L', 'carton', 'Ali Traders', 200, 200, 600, 460000), it('b', 'Sugar 50 kg', 'bag', 'Ali Traders', 100, 100, 300, 725000),
    it('c', 'Shopping bags', 'packet', 'Bilal Packaging and Plastic Wholesale Company', 300, 1000, 4000, 18000), it('d', 'UHT milk 1 L', 'carton', '', 0, 200, 800, 0),
    it('e', 'Rice 25 kg', 'bag', 'Ali Traders', 99999900, 200, 99999900 + 0, 9999999999 > 0 ? 900000 : 0), it('f', 'Loose daal', 'kg', 'Ali Traders', 1250, 500, 2500, 34000),
    it('g', 'Biscuits', 'box', 'Ali Traders', 100, 200, 700, 96000, { ord: { q: 600, d: day(2) } }), it('h', 'Tea 950 g', 'packet', 'Lipton', 1800, 600, 2400, 165000),
    it('i', 'A very long item name that keeps going on and on for sixty', 'strip', 'Ali Traders', 0, 1000, 5000, 9999999999), it('j', 'Old soap', 'box', 'X', 0, 0, 5, 0, { arch: true })];
items[4].full = 99999900; items[4].low = 200; items[4].stock = 99999800;
const STATE = { v: 1, cur: 'AED', shop: 'Madina General Store', phones: { 'ali traders': '923001234567' }, items };
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) pass++; else { fail++; console.log('FAIL ' + n + (x !== undefined ? '  ' + JSON.stringify(x) : '')); } };
(async () => {
    const b = await chromium.launch();
    for (const scheme of ['dark', 'light']) for (const w of [320, 360, 390, 600, 820, 899, 900, 1024, 1280, 1418, 1920]) {
        const ctx = await b.newContext({ viewport: { width: w, height: 800 }, colorScheme: scheme, locale: 'en-GB' });
        await ctx.route(/goatcounter\.com|gc\.zgo\.at/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
        await ctx.addInitScript(s => localStorage.setItem('stock-reorder-list-for-small-shops.state', s), JSON.stringify(STATE));
        const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
        await p.goto(URL, { waitUntil: 'networkidle' });
        const tag = scheme + ' ' + w + ': ';
        const check = async (what) => {
            const r = await p.evaluate(() => {
                const W = document.documentElement.clientWidth, out = [];
                if (document.documentElement.scrollWidth > W + 1) out.push('horizontal scroll ' + document.documentElement.scrollWidth);
                document.querySelectorAll('main *').forEach(e => { const b = e.getBoundingClientRect(); if (b.width && (b.right > W + 1 || b.left < -1) && getComputedStyle(e).position !== 'absolute') out.push('sticks out: ' + (e.id || e.className || e.tagName)); });
                // controls overlapping each other
                const ctl = [...document.querySelectorAll('main input:not([type=radio]):not([type=file]), main select, main button, main a.secondary, main textarea')].filter(e => e.offsetParent).map(e => [e, e.getBoundingClientRect()]);
                for (let i = 0; i < ctl.length; i++) for (let j = i + 1; j < ctl.length; j++) {
                    const [ea, a] = ctl[i], [eb, c] = ctl[j];
                    if (ea.contains(eb) || eb.contains(ea)) continue;
                    if (Math.min(a.right, c.right) - Math.max(a.left, c.left) > 1 && Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top) > 1) out.push('overlap ' + (ea.id || ea.textContent.trim().slice(0, 20)) + ' / ' + (eb.id || eb.textContent.trim().slice(0, 20)));
                }
                // placeholders fit their box
                document.querySelectorAll('main input[placeholder]').forEach(e => {
                    if (!e.offsetParent) return;
                    const c = document.createElement('canvas').getContext('2d'), s = getComputedStyle(e); c.font = s.fontSize + ' ' + s.fontFamily;
                    const room = e.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight);
                    if (c.measureText(e.placeholder).width > room + 1) out.push('placeholder cut: ' + e.id);
                });
                return out;
            });
            ok(tag + what, !r.length, r.slice(0, 5));
        };
        await check('filled');
        // open every optional field and panel
        await p.click('#f-price-open'); await p.selectOption('#f-unit', '+own'); await p.click('#shop-open');
        await p.click('#phl-ali-traders');
        await check('phone panel + optional fields');
        await p.click('#groups >> text=Cancel');
        await p.click('#wait >> text=Delivery came');
        await check('delivery panel');
        await p.click('#wait >> text=Cancel');
        await p.click('#items > li:has-text("Biscuits") >> text=Delivery came');
        await check('delivery panel in item');
        await p.locator('#st-e').fill('xx'); await p.locator('#st-e').press('Enter');
        await p.click('#f-save');
        await check('errors showing');
        // scroll: sibling blocks never overlap
        if (w >= 900) for (const pos of [0, .5, 1]) {
            await p.evaluate(f => window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * f), pos);
            const o = await p.evaluate(() => {
                const out = [];
                [document.querySelector('main'), ...document.querySelectorAll('.col-main, .col-side')].forEach(par => {
                    const kids = [...par.children].filter(e => e.offsetParent && getComputedStyle(e).display !== 'contents').map(e => [e, e.getBoundingClientRect()]);
                    for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
                        const a = kids[i][1], c = kids[j][1];
                        if (Math.min(a.right, c.right) - Math.max(a.left, c.left) > 1 && Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top) > 1) out.push((kids[i][0].id || kids[i][0].className) + ' / ' + (kids[j][0].id || kids[j][0].className));
                    }
                });
                return out;
            });
            ok(tag + 'no overlap at scroll ' + pos, !o.length, o);
        }
        // cleared state
        await p.evaluate(() => { localStorage.setItem('stock-reorder-list-for-small-shops.state', JSON.stringify({ items: [] })); });
        await ctx.clearCookies();
        await p.evaluate(() => { document.getElementById('del-all'); });
        ok(tag + 'no page errors', !errs.length, errs);
        await ctx.close();
        // the start-over state
        const c2 = await b.newContext({ viewport: { width: w, height: 800 }, colorScheme: scheme });
        await c2.route(/goatcounter\.com|gc\.zgo\.at/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
        const p2 = await c2.newPage(); await p2.goto(URL, { waitUntil: 'networkidle' });
        const sw = await p2.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
        ok(tag + 'empty state no horizontal scroll', sw);
        await c2.close();
    }
    // Help dialog
    for (const w of [320, 390, 820, 1280]) {
        const ctx = await b.newContext({ viewport: { width: w, height: 800 } });
        await ctx.route(/goatcounter\.com|gc\.zgo\.at/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
        const p = await ctx.newPage(); await p.goto(URL, { waitUntil: 'networkidle' });
        await p.click('.help-btn');
        const box = await p.locator('dialog.help').boundingBox();
        ok('help ' + w + ' inside the screen', box.x >= 0 && box.y >= 0 && box.x + box.width <= w && box.y + box.height <= 800, box);
        ok('help ' + w + ' title', /How to use Stock Reorder List for Small Shops/.test(await p.locator('dialog.help').innerText()));
        await p.keyboard.press('Escape'); ok('help ' + w + ' Escape closes', !(await p.locator('dialog.help').evaluate(d => d.open)));
        await p.click('.help-btn'); await p.click('.help-close'); ok('help ' + w + ' Got it closes', !(await p.locator('dialog.help').evaluate(d => d.open)));
        const bar = await p.evaluate(() => [...document.querySelectorAll('.topbar > *')].map(e => { const r = e.getBoundingClientRect(); return [r.top, r.height]; }));
        ok('help ' + w + ' top bar on one line', bar.every(x => Math.abs(x[0] - bar[0][0]) < 2), bar);
        // theme switch
        const before = await p.evaluate(() => getComputedStyle(document.body).color);
        await p.click('.theme-toggle');
        ok('theme switch ' + w, before !== await p.evaluate(() => getComputedStyle(document.body).color));
        await ctx.close();
    }
    await b.close();
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    if (fail) process.exitCode = 1;
})();
