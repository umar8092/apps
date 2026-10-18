# Blood Sugar Log for Diabetes

A free **blood sugar log for people with diabetes who check at home** with a finger-prick meter: type 2, type 1, gestational diabetes, or a family member looking after a parent. Type the number from your meter (in **mg/dL or mmol/L**, or HI and LO) and tap **when you checked**: fasting, before a meal, 1 or 2 hours after a meal, bedtime, night or other. The app shows **how many readings are in your target range**, **your average for each time of day** ("Fasting average 129 mg/dL, 3 of 7 above target"), your lows and very high readings with what to do, a chart, and lets you **print a log book table, email, copy or download** the readings for your doctor. General adult targets (ADA), pregnancy targets, or your doctor's own. No sign-up, no ads, private on your device, works offline.

**Live demo:** [umar8092.github.io/apps/blood-sugar-log-for-diabetes](https://umar8092.github.io/apps/blood-sugar-log-for-diabetes/)

| Desktop | On a phone |
|---|---|
| ![Blood Sugar Log for Diabetes on a laptop: 47% in target, 7 of 15 readings over 7 days, fasting average 129 mg/dL with 3 above target, before a meal 64 mg/dL low, 2 hours after a meal 183 mg/dL with 4 above target, a low-reading warning, a chart and the readings day by day](screenshots/desktop.png) | <img src="screenshots/phone.png" alt="Blood Sugar Log for Diabetes on a phone showing 47% in target, the low warning and the averages by time of day" width="220"> |

## The situation it solves

Tariq has type 2 diabetes and has just started a new tablet. His doctor says: *"Check your sugar every morning before breakfast and 2 hours after dinner, and bring me your readings in a week."* He writes numbers on the back of an envelope, forgets which were after dinner, and cannot tell if they are getting better.

With the app, after each finger-prick Tariq types **142**, taps **Fasting** and **Save reading**. The message says straight away *"Saved 142 mg/dL, fasting (on waking), at 07:15: above target (80 to 130 mg/dL)"*. One day he feels shaky before lunch and types **64**: the app says it is **low** and what to do (15 g of fast sugar, check again in 15 minutes). After a week the top of the screen answers the doctor's question:

- **47% in target**: 7 of 15 readings in your target ranges, over 7 days, Mon, 12 Oct to Sun, 18 Oct 2026.
- **Fasting (on waking): 129 mg/dL**, target 80 to 130 mg/dL, 7 readings, 3 above target.
- **Before a meal: 64 mg/dL**, 1 reading, 1 below target or low.
- **2 hours after a meal: 183 mg/dL**, target under 180 mg/dL, 7 readings, 4 above target.
- A yellow box: *"1 low reading (under 70): 64 mg/dL on Fri, 16 Oct, 12:40. Tell your doctor about lows: your medicine may need changing."*

He taps **Print or save as PDF** for a summary and a log book table (one row per day, a column for each time of day, like the paper diaries clinics hand out), or **Email** to send it to the clinic (the mail app opens with no address needed).

Worked examples from the tests (all checked by hand):

- Fasting readings 142, 136, 131, 128, 125, 122 and 118 add up to 902; 902 / 7 = 128.86, shown as **129 mg/dL**. 142, 136 and 131 are over 130, so **3 of 7 above target**.
- After-dinner readings 210, 195, 188, 176, 169, 182 and 160 add up to 1280; 1280 / 7 = 182.86, shown as **183 mg/dL**; 210, 195, 188 and 182 are over 180, so **4 above target**.
- 7 of the 15 readings are in target: 7 / 15 = 46.7%, shown as **47%**. The average of all 15 is 2246 / 15 = 149.73, shown as **150**.
- In mmol/L the same week shows fasting **7.2** (128.86 / 18.016 = 7.15) and after dinner **10.1** (182.86 / 18.016 = 10.149).
- 130 mg/dL is 7.2 mmol/L, 180 is 10.0, 70 is 3.9 and 54 is 3.0. A reading of 4.4 mmol/L counts as in a target shown as 4.4 to 7.2, because the app judges each reading on the numbers it shows you.
- Typing **7.2** while the app is set to mg/dL says *"7.2 looks like mmol/L ... Is your meter in mmol/L?"* with a **Save as 7.2 mmol/L** button; typing **130** in mmol/L offers **Save as 130 mg/dL**.
- **HI** counts as very high and **LO** as very low; both are listed and counted but not put into the averages.
- A reading at 02:30 on Saturday counts with **Friday** (readings before 4 a.m. belong to the day before).

## Features

- **Help button** at the top with a how-to for this app, **All apps** to go back to the list, and a **Light / Dark** switch.
- **Quick entry:** one big box, then tap when you checked. Enter saves. Commas work as decimals (7,2), the unit can be typed after the number ("7.2 mmol/L"), and HI or LO is accepted. A short note (food, medicine, exercise) is optional (**+ Add a note (optional)** stays open once used). **Change time** logs a reading you forgot (future times are refused).
- **Your results** for the last 7, 14, 30 or 90 days, all readings, or dates you choose: percent in target, **average by time of day** with each target and how many were above or below, average of all, highest, lowest, number of lows, and a chart with the fasting target band and the low line.
- **Clear meanings:** In target, Above target, Below target, **Low** (under 70 mg/dL / 3.9 mmol/L), **Very low** (under 54 / 3.0) and **Very high** (250 / 13.9 or more), with what to do for lows and very high readings. You can type **your own low-sugar plan** from your doctor to show instead.
- **Targets:** general targets for adults (ADA: 80 to 130 fasting and before meals, under 180 after meals, 90 to 150 at bedtime), pregnancy with diabetes (ADA: under 95 fasting, under 140 one hour and under 120 two hours after a meal), or **your doctor's own** for each time of day.
- **mg/dL or mmol/L** for each person. Every reading is kept exactly as typed, so switching never changes your data.
- **Readings list** by day, each reading in its own box with its result; **Edit** (Escape cancels) and **Delete** with **Undo**.
- **Share with your doctor:** Print or save as PDF (summary and log book table), Email, Copy as text, Download spreadsheet (CSV for Excel, Numbers or Google Sheets).
- **More than one person** on one device, each with their own readings, unit and targets.
- **Backup file** and **Restore** (checked, with Undo), **Delete all readings** with Undo.
- Private: no account and your data is never sent anywhere. Works offline once loaded, and can be installed on the home screen.

Not medical advice: follow your doctor's advice and targets.

## Run it yourself

```
git clone https://github.com/umar8092/apps.git
```

Then open `blood-sugar-log-for-diabetes/index.html` in a browser. No build step and no dependencies.

Tests: `node blood-sugar-log-for-diabetes/tests.js` checks the maths (or open `test.html`), and `node blood-sugar-log-for-diabetes/ui-test.js` drives the page in headless Chromium (needs Playwright).

## How it works

Plain HTML, CSS and JavaScript. The maths lives in `core.js`. Each reading is stored with the number and unit exactly as typed and the wall-clock time it was taken (`2026-10-16T12:40`), so time zones and summer time never move a reading to another day. Readings are converted only for showing (1 mmol/L = 18.016 mg/dL; mg/dL shown as whole numbers, mmol/L with one decimal, 0.5 rounds up), and each reading is judged against its target on the numbers shown, so the label always agrees with what you see. Readings are saved in this browser's `localStorage`; a network-first service worker keeps the app working offline.

## License

MIT, see [LICENSE](LICENSE).
