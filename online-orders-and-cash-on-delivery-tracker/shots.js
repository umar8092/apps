// Saves screenshots/desktop.png and phone.png with Ayesha's parcels from the README. Run: node shots.js
// "Today" is fixed to Mon 16 Nov 2026 in Pakistan time.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const C = require('./core.js');
const ROOT = path.resolve(__dirname, '..'), SLUG = 'online-orders-and-cash-on-delivery-tracker';
const OUT = process.argv[2] || path.join(__dirname, 'screenshots');
const O = (id, shop, what, price, pay, ordered, extra) => C.newOrder(Object.assign({ shop, what, price: Math.round(price * 100), pay, ordered, codPaid: Math.round(price * 100) }, extra || {}), id);
const ORDERS = [
    O(1, 'Temu', 'Phone case', 1250, 'cod', '2026-11-02', { expected: '2026-11-13', track: 'TM123456789', courier: 'Leopards' }),
    O(2, 'Daraz', 'Kurta, size M', 3200, 'cod', '2026-11-14', { expected: '2026-11-17', retDays: 7 }),
    O(3, 'Amazon', 'Wireless earbuds', 24.99, 'online', '2026-11-09', { expected: '2026-11-20', cur: '$' }),
    O(4, 'Daraz', "Kids' school shoes", 3000, 'cod', '2026-11-15', { expected: '2026-11-19', retDays: 7 }),
    O(5, 'Shein', 'Shoes', 4800, 'online', '2026-11-01', { status: 'arrived', arrived: '2026-11-07', retDays: 14 }),
    O(6, 'Daraz', 'Table lamp', 2150, 'cod', '2026-11-08', { status: 'arrived', arrived: '2026-11-13', retDays: 7 }),
    O(7, 'Instagram shop', 'Handbag', 2500, 'online', '2026-11-03', { status: 'cancelled', endDate: '2026-11-04', refundDue: 250000, refunds: [{ d: '2026-11-10', amt: 100000 }] }),
    O(8, 'Daraz', 'Watch', 5000, 'cod', '2026-10-20', { status: 'returning', arrived: '2026-10-25', retSent: '2026-10-27', refundDue: 500000, retDays: 7 }),
    O(9, 'Temu', 'Charger', 900, 'cod', '2026-11-06', { status: 'refused', endDate: '2026-11-10' }),
    O(10, 'Daraz', 'Water bottle', 1100, 'online', '2026-11-04', { status: 'arrived', arrived: '2026-11-09' }),
];
const STATE = { v: 1, cur: 'Rs', style: 'intl', nextId: 11, orders: ORDERS };
module.exports = { STATE, ORDERS, O };
if (require.main === module) (async () => {
    const types = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml', png: 'image/png', webmanifest: 'application/manifest+json' };
    const srv = await new Promise(res => { const s = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0].replace(/^\/apps/, '')); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': types[f.split('.').pop()] || 'application/octet-stream' }); r.end(fs.readFileSync(f)); }).listen(0, () => res(s)); });
    const browser = await chromium.launch();
    for (const [name, vp, scale] of [['desktop', { width: 1280, height: 900 }, 1], ['phone', { width: 390, height: 844 }, 2]]) {
        const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: scale, colorScheme: 'dark', timezoneId: 'Asia/Karachi' });
        await ctx.route(/goatcounter\.com|gc\.zgo\.at/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
        await ctx.addInitScript(b => localStorage.setItem('online-orders-and-cash-on-delivery-tracker.state', b), JSON.stringify(STATE));
        const page = await ctx.newPage();
        await page.clock.setFixedTime(new Date('2026-11-16T10:00:00+05:00'));
        await page.goto('http://localhost:' + srv.address().port + '/apps/' + SLUG + '/', { waitUntil: 'networkidle' });
        if (name === 'desktop') {
            await page.fill('#f-shop', 'AliExpress'); await page.fill('#f-what', 'Car phone holder'); await page.fill('#f-price', '1890');
            await page.selectOption('#f-exp', '14'); await page.locator('#f-price').dispatchEvent('input');
        }
        await page.screenshot({ path: path.join(OUT, name + '.png') });
        if (process.argv[3]) await page.screenshot({ path: path.join(OUT, name + '-full.png'), fullPage: true });
        await ctx.close();
    }
    await browser.close(); srv.close();
})();
