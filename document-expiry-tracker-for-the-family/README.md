# Document Expiry Tracker for the Family

A free **document expiry tracker** for everyone at home. Add each person's **passport, national ID card, visa or residence permit, work permit, driving licence, car insurance, car registration, car safety check, health and home insurance** (or anything else) with its expiry date, and the app shows **what to renew now**, **when to start renewing** the rest, and whether each passport has the **6 months** many countries want before they let you in. A **Travel check** tells you if every passport, visa, ID card and licence is good for your trip dates. Calendar reminders, copy and email, backup. Works offline, no sign-up, no ads.

**Live demo:** [umar8092.github.io/apps/document-expiry-tracker-for-the-family](https://umar8092.github.io/apps/document-expiry-tracker-for-the-family/)

| Desktop | On a phone |
|---|---|
| ![Document Expiry Tracker for the Family on a laptop: 2 documents to renew now, the car insurance expired 8 days ago and Aisha's passport expires Wed 3 Mar 2027 with 4 months left; the travel check on the right says 2 documents are not good for a trip until 20 Dec 2026](screenshots/desktop.png) | <img src="screenshots/phone.png" alt="Document Expiry Tracker for the Family on a phone: what needs renewing at the top, then Aisha's box with her passport marked Renew now and her visa marked Valid" width="220"> |

## The situation it solves

A family finds out at the airport that a child's passport expired, or that the car insurance lapsed last week. The papers live in different drawers, and nobody remembers the dates.

On Sunday 18 October 2026 the family adds:

- **Aisha:** passport (Pakistan) expiring 3 Mar 2027, and a UAE residence visa expiring 20 Aug 2027
- **Ali:** a driving licence that only shows **10/2026** (month and year)
- **Me:** a passport expiring 12 May 2031, and a national ID card that does not expire
- **Car:** car insurance that ended 10 Oct 2026, and the car safety check due 30 Jun 2027

The app answers:

- **What needs renewing:** *Car: Car insurance expired 8 days ago*, *Ali: Driving licence expires Sat 31 Oct 2026 (13 days left)*, *Aisha: Passport (Pakistan) expires Wed 3 Mar 2027 (4 months left)*. Aisha's passport is on the list because it has **less than 6 months left**, and many countries will not let her in with it.
- **My passport:** *Valid until Mon 12 May 2031 (4 years 6 months left). Start renewing on 12 Aug 2030* (9 months before, which keeps 6 months for travel).
- Ali applies for his new licence and taps **Applied for renewal**: it moves to *Waiting for the new one*. When it comes he taps **Renewed** and types the new date; the old one stays under *Earlier*.
- **Travel check**, coming back on 20 Dec 2026 with "6 months after I come back": *Renew first: Aisha, Passport (Pakistan) ends on 3 Mar 2027, only 2 months after you come back*, *Renew first: Ali, Driving licence ends on 31 Oct 2026, before you come back*, *OK: Me, Passport valid until 12 May 2031, 4 years 4 months after you come back*.

How the dates are counted: a document is valid up to and including its expiry date. A card that only shows a month and year is valid to the last day of that month (10/2026 means 31 Oct 2026). The reminder date is that long before the expiry (9 months before 3 Mar 2027 is 3 Jun 2026; 1 month before 31 Mar is 28 Feb).

## Features

- **Help button.** Tap **Help** at the top for a short how-to written for this app, and tap **All apps** to go back to the list.
- **What needs renewing** at the top: anything expired, inside its reminder time, or a passport with less than 6 months left, soonest first, with **Go to it** to jump to the document. Then *Waiting for the new one*, and the next document to renew when nothing needs doing.
- **Each person in their own box**, and each document in its own box inside it, the one that expires first at the top. Red is expired, orange is renew now, green is fine.
- **Document kinds** with sensible reminders: passport 9 months before, visa, residence and work permits 3 months, ID card and driving licence 2 months, insurance and car papers 1 month, travel insurance 2 weeks. Pick 2 weeks to 1 year, or **Other time** in weeks or months. **Something else** for any other document.
- **Expiry on a date, month and year only, or does not expire.**
- **Number, country or company, and notes (optional).** Numbers stay hidden until you tap **Show number**, and are left out of the copied and emailed list.
- **Applied for renewal** and **Renewed** (new date, old one kept under *Earlier*), **Edit**, **Delete** with **Undo**, **Rename** and **Remove** a person with **Undo**.
- **Travel check:** the day you come back and how long passports must last (6 months, 3 months for the Schengen area, or until you come back).
- **Calendar** on each document and **Add all reminders to my calendar**: a calendar file with an all-day event on the day to start renewing and on the expiry day (with a reminder a week before).
- **Copy** a document or a person, **Copy the list** and **Email the list** (email works without typing an address first).
- **Save a backup file**, **Restore a backup**, **Delete everything** with Undo. Damaged or blocked saved data is handled with a clear message.
- **Private.** Your documents stay in this browser on this device; your data is never sent anywhere.
- **Works offline and installable.** The days left update by themselves every day.
- **Back to all apps.** A "← All apps" button at the top of the page.
- **Light and dark mode switch.** It follows your device until you choose, and remembers your choice in every app.

## Run it yourself

No build step and no dependencies.

```bash
git clone https://github.com/umar8092/apps.git
```

Then open `document-expiry-tracker-for-the-family/index.html` in your browser.

Offline mode and install work best with the files served over `https` or `localhost` (for example `python3 -m http.server`).

## How it works

- `core.js` is the logic, with no page code. Dates are calendar dates (`2027-03-03`), so time zones and summer time never move an expiry. It works out each document's state, the reminder date, the 6-month passport warning, the travel check, the copy text and the calendar file, reads the form with plain error messages, and checks every saved or restored value.
- `script.js` builds the page. Names and notes are added as plain text, never as HTML. The list is saved in `localStorage` on the device.
- `sw.js` saves the app on your device for offline use (network first, so updates show at once).
- Run the logic checks with `node tests.js` (or open `test.html`), and the full page test with `node ui-test.js` (needs Playwright). The page test fixes "today" to 18 Oct 2026 and checks the exact answers above.

## License

[MIT](LICENSE). Free to use, copy, modify and share. Made by [Muhammad Umar](https://github.com/umar8092).
