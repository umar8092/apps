# Birthday and Anniversary Reminder List

A free **birthday and anniversary reminder list** for family, friends and work. Add each **birthday**, **wedding anniversary** or other yearly day (the year is optional), and the app shows **who is today and tomorrow**, everyone in the **next 30 days**, **how old they turn** or **how many years together**, and anything you missed in the **last 7 days** so you can still send a late wish. Add a **yearly reminder to your phone's calendar** in one tap, **paste a list** or **import your phone contacts**, keep a gift idea for each person, and tick off who you have wished. Works offline, no sign-up, no ads.

**Live demo:** [umar8092.github.io/apps/birthday-and-anniversary-reminder-list](https://umar8092.github.io/apps/birthday-and-anniversary-reminder-list/)

| Desktop | On a phone |
|---|---|
| ![Birthday and Anniversary Reminder List on a laptop: Coming up shows Mum turns 66 today with her note, Dad's birthday tomorrow, Sara turns 31 on Sat 24 Oct in 4 days, and Hina turned 36 three days ago under Just passed; on the right the Add and Add many at once boxes](screenshots/desktop.png) | <img src="screenshots/phone.png" alt="Birthday and Anniversary Reminder List on a phone: Today, Mum turns 66, with a Mark as wished button, then tomorrow, the next 30 days and just passed" width="220"> |

## The situation it solves

Someone keeps missing birthdays and anniversaries because the dates are scattered across phone contacts, social apps and memory. They want one list that says who is next, and a reminder that comes every year without having to think about it.

On Tuesday 20 October 2026 they add their family and friends:

- **Mum**, 20 Oct 1960, note "Loves white roses. Call before 9 pm."
- **Dad**, 21 Oct (year not known)
- **Sara**, 24 Oct 1995, note "Gift idea: the new Elif Shafak novel"
- **Ahmed**, Other: "Work anniversary", 2 Nov 2021
- **Uncle Tariq**, 5 Nov 1958
- **Ali and Sara**, wedding anniversary, 12 Jun 2015
- **Zain**, 29 Feb 2000, kept on 1 March in other years
- **Hina**, 17 Oct 1990

The app answers:

- **Today:** *Mum turns 66 today*, with her note, and a **Mark as wished** button.
- **Tomorrow:** *Dad's birthday tomorrow (Wed 21 Oct)*. No year, so no age, only the date.
- **Next 30 days:** *Sara turns 31 on Sat 24 Oct (in 4 days)*, *Ahmed: Work anniversary, 5 years on Mon 2 Nov (in 13 days)*, *Uncle Tariq turns 68 on Thu 5 Nov (in 16 days)*.
- **Just passed:** *Hina turned 36 on Sat 17 Oct (3 days ago)*, so a late wish is still possible.
- **Further on:** *Zain turns 27 on Mon 1 Mar 2027* (2027 has no 29 February) and *Ali and Sara: 12th wedding anniversary on Sat 12 Jun 2027 (in 235 days)*.
- **Calendar** saves a file that adds a yearly event to the phone's calendar, with a reminder at 9:00 on the day and, as chosen, 1 day to 2 weeks before.

How it is counted: the age is the number of years from the birth year to this year's birthday, and the anniversary number is the years since the wedding. A 29 February date is on 29 February in leap years and on 28 February or 1 March in other years, as you choose for each person.

## Features

- **Help button.** Tap **Help** at the top for a short how-to written for this app, and tap **All apps** to go back to the list.
- **Coming up** at the top: today and tomorrow first, then the next 30 days, then **Just passed** (the last 7 days). **Mark as wished** ticks someone off and clears itself for next year.
- **Everyone, next first**, under the month each date falls in, each person in their own box with the days left, the age or years, the date and their gift idea. **Find a name** and **Show** a group (Family, Friends, Work) appear when the list gets long.
- **Birthday, wedding anniversary or Other** (work anniversary, engagement, anything yearly). The year is optional.
- **29 February** handled: you choose 28 February or 1 March for other years.
- **Add many at once:** paste a list such as "Sara 24/10/1995", "Mum 3 March" or "Ali & Sara wedding 12/6/2015", choose whether 03/04 means day or month first, check what will be added, then add with one tap. **Import a contacts file (.vcf)** reads birthdays and anniversaries exported from your phone's contacts. People already on the list are left out.
- **Calendar** on each person and **Add all to my calendar**: yearly all-day events with a reminder on the day and, if you choose, 1, 2, 3, 7 or 14 days before.
- **Edit**, **Delete** with **Undo**, and a check that stops the same date being added twice.
- **Copy the list** and **Email the list** of the next 12 months (email works without typing an address first).
- **Save a backup file**, **Restore a backup**, **Delete everything** with Undo. Damaged or blocked saved data is handled with a clear message.
- **Private.** Your list stays in this browser on this device; your data is never sent anywhere.
- **Works offline and installable.** The days left update by themselves at midnight.
- **Back to all apps.** A "← All apps" button at the top of the page.
- **Light and dark mode switch.** It follows your device until you choose, and remembers your choice in every app.

## Run it yourself

No build step and no dependencies.

```bash
git clone https://github.com/umar8092/apps.git
```

Then open `birthday-and-anniversary-reminder-list/index.html` in your browser.

Offline mode and install work best with the files served over `https` or `localhost` (for example `python3 -m http.server`).

## How it works

- `core.js` is the logic, with no page code. Dates are calendar dates (`2026-10-24`), so time zones never move a birthday. It works out each next and last date (with the 29 February rule), the age or years, the sentences, the calendar file, the pasted list and contacts file reader, reads the form with plain error messages, and checks every saved or restored value.
- `script.js` builds the page. Names and notes are added as plain text, never as HTML. The list is saved in `localStorage` on the device.
- `sw.js` saves the app on your device for offline use (network first, so updates show at once).
- Run the logic checks with `node tests.js` (or open `test.html`), and the full page test with `node ui-test.js` (needs Playwright). The page test fixes "today" to 20 Oct 2026 and checks the exact answers above.

## License

[MIT](LICENSE). Free to use, copy, modify and share. Made by [Muhammad Umar](https://github.com/umar8092).
