# Lent and Borrowed Items Tracker

A free tracker for the **things you lend or borrow**: books, tools, dishes, chargers, clothes, a camping tent. Write down **what**, **who** and **when**, with an optional **give-back date** (1 week, 2 weeks, 1 month or any date), a **photo** and a **note**. The app answers the questions everyone asks months later: **who has my drill, how long have they had it, what is late, and what do I still need to give back?** It makes a polite reminder message for you, keeps a history per person, and moves things to **Returned** with one tap. Works offline, no sign-up, no ads.

**Live demo:** [umar8092.github.io/apps/lent-and-borrowed-items-tracker](https://umar8092.github.io/apps/lent-and-borrowed-items-tracker/)

| Desktop | On a phone |
|---|---|
| ![Lent and Borrowed Items Tracker on a laptop: two boxes at the top, You lent out 4 (1 late, 1 due today) and You borrowed 2 (none late); below, the Lent out list with Novel with Hina, 15 days late, was due Sat 10 Oct; Phone charger with Ali, due back today; Camping tent with Bilal, due back Sun 8 Nov in 14 days; each with Got it back, Remind, Edit and Delete; on the right the form to add something you lent or borrowed](screenshots/desktop.png) | <img src="screenshots/phone.png" alt="Lent and Borrowed Items Tracker on a phone: You lent out 4, 1 late and 1 due today; Novel with Hina is 15 days late; Phone charger with Ali is due back today; Drill with Bilal, lent 43 days ago, no give-back date" width="220"> |

## The situation it solves

Sara lends things all the time and forgets who has what. On **Sunday 25 October 2026** she adds what she can remember:

| What | Who | Lent or borrowed | Day | Give back by |
|---|---|---|---|---|
| Drill (note: comes with 2 drill bits) | Bilal | lent | Sat 12 Sep | no date |
| Novel | Hina | lent | Sat 26 Sep | 2 weeks |
| Phone charger | Ali | lent | Sun 18 Oct | 1 week |
| Camping tent | Bilal | lent | Wed 21 Oct | Sun 8 Nov |
| Cake tin | Aunt Sara | borrowed | Tue 20 Oct | Fri 30 Oct |
| Ladder | Omar | borrowed | Sat 24 Oct | 1 week |

The app answers, most urgent first:

- **You lent out 4: 1 late, 1 due today. You borrowed 2: none late.**
- **Novel: With Hina · lent Sat 26 Sep (29 days ago). 15 days late · was due Sat 10 Oct.** (26 Sep + 2 weeks = 10 Oct; 10 Oct to 25 Oct = 15 days)
- **Phone charger: With Ali · lent Sun 18 Oct (7 days ago). Due back today.**
- **Camping tent: With Bilal · lent Wed 21 Oct (4 days ago). Due back Sun 8 Nov · in 14 days.**
- **Drill: With Bilal · lent Sat 12 Sep (43 days ago). No give-back date.**
- **Cake tin: From Aunt Sara · borrowed Tue 20 Oct (5 days ago). Give back by Fri 30 Oct · in 5 days.**
- **People:** "Bilal has 2 things of yours." "You have 1 thing of Aunt Sara's."

She taps **Remind** on the novel and gets a message ready to copy, share or email:
*"Hi Hina, hope you are well! Just a friendly reminder that you still have my Novel (since Sat 26 Sep). We said Sat 10 Oct, so could I have it back soon? Thank you!"*

Ali brings the charger back the same evening: **Got it back** says **Got back Phone charger from Ali after 7 days**, and it moves to **Returned**. The next morning every count moves on by itself (the drill is now **44 days**, the novel **16 days late**).

Other cases, same app:

- **Lent again:** in Returned, **Lend again** fills in the same thing and person with today's date.
- **Tapped too soon:** **Undo**, or **Not back yet** in the Returned list.
- **Something lent on 31 Jan with "1 month"** is due back on **28 Feb** (29 Feb in a leap year).
- **The same thing twice:** typing "drill" again shows *Note: Drill is already on your list as with Bilal.*
- **"bilal" and "Bilal"** count as the same person.

## Features

- **Help button.** Tap **Help** at the top for a short how-to written for this app, and tap **All apps** to go back to the list.
- **Two boxes at the top**: how many things you lent out and borrowed, how many are late and due today. Tap one to see that list.
- **Lent out, Borrowed and Returned** lists. Each thing has its own box, most urgent first, coloured by state: red when late, amber when due soon, grey with no date.
- **Add in a few taps:** I lent it or I borrowed it, what, who (names you used before are suggested), the day (today to start with) and **Give back by** with **No date, 1 week, 2 weeks, 1 month or Pick a date**. A line under the form says the date it works out before you add it.
- **Optional photo** (made smaller and kept on the device) and **optional note**, each behind its own "+ Add" button.
- **Remind**: a polite message for the person who has your thing, which you can change, then **Copy**, **Share** or **Email**.
- **Got it back / Gave it back** moves it to Returned with how long it was away. **Lend again**, **Not back yet**, **Edit** (including the day it came back) and **Delete**, with **Undo** for every change.
- **People**: each person in their own box with what they have of yours and what you have of theirs; **Show only** lists just their things.
- **Search what or who** once the list grows.
- **Copy my list**, **Email my list** (works without typing an address), **Download (CSV)**, **Print**.
- **Save a backup file** (with photos), **Restore a backup**, **Delete everything** with Undo. Damaged or blocked saved data is handled with a clear message.
- **Private.** Your list and photos stay in this browser on this device; your data is never sent anywhere.
- **Works offline and installable.** Day counts move on by themselves at midnight.
- **Back to all apps.** A "← All apps" button at the top of the page.
- **Light and dark mode switch.** It follows your device until you choose, and remembers your choice in every app.

## Run it yourself

No build step and no dependencies.

```bash
git clone https://github.com/umar8092/apps.git
```

Then open `lent-and-borrowed-items-tracker/index.html` in your browser.

Offline mode and install work best with the files served over `https` or `localhost` (for example `python3 -m http.server`).

## How it works

- `core.js` is the logic, with no page code. Dates are calendar dates (`2026-10-25`), so time zones and summer time never move a day. It works out give-back dates (1 month from 31 Jan is 28 Feb), days away, days left and days late, the order of the list, the summary, the per-person lines, the reminder, copy and CSV text, tidies pasted text, reads the form with plain error messages, and checks every saved or restored value.
- `script.js` builds the page. The list is saved in `localStorage` on the device, each photo under its own key.
- `sw.js` saves the app on your device for offline use (network first, so updates show at once).
- Run the logic checks with `node tests.js` (or open `test.html`), and the full page test with `node ui-test.js` (needs Playwright). The page test fixes "today" to Sun 25 Oct 2026 and checks the exact answers above.

## License

[MIT](LICENSE). Free to use, copy, modify and share. Made by [Muhammad Umar](https://github.com/umar8092).
