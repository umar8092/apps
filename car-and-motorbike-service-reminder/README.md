# Car and Motorbike Service Reminder

A free service reminder for **car and motorbike owners** who forget when the engine oil was last changed and only find out at the workshop that they are "2,000 km over". Each vehicle has its own box, and each service (engine oil, air filter, brakes, tyres, chain, spark plugs, token tax, insurance, MOT or anything else) has its own **"every so many km or miles, or every so many months, whichever comes first"**. Type the odometer now and then, and the app answers in plain words: **"Engine oil and oil filter: due in 640 km or by Thu 10 Dec 2026, whichever comes first. Watch for 45,850 km on the odometer."** Tap **Done** when the work is done (early is fine), keep what you paid, and copy a list for the mechanic. No sign-up, no ads, private on your device, works offline.

**Live demo:** [umar8092.github.io/apps/car-and-motorbike-service-reminder](https://umar8092.github.io/apps/car-and-motorbike-service-reminder/)

| Desktop | On a phone |
|---|---|
| ![Car and Motorbike Service Reminder on a laptop: What needs doing lists Honda City engine oil overdue by 50 km, air filter due in 100 km or by 1 Dec 2026 and insurance due by 1 Nov 2026; below, the Honda City box with its odometer and each service in its own coloured box; on the right the Add a service form for brake pads with every 10000 km or every 12 months and the preview due in 2,100 km or by 14 Feb 2027](screenshots/desktop.png) | <img src="screenshots/phone.png" alt="Car and Motorbike Service Reminder on a phone: What needs doing with the overdue engine oil and two services due soon, the next service for the motorbike, and the Honda City box with Odometer now and Save reading" width="220"> |

## The situation it solves

Bilal drives a **Honda City** and rides a **Honda CD 70** motorbike to work. He never remembers when the oil was changed, the insurance renewal sneaks up on him, and at the workshop he cannot say what else is due.

On **Fri 23 Oct 2026** he adds:

- **Honda City**, odometer **45,210 km**. **Engine oil and oil filter**, every **5,000 km or 6 months** (filled in for him), last done **10 Jun 2026 at 40,850 km** → due at 45,850 km or on 10 Dec 2026. **Due in 640 km or by Thu 10 Dec 2026 (in 6 weeks), whichever comes first.**
- **Air filter**, every 15,000 km or 12 months, last done 1 Dec 2025 at 31,000 km → **due in 790 km** (Due soon).
- **Insurance renewal**, every 12 months (no km), last done 1 Nov 2025 → **Due by Sun 1 Nov 2026 (in 9 days)** (Due soon).
- **My bike** (motorbike), odometer 12,000 km. **Engine oil**, every **1,000 km or 3 months**, last done 20 Aug 2026 at 11,050 km → **due in 50 km or by Fri 20 Nov 2026**.

He types **45,900** under **Odometer now** a few days later: the oil is now **"Overdue by 50 km"** and goes to the top of **What needs doing**. At the workshop he taps **Copy for the mechanic** and sends:

```
Honda City (odometer 45,900 km on 23 Oct 2026)
- Engine oil and oil filter: overdue by 50 km
- Air filter: due in 100 km or by Tue 1 Dec 2026 (in 5 weeks), whichever comes first
- Insurance renewal: due by Sun 1 Nov 2026 (in 9 days)
```

He taps **Done** on the oil at 45,900 km and adds the cost **3,500**: it now says **"Due in 5,000 km or by Fri 23 Apr 2027 (in 6 months)"**, and the Honda City box shows **"Spent on services: 3,500 this year"**.

More cases it handles:

- **The car hardly moves.** Oil done 1 Mar 2026 at 40,850 km, only 150 km driven since: **"Overdue by 7 weeks"** (it was due on 1 Sep), even with 4,850 km to spare.
- **After two readings a week apart**, it learns how far you drive (44,440 km on 1 Oct to 45,210 km on 23 Oct = **35 km a day**) and adds: **"About 11 Nov at your usual 35 km a day, so the distance will come first."**
- **The odometer was replaced or reset.** Typing 300 after 48,210 asks first; choose **The meter was replaced or reset** and the km left stay right.
- **Done early** counts the next one from that day and reading.

## Features

- **Each vehicle in its own box** with its own km or miles, car or motorbike services, and odometer.
- **Each service its own interval**: every N km/miles, every N months or weeks, or both (whichever comes first). Usual numbers are filled in for every service and can be changed; **Something else** for anything not on the list.
- **Clear status**: Overdue (red), Due now and Due soon (orange), OK (green), with the odometer reading to watch for.
- **What needs doing** across all vehicles, most urgent first, plus the next service due and a nudge when the odometer has not been updated for 2 weeks.
- **Done** with the day, the reading and an optional cost and workshop (behind **+ Add cost or workshop (optional)**); **Past services** keeps every one, and each vehicle shows what was spent this year and in all.
- **Copy for the mechanic**, **Copy the list**, **Email the list** (works without typing an address), and **Calendar** files (.ics) for the date-based due days.
- **Currency symbol** for costs (none, Rs, ₹, $, €, £ and more), remembered.
- **Edit**, **Delete** and **Remove** with **Undo**; edit a vehicle's name, type or unit.
- **Save a backup file** and **Restore a backup**; **Delete everything** with Undo.
- **Help** button with step-by-step instructions, **← All apps** back button, and a **Light/Dark mode** switch.
- Works offline once loaded, installable, private: your data is never sent anywhere.

## Run it yourself

```
git clone https://github.com/umar8092/apps.git
```

Then open `car-and-motorbike-service-reminder/index.html` in a browser. No build step.

## How it works

Plain HTML, CSS and JavaScript. `core.js` holds the logic and `script.js` the page. Distances are whole km or miles; each odometer reading stores what the meter showed plus an offset that only changes when the meter is replaced, so the distance keeps counting. A service is due at "last done reading + interval" or on "last done date + months or weeks" (31 Aug + 6 months = 28 Feb), whichever comes first. Due soon means within 10% of the distance (at least 100) or within 7 to 30 days. Costs are whole cents. Everything is saved in `localStorage` under keys starting with `car-and-motorbike-service-reminder.`, and a network-first service worker keeps the app working offline. `tests.js` (`node tests.js` or `test.html`) checks the logic with hand-worked answers; `ui-test.js` drives the real page.

## License

MIT, see [LICENSE](LICENSE).
