# Symptom and Pain Diary for Doctor Visits

A free **symptom and pain diary for people with migraine, headaches, back pain, stomach pain (IBS) or any problem that comes and goes**, for the moment the doctor asks *"how often does it happen, how bad is it, and does the medicine help?"*. Log each episode in a few taps: when it started, whether it has stopped, how bad it was (0 to 10), possible triggers and what you took. The app answers the doctor's questions: **how many days a month** you had it compared with the month before, the average pain, how long it usually lasts, **which medicine helped how often**, how many days you took medicine, the **most common triggers** and a colour-coded calendar. Then **print, email, copy or download** it for your appointment. Each symptom keeps its own diary. No sign-up, no ads, private on your device, works offline.

**Live demo:** [umar8092.github.io/apps/symptom-and-pain-diary-for-doctor-visits](https://umar8092.github.io/apps/symptom-and-pain-diary-for-doctor-visits/)

| Desktop | On a phone |
|---|---|
| ![Symptom and Pain Diary on a laptop: a migraine still going since 08:15 with "It stopped now", the form to log an episode, and the summary for the doctor: 8 of 30 days with migraine, 9 in the 30 days before, 6 episodes, average pain 6/10, usually lasts 10 h 48 min, what helped and the most common triggers](screenshots/desktop.png) | <img src="screenshots/phone.png" alt="Symptom and Pain Diary on a phone showing the summary for the doctor: 8 of 30 days with migraine, 6 episodes, average pain 6/10, ibuprofen helped 2 of 5 times, sumatriptan 2 of 2" width="220"> |

## The situation it solves

Sara gets migraines. Her doctor says: *"Keep a headache diary for a month: every attack, how bad, how long, what you took and whether it worked. Then we decide about a preventive."* On paper she forgets half of them, and at the appointment she can only say "quite often, I think".

With the app, when a migraine starts she taps **Migraine**, **Now**, **Still going**, pain **6**, ticks **Short or poor sleep** and adds **Ibuprofen 400 mg**, then **Save episode**. It shows in **Still going**; when it is over she picks whether the ibuprofen helped and taps **It stopped now**. For one she forgot, she taps **Earlier: choose**, picks the date and time and **It has stopped**, **4 h**.

After a month the **Summary for your doctor** answers every question:

- **8 of 30 days with migraine in the last 30 days.** In the 30 days before: 9 days, so 1 fewer now.
- **6 episodes**, average pain **6/10** (worst 8/10), usually lasts **10 h 48 min**, longest **1 day 2 h**.
- **Ibuprofen 400 mg: helped 2 of 5 times** (helped a bit 1, did not help 1, not noted 1). **Sumatriptan 50 mg: helped 2 of 2 times.**
- Medicine taken on **6 days of 30**.
- Most often after: **Short or poor sleep (4 of 6)**, Stress (2 of 6).

She taps **Print or save as PDF** for a page with the summary and a table of every episode, or **Email** (the mail app opens with no address needed).

Worked examples from the tests (all checked by hand):

- A migraine from **Sat 3 Oct 22:00 to Sun 4 Oct 06:00** lasts **8 h** and counts on **both days**; one that ends at exactly midnight counts on one day only. Two episodes on the same day count as one day.
- Sara's 8 days are 28 Sep, 3 Oct, 4 Oct, 9 Oct, 15 Oct, 16 Oct, 21 Oct and today (still going). The 30 days before (26 Aug to 24 Sep) had 9.
- Average pain: (7 + 6 + 4 + 8 + 5 + 6) / 6 = **6**. Usually lasts: the 5 stopped episodes, (720 + 480 + 210 + 1560 + 270) / 5 = 648 minutes = **10 h 48 min**; the one still going is left out of it.
- Average pain is rounded to one decimal, half up: 13 / 4 = 3.25 shows as **3.3**.
- An episode from 24 Sep 20:00 to 25 Sep 02:00 counts **one day in each period**, not two in either.
- Pain medicine on **10 days** in the last 30 shows a note about medication overuse headache; 9 days does not, and 10 days over 90 days (about 3 a month) does not.
- Typing a stop time before the start says *"It must stop after it started (Sat 24 Oct, 09:00)."*; a start in the future, a stop in the future, an episode longer than 31 days and a missing pain score are each refused with a plain message.

## Features

- **Help button** at the top with a how-to for this app, **All apps** to go back to the list, and a **Light / Dark** switch.
- **Any symptom:** Migraine, Headache, Back pain, Stomach pain, Period pain, Joint pain, or your own. Each one has **its own diary, its own trigger list and its own places it can hurt**, and you switch with a tap at the top.
- **Quick logging:** start **Now**, 30 min, 1 h or 2 h ago, or choose; **Still going** or **It has stopped** with how long (Until now, 30 min up to 2 days, or choose the end time); pain 0 to 10 with colours; tap triggers or **add your own**; add one or more medicines with **Did it help?**; where it hurt and a note are optional.
- **Still going** box with the time so far, **Did it help?** and **It stopped now**.
- **Summary for your doctor** for the last 30 days, this month, last month, the last 90 days or all entries: days with it out of the days in the period and the period before, episodes, average and worst pain, usual and longest length, **what helped**, medicine days with a **medication overuse** note at 10 or more days a month, most common triggers, and a **calendar** coloured by the worst pain each day with a dot for medicine days.
- **Episodes** list by month, each in its own box, with **Edit** (Escape or Cancel editing leaves it as it was) and **Delete** with **Undo**.
- **Share with your doctor:** Print or save as PDF (summary and table), Email, Copy as text, Download spreadsheet (CSV, safe to open in Excel).
- Rename a symptom, take triggers off its list (past episodes keep them), remove a symptom with Undo.
- **Backup file** and **Restore** (checked, with Undo), **Delete the whole diary** with Undo. If the browser blocks saving, a warning says so and the app still works for the visit.
- Private: no account and your data is never sent anywhere. Works offline once loaded, and can be installed on the home screen.

Not medical advice: follow your doctor's advice. The questions at the bottom of the app list when to get help straight away.

## Run it yourself

```
git clone https://github.com/umar8092/apps.git
```

Then open `symptom-and-pain-diary-for-doctor-visits/index.html` in a browser. No build step and no dependencies.

Tests: `node symptom-and-pain-diary-for-doctor-visits/tests.js` checks the maths (or open `test.html`), and `node symptom-and-pain-diary-for-doctor-visits/ui-test.js` drives the page in headless Chromium (needs Playwright).

## How it works

Plain HTML, CSS and JavaScript. The maths lives in `core.js`: each episode is stored with wall-clock stamps (`2026-10-03T22:00`) and all arithmetic is in whole minutes on those stamps, so summer time and time zones never move an episode to another day. A day counts when any episode touched it; medicine days are the days episodes with a medicine started. Saved and restored data is checked entry by entry and anything that does not fit is left out. The diary is kept in this browser's `localStorage`; a network-first service worker keeps the app working offline.

## License

MIT, see [LICENSE](LICENSE).
