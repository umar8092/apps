# Replacement Reminder for Filters and Toothbrushes

A free **replacement reminder** for everything at home you are meant to change on a schedule: the **water filter**, **toothbrushes**, **contact lenses** and their case, the **AC, vacuum and air purifier filters**, **razor blades**, the kitchen sponge, car wiper blades and more. Each thing gets its **own** "replace every" time and the date you **last replaced** it, and the app shows **what to replace now**, how many days late, and **when everything else is due**. Tap **Replaced today** when you change it. Add one box for each family member in one go, pause things you are not using, copy a **shopping list** of what is due soon, and put the due dates in your calendar. Works offline, no sign-up, no ads.

**Live demo:** [umar8092.github.io/apps/replacement-reminder-for-filters-and-toothbrushes](https://umar8092.github.io/apps/replacement-reminder-for-filters-and-toothbrushes/)

| Desktop | On a phone |
|---|---|
| ![Replacement Reminder on a laptop: today 2 things to replace now, Water filter jug cartridge (11 days late) and AC filter, with an I replaced all 2 button and next Toothbrush (Ali) Mon 2 Nov; each thing in its own box on the left, four toothbrushes for Ali, Dad, Mum and Sara, contact lenses for Mum, fridge filter and wiper blades; on the right a shopping list for the next 30 days with Toothbrush x 4](screenshots/desktop.png) | <img src="screenshots/phone.png" alt="Replacement Reminder on a phone: Today, 2 things to replace now, Water filter jug cartridge (11 days late), AC filter (wash or clean), I replaced all 2, next Toothbrush (Ali) Mon 2 Nov in 9 days" width="220"> |

## The situation it solves

Ayesha can never remember when the water jug cartridge was last changed, the family's toothbrushes stay in the cup far longer than 3 months, and the AC filter gets cleaned only when the AC starts to smell. On Saturday 24 October 2026 she adds, using **Pick a common item**:

- Water filter jug cartridge, every 4 weeks, last replaced Tue 15 Sep, note "Brita Maxtra, buy a 3-pack"
- AC filter (wash or clean), every month, last Thu 24 Sep
- Toothbrush, every 3 months, last Sun 2 Aug, for **Ali, Sara, Mum, Dad** (typed with commas: four boxes)
- Contact lenses (monthly), every month, last Sat 3 Oct, for Mum
- Fridge water filter, every 6 months, last Wed 10 Jun
- Car wiper blades, every year, last Thu 15 Jan

The app answers:

- **Today: 2 things to replace now: Water filter jug cartridge (11 days late), AC filter (wash or clean).** **Next: Toothbrush (Ali), Mon 2 Nov (in 9 days).**
- Each box: jug cartridge **Replace now: 11 days late (was due Tue 13 Oct)**, AC filter **Replace today**, each toothbrush **Due Mon 2 Nov (in 9 days)**, Mum's lenses **Due Tue 3 Nov (in 10 days)**, fridge filter **Due Thu 10 Dec (in 6 weeks)**, wiper blades **Due Fri 15 Jan 2027 (in 2 months)**.
- She changes the cartridge and taps **Replaced today**: **Water filter jug cartridge replaced. Next: Sat 21 Nov (in 4 weeks).**

The shopping list for the next 30 days, ready to copy or email:

```
To buy for the next 30 days (Sat 24 Oct 2026):
- Water filter jug cartridge, needed now
- AC filter (wash or clean), needed now
- Toothbrush x 4 (Ali, Dad, Mum, Sara), first needed Mon 2 Nov
- Contact lenses (monthly) (Mum), first needed Tue 3 Nov
```

In winter she taps **Pause** on the AC filter. On **Resume** the paused days are not counted: paused on 1 Oct and resumed on 24 Oct, an AC filter last cleaned on 1 Sep (every 3 months) moves from 1 Dec to **24 Dec**.

How the dates are counted: the due date is the last replacement plus the item's time. Weeks are 7 days and months are calendar months (2 Aug + 3 months = 2 Nov; 31 Jan + 1 month = 28 Feb, or 29 Feb in a leap year). Replacing early or late always counts from the day you tap **Replaced today**. "Not sure" when it was last replaced shows it as **Replace now**.

## Features

- **Help button.** Tap **Help** at the top for a short how-to written for this app, and tap **All apps** to go back to the list.
- **Today** at the top: what to replace now with how many days late, **I replaced all** with Undo, and the next thing coming up.
- **Each thing in its own box**, grouped into **Replace now**, **Coming up** (soonest first) and **Paused**, with whose it is, how often, when it was last replaced, the earlier dates and your note.
- **Pick a common item**: 20 usual ones (toothbrush, electric brush head, 2-weekly and monthly lenses, lens case, water filter jug, fridge and RO filters, shower filter, AC, HVAC, air purifier and vacuum filters, cooker hood filter, kitchen sponge, razor blades, mascara, pillow, wiper blades, smoke alarm battery) with the usual advice, or type your own.
- **Replace it every** any number of **days, weeks or months** (up to 730 days, 104 weeks or 36 months). **Last replaced** with Today, A week ago, A month ago, 3 months ago or **Not sure**. A preview shows the next date before you save.
- **One for each person (optional):** type "Ali, Sara, Mum" and each gets their own box with its own date, so one person can change early without moving the others.
- **Replaced today**, **Edit** (any date, for a mistake), **Pause / Resume** (paused days not counted), **Delete** with Undo. A duplicate is kept with a clear note.
- **Shopping list** for the next week, 2 weeks, 30 days or 3 months, with the same things counted together. **Copy** or **Email** it (works without typing an address).
- **Add the due dates to my calendar:** a calendar file with a 9:00 reminder on each due date, repeating at each thing's own time.
- **Copy my whole list**, **Email my whole list**, **Save a backup file**, **Restore a backup**, **Delete everything** with Undo. Damaged or blocked saved data is handled with a clear message.
- **Private.** Your list stays in this browser on this device; your data is never sent anywhere.
- **Works offline and installable.** The dates update by themselves every day.
- **Back to all apps.** A "← All apps" button at the top of the page.
- **Light and dark mode switch.** It follows your device until you choose, and remembers your choice in every app.

## Run it yourself

No build step and no dependencies.

```bash
git clone https://github.com/umar8092/apps.git
```

Then open `replacement-reminder-for-filters-and-toothbrushes/index.html` in your browser.

Offline mode and install work best with the files served over `https` or `localhost` (for example `python3 -m http.server`).

## How it works

- `core.js` is the logic, with no page code. Dates are calendar dates (`2026-10-24`), so time zones and summer time never move a date. It works out each thing's due date (calendar months, paused days), groups and sorts the list, makes the shopping list, the copy text and the calendar file, reads the form with plain error messages, and checks every saved or restored value.
- `script.js` builds the page. Names and notes are added as plain text, never as HTML. Everything is saved in `localStorage` on the device.
- `sw.js` saves the app on your device for offline use (network first, so updates show at once).
- Run the logic checks with `node tests.js` (or open `test.html`), and the full page test with `node ui-test.js` (needs Playwright). The page test fixes "today" to Sat 24 Oct 2026 and checks the exact answers above.

## License

[MIT](LICENSE). Free to use, copy, modify and share. Made by [Muhammad Umar](https://github.com/umar8092).
