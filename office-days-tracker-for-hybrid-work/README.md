# Office Days Tracker for Hybrid Work

A free **office days tracker** for anyone on a **hybrid work** or **return-to-office** rule. Set what your employer asks for (**3 office days a week**, **8 days a month** or **60% of working days a quarter**), tap each day as **Office**, **Home**, **Half day in office**, **Work trip**, **Leave**, **Sick** or **Public holiday**, and the app answers the question you have on a Wednesday morning: **how many more office days do I need this week, and which days are left?** Leave, sick days and public holidays lower your target, half days and work trips count, and with a weekly rule it also shows how many weeks of the quarter you met. Works offline, no sign-up, no ads.

**Live demo:** [umar8092.github.io/apps/office-days-tracker-for-hybrid-work](https://umar8092.github.io/apps/office-days-tracker-for-hybrid-work/)

| Desktop | On a phone |
|---|---|
| ![Office Days Tracker on a laptop: Where you stand, Mon 19 Oct to Sun 25 Oct, 1 more office day needed this week, 2 of 3 office days done, 2 working days left Thu 22 Oct and Fri 23 Oct, Q4 2 of 2 finished weeks met, last week 2 of 2 office days target met; below, Mark a day with Office ticked for Wed 21 Oct and the October calendar coloured by office, home and leave days; on the right the office rule, 3 office days each week, Mon to Fri, lower my target by one for each day off](screenshots/desktop.png) | <img src="screenshots/phone.png" alt="Office Days Tracker on a phone: 1 more office day needed this week, 2 of 3 done, Thu 22 Oct and Fri 23 Oct left, then the Mark a day buttons and the October calendar" width="220"> |

## The situation it solves

Sana works for a bank that asks for **3 office days a week**, Monday to Friday. Leave and public holidays do not count against her. On **Wednesday 21 October 2026** she opens the app at her desk and taps **Office**. Her October so far:

| Week | Mon | Tue | Wed | Thu | Fri |
|---|---|---|---|---|---|
| 28 Sep |  |  |  | Office (1 Oct) | Home |
| 5 Oct | Office | Office | Home | Office | Home |
| 12 Oct | Office | Home | **Leave** | Office | Home |
| 19 Oct | Office | Home | **Office (today)** | ? | ? |

She has also marked **Fri 30 Oct** as Leave ahead of time.

The app answers:

- **1 more office day needed this week** (Mon 19 Oct to Sun 25 Oct).
- **2 of 3 office days done. 2 working days left: Thu 22 Oct, Fri 23 Oct.**
- **Q4 (Oct to Dec 2026): 2 of 2 finished weeks met.** The week of 12 Oct needed only 2 because of her day of leave.
- **Last week: 2 of 2 office days, target met.**
- Under the calendar: **October: 8 office, 6 home, 2 leave.**

She taps Thursday in the calendar and marks it **Office** to plan: the answer becomes **On track: your planned days meet the target**. Next week the leave on Friday lowers that week's target to 2.

Other rules, same days:

- **60% of working days each quarter:** Oct to Dec 2026 has 66 weekdays; minus her 2 days of leave that is 64. 60% of 64 is 38.4, rounded up to **39 office days**. **8 of 39 done, 31 more needed this quarter. So far 57% (8 of 14 days up to today).**
- **50% each month:** October has 22 weekdays, minus 2 leave = 20, so 10 days: **2 more office days needed this month.**
- **8 office days a month:** lowered by her 2 days of leave to 6, so **Target met for this month.**
- **Keep my target** instead of lowering it: with Thursday and Friday both on leave, only 3 working days are left in the week, so the target is 3, and with Tuesday at home the app says **Not reachable this week: 1 office day still needed, 0 working days left.**

How it counts: **Office** and **Work trip** count as 1 day, **Half day in office** as half. An office day on a day you do not normally work (a Saturday) counts too. A weekly or monthly target is lowered by one for each day of leave, sickness or public holiday on a working day (or kept, if you choose "Keep my target"; it is then lowered only when there are not enough working days left). A percentage is worked out on the working days minus days off, rounded up to a whole day. A past working day you have not marked counts as not in the office, and the app lists it so you can mark it.

## Features

- **Help button.** Tap **Help** at the top for a short how-to written for this app, and tap **All apps** to go back to the list.
- **Where you stand:** the answer in one line (**1 more office day needed this week**, **Target met**, **On track** with planned days, or **Not reachable**), a progress bar, how many are done and planned, which working days are left, and past days not marked yet.
- **Three kinds of rule:** a number of office days **each week** (1 to 7) or **each month** (1 to 31), or a **percentage** (1 to 100%) counted over each **calendar month** or **quarter**. Quick buttons for the usual numbers (2, 3, 4 a week; 40%, 50%, 60%, 80%), or type your own.
- **Your own working days:** Mon to Fri, Sun to Thu, part-time weeks like Mon, Wed, Fri; weeks starting Monday, Sunday or Saturday.
- **Days off handled the way your employer does:** lower the target for each day off, or keep it.
- **Count from (optional):** for a new job or a rule that started part-way through a quarter.
- **Mark a day** with big buttons, starting on today: Office, Home, Half day in office, Work trip (counts as office), Leave, Sick, Public holiday, Clear. Every mark has **Undo**.
- **Month calendar** coloured by where you worked, with letters for colour-blind users and a legend. Tap any day to mark it; mark future days to plan leave or office days.
- **Mark several days at once:** a week of leave or a run of public holidays, only on working days, with Undo.
- **Weeks met this quarter** and **last week / month / quarter** at a glance.
- **Copy my summary**, **Email my summary** (works without typing an address), **Download all days (CSV)** for a spreadsheet or HR, **Print this month**.
- **Save a backup file**, **Restore a backup**, **Delete everything** with Undo. Damaged or blocked saved data is handled with a clear message.
- **Private.** Your days stay in this browser on this device; your data is never sent anywhere.
- **Works offline and installable.** The day moves on by itself at midnight.
- **Back to all apps.** A "← All apps" button at the top of the page.
- **Light and dark mode switch.** It follows your device until you choose, and remembers your choice in every app.

## Run it yourself

No build step and no dependencies.

```bash
git clone https://github.com/umar8092/apps.git
```

Then open `office-days-tracker-for-hybrid-work/index.html` in your browser.

Offline mode and install work best with the files served over `https` or `localhost` (for example `python3 -m http.server`).

## How it works

- `core.js` is the logic, with no page code. Dates are calendar dates (`2026-10-21`), so time zones and summer time never move a day. Office time is counted in half days, so half days stay exact. It works out the week, month or quarter, the target after days off, what is done, planned and still possible, the weeks met in the quarter, the summary and CSV text, reads the rule form with plain error messages, and checks every saved or restored value.
- `script.js` builds the page. Everything is saved in `localStorage` on the device.
- `sw.js` saves the app on your device for offline use (network first, so updates show at once).
- Run the logic checks with `node tests.js` (or open `test.html`), and the full page test with `node ui-test.js` (needs Playwright). The page test fixes "today" to Wed 21 Oct 2026 and checks the exact answers above.

## License

[MIT](LICENSE). Free to use, copy, modify and share. Made by [Muhammad Umar](https://github.com/umar8092).
