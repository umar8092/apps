# Leave Balance Tracker for Employees

A free **leave balance tracker** for employees. Set what your contract gives you (**20 days of annual leave**, **8 casual days**, **10 sick days**, leave that **builds up each month**, or unpaid leave with no limit), how many unused days **carry over** and when your **leave year** starts, then add each leave with **half days**. The app answers the question you have before asking your manager for a week off: **how many days do I have left, and will I lose some at the end of the year?** Weekends and public holidays inside a leave are not counted, leave over the year end is split between the two years, and part-year leave after joining is worked out for you. Works offline, no sign-up, no ads.

**Live demo:** [umar8092.github.io/apps/leave-balance-tracker-for-employees](https://umar8092.github.io/apps/leave-balance-tracker-for-employees/)

| Desktop | On a phone |
|---|---|
| ![Leave Balance Tracker on a laptop: Your leave balance for leave year 2026, Annual leave 6.5 days left with an amber line "Book 1.5 days more by 31 Dec 2026 or lose them (only 5 days can be carried over)", Casual leave 5.5 days left, Sick leave 8 days left, Unpaid leave 0 days; below, the list of leave this year with the family wedding 21 Dec to 1 Jan booked; on the right the Add leave form for 16 to 20 November saying "Takes 5 days of annual leave. Left after this: 1.5 days."](screenshots/desktop.png) | <img src="screenshots/phone.png" alt="Leave Balance Tracker on a phone: Annual leave 6.5 days left, book 1.5 days more by 31 Dec 2026 or lose them, Casual leave 5.5 days left, Sick leave 8 days left" width="220"> |

## The situation it solves

Ayesha works in an office in Lahore. Her contract gives her **20 days of annual leave** a year (Jan to Dec, up to **5 days carry over**, and carried-over days must be used **within 3 months**), **8 casual days** and **10 sick days**, Monday to Friday. She brought **3 days** over from 2025. On **Thursday 22 October 2026** she wants to ask her manager for **16 to 20 November** off and wonders whether she has enough days, and whether she will lose any in December.

Her year so far, added in the app:

| Leave | Days | Counted |
|---|---|---|
| Annual, Mon 2 Feb to Fri 6 Feb (Thu 5 Feb is Kashmir Day, a public holiday) | 5 weekdays | **4** |
| Annual, Mon 6 Apr to Fri 10 Apr | 5 | **5** |
| Annual, Wed 15 Jul, half day | | **0.5** |
| Casual, 10 Mar, 18 Jun, and 14 Sep half day | | **2.5** |
| Sick, Mon 11 May to Tue 12 May | | **2** |
| Annual, booked: Mon 21 Dec to Fri 1 Jan 2027 for a family wedding (25 Dec is a public holiday) | 10 weekdays | **8** in 2026, **1** in 2027 |
| Correction from HR: a day in lieu for working on Eid, 1 Oct | | **+1** |

The app answers:

- **Annual leave: 6.5 days left.** Allowance 20, carried over 3, HR added 1. Taken 9.5, booked 8. (20 + 3 + 1 − 9.5 − 8 = 6.5)
- **Book 1.5 days more by 31 Dec 2026 or lose them (only 5 days can be carried over).** (6.5 left − 5 that can carry over = 1.5)
- The 3 carried-over days were used up by the February leave, before 31 March, so none expired.
- **Casual leave: 5.5 days left. Sick leave: 8 days left. Unpaid leave: 0 days this leave year.**

She types 16 to 20 November in **Add leave** and, before adding it, sees **Takes 5 days of annual leave. Left after this: 1.5 days.** Once added, the warning changes to **1.5 days will be carried over to the next leave year**, so she loses nothing. The arrow next to the leave year shows **2027: carried over 5, booked 1** (the 1 January part of the wedding leave).

Other cases, same app:

- **Joined part-way:** joining on **1 August 2026** with 8 casual days a year gives 8 x 153/365 = 3.35, rounded to the nearest half day: **3.5 days**.
- **Leave built up each month:** 25 days a year builds up 2.08 a month; by 22 October 9 months are done, so **Built up so far: 18.75 of 25** and **You can take 18.75 days now**.
- **Over the allowance:** with 1 casual day left and 2 days taken, the balance turns red: **1 day over your allowance**.
- **A Saturday shift:** a Saturday is not a working day, so the app says it takes no leave; **+ Count a different number of days** lets you count it as 1.
- **Leave year from July:** the leave year becomes **1 Jul 2026 to 30 Jun 2027** and every number is worked out again.

## Features

- **Help button.** Tap **Help** at the top for a short how-to written for this app, and tap **All apps** to go back to the list.
- **Your leave balance:** each leave type in its own box with the days left in big type, a bar of taken and booked days, and plain lines: allowance, carried over, HR corrections, taken, booked, and what will be lost or carried over. Amber when days will be lost, red when you are over.
- **Leave types you set yourself:** Annual, Casual, Sick and Unpaid to start, rename them or add your own (Hajj leave, Study leave). Each has its own **days each leave year** (quick 10, 15, 20, 25, 30 or any number with decimals), **how you get it** (all at the start, built up each month, or no limit), and **what happens to unused days** (are lost, some carry over up to a limit, all carry over), with an optional **months to use carried-over days** and **days carried over from last year**.
- **Add leave** with a first and last day, **half days** (half day only, or first or last day half), an optional **note** and an optional **different number of days**. A live line says how many days it takes and how many you will have left **before** you add it.
- **Weekends and public holidays are not counted.** Your own working days (Mon to Fri, Sun to Thu, part time) and your own list of public holidays.
- **Leave over the year end** is split between the two leave years. **Past and next leave years** with the arrows.
- **Correction from HR:** add or take away days for a day in lieu or a corrected balance.
- **Joining date (optional):** part-year leave in the year you joined.
- **Leave year start:** 1 January, 1 April, 1 July or any day, such as the day you joined.
- **Edit** and **Delete** every leave and correction, with **Undo** for every change. Two leaves on the same day are refused (two half days are fine).
- **Copy my balance**, **Email my balance** (works without typing an address), **Download all leave (CSV)** for a spreadsheet or HR, **Print**.
- **Save a backup file**, **Restore a backup**, **Delete everything** with Undo. Damaged or blocked saved data is handled with a clear message.
- **Private.** Your leave stays in this browser on this device; your data is never sent anywhere.
- **Works offline and installable.** The day moves on by itself at midnight.
- **Back to all apps.** A "← All apps" button at the top of the page.
- **Light and dark mode switch.** It follows your device until you choose, and remembers your choice in every app.

## Run it yourself

No build step and no dependencies.

```bash
git clone https://github.com/umar8092/apps.git
```

Then open `leave-balance-tracker-for-employees/index.html` in your browser.

Offline mode and install work best with the files served over `https` or `localhost` (for example `python3 -m http.server`).

## How it works

- `core.js` is the logic, with no page code. Dates are calendar dates (`2026-10-22`), so time zones and summer time never move a day. Days are kept in hundredths of a day (half a day is 50), so sums like 9.5 + 8 or 1.67 a month stay exact. It works out the leave year, which days a leave takes (working days minus public holidays, half days), the allowance (part-year after joining, built up each month), days carried over from the year before and when they expire, the balance, what will be lost, the summary and CSV text, reads every form with plain error messages, and checks every saved or restored value.
- `script.js` builds the page. Everything is saved in `localStorage` on the device.
- `sw.js` saves the app on your device for offline use (network first, so updates show at once).
- Run the logic checks with `node tests.js` (or open `test.html`), and the full page test with `node ui-test.js` (needs Playwright). The page test fixes "today" to Thu 22 Oct 2026 and checks the exact answers above.

## License

[MIT](LICENSE). Free to use, copy, modify and share. Made by [Muhammad Umar](https://github.com/umar8092).
