# Mood and Sleep Journal

A free, **private mood and sleep journal for anyone who feels low or anxious some days and wants to see what helps**, and for people whose doctor or therapist asked them to keep a mood log. Once a day tap a face for your mood (Very low to Very good), type how long you slept and tick what happened (exercise, time outside, work stress, caffeine after 2 pm, your own tags). The app shows a **calendar coloured by mood**, your average mood and sleep, and **your average mood with and without each tag** ("Exercise: 4.2 with, 2.9 without"), plus your mood after short and long nights. Print, email, copy or download it for your doctor; notes stay out unless you tick the box. No sign-up, no ads, everything stays on your device, works offline.

**Live demo:** [umar8092.github.io/apps/mood-and-sleep-journal](https://umar8092.github.io/apps/mood-and-sleep-journal/)

| Desktop | On a phone |
|---|---|
| ![Mood and Sleep Journal on a laptop: average mood 3.4 out of 5, average sleep 6 h 58 min, 13 of 14 days filled in, 3 low days, and mood with and without each tag: Caffeine after 2 pm minus 1.8, Work or study stress minus 1.6, Time outside plus 1.6, Exercise plus 1.3, next to the day's tags and settings](screenshots/desktop.png) | <img src="screenshots/phone.png" alt="Mood and Sleep Journal on a phone showing average mood 3.4 out of 5, average sleep, and mood with and without each tag" width="220"> |

## The situation it solves

Hina has been feeling flat and anxious for weeks. Her doctor says: *"Keep a mood diary for two weeks, note your sleep and anything that seems to matter, and we'll look at it together."* A notes app gives her a wall of text and no answers.

With the app, each evening Hina taps a face, types her sleep (or picks bedtime 23:30 and wake-up 07:00, which the app turns into 7 h 30 min) and ticks what happened. She missed Sunday the 11th; the calendar leaves it blank rather than guessing. After two weeks the app answers her question:

- **Average mood 3.4 / 5** (Okay), **average sleep 6 h 58 min** from 12 nights, **13 of 14 days** filled in, **3 low days**.
- **Caffeine after 2 pm: -1.8**: 2.0 with (3 days), 3.8 without (10 days). Days with it were worse on average.
- **Work or study stress: -1.6**: 2.5 with (6 days), 4.1 without (7 days).
- **Time outside: +1.6**: 4.5 with (4 days), 2.9 without (9 days).
- **Exercise: +1.3**: 4.2 with (5 days), 2.9 without (8 days).
- **Mood after short and long nights:** under 6 hours 2.0, 6 to 7 hours 3.0, 7 hours or more 4.1.

She taps **Print or save as PDF** to take a summary and a table of her days to the appointment. Her notes stay private unless she ticks **Include my notes**. On a Very low day the app says it is sorry it was a hard day and shows the help line she typed in Settings, with a reminder to call the emergency number or a crisis line if she feels unsafe.

Worked examples from the tests (all checked by hand):

- Moods 3, 2, 4, 3, 4, 5, 2, 3, 4, 2, 4, 5, 3 add up to 44; 44 / 13 = 3.38, shown as **3.4**.
- Exercise days had moods 4, 4, 5, 4, 4: 21 / 5 = **4.2**. The other 8 days add up to 23: 23 / 8 = 2.875, shown as **2.9**. The difference is shown as **+1.3** (4.2 - 2.9).
- Sleep over 12 nights adds up to 5020 minutes; 5020 / 12 = 418.3, shown as **6 h 58 min**.
- 23:30 to 07:00 is **7 h 30 min**; a day sleep after a night shift from 09:00 to 15:30 is **6 h 30 min**. Typing 7.5, 7,5, 7:30, 7h30 or "7 h 30 min" all give 7 h 30 min; 25 is refused.
- With fewer than 3 days on either side, a tag says *"Few days, so this may be chance."*

## Features

- **Help button** at the top with a how-to for this app, **All apps** to go back to the list, and a **Light / Dark** switch.
- **One quick entry a day:** five mood faces, sleep in hours (or worked out from bedtime and wake-up time, across midnight), tags you tap, and an optional note. Saving a day again replaces it, and the message says so with **Undo**.
- **Fill in or change any past day** with **Day before**, the date box or a tap on the calendar. Future days are refused. Missed days stay blank.
- **Calendar** coloured by mood, month by month.
- **What goes with your better days** for the last 7, 30 or 90 days or all days: average mood, average sleep, days filled in, low days, mood with and without each tag (biggest difference first), and mood after short, middling and long nights.
- **Your own tags** (up to 24), and remove the ones you never use, with Undo.
- **Kind words and your own help line** on Low and Very low days.
- **Share with your doctor or therapist:** Print or save as PDF, Email (no address needed), Copy as text, Download spreadsheet. Notes are left out unless you tick **Include my notes**.
- **Backup file** and **Restore** (checked, with Undo), **Delete the whole journal** with Undo.
- Private: no account and your data is never sent anywhere. Works offline once loaded, and can be installed on the home screen.

Not medical advice. If you are in danger, contact your local emergency number or a crisis line.

## Run it yourself

```
git clone https://github.com/umar8092/apps.git
```

Then open `mood-and-sleep-journal/index.html` in a browser. No build step and no dependencies.

Tests: `node mood-and-sleep-journal/tests.js` checks the maths (or open `test.html`), and `node mood-and-sleep-journal/ui-test.js` drives the page in headless Chromium (needs Playwright).

## How it works

Plain HTML, CSS and JavaScript. The maths lives in `core.js`. There is one entry per calendar day (`2026-10-18`) with the mood (1 to 5), the minutes slept the night before, the tags and the note. Averages use whole-number maths and round half up: mood to one decimal, sleep to the minute. The journal is saved in this browser's `localStorage`; a network-first service worker keeps the app working offline.

## License

MIT, see [LICENSE](LICENSE).
