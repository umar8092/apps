# Tuition Fee and Attendance Register for Tutors

A free **fee and attendance register for home tutors and small academies**. Each student has their own class days and their own fee, by the month or by the class. Every class day counts as attended, so you only tap who was absent. Record full, part and advance payments, and the app tells you who has not paid this month, how much, and since when, with a polite message ready to send to the parent. No sign-up, no ads, works offline, and your data never leaves your phone.

**Live app:** [umar8092.github.io/apps/tuition-fee-and-attendance-register-for-tutors](https://umar8092.github.io/apps/tuition-fee-and-attendance-register-for-tutors/)

| Desktop | On a phone |
|---|---|
| ![Tuition register on a laptop: today's classes for Ali, Omar, Bilal and Zara with Present and Absent buttons, the October box saying Still to collect: 14,600 from 4 students, and Ali's calendar showing absences on 6 and 20 October with 5,000 still to pay and a Late tag](screenshots/desktop.png) | <img src="screenshots/phone.png" alt="Tuition register on a phone: Today's classes for Thursday 22 October with Present and Absent buttons for each student" width="220"> |

## The situation it solves

Ayesha teaches six children at home after school. Most pay a monthly fee by the 10th, one pays per class, and one joined in the middle of the month. On Thursday 22 October a parent asks how many classes Ali missed, and Ayesha cannot remember who has paid for October. She opens the app:

- **Today's classes:** Ali, Omar, Bilal and Zara have class on Thursdays. Everyone counts as present; she taps **Absent** for anyone who did not come.
- **October 2026: Still to collect: 14,600 from 4 students**
  - Ali 5,000 (Late), Sara 2,000 (3,000 of 5,000 paid, Late), Omar 4,000 (Late), Hina 3,600 (fee so far).
- **Ali:** *Attended 11 of 13 classes: absent 6 Oct and 20 Oct.* Monthly fee 5,000. *Still to pay: 5,000. Late: due by 10 Oct.*
- **Hina** pays 600 a class, Mondays and Wednesdays. She missed 14 October and had an extra class on Saturday 17th: *6 classes × 600 so far = 3,600.* Missed classes are not charged unless Ayesha ticks *Charge for missed classes too*.
- **Bilal** joined on Thursday 15 October, Monday to Friday, 6,000 a month, and Ayesha charges only the days he had: *Fee for 12 of 22 class days = 3,272.73.* His parent paid 3,300, so the app says *Paid 27.27 extra. It comes off the next fee*, and November asks for 5,972.73.
- **Zara** is Ali's sister with a 1,000 discount: 5,000 − 1,000 = 4,000, paid in full.
- **Copy fee message** for Ali gives: *"Assalam o alaikum, This is a reminder that Ali's tuition fee for October 2026 is 5,000. Classes in October: attended 11 of 13 classes: absent 6 Oct and 20 Oct. Thank you."* Once paid, the same button gives a thank-you receipt instead.

If Omar's parent pays nothing in October, November shows *Monthly fee 4,000, Unpaid from before 4,000, Total for November 8,000*. All money is whole cents, so totals are always exact.

## Features

- **Help button.** Tap **Help** at the top for a step-by-step guide, and **All apps** to go back to the list.
- **Each student in their own box** with their own class days (quick choices such as *Mon to Fri* or *Mon, Wed, Fri*, or no fixed days), their own fee, a month calendar and their fees.
- **One tap attendance.** *Today's classes* lists who has class today; tap **Absent** only for those who did not come. Any other day: tap it in the calendar for **Present**, **Absent**, **No class** (this student only), **Extra class** (a make-up class), or **Holiday for everyone**.
- **Monthly or per class fees.** Per-class fees count only the classes that happened; missed classes are free unless you choose otherwise.
- **Joining or leaving part way:** charge the full month or only the class days they had. **+ Stopped coming?** keeps their history.
- **Payments:** full, part or ahead for a later month. What is not paid is carried as *Unpaid from before*; paying more comes off the next fee. Each payment can be deleted, with Undo.
- **Discount or extra charge** for one month (no fee in a holiday month, books, test fees). Fee changes from a chosen month keep earlier months as they were.
- **Late tags** after the due day you choose (10th by default).
- **The month box:** *Still to collect* with each student who owes, a tap to jump to their box, *Copy the unpaid list* and *Print the register* (or save it as a PDF).
- **Messages for parents:** *Copy fee message* or *Share* (for WhatsApp and others), with your own greeting such as *Assalam o alaikum*.
- **Find a student** when the list grows, optional currency symbol (none by default), backup file and restore, delete everything with Undo.
- **Private and offline.** Everything stays in this browser on this device; your data is never sent anywhere. Installable.
- **Back to all apps** button and a **light and dark mode switch** that remembers your choice in every app.

## Run it yourself

No build step and no dependencies.

```bash
git clone https://github.com/umar8092/apps.git
```

Then open `tuition-fee-and-attendance-register-for-tutors/index.html` in your browser.

Offline mode and install need the files served over `https` or `localhost` (for example `python3 -m http.server`).

## How it works

- `core.js` is the maths, with no page code. `monthCalc()` works out a month's classes and fee for one student, `monthFee()` adds what was carried from earlier months, and `summary()` adds up every student. Money is whole cents; a part-month fee is the monthly fee × class days had ÷ class days in the month, rounded once to the nearest cent.
- `script.js` builds the page. Names and notes are added as plain text, never as HTML. Saved data is checked on load, and a damaged save starts fresh.
- `sw.js` saves the app on your device for offline use (network first, so updates show at once).
- Run the logic checks with `node tests.js` (or open `test.html`), and the page checks with `node ui-test.js` (Playwright).

## License

[MIT](LICENSE). Free to use, copy, modify and share. Made by [Muhammad Umar](https://github.com/umar8092).
