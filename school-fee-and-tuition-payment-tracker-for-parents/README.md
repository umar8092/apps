# School Fee and Tuition Payment Tracker for Parents

A free **school fee tracker for parents with one, two or more children**. Add each child's fees (school fee, tuition, van or bus, academy, lunch, admission) with the amount, how often it is paid (every month, every 2, 3, 4 or 6 months for fees paid by term, once a year, or only once) and the day it is due. Tick each payment as you make it, with an optional **photo of the school's receipt** kept on your phone. The app answers the questions parents are asked: "has October been paid?" ("**Owes 4,000 for October 2026, 11 days late**"), "**Paid up to September 2026**", what is due for the whole family in the next 7 days, and how much each child's fees come to this year. Fee rises, holiday months with no van fee, part payments and two months paid at once are handled, and a statement can be printed or copied for the school. No sign-up, no ads, private on your device, works offline.

**Live demo:** [umar8092.github.io/apps/school-fee-and-tuition-payment-tracker-for-parents](https://umar8092.github.io/apps/school-fee-and-tuition-payment-tracker-for-parents/)

| Desktop | On a phone |
|---|---|
| ![School Fee Tracker showing Rs 7,500 left to pay in October, Ali's school fee Rs 4,000 late by 11 days, his van fee due Sun 25 Oct, and Ali's fees with what each is paid up to](screenshots/desktop.png) | <img src="screenshots/phone.png" alt="School Fee and Tuition Payment Tracker on a phone, with the fees to pay this month, the late fee and the fee due this week" width="220"> |

## The situation it solves

Ayesha has two children at City School. **Ali** pays a **school fee of 8,000 every month, due on the 10th**, and a **van fee of 3,500 due on the 25th**; there is no van or school fee in June and July. **Sara** gets a sibling discount, so her school fee is **7,200**; she also goes to an **academy that charges 6,000 every 3 months** (due on the 1st of September, December, March and June) and the school takes **15,000 of annual charges every August**.

Ayesha pays Ali's school fee on 10 Aug (8,000), 9 Sep (8,000) and, short of money, only 4,000 on 12 Oct. On **Wednesday 21 October 2026** the app says:

- **Fees to pay: Rs 7,500 left to pay in October.** (Ali's 4,000 still owed + his van fee of 3,500 due on the 25th.)
- **Late: Ali: School fee, Rs 4,000. October 2026, 11 days late.** (Due on 10 October, 11 days ago. The 20,000 paid covered August and September in full and 4,000 of October, because payments always pay the oldest fee first.)
- **Due in the next 7 days: Ali: Van or bus, Rs 3,500. October 2026, due Sun 25 Oct (in 4 days).**
- Ali's box: **2026: Rs 57,500 in fees. Rs 27,000 paid, Rs 4,000 owed, Rs 26,500 still to come.** (August to December: 5 × 8,000 + 5 × 3,500.)
- Sara's academy: **Paid up to November 2026. Next: Dec 2026 to Feb 2027, Rs 6,000, due Tue 1 Dec.** Her annual charges: **Paid up to July 2027**, next due Sun 15 Aug 2027.

When the school asks for proof, **Statement** for Ali shows each month of 2026 with the fee, what was paid and what is owed, the payments made with their dates and receipt numbers, and the totals. **Print or save as PDF** or **Copy statement** to send it on WhatsApp.

If the van fee goes up to 4,000 from November, **Change or stop** → *Save the new amount* keeps August to October at 3,500. If Ali leaves the van after December, *Stop this fee* ends it there.

## Features

- **Help button.** Tap **Help** at the top for a short how-to written for this app, and tap **All apps** to go back to the list.
- **Each child in their own box**, and each of their fees in its own box inside it, with *paid up to*, *owes* and days late, and the next fee.
- **Fees to pay** for the whole family: what is left to pay this month, every late fee and every fee due in the next 7 days.
- **Any schedule:** every month, every 2, 3, 4 or 6 months (term fees), once a year, or only once (admission or exam fee). Due day 29, 30 or 31 falls on the last day of shorter months.
- **Record a payment** with the date and amount, **Fill in what is owed** in one tap, an optional note (receipt number) and an optional **photo of the receipt**, shrunk and kept in this browser. Part payments, two months at once and payments in advance are fine.
- **Payments:** every payment with what it paid for, its photo, **Edit** and **Delete** with **Undo**.
- **Change or stop:** a new amount from a month (earlier months keep the old fee), **months with no fee** every year (summer holidays), and **Stop this fee** after a month, with *Start it again*.
- **This year per child:** fees for the year, paid, owed now and still to come.
- **Statement** for any year per child, to print, save as PDF or copy.
- **Sibling discounts:** each child has their own fees, so each can have their own amount.
- **Currency symbol** (none, $, €, £, ₹, Rs, PKR, AED, SAR and more) and **1,000,000** or **10,00,000 (lakh)** numbers, remembered.
- **Copy the fee summary** and **Email the fee summary** (works with no address typed), **Save a backup file** (photos included), **Restore a backup**, **Delete everything** with Undo.
- **Private.** Your data is never sent anywhere; records and photos stay in this browser on this device.
- **Works offline and installable.** Phone friendly, with a two-column layout on laptops.
- **Back to all apps.** A "← All apps" button at the top of the page.
- **Light and dark mode switch.** It follows your device until you choose, and remembers your choice in every app.

## Run it yourself

No build step and no dependencies.

```bash
git clone https://github.com/umar8092/apps.git
```

Then open `school-fee-and-tuition-payment-tracker-for-parents/index.html` in your browser.

Offline mode and install need the files served over `https` or `localhost` (for example `python3 -m http.server`).

## How it works

- `core.js` is the logic, with no page code. Money is kept in whole cents, so there are no rounding errors. Each fee is a list of periods (one month, a term of 2 to 6 months, a year, or a single charge) starting from its first month, each due on the due day of its first month; holiday months cost nothing. All payments for a fee are added up and paid against the periods in order, oldest first, which gives "paid up to", "owes", "paid ahead" and what each payment covered.
- `script.js` builds the page. Names and notes are added as plain text, never as HTML. Receipt photos are shrunk to at most 1400 pixels and saved in the browser's IndexedDB; the records are saved in localStorage.
- `sw.js` saves the app on your device for offline use (network first, so you always get the newest version when online).
- Run the logic checks with `node tests.js` (or open `test.html`), and the full page test with `node ui-test.js` (needs Playwright).

## License

[MIT](LICENSE). Free to use, copy, modify and share. Made by [Muhammad Umar](https://github.com/umar8092).
