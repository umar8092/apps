// Saves screenshots/desktop.png and phone.png with Sana's week from the README. Run: node shots.js
// "Today" is fixed to Wed 4 Nov 2026 in Pakistan time.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), SLUG = 'order-book-for-home-bakers-and-caterers';
const OUT = process.argv[2] || path.join(__dirname, 'screenshots');
const O = (id, name, what, date, time, price, adv, extra) => Object.assign({ id, n: id, name, phone: '', what, note: '', date, time, mode: 'pickup', addr: '', price: price * 100, deliv: 0, adv: adv * 100, pays: [], status: 'open', refund: false, created: '2026-11-01' }, extra || {});
const BOOK = { v: 1, cur: 'Rs', style: 'intl', limit: 4, shop: "Sana's Bakes", nextId: 10, orders: [
    O(1, 'Sana Ahmed', 'Chocolate cake, 2 pounds', '2026-11-05', '16:00', 4500, 1500, { note: 'Happy Birthday Ayesha', phone: '+92 300 1234567' }),
    O(2, 'Bilal Khan', 'Chicken biryani, 1 deg', '2026-11-05', '13:00', 9000, 3000, { mode: 'delivery', deliv: 25000, addr: 'House 12, Street 4', phone: '0321 7654321' }),
    O(3, 'Hina Raza', 'Cupcakes, 12', '2026-11-05', '', 2400, 2400),
    O(4, 'Ayesha Malik', 'Red velvet cake, 1 pound', '2026-11-04', '18:00', 2800, 0, { status: 'ready' }),
    O(5, 'Farah Iqbal', 'Frozen samosas, 2 dozen', '2026-11-02', '12:00', 1800, 0, { status: 'done' }),
    O(6, 'Usman Ali', 'Lunch boxes x10', '2026-11-07', '11:30', 6000, 2000, { mode: 'delivery', addr: 'Office, 3rd floor, Gulberg' }),
    O(7, 'Zara Shah', 'Brownies, 1 box', '2026-11-03', '15:00', 1500, 500, { status: 'cancel' }),
    O(8, 'Nadia Hussain', 'Vanilla cake, 3 pounds', '2026-11-01', '17:00', 3500, 1000, { status: 'done', pays: [{ d: '2026-11-01', amt: 250000 }] }),
    O(9, 'Imran Butt', 'Kheer, 1 kg', '2026-11-03', '19:30', 1200, 0),
] };
module.exports = { BOOK, O };
if (require.main === module) (async () => {
    const types = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml', png: 'image/png', webmanifest: 'application/manifest+json' };
    const srv = await new Promise(res => { const s = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0].replace(/^\/apps/, '')); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': types[f.split('.').pop()] || 'application/octet-stream' }); r.end(fs.readFileSync(f)); }).listen(0, () => res(s)); });
    const browser = await chromium.launch();
    for (const [name, vp, scale] of [['desktop', { width: 1280, height: 900 }, 1], ['phone', { width: 390, height: 844 }, 2]]) {
        const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: scale, colorScheme: 'dark', timezoneId: 'Asia/Karachi' });
        await ctx.route(/goatcounter\.com|gc\.zgo\.at/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
        await ctx.addInitScript(b => localStorage.setItem('order-book-for-home-bakers-and-caterers.state', b), JSON.stringify(BOOK));
        const page = await ctx.newPage();
        await page.clock.setFixedTime(new Date('2026-11-04T10:00:00+05:00'));
        await page.goto('http://localhost:' + srv.address().port + '/apps/' + SLUG + '/', { waitUntil: 'networkidle' });
        // a new order being typed on the desktop shot, so the form shows its answer too
        if (name === 'desktop') {
            await page.fill('#f-name', 'Maryam Javed'); await page.fill('#f-what', 'Mango cake, 2 pounds'); await page.fill('#f-date', '2026-11-05'); await page.selectOption('#f-time', '17:00');
            await page.fill('#f-price', '4200'); await page.click('#o-adv'); await page.fill('#f-adv', '2000'); await page.locator('#f-price').dispatchEvent('input');
        }
        await page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: name === 'phone' ? false : false });
        if (process.argv[3]) await page.screenshot({ path: path.join(OUT, name + '-full.png'), fullPage: true });
        await ctx.close();
    }
    await browser.close(); srv.close();
})();
