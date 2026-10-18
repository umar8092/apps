# Job Application Tracker for Job Seekers

A free **job application tracker** for anyone looking for work. Add every job you apply for (or want to apply for), and the app tells you **who to follow up with today**, **when your next interview is**, **which adverts close soon** and **how many jobs you applied for this week** against your weekly goal. Move each job through **Applied, Heard back, Interview, Offer, Rejected, No reply** with one tap, keep each interview's date, time and what to prepare, and copy or print a **dated job search record** for the job centre or benefits office. No sign-up, no ads, private on your device, works offline.

**Live demo:** [umar8092.github.io/apps/job-application-tracker-for-job-seekers](https://umar8092.github.io/apps/job-application-tracker-for-job-seekers/)

| Desktop | On a phone |
|---|---|
| ![Job Application Tracker on a laptop: Today lists Bright Kids Nursery (offer, give them your answer), Crown Logistics and Acme Ltd to follow up with, and Gamma Foods closing on Tue 20 Oct; the coming interview Thu 22 Oct at 10:00 with Beta Ltd; This week 5 of 10 applications; on the right the job search record for Amira Khan from Mon 12 to Sun 18 Oct](screenshots/desktop.png) | <img src="screenshots/phone.png" alt="Job Application Tracker on a phone: Today, needs you today: Bright Kids Nursery offer, follow up with Crown Logistics (applied 34 days ago) and Acme Ltd (applied 10 days ago), apply to Gamma Foods by Tue 20 Oct, coming interview Thu 22 Oct at 10:00 with Beta Ltd, this week 5 of 10 applications" width="220"> |

## The situation it solves

Amira lost her job and applies for about ten jobs a week. After a month she has eleven applications in emails, browser tabs and a notebook. She cannot remember who she has chased, she nearly missed a closing date, and the job centre wants to see what she did this week. On **Sunday 18 October 2026** she adds them:

- Acme Ltd, Sales Assistant, applied Thu 8 Oct on Indeed, no reply
- Beta Ltd, Customer Service Advisor, applied Mon 5 Oct, heard back Mon 12 Oct, video interview Thu 22 Oct at 10:00 ("Prepare: a time I calmed an angry customer")
- Gamma Foods, Warehouse Operative, not applied yet, advert closes Tue 20 Oct
- Delta Bank (Mon 12 Oct), Northside Council (Tue 13 Oct, in person at the job centre), Omega Retail (Wed 14 Oct), Pine Hotel (Fri 16 Oct), River Clinic (Sat 17 Oct), all no reply yet
- Crown Logistics, applied Mon 14 Sep, never heard back
- Bright Kids Nursery, interviewed Fri 9 Oct, **offer on Fri 16 Oct**
- Star Cafe, rejected on Fri 9 Oct

With "Follow up when I hear nothing for: 1 week" and a weekly goal of 10, the app answers:

- **Needs you today:** Bright Kids Nursery: **Offer Fri 16 Oct: give them your answer**. Crown Logistics: **follow up, applied 34 days ago, no reply** (with a hint to set it to "No reply"). Acme Ltd: **follow up, applied 10 days ago, no reply**. Gamma Foods: **Apply by Tue 20 Oct (the advert closes in 2 days)**.
- **Coming interview: Thu 22 Oct at 10:00: Beta Ltd (Video)**, with **Add to calendar** (reminders the day before and 1 hour before).
- **This week: 5 of 10 applications** (Mon 12 Oct to Sun 18 Oct), **5 to go to reach your goal**. **Sent 10 applications, heard back from 3 (30%).**
- Delta Bank's box: **Follow up Mon 19 Oct (tomorrow) if you hear nothing**.

She emails Acme and taps **Followed up**: **Follow up Sun 25 Oct (in 7 days) if you hear nothing**. Under **Job search record** for this week she copies:

```
Job search record for Amira Khan: Mon 12 Oct 2026 to Sun 18 Oct 2026
5 applications, 0 interviews, 1 follow-up

Mon 12 Oct 2026
- Applied: Admin Assistant, Delta Bank (found on Indeed). Now: Applied.

Tue 13 Oct 2026
- Applied: Receptionist, Northside Council (found on Job centre, applied in person). Now: Applied.
...
Sun 18 Oct 2026
- Followed up: Sales Assistant, Acme Ltd.
```

How follow-ups are counted: the next follow-up is the last news plus your number of days. The last news is the latest of the day you applied, the day the stage changed (they replied), your last follow-up and your last interview. Applied Thu 8 Oct with 1 week means follow up Thu 15 Oct; from then on the job stays under "Needs you today" until you follow up or the stage changes. A coming interview or your own follow-up day replaces the automatic date.

## Features

- **Help button.** Tap **Help** at the top for a short how-to written for this app, and tap **All apps** to go back to the list.
- **Today** at the top: **Needs you today** (follow-ups due, offers, interviews today or tomorrow, adverts closing within 3 days), **Coming interviews**, **This week** with a progress bar to your weekly goal, and how many replied. Tap a line to jump to the job.
- **Each job in its own box** with its stage, when you applied, where you found it, what to do next, its interviews and notes, sorted with what needs you first. Change the **Stage** right in the box; **Followed up**, **+ Interview** and **Edit** buttons.
- **Stage buttons with counts** (Active, Want to apply, Applied, Heard back, Interview, Offer, Closed, All) and a search box once you have 6 or more jobs.
- **Several interviews per job**, each with date, time, type (phone, video, in person, test) and what to prepare, and an **Add to calendar** file for each.
- **Paste from a job advert:** paste "Sales Assistant - Acme Ltd | LinkedIn" or a link and the company, job title, link and website are filled in.
- **Same company twice?** A note warns you before you apply for the same job again.
- **Want to apply** with the **advert closing date**, so you never miss one.
- Optional **link, salary, how you applied, contact person, notes** and **your own follow-up day**, each behind a "+ Add" button so nothing is forced.
- **Job search record** for any dates (this week, last week, 2 or 4 weeks, everything) with your name, to **copy**, **email** (works without typing an address) or **print**, and **Save as a spreadsheet** (CSV for Excel or Google Sheets).
- **Settings:** follow up after 3 days to 3 weeks or any number from 1 to 60, weekly goal, and the day your week starts.
- **Delete** with Undo, **Undo** after every change, **Save a backup file**, **Restore a backup**, **Delete everything** with Undo. Damaged or blocked saved data is handled with a clear message.
- **Private.** Your applications stay in this browser on this device; your data is never sent anywhere.
- **Works offline and installable.** The dates update by themselves every day.
- **Back to all apps.** A "← All apps" button at the top of the page.
- **Light and dark mode switch.** It follows your device until you choose, and remembers your choice in every app.

## Run it yourself

No build step and no dependencies.

```bash
git clone https://github.com/umar8092/apps.git
```

Then open `job-application-tracker-for-job-seekers/index.html` in your browser.

Offline mode and install work best with the files served over `https` or `localhost` (for example `python3 -m http.server`).

## How it works

- `core.js` is the logic, with no page code. Dates are calendar dates (`2026-10-18`), so time zones and summer time never move a date. It works out each job's next step (follow-up, interview, closing date, offer), the summary and the week, sorts and filters the jobs, warns about duplicates, reads pasted adverts, reads the form with plain error messages, and makes the job search record, the spreadsheet and the interview calendar files. It checks every saved or restored value.
- `script.js` builds the page. Company names, job titles and notes are added as plain text, never as HTML. Everything is saved in `localStorage` on the device.
- `sw.js` saves the app on your device for offline use (network first, so updates show at once).
- Run the logic checks with `node tests.js` (or open `test.html`), and the full page test with `node ui-test.js` (needs Playwright). The page test fixes "today" to Sun 18 Oct 2026 and checks the exact answers above.

## License

[MIT](LICENSE). Free to use, copy, modify and share. Made by [Muhammad Umar](https://github.com/umar8092).
