# Exam Result and Report Card Tracker for Parents

A free **report card and test results tracker for parents**. Each child has their own box with their own subjects. Add every monthly test, class test and term report card as marks out of any total (out of 25, 50, 100 or 1,100), as a grade, or as absent, and the app tells you which subject went up or down since last time, which subject needs a tutor, the best and most improved subjects, and each test's overall percentage and class position, with a chart over time and a summary ready to send to a tutor or the other parent. No sign-up, no ads, works offline, and your data never leaves your phone.

**Live app:** [umar8092.github.io/apps/exam-result-and-report-card-tracker-for-parents](https://umar8092.github.io/apps/exam-result-and-report-card-tracker-for-parents/)

| Desktop | On a phone |
|---|---|
| ![Report card tracker on a laptop: Ali in Class 6 with 74.4% overall in Term 2, down 0.4 from 74.8% in Term 1, Maths under Needs attention at 62% (down 12 from 74%), English as the best subject, a chart of the overall percentage over three tests, and each subject with its percentage and change](screenshots/desktop.png) | <img src="screenshots/phone.png" alt="Report card tracker on a phone: Ali's box with 74.4% overall, Needs attention: Maths 62% (down 12 from 74%), and Doing well: English 88%, Urdu up 9" width="220"> |

## The situation it solves

Sana has two children. Ali is in Class 6 and brings home a monthly test out of 25 and a report card out of 100 each term. Hira is in Class 3 and her school gives grades. When the Term 2 report card comes in October, Sana cannot remember whether Maths went up or down since Term 1, or which subject needs a tutor. She adds the results and the app answers:

- **Ali, Term 2 (15 Oct 2026): 74.4% overall** (372 out of 500), *▼ Down 0.4 from 74.8% in Term 1*, *Position 5 of 32*.
- **Needs attention: Maths 62% (down 12 from 74%).** A subject shows here when it is below 50% or drops by 10 points or more; both levels can be changed (presets or your own).
- **Doing well:** *Best subject: English 88%*, *Most improved: Urdu, up 9 to 74%*.
- Every subject with its latest percentage, the change and a small line of every test: *Maths: 62/100 in Term 2, down from 74%*.
- In the February monthly test Ali was **absent** for Islamiat. It is not counted as zero: the test shows *68% overall* (68 out of 100 for the four subjects he sat), and Islamiat in Term 2 is compared with Term 1 (*80%, down from 85%*).
- **Hira (grades):** Maths went from **B** to **C** and Urdu from **A+** to **A**, so both show under Needs attention. Each grade counts as a percentage (A+ 90%, A 75%, B 65%, C 55% ... changeable in Settings), so Term 2 is *about 73.8% overall*.
- **Copy summary** gives text like this to send to the tutor:

```
Ali (Class 6): exam results
Latest: Term 2, 15 Oct 2026. Position 5 of 32
Overall in Term 2: 372 / 500 = 74.4%, down from 74.8% in Term 1

English: 88% in Term 2, up from 80% in Term 1
Maths: 62% in Term 2, down from 74% in Term 1
Science: 68% in Term 2, down from 70% in Term 1
Urdu: 74% in Term 2, up from 65% in Term 1
Islamiat: 80% in Term 2, down from 85% in Term 1

Needs attention: Maths 62% (down 12 from 74%)
Most improved: Urdu (up 9)
Best: English 88%
```

## Features

- **Help button.** Tap **Help** at the top for a step-by-step guide, and **All apps** to go back to the list.
- **Each child in their own box** with their own subjects (tap common ones such as English, Maths, Science, Urdu, or type your own) and an optional class or year.
- **Any total:** tap *25*, *50* or *100* for every subject, or type your own; change one subject's total if it differs. Type marks like *31*, *23.5*, or paste *31/50*. A live preview shows the percentage as you type.
- **Marks, Grade or Absent** for each subject. Absent is never counted as zero. Subjects left blank are simply not part of that test (for a test with only three subjects).
- **Up or down since last time** for every subject and for the overall percentage, with **Needs attention**, **Best subject**, **Most improved** and the lowest subject.
- **Overall over time** chart (touch or hover a dot to see the test) and a small line per subject.
- **Optional position in class** (5 of 32).
- **All results** history with each test's marks, **Edit** and **Delete** with Undo. The same test name twice (two "Monthly test"s) is told apart by date.
- **New school year:** change the class in **Edit child**; old results keep the class they were in. Add, rename or remove subjects; renaming carries the history over.
- **Your school's grades:** change grade names and what each counts as, or add your own (A*, 9 to 1, or short words like Good).
- **Copy summary** and **Share** (WhatsApp and others) for a tutor, teacher or the other parent.
- **Backup file** and restore (for a new phone), **Delete everything** with Undo.
- **Private and offline.** Everything stays in this browser on this device; your data is never sent anywhere. Installable.
- **Back to all apps** button and a **light and dark mode switch** that remembers your choice in every app.

## Run it yourself

No build step and no dependencies.

```bash
git clone https://github.com/umar8092/apps.git
```

Then open `exam-result-and-report-card-tracker-for-parents/index.html` in your browser.

Offline mode and install need the files served over `https` or `localhost` (for example `python3 -m http.server`).

## How it works

- `core.js` is the maths, with no page code. Marks are whole hundredths and percentages whole tenths, so totals are exact: 31 out of 50 is 62%, 1 out of 3 is 33.3%. `overall()` adds the marks of every subject with marks and divides by the total possible, the way a report card does; `analyse()` compares each subject with its last result (skipping absences) and finds what needs attention.
- `script.js` builds the page. Names and subjects are added as plain text, never as HTML. Saved data is checked on load, and a damaged save starts fresh.
- `sw.js` saves the app on your device for offline use (network first, so updates show at once).
- Run the logic checks with `node tests.js` (or open `test.html`), and the page checks with `node ui-test.js` (Playwright).

## License

[MIT](LICENSE). Free to use, copy, modify and share. Made by [Muhammad Umar](https://github.com/umar8092).
