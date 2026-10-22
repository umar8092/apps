# Shared House Expenses for Roommates

A free tracker for **roommates, flatmates and hostel room-mates** who share the **rent, electricity, gas, internet, groceries and other house costs**. Add each cost with **who paid it** and **who shares it**, split **equally**, **by shares** (2 for the big room, 1 for the others) or by **exact amounts**, and the app answers the question every flat argues about at month end, in plain words: **"Omar pays Ali 12,600. Hina pays Ali 12,600. Sara pays Ali 7,200."** Tap **Mark as paid** when the money changes hands and everyone goes back to 0, with the history kept for later months. No sign-up, no daily limit, no ads, private on your device, works offline.

**Live demo:** [umar8092.github.io/apps/shared-house-expenses-for-roommates](https://umar8092.github.io/apps/shared-house-expenses-for-roommates/)

| Desktop | On a phone |
|---|---|
| ![Shared House Expenses for Roommates on a laptop: four flatmates Ali, Sara, Omar and Hina each in their own box with their balance on the left, and on the right Who owes whom with Omar pays Ali 12,600 and Hina pays Ali 12,600, each with a Mark as paid button, and the balances Ali gets back 25,200, Sara settled up, Omar and Hina owe 12,600](screenshots/desktop.png) | <img src="screenshots/phone.png" alt="Shared House Expenses for Roommates on a phone: the Who owes whom card with Omar pays Ali 12,600 and Hina pays Ali 12,600, Mark all as paid, and each person's balance" width="220"> |

## The situation it solves

Ali, Sara, Omar and Hina share a flat. Ali has the big room. Different people pay different bills during October, Hina is away the week Omar buys groceries, and at the end of the month nobody knows who owes whom.

- **1 Oct, Rent 60,000**, paid by **Ali**, **by shares**: Ali 2, the others 1 each → Ali **24,000**, Sara, Omar and Hina **12,000** each.
- **5 Oct, Electricity 8,400**, paid by **Sara**, equally between all 4 → **2,100 each**.
- **8 Oct, Internet 2,000**, paid by **Hina**, equally → **500 each**.
- **12 Oct, Groceries 3,000**, paid by **Omar**, Hina unticked (away) → Ali, Sara and Omar **1,000 each**.

What each person paid minus their share:

| | Paid | Share | Balance |
|---|---|---|---|
| Ali | 60,000 | 27,600 | **gets back 32,400** |
| Sara | 8,400 | 15,600 | **owes 7,200** |
| Omar | 3,000 | 15,600 | **owes 12,600** |
| Hina | 2,000 | 14,600 | **owes 12,600** |

**To settle up: Omar pays Ali 12,600. Hina pays Ali 12,600. Sara pays Ali 7,200.** (Three payments, the fewest possible here.) October total: **73,400** (Rent 60,000, Electricity 8,400, Groceries 3,000, Internet 2,000).

Sara pays her 7,200 and taps **Mark as paid**: she is **settled up** and Ali **gets back 25,200**. If Omar can only give 5,000 this week, **Money paid back** records it and he **owes 7,600**.

Other cases from the tests (all checked by hand):

- **Odd cents:** 100.00 between 3 people is **33.34 + 33.33 + 33.33**, shown as "33.34 or 33.33 each". The parts always add up to the amount exactly.
- **Exact amounts:** a 1,000 water bill with parts 400, 300 and 200 says **"100 left to give out"**; parts of 1,100 say **"100 too much"** and are not saved until they add up.
- **Only the payer shares it:** "Only Sara shares this, so nobody owes anything for it."
- **Overpaying:** if Hina pays Ali 13,000 instead of 12,600, Ali owes her 400 and the list says so.
- **Someone moves out:** tap **Moved out**. Past costs stay, they are left unticked on new ones, and their balance stays until it is paid. Someone with costs cannot be deleted by mistake.
- Amounts can be typed as `8400`, `8,400`, `1,25,000`, `Rs 1500` or `12.50`. Blank, 0, a minus sign, words or more than 9,999,999,999.99 get a clear message.
- Saved data that is broken is checked when the page opens: bad entries are dropped, the rest is kept.

## Features

- **Help button** at the top with a how-to for every part of the app, **All apps** to go back to the list, and a **Light / Dark** switch.
- **Who shares the house:** each flatmate in their own box with their balance, **Rename**, **Moved out** / **Moved back in** and **Delete**. Up to 20 people.
- **Add an expense:** **What was it for?** with one-tap Rent, Electricity, Gas, Water, Internet, Groceries, Cleaning, Repairs, Maid or cook and Other; **Amount**; **Who paid?** (remembered); **How to split it**: **Equally**, **By shares** or **Exact amounts**; **Who shares it?** with a tick and the amount for each person, **Tick everyone** and **Untick all**; **Date paid**. A line above the button says exactly who will owe what before you add it.
- **Money paid back** for part payments or a payment outside the list.
- **Who owes whom:** the fewest payments to settle up, each with **Mark as paid**, **Mark all as paid**, and **Balance of each person** ("gets back", "owes", "settled up").
- **Expenses by month:** what was spent together, by what it was for, each person's share and what they paid, and every entry in its own box with **Edit** and **Delete**. **All months together** too.
- **Copy summary**, **Email summary** (no address needed) and **Share** (WhatsApp and more, on phones) with the payments, balances and the month's costs.
- **Undo** after every change, including **Start over (delete everything)**.
- **Currency symbol** (none, Rs, ₹, $, €, £, ৳, AED, SAR and more, remembered). **Save a backup file** and **Restore a backup** (checked before loading).
- Private: no account, no daily limit, and your data is never sent anywhere. Works offline once loaded, and can be installed on the home screen.

## Run it yourself

```
git clone https://github.com/umar8092/apps.git
```

Then open `shared-house-expenses-for-roommates/index.html` in a browser. No build step and no dependencies.

Tests: `node shared-house-expenses-for-roommates/tests.js` checks the maths and the wording (or open `test.html`), and `node shared-house-expenses-for-roommates/ui-test.js` drives the page in headless Chromium at every screen size (needs Playwright).

## How it works

Plain HTML, CSS and JavaScript. The maths lives in `core.js`, and all money is kept in whole cents. Each expense is split with the largest-remainder method (by equal weights, by the shares typed, or by the exact parts), so the parts always add up to the amount and any extra cent goes to the first people in the list. A person's balance is everything they paid, plus money they paid back, minus their shares and money paid back to them. To settle up, the person who owes most pays the person who is owed most, again and again, until everyone is at 0. Everything is saved in this browser's `localStorage` and checked when loaded or restored; a network-first service worker keeps the app working offline.

## License

MIT, see [LICENSE](LICENSE).
