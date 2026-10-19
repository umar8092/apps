# Electricity, Gas and Water Meter Reading Log

A free log for the numbers on your **electricity, gas and water meters**. Add each meter with its unit and the day it is read for your bill, then type the number on the meter every week or so. The app answers what people actually want to know before the bill arrives, in plain words: **"Used so far this bill period: 148 units"**, **"5 Oct to 19 Oct (14 days), 10.6 units a day"**, **"Units so far cost 1,720"**, **"By 5 Nov, at this rate: about 328 units, bill about 5,609.71"**, and, with a unit limit such as 200: **"To stay under 200 units: use at most 3.1 units a day"** and the day you will pass it. Price steps (slabs), a fixed charge and tax, meter changes, past bill periods with the change against last year, and a summary to copy or email. No sign-up, no ads, private on your device, works offline.

**Live demo:** [umar8092.github.io/apps/electricity-gas-and-water-meter-reading-log](https://umar8092.github.io/apps/electricity-gas-and-water-meter-reading-log/)

| Desktop | On a phone |
|---|---|
| ![Meter Reading Log on a laptop: the form to add another meter on the left; on the right the Electricity box says used so far this bill period 148 units, 5 Oct to 19 Oct, 10.6 units a day, units so far cost 1,720, by 5 Nov about 328 units, bill about 5,609.71, and to stay under 200 units use at most 3.1 units a day](screenshots/desktop.png) | <img src="screenshots/phone.png" alt="Meter Reading Log on a phone: the Electricity box with 148 units used so far, the forecast for 5 Nov, the 200 unit limit warning and the Add a reading form" width="220"> |

## The situation it solves

Bilal lives in Lahore. His electricity is read on the **5th of every month**, and if the household stays at **200 units or less** the bill stays on the cheaper rate. The price goes up in steps: the first 100 units cost **10** each, the next 100 cost **15**, and everything above 200 costs **22**, plus a fixed charge of **300** a bill. A heat wave started and the AC is on. It is Tuesday 20 October and he has no idea whether he is still under 200.

He added the meter once (unit "units", read on the 5th, three price steps, fixed charge 300, limit 200) and typed four readings: **8,000** on 5 September (from the September bill), **8,186** on 5 October (from the October bill), **8,236** on 12 October and **8,334** on 19 October. The box now says:

- **Used so far this bill period: 148 units.** 5 Oct to 19 Oct (14 days), **10.6 units a day**.
- **Units so far cost 1,720** (100 × 10 + 48 × 15).
- **By 5 Nov, at this rate: about 328 units, bill about 5,609.71** (units 5,309.71 + fixed charge 300). At 10.6 units a day for the 17 days left.
- **To stay under 200 units: use at most 3.1 units a day.** 52 units left for 17 days. At your usual 10.6 units a day you will pass it around **24 Oct**.
- **Past bill periods: 5 Sep to 5 Oct 2026: 186 units, 6.2 units a day, 2,590.**

So he knows today, not on 5 November, that the AC has to be cut back to stay under 200.

Worked examples from the tests (all checked by hand):

- 8,334 − 8,186 = **148 units** in 14 days = 10.57 a day; 148 + 17 × 10.571 = **327.7, shown as about 328**.
- Steps 100 at 10, 100 at 15, above at 22: 148 units = 1,000 + 720 = **1,720**; 327.714 units = 1,000 + 1,500 + 2,809.71 = **5,309.71**, plus 300 = **5,609.71**.
- Tick "Once you pass a step, every unit costs that step's price": 148 units all at 15 = **2,220**; 201 units all at 22 = **4,422**.
- One price of 25 with 17% tax and a 300 fixed charge on 100 units: 2,500 + 300 + 476 tax = **3,276**.
- A UK-style price of 0.2734 a kWh on 312.5 kWh = 85.4375, billed **85.44**; a daily standing charge of 0.53 over 31 days = **16.43**.
- Readings started on 10 Oct for a period that began on 1 Oct: 100 units in 10 days, so the 9 days before are estimated at 10 a day: **about 190 so far** and the box says "partly estimated".
- The meter was replaced: 99,998 on 5 Oct, then **2** on the new meter on 6 Oct (ticked as a new meter): no negative use, counting starts again.
- Readings can be typed as `8334`, `8,334`, `8.334,5`, `12 345` or `1,00,000`; a minus sign, words, 4 decimals, a future date, or a number lower than the reading before get a clear message that names the clashing reading. A reading that is far above your usual use asks you to check it and is saved on the second tap.

## Features

- **Help button** at the top with a how-to for this app, **All apps** to go back to the list, and a **Light / Dark** switch.
- **Each meter in its own box**: quick picks for **Electricity**, **Gas** and **Water**, any name, the unit (kWh, units, m³, ft³, 100 ft³, litres, gallons or your own) and the day it is **Read for the bill on** (the 31st means the last day in short months). Day and night rates or two flats are simply two meters.
- **Add a reading** with the date and the number; the last reading is shown so you know where you left off. **+ New meter, or the meter went back to 0?** starts counting again without a negative jump.
- **The answers**: units used so far this bill period, the days and the use per day, the cost of the units so far, and the units and bill expected by the next reading day. Between readings the use is spread evenly; anything estimated is labelled.
- **Optional price** behind **+ Add the price to see the bill (optional)**: one price for every unit, or **price steps (slabs)** with any number of steps and the option to charge every unit at the top step's price; **+ Add a fixed charge** (once a bill or every day) and **+ Add tax** in %.
- **Optional unit limit** behind **+ Add a unit limit for each bill (optional)**: how many units a day you can still use, the day you will pass it at this rate, or how far over it you are.
- **Readings list** with the units used and the use per day since the reading before, **Edit** and **Delete** with **Undo**.
- **Past bill periods** with units, use per day, the bill at today's price and the change against the same period a year before ("part" when your readings covered only some of its days).
- **Copy summary** and **Email** (no address needed) with the numbers and the readings, for the supplier, a landlord or a housemate.
- **Edit meter**, **Delete meter** with Undo, **Currency symbol** (none, Rs, ₹, $, €, £ and more, remembered), **Save a backup file** and **Restore a backup** (checked, with Undo), **Delete everything** with Undo.
- Private: no account and your data is never sent anywhere. Works offline once loaded, and can be installed on the home screen.

## Run it yourself

```
git clone https://github.com/umar8092/apps.git
```

Then open `electricity-gas-and-water-meter-reading-log/index.html` in a browser. No build step and no dependencies.

Tests: `node electricity-gas-and-water-meter-reading-log/tests.js` checks the maths and the wording (or open `test.html`), and `node electricity-gas-and-water-meter-reading-log/ui-test.js` drives the page in headless Chromium at 11 screen widths (needs Playwright and a local server in the repo root, for example `python3 -m http.server 8765`).

## How it works

Plain HTML, CSS and JavaScript. The maths lives in `core.js`. Readings and units are kept in thousandths (8,334.5 = 8334500), prices in ten-thousandths and money in whole cents, so sums are exact and each bill is rounded once to the nearest cent. The readings of a meter form runs, and a reading marked as a new meter starts a new run. Use between two days is the interpolated difference along each run, so a bill period that starts between two readings gets its share of the use spread evenly over the days. The use per day is this bill period's once it has a week of readings, otherwise the last 30 days of readings; the forecast is the use so far plus that rate for the days left. Price steps are charged step by step (or every unit at the top step's price), then the fixed charge and tax are added. Everything is saved in this browser's `localStorage` and checked when loaded or restored; a network-first service worker keeps the app working offline.

## License

MIT, see [LICENSE](LICENSE).
