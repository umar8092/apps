# Daily Cash Book for Small Shops

A free daily cash book (**rozanamcha**, galla hisaab) for a **small shop, tuck shop, tailor, pharmacy counter or home business** that takes cash every day. Write down the **cash sales**, **card or mobile wallet sales**, **stock bought**, **expenses** (rent, electricity, wages, tea) and the **money the owner takes home** as they happen. At closing, count the drawer and the app answers the two questions every shopkeeper asks, in plain words: **"Cash should be 18,450. You counted 18,200: 250 short"**, and how the day went: **"Sales today 20,050, sales minus stock and expenses 12,350"**. The next day opens with the cash you counted, and the week and month totals add up every kind of expense for you or your accountant. No sign-up, no ads, private on your device, works offline.

**Live demo:** [umar8092.github.io/apps/daily-cash-book-for-small-shops](https://umar8092.github.io/apps/daily-cash-book-for-small-shops/)

| Desktop | On a phone |
|---|---|
| ![Daily Cash Book for Small Shops on a laptop: Thursday 22 October with the six choices Cash sale, Card or mobile sale, Other cash in, Bought stock, Expense and Owner took on the left; on the right opening cash 12,400 from Wednesday's count, plus cash sales 17,750, minus stock 6,000, expenses 1,700 and owner took 4,000, Cash should be 18,450, counted 18,200 and the red result Rs 250 short](screenshots/desktop.png) | <img src="screenshots/phone.png" alt="Daily Cash Book for Small Shops on a phone: the Cash in the drawer card with Cash should be Rs 18,450, the count 18200 and the result Rs 250 short, with Sales today Rs 20,050 and Sales minus stock and expenses Rs 12,350" width="220"> |

## The situation it solves

Asad runs a general store. Every evening he wants to know whether the cash in the drawer is right, and whether the shop made money, without doing sums on the back of a receipt book.

**Wednesday 21 October.** He opened with **2,000** of change, sold **15,000** in cash, paid a supplier **4,000** for stock and the electricity bill **500**. The app says **Cash should be 12,500**. He counted **12,400**: **Rs 100 short**.

**Thursday 22 October.** The day opens by itself with **12,400** ("The cash you counted on Wed, 21 Oct"). During the day he adds cash sales of **9,800**, **4,250** and **3,700**, a **2,300** JazzCash payment (a card or mobile sale: it counts as a sale but is not in the drawer), **6,000** of stock from Ali Traders, **200** for tea, **1,500** in wages, and takes **4,000** home. At closing:

- **12,400 + 17,750 − 6,000 − 1,700 − 4,000 = Cash should be 18,450**
- He counts **18,200**: **Rs 250 short**. "You counted Rs 18,200 but Rs 18,450 should be there. Check for a missed expense or wrong change given."
- **Sales today 20,050** (cash 17,750, card or mobile 2,300) and **Sales minus stock and expenses 12,350**
- **The next day opens with 18,200 (your count).**

**This week** (Mon 19 to Sun 25 Oct, Wednesday and Thursday only): sales **35,050**, stock **10,000**, expenses **2,200** (Wages 1,500, Electricity 500, Tea and food 200), sales minus stock and expenses **22,850**, owner took **4,000**, **Rs 350 short on 2 counted days**.

Other cases from the tests (all checked by hand):

- **Doesn't write each sale:** on Saturday Asad wrote only 3,000 of stock and 1,000 taken home, then counted **30,000** with 18,200 carried in: **Rs 15,800 over**. **Add the difference as cash sales** turns that into the day's cash sales, and the count **matches exactly**.
- **Shop closed on Friday:** Saturday still opens with Thursday's count of 18,200.
- **A mistake yesterday:** changing Wednesday's count to 12,500 makes Thursday open with 12,500, **should be 18,550**, **350 short**.
- **Not counted:** the next day opens with what should have been there.
- **Count by notes and coins:** 3 × 5,000 + 2 × 1,000 + 2 × 100 = **17,200**, then **Use this total**.
- **More out than in:** Cash should be **−35,800** with a warning to check for missing sales or opening cash.
- Odd cents stay exact: 0.10 + 0.10 + 0.20 = **0.40**, counted 0.39: **0.01 short**. A count of **0** is a real count.
- Amounts can be typed as `18200`, `18,200`, `1,00,000`, `Rs 1500` or `1500/-`. Blank, 0, a minus sign, words or more than 9,999,999,999.99 get a clear message.

## Features

- **Help button** at the top with a how-to for this app, **All apps** to go back to the list, and a **Light / Dark** switch.
- **One day at a time** with **‹** and **›**, **Change date** for any past day and **Back to today**. Future days cannot be filled in.
- **Six big choices:** **Cash sale**, **Card or mobile sale**, **Other cash in**, **Bought stock**, **Expense** (with one-tap types such as Rent, Electricity, Wages, Tea and food, or your own) and **Owner took**. Type the amount and press Enter; the choice stays selected for the next one. **+ Add a note (optional)** for a supplier or customer name.
- **Cash in the drawer:** opening cash (carried from the last day, or typed with **Change opening cash**), plus and minus lines, **Cash should be**, **Cash you counted in the drawer** and the answer **Matches exactly**, **… short** or **… over** in colour. **+ Count by notes and coins (optional)** adds up each note and coin for the chosen currency.
- **Add the difference as cash sales** for shops that only count at closing.
- **Entries** each in their own box with **Edit** and **Delete**, **Clear this day**, and **Undo** after every change.
- **Week and month totals:** this week, last week, this month, last month and earlier months, with sales, stock, expenses, **Sales minus stock and expenses**, owner took, cash short or over, **Expenses by type** and **Day by day** (tap a day to open it).
- **Copy this day**, **Email this day**, **Copy totals**, **Email totals** (no address needed) and **Print or save as PDF** with a table of every day and every entry, for the accountant.
- **Currency symbol** (none, Rs, ₹, $, €, £, ৳, AED, SAR and more, remembered), **+ Add your shop's name (optional)**, **Save a backup file** and **Restore a backup** (checked, with Undo), **Delete everything** with Undo.
- Private: no account and your data is never sent anywhere. Works offline once loaded, and can be installed on the home screen.

## Run it yourself

```
git clone https://github.com/umar8092/apps.git
```

Then open `daily-cash-book-for-small-shops/index.html` in a browser. No build step and no dependencies.

Tests: `node daily-cash-book-for-small-shops/tests.js` checks the maths and the wording (or open `test.html`), and `node daily-cash-book-for-small-shops/ui-test.js` drives the page in headless Chromium at every screen size (needs Playwright).

## How it works

Plain HTML, CSS and JavaScript. The maths lives in `core.js`, and all money is kept in whole cents so nothing is lost to rounding. The app walks through every day that has entries in date order: a day opens with the cash typed for it, or else the closing of the day before (the count if there was one, otherwise what should have been there). **Cash should be** is the opening cash plus cash sales and other cash in, minus stock, expenses and what the owner took; card and mobile sales count as sales but never touch the drawer. Because each day is worked out again from the start, correcting an earlier day fixes every day after it. Everything is saved in this browser's `localStorage` and checked when loaded or restored; a network-first service worker keeps the app working offline.

## License

MIT, see [LICENSE](LICENSE).
