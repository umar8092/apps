// Makes screenshots/desktop.png and screenshots/phone.png with a realistic shop. Run from the repo root with a static server on port 8765.
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:8765';
const day = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const it = (id, name, unit, sup, stock, low, full, price, extra) => Object.assign({ id, name, unit, sup, stock, low, full, price, arch: false, upd: day(0), ord: null, got: [] }, extra || {});
const STATE = { v: 1, cur: 'Rs', shop: 'Madina General Store', phones: {}, items: [
    it('a', 'Cooking oil 5 L', 'carton', 'Ali Traders', 200, 200, 600, 460000),
    it('b', 'Sugar 50 kg', 'bag', 'Ali Traders', 100, 100, 300, 725000),
    it('c', 'Shopping bags', 'packet', 'Bilal Packaging', 300, 1000, 4000, 18000),
    it('d', 'UHT milk 1 L', 'carton', '', 0, 200, 800, 0),
    it('e', 'Rice 25 kg', 'bag', 'Ali Traders', 500, 200, 600, 900000, { upd: day(3) }),
    it('f', 'Loose daal', 'kg', 'Ali Traders', 1250, 500, 2500, 34000, { upd: day(1) }),
    it('g', 'Biscuits', 'box', 'Ali Traders', 100, 200, 700, 96000, { ord: { q: 600, d: day(2) } }),
    it('h', 'Tea 950 g', 'packet', 'Lipton Distributor', 1800, 600, 2400, 165000, { got: [{ d: day(6), q: 1200, p: 165000 }] })] };
(async () => {
    const b = await chromium.launch();
    for (const [name, w, h, scale] of [['desktop', 1280, 1500, 1], ['phone', 390, 1600, 2]]) {
        const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: scale, colorScheme: 'dark', locale: 'en-GB' });
        await ctx.route(/goatcounter\.com|gc\.zgo\.at/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
        await ctx.addInitScript(s => { if (!localStorage.getItem('stock-reorder-list-for-small-shops.state')) localStorage.setItem('stock-reorder-list-for-small-shops.state', s); }, JSON.stringify(STATE));
        const p = await ctx.newPage();
        await p.goto(BASE + '/stock-reorder-list-for-small-shops/', { waitUntil: 'networkidle' });
        await p.screenshot({ path: 'stock-reorder-list-for-small-shops/screenshots/' + name + '.png' });
        await ctx.close();
    }
    await b.close();
})();
