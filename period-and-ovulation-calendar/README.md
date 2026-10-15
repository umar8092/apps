# Period and Ovulation Calendar

A free, **private period tracker and ovulation calendar** for anyone who wants to know when their next period is due without handing their cycle data to a company. Tap the day each period starts. The app shows **when the next period is expected** (with your usual range), your **likely fertile days and ovulation day**, **which day of your cycle it is**, and plainly says **"Period is 3 days late"** when it is. Log symptoms and notes, add the next periods to your phone's calendar, and copy or print a summary for a doctor. No account, no ads. What you log stays on your device, and the app works offline.

**Live demo:** [umar8092.github.io/apps/period-and-ovulation-calendar](https://umar8092.github.io/apps/period-and-ovulation-calendar/)

| Desktop | On a phone |
|---|---|
| ![Period and Ovulation Calendar on a laptop: on the left "Period expected in 14 days", next period Fri 30 Oct 2026 (usually 28 to 31 Oct), likely fertile days 9 to 18 Oct with ovulation around Fri 16 Oct, and the October calendar with 1 to 5 Oct filled pink, 9 to 18 Oct green and 30 Oct onward outlined; on the right Your periods with an average cycle of 29 days, shortest to longest 27 to 30 days, and a box for each period](screenshots/desktop.png) | <img src="screenshots/phone.png" alt="Period and Ovulation Calendar on a phone: Today, Fri 16 Oct 2026, Period expected in 14 days, day 16 of your cycle, next period Fri 30 Oct 2026, likely fertile days 9 to 18 Oct 2026, a My period started today button and the October calendar" width="220"> |

## The situation it solves

Aisha is 27. Her period apps kept asking her to sign up and share data, so she stopped using them, and now she never knows whether to pack pads for a trip or whether a late period means anything. Her doctor also asked how long her cycles are. Her last six periods started on:

| Started | Lasted | Days after the one before |
|---|---:|---:|
| 11 May 2026 | 5 days | (first) |
| 8 Jun 2026 | 5 days | 28 |
| 7 Jul 2026 | 6 days | 29 |
| 3 Aug 2026 | 5 days | 27 |
| 2 Sep 2026 | 4 days | 30 |
| 1 Oct 2026 | 5 days | 29 |

On **16 October 2026** the app says:

- **Period expected in 14 days.** Day 16 of your cycle. Your last period started Thu 1 Oct 2026.
- **Next period: Fri 30 Oct 2026, usually 28 to 31 Oct 2026.** The average of her last five cycles is (28 + 29 + 27 + 30 + 29) / 5 = 28.6, rounded to **29 days**; 1 Oct + 29 days = 30 Oct. Her shortest (27) and longest (30) cycles give the range.
- **Likely fertile days: 9 to 18 Oct 2026, now, ovulation around Fri 16 Oct.** Ovulation is about 14 days before the next period (30 Oct - 14 = 16 Oct). The window is the 5 days before ovulation to the day after, widened by how much her cycles vary (28 Oct - 19 = 9 Oct, 31 Oct - 13 = 18 Oct).
- **Your periods:** average cycle **29 days**, shortest to longest **27 to 30 days**, period lasts **5 days**, and a box for each period with "29 days after the one before".
- The calendar shows 1 to 5 Oct filled pink (logged), 9 to 18 Oct green (fertile) with a ring on 16 Oct (ovulation), and 30 Oct to 3 Nov outlined (expected).

Then life happens:

- **31 October, still no period**: **Period is 1 day late.** It was expected Fri 30 Oct 2026. That is still within your usual range (up to Sat 31 Oct). Plus a note that a home pregnancy test is reliable from the day the period was due.
- **2 November**: **Period is 3 days late.** Next period shows **Any day now**; the fertile window moves on to the next cycle.
- **It starts on 3 November**: she taps **My period started today** and sees **Period day 1**. Tapping a past day in the calendar and **My period started this day** logs a period she forgot; **Add a period you forgot to log** does the same by date.
- **She logged one by mistake**: **Delete** in its box (or **Delete this period** in the calendar), with **Undo**.
- **First use with only one period**: she types her usual cycle (or leaves 28) and sees "Based on the cycle length you typed (28 days). Once you log your next period, the app uses your own cycles."
- **Pregnant or breastfeeding**: she ticks **pause predictions**. When periods come back she logs one; predictions turn back on and the long gap is not counted.
- **For the doctor**: **Copy summary**, **Email summary** or **Print** list every period, each cycle length, the average, shortest and longest, and her symptoms and notes from the last three months.

Other cases it handles: a period logged inside another one (refused: "That is day 3 of the period that started 1 Oct 2026. Log only the first day"), the same day twice, a future day or one more than 10 years ago (refused); a start only a few days after another (logged with a spotting warning); cycles shorter than 21 or longer than 35 days (marked short or long, with a note to mention it to a doctor if it happens often); cycles that vary by more than a week (a wide range, said plainly); a gap of 90 days or more (left out of the average by itself), or a ticked "Don't count the gap before this period"; only the last six cycles count; period length from 1 to 15 days per period; a new day while the page stays open; notes up to 300 characters; week starting Monday or Sunday; a bad or empty backup file (refused); corrupt saved data (starts fresh); blocked storage (works and says it is not saving).

## Features

- **Help button.** Tap **Help** at the top for a short how-to, and **All apps** to go back to the list of apps. **Light mode / Dark mode** switch.
- **Today**: which day of your cycle it is, how many days until your next period, or how many days late it is, or which day of your period you are on.
- **Next period** with the usual range and **Likely fertile days** with the ovulation day.
- **Calendar** month by month: logged periods, expected periods, fertile days, ovulation and days with notes. Arrow keys move between days.
- **Symptoms and notes** for any day: cramps, heavy flow, spotting, headache, bloating, tender breasts, low mood, tired, spots, clear stretchy discharge, and a note.
- **Your periods**: every period in its own box with the days since the one before, how long it lasted (changeable), a "Don't count the gap" tick and Delete with Undo. Average cycle, shortest to longest, and period length.
- **Add next 3 periods to my calendar**: a calendar file (.ics) with a reminder the evening before, optionally with the fertile windows.
- **Copy summary**, **Email summary** (opens your mail app with no address needed) and **Print**, for example for a doctor.
- **Pause predictions** while pregnant, breastfeeding or on hormonal birth control.
- **Save backup file** and **Load backup file** to keep a copy or move to another phone or computer. **Delete everything** with Undo. **Try an example first** to look around.
- **Private, works offline and installable.** Phone and desktop layouts. Works with a keyboard and a screen reader.

Estimates only: not medical advice and not birth control.

## Run it yourself

No build step and no dependencies.

```bash
git clone https://github.com/umar8092/apps.git
```

Then open `period-and-ovulation-calendar/index.html` in your browser. Offline mode and install need the files served over `https` or `localhost` (for example `python3 -m http.server`).

## How it works

- `core.js` is the date maths, with no page code. Dates are whole calendar days, so time zones and summer time never move a period. A cycle is the days from one period's start to the next. The average, shortest and longest come from the last six counted cycles (gaps you tick, and gaps of 90 days or more, are left out). Next period = last start + average; ovulation = next period - 14 days; fertile window = 5 days before the earliest likely ovulation to the day after the latest.
- `script.js` builds the page. Everything you type is added as plain text, never as HTML. Your data is saved in this browser's storage under `period-and-ovulation-calendar.state`, and every saved or loaded value is checked before it is used.
- `sw.js` saves the app for offline use (network first, so updates always arrive).
- Checks: `node tests.js` for the maths (also `test.html` in a browser), `node ui-test.js` drives the real page in headless Chromium with the clock fixed at 16 October 2026 (add `--base https://umar8092.github.io/apps` to test the live site). `node shots.js` redoes the screenshots.

## License

[MIT](LICENSE). Free to use, copy, modify and share. Made by [Muhammad Umar](https://github.com/umar8092).
