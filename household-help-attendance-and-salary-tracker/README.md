# Household Help Attendance and Salary Tracker

A free attendance register and salary calculator for a family that employs a **maid, cook, driver, nanny, cleaner, gardener or guard** paid by the month. Add each worker with their monthly pay, weekly day off and paid leave. Every working day counts as worked, so you only tap the days they were **absent**, came for a **half day**, had a **paid holiday**, or **came on their day off**, and add any **advance**, **Eid bonus** or **deduction**. The app answers the question every family asks at the end of the month, in plain words: **"Monthly pay 30,000 − 2½ unpaid days off (2,500) + 1 extra day (1,000) − advance 5,000 = To pay: 23,500"**, with a pay slip to copy, share or print. It also handles paid leave that carries over, joining or leaving in the middle of a month, advances taken back over several months, overtime, pay rises and part payments. No sign-up, no ads, private on your device, works offline.

**Live demo:** [umar8092.github.io/apps/household-help-attendance-and-salary-tracker](https://umar8092.github.io/apps/household-help-attendance-and-salary-tracker/)

| Desktop | On a phone |
|---|---|
| ![Household Help Attendance and Salary Tracker on a laptop: October 2026 with Rubina the maid 23,500 to pay, Akram the driver 22,635.48 and Shabana the cook 19,400, total 65,535.48; on the right Rubina's calendar with 5 and 6 Oct paid leave, 19 and 20 Oct unpaid, 27 Oct half day and 11 Oct an extra day, and her pay slip](screenshots/desktop.png) | <img src="screenshots/phone.png" alt="Household Help Attendance and Salary Tracker on a phone: Rubina's box with Absent today and Half day today buttons, the October calendar and the pay slip ending To pay: 23,500" width="220"> |

## The situation it solves

Sana employs **Rubina** as a maid for **30,000 a month**, with **Sundays off** and **2 days of paid leave a month**. In October 2026 Rubina was off on **5, 6, 19 and 20 October**, came for only **half a day on 27 October**, came to help on **Sunday 11 October** for guests, and took an **advance of 5,000 on 12 October**. On the 1st of next month Sana has to hand over the salary and does not want to under- or over-pay. They count one day's pay as the monthly pay ÷ 30, like most families.

With the app Sana tapped those days as they happened. Rubina's pay slip says:

- **Attendance:** 22 days worked, 1 half day, 4 days absent, 1 extra day, 3 weekly days off
- **Monthly pay: 30,000**
- **Paid leave: 2 days (5 Oct and 6 Oct), nothing taken off**
- **Unpaid days off: 2½ days (19 Oct, 20 Oct and 27 Oct (half)) at 1,000 a day: −2,500**
- **Worked on a day off: 1 day (11 Oct) at 1,000 a day: 1,000**
- **Advance of 5,000 given 12 Oct: −5,000**
- **Pay for October: 23,500. To pay: 23,500**

The family also has **Akram**, a driver who joined on **15 October** at **40,000** (one day = pay ÷ days in the month) with 3½ hours of overtime at 200 an hour: **17 of 31 days = 21,935.48 + 700 = 22,635.48**. And **Shabana** the cook (18,000, Fridays off, 1 paid leave day) was off on 8 and 13 October and got a 2,000 birthday bonus: **18,000 − 600 + 2,000 = 19,400**. The month box at the top says **To pay for October: 65,535.48**.

Worked examples from the tests (all checked by hand):

- The three ways to work out one day's pay for 30,000 in October 2026 with Sundays off: **÷ 30 = 1,000**, **÷ 31 days = 967.74**, **÷ 27 working days = 1,111.11**. 2½ unpaid days: **2,500**, **2,419.35** or **2,777.78**.
- Joined on 15 October: ÷ 30 pays **17 of 30 days = 17,000**; ÷ days in the month **17 of 31 = 16,451.61**; ÷ working days **15 of 27 = 16,666.67**. Left on 10 October with ÷ 30: **10,000**.
- 1 paid leave day a month, carried over: September unused, so 3 days off in October cost only **1 day (1,000)**; without carry-over **2 days (2,000)**.
- 1 paid leave day, a half day on the 5th and a full day off on the 6th: the half day and half of the 6th are paid leave, **half a day (500)** is taken off.
- An advance of **10,000 over 3 months** is taken back as **3,333.34, 3,333.33 and 3,333.33**.
- An advance of 15,000 against a 10,000 pay: **Nothing to pay. 5,000 comes off next month's pay**; November then pays **5,000**.
- Paid 20,000 of 23,500: November starts with **Still owed from before: 3,500**.
- Absent all 31 days of October with ÷ 30: pay **0**, never negative. With ÷ 30 the 28 days of February take 28,000 off a 30,000 pay.
- A worker added with a start date years ago: the months before this one show **Already paid before this record was started**, so nothing old is counted as owed.
- Amounts can be typed as `30000`, `30,000`, `1,00,000` or `Rs 500`; overtime as `2`, `1.5`, `1:30` or `90 min`. A minus sign, words, 0, more than 24 hours of overtime or every day ticked as a day off get a clear message.

## Features

- **Help button** at the top with a how-to for this app, **All apps** to go back to the list, and a **Light / Dark** switch.
- **Each worker in their own box** with their own monthly pay, job (Maid, Cook, Driver, Nanny, Cleaner, Gardener, Guard or your own), **Weekly day off** (any days, or none), **Paid leave each month** (with **Unused paid leave carries to the next month**), and how **One day's pay is** worked out: monthly pay ÷ 30, ÷ days in the month or ÷ working days in the month.
- **Today** line with **Absent today** and **Half day today** (or **Came to work today** on a day off), so the daily tap is one button.
- **Calendar** for the month: ✓ worked, **L** paid leave, ✗ unpaid day off, ½ half day, **H** paid holiday, **+1** extra day, **Off** weekly day off, dashed days still to come. Tap any day for **Worked**, **Absent**, **Half day**, **Paid holiday** or **Came to work**, and **Overtime hours** if you pay overtime.
- **Pay slip** that explains every line: monthly pay (or the part of it for a month they joined or left), paid leave used, unpaid days at the day's pay, extra days, overtime, bonuses, deductions, advances being taken back, payments, **Pay for** the month and **To pay**.
- **Advance** (taken back from one month's pay or over 2 to 12 months, starting this month or next), **Bonus or deduction** (such as Eid money or a broken item), **Record a payment** for the month (part payments are carried forward), each with **Delete** and **Undo**.
- **Month box** adding up every worker, with **Previous** / **Next** months, **Copy all pay slips** and **Print or save as PDF** (slips with a line for a signature). **Copy pay slip**, **Share** and **Print slip** for one worker.
- Optional fields stay hidden until you want them: **+ Add pay for working on a day off**, **+ Add overtime pay per hour**, **+ Add money owed from before**, and when editing **+ Left the job?**. A pay rise asks **New pay starts with** so earlier months keep the old pay.
- **Edit** and **Delete** with **Undo**, **Currency symbol** (none, Rs, ₹, $, €, £, ৳, AED, SAR and more, remembered), **Save a backup file** and **Restore a backup** (checked, with Undo), **Delete everything** with Undo.
- Private: no account and your data is never sent anywhere. Works offline once loaded, and can be installed on the home screen.

## Run it yourself

```
git clone https://github.com/umar8092/apps.git
```

Then open `household-help-attendance-and-salary-tracker/index.html` in a browser. No build step and no dependencies.

Tests: `node household-help-attendance-and-salary-tracker/tests.js` checks the maths and the wording (or open `test.html`), and `node household-help-attendance-and-salary-tracker/ui-test.js` drives the page in headless Chromium at every screen size (needs Playwright).

## How it works

Plain HTML, CSS and JavaScript. The maths lives in `core.js`, and all money is kept in whole cents so nothing is lost to rounding. For each month the app walks through the days the person worked for you: a day you marked wins, otherwise a weekly day off is a day off and every other day counts as worked. Full days off and half days use the paid leave in date order (half a day at a time), and whatever is left is unpaid. The month's pay is the monthly pay (or the part for the days employed), minus the unpaid days at the chosen day's pay, plus extra days and overtime, plus bonuses, minus deductions and the part of each advance due that month, each rounded once to the nearest cent. Advances are split so the parts add up exactly. Anything not paid, or paid ahead, is carried into the next month, and unused leave too if you ask for it. Everything is saved in this browser's `localStorage` and checked when loaded or restored; a network-first service worker keeps the app working offline.

## License

MIT, see [LICENSE](LICENSE).
