# Lab Test Results Tracker

A free **tracker for blood and lab test results, for anyone who gets tests every few months or once a year** (diabetes, cholesterol, thyroid, kidney, vitamin D, iron) and keeps the reports on loose paper or PDFs from different labs. Type the results from each report with the **normal range printed next to them**, and the app answers the question a new doctor asks, *"what was your HbA1c last time?"*: the **latest result of every test, how it changed since the test before, and which results are outside the range (in red)**, with a chart per test. Labs that print mg/dL and labs that print mmol/L can be mixed. **Print, email or copy** a one-page summary for the appointment. No sign-up, no ads, private on your device, works offline.

**Live demo:** [umar8092.github.io/apps/lab-test-results-tracker](https://umar8092.github.io/apps/lab-test-results-tracker/)

| Desktop | On a phone |
|---|---|
| ![Lab Test Results Tracker on a laptop: the form to add results from a report on the left, and on the right "3 of 6 latest results are outside the normal range: HbA1c, Fasting blood sugar, LDL cholesterol" with each test's latest result in red or green and the change since last time, and sharing buttons below](screenshots/desktop.png) | <img src="screenshots/phone.png" alt="Lab Test Results Tracker on a phone showing the latest results: HbA1c 6.4 % above the range, down 0.7, fasting blood sugar 112 mg/dL above the range, LDL 118 mg/dL above the range, then HDL, vitamin D and TSH in the range" width="220"> |

## The situation it solves

Sara has type 2 diabetes. Every six months she has blood tests, sometimes at the hospital lab and sometimes at a lab near home, and each one prints different units and slightly different normal ranges. At a new clinic the doctor asks: *"Is your HbA1c going down? And your cholesterol?"* The reports are in a drawer at home.

With the app she taps **HbA1c**, **Fasting sugar**, **LDL** and **Vitamin D** once to put them on her list. For each report she sets **Date of the test**, types each result next to its test (as printed: `7.1`, `6,4`, `<5`), and taps **Save results**. Each row shows the range it will use (*"Normal range: 4.0–5.6 %"*) and **Change range** takes the one printed on this report. The message says straight away:

> Saved 4 results for 3 Apr 2026.
> HbA1c (3-month sugar average): 7.1 %, above the range (4.0–5.6 %).
> Vitamin D (25-OH): 14 ng/mL, below the range (30–100 ng/mL).

After the October report, **Latest results** answers the doctor:

- **3 of 6 latest results are outside the normal range: HbA1c, Fasting blood sugar, LDL cholesterol.**
- HbA1c's box: **6.4 % on 12 Oct 2026, down 0.7 from 7.1 % on 3 Apr 2026. Above the range (4.0–5.6).**
- The October vitamin D came from the hospital lab as **80 nmol/L** (range 75–250 nmol/L). The box shows it as **32 ng/mL, up 18 from 14 ng/mL**, and *In the range*, judged by the hospital's own range.

She taps **Print or save as PDF** for a one-page table of the latest results and every result, or **Email** (the mail app opens, no address needed).

Worked examples from the tests (all checked by hand):

- 6.4 − 7.1 = −0.7, shown as **down 0.7**. 0.3 − 0.1 shows **0.2**, never 0.19999.
- Vitamin D 80 nmol/L ÷ 2.496 = 32.05, shown as **32 ng/mL**; 32 − 14 = **up 18**.
- HbA1c 42 mmol/mol ÷ 10.929 + 2.15 = 5.99, shown as **6.0 %**; 48 mmol/mol is **6.5 %**.
- Fasting sugar 112 mg/dL ÷ 18 = **6.2 mmol/L**, 132 mg/dL = **7.3 mmol/L**, so **down 1.1**.
- Total cholesterol 5.2 mmol/L × 38.67 = **201 mg/dL**.
- A range of **70–99**: 70 and 99 are in the range, 100 is above it. A range of **<200**: 199 is in, 200 is above. **>40**: 40 is below. **≥60**: 60 is in.
- `<5` with a range of 5–10 is **below the range**; `<3` with a range of <5 is **in the range**; a `<` or `>` result gives no change number, it says *"was 12 mg/L on ..."* instead.

## Features

- **Help button** at the top with a how-to for this app, **All apps** to go back to the list, and a **Light / Dark** switch.
- **Your own list of tests:** one tap on common tests (HbA1c, fasting sugar, total cholesterol, LDL, HDL, triglycerides, TSH, vitamin D, B12, creatinine, haemoglobin) or 23 tests grouped in **All tests** (diabetes, cholesterol, thyroid, kidneys, vitamins and iron, blood count, liver and more), each with the units labs print and a typical adult range. **Other test** takes any name, unit and range.
- **One form per report:** one date for the whole report, a box for each test, empty boxes skipped, Enter saves, optional lab name (**+ Add lab name (optional)**, remembered). Future dates, letters, negative values for list tests and impossible sizes are refused with a clear message on that row, and nothing is lost.
- **A range for every result**, as printed on its own report: `70-99`, `4.0 to 5.6`, `<200`, `>40`, `>=60`, comma decimals. The next report suggests the last range used in that unit.
- **Units:** mg/dL or mmol/L, % or mmol/mol, ng/mL or nmol/L, g/dL or g/L and more, per result. **Edit test** chooses the unit a test is shown in; change and chart are converted.
- **Latest results** with a headline that names the tests outside the range, red for outside, green for inside, and the change since last time.
- **A box for every test** with the latest result, the plain sentence, a chart over time with the normal range shaded and red dots outside it, and every result with **Edit** and **Delete** (**Show all** for long lists).
- **Undo** after saving, editing, deleting, removing a test, deleting everything and restoring.
- **Share:** print or save as PDF, email, copy as text, or download a spreadsheet (CSV).
- **Family:** **+ Add another person**, each with their own tests and results.
- **Backup file** and restore (checked before anything is replaced). Handles blocked or damaged storage without crashing.
- Private: results stay in your browser, your data is never sent anywhere, works offline once loaded, installable. Not medical advice.

## Run it yourself

```
git clone https://github.com/umar8092/apps.git
```

Then open `lab-test-results-tracker/index.html` in a browser. No build step. `node lab-test-results-tracker/tests.js` runs the logic checks (or open `test.html`), and `node lab-test-results-tracker/ui-test.js` drives the page in headless Chromium (needs Playwright).

## How it works

Plain HTML, CSS and JavaScript. `core.js` holds the test list, unit conversions, number and range parsing, the in-range check and the sentences, and is tested by `tests.js`; `script.js` draws the page. Every result is stored with its own date, value, `<`/`>` sign, unit and range in `localStorage` under `lab-test-results-tracker.state`, so a later lab with another range never changes an older result. A network-first service worker (`sw.js`) keeps the app working offline.

## License

MIT, see [LICENSE](LICENSE).
