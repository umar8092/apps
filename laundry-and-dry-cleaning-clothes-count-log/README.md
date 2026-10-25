# Laundry and Dry-Cleaning Clothes Count Log

A free log for the **clothes you give to the laundry, the dhobi or the dry cleaner**. Count the pieces of each kind before they go (shirts, trousers, shalwar kameez, bedsheets, suits, or your own kinds), with the **price per piece remembered for each shop**, and tick them off as they come back. The app answers the three questions everyone asks at the laundry counter: **did everything come back, which pieces are still at the shop, and what do I owe?** It handles lost and damaged pieces, express charges, part payments, two or more shops and the month's total per shop. Works offline, no sign-up, no ads.

**Live demo:** [umar8092.github.io/apps/laundry-and-dry-cleaning-clothes-count-log](https://umar8092.github.io/apps/laundry-and-dry-cleaning-clothes-count-log/)

| Desktop | On a phone |
|---|---|
| ![Laundry and Dry-Cleaning Clothes Count Log on a laptop: at the top, Still at the laundry 2 (2 pieces in 1 batch) and To pay 600; the October 2026 box shows City Laundry with 2 batches, 24 pieces, bill 1,600, paid 1,000, to pay 600, and Star Dry Cleaners paid in full; below, the batch of Tue 20 Oct at City Laundry says 2 pieces still with the laundry (5 days), 2 days late, Not back yet: Shirt × 2, with a Back count and + and − for each kind and the bill 1,240, paid 1,000, to pay 240; on the right the form to give clothes with Shirt 4 at 40, Trousers 2 at 50 and Towel 2 at 30, 8 pieces, bill 320](screenshots/desktop.png) | <img src="screenshots/phone.png" alt="Laundry and Dry-Cleaning Clothes Count Log on a phone: the batch of Tue 20 Oct at City Laundry, wash and iron, 14 pieces given, 12 back, 2 pieces still with the laundry (5 days), 2 days late, Not back yet: Shirt × 2; rows for Shirt × 5, Trousers or jeans × 3, Shalwar kameez × 4 and Bedsheet × 2 with a Back count and + and − buttons; All back; Express 250, Bill 1,240, Paid 1,000, To pay 240" width="220"> |

## The situation it solves

Sana gives the family's washing to **City Laundry** every week. On **Tuesday 20 October 2026** she counts what goes and adds an express charge:

| Kind | Pieces | Price each | Line |
|---|---|---|---|
| Shirt | 5 | 40 | 200 |
| Trousers or jeans | 3 | 50 | 150 |
| Shalwar kameez | 4 | 120 | 480 |
| Bedsheet | 2 | 80 | 160 |
| Express (extra charge) | | | 250 |

The line above the button already says **14 pieces · Bill 1,240** (200 + 150 + 480 + 160 + 250).

On **Friday 23 October** the clothes come back and she taps **+** for each piece: all trousers, all shalwar kameez, both bedsheets, but only **3 of the 5 shirts**. She pays **1,000**. On **Sunday 25 October** the app says:

- **2 pieces still with the laundry (5 days), 2 days late** (the shop is set to *Usually ready in 3 days*: 20 Oct + 3 = 23 Oct, and 23 to 25 Oct is 2 days)
- **Not back yet: Shirt × 2**
- **Bill 1,240 · Paid 1,000 · To pay: 240**

She taps **Copy the list** and sends it to the shop:

```
City Laundry: clothes given on Tue, 20 Oct 2026 (Wash and iron)
Shirt × 5 at 40 = 200
Trousers or jeans × 3 at 50 = 150
Shalwar kameez × 4 at 120 = 480
Bedsheet × 2 at 80 = 160
Express: 250
Total: 14 pieces, bill 1,240
Still with the laundry: Shirt × 2
Paid: 1,000
To pay: 240
```

The shop finds one shirt but has **lost the other** and agrees to take **500** off. In **Lost or damaged** she sets *Shirt: lost 1* and *500*. The lost shirt is no longer charged, so the bill becomes 4 × 40 + 150 + 480 + 160 + 250 − 500 = **700**, and with 1,000 already paid the batch says **The shop owes you 300**.

Other cases, same app:

- **Dry cleaning at another shop:** pick **+ A new shop…**, type *Star Dry Cleaners*, choose **Dry cleaning**: each shop and each service (wash and iron, ironing only, dry cleaning) remembers its own prices.
- **Prices go up:** type the new price in the next batch. Old batches keep the price they were given at.
- **Price not known yet:** leave it empty; the batch says *Price not set for 2 pieces* until you add it with **Edit**.
- **Month end:** the month box shows each shop's batches, pieces, bill, paid and **To pay**, and **Copy month bill** copies one shop's month, batch by batch.
- **A mistake:** every change has **Undo**; **Edit** fixes counts, prices, day or shop and keeps the pieces already ticked as back.
- **3 shirts at 12.50:** **37.50**, exact to the cent.

## Features

- **Help button.** Tap **Help** at the top for a short how-to written for this app, and tap **All apps** to go back to the list.
- **Two boxes at the top**: how many pieces are still at the laundry and how much you owe all shops. Tap one to see only those batches.
- **Give clothes in a few taps:** pick the shop, the day (**Today**, **Yesterday** or any date), the service, and tap **+** next to each kind (or type the number). The price each is filled in from last time. **+ Show more kinds of clothes** and **+ Add another kind of clothing** for anything else.
- **Optional extra charge** (express, delivery) and **optional slip number or note**, each behind its own "+ Add" button.
- **Each batch in its own box**, coloured by state (amber when pieces are out, red when late, green when all back), with a **Back** count and **+ / −** for each kind, **All back**, which pieces are not back yet and for how many days.
- **Lost or damaged:** lost pieces are not charged; type what the shop agreed to pay or take off.
- **Payments:** **Record a payment** (filled in with what is left, change it for a part payment), listed with **Delete**. Overpaying is caught.
- **Month box** per shop, **Previous** and **Next** months, **Copy month bill**, **Print or save as PDF**.
- **Shops:** each in its own box with what you owe it; **Edit** the name and **Usually ready in** (1 to 60 days) to see "ready by" and "late".
- **Tabs:** At the laundry, Not paid, All.
- **Optional currency symbol** (none, Rs, ₹, $, €, £ and more), remembered.
- **Save a backup file**, **Restore a backup**, **Delete everything**, all with **Undo**. Damaged or blocked saved data is handled with a clear message.
- **Private.** Everything stays in this browser on this device; your data is never sent anywhere.
- **Works offline and installable.**
- **Back to all apps.** A "← All apps" button at the top of the page.
- **Light and dark mode switch.** It follows your device until you choose, and remembers your choice in every app.

## Run it yourself

No build step and no dependencies.

```bash
git clone https://github.com/umar8092/apps.git
```

Then open `laundry-and-dry-cleaning-clothes-count-log/index.html` in your browser.

Offline mode and install work best with the files served over `https` or `localhost` (for example `python3 -m http.server`).

## How it works

- `core.js` is the logic, with no page code. Money is whole cents and counts are whole pieces, so every bill is exact. It works out each batch (given, back, lost, still out, bill, paid, to pay), the status line (days out, ready by, late), the month and shop totals, the text to copy, reads typed amounts and counts with plain error messages, and checks every saved or restored value.
- `script.js` builds the page. Everything is saved in `localStorage` on the device under `laundry-and-dry-cleaning-clothes-count-log.state`.
- `sw.js` saves the app on your device for offline use (network first, so updates show at once).
- Run the logic checks with `node tests.js` (or open `test.html`), and the full page test with `node ui-test.js` (needs Playwright). The page test fixes "today" to Sun 25 Oct 2026 and checks the exact answers above.

## License

[MIT](LICENSE). Free to use, copy, modify and share. Made by [Muhammad Umar](https://github.com/umar8092).
