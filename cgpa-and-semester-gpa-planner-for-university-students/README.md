# CGPA and Semester GPA Planner for University Students

A free **CGPA and semester GPA planner for university students** who need to keep a CGPA above a line: a scholarship that needs 3.00, a master's admission, a probation limit, or just a goal. Add each semester's courses with their **credit hours and grades** (on a 4.0, 10-point, 5.0 or your own grading scale) and see **every semester GPA and your CGPA after each semester**. Then type your target and the credit hours in your degree, and the app answers the real question, *"what GPA do I need from now on?"*: **"You need at least 3.16 on average in your remaining 43 credit hours to finish with a 3.00 CGPA."** Set this semester to **Expected (what-if)** to see what your CGPA would become before the results are out. Retaken courses, pass/fail courses and rounding are handled the way your university does. No sign-up, no ads, private on your device, works offline.

**Live demo:** [umar8092.github.io/apps/cgpa-and-semester-gpa-planner-for-university-students](https://umar8092.github.io/apps/cgpa-and-semester-gpa-planner-for-university-students/)

| Desktop | On a phone |
|---|---|
| ![CGPA and Semester GPA Planner on a laptop: the grading scale, an earlier record of 2.84 over 74 credit hours and Semester 5 with five courses (GPA 3.33) and Semester 6 as expected grades (3.67) on the left; on the right "2.93 CGPA", a table of every semester GPA and CGPA after it, and "You need at least 3.16 on average in your remaining 43 credit hours to finish with a 3.00 CGPA"](screenshots/desktop.png) | <img src="screenshots/phone.png" alt="CGPA and Semester GPA Planner on a phone showing CGPA 2.93, 3.03 with the expected grades for Semester 6, the semester table, and the target answer You need at least 3.16" width="220"> |

## The situation it solves

Ayesha is in the sixth semester of a 4-year BS (133 credit hours). Her scholarship and her master's plans need a **3.00 CGPA** at the end, and her transcript after four semesters says **2.84 over 74 credit hours**. Semester 5 results just came out, and she is halfway through Semester 6. She wants to know: *"Am I going to make it, and what do I need to get?"*

1. She keeps the scale on **4.00 scale (A- = 3.67)**, the one her university uses.
2. She taps **+ Start from your current CGPA instead of old courses** and types **2.84** over **74** credit hours, so she does not have to type four years of courses.
3. In **Semester 5** she types Data Structures 4 h B+, Database Systems 3 h A-, Operating Systems 3 h B, Technical Writing 3 h A and Probability 3 h B-. The box says **Semester GPA 3.33 · 16 credit hours, CGPA after this semester 2.93**.
4. Under **What GPA do I need?** she types **3.00** and **133**. The answer: **You need at least 3.16 on average in your remaining 43 credit hours to finish with a 3.00 CGPA. For example, B+ (3.33) or better in every remaining course would do it. Highest CGPA you can still reach: 3.27.**
5. She adds **Semester 6**, sets **Grades are** to **Expected (what-if)** and picks the grades she is aiming for (A-, A, B+, A, B+). Her real CGPA stays 2.93, and the app adds: **With your expected grades for Semester 6: CGPA 3.03. You would then need at least 2.88 in the last 28 credit hours.**
6. **Copy as text** or **Email** sends the summary to her advisor or parents.

Worked by hand (and checked in `tests.js`):

- Semester 5: 4 × 3.33 + 3 × 3.67 + 3 × 3.00 + 3 × 4.00 + 3 × 2.67 = 53.34 grade points ÷ 16 = 3.3338 → **3.33**.
- CGPA: 2.84 × 74 = 210.16, + 53.34 = 263.50 ÷ 90 = 2.9278 → **2.93**.
- Needed: (3.00 × 133 − 263.50) ÷ (133 − 90) = 135.50 ÷ 43 = 3.1512 → **at least 3.16** (always rounded up so it is enough).
- Highest reachable: (263.50 + 4.00 × 43) ÷ 133 = 3.2744 → **3.27**.
- With Semester 6 expected (54.99 ÷ 15 = 3.666): 318.49 ÷ 105 = **3.03**, then (399 − 318.49) ÷ 28 = 2.875 → **2.88**.
- Impossible target: 2.00 over 120 of 130 credit hours with a 3.00 target needs 15.00, so the app says **3.00 can no longer be reached. Even with 4.00 in all 10 remaining credit hours, your CGPA would end at 2.15.**
- Retake: Calculus D (1.00) then B (3.00), 3 h each, plus English A: latest replaces → (9 + 12) ÷ 6 = **3.50**; every attempt counts → (3 + 9 + 12) ÷ 9 = **2.67**.
- 10-point scale: O (10) 4 h + B (6) 3 h = 58 ÷ 7 = **8.29 SGPA**.

## Features

- **Help** button at the top with a how-to for this app, **All apps** to go back to the list, and a **Light / Dark** switch.
- **Grading scales:** 4.00 with A- = 3.67 (Pakistan HEC and others), 4.00 with A- = 3.70 (US, Canada), A B C D F only, 10-point (India SGPA/CGPA), 5.00 (Nigeria), **My own grades** (type every letter and its points) and **I type grade points** (for results that show 3.5 per course, with your own top point).
- **Each semester in its own box** and **each course in its own box**: course name (optional), credit hours (0 to 30, halves allowed, comma decimals) and grade. Empty rows are skipped; a missing grade, a typo or a grade that is not on the scale is shown in red on that row and left out, never guessed.
- **Semester GPA and CGPA after every semester**, live as you type, and a table of all of them.
- **What GPA do I need?** with the credit hours left shown as a sum (133 − 90 = 43), the needed average rounded up, an example grade that does it, the highest CGPA still possible, and clear answers when the target is already safe, impossible or the degree is finished.
- **Expected (what-if)** grades for any semester: what your CGPA would become and what you would then need, without touching your real CGPA.
- **Earlier record:** start from the CGPA and credit hours on your last transcript instead of typing every old course.
- **Retaken courses** (same name in a later semester): latest grade replaces, best grade counts, or every attempt counts. Credit hours count once toward the degree.
- **Pass, Fail (pass/fail course), Withdrawn and Incomplete** are kept out of the GPA; a Pass still counts as credit hours completed. An F counts in the GPA but not as completed.
- **Rounding** like your university: rounded or cut to 2 decimals. All maths is done in whole hundredths, so there are no floating point slips.
- **Undo** after deleting a course, a semester, the earlier record, changing the scale, starting over and restoring.
- **Share:** copy as text, email (no address needed), print or save as PDF with every course.
- **Backup file** and restore (checked before anything is replaced). Handles blocked or damaged storage without crashing.
- Private: grades stay in your browser, your data is never sent anywhere, works offline once loaded, installable.

## Run it yourself

```
git clone https://github.com/umar8092/apps.git
```

Then open `cgpa-and-semester-gpa-planner-for-university-students/index.html` in a browser. No build step. `node cgpa-and-semester-gpa-planner-for-university-students/tests.js` runs the logic checks (or open `test.html`), and `node cgpa-and-semester-gpa-planner-for-university-students/ui-test.js` drives the page in headless Chromium (needs Playwright).

## How it works

Plain HTML, CSS and JavaScript. `core.js` holds the grading scales and all the maths: grade points and credit hours are kept as whole hundredths, so quality points are whole numbers and every GPA is an integer division (rounded half up or cut, as chosen); the needed GPA is `(target × (GPA credits + credits left) − grade points) ÷ credits left`, rounded up. It is tested by `tests.js`; `script.js` draws the page. Everything is saved in `localStorage` under `cgpa-and-semester-gpa-planner-for-university-students.state`. A network-first service worker (`sw.js`) keeps the app working offline.

## License

MIT, see [LICENSE](LICENSE).
