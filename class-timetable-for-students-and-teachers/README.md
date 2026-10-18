# Class Timetable for Students and Teachers

A free **class timetable** for school, college and university students, and for teachers with several classes. Add each subject once with its **days, times and rooms**, and the app shows **the lesson on now, how long is left, what is next, which room and what to bring**. It also lists **today** with the free gaps, **tomorrow** with what to pack, and **the whole week** to copy, email or print. It handles **Week A and Week B** timetables, **holidays and exam weeks**, 12 or 24-hour times, and saves a **calendar file** for the whole term. Works offline, no sign-up, no ads.

**Live demo:** [umar8092.github.io/apps/class-timetable-for-students-and-teachers](https://umar8092.github.io/apps/class-timetable-for-students-and-teachers/)

| Desktop | On a phone |
|---|---|
| ![Class Timetable on a laptop: Right now, Now: English, Room 5, Mrs Khan, until 10:30, 20 min left, Next Chemistry at 10:50 (in 40 min), Lab B4, Dr Ali, Bring lab coat and goggles; today's lessons with Maths faded, English marked Now and the free gaps between lessons; on the right the form to add another subject with day, room, start and end times, length buttons and Week A or B](screenshots/desktop.png) | <img src="screenshots/phone.png" alt="Class Timetable on a phone: Right now, Now: English, Room 5, Mrs Khan, until 10:30, 20 min left, Next Chemistry at 10:50 in 40 min, Lab B4, Dr Ali, Bring lab coat and goggles, then Today, Mon 19 Oct, Week A with Maths done, English now and Free 10:30 to 10:50" width="220"> |

## The situation it solves

Ayesha is in Year 10. Every morning she looks for a blurry photo of her timetable to see which room she is in next, and twice this term she forgot her PE kit. Her school has a two-week timetable (Week A and Week B) and a half term from 26 October to 1 November. She adds her subjects once:

- Maths (Mr Ahmed): Mon 08:30 to 09:30 Room 12, Wed 10:50 to 11:50 Room 12, Fri 08:30 to 09:30 Room 14
- English (Mrs Khan): Mon 09:30 to 10:30 Room 5, Thu 08:30 to 09:30 Room 5
- Chemistry (Dr Ali, bring "lab coat, goggles"): Mon 10:50 to 11:50 and Tue 13:00 to 14:00 in Lab B4
- Physics: Tue 08:30 and Thu 10:50 in Lab B2
- PE (bring "PE kit"): Tue 09:30 and Fri 13:00 in the Sports hall
- History: Mon, Wed and Thu in Room 8
- Computer Science: Wed 09:30 every week, Fri 10:50 **Week B only**, in IT 1

On **Monday 19 October 2026 at 10:10** (Week A) the app answers:

- **Now: English.** Room 5 · Mrs Khan · until 10:30. **20 min left.**
- **Next: Chemistry at 10:50 (in 40 min).** Lab B4 · Dr Ali. **Bring: lab coat, goggles (Chemistry).**
- **Today, Mon 19 Oct · Week A:** Maths 08:30 to 09:30 (faded, done), English (Now), **Free 10:30 to 10:50 (20 min)**, Chemistry, **Free 11:50 to 13:00 (1 h 10 min)**, History.
- **Tomorrow, Tue 20 Oct:** Physics, PE, Chemistry. **Bring tomorrow: PE kit (PE), lab coat, goggles (Chemistry).**

At 10:30 it changes by itself to **Free now until 10:50 (20 min)**. At 13:30 it says **Now: History, 30 min left. This is the last lesson today. Next school day: Tue 20 Oct (tomorrow), Physics at 08:30, Lab B2.** Once she adds half term, on Friday 23 October the second card says **No lessons tomorrow (Saturday)** and becomes **Next school day, Mon 2 Nov · Week A**, and during half term **Right now** says **Holiday: Half term. No lessons until Mon 2 Nov.**

Computer Science on Friday shows only in Week B. She taps **Save calendar file** with the last day of term, **Fri 18 Dec**, and gets **16 repeating lessons** in her phone's calendar, with rooms, the Week B lesson every 2 weeks from Fri 30 Oct, and half term left out.

Her teacher, Mrs Khan, uses the same app with classes such as "10B English" and "Year 8 English", each with its own rooms.

## Features

- **Help button.** Tap **Help** at the top for a short how-to written for this app, and tap **All apps** to go back to the list.
- **Right now:** the lesson on now with its room, teacher and how long is left, then **Next** with how soon it starts and what to bring. Between lessons: **Free now until 10:50**. Before school: **First lesson today**. After the last lesson, at weekends and in holidays: the first lesson of the **next school day**. It updates by itself every minute and at midnight.
- **Today** in order with the **free gaps** between lessons; the lesson on now is marked **Now** and finished ones are faded.
- **Tomorrow** with **Bring tomorrow**, so the bag can be packed the night before. On Fridays and before holidays it shows the **next school day** instead.
- **Whole week** as day columns (one under the other on a phone), with **Copy the week**, **Email the week** (works without typing an address) and **Print the week**.
- **Each subject in its own box** with its colour, every day and time with its own room, the number of lessons a week, what to bring and a note. **Edit** changes anything; **Delete this subject** has Undo.
- **Quick lesson length:** 40 min, 45 min, 1 hour or 90 min fills in the end time; any start and end time can be typed. **+ Add another day or time** copies the last times and room to the next school day.
- **Clash warning** when two lessons overlap on the same day and week (usually an am/pm typo), shown on both boxes.
- **Week A and Week B (optional):** say which week this one is; each lesson time can be every week, Week A only or Week B only. Weeks then switch by themselves.
- **Holidays and exam weeks:** no lessons are shown on those days, with Undo on delete.
- **School week starts on** Monday, Sunday or Saturday, and **24-hour or 12-hour** times (or like the device).
- **Calendar file** for the term: every lesson repeats weekly (Week A or B lessons every 2 weeks) with its room, skipping holidays.
- **Save a backup file**, **Restore a backup**, **Delete everything** with Undo. Damaged or blocked saved data is handled with a clear message.
- **Private.** Your timetable stays in this browser on this device; your data is never sent anywhere.
- **Works offline and installable.**
- **Back to all apps.** A "← All apps" button at the top of the page.
- **Light and dark mode switch.** It follows your device until you choose, and remembers your choice in every app.

## Run it yourself

No build step and no dependencies.

```bash
git clone https://github.com/umar8092/apps.git
```

Then open `class-timetable-for-students-and-teachers/index.html` in your browser.

Offline mode and install work best with the files served over `https` or `localhost` (for example `python3 -m http.server`).

## How it works

- `core.js` is the logic, with no page code. Dates are calendar dates (`2026-10-19`) and times are minutes after midnight on your own clock, so time zones and summer time never move a lesson. It works out the lessons on any date (with Week A or B and holidays), what is on now and next, the free gaps, the next school day, clashes, the copy text and the calendar file, reads the form with plain error messages, and checks every saved or restored value.
- `script.js` builds the page. Names, rooms and notes are added as plain text, never as HTML. Everything is saved in `localStorage` on the device.
- `sw.js` saves the app on your device for offline use (network first, so updates show at once).
- Run the logic checks with `node tests.js` (or open `test.html`), and the full page test with `node ui-test.js` (needs Playwright). The page test fixes "now" to Mon 19 Oct 2026 10:10 and checks the exact answers above.

## License

[MIT](LICENSE). Free to use, copy, modify and share. Made by [Muhammad Umar](https://github.com/umar8092).
