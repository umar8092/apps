# Loan and Credit Card Payoff Planner

A free **loan and credit card payoff planner** for anyone paying off debt. Add each loan or card with its balance, interest rate and monthly payment, and it tells you **the month you will be debt-free**, **the total interest**, **what to pay on each debt this month**, and **how much sooner you finish by paying a bit more**. It compares **highest interest first** (avalanche) with **smallest balance first** (snowball), and says plainly when a payment is too low to ever pay a debt off. Private on your device: no account, no ads. Works offline.

**Live demo:** [umar8092.github.io/apps/loan-and-credit-card-payoff-planner](https://umar8092.github.io/apps/loan-and-credit-card-payoff-planner/)

| Desktop | On a phone |
|---|---|
| ![Loan and Credit Card Payoff Planner on a laptop: a credit card, a store card and a car loan on the left; on the right, debt-free in February 2029 with 1,628.84 of interest, what to pay on each debt this month, the payoff order, and that the plan saves 1,849.05](screenshots/desktop.png) | <img src="screenshots/phone.png" alt="Loan and Credit Card Payoff Planner on a phone: a 5,000 credit card at 19.99% paying 150 plus 100 extra is paid off in November 2028, 25 payments, with 1,132.30 of interest" width="220"> |

## The situation it solves

You owe money on three things and pay a bit on each every month. You can find about 129 more a month. When will you be free, which debt should the extra go to, and is it worth it?

| | Balance | Interest rate | Monthly payment |
|---|---|---|---|
| Credit card | 3,200 | 24.9% | 96 |
| Store card | 650 | 18.9% | 25 |
| Car loan | 8,500 | 6.9% | 250 |

With **129 extra a month** (500 in total), starting with the November 2026 payment, the answer is:

- **Debt-free in February 2029**: 2 years 4 months (28 payments). **Total interest 1,628.84**, total paid 13,978.84.
- **This month, pay:** Credit card **225.00** (96.00 payment + 129.00 extra), Store card **25.00**, Car loan **250.00**.
- **When each debt is paid off:** Credit card April 2028 (631.36 interest), Store card May 2028 (147.55), Car loan February 2029 (849.93). When a debt is paid off, its payment moves to the next one.
- **Which order is best:** highest interest first costs 1,628.84; smallest balance first costs 1,676.86 and finishes in March 2029. *Highest interest first saves 48.02. Smallest balance first clears Store card sooner (March 2027 instead of May 2028).*
- **Without the plan** (just each monthly payment, no extra): debt-free August 2031, interest 3,477.89. *Your plan saves 1,849.05 in interest and gets you debt-free 2 years 6 months sooner.*
- **Finish sooner:** paying 550 a month gets you there in December 2028, 1,000 a month in December 2027. *To be debt-free in 2 years (by October 2028): pay 570.18 a month, 70.18 more than now.*

A single debt gets a simple answer too. **1,000 at 12% paying 100** takes 11 payments, the last one 58.98, with **58.98 of interest** (worked out by hand month by month in `tests.js`). **5,000 at 19.99% paying 150** takes 50 payments and 2,357.03 of interest.

When a payment does not cover the interest, it says so. **5,000 at 24% paying 50**: *Your debt is never paid off. You pay 50.00 a month, but 100.00 of interest is added this month, so what you owe keeps growing.* Then it shows what to pay to be debt-free in 1, 2, 3 or 5 years.

Other cases it handles: one-off payments such as a tax refund or bonus in a month you pick (several allowed; a past month is left out and marked); 0% debts; a balance of 0 (already paid off); a payment bigger than the balance; a payment exactly equal to the interest; a debt that is rescued once another is paid off and its payment moves over; amounts typed or pasted as `3,200`, `$ 3,200.00`, `3.200,00` or `24,9 %`; blank fields (that debt waits until it is filled in, without red messages); words, negatives, over 100,000,000 or over 1000% a year (a plain message under the box); 100 years or more (said to be never); up to 10 debts; long names; and corrupt or edited saved data (bad values are dropped and the app starts clean). Every amount is whole cents and interest is rounded to the cent each month, so the totals match a hand sum, and the results were cross-checked with a separate program.

## Features

- **Help button.** Tap **Help** at the top for a short how-to, and **All apps** to go back to the list of apps. **Light mode / Dark mode** switch.
- **Your debts**, each in its own coloured box: **Balance owed**, **Interest rate** (% a year) and **Monthly payment**, with **+ Add a name (optional)**. **+ Add another debt** (up to 10) and **Remove** with **Undo**.
- **Your plan:** **Extra each month (optional)** with quick buttons sized to your payments, and **Which debt gets the extra first?** (highest interest first, smallest balance first, or in the order you listed). **+ Add a one-off payment (optional)** for a bonus or refund.
- **The result:** the debt-free month, how long, total interest and total paid; **This month, pay** per debt; **When each debt is paid off**; **Which order is best**; **Without the plan**; **Finish sooner** (pay more, or pay what you need for 1, 2, 3 or 5 years); and **Month by month** with every payment, interest and what is still owed.
- **Warnings** in the debt box when a payment does not cover the interest.
- **Currency symbol** (none, $, €, £, ₹, Rs, ¥, ₩, ₦, ₱, R, kr, CHF, AED), remembered. Plain numbers by default.
- **Copy plan**, **Email plan** (opens your mail app with the plan written and no address needed) and **Print**.
- **Start over** with **Undo**, and a **Try an example** button on the empty page.
- **Private, works offline and installable.** Phone and desktop layouts.

## Run it yourself

No build step and no dependencies.

```bash
git clone https://github.com/umar8092/apps.git
```

Then open `loan-and-credit-card-payoff-planner/index.html` in your browser. Offline mode and install need the files served over `https` or `localhost` (for example `python3 -m http.server`).

## How it works

- `core.js` is the maths, with no page code. Money is whole cents and rates are thousandths of a percent. Each month, interest is added to every debt (balance × yearly rate ÷ 12, rounded half up to the cent, exact with BigInt), every debt gets its own payment, and the extra plus the payments of debts already paid off goes to one debt at a time in the chosen order. Past 100 years it counts as never paid off. The 1, 2, 3 and 5 year goals use a search for the smallest extra that gets there.
- `script.js` builds the page. Everything you type is added as plain text, never as HTML. Your debts are saved in this browser's storage under `loan-and-credit-card-payoff-planner.state`. The plan starts with next month's payment.
- `sw.js` saves the app for offline use (network first, so updates always arrive).
- Checks: `node tests.js` for the maths (also `test.html` in a browser), `node ui-test.js` drives the real page in headless Chromium through every case above (add `--base https://umar8092.github.io/apps` to test the live site).

## License

[MIT](LICENSE). Free to use, copy, modify and share. Made by [Muhammad Umar](https://github.com/umar8092).
