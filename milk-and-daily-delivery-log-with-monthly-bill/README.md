# Milk and Daily Delivery Log with Monthly Bill

A free log for anything delivered to your door every day or every few days: **milk, a newspaper, water cans, bread, eggs or yogurt**. Add each delivery with its usual amount, price and the days it comes; then just tap the days it **did not come** or came in a **different amount** ("3 litres for guests"). The app answers what the household and the seller argue about at the end of every month, in plain words: **"So far: delivered on 18 days, 37 litres"**, **"26 litres × 220 = 5,720"**, **"Not delivered: 5 Oct and 12 Oct"**, **"To pay: 8,250"**, and the whole month ahead: **"By 31 Oct, if nothing changes: 59 litres, bill 13,310"**. Price rises from a date, holidays, part payments, money carried to the next month, and a bill ready to send on WhatsApp. No sign-up, no ads, private on your device, works offline.

**Live demo:** [umar8092.github.io/apps/milk-and-daily-delivery-log-with-monthly-bill](https://umar8092.github.io/apps/milk-and-daily-delivery-log-with-monthly-bill/)

| Desktop | On a phone |
|---|---|
| ![Milk and Daily Delivery Log on a laptop: October 2026 so far, milk 37 litres bill 8,250, newspaper 19 copies 760, water cans 8 cans 960 with 480 paid, to pay now 9,490; on the right the milk calendar with 5 and 12 Oct crossed out and 17 Oct changed to 3 litres](screenshots/desktop.png) | <img src="screenshots/phone.png" alt="Milk and Daily Delivery Log on a phone: the milk box with today's buttons, the October calendar and the bill, 26 litres at 220 and 11 litres at 230, to pay 8,250" width="220"> |

## The situation it solves

Ayesha gets **2 litres of milk every morning** from Ahmed, the milkman, at **220 a litre**. On 16 October he puts the price up to **230**. The milk did not come on **5 and 12 October**, and on **17 October** she took **3 litres** because guests came. She also gets the newspaper (40 a day; it did not come on 9 October) and a water can on Mondays and Thursdays (120 a can; 2 extra cans on Saturday 10 October, and she has already paid 480). September was paid in full on 2 October. It is now Tuesday 20 October, and at the end of the month Ahmed will say a number she cannot check.

With the app she tapped those few days as they happened. The page now says:

- **Milk: So far: delivered on 18 days, 37 litres.** **26 litres × 220 = 5,720 (1 Oct to 15 Oct)** and **11 litres × 230 = 2,530 (16 Oct to 20 Oct)**. **Not delivered: 5 Oct and 12 Oct. Changed: 17 Oct, 3 litres (usual 2).** **To pay: 8,250.** By 31 Oct, if nothing changes: **59 litres, bill 13,310**.
- **Newspaper:** 19 copies × 40 = **760**.
- **Water cans:** 8 cans × 120 = 960, paid 480, **480 to pay**.
- Top of the page: **To pay now: 9,490.** By 31 Oct, if nothing changes: **15,350**.

She taps **Send on WhatsApp** in the milk box and Ahmed gets:

> Milk: October 2026 (Ahmed)
> So far, 1 to 20 Oct:
> Delivered on 18 days: 37 litres
> 26 litres × 220 = 5,720 (1 Oct to 15 Oct)
> 11 litres × 230 = 2,530 (16 Oct to 20 Oct)
> Not delivered: 5 Oct and 12 Oct
> Changed: 17 Oct 3 litres (usual 2)
> Bill for these days: 8,250
> To pay: 8,250

Worked examples from the tests (all checked by hand):

- September, 2 litres every day at 220: **30 days, 60 litres × 220 = 13,200**.
- October to the 20th, with 5 and 12 Oct missed, 3 litres on the 17th and 230 from the 16th: **26 × 220 = 5,720 + 11 × 230 = 2,530 = 8,250**. Whole month: 26 × 220 + 33 × 230 = **13,310**.
- Not paid in October: November opens with **Owed from before: 13,310**. Paid 10,000: **3,310** carried. Paid 15,000: **Paid ahead: 1,690**.
- Water on Mondays and Thursdays in October 2026: **9 days**, 9 × 120 = **1,080**.
- Every 2nd day from 1 October: **16 days** in October.
- Away 8 to 10 Oct: those days are not billed; if something still came on the 9th, it counts.
- Started on 17 October with 1.5 litres: 4 days, **6 litres × 220 = 1,320**.
- 0.75 litres a day at 0.99 for 31 days: 23.25 × 0.99 = 23.0175, billed **23.02** (rounded once, like a seller).
- February 2027 has 28 newspaper days; March 31, at 40 each: **1,240**.
- Amounts can be typed as `2`, `1.5`, `1,5`, `1/2`, `½` or `2 litres`; prices as `220`, `1,500`, `12.50` or `Rs 220`. A minus sign, words, 0 as the usual amount, more than 1,000 units a day or a price over 1,000,000 get a clear message.

## Features

- **Help button** at the top with a how-to for this app, **All apps** to go back to the list, and a **Light / Dark** switch.
- **Each delivery in its own box** with its own usual amount, unit (litres, kg, packets, bottles, copies, cans, loaves, pieces, dozen or your own), price, and days: **Every day**, **Every 2nd day** or **Only on some days of the week**. Quick picks for Milk, Newspaper, Water cans, Bread, Eggs and Yogurt. Morning and evening milk, or two sellers, are simply two deliveries.
- **Today** line with **Not delivered today** and **Change today's amount**, so the daily tap is one button.
- **Calendar** for the month: the amount on each day, a cross for not delivered, a dash for paused, a gold border for a changed amount, dashed days still to come. Tap any day for **As usual**, **Not delivered** or a **Different amount** (future days too, for guests).
- **The bill** like the seller works it out: total amount × price, one line per price, the days not delivered, changed and extra days, payments, **Owed from before** or **Paid ahead**, and **To pay**. In the current month it counts up to today and also shows the whole month if nothing changes.
- **Price or amount changed** from a date, **Away? Pause deliveries** (one or all deliveries), **Record a payment** for the month it pays for, each listed with **Delete** and **Undo**.
- **Month box** at the top adding up every delivery, with **Previous** / **Next** months, **Copy all bills** and **Print or save as PDF** (a sheet with every day of the month).
- **Copy the bill**, **Send on WhatsApp** (straight to the seller if you added their phone) and **Email** (no address needed) for each seller.
- Optional fields stay hidden until you want them: **+ Add the seller's name and phone (optional)**, **+ Add money owed from before (optional)**, and when editing **+ Stopped? Add the last delivery day (optional)**.
- **Edit** and **Delete** with **Undo**, **Currency symbol** (none, Rs, ₹, $, €, £, ৳, ₦, KSh and more, remembered), **Save a backup file** and **Restore a backup** (checked, with Undo), **Delete everything** with Undo.
- Private: no account and your data is never sent anywhere. Works offline once loaded, and can be installed on the home screen.

## Run it yourself

```
git clone https://github.com/umar8092/apps.git
```

Then open `milk-and-daily-delivery-log-with-monthly-bill/index.html` in a browser. No build step and no dependencies.

Tests: `node milk-and-daily-delivery-log-with-monthly-bill/tests.js` checks the maths and the wording (or open `test.html`), and `node milk-and-daily-delivery-log-with-monthly-bill/ui-test.js` drives the page in headless Chromium (needs Playwright).

## How it works

Plain HTML, CSS and JavaScript. The maths lives in `core.js`. Amounts are stored in thousandths of a unit (1.5 litres = 1500) and money in whole cents, so nothing is lost to rounding. For each day the app works out what came: a day you changed wins, then a pause, then the usual schedule and the usual amount and price in effect on that day. A month's bill groups the delivered amount by price and multiplies each total by its price, rounded once to the nearest cent, the way a seller writes it. Payments are kept per month; whatever a month leaves unpaid (or overpaid) is carried into the next as owed from before (or paid ahead). Everything is saved in this browser's `localStorage` and checked when loaded or restored; a network-first service worker keeps the app working offline.

## License

MIT, see [LICENSE](LICENSE).
